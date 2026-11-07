use rune::image::Image;
use rune::{
	Align, Color, El, Icon, Span, TextEdit, TextStyle, col, el, icon, rich, row, text, text_input,
};

use super::blocks::{HAIRLINE, hairline};
use super::{Emit, Look, control, dot, hexagon, pressed};
use crate::avatar::{Face, Person};
use crate::icons;
use crate::primitives::skeleton::skeleton;
use crate::primitives::{elevated, tight};
use crate::strings::search;
use crate::tokens::{
	RADIUS_2XL, RADIUS_XL, SPACING, TEXT_11, TEXT_BASE_SEMIBOLD, TEXT_READING, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens, conversation_icon, faded,
};

const IDENTITY_SIDE: f32 = SPACING * 8.0;
const BADGE_SHARE: f32 = 0.34;
const BADGE_INSET_SHARE: f32 = 0.06;
const BADGE_RING: f32 = 2.0;
const ROW_MIN_HEIGHT: f32 = SPACING * 13.0;
const ROW_INSET: f32 = SPACING * 1.5;
const ROW_GAP: f32 = SPACING * 2.5;
const NAME_LINE: f32 = SPACING * 5.0;
const PREVIEW_LINE: f32 = SPACING * 4.0;
const PREVIEW_GAP: f32 = SPACING * 1.25;
const ROW_GLYPH: f32 = SPACING * 2.75;
const MATCH_PAD: f32 = SPACING * 0.5;
const LIST_GAP: f32 = SPACING * 0.5;
const PART_SEPARATOR: &str = " · ";
const TABULAR: &str = "'tnum' 1";

const PALETTE_WIDTH: f32 = SPACING * 160.0;
pub const PALETTE_HEIGHT: f32 = SPACING * 146.0;
pub const PALETTE_TOP: f32 = SPACING * 27.0;
const QUERY_LINE: f32 = SPACING * 13.0;
const QUERY_GAP: f32 = SPACING * 2.5;
const QUERY_GLYPH: f32 = SPACING * 4.5;
const TAB_ROW: f32 = SPACING * 11.0;
const TAB_HEIGHT: f32 = SPACING * 7.5;
const BODY_INSET: f32 = SPACING * 2.0;
const BODY_HEIGHT: f32 = PALETTE_HEIGHT - QUERY_LINE - TAB_ROW - BODY_INSET * 2.0;
const SECTION_HEAD: f32 = SPACING * 7.0;
const SECTION_GAP: f32 = SPACING * 1.5;
const SKELETON_SECTION_GAP: f32 = SPACING * 2.0;
const PANEL_MARK: f32 = SPACING * 8.0;
const PANEL_GAP: f32 = SPACING * 5.0;
const PANEL_INSET: f32 = SPACING * 6.0;
const PANEL_TEXT_GAP: f32 = SPACING * 2.0;
const PANEL_MEASURE: f32 = SPACING * 112.0;
const SHOWN_PER_KIND: usize = 3;
const SKELETON_BAR: f32 = SPACING * 3.0;
const SKELETON_FAINT_BAR: f32 = SPACING * 2.25;
const SKELETON_STAMP: f32 = SPACING * 7.0;
const SKELETON_FAINT_SHARE: f32 = 0.6;
const CONVERSATION_SKELETON: [(f32, f32); 3] = [
	(SPACING * 14.0, SPACING * 62.5),
	(SPACING * 24.0, SPACING * 53.5),
	(SPACING * 12.0, SPACING * 45.0),
];
const MISSION_SKELETON: [(f32, f32); 3] = [
	(SPACING * 52.5, SPACING * 24.0),
	(SPACING * 37.5, SPACING * 42.5),
	(SPACING * 44.0, SPACING * 37.5),
];
const RESTING_SKELETON_ROWS: usize = 3;

#[derive(Clone, Copy)]
pub struct Bot<'a> {
	pub seed: &'a str,
	pub hue: Option<f32>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BotBadge {
	Attention,
	Done,
	Failed,
}

