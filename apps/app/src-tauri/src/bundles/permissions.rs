use std::path::Path;

use serde::{Deserialize, Serialize};

use super::{
	denies_changes, dir, object_at, serialised, settings_path, ALLOW_KEY, ASK_KEY, CHANGING_TOOLS,
	DEFAULT_MODE_KEY, DENY_KEY, DIRECTORIES_KEY, PERMISSIONS_KEY, PERMISSION_MODES, SETTINGS_NAME,
};
use crate::db::repositories::conversations::Bot;
use crate::private_files;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BotPermissions {
	pub default_mode: String,
	pub allow: Vec<String>,
	pub ask: Vec<String>,
	pub deny: Vec<String>,
}

impl Default for BotPermissions {
	fn default() -> Self {
		Self::unruled(false)
	}
}

impl BotPermissions {
	pub fn unruled(denies_changes: bool) -> Self {
		Self {
			default_mode: PERMISSION_MODES.fallback.clone(),
			allow: Vec::new(),
			ask: Vec::new(),
			deny: if denies_changes {
				CHANGING_TOOLS.map(str::to_owned).to_vec()
			} else {
				Vec::new()
			},
		}
	}

	pub fn unruled_like(denied_tools: &[String]) -> Self {
		Self::unruled(denies_changes(denied_tools))
	}

	pub fn accepted(self) -> Self {
		Self { default_mode: accepted_mode(&self.default_mode).to_owned(), ..self }
	}
}

pub fn permissions(root: &Path, bot_id: &str) -> Option<BotPermissions> {
	let declared = declared_permissions(&settings_path(root, bot_id).ok()?)?;
	Some(BotPermissions {
		default_mode: declared_mode(&declared),
		allow: listed(&declared, ALLOW_KEY),
		ask: listed(&declared, ASK_KEY),
		deny: listed(&declared, DENY_KEY),
	})
}

pub fn set_permissions(
	root: &Path,
	bot: &Bot,
	permissions: &BotPermissions,
) -> std::io::Result<()> {
	let bundle = dir(root, &bot.id)?;
	let _serialised = serialised(&bundle);
	let path = bundle.join(SETTINGS_NAME);
	let mut kept = object_at(&path);
	let mut declared = match kept.remove(PERMISSIONS_KEY) {
		Some(serde_json::Value::Object(held)) => held,
		_ => serde_json::Map::new(),
	};
	declared.insert(DEFAULT_MODE_KEY.to_owned(), accepted_mode(&permissions.default_mode).into());
	declared.remove(DIRECTORIES_KEY);
	for (key, items) in [
		(ALLOW_KEY, &permissions.allow),
		(ASK_KEY, &permissions.ask),
		(DENY_KEY, &permissions.deny),
	] {
		written_list(&mut declared, key, items);
	}
	kept.insert(PERMISSIONS_KEY.to_owned(), serde_json::Value::Object(declared));
	private_files::replace(&path, serde_json::Value::Object(kept).to_string().as_bytes())
}

fn written_list(
	declared: &mut serde_json::Map<String, serde_json::Value>,
	key: &str,
	items: &[String],
) {
	if items.is_empty() {
		declared.remove(key);
	} else {
		declared.insert(key.to_owned(), serde_json::json!(items));
	}
}

fn declared_permissions(path: &Path) -> Option<serde_json::Map<String, serde_json::Value>> {
	match object_at(path).remove(PERMISSIONS_KEY) {
		Some(serde_json::Value::Object(declared)) => Some(declared),
		_ => None,
	}
}

fn declared_mode(declared: &serde_json::Map<String, serde_json::Value>) -> String {
	accepted_mode(
		declared.get(DEFAULT_MODE_KEY).and_then(serde_json::Value::as_str).unwrap_or_default(),
	)
	.to_owned()
}

fn accepted_mode(mode: &str) -> &str {
	if PERMISSION_MODES.modes.iter().any(|listed| listed == mode) {
		mode
	} else {
		&PERMISSION_MODES.fallback
	}
}

