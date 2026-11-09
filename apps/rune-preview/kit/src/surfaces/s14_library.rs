use rune::image::Image;
use rune::{
	Align, Color, Cursor, El, Key as KeyName, KeyEvent, ScrollSpec, Side, SurfaceFit, TextEdit,
	TextStyle, Tx, col, el, icon, row, text, text_input,
};
use rune::{Block, Mark, MarkRange, Span};

use crate::avatar::{Face, Person};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::context_menu::{
	Mark as MenuMark, MenuItem, MenuRow, Shortcut, wired_context_menu,
};
use crate::primitives::dialog::{DialogContent, dialog, scrim};
use crate::primitives::dropdown_menu::wired_dropdown_menu;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::primitives::{
	DISABLED_OPACITY, FOCUS_RING_WIDTH, elevated, equal_padding, instant, ring_tint, tight,
};
use crate::strings::{Key, Language, common};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_LG, RADIUS_MD, RADIUS_SM, RADIUS_XL, RADIUS_XS, SPACING, TEXT_10_MEDIUM,
	TEXT_BASE_SEMIBOLD, TEXT_COMPACT, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO,
	TEXT_COMPACT_SEMIBOLD, TEXT_READING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_TITLE,
	TEXT_XS, TEXT_XS_MEDIUM, TEXT_XS_MONO, Tokens, faded,
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
			LibraryBlockType::Paragraph => &icons::ALIGN_LEFT,
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
			LibraryBlockType::Other => &icons::FILE,
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
	pub depth: usize,
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
		return vec![BlockRow {
			mark: RowMark::None,
			depth: 0,
			text: body.collect::<Vec<_>>().join("\n"),
		}];
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
			BlockRow { mark, depth: indent / 2, text: bare[at..].to_owned() }
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

fn emitter<S: 'static, E: Clone + 'static>(
	on: &(impl Fn(&mut S, E) + Clone + 'static),
	event: E,
) -> impl Fn(&mut S) + 'static {
	let on = on.clone();
	move |s: &mut S| on(s, event.clone())
}

fn pressed_on_return<S: 'static>(
	press: impl Fn(&mut S) + 'static,
) -> impl Fn(&mut S, &KeyEvent, &mut Tx) -> bool + 'static {
	move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
		let is_return = event.key == KeyName::Enter && event.mods == rune::Mods::default();
		if is_return {
			press(s);
		}
		is_return
	}
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct BarActions {
	pub shown: bool,
	pub is_copied: bool,
}

impl BarActions {
	pub const EVERY: BarActions = BarActions { shown: true, is_copied: false };
	pub const NONE: BarActions = BarActions { shown: false, is_copied: false };
}

pub const MORE_KEY: &str = "bar-More";

fn item_actions<S: 'static>(
	t: &Tokens,
	lang: Language,
	surface: ItemSurface,
	leading: Vec<El>,
	bar: BarActions,
	on: impl Fn(&mut S, ItemEvent) + Clone + 'static,
) -> El {
	use common::library::{document, lightbox};
	let [download, copy, copied, more, close] = match surface {
		ItemSurface::Document => {
			[document::DOWNLOAD, document::COPY, document::COPIED, document::MORE, document::CLOSE]
		}
		ItemSurface::Lightbox => {
			[lightbox::DOWNLOAD, lightbox::COPY, lightbox::COPIED, lightbox::MORE, lightbox::CLOSE]
		}
	};
	let emit = |event: ItemEvent| emitter(&on, event);
	let mut actions = row().gap(SPACING * 2.0).center_y().children(leading);
	if bar.shown {
		let copy_glyph = if bar.is_copied { &icons::CHECK } else { &icons::COPY };
		let mut copy = bar_action(t, copy_glyph, say(copy, lang), false, emit(ItemEvent::Copy));
		if bar.is_copied {
			copy = copy.live_region(rune::LiveRegion::Polite).description(say(copied, lang));
		}
		actions = actions
			.child(bar_action(
				t,
				&icons::DOWNLOAD,
				say(download, lang),
				false,
				emit(ItemEvent::Download),
			))
			.child(copy)
			.child(bar_action(
				t,
				&icons::MORE_HORIZONTAL,
				say(more, lang),
				false,
				emit(ItemEvent::More),
			))
			.child(bar_divider(t));
	}
	actions.child(bar_action(t, &icons::CLOSE, say(close, lang), true, emit(ItemEvent::Close)))
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
	Failed,
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
	Menu { id: String, anchor: String },
	Retry,
}

pub struct LibraryPanel<'a> {
	pub state: PanelState,
	pub items: &'a [LibraryItem<'a>],
	pub filter: LibraryFilter,
	pub query: &'a TextEdit,
	pub actions: PanelActions,
	pub columns: usize,
	pub focused: Option<&'a str>,
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
	if panel.state == PanelState::Failed {
		return library_failed(t, lang, on);
	}
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
		grid(t, lang, &shown, panel.columns, panel.focused, on)
	};
	let content = col().w_full().grow(1.0).min_h(0.0).child(header).child(body);
	let content = if is_loading {
		content.clip_rounded(0.0).label(say(common::library::TITLE, lang))
	} else {
		content.scroll(ScrollSpec { stick_bottom: false })
	};
	col().key("library-panel").w_full().h_full().min_h(0.0).child(content)
}

