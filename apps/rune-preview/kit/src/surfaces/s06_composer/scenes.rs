use rune::{El, TextEdit, TextStyle, col, row, text};

use super::chips::{FileChip, ReplyChip, prompt_attachments, reply_list};
use super::menus::{Command, MentionFace, MentionMenu, Mentionable, command_menu, mention_menu};
use super::picker::{LibraryDocument, LibraryPicker, library_picker, library_trigger};
use super::prompt::{Offline, PromptInput, attach_control, focus_prompt, prompt_input};
use super::queue::{PromptQueue, QueuedMessage, prompt_queue};
use super::quote::{ReplyQuote, SelectionQuote, prompt_reply, selection_quote};
use super::{ComposerIntent, Reach, Scope};
use crate::hues::Preset;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::scenes::{Pointer, Scene, SceneState, THEMES};
use crate::strings::Language;
use crate::tokens::{BLUE, SPACING, TEXT_BASE_MEDIUM, Tokens, srgb};

const WIDTH: f32 = SPACING * 136.0;
const QUOTE_WIDTH: f32 = SPACING * 156.0;
const NARROW: f32 = SPACING * 80.0;
const QUEUE_WIDTH: f32 = SPACING * 180.0;
const MENU_BOX: f32 = SPACING * 128.0;
const SHRUNK_COMPOSER: f32 = 249.0;

const COMPOSER: (f32, f32) = (640.0, 200.0);
const TALL: (f32, f32) = (640.0, 320.0);
const PAIR: (f32, f32) = (640.0, 360.0);
const MENU: (f32, f32) = (640.0, 560.0);
const PICKER: (f32, f32) = (560.0, 480.0);
const QUOTED: (f32, f32) = (720.0, 220.0);
const QUEUE: (f32, f32) = (760.0, 200.0);
const CONTROL: (f32, f32) = (240.0, 120.0);
const NARROW_CARD: (f32, f32) = (400.0, 200.0);

const DRAFT: &str = "Summarise the release notes for v0.1";
const FILLING_DRAFT: &str = "Summarise the release notes and flag every public export that moved";
const WRAPPED_DRAFT: &str =
	"Summarise the release notes for v0.1 and tell me which entries changed a public export";
const LONG_DRAFT: &str = "Review the release branch and write the changelog for v0.1.\n\nCover the desktop shell, the design foundations and the chat surface.\nGroup the entries by package, newest first, and keep each line under\ntwelve words so the notes stay scannable in the terminal.\n\nFlag anything that changes a public export, then list the follow-ups\nwe deliberately left out of this milestone.\n\nName the packages that gained a public surface, and say in one line\nwhat a reader of the notes is expected to do with each entry.";
const QUOTE_REPLY: &str = "Can we start this at 14:00? Lunch runs long.";
const STAGED_DRAFT: &str = "Compare these two against the spec";
const REPLY_PROMPT: &str = "Then what happens to the invites table?";
const NAMED_PROMPT: &str = "Then what happens to the invites table? Twice?";
const SLASH: &str = "/";
const SLASH_QUERY: &str = "/co";
const AT: &str = "@";
const AT_QUERY: &str = "@do";

const ADD_CONTEXT: &str = "Add context";
const REPLY_TO_BEACON: &str = "Reply to Beacon";
const TOGGLE_REPLY: &str = "Toggle reply";
const OFFLINE: Offline = Offline { space: "Studio", host: "Steve" };
const QUOTE_TEXT: &str = "13:30 to 17:00: the roadmap, with every team in the room.";
const LONG_QUOTE: &str = "The sync finished, but two devices needed a full pass instead of the usual delta, and the studio tablet came back with a clock drift of about four minutes. The sync finished, but two devices needed a full pass instead of the usual delta, and the studio tablet came back with a clock drift of about four minutes. The sync finished, but two devices needed a full pass instead of the usual delta, and the studio tablet came back with a clock drift of about four minutes. https://example.com/sync/logs/da-lat-laptop/2026-11-02/full-pass-with-a-very-long-unbreakable-path";
const SELECTION: &str = "the studio tablet came back with a clock drift of about four minutes";
const LONG_SELECTION: &str = "The sync finished, but two devices needed a full pass instead of the usual delta. The Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself.";
const NARROW_SELECTION: &str = "The sync finished, but two devices needed a full pass instead of the usual delta. The Da Lat laptop had been offline since Monday, and the studio tablet came back with a clock drift of about four minutes, which is enough to make the queue reorder itself. https://example.com/sync/logs/da-lat-laptop/2026-11-02/full-pass";
const LONG_AGENT: &str = "Atlas, release manager for the whole desktop platform";
const REPLY_AUTHOR: &str = "Skippy";
const REPLY_EXCERPT: &str = "The whole migration runs inside one transaction, so a failure rolls back every statement including the drop.";

const ATLAS_REPLY: ReplyChip = ReplyChip {
	id: "atlas-roadmap",
	author: "Atlas",
	excerpt: "13:30 to 17:00: the roadmap, with every team in the room, then the retro on the release train and the hiring plan for the next quarter.",
	is_excerpt: false,
};
const BEACON_REPLY: ReplyChip = ReplyChip {
	id: "beacon-dinner",
	author: "Beacon",
	excerpt: "Dinner at 20:00, table for six.",
	is_excerpt: false,
};
const EXCERPT_REPLY: ReplyChip = ReplyChip {
	id: "reply-drift",
	author: "Atlas",
	excerpt: "the studio tablet came back with a clock drift of about four minutes",
	is_excerpt: true,
};
const WHOLE_REPLY: ReplyChip = ReplyChip {
	id: "reply-lost",
	author: "Ada Martin",
	excerpt: "Did we lose anything?",
	is_excerpt: false,
};
const UNBREAKABLE_REPLY: ReplyChip = ReplyChip {
	id: "reply-hash",
	author: "Atlas",
	excerpt: "sha256:9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a089f86d081884c7d659a2feaa0c55ad015",
	is_excerpt: true,
};

