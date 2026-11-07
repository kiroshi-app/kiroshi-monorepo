use rune::{Cursor, El, Icon, col, el, icon, row, text};

use super::agent::Identity;
use super::parts::{PANEL_GAP, PANEL_INSET, ROW_GLYPH, SMALL_GLYPH, rule};
use super::{Event, Host, say};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::scrim;
use crate::primitives::{FOCUS_RING_WIDTH, elevated, equal_padding, instant, ring_tint, tight};
use crate::strings::bots::dialog;
use crate::strings::common;
use crate::strings::settings::screen;
use crate::tokens::{
	RADIUS_LG, RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_XS,
	TEXT_XS_MEDIUM, Tokens,
};

pub const MENU_DEFAULT_WIDTH: f32 = SPACING * 76.0;
const RAIL_WIDTH: f32 = SPACING * 52.0;
const RAIL_INSET: f32 = SPACING * 2.0;
const RAIL_ROW: f32 = SPACING * 9.0;
const DIALOG_WIDTH: f32 = SPACING * 208.0;
const DIALOG_HEIGHT: f32 = SPACING * 136.0;
const DIALOG_RADIUS: f32 = SPACING * 6.0;
const DIALOG_HEADER: f32 = SPACING * 16.0;
const DIALOG_AVATAR: f32 = SPACING * 8.0;
const MENU_AVATAR: f32 = SPACING * 9.0;
const MENU_TOP: f32 = SPACING * 2.0;
const MENU_FOOT: f32 = SPACING * 3.0;
const BACK_ROW: f32 = SPACING * 8.0;
const PAGE_HEADER: f32 = SPACING * 12.0;
const FORM_MEASURE: f32 = SPACING * 200.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
	General,
	Appearance,
	Instructions,
	Skills,
	Applications,
	Secrets,
	History,
	Approvals,
	Runtime,
	Danger,
}

impl Entry {
	pub const MENU: [Entry; 9] = [
		Entry::General,
		Entry::Appearance,
		Entry::Instructions,
		Entry::Skills,
		Entry::Applications,
		Entry::Secrets,
		Entry::History,
		Entry::Approvals,
		Entry::Runtime,
	];

	pub fn label(self) -> &'static str {
		say(match self {
			Entry::General => dialog::tab::GENERAL,
			Entry::Appearance => dialog::tab::APPEARANCE,
			Entry::Instructions => dialog::tab::INSTRUCTIONS,
			Entry::Skills => dialog::tab::SKILLS,
			Entry::Applications => dialog::tab::APPLICATIONS,
			Entry::Secrets => dialog::tab::SECRETS,
			Entry::History => dialog::tab::HISTORY,
			Entry::Approvals => dialog::tab::APPROVALS,
			Entry::Runtime => dialog::tab::RUNTIME,
			Entry::Danger => dialog::tab::DANGER,
		})
	}

	fn glyphs(self) -> (&'static Icon, &'static Icon) {
		match self {
			Entry::General => (&icons::SETTINGS, &icons::SETTINGS_FILL),
			Entry::Appearance => (&icons::IMAGE, &icons::IMAGE_FILL),
			Entry::Instructions => (&icons::BOOK_OPEN, &icons::BOOK_OPEN_FILL),
			Entry::Skills => (&icons::SPARKLES, &icons::SPARKLES_FILL),
			Entry::Applications => (&icons::SERVER, &icons::SERVER_FILL),
			Entry::Secrets => (&icons::CODE, &icons::CODE_FILL),
			Entry::History => (&icons::HISTORY, &icons::HISTORY_FILL),
			Entry::Approvals => (&icons::SHIELD, &icons::SHIELD_FILL),
			Entry::Runtime => (&icons::TERMINAL, &icons::TERMINAL_FILL),
			Entry::Danger => (&icons::TRIANGLE_ALERT, &icons::TRIANGLE_ALERT_FILL),
		}
	}

	pub fn is_list(self) -> bool {
		matches!(self, Entry::Skills | Entry::Applications | Entry::History | Entry::Approvals)
	}
}

pub struct RailItem<'a> {
	pub glyphs: (&'static Icon, &'static Icon),
	pub label: &'a str,
	pub active: bool,
	pub danger: bool,
	pub event: Event,
}

