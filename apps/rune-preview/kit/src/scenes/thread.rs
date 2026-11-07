use std::rc::Rc;

use rune::{El, col, row};

use super::{SceneState, stage};
use crate::hues::Preset;
use crate::icons;
use crate::strings::Language;
use crate::surfaces::s05_thread::{
	Agent, Attachment, Author, Body, Context, Emit, EventSource, MissionEvent, MissionEventKind,
	MissionLink, PinnedMessage, Quote, Row, SelectionToolbar, Surface, Thread, ThreadKind,
	ToolbarAction, Transcript, Turn, TurnState, WorkLine, WorkState, WorkingAgent, body, column,
	day_separator, mission_event, pinned_messages, selection_toolbar, thread, transcript_skeleton,
	turn, work_line,
};
use crate::tokens::{SPACING, Tokens};

mod sources;

use sources::*;

pub(super) const PROSE: (f32, f32) = (760.0, 480.0);
pub(super) const TALL: (f32, f32) = (760.0, 960.0);
pub(super) const TALLER: (f32, f32) = (760.0, 1200.0);
pub(super) const PANEL: (f32, f32) = (1072.0, 847.0);
pub(super) const LINE: (f32, f32) = (760.0, 240.0);

const PROSE_WIDTH: f32 = 704.0;
const MISSION_WIDTH: f32 = 640.0;

fn agent(id: &str, name: &str, hue: Preset, badge: Option<&str>) -> Agent {
	Agent {
		id: id.to_owned(),
		name: name.to_owned(),
		hue: Some(hue.hue()),
		badge: badge.map(str::to_owned),
	}
}

fn atlas() -> Agent {
	agent("atlas", "Atlas", Preset::Blue, Some("Planner"))
}

fn pico() -> Agent {
	agent("pico", "Pico", Preset::Orange, Some("Builder"))
}

fn juniper() -> Agent {
	agent("juniper", "Juniper", Preset::Green, Some("Writer"))
}

fn roster() -> Vec<Agent> {
	vec![atlas(), pico(), juniper(), agent("bot-atlas", "Atlas", Preset::Blue, None)]
}

fn with_cx(t: &Tokens, s: &SceneState, view: impl FnOnce(&Context<SceneState>) -> El) -> El {
	let roster = roster();
	let emit: Emit<SceneState> = Rc::new(|_, _| {});
	let cx = Context { t, math: &s.math, language: Language::En, roster: &roster, emit: &emit };
	view(&cx)
}

fn padded(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.background).padding(SPACING * 4.0).child(content),
		Vec::new(),
	)
}

fn bare(id: &str, author: Author, source: &str) -> Turn {
	Turn { shows_author: false, ..Turn::new(id, author, source) }
}

#[derive(Clone, Copy)]
enum Frame {
	Prose,
	Agent,
	Own,
	Both,
	Twice,
	Turns,
	AgentTurn,
	OwnTurn,
}

fn markdown_scene(t: &Tokens, s: &SceneState, source: &str, frame: Frame) -> El {
	with_cx(t, s, |cx| {
		let prose = || {
			col().w(PROSE_WIDTH).child(body(
				cx,
				&Body { turn: "story", source, surface: Surface::Agent, streaming: false },
			))
		};
		let agent_turn = |author: bool| {
			let shown = Turn {
				shows_author: author,
				..Turn::new("agent", Author::Agent(atlas()), source).at("09:41")
			};
			col().w(PROSE_WIDTH).child(turn(cx, &shown))
		};
		let own_turn = |author: bool| {
			let shown =
				Turn { shows_author: author, ..Turn::new("own", Author::You, source).at("09:40") };
			col().w(PROSE_WIDTH).child(turn(cx, &shown))
		};
		let content = match frame {
			Frame::Prose => prose(),
			Frame::Agent => agent_turn(false),
			Frame::Own => own_turn(false),
			Frame::Both => col().gap(SPACING * 6.0).child(agent_turn(false)).child(own_turn(false)),
			Frame::Twice => col().gap(SPACING * 6.0).child(prose()).child(prose()),
			Frame::Turns => col().gap(SPACING * 6.0).child(own_turn(true)).child(agent_turn(true)),
			Frame::AgentTurn => agent_turn(true),
			Frame::OwnTurn => own_turn(true),
		};
		padded(t, content)
	})
}

macro_rules! prose_scenes {
	($($name:ident = $source:expr, $frame:ident;)*) => {
		$(pub(super) fn $name(t: &Tokens, s: &SceneState) -> El {
			markdown_scene(t, s, &$source, Frame::$frame)
		})*
	};
}

const INLINE_CODE: &str =
	"Call `readNest(id)` before `summarise(id)`, never the other way around.\n";
const TABLE_DEFAULT: &str = "| nest | occupants | status | archived |\n| --- | --- | --- | --- |\n| nest_42 | 3 | active | no |\n| nest_43 | 0 | empty | yes |\n| nest_44 | 12 | active | no |\n";
const TABLE_HEADER_ONLY: &str =
	"| nest | occupants | status | archived |\n| --- | --- | --- | --- |\n";
const LINK_DEFAULT: &str =
	"Read [the sync report](https://docs.example.com/reports/nest-42) before the review.\n";
const LINK_DECEPTIVE: &str =
	"Read [docs.example.com](https://docs.example.com@attacker.test/reports) before the review.\n";
const LINK_UNSAFE: &str = "Read [looks like a link](javascript:alert('nest')) before the review.\n";
const LINK_FRAGMENT: &str = "Read [the summary](#summary) before the review.\n";
const LINK_MAIL: &str = "Read [write to the nest](mailto:nest@example.com) before the review.\n";
const LINK_LONG: &str = "Read [https://docs.example.com/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a](https://docs.example.com/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp&cursor=eyJvZmZzZXQiOjEyMCwibGltaXQiOjQwfQ&signature=9f2c1ad4e7b8c05a) before the review.\n";
const SPAN_MENTION: &str = "Ask <@bot-atlas> about the failing migration.\n";
const SNIPPET_SINGLE: &str = "```bash\nbun run storybook\n```\n";

