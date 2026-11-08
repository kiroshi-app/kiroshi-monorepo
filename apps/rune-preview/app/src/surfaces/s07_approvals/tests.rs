use std::collections::HashMap;

use kiroshi_core::agent::contract::{
	AgentEvent, AskedQuestion, EventTurn, PermissionDecision, PermissionRequest, QuestionOption,
	QuestionRequest, RuntimeScope, ScopedEvent,
};
use kiroshi_core::conversations::contract::NewUserMessage;
use rune::TextEdit;
use serde_json::json;

use kiroshi_rune_kit::surfaces::s04_boot::notice::NoticeEvent;
use kiroshi_rune_kit::surfaces::s07_approvals::{ApprovalEvent, QuestionEvent};

use super::calls::{Answer, Call};
use super::{Heard, State, heard_of};
use crate::host::HostError;
use crate::model;

const CONVERSATION: &str = "conversation-1";

const ELSEWHERE: &str = "conversation-2";

const TURN: &str = "turn-1";

const NOW: i64 = 1_700_000_000_000;

fn scope_in(conversation_id: &str) -> RuntimeScope {
	RuntimeScope {
		conversation_id: conversation_id.to_owned(),
		bot_id: "bot-1".to_owned(),
		runtime_session_id: "session-1".to_owned(),
		epoch: 1,
	}
}

fn foreign_scope() -> RuntimeScope {
	RuntimeScope {
		runtime_session_id: "session-on-another-device".to_owned(),
		epoch: 7,
		bot_id: "bot-of-a-member".to_owned(),
		..scope_in(CONVERSATION)
	}
}

fn permission(id: &str) -> PermissionRequest {
	PermissionRequest {
		id: id.to_owned(),
		tool_name: "Bash".to_owned(),
		title: "Run a command".to_owned(),
		detail: Some("ls -la".to_owned()),
	}
}

fn option(label: &str) -> QuestionOption {
	QuestionOption { label: label.to_owned(), description: None, preview: None }
}

fn asked(question: &str, labels: &[&str], multi_select: bool) -> AskedQuestion {
	AskedQuestion {
		header: question.to_owned(),
		question: question.to_owned(),
		options: labels.iter().map(|label| option(label)).collect(),
		multi_select,
	}
}

fn question(id: &str) -> QuestionRequest {
	QuestionRequest {
		id: id.to_owned(),
		questions: vec![
			asked("Which plan?", &["Free", "Pro"], false),
			asked("Which channels?", &["Mail", "Chat", "Phone"], true),
		],
		subject: None,
	}
}

fn single_question(id: &str) -> QuestionRequest {
	QuestionRequest {
		id: id.to_owned(),
		questions: vec![asked("Which plan?", &["Free", "Pro"], false)],
		subject: None,
	}
}

fn refused() -> HostError {
	HostError::InProcess { cause: "the session is gone".to_owned() }
}

fn asking(state: &mut State, scope: RuntimeScope, request: QuestionRequest) {
	state.heard(Heard::Question { scope, turn_id: Some(TURN.to_owned()), request });
}

fn requesting(state: &mut State, id: &str) {
	state.heard(Heard::Permission { scope: scope_in(CONVERSATION), request: permission(id) });
}

fn approval_ids(state: &State) -> Vec<&str> {
	state.approvals.iter().map(|approval| approval.request.id.as_str()).collect()
}

fn drained(state: &mut State) -> Vec<Call> {
	std::mem::take(&mut state.queued)
}

fn nothing_shown(_: &str) -> bool {
	false
}

fn asking_shown(message_id: &str) -> bool {
	message_id == "question-q1"
}

fn answered_with(state: &mut State, id: &str, outcome: Result<(), HostError>) {
	state.received(Answer::Answered { id: id.to_owned(), outcome }, NOW, &asking_shown);
}

