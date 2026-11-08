use kiroshi_core::routines::contract::{
	FilterMatchMode, FilterOperator, Refusal, Routine, RoutineKey, RoutineRun, TriggerDecision,
	TriggerSource,
};
use serde_json::{Value, json};

use kiroshi_rune_kit::surfaces::s09_routines::RoutinesEvent;
use kiroshi_rune_kit::surfaces::s09_routines::form::{FormField, FormRefusal, Picker, WebhookPart};
use kiroshi_rune_kit::surfaces::s09_routines::panel::{Failure, Page};

use super::calls::{Answer, Call, Listed, RUN_PAGE};
use super::form::{KeyRead, Refused, refusal_of};
use super::*;

const CONVERSATION: &str = "conversation-1";
const LEAD: &str = "ada";

fn failed(command: &str) -> HostError {
	HostError::CommandFailed {
		command: command.to_owned(),
		status: 500,
		body: "refused".to_owned(),
	}
}

fn refused(refusal: Value) -> HostError {
	HostError::CommandFailed {
		command: "routine_create".to_owned(),
		status: 400,
		body: refusal.to_string(),
	}
}

fn routine_with(id: &str, source_id: &str, filter: Value, config: Value) -> Routine {
	serde_json::from_value(json!({
		"id": id,
		"conversationId": CONVERSATION,
		"botId": LEAD,
		"title": format!("Routine {id}"),
		"instruction": "Sum it up",
		"triggerSourceId": source_id,
		"filter": filter,
		"triggerConfig": config,
		"isEnabled": true,
		"consecutiveFailures": 0,
		"createdAt": 1,
	}))
	.expect("a routine reads")
}

fn routine(id: &str) -> Routine {
	routine_with(
		id,
		"schedule",
		json!({ "matchMode": "all", "rows": [] }),
		json!({ "expression": "0 * * * *" }),
	)
}

fn source(id: &str, title: &str, payload: Value) -> TriggerSource {
	serde_json::from_value(json!({
		"id": id,
		"title": title,
		"payload": payload,
		"dedupeKey": "id",
	}))
	.expect("a source reads")
}

fn declared() -> Vec<TriggerSource> {
	vec![
		source("schedule", "Schedule", json!([])),
		source(
			"github",
			"GitHub",
			json!([{ "name": "stars", "type": "number" }, { "name": "draft", "type": "boolean" }]),
		),
		source("local-webhook", "Webhook", json!([])),
	]
}

fn run(id: &str, started_at: i64, outcome: Option<&str>) -> RoutineRun {
	serde_json::from_value(json!({
		"id": id,
		"routineId": "r1",
		"startedAt": started_at,
		"endedAt": null,
		"outcome": outcome,
		"reason": null,
		"costUsd": null,
		"modelUsage": null,
	}))
	.expect("a run reads")
}

fn scope(lead_bot_id: Option<&str>) -> Scope {
	Scope { conversation_id: CONVERSATION.to_owned(), lead_bot_id: lead_bot_id.map(str::to_owned) }
}

fn opened(lead_bot_id: Option<&str>) -> State {
	let mut state = State::default();
	state.open(scope(lead_bot_id));
	state
}

fn last_list_generation(state: &State) -> u64 {
	state
		.queued
		.iter()
		.rev()
		.find_map(|call| match call {
			Call::ReadList { generation, .. } => Some(*generation),
			_ => None,
		})
		.expect("a list read is queued")
}

fn land(
	state: &mut State,
	routines: Result<Vec<Routine>, HostError>,
	sources: Result<Vec<TriggerSource>, HostError>,
) {
	let generation = last_list_generation(state);
	let listed = Listed { routines, sources: vec![(LEAD.to_owned(), sources)] };
	state.answered(Answer::Listed { generation, listed });
	state.queued.clear();
}

fn listed(routines: Vec<Routine>) -> State {
	let mut state = opened(Some(LEAD));
	land(&mut state, Ok(routines), Ok(declared()));
	state
}

fn rows(state: &State) -> Vec<(String, String, bool)> {
	let held = state.held.as_ref().expect("the routines are held");
	held.routines
		.iter()
		.map(|routine| {
			(routine.id.clone(), held.trigger_title(routine).to_owned(), routine.is_enabled)
		})
		.collect()
}

fn event(state: &mut State, event: RoutinesEvent) {
	state.routines_event(event);
}

