use rune::{El, TextEdit, col};

use super::SceneState;
use crate::hues::Preset;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::strings::Language;
use crate::strings::bots::{danger, dialog};
use crate::surfaces::s10_agent_settings::agent::{
	self, Danger, Effort, General, Identity, Instructions, Memory, Mode, Model, OutputStyle,
	Permissions, Rules, Runtime,
};
use crate::surfaces::s10_agent_settings::history::{
	self, Author, Authors, Change, ChangeFile, ChangePage, Day, HistoryList,
};
use crate::surfaces::s10_agent_settings::shell::{self, Entry, Frame, MENU_DEFAULT_WIDTH, Menu};
use crate::surfaces::s10_agent_settings::skills::{
	self, FileFailure, OpenedFile, Section, SkillEditor, SkillEffort, SkillField, SkillFiles,
	SkillItem, SkillTexts, Switches,
};
use crate::surfaces::s10_agent_settings::{
	Confirm, Density, Event, Field, Host, Picker, RuleList, confirmation,
};
use crate::tokens::{SPACING, Tokens};

pub(super) const PANEL: (f32, f32) = (640.0, 640.0);
pub(super) const FILES: (f32, f32) = (616.0, 488.0);
pub(super) const DIALOG: (f32, f32) = (960.0, 640.0);
pub(super) const PAGE: (f32, f32) = (832.0, 544.0);
pub(super) const SCREEN: (f32, f32) = (1180.0, 760.0);

const IDENTITY_WIDTH: f32 = SPACING * 120.0;
const PERMISSIONS_WIDTH: f32 = SPACING * 112.0;
const FILES_INSET: f32 = SPACING * 5.0;
const MENU_MIN_WIDTH: f32 = SPACING * 56.0;
const MENU_MAX_WIDTH: f32 = SPACING * 104.0;
const FREE_HUE: f32 = 210.0;
const OWN_HUE: f32 = 320.0;

impl Host for SceneState {
	fn edit(&mut self, field: Field) -> &mut TextEdit {
		self.fields.get_mut().entry(field).or_insert_with(|| TextEdit::new(""))
	}

	fn emit(&mut self, _: Event) {}
}

impl SceneState {
	fn seeded(&self, field: Field, text: &str) -> TextEdit {
		self.fields.borrow_mut().entry(field).or_insert_with(|| TextEdit::new(text)).clone()
	}
}

#[derive(Clone, Copy)]
enum Hue {
	None,
	Preset(Preset),
	Free(f32),
}

impl Hue {
	fn value(self) -> Option<f32> {
		match self {
			Hue::None => None,
			Hue::Preset(preset) => Some(preset.hue()),
			Hue::Free(hue) => Some(hue),
		}
	}
}

struct Agent {
	name: &'static str,
	title: &'static str,
	instructions: &'static str,
	hue: Hue,
	models: &'static [Model<'static>],
	model: &'static str,
	effort: Option<Effort>,
	mode: Mode,
	allow: &'static [&'static str],
	ask: &'static [&'static str],
	deny: &'static [&'static str],
	working: bool,
	pictured: bool,
}

const LOW_TO_HIGH: &[Effort] = &[Effort::Low, Effort::Medium, Effort::High];
const EVERY_EFFORT: &[Effort] = &Effort::ALL;

const CLAUDE_MODELS: &[Model] = &[
	Model { label: "Claude Sonnet 4.5", value: "sonnet-4-5", efforts: LOW_TO_HIGH },
	Model { label: "Claude Opus 4.1", value: "opus-4-1", efforts: EVERY_EFFORT },
	Model { label: "Claude Haiku 4.5", value: "haiku-4-5", efforts: &[] },
];

const SCREEN_MODELS: &[Model] = &[
	Model { label: "Claude Sonnet 4.6", value: "sonnet-4-6", efforts: LOW_TO_HIGH },
	Model { label: "Claude Haiku 4.5", value: "haiku-4-5", efforts: &[] },
];

const NEST_MODELS: &[Model] = &[
	Model { label: "Nest Sonnet 4.5", value: "nest-sonnet-4-5", efforts: LOW_TO_HIGH },
	Model { label: "Nest Opus 4.1", value: "nest-opus-4-1", efforts: EVERY_EFFORT },
	Model { label: "Nest Haiku 4.5", value: "nest-haiku-4-5", efforts: &[] },
];

const NEST_KEEPER: Agent = Agent {
	name: "Nest Keeper",
	title: "Repository archivist",
	instructions: "You are the Nest Keeper.\n\nEvery visual belongs to packages/ui. The app composes, it never draws.\n\nBefore proposing a component, search the package for one that already does the job. Answer with the file you would touch, then the change.",
	hue: Hue::Preset(Preset::Blue),
	models: CLAUDE_MODELS,
	model: "sonnet-4-5",
	effort: Some(Effort::High),
	mode: Mode::Auto,
	allow: &[],
	ask: &[],
	deny: &["Bash", "Edit", "Write", "NotebookEdit"],
	working: false,
	pictured: false,
};

const NEW_AGENT: Agent = Agent {
	name: "",
	title: "",
	instructions: "",
	hue: Hue::None,
	model: "",
	effort: None,
	deny: &[],
	..NEST_KEEPER
};

const JUNIPER: Agent = Agent {
	name: "Juniper",
	title: "Writer",
	instructions: "You write release notes and changelogs for the Studio team. Group changes by area, lead with what a reader can now do, and keep each line under twenty words. Ask before publishing anything.",
	hue: Hue::Preset(Preset::Green),
	models: SCREEN_MODELS,
	model: "sonnet-4-6",
	effort: Some(Effort::Medium),
	mode: Mode::AcceptEdits,
	allow: &["Read", "Bash(git log:*)"],
	ask: &["Bash(git push:*)"],
	deny: &[],
	working: false,
	pictured: false,
};

