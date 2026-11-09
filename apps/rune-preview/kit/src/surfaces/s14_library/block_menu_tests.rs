use std::sync::Arc;

use rune::image::ImageCache;
use rune::{Cx, Env, Runtime};

use super::*;
use crate::generated::{PACKAGES_UI, read};
use common::library::editor::blocks::{handle, menu};

const PITCHES: [f32; 4] = [40.0, 60.0, 80.0, 40.0];
const HELD: usize = 1;

#[derive(Clone, Copy)]
enum Shows {
	Menu(BlockMenuLook),
	TurnInto(LibraryBlockType),
	Handle,
	Lightbox,
}

#[derive(Debug, PartialEq)]
enum Heard {
	Menu(BlockMenuAction),
	Handle(HandleEvent),
	Lightbox(LightboxEvent),
}

struct Screen {
	shows: Shows,
	picture: Option<Image>,
	heard: Vec<Heard>,
}

fn hear_menu(screen: &mut Screen, action: BlockMenuAction) {
	screen.shows = match (screen.shows, action) {
		(Shows::Menu(look), BlockMenuAction::TurnIntoShown) => Shows::TurnInto(look.kind),
		(Shows::TurnInto(kind), BlockMenuAction::TurnIntoHidden) => {
			Shows::Menu(look_of(kind, true, true))
		}
		(shows, _) => shows,
	};
	screen.heard.push(Heard::Menu(action));
}

fn view(screen: &Screen, _: &mut Cx<Screen>) -> El {
	let t = Tokens::new(false);
	let lang = Language::En;
	let body = match screen.shows {
		Shows::Menu(look) => block_menu(&t, lang, look, hear_menu),
		Shows::TurnInto(kind) => {
			let look = BlockMenuLook { is_turn_into_shown: true, ..look_of(kind, true, true) };
			let menu = block_menu(&t, lang, look, hear_menu);
			return rune_kit::root(menu, vec![turn_into_menu(&t, lang, kind, hear_menu)]);
		}
		Shows::Handle => {
			let place = HandlePlace { index: HELD, pitches: &PITCHES };
			let on = |screen: &mut Screen, event| screen.heard.push(Heard::Handle(event));
			block_handle(&t, lang, false, place, on)
		}
		Shows::Lightbox => {
			let image = screen.picture.as_ref();
			let shown = LightboxImage { name: "sofa.jpg", detail: "1.2 MB", image };
			let look = LightboxLook {
				position: 1,
				count: 2,
				zoom_percent: None,
				actions: BarActions { shown: true, is_copied: false },
			};
			let on = |screen: &mut Screen, event| screen.heard.push(Heard::Lightbox(event));
			return lightbox(lang, &shown, look, on);
		}
	};
	col().w_full().h_full().padding(SPACING * 10.0).child(body)
}

fn look_of(kind: LibraryBlockType, can_move_up: bool, can_move_down: bool) -> BlockMenuLook {
	BlockMenuLook { kind, is_mac: true, can_move_up, can_move_down, is_turn_into_shown: false }
}

fn running(shows: Shows) -> Runtime<Screen> {
	showing(shows, None)
}

fn showing(shows: Shows, picture: Option<Image>) -> Runtime<Screen> {
	let screen = Screen { shows, picture, heard: Vec::new() };
	let mut runtime = Runtime::new(screen, view, (1000.0, 800.0), Env::new(false, 1.0));
	step(&mut runtime);
	runtime
}

fn step(runtime: &mut Runtime<Screen>) {
	runtime.frame(0.0);
	runtime.frame(1.0);
}

fn element(runtime: &Runtime<Screen>, key: &str) -> rune::ElementInfo {
	runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.unwrap_or_else(|| panic!("nothing is drawn under {key}"))
}

fn centre_of(runtime: &Runtime<Screen>, key: &str) -> (f32, f32) {
	let [x, y, width, height] = element(runtime, key).rect;
	(x + width / 2.0, y + height / 2.0)
}

