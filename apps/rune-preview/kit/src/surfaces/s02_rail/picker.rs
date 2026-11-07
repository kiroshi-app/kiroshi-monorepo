use rune::{Align, Color, Cursor, El, Icon, Side, TextStyle, col, el, icon, row, spacer, text};

use super::invitations::{SpaceInvitation, invitations};
use super::rail::{COMMAND_KEY, badge_fill};
use super::space_avatar::{SpaceAvatar, SpaceAvatarSize, SpaceAvatarState};
use super::{BotBadge, Emit, Space, SpaceHost, said};
use crate::icons::{self, stroked};
use crate::primitives::context_menu::COMMAND;
use crate::primitives::{
	FOCUS_RING_WIDTH, OVERLAY_SHADOW_BLUR, OVERLAY_SHADOW_Y, elevated, equal_padding, instant,
	popup_motion, ring_tint, tight,
};
use crate::strings::{Language, bots};
use crate::tokens::{
	RADIUS_2XL, RADIUS_MD, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_XS, Tokens, faded,
};

const SPACE_ROW: f32 = SPACING * 10.0;
const ITEM_ROW: f32 = SPACING * 7.0;
const TITLE_BAR_ROW: f32 = SPACING * 8.0;
const ROW_AVATAR: SpaceAvatarSize = SpaceAvatarSize::Px26;
const ITEM_GLYPH: f32 = SPACING * 3.5;
const CHECK: f32 = SPACING * 4.0;
const TITLE_BAR_CHECK: f32 = SPACING * 3.5;
const SHORTCUT_GLYPH: f32 = SPACING * 3.0;
const SHORTCUT_TRACKING: f32 = 0.1;
const RANK_LIMIT: usize = 9;
const ITEM_RING: f32 = 2.0;
const MENU_INSET: f32 = SPACING;
const MENU_OFFSET: f32 = SPACING;
const MENU_MIN_WIDTH: f32 = SPACING * 36.0;
const MENU_RESTING_MAX: f32 = SPACING * 64.0;
const MENU_INVITED: f32 = SPACING * 70.0;
const RAIL_MENU: f32 = SPACING * 62.0;
const TITLE_BAR_RADIUS: f32 = 12.0;
const TRIGGER_HEIGHT: f32 = SPACING * 8.0;
const TRIGGER_MAX: f32 = SPACING * 64.0;
const CHEVRON: f32 = SPACING * 3.0;
const CHEVRON_STROKE: f32 = 2.0;
const BADGE_DOT: f32 = SPACING * 2.0;
const INVITATION_DOT: f32 = SPACING * 1.75;
const INVITATION_DOT_INSET: (f32, f32) = (1.0, SPACING);
const DOT_RING: f32 = 2.0;
const DOT_BUTTON: f32 = SPACING * 5.0;
const DOT: f32 = SPACING * 2.5;
const OPEN_DOT: f32 = SPACING * 4.0;
const CLOSED_DOT_SHARE: f32 = 0.3;
const DOT_FOCUS_SHARE: f32 = 0.4;

pub const PICKER_KEY: &str = "space-switcher";

#[derive(Clone, Debug, PartialEq)]
pub enum PickerMessage {
	OpenChange(bool),
	SelectSpace(String),
	CreateSpace,
	OpenSpaceSettings,
	AcceptInvitation(String),
	DeclineInvitation(String),
	RetryInvitation(String),
}

pub(super) fn sends<S: 'static, M: 'static>(
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
	message: PickerMessage,
) -> impl Fn(&mut S) + 'static {
	move |s: &mut S| emit(s, wrap(message.clone()))
}

fn sends_and_closes<S: 'static, M: 'static>(
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
	message: PickerMessage,
) -> impl Fn(&mut S) + 'static {
	move |s: &mut S| {
		emit(s, wrap(message.clone()));
		emit(s, wrap(PickerMessage::OpenChange(false)));
	}
}