const MEMORY: &str = "Ada ships on Thursdays and reviews on Fridays.\n\nEvery visual belongs to packages/ui — she pushes back when a div lands in the app.\n\nShe reads diffs before prose, so lead with the file.";
const READER: &str = "Ada Martin";

fn shown_name(agent: &Agent) -> &'static str {
	if agent.name.is_empty() { dialog::UNTITLED.text(Language::En) } else { agent.name }
}

fn identity<'a>(agent: &Agent, s: &'a SceneState) -> Identity<'a> {
	Identity {
		name: shown_name(agent),
		hue: agent.hue.value(),
		picture: if agent.pictured { s.picture.as_ref() } else { None },
		working: agent.working,
	}
}

#[derive(Clone, Copy, PartialEq)]
pub(super) enum Extra {
	None,
	Memory,
	LongSkill,
}

const BOT_SKILLS: &[SkillItem] = &[
	SkillItem {
		id: "release-notes",
		name: "release-notes",
		description: "How this project words a changelog entry",
		preloaded: true,
		system: false,
	},
	SkillItem {
		id: "commit-style",
		name: "commit-style",
		description: "Conventional commits, one concern per commit",
		preloaded: false,
		system: false,
	},
	SkillItem {
		id: "review-checklist",
		name: "review-checklist",
		description: "",
		preloaded: false,
		system: false,
	},
];

const LONG_SKILL: SkillItem = SkillItem {
	id: "incident-response-runbook",
	name: "incident-response-runbook-for-the-nightly-ingestion-pipeline",
	description: "Everything to do, in order, when the nightly ingestion pipeline stops answering — who to tell, what to read first, and what may never be replayed twice",
	preloaded: true,
	system: false,
};

const SYSTEM_SKILL: SkillItem = SkillItem {
	id: "environment",
	name: "environment",
	description: "What this machine is, as the host reads it",
	preloaded: true,
	system: true,
};

fn agent_panel(
	t: &Tokens,
	s: &SceneState,
	agent: &Agent,
	entry: Entry,
	density: Density,
	extra: Extra,
) -> El {
	let name = s.seeded(Field::Name, agent.name);
	let title = s.seeded(Field::Title, agent.title);
	let prompt = s.seeded(Field::Instructions, agent.instructions);
	let memory = s.seeded(Field::Memory, MEMORY);
	let allow = s.seeded(Field::Rule(RuleList::Allow), "");
	let ask = s.seeded(Field::Rule(RuleList::Ask), "");
	let deny = s.seeded(Field::Rule(RuleList::Deny), "");
	match entry {
		Entry::General => {
			agent::general::<SceneState>(t, density, &General { name: &name, title: &title })
		}
		Entry::Appearance => agent::appearance::<SceneState>(t, density, &identity(agent, s)),
		Entry::Instructions => agent::instructions::<SceneState>(
			t,
			density,
			&Instructions {
				instructions: &prompt,
				memory: (extra == Extra::Memory).then_some(Memory { edit: &memory, saved: true }),
			},
		),
		Entry::Skills => {
			let mut listed: Vec<SkillItem> = BOT_SKILLS.iter().map(copy_skill).collect();
			if extra == Extra::LongSkill {
				listed.push(copy_skill(&LONG_SKILL));
			}
			skills::skills_panel::<SceneState>(t, density, Some(&listed))
		}
		Entry::History => {
			history::history_panel::<SceneState>(t, density, &history_list(&DAYS, agent))
		}
		Entry::Approvals => agent::permissions::<SceneState>(
			t,
			density,
			&Permissions {
				mode: agent.mode,
				allow: Rules { items: agent.allow, draft: &allow, refused: false },
				ask: Rules { items: agent.ask, draft: &ask, refused: false },
				deny: Rules { items: agent.deny, draft: &deny, refused: false },
				picking: false,
			},
		),
		Entry::Runtime => agent::runtime::<SceneState>(
			t,
			density,
			&Runtime {
				models: agent.models,
				model: agent.model,
				effort: agent.effort,
				output_style: OutputStyle::Concise,
				picking: None,
			},
		),
		Entry::Danger => agent::danger_zone::<SceneState>(t, density, &Danger::agent()),
		Entry::Applications | Entry::Secrets => crate::widgets::not_drawn(
			t,
			entry.label(),
			"Belongs to OPE-1985: the Applications and Secrets panes are not part of the S10 views.",
		),
	}
}

fn copy_skill(skill: &SkillItem<'static>) -> SkillItem<'static> {
	SkillItem { ..*skill }
}

fn frame(content: El, layers: Vec<El>) -> El {
	rune_kit::root(content, layers)
}

fn ground(t: &Tokens) -> El {
	col().w_full().h_full().fill(t.background)
}

fn padded(t: &Tokens, width: Option<f32>, body: El) -> El {
	let column = col().w_full().grow(1.0).child(body);
	let column = match width {
		Some(width) => column.max_w(width),
		None => column,
	};
	frame(
		col().w_full().h_full().fill(t.background).padding(SPACING * 4.0).child(column),
		Vec::new(),
	)
}

fn dialog_frame<'a>(agent: &Agent, s: &'a SceneState, has_history: bool) -> Frame<'a> {
	Frame { identity: identity(agent, s), has_history }
}

fn dialog_scene(
	t: &Tokens,
	s: &SceneState,
	agent: &Agent,
	entry: Entry,
	extra: Extra,
	has_history: bool,
	layers: Vec<El>,
) -> El {
	let body = agent_panel(t, s, agent, entry, Density::Dialog, extra);
	let body = if entry == Entry::History {
		col().w_full().grow(1.0).padding(SPACING * 5.0).child(body)
	} else {
		shell::scrolling_panel(body)
	};
	let mut all =
		vec![shell::dialog::<SceneState>(t, &dialog_frame(agent, s, has_history), entry, body)];
	all.extend(layers);
	frame(ground(t), all)
}