fn listed(declared: &serde_json::Map<String, serde_json::Value>, key: &str) -> Vec<String> {
	declared.get(key).and_then(serde_json::Value::as_array).map_or_else(Vec::new, |values| {
		values.iter().filter_map(|value| value.as_str().map(str::to_owned)).collect()
	})
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::super::tests::{a_bot, a_root};
	use super::super::{settings_file, write};
	use super::*;

	#[test]
	fn a_bot_whose_file_rules_on_nothing_reads_as_unruled_and_the_switch_it_had_becomes_a_denial() {
		let root = a_root("unruled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		assert_eq!(permissions(&root, &bot.id), None);
		assert_eq!(
			BotPermissions::unruled(true).deny,
			CHANGING_TOOLS.map(str::to_owned).to_vec(),
			"the retired switch reached the deny list as something else"
		);
		assert!(BotPermissions::unruled(false).deny.is_empty());
		assert_eq!(BotPermissions::default(), BotPermissions::unruled(false));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_rules_a_file_declares_are_read_back_and_the_mode_it_may_not_ask_for_is_not() {
		let root = a_root("declared");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		private_files::replace(
			&settings_path(&root, &bot.id).expect("the bundle is held"),
			serde_json::json!({
				"permissions": {
					"defaultMode": "bypassPermissions",
					"allow": ["Read", 7],
					"deny": ["Bash(rm:*)"],
					"additionalDirectories": ["/notes"]
				}
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		let read = permissions(&root, &bot.id).expect("the file rules on something");

		assert_eq!(
			read.default_mode, PERMISSION_MODES.fallback,
			"a mode nobody may ask for was read back"
		);
		assert_eq!(read.allow, vec!["Read".to_owned()], "a rule that is not text was read back");
		assert!(read.ask.is_empty());
		assert_eq!(read.deny, vec!["Bash(rm:*)".to_owned()]);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn opening_a_session_forgets_the_directories_a_file_still_names() {
		let root = a_root("forgotten");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let path = settings_path(&root, &bot.id).expect("the bundle is held");
		private_files::replace(
			&path,
			serde_json::json!({
				"outputStyle": "Concise",
				"permissions": {
					"deny": ["Bash"],
					"additionalDirectories": ["/notes"],
					"whatever": true
				}
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		assert_eq!(settings_file(&root, &bot.id), Some(path.clone()));

		let written = object_at(&path);
		assert_eq!(
			written["permissions"]["additionalDirectories"],
			serde_json::Value::Null,
			"a directory the bot named itself outlived the session"
		);
		assert_eq!(written["outputStyle"], serde_json::json!("Concise"));
		assert_eq!(written["permissions"]["deny"], serde_json::json!(["Bash"]));
		assert_eq!(written["permissions"]["whatever"], serde_json::json!(true));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn writing_the_rules_leaves_every_other_key_of_the_file_standing() {
		let root = a_root("ruled");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");
		let path = settings_path(&root, &bot.id).expect("the bundle is held");
		private_files::replace(
			&path,
			serde_json::json!({
				"outputStyle": "Concise",
				"permissions": { "deny": ["Bash"], "defaultMode": "plan", "whatever": true }
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");

		let wanted = BotPermissions {
			default_mode: "acceptEdits".to_owned(),
			allow: vec!["Read".to_owned()],
			ask: Vec::new(),
			deny: Vec::new(),
		};
		set_permissions(&root, &bot, &wanted).expect("the rules are written");

		let written = object_at(&path);
		assert_eq!(written["outputStyle"], serde_json::json!("Concise"));
		assert_eq!(written["permissions"]["whatever"], serde_json::json!(true));
		assert_eq!(
			written["permissions"]["deny"],
			serde_json::Value::Null,
			"an emptied list stayed"
		);
		assert_eq!(permissions(&root, &bot.id), Some(wanted));

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn a_mode_the_runtime_would_refuse_is_never_written() {
		let root = a_root("bypassed");
		let bot = a_bot("Bean", "Answer briefly.");
		write(&root, &bot).expect("the bundle is written");

		set_permissions(
			&root,
			&bot,
			&BotPermissions {
				default_mode: "bypassPermissions".to_owned(),
				..BotPermissions::default()
			},
		)
		.expect("the rules are written");

		assert_eq!(
			object_at(&settings_path(&root, &bot.id).expect("the bundle is held"))["permissions"]
				["defaultMode"],
			serde_json::json!(PERMISSION_MODES.fallback)
		);

		let _ = fs::remove_dir_all(&root);
	}

	#[test]
	fn the_shared_modes_refuse_bypass_and_hold_their_fallback() {
		assert!(
			!PERMISSION_MODES.modes.iter().any(|mode| mode == "bypassPermissions"),
			"the shared modes let a bot bypass every permission"
		);
		assert!(
			PERMISSION_MODES.modes.contains(&PERMISSION_MODES.fallback),
			"the shared fallback is not one of the shared modes"
		);
	}

	#[test]
	fn every_shared_mode_is_accepted_and_any_other_string_falls_back() {
		for mode in &PERMISSION_MODES.modes {
			assert_eq!(accepted_mode(mode), mode, "a shared mode was refused");
		}
		assert_eq!(accepted_mode("everything"), PERMISSION_MODES.fallback);
	}
}
