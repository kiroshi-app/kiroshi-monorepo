use rune::image::Image;
use rune::{
	Align, Color, Cursor, El, Key as KeyName, KeyEvent, ScrollSpec, Side, SurfaceFit, TextEdit,
	TextStyle, Tx, col, el, icon, row, text, text_input,
};
use rune_kit::{PopupItem, PopupList};

use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::scrim;
use crate::primitives::{FOCUS_RING_WIDTH, elevated, equal_padding, instant, ring_tint, tight};
use crate::strings::{Key, Language, common};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_MD, RADIUS_SM, RADIUS_XL, RADIUS_XS, SPACING, TEXT_10_MEDIUM,
	TEXT_BASE_SEMIBOLD, TEXT_COMPACT, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO, TEXT_READING,
	TEXT_SM_MEDIUM, TEXT_TITLE, TEXT_XS, TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens, faded,
};

pub const BLOCK_ID_LENGTH: usize = 6;
pub const BLOCK_ID_ALPHABET: &str = "abcdefghijklmnopqrstuvwxyz0123456789";
pub const BLOCK_GAP: &str = "\n\n";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryBlockType {
	Paragraph,
	Heading,
	List,
	Checklist,
	Quote,
	Gallery,
	Callout,
	Table,
	Code,
	WebPage,
	Collapsible,
	Other,
}

impl LibraryBlockType {
	pub const ALL: [LibraryBlockType; 12] = [
		LibraryBlockType::Paragraph,
		LibraryBlockType::Heading,
		LibraryBlockType::List,
		LibraryBlockType::Checklist,
		LibraryBlockType::Quote,
		LibraryBlockType::Gallery,
		LibraryBlockType::Callout,
		LibraryBlockType::Table,
		LibraryBlockType::Code,
		LibraryBlockType::WebPage,
		LibraryBlockType::Collapsible,
		LibraryBlockType::Other,
	];

	pub const SLASH: [LibraryBlockType; 10] = [
		LibraryBlockType::Heading,
		LibraryBlockType::List,
		LibraryBlockType::Checklist,
		LibraryBlockType::Quote,
		LibraryBlockType::Gallery,
		LibraryBlockType::Callout,
		LibraryBlockType::Table,
		LibraryBlockType::Code,
		LibraryBlockType::WebPage,
		LibraryBlockType::Collapsible,
	];

	pub fn name(self) -> &'static str {
		match self {
			LibraryBlockType::Paragraph => "paragraph",
			LibraryBlockType::Heading => "heading",
			LibraryBlockType::List => "list",
			LibraryBlockType::Checklist => "checklist",
			LibraryBlockType::Quote => "quote",
			LibraryBlockType::Gallery => "gallery",
			LibraryBlockType::Callout => "callout",
			LibraryBlockType::Table => "table",
			LibraryBlockType::Code => "code",
			LibraryBlockType::WebPage => "web-page",
			LibraryBlockType::Collapsible => "collapsible",
			LibraryBlockType::Other => "other",
		}
	}

	pub fn is_text(self) -> bool {
		matches!(
			self,
			LibraryBlockType::Paragraph
				| LibraryBlockType::Heading
				| LibraryBlockType::List
				| LibraryBlockType::Checklist
				| LibraryBlockType::Quote
		)
	}

	fn label(self) -> Key {
		use common::library::editor::blocks::types;
		match self {
			LibraryBlockType::Paragraph => types::PARAGRAPH,
			LibraryBlockType::Heading => types::HEADING,
			LibraryBlockType::List => types::LIST,
			LibraryBlockType::Checklist => types::CHECKLIST,
			LibraryBlockType::Quote => types::QUOTE,
			LibraryBlockType::Gallery => types::GALLERY,
			LibraryBlockType::Callout => types::CALLOUT,
			LibraryBlockType::Table => types::TABLE,
			LibraryBlockType::Code => types::CODE,
			LibraryBlockType::WebPage => types::WEB_PAGE,
			LibraryBlockType::Collapsible => types::COLLAPSIBLE,
			LibraryBlockType::Other => types::OTHER,
		}
	}

	fn glyph(self) -> &'static rune::Icon {
		match self {
			LibraryBlockType::Paragraph => &icons::TYPE,
			LibraryBlockType::Heading => &icons::HEADING,
			LibraryBlockType::List => &icons::LIST,
			LibraryBlockType::Checklist => &icons::LIST_TODO,
			LibraryBlockType::Quote => &icons::QUOTE,
			LibraryBlockType::Gallery => &icons::IMAGES,
			LibraryBlockType::Callout => &icons::INFO,
			LibraryBlockType::Table => &icons::TABLE,
			LibraryBlockType::Code => &icons::CODE,
			LibraryBlockType::WebPage => &icons::GLOBE,
			LibraryBlockType::Collapsible => &icons::LIST_COLLAPSE,
			LibraryBlockType::Other => &icons::SQUARE,
		}
	}

	fn markdown_hint(self) -> Option<&'static str> {
		match self {
			LibraryBlockType::Heading => Some("#"),
			LibraryBlockType::List => Some("-"),
			LibraryBlockType::Checklist => Some("[]"),
			LibraryBlockType::Quote => Some(">"),
			LibraryBlockType::Code => Some("```"),
			_ => None,
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LibraryBlock {
	pub id: String,
	pub source: String,
	pub gap: String,
}

impl LibraryBlock {
	pub fn kind(&self) -> LibraryBlockType {
		block_type_of(&self.source)
	}
}

const FENCED_TYPES: [(&str, LibraryBlockType); 11] = [
	("gallery", LibraryBlockType::Gallery),
	("web-page", LibraryBlockType::WebPage),
	("collapsible", LibraryBlockType::Collapsible),
	("options", LibraryBlockType::Other),
	("illustrated-list", LibraryBlockType::Other),
	("checklist", LibraryBlockType::Other),
	("interactive", LibraryBlockType::Other),
	("video", LibraryBlockType::Other),
	("map", LibraryBlockType::Other),
	("math", LibraryBlockType::Other),
	("mermaid", LibraryBlockType::Other),
];

const CALLOUT_TONES: [&str; 3] = ["[!NOTE]", "[!TIP]", "[!WARNING]"];

pub fn is_block_id(id: &str) -> bool {
	id.len() == BLOCK_ID_LENGTH && id.chars().all(|c| BLOCK_ID_ALPHABET.contains(c))
}

pub fn block_type_of(source: &str) -> LibraryBlockType {
	let first = source.split('\n').next().unwrap_or_default();
	let trimmed = first.trim_start_matches([' ', '\t']);
	if heading_marker_len(trimmed).is_some() {
		return LibraryBlockType::Heading;
	}
	if let Some(fence) = fence_of(trimmed) {
		let info = trimmed[fence..].split_whitespace().next().unwrap_or_default();
		return FENCED_TYPES
			.iter()
			.find(|(label, _)| *label == info)
			.map_or(LibraryBlockType::Code, |(_, kind)| *kind);
	}
	if first.starts_with("    ") || first.starts_with('\t') {
		return LibraryBlockType::Code;
	}
	if let Some(rest) = trimmed.strip_prefix('>') {
		let rest = rest.trim_start();
		return if CALLOUT_TONES.iter().any(|tone| rest.starts_with(tone)) {
			LibraryBlockType::Callout
		} else {
			LibraryBlockType::Quote
		};
	}
	if list_marker_len(trimmed).is_some() {
		let is_task = source.split('\n').any(|line| task_box(line.trim_start()).is_some());
		return if is_task { LibraryBlockType::Checklist } else { LibraryBlockType::List };
	}
	if is_table(source) {
		return LibraryBlockType::Table;
	}
	LibraryBlockType::Paragraph
}

pub fn parse_blocks(markdown: &str, mut next_id: impl FnMut() -> String) -> Vec<LibraryBlock> {
	let mut blocks: Vec<LibraryBlock> = Vec::new();
	let mut source: Vec<&str> = Vec::new();
	let mut fence: Option<&str> = None;
	for line in markdown.split('\n') {
		let bare = line.trim_start_matches([' ', '\t']);
		if fence.is_none() && line.trim().is_empty() {
			if !source.is_empty() {
				blocks.push(LibraryBlock {
					id: next_id(),
					source: source.join("\n"),
					gap: String::new(),
				});
				source.clear();
			}
			if let Some(last) = blocks.last_mut() {
				last.gap.push('\n');
			}
			continue;
		}
		if source.is_empty()
			&& let Some(last) = blocks.last_mut()
		{
			last.gap.push('\n');
		}
		match (fence, fence_of(bare)) {
			(None, Some(run)) => fence = Some(&bare[..run]),
			(Some(open), Some(run))
				if bare[..run].starts_with(open) && bare.trim().len() == run =>
			{
				fence = None;
			}
			_ => {}
		}
		source.push(line);
	}
	if !source.is_empty() {
		blocks.push(LibraryBlock { id: next_id(), source: source.join("\n"), gap: String::new() });
	}
	blocks
}

pub fn serialize_blocks(blocks: &[LibraryBlock]) -> String {
	blocks.iter().map(|block| format!("{}{}", block.source, block.gap)).collect()
}

fn fence_of(line: &str) -> Option<usize> {
	let fence = line.chars().next().filter(|c| *c == '`' || *c == '~')?;
	let run = line.len() - line.trim_start_matches(fence).len();
	(run >= 3).then_some(run)
}

fn heading_marker_len(line: &str) -> Option<usize> {
	let hashes = line.len() - line.trim_start_matches('#').len();
	if !(1..=6).contains(&hashes) {
		return None;
	}
	let rest = &line[hashes..];
	let spaces = rest.len() - rest.trim_start_matches([' ', '\t']).len();
	(spaces > 0 || rest.is_empty()).then_some(hashes + spaces)
}

fn list_marker_len(line: &str) -> Option<usize> {
	let digits = line.len() - line.trim_start_matches(|c: char| c.is_ascii_digit()).len();
	let marker = match line[digits..].chars().next() {
		Some('-' | '*' | '+') if digits == 0 => 1,
		Some('.' | ')') if digits > 0 => digits + 1,
		_ => return None,
	};
	let rest = &line[marker..];
	let spaces = rest.len() - rest.trim_start_matches([' ', '\t']).len();
	(spaces > 0).then_some(marker + spaces)
}

fn task_box(line: &str) -> Option<(bool, usize)> {
	let marker = list_marker_len(line).filter(|_| line.starts_with(['-', '*', '+']))?;
	let rest = &line[marker..];
	let done = match rest.get(..3)? {
		"[ ]" => false,
		"[x]" | "[X]" => true,
		_ => return None,
	};
	let after = marker + 3;
	Some((done, after + usize::from(line[after..].starts_with([' ', '\t']))))
}

fn is_table(source: &str) -> bool {
	let mut lines = source.split('\n');
	let header = lines.next().unwrap_or_default();
	let delimiter = lines.next().unwrap_or_default();
	header.trim_start().starts_with('|')
		&& delimiter.contains('-')
		&& delimiter.trim().chars().all(|c| matches!(c, '|' | '-' | ':' | ' ' | '\t'))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RowMark {
	None,
	Bullet,
	Number(usize),
	Task(bool),
	Quote,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BlockRow {
	pub mark: RowMark,
	pub text: String,
}

pub fn rows_of(source: &str) -> Vec<BlockRow> {
	let kind = block_type_of(source);
	let mut lines: Vec<&str> = source.split('\n').collect();
	if kind == LibraryBlockType::Callout {
		lines.remove(0);
	}
	if matches!(kind, LibraryBlockType::Code) {
		let body = lines.iter().skip(1).take(lines.len().saturating_sub(2)).copied();
		return vec![BlockRow { mark: RowMark::None, text: body.collect::<Vec<_>>().join("\n") }];
	}
	let mut number = 0;
	lines
		.into_iter()
		.map(|line| {
			let indent = line.len() - line.trim_start_matches([' ', '\t']).len();
			let bare = &line[indent..];
			let (mark, at) = match kind {
				LibraryBlockType::Heading => (RowMark::None, heading_marker_len(bare).unwrap_or(0)),
				LibraryBlockType::Checklist => match task_box(bare) {
					Some((done, at)) => (RowMark::Task(done), at),
					None => (RowMark::Bullet, list_marker_len(bare).unwrap_or(0)),
				},
				LibraryBlockType::List => {
					number += 1;
					let at = list_marker_len(bare).unwrap_or(0);
					let ordered = bare.starts_with(|c: char| c.is_ascii_digit());
					(if ordered { RowMark::Number(number) } else { RowMark::Bullet }, at)
				}
				LibraryBlockType::Quote | LibraryBlockType::Callout => {
					let at = usize::from(bare.starts_with('>'));
					let at = at + usize::from(bare[at..].starts_with([' ', '\t']));
					(RowMark::Quote, at)
				}
				_ => (RowMark::None, 0),
			};
			BlockRow { mark, text: bare[at..].to_owned() }
		})
		.collect()
}

pub fn plain_of(text: &str) -> String {
	let mut plain = String::with_capacity(text.len());
	let mut chars = text.chars().peekable();
	while let Some(character) = chars.next() {
		match character {
			'*' | '_' | '`' => {}
			'~' if chars.peek() == Some(&'~') => {
				chars.next();
			}
			'\\' => plain.extend(chars.next()),
			'[' | ']' => {}
			'(' if plain.ends_with(|c: char| c.is_alphanumeric()) && text.contains("](") => {
				for skipped in chars.by_ref() {
					if skipped == ')' {
						break;
					}
				}
			}
			_ => plain.push(character),
		}
	}
	plain
}

fn say(key: Key, lang: Language) -> &'static str {
	key.text(lang)
}

fn filled(template: &str, slot: &str, value: &str) -> String {
	template.replace(&format!("{{{{{slot}}}}}"), value)
}

pub fn shown_name(name: &str, lang: Language) -> &str {
	if name.trim().is_empty() { say(common::library::editor::UNTITLED, lang) } else { name }
}

fn label_text(content: &str, style: TextStyle, colour: Color) -> El {
	text(content.to_owned()).font(style).color(colour)
}

fn focus_ring(t: &Tokens, control: El) -> El {
	control.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	)
}

fn skeleton_bar(t: &Tokens, width: f32, is_faint: bool) -> El {
	let (height, fill) =
		if is_faint { (SPACING * 2.25, faded(t.border, 0.6)) } else { (SPACING * 3.0, t.border) };
	el().w(width).h(height).radius(height / 2.0).fill(fill).a11y_hidden()
}

fn skeleton_round(t: &Tokens, side: f32) -> El {
	el().size(side, side).radius(side / 2.0).fill(t.border).a11y_hidden()
}

const BAR_HEIGHT: f32 = SPACING * 14.0;
const BAR_CONTROL: f32 = SPACING * 8.0;

fn library_bar(leading: El, trailing: El) -> El {
	row()
		.w_full()
		.h(BAR_HEIGHT)
		.px(SPACING * 3.0)
		.gap(SPACING * 4.0)
		.center_y()
		.justify_between()
		.child(leading)
		.child(trailing)
}

fn bar_action<S: 'static>(
	t: &Tokens,
	glyph: &'static rune::Icon,
	label: &str,
	is_bare: bool,
	press: impl Fn(&mut S) + 'static,
) -> El {
	let rest = if is_bare { t.foreground.alpha(0.0) } else { faded(t.foreground, 0.08) };
	let hover = faded(t.foreground, if is_bare { 0.08 } else { 0.14 });
	focus_ring(
		t,
		instant(
			row()
				.key(format!("bar-{label}"))
				.size(BAR_CONTROL, BAR_CONTROL)
				.radius(BAR_CONTROL / 2.0)
				.center()
				.fill(rest)
				.hover(hover)
				.role("button")
				.label(label)
				.child(icon(glyph, SPACING * 4.0).color(t.foreground)),
		),
	)
	.on_press(press)
}

