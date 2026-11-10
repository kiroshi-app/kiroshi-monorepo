use rune::image::Image;
use rune::runtime::ElementInfo;
use rune::{Color, Cx, El, Env, Key, KeyEvent, Mods, Runtime, row};

use super::super::scenes::picture;
use super::{HeaderIdentity, header_identity};
use crate::avatar::{Activity, Motion};
use crate::strings::{Language, chat};
use crate::surfaces::s01_chrome::{ConnectionState, ConnectionStatus};
use crate::tokens::{Tokens, faded};

const WIDE: f32 = 480.0;
const NARROW: f32 = 240.0;
const FRAME: f64 = 1.0 / 60.0;
const NAME: &str = "Nest";
const LONG_NAME: &str = "Migration copilot for the legacy billing workspace and its archives";
const TITLE: &str = "Release manager";
const WRITING: Motion = Motion::Running { activity: Activity::Writing, at_ms: 600.0 };
const PARTS: [&str; 4] =
	["header-identity", "header-identity-name", "connection-status", "header-identity-settings"];
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
	title: Option<&'static str>,
	image: Option<&'static Image>,
	motion: Motion,
	is_settings_open: bool,
	reduced_motion: bool,
	is_dark: bool,
	opened: usize,
}

impl Header {
	fn new(state: ConnectionState) -> Header {
		Header {
			name: NAME,
			state,
			version: Some("2.1.233"),
			title: None,
			image: None,
			motion: Motion::Still,
			is_settings_open: false,
			reduced_motion: false,
			is_dark: false,
			opened: 0,
		}
	}
}

fn tokens(s: &Header) -> Tokens {
	Tokens { reduced_motion: s.reduced_motion, ..Tokens::new(s.is_dark) }
}

fn view(s: &Header, _: &mut Cx<Header>) -> El {
	let identity = HeaderIdentity {
		hue: None,
		title: s.title,
		image: s.image,
		motion: s.motion,
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

fn labelled(rt: &Runtime<Header>, label: &str) -> (ElementInfo, Vec<ElementInfo>) {
	let elements = rt.elements();
	let at = elements
		.iter()
		.position(|element| element.label.as_deref() == Some(label))
		.unwrap_or_else(|| panic!("no element labelled {label}"));
	let children = elements.iter().filter(|element| element.parent == Some(at)).cloned().collect();
	(elements[at].clone(), children)
}

fn ready() -> Header {
	Header::new(ConnectionState::Ready)
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
		PARTS.map(|key| keyed(&rt, key).rect)
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

#[test]
fn open_settings_fill_the_button_in_full_muted_and_ink_the_name_in_foreground_in_both_themes() {
	for is_dark in [false, true] {
		let t = Tokens::new(is_dark);
		let open =
			Header { is_settings_open: true, is_dark, ..Header::new(ConnectionState::Ready) };
		let rt = laid_out(open, WIDE);

		assert_eq!(keyed(&rt, "header-identity").fill, t.muted, "dark: {is_dark}");
		assert_eq!(keyed(&rt, "header-identity-name").text_color, Some(t.foreground));
	}
}

#[test]
fn a_running_avatar_keeps_every_part_where_it_rests_with_and_without_reduced_motion() {
	let bounds = |header: Header| {
		let rt = laid_out(header, WIDE);
		PARTS.map(|key| keyed(&rt, key).rect)
	};
	let still = bounds(ready());

	for reduced_motion in [false, true] {
		let running = Header { motion: WRITING, reduced_motion, ..ready() };
		assert_eq!(bounds(running), still, "reduced motion: {reduced_motion}");
	}
}

#[test]
fn a_provided_image_covers_the_whole_avatar_under_the_hexagon_outline_and_the_field_draws_alone_otherwise()
 {
	let pictured = laid_out(Header { image: Some(picture()), ..ready() }, WIDE);
	let field = laid_out(ready(), WIDE);
	let elements = pictured.elements();
	let (avatar, layers) = labelled(&pictured, NAME);
	let [picture, outline] = layers.as_slice() else { panic!("a picture and its outline") };
	let mut cut = elements.iter().position(|element| element.path == picture.path);
	let mut depth = 0;
	while let Some(at) = cut {
		assert_eq!(elements[at].rect, avatar.rect, "a cut layer leaves the avatar square");
		depth += 1;
		cut = elements.iter().position(|element| element.parent == Some(at));
	}

	assert!(labelled(&field, NAME).1.is_empty());
	assert_eq!(depth, 11, "ten hexagon cuts around the picture");
	assert_eq!(outline.rect, avatar.rect);
}

#[test]
fn a_title_sits_after_the_name_as_the_line_badge_in_both_themes() {
	for is_dark in [false, true] {
		let t = Tokens::new(is_dark);
		let rt = laid_out(Header { title: Some(TITLE), is_dark, ..ready() }, WIDE);
		let badge = keyed(&rt, "header-identity-title");
		let label = rt
			.elements()
			.into_iter()
			.find(|element| element.text.as_deref() == Some(TITLE))
			.expect("the title is written");

		assert_eq!(badge.fill, faded(t.foreground, 0.08), "dark: {is_dark}");
		assert_eq!(label.text_color, Some(t.soft_foreground), "dark: {is_dark}");
		assert_eq!(badge.rect[3], 20.0);
		assert!(right(keyed(&rt, "header-identity-name").rect) <= badge.rect[0]);
		assert!(right(badge.rect) <= keyed(&rt, "connection-status").rect[0]);
	}
}

#[test]
fn an_absent_or_empty_title_draws_no_badge_and_leaves_no_gap() {
	let status = |header: Header| {
		let rt = laid_out(header, WIDE);
		assert!(rt.elements().iter().all(|e| e.key.as_deref() != Some("header-identity-title")));
		keyed(&rt, "connection-status").rect
	};

	assert_eq!(status(Header { title: Some(""), ..ready() }), status(ready()));
}

#[test]
fn a_long_name_with_a_title_clips_the_name_and_keeps_the_title_the_dot_and_the_glyph_whole() {
	let long = || Header { name: LONG_NAME, title: Some(TITLE), ..ready() };
	let rt = laid_out(long(), NARROW * 1.5);
	let wide = laid_out(long(), WIDE * 4.0);
	let name = keyed(&rt, "header-identity-name");
	let title = keyed(&rt, "header-identity-title");

	assert!(name.rect[2] < keyed(&wide, "header-identity-name").rect[2]);
	assert_eq!(title.rect[2], keyed(&wide, "header-identity-title").rect[2]);
	assert_eq!(title.visible, title.rect);
	for key in ["connection-status", "header-identity-settings"] {
		let part = keyed(&rt, key);
		assert_eq!(part.visible, part.rect, "{key}");
	}
	assert!(right(keyed(&rt, "header-identity").rect) <= NARROW * 1.5);
}

#[test]
fn the_image_the_animation_and_the_title_stay_out_of_the_accessible_name() {
	let dressed = Header { title: Some(TITLE), image: Some(picture()), motion: WRITING, ..ready() };
	let label = |header: Header| keyed(&laid_out(header, WIDE), "header-identity").label;

	assert_eq!(label(dressed), label(ready()));
}