fn type_into(state: &mut State, field: FormField, text: &str) {
	let form = state.form.as_mut().expect("the form is open");
	form.edit(field).expect("the field exists").text = text.to_owned();
}

fn queued_runs_generation(state: &State) -> u64 {
	state
		.queued
		.iter()
		.rev()
		.find_map(|call| match call {
			Call::ReadRuns { generation, .. } => Some(*generation),
			_ => None,
		})
		.expect("a runs read is queued")
}

fn opened_on_detail() -> State {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::OpenRoutines);
	event(&mut state, RoutinesEvent::Open("r1".to_owned()));
	state
}

fn take_placement(state: &mut State) -> u64 {
	let placement = state.form.as_ref().expect("the form is open").placement;
	state.queued.clear();
	placement
}

#[test]
fn opening_the_panel_reads_the_routines_of_its_conversation_and_waits_on_them() {
	let state = opened(Some(LEAD));

	assert_eq!(
		state.queued,
		vec![Call::ReadList {
			generation: last_list_generation(&state),
			conversation_id: CONVERSATION.to_owned(),
			lead_bot_id: Some(LEAD.to_owned()),
		}]
	);
	assert!(state.is_open());
	assert!(state.held.is_none());
	assert_eq!(state.page(), Page::Activity);
	assert_eq!(state.failure(), None);
}

#[test]
fn a_read_lists_the_routines_named_by_the_title_of_their_trigger() {
	let mut state = listed(vec![
		routine("r1"),
		routine_with("r2", "unknown", json!({ "matchMode": "all", "rows": [] }), json!({})),
	]);
	event(&mut state, RoutinesEvent::OpenRoutines);

	assert_eq!(
		rows(&state),
		vec![
			("r1".to_owned(), "Schedule".to_owned(), true),
			("r2".to_owned(), "unknown".to_owned(), true),
		]
	);
	assert_eq!(state.page(), Page::Routines { can_create: true });
	assert_eq!(state.failure(), None);
}

#[test]
fn an_empty_read_lists_nothing_without_a_failure() {
	let state = listed(Vec::new());

	assert!(rows(&state).is_empty());
	assert_eq!(state.failure(), None);
}

#[test]
fn a_failed_first_read_stops_waiting_and_draws_the_routines_failure() {
	let mut state = opened(Some(LEAD));
	land(&mut state, Err(failed("routine_list")), Ok(declared()));

	assert!(rows(&state).is_empty());
	assert_eq!(state.failure(), Some(Failure::Routines));
}

#[test]
fn a_failed_reread_keeps_the_routines_it_held() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::Retry);
	land(&mut state, Err(failed("routine_list")), Ok(declared()));

	assert_eq!(rows(&state).len(), 1);
	assert_eq!(state.failure(), Some(Failure::Routines));
}

#[test]
fn retry_reads_again_and_clears_the_failure_once_the_read_lands() {
	let mut state = opened(Some(LEAD));
	land(&mut state, Err(failed("routine_list")), Ok(declared()));

	event(&mut state, RoutinesEvent::Retry);
	assert!(matches!(state.queued.as_slice(), [Call::ReadList { .. }]));
	land(&mut state, Ok(vec![routine("r1")]), Ok(declared()));

	assert_eq!(rows(&state).len(), 1);
	assert_eq!(state.failure(), None);
}

#[test]
fn an_answer_to_an_older_read_is_dropped() {
	let mut state = opened(Some(LEAD));
	let older = last_list_generation(&state);
	event(&mut state, RoutinesEvent::Retry);
	let listed = Listed { routines: Ok(vec![routine("stale")]), sources: Vec::new() };
	state.answered(Answer::Listed { generation: older, listed });

	assert!(state.held.is_none());
}

#[test]
fn unreadable_lead_sources_list_the_routines_with_a_failure_and_offer_no_creation() {
	let mut state = opened(Some(LEAD));
	land(&mut state, Ok(vec![routine("r1")]), Err(failed("routine_trigger_sources")));
	event(&mut state, RoutinesEvent::OpenRoutines);

	assert_eq!(rows(&state), vec![("r1".to_owned(), "schedule".to_owned(), true)]);
	assert_eq!(state.failure(), Some(Failure::Routines));
	assert_eq!(state.page(), Page::Routines { can_create: false });
	event(&mut state, RoutinesEvent::NewRoutine);
	assert!(state.form.is_none());
}

