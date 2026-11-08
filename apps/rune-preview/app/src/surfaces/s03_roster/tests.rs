use kiroshi_core::conversations::contract::{
	Bot, Chat, ConversationInPage, ConversationPage, ConversationState,
};
use kiroshi_core::sections::contract::{RosterPin, Section};
use kiroshi_rune_kit::surfaces::s03_roster::RosterEvent;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use super::listing::{Line, Listing, Placed};
use super::worker::{Answer, Call, Write};
use super::{Load, State, emitted, landed, poll, selected_row};
use crate::app::{App, Person, Ready, Workspace};
use crate::events::{HostEvent, parsed};
use crate::host::{Host, HostError};
use crate::model::{self, Message, Role};
use crate::source::Source;
use crate::surfaces::s10_agent_settings;

const SPACE: &str = "perso";

const OTHER_SPACE: &str = "work";

fn read<T: DeserializeOwned>(value: Value) -> T {
	serde_json::from_value(value).expect("a roster fixture")
}

fn bot(id: &str, created_at: i64) -> Bot {
	read(json!({
		"id": id,
		"sectionId": null,
		"pinPosition": null,
		"name": id,
		"title": "Archivist",
		"model": "sonnet",
		"avatarBlot": 132,
		"avatarImagePath": null,
		"instructions": "",
		"memory": "",
		"deniedTools": [],
		"changesNothing": false,
		"permissions": { "defaultMode": "default", "allow": [], "ask": [], "deny": [] },
		"outputStyle": "default",
		"effort": null,
		"createdAt": created_at,
	}))
}

fn row(id: &str, solo_bot_id: Option<&str>, at: i64) -> ConversationInPage {
	read(json!({
		"id": id,
		"spaceId": SPACE,
		"sectionId": null,
		"pinPosition": null,
		"title": id,
		"instructions": "",
		"icon": null,
		"color": null,
		"createdAt": 0,
		"updatedAt": at,
		"participants": [],
		"lastActivityAt": at,
		"lastWord": { "text": format!("said in {id}"), "at": at, "authorBotId": null,
			"authorAccountId": null, "authorName": null },
		"soloBotId": solo_bot_id,
		"activeTurn": null,
		"state": "idle",
		"workingBotIds": [],
	}))
}

fn section(id: &str, position: i64) -> Section {
	Section {
		id: id.to_owned(),
		space_id: SPACE.to_owned(),
		name: id.to_owned(),
		position,
		created_at: 0,
	}
}

fn page(rows: Vec<ConversationInPage>, next_cursor: Option<&str>) -> ConversationPage {
	ConversationPage {
		pinned: Vec::new(),
		conversations: rows,
		next_cursor: next_cursor.map(str::to_owned),
	}
}

fn pinned(id: &str, section_id: Option<&str>) -> RosterPin {
	RosterPin { id: id.to_owned(), section_id: section_id.map(str::to_owned) }
}

fn refused(command: &str) -> HostError {
	HostError::CommandFailed { command: command.to_owned(), status: 500, body: "refused".into() }
}

fn listing() -> Listing {
	let bots = vec![bot("atlas", 1), bot("beacon", 2)];
	let rows = vec![row("atlas-solo", Some("atlas"), 50), row("room", None, 40)];
	let sections = vec![section("desk", 0)];
	Listing::of(bots, page(rows, None), sections, Vec::new())
}

fn app_on(shown: &str) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space { id: shown.to_owned(), name: shown.to_owned(), colour: None },
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	app
}

fn shown_app(listing: Listing) -> App {
	let mut app = app_on(SPACE);
	poll(&mut app);
	landed(&mut app, Answer::Loaded { space_id: SPACE.to_owned(), listing: Ok(listing) });
	state_mut(&mut app).queued.clear();
	app
}

fn state(app: &App) -> &State {
	&app.surfaces.s03_roster
}

fn state_mut(app: &mut App) -> &mut State {
	&mut app.surfaces.s03_roster
}

fn shown_listing(app: &App) -> &Listing {
	state(app).shown_listing().expect("a shown roster")
}

fn sorted_ids(listing: &Listing) -> Vec<&str> {
	listing.sorted().iter().map(Line::id).collect()
}

