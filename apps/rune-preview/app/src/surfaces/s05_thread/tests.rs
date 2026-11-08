use kiroshi_core::conversations::contract::{
	PinnedBubble, ReplyLink, TranscriptCompletion, TranscriptMessage, TranscriptPage,
	TranscriptRole,
};

use kiroshi_rune_kit::surfaces::s05_thread::{
	Agent, Author, Row, ThreadEvent, ThreadKind, Transcript, Turn, TurnState, WorkState,
};

use super::conversation::Conversation;
use super::projection::{self, Shown, WORK_LINE};
use super::worker::{Answer, Call};
use super::{Effect, Notice, State};
use crate::events::HostEvent;
use crate::host::HostError;
use crate::model::{AgentEvent, Message, Role, RuntimeScope, ScopedEvent, StreamedMessage};

const CONVERSATION: &str = "c-1";
const BOT: &str = "atlas";
const NOW: i64 = 1_762_400_000_000;

fn atlas() -> Agent {
	Agent { id: BOT.to_owned(), name: "Atlas".to_owned(), hue: None, badge: None }
}

fn solo() -> ThreadKind {
	ThreadKind::Solo(atlas())
}

fn message(seq: i64, role: TranscriptRole, content: &str) -> TranscriptMessage {
	TranscriptMessage {
		id: format!("m{seq}"),
		conversation_id: CONVERSATION.to_owned(),
		turn_id: format!("t{seq}"),
		seq,
		role,
		content: content.to_owned(),
		completion: TranscriptCompletion::Complete,
		created_at: NOW - 60_000,
		author_bot_id: (role == TranscriptRole::Assistant).then(|| BOT.to_owned()),
		author_account_id: None,
		author_name: None,
		written_from: None,
		replied_to_message_id: None,
		replied_to_message_ids: Vec::new(),
		reply_links: Vec::new(),
		documents: Vec::new(),
		runtime_session_id: None,
		continues_turn_id: None,
		web_sources: Vec::new(),
	}
}

fn said(seq: i64) -> TranscriptMessage {
	message(seq, TranscriptRole::User, &format!("said {seq}"))
}

fn page(messages: Vec<TranscriptMessage>, has_more: bool) -> TranscriptPage {
	TranscriptPage {
		conversation_id: CONVERSATION.to_owned(),
		messages,
		arrivals: Vec::new(),
		has_more,
	}
}

fn failed(command: &str) -> HostError {
	HostError::CommandFailed {
		command: command.to_owned(),
		status: 500,
		body: "refused".to_owned(),
	}
}

fn newest(state: &mut State, page: Result<TranscriptPage, HostError>) {
	state.answered(Answer::Paged {
		conversation_id: CONVERSATION.to_owned(),
		before_seq: None,
		page,
	});
}

fn opened_with(messages: Vec<TranscriptMessage>, has_more: bool) -> State {
	let mut state = State::default();
	state.open(CONVERSATION);
	state.queued.clear();
	newest(&mut state, Ok(page(messages, has_more)));
	state
}

fn transcript_of(state: &State, kind: &ThreadKind) -> Transcript {
	let open = state.open.as_ref().expect("a conversation is open");
	projection::transcript(open, &Shown { kind, roster: &[atlas()], now: NOW })
}

fn label(row: &Row) -> String {
	match row {
		Row::Turn(turn) => turn.id.clone(),
		Row::Day(day) => format!("day {day}"),
		Row::NewMessages => "new".to_owned(),
		Row::StartOfHistory => "start".to_owned(),
		Row::Work(line) => line.id.clone(),
		Row::Event(event) => event.id.clone(),
	}
}

fn rows_of(state: &State) -> Vec<Row> {
	match transcript_of(state, &solo()) {
		Transcript::Rows(rows) => rows,
		Transcript::Loading => panic!("the transcript is still loading"),
		Transcript::Failed { title, .. } => panic!("the transcript failed: {title}"),
	}
}

fn labels(state: &State) -> Vec<String> {
	rows_of(state).iter().map(label).collect()
}

fn turn(state: &State, id: &str) -> Turn {
	rows_of(state)
		.into_iter()
		.find_map(|row| match row {
			Row::Turn(turn) if turn.id == id => Some(turn),
			_ => None,
		})
		.unwrap_or_else(|| panic!("no turn {id} in the transcript"))
}

