use rune::{Cx, El, Env, Runtime, col};

use super::*;
use crate::strings::Language;
use crate::tokens::Tokens;

#[derive(Default)]
struct Heard {
	rail: Vec<RailMessage>,
	picker: Vec<PickerMessage>,
}

fn heard_rail(s: &mut Heard, message: RailMessage) {
	s.rail.push(message);
}

fn heard_picker(s: &mut Heard, message: PickerMessage) {
	s.picker.push(message);
}

const VOCCA: Space =
	Space { id: "vocca", name: "Vocca", colour: Some(257.0), avatar_seed: "vocca" };
const STUDIO: Space = Space { id: "studio", name: "Studio", colour: None, avatar_seed: "studio" };
const SPACES: [Space; 2] = [STUDIO, VOCCA];

fn rail() -> Rail<'static> {
	Rail {
		space: Some(VOCCA),
		user: RailUser { name: Some("Ada Lovelace"), image: None },
		dots: RailDots { conversations: Some(BotBadge::Done), you: true, ..RailDots::default() },
		..Rail::new(Language::En, RailPanel::Conversations)
	}
}

fn rail_view(_: &Heard, _: &mut Cx<Heard>) -> El {
	rail().view(&Tokens::new(false), heard_rail)
}

fn picker() -> SpacePicker<'static> {
	SpacePicker {
		language: Language::En,
		menu: SpacesMenu { spaces: &SPACES, is_open: true, ..SpacesMenu::default() },
		selected: Some("vocca"),
	}
}

fn picker_view(_: &Heard, _: &mut Cx<Heard>) -> El {
	let t = Tokens::new(false);
	let open = picker();
	rune_kit::root(
		col().items_start().child(open.view(&t, heard_picker)),
		open.menu_layer(&t, heard_picker).into_iter().collect::<Vec<El>>(),
	)
}

fn running(view: fn(&Heard, &mut Cx<Heard>) -> El) -> Runtime<Heard> {
	let mut runtime = Runtime::new(Heard::default(), view, (480.0, 512.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime
}

fn label_of(runtime: &Runtime<Heard>, key: &str) -> String {
	runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.and_then(|element| element.label)
		.unwrap_or_default()
}

fn press(runtime: &mut Runtime<Heard>, key: &str) {
	let [x, y, width, height] = runtime
		.elements()
		.into_iter()
		.find(|element| element.key.as_deref() == Some(key))
		.map(|element| element.rect)
		.unwrap_or_else(|| panic!("nothing is drawn under {key}"));
	runtime.pointer_down(x + width / 2.0, y + height / 2.0);
	runtime.pointer_up(x + width / 2.0, y + height / 2.0);
	runtime.frame(1.0 / 60.0);
}

#[test]
fn every_rail_entry_reports_its_press_and_changes_nothing() {
	let mut runtime = running(rail_view);
	for key in [
		"app-rail-space",
		"app-rail-search",
		"app-rail-conversations",
		"app-rail-missions",
		"app-rail-library",
		"app-rail-reader",
	] {
		press(&mut runtime, key);
	}
	assert_eq!(
		runtime.state.rail,
		[
			RailMessage::OpenSpaceSettings,
			RailMessage::OpenSearch,
			RailMessage::SelectPanel(RailPanel::Conversations),
			RailMessage::SelectPanel(RailPanel::Missions),
			RailMessage::SelectPanel(RailPanel::Library),
			RailMessage::OpenYou,
		]
	);
	assert_eq!(label_of(&runtime, "app-rail-conversations"), "Conversations, activity finished");
}

#[test]
fn every_icon_only_rail_entry_is_named_by_its_story_label() {
	let runtime = running(rail_view);
	let names = [
		("app-rail-space", "Space settings"),
		("app-rail-search", "Search"),
		("app-rail-conversations", "Conversations"),
		("app-rail-missions", "Missions"),
		("app-rail-library", "Library"),
		("app-rail-reader", "Ada Lovelace"),
	];
	for (key, name) in names {
		let label = label_of(&runtime, key);
		assert!(label.contains(name), "{key} is named {label:?}, without {name:?}");
	}
	assert_eq!(label_of(&runtime, "app-rail-reader"), "Ada Lovelace, new activity");
}

#[test]
fn a_picker_row_reports_its_space_and_the_menu_closing() {
	let mut runtime = running(picker_view);
	press(&mut runtime, "space-row-studio");
	assert_eq!(
		runtime.state.picker,
		[PickerMessage::SelectSpace("studio".to_owned()), PickerMessage::OpenChange(false)]
	);
	assert_eq!(label_of(&runtime, "space-switcher"), "Change space, Vocca open");
}