fn dialog_over(
	t: &Tokens,
	s: &SceneState,
	agent: &Agent,
	entry: Entry,
	page: El,
	layers: Vec<El>,
) -> El {
	let mut all = vec![shell::dialog::<SceneState>(t, &dialog_frame(agent, s, true), entry, page)];
	all.extend(layers);
	frame(ground(t), all)
}

pub(super) fn dialog_entry(t: &Tokens, s: &SceneState, entry: Entry) -> El {
	dialog_scene(t, s, &NEST_KEEPER, entry, Extra::None, true, Vec::new())
}

pub(super) fn dialog_free_hue(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(
		t,
		s,
		&Agent { hue: Hue::Free(FREE_HUE), ..NEST_KEEPER },
		Entry::Appearance,
		Extra::None,
		true,
		Vec::new(),
	)
}

pub(super) fn dialog_with_memory(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(t, s, &NEST_KEEPER, Entry::Instructions, Extra::Memory, true, Vec::new())
}

pub(super) fn dialog_empty(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(t, s, &NEW_AGENT, Entry::General, Extra::None, true, Vec::new())
}

pub(super) fn dialog_without_history(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(t, s, &NEST_KEEPER, Entry::General, Extra::None, false, Vec::new())
}

pub(super) fn dialog_working(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(
		t,
		s,
		&Agent { working: true, pictured: true, ..NEST_KEEPER },
		Entry::General,
		Extra::None,
		true,
		Vec::new(),
	)
}

pub(super) fn dialog_long_skill(t: &Tokens, s: &SceneState) -> El {
	dialog_scene(t, s, &NEST_KEEPER, Entry::Skills, Extra::LongSkill, true, Vec::new())
}

pub(super) fn dialog_closed(t: &Tokens, _: &SceneState) -> El {
	frame(ground(t), Vec::new())
}

pub(super) fn dialog_server_open(t: &Tokens, s: &SceneState) -> El {
	let page = col().w_full().grow(1.0).padding(SPACING * 5.0).child(crate::widgets::not_drawn(
		t,
		"MCP server editor",
		"Out of scope for OPE-1984: the MCP server editor and launch stories stay with the Applications pane.",
	));
	dialog_over(t, s, &NEST_KEEPER, Entry::Applications, page, Vec::new())
}

pub(super) fn dialog_skill_open(t: &Tokens, s: &SceneState) -> El {
	let texts = texts_of(s, &DETAILED_SKILL);
	dialog_over(
		t,
		s,
		&NEST_KEEPER,
		Entry::Skills,
		skills::skill_editor::<SceneState>(t, &detailed_editor(&texts, Section::Instructions)),
		Vec::new(),
	)
}

pub(super) fn dialog_leaving_skill(t: &Tokens, s: &SceneState) -> El {
	let texts = texts_of(s, &DETAILED_SKILL);
	let editor = SkillEditor { unsaved: true, ..detailed_editor(&texts, Section::Instructions) };
	dialog_over(
		t,
		s,
		&NEST_KEEPER,
		Entry::Skills,
		skills::skill_editor::<SceneState>(t, &editor),
		vec![confirmation::<SceneState>(t, Confirm::LeaveSkill)],
	)
}

pub(super) fn dialog_history_change(t: &Tokens, s: &SceneState) -> El {
	dialog_over(
		t,
		s,
		&NEST_KEEPER,
		Entry::History,
		history::change_page::<SceneState>(t, &change(Some(ONE_FILE), false, 0)),
		Vec::new(),
	)
}

pub(super) fn dialog_pushed_pages(t: &Tokens, s: &SceneState) -> El {
	dialog_over(
		t,
		s,
		&NEST_KEEPER,
		Entry::History,
		history::change_page::<SceneState>(t, &change(Some(MANY_FILES), false, 0)),
		Vec::new(),
	)
}

fn menu<'a>(agent: &Agent, s: &'a SceneState, back: &'a str, width: f32) -> Menu<'a> {
	Menu { back, identity: identity(agent, s), width, has_history: true }
}

fn screen_scene(
	t: &Tokens,
	s: &SceneState,
	agent: &Agent,
	entry: Entry,
	back: &str,
	width: f32,
	layers: Vec<El>,
) -> El {
	let extra = if entry == Entry::Instructions { Extra::Memory } else { Extra::None };
	let page = agent_panel(t, s, agent, entry, Density::Page, extra);
	frame(shell::screen::<SceneState>(t, &menu(agent, s, back, width), entry, page), layers)
}

pub(super) fn screen_entry(t: &Tokens, s: &SceneState, entry: Entry) -> El {
	screen_scene(t, s, &JUNIPER, entry, Menu::back_to_agents(), MENU_DEFAULT_WIDTH, Vec::new())
}

pub(super) fn screen_free_hue(t: &Tokens, s: &SceneState) -> El {
	screen_scene(
		t,
		s,
		&Agent { hue: Hue::Free(FREE_HUE), ..JUNIPER },
		Entry::Appearance,
		Menu::back_to_agents(),
		MENU_DEFAULT_WIDTH,
		Vec::new(),
	)
}

pub(super) fn screen_back_to_conversations(t: &Tokens, s: &SceneState) -> El {
	screen_scene(
		t,
		s,
		&JUNIPER,
		Entry::General,
		Menu::back_to_conversations(),
		MENU_DEFAULT_WIDTH,
		Vec::new(),
	)
}

pub(super) fn screen_minimum_width(t: &Tokens, s: &SceneState) -> El {
	screen_scene(t, s, &JUNIPER, Entry::General, Menu::back_to_agents(), MENU_MIN_WIDTH, Vec::new())
}

