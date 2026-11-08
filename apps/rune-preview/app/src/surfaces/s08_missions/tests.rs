use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::missions::contract::{
	Mission, MissionDetail, MissionEvent, MissionEventKind, MissionInSpace, MissionLiveness,
	MissionState, MissionStatus, Ticket,
};
use kiroshi_rune_kit::surfaces::s04_boot::notice::NoticeKind;
use kiroshi_rune_kit::surfaces::s08_missions::{
	self as kit, CopyKind, EventKind, MenuAction, MenuSource, MissionsEvent,
};
use rune::PointerPress;
use serde_json::json;

use chrono::{FixedOffset, TimeZone};

use super::feed::{grouped, start_of_day, start_of_day_in};
use super::view::shown_menu;
use super::worker::{Answer, Call, Command};
use super::{
	Detail, Effect, Feed, State, back, changed, emitted, is_summons, landed, menu_facts, open,
	refused_before_leaving, show, thread_events,
};
use crate::app::{App, Pane, Person, Ready, Workspace};
use crate::conversations::now_ms;
use crate::host::{self, Host, HostError, Profile};
use crate::model;
use crate::source::Source;

const SPACE: &str = "perso";

const HOUR: i64 = 3_600_000;

fn mission(id: &str, state: MissionState, at: i64) -> Mission {
	Mission {
		id: id.to_owned(),
		origin_conversation_id: "room".to_owned(),
		space_id: Some(SPACE.to_owned()),
		bot_id: "atlas".to_owned(),
		thread_conversation_id: format!("thread-{id}"),
		objective: format!("objective of {id}"),
		ticket: Ticket {
			platform: "linear".to_owned(),
			external_id: format!("OPE-{id}"),
			url: String::new(),
			title: String::new(),
		},
		tools: vec!["GitHub".to_owned()],
		state,
		state_seq: 1,
		is_agent_running: false,
		liveness: MissionLiveness::Idle,
		pending_prompt: None,
		working_bot_ids: Vec::new(),
		opened_at: at,
		closed_at: None,
		reported_at: None,
		reported_turn_id: None,
		status: None,
		last_activity_at: None,
		last_activity: None,
		commits_ahead: None,
		dirty_files: None,
		pull_request_url: None,
		branch: None,
		workspace_path: None,
	}
}

fn closed(id: &str, state: MissionState, closed_at: i64) -> Mission {
	Mission { closed_at: Some(closed_at), ..mission(id, state, closed_at - HOUR) }
}

fn in_space(mission: Mission) -> MissionInSpace {
	MissionInSpace {
		conversation_id: mission.origin_conversation_id.clone(),
		conversation_title: "Room".to_owned(),
		mission,
	}
}

fn conversation(id: &str) -> model::Conversation {
	model::Conversation {
		id: id.to_owned(),
		title: id.to_owned(),
		color: None,
		participants: vec![model::Participant {
			bot_id: "atlas".to_owned(),
			name: "Atlas".to_owned(),
			avatar_blot: None,
			left_at: None,
			is_deleted: false,
		}],
		last_activity_at: None,
		last_word: None,
		solo_bot_id: None,
	}
}

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space { id: SPACE.to_owned(), name: SPACE.to_owned(), colour: None },
		agents: vec![model::Agent {
			id: "atlas".to_owned(),
			name: "Atlas".to_owned(),
			title: "Builder".to_owned(),
			avatar_blot: None,
		}],
		conversations: vec![conversation("room"), conversation("elsewhere")],
		person: Person::Unread,
		longest: None,
	});
	app
}

fn state(app: &App) -> &State {
	&app.surfaces.s08_missions
}

fn last_call(app: &App) -> Option<&Call> {
	state(app).queued.last()
}

fn chosen(app: &mut App, mission: &str, action: MenuAction) {
	emitted(app, MissionsEvent::MenuChosen { mission: mission.to_owned(), action });
}

fn copied(app: &mut App, mission: &str, kind: CopyKind) {
	emitted(app, MissionsEvent::MenuCopied { mission: mission.to_owned(), kind });
}

fn request_menu(app: &mut App, mission: &str, source: MenuSource, x: f32) {
	let at = PointerPress { x, y: 40.0 };
	emitted(app, MissionsEvent::MenuRequested { mission: mission.to_owned(), source, at });
}

