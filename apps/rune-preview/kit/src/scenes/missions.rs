use std::rc::Rc;

use rune::{Align, El, Side, col, row, text};

use super::SceneState;
use crate::avatar::Face;
use crate::strings::{Language, chat};
use crate::surfaces::s08_missions::{
	Bot, Emit, EventKind, EventLink, Header, LinkStyle, ListEnd, MenuFacts, Mission, MissionEvent,
	MissionState, PANEL_WIDTH, Panel, PanelMission, PullRequest, Status, Ticket, TicketLayout,
	ToolCall, activity_line, author_line, event_row, mission_card, mission_copy_menu,
	mission_detail_skeleton, mission_header, mission_header_skeleton, mission_menu, mission_row,
	mission_turn, missions_feed_skeleton, missions_panel, panel_frame, soft_bubble, state_pill,
	ticket_line, tool_mark, turn_lane,
};
use crate::tokens::{SPACING, TEXT_BUBBLE, Tokens};
use crate::widgets::not_drawn;

pub(super) const ROWS: (f32, f32) = (640.0, 820.0);
pub(super) const TURN: (f32, f32) = (720.0, 360.0);
pub(super) const TURNS: (f32, f32) = (720.0, 2640.0);
pub(super) const HEADERS: (f32, f32) = (640.0, 1420.0);
pub(super) const EVENTS: (f32, f32) = (640.0, 1720.0);
pub(super) const THREAD: (f32, f32) = (640.0, 1040.0);
pub(super) const PANEL: (f32, f32) = (640.0, 760.0);
pub(super) const MENU: (f32, f32) = (720.0, 520.0);
pub(super) const FULL: (f32, f32) = (1180.0, 900.0);

const EN: Language = Language::En;
const NOW: i64 = 1_772_616_600_000;
const CLOCK_MS: f64 = 600.0;
const ROW_PANEL: f32 = 320.0;
const PADDED: f32 = SPACING * 4.0;
const HEADER_WIDTH: f32 = SPACING * 144.0;
const NARROW: f32 = SPACING * 120.0;
const SQUEEZED: f32 = SPACING * 80.0;
const COLUMN: f32 = SPACING * 112.0;
const ACTIVITY_WIDTH: f32 = SPACING * 96.0;
const TURN_GAP: f32 = SPACING * 6.0;
const MENU_POINTER_DROP: f32 = -SPACING * 7.0;

const fn minutes_before(minutes: i64) -> i64 {
	NOW - minutes * 60_000
}

const fn bot(id: &'static str, name: &'static str) -> Bot<'static> {
	Bot { id, name, title: "", hue: None }
}

const ADA: Bot = bot("bot-ada-martin", "Ada Martin");
const NOOR: Bot = bot("bot-noor-beltran", "Noor Beltran");
const IRIS: Bot = bot("bot-iris-nakamura", "Iris Nakamura");
const AUTHOR: Bot = Bot { title: "Design", ..ADA };
const CLOSED_AUTHOR: Bot = Bot { title: "Storage", ..NOOR };

const fn ticket(
	platform: &'static str,
	external_id: &'static str,
	title: &'static str,
) -> Ticket<'static> {
	Ticket { platform, external_id, title, url: "" }
}

const NO_TICKET: Ticket = ticket("", "", "");

const LAST_ACTIVITY: ToolCall =
	ToolCall { tool: "Edit", target: "packages/changelog/src/parse-release-notes.ts" };

const BASE: Mission = Mission {
	id: "",
	bot: ADA,
	objective: "",
	ticket: NO_TICKET,
	tools: &[],
	state: MissionState::Working,
	is_working: false,
	is_closed: false,
	timestamp: "",
	now: Some(NOW),
	clock_ms: CLOCK_MS,
	status: None,
	commits_ahead: 0,
	pull_request: None,
	last_activity: None,
};

pub(super) const WAITING_HUMAN_MISSION: Mission = Mission {
	id: "mission-migration",
	objective: "Migrate the run history table",
	ticket: ticket("linear", "OPE-51", "Move the run history off the shared database"),
	tools: &["GitHub"],
	state: MissionState::WaitingHuman,
	timestamp: "2d",
	..BASE
};

pub(super) const READY_MISSION: Mission = Mission {
	id: "mission-badges",
	bot: NOOR,
	objective: "Draw the badge dots of the roster",
	ticket: ticket("github", "OPE-29", "Badge dots on the roster rows"),
	tools: &["GitHub"],
	state: MissionState::ReadyToMerge,
	timestamp: "5h",
	..BASE
};

pub(super) const WORKING_MISSION: Mission = Mission {
	id: "mission-parser",
	objective: "Rewrite the changelog parser",
	ticket: ticket("linear", "OPE-42", "Changelog parser"),
	tools: &["Superset", "GitHub"],
	state: MissionState::Working,
	is_working: true,
	timestamp: "1h",
	last_activity: Some(LAST_ACTIVITY),
	..BASE
};

pub(super) const WAITING_BOT_MISSION: Mission = Mission {
	id: "mission-transcript",
	bot: IRIS,
	objective: "Store the transcript of a mission thread",
	ticket: ticket("jira", "", "Mission transcripts kept next to the conversation"),
	state: MissionState::WaitingBot,
	timestamp: "12m",
	..BASE
};

pub(super) const FAILED_MISSION: Mission = Mission {
	id: "mission-upgrade",
	bot: IRIS,
	objective: "Upgrade the desktop shell",
	ticket: ticket("github", "OPE-17", "Desktop shell upgrade"),
	tools: &["Terminal"],
	state: MissionState::Failed,
	timestamp: "3d",
	..BASE
};