fn bar_divider(t: &Tokens) -> El {
	el().w(1.0).h(SPACING * 5.0).fill(faded(t.foreground, 0.12)).a11y_hidden()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemSurface {
	Document,
	Lightbox,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ItemEvent {
	Download,
	Copy,
	More,
	Close,
	Back,
}

fn item_actions<S: 'static>(
	t: &Tokens,
	lang: Language,
	surface: ItemSurface,
	leading: Vec<El>,
	on: impl Fn(&mut S, ItemEvent) + Clone + 'static,
) -> El {
	use common::library::{document, lightbox};
	let [download, copy, more, close] = match surface {
		ItemSurface::Document => {
			[document::DOWNLOAD, document::COPY, document::MORE, document::CLOSE]
		}
		ItemSurface::Lightbox => {
			[lightbox::DOWNLOAD, lightbox::COPY, lightbox::MORE, lightbox::CLOSE]
		}
	};
	let emit = |event: ItemEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event.clone())
	};
	row()
		.gap(SPACING * 2.0)
		.center_y()
		.children(leading)
		.child(bar_action(
			t,
			&icons::DOWNLOAD,
			say(download, lang),
			false,
			emit(ItemEvent::Download),
		))
		.child(bar_action(t, &icons::COPY, say(copy, lang), false, emit(ItemEvent::Copy)))
		.child(bar_action(
			t,
			&icons::MORE_HORIZONTAL,
			say(more, lang),
			false,
			emit(ItemEvent::More),
		))
		.child(bar_divider(t))
		.child(bar_action(t, &icons::CLOSE, say(close, lang), true, emit(ItemEvent::Close)))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
	Image,
	Document,
}

#[derive(Clone, Copy)]
pub enum ItemLook<'a> {
	Image(Option<&'a Image>),
	Page(&'a str),
}

#[derive(Clone, Copy)]
pub struct LibraryItem<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub detail: &'a str,
	pub look: ItemLook<'a>,
	pub import_progress: Option<f32>,
}

