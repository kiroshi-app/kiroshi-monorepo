use rune::{Cx, Env, Mods, Runtime};

use super::*;

const ITEMS: [LibraryItem<'static>; 2] = [
	LibraryItem {
		id: "brief",
		name: "Spring launch brief",
		detail: "Document",
		look: ItemLook::Page(""),
		import_progress: None,
	},
	LibraryItem {
		id: "notes",
		name: "Interview notes",
		detail: "Document",
		look: ItemLook::Page(""),
		import_progress: None,
	},
];

struct Screen {
	query: TextEdit,
	heard: Vec<LibraryEvent>,
}

fn view(screen: &Screen, _: &mut Cx<Screen>) -> El {
	let panel = LibraryPanel {
		state: PanelState::Ready,
		items: &ITEMS,
		filter: LibraryFilter::All,
		query: &screen.query,
		actions: PanelActions::default(),
		columns: 2,
		focused: None,
	};
	library_panel(
		&Tokens::new(false),
		Language::En,
		&panel,
		|screen: &mut Screen| &mut screen.query,
		|screen: &mut Screen, event| screen.heard.push(event),
	)
}

fn running() -> Runtime<Screen> {
	let screen = Screen { query: TextEdit::new(""), heard: Vec::new() };
	let mut runtime = Runtime::new(screen, view, (1000.0, 800.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime
}

fn press(runtime: &mut Runtime<Screen>, key: KeyName) {
	runtime.key(KeyEvent { key, mods: Mods::default() });
	runtime.frame(0.0);
	runtime.frame(1.0);
}

fn focused(runtime: &Runtime<Screen>) -> Option<String> {
	runtime.elements().into_iter().find(|element| element.focused).and_then(|element| element.key)
}

fn tab_to(runtime: &mut Runtime<Screen>, key: &str) {
	for _ in 0..16 {
		if focused(runtime).as_deref() == Some(key) {
			return;
		}
		press(runtime, KeyName::Tab);
	}
	panic!("Tab never reached {key}");
}

fn tile_key(id: &str) -> String {
	format!("library-item-{id}")
}

#[test]
fn tab_from_a_focused_tile_lands_on_its_more_button_before_the_next_tile() {
	let mut runtime = running();
	tab_to(&mut runtime, &tile_key("brief"));
	press(&mut runtime, KeyName::Tab);
	assert_eq!(focused(&runtime), Some(tile_more_key("brief")));
	press(&mut runtime, KeyName::Tab);
	assert_eq!(focused(&runtime), Some(tile_key("notes")));
}

#[test]
fn enter_or_space_on_a_focused_more_button_asks_for_its_item_menu() {
	for key in [KeyName::Enter, KeyName::Text(" ".to_owned())] {
		let mut runtime = running();
		tab_to(&mut runtime, &tile_key("brief"));
		press(&mut runtime, KeyName::Tab);
		press(&mut runtime, key.clone());
		assert_eq!(
			runtime.state.heard,
			[LibraryEvent::Menu { id: "brief".to_owned(), anchor: tile_more_key("brief") }],
			"{key:?}",
		);
	}
}