#[test]
fn a_conversation_without_a_lead_offers_no_creation() {
	let mut state = opened(None);
	land(&mut state, Ok(Vec::new()), Ok(declared()));
	event(&mut state, RoutinesEvent::OpenRoutines);

	assert_eq!(state.page(), Page::Routines { can_create: false });
}

#[test]
fn turning_a_routine_off_writes_it_whole_and_shows_what_the_core_answered() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::SetEnabled("r1".to_owned(), false));

	let Some(Call::Toggle { id, edit }) = state.queued.pop() else { panic!("a toggle is sent") };
	assert_eq!(id, "r1");
	assert!(!edit.is_enabled);
	assert_eq!(edit.title, "Routine r1");
	assert_eq!(edit.trigger_config, json!({ "expression": "0 * * * *" }));
	assert!(rows(&state)[0].2, "the switch waits on the core");

	let mut written = routine("r1");
	written.is_enabled = false;
	state.answered(Answer::Toggled(Ok(written)));
	assert!(!rows(&state)[0].2);
	assert_eq!(state.failure(), None);
}

#[test]
fn a_refused_toggle_keeps_the_routine_and_draws_the_write_failure() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::SetEnabled("r1".to_owned(), false));
	state.answered(Answer::Toggled(Err(failed("routine_update"))));

	assert!(rows(&state)[0].2);
	assert_eq!(state.failure(), Some(Failure::Write));
}

#[test]
fn a_write_failure_clears_once_a_later_write_resolves() {
	let mut state = listed(vec![routine("r1")]);
	state.answered(Answer::Toggled(Err(failed("routine_update"))));
	state.answered(Answer::Toggled(Ok(routine("r1"))));

	assert_eq!(state.failure(), None);
}

#[test]
fn a_write_failure_clears_once_a_later_read_lands() {
	let mut state = listed(vec![routine("r1")]);
	state.answered(Answer::Toggled(Err(failed("routine_update"))));
	event(&mut state, RoutinesEvent::Retry);
	land(&mut state, Ok(vec![routine("r1")]), Ok(declared()));

	assert_eq!(state.failure(), None);
}

#[test]
fn a_read_failure_stays_whatever_a_write_resolves_to() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::Retry);
	land(&mut state, Err(failed("routine_list")), Ok(declared()));
	let mut written = routine("r1");
	written.is_enabled = false;
	state.answered(Answer::Toggled(Ok(written)));

	assert!(!rows(&state)[0].2);
	assert_eq!(state.failure(), Some(Failure::Routines));
}

#[test]
fn opening_a_routine_reads_its_runs_and_says_it_reads_while_nothing_is_read() {
	let state = opened_on_detail();

	assert_eq!(state.page(), Page::Detail);
	assert_eq!(
		state.queued,
		vec![Call::ReadRuns {
			generation: queued_runs_generation(&state),
			routine_id: "r1".to_owned()
		}]
	);
	let detail = state.detail.as_ref().expect("the detail is open");
	assert!(detail.is_reading);
	assert!(detail.read.is_none());
	assert!(!detail.has_failed);
}

#[test]
fn the_runs_land_in_the_detail_and_a_full_page_is_named_so() {
	let mut state = opened_on_detail();
	let generation = queued_runs_generation(&state);
	let runs: Vec<RoutineRun> =
		(0..RUN_PAGE).map(|at| run(&format!("run-{at}"), at as i64, Some("ok"))).collect();
	state.answered(Answer::Runs { generation, runs: Ok(runs) });

	let detail = state.detail.as_ref().expect("the detail is open");
	let read = detail.read.as_ref().expect("the runs are read");
	assert_eq!(read.runs.len(), RUN_PAGE);
	assert!(read.is_full_page);
	assert!(!detail.is_reading);
}

#[test]
fn a_failed_runs_read_draws_retry_which_reads_again_and_keeps_the_failure_while_it_reads() {
	let mut state = opened_on_detail();
	let generation = queued_runs_generation(&state);
	state.queued.clear();
	state.answered(Answer::Runs { generation, runs: Err(failed("routine_runs")) });
	assert!(state.detail.as_ref().is_some_and(|detail| detail.has_failed));

	event(&mut state, RoutinesEvent::RetryRuns);
	let retried = queued_runs_generation(&state);
	let detail = state.detail.as_ref().expect("the detail is open");
	assert!(detail.is_reading && detail.has_failed);

	event(&mut state, RoutinesEvent::RetryRuns);
	assert_eq!(state.queued.len(), 1, "a retry while reading is ignored");

	state.answered(Answer::Runs { generation: retried, runs: Ok(vec![run("a", 1, None)]) });
	assert!(
		state.detail.as_ref().is_some_and(|detail| !detail.has_failed && detail.read.is_some())
	);
}

