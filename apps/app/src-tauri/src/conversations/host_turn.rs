use std::collections::{HashMap, HashSet};
use std::iter;
use std::mem;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use futures_util::future::join_all;
use tauri::{AppHandle, Runtime, State};
use tokio::sync::{mpsc, oneshot, watch};
use tokio::time;

use super::commands::announce_conversation;
use super::context::{bounded_context, headed_message, mentioned_bot_ids};
use super::contract::{SentMessage, TranscriptStoreError};
use super::turn_run_deadline::arm_start_deadlines;
use crate::agent::commands::{
	agent_shutdown, announce, announce_in_turn, cancel_session_turn, live_run_of, run_is_idle,
	start_run, submit_in_line, withdraw_queued, Lineage, RunStart,
};
use crate::agent::contract::{
	AgentEvent, CancelFailure, CancelFailureReason, CancelOutcome, EventTurn, RuntimeScope,
	ScopedEvent, SubmittedTurn, TransportError, TurnEnded, TurnOutcome,
};
use crate::agent::translate::now_ms;
use crate::agent::AgentState;
use crate::db;
use crate::db::repositories::conversations::Seat;
use crate::db::repositories::runtime_context::{ParticipantKey, RuntimeSession};
use crate::events::CONVERSATION_UPDATED;
use crate::routines::runner::{
	database, detail_of, ends_the_session, listen, managed, RelayReader, NO_AGENT, NO_DATABASE,
};

const STOP_ANSWER_BOUND: Duration = Duration::from_secs(30);

type Running = Arc<Mutex<HashMap<String, RunningTurn>>>;

type SpeakingOrder = Arc<tokio::sync::Mutex<()>>;

struct RunningTurn {
	conversation_id: String,
	stop: watch::Sender<bool>,
	answers: Vec<oneshot::Sender<CancelOutcome>>,
	bot_ids: Vec<String>,
}

#[derive(Default)]
pub(crate) struct HostTurns {
	running: Running,
	orders: Mutex<HashMap<(String, String), SpeakingOrder>>,
	started: Mutex<HashSet<String>>,
}

impl HostTurns {
	pub(crate) fn hold(
		&self,
		conversation_id: &str,
		turn_id: &str,
	) -> Result<HeldTurn, TranscriptStoreError> {
		let mut running = locked(&self.running);
		if running.contains_key(turn_id) {
			return Err(TranscriptStoreError::TurnAlreadyRunning {
				conversation_id: conversation_id.to_owned(),
				turn_id: turn_id.to_owned(),
			});
		}
		let (stop, stopped) = watch::channel(false);
		let running_turn = RunningTurn {
			conversation_id: conversation_id.to_owned(),
			stop,
			answers: Vec::new(),
			bot_ids: Vec::new(),
		};
		running.insert(turn_id.to_owned(), running_turn);
		Ok(HeldTurn { running: self.running.clone(), turn_id: turn_id.to_owned(), stopped })
	}

	pub(crate) async fn stop(&self, scope: &RuntimeScope) -> Option<CancelOutcome> {
		let asked = self.request_stop(&scope.conversation_id);
		if asked.is_empty() {
			return None;
		}
		let answers = asked.into_iter().map(|(turn_id, answered)| async move {
			match time::timeout(STOP_ANSWER_BOUND, answered).await {
				Ok(Ok(outcome)) => outcome,
				Ok(Err(_)) | Err(_) => self.unanswered(&turn_id, scope),
			}
		});
		Some(merged(join_all(answers).await))
	}

	fn request_stop(
		&self,
		conversation_id: &str,
	) -> Vec<(String, oneshot::Receiver<CancelOutcome>)> {
		let mut running = locked(&self.running);
		let mut asked = Vec::new();
		for (turn_id, running_turn) in running.iter_mut() {
			if running_turn.conversation_id != conversation_id {
				continue;
			}
			let (answer, answered) = oneshot::channel();
			running_turn.answers.push(answer);
			running_turn.stop.send_replace(true);
			asked.push((turn_id.clone(), answered));
		}
		asked
	}

	fn unanswered(&self, turn_id: &str, scope: &RuntimeScope) -> CancelOutcome {
		let bot_ids = match locked(&self.running).get(turn_id) {
			Some(running_turn) if !running_turn.bot_ids.is_empty() => running_turn.bot_ids.clone(),
			_ => vec![scope.bot_id.clone()],
		};
		let detail = format!(
			"the host turn did not answer the stop within {} seconds",
			STOP_ANSWER_BOUND.as_secs()
		);
		let failures = bot_ids
			.into_iter()
			.map(|bot_id| CancelFailure {
				bot_id,
				reason: CancelFailureReason::Session(TransportError::WriteFailed {
					detail: detail.clone(),
				}),
			})
			.collect();
		CancelOutcome::Failed { failures }
	}

	fn order_of(&self, participant: &ParticipantKey) -> SpeakingOrder {
		let key = (participant.conversation_id.clone(), participant.bot_id.clone());
		locked(&self.orders).entry(key).or_default().clone()
	}

	fn note_started(&self, scope: &RuntimeScope) {
		locked(&self.started).insert(scope.runtime_session_id.clone());
	}

	fn has_started(&self, scope: &RuntimeScope) -> bool {
		locked(&self.started).contains(&scope.runtime_session_id)
	}

	fn forget_started(&self, scope: &RuntimeScope) -> bool {
		locked(&self.started).remove(&scope.runtime_session_id)
	}
}

fn merged(outcomes: Vec<CancelOutcome>) -> CancelOutcome {
	let mut has_cancelled = false;
	let mut failures = Vec::new();
	for outcome in outcomes {
		match outcome {
			CancelOutcome::Cancelled => has_cancelled = true,
			CancelOutcome::NothingToCancel => {}
			CancelOutcome::Failed { failures: failed } => failures.extend(failed),
		}
	}
	if !failures.is_empty() {
		return CancelOutcome::Failed { failures };
	}
	if has_cancelled {
		return CancelOutcome::Cancelled;
	}
	CancelOutcome::NothingToCancel
}

pub(crate) struct HeldTurn {
	running: Running,
	turn_id: String,
	stopped: watch::Receiver<bool>,
}

impl HeldTurn {
	fn answer(&self, outcome: &CancelOutcome) {
		let answers = locked(&self.running)
			.get_mut(&self.turn_id)
			.map(|running_turn| mem::take(&mut running_turn.answers));
		self.answer_each(answers.into_iter().flatten(), outcome);
	}

	fn answer_each(
		&self,
		answers: impl Iterator<Item = oneshot::Sender<CancelOutcome>>,
		outcome: &CancelOutcome,
	) {
		for answer in answers {
			if answer.send(outcome.clone()).is_err() {
				log::debug!("the caller of a stop on turn {} stopped waiting", self.turn_id);
			}
		}
	}

