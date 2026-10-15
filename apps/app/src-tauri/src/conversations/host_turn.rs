use std::collections::HashMap;
use std::iter;
use std::mem;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use futures_util::future::join_all;
use tauri::{AppHandle, Listener, Runtime, State};
use tokio::sync::mpsc;

use super::commands::announce_conversation;
use super::context::{bounded_context, mentioned_bot_ids};
use super::contract::{SentMessage, TranscriptStoreError};
use crate::agent::commands::{
	agent_shutdown, agent_start_or_resume_session, agent_submit_prompt, announce,
};
use crate::agent::contract::{
	AgentEvent, RuntimeScope, ScopedEvent, SubmittedTurn, TransportError,
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

type Running = Arc<Mutex<HashMap<String, String>>>;

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
		if let Some(running_turn_id) = running.get(conversation_id) {
			return Err(TranscriptStoreError::TurnAlreadyRunning {
				conversation_id: conversation_id.to_owned(),
				turn_id: running_turn_id.clone(),
			});
		}
		running.insert(conversation_id.to_owned(), turn_id.to_owned());
		Ok(HeldTurn { running: self.running.clone(), conversation_id: conversation_id.to_owned() })
	}
}

pub(crate) struct HeldTurn {
	running: Running,
	conversation_id: String,
}

impl Drop for HeldTurn {
	fn drop(&mut self) {
		locked(&self.running).remove(&self.conversation_id);
	}
}

fn locked(running: &Running) -> MutexGuard<'_, HashMap<String, String>> {
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

fn present_bot_ids(seats: &[Seat]) -> Vec<&str> {
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

impl Speaker {
	fn is_done_after(&mut self, event: &AgentEvent) -> bool {
		match event {
			AgentEvent::MessageStarted { message } | AgentEvent::MessageCompleted { message } => {
				self.wrote(&message.id)
			}
			AgentEvent::MessageDelta { id, .. } => self.wrote(id),
			AgentEvent::TurnEnded { .. } => return true,
			AgentEvent::Failed { error } => return ends_the_session(error),
			_ => {}
		}
		false
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
}

struct HostTurn<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	turn_id: String,
	prompt_id: String,
}

impl<R: Runtime> HostTurn<R> {
	async fn drive(
		&self,
		held: HeldTurn,
		mut speaking: Vec<Speaker>,
		mut heard: mpsc::UnboundedReceiver<ScopedEvent>,
	) {
		let mut waiting = Vec::new();
		while !speaking.is_empty() {
			let Some(scoped) = heard.recv().await else {
				return eprintln!("{} stopped hearing the sessions it runs", self.label());
			};
			let Some(at) =
				speaking.iter().position(|speaker| scoped.scope.as_ref() == Some(&speaker.scope))
			else {
				continue;
			};
			if !speaking[at].is_done_after(&scoped.event) {
				continue;
			}
			let done = speaking.remove(at);
			self.note_handovers(&done, &mut waiting).await;
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
			Refusal::Unopened(error) => (None, detail_of(&error)),
			Refusal::Unstarted(scope, error) => (Some(scope), detail_of(&error)),
			Refusal::Unsubmitted(scope, error) => {
				let detail = detail_of(&error);
				announce(&self.app, Some(scope.clone()), AgentEvent::Failed { error });
				(Some(scope), detail)
			}
		};
		eprintln!("{} could not run companion {bot_id}: {detail}", self.label());
		self.end_failed().await;
		if let Some(scope) = scope {
			self.shut_down(scope).await;
		}
	}

	async fn end_failed(&self) {
		if let Err(error) = self.ended_failed().await {
			eprintln!("{} could not be ended as failed: {error:?}", self.label());
		}
	}

	async fn ended_failed(&self) -> Result<(), TranscriptStoreError> {
		let database = database(&self.app)?;
		database.messages().complete_turn(self.turn_id.clone(), now_ms()).await?;
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
