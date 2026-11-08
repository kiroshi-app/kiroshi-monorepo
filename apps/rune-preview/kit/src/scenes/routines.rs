use rune::{El, TextEdit, col, row};

use std::rc::Rc;

use super::{SceneState, missions, stage, staged};
use crate::hues::Preset;
use crate::strings::Language;
use crate::surfaces::s08_missions::{Emit as MissionsEmit, Mission, mission_row};
use crate::surfaces::s09_routines::detail::{
	History, Outcome, RoutineDetail, Run, RunRefusal, routine_detail,
};
use crate::surfaces::s09_routines::form::{
	Configuration, FieldPick, FieldType, Filter, FilterRow, FormField, FormRefusal, MatchMode,
	Operator, OperatorError, RoutineForm, TriggerField, Value, Webhook, WebhookValues,
	routine_form,
};
use crate::surfaces::s09_routines::panel::{
	Confirm, EarlierToday, Failure, Missions, Page, PanelChrome, Routines, activity, confirm_layer,
	panel, routines_page,
};
use crate::surfaces::s09_routines::reported_run::{ReportedRun, reported_run_row};
use crate::surfaces::s09_routines::row::{RoutineRow, routine_row};
use crate::surfaces::s09_routines::{PANEL_WIDTH, RoutinesEvent};
use crate::tokens::{SPACING, Tokens};

const EN: Language = Language::En;
const SCENE_INSET: f32 = SPACING * 6.0;

const LONG_ROUTINE_TITLE: &str =
	"Read every changelog of every package this workspace depends on and summarise it";
const LONG_RUN_TITLE: &str =
	"Read every release of the packages this workspace depends on and write what changed";
const LONG_REASON: &str = "the run's session failed with spawnFailed: /Users/ada/.local/bin/claude exited before the first frame: error while loading shared libraries: libssl.so.3: cannot open shared object file";

const MORNING_DIGEST: RoutineRow = RoutineRow {
	id: "routine-morning-digest",
	title: "Morning digest",
	trigger: "Every day at 08:00",
	enabled: true,
	stopped_itself: false,
};

const RELEASE_WATCH: RoutineRow = RoutineRow {
	id: "routine-release-watch",
	title: "Release notes watch",
	trigger: "CHANGELOG.md changes",
	enabled: false,
	stopped_itself: true,
};

const NIGHTLY_CLEANUP: RoutineRow = RoutineRow {
	id: "routine-nightly-cleanup",
	title: "Nightly cleanup",
	trigger: "webhook",
	enabled: true,
	stopped_itself: false,
};

const ROUTINES: [RoutineRow; 3] = [MORNING_DIGEST, RELEASE_WATCH, NIGHTLY_CLEANUP];

const DIGEST_RUNS: [Run; 6] = [
	Run { id: "run-digest-f", outcome: None, started: "4 minutes ago", reason: None },
	Run {
		id: "run-digest-e",
		outcome: Some(Outcome::Reported),
		started: "2 hours ago",
		reason: None,
	},
	Run {
		id: "run-digest-d",
		outcome: Some(Outcome::Nothing),
		started: "5 hours ago",
		reason: None,
	},
	Run {
		id: "run-digest-c",
		outcome: Some(Outcome::Skipped),
		started: "9 hours ago",
		reason: Some("hourly cap"),
	},
	Run {
		id: "run-digest-b",
		outcome: Some(Outcome::Failed),
		started: "yesterday",
		reason: Some("the run's turn ended with no structured output"),
	},
	Run {
		id: "run-digest-a",
		outcome: Some(Outcome::Reported),
		started: "2 days ago",
		reason: None,
	},
];

const REASONLESS_RUNS: [Run; 6] = [
	Run { reason: None, ..DIGEST_RUNS[0] },
	Run { reason: None, ..DIGEST_RUNS[1] },
	Run { reason: None, ..DIGEST_RUNS[2] },
	Run { reason: None, ..DIGEST_RUNS[3] },
	Run { reason: None, ..DIGEST_RUNS[4] },
	Run { reason: None, ..DIGEST_RUNS[5] },
];