fn pinned_ids(listing: &Listing) -> Vec<String> {
	listing
		.pinned()
		.iter()
		.flat_map(|placed| match placed {
			Placed::Line(line) => vec![line.id().to_owned()],
			Placed::Section { section, lines } => std::iter::once(format!("[{}]", section.id))
				.chain(lines.iter().map(|line| line.id().to_owned()))
				.collect(),
		})
		.collect()
}

fn written(app: &App) -> &Write {
	match state(app).queued.last() {
		Some(Call::Write(write)) => write,
		_ => panic!("a write was queued"),
	}
}

fn refuse_last_write(app: &mut App) {
	let Some(Call::Write(write)) = state_mut(app).queued.pop() else {
		panic!("a write was queued")
	};
	landed(app, Answer::Written { write, outcome: Err(refused("roster")) });
}

fn notice_titles(app: &App) -> Vec<&str> {
	state(app).notices.iter().map(|notice| notice.title.as_str()).collect()
}

fn switch_to(app: &mut App, space_id: &str) {
	if let Workspace::Ready(ready) = &mut app.workspace {
		ready.space.id = space_id.to_owned();
	}
	poll(app);
}

#[test]
fn showing_a_space_loads_that_space_alone_and_shows_loading_until_it_answers() {
	let mut app = app_on(SPACE);
	poll(&mut app);
	assert_eq!(state(&app).queued, vec![Call::Load(SPACE.to_owned())]);
	assert!(matches!(state(&app).shown(), Some(Load::Loading)));
	landed(&mut app, Answer::Loaded { space_id: SPACE.to_owned(), listing: Ok(listing()) });
	assert!(matches!(state(&app).shown(), Some(Load::Shown(_))));
	switch_to(&mut app, OTHER_SPACE);
	assert_eq!(state(&app).queued.last(), Some(&Call::Load(OTHER_SPACE.to_owned())));
	assert!(matches!(state(&app).shown(), Some(Load::Loading)));
}

#[test]
fn unpinned_rows_list_newest_first_and_an_agent_reads_its_solo_conversation() {
	let listing = listing();
	assert_eq!(sorted_ids(&listing), vec!["atlas", "room", "beacon"]);
	let Some(Line::Agent { solo, .. }) = listing.line("atlas") else { panic!("atlas is an agent") };
	assert_eq!(solo.map(|solo| solo.conversation.id.as_str()), Some("atlas-solo"));
}

#[test]
fn pinned_rows_and_sections_sit_above_in_their_saved_order() {
	let mut listing = listing();
	listing.place(&[pinned("room", None), pinned("desk", None), pinned("beacon", Some("desk"))]);
	assert_eq!(pinned_ids(&listing), vec!["room", "[desk]", "beacon"]);
	assert_eq!(sorted_ids(&listing), vec!["atlas"]);
}

#[test]
fn scrolling_to_the_end_reads_the_next_page_once() {
	let bots = vec![bot("atlas", 1)];
	let first =
		Listing::of(bots, page(vec![row("room", None, 40)], Some("next")), Vec::new(), Vec::new());
	let mut app = shown_app(first);
	assert!(!state_mut(&mut app).scrolled_viewport([0.0, 0.0, 300.0, 400.0]));
	assert!(!state_mut(&mut app).scrolled_content([0.0, 0.0, 300.0, 1_000.0]));
	assert!(state_mut(&mut app).scrolled_content([0.0, -600.0, 300.0, 1_000.0]));
	assert!(state(&app).is_reading_more());
	assert!(!state_mut(&mut app).scrolled_content([0.0, -610.0, 300.0, 1_000.0]));
	assert_eq!(
		state(&app).queued,
		vec![Call::ReadMore { space_id: SPACE.to_owned(), cursor: "next".to_owned() }]
	);
	let more = page(vec![row("room", None, 40), row("older", None, 10)], None);
	landed(&mut app, Answer::ReadMore { space_id: SPACE.to_owned(), page: Ok(more) });
	assert!(!state(&app).is_reading_more());
	assert_eq!(sorted_ids(shown_listing(&app)), vec!["room", "older", "atlas"]);
}