impl LibraryItem<'_> {
	pub fn kind(&self) -> ItemKind {
		match self.look {
			ItemLook::Image(_) => ItemKind::Image,
			ItemLook::Page(_) => ItemKind::Document,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PanelState {
	Loading,
	Ready,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryFilter {
	All,
	Images,
	Documents,
	Boards,
}

impl LibraryFilter {
	const ALL: [LibraryFilter; 4] = [
		LibraryFilter::All,
		LibraryFilter::Images,
		LibraryFilter::Documents,
		LibraryFilter::Boards,
	];

	fn label(self) -> Key {
		use common::library::filters;
		match self {
			LibraryFilter::All => filters::ALL,
			LibraryFilter::Images => filters::IMAGES,
			LibraryFilter::Documents => filters::DOCUMENTS,
			LibraryFilter::Boards => filters::BOARDS,
		}
	}

	fn keeps(self, item: &LibraryItem) -> bool {
		match self {
			LibraryFilter::All => true,
			LibraryFilter::Images => item.kind() == ItemKind::Image,
			LibraryFilter::Documents => item.kind() == ItemKind::Document,
			LibraryFilter::Boards => false,
		}
	}

	fn no_result(self) -> Key {
		use common::library::no_result;
		match self {
			LibraryFilter::Images => no_result::IMAGES,
			LibraryFilter::Boards => no_result::BOARDS,
			LibraryFilter::All | LibraryFilter::Documents => no_result::DOCUMENTS,
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct PanelActions {
	pub search: bool,
	pub import: bool,
	pub new_board: bool,
	pub new_document: bool,
	pub templates: bool,
}

impl PanelActions {
	pub const EVERY: PanelActions = PanelActions {
		search: true,
		import: true,
		new_board: true,
		new_document: true,
		templates: true,
	};
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum LibraryTemplate {
	Brief,
	MeetingNotes,
	Checklist,
}

impl LibraryTemplate {
	pub const ALL: [LibraryTemplate; 3] =
		[LibraryTemplate::Brief, LibraryTemplate::MeetingNotes, LibraryTemplate::Checklist];

	fn name(self) -> Key {
		use common::library::templates;
		match self {
			LibraryTemplate::Brief => templates::brief::NAME,
			LibraryTemplate::MeetingNotes => templates::meeting_notes::NAME,
			LibraryTemplate::Checklist => templates::checklist::NAME,
		}
	}

	fn preview(self) -> Key {
		use common::library::templates;
		match self {
			LibraryTemplate::Brief => templates::brief::PREVIEW,
			LibraryTemplate::MeetingNotes => templates::meeting_notes::PREVIEW,
			LibraryTemplate::Checklist => templates::checklist::PREVIEW,
		}
	}

	fn description(self) -> Key {
		use common::library::templates;
		match self {
			LibraryTemplate::Brief => templates::brief::DESCRIPTION,
			LibraryTemplate::MeetingNotes => templates::meeting_notes::DESCRIPTION,
			LibraryTemplate::Checklist => templates::checklist::DESCRIPTION,
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LibraryEvent {
	Filter(LibraryFilter),
	Open(String),
	Import,
	NewBoard,
	NewDocument,
	StartTemplate(LibraryTemplate),
}

pub struct LibraryPanel<'a> {
	pub state: PanelState,
	pub items: &'a [LibraryItem<'a>],
	pub filter: LibraryFilter,
	pub query: &'a TextEdit,
	pub actions: PanelActions,
	pub columns: usize,
}

pub const GRID_TILE_MIN: f32 = SPACING * 60.0;
const GRID_INSET: f32 = SPACING * 10.0;
const GRID_GAP_X: f32 = SPACING * 4.0;
const GRID_GAP_Y: f32 = SPACING * 7.0;
const THUMBNAIL_HEIGHT: f32 = SPACING * 45.0;
const PILL_HEIGHT: f32 = SPACING * 8.0;
const FILTER_HEIGHT: f32 = SPACING * 7.0;
const SEARCH_WIDTH: f32 = SPACING * 55.0;
const SKELETON_FILTER_WIDTHS: [f32; 4] = [44.0, 84.0, 108.0, 76.0];
const SKELETON_ROWS: usize = 4;

pub fn grid_columns(width: f32) -> usize {
	let room = width - GRID_INSET * 2.0 + GRID_GAP_X;
	((room / (GRID_TILE_MIN + GRID_GAP_X)).floor() as usize).max(1)
}

type Access<S> = fn(&mut S) -> &mut TextEdit;

pub fn library_panel<S: 'static>(
	t: &Tokens,
	lang: Language,
	panel: &LibraryPanel,
	query: Access<S>,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	let is_loading = panel.state == PanelState::Loading;
	let has_query = !panel.query.text.is_empty();
	let is_empty = !is_loading && panel.items.is_empty() && !has_query;
	let mut header = col()
		.px(GRID_INSET)
		.pt(SPACING * 8.0)
		.pb(SPACING * 5.0)
		.gap(SPACING * 5.0)
		.child(library_heading(t, lang, panel, query, on.clone()));
	if is_loading {
		header = header.child(filters_skeleton(t));
	} else if !is_empty {
		header = header.child(filters(t, lang, panel, on.clone()));
	}
	let shown: Vec<&LibraryItem> =
		panel.items.iter().filter(|item| panel.filter.keeps(item)).collect();
	let body = if is_loading {
		grid_skeleton(t, panel.columns)
	} else if is_empty {
		empty_state(t, lang, panel.actions, on)
	} else if shown.is_empty() {
		let line = if has_query {
			filled(say(common::library::no_result::SEARCH, lang), "query", &panel.query.text)
		} else {
			say(panel.filter.no_result(), lang).to_owned()
		};
		row()
			.px(GRID_INSET)
			.pt(SPACING * 2.0)
			.pb(GRID_INSET)
			.role("status")
			.child(text(line).font(TEXT_COMPACT).color(t.muted_foreground).wrap())
	} else {
		grid(t, lang, &shown, panel.columns, on)
	};
	let content = col().w_full().grow(1.0).min_h(0.0).child(header).child(body);
	let content = if is_loading {
		content.clip_rounded(0.0).label(say(common::library::TITLE, lang))
	} else {
		content.scroll(ScrollSpec { stick_bottom: false })
	};
	col().key("library-panel").w_full().h_full().min_h(0.0).child(content)
}

fn library_heading<S: 'static>(
	t: &Tokens,
	lang: Language,
	panel: &LibraryPanel,
	query: Access<S>,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	use common::library;
	let titles = col()
		.min_w(0.0)
		.gap(SPACING)
		.child(label_text(say(library::TITLE, lang), TEXT_TITLE, t.foreground).role("heading"))
		.child(label_text(say(library::SUBTITLE, lang), TEXT_COMPACT, t.muted_foreground));
	let emit = |event: LibraryEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event.clone())
	};
	let mut actions = row().gap(SPACING * 2.0).center_y();
	if panel.actions.search {
		actions = actions.child(search_field(t, lang, panel.query, query));
	}
	if panel.actions.import {
		actions = actions.child(
			outlined_pill(t, &icons::DOWNLOAD, say(library::IMPORT, lang))
				.on_press(emit(LibraryEvent::Import)),
		);
	}
	if panel.actions.new_board {
		actions = actions.child(
			outlined_pill(t, &icons::LAYOUT_DASHBOARD, say(library::NEW_BOARD, lang))
				.on_press(emit(LibraryEvent::NewBoard)),
		);
	}
	if panel.actions.new_document {
		actions = actions.child(
			Button::new(say(library::NEW_DOCUMENT, lang))
				.leading(&icons::PLUS)
				.view(t)
				.on_press(emit(LibraryEvent::NewDocument)),
		);
	}
	row()
		.w_full()
		.flex_wrap()
		.gaps(SPACING * 4.0, SPACING * 6.0)
		.items_end()
		.justify_between()
		.child(titles)
		.child(actions)
}

fn outlined_pill(t: &Tokens, glyph: &'static rune::Icon, label: &str) -> El {
	focus_ring(
		t,
		instant(
			row()
				.key(format!("button-{label}"))
				.h(PILL_HEIGHT)
				.px(SPACING * 3.0)
				.gap(SPACING * 1.5)
				.center_y()
				.radius(PILL_HEIGHT / 2.0)
				.border(1.0, t.input)
				.hover(faded(t.foreground, 0.05))
				.role("button")
				.label(label)
				.child(icon(glyph, SPACING * 4.0).color(t.foreground))
				.child(label_text(label, TEXT_COMPACT_MEDIUM, t.foreground)),
		),
	)
}

fn search_field<S: 'static>(t: &Tokens, lang: Language, edit: &TextEdit, access: Access<S>) -> El {
	let label = say(common::library::SEARCH, lang);
	let field = instant(
		text_input(edit, tight(TEXT_COMPACT))
			.single_line()
			.key("library-search")
			.w_full()
			.py(equal_padding(PILL_HEIGHT, TEXT_COMPACT.size))
			.pl(SPACING * 8.75)
			.pr(SPACING * 3.0)
			.radius(PILL_HEIGHT / 2.0)
			.border(1.0, t.input)
			.fill(faded(t.foreground, 0.03))
			.color(t.foreground)
			.placeholder(label, t.muted_foreground)
			.caret(t.foreground, t.selection)
			.label(label)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
			.on_edit(access),
	);
	let glyph = icon(&icons::SEARCH, SPACING * 3.75).color(t.muted_foreground).a11y_hidden().pin(
		Some(SPACING * 3.0),
		Some((PILL_HEIGHT - SPACING * 3.75) / 2.0),
		None,
		None,
	);
	el().w(SEARCH_WIDTH).child(field).child(glyph)
}

fn filters<S: 'static>(
	t: &Tokens,
	lang: Language,
	panel: &LibraryPanel,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	let count_of =
		|filter: LibraryFilter| panel.items.iter().filter(|item| filter.keeps(item)).count();
	let pills = LibraryFilter::ALL.map(|filter| {
		let is_pressed = filter == panel.filter;
		let count = (filter != LibraryFilter::All).then(|| count_of(filter));
		let on = on.clone();
		filter_pill(t, say(filter.label(), lang), count, is_pressed)
			.on_press(move |s: &mut S| on(s, LibraryEvent::Filter(filter)))
	});
	row()
		.flex_wrap()
		.gap(SPACING * 1.5)
		.role("group")
		.label(say(common::library::filters::LABEL, lang))
		.children(pills)
}

fn filter_pill(t: &Tokens, label: &str, count: Option<usize>, is_pressed: bool) -> El {
	let (fill, border, ink, count_ink) = if is_pressed {
		(t.primary, t.primary, t.primary_foreground, t.primary_foreground)
	} else {
		(t.foreground.alpha(0.0), t.input, t.foreground, t.muted_foreground)
	};
	let mut pill = row()
		.key(format!("library-filter-{label}"))
		.h(FILTER_HEIGHT)
		.px(SPACING * 3.0)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(FILTER_HEIGHT / 2.0)
		.border(1.0, border)
		.fill(fill)
		.role("button")
		.checked(is_pressed)
		.label(match count {
			Some(count) => format!("{label} {count}"),
			None => label.to_owned(),
		})
		.child(label_text(label, TEXT_COMPACT_MEDIUM, ink));
	if !is_pressed {
		pill = pill.hover(faded(t.foreground, 0.05));
	}
	if let Some(count) = count {
		pill = pill.child(label_text(&count.to_string(), TEXT_COMPACT, count_ink));
	}
	focus_ring(t, instant(pill))
}

fn filters_skeleton(t: &Tokens) -> El {
	row().gap(SPACING * 1.5).a11y_hidden().children(
		SKELETON_FILTER_WIDTHS
			.map(|width| el().w(width).h(FILTER_HEIGHT).radius(FILTER_HEIGHT / 2.0).fill(t.border)),
	)
}

fn grid_frame(columns: usize, cells: Vec<El>) -> El {
	col().w_full().px(GRID_INSET).pt(SPACING * 2.0).pb(GRID_INSET).gap(GRID_GAP_Y).children(
		cells.chunks(columns.max(1)).map(|line| {
			let mut cells: Vec<El> = line.to_vec();
			cells.resize_with(columns.max(1), el);
			row().w_full().gap(GRID_GAP_X).children(
				cells.into_iter().map(|cell| col().w(0.0).grow(1.0).min_w(0.0).child(cell)),
			)
		}),
	)
}

fn grid<S: 'static>(
	t: &Tokens,
	lang: Language,
	items: &[&LibraryItem],
	columns: usize,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	let cells = items
		.iter()
		.map(|item| match item.import_progress {
			Some(progress) => importing_tile(t, lang, item, progress),
			None => {
				let (on, id) = (on.clone(), item.id.to_owned());
				tile(t, lang, item).on_press(move |s: &mut S| on(s, LibraryEvent::Open(id.clone())))
			}
		})
		.collect();
	grid_frame(columns, cells)
}

fn thumbnail(t: &Tokens, look: ItemLook) -> El {
	let frame = el()
		.w_full()
		.h(THUMBNAIL_HEIGHT)
		.radius(RADIUS_CONTROL)
		.clip_rounded(RADIUS_CONTROL)
		.border(1.0, t.shell_border);
	match look {
		ItemLook::Image(image) => {
			let frame = frame.fill(t.bot_avatar_ground);
			match image.filter(|image| image.size().is_some()) {
				Some(image) => frame.pixels_fit(image.pixels(), SurfaceFit::Fill),
				None => frame,
			}
		}
		ItemLook::Page(excerpt) => frame.fill(t.document_ground).child(
			page(t, excerpt).pin(Some(SPACING * 9.0), Some(SPACING * 5.5), None, None).w(199.0),
		),
	}
}

fn page(t: &Tokens, excerpt: &str) -> El {
	let lines = excerpt.split("\n\n").map(|block| {
		let kind = block_type_of(block);
		let colour =
			if kind == LibraryBlockType::Heading { t.foreground } else { t.muted_foreground };
		let rows = rows_of(block).into_iter().map(|line| {
			let mark = if line.mark == RowMark::Bullet { "• " } else { "" };
			text(format!("{mark}{}", plain_of(&line.text)))
				.font(TEXT_10_MEDIUM)
				.color(colour)
				.wrap()
		});
		col().w_full().gap(SPACING * 0.5).children(rows)
	});
	col()
		.h(SPACING * 42.5)
		.padding(SPACING * 4.0)
		.gap(SPACING * 1.5)
		.radius(RADIUS_XS * 2.0)
		.clip_rounded(RADIUS_XS * 2.0)
		.fill(t.card_raised)
		.shadow(SPACING * 1.5, SPACING * 4.0, Color::BLACK.alpha(0.4))
		.a11y_hidden()
		.children(lines)
}

fn caption(t: &Tokens, name: &str, detail: &str) -> El {
	col()
		.w_full()
		.min_w(0.0)
		.gap(SPACING * 0.5)
		.child(
			label_text(name, TEXT_COMPACT_MEDIUM, t.foreground)
				.truncate()
				.help_when_truncated(name.to_owned()),
		)
		.child(label_text(detail, TEXT_XS, t.muted_foreground).truncate())
}

fn tile(t: &Tokens, lang: Language, item: &LibraryItem) -> El {
	let name = shown_name(item.name, lang);
	let control = col()
		.key(format!("library-item-{}", item.id))
		.w_full()
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.role("button")
		.label(name)
		.hover_group()
		.child(thumbnail(t, item.look))
		.child(caption(t, name, item.detail));
	instant(control).focusable(true).cursor(Cursor::Pointer).focus_ring(2.0, 2.0, t.ring)
}

fn importing_tile(t: &Tokens, lang: Language, item: &LibraryItem, progress: f32) -> El {
	let percent = (progress * 100.0).round();
	let bar = row()
		.w_full()
		.h(SPACING)
		.radius(RADIUS_XS)
		.clip_rounded(RADIUS_XS)
		.fill(faded(t.foreground, 0.12))
		.role("progressbar")
		.range_value(f64::from(percent), 0.0, 100.0)
		.label(filled(
			say(common::library::importing::LABEL, lang),
			"name",
			shown_name(item.name, lang),
		))
		.child(el().w_frac(progress).h_full().fill(t.primary));
	let scrim = row()
		.pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
		.radius(RADIUS_CONTROL)
		.fill(faded(t.card, 0.72))
		.padding(SPACING * 4.0)
		.items_end()
		.child(bar);
	let detail =
		filled(say(common::library::importing::DETAIL, lang), "percent", &percent.to_string());
	col()
		.w_full()
		.gap(SPACING * 2.5)
		.child(el().w_full().child(thumbnail(t, item.look)).child(scrim))
		.child(caption(t, shown_name(item.name, lang), &detail))
}

fn grid_skeleton(t: &Tokens, columns: usize) -> El {
	let tile = || {
		col()
			.w_full()
			.gap(SPACING * 2.5)
			.child(el().w_full().h(THUMBNAIL_HEIGHT).radius(RADIUS_CONTROL).fill(t.border))
			.child(
				col()
					.gap(SPACING * 0.5)
					.child(row().h(SPACING * 4.5).center_y().child(skeleton_bar(
						t,
						SPACING * 32.0,
						false,
					)))
					.child(row().h(SPACING * 4.0).center_y().child(skeleton_bar(
						t,
						SPACING * 44.0,
						true,
					))),
			)
	};
	grid_frame(columns, (0..columns.max(1) * SKELETON_ROWS).map(|_| tile()).collect()).a11y_hidden()
}

fn empty_state<S: 'static>(
	t: &Tokens,
	lang: Language,
	actions: PanelActions,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	use common::library;
	let emit = |event: LibraryEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event.clone())
	};
	let mut sections = col().px(GRID_INSET).pt(SPACING * 4.0).pb(GRID_INSET).gap(SPACING * 8.0);
	if actions.new_document || actions.templates {
		let mut cards = row().flex_wrap().gap(SPACING * 4.0);
		if actions.new_document {
			let blank = el()
				.w_full()
				.h(SPACING * 37.5)
				.radius(RADIUS_CONTROL)
				.border(1.5, t.input)
				.border_dash(SPACING, SPACING)
				.hover(faded(t.foreground, 0.03))
				.center()
				.child(icon(&icons::PLUS, SPACING * 5.5).color(t.primary));
			cards = cards.child(
				template_card(t, say(library::templates::blank::NAME, lang), blank)
					.on_press(emit(LibraryEvent::NewDocument)),
			);
		}
		if actions.templates {
			for template in LibraryTemplate::ALL {
				let preview = el()
					.w_full()
					.h(SPACING * 37.5)
					.radius(RADIUS_CONTROL)
					.clip_rounded(RADIUS_CONTROL)
					.border(1.0, t.shell_border)
					.fill(t.document_ground)
					.child(
						page(t, say(template.preview(), lang))
							.pin(Some(SPACING * 7.5), Some(SPACING * 4.0), None, None)
							.w(SPACING * 35.0),
					);
				cards = cards.child(
					template_card(t, say(template.name(), lang), preview)
						.help(say(template.description(), lang))
						.on_press(emit(LibraryEvent::StartTemplate(template))),
				);
			}
		}
		sections = sections.child(library_section(t, say(library::START, lang), cards));
	}
	if actions.import {
		let strip = row()
			.w(SPACING * 212.0)
			.max_w(SPACING * 212.0)
			.px(SPACING * 4.5)
			.py(SPACING * 4.0)
			.gap(SPACING * 3.5)
			.center_y()
			.radius(RADIUS_XL)
			.border(1.5, t.input)
			.border_dash(SPACING, SPACING)
			.child(
				row()
					.size(SPACING * 9.0, SPACING * 9.0)
					.radius(RADIUS_MD)
					.fill(faded(t.foreground, 0.06))
					.center()
					.child(icon(&icons::DOWNLOAD, SPACING * 4.5).color(t.muted_foreground)),
			)
			.child(
				col()
					.grow(1.0)
					.min_w(0.0)
					.child(label_text(
						say(library::bring_in::DROP, lang),
						TEXT_SM_MEDIUM,
						t.foreground,
					))
					.child(label_text(
						say(library::bring_in::FORMATS, lang),
						TEXT_COMPACT,
						t.muted_foreground,
					)),
			)
			.child(
				outlined_pill(t, &icons::DOWNLOAD, say(library::bring_in::ACTION, lang))
					.on_press(emit(LibraryEvent::Import)),
			);
		sections = sections.child(library_section(t, say(library::bring_in::TITLE, lang), strip));
	}
	sections
}