const OUTCOME_RUNS: [Run; 4] = [
	Run {
		id: "run-reported",
		outcome: Some(Outcome::Reported),
		started: "1 hour ago",
		reason: None,
	},
	Run {
		id: "run-nothing",
		outcome: Some(Outcome::Nothing),
		started: "2 hours ago",
		reason: None,
	},
	Run {
		id: "run-skipped",
		outcome: Some(Outcome::Skipped),
		started: "3 hours ago",
		reason: Some("previous run still in progress"),
	},
	Run {
		id: "run-failed",
		outcome: Some(Outcome::Failed),
		started: "4 hours ago",
		reason: Some("the run's turn failed"),
	},
];

const REFUSED_RUN: [Run; 1] = [Run {
	id: "run-refused",
	outcome: Some(Outcome::Reported),
	started: "1 hour ago",
	reason: None,
}];

const LONG_RUN: [Run; 1] = [Run {
	id: "run-long",
	outcome: Some(Outcome::Failed),
	started: "1 hour ago",
	reason: Some(LONG_REASON),
}];

const HISTORY: History =
	History { newest_first: &DIGEST_RUNS, reading: false, read_failed: false, full_page: false };

const DIGEST_DETAIL: RoutineDetail = RoutineDetail {
	id: "routine-morning-digest",
	title: "Morning digest",
	trigger: "Every day at 08:00",
	stopped_itself: false,
	running: false,
	refusal: None,
	history: HISTORY,
};

const REPORTED_RUN: ReportedRun = ReportedRun {
	id: "run-morning-digest",
	routine_title: "Morning digest",
	trigger: "On a schedule",
	agent: "Ada Martin",
	agent_hue: None,
	time: "08:04",
};

const LATE_REPORTED_RUN: ReportedRun = ReportedRun {
	id: "run-release-watch",
	routine_title: "Release watch",
	trigger: "Watching a file",
	agent: "Iris Nakamura",
	agent_hue: None,
	time: "10:04",
};

const WAITING_MISSIONS: [Mission; 2] = [missions::WAITING_HUMAN_MISSION, missions::READY_MISSION];
const WORKING_MISSIONS: [Mission; 3] =
	[missions::WORKING_MISSION, missions::WAITING_BOT_MISSION, missions::FAILED_MISSION];

fn ignore(_: &mut SceneState, _: RoutinesEvent) {}

fn scene_edit(s: &mut SceneState, field: FormField) -> &mut TextEdit {
	let [title, instruction] = &mut s.routine_fields;
	match field {
		FormField::Title => title,
		FormField::Instruction => instruction,
		_ => &mut s.edit,
	}
}

fn in_panel_width(content: El) -> El {
	col().w(PANEL_WIDTH).child(content)
}

fn at_height(t: &Tokens, content: El) -> El {
	staged(
		t,
		row()
			.w_full()
			.h_full()
			.padding(SCENE_INSET)
			.justify_center()
			.child(col().w(PANEL_WIDTH).h_full().child(content)),
		Vec::new(),
	)
}

fn mission_rows(t: &Tokens, missions: &[Mission]) -> Vec<El> {
	missions.iter().map(|mission| mission_row_of(t, mission)).collect()
}

fn mission_row_of(t: &Tokens, mission: &Mission) -> El {
	let ignore_missions: MissionsEmit<SceneState> = Rc::new(|_, _| {});
	mission_row(t, EN, mission, false, &ignore_missions, None)
}

fn earlier_today(t: &Tokens) -> Vec<EarlierToday<'static>> {
	vec![
		EarlierToday::Run(LATE_REPORTED_RUN),
		EarlierToday::Mission(Box::new(mission_row_of(t, &missions::CLOSED_MISSION))),
		EarlierToday::Run(REPORTED_RUN),
	]
}