fn shown_panel(entries: Vec<Mission>) -> App {
	let mut app = ready_app();
	app.pane = Pane::Missions;
	show(&mut app);
	let Some(Call::Feed { space_id, closed_since }) = state(&app).queued.last() else {
		panic!("the feed was asked for")
	};
	let (space_id, closed_since) = (space_id.clone(), *closed_since);
	let feed = Ok(entries.into_iter().map(in_space).collect());
	landed(&mut app, Answer::Feed { space_id, closed_since, feed });
	app.surfaces.s08_missions.queued.clear();
	app
}

fn listed_state(app: &App, id: &str) -> Option<MissionState> {
	state(app).listed(id).map(|mission| mission.state)
}

fn detail_of(mission: Mission) -> MissionDetail {
	MissionDetail { mission, events: Vec::new() }
}

fn read_detail(app: &mut App, mission: Mission) {
	let mission_id = mission.id.clone();
	landed(app, Answer::Detail { mission_id, detail: Ok(detail_of(mission)) });
}

fn refused(command: &str) -> HostError {
	HostError::CommandFailed { command: command.to_owned(), status: 500, body: "refused".into() }
}

fn notice_titles(app: &App) -> Vec<&str> {
	state(app).notices.iter().map(|notice| notice.title.as_str()).collect()
}

fn change_of(mission_id: &str, state: model::MissionState) -> model::MissionChanged {
	model::MissionChanged {
		mission_id: mission_id.to_owned(),
		state,
		is_agent_running: false,
		status: None,
	}
}

fn feed_calls(app: &App) -> usize {
	state(app).queued.iter().filter(|call| matches!(call, Call::Feed { .. })).count()
}

fn answer_feed(app: &mut App, feed: Result<Vec<Mission>, HostError>) {
	let asked = app.surfaces.s08_missions.queued.drain(..).rev().find_map(|call| match call {
		Call::Feed { space_id, closed_since } => Some((space_id, closed_since)),
		Call::Detail(_) | Call::Write { .. } | Call::Stop { .. } => None,
	});
	let Some((space_id, closed_since)) = asked else { panic!("the feed was asked for") };
	let feed = feed.map(|missions| missions.into_iter().map(in_space).collect());
	landed(app, Answer::Feed { space_id, closed_since, feed });
}

fn ids(entries: &[&MissionInSpace]) -> Vec<String> {
	entries.iter().map(|entry| entry.mission.id.clone()).collect()
}

#[test]
fn opening_the_panel_reads_the_feed_of_the_shown_space_since_the_start_of_the_day() {
	let mut app = ready_app();
	app.pane = Pane::Missions;
	show(&mut app);
	assert_eq!(
		last_call(&app),
		Some(&Call::Feed { space_id: SPACE.to_owned(), closed_since: start_of_day(now_ms()) })
	);
	assert!(matches!(state(&app).feed(), Some(Feed::Loading)));
}

#[test]
fn the_panel_reads_nothing_while_the_conversations_are_shown() {
	let mut app = ready_app();
	app.pane = Pane::Conversations;
	super::follow_shown_space(&mut app);
	assert!(state(&app).queued.is_empty());
	assert!(state(&app).feed().is_none());
}

#[test]
fn a_failed_feed_shows_its_reason_and_a_retry_reads_it_again() {
	let mut app = ready_app();
	app.pane = Pane::Missions;
	show(&mut app);
	let Some(Call::Feed { space_id, closed_since }) = app.surfaces.s08_missions.queued.pop() else {
		panic!("the feed was asked for")
	};
	let feed = Err(refused("mission_space_feed"));
	landed(&mut app, Answer::Feed { space_id, closed_since, feed });
	let Some(Feed::Failed(failure)) = state(&app).feed() else { panic!("the failure is shown") };
	assert_eq!(
		super::failure_text(failure),
		"Kiroshi refused the call: mission_space_feed answered 500: refused"
	);
	show(&mut app);
	assert!(matches!(state(&app).feed(), Some(Feed::Loading)));
	assert!(matches!(last_call(&app), Some(Call::Feed { .. })));
}

