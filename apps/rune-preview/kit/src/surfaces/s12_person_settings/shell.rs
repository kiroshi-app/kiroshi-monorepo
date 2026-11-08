use rune::image::Image;
use rune::{Color, El, Icon, ScrollSpec, col, el, icon, row, text};

use super::blocks::HAIRLINE;
use super::{Emit, Look, SettingsEvent, control, dot, pressed};
use crate::avatar::Person;
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::dialog::scrim;
use crate::primitives::{elevated, equal_padding, tight};
use crate::strings::{Key, settings};
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, RADIUS_MD, RADIUS_XL, SHELL_INSET, SPACING, TEXT_BASE_SEMIBOLD,
	TEXT_COMPACT_MEDIUM, TEXT_SM, TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM,
	Tokens, faded, tone,
};

const RAIL_WIDTH: f32 = SPACING * 52.0;
const RAIL_INSET: f32 = SPACING * 2.0;
const RAIL_GAP: f32 = SPACING;
const RAIL_ITEM_INSET: (f32, f32) = (SPACING * 2.5, SPACING * 2.0);
const COUNT_SIDE: f32 = SPACING * 5.0;
const COUNT_INSET: f32 = SPACING * 1.5;
const DISABLED_ENTRY: f32 = 0.4;
const ITEM_GAP: f32 = SPACING * 2.5;
const ITEM_GLYPH: f32 = SPACING * 4.0;
const INDICATOR: f32 = SPACING * 2.0;
const PANEL_INSET: f32 = SPACING * 5.0;
const PANEL_GAP: f32 = SPACING * 4.0;
pub const DIALOG: (f32, f32) = (SPACING * 208.0, SPACING * 136.0);
const DIALOG_HEADER_INSET: f32 = SPACING * 4.0;
const DIALOG_HEADER_GAP: f32 = SPACING * 2.5;
const BREADCRUMB_GAP: f32 = SPACING * 1.5;
const BREADCRUMB_AVATAR: f32 = SPACING * 8.0;
const BREADCRUMB_GLYPH: f32 = SPACING * 3.5;
const CLOSE_INSET: f32 = SPACING * 4.0;
pub const MENU_WIDTH: f32 = SPACING * 76.0;
const MENU_INSET: f32 = SPACING * 2.0;
const MENU_GAP: f32 = SPACING * 2.0;
const MENU_HEADER: f32 = SPACING * 8.0;
const MENU_AVATAR: f32 = SPACING * 9.0;
const SECTION_TITLE: f32 = SPACING * 8.0;
const SECTION_SPACE: f32 = SPACING * 4.0;
const ENTRY_GAP: f32 = SPACING * 0.5;
const ENTRY_DOT: f32 = SPACING * 1.5;
const SECTION_ACTION: f32 = SPACING * 6.0;
const SECTION_ACTION_GLYPH: f32 = SPACING * 3.5;
const SPACE_INSET: f32 = SPACING * 1.5;
const SPACE_ROW: f32 = SPACING * 8.0;
const SPACE_AVATAR: f32 = SPACING * 3.5;
const SPACE_GAP: f32 = SPACING * 2.0;
const SPACE_PILL_INSET: f32 = SPACING;
const ATTENTION_DOT: f32 = SPACING * 1.75;
const INVITATION_TINT: f32 = 0.15;
const OFFLINE_SHARE: f32 = 0.5;
const CONTENT_HEADER: f32 = SPACING * 12.0;
const CONTENT_INSET: f32 = SPACING * 6.0;
const CONTENT_TOP: f32 = SPACING * 8.0;
const CONTENT_BOTTOM: f32 = SPACING * 4.0;
const CONTENT_COLUMN: f32 = SPACING * 200.0;
const COLUMN_GAP: f32 = SPACING * 4.0;
const NOTICE_INSET: f32 = SPACING * 4.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Entry {
	Account,
	Appearance,
	Notifications,
	Language,
	Skills,
	Applications,
	History,
	Diagnostics,
	About,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PanelLayout {
	Scrolling,
	Fixed,
	Flush,
}

impl Entry {
	pub fn glyphs(self) -> (&'static Icon, &'static Icon) {
		match self {
			Entry::Account => (&icons::CLOUD, &icons::CLOUD_FILL),
			Entry::Appearance => (&icons::IMAGE, &icons::IMAGE_FILL),
			Entry::Notifications => (&icons::BELL, &icons::BELL_FILL),
			Entry::Language => (&icons::LANGUAGE, &icons::LANGUAGE_FILL),
			Entry::Skills => (&icons::SPARKLES, &icons::SPARKLES_FILL),
			Entry::Applications => (&icons::SERVER, &icons::SERVER_FILL),
			Entry::History => (&icons::HISTORY, &icons::HISTORY_FILL),
			Entry::Diagnostics => (&icons::WRENCH, &icons::WRENCH_FILL),
			Entry::About => (&icons::INFO, &icons::INFO_FILL),
		}
	}

	pub fn label(self) -> Key {
		match self {
			Entry::Account => settings::rail::ACCOUNT,
			Entry::Appearance => settings::rail::APPEARANCE,
			Entry::Notifications => settings::rail::NOTIFICATIONS,
			Entry::Language => settings::rail::LANGUAGE,
			Entry::Skills => settings::rail::SKILLS,
			Entry::Applications => settings::rail::APPLICATIONS,
			Entry::History => settings::rail::HISTORY,
			Entry::Diagnostics => settings::rail::DIAGNOSTICS,
			Entry::About => settings::rail::ABOUT,
		}
	}

	pub fn layout(self) -> PanelLayout {
		match self {
			Entry::Skills | Entry::Applications => PanelLayout::Fixed,
			Entry::History => PanelLayout::Flush,
			_ => PanelLayout::Scrolling,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct RailItem {
	pub entry: Entry,
	pub has_indicator: bool,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Tone {
	#[default]
	Plain,
	Danger,
	Quiet,
}

pub struct Item<'a, E> {
	pub label: &'a str,
	pub glyphs: (&'static Icon, &'static Icon),
	pub is_current: bool,
	pub has_indicator: bool,
	pub count: Option<String>,
	pub tone: Tone,
	pub is_disabled: bool,
	pub event: E,
}

impl<'a, E> Item<'a, E> {
	pub fn new(label: &'a str, glyphs: (&'static Icon, &'static Icon), event: E) -> Item<'a, E> {
		Item {
			label,
			glyphs,
			is_current: false,
			has_indicator: false,
			count: None,
			tone: Tone::Plain,
			is_disabled: false,
			event,
		}
	}
}

fn person_items(
	look: Look,
	items: &[RailItem],
	current: Option<Entry>,
) -> Vec<Item<'static, SettingsEvent>> {
	items
		.iter()
		.map(|item| Item {
			is_current: current == Some(item.entry),
			has_indicator: item.has_indicator,
			..Item::new(
				look.say(item.entry.label()),
				item.entry.glyphs(),
				SettingsEvent::Select(item.entry),
			)
		})
		.collect()
}

fn count_pill(t: &Tokens, count: &str) -> El {
	row()
		.h(COUNT_SIDE)
		.min_w(COUNT_SIDE)
		.px(COUNT_INSET)
		.radius(COUNT_SIDE / 2.0)
		.border(HAIRLINE, t.border)
		.fill(t.card)
		.center()
		.a11y_hidden()
		.child(text(count.to_owned()).font(tight(TEXT_XS)).color(t.muted_foreground))
}

fn item_row<E>(t: &Tokens, item: &Item<E>, inset: (f32, f32), dot_side: f32) -> El {
	let (outlined, filled) = item.glyphs;
	let (rest_ink, current_ink, current_fill) = match item.tone {
		Tone::Plain => (t.muted_foreground, t.foreground, t.muted),
		Tone::Quiet => (t.soft_foreground, t.foreground, t.muted),
		Tone::Danger => (t.destructive, t.destructive_tint_foreground, t.destructive_tint),
	};
	let ink = if item.is_current { current_ink } else { rest_ink };
	let glyph_ink =
		if item.tone == Tone::Quiet && !item.is_current { t.muted_foreground } else { ink };
	let label = match &item.count {
		Some(count) => format!("{} {count}", item.label),
		None => item.label.to_owned(),
	};
	let mut line = row()
		.key(format!("settings-entry-{}", item.label))
		.w_full()
		.px(inset.0)
		.py(inset.1)
		.gap(ITEM_GAP)
		.center_y()
		.fill(if item.is_current { current_fill } else { Color::TRANSPARENT })
		.hover(current_fill)
		.press(current_fill)
		.role("tab")
		.label(label)
		.checked(item.is_current)
		.child(
			icon(if item.is_current { filled } else { outlined }, ITEM_GLYPH)
				.color(glyph_ink)
				.group_color(current_ink),
		)
		.child(
			text(item.label.to_owned())
				.font(if item.is_current { TEXT_SM_MEDIUM } else { TEXT_SM })
				.color(ink)
				.group_color(current_ink)
				.truncate()
				.grow(1.0),
		);
	if item.has_indicator {
		line = line.child(dot(dot_side, t.primary_strong));
	}
	if let Some(count) = &item.count {
		line = line.child(count_pill(t, count));
	}
	line
}

fn item_control<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	line: El,
	item: &Item<E>,
	emit: Emit<S, E>,
) -> El {
	if item.is_disabled {
		return line.disabled(true).opacity(DISABLED_ENTRY);
	}
	pressed(control(t, line), emit, item.event.clone())
}

pub fn rail<S: 'static, E: Clone + 'static>(t: &Tokens, items: &[Item<E>], emit: Emit<S, E>) -> El {
	col().w(RAIL_WIDTH).h_full().padding(RAIL_INSET).gap(RAIL_GAP).role("tablist").children(
		items.iter().flat_map(|item| {
			let separator = (item.tone == Tone::Danger).then(|| {
				el().h(HAIRLINE).self_stretch().mx(SPACING).my(SPACING).fill(t.border).a11y_hidden()
			});
			let line = item_row(t, item, RAIL_ITEM_INSET, INDICATOR).radius(RADIUS_XL);
			separator.into_iter().chain([item_control(t, line, item, emit)])
		}),
	)
}

pub fn panel(layout: PanelLayout, content: El) -> El {
	let body = col().w_full().grow(1.0).shrink();
	match layout {
		PanelLayout::Flush => body.child(content),
		PanelLayout::Fixed => body.padding(PANEL_INSET).gap(PANEL_GAP).child(content),
		PanelLayout::Scrolling => body
			.padding(PANEL_INSET)
			.gap(PANEL_GAP)
			.scroll(ScrollSpec { stick_bottom: false })
			.child(content),
	}
}

pub struct Dialog<'a, E> {
	pub key: &'a str,
	pub mark: El,
	pub name: &'a str,
	pub label: &'a str,
	pub breadcrumb: &'a str,
	pub close_label: &'a str,
	pub close: E,
	pub items: &'a [Item<'a, E>],
	pub layout: PanelLayout,
	pub content: El,
}

pub fn dialog<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	dialog: Dialog<E>,
	emit: Emit<S, E>,
) -> Vec<El> {
	let header = row()
		.w_full()
		.padding(DIALOG_HEADER_INSET)
		.gap(DIALOG_HEADER_GAP)
		.center_y()
		.child(dialog.mark)
		.child(
			row()
				.shrink()
				.gap(BREADCRUMB_GAP)
				.center_y()
				.role("heading")
				.label(dialog.name)
				.child(
					text(dialog.name.to_owned())
						.font(tight(TEXT_BASE_SEMIBOLD))
						.color(t.popover_foreground)
						.truncate()
						.shrink(),
				)
				.child(icon(&icons::CHEVRON_RIGHT, BREADCRUMB_GLYPH).color(t.muted_foreground))
				.child(
					text(dialog.breadcrumb.to_owned())
						.font(tight(TEXT_BASE_SEMIBOLD))
						.color(t.muted_foreground),
				),
		);
	let close = pressed(
		Button::icon(&icons::CLOSE, dialog.close_label)
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconSm)
			.view(t),
		emit,
		dialog.close.clone(),
	);
	let body = row()
		.w_full()
		.grow(1.0)
		.shrink()
		.min_h(0.0)
		.child(rail(t, dialog.items, emit))
		.child(el().w(HAIRLINE).h_full().fill(t.border))
		.child(panel(dialog.layout, dialog.content));
	let (width, height) = DIALOG;
	let surface = col()
		.key(dialog.key)
		.w(width)
		.h(height)
		.radius(RADIUS_2XL)
		.fill(t.popover)
		.clip_rounded(RADIUS_2XL)
		.role("dialog")
		.label(dialog.label)
		.child(header)
		.child(el().w_full().h(HAIRLINE).fill(t.border))
		.child(body)
		.child(close.pin(None, Some(CLOSE_INSET), Some(CLOSE_INSET), None));
	let dismiss = dialog.close;
	let layer = el()
		.absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.center()
		.modal(true, move |s: &mut S| emit(s, dismiss.clone()))
		.child(elevated(t, surface));
	vec![scrim(t), layer]
}