#[test]
fn selecting_a_row_opens_it_and_marks_it_selected() {
	let mut app = shown_app(listing());
	emitted(&mut app, RosterEvent::Select("room".to_owned()));
	assert_eq!(app.thread.as_ref().map(|thread| thread.conversation_id.as_str()), Some("room"));
	assert_eq!(selected_row(&app), Some("room"));
	emitted(&mut app, RosterEvent::Select("atlas".to_owned()));
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.as_str()),
		Some("atlas-solo")
	);
	assert_eq!(selected_row(&app), Some("atlas"));
}

#[test]
fn selecting_an_agent_without_a_conversation_opens_its_main_chat() {
	let mut app = shown_app(listing());
	emitted(&mut app, RosterEvent::Select("beacon".to_owned()));
	assert_eq!(
		state(&app).queued,
		vec![Call::MainChat { space_id: SPACE.to_owned(), bot_id: "beacon".to_owned() }]
	);
	let chat: Chat = read(
		json!({ "id": "beacon-solo", "createdAt": 0, "updatedAt": 0, "state": "idle", "workingBotIds": [] }),
	);
	landed(&mut app, Answer::MainChat { bot_id: "beacon".to_owned(), chat: Ok(chat) });
	assert_eq!(selected_row(&app), Some("beacon"));
}

#[test]
fn pinning_and_reordering_save_through_roster_pin_and_keep_their_order() {
	let mut app = shown_app(listing());
	state_mut(&mut app).pin("room");
	let Write::Pin { pins, .. } = written(&app) else { panic!("a pin write") };
	assert_eq!(pins, &vec![pinned("desk", None), pinned("room", None)]);
	assert_eq!(&shown_listing(&app).pins(), pins);
	let reordered = vec![pinned("room", None), pinned("desk", None)];
	state_mut(&mut app).reorder(reordered.clone());
	assert_eq!(shown_listing(&app).pins(), reordered);
	state_mut(&mut app).unpin("room");
	assert_eq!(pinned_ids(shown_listing(&app)), vec!["[desk]"]);
}

#[test]
fn a_refused_pin_puts_the_roster_back_and_says_so() {
	let mut app = shown_app(listing());
	state_mut(&mut app).pin("room");
	refuse_last_write(&mut app);
	assert_eq!(pinned_ids(shown_listing(&app)), vec!["[desk]"]);
	assert_eq!(notice_titles(&app), vec![super::PINS_UNSAVED]);
}

#[test]
fn opening_and_closing_a_section_saves_it_and_a_refusal_restores_it() {
	let mut app = shown_app(listing());
	emitted(&mut app, RosterEvent::ToggleSection("desk".to_owned()));
	assert!(!shown_listing(&app).is_open("desk"));
	assert_eq!(
		written(&app),
		&Write::Collapse {
			space_id: SPACE.to_owned(),
			collapsed: vec!["desk".to_owned()],
			before: Vec::new()
		}
	);
	refuse_last_write(&mut app);
	assert!(shown_listing(&app).is_open("desk"));
}

#[test]
fn renaming_a_section_saves_it_and_a_cancel_or_a_refusal_keeps_the_old_name() {
	let mut app = shown_app(listing());
	state_mut(&mut app).begin_rename("desk");
	emitted(&mut app, RosterEvent::RenameCancel("desk".to_owned()));
	assert_eq!(state(&app).renaming(), None);
	assert_eq!(shown_listing(&app).section_name("desk"), Some("desk"));
	assert!(state(&app).queued.is_empty());
	state_mut(&mut app).begin_rename("desk");
	let commit =
		RosterEvent::RenameCommit { section: "desk".to_owned(), name: " Front ".to_owned() };
	emitted(&mut app, commit);
	assert_eq!(shown_listing(&app).section_name("desk"), Some("Front"));
	assert!(matches!(written(&app), Write::Rename { name, .. } if name == "Front"));
	refuse_last_write(&mut app);
	assert_eq!(shown_listing(&app).section_name("desk"), Some("desk"));
}