fn every_mission(t: &Tokens, earlier_today_open: bool) -> Missions<'static> {
	Missions::Listed {
		waiting: mission_rows(t, &WAITING_MISSIONS),
		in_progress: mission_rows(t, &WORKING_MISSIONS),
		earlier_today: earlier_today(t),
		earlier_today_open,
	}
}

fn no_mission() -> Missions<'static> {
	Missions::Listed {
		waiting: Vec::new(),
		in_progress: Vec::new(),
		earlier_today: Vec::new(),
		earlier_today_open: false,
	}
}

fn docked(t: &Tokens, chrome: PanelChrome, body: El, layers: Vec<El>) -> El {
	staged(
		t,
		row()
			.w_full()
			.h_full()
			.justify_end()
			.child(col().w(PANEL_WIDTH).h_full().child(panel(t, EN, &chrome, body, ignore))),
		layers,
	)
}

fn on_activity(t: &Tokens, failure: Option<Failure>, count: usize, missions: Missions) -> El {
	let chrome = PanelChrome { page: Page::Activity, failure, routines_count: count };
	docked(t, chrome, activity(t, EN, missions, failure.is_some(), ignore), Vec::new())
}

fn on_routines(t: &Tokens, failure: Option<Failure>, can_create: bool, routines: Routines) -> El {
	let chrome = PanelChrome { page: Page::Routines { can_create }, failure, routines_count: 0 };
	docked(t, chrome, routines_page(t, EN, routines, ignore), Vec::new())
}

fn on_detail(t: &Tokens, failure: Option<Failure>) -> El {
	let chrome = PanelChrome { page: Page::Detail, failure, routines_count: 0 };
	docked(t, chrome, routine_detail(t, EN, &DIGEST_DETAIL, ignore), Vec::new())
}

pub(super) fn panel_default(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, None, ROUTINES.len(), every_mission(t, false))
}

pub(super) fn panel_one_mission(t: &Tokens, _: &SceneState) -> El {
	let missions = Missions::Listed {
		waiting: mission_rows(t, &WAITING_MISSIONS[..1]),
		in_progress: Vec::new(),
		earlier_today: Vec::new(),
		earlier_today_open: false,
	};
	on_activity(t, None, ROUTINES.len(), missions)
}

pub(super) fn panel_earlier_today_unfolded(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, None, ROUTINES.len(), every_mission(t, true))
}

pub(super) fn panel_empty(t: &Tokens, _: &SceneState) -> El {
	on_routines(t, None, true, Routines::Listed(&[]))
}

pub(super) fn panel_no_mission(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, None, ROUTINES.len(), no_mission())
}

pub(super) fn panel_opening_the_routines(t: &Tokens, _: &SceneState) -> El {
	on_routines(t, None, true, Routines::Listed(&ROUTINES))
}

pub(super) fn panel_routines_read_failed(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, Some(Failure::Routines), 0, every_mission(t, false))
}

pub(super) fn panel_routines_loading(t: &Tokens, _: &SceneState) -> El {
	on_routines(t, None, true, Routines::Loading)
}

pub(super) fn panel_missions_loading(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, None, ROUTINES.len(), Missions::Loading)
}

pub(super) fn panel_missions_read_failed(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, Some(Failure::Missions), ROUTINES.len(), no_mission())
}

pub(super) fn panel_activity_read_failed(t: &Tokens, _: &SceneState) -> El {
	on_activity(t, Some(Failure::Activity), 0, no_mission())
}

pub(super) fn panel_write_failed(t: &Tokens, _: &SceneState) -> El {
	on_routines(t, Some(Failure::Write), true, Routines::Listed(&ROUTINES))
}

pub(super) fn panel_creating(t: &Tokens, _: &SceneState) -> El {
	let chrome = PanelChrome {
		page: Page::Form { written: false, from_detail: false },
		failure: None,
		routines_count: 0,
	};
	let blank = TextEdit::new("");
	let form = new_form(&blank, &blank, TriggerField::Picking(None), Configuration::Nothing);
	docked(t, chrome, routine_form(t, EN, &form, ignore, scene_edit), Vec::new())
}