pub(super) fn screen_maximum_width(t: &Tokens, s: &SceneState) -> El {
	screen_scene(t, s, &JUNIPER, Entry::General, Menu::back_to_agents(), MENU_MAX_WIDTH, Vec::new())
}

pub(super) fn screen_delete_failed(t: &Tokens, s: &SceneState) -> El {
	let failed = toast(
		t,
		Toast {
			kind: ToastType::Error,
			title: danger::FAILED.text(Language::En),
			description: "",
			action: None,
		},
	);
	let notice =
		col().w_full().h_full().padding(SPACING * 4.0).items_end().justify_end().child(failed);
	screen_scene(
		t,
		s,
		&JUNIPER,
		Entry::Danger,
		Menu::back_to_agents(),
		MENU_DEFAULT_WIDTH,
		vec![notice],
	)
}

pub(super) fn general_fields(t: &Tokens, s: &SceneState) -> El {
	padded(t, None, agent_panel(t, s, &NEST_KEEPER, Entry::General, Density::Dialog, Extra::None))
}

pub(super) fn instructions_fields(t: &Tokens, s: &SceneState) -> El {
	padded(
		t,
		None,
		agent_panel(t, s, &NEST_KEEPER, Entry::Instructions, Density::Dialog, Extra::None),
	)
}

#[derive(Clone, Copy)]
pub(super) enum Look {
	Default,
	Pictured,
	Red,
	NoColour,
	OwnHue,
	Working,
}

const ATLAS: Agent = Agent { name: "Atlas", hue: Hue::Preset(Preset::Blue), ..NEST_KEEPER };

pub(super) fn identity_fields(t: &Tokens, s: &SceneState, look: Look) -> El {
	let agent = match look {
		Look::Default => ATLAS,
		Look::Pictured => Agent { pictured: true, ..ATLAS },
		Look::Red => Agent { hue: Hue::Preset(Preset::Red), ..ATLAS },
		Look::NoColour => Agent { hue: Hue::None, ..ATLAS },
		Look::OwnHue => Agent { hue: Hue::Free(OWN_HUE), ..ATLAS },
		Look::Working => Agent { working: true, ..ATLAS },
	};
	identity_scene(t, s, &agent)
}

fn identity_scene(t: &Tokens, s: &SceneState, agent: &Agent) -> El {
	let card = col()
		.w(IDENTITY_WIDTH)
		.padding(SPACING * 6.0)
		.radius(crate::tokens::RADIUS_2XL)
		.border(1.0, t.border)
		.fill(t.background)
		.child(agent::appearance::<SceneState>(t, Density::Dialog, &identity(agent, s)));
	frame(col().w_full().h_full().fill(t.background).center().child(card), Vec::new())
}

pub(super) fn danger_zone(t: &Tokens, _: &SceneState) -> El {
	padded(t, None, danger_card(t, None))
}

pub(super) fn danger_zone_confirming(t: &Tokens, _: &SceneState) -> El {
	frame(
		col()
			.w_full()
			.h_full()
			.fill(t.background)
			.padding(SPACING * 4.0)
			.child(danger_card(t, None)),
		vec![confirmation::<SceneState>(t, Confirm::DeleteAgent("Nest Keeper"))],
	)
}

pub(super) fn danger_zone_inert(t: &Tokens, _: &SceneState) -> El {
	padded(t, None, danger_card(t, Some("You can’t delete your last space.")))
}

fn danger_card(t: &Tokens, reason: Option<&str>) -> El {
	let (action, description) = match reason {
		Some(_) => (
			"Delete space",
			"Its avatar, instructions and working directory go with it. This cannot be undone.",
		),
		None => (
			danger::DELETE.text(Language::En),
			"Its avatar, instructions and working directory go with it. This cannot be undone.",
		),
	};
	agent::danger_zone::<SceneState>(
		t,
		Density::Dialog,
		&Danger { action, description, disabled_reason: reason },
	)
}

pub(super) fn memory_panel(t: &Tokens, s: &SceneState) -> El {
	memory_scene(t, s, MEMORY, Vec::new())
}

pub(super) fn memory_empty(t: &Tokens, s: &SceneState) -> El {
	memory_scene(t, s, "", Vec::new())
}

pub(super) fn memory_clearing(t: &Tokens, s: &SceneState) -> El {
	memory_scene(t, s, MEMORY, vec![confirmation::<SceneState>(t, Confirm::ClearMemory)])
}

fn memory_scene(t: &Tokens, s: &SceneState, memory: &str, layers: Vec<El>) -> El {
	let prompt = s.seeded(Field::Instructions, NEST_KEEPER.instructions);
	let memory = s.seeded(Field::Memory, memory);
	let body = agent::instructions::<SceneState>(
		t,
		Density::Dialog,
		&Instructions {
			instructions: &prompt,
			memory: Some(Memory { edit: &memory, saved: true }),
		},
	);
	frame(col().w_full().h_full().fill(t.background).padding(SPACING * 5.0).child(body), layers)
}

const PLAYGROUND_ALLOW: &[&str] = &["Read", "Bash(git status:*)"];

pub(super) fn permissions_scene(
	t: &Tokens,
	s: &SceneState,
	mode: Option<Mode>,
	picking: bool,
	refused: bool,
) -> El {
	{
		let allow_draft = s.seeded(Field::Rule(RuleList::Allow), "");
		let ask_draft = s.seeded(Field::Rule(RuleList::Ask), "");
		let deny_draft =
			s.seeded(Field::Rule(RuleList::Deny), if refused { "rm -rf /" } else { "" });
		let (allow, deny) = match mode {
			Some(_) => (&[][..], &[][..]),
			None => (PLAYGROUND_ALLOW, NEST_KEEPER.deny),
		};
		let body = agent::permissions::<SceneState>(
			t,
			Density::Dialog,
			&Permissions {
				mode: mode.unwrap_or(Mode::Auto),
				allow: Rules { items: allow, draft: &allow_draft, refused: false },
				ask: Rules { items: &[], draft: &ask_draft, refused: false },
				deny: Rules { items: deny, draft: &deny_draft, refused },
				picking,
			},
		);
		padded(t, Some(PERMISSIONS_WIDTH), body)
	}
}