	fn summon(&self, summoned: &[Summons]) {
		let mut running = locked(&self.running);
		let Some(running_turn) = running.get_mut(&self.turn_id) else {
			return;
		};
		for summons in summoned {
			if !running_turn.bot_ids.contains(&summons.bot_id) {
				running_turn.bot_ids.push(summons.bot_id.clone());
			}
		}
	}
}

impl Drop for HeldTurn {
	fn drop(&mut self) {
		let released = locked(&self.running).remove(&self.turn_id);
		let answers = released.into_iter().flat_map(|running_turn| running_turn.answers);
		self.answer_each(answers, &CancelOutcome::NothingToCancel);
	}
}

fn locked<T>(held: &Mutex<T>) -> MutexGuard<'_, T> {
	held.lock().unwrap_or_else(PoisonError::into_inner)
}

pub(crate) async fn summoned_for(
	database: &db::Database,
	message: &SentMessage,
	summoned: Vec<String>,
) -> Result<Vec<String>, TranscriptStoreError> {
	let seats = database.conversations().seats(message.conversation_id.clone()).await?;
	let present = present_bot_ids(&seats);
	if summoned.is_empty() {
		let answered = answered_author(database, message).await?;
		return Ok(summoned_by(&message.content, answered.as_deref(), &present, &seats));
	}
	let mut distinct = Vec::new();
	for bot_id in summoned {
		if !present.contains(&bot_id.as_str()) {
			return Err(TranscriptStoreError::UnknownParticipant {
				conversation_id: message.conversation_id.clone(),
				bot_id,
			});
		}
		if !distinct.contains(&bot_id) {
			distinct.push(bot_id);
		}
	}
	Ok(distinct)
}

async fn answered_author(
	database: &db::Database,
	message: &SentMessage,
) -> Result<Option<String>, TranscriptStoreError> {
	let Some(answered_id) = message.replied_to_message_id.clone() else {
		return Ok(None);
	};
	let answered =
		database.messages().message(message.conversation_id.clone(), answered_id).await?;
	Ok(answered.and_then(|answered| answered.author_bot_id))
}

fn summoned_by(
	content: &str,
	answered_author: Option<&str>,
	present: &[&str],
	seats: &[Seat],
) -> Vec<String> {
	let named = seated_mentions(content, present);
	let addressed: Vec<&str> = match answered_author.filter(|author| present.contains(author)) {
		Some(author) => {
			iter::once(author).chain(named.into_iter().filter(|named| *named != author)).collect()
		}
		None => named,
	};
	if !addressed.is_empty() {
		return addressed.into_iter().map(str::to_owned).collect();
	}
	seats
		.iter()
		.find(|seat| seat.is_lead() && seat.left_at.is_none())
		.map(|seat| seat.bot_id.clone())
		.into_iter()
		.collect()
}

fn seated_mentions<'a>(text: &'a str, present: &[&str]) -> Vec<&'a str> {
	mentioned_bot_ids(text).into_iter().filter(|bot_id| present.contains(bot_id)).collect()
}

pub(crate) fn present_bot_ids(seats: &[Seat]) -> Vec<&str> {
	seats
		.iter()
		.filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
		.map(|seat| seat.bot_id.as_str())
		.collect()
}

pub(crate) async fn run<R: Runtime>(
	app: AppHandle<R>,
	held: HeldTurn,
	message: SentMessage,
	summoned: Vec<String>,
) {
	if summoned.is_empty() {
		return;
	}
	let (events, heard) = mpsc::unbounded_channel();
	let conversation_id = message.conversation_id.clone();
	let mut listening = listen(&app, move |scope| scope.conversation_id == conversation_id, events);
	let first = summoned
		.into_iter()
		.map(|bot_id| Summons { bot_id, prompt_id: message.id.clone() })
		.collect();
	let turn = HostTurn {
		app,
		conversation_id: message.conversation_id,
		turn_id: message.turn_id,
		prompt_id: message.id,
		stopped: held.stopped.clone(),
	};
	let speaking = turn.wave(&held, first).await;
	tauri::async_runtime::spawn(async move {
		turn.drive(held, speaking, heard, &mut listening).await;
		drop(listening);
	});
}

struct Summons {
	bot_id: String,
	prompt_id: String,
}

struct Speaker {
	scope: RuntimeScope,
	written: Vec<String>,
}

struct Ridden {
	scope: RuntimeScope,
	carries_the_conversation: bool,
}

