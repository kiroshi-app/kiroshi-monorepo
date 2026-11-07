use rune::{Align, Cursor, El, Icon, Side, TextStyle, col, el, icon, row, spacer, text};

use super::title_bar::{ICON_SLOT, Strip, TabIcon, TitleBar, tab_icon};
use super::{ChromeEvent, Emit};
use crate::icons;
use crate::primitives::context_menu::COMMAND;
use crate::primitives::{DISABLED_OPACITY, OVERLAY_SHADOW_BLUR, OVERLAY_SHADOW_Y, instant, tight};
use crate::strings::Key;
use crate::strings::common::title_bar as copy_keys;
use crate::tokens::{RADIUS_MD, SPACING, TEXT_COMPACT, TEXT_XS, Tokens, faded};

pub static OPTION: Icon = Icon {
	name: "s01-option",
	view: 24.0,
	body: r#"<path d="M3 3h6l6 18h6M14 3h7" fill="none" stroke="currentColor" stroke-width="2.16" stroke-linecap="round" stroke-linejoin="round"></path>"#,
};

const MENU_RADIUS: f32 = SPACING * 3.0;
const TAB_MENU_WIDTH: f32 = SPACING * 55.0;
const OVERFLOW_MENU_WIDTH: f32 = SPACING * 72.5;
const ROW_HEIGHT: f32 = SPACING * 8.0;
const ROW_GLYPH: f32 = SPACING * 3.5;
const HINT_GLYPH: f32 = SPACING * 3.0;
const HINT: TextStyle = TextStyle { tracking: TEXT_XS.size * 0.1, ..TEXT_XS };

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum TabMenu<'a> {
	Tab { id: &'a str, at: (f32, f32), has_closed_tab: bool },
	Overflow,
}

enum Glyph<'a> {
	Row(&'static Icon),
	Tab(TabIcon<'a>),
}

struct MenuRow<'a> {
	glyph: Glyph<'a>,
	label: String,
	hint: Option<&'static str>,
	is_disabled: bool,
	event: ChromeEvent,
}

impl<'a> MenuRow<'a> {
	fn item(glyph: &'static Icon, label: Key, bar: &TitleBar, event: ChromeEvent) -> MenuRow<'a> {
		MenuRow {
			glyph: Glyph::Row(glyph),
			label: label.text(bar.language).to_owned(),
			hint: None,
			is_disabled: false,
			event,
		}
	}

	fn hint(self, hint: Key, bar: &TitleBar) -> MenuRow<'a> {
		MenuRow { hint: Some(hint.text(bar.language)), ..self }
	}

	fn disabled(self, is_disabled: bool) -> MenuRow<'a> {
		MenuRow { is_disabled, ..self }
	}
}

pub fn tab_menu<S: 'static>(
	t: &Tokens,
	bar: &TitleBar,
	menu: TabMenu,
	emit: Emit<S>,
) -> Option<El> {
	match menu {
		TabMenu::Tab { id, at, has_closed_tab } => {
			let tab = bar.tabs.iter().find(|tab| tab.id == id)?;
			let owned = id.to_owned();
			let (pin_glyph, pin_label, pin_event) = if tab.is_pinned {
				(&icons::PIN_OFF, copy_keys::UNPIN_TAB, ChromeEvent::UnpinTab(owned.clone()))
			} else {
				(&icons::PIN, copy_keys::PIN_TAB, ChromeEvent::PinTab(owned.clone()))
			};
			let groups = [
				vec![
					MenuRow::item(pin_glyph, pin_label, bar, pin_event)
						.hint(copy_keys::PIN_TAB_SHORTCUT, bar),
					MenuRow::item(
						&icons::SQUARE_PLUS,
						copy_keys::NEW_TAB,
						bar,
						ChromeEvent::NewTab,
					)
					.hint(copy_keys::NEW_TAB_SHORTCUT, bar),
					MenuRow::item(
						&icons::COPY,
						copy_keys::DUPLICATE_TAB,
						bar,
						ChromeEvent::DuplicateTab(owned.clone()),
					),
				],
				vec![
					MenuRow::item(
						&icons::ROTATE_CCW,
						copy_keys::REOPEN_CLOSED_TAB,
						bar,
						ChromeEvent::ReopenClosedTab,
					)
					.hint(copy_keys::REOPEN_CLOSED_TAB_SHORTCUT, bar)
					.disabled(!has_closed_tab),
				],
				vec![
					MenuRow::item(
						&icons::CLOSE,
						copy_keys::CLOSE_TAB,
						bar,
						ChromeEvent::CloseTab(owned.clone()),
					)
					.hint(copy_keys::CLOSE_TAB_SHORTCUT, bar)
					.disabled(tab.is_pinned),
					MenuRow::item(
						&icons::GRID_SQUARES_X,
						copy_keys::CLOSE_OTHER_TABS,
						bar,
						ChromeEvent::CloseOtherTabs(owned.clone()),
					)
					.hint(copy_keys::CLOSE_OTHER_TABS_SHORTCUT, bar),
					MenuRow::item(
						&icons::APP_WINDOW_PLUS,
						copy_keys::MOVE_TAB_TO_NEW_WINDOW,
						bar,
						ChromeEvent::MoveTabToNewWindow(owned),
					),
				],
			];
			let panel = panel(t, groups, emit).min_w(TAB_MENU_WIDTH);
			Some(panel.absolute(at.0, at.1))
		}
		TabMenu::Overflow => {
			let rows = Strip::of(bar)
				.overflowing
				.iter()
				.map(|tab| MenuRow {
					glyph: Glyph::Tab(tab.icon),
					label: tab.title.display(bar.language),
					hint: None,
					is_disabled: false,
					event: ChromeEvent::SelectTab(tab.id.to_owned()),
				})
				.collect();
			let panel = panel(t, [rows], emit).w(OVERFLOW_MENU_WIDTH);
			Some(panel.anchored("title-bar-overflow", Side::Bottom, Align::End, SPACING))
		}
	}
}