fn library_failed<S: 'static>(
	t: &Tokens,
	lang: Language,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	let retry = small_pill(t, say(crate::strings::chat::notice::RETRY, lang), true)
		.on_press(emitter(&on, LibraryEvent::Retry));
	let card = failure_card(t, say(common::library::failure::LIST, lang), None, vec![retry])
		.w_full()
		.max_w(SPACING * 96.0)
		.radius(RADIUS_CONTROL);
	row().key("library-panel").w_full().h_full().padding(SPACING * 6.0).center().child(card)
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
	let emit = |event: LibraryEvent| emitter(&on, event);
	let mut actions = row().gap(SPACING * 2.0).center_y();
	if panel.actions.search {
		actions = actions.child(search_field(t, lang, panel.query, query));
	}
	if panel.actions.import {
		actions = actions.child(
			outlined_pill(t, &icons::UPLOAD, say(library::IMPORT, lang))
				.on_press(emit(LibraryEvent::Import)),
		);
	}
	if panel.actions.new_board {
		actions = actions.child(
			outlined_pill(t, &icons::STICKY_NOTE, say(library::NEW_BOARD, lang))
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
	focused: Option<&str>,
	on: impl Fn(&mut S, LibraryEvent) + Clone + 'static,
) -> El {
	let cells = items
		.iter()
		.map(|item| match item.import_progress {
			Some(progress) => importing_tile(t, lang, item, progress),
			None => {
				let open = emitter(&on, LibraryEvent::Open(item.id.to_owned()));
				let anchor = tile_more_key(item.id);
				let menu = LibraryEvent::Menu { id: item.id.to_owned(), anchor: anchor.clone() };
				let more = tile_more(t, lang, item, anchor, focused == Some(item.id))
					.on_press(emitter(&on, menu.clone()))
					.on_key(pressed_on_return(emitter(&on, menu)));
				el().w_full().hover_group().child(tile(t, lang, item).on_press(open)).child(more)
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

pub fn tile_more_key(id: &str) -> String {
	format!("library-item-more-{id}")
}

fn tile_more(t: &Tokens, lang: Language, item: &LibraryItem, key: String, is_revealed: bool) -> El {
	let label =
		filled(say(common::library::item_menu::LABEL, lang), "name", shown_name(item.name, lang));
	let face = row()
		.size(BAR_CONTROL, BAR_CONTROL)
		.radius(BAR_CONTROL / 2.0)
		.center()
		.fill(t.card)
		.hover(t.muted)
		.child(icon(&icons::MORE_HORIZONTAL, SPACING * 4.0).color(t.foreground));
	let face = if is_revealed { face } else { face.group_opacity(0.0, 1.0) };
	let control = row()
		.key(key)
		.pin(None, Some(SPACING * 2.0), Some(SPACING * 2.0), None)
		.radius(BAR_CONTROL / 2.0)
		.role("button")
		.label(label)
		.child(face);
	focus_ring(t, instant(control))
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
	let emit = |event: LibraryEvent| emitter(&on, event);
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
					.child(icon(&icons::UPLOAD, SPACING * 4.5).color(t.muted_foreground)),
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
				outlined_pill(t, &icons::UPLOAD, say(library::bring_in::ACTION, lang))
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
	pub actions: BarActions,
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
	library_bar(crumbs, item_actions(t, lang, ItemSurface::Document, leading, bar.actions, on))
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

pub fn document_body<'a>(
	t: &Tokens,
	lang: Language,
	markdown: &str,
	runs: &[Run],
	picture: &dyn Fn(&str) -> TileImage<'a>,
) -> El {
	let blocks = parse_blocks(markdown, String::new)
		.into_iter()
		.map(|block| body_block(t, lang, &block.source, runs, picture));
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

fn row_glyph(t: &Tokens, mark: RowMark, is_ringed: bool) -> Option<El> {
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
			let check =
				if is_ringed { check.outline(3.0, 0.0, faded(t.primary, 0.3)) } else { check };
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
	block_frame_ringed(t, kind, rows, None)
}

fn block_frame_ringed(
	t: &Tokens,
	kind: LibraryBlockType,
	rows: Vec<(RowMark, El)>,
	ringed_row: Option<usize>,
) -> El {
	let lines = rows.into_iter().enumerate().map(|(index, (mark, body))| {
		let mut line = row().w_full().gap(SPACING * 2.5).items_start();
		if let Some(glyph) = row_glyph(t, mark, ringed_row == Some(index)) {
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
		.child(icon(&icons::UPLOAD, SPACING * 3.5).color(t.primary_foreground))
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
	pub placeholder: Option<&'a str>,
	pub drawn: Option<El>,
	pub above: Option<El>,
	pub start: Option<El>,
	pub end: Option<El>,
	pub handle: Option<El>,
	pub ringed_row: Option<usize>,
	pub depths: Vec<usize>,
}

impl<'a> EditorBlock<'a> {
	pub fn new(
		id: &'a str,
		kind: LibraryBlockType,
		rows: Vec<(RowMark, &'a TextEdit)>,
		source: &'a str,
	) -> EditorBlock<'a> {
		EditorBlock {
			id,
			kind,
			rows,
			source,
			placeholder: None,
			drawn: None,
			above: None,
			start: None,
			end: None,
			handle: None,
			ringed_row: None,
			depths: Vec::new(),
		}
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum BlockEvent {
	Typed { block: String, field: usize },
	Enter { block: String, field: usize },
	Backspace { block: String, field: usize },
	SlashOpened { block: String, field: usize },
	SlashMoved(i32),
	SlashConfirmed,
	SlashChosen(LibraryBlockType),
	SlashClosed,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Slash<'a> {
	pub block: &'a str,
	pub field: usize,
	pub query: &'a str,
	pub active: usize,
	pub is_above: bool,
}

impl Slash<'_> {
	pub fn shown(&self, lang: Language) -> Vec<LibraryBlockType> {
		let query = self.query.to_lowercase();
		LibraryBlockType::SLASH
			.into_iter()
			.filter(|kind| say(kind.label(), lang).to_lowercase().contains(&query))
			.collect()
	}
}

pub type FieldAccess<S> = for<'a> fn(&'a mut S, &str, usize) -> &'a mut TextEdit;

pub const SLASH_MENU: &str = "library-slash-menu";
const SLASH_WIDTH: f32 = SPACING * 75.0;

pub fn field_key(block: &str, field: usize) -> String {
	format!("library-block-{block}:{field}")
}

pub fn block_editor<S: 'static>(
	t: &Tokens,
	lang: Language,
	blocks: &mut [EditorBlock],
	slash: Option<Slash>,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> (El, Vec<El>) {
	let body = col()
		.key("library-block-editor")
		.w_full()
		.gap(SPACING * 3.5)
		.label(say(common::library::editor::BODY, lang))
		.children(
			blocks.iter_mut().map(|block| editor_block(t, lang, block, slash, access, on.clone())),
		);
	let layers = slash.map(|slash| slash_menu(t, lang, slash, on)).into_iter().collect();
	(body, layers)
}

fn editor_block<S: 'static>(
	t: &Tokens,
	lang: Language,
	block: &mut EditorBlock,
	slash: Option<Slash>,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	let drawn = match block.drawn.take() {
		Some(drawn) => drawn,
		None if !block.kind.is_text() && block.rows.is_empty() => {
			body_block(t, lang, block.source, &[], &|_| TileImage::Resolving)
		}
		None => {
			let last = block.rows.len().saturating_sub(1);
			let fills = block.rows.len() > 1 || block.start.is_none() && block.end.is_none();
			let (mut start, mut end) = (block.start.take(), block.end.take());
			let rows = block
				.rows
				.iter()
				.enumerate()
				.map(|(index, (mark, edit))| {
					let is_slash =
						slash.is_some_and(|slash| slash.block == block.id && slash.field == index);
					let look = FieldLook { row: index, fills, is_slash };
					let field = block_field(t, lang, block, edit, look, access, on.clone());
					let lead = if index == 0 { start.take() } else { None };
					let trail = if index == last { end.take() } else { None };
					let depth = block.depths.get(index).copied().unwrap_or(0);
					(*mark, indented(with_carets(field, lead, trail), depth))
				})
				.collect();
			block_frame_ringed(t, block.kind, rows, block.ringed_row)
		}
	};
	let mut column = col().key(format!("library-block-{}", block.id)).w_full().gap(SPACING * 3.5);
	if let Some(above) = block.above.take() {
		column = column.child(above);
	}
	let mut framed = el().w_full().child(drawn);
	if let Some(handle) = block.handle.take() {
		framed = framed.child(handle.pin(Some(-HANDLE_REACH), Some(0.0), None, None));
	}
	column.child(framed)
}

const HANDLE_REACH: f32 = SPACING * 14.0;

fn with_carets(field: El, start: Option<El>, end: Option<El>) -> El {
	if start.is_none() && end.is_none() {
		return field;
	}
	row().w_full().items_start().children(start).child(field).children(end).child(el().grow(1.0))
}

fn block_field<S: 'static>(
	t: &Tokens,
	lang: Language,
	block: &EditorBlock,
	edit: &TextEdit,
	look: FieldLook,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	let field = look.row;
	let (edit_id, key_id, change_id) =
		(block.id.to_owned(), block.id.to_owned(), block.id.to_owned());
	let change_on = on.clone();
	let mut input = text_input(edit, block_style(block.kind))
		.key(field_key(block.id, field))
		.color(block_ink(t, block.kind));
	if let Some(placeholder) = block.placeholder {
		input = input.placeholder(placeholder, t.placeholder_foreground);
	}
	if look.fills {
		input = input.w_full();
	}
	input
		.caret(t.foreground, t.selection)
		.label(say(block.kind.label(), lang))
		.on_edit(move |s: &mut S| access(s, &edit_id, field))
		.on_input_key(move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
			let block = key_id.clone();
			let plain = event.mods == rune::Mods::default();
			let event = match &event.key {
				KeyName::Up if plain && look.is_slash => BlockEvent::SlashMoved(-1),
				KeyName::Down if plain && look.is_slash => BlockEvent::SlashMoved(1),
				KeyName::Escape if look.is_slash => BlockEvent::SlashClosed,
				KeyName::Enter if plain && look.is_slash => BlockEvent::SlashConfirmed,
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

pub fn block_text<S: 'static>(
	t: &Tokens,
	lang: Language,
	block: &EditorBlock,
	row: usize,
	edit: &TextEdit,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	block_field(t, lang, block, edit, FieldLook { row, fills: true, is_slash: false }, access, on)
}

#[derive(Clone, Copy)]
struct FieldLook {
	row: usize,
	fills: bool,
	is_slash: bool,
}

fn slash_menu<S: 'static>(
	t: &Tokens,
	lang: Language,
	slash: Slash,
	on: impl Fn(&mut S, BlockEvent) -> bool + Clone + 'static,
) -> El {
	use common::library::editor::blocks::slash as copy;
	let shown = slash.shown(lang);
	let mut list = col().w_full().role("listbox").label(say(copy::LABEL, lang));
	for (group, is_text) in [(copy::TEXT, true), (copy::RICH, false)] {
		let members: Vec<(usize, LibraryBlockType)> = shown
			.iter()
			.copied()
			.enumerate()
			.filter(|(_, kind)| kind.is_text() == is_text)
			.collect();
		if members.is_empty() {
			continue;
		}
		list = list.child(row().px(SPACING * 2.0).pt(SPACING * 2.0).pb(SPACING).child(label_text(
			say(group, lang),
			TEXT_XS_MEDIUM,
			t.muted_foreground,
		)));
		for (index, kind) in members {
			let on = on.clone();
			list = list.child(slash_row(t, lang, kind, index == slash.active).on_press(
				move |s: &mut S| {
					on(s, BlockEvent::SlashChosen(kind));
				},
			));
		}
	}
	let hints = [
		(copy::MOVE_KEYS, copy::MOVE),
		(copy::INSERT_KEY, copy::INSERT),
		(copy::CLOSE_KEY, copy::CLOSE),
	]
	.map(|(keys, action)| {
		row()
			.gap(SPACING)
			.center_y()
			.child(label_text(say(keys, lang), TEXT_XS_MONO, t.muted_foreground))
			.child(label_text(say(action, lang), TEXT_XS, t.muted_foreground))
	});
	let footer = row()
		.mx(-SPACING)
		.mb(-SPACING)
		.h(SPACING * 8.0)
		.px(SPACING * 3.0)
		.gap(SPACING * 3.0)
		.center_y()
		.children(hints);
	let side = if slash.is_above { Side::Top } else { Side::Bottom };
	popup_panel(t, SLASH_WIDTH)
		.key(SLASH_MENU)
		.child(list)
		.child(el().h(1.0).mx(-SPACING).mt(SPACING).fill(t.border))
		.child(footer)
		.anchored(field_key(slash.block, slash.field), side, Align::Start, SPACING)
}

fn slash_row(t: &Tokens, lang: Language, kind: LibraryBlockType, is_active: bool) -> El {
	let label = say(kind.label(), lang);
	let glyph = row()
		.size(SPACING * 6.0, SPACING * 6.0)
		.radius(RADIUS_SM)
		.border(1.0, t.border)
		.center()
		.child(icon(kind.glyph(), SPACING * 3.5).color(t.foreground));
	let mut item = row()
		.key(format!("library-slash-{}", kind.name()))
		.w_full()
		.h(SPACING * 9.0)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.center_y()
		.radius(RADIUS_MD)
		.role("option")
		.checked(is_active)
		.label(label)
		.child(glyph)
		.child(label_text(label, TEXT_COMPACT, t.foreground).grow(1.0).min_w(0.0).truncate());
	if let Some(hint) = kind.markdown_hint() {
		item = item.child(label_text(hint, TEXT_XS_MONO, t.muted_foreground));
	}
	let item = if is_active { item.fill(t.accent) } else { item.hover(t.accent) };
	instant(item)
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
	let emit = |event: NewDocumentEvent| emitter(&on, event);
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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct LightboxLook {
	pub position: usize,
	pub count: usize,
	pub zoom_percent: Option<u32>,
	pub actions: BarActions,
}

pub fn lightbox<S: 'static>(
	lang: Language,
	shown: &LightboxImage,
	look: LightboxLook,
	on: impl Fn(&mut S, LightboxEvent) + Clone + 'static,
) -> El {
	let LightboxLook { position, count, zoom_percent, actions } = look;
	use common::library::lightbox as copy;
	let t = &Tokens::new(true);
	let emit = |event: LightboxEvent| emitter(&on, event);
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
	let step = |glyph: &'static rune::Icon, label: &str, event: LightboxEvent, is_shut: bool| {
		let button = row()
			.key(format!("lightbox-{label}"))
			.size(STEP, STEP)
			.radius(STEP / 2.0)
			.center()
			.fill(faded(t.foreground, 0.1))
			.role("button")
			.label(label)
			.child(icon(glyph, SPACING * 4.5).color(t.foreground));
		if is_shut {
			return instant(button).disabled(true).opacity(DISABLED_OPACITY);
		}
		focus_ring(t, instant(button.hover(faded(t.foreground, 0.16)))).on_press(emit(event))
	};
	let fit = if zoom_percent.is_some() { SurfaceFit::Fill } else { SurfaceFit::Fit };
	let picture = el().w_full().h_full().radius(RADIUS_MD).clip_rounded(RADIUS_MD);
	let picture = match shown.image.filter(|image| image.size().is_some()) {
		Some(image) => picture.pixels_fit(image.pixels(), fit),
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
		.child(step(
			&icons::PREVIOUS,
			say(copy::PREVIOUS, lang),
			LightboxEvent::Previous,
			position <= 1,
		))
		.child(col().grow(1.0).min_w(0.0).h_full().child(picture))
		.child(step(&icons::NEXT, say(copy::NEXT, lang), LightboxEvent::Next, position >= count));
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
	let (fit_label, fit_name) = match zoom_percent {
		Some(percent) => {
			let shown = filled(say(copy::ZOOM, lang), "percent", &percent.to_string());
			(shown, filled(say(copy::ZOOM_THEN_FIT, lang), "percent", &percent.to_string()))
		}
		None => (say(copy::FIT, lang).to_owned(), say(copy::FIT_TO_STAGE, lang).to_owned()),
	};
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
				.label(fit_name)
				.child(label_text(&fit_label, TEXT_COMPACT_MEDIUM, t.foreground)),
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
			item_actions(t, lang, ItemSurface::Lightbox, Vec::new(), actions, item_on),
		))
		.child(stage)
		.child(
			row().pin(Some(0.0), None, Some(0.0), Some(0.0)).h(SPACING * 18.0).center().child(zoom),
		)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum DocumentPanelEvent {
	OpenInLibrary,
	Close,
	Resize(f32),
}

pub const DOCUMENT_PANEL_WIDTH: f32 = SPACING * 150.0;

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PanelLook<'a> {
	pub title: &'a str,
	pub width: f32,
	pub min_width: f32,
	pub max_width: f32,
	pub is_board: bool,
}

impl<'a> PanelLook<'a> {
	pub fn document(title: &'a str, room: f32) -> PanelLook<'a> {
		let max_width = panel_max_width(room);
		PanelLook {
			title,
			width: DOCUMENT_PANEL_WIDTH.min(max_width),
			min_width: DOCUMENT_PANEL_MIN_WIDTH,
			max_width,
			is_board: false,
		}
	}
}

pub const DOCUMENT_PANEL_MIN_WIDTH: f32 = SPACING * 100.0;
pub const DOCUMENT_PANEL_OPENING_WIDTH: f32 = SPACING * 200.0;
pub const THREAD_MIN_WIDTH: f32 = SPACING * 80.0;

pub fn panel_max_width(room: f32) -> f32 {
	(room - THREAD_MIN_WIDTH).max(DOCUMENT_PANEL_MIN_WIDTH)
}
const PANEL_GRIP: f32 = SPACING * 2.0;
pub const RESIZE_STEP: f32 = SPACING * 4.0;

pub fn document_panel<S: 'static>(
	t: &Tokens,
	lang: Language,
	look: PanelLook,
	presence: Option<El>,
	body: El,
	on: impl Fn(&mut S, DocumentPanelEvent) + Clone + 'static,
) -> El {
	use common::library::panel;
	let title = shown_name(look.title, lang);
	let emit = |event: DocumentPanelEvent| emitter(&on, event);
	let button = |glyph: &'static rune::Icon, label: &str, event: DocumentPanelEvent| {
		Button::icon(glyph, label)
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconSm)
			.view(t)
			.on_press(emit(event))
	};
	let glyph = if look.is_board { &icons::STICKY_NOTE } else { &icons::FILE };
	let header = row()
		.w_full()
		.h(SPACING * 12.0)
		.px(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(
			row()
				.size(SPACING * 7.0, SPACING * 7.0)
				.radius(RADIUS_MD)
				.fill(t.muted)
				.center()
				.child(icon(glyph, SPACING * 4.0).color(t.foreground))
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
	let content = if look.is_board {
		col().w_full().grow(1.0).min_h(0.0).child(body)
	} else {
		col().w_full().grow(1.0).min_h(0.0).scroll(ScrollSpec { stick_bottom: false }).child(
			col()
				.w_full()
				.gap(SPACING * 3.5)
				.padding(SPACING * 8.0)
				.child(document_title(t, title))
				.child(body),
		)
	};
	let grip = el()
		.key("document-panel-grip")
		.pin(Some(-PANEL_GRIP / 2.0), Some(0.0), None, Some(0.0))
		.w(PANEL_GRIP)
		.role("separator")
		.label(say(panel::RESIZE, lang))
		.range_value(f64::from(look.width), f64::from(look.min_width), f64::from(look.max_width))
		.focusable(true)
		.cursor(Cursor::ResizeColumn)
		.focus_ring(2.0, -SPACING * 0.75, t.sidebar_ring)
		.on_drag(resized_by_drag(look, on.clone()))
		.on_key(resized_by_key(look, on));
	row()
		.key("document-panel")
		.w(look.width)
		.max_w(look.width)
		.h_full()
		.fill(t.card)
		.role("complementary")
		.label(title)
		.child(el().w(1.0).h_full().fill(faded(t.foreground, 0.08)))
		.child(col().grow(1.0).min_w(0.0).h_full().child(header).child(divider).child(content))
		.child(grip)
}

fn resized_by_drag<S: 'static>(
	look: PanelLook,
	on: impl Fn(&mut S, DocumentPanelEvent) + 'static,
) -> impl Fn(&mut S, &mut rune::Drag, &mut Tx) + 'static {
	let (width, min, max) = (look.width, look.min_width, look.max_width);
	move |s: &mut S, drag, _| match drag.phase {
		rune::Phase::Down => drag.data = width,
		rune::Phase::Move => {
			on(s, DocumentPanelEvent::Resize((drag.data - drag.dx).clamp(min, max)))
		}
		rune::Phase::Up if drag.cancelled() => on(s, DocumentPanelEvent::Resize(drag.data)),
		rune::Phase::Up => {}
	}
}

fn resized_by_key<S: 'static>(
	look: PanelLook,
	on: impl Fn(&mut S, DocumentPanelEvent) + 'static,
) -> impl Fn(&mut S, &KeyEvent, &mut Tx) -> bool + 'static {
	let (width, min, max) = (look.width, look.min_width, look.max_width);
	move |s: &mut S, event, _| {
		let towards_wider = match event.key {
			KeyName::Left => 1.0,
			KeyName::Right => -1.0,
			_ => return false,
		};
		on(s, DocumentPanelEvent::Resize((width + towards_wider * RESIZE_STEP).clamp(min, max)));
		true
	}
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
			BlockRow { mark: RowMark::Task(true), depth: 0, text: "Copy is **final**".to_owned() }
		);
		assert_eq!(
			rows[1],
			BlockRow { mark: RowMark::Task(false), depth: 0, text: "Release notes".to_owned() }
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
	fn a_block_dropped_past_half_a_neighbour_takes_its_place() {
		let pitches = [40.0, 60.0, 80.0, 40.0];
		assert_eq!(moved_to(&pitches, 1, 39.0), 1);
		assert_eq!(moved_to(&pitches, 1, 41.0), 2);
		assert_eq!(moved_to(&pitches, 1, 400.0), 3);
		assert_eq!(moved_to(&pitches, 1, -21.0), 0);
		assert_eq!(moved_to(&pitches, 0, -100.0), 0);
	}

	fn pressed(key: KeyName, shift: bool) -> KeyEvent {
		KeyEvent { key, mods: rune::Mods { shift, ..rune::Mods::default() } }
	}

	#[test]
	fn a_table_cell_hands_focus_to_its_neighbour() {
		let mut edit = TextEdit::new("Ada");
		let size = (2, 3);
		edit.set_caret(3);
		assert_eq!(cell_after(&pressed(KeyName::Tab, false), &edit, size, (0, 2)), Some((1, 0)));
		assert_eq!(cell_after(&pressed(KeyName::Tab, true), &edit, size, (1, 0)), Some((0, 2)));
		assert_eq!(cell_after(&pressed(KeyName::Tab, false), &edit, size, (1, 2)), None);
		assert_eq!(cell_after(&pressed(KeyName::Down, false), &edit, size, (0, 1)), Some((1, 1)));
		assert_eq!(cell_after(&pressed(KeyName::Up, false), &edit, size, (0, 1)), None);
		assert_eq!(cell_after(&pressed(KeyName::Right, false), &edit, size, (0, 1)), Some((0, 2)));
		assert_eq!(cell_after(&pressed(KeyName::Left, false), &edit, size, (0, 1)), None);
		edit.set_caret(0);
		assert_eq!(cell_after(&pressed(KeyName::Left, false), &edit, size, (0, 1)), Some((0, 0)));
		assert_eq!(cell_after(&pressed(KeyName::Right, false), &edit, size, (0, 1)), None);
	}

	#[test]
	fn a_gallery_tile_dropped_lands_on_the_nearest_slot() {
		let tile = (100.0, 112.0);
		assert_eq!(gallery_moved_to((0, 6, 5), (220.0, 0.0), tile), 2);
		assert_eq!(gallery_moved_to((0, 6, 5), (0.0, 120.0), tile), 5);
		assert_eq!(gallery_moved_to((2, 6, 5), (-900.0, 0.0), tile), 0);
		assert_eq!(gallery_moved_to((2, 6, 5), (40.0, 0.0), tile), 2);
	}

	#[test]
	fn the_panel_leaves_the_thread_its_minimum_down_to_the_panel_floor() {
		assert_eq!(THREAD_MIN_WIDTH, 320.0);
		assert_eq!(panel_max_width(1_600.0), 1_280.0);
		assert_eq!(
			panel_max_width(THREAD_MIN_WIDTH + DOCUMENT_PANEL_MIN_WIDTH),
			DOCUMENT_PANEL_MIN_WIDTH
		);
		assert_eq!(panel_max_width(600.0), DOCUMENT_PANEL_MIN_WIDTH);
	}

	#[test]
	fn a_gallery_tile_steps_one_slot_per_arrow_without_a_modifier() {
		let key = |key: KeyName| KeyEvent { key, mods: rune::Mods::default() };
		assert_eq!(gallery_key_target(&key(KeyName::Up), 2, 6), Some(1));
		assert_eq!(gallery_key_target(&key(KeyName::Left), 2, 6), Some(1));
		assert_eq!(gallery_key_target(&key(KeyName::Down), 2, 6), Some(3));
		assert_eq!(gallery_key_target(&key(KeyName::Right), 2, 6), Some(3));
		assert_eq!(gallery_key_target(&key(KeyName::Up), 0, 6), None);
		assert_eq!(gallery_key_target(&key(KeyName::Down), 5, 6), None);
		for mods in [
			rune::Mods { alt: true, ..rune::Mods::default() },
			rune::Mods { cmd: true, ..rune::Mods::default() },
			rune::Mods { ctrl: true, ..rune::Mods::default() },
		] {
			assert_eq!(gallery_key_target(&KeyEvent { key: KeyName::Down, mods }, 2, 6), None);
		}
	}

	#[test]
	fn the_grid_keeps_four_columns_at_the_artboard_width() {
		assert_eq!(grid_columns(1280.0 - 60.0 - 6.0), 4);
		assert_eq!(grid_columns(320.0), 1);
	}
}

pub fn inline_field(markdown: &str) -> TextEdit {
	const SIGNS: [(&str, Mark); 6] = [
		("**", Mark::Bold),
		("~~", Mark::Strike),
		("*", Mark::Italic),
		("_", Mark::Italic),
		("`", Mark::Code),
		("__", Mark::Bold),
	];
	let mut text = String::new();
	let mut marks = Vec::new();
	let mut rest = markdown;
	'scan: while !rest.is_empty() {
		if let Some(after) = rest.strip_prefix('\\')
			&& let Some(escaped) = after.chars().next()
		{
			text.push(escaped);
			rest = &after[escaped.len_utf8()..];
			continue;
		}
		let image = rest.strip_prefix("![");
		if let Some(after) = image.or_else(|| rest.strip_prefix('['))
			&& let Some((label, tail)) = after.split_once("](")
			&& let Some((target, tail)) = tail.split_once(')')
		{
			let start = text.len();
			text.push_str(label);
			let mark = if image.is_some() {
				Mark::Pill(target.to_owned())
			} else {
				Mark::Link(target.to_owned())
			};
			marks.push(MarkRange::new(start..text.len(), mark));
			rest = tail;
			continue;
		}
		if let Some(after) = rest.strip_prefix('<')
			&& let Some((target, tail)) = after.split_once('>')
			&& (target.contains("://") || target.contains('@'))
		{
			let start = text.len();
			text.push_str(target);
			marks.push(MarkRange::new(start..text.len(), Mark::Link(target.to_owned())));
			rest = tail;
			continue;
		}
		for (sign, mark) in SIGNS {
			if let Some(after) = rest.strip_prefix(sign)
				&& let Some(end) = after.find(sign)
				&& end > 0
			{
				let start = text.len();
				text.push_str(&after[..end]);
				marks.push(MarkRange::new(start..text.len(), mark));
				rest = &after[end + sign.len()..];
				continue 'scan;
			}
		}
		let next = rest.chars().next().map_or(1, char::len_utf8);
		text.push_str(&rest[..next]);
		rest = &rest[next..];
	}
	let lines = text.matches('\n').count() + 1;
	TextEdit::from_parts(text, marks, vec![Block::Paragraph; lines]).allow_marks([
		Mark::Bold,
		Mark::Italic,
		Mark::Strike,
		Mark::Code,
		Mark::Link(String::new()),
	])
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Agent<'a> {
	pub name: &'a str,
	pub hue: Option<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Run<'a> {
	pub agent: Agent<'a>,
	pub sentence: &'a str,
	pub is_held: bool,
}

#[derive(Clone, Copy)]
pub enum TileImage<'a> {
	Ready(&'a Image),
	Resolving,
	Failed,
}

pub struct Tile<'a> {
	pub image: TileImage<'a>,
	pub alt: &'a str,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum CalloutTone {
	Note,
	Tip,
	Warning,
}