#[test]
fn a_late_answer_to_an_earlier_runs_read_is_dropped() {
	let mut state = opened_on_detail();
	let earlier = queued_runs_generation(&state);
	state.routine_changed(CONVERSATION);
	let later = queued_runs_generation(&state);
	state.answered(Answer::Runs { generation: later, runs: Ok(vec![run("a", 1, Some("ok"))]) });
	state.answered(Answer::Runs { generation: earlier, runs: Err(failed("routine_runs")) });

	let detail = state.detail.as_ref().expect("the detail is open");
	assert!(!detail.has_failed);
	assert_eq!(detail.read.as_ref().map(|read| read.runs.len()), Some(1));
}

#[test]
fn back_closes_the_detail_onto_the_list() {
	let mut state = opened_on_detail();
	event(&mut state, RoutinesEvent::Back);

	assert_eq!(state.page(), Page::Routines { can_create: true });
	event(&mut state, RoutinesEvent::Back);
	assert_eq!(state.page(), Page::Activity);
}

#[test]
fn run_now_shows_the_refusal_the_core_answers() {
	let mut state = opened_on_detail();
	state.queued.clear();
	event(&mut state, RoutinesEvent::RunNow);
	let Some(Call::RunNow { opened, routine_id }) = state.queued.pop() else {
		panic!("run now is sent")
	};
	assert_eq!(routine_id, "r1");
	assert!(state.detail.as_ref().is_some_and(|detail| detail.is_running));

	event(&mut state, RoutinesEvent::RunNow);
	assert!(state.queued.is_empty(), "a second press while running is ignored");

	let decision = Ok(TriggerDecision::Refused { by: Refusal::Filter });
	state.answered(Answer::RanNow { opened, decision });
	let detail = state.detail.as_ref().expect("the detail is open");
	assert_eq!(detail.refusal, Some(Refusal::Filter));
	assert!(!detail.is_running);
}

#[test]
fn a_started_run_shows_no_refusal_and_leaves_the_reread_to_its_change() {
	let mut state = opened_on_detail();
	state.queued.clear();
	event(&mut state, RoutinesEvent::RunNow);
	let Some(Call::RunNow { opened, .. }) = state.queued.pop() else { panic!("run now is sent") };
	let decision = Ok(TriggerDecision::Started { run_id: "run-1".to_owned() });
	state.answered(Answer::RanNow { opened, decision });

	assert_eq!(state.detail.as_ref().and_then(|detail| detail.refusal), None);
	assert!(state.queued.is_empty());
}

#[test]
fn a_failed_run_now_draws_the_write_failure() {
	let mut state = opened_on_detail();
	event(&mut state, RoutinesEvent::RunNow);
	let Some(Call::RunNow { opened, .. }) = state.queued.pop() else { panic!("run now is sent") };
	state.answered(Answer::RanNow { opened, decision: Err(failed("routine_run_now")) });

	assert_eq!(state.failure(), Some(Failure::Write));
	assert!(state.detail.as_ref().is_some_and(|detail| !detail.is_running));
}

#[test]
fn the_decision_of_a_routine_left_is_forgotten() {
	let mut state = opened_on_detail();
	event(&mut state, RoutinesEvent::RunNow);
	let Some(Call::RunNow { opened, .. }) = state.queued.pop() else { panic!("run now is sent") };
	event(&mut state, RoutinesEvent::Back);
	event(&mut state, RoutinesEvent::Open("r1".to_owned()));
	let decision = Ok(TriggerDecision::Refused { by: Refusal::Disabled });
	state.answered(Answer::RanNow { opened, decision });

	assert_eq!(state.detail.as_ref().and_then(|detail| detail.refusal), None);
}

#[test]
fn a_change_of_the_conversation_on_screen_rereads_the_list_and_the_open_runs() {
	let mut state = opened_on_detail();
	state.queued.clear();
	state.routine_changed(CONVERSATION);

	assert!(matches!(state.queued.as_slice(), [Call::ReadList { .. }, Call::ReadRuns { .. }]));
}

