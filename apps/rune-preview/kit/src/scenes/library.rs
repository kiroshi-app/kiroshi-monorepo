use rune::image::{Image, ImageCache};
use rune::{Align, El, Side, TextEdit, col, el, row};

use super::{Pointer, Scene, SceneState, THEMES};
use crate::avatar::Face;
use crate::hues::Preset;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::primitives::tooltip::{TooltipSide, tooltip};
use crate::strings::{Language, common};
use crate::surfaces::s14_library::{
	Agent, BarActions, BlockEvent, BlockMenuLook, CalloutTone, DocumentBar, EditorBlock, Format,
	GalleryDrag, GalleryEdit, HandlePlace, ImageMenu, ItemAction, ItemLook, LibraryBlock,
	LibraryBlockType, LibraryFilter, LibraryItem, LibraryPanel, LightboxImage, LightboxLook,
	MORE_KEY, NewDocumentTemplate, PanelActions, PanelLook, PanelState, RowMark, Run, Slash,
	TOOLBAR_GAP, TableCells, Tile, TileImage, Unavailable, Writer, agent_card, agent_caret,
	block_editor, block_handle, block_menu, block_text, body_block, callout_editor, code_view,
	delete_confirmation, document_bar, document_body, document_column, document_panel,
	document_placeholder, document_skeleton, document_title, drag_ghost, drop_indicator, drop_line,
	drop_overlay, failed_import, failure_notice, fence_body, field_key, field_of, format_toolbar,
	format_tooltip, gallery_editor, grid_columns, image_skeleton, inline_field, item_menu,
	item_unavailable, language_menu, library_panel, lightbox, link_field, new_document_dialog,
	panel_max_width, parse_blocks, person_caret, presence, records_of, rows_of, shown_name,
	table_cells, table_editor, title_field, turn_into_menu, web_page_editor, web_page_view,
};
use crate::tokens::{
	BLUE, RADIUS_CONTROL, SPACING, TEXT_COMPACT_MEDIUM, TEXT_TITLE, TEXT_XS_MONO, Tokens, faded,
};

pub const ARTBOARD: (f32, f32) = (1280.0, 832.0);
const NARROW: (f32, f32) = (560.0, 832.0);
pub(super) const THREAD: (f32, f32) = (1280.0, 800.0);
const SMALL_WINDOW: (f32, f32) = (1024.0, 800.0);
const FRAME_START: f32 = SPACING * 15.0;
const FRAME_END: f32 = SPACING * 1.5;
const FRAME_BLOCK: f32 = SPACING * 2.0;
const LANG: Language = Language::En;
const IMAGE_SIDE: f32 = 320.0;
const IMAGE_SCALE: f32 = 2.0;
const BLOCK_PITCH: f32 = SPACING * 14.0;
const BLOCK_DRAG_CURSOR: (f32, f32) = (300.0, 390.0);

const DUNES: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#2b3a55'/><circle cx='118' cy='30' r='14' fill='#f6c177'/><path d='M0 70 Q40 50 80 68 T160 62 V100 H0Z' fill='#c9895b'/><path d='M0 84 Q50 66 100 82 T160 80 V100 H0Z' fill='#8f5a3c'/></svg>";
const HARBOUR: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='1000' viewBox='0 0 140 100'><rect width='140' height='100' fill='#0f2a3d'/><rect y='60' width='140' height='40' fill='#123e57'/><rect x='18' y='38' width='22' height='22' fill='#e2e8f0'/><rect x='46' y='30' width='16' height='30' fill='#94a3b8'/><rect x='92' y='42' width='30' height='18' fill='#cbd5e1'/></svg>";
const FERN: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1200' viewBox='0 0 100 120'><rect width='100' height='120' fill='#14281d'/><ellipse cx='50' cy='60' rx='18' ry='46' fill='#3f7d4e'/><ellipse cx='30' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(-24 30 70)'/><ellipse cx='70' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(24 70 70)'/></svg>";
const DASHBOARD: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#f4f4f5'/><rect width='34' height='100' fill='#18181b'/><rect x='44' y='12' width='60' height='8' rx='2' fill='#27272a'/><rect x='44' y='30' width='50' height='30' rx='3' fill='#bfdbfe'/><rect x='100' y='30' width='50' height='30' rx='3' fill='#fde68a'/><rect x='44' y='68' width='106' height='22' rx='3' fill='#e4e4e7'/></svg>";
const DUSK: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1200' viewBox='0 0 100 100'><rect width='100' height='100' fill='#3b1f47'/><rect y='55' width='100' height='45' fill='#7a3b5c'/><circle cx='50' cy='55' r='18' fill='#f59e8b'/><rect y='70' width='100' height='30' fill='#2a1633'/></svg>";
const SKETCH: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 160 90'><rect width='160' height='90' fill='#fafaf9'/><path d='M20 70 L60 30 L90 55 L140 20' stroke='#1c1917' stroke-width='2' fill='none'/><circle cx='60' cy='30' r='4' fill='#ef4444'/><circle cx='90' cy='55' r='4' fill='#3b82f6'/></svg>";

const STORED: [(&str, &str, &str); 7] = [
	("sofa-green", "Green velvet sofa", "#5b7a55"),
	("sofa-grey", "Grey linen sofa", "#9a9a94"),
	("armchair-rust", "Rust armchair", "#a4553a"),
	("lamp-brass", "Brass lamp", "#b8923f"),
	("rug-wool", "Wool rug", "#c9b79c"),
	("table-oak", "Oak table", "#8a6542"),
	("shelf-pine", "shelf pine", "#b49a6c"),
];

#[derive(Clone, Copy)]
enum Picture {
	Dunes,
	Harbour,
	Fern,
	Dashboard,
	Dusk,
	Sketch,
}

const PICTURES: [&str; 6] = [DUNES, HARBOUR, FERN, DASHBOARD, DUSK, SKETCH];

const BRIEF_EXCERPT: &str = "# Spring launch brief\n\nWhat we're shipping on the 14th, who it's for and the three messages every page repeats.\n\n## Audience\n\nTeams of five to twenty who already keep their notes in a shared folder.";
const MEETING_EXCERPT: &str = "# Weekly sync\n\nThe onboarding copy is final; the pricing page waits on the new screenshots.\n\n## Decisions\n\n- Ship the import strip first\n- Keep the templates to three";
const RESEARCH_EXCERPT: &str = "# Interview notes\n\nSix conversations with design leads about where their references live today.\n\n## Patterns\n\nEveryone keeps a folder nobody else can find.";
const CHECKLIST_EXCERPT: &str = "# Launch checklist\n\n- Final copy review\n- Screenshots at 2x\n- Release notes drafted\n- Support macros updated";
const CONTROLS_EXCERPT: &str = "# Launch checklist\n\nRead the [partner brief](https://example.com/brief) before the call with @Atlas.\n\n- [x] Draft the pricing page\n- [ ] Book the onboarding emails\n\n| Channel | Owner |\n| --- | --- |\n| Newsletter | Mara |\n\n```ts\nconst launch = \"spring\"\n```";