fn open(state: &State) -> &Conversation {
	state.open.as_ref().expect("a conversation is open")
}

fn streamed(state: &mut State, event: AgentEvent) {
	let scope = RuntimeScope { conversation_id: CONVERSATION.to_owned(), bot_id: BOT.to_owned() };
	state.heard(&HostEvent::Agent(ScopedEvent { scope: Some(scope), event }));
}

fn started(state: &mut State, id: &str) {
	let message = StreamedMessage { id: id.to_owned(), text: String::new() };
	streamed(state, AgentEvent::MessageStarted { message });
}

fn stored(state: &mut State) {
	let message = Message {
		id: "m9".to_owned(),
		conversation_id: CONVERSATION.to_owned(),
		seq: 9,
		role: Role::Assistant,
		content: "done".to_owned(),
		author_bot_id: Some(BOT.to_owned()),
		author_name: None,
		created_at: NOW,
	};
	state.heard(&HostEvent::MessageStored(message));
}

fn pin_of(message: TranscriptMessage, block_index: i64) -> PinnedBubble {
	PinnedBubble { message, block_index, pinned_at: NOW - 1_000 }
}

fn pins_landed(state: &mut State, pins: Result<Vec<PinnedBubble>, HostError>) {
	state.answered(Answer::Pins { conversation_id: CONVERSATION.to_owned(), pins });
}

fn notice_title(state: &State) -> Option<String> {
	state.notice.as_ref().map(|notice| notice.title.clone())
}

fn handled(state: &mut State, event: ThreadEvent) -> Option<ThreadEvent> {
	state.handle(event, NOW)
}

#[test]
fn opening_a_conversation_shows_the_skeleton_and_asks_the_core_for_its_newest_page_and_pins() {
	let mut state = State::default();
	state.open(CONVERSATION);
	assert!(matches!(transcript_of(&state, &solo()), Transcript::Loading));
	assert_eq!(
		state.queued,
		[
			Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: None },
			Call::Pins { conversation_id: CONVERSATION.to_owned() },
		]
	);
}

#[test]
fn the_landed_page_shows_its_messages_in_order_below_the_start_of_history() {
	let reply = message(2, TranscriptRole::Assistant, "hello");
	let state = opened_with(vec![reply, said(1)], false);
	assert_eq!(labels(&state), ["start", "m1", "m2"]);
	assert!(matches!(turn(&state, "m1").author, Author::You));
	assert!(matches!(turn(&state, "m2").author, Author::Agent(agent) if agent.id == BOT));
}

#[test]
fn a_page_with_older_messages_shows_no_start_of_history() {
	let state = opened_with(vec![said(5)], true);
	assert_eq!(labels(&state), ["m5"]);
}

#[test]
fn an_empty_conversation_lands_as_no_rows_so_the_view_draws_its_empty_state() {
	let state = opened_with(Vec::new(), false);
	assert!(rows_of(&state).is_empty());
}

#[test]
fn every_kind_reads_the_same_transcript_through_the_one_view() {
	let state = opened_with(vec![said(1)], false);
	let kinds = [
		solo(),
		ThreadKind::Group { title: "Launch".to_owned() },
		ThreadKind::Mission {
			objective: "Ship".to_owned(),
			tools: Vec::new(),
			bot: None,
			now: NOW,
		},
	];
	for kind in &kinds {
		assert!(matches!(transcript_of(&state, kind), Transcript::Rows(rows) if rows.len() == 2));
	}
}

#[test]
fn a_mission_thread_hides_the_summons_that_opened_it() {
	let summons = message(1, TranscriptRole::User, "Carry out this mission.");
	let state = opened_with(vec![summons, said(2)], false);
	let mission = ThreadKind::Mission {
		objective: "Ship".to_owned(),
		tools: Vec::new(),
		bot: None,
		now: NOW,
	};
	let Transcript::Rows(rows) = transcript_of(&state, &mission) else { panic!("no rows") };
	assert_eq!(rows.iter().map(label).collect::<Vec<_>>(), ["start", "m2"]);
	assert_eq!(labels(&state), ["start", "m1", "m2"]);
}