pub(super) fn separator(t: &Tokens) -> El {
	el().h(1.0).mx(-MENU_INSET).my(SPACING).fill(faded(t.border, 0.5)).role("separator")
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Look {
	Picker,
	TitleBar,
}

#[derive(Clone, Copy, Default)]
pub struct SpacesMenu<'a> {
	pub spaces: &'a [Space<'a>],
	pub badges: &'a [(&'a str, BotBadge)],
	pub hosts: &'a [(&'a str, SpaceHost)],
	pub invitations: &'a [SpaceInvitation<'a>],
	pub focused_invitation: Option<&'a str>,
	pub is_open: bool,
}

impl<'a> SpacesMenu<'a> {
	fn badge_of(&self, id: &str) -> Option<BotBadge> {
		self.badges.iter().find(|(space, _)| *space == id).map(|(_, badge)| *badge)
	}

	fn host_of(&self, id: &str) -> Option<SpaceHost> {
		self.hosts.iter().find(|(space, _)| *space == id).map(|(_, host)| *host)
	}

	fn badge_elsewhere(&self, current: &str) -> Option<BotBadge> {
		let badges: Vec<BotBadge> = self
			.spaces
			.iter()
			.filter(|space| space.id != current)
			.filter_map(|space| self.badge_of(space.id))
			.collect();
		[BotBadge::Attention, BotBadge::Failed].into_iter().find(|badge| badges.contains(badge))
	}

	pub(super) fn rail_panel<S: 'static, M: 'static>(
		&self,
		t: &Tokens,
		language: Language,
		selected: Option<&str>,
		anchor: &str,
		emit: Emit<S, M>,
		wrap: fn(PickerMessage) -> M,
	) -> El {
		let mut rows = self.space_rows(t, Look::TitleBar, language, selected, emit, wrap);
		rows.extend(invitations(
			t,
			language,
			self.invitations,
			self.focused_invitation,
			emit,
			wrap,
		));
		rows.push(separator(t));
		rows.push(item(
			t,
			Look::TitleBar,
			&icons::SETTINGS,
			bots::rail::SPACE_SETTINGS.text(language),
			sends_and_closes(emit, wrap, PickerMessage::OpenSpaceSettings),
		));
		rows.push(item(
			t,
			Look::TitleBar,
			&icons::PLUS,
			bots::spaces::CREATE.text(language),
			sends_and_closes(emit, wrap, PickerMessage::CreateSpace),
		));
		let panel = col()
			.w(RAIL_MENU)
			.padding(MENU_INSET)
			.radius(TITLE_BAR_RADIUS)
			.fill(t.title_bar_menu)
			.border(1.0, t.title_bar_menu_border)
			.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow);
		opened(t, language, panel, rows, anchor, emit, wrap)
	}

	fn picker_panel<S: 'static, M: 'static>(
		&self,
		t: &Tokens,
		language: Language,
		selected: &str,
		emit: Emit<S, M>,
		wrap: fn(PickerMessage) -> M,
	) -> El {
		let mut rows = self.space_rows(t, Look::Picker, language, Some(selected), emit, wrap);
		rows.extend(invitations(
			t,
			language,
			self.invitations,
			self.focused_invitation,
			emit,
			wrap,
		));
		rows.push(separator(t));
		rows.push(item(
			t,
			Look::Picker,
			&icons::PLUS,
			bots::spaces::CREATE.text(language),
			sends_and_closes(emit, wrap, PickerMessage::CreateSpace),
		));
		let panel =
			col().min_w(MENU_MIN_WIDTH).padding(MENU_INSET).radius(RADIUS_2XL).fill(t.popover);
		let panel = if self.invitations.is_empty() {
			panel.max_w(MENU_RESTING_MAX)
		} else {
			panel.w(MENU_INVITED)
		};
		opened(t, language, elevated(t, panel), rows, PICKER_KEY, emit, wrap)
	}

	fn space_rows<S: 'static, M: 'static>(
		&self,
		t: &Tokens,
		look: Look,
		language: Language,
		selected: Option<&str>,
		emit: Emit<S, M>,
		wrap: fn(PickerMessage) -> M,
	) -> Vec<El> {
		let rows = self.spaces.iter().enumerate().map(|(index, space)| {
			let host = self.host_of(space.id);
			SpaceRow {
				space: *space,
				rank: (index < RANK_LIMIT).then_some(index + 1),
				is_checked: selected == Some(space.id),
				has_attention: self.badge_of(space.id) == Some(BotBadge::Attention),
				host,
			}
			.view(t, look, language)
			.on_press(sends_and_closes(
				emit,
				wrap,
				PickerMessage::SelectSpace(space.id.to_owned()),
			))
		});
		vec![col().role("group").label(bots::spaces::LABEL.text(language)).children(rows)]
	}
}