fn library_section(t: &Tokens, title: &str, content: El) -> El {
	col()
		.gap(SPACING * 3.5)
		.child(label_text(title, TEXT_BASE_SEMIBOLD, t.foreground).role("heading"))
		.child(content)
}

fn template_card(t: &Tokens, name: &str, thumbnail: El) -> El {
	let card = col()
		.key(format!("library-template-{name}"))
		.w(SPACING * 50.0)
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.role("button")
		.label(name)
		.hover_group()
		.child(thumbnail)
		.child(label_text(name, TEXT_COMPACT_MEDIUM, t.foreground).truncate());
	instant(card).focusable(true).cursor(Cursor::Pointer).focus_ring(2.0, 2.0, t.ring)
}

const DOCUMENT_MEASURE: f32 = 794.0;
const DOCUMENT_INSET: f32 = SPACING * 10.0;
const PARAGRAPH_ENDS: [f32; 3] = [0.6, 0.8, 0.4];
const SKELETON_PARAGRAPHS: usize = 12;

fn bar_actions_skeleton(t: &Tokens) -> El {
	row().gap(SPACING).children([0, 1, 2].map(|_| skeleton_round(t, BAR_CONTROL)))
}

pub fn document_skeleton(t: &Tokens, lang: Language) -> El {
	let bar = library_bar(
		row()
			.gap(SPACING * 3.0)
			.center_y()
			.child(skeleton_bar(t, SPACING * 16.0, false))
			.child(skeleton_bar(t, SPACING * 32.0, false)),
		bar_actions_skeleton(t),
	);
	let line = |fraction: f32| {
		row()
			.h(SPACING * 6.0)
			.w_full()
			.center_y()
			.child(skeleton_bar(t, 0.0, false).w_frac(fraction))
	};
	let header = col()
		.gap(SPACING * 1.5)
		.pb(SPACING * 5.0)
		.child(
			row()
				.h(SPACING * 8.5)
				.center_y()
				.child(skeleton_bar(t, SPACING * 72.0, false).h(SPACING * 5.0)),
		)
		.child(row().h(SPACING * 4.5).center_y().child(skeleton_bar(t, SPACING * 48.0, true)));
	let paragraphs = (0..SKELETON_PARAGRAPHS).map(|index| {
		col()
			.w_full()
			.pb(SPACING * 3.5)
			.child(line(1.0))
			.child(line(11.0 / 12.0))
			.child(line(PARAGRAPH_ENDS[index % PARAGRAPH_ENDS.len()]))
	});
	let column = col().w_full().max_w(DOCUMENT_MEASURE).child(header).children(paragraphs);
	col()
		.key("library-document-skeleton")
		.w_full()
		.h_full()
		.min_h(0.0)
		.clip_rounded(0.0)
		.label(say(common::library::tab::LOADING_DOCUMENT, lang))
		.child(bar.a11y_hidden())
		.child(
			col()
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.px(DOCUMENT_INSET)
				.pt(DOCUMENT_INSET)
				.items_center()
				.a11y_hidden()
				.child(column),
		)
}