#[derive(Clone, Copy)]
pub enum Identity<'a> {
	Message(Bot<'a>),
	MessageFromYou { reader: &'a str, image: Option<&'a Image> },
	ChatGroup { hue: Option<f32>, pictogram: &'static Icon },
	ChatSolo(Bot<'a>),
	Mission { bot: Bot<'a>, badge: Option<BotBadge>, mark: &'static Icon },
	Routine(Bot<'a>),
}

#[derive(Clone, Copy)]
pub struct TitlePart<'a> {
	pub text: &'a str,
	pub is_match: bool,
}

#[derive(Clone)]
pub struct Hit<'a> {
	pub id: &'a str,
	pub identity: Identity<'a>,
	pub title: Vec<TitlePart<'a>>,
	pub timestamp: &'a str,
	pub parts: Vec<&'a str>,
	pub identifier: Option<&'a str>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchKind {
	Messages,
	Chats,
	Missions,
	Routines,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SearchTab {
	All,
	Only(SearchKind),
}

#[derive(Clone, Debug, PartialEq)]
pub enum SearchEvent {
	Open(String),
	TabChange(SearchTab),
}

pub struct ResultGroup<'a> {
	pub kind: SearchKind,
	pub total: usize,
	pub hits: Vec<Hit<'a>>,
}

pub struct RestingGroup<'a> {
	pub kind: SearchKind,
	pub hits: Vec<Hit<'a>>,
}

pub struct Palette<'a> {
	pub query: &'a TextEdit,
	pub tab: SearchTab,
	pub space: &'a str,
	pub results: &'a [ResultGroup<'a>],
	pub resting: &'a [RestingGroup<'a>],
	pub is_loading: bool,
	pub active: Option<&'a str>,
}

const TABS: [SearchTab; 5] = [
	SearchTab::All,
	SearchTab::Only(SearchKind::Messages),
	SearchTab::Only(SearchKind::Chats),
	SearchTab::Only(SearchKind::Missions),
	SearchTab::Only(SearchKind::Routines),
];

const RESTING_KINDS: [SearchKind; 3] =
	[SearchKind::Chats, SearchKind::Missions, SearchKind::Routines];

impl SearchKind {
	fn tab_label(self) -> crate::strings::Key {
		match self {
			SearchKind::Messages => search::tab::MESSAGES,
			SearchKind::Chats => search::tab::CHATS,
			SearchKind::Missions => search::tab::MISSIONS,
			SearchKind::Routines => search::tab::ROUTINES,
		}
	}

	fn resting_label(self) -> crate::strings::Key {
		match self {
			SearchKind::Missions => search::rest::MISSIONS,
			SearchKind::Routines => search::rest::ROUTINES,
			SearchKind::Messages | SearchKind::Chats => search::rest::CHATS,
		}
	}

	fn resting_mark(self) -> &'static Icon {
		match self {
			SearchKind::Missions => &icons::BOOKMARK,
			SearchKind::Routines => &icons::REPEAT,
			SearchKind::Messages | SearchKind::Chats => &icons::MESSAGE_SQUARE,
		}
	}

	fn resting_none(self) -> (crate::strings::Key, crate::strings::Key) {
		match self {
			SearchKind::Missions => {
				(search::rest::none::MISSIONS, search::rest::none::body::MISSIONS)
			}
			SearchKind::Routines => {
				(search::rest::none::ROUTINES, search::rest::none::body::ROUTINES)
			}
			SearchKind::Messages | SearchKind::Chats => {
				(search::rest::none::CHATS, search::rest::none::body::CHATS)
			}
		}
	}
}

impl SearchTab {
	fn label(self) -> crate::strings::Key {
		match self {
			SearchTab::All => search::tab::ALL,
			SearchTab::Only(kind) => kind.tab_label(),
		}
	}

	fn shows(self, kind: SearchKind) -> bool {
		self == SearchTab::All || self == SearchTab::Only(kind)
	}
}

fn is_message(identity: &Identity) -> bool {
	matches!(identity, Identity::Message(_) | Identity::MessageFromYou { .. })
}

fn glyph_of(identity: &Identity) -> Option<&'static Icon> {
	match identity {
		Identity::Mission { mark, .. } => Some(mark),
		Identity::Routine(_) => Some(&icons::REPEAT),
		_ => None,
	}
}