pub struct Shell<'a> {
	pub name: &'a str,
	pub image: Option<&'a Image>,
	pub items: &'a [RailItem],
	pub current: Entry,
	pub content: El,
}

pub fn dialog_shell<S: 'static>(look: Look, shell: Shell, emit: Emit<S, SettingsEvent>) -> Vec<El> {
	let t = look.t;
	let breadcrumb = look.say(settings::breadcrumb::TITLE);
	let items = person_items(look, shell.items, Some(shell.current));
	dialog(
		t,
		Dialog {
			key: "user-settings-dialog",
			mark: Person { name: shell.name, image: shell.image }.draw(BREADCRUMB_AVATAR, t),
			name: shell.name,
			label: breadcrumb,
			breadcrumb,
			close_label: look.say(crate::strings::common::dialog::CLOSE),
			close: SettingsEvent::Close,
			items: &items,
			layout: shell.current.layout(),
			content: shell.content,
		},
		emit,
	)
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SpaceHost {
	Shared,
	Up,
	Connecting,
	Down,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct MenuSpace<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub hue: Option<f32>,
	pub host: Option<SpaceHost>,
	pub is_current: bool,
	pub is_invitation: bool,
	pub has_attention: bool,
}

fn space_mark(t: &Tokens, space: &MenuSpace) -> El {
	let fill = match space.hue {
		Some(hue) => tone(hue, t.dark, crate::hues::Role::Accent),
		None => t.muted_foreground,
	};
	let mark = el().size(SPACE_AVATAR, SPACE_AVATAR).radius(SPACE_AVATAR / 2.0).a11y_hidden();
	if space.is_invitation {
		return mark.border(HAIRLINE, fill).border_dash(2.0, 2.0);
	}
	let mark = mark.fill(fill);
	match space.host {
		Some(SpaceHost::Down) => mark.opacity(OFFLINE_SHARE),
		Some(SpaceHost::Connecting) => {
			mark.opacity(OFFLINE_SHARE).border(HAIRLINE, fill).border_dash(2.0, 2.0)
		}
		_ => mark,
	}
}

