use rune::{
	Cursor, Drag, El, Icon, Key, KeyEvent, Phase, PointerButton, TextStyle, Tx, el, icon, row, text,
};

use super::tab_chip::{ChipPlacement, tab_chip};
use super::window_controls::{WindowControls, window_controls};
use super::{ChromeEvent, Emit, copy, lifted_shadow, reaching};
use crate::avatar::Face;
use crate::icons;
use crate::primitives::{DISABLED_OPACITY, instant};
use crate::strings::Language;
use crate::strings::common::library::editor::UNTITLED;
use crate::strings::common::title_bar as copy_keys;
use crate::tokens::{RADIUS_MD, RADIUS_SM, SPACING, TEXT_COMPACT_MEDIUM, TEXT_XS_MEDIUM, Tokens};

pub const TAB_HEIGHT: f32 = SPACING * 7.0;
pub const ICON_SLOT: f32 = SPACING * 4.0;
pub const TAB_TITLE: TextStyle = TextStyle { line_height: SPACING * 4.0, ..TEXT_COMPACT_MEDIUM };

const GLYPH: f32 = SPACING * 3.75;
const BAR_HEIGHT: f32 = SPACING * 10.0;
const BAR_START: f32 = SPACING * 3.5;
const BAR_END: f32 = SPACING * 2.0;
const BAR_GAP: f32 = SPACING * 2.0;
const TRAFFIC_LIGHTS: f32 = SPACING * 14.25;
const CAPTION_ROW: f32 = SPACING * 11.5 * 3.0;
const STRIP_GAP: f32 = SPACING;
const HISTORY_GAP: f32 = SPACING * 0.5;
const HISTORY_END: f32 = SPACING;
const HISTORY: f32 = TAB_HEIGHT * 2.0 + HISTORY_GAP + HISTORY_END;
const ROW_GAP: f32 = SPACING;
const TAB_WIDTH: f32 = SPACING * 44.0;
const TAB_FLOOR: f32 = SPACING * 26.0;
const TAB_START: f32 = SPACING * 2.0;
const TAB_END: f32 = SPACING * 7.25;
const DIVIDER_HEIGHT: f32 = SPACING * 4.0;
const CLOSE: f32 = SPACING * 4.5;
const CLOSE_END: f32 = SPACING * 1.25;
const CLOSE_RADIUS: f32 = SPACING * 1.25;
const CLOSE_GLYPH: f32 = SPACING * 3.0;
const NEEDS_YOU: f32 = SPACING * 3.25;
const NEEDS_YOU_MARK: TextStyle =
	TextStyle { line_height: SPACING * 3.0, ..TextStyle::new(9.0, 700.0) };
const DRAG_REGION: f32 = SPACING * 6.0;
const OVERFLOW_CHIP: f32 = SPACING * 17.0;
const OVERFLOW_GLYPH: f32 = SPACING * 3.0;
const FOCUS_RING: f32 = 2.0;
const FOCUS_OFFSET: f32 = 1.0;
const LIFT_SLOP: f32 = 4.0;