enum Look {
	Image(Picture),
	Page(&'static str),
}

struct Fixture {
	id: &'static str,
	name: &'static str,
	detail: &'static str,
	look: Look,
}

const ITEMS: [Fixture; 12] = [
	Fixture {
		id: "dunes",
		name: "hero-dunes.png",
		detail: "PNG · 248 KB · 8 min ago",
		look: Look::Image(Picture::Dunes),
	},
	Fixture {
		id: "dashboard",
		name: "dashboard-redesign.png",
		detail: "PNG · 412 KB · 12 min ago",
		look: Look::Image(Picture::Dashboard),
	},
	Fixture {
		id: "brief",
		name: "Spring launch brief",
		detail: "Document · 4 KB · 21 min ago",
		look: Look::Page(BRIEF_EXCERPT),
	},
	Fixture {
		id: "harbour",
		name: "harbour-at-night.jpg",
		detail: "JPG · 1.2 MB · 1 h ago",
		look: Look::Image(Picture::Harbour),
	},
	Fixture {
		id: "fern",
		name: "fern-study.jpg",
		detail: "JPG · 864 KB · 2 h ago",
		look: Look::Image(Picture::Fern),
	},
	Fixture {
		id: "sync",
		name: "Weekly sync",
		detail: "Document · 2 KB · 3 h ago",
		look: Look::Page(MEETING_EXCERPT),
	},
	Fixture {
		id: "dusk",
		name: "dusk-palette.png",
		detail: "PNG · 96 KB · Yesterday",
		look: Look::Image(Picture::Dusk),
	},
	Fixture {
		id: "sketch",
		name: "growth-sketch.png",
		detail: "PNG · 132 KB · Yesterday",
		look: Look::Image(Picture::Sketch),
	},
	Fixture {
		id: "interviews",
		name: "Interview notes",
		detail: "Document · 6 KB · 2 days ago",
		look: Look::Page(RESEARCH_EXCERPT),
	},
	Fixture {
		id: "dunes-wide",
		name: "dunes-wide.png",
		detail: "PNG · 310 KB · 3 days ago",
		look: Look::Image(Picture::Dunes),
	},
	Fixture {
		id: "checklist",
		name: "Launch checklist",
		detail: "Document · 1 KB · 4 days ago",
		look: Look::Page(CHECKLIST_EXCERPT),
	},
	Fixture {
		id: "harbour-dawn",
		name: "harbour-at-dawn.jpg",
		detail: "JPG · 1.1 MB · Last week",
		look: Look::Image(Picture::Harbour),
	},
];

const IMPORTED: [Fixture; 2] = [
	Fixture {
		id: "pricing-grid",
		name: "pricing-grid.png",
		detail: "PNG · 186 KB · Just now",
		look: Look::Image(Picture::Sketch),
	},
	Fixture {
		id: "usage-march",
		name: "usage-march.png",
		detail: "PNG · 540 KB · Just now",
		look: Look::Image(Picture::Dashboard),
	},
];
const IMPORT_PROGRESS: f32 = 0.64;

const WHITESPACE_DOCUMENT: Fixture = Fixture {
	id: "whitespace",
	name: "   ",
	detail: "Document · 1 KB · 2 min ago",
	look: Look::Page("Notes that never got a title."),
};

const CONTROLS_DOCUMENTS: [Fixture; 2] = [
	Fixture {
		id: "launch-checklist",
		name: "Launch checklist",
		detail: "Document · 2 KB · 5 min ago",
		look: Look::Page(CONTROLS_EXCERPT),
	},
	Fixture {
		id: "launch-notes",
		name: "Launch notes",
		detail: "Document · 2 KB · 5 min ago",
		look: Look::Page("Notes from the partner call."),
	},
];

const LONG_IMAGE_NAME: &str =
	"hero-dunes-final-final-approved-by-marketing-and-legal-v12-export-2x.png";
const LONG_DOCUMENT_NAME: &str =
	"Spring launch brief for the partner newsletter, the pricing page and the onboarding emails";
const DROPPED_NAMES: [&str; 3] = ["usage-march.png", "pricing-grid.png", "release-notes.md"];
const LONG_DROPPED_NAME: &str =
	"usage-march-final-final-approved-by-finance-and-legal-v12-export-2x.png";
const DRAG_CURSOR: (f32, f32) = (742.0, 436.0);
const IMPORT_FAILED_NAME: &str = "launch-plan.md";

const LIGHTBOX_IMAGES: [(&str, &str, Picture); 8] = [
	("hero-dunes.png", "PNG · 1600 × 1000 · 248 KB", Picture::Dunes),
	("dashboard-redesign.png", "PNG · 1600 × 1000 · 412 KB", Picture::Dashboard),
	("harbour-at-night.jpg", "JPG · 1400 × 1000 · 1.2 MB", Picture::Harbour),
	("fern-study.jpg", "JPG · 1000 × 1200 · 864 KB", Picture::Fern),
	("dusk-palette.png", "PNG · 1200 × 1200 · 96 KB", Picture::Dusk),
	("growth-sketch.png", "PNG · 1600 × 900 · 132 KB", Picture::Sketch),
	("dunes-wide.png", "PNG · 1600 × 1000 · 310 KB", Picture::Dunes),
	("harbour-at-dawn.jpg", "JPG · 1400 × 1000 · 1.1 MB", Picture::Harbour),
];
const ZOOMED_PERCENT: u32 = 150;
const IMAGE_MENU_AT: (f32, f32) = (640.0, 360.0);

const BRIEF_NAME: &str = "Spring launch brief";
const BRIEF_DETAIL: &str = "1,240 words · Edited today at 10:41";
const AGENT_BRIEF_DETAIL: &str = "1,262 words · Edited just now";
const SPRING_BRIEF: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats, so the copy, the screenshots and the release notes say the same thing.\n\n## Audience\n\nTeams of five to twenty who already keep their notes and references in a shared folder, and lose them there. They don't want another tool; they want the folder to stop forgetting.\n\n## Messages\n\n- Everything the Space holds, in one place.\n- Images and documents side by side, searchable by name.\n- Nothing to set up: drop files in and they're there.\n\n## Timeline\n\nCopy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.";
const DOCUMENT_BODY: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats.\n\n## Before the 14th\n\n- [x] Copy is final\n- [x] Screenshots land\n- [ ] Release notes are signed off\n\nRelease notes go out with the build on the morning of the 14th";
const LIVE_SENTENCE: &str = "Release notes go out with the build on the morning of the 14th";
const ATLAS_SENTENCE: &str = "and the agent says why it asks";
const MIRA_SENTENCE: &str = "We also count how often someone stops an agent in its";
const AGENT_BRIEF: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats.\n\n## What changes\n\n- Every document opens in place of the grid, one click from the Library.\n- Agents write straight into the document you have open.\n- Notifications wait for the first finished task, and the agent says why it asks\n\n## What we measure\n\nWeekly active Spaces is the one number we report on launch day, read against the four weeks before it and against the same weeks of last spring.\n\nWe also count how often someone stops an agent in its\n\n## Timeline\n\nCopy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.";
const LONG_BRIEF_TAIL: &str = "\n\n## Open questions\n\nWhether the import strip ships with the build or a week after it is still open, and support wants a say before the 10th.\n\nThe pricing page waits on the new screenshots, so its copy may slip to the release notes.";
const MARKED_DOCUMENT: &str = "## Launch plan\n\n- Book the **room**\n- Send the invite\n\n> The export keeps the archived rooms too.\n\n- [ ] Print the **badges**\n- [x] Order the cake\n\nShip **bold** with *italic*, ~~struck~~, `code` and a [link](https://kiroshi.app) today.";
const RICH_TEXT_DOCUMENT: &str = "Costs \\$5 to \\$9 \\(tax included\\) for the room.\n\nWrite to <ada@kiroshi.app> or <https://kiroshi.app/help>.\n\nSee ![Green velvet sofa](https://images.example.org/sofa-green.jpg) in the lobby.\n\n- Rooms\n  - Atlas\n  - Mira\n- Food\n\n> [!NOTE]\n> Keep the **archived** rooms and the *export* too.\n\n| Room | Seats |\n| --- | --- |\n| **Atlas** | 12 |";
const RICH_BLOCKS: &str = "> [!NOTE]\n> The export keeps the archived rooms too.\n\n```web-page\nurl: https://www.example.org/rooms\ntitle: Casa do Rio, rooms and rates\n```\n\n| Room | Seats |\n| --- | --- |\n| Atlas | 12 |\n\n```collapsible\ntitle: Full list of the rooms\n\n- Atlas, 12 seats\n- Mira, 6 seats\n```";
const CHECKLIST_DOCUMENT: &str = "Before the launch call:\n\n- [ ] Book the room\n- [x] Send the invite\n- [ ] \n\nThe call starts at ten.";
const CHECKLIST_MOVED: &str =
	"Before the launch call:\n\n- [x] Send the invite\n- [ ] Print the agenda\n- [ ] Book the room";
const CALLOUT_DOCUMENT: &str =
	"The export is ready.\n\n> [!NOTE]\n> The export keeps the archived rooms too.";
const TABLE_DOCUMENT: &str =
	"Rooms held for the offsite:\n\n| Room | Seats |\n| --- | --- |\n| Atlas | 12 |\n| Mira |  |";
const CODE_DOCUMENT: &str =
	"Run this once the build is green:\n\n```ts\nconst launch = await ship()\n```";
const WEB_PAGE_DOCUMENT: &str = "Where the team sleeps:\n\n```web-page\nurl: https://www.example.org/rooms\ntitle: Casa do Rio, rooms and rates\n```";
const SUITES: (&str, &str) = ("https://www.example.org/suites", "Casa do Rio, suites");
const EMPTIED_DOCUMENT: [(&str, &str); 4] = [
	("Before the call:", ""),
	("## ", "Name the risk"),
	("- ", "Add an item"),
	("> ", "Add a quote"),
];
const GALLERY_LEAD: &str = "The sofas we kept for the lobby.";
const GREY_CAPTION: &str = "Grey linen, 990 euros";

const LAUNCH_REVIEW_TITLE: &str = "Launch review";
const LAUNCH_REVIEW_DETAIL: &str = "38 words · Edited today at 10:41";
const LAUNCH_REVIEW: &str = "We met to agree the launch date and who signs off the copy.\n\n## Decisions\n\n- Ship on the 14th\n- Copy is final on the 7th\n\n## Next steps\n\nScreenshots land on the 10th.";
const SELECTION_BODY: &str = "We met to agree the launch date and who signs off the copy before the screenshots land, so the press kit and the store listing go out together on the same morning.\n\n## Decisions\n\n- Ship on the **14th**\n- Copy is final on the 7th\n\n## Next steps\n\nScreenshots land on the 10th.";
const LAUNCH_DATE: &str = "the launch date";
const ROUND_TRIP: &str = "# Launch plan\n\n## Decisions\n\n### Owners\n\n- Ship on the **14th**\n- Copy is *final* on the 7th\n\n1. Draft the notes\n2. Review with ~~legal~~ design\n\n- [ ] Book the room\n- [x] Send the invite\n\n> Keep the launch quiet until the 14th.\n\n```ts\nconst launch = await ship()\n```\n\nRead the `brief` and the [press kit](https://kiroshi.app/press).";
const DECISIONS_TABLE: &str = "| Owner | Due | Decision |\n| --- | --- | --- |\n| Ada | 7 Nov | Copy is final once legal and design have both signed the last draft of the page |\n| Noé | 14 Nov | Ship to every Space after the review, with the screenshots in the store listing |";
const MEETING_TITLE: &str = "Meeting notes, 2 November";
const PASTED: [&str; 3] = ["First thought.", "Second thought.", "Third thought."];
const WRITE_FAILURE: &str =
	"Atlas stopped writing before it finished. Ask again from the conversation.";

const ATLAS: Agent = Agent { name: "Atlas", hue: Some(41.0) };
const MIRA: Agent = Agent { name: "Mira", hue: Some(132.0) };
const PEOPLE: [&str; 4] = ["Léa Martin", "Noah", "Inès", "Sam"];

pub struct LibraryScene {
	pictures: Vec<Image>,
	stored: Vec<Image>,
	title: TextEdit,
	fields: Vec<(String, usize, TextEdit)>,
	link: TextEdit,
	heard: Option<String>,
}

impl LibraryScene {
	pub fn new(scene: &Scene) -> LibraryScene {
		let spec = editor_spec(scene.id);
		let (title, fields) = match &spec {
			Some(spec) => (spec.title_edit(), spec.fields()),
			None => (TextEdit::new(""), Vec::new()),
		};
		let link = spec.as_ref().map_or_else(|| TextEdit::new(""), Spec::link_edit);
		LibraryScene { pictures: Vec::new(), stored: Vec::new(), title, fields, link, heard: None }
	}

	pub fn decode(&mut self, images: &ImageCache) {
		let decode = |svg: &str| {
			let picture = images.svg(svg.as_bytes(), IMAGE_SIDE, IMAGE_SCALE);
			if let Err(failure) = picture.wait() {
				eprintln!("a Library picture didn't decode: {}", failure.0);
			}
			picture
		};
		self.pictures = PICTURES.iter().map(|svg| decode(svg)).collect();
		self.stored = STORED
			.iter()
			.map(|(_, _, tint)| {
				decode(&format!(
					"<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300' viewBox='0 0 4 3'><rect width='4' height='3' fill='{tint}'/></svg>"
				))
			})
			.collect();
	}

	fn picture(&self, picture: Picture) -> Option<&Image> {
		self.pictures.get(picture as usize)
	}

	fn stored(&self, src: &str) -> TileImage<'_> {
		STORED
			.iter()
			.position(|(name, _, _)| src.contains(name))
			.and_then(|index| self.stored.get(index))
			.map_or(TileImage::Failed, TileImage::Ready)
	}
}

fn field<'a>(s: &'a mut SceneState, block: &str, index: usize) -> &'a mut TextEdit {
	match s.library.fields.iter().position(|(id, at, _)| id == block && *at == index) {
		Some(found) => &mut s.library.fields[found].2,
		None => &mut s.edit,
	}
}

fn edit_of<'a>(s: &'a SceneState, block: &str, at: usize) -> &'a TextEdit {
	s.library
		.fields
		.iter()
		.find(|(id, field, _)| id == block && *field == at)
		.map_or(&s.edit, |(_, _, edit)| edit)
}