fn fenced(language: &str, source: &str) -> String {
	format!("```{language}\n{source}\n```\n")
}

pub(super) fn code_beyond_highlight_budget(t: &Tokens, s: &SceneState) -> El {
	markdown_scene(t, s, &fenced("typescript", FENCE_LONG_SOURCE), Frame::Prose)
}

pub(super) fn code_block_patch(t: &Tokens, s: &SceneState) -> El {
	markdown_scene(t, s, &fenced("diff", BLOCK_MULTI_FILE_PATCH), Frame::Prose)
}

pub(super) fn span_plain_text(t: &Tokens, s: &SceneState) -> El {
	markdown_scene(t, s, &format!("Ask about {SPAN_PLAIN_TEXT}.\n"), Frame::Agent)
}

prose_scenes! {
	markdown_default = FULL, Prose;
	markdown_headings = HEADINGS, Prose;
	markdown_emphasis = EMPHASIS, Prose;
	markdown_lists = LISTS, Prose;
	markdown_nested_list = NESTED_LIST, Prose;
	markdown_task_list = TASK_LIST, Prose;
	markdown_blockquote = BLOCKQUOTE, Prose;
	markdown_table_in_blockquote = TABLE_IN_BLOCKQUOTE, Prose;
	markdown_table = TABLE, Prose;
	markdown_table_wide = WIDE_TABLE, Prose;
	markdown_table_narrow = NARROW_TABLE, Prose;
	markdown_table_copy = AWKWARD_TABLE, Prose;
	markdown_table_in_bubble = WIDE_TABLE, Agent;
	markdown_code_fence = CODE, Prose;
	markdown_code_fence_rust = CODE_RUST, Prose;
	markdown_code_fence_python = CODE_PYTHON, Prose;
	markdown_code_fence_css = CODE_CSS, Prose;
	markdown_code_fence_html = CODE_HTML, Prose;
	markdown_code_fence_yaml = CODE_YAML, Prose;
	markdown_code_fence_markdown = CODE_MARKDOWN, Prose;
	markdown_code_fence_unknown_language = CODE_UNKNOWN, Prose;
	markdown_code_fence_overflow = CODE_LONG_LINE, Agent;
	markdown_code_fence_copy = CODE_COPY, Prose;
	markdown_code_fence_long_source = CODE_LONG_SOURCE, Prose;
	markdown_math_inline = INLINE_MATH, Prose;
	markdown_math_display = DISPLAY_MATH, Prose;
	markdown_math_malformed = MALFORMED_MATH, Prose;
	markdown_math_oversized = OVERSIZED_MATH, Prose;
	markdown_mermaid_flowchart = MERMAID_FLOWCHART, Prose;
	markdown_mermaid_malformed = MALFORMED_MERMAID, Prose;
	markdown_mermaid_in_bubble = MERMAID_WIDE, Agent;
	markdown_thematic_break = THEMATIC_BREAK, Prose;
	markdown_footnotes = FOOTNOTES, Prose;
	markdown_footnotes_twice = FOOTNOTES, Twice;
	markdown_autolinks = AUTOLINKS, Prose;
	markdown_destinations = DESTINATIONS, Prose;
	markdown_destinations_fetch_nothing = MANY_HOSTS, Both;
	markdown_deceptive_links = DECEPTIVE_LINKS, Prose;
	markdown_inert_schemes = INERT_SCHEMES, Prose;
	markdown_long_url = LONG_URL, Agent;
	markdown_fragment_link = FRAGMENT_LINK, Prose;
	markdown_raw_html = RAW_HTML, Prose;
	markdown_raw_html_in_list = RAW_HTML_IN_LIST, Prose;
	markdown_hostile_markup = HOSTILE, Prose;
	markdown_malformed = MALFORMED, Prose;
	markdown_in_message_bubble = FULL, Agent;
	markdown_in_solid_bubble = USER_BLOCK, Own;
	markdown_adjacent_blocks = ADJACENT_BLOCKS, Turns;
	markdown_nested_blocks = NESTED_BLOCKS, AgentTurn;
	markdown_preserved_whitespace = PRESERVED_WHITESPACE, OwnTurn;
	markdown_typeset_in_bubble = TYPESET_BUBBLE, Agent;
	markdown_attachment_image_mid_answer = IMAGE_CITED_MID_ANSWER, Prose;
	markdown_attachment_file_mid_answer = FILE_CITED_MID_ANSWER, Prose;
	markdown_attachment_file_among_code_paths = FILE_CITED_AMONG_CODE_PATHS, Prose;
	markdown_attachment_path_with_spaces = PATHS_WITH_SPACES, Prose;
	markdown_board_link_alone = BOARD_ALONE, Prose;
	markdown_board_link_in_sentence = BOARD_IN_SENTENCE, Prose;
	markdown_board_link_in_checklist = BOARD_IN_CHECKLIST, Prose;
	markdown_board_link_in_list_sentence = BOARD_IN_LIST_SENTENCE, Prose;
	markdown_board_link_in_table_cell = BOARD_IN_TABLE_CELL, Prose;
	mermaid_default = fenced("mermaid", MERMAID_FLOWCHART_SOURCE), Prose;
	mermaid_wider_than_the_block = fenced("mermaid", MERMAID_WIDE_SOURCE), Prose;
	mermaid_unparseable = fenced("mermaid", MERMAID_MALFORMED_SOURCE), Prose;
	math_default = format!("$$\n{MATH_DISPLAY_SOURCE}\n$$\n"), Prose;
	math_inline = format!("The sync covered ${MATH_INLINE_SOURCE}$ nests, one of them empty.\n"), Prose;
	math_unparseable = format!("$$\n{MATH_MALFORMED_SOURCE}\n$$\n"), Prose;
	code_default = fenced("typescript", FENCE_TYPESCRIPT_SOURCE), Prose;
	code_unknown_language = fenced("nestscript", FENCE_UNKNOWN_LANGUAGE_SOURCE), Prose;
	code_inline_code = INLINE_CODE, Prose;
	table_default = TABLE_DEFAULT, Prose;
	table_wider_than_the_block = WIDE_TABLE, Prose;
	table_header_only = TABLE_HEADER_ONLY, Prose;
	link_default = LINK_DEFAULT, Prose;
	link_deceptive_text = LINK_DECEPTIVE, Prose;
	link_unsafe_url = LINK_UNSAFE, Prose;
	link_fragment = LINK_FRAGMENT, Prose;
	link_mail_to = LINK_MAIL, Prose;
	link_long_destination = LINK_LONG, Prose;
	span_bot_mention = SPAN_MENTION, Agent;
	tasks_default = TASKS_TASKS, Prose;
	tasks_loose_checklist = TASKS_LOOSE_TASKS, Prose;
	tasks_linked = TASKS_LINKED_TASKS, Prose;
	tasks_nested_checklist = TASKS_NESTED_TASKS, Prose;
	code_block_copy = SNIPPET_BASH, Prose;
	snippet_single_line = SNIPPET_SINGLE, Prose;
	snippet_overflow = fenced("bash", SNIPPET_LONG_LINE), Prose;
}

