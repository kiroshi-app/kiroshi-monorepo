use std::fmt;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::broadcast::{self, error::RecvError};
use tokio::sync::mpsc;
use tokio::time::{self, Instant};
use uuid::Uuid;

use super::commands::announce_change;
use super::contract::{RoutineError, RunClosing, RunOutcome, RunRequested};
use super::core::{Clock, RunSink, SystemClock};
use super::run::{read_run_report, run_output_schema, run_prompt_for, RunReport};
use crate::agent::commands::{
	agent_shutdown, agent_start_or_resume_session, agent_submit_prompt, cancel_session_turn,
	EVENT_CHANNEL,
};
use crate::agent::contract::{
	AgentEvent, CancelOutcome, ChatMessage, EventTurn, MessageCompletion, MessageRole,
	RuntimeScope, ScopedEvent, TransportError, TurnEnded, TurnOutcome,
};
use crate::agent::reply_writer::settled_mentions;
use crate::agent::AgentState;
use crate::conversations::commands::{
	announce_conversation, conversation_open_runtime_session, ready,
};
use crate::conversations::contract::TranscriptStoreError;
use crate::db;
use crate::db::repositories::messages::{NewAssistantMessage, NewTurn, TerminalState};
use crate::events::{self, Frame, AGENT_EVENT, CONVERSATION_UPDATED};

const CANCELLED_REASON: &str = "the run's turn was cancelled";

const FAILED_REASON: &str = "the run's turn failed";

const MISSING_OUTPUT_REASON: &str = "the run's turn ended with no structured output";

const QUESTION_REASON: &str = "a run cannot be asked a question";

const PERMISSION_REASON: &str = "a run cannot be asked for a permission";

const DEADLINE_REASON: &str = "the run outlived its deadline";

const EVENTS_LOST_REASON: &str = "the run's session events stopped arriving";

const UNKNOWN_KIND: &str = "unknownFailure";

pub(crate) const NO_AGENT: &str = "the host holds no agent state";

pub(crate) const NO_DATABASE: &str = "the host holds no database";

#[derive(Debug, Clone, Copy)]
pub struct RunTiming {
	pub lease: Duration,
	pub deadline: Duration,
}

pub const RUN_TIMING: RunTiming =
	RunTiming { lease: Duration::from_secs(60), deadline: Duration::from_secs(30 * 60) };

pub struct Runner<R: Runtime> {
	app: AppHandle<R>,
	timing: RunTiming,
}

impl<R: Runtime> Runner<R> {
	pub fn new(app: AppHandle<R>) -> Self {
		Self::timed(app, RUN_TIMING)
	}

	pub fn timed(app: AppHandle<R>, timing: RunTiming) -> Self {
		Self { app, timing }
	}
}

impl<R: Runtime> RunSink for Runner<R> {
	fn requested(&self, requested: RunRequested) -> Result<(), RoutineError> {
		tauri::async_runtime::spawn(run(self.app.clone(), self.timing, requested));
		Ok(())
	}
}

async fn run<R: Runtime>(app: AppHandle<R>, timing: RunTiming, requested: RunRequested) {
	let scope = match opened_scope(&app, &requested).await {
		Ok(scope) => scope,
		Err(detail) => return close(&app, &requested, could_not_start(&detail)).await,
	};
	let (events, mut arriving) = mpsc::unbounded_channel();
	let held = scope.clone();
	let mut reading = listen(&app, move |heard| heard == &held, events);
	let closing = drive(&app, timing, &requested, &scope, &mut arriving, &mut reading).await;
	drop(reading);
	close(&app, &requested, closing).await;
	shut_down(&app, &requested.run_id, scope).await;
}