fn opened<S: 'static, M: 'static>(
	t: &Tokens,
	language: Language,
	panel: El,
	rows: Vec<El>,
	anchor: &str,
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
) -> El {
	let menu = panel
		.key(format!("spaces-menu-{anchor}"))
		.items_stretch()
		.role("menu")
		.label(bots::spaces::LABEL.text(language))
		.focus_group()
		.focus_return(anchor)
		.transition(popup_motion(t))
		.children(rows)
		.anchored(anchor, Side::Bottom, Align::Start, MENU_OFFSET);
	el().absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.modal(true, sends(emit, wrap, PickerMessage::OpenChange(false)))
		.child(menu)
}

struct SpaceRow<'a> {
	space: Space<'a>,
	rank: Option<usize>,
	is_checked: bool,
	has_attention: bool,
	host: Option<SpaceHost>,
}

impl SpaceRow<'_> {
	fn view(&self, t: &Tokens, look: Look, language: Language) -> El {
		let style = tight(if look == Look::TitleBar { TEXT_COMPACT } else { TEXT_SM });
		let (highlight, ink, highlight_ink) = highlight_of(t, look);
		let avatar = SpaceAvatar {
			space_id: self.space.avatar_seed,
			name: self.space.name,
			colour: self.space.colour,
			size: ROW_AVATAR,
			state: SpaceAvatarState::of_host(self.host),
			has_attention: self.has_attention,
		}
		.draw(t);
		let mut menu_row = row()
			.key(format!("space-row-{}", self.space.id))
			.h(SPACE_ROW)
			.padding(equal_padding(SPACE_ROW, ROW_AVATAR.side()))
			.gap(if look == Look::TitleBar { SPACING * 2.5 } else { SPACING * 2.0 })
			.radius(if look == Look::TitleBar { RADIUS_MD } else { RADIUS_XL })
			.center_y()
			.role("menuitemradio")
			.label(self.space.name)
			.checked(self.is_checked)
			.child(avatar)
			.child(
				text(self.space.name.to_owned())
					.font(style)
					.color(ink)
					.group_color(highlight_ink)
					.truncate()
					.shrink(),
			)
			.child(spacer());
		if let Some(host) = self.host {
			menu_row = menu_row.description(host.spoken().text(language));
		}
		if let Some(rank) = self.rank {
			menu_row = menu_row.child(shortcut(t, language, rank));
		}
		let check_side = if look == Look::TitleBar { TITLE_BAR_CHECK } else { CHECK };
		let mut check = el().size(check_side, check_side).center();
		if self.is_checked {
			check =
				check.child(icon(&icons::CHECK, check_side).color(ink).group_color(highlight_ink));
		}
		menu_row = menu_row.child(check);
		menu_highlight(t, menu_row, highlight)
	}
}

fn highlight_of(t: &Tokens, look: Look) -> (Color, Color, Color) {
	match look {
		Look::Picker => (t.accent, t.popover_foreground, t.accent_foreground),
		Look::TitleBar => (t.title_bar_highlight, t.popover_foreground, t.accent_foreground),
	}
}

fn menu_highlight(t: &Tokens, menu_row: El, highlight: Color) -> El {
	instant(menu_row.hover_group())
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(highlight)
		.focus_ring(ITEM_RING, -ITEM_RING, t.ring)
}