fn bot_face(t: &Tokens, bot: Bot) -> El {
	Face::still(bot.seed, bot.hue).draw(IDENTITY_SIDE, t)
}

fn badge_colour(t: &Tokens, badge: BotBadge) -> Color {
	match badge {
		BotBadge::Attention => t.bot_badge_attention,
		BotBadge::Done => t.bot_badge_done,
		BotBadge::Failed => t.bot_badge_failed,
	}
}

pub fn subject_icon(t: &Tokens, hue: Option<f32>, pictogram: &'static Icon, side: f32) -> El {
	let (ground, ink) = conversation_icon(hue, t.dark);
	el().size(side, side)
		.center()
		.a11y_hidden()
		.child(hexagon(side, ground).absolute(0.0, 0.0))
		.child(icon(pictogram, side / 2.0).color(ink))
}

fn identity_mark(t: &Tokens, identity: &Identity) -> El {
	match *identity {
		Identity::ChatGroup { hue, pictogram } => subject_icon(t, hue, pictogram, IDENTITY_SIDE),
		Identity::MessageFromYou { reader, image } => {
			Person { name: reader, image }.draw(IDENTITY_SIDE, t)
		}
		Identity::Message(bot) | Identity::ChatSolo(bot) | Identity::Routine(bot) => {
			bot_face(t, bot)
		}
		Identity::Mission { bot, badge, .. } => {
			let face = el().size(IDENTITY_SIDE, IDENTITY_SIDE).child(bot_face(t, bot));
			let Some(badge) = badge else { return face };
			let side = IDENTITY_SIDE * BADGE_SHARE;
			let at = IDENTITY_SIDE * (1.0 - BADGE_INSET_SHARE) - side;
			face.child(
				dot(side, badge_colour(t, badge))
					.outline(BADGE_RING, 0.0, t.popover)
					.absolute(at, at),
			)
		}
	}
}

fn title_line(t: &Tokens, hit: &Hit) -> El {
	let style = if is_message(&hit.identity) { TEXT_SM } else { TEXT_SM_MEDIUM };
	let mut content = String::new();
	let mut spans = Vec::new();
	for part in &hit.title {
		let start = content.len();
		content.push_str(part.text);
		if part.is_match {
			spans.push(Span::new(start, content.len()).bg(t.mark, MATCH_PAD));
		}
	}
	rich(content, spans).font(style).color(t.foreground).truncate().grow(1.0).shrink()
}

fn preview_line(t: &Tokens, hit: &Hit) -> El {
	let mut line = row().h(PREVIEW_LINE).gap(PREVIEW_GAP).center_y();
	if let Some(glyph) = glyph_of(&hit.identity) {
		line = line.child(icon(glyph, ROW_GLYPH).color(t.muted_foreground));
	}
	if let Some(identifier) = hit.identifier {
		let style = TextStyle { features: TABULAR, ..TEXT_XS_MEDIUM };
		line = line.child(text(identifier.to_owned()).font(style).color(t.muted_foreground));
	}
	let parts: Vec<&str> = hit.parts.iter().copied().filter(|part| !part.is_empty()).collect();
	line.child(
		text(parts.join(PART_SEPARATOR))
			.font(TEXT_XS)
			.color(t.muted_foreground)
			.truncate()
			.shrink(),
	)
}

pub fn result_row<S: 'static>(
	look: Look,
	hit: &Hit,
	is_active: bool,
	emit: Emit<S, SearchEvent>,
) -> El {
	let t = look.t;
	let title: String = hit.title.iter().map(|part| part.text).collect();
	let stamp = TextStyle { features: TABULAR, ..TEXT_11 };
	let stack = col()
		.grow(1.0)
		.shrink()
		.gap(1.0)
		.child(
			row()
				.h(NAME_LINE)
				.gap(SPACING * 1.5)
				.center_y()
				.child(title_line(t, hit))
				.child(text(hit.timestamp.to_owned()).font(stamp).color(t.muted_foreground)),
		)
		.child(preview_line(t, hit));
	let surface = if is_active { t.selection } else { Color::TRANSPARENT };
	let hovered = if is_active { t.selection } else { faded(t.muted, 0.5) };
	let option = row()
		.key(format!("search-result-{}", hit.id))
		.w_full()
		.min_h(ROW_MIN_HEIGHT)
		.padding(ROW_INSET)
		.gap(ROW_GAP)
		.radius(RADIUS_XL)
		.center_y()
		.fill(surface)
		.hover(hovered)
		.press(hovered)
		.role("option")
		.label(title)
		.checked(is_active)
		.child(identity_mark(t, &hit.identity))
		.child(stack);
	pressed(control(t, option), emit, SearchEvent::Open(hit.id.to_owned()))
}

