use std::cmp::Reverse;

use chrono::{Local, Offset, TimeZone};
use kiroshi_core::missions::contract::{
	LivenessSigns, Mission, MissionInSpace, MissionLiveness, MissionState,
};

use crate::model;

#[derive(Clone, Copy, PartialEq, Eq)]
enum Group {
	WaitingOnYou,
	InProgress,
	EarlierToday,
}

pub struct Groups<'a> {
	pub open: Vec<&'a MissionInSpace>,
	pub earlier_today: Vec<&'a MissionInSpace>,
}

pub fn start_of_day(now: i64) -> i64 {
	start_of_day_in(&Local, now)
}

pub fn start_of_day_in<Zone: TimeZone>(zone: &Zone, now: i64) -> i64 {
	let Some(at) = zone.timestamp_millis_opt(now).earliest() else { return now };
	let Some(midnight) = at.date_naive().and_hms_opt(0, 0, 0) else { return now };
	match midnight.and_local_timezone(zone.clone()).earliest() {
		Some(start) => start.timestamp_millis(),
		None => (midnight - at.offset().fix()).and_utc().timestamp_millis(),
	}
}

pub fn shown_state(mission: &Mission) -> MissionState {
	match mission.liveness {
		MissionLiveness::Idle => mission.state,
		MissionLiveness::Working => MissionState::Working,
		MissionLiveness::NeedsYou => MissionState::WaitingHuman,
		MissionLiveness::ReadyToMerge => MissionState::ReadyToMerge,
		MissionLiveness::Failed => MissionState::Failed,
		MissionLiveness::Done => MissionState::Done,
		MissionLiveness::Closed => MissionState::Closed,
	}
}

pub fn is_working(mission: &Mission) -> bool {
	mission.liveness == MissionLiveness::Working
}

pub fn moved(mission: &mut Mission, changed: &model::MissionChanged) {
	mission.state = core_state(changed.state);
	mission.state_seq = changed.state_seq;
	mission.is_agent_running = changed.is_agent_running;
	mission.status.clone_from(&changed.status);
	let signs = LivenessSigns {
		is_prompt_pending: mission.pending_prompt.is_some(),
		is_turn_running: changed.is_agent_running,
	};
	mission.liveness = MissionLiveness::observed(mission.state, signs);
}

fn core_state(state: model::MissionState) -> MissionState {
	match state {
		model::MissionState::Working => MissionState::Working,
		model::MissionState::WaitingBot => MissionState::WaitingBot,
		model::MissionState::WaitingHuman => MissionState::WaitingHuman,
		model::MissionState::ReadyToMerge => MissionState::ReadyToMerge,
		model::MissionState::Failed => MissionState::Failed,
		model::MissionState::Done => MissionState::Done,
		model::MissionState::Closed => MissionState::Closed,
	}
}

fn group_of(state: MissionState) -> Group {
	match state {
		MissionState::WaitingHuman => Group::WaitingOnYou,
		MissionState::Working | MissionState::WaitingBot | MissionState::ReadyToMerge => {
			Group::InProgress
		}
		MissionState::Done | MissionState::Failed | MissionState::Closed => Group::EarlierToday,
	}
}

fn last_moved_at(mission: &Mission) -> i64 {
	mission.opened_at.max(mission.last_activity_at.unwrap_or(0)).max(mission.closed_at.unwrap_or(0))
}

fn is_shown(mission: &Mission, closed_since: i64) -> bool {
	group_of(shown_state(mission)) != Group::EarlierToday
		|| mission.closed_at.is_none_or(|closed_at| closed_at >= closed_since)
}

pub fn grouped(entries: &[MissionInSpace], closed_since: i64) -> Groups<'_> {
	let mut shown: Vec<&MissionInSpace> =
		entries.iter().filter(|entry| is_shown(&entry.mission, closed_since)).collect();
	shown.sort_by_key(|entry| Reverse(last_moved_at(&entry.mission)));
	let held_in = |group: Group| {
		shown.iter().copied().filter(move |entry| group_of(shown_state(&entry.mission)) == group)
	};
	Groups {
		open: held_in(Group::WaitingOnYou).chain(held_in(Group::InProgress)).collect(),
		earlier_today: held_in(Group::EarlierToday).collect(),
	}
}