pub(super) const CLOSED_MISSION: Mission = Mission {
	id: "mission-tools",
	bot: NOOR,
	objective: "Let a bot manage its routines through MCP",
	ticket: ticket("linear", "OPE-22", "Routines over MCP"),
	tools: &["Superset"],
	state: MissionState::Done,
	is_closed: true,
	timestamp: "09:12",
	..BASE
};

const UNTICKETED_MISSION: Mission = Mission {
	id: "mission-unticketed",
	objective: "Read the shift log of the night",
	state: MissionState::Working,
	is_working: true,
	timestamp: "22m",
	..BASE
};

const MISSION_PULL_REQUEST: PullRequest =
	PullRequest { url: "https://github.example/kiroshi/kiroshi/pull/482", number: 482 };

const COMMITS_AHEAD_MISSION: Mission =
	Mission { id: "mission-commits-ahead", commits_ahead: 3, ..WORKING_MISSION };

const MISSION_STATUS: Status = Status {
	text: "Running the storybook suite before opening the pull request",
	written_at: minutes_before(4),
};

const LONG_MISSION_STATUS: Status = Status {
	text: "Rebased the branch on main and resolved the conflict in the mission header. The storybook suite now passes on every story of the three mission surfaces, the type check is green and lint reports nothing. Waiting on the design review before opening the pull request against supercalifragilisticexpialidociousdesigntokensurface.",
	..MISSION_STATUS
};

const MISSION_TICKET: Ticket = Ticket {
	url: "https://linear.example/kiroshi/issue/OPE-30",
	..ticket("linear", "OPE-30", "Mission thread screen and mission card in the origin")
};

const MISSION_OBJECTIVE: &str = "Render the mission thread header and its event rows";
const MISSION_OPENED_AT: i64 = NOW - 5_400_000;
const MISSION_TOOLS: &[&str] = &["Superset", "GitHub", "Terminal"];
const MISSION_TOOLS_WITHOUT_A_MARK: &[&str] = &["Terminal", "Web search"];
const MISSION_CARD_TOOLS: &[&str] = &["Superset", "paper", "GitHub"];

const fn event(
	id: &'static str,
	kind: EventKind,
	source: &'static str,
	created_at: i64,
	text: Option<&'static str>,
) -> MissionEvent<'static> {
	MissionEvent { id, kind, source, created_at, text, link: None }
}

const NOTE_TEXT: &str =
	"Read the Rust contract and mirrored every kind and every state before touching a pixel.";
const ASKED_TEXT: &str = "Which field of the payload names the ticket this mission answers?";

const MISSION_EVENTS: [MissionEvent; 8] = [
	event("event-opened", EventKind::Opened, "bot", minutes_before(48), None),
	event("event-note", EventKind::Note, "bot", minutes_before(41), Some(NOTE_TEXT)),
	event(
		"event-agent-asked",
		EventKind::AgentAsked,
		"agent-hook",
		minutes_before(33),
		Some(ASKED_TEXT),
	),
	event("event-answered", EventKind::Answered, "human", minutes_before(30), None),
	event(
		"event-escalated",
		EventKind::Escalated,
		"bot",
		minutes_before(12),
		Some("The payload carries no field this design can trust yet. Which one names the ticket?"),
	),
	event("event-ready", EventKind::Ready, "github", minutes_before(6), None),
	event("event-failed", EventKind::Failed, "github", minutes_before(4), None),
	event("event-closed", EventKind::Closed, "bot", minutes_before(1), None),
];

const AUTHORED_MISSION_EVENTS: [MissionEvent; 4] = [
	event("event-authored-note", EventKind::Note, "bot", minutes_before(24), Some(NOTE_TEXT)),
	event(
		"event-authored-agent-asked",
		EventKind::AgentAsked,
		"agent-hook",
		minutes_before(18),
		Some(ASKED_TEXT),
	),
	event(
		"event-authored-answered",
		EventKind::Answered,
		"human",
		minutes_before(11),
		Some("None of them yet. Read the ticket off the mission, not off the payload."),
	),
	event(
		"event-authored-escalated",
		EventKind::Escalated,
		"bot",
		minutes_before(3),
		Some(
			"The run needs a human to say whether the mirror file should be resolved here or on the other branch.",
		),
	),
];

const WORKING_MISSION_CARD: Mission = Mission {
	id: "mission-ope-31",
	bot: AUTHOR,
	objective: "Read every release of the packages this workspace depends on and report what changed.",
	ticket: Ticket {
		url: "https://jira.example/browse/PLAT-118",
		..ticket("jira", "PLAT-118", "Move the run history off the shared database")
	},
	tools: MISSION_CARD_TOOLS,
	state: MissionState::Working,
	is_working: true,
	timestamp: "4m",
	now: None,
	last_activity: Some(LAST_ACTIVITY),
	..BASE
};

const WAITING_MISSION_CARD: Mission = Mission {
	id: "mission-ope-30",
	bot: AUTHOR,
	objective: "Ship the mission thread and the card that summarises it in the conversation it came from.",
	ticket: MISSION_TICKET,
	tools: MISSION_CARD_TOOLS,
	state: MissionState::WaitingHuman,
	timestamp: "2d",
	now: None,
	..BASE
};

