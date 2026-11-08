use rune::{El, TextEdit, col, row};

use super::SceneState;
use crate::hues::Preset;
use crate::icons;
use crate::strings::Language;
use crate::surfaces::s07_approvals::{
	AnsweredQuestion, Answerer, ApprovalParameter, ApprovalStatus, Draft, ParameterValue, Question,
	QuestionAction, QuestionEntry, QuestionEvent, QuestionFailure, QuestionLink, QuestionOption,
	QuestionPanel, ToolApproval, answered_question_card, tool_approval, tool_question, waiting_bar,
};
use crate::tokens::{SHELL_INSET, SPACING, Tokens};

const EN: Language = Language::En;
const PAGE_INSET: f32 = SPACING * 4.0;
const CELL_INSET: f32 = SPACING * 6.0;
const STORY_WIDTH: f32 = 576.0;
const NARROW_WIDTH: f32 = 320.0;
const ANSWERED_WIDTH: f32 = 672.0;
const LONG_ANSWER_WIDTH: f32 = 480.0;
const COLUMN_INSET: f32 = SPACING * 6.0;

const BASH_COMMAND: &str = "rm -rf apps/app/dist && bun run build";
const APPROVAL_DESCRIPTION: &str = "The agent needs your approval to run this tool.";
const PATH_PARAMETERS: &[ApprovalParameter] = &[ApprovalParameter {
	label: "Path",
	value: ParameterValue::Shown("/Users/ada/kiroshi/apps/app/src/App.tsx"),
}];

const FRAMEWORK_OPTIONS: &[QuestionOption] = &[
	QuestionOption {
		label: "Next.js",
		description: "Server rendering and routing out of the box.",
		preview: Some("bun create next-app dashboard"),
	},
	QuestionOption {
		label: "Vite",
		description: "A thin dev server, no framework opinions.",
		preview: Some("bun create vite dashboard"),
	},
	QuestionOption::new("Remix", "Nested routes with loaders on every level."),
];
const FRAMEWORK: Question =
	Question::ask("Which framework should the dashboard use?", "Framework", FRAMEWORK_OPTIONS);

const REGISTRY: Question = Question::ask(
	"Where should the components come from?",
	"Component registry and design token source",
	&[
		QuestionOption::new("Base UI", "The primitives already vendored."),
		QuestionOption::new("Radix", "A second set to install and keep."),
	],
);

const SCOPE: Question = Question {
	is_multi_select: true,
	..Question::ask(
		"Which surfaces should the migration cover?",
		"Scope",
		&[
			QuestionOption::new("Chat", "The transcript and its composer."),
			QuestionOption::new("Settings", "Every panel of the settings dialog."),
			QuestionOption::new("Onboarding", "The first-run screens only."),
			QuestionOption::new("Marketing", "The public site, out of the app."),
		],
	)
};

const NAMING: Question = Question::ask(
	"What should the package be called?",
	"Naming",
	&[
		QuestionOption::new("@workspace/tokens", "Matches the ui package."),
		QuestionOption::new("@workspace/design", "Wider than tokens alone."),
	],
);

const RELEASE: Question = Question::ask(
	"When should it ship?",
	"Release",
	&[
		QuestionOption::new("Now", "Cut a release from this branch."),
		QuestionOption::new("Next week", "Wait for the audit to land."),
	],
);

const PLAN_OPTIONS: &[QuestionOption] = &[
	QuestionOption::new("Starter", "One seat and the core features."),
	QuestionOption::new("Team", "Up to ten seats and shared Spaces."),
	QuestionOption::new("Enterprise", "Unlimited seats, single sign-on and audit logs."),
];
const PLAN: Question = Question::ask("Which plan should Northwind start on?", "Plan", PLAN_OPTIONS);

const CHANNELS: Question = Question {
	is_multi_select: true,
	..Question::ask(
		"Where should the launch be announced?",
		"Channels",
		&[
			QuestionOption::new("Newsletter", "The monthly email to customers."),
			QuestionOption::new("Blog", "A post on the Northwind site."),
			QuestionOption::new("Social", "A thread on every Northwind account."),
		],
	)
};

