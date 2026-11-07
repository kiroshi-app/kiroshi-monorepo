use rune::image::Image;
use rune::{Align, Color, Cursor, El, Icon, Side, SurfaceFit, col, el, icon, row, text};
use rune_motion::LoopSpec;

use super::picker::{PickerMessage, SpacesMenu};
use super::space_avatar::{SpaceAvatar, SpaceAvatarSize, SpaceAvatarState};
use super::{BotBadge, Emit, Space, SpaceHost, said};
use crate::avatar::initials_of;
use crate::icons::{self, stroked};
use crate::primitives::context_menu::COMMAND;
use crate::primitives::tooltip::SIDE_OFFSET;
use crate::primitives::{FOCUS_RING_WIDTH, equal_padding, instant, popup_motion, ring_tint, tight};
use crate::strings::{Language, bots, search};
use crate::tokens::{RADIUS_LG, RADIUS_XL, SPACING, TEXT_XS, TEXT_XS_MEDIUM, Tokens};

pub const WIDTH: f32 = SPACING * 15.0;
const ENTRY: f32 = SPACING * 11.0;
const GLYPH: f32 = SPACING * 4.5;
const GLYPH_STROKE: f32 = 1.75;
const INLINE_INSET: f32 = SPACING * 2.0;
const TOP_INSET: f32 = SPACING * 1.75;
const FOOT_INSET: f32 = SPACING;
const GROUP_GAP: f32 = SPACING;
const ROW_GAP: f32 = SPACING * 0.5;
const DOT: f32 = SPACING * 2.0;
const DOT_RING: f32 = 2.0;
const DOT_OUTSET: f32 = -1.0;
const READER_AVATAR: f32 = 26.0;
const HOVER_SHARE: f32 = 0.5;
const PULSE_PERIOD: f64 = 2.0;
const PULSE_LOW: f32 = 0.5;
const HINT_HEIGHT: f32 = SPACING * 7.0;
const HINT_MAX_WIDTH: f32 = 320.0;
const HINT_CHORD_HEIGHT: f32 = SPACING * 5.0;
const HINT_CHORD_GLYPH: f32 = SPACING * 3.0;
const HINT_ARROW: f32 = SPACING * 2.5;
const HINT_ARROW_RADIUS: f32 = 2.0;
pub(super) const COMMAND_KEY: char = '⌘';

pub const SPACE_LOGO_KEY: &str = "app-rail-space";
pub const SEARCH_KEY: &str = "app-rail-search";
pub const READER_KEY: &str = "app-rail-reader";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RailPanel {
	Conversations,
	Missions,
	Library,
}

impl RailPanel {
	pub const ALL: [RailPanel; 3] =
		[RailPanel::Conversations, RailPanel::Missions, RailPanel::Library];

	pub const fn key(self) -> &'static str {
		match self {
			RailPanel::Conversations => "app-rail-conversations",
			RailPanel::Missions => "app-rail-missions",
			RailPanel::Library => "app-rail-library",
		}
	}

	fn name(self, language: Language) -> &'static str {
		match self {
			RailPanel::Conversations => bots::rail::CONVERSATIONS,
			RailPanel::Missions => bots::rail::MISSIONS,
			RailPanel::Library => bots::rail::LIBRARY,
		}
		.text(language)
	}

	fn glyph(self, is_current: bool) -> &'static Icon {
		match (self, is_current) {
			(RailPanel::Conversations, false) => &icons::MESSAGE,
			(RailPanel::Conversations, true) => &icons::MESSAGE_FILL,
			(RailPanel::Missions, false) => &icons::FLAG,
			(RailPanel::Missions, true) => &icons::FLAG_FILL,
			(RailPanel::Library, false) => &icons::BOOK,
			(RailPanel::Library, true) => &icons::BOOK_FILL,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RailSettings {
	Space,
	You,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct RailDots {
	pub conversations: Option<BotBadge>,
	pub missions: Option<BotBadge>,
	pub library: Option<BotBadge>,
	pub you: bool,
}

impl RailDots {
	fn of(self, panel: RailPanel) -> Option<BotBadge> {
		match panel {
			RailPanel::Conversations => self.conversations,
			RailPanel::Missions => self.missions,
			RailPanel::Library => self.library,
		}
	}
}

#[derive(Clone, Copy, Default)]
pub struct RailUser<'a> {
	pub name: Option<&'a str>,
	pub image: Option<&'a Image>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum RailMessage {
	OpenSpaceSettings,
	OpenSearch,
	SelectPanel(RailPanel),
	OpenYou,
	SpacesMenu(PickerMessage),
}

pub struct Rail<'a> {
	pub language: Language,
	pub selected: RailPanel,
	pub space: Option<Space<'a>>,
	pub space_host: Option<SpaceHost>,
	pub spaces_menu: Option<SpacesMenu<'a>>,
	pub open_settings: Option<RailSettings>,
	pub dots: RailDots,
	pub user: RailUser<'a>,
	pub update_badge: Option<El>,
	pub has_search: bool,
	pub is_search_open: bool,
	pub has_library: bool,
}