const CLOSED_MISSION_CARD: Mission = Mission {
	id: "mission-ope-25",
	bot: CLOSED_AUTHOR,
	objective: "Store a mission, its thread, its events and the commands over them.",
	ticket: Ticket {
		url: "https://linear.example/kiroshi/issue/OPE-25",
		..ticket("linear", "OPE-25", "Mission storage and its command surface")
	},
	tools: &["Superset"],
	state: MissionState::Done,
	is_closed: true,
	timestamp: "09:12",
	now: None,
	..BASE
};

const fn in_conversation(
	conversation: &'static str,
	mission: Mission<'static>,
) -> PanelMission<'static> {
	PanelMission { mission, conversation }
}

const SPACE_OPEN_MISSIONS: [PanelMission; 5] = [
	in_conversation("conversation-storage", WAITING_HUMAN_MISSION),
	in_conversation("conversation-roster", READY_MISSION),
	in_conversation("conversation-changelog", WORKING_MISSION),
	in_conversation("conversation-storage", WAITING_BOT_MISSION),
	in_conversation("conversation-shell", FAILED_MISSION),
];

const SPACE_EARLIER_TODAY_MISSIONS: [PanelMission; 4] = [
	in_conversation("conversation-roster", CLOSED_MISSION),
	in_conversation(
		"conversation-roster",
		Mission {
			id: "mission-digest",
			objective: "Send the morning digest",
			timestamp: "08:40",
			..CLOSED_MISSION
		},
	),
	in_conversation(
		"conversation-roster",
		Mission {
			id: "mission-rail",
			objective: "Draw the icon rail of the shell",
			timestamp: "08:05",
			bot: ADA,
			..CLOSED_MISSION
		},
	),
	in_conversation(
		"conversation-roster",
		Mission {
			id: "mission-release",
			objective: "Watch the release notes file",
			timestamp: "07:32",
			bot: IRIS,
			..CLOSED_MISSION
		},
	),
];

const UNBROKEN_OBJECTIVE: &str = "Follow every package this workspace depends on and open a mission for anything touching supercalifragilisticexpialidociousdesigntokensurface.";
const UNBROKEN_TARGET: &str =
	"packages/changelog/src/supercalifragilisticexpialidociousreleasenotesparserforeverypackage.ts";
const MANY_TOOLS: &[&str] = &[
	"Superset",
	"GitHub",
	"Terminal",
	"paper",
	"Web search",
	"Screenshot",
	"Repository",
	"Read",
	"Write",
];
const UNNAMED_BEFORE_NAMED_TOOLS: &[&str] = &["gh", "Terminal", "Web search", "GitHub"];
const OPENING_ANSWER: &str = "That one is wide enough to run on its own, so I opened a mission for it and I will report here when it lands.";
const LONG_HEADER_OBJECTIVE: &str = "Rework the mission thread so a reader can follow a run that spans several days without ever losing the ticket it answers";
const LONG_TICKET_TITLE: &str = "Rework the mission thread so a reader can follow a run that spans several days without losing the ticket it answers";
const LONG_HEADER_TOOLS: &[&str] =
	&["Superset", "GitHub", "Terminal", "Repository read and write", "Screenshot"];
const A_VERY_LONG_BOT_NAME: &str = "Anastasia Konstantinopoulou-Whitfield of the Changelog Parsers";

fn emit() -> Emit<SceneState> {
	Rc::new(|_: &mut SceneState, _| {})
}

fn padded(t: &Tokens, content: El) -> El {
	padded_with(t, content, Vec::new())
}

fn padded_with(t: &Tokens, content: El, layers: Vec<El>) -> El {
	rune_kit::root(
		col().w_full().h_full().padding(PADDED).fill(t.card).items_start().child(content),
		layers,
	)
}

fn stage(t: &Tokens, content: El) -> El {
	rune_kit::root(
		row().w_full().h_full().fill(t.card).center().child(col().child(content)),
		Vec::new(),
	)
}

fn card_of(state: MissionState) -> Mission<'static> {
	Mission { state, ..WAITING_MISSION_CARD }
}

fn card(t: &Tokens, mission: Mission) -> El {
	mission_card(t, EN, &mission, &emit())
}

fn row_panel(t: &Tokens, rows: impl IntoIterator<Item = El>) -> El {
	col().w(ROW_PANEL).gap(SPACING * 0.5).fill(t.sidebar).role("list").children(rows)
}

fn mission_row_of(t: &Tokens, mission: Mission) -> El {
	mission_row(t, EN, &mission, false, &emit(), None)
}

fn rows_scene(t: &Tokens, missions: impl IntoIterator<Item = Mission<'static>>) -> El {
	stage(t, row_panel(t, missions.into_iter().map(|mission| mission_row_of(t, mission))))
}

pub(super) fn state_pill_states(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		row()
			.gap(SPACING * 2.0)
			.center_y()
			.flex_wrap()
			.children(MissionState::ALL.into_iter().filter_map(|state| state_pill(t, EN, state))),
	)
}

pub(super) fn marks_default(t: &Tokens, _: &SceneState) -> El {
	let tools = MISSION_CARD_TOOLS.iter().copied().chain(["Terminal"]);
	padded(
		t,
		col()
			.w(NARROW)
			.gap(SPACING * 2.0)
			.child(ticket_line(t, MISSION_TICKET, TicketLayout::Wrap, LinkStyle::Plain, &emit()))
			.child(
				row()
					.gap(SPACING * 2.0)
					.center_y()
					.children(tools.map(|tool| tool_mark(t, tool, SPACING * 4.0))),
			),
	)
}