impl CalloutTone {
	pub const ALL: [CalloutTone; 3] = [CalloutTone::Note, CalloutTone::Tip, CalloutTone::Warning];

	pub fn of(source: &str) -> CalloutTone {
		let first = source.split('\n').next().unwrap_or_default();
		if first.contains("[!TIP]") {
			CalloutTone::Tip
		} else if first.contains("[!WARNING]") {
			CalloutTone::Warning
		} else {
			CalloutTone::Note
		}
	}

	fn name(self) -> Key {
		use crate::strings::chat::answer_block::callout;
		match self {
			CalloutTone::Note => callout::NOTE,
			CalloutTone::Tip => callout::TIP,
			CalloutTone::Warning => callout::WARNING,
		}
	}

	fn ink(self, t: &Tokens) -> Color {
		match self {
			CalloutTone::Note => t.primary_strong,
			CalloutTone::Tip => t.success,
			CalloutTone::Warning => t.warning,
		}
	}

	fn glyph(self) -> &'static rune::Icon {
		match self {
			CalloutTone::Note => &icons::INFO,
			CalloutTone::Tip => &icons::LIGHTBULB,
			CalloutTone::Warning => &icons::TRIANGLE_ALERT,
		}
	}
}

pub type Record = Vec<(String, String)>;

pub fn fence_body(source: &str) -> (&str, String) {
	let mut lines = source.split('\n');
	let open = lines.next().unwrap_or_default().trim_start();
	let info = open.trim_start_matches(['`', '~']).split_whitespace().next().unwrap_or_default();
	let mut body: Vec<&str> = lines.collect();
	if body.last().is_some_and(|last| fence_of(last.trim_start()).is_some()) {
		body.pop();
	}
	(info, body.join("\n"))
}

