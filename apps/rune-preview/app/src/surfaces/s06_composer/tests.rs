use kiroshi_core::agent::contract::{AgentCommand, CancelOutcome};
use kiroshi_core::conversations::contract::ReplyLink;
use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind};
use kiroshi_rune_kit::strings::{Language, chat, common};
use kiroshi_rune_kit::surfaces::s06_composer::ComposerIntent;

use super::draft::Document;
use super::open::{Candidate, Kind, Open};
use super::prompt_text::{
	Named, command_query, iso_utc, mention_counts, mention_query, mentioned_ids,
	prompt_with_mention, to_mention_tokens, with_attachments,
};
use super::worker::{Answer, Call, File, Outgoing, Refusal, Unread, Unsent};
use super::{Effect, Live, State};
use crate::host::HostError;

const GROUP: &str = "c-group";
const SOLO: &str = "c-solo";
const NOW: i64 = 1_762_400_000_123;

fn candidate(id: &str, name: &str, is_outside: bool) -> Candidate {
	Candidate { id: id.to_owned(), name: name.to_owned(), title: None, hue: None, is_outside }
}

fn group() -> Open {
	Open {
		conversation_id: GROUP.to_owned(),
		kind: Kind::Group,
		candidates: vec![
			candidate("atlas", "Atlas", false),
			candidate("dora", "Dora", false),
			candidate("beacon", "Beacon", true),
		],
		space: ("space-1".to_owned(), "Studio".to_owned()),
		reply_links: Vec::new(),
	}
}

fn solo() -> Open {
	Open {
		conversation_id: SOLO.to_owned(),
		kind: Kind::Solo { bot_id: "atlas".to_owned(), name: "Atlas".to_owned() },
		candidates: vec![candidate("atlas", "Atlas", false)],
		..group()
	}
}

fn closed_mission() -> Open {
	Open { kind: Kind::Mission { is_closed: true }, ..group() }
}

fn holds_nothing(_: &str) -> bool {
	false
}

fn idle() -> Live<'static> {
	Live { working: None, holds: &holds_nothing }
}

fn working(conversation_id: &str) -> Live<'_> {
	Live { working: Some(conversation_id), holds: &holds_nothing }
}

fn typed(state: &mut State, open: &Open, text: &str) {
	state.edit_of(&open.conversation_id).replace_text(text);
}

fn prompt(state: &State, open: &Open) -> String {
	state.prompt_of(&open.conversation_id).to_owned()
}

fn failed(command: &str, body: &str) -> HostError {
	HostError::CommandFailed { command: command.to_owned(), status: 500, body: body.to_owned() }
}

fn unsent(reached: Result<bool, HostError>) -> Unsent {
	Unsent { failure: failed("conversation_send_turn", "down"), reached }
}

fn sent_back(outgoing: &Outgoing, reached: Result<bool, HostError>) -> Answer {
	Answer::Sent {
		conversation_id: outgoing.conversation_id.clone(),
		message_id: outgoing.message_id.clone(),
		outcome: Err(unsent(reached)),
	}
}

fn document(name: &str) -> Document {
	Document { name: format!("{name}.md"), title: name.to_owned(), bytes: 2048 }
}

fn file(id: &str) -> File {
	File { id: id.to_owned(), name: format!("{id}.md"), bytes: vec![1, 2, 3] }
}

fn prepared_calls(state: &State) -> Vec<&super::worker::Preparing> {
	state
		.queued
		.iter()
		.filter_map(|call| match call {
			Call::Prepare(preparing) => Some(preparing),
			_ => None,
		})
		.collect()
}

fn sent_calls(state: &State) -> Vec<&Outgoing> {
	state
		.queued
		.iter()
		.filter_map(|call| match call {
			Call::Send(outgoing) => Some(outgoing),
			_ => None,
		})
		.collect()
}

fn send(state: &mut State, open: &Open, text: &str) -> Outgoing {
	typed(state, open, text);
	state.send(open, NOW);
	let preparing = prepared_calls(state).last().map(|preparing| preparing.outgoing.clone());
	preparing.expect("the send prepares a message")
}