fn pill(words: &str, fill: Color, ink: Color) -> El {
	row()
		.padding(SPACE_PILL_INSET)
		.radius(SPACE_ROW)
		.fill(fill)
		.child(text(words.to_owned()).font(tight(TEXT_XS_MEDIUM)).color(ink))
}

fn space_row<S: 'static>(look: Look, space: &MenuSpace, emit: Emit<S, SettingsEvent>) -> El {
	use settings::screen::space;
	let t = look.t;
	let mut trailing = row().gap(BREADCRUMB_GAP).center_y();
	if space.is_current {
		trailing = trailing.child(pill(look.say(space::CURRENT), t.muted, t.muted_foreground));
	}
	if space.is_invitation {
		trailing = trailing.child(pill(
			look.say(space::INVITATION),
			faded(t.warning, INVITATION_TINT),
			t.warning,
		));
	}
	if space.has_attention {
		trailing = trailing.child(dot(ATTENTION_DOT, t.warning));
	}
	let line = row()
		.key(format!("settings-space-{}", space.id))
		.w_full()
		.h(SPACE_ROW)
		.padding(SPACE_INSET)
		.gap(SPACE_GAP)
		.center_y()
		.radius(RADIUS_CONTROL)
		.hover(t.muted)
		.press(t.muted)
		.role("button")
		.label(space.name)
		.child(space_mark(t, space))
		.child(
			text(space.name.to_owned())
				.font(TEXT_SM)
				.color(t.muted_foreground)
				.group_color(t.foreground)
				.truncate()
				.grow(1.0)
				.shrink(),
		)
		.child(trailing);
	pressed(control(t, line), emit, SettingsEvent::OpenSpace(space.id.to_owned()))
}