pub(super) fn marks_as_line(t: &Tokens, _: &SceneState) -> El {
	padded(
		t,
		row().w(SQUEEZED).child(ticket_line(
			t,
			MISSION_TICKET,
			TicketLayout::Line,
			LinkStyle::Plain,
			&emit(),
		)),
	)
}

pub(super) fn activity_line_default(t: &Tokens, _: &SceneState) -> El {
	padded(
		t,
		row().w(ACTIVITY_WIDTH).child(activity_line(
			t,
			EN,
			1,
			Some(MISSION_PULL_REQUEST),
			LinkStyle::Plain,
			&emit(),
		)),
	)
}

pub(super) fn card_waiting_human(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, WAITING_MISSION_CARD))
}

pub(super) fn card_working(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, WORKING_MISSION_CARD))
}

pub(super) fn card_waiting_bot(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		card(
			t,
			Mission { last_activity: Some(LAST_ACTIVITY), ..card_of(MissionState::WaitingBot) },
		),
	)
}

pub(super) fn card_ready_to_merge(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, card_of(MissionState::ReadyToMerge)))
}

pub(super) fn card_failed(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, card_of(MissionState::Failed)))
}

pub(super) fn card_done(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, CLOSED_MISSION_CARD))
}

pub(super) fn card_closed(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, Mission { state: MissionState::Closed, ..CLOSED_MISSION_CARD }))
}

pub(super) fn card_unrecognised(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, Mission { tools: &["Screenshot"], ..WORKING_MISSION_CARD }))
}

pub(super) fn card_identifier_without_title(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		card(t, Mission { ticket: Ticket { title: "", ..MISSION_TICKET }, ..WAITING_MISSION_CARD }),
	)
}

const UNTICKETED_MISSION_CARD: Mission =
	Mission { tools: &[], ticket: NO_TICKET, ..WORKING_MISSION_CARD };

pub(super) fn card_without_ticket(t: &Tokens, _: &SceneState) -> El {
	stage(t, card(t, UNTICKETED_MISSION_CARD))
}

pub(super) fn card_unlinkable(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		card(t, Mission { ticket: Ticket { url: "", ..MISSION_TICKET }, ..WAITING_MISSION_CARD }),
	)
}

pub(super) fn card_activity_line(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		card(
			t,
			Mission {
				commits_ahead: 3,
				pull_request: Some(MISSION_PULL_REQUEST),
				..WAITING_MISSION_CARD
			},
		),
	)
}

pub(super) fn card_long_content(t: &Tokens, _: &SceneState) -> El {
	let mission = Mission {
		objective: UNBROKEN_OBJECTIVE,
		ticket: Ticket { external_id: "OPE-1042", title: LONG_TICKET_TITLE, ..MISSION_TICKET },
		is_working: true,
		last_activity: Some(ToolCall { tool: "Edit", target: UNBROKEN_TARGET }),
		..WAITING_MISSION_CARD
	};
	stage(t, col().w(SQUEEZED).child(card(t, mission)))
}

pub(super) fn card_with_status(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		card(t, Mission { status: Some(MISSION_STATUS), now: Some(NOW), ..WAITING_MISSION_CARD }),
	)
}

pub(super) fn card_long_status(t: &Tokens, _: &SceneState) -> El {
	let short = Mission {
		objective: "Ship the status line",
		last_activity: None,
		..UNTICKETED_MISSION_CARD
	};
	stage(
		t,
		col()
			.w(SQUEEZED)
			.gap(SPACING * 4.0)
			.items_start()
			.child(card(t, Mission { status: Some(LONG_MISSION_STATUS), now: Some(NOW), ..short }))
			.child(card(t, short)),
	)
}

const BARE: Mission =
	Mission { id: "mission-bare", tools: &[], timestamp: "", ..WAITING_BOT_MISSION };
const TIMED: Mission = Mission { id: "mission-timed", tools: &[], ..WAITING_BOT_MISSION };

pub(super) fn card_with_and_without_pill(t: &Tokens, _: &SceneState) -> El {
	let waiting_bot = card_of(MissionState::WaitingBot);
	stage(
		t,
		col()
			.w(COLUMN)
			.gap(SPACING * 4.0)
			.items_start()
			.child(card(t, card_of(MissionState::WaitingHuman)))
			.child(card(
				t,
				Mission { id: "mission-bare", tools: &[], timestamp: "", ..waiting_bot },
			))
			.child(card(t, Mission { id: "mission-timed", tools: &[], ..waiting_bot })),
	)
}

pub(super) fn row_working(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [WORKING_MISSION])
}

pub(super) fn row_working_with_many_tools(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { tools: MANY_TOOLS, ..WORKING_MISSION }])
}

pub(super) fn row_tool_glyph(t: &Tokens, _: &SceneState) -> El {
	rows_scene(
		t,
		[
			Mission {
				id: "mission-tool-glyph-0",
				tools: UNNAMED_BEFORE_NAMED_TOOLS,
				..WORKING_MISSION
			},
			Mission {
				id: "mission-tool-glyph-1",
				tools: MISSION_TOOLS_WITHOUT_A_MARK,
				..WORKING_MISSION
			},
		],
	)
}

pub(super) fn row_waiting_bot(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { last_activity: Some(LAST_ACTIVITY), ..WAITING_BOT_MISSION }])
}

pub(super) fn row_waiting_human(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [WAITING_HUMAN_MISSION])
}

pub(super) fn row_ready_to_merge(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [READY_MISSION])
}

pub(super) fn row_failed(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [FAILED_MISSION])
}

