use std::time::{Duration, Instant};

use rune::text::TextSystem;
use rune::{Cx, El, Env, Ime, Key, KeyEvent, Mark, Mods, Runtime, TextEdit};
use rune_kit::syntax::SyntaxTheme;

use super::editor::Editor;
use super::model::{LibraryBlockType, block_type_of};
use super::view::{self, code_decorations, field_key};
use crate::app::App;
use crate::navigation::Route;
use kiroshi_rune_kit::tokens::{self, Tokens};

const FRAME_BUDGET: Duration = Duration::from_millis(16);

fn spike_view(s: &App, cx: &mut Cx<App>) -> El {
	view::view(s, cx, &Tokens::new(true))
}

fn runtime(markdown: &str) -> Runtime<App> {
	let mut app = App::new();
	app.spike = Editor::from_markdown(markdown);
	app.navigation.navigate_main(Route::BlockSpike);
	let text = TextSystem::new(tokens::FONTS, tokens::FAMILIES);
	let mut rt = Runtime::with_text(app, spike_view, (1180.0, 780.0), Env::new(true, 2.0), text);
	rt.frame(0.0);
	rt
}

fn settle(rt: &mut Runtime<App>) {
	for _ in 0..3 {
		rt.frame(1.0 / 60.0);
	}
}

fn focus(rt: &mut Runtime<App>, block: usize, field: usize, caret: usize) {
	rt.update(|s, _| s.spike.focus(block, field, caret));
	settle(rt);
}

fn press(rt: &mut Runtime<App>, key: Key, mods: Mods) {
	rt.key(KeyEvent { key, mods });
	settle(rt);
}

fn command(rt: &mut Runtime<App>, letter: char, shift: bool) {
	press(rt, Key::Command(letter), Mods { cmd: true, shift, ..Mods::default() });
}

fn type_text(rt: &mut Runtime<App>, typed: &str) {
	for character in typed.chars() {
		press(rt, Key::Text(character.to_string()), Mods::default());
	}
}

fn sources(editor: &Editor) -> Vec<String> {
	editor.document().blocks.into_iter().map(|block| block.source).collect()
}

fn field(editor: &Editor, block: usize, field: usize) -> &TextEdit {
	&editor.blocks[block].fields[field]
}

#[test]
fn spike_typing_into_a_paragraph_updates_its_text_and_caret() {
	let mut rt = runtime("Hello");
	focus(&mut rt, 0, 0, 5);
	type_text(&mut rt, " world");
	assert_eq!(sources(&rt.state.spike), ["Hello world"]);
	assert_eq!(field(&rt.state.spike, 0, 0).range(), (11, 11));
}

#[test]
fn spike_marks_applied_to_a_selection_survive_the_round_trip_to_the_block_model() {
	let mut editor = Editor::from_markdown("plain bold italic code link");
	let edit = editor.field_mut("block-1", 0);
	for (from, to, mark) in [(6, 10, Mark::Bold), (11, 17, Mark::Italic), (18, 22, Mark::Code)] {
		edit.set_selection(from, to);
		edit.toggle_mark(mark);
	}
	edit.set_selection(23, 27);
	edit.set_link(Some("https://kiroshi.app"));
	let marks = edit.marks().to_vec();
	let markdown = editor.markdown();
	assert_eq!(markdown, "plain **bold** _italic_ `code` [link](https://kiroshi.app)");
	let reopened = Editor::from_markdown(&markdown);
	assert_eq!(field(&reopened, 0, 0).text, "plain bold italic code link");
	assert_eq!(field(&reopened, 0, 0).marks(), marks.as_slice());
	assert_eq!(reopened.markdown(), markdown);
}

#[test]
fn spike_nested_marks_and_escapes_keep_their_markdown() {
	for markdown in ["**bold _both_** and a\\*star", "[**strong link**](https://kiroshi.app)"] {
		assert_eq!(Editor::from_markdown(markdown).markdown(), markdown);
	}
}

#[test]
fn spike_rune_rich_keys_bold_a_selection_in_the_block() {
	let mut rt = runtime("make it bold");
	focus(&mut rt, 0, 0, 0);
	rt.update(|s, _| s.spike.field_mut("block-1", 0).set_selection(8, 12));
	command(&mut rt, 'b', false);
	assert_eq!(rt.state.spike.markdown(), "make it **bold**");
}