fn query(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

fn title(s: &mut SceneState) -> &mut TextEdit {
	&mut s.library.title
}

fn link(s: &mut SceneState) -> &mut TextEdit {
	&mut s.library.link
}

fn ignore<E>(_: &mut SceneState, _: E) {}

fn heard<E: std::fmt::Debug>(s: &mut SceneState, event: E) {
	s.library.heard = Some(format!("{event:?}"));
}

pub(super) fn heard_echo(t: &Tokens, s: &SceneState) -> Option<El> {
	let heard = s.library.heard.as_ref()?;
	Some(
		row()
			.key("scene-heard")
			.pin(Some(SPACING * 2.0), None, None, Some(SPACING * 2.0))
			.padding(SPACING * 2.0)
			.radius(RADIUS_CONTROL)
			.fill(t.popover)
			.border(1.0, t.border)
			.child(
				rune::text(format!("Heard {heard}")).font(TEXT_XS_MONO).color(t.popover_foreground),
			),
	)
}

fn unhandled(_: &mut SceneState, _: BlockEvent) -> bool {
	false
}

fn tinted(t: &Tokens) -> Tokens {
	t.in_space(Some(BLUE))
}

fn card(t: &Tokens, content: El, layers: Vec<El>) -> El {
	col()
		.grow(1.0)
		.min_w(0.0)
		.h_full()
		.radius(RADIUS_CONTROL)
		.clip_rounded(RADIUS_CONTROL)
		.border(1.0, t.shell_border)
		.fill(t.card)
		.child(content)
		.children(layers)
}

fn framed_with(t: &Tokens, content: El, layers: Vec<El>, windows: Vec<El>) -> El {
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.fill(t.background)
			.pl(FRAME_START)
			.pr(FRAME_END)
			.py(FRAME_BLOCK)
			.child(card(t, content, layers)),
		windows,
	)
}

fn framed(t: &Tokens, content: El, layers: Vec<El>) -> El {
	framed_with(t, content, layers, Vec::new())
}

fn card_width(size: (f32, f32)) -> f32 {
	size.0 - FRAME_START - FRAME_END
}

fn item<'a>(s: &'a SceneState, fixture: &'a Fixture) -> LibraryItem<'a> {
	LibraryItem {
		id: fixture.id,
		name: fixture.name,
		detail: fixture.detail,
		look: match fixture.look {
			Look::Image(picture) => ItemLook::Image(s.library.picture(picture)),
			Look::Page(excerpt) => ItemLook::Page(excerpt),
		},
		import_progress: None,
	}
}

fn every_item(s: &SceneState) -> Vec<LibraryItem<'_>> {
	ITEMS.iter().map(|fixture| item(s, fixture)).collect()
}

fn panel_view(
	t: &Tokens,
	s: &SceneState,
	items: &[LibraryItem],
	state: PanelState,
	filter: LibraryFilter,
	actions: PanelActions,
) -> El {
	let panel = LibraryPanel {
		state,
		items,
		filter,
		query: &s.edit,
		actions,
		columns: grid_columns(card_width(ARTBOARD)),
		focused: None,
	};
	library_panel(t, LANG, &panel, query, heard)
}

fn panel_scene(
	t: &Tokens,
	s: &SceneState,
	items: &[LibraryItem],
	state: PanelState,
	filter: LibraryFilter,
	actions: PanelActions,
) -> El {
	let t = &tinted(t);
	framed(t, panel_view(t, s, items, state, filter, actions), Vec::new())
}

fn ready(t: &Tokens, s: &SceneState, items: &[LibraryItem], filter: LibraryFilter) -> El {
	panel_scene(t, s, items, PanelState::Ready, filter, PanelActions::EVERY)
}

fn grid_with(t: &Tokens, s: &SceneState, items: &[LibraryItem], layers: Vec<El>) -> El {
	framed(
		t,
		panel_view(t, s, items, PanelState::Ready, LibraryFilter::All, PanelActions::EVERY),
		layers,
	)
}

pub(super) fn grid_all(t: &Tokens, s: &SceneState) -> El {
	ready(t, s, &every_item(s), LibraryFilter::All)
}

pub(super) fn grid_with_first_tile_focused(t: &Tokens, s: &SceneState) -> El {
	let t = &tinted(t);
	let items = every_item(s);
	let panel = LibraryPanel {
		state: PanelState::Ready,
		items: &items,
		filter: LibraryFilter::All,
		query: &s.edit,
		actions: PanelActions::EVERY,
		columns: grid_columns(card_width(ARTBOARD)),
		focused: Some(ITEMS[0].id),
	};
	framed(t, library_panel(t, LANG, &panel, query, heard), Vec::new())
}

pub(super) fn grid_images(t: &Tokens, s: &SceneState) -> El {
	ready(t, s, &every_item(s), LibraryFilter::Images)
}

pub(super) fn grid_documents(t: &Tokens, s: &SceneState) -> El {
	ready(t, s, &every_item(s), LibraryFilter::Documents)
}

pub(super) fn filter_with_no_match(t: &Tokens, s: &SceneState) -> El {
	let images: Vec<LibraryItem> =
		every_item(s).into_iter().filter(|item| matches!(item.look, ItemLook::Image(_))).collect();
	ready(t, s, &images, LibraryFilter::Documents)
}

pub(super) fn search(t: &Tokens, s: &SceneState) -> El {
	let found: Vec<LibraryItem> =
		every_item(s).into_iter().filter(|item| item.name.contains(s.edit.text.as_str())).collect();
	ready(t, s, &found, LibraryFilter::All)
}

pub(super) fn empty_with_no_callbacks(t: &Tokens, s: &SceneState) -> El {
	panel_scene(t, s, &[], PanelState::Ready, LibraryFilter::All, PanelActions::default())
}

pub(super) fn empty_with_every_callback(t: &Tokens, s: &SceneState) -> El {
	panel_scene(t, s, &[], PanelState::Ready, LibraryFilter::All, PanelActions::EVERY)
}

pub(super) fn loading(t: &Tokens, s: &SceneState) -> El {
	panel_scene(t, s, &[], PanelState::Loading, LibraryFilter::All, PanelActions::EVERY)
}

pub(super) fn whitespace_name(t: &Tokens, s: &SceneState) -> El {
	ready(t, s, &[item(s, &WHITESPACE_DOCUMENT)], LibraryFilter::All)
}

pub(super) fn long_names(t: &Tokens, s: &SceneState) -> El {
	let mut items = vec![
		LibraryItem { id: "long-image", name: LONG_IMAGE_NAME, ..item(s, &ITEMS[0]) },
		LibraryItem { id: "long-document", name: LONG_DOCUMENT_NAME, ..item(s, &ITEMS[2]) },
	];
	items.extend(ITEMS[3..6].iter().map(|fixture| item(s, fixture)));
	ready(t, s, &items, LibraryFilter::All)
}

fn imported(s: &SceneState) -> Vec<LibraryItem<'_>> {
	let mut items = vec![
		item(s, &IMPORTED[0]),
		LibraryItem { import_progress: Some(IMPORT_PROGRESS), ..item(s, &IMPORTED[1]) },
	];
	items.extend(every_item(s));
	items
}

fn corner_notice(content: El) -> El {
	col().pin(None, None, Some(SPACING * 4.0), Some(SPACING * 4.0)).w(SPACING * 96.0).child(content)
}

pub(super) fn added_to_the_grid(t: &Tokens, s: &SceneState) -> El {
	use common::library::added;
	let t = &tinted(t);
	let title = added::TITLE_OTHER.text(LANG).replace("{{count}}", "2");
	let description = added::STILL_IMPORTING_ONE.text(LANG).replace("{{count}}", "1");
	let notice = toast(
		t,
		Toast { kind: ToastType::Plain, title: &title, description: &description, action: None },
	);
	grid_with(t, s, &imported(s), vec![corner_notice(notice)])
}

fn grid_menu(
	t: &Tokens,
	s: &SceneState,
	fixture: usize,
	actions: &[ItemAction],
	image: Option<ImageMenu>,
) -> El {
	let t = &tinted(t);
	let menu = item_menu(t, LANG, ITEMS[fixture].name, actions, image, heard).anchored(
		format!("library-item-{}", ITEMS[fixture].id),
		Side::Bottom,
		Align::Center,
		-SPACING * 40.0,
	);
	grid_with(t, s, &every_item(s), vec![menu])
}

pub(super) fn grid_context_menu(t: &Tokens, s: &SceneState) -> El {
	grid_menu(t, s, 1, &ItemAction::ALL, None)
}

pub(super) fn grid_actions_per_item(t: &Tokens, s: &SceneState) -> El {
	grid_menu(t, s, 2, &ItemAction::ALL, None)
}

pub(super) fn grid_image_menu(t: &Tokens, s: &SceneState) -> El {
	grid_menu(
		t,
		s,
		1,
		&[ItemAction::Open, ItemAction::Delete],
		Some(ImageMenu { is_saving: false }),
	)
}

pub(super) fn preview_holds_no_control(t: &Tokens, s: &SceneState) -> El {
	let items: Vec<LibraryItem> =
		CONTROLS_DOCUMENTS.iter().map(|fixture| item(s, fixture)).collect();
	ready(t, s, &items, LibraryFilter::All)
}

pub(super) fn documents_across_spaces(t: &Tokens, s: &SceneState) -> El {
	let documents: Vec<LibraryItem> =
		every_item(s).into_iter().filter(|item| matches!(item.look, ItemLook::Page(_))).collect();
	let half = (ARTBOARD.0 - SPACING * 5.5) / 2.0;
	let side = |hue: Preset| {
		let t = &t.in_space(Some(hue.hue()));
		let panel = LibraryPanel {
			state: PanelState::Ready,
			items: &documents,
			filter: LibraryFilter::All,
			query: &s.edit,
			actions: PanelActions::default(),
			columns: grid_columns(half),
			focused: None,
		};
		card(t, library_panel(t, LANG, &panel, query, ignore), Vec::new())
	};
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.padding(SPACING * 2.0)
			.gap(SPACING * 1.5)
			.fill(t.background)
			.child(side(Preset::Pink))
			.child(side(Preset::Green)),
		Vec::new(),
	)
}

pub(super) fn failed(t: &Tokens, s: &SceneState) -> El {
	panel_scene(t, s, &[], PanelState::Failed, LibraryFilter::All, PanelActions::EVERY)
}

pub(super) fn dropping_files(t: &Tokens, s: &SceneState) -> El {
	dropping(t, s, &DROPPED_NAMES)
}

pub(super) fn dropping_one_file(t: &Tokens, s: &SceneState) -> El {
	dropping(t, s, &DROPPED_NAMES[..1])
}