pub(super) fn panel_opening(t: &Tokens, _: &SceneState) -> El {
	on_detail(t, None)
}

fn editing_panel(t: &Tokens, title: &str, layers: Vec<El>) -> El {
	let chrome = PanelChrome {
		page: Page::Form { written: true, from_detail: true },
		failure: None,
		routines_count: 0,
	};
	let title = TextEdit::new(title);
	let instruction = TextEdit::new(DIGEST_INSTRUCTION);
	let expression = TextEdit::new("0 8 * * *");
	let form =
		written_form(&title, &instruction, ON_A_SCHEDULE, Configuration::Schedule(&expression));
	docked(t, chrome, routine_form(t, EN, &form, ignore, scene_edit), layers)
}

pub(super) fn panel_editing(t: &Tokens, _: &SceneState) -> El {
	editing_panel(t, "Morning digest", Vec::new())
}

pub(super) fn panel_leaving_an_unsaved_form(t: &Tokens, _: &SceneState) -> El {
	editing_panel(t, "Morning digest draft", vec![confirm_layer(t, EN, Confirm::Leave, ignore)])
}

pub(super) fn panel_run_now_failed(t: &Tokens, _: &SceneState) -> El {
	on_detail(t, Some(Failure::Write))
}

pub(super) fn panel_without_seated_lead(t: &Tokens, _: &SceneState) -> El {
	on_routines(t, None, false, Routines::Listed(&ROUTINES))
}

pub(super) fn panel_tinted(t: &Tokens, s: &SceneState) -> El {
	panel_default(&t.in_space(Some(Preset::Blue.hue())), s)
}

fn one_row(t: &Tokens, routine: &RoutineRow) -> El {
	stage(t, in_panel_width(routine_row(t, EN, routine, ignore)))
}

pub(super) fn row_default(t: &Tokens, _: &SceneState) -> El {
	one_row(t, &MORNING_DIGEST)
}

pub(super) fn row_stopped_itself(t: &Tokens, _: &SceneState) -> El {
	one_row(t, &RELEASE_WATCH)
}

pub(super) fn row_long_content(t: &Tokens, _: &SceneState) -> El {
	one_row(t, &RoutineRow { title: LONG_ROUTINE_TITLE, ..RELEASE_WATCH })
}

pub(super) fn row_deleting(t: &Tokens, _: &SceneState) -> El {
	let question = Confirm::Delete { title: MORNING_DIGEST.title, failed: false, busy: false };
	staged(
		t,
		row().w_full().h_full().center().child(in_panel_width(routine_row(
			t,
			EN,
			&MORNING_DIGEST,
			ignore,
		))),
		vec![confirm_layer(t, EN, question, ignore)],
	)
}

fn one_run(t: &Tokens, run: &ReportedRun) -> El {
	stage(t, in_panel_width(reported_run_row(t, EN, run)))
}

pub(super) fn run_reported(t: &Tokens, _: &SceneState) -> El {
	one_run(t, &ReportedRun { agent_hue: Some(Preset::Purple.hue()), ..REPORTED_RUN })
}

pub(super) fn run_another_bot(t: &Tokens, _: &SceneState) -> El {
	one_run(t, &LATE_REPORTED_RUN)
}

pub(super) fn run_long_content(t: &Tokens, _: &SceneState) -> El {
	one_run(t, &ReportedRun { routine_title: LONG_RUN_TITLE, ..REPORTED_RUN })
}

fn one_detail(t: &Tokens, detail: &RoutineDetail) -> El {
	at_height(t, routine_detail(t, EN, detail, ignore))
}

fn with_history(history: History<'static>) -> RoutineDetail<'static> {
	RoutineDetail { history, ..DIGEST_DETAIL }
}

pub(super) fn detail_default(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &DIGEST_DETAIL)
}

pub(super) fn detail_outcomes(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { newest_first: &OUTCOME_RUNS, ..HISTORY }))
}

pub(super) fn detail_running(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { newest_first: &DIGEST_RUNS[..1], ..HISTORY }))
}