pub fn records_of(body: &str) -> Vec<Record> {
	let mut records: Vec<Record> = Vec::new();
	for line in body.split('\n') {
		let starts = line.starts_with("- ");
		let bare = line.trim_start_matches("- ").trim_start();
		let Some((key, value)) = bare.split_once(':') else { continue };
		if !key.chars().all(|c| c.is_ascii_lowercase() || c == '-') {
			continue;
		}
		if starts || records.is_empty() {
			records.push(Vec::new());
		}
		if let Some(record) = records.last_mut() {
			record.push((key.to_owned(), value.trim().to_owned()));
		}
	}
	records
}

pub fn field_of<'r>(record: &'r Record, key: &str) -> &'r str {
	record.iter().find(|(name, _)| name == key).map_or("", |(_, value)| value)
}

pub fn table_cells(source: &str) -> Vec<Vec<String>> {
	source
		.split('\n')
		.enumerate()
		.filter(|(index, _)| *index != 1)
		.map(|(_, line)| {
			let inner = line.trim().trim_start_matches('|').trim_end_matches('|');
			inner.split('|').map(|cell| cell.trim().to_owned()).collect()
		})
		.collect()
}

fn agent_tokens(t: &Tokens, agent: Agent) -> Tokens {
	t.in_space(agent.hue)
}

fn run_span(t: &Tokens, run: &Run, start: usize) -> Span {
	let ink = agent_tokens(t, run.agent).primary;
	Span {
		bg: Some(faded(ink, 0.12)),
		bg_pad: 2.0,
		underline: Some(faded(ink, 0.5)),
		..Span::new(start, start + run.sentence.len())
	}
}

fn read_text_in(t: &Tokens, style: TextStyle, ink: Color, markdown: &str, runs: &[Run]) -> El {
	let edit = inline_field(markdown);
	let shown: Vec<(&Run, usize)> = runs
		.iter()
		.filter_map(|run| edit.text.find(run.sentence).map(|start| (run, start)))
		.collect();
	let field = text_input(&edit, style)
		.read_only(true)
		.focusable(false)
		.color(ink)
		.spans(shown.iter().map(|(run, start)| run_span(t, run, *start)).collect::<Vec<_>>());
	let flags: Vec<El> = shown
		.iter()
		.filter(|(run, _)| !run.is_held)
		.map(|(run, _)| agent_caret(t, run.agent))
		.collect();
	if flags.is_empty() {
		return field.w_full();
	}
	row().w_full().items_start().child(field).children(flags).child(el().grow(1.0))
}

pub fn body_block<'a>(
	t: &Tokens,
	lang: Language,
	source: &str,
	runs: &[Run],
	picture: &dyn Fn(&str) -> TileImage<'a>,
) -> El {
	let kind = block_type_of(source);
	match kind {
		LibraryBlockType::Callout => {
			let text = rows_of(source)
				.into_iter()
				.map(|line| read_text_in(t, TEXT_READING, t.muted_foreground, &line.text, runs));
			callout_view(t, lang, CalloutTone::of(source), col().w_full().children(text))
		}
		LibraryBlockType::Code => {
			let (language, body) = fence_body(source);
			let body = text(body).font(TEXT_COMPACT_MONO).color(t.foreground).wrap();
			code_view(t, lang, language, body, false)
		}
		LibraryBlockType::Table => {
			let rows = table_cells(source)
				.into_iter()
				.enumerate()
				.map(|(index, cells)| {
					let style = if index == 0 { TEXT_SM_SEMIBOLD } else { TEXT_SM };
					cells
						.iter()
						.map(|cell| read_text_in(t, style, t.foreground, cell, runs))
						.collect()
				})
				.collect();
			table_view(t, rows)
		}
		LibraryBlockType::WebPage => {
			let (_, body) = fence_body(source);
			let record = records_of(&body).into_iter().next().unwrap_or_default();
			web_page_view(t, lang, field_of(&record, "url"), field_of(&record, "title"))
		}
		LibraryBlockType::Collapsible => {
			let (_, body) = fence_body(source);
			let title =
				body.split('\n').find_map(|line| line.strip_prefix("title: ")).unwrap_or_default();
			collapsible_view(t, title)
		}
		LibraryBlockType::Gallery => {
			let (_, body) = fence_body(source);
			let records = records_of(&body);
			let tiles: Vec<Tile> = records
				.iter()
				.map(|record| Tile { image: picture(field_of(record, "image")), alt: "" })
				.collect();
			gallery_view(t, lang, &tiles)
		}
		LibraryBlockType::Other => block_frame(
			t,
			kind,
			vec![(
				RowMark::None,
				text(source.to_owned()).font(TEXT_COMPACT_MONO).color(t.muted_foreground).wrap(),
			)],
		),
		_ => {
			let rows = rows_of(source)
				.into_iter()
				.map(|line| {
					(
						line.mark,
						indented(
							read_text_in(
								t,
								block_style(kind),
								block_ink(t, kind),
								&line.text,
								runs,
							),
							line.depth,
						),
					)
				})
				.collect();
			block_frame(t, kind, rows)
		}
	}
}

pub const INDENT: f32 = SPACING * 6.0;

fn indented(body: El, depth: usize) -> El {
	if depth == 0 { body } else { col().w_full().pl(INDENT * depth as f32).child(body) }
}

pub fn callout_view(t: &Tokens, lang: Language, tone: CalloutTone, body: El) -> El {
	let ink = tone.ink(t);
	row()
		.w_full()
		.gap(SPACING * 3.0)
		.padding(SPACING * 3.0)
		.radius(RADIUS_CONTROL)
		.border(1.0, faded(ink, 0.18))
		.fill(faded(ink, if t.dark { 0.08 } else { 0.05 }))
		.role("note")
		.child(
			row()
				.w(SPACING * 5.0)
				.h(SPACING * 6.0)
				.center()
				.child(icon(tone.glyph(), SPACING * 4.5).color(ink))
				.a11y_hidden(),
		)
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(label_text(say(tone.name(), lang), TEXT_SM_SEMIBOLD, t.foreground))
				.child(body),
		)
}

pub fn code_view(t: &Tokens, lang: Language, language: &str, body: El, is_editing: bool) -> El {
	let mut code = col().w_full().padding(SPACING * 3.0).radius(RADIUS_CONTROL).fill(t.muted);
	if is_editing {
		code =
			code.child(row().pb(SPACING * 2.0).child(language_trigger(t, lang, language, false)));
	}
	code.child(body)
}

pub fn language_name(lang: Language, language: &str) -> &'static str {
	use common::library::editor::blocks::code::languages;
	let key = match language {
		"bash" | "sh" | "shell" => languages::BASH,
		"json" => languages::JSON,
		"ts" | "typescript" => languages::TYPESCRIPT,
		"py" | "python" => languages::PYTHON,
		"css" => languages::CSS,
		"diff" => languages::DIFF,
		"html" => languages::HTML,
		"md" | "markdown" => languages::MARKDOWN,
		"rs" | "rust" => languages::RUST,
		"tsx" => languages::TSX,
		"yaml" | "yml" => languages::YAML,
		_ => languages::TEXT,
	};
	say(key, lang)
}

pub const LANGUAGES: [&str; 12] = [
	"text",
	"bash",
	"json",
	"typescript",
	"python",
	"css",
	"diff",
	"html",
	"markdown",
	"rust",
	"tsx",
	"yaml",
];

pub fn language_trigger(t: &Tokens, lang: Language, language: &str, is_open: bool) -> El {
	let name = language_name(lang, language);
	let label = filled(say(common::library::editor::blocks::code::LANGUAGE, lang), "name", name);
	let trigger = row()
		.key("library-code-language")
		.h(SPACING * 6.0)
		.padding(SPACING)
		.gap(SPACING)
		.center_y()
		.radius(RADIUS_SM)
		.fill(faded(t.foreground, if is_open { 0.1 } else { 0.06 }))
		.hover(faded(t.foreground, 0.1))
		.role("button")
		.expanded(is_open)
		.label(label)
		.child(label_text(name, TEXT_XS_MEDIUM, t.foreground))
		.child(icon(&icons::CHEVRON_DOWN, SPACING * 3.0).color(t.foreground));
	focus_ring(t, instant(trigger))
}

pub fn language_menu(t: &Tokens, lang: Language, chosen: &str, query: &str) -> El {
	use common::library::editor::blocks::code;
	let shown: Vec<&str> = LANGUAGES
		.into_iter()
		.filter(|language| {
			language_name(lang, language).to_lowercase().contains(&query.to_lowercase())
		})
		.collect();
	let search = row()
		.h(SPACING * 8.0)
		.padding(SPACING * 2.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(icon(&icons::SEARCH, SPACING * 3.5).color(t.muted_foreground))
		.child(if query.is_empty() {
			label_text(say(code::SEARCH, lang), TEXT_COMPACT, t.placeholder_foreground)
		} else {
			label_text(query, TEXT_COMPACT, t.foreground)
		});
	let mut list = col().w_full().role("listbox").label(say(code::SEARCH, lang));
	if shown.is_empty() {
		list =
			list.child(row().h(SPACING * 8.0).padding(SPACING * 2.0).center_y().child(label_text(
				say(code::NO_MATCH, lang),
				TEXT_COMPACT,
				t.muted_foreground,
			)));
	}
	for (index, language) in shown.iter().enumerate() {
		let is_chosen = *language == chosen;
		let mut option = row()
			.h(SPACING * 8.0)
			.padding(SPACING * 2.0)
			.gap(SPACING * 2.0)
			.center_y()
			.justify_between()
			.radius(RADIUS_MD)
			.role("option")
			.checked(is_chosen)
			.child(label_text(language_name(lang, language), TEXT_COMPACT, t.foreground));
		if index == 0 {
			option = option.fill(t.accent);
		}
		if is_chosen {
			option = option.child(icon(&icons::CHECK, SPACING * 3.5).color(t.primary));
		}
		list = list.child(option);
	}
	popup_panel(t, SPACING * 50.0)
		.child(search)
		.child(el().h(1.0).mx(-SPACING).my(SPACING).fill(t.border))
		.child(list)
}

fn popup_panel(t: &Tokens, width: f32) -> El {
	elevated(t, col().w(width).padding(SPACING).radius(RADIUS_XL).fill(t.popover))
}

pub fn table_view(t: &Tokens, rows: Vec<Vec<El>>) -> El {
	table_grid(t, rows, None)
}

fn table_grid(t: &Tokens, rows: Vec<Vec<El>>, focused: Option<(usize, usize)>) -> El {
	let count = rows.len();
	let lines = rows.into_iter().enumerate().map(|(row_index, cells)| {
		let mut line = row().w_full();
		for (column, cell) in cells.into_iter().enumerate() {
			let mut cell =
				col().grow(1.0).w(0.0).min_w(SPACING * 6.0).padding(SPACING * 2.5).child(cell);
			if focused == Some((row_index, column)) {
				cell = cell.fill(t.card).outline(2.0, -2.0, t.primary);
			}
			line = line.child(cell);
		}
		if row_index == 0 {
			line = line.fill(t.muted);
		}
		if row_index + 1 < count {
			col().w_full().child(line).child(el().w_full().h(1.0).fill(t.border))
		} else {
			line
		}
	});
	col().w_full().radius(RADIUS_MD).clip_rounded(RADIUS_MD).border(1.0, t.border).children(lines)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TableEvent {
	Edited { row: usize, column: usize },
	Focus { row: usize, column: usize },
}

pub struct TableCells<'a> {
	pub block: &'a str,
	pub rows: Vec<Vec<&'a TextEdit>>,
	pub focused: (usize, usize),
}

pub fn cell_field(columns: usize, (row, column): (usize, usize)) -> usize {
	row * columns + column
}

pub fn cell_after(
	event: &KeyEvent,
	edit: &TextEdit,
	(rows, columns): (usize, usize),
	(row, column): (usize, usize),
) -> Option<(usize, usize)> {
	let at = cell_field(columns, (row, column));
	let caret = edit.focus;
	let is_collapsed = edit.anchor == edit.focus;
	let target = match event.key {
		KeyName::Tab if event.mods.shift => at.checked_sub(1)?,
		KeyName::Tab => at + 1,
		KeyName::Up => at.checked_sub(columns)?,
		KeyName::Down => at + columns,
		KeyName::Left if is_collapsed && caret == 0 => at.checked_sub(1)?,
		KeyName::Right if is_collapsed && caret == edit.text.len() => at + 1,
		_ => return None,
	};
	(target < rows * columns).then_some((target / columns, target % columns))
}

fn table_cell<S: 'static>(
	t: &Tokens,
	lang: Language,
	cells: &TableCells,
	at: (usize, usize),
	access: FieldAccess<S>,
	on: impl Fn(&mut S, TableEvent) + Clone + 'static,
) -> El {
	use common::library::editor::blocks::table;
	let size = (cells.rows.len(), cells.rows.first().map_or(1, Vec::len));
	let field = cell_field(size.1, at);
	let (row, column) = at;
	let label = filled(
		&filled(say(table::CELL, lang), "row", &(row + 1).to_string()),
		"column",
		&(column + 1).to_string(),
	);
	let (edit_id, key_id) = (cells.block.to_owned(), cells.block.to_owned());
	let change_on = on.clone();
	let moves = move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
		let Some((row, column)) = cell_after(event, access(s, &key_id, field), size, at) else {
			return false;
		};
		on(s, TableEvent::Focus { row, column });
		true
	};
	let kind = LibraryBlockType::Paragraph;
	text_input(cells.rows[row][column], block_style(kind))
		.key(field_key(cells.block, field))
		.color(block_ink(t, kind))
		.w_full()
		.caret(t.foreground, t.selection)
		.label(label)
		.on_edit(move |s: &mut S| access(s, &edit_id, field))
		.on_input_key(moves.clone())
		.on_key(moves)
		.on_input_change(move |s: &mut S, _: &mut Tx| {
			change_on(s, TableEvent::Edited { row, column })
		})
}

