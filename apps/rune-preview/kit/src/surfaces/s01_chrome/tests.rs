use rune::{Cx, El, Env, Key, KeyEvent, Mods, PointerButton, Runtime, col};

use super::{
	CONVERSATION, ChromeEvent, ChromeTab, DockTarget, Incoming, Landing, Lift, TabMenu, TitleBar,
	WindowControls, drag_ghost, incoming_index, tab_menu, title_bar,
};
use crate::icons;
use crate::strings::Language;
use crate::tokens::Tokens;

static INBOX: ChromeTab = ChromeTab::new("inbox", "Inbox", &icons::BELL).pinned();
static ROADMAP: ChromeTab = ChromeTab::new("roadmap", "Roadmap", &CONVERSATION).pinned();
static RELEASE: ChromeTab = ChromeTab::new("release", "Release notes", &CONVERSATION);
static LOGIN: ChromeTab = ChromeTab::new("login", "Fix the login redirect", &icons::FLAG);
static WEEKLY: ChromeTab = ChromeTab::new("weekly", "Weekly planning", &CONVERSATION);
static INVOICE: ChromeTab = ChromeTab::new("invoice", "Invoice export", &icons::FLAG);
static PRICING: ChromeTab = ChromeTab::new("pricing", "Pricing page", &CONVERSATION);
static ROW: [ChromeTab; 6] = [INBOX, ROADMAP, RELEASE, LOGIN, WEEKLY, INVOICE];

const WIDTH: f32 = 1280.0;
const FRAME: f64 = 1.0 / 60.0;

struct Window {
	can_reorder: bool,
	menu: Option<TabMenu<'static>>,
	controls: Option<WindowControls>,
	lift: Option<Lift>,
	events: Vec<ChromeEvent>,
}

fn record(s: &mut Window, event: ChromeEvent) {
	match &event {
		ChromeEvent::LiftMoved(lift) => s.lift = Some(lift.clone()),
		ChromeEvent::LiftEnded(_) => s.lift = None,
		_ => {}
	}
	s.events.push(event);
}

fn bar(s: &Window) -> TitleBar<'_> {
	TitleBar {
		width: WIDTH,
		language: Language::En,
		tabs: &ROW,
		active: Some(RELEASE.id),
		can_go_back: true,
		can_go_forward: false,
		can_reorder: s.can_reorder,
		traffic_lights: s.controls.is_none(),
		window_controls: s.controls,
		lift: s.lift.as_ref(),
		incoming: None,
		overflow_open: false,
	}
}

fn view(s: &Window, _: &mut Cx<Window>) -> El {
	let t = Tokens::new(false);
	let bar = bar(s);
	let menu = s.menu.and_then(|menu| tab_menu(&t, &bar, menu, record));
	rune_kit::root(col().w_full().h_full().child(title_bar(&t, &bar, record)), menu)
}

fn window(can_reorder: bool) -> Runtime<Window> {
	window_with(Window { can_reorder, menu: None, controls: None, lift: None, events: Vec::new() })
}

fn window_with(state: Window) -> Runtime<Window> {
	let mut rt = Runtime::new(state, view, (WIDTH, 400.0), Env::new(false, 1.0));
	rt.set_tab_visits_controls(true);
	rt.frame(0.0);
	rt
}

fn middle_of(rt: &Runtime<Window>, key: &str) -> (f32, f32) {
	let rect = rt
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.unwrap_or_else(|| panic!("no element keyed {key}"))
		.rect;
	(rect[0] + rect[2] / 2.0, rect[1] + rect[3] / 2.0)
}

fn click(rt: &mut Runtime<Window>, key: &str) {
	let (x, y) = middle_of(rt, key);
	rt.pointer_down(x, y);
	rt.pointer_up(x, y);
	rt.frame(FRAME);
}