fn scope_of(session: &RuntimeSession) -> RuntimeScope {
	RuntimeScope {
		conversation_id: session.participant.conversation_id.clone(),
		bot_id: session.participant.bot_id.clone(),
		runtime_session_id: session.id.clone(),
		epoch: session.seq,
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SpeakerEnd {
	HandsOver,
	Cancelled,
}

impl Speaker {
	fn end_after(&mut self, event: &AgentEvent) -> Option<SpeakerEnd> {
		match event {
			AgentEvent::MessageStarted { message } | AgentEvent::MessageCompleted { message } => {
				self.wrote(&message.id)
			}
			AgentEvent::MessageDelta { id, .. } => self.wrote(id),
			AgentEvent::TurnEnded { ended } if ended.outcome == TurnOutcome::Cancelled => {
				return Some(SpeakerEnd::Cancelled)
			}
			AgentEvent::TurnEnded { .. } => return Some(SpeakerEnd::HandsOver),
			AgentEvent::Failed { error } if ends_the_session(error) => {
				return Some(SpeakerEnd::HandsOver)
			}
			_ => {}
		}
		None
	}

	fn wrote(&mut self, id: &str) {
		if !self.written.iter().any(|written| written == id) {
			self.written.push(id.to_owned());
		}
	}
}

enum Refusal {
	Unready(TransportError),
	Unopened(TranscriptStoreError),
	Unstarted(RuntimeScope, TransportError),
	Unsubmitted(RuntimeScope, TransportError),
	Stopped(RuntimeScope),
}

struct HostTurn<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	turn_id: String,
	prompt_id: String,
	stopped: watch::Receiver<bool>,
}

impl<R: Runtime> HostTurn<R> {
	async fn drive(
		&self,
		held: HeldTurn,
		mut speaking: Vec<Speaker>,
		mut heard: mpsc::UnboundedReceiver<ScopedEvent>,
		reading: &mut RelayReader,
	) {
		let mut stop = self.stopped.clone();
		let mut waiting = Vec::new();
		while !speaking.is_empty() {
			let heard_event = tokio::select! {
				scoped = heard.recv() => scoped,
				Ok(()) = stop.changed() => {
					held.answer(&self.cancel(&speaking).await);
					continue;
				}
			};
			let Some(scoped) = heard_event else {
				self.lost(reading, speaking, waiting).await;
				held.answer(&CancelOutcome::Cancelled);
				return;
			};
			let Some(at) = speaking.iter().position(|speaker| self.hears(speaker, &scoped)) else {
				continue;
			};
			let Some(end) = speaking[at].end_after(&scoped.event) else {
				continue;
			};
			let done = speaking.remove(at);
			if end == SpeakerEnd::HandsOver {
				self.note_handovers(&done, &mut waiting).await;
			}
			if speaking.is_empty() && waiting.is_empty() {
				drop(held);
				return self.release(done.scope).await;
			}
			self.release(done.scope).await;
			if speaking.is_empty() {
				speaking = self.wave(&held, mem::take(&mut waiting)).await;
			}
		}
	}

	async fn lost(&self, reading: &mut RelayReader, speaking: Vec<Speaker>, waiting: Vec<Summons>) {
		let failure = reading.failure().await;
		log::error!("{} stopped hearing the sessions it runs: {failure}", self.label());
		for speaker in &speaking {
			self.tell_cancelled(&speaker.scope);
		}
		let bot_ids: Vec<&str> =
			speaking.iter().map(|speaker| speaker.scope.bot_id.as_str()).collect();
		self.end_cancelled_runs(&bot_ids).await;
		join_all(speaking.into_iter().map(|speaker| self.shut_down_started(speaker.scope))).await;
		join_all(waiting.iter().map(|summons| self.abandon(&summons.bot_id))).await;
	}

	async fn end_cancelled_runs(&self, bot_ids: &[&str]) {
		if let Err(error) = self.ended_cancelled_runs(bot_ids).await {
			log::warn!("{} could not end the runs it cancelled: {error:?}", self.label());
		}
	}

	async fn ended_cancelled_runs(&self, bot_ids: &[&str]) -> Result<(), TranscriptStoreError> {
		let database = database(&self.app)?;
		for bot_id in bot_ids {
			let cancelled = database
				.messages()
				.cancel_run(self.turn_id.clone(), (*bot_id).to_owned(), now_ms())
				.await;
			if let Err(error) = cancelled {
				log::warn!("{} could not end the run of {bot_id}: {error:?}", self.label());
			}
		}
		announce_conversation(&self.app, database, CONVERSATION_UPDATED, &self.conversation_id)
			.await;
		Ok(())
	}

	async fn wave(&self, held: &HeldTurn, summoned: Vec<Summons>) -> Vec<Speaker> {
		held.summon(&summoned);
		let speaking = self.started_wave(summoned).await;
		if speaking.is_empty() && self.has_stopped() {
			held.answer(&CancelOutcome::Cancelled);
		}
		speaking
	}

	async fn started_wave(&self, summoned: Vec<Summons>) -> Vec<Speaker> {
		if self.has_stopped() {
			join_all(summoned.iter().map(|summons| self.abandon(&summons.bot_id))).await;
			return Vec::new();
		}
		self.await_runs(&summoned).await;
		join_all(summoned.into_iter().map(|summons| self.begin(summons)))
			.await
			.into_iter()
			.flatten()
			.collect()
	}

	async fn begin(&self, summons: Summons) -> Option<Speaker> {
		match self.speak(&summons).await {
			Ok(scope) => Some(Speaker { scope, written: Vec::new() }),
			Err(refusal) => {
				self.refused(&summons.bot_id, refusal).await;
				None
			}
		}
	}

	async fn speak(&self, summons: &Summons) -> Result<RuntimeScope, Refusal> {
		let participant = self.participant(&summons.bot_id);
		let order = self.agent().map_err(Refusal::Unready)?.host_turns().order_of(&participant);
		let _in_order = order.lock().await;
		let ridden = self.ridden(participant).await?;
		if self.has_stopped() {
			return Err(Refusal::Stopped(ridden.scope));
		}
		if let Err(error) = self.submitted(&ridden, &summons.prompt_id).await {
			return Err(Refusal::Unsubmitted(ridden.scope, error));
		}
		Ok(ridden.scope)
	}

	async fn ridden(&self, participant: ParticipantKey) -> Result<Ridden, Refusal> {
		let agent = self.agent().map_err(Refusal::Unready)?;
		if let Some(scope) = live_run_of(&agent, &participant) {
			return Ok(Ridden { scope, carries_the_conversation: true });
		}
		let stored = self.stored_session(participant).await.map_err(Refusal::Unopened)?;
		let scope = scope_of(&stored);
		agent.host_turns().note_started(&scope);
		let resume = stored.provider_session_id;
		match self.started(&scope, resume.clone()).await {
			Ok(resumed) => {
				if let (Some(refused), false) = (resume, resumed) {
					self.resume_refused(&scope, refused).await;
				}
				Ok(Ridden { scope, carries_the_conversation: resumed })
			}
			Err(TransportError::TransitionInProgress) => {
				agent.host_turns().forget_started(&scope);
				Err(Refusal::Unready(TransportError::TransitionInProgress))
			}
			Err(error) => Err(Refusal::Unstarted(scope, error)),
		}
	}

	async fn stored_session(
		&self,
		participant: ParticipantKey,
	) -> Result<RuntimeSession, TranscriptStoreError> {
		let sessions = database(&self.app)?.runtime_context();
		let bot_id = participant.bot_id.clone();
		let Some(active) = sessions.active_session(participant.clone()).await? else {
			log::info!("{} starts {bot_id} fresh: no runtime session is stored", self.label());
			return Ok(sessions.open(participant, now_ms(), None).await?);
		};
		if active.provider_session_id.is_none() {
			log::info!(
				"{} starts {bot_id} fresh: runtime session {} holds nothing to resume",
				self.label(),
				active.id
			);
		}
		Ok(active)
	}

	async fn started(
		&self,
		scope: &RuntimeScope,
		resume: Option<String>,
	) -> Result<bool, TransportError> {
		let stored = managed::<R, db::DatabaseState>(&self.app, NO_DATABASE).map_err(missing)?;
		let start = RunStart {
			scope: scope.clone(),
			resume,
			cwd: None,
			output_schema: None,
			lineage: Lineage::RecordedByTheRun,
		};
		let handle =
			start_run(self.app.clone(), self.agent()?.inner(), stored.inner(), start).await?;
		Ok(handle.resumed)
	}

	async fn resume_refused(&self, scope: &RuntimeScope, refused: String) {
		log::warn!(
			"{} starts {} fresh: runtime session {} refused its resume",
			self.label(),
			scope.bot_id,
			scope.runtime_session_id
		);
		let forgotten = match database(&self.app) {
			Ok(database) => database
				.runtime_context()
				.forget_provider_session(self.participant(&scope.bot_id), refused)
				.await
				.map_err(TranscriptStoreError::from),
			Err(error) => Err(error),
		};
		if let Err(error) = forgotten {
			log::warn!("{} could not forget the refused resume: {error:?}", self.label());
		}
	}

	async fn submitted(&self, ridden: &Ridden, prompt_id: &str) -> Result<(), TransportError> {
		let text = self
			.prompt_for(ridden, prompt_id)
			.await
			.map_err(|error| TransportError::WriteFailed { detail: detail_of(&error) })?;
		let turn =
			SubmittedTurn { turn_id: self.turn_id.clone(), prompt_id: self.prompt_id.clone() };
		submit_in_line(self.agent()?.inner(), &ridden.scope, &text, turn).await
	}

	async fn prompt_for(
		&self,
		ridden: &Ridden,
		prompt_id: &str,
	) -> Result<String, TranscriptStoreError> {
		let database = database(&self.app)?;
		let scope = &ridden.scope;
		if ridden.carries_the_conversation {
			return headed_message(database, scope.conversation_id.clone(), prompt_id.to_owned())
				.await;
		}
		bounded_context(
			database,
			self.participant(&scope.bot_id),
			scope.runtime_session_id.clone(),
			prompt_id.to_owned(),
		)
		.await
	}

	async fn refused(&self, bot_id: &str, refusal: Refusal) {
		let (scope, detail) = match refusal {
			Refusal::Unready(error) => (None, Some(detail_of(&error))),
			Refusal::Unopened(error) => (None, Some(detail_of(&error))),
			Refusal::Unstarted(scope, error) => (Some(scope), Some(detail_of(&error))),
			Refusal::Unsubmitted(scope, error) => {
				let detail = detail_of(&error);
				announce(&self.app, Some(scope.clone()), AgentEvent::Failed { error });
				(Some(scope), Some(detail))
			}
			Refusal::Stopped(scope) => (Some(scope), None),
		};
		if let Some(detail) = detail {
			log::warn!("{} could not run companion {bot_id}: {detail}", self.label());
		}
		self.abandon(bot_id).await;
		if let Some(scope) = scope {
			self.release(scope).await;
		}
	}

	async fn await_runs(&self, summoned: &[Summons]) {
		if let Err(error) = self.awaited(summoned).await {
			log::warn!("{} could not await its companions: {error:?}", self.label());
		}
	}

	async fn awaited(&self, summoned: &[Summons]) -> Result<(), TranscriptStoreError> {
		let bot_ids: Vec<String> = summoned.iter().map(|summons| summons.bot_id.clone()).collect();
		database(&self.app)?.messages().await_runs(self.turn_id.clone(), bot_ids.clone()).await?;
		arm_start_deadlines(&self.app, &self.conversation_id, &self.turn_id, &bot_ids);
		Ok(())
	}

	async fn abandon(&self, bot_id: &str) {
		if let Err(error) = self.abandoned(bot_id).await {
			log::warn!("{} could not end the run of {bot_id} as failed: {error:?}", self.label());
		}
	}

	async fn abandoned(&self, bot_id: &str) -> Result<(), TranscriptStoreError> {
		let database = database(&self.app)?;
		let messages = database.messages();
		messages.abandon_run(self.turn_id.clone(), bot_id.to_owned(), now_ms()).await?;
		announce_conversation(&self.app, database, CONVERSATION_UPDATED, &self.conversation_id)
			.await;
		Ok(())
	}

	async fn note_handovers(&self, done: &Speaker, waiting: &mut Vec<Summons>) {
		match self.handed_by(done).await {
			Ok(handed) => {
				for summons in handed {
					hand_over(waiting, &done.scope.bot_id, summons);
				}
			}
			Err(error) => log::warn!(
				"{} could not read the companions {} handed over to: {error:?}",
				self.label(),
				done.scope.bot_id
			),
		}
	}

	async fn handed_by(&self, done: &Speaker) -> Result<Vec<Summons>, TranscriptStoreError> {
		let database = database(&self.app)?;
		let seats = database.conversations().seats(self.conversation_id.clone()).await?;
		let present = present_bot_ids(&seats);
		let mut handed = Vec::new();
		for id in &done.written {
			let Some(reply) =
				database.messages().message(self.conversation_id.clone(), id.clone()).await?
			else {
				continue;
			};
			handed.extend(
				seated_mentions(&reply.content, &present)
					.into_iter()
					.map(|bot_id| Summons { bot_id: bot_id.to_owned(), prompt_id: id.clone() }),
			);
		}
		Ok(handed)
	}

	async fn cancel(&self, speaking: &[Speaker]) -> CancelOutcome {
		let settled =
			join_all(speaking.iter().map(|speaker| self.cancel_speaker(&speaker.scope))).await;
		let failures: Vec<_> = settled
			.into_iter()
			.flat_map(|outcome| match outcome {
				CancelOutcome::Failed { failures } => failures,
				CancelOutcome::Cancelled | CancelOutcome::NothingToCancel => Vec::new(),
			})
			.collect();
		if failures.is_empty() {
			return CancelOutcome::Cancelled;
		}
		CancelOutcome::Failed { failures }
	}

	async fn cancel_speaker(&self, scope: &RuntimeScope) -> CancelOutcome {
		let agent = match self.agent() {
			Ok(agent) => agent,
			Err(error) => {
				return CancelOutcome::failed(&scope.bot_id, CancelFailureReason::Session(error))
			}
		};
		let is_withdrawn = withdraw_queued(&agent, scope, &self.turn_id).await;
		let outcome = cancel_session_turn(&self.app, &agent, scope).await;
		if is_withdrawn {
			self.end_cancelled_runs(&[scope.bot_id.as_str()]).await;
		}
		if is_withdrawn || outcome == CancelOutcome::NothingToCancel {
			self.tell_cancelled(scope);
		}
		match outcome {
			CancelOutcome::NothingToCancel if is_withdrawn => CancelOutcome::Cancelled,
			outcome => outcome,
		}
	}

	fn tell_cancelled(&self, scope: &RuntimeScope) {
		let turn = EventTurn {
			turn_id: self.turn_id.clone(),
			conversation_id: self.conversation_id.clone(),
		};
		announce_in_turn(
			&self.app,
			Some(scope.clone()),
			Some(turn),
			ended_as(TurnOutcome::Cancelled),
		);
	}

	fn hears(&self, speaker: &Speaker, scoped: &ScopedEvent) -> bool {
		scoped.scope.as_ref() == Some(&speaker.scope)
			&& scoped.turn.as_ref().is_none_or(|turn| turn.turn_id == self.turn_id)
	}

	fn has_stopped(&self) -> bool {
		*self.stopped.borrow()
	}

	async fn release(&self, scope: RuntimeScope) {
		let agent = match self.agent() {
			Ok(agent) => agent,
			Err(_) => return self.shut_down(scope).await,
		};
		let host_turns = agent.host_turns();
		let order = host_turns.order_of(&self.participant(&scope.bot_id));
		let _in_order = order.lock().await;
		if !host_turns.has_started(&scope) || !run_is_idle(&agent, &scope).await {
			return;
		}
		host_turns.forget_started(&scope);
		self.shut_down(scope).await;
	}

	async fn shut_down_started(&self, scope: RuntimeScope) {
		match self.agent() {
			Ok(agent) if !agent.host_turns().forget_started(&scope) => {}
			_ => self.shut_down(scope).await,
		}
	}

	async fn shut_down(&self, scope: RuntimeScope) {
		let bot_id = scope.bot_id.clone();
		if let Err(error) = self.shut(scope).await {
			log::warn!("{} could not shut the session of {bot_id} down: {error:?}", self.label());
		}
	}

	async fn shut(&self, scope: RuntimeScope) -> Result<(), TransportError> {
		agent_shutdown(self.app.clone(), self.agent()?, scope).await
	}

	fn participant(&self, bot_id: &str) -> ParticipantKey {
		ParticipantKey { conversation_id: self.conversation_id.clone(), bot_id: bot_id.to_owned() }
	}

	fn agent(&self) -> Result<State<'_, AgentState>, TransportError> {
		managed(&self.app, NO_AGENT).map_err(missing)
	}

	fn label(&self) -> String {
		format!("host turn {} of conversation {}", self.turn_id, self.conversation_id)
	}
}