fn press(runtime: &mut Runtime<Screen>, key: &str) {
	let (x, y) = centre_of(runtime, key);
	runtime.pointer_down(x, y);
	runtime.pointer_up(x, y);
	step(runtime);
}

fn focused(runtime: &Runtime<Screen>) -> Option<String> {
	runtime.elements().into_iter().find(|element| element.focused).and_then(|element| element.key)
}

fn key(runtime: &mut Runtime<Screen>, key: KeyName) {
	runtime.key(KeyEvent { key, mods: Mods::default() });
	step(runtime);
}

fn tab_to(runtime: &mut Runtime<Screen>, target: &str) {
	for _ in 0..16 {
		if focused(runtime).as_deref() == Some(target) {
			return;
		}
		key(runtime, KeyName::Tab);
	}
	panic!("Tab never reached {target}");
}

fn decoded(bytes: Vec<u8>) -> Image {
	let image = ImageCache::new(Arc::new(|| {})).rgba(2, 2, bytes);
	let _ = image.wait();
	image
}

fn right_click(runtime: &mut Runtime<Screen>, target: &str) -> PointerPress {
	let (x, y) = centre_of(runtime, target);
	runtime.secondary_down(x, y);
	runtime.secondary_up(x, y);
	step(runtime);
	PointerPress { x, y }
}

fn item_key(key: Key) -> String {
	format!("menu-item-{}", say(key, Language::En))
}

fn grip_key() -> String {
	format!("library-handle-{}", say(handle::MENU, Language::En))
}

fn text_block_types() -> Vec<String> {
	let module = read(&format!("{PACKAGES_UI}/src/components/library-document-blocks.ts"));
	let start = module.find("const TEXT_BLOCK_TYPES").expect("TEXT_BLOCK_TYPES is missing");
	let list = &module[start..start + module[start..].find("] as const").unwrap_or(0)];
	assert!(
		module.contains("isTextBlockType(type) ? [...TEXT_BLOCK_TYPES] : [type]"),
		"conversionsOf no longer reads as the kit's conversions",
	);
	list.split('"').skip(1).step_by(2).map(str::to_owned).collect()
}

#[test]
fn turn_into_lists_the_conversions_of_packages_ui_in_order_with_their_icon_and_label() {
	let text_types = text_block_types();
	for kind in LibraryBlockType::ALL {
		let items = turn_into_items(Language::En, kind);
		let names: Vec<&str> = items.iter().map(|(each, _)| each.name()).collect();
		let expected: Vec<&str> = if kind.is_text() {
			text_types.iter().map(String::as_str).collect()
		} else {
			vec![kind.name()]
		};
		assert_eq!(names, expected, "{kind:?}");
		for (each, item) in items {
			assert_eq!(item.label, say(each.label(), Language::En), "{each:?}");
			assert_eq!(item.glyph.map(|glyph| glyph.name), Some(each.glyph().name), "{each:?}");
		}
	}
}

#[test]
fn turn_into_checks_the_current_block_type_only() {
	for kind in LibraryBlockType::ALL {
		for (each, item) in turn_into_items(Language::En, kind) {
			assert!(
				matches!(item.mark, MenuMark::Radio(is_checked) if is_checked == (each == kind)),
				"{each:?} in the list of {kind:?}",
			);
		}
	}
}

#[test]
fn picking_a_type_in_turn_into_hands_back_turn_into_with_that_type() {
	let mut runtime = running(Shows::TurnInto(LibraryBlockType::Heading));
	press(&mut runtime, &item_key(common::library::editor::blocks::types::QUOTE));
	assert_eq!(
		runtime.state.heard,
		[Heard::Menu(BlockMenuAction::TurnInto(LibraryBlockType::Quote))]
	);
}

#[test]
fn pressing_turn_into_asks_for_its_list() {
	let mut runtime = running(Shows::Menu(look_of(LibraryBlockType::Paragraph, true, true)));
	press(&mut runtime, &item_key(menu::TURN_INTO));
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::TurnIntoShown)]);
}