#[test]
fn a_change_of_another_conversation_reads_nothing() {
	let mut state = opened_on_detail();
	state.queued.clear();
	state.routine_changed("another");

	assert!(state.queued.is_empty());
}

#[test]
fn a_new_schedule_routine_is_created_through_the_core_then_shown_for_edit() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::OpenRoutines);
	event(&mut state, RoutinesEvent::NewRoutine);
	assert_eq!(state.page(), Page::Form { written: false, from_detail: false });

	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	assert_eq!(state.form.as_ref().map(|form| form.trigger_source_id.as_str()), Some("schedule"));
	type_into(&mut state, FormField::Title, "Digest");
	type_into(&mut state, FormField::Instruction, "Sum it up");
	type_into(&mut state, FormField::Expression, "0 9 * * *");
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);

	let Some(Call::Create { placement: sent, draft }) = state.queued.pop() else {
		panic!("a create is sent")
	};
	assert_eq!(sent, placement);
	assert_eq!(draft.conversation_id, CONVERSATION);
	assert_eq!(draft.bot_id, LEAD);
	assert_eq!(draft.title, "Digest");
	assert_eq!(draft.trigger_source_id, "schedule");
	assert_eq!(draft.trigger_config, json!({ "expression": "0 9 * * *" }));
	assert!(state.form.as_ref().is_some_and(|form| form.is_saving));

	state.answered(Answer::Saved { placement, saved: Ok(routine("r9")) });
	assert_eq!(rows(&state).len(), 1);
	assert_eq!(state.page(), Page::Form { written: true, from_detail: false });
	assert!(state.form.as_ref().is_some_and(|form| !form.is_saving && !form.is_unsaved()));
}

#[test]
fn two_saves_fired_before_either_settles_write_once() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	event(&mut state, RoutinesEvent::Save);

	assert_eq!(state.queued.len(), 1);
}

#[test]
fn a_blank_title_refusal_marks_the_title_and_keeps_what_was_entered() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	type_into(&mut state, FormField::Instruction, "Sum it up");
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	let refusal = refused(json!({ "kind": "blankField", "field": "title" }));
	state.answered(Answer::Saved { placement, saved: Err(refusal) });

	let form = state.form.as_ref().expect("the form stays");
	assert_eq!(form.field_refusal(), Some(FormRefusal::BlankTitle));
	assert_eq!(form.instruction.text, "Sum it up");
	assert!(!form.is_saving);
	assert_eq!(state.failure(), None);
}

#[test]
fn a_save_failure_that_is_no_refusal_draws_the_write_failure() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	state.answered(Answer::Saved { placement, saved: Err(failed("routine_create")) });

	assert_eq!(state.failure(), Some(Failure::Write));
	assert!(state.form.as_ref().is_some_and(|form| form.field_refusal().is_none()));
}

#[test]
fn a_refusal_landing_from_another_form_draws_the_write_failure_only() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::NewRoutine);
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	event(&mut state, RoutinesEvent::Back);
	event(&mut state, RoutinesEvent::NewRoutine);
	let refusal = refused(json!({ "kind": "blankField", "field": "title" }));
	state.answered(Answer::Saved { placement, saved: Err(refusal) });

	assert!(state.form.as_ref().is_some_and(|form| form.field_refusal().is_none()));
	assert_eq!(state.failure(), Some(Failure::Write));
}

#[test]
fn saving_a_routine_that_left_the_list_draws_the_write_failure() {
	let mut state = opened_on_detail();
	event(&mut state, RoutinesEvent::Edit);
	state.held.as_mut().expect("held").remove("r1");
	state.queued.clear();
	event(&mut state, RoutinesEvent::Save);

	assert!(state.queued.is_empty());
	assert_eq!(state.failure(), Some(Failure::Write));
}

#[test]
fn a_form_opened_from_the_detail_lands_back_on_it_once_saved() {
	let mut state = opened_on_detail();
	event(&mut state, RoutinesEvent::Edit);
	assert_eq!(state.page(), Page::Form { written: true, from_detail: true });
	type_into(&mut state, FormField::Title, "Renamed");
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	let Some(Call::Edit { id, edit, .. }) = state.queued.pop() else { panic!("an edit is sent") };
	assert_eq!(id, "r1");
	assert_eq!(edit.title, "Renamed");
	assert!(edit.is_enabled);

	let mut written = routine("r1");
	written.title = "Renamed".to_owned();
	state.answered(Answer::Saved { placement, saved: Ok(written) });
	assert_eq!(state.page(), Page::Detail);
}