#[derive(Clone, Copy, Debug)]
pub enum TabIcon<'a> {
	Glyph(&'static Icon),
	Agent(&'a str),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TabTitle<'a> {
	Plain(&'a str),
	Document(&'a str),
}

impl TabTitle<'_> {
	pub fn display(self, language: Language) -> String {
		match self {
			TabTitle::Plain(title) => title.to_owned(),
			TabTitle::Document(name) if name.trim().is_empty() => {
				UNTITLED.text(language).to_owned()
			}
			TabTitle::Document(name) => name.to_owned(),
		}
	}
}

#[derive(Clone, Copy, Debug)]
pub struct ChromeTab<'a> {
	pub id: &'a str,
	pub title: TabTitle<'a>,
	pub icon: TabIcon<'a>,
	pub is_pinned: bool,
	pub is_needing_you: bool,
}

impl<'a> ChromeTab<'a> {
	pub const fn new(id: &'a str, title: &'a str, glyph: &'static Icon) -> ChromeTab<'a> {
		ChromeTab {
			id,
			title: TabTitle::Plain(title),
			icon: TabIcon::Glyph(glyph),
			is_pinned: false,
			is_needing_you: false,
		}
	}

	pub const fn pinned(self) -> ChromeTab<'a> {
		ChromeTab { is_pinned: true, ..self }
	}

	pub const fn needing_you(self) -> ChromeTab<'a> {
		ChromeTab { is_needing_you: true, ..self }
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Landing {
	Slot(usize),
	TornOff,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Lift {
	pub id: String,
	pub dx: f32,
	pub landing: Landing,
}

#[derive(Clone, Copy, Debug)]
pub struct Incoming<'a> {
	pub tab: ChromeTab<'a>,
	pub x: f32,
}

pub struct TitleBar<'a> {
	pub width: f32,
	pub language: Language,
	pub tabs: &'a [ChromeTab<'a>],
	pub active: Option<&'a str>,
	pub can_go_back: bool,
	pub can_go_forward: bool,
	pub can_reorder: bool,
	pub traffic_lights: bool,
	pub window_controls: Option<WindowControls>,
	pub lift: Option<&'a Lift>,
	pub revealed_close: Option<&'a str>,
	pub incoming: Option<Incoming<'a>>,
	pub overflow_open: bool,
}

pub(super) struct Strip<'a> {
	pub pinned: Vec<ChromeTab<'a>>,
	pub kept: Vec<ChromeTab<'a>>,
	pub overflowing: Vec<ChromeTab<'a>>,
	pub tab_width: f32,
	pub row_left: f32,
}

