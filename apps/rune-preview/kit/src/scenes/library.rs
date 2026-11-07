use rune::image::{Image, ImageCache};
use rune::{Block, El, Mark, MarkRange, TextEdit, col, el, row};

use super::{Pointer, Scene, SceneState};
use crate::strings::Language;
use crate::surfaces::s14_library::{
	BlockEvent, DocumentBar, EditorBlock, ItemLook, LibraryBlock, LibraryBlockType, LibraryFilter,
	LibraryItem, LibraryPanel, LightboxImage, NewDocumentTemplate, PanelActions, PanelState,
	RowMark, Slash, Unavailable, block_editor, document_bar, document_body, document_column,
	document_panel, document_placeholder, document_skeleton, document_title, drop_line,
	failed_import, grid_columns, image_skeleton, item_unavailable, library_panel, lightbox,
	new_document_dialog, parse_blocks, rows_of, shown_name,
};
use crate::tokens::{BLUE, RADIUS_CONTROL, SPACING, Tokens};

pub const ARTBOARD: (f32, f32) = (1280.0, 832.0);
const NARROW: (f32, f32) = (560.0, 832.0);
const FRAME_START: f32 = SPACING * 15.0;
const FRAME_END: f32 = SPACING * 1.5;
const FRAME_BLOCK: f32 = SPACING * 2.0;
const LANG: Language = Language::En;
const IMAGE_SIDE: f32 = 320.0;
const IMAGE_SCALE: f32 = 2.0;

const DUNES: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#2b3a55'/><circle cx='118' cy='30' r='14' fill='#f6c177'/><path d='M0 70 Q40 50 80 68 T160 62 V100 H0Z' fill='#c9895b'/><path d='M0 84 Q50 66 100 82 T160 80 V100 H0Z' fill='#8f5a3c'/></svg>";
const HARBOUR: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1400' height='1000' viewBox='0 0 140 100'><rect width='140' height='100' fill='#0f2a3d'/><rect y='60' width='140' height='40' fill='#123e57'/><rect x='18' y='38' width='22' height='22' fill='#e2e8f0'/><rect x='46' y='30' width='16' height='30' fill='#94a3b8'/><rect x='92' y='42' width='30' height='18' fill='#cbd5e1'/></svg>";
const FERN: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='1200' viewBox='0 0 100 120'><rect width='100' height='120' fill='#14281d'/><ellipse cx='50' cy='60' rx='18' ry='46' fill='#3f7d4e'/><ellipse cx='30' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(-24 30 70)'/><ellipse cx='70' cy='70' rx='10' ry='30' fill='#5aa469' transform='rotate(24 70 70)'/></svg>";
const DASHBOARD: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='1000' viewBox='0 0 160 100'><rect width='160' height='100' fill='#f4f4f5'/><rect width='34' height='100' fill='#18181b'/><rect x='44' y='12' width='60' height='8' rx='2' fill='#27272a'/><rect x='44' y='30' width='50' height='30' rx='3' fill='#bfdbfe'/><rect x='100' y='30' width='50' height='30' rx='3' fill='#fde68a'/><rect x='44' y='68' width='106' height='22' rx='3' fill='#e4e4e7'/></svg>";
const DUSK: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1200' height='1200' viewBox='0 0 100 100'><rect width='100' height='100' fill='#3b1f47'/><rect y='55' width='100' height='45' fill='#7a3b5c'/><circle cx='50' cy='55' r='18' fill='#f59e8b'/><rect y='70' width='100' height='30' fill='#2a1633'/></svg>";
const SKETCH: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='1600' height='900' viewBox='0 0 160 90'><rect width='160' height='90' fill='#fafaf9'/><path d='M20 70 L60 30 L90 55 L140 20' stroke='#1c1917' stroke-width='2' fill='none'/><circle cx='60' cy='30' r='4' fill='#ef4444'/><circle cx='90' cy='55' r='4' fill='#3b82f6'/></svg>";

pub const PICTURES: [&str; 6] = [DUNES, HARBOUR, FERN, DASHBOARD, DUSK, SKETCH];

#[derive(Clone, Copy)]
enum Picture {
	Dunes,
	Harbour,
	Fern,
	Dashboard,
	Dusk,
	Sketch,
}

