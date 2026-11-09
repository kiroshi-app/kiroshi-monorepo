use rune::runtime::ElementInfo;
use rune::{Color, Cx, El, Env, Key, KeyEvent, Mods, Runtime, row};

use super::{HeaderIdentity, header_identity};
use crate::strings::{Language, chat};
use crate::surfaces::s01_chrome::{ConnectionState, ConnectionStatus};
use crate::tokens::Tokens;

const WIDE: f32 = 480.0;
const NARROW: f32 = 240.0;
const FRAME: f64 = 1.0 / 60.0;
const NAME: &str = "Nest";
const LONG_NAME: &str = "Migration copilot for the legacy billing workspace and its archives";
const STATES: [ConnectionState; 4] = [
	ConnectionState::Checking,
	ConnectionState::Ready,
	ConnectionState::Unavailable,
	ConnectionState::Crashed,
];

struct Header {
	name: &'static str,
	state: ConnectionState,
	version: Option<&'static str>,
	is_settings_open: bool,
	reduced_motion: bool,
	opened: usize,
}

impl Header {
	fn new(state: ConnectionState) -> Header {
		Header {
			name: NAME,
			state,
			version: Some("2.1.233"),
			is_settings_open: false,
			reduced_motion: false,
			opened: 0,
		}
	}
}

fn tokens(s: &Header) -> Tokens {
	Tokens { reduced_motion: s.reduced_motion, ..Tokens::new(false) }
}

fn view(s: &Header, _: &mut Cx<Header>) -> El {
	let identity = HeaderIdentity {
		hue: None,
		connection: ConnectionStatus { name: s.name, state: s.state, version: s.version },
		is_settings_open: s.is_settings_open,
	};
	let opened = |s: &mut Header| s.opened += 1;
	row().w_full().h_full().child(header_identity(&tokens(s), Language::En, &identity, opened))
}

fn laid_out(state: Header, width: f32) -> Runtime<Header> {
	let mut rt = Runtime::new(state, view, (width, 120.0), Env::new(false, 1.0));
	rt.set_tab_visits_controls(true);
	rt.frame(0.0);
	rt
}

fn keyed(rt: &Runtime<Header>, key: &str) -> ElementInfo {
	rt.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.unwrap_or_else(|| panic!("no element keyed {key}"))
}

fn dot(rt: &Runtime<Header>) -> ElementInfo {
	let elements = rt.elements();
	let status = elements
		.iter()
		.position(|element| element.key.as_deref() == Some("connection-status"))
		.expect("the connection status is drawn");
	elements
		.into_iter()
		.find(|element| element.parent == Some(status))
		.expect("the connection status draws its dot")
}

fn right(rect: [f32; 4]) -> f32 {
	rect[0] + rect[2]
}

fn press(rt: &mut Runtime<Header>, key: Key) {
	rt.key(KeyEvent { key, mods: Mods::default() });
	rt.frame(FRAME);
}

#[test]
fn the_name_the_dot_and_the_glyph_hold_their_place_across_the_four_states() {
	let bounds = |state| {
		let rt = laid_out(Header::new(state), WIDE);
		["header-identity", "header-identity-name", "connection-status", "header-identity-settings"]
			.map(|key| keyed(&rt, key).rect)
	};
	let checking = bounds(ConnectionState::Checking);

	for state in STATES {
		assert_eq!(bounds(state), checking, "{state:?} moved a part of the button");
	}
}

#[test]
fn each_state_paints_its_dot_in_its_token() {
	let t = Tokens::new(false);
	let expected: [(ConnectionState, Color); 3] = [
		(ConnectionState::Ready, t.success),
		(ConnectionState::Unavailable, t.destructive),
		(ConnectionState::Crashed, t.destructive),
	];

	for (state, token) in expected {
		let shown = dot(&laid_out(Header::new(state), WIDE));
		assert_eq!(shown.fill, token, "{state:?}");
		assert_eq!(shown.loop_phase, None, "{state:?} pulses");
	}
}

