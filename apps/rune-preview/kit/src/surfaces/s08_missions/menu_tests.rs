use rune::{Cx, Env, KeyEvent, Mods, Runtime, TextEdit, TextStyle, text_input};

use super::*;

const MISSION: Mission = Mission {
	id: "mission-parser",
	bot: Bot { id: "bot-ada", name: "Ada Martin", title: "", hue: None },
	objective: "Rewrite the changelog parser",
	ticket: Ticket {
		platform: "linear",
		external_id: "OPE-42",
		title: "Changelog parser",
		url: "",
	},
	tools: &[],
	state: MissionState::WaitingHuman,
	is_working: false,
	is_closed: false,
	timestamp: "1h",
	now: None,
	clock_ms: 0.0,
	status: None,
	commits_ahead: 0,
	pull_request: None,
	last_activity: None,
};

const FACTS: MenuFacts = MenuFacts {
	state: MissionState::WaitingHuman,
	has_pull_request: false,
	has_branch: true,
	has_workspace_path: false,
};

const COMPOSER: &str = "composer";

struct Menu {
	source: MenuSource,
	at: PointerPress,
	is_copy_shown: bool,
}

struct Screen {
	menu: Option<Menu>,
	heard: Vec<MissionsEvent>,
	composer: TextEdit,
}

fn hear(screen: &mut Screen, event: MissionsEvent) {
	match &event {
		MissionsEvent::MenuRequested { source, at, .. } => {
			screen.menu = Some(Menu { source: *source, at: *at, is_copy_shown: false });
		}
		MissionsEvent::CopyChoicesShown { is_shown, .. } => {
			if let Some(menu) = &mut screen.menu {
				menu.is_copy_shown = *is_shown;
			}
		}
		MissionsEvent::MenuChosen { action, .. } => {
			screen.menu = None;
			screen.composer.focused =
				matches!(action, MenuAction::MessageAgent | MenuAction::Answer);
		}
		MissionsEvent::MenuCopied { .. } | MissionsEvent::MenuDismissed => screen.menu = None,
		_ => {}
	}
	screen.heard.push(event);
}

fn view(screen: &Screen, _: &mut Cx<Screen>) -> El {
	let t = Tokens::new(false);
	let emit: Emit<Screen> = Rc::new(hear);
	let body = col()
		.w_full()
		.h_full()
		.padding(SPACING * 4.0)
		.gap(SPACING * 4.0)
		.child(col().w(SPACING * 80.0).child(mission_row(
			&t,
			Language::En,
			&MISSION,
			false,
			&emit,
			None,
		)))
		.child(mission_card(&t, Language::En, &MISSION, &emit))
		.child(
			text_input(&screen.composer, TextStyle::new(14.0, 400.0))
				.key(COMPOSER)
				.size(SPACING * 60.0, SPACING * 8.0)
				.on_edit(|screen: &mut Screen| &mut screen.composer),
		);
	let layers = screen.menu.as_ref().map(|menu| {
		let open = OpenMenu {
			mission: MISSION.id,
			source: menu.source,
			at: menu.at,
			facts: FACTS,
			is_copy_shown: menu.is_copy_shown,
		};
		mission_menu(&t, Language::En, &open, &emit)
	});
	rune_kit::root(body, layers.unwrap_or_default())
}