impl RailItem<'_> {
	pub fn entry(entry: Entry, current: Entry) -> RailItem<'static> {
		RailItem {
			glyphs: entry.glyphs(),
			label: entry.label(),
			active: entry == current,
			danger: entry == Entry::Danger,
			event: Event::Entry(entry),
		}
	}

	pub fn view<S: Host>(self, t: &Tokens) -> El {
		let (rest_ink, active_fill, active_ink) = if self.danger {
			(t.destructive, t.destructive_tint, t.destructive_tint_foreground)
		} else {
			(t.muted_foreground, t.muted, t.foreground)
		};
		let (glyph, ink, fill) = if self.active {
			(self.glyphs.1, active_ink, active_fill)
		} else {
			(self.glyphs.0, rest_ink, t.background.alpha(0.0))
		};
		let style = tight(if self.active { TEXT_SM_MEDIUM } else { TEXT_SM });
		let event = self.event;
		let item = row()
			.key(format!("rail-{}", self.label))
			.w_full()
			.padding(equal_padding(RAIL_ROW, ROW_GLYPH))
			.gap(SPACING * 2.5)
			.radius(RADIUS_XL)
			.fill(fill)
			.hover(active_fill)
			.center_y()
			.role("tab")
			.label(self.label)
			.checked(self.active)
			.child(icon(glyph, ROW_GLYPH).color(ink).group_color(active_ink))
			.child(
				text(self.label.to_owned())
					.font(style)
					.color(ink)
					.group_color(active_ink)
					.truncate_head(),
			);
		instant(item.hover_group())
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
			.on_press(move |s: &mut S| s.emit(event.clone()))
	}
}

fn rail(t: &Tokens, leading: Option<El>, items: Vec<El>) -> El {
	col()
		.w(RAIL_WIDTH)
		.h_full()
		.padding(RAIL_INSET)
		.gap(SPACING)
		.role("tablist")
		.children(leading)
		.children(items)
		.child(el().w(1.0).h_full().fill(t.border).absolute(RAIL_WIDTH - 1.0, 0.0))
}

pub fn pushed<S: Host>(t: &Tokens, back: &str, items: Vec<El>, body: El) -> El {
	let back_item = RailItem {
		glyphs: (&icons::PREVIOUS, &icons::PREVIOUS),
		label: back,
		active: false,
		danger: false,
		event: Event::Back,
	}
	.view::<S>(t);
	row()
		.w_full()
		.grow(1.0)
		.h_full()
		.child(rail(t, Some(col().w_full().gap(SPACING).child(back_item).child(rule(t))), items))
		.child(col().grow(1.0).h_full().child(body))
}

pub fn scrolling_panel(body: El) -> El {
	col().w_full().grow(1.0).h_full().padding(PANEL_INSET).gap(PANEL_GAP).child(body)
}

pub struct Frame<'a> {
	pub identity: Identity<'a>,
	pub has_history: bool,
}

pub fn dialog<S: Host>(t: &Tokens, frame: &Frame, entry: Entry, body: El) -> El {
	let name = frame.identity.name;
	let close = Button::icon(&icons::CLOSE, say(common::dialog::CLOSE))
		.variant(ButtonVariant::Secondary)
		.size(ButtonSize::IconSm)
		.view(t)
		.on_press(|s: &mut S| s.emit(Event::Close));
	let header = row()
		.w_full()
		.h(DIALOG_HEADER)
		.padding(SPACING * 4.0)
		.gap(SPACING * 2.5)
		.center_y()
		.child(frame.identity.avatar(t, DIALOG_AVATAR))
		.child(
			row()
				.grow(1.0)
				.gap(SPACING * 1.5)
				.center_y()
				.role("heading")
				.child(text(name.to_owned()).font(TEXT_SM_SEMIBOLD).color(t.foreground).truncate())
				.child(icon(&icons::NEXT, SMALL_GLYPH).color(t.muted_foreground))
				.child(
					text(say(dialog::BREADCRUMB)).font(TEXT_SM_SEMIBOLD).color(t.muted_foreground),
				),
		)
		.child(close);
	let items = Entry::MENU
		.into_iter()
		.filter(|item| frame.has_history || *item != Entry::History)
		.map(|item| RailItem::entry(item, entry).view::<S>(t))
		.chain([
			rule(t).mx(SPACING).my(SPACING),
			RailItem::entry(Entry::Danger, entry).view::<S>(t),
		])
		.collect();
	let surface = col()
		.key("agent-settings-dialog")
		.w(DIALOG_WIDTH)
		.h(DIALOG_HEIGHT)
		.radius(DIALOG_RADIUS)
		.fill(t.popover)
		.clip_rounded(DIALOG_RADIUS)
		.role("dialog")
		.label(name)
		.child(header)
		.child(rule(t))
		.child(row().w_full().grow(1.0).child(rail(t, None, items)).child(body));
	el().absolute(0.0, 0.0).w_full().h_full().child(scrim(t)).child(
		el().absolute(0.0, 0.0)
			.w_full()
			.h_full()
			.center()
			.modal(true, |s: &mut S| s.emit(Event::Close))
			.child(elevated(t, surface)),
	)
}