fn prepare(state: &mut State, outgoing: &Outgoing, live: &Live) {
	state.answered(
		Answer::Prepared {
			conversation_id: outgoing.conversation_id.clone(),
			message_id: outgoing.message_id.clone(),
			prepared: Ok(outgoing.clone()),
		},
		live,
	);
}

fn said(key: kiroshi_rune_kit::strings::Key) -> &'static str {
	key.text(Language::En)
}

fn notice_title(state: &State) -> Option<&str> {
	state.notice().map(|(title, _)| title)
}

fn commands() -> Vec<AgentCommand> {
	["compact", "clear", "review"]
		.map(|name| AgentCommand { name: name.to_owned(), description: None })
		.to_vec()
}

#[test]
fn a_mention_query_opens_only_on_a_word_that_starts_with_an_at_sign() {
	assert_eq!(mention_query("hey @do"), Some("do"));
	assert_eq!(mention_query("@"), Some(""));
	assert_eq!(mention_query("mail@do"), None);
	assert_eq!(mention_query("hey @do it"), None);
}

#[test]
fn a_command_query_needs_a_slash_at_the_start_and_known_commands() {
	assert_eq!(command_query("/co", true), Some("co"));
	assert_eq!(command_query("/co now", true), None);
	assert_eq!(command_query("say /co", true), None);
	assert_eq!(command_query("/co", false), None);
}

#[test]
fn a_picked_mention_replaces_the_typed_query() {
	assert_eq!(prompt_with_mention("ask @do", "Dora"), "ask @Dora ");
	assert_eq!(prompt_with_mention("no query", "Dora"), "no query");
}

#[test]
fn mentions_leave_as_tokens_matching_the_longest_name() {
	let named = [Named { id: "at", name: "At" }, Named { id: "atlas", name: "Atlas" }];

	let tokens = to_mention_tokens("@atlas, then <@at> and @nobody", &named);

	assert_eq!(tokens, "<@atlas>, then <@at> and @nobody");
	assert_eq!(mentioned_ids("@Atlas @At @Atlas", &named), ["atlas", "at"]);
	assert_eq!(mention_counts("@Atlas @Atlas @At", &named), [("atlas".to_owned(), 2)]);
}

#[test]
fn stored_files_follow_the_text_in_the_attachment_block() {
	let paths = ["/a/attachments/c/1.png".to_owned(), "/a/attachments/c/2.md".to_owned()];

	let content = with_attachments("  look  ", &paths, NOW);

	assert_eq!(
		content,
		"look\nAttached to this message, sent 2025-11-06T03:33:20.123Z, 2 files:\n1/2 /a/attachments/c/1.png\n2/2 /a/attachments/c/2.md"
	);
	assert_eq!(with_attachments("look", &[], NOW), "look");
	assert_eq!(iso_utc(951_782_400_000), "2000-02-29T00:00:00.000Z");
}

#[test]
fn each_conversation_keeps_its_own_draft() {
	let mut state = State::default();
	typed(&mut state, &group(), "half a thought");

	typed(&mut state, &solo(), "another");

	assert_eq!(prompt(&state, &group()), "half a thought");
	assert_eq!(prompt(&state, &solo()), "another");
}

#[test]
fn coming_back_to_a_draft_scrolls_its_field_to_the_bottom() {
	let mut state = State::default();
	typed(&mut state, &group(), "line\nline\nline");

	state.opened(&group());
	state.opened(&solo());

	assert_eq!(state.effects.iter().filter(|effect| **effect == Effect::FieldToBottom).count(), 1);
}