#[test]
fn a_failed_load_shows_the_failure_and_retry_load_asks_again() {
	let mut state = State::default();
	state.open(CONVERSATION);
	state.queued.clear();
	newest(&mut state, Err(failed("conversation_message_page")));
	let Transcript::Failed { title, detail } = transcript_of(&state, &solo()) else {
		panic!("the transcript did not fail")
	};
	let failure = failed("conversation_message_page");
	assert_eq!((title, detail), (failure.title(), failure.detail()));
	assert_eq!(handled(&mut state, ThreadEvent::RetryLoad), None);
	assert!(matches!(transcript_of(&state, &solo()), Transcript::Loading));
	assert!(
		state
			.queued
			.contains(&Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: None })
	);
}

#[test]
fn a_streamed_reply_grows_live_with_the_work_line_below_it() {
	let mut state = opened_with(vec![said(1)], false);
	started(&mut state, "live-1");
	streamed(
		&mut state,
		AgentEvent::MessageDelta { id: "live-1".to_owned(), text: "Hel".to_owned() },
	);
	streamed(
		&mut state,
		AgentEvent::MessageDelta { id: "live-1".to_owned(), text: "lo".to_owned() },
	);
	assert_eq!(labels(&state), ["start", "m1", "live-1", WORK_LINE]);
	let live = turn(&state, "live-1");
	assert_eq!((live.body.as_str(), live.state), ("Hello", TurnState::Streaming));
	let Some(Row::Work(line)) = rows_of(&state).pop() else { panic!("no work line") };
	assert_eq!(line.agents[0].state, WorkState::Writing);
}

#[test]
fn a_tool_activity_names_itself_on_the_work_line_and_the_end_of_the_turn_clears_it() {
	let mut state = opened_with(vec![said(1)], false);
	let activity: crate::model::ToolActivity =
		serde_json::from_value(serde_json::json!({ "title": "Read main.rs", "status": "running" }))
			.expect("the fixture reads as an activity");
	streamed(&mut state, AgentEvent::Activity { activity });
	assert_eq!(open(&state).working[0].label.as_deref(), Some("Read main.rs"));
	assert_eq!(open(&state).working[0].state, WorkState::Tool);
	let ended = serde_json::from_value(serde_json::json!({ "outcome": "completed" }))
		.expect("the fixture reads as an ended turn");
	streamed(&mut state, AgentEvent::TurnEnded { ended });
	assert_eq!(labels(&state), ["start", "m1"]);
}

#[test]
fn an_event_of_another_conversation_leaves_the_thread_alone() {
	let mut state = opened_with(vec![said(1)], false);
	let scope = RuntimeScope { conversation_id: "other".to_owned(), bot_id: BOT.to_owned() };
	let message = StreamedMessage { id: "x".to_owned(), text: "hi".to_owned() };
	let event = AgentEvent::MessageStarted { message };
	state.heard(&HostEvent::Agent(ScopedEvent { scope: Some(scope), event }));
	assert_eq!(labels(&state), ["start", "m1"]);
}

#[test]
fn a_stored_message_rereads_the_newest_page_which_replaces_the_live_reply() {
	let mut state = opened_with(vec![said(1)], false);
	started(&mut state, "live-1");
	stored(&mut state);
	assert_eq!(
		state.queued,
		[Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: None }]
	);
	newest(&mut state, Ok(page(vec![said(1), message(2, TranscriptRole::Assistant, "Hi")], true)));
	assert_eq!(labels(&state), ["start", "m1", "m2", WORK_LINE]);
}

#[test]
fn reaching_the_top_asks_once_for_the_page_before_the_oldest_message() {
	let mut state = opened_with(vec![said(5), said(6)], true);
	state.reached_top();
	state.reached_top();
	assert_eq!(
		state.queued,
		[Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: Some(5) }]
	);
	state.answered(Answer::Paged {
		conversation_id: CONVERSATION.to_owned(),
		before_seq: Some(5),
		page: Ok(page(vec![said(3), said(4)], false)),
	});
	assert_eq!(labels(&state), ["start", "m3", "m4", "m5", "m6"]);
	state.queued.clear();
	state.reached_top();
	assert!(state.queued.is_empty());
}