pub(super) fn row_done(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [CLOSED_MISSION])
}

pub(super) fn row_closed(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { state: MissionState::Closed, ..CLOSED_MISSION }])
}

const SEVEN_STATES: [MissionState; 7] = [
	MissionState::Working,
	MissionState::WaitingBot,
	MissionState::WaitingHuman,
	MissionState::ReadyToMerge,
	MissionState::Failed,
	MissionState::Done,
	MissionState::Closed,
];

pub(super) fn row_states(t: &Tokens, _: &SceneState) -> El {
	rows_scene(
		t,
		SEVEN_STATES.into_iter().flat_map(|state| {
			[true, false].map(|is_working| Mission { state, is_working, ..WORKING_MISSION })
		}),
	)
}

pub(super) fn row_parts_repeating_the_same_words(t: &Tokens, _: &SceneState) -> El {
	rows_scene(
		t,
		[Mission {
			ticket: Ticket { title: IRIS.name, ..WAITING_BOT_MISSION.ticket },
			..WAITING_BOT_MISSION
		}],
	)
}

pub(super) fn row_without_a_ticket(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [UNTICKETED_MISSION])
}

pub(super) fn row_activity_line(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { pull_request: Some(MISSION_PULL_REQUEST), ..COMMITS_AHEAD_MISSION }])
}

pub(super) fn row_long_content(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { objective: UNBROKEN_OBJECTIVE, ..WORKING_MISSION }])
}

pub(super) fn row_with_status(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { status: Some(MISSION_STATUS), ..WAITING_HUMAN_MISSION }])
}

pub(super) fn row_long_status(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [Mission { status: Some(LONG_MISSION_STATUS), ..WAITING_HUMAN_MISSION }])
}

pub(super) fn row_with_and_without_pill(t: &Tokens, _: &SceneState) -> El {
	rows_scene(t, [WAITING_HUMAN_MISSION, BARE, TIMED])
}

fn turn(t: &Tokens, mission: Mission) -> El {
	mission_turn(t, EN, &mission, &emit())
}

fn turns(t: &Tokens, missions: impl IntoIterator<Item = Mission<'static>>) -> El {
	padded(
		t,
		col().w_full().gap(TURN_GAP).children(missions.into_iter().map(|mission| turn(t, mission))),
	)
}

pub(super) fn turn_working(t: &Tokens, _: &SceneState) -> El {
	turns(t, [WORKING_MISSION_CARD])
}

pub(super) fn turn_states(t: &Tokens, _: &SceneState) -> El {
	turns(
		t,
		SEVEN_STATES.into_iter().flat_map(|state| {
			[true, false].map(|is_working| Mission { state, is_working, ..WAITING_MISSION_CARD })
		}),
	)
}

pub(super) fn turn_waiting_for_the_reader(t: &Tokens, _: &SceneState) -> El {
	turns(t, [WAITING_MISSION_CARD])
}

pub(super) fn turn_ready_to_merge(t: &Tokens, _: &SceneState) -> El {
	turns(
		t,
		[Mission {
			id: "mission-ope-29",
			state: MissionState::ReadyToMerge,
			..WAITING_MISSION_CARD
		}],
	)
}

pub(super) fn turn_failed(t: &Tokens, _: &SceneState) -> El {
	turns(
		t,
		[Mission { id: "mission-ope-17", state: MissionState::Failed, ..WAITING_MISSION_CARD }],
	)
}

pub(super) fn turn_done(t: &Tokens, _: &SceneState) -> El {
	turns(t, [CLOSED_MISSION_CARD])
}

pub(super) fn turn_long_objective(t: &Tokens, _: &SceneState) -> El {
	let mission = Mission {
		id: "mission-ope-64",
		objective: "Move every run history table off the shared database and into the per space store without losing a single reported run. Keep the old tables readable until the last host has migrated, then drop them in one release. Start from apps/app/src/lib/missions/mission-run-history-reconciliation-ledger.ts.",
		..WAITING_MISSION_CARD
	};
	padded(t, col().w(NARROW).child(turn(t, mission)))
}

pub(super) fn turn_without_tools(t: &Tokens, _: &SceneState) -> El {
	turns(t, [Mission { id: "mission-ope-22", tools: &[], ..WAITING_MISSION_CARD }])
}

pub(super) fn turn_working_without_tools(t: &Tokens, _: &SceneState) -> El {
	turns(t, [Mission { id: "mission-ope-42", tools: &[], ..WORKING_MISSION_CARD }])
}

fn opening_turn(t: &Tokens) -> El {
	let still = Face::still(AUTHOR.name, AUTHOR.hue).draw(SPACING * 5.0, t);
	turn_lane(
		soft_bubble(
			t,
			text(OPENING_ANSWER.to_owned()).font(TEXT_BUBBLE).color(t.bubble_foreground).wrap(),
		)
		.child(author_line(t, AUTHOR, still)),
	)
}

pub(super) fn turn_under_an_opening_turn(t: &Tokens, _: &SceneState) -> El {
	padded(
		t,
		col()
			.w_full()
			.gap(TURN_GAP)
			.items_start()
			.child(opening_turn(t))
			.child(turn(t, WAITING_MISSION_CARD)),
	)
}

pub(super) fn turn_with_an_unknown_tool(t: &Tokens, _: &SceneState) -> El {
	turns(t, [Mission { id: "mission-ope-51", tools: &["Screenshot"], ..WAITING_MISSION_CARD }])
}