async fn drive<R: Runtime>(
	app: &AppHandle<R>,
	timing: RunTiming,
	requested: &RunRequested,
	scope: &RuntimeScope,
	arriving: &mut mpsc::UnboundedReceiver<ScopedEvent>,
	reading: &mut RelayReader,
) -> RunClosing {
	let run_id = &requested.run_id;
	let expiry = time::sleep(timing.deadline);
	tokio::pin!(expiry);
	tokio::select! {
		() = &mut expiry => return refused(app, scope, DEADLINE_REASON).await,
		begun = started(app, scope, requested) => {
			if let Err(detail) = begun {
				return could_not_start(&detail);
			}
		}
	}
	let mut lease = time::interval_at(Instant::now() + timing.lease, timing.lease);
	loop {
		tokio::select! {
			() = &mut expiry => return refused(app, scope, DEADLINE_REASON).await,
			_ = lease.tick() => renew(app, run_id).await,
			arrived = arriving.recv() => {
				let Some(scoped) = arrived else {
					return lost(reading).await;
				};
				if let Some(closing) = settled_by(app, scope, scoped.event).await {
					return closing;
				}
			}
		}
	}
}

async fn lost(reading: &mut RelayReader) -> RunClosing {
	failed(&format!("{EVENTS_LOST_REASON}: {}", reading.failure().await))
}

async fn settled_by<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
	event: AgentEvent,
) -> Option<RunClosing> {
	match event {
		AgentEvent::TurnEnded { ended } => Some(settled(app, scope, ended).await),
		AgentEvent::Failed { error } if ends_the_session(&error) => {
			Some(failed(&transport_reason(&error)))
		}
		AgentEvent::QuestionRequested { .. } => Some(refused(app, scope, QUESTION_REASON).await),
		AgentEvent::PermissionRequested { .. } => {
			Some(refused(app, scope, PERMISSION_REASON).await)
		}
		_ => None,
	}
}

async fn settled<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
	ended: TurnEnded,
) -> RunClosing {
	let closing = match ended.outcome {
		TurnOutcome::Cancelled => failed(CANCELLED_REASON),
		TurnOutcome::Failed => failed(FAILED_REASON),
		TurnOutcome::Completed => reported(app, scope, ended.structured_output.as_ref()).await,
	};
	RunClosing { cost_usd: ended.total_cost_usd, model_usage: ended.model_usage, ..closing }
}

async fn reported<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
	structured_output: Option<&Value>,
) -> RunClosing {
	let text = match read_run_report(structured_output) {
		None => return failed(MISSING_OUTPUT_REASON),
		Some(RunReport::Nothing) => return closing(RunOutcome::Nothing),
		Some(RunReport::Report { text }) => text,
	};
	match write_report(app, scope, text).await {
		Ok(turn_id) => RunClosing { reported_turn_id: Some(turn_id), ..closing(RunOutcome::Ok) },
		Err(error) => failed(&format!("the report could not be written: {}", detail_of(&error))),
	}
}

async fn write_report<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
	text: String,
) -> Result<String, TranscriptStoreError> {
	let database = database(app)?;
	let text = settled_mentions(database, &scope.conversation_id, &text).await?.unwrap_or(text);
	let messages = database.messages();
	let turn_id = Uuid::new_v4().to_string();
	let message_id = Uuid::new_v4().to_string();
	let created_at = SystemClock.now_ms();
	messages
		.start_turn(NewTurn {
			id: turn_id.clone(),
			conversation_id: scope.conversation_id.clone(),
			started_at: created_at,
		})
		.await?;
	messages
		.open_assistant_message(NewAssistantMessage {
			id: message_id.clone(),
			conversation_id: scope.conversation_id.clone(),
			turn_id: turn_id.clone(),
			author_bot_id: Some(scope.bot_id.clone()),
			replied_to_message_id: None,
			created_at,
		})
		.await?;
	messages.append_text(message_id.clone(), text.clone()).await?;
	messages.finalize_message(message_id.clone(), TerminalState::Complete, None).await?;
	messages.complete_turn(turn_id.clone(), SystemClock.now_ms()).await?;
	announce_conversation(app, database, CONVERSATION_UPDATED, &scope.conversation_id).await;
	announce_report(
		app,
		report_event(
			scope,
			&turn_id,
			ChatMessage {
				id: message_id,
				role: MessageRole::Assistant,
				text,
				completion: MessageCompletion::Complete,
				timestamp: created_at,
			},
		),
	);
	Ok(turn_id)
}