fn hand_over(waiting: &mut Vec<Summons>, from: &str, summons: Summons) {
	let is_held = waiting.iter().any(|held| held.bot_id == summons.bot_id);
	if summons.bot_id == from || is_held {
		return;
	}
	waiting.push(summons);
}

pub(crate) fn ended_as(outcome: TurnOutcome) -> AgentEvent {
	AgentEvent::TurnEnded {
		ended: TurnEnded {
			session_id: None,
			outcome,
			structured_output: None,
			total_cost_usd: None,
			model_usage: None,
		},
	}
}

fn missing(detail: String) -> TransportError {
	TransportError::WriteFailed { detail }
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{Listener, Manager};

	use super::*;
	use tokio::sync::broadcast;

	use crate::agent::commands::{agent_cancel_turn, EVENT_CHANNEL};
	use crate::agent::contract::ConnectionState;
	use crate::conversations::contract::StorageFailure;
	use crate::conversations::contract::UPDATED_EVENT;
	use crate::conversations::turn_run_deadline::TurnRunDeadlines;
	use crate::db::repositories::conversations::{
		BotIdentity, ConversationDraft, DEFAULT_BOT_ID, DEFAULT_BOT_MODEL,
	};
	use crate::db::repositories::messages::{
		MessagePageQuery, MessageState, NewAssistantMessage, NewTurn,
	};
	use crate::events::{self, Frame};
	use crate::routines::runner::read;
	use crate::test_app::an_app_of_its_own;

	fn a_speaker() -> Speaker {
		let scope = RuntimeScope {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			runtime_session_id: "s1".to_owned(),
			epoch: 1,
		};
		Speaker { scope, written: Vec::new() }
	}

	#[test]
	fn a_speaker_hands_over_once_completed_or_its_session_ends_and_not_once_cancelled() {
		let session_ended = AgentEvent::Failed { error: TransportError::NotStarted };
		let still_speaking = AgentEvent::Failed { error: TransportError::NoActiveTurn };

		assert_eq!(
			a_speaker().end_after(&ended_as(TurnOutcome::Completed)),
			Some(SpeakerEnd::HandsOver)
		);
		assert_eq!(
			a_speaker().end_after(&ended_as(TurnOutcome::Cancelled)),
			Some(SpeakerEnd::Cancelled)
		);
		assert_eq!(a_speaker().end_after(&session_ended), Some(SpeakerEnd::HandsOver));
		assert_eq!(a_speaker().end_after(&still_speaking), None);
	}

	fn told(announced: &mut broadcast::Receiver<Frame>) -> Vec<(String, Value)> {
		let mut told = Vec::new();
		while let Ok(frame) = announced.try_recv() {
			let framed: Value = serde_json::from_str(&frame).expect("the frame is JSON");
			let name = framed["event"].as_str().expect("the frame is named").to_owned();
			told.push((name, framed["payload"].clone()));
		}
		told
	}

	fn agent_events(told: &[(String, Value)]) -> Vec<ScopedEvent> {
		told.iter()
			.filter(|(name, _)| name == EVENT_CHANNEL)
			.map(|(_, payload)| serde_json::from_value(payload.clone()).expect("an agent event"))
			.collect()
	}

	fn active_turns(told: &[(String, Value)]) -> Vec<Value> {
		told.iter()
			.filter(|(name, _)| name == UPDATED_EVENT)
			.map(|(_, payload)| payload["conversation"]["activeTurn"].clone())
			.collect()
	}

	fn shut_down_scopes(events: &[ScopedEvent]) -> Vec<RuntimeScope> {
		let shut_down = AgentEvent::ConnectionChanged { state: ConnectionState::Checking };
		let mut scopes: Vec<RuntimeScope> = events
			.iter()
			.filter(|scoped| scoped.event == shut_down)
			.filter_map(|scoped| scoped.scope.clone())
			.collect();
		scopes.sort_by(|one, other| one.bot_id.cmp(&other.bot_id));
		scopes
	}

	fn assert_cancelled_before_shut_down(events: &[ScopedEvent], scope: &RuntimeScope) {
		let shut_down = AgentEvent::ConnectionChanged { state: ConnectionState::Checking };
		let told_to = |event: &AgentEvent| {
			events
				.iter()
				.position(|scoped| scoped.scope.as_ref() == Some(scope) && &scoped.event == event)
		};
		let cancelled = told_to(&ended_as(TurnOutcome::Cancelled));
		let shut = told_to(&shut_down);
		assert!(cancelled.is_some(), "{} never heard its reply cancelled", scope.bot_id);
		assert!(cancelled < shut, "{} was shut down before its reply ended", scope.bot_id);
	}

	struct Room {
		id: String,
		bot_ids: Vec<String>,
	}

	async fn a_room_running(app: &AppHandle<MockRuntime>, names: &[&str]) -> Room {
		let conversations = database(app).expect("the database opens").conversations();
		let mut bot_ids = Vec::new();
		for name in names {
			let identity = BotIdentity {
				name: (*name).to_owned(),
				title: String::new(),
				model: DEFAULT_BOT_MODEL.to_owned(),
				avatar_blot: None,
				avatar_image_path: None,
				instructions: String::new(),
				denied_tools: Vec::new(),
				effort: None,
			};
			let created = conversations
				.create_bot(identity, Some("personal".to_owned()), None)
				.await
				.expect("the bot is created");
			bot_ids.push(created.id);
		}
		let room = conversations
			.create_conversation(ConversationDraft {
				space_id: "personal".to_owned(),
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: bot_ids.clone(),
			})
			.await
			.expect("the room is created");
		Room { id: room.id, bot_ids }
	}

	fn turn_in(room: &Room) -> NewTurn {
		NewTurn { id: "t1".to_owned(), conversation_id: room.id.clone(), started_at: 1 }
	}

	async fn speaking_in(app: &AppHandle<MockRuntime>, room: &Room, bot_ids: &[String]) {
		let messages = database(app).expect("the database opens").messages();
		messages.start_turn(turn_in(room)).await.expect("the turn opens");
		for bot_id in bot_ids {
			messages.start_run(turn_in(room), bot_id.clone()).await.expect("the run starts");
		}
	}

	async fn a_streaming_reply(app: &AppHandle<MockRuntime>, room: &Room, bot_id: &str) {
		let messages = database(app).expect("the database opens").messages();
		let id = format!("reply-of-{bot_id}");
		let reply = NewAssistantMessage {
			id: id.clone(),
			conversation_id: room.id.clone(),
			turn_id: "t1".to_owned(),
			author_bot_id: Some(bot_id.to_owned()),
			replied_to_message_id: None,
			created_at: 2,
		};
		messages.open_assistant_message(reply).await.expect("the reply is opened");
		messages.append_text(id, "half".to_owned()).await.expect("the reply streams");
	}

	async fn reply_states(app: &AppHandle<MockRuntime>, room: &Room) -> Vec<MessageState> {
		let query =
			MessagePageQuery { conversation_id: room.id.clone(), before_seq: None, limit: 10 };
		let page = database(app)
			.expect("the database opens")
			.messages()
			.page_messages(query)
			.await
			.expect("the transcript reads");
		page.messages.iter().map(|message| message.state).collect()
	}

	fn scope_in(room: &Room, bot_id: &str) -> RuntimeScope {
		RuntimeScope {
			conversation_id: room.id.clone(),
			bot_id: bot_id.to_owned(),
			runtime_session_id: format!("session-of-{bot_id}"),
			epoch: 1,
		}
	}

	fn a_lagging_reader() -> (RelayReader, mpsc::UnboundedReceiver<ScopedEvent>) {
		let (relay, lagging) = broadcast::channel(1);
		for _ in 0..3 {
			relay.send(Frame::from(r#"{"event":"other","payload":null}"#)).expect("subscribed");
		}
		let (events, heard) = mpsc::unbounded_channel();
		(read(lagging, |_| true, events), heard)
	}

	fn a_host_turn(
		app: &AppHandle<MockRuntime>,
		room: &Room,
		stopped: watch::Receiver<bool>,
	) -> HostTurn<MockRuntime> {
		HostTurn {
			app: app.clone(),
			conversation_id: room.id.clone(),
			turn_id: "t1".to_owned(),
			prompt_id: "p1".to_owned(),
			stopped,
		}
	}

	#[tokio::test]
	async fn a_group_turn_whose_reader_lags_shuts_down_every_speaker() {
		let app = an_app_of_its_own("host-turn-reader-lag", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada", "Grace"]).await;
		speaking_in(app.handle(), &room, &room.bot_ids).await;
		for bot_id in &room.bot_ids {
			a_streaming_reply(app.handle(), &room, bot_id).await;
		}
		let mut announced = events::subscribed(app.handle());
		let (mut reading, heard) = a_lagging_reader();
		let turns = HostTurns::default();
		let held = turns.hold(&room.id, "t1").expect("the turn is held");
		let host_turn = a_host_turn(app.handle(), &room, held.stopped.clone());
		let mut speakers: Vec<RuntimeScope> =
			room.bot_ids.iter().map(|bot_id| scope_in(&room, bot_id)).collect();
		speakers.sort_by(|one, other| one.bot_id.cmp(&other.bot_id));
		for scope in &speakers {
			app.state::<AgentState>().host_turns().note_started(scope);
		}
		let speaking =
			speakers.iter().map(|scope| Speaker { scope: scope.clone(), written: Vec::new() });

		host_turn.drive(held, speaking.collect(), heard, &mut reading).await;

		let told = told(&mut announced);
		let events = agent_events(&told);
		assert_eq!(shut_down_scopes(&events), speakers);
		for scope in &speakers {
			assert_cancelled_before_shut_down(&events, scope);
		}
		assert_eq!(active_turns(&told), vec![Value::Null]);
		assert_eq!(reply_states(app.handle(), &room).await, vec![MessageState::Cancelled; 2]);
	}

	#[tokio::test]
	async fn a_group_turn_whose_reader_lags_abandons_every_waiting_bot() {
		let app = an_app_of_its_own("host-turn-reader-lag-waiting", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada", "Grace"]).await;
		let (speaker, waiter) = (room.bot_ids[0].clone(), room.bot_ids[1].clone());
		speaking_in(app.handle(), &room, std::slice::from_ref(&speaker)).await;
		let stored = database(app.handle()).expect("the database opens");
		stored.messages().await_runs("t1".to_owned(), vec![waiter.clone()]).await.expect("held");
		let mut announced = events::subscribed(app.handle());
		let (mut reading, _heard) = a_lagging_reader();
		let (_stop, stopped) = watch::channel(false);
		let host_turn = a_host_turn(app.handle(), &room, stopped);
		app.state::<AgentState>().host_turns().note_started(&scope_in(&room, &speaker));
		let speaking = vec![Speaker { scope: scope_in(&room, &speaker), written: Vec::new() }];
		let waiting = vec![Summons { bot_id: waiter.clone(), prompt_id: "p1".to_owned() }];

		host_turn.lost(&mut reading, speaking, waiting).await;

		let told = told(&mut announced);
		assert_eq!(
			active_turns(&told),
			vec![json!({ "bots": [{ "botId": waiter, "startedAt": 1 }] }), Value::Null]
		);
		assert_eq!(shut_down_scopes(&agent_events(&told)), vec![scope_in(&room, &speaker)]);
	}

	#[tokio::test]
	async fn a_room_turn_releases_every_summoned_bot_that_never_starts_at_its_start_deadline() {
		let app = an_app_of_its_own("host-turn-start-deadline", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(TurnRunDeadlines::after(Duration::ZERO));
		let stored = database(app.handle()).expect("the database opens");
		let conversations = stored.conversations();
		conversations.ensure_default_bot().await.expect("the bot is seeded");
		let identity = BotIdentity {
			name: "Ada".to_owned(),
			title: String::new(),
			model: DEFAULT_BOT_MODEL.to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: String::new(),
			denied_tools: Vec::new(),
			effort: None,
		};
		let ada = conversations
			.create_bot(identity, Some("personal".to_owned()), None)
			.await
			.expect("the second bot is created")
			.id;
		let room = conversations
			.create_conversation(ConversationDraft {
				space_id: "personal".to_owned(),
				section_id: None,
				title: "Room".to_owned(),
				icon: None,
				bot_ids: vec![DEFAULT_BOT_ID.to_owned(), ada.clone()],
			})
			.await
			.expect("the room is created");
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: room.id.clone(), started_at: 1 };
		stored.messages().start_turn(turn).await.expect("the turn opens");
		let (announced, mut updates) = mpsc::unbounded_channel();
		app.handle().listen(UPDATED_EVENT, move |event| {
			let payload: Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});
		let (stop, stopped) = watch::channel(false);
		let host_turn = HostTurn {
			app: app.handle().clone(),
			conversation_id: room.id.clone(),
			turn_id: "t1".to_owned(),
			prompt_id: "p1".to_owned(),
			stopped,
		};
		let summoned: Vec<Summons> = [DEFAULT_BOT_ID, ada.as_str()]
			.into_iter()
			.map(|bot_id| Summons { bot_id: bot_id.to_owned(), prompt_id: "p1".to_owned() })
			.collect();

		host_turn.await_runs(&summoned).await;
		let mut heard = Vec::new();
		let released = tokio::time::timeout(Duration::from_secs(60), async {
			while let Some(active_turn) = updates.recv().await {
				if active_turn.is_null() {
					return true;
				}
				heard.push(active_turn);
			}
			false
		})
		.await;

		assert_eq!(released, Ok(true), "the deadline left the turn working");
		assert_eq!(heard, vec![json!({ "bots": [{ "botId": ada, "startedAt": 1 }] })]);
		drop(stop);
	}

	async fn open_runs(app: &AppHandle<MockRuntime>) -> i64 {
		database(app)
			.expect("the database opens")
			.messages()
			.call(|connection| {
				Ok(connection.query_row("SELECT COUNT(*) FROM turn_runs", [], |row| row.get(0))?)
			})
			.await
			.expect("the runs are counted")
	}

	async fn stopped(app: &AppHandle<MockRuntime>, scope: RuntimeScope) -> CancelOutcome {
		agent_cancel_turn(app.clone(), app.state::<AgentState>(), scope)
			.await
			.expect("the stop answers")
	}

	fn unavailable_store(bot_id: &str) -> CancelFailure {
		CancelFailure {
			bot_id: bot_id.to_owned(),
			reason: CancelFailureReason::Store(TranscriptStoreError::Unavailable {
				failure: StorageFailure::AppDataDir,
			}),
		}
	}

	#[tokio::test]
	async fn a_stop_with_no_live_session_closes_the_running_run_it_finds_and_says_cancelled() {
		let app = an_app_of_its_own("cancel-stored-run", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada"]).await;
		let ada = room.bot_ids[0].clone();
		speaking_in(app.handle(), &room, std::slice::from_ref(&ada)).await;
		a_streaming_reply(app.handle(), &room, &ada).await;
		let mut announced = events::subscribed(app.handle());

		let outcome = stopped(app.handle(), scope_in(&room, &ada)).await;

		assert_eq!(outcome, CancelOutcome::Cancelled);
		assert_eq!(open_runs(app.handle()).await, 0, "the running run was left open");
		assert_eq!(reply_states(app.handle(), &room).await, vec![MessageState::Cancelled]);
		let told = told(&mut announced);
		let ended = ScopedEvent {
			scope: Some(scope_in(&room, &ada)),
			turn: None,
			event: ended_as(TurnOutcome::Cancelled),
		};
		assert_eq!(agent_events(&told), vec![ended]);
		assert_eq!(active_turns(&told), vec![Value::Null]);
	}

	#[tokio::test]
	async fn a_stop_with_no_live_session_and_no_open_run_has_nothing_to_cancel() {
		let app = an_app_of_its_own("cancel-nothing", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada"]).await;
		let mut announced = events::subscribed(app.handle());

		let outcome = stopped(app.handle(), scope_in(&room, &room.bot_ids[0])).await;

		assert_eq!(outcome, CancelOutcome::NothingToCancel);
		assert_eq!(told(&mut announced), Vec::new());
	}

	#[tokio::test]
	async fn a_stop_whose_stored_run_cannot_be_closed_answers_failed_with_the_store_error() {
		let app = an_app_of_its_own("cancel-store-down", mock_builder());
		app.manage(AgentState::default());
		let scope = RuntimeScope {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			runtime_session_id: "r1".to_owned(),
			epoch: 1,
		};

		let outcome = stopped(app.handle(), scope).await;

		assert_eq!(outcome, CancelOutcome::Failed { failures: vec![unavailable_store("b1")] });
	}

	fn a_driven_turn(
		app: &AppHandle<MockRuntime>,
		room: &Room,
	) -> (tauri::async_runtime::JoinHandle<()>, mpsc::UnboundedSender<ScopedEvent>) {
		let held = app.state::<AgentState>().host_turns().hold(&room.id, "t1").expect("held");
		let host_turn = a_host_turn(app, room, held.stopped.clone());
		let speaking = room
			.bot_ids
			.iter()
			.map(|bot_id| Speaker { scope: scope_in(room, bot_id), written: Vec::new() });
		let speaking: Vec<Speaker> = speaking.collect();
		let (events, heard) = mpsc::unbounded_channel();
		let (mut reading, _lagging) = a_lagging_reader();
		let driving = tauri::async_runtime::spawn(async move {
			host_turn.drive(held, speaking, heard, &mut reading).await;
		});
		(driving, events)
	}

	#[tokio::test]
	async fn a_group_stop_answers_once_every_speaking_companion_cancel_has_settled() {
		let app = an_app_of_its_own("cancel-group-settled", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada", "Grace"]).await;
		speaking_in(app.handle(), &room, &room.bot_ids).await;
		let (driving, _events) = a_driven_turn(app.handle(), &room);

		let outcome = stopped(app.handle(), scope_in(&room, &room.bot_ids[0])).await;
		let left_open = open_runs(app.handle()).await;
		driving.abort();

		assert_eq!(outcome, CancelOutcome::Cancelled);
		assert_eq!(left_open, 0, "the stop answered before every speaker's run closed");
	}

	#[tokio::test]
	async fn a_group_stop_ends_a_speaker_that_holds_nothing_left_to_cancel() {
		let app = an_app_of_its_own("cancel-group-idle-speaker", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada"]).await;
		let ada = scope_in(&room, &room.bot_ids[0]);
		let (driving, _events) = a_driven_turn(app.handle(), &room);
		let mut announced = events::subscribed(app.handle());

		let outcome = stopped(app.handle(), ada.clone()).await;
		driving.abort();

		assert_eq!(outcome, CancelOutcome::Cancelled);
		let turn = EventTurn { turn_id: "t1".to_owned(), conversation_id: room.id.clone() };
		let ended = ScopedEvent {
			scope: Some(ada),
			turn: Some(turn),
			event: ended_as(TurnOutcome::Cancelled),
		};
		assert_eq!(agent_events(&told(&mut announced)), vec![ended]);
	}

	#[tokio::test]
	async fn a_group_stop_names_every_companion_whose_cancel_failed() {
		let app = an_app_of_its_own("cancel-group-failed", mock_builder());
		app.manage(AgentState::default());
		let room =
			Room { id: "c1".to_owned(), bot_ids: vec!["b-ada".to_owned(), "b-grace".to_owned()] };
		let (driving, _events) = a_driven_turn(app.handle(), &room);

		let outcome = stopped(app.handle(), scope_in(&room, "b-ada")).await;
		driving.abort();

		assert_eq!(
			outcome,
			CancelOutcome::Failed {
				failures: vec![unavailable_store("b-ada"), unavailable_store("b-grace")]
			}
		);
	}

	fn the_stop_of(turns: &HostTurns, conversation_id: &str) -> oneshot::Receiver<CancelOutcome> {
		let mut asked = turns.request_stop(conversation_id);
		assert_eq!(asked.len(), 1, "one running turn takes the stop");
		asked.remove(0).1
	}

	fn summons_of(bot_ids: &[&str]) -> Vec<Summons> {
		bot_ids
			.iter()
			.map(|bot_id| Summons { bot_id: (*bot_id).to_owned(), prompt_id: "p1".to_owned() })
			.collect()
	}

	#[tokio::test]
	async fn a_stop_pending_when_every_speaker_ends_on_its_own_has_nothing_to_cancel() {
		let app = an_app_of_its_own("cancel-ended-on-its-own", mock_builder());
		let room = Room { id: "c1".to_owned(), bot_ids: vec!["b-ada".to_owned()] };
		let turns = HostTurns::default();
		let held = turns.hold(&room.id, "t1").expect("the turn is held");
		let answered = the_stop_of(&turns, &room.id);
		let (_unwired, stopped) = watch::channel(false);
		let host_turn = a_host_turn(app.handle(), &room, stopped);
		let ada = scope_in(&room, "b-ada");
		let (events, heard) = mpsc::unbounded_channel();
		let completed = ScopedEvent {
			scope: Some(ada.clone()),
			turn: None,
			event: ended_as(TurnOutcome::Completed),
		};
		events.send(completed).expect("the turn listens");
		let (mut reading, _lagging) = a_lagging_reader();
		let speaking = vec![Speaker { scope: ada, written: Vec::new() }];

		host_turn.drive(held, speaking, heard, &mut reading).await;

		assert_eq!(answered.await, Ok(CancelOutcome::NothingToCancel));
		assert!(turns.request_stop(&room.id).is_empty(), "a released turn still took a stop");
	}

	#[tokio::test]
	async fn a_stop_pending_when_the_relay_is_lost_answers_cancelled_once_the_runs_are_ended() {
		let app = an_app_of_its_own("cancel-relay-lost", mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(AgentState::default());
		let room = a_room_running(app.handle(), &["Ada"]).await;
		speaking_in(app.handle(), &room, &room.bot_ids).await;
		let turns = HostTurns::default();
		let held = turns.hold(&room.id, "t1").expect("the turn is held");
		let answered = the_stop_of(&turns, &room.id);
		let (_unwired, stopped) = watch::channel(false);
		let host_turn = a_host_turn(app.handle(), &room, stopped);
		let (events, heard) = mpsc::unbounded_channel::<ScopedEvent>();
		drop(events);
		let (mut reading, _lagging) = a_lagging_reader();
		let speaking =
			vec![Speaker { scope: scope_in(&room, &room.bot_ids[0]), written: Vec::new() }];

		host_turn.drive(held, speaking, heard, &mut reading).await;

		assert_eq!(answered.await, Ok(CancelOutcome::Cancelled));
		assert_eq!(open_runs(app.handle()).await, 0, "the lost turn left its run open");
	}

	#[tokio::test(start_paused = true)]
	async fn a_group_stop_left_unanswered_past_its_bound_fails_naming_every_bot_of_the_turn() {
		let turns = HostTurns::default();
		let held = turns.hold("c1", "t1").expect("the turn is held");
		held.summon(&summons_of(&["b-ada", "b-grace"]));
		let scope = RuntimeScope {
			conversation_id: "c1".to_owned(),
			bot_id: "b-ada".to_owned(),
			runtime_session_id: "r1".to_owned(),
			epoch: 1,
		};

		let outcome = turns.stop(&scope).await;

		let unanswered = CancelFailureReason::Session(TransportError::WriteFailed {
			detail: format!(
				"the host turn did not answer the stop within {} seconds",
				STOP_ANSWER_BOUND.as_secs()
			),
		});
		let failure =
			|bot_id: &str| CancelFailure { bot_id: bot_id.to_owned(), reason: unanswered.clone() };
		assert_eq!(
			outcome,
			Some(CancelOutcome::Failed { failures: vec![failure("b-ada"), failure("b-grace")] })
		);
		drop(held);
	}

	#[tokio::test]
	async fn a_stop_that_keeps_every_summoned_companion_from_starting_answers_cancelled() {
		let app = an_app_of_its_own("cancel-before-the-wave", mock_builder());
		let room = Room { id: "c1".to_owned(), bot_ids: vec!["b-ada".to_owned()] };
		let turns = HostTurns::default();
		let held = turns.hold(&room.id, "t1").expect("the turn is held");
		let answered = the_stop_of(&turns, &room.id);
		let host_turn = a_host_turn(app.handle(), &room, held.stopped.clone());

		let speaking = host_turn.wave(&held, summons_of(&["b-ada"])).await;

		assert!(speaking.is_empty(), "a stopped turn started a companion");
		assert_eq!(answered.await, Ok(CancelOutcome::Cancelled));
		drop(held);
	}
}