impl<'a> Rail<'a> {
	pub fn new(language: Language, selected: RailPanel) -> Rail<'a> {
		Rail {
			language,
			selected,
			space: None,
			space_host: None,
			spaces_menu: None,
			open_settings: None,
			dots: RailDots::default(),
			user: RailUser::default(),
			update_badge: None,
			has_search: true,
			is_search_open: false,
			has_library: true,
		}
	}

	pub fn view<S: 'static>(self, t: &Tokens, emit: Emit<S, RailMessage>) -> El {
		let mut top = col().gap(ROW_GAP).child(self.space_logo(t, emit));
		if self.has_search {
			top = top.child(self.search_entry(t, emit));
		}
		for panel in RailPanel::ALL {
			if panel != RailPanel::Library || self.has_library {
				top = top.child(self.panel_entry(t, panel, emit));
			}
		}
		let reader = self.reader_entry(t, emit);
		let mut foot = col().gap(ROW_GAP);
		if let Some(badge) = self.update_badge {
			foot = foot.child(row().size(ENTRY, ENTRY).center().child(badge));
		}
		col()
			.key("app-rail")
			.w(WIDTH)
			.h_full()
			.px(INLINE_INSET)
			.pt(TOP_INSET)
			.pb(FOOT_INSET)
			.gap(GROUP_GAP)
			.justify_between()
			.role("navigation")
			.label(bots::rail::LABEL.text(self.language))
			.child(top)
			.child(foot.child(reader))
	}

	pub fn spaces_menu_layer<S: 'static>(
		&self,
		t: &Tokens,
		emit: Emit<S, RailMessage>,
	) -> Option<El> {
		let menu = self.spaces_menu.as_ref().filter(|menu| menu.is_open)?;
		let selected = self.space.map(|space| space.id);
		Some(menu.rail_panel(
			t,
			self.language,
			selected,
			SPACE_LOGO_KEY,
			emit,
			RailMessage::SpacesMenu,
		))
	}

	fn space_logo<S: 'static>(&self, t: &Tokens, emit: Emit<S, RailMessage>) -> El {
		let logo = SpaceAvatar {
			space_id: self.space.map_or("", |space| space.avatar_seed),
			name: self.space.map_or("", |space| space.name),
			colour: self.space.and_then(|space| space.colour),
			size: SpaceAvatarSize::Px26,
			state: SpaceAvatarState::of_host(self.space_host),
			has_attention: false,
		}
		.draw(t);
		let is_current = self.open_settings == Some(RailSettings::Space);
		let Some(menu) = &self.spaces_menu else {
			let name = bots::rail::SPACE_SETTINGS.text(self.language);
			return Entry::new(SPACE_LOGO_KEY, name.to_owned(), logo)
				.current(is_current)
				.view(t)
				.on_press(move |s: &mut S| emit(s, RailMessage::OpenSpaceSettings));
		};
		let name = match self.space {
			Some(space) => said(self.language, bots::spaces::SWITCH, &[("name", space.name)]),
			None => bots::spaces::LABEL.text(self.language).to_owned(),
		};
		let is_open = menu.is_open;
		Entry::new(SPACE_LOGO_KEY, name, logo)
			.current(is_current)
			.expanded(Some(is_open))
			.view(t)
			.on_press(move |s: &mut S| {
				emit(s, RailMessage::SpacesMenu(PickerMessage::OpenChange(!is_open)))
			})
	}

	fn search_entry<S: 'static>(&self, t: &Tokens, emit: Emit<S, RailMessage>) -> El {
		let name = search::OPEN.text(self.language);
		Entry::new(SEARCH_KEY, name.to_owned(), glyph(&icons::SEARCH))
			.expanded(Some(self.is_search_open))
			.view(t)
			.shortcut_hint(search::CHORD.text(self.language))
			.on_press(move |s: &mut S| emit(s, RailMessage::OpenSearch))
	}

	fn panel_entry<S: 'static>(
		&self,
		t: &Tokens,
		panel: RailPanel,
		emit: Emit<S, RailMessage>,
	) -> El {
		let is_current = self.open_settings.is_none() && self.selected == panel;
		let name = panel.name(self.language);
		Entry::new(panel.key(), name.to_owned(), glyph(panel.glyph(is_current)))
			.current(is_current)
			.badge(self.dots.of(panel), self.language)
			.view(t)
			.on_press(move |s: &mut S| emit(s, RailMessage::SelectPanel(panel)))
	}

	fn reader_entry<S: 'static>(&self, t: &Tokens, emit: Emit<S, RailMessage>) -> El {
		let name = self
			.user
			.name
			.filter(|name| !name.trim().is_empty())
			.unwrap_or(bots::roster::conversation::YOU.text(self.language));
		let avatar =
			el().size(READER_AVATAR, READER_AVATAR).radius(READER_AVATAR / 2.0).a11y_hidden();
		let avatar = match self.user.image.filter(|image| image.size().is_some()) {
			Some(image) => avatar.pixels_fit(image.pixels(), SurfaceFit::Fill),
			None => avatar
				.fill(t.rail_avatar)
				.center()
				.child(text(initials_of(name)).font(tight(TEXT_XS_MEDIUM)).color(t.foreground)),
		};
		Entry::new(READER_KEY, name.to_owned(), avatar)
			.current(self.open_settings == Some(RailSettings::You))
			.dot(self.dots.you, self.language)
			.view(t)
			.on_press(move |s: &mut S| emit(s, RailMessage::OpenYou))
	}
}