pub(super) struct RuntimeCase {
	pub models: &'static [Model<'static>],
	pub model: &'static str,
	pub effort: Option<Effort>,
	pub style: OutputStyle,
	pub picking: bool,
}

pub(super) const RUNTIME: RuntimeCase = RuntimeCase {
	models: NEST_MODELS,
	model: "nest-sonnet-4-5",
	effort: None,
	style: OutputStyle::Concise,
	picking: false,
};

pub(super) fn runtime_scene(t: &Tokens, case: &RuntimeCase) -> El {
	padded(
		t,
		Some(PERMISSIONS_WIDTH),
		agent::runtime::<SceneState>(
			t,
			Density::Dialog,
			&Runtime {
				models: case.models,
				model: case.model,
				effort: case.effort,
				output_style: case.style,
				picking: case.picking.then_some(Picker::Model),
			},
		),
	)
}

const ADDED_SKILL_PATCH: &str = "diff --git a/skills/release-notes/SKILL.md b/skills/release-notes/SKILL.md\nnew file mode 100644\nindex 0000000..e69de29\n--- /dev/null\n+++ b/skills/release-notes/SKILL.md\n@@ -0,0 +1,5 @@\n+---\n+name: release-notes\n+description: How this project words a changelog entry\n+---\n+One line per change, in the past tense.";
const MODEL_PATCH: &str = "diff --git a/agent.json b/agent.json\nindex 9f2ad41..6d5be07 100644\n--- a/agent.json\n+++ b/agent.json\n@@ -1,5 +1,5 @@\n {\n   \"name\": \"Nest Keeper\",\n-  \"model\": \"haiku-4-5\",\n+  \"model\": \"sonnet-4-5\",\n   \"changesNothing\": false\n }";
const WIDE_LINE_PATCH: &str = "diff --git a/AGENTS.md b/AGENTS.md\nindex 8b40d19..a71c904 100644\n--- a/AGENTS.md\n+++ b/AGENTS.md\n@@ -1,3 +1,3 @@\n You are the Nest Keeper.\n-Answer with the file you would touch.\n+Answer with the file you would touch, then the change it needs, then the one sentence a reader who has never opened this repository would need in order to understand why that file and not another one\n Keep every answer short.";
const UNREADABLE_PATCH: &str = "The bundle was restored from a snapshot rather than from a commit, so there is no patch to read here — only the note the host wrote in its place.";
const DEEP_PATH_PATCH: &str = "diff --git a/skills/release-notes/references/wording/house-style.md b/skills/release-notes/references/wording/house-style.md\nindex 2f1b904..c40de81 100644\n--- a/skills/release-notes/references/wording/house-style.md\n+++ b/skills/release-notes/references/wording/house-style.md\n@@ -1,3 +1,3 @@\n # House style\n \n-List the pull requests that landed.\n+Name what changed for the reader, never the pull request that carried it.";

pub(super) const PATCHES: [&str; 4] =
	[MODEL_PATCH, ADDED_SKILL_PATCH, WIDE_LINE_PATCH, UNREADABLE_PATCH];

pub(super) fn commit_diff(t: &Tokens, patch: &str) -> El {
	padded(t, None, history::commit_diff(t, patch))
}

const ONE_FILE: &[ChangeFile] = &[ChangeFile { path: "AGENTS.md", patch: WIDE_LINE_PATCH }];
const MANY_FILES: &[ChangeFile] = &[
	ChangeFile { path: "AGENTS.md", patch: WIDE_LINE_PATCH },
	ChangeFile {
		path: "skills/release-notes/references/wording/house-style.md",
		patch: DEEP_PATH_PATCH,
	},
	ChangeFile { path: "skills/release-notes/SKILL.md", patch: ADDED_SKILL_PATCH },
	ChangeFile { path: "agent.json", patch: MODEL_PATCH },
];

fn change(
	files: Option<&'static [ChangeFile<'static>]>,
	failed: bool,
	retouches: usize,
) -> ChangePage<'static> {
	let retouched = retouches > 0;
	ChangePage {
		title: if retouched {
			"Tightened the wording of the instructions"
		} else {
			"Rewrote the instructions"
		},
		author: "Nest Keeper",
		date: "Today, 09:42",
		reason: Some(if retouched {
			"Four passes over the same paragraph, kept as one change."
		} else {
			"The notes were listing pull requests instead of what actually changed."
		}),
		retouches,
		files,
		failed,
		chosen: None,
	}
}

#[derive(Clone, Copy)]
pub(super) enum ChangeCase {
	Default,
	Many,
	Empty,
	Loading,
	Error,
	Retouched,
}

pub(super) fn change_page(t: &Tokens, case: ChangeCase) -> El {
	let shown = match case {
		ChangeCase::Default => change(Some(ONE_FILE), false, 0),
		ChangeCase::Many => change(Some(MANY_FILES), false, 0),
		ChangeCase::Empty => change(Some(&[]), false, 0),
		ChangeCase::Loading => change(None, false, 0),
		ChangeCase::Error => change(Some(&[]), true, 0),
		ChangeCase::Retouched => change(Some(MANY_FILES), false, 4),
	};
	page(t, history::change_page::<SceneState>(t, &shown))
}

fn page(t: &Tokens, body: El) -> El {
	frame(col().w_full().h_full().fill(t.popover).child(body), Vec::new())
}