#[test]
fn an_empty_feed_is_shown_as_read_with_nothing_in_either_group() {
	let app = shown_panel(Vec::new());
	let Some(Feed::Shown(entries)) = state(&app).feed() else { panic!("the feed is read") };
	let groups = grouped(entries, 0);
	assert!(groups.open.is_empty() && groups.earlier_today.is_empty());
}

#[test]
fn the_feed_groups_and_orders_missions_as_missions_model_does() {
	let today = start_of_day(now_ms());
	let entries: Vec<MissionInSpace> = [
		mission("working-old", MissionState::Working, today - 10 * HOUR),
		mission("waiting", MissionState::WaitingHuman, today - 20 * HOUR),
		mission("ready", MissionState::ReadyToMerge, today - HOUR),
		Mission {
			liveness: MissionLiveness::NeedsYou,
			..mission("asking", MissionState::Working, today - 30 * HOUR)
		},
		closed("done-today", MissionState::Done, today + HOUR),
		closed("failed-today", MissionState::Failed, today + 2 * HOUR),
		closed("closed-yesterday", MissionState::Closed, today - HOUR),
	]
	.into_iter()
	.map(in_space)
	.collect();
	let groups = grouped(&entries, today);
	assert_eq!(ids(&groups.open), vec!["waiting", "asking", "ready", "working-old"]);
	assert_eq!(ids(&groups.earlier_today), vec!["failed-today", "done-today"]);
}

#[test]
fn the_earlier_today_fold_starts_folded_and_toggles() {
	let mut app = shown_panel(Vec::new());
	assert!(!state(&app).is_earlier_today_open);
	emitted(&mut app, MissionsEvent::ToggleEarlierToday);
	assert!(state(&app).is_earlier_today_open);
}

#[test]
fn pressing_a_row_opens_the_mission_thread_and_reads_its_detail_behind_a_skeleton() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	app.open("elsewhere");
	emitted(
		&mut app,
		MissionsEvent::Open { mission: "m-1".to_owned(), conversation: Some("room".to_owned()) },
	);
	let opened = app.mission.as_ref().expect("the mission is open");
	assert!(matches!(opened.detail, Detail::Loading));
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.as_str()),
		Some("thread-m-1")
	);
	assert_eq!(last_call(&app), Some(&Call::Detail("m-1".to_owned())));
	read_detail(&mut app, mission("m-1", MissionState::Working, 1));
	let opened = app.mission.as_ref().expect("the mission is open");
	assert_eq!(
		opened.mission().map(|mission| mission.objective.as_str()),
		Some("objective of m-1")
	);
}

#[test]
fn pressing_a_mission_card_opens_it_from_the_conversation() {
	let mut app = ready_app();
	app.open("room");
	let card: model::Mission = serde_json::from_value(json!({
		"id": "m-card", "originConversationId": "room", "botId": "atlas",
		"threadConversationId": "thread-card", "objective": "Ship it", "ticket": {},
		"tools": [], "state": "working", "isAgentRunning": true, "openedAt": 1,
		"status": null, "lastActivity": null, "commitsAhead": null, "pullRequestUrl": null,
	}))
	.expect("a card fixture");
	app.thread.as_mut().expect("the room is open").missions.push(card);
	emitted(&mut app, MissionsEvent::Open { mission: "m-card".to_owned(), conversation: None });
	assert_eq!(app.mission.as_ref().map(|opened| opened.mission_id.as_str()), Some("m-card"));
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.as_str()),
		Some("thread-card")
	);
}

#[test]
fn a_failed_detail_read_shows_the_failure_and_a_failed_reread_keeps_the_header() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	open(&mut app, &super::Opening::of(&mission("m-1", MissionState::Working, 1)));
	let failure = Err(refused("mission_detail"));
	landed(&mut app, Answer::Detail { mission_id: "m-1".to_owned(), detail: failure });
	assert!(matches!(app.mission.as_ref().map(|opened| &opened.detail), Some(Detail::Failed(_))));
	read_detail(&mut app, mission("m-1", MissionState::Working, 1));
	let failure = Err(refused("mission_detail"));
	landed(&mut app, Answer::Detail { mission_id: "m-1".to_owned(), detail: failure });
	assert!(app.mission.as_ref().and_then(super::Opened::mission).is_some());
	assert_eq!(notice_titles(&app), vec!["Couldn’t load this mission"]);
}