fn shortcut(t: &Tokens, language: Language, rank: usize) -> El {
	let style = TextStyle { tracking: SHORTCUT_TRACKING * TEXT_XS.size, ..tight(TEXT_XS) };
	let spoken = said(language, bots::spaces::SHORTCUT, &[("rank", &rank.to_string())]);
	let key = spoken.trim_start_matches(COMMAND_KEY).to_owned();
	row()
		.gap(SPACING * 0.5)
		.center_y()
		.ml(SPACING * 2.0)
		.label(spoken)
		.child(
			icon(&COMMAND, SHORTCUT_GLYPH)
				.color(t.muted_foreground)
				.group_color(t.accent_foreground),
		)
		.child(text(key).font(style).color(t.muted_foreground).group_color(t.accent_foreground))
}

fn item<S: 'static>(
	t: &Tokens,
	look: Look,
	glyph: &'static Icon,
	label: &str,
	press: impl Fn(&mut S) + 'static,
) -> El {
	let (height, style, radius) = match look {
		Look::Picker => (ITEM_ROW, tight(TEXT_SM), RADIUS_XL),
		Look::TitleBar => (TITLE_BAR_ROW, tight(TEXT_COMPACT), RADIUS_MD),
	};
	let (highlight, ink, highlight_ink) = highlight_of(t, look);
	let menu_row = row()
		.key(format!("menu-item-{label}"))
		.padding(equal_padding(height, style.size))
		.gap(SPACING * 2.0)
		.radius(radius)
		.center_y()
		.role("menuitem")
		.label(label)
		.child(icon(glyph, ITEM_GLYPH).color(ink).group_color(highlight_ink))
		.child(text(label.to_owned()).font(style).color(ink).group_color(highlight_ink))
		.child(spacer());
	menu_highlight(t, menu_row, highlight).on_press(press)
}

pub struct SpacePicker<'a> {
	pub language: Language,
	pub menu: SpacesMenu<'a>,
	pub selected: Option<&'a str>,
}

impl<'a> SpacePicker<'a> {
	fn selected_space(&self) -> Option<Space<'a>> {
		let spaces = self.menu.spaces;
		spaces.iter().find(|space| Some(space.id) == self.selected).or(spaces.first()).copied()
	}

	pub fn view<S: 'static>(&self, t: &Tokens, emit: Emit<S, PickerMessage>) -> El {
		let Some(space) = self.selected_space() else { return el() };
		let host = self.menu.host_of(space.id);
		let invited = self.menu.invitations.len();
		let is_open = self.menu.is_open;
		let style = tight(TEXT_COMPACT);
		let paint_fill = if is_open { t.sidebar_accent } else { t.background.alpha(0.0) };
		let ink = if is_open { t.foreground } else { t.muted_foreground };
		let avatar = SpaceAvatar {
			space_id: space.avatar_seed,
			name: space.name,
			colour: space.colour,
			size: SpaceAvatarSize::Px12,
			state: SpaceAvatarState::of_host(host),
			has_attention: false,
		}
		.draw(t);
		let mut trigger = row()
			.key(PICKER_KEY)
			.h(TRIGGER_HEIGHT)
			.min_w(0.0)
			.max_w(TRIGGER_MAX)
			.shrink()
			.padding(equal_padding(TRIGGER_HEIGHT, style.size))
			.gap(SPACING * 2.0)
			.radius(RADIUS_MD)
			.center_y()
			.fill(paint_fill)
			.role("button")
			.label(self.spoken(space, host))
			.expanded(is_open)
			.child(avatar)
			.child(
				text(space.name.to_owned())
					.font(style)
					.color(ink)
					.group_color(t.foreground)
					.truncate()
					.min_w(0.0)
					.shrink(),
			)
			.child(
				icon(stroked(&icons::CHEVRON_DOWN, CHEVRON_STROKE), CHEVRON)
					.color(ink)
					.group_color(t.foreground),
			);
		if invited == 0
			&& let Some(badge) = self.menu.badge_elsewhere(space.id)
		{
			trigger = trigger.child(
				el().size(BADGE_DOT, BADGE_DOT)
					.radius(BADGE_DOT / 2.0)
					.fill(badge_fill(t, badge))
					.a11y_hidden(),
			);
		}
		if invited > 0 {
			trigger = trigger.child(
				el().pin(None, Some(INVITATION_DOT_INSET.1), Some(INVITATION_DOT_INSET.0), None)
					.size(INVITATION_DOT, INVITATION_DOT)
					.radius(INVITATION_DOT / 2.0)
					.fill(t.primary_strong)
					.outline(DOT_RING, 0.0, t.background)
					.a11y_hidden(),
			);
		}
		if !is_open {
			trigger = trigger.hover(if t.dark { faded(t.muted, 0.5) } else { t.muted });
		}
		instant(trigger.hover_group())
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
			.on_press(move |s: &mut S| emit(s, PickerMessage::OpenChange(!is_open)))
	}

	pub fn menu_layer<S: 'static>(&self, t: &Tokens, emit: Emit<S, PickerMessage>) -> Option<El> {
		let space = self.selected_space().filter(|_| self.menu.is_open)?;
		Some(self.menu.picker_panel(t, self.language, space.id, emit, |message| message))
	}

	fn spoken(&self, space: Space, host: Option<SpaceHost>) -> String {
		use bots::spaces;
		let count = self.menu.invitations.len();
		let key = match (count, host) {
			(0, None) => spaces::SWITCH,
			(0, Some(_)) => spaces::SWITCH_HOSTED,
			(1, None) => spaces::SWITCH_INVITED_ONE,
			(1, Some(_)) => spaces::SWITCH_HOSTED_INVITED_ONE,
			(_, None) => spaces::SWITCH_INVITED_OTHER,
			(_, Some(_)) => spaces::SWITCH_HOSTED_INVITED_OTHER,
		};
		let host = host.map_or("", |host| host.spoken().text(self.language));
		said(
			self.language,
			key,
			&[("name", space.name), ("host", host), ("count", &count.to_string())],
		)
	}
}