pub(super) fn skeleton(t: &Tokens, _: &SceneState) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.background).child(column(transcript_skeleton(t))),
		Vec::new(),
	)
}

#[derive(Clone, Copy, PartialEq)]
enum Format {
	Bold,
	Italic,
	Strikethrough,
	Code,
	Heading,
	List,
	Link,
}

pub(super) fn selection_toolbar_keyboard(t: &Tokens, _: &SceneState) -> El {
	let action = |glyph, label, on, event| Some(ToolbarAction { glyph, label, on, event });
	let bar = SelectionToolbar {
		label: "Format",
		items: vec![
			action(&icons::BOLD, "Bold", false, Format::Bold),
			action(&icons::ITALIC, "Italic", true, Format::Italic),
			action(&icons::STRIKETHROUGH, "Strikethrough", false, Format::Strikethrough),
			action(&icons::CODE, "Code", false, Format::Code),
			None,
			action(&icons::HEADING, "Heading", false, Format::Heading),
			action(&icons::LIST, "List", false, Format::List),
			None,
			action(&icons::LINK, "Link", true, Format::Link),
		],
	};
	let emit: Emit<SceneState, Format> = Rc::new(|_, _| {});
	stage(t, selection_toolbar(t, &bar, &emit))
}

fn pinned_fixture() -> Vec<PinnedMessage> {
	let message = |id: &str, author: Author, time: &str, excerpt: &str| PinnedMessage {
		id: id.to_owned(),
		author,
		time: time.to_owned(),
		excerpt: excerpt.to_owned(),
	};
	vec![
		message("p1", Author::Agent(atlas()), "09:20", "Yes, all 14 checks passed at 9:12."),
		message(
			"p2",
			Author::You,
			"09:25",
			"And the waitlist? Keep the split by country for the board brief.",
		),
		message(
			"p3",
			Author::Agent(pico()),
			"10:14",
			"Done. The table is on the pricing draft behind the preview flag, with Fieldnote at $18 and the three columns Lena asked for. Nothing is live yet, and the old page stays up until Friday so the links people saved keep working through the review.",
		),
	]
}

fn pinned_scene(t: &Tokens, s: &SceneState, pinned: Vec<PinnedMessage>, open: bool) -> El {
	with_cx(t, s, |cx| {
		padded(t, row().w_full().justify_end().child(pinned_messages(cx, &pinned, open)))
	})
}

pub(super) fn pinned_default(t: &Tokens, s: &SceneState) -> El {
	pinned_scene(t, s, pinned_fixture(), true)
}

pub(super) fn pinned_one(t: &Tokens, s: &SceneState) -> El {
	pinned_scene(t, s, pinned_fixture().into_iter().take(1).collect(), true)
}

pub(super) fn pinned_empty(t: &Tokens, s: &SceneState) -> El {
	pinned_scene(t, s, Vec::new(), true)
}

pub(super) fn pinned_overflowing(t: &Tokens, s: &SceneState) -> El {
	let many = (0..4).flat_map(|round| {
		pinned_fixture()
			.into_iter()
			.map(move |pinned| PinnedMessage { id: format!("{}-{round}", pinned.id), ..pinned })
	});
	pinned_scene(t, s, many.collect(), true)
}

pub(super) fn pinned_unpinning(t: &Tokens, s: &SceneState) -> El {
	pinned_scene(t, s, pinned_fixture().into_iter().skip(1).collect(), true)
}

fn worker(
	name: &str,
	hue: Preset,
	state: WorkState,
	label: Option<&str>,
	elapsed: Option<&str>,
) -> WorkingAgent {
	WorkingAgent {
		agent: agent(&format!("bot-{}", name.to_lowercase()), name, hue, None),
		state,
		label: label.map(str::to_owned),
		elapsed: elapsed.map(str::to_owned),
	}
}

const NOTION_UPDATE: &str = "mcp__Notion__update_page";

fn eight_agents() -> Vec<WorkingAgent> {
	vec![
		worker("Pico", Preset::Green, WorkState::Writing, None, Some("41s")),
		worker("Atlas", Preset::Blue, WorkState::Tool, Some(NOTION_UPDATE), Some("33s")),
		worker("Juniper", Preset::Purple, WorkState::Writing, None, Some("28s")),
		worker("Sable", Preset::Red, WorkState::Thinking, None, Some("9s")),
		worker("Orion", Preset::Orange, WorkState::Writing, None, Some("22s")),
		worker("Lyra", Preset::Cyan, WorkState::Tool, Some("Bash · bun test"), Some("17s")),
		worker("Vega", Preset::Pink, WorkState::Thinking, None, Some("4s")),
		worker("Nova", Preset::Yellow, WorkState::UpNext, None, None),
	]
}

