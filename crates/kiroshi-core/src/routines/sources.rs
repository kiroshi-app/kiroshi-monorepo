use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;

use super::contract::TriggerSource;
use crate::conversations::contract::TranscriptStoreError;

const TRIGGERS_NAME: &str = ".triggers.json";

#[derive(Deserialize)]
struct Declaration {
	#[serde(default)]
	sources: Vec<TriggerSource>,
}

pub fn sources_at(bundle: &Path) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	let path = bundle.join(TRIGGERS_NAME);
	let text = match fs::read_to_string(&path) {
		Ok(text) => text,
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Vec::new()),
		Err(error) => return Err(unreadable(&path, error.to_string())),
	};
	serde_json::from_str::<Declaration>(&text)
		.map(|declaration| declaration.sources)
		.map_err(|error| unreadable(&path, error.to_string()))
}

pub fn stacked(bundles: &[PathBuf]) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	bundles.iter().try_fold(Vec::new(), |stacked, bundle| overlaid(stacked, bundle))
}

pub fn overlaid(
	mut stacked: Vec<TriggerSource>,
	bundle: &Path,
) -> Result<Vec<TriggerSource>, TranscriptStoreError> {
	for source in sources_at(bundle)? {
		match stacked.iter_mut().find(|held| held.id == source.id) {
			Some(held) => *held = source,
			None => stacked.push(source),
		}
	}
	Ok(stacked)
}

fn unreadable(path: &Path, reason: String) -> TranscriptStoreError {
	TranscriptStoreError::UnreadableSources { path: path.display().to_string(), reason }
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;
	use crate::db::connection::fixture_root;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_bundle(name: &str) -> RemovedOnDrop {
		let path = fixture_root(&format!("triggers-{name}"));
		fs::create_dir_all(&path).expect("the bundle directory is there");
		path
	}

	fn declaring(bundle: &Path, text: &str) {
		fs::write(bundle.join(TRIGGERS_NAME), text).expect("the declaration lands");
	}

	fn declaring_source(bundle: &Path, id: &str, title: &str) {
		let declaration = json!({
			"sources": [{
				"id": id,
				"title": title,
				"payload": [{ "name": "at", "type": "datetime" }],
				"dedupeKey": "at",
			}],
		});
		declaring(bundle, &declaration.to_string());
	}

	fn ids(sources: &[TriggerSource]) -> Vec<String> {
		sources.iter().map(|source| source.id.clone()).collect()
	}

	fn committed_system_bundle() -> PathBuf {
		PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("plugins").join("kiroshi")
	}

	#[test]
	fn a_bundle_holding_no_declaration_contributes_no_source() {
		let bundle = a_bundle("silent");

		assert_eq!(sources_at(&bundle).expect("the read succeeds"), Vec::new());

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_declaration_that_does_not_parse_names_the_file_and_the_reason() {
		let bundle = a_bundle("broken");
		declaring(&bundle, "{\"sources\": [");

		let failure = sources_at(&bundle).expect_err("the read fails");

		let TranscriptStoreError::UnreadableSources { path, reason } = failure else {
			panic!("got {failure:?}");
		};
		assert_eq!(path, bundle.join(TRIGGERS_NAME).display().to_string());
		assert!(!reason.is_empty(), "the reason is carried");

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_source_whose_field_type_is_not_in_the_vocabulary_does_not_parse() {
		let bundle = a_bundle("unknown-type");
		declaring(
			&bundle,
			&json!({
				"sources": [{
					"id": "a",
					"title": "A",
					"payload": [{ "name": "at", "type": "duration" }],
					"dedupeKey": "at",
				}],
			})
			.to_string(),
		);

		assert!(
			matches!(sources_at(&bundle), Err(TranscriptStoreError::UnreadableSources { .. })),
			"the declaration is refused"
		);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn the_bundles_stack_in_the_order_they_are_given() {
		let system = a_bundle("stack-system");
		let space = a_bundle("stack-space");
		let bot = a_bundle("stack-bot");
		declaring_source(&system, "schedule", "System");
		declaring_source(&space, "space-inbox", "Space");
		declaring_source(&bot, "bot-mail", "Bot");

		let stacked = stacked(&[system.to_path_buf(), space.to_path_buf(), bot.to_path_buf()])
			.expect("it reads");

		assert_eq!(ids(&stacked), ["schedule", "space-inbox", "bot-mail"]);

		for bundle in [system, space, bot] {
			let _ = fs::remove_dir_all(bundle);
		}
	}

	#[test]
	fn a_source_declared_twice_is_returned_once_as_the_later_bundle_declared_it() {
		let system = a_bundle("shadowed-system");
		let bot = a_bundle("shadowed-bot");
		declaring_source(&system, "schedule", "System");
		declaring_source(&bot, "schedule", "Bot");

		let stacked = stacked(&[system.to_path_buf(), bot.to_path_buf()]).expect("it reads");

		assert_eq!(ids(&stacked), ["schedule"]);
		assert_eq!(stacked[0].title, "Bot");

		for bundle in [system, bot] {
			let _ = fs::remove_dir_all(bundle);
		}
	}

	#[test]
	fn a_declaration_that_does_not_parse_holds_back_the_other_bundles() {
		let system = a_bundle("held-system");
		let bot = a_bundle("held-bot");
		declaring_source(&system, "schedule", "System");
		declaring(&bot, "not json");

		let failure =
			stacked(&[system.to_path_buf(), bot.to_path_buf()]).expect_err("the read fails");

		assert!(
			matches!(failure, TranscriptStoreError::UnreadableSources { .. }),
			"got {failure:?}"
		);

		for bundle in [system, bot] {
			let _ = fs::remove_dir_all(bundle);
		}
	}

	#[test]
	fn the_system_plugin_declares_the_three_sources_it_ships() {
		let sources = sources_at(&committed_system_bundle()).expect("the declaration reads");

		assert_eq!(ids(&sources), ["schedule", "file-watch", "local-webhook"]);
		for source in &sources {
			assert!(!source.title.is_empty(), "got {}", source.id);
			assert!(
				source.payload.iter().any(|field| field.name == source.dedupe_key),
				"the dedupe key of {} names one of its payload fields",
				source.id
			);
		}
		let webhook = sources.iter().find(|source| source.id == "local-webhook");
		assert_eq!(
			webhook.and_then(|source| source.header.clone()),
			Some("X-Kiroshi-Delivery".to_owned())
		);
	}
}