impl<'a> Strip<'a> {
	pub fn of(bar: &TitleBar<'a>) -> Strip<'a> {
		let pinned: Vec<ChromeTab> = bar.tabs.iter().copied().filter(|tab| tab.is_pinned).collect();
		let unpinned: Vec<ChromeTab> =
			bar.tabs.iter().copied().filter(|tab| !tab.is_pinned).collect();
		let leading = if bar.traffic_lights { TRAFFIC_LIGHTS + BAR_GAP } else { 0.0 };
		let trailing = match bar.window_controls {
			Some(_) => CAPTION_ROW + BAR_GAP,
			None => BAR_END,
		};
		let strip = bar.width - BAR_START - leading - trailing;
		let divider = if pinned.is_empty() || unpinned.is_empty() { 0.0 } else { 1.0 + ROW_GAP };
		let pinned_room = pinned.len() as f32 * (TAB_HEIGHT + ROW_GAP) + divider;
		let room = strip
			- DRAG_REGION
			- STRIP_GAP
			- (HISTORY + STRIP_GAP)
			- (TAB_HEIGHT + STRIP_GAP)
			- pinned_room;
		let row_left = BAR_START + leading + HISTORY + STRIP_GAP;
		let count = unpinned.len();
		if fitting(room) >= count {
			let shared = (room - count.saturating_sub(1) as f32 * ROW_GAP) / count.max(1) as f32;
			let tab_width = shared.clamp(TAB_FLOOR, TAB_WIDTH);
			return Strip { pinned, kept: unpinned, overflowing: Vec::new(), tab_width, row_left };
		}
		let fit = fitting(room - OVERFLOW_CHIP - STRIP_GAP).max(1);
		let mut kept: Vec<ChromeTab> = unpinned.iter().copied().take(fit).collect();
		let active = unpinned.iter().find(|tab| Some(tab.id) == bar.active);
		if let Some(active) = active
			&& !kept.iter().any(|tab| tab.id == active.id)
		{
			kept.pop();
			kept.push(*active);
		}
		let overflowing =
			unpinned.into_iter().filter(|tab| !kept.iter().any(|k| k.id == tab.id)).collect();
		Strip { pinned, kept, overflowing, tab_width: TAB_FLOOR, row_left }
	}

	fn unpinned_start(&self) -> f32 {
		let divider =
			if self.pinned.is_empty() || self.kept.is_empty() { 0.0 } else { 1.0 + ROW_GAP };
		self.pinned.len() as f32 * (TAB_HEIGHT + ROW_GAP) + divider
	}

	fn step(&self, pinned: bool) -> f32 {
		if pinned { TAB_HEIGHT + ROW_GAP } else { self.tab_width + ROW_GAP }
	}

	fn zone_bounds(&self, pinned: bool) -> (f32, f32) {
		let start = if pinned { 0.0 } else { self.unpinned_start() };
		(start, start + self.zone(pinned).len() as f32 * self.step(pinned) - ROW_GAP)
	}

	fn zone(&self, pinned: bool) -> &[ChromeTab<'a>] {
		if pinned { &self.pinned } else { &self.kept }
	}

	fn left_of(&self, tab: &ChromeTab, rank: usize) -> f32 {
		let start = if tab.is_pinned { 0.0 } else { self.unpinned_start() };
		start + rank as f32 * self.step(tab.is_pinned)
	}

	fn incoming_slot(&self, x: f32) -> usize {
		let start = self.unpinned_start();
		let at = x - self.row_left;
		(0..=self.kept.len())
			.min_by(|&a, &b| {
				let distance = |slot: usize| (start + slot as f32 * self.step(false) - at).abs();
				distance(a).total_cmp(&distance(b))
			})
			.unwrap_or(0)
	}
}

fn fitting(room: f32) -> usize {
	((room + ROW_GAP) / (TAB_FLOOR + ROW_GAP)).floor().max(0.0) as usize
}

pub fn incoming_index(bar: &TitleBar) -> Option<usize> {
	let incoming = bar.incoming?;
	let strip = Strip::of(bar);
	let slot = strip.incoming_slot(incoming.x);
	Some(match slot.checked_sub(1).and_then(|before| strip.kept.get(before)) {
		Some(before) => bar.tabs.iter().position(|tab| tab.id == before.id).map_or(0, |at| at + 1),
		None => strip.pinned.len(),
	})
}

pub(super) fn tab_icon(t: &Tokens, glyph: TabIcon) -> El {
	match glyph {
		TabIcon::Glyph(glyph) => icon(glyph, GLYPH).color(t.foreground),
		TabIcon::Agent(name) => Face::still(name, None).draw(ICON_SLOT, t),
	}
}

pub fn title_bar<S: 'static>(t: &Tokens, bar: &TitleBar, emit: Emit<S>) -> El {
	let strip = Strip::of(bar);
	let end = if bar.window_controls.is_some() { 0.0 } else { BAR_END };
	let mut title_bar = row()
		.key("app-title-bar")
		.w_full()
		.h(BAR_HEIGHT)
		.pl(BAR_START)
		.pr(end)
		.gap(BAR_GAP)
		.center_y()
		.fill(t.background)
		.window_drag();
	if bar.traffic_lights {
		title_bar = title_bar.child(el().w(TRAFFIC_LIGHTS).h_full());
	}
	title_bar = title_bar.child(tab_strip(t, bar, &strip, emit));
	match bar.window_controls {
		Some(controls) => title_bar.child(window_controls(t, bar.language, controls, emit)),
		None => title_bar,
	}
}

fn tab_strip<S: 'static>(t: &Tokens, bar: &TitleBar, strip: &Strip, emit: Emit<S>) -> El {
	let language = bar.language;
	let history = row().gap(HISTORY_GAP).pr(HISTORY_END).center_y().children([
		bar_button(
			t,
			"title-bar-back",
			&icons::PREVIOUS,
			copy_keys::BACK.text(language),
			bar.can_go_back,
			move |s: &mut S| emit(s, ChromeEvent::GoBack),
		),
		bar_button(
			t,
			"title-bar-forward",
			&icons::NEXT,
			copy_keys::FORWARD.text(language),
			bar.can_go_forward,
			move |s: &mut S| emit(s, ChromeEvent::GoForward),
		),
	]);
	let mut tab_strip = row()
		.grow(1.0)
		.shrink()
		.h_full()
		.gap(STRIP_GAP)
		.center_y()
		.child(history)
		.child(tab_row(t, bar, strip, emit));
	if !strip.overflowing.is_empty() {
		tab_strip = tab_strip.child(overflow_chip(t, bar, strip.overflowing.len(), emit));
	}
	tab_strip
		.child(bar_button(
			t,
			"title-bar-new-tab",
			&icons::PLUS,
			copy_keys::NEW_TAB.text(language),
			true,
			move |s: &mut S| emit(s, ChromeEvent::NewTab),
		))
		.child(el().grow(1.0).min_w(DRAG_REGION).h_full())
}