fn report_event(scope: &RuntimeScope, turn_id: &str, message: ChatMessage) -> ScopedEvent {
	ScopedEvent {
		scope: Some(scope.clone()),
		turn: Some(EventTurn {
			turn_id: turn_id.to_owned(),
			conversation_id: scope.conversation_id.clone(),
		}),
		event: AgentEvent::MessageCompleted { message },
	}
}

fn announce_report<R: Runtime>(app: &AppHandle<R>, report: ScopedEvent) {
	if let Err(error) = events::emit(app, AGENT_EVENT, report) {
		eprintln!("a routine report turn could not be announced: {error}");
	}
}

async fn opened_scope<R: Runtime>(
	app: &AppHandle<R>,
	requested: &RunRequested,
) -> Result<RuntimeScope, String> {
	let state = managed::<R, db::DatabaseState>(app, NO_DATABASE)?;
	let opened = conversation_open_runtime_session(
		state,
		requested.conversation_id.clone(),
		requested.bot_id.clone(),
		SystemClock.now_ms(),
		None,
		None,
	)
	.await
	.map_err(|error| detail_of(&error))?;
	Ok(RuntimeScope {
		conversation_id: opened.conversation_id,
		bot_id: opened.bot_id,
		runtime_session_id: opened.id,
		epoch: opened.seq,
	})
}

async fn started<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
	requested: &RunRequested,
) -> Result<(), String> {
	agent_start_or_resume_session(
		app.clone(),
		managed(app, NO_AGENT)?,
		managed(app, NO_DATABASE)?,
		scope.clone(),
		None,
		None,
		Some(run_output_schema().into()),
	)
	.await
	.map_err(|error| detail_of(&error))?;
	agent_submit_prompt(managed(app, NO_AGENT)?, scope.clone(), run_prompt_for(requested), None)
		.await
		.map_err(|error| detail_of(&error))
}

async fn refused<R: Runtime>(app: &AppHandle<R>, scope: &RuntimeScope, reason: &str) -> RunClosing {
	match cancelled(app, scope).await {
		Ok(()) => failed(reason),
		Err(detail) => failed(&format!("{reason}; its turn could not be cancelled: {detail}")),
	}
}

async fn cancelled<R: Runtime>(app: &AppHandle<R>, scope: &RuntimeScope) -> Result<(), String> {
	match cancel_session_turn(app, &*managed::<R, AgentState>(app, NO_AGENT)?, scope).await {
		CancelOutcome::Failed { failures } => Err(detail_of(&failures)),
		CancelOutcome::Cancelled | CancelOutcome::NothingToCancel => Ok(()),
	}
}

async fn shut_down<R: Runtime>(app: &AppHandle<R>, run_id: &str, scope: RuntimeScope) {
	if let Err(detail) = shut(app, scope).await {
		eprintln!("routine run {run_id} could not shut its session down: {detail}");
	}
}

async fn shut<R: Runtime>(app: &AppHandle<R>, scope: RuntimeScope) -> Result<(), String> {
	agent_shutdown(app.clone(), managed(app, NO_AGENT)?, scope)
		.await
		.map_err(|error| detail_of(&error))
}

async fn renew<R: Runtime>(app: &AppHandle<R>, run_id: &str) {
	if let Err(error) = renewed(app, run_id).await {
		eprintln!("routine run {run_id} could not renew its lease: {error:?}");
	}
}

async fn renewed<R: Runtime>(app: &AppHandle<R>, run_id: &str) -> Result<(), RoutineError> {
	database(app)?.routines().renew_lease(run_id.to_owned(), SystemClock.now_ms()).await
}

async fn close<R: Runtime>(app: &AppHandle<R>, requested: &RunRequested, closing: RunClosing) {
	let run_id = &requested.run_id;
	if let (RunOutcome::Failed, Some(reason)) = (closing.outcome, &closing.reason) {
		eprintln!("routine run {run_id} failed: {reason}");
	}
	if let Err(error) = closed(app, run_id, closing).await {
		return eprintln!("routine run {run_id} could not be closed: {error:?}");
	}
	if let Err(error) = announce_change(app, &requested.conversation_id) {
		eprintln!(
			"routine run {run_id} was closed but its change could not be announced: {error:?}"
		);
	}
}

