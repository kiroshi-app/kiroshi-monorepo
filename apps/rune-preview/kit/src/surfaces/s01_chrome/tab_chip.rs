use rune::{El, icon, row, spacer, text};

use super::title_bar::{ChromeTab, ICON_SLOT, TAB_HEIGHT, TAB_TITLE, TabIcon, tab_icon};
use super::{chip_shadows, lifted_shadow};
use crate::icons;
use crate::strings::Language;
use crate::tokens::{RADIUS_MD, SPACING, Tokens};

const TITLE_MAX_WIDTH: f32 = SPACING * 50.0;
const CLOSE_SLOT: f32 = SPACING * 4.5;
const CLOSE_GLYPH: f32 = SPACING * 3.0;
const ALONE_GLYPH: f32 = SPACING * 3.75;
const NOT_ALLOWED_OPACITY: f32 = 0.75;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ChipPlacement {
	#[default]
	Alone,
	Strip,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum DockTarget {
	Outside,
	SameSpace,
	OtherSpace,
}

pub fn tab_chip(
	t: &Tokens,
	title: &str,
	glyph: TabIcon,
	placement: ChipPlacement,
	is_not_allowed: bool,
) -> El {
	let (start, end, slot) = match placement {
		ChipPlacement::Alone => (SPACING * 1.75, SPACING, ALONE_GLYPH),
		ChipPlacement::Strip => (SPACING * 2.0, SPACING * 1.25, ICON_SLOT),
	};
	let chip = row()
		.key("title-bar-tab-chip")
		.h(TAB_HEIGHT)
		.pl(start)
		.pr(end)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(RADIUS_MD)
		.fill(t.title_bar_menu)
		.children([
			row().size(slot, slot).center().child(tab_icon(t, glyph)),
			text(title.to_owned())
				.font(TAB_TITLE)
				.color(t.foreground)
				.truncate()
				.shrink()
				.max_w(TITLE_MAX_WIDTH),
			spacer(),
			row()
				.size(CLOSE_SLOT, CLOSE_SLOT)
				.center()
				.child(icon(&icons::CLOSE, CLOSE_GLYPH).color(t.muted_foreground)),
		]);
	let chip = match placement {
		ChipPlacement::Alone => chip_shadows(t)
			.into_iter()
			.fold(chip, |chip, shadow| chip.box_shadow(shadow))
			.outline(1.0, 0.0, t.title_bar_menu_border),
		ChipPlacement::Strip => chip.box_shadow(lifted_shadow()),
	};
	if is_not_allowed { chip.opacity(NOT_ALLOWED_OPACITY) } else { chip }
}

pub fn drag_ghost(
	t: &Tokens,
	language: Language,
	tab: &ChromeTab,
	target: DockTarget,
) -> Option<El> {
	(target != DockTarget::SameSpace).then(|| {
		tab_chip(
			t,
			&tab.title.display(language),
			tab.icon,
			ChipPlacement::Alone,
			target == DockTarget::OtherSpace,
		)
	})
}