fn bar_button<S: 'static>(
	t: &Tokens,
	key: &str,
	glyph: &'static Icon,
	label: &str,
	is_enabled: bool,
	on_press: impl Fn(&mut S) + 'static,
) -> El {
	let button = row()
		.key(key)
		.size(TAB_HEIGHT, TAB_HEIGHT)
		.radius(RADIUS_SM)
		.center()
		.role("button")
		.label(label)
		.child(icon(glyph, GLYPH).color(t.muted_foreground).group_color(t.foreground));
	if !is_enabled {
		return button.disabled(true).opacity(DISABLED_OPACITY);
	}
	focusable(instant(button.hover(t.title_bar_highlight).hover_group()), t).on_press(on_press)
}

fn focusable(control: El, t: &Tokens) -> El {
	control.focusable(true).cursor(Cursor::Default).focus_ring(
		FOCUS_RING,
		FOCUS_OFFSET,
		t.foreground,
	)
}

fn overflow_chip<S: 'static>(t: &Tokens, bar: &TitleBar, count: usize, emit: Emit<S>) -> El {
	let fill = if bar.overflow_open { t.rail_item_selected } else { t.title_bar_chip };
	let label = copy(copy_keys::MORE, bar.language, &[("count", &count.to_string())]);
	let chip = row()
		.key("title-bar-overflow")
		.h(TAB_HEIGHT)
		.pl(SPACING * 2.0)
		.pr(SPACING * 1.5)
		.gap(SPACING)
		.radius(RADIUS_MD)
		.center_y()
		.fill(fill)
		.role("button")
		.label(label.clone())
		.child(text(label).font(TEXT_XS_MEDIUM).color(t.foreground))
		.child(icon(&icons::CHEVRON_DOWN, OVERFLOW_GLYPH).color(t.foreground));
	let chip = if bar.overflow_open {
		chip
	} else {
		chip.hover(reaching(t.title_bar_chip, t.rail_item_selected))
	};
	focusable(instant(chip.hover_group()), t)
		.on_press(move |s: &mut S| emit(s, ChromeEvent::OpenOverflow))
}