async fn closed<R: Runtime>(
	app: &AppHandle<R>,
	run_id: &str,
	closing: RunClosing,
) -> Result<(), RoutineError> {
	database(app)?.routines().close_run(run_id.to_owned(), closing, SystemClock.now_ms()).await?;
	Ok(())
}

pub(crate) struct RelayReader(JoinHandle<ReadFailure>);

#[derive(Debug)]
pub(crate) enum ReadFailure {
	Lagged { missed: u64 },
	Ended(String),
}

impl fmt::Display for ReadFailure {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			ReadFailure::Lagged { missed } => {
				write!(formatter, "the relay dropped {missed} frames")
			}
			ReadFailure::Ended(reason) => formatter.write_str(reason),
		}
	}
}

impl RelayReader {
	pub(crate) async fn failure(&mut self) -> ReadFailure {
		match (&mut self.0).await {
			Ok(failure) => failure,
			Err(error) => ReadFailure::Ended(format!("the relay reader stopped: {error}")),
		}
	}
}

impl Drop for RelayReader {
	fn drop(&mut self) {
		self.0.abort();
	}
}

pub(crate) fn listen<R: Runtime>(
	app: &AppHandle<R>,
	keeps: impl Fn(&RuntimeScope) -> bool + Send + 'static,
	events: mpsc::UnboundedSender<ScopedEvent>,
) -> RelayReader {
	read(events::subscribed(app), keeps, events)
}

pub(crate) fn read(
	heard: broadcast::Receiver<Frame>,
	keeps: impl Fn(&RuntimeScope) -> bool + Send + 'static,
	events: mpsc::UnboundedSender<ScopedEvent>,
) -> RelayReader {
	RelayReader(tauri::async_runtime::spawn(relayed(heard, keeps, events)))
}

async fn relayed(
	mut heard: broadcast::Receiver<Frame>,
	keeps: impl Fn(&RuntimeScope) -> bool,
	events: mpsc::UnboundedSender<ScopedEvent>,
) -> ReadFailure {
	loop {
		let frame = match heard.recv().await {
			Ok(frame) => frame,
			Err(RecvError::Lagged(missed)) => return ReadFailure::Lagged { missed },
			Err(RecvError::Closed) => return ReadFailure::Ended("the relay closed".to_owned()),
		};
		let scoped = match agent_event(&frame) {
			Ok(Some(scoped)) => scoped,
			Ok(None) => continue,
			Err(failure) => return ReadFailure::Ended(failure),
		};
		if !scoped.scope.as_ref().is_some_and(&keeps) {
			continue;
		}
		if events.send(scoped).is_err() {
			return ReadFailure::Ended("the reader's owner stopped listening".to_owned());
		}
	}
}

#[derive(Deserialize)]
struct NamedFrame {
	event: String,
}

#[derive(Deserialize)]
struct AgentFrame {
	payload: ScopedEvent,
}

fn agent_event(frame: &str) -> Result<Option<ScopedEvent>, String> {
	let named: NamedFrame = serde_json::from_str(frame)
		.map_err(|error| format!("a relay frame does not parse: {error}"))?;
	if named.event != EVENT_CHANNEL {
		return Ok(None);
	}
	serde_json::from_str::<AgentFrame>(frame)
		.map(|framed| Some(framed.payload))
		.map_err(|error| format!("an agent event does not parse: {error}"))
}

pub(crate) fn ends_the_session(error: &TransportError) -> bool {
	error.is_fatal()
		|| matches!(error, TransportError::AuthCheckFailed { .. } | TransportError::NotStarted)
}