#[test]
fn the_mention_menu_lists_seated_agents_then_filters_in_outside_ones() {
	let mut state = State::default();
	let open = group();
	typed(&mut state, &open, "hey @");
	let opening =
		super::menu::rows(&state.trigger(&open).expect("a trigger"), &open.candidates, &[]);

	typed(&mut state, &open, "hey @a");
	let filtered =
		super::menu::rows(&state.trigger(&open).expect("a trigger"), &open.candidates, &[]);

	assert!(state.is_menu_open(&open));
	assert_eq!(opening.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(), ["atlas", "dora"]);
	assert_eq!(
		filtered.iter().map(|row| row.id.as_str()).collect::<Vec<_>>(),
		["atlas", "dora", "beacon"]
	);
}

#[test]
fn up_and_down_move_the_active_row_and_keep_it_in_view_then_enter_picks_it() {
	let mut state = State::default();
	let open = group();
	typed(&mut state, &open, "hey @");

	state.intent(&open, ComposerIntent::MenuTravel(1), &idle());
	state.intent(&open, ComposerIntent::MenuTravel(1), &idle());
	let wrapped = state.effects.last().cloned();
	state.intent(&open, ComposerIntent::MenuTravel(1), &idle());
	state.intent(&open, ComposerIntent::MenuChoose, &idle());

	assert_eq!(wrapped, Some(Effect::Reveal("mention-atlas".to_owned())));
	assert_eq!(prompt(&state, &open), "hey @Dora ");
	assert!(!state.is_menu_open(&open));
}

#[test]
fn escape_closes_the_menu_until_the_query_is_gone() {
	let mut state = State::default();
	let open = group();
	typed(&mut state, &open, "hey @d");

	state.intent(&open, ComposerIntent::MenuDismiss, &idle());
	typed(&mut state, &open, "hey @do");
	let is_open_while_typing = state.is_menu_open(&open);
	typed(&mut state, &open, "hey");
	state.settle(Some(&open), &idle());
	typed(&mut state, &open, "hey @d");

	assert!(!is_open_while_typing);
	assert!(state.is_menu_open(&open));
}

#[test]
fn the_command_menu_opens_on_a_slash_once_the_agent_commands_read() {
	let mut state = State::default();
	let open = solo();
	typed(&mut state, &open, "/");
	let before = state.is_menu_open(&open);

	state.answered(
		Answer::Commands { bot_id: "atlas".to_owned(), commands: Ok(commands()) },
		&idle(),
	);
	state.intent(&open, ComposerIntent::PickCommand("/review".to_owned()), &idle());

	assert!(!before);
	assert_eq!(prompt(&state, &open), "/review ");
}

#[test]
fn opening_a_solo_conversation_reads_its_agent_commands_once() {
	let mut state = State::default();

	state.opened(&solo());
	state.opened(&solo());

	let reads = state.queued.iter().filter(|call| matches!(call, Call::Commands { .. })).count();
	assert_eq!(reads, 1);
}

#[test]
fn a_send_seats_mentioned_outside_agents_and_leaves_with_tokens_and_replies() {
	let mut state = State::default();
	let reply = ReplyLink { message_id: "m-9".to_owned(), excerpt: None };
	let open = Open { reply_links: vec![reply.clone()], ..group() };
	state.draft_mut(GROUP).stage(vec![file("notes")]);

	send(&mut state, &open, "  @Beacon and @Atlas, look  ");

	let preparing = prepared_calls(&state)[0];
	assert_eq!(preparing.seats, [("beacon".to_owned(), "Beacon".to_owned())]);
	assert_eq!(preparing.outgoing.content, "<@beacon> and <@atlas>, look");
	assert_eq!(preparing.outgoing.reply_links, [reply]);
	assert_eq!(preparing.files, [file("notes")]);
}

#[test]
fn the_composer_clears_only_once_the_core_stored_the_message() {
	let mut state = State::default();
	let open = group();
	state.draft_mut(GROUP).stage(vec![file("notes")]);
	let outgoing = send(&mut state, &open, "ship it");
	let stored = outgoing.message_id.clone();
	let holds = move |id: &str| id == stored;
	let live = Live { working: None, holds: &holds };

	prepare(&mut state, &outgoing, &idle());
	let while_sending = (prompt(&state, &open), sent_calls(&state).len());
	state.draft_mut(GROUP).stage(vec![file("later")]);
	state.settle(Some(&open), &live);

	assert_eq!(while_sending, ("ship it".to_owned(), 1));
	assert_eq!(prompt(&state, &open), "");
	assert_eq!(state.draft(GROUP).map(|draft| draft.files.clone()), Some(vec![file("later")]));
}