fn tab_row<S: 'static>(t: &Tokens, bar: &TitleBar, strip: &Strip, emit: Emit<S>) -> El {
	let incoming_slot = bar.incoming.map(|incoming| strip.incoming_slot(incoming.x));
	let lifted = bar
		.lift
		.and_then(|lift| bar.tabs.iter().find(|tab| tab.id == lift.id).map(|tab| (tab, lift)));
	let row_rank_of = |tab: &ChromeTab, rank: usize| {
		if tab.is_pinned { rank } else { strip.pinned.len() + rank }
	};
	let lifted_row_rank = lifted.and_then(|(tab, _)| {
		strip
			.zone(tab.is_pinned)
			.iter()
			.position(|other| other.id == tab.id)
			.map(|rank| row_rank_of(tab, rank))
	});
	let shift_of = |tab: &ChromeTab, rank: usize| -> f32 {
		let Some((held, lift)) = lifted else {
			return match incoming_slot {
				Some(slot) if !tab.is_pinned && rank >= slot => strip.step(false),
				_ => 0.0,
			};
		};
		if held.id == tab.id {
			return 0.0;
		}
		match lift.landing {
			Landing::TornOff => match lifted_row_rank {
				Some(from) if row_rank_of(tab, rank) > from => -strip.step(held.is_pinned),
				_ => 0.0,
			},
			Landing::Slot(slot) if held.is_pinned == tab.is_pinned => {
				let from = strip.zone(tab.is_pinned).iter().position(|other| other.id == held.id);
				match from {
					Some(from) if from < rank && rank <= slot => -strip.step(tab.is_pinned),
					Some(from) if slot <= rank && rank < from => strip.step(tab.is_pinned),
					_ => 0.0,
				}
			}
			Landing::Slot(_) => 0.0,
		}
	};
	let divider_shift = match lifted {
		Some((held, lift)) if held.is_pinned && lift.landing == Landing::TornOff => {
			-strip.step(true)
		}
		_ => 0.0,
	};
	let mut tabs: Vec<El> = Vec::new();
	for (rank, tab) in strip.pinned.iter().enumerate() {
		tabs.push(tab_view(t, bar, strip, tab, rank, shift_of(tab, rank), emit));
	}
	if !strip.pinned.is_empty() && !strip.kept.is_empty() {
		tabs.push(
			el().w(1.0).h(DIVIDER_HEIGHT).fill(t.title_bar_divider).offset(divider_shift, 0.0),
		);
	}
	for (rank, tab) in strip.kept.iter().enumerate() {
		tabs.push(tab_view(t, bar, strip, tab, rank, shift_of(tab, rank), emit));
	}
	let tab_list = row()
		.key("title-bar-tablist")
		.gap(ROW_GAP)
		.center_y()
		.role("tablist")
		.label(copy_keys::TABS.text(bar.language))
		.children(tabs);
	let mut tab_row = row().h(TAB_HEIGHT).child(tab_list);
	if let (Some(incoming), Some(slot)) = (bar.incoming, incoming_slot) {
		let left = strip.unpinned_start() + slot as f32 * strip.step(false);
		tab_row = tab_row.child(
			tab_chip(
				t,
				&incoming.tab.title.display(bar.language),
				incoming.tab.icon,
				ChipPlacement::Strip,
				false,
			)
			.w(strip.tab_width)
			.absolute(left, 0.0)
			.raise(),
		);
	}
	tab_row
}

fn tab_view<S: 'static>(
	t: &Tokens,
	bar: &TitleBar,
	strip: &Strip,
	tab: &ChromeTab,
	rank: usize,
	shift: f32,
	emit: Emit<S>,
) -> El {
	let language = bar.language;
	let is_active = bar.active == Some(tab.id);
	let lift = bar.lift.filter(|lift| lift.id == tab.id);
	let is_needing_you = tab.is_needing_you && !is_active;
	let title = tab.title.display(language);
	let label = if is_needing_you {
		copy(copy_keys::TAB_NEEDS_YOU, language, &[("title", &title)])
	} else {
		title.clone()
	};
	let width = if tab.is_pinned { TAB_HEIGHT } else { strip.tab_width };
	let left = strip.left_of(tab, rank);
	let mut view = row()
		.key(format!("tab-{}", tab.id))
		.w(width)
		.h(TAB_HEIGHT)
		.radius(RADIUS_MD)
		.center_y()
		.role("tab")
		.label(label)
		.checked(is_active)
		.child(row().size(ICON_SLOT, ICON_SLOT).center().child(tab_icon(t, tab.icon)));
	if tab.is_pinned {
		view = view.justify_center();
	} else {
		view = view.pl(TAB_START).pr(TAB_END).gap(SPACING * 1.5);
		if is_needing_you {
			view = view.child(needs_you(t));
		}
		let ink = if is_needing_you { t.warning } else { t.foreground };
		view = view.child(text(title.clone()).font(TAB_TITLE).color(ink).truncate().shrink());
		let shows_close = lift.is_none() && (is_active || bar.lift.is_none());
		if shows_close {
			let is_shown = is_active || bar.revealed_close == Some(tab.id);
			view = view.child(close_button(t, language, tab.id, &title, is_shown, emit));
		}
	}
	let rest = if tab.is_pinned { t.title_bar_pinned } else { t.title_bar_tab };
	view = match lift {
		Some(lift) => {
			let (start, end) = strip.zone_bounds(tab.is_pinned);
			let dx = lift.dx.clamp(start - left, end - left - width);
			let view =
				view.fill(t.title_bar_menu).box_shadow(lifted_shadow()).raise().offset(dx, 0.0);
			if lift.landing == Landing::TornOff { view.opacity(0.0) } else { view }
		}
		None if is_active => view.fill(t.title_bar_tab_selected).offset(shift, 0.0),
		None => view.fill(rest).hover(reaching(rest, t.title_bar_tab_hover)).offset(shift, 0.0),
	};
	let view = focusable(instant(view.hover_group()), t);
	gestures(view, bar, strip, tab, rank, lift.is_some(), emit)
}