#[test]
fn back_returns_to_the_conversation_the_mission_was_opened_from() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	app.open("elsewhere");
	emitted(
		&mut app,
		MissionsEvent::Open { mission: "m-1".to_owned(), conversation: Some("room".to_owned()) },
	);
	emitted(&mut app, MissionsEvent::Back);
	assert!(app.mission.is_none());
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.as_str()),
		Some("elsewhere")
	);
}

#[test]
fn back_without_a_shown_conversation_returns_to_the_origin_of_the_mission() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	emitted(
		&mut app,
		MissionsEvent::Open { mission: "m-1".to_owned(), conversation: Some("room".to_owned()) },
	);
	back(&mut app);
	assert_eq!(app.thread.as_ref().map(|thread| thread.conversation_id.as_str()), Some("room"));
}

#[test]
fn a_mission_change_moves_the_panel_the_header_and_the_cards_then_rereads_the_detail() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	open(&mut app, &super::Opening::of(&mission("m-1", MissionState::Working, 1)));
	read_detail(&mut app, mission("m-1", MissionState::Working, 1));
	app.surfaces.s08_missions.queued.clear();
	let change = model::MissionChanged {
		mission_id: "m-1".to_owned(),
		state: model::MissionState::WaitingHuman,
		is_agent_running: false,
		status: None,
	};
	changed(&mut app, &change);
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::WaitingHuman));
	let header = app.mission.as_ref().and_then(super::Opened::mission).expect("a read header");
	assert_eq!(
		(header.state, header.liveness),
		(MissionState::WaitingHuman, MissionLiveness::NeedsYou)
	);
	assert_eq!(last_call(&app), Some(&Call::Detail("m-1".to_owned())));
}

#[test]
fn a_running_agent_reads_as_working_once_its_change_arrives() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::WaitingBot, 1)]);
	let change = model::MissionChanged {
		mission_id: "m-1".to_owned(),
		state: model::MissionState::WaitingBot,
		is_agent_running: true,
		status: None,
	};
	changed(&mut app, &change);
	let listed = state(&app).listed("m-1").expect("listed");
	assert!(super::feed::is_working(listed));
	assert!(super::is_animating(&app));
}

fn opened_with_a_card(id: &str) -> App {
	let mut app = shown_panel(vec![mission(id, MissionState::Working, 1)]);
	open(&mut app, &super::Opening::of(&mission(id, MissionState::Working, 1)));
	read_detail(&mut app, mission(id, MissionState::Working, 1));
	let card: model::Mission = serde_json::from_value(json!({
		"id": id, "originConversationId": "room", "botId": "atlas",
		"threadConversationId": format!("thread-{id}"), "objective": "Ship it", "ticket": {},
		"tools": [], "state": "working", "isAgentRunning": false, "openedAt": 1,
		"status": null, "lastActivity": null, "commitsAhead": null, "pullRequestUrl": null,
	}))
	.expect("a card fixture");
	app.thread.as_mut().expect("the mission thread is open").missions.push(card);
	app.surfaces.s08_missions.queued.clear();
	app
}

fn change_read(event: serde_json::Value) -> model::MissionChanged {
	serde_json::from_value(event).expect("a mission://changed payload")
}

fn card_of<'a>(app: &'a App, id: &str) -> Option<&'a model::Mission> {
	app.thread.as_ref().and_then(|thread| thread.missions.iter().find(|card| card.id == id))
}

type Statuses = (Option<MissionStatus>, Option<MissionStatus>, Option<MissionStatus>);

fn statuses(app: &App, id: &str) -> Statuses {
	let listed = state(app).listed(id).and_then(|mission| mission.status.clone());
	let opened = app.mission.as_ref().and_then(super::Opened::mission);
	let card = card_of(app, id);
	(
		listed,
		opened.and_then(|mission| mission.status.clone()),
		card.and_then(|card| card.status.clone()),
	)
}

fn running_signs(app: &App, id: &str) -> (bool, bool, bool) {
	let listed = state(app).listed(id).is_some_and(super::feed::is_working);
	let opened = app.mission.as_ref().and_then(super::Opened::mission);
	let card = card_of(app, id);
	(
		listed,
		opened.is_some_and(super::feed::is_working),
		card.is_some_and(|card| card.is_agent_running),
	)
}