struct StagedFile {
	id: &'static str,
	name: &'static str,
	bytes: u64,
	preview: Option<(u32, u32)>,
}

const NOTES: StagedFile =
	StagedFile { id: "notes", name: "release-notes.md", bytes: 4212, preview: None };
const SCREENSHOT: StagedFile = StagedFile {
	id: "screenshot",
	name: "composer-empty.png",
	bytes: 184_320,
	preview: Some((0x1e293b, 0xf97316)),
};
const STAGED: [StagedFile; 2] = [NOTES, SCREENSHOT];
const LONG_STAGED: [StagedFile; 6] = [
	NOTES,
	SCREENSHOT,
	StagedFile {
		id: "report",
		name: "release-notes-for-the-desktop-shell-and-the-chat-surface.md",
		bytes: 731,
		preview: None,
	},
	StagedFile {
		id: "diagram",
		name: "transport-diagram.svg",
		bytes: 9871,
		preview: Some((0x0f766e, 0xa7f3d0)),
	},
	StagedFile { id: "session", name: "session-2026-03-04.log", bytes: 1_268_934, preview: None },
	StagedFile { id: "manifest", name: "components.json", bytes: 512, preview: None },
];

const PREVIEW_SIDE: f32 = SPACING * 8.0;
const PREVIEW_DOT: f32 = 14.0;
const PREVIEW_DOT_AT: (f32, f32) = (13.0, 5.0);

#[derive(Clone, Copy)]
struct Member {
	id: &'static str,
	name: &'static str,
	title: Option<&'static str>,
	hue: Preset,
	is_outside: bool,
}

const fn agent(id: &'static str, name: &'static str, hue: Preset) -> Member {
	Member { id, name, title: None, hue, is_outside: false }
}

const fn outside(id: &'static str, name: &'static str, hue: Preset) -> Member {
	Member { is_outside: true, ..agent(id, name, hue) }
}

const fn titled(member: Member, title: &'static str) -> Member {
	Member { title: Some(title), ..member }
}

fn mentionables(members: &[Member]) -> Vec<Mentionable<'static>> {
	members
		.iter()
		.map(|member| Mentionable {
			id: member.id,
			name: member.name,
			title: member.title,
			face: MentionFace::Agent { hue: Some(member.hue.hue()) },
			is_outside: member.is_outside,
		})
		.collect()
}

const ATLAS: &str = "bot-atlas";
const RELEASE: &str = "bot-release";

const CONVERSATION: [Member; 6] = [
	agent(ATLAS, "Atlas", Preset::Blue),
	agent("bot-basile", "Basile", Preset::Purple),
	agent("bot-clemence", "Clémence", Preset::Pink),
	agent("bot-dorian", "Dorian", Preset::Orange),
	agent("bot-elia", "Elia", Preset::Green),
	agent("bot-faust", "Faust", Preset::Cyan),
];
const RELEASE_AGENT: Member =
	agent(RELEASE, "Release notes editor for the desktop build", Preset::Yellow);
const TRIAGE_AGENT: Member =
	agent("bot-triage", "Incident triage and on-call handover agent", Preset::Red);
const CROWDED: [Member; 8] = [
	CONVERSATION[0],
	CONVERSATION[1],
	CONVERSATION[2],
	CONVERSATION[3],
	CONVERSATION[4],
	CONVERSATION[5],
	RELEASE_AGENT,
	TRIAGE_AGENT,
];
const LONG_NAMED_SPACE: [Member; 8] = [
	CONVERSATION[0],
	CONVERSATION[1],
	CONVERSATION[2],
	CONVERSATION[3],
	CONVERSATION[4],
	CONVERSATION[5],
	titled(RELEASE_AGENT, "Writer"),
	Member { is_outside: true, ..titled(TRIAGE_AGENT, "On call") },
];
const SPACE: [Member; 30] = [
	titled(agent(ATLAS, "Atlas", Preset::Blue), "Editor"),
	titled(outside("bot-margaux", "Margaux", Preset::Red), "Research"),
	agent("bot-basile", "Basile", Preset::Purple),
	outside("bot-nolan", "Nolan", Preset::Yellow),
	agent("bot-clemence", "Clémence", Preset::Pink),
	agent("bot-dorian", "Dorian", Preset::Orange),
	outside("bot-octave", "Octave", Preset::Green),
	agent("bot-elia", "Elia", Preset::Green),
	agent("bot-faust", "Faust", Preset::Cyan),
	outside("bot-paloma", "Paloma", Preset::Pink),
	agent("bot-gaspard", "Gaspard", Preset::Yellow),
	agent("bot-helene", "Hélène", Preset::Red),
	outside("bot-quentin", "Quentin", Preset::Cyan),
	agent("bot-ines", "Ines", Preset::Blue),
	outside("bot-rosalie", "Rosalie", Preset::Orange),
	agent("bot-jules", "Jules", Preset::Purple),
	outside("bot-sacha", "Sacha", Preset::Green),
	agent("bot-kenza", "Kenza", Preset::Pink),
	outside("bot-theo", "Théo", Preset::Blue),
	agent("bot-lucien", "Lucien", Preset::Yellow),
	outside("bot-ursule", "Ursule", Preset::Red),
	outside("bot-victor", "Victor", Preset::Cyan),
	outside("bot-wanda", "Wanda", Preset::Purple),
	outside("bot-xavier", "Xavier", Preset::Orange),
	outside("bot-yasmine", "Yasmine", Preset::Red),
	outside("bot-zoe", "Zoé", Preset::Yellow),
	outside("bot-ambre", "Ambre", Preset::Green),
	outside("bot-bastien", "Bastien", Preset::Pink),
	outside("bot-celeste", "Céleste", Preset::Cyan),
	outside("bot-damien", "Damien", Preset::Blue),
];