#[test]
fn moving_an_agent_into_a_section_saves_it_and_a_refusal_moves_it_back() {
	let mut app = shown_app(listing());
	state_mut(&mut app).move_to_section("beacon", Some("desk"));
	assert_eq!(pinned_ids(shown_listing(&app)), vec!["[desk]", "beacon"]);
	assert!(matches!(
		written(&app),
		Write::MoveToSection { bot_id, section_id: Some(section), .. } if bot_id == "beacon" && section == "desk"
	));
	refuse_last_write(&mut app);
	assert_eq!(pinned_ids(shown_listing(&app)), vec!["[desk]"]);
}

#[test]
fn sharing_an_agent_shows_it_in_that_space_and_removing_it_drops_it() {
	let mut app = shown_app(listing());
	switch_to(&mut app, OTHER_SPACE);
	let other = Listing::of(Vec::new(), page(Vec::new(), None), Vec::new(), Vec::new());
	landed(&mut app, Answer::Loaded { space_id: OTHER_SPACE.to_owned(), listing: Ok(other) });
	switch_to(&mut app, SPACE);
	landed(&mut app, Answer::Loaded { space_id: SPACE.to_owned(), listing: Ok(listing()) });
	let other_bots = |app: &App| -> Vec<String> {
		let Some(Load::Shown(listing)) = state(app).rosters.get(OTHER_SPACE) else {
			return Vec::new();
		};
		listing.bots.iter().map(|bot| bot.id.clone()).collect()
	};
	state_mut(&mut app).share("atlas", OTHER_SPACE);
	assert_eq!(other_bots(&app), vec!["atlas"]);
	assert!(matches!(written(&app), Write::Share { space_id, .. } if space_id == OTHER_SPACE));
	refuse_last_write(&mut app);
	assert!(other_bots(&app).is_empty());
	state_mut(&mut app).unshare("atlas", SPACE);
	assert!(shown_listing(&app).bot("atlas").is_none());
	refuse_last_write(&mut app);
	assert!(shown_listing(&app).bot("atlas").is_some());
	assert_eq!(notice_titles(&app).len(), 2);
}

#[test]
fn a_stored_message_moves_its_row_up_with_its_preview() {
	let mut app = shown_app(listing());
	let message = Message {
		id: "m1".to_owned(),
		conversation_id: "room".to_owned(),
		seq: 1,
		role: Role::User,
		content: "fresh".to_owned(),
		author_bot_id: None,
		author_name: None,
		created_at: 90,
	};
	state_mut(&mut app).heard_message(&message);
	let listing = shown_listing(&app);
	assert_eq!(sorted_ids(listing), vec!["room", "atlas", "beacon"]);
	let word = listing
		.line("room")
		.and_then(|line| line.conversation())
		.and_then(|row| row.last_word.as_ref());
	assert_eq!(word.and_then(|word| word.text.as_deref()), Some("fresh"));
}

#[test]
fn an_agent_deleted_on_the_host_leaves_the_roster() {
	let mut app = shown_app(listing());
	let deleted = s10_agent_settings::Heard::Deleted { id: "beacon".to_owned() };
	state_mut(&mut app).heard_companion(&deleted);
	assert_eq!(sorted_ids(shown_listing(&app)), vec!["atlas", "room"]);
	assert!(state(&app).queued.is_empty());
}

#[test]
fn a_failed_load_shows_unreadable_and_retry_loads_again() {
	let mut app = app_on(SPACE);
	poll(&mut app);
	landed(
		&mut app,
		Answer::Loaded { space_id: SPACE.to_owned(), listing: Err(refused("conversation_bots")) },
	);
	assert!(matches!(state(&app).shown(), Some(Load::Failed(_))));
	state_mut(&mut app).queued.clear();
	emitted(&mut app, RosterEvent::Retry);
	assert_eq!(state(&app).queued, vec![Call::Load(SPACE.to_owned())]);
	assert!(matches!(state(&app).shown(), Some(Load::Loading)));
}

#[test]
fn a_background_failure_stays_silent_until_its_space_is_shown() {
	let mut app = app_on(SPACE);
	poll(&mut app);
	switch_to(&mut app, OTHER_SPACE);
	landed(
		&mut app,
		Answer::Loaded { space_id: SPACE.to_owned(), listing: Err(refused("section_list")) },
	);
	assert!(notice_titles(&app).is_empty());
	assert!(matches!(state(&app).shown(), Some(Load::Loading)));
	state_mut(&mut app).queued.clear();
	switch_to(&mut app, SPACE);
	assert!(matches!(state(&app).shown(), Some(Load::Failed(_))));
	assert!(state(&app).queued.is_empty());
}