pub fn result_list(t: &Tokens, width: f32, rows: impl IntoIterator<Item = El>) -> El {
	col()
		.w(width)
		.padding(SPACING)
		.gap(LIST_GAP)
		.radius(RADIUS_XL)
		.fill(t.popover)
		.role("listbox")
		.children(rows)
}

struct Section<'p, 'a> {
	head: Option<SectionHead>,
	hits: &'p [Hit<'a>],
}

struct SectionHead {
	label: crate::strings::Key,
	total: Option<usize>,
	see_all: Option<SearchKind>,
}

fn resting_sections<'p, 'a>(p: &'p Palette<'a>) -> Vec<Section<'p, 'a>> {
	RESTING_KINDS
		.iter()
		.filter_map(|&kind| {
			let hits = &p.resting.iter().find(|group| group.kind == kind)?.hits;
			if !p.tab.shows(kind) || hits.is_empty() {
				return None;
			}
			let is_all = p.tab == SearchTab::All;
			let shown = if is_all { &hits[..hits.len().min(SHOWN_PER_KIND)] } else { &hits[..] };
			Some(Section {
				head: Some(SectionHead {
					label: kind.resting_label(),
					total: None,
					see_all: (is_all && hits.len() > SHOWN_PER_KIND).then_some(kind),
				}),
				hits: shown,
			})
		})
		.collect()
}

fn found_sections<'p, 'a>(p: &'p Palette<'a>) -> Vec<Section<'p, 'a>> {
	p.results
		.iter()
		.filter(|group| !group.hits.is_empty() && p.tab.shows(group.kind))
		.map(|group| {
			if p.tab != SearchTab::All {
				return Section { head: None, hits: &group.hits[..] };
			}
			Section {
				head: Some(SectionHead {
					label: group.kind.tab_label(),
					total: Some(group.total),
					see_all: (group.total > SHOWN_PER_KIND).then_some(group.kind),
				}),
				hits: &group.hits[..group.hits.len().min(SHOWN_PER_KIND)],
			}
		})
		.collect()
}

fn section_head<S: 'static>(look: Look, head: &SectionHead, emit: Emit<S, SearchEvent>) -> El {
	let t = look.t;
	let mut line = row()
		.h(SECTION_HEAD)
		.padding(SECTION_GAP)
		.gap(SECTION_GAP)
		.center_y()
		.child(text(look.say(head.label).to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground));
	if let Some(total) = head.total {
		let style = TextStyle { features: TABULAR, ..TEXT_XS };
		line = line.child(text(total.to_string()).font(style).color(t.muted_foreground));
	}
	if let Some(kind) = head.see_all {
		let label = look.say(search::SEE_ALL);
		let see_all = row()
			.key(format!("search-see-all-{kind:?}"))
			.radius(RADIUS_XL)
			.role("button")
			.label(label)
			.child(
				text(label.to_owned())
					.font(TEXT_XS)
					.color(t.muted_foreground)
					.group_color(t.foreground),
			);
		line = line.child(rune::spacer()).child(pressed(
			control(t, see_all),
			emit,
			SearchEvent::TabChange(SearchTab::Only(kind)),
		));
	}
	line
}

fn bar(t: &Tokens, width: f32, is_faint: bool) -> El {
	let (height, fill) = if is_faint {
		(SKELETON_FAINT_BAR, faded(t.border, SKELETON_FAINT_SHARE))
	} else {
		(SKELETON_BAR, t.border)
	};
	el().size(width, height).radius(height / 2.0).fill(fill)
}