const NAMES: [&str; 9] =
	["/clear", "/compact", "/config", "/cost", "/help", "/init", "/model", "/review", "/status"];
const LONG_NAMES: [&str; 21] = [
	"/clear",
	"/compact",
	"/config",
	"/cost",
	"/help",
	"/init",
	"/model",
	"/review",
	"/status",
	"/agents",
	"/context",
	"/doctor",
	"/export",
	"/hooks",
	"/mcp",
	"/memory",
	"/permissions",
	"/release-notes-with-a-deliberately-long-command-name",
	"/resume",
	"/terminal-setup",
	"/vim",
];
const DESCRIBED: [Command; 6] = [
	Command { name: "/clear", description: Some("Start a fresh conversation") },
	Command { name: "/compact", description: Some("Summarise the thread and free the context") },
	Command {
		name: "/config",
		description: Some(
			"Open the settings panel to change the model, the theme, the permission mode and everything else this session reads at launch",
		),
	},
	Command { name: "/cost", description: Some("Show what this session has spent so far") },
	Command { name: "/help", description: None },
	Command { name: "/review", description: Some("Review the pending changes on this branch") },
];

const DOCUMENTS: [LibraryDocument; 4] = [
	LibraryDocument {
		id: "brief",
		name: "Spring launch brief",
		detail: "Edited today · 1,240 words",
	},
	LibraryDocument {
		id: "notes",
		name: "Meeting notes, 2 November",
		detail: "Edited yesterday · 640 words",
	},
	LibraryDocument {
		id: "research",
		name: "Onboarding research",
		detail: "Edited last week · 2,310 words",
	},
	LibraryDocument { id: "untitled", name: "", detail: "Created on 28 October · 0 words" },
];

const QUEUED_ONE: [QueuedMessage; 1] =
	[QueuedMessage { id: "split", text: "Can you split it by country?" }];
const QUEUED_TWO: [QueuedMessage; 2] = [
	QueuedMessage { id: "city", text: "And by city for France?" },
	QueuedMessage { id: "top", text: "Top three only." },
];

const SEND_KEY: &str = "composer-send";
const HOVERED_ATTACH_KEY: &str = "attach-hover";
const SECOND_QUEUED_KEY: &str = "queue-item-top";

const fn scene(
	id: &'static str,
	size: (f32, f32),
	typed: &'static str,
	tabs: usize,
	pointer: Pointer,
	view: SceneView,
) -> Scene {
	Scene { id, size, tabs, pointer, typed, keys: "", themes: &THEMES, view }
}

const fn fixed(id: &'static str, size: (f32, f32), view: SceneView) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed: "", keys: "", themes: &THEMES, view }
}

const fn drafted(
	id: &'static str,
	size: (f32, f32),
	typed: &'static str,
	view: SceneView,
) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed, keys: "", themes: &THEMES, view }
}

const fn tabbed(
	id: &'static str,
	size: (f32, f32),
	typed: &'static str,
	tabs: usize,
	view: SceneView,
) -> Scene {
	Scene { id, size, tabs, pointer: Pointer::Away, typed, keys: "", themes: &THEMES, view }
}

const fn hovered(
	id: &'static str,
	size: (f32, f32),
	typed: &'static str,
	key: &'static str,
	view: SceneView,
) -> Scene {
	Scene {
		id,
		size,
		tabs: 0,
		pointer: Pointer::EntersAtSnap(key),
		typed,
		keys: "",
		themes: &THEMES,
		view,
	}
}

type SceneView = fn(&Tokens, &SceneState) -> El;

fn ignore(_: &mut SceneState, _: ComposerIntent) {}

fn scope(t: &Tokens) -> Scope<'_, SceneState> {
	Scope { t, language: Language::En, emit: ignore }
}