fn running() -> Runtime<Screen> {
	let screen = Screen { menu: None, heard: Vec::new(), composer: TextEdit::new("") };
	let mut runtime = Runtime::new(screen, view, (720.0, 520.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime
}

fn step(runtime: &mut Runtime<Screen>) {
	runtime.frame(0.0);
	runtime.frame(1.0);
}

fn rect_of(runtime: &Runtime<Screen>, key: &str) -> [f32; 4] {
	runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.map(|element| element.rect)
		.unwrap_or_else(|| panic!("nothing is drawn under {key}"))
}

fn focused(runtime: &Runtime<Screen>) -> Option<String> {
	runtime.elements().into_iter().find(|element| element.focused).and_then(|element| element.key)
}

fn right_click(runtime: &mut Runtime<Screen>, x: f32, y: f32) {
	runtime.secondary_down(x, y);
	runtime.secondary_up(x, y);
	step(runtime);
}

fn press(runtime: &mut Runtime<Screen>, key: &str) {
	let [x, y, width, height] = rect_of(runtime, key);
	runtime.pointer_down(x + width / 2.0, y + height / 2.0);
	runtime.pointer_up(x + width / 2.0, y + height / 2.0);
	step(runtime);
}

fn key(runtime: &mut Runtime<Screen>, key: KeyName, shift: bool) {
	runtime.key(KeyEvent { key, mods: Mods { shift, ..Mods::default() } });
	step(runtime);
}

fn card_key() -> String {
	format!("mission-card-{}", MISSION.id)
}

fn row_key() -> String {
	format!("mission-row-{}", MISSION.id)
}

fn item_key(key: Key) -> String {
	format!("menu-item-{}", key.text(Language::En))
}

fn open_on_card(runtime: &mut Runtime<Screen>) {
	let [x, y, ..] = rect_of(runtime, &card_key());
	right_click(runtime, x + 40.0, y + 20.0);
	runtime.state.heard.clear();
}

fn focus(runtime: &mut Runtime<Screen>, key: &str) {
	for _ in 0..8 {
		if focused(runtime).as_deref() == Some(key) {
			return;
		}
		self::key(runtime, KeyName::Tab, false);
	}
	panic!("Tab never reached {key}");
}

fn chosen(action: MenuAction) -> MissionsEvent {
	MissionsEvent::MenuChosen { mission: MISSION.id.to_owned(), action }
}

#[test]
fn a_right_click_on_the_card_or_the_row_requests_the_menu_at_the_pointer() {
	let mut runtime = running();
	let [x, y, ..] = rect_of(&runtime, &card_key());
	right_click(&mut runtime, x + 40.0, y + 20.0);
	let [row_x, row_y, ..] = rect_of(&runtime, &row_key());
	runtime.update(|screen, _| screen.menu = None);
	step(&mut runtime);
	right_click(&mut runtime, row_x + 30.0, row_y + 10.0);
	assert_eq!(
		runtime.state.heard,
		[
			MissionsEvent::MenuRequested {
				mission: MISSION.id.to_owned(),
				source: MenuSource::Card,
				at: PointerPress { x: x + 40.0, y: y + 20.0 },
			},
			MissionsEvent::MenuRequested {
				mission: MISSION.id.to_owned(),
				source: MenuSource::Row,
				at: PointerPress { x: row_x + 30.0, y: row_y + 10.0 },
			},
		]
	);
}

#[test]
fn the_context_menu_key_and_shift_f10_request_the_menu_under_the_focused_card() {
	let mut runtime = running();
	let card = card_key();
	focus(&mut runtime, &card);
	let [x, y, _, height] = rect_of(&runtime, &card);
	let under_the_card = MissionsEvent::MenuRequested {
		mission: MISSION.id.to_owned(),
		source: MenuSource::Card,
		at: PointerPress { x, y: y + height },
	};
	key(&mut runtime, KeyName::ContextMenu, false);
	key(&mut runtime, KeyName::Escape, false);
	key(&mut runtime, KeyName::Function(10), true);
	assert_eq!(
		runtime.state.heard,
		[under_the_card.clone(), MissionsEvent::MenuDismissed, under_the_card]
	);
}

#[test]
fn the_open_menu_is_drawn_at_the_anchor_with_the_entries_of_its_facts() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	let [card_x, card_y, ..] = rect_of(&runtime, &card_key());
	let [x, y, ..] =
		rect_of(&runtime, &format!("menu-{}", chat::missions::menu::LABEL.text(Language::En)));
	assert_eq!((x, y), (card_x + 40.0, card_y + 20.0));
	let items: Vec<String> = runtime
		.elements()
		.into_iter()
		.filter(|element| element.role == "menuitem")
		.filter_map(|element| element.label)
		.collect();
	assert_eq!(items, ["Open mission", "Copy", "Answer the question", "Close"]);
}

#[test]
fn a_pointer_press_on_an_item_reports_that_item_once_and_returns_focus_to_the_card() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	press(&mut runtime, &item_key(chat::missions::menu::CLOSE));
	assert_eq!(runtime.state.heard, [chosen(MenuAction::Close)]);
	assert_eq!(focused(&runtime), Some(card_key()));
}