#[test]
fn a_row_without_its_value_is_marked_and_nothing_is_written() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::AddFilterRow);
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(0)));
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(0)));
	take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);

	let form = state.form.as_ref().expect("the form stays");
	assert_eq!(form.rows[0].field.text, "stars");
	assert_eq!(form.rows[0].operator, FilterOperator::Equals);
	assert!(form.marks_refused_rows);
	assert!(state.queued.is_empty());
}

#[test]
fn a_filter_row_is_written_in_the_type_of_its_declared_field() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::AddFilterRow);
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(0)));
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(0)));
	type_into(&mut state, FormField::FilterValue(0), "12");
	event(&mut state, RoutinesEvent::Pick(Picker::MatchMode));
	take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);

	let Some(Call::Create { draft, .. }) = state.queued.pop() else { panic!("a create is sent") };
	assert_eq!(draft.filter.match_mode, FilterMatchMode::Any);
	assert_eq!(draft.filter.rows[0].field, "stars");
	assert_eq!(draft.filter.rows[0].value, Some(json!(12.0)));
}

#[test]
fn an_untouched_row_is_written_as_it_was_read() {
	let filter = json!({ "matchMode": "all", "rows": [{ "field": "label", "operator": "equals", "value": 5 }] });
	let mut state = listed(vec![routine_with("r1", "github", filter, json!({}))]);
	event(&mut state, RoutinesEvent::Open("r1".to_owned()));
	event(&mut state, RoutinesEvent::Edit);
	event(&mut state, RoutinesEvent::AddFilterRow);
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(1)));
	event(&mut state, RoutinesEvent::Pick(Picker::Operator(1)));
	take_placement(&mut state);
	type_into(&mut state, FormField::FilterValue(1), "3");
	event(&mut state, RoutinesEvent::Save);

	let Some(Call::Edit { edit, .. }) = state.queued.pop() else { panic!("an edit is sent") };
	assert_eq!(edit.filter.rows[0].value, Some(json!(5)));
	assert_eq!(edit.filter.rows[1].value, Some(json!(3.0)));
}

#[test]
fn an_operator_refusal_marks_its_row_until_the_filter_changes() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
	event(&mut state, RoutinesEvent::AddFilterRow);
	let placement = take_placement(&mut state);
	event(&mut state, RoutinesEvent::Save);
	let refusal = refused(json!({
		"kind": "unsupportedOperator", "row": 0, "field": "stars", "operator": "exists", "fieldType": "number",
	}));
	state.answered(Answer::Saved { placement, saved: Err(refusal) });
	let form = state.form.as_ref().expect("the form stays");
	assert!(form.row_refusal().is_some());

	event(&mut state, RoutinesEvent::Pick(Picker::Operator(0)));
	assert!(state.form.as_ref().is_some_and(|form| form.row_refusal().is_none()));
}

#[test]
fn picking_the_trigger_of_a_new_routine_cycles_through_the_core_sources() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	let picked: Vec<String> = (0..4)
		.map(|_| {
			event(&mut state, RoutinesEvent::Pick(Picker::Trigger));
			state.form.as_ref().map(|form| form.trigger_source_id.clone()).unwrap_or_default()
		})
		.collect();

	assert_eq!(picked, ["schedule", "github", "local-webhook", "schedule"]);
}

#[test]
fn a_webhook_routine_opened_for_edit_reads_its_key_and_copies_its_parts() {
	let webhook =
		routine_with("r1", "local-webhook", json!({ "matchMode": "all", "rows": [] }), json!({}));
	let mut state = listed(vec![webhook]);
	event(&mut state, RoutinesEvent::Open("r1".to_owned()));
	state.queued.clear();
	event(&mut state, RoutinesEvent::Edit);
	let Some(Call::ReadKey { placement, routine_id }) = state.queued.pop() else {
		panic!("the key is read")
	};
	assert_eq!(routine_id, "r1");
	assert_eq!(state.form.as_ref().map(|form| form.key.clone()), Some(KeyRead::Unread));

	let key = RoutineKey { key: "secret".to_owned(), header: Some("X-Key".to_owned()), url: None };
	state.answered(Answer::Key { placement, key: Ok(key.clone()) });
	assert_eq!(state.form.as_ref().map(|form| form.key.clone()), Some(KeyRead::Read(key)));

	event(&mut state, RoutinesEvent::Copy(WebhookPart::Key));
	event(&mut state, RoutinesEvent::Copy(WebhookPart::Address));
	assert_eq!(state.copies, vec!["secret".to_owned()]);
}

