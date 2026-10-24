use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::companions::contract::CompanionError;
use crate::conversations::contract::{Bot, StorageFailure, TranscriptStoreError};
use crate::db::repositories::conversations::ConversationError;
use crate::db::DatabaseError;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MissionEventKind {
	Opened,
	Note,
	AgentAsked,
	AgentStarted,
	AgentStopped,
	Answered,
	Escalated,
	Ready,
	ChecksFailed,
	Failed,
	Closed,
	Status,
	Reopened,
	Dismissed,
	Updated,
	HandedOff,
}

impl MissionEventKind {
	pub const ALL: [MissionEventKind; 16] = [
		MissionEventKind::Opened,
		MissionEventKind::Note,
		MissionEventKind::AgentAsked,
		MissionEventKind::AgentStarted,
		MissionEventKind::AgentStopped,
		MissionEventKind::Answered,
		MissionEventKind::Escalated,
		MissionEventKind::Ready,
		MissionEventKind::ChecksFailed,
		MissionEventKind::Failed,
		MissionEventKind::Closed,
		MissionEventKind::Status,
		MissionEventKind::Reopened,
		MissionEventKind::Dismissed,
		MissionEventKind::Updated,
		MissionEventKind::HandedOff,
	];

	pub fn state(self) -> Option<MissionState> {
		match self {
			MissionEventKind::Opened | MissionEventKind::Answered | MissionEventKind::Reopened => {
				Some(MissionState::Working)
			}
			MissionEventKind::AgentAsked | MissionEventKind::ChecksFailed => {
				Some(MissionState::WaitingBot)
			}
			MissionEventKind::Escalated => Some(MissionState::WaitingHuman),
			MissionEventKind::Ready => Some(MissionState::ReadyToMerge),
			MissionEventKind::Failed => Some(MissionState::Failed),
			MissionEventKind::Closed => Some(MissionState::Done),
			MissionEventKind::Dismissed => Some(MissionState::Closed),
			MissionEventKind::Note
			| MissionEventKind::AgentStarted
			| MissionEventKind::AgentStopped
			| MissionEventKind::Status
			| MissionEventKind::Updated
			| MissionEventKind::HandedOff => None,
		}
	}

