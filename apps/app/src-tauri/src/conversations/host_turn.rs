use std::collections::HashMap;
use std::iter;
use std::mem;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use futures_util::future::join_all;
use tauri::{AppHandle, Listener, Runtime, State};
use tokio::sync::{mpsc, watch};

use super::commands::announce_conversation;
use super::context::{bounded_context, mentioned_bot_ids};
use super::contract::{SentMessage, TranscriptStoreError};
use super::turn_run_deadline::arm_start_deadlines;
use crate::agent::commands::{
	agent_shutdown, agent_start_or_resume_session, agent_submit_prompt, announce,
	cancel_session_turn,
};
use crate::agent::contract::{
	AgentEvent, RuntimeScope, ScopedEvent, SubmittedTurn, TransportError, TurnOutcome,
};
use crate::agent::translate::now_ms;
use crate::agent::AgentState;
use crate::db;
use crate::db::repositories::conversations::Seat;
use crate::db::repositories::runtime_context::{Handover, ParticipantKey};
use crate::events::CONVERSATION_UPDATED;
use crate::routines::runner::{
	database, detail_of, ends_the_session, listen, managed, NO_AGENT, NO_DATABASE,
};

type Running = Arc<Mutex<HashMap<String, RunningTurn>>>;

struct RunningTurn {
	turn_id: String,
	stop: watch::Sender<bool>,
}

#[derive(Default)]
pub(crate) struct HostTurns {
	running: Running,
}

impl HostTurns {
	pub(crate) fn hold(
		&self,
		conversation_id: &str,
		turn_id: &str,
	) -> Result<HeldTurn, TranscriptStoreError> {
		let mut running = locked(&self.running);
		if let Some(running_turn) = running.get(conversation_id) {
			return Err(TranscriptStoreError::TurnAlreadyRunning {
				conversation_id: conversation_id.to_owned(),
				turn_id: running_turn.turn_id.clone(),
			});
		}
		let (stop, stopped) = watch::channel(false);
		running
			.insert(conversation_id.to_owned(), RunningTurn { turn_id: turn_id.to_owned(), stop });
		Ok(HeldTurn {
			running: self.running.clone(),
			conversation_id: conversation_id.to_owned(),
			stopped,
		})
	}

	pub(crate) fn stop(&self, conversation_id: &str) -> bool {
		let running = locked(&self.running);
		let Some(running_turn) = running.get(conversation_id) else {
			return false;
		};
		running_turn.stop.send_replace(true);
		true
	}
}

pub(crate) struct HeldTurn {
	running: Running,
	conversation_id: String,
	stopped: watch::Receiver<bool>,
}

impl Drop for HeldTurn {
	fn drop(&mut self) {
		locked(&self.running).remove(&self.conversation_id);
	}
}

