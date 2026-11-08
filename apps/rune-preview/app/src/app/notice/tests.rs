use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeKind, SurfaceEvent};

use super::{Notice, closed, shown};
use crate::app::{App, Inbound, Person, Ready, Workspace};
use crate::events::HostEvent;
use crate::host::{Host, HostError};
use crate::model::{Conversation, Space};
use crate::source::Source;
use crate::surfaces::s03_roster::Heard;

const ON_SCREEN: &str = "space-on-screen";

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

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: ON_SCREEN.into(), name: "Personal".into(), colour: None },
		agents: Vec::new(),
		conversations: vec![conversation("c-1"), conversation("c-2")],
		person: Person::Unread,
		longest: None,
	});
	app
}

fn refused() -> HostError {
	HostError::WriteRefused { command: "longest".into() }
}

fn shown_title(app: &App) -> Option<(&str, NoticeKind)> {
	shown(app).map(|notice| (notice.title.as_str(), notice.kind))
}

#[test]
fn a_missions_read_failure_shows_as_a_failure_notice() {
	let mut app = ready_app();
	app.open("c-1");

	app.received(Inbound::MissionsOf { conversation_id: "c-1".into(), missions: Err(refused()) });

	assert_eq!(
		shown_title(&app),
		Some(("Couldn't read the missions of this conversation.", NoticeKind::Error))
	);
}

#[test]
fn a_notice_stays_on_screen_when_another_conversation_opens() {
	let mut app = ready_app();
	app.open("c-1");
	app.received(Inbound::MissionsOf { conversation_id: "c-1".into(), missions: Err(refused()) });

	app.open("c-2");

	assert!(shown(&app).is_some());
}

#[test]
fn a_longest_read_failure_of_the_space_on_screen_is_shown() {
	let mut app = ready_app();

	app.received(Inbound::Longest { space_id: ON_SCREEN.into(), found: Err(refused()) });

	assert_eq!(
		shown_title(&app),
		Some(("Couldn't find the longest conversation.", NoticeKind::Error))
	);
}

#[test]
fn a_notice_of_a_space_not_on_screen_is_held_in_its_space_and_not_shown() {
	let mut app = ready_app();

	app.received(Inbound::Longest { space_id: "space-left".into(), found: Err(refused()) });
	let held = app.notice.as_ref().and_then(|notice| notice.space_id.clone());
	let shown_elsewhere = shown(&app).is_some();
	if let Workspace::Ready(ready) = &mut app.workspace {
		ready.space.id = "space-left".into();
	}

	assert_eq!(held.as_deref(), Some("space-left"));
	assert!(!shown_elsewhere);
	assert!(shown(&app).is_some());
}

#[test]
fn a_lost_host_shows_a_failure_until_it_is_closed() {
	let mut app = ready_app();
	app.host_event(HostEvent::Lost("the socket closed".into()));
	let before = shown(&app).map(|notice| notice.title.clone());

	closed(&mut app, SurfaceEvent::Close(0));

	assert_eq!(before.as_deref(), Some("Stopped hearing from the host."));
	assert!(app.notice.is_none());
}

#[test]
fn an_unreadable_event_shows_a_failure_naming_the_event() {
	let mut app = ready_app();

	app.host_event(HostEvent::Unreadable { event: "mission".into(), cause: "bad json".into() });

	let notice = shown(&app).cloned();
	assert_eq!(notice, Some(Notice::failure("Couldn't read a mission event.", "bad json")));
}

#[test]
fn a_newer_notice_replaces_the_one_on_screen() {
	let mut app = ready_app();
	app.host_event(HostEvent::Unreadable { event: "mission".into(), cause: "bad json".into() });

	app.host_event(HostEvent::Lost("the socket closed".into()));

	assert_eq!(shown_title(&app), Some(("Stopped hearing from the host.", NoticeKind::Error)));
}

#[test]
fn a_heard_conversation_deletion_is_remembered_for_the_tabs() {
	let mut app = ready_app();

	app.host_event(HostEvent::Roster(Heard::Deleted { conversation_id: "c-1".into() }));

	assert!(app.navigation.is_deleted("c-1"));
	assert!(!app.navigation.is_deleted("c-2"));
}