fn frame(event: &str, payload: Value) -> String {
	json!({ "event": event, "payload": payload }).to_string()
}

fn delivered(app: &mut App, event: &str, payload: Value) {
	match parsed(&frame(event, payload)) {
		Some(HostEvent::Roster(heard)) => state_mut(app).heard(heard),
		_ => panic!("{event} reaches the roster"),
	}
}

fn loads_of(app: &App, space_id: &str) -> usize {
	let load = Call::Load(space_id.to_owned());
	state(app).queued.iter().filter(|call| **call == load).count()
}

fn shown_and_back(app: &mut App) {
	switch_to(app, OTHER_SPACE);
	let other = Listing::of(Vec::new(), page(Vec::new(), None), Vec::new(), Vec::new());
	landed(app, Answer::Loaded { space_id: OTHER_SPACE.to_owned(), listing: Ok(other) });
	state_mut(app).queued.clear();
	switch_to(app, SPACE);
}

#[test]
fn conversation_events_from_the_host_reach_the_roster_rows() {
	let mut app = shown_app(listing());
	let created = json!({ "spaceId": SPACE, "conversation": row("new", None, 99) });
	let updated = json!({ "spaceId": SPACE, "conversation": row("room", None, 120) });
	let changed = json!({ "conversationId": "room", "spaceId": SPACE, "state": "needs_you",
		"workingBotIds": [] });
	let deleted = json!({ "spaceId": SPACE, "conversationId": "new" });
	delivered(&mut app, "conversation://created", created);
	assert!(shown_listing(&app).line("new").is_some());
	delivered(&mut app, "conversation://updated", updated);
	delivered(&mut app, "conversation://state-changed", changed);
	delivered(&mut app, "conversation://deleted", deleted);
	let listing = shown_listing(&app);
	assert_eq!(sorted_ids(listing), vec!["room", "atlas", "beacon"]);
	let room = listing.line("room").and_then(|line| line.conversation());
	assert_eq!(room.map(|row| row.observed.state), Some(ConversationState::NeedsYou));
	assert!(state(&app).queued.is_empty());
}

#[test]
fn an_unreadable_conversation_event_leaves_the_roster_as_it_was() {
	let app = shown_app(listing());
	let broken = json!({ "spaceId": SPACE, "conversation": { "id": 3 } });
	assert!(parsed(&frame("conversation://updated", broken)).is_none());
	assert_eq!(shown_listing(&app), &listing());
}

#[test]
fn switching_back_to_a_shown_space_keeps_its_roster_while_it_reloads() {
	let mut app = shown_app(listing());
	shown_and_back(&mut app);
	assert!(matches!(state(&app).shown(), Some(Load::Shown(_))));
	assert_eq!(state(&app).queued, vec![Call::Load(SPACE.to_owned())]);
}

#[test]
fn a_space_already_loading_is_not_loaded_twice() {
	let mut app = app_on(SPACE);
	poll(&mut app);
	switch_to(&mut app, OTHER_SPACE);
	switch_to(&mut app, SPACE);
	state_mut(&mut app).retry();
	assert_eq!(loads_of(&app, SPACE), 1);
	landed(&mut app, Answer::Loaded { space_id: SPACE.to_owned(), listing: Ok(listing()) });
	switch_to(&mut app, OTHER_SPACE);
	switch_to(&mut app, SPACE);
	assert_eq!(loads_of(&app, SPACE), 2);
}

#[test]
fn a_failed_reload_keeps_the_shown_roster_and_says_so() {
	let mut app = shown_app(listing());
	shown_and_back(&mut app);
	let failure = Err(refused("conversation_page"));
	landed(&mut app, Answer::Loaded { space_id: SPACE.to_owned(), listing: failure });
	assert_eq!(shown_listing(&app), &listing());
	assert_eq!(notice_titles(&app), vec![super::REFRESH_UNREAD]);
}
