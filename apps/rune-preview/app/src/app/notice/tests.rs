use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeKind, SurfaceEvent};

use super::{Notice, closed, shown};
use crate::app::{App, Inbound, Person, Ready, Workspace};
use crate::events::HostEvent;
use crate::host::{Host, HostError};
use crate::longest::Longest;
use crate::model::{Conversation, Participant, Space};
use crate::source::Source;
use crate::surfaces::s03_roster::Heard;

const ON_SCREEN: &str = "space-on-screen";

const LEFT: &str = "space-left";

const HOST_LOST: &str = "Stopped hearing from the host.";

const LONGEST_UNREAD: &str = "Couldn't find the longest conversation.";

fn conversation(id: &str) -> Conversation {
	Conversation {
		id: id.into(),
		title: id.into(),
		color: None,
		participants: Vec::new(),
		last_activity_at: None,
		last_word: None,
		solo_bot_id: None,
	}
}

fn with_an_agent(id: &str) -> Conversation {
	let seat = Participant {
		bot_id: "wren".into(),
		name: "Wren".into(),
		avatar_blot: None,
		left_at: None,
		is_deleted: false,
	};
	Conversation { participants: vec![seat], ..conversation(id) }
}

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: ON_SCREEN.into(), name: "Personal".into(), colour: None },
		agents: Vec::new(),
		conversations: vec![conversation("c-1"), conversation("c-2"), with_an_agent("c-3")],
		person: Person::Unread,
		longest: None,
	});
	app
}

fn refused() -> HostError {
	HostError::WriteRefused { command: "longest".into() }
}

fn put_on_screen(app: &mut App, space_id: &str) {
	if let Workspace::Ready(ready) = &mut app.workspace {
		ready.space.id = space_id.into();
	}
}

fn shown_kinds(app: &App) -> Vec<(&str, NoticeKind)> {
	shown(app).into_iter().map(|notice| (notice.title.as_str(), notice.kind)).collect()
}

fn shown_titles(app: &App) -> Vec<&str> {
	shown(app).into_iter().map(|notice| notice.title.as_str()).collect()
}

#[test]
fn a_missions_read_failure_shows_as_a_failure_notice() {
	let mut app = ready_app();
	app.open("c-1");

	app.received(Inbound::MissionsOf { conversation_id: "c-1".into(), missions: Err(refused()) });

	assert_eq!(
		shown_kinds(&app),
		vec![("Couldn't read the missions of this conversation.", NoticeKind::Error)]
	);
}

#[test]
fn a_notice_stays_on_screen_when_another_conversation_opens() {
	let mut app = ready_app();
	app.open("c-1");
	app.received(Inbound::MissionsOf { conversation_id: "c-1".into(), missions: Err(refused()) });

	app.open("c-2");

	assert!(!shown(&app).is_empty());
}

#[test]
fn a_longest_read_failure_of_the_space_on_screen_is_shown() {
	let mut app = ready_app();

	app.received(Inbound::Longest { space_id: ON_SCREEN.into(), found: Err(refused()) });

	assert_eq!(
		shown_kinds(&app),
		vec![("Couldn't find the longest conversation.", NoticeKind::Error)]
	);
}

#[test]
fn a_notice_of_a_space_not_on_screen_keeps_the_shown_one_and_shows_once_its_space_is_back() {
	let mut app = ready_app();
	app.host_event(HostEvent::Lost("the socket closed".into()));

	app.received(Inbound::Longest { space_id: LEFT.into(), found: Err(refused()) });
	let while_away = shown_titles(&app).join(" | ");
	put_on_screen(&mut app, LEFT);

	assert_eq!(while_away, HOST_LOST);
	assert_eq!(shown_titles(&app), vec![LONGEST_UNREAD, HOST_LOST]);
}

#[test]
fn a_longest_read_of_a_space_not_on_screen_writes_neither_its_result_nor_its_fallback() {
	let mut app = ready_app();
	let found = Longest { conversation_id: "c-1".into(), messages: 40 };

	app.received(Inbound::Longest { space_id: LEFT.into(), found: Ok(Some(found)) });
	app.received(Inbound::Longest { space_id: LEFT.into(), found: Ok(None) });

	assert!(app.ready().is_some_and(|ready| ready.longest.is_none()));
	assert!(app.thread.is_none());
}

#[test]
fn a_lost_host_shows_a_failure_until_it_is_closed() {
	let mut app = ready_app();
	app.host_event(HostEvent::Lost("the socket closed".into()));
	let before = shown_titles(&app).join(" | ");

	closed(&mut app, SurfaceEvent::Close(0));

	assert_eq!(before, HOST_LOST);
	assert!(shown(&app).is_empty());
}

#[test]
fn an_unreadable_event_shows_a_failure_naming_the_event() {
	let mut app = ready_app();

	app.host_event(HostEvent::Unreadable { event: "mission".into(), cause: "bad json".into() });

	let notices: Vec<Notice> = shown(&app).into_iter().cloned().collect();
	assert_eq!(notices, vec![Notice::failure("Couldn't read a mission event.", "bad json")]);
}

#[test]
fn a_newer_notice_replaces_the_one_on_screen() {
	let mut app = ready_app();
	app.host_event(HostEvent::Unreadable { event: "mission".into(), cause: "bad json".into() });

	app.host_event(HostEvent::Lost("the socket closed".into()));

	assert_eq!(shown_kinds(&app), vec![(HOST_LOST, NoticeKind::Error)]);
}

#[test]
fn a_heard_conversation_deletion_is_remembered_for_the_tabs() {
	let mut app = ready_app();

	app.host_event(HostEvent::Roster(Heard::Deleted { conversation_id: "c-1".into() }));

	assert!(app.navigation.is_deleted("c-1"));
	assert!(!app.navigation.is_deleted("c-2"));
}

#[test]
fn closing_the_front_notice_leaves_the_notice_of_the_space_on_screen() {
	let mut app = ready_app();
	app.received(Inbound::Longest { space_id: ON_SCREEN.into(), found: Err(refused()) });
	app.host_event(HostEvent::Lost("the socket closed".into()));

	closed(&mut app, SurfaceEvent::Close(1));

	assert_eq!(shown_titles(&app), vec![LONGEST_UNREAD]);
}
