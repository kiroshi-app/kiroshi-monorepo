use rune::{Cx, El, Env, Key, KeyEvent, Mods, Runtime, TextEdit, TextStyle, col, text_input};

use super::chips::formatted_size;
use super::menus::{Command, MentionFace, Mentionable, command_matches, mention_matches};
use super::prompt::{
	FIELD_KEY, Offline, PromptInput, focus_prompt, menu_key, prompt_input, surface,
};
use super::queue::focused_item;
use super::{ComposerIntent, Scope, filled};
use crate::strings::Language;
use crate::tokens::Tokens;

const fn member(id: &'static str, is_outside: bool) -> Mentionable<'static> {
	Mentionable { id, name: id, title: None, face: MentionFace::Agent { hue: None }, is_outside }
}

#[test]
fn a_template_takes_every_named_value() {
	let text = filled(
		"{{space}} is offline once {{host}} leaves",
		&[("space", "Studio"), ("host", "Steve")],
	);
	assert_eq!(text, "Studio is offline once Steve leaves");
}

#[test]
fn a_file_size_reads_as_the_react_chip_does() {
	let sizes = [512, 731, 4212, 9871, 184_320, 1_268_934].map(formatted_size);
	assert_eq!(sizes, ["512 B", "731 B", "4.1 KB", "9.6 KB", "180 KB", "1.2 MB"]);
}

#[test]
fn an_empty_query_lists_the_first_six_inside_and_counts_the_rest() {
	let mut candidates: Vec<Mentionable> =
		["a1", "a2", "a3", "a4", "a5", "a6", "a7"].map(|id| member(id, false)).to_vec();
	candidates.push(member("b1", true));
	let matches = mention_matches(&candidates, "");
	assert_eq!(matches.inside.len(), 6);
	assert!(matches.outside.is_empty());
	assert_eq!(matches.further, 2);
}

#[test]
fn a_query_puts_the_outside_matches_after_the_inside_ones() {
	let candidates = [member("margaux", true), member("gaspard", false), member("atlas", false)];
	let matches = mention_matches(&candidates, "AR");
	let ids: Vec<&str> = (0..matches.len()).filter_map(|at| matches.at(at)).map(|m| m.id).collect();
	assert_eq!(ids, ["gaspard", "margaux"]);
	assert_eq!(matches.further, 0);
}

#[test]
fn a_command_query_matches_inside_the_name_ignoring_case() {
	let commands = ["/clear", "/compact", "/config", "/cost", "/help"]
		.map(|name| Command { name, description: None });
	let names: Vec<&str> = command_matches(&commands, "CO").iter().map(|c| c.name).collect();
	assert_eq!(names, ["/compact", "/config", "/cost"]);
}

#[test]
fn a_blocked_composer_never_sends() {
	let draft = TextEdit::new("Summarise the notes");
	let live = PromptInput::new(&draft, 544.0);
	let disabled = PromptInput { disabled: true, ..PromptInput::new(&draft, 544.0) };
	let offline = PromptInput {
		offline: Some(Offline { space: "Studio", host: "Steve" }),
		..PromptInput::new(&draft, 544.0)
	};
	assert!(live.can_send());
	assert!(!disabled.can_send());
	assert!(!offline.can_send());
}

#[test]
fn an_empty_draft_has_nothing_to_send() {
	let blank = TextEdit::new("   ");
	assert!(!PromptInput::new(&blank, 544.0).can_send());
}

#[test]
fn the_menu_keys_become_travel_choose_and_dismiss() {
	let press = |key| menu_key(&KeyEvent { key, mods: Mods::default() });
	assert_eq!(press(Key::Up), Some(ComposerIntent::MenuTravel(-1)));
	assert_eq!(press(Key::Down), Some(ComposerIntent::MenuTravel(1)));
	assert_eq!(press(Key::Enter), Some(ComposerIntent::MenuChoose));
	assert_eq!(press(Key::Tab), Some(ComposerIntent::MenuChoose));
	assert_eq!(press(Key::Escape), Some(ComposerIntent::MenuDismiss));
	assert_eq!(press(Key::Left), None);
}

#[test]
fn focus_inside_an_empty_composer_draws_the_payload_border() {
	let t = Tokens::new(false);
	let blank = TextEdit::new("");
	let draft = TextEdit::new("Summarise the notes");
	let (_, at_rest) = surface(&t, &PromptInput::new(&blank, 544.0));
	let (_, focused) =
		surface(&t, &PromptInput { focused: true, ..PromptInput::new(&blank, 544.0) });
	let (_, drafted) = surface(&t, &PromptInput::new(&draft, 544.0));
	assert_eq!(focused, drafted);
	assert_ne!(focused, at_rest);
}

#[test]
fn a_focused_queue_key_names_its_queued_message() {
	assert_eq!(focused_item("queue-item-top"), Some("top"));
	assert_eq!(focused_item("queue-send-now-top"), Some("top"));
	assert_eq!(focused_item("queue-remove-city"), Some("city"));
	assert_eq!(focused_item("composer-send"), None);
}

const DRAFT: &str = "Summarise the notes";
const ELSEWHERE: &str = "elsewhere";

#[derive(Clone, Copy, PartialEq)]
enum Block {
	Live,
	Disabled,
	Offline,
}

struct Screen {
	edit: TextEdit,
	elsewhere: TextEdit,
	block: Block,
	sent: usize,
}

fn heard(screen: &mut Screen, intent: ComposerIntent) {
	if intent == ComposerIntent::Send {
		screen.sent += 1;
	}
}

fn screen_view(screen: &Screen, _: &mut Cx<Screen>) -> El {
	let t = Tokens::new(false);
	let scope = Scope { t: &t, language: Language::En, emit: heard };
	let input = PromptInput {
		disabled: screen.block == Block::Disabled,
		offline: (screen.block == Block::Offline)
			.then_some(Offline { space: "Studio", host: "Steve" }),
		focused: screen.edit.focused,
		..PromptInput::new(&screen.edit, 544.0)
	};
	col()
		.child(
			text_input(&screen.elsewhere, TextStyle::new(14.0, 400.0))
				.key(ELSEWHERE)
				.size(240.0, 32.0)
				.on_edit(|screen: &mut Screen| &mut screen.elsewhere),
		)
		.child(prompt_input(scope, input, |screen: &mut Screen| &mut screen.edit))
}

fn composer_with(draft: &str, block: Block) -> Runtime<Screen> {
	let mut edit = TextEdit::new(draft);
	edit.set_caret(0);
	let mut elsewhere = TextEdit::new("");
	elsewhere.focused = true;
	let screen = Screen { edit, elsewhere, block, sent: 0 };
	let mut runtime = Runtime::new(screen, screen_view, (640.0, 360.0), Env::new(false, 1.0));
	runtime.frame(0.0);
	runtime
}

fn step(runtime: &mut Runtime<Screen>) {
	runtime.frame(0.0);
	runtime.frame(1.0);
}

fn focused_key(runtime: &Runtime<Screen>) -> Option<String> {
	runtime.elements().into_iter().find(|element| element.focused).and_then(|element| element.key)
}

fn call_focus(runtime: &mut Runtime<Screen>) {
	runtime.update(|screen, _| focus_prompt(&mut screen.edit, screen.block != Block::Live));
	step(runtime);
}

#[test]
fn the_app_call_focuses_the_field_with_the_caret_after_the_draft() {
	for draft in ["", DRAFT] {
		let mut runtime = composer_with(draft, Block::Live);
		assert_eq!(focused_key(&runtime).as_deref(), Some(ELSEWHERE));
		call_focus(&mut runtime);
		assert_eq!(focused_key(&runtime).as_deref(), Some(FIELD_KEY), "draft {draft:?}");
		let edit = &runtime.state.edit;
		assert_eq!(edit.text, draft);
		assert_eq!((edit.anchor, edit.focus), (draft.len(), draft.len()), "draft {draft:?}");
	}
}

#[test]
fn a_blocked_composer_leaves_focus_where_it_was() {
	for block in [Block::Disabled, Block::Offline] {
		let mut runtime = composer_with(DRAFT, block);
		call_focus(&mut runtime);
		assert_eq!(focused_key(&runtime).as_deref(), Some(ELSEWHERE));
		assert!(!runtime.state.edit.focused);
	}
}

#[test]
fn typing_paste_and_enter_after_the_app_call_act_as_after_a_click() {
	let mut runtime = composer_with(DRAFT, Block::Live);
	call_focus(&mut runtime);
	runtime.key(KeyEvent { key: Key::Text("!".into()), mods: Mods::default() });
	runtime.paste(" Now.");
	step(&mut runtime);
	assert_eq!(runtime.state.edit.text, format!("{DRAFT}! Now."));
	runtime.key(KeyEvent { key: Key::Enter, mods: Mods::default() });
	step(&mut runtime);
	assert_eq!(runtime.state.sent, 1);
}
