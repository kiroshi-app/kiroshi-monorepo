use std::rc::Rc;

use kiroshi_core::missions::contract::{Mission, MissionInSpace, MissionState};
use kiroshi_rune_kit::strings::chat;
use kiroshi_rune_kit::surfaces::s04_boot::notice::{
	InlineNotice, NoticeRetry, Tone, inline_notice,
};
use kiroshi_rune_kit::surfaces::s08_missions::{
	self as kit, Bot, Emit, Header, ListEnd, OpenMenu, PanelMission, PullRequest, Status, Ticket,
	ToolCall, mission_header, mission_header_skeleton, mission_menu, missions_feed_skeleton,
	missions_panel, panel_frame,
};
use kiroshi_rune_kit::tokens::Tokens;
use rune::{El, col};

use super::feed::{grouped, is_working, shown_state};
use super::menu::menu_facts;
use super::{
	Detail, Feed, LANGUAGE, Opened, Panel, detail_noticed, emitted, failure_text, known,
	panel_noticed, said,
};
use crate::app::App;
use crate::conversations::{now_ms, roster_timestamp};
use crate::host::HostError;

const FEED_SKELETON_HEIGHT: f32 = 960.0;

pub fn kit_state(state: MissionState) -> kit::MissionState {
	match state {
		MissionState::Working => kit::MissionState::Working,
		MissionState::WaitingBot => kit::MissionState::WaitingBot,
		MissionState::WaitingHuman => kit::MissionState::WaitingHuman,
		MissionState::ReadyToMerge => kit::MissionState::ReadyToMerge,
		MissionState::Failed => kit::MissionState::Failed,
		MissionState::Done => kit::MissionState::Done,
		MissionState::Closed => kit::MissionState::Closed,
	}
}

fn emit() -> Emit<App> {
	Rc::new(emitted)
}

fn bot_of<'a>(app: &'a App, bot_id: &'a str) -> Bot<'a> {
	let agent = app.ready().and_then(|ready| ready.agents.iter().find(|agent| agent.id == bot_id));
	match agent {
		Some(agent) => {
			Bot { id: &agent.id, name: &agent.name, title: &agent.title, hue: agent.avatar_blot }
		}
		None => Bot {
			id: bot_id,
			name: chat::transcript::mention::UNKNOWN.text(LANGUAGE),
			title: "",
			hue: None,
		},
	}
}

fn pull_request_of(mission: &Mission) -> Option<PullRequest<'_>> {
	let url = mission.pull_request_url.as_deref()?;
	let (_, number) = url.trim_end_matches('/').rsplit_once("/pull/")?;
	Some(PullRequest { url, number: number.parse().ok()? })
}

fn ticket_of(mission: &Mission) -> Ticket<'_> {
	let ticket = &mission.ticket;
	Ticket {
		platform: &ticket.platform,
		external_id: &ticket.external_id,
		title: &ticket.title,
		url: &ticket.url,
	}
}

fn status_of(mission: &Mission) -> Option<Status<'_>> {
	mission
		.status
		.as_ref()
		.map(|status| Status { text: &status.text, written_at: status.written_at })
}

fn commits_ahead_of(mission: &Mission) -> u32 {
	mission.commits_ahead.and_then(|count| u32::try_from(count).ok()).unwrap_or(0)
}

fn stamp_of(mission: &Mission, now: i64) -> String {
	let at = mission.closed_at.or(mission.last_activity_at).unwrap_or(mission.opened_at);
	roster_timestamp(at, now)
}

struct Drawn<'a> {
	entry: &'a MissionInSpace,
	bot: Bot<'a>,
	stamp: String,
	tools: Vec<&'a str>,
}

impl<'a> Drawn<'a> {
	fn of(app: &'a App, entry: &'a MissionInSpace, now: i64) -> Drawn<'a> {
		let mission = &entry.mission;
		Drawn {
			entry,
			bot: bot_of(app, &mission.bot_id),
			stamp: stamp_of(mission, now),
			tools: mission.tools.iter().map(String::as_str).collect(),
		}
	}

	fn shown(&'a self, clock_ms: f64, now: i64) -> PanelMission<'a> {
		let mission = &self.entry.mission;
		let shown = kit::Mission {
			id: &mission.id,
			bot: self.bot,
			objective: &mission.objective,
			ticket: ticket_of(mission),
			tools: &self.tools,
			state: kit_state(shown_state(mission)),
			is_working: is_working(mission),
			is_closed: mission.closed_at.is_some(),
			timestamp: &self.stamp,
			now: Some(now),
			clock_ms,
			status: status_of(mission),
			commits_ahead: commits_ahead_of(mission),
			pull_request: pull_request_of(mission),
			last_activity: mission
				.last_activity
				.as_ref()
				.map(|activity| ToolCall { tool: &activity.tool, target: &activity.target }),
		};
		PanelMission { mission: shown, conversation: &self.entry.conversation_id }
	}
}