const WORKING_HEADER: Header = Header {
	bot: ADA,
	objective: MISSION_OBJECTIVE,
	ticket: MISSION_TICKET,
	tools: MISSION_TOOLS,
	state: MissionState::Working,
	is_working: true,
	clock_ms: CLOCK_MS,
	opened_at: MISSION_OPENED_AT,
	now: NOW,
	status: None,
	commits_ahead: 0,
	pull_request: None,
};

fn header(t: &Tokens, header: Header) -> El {
	mission_header(t, EN, &header, &emit())
}

fn headers(t: &Tokens, width: f32, shown: impl IntoIterator<Item = El>) -> El {
	padded(t, col().w(width).gap(SPACING * 4.0).children(shown))
}

pub(super) fn header_default(t: &Tokens, _: &SceneState) -> El {
	headers(t, HEADER_WIDTH, [header(t, WORKING_HEADER)])
}

pub(super) fn header_loading(t: &Tokens, _: &SceneState) -> El {
	headers(t, HEADER_WIDTH, [mission_header_skeleton(t, EN, &emit()), header(t, WORKING_HEADER)])
}

pub(super) fn header_states(t: &Tokens, _: &SceneState) -> El {
	headers(
		t,
		HEADER_WIDTH,
		SEVEN_STATES.into_iter().map(|state| {
			col().w_full().gap(SPACING * 2.0).children(
				[true, false]
					.map(|is_working| header(t, Header { state, is_working, ..WORKING_HEADER })),
			)
		}),
	)
}

pub(super) fn header_without_a_pill(t: &Tokens, _: &SceneState) -> El {
	headers(
		t,
		HEADER_WIDTH,
		[
			header(t, WORKING_HEADER),
			header(
				t,
				Header { state: MissionState::WaitingHuman, is_working: false, ..WORKING_HEADER },
			),
		],
	)
}

pub(super) fn header_empty(t: &Tokens, _: &SceneState) -> El {
	headers(
		t,
		HEADER_WIDTH,
		[header(
			t,
			Header { ticket: Ticket { platform: "linear", ..NO_TICKET }, ..WORKING_HEADER },
		)],
	)
}

pub(super) fn header_without_a_tool(t: &Tokens, _: &SceneState) -> El {
	headers(t, HEADER_WIDTH, [header(t, Header { tools: &[], ..WORKING_HEADER })])
}

pub(super) fn header_long_content(t: &Tokens, _: &SceneState) -> El {
	let long = Header {
		bot: bot(ADA.id, "Anastasia Konstantinopoulou-Whitfield"),
		objective: LONG_HEADER_OBJECTIVE,
		ticket: Ticket { external_id: "OPE-1042", title: LONG_TICKET_TITLE, ..MISSION_TICKET },
		tools: LONG_HEADER_TOOLS,
		state: MissionState::WaitingHuman,
		..WORKING_HEADER
	};
	headers(t, NARROW, [header(t, long)])
}

pub(super) fn header_with_status(t: &Tokens, _: &SceneState) -> El {
	headers(t, HEADER_WIDTH, [header(t, Header { status: Some(MISSION_STATUS), ..WORKING_HEADER })])
}

pub(super) fn header_long_status(t: &Tokens, _: &SceneState) -> El {
	headers(t, NARROW, [header(t, Header { status: Some(LONG_MISSION_STATUS), ..WORKING_HEADER })])
}

pub(super) fn header_with_pull_request(t: &Tokens, _: &SceneState) -> El {
	headers(
		t,
		SQUEEZED,
		[header(
			t,
			Header { commits_ahead: 3, pull_request: Some(MISSION_PULL_REQUEST), ..WORKING_HEADER },
		)],
	)
}

pub(super) fn header_pull_request_only(t: &Tokens, _: &SceneState) -> El {
	headers(
		t,
		HEADER_WIDTH,
		[header(t, Header { pull_request: Some(MISSION_PULL_REQUEST), ..WORKING_HEADER })],
	)
}

const AGENT_QUESTION: MissionEvent = event(
	"event-agent-question",
	EventKind::AgentAsked,
	"agent-hook",
	NOW - 600_000,
	Some("Which branch should the mirror file be resolved on?"),
);

const GITHUB_NOTE: MissionEvent = event(
	"event-github-note",
	EventKind::Note,
	"github",
	NOW - 900_000,
	Some("Opened the pull request against the branch the mission was handed."),
);

const PULL_REQUEST_EVENT: MissionEvent = MissionEvent {
	link: Some(EventLink {
		url: MISSION_PULL_REQUEST.url,
		pull_request: Some(MISSION_PULL_REQUEST.number),
	}),
	..event("event-pull-request", EventKind::Ready, "github", NOW - 300_000, None)
};

const HUMAN_ANSWER: MissionEvent = event(
	"event-human-answer",
	EventKind::Answered,
	"human",
	NOW - 300_000,
	Some("Resolve it here, the other branch is already merged."),
);

fn event_of(t: &Tokens, shown: MissionEvent, tools: &[&str], by: Option<Bot>) -> El {
	event_row(t, EN, &shown, tools, by, NOW, &emit())
}

fn events(t: &Tokens, width: f32, gap: f32, shown: impl IntoIterator<Item = El>) -> El {
	padded(t, col().w(width).gap(gap).children(shown))
}

fn one_event(t: &Tokens, shown: MissionEvent) -> El {
	events(t, HEADER_WIDTH, 0.0, [event_of(t, shown, MISSION_TOOLS, Some(ADA))])
}