const BRIEF_EXCERPT: &str = "# Spring launch brief\n\nWhat we're shipping on the 14th, who it's for and the three messages every page repeats.\n\n## Audience\n\nTeams of five to twenty who already keep their notes in a shared folder.";
const MEETING_EXCERPT: &str = "# Weekly sync\n\nThe onboarding copy is final; the pricing page waits on the new screenshots.\n\n## Decisions\n\n- Ship the import strip first\n- Keep the templates to three";
const RESEARCH_EXCERPT: &str = "# Interview notes\n\nSix conversations with design leads about where their references live today.\n\n## Patterns\n\nEveryone keeps a folder nobody else can find.";
const CHECKLIST_EXCERPT: &str = "# Launch checklist\n\n- Final copy review\n- Screenshots at 2x\n- Release notes drafted\n- Support macros updated";

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

const LONG_IMAGE_NAME: &str =
	"hero-dunes-final-final-approved-by-marketing-and-legal-v12-export-2x.png";
const LONG_DOCUMENT_NAME: &str =
	"Spring launch brief for the partner newsletter, the pricing page and the onboarding emails";

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

const BRIEF_NAME: &str = "Spring launch brief";
const BRIEF_DETAIL: &str = "1,240 words · Edited today at 10:41";
const AGENT_BRIEF_DETAIL: &str = "1,262 words · Edited just now";
const SPRING_BRIEF: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats, so the copy, the screenshots and the release notes say the same thing.\n\n## Audience\n\nTeams of five to twenty who already keep their notes and references in a shared folder, and lose them there. They don't want another tool; they want the folder to stop forgetting.\n\n## Messages\n\n- Everything the Space holds, in one place.\n- Images and documents side by side, searchable by name.\n- Nothing to set up: drop files in and they're there.\n\n## Timeline\n\nCopy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.";
const DOCUMENT_BODY: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats.\n\n## Before the 14th\n\n- [x] Copy is final\n- [x] Screenshots land\n- [ ] Release notes are signed off\n\nRelease notes go out with the build on the morning of the 14th";
const AGENT_BRIEF: &str = "The spring launch puts the Library in front of every team on the 14th. This brief collects what we're shipping, who it's for and the three messages every page repeats.\n\n## What changes\n\n- Every document opens in place of the grid, one click from the Library.\n- Agents write straight into the document you have open.\n- Notifications wait for the first finished task, and the agent says why it asks\n\n## What we measure\n\nWeekly active Spaces is the one number we report on launch day, read against the four weeks before it and against the same weeks of last spring.\n\nWe also count how often someone stops an agent in its\n\n## Timeline\n\nCopy is final on the 7th, screenshots land on the 10th, and the release notes go out with the build on the morning of the 14th.";
const LONG_BRIEF_TAIL: &str = "\n\n## Open questions\n\nWhether the import strip ships with the build or a week after it is still open, and support wants a say before the 10th.\n\nThe pricing page waits on the new screenshots, so its copy may slip to the release notes.\n\n/";
const MARKED_DOCUMENT: &str = "## Launch plan\n\n- Book the **room**\n- Send the invite\n\n> The export keeps the archived rooms too.\n\n- [ ] Print the **badges**\n- [x] Order the cake\n\nShip **bold** with _italic_, ~~struck~~, `code` and a [link](https://kiroshi.app) today.";
const FAILED_NAME: &str = "rooftop.heic";
const DROPPED_COUNT: usize = 3;

pub struct LibraryScene {
	pictures: Vec<Image>,
	fields: Vec<(String, usize, TextEdit)>,
}

impl LibraryScene {
	pub fn new(scene: &Scene) -> LibraryScene {
		let fields = match focus_of(scene.id) {
			Some((markdown, focus)) => editor_fields(markdown, focus),
			None => Vec::new(),
		};
		LibraryScene { pictures: Vec::new(), fields }
	}

	pub fn decode(&mut self, images: &ImageCache) {
		self.pictures = PICTURES
			.iter()
			.map(|svg| {
				let picture = images.svg(svg.as_bytes(), IMAGE_SIDE, IMAGE_SCALE);
				if let Err(failure) = picture.wait() {
					eprintln!("a Library picture didn't decode: {}", failure.0);
				}
				picture
			})
			.collect();
	}

	fn picture(&self, picture: Picture) -> Option<&Image> {
		self.pictures.get(picture as usize)
	}
}