fn row_skeleton(t: &Tokens, (title, sub): (f32, f32)) -> El {
	row()
		.w_full()
		.min_h(ROW_MIN_HEIGHT)
		.padding(ROW_INSET)
		.gap(ROW_GAP)
		.center_y()
		.child(hexagon(IDENTITY_SIDE, t.border))
		.child(
			col()
				.grow(1.0)
				.child(
					row()
						.h(NAME_LINE)
						.center_y()
						.justify_between()
						.child(bar(t, title, false))
						.child(bar(t, SKELETON_STAMP, true)),
				)
				.child(row().h(PREVIEW_LINE).center_y().child(bar(t, sub, true))),
		)
}

fn rows_to_fill(room: f32) -> usize {
	((room + LIST_GAP) / (ROW_MIN_HEIGHT + LIST_GAP)).ceil() as usize
}

fn pulsing(t: &Tokens, content: El) -> El {
	skeleton(t).fill(Color::TRANSPARENT).radius(0.0).w_full().child(content)
}

fn skeleton_rows(t: &Tokens, widths: [(f32, f32); 3], count: usize) -> El {
	col()
		.w_full()
		.gap(LIST_GAP)
		.children((0..count).map(|at| row_skeleton(t, widths[at % widths.len()])))
}

fn results_skeleton(look: Look, is_sectioned: bool) -> El {
	let t = look.t;
	if !is_sectioned {
		return pulsing(t, skeleton_rows(t, CONVERSATION_SKELETON, rows_to_fill(BODY_HEIGHT)));
	}
	let head = |key| {
		row()
			.h(SECTION_HEAD)
			.padding(SECTION_GAP)
			.center_y()
			.child(text(look.say(key).to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground))
	};
	let chats_block = SECTION_HEAD
		+ LIST_GAP
		+ RESTING_SKELETON_ROWS as f32 * ROW_MIN_HEIGHT
		+ (RESTING_SKELETON_ROWS - 1) as f32 * LIST_GAP;
	let missions_room = BODY_HEIGHT - chats_block - SKELETON_SECTION_GAP - SECTION_HEAD - LIST_GAP;
	col()
		.w_full()
		.a11y_hidden()
		.child(
			col()
				.w_full()
				.gap(LIST_GAP)
				.child(head(search::rest::CHATS))
				.child(pulsing(t, skeleton_rows(t, CONVERSATION_SKELETON, RESTING_SKELETON_ROWS))),
		)
		.child(
			col()
				.w_full()
				.pt(SKELETON_SECTION_GAP)
				.gap(LIST_GAP)
				.child(head(search::rest::MISSIONS))
				.child(pulsing(t, skeleton_rows(t, MISSION_SKELETON, rows_to_fill(missions_room)))),
		)
}

pub fn empty_state(t: &Tokens, mark: &'static Icon, title: &str, description: &str) -> El {
	col()
		.w_full()
		.padding(PANEL_INSET)
		.gap(PANEL_GAP)
		.center()
		.child(icon(mark, PANEL_MARK).color(t.muted_foreground))
		.child(
			col()
				.max_w(PANEL_MEASURE)
				.gap(PANEL_TEXT_GAP)
				.items_center()
				.child(
					text(title.to_owned())
						.font(TEXT_BASE_SEMIBOLD)
						.color(t.foreground)
						.align(Align::Center)
						.role("heading")
						.wrap(),
				)
				.child(
					text(description.to_owned())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.align(Align::Center)
						.wrap(),
				),
		)
}

fn panel_of(look: Look, p: &Palette, query: &str, is_shown: bool, is_skeleton: bool) -> Option<El> {
	if is_shown || is_skeleton {
		return None;
	}
	let t = look.t;
	let instruction = || {
		empty_state(
			t,
			&icons::SEARCH,
			look.say(search::rest::messages::TITLE),
			&look.fill(search::rest::messages::BODY, &[("space", p.space)]),
		)
	};
	if !query.is_empty() {
		if p.is_loading {
			return None;
		}
		return Some(empty_state(
			t,
			&icons::SEARCH,
			look.say(search::empty::TITLE),
			&look.fill(search::empty::DESCRIPTION, &[("space", p.space), ("query", query)]),
		));
	}
	match p.tab {
		SearchTab::Only(SearchKind::Messages) => Some(instruction()),
		_ if p.is_loading => None,
		SearchTab::Only(kind) => {
			let (title, body) = kind.resting_none();
			Some(empty_state(
				t,
				kind.resting_mark(),
				look.say(title),
				&look.fill(body, &[("space", p.space)]),
			))
		}
		SearchTab::All => Some(instruction()),
	}
}