const LONG_QUESTION: Question = Question::ask(
	"Northwind runs three warehouses and a storefront that all share one catalogue, so which plan should the whole team start on before the spring launch?",
	"Plan",
	PLAN_OPTIONS,
);

const COMPANION: &str = "Shoto";
pub(super) const OWN_ANSWER: &str = "Wait until the spring catalogue is ready";
pub(super) const FREE_TEXT: &str = "TanStack Start, once it is stable";
pub(super) const SECRET: &str = "sk-ant-0f3c1a";
pub(super) const PACKAGE_NAME: &str = "@workspace/foundations";
pub(super) const LINEAR_MARK: &str = "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 36'><rect width='36' height='36' fill='#5e6ad2'/><path d='M13.5 11.5h3v10.5h6.5v2.5h-9.5z' fill='#ffffff'/></svg>";

const SIGN_IN_URL: &str = "claude.ai/oauth/authorize?code=true&client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&response_type=code&scope=user%3Ainference&state=8f3c1a";

const CODE_STEP: Question = Question {
	link: Some(QuestionLink { label: "Open this link and sign in", url: SIGN_IN_URL }),
	entry: Some(QuestionEntry {
		label: "Then paste the code it gives you",
		placeholder: "",
		is_secret: false,
	}),
	exit: Some("Paste a key instead"),
	..Question::ask("Paste the code Claude gave you", "Sign in", &[])
};

const KEY_STEP: Question = Question {
	entry: Some(QuestionEntry { label: "Key", placeholder: "sk-ant-…", is_secret: true }),
	exit: Some("Sign in instead"),
	..Question::ask("Paste your Anthropic API key", "API key", &[])
};

const SIGN_IN_FAILED_STEP: Question = Question {
	is_options_only: true,
	failure: Some(QuestionFailure {
		title: "Couldn’t sign you in",
		detail: Some("auth login exited with code 1"),
	}),
	..Question::ask(
		"Try again, or use a key instead?",
		"Sign in",
		&[
			QuestionOption::new("Try again", "Opens your browser once more."),
			QuestionOption::new("Paste an API key", "Pay per use, with nothing to sign in to."),
		],
	)
};

const APPLICATION_SCOPE_OPTIONS: &[QuestionOption] = &[
	QuestionOption::new("Only Shoto", "Shoto reads and files Linear issues. No other agent does."),
	QuestionOption::new("Every agent", "Linear joins every agent, and every one you add later."),
	QuestionOption::new("Don't install", "Nothing is added. Shoto carries on without Linear."),
];

const KEY_REFUSED_NOTICE: Question = Question {
	failure: Some(QuestionFailure {
		title: "Sentry refused the key",
		detail: Some("401 Unauthorized: invalid auth token"),
	}),
	action: Some(QuestionAction { label: "Open Settings", glyph: &icons::SETTINGS }),
	..Question::notice("Sentry")
};

struct Ask<'a> {
	questions: &'a [Question<'a>],
	chosen: &'a [&'a [usize]],
	shown: usize,
	can_skip: bool,
	can_minimise: bool,
}

impl<'a> Ask<'a> {
	const fn of(questions: &'a [Question<'a>]) -> Ask<'a> {
		Ask { questions, chosen: &[], shown: 0, can_skip: true, can_minimise: false }
	}
}

fn record(s: &mut SceneState, event: QuestionEvent) {
	match event {
		QuestionEvent::Choose(option) => s.chosen = vec![option],
		QuestionEvent::Toggle(option) => match s.chosen.iter().position(|&held| held == option) {
			Some(at) => {
				s.chosen.remove(at);
			}
			None => s.chosen.push(option),
		},
		_ => {}
	}
}