#[derive(Clone, Copy)]
enum Focus {
	Kind(LibraryBlockType),
	Last,
}

fn focus_of(id: &str) -> Option<(String, Focus)> {
	let story = id.strip_prefix("navigation-librarydocumentblockeditor--")?;
	let marked = |kind| Some((MARKED_DOCUMENT.to_owned(), Focus::Kind(kind)));
	match story.trim_end_matches("-dark") {
		"slash-menu-near-bottom" => Some((format!("{AGENT_BRIEF}{LONG_BRIEF_TAIL}"), Focus::Last)),
		"focused-heading" => marked(LibraryBlockType::Heading),
		"focused-list-item" => marked(LibraryBlockType::List),
		"focused-to-do-item" => marked(LibraryBlockType::Checklist),
		"focused-quote" => marked(LibraryBlockType::Quote),
		"focused-every-inline-mark" => marked(LibraryBlockType::Paragraph),
		_ => None,
	}
}

fn block_ids(markdown: &str) -> Vec<LibraryBlock> {
	let mut count = 0;
	parse_blocks(markdown, || {
		count += 1;
		format!("blk{count:03}")
	})
}

fn editor_fields(markdown: String, focus: Focus) -> Vec<(String, usize, TextEdit)> {
	let blocks = block_ids(&markdown);
	let focused = match focus {
		Focus::Kind(kind) => blocks.iter().position(|block| block.kind() == kind),
		Focus::Last => blocks.len().checked_sub(1),
	};
	let mut fields = Vec::new();
	for (index, block) in blocks.iter().enumerate() {
		if !block.kind().is_text() {
			continue;
		}
		let rows = rows_of(&block.source);
		let last = rows.len() - 1;
		for (row_index, line) in rows.into_iter().enumerate() {
			let mut edit = marked_field(&line.text);
			if focused == Some(index) && row_index == last {
				edit.focused = true;
				edit.set_caret(edit.text.len());
			}
			fields.push((block.id.clone(), row_index, edit));
		}
	}
	fields
}

fn marked_field(markdown: &str) -> TextEdit {
	const SIGNS: [(&str, Mark); 4] =
		[("**", Mark::Bold), ("~~", Mark::Strike), ("_", Mark::Italic), ("`", Mark::Code)];
	let mut text = String::new();
	let mut marks = Vec::new();
	let mut rest = markdown;
	'scan: while !rest.is_empty() {
		for (sign, mark) in SIGNS {
			if let Some(after) = rest.strip_prefix(sign)
				&& let Some(end) = after.find(sign)
			{
				let start = text.len();
				text.push_str(&after[..end]);
				marks.push(MarkRange::new(start..text.len(), mark));
				rest = &after[end + sign.len()..];
				continue 'scan;
			}
		}
		if let Some(after) = rest.strip_prefix('[')
			&& let Some((label, tail)) = after.split_once("](")
			&& let Some((url, tail)) = tail.split_once(')')
		{
			let start = text.len();
			text.push_str(label);
			marks.push(MarkRange::new(start..text.len(), Mark::Link(url.to_owned())));
			rest = tail;
			continue;
		}
		let next = rest.chars().next().map_or(1, char::len_utf8);
		text.push_str(&rest[..next]);
		rest = &rest[next..];
	}
	let lines = text.matches('\n').count() + 1;
	TextEdit::from_parts(text, marks, vec![Block::Paragraph; lines])
}

fn field<'a>(s: &'a mut SceneState, block: &str, index: usize) -> &'a mut TextEdit {
	match s.library.fields.iter().position(|(id, at, _)| id == block && *at == index) {
		Some(found) => &mut s.library.fields[found].2,
		None => &mut s.edit,
	}
}