pub fn image_skeleton(lang: Language) -> El {
	let t = &Tokens::new(true);
	let bar = library_bar(
		row()
			.gap(SPACING * 2.0)
			.center_y()
			.child(skeleton_round(t, BAR_CONTROL))
			.child(skeleton_bar(t, SPACING * 40.0, false))
			.child(skeleton_bar(t, SPACING * 24.0, true)),
		bar_actions_skeleton(t),
	);
	let stage = row()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.px(SPACING * 5.0)
		.pb(SPACING * 18.0)
		.gap(SPACING * 5.0)
		.center_y()
		.child(skeleton_round(t, SPACING * 10.0))
		.child(el().grow(1.0).min_w(0.0).h_full().radius(RADIUS_MD).fill(faded(t.border, 0.6)))
		.child(skeleton_round(t, SPACING * 10.0));
	let zoom = row()
		.pin(Some(0.0), None, Some(0.0), Some(0.0))
		.h(SPACING * 18.0)
		.center()
		.child(el().w(SPACING * 56.0).h(SPACING * 9.0).radius(SPACING * 4.5).fill(t.border));
	col()
		.key("library-image-skeleton")
		.w_full()
		.h_full()
		.min_h(0.0)
		.fill(lightbox_ground(t))
		.label(say(common::library::tab::LOADING_IMAGE, lang))
		.child(bar.a11y_hidden())
		.child(stage.a11y_hidden())
		.child(zoom.a11y_hidden())
}

fn lightbox_ground(t: &Tokens) -> Color {
	faded(t.background, 0.93)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Unavailable {
	Missing,
	Unreadable,
}

pub fn item_unavailable<S: 'static>(
	t: &Tokens,
	lang: Language,
	reason: Unavailable,
	name: &str,
	press: impl Fn(&mut S) + 'static,
) -> El {
	use common::library::tab::unavailable::{missing, unreadable};
	let (title, body, action) = match reason {
		Unavailable::Missing => (missing::TITLE, missing::BODY, missing::ACTION),
		Unavailable::Unreadable => (unreadable::TITLE, unreadable::BODY, unreadable::ACTION),
	};
	let line = filled(say(title, lang), "name", shown_name(name, lang));
	let card = failure_card(
		t,
		&line,
		Some(say(body, lang)),
		vec![small_pill(t, say(action, lang), true).on_press(press)],
	)
	.w_full()
	.max_w(SPACING * 96.0)
	.radius(RADIUS_CONTROL);
	row()
		.key("library-item-unavailable")
		.w_full()
		.h_full()
		.padding(SPACING * 6.0)
		.center()
		.child(card)
}

fn failure_card(t: &Tokens, line: &str, body: Option<&str>, actions: Vec<El>) -> El {
	let mut lines = col().min_w(0.0).gap(SPACING).role("alert").child(
		row()
			.min_w(0.0)
			.gap(SPACING * 1.5)
			.center_y()
			.child(icon(&icons::ERROR, SPACING * 4.0).color(t.destructive).a11y_hidden())
			.child(label_text(line, TEXT_XS_MEDIUM, t.foreground).truncate()),
	);
	if let Some(body) = body {
		lines = lines.child(label_text(body, TEXT_XS, t.muted_foreground).wrap());
	}
	col()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.padding(SPACING * 3.0)
		.border(1.0, faded(t.foreground, 0.17))
		.border_dash(SPACING, SPACING)
		.fill(faded(t.foreground, 0.04))
		.child(lines)
		.child(row().flex_wrap().gap(SPACING * 1.5).center_y().children(actions))
}

fn small_pill(t: &Tokens, label: &str, is_primary: bool) -> El {
	let height = SPACING * 6.0;
	let mut pill = row()
		.key(format!("button-{label}"))
		.h(height)
		.px(SPACING * 2.5)
		.center_y()
		.radius(height / 2.0)
		.role("button")
		.label(label)
		.child(label_text(
			label,
			TEXT_XS_MEDIUM,
			if is_primary { t.foreground } else { t.muted_foreground },
		));
	pill = if is_primary {
		pill.fill(t.card).outline(1.0, 0.0, faded(t.foreground, 0.08)).hover(t.muted)
	} else {
		pill.hover(faded(t.foreground, 0.06))
	};
	focus_ring(t, instant(pill))
}

pub struct DocumentBar<'a> {
	pub name: &'a str,
	pub is_read_only: bool,
	pub presence: Option<El>,
}

pub fn document_bar<S: 'static>(
	t: &Tokens,
	lang: Language,
	bar: DocumentBar,
	on: impl Fn(&mut S, ItemEvent) + Clone + 'static,
) -> El {
	use common::library::document;
	let name = shown_name(bar.name, lang);
	let back_label = say(document::BACK, lang);
	let back_on = on.clone();
	let back = focus_ring(
		t,
		instant(
			row()
				.key("library-document-back")
				.h(SPACING * 7.0)
				.pl(SPACING * 1.5)
				.pr(SPACING * 2.5)
				.gap(SPACING)
				.center_y()
				.radius(SPACING * 3.5)
				.hover(faded(t.foreground, 0.06))
				.hover_group()
				.role("button")
				.label(back_label)
				.child(
					icon(&icons::PREVIOUS, SPACING * 4.0)
						.color(t.muted_foreground)
						.group_color(t.foreground),
				)
				.child(
					label_text(back_label, TEXT_COMPACT_MEDIUM, t.muted_foreground)
						.group_color(t.foreground),
				),
		),
	)
	.on_press(move |s: &mut S| back_on(s, ItemEvent::Back));
	let crumbs = row()
		.min_w(0.0)
		.gap(SPACING * 1.5)
		.center_y()
		.role("navigation")
		.child(back)
		.child(label_text("/", TEXT_COMPACT, t.muted_foreground).a11y_hidden())
		.child(
			label_text(name, TEXT_COMPACT_MEDIUM, t.foreground)
				.pl(SPACING)
				.truncate()
				.help_when_truncated(name.to_owned()),
		);
	let mut leading: Vec<El> = bar.presence.into_iter().collect();
	if bar.is_read_only {
		leading.push(
			row()
				.h(SPACING * 7.0)
				.px(SPACING * 2.5)
				.gap(SPACING * 1.5)
				.center_y()
				.radius(SPACING * 3.5)
				.fill(faded(t.foreground, 0.05))
				.child(icon(&icons::LOCK, SPACING * 3.25).color(t.soft_foreground).a11y_hidden())
				.child(label_text(
					say(document::READ_ONLY, lang),
					TEXT_XS_MEDIUM,
					t.soft_foreground,
				)),
		);
	}
	library_bar(crumbs, item_actions(t, lang, ItemSurface::Document, leading, on))
}

pub fn document_column(t: &Tokens, heading: El, detail: &str, body: El) -> El {
	let article = col()
		.w_full()
		.max_w(DOCUMENT_MEASURE)
		.gap(SPACING * 3.5)
		.child(
			col().w_full().gap(SPACING * 1.5).pb(SPACING * 1.5).child(heading).child(label_text(
				detail,
				TEXT_COMPACT,
				t.muted_foreground,
			)),
		)
		.child(body);
	col()
		.key("library-document-column")
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.px(DOCUMENT_INSET)
		.pt(DOCUMENT_INSET)
		.pb(DOCUMENT_INSET)
		.items_center()
		.scroll(ScrollSpec { stick_bottom: false })
		.child(article)
}

pub fn document_title(t: &Tokens, name: &str) -> El {
	text(name.to_owned()).font(TEXT_TITLE).color(t.foreground).wrap().role("heading")
}

pub fn document_body(t: &Tokens, markdown: &str) -> El {
	let blocks = markdown.split(BLOCK_GAP).filter(|block| !block.trim().is_empty()).map(|source| {
		let kind = block_type_of(source);
		let rows = rows_of(source)
			.into_iter()
			.map(|line| {
				(
					line.mark,
					text(plain_of(&line.text))
						.font(block_style(kind))
						.color(block_ink(t, kind))
						.wrap(),
				)
			})
			.collect();
		block_frame(t, kind, rows)
	});
	col().key("library-document-body").w_full().gap(SPACING * 3.5).children(blocks)
}

fn block_style(kind: LibraryBlockType) -> TextStyle {
	match kind {
		LibraryBlockType::Heading => TEXT_BASE_SEMIBOLD,
		LibraryBlockType::Code => TEXT_COMPACT_MONO,
		_ => TEXT_READING,
	}
}

fn block_ink(t: &Tokens, kind: LibraryBlockType) -> Color {
	if kind == LibraryBlockType::Heading { t.foreground } else { t.soft_foreground }
}

fn row_glyph(t: &Tokens, mark: RowMark) -> Option<El> {
	let glyph = match mark {
		RowMark::None | RowMark::Quote => return None,
		RowMark::Bullet => label_text("•", TEXT_READING, t.muted_foreground),
		RowMark::Number(number) => {
			label_text(&format!("{number}."), TEXT_READING, t.muted_foreground)
		}
		RowMark::Task(done) => {
			let side = SPACING * 4.0;
			let check = el()
				.size(side, side)
				.radius(RADIUS_XS * 2.0)
				.border(1.0, if done { t.primary } else { t.input });
			if done {
				check
					.fill(t.primary)
					.center()
					.child(icon(&icons::CHECK, SPACING * 3.0).color(t.primary_foreground))
			} else {
				check
			}
		}
	};
	Some(row().h(SPACING * 5.5).center_y().child(glyph.a11y_hidden()))
}