fn panel<'a, S: 'static>(
	t: &Tokens,
	groups: impl IntoIterator<Item = Vec<MenuRow<'a>>>,
	emit: Emit<S>,
) -> El {
	let separator = || el().h(1.0).mx(-SPACING).my(SPACING).fill(faded(t.border, 0.5));
	let mut rows: Vec<El> = Vec::new();
	for group in groups {
		if !rows.is_empty() {
			rows.push(separator());
		}
		rows.extend(group.into_iter().map(|menu_row| menu_row_view(t, menu_row, emit)));
	}
	col()
		.key("title-bar-menu")
		.items_stretch()
		.padding(SPACING)
		.radius(MENU_RADIUS)
		.fill(t.title_bar_menu)
		.border(1.0, t.title_bar_menu_border)
		.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow)
		.role("menu")
		.children(rows)
}

fn menu_row_view<S: 'static>(t: &Tokens, menu_row: MenuRow, emit: Emit<S>) -> El {
	let ink = t.popover_foreground;
	let glyph = match menu_row.glyph {
		Glyph::Row(glyph) => icon(glyph, ROW_GLYPH).color(ink),
		Glyph::Tab(glyph) => row().size(ICON_SLOT, ICON_SLOT).center().child(tab_icon(t, glyph)),
	};
	let mut view = row()
		.key(format!("title-bar-menu-{}", menu_row.label))
		.h(ROW_HEIGHT)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_MD)
		.center_y()
		.role("menuitem")
		.label(menu_row.label.clone())
		.child(glyph)
		.child(text(menu_row.label).font(tight(TEXT_COMPACT)).color(ink).truncate().shrink());
	if let Some(hint) = menu_row.hint {
		view = view.child(spacer()).child(hint_view(t, hint));
	}
	if menu_row.is_disabled {
		return view.disabled(true).opacity(DISABLED_OPACITY);
	}
	let event = menu_row.event;
	instant(view.hover(t.title_bar_highlight).hover_group())
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(t.title_bar_highlight)
		.on_press(move |s: &mut S| emit(s, event.clone()))
}

fn hint_view(t: &Tokens, hint: &str) -> El {
	let mut keys = row().gap(SPACING * 0.5).center_y().ml(SPACING * 2.0);
	let mut run = String::new();
	for key in hint.chars() {
		let glyph = match key {
			'⌘' => &COMMAND,
			'⌥' => &OPTION,
			_ => {
				run.push(key);
				continue;
			}
		};
		if !run.is_empty() {
			keys = keys.child(text(std::mem::take(&mut run)).font(HINT).color(t.muted_foreground));
		}
		keys = keys.child(icon(glyph, HINT_GLYPH).color(t.muted_foreground));
	}
	if !run.is_empty() {
		keys = keys.child(text(run).font(HINT).color(t.muted_foreground));
	}
	keys
}