#[test]
fn a_failed_older_page_raises_a_notice_and_keeps_the_messages() {
	let mut state = opened_with(vec![said(5)], true);
	state.reached_top();
	state.answered(Answer::Paged {
		conversation_id: CONVERSATION.to_owned(),
		before_seq: Some(5),
		page: Err(failed("conversation_message_page")),
	});
	assert_eq!(notice_title(&state).as_deref(), Some("Couldn’t load earlier messages"));
	assert_eq!(labels(&state), ["m5"]);
	assert!(!open(&state).is_loading_older);
}

#[test]
fn scrolled_up_a_new_message_is_marked_and_reaching_the_bottom_clears_the_mark() {
	let mut state = opened_with(vec![said(1)], false);
	state.scrolled(false);
	newest(&mut state, Ok(page(vec![said(1), said(2), said(3)], false)));
	assert_eq!(labels(&state), ["start", "m1", "new", "m2", "m3"]);
	state.scrolled(true);
	assert_eq!(labels(&state), ["start", "m1", "m2", "m3"]);
}

#[test]
fn at_the_bottom_new_messages_follow_without_a_mark() {
	let mut state = opened_with(vec![said(1)], false);
	started(&mut state, "live-1");
	newest(&mut state, Ok(page(vec![said(1), said(2)], false)));
	assert!(!labels(&state).contains(&"new".to_owned()));
}

#[test]
fn scrolled_up_a_reply_that_starts_streaming_is_marked() {
	let mut state = opened_with(vec![said(1)], false);
	state.scrolled(false);
	started(&mut state, "live-1");
	assert_eq!(labels(&state), ["start", "m1", "new", "live-1", WORK_LINE]);
}

#[test]
fn copy_puts_the_message_text_on_the_clipboard() {
	let mut state = opened_with(vec![said(1)], false);
	assert_eq!(handled(&mut state, ThreadEvent::Copy("m1".to_owned())), None);
	assert_eq!(state.effects, [Effect::Copy("said 1".to_owned())]);
}

#[test]
fn reply_holds_the_message_once_as_the_reply_target() {
	let mut state = opened_with(vec![said(1), said(2)], false);
	handled(&mut state, ThreadEvent::Reply("m1".to_owned()));
	handled(&mut state, ThreadEvent::Reply("m2".to_owned()));
	handled(&mut state, ThreadEvent::Reply("m1".to_owned()));
	let link = |id: &str| ReplyLink { message_id: id.to_owned(), excerpt: None };
	assert_eq!(state.reply_links(), [link("m1"), link("m2")]);
}

#[test]
fn pin_asks_the_core_then_rereads_the_pins_which_mark_the_turn_and_fill_the_panel() {
	let mut state = opened_with(vec![said(1)], false);
	handled(&mut state, ThreadEvent::Pin("m1".to_owned()));
	assert_eq!(
		state.queued,
		[Call::Pin {
			conversation_id: CONVERSATION.to_owned(),
			message_id: "m1".to_owned(),
			pinned_at: NOW
		}]
	);
	state.queued.clear();
	state.answered(Answer::Pinned { conversation_id: CONVERSATION.to_owned(), outcome: Ok(()) });
	assert_eq!(state.queued, [Call::Pins { conversation_id: CONVERSATION.to_owned() }]);
	pins_landed(&mut state, Ok(vec![pin_of(said(1), 0)]));
	assert!(turn(&state, "m1").pinned);
	let pinned = projection::pinned(open(&state), &[atlas()], NOW);
	assert_eq!(pinned.iter().map(|pin| pin.id.as_str()).collect::<Vec<_>>(), ["m1"]);
}

#[test]
fn unpin_releases_every_block_the_message_holds() {
	let mut state = opened_with(vec![said(1)], false);
	pins_landed(&mut state, Ok(vec![pin_of(said(1), 0), pin_of(said(1), 2)]));
	handled(&mut state, ThreadEvent::Unpin("m1".to_owned()));
	assert_eq!(
		state.queued,
		[Call::Unpin {
			conversation_id: CONVERSATION.to_owned(),
			message_id: "m1".to_owned(),
			block_indexes: vec![0, 2],
		}]
	);
}