fn tab_strip<S: 'static>(look: Look, current: SearchTab, emit: Emit<S, SearchEvent>) -> El {
	let t = look.t;
	let style = tight(TEXT_SM_MEDIUM);
	row().role("tablist").center_y().children(TABS.map(|tab| {
		let label = look.say(tab.label());
		let is_current = tab == current;
		let ink = if is_current { t.foreground } else { faded(t.foreground, 0.6) };
		let trigger = row()
			.key(format!("search-tab-{tab:?}"))
			.h(TAB_HEIGHT)
			.padding(crate::primitives::equal_padding(TAB_HEIGHT, style.size))
			.radius(RADIUS_2XL)
			.center()
			.fill(if is_current { t.selection } else { Color::TRANSPARENT })
			.hover(if is_current { t.selection } else { t.muted })
			.role("tab")
			.label(label)
			.checked(is_current)
			.child(text(label.to_owned()).font(style).color(ink).group_color(t.foreground));
		pressed(control(t, trigger), emit, SearchEvent::TabChange(tab))
	}))
}

pub fn palette<S: 'static>(
	look: Look,
	p: &Palette,
	access: impl for<'e> Fn(&'e mut S) -> &'e mut TextEdit + 'static,
	emit: Emit<S, SearchEvent>,
) -> El {
	let t = look.t;
	let query = p.query.text.as_str();
	let is_rest = query.is_empty();
	let answered = if is_rest { resting_sections(p) } else { found_sections(p) };
	let is_skeleton = p.is_loading
		&& answered.is_empty()
		&& !(is_rest && p.tab == SearchTab::Only(SearchKind::Messages));
	let sections = if is_skeleton { Vec::new() } else { answered };
	let is_shown = sections.iter().any(|section| !section.hits.is_empty());
	let label = look.say(search::OPEN);
	let style = tight(TEXT_READING);
	let field = text_input(p.query, style)
		.single_line()
		.key("search-palette-query")
		.grow(1.0)
		.color(t.foreground)
		.placeholder(look.say(search::PLACEHOLDER), t.muted_foreground)
		.caret(t.foreground, t.selection)
		.label(label)
		.on_edit(access);
	let query_line = row()
		.w_full()
		.h(QUERY_LINE - HAIRLINE)
		.padding(crate::primitives::equal_padding(QUERY_LINE, style.size))
		.gap(QUERY_GAP)
		.center_y()
		.child(icon(&icons::SEARCH, QUERY_GLYPH).color(t.muted_foreground))
		.child(field);
	let tabs = row()
		.w_full()
		.h(TAB_ROW)
		.padding(crate::primitives::equal_padding(TAB_ROW, TAB_HEIGHT))
		.center_y()
		.child(tab_strip(look, p.tab, emit));
	let mut body = col().w_full().grow(1.0).padding(BODY_INSET).gap(LIST_GAP).clip_rounded(0.0);
	for section in &sections {
		let list = col().w_full().gap(LIST_GAP).role("listbox").children(
			section.hits.iter().map(|hit| result_row(look, hit, p.active == Some(hit.id), emit)),
		);
		body = body.child(match &section.head {
			Some(head) => {
				col().w_full().gap(LIST_GAP).child(section_head(look, head, emit)).child(list)
			}
			None => list,
		});
	}
	if is_skeleton {
		body = body.child(results_skeleton(look, is_rest && p.tab == SearchTab::All));
	}
	if let Some(panel) = panel_of(look, p, query, is_shown, is_skeleton) {
		body = body.justify_center().child(panel);
	}
	let surface = col()
		.key("search-palette")
		.w(PALETTE_WIDTH)
		.h(PALETTE_HEIGHT)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.clip_rounded(RADIUS_2XL)
		.role("dialog")
		.label(label)
		.child(query_line)
		.child(hairline(t))
		.child(tabs)
		.child(body);
	elevated(t, surface)
}