fn written(state: &mut State) -> NewUserMessage {
	match drained(state).as_slice() {
		[Call::Write { request_id, message }] if request_id == "q1" => message.clone(),
		calls => panic!("the answer is not written: {calls:?}"),
	}
}

fn typed(state: &mut State, id: &str, text: &str) {
	*state.edit_mut(id) = TextEdit::new(text);
	state.question_event(id, QuestionEvent::Typed);
}

#[test]
fn a_permission_event_from_the_core_is_heard_with_its_tool_and_detail() {
	let scoped = ScopedEvent {
		scope: Some(scope_in(CONVERSATION)),
		turn: None,
		event: AgentEvent::PermissionRequested { request: permission("p1") },
	};
	let payload = serde_json::to_value(&scoped).expect("the event serialises");

	let heard = heard_of(&payload).expect("the prompt is heard").expect("the prompt reads");

	assert_eq!(
		heard,
		Heard::Permission { scope: scope_in(CONVERSATION), request: permission("p1") }
	);
}

#[test]
fn a_question_event_carries_its_turn() {
	let scoped = ScopedEvent {
		scope: Some(scope_in(CONVERSATION)),
		turn: Some(EventTurn {
			turn_id: TURN.to_owned(),
			conversation_id: CONVERSATION.to_owned(),
			continues_turn_id: None,
		}),
		event: AgentEvent::QuestionRequested { request: question("q1") },
	};
	let payload = serde_json::to_value(&scoped).expect("the event serialises");

	let heard = heard_of(&payload).expect("the prompt is heard").expect("the prompt reads");

	assert_eq!(
		heard,
		Heard::Question {
			scope: scope_in(CONVERSATION),
			turn_id: Some(TURN.to_owned()),
			request: question("q1"),
		}
	);
}

#[test]
fn other_agent_events_are_left_to_the_thread() {
	let payload = json!({ "scope": null, "event": { "type": "tasksPending", "count": 1 } });

	assert!(heard_of(&payload).is_none());
}

#[test]
fn a_permission_without_a_scope_is_unreadable() {
	let payload = json!({
		"scope": null,
		"event": { "type": "permissionRequested", "request": permission("p1") },
	});

	assert!(heard_of(&payload).is_some_and(|heard| heard.is_err()));
}

#[test]
fn a_requested_permission_waits_for_a_decision() {
	let mut state = State::default();

	requesting(&mut state, "p1");
	requesting(&mut state, "p1");

	assert_eq!(state.approvals.len(), 1);
	assert_eq!(state.approvals[0].request, permission("p1"));
	assert_eq!(state.approvals[0].resolved, None);
}

#[test]
fn approving_calls_the_core_with_allow_once_through_the_asking_scope() {
	let mut state = State::default();
	requesting(&mut state, "p1");

	state.approval_event("p1", ApprovalEvent::AllowOnce);

	assert_eq!(
		drained(&mut state),
		vec![Call::Respond {
			scope: scope_in(CONVERSATION),
			id: "p1".to_owned(),
			decision: PermissionDecision::AllowOnce,
		}]
	);
}

#[test]
fn refusing_calls_the_core_with_deny() {
	let mut state = State::default();
	requesting(&mut state, "p1");

	state.approval_event("p1", ApprovalEvent::Deny);

	assert_eq!(
		drained(&mut state),
		vec![Call::Respond {
			scope: scope_in(CONVERSATION),
			id: "p1".to_owned(),
			decision: PermissionDecision::Deny,
		}]
	);
}

#[test]
fn a_second_decision_while_one_is_in_flight_sends_nothing() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	drained(&mut state);

	state.approval_event("p1", ApprovalEvent::Deny);

	assert!(drained(&mut state).is_empty());
}

#[test]
fn the_resolved_event_shows_the_decision_and_closes_the_choice() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	state.received(
		Answer::Responded {
			id: "p1".to_owned(),
			decision: PermissionDecision::AllowOnce,
			outcome: Ok(()),
		},
		NOW,
		&nothing_shown,
	);

	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::AllowOnce });
	drained(&mut state);
	state.approval_event("p1", ApprovalEvent::Deny);

	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::AllowOnce));
	assert!(drained(&mut state).is_empty());
}