#[test]
fn move_up_is_disabled_and_silent_on_the_first_block() {
	let mut runtime = running(Shows::Menu(look_of(LibraryBlockType::Paragraph, false, true)));
	let move_up = element(&runtime, &item_key(menu::MOVE_UP));
	assert!(!move_up.focusable);
	assert_eq!(move_up.opacity, DISABLED_OPACITY);
	assert!(element(&runtime, &item_key(menu::MOVE_DOWN)).focusable);
	press(&mut runtime, &item_key(menu::MOVE_UP));
	assert_eq!(runtime.state.heard, []);
	press(&mut runtime, &item_key(menu::MOVE_DOWN));
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::MoveDown)]);
}

#[test]
fn move_down_is_disabled_and_silent_on_the_last_block() {
	let mut runtime = running(Shows::Menu(look_of(LibraryBlockType::Paragraph, true, false)));
	let move_down = element(&runtime, &item_key(menu::MOVE_DOWN));
	assert!(!move_down.focusable);
	assert_eq!(move_down.opacity, DISABLED_OPACITY);
	press(&mut runtime, &item_key(menu::MOVE_DOWN));
	assert_eq!(runtime.state.heard, []);
	press(&mut runtime, &item_key(menu::MOVE_UP));
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::MoveUp)]);
}

fn drag_to(runtime: &mut Runtime<Screen>, from: (f32, f32), travel: f32) {
	runtime.pointer_move(from.0, from.1 + travel);
	step(runtime);
}

fn dragged(from: usize, travel: f32, to: usize) -> Heard {
	Heard::Handle(HandleEvent::Drag { from, offset: (0.0, travel), to })
}

#[test]
fn a_block_drag_past_the_slop_hands_back_every_frame_with_its_landing_index() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	step(&mut runtime);
	drag_to(&mut runtime, at, DRAG_SLOP / 2.0);
	assert_eq!(runtime.state.heard, []);
	drag_to(&mut runtime, at, 20.0);
	drag_to(&mut runtime, at, 50.0);
	assert_eq!(runtime.state.heard, [dragged(HELD, 20.0, HELD), dragged(HELD, 50.0, 2)]);
}

#[test]
fn a_dropped_block_ends_the_drag_then_moves_to_its_landing_index() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(&mut runtime, at, 50.0);
	runtime.state.heard.clear();
	runtime.pointer_up(at.0, at.1 + 50.0);
	step(&mut runtime);
	assert_eq!(
		runtime.state.heard,
		[
			Heard::Handle(HandleEvent::DragEnd),
			Heard::Handle(HandleEvent::Move { from: HELD, to: 2 })
		],
	);
}

#[test]
fn a_block_dropped_where_it_started_ends_the_drag_without_a_move() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(&mut runtime, at, 50.0);
	drag_to(&mut runtime, at, 15.0);
	assert_eq!(runtime.state.heard.last(), Some(&dragged(HELD, 15.0, HELD)));
	runtime.state.heard.clear();
	runtime.pointer_up(at.0, at.1 + 15.0);
	step(&mut runtime);
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::DragEnd)]);
}

#[test]
fn a_cancelled_block_drag_ends_the_drag_without_a_move() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(&mut runtime, at, 50.0);
	runtime.state.heard.clear();
	runtime.key(KeyEvent { key: KeyName::Escape, mods: Mods::default() });
	runtime.pointer_up(at.0, at.1 + 50.0);
	step(&mut runtime);
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::DragEnd)]);
}

fn dropped_back_on_its_grip(runtime: &mut Runtime<Screen>) {
	let at = centre_of(runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(runtime, at, 50.0);
	drag_to(runtime, at, 0.0);
	runtime.state.heard.clear();
	runtime.pointer_up(at.0, at.1);
	step(runtime);
}

#[test]
fn a_block_dropped_back_on_its_grip_ends_the_drag_without_a_press() {
	let mut runtime = running(Shows::Handle);
	dropped_back_on_its_grip(&mut runtime);
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::DragEnd)]);
}