pub fn table_editor<S: 'static>(
	t: &Tokens,
	lang: Language,
	cells: &TableCells,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, TableEvent) + Clone + 'static,
) -> El {
	use common::library::editor::blocks::table;
	let focused = cells.focused;
	let rows = (0..cells.rows.len())
		.map(|row| {
			(0..cells.rows[row].len())
				.map(|column| table_cell(t, lang, cells, (row, column), access, on.clone()))
				.collect()
		})
		.collect();
	let add = |content: El| {
		instant(
			row()
				.radius(RADIUS_SM)
				.fill(faded(t.foreground, 0.04))
				.hover(faded(t.foreground, 0.08))
				.center()
				.gap(SPACING)
				.child(content),
		)
	};
	let column = add(icon(&icons::PLUS, SPACING * 3.0).color(t.muted_foreground))
		.key("library-table-add-column")
		.w(SPACING * 6.0)
		.mb(SPACING * 2.0)
		.role("button")
		.label(say(table::ADD_COLUMN, lang));
	let add_row = add(row()
		.gap(SPACING)
		.center_y()
		.child(icon(&icons::PLUS, SPACING * 3.0).color(t.muted_foreground))
		.child(label_text(say(table::ADD_ROW, lang), TEXT_XS_MEDIUM, t.muted_foreground)))
	.key("library-table-add-row")
	.h(SPACING * 6.0)
	.w_full()
	.role("button")
	.label(say(table::ADD_ROW, lang));
	col()
		.w_full()
		.gap(SPACING)
		.child(
			row()
				.w_full()
				.gap(SPACING * 3.0)
				.child(col().grow(1.0).min_w(0.0).child(table_grid(t, rows, Some(focused))))
				.child(column),
		)
		.child(row().w_full().pr(SPACING * 9.0).child(add_row))
}

pub fn web_page_view(t: &Tokens, lang: Language, url: &str, title: &str) -> El {
	let domain = url.split("://").nth(1).unwrap_or(url).split('/').next().unwrap_or_default();
	let open = say(crate::strings::chat::answer_block::web_page::OPEN, lang);
	row()
		.w_full()
		.gap(SPACING * 3.0)
		.padding(SPACING * 3.0)
		.center_y()
		.radius(RADIUS_XL)
		.border(1.0, faded(t.foreground, 0.12))
		.fill(t.card)
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(SPACING * 0.5)
				.child(label_text(domain, TEXT_XS, t.muted_foreground).truncate())
				.child(label_text(title, TEXT_SM_SEMIBOLD, t.foreground).wrap()),
		)
		.child(focus_ring(
			t,
			instant(
				row()
					.padding(SPACING * 2.0)
					.radius(RADIUS_MD)
					.border(1.0, faded(t.foreground, 0.12))
					.hover(faded(t.foreground, 0.08))
					.role("button")
					.label(open)
					.child(label_text(open, TEXT_COMPACT_MEDIUM, t.foreground)),
			),
		))
}

pub fn web_page_editor(t: &Tokens, lang: Language, link: &str, card: El, has_failed: bool) -> El {
	use common::library::editor::blocks::web_page;
	let field = row()
		.key("library-web-page-link")
		.w_full()
		.h(SPACING * 9.0)
		.padding(SPACING * 1.75)
		.gap(SPACING * 2.0)
		.center_y()
		.radius(RADIUS_LG)
		.border(1.0, t.primary)
		.outline(3.0, 0.0, faded(t.primary, 0.3))
		.fill(t.card)
		.role("textbox")
		.label(say(web_page::LINK, lang))
		.child(icon(&icons::LINK, SPACING * 3.5).color(t.muted_foreground))
		.child(label_text(link, TEXT_SM, t.foreground).grow(1.0).min_w(0.0).truncate())
		.child(
			row()
				.gap(SPACING)
				.center_y()
				.child(kbd(t, say(web_page::UPDATE_KEY, lang)))
				.child(label_text(say(web_page::UPDATE, lang), TEXT_XS, t.muted_foreground)),
		);
	let mut top = col().w_full().child(field);
	if has_failed {
		top = top.child(
			label_text(say(web_page::FAILED, lang), TEXT_XS, t.destructive)
				.wrap()
				.pt(SPACING * 1.5)
				.role("alert"),
		);
	}
	col().w_full().gap(SPACING * 2.5).child(top).child(card)
}

fn kbd(t: &Tokens, keys: &str) -> El {
	row()
		.h(SPACING * 5.0)
		.px(SPACING)
		.radius(RADIUS_SM)
		.fill(faded(t.foreground, 0.08))
		.center()
		.child(label_text(keys, TEXT_XS_MEDIUM, t.muted_foreground))
}

pub fn collapsible_view(t: &Tokens, title: &str) -> El {
	row()
		.w_full()
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.center_y()
		.radius(RADIUS_CONTROL)
		.border(1.0, t.border)
		.child(icon(&icons::CHEVRON_RIGHT, SPACING * 4.0).color(t.muted_foreground))
		.child(label_text(title, TEXT_SM_MEDIUM, t.foreground))
}

const GALLERY_HEIGHT: f32 = SPACING * 75.0;
const GALLERY_SHOWN: usize = 5;

fn tile_view(t: &Tokens, tile: &Tile) -> El {
	let frame = el().w_full().h_full().radius(RADIUS_XS * 2.0).clip_rounded(RADIUS_XS * 2.0);
	match tile.image {
		TileImage::Ready(image) => {
			frame.pixels_fit(image.pixels(), SurfaceFit::Fill).label(tile.alt)
		}
		TileImage::Resolving => frame.fill(faded(t.foreground, 0.1)),
		TileImage::Failed => frame
			.fill(faded(t.foreground, 0.1))
			.center()
			.child(icon(&icons::IMAGE, SPACING * 5.0).color(t.muted_foreground)),
	}
}

pub fn gallery_view(t: &Tokens, lang: Language, tiles: &[Tile]) -> El {
	let shown: Vec<El> = tiles.iter().take(GALLERY_SHOWN).map(|tile| tile_view(t, tile)).collect();
	let more = tiles.len().saturating_sub(GALLERY_SHOWN);
	let mut shown = shown.into_iter();
	let lead = shown.next().unwrap_or_else(el);
	let rest: Vec<El> = shown.collect();
	let mut rest_cells: Vec<El> = rest
		.into_iter()
		.map(|tile| col().grow(1.0).w(0.0).h_full().min_w(0.0).child(tile))
		.collect();
	if more > 0
		&& let Some(last) = rest_cells.pop()
	{
		use crate::strings::chat::answer_block::gallery;
		let template = say(if more == 1 { gallery::MORE_ONE } else { gallery::MORE_OTHER }, lang);
		rest_cells.push(
			last.child(
				row()
					.pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
					.radius(RADIUS_XS * 2.0)
					.fill(Color::BLACK.alpha(0.55))
					.center()
					.label(filled(template, "count", &more.to_string()))
					.child(label_text(&format!("+{more}"), TEXT_TITLE, Color::WHITE)),
			),
		);
	}
	let side = match rest_cells.len() {
		0 => None,
		1 | 2 => Some(col().grow(1.0).w(0.0).h_full().gap(SPACING * 1.5).children(rest_cells)),
		_ => {
			let mut cells = rest_cells.into_iter();
			let top: Vec<El> = cells.by_ref().take(2).collect();
			let bottom: Vec<El> = cells.collect();
			Some(
				col()
					.grow(1.0)
					.w(0.0)
					.h_full()
					.gap(SPACING * 1.5)
					.child(row().w_full().grow(1.0).gap(SPACING * 1.5).children(top))
					.child(row().w_full().grow(1.0).gap(SPACING * 1.5).children(bottom)),
			)
		}
	};
	row()
		.w_full()
		.h(GALLERY_HEIGHT)
		.gap(SPACING * 1.5)
		.child(col().grow(1.0).w(0.0).h_full().child(lead))
		.children(side)
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct GalleryDrag {
	pub from: usize,
	pub to: usize,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GalleryEvent {
	Add,
	Remove(usize),
	Move { from: usize, to: usize },
	Caption(usize),
}

const GALLERY_GAP: f32 = SPACING * 1.5;

pub fn gallery_moved_to(
	(from, count, columns): (usize, usize, usize),
	(dx, dy): (f32, f32),
	(width, height): (f32, f32),
) -> usize {
	let across = (dx / (width + GALLERY_GAP)).round() as isize;
	let down = (dy / (height + GALLERY_GAP)).round() as isize;
	let to = from as isize + across + down * columns.max(1) as isize;
	to.clamp(0, count.saturating_sub(1) as isize) as usize
}

fn gallery_drag<S: 'static>(
	from: usize,
	count: usize,
	columns: usize,
	on: impl Fn(&mut S, GalleryEvent) + 'static,
) -> impl Fn(&mut S, &mut rune::Drag, &mut Tx) + 'static {
	move |s: &mut S, drag, _| {
		if drag.phase != rune::Phase::Up || drag.cancelled() {
			return;
		}
		let to = gallery_moved_to((from, count, columns), (drag.dx, drag.dy), (drag.w, drag.h));
		if to != from {
			on(s, GalleryEvent::Move { from, to });
		}
	}
}

pub fn gallery_key_target(event: &KeyEvent, from: usize, count: usize) -> Option<usize> {
	if event.mods.alt || event.mods.cmd || event.mods.ctrl {
		return None;
	}
	let to = match event.key {
		KeyName::Left | KeyName::Up => from.checked_sub(1)?,
		KeyName::Right | KeyName::Down => from + 1,
		_ => return None,
	};
	(to < count).then_some(to)
}

fn gallery_keys<S: 'static>(
	from: usize,
	count: usize,
	on: impl Fn(&mut S, GalleryEvent) + 'static,
) -> impl Fn(&mut S, &KeyEvent, &mut Tx) -> bool + 'static {
	move |s: &mut S, event, _| {
		let Some(to) = gallery_key_target(event, from, count) else { return false };
		on(s, GalleryEvent::Move { from, to });
		true
	}
}

pub struct GalleryEdit<'a> {
	pub block: &'a str,
	pub tiles: &'a [Tile<'a>],
	pub captions: Vec<&'a TextEdit>,
	pub columns: usize,
	pub drag: Option<GalleryDrag>,
	pub has_add_failed: bool,
}