fn query(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

fn tinted(t: &Tokens) -> Tokens {
	t.in_space(Some(BLUE))
}

fn framed(t: &Tokens, content: El, layers: Vec<El>) -> El {
	let card = col()
		.grow(1.0)
		.min_w(0.0)
		.h_full()
		.radius(RADIUS_CONTROL)
		.clip_rounded(RADIUS_CONTROL)
		.border(1.0, t.shell_border)
		.fill(t.card)
		.child(content)
		.children(layers);
	rune_kit::root(
		row()
			.w_full()
			.h_full()
			.fill(t.background)
			.pl(FRAME_START)
			.pr(FRAME_END)
			.py(FRAME_BLOCK)
			.child(card),
		Vec::new(),
	)
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

fn panel_scene(
	t: &Tokens,
	s: &SceneState,
	items: &[LibraryItem],
	state: PanelState,
	filter: LibraryFilter,
	actions: PanelActions,
) -> El {
	let t = &tinted(t);
	let panel = LibraryPanel {
		state,
		items,
		filter,
		query: &s.edit,
		actions,
		columns: grid_columns(card_width(ARTBOARD)),
	};
	framed(t, library_panel(t, LANG, &panel, query, |_: &mut SceneState, _| {}), Vec::new())
}

fn every_item(s: &SceneState) -> Vec<LibraryItem<'_>> {
	ITEMS.iter().map(|fixture| item(s, fixture)).collect()
}

fn ready(t: &Tokens, s: &SceneState, items: &[LibraryItem], filter: LibraryFilter) -> El {
	panel_scene(t, s, items, PanelState::Ready, filter, PanelActions::EVERY)
}

pub(super) fn grid_all(t: &Tokens, s: &SceneState) -> El {
	ready(t, s, &every_item(s), LibraryFilter::All)
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

pub(super) fn added_to_the_grid(t: &Tokens, s: &SceneState) -> El {
	let mut items = vec![
		item(s, &IMPORTED[0]),
		LibraryItem { import_progress: Some(IMPORT_PROGRESS), ..item(s, &IMPORTED[1]) },
	];
	items.extend(every_item(s));
	ready(t, s, &items, LibraryFilter::All)
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

fn document_page(
	t: &Tokens,
	name: &str,
	detail: &str,
	is_read_only: bool,
	heading: El,
	body: El,
) -> El {
	let bar = document_bar(
		t,
		LANG,
		DocumentBar { name, is_read_only, presence: None },
		|_: &mut SceneState, _| {},
	);
	framed(
		t,
		col()
			.w_full()
			.h_full()
			.min_h(0.0)
			.child(bar)
			.child(document_column(t, heading, detail, body)),
		Vec::new(),
	)
}

pub(super) fn document_default(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	document_page(
		t,
		BRIEF_NAME,
		BRIEF_DETAIL,
		false,
		document_title(t, BRIEF_NAME),
		document_body(t, SPRING_BRIEF),
	)
}

pub(super) fn document_whitespace_name(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let name = shown_name("   ", LANG);
	document_page(
		t,
		"   ",
		BRIEF_DETAIL,
		false,
		document_title(t, name),
		document_body(t, SPRING_BRIEF),
	)
}

pub(super) fn document_read_only(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	document_page(
		t,
		BRIEF_NAME,
		BRIEF_DETAIL,
		true,
		document_title(t, BRIEF_NAME),
		document_body(t, DOCUMENT_BODY),
	)
}

pub(super) fn document_empty(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let untitled = rune::text(shown_name("", LANG).to_owned())
		.font(crate::tokens::TEXT_TITLE)
		.color(t.title_placeholder_foreground);
	let start = document_placeholder(t, LANG, |_: &mut SceneState, _| {});
	document_page(t, "", "Created just now", false, untitled, start)
}

pub(super) fn document_files_dropped(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let blocks: Vec<&str> = DOCUMENT_BODY.split("\n\n").collect();
	let body = col()
		.w_full()
		.gap(SPACING * 3.5)
		.child(document_body(t, &blocks[..2].join("\n\n")))
		.child(drop_line(t, LANG, DROPPED_COUNT))
		.child(document_body(t, &blocks[2..].join("\n\n")));
	document_page(t, BRIEF_NAME, BRIEF_DETAIL, false, document_title(t, BRIEF_NAME), body)
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
					FAILED_NAME,
					|_: &mut SceneState| {},
					|_: &mut SceneState| {},
				)),
		);
	let body = col().w_full().gap(SPACING * 3.5).child(document_body(t, first)).child(gallery);
	document_page(t, BRIEF_NAME, BRIEF_DETAIL, false, document_title(t, BRIEF_NAME), body)
}

fn new_document(t: &Tokens, selected: NewDocumentTemplate) -> El {
	let t = &tinted(t);
	let layers = new_document_dialog(t, LANG, selected, |_: &mut SceneState, _| {});
	rune_kit::root(row().w_full().h_full().fill(t.background), layers)
}