fn drag(rt: &mut Runtime<Window>, key: &str, path: &[(f32, f32)], release: bool) {
	let (x, y) = middle_of(rt, key);
	rt.pointer_down(x, y);
	rt.frame(FRAME);
	for (dx, dy) in path {
		rt.pointer_move(x + dx, y + dy);
		rt.frame(FRAME);
	}
	if release {
		let (dx, dy) = path.last().copied().unwrap_or_default();
		rt.pointer_up(x + dx, y + dy);
		rt.frame(FRAME);
	}
}

fn alt(key: Key) -> KeyEvent {
	KeyEvent { key, mods: Mods { alt: true, ..Mods::default() } }
}

fn focus(rt: &mut Runtime<Window>, key: &str) {
	for _ in 0..20 {
		let focused = rt.elements().into_iter().find(|element| element.focused);
		if focused.and_then(|element| element.key).as_deref() == Some(key) {
			return;
		}
		rt.key(KeyEvent { key: Key::Tab, mods: Mods::default() });
		rt.frame(FRAME);
	}
	panic!("Tab never reached {key}");
}

fn ids(tabs: &[&str]) -> ChromeEvent {
	ChromeEvent::ReorderTabs(tabs.iter().map(|id| (*id).to_owned()).collect())
}

fn lifted_events(events: &[ChromeEvent]) -> Vec<&ChromeEvent> {
	events.iter().filter(|event| !matches!(event, ChromeEvent::LiftMoved(_))).collect()
}

#[test]
fn a_press_on_a_tab_selects_it_and_its_close_closes_it_without_selecting() {
	let mut rt = window(true);
	click(&mut rt, "tab-login");
	click(&mut rt, "tab-close-release");
	assert_eq!(
		rt.state.events,
		[ChromeEvent::SelectTab("login".to_owned()), ChromeEvent::CloseTab("release".to_owned())]
	);
}

#[test]
fn back_and_new_tab_report_once_and_a_disabled_forward_reports_nothing() {
	let mut rt = window(true);
	click(&mut rt, "title-bar-back");
	click(&mut rt, "title-bar-forward");
	click(&mut rt, "title-bar-new-tab");
	assert_eq!(rt.state.events, [ChromeEvent::GoBack, ChromeEvent::NewTab]);
}

#[test]
fn a_middle_click_closes_an_unpinned_tab_and_spares_a_pinned_one() {
	let mut rt = window(true);
	for key in ["tab-login", "tab-inbox"] {
		let (x, y) = middle_of(&rt, key);
		rt.button_down(x, y, PointerButton::Middle);
		rt.button_up(x, y, PointerButton::Middle);
		rt.frame(FRAME);
	}
	assert_eq!(rt.state.events, [ChromeEvent::CloseTab("login".to_owned())]);
}

#[test]
fn a_middle_press_dragged_across_the_row_lifts_nothing() {
	let mut rt = window(true);
	let (x, y) = middle_of(&rt, "tab-login");
	rt.button_down(x, y, PointerButton::Middle);
	rt.pointer_move(x + 200.0, y);
	rt.frame(FRAME);
	rt.button_up(x + 200.0, y, PointerButton::Middle);
	rt.frame(FRAME);
	assert!(rt.state.events.iter().all(|event| !matches!(event, ChromeEvent::LiftMoved(_))));
	assert!(rt.state.lift.is_none());
}

#[test]
fn a_right_click_opens_the_tab_menu_where_it_lands_and_reports_nothing_else() {
	let mut rt = window(true);
	let (x, y) = middle_of(&rt, "tab-login");
	rt.secondary_down(x, y);
	rt.secondary_up(x, y);
	rt.frame(FRAME);
	assert_eq!(rt.state.events, [ChromeEvent::OpenTabMenu { id: "login".to_owned(), at: (x, y) }]);
}