pub struct Menu<'a> {
	pub back: &'a str,
	pub identity: Identity<'a>,
	pub width: f32,
	pub has_history: bool,
}

impl Menu<'_> {
	pub fn back_to_agents() -> &'static str {
		say(screen::BACK_TO_AGENTS)
	}

	pub fn back_to_conversations() -> &'static str {
		say(screen::BACK)
	}
}

fn menu<S: Host>(t: &Tokens, menu: &Menu, entry: Entry) -> El {
	let back = row()
		.key("settings-back")
		.w_full()
		.h(BACK_ROW)
		.padding(equal_padding(BACK_ROW, ROW_GLYPH))
		.gap(SPACING * 1.5)
		.radius(RADIUS_LG)
		.hover(t.sidebar_accent)
		.center_y()
		.role("button")
		.label(menu.back)
		.child(icon(&icons::PREVIOUS, ROW_GLYPH).color(t.sidebar_foreground))
		.child(text(menu.back.to_owned()).font(tight(TEXT_SM_MEDIUM)).color(t.sidebar_foreground));
	let back = instant(back)
		.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.5))
		.on_press(|s: &mut S| s.emit(Event::Back));
	let subject = row()
		.w_full()
		.padding(RAIL_INSET)
		.gap(SPACING * 2.5)
		.center_y()
		.child(menu.identity.avatar(t, MENU_AVATAR))
		.child(
			col()
				.grow(1.0)
				.gap(SPACING * 0.5)
				.child(
					text(menu.identity.name.to_owned())
						.font(TEXT_SM_SEMIBOLD)
						.color(t.sidebar_foreground)
						.truncate(),
				)
				.child(text(say(screen::subtitle::AGENT)).font(TEXT_XS).color(t.muted_foreground)),
		);
	let entries = Entry::MENU
		.into_iter()
		.filter(|item| menu.has_history || *item != Entry::History)
		.map(|item| RailItem::entry(item, entry).view::<S>(t));
	col()
		.w(menu.width)
		.h_full()
		.pt(MENU_TOP)
		.pb(MENU_FOOT)
		.px(RAIL_INSET)
		.gap(RAIL_INSET)
		.fill(t.sidebar)
		.role("navigation")
		.label(say(screen::MENU))
		.child(back)
		.child(subject)
		.child(
			col()
				.w_full()
				.grow(1.0)
				.gap(SPACING)
				.role("list")
				.label(say(screen::group::SETTINGS))
				.child(
					text(say(screen::group::SETTINGS))
						.font(TEXT_XS_MEDIUM)
						.color(t.muted_foreground)
						.px(RAIL_INSET)
						.py(RAIL_INSET),
				)
				.children(entries),
		)
		.child(rule(t))
		.child(RailItem::entry(Entry::Danger, entry).view::<S>(t))
}

pub fn screen<S: Host>(t: &Tokens, settings: &Menu, entry: Entry, page: El) -> El {
	let header = row()
		.w_full()
		.h(PAGE_HEADER)
		.padding(equal_padding(PAGE_HEADER, TEXT_SM_MEDIUM.size))
		.center_y()
		.child(
			text(entry.label().to_owned())
				.font(tight(TEXT_SM_MEDIUM))
				.color(t.foreground)
				.role("heading")
				.truncate(),
		);
	let body = if entry.is_list() {
		col().w_full().grow(1.0).padding(PANEL_INSET).gap(PANEL_GAP).child(page)
	} else {
		col()
			.w_full()
			.grow(1.0)
			.padding(PANEL_INSET)
			.items_center()
			.child(col().w_full().max_w(FORM_MEASURE).gap(PANEL_GAP).child(page))
	};
	let card = col()
		.grow(1.0)
		.h_full()
		.radius(RADIUS_XL)
		.fill(t.background)
		.border(1.0, t.shell_border)
		.clip_rounded(RADIUS_XL)
		.role("main")
		.child(header)
		.child(body);
	row()
		.w_full()
		.h_full()
		.fill(t.sidebar)
		.child(menu::<S>(t, settings, entry))
		.child(col().grow(1.0).h_full().pt(RAIL_INSET).pr(RAIL_INSET).pb(RAIL_INSET).child(card))
}
