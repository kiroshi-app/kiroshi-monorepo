use kiroshi_core::routines::contract::{
	FieldType as CoreFieldType, FilterMatchMode, FilterOperator, PayloadField, Refusal, Routine,
	RunOutcome, TriggerSource,
};
use rune::{El, el};

use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s09_routines::RoutinesEvent;
use kiroshi_rune_kit::surfaces::s09_routines::detail::{
	History, Outcome, RoutineDetail, Run, RunRefusal, routine_detail,
};
use kiroshi_rune_kit::surfaces::s09_routines::form::{
	Configuration, FieldPick, FieldType, Filter, FilterRow, MatchMode, Operator, OperatorError,
	RoutineForm, TriggerField, Value, Webhook, WebhookValues, routine_form,
};
use kiroshi_rune_kit::surfaces::s09_routines::panel::{
	Confirm, Missions, Page, PanelChrome, Routines, activity, confirm_layer, panel, routines_page,
};
use kiroshi_rune_kit::surfaces::s09_routines::row::RoutineRow;
use kiroshi_rune_kit::tokens::Tokens;

use super::detail::Detail;
use super::form::{Form, KeyRead, Row, TriggerKind, fields_of, takes_value};
use super::listing::{Held, stopped_itself};
use super::{Leaving, State, edit_of, language, routines_event};
use crate::app::App;
use crate::mission::relative_time;

fn emit(app: &mut App, event: RoutinesEvent) {
	routines_event(app, event);
}

fn operator_of(operator: FilterOperator) -> Operator {
	match operator {
		FilterOperator::Exists => Operator::Exists,
		FilterOperator::NotExists => Operator::NotExists,
		FilterOperator::Equals => Operator::Equals,
		FilterOperator::NotEquals => Operator::NotEquals,
		FilterOperator::Contains => Operator::Contains,
		FilterOperator::NotContains => Operator::NotContains,
		FilterOperator::StartsWith => Operator::StartsWith,
		FilterOperator::EndsWith => Operator::EndsWith,
		FilterOperator::Gt => Operator::Gt,
		FilterOperator::Lt => Operator::Lt,
	}
}

fn field_type_of(field_type: CoreFieldType) -> FieldType {
	match field_type {
		CoreFieldType::String => FieldType::Text,
		CoreFieldType::Number => FieldType::Number,
		CoreFieldType::Boolean => FieldType::Boolean,
		CoreFieldType::Datetime => FieldType::Date,
	}
}

fn outcome_of(outcome: Option<RunOutcome>) -> Option<Outcome> {
	Some(match outcome? {
		RunOutcome::Ok => Outcome::Reported,
		RunOutcome::Nothing => Outcome::Nothing,
		RunOutcome::Skipped => Outcome::Skipped,
		RunOutcome::Failed => Outcome::Failed,
	})
}

fn refusal_of(refusal: Refusal) -> RunRefusal {
	match refusal {
		Refusal::Disabled => RunRefusal::Disabled,
		Refusal::Filter => RunRefusal::Filter,
		Refusal::DedupeValueMissing => RunRefusal::DedupeValueMissing,
		Refusal::AlreadySeen => RunRefusal::AlreadySeen,
	}
}

fn row_of<'a>(held: &'a Held, routine: &'a Routine) -> RoutineRow<'a> {
	RoutineRow {
		id: &routine.id,
		title: &routine.title,
		trigger: held.trigger_title(routine),
		enabled: routine.is_enabled,
		stopped_itself: stopped_itself(routine),
	}
}

fn routines_body(state: &State, t: &Tokens, lang: Language) -> El {
	let Some(held) = state.held.as_ref() else {
		return routines_page(t, lang, Routines::Loading, emit);
	};
	let rows: Vec<RoutineRow> = held.routines.iter().map(|routine| row_of(held, routine)).collect();
	routines_page(t, lang, Routines::Listed(&rows), emit)
}

fn detail_body(
	state: &State,
	t: &Tokens,
	lang: Language,
	detail: &Detail,
	routine: &Routine,
) -> El {
	let Some(held) = state.held.as_ref() else { return el() };
	let (mut runs, read_at, is_full_page) =
		detail.read.as_ref().map_or((Vec::new(), 0, false), |read| {
			(read.runs.iter().collect(), read.read_at, read.is_full_page)
		});
	runs.sort_by_key(|run| std::cmp::Reverse(run.started_at));
	let started: Vec<String> =
		runs.iter().map(|run| relative_time(run.started_at, read_at)).collect();
	let newest_first: Vec<Run> = runs
		.iter()
		.zip(&started)
		.map(|(run, started)| Run {
			id: &run.id,
			outcome: outcome_of(run.outcome),
			started,
			reason: run.reason.as_deref(),
		})
		.collect();
	let shown = RoutineDetail {
		id: &routine.id,
		title: &routine.title,
		trigger: held.trigger_title(routine),
		stopped_itself: stopped_itself(routine),
		running: detail.is_running,
		refusal: detail.refusal.map(refusal_of),
		history: History {
			newest_first: &newest_first,
			reading: detail.is_reading,
			read_failed: detail.has_failed,
			full_page: is_full_page,
		},
	};
	routine_detail(t, lang, &shown, emit)
}