fn block_frame(t: &Tokens, kind: LibraryBlockType, rows: Vec<(RowMark, El)>) -> El {
	let lines = rows.into_iter().map(|(mark, body)| {
		let mut line = row().w_full().gap(SPACING * 2.0).items_start();
		if let Some(glyph) = row_glyph(t, mark) {
			line = line.child(glyph);
		}
		line.child(col().grow(1.0).min_w(0.0).child(body))
	});
	let column = col().w_full().gap(SPACING * 1.5).children(lines);
	match kind {
		LibraryBlockType::Heading => column.pt(SPACING * 2.5),
		LibraryBlockType::Quote => row()
			.w_full()
			.gap(SPACING * 3.0)
			.child(el().w(2.0).h_full().fill(t.border))
			.child(column.grow(1.0).min_w(0.0)),
		LibraryBlockType::Callout | LibraryBlockType::Code => {
			column.fill(t.muted).radius(RADIUS_MD).padding(SPACING * 3.0)
		}
		LibraryBlockType::Table
		| LibraryBlockType::Gallery
		| LibraryBlockType::WebPage
		| LibraryBlockType::Collapsible
		| LibraryBlockType::Other => {
			column.border(1.0, t.border).radius(RADIUS_MD).padding(SPACING * 3.0)
		}
		LibraryBlockType::Paragraph | LibraryBlockType::List | LibraryBlockType::Checklist => {
			column
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DocumentStart {
	Checklist,
	Gallery,
	Table,
	Template,
}

impl DocumentStart {
	pub const ALL: [DocumentStart; 4] = [
		DocumentStart::Checklist,
		DocumentStart::Gallery,
		DocumentStart::Table,
		DocumentStart::Template,
	];

	fn label(self) -> Key {
		use common::library::document::start;
		match self {
			DocumentStart::Checklist => start::CHECKLIST,
			DocumentStart::Gallery => start::GALLERY,
			DocumentStart::Table => start::TABLE,
			DocumentStart::Template => start::TEMPLATE,
		}
	}

	fn glyph(self) -> &'static rune::Icon {
		match self {
			DocumentStart::Checklist => &icons::LIST_TODO,
			DocumentStart::Gallery => &icons::IMAGES,
			DocumentStart::Table => &icons::TABLE,
			DocumentStart::Template => &icons::LAYOUT_DASHBOARD,
		}
	}
}

pub fn document_placeholder<S: 'static>(
	t: &Tokens,
	lang: Language,
	on: impl Fn(&mut S, DocumentStart) + Clone + 'static,
) -> El {
	use common::library::document;
	let buttons = DocumentStart::ALL.map(|kind| {
		let label = say(kind.label(), lang);
		let on = on.clone();
		focus_ring(
			t,
			instant(
				row()
					.key(format!("library-start-{label}"))
					.h(SPACING * 7.0)
					.px(SPACING * 2.5)
					.gap(SPACING * 1.5)
					.center_y()
					.radius(SPACING * 3.5)
					.border(1.0, t.input)
					.hover(faded(t.foreground, 0.05))
					.role("button")
					.label(label)
					.child(icon(kind.glyph(), SPACING * 3.5).color(t.foreground).a11y_hidden())
					.child(label_text(label, TEXT_XS_MEDIUM, t.foreground)),
			),
		)
		.on_press(move |s: &mut S| on(s, kind))
	});
	col()
		.w_full()
		.child(label_text(say(document::PLACEHOLDER, lang), TEXT_READING, t.placeholder_foreground))
		.child(
			row()
				.flex_wrap()
				.gap(SPACING * 1.5)
				.center_y()
				.pt(SPACING * 4.5)
				.role("group")
				.label(say(document::start::LABEL, lang))
				.child(label_text(
					say(document::start::LABEL, lang),
					TEXT_XS_MEDIUM,
					t.muted_foreground,
				))
				.children(buttons),
		)
}

pub fn drop_line(t: &Tokens, lang: Language, count: usize) -> El {
	use common::library::document;
	let template = say(if count == 1 { document::DROP_ONE } else { document::DROP_OTHER }, lang);
	let pill = row()
		.h(SPACING * 7.0)
		.px(SPACING * 3.0)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(SPACING * 3.5)
		.fill(t.primary)
		.shadow(SPACING, SPACING * 3.0, Color::BLACK.alpha(0.25))
		.child(icon(&icons::DOWNLOAD, SPACING * 3.5).color(t.primary_foreground))
		.child(label_text(
			&filled(template, "count", &count.to_string()),
			TEXT_COMPACT_MEDIUM,
			t.primary_foreground,
		));
	el().w_full()
		.h(SPACING * 7.0)
		.a11y_hidden()
		.child(
			el().pin(Some(0.0), Some(SPACING * 3.25), Some(0.0), None)
				.h(2.0)
				.radius(1.0)
				.fill(t.primary),
		)
		.child(
			el().pin(Some(0.0), Some(SPACING * 2.25), None, None)
				.size(SPACING * 2.5, SPACING * 2.5)
				.radius(SPACING * 1.25)
				.border(2.0, t.primary)
				.fill(t.card),
		)
		.child(row().pin(Some(0.0), Some(0.0), Some(0.0), None).center().child(pill))
}

pub fn failed_import<S: 'static>(
	t: &Tokens,
	lang: Language,
	name: &str,
	choose: impl Fn(&mut S) + 'static,
	remove: impl Fn(&mut S) + 'static,
) -> El {
	use common::library;
	let line = filled(say(library::failure::import::TITLE, lang), "name", name);
	failure_card(
		t,
		&line,
		None,
		vec![
			small_pill(t, say(library::document::failed_import::CHOOSE, lang), true)
				.on_press(choose),
			small_pill(t, say(library::document::failed_import::REMOVE, lang), false)
				.on_press(remove),
		],
	)
	.w_full()
	.h_full()
}

pub struct EditorBlock<'a> {
	pub id: &'a str,
	pub kind: LibraryBlockType,
	pub rows: Vec<(RowMark, &'a TextEdit)>,
	pub source: &'a str,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BlockEvent {
	Typed { block: String, field: usize },
	Enter { block: String, field: usize },
	Backspace { block: String, field: usize },
	SlashOpened { block: String, field: usize },
	SlashChosen(LibraryBlockType),
	SlashClosed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Slash<'a> {
	pub block: &'a str,
	pub field: usize,
	pub active: usize,
	pub is_above: bool,
}

pub type FieldAccess<S> = for<'a> fn(&'a mut S, &str, usize) -> &'a mut TextEdit;

pub const SLASH_MENU: &str = "library-slash-menu";
const SLASH_WIDTH: f32 = SPACING * 75.0;
const SLASH_HEIGHT: f32 = SPACING * 100.0;

pub fn field_key(block: &str, field: usize) -> String {
	format!("library-block-{block}:{field}")
}

pub fn block_editor<S: 'static>(
	t: &Tokens,
	lang: Language,
	blocks: &[EditorBlock],
	slash: Option<Slash>,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> (El, Vec<El>) {
	let body = col()
		.key("library-block-editor")
		.w_full()
		.gap(SPACING * 3.5)
		.label(say(common::library::editor::BODY, lang))
		.children(blocks.iter().map(|block| editor_block(t, lang, block, access, on.clone())));
	let mut layers = Vec::new();
	if let Some(slash) = slash {
		slash_menu(t, lang, slash, on).build(&t.kit(), &mut layers);
	}
	(body, layers)
}

fn editor_block<S: 'static>(
	t: &Tokens,
	lang: Language,
	block: &EditorBlock,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	if !block.kind.is_text() && block.rows.is_empty() {
		let source =
			text(block.source.to_owned()).font(TEXT_COMPACT_MONO).color(t.muted_foreground).wrap();
		return block_frame(t, block.kind, vec![(RowMark::None, source)]);
	}
	let rows = block
		.rows
		.iter()
		.enumerate()
		.map(|(index, (mark, edit))| {
			(*mark, block_field(t, lang, block, index, edit, access, on.clone()))
		})
		.collect();
	block_frame(t, block.kind, rows)
}

fn block_field<S: 'static>(
	t: &Tokens,
	lang: Language,
	block: &EditorBlock,
	field: usize,
	edit: &TextEdit,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	let (edit_id, key_id, change_id) =
		(block.id.to_owned(), block.id.to_owned(), block.id.to_owned());
	let change_on = on.clone();
	text_input(edit, block_style(block.kind))
		.key(field_key(block.id, field))
		.w_full()
		.color(block_ink(t, block.kind))
		.caret(t.foreground, t.selection)
		.label(say(block.kind.label(), lang))
		.on_edit(move |s: &mut S| access(s, &edit_id, field))
		.on_input_key(move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
			let block = key_id.clone();
			let plain = event.mods == rune::Mods::default();
			let event = match &event.key {
				KeyName::Enter if plain => BlockEvent::Enter { block, field },
				KeyName::Backspace if plain => BlockEvent::Backspace { block, field },
				KeyName::Text(typed) if typed == "/" => BlockEvent::SlashOpened { block, field },
				_ => return false,
			};
			on(s, event)
		})
		.on_input_change(move |s: &mut S, _: &mut Tx| {
			change_on(s, BlockEvent::Typed { block: change_id.clone(), field });
		})
}