#[test]
fn checking_pulses_in_the_muted_foreground_and_holds_still_under_reduced_motion() {
	let t = Tokens::new(false);
	let pulsing = dot(&laid_out(Header::new(ConnectionState::Checking), WIDE));
	let still = dot(&laid_out(
		Header { reduced_motion: true, ..Header::new(ConnectionState::Checking) },
		WIDE,
	));

	assert_eq!((pulsing.fill, still.fill), (t.muted_foreground, t.muted_foreground));
	assert!(pulsing.loop_phase.is_some());
	assert_eq!(still.loop_phase, None);
}

#[test]
fn a_long_name_clips_and_keeps_the_dot_and_the_glyph_whole() {
	let long = || Header { name: LONG_NAME, ..Header::new(ConnectionState::Ready) };
	let rt = laid_out(long(), NARROW);
	let natural = keyed(&laid_out(long(), WIDE * 4.0), "header-identity-name").rect[2];
	let button = keyed(&rt, "header-identity");
	let name = keyed(&rt, "header-identity-name");
	let status = keyed(&rt, "connection-status");
	let glyph = keyed(&rt, "header-identity-settings");

	assert!(name.rect[2] < natural);
	assert!(right(button.rect) <= NARROW);
	assert!(right(name.rect) <= status.rect[0]);
	assert_eq!(status.visible, status.rect);
	assert_eq!(glyph.visible, glyph.rect);
	assert!(right(glyph.rect) < right(button.rect));
}

#[test]
fn the_button_is_named_after_the_agent_and_the_status_reads_the_version() {
	let rt = laid_out(Header::new(ConnectionState::Ready), WIDE);
	let without_version =
		laid_out(Header { version: None, ..Header::new(ConnectionState::Ready) }, WIDE);
	let button = keyed(&rt, "header-identity");
	let ready = chat::connection::READY.text(Language::En).replace("{{name}}", NAME);

	assert_eq!(button.role, "button");
	assert_eq!(
		button.label.as_deref(),
		Some(chat::screen::IDENTITY.text(Language::En).replace("{{name}}", NAME).as_str())
	);
	assert!(button.label.as_deref().is_some_and(|label| label.contains(NAME)));
	assert_eq!(keyed(&rt, "connection-status").role, "status");
	assert_eq!(keyed(&rt, "connection-status").label, Some(format!("{ready} v2.1.233")));
	assert_eq!(keyed(&without_version, "connection-status").label, Some(ready));
}

#[test]
fn the_button_exposes_whether_the_settings_are_open() {
	let closed = laid_out(Header::new(ConnectionState::Ready), WIDE);
	let open =
		laid_out(Header { is_settings_open: true, ..Header::new(ConnectionState::Ready) }, WIDE);

	assert_eq!(keyed(&closed, "header-identity").expanded, Some(false));
	assert_eq!(keyed(&open, "header-identity").expanded, Some(true));
}

#[test]
fn a_click_asks_for_the_settings_and_leaves_the_button_as_the_caller_holds_it() {
	let mut rt = laid_out(Header::new(ConnectionState::Ready), WIDE);
	let rect = keyed(&rt, "header-identity").rect;
	let (x, y) = (rect[0] + rect[2] / 2.0, rect[1] + rect[3] / 2.0);

	rt.pointer_down(x, y);
	rt.pointer_up(x, y);
	rt.frame(FRAME);

	assert_eq!(rt.state.opened, 1);
	assert_eq!(keyed(&rt, "header-identity").expanded, Some(false));
}

#[test]
fn space_on_the_focused_button_asks_for_the_settings_under_a_visible_ring() {
	let mut rt = laid_out(Header::new(ConnectionState::Ready), WIDE);

	press(&mut rt, Key::Tab);
	let focused = keyed(&rt, "header-identity");
	press(&mut rt, Key::Text(" ".to_owned()));

	assert!(focused.focused && focused.focus_visible);
	assert_eq!(rt.state.opened, 1);
}

#[test]
fn the_hover_fill_lands_on_the_first_frame() {
	let mut rt = laid_out(Header::new(ConnectionState::Ready), WIDE);
	let rect = keyed(&rt, "header-identity").rect;

	rt.pointer_move(rect[0] + rect[2] / 2.0, rect[1] + rect[3] / 2.0);
	rt.frame(FRAME);

	assert_eq!(keyed(&rt, "header-identity").hover, 1.0);
}