#[test]
fn a_refused_decision_keeps_the_approval_open_with_its_failure() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	drained(&mut state);

	state.received(
		Answer::Responded {
			id: "p1".to_owned(),
			decision: PermissionDecision::AllowOnce,
			outcome: Err(refused()),
		},
		NOW,
		&nothing_shown,
	);
	let is_failure_shown = state.approvals[0].call.failure().is_some();
	state.approval_event("p1", ApprovalEvent::AllowOnce);

	assert!(is_failure_shown);
	assert_eq!(state.approvals[0].resolved, None);
	assert_eq!(drained(&mut state).len(), 1);
}

#[test]
fn dismissing_the_decision_failure_clears_it() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	state.received(
		Answer::Responded {
			id: "p1".to_owned(),
			decision: PermissionDecision::AllowOnce,
			outcome: Err(refused()),
		},
		NOW,
		&nothing_shown,
	);

	state.dismiss_approval_failure("p1");

	assert!(state.approvals[0].call.failure().is_none());
}

#[test]
fn the_input_of_an_approval_opens_and_closes() {
	let mut state = State::default();
	requesting(&mut state, "p1");

	state.approval_event("p1", ApprovalEvent::ToggleInput);
	let is_opened = state.approvals[0].is_input_open;
	state.approval_event("p1", ApprovalEvent::ToggleInput);

	assert!(is_opened);
	assert!(!state.approvals[0].is_input_open);
}

#[test]
fn a_new_prompt_clears_the_settled_ones_of_its_conversation_only() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.heard(Heard::Permission { scope: scope_in(ELSEWHERE), request: permission("p2") });
	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::Deny });
	state.heard(Heard::Resolved { id: "p2".to_owned(), decision: PermissionDecision::Deny });

	requesting(&mut state, "p3");

	let ids = approval_ids(&state);
	assert_eq!(ids, vec!["p2", "p3"]);
}

#[test]
fn a_requested_question_shows_every_question_with_a_blank_draft() {
	let mut state = State::default();

	asking(&mut state, scope_in(CONVERSATION), question("q1"));

	let shown = &state.questions[0];
	assert_eq!(shown.request, question("q1"));
	assert_eq!(shown.drafts.len(), 2);
	assert!(shown.drafts.iter().all(|draft| !draft.is_answered()));
}

#[test]
fn choosing_an_option_moves_to_the_next_unanswered_question() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));

	state.question_event("q1", QuestionEvent::Choose(1));

	assert_eq!(state.questions[0].drafts[0].chosen, vec![1]);
	assert_eq!(state.questions[0].shown, 1);
}

#[test]
fn toggling_picks_several_options_and_unpicks_one() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Show(1));

	state.question_event("q1", QuestionEvent::Toggle(0));
	state.question_event("q1", QuestionEvent::Toggle(2));
	state.question_event("q1", QuestionEvent::Toggle(0));

	assert_eq!(state.questions[0].drafts[1].chosen, vec![2]);
	assert_eq!(state.questions[0].shown, 1);
}

#[test]
fn typing_an_answer_drops_the_chosen_options_and_choosing_clears_the_text() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Show(1));
	state.question_event("q1", QuestionEvent::Toggle(0));

	typed(&mut state, "q1", "Pigeons");
	let chosen_after_typing = state.questions[0].drafts[1].chosen.clone();
	state.question_event("q1", QuestionEvent::Toggle(1));

	assert!(chosen_after_typing.is_empty());
	assert_eq!(state.questions[0].drafts[1].edit.text, "");
}

#[test]
fn submitting_a_blank_question_refuses_it_and_sends_nothing() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));

	state.question_event("q1", QuestionEvent::Submit);

	assert!(state.questions[0].is_refused);
	assert!(drained(&mut state).is_empty());
}

