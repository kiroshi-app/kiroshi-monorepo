use std::sync::{Arc, OnceLock};

use rune::image::{Image, ImageCache};
use rune::{El, col, row};

use super::{HeaderIdentity, header_identity};
use crate::avatar::{Activity, Motion};
use crate::hues::Preset;
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
const TITLE: &str = "Release manager";
const WORKING_AT_MS: f64 = 600.0;
const PICTURE_SIDE: f32 = SPACING * 6.0;
const PICTURE_SCALE: f32 = 2.0;
const PICTURE: &str = r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f6b26b"/><stop offset="1" stop-color="#8e7cc3"/></linearGradient></defs><rect width="24" height="24" fill="url(#sky)"/><circle cx="12" cy="10" r="5" fill="#fff2cc"/><rect y="16" width="24" height="8" fill="#38761d"/></svg>"##;

fn identity(name: &str, state: ConnectionState, is_settings_open: bool) -> HeaderIdentity<'_> {
	HeaderIdentity {
		hue: None,
		title: None,
		image: None,
		motion: Motion::Still,
		connection: ConnectionStatus { name, state, version: Some(VERSION) },
		is_settings_open,
	}
}

pub(super) fn picture() -> &'static Image {
	static PICTURE_IMAGE: OnceLock<Image> = OnceLock::new();
	PICTURE_IMAGE.get_or_init(|| {
		let image = ImageCache::new(Arc::new(|| {})).svg(
			PICTURE.as_bytes().to_vec(),
			PICTURE_SIDE,
			PICTURE_SCALE,
		);
		if let Err(failure) = image.wait() {
			eprintln!("the agent picture didn't decode: {}", failure.0);
		}
		image
	})
}

fn ready() -> HeaderIdentity<'static> {
	identity(NAME, ConnectionState::Ready, false)
}

fn blue() -> HeaderIdentity<'static> {
	HeaderIdentity { hue: Some(Preset::Blue.hue()), ..ready() }
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

fn in_header(t: &Tokens, shown: &HeaderIdentity) -> El {
	let header = row()
		.w_full()
		.h(APP_HEADER)
		.pl(SPACING * 1.5)
		.pr(SPACING * 2.5)
		.center_y()
		.child(button(t, shown));
	rune_kit::root(col().w_full().h_full().fill(t.background).child(header), Vec::new())
}

fn long_content(t: &Tokens, _: &SceneState) -> El {
	in_header(t, &identity(LONG_NAME, ConnectionState::Ready, false))
}

fn long_content_with_title(t: &Tokens, _: &SceneState) -> El {
	in_header(
		t,
		&HeaderIdentity {
			title: Some(TITLE),
			..identity(LONG_NAME, ConnectionState::Ready, false)
		},
	)
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
	scene("navigation-headeridentitybutton--preset-hue", STAGE, |t, _| centered(t, &blue())),
	scene("navigation-headeridentitybutton--working", STAGE, |t, _| {
		let motion = Motion::Running { activity: Activity::Writing, at_ms: WORKING_AT_MS };
		centered(t, &HeaderIdentity { motion, ..blue() })
	}),
	scene("navigation-headeridentitybutton--with-image", STAGE, |t, _| {
		centered(t, &HeaderIdentity { image: Some(picture()), ..ready() })
	}),
	scene("navigation-headeridentitybutton--with-title", STAGE, |t, _| {
		centered(t, &HeaderIdentity { title: Some(TITLE), ..ready() })
	}),
	scene(
		"navigation-headeridentitybutton--long-content-with-title",
		MOBILE,
		long_content_with_title,
	),
];