fn needs_you(t: &Tokens) -> El {
	row()
		.size(NEEDS_YOU, NEEDS_YOU)
		.radius(NEEDS_YOU / 2.0)
		.center()
		.fill(t.warning)
		.child(text("?".to_owned()).font(NEEDS_YOU_MARK).color(t.warning_foreground))
}

fn close_button<S: 'static>(
	t: &Tokens,
	language: Language,
	id: &str,
	title: &str,
	is_shown: bool,
	emit: Emit<S>,
) -> El {
	let id = id.to_owned();
	let button = row()
		.key(format!("tab-close-{id}"))
		.size(CLOSE, CLOSE)
		.radius(CLOSE_RADIUS)
		.center()
		.role("button")
		.label(copy(copy_keys::CLOSE_TAB_NAMED, language, &[("title", title)]))
		.hover(t.title_bar_highlight)
		.child(icon(&icons::CLOSE, CLOSE_GLYPH).color(t.muted_foreground).group_color(t.foreground))
		.on_press(move |s: &mut S| emit(s, ChromeEvent::CloseTab(id.clone())));
	let slot = el().pin(None, Some((TAB_HEIGHT - CLOSE) / 2.0), Some(CLOSE_END), None);
	let slot = slot.child(focusable(instant(button.hover_group()), t));
	if is_shown { slot } else { slot.group_opacity(0.0, 1.0) }
}

#[derive(Clone)]
struct Slide {
	ids: Vec<String>,
	zone: Vec<String>,
	id: String,
	rank: usize,
	step: f32,
	height: f32,
}

impl Slide {
	fn landing(&self, drag: &Drag) -> Landing {
		let y = drag.start_y + drag.dy;
		if y < -self.height || y > self.height * 2.0 {
			return Landing::TornOff;
		}
		let moved = (drag.dx / self.step).round() as isize;
		let last = self.zone.len().saturating_sub(1) as isize;
		Landing::Slot((self.rank as isize + moved).clamp(0, last) as usize)
	}

	fn reordered(&self, at: usize) -> Vec<String> {
		reordered_ids(&self.ids, &self.zone, &self.id, at)
	}
}

pub(super) fn reordered_ids(ids: &[String], zone: &[String], id: &str, at: usize) -> Vec<String> {
	let others: Vec<&String> = zone.iter().filter(|held| *held != id).collect();
	let mut ids: Vec<String> = ids.iter().filter(|held| *held != id).cloned().collect();
	let anchor = match at.checked_sub(1) {
		Some(before) => ids.iter().position(|held| held == others[before]).map_or(0, |at| at + 1),
		None => {
			others.first().and_then(|first| ids.iter().position(|held| held == *first)).unwrap_or(0)
		}
	};
	ids.insert(anchor, id.to_owned());
	ids
}