fn panel_view(t: &Tokens, s: &SceneState, ask: Ask, tuning: impl Fn(&mut QuestionPanel)) -> El {
	let blank = TextEdit::new("");
	let drafts: Vec<Draft> = (0..ask.questions.len())
		.map(|index| Draft {
			chosen: ask.chosen.get(index).copied().unwrap_or_default(),
			edit: if index == ask.shown { &s.edit } else { &blank },
		})
		.collect();
	let mut panel = QuestionPanel {
		questions: ask.questions,
		drafts: &drafts,
		shown: ask.shown,
		companion: None,
		can_skip: ask.can_skip,
		can_minimise: ask.can_minimise,
		has_digit_keys: false,
		is_refused: false,
		is_pending: false,
		has_copied: false,
	};
	tuning(&mut panel);
	tool_question(t, EN, &panel, |s: &mut SceneState| &mut s.edit, record)
}

fn panel(t: &Tokens, s: &SceneState, ask: Ask) -> El {
	panel_view(t, s, ask, |_| {})
}

fn page(t: &Tokens, width: f32, content: El) -> El {
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.padding(PAGE_INSET)
			.items_center()
			.fill(t.card)
			.child(col().w_full().max_w(width).child(content)),
		Vec::new(),
	)
}

fn story(t: &Tokens, content: El) -> El {
	page(t, STORY_WIDTH, content)
}

fn northwind(t: &Tokens) -> Tokens {
	t.in_space(Some(Preset::Green.hue()))
}

fn composer_slot(t: &Tokens, content: El) -> El {
	col()
		.w_full()
		.pl(SHELL_INSET)
		.pr(SHELL_INSET)
		.pt(CELL_INSET)
		.pb(SHELL_INSET)
		.fill(t.background)
		.child(content)
}

fn side_by_side(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.pl(PAGE_INSET + CELL_INSET)
			.pt(PAGE_INSET + CELL_INSET)
			.pr(CELL_INSET)
			.fill(t.card)
			.child(content),
		Vec::new(),
	)
}

fn in_slot(t: &Tokens, build: impl Fn(&Tokens) -> El) -> El {
	let t = northwind(t);
	side_by_side(&t, composer_slot(&t, build(&t)))
}

fn narrow(t: &Tokens, content: El) -> El {
	page(t, NARROW_WIDTH, content)
}

fn narrow_column(t: &Tokens, content: El) -> El {
	narrow(t, col().w_full().pl(COLUMN_INSET).pr(COLUMN_INSET).child(content))
}

pub(super) fn approval_default(t: &Tokens, _: &SceneState) -> El {
	let approval = ToolApproval {
		tool: "Bash",
		title: Some("Run a shell command?"),
		description: Some(APPROVAL_DESCRIPTION),
		code: Some(BASH_COMMAND),
		..ToolApproval::default()
	};
	story(t, tool_approval(t, EN, &approval, |_: &mut SceneState, _| {}))
}

pub(super) fn approval_with_path(t: &Tokens, _: &SceneState) -> El {
	let approval = ToolApproval {
		tool: "Write",
		title: Some("Allow this file to be written?"),
		description: Some(APPROVAL_DESCRIPTION),
		parameters: PATH_PARAMETERS,
		status: ApprovalStatus::Pending,
		is_open: true,
		..ToolApproval::default()
	};
	story(t, tool_approval(t, EN, &approval, |_: &mut SceneState, _| {}))
}

fn plan_in_slot(t: &Tokens, s: &SceneState, chosen: &[&[usize]]) -> El {
	in_slot(t, |t| {
		panel_view(t, s, Ask { chosen, can_minimise: true, ..Ask::of(&[PLAN]) }, |panel| {
			panel.has_digit_keys = true;
		})
	})
}

pub(super) fn nothing_chosen(t: &Tokens, s: &SceneState) -> El {
	plan_in_slot(t, s, &[])
}

pub(super) fn option_chosen(t: &Tokens, s: &SceneState) -> El {
	plan_in_slot(t, s, &[&[1]])
}

pub(super) fn chosen_row_follows_space_tint(t: &Tokens, s: &SceneState) -> El {
	let t = t.in_space(Some(Preset::Blue.hue()));
	story(&t, composer_slot(&t, panel(&t, s, Ask { chosen: &[&[1]], ..Ask::of(&[PLAN]) })))
}