fn work_scene(t: &Tokens, s: &SceneState, agents: Vec<WorkingAgent>, open: bool, width: f32) -> El {
	with_cx(t, s, |cx| {
		padded(
			t,
			col().w(width).child(work_line(cx, &WorkLine { id: "work".to_owned(), agents, open })),
		)
	})
}

const NARROW_COLUMN: f32 = 440.0;

pub(super) fn work_7(t: &Tokens, s: &SceneState) -> El {
	work_scene(
		t,
		s,
		vec![worker("Pico", Preset::Green, WorkState::Thinking, None, Some("4s"))],
		false,
		PROSE_WIDTH,
	)
}

pub(super) fn work_8(t: &Tokens, s: &SceneState) -> El {
	work_scene(
		t,
		s,
		vec![worker("Pico", Preset::Green, WorkState::Tool, Some(NOTION_UPDATE), Some("12s"))],
		false,
		PROSE_WIDTH,
	)
}

pub(super) fn work_9(t: &Tokens, s: &SceneState) -> El {
	work_scene(
		t,
		s,
		vec![worker("Pico", Preset::Green, WorkState::Writing, None, Some("18s"))],
		false,
		PROSE_WIDTH,
	)
}

pub(super) fn work_10(t: &Tokens, s: &SceneState) -> El {
	let agents = vec![
		worker("Pico", Preset::Green, WorkState::Tool, Some(NOTION_UPDATE), Some("12s")),
		worker("Atlas", Preset::Blue, WorkState::Thinking, None, Some("7s")),
	];
	work_scene(t, s, agents, false, PROSE_WIDTH)
}

pub(super) fn work_11(t: &Tokens, s: &SceneState) -> El {
	work_scene(t, s, eight_agents(), false, PROSE_WIDTH)
}

pub(super) fn work_12(t: &Tokens, s: &SceneState) -> El {
	let agents = vec![
		worker("Pico", Preset::Green, WorkState::UpNext, None, None),
		worker("Atlas", Preset::Blue, WorkState::Tool, Some(NOTION_UPDATE), Some("11s")),
		worker("Orion", Preset::Orange, WorkState::Writing, None, Some("18s")),
	];
	work_scene(t, s, agents, false, PROSE_WIDTH)
}

pub(super) fn work_13(t: &Tokens, s: &SceneState) -> El {
	let mut agents = eight_agents();
	agents[0].elapsed = Some("52s".to_owned());
	agents.push(worker("Juniper", Preset::Purple, WorkState::Waiting, None, None));
	agents.retain(|agent| !(agent.agent.name == "Juniper" && agent.state == WorkState::Writing));
	work_scene(t, s, agents, false, PROSE_WIDTH)
}

pub(super) fn work_14(t: &Tokens, s: &SceneState) -> El {
	let mut agents: Vec<WorkingAgent> =
		eight_agents().into_iter().filter(|agent| agent.agent.name != "Sable").collect();
	agents[0].elapsed = Some("47s".to_owned());
	agents.insert(0, worker("Sable", Preset::Red, WorkState::Failed, None, None));
	work_scene(t, s, agents, false, PROSE_WIDTH)
}

pub(super) fn work_15(t: &Tokens, s: &SceneState) -> El {
	let mut agents: Vec<WorkingAgent> =
		eight_agents().into_iter().filter(|agent| agent.agent.name != "Sable").collect();
	agents[0].elapsed = Some("44s".to_owned());
	work_scene(t, s, agents, false, PROSE_WIDTH)
}

pub(super) fn work_16(t: &Tokens, s: &SceneState) -> El {
	work_scene(t, s, eight_agents(), false, NARROW_COLUMN)
}

pub(super) fn work_17(t: &Tokens, s: &SceneState) -> El {
	work_scene(t, s, eight_agents(), true, PROSE_WIDTH)
}

fn event(
	id: &str,
	kind: MissionEventKind,
	source: EventSource,
	said: Option<&str>,
	time: &str,
) -> MissionEvent {
	MissionEvent {
		id: id.to_owned(),
		kind,
		source,
		text: said.map(str::to_owned),
		link: None,
		time: time.to_owned(),
	}
}

fn mission_bot() -> Agent {
	agent("bot-atlas", "Atlas", Preset::Blue, None)
}

fn events_scene(t: &Tokens, s: &SceneState, events: Vec<MissionEvent>) -> El {
	with_cx(t, s, |cx| {
		padded(
			t,
			col()
				.w(MISSION_WIDTH)
				.gap(SPACING * 3.0)
				.children(events.iter().map(|shown| mission_event(cx, shown))),
		)
	})
}

const ASKED: &str =
	"The migration drops the invites table. Should I keep a backup of the rows before it runs?";
const NOTE: &str = "Paused the deploy until the backup lands. The branch is rebased on main and the checks are green.";

pub(super) fn event_machine_line(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::Opened,
			EventSource::Agent(Some(mission_bot())),
			None,
			"2 min ago",
		)],
	)
}

fn with_link(mut shown: MissionEvent, label: &str) -> MissionEvent {
	shown.link = Some(MissionLink {
		label: label.to_owned(),
		url: "https://github.com/kiroshi/app/pull/2112".to_owned(),
	});
	shown
}

pub(super) fn event_with_pull_request_link(t: &Tokens, s: &SceneState) -> El {
	let ready =
		event("e1", MissionEventKind::Ready, EventSource::CodingSession(None), None, "2 min ago");
	events_scene(t, s, vec![with_link(ready, "#2112")])
}

pub(super) fn event_with_an_unnumbered_link(t: &Tokens, s: &SceneState) -> El {
	let ready =
		event("e1", MissionEventKind::Ready, EventSource::CodingSession(None), None, "2 min ago");
	events_scene(t, s, vec![with_link(ready, "Pull request")])
}

pub(super) fn event_authored(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::Note,
			EventSource::Agent(Some(mission_bot())),
			Some(NOTE),
			"5 min ago",
		)],
	)
}