fn section_title(t: &Tokens, words: &str, action: Option<El>) -> El {
	let title =
		row().w_full().min_h(SECTION_TITLE).padding(MENU_INSET).gap(MENU_INSET).center_y().child(
			text(words.to_owned())
				.font(TEXT_XS_MEDIUM)
				.color(t.muted_foreground)
				.truncate()
				.grow(1.0)
				.shrink(),
		);
	match action {
		Some(action) => title.child(action),
		None => title,
	}
}

fn add_space<S: 'static>(look: Look, emit: Emit<S, SettingsEvent>) -> El {
	let t = look.t;
	let label = look.say(crate::strings::bots::spaces::CREATE);
	let button = row()
		.key("settings-add-space")
		.size(SECTION_ACTION, SECTION_ACTION)
		.center()
		.radius(RADIUS_MD)
		.hover(t.muted)
		.press(t.muted)
		.role("button")
		.label(label)
		.child(
			icon(&icons::PLUS, SECTION_ACTION_GLYPH)
				.color(t.muted_foreground)
				.group_color(t.foreground),
		);
	pressed(control(t, button), emit, SettingsEvent::CreateSpace)
}

pub struct Screen<'a> {
	pub name: &'a str,
	pub image: Option<&'a Image>,
	pub items: &'a [RailItem],
	pub current: Option<Entry>,
	pub spaces: &'a [MenuSpace<'a>],
	pub menu_width: f32,
	pub content: El,
}