fn dropping(t: &Tokens, s: &SceneState, names: &[&str]) -> El {
	let t = &tinted(t);
	let ghost = drag_ghost(t, LANG, names, s.library.picture(Picture::Dashboard), DRAG_CURSOR);
	framed_with(
		t,
		panel_view(
			t,
			s,
			&every_item(s),
			PanelState::Ready,
			LibraryFilter::All,
			PanelActions::EVERY,
		),
		vec![drop_overlay(t, LANG, names.len())],
		vec![ghost],
	)
}

pub(super) fn import_long_names(t: &Tokens, s: &SceneState) -> El {
	let t = &t.in_space(Some(Preset::Pink.hue()));
	let mut items = vec![LibraryItem {
		name: LONG_DROPPED_NAME,
		import_progress: Some(IMPORT_PROGRESS),
		..item(s, &IMPORTED[1])
	}];
	items.extend(ITEMS[..5].iter().map(|fixture| item(s, fixture)));
	let names = [LONG_DROPPED_NAME, DROPPED_NAMES[1], DROPPED_NAMES[2]];
	let ghost = drag_ghost(t, LANG, &names, None, DRAG_CURSOR);
	framed_with(
		t,
		panel_view(t, s, &items, PanelState::Ready, LibraryFilter::All, PanelActions::EVERY),
		Vec::new(),
		vec![ghost],
	)
}

pub(super) fn import_failures(t: &Tokens, s: &SceneState) -> El {
	use common::library::failure::import;
	let t = &tinted(t);
	let title = import::TITLE.text(LANG).replace("{{name}}", IMPORT_FAILED_NAME);
	let notice = failure_notice(t, LANG, &title, import::GENERIC.text(LANG));
	grid_with(t, s, &every_item(s), vec![notice])
}

pub(super) fn document_loading(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	framed(t, document_skeleton(t, LANG), Vec::new())
}

pub(super) fn image_loading(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	framed(t, image_skeleton(LANG), Vec::new())
}

pub(super) fn missing_item(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	framed(
		t,
		item_unavailable(t, LANG, Unavailable::Missing, "", |_: &mut SceneState| {}),
		Vec::new(),
	)
}

pub(super) fn unreadable_item(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	framed(
		t,
		item_unavailable(t, LANG, Unavailable::Unreadable, ITEMS[2].name, |_: &mut SceneState| {}),
		Vec::new(),
	)
}

fn no_picture<'a>(_: &str) -> TileImage<'a> {
	TileImage::Resolving
}

fn page(t: &Tokens, bar: DocumentBar, heading: El, detail: &str, body: El, layers: Vec<El>) -> El {
	let bar = document_bar(t, LANG, bar, ignore);
	framed(
		t,
		col()
			.w_full()
			.h_full()
			.min_h(0.0)
			.child(bar)
			.child(document_column(t, heading, detail, body)),
		layers,
	)
}

fn bar(name: &str) -> DocumentBar<'_> {
	DocumentBar { name, is_read_only: false, presence: None, actions: BarActions::EVERY }
}

fn read_document(t: &Tokens, bar: DocumentBar, markdown: &str, layers: Vec<El>) -> El {
	let name = shown_name(bar.name, LANG).to_owned();
	page(
		t,
		bar,
		document_title(t, &name),
		BRIEF_DETAIL,
		document_body(t, LANG, markdown, &[], &no_picture),
		layers,
	)
}

pub(super) fn document_default(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	read_document(t, bar(BRIEF_NAME), SPRING_BRIEF, Vec::new())
}

pub(super) fn document_whitespace_name(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	read_document(t, bar("   "), SPRING_BRIEF, Vec::new())
}

fn more_menu(t: &Tokens, name: &str, actions: &[ItemAction]) -> El {
	item_menu(t, LANG, name, actions, None, ignore).anchored(
		MORE_KEY,
		Side::Bottom,
		Align::End,
		SPACING,
	)
}

pub(super) fn document_more_menu(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	read_document(
		t,
		bar(BRIEF_NAME),
		SPRING_BRIEF,
		vec![more_menu(t, BRIEF_NAME, &ItemAction::BAR_MENU)],
	)
}

pub(super) fn document_member(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	read_document(
		t,
		DocumentBar { actions: BarActions::NONE, ..bar(BRIEF_NAME) },
		SPRING_BRIEF,
		Vec::new(),
	)
}

fn writers() -> [Writer<'static>; 2] {
	[
		Writer { agent: ATLAS, elapsed_seconds: 44, sentences: 1, section: "What changes" },
		Writer { agent: MIRA, elapsed_seconds: 64, sentences: 1, section: "What we measure" },
	]
}

fn runs() -> [Run<'static>; 2] {
	[
		Run { agent: ATLAS, sentence: ATLAS_SENTENCE, is_held: false },
		Run { agent: MIRA, sentence: MIRA_SENTENCE, is_held: false },
	]
}

const MIRA_CARD_AT: (f32, f32) = (270.0, 520.0);

pub(super) fn document_agents_writing(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let presence_el = presence(t, LANG, &[ATLAS, MIRA], &[], Some(|_: &mut SceneState| {}));
	let card = agent_card(t, LANG, &writers()[1]).absolute(MIRA_CARD_AT.0, MIRA_CARD_AT.1);
	let body = document_body(t, LANG, AGENT_BRIEF, &runs(), &no_picture);
	page(
		t,
		DocumentBar { presence: Some(presence_el), ..bar(BRIEF_NAME) },
		document_title(t, BRIEF_NAME),
		AGENT_BRIEF_DETAIL,
		body,
		vec![card],
	)
}

pub(super) fn document_gallery_of_stored_images(t: &Tokens, s: &SceneState) -> El {
	let t = &tinted(t);
	let markdown = stored_gallery(6);
	let picture = |src: &str| s.library.stored(src);
	let body = document_body(t, LANG, &markdown, &[], &picture);
	page(
		t,
		bar("Lobby moodboard"),
		document_title(t, "Lobby moodboard"),
		"12 words · Edited today at 11:02",
		body,
		Vec::new(),
	)
}

fn stored_gallery(count: usize) -> String {
	let items: Vec<String> = STORED
		.iter()
		.take(count)
		.map(|(name, alt, _)| format!("- image: images/{name}.jpg\n  alt: {alt}"))
		.collect();
	format!("{GALLERY_LEAD}\n\n```gallery\n{}\n```", items.join("\n"))
}

pub(super) fn document_read_only(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	read_document(
		t,
		DocumentBar { is_read_only: true, ..bar(BRIEF_NAME) },
		DOCUMENT_BODY,
		Vec::new(),
	)
}

pub(super) fn document_empty(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let untitled = rune::text(shown_name("", LANG).to_owned())
		.font(TEXT_TITLE)
		.color(t.title_placeholder_foreground);
	let start = document_placeholder(t, LANG, ignore);
	page(t, bar(""), untitled, "Created just now", start, Vec::new())
}

pub(super) fn document_files_dropped(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let blocks: Vec<&str> = DOCUMENT_BODY.split("\n\n").collect();
	let body = col()
		.w_full()
		.gap(SPACING * 3.5)
		.child(document_body(t, LANG, &blocks[..2].join("\n\n"), &[], &no_picture))
		.child(drop_line(t, LANG, DROPPED_NAMES.len()))
		.child(document_body(t, LANG, &blocks[2..].join("\n\n"), &[], &no_picture));
	page(t, bar(BRIEF_NAME), document_title(t, BRIEF_NAME), BRIEF_DETAIL, body, Vec::new())
}

pub(super) fn document_failed_import(t: &Tokens, s: &SceneState) -> El {
	let t = &tinted(t);
	let first = DOCUMENT_BODY.split("\n\n").next().unwrap_or_default();
	let tile = |picture: Picture| {
		let frame = el().grow(1.0).w(0.0).h_full();
		match s.library.picture(picture) {
			Some(image) => frame.pixels_fit(image.pixels(), rune::SurfaceFit::Fill),
			None => frame.fill(t.muted),
		}
	};
	let gallery = row()
		.w_full()
		.h(SPACING * 60.0)
		.gap(SPACING)
		.child(tile(Picture::Dunes))
		.child(tile(Picture::Harbour))
		.child(
			col()
				.grow(1.0)
				.w(0.0)
				.h_full()
				.clip_corners([0.0, RADIUS_CONTROL, RADIUS_CONTROL, 0.0])
				.child(failed_import(
					t,
					LANG,
					"rooftop.heic",
					|_: &mut SceneState| {},
					|_: &mut SceneState| {},
				)),
		);
	let body = col()
		.w_full()
		.gap(SPACING * 3.5)
		.child(document_body(t, LANG, first, &[], &no_picture))
		.child(gallery);
	page(t, bar(BRIEF_NAME), document_title(t, BRIEF_NAME), BRIEF_DETAIL, body, Vec::new())
}

fn new_document(t: &Tokens, selected: NewDocumentTemplate) -> El {
	let t = &tinted(t);
	let layers = new_document_dialog(t, LANG, selected, ignore);
	rune_kit::root(row().w_full().h_full().fill(t.background), layers)
}

pub(super) fn meeting_notes_selected(t: &Tokens, _: &SceneState) -> El {
	new_document(t, NewDocumentTemplate::MeetingNotes)
}

pub(super) fn blank_selected(t: &Tokens, _: &SceneState) -> El {
	new_document(t, NewDocumentTemplate::Blank)
}

#[derive(Clone, Copy, Default)]
struct Shown {
	position: usize,
	zoom_percent: Option<u32>,
	is_copied: bool,
}

fn lightbox_scene(t: &Tokens, s: &SceneState, shown: Shown, layers: Vec<El>) -> El {
	let t = &tinted(t);
	let (name, detail, picture) = LIGHTBOX_IMAGES[shown.position];
	let image = LightboxImage { name, detail, image: s.library.picture(picture) };
	let look = LightboxLook {
		position: shown.position + 1,
		count: LIGHTBOX_IMAGES.len(),
		zoom_percent: shown.zoom_percent,
		actions: BarActions { shown: true, is_copied: shown.is_copied },
	};
	let mut overlays = vec![lightbox(LANG, &image, look, heard)];
	overlays.extend(layers);
	grid_with(t, s, &every_item(s), overlays)
}

fn second() -> Shown {
	Shown { position: 1, ..Shown::default() }
}

pub(super) fn lightbox_default(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, second(), Vec::new())
}

pub(super) fn lightbox_first(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, Shown::default(), Vec::new())
}

fn dark_menu(actions: &[ItemAction], image: Option<ImageMenu>) -> El {
	item_menu(&Tokens::new(true), LANG, LIGHTBOX_IMAGES[1].0, actions, image, ignore)
}

fn under_more(menu: El) -> El {
	menu.anchored(MORE_KEY, Side::Bottom, Align::End, SPACING)
}