pub(super) fn event_machine_line(t: &Tokens, _: &SceneState) -> El {
	one_event(t, MISSION_EVENTS[0])
}

pub(super) fn event_with_pull_request_link(t: &Tokens, _: &SceneState) -> El {
	one_event(t, PULL_REQUEST_EVENT)
}

pub(super) fn event_with_an_unnumbered_link(t: &Tokens, _: &SceneState) -> El {
	one_event(
		t,
		MissionEvent {
			link: Some(EventLink { url: MISSION_PULL_REQUEST.url, pull_request: None }),
			..PULL_REQUEST_EVENT
		},
	)
}

pub(super) fn event_authored(t: &Tokens, _: &SceneState) -> El {
	one_event(t, MISSION_EVENTS[1])
}

pub(super) fn event_from_the_agent(t: &Tokens, _: &SceneState) -> El {
	one_event(t, AGENT_QUESTION)
}

pub(super) fn event_from_the_agent_without_a_tool(t: &Tokens, _: &SceneState) -> El {
	events(
		t,
		HEADER_WIDTH,
		0.0,
		[event_of(t, AGENT_QUESTION, MISSION_TOOLS_WITHOUT_A_MARK, Some(ADA))],
	)
}

pub(super) fn event_from_github(t: &Tokens, _: &SceneState) -> El {
	one_event(t, GITHUB_NOTE)
}

pub(super) fn event_from_the_reader(t: &Tokens, _: &SceneState) -> El {
	one_event(t, HUMAN_ANSWER)
}

pub(super) fn event_closed_by_you(t: &Tokens, _: &SceneState) -> El {
	one_event(t, event("event-closed-by-you", EventKind::Dismissed, "person", NOW - 60_000, None))
}

pub(super) fn event_kinds(t: &Tokens, _: &SceneState) -> El {
	let count = EventKind::ALL.len() as i64;
	events(
		t,
		HEADER_WIDTH,
		SPACING * 3.0,
		EventKind::ALL.into_iter().enumerate().map(|(rank, kind)| {
			let lead = count - rank as i64;
			let said = format!("What the mission recorded when it was {}.", kind.word());
			col()
				.w_full()
				.gap(SPACING * 2.0)
				.child(event_of(
					t,
					event("", kind, "bot", NOW - lead * 60_000, None),
					MISSION_TOOLS,
					Some(ADA),
				))
				.child(event_row(
					t,
					EN,
					&MissionEvent {
						id: "",
						kind,
						source: "bot",
						created_at: NOW - lead * 30_000,
						text: Some(&said),
						link: None,
					},
					MISSION_TOOLS,
					Some(ADA),
					NOW,
					&emit(),
				))
		}),
	)
}

pub(super) fn event_authored_events(t: &Tokens, _: &SceneState) -> El {
	events(
		t,
		HEADER_WIDTH,
		SPACING * 2.0,
		AUTHORED_MISSION_EVENTS.map(|shown| event_of(t, shown, MISSION_TOOLS, Some(ADA))),
	)
}

pub(super) fn event_without_a_bot(t: &Tokens, _: &SceneState) -> El {
	events(t, HEADER_WIDTH, 0.0, [event_of(t, MISSION_EVENTS[1], MISSION_TOOLS, None)])
}

pub(super) fn event_in_a_mission_thread(t: &Tokens, _: &SceneState) -> El {
	let thread_header =
		Header { state: MissionState::WaitingHuman, is_working: false, ..WORKING_HEADER };
	events(
		t,
		NARROW,
		SPACING * 2.0,
		std::iter::once(header(t, thread_header))
			.chain(MISSION_EVENTS.map(|shown| event_of(t, shown, MISSION_TOOLS, Some(ADA)))),
	)
}

pub(super) fn event_long_content(t: &Tokens, _: &SceneState) -> El {
	events(
		t,
		SQUEEZED,
		0.0,
		[event_of(
			t,
			event("event-long-line", EventKind::Note, "bot", NOW - 60_000, None),
			MISSION_TOOLS,
			Some(bot(ADA.id, A_VERY_LONG_BOT_NAME)),
		)],
	)
}

const MENU_WIDTH: f32 = SPACING * 144.0;

fn menu_card(state: MissionState) -> Mission<'static> {
	Mission {
		state,
		is_working: state == MissionState::Working,
		is_closed: matches!(
			state,
			MissionState::Done | MissionState::Failed | MissionState::Closed
		),
		..WAITING_MISSION_CARD
	}
}

fn densities(t: &Tokens, state: MissionState) -> El {
	let mission = menu_card(state);
	col()
		.w(MENU_WIDTH)
		.gap(SPACING * 6.0)
		.child(row_panel(t, [mission_row_of(t, Mission { id: "menu-row", ..mission })]))
		.child(card(t, mission))
}

fn at_the_row(menu: El) -> El {
	menu.anchored("mission-row-menu-row", Side::Bottom, Align::Start, MENU_POINTER_DROP)
}

fn menu_scene(t: &Tokens, facts: MenuFacts) -> El {
	padded_with(t, densities(t, facts.state), vec![at_the_row(mission_menu(t, EN, facts, false))])
}

const fn facts(state: MissionState, has_pull_request: bool) -> MenuFacts {
	MenuFacts { state, has_pull_request, has_branch: true, has_workspace_path: true }
}

pub(super) fn menu_working(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Working, true))
}

pub(super) fn menu_working_without_a_pull_request(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Working, false))
}

pub(super) fn menu_waiting_on_the_companion(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::WaitingBot, true))
}

