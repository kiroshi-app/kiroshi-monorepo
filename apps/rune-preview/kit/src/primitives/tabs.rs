use rune::{Cursor, El, col, el, row, text};

use super::{DISABLED_OPACITY, FOCUS_RING_WIDTH, equal_padding, instant, ring_tint, tight};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TabsVariant {
	#[default]
	Default,
	Line,
}

impl TabsVariant {
	pub const ALL: [TabsVariant; 2] = [TabsVariant::Default, TabsVariant::Line];
}

pub struct Tab<'a> {
	pub label: &'a str,
	pub active: bool,
	pub disabled: bool,
}

impl<'a> Tab<'a> {
	pub fn new(label: &'a str) -> Tab<'a> {
		Tab { label, active: false, disabled: false }
	}

	pub fn active(self) -> Tab<'a> {
		Tab { active: true, ..self }
	}

	pub fn disabled(self) -> Tab<'a> {
		Tab { disabled: true, ..self }
	}
}

const LIST_HEIGHT: f32 = SPACING * 8.0;
const LIST_INSET: f32 = 3.0;
const UNDERLINE: f32 = 2.0;
const UNDERLINE_GAP: f32 = 5.0;

pub fn tabs_list<'a>(
	t: &Tokens,
	variant: TabsVariant,
	tabs: impl IntoIterator<Item = Tab<'a>>,
) -> El {
	let list = row().padding(LIST_INSET).radius(RADIUS_2XL).center_y().role("tablist");
	let list = match variant {
		TabsVariant::Default => list.fill(t.muted),
		TabsVariant::Line => list.gap(SPACING),
	};
	list.children(tabs.into_iter().map(|tab| trigger(t, variant, tab)))
}

fn trigger(t: &Tokens, variant: TabsVariant, tab: Tab) -> El {
	let style = tight(TEXT_SM_MEDIUM);
	let height = LIST_HEIGHT - LIST_INSET * 2.0 - 1.0;
	let selected_fill = match variant {
		TabsVariant::Line => t.background.alpha(0.0),
		TabsVariant::Default if t.dark => faded(t.input, 0.3),
		TabsVariant::Default => t.background,
	};
	let ink = if tab.active { t.foreground } else { faded(t.foreground, 0.6) };
	let mut trigger = row()
		.key(format!("tab-{}", tab.label))
		.padding(equal_padding(height, style.size))
		.gap(SPACING * 1.5)
		.radius(RADIUS_2XL)
		.center()
		.role("tab")
		.label(tab.label)
		.checked(tab.active)
		.child(text(tab.label.to_owned()).font(style).color(ink).group_color(t.foreground).wrap());
	if tab.active {
		trigger = trigger.fill(selected_fill);
		if t.dark && variant == TabsVariant::Default {
			trigger = trigger.border(1.0, t.input);
		}
		if variant == TabsVariant::Line {
			let below = height + UNDERLINE_GAP - UNDERLINE;
			trigger =
				trigger.child(el().w_full().h(UNDERLINE).fill(t.foreground).absolute(0.0, below));
		}
	}
	let trigger = instant(trigger.hover_group());
	if tab.disabled {
		return trigger.disabled(true).opacity(DISABLED_OPACITY);
	}
	trigger.focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.5),
	)
}

pub fn tab_panel(t: &Tokens, body: &str) -> El {
	text(body.to_owned()).font(TEXT_SM).color(t.foreground).role("tabpanel")
}

pub fn tabs(list: El, panel: Option<El>) -> El {
	col().gap(SPACING * 2.0).child(list).children(panel)
}