pub(super) fn option_row_hovered(t: &Tokens, s: &SceneState) -> El {
	in_slot(t, |t| panel(t, s, Ask { chosen: &[&[1]], ..Ask::of(&[PLAN]) }))
}

pub(super) fn several_checked(t: &Tokens, s: &SceneState) -> El {
	in_slot(t, |t| {
		panel(t, s, Ask { chosen: &[&[0, 2]], can_minimise: true, ..Ask::of(&[CHANNELS]) })
	})
}

pub(super) fn own_answer_typing(t: &Tokens, s: &SceneState) -> El {
	plan_in_slot(t, s, &[])
}

pub(super) fn several_questions(t: &Tokens, s: &SceneState) -> El {
	in_slot(t, |t| {
		panel(
			t,
			s,
			Ask {
				chosen: &[&[1]],
				shown: 1,
				can_minimise: true,
				..Ask::of(&[PLAN, CHANNELS, RELEASE])
			},
		)
	})
}

fn waiting(t: &Tokens, s: &SceneState, question: Question) -> El {
	let questions = [question];
	let drafts = [Draft { chosen: &[], edit: &s.edit }];
	let panel = QuestionPanel {
		questions: &questions,
		drafts: &drafts,
		shown: 0,
		companion: Some(COMPANION),
		can_skip: false,
		can_minimise: false,
		has_digit_keys: false,
		is_refused: false,
		is_pending: false,
		has_copied: false,
	};
	waiting_bar(t, EN, &panel, record)
}

pub(super) fn waiting_bar_wide(t: &Tokens, s: &SceneState) -> El {
	in_slot(t, |t| waiting(t, s, PLAN))
}

pub(super) fn answer_pressed(t: &Tokens, s: &SceneState) -> El {
	in_slot(t, |t| {
		panel_view(t, s, Ask { chosen: &[&[1]], can_minimise: true, ..Ask::of(&[PLAN]) }, |panel| {
			panel.has_digit_keys = true
		})
	})
}

pub(super) fn waiting_bar_narrow(t: &Tokens, s: &SceneState) -> El {
	let tinted = northwind(t);
	narrow(&tinted, composer_slot(&tinted, waiting(&tinted, s, LONG_QUESTION)))
}

pub(super) fn long_question_narrow(t: &Tokens, s: &SceneState) -> El {
	let tinted = northwind(t);
	narrow(
		&tinted,
		composer_slot(
			&tinted,
			panel(&tinted, s, Ask { can_minimise: true, ..Ask::of(&[LONG_QUESTION]) }),
		),
	)
}

pub(super) fn keyboard_focus_rings(t: &Tokens, s: &SceneState) -> El {
	let t = northwind(t);
	story(
		&t,
		composer_slot(&t, panel(&t, s, Ask { can_minimise: true, ..Ask::of(&[PLAN, CHANNELS]) })),
	)
}

pub(super) fn single_select(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { chosen: &[&[1]], ..Ask::of(&[FRAMEWORK]) }))
}

pub(super) fn multi_select(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { chosen: &[&[0, 2]], ..Ask::of(&[SCOPE]) }))
}

pub(super) fn free_text(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask::of(&[FRAMEWORK])))
}

fn digit_panel(t: &Tokens, s: &SceneState, question: Question) -> El {
	let chosen = [s.chosen.as_slice()];
	story(
		t,
		panel_view(t, s, Ask { chosen: &chosen, ..Ask::of(&[question]) }, |panel| {
			panel.has_digit_keys = true;
		}),
	)
}

pub(super) fn digit_keys_choose(t: &Tokens, s: &SceneState) -> El {
	digit_panel(t, s, PLAN)
}

pub(super) fn digit_keys_toggle(t: &Tokens, s: &SceneState) -> El {
	digit_panel(t, s, CHANNELS)
}

pub(super) fn keyboard_only(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { chosen: &[&[0], &[0]], shown: 1, ..Ask::of(&[SCOPE, RELEASE]) }))
}

