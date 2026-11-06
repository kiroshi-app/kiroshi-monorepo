mod app;
mod content;
mod conversations;
mod discovery;
mod events;
mod host;
mod images;
mod model;
mod onboarding;
mod scenes;
mod tokens;
mod widgets;

use rune::{AppSpec, Cx, El, KeyEvent, Tx, Waker};
use rune_kit::shell;

use crate::app::{App, Screen};

fn view(s: &App, cx: &mut Cx<App>) -> El {
	let dark = cx.system_dark();
	let k = tokens::kit(dark);
	let t = tokens::tokens(dark);
	let mut layer = Vec::new();
	let body = match s.screen {
		Screen::Onboarding(step) => onboarding::view(step, s, &k, &t),
		Screen::Conversations => conversations::view(s, &k, &t, cx.titlebar_inset(), &mut layer),
	};
	rune_kit::root(body, layer)
}

fn setup(s: &mut App, waker: Waker) {
	s.setup(waker);
}

fn poll(s: &mut App, _: f64, _: &mut Tx) -> bool {
	s.poll()
}

fn on_key(s: &mut App, event: &KeyEvent, _: &mut Tx) -> bool {
	if shell::is_sidebar_toggle(event) {
		s.sidebar.toggle();
		return true;
	}
	false
}

fn main() {
	let spec = AppSpec {
		setup: Some(setup),
		poll: Some(poll),
		on_key: Some(on_key),
		min_size: Some((720.0, 520.0)),
		scenes: scenes::SCENES,
		..AppSpec::new("Kiroshi (Rune preview)", (1180.0, 780.0), App::new, view)
	};
	rune::App::new(spec).chrome(conversations::CHROME).run();
}
