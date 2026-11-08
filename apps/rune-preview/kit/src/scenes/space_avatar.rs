use rune::{El, col, row, text};

use super::SceneState;
use crate::hues::Preset;
use crate::surfaces::s02_rail::{SpaceAvatar, SpaceAvatarSize, SpaceAvatarState};
use crate::tokens::{RADIUS_CONTROL, RADIUS_SM, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_XS, Tokens};

pub(super) const STATES_STAGE: (f32, f32) = (480.0, 640.0);

const SPACE_ID: &str = "space-release-desk";
const SPACE_NAME: &str = "Release desk";
const PADDED: f32 = SPACING * 4.0;
const COLUMN_GAP: f32 = SPACING * 5.0;
const ROW_GAP: f32 = SPACING * 4.0;
const LABEL_ROW: f32 = SPACING * 4.0;
const DRAWN: [SpaceAvatarSize; 3] =
	[SpaceAvatarSize::Px48, SpaceAvatarSize::Px26, SpaceAvatarSize::Px14];
const FREE_HUE: f32 = 210.0;
const RAIL_WIDTH: f32 = SPACING * 13.0;
const RAIL_SLOT: f32 = SPACING * 8.0;
const RAIL_GAP: f32 = SPACING * 2.0;
const RAIL_BLOCK: f32 = SPACING * 3.0;
const MENU_WIDTH: f32 = SPACING * 58.0;
const MENU_INSET: f32 = SPACING * 1.5;
const MENU_ROW: f32 = SPACING * 10.0;
const MENU_ROW_INSET: f32 = SPACING * 2.0;
const CURRENT_SPACE: &str = "atelier";

struct Mixed {
	id: &'static str,
	name: &'static str,
	colour: Option<f32>,
	state: SpaceAvatarState,
}

const MIXED: [Mixed; 5] = [
	Mixed { id: "atelier", name: "Atelier", colour: Some(250.0), state: SpaceAvatarState::Local },
	Mixed {
		id: "harbour-studio",
		name: "Harbour Studio",
		colour: Some(236.0),
		state: SpaceAvatarState::Online,
	},
	Mixed { id: "personal", name: "Personal", colour: None, state: SpaceAvatarState::Local },
	Mixed {
		id: "fieldwork",
		name: "Fieldwork",
		colour: Some(145.0),
		state: SpaceAvatarState::Offline,
	},
	Mixed {
		id: "quarry-labs",
		name: "Quarry Labs",
		colour: Some(28.0),
		state: SpaceAvatarState::Online,
	},
];

const STATES: [(&str, SpaceAvatarState, bool); 8] = [
	("Local", SpaceAvatarState::Local, false),
	("Shared", SpaceAvatarState::Shared, false),
	("Online", SpaceAvatarState::Online, false),
	("Online + attention", SpaceAvatarState::Online, true),
	("Connecting", SpaceAvatarState::Connecting, false),
	("Not connected", SpaceAvatarState::Offline, false),
	("Invitation", SpaceAvatarState::Invitation, false),
	("Joining", SpaceAvatarState::Joining, false),
];

fn coloured() -> Option<f32> {
	Some(Preset::Blue.hue())
}

fn avatar(t: &Tokens, size: SpaceAvatarSize, colour: Option<f32>, state: SpaceAvatarState) -> El {
	SpaceAvatar { space_id: SPACE_ID, name: SPACE_NAME, colour, size, state, has_attention: false }
		.draw(t)
}

fn label(t: &Tokens, line: &str) -> El {
	text(line.to_owned()).font(TEXT_XS).color(t.foreground)
}

fn grid(columns: Vec<Vec<El>>, heights: &[f32]) -> El {
	row().gap(COLUMN_GAP).children(columns.into_iter().map(|cells| {
		col().gap(ROW_GAP).items_center().children(
			cells
				.into_iter()
				.zip(heights)
				.map(|(cell, height)| row().h(*height).center().child(cell)),
		)
	}))
}

fn padded(t: &Tokens, content: El) -> El {
	rune_kit::root(
		col().w_full().h_full().fill(t.background).padding(PADDED).items_start().child(content),
		Vec::new(),
	)
}

fn size_row(t: &Tokens, state: SpaceAvatarState, colour: Option<f32>, name: &'static str) -> El {
	let columns = DRAWN
		.iter()
		.map(|&size| {
			let face =
				SpaceAvatar { space_id: SPACE_ID, name, colour, size, state, has_attention: false };
			vec![label(t, &size.side().to_string()), face.draw(t)]
		})
		.collect();
	grid(columns, &[LABEL_ROW, SpaceAvatarSize::Px48.side()])
}