#[test]
fn sending_is_blocked_without_payload_in_a_closed_mission_and_while_a_send_is_on_its_way() {
	let mut state = State::default();
	typed(&mut state, &group(), "   ");
	state.send(&group(), NOW);
	typed(&mut state, &closed_mission(), "late");
	state.send(&closed_mission(), NOW);
	let blocked = prepared_calls(&state).len();

	send(&mut state, &group(), "once");
	state.send(&group(), NOW);

	assert_eq!(blocked, 0);
	assert_eq!(prepared_calls(&state).len(), 1);
}

#[test]
fn a_refused_attach_keeps_the_draft_and_names_the_limit() {
	let mut state = State::default();
	let open = group();
	state.draft_mut(GROUP).stage(vec![file("big")]);
	let outgoing = send(&mut state, &open, "see attached");
	let refusal = failed("chat_store_attachments", r#"{"kind":"tooMany","count":12,"limit":10}"#);

	state.answered(
		Answer::Prepared {
			conversation_id: GROUP.to_owned(),
			message_id: outgoing.message_id,
			prepared: Err(Refusal::Store(refusal)),
		},
		&idle(),
	);

	assert_eq!(prompt(&state, &open), "see attached");
	assert_eq!(state.draft(GROUP).map(|draft| draft.files.len()), Some(1));
	assert_eq!(
		state.notice(),
		Some((
			said(chat::screen::ATTACHMENTS_REFUSED),
			"A message takes up to 10 files, and 12 are staged. Remove some."
		))
	);
	send(&mut state, &open, "see attached");
	assert_eq!(prepared_calls(&state).len(), 2);
}

#[test]
fn a_failed_send_keeps_the_draft_and_shows_the_failure() {
	let mut state = State::default();
	let open = group();
	let outgoing = send(&mut state, &open, "hello");
	prepare(&mut state, &outgoing, &idle());

	state.sent(GROUP, &outgoing.message_id, Err(unsent(Ok(false))));

	assert_eq!(prompt(&state, &open), "hello");
	assert!(
		notice_title(&state).is_some_and(|title| title.starts_with("Couldn’t send the message"))
	);
}

#[test]
fn a_seat_refusal_names_the_agent() {
	let mut state = State::default();
	let open = group();
	let outgoing = send(&mut state, &open, "@Beacon join");

	state.answered(
		Answer::Prepared {
			conversation_id: GROUP.to_owned(),
			message_id: outgoing.message_id,
			prepared: Err(Refusal::Seat {
				name: "Beacon".to_owned(),
				failure: failed("conversation_add_participant", "no"),
			}),
		},
		&idle(),
	);

	assert_eq!(notice_title(&state), Some("Couldn’t bring Beacon into this conversation. Retry."));
	assert_eq!(prompt(&state, &open), "@Beacon join");
}

#[test]
fn while_a_solo_turn_runs_sent_messages_queue_then_leave_in_order() {
	let mut state = State::default();
	let open = solo();
	let first = send(&mut state, &open, "first");
	prepare(&mut state, &first, &working(SOLO));
	let second = send(&mut state, &open, "second");
	prepare(&mut state, &second, &working(SOLO));
	state.settle(Some(&open), &working(SOLO));
	let while_running = (prompt(&state, &open), sent_calls(&state).len());

	state.settle(Some(&open), &idle());
	let after_turn = sent_calls(&state).iter().map(|sent| sent.shown.clone()).collect::<Vec<_>>();
	state.sent(SOLO, &first.message_id, Ok(()));
	state.settle(Some(&open), &idle());

	assert_eq!(while_running, (String::new(), 0));
	assert_eq!(after_turn, ["first"]);
	assert_eq!(
		sent_calls(&state).iter().map(|sent| sent.shown.as_str()).collect::<Vec<_>>(),
		["first", "second"]
	);
}

#[test]
fn send_now_moves_the_message_first_and_stops_the_turn() {
	let mut state = State::default();
	let open = solo();
	for text in ["first", "second"] {
		let outgoing = send(&mut state, &open, text);
		prepare(&mut state, &outgoing, &working(SOLO));
	}
	let second =
		state.draft(SOLO).map(|draft| draft.queue[1].message_id.clone()).unwrap_or_default();

	state.intent(&open, ComposerIntent::SendQueuedNow(second), &working(SOLO));

	let queue = state
		.draft(SOLO)
		.map(|draft| draft.queue.iter().map(|queued| queued.shown.clone()).collect::<Vec<_>>());
	assert_eq!(queue, Some(vec!["second".to_owned(), "first".to_owned()]));
	assert!(
		state
			.queued
			.iter()
			.any(|call| matches!(call, Call::Cancel { bot_id, .. } if bot_id == "atlas"))
	);
}

#[test]
fn remove_takes_one_message_out_of_the_queue() {
	let mut state = State::default();
	let open = solo();
	let outgoing = send(&mut state, &open, "drop me");
	prepare(&mut state, &outgoing, &working(SOLO));

	state.intent(&open, ComposerIntent::RemoveQueued(outgoing.message_id), &working(SOLO));

	assert_eq!(state.draft(SOLO).map(|draft| draft.queue.len()), Some(0));
}

fn queued_and_sent(state: &mut State, text: &str) -> Outgoing {
	let outgoing = send(state, &solo(), text);
	prepare(state, &outgoing, &working(SOLO));
	state.settle(Some(&solo()), &idle());
	outgoing
}

fn queued_texts(state: &State) -> Vec<String> {
	let queue = state.draft(SOLO).map(|draft| draft.queue.as_slice()).unwrap_or_default();
	queue.iter().map(|queued| queued.shown.clone()).collect()
}

#[test]
fn a_failed_queued_send_that_never_reached_the_thread_returns_to_the_front_held() {
	let mut state = State::default();
	let failing = queued_and_sent(&mut state, "queued");
	let later = send(&mut state, &solo(), "later");
	prepare(&mut state, &later, &working(SOLO));

	state.answered(sent_back(&failing, Ok(false)), &idle());
	state.queued.clear();
	state.settle(Some(&solo()), &idle());

	assert_eq!(queued_texts(&state), ["queued", "later"]);
	assert_eq!(state.draft(SOLO).map(|draft| draft.is_queue_held), Some(true));
	assert!(sent_calls(&state).is_empty());
	assert!(notice_title(&state).is_some());
}

#[test]
fn a_failed_send_that_reached_its_thread_is_not_queued_again_while_another_conversation_is_open() {
	let mut state = State::default();
	let failing = queued_and_sent(&mut state, "already stored");
	let open_elsewhere = group();
	let group_thread_holds = |id: &str| id == "m-in-the-group";
	let live = Live { working: None, holds: &group_thread_holds };

	state.answered(sent_back(&failing, Ok(true)), &live);
	state.queued.clear();
	state.settle(Some(&open_elsewhere), &live);

	assert!(queued_texts(&state).is_empty());
	assert_eq!(state.draft(SOLO).map(|draft| draft.is_queue_held), Some(false));
	assert!(sent_calls(&state).is_empty());
	assert!(
		notice_title(&state).is_some_and(|title| title.starts_with("Couldn’t send the message"))
	);
}

#[test]
fn an_accepted_send_drops_only_the_documents_it_carried() {
	let mut state = State::default();
	let open = group();
	state.draft_mut(GROUP).stage_document(document("roadmap"));
	let outgoing = send(&mut state, &open, "read this");
	prepare(&mut state, &outgoing, &idle());

	state.draft_mut(GROUP).stage_document(document("brief"));
	state.sent(GROUP, &outgoing.message_id, Ok(()));

	assert_eq!(outgoing.documents, ["roadmap.md"]);
	assert_eq!(
		state.draft(GROUP).map(|draft| draft.documents.clone()),
		Some(vec![document("brief")])
	);
	assert_eq!(prompt(&state, &open), "");
}

#[test]
fn a_failed_stop_shows_in_screen_state() {
	let mut state = State::default();

	state.answered(
		Answer::Cancelled { outcome: Ok(CancelOutcome::Failed { failures: Vec::new() }) },
		&idle(),
	);

	assert_eq!(notice_title(&state), Some(said(chat::screen::notice::STOP_FAILED)));
}

#[test]
fn read_files_become_chips_removable_one_by_one() {
	let mut state = State::default();
	let open = group();
	let unread = Unread { name: "locked.pdf".to_owned(), cause: "denied".to_owned() };

	state.answered(
		Answer::Read {
			conversation_id: GROUP.to_owned(),
			files: vec![Ok(file("a")), Ok(file("b")), Err(unread)],
		},
		&idle(),
	);
	state.intent(&open, ComposerIntent::RemoveAttachment("a".to_owned()), &idle());

	assert_eq!(state.draft(GROUP).map(|draft| draft.files.clone()), Some(vec![file("b")]));
	assert_eq!(notice_title(&state), Some(said(chat::screen::ATTACHMENTS_REFUSED)));
}

#[test]
fn files_dropped_or_picked_are_read_for_the_open_conversation() {
	let mut state = State::default();

	state.read_files(&group(), vec!["/tmp/a.png".into()]);
	state.read_files(&closed_mission(), vec!["/tmp/b.png".into()]);

	let reads: Vec<&Call> =
		state.queued.iter().filter(|call| matches!(call, Call::Read { .. })).collect();
	assert_eq!(reads.len(), 1);
}

fn library_item(name: &str, kind: LibraryItemKind) -> LibraryItem {
	LibraryItem {
		name: name.to_owned(),
		kind,
		path: format!("/library/{name}"),
		bytes: 2048,
		modified_at: NOW,
		created_at: None,
	}
}

#[test]
fn the_library_offers_its_documents_and_a_pick_stages_one_chip() {
	let mut state = State::default();
	let open = group();
	state.intent(&open, ComposerIntent::OpenLibrary, &idle());
	let items = vec![
		library_item("roadmap.md", LibraryItemKind::Document),
		library_item("shot.png", LibraryItemKind::Image),
	];
	state.answered(Answer::Library { space_id: "space-1".to_owned(), items: Ok(items) }, &idle());
	let offered: Vec<String> = state.documents().iter().map(|item| item.name.clone()).collect();

	state.intent(&open, ComposerIntent::PickDocument("roadmap.md".to_owned()), &idle());
	state.intent(&open, ComposerIntent::OpenLibrary, &idle());
	state.intent(&open, ComposerIntent::PickDocument("roadmap.md".to_owned()), &idle());

	assert_eq!(offered, ["roadmap.md"]);
	let documents = state.draft(GROUP).map(|draft| draft.documents.clone()).unwrap_or_default();
	assert_eq!(
		documents.iter().map(|document| document.title.as_str()).collect::<Vec<_>>(),
		["roadmap"]
	);
	let outgoing = send(&mut state, &open, "");
	assert_eq!(outgoing.documents, ["roadmap.md"]);
}

#[test]
fn an_unread_library_shows_its_failure() {
	let mut state = State::default();

	state.answered(
		Answer::Library {
			space_id: "space-1".to_owned(),
			items: Err(failed("library_list", "down")),
		},
		&idle(),
	);

	assert_eq!(notice_title(&state), Some(said(common::library::failure::LIST)));
}

#[test]
fn removing_a_reply_chip_releases_it_from_the_thread() {
	let mut state = State::default();

	state.intent(&group(), ComposerIntent::RemoveReply("m-4".to_owned()), &idle());

	assert_eq!(state.released, ["m-4"]);
}