fn gallery_caption<S: 'static>(
	t: &Tokens,
	lang: Language,
	gallery: &GalleryEdit,
	index: usize,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, GalleryEvent) + 'static,
) -> Option<El> {
	use common::library::editor::blocks::gallery as copy;
	let edit = gallery.captions.get(index)?;
	let block = gallery.block.to_owned();
	Some(
		text_input(edit, TEXT_XS_MEDIUM)
			.single_line()
			.key(field_key(gallery.block, index))
			.pin(Some(SPACING * 2.0), None, Some(SPACING * 2.0), Some(SPACING * 2.0))
			.padding(SPACING * 1.5)
			.radius(RADIUS_SM)
			.fill(faded(t.card, 0.92))
			.color(t.foreground)
			.placeholder(say(copy::CAPTION_PLACEHOLDER, lang), t.placeholder_foreground)
			.caret(t.foreground, t.selection)
			.label(filled(say(copy::CAPTION, lang), "position", &(index + 1).to_string()))
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
			.on_edit(move |s: &mut S| access(s, &block, index))
			.on_input_change(move |s: &mut S, _: &mut Tx| on(s, GalleryEvent::Caption(index))),
	)
}

pub fn gallery_editor<S: 'static>(
	t: &Tokens,
	lang: Language,
	edit: &GalleryEdit,
	access: FieldAccess<S>,
	on: impl Fn(&mut S, GalleryEvent) + Clone + 'static,
) -> (El, Option<El>) {
	use common::library::editor::blocks::gallery;
	let (tiles, columns, drag) = (edit.tiles, edit.columns, edit.drag);
	let count = tiles.len().to_string();
	let edited = tiles.iter().enumerate().map(|(index, tile)| {
		let position = (index + 1).to_string();
		let remove = focus_ring(
			t,
			row()
				.key(format!("library-gallery-remove-{index}"))
				.pin(None, Some(SPACING * 2.0), Some(SPACING * 2.0), None)
				.size(SPACING * 6.0, SPACING * 6.0)
				.radius(SPACING * 3.0)
				.fill(Color::BLACK.alpha(0.6))
				.center()
				.role("button")
				.label(filled(say(gallery::REMOVE, lang), "position", &position))
				.child(icon(&icons::CLOSE, SPACING * 3.0).color(Color::WHITE)),
		)
		.on_press(emitter(&on, GalleryEvent::Remove(index)));
		let face = el()
			.key(format!("library-gallery-tile-{index}"))
			.w_full()
			.h_full()
			.label(filled(
				&filled(say(gallery::TILE, lang), "position", &position),
				"count",
				&count,
			))
			.focusable(true)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
			.cursor(Cursor::Grab)
			.on_drag(gallery_drag(index, tiles.len(), columns, on.clone()))
			.on_key(gallery_keys(index, tiles.len(), on.clone()))
			.child(tile_view(t, tile));
		let caption = gallery_caption(t, lang, edit, index, access, on.clone());
		let mut cell = el().w_full().h(SPACING * 28.0).child(face).child(remove).children(caption);
		if let Some(drag) = drag {
			if drag.from == index {
				cell = el().w_full().h(SPACING * 28.0).radius(RADIUS_XS * 2.0).fill(t.card);
			} else if drag.to == index {
				cell = cell.child(
					el().pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
						.radius(RADIUS_XS * 2.0)
						.border(2.0, t.primary)
						.border_dash(SPACING * 1.5, SPACING)
						.fill(faded(t.primary, 0.06)),
				);
			}
		}
		cell
	});
	let cells: Vec<El> = edited.collect();
	let mut lines = col().w_full().gap(GALLERY_GAP);
	for line in cells.chunks(columns.max(1)) {
		let mut line: Vec<El> = line.to_vec();
		line.resize_with(columns.max(1), el);
		lines =
			lines.child(row().w_full().gap(GALLERY_GAP).children(
				line.into_iter().map(|cell| col().grow(1.0).w(0.0).min_w(0.0).child(cell)),
			));
	}
	let ring = el()
		.w_full()
		.padding(SPACING)
		.radius(RADIUS_CONTROL + SPACING)
		.outline(2.0, SPACING, t.primary)
		.child(lines);
	let add = focus_ring(
		t,
		instant(
			row()
				.key("library-gallery-add")
				.h(SPACING * 7.0)
				.padding(SPACING * 1.5)
				.gap(SPACING)
				.center_y()
				.radius(SPACING * 3.5)
				.fill(faded(t.foreground, 0.06))
				.hover(faded(t.foreground, 0.1))
				.role("button")
				.label(say(gallery::ADD, lang))
				.child(icon(&icons::PLUS, SPACING * 3.5).color(t.foreground))
				.child(label_text(say(gallery::ADD, lang), TEXT_COMPACT_MEDIUM, t.foreground)),
		),
	)
	.on_press(emitter(&on, GalleryEvent::Add));
	let hint = if edit.has_add_failed {
		label_text(say(gallery::ADD_FAILED, lang), TEXT_XS, t.destructive).role("alert")
	} else {
		label_text(say(gallery::HINT, lang), TEXT_XS, t.muted_foreground)
	};
	let lifted = drag.and_then(|drag| tiles.get(drag.from)).map(|tile| {
		el().size(SPACING * 60.0, 170.0)
			.radius(RADIUS_XL)
			.clip_rounded(RADIUS_XL)
			.fill(t.muted)
			.rotate(-2.0_f32.to_radians())
			.shadow(SPACING * 3.0, SPACING * 8.0, Color::BLACK.alpha(0.3))
			.a11y_hidden()
			.child(tile_view(t, tile))
	});
	let editor = col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(
			row()
				.w_full()
				.flex_wrap()
				.gaps(SPACING, SPACING * 3.0)
				.center_y()
				.child(add)
				.child(hint),
		)
		.child(ring);
	(editor, lifted)
}

pub fn callout_editor(t: &Tokens, lang: Language, tone: CalloutTone, field: El) -> El {
	use common::library::editor::blocks::callout;
	let segments = CalloutTone::ALL.map(|each| {
		let name = say(each.name(), lang);
		let is_chosen = each == tone;
		let segment = row()
			.key(format!("library-callout-{name}"))
			.h(SPACING * 6.0)
			.px(SPACING * 2.5)
			.center()
			.radius(SPACING * 3.0)
			.role("button")
			.checked(is_chosen)
			.label(name)
			.child(label_text(
				name,
				TEXT_XS_MEDIUM,
				if is_chosen { t.foreground } else { t.muted_foreground },
			));
		let segment = if is_chosen {
			segment.fill(t.card).outline(1.0, -1.0, faded(t.foreground, 0.1))
		} else {
			segment
		};
		focus_ring(t, instant(segment))
	});
	let track = row()
		.padding(3.0)
		.radius(SPACING * 4.0)
		.fill(faded(t.card, 0.7))
		.role("group")
		.label(say(callout::TONE, lang))
		.children(segments);
	callout_view(
		t,
		lang,
		tone,
		col().w_full().items_start().gap(SPACING * 2.0).child(field).child(track),
	)
}

pub fn agent_caret(t: &Tokens, agent: Agent) -> El {
	let ink = agent_tokens(t, agent);
	let flag = row()
		.pin(Some(0.0), Some(-SPACING * 5.5), None, None)
		.h(SPACING * 5.0)
		.pl(SPACING * 0.5)
		.pr(SPACING * 1.75)
		.gap(SPACING)
		.center_y()
		.corners([5.0, 5.0, 5.0, 0.0])
		.fill(ink.primary)
		.role("button")
		.label(filled(
			say(common::library::document::agents::CARET, Language::En),
			"name",
			agent.name,
		))
		.child(Face::still(agent.name, agent.hue).draw(SPACING * 4.0, &ink))
		.child(
			label_text(agent.name, TEXT_XS_MEDIUM, ink.bot_avatar_ground)
				.max_w(SPACING * 40.0)
				.truncate(),
		);
	el().w(2.0).h(SPACING * 6.0).radius(1.0).fill(ink.primary).child(flag)
}

pub fn person_caret(t: &Tokens, name: &str) -> El {
	let flag = row()
		.pin(Some(0.0), Some(SPACING * 6.5), None, None)
		.h(SPACING * 5.0)
		.pl(SPACING * 0.5)
		.pr(SPACING * 1.75)
		.gap(SPACING)
		.center_y()
		.corners([0.0, 5.0, 5.0, 5.0])
		.fill(t.primary)
		.child(Person { name, image: None }.draw(SPACING * 4.0, t))
		.child(
			label_text(name, TEXT_XS_MEDIUM, t.primary_foreground).max_w(SPACING * 40.0).truncate(),
		);
	el().w(2.0).h(SPACING * 6.0).mr(-2.0).radius(1.0).fill(t.primary).child(flag)
}

pub const PEOPLE_SHOWN: usize = 3;

pub fn presence<S: 'static>(
	t: &Tokens,
	lang: Language,
	writers: &[Agent],
	people: &[&str],
	on_stop_all: Option<impl Fn(&mut S) + 'static>,
) -> El {
	use common::library::document::agents;
	let mut bar = row().gap(SPACING * 2.0).center_y();
	if !people.is_empty() {
		let stack = people.iter().take(PEOPLE_SHOWN).enumerate().map(|(index, name)| {
			let avatar = el()
				.radius(SPACING * 3.5)
				.border(2.0, t.card)
				.child(Person { name, image: None }.draw(SPACING * 6.0, t));
			if index > 0 { avatar.ml(-SPACING * 1.5) } else { avatar }
		});
		bar = bar.child(row().children(stack));
	}
	if writers.is_empty() {
		return bar;
	}
	let faces = writers.iter().enumerate().map(|(index, agent)| {
		let face = Face::still(agent.name, agent.hue).draw(SPACING * 6.0, &agent_tokens(t, *agent));
		if index > 0 { face.ml(-SPACING * 1.5) } else { face }
	});
	let template =
		say(if writers.len() == 1 { agents::WRITING_ONE } else { agents::WRITING_OTHER }, lang);
	let mut pill = row()
		.key("library-document-presence")
		.h(SPACING * 8.0)
		.pl(SPACING)
		.pr(SPACING * 2.5)
		.gap(SPACING * 2.0)
		.center_y()
		.radius(SPACING * 4.0)
		.border(1.0, faded(t.foreground, 0.08))
		.fill(faded(t.foreground, 0.04))
		.child(row().children(faces).a11y_hidden())
		.child(label_text(
			&filled(template, "count", &writers.len().to_string()),
			TEXT_COMPACT_MEDIUM,
			t.soft_foreground,
		));
	if let Some(stop) = on_stop_all {
		pill = pill
			.pr(SPACING)
			.child(chip(t, say(agents::STOP_ALL, lang), SPACING * 6.0).on_press(stop));
	}
	bar.child(pill)
}

fn chip(t: &Tokens, label: &str, height: f32) -> El {
	focus_ring(
		t,
		instant(
			row()
				.key(format!("chip-{label}"))
				.h(height)
				.pl(SPACING * 2.0)
				.pr(SPACING * 2.5)
				.gap(SPACING * 1.5)
				.center_y()
				.radius(height / 2.0)
				.fill(faded(t.foreground, 0.08))
				.hover(faded(t.foreground, 0.12))
				.role("button")
				.label(label)
				.child(label_text(
					label,
					if height < SPACING * 7.0 { TEXT_XS_MEDIUM } else { TEXT_COMPACT_MEDIUM },
					t.foreground,
				)),
		),
	)
}

pub struct Writer<'a> {
	pub agent: Agent<'a>,
	pub elapsed_seconds: u32,
	pub sentences: usize,
	pub section: &'a str,
}