pub(super) fn four_questions(t: &Tokens, s: &SceneState) -> El {
	story(
		t,
		panel(
			t,
			s,
			Ask {
				chosen: &[&[0], &[1, 0], &[], &[1]],
				shown: 2,
				..Ask::of(&[FRAMEWORK, SCOPE, NAMING, RELEASE])
			},
		),
	)
}

pub(super) fn narrow_four(t: &Tokens, s: &SceneState) -> El {
	narrow_column(
		t,
		panel(
			t,
			s,
			Ask { chosen: &[&[], &[], &[], &[1]], ..Ask::of(&[FRAMEWORK, SCOPE, NAMING, RELEASE]) },
		),
	)
}

pub(super) fn long_header_scrolls(t: &Tokens, s: &SceneState) -> El {
	narrow_column(t, panel(t, s, Ask { chosen: &[&[0]], shown: 1, ..Ask::of(&[REGISTRY, SCOPE]) }))
}

pub(super) fn arrow_key_tabs(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { shown: 1, ..Ask::of(&[SCOPE, RELEASE, FRAMEWORK]) }))
}

pub(super) fn options_as_whole_answer(t: &Tokens, s: &SceneState) -> El {
	let question = Question { is_options_only: true, ..FRAMEWORK };
	story(t, panel(t, s, Ask { chosen: &[&[1]], ..Ask::of(&[question]) }))
}

pub(super) fn no_skip(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { can_skip: false, ..Ask::of(&[FRAMEWORK]) }))
}

fn code_step(t: &Tokens, s: &SceneState) -> El {
	panel(t, s, Ask::of(&[CODE_STEP]))
}

pub(super) fn entry_with_link(t: &Tokens, s: &SceneState) -> El {
	narrow(t, code_step(t, s))
}

pub(super) fn entry_with_secret(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask::of(&[KEY_STEP])))
}

pub(super) fn failure(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask::of(&[SIGN_IN_FAILED_STEP])))
}

pub(super) fn entry_narrow(t: &Tokens, s: &SceneState) -> El {
	narrow_column(t, panel(t, s, Ask::of(&[KEY_STEP])))
}

pub(super) fn application_scope(t: &Tokens, s: &SceneState) -> El {
	let question = Question {
		mark: s.mark.as_ref(),
		is_options_only: true,
		..Question::ask("Who should get Linear?", "Linear", APPLICATION_SCOPE_OPTIONS)
	};
	story(t, panel(t, s, Ask { chosen: &[&[1]], can_skip: false, ..Ask::of(&[question]) }))
}

pub(super) fn failure_with_action(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { can_skip: false, ..Ask::of(&[KEY_REFUSED_NOTICE]) }))
}

pub(super) fn notice_in_queue(t: &Tokens, s: &SceneState) -> El {
	story(t, panel(t, s, Ask { chosen: &[&[0]], ..Ask::of(&[RELEASE, KEY_REFUSED_NOTICE]) }))
}

fn inverse_cards(t: &Tokens, s: &SceneState) -> El {
	let blank = SceneState::new(s.scene);
	col()
		.w_full()
		.gap(SPACING * 4.0)
		.child(panel(t, s, Ask::of(&[FRAMEWORK])))
		.child(panel(t, &blank, Ask::of(&[SCOPE, REGISTRY])))
		.child(panel(t, &blank, Ask { can_skip: false, ..Ask::of(&[KEY_REFUSED_NOTICE]) }))
}

pub(super) fn inverse_buttons(t: &Tokens, s: &SceneState) -> El {
	side_by_side(t, inverse_cards(t, s))
}

pub(super) fn inverse_buttons_pending(t: &Tokens, s: &SceneState) -> El {
	side_by_side(
		t,
		panel_view(t, s, Ask { chosen: &[&[1]], ..Ask::of(&[FRAMEWORK]) }, |panel| {
			panel.is_pending = true;
		}),
	)
}

pub(super) fn themes_link_row_at_rest(t: &Tokens, s: &SceneState) -> El {
	side_by_side(t, row().w(NARROW_WIDTH).child(code_step(t, s)))
}