pub(super) fn event_from_the_agent(t: &Tokens, s: &SceneState) -> El {
	let session = EventSource::CodingSession(Some(("Superset".to_owned(), &icons::SUPERSET)));
	events_scene(t, s, vec![event("e1", MissionEventKind::Note, session, Some(NOTE), "5 min ago")])
}

pub(super) fn event_agent_asked(t: &Tokens, s: &SceneState) -> El {
	let session = EventSource::CodingSession(Some(("Superset".to_owned(), &icons::SUPERSET)));
	events_scene(
		t,
		s,
		vec![event("e1", MissionEventKind::AgentAsked, session, Some(ASKED), "1 min ago")],
	)
}

pub(super) fn event_from_the_agent_without_a_tool(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::Note,
			EventSource::CodingSession(None),
			Some(NOTE),
			"5 min ago",
		)],
	)
}

pub(super) fn event_from_github(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::ChecksFailed,
			EventSource::GitHub,
			Some("2 checks failed on the last push: types and vitest."),
			"3 min ago",
		)],
	)
}

pub(super) fn event_from_the_reader(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::Answered,
			EventSource::Reader,
			Some("Keep a backup, then drop it."),
			"Just now",
		)],
	)
}

pub(super) fn event_closed_by_you(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![event("e1", MissionEventKind::Dismissed, EventSource::Reader, None, "Just now")],
	)
}

pub(super) fn event_kinds(t: &Tokens, s: &SceneState) -> El {
	let bot = || EventSource::Agent(Some(mission_bot()));
	let kinds = [
		MissionEventKind::Opened,
		MissionEventKind::Note,
		MissionEventKind::AgentAsked,
		MissionEventKind::Answered,
		MissionEventKind::Escalated,
		MissionEventKind::Ready,
		MissionEventKind::ChecksFailed,
		MissionEventKind::Failed,
		MissionEventKind::Closed,
		MissionEventKind::Dismissed,
		MissionEventKind::Reopened,
	];
	events_scene(
		t,
		s,
		kinds
			.into_iter()
			.enumerate()
			.map(|(index, kind)| event(&format!("e{index}"), kind, bot(), None, "2 min ago"))
			.collect(),
	)
}

pub(super) fn event_authored_events(t: &Tokens, s: &SceneState) -> El {
	let session = EventSource::CodingSession(Some(("Superset".to_owned(), &icons::SUPERSET)));
	events_scene(
		t,
		s,
		vec![
			event(
				"e1",
				MissionEventKind::Note,
				EventSource::Agent(Some(mission_bot())),
				Some(NOTE),
				"6 min ago",
			),
			event("e2", MissionEventKind::AgentAsked, session, Some(ASKED), "4 min ago"),
			event(
				"e3",
				MissionEventKind::Answered,
				EventSource::Reader,
				Some("Keep a backup, then drop it."),
				"Just now",
			),
		],
	)
}

pub(super) fn event_without_a_bot(t: &Tokens, s: &SceneState) -> El {
	events_scene(
		t,
		s,
		vec![
			event("e1", MissionEventKind::Opened, EventSource::Agent(None), None, "8 min ago"),
			event("e2", MissionEventKind::Note, EventSource::Agent(None), Some(NOTE), "5 min ago"),
		],
	)
}

pub(super) fn event_long_content(t: &Tokens, s: &SceneState) -> El {
	let long = "The migration drops the invites table, rewrites every membership row to point at the new workspace id, and backfills the audit log so the history of each invite survives the drop. It runs inside one transaction, so a failure rolls every statement back, including the drop, and leaves the old tables exactly as they were before the run started.";
	events_scene(
		t,
		s,
		vec![event(
			"e1",
			MissionEventKind::Note,
			EventSource::Agent(Some(mission_bot())),
			Some(long),
			"5 min ago",
		)],
	)
}

fn mission_rows() -> Vec<Row> {
	let bot = || EventSource::Agent(Some(mission_bot()));
	let session = EventSource::CodingSession(Some(("Superset".to_owned(), &icons::SUPERSET)));
	vec![
		Row::Event(event("e1", MissionEventKind::Opened, bot(), None, "12 min ago")),
		Row::Turn(
			Turn::new(
				"m1",
				Author::Agent(mission_bot()),
				"I opened the mission and handed the ticket to the coding session.",
			)
			.at("09:12"),
		),
		Row::Event(event("e2", MissionEventKind::AgentAsked, session, Some(ASKED), "4 min ago")),
		Row::Turn(Turn::new("m2", Author::You, "Keep a backup, then drop it.").at("09:20")),
		Row::Event(event("e3", MissionEventKind::Answered, EventSource::Reader, None, "3 min ago")),
		Row::Event(with_link(
			event(
				"e4",
				MissionEventKind::Ready,
				EventSource::CodingSession(None),
				None,
				"Just now",
			),
			"#2112",
		)),
	]
}

fn thread_scene(t: &Tokens, s: &SceneState, kind: ThreadKind, transcript: Transcript) -> El {
	let data = Thread {
		kind,
		language: Language::En,
		space_hue: Some(Preset::Blue.hue()),
		roster: roster(),
		transcript,
	};
	let emit: Emit<SceneState> = Rc::new(|_, _| {});
	rune_kit::root(thread(t, &s.math, &data, &emit), Vec::new())
}

fn mission_kind() -> ThreadKind {
	ThreadKind::Mission {
		objective: "Drop the invites table without losing a pending invite".to_owned(),
	}
}

pub(super) fn event_in_a_mission_thread(t: &Tokens, s: &SceneState) -> El {
	thread_scene(t, s, mission_kind(), Transcript::Rows(mission_rows()))
}

const ANSWER_DONE: &str = "France leads with **412** people, then Germany with 268 and Spain with 190. Most of this week's 86 came from Germany: 51 of them.";