fn slash_menu<S: 'static>(
	t: &Tokens,
	lang: Language,
	slash: Slash,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> PopupList<S> {
	let items = LibraryBlockType::SLASH.map(|kind| {
		let glyph = row()
			.size(SPACING * 6.0, SPACING * 6.0)
			.radius(RADIUS_SM)
			.border(1.0, t.border)
			.center()
			.child(icon(kind.glyph(), SPACING * 3.5).color(t.foreground));
		let mut item = PopupItem::new(kind.name(), say(kind.label(), lang)).leading(glyph);
		if let Some(hint) = kind.markdown_hint() {
			item =
				item.trailing(text(hint.to_owned()).font(TEXT_XS_MONO).color(t.muted_foreground));
		}
		item
	});
	let (choose_on, close_on) = (on.clone(), on);
	PopupList::new(SLASH_MENU, field_key(slash.block, slash.field))
		.side(if slash.is_above { Side::Top } else { Side::Bottom })
		.align(Align::Start)
		.offset(SPACING)
		.width(SLASH_WIDTH)
		.max_height(SLASH_HEIGHT)
		.label(say(common::library::editor::blocks::slash::LABEL, lang))
		.items(items)
		.active(Some(slash.active))
		.on_choose(move |s: &mut S, id: &str, _: &mut Tx| {
			if let Some(kind) = LibraryBlockType::SLASH.into_iter().find(|kind| kind.name() == id) {
				choose_on(s, BlockEvent::SlashChosen(kind));
			}
		})
		.on_close(move |s: &mut S| {
			close_on(s, BlockEvent::SlashClosed);
		})
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewDocumentTemplate {
	Blank,
	Brief,
	MeetingNotes,
	Checklist,
}

impl NewDocumentTemplate {
	pub const ALL: [NewDocumentTemplate; 4] = [
		NewDocumentTemplate::Blank,
		NewDocumentTemplate::Brief,
		NewDocumentTemplate::MeetingNotes,
		NewDocumentTemplate::Checklist,
	];

	fn template(self) -> Option<LibraryTemplate> {
		match self {
			NewDocumentTemplate::Blank => None,
			NewDocumentTemplate::Brief => Some(LibraryTemplate::Brief),
			NewDocumentTemplate::MeetingNotes => Some(LibraryTemplate::MeetingNotes),
			NewDocumentTemplate::Checklist => Some(LibraryTemplate::Checklist),
		}
	}

	fn name(self) -> Key {
		self.template().map_or(common::library::templates::blank::NAME, LibraryTemplate::name)
	}

	fn description(self) -> Key {
		self.template()
			.map_or(common::library::templates::blank::DESCRIPTION, LibraryTemplate::description)
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NewDocumentEvent {
	Select(NewDocumentTemplate),
	Create(NewDocumentTemplate),
	Cancel,
}

const DIALOG_WIDTH: f32 = SPACING * 180.0;
const DIALOG_RADIUS: f32 = SPACING * 6.0;
const SKETCH_LINE: f32 = SPACING;

pub fn new_document_dialog<S: 'static>(
	t: &Tokens,
	lang: Language,
	selected: NewDocumentTemplate,
	on: impl Fn(&mut S, NewDocumentEvent) + Clone + 'static,
) -> Vec<El> {
	use common::library;
	let emit = |event: NewDocumentEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event)
	};
	let title = say(library::NEW_DOCUMENT, lang);
	let tiles = NewDocumentTemplate::ALL.map(|template| {
		template_tile(t, lang, template, template == selected)
			.on_press(emit(NewDocumentEvent::Select(template)))
	});
	let footer = row()
		.w_full()
		.flex_wrap()
		.gap(SPACING * 4.0)
		.center_y()
		.justify_between()
		.child(
			label_text(say(selected.description(), lang), TEXT_COMPACT, t.muted_foreground)
				.wrap()
				.grow(1.0)
				.min_w(SPACING * 60.0),
		)
		.child(
			row()
				.gap(SPACING * 2.0)
				.child(
					Button::new(say(library::picker::CANCEL, lang))
						.variant(ButtonVariant::Outline)
						.view(t)
						.on_press(emit(NewDocumentEvent::Cancel)),
				)
				.child(
					Button::new(say(library::picker::CREATE, lang))
						.view(t)
						.on_press(emit(NewDocumentEvent::Create(selected))),
				),
		);
	let panel = col()
		.key("library-new-document-dialog")
		.w_full()
		.max_w(DIALOG_WIDTH)
		.padding(SPACING * 6.0)
		.gap(SPACING * 5.0)
		.radius(DIALOG_RADIUS)
		.fill(t.popover)
		.role("dialog")
		.label(title)
		.child(
			col()
				.gap(SPACING)
				.child(label_text(title, TEXT_BASE_SEMIBOLD, t.popover_foreground).role("heading"))
				.child(
					label_text(
						say(library::picker::SUBTITLE, lang),
						TEXT_COMPACT,
						t.muted_foreground,
					)
					.wrap(),
				),
		)
		.child(
			col()
				.gap(SPACING * 6.0)
				.child(
					row()
						.flex_wrap()
						.gap(SPACING * 4.0)
						.role("radiogroup")
						.label(say(library::picker::TEMPLATES, lang))
						.children(tiles),
				)
				.child(footer),
		);
	let cancel = emit(NewDocumentEvent::Cancel);
	vec![
		scrim(t),
		el().absolute(0.0, 0.0)
			.w_full()
			.h_full()
			.padding(SPACING * 4.0)
			.center()
			.modal(true, cancel)
			.child(elevated(t, panel)),
	]
}

fn template_tile(
	t: &Tokens,
	lang: Language,
	template: NewDocumentTemplate,
	is_checked: bool,
) -> El {
	let name = say(template.name(), lang);
	let preview =
		el().w_full().h(SPACING * 37.5).radius(RADIUS_CONTROL).clip_rounded(RADIUS_CONTROL);
	let preview = match template.template() {
		None => preview
			.border(1.5, t.input)
			.border_dash(SPACING, SPACING)
			.center()
			.child(icon(&icons::PLUS, SPACING * 5.5).color(t.primary)),
		Some(sketched) => preview
			.border(1.0, t.shell_border)
			.fill(t.document_ground)
			.child(sketch(t, lang, sketched)),
	};
	let preview = el().w_full().radius(RADIUS_CONTROL).child(preview);
	let preview = if is_checked { preview.outline(2.0, 2.0, t.primary) } else { preview };
	let tile = col()
		.key(format!("library-template-tile-{name}"))
		.w(SPACING * 39.0)
		.gap(SPACING * 2.5)
		.radius(RADIUS_CONTROL)
		.role("radio")
		.checked(is_checked)
		.label(name)
		.child(preview)
		.child(label_text(name, TEXT_COMPACT_MEDIUM, t.foreground).truncate());
	instant(tile).focusable(true).cursor(Cursor::Pointer).focus_ring(2.0, SPACING, t.ring)
}

fn sketch(t: &Tokens, lang: Language, template: LibraryTemplate) -> El {
	use common::library::templates;
	let line = |is_short: bool| {
		let bar = el().h(SKETCH_LINE).radius(RADIUS_XS).fill(t.sketch_line);
		if is_short { bar.w_frac(2.0 / 3.0) } else { bar.w_full() }
	};
	let section = |heading: Option<Key>, lines: usize| {
		let mut part = col().w_full().gap(SPACING * 1.5);
		if let Some(heading) = heading {
			part = part.child(label_text(say(heading, lang), TEXT_10_MEDIUM, t.foreground));
		}
		part.children((0..lines).map(|index| line(index + 1 == lines && lines > 1)))
	};
	let (title, parts) = match template {
		LibraryTemplate::Brief => (
			templates::brief::NAME,
			vec![
				section(None, 2),
				section(Some(templates::brief::goal::HEADING), 1),
				section(Some(templates::brief::done_when::HEADING), 2),
			],
		),
		LibraryTemplate::MeetingNotes => (
			templates::meeting_notes::NAME,
			vec![
				section(None, 2),
				section(Some(templates::meeting_notes::decisions::HEADING), 2),
				section(Some(templates::meeting_notes::next_steps::HEADING), 1),
			],
		),
		LibraryTemplate::Checklist => (
			templates::checklist::NAME,
			(0..4)
				.map(|index| {
					row()
						.w_full()
						.gap(SPACING * 1.25)
						.center_y()
						.child(
							el().size(SPACING * 1.75, SPACING * 1.75)
								.radius(RADIUS_XS)
								.border(1.0, t.sketch_mark),
						)
						.child(col().grow(1.0).child(line(index % 2 == 1)))
				})
				.collect(),
		),
	};
	col()
		.pin(Some(0.0), Some(SPACING * 4.0), Some(0.0), Some(0.0))
		.items_center()
		.a11y_hidden()
		.child(
			col()
				.w(SPACING * 35.0)
				.h_full()
				.padding(SPACING * 3.0)
				.gap(SPACING * 2.5)
				.clip_corners([RADIUS_SM, RADIUS_SM, 0.0, 0.0])
				.fill(t.card_raised)
				.child(label_text(say(title, lang), TEXT_10_MEDIUM, t.foreground))
				.children(parts),
		)
}

pub struct LightboxImage<'a> {
	pub name: &'a str,
	pub detail: &'a str,
	pub image: Option<&'a Image>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LightboxEvent {
	Item(ItemEvent),
	Previous,
	Next,
	ZoomOut,
	ZoomIn,
	Fit,
}

const STEP: f32 = SPACING * 10.0;
const ZOOM_HEIGHT: f32 = SPACING * 9.0;
const ZOOM_CONTROL: f32 = SPACING * 7.0;

pub fn lightbox<S: 'static>(
	lang: Language,
	shown: &LightboxImage,
	position: usize,
	count: usize,
	on: impl Fn(&mut S, LightboxEvent) + Clone + 'static,
) -> El {
	use common::library::lightbox as copy;
	let t = &Tokens::new(true);
	let emit = |event: LightboxEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event.clone())
	};
	let item_on = {
		let on = on.clone();
		move |s: &mut S, event: ItemEvent| on(s, LightboxEvent::Item(event))
	};
	let name = shown_name(shown.name, lang);
	let leading = row()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(bar_action(
			t,
			&icons::PREVIOUS,
			say(copy::BACK, lang),
			true,
			emit(LightboxEvent::Item(ItemEvent::Back)),
		))
		.child(
			row()
				.min_w(0.0)
				.gap(SPACING * 2.5)
				.center_y()
				.child(
					label_text(name, TEXT_SM_MEDIUM, t.foreground)
						.truncate()
						.help_when_truncated(name.to_owned()),
				)
				.child(label_text(shown.detail, TEXT_COMPACT, t.muted_foreground)),
		);
	let step = |glyph: &'static rune::Icon, label: &str, event: LightboxEvent| {
		focus_ring(
			t,
			instant(
				row()
					.key(format!("lightbox-{label}"))
					.size(STEP, STEP)
					.radius(STEP / 2.0)
					.center()
					.fill(faded(t.foreground, 0.1))
					.hover(faded(t.foreground, 0.16))
					.role("button")
					.label(label)
					.child(icon(glyph, SPACING * 4.5).color(t.foreground)),
			),
		)
		.on_press(emit(event))
	};
	let picture = el().w_full().h_full().radius(RADIUS_MD);
	let picture = match shown.image.filter(|image| image.size().is_some()) {
		Some(image) => picture.pixels_fit(image.pixels(), SurfaceFit::Fit),
		None => picture.fill(faded(t.border, 0.6)),
	};
	let stage = row()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.px(SPACING * 5.0)
		.pb(SPACING * 18.0)
		.gap(SPACING * 5.0)
		.center_y()
		.child(step(&icons::PREVIOUS, say(copy::PREVIOUS, lang), LightboxEvent::Previous))
		.child(col().grow(1.0).min_w(0.0).h_full().child(picture))
		.child(step(&icons::NEXT, say(copy::NEXT, lang), LightboxEvent::Next));
	let zoom_button = |glyph: &'static rune::Icon, label: &str, event: LightboxEvent| {
		focus_ring(
			t,
			instant(
				row()
					.key(format!("lightbox-{label}"))
					.size(ZOOM_CONTROL, ZOOM_CONTROL)
					.radius(ZOOM_CONTROL / 2.0)
					.center()
					.hover(faded(t.foreground, 0.08))
					.role("button")
					.label(label)
					.child(icon(glyph, SPACING * 4.0).color(t.foreground)),
			),
		)
		.on_press(emit(event))
	};
	let fit_label = say(copy::FIT, lang);
	let fit = focus_ring(
		t,
		instant(
			row()
				.key("lightbox-fit")
				.w(SPACING * 13.0)
				.h(ZOOM_CONTROL)
				.radius(ZOOM_CONTROL / 2.0)
				.center()
				.hover(faded(t.foreground, 0.08))
				.role("button")
				.label(say(copy::FIT_TO_STAGE, lang))
				.child(label_text(fit_label, TEXT_COMPACT_MEDIUM, t.foreground)),
		),
	)
	.on_press(emit(LightboxEvent::Fit));
	let place = filled(
		&filled(say(copy::POSITION, lang), "position", &position.to_string()),
		"count",
		&count.to_string(),
	);
	let zoom = row()
		.h(ZOOM_HEIGHT)
		.padding(SPACING)
		.gap(SPACING * 0.5)
		.center_y()
		.radius(ZOOM_HEIGHT / 2.0)
		.fill(t.card_raised)
		.shadow(SPACING * 2.0, SPACING * 6.0, Color::BLACK.alpha(0.4))
		.outline(1.0, 0.0, faded(t.foreground, 0.1))
		.child(zoom_button(&icons::MINUS, say(copy::ZOOM_OUT, lang), LightboxEvent::ZoomOut))
		.child(fit)
		.child(zoom_button(&icons::PLUS, say(copy::ZOOM_IN, lang), LightboxEvent::ZoomIn))
		.child(el().w(1.0).h(SPACING * 4.5).fill(faded(t.foreground, 0.12)))
		.child(label_text(&place, TEXT_COMPACT, t.muted_foreground).px(SPACING * 2.5));
	col()
		.key("library-lightbox")
		.pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
		.fill(lightbox_ground(t))
		.role("dialog")
		.label(name)
		.child(library_bar(
			leading,
			item_actions(t, lang, ItemSurface::Lightbox, Vec::new(), item_on),
		))
		.child(stage)
		.child(
			row().pin(Some(0.0), None, Some(0.0), Some(0.0)).h(SPACING * 18.0).center().child(zoom),
		)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DocumentPanelEvent {
	OpenInLibrary,
	Close,
}