fn source_title<'a>(sources: &'a [TriggerSource], source_id: &'a str) -> &'a str {
	sources.iter().find(|source| source.id == source_id).map_or(source_id, |source| &source.title)
}

fn trigger_of<'a>(form: &'a Form, sources: &'a [TriggerSource]) -> TriggerField<'a> {
	if form.is_written() {
		return TriggerField::Tied(source_title(sources, &form.trigger_source_id));
	}
	let picked = sources.iter().find(|source| source.id == form.trigger_source_id);
	TriggerField::Picking(picked.map(|source| source.title.as_str()))
}

fn webhook_of(form: &Form) -> Webhook<'_> {
	match &form.key {
		KeyRead::Failed => Webhook::Unreadable,
		_ if !form.is_written() => Webhook::Unwritten,
		KeyRead::Unread => Webhook::Reading,
		KeyRead::Read(key) => Webhook::Read(WebhookValues {
			address: key.url.as_deref().unwrap_or_default(),
			key: &key.key,
			header: key.header.as_deref().unwrap_or_default(),
		}),
	}
}

fn configuration_of(form: &Form) -> Configuration<'_> {
	match form.kind() {
		TriggerKind::Plain => Configuration::Nothing,
		TriggerKind::Schedule => Configuration::Schedule(&form.expression),
		TriggerKind::FileWatch => Configuration::WatchedPath(&form.path),
		TriggerKind::LocalWebhook => Configuration::Webhook(webhook_of(form)),
	}
}

fn value_of<'a>(row: &'a Row, fields: &[PayloadField]) -> Value<'a> {
	if !takes_value(row.operator) {
		return Value::Unasked;
	}
	match row.value_type(fields) {
		Some(CoreFieldType::Boolean) => Value::Boolean(row.value.text == "true"),
		Some(CoreFieldType::Number) => Value::Number(&row.value),
		_ => Value::Text(&row.value),
	}
}

fn filter_row_of<'a>(
	form: &Form,
	rank: usize,
	row: &'a Row,
	fields: &[PayloadField],
) -> FilterRow<'a> {
	let refused = form.row_refusal().filter(|(refused_row, _, _)| *refused_row == rank);
	let operator_error = match refused {
		Some((_, operator, field_type)) => {
			Some(OperatorError::Unsupported(operator_of(operator), field_type_of(field_type)))
		}
		None => (form.marks_refused_rows && row.is_untyped_comparison(fields))
			.then_some(OperatorError::Untyped),
	};
	FilterRow {
		field: if row.is_free(fields) {
			FieldPick::OtherPath(&row.field)
		} else {
			FieldPick::Declared(&row.field.text)
		},
		operator: operator_of(row.operator),
		value: value_of(row, fields),
		operator_error,
		value_missing: form.marks_refused_rows && row.is_missing_value(),
	}
}

fn form_body(state: &State, t: &Tokens, lang: Language, form: &Form) -> El {
	let sources = state.form_sources();
	let fields = fields_of(&sources, &form.trigger_source_id);
	let rows: Vec<FilterRow> = form
		.rows
		.iter()
		.enumerate()
		.map(|(rank, row)| filter_row_of(form, rank, row, fields))
		.collect();
	let shown = RoutineForm {
		written: form.is_written(),
		title: &form.title,
		instruction: &form.instruction,
		trigger: trigger_of(form, &sources),
		configuration: configuration_of(form),
		refusal: form.field_refusal(),
		filter: Filter {
			match_mode: match form.match_mode {
				FilterMatchMode::All => MatchMode::All,
				FilterMatchMode::Any => MatchMode::Any,
			},
			rows: &rows,
		},
		saving: form.is_saving,
	};
	routine_form(t, lang, &shown, emit, edit_of)
}

fn body(state: &State, t: &Tokens, lang: Language, page: Page, has_failure: bool) -> El {
	match page {
		Page::Activity => activity(t, lang, Missions::Loading, has_failure, emit),
		Page::Routines { .. } => routines_body(state, t, lang),
		Page::Detail => match state.shown_detail() {
			Some((detail, routine)) => detail_body(state, t, lang, detail, routine),
			None => el(),
		},
		Page::Form { .. } => match state.form.as_ref() {
			Some(form) => form_body(state, t, lang, form),
			None => el(),
		},
	}
}

pub fn view(app: &App, t: &Tokens) -> El {
	let state = &app.surfaces.s09_routines;
	if !state.is_open() {
		return el();
	}
	let lang = language(app);
	let page = state.page();
	let failure = state.failure();
	let chrome = PanelChrome {
		page,
		failure,
		routines_count: state.held.as_ref().map_or(0, |held| held.routines.len()),
	};
	panel(t, lang, &chrome, body(state, t, lang, page, failure.is_some()), emit)
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let state = &app.surfaces.s09_routines;
	if !state.is_open() {
		return Vec::new();
	}
	let lang = language(app);
	let confirm = match (&state.leaving, &state.deleting) {
		(Some(Leaving::Back | Leaving::Close), _) => Confirm::Leave,
		(None, Some(deleting)) => Confirm::Delete {
			title: state.routine(&deleting.routine_id).map_or("", |routine| routine.title.as_str()),
			failed: deleting.has_failed,
			busy: deleting.is_busy,
		},
		(None, None) => return Vec::new(),
	};
	vec![confirm_layer(t, lang, confirm, emit)]
}