#[test]
fn a_cancelled_block_drag_released_on_its_grip_ends_the_drag_without_a_press() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(&mut runtime, at, 50.0);
	drag_to(&mut runtime, at, 0.0);
	runtime.state.heard.clear();
	runtime.key(KeyEvent { key: KeyName::Escape, mods: Mods::default() });
	runtime.pointer_up(at.0, at.1);
	step(&mut runtime);
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::DragEnd)]);
}

#[test]
fn a_grip_released_within_the_slop_presses_once_without_a_drag_end() {
	let mut runtime = running(Shows::Handle);
	let at = centre_of(&runtime, &grip_key());
	runtime.pointer_down(at.0, at.1);
	drag_to(&mut runtime, at, DRAG_SLOP / 2.0);
	runtime.pointer_up(at.0, at.1 + DRAG_SLOP / 2.0);
	step(&mut runtime);
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::Press)]);
}

#[test]
fn space_on_the_focused_grip_presses_once() {
	let mut runtime = running(Shows::Handle);
	tab_to(&mut runtime, &grip_key());
	key(&mut runtime, KeyName::Text(" ".into()));
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::Press)]);
}

#[test]
fn the_click_after_a_block_drag_presses_the_grip() {
	let mut runtime = running(Shows::Handle);
	dropped_back_on_its_grip(&mut runtime);
	runtime.state.heard.clear();
	press(&mut runtime, &grip_key());
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::Press)]);
}

#[test]
fn a_click_on_insert_hands_back_insert() {
	let mut runtime = running(Shows::Handle);
	press(&mut runtime, &format!("library-handle-{}", say(handle::INSERT, Language::En)));
	assert_eq!(runtime.state.heard, [Heard::Handle(HandleEvent::Insert)]);
}

#[test]
fn the_right_arrow_on_a_focused_turn_into_row_asks_for_its_list() {
	let mut runtime = running(Shows::Menu(look_of(LibraryBlockType::Paragraph, true, true)));
	tab_to(&mut runtime, &item_key(menu::TURN_INTO));
	key(&mut runtime, KeyName::Right);
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::TurnIntoShown)]);
}

#[test]
fn enter_on_a_focused_turn_into_row_asks_for_its_list() {
	let mut runtime = running(Shows::Menu(look_of(LibraryBlockType::Paragraph, true, true)));
	tab_to(&mut runtime, &item_key(menu::TURN_INTO));
	key(&mut runtime, KeyName::Enter);
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::TurnIntoShown)]);
}

#[test]
fn the_left_arrow_in_turn_into_hides_the_list_and_focus_returns_to_its_row() {
	let mut runtime = running(Shows::TurnInto(LibraryBlockType::Heading));
	tab_to(&mut runtime, &item_key(common::library::editor::blocks::types::PARAGRAPH));
	key(&mut runtime, KeyName::Left);
	assert_eq!(runtime.state.heard, [Heard::Menu(BlockMenuAction::TurnIntoHidden)]);
	assert_eq!(focused(&runtime), Some(item_key(menu::TURN_INTO)));
}

#[test]
fn right_clicking_the_lightbox_picture_hands_back_the_pointer_position() {
	let mut runtime = showing(Shows::Lightbox, Some(decoded(vec![255; 16])));
	let at = right_click(&mut runtime, "lightbox-picture");
	assert_eq!(runtime.state.heard, [Heard::Lightbox(LightboxEvent::PictureMenuRequested { at })]);
}

#[test]
fn a_lightbox_without_a_picture_hands_back_no_right_click() {
	let without_size = decoded(vec![255; 3]);
	assert_eq!(without_size.size(), None);
	for picture in [None, Some(without_size)] {
		let mut runtime = showing(Shows::Lightbox, picture);
		right_click(&mut runtime, "lightbox-picture");
		assert_eq!(runtime.state.heard, []);
	}
}