fn transport_reason(error: &TransportError) -> String {
	let carried = match serde_json::to_value(error) {
		Ok(carried) => carried,
		Err(failure) => {
			return format!("the run's session failed with an unreadable error: {failure}")
		}
	};
	let kind = carried["kind"].as_str().unwrap_or(UNKNOWN_KIND);
	match carried["detail"].as_str().filter(|detail| !detail.is_empty()) {
		Some(detail) => format!("the run's session failed with {kind}: {detail}"),
		None => format!("the run's session failed with {kind}"),
	}
}

fn could_not_start(detail: &str) -> RunClosing {
	failed(&format!("the run could not start: {detail}"))
}

fn closing(outcome: RunOutcome) -> RunClosing {
	RunClosing { outcome, reason: None, cost_usd: None, model_usage: None, reported_turn_id: None }
}

fn failed(reason: &str) -> RunClosing {
	RunClosing { reason: Some(reason.to_owned()), ..closing(RunOutcome::Failed) }
}

pub(crate) fn detail_of(error: &impl Serialize) -> String {
	serde_json::to_string(error).unwrap_or_else(|failure| failure.to_string())
}

pub(crate) fn managed<'a, R: Runtime, T: Send + Sync + 'static>(
	app: &'a AppHandle<R>,
	missing: &str,
) -> Result<State<'a, T>, String> {
	app.try_state::<T>().ok_or_else(|| missing.to_owned())
}