pub(super) fn menu_waiting_on_the_person(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::WaitingHuman, true))
}

pub(super) fn menu_ready_to_merge(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::ReadyToMerge, true))
}

pub(super) fn menu_failed(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Failed, true))
}

pub(super) fn menu_done(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Done, true))
}

pub(super) fn menu_closed(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Closed, true))
}

pub(super) fn menu_done_without_a_pull_request(t: &Tokens, _: &SceneState) -> El {
	menu_scene(t, facts(MissionState::Done, false))
}

fn copy_scene(t: &Tokens, facts: MenuFacts) -> El {
	let copy = chat::missions::menu::COPY.text(EN);
	padded_with(
		t,
		densities(t, facts.state),
		vec![
			at_the_row(mission_menu(t, EN, facts, true)),
			mission_copy_menu(t, EN, facts).anchored(
				format!("menu-item-{copy}"),
				Side::Right,
				Align::Start,
				0.0,
			),
		],
	)
}

pub(super) fn menu_copy_choices(t: &Tokens, _: &SceneState) -> El {
	copy_scene(
		t,
		MenuFacts {
			state: MissionState::Working,
			has_pull_request: false,
			has_branch: false,
			has_workspace_path: false,
		},
	)
}

pub(super) fn menu_every_copy_choice(t: &Tokens, _: &SceneState) -> El {
	copy_scene(t, facts(MissionState::Working, true))
}

const PANEL_HEIGHT: f32 = PANEL.1;

fn in_panel(t: &Tokens, body: El, layers: Vec<El>) -> El {
	rune_kit::root(row().w_full().h_full().fill(t.card).child(panel_frame(t, body)), layers)
}

fn panel_scene(t: &Tokens, panel: Panel) -> El {
	in_panel(t, missions_panel(t, EN, &panel, &emit()), Vec::new())
}

const DEFAULT_PANEL: Panel = Panel {
	open: &SPACE_OPEN_MISSIONS,
	earlier_today: &SPACE_EARLIER_TODAY_MISSIONS,
	open_mission: None,
	is_earlier_today_open: false,
	list_end: ListEnd::Complete,
};

pub(super) fn panel_default(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, DEFAULT_PANEL)
}

pub(super) fn panel_empty(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { open: &[], earlier_today: &[], ..DEFAULT_PANEL })
}

pub(super) fn panel_loading(t: &Tokens, _: &SceneState) -> El {
	let inner = PANEL_HEIGHT - SPACING * 6.0;
	in_panel(t, missions_feed_skeleton(t, inner), Vec::new())
}

pub(super) fn panel_one_group(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { open: &SPACE_OPEN_MISSIONS[..2], earlier_today: &[], ..DEFAULT_PANEL })
}

pub(super) fn panel_earlier_today_unfolded(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { is_earlier_today_open: true, ..DEFAULT_PANEL })
}

pub(super) fn panel_selected_row(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { open_mission: Some(WORKING_MISSION.id), ..DEFAULT_PANEL })
}

pub(super) fn panel_row_menu(t: &Tokens, _: &SceneState) -> El {
	let menu = mission_menu(
		t,
		EN,
		MenuFacts {
			state: MissionState::WaitingHuman,
			has_pull_request: false,
			has_branch: false,
			has_workspace_path: false,
		},
		false,
	)
	.anchored(
		format!("mission-row-{}", WAITING_HUMAN_MISSION.id),
		Side::Bottom,
		Align::Start,
		MENU_POINTER_DROP,
	);
	in_panel(t, missions_panel(t, EN, &DEFAULT_PANEL, &emit()), vec![menu])
}

pub(super) fn panel_reading_more(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { earlier_today: &[], list_end: ListEnd::ReadingMore, ..DEFAULT_PANEL })
}

pub(super) fn panel_complete(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { earlier_today: &[], list_end: ListEnd::Complete, ..DEFAULT_PANEL })
}

pub(super) fn panel_idle(t: &Tokens, _: &SceneState) -> El {
	panel_scene(t, Panel { earlier_today: &[], list_end: ListEnd::Idle, ..DEFAULT_PANEL })
}

const COMPOSER_SEAM: f32 = SPACING * 24.0;

pub(super) fn detail_skeleton(t: &Tokens, _: &SceneState) -> El {
	let thread_header =
		Header { state: MissionState::WaitingHuman, is_working: false, ..WORKING_HEADER };
	let shown = header(t, thread_header);
	let header_height = SPACING * 12.0 + SPACING * 8.5 + 2.0;
	let room = FULL.1 - header_height - COMPOSER_SEAM;
	rune_kit::root(
		col()
			.w_full()
			.h_full()
			.fill(t.card)
			.child(shown)
			.child(mission_detail_skeleton(t, room))
			.child(
				col()
					.w_full()
					.h(COMPOSER_SEAM)
					.px(SPACING * 6.0)
					.pb(SPACING * 4.0)
					.justify_end()
					.child(not_drawn(t, "Composer", "s06_composer: PromptInput")),
			),
		Vec::new(),
	)
}

pub(super) fn feed_skeleton(t: &Tokens, _: &SceneState) -> El {
	rune_kit::root(
		row().w_full().h_full().fill(t.card).child(
			col()
				.w(PANEL_WIDTH)
				.h_full()
				.px(SPACING * 2.0)
				.fill(t.sidebar)
				.child(missions_feed_skeleton(t, FULL.1)),
		),
		Vec::new(),
	)
}