fn atlas_rows() -> Vec<Row> {
	let atlas = || Author::Agent(atlas());
	vec![
		Row::Turn(Turn::new("c1", atlas(), "Yes, all 14 checks passed at 9:12.").at("09:20")),
		Row::Turn(Turn::new("c2", Author::You, "Who has the demo video?").at("09:22")),
		Row::Turn(
			Turn::new("c3", atlas(), "Lena. She's recording it this afternoon, 60 seconds.")
				.at("09:22"),
		),
		Row::Turn(Turn::new("c4", Author::You, "And the waitlist?").at("09:25")),
		Row::Turn(Turn::new("c5", atlas(), "**1,240** people, up 86 since Monday.").at("09:26")),
		Row::Turn(Turn::new("c6", Author::You, "Can you split it by country?").at("09:40")),
		Row::Turn(Turn::new("c7", atlas(), ANSWER_DONE).at("09:41")),
	]
}

pub(super) fn thread_solo(t: &Tokens, s: &SceneState) -> El {
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(atlas_rows()))
}

fn pricing_rows() -> Vec<Row> {
	vec![
		Row::Turn(Turn::new("p1", Author::Agent(atlas()), "Here they are. Tandem charges **per team**, Fieldnote **per seat**, and we sit in between at **\\$15 per person** on the annual plan. The three are on slide 6 of [Pricing deck](https://example.com).").at("10:03")),
		Row::Turn(Turn::new("p2", Author::Person { name: "Tom".to_owned(), image: None }, "Fieldnote went up in October, I think that page is old.").at("10:05")),
		Row::Turn(Turn::new("p3", Author::Agent(atlas()), "You're right. Fieldnote is **\\$18 per seat** since October 3, not \\$14. I've corrected slide 6.").at("10:06")),
		Row::Turn(Turn::new("p4", Author::You, "Good catch. <@pico> can you put the corrected table on the pricing draft?").at("10:08")),
		Row::Turn(Turn::new("p5", Author::Agent(pico()), "Done. The table is on the pricing draft behind the preview flag, with Fieldnote at \\$18 and the three columns Lena asked for. Nothing is live yet.").at("10:14")),
	]
}

pub(super) fn thread_group(t: &Tokens, s: &SceneState) -> El {
	thread_scene(
		t,
		s,
		ThreadKind::Group { title: "Pricing".to_owned() },
		Transcript::Rows(pricing_rows()),
	)
}

pub(super) fn thread_with_actions(t: &Tokens, s: &SceneState) -> El {
	let rows = atlas_rows()
		.into_iter()
		.map(|shown| match shown {
			Row::Turn(data) => Row::Turn(Turn { shows_actions: true, ..data }),
			other => other,
		})
		.collect();
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

pub(super) fn thread_working(t: &Tokens, s: &SceneState) -> El {
	let mut rows = atlas_rows();
	rows.pop();
	rows.push(Row::Work(WorkLine {
		id: "w".to_owned(),
		agents: vec![worker("Atlas", Preset::Blue, WorkState::Thinking, None, Some("4s"))],
		open: false,
	}));
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

pub(super) fn thread_streaming(t: &Tokens, s: &SceneState) -> El {
	let mut rows = atlas_rows();
	rows.pop();
	rows.push(Row::Turn(Turn {
		state: TurnState::Streaming,
		..Turn::new(
			"c7",
			Author::Agent(atlas()),
			"France leads with **412** people, then Germany with 268 and Spain with 190. Let me check",
		)
	}));
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

pub(super) fn layout_empty(t: &Tokens, s: &SceneState) -> El {
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(Vec::new()))
}

pub(super) fn layout_error(t: &Tokens, s: &SceneState) -> El {
	let failure = Transcript::Failed {
		title: "Couldn't load this conversation.".to_owned(),
		detail: "The host didn't answer. Try again in a moment.".to_owned(),
	};
	thread_scene(t, s, ThreadKind::Solo(atlas()), failure)
}

pub(super) fn layout_pending(t: &Tokens, s: &SceneState) -> El {
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Loading)
}

pub(super) fn layout_long_content(t: &Tokens, s: &SceneState) -> El {
	let mut rows = atlas_rows();
	rows.push(Row::Turn(Turn::new("c8", Author::Agent(atlas()), FULL).at("09:44")));
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

pub(super) fn layout_start_of_older_messages(t: &Tokens, s: &SceneState) -> El {
	let mut rows = vec![Row::StartOfHistory, Row::Day("Wednesday, March 4".to_owned())];
	rows.extend(atlas_rows());
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

pub(super) fn transcript_marks_new_messages(t: &Tokens, s: &SceneState) -> El {
	let mut rows = atlas_rows();
	rows.insert(5, Row::NewMessages);
	thread_scene(t, s, ThreadKind::Solo(atlas()), Transcript::Rows(rows))
}

fn turns_scene(t: &Tokens, s: &SceneState, turns: Vec<Turn>) -> El {
	with_cx(t, s, |cx| {
		padded(
			t,
			col()
				.w(PROSE_WIDTH)
				.gap(SPACING * 3.0)
				.children(turns.iter().map(|shown| turn(cx, shown))),
		)
	})
}

const LONG_ANSWER: &str = "The whole migration runs inside one transaction, so a failure rolls back every statement including the drop. Only the memberships change, and the drop is the last statement. The invites table goes last because every membership row still points at it until the backfill finishes, and the audit log keeps the history of each invite after the drop.";

pub(super) fn turn_default(t: &Tokens, s: &SceneState) -> El {
	turns_scene(t, s, vec![Turn::new("t1", Author::Agent(atlas()), ANSWER_DONE).at("09:41")])
}

pub(super) fn turn_long_content(t: &Tokens, s: &SceneState) -> El {
	turns_scene(t, s, vec![Turn::new("t1", Author::Agent(atlas()), LONG_ANSWER).at("09:41")])
}

pub(super) fn turn_summoned_by_mission(t: &Tokens, s: &SceneState) -> El {
	let caused = Turn {
		cause: Some("Mission · Drop the invites table".to_owned()),
		..Turn::new(
			"t1",
			Author::Agent(atlas()),
			"I opened the mission and handed the ticket to the coding session.",
		)
		.at("09:12")
	};
	turns_scene(t, s, vec![caused])
}

pub(super) fn turn_reported_by_routine(t: &Tokens, s: &SceneState) -> El {
	let caused = Turn {
		cause: Some("Routine · Weekly waitlist report".to_owned()),
		..Turn::new(
			"t1",
			Author::Agent(atlas()),
			"**1,240** people on the waitlist, up 86 since Monday.",
		)
		.at("09:00")
	};
	turns_scene(t, s, vec![caused])
}

pub(super) fn turn_speakers(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn::new("t1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12.")
				.at("09:20"),
			Turn::new(
				"t2",
				Author::Person { name: "Tom Bauer".to_owned(), image: None },
				"Fieldnote went up in October, I think that page is old.",
			)
			.at("09:21"),
			Turn::new("t3", Author::You, "Who has the demo video?").at("09:22"),
			Turn::new(
				"t4",
				Author::Agent(pico()),
				"Lena. She's recording it this afternoon, 60 seconds.",
			)
			.at("09:22"),
		],
	)
}

pub(super) fn turn_person_with_custom_image(t: &Tokens, s: &SceneState) -> El {
	let image = s.picture.clone();
	turns_scene(
		t,
		s,
		vec![
			Turn::new(
				"t1",
				Author::Person { name: "Tom Bauer".to_owned(), image },
				"Fieldnote went up in October, I think that page is old.",
			)
			.at("09:21"),
		],
	)
}

pub(super) fn turn_hover_actions(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn {
				shows_actions: true,
				..Turn::new("t1", Author::Agent(atlas()), ANSWER_DONE).at("09:41")
			},
			Turn {
				shows_actions: true,
				pinned: true,
				..Turn::new("t2", Author::You, "Can you split it by country?").at("09:40")
			},
		],
	)
}