pub(super) fn lightbox_host_more_menu(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, second(), vec![under_more(dark_menu(&ItemAction::BAR_MENU, None))])
}

pub(super) fn lightbox_member_more_menu(t: &Tokens, s: &SceneState) -> El {
	let actions =
		[ItemAction::Open, ItemAction::OpenInNewTab, ItemAction::Rename, ItemAction::Delete];
	lightbox_scene(t, s, second(), vec![under_more(dark_menu(&actions, None))])
}

pub(super) fn lightbox_without_rename(t: &Tokens, s: &SceneState) -> El {
	let actions =
		[ItemAction::Open, ItemAction::OpenInNewTab, ItemAction::ShowInFolder, ItemAction::Delete];
	lightbox_scene(t, s, second(), vec![under_more(dark_menu(&actions, None))])
}

pub(super) fn lightbox_delete_confirmation(t: &Tokens, s: &SceneState) -> El {
	let dark = Tokens::new(true).in_space(Some(BLUE));
	lightbox_scene(
		t,
		s,
		second(),
		delete_confirmation(&dark, LANG, LIGHTBOX_IMAGES[1].0, false, ignore),
	)
}

pub(super) fn lightbox_back_button(t: &Tokens, s: &SceneState) -> El {
	let tip = tooltip(
		&Tokens::new(true),
		"bar-Back",
		common::library::lightbox::BACK.text(LANG),
		TooltipSide::Bottom,
	);
	lightbox_scene(t, s, second(), vec![tip])
}

pub(super) fn lightbox_copy_check(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, Shown { is_copied: true, ..second() }, Vec::new())
}

pub(super) fn lightbox_zoomed(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, Shown { zoom_percent: Some(ZOOMED_PERCENT), ..second() }, Vec::new())
}

fn image_menu(is_saving: bool) -> El {
	let actions = [
		ItemAction::Download,
		ItemAction::Copy,
		ItemAction::Open,
		ItemAction::OpenInNewTab,
		ItemAction::Rename,
		ItemAction::ShowInFolder,
		ItemAction::Delete,
	];
	dark_menu(&actions, Some(ImageMenu { is_saving })).absolute(IMAGE_MENU_AT.0, IMAGE_MENU_AT.1)
}

pub(super) fn lightbox_image_menu_open(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, second(), vec![image_menu(false)])
}

pub(super) fn lightbox_image_menu_saving(t: &Tokens, s: &SceneState) -> El {
	lightbox_scene(t, s, second(), vec![image_menu(true)])
}

fn beside_the_thread(t: &Tokens, look: PanelLook, presence_el: Option<El>, body: El) -> El {
	let aside = document_panel(t, LANG, look, presence_el, body, heard);
	rune_kit::root(
		row().w_full().h_full().fill(t.background).child(el().grow(1.0).min_w(0.0)).child(aside),
		Vec::new(),
	)
}

fn panel_at(t: &Tokens, width: f32, max: f32) -> El {
	let t = &tinted(t);
	let live = [Run { agent: ATLAS, sentence: LIVE_SENTENCE, is_held: false }];
	let body = document_body(t, LANG, DOCUMENT_BODY, &live, &no_picture);
	let presence_el = presence(t, LANG, &[ATLAS], &[], None::<fn(&mut SceneState)>);
	let look = PanelLook { width, max_width: max, ..PanelLook::document(BRIEF_NAME, THREAD.0) };
	beside_the_thread(t, look, Some(presence_el), body)
}

pub(super) fn document_panel_at_the_derived_maximum(t: &Tokens, _: &SceneState) -> El {
	let widest = panel_max_width(THREAD.0);
	panel_at(t, widest, widest)
}

pub(super) fn document_panel_in_thread(t: &Tokens, _: &SceneState) -> El {
	panel_at(t, 600.0, 800.0)
}

pub(super) fn document_panel_after_a_drag(t: &Tokens, _: &SceneState) -> El {
	panel_at(t, 720.0, 800.0)
}

pub(super) fn document_panel_asked_under_the_room(t: &Tokens, _: &SceneState) -> El {
	panel_at(t, 480.0, 544.0)
}

pub(super) fn document_panel_capped(t: &Tokens, _: &SceneState) -> El {
	panel_at(t, 656.0, 656.0)
}

pub(super) fn document_panel_at_its_floor(t: &Tokens, _: &SceneState) -> El {
	panel_at(t, 400.0, 400.0)
}

pub(super) fn document_board_panel(t: &Tokens, s: &SceneState) -> El {
	let t = &tinted(t);
	let several = s.scene.id.contains("several");
	let drawers: &[Agent] = if several { &[ATLAS, MIRA] } else { &[ATLAS] };
	let template = if several {
		common::board::presence::DRAWING_OTHER
	} else {
		common::board::presence::DRAWING_ONE
	};
	let faces = drawers.iter().enumerate().map(|(index, agent)| {
		let face = Face::still(agent.name, agent.hue).draw(SPACING * 5.0, &t.in_space(agent.hue));
		if index > 0 { face.ml(-SPACING * 1.5) } else { face }
	});
	let chip = row()
		.h(SPACING * 7.0)
		.pl(SPACING)
		.pr(SPACING * 2.5)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(SPACING * 3.5)
		.fill(faded(t.foreground, 0.04))
		.children(faces)
		.child(
			rune::text(template.text(LANG).replace("{{count}}", &drawers.len().to_string()))
				.font(TEXT_COMPACT_MEDIUM)
				.color(t.soft_foreground),
		);
	let board = el().w_full().h_full().fill(t.muted);
	let look = PanelLook { is_board: true, ..PanelLook::document("Launch plan", THREAD.0) };
	beside_the_thread(t, look, Some(chip), board)
}

pub(super) fn editor(t: &Tokens, s: &SceneState) -> El {
	let t = &tinted(t);
	match editor_spec(s.scene.id) {
		Some(spec) => spec.view(t, s),
		None => framed(t, el(), Vec::new()),
	}
}