#[test]
fn spike_enter_at_the_end_of_a_block_opens_a_paragraph_below_with_the_caret_in_it() {
	let mut rt = runtime("First\n\nSecond");
	focus(&mut rt, 0, 0, 5);
	press(&mut rt, Key::Enter, Mods::default());
	assert_eq!(sources(&rt.state.spike), ["First", "", "Second"]);
	assert!(field(&rt.state.spike, 1, 0).focused);
	type_text(&mut rt, "x");
	assert_eq!(sources(&rt.state.spike), ["First", "x", "Second"]);
	assert_eq!(rt.state.spike.markdown(), "First\n\nx\n\nSecond");
}

#[test]
fn spike_backspace_at_the_start_of_a_block_merges_it_into_the_block_above() {
	let mut rt = runtime("**First**\n\nSecond");
	focus(&mut rt, 1, 0, 0);
	press(&mut rt, Key::Backspace, Mods::default());
	assert_eq!(sources(&rt.state.spike), ["**First**Second"]);
	let merged = field(&rt.state.spike, 0, 0);
	assert!(merged.focused);
	assert_eq!(merged.range(), (5, 5));
	type_text(&mut rt, " ");
	assert_eq!(field(&rt.state.spike, 0, 0).text, "First Second");
}

#[test]
fn spike_a_selection_across_two_blocks_copies_and_deletes_the_text_of_both() {
	let mut rt = runtime("Alpha one\n\nBravo two\n\nCharlie");
	let clipboard = rune::clipboard::memory();
	rt.use_clipboard(&clipboard);
	focus(&mut rt, 0, 0, 0);
	rt.update(|s, _| s.spike.field_mut("block-1", 0).set_selection(6, 9));
	press(&mut rt, Key::Down, Mods { shift: true, ..Mods::default() });
	command(&mut rt, 'c', false);
	assert_eq!(clipboard.text().as_deref().map(String::as_str), Some("one\nBravo two"));
	press(&mut rt, Key::Backspace, Mods::default());
	assert_eq!(sources(&rt.state.spike), ["Alpha ", "Charlie"]);
	assert_eq!(field(&rt.state.spike, 0, 0).range(), (6, 6));
}

#[test]
fn spike_a_selection_brought_back_into_one_block_deletes_within_that_block() {
	let mut rt = runtime("Alpha one\n\nBravo two");
	focus(&mut rt, 0, 0, 0);
	rt.update(|s, _| s.spike.field_mut("block-1", 0).set_selection(6, 9));
	press(&mut rt, Key::Down, Mods { shift: true, ..Mods::default() });
	press(&mut rt, Key::Up, Mods { shift: true, ..Mods::default() });
	press(&mut rt, Key::Backspace, Mods::default());
	assert_eq!(sources(&rt.state.spike), ["one", "Bravo two"]);
}

#[test]
fn spike_a_slash_in_an_empty_block_opens_a_menu_at_the_caret_and_turns_the_block_into_the_choice() {
	let expected = [
		(LibraryBlockType::Heading, "## "),
		(LibraryBlockType::Checklist, "- [ ] "),
		(LibraryBlockType::Code, "```\n```"),
		(LibraryBlockType::Callout, "> [!NOTE]\n> "),
	];
	for (downs, (kind, skeleton)) in expected.into_iter().enumerate() {
		let mut rt = runtime("Intro");
		focus(&mut rt, 0, 0, 5);
		press(&mut rt, Key::Enter, Mods::default());
		type_text(&mut rt, "/");
		let id = rt.state.spike.blocks[1].id.clone();
		assert_eq!(
			rt.state.spike.slash.as_ref().map(|slash| slash.block.as_str()),
			Some(id.as_str())
		);
		let caret = rt
			.elements()
			.into_iter()
			.find(|element| element.key.as_deref() == Some(field_key(&id, 0).as_str()))
			.and_then(|element| element.caret)
			.expect("the focused field draws its caret");
		let (menu, _) =
			rt.presented(&format!("{}-content", view::SLASH_MENU)).expect("the menu shows");
		assert!((menu[0] - caret[0]).abs() < 1.0, "menu {menu:?} starts at the caret {caret:?}");
		assert!(
			menu[1] >= caret[1] + caret[3] - 0.5,
			"menu {menu:?} opens under the caret {caret:?}"
		);
		for _ in 0..downs {
			press(&mut rt, Key::Down, Mods::default());
		}
		press(&mut rt, Key::Enter, Mods::default());
		let block = &rt.state.spike.document().blocks[1];
		assert_eq!((block_type_of(&block.source), block.source.as_str()), (kind, skeleton));
		assert!(rt.state.spike.slash.is_none());
	}
}