fn running_change(id: &str, is_agent_running: bool) -> model::MissionChanged {
	model::MissionChanged { is_agent_running, ..change_of(id, model::MissionState::WaitingBot) }
}

#[test]
fn a_change_carrying_a_status_shows_it_on_the_row_the_detail_and_the_card_before_any_reread() {
	let mut app = opened_with_a_card("m-1");
	let change = change_read(json!({
		"missionId": "m-1", "spaceId": SPACE, "state": "working", "stateSeq": 2,
		"isAgentRunning": false, "status": { "text": "Tests green", "writtenAt": 42 },
		"liveness": "idle", "workingBotIds": [], "lastActivityAt": null,
	}));
	changed(&mut app, &change);
	let status = MissionStatus { text: "Tests green".to_owned(), written_at: 42 };
	assert_eq!(statuses(&app, "m-1"), (Some(status.clone()), Some(status.clone()), Some(status)));
}

#[test]
fn a_change_carrying_a_null_status_clears_the_status_of_the_row_the_detail_and_the_card() {
	let mut app = opened_with_a_card("m-1");
	let written = MissionStatus { text: "Tests green".to_owned(), written_at: 42 };
	changed(
		&mut app,
		&model::MissionChanged {
			status: Some(written),
			..change_of("m-1", model::MissionState::Working)
		},
	);
	let change = change_read(json!({
		"missionId": "m-1", "spaceId": SPACE, "state": "working", "stateSeq": 3,
		"isAgentRunning": false, "status": null, "lastActivityAt": null,
	}));
	changed(&mut app, &change);
	assert_eq!(statuses(&app, "m-1"), (None, None, None));
}

#[test]
fn a_running_agent_shows_on_the_row_the_detail_and_the_card_then_leaves_them_when_it_stops() {
	let mut app = opened_with_a_card("m-1");
	changed(&mut app, &running_change("m-1", true));
	assert_eq!(running_signs(&app, "m-1"), (true, true, true));
	changed(&mut app, &running_change("m-1", false));
	assert_eq!(running_signs(&app, "m-1"), (false, false, false));
}

#[test]
fn a_change_of_a_mission_not_held_leaves_every_held_mission_as_it_was() {
	let mut app = opened_with_a_card("m-1");
	let change = model::MissionChanged {
		is_agent_running: true,
		status: Some(MissionStatus { text: "Elsewhere".to_owned(), written_at: 7 }),
		..change_of("m-2", model::MissionState::Done)
	};
	changed(&mut app, &change);
	assert_eq!(statuses(&app, "m-1"), (None, None, None));
	assert_eq!(running_signs(&app, "m-1"), (false, false, false));
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::Working));
}

#[test]
fn a_change_of_a_mission_not_open_rereads_the_feed_and_no_detail() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	changed(&mut app, &change_of("m-2", model::MissionState::Done));
	assert_eq!(feed_calls(&app), 1);
	assert!(!state(&app).queued.iter().any(|call| matches!(call, Call::Detail(_))));
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::Working));
}

#[test]
fn a_change_patches_the_held_rows_then_rereads_the_feed_with_the_missions_opened_since() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	changed(&mut app, &change_of("m-1", model::MissionState::WaitingHuman));
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::WaitingHuman));
	assert_eq!(
		last_call(&app),
		Some(&Call::Feed { space_id: SPACE.to_owned(), closed_since: start_of_day(now_ms()) })
	);
	answer_feed(
		&mut app,
		Ok(vec![
			mission("m-1", MissionState::WaitingHuman, 1),
			mission("m-new", MissionState::Working, 2),
		]),
	);
	assert_eq!(listed_state(&app, "m-new"), Some(MissionState::Working));
}

#[test]
fn changes_before_the_reread_answers_send_one_reread_and_keep_the_rows_on_screen() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	changed(&mut app, &change_of("m-1", model::MissionState::WaitingBot));
	changed(&mut app, &change_of("m-1", model::MissionState::WaitingHuman));
	changed(&mut app, &change_of("m-2", model::MissionState::Done));
	assert_eq!(feed_calls(&app), 1);
	assert!(matches!(state(&app).feed(), Some(Feed::Shown(_))));
	answer_feed(&mut app, Ok(vec![mission("m-1", MissionState::WaitingHuman, 1)]));
	assert_eq!(feed_calls(&app), 1, "the changes heard meanwhile are read once more");
	answer_feed(&mut app, Ok(vec![mission("m-1", MissionState::WaitingHuman, 1)]));
	assert_eq!(feed_calls(&app), 0);
}

