use rune::{El, col, row};

use super::{HeaderIdentity, header_identity};
use crate::scenes::{Pointer, Scene, SceneState, THEMES};
use crate::strings::Language;
use crate::surfaces::s01_chrome::{ConnectionState, ConnectionStatus};
use crate::tokens::{SPACING, Tokens};

const STAGE: (f32, f32) = (SPACING * 60.0, SPACING * 30.0);
const MOBILE: (f32, f32) = (390.0, SPACING * 30.0);
const APP_HEADER: f32 = SPACING * 12.0;
const NAME: &str = "Nest";
const LONG_NAME: &str = "Migration copilot for the legacy billing workspace and its archives";
const VERSION: &str = "2.1.233";

fn identity(name: &str, state: ConnectionState, is_settings_open: bool) -> HeaderIdentity<'_> {
	HeaderIdentity {
		hue: None,
		connection: ConnectionStatus { name, state, version: Some(VERSION) },
		is_settings_open,
	}
}

fn button(t: &Tokens, shown: &HeaderIdentity) -> El {
	header_identity(t, Language::En, shown, |_: &mut SceneState| {})
}

fn centered(t: &Tokens, shown: &HeaderIdentity) -> El {
	rune_kit::root(
		row().w_full().h_full().fill(t.background).center().child(button(t, shown)),
		Vec::new(),
	)
}

fn closed(t: &Tokens, state: ConnectionState) -> El {
	centered(t, &identity(NAME, state, false))
}

fn expanded(t: &Tokens, _: &SceneState) -> El {
	centered(t, &identity(NAME, ConnectionState::Ready, true))
}

fn long_content(t: &Tokens, _: &SceneState) -> El {
	let header = row()
		.w_full()
		.h(APP_HEADER)
		.pl(SPACING * 1.5)
		.pr(SPACING * 2.5)
		.center_y()
		.child(button(t, &identity(LONG_NAME, ConnectionState::Ready, false)));
	rune_kit::root(col().w_full().h_full().fill(t.background).child(header), Vec::new())
}

const fn scene(id: &'static str, size: (f32, f32), view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed: "", keys: "", themes: &THEMES, view }
}

pub static SCENES: &[Scene] = &[
	scene("navigation-headeridentitybutton--checking", STAGE, |t, _| {
		closed(t, ConnectionState::Checking)
	}),
	scene("navigation-headeridentitybutton--ready", STAGE, |t, _| {
		closed(t, ConnectionState::Ready)
	}),
	scene("navigation-headeridentitybutton--unavailable", STAGE, |t, _| {
		closed(t, ConnectionState::Unavailable)
	}),
	scene("navigation-headeridentitybutton--crashed", STAGE, |t, _| {
		closed(t, ConnectionState::Crashed)
	}),
	scene("navigation-headeridentitybutton--expanded", STAGE, expanded),
	scene("navigation-headeridentitybutton--long-content", MOBILE, long_content),
];
