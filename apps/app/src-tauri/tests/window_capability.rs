use std::collections::BTreeSet;

use serde_json::Value;

const HOST: &str = include_str!("../../src/lib/host/index.ts");
const CAPABILITY: &str = include_str!("../capabilities/default.json");
const CAPABILITIES: &[(&str, &str)] =
	&[("default.json", CAPABILITY), ("windows.json", include_str!("../capabilities/windows.json"))];
const DEV_CONFIG: &str = include_str!("../tauri.dev.conf.json");

const WINDOW_PREFIX: &str = "core:window:allow-";
const MAIN_WINDOW: &str = "main";
const SECONDARY_WINDOWS: &str = "window-*";
const CORE_DEFAULT: &str = "core:default";
const HANDLE_FACTORY: &str = "getCurrentWindow()";

const DIALOG_PREFIX: &str = "dialog:";
const DIALOG_PERMISSIONS_OF_THE_ARCHIVE_PICKERS: &[&str] =
	&["dialog:allow-save", "dialog:allow-open"];

const WINDOW_COMMANDS_OF_CORE_DEFAULT: &[&str] = &["is-focused"];

// The drag region handler the webview injects invokes `start_dragging` on the press
// itself, so no line of lib/host/index.ts names it.
const WINDOW_COMMANDS_OF_THE_DRAG_REGION: &[&str] = &["start-dragging"];

fn kebab(method: &str) -> String {
	method.chars().fold(String::new(), |mut name, letter| {
		if letter.is_ascii_uppercase() {
			name.push('-');
		}
		name.push(letter.to_ascii_lowercase());
		name
	})
}

fn is_event_subscription(method: &str) -> bool {
	method.starts_with("on")
}

fn window_handles(source: &str) -> Vec<&str> {
	source
		.lines()
		.filter(|line| line.contains(HANDLE_FACTORY))
		.filter_map(|line| line.split_once('='))
		.filter_map(|(binding, _)| binding.split_whitespace().last())
		.collect()
}

fn commands_called_on(source: &str, receiver: &str) -> Vec<String> {
	let needle = format!("{receiver}.");
	let mut commands = Vec::new();
	for (index, _) in source.match_indices(&needle) {
		let follows_an_identifier = source[..index]
			.chars()
			.next_back()
			.is_some_and(|letter| letter.is_ascii_alphanumeric() || letter == '_');
		if follows_an_identifier {
			continue;
		}
		let rest = &source[index + needle.len()..];
		let method: String = rest.chars().take_while(char::is_ascii_alphanumeric).collect();
		if !rest[method.len()..].starts_with('(') || is_event_subscription(&method) {
			continue;
		}
		commands.push(kebab(&method));
	}
	commands
}

fn commands_called_by_the_front(source: &str) -> BTreeSet<String> {
	let called_on_a_window = window_handles(source)
		.into_iter()
		.chain([HANDLE_FACTORY])
		.flat_map(|receiver| commands_called_on(source, receiver));
	WINDOW_COMMANDS_OF_THE_DRAG_REGION
		.iter()
		.map(ToString::to_string)
		.chain(called_on_a_window)
		.collect()
}

fn named_permissions(capability: &str) -> Vec<String> {
	let parsed: Value = serde_json::from_str(capability).expect("the capability is valid JSON");
	parsed["permissions"]
		.as_array()
		.expect("the capability lists its permissions")
		.iter()
		.filter_map(Value::as_str)
		.map(ToString::to_string)
		.collect()
}

fn window_commands_of(permissions: &[String]) -> BTreeSet<String> {
	permissions
		.iter()
		.filter_map(|entry| entry.strip_prefix(WINDOW_PREFIX))
		.map(ToString::to_string)
		.collect()
}

fn granted_window_commands(capability: &str) -> BTreeSet<String> {
	let permissions = named_permissions(capability);
	let mut granted = window_commands_of(&permissions);
	if permissions.iter().any(|entry| entry == CORE_DEFAULT) {
		granted.extend(WINDOW_COMMANDS_OF_CORE_DEFAULT.iter().map(ToString::to_string));
	}
	granted
}

fn listed(commands: BTreeSet<String>) -> String {
	commands
		.iter()
		.map(|command| format!("{WINDOW_PREFIX}{command}"))
		.collect::<Vec<_>>()
		.join(", ")
}

fn declares(config: &Value, key: &str) -> bool {
	match config {
		Value::Object(fields) => {
			fields.contains_key(key) || fields.values().any(|nested| declares(nested, key))
		}
		Value::Array(items) => items.iter().any(|item| declares(item, key)),
		_ => false,
	}
}

#[test]
fn the_capability_grants_every_window_command_the_front_calls() {
	let granted = granted_window_commands(CAPABILITY);
	let missing: BTreeSet<String> = commands_called_by_the_front(HOST)
		.into_iter()
		.filter(|command| !granted.contains(command))
		.collect();
	assert!(missing.is_empty(), "the capability is missing {}", listed(missing));
}

#[test]
fn the_capability_grants_no_window_command_the_front_leaves_uncalled() {
	let called = commands_called_by_the_front(HOST);
	let unused: BTreeSet<String> = window_commands_of(&named_permissions(CAPABILITY))
		.into_iter()
		.filter(|command| !called.contains(command))
		.collect();
	assert!(unused.is_empty(), "the capability grants {} that nothing calls", listed(unused));
}

#[test]
fn the_capability_grants_only_the_archive_pickers_of_the_dialog_plugin() {
	let parsed: Value = serde_json::from_str(CAPABILITY).expect("the capability is valid JSON");
	let granted: BTreeSet<&str> = parsed["permissions"]
		.as_array()
		.expect("the capability lists its permissions")
		.iter()
		.filter_map(|entry| entry.as_str().or_else(|| entry["identifier"].as_str()))
		.filter(|identifier| identifier.starts_with(DIALOG_PREFIX))
		.collect();
	let expected: BTreeSet<&str> =
		DIALOG_PERMISSIONS_OF_THE_ARCHIVE_PICKERS.iter().copied().collect();
	assert_eq!(granted, expected, "the capability grants a dialog permission beyond save and open");
}

#[test]
fn the_front_calls_set_focus_on_the_reveal_path() {
	assert!(
		commands_called_by_the_front(HOST).contains("set-focus"),
		"lib/host/index.ts no longer brings the window to the front"
	);
}

fn windows_of(capability: &str) -> Vec<String> {
	let parsed: Value = serde_json::from_str(capability).expect("the capability is valid JSON");
	parsed["windows"]
		.as_array()
		.expect("the capability lists its windows")
		.iter()
		.filter_map(Value::as_str)
		.map(ToString::to_string)
		.collect()
}

#[test]
fn every_capability_of_the_main_window_reaches_the_windows_opened_beside_it() {
	for (file, capability) in CAPABILITIES {
		let windows = windows_of(capability);
		assert!(windows.iter().any(|window| window == MAIN_WINDOW), "{file} no longer lists main");
		assert!(
			windows.iter().any(|window| window == SECONDARY_WINDOWS),
			"{file} lists main but not {SECONDARY_WINDOWS}, so a secondary window is refused what main is granted"
		);
	}
}

#[test]
fn the_dev_config_leaves_the_capability_to_the_base_config() {
	let config: Value = serde_json::from_str(DEV_CONFIG).expect("the dev config is valid JSON");
	for key in ["security", "capabilities"] {
		assert!(
			!declares(&config, key),
			"tauri.dev.conf.json declares `{key}`, so com.kiroshi.app.dev no longer shares the capability of com.kiroshi.app"
		);
	}
}