#[test]
fn a_failed_reread_keeps_the_held_rows_and_raises_an_error_notice() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	changed(&mut app, &change_of("m-1", model::MissionState::WaitingHuman));
	answer_feed(&mut app, Err(refused("mission_space_feed")));
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::WaitingHuman));
	assert_eq!(notice_titles(&app), vec!["Couldn’t load missions"]);
	assert_eq!(state(&app).notices[0].kind, NoticeKind::Error);
}

#[test]
fn earlier_today_counts_from_local_midnight_not_utc_midnight() {
	let paris = FixedOffset::east_opt(2 * 3_600).expect("a valid offset");
	let one_in_the_morning = paris
		.with_ymd_and_hms(2026, 11, 8, 1, 0, 0)
		.single()
		.expect("a valid time")
		.timestamp_millis();
	let local_midnight = paris
		.with_ymd_and_hms(2026, 11, 8, 0, 0, 0)
		.single()
		.expect("a valid time")
		.timestamp_millis();
	assert_eq!(start_of_day_in(&paris, one_in_the_morning), local_midnight);
	assert_ne!(local_midnight % 86_400_000, 0);
}

#[test]
fn the_installed_profile_reads_the_space_feed() {
	assert!(host::is_read("mission_space_feed"));
}

#[test]
fn the_menu_offers_what_the_mission_carries_in_its_state() {
	let bare = mission("m-1", MissionState::Working, 1);
	let facts = menu_facts(&bare);
	assert_eq!(facts.state, kit::MissionState::Working);
	assert_eq!(facts.copy_kinds(), vec![CopyKind::IssueId]);
	let carried = Mission {
		pull_request_url: Some("https://github.com/o/r/pull/9".to_owned()),
		branch: Some("feature/x".to_owned()),
		workspace_path: Some("/w".to_owned()),
		..closed("m-2", MissionState::Done, 10)
	};
	let facts = menu_facts(&carried);
	assert_eq!(facts.state, kit::MissionState::Done);
	assert!(facts.has_pull_request && facts.has_branch && facts.has_workspace_path);
}

#[test]
fn close_and_reopen_call_their_core_commands() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	chosen(&mut app, "m-1", MenuAction::Close);
	assert_eq!(
		last_call(&app),
		Some(&Call::Write { command: Command::Close, mission_id: "m-1".to_owned() })
	);
	chosen(&mut app, "m-1", MenuAction::Reopen);
	assert_eq!(
		last_call(&app),
		Some(&Call::Write { command: Command::Reopen, mission_id: "m-1".to_owned() })
	);
	assert_eq!(Command::Close.name(), "mission_close");
	assert_eq!(Command::Reopen.name(), "mission_reopen");
}

#[test]
fn a_failed_command_keeps_the_mission_as_it_was_and_raises_a_notice() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	chosen(&mut app, "m-1", MenuAction::Close);
	landed(
		&mut app,
		Answer::Written {
			command: Command::Close,
			mission_id: "m-1".to_owned(),
			outcome: Err(refused("mission_close")),
		},
	);
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::Working));
	assert_eq!(notice_titles(&app), vec!["Couldn’t close the mission"]);
	assert_eq!(state(&app).notices[0].kind, NoticeKind::Error);
}

#[test]
fn a_command_that_lands_shows_the_mission_the_core_returned() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	open(&mut app, &super::Opening::of(&mission("m-1", MissionState::Working, 1)));
	read_detail(&mut app, mission("m-1", MissionState::Working, 1));
	landed(
		&mut app,
		Answer::Written {
			command: Command::Close,
			mission_id: "m-1".to_owned(),
			outcome: Ok(closed("m-1", MissionState::Closed, 5)),
		},
	);
	assert_eq!(listed_state(&app, "m-1"), Some(MissionState::Closed));
	let header = app.mission.as_ref().and_then(super::Opened::mission).expect("a read header");
	assert_eq!(header.state, MissionState::Closed);
}