fn locked(running: &Running) -> MutexGuard<'_, HashMap<String, RunningTurn>> {
	running.lock().unwrap_or_else(PoisonError::into_inner)
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
	let label = format!("host turn {}", message.turn_id);
	let listening =
		listen(&app, label, move |scope| scope.conversation_id == conversation_id, events);
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
	let speaking = turn.wave(first).await;
	tauri::async_runtime::spawn(async move {
		turn.drive(held, speaking, heard).await;
		turn.app.unlisten(listening);
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
	) {
		let mut stop = self.stopped.clone();
		let mut waiting = Vec::new();
		while !speaking.is_empty() {
			let heard_event = tokio::select! {
				scoped = heard.recv() => scoped,
				Ok(()) = stop.changed() => {
					self.cancel(&speaking).await;
					continue;
				}
			};
			let Some(scoped) = heard_event else {
				return eprintln!("{} stopped hearing the sessions it runs", self.label());
			};
			let Some(at) =
				speaking.iter().position(|speaker| scoped.scope.as_ref() == Some(&speaker.scope))
			else {
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
				return self.shut_down(done.scope).await;
			}
			self.shut_down(done.scope).await;
			if speaking.is_empty() {
				speaking = self.wave(mem::take(&mut waiting)).await;
			}
		}
	}

	async fn wave(&self, summoned: Vec<Summons>) -> Vec<Speaker> {
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
		let scope = self.opened(&summons.bot_id).await.map_err(Refusal::Unopened)?;
		if let Err(error) = self.started(&scope).await {
			return Err(Refusal::Unstarted(scope, error));
		}
		if self.has_stopped() {
			return Err(Refusal::Stopped(scope));
		}
		if let Err(error) = self.submitted(&scope, &summons.prompt_id).await {
			return Err(Refusal::Unsubmitted(scope, error));
		}
		Ok(scope)
	}

	async fn opened(&self, bot_id: &str) -> Result<RuntimeScope, TranscriptStoreError> {
		let participant = self.participant(bot_id);
		let sessions = database(&self.app)?.runtime_context();
		let handover = sessions
			.active_session(participant.clone())
			.await?
			.map(|active| Handover { session_id: active.id, reason: None });
		let opened = sessions.open(participant, now_ms(), handover).await?;
		Ok(RuntimeScope {
			conversation_id: opened.participant.conversation_id,
			bot_id: opened.participant.bot_id,
			runtime_session_id: opened.id,
			epoch: opened.seq,
		})
	}

	async fn started(&self, scope: &RuntimeScope) -> Result<(), TransportError> {
		let stored = managed::<R, db::DatabaseState>(&self.app, NO_DATABASE).map_err(missing)?;
		agent_start_or_resume_session(
			self.app.clone(),
			self.agent()?,
			stored,
			scope.clone(),
			None,
			None,
			None,
		)
		.await
		.map(|_| ())
	}

	async fn submitted(&self, scope: &RuntimeScope, prompt_id: &str) -> Result<(), TransportError> {
		let context = self
			.context_for(scope, prompt_id)
			.await
			.map_err(|error| TransportError::WriteFailed { detail: detail_of(&error) })?;
		let turn =
			SubmittedTurn { turn_id: self.turn_id.clone(), prompt_id: self.prompt_id.clone() };
		agent_submit_prompt(self.agent()?, scope.clone(), context, Some(turn)).await
	}

	async fn context_for(
		&self,
		scope: &RuntimeScope,
		prompt_id: &str,
	) -> Result<String, TranscriptStoreError> {
		bounded_context(
			database(&self.app)?,
			self.participant(&scope.bot_id),
			scope.runtime_session_id.clone(),
			prompt_id.to_owned(),
		)
		.await
	}

	async fn refused(&self, bot_id: &str, refusal: Refusal) {
		let (scope, detail) = match refusal {
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
			eprintln!("{} could not run companion {bot_id}: {detail}", self.label());
		}
		self.abandon(bot_id).await;
		if let Some(scope) = scope {
			self.shut_down(scope).await;
		}
	}

	async fn await_runs(&self, summoned: &[Summons]) {
		if let Err(error) = self.awaited(summoned).await {
			eprintln!("{} could not await its companions: {error:?}", self.label());
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
			eprintln!("{} could not end the run of {bot_id} as failed: {error:?}", self.label());
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
			Err(error) => eprintln!(
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

	async fn cancel(&self, speaking: &[Speaker]) {
		join_all(speaking.iter().map(|speaker| self.cancel_speaker(&speaker.scope))).await;
	}

	async fn cancel_speaker(&self, scope: &RuntimeScope) {
		if let Err(error) = self.cancelled(scope).await {
			eprintln!(
				"{} could not cancel the turn of companion {}: {error:?}",
				self.label(),
				scope.bot_id
			);
		}
	}

	async fn cancelled(&self, scope: &RuntimeScope) -> Result<(), TransportError> {
		cancel_session_turn(&self.app, &*self.agent()?, scope).await
	}

	fn has_stopped(&self) -> bool {
		*self.stopped.borrow()
	}

	async fn shut_down(&self, scope: RuntimeScope) {
		let bot_id = scope.bot_id.clone();
		if let Err(error) = self.shut(scope).await {
			eprintln!("{} could not shut the session of {bot_id} down: {error:?}", self.label());
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

fn missing(detail: String) -> TransportError {
	TransportError::WriteFailed { detail }
}

#[cfg(test)]
mod tests {
	use std::time::Duration;

	use serde_json::{json, Value};
	use tauri::test::mock_builder;
	use tauri::Manager;

	use super::*;
	use crate::agent::contract::TurnEnded;
	use crate::conversations::contract::UPDATED_EVENT;
	use crate::conversations::turn_run_deadline::TurnRunDeadlines;
	use crate::db::repositories::conversations::{
		BotIdentity, ConversationDraft, DEFAULT_BOT_ID, DEFAULT_BOT_MODEL,
	};
	use crate::db::repositories::messages::NewTurn;
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

	fn ended_as(outcome: TurnOutcome) -> AgentEvent {
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
		let host_turn = HostTurn {
			app: app.handle().clone(),
			conversation_id: room.id.clone(),
			turn_id: "t1".to_owned(),
			prompt_id: "p1".to_owned(),
		};
		let summoned: Vec<Summons> = [DEFAULT_BOT_ID, ada.as_str()]
			.into_iter()
			.map(|bot_id| Summons { bot_id: bot_id.to_owned(), prompt_id: "p1".to_owned() })
			.collect();

		host_turn.await_runs(&summoned).await;
		let mut heard = Vec::new();
		let released = tokio::time::timeout(Duration::from_secs(10), async {
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
		assert_eq!(heard, vec![json!({ "startedAt": 1, "botIds": [ada] })]);
	}
}