pub fn agent_card(t: &Tokens, lang: Language, writer: &Writer) -> El {
	use common::library::document::agents;
	let ink = agent_tokens(t, writer.agent);
	let elapsed = format!("{}:{:02}", writer.elapsed_seconds / 60, writer.elapsed_seconds % 60);
	let summary = filled(
		&filled(
			say(
				if writer.sentences == 1 { agents::SUMMARY_ONE } else { agents::SUMMARY_OTHER },
				lang,
			),
			"count",
			&writer.sentences.to_string(),
		),
		"section",
		writer.section,
	);
	let stop = filled(say(agents::STOP, lang), "name", writer.agent.name);
	col()
		.key("library-document-agent-card")
		.w(SPACING * 75.0)
		.padding(SPACING * 3.0)
		.gap(SPACING * 3.0)
		.radius(SPACING * 3.0)
		.fill(t.card_raised)
		.shadow(SPACING * 3.0, SPACING * 8.0, Color::BLACK.alpha(if t.dark { 0.5 } else { 0.12 }))
		.role("dialog")
		.child(
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.child(
					label_text(
						&filled(say(agents::TITLE, lang), "name", writer.agent.name),
						TEXT_COMPACT_SEMIBOLD,
						t.foreground,
					)
					.grow(1.0)
					.min_w(0.0)
					.truncate(),
				)
				.child(label_text(&elapsed, TEXT_XS, t.muted_foreground)),
		)
		.child(
			row()
				.gap(SPACING * 2.0)
				.items_start()
				.child(
					el().mt(SPACING)
						.size(SPACING * 2.5, SPACING * 2.5)
						.radius(RADIUS_XS)
						.border(1.0, faded(ink.primary, 0.5))
						.fill(faded(ink.primary, 0.2)),
				)
				.child(
					label_text(&summary, TEXT_COMPACT, t.soft_foreground)
						.wrap()
						.grow(1.0)
						.min_w(0.0),
				),
		)
		.child(row().gap(SPACING * 2.0).child(chip(t, &stop, SPACING * 7.0)).child(chip(
			t,
			say(agents::OPEN_CONVERSATION, lang),
			SPACING * 7.0,
		)))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemAction {
	Open,
	OpenInNewTab,
	Rename,
	Copy,
	Download,
	ShowInFolder,
	Delete,
	SaveToLibrary,
	CopyImage,
}

impl ItemAction {
	pub const ALL: [ItemAction; 7] = [
		ItemAction::Open,
		ItemAction::OpenInNewTab,
		ItemAction::Rename,
		ItemAction::Copy,
		ItemAction::Download,
		ItemAction::ShowInFolder,
		ItemAction::Delete,
	];

	pub const BAR_MENU: [ItemAction; 5] = [
		ItemAction::Open,
		ItemAction::OpenInNewTab,
		ItemAction::Rename,
		ItemAction::ShowInFolder,
		ItemAction::Delete,
	];

	fn label(self) -> Key {
		use common::library::item_menu;
		match self {
			ItemAction::Open => item_menu::OPEN,
			ItemAction::OpenInNewTab => item_menu::OPEN_IN_NEW_TAB,
			ItemAction::Rename => item_menu::RENAME,
			ItemAction::Copy => item_menu::COPY,
			ItemAction::Download => item_menu::DOWNLOAD,
			ItemAction::ShowInFolder => item_menu::SHOW_IN_FOLDER,
			ItemAction::Delete => item_menu::DELETE,
			ItemAction::SaveToLibrary => common::library::image_menu::SAVE_TO_LIBRARY,
			ItemAction::CopyImage => common::library::image_menu::COPY_IMAGE,
		}
	}

	fn glyph(self) -> &'static rune::Icon {
		match self {
			ItemAction::Open => &icons::EYE,
			ItemAction::OpenInNewTab => &icons::SQUARE_PLUS,
			ItemAction::Rename => &icons::PEN,
			ItemAction::Copy => &icons::COPY,
			ItemAction::Download => &icons::DOWNLOAD,
			ItemAction::ShowInFolder => &icons::FOLDER,
			ItemAction::Delete => &icons::BIN,
			ItemAction::SaveToLibrary => &icons::BOOK,
			ItemAction::CopyImage => &icons::COPY,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ImageMenu {
	pub is_saving: bool,
}

pub const ITEM_MENU_KEY: &str = "library-item-menu";

pub fn item_menu<S: 'static>(
	t: &Tokens,
	lang: Language,
	name: &str,
	actions: &[ItemAction],
	image: Option<ImageMenu>,
	on: impl Fn(&mut S, ItemAction) + Clone + 'static,
) -> El {
	let label =
		filled(say(common::library::item_menu::LABEL, lang), "name", shown_name(name, lang));
	let item = |action: ItemAction| MenuItem::new(say(action.label(), lang)).glyph(action.glyph());
	let mut pressed: Vec<ItemAction> =
		actions.iter().copied().filter(|action| *action != ItemAction::Delete).collect();
	let mut rows: Vec<MenuRow> =
		pressed.iter().map(|action| MenuRow::Item(item(*action))).collect();
	if actions.contains(&ItemAction::Delete) {
		pressed.push(ItemAction::Delete);
		rows.push(MenuRow::Separator);
		rows.push(MenuRow::Item(item(ItemAction::Delete).destructive()));
	}
	if let Some(image) = image {
		let save = item(ItemAction::SaveToLibrary);
		pressed.extend([ItemAction::SaveToLibrary, ItemAction::CopyImage]);
		rows.push(MenuRow::Separator);
		rows.push(MenuRow::Item(if image.is_saving { save.disabled() } else { save }));
		rows.push(MenuRow::Item(item(ItemAction::CopyImage)));
	}
	wired_context_menu(t, &label, rows, |index, row| match pressed.get(index) {
		Some(action) => row.on_press(emitter(&on, *action)),
		None => row,
	})
	.key(ITEM_MENU_KEY)
}

pub fn delete_confirmation<S: 'static>(
	t: &Tokens,
	lang: Language,
	name: &str,
	has_failed: bool,
	on: impl Fn(&mut S, bool) + Clone + 'static,
) -> Vec<El> {
	use common::library::item_menu::{self, delete_confirm};
	let shown = shown_name(name, lang);
	let title = filled(say(delete_confirm::TITLE, lang), "name", shown);
	let (cancel_on, confirm_on, dismiss_on) = (on.clone(), on.clone(), on);
	let mut footer = Vec::new();
	if has_failed {
		footer.push(
			label_text(
				&filled(say(delete_confirm::FAILURE, lang), "name", shown),
				TEXT_XS,
				t.destructive,
			)
			.wrap()
			.grow(1.0)
			.min_w(0.0)
			.role("alert"),
		);
	}
	footer.push(
		Button::new(say(common::library::picker::CANCEL, lang))
			.variant(ButtonVariant::Outline)
			.view(t)
			.on_press(move |s: &mut S| cancel_on(s, false)),
	);
	footer.push(
		Button::new(say(item_menu::DELETE, lang))
			.variant(ButtonVariant::Destructive)
			.view(t)
			.on_press(move |s: &mut S| confirm_on(s, true)),
	);
	vec![
		scrim(t),
		dialog(
			t,
			DialogContent {
				title: &title,
				description: say(delete_confirm::DESCRIPTION, lang),
				footer,
			},
			move |s: &mut S| dismiss_on(s, false),
		),
	]
}

pub fn drop_overlay(t: &Tokens, lang: Language, count: usize) -> El {
	use common::library::{bring_in, drop};
	let template = say(if count == 1 { drop::TITLE_ONE } else { drop::TITLE_OTHER }, lang);
	let zone = col()
		.grow(1.0)
		.gap(SPACING * 4.0)
		.padding(SPACING * 4.0)
		.center()
		.radius(RADIUS_CONTROL)
		.border(2.0, t.primary)
		.border_dash(SPACING * 2.0, SPACING * 1.5)
		.fill(faded(t.primary, 0.08))
		.live_region(rune::LiveRegion::Polite)
		.child(
			row()
				.size(SPACING * 14.0, SPACING * 14.0)
				.radius(SPACING * 7.0)
				.fill(t.primary)
				.center()
				.child(icon(&icons::UPLOAD, SPACING * 6.0).color(t.primary_foreground)),
		)
		.child(
			col()
				.gap(SPACING)
				.items_center()
				.child(
					label_text(
						&filled(template, "count", &count.to_string()),
						TEXT_TITLE,
						t.foreground,
					)
					.wrap(),
				)
				.child(label_text(say(bring_in::FORMATS, lang), TEXT_SM, t.soft_foreground)),
		);
	row()
		.key("library-drop-overlay")
		.pin(Some(0.0), Some(0.0), Some(0.0), Some(0.0))
		.padding(SPACING * 4.0)
		.fill(faded(t.card, 0.86))
		.a11y_hidden()
		.child(zone)
}

pub const GHOST_BELOW_CURSOR: f32 = SPACING * 3.5;

pub fn drag_ghost(
	t: &Tokens,
	lang: Language,
	names: &[&str],
	preview: Option<&Image>,
	cursor: (f32, f32),
) -> El {
	let mut thumb =
		el().size(SPACING * 8.0, SPACING * 8.0).radius(RADIUS_SM).clip_rounded(RADIUS_SM);
	thumb = match preview.filter(|image| image.size().is_some()) {
		Some(image) => thumb.pixels_fit(image.pixels(), SurfaceFit::Fill),
		None => thumb
			.fill(t.muted)
			.center()
			.child(icon(&icons::FILE, SPACING * 4.0).color(t.muted_foreground)),
	};
	let first = names.first().copied().unwrap_or_default();
	let mut lines = col().grow(1.0).min_w(0.0).child(
		label_text(first, TEXT_COMPACT_MEDIUM, t.foreground)
			.truncate()
			.help_when_truncated(first.to_owned()),
	);
	let others = names.len().saturating_sub(1);
	if others > 0 {
		let template = say(
			if others == 1 {
				common::library::drop::MORE_ONE
			} else {
				common::library::drop::MORE_OTHER
			},
			lang,
		);
		lines = lines.child(
			label_text(
				&filled(template, "count", &others.to_string()),
				TEXT_XS,
				t.muted_foreground,
			)
			.truncate(),
		);
	}
	let count = row()
		.h(SPACING * 5.0)
		.min_w(SPACING * 5.0)
		.px(SPACING * 1.5)
		.radius(SPACING * 2.5)
		.fill(t.primary)
		.center()
		.child(label_text(&names.len().to_string(), TEXT_XS_MEDIUM, t.primary_foreground));
	row()
		.key("library-drag-ghost")
		.absolute(cursor.0, cursor.1 + GHOST_BELOW_CURSOR)
		.max_w(SPACING * 72.0)
		.py(SPACING * 1.5)
		.pl(SPACING * 1.5)
		.pr(SPACING * 2.5)
		.gap(SPACING * 2.0)
		.center_y()
		.radius(RADIUS_LG)
		.fill(t.card_raised)
		.shadow(SPACING * 2.0, SPACING * 6.0, t.popover_shadow)
		.a11y_hidden()
		.child(thumb)
		.child(lines)
		.child(count)
}

pub fn failure_notice(t: &Tokens, lang: Language, title: &str, description: &str) -> El {
	let notice = toast(
		t,
		Toast {
			kind: ToastType::Error,
			title,
			description,
			action: Some(say(common::notice::COPY, lang)),
		},
	);
	col()
		.key("library-failure-notice")
		.pin(None, None, Some(SPACING * 4.0), Some(SPACING * 4.0))
		.w(SPACING * 96.0)
		.child(notice)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Format {
	Bold,
	Italic,
	Strikethrough,
	Code,
	Link,
	Heading,
	List,
}

impl Format {
	pub const INLINE: [Format; 5] =
		[Format::Bold, Format::Italic, Format::Strikethrough, Format::Code, Format::Link];
	pub const BLOCK: [Format; 2] = [Format::Heading, Format::List];

	fn label(self) -> Key {
		use common::library::editor::toolbar;
		match self {
			Format::Bold => toolbar::BOLD,
			Format::Italic => toolbar::ITALIC,
			Format::Strikethrough => toolbar::STRIKETHROUGH,
			Format::Code => toolbar::CODE,
			Format::Link => toolbar::LINK,
			Format::Heading => toolbar::HEADING,
			Format::List => toolbar::LIST,
		}
	}

	fn shortcut(self) -> Option<Key> {
		use common::library::editor::toolbar;
		match self {
			Format::Bold => Some(toolbar::BOLD_SHORTCUT),
			Format::Italic => Some(toolbar::ITALIC_SHORTCUT),
			Format::Strikethrough => Some(toolbar::STRIKETHROUGH_SHORTCUT),
			Format::Code => Some(toolbar::CODE_SHORTCUT),
			Format::Link => Some(toolbar::LINK_SHORTCUT),
			Format::Heading | Format::List => None,
		}
	}

	fn glyph(self) -> &'static rune::Icon {
		match self {
			Format::Bold => &icons::BOLD,
			Format::Italic => &icons::ITALIC,
			Format::Strikethrough => &icons::STRIKETHROUGH,
			Format::Code => &icons::CODE,
			Format::Link => &icons::LINK,
			Format::Heading => &icons::HEADING,
			Format::List => &icons::LIST,
		}
	}
}

pub const TOOLBAR_GAP: f32 = SPACING * 2.0;
pub const TOOLBAR_KEY: &str = "selection-toolbar";

fn toolbar_hairline(t: &Tokens) -> Color {
	faded(t.foreground, if t.dark { 0.1 } else { 0.08 })
}

fn toolbar_highlight(t: &Tokens) -> Color {
	faded(t.foreground, if t.dark { 0.08 } else { 0.06 })
}

fn toolbar_surface(t: &Tokens) -> El {
	row()
		.padding(SPACING)
		.radius(RADIUS_CONTROL)
		.border(1.0, toolbar_hairline(t))
		.fill(t.card_raised)
		.shadow(SPACING * 2.0, SPACING * 6.0, t.popover_shadow)
}

pub fn format_toolbar<S: 'static>(
	t: &Tokens,
	lang: Language,
	pressed: &[Format],
	hovered: Option<Format>,
	on: impl Fn(&mut S, Format) + Clone + 'static,
) -> El {
	let highlight = toolbar_highlight(t);
	let button = |format: Format| {
		let label = say(format.label(), lang);
		let is_pressed = pressed.contains(&format);
		let (fill, ink) = if is_pressed {
			(faded(t.user_bubble, 0.15), t.user_bubble)
		} else if hovered == Some(format) {
			(highlight, t.foreground)
		} else {
			(t.foreground.alpha(0.0), t.foreground)
		};
		let on = on.clone();
		focus_ring(
			t,
			instant(
				row()
					.key(format!("toolbar-{label}"))
					.size(SPACING * 7.0, SPACING * 7.0)
					.radius(RADIUS_MD)
					.center()
					.fill(fill)
					.hover(if is_pressed { fill } else { highlight })
					.role("button")
					.checked(is_pressed)
					.label(label)
					.child(icon(format.glyph(), SPACING * 4.0).color(ink)),
			),
		)
		.on_press(move |s: &mut S| on(s, format))
	};
	toolbar_surface(t)
		.key(TOOLBAR_KEY)
		.gap(SPACING * 0.5)
		.center_y()
		.role("toolbar")
		.label(say(common::library::editor::toolbar::LABEL, lang))
		.children(Format::INLINE.map(button))
		.child(el().w(1.0).h(SPACING * 4.0).mx(SPACING).fill(toolbar_hairline(t)))
		.children(Format::BLOCK.map(button))
}

