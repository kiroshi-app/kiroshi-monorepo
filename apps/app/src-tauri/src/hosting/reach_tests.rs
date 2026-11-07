use std::path::Path;

use kiroshi_core::hosting::reach;

use crate::removed_on_drop::RemovedOnDrop;

fn registered_commands() -> Vec<String> {
	let bindings = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-host-only-{}.ts", uuid::Uuid::new_v4())),
	);
	crate::commands::builder()
		.dangerously_cast_bigints_to_number()
		.export(specta_typescript::Typescript::default(), &bindings)
		.expect("the command surface exports");
	let surface = std::fs::read_to_string(&bindings).expect("the bindings read back");
	std::fs::remove_file(&bindings).expect("the bindings are cleaned up");
	surface
		.split("__TAURI_INVOKE")
		.skip(1)
		.filter_map(|invoked| invoked.split("(\"").nth(1)?.split('"').next())
		.map(str::to_owned)
		.collect()
}

#[test]
fn the_reach_table_classifies_every_registered_command_once_and_nothing_else() {
	let mut registered = registered_commands();
	let mut classified: Vec<String> =
		reach::REACHES.iter().map(|(command, _)| (*command).to_owned()).collect();
	registered.sort();
	classified.sort();

	assert_eq!(classified, registered);
}

fn declared_event_name(line: &str) -> Option<&str> {
	let (declared, value) =
		line.trim_start_matches("pub ").strip_prefix("const ")?.split_once(": &str = \"")?;
	let is_an_event = declared.ends_with("_EVENT") || declared.ends_with("_CHANNEL");
	let name = value.strip_suffix("\";")?;
	(is_an_event && !name.contains(char::is_whitespace)).then_some(name)
}

const CORE_SOURCES: &str = "../../../crates/kiroshi-core/src";

#[test]
fn the_audience_table_classifies_every_published_event_once_and_nothing_else() {
	let manifest = Path::new(env!("CARGO_MANIFEST_DIR"));
	let mut published: Vec<String> = [manifest.join("src"), manifest.join(CORE_SOURCES)]
		.iter()
		.flat_map(|root| crate::events::tests::rust_files(root))
		.flat_map(|path| {
			let source = std::fs::read_to_string(path).expect("the file reads");
			source
				.lines()
				.filter_map(|line| declared_event_name(line.trim()))
				.map(str::to_owned)
				.collect::<Vec<_>>()
		})
		.collect();
	let mut classified: Vec<String> =
		reach::AUDIENCES.iter().map(|(event, _)| (*event).to_owned()).collect();
	published.sort();
	classified.sort();

	assert_eq!(classified, published);
}

#[test]
fn an_event_name_is_read_from_its_constant_only() {
	assert_eq!(declared_event_name(r#"pub const CHANGED_EVENT: &str = "a://b";"#), Some("a://b"));
	assert_eq!(declared_event_name(r#"const EVENT_CHANNEL: &str = "a://c";"#), Some("a://c"));
	assert_eq!(declared_event_name(r#"const INSERT_EVENT: &str = "INSERT INTO x"#), None);
	assert_eq!(declared_event_name(r#"const LINK: &str = "a://d";"#), None);
}