const DAYS: [Day; 3] = [
	Day {
		label: "Today",
		changes: &[
			Change {
				id: "change-6",
				author: Author::Agent,
				sentence: "Switched the model to Claude Sonnet 4.5",
				detail: Some("The runs were being cut short on the smaller model."),
				time: "09:42",
				retouches: 0,
				undone: false,
			},
			Change {
				id: "change-5",
				author: Author::Agent,
				sentence: "Tightened the wording of the instructions",
				detail: Some("Four passes over the same paragraph, kept as one change."),
				time: "09:12",
				retouches: 4,
				undone: false,
			},
			Change {
				id: "change-4",
				author: Author::You,
				sentence: "Added the release-notes skill",
				detail: None,
				time: "08:15",
				retouches: 0,
				undone: false,
			},
		],
	},
	Day {
		label: "Yesterday",
		changes: &[
			Change {
				id: "change-3",
				author: Author::You,
				sentence: "Raised the tool budget to twelve calls",
				detail: None,
				time: "17:04",
				retouches: 0,
				undone: true,
			},
			Change {
				id: "change-2",
				author: Author::You,
				sentence: "Rewrote the instructions",
				detail: Some("The agent names the file it would touch before it moves."),
				time: "10:21",
				retouches: 0,
				undone: false,
			},
		],
	},
	Day {
		label: "19 February",
		changes: &[Change {
			id: "change-1",
			author: Author::Agent,
			sentence: "Created the bundle",
			detail: None,
			time: "14:08",
			retouches: 0,
			undone: false,
		}],
	},
];

const LONG_SENTENCE: &str = "Rewrote the instructions so the agent names the file it would touch, says why that file and not another one, and stops before it writes anything";
const LONG_DETAIL: &str = "The same sentence again, long enough that the second line has nowhere left to go either, and no break to hide behind.";

const LONG_DAYS: [Day; 1] = [Day {
	label: "Today",
	changes: &[Change {
		id: "change-long",
		author: Author::Agent,
		sentence: LONG_SENTENCE,
		detail: Some(LONG_DETAIL),
		time: "11:30",
		retouches: 0,
		undone: false,
	}],
}];

const LONG_SIGNALLED_DAYS: [Day; 1] = [Day {
	label: "Today",
	changes: &[Change {
		id: "change-long-signalled",
		author: Author::Agent,
		sentence: LONG_SENTENCE,
		detail: Some(LONG_DETAIL),
		time: "11:30",
		retouches: 4,
		undone: true,
	}],
}];

fn history_list<'a>(days: &'a [Day<'a>], agent: &'a Agent) -> HistoryList<'a> {
	HistoryList {
		days: Some(days),
		failed: false,
		oldest: "19 February 2026",
		authors: Authors { agent: agent.name, hue: agent.hue.value(), reader: READER },
		search: None,
		openable: false,
	}
}

#[derive(Clone, Copy)]
pub(super) enum HistoryCase {
	Default,
	Long,
	LongSignalled,
	Empty,
	Unreadable,
	Loading,
	Openable,
	NoMatch,
	Undoing,
}

pub(super) fn history_panel(t: &Tokens, s: &SceneState, case: HistoryCase) -> El {
	let search = s.seeded(Field::HistorySearch, "budget");
	let full = history_list(&DAYS, &NEST_KEEPER);
	let none = history_list(&[], &NEST_KEEPER);
	let (list, layers) = match case {
		HistoryCase::Default => (full, Vec::new()),
		HistoryCase::Long => (history_list(&LONG_DAYS, &NEST_KEEPER), Vec::new()),
		HistoryCase::LongSignalled => {
			(history_list(&LONG_SIGNALLED_DAYS, &NEST_KEEPER), Vec::new())
		}
		HistoryCase::Empty => (HistoryList { oldest: "", ..none }, Vec::new()),
		HistoryCase::Unreadable => (HistoryList { failed: true, ..none }, Vec::new()),
		HistoryCase::Loading => (HistoryList { days: None, ..none }, Vec::new()),
		HistoryCase::Openable => (HistoryList { openable: true, ..full }, Vec::new()),
		HistoryCase::NoMatch => (HistoryList { search: Some(&search), ..none }, Vec::new()),
		HistoryCase::Undoing => (
			full,
			vec![confirmation::<SceneState>(
				t,
				Confirm::Undo("Tightened the wording of the instructions"),
			)],
		),
	};
	history_scene(t, list, layers)
}

fn history_scene(t: &Tokens, list: HistoryList, layers: Vec<El>) -> El {
	frame(
		col()
			.w_full()
			.h_full()
			.fill(t.background)
			.padding(SPACING * 5.0)
			.child(history::history_panel::<SceneState>(t, Density::Dialog, &list)),
		layers,
	)
}

#[derive(Clone, Copy)]
pub(super) enum SkillsCase {
	Default,
	Empty,
	WithSystem,
	Long,
	Loading,
}

pub(super) fn skills_panel(t: &Tokens, case: SkillsCase) -> El {
	let listed = match case {
		SkillsCase::Default => Some(BOT_SKILLS.iter().map(copy_skill).collect()),
		SkillsCase::Empty => Some(Vec::new()),
		SkillsCase::WithSystem => {
			Some([SYSTEM_SKILL].iter().chain(BOT_SKILLS).map(copy_skill).collect())
		}
		SkillsCase::Long => Some([LONG_SKILL].iter().chain(BOT_SKILLS).map(copy_skill).collect()),
		SkillsCase::Loading => None,
	};
	skills_scene(t, listed)
}

fn skills_scene(t: &Tokens, listed: Option<Vec<SkillItem>>) -> El {
	frame(
		col()
			.w_full()
			.h_full()
			.fill(t.background)
			.padding(SPACING * 5.0)
			.child(skills::skills_panel::<SceneState>(t, Density::Dialog, listed.as_deref())),
		Vec::new(),
	)
}