#[test]
fn spike_undo_then_redo_restore_each_of_three_edits_in_order() {
	let mut rt = runtime("Start");
	focus(&mut rt, 0, 0, 5);
	let mut states = vec![rt.state.spike.markdown()];
	type_text(&mut rt, "a");
	states.push(rt.state.spike.markdown());
	type_text(&mut rt, "b");
	states.push(rt.state.spike.markdown());
	press(&mut rt, Key::Enter, Mods::default());
	states.push(rt.state.spike.markdown());
	assert_eq!(states, ["Start", "Starta", "Startab", "Startab\n\n"]);
	for expected in states[..3].iter().rev() {
		command(&mut rt, 'z', false);
		assert_eq!(&rt.state.spike.markdown(), expected);
	}
	for expected in &states[1..] {
		command(&mut rt, 'z', true);
		assert_eq!(&rt.state.spike.markdown(), expected);
	}
}

#[test]
fn spike_an_ime_composition_shows_its_preedit_and_inserts_the_commit_once() {
	let mut rt = runtime("Hi ");
	focus(&mut rt, 0, 0, 3);
	rt.ime(Ime::Preedit("にほ".into(), Some((6, 6))));
	settle(&mut rt);
	let composing = field(&rt.state.spike, 0, 0);
	assert_eq!(composing.text, "Hi ");
	assert_eq!(composing.display().0, "Hi にほ");
	rt.ime(Ime::Commit("日本".into()));
	settle(&mut rt);
	let committed = field(&rt.state.spike, 0, 0);
	assert_eq!(committed.preedit, None);
	assert_eq!(rt.state.spike.markdown(), "Hi 日本");
}

#[test]
fn spike_a_code_block_is_highlighted_and_a_two_by_two_table_cell_is_editable() {
	let mut rt = runtime("```rust\nfn main() {}\n```\n\n| A | B |\n| --- | --- |\n| 1 | 2 |");
	let syntax = SyntaxTheme::from_kit(&Tokens::new(true).kit());
	assert!(!code_decorations(&rt.state.spike.blocks[0], &syntax).is_empty());
	let table = rt.state.spike.blocks[1].id.clone();
	let keys: Vec<String> = rt.elements().into_iter().filter_map(|element| element.key).collect();
	assert!(
		(0..4).all(|cell| keys.contains(&field_key(&table, cell))),
		"four cells draw: {keys:?}"
	);
	focus(&mut rt, 1, 2, 1);
	type_text(&mut rt, "0");
	assert_eq!(sources(&rt.state.spike)[1], "| A | B |\n| --- | --- |\n| 10 | 2 |");
}

#[test]
#[cfg_attr(
	debug_assertions,
	ignore = "the 16 ms budget is for a release build: cargo test --release spike"
)]
fn spike_a_document_of_2000_blocks_lays_out_and_paints_its_first_frame_within_16_ms() {
	let markdown: String =
		(0..2000).map(|n| format!("Block {n} with **bold** and `code`.\n\n")).collect();
	let opening = Instant::now();
	let mut app = App::new();
	app.spike = Editor::from_markdown(&markdown);
	app.navigation.navigate_main(Route::BlockSpike);
	let opened = opening.elapsed();
	assert_eq!(app.spike.blocks.len(), 2000);
	let text = TextSystem::new(tokens::FONTS, tokens::FAMILIES);
	let mut rt = Runtime::with_text(app, spike_view, (1180.0, 780.0), Env::new(true, 2.0), text);
	let painting = Instant::now();
	rt.frame(0.0);
	let painted = painting.elapsed();
	assert!(painted < FRAME_BUDGET, "first frame took {painted:?} (opening took {opened:?})");
}