pub struct SpaceDots<'a> {
	pub language: Language,
	pub spaces: &'a [Space<'a>],
	pub selected: Option<&'a str>,
	pub badges: &'a [(&'a str, BotBadge)],
}

impl SpaceDots<'_> {
	pub fn view<S: 'static>(&self, t: &Tokens, emit: Emit<S, PickerMessage>) -> El {
		if self.spaces.len() < 2 {
			return el();
		}
		let badge_of =
			|id: &str| self.badges.iter().find(|(space, _)| *space == id).map(|(_, badge)| *badge);
		let dots = self.spaces.iter().map(|space| {
			let is_open = Some(space.id) == self.selected;
			let name = said(self.language, bots::spaces::OPEN, &[("name", space.name)]);
			let id = space.id.to_owned();
			let button = row()
				.key(format!("space-dot-{}", space.id))
				.size(DOT_BUTTON, DOT_BUTTON)
				.radius(DOT_BUTTON / 2.0)
				.center()
				.role("button")
				.label(name)
				.checked(is_open)
				.child(dot(t, space.colour, is_open, badge_of(space.id)));
			instant(button.hover_group())
				.focusable(true)
				.cursor(Cursor::Pointer)
				.focus_ring(ITEM_RING, 0.0, ring_tint(t, DOT_FOCUS_SHARE))
				.on_press(move |s: &mut S| emit(s, PickerMessage::SelectSpace(id.clone())))
		});
		row()
			.key("space-dots")
			.flex_wrap()
			.center()
			.role("group")
			.label(bots::spaces::LABEL.text(self.language))
			.children(dots)
	}
}

fn dot(t: &Tokens, colour: Option<f32>, is_open: bool, badge: Option<BotBadge>) -> El {
	let width = if is_open { OPEN_DOT } else { DOT };
	let fill = match (is_open, colour) {
		(true, Some(hue)) => t.in_space(Some(hue)).primary_strong,
		_ => t.sidebar_foreground,
	};
	let face = el().size(width, DOT).radius(DOT / 2.0).fill(fill);
	let face = if is_open { face } else { face.group_opacity(CLOSED_DOT_SHARE, 1.0) };
	let holder = el().size(width, DOT).radius(DOT / 2.0).a11y_hidden().child(face);
	match badge {
		Some(badge) => holder.outline(DOT_RING, 0.0, badge_fill(t, badge)),
		None => holder,
	}
}