fn glyph(glyph: &'static Icon) -> El {
	icon(stroked(glyph, GLYPH_STROKE), GLYPH)
}

struct Entry {
	key: &'static str,
	name: String,
	spoken: String,
	content: El,
	is_current: bool,
	expanded: Option<bool>,
	badge: Option<BotBadge>,
	has_dot: bool,
}

impl Entry {
	fn new(key: &'static str, name: String, content: El) -> Entry {
		Entry {
			key,
			spoken: name.clone(),
			name,
			content,
			is_current: false,
			expanded: None,
			badge: None,
			has_dot: false,
		}
	}

	fn current(self, is_current: bool) -> Entry {
		Entry { is_current, ..self }
	}

	fn expanded(self, expanded: Option<bool>) -> Entry {
		Entry { expanded, ..self }
	}

	fn badge(self, badge: Option<BotBadge>, language: Language) -> Entry {
		let Some(badge) = badge else { return self };
		let key = match badge {
			BotBadge::Attention => bots::rail::badge::ATTENTION,
			BotBadge::Done => bots::rail::badge::DONE,
			BotBadge::Failed => bots::rail::badge::FAILED,
		};
		let spoken = said(language, key, &[("name", &self.name)]);
		Entry { badge: Some(badge), spoken, ..self }
	}

	fn dot(self, has_dot: bool, language: Language) -> Entry {
		if !has_dot {
			return self;
		}
		let spoken = said(language, bots::rail::DOT, &[("name", &self.name)]);
		Entry { has_dot, spoken, ..self }
	}