pub(super) fn meeting_notes_selected(t: &Tokens, _: &SceneState) -> El {
	new_document(t, NewDocumentTemplate::MeetingNotes)
}

pub(super) fn blank_selected(t: &Tokens, _: &SceneState) -> El {
	new_document(t, NewDocumentTemplate::Blank)
}

fn lightbox_at(t: &Tokens, s: &SceneState, position: usize) -> El {
	let t = &tinted(t);
	let (name, detail, picture) = LIGHTBOX_IMAGES[position];
	let shown = LightboxImage { name, detail, image: s.library.picture(picture) };
	let behind = PanelActions::EVERY;
	let items = every_item(s);
	let panel = LibraryPanel {
		state: PanelState::Ready,
		items: &items,
		filter: LibraryFilter::All,
		query: &s.edit,
		actions: behind,
		columns: grid_columns(card_width(ARTBOARD)),
	};
	let grid = library_panel(t, LANG, &panel, query, |_: &mut SceneState, _| {});
	let over =
		lightbox(LANG, &shown, position + 1, LIGHTBOX_IMAGES.len(), |_: &mut SceneState, _| {});
	framed(t, grid, vec![over])
}

pub(super) fn lightbox_default(t: &Tokens, s: &SceneState) -> El {
	lightbox_at(t, s, 1)
}

pub(super) fn lightbox_first(t: &Tokens, s: &SceneState) -> El {
	lightbox_at(t, s, 0)
}

pub(super) fn document_panel_in_thread(t: &Tokens, _: &SceneState) -> El {
	let t = &tinted(t);
	let aside = document_panel(
		t,
		LANG,
		BRIEF_NAME,
		None,
		document_body(t, DOCUMENT_BODY),
		|_: &mut SceneState, _| {},
	);
	rune_kit::root(
		row().w_full().h_full().fill(t.background).child(el().grow(1.0)).child(aside),
		Vec::new(),
	)
}

fn editor_scene(t: &Tokens, s: &SceneState, markdown: &str, slash: bool) -> El {
	let t = &tinted(t);
	let blocks = block_ids(markdown);
	let views: Vec<EditorBlock> = blocks
		.iter()
		.map(|block| {
			let rows = s
				.library
				.fields
				.iter()
				.filter(|(id, _, _)| *id == block.id)
				.zip(rows_of(&block.source))
				.map(|((_, _, edit), line)| (line.mark, edit))
				.collect::<Vec<(RowMark, &TextEdit)>>();
			EditorBlock { id: &block.id, kind: block.kind(), rows, source: &block.source }
		})
		.collect();
	let slash = slash.then(|| Slash {
		block: &blocks[blocks.len() - 1].id,
		field: 0,
		active: 0,
		is_above: true,
	});
	let (body, layers) =
		block_editor(t, LANG, &views, slash, field, |_: &mut SceneState, _: BlockEvent| false);
	let bar = document_bar(
		t,
		LANG,
		DocumentBar { name: BRIEF_NAME, is_read_only: false, presence: None },
		|_: &mut SceneState, _| {},
	);
	let page = col().w_full().h_full().min_h(0.0).child(bar).child(document_column(
		t,
		document_title(t, BRIEF_NAME),
		AGENT_BRIEF_DETAIL,
		body,
	));
	framed(t, page, layers)
}

pub(super) fn slash_menu_near_bottom(t: &Tokens, s: &SceneState) -> El {
	editor_scene(t, s, &format!("{AGENT_BRIEF}{LONG_BRIEF_TAIL}"), true)
}

pub(super) fn focused_marked(t: &Tokens, s: &SceneState) -> El {
	editor_scene(t, s, MARKED_DOCUMENT, false)
}

pub(super) const fn library(id: &'static str, view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size: ARTBOARD, tabs: 0, pointer: Pointer::Away, typed: "", view }
}

pub(super) const fn searched(
	id: &'static str,
	typed: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: ARTBOARD, tabs: 0, pointer: Pointer::Away, typed, view }
}

pub(super) const fn tabbed(
	id: &'static str,
	tabs: usize,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { id, size: ARTBOARD, tabs, pointer: Pointer::Away, typed: "", view }
}

pub(super) const fn narrow(id: &'static str, view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size: NARROW, tabs: 0, pointer: Pointer::Away, typed: "", view }
}