#[test]
fn arrows_move_the_highlight_and_enter_reports_the_highlighted_item() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	assert_eq!(focused(&runtime), Some(item_key(chat::missions::menu::OPEN)));
	key(&mut runtime, KeyName::Down, false);
	key(&mut runtime, KeyName::Down, false);
	key(&mut runtime, KeyName::Down, false);
	assert_eq!(focused(&runtime), Some(item_key(chat::missions::menu::ANSWER)));
	key(&mut runtime, KeyName::Up, false);
	key(&mut runtime, KeyName::Up, false);
	key(&mut runtime, KeyName::Enter, false);
	assert_eq!(runtime.state.heard, [chosen(MenuAction::Open)]);
}

#[test]
fn the_right_arrow_opens_the_copy_choices_and_a_choice_reports_its_kind() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	key(&mut runtime, KeyName::Down, false);
	key(&mut runtime, KeyName::Down, false);
	key(&mut runtime, KeyName::Right, false);
	assert_eq!(focused(&runtime), Some(item_key(chat::missions::menu::copy_kind::ISSUE_ID)));
	key(&mut runtime, KeyName::Down, false);
	key(&mut runtime, KeyName::Enter, false);
	let mission = MISSION.id.to_owned();
	assert_eq!(
		runtime.state.heard,
		[
			MissionsEvent::CopyChoicesShown { mission: mission.clone(), is_shown: true },
			MissionsEvent::MenuCopied { mission, kind: CopyKind::Branch },
		]
	);
	assert_eq!(focused(&runtime), Some(card_key()));
}

#[test]
fn the_left_arrow_closes_the_copy_choices_back_onto_copy() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	press(&mut runtime, &item_key(chat::missions::menu::COPY));
	key(&mut runtime, KeyName::Left, false);
	assert!(runtime.state.menu.as_ref().is_some_and(|menu| !menu.is_copy_shown));
	assert_eq!(focused(&runtime), Some(item_key(chat::missions::menu::COPY)));
}

#[test]
fn escape_or_a_press_outside_dismisses_once_and_returns_focus_to_the_card() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	key(&mut runtime, KeyName::Escape, false);
	assert_eq!(focused(&runtime), Some(card_key()));
	open_on_card(&mut runtime);
	press(&mut runtime, &item_key(chat::missions::menu::COPY));
	runtime.state.heard.clear();
	runtime.pointer_down(700.0, 500.0);
	runtime.pointer_up(700.0, 500.0);
	step(&mut runtime);
	assert_eq!(runtime.state.heard, [MissionsEvent::MenuDismissed]);
	assert!(runtime.state.menu.is_none());
	assert_eq!(focused(&runtime), Some(card_key()));
}

#[test]
fn a_dismissed_row_menu_returns_focus_to_the_row() {
	let mut runtime = running();
	let [x, y, ..] = rect_of(&runtime, &row_key());
	right_click(&mut runtime, x + 30.0, y + 10.0);
	key(&mut runtime, KeyName::Escape, false);
	assert_eq!(focused(&runtime), Some(row_key()));
}

#[test]
fn answer_leaves_focus_where_the_caller_puts_it() {
	let mut runtime = running();
	open_on_card(&mut runtime);
	press(&mut runtime, &item_key(chat::missions::menu::ANSWER));
	assert_eq!(runtime.state.heard, [chosen(MenuAction::Answer)]);
	assert_eq!(focused(&runtime).as_deref(), Some(COMPOSER));
}