struct SkillFixture {
	name: &'static str,
	description: &'static str,
	body: &'static str,
	when_to_use: &'static str,
	argument_hint: &'static str,
	arguments: &'static str,
	paths: &'static str,
	model: &'static str,
	shell: &'static str,
	agent: &'static str,
	allowed_tools: &'static str,
	disallowed_tools: &'static str,
	hooks: &'static str,
	license: &'static str,
	compatibility: &'static str,
	metadata: &'static str,
}

const BLANK_SKILL: SkillFixture = SkillFixture {
	name: "",
	description: "",
	body: "",
	when_to_use: "",
	argument_hint: "",
	arguments: "",
	paths: "",
	model: "",
	shell: "",
	agent: "",
	allowed_tools: "",
	disallowed_tools: "",
	hooks: "",
	license: "",
	compatibility: "",
	metadata: "",
};

const DETAILED_SKILL: SkillFixture = SkillFixture {
	name: "changelog-release",
	description: "Writes the changelog entry for a release from the merged pull requests",
	body: "# Changelog\n\nOne line per change, in the past tense, naming what a reader gains.",
	when_to_use: "A release is being cut and the merged pull requests since the last tag have to become one readable entry.",
	argument_hint: "[version] [--draft]",
	arguments: "version\ndraft",
	paths: "CHANGELOG.md\ndocs/releases/**/*.md",
	model: "claude-sonnet",
	shell: "/bin/zsh",
	agent: "release-writer",
	allowed_tools: "Read\nGrep\nWrite",
	disallowed_tools: "Bash",
	hooks: "{\n  \"PreToolUse\": []\n}",
	license: "MIT",
	compatibility: ">=1.4",
	metadata: "{\n  \"author\": \"Ada Martin\"\n}",
};

const CARRIED_SKILL: SkillFixture = SkillFixture {
	name: "release-notes",
	description: "How this project words a changelog entry",
	body: "# Release notes\n\nOne line per change, in the past tense, naming what a reader gains rather than what moved in the code.",
	..BLANK_SKILL
};

const LONG_SKILL_TEXT: SkillFixture = SkillFixture {
	name: "incident-response-runbook-for-the-nightly-ingestion-pipeline",
	description: "Everything to do, in order, when the nightly ingestion pipeline stops answering — who to tell, what to read first, and what may never be replayed twice",
	body: "# Incident response runbook\n\n## Before anything\n\nRead the last checkpoint before replaying a batch: a batch replayed twice is counted twice, and nothing downstream can tell the difference.\n\n## Who to tell\n\nThe on-call reader first, in the incident channel, with the batch id and the hour it stopped. Nobody else until the batch id is known — a page with no id in it is a page that gets asked for one.\n\n## What to read first\n\n1. The scheduler’s own log, for the batch that never closed.\n2. The checkpoint table, for the last sequence it wrote.\n3. The dead letter queue, for rows that were refused rather than lost.",
	..BLANK_SKILL
};

const SYSTEM_SKILL_TEXT: SkillFixture = SkillFixture {
	name: "environment",
	description: "What this machine is, as the host reads it",
	body: "# Environment\n\nPlatform: darwin 24.5.0\nShell: /bin/zsh\nGit: 2.45.2\nNode: 22.11.0\n\nThe working tree is a Turborepo monorepo. Every path below is read from the machine each time this agent starts, so nothing here is worth writing by hand.",
	..BLANK_SKILL
};

fn texts_of(s: &SceneState, skill: &SkillFixture) -> SkillTexts {
	let text = |field, value| s.seeded(Field::Skill(field), value);
	SkillTexts {
		body: text(SkillField::Body, skill.body),
		argument_hint: text(SkillField::ArgumentHint, skill.argument_hint),
		arguments: text(SkillField::Arguments, skill.arguments),
		name: text(SkillField::Name, skill.name),
		description: text(SkillField::Description, skill.description),
		when_to_use: text(SkillField::WhenToUse, skill.when_to_use),
		paths: text(SkillField::Paths, skill.paths),
		model: text(SkillField::Model, skill.model),
		shell: text(SkillField::Shell, skill.shell),
		agent: text(SkillField::Agent, skill.agent),
		allowed_tools: text(SkillField::AllowedTools, skill.allowed_tools),
		disallowed_tools: text(SkillField::DisallowedTools, skill.disallowed_tools),
		hooks: text(SkillField::Hooks, skill.hooks),
		license: text(SkillField::License, skill.license),
		compatibility: text(SkillField::Compatibility, skill.compatibility),
		metadata: text(SkillField::Metadata, skill.metadata),
	}
}

fn over_budget_texts(s: &SceneState) -> SkillTexts {
	let description = "Writes the changelog entry for a release. ".repeat(20);
	let when_to_use = "A release is being cut and nobody wants to read the diff. ".repeat(20);
	s.seeded(Field::Skill(SkillField::Description), &description);
	s.seeded(Field::Skill(SkillField::WhenToUse), &when_to_use);
	texts_of(s, &DETAILED_SKILL)
}

const DETAILED_SWITCHES: Switches =
	Switches { keep_from_agent: false, user_invocable: true, preloaded: false, background: true };

fn detailed_editor(texts: &SkillTexts, section: Section) -> SkillEditor<'_> {
	SkillEditor {
		texts,
		section,
		written: true,
		unsaved: false,
		name_refused: false,
		switches: DETAILED_SWITCHES,
		effort: Some(SkillEffort::Medium),
		fork: Some(true),
		files: None,
	}
}

#[derive(Clone, Copy)]
pub(super) enum EditorCase {
	Section(Section),
	OverBudget,
	SharedExecution,
	System,
	Empty,
	ZeroValue,
	Long,
	Leaving,
	Confirming,
	Files,
	FileOpened,
}