#[test]
fn submitting_with_a_question_left_shows_it_first() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Show(1));
	state.question_event("q1", QuestionEvent::Toggle(0));

	state.question_event("q1", QuestionEvent::Submit);

	assert_eq!(state.questions[0].shown, 0);
	assert!(drained(&mut state).is_empty());
}

#[test]
fn submitting_answers_calls_the_core_with_every_answer() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Choose(1));
	state.question_event("q1", QuestionEvent::Toggle(0));
	state.question_event("q1", QuestionEvent::Toggle(2));

	state.question_event("q1", QuestionEvent::Submit);

	let answers = HashMap::from([
		("Which plan?".to_owned(), "Pro".to_owned()),
		("Which channels?".to_owned(), "Mail, Phone".to_owned()),
	]);
	assert_eq!(
		drained(&mut state),
		vec![Call::Answer { scope: scope_in(CONVERSATION), id: "q1".to_owned(), answers }]
	);
}

#[test]
fn a_typed_answer_wins_over_the_options() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	typed(&mut state, "q1", "  Enterprise  ");

	state.question_event("q1", QuestionEvent::Submit);

	let answers = HashMap::from([("Which plan?".to_owned(), "Enterprise".to_owned())]);
	assert_eq!(
		drained(&mut state),
		vec![Call::Answer { scope: scope_in(CONVERSATION), id: "q1".to_owned(), answers }]
	);
}

#[test]
fn a_second_submit_while_the_answer_is_in_flight_sends_nothing() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	state.question_event("q1", QuestionEvent::Submit);
	state.question_event("q1", QuestionEvent::Skip);

	assert!(state.questions[0].call.is_sending());
	assert!(drained(&mut state).is_empty());
}

#[test]
fn an_accepted_answer_replaces_the_prompt_and_writes_it_into_the_thread() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	typed(&mut state, "q1", "By pigeon");
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	answered_with(&mut state, "q1", Ok(()));

	assert!(state.questions.is_empty());
	assert_eq!(state.answered[0].request, question("q1"));
	assert_eq!(state.answered[0].picks[0].chosen, vec![0]);
	let message = written(&mut state);
	assert_eq!(message.conversation_id, CONVERSATION);
	assert_eq!(message.turn_id, TURN);
	assert_eq!(message.author_bot_id, None);
	assert_eq!(message.replied_to_message_id.as_deref(), Some("question-q1"));
	assert_eq!(message.content, "Free\n\nBy pigeon");
	assert_eq!(message.created_at, NOW);
}

#[test]
fn an_answer_with_no_turn_is_not_written() {
	let mut state = State::default();
	let request = single_question("q1");
	state.heard(Heard::Question { scope: scope_in(CONVERSATION), turn_id: None, request });
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	answered_with(&mut state, "q1", Ok(()));

	assert_eq!(state.answered.len(), 1);
	assert!(drained(&mut state).is_empty());
}

#[test]
fn the_resolved_event_of_an_answer_in_flight_keeps_the_prompt_until_the_core_answers() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);

	state.heard(Heard::Resolved { id: "q1".to_owned(), decision: PermissionDecision::AllowOnce });
	answered_with(&mut state, "q1", Ok(()));

	assert_eq!(state.answered.len(), 1);
}

#[test]
fn a_question_resolved_elsewhere_leaves() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));

	state.heard(Heard::Resolved { id: "q1".to_owned(), decision: PermissionDecision::Deny });

	assert!(state.questions.is_empty());
}

#[test]
fn a_refused_answer_keeps_the_prompt_open_with_its_failure_and_its_drafts() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(1));
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	answered_with(&mut state, "q1", Err(refused()));
	state.question_event("q1", QuestionEvent::Submit);

	assert!(state.answered.is_empty());
	assert_eq!(state.questions[0].drafts[0].chosen, vec![1]);
	assert!(state.questions[0].call.is_sending());
	assert_eq!(drained(&mut state).len(), 1);
}