pub(super) fn detail_without_reason(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { newest_first: &REASONLESS_RUNS, ..HISTORY }))
}

pub(super) fn detail_full_page_read(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { full_page: true, ..HISTORY }))
}

pub(super) fn detail_stopped_itself(t: &Tokens, _: &SceneState) -> El {
	one_detail(
		t,
		&RoutineDetail {
			id: RELEASE_WATCH.id,
			title: RELEASE_WATCH.title,
			trigger: RELEASE_WATCH.trigger,
			stopped_itself: true,
			history: History { newest_first: &OUTCOME_RUNS, ..HISTORY },
			..DIGEST_DETAIL
		},
	)
}

pub(super) fn detail_loading(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { newest_first: &[], reading: true, ..HISTORY }))
}

pub(super) fn detail_empty(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { newest_first: &[], ..HISTORY }))
}

pub(super) fn detail_error(t: &Tokens, _: &SceneState) -> El {
	one_detail(
		t,
		&with_history(History { newest_first: &[], reading: true, read_failed: true, ..HISTORY }),
	)
}

pub(super) fn detail_error_over_history(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &with_history(History { read_failed: true, ..HISTORY }))
}

pub(super) fn detail_run_now_in_flight(t: &Tokens, _: &SceneState) -> El {
	one_detail(t, &RoutineDetail { running: true, ..DIGEST_DETAIL })
}

pub(super) fn detail_run_now_refused(t: &Tokens, _: &SceneState) -> El {
	const IDS: [&str; 4] = ["refused-disabled", "refused-filter", "refused-dedupe", "refused-seen"];
	stage(
		t,
		col().w(PANEL_WIDTH).gap(SPACING * 4.0).children(RunRefusal::ALL.into_iter().zip(IDS).map(
			|(refusal, id)| {
				let detail = RoutineDetail {
					id,
					refusal: Some(refusal),
					history: History { newest_first: &REFUSED_RUN, ..HISTORY },
					..DIGEST_DETAIL
				};
				routine_detail(t, EN, &detail, ignore)
			},
		)),
	)
}

pub(super) fn detail_long_content(t: &Tokens, _: &SceneState) -> El {
	one_detail(
		t,
		&RoutineDetail {
			title: LONG_ROUTINE_TITLE,
			history: History { newest_first: &LONG_RUN, ..HISTORY },
			..DIGEST_DETAIL
		},
	)
}

const DIGEST_INSTRUCTION: &str = "Read what came in overnight and write a short digest.";
const ON_A_SCHEDULE: TriggerField = TriggerField::Tied("On a schedule");
const SPACE_INBOX: TriggerField = TriggerField::Tied("When the space inbox fills");
const NO_FILTER: Filter = Filter { match_mode: MatchMode::All, rows: &[] };

fn new_form<'a>(
	title: &'a TextEdit,
	instruction: &'a TextEdit,
	trigger: TriggerField<'a>,
	configuration: Configuration<'a>,
) -> RoutineForm<'a> {
	RoutineForm {
		written: false,
		title,
		instruction,
		trigger,
		configuration,
		refusal: None,
		filter: NO_FILTER,
		saving: false,
	}
}

fn written_form<'a>(
	title: &'a TextEdit,
	instruction: &'a TextEdit,
	trigger: TriggerField<'a>,
	configuration: Configuration<'a>,
) -> RoutineForm<'a> {
	RoutineForm { written: true, ..new_form(title, instruction, trigger, configuration) }
}

fn form_scene(t: &Tokens, form: &RoutineForm) -> El {
	stage(t, in_panel_width(routine_form(t, EN, form, ignore, scene_edit)))
}

pub(super) fn form_default(t: &Tokens, s: &SceneState) -> El {
	let [title, instruction] = &s.routine_fields;
	form_scene(
		t,
		&new_form(title, instruction, TriggerField::Picking(None), Configuration::Nothing),
	)
}