pub(crate) fn database<R: Runtime>(
	app: &AppHandle<R>,
) -> Result<&db::Database, TranscriptStoreError> {
	match app.try_state::<db::DatabaseState>() {
		Some(state) => ready(state.inner()),
		None => Err(TranscriptStoreError::Unavailable {
			failure: (&db::DatabaseError::AppDataDir).into(),
		}),
	}
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use tauri::test::mock_builder;

	use super::*;
	use crate::events::BUFFERED_FRAMES;
	use crate::test_app::an_app_of_its_own;

	fn a_scope(runtime_session_id: &str) -> RuntimeScope {
		RuntimeScope {
			conversation_id: "conversation-1".to_owned(),
			bot_id: "bot-1".to_owned(),
			runtime_session_id: runtime_session_id.to_owned(),
			epoch: 1,
		}
	}

	fn a_delta(scope: &RuntimeScope, seq: u64) -> ScopedEvent {
		ScopedEvent {
			scope: Some(scope.clone()),
			turn: None,
			event: AgentEvent::MessageDelta {
				id: "message-1".to_owned(),
				seq,
				text: seq.to_string(),
			},
		}
	}

	fn framed(scoped: &ScopedEvent) -> Frame {
		events::frame(AGENT_EVENT, scoped).expect("the event frames")
	}

	struct Reading {
		arriving: mpsc::UnboundedReceiver<ScopedEvent>,
		reader: RelayReader,
	}

	impl Reading {
		async fn heard_until_closed(&mut self) -> Vec<ScopedEvent> {
			let mut heard = Vec::new();
			while let Some(scoped) = self.arriving.recv().await {
				heard.push(scoped);
			}
			heard
		}

		async fn closing(&mut self) -> RunClosing {
			lost(&mut self.reader).await
		}
	}

	fn read_for(scope: &RuntimeScope, heard: broadcast::Receiver<Frame>) -> Reading {
		let (events, arriving) = mpsc::unbounded_channel();
		let held = scope.clone();
		let reader = read(heard, move |scope| scope == &held, events);
		Reading { arriving, reader }
	}

	fn read_frames(scope: &RuntimeScope, frames: &[Frame]) -> Reading {
		let (relay, heard) = broadcast::channel(frames.len());
		for frame in frames {
			relay.send(frame.clone()).expect("the reader is subscribed");
		}
		read_for(scope, heard)
	}

	fn reason_of(closing: &RunClosing) -> &str {
		assert_eq!(closing.outcome, RunOutcome::Failed, "the run closed as {closing:?}");
		closing.reason.as_deref().expect("a failed run names its reason")
	}

	#[tokio::test]
	async fn a_run_hears_only_its_own_agent_events_in_the_order_they_were_emitted() {
		let run = a_scope("session-1");
		let another_run = a_scope("session-2");
		let frames = [
			framed(&a_delta(&run, 1)),
			framed(&a_delta(&another_run, 1)),
			Frame::from(r#"{"event":"conversation://updated","payload":null}"#),
			framed(&ScopedEvent { scope: None, ..a_delta(&run, 9) }),
			framed(&a_delta(&run, 2)),
			framed(&a_delta(&run, 3)),
			Frame::from(r#"{"event":"agent://event","payload":{"nope":1}}"#),
		];
		let mut reading = read_frames(&run, &frames);

		let heard = reading.heard_until_closed().await;

		assert_eq!(heard, vec![a_delta(&run, 1), a_delta(&run, 2), a_delta(&run, 3)]);
	}

	#[tokio::test]
	async fn an_agent_event_that_does_not_parse_fails_the_run_naming_the_parse_error() {
		let run = a_scope("session-1");
		let frames = [Frame::from(r#"{"event":"agent://event","payload":{"nope":1}}"#)];
		let mut reading = read_frames(&run, &frames);

		assert!(reading.heard_until_closed().await.is_empty());
		let closing = reading.closing().await;

		let reason = reason_of(&closing);
		assert!(
			reason.starts_with(&format!("{EVENTS_LOST_REASON}: an agent event does not parse: ")),
			"the run failed with {reason}"
		);
	}

	#[tokio::test]
	async fn a_relay_that_dropped_frames_past_a_stalled_run_fails_it_with_their_count() {
		let app = an_app_of_its_own("routine-runner-lag", mock_builder());
		let run = a_scope("session-1");
		let heard = events::subscribed(app.handle());
		for seq in 0..(BUFFERED_FRAMES + 6) as u64 {
			events::emit(app.handle(), AGENT_EVENT, a_delta(&run, seq)).expect("the event is sent");
		}
		let mut reading = read_for(&run, heard);

		assert!(reading.heard_until_closed().await.is_empty());
		let closing = time::timeout(Duration::from_secs(60), reading.closing())
			.await
			.expect("the run closes without waiting for its deadline");

		assert_eq!(
			reason_of(&closing),
			format!("{EVENTS_LOST_REASON}: the relay dropped 6 frames")
		);
	}

	#[tokio::test]
	async fn a_dropped_reader_stops_reading_the_relay() {
		let app = an_app_of_its_own("routine-runner-stop", mock_builder());
		let run = a_scope("session-1");
		let (events, mut arriving) = mpsc::unbounded_channel();
		let held = run.clone();
		let reader = listen(app.handle(), move |scope| scope == &held, events);

		drop(reader);

		let stopped = time::timeout(Duration::from_secs(60), arriving.recv())
			.await
			.expect("the reader stops once dropped");
		assert_eq!(stopped, None);
	}

	#[test]
	fn the_report_event_names_the_stored_report_turn() {
		let scope = RuntimeScope {
			conversation_id: "conversation-1".to_owned(),
			bot_id: "bot-1".to_owned(),
			runtime_session_id: "session-1".to_owned(),
			epoch: 1,
		};
		let message = ChatMessage {
			id: "message-1".to_owned(),
			role: MessageRole::Assistant,
			text: "report".to_owned(),
			completion: MessageCompletion::Complete,
			timestamp: 1,
		};

		let report = report_event(&scope, "turn-1", message);

		assert_eq!(
			report.turn,
			Some(EventTurn {
				turn_id: "turn-1".to_owned(),
				conversation_id: "conversation-1".to_owned(),
			})
		);
	}

	#[tokio::test]
	async fn a_refused_run_whose_turn_cannot_be_cancelled_names_the_cancel_failure_in_its_reason() {
		let app = an_app_of_its_own("routine-refused-cancel-failed", mock_builder());

		let closing = refused(app.handle(), &a_scope("session-1"), DEADLINE_REASON).await;

		assert_eq!(
			reason_of(&closing),
			format!("{DEADLINE_REASON}; its turn could not be cancelled: {NO_AGENT}")
		);
	}
}