pub(super) fn skill_editor(t: &Tokens, s: &SceneState, case: EditorCase) -> El {
	{
		let paths = SKILL_FILE_PATHS;
		let new_path = s.seeded(Field::NewFile, "");
		let opened_text = s.seeded(Field::FileText, REFERENCE_TEXT);
		let (texts, layers) = match case {
			EditorCase::OverBudget => (over_budget_texts(s), Vec::new()),
			EditorCase::System => (texts_of(s, &SYSTEM_SKILL_TEXT), Vec::new()),
			EditorCase::Empty => (texts_of(s, &BLANK_SKILL), Vec::new()),
			EditorCase::ZeroValue => (texts_of(s, &CARRIED_SKILL), Vec::new()),
			EditorCase::Long => (texts_of(s, &LONG_SKILL_TEXT), Vec::new()),
			EditorCase::Leaving => (
				texts_of(s, &DETAILED_SKILL),
				vec![confirmation::<SceneState>(t, Confirm::LeaveSkill)],
			),
			EditorCase::Confirming => (
				texts_of(s, &DETAILED_SKILL),
				vec![confirmation::<SceneState>(t, Confirm::DeleteSkill(DETAILED_SKILL.name))],
			),
			_ => (texts_of(s, &DETAILED_SKILL), Vec::new()),
		};
		if let EditorCase::System = case {
			return page(t, skills::system_skill::<SceneState>(t, &texts));
		}
		let base = detailed_editor(&texts, Section::Instructions);
		let editor = match case {
			EditorCase::Section(section) => SkillEditor { section, ..base },
			EditorCase::OverBudget => SkillEditor { section: Section::Triggering, ..base },
			EditorCase::SharedExecution => {
				SkillEditor { section: Section::Execution, fork: None, ..base }
			}
			EditorCase::Empty => SkillEditor {
				written: false,
				switches: Switches {
					background: true,
					user_invocable: true,
					..Switches::default()
				},
				effort: None,
				fork: None,
				..base
			},
			EditorCase::ZeroValue => SkillEditor {
				switches: Switches {
					preloaded: true,
					user_invocable: true,
					background: true,
					..Switches::default()
				},
				effort: None,
				fork: None,
				..base
			},
			EditorCase::Long => {
				SkillEditor { switches: Switches { preloaded: true, ..DETAILED_SWITCHES }, ..base }
			}
			EditorCase::Leaving => SkillEditor { unsaved: true, ..base },
			EditorCase::Files => SkillEditor {
				section: Section::Files,
				files: Some(SkillFiles {
					paths: Some(paths),
					opened: None,
					new_path: &new_path,
					refusal: None,
				}),
				..base
			},
			EditorCase::FileOpened => SkillEditor {
				section: Section::Files,
				files: Some(SkillFiles {
					paths: Some(paths),
					opened: Some(OpenedFile {
						path: REFERENCE,
						text: Some(&opened_text),
						failure: None,
						unsaved: false,
					}),
					new_path: &new_path,
					refusal: None,
				}),
				..base
			},
			EditorCase::System | EditorCase::Confirming => base,
		};
		frame(
			col()
				.w_full()
				.h_full()
				.fill(t.popover)
				.child(skills::skill_editor::<SceneState>(t, &editor)),
			layers,
		)
	}
}

const SKILL_FILE_PATHS: &[&str] =
	&["examples/1.4.0.md", "reference/frontmatter.md", "scripts/collect.sh"];
const REFERENCE: &str = "reference/frontmatter.md";
const REFERENCE_TEXT: &str =
	"# Frontmatter\n\nEvery field a release entry may carry, and what each one is read for.";

#[derive(Clone, Copy)]
pub(super) enum FilesCase {
	Default,
	Empty,
	LoadingFile,
	LoadingPaths,
	Opened,
	Failed(FileFailure),
	Confirming,
}

pub(super) fn files_panel(t: &Tokens, s: &SceneState, case: FilesCase) -> El {
	{
		let new_path = s.seeded(Field::NewFile, "");
		let text = s.seeded(Field::FileText, REFERENCE_TEXT);
		let unread =
			|failure| Some(OpenedFile { path: REFERENCE, text: None, failure, unsaved: false });
		let (paths, opened, layers) = match case {
			FilesCase::Default => (Some(SKILL_FILE_PATHS), None, Vec::new()),
			FilesCase::Empty => (Some(&[][..]), None, Vec::new()),
			FilesCase::LoadingFile => (Some(SKILL_FILE_PATHS), unread(None), Vec::new()),
			FilesCase::LoadingPaths => (None, None, Vec::new()),
			FilesCase::Opened => (
				Some(SKILL_FILE_PATHS),
				Some(OpenedFile {
					path: REFERENCE,
					text: Some(&text),
					failure: None,
					unsaved: false,
				}),
				Vec::new(),
			),
			FilesCase::Failed(FileFailure::Read) => {
				(Some(SKILL_FILE_PATHS), unread(Some(FileFailure::Read)), Vec::new())
			}
			FilesCase::Failed(failure) => (
				Some(SKILL_FILE_PATHS),
				Some(OpenedFile {
					path: REFERENCE,
					text: Some(&text),
					failure: Some(failure),
					unsaved: false,
				}),
				Vec::new(),
			),
			FilesCase::Confirming => (
				Some(SKILL_FILE_PATHS),
				Some(OpenedFile {
					path: REFERENCE,
					text: Some(&text),
					failure: None,
					unsaved: false,
				}),
				vec![confirmation::<SceneState>(t, Confirm::DeleteFile(REFERENCE))],
			),
		};
		let files = SkillFiles { paths, opened, new_path: &new_path, refusal: None };
		frame(
			col()
				.w_full()
				.h_full()
				.fill(t.background)
				.padding(FILES_INSET)
				.child(skills::files_panel::<SceneState>(t, &files)),
			layers,
		)
	}
}