fn scheduled(t: &Tokens, title: &str, refusal: Option<FormRefusal>) -> El {
	let title = TextEdit::new(title);
	let instruction = TextEdit::new(DIGEST_INSTRUCTION);
	let expression = TextEdit::new("0 8 * * *");
	form_scene(
		t,
		&RoutineForm {
			refusal,
			..written_form(
				&title,
				&instruction,
				ON_A_SCHEDULE,
				Configuration::Schedule(&expression),
			)
		},
	)
}

pub(super) fn form_on_a_schedule(t: &Tokens, _: &SceneState) -> El {
	scheduled(t, "Morning digest", None)
}

pub(super) fn form_refused(t: &Tokens, _: &SceneState) -> El {
	scheduled(t, "Morning digest", Some(FormRefusal::UnreadableExpression))
}

pub(super) fn form_refused_blank_title(t: &Tokens, _: &SceneState) -> El {
	scheduled(t, "", Some(FormRefusal::BlankTitle))
}

pub(super) fn form_on_a_watched_file(t: &Tokens, _: &SceneState) -> El {
	let title = TextEdit::new("Release notes watch");
	let instruction = TextEdit::new("Say what changed in the release notes.");
	let path = TextEdit::new("/notes/CHANGELOG.md");
	form_scene(
		t,
		&written_form(
			&title,
			&instruction,
			TriggerField::Tied("When a watched file changes"),
			Configuration::WatchedPath(&path),
		),
	)
}

fn called(t: &Tokens, written: bool, webhook: Webhook) -> El {
	let (title, instruction) = if written {
		(TextEdit::new("Deploy report"), TextEdit::new("Report what the deployment said."))
	} else {
		(TextEdit::new(""), TextEdit::new(""))
	};
	let source = "When a local webhook is called";
	let form = if written {
		written_form(
			&title,
			&instruction,
			TriggerField::Tied(source),
			Configuration::Webhook(webhook),
		)
	} else {
		new_form(
			&title,
			&instruction,
			TriggerField::Picking(Some(source)),
			Configuration::Webhook(webhook),
		)
	};
	form_scene(t, &form)
}

pub(super) fn form_on_a_webhook_call(t: &Tokens, _: &SceneState) -> El {
	called(
		t,
		true,
		Webhook::Read(WebhookValues {
			address: "http://127.0.0.1:45367/routines/call",
			key: "e6f0e4ba-2c15-4f7d-9a41-8d2f0c1b7e35",
			header: "X-Kiroshi-Delivery",
		}),
	)
}

pub(super) fn form_before_its_first_write(t: &Tokens, _: &SceneState) -> El {
	called(t, false, Webhook::Unwritten)
}

pub(super) fn form_key_still_reading(t: &Tokens, _: &SceneState) -> El {
	called(t, true, Webhook::Reading)
}

pub(super) fn form_key_unreadable(t: &Tokens, _: &SceneState) -> El {
	called(t, true, Webhook::Unreadable)
}

fn inbox(t: &Tokens, filter: Filter, trigger: TriggerField) -> El {
	let title = TextEdit::new("Nightly cleanup");
	let instruction = TextEdit::new("Close what the space inbox left open.");
	form_scene(
		t,
		&RoutineForm {
			filter,
			..written_form(&title, &instruction, trigger, Configuration::Nothing)
		},
	)
}

pub(super) fn form_on_a_source_with_no_configuration(t: &Tokens, _: &SceneState) -> El {
	inbox(t, NO_FILTER, SPACE_INBOX)
}

fn declared<'a>(field: &'a str, operator: Operator, value: Value<'a>) -> FilterRow<'a> {
	FilterRow {
		field: FieldPick::Declared(field),
		operator,
		value,
		operator_error: None,
		value_missing: false,
	}
}

fn single(t: &Tokens, row: FilterRow) -> El {
	inbox(t, Filter { match_mode: MatchMode::All, rows: &[row] }, SPACE_INBOX)
}