fn draft(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

fn centered(t: &Tokens, content: El, layers: Vec<El>) -> El {
	rune_kit::root(row().w_full().h_full().fill(t.background).center().child(content), layers)
}

fn stacked(items: impl IntoIterator<Item = El>) -> El {
	col().gap(SPACING * 4.0).children(items)
}

fn add_context(t: &Tokens) -> El {
	Button::icon(&crate::icons::PLUS, ADD_CONTEXT).variant(ButtonVariant::Ghost).view(t)
}

fn attach(t: &Tokens, reach: Reach) -> El {
	attach_control(scope(t), "composer-attach", reach, ComposerIntent::Attach)
}

fn preview((ground, dot): (u32, u32)) -> El {
	row().size(PREVIEW_SIDE, PREVIEW_SIDE).fill(srgb(ground)).child(
		rune::el()
			.size(PREVIEW_DOT, PREVIEW_DOT)
			.radius(PREVIEW_DOT / 2.0)
			.fill(srgb(dot))
			.absolute(PREVIEW_DOT_AT.0, PREVIEW_DOT_AT.1),
	)
}

fn staged(t: &Tokens, files: &[StagedFile], reach: Reach) -> Option<El> {
	let chips = files
		.iter()
		.map(|file| FileChip {
			id: file.id,
			name: file.name,
			bytes: file.bytes,
			preview: file.preview.map(preview),
		})
		.collect();
	prompt_attachments(scope(t), chips, reach)
}

fn composer(t: &Tokens, input: PromptInput) -> El {
	prompt_input(scope(t), input, draft)
}

fn with_leading(edit: &TextEdit, width: f32, leading: El) -> PromptInput<'_> {
	PromptInput { leading: vec![leading], ..PromptInput::new(edit, width) }
}

fn input_empty(t: &Tokens, s: &SceneState) -> El {
	centered(t, composer(t, PromptInput::new(&s.edit, WIDTH)), Vec::new())
}

fn input_focused_empty(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput { focused: true, ..PromptInput::new(&s.edit, WIDTH) };
	centered(t, composer(t, input), Vec::new())
}

fn input_focused_by_app_with_draft(t: &Tokens, s: &SceneState) -> El {
	let mut edit = s.edit.clone();
	edit.set_caret(0);
	focus_prompt(&mut edit, false);
	let input = PromptInput { focused: edit.focused, ..PromptInput::new(&edit, WIDTH) };
	centered(t, composer(t, input), Vec::new())
}

fn input_with_controls(t: &Tokens, s: &SceneState) -> El {
	centered(t, composer(t, with_leading(&s.edit, WIDTH, add_context(t))), Vec::new())
}

fn input_disabled(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput { disabled: true, ..PromptInput::new(&s.edit, WIDTH) };
	centered(t, composer(t, input), Vec::new())
}

fn input_themes_disabled(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput { disabled: true, ..with_leading(&s.edit, WIDTH, add_context(t)) };
	centered(t, composer(t, input), Vec::new())
}

fn input_states(t: &Tokens, s: &SceneState) -> El {
	let idle = TextEdit::new("");
	let disabled = TextEdit::new(DRAFT);
	let idle_input = PromptInput { label: Some("Idle prompt"), ..PromptInput::new(&idle, WIDTH) };
	let focused = PromptInput { label: Some("Focused prompt"), ..PromptInput::new(&s.edit, WIDTH) };
	let blocked = PromptInput {
		label: Some("Disabled prompt"),
		disabled: true,
		attachments: staged(t, &STAGED, Reach::Inert),
		..with_leading(&disabled, WIDTH, add_context(t))
	};
	centered(
		t,
		stacked([composer(t, idle_input), composer(t, focused), composer(t, blocked)]),
		Vec::new(),
	)
}

fn input_with_attachments(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		attachments: staged(t, &STAGED, Reach::Live),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Live))
	};
	centered(t, composer(t, input), Vec::new())
}

fn input_with_attach(t: &Tokens, s: &SceneState) -> El {
	centered(t, composer(t, with_leading(&s.edit, WIDTH, attach(t, Reach::Live))), Vec::new())
}

fn input_replies_and_attachments(t: &Tokens, s: &SceneState) -> El {
	let replies = [ATLAS_REPLY, BEACON_REPLY];
	let input = PromptInput {
		replies: &replies,
		attachments: staged(t, &STAGED[..1], Reach::Live),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Live))
	};
	let add = Button::new(REPLY_TO_BEACON)
		.variant(ButtonVariant::Outline)
		.size(ButtonSize::Sm)
		.disabled(true)
		.view(t)
		.self_start();
	centered(t, col().gap(SPACING * 3.0).child(composer(t, input)).child(add), Vec::new())
}

fn quote(text: &str) -> SelectionQuote<'_> {
	SelectionQuote { agent: "Atlas", text }
}

fn input_with_quote(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		quote: Some(quote(QUOTE_TEXT)),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Live))
	};
	centered(t, composer(t, input), Vec::new())
}

fn input_with_quote_and_attachments(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		quote: Some(quote(QUOTE_TEXT)),
		attachments: staged(t, &STAGED, Reach::Live),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Live))
	};
	centered(t, composer(t, input), Vec::new())
}

fn input_with_long_quote(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		quote: Some(quote(LONG_QUOTE)),
		..with_leading(&s.edit, NARROW, attach(t, Reach::Live))
	};
	centered(t, composer(t, input), Vec::new())
}

fn input_with_quote_blocked(t: &Tokens, s: &SceneState) -> El {
	let disabled = TextEdit::new(DRAFT);
	let offline = PromptInput {
		quote: Some(quote(QUOTE_TEXT)),
		offline: Some(OFFLINE),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Blank))
	};
	let blocked = PromptInput {
		quote: Some(quote(QUOTE_TEXT)),
		disabled: true,
		..with_leading(&disabled, WIDTH, attach(t, Reach::Inert))
	};
	centered(t, stacked([composer(t, offline), composer(t, blocked)]), Vec::new())
}