fn gestures<S: 'static>(
	view: El,
	bar: &TitleBar,
	strip: &Strip,
	tab: &ChromeTab,
	rank: usize,
	is_lifted: bool,
	emit: Emit<S>,
) -> El {
	let id = tab.id.to_owned();
	let is_pinned = tab.is_pinned;
	let (select, menu) = (id.clone(), id.clone());
	let view = view
		.pointer_buttons([PointerButton::Middle])
		.on_press_tx(move |s: &mut S, tx: &mut Tx| match tx.button() {
			PointerButton::Middle if !is_pinned => emit(s, ChromeEvent::CloseTab(select.clone())),
			PointerButton::Middle => {}
			_ if is_lifted => {}
			_ => emit(s, ChromeEvent::SelectTab(select.clone())),
		})
		.on_secondary_press(move |s: &mut S, at, _: &mut Tx| {
			emit(s, ChromeEvent::OpenTabMenu { id: menu.clone(), at: (at.x, at.y) })
		});
	let zone: Vec<String> = strip.zone(is_pinned).iter().map(|tab| tab.id.to_owned()).collect();
	let slide = Slide {
		ids: bar.tabs.iter().map(|tab| tab.id.to_owned()).collect(),
		zone,
		id: id.clone(),
		rank,
		step: strip.step(is_pinned),
		height: TAB_HEIGHT,
	};
	let moved_title = tab.title.display(bar.language);
	let position_offset = if is_pinned { 0 } else { strip.pinned.len() };
	let count = strip.pinned.len() + strip.kept.len();
	let keyed = slide.clone();
	let can_reorder = bar.can_reorder;
	let can_reveal = !is_pinned && bar.lift.is_none();
	let tab_key = format!("tab-{id}");
	let close_key = format!("tab-close-{id}");
	let view = if can_reorder {
		view.on_drag(move |s: &mut S, drag: &mut Drag, tx: &mut Tx| {
			if tx.button() != PointerButton::Primary {
				return;
			}
			let is_held = is_lifted || drag.dx.hypot(drag.dy) >= LIFT_SLOP;
			if !is_held {
				return;
			}
			let landing = slide.landing(drag);
			match drag.phase {
				Phase::Down => {}
				Phase::Move => emit(
					s,
					ChromeEvent::LiftMoved(Lift { id: slide.id.clone(), dx: drag.dx, landing }),
				),
				Phase::Up => {
					emit(s, ChromeEvent::LiftEnded(slide.id.clone()));
					if drag.cancelled() {
						return;
					}
					match landing {
						Landing::TornOff => emit(
							s,
							ChromeEvent::TearOffTab {
								id: slide.id.clone(),
								travel: (drag.dx, drag.dy),
							},
						),
						Landing::Slot(at) if at != slide.rank => {
							emit(s, ChromeEvent::ReorderTabs(slide.reordered(at)))
						}
						Landing::Slot(_) => {}
					}
				}
			}
		})
	} else {
		view
	};
	view.on_key(move |s: &mut S, event: &KeyEvent, tx: &mut Tx| {
		let plain = !(event.mods.alt || event.mods.cmd || event.mods.ctrl);
		if tx.focused() == Some(close_key.as_str()) {
			match event.key {
				Key::Enter if plain => {
					emit(s, ChromeEvent::CloseTab(keyed.id.clone()));
					return true;
				}
				Key::Tab if plain => emit(s, ChromeEvent::RevealClose(None)),
				_ => {}
			}
			return false;
		}
		if tx.focused() != Some(tab_key.as_str()) {
			return false;
		}
		if event.key == Key::Tab && plain && !event.mods.shift && can_reveal {
			emit(s, ChromeEvent::RevealClose(Some(keyed.id.clone())));
			return false;
		}
		if !can_reorder {
			return false;
		}
		let step: isize = match (&event.key, event.mods) {
			(Key::Left, mods) if mods.alt && !mods.cmd && !mods.ctrl && !mods.shift => -1,
			(Key::Right, mods) if mods.alt && !mods.cmd && !mods.ctrl && !mods.shift => 1,
			_ => return false,
		};
		let to = keyed.rank as isize + step;
		if to < 0 || to as usize >= keyed.zone.len() {
			return true;
		}
		let to = to as usize;
		emit(s, ChromeEvent::ReorderTabs(keyed.reordered(to)));
		emit(
			s,
			ChromeEvent::AnnounceMove {
				title: moved_title.clone(),
				position: position_offset + to + 1,
				count,
			},
		);
		true
	})
}