pub(super) fn turn_endings(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn {
				state: TurnState::Stopped,
				..Turn::new(
					"t1",
					Author::Agent(atlas()),
					"France leads with **412** people, then Germany with 268",
				)
				.at("09:41")
			},
			Turn {
				state: TurnState::Failed,
				..Turn::new("t2", Author::Agent(pico()), "Let me check which of them signed up")
					.at("09:42")
			},
		],
	)
}

pub(super) fn turn_working(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			state: TurnState::Streaming,
			..Turn::new(
				"t1",
				Author::Agent(atlas()),
				"France leads with **412** people, then Germany with 268 and Spain with 190. Let me check",
			)
		}],
	)
}

fn quote(id: &str, author: &str, excerpt: &str) -> Quote {
	Quote { id: id.to_owned(), author: author.to_owned(), excerpt: excerpt.to_owned() }
}

pub(super) fn turn_quoted(t: &Tokens, s: &SceneState) -> El {
	let replied = Turn {
		quotes: vec![quote("q1", "Atlas", "**1,240** people, up 86 since Monday.")],
		..Turn::new("t1", Author::You, "Can you split it by country?").at("09:40")
	};
	turns_scene(t, s, vec![replied])
}

pub(super) fn turn_replies_to_two(t: &Tokens, s: &SceneState) -> El {
	let replied = Turn {
		quotes: vec![
			quote("q1", "Atlas", "Yes, all 14 checks passed at 9:12."),
			quote("q2", "Tom Bauer", "Fieldnote went up in October, I think that page is old."),
		],
		..Turn::new("t1", Author::You, "Both good to know, thanks.").at("09:40")
	};
	turns_scene(t, s, vec![replied])
}

pub(super) fn turn_deleted_author(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn::new("t1", Author::Deleted, "Yes, all 14 checks passed at 9:12.").at("09:20")],
	)
}

pub(super) fn turn_not_sent(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			state: TurnState::Failed,
			..Turn::new("t1", Author::You, "Can you split it by country?").at("09:40")
		}],
	)
}

pub(super) fn turn_queued(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			state: TurnState::Queued,
			..Turn::new("t1", Author::You, "Can you split it by country?").at("09:40")
		}],
	)
}

pub(super) fn turn_crossing_a_day(t: &Tokens, s: &SceneState) -> El {
	with_cx(t, s, |cx| {
		padded(
			t,
			col()
				.w(PROSE_WIDTH)
				.gap(SPACING * 3.0)
				.child(turn(
					cx,
					&Turn::new("t1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12.")
						.at("21:20"),
				))
				.child(day_separator(t, "Today"))
				.child(turn(
					cx,
					&Turn::new("t2", Author::You, "Who has the demo video?").at("09:22"),
				)),
		)
	})
}

fn image(s: &SceneState, name: &str) -> Attachment {
	Attachment { name: name.to_owned(), preview: s.picture.clone(), failed: false }
}

fn file(name: &str) -> Attachment {
	Attachment { name: name.to_owned(), preview: None, failed: false }
}

fn attachments_scene(t: &Tokens, s: &SceneState, attachments: Vec<Attachment>, said: &str) -> El {
	turns_scene(t, s, vec![Turn { attachments, ..Turn::new("a1", Author::You, said).at("09:40") }])
}

pub(super) fn attachments_default(t: &Tokens, s: &SceneState) -> El {
	attachments_scene(t, s, vec![image(s, "patio.png")], "Here is the patio at noon.")
}

pub(super) fn attachments_two_images(t: &Tokens, s: &SceneState) -> El {
	attachments_scene(
		t,
		s,
		vec![image(s, "patio.png"), image(s, "garden.png")],
		"Two views of the garden.",
	)
}

pub(super) fn attachments_several_images(t: &Tokens, s: &SceneState) -> El {
	let images =
		["a.png", "b.png", "c.png", "d.png"].into_iter().map(|name| image(s, name)).collect();
	attachments_scene(t, s, images, "The four rooms.")
}

pub(super) fn attachments_many_images(t: &Tokens, s: &SceneState) -> El {
	let images = (0..9).map(|index| image(s, &format!("room-{index}.png"))).collect();
	attachments_scene(t, s, images, "Every room on the floor.")
}