fn input_marked_from_outside(t: &Tokens, s: &SceneState) -> El {
	let disabled = TextEdit::new(DRAFT);
	let marked =
		PromptInput { drop_target: true, ..with_leading(&s.edit, WIDTH, attach(t, Reach::Live)) };
	let blocked = PromptInput {
		label: Some("Disabled prompt"),
		drop_target: true,
		disabled: true,
		..with_leading(&disabled, WIDTH, attach(t, Reach::Inert))
	};
	centered(t, stacked([composer(t, marked), composer(t, blocked)]), Vec::new())
}

fn input_files_only(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		attachments: staged(t, &STAGED, Reach::Live),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Live))
	};
	centered(t, composer(t, input), Vec::new())
}

fn input_offline(t: &Tokens, s: &SceneState) -> El {
	let input = PromptInput {
		offline: Some(OFFLINE),
		..with_leading(&s.edit, WIDTH, attach(t, Reach::Blank))
	};
	centered(t, composer(t, input), Vec::new())
}

fn attach_default(t: &Tokens, _: &SceneState) -> El {
	centered(t, attach(t, Reach::Live), Vec::new())
}

fn attach_states(t: &Tokens, _: &SceneState) -> El {
	let control =
		|key: &'static str, reach| attach_control(scope(t), key, reach, ComposerIntent::Attach);
	centered(
		t,
		row()
			.gap(SPACING * 2.0)
			.center_y()
			.child(control("attach-idle", Reach::Live))
			.child(control(HOVERED_ATTACH_KEY, Reach::Live))
			.child(control("attach-focus", Reach::Live))
			.child(control("attach-disabled", Reach::Disabled)),
		Vec::new(),
	)
}

fn listed(t: &Tokens, content: Option<El>, width: f32) -> El {
	centered(t, col().w(width).children(content), Vec::new())
}

fn attachments_default(t: &Tokens, _: &SceneState) -> El {
	listed(t, staged(t, &STAGED, Reach::Live), WIDTH)
}

fn attachments_long_content(t: &Tokens, _: &SceneState) -> El {
	listed(t, staged(t, &LONG_STAGED, Reach::Live), WIDTH)
}

fn attachments_empty(t: &Tokens, _: &SceneState) -> El {
	listed(t, staged(t, &[], Reach::Live), WIDTH)
}

fn replies(t: &Tokens, chips: &[ReplyChip], width: f32) -> El {
	listed(t, Some(reply_list(scope(t), chips, Reach::Live)), width)
}

fn attachments_reply_excerpt(t: &Tokens, _: &SceneState) -> El {
	replies(t, &[EXCERPT_REPLY], WIDTH)
}

fn attachments_reply_whole(t: &Tokens, _: &SceneState) -> El {
	replies(t, &[WHOLE_REPLY], WIDTH)
}

fn attachments_two_replies(t: &Tokens, _: &SceneState) -> El {
	replies(t, &[EXCERPT_REPLY, WHOLE_REPLY], WIDTH)
}

fn attachments_reply_unbreakable(t: &Tokens, _: &SceneState) -> El {
	replies(t, &[UNBREAKABLE_REPLY], WIDTH)
}

fn attachments_reply_unbreakable_narrow(t: &Tokens, _: &SceneState) -> El {
	replies(t, &[UNBREAKABLE_REPLY], NARROW)
}

fn over_composer(t: &Tokens, s: &SceneState, menu: Option<El>) -> El {
	let input =
		PromptInput { menu_open: menu.is_some(), ..PromptInput::new(&s.edit, SHRUNK_COMPOSER) };
	let stage = col().w(WIDTH).h(MENU_BOX).justify_end().items_start().child(composer(t, input));
	centered(t, stage, menu.into_iter().collect())
}

fn commands(names: &[&'static str]) -> Vec<Command<'static>> {
	names.iter().map(|name| Command { name, description: None }).collect()
}

fn command_scene(t: &Tokens, s: &SceneState, list: &[Command], query: &str, active: usize) -> El {
	over_composer(t, s, command_menu(scope(t), list, query, active, SHRUNK_COMPOSER))
}

fn commands_default(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&NAMES), "", 0)
}

fn commands_described(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &DESCRIBED, "", 0)
}

fn commands_empty(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&NAMES), "zzz", 0)
}

fn commands_filtered(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&NAMES), "co", 2)
}

fn commands_keyboard_travel(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&NAMES), "", 2)
}

fn commands_long_content(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&LONG_NAMES), "", LONG_NAMES.len() - 1)
}

fn commands_query_changed(t: &Tokens, s: &SceneState) -> El {
	command_scene(t, s, &commands(&NAMES), "co", 0)
}

struct Mentioning<'a> {
	candidates: &'a [Member],
	counts: &'a [(&'a str, usize)],
	lead: &'a str,
	query: &'a str,
	active: usize,
}

const MENTIONING: Mentioning =
	Mentioning { candidates: &CONVERSATION, counts: &[], lead: ATLAS, query: "", active: 0 };

fn mention_scene(t: &Tokens, s: &SceneState, mentioning: Mentioning) -> El {
	let candidates = mentionables(mentioning.candidates);
	let menu = MentionMenu {
		candidates: &candidates,
		counts: mentioning.counts,
		lead: Some(mentioning.lead),
		space: None,
		query: mentioning.query,
		active: mentioning.active,
		room: SHRUNK_COMPOSER,
	};
	over_composer(t, s, mention_menu(scope(t), &menu))
}

fn mentions_default(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, MENTIONING)
}

fn mentions_filtered(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { query: "a", active: 1, ..MENTIONING })
}