#[test]
fn the_failure_stays_on_the_prompt_until_it_is_sent_again() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(1));
	state.question_event("q1", QuestionEvent::Submit);

	answered_with(&mut state, "q1", Err(refused()));

	assert!(state.questions[0].call.failure().is_some());
}

#[test]
fn skipping_a_question_denies_it_through_its_scope_and_closes_it() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));

	state.question_event("q1", QuestionEvent::Skip);
	let calls = drained(&mut state);
	state.received(
		Answer::Responded {
			id: "q1".to_owned(),
			decision: PermissionDecision::Deny,
			outcome: Ok(()),
		},
		NOW,
		&nothing_shown,
	);

	assert_eq!(
		calls,
		vec![Call::Respond {
			scope: scope_in(CONVERSATION),
			id: "q1".to_owned(),
			decision: PermissionDecision::Deny,
		}]
	);
	assert!(state.questions.is_empty());
}

#[test]
fn a_refused_skip_keeps_the_question_with_its_failure() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Skip);

	state.received(
		Answer::Responded {
			id: "q1".to_owned(),
			decision: PermissionDecision::Deny,
			outcome: Err(refused()),
		},
		NOW,
		&nothing_shown,
	);

	assert!(state.questions[0].call.failure().is_some());
}

#[test]
fn opening_a_conversation_reads_its_pending_questions() {
	let mut state = State::default();

	state.opened(CONVERSATION);

	assert_eq!(
		drained(&mut state),
		vec![Call::Pending { conversation_id: CONVERSATION.to_owned() }]
	);
}

#[test]
fn pending_questions_read_from_the_core_are_shown() {
	let mut state = State::default();
	let pending = ScopedEvent {
		scope: Some(scope_in(CONVERSATION)),
		turn: None,
		event: AgentEvent::QuestionRequested { request: question("q1") },
	};

	state.received(
		Answer::Pending { conversation_id: CONVERSATION.to_owned(), read: Ok(vec![pending]) },
		NOW,
		&nothing_shown,
	);

	assert_eq!(state.questions[0].request, question("q1"));
}

#[test]
fn a_question_already_shown_keeps_its_drafts_when_read_again() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), question("q1"));
	state.question_event("q1", QuestionEvent::Choose(1));
	let pending = ScopedEvent {
		scope: Some(scope_in(CONVERSATION)),
		turn: None,
		event: AgentEvent::QuestionRequested { request: question("q1") },
	};

	state.received(
		Answer::Pending { conversation_id: CONVERSATION.to_owned(), read: Ok(vec![pending]) },
		NOW,
		&nothing_shown,
	);

	assert_eq!(state.questions.len(), 1);
	assert_eq!(state.questions[0].drafts[0].chosen, vec![1]);
}

#[test]
fn a_failed_pending_read_is_shown_and_retried() {
	let mut state = State::default();
	state.received(
		Answer::Pending { conversation_id: CONVERSATION.to_owned(), read: Err(refused()) },
		NOW,
		&nothing_shown,
	);
	let is_shown = state.read_failure.is_some();

	state.read_notice_event(NoticeEvent::Retry);

	assert!(is_shown);
	assert_eq!(
		drained(&mut state),
		vec![Call::Pending { conversation_id: CONVERSATION.to_owned() }]
	);
}

#[test]
fn a_foreign_question_is_answered_through_the_scope_that_asked() {
	let mut state = State::default();
	asking(&mut state, foreign_scope(), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));

	state.question_event("q1", QuestionEvent::Submit);

	let answers = HashMap::from([("Which plan?".to_owned(), "Free".to_owned())]);
	assert_eq!(
		drained(&mut state),
		vec![Call::Answer { scope: foreign_scope(), id: "q1".to_owned(), answers }]
	);
}