const VIEWER: Answerer = Answerer { name: "Sam", image: None, is_viewer: true };
const MEMBER: Answerer = Answerer { name: "Maya Okafor", image: None, is_viewer: false };
const ANSWERED_AT: &str = "09:24";

const MIGRATION_ANSWERS: &[AnsweredQuestion] = &[
	AnsweredQuestion {
		header: "Scope",
		options: &[
			QuestionOption::new("Every table", "One window, one rollback"),
			QuestionOption::new("Schema only", "The data stays put"),
		],
		chosen: &[0],
		free_text: None,
	},
	AnsweredQuestion {
		header: "Window",
		options: &[
			QuestionOption::new("Tonight", "After the last deploy"),
			QuestionOption::new("Saturday", "Lowest traffic of the week"),
		],
		chosen: &[0],
		free_text: None,
	},
	AnsweredQuestion {
		header: "Rollback",
		options: &[
			QuestionOption::new("Roll back", "Restore the snapshot"),
			QuestionOption::new("Stop and ask", ""),
		],
		chosen: &[0],
		free_text: None,
	},
];

const CHANNEL_ANSWERS: &[AnsweredQuestion] = &[AnsweredQuestion {
	header: "Release channel",
	options: &[
		QuestionOption::new("Stable", "Every user, today"),
		QuestionOption::new("Beta", "Early access for a week first"),
		QuestionOption::new("Internal", "The team only"),
	],
	chosen: &[1],
	free_text: None,
}];

const NOTIFY_ANSWERS: &[AnsweredQuestion] = &[AnsweredQuestion {
	header: "Notify",
	options: &[
		QuestionOption::new("Support", "Ahead of the tickets"),
		QuestionOption::new("Sales", "For the renewal calls"),
		QuestionOption::new("Marketing", "For the changelog post"),
	],
	chosen: &[2, 0],
	free_text: None,
}];

const NAME_ANSWERS: &[AnsweredQuestion] = &[AnsweredQuestion {
	header: "Service name",
	options: &[QuestionOption::new("ledger", ""), QuestionOption::new("accounts", "")],
	chosen: &[],
	free_text: Some(
		"Call it billing-core for now, we'll rename it once the finance team has picked a name for the whole product line.",
	),
}];

const LONG_ANSWERS: &[AnsweredQuestion] = &[
	AnsweredQuestion {
		header: "Export destination",
		options: &[QuestionOption::new(
			"The shared archive bucket the finance team reads every month",
			"Kept for seven years, encrypted at rest, readable by the auditors only",
		)],
		chosen: &[0],
		free_text: None,
	},
	AnsweredQuestion {
		header: "Path",
		options: &[],
		chosen: &[],
		free_text: Some(
			"s3://kiroshi-finance-archive/exports/2026/october/reconciliation-ledger-full-snapshot.parquet",
		),
	},
];

fn answered(t: &Tokens, width: f32, answerer: &Answerer, questions: &[AnsweredQuestion]) -> El {
	let t = northwind(t);
	let card = answered_question_card(&t, EN, answerer, ANSWERED_AT, questions);
	page(&t, width, col().w_full().pl(COLUMN_INSET).pr(COLUMN_INSET).child(card))
}

pub(super) fn you_answered(t: &Tokens, _: &SceneState) -> El {
	answered(t, ANSWERED_WIDTH, &VIEWER, MIGRATION_ANSWERS)
}

pub(super) fn member_answered(t: &Tokens, _: &SceneState) -> El {
	answered(t, ANSWERED_WIDTH, &MEMBER, CHANNEL_ANSWERS)
}

pub(super) fn answered_multi_select(t: &Tokens, _: &SceneState) -> El {
	answered(t, ANSWERED_WIDTH, &VIEWER, NOTIFY_ANSWERS)
}

pub(super) fn answered_free_text(t: &Tokens, _: &SceneState) -> El {
	answered(t, ANSWERED_WIDTH, &VIEWER, NAME_ANSWERS)
}

pub(super) fn answered_long_content(t: &Tokens, _: &SceneState) -> El {
	answered(t, LONG_ANSWER_WIDTH, &MEMBER, LONG_ANSWERS)
}
