use rune::{Key, KeyEvent, Mods, TextEdit};

use super::chips::formatted_size;
use super::menus::{Command, MentionFace, Mentionable, command_matches, mention_matches};
use super::prompt::{Offline, PromptInput, menu_key};
use super::{ComposerIntent, filled};

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