#[test]
fn an_escaped_pipe_stays_inside_its_table_cell() {
	let source = "| Range | Note |\n| --- | --- |\n| a \\| b | ends with \\| |";
	assert_eq!(table_cells(source), [vec!["Range", "Note"], vec!["a \\| b", "ends with \\|"]],);
}

#[derive(Clone, Copy)]
enum Drawn {
	Landing(usize),
	BlockGhost,
	FilesGhost(usize),
}

struct Sketch {
	drawn: Drawn,
	edit: TextEdit,
}

const BLOCK_IDS: [&str; 3] = ["first", "second", "third"];

fn edit_of<'a>(sketch: &'a mut Sketch, _: &str, _: usize) -> &'a mut TextEdit {
	&mut sketch.edit
}

fn drawn_view(sketch: &Sketch, _: &mut Cx<Sketch>) -> El {
	let t = Tokens::new(false);
	let lang = Language::En;
	let body = match sketch.drawn {
		Drawn::Landing(landing) => {
			let mut views: Vec<EditorBlock> = BLOCK_IDS
				.iter()
				.map(|id| EditorBlock {
					drawn: Some(el().key(format!("drawn-{id}")).w_full().h(40.0)),
					..EditorBlock::new(id, LibraryBlockType::Paragraph, Vec::new(), "")
				})
				.collect();
			place_drop_indicator(&t, &mut views, landing);
			block_editor(&t, lang, &mut views, None, edit_of, |_: &mut Sketch, _| false).0
		}
		Drawn::BlockGhost => drag_ghost(&t, lang, &["The spring launch"], None, (0.0, 0.0)),
		Drawn::FilesGhost(count) => {
			let names = ["sofa.jpg", "lobby.png", "rates.pdf"];
			import_drag_ghost(&t, lang, &names[..count], None, (0.0, 0.0))
		}
	};
	col().w_full().h_full().padding(SPACING * 10.0).child(body)
}

fn sketched(drawn: Drawn) -> Runtime<Sketch> {
	let sketch = Sketch { drawn, edit: TextEdit::default() };
	let mut runtime = Runtime::new(sketch, drawn_view, (1000.0, 800.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime.frame(1.0);
	runtime
}

fn top_and_bottom(runtime: &Runtime<Sketch>, key: &str) -> (f32, f32) {
	let [_, y, _, height] = element_in(runtime, key).rect;
	(y, y + height)
}

fn element_in(runtime: &Runtime<Sketch>, key: &str) -> rune::ElementInfo {
	runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.unwrap_or_else(|| panic!("nothing is drawn under {key}"))
}

fn shows_text(runtime: &Runtime<Sketch>, text: &str) -> bool {
	runtime.elements().iter().any(|element| element.text.as_deref() == Some(text))
}

#[test]
fn a_landing_past_the_last_block_draws_the_drop_line_below_it_at_the_gap_between_two_blocks() {
	let between = sketched(Drawn::Landing(1));
	let (_, first_bottom) = top_and_bottom(&between, "drawn-first");
	let (line_top, _) = top_and_bottom(&between, "library-drop-indicator");
	let gap_between = line_top - first_bottom;
	let past = sketched(Drawn::Landing(BLOCK_IDS.len()));
	let (_, last_bottom) = top_and_bottom(&past, "drawn-third");
	let (line_top, _) = top_and_bottom(&past, "library-drop-indicator");
	assert!(gap_between > 0.0);
	assert_eq!(line_top - last_bottom, gap_between);
}

#[test]
fn a_dragged_block_ghost_draws_no_count_badge() {
	let runtime = sketched(Drawn::BlockGhost);
	assert!(shows_text(&runtime, "The spring launch"));
	assert!(!shows_text(&runtime, "1"));
}

#[test]
fn a_files_ghost_keeps_its_count_badge_for_one_file_too() {
	for count in [1, 3] {
		let runtime = sketched(Drawn::FilesGhost(count));
		assert!(shows_text(&runtime, &count.to_string()));
	}
}