	fn view(self, t: &Tokens) -> El {
		let is_marked = self.is_current || self.expanded == Some(true);
		let ink = if is_marked { t.foreground } else { t.muted_foreground };
		let mut entry = row()
			.key(self.key)
			.size(ENTRY, ENTRY)
			.radius(RADIUS_LG)
			.center()
			.role("button")
			.label(self.spoken)
			.help(self.name)
			.checked(self.is_current)
			.child(self.content.color(ink).group_color(t.foreground));
		if let Some(expanded) = self.expanded {
			entry = entry.expanded(expanded);
		}
		entry = if is_marked {
			entry.fill(t.rail_item_selected)
		} else {
			entry.hover(faded_by(t.rail_item_selected, HOVER_SHARE))
		};
		if let Some(badge) = self.badge {
			entry = entry.child(dot(t, badge_fill(t, badge), badge == BotBadge::Attention));
		} else if self.has_dot {
			entry = entry.child(dot(t, t.primary_strong, false));
		}
		instant(entry.hover_group()).focusable(true).cursor(Cursor::Pointer).focus_ring(
			FOCUS_RING_WIDTH,
			0.0,
			ring_tint(t, 0.3),
		)
	}
}

fn faded_by(colour: Color, share: f32) -> Color {
	colour.alpha(colour.a * share)
}

pub(super) fn badge_fill(t: &Tokens, badge: BotBadge) -> Color {
	match badge {
		BotBadge::Attention => t.warning,
		BotBadge::Done => t.bot_badge_done,
		BotBadge::Failed => t.bot_badge_failed,
	}
}

fn dot(t: &Tokens, fill: Color, pulses: bool) -> El {
	let dot = el()
		.pin(None, Some(DOT_OUTSET), Some(DOT_OUTSET), None)
		.size(DOT, DOT)
		.radius(DOT / 2.0)
		.fill(fill)
		.outline(DOT_RING, 0.0, t.background)
		.a11y_hidden();
	if pulses && !t.reduced_motion {
		dot.looping(LoopSpec::opacity(PULSE_PERIOD, 0.0, PULSE_LOW, 1.0))
	} else {
		dot
	}
}

pub fn rail_hint(
	t: &Tokens,
	language: Language,
	entry_key: &str,
	label: &str,
	has_chord: bool,
) -> El {
	let style = tight(TEXT_XS);
	let mut bubble = row()
		.max_w(HINT_MAX_WIDTH)
		.padding(equal_padding(HINT_HEIGHT, style.size))
		.gap(SPACING * 1.5)
		.radius(RADIUS_XL)
		.fill(t.foreground)
		.center_y()
		.child(text(label.to_owned()).font(style).color(t.background));
	if has_chord {
		bubble = bubble.child(chord(t, language));
	}
	let arrow = el()
		.size(HINT_ARROW, HINT_ARROW)
		.radius(HINT_ARROW_RADIUS)
		.fill(t.foreground)
		.rotate(std::f32::consts::FRAC_PI_4)
		.mr(-HINT_ARROW / 2.0);
	row()
		.key(format!("rail-hint-{entry_key}"))
		.center_y()
		.role("tooltip")
		.label(label)
		.child(arrow)
		.child(bubble)
		.transition(popup_motion(t))
		.anchored(entry_key, Side::Right, Align::Center, SIDE_OFFSET)
}

fn chord(t: &Tokens, language: Language) -> El {
	let style = tight(TEXT_XS_MEDIUM);
	let spoken = search::CHORD.text(language);
	row()
		.min_w(HINT_CHORD_HEIGHT)
		.padding(equal_padding(HINT_CHORD_HEIGHT, style.size))
		.gap(SPACING)
		.radius(RADIUS_LG)
		.fill(t.background.alpha(if t.dark { 0.1 } else { 0.2 }))
		.center()
		.label(spoken)
		.child(icon(&COMMAND, HINT_CHORD_GLYPH).color(t.background))
		.child(
			text(spoken.trim_start_matches(COMMAND_KEY).to_owned()).font(style).color(t.background),
		)
}
