mod app;
mod avatar;
mod composer;
mod content;
mod conversations;
mod dev_profile;
mod discovery;
mod events;
mod host;
mod hues;
mod icons;
mod images;
mod local;
mod longest;
mod math;
mod mission;
mod model;
mod onboarding;
mod runs;
mod scenes;
mod smoke;
mod spike;
mod tokens;
mod turn;
mod widgets;

use std::process::ExitCode;
use std::time::Duration;

use rune::{AppSpec, Cx, El, KeyEvent, Tx, Waker, el};
use rune_kit::shell;

use crate::app::{App, Screen};
use crate::host::Profile;

fn view(s: &App, cx: &mut Cx<App>) -> El {
	let dark = cx.system_dark();
	let t = tokens::Tokens { reduced_motion: cx.is_reduced_motion(), ..tokens::Tokens::new(dark) };
	if let Screen::BlockSpike = s.screen {
		return spike::view::view(s, cx, &t);
	}
	let k = t.kit();
	let body = match s.screen {
		Screen::Onboarding(step) => onboarding::view(step, s, &k, &t.in_space(Some(tokens::BLUE))),
		Screen::Conversations => {
			let viewport = conversations::Viewport {
				inset: cx.titlebar_inset(),
				transcript_height: cx.layout(conversations::TRANSCRIPT).map(|rect| rect[3]),
				composer: composer::Measured {
					surface_width: cx.layout(composer::COMPOSER_SURFACE).map(|rect| rect[2]),
					text_width: cx.layout(composer::COMPOSER_MIRROR).map(|rect| rect[2]),
				},
			};
			conversations::view(s, &k, &t, &viewport)
		}
		Screen::BlockSpike => el(),
	};
	rune_kit::root(body, Vec::new())
}

const DEV_HOST: &str = "--dev-host";

const SKIP_ONBOARDING: &str = "--skip-onboarding";

fn setup(s: &mut App, waker: Waker) {
	let flagged = |flag: &str| std::env::args().any(|arg| arg == flag);
	if flagged(DEV_HOST) {
		s.host_profile = Profile::Dev;
	}
	if flagged(DEV_HOST) || flagged(SKIP_ONBOARDING) {
		s.screen = Screen::Conversations;
	}
	s.setup(waker);
}

fn poll(s: &mut App, seconds: f64, tx: &mut Tx) -> bool {
	let changed = s.poll();
	if !s.tick(seconds) {
		return changed;
	}
	tx.wake_after(Duration::ZERO);
	true
}

fn on_key(s: &mut App, event: &KeyEvent, _: &mut Tx) -> bool {
	if shell::is_sidebar_toggle(event) {
		s.sidebar.toggle();
		return true;
	}
	false
}

const SMOKE_SEND: &str = "--smoke-send";

const SMOKE_READ: &str = "--smoke-read";

const LOCAL_SEND: &str = "--local-send";

fn main() -> ExitCode {
	let args: Vec<String> = std::env::args().collect();
	if let Some(at) = args.iter().position(|arg| arg == SMOKE_SEND) {
		let Some(text) = args.get(at + 1) else {
			eprintln!("{SMOKE_SEND} needs the text to send");
			return ExitCode::FAILURE;
		};
		return smoke::run(text);
	}
	if args.iter().any(|arg| arg == SMOKE_READ) {
		return smoke::read();
	}
	if let Some(at) = args.iter().position(|arg| arg == LOCAL_SEND) {
		let Some(text) = args.get(at + 1) else {
			eprintln!("{LOCAL_SEND} needs the text to send");
			return ExitCode::FAILURE;
		};
		return local::send_and_read(text);
	}
	let spec = AppSpec {
		setup: Some(setup),
		poll: Some(poll),
		on_key: Some(on_key),
		min_size: Some((720.0, 520.0)),
		scenes: scenes::SCENES,
		fonts: tokens::FONTS,
		families: tokens::FAMILIES,
		..AppSpec::new("Kiroshi (Rune preview)", (1180.0, 780.0), App::new, view)
	};
	rune::App::new(spec).chrome(conversations::CHROME).run();
	ExitCode::SUCCESS
}