#[test]
fn each_tab_menu_row_reports_its_tab_and_a_pinned_tab_cannot_close() {
	let menu = TabMenu::Tab { id: INBOX.id, at: (10.0, 40.0), has_closed_tab: false };
	let mut rt = window_with(Window {
		can_reorder: true,
		menu: Some(menu),
		controls: None,
		lift: None,
		events: Vec::new(),
	});
	for row in
		["Unpin tab", "Duplicate tab", "Reopen last closed tab", "Close tab", "Move to new window"]
	{
		click(&mut rt, &format!("title-bar-menu-{row}"));
	}
	assert_eq!(
		rt.state.events,
		[
			ChromeEvent::UnpinTab("inbox".to_owned()),
			ChromeEvent::DuplicateTab("inbox".to_owned()),
			ChromeEvent::MoveTabToNewWindow("inbox".to_owned()),
		]
	);
}

#[test]
fn three_points_of_travel_still_select_and_four_lift() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(3.0, 0.0)], true);
	assert_eq!(rt.state.events, [ChromeEvent::SelectTab("login".to_owned())]);
	rt.state.events.clear();
	drag(&mut rt, "tab-login", &[(3.0, 3.0)], false);
	assert!(
		matches!(rt.state.events.as_slice(), [ChromeEvent::LiftMoved(lift)] if lift.id == "login")
	);
}

#[test]
fn a_drop_two_slots_right_reports_the_order_once_and_swallows_the_click() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(90.0, 0.0), (180.0, 6.0), (360.0, 10.0)], true);
	assert_eq!(
		rt.state.lift.as_ref().map(|lift| lift.landing),
		None,
		"the lift ends with the release"
	);
	assert_eq!(
		lifted_events(&rt.state.events),
		[
			&ChromeEvent::LiftEnded("login".to_owned()),
			&ids(&["inbox", "roadmap", "release", "weekly", "invoice", "login"]),
		]
	);
}

#[test]
fn the_lift_reports_the_slot_it_would_land_in_while_it_moves() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(10.0, 0.0), (180.0, 0.0)], false);
	assert_eq!(
		rt.state.lift,
		Some(Lift { id: "login".to_owned(), dx: 180.0, landing: Landing::Slot(2) })
	);
}

#[test]
fn a_tab_carried_over_the_pinned_tabs_lands_first_of_its_zone() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(-100.0, 0.0), (-400.0, 0.0)], true);
	assert_eq!(
		rt.state.events.last(),
		Some(&ids(&["inbox", "roadmap", "login", "release", "weekly", "invoice"]))
	);
}

#[test]
fn a_pinned_tab_carried_past_the_divider_lands_last_of_the_pinned_zone() {
	let mut rt = window(true);
	drag(&mut rt, "tab-inbox", &[(20.0, 0.0), (400.0, 0.0)], true);
	assert_eq!(
		rt.state.events.last(),
		Some(&ids(&["roadmap", "inbox", "release", "login", "weekly", "invoice"]))
	);
}

#[test]
fn a_tab_released_well_below_the_bar_reports_its_tear_off_and_no_order() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(0.0, 20.0), (12.0, 90.0)], true);
	assert!(rt.state.events.iter().any(|event| matches!(
		event,
		ChromeEvent::LiftMoved(Lift { landing: Landing::TornOff, .. })
	)));
	assert_eq!(
		lifted_events(&rt.state.events),
		[
			&ChromeEvent::LiftEnded("login".to_owned()),
			&ChromeEvent::TearOffTab { id: "login".to_owned(), travel: (12.0, 90.0) },
		]
	);
}

#[test]
fn a_tab_carried_off_then_back_onto_the_strip_drops_as_a_reorder() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(0.0, 90.0), (180.0, 4.0)], true);
	assert_eq!(
		lifted_events(&rt.state.events),
		[
			&ChromeEvent::LiftEnded("login".to_owned()),
			&ids(&["inbox", "roadmap", "release", "weekly", "login", "invoice"]),
		]
	);
}

