use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use super::contract::{Mission, MissionChanged, MissionError, MissionLiveness, MissionPresence};
use crate::agent::commands::AgentState;
use crate::conversations::state as conversation_state;
use crate::db;
use crate::events::MISSION_CHANGED;

#[derive(Debug, Clone, PartialEq, Eq)]
struct Pulse {
	is_agent_running: bool,
	presence: MissionPresence,
}

impl Pulse {
	fn of(mission: &Mission) -> Self {
		Self { is_agent_running: mission.is_agent_running, presence: MissionPresence::of(mission) }
	}
}

#[derive(Default)]
pub struct AnnouncedLiveness(Mutex<HashMap<String, Pulse>>);

impl AnnouncedLiveness {
	fn kept(&self) -> MutexGuard<'_, HashMap<String, Pulse>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub(crate) fn observed(core: &crate::core_context::Core, mission: Mission) -> Mission {
	let stored = MissionPresence::of(&mission);
	let present = present(core, &mission.thread_conversation_id, &mission.bot_id, stored);
	Mission {
		liveness: present.liveness,
		pending_prompt: present.pending_prompt,
		working_bot_ids: present.working_bot_ids,
		..mission
	}
}

pub(crate) fn present(
	core: &crate::core_context::Core,
	thread_conversation_id: &str,
	bot_id: &str,
	stored: MissionPresence,
) -> MissionPresence {
	let Some(agent) = core.try_state::<AgentState>() else {
		return stored;
	};
	let thread = agent.thread_signs(thread_conversation_id);
	let liveness = stored.liveness.joined(thread);
	let pending_prompt = agent
		.thread_prompt(thread_conversation_id)
		.or(stored.pending_prompt)
		.filter(|_| liveness == MissionLiveness::NeedsYou);
	let working_bot_ids = match thread.is_turn_running {
		true => vec![bot_id.to_owned()],
		false => Vec::new(),
	};
	MissionPresence { liveness, pending_prompt, working_bot_ids }
}

pub(super) fn observed_all(
	core: &crate::core_context::Core,
	missions: Vec<Mission>,
) -> Vec<Mission> {
	missions.into_iter().map(|mission| observed(core, mission)).collect()
}

pub(super) fn announce_change(
	core: &crate::core_context::Core,
	mission: Mission,
) -> Result<Mission, MissionError> {
	announce_when(core, mission, |_, _| true)
}

pub(super) fn announce_when(
	core: &crate::core_context::Core,
	mission: Mission,
	is_news: impl FnOnce(&Mission, bool) -> bool,
) -> Result<Mission, MissionError> {
	let unmanaged = AnnouncedLiveness::default();
	let announced = core.try_state::<AnnouncedLiveness>();
	let mut kept = announced.as_deref().unwrap_or(&unmanaged).kept();
	let mission = observed(core, mission);
	let has_pulse_moved = kept.get(&mission.id) != Some(&Pulse::of(&mission));
	if is_news(&mission, has_pulse_moved) {
		conversation_state::observe_later(core, mission.origin_conversation_id.clone());
		emit_change(core, &mission)?;
	}
	match mission.closed_at {
		Some(_) => kept.remove(&mission.id),
		None => kept.insert(mission.id.clone(), Pulse::of(&mission)),
	};
	Ok(mission)
}

pub(crate) async fn announce_thread_moved(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: String,
) -> Result<(), MissionError> {
	let Some(threaded) = database.missions().threaded(conversation_id).await? else {
		return Ok(());
	};
	announce_when(core, threaded, |mission, has_pulse_moved| {
		mission.closed_at.is_none() && has_pulse_moved
	})?;
	Ok(())
}

fn emit_change(core: &crate::core_context::Core, mission: &Mission) -> Result<(), MissionError> {
	core.emit(
		MISSION_CHANGED,
		MissionChanged {
			mission_id: mission.id.clone(),
			space_id: mission.space_id.clone(),
			state: mission.state,
			state_seq: mission.state_seq,
			is_agent_running: mission.is_agent_running,
			liveness: mission.liveness,
			pending_prompt: mission.pending_prompt.clone(),
			working_bot_ids: mission.working_bot_ids.clone(),
			last_activity_at: mission.last_activity_at,
		},
	)
	.map_err(|error| MissionError::Undeliverable { detail: error.to_string() })
}