pub const DOCUMENT_PANEL_WIDTH: f32 = SPACING * 150.0;

pub fn document_panel<S: 'static>(
	t: &Tokens,
	lang: Language,
	title: &str,
	presence: Option<El>,
	body: El,
	on: impl Fn(&mut S, DocumentPanelEvent) + Clone + 'static,
) -> El {
	use common::library::panel;
	let title = shown_name(title, lang);
	let emit = |event: DocumentPanelEvent| {
		let on = on.clone();
		move |s: &mut S| on(s, event)
	};
	let button = |glyph: &'static rune::Icon, label: &str, event: DocumentPanelEvent| {
		Button::icon(glyph, label)
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconSm)
			.view(t)
			.on_press(emit(event))
	};
	let header = row()
		.w_full()
		.h(SPACING * 12.0)
		.px(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.center_y()
		.border(0.0, t.border)
		.child(
			row()
				.size(SPACING * 7.0, SPACING * 7.0)
				.radius(RADIUS_MD)
				.fill(t.muted)
				.center()
				.child(icon(&icons::FILE, SPACING * 4.0).color(t.foreground))
				.a11y_hidden(),
		)
		.child(label_text(title, TEXT_SM_MEDIUM, t.foreground).truncate().grow(1.0).min_w(0.0))
		.children(presence)
		.child(button(
			&icons::EXTERNAL_LINK,
			say(panel::OPEN_IN_LIBRARY, lang),
			DocumentPanelEvent::OpenInLibrary,
		))
		.child(button(&icons::CLOSE, say(panel::CLOSE, lang), DocumentPanelEvent::Close));
	let divider = el().w_full().h(1.0).fill(faded(t.foreground, 0.06));
	let content =
		col().w_full().grow(1.0).min_h(0.0).scroll(ScrollSpec { stick_bottom: false }).child(
			col()
				.w_full()
				.gap(SPACING * 3.5)
				.padding(SPACING * 8.0)
				.child(document_title(t, title))
				.child(body),
		);
	row()
		.key("document-panel")
		.w(DOCUMENT_PANEL_WIDTH)
		.max_w(DOCUMENT_PANEL_WIDTH)
		.h_full()
		.fill(t.card)
		.role("complementary")
		.label(title)
		.child(el().w(1.0).h_full().fill(faded(t.foreground, 0.08)))
		.child(col().grow(1.0).min_w(0.0).h_full().child(header).child(divider).child(content))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::generated::{PACKAGES_UI, read};

	fn blocks_module() -> String {
		read(&format!("{PACKAGES_UI}/src/components/library-document-blocks.ts"))
	}

	fn quoted(source: &str, from: &str, to: &str) -> Vec<String> {
		let start = source.find(from).unwrap_or_else(|| panic!("{from} is missing"));
		let rest = &source[start..];
		let span = &rest[..rest.find(to).unwrap_or(rest.len())];
		span.split('"').skip(1).step_by(2).map(str::to_owned).collect()
	}

	fn numbered(count: &mut usize) -> String {
		*count += 1;
		format!("blk{count:03}")
	}

	#[test]
	fn every_block_type_is_the_one_of_packages_ui() {
		let module = blocks_module();
		let mut expected = quoted(&module, "const TEXT_BLOCK_TYPES", "] as const");
		expected.extend(quoted(&module, "type LibraryBlockType =", "\n\n"));
		let names: Vec<String> =
			LibraryBlockType::ALL.iter().map(|kind| kind.name().to_owned()).collect();
		assert_eq!(names, expected);
	}

	#[test]
	fn every_fenced_label_maps_as_packages_ui_does() {
		let module = blocks_module();
		let start = module.find("const FENCED_TYPES").expect("FENCED_TYPES is missing");
		let table =
			&module[start..start + module[start..].find('}').expect("FENCED_TYPES never closes")];
		let rows: Vec<(String, String)> = table
			.lines()
			.filter_map(|line| line.trim().trim_end_matches(',').split_once(": "))
			.filter(|(_, kind)| kind.starts_with('"'))
			.map(|(label, kind)| {
				(label.trim_matches('"').to_owned(), kind.trim_matches('"').to_owned())
			})
			.collect();
		assert_eq!(rows.len(), FENCED_TYPES.len());
		for (label, kind) in rows {
			assert_eq!(block_type_of(&format!("```{label}\nbody\n```")).name(), kind, "{label}");
		}
	}

	#[test]
	fn the_block_id_shape_is_the_one_of_packages_ui() {
		let module = blocks_module();
		assert!(module.contains(&format!("const ID_LENGTH = {BLOCK_ID_LENGTH}\n")));
		assert!(module.contains(&format!("const ID_ALPHABET = \"{BLOCK_ID_ALPHABET}\"\n")));
		assert!(is_block_id("k3x9qa"));
		assert!(!is_block_id("K3x9qa"));
		assert!(!is_block_id("k3x9q"));
	}

	#[test]
	fn each_source_reads_as_its_block_type() {
		let cases = [
			("The launch is on the 14th.", LibraryBlockType::Paragraph),
			("## Timeline", LibraryBlockType::Heading),
			("- Copy\n- Screenshots", LibraryBlockType::List),
			("1. Copy\n2. Screenshots", LibraryBlockType::List),
			("- [x] Copy is final\n- [ ] Release notes", LibraryBlockType::Checklist),
			("> The export keeps the archived rooms too.", LibraryBlockType::Quote),
			("> [!NOTE]\n> Keep the archive.", LibraryBlockType::Callout),
			("| Room | Seats |\n| --- | --- |\n| Atlas | 12 |", LibraryBlockType::Table),
			("```rust\nfn main() {}\n```", LibraryBlockType::Code),
			("    indented code", LibraryBlockType::Code),
			("```gallery\n- src: a.png\n```", LibraryBlockType::Gallery),
			("```web-page\nurl: https://example.org\n```", LibraryBlockType::WebPage),
			("```collapsible\n- title: One\n```", LibraryBlockType::Collapsible),
			("```mermaid\ngraph TD\n```", LibraryBlockType::Other),
		];
		for (source, kind) in cases {
			assert_eq!(block_type_of(source), kind, "{source}");
		}
	}

	#[test]
	fn parsing_then_serializing_gives_the_markdown_back_with_its_ids() {
		let markdown =
			"# Brief\n\nOne line.\n\n\n```rust\nfn main() {\n\n}\n```\n\n- [ ] Ship it\n";
		let mut count = 0;
		let blocks = parse_blocks(markdown, || numbered(&mut count));
		let ids: Vec<&str> = blocks.iter().map(|block| block.id.as_str()).collect();
		assert_eq!(ids, ["blk001", "blk002", "blk003", "blk004"]);
		assert!(ids.iter().all(|id| is_block_id(id)));
		assert_eq!(blocks[2].kind(), LibraryBlockType::Code);
		assert_eq!(serialize_blocks(&blocks), markdown);
	}

	#[test]
	fn a_checklist_reads_as_rows_with_their_boxes() {
		let rows = rows_of("- [x] Copy is **final**\n- [ ] Release notes");
		assert_eq!(
			rows[0],
			BlockRow { mark: RowMark::Task(true), text: "Copy is **final**".to_owned() }
		);
		assert_eq!(
			rows[1],
			BlockRow { mark: RowMark::Task(false), text: "Release notes".to_owned() }
		);
		assert_eq!(plain_of(&rows[0].text), "Copy is final");
	}

	#[test]
	fn a_blank_name_reads_untitled() {
		assert_eq!(shown_name("   ", Language::En), "Untitled");
		assert_eq!(shown_name("   ", Language::Fr), "Sans titre");
		assert_eq!(shown_name("Weekly sync", Language::En), "Weekly sync");
	}

	#[test]
	fn the_grid_keeps_four_columns_at_the_artboard_width() {
		assert_eq!(grid_columns(1280.0 - 60.0 - 6.0), 4);
		assert_eq!(grid_columns(320.0), 1);
	}
}