pub(super) fn sizes(t: &Tokens, _: &SceneState) -> El {
	let rows = [("Coloured", coloured()), ("Personal", None)];
	let mut columns = vec![
		std::iter::once(label(t, "")).chain(rows.iter().map(|(name, _)| label(t, name))).collect(),
	];
	columns.extend(SpaceAvatarSize::ALL.iter().map(|&size| {
		std::iter::once(label(t, &size.side().to_string()))
			.chain(rows.iter().map(|(_, colour)| avatar(t, size, *colour, SpaceAvatarState::Local)))
			.collect()
	}));
	let tallest = SpaceAvatarSize::Px64.side();
	padded(t, grid(columns, &[LABEL_ROW, tallest, tallest]))
}

pub(super) fn free_hue(t: &Tokens, _: &SceneState) -> El {
	padded(t, avatar(t, SpaceAvatarSize::Px48, Some(FREE_HUE), SpaceAvatarState::Local))
}

pub(super) fn states(t: &Tokens, _: &SceneState) -> El {
	let variants = [
		("14", SpaceAvatarSize::Px14, coloured()),
		("48", SpaceAvatarSize::Px48, coloured()),
		("48 Personal", SpaceAvatarSize::Px48, None),
	];
	let mut columns = vec![
		std::iter::once(label(t, ""))
			.chain(STATES.iter().map(|(name, _, _)| label(t, name)))
			.collect(),
	];
	columns.extend(variants.iter().map(|&(name, size, colour)| {
		std::iter::once(label(t, name))
			.chain(STATES.iter().map(|&(_, state, has_attention)| {
				SpaceAvatar {
					space_id: SPACE_ID,
					name: SPACE_NAME,
					colour,
					size,
					state,
					has_attention,
				}
				.draw(t)
			}))
			.collect()
	}));
	let mut heights = vec![LABEL_ROW];
	heights.extend([SpaceAvatarSize::Px48.side(); 8]);
	padded(t, grid(columns, &heights))
}

pub(super) fn local(t: &Tokens, _: &SceneState) -> El {
	padded(t, size_row(t, SpaceAvatarState::Local, coloured(), SPACE_NAME))
}

pub(super) fn shared_online(t: &Tokens, _: &SceneState) -> El {
	padded(
		t,
		col().child(size_row(t, SpaceAvatarState::Shared, coloured(), SPACE_NAME)).child(size_row(
			t,
			SpaceAvatarState::Online,
			coloured(),
			SPACE_NAME,
		)),
	)
}

pub(super) fn offline(t: &Tokens, _: &SceneState) -> El {
	padded(t, size_row(t, SpaceAvatarState::Offline, coloured(), SPACE_NAME))
}

pub(super) fn without_name(t: &Tokens, _: &SceneState) -> El {
	padded(
		t,
		col().child(size_row(t, SpaceAvatarState::Local, coloured(), "")).child(size_row(
			t,
			SpaceAvatarState::Local,
			coloured(),
			"   ",
		)),
	)
}

fn mixed_avatar(t: &Tokens, space: &Mixed) -> El {
	SpaceAvatar {
		space_id: space.id,
		name: space.name,
		colour: space.colour,
		size: SpaceAvatarSize::Px26,
		state: space.state,
		has_attention: false,
	}
	.draw(t)
}

pub(super) fn rail_mixed_states(t: &Tokens, _: &SceneState) -> El {
	let slots = MIXED
		.iter()
		.map(|space| row().size(RAIL_SLOT, RAIL_SLOT).center().child(mixed_avatar(t, space)));
	padded(
		t,
		col()
			.w(RAIL_WIDTH)
			.py(RAIL_BLOCK)
			.gap(RAIL_GAP)
			.items_center()
			.radius(RADIUS_XL)
			.border(1.0, t.sidebar_border)
			.fill(t.sidebar)
			.children(slots),
	)
}

pub(super) fn spaces_menu_mixed_states(t: &Tokens, _: &SceneState) -> El {
	let rows = MIXED.iter().map(|space| {
		let menu_row = row()
			.h(MENU_ROW)
			.px(MENU_ROW_INSET)
			.gap(SPACING * 2.0)
			.radius(RADIUS_SM)
			.center_y()
			.child(mixed_avatar(t, space))
			.child(text(space.name.to_owned()).font(TEXT_COMPACT).color(t.foreground));
		if space.id == CURRENT_SPACE { menu_row.fill(t.accent) } else { menu_row }
	});
	padded(
		t,
		col()
			.w(MENU_WIDTH)
			.padding(MENU_INSET)
			.radius(RADIUS_CONTROL)
			.border(1.0, t.border)
			.fill(t.popover)
			.children(rows),
	)
}