#[test]
fn a_foreign_answer_is_written_into_the_turn_that_asked() {
	let mut state = State::default();
	asking(&mut state, foreign_scope(), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	answered_with(&mut state, "q1", Ok(()));

	let message = written(&mut state);
	assert_eq!(message.turn_id, TURN);
	assert_eq!(message.replied_to_message_id.as_deref(), Some("question-q1"));
}

#[test]
fn a_failed_write_is_kept_on_the_answered_card_and_retried() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	answered_with(&mut state, "q1", Ok(()));
	drained(&mut state);

	state.received(
		Answer::Written { request_id: "q1".to_owned(), outcome: Err(refused()) },
		NOW,
		&nothing_shown,
	);
	let is_shown = state.answered[0].written.failure().is_some();
	state.written_notice_event("q1", NoticeEvent::Retry, &asking_shown);

	assert!(is_shown);
	assert!(matches!(drained(&mut state).as_slice(), [Call::Write { .. }]));
}

#[test]
fn minimising_shows_the_waiting_bar_and_expanding_brings_the_prompt_back() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));

	state.question_event("q1", QuestionEvent::Minimise);
	let is_minimised = state.questions[0].is_minimised;
	state.question_event("q1", QuestionEvent::Expand);

	assert!(is_minimised);
	assert!(!state.questions[0].is_minimised);
}

fn model_scope(conversation_id: &str) -> model::RuntimeScope {
	model::RuntimeScope { conversation_id: conversation_id.to_owned(), bot_id: "bot-1".to_owned() }
}

fn turn_ended() -> model::AgentEvent {
	model::AgentEvent::TurnEnded { ended: model::TurnEnded { outcome: "completed".to_owned() } }
}

fn responded(state: &mut State, id: &str, decision: PermissionDecision) {
	let answer = Answer::Responded { id: id.to_owned(), decision, outcome: Ok(()) };
	state.received(answer, NOW, &nothing_shown);
}

fn answered_but_not_shown(state: &mut State) {
	let answer = Answer::Answered { id: "q1".to_owned(), outcome: Ok(()) };
	state.received(answer, NOW, &nothing_shown);
}

#[test]
fn an_answer_whose_question_is_not_in_the_transcript_replies_to_nothing() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	drained(&mut state);

	answered_but_not_shown(&mut state);

	let message = written(&mut state);
	assert_eq!(message.replied_to_message_id, None);
	assert_eq!(message.content, "Free");
}

#[test]
fn a_retried_write_checks_the_transcript_again() {
	let mut state = State::default();
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);
	answered_but_not_shown(&mut state);
	drained(&mut state);
	let refusal = Answer::Written { request_id: "q1".to_owned(), outcome: Err(refused()) };
	state.received(refusal, NOW, &nothing_shown);

	state.written_notice_event("q1", NoticeEvent::Retry, &asking_shown);

	assert_eq!(written(&mut state).replied_to_message_id.as_deref(), Some("question-q1"));
}

#[test]
fn an_accepted_decision_resolves_the_approval_before_the_core_event() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::Deny);
	drained(&mut state);

	responded(&mut state, "p1", PermissionDecision::Deny);
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	state.approval_event("p1", ApprovalEvent::Deny);

	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::Deny));
	assert!(drained(&mut state).is_empty());
}

#[test]
fn a_later_resolved_event_shows_its_decision_over_the_local_one() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	responded(&mut state, "p1", PermissionDecision::AllowOnce);

	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::Deny });

	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::Deny));
}

#[test]
fn a_resolved_event_heard_before_the_core_answers_keeps_its_decision() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);

	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::Deny });
	responded(&mut state, "p1", PermissionDecision::AllowOnce);

	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::Deny));
	assert!(!state.approvals[0].call.is_sending());
}