fn two_rows(t: &Tokens, refused: Option<OperatorError>) -> El {
	let invoice = TextEdit::new("invoice");
	let ten = TextEdit::new("10");
	let rows = [
		declared("subject", Operator::Contains, Value::Text(&invoice)),
		FilterRow {
			operator_error: refused,
			..declared("unreadCount", Operator::Gt, Value::Number(&ten))
		},
	];
	inbox(t, Filter { match_mode: MatchMode::Any, rows: &rows }, SPACE_INBOX)
}

pub(super) fn form_filter_on_two_rows(t: &Tokens, _: &SceneState) -> El {
	two_rows(t, None)
}

pub(super) fn form_filter_refused_for_its_operator(t: &Tokens, _: &SceneState) -> El {
	two_rows(t, Some(OperatorError::Unsupported(Operator::Gt, FieldType::Boolean)))
}

pub(super) fn form_filter_on_a_present_field(t: &Tokens, _: &SceneState) -> El {
	single(t, declared("receivedAt", Operator::Exists, Value::Unasked))
}

pub(super) fn form_filter_on_a_boolean_field(t: &Tokens, _: &SceneState) -> El {
	single(t, declared("isFlagged", Operator::Equals, Value::Boolean(true)))
}

pub(super) fn form_filter_on_another_path(t: &Tokens, _: &SceneState) -> El {
	let path = TextEdit::new("sender.address");
	single(
		t,
		FilterRow {
			field: FieldPick::OtherPath(&path),
			..declared("", Operator::Exists, Value::Unasked)
		},
	)
}

pub(super) fn form_filter_on_a_number_field(t: &Tokens, _: &SceneState) -> El {
	let ten = TextEdit::new("10");
	single(t, declared("unreadCount", Operator::Gt, Value::Number(&ten)))
}

pub(super) fn form_filter_missing_a_value(t: &Tokens, _: &SceneState) -> El {
	let blank = TextEdit::new("");
	single(
		t,
		FilterRow {
			value_missing: true,
			..declared("subject", Operator::Contains, Value::Text(&blank))
		},
	)
}

pub(super) fn form_filter_at_the_panel_width(t: &Tokens, _: &SceneState) -> El {
	let long_value = TextEdit::new("quarterly-invoice-reconciliation-2026-north-region");
	let long_path = TextEdit::new("delivery.attachments.first.originalFileName");
	let rows = [
		declared("subject", Operator::Contains, Value::Text(&long_value)),
		FilterRow {
			field: FieldPick::OtherPath(&long_path),
			..declared("", Operator::Exists, Value::Unasked)
		},
	];
	inbox(t, Filter { match_mode: MatchMode::All, rows: &rows }, SPACE_INBOX)
}

fn undescribed(t: &Tokens, count: &str, count_missing: bool) -> El {
	let count_path = TextEdit::new("unreadCount");
	let count_value = TextEdit::new(count);
	let subject_path = TextEdit::new("subject");
	let invoice = TextEdit::new("invoice");
	let rows = [
		FilterRow {
			field: FieldPick::OtherPath(&count_path),
			value_missing: count_missing,
			..declared("", Operator::Gt, Value::Number(&count_value))
		},
		FilterRow {
			field: FieldPick::OtherPath(&subject_path),
			..declared("", Operator::Contains, Value::Text(&invoice))
		},
	];
	let title = TextEdit::new("Newsletter sweep");
	let instruction = TextEdit::new("Report what the newsletter inbox piled up.");
	form_scene(
		t,
		&RoutineForm {
			filter: Filter { match_mode: MatchMode::All, rows: &rows },
			..written_form(
				&title,
				&instruction,
				TriggerField::Tied("space-newsletter"),
				Configuration::Nothing,
			)
		},
	)
}

pub(super) fn form_filter_on_an_undescribed_source(t: &Tokens, _: &SceneState) -> El {
	undescribed(t, "10", false)
}

pub(super) fn form_filter_value_refused_on_an_undescribed_source(t: &Tokens, _: &SceneState) -> El {
	undescribed(t, "", true)
}