#[test]
fn escape_drops_the_lift_and_the_release_after_it_reports_nothing() {
	let mut rt = window(true);
	drag(&mut rt, "tab-login", &[(180.0, 0.0)], false);
	rt.key(KeyEvent { key: Key::Escape, mods: Mods::default() });
	rt.frame(FRAME);
	let (x, y) = middle_of(&rt, "tab-weekly");
	rt.pointer_up(x, y);
	rt.frame(FRAME);
	assert_eq!(lifted_events(&rt.state.events), [&ChromeEvent::LiftEnded("login".to_owned())]);
	assert!(rt.state.lift.is_none());
}

#[test]
fn option_arrows_move_the_focused_tab_inside_its_zone_and_announce_its_place() {
	let mut rt = window(true);
	focus(&mut rt, "tab-login");
	rt.key(alt(Key::Right));
	rt.frame(FRAME);
	rt.key(alt(Key::Left));
	rt.frame(FRAME);
	assert_eq!(
		rt.state.events,
		[
			ids(&["inbox", "roadmap", "release", "weekly", "login", "invoice"]),
			ChromeEvent::AnnounceMove {
				title: "Fix the login redirect".to_owned(),
				position: 5,
				count: 6
			},
			ids(&["inbox", "roadmap", "login", "release", "weekly", "invoice"]),
			ChromeEvent::AnnounceMove {
				title: "Fix the login redirect".to_owned(),
				position: 3,
				count: 6
			},
		]
	);
}

#[test]
fn option_arrows_stop_at_the_end_of_the_zone_and_a_pinned_tab_never_crosses_the_divider() {
	let mut rt = window(true);
	focus(&mut rt, "tab-roadmap");
	rt.key(alt(Key::Right));
	rt.frame(FRAME);
	focus(&mut rt, "tab-invoice");
	rt.key(alt(Key::Right));
	rt.frame(FRAME);
	assert!(rt.state.events.is_empty());
}

#[test]
fn without_a_reorder_handler_option_arrows_and_drags_report_nothing() {
	let mut rt = window(false);
	focus(&mut rt, "tab-login");
	rt.key(alt(Key::Right));
	rt.frame(FRAME);
	drag(&mut rt, "tab-weekly", &[(200.0, 0.0)], false);
	assert!(rt.state.events.is_empty());
	assert!(rt.state.lift.is_none());
}

#[test]
fn the_caption_buttons_report_minimize_maximize_and_close() {
	let mut rt = window_with(Window {
		can_reorder: true,
		menu: None,
		controls: Some(WindowControls::default()),
		lift: None,
		events: Vec::new(),
	});
	for key in ["caption-minimize", "caption-maximize", "caption-close"] {
		click(&mut rt, key);
	}
	assert_eq!(
		rt.state.events,
		[ChromeEvent::Minimize, ChromeEvent::ToggleMaximize, ChromeEvent::CloseWindow]
	);
}

#[test]
fn an_incoming_tab_reports_its_index_in_the_full_tab_order() {
	let tabs = [INBOX, RELEASE, LOGIN, WEEKLY, INVOICE];
	let receiving = |x: f32| TitleBar {
		width: WIDTH,
		language: Language::En,
		tabs: &tabs,
		active: Some(RELEASE.id),
		can_go_back: true,
		can_go_forward: false,
		can_reorder: true,
		traffic_lights: true,
		window_controls: None,
		lift: None,
		incoming: Some(Incoming { tab: PRICING, x }),
		overflow_open: false,
	};
	assert_eq!(incoming_index(&receiving(382.0)), Some(2));
	assert_eq!(incoming_index(&receiving(0.0)), Some(1));
	assert_eq!(incoming_index(&receiving(WIDTH)), Some(5));
}

#[test]
fn the_drag_ghost_hides_over_its_own_space() {
	let t = Tokens::new(false);
	assert!(drag_ghost(&t, Language::En, &LOGIN, DockTarget::SameSpace).is_none());
	assert!(drag_ghost(&t, Language::En, &LOGIN, DockTarget::Outside).is_some());
	assert!(drag_ghost(&t, Language::En, &LOGIN, DockTarget::OtherSpace).is_some());
}