#[test]
fn copy_and_open_pull_request_hand_their_value_to_the_window() {
	let carried = Mission {
		pull_request_url: Some("https://github.com/o/r/pull/9".to_owned()),
		..mission("m-1", MissionState::Working, 1)
	};
	let mut app = shown_panel(vec![carried]);
	copied(&mut app, "m-1", CopyKind::IssueId);
	chosen(&mut app, "m-1", MenuAction::OpenPullRequest);
	copied(&mut app, "m-1", CopyKind::Branch);
	assert_eq!(
		state(&app).effects,
		vec![
			Effect::Copy { text: "OPE-m-1".to_owned(), copied: "Issue ID copied".to_owned() },
			Effect::Open {
				url: "https://github.com/o/r/pull/9".to_owned(),
				refused: Some(
					kiroshi_rune_kit::strings::chat::missions::menu::failed::OPEN_PULL_REQUEST
				),
			},
		]
	);
	assert_eq!(notice_titles(&app), vec!["Couldn’t copy to the clipboard"]);
}

#[test]
fn message_agent_and_answer_open_the_mission() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::WaitingHuman, 1)]);
	chosen(&mut app, "m-1", MenuAction::Answer);
	assert_eq!(app.mission.as_ref().map(|opened| opened.mission_id.as_str()), Some("m-1"));
}

#[test]
fn a_pressed_link_is_opened_in_the_browser() {
	let mut app = shown_panel(Vec::new());
	emitted(&mut app, MissionsEvent::OpenUrl("https://linear.app/t/OPE-1".to_owned()));
	assert_eq!(
		state(&app).effects,
		vec![Effect::Open { url: "https://linear.app/t/OPE-1".to_owned(), refused: None }]
	);
}

#[test]
fn the_read_only_installed_profile_refuses_mission_writes_before_they_leave() {
	for command in [Command::Close, Command::Reopen] {
		let refused = refused_before_leaving(Some(Profile::Installed), command);
		assert!(matches!(refused, Some(HostError::WriteRefused { .. })), "{command:?}");
		assert!(refused_before_leaving(Some(Profile::Dev), command).is_none());
		assert!(refused_before_leaving(None, command).is_none());
	}
}

#[test]
fn recorded_events_become_thread_events_in_time_order() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	open(&mut app, &super::Opening::of(&mission("m-1", MissionState::Working, 1)));
	let event = |id: &str, kind, created_at, payload| MissionEvent {
		id: id.to_owned(),
		mission_id: "m-1".to_owned(),
		kind,
		source: "bot".to_owned(),
		payload,
		created_at,
	};
	let detail = MissionDetail {
		mission: mission("m-1", MissionState::Working, 1),
		events: vec![
			event(
				"asked",
				MissionEventKind::AgentAsked,
				9,
				json!({ "message": "", "question": "Which branch?", "url": "https://github.com/o/r/pull/9", "pullRequest": 9 }),
			),
			event("status", MissionEventKind::Status, 5, json!({})),
			event("opened", MissionEventKind::Opened, 2, json!(null)),
		],
	};
	landed(&mut app, Answer::Detail { mission_id: "m-1".to_owned(), detail: Ok(detail) });
	let shown = thread_events(&app);
	let kinds: Vec<EventKind> = shown.iter().map(|event| event.kind).collect();
	assert_eq!(kinds, vec![EventKind::Opened, EventKind::AgentAsked]);
	assert_eq!(shown[1].text.as_deref(), Some("Which branch?"));
	assert_eq!(shown[1].link, Some(("https://github.com/o/r/pull/9".to_owned(), Some(9))));
}

#[test]
fn summons_are_recognised_to_be_hidden_from_the_thread() {
	assert!(is_summons("Carry out this mission."));
	assert!(!is_summons("Carry out this mission"));
}

#[test]
fn a_requested_menu_is_held_and_drawn_for_its_mission() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::WaitingHuman, 1)]);
	assert_eq!(shown_menu(&app), None);
	request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
	let menu = shown_menu(&app).expect("an open menu");
	assert_eq!(menu.mission, "m-1");
	assert_eq!(menu.source, MenuSource::Row);
	assert_eq!(menu.at, PointerPress { x: 12.0, y: 40.0 });
	assert_eq!(menu.facts.state, kit::MissionState::WaitingHuman);
	assert!(!menu.is_copy_shown);
}