pub struct Menu<'a, E> {
	pub label: &'a str,
	pub back_label: &'a str,
	pub back: E,
	pub avatar: El,
	pub name: &'a str,
	pub subtitle: &'a str,
	pub group_title: &'a str,
	pub items: &'a [Item<'a, E>],
	pub below: Option<El>,
	pub pinned: Option<Item<'a, E>>,
	pub width: f32,
}

fn menu<S: 'static, E: Clone + 'static>(t: &Tokens, menu: Menu<E>, emit: Emit<S, E>) -> El {
	let back = row()
		.key("settings-back")
		.h(MENU_HEADER)
		.padding(MENU_INSET)
		.gap(ITEM_GAP)
		.center_y()
		.radius(RADIUS_CONTROL)
		.hover(t.muted)
		.press(t.muted)
		.role("button")
		.label(menu.back_label)
		.child(
			icon(&icons::CHEVRON_LEFT, ITEM_GLYPH)
				.color(t.muted_foreground)
				.group_color(t.foreground),
		)
		.child(
			text(menu.back_label.to_owned())
				.font(tight(TEXT_COMPACT_MEDIUM))
				.color(t.muted_foreground)
				.group_color(t.foreground),
		);
	let header =
		row().w_full().padding(MENU_INSET).gap(ITEM_GAP).center_y().child(menu.avatar).child(
			col()
				.shrink()
				.child(
					text(menu.name.to_owned())
						.font(TEXT_SM_SEMIBOLD)
						.color(t.foreground)
						.truncate(),
				)
				.child(
					text(menu.subtitle.to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground)
						.truncate(),
				),
		);
	let entries = col().w_full().gap(ENTRY_GAP).children(menu.items.iter().map(|item| {
		let line = item_row(t, item, (MENU_INSET, MENU_INSET), ENTRY_DOT).radius(RADIUS_CONTROL);
		item_control(t, line, item, emit)
	}));
	let mut list = col()
		.w_full()
		.grow(1.0)
		.shrink()
		.scroll(ScrollSpec { stick_bottom: false })
		.child(section_title(t, menu.group_title, None))
		.child(entries);
	if let Some(below) = menu.below {
		list = list.child(below);
	}
	let mut column = col()
		.w(menu.width)
		.h_full()
		.padding(MENU_GAP)
		.gap(MENU_GAP)
		.corners([RADIUS_CONTROL, 0.0, 0.0, RADIUS_CONTROL])
		.fill(t.card)
		.border(HAIRLINE, t.shell_border)
		.role("navigation")
		.label(menu.label)
		.child(row().h(MENU_HEADER).child(pressed(control(t, back), emit, menu.back)))
		.child(header)
		.child(list);
	if let Some(pinned) = &menu.pinned {
		let line = item_row(t, pinned, (MENU_INSET, MENU_INSET), ENTRY_DOT).radius(RADIUS_CONTROL);
		column = column.child(item_control(t, line, pinned, emit));
	}
	column
}