	pub fn closes(self) -> bool {
		matches!(self, MissionEventKind::Closed | MissionEventKind::Dismissed)
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MissionState {
	Working,
	WaitingBot,
	WaitingHuman,
	ReadyToMerge,
	Failed,
	Done,
	Closed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MissionLiveness {
	Idle,
	Working,
	NeedsYou,
	ReadyToMerge,
	Failed,
	Done,
	Closed,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct LivenessSigns {
	pub is_prompt_pending: bool,
	pub is_turn_running: bool,
}

impl MissionLiveness {
	pub fn observed(state: MissionState, signs: LivenessSigns) -> Self {
		let stored = match state {
			MissionState::ReadyToMerge => Self::ReadyToMerge,
			MissionState::Failed => Self::Failed,
			MissionState::Done => Self::Done,
			MissionState::Closed => Self::Closed,
			MissionState::WaitingHuman => Self::NeedsYou,
			MissionState::Working | MissionState::WaitingBot => Self::Idle,
		};
		stored.joined(signs)
	}

	pub fn joined(self, signs: LivenessSigns) -> Self {
		match self {
			Self::Idle | Self::Working if signs.is_prompt_pending => Self::NeedsYou,
			Self::Idle if signs.is_turn_running => Self::Working,
			held => held,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Ticket {
	pub platform: String,
	pub external_id: String,
	pub url: String,
	pub title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionDraft {
	pub origin_conversation_id: String,
	pub bot_id: String,
	pub objective: String,
	pub ticket: Ticket,
	pub tools: Vec<String>,
	pub source: String,
	#[serde(default)]
	pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionNote {
	pub source: String,
	#[specta(type = crate::json::JsonValue)]
	pub payload: Value,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "snake_case")]
pub enum MissionOutcome {
	Done,
	Failed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionClosing {
	pub source: String,
	pub outcome: MissionOutcome,
	pub summary: String,
}

impl MissionClosing {
	pub fn entry(&self) -> MissionEntry {
		MissionEntry {
			kind: match self.outcome {
				MissionOutcome::Done => MissionEventKind::Closed,
				MissionOutcome::Failed => MissionEventKind::Failed,
			},
			source: self.source.clone(),
			payload: serde_json::json!({ "outcome": self.outcome, "summary": self.summary }),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionEntry {
	pub kind: MissionEventKind,
	pub source: String,
	#[specta(type = crate::json::JsonValue)]
	pub payload: Value,
}

impl MissionEntry {
	pub fn of(kind: MissionEventKind, note: MissionNote) -> Self {
		Self { kind, source: note.source, payload: note.payload }
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Mission {
	pub id: String,
	pub origin_conversation_id: String,
	pub space_id: Option<String>,
	pub bot_id: String,
	pub thread_conversation_id: String,
	pub objective: String,
	pub ticket: Ticket,
	pub tools: Vec<String>,
	pub state: MissionState,
	pub state_seq: i64,
	pub is_agent_running: bool,
	#[specta(optional)]
	pub liveness: MissionLiveness,
	pub opened_at: i64,
	pub closed_at: Option<i64>,
	pub reported_at: Option<i64>,
	pub reported_turn_id: Option<String>,
	pub status: Option<MissionStatus>,
	pub last_activity_at: Option<i64>,
	pub last_activity: Option<MissionActivity>,
	pub commits_ahead: Option<i64>,
	pub dirty_files: Option<i64>,
	pub pull_request_url: Option<String>,
	pub branch: Option<String>,
	pub workspace_path: Option<String>,
}

impl Mission {
	pub fn needs_you(&self) -> bool {
		self.state == MissionState::WaitingHuman
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionActivity {
	pub tool: String,
	pub target: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CheckoutCounts {
	pub commits_ahead: i64,
	pub dirty_files: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionStatus {
	pub text: String,
	pub written_at: i64,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionEvent {
	pub id: String,
	pub mission_id: String,
	pub kind: MissionEventKind,
	pub source: String,
	#[specta(type = crate::json::JsonValue)]
	pub payload: Value,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissionUpdate {
	pub objective: Option<String>,
	pub ticket: Option<Ticket>,
	pub tools: Option<Vec<String>>,
}

impl MissionUpdate {
	pub fn fields(&self) -> Vec<&'static str> {
		[
			("objective", self.objective.is_some()),
			("ticket", self.ticket.is_some()),
			("tools", self.tools.is_some()),
		]
		.into_iter()
		.filter_map(|(field, is_given)| is_given.then_some(field))
		.collect()
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissionHandoff {
	pub from_bot_id: String,
	pub to_bot_id: String,
	pub source: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionWatch {
	pub branch: String,
	pub repository: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionOpened {
	pub mission: Mission,
	pub reach: String,
	pub carries_on: String,
	pub acknowledge: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionWatching {
	pub mission: Mission,
	pub url: String,
	pub key: String,
	pub header: String,
}

#[derive(Debug, Clone, PartialEq)]
pub enum MissionAnswer {
	Appended(Mission),
	Stale(Mission),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HookedMission {
	pub id: String,
	pub workspace_path: String,
	pub delivery_key: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WatchedMission {
	pub id: String,
	pub branch: String,
	pub repository: String,
	pub fingerprint: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionDetail {
	pub mission: Mission,
	pub events: Vec<MissionEvent>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MissionScope {
	Conversation(String),
	Space(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct MissionFilter {
	pub scope: MissionScope,
	pub state: Option<MissionState>,
	pub bot_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MissionRecord {
	pub mission: Mission,
	pub bot_name: String,
}

#[derive(Debug, Clone, PartialEq)]
pub struct MissionDossier {
	pub record: MissionRecord,
	pub repository: Option<String>,
	pub events: Vec<MissionEvent>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MissionInThread {
	pub mission: Mission,
	pub events: Vec<MissionEvent>,
	pub earlier_events: i64,
	pub workspace_path: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversationMissions {
	pub open: Vec<Mission>,
	pub done: Vec<Mission>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionOnBoard {
	pub mission: Mission,
	pub bot: Bot,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionInSpace {
	pub mission: Mission,
	pub conversation_id: String,
	pub conversation_title: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct MissionSpacePage {
	pub missions: Vec<MissionInSpace>,
	pub next_cursor: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum MissionError {
	#[serde(rename_all = "camelCase")]
	Unavailable { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	Storage { failure: StorageFailure },
	#[serde(rename_all = "camelCase")]
	UnknownMission { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownConversation { id: String },
	#[serde(rename_all = "camelCase")]
	MissionAlreadyClosed { id: String },
	#[serde(rename_all = "camelCase")]
	MissionStillOpen { id: String },
	#[serde(rename_all = "camelCase")]
	MissionAlreadyReported { id: String },
	#[serde(rename_all = "camelCase")]
	PullRequestMerged { id: String, pull_request: u64, url: Option<String> },
	#[serde(rename_all = "camelCase")]
	NothingToUpdate { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownCompanion { companion: String },
	#[serde(rename_all = "camelCase")]
	AmbiguousCompanion { companion: String, ids: Vec<String> },
	#[serde(rename_all = "camelCase")]
	AlreadyTheOwner { id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	UnknownTurn { id: String },
	#[serde(rename_all = "camelCase")]
	TurnOfAnotherConversation { turn_id: String, conversation_id: String },
	#[serde(rename_all = "camelCase")]
	UnknownBot { id: String },
	#[serde(rename_all = "camelCase")]
	UnknownParticipant { conversation_id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	BlankField { field: String },
	#[serde(rename_all = "camelCase")]
	MissionOfAnotherConversation { id: String, conversation_id: String },
	#[serde(rename_all = "camelCase")]
	MissionOfAnotherBot { id: String, bot_id: String },
	#[serde(rename_all = "camelCase")]
	ConversationOfAnotherSpace { id: String, space_id: String },
	#[serde(rename_all = "camelCase")]
	MissionOfAnotherSpace { id: String, space_id: String },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
	#[serde(rename_all = "camelCase")]
	UnreadableCursor { cursor: String },
}

impl From<DatabaseError> for MissionError {
	fn from(error: DatabaseError) -> Self {
		MissionError::Storage { failure: (&error).into() }
	}
}

impl From<rusqlite::Error> for MissionError {
	fn from(error: rusqlite::Error) -> Self {
		MissionError::from(DatabaseError::Sqlite(error))
	}
}

impl From<ConversationError> for MissionError {
	fn from(error: ConversationError) -> Self {
		match error {
			ConversationError::Database(failure) => MissionError::from(failure),
			ConversationError::UnknownBot { id } => MissionError::UnknownBot { id },
			ConversationError::UnknownConversation { id } => {
				MissionError::UnknownConversation { id }
			}
			ConversationError::UnknownParticipant { conversation_id, bot_id } => {
				MissionError::UnknownParticipant { conversation_id, bot_id }
			}
			other => MissionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<CompanionError> for MissionError {
	fn from(error: CompanionError) -> Self {
		match error {
			CompanionError::UnknownCompanion { companion } => {
				MissionError::UnknownCompanion { companion }
			}
			CompanionError::AmbiguousCompanion { companion, ids } => {
				MissionError::AmbiguousCompanion { companion, ids }
			}
			other => MissionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<TranscriptStoreError> for MissionError {
	fn from(error: TranscriptStoreError) -> Self {
		match error {
			TranscriptStoreError::Unavailable { failure } => MissionError::Unavailable { failure },
			TranscriptStoreError::UnknownBot { id } => MissionError::UnknownBot { id },
			TranscriptStoreError::Storage { failure } => MissionError::Storage { failure },
			other => MissionError::Unexpected { detail: format!("{other:?}") },
		}
	}
}

impl From<MissionError> for TranscriptStoreError {
	fn from(error: MissionError) -> Self {
		match error {
			MissionError::Unavailable { failure } => TranscriptStoreError::Unavailable { failure },
			MissionError::Storage { failure } => TranscriptStoreError::Storage { failure },
			MissionError::UnknownBot { id } => TranscriptStoreError::UnknownBot { id },
			MissionError::UnknownConversation { id } => {
				TranscriptStoreError::UnknownConversation { id }
			}
			MissionError::UnknownParticipant { conversation_id, bot_id } => {
				TranscriptStoreError::UnknownParticipant { conversation_id, bot_id }
			}
			other => TranscriptStoreError::UnreadableHistory { detail: format!("{other:?}") },
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const NOTHING: LivenessSigns =
		LivenessSigns { is_prompt_pending: false, is_turn_running: false };

	const PROMPTED: LivenessSigns =
		LivenessSigns { is_prompt_pending: true, is_turn_running: false };

	const RUNNING: LivenessSigns =
		LivenessSigns { is_prompt_pending: false, is_turn_running: true };

	const EVERYTHING: LivenessSigns =
		LivenessSigns { is_prompt_pending: true, is_turn_running: true };

	const OPEN: [MissionState; 2] = [MissionState::Working, MissionState::WaitingBot];

	#[test]
	fn each_sign_alone_on_an_open_mission_reads_its_own_word() {
		for state in OPEN {
			assert_eq!(
				[NOTHING, PROMPTED, RUNNING].map(|signs| MissionLiveness::observed(state, signs)),
				[MissionLiveness::Idle, MissionLiveness::NeedsYou, MissionLiveness::Working],
				"{state:?}"
			);
		}
		assert_eq!(
			MissionLiveness::observed(MissionState::WaitingHuman, NOTHING),
			MissionLiveness::NeedsYou,
			"an unanswered escalation did not read needs you"
		);
	}

	#[test]
	fn needs_you_outranks_working_which_outranks_idle() {
		for state in OPEN {
			assert_eq!(MissionLiveness::observed(state, EVERYTHING), MissionLiveness::NeedsYou);
		}
		assert_eq!(
			MissionLiveness::observed(MissionState::WaitingHuman, RUNNING),
			MissionLiveness::NeedsYou
		);
		assert_eq!(
			[
				MissionLiveness::Idle.joined(RUNNING),
				MissionLiveness::Working.joined(PROMPTED),
				MissionLiveness::NeedsYou.joined(RUNNING),
				MissionLiveness::Working.joined(NOTHING),
			],
			[
				MissionLiveness::Working,
				MissionLiveness::NeedsYou,
				MissionLiveness::NeedsYou,
				MissionLiveness::Working,
			],
			"a sign joined from the thread did not keep the precedence"
		);
	}

	#[test]
	fn a_terminal_state_wins_over_every_sign() {
		let terminal = [
			(MissionState::ReadyToMerge, MissionLiveness::ReadyToMerge),
			(MissionState::Failed, MissionLiveness::Failed),
			(MissionState::Done, MissionLiveness::Done),
			(MissionState::Closed, MissionLiveness::Closed),
		];
		for (state, word) in terminal {
			for signs in [NOTHING, PROMPTED, RUNNING, EVERYTHING] {
				let observed = MissionLiveness::observed(state, signs);
				assert_eq!(observed, word, "{state:?} under {signs:?}");
				assert_eq!(observed.joined(EVERYTHING), word, "{state:?} joined a thread");
			}
		}
	}

	#[test]
	fn the_liveness_is_written_as_its_snake_case_word() {
		let words = [
			MissionLiveness::Idle,
			MissionLiveness::Working,
			MissionLiveness::NeedsYou,
			MissionLiveness::ReadyToMerge,
			MissionLiveness::Failed,
			MissionLiveness::Done,
			MissionLiveness::Closed,
		]
		.map(|liveness| serde_json::to_value(liveness).expect("it serialises"));
		assert_eq!(
			words,
			["idle", "working", "needs_you", "ready_to_merge", "failed", "done", "closed"]
				.map(serde_json::Value::from)
		);
	}
}