#[derive(Clone, Copy, PartialEq)]
enum Caret {
	End,
	Start,
	After(&'static str),
	Select(&'static str),
}

#[derive(Clone, Copy, PartialEq)]
enum Heading {
	Field,
	Fixed,
}

#[derive(Clone, Copy, PartialEq)]
enum Toolbar {
	Above { pressed: Option<Format>, hovered: Option<Format> },
	Below,
	Link(&'static str),
}

#[derive(Clone, Copy, PartialEq)]
enum Rich {
	None,
	GalleryEditing { has_failed_tile: bool, drag: Option<GalleryDrag> },
	Table,
	Callout,
	Code,
	WebPage { has_failed: bool },
	Checklist,
}

#[derive(Clone, Copy, PartialEq)]
enum Overlay {
	None,
	Slash { query: &'static str, is_above: bool },
	Toolbar(Toolbar),
	Notice(&'static str),
	DeleteConfirm,
	HandleMenu,
	TurnInto,
	DropBelow(usize),
	BlockDrag { from: usize, below: usize },
	Handle,
}

struct Spec {
	heading: Heading,
	title: String,
	title_caret: Option<usize>,
	detail: &'static str,
	blocks: Vec<(String, &'static str)>,
	focus: Option<(usize, usize, Caret)>,
	overlay: Overlay,
	rich: Rich,
	writers: Vec<Run<'static>>,
	people: Vec<&'static str>,
	carets: Vec<(usize, &'static str, bool)>,
	stop_all: bool,
	narrow: bool,
}

impl Spec {
	fn new(heading: Heading, title: &str, detail: &'static str, markdown: &str) -> Spec {
		Spec {
			heading,
			title: title.to_owned(),
			title_caret: None,
			detail,
			blocks: parse_blocks(markdown, String::new)
				.into_iter()
				.map(|block| (block.source, ""))
				.collect(),
			focus: None,
			overlay: Overlay::None,
			rich: Rich::None,
			writers: Vec::new(),
			people: Vec::new(),
			carets: Vec::new(),
			stop_all: false,
			narrow: false,
		}
	}

	fn block_with(&self, text: &str) -> usize {
		self.blocks.iter().position(|(source, _)| source.contains(text)).unwrap_or(0)
	}

	fn focus_on(mut self, text: &str, caret: Caret) -> Spec {
		let block = self.block_with(text);
		let row = rows_of(&self.blocks[block].0)
			.iter()
			.position(|line| line.text.contains(text))
			.unwrap_or(0);
		self.focus = Some((block, row, caret));
		self
	}

	fn focus_block(mut self, block: usize, row: usize, caret: Caret) -> Spec {
		self.focus = Some((block, row, caret));
		self
	}

	fn with(mut self, overlay: Overlay) -> Spec {
		self.overlay = overlay;
		self
	}

	fn rich(mut self, rich: Rich, block: usize) -> Spec {
		self.rich = rich;
		if self.focus.is_none() {
			self.focus = Some((block, 0, Caret::End));
		}
		self
	}

	fn title_at(mut self, caret: usize) -> Spec {
		self.title_caret = Some(caret);
		self
	}

	fn ids(&self) -> Vec<LibraryBlock> {
		self.blocks
			.iter()
			.enumerate()
			.map(|(index, (source, _))| LibraryBlock {
				id: format!("blk{:03}", index + 1),
				source: source.clone(),
				gap: String::new(),
			})
			.collect()
	}

	fn link_edit(&self) -> TextEdit {
		let Overlay::Toolbar(Toolbar::Link(address)) = self.overlay else {
			return TextEdit::new("");
		};
		let mut edit = TextEdit::new(address);
		edit.focused = true;
		edit.set_caret(address.len());
		edit
	}

	fn title_edit(&self) -> TextEdit {
		let mut edit = TextEdit::new(self.title.clone());
		if let Some(caret) = self.title_caret {
			edit.focused = true;
			edit.set_caret(caret.min(edit.text.len()));
		}
		edit
	}

	fn texts_of(block: &LibraryBlock) -> Vec<String> {
		match block.kind() {
			LibraryBlockType::Table => table_cells(&block.source).into_iter().flatten().collect(),
			LibraryBlockType::Code => vec![fence_body(&block.source).1],
			LibraryBlockType::Gallery => records_of(&fence_body(&block.source).1)
				.iter()
				.map(|record| field_of(record, "caption").to_owned())
				.collect(),
			kind if kind.is_text() || kind == LibraryBlockType::Callout => {
				rows_of(&block.source).into_iter().map(|line| line.text).collect()
			}
			_ => Vec::new(),
		}
	}

	fn fields(&self) -> Vec<(String, usize, TextEdit)> {
		let mut fields = Vec::new();
		for (index, block) in self.ids().iter().enumerate() {
			let is_plain =
				matches!(block.kind(), LibraryBlockType::Code | LibraryBlockType::Gallery);
			let is_gallery = block.kind() == LibraryBlockType::Gallery;
			for (row, text) in Spec::texts_of(block).iter().enumerate() {
				let mut edit =
					if is_plain { TextEdit::new(text.clone()) } else { inline_field(text) };
				if let Some((block_at, row_at, caret)) = self.focus
					&& !is_gallery && block_at == index
					&& row_at == row
				{
					edit.focused = true;
					match caret {
						Caret::End => edit.set_caret(edit.text.len()),
						Caret::Start => edit.set_caret(0),
						Caret::After(text) => {
							let at =
								edit.text.find(text).map_or(edit.text.len(), |at| at + text.len());
							edit.set_caret(at);
						}
						Caret::Select(text) => {
							let at = edit.text.find(text).unwrap_or(0);
							edit.set_selection(at, at + text.len());
						}
					}
				}
				fields.push((block.id.clone(), row, edit));
			}
		}
		fields
	}

	fn view(&self, t: &Tokens, s: &SceneState) -> El {
		let blocks = self.ids();
		let mut views: Vec<EditorBlock> = blocks
			.iter()
			.enumerate()
			.map(|(index, block)| self.editor_block(t, s, index, block))
			.collect();
		let mut layers = Vec::new();
		let pitches = vec![BLOCK_PITCH; blocks.len()];
		let focus = self.focus.unwrap_or((0, 0, Caret::End));
		let slash = match self.overlay {
			Overlay::Slash { query, is_above } => Some(Slash {
				block: &blocks[focus.0].id,
				field: focus.1,
				query,
				active: 0,
				is_above,
			}),
			_ => None,
		};
		match self.overlay {
			Overlay::DropBelow(index) => {
				if let Some(next) = views.get_mut(index + 1) {
					next.above = Some(drop_indicator(t));
				}
			}
			Overlay::BlockDrag { from, below } => {
				if let Some(view) = views.get_mut(from) {
					let place = HandlePlace { index: from, pitches: &pitches };
					view.handle = Some(block_handle(t, LANG, true, place, heard));
				}
				if let Some(next) = views.get_mut(below + 1) {
					next.above = Some(drop_indicator(t));
				}
				let held = Spec::texts_of(&blocks[from]);
				let names: Vec<&str> = held.iter().take(1).map(String::as_str).collect();
				layers.push(drag_ghost(t, LANG, &names, None, BLOCK_DRAG_CURSOR));
			}
			Overlay::Handle | Overlay::HandleMenu | Overlay::TurnInto => {
				if let Some(view) = views.get_mut(focus.0) {
					let place = HandlePlace { index: focus.0, pitches: &pitches };
					let is_pressed = self.overlay != Overlay::Handle;
					view.handle = Some(block_handle(t, LANG, is_pressed, place, heard));
				}
				if self.overlay != Overlay::Handle {
					let handle = format!(
						"library-handle-{}",
						common::library::editor::blocks::handle::MENU.text(LANG)
					);
					let kind = blocks[focus.0].kind();
					let is_turn_into_shown = self.overlay == Overlay::TurnInto;
					let look = BlockMenuLook {
						kind,
						is_mac: true,
						can_move_up: focus.0 > 0,
						can_move_down: focus.0 + 1 < blocks.len(),
						is_turn_into_shown,
					};
					layers.push(block_menu(t, LANG, look, heard).anchored(
						handle,
						Side::Bottom,
						Align::Start,
						SPACING,
					));
					if is_turn_into_shown {
						layers.push(turn_into_menu(t, LANG, kind, heard));
					}
				}
			}
			_ => {}
		}
		for (index, name, at_start) in &self.carets {
			if let Some(view) = views.get_mut(*index) {
				if *at_start {
					view.start = Some(person_caret(t, name));
				} else {
					view.end = Some(person_caret(t, name));
				}
			}
		}
		let (body, slash_layers) = block_editor(t, LANG, &mut views, slash, field, unhandled);
		layers.extend(slash_layers);
		if let Overlay::Toolbar(toolbar) = self.overlay {
			let key = field_key(&blocks[focus.0].id, focus.1);
			let (shown, side) = match toolbar {
				Toolbar::Above { pressed, hovered } => {
					let pressed: Vec<Format> = pressed.into_iter().collect();
					(format_toolbar(t, LANG, &pressed, hovered, ignore), Side::Top)
				}
				Toolbar::Below => (format_toolbar(t, LANG, &[], None, ignore), Side::Bottom),
				Toolbar::Link(_) => (link_field(t, LANG, &s.library.link, link, heard), Side::Top),
			};
			layers.push(shown.anchored(key, side, Align::Center, TOOLBAR_GAP));
			if let Toolbar::Above { hovered: Some(hovered), .. } = toolbar {
				layers.push(format_tooltip(t, LANG, hovered).anchored(
					format!("toolbar-{}", common::library::editor::toolbar::BOLD.text(LANG)),
					Side::Top,
					Align::Center,
					SPACING * 3.5,
				));
			}
		}
		if self.rich == Rich::Code {
			layers.push(language_menu(t, LANG, "typescript", "").anchored(
				"library-code-language",
				Side::Bottom,
				Align::Start,
				SPACING,
			));
		}
		if let Overlay::Notice(message) = self.overlay {
			layers.push(failure_notice(t, LANG, message, ""));
		}
		let heading = match self.heading {
			Heading::Field => title_field(t, LANG, &s.library.title, title),
			Heading::Fixed => document_title(t, &self.title),
		};
		let mut presence_el = None;
		if !self.writers.iter().all(|run| run.is_held) || !self.people.is_empty() {
			let agents: Vec<Agent> =
				self.writers.iter().filter(|run| !run.is_held).map(|run| run.agent).collect();
			let stop = self.stop_all.then_some(|_: &mut SceneState| {});
			presence_el = Some(presence(t, LANG, &agents, &self.people, stop));
		}
		let bar = document_bar(
			t,
			LANG,
			DocumentBar {
				name: &self.title,
				is_read_only: false,
				presence: presence_el,
				actions: BarActions::EVERY,
			},
			ignore,
		);
		let page = col().w_full().h_full().min_h(0.0).child(bar).child(document_column(
			t,
			heading,
			self.detail,
			body,
		));
		let mut windows = Vec::new();
		if self.overlay == Overlay::DeleteConfirm {
			windows = delete_confirmation(t, LANG, &self.title, true, ignore);
		}
		if let Some(lifted) = self.gallery(t, s).and_then(|(_, lifted)| lifted) {
			windows.push(lifted.absolute(DRAG_CURSOR.0, DRAG_CURSOR.1 - SPACING * 20.0));
		}
		framed_with(t, page, layers, windows)
	}

	fn gallery(&self, t: &Tokens, s: &SceneState) -> Option<(El, Option<El>)> {
		let Rich::GalleryEditing { has_failed_tile, drag } = self.rich else { return None };
		let index = self.blocks.iter().position(|(source, _)| source.starts_with("```gallery"))?;
		let (_, body) = fence_body(&self.blocks[index].0);
		let records = records_of(&body);
		let tiles: Vec<Tile> = records
			.iter()
			.enumerate()
			.map(|(at, record)| {
				let src = field_of(record, "image");
				let is_broken = has_failed_tile && (at == 1 || at == 5);
				let image = if is_broken { TileImage::Failed } else { s.library.stored(src) };
				Tile { image, alt: field_of(record, "alt") }
			})
			.collect();
		let block = format!("blk{:03}", index + 1);
		let edits = (0..tiles.len()).map(|at| edit_of(s, &block, at)).collect();
		let edit = GalleryEdit {
			block: &block,
			tiles: &tiles,
			captions: edits,
			columns: if self.narrow { 2 } else { 5 },
			drag,
			has_add_failed: false,
		};
		Some(gallery_editor(t, LANG, &edit, field, heard))
	}

	fn editor_block<'a>(
		&self,
		t: &Tokens,
		s: &'a SceneState,
		index: usize,
		block: &'a LibraryBlock,
	) -> EditorBlock<'a> {
		let kind = block.kind();
		let rows: Vec<(RowMark, &TextEdit)> = if kind.is_text() {
			s.library
				.fields
				.iter()
				.filter(|(id, _, _)| *id == block.id)
				.zip(rows_of(&block.source))
				.map(|((_, _, edit), line)| (line.mark, edit))
				.collect()
		} else {
			Vec::new()
		};
		let mut view = EditorBlock::new(&block.id, kind, rows, &block.source);
		view.depths = rows_of(&block.source).iter().map(|line| line.depth).collect();
		let placeholder = self.blocks[index].1;
		if !placeholder.is_empty() {
			view.placeholder = Some(placeholder);
		}
		for run in &self.writers {
			if block.source.contains(run.sentence) && !run.is_held {
				view.end = Some(agent_caret(t, run.agent));
			}
		}
		let is_focused = self.focus.is_some_and(|(at, _, _)| at == index);
		if is_focused {
			view.drawn = self.drawn(t, s, block);
			if self.rich == Rich::Checklist {
				view.ringed_row = self.focus.map(|(_, row, _)| row);
			}
		}
		if view.drawn.is_none() && !kind.is_text() {
			let picture = |src: &str| s.library.stored(src);
			view.drawn = Some(body_block(t, LANG, &block.source, &[], &picture));
		}
		view
	}

	fn cell(
		&self,
		t: &Tokens,
		s: &SceneState,
		block: &str,
		kind: LibraryBlockType,
		row: usize,
	) -> El {
		match s.library.fields.iter().find(|(id, at, _)| id == block && *at == row) {
			Some((_, _, edit)) => block_text(
				t,
				LANG,
				&EditorBlock::new(block, kind, Vec::new(), ""),
				row,
				edit,
				field,
				unhandled,
			),
			None => el(),
		}
	}

	fn drawn(&self, t: &Tokens, s: &SceneState, block: &LibraryBlock) -> Option<El> {
		match self.rich {
			Rich::None | Rich::Checklist => None,
			Rich::GalleryEditing { .. } => self.gallery(t, s).map(|(editor, _)| editor),
			Rich::Callout => {
				let tone = CalloutTone::of(&block.source);
				Some(callout_editor(
					t,
					LANG,
					tone,
					self.cell(t, s, &block.id, LibraryBlockType::Paragraph, 0),
				))
			}
			Rich::Code => {
				let (language, _) = fence_body(&block.source);
				let body = self.cell(t, s, &block.id, LibraryBlockType::Code, 0);
				Some(code_view(t, LANG, language, body, true))
			}
			Rich::Table => {
				let cells = table_cells(&block.source);
				let columns = cells.first().map_or(1, Vec::len);
				let rows = (0..cells.len())
					.map(|row| {
						(0..columns)
							.map(|column| edit_of(s, &block.id, row * columns + column))
							.collect()
					})
					.collect();
				let focused =
					self.focus.map_or((0, 0), |(_, row, _)| (row / columns, row % columns));
				let table = TableCells { block: &block.id, rows, focused };
				Some(table_editor(t, LANG, &table, field, heard))
			}
			Rich::WebPage { has_failed } => {
				let (_, body) = fence_body(&block.source);
				let record = records_of(&body).into_iter().next().unwrap_or_default();
				let card = if has_failed {
					web_page_view(t, LANG, field_of(&record, "url"), field_of(&record, "title"))
				} else {
					web_page_view(t, LANG, SUITES.0, SUITES.1)
				};
				Some(web_page_editor(t, LANG, SUITES.0, card, has_failed))
			}
		}
	}
}

fn launch_review(markdown: &str) -> Spec {
	Spec::new(Heading::Field, LAUNCH_REVIEW_TITLE, LAUNCH_REVIEW_DETAIL, markdown)
}

fn agent_document() -> Spec {
	Spec::new(Heading::Field, BRIEF_NAME, AGENT_BRIEF_DETAIL, AGENT_BRIEF)
}

fn blank() -> Spec {
	let mut spec = Spec::new(Heading::Field, "", "Created just now", "");
	spec.blocks = vec![(String::new(), common::library::templates::blank::PLACEHOLDER.text(LANG))];
	spec
}

fn meeting_notes() -> Spec {
	use common::library::templates::meeting_notes as notes;
	let mut spec =
		Spec::new(Heading::Field, MEETING_TITLE, "Created just now from Meeting notes", "");
	spec.blocks = vec![
		(String::new(), notes::INTRO.text(LANG)),
		("## ".to_owned() + notes::decisions::HEADING.text(LANG), ""),
		(String::new(), notes::decisions::PLACEHOLDER.text(LANG)),
		("## ".to_owned() + notes::next_steps::HEADING.text(LANG), ""),
		(String::new(), notes::next_steps::PLACEHOLDER.text(LANG)),
	];
	spec
}

fn toolbar_on(format: Option<Format>) -> Overlay {
	Overlay::Toolbar(Toolbar::Above { pressed: format, hovered: None })
}

fn selection(selected: &'static str) -> Spec {
	launch_review(SELECTION_BODY).with(toolbar_on(None)).focus_on(selected, Caret::Select(selected))
}

fn formatted(markdown: &str, format: Format, selected: &'static str) -> Spec {
	launch_review(markdown)
		.with(toolbar_on(Some(format)))
		.focus_on(selected, Caret::Select(selected))
}

fn presence_document(writers: Vec<Run<'static>>, people: &[&'static str]) -> Spec {
	let mut spec = agent_document();
	spec.stop_all = !writers.is_empty();
	spec.writers = writers;
	spec.people = people.to_vec();
	spec
}

fn editor_spec(id: &str) -> Option<Spec> {
	if let Some(story) = id.strip_prefix("navigation-librarydocumenteditor--") {
		return document_editor_spec(story);
	}
	let story = id.strip_prefix("navigation-librarydocumentblockeditor--")?;
	block_editor_spec(story.trim_end_matches("-dark"))
}

fn document_editor_spec(story: &str) -> Option<Spec> {
	use common::library::failure::document as failure;
	let reviewed = || launch_review(LAUNCH_REVIEW);
	let renamed = || format!("{LAUNCH_REVIEW_TITLE} v2");
	let with_selection = |from: &str, to: &str, format: Format, selected: &'static str| {
		formatted(&SELECTION_BODY.replace(from, to), format, selected)
	};
	let spec = match story {
		"blank" => blank().focus_block(0, 0, Caret::End),
		"whitespace-title-reads-untitled" => {
			Spec::new(Heading::Field, "   ", LAUNCH_REVIEW_DETAIL, LAUNCH_REVIEW)
				.with(Overlay::DeleteConfirm)
		}
		"title-at-rest" | "title-escape-restores" => reviewed(),
		"existing-document" => {
			reviewed().focus_on("Ship on the 14th", Caret::After("Ship on the 14th"))
		}
		"title-focused-by-rename" => {
			let mut spec = reviewed();
			spec.title = renamed();
			let end = spec.title.len();
			spec.title_at(end)
		}
		"rename-focuses-title-from-handle" => reviewed().title_at(LAUNCH_REVIEW_TITLE.len()),
		"title-enter-moves-to-body" => {
			let mut spec = reviewed().focus_block(0, 0, Caret::Start);
			spec.title = renamed();
			spec
		}
		"title-click-away-keeps" => {
			let mut spec = reviewed().focus_on("We met", Caret::End);
			spec.title = renamed();
			spec
		}
		"title-emptied-restores" => reviewed().focus_on("Next steps", Caret::End),
		"title-restored-after-refused-rename" => {
			let mut spec = reviewed();
			spec.title = "Spring launch review".to_owned();
			spec
		}
		"from-meeting-notes" => {
			let mut spec = meeting_notes();
			spec.blocks[2].0 = "Ship".to_owned();
			spec.focus_block(2, 0, Caret::End)
		}
		"with-typed-text" => Spec::new(
			Heading::Field,
			"",
			"Created just now",
			"We agreed the date.\n\n# Decisions\n\n- Ship on the 14th\n- Copy is final on the 7th",
		)
		.focus_on("Copy is final", Caret::End),
		"column-at-maximum-width" => Spec::new(
			Heading::Field,
			"Launch decisions",
			"40 words · Edited today at 10:41",
			DECISIONS_TABLE,
		),
		"round-trip-fixture" => Spec::new(Heading::Field, "Launch plan", "", ROUND_TRIP)
			.focus_on("Launch plan", Caret::End),
		"blocks-rendered" | "blocks-rendered-light" => {
			Spec::new(Heading::Field, "Launch plan", "", ROUND_TRIP)
		}
		"bold-typed-then-rendered" => launch_review(&LAUNCH_REVIEW.replace(
			"Screenshots land on the 10th.",
			"Screenshots land on the 10th. Then **ship** it.",
		))
		.focus_on("Screenshots", Caret::End),
		"task-toggle" => Spec::new(
			Heading::Field,
			"Launch checklist",
			"",
			"- [x] Book the room\n- [ ] Send the invite",
		),
		"outside-change-while-typing" => launch_review(
			&LAUNCH_REVIEW
				.replace("Ship on the 14th", "Ship on the 14th, after the review call")
				.replace("Screenshots land on the 10th.", "Screenshots land on the 11th."),
		)
		.focus_on("after the review call", Caret::End),
		"multi-paragraph-paste" => {
			let mut spec = meeting_notes();
			spec.blocks.splice(2..3, PASTED.iter().map(|line| ((*line).to_owned(), "")));
			spec
		}
		"outside-title-change" => {
			let mut spec = reviewed();
			spec.title = "Spring launch review notes".to_owned();
			let end = spec.title.len();
			spec.title_at(end)
		}
		"caret-moves" => launch_review(&LAUNCH_REVIEW.replace("on the 10th", "on the 11th"))
			.title_at(LAUNCH_REVIEW_TITLE.len()),
		"click-below-the-last-line" => reviewed().focus_on("Screenshots", Caret::End),
		"agents-writing" | "presence-agents-only" => presence_document(runs().to_vec(), &[]),
		"agent-run-held-then-fades" => {
			let mut spec = agent_document();
			spec.writers = vec![Run { agent: ATLAS, sentence: ATLAS_SENTENCE, is_held: true }];
			spec
		}
		"person-caret-beside-agent" => {
			let mut spec = presence_document(vec![runs()[0]], &PEOPLE[..1]);
			let at = spec.block_with("Weekly active");
			spec.carets = vec![(at, PEOPLE[0], true)];
			spec
		}
		"presence-people-only" => presence_document(Vec::new(), &PEOPLE),
		"presence-agents-and-people" => presence_document(vec![runs()[0]], &PEOPLE[..3]),
		"create-failure" => blank().with(Overlay::Notice(failure::CREATE.text(LANG))),
		"open-failure" => blank().with(Overlay::Notice(failure::OPEN.text(LANG))),
		"save-failure" => reviewed().with(Overlay::Notice(failure::SAVE.text(LANG))),
		"write-failure" => agent_document().with(Overlay::Notice(WRITE_FAILURE)),
		"caret-share-failure" => reviewed().with(Overlay::Notice(failure::CARET.text(LANG))),
		"format-without-change"
		| "a-1-toolbar-above-selection"
		| "toolbar-after-drag"
		| "toolbar-after-keyboard-selection" => selection(LAUNCH_DATE),
		"a-2-toolbar-over-two-lines" => selection(
			"the launch date and who signs off the copy before the screenshots land, so the press kit",
		),
		"a-3-toolbar-button-hover" => selection(LAUNCH_DATE)
			.with(Overlay::Toolbar(Toolbar::Above { pressed: None, hovered: Some(Format::Bold) })),
		"a-4-toolbar-format-on" => selection("14th").with(toolbar_on(Some(Format::Bold))),
		"a-5-toolbar-link-field" | "link-field-confirmed" | "link-field-cancelled" => {
			selection(LAUNCH_DATE)
				.with(Overlay::Toolbar(Toolbar::Link("https://kiroshi.app/brief")))
		}
		"a-6-toolbar-flipped-below" => {
			let weeks: Vec<String> = (1..=8)
				.map(|week| format!("Week {week} brings the next round of screenshots and copy."))
				.collect();
			let mut spec = launch_review(&format!("{SELECTION_BODY}\n\n{}", weeks.join("\n\n")));
			spec.blocks.drain(..1);
			spec.focus_on("Ship on the", Caret::Select("Ship on the"))
				.with(Overlay::Toolbar(Toolbar::Below))
		}
		"bold-shortcut" => {
			with_selection(LAUNCH_DATE, "**the launch date**", Format::Bold, LAUNCH_DATE)
		}
		"italic-shortcut" => {
			with_selection(LAUNCH_DATE, "*the launch date*", Format::Italic, LAUNCH_DATE)
		}
		"strikethrough-shortcut" => {
			with_selection(LAUNCH_DATE, "~~the launch date~~", Format::Strikethrough, LAUNCH_DATE)
		}
		"code-shortcut" => {
			with_selection(LAUNCH_DATE, "`the launch date`", Format::Code, LAUNCH_DATE)
		}
		"link-shortcut" => with_selection(
			LAUNCH_DATE,
			"[the launch date](https://kiroshi.app/brief)",
			Format::Link,
			LAUNCH_DATE,
		),
		"escape-closes-toolbar" => launch_review(&SELECTION_BODY.replace(LAUNCH_DATE, "x"))
			.focus_on("agree x", Caret::After("agree x")),
		"format-bold" => {
			with_selection("Screenshots land", "**Screenshots** land", Format::Bold, "Screenshots")
		}
		"format-italic" => {
			with_selection("Screenshots land", "*Screenshots* land", Format::Italic, "Screenshots")
		}
		"format-strikethrough" => with_selection(
			"Screenshots land",
			"~~Screenshots~~ land",
			Format::Strikethrough,
			"Screenshots",
		),
		"format-inline-code" => {
			with_selection("Screenshots land", "`Screenshots` land", Format::Code, "Screenshots")
		}
		"format-link" => with_selection(
			"Screenshots land",
			"[Screenshots](https://kiroshi.app/brief) land",
			Format::Link,
			"Screenshots",
		),
		"format-heading-2" => with_selection(
			"Screenshots land",
			"## Screenshots land",
			Format::Heading,
			"Screenshots",
		),
		"format-bullet-list" => {
			with_selection("Screenshots land", "- Screenshots land", Format::List, "Screenshots")
		}
		"gallery-images-resolved" => {
			Spec::new(Heading::Field, LAUNCH_REVIEW_TITLE, LAUNCH_REVIEW_DETAIL, &stored_gallery(6))
		}
		_ => return None,
	};
	Some(spec)
}

fn fixed(markdown: &str) -> Spec {
	Spec::new(Heading::Fixed, BRIEF_NAME, AGENT_BRIEF_DETAIL, markdown)
}

fn url_gallery(items: &[&str]) -> String {
	let records: Vec<String> = items
		.iter()
		.map(|name| {
			let alt = STORED
				.iter()
				.find(|(stored, _, _)| stored == name)
				.map_or(*name, |(_, alt, _)| alt);
			let caption = if *name == "sofa-grey" {
				format!("\n  caption: {GREY_CAPTION}")
			} else {
				String::new()
			};
			format!("- image: https://images.example.org/{name}.jpg\n  alt: {alt}{caption}")
		})
		.collect();
	format!("{GALLERY_LEAD}\n\n```gallery\n{}\n```", records.join("\n"))
}

const THREE_IMAGES: [&str; 3] = ["sofa-green", "sofa-grey", "armchair-rust"];
const SEVEN_IMAGES: [&str; 7] = [
	"sofa-green",
	"sofa-grey",
	"armchair-rust",
	"lamp-brass",
	"rug-wool",
	"table-oak",
	"shelf-pine",
];

fn block_editor_spec(story: &str) -> Option<Spec> {
	let long_brief = format!("{AGENT_BRIEF}{LONG_BRIEF_TAIL}");
	let editing = |drag| Rich::GalleryEditing { has_failed_tile: false, drag };
	let broken = Rich::GalleryEditing { has_failed_tile: true, drag: None };
	let spec = match story {
		"slash-menu-near-bottom" => {
			let mut spec = fixed(&format!("{long_brief}\n\n/"));
			let last = spec.blocks.len() - 1;
			spec.focus = Some((last, 0, Caret::End));
			spec.with(Overlay::Slash { query: "", is_above: true })
		}
		"slash-menu-filtered" => {
			let mut spec = fixed(&long_brief);
			let at = spec.block_with("Every document opens") + 1;
			spec.blocks.insert(at, ("/cal".to_owned(), ""));
			spec.focus = Some((at, 0, Caret::End));
			spec.with(Overlay::Slash { query: "cal", is_above: false })
		}
		"focused-heading" => fixed(MARKED_DOCUMENT).focus_on("Launch plan", Caret::End),
		"focused-list-item" => fixed(MARKED_DOCUMENT).focus_on("Send the invite", Caret::End),
		"focused-to-do-item" => fixed(MARKED_DOCUMENT).focus_on("Order the cake", Caret::End),
		"focused-quote" => fixed(MARKED_DOCUMENT).focus_on("The export keeps", Caret::End),
		"focused-every-inline-mark" => fixed(MARKED_DOCUMENT).focus_on("Ship ", Caret::After("bo")),
		"block-handle-menu" | "block-menu-row-pressed" => {
			fixed(AGENT_BRIEF).focus_on("The spring launch", Caret::End).with(Overlay::HandleMenu)
		}
		"block-handle-pressed" | "block-moved-by-handle" => {
			fixed(AGENT_BRIEF).focus_on("The spring launch", Caret::End).with(Overlay::Handle)
		}
		"drag-with-drop-indicator" => {
			let spec = fixed(AGENT_BRIEF);
			let at = spec.block_with("## What we measure");
			spec.with(Overlay::DropBelow(at))
		}
		"turn-into-open" => {
			fixed(AGENT_BRIEF).focus_on("What we measure", Caret::End).with(Overlay::TurnInto)
		}
		"block-drag-in-progress" => {
			let spec = fixed(AGENT_BRIEF);
			let below = spec.block_with("## What we measure");
			spec.with(Overlay::BlockDrag { from: 0, below })
		}
		"move-down-disabled-at-the-last-block" => {
			fixed(AGENT_BRIEF).focus_on("Copy is final", Caret::End).with(Overlay::HandleMenu)
		}
		"bubble-and-document-parity" => fixed(RICH_BLOCKS),
		"agents-writing" => {
			let mut spec = fixed(AGENT_BRIEF);
			spec.writers = runs().to_vec();
			spec
		}
		"callout-body-shows-its-marks" => {
			let spec = fixed(RICH_TEXT_DOCUMENT);
			let at = spec.block_with("[!NOTE]");
			spec.rich(Rich::Callout, at)
		}
		"table-cell-shows-its-marks" => {
			let spec = fixed(RICH_TEXT_DOCUMENT);
			let at = spec.block_with("| Room");
			spec.focus_block(at, 2, Caret::End).rich(Rich::Table, at)
		}
		"escape-shows-the-character" => fixed(RICH_TEXT_DOCUMENT).focus_on("Costs", Caret::End),
		"autolink-shows-its-text" => fixed(RICH_TEXT_DOCUMENT).focus_on("Write to", Caret::End),
		"inline-image-is-one-node" => {
			fixed(RICH_TEXT_DOCUMENT).focus_on("See ", Caret::After("See "))
		}
		"nested-list-keeps-its-indent" => fixed(RICH_TEXT_DOCUMENT).focus_on("Mira", Caret::End),
		"emptied-blocks-keep-their-type" => {
			let mut spec = fixed("");
			spec.blocks = EMPTIED_DOCUMENT
				.iter()
				.map(|(source, placeholder)| ((*source).to_owned(), *placeholder))
				.collect();
			spec.focus_block(3, 0, Caret::End)
		}
		"person-caret-at-block-edges" => {
			let mut spec = fixed(AGENT_BRIEF);
			let changes = spec.block_with("## What changes");
			let measure = spec.block_with("Weekly active");
			spec.carets = vec![(changes, "Ada Martin", true), (measure, "Noé Petit", false)];
			spec
		}
		"narrow-column" => {
			let mut spec = fixed(&url_gallery(&THREE_IMAGES)).rich(editing(None), 1);
			spec.narrow = true;
			spec.with(Overlay::Handle)
		}
		"gallery-editing"
		| "gallery-editing-at-320"
		| "gallery-image-added"
		| "gallery-image-removed"
		| "gallery-image-moved"
		| "gallery-caption-edited" => {
			let mut spec = fixed(&url_gallery(&THREE_IMAGES)).rich(editing(None), 1);
			spec.narrow = story.ends_with("320");
			spec
		}
		"gallery-tile-dragged" => fixed(&url_gallery(&THREE_IMAGES))
			.rich(editing(Some(GalleryDrag { from: 0, to: 2 })), 1),
		"gallery-images-resolved" => fixed(&stored_gallery(6)).rich(editing(None), 1),
		"gallery-image-resolving" | "gallery-image-failing" => {
			fixed(&stored_gallery(6)).rich(broken, 1)
		}
		"gallery-beyond-five" => fixed(&url_gallery(&SEVEN_IMAGES)).rich(editing(None), 1),
		"checklist-editing" => {
			fixed(CHECKLIST_DOCUMENT).focus_block(1, 2, Caret::End).rich(Rich::Checklist, 1)
		}
		"checklist-item-moved" => fixed(CHECKLIST_MOVED)
			.focus_block(1, 2, Caret::End)
			.rich(Rich::Checklist, 1)
			.with(Overlay::Handle),
		"callout-tone-switch" => fixed(CALLOUT_DOCUMENT).rich(Rich::Callout, 1),
		"table-editing" | "table-editing-at-320" | "table-cell-edited" | "table-focus-moved" => {
			let mut spec = fixed(TABLE_DOCUMENT).focus_block(1, 5, Caret::End).rich(Rich::Table, 1);
			spec.narrow = story.ends_with("320");
			spec
		}
		"code-language-chosen" => fixed(CODE_DOCUMENT).rich(Rich::Code, 1),
		"web-page-link-updated" => {
			fixed(WEB_PAGE_DOCUMENT).rich(Rich::WebPage { has_failed: false }, 1)
		}
		"web-page-link-failed" => {
			fixed(WEB_PAGE_DOCUMENT).rich(Rich::WebPage { has_failed: true }, 1)
		}
		_ => return None,
	};
	Some(spec)
}

pub(super) const fn library(id: &'static str, view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene {
		id,
		size: ARTBOARD,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		keys: "",
		themes: &THEMES,
		view,
	}
}

pub(super) const fn acted(
	id: &'static str,
	size: (f32, f32),
	tabs: usize,
	keys: &'static str,
	pointer: Pointer,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size, tabs, pointer, typed: "", keys, themes: &THEMES, view }
}

pub(super) const fn searched(
	id: &'static str,
	typed: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene {
		id,
		size: ARTBOARD,
		tabs: 0,
		pointer: Pointer::Away,
		typed,
		keys: "",
		themes: &THEMES,
		view,
	}
}

pub(super) const fn tabbed(
	id: &'static str,
	tabs: usize,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene {
		id,
		size: ARTBOARD,
		tabs,
		pointer: Pointer::Away,
		typed: "",
		keys: "",
		themes: &THEMES,
		view,
	}
}

pub(super) const fn narrow(id: &'static str, view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene {
		id,
		size: NARROW,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		keys: "",
		themes: &THEMES,
		view,
	}
}

pub(super) const fn threaded(
	id: &'static str,
	tabs: usize,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene {
		id,
		size: THREAD,
		tabs,
		pointer: Pointer::Away,
		typed: "",
		keys: "",
		themes: &THEMES,
		view,
	}
}

pub(super) const fn small_window(id: &'static str, view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene {
		id,
		size: SMALL_WINDOW,
		tabs: 0,
		pointer: Pointer::Away,
		typed: "",
		keys: "",
		themes: &THEMES,
		view,
	}
}