pub fn format_tooltip(t: &Tokens, lang: Language, format: Format) -> El {
	let mut tip = row()
		.padding(SPACING * 1.5)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(RADIUS_CONTROL)
		.fill(t.foreground)
		.child(label_text(say(format.label(), lang), TEXT_XS_MEDIUM, t.card));
	if let Some(shortcut) = format.shortcut() {
		tip = tip.child(
			row()
				.h(SPACING * 5.0)
				.px(SPACING * 0.5)
				.radius(RADIUS_MD)
				.fill(faded(t.card, 0.1))
				.center()
				.child(label_text(say(shortcut, lang), TEXT_XS_MEDIUM, t.card)),
		);
	}
	tip.key("toolbar-tooltip")
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum LinkEvent {
	Confirm(String),
	Cancel,
}

pub fn link_field<S: 'static>(
	t: &Tokens,
	lang: Language,
	edit: &TextEdit,
	access: Access<S>,
	on: impl Fn(&mut S, LinkEvent) + Clone + 'static,
) -> El {
	use common::library::editor::toolbar;
	let confirm = move |s: &mut S| LinkEvent::Confirm(access(s).text.clone());
	let (submit_on, key_on, press_on) = (on.clone(), on.clone(), on);
	let field = text_input(edit, TEXT_COMPACT)
		.single_line()
		.key("library-link-field")
		.w_full()
		.color(t.foreground)
		.placeholder(say(toolbar::LINK_FIELD, lang), t.placeholder_foreground)
		.caret(t.foreground, t.selection)
		.label(say(toolbar::LINK_FIELD, lang))
		.on_edit(access)
		.on_submit(move |s: &mut S, _: &mut Tx| {
			let event = confirm(s);
			submit_on(s, event);
		})
		.on_input_key(move |s: &mut S, event: &KeyEvent, _: &mut Tx| {
			let is_cancel = event.key == KeyName::Escape;
			if is_cancel {
				key_on(s, LinkEvent::Cancel);
			}
			is_cancel
		});
	toolbar_surface(t)
		.key(TOOLBAR_KEY)
		.w(SPACING * 85.0)
		.gap(SPACING)
		.center_y()
		.role("group")
		.label(say(toolbar::LINK, lang))
		.child(
			row()
				.size(SPACING * 7.0, SPACING * 7.0)
				.center()
				.child(icon(&icons::LINK, SPACING * 4.0).color(t.muted_foreground)),
		)
		.child(row().h(SPACING * 7.0).grow(1.0).min_w(0.0).center_y().child(field))
		.child(
			row()
				.padding(SPACING * 0.5)
				.radius(RADIUS_MD)
				.fill(toolbar_highlight(t))
				.child(icon(&icons::CORNER_DOWN_LEFT, SPACING * 3.5).color(t.muted_foreground)),
		)
		.child(
			focus_ring(
				t,
				instant(
					row()
						.size(SPACING * 7.0, SPACING * 7.0)
						.radius(RADIUS_MD)
						.center()
						.hover(faded(t.foreground, 0.06))
						.role("button")
						.label(say(toolbar::CONFIRM_LINK, lang))
						.child(icon(&icons::CHECK, SPACING * 4.0).color(t.foreground)),
				),
			)
			.on_press(move |s: &mut S| {
				let event = confirm(s);
				press_on(s, event);
			}),
		)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HandleEvent {
	Insert,
	Press,
	Move { from: usize, to: usize },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct HandlePlace<'a> {
	pub index: usize,
	pub pitches: &'a [f32],
}

const DRAG_SLOP: f32 = SPACING;

pub fn moved_to(pitches: &[f32], from: usize, travel: f32) -> usize {
	let (mut to, mut left) = (from, travel.abs());
	if travel > 0.0 {
		while to + 1 < pitches.len() && left > pitches[to + 1] / 2.0 {
			left -= pitches[to + 1];
			to += 1;
		}
	} else {
		while to > 0 && left > pitches[to - 1] / 2.0 {
			left -= pitches[to - 1];
			to -= 1;
		}
	}
	to
}

pub fn block_handle<S: 'static>(
	t: &Tokens,
	lang: Language,
	is_pressed: bool,
	place: HandlePlace,
	on: impl Fn(&mut S, HandleEvent) + Clone + 'static,
) -> El {
	use common::library::editor::blocks::handle;
	let button = |glyph: &'static rune::Icon, label: &str, width: f32, is_on: bool| {
		let control = row()
			.key(format!("library-handle-{label}"))
			.w(width)
			.h(SPACING * 6.0)
			.radius(RADIUS_SM)
			.center()
			.hover(t.accent)
			.role("button")
			.label(label)
			.child(icon(glyph, SPACING * 4.0).color(if is_on {
				t.foreground
			} else {
				t.muted_foreground
			}));
		focus_ring(t, instant(if is_on { control.fill(t.accent) } else { control }))
	};
	let (from, pitches, drag_on) = (place.index, place.pitches.to_vec(), on.clone());
	let grip = button(&icons::GRIP_VERTICAL, say(handle::MENU, lang), SPACING * 5.0, is_pressed)
		.cursor(Cursor::Grab)
		.on_press(emitter(&on, HandleEvent::Press))
		.on_drag(move |s: &mut S, drag, _| {
			if drag.phase != rune::Phase::Up || drag.cancelled() || drag.dy.abs() < DRAG_SLOP {
				return;
			}
			let to = moved_to(&pitches, from, drag.dy);
			if to != from {
				drag_on(s, HandleEvent::Move { from, to });
			}
		});
	row()
		.key("library-block-handle")
		.gap(SPACING * 0.5)
		.child(
			button(&icons::PLUS, say(handle::INSERT, lang), SPACING * 6.0, false)
				.on_press(emitter(&on, HandleEvent::Insert)),
		)
		.child(grip)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BlockMenuAction {
	TurnInto,
	Duplicate,
	MoveUp,
	MoveDown,
	Delete,
}

pub fn block_menu<S: 'static>(
	t: &Tokens,
	lang: Language,
	kind: LibraryBlockType,
	is_mac: bool,
	on: impl Fn(&mut S, BlockMenuAction) + Clone + 'static,
) -> El {
	use common::library::editor::blocks::menu;
	let shortcut = |mac: Key, other: Key| Shortcut {
		command: false,
		key: say(if is_mac { mac } else { other }, lang),
	};
	let rows = [
		MenuRow::Label(say(kind.label(), lang)),
		MenuRow::Item(
			MenuItem::new(say(menu::TURN_INTO, lang))
				.glyph(&icons::REFRESH_CW)
				.mark(MenuMark::Submenu),
		),
		MenuRow::Item(MenuItem::new(say(menu::DUPLICATE, lang)).glyph(&icons::COPY).shortcut(
			shortcut(menu::shortcuts::mac::DUPLICATE, menu::shortcuts::other::DUPLICATE),
		)),
		MenuRow::Item(
			MenuItem::new(say(menu::MOVE_UP, lang))
				.glyph(&icons::ARROW_UP)
				.shortcut(shortcut(menu::shortcuts::mac::MOVE_UP, menu::shortcuts::other::MOVE_UP)),
		),
		MenuRow::Item(
			MenuItem::new(say(menu::MOVE_DOWN, lang)).glyph(&icons::ARROW_DOWN).shortcut(shortcut(
				menu::shortcuts::mac::MOVE_DOWN,
				menu::shortcuts::other::MOVE_DOWN,
			)),
		),
		MenuRow::Separator,
		MenuRow::Item(
			MenuItem::new(say(menu::DELETE, lang))
				.glyph(&icons::BIN)
				.destructive()
				.shortcut(shortcut(menu::shortcuts::mac::DELETE, menu::shortcuts::other::DELETE)),
		),
	];
	let pressed = [
		BlockMenuAction::TurnInto,
		BlockMenuAction::Duplicate,
		BlockMenuAction::MoveUp,
		BlockMenuAction::MoveDown,
		BlockMenuAction::Delete,
	];
	wired_dropdown_menu(
		t,
		say(common::library::editor::blocks::handle::MENU, lang),
		rows,
		|index, row| match pressed.get(index) {
			Some(action) => row.on_press(emitter(&on, *action)),
			None => row,
		},
	)
	.key("library-block-menu")
}

pub fn drop_indicator(t: &Tokens) -> El {
	el().key("library-drop-indicator").w_full().h(2.0).radius(1.0).fill(t.primary).a11y_hidden()
}

pub fn title_field<S: 'static>(
	t: &Tokens,
	lang: Language,
	edit: &TextEdit,
	access: Access<S>,
) -> El {
	let untitled = say(common::library::editor::UNTITLED, lang);
	text_input(edit, TEXT_TITLE)
		.key("library-document-title")
		.w_full()
		.color(t.foreground)
		.placeholder(untitled, t.title_placeholder_foreground)
		.caret(t.foreground, t.selection)
		.label(say(common::library::editor::TITLE, lang))
		.on_edit(access)
}

#[cfg(test)]
mod tile_more_tests;