fn mentions_lead_filtered_out(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { query: "e", ..MENTIONING })
}

fn mentions_keyboard_travel(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { active: 2, ..MENTIONING })
}

fn mentions_space_opened(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { candidates: &SPACE, ..MENTIONING })
}

fn mentions_space_queried(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { candidates: &SPACE, query: "AR", active: 1, ..MENTIONING })
}

fn mentions_space_matches_inside(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { candidates: &SPACE, query: "atl", ..MENTIONING })
}

fn mentions_space_keyboard_travel(t: &Tokens, s: &SceneState) -> El {
	let reached = super::menus::mention_matches(&mentionables(&SPACE), "e").len();
	mention_scene(
		t,
		s,
		Mentioning { candidates: &SPACE, query: "e", active: reached - 1, ..MENTIONING },
	)
}

fn mentions_long_content(t: &Tokens, s: &SceneState) -> El {
	mention_scene(
		t,
		s,
		Mentioning { candidates: &LONG_NAMED_SPACE, lead: RELEASE, query: "e", ..MENTIONING },
	)
}

fn mentions_query_changed(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { query: "do", ..MENTIONING })
}

fn mentions_empty(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { query: "zzz", ..MENTIONING })
}

fn mentions_counted(t: &Tokens, s: &SceneState) -> El {
	mention_scene(
		t,
		s,
		Mentioning { counts: &[("bot-basile", 1), ("bot-clemence", 3)], ..MENTIONING },
	)
}

fn mentions_counted_lead(t: &Tokens, s: &SceneState) -> El {
	mention_scene(t, s, Mentioning { counts: &[(ATLAS, 2)], ..MENTIONING })
}

fn mentions_counted_long_name(t: &Tokens, s: &SceneState) -> El {
	mention_scene(
		t,
		s,
		Mentioning { candidates: &CROWDED, counts: &[(RELEASE, 4)], query: "notes", ..MENTIONING },
	)
}

fn mentions_counted_titled(t: &Tokens, s: &SceneState) -> El {
	mention_scene(
		t,
		s,
		Mentioning { candidates: &SPACE, counts: &[(ATLAS, 2)], query: "atl", ..MENTIONING },
	)
}

fn picker_stage(t: &Tokens, layers: Vec<El>) -> El {
	let trigger = library_trigger(scope(t), Reach::Live, !layers.is_empty());
	let page = col()
		.w_full()
		.h_full()
		.padding(SPACING * 6.0)
		.justify_end()
		.fill(t.background)
		.child(row().child(trigger));
	rune_kit::root(page, layers)
}

fn in_blue(t: &Tokens) -> Tokens {
	t.in_space(Some(BLUE))
}

fn picker_highlighted_row(t: &Tokens, _: &SceneState) -> El {
	let t = &in_blue(t);
	let query = TextEdit::new("");
	let picker = LibraryPicker { documents: &DOCUMENTS, query: &query, highlighted: Some(1) };
	picker_stage(t, vec![library_picker(scope(t), &picker, draft)])
}

fn picker_closed(t: &Tokens, _: &SceneState) -> El {
	picker_stage(&in_blue(t), Vec::new())
}

fn queue(t: &Tokens, items: &[QueuedMessage], focused: Option<&str>) -> El {
	let queue = PromptQueue {
		items,
		agent: "Atlas",
		reader: "Sam",
		reader_picture: None,
		width: QUEUE_WIDTH,
		focused,
	};
	centered(t, col().w(QUEUE_WIDTH).children(prompt_queue(scope(t), &queue)), Vec::new())
}

fn queue_default(t: &Tokens, _: &SceneState) -> El {
	queue(t, &QUEUED_ONE, None)
}

fn queue_row_hovered(t: &Tokens, _: &SceneState) -> El {
	queue(t, &QUEUED_TWO, None)
}

fn queue_row_focused(t: &Tokens, _: &SceneState) -> El {
	queue(t, &QUEUED_TWO, Some(QUEUED_TWO[0].id))
}

const REPLY_QUOTE: ReplyQuote = ReplyQuote { author: REPLY_AUTHOR, excerpt: REPLY_EXCERPT };

fn reply_scene(t: &Tokens, s: &SceneState, quote: Option<&ReplyQuote>) -> El {
	let inset = if quote.is_some() { SPACING * 2.0 } else { 0.0 };
	let input = with_leading(&s.edit, WIDTH - inset, attach(t, Reach::Live));
	centered(t, prompt_reply(scope(t), quote, WIDTH, composer(t, input)), Vec::new())
}

fn reply_default(t: &Tokens, s: &SceneState) -> El {
	reply_scene(t, s, Some(&REPLY_QUOTE))
}

fn reply_dismissed(t: &Tokens, s: &SceneState) -> El {
	reply_scene(t, s, None)
}

fn reply_naming(t: &Tokens, s: &SceneState) -> El {
	let toggle = text(TOGGLE_REPLY)
		.font(TextStyle { weight: 400.0, ..TEXT_BASE_MEDIUM })
		.color(t.foreground)
		.role("button")
		.label(TOGGLE_REPLY)
		.focusable(true)
		.self_start();
	let input = with_leading(&s.edit, WIDTH, attach(t, Reach::Live));
	centered(
		t,
		col().child(toggle).child(prompt_reply(scope(t), None, WIDTH, composer(t, input))),
		Vec::new(),
	)
}