#[test]
fn a_second_request_replaces_the_open_menu() {
	let entries =
		vec![mission("m-1", MissionState::Working, 1), mission("m-2", MissionState::Working, 2)];
	let mut app = shown_panel(entries);
	request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
	request_menu(&mut app, "m-2", MenuSource::Card, 80.0);
	let menu = shown_menu(&app).expect("an open menu");
	assert_eq!((menu.mission, menu.source, menu.at.x), ("m-2", MenuSource::Card, 80.0));
}

#[test]
fn the_copy_choices_show_and_hide_in_the_open_menu() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
	let shown = |is_shown| MissionsEvent::CopyChoicesShown { mission: "m-1".to_owned(), is_shown };
	emitted(&mut app, shown(true));
	assert!(shown_menu(&app).is_some_and(|menu| menu.is_copy_shown));
	emitted(&mut app, shown(false));
	assert!(shown_menu(&app).is_some_and(|menu| !menu.is_copy_shown));
}

#[test]
fn dismissing_choosing_or_copying_closes_the_menu() {
	let entries = vec![mission("m-1", MissionState::Working, 1)];
	let closing = [
		MissionsEvent::MenuDismissed,
		MissionsEvent::MenuChosen { mission: "m-1".to_owned(), action: MenuAction::Close },
		MissionsEvent::MenuCopied { mission: "m-1".to_owned(), kind: CopyKind::IssueId },
	];
	for event in closing {
		let mut app = shown_panel(entries.clone());
		request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
		emitted(&mut app, event.clone());
		assert_eq!(shown_menu(&app), None, "{event:?}");
		assert!(state(&app).menu.is_none(), "{event:?}");
	}
}

#[test]
fn the_menu_closes_when_its_mission_leaves_the_list() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
	changed(&mut app, &change_of("m-1", model::MissionState::Done));
	answer_feed(&mut app, Ok(Vec::new()));
	assert_eq!(shown_menu(&app), None);
	changed(&mut app, &change_of("m-2", model::MissionState::Working));
	answer_feed(&mut app, Ok(vec![mission("m-1", MissionState::Working, 1)]));
	assert_eq!(shown_menu(&app), None);
}

#[test]
fn the_menu_facts_follow_the_current_mission() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	request_menu(&mut app, "m-1", MenuSource::Row, 12.0);
	landed(
		&mut app,
		Answer::Written {
			command: Command::Close,
			mission_id: "m-1".to_owned(),
			outcome: Ok(Mission {
				branch: Some("feature/x".to_owned()),
				..closed("m-1", MissionState::Closed, 5)
			}),
		},
	);
	let menu = shown_menu(&app).expect("an open menu");
	assert_eq!(menu.facts.state, kit::MissionState::Closed);
	assert!(menu.facts.has_branch);
}

#[test]
fn stop_agent_cancels_the_turn_of_the_mission_agent_in_its_thread() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	chosen(&mut app, "m-1", MenuAction::StopAgent);
	assert_eq!(
		last_call(&app),
		Some(&Call::Stop { conversation_id: "thread-m-1".to_owned(), bot_id: "atlas".to_owned() })
	);
	landed(&mut app, Answer::Stopped(Ok(CancelOutcome::Cancelled)));
	landed(&mut app, Answer::Stopped(Ok(CancelOutcome::NothingToCancel)));
	assert!(notice_titles(&app).is_empty());
}

#[test]
fn a_failed_stop_raises_the_stop_agent_notice() {
	let mut app = shown_panel(vec![mission("m-1", MissionState::Working, 1)]);
	landed(&mut app, Answer::Stopped(Err(refused("agent_cancel_turn"))));
	landed(&mut app, Answer::Stopped(Ok(CancelOutcome::Failed { failures: Vec::new() })));
	assert_eq!(
		notice_titles(&app),
		vec!["Couldn’t stop the coding session", "Couldn’t stop the coding session"]
	);
	assert!(state(&app).notices.iter().all(|notice| notice.kind == NoticeKind::Error));
	assert!(state(&app).notices[0].description.is_some());
}