pub(super) fn attachments_mixed_kinds(t: &Tokens, s: &SceneState) -> El {
	attachments_scene(
		t,
		s,
		vec![image(s, "patio.png"), file("Q3 report.pdf"), file("ledger.csv")],
		"The photo and the two files.",
	)
}

pub(super) fn attachments_states(t: &Tokens, s: &SceneState) -> El {
	let failed = Attachment { failed: true, ..file("broken.png") };
	attachments_scene(
		t,
		s,
		vec![image(s, "patio.png"), failed, file("Q3 report.pdf")],
		"One of them didn't load.",
	)
}

pub(super) fn attachments_long_content(t: &Tokens, s: &SceneState) -> El {
	attachments_scene(
		t,
		s,
		vec![file("Quarterly revenue reconciliation for the board, final version, signed.pdf")],
		"The long one.",
	)
}

pub(super) fn attachments_error(t: &Tokens, s: &SceneState) -> El {
	let failed = Attachment { failed: true, ..file("patio.png") };
	attachments_scene(t, s, vec![failed], "The photo didn't make it.")
}

pub(super) fn attachments_empty(t: &Tokens, s: &SceneState) -> El {
	attachments_scene(t, s, Vec::new(), "Nothing attached.")
}

pub(super) fn message_side_bot(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			shows_actions: true,
			..Turn::new("t1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12.")
				.at("09:20")
		}],
	)
}

pub(super) fn message_side_reader(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			shows_actions: true,
			..Turn::new("t1", Author::You, "Who has the demo video?").at("09:22")
		}],
	)
}

pub(super) fn quote_default(t: &Tokens, s: &SceneState) -> El {
	let replied = Turn {
		quotes: vec![quote(
			"q1",
			"Ada Martin",
			"The whole migration runs inside one transaction, so a failure rolls back every statement including the drop.",
		)],
		shows_author: false,
		..Turn::new("t1", Author::Agent(atlas()), "Then what happens to the invites table?")
	};
	turns_scene(t, s, vec![replied])
}

pub(super) fn quote_tones(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn {
				quotes: vec![quote("q1", "Skippy", "Is any of that destructive?")],
				shows_author: false,
				..Turn::new("t1", Author::You, "Then what happens to the invites table?")
			},
			Turn {
				quotes: vec![quote("q2", "Ada Martin", "Is any of that destructive?")],
				shows_author: false,
				..Turn::new(
					"t2",
					Author::Agent(atlas()),
					"Only the memberships change, and the drop is the last statement.",
				)
			},
		],
	)
}

pub(super) fn bubble_default(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			bare("b1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12."),
			bare("b2", Author::You, "Who has the demo video?"),
		],
	)
}

pub(super) fn bubble_long_words(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![bare(
			"b1",
			Author::Agent(atlas()),
			"https://kiroshi.dev/reports/2026/08/nest_42/occupants?include=arrivals%2Cdepartures&sort=timestamp",
		)],
	)
}

pub(super) fn bubble_space_tinted(t: &Tokens, s: &SceneState) -> El {
	let tinted = t.in_space(Some(Preset::Green.hue()));
	turns_scene(
		&tinted,
		s,
		vec![
			bare("b1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12."),
			bare("b2", Author::You, "Who has the demo video?"),
		],
	)
}

pub(super) fn bubble_narrow(t: &Tokens, s: &SceneState) -> El {
	with_cx(t, s, |cx| {
		padded(
			t,
			col()
				.w(320.0)
				.gap(SPACING * 3.0)
				.child(turn(cx, &bare("b1", Author::Agent(atlas()), LONG_ANSWER)))
				.child(turn(cx, &bare("b2", Author::You, "Who has the demo video?"))),
		)
	})
}

pub(super) fn message_variants(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn::new("m1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12.")
				.at("09:20"),
			Turn::new(
				"m2",
				Author::Person { name: "Tom".to_owned(), image: None },
				"Fieldnote went up in October.",
			)
			.at("09:21"),
			Turn::new("m3", Author::You, "Who has the demo video?").at("09:22"),
		],
	)
}

pub(super) fn message_authors(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn::new("m1", Author::Agent(atlas()), "Planner here.").at("09:20"),
			Turn::new("m2", Author::Agent(pico()), "Builder here.").at("09:21"),
			Turn::new("m3", Author::Agent(juniper()), "Writer here.").at("09:22"),
		],
	)
}

pub(super) fn message_author_with_long_title(t: &Tokens, s: &SceneState) -> El {
	let long = agent(
		"atlas",
		"Atlas",
		Preset::Blue,
		Some("Head of planning for the spring launch and the waitlist"),
	);
	turns_scene(
		t,
		s,
		vec![
			Turn::new("m1", Author::Agent(long), "Yes, all 14 checks passed at 9:12.").at("09:20"),
		],
	)
}

pub(super) fn message_long_content(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![
			Turn::new("m1", Author::Agent(atlas()), LONG_ANSWER).at("09:20"),
			Turn::new("m2", Author::You, LONG_ANSWER).at("09:21"),
		],
	)
}

pub(super) fn actions_default(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			shows_actions: true,
			..Turn::new("t1", Author::Agent(atlas()), "Yes, all 14 checks passed at 9:12.")
				.at("09:20")
		}],
	)
}

pub(super) fn actions_in_french(t: &Tokens, s: &SceneState) -> El {
	let roster = roster();
	let emit: Emit<SceneState> = Rc::new(|_, _| {});
	let cx = Context { t, math: &s.math, language: Language::Fr, roster: &roster, emit: &emit };
	let shown = Turn {
		shows_actions: true,
		..Turn::new("t1", Author::You, "Qui a la vidéo de démo ?").at("09:22")
	};
	padded(t, col().w(PROSE_WIDTH).child(turn(&cx, &shown)))
}

pub(super) fn focus_ring(t: &Tokens, s: &SceneState) -> El {
	turns_scene(
		t,
		s,
		vec![Turn {
			state: TurnState::Failed,
			..Turn::new("t1", Author::Agent(pico()), "Let me check which of them signed up")
				.at("09:42")
		}],
	)
}