pub struct Page<'a> {
	pub heading: &'a str,
	pub content: El,
}

pub fn screen_body<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	menu_of: Menu<E>,
	page: Page,
	emit: Emit<S, E>,
) -> El {
	let column = col()
		.w_full()
		.max_w(CONTENT_COLUMN)
		.px(CONTENT_INSET)
		.pt(CONTENT_TOP)
		.pb(CONTENT_BOTTOM)
		.gap(COLUMN_GAP)
		.child(page.content);
	let content_body =
		col().w_full().grow(1.0).shrink().items_center().scroll(ScrollSpec { stick_bottom: false });
	let content = col()
		.grow(1.0)
		.shrink()
		.h_full()
		.corners([0.0, RADIUS_CONTROL, RADIUS_CONTROL, 0.0])
		.fill(t.card)
		.border(HAIRLINE, t.shell_border)
		.clip_rounded(RADIUS_CONTROL)
		.role("main")
		.child(
			row()
				.w_full()
				.h(CONTENT_HEADER)
				.padding(equal_padding(CONTENT_HEADER, TEXT_SM_MEDIUM.line_height))
				.center_y()
				.child(
					text(page.heading.to_owned())
						.font(TEXT_SM_MEDIUM)
						.color(t.foreground)
						.role("heading")
						.truncate(),
				),
		)
		.child(el().w_full().h(HAIRLINE).fill(t.border))
		.child(content_body.child(column));
	row().w_full().h_full().child(menu(t, menu_of, emit)).child(content)
}

pub fn screen<S: 'static>(look: Look, screen: Screen, emit: Emit<S, SettingsEvent>) -> El {
	let t = look.t;
	let heading = screen.current.map(|entry| look.say(entry.label())).unwrap_or_default();
	let items = person_items(look, screen.items, screen.current);
	let spaces = col()
		.w_full()
		.pt(SECTION_SPACE)
		.gap(ENTRY_GAP)
		.child(section_title(
			t,
			look.say(settings::screen::group::SPACES),
			Some(add_space(look, emit)),
		))
		.children(screen.spaces.iter().map(|space| space_row(look, space, emit)));
	let menu = Menu {
		label: look.say(settings::screen::MENU),
		back_label: look.say(settings::screen::BACK),
		back: SettingsEvent::Back,
		avatar: Person { name: screen.name, image: screen.image }.draw(MENU_AVATAR, t),
		name: screen.name,
		subtitle: look.say(settings::screen::subtitle::USER),
		group_title: look.say(settings::screen::group::SETTINGS),
		items: &items,
		below: Some(spaces),
		pinned: None,
		width: screen.menu_width,
	};
	let body = screen_body(t, menu, Page { heading, content: screen.content }, emit);
	row().w_full().h_full().padding(SHELL_INSET).fill(t.background).child(body)
}

pub fn notice_layer(notice: El) -> El {
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.padding(NOTICE_INSET)
		.justify_end()
		.items_end()
		.child(notice)
}