fn failure_notice<'a>(title: &'a str, reason: &'a str, retry: &'a str) -> InlineNotice<'a> {
	InlineNotice {
		tone: Tone::Error,
		title,
		description: Some(reason),
		retry: Some(NoticeRetry { label: Some(retry), busy: false }),
		dismissible: false,
	}
}

fn feed_failure(t: &Tokens, failure: &HostError) -> El {
	let reason = failure_text(failure);
	let notice = failure_notice(
		chat::activity::failure::missions::TITLE.text(LANGUAGE),
		&reason,
		chat::notice::RETRY.text(LANGUAGE),
	);
	inline_notice(t, LANGUAGE, &notice, panel_noticed)
}

fn shown_feed(app: &App, t: &Tokens, entries: &[MissionInSpace], closed_since: i64) -> El {
	let now = now_ms();
	let groups = grouped(entries, closed_since);
	let drawn_open: Vec<Drawn> =
		groups.open.into_iter().map(|entry| Drawn::of(app, entry, now)).collect();
	let drawn_earlier: Vec<Drawn> =
		groups.earlier_today.into_iter().map(|entry| Drawn::of(app, entry, now)).collect();
	let open: Vec<PanelMission> =
		drawn_open.iter().map(|drawn| drawn.shown(app.clock_ms, now)).collect();
	let earlier_today: Vec<PanelMission> =
		drawn_earlier.iter().map(|drawn| drawn.shown(app.clock_ms, now)).collect();
	let shown = kit::Panel {
		open: &open,
		earlier_today: &earlier_today,
		open_mission: app.mission.as_ref().map(|opened| opened.mission_id.as_str()),
		is_earlier_today_open: app.surfaces.s08_missions.is_earlier_today_open,
		list_end: ListEnd::Complete,
	};
	missions_panel(t, LANGUAGE, &shown, &emit())
}

pub fn panel(app: &App, t: &Tokens) -> El {
	let missions = &app.surfaces.s08_missions;
	let body = match missions.panel.as_ref() {
		Some(Panel { feed: Feed::Failed(failure), .. }) => feed_failure(t, failure),
		Some(Panel { feed: Feed::Shown(entries), closed_since, .. }) => {
			shown_feed(app, t, entries, *closed_since)
		}
		None | Some(Panel { feed: Feed::Loading, .. }) => {
			missions_feed_skeleton(t, FEED_SKELETON_HEIGHT)
		}
	};
	panel_frame(t, body)
}

fn detail_failure(t: &Tokens, failure: &HostError) -> El {
	let reason =
		format!("{} {}", said(chat::missions::failure::read::DESCRIPTION), failure_text(failure));
	let notice = failure_notice(
		chat::missions::failure::read::TITLE.text(LANGUAGE),
		&reason,
		chat::notice::RETRY.text(LANGUAGE),
	);
	col().w_full().child(mission_header_skeleton(t, LANGUAGE, &emit())).child(inline_notice(
		t,
		LANGUAGE,
		&notice,
		detail_noticed,
	))
}

fn read_header(app: &App, t: &Tokens, opened: &Opened, mission: &Mission) -> El {
	let tools: Vec<&str> = mission.tools.iter().map(String::as_str).collect();
	let shown = Header {
		bot: bot_of(app, &opened.bot_id),
		objective: &mission.objective,
		ticket: ticket_of(mission),
		tools: &tools,
		state: kit_state(shown_state(mission)),
		is_working: is_working(mission),
		clock_ms: app.clock_ms,
		opened_at: mission.opened_at,
		now: now_ms(),
		status: status_of(mission),
		commits_ahead: commits_ahead_of(mission),
		pull_request: pull_request_of(mission),
	};
	mission_header(t, LANGUAGE, &shown, &emit())
}

pub fn header(app: &App, t: &Tokens, opened: &Opened) -> El {
	match &opened.detail {
		Detail::Loading => mission_header_skeleton(t, LANGUAGE, &emit()),
		Detail::Failed(failure) => detail_failure(t, failure),
		Detail::Read(detail) => read_header(app, t, opened, &detail.mission),
	}
}

pub fn shown_menu(app: &App) -> Option<OpenMenu<'_>> {
	let held = app.surfaces.s08_missions.menu.as_ref()?;
	let mission = known(app, &held.mission_id)?;
	Some(OpenMenu {
		mission: &held.mission_id,
		source: held.source,
		at: held.at,
		facts: menu_facts(mission),
		is_copy_shown: held.is_copy_shown,
	})
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	shown_menu(app).map(|menu| mission_menu(t, LANGUAGE, &menu, &emit())).unwrap_or_default()
}