#[test]
fn an_unreadable_key_is_marked_and_a_stale_key_is_dropped() {
	let webhook =
		routine_with("r1", "local-webhook", json!({ "matchMode": "all", "rows": [] }), json!({}));
	let mut state = listed(vec![webhook]);
	event(&mut state, RoutinesEvent::Open("r1".to_owned()));
	event(&mut state, RoutinesEvent::Edit);
	let Some(Call::ReadKey { placement, .. }) = state.queued.pop() else {
		panic!("the key is read")
	};
	state.answered(Answer::Key { placement, key: Err(failed("routine_key")) });
	assert_eq!(state.form.as_ref().map(|form| form.key.clone()), Some(KeyRead::Failed));

	let key = RoutineKey { key: "late".to_owned(), header: None, url: None };
	state.answered(Answer::Key { placement: placement + 100, key: Ok(key) });
	assert_eq!(state.form.as_ref().map(|form| form.key.clone()), Some(KeyRead::Failed));
}

#[test]
fn a_confirmed_delete_removes_the_routine_through_the_core() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::AskDelete("r1".to_owned()));
	assert!(state.deleting.is_some());
	event(&mut state, RoutinesEvent::Confirm);

	assert_eq!(state.queued, vec![Call::Delete("r1".to_owned())]);
	assert!(state.deleting.as_ref().is_some_and(|deleting| deleting.is_busy));
	event(&mut state, RoutinesEvent::Cancel);
	assert!(state.deleting.is_some(), "a busy delete cannot be cancelled");

	state.answered(Answer::Deleted { id: "r1".to_owned(), outcome: Ok(()) });
	assert!(rows(&state).is_empty());
	assert!(state.deleting.is_none());
}

#[test]
fn a_failed_delete_keeps_the_dialog_open_with_its_failure() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::AskDelete("r1".to_owned()));
	event(&mut state, RoutinesEvent::Confirm);
	state.answered(Answer::Deleted { id: "r1".to_owned(), outcome: Err(failed("routine_delete")) });

	let deleting = state.deleting.as_ref().expect("the dialog stays");
	assert!(deleting.has_failed && !deleting.is_busy);
	assert_eq!(rows(&state).len(), 1);
}

#[test]
fn a_cancelled_delete_leaves_the_routine_untouched() {
	let mut state = listed(vec![routine("r1")]);
	event(&mut state, RoutinesEvent::AskDelete("r1".to_owned()));
	event(&mut state, RoutinesEvent::Cancel);

	assert!(state.deleting.is_none());
	assert!(state.queued.is_empty());
	assert_eq!(rows(&state).len(), 1);
}

#[test]
fn leaving_an_unsaved_form_asks_first() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	type_into(&mut state, FormField::Title, "Draft");
	event(&mut state, RoutinesEvent::Back);
	assert_eq!(state.leaving, Some(Leaving::Back));

	event(&mut state, RoutinesEvent::Cancel);
	assert!(state.leaving.is_none() && state.form.is_some());

	event(&mut state, RoutinesEvent::ClosePanel);
	event(&mut state, RoutinesEvent::Confirm);
	assert!(!state.is_open());
}

#[test]
fn leaving_an_untouched_form_needs_no_confirmation() {
	let mut state = listed(Vec::new());
	event(&mut state, RoutinesEvent::NewRoutine);
	event(&mut state, RoutinesEvent::Back);

	assert!(state.leaving.is_none());
	assert!(state.form.is_none());
}

#[test]
fn a_refusal_is_read_from_the_body_of_a_refused_command() {
	let blank = refused(json!({ "kind": "blankField", "field": "instruction" }));
	let expression =
		refused(json!({ "kind": "unreadableExpression", "expression": "x", "reason": "bad" }));
	let unknown = refused(json!({ "kind": "unknownRoutine", "id": "r1" }));

	assert_eq!(refusal_of(&blank), Some(Refused::Field(FormRefusal::BlankInstruction)));
	assert_eq!(refusal_of(&expression), Some(Refused::Field(FormRefusal::UnreadableExpression)));
	assert_eq!(refusal_of(&unknown), None);
	assert_eq!(refusal_of(&failed("routine_create")), None);
}