fn quoted_composer(t: &Tokens, s: &SceneState, text: &str) -> El {
	let card = selection_quote(scope(t), &quote(text), Reach::Live);
	let input = PromptInput { attachments: Some(card), ..PromptInput::new(&s.edit, QUOTE_WIDTH) };
	centered(t, composer(t, input), Vec::new())
}

fn selection_default(t: &Tokens, s: &SceneState) -> El {
	quoted_composer(t, s, SELECTION)
}

fn selection_long_content(t: &Tokens, s: &SceneState) -> El {
	quoted_composer(t, s, LONG_SELECTION)
}

fn selection_narrow_long_content(t: &Tokens, _: &SceneState) -> El {
	let card = selection_quote(
		scope(t),
		&SelectionQuote { agent: LONG_AGENT, text: NARROW_SELECTION },
		Reach::Live,
	);
	centered(t, col().w(NARROW).child(card), Vec::new())
}

pub static SCENES: &[Scene] = &[
	fixed("conversation-prompt-promptattachbutton--default", CONTROL, attach_default),
	scene(
		"conversation-prompt-promptattachbutton--states",
		CONTROL,
		"",
		3,
		Pointer::EntersAtSnap(HOVERED_ATTACH_KEY),
		attach_states,
	),
	fixed("conversation-prompt-promptattachments--default", COMPOSER, attachments_default),
	fixed("conversation-prompt-promptattachments--empty", COMPOSER, attachments_empty),
	drafted(
		"conversation-prompt-promptattachments--in-composer",
		COMPOSER,
		STAGED_DRAFT,
		input_with_attach,
	),
	fixed(
		"conversation-prompt-promptattachments--long-content",
		COMPOSER,
		attachments_long_content,
	),
	fixed(
		"conversation-prompt-promptattachments--reply-excerpt",
		COMPOSER,
		attachments_reply_excerpt,
	),
	fixed(
		"conversation-prompt-promptattachments--reply-unbreakable-excerpt",
		COMPOSER,
		attachments_reply_unbreakable,
	),
	fixed(
		"conversation-prompt-promptattachments--reply-unbreakable-excerpt-in-narrow-row",
		COMPOSER,
		attachments_reply_unbreakable_narrow,
	),
	fixed(
		"conversation-prompt-promptattachments--reply-whole-message",
		COMPOSER,
		attachments_reply_whole,
	),
	fixed("conversation-prompt-promptattachments--two-replies", COMPOSER, attachments_two_replies),
	drafted("conversation-prompt-promptcommandmenu--default", MENU, SLASH, commands_default),
	drafted("conversation-prompt-promptcommandmenu--described", MENU, SLASH, commands_described),
	drafted("conversation-prompt-promptcommandmenu--empty", MENU, SLASH, commands_empty),
	drafted("conversation-prompt-promptcommandmenu--filtered", MENU, SLASH, commands_filtered),
	drafted(
		"conversation-prompt-promptcommandmenu--keyboard-travel",
		MENU,
		SLASH,
		commands_keyboard_travel,
	),
	drafted(
		"conversation-prompt-promptcommandmenu--long-content",
		MENU,
		SLASH,
		commands_long_content,
	),
	tabbed(
		"conversation-prompt-promptcommandmenu--query-changed",
		MENU,
		SLASH_QUERY,
		1,
		commands_query_changed,
	),
	tabbed("conversation-prompt-promptinput--default", COMPOSER, "", 1, input_empty),
	drafted("conversation-prompt-promptinput--drag-over", COMPOSER, DRAFT, input_with_attach),
	fixed("conversation-prompt-promptinput--empty", COMPOSER, input_empty),
	fixed("conversation-prompt-promptinput--files-only", COMPOSER, input_files_only),
	drafted(
		"conversation-prompt-promptinput--full-width-line",
		COMPOSER,
		FILLING_DRAFT,
		input_with_controls,
	),
	drafted(
		"conversation-prompt-promptinput--long-content",
		COMPOSER,
		WRAPPED_DRAFT,
		input_with_controls,
	),
	drafted(
		"conversation-prompt-promptinput--marked-from-outside",
		COMPOSER,
		DRAFT,
		input_marked_from_outside,
	),
	fixed("conversation-prompt-promptinput--offline", COMPOSER, input_offline),
	drafted("conversation-prompt-promptinput--overflow", TALL, LONG_DRAFT, input_with_controls),
	tabbed("conversation-prompt-promptinput--playground", COMPOSER, "", 1, input_empty),
	drafted("conversation-prompt-promptinput--send-disabled", COMPOSER, DRAFT, input_disabled),
	tabbed("conversation-prompt-promptinput--send-focus-visible", COMPOSER, DRAFT, 2, input_empty),
	hovered("conversation-prompt-promptinput--send-hover", COMPOSER, DRAFT, SEND_KEY, input_empty),
	fixed("conversation-prompt-promptinput--send-idle", COMPOSER, input_empty),
	tabbed("conversation-prompt-promptinput--states", PAIR, DRAFT, 3, input_states),
	fixed("conversation-prompt-promptinput--themes-at-rest", COMPOSER, input_with_controls),
	drafted(
		"conversation-prompt-promptinput--themes-disabled",
		COMPOSER,
		DRAFT,
		input_themes_disabled,
	),
	drafted("conversation-prompt-promptinput--themes-filled", COMPOSER, DRAFT, input_with_controls),
	tabbed(
		"conversation-prompt-promptinput--themes-focus-visible",
		COMPOSER,
		DRAFT,
		2,
		input_with_controls,
	),
	drafted(
		"conversation-prompt-promptinput--with-attachments",
		COMPOSER,
		DRAFT,
		input_with_attachments,
	),
	drafted("conversation-prompt-promptinput--with-controls", COMPOSER, DRAFT, input_with_controls),
	fixed("conversation-prompt-promptinput--with-long-quote", TALL, input_with_long_quote),
	drafted("conversation-prompt-promptinput--with-quote", COMPOSER, QUOTE_REPLY, input_with_quote),
	drafted(
		"conversation-prompt-promptinput--with-quote-and-attachments",
		TALL,
		DRAFT,
		input_with_quote_and_attachments,
	),
	drafted(
		"conversation-prompt-promptinput--with-quote-blocked",
		PAIR,
		DRAFT,
		input_with_quote_blocked,
	),
	fixed(
		"conversation-prompt-promptinput--with-replies-and-attachments",
		TALL,
		input_replies_and_attachments,
	),
	fixed(
		"conversation-prompt-promptlibrarypicker--highlighted-row",
		PICKER,
		picker_highlighted_row,
	),
	fixed("conversation-prompt-promptlibrarypicker--picks-on-enter", PICKER, picker_closed),
	tabbed(
		"conversation-prompt-promptlibrarypicker--reaches-files-by-keyboard",
		PICKER,
		"",
		1,
		picker_closed,
	),
	drafted("conversation-prompt-promptmentionmenu--counted", MENU, AT, mentions_counted),
	drafted(
		"conversation-prompt-promptmentionmenu--counted-again",
		MENU,
		AT,
		mentions_counted_lead,
	),
	drafted("conversation-prompt-promptmentionmenu--counted-lead", MENU, AT, mentions_counted_lead),
	drafted(
		"conversation-prompt-promptmentionmenu--counted-long-name",
		MENU,
		AT,
		mentions_counted_long_name,
	),
	drafted(
		"conversation-prompt-promptmentionmenu--counted-titled",
		MENU,
		AT,
		mentions_counted_titled,
	),
	drafted("conversation-prompt-promptmentionmenu--default", MENU, AT, mentions_default),
	drafted("conversation-prompt-promptmentionmenu--empty", MENU, AT, mentions_empty),
	drafted("conversation-prompt-promptmentionmenu--filtered", MENU, AT, mentions_filtered),
	drafted(
		"conversation-prompt-promptmentionmenu--in-dark-theme",
		MENU,
		AT,
		mentions_space_opened,
	),
	drafted(
		"conversation-prompt-promptmentionmenu--keyboard-travel",
		MENU,
		AT,
		mentions_keyboard_travel,
	),
	drafted("conversation-prompt-promptmentionmenu--lead", MENU, AT, mentions_default),
	drafted(
		"conversation-prompt-promptmentionmenu--lead-filtered-out",
		MENU,
		AT,
		mentions_lead_filtered_out,
	),
	drafted("conversation-prompt-promptmentionmenu--long-content", MENU, AT, mentions_long_content),
	drafted("conversation-prompt-promptmentionmenu--pictured", MENU, AT, mentions_default),
	tabbed(
		"conversation-prompt-promptmentionmenu--query-changed",
		MENU,
		AT_QUERY,
		1,
		mentions_query_changed,
	),
	drafted(
		"conversation-prompt-promptmentionmenu--space-keyboard-travel",
		MENU,
		AT,
		mentions_space_keyboard_travel,
	),
	drafted(
		"conversation-prompt-promptmentionmenu--space-matches-inside",
		MENU,
		AT,
		mentions_space_matches_inside,
	),
	drafted("conversation-prompt-promptmentionmenu--space-opened", MENU, AT, mentions_space_opened),
	drafted(
		"conversation-prompt-promptmentionmenu--space-queried",
		MENU,
		AT,
		mentions_space_queried,
	),
	fixed("conversation-prompt-promptqueue--default", QUEUE, queue_default),
	hovered(
		"conversation-prompt-promptqueue--row-hovered",
		QUEUE,
		"",
		SECOND_QUEUED_KEY,
		queue_row_hovered,
	),
	drafted("conversation-prompt-promptreply--alignment", COMPOSER, REPLY_PROMPT, reply_default),
	drafted("conversation-prompt-promptreply--default", COMPOSER, REPLY_PROMPT, reply_default),
	drafted("conversation-prompt-promptreply--dismissed", COMPOSER, REPLY_PROMPT, reply_dismissed),
	tabbed("conversation-prompt-promptreply--naming", COMPOSER, NAMED_PROMPT, 3, reply_naming),
	fixed("conversation-prompt-selectionquote--default", QUOTED, selection_default),
	fixed("conversation-prompt-selectionquote--long-content", QUOTED, selection_long_content),
	fixed(
		"conversation-prompt-selectionquote--narrow-long-content",
		NARROW_CARD,
		selection_narrow_long_content,
	),
	tabbed(
		"conversation-prompt-promptinput--focus-within-empty",
		COMPOSER,
		"",
		1,
		input_focused_empty,
	),
	drafted(
		"conversation-prompt-promptinput--focused-by-app-with-draft",
		COMPOSER,
		DRAFT,
		input_focused_by_app_with_draft,
	),
	tabbed("conversation-prompt-promptqueue--row-focused", QUEUE, "", 2, queue_row_focused),
];