#[test]
fn a_refused_pin_raises_a_notice_and_keeps_the_pins_held() {
	let mut state = opened_with(vec![said(1)], false);
	pins_landed(&mut state, Ok(vec![pin_of(said(1), 0)]));
	handled(&mut state, ThreadEvent::Unpin("m1".to_owned()));
	state.answered(Answer::Pinned {
		conversation_id: CONVERSATION.to_owned(),
		outcome: Err(failed("conversation_unpin_message")),
	});
	assert_eq!(notice_title(&state).as_deref(), Some("Couldn’t sync pinned messages"));
	assert!(turn(&state, "m1").pinned);
	assert!(state.queued.contains(&Call::Pins { conversation_id: CONVERSATION.to_owned() }));
}

#[test]
fn unreadable_pins_raise_a_notice_and_the_notice_action_dismisses_it() {
	let mut state = opened_with(vec![said(1)], false);
	pins_landed(&mut state, Err(failed("conversation_pinned_messages")));
	assert_eq!(notice_title(&state).as_deref(), Some("Couldn’t sync pinned messages"));
	handled(&mut state, ThreadEvent::NoticeAction);
	assert_eq!(state.notice, None::<Notice>);
}

#[test]
fn jumping_to_a_held_pin_scrolls_to_its_turn() {
	let mut state = opened_with(vec![said(1)], false);
	handled(&mut state, ThreadEvent::JumpToPinned("m1".to_owned()));
	assert_eq!(state.effects, [Effect::Reveal("m1".to_owned())]);
}

#[test]
fn jumping_to_an_older_quote_loads_pages_until_it_is_held_then_scrolls_to_it() {
	let mut state = opened_with(vec![said(9)], true);
	handled(&mut state, ThreadEvent::OpenQuote("m3".to_owned()));
	assert_eq!(
		state.queued,
		[Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: Some(9) }]
	);
	state.queued.clear();
	state.answered(Answer::Paged {
		conversation_id: CONVERSATION.to_owned(),
		before_seq: Some(9),
		page: Ok(page(vec![said(7)], true)),
	});
	assert!(state.effects.is_empty());
	assert_eq!(
		state.queued,
		[Call::Page { conversation_id: CONVERSATION.to_owned(), before_seq: Some(7) }]
	);
	state.answered(Answer::Paged {
		conversation_id: CONVERSATION.to_owned(),
		before_seq: Some(7),
		page: Ok(page(vec![said(3)], false)),
	});
	assert_eq!(state.effects, [Effect::Reveal("m3".to_owned())]);
}

#[test]
fn open_link_opens_the_url() {
	let mut state = opened_with(vec![said(1)], false);
	handled(&mut state, ThreadEvent::OpenLink("https://kiroshi.app".to_owned()));
	assert_eq!(state.effects, [Effect::OpenUrl("https://kiroshi.app".to_owned())]);
}

#[test]
fn toggle_work_opens_and_closes_the_work_line() {
	let mut state = opened_with(vec![said(1)], false);
	started(&mut state, "live-1");
	handled(&mut state, ThreadEvent::ToggleWork(WORK_LINE.to_owned()));
	let Some(Row::Work(line)) = rows_of(&state).pop() else { panic!("no work line") };
	assert!(line.open);
	handled(&mut state, ThreadEvent::ToggleWork(WORK_LINE.to_owned()));
	let Some(Row::Work(line)) = rows_of(&state).pop() else { panic!("no work line") };
	assert!(!line.open);
}

#[test]
fn events_owned_elsewhere_are_forwarded() {
	let mut state = opened_with(vec![said(1)], false);
	for event in [
		ThreadEvent::Retry("m1".to_owned()),
		ThreadEvent::CancelQueued("m1".to_owned()),
		ThreadEvent::QuoteSelection,
		ThreadEvent::OpenAttachment { turn: "m1".to_owned(), index: 0 },
	] {
		assert_eq!(handled(&mut state, event.clone()), Some(event));
	}
}

#[test]
fn an_answer_for_a_conversation_left_behind_is_dropped() {
	let mut state = opened_with(vec![said(1)], false);
	state.open("c-2");
	newest(&mut state, Ok(page(vec![said(4)], false)));
	assert!(matches!(transcript_of(&state, &solo()), Transcript::Loading));
}