#[test]
fn a_turn_end_drops_the_open_prompts_of_its_run_only() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.heard(Heard::Permission { scope: scope_in(ELSEWHERE), request: permission("p2") });
	state.heard(Heard::Permission { scope: foreign_scope(), request: permission("p3") });
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	asking(&mut state, scope_in(ELSEWHERE), single_question("q2"));

	state.heard_agent(&model_scope(CONVERSATION), &turn_ended());

	let approvals = approval_ids(&state);
	let questions: Vec<&str> =
		state.questions.iter().map(|asked| asked.request.id.as_str()).collect();
	assert_eq!(approvals, vec!["p2", "p3"]);
	assert_eq!(questions, vec!["q2"]);
}

#[test]
fn a_turn_end_keeps_the_resolved_approvals_on_show() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::AllowOnce });

	state.heard_agent(&model_scope(CONVERSATION), &turn_ended());

	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::AllowOnce));
}

#[test]
fn a_failed_turn_keeps_the_open_prompts_of_its_run() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));

	let failed = model::AgentEvent::Failed { error: json!({ "kind": "notAuthenticated" }) };
	state.heard_agent(&model_scope(CONVERSATION), &failed);

	assert_eq!(approval_ids(&state), vec!["p1"]);
	assert_eq!(state.approvals[0].resolved, None);
	assert_eq!(state.questions.len(), 1);
	assert_eq!(state.questions[0].request.id, "q1");
}

#[test]
fn other_agent_events_leave_the_prompts() {
	let mut state = State::default();
	requesting(&mut state, "p1");

	let running = model::AgentEvent::TurnChanged { state: model::TurnState::Running };
	state.heard_agent(&model_scope(CONVERSATION), &running);

	assert_eq!(state.approvals.len(), 1);
}

#[test]
fn a_closed_session_is_heard_from_the_core() {
	let crashed = json!({
		"scope": scope_in(CONVERSATION),
		"event": { "type": "connectionChanged", "state": "crashed" },
	});
	let ready = json!({
		"scope": scope_in(CONVERSATION),
		"event": { "type": "connectionChanged", "state": "ready" },
	});

	let heard = heard_of(&crashed).expect("the close is heard").expect("the close reads");

	assert_eq!(heard, Heard::Closed { scope: scope_in(CONVERSATION) });
	assert!(heard_of(&ready).is_none());
}

#[test]
fn a_closed_session_drops_the_open_prompts_of_its_scope_only() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.heard(Heard::Permission { scope: foreign_scope(), request: permission("p2") });
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));

	state.heard(Heard::Closed { scope: scope_in(CONVERSATION) });

	let approvals = approval_ids(&state);
	assert_eq!(approvals, vec!["p2"]);
	assert!(state.questions.is_empty());
}

#[test]
fn a_turn_end_keeps_the_prompts_whose_call_is_in_flight_until_it_lands() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	asking(&mut state, scope_in(CONVERSATION), single_question("q1"));
	state.question_event("q1", QuestionEvent::Choose(0));
	state.question_event("q1", QuestionEvent::Submit);

	state.heard_agent(&model_scope(CONVERSATION), &turn_ended());
	state.heard(Heard::Closed { scope: scope_in(CONVERSATION) });
	let are_kept = state.approvals.len() == 1 && state.questions.len() == 1;
	responded(&mut state, "p1", PermissionDecision::AllowOnce);
	answered_with(&mut state, "q1", Ok(()));

	assert!(are_kept);
	assert_eq!(state.approvals[0].resolved, Some(PermissionDecision::AllowOnce));
	assert_eq!(state.answered.len(), 1);
}

#[test]
fn a_resolved_approval_in_flight_survives_a_new_prompt_until_it_lands() {
	let mut state = State::default();
	requesting(&mut state, "p1");
	state.approval_event("p1", ApprovalEvent::AllowOnce);
	state.heard(Heard::Resolved { id: "p1".to_owned(), decision: PermissionDecision::AllowOnce });

	requesting(&mut state, "p2");

	assert!(state.approvals.iter().any(|approval| approval.request.id == "p1"));
	assert!(state.approvals[0].call.is_sending());
}
