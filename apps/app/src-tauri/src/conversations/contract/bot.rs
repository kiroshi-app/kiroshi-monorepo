use std::path::Path;

use serde::{Deserialize, Serialize};

use super::room::drawable_avatar;
use crate::bundles;
use crate::db::repositories::conversations;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AvatarBlot {
	Red,
	Yellow,
	Green,
	Cyan,
	Blue,
	Purple,
	Pink,
	Orange,
}

impl AvatarBlot {
	pub const ALL: &'static [AvatarBlot] = &[
		AvatarBlot::Red,
		AvatarBlot::Yellow,
		AvatarBlot::Green,
		AvatarBlot::Cyan,
		AvatarBlot::Blue,
		AvatarBlot::Purple,
		AvatarBlot::Pink,
		AvatarBlot::Orange,
	];
}

impl From<conversations::AvatarBlot> for AvatarBlot {
	fn from(blot: conversations::AvatarBlot) -> Self {
		match blot {
			conversations::AvatarBlot::Red => AvatarBlot::Red,
			conversations::AvatarBlot::Yellow => AvatarBlot::Yellow,
			conversations::AvatarBlot::Green => AvatarBlot::Green,
			conversations::AvatarBlot::Cyan => AvatarBlot::Cyan,
			conversations::AvatarBlot::Blue => AvatarBlot::Blue,
			conversations::AvatarBlot::Purple => AvatarBlot::Purple,
			conversations::AvatarBlot::Pink => AvatarBlot::Pink,
			conversations::AvatarBlot::Orange => AvatarBlot::Orange,
		}
	}
}

impl From<AvatarBlot> for conversations::AvatarBlot {
	fn from(blot: AvatarBlot) -> Self {
		match blot {
			AvatarBlot::Red => conversations::AvatarBlot::Red,
			AvatarBlot::Yellow => conversations::AvatarBlot::Yellow,
			AvatarBlot::Green => conversations::AvatarBlot::Green,
			AvatarBlot::Cyan => conversations::AvatarBlot::Cyan,
			AvatarBlot::Blue => conversations::AvatarBlot::Blue,
			AvatarBlot::Purple => conversations::AvatarBlot::Purple,
			AvatarBlot::Pink => conversations::AvatarBlot::Pink,
			AvatarBlot::Orange => conversations::AvatarBlot::Orange,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
	pub id: String,
	pub section_id: Option<String>,
	pub pin_position: Option<i64>,
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub instructions: String,
	pub memory: String,
	pub denied_tools: Vec<String>,
	pub changes_nothing: bool,
	pub permissions: crate::bundles::BotPermissions,
	pub output_style: String,
	pub effort: Option<bundles::EffortLevel>,
	pub created_at: i64,
}

impl Bot {
	pub fn of(bot: conversations::Bot, avatars: Option<&Path>, bundles: Option<&Path>) -> Self {
		let written = bundles.and_then(|root| crate::bundles::generated(root, &bot.id));
		let model = written
			.as_ref()
			.and_then(|written| written.model.clone())
			.unwrap_or_else(|| bot.model.clone());
		let denied_tools = written
			.as_ref()
			.map_or_else(|| bot.denied_tools.clone(), |written| written.denied_tools.clone());
		let avatar_blot =
			written.as_ref().map_or(bot.avatar_blot, |written| written.blot).map(Into::into);
		let output_style = written
			.as_ref()
			.map_or_else(default_output_style, |written| written.output_style.clone());
		let memory = crate::bundles::held_memory(written.as_ref(), &bot.memory);
		let instructions = written
			.map(|written| written.instructions)
			.filter(|found| crate::bundles::edited(found, &bot.instructions))
			.unwrap_or_else(|| bot.instructions.clone());
		let avatar_image_path = drawable_avatar(bot.avatar_image_path.as_deref(), avatars);
		let permissions = bot
			.permissions
			.clone()
			.unwrap_or_else(|| crate::bundles::BotPermissions::unruled_like(&denied_tools));
		Self {
			id: bot.id,
			section_id: bot.section_id,
			pin_position: bot.pin_position,
			name: bot.name,
			title: bot.title,
			model,
			avatar_blot,
			avatar_image_path,
			instructions,
			memory,
			changes_nothing: crate::bundles::denies_changes(&denied_tools),
			denied_tools,
			permissions,
			output_style,
			effort: bot.effort,
			created_at: bot.created_at,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BotIdentity {
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub instructions: String,
	pub denied_tools: Vec<String>,
	#[serde(default)]
	pub permissions: crate::bundles::BotPermissions,
	#[serde(default = "default_output_style")]
	pub output_style: String,
	#[serde(default)]
	pub effort: Option<bundles::EffortLevel>,
}

fn default_output_style() -> String {
	crate::bundles::DEFAULT_OUTPUT_STYLE.to_owned()
}

impl From<BotIdentity> for conversations::BotIdentity {
	fn from(identity: BotIdentity) -> Self {
		Self {
			name: identity.name,
			title: identity.title,
			model: identity.model,
			avatar_blot: identity.avatar_blot.map(Into::into),
			avatar_image_path: identity.avatar_image_path,
			instructions: identity.instructions,
			denied_tools: identity.denied_tools,
			effort: identity.effort,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BotDraft {
	pub name: String,
	pub job: String,
	pub description: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SuggestedBot {
	pub id: &'static str,
	pub name: &'static str,
	pub job: &'static str,
	pub description: &'static str,
	pub blurb: &'static str,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Skill {
	pub id: String,
	pub name: String,
	pub description: String,
	pub body: String,
	pub is_preloaded: bool,
	pub is_system: bool,
	pub files: Vec<String>,
	#[serde(flatten)]
	pub front: bundles::SkillFront,
}

impl From<bundles::Skill> for Skill {
	fn from(skill: bundles::Skill) -> Self {
		Self {
			id: skill.id,
			name: skill.name,
			description: skill.description,
			body: skill.body,
			is_preloaded: skill.is_preloaded,
			is_system: skill.is_system,
			files: skill.files,
			front: skill.front,
		}
	}
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct SkillDraft {
	pub name: String,
	pub description: String,
	pub body: String,
	#[serde(flatten)]
	pub front: bundles::SkillFront,
}

impl From<SkillDraft> for bundles::SkillDraft {
	fn from(draft: SkillDraft) -> Self {
		Self {
			name: draft.name,
			description: draft.description,
			body: draft.body,
			front: draft.front,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BotHistoryEntry {
	pub id: String,
	pub timestamp: i64,
	pub author: HistoryAuthor,
	pub title: String,
	pub body: String,
	pub paths: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct BotChangedFile {
	pub path: String,
	pub previous_path: Option<String>,
	pub change: HistoryFileChange,
	pub patch: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum HistoryFileChange {
	Added,
	Modified,
	Deleted,
	Renamed,
}

impl From<bundles::FileChange> for HistoryFileChange {
	fn from(change: bundles::FileChange) -> Self {
		match change {
			bundles::FileChange::Added => HistoryFileChange::Added,
			bundles::FileChange::Modified => HistoryFileChange::Modified,
			bundles::FileChange::Deleted => HistoryFileChange::Deleted,
			bundles::FileChange::Renamed => HistoryFileChange::Renamed,
		}
	}
}

impl From<bundles::ChangedFile> for BotChangedFile {
	fn from(file: bundles::ChangedFile) -> Self {
		Self {
			path: file.path,
			previous_path: file.previous_path,
			change: file.change.into(),
			patch: file.patch,
		}
	}
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum HistoryAuthor {
	User,
	Bot,
}

impl From<bundles::Author> for HistoryAuthor {
	fn from(author: bundles::Author) -> Self {
		match author {
			bundles::Author::User => HistoryAuthor::User,
			bundles::Author::Bot => HistoryAuthor::Bot,
		}
	}
}

impl From<bundles::HistoryEntry> for BotHistoryEntry {
	fn from(entry: bundles::HistoryEntry) -> Self {
		Self {
			id: entry.id,
			timestamp: entry.timestamp,
			author: entry.author.into(),
			title: entry.title,
			body: entry.body,
			paths: entry.paths,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct McpServer {
	pub name: String,
	#[specta(type = crate::json::JsonValue)]
	pub config: serde_json::Value,
	#[serde(flatten)]
	pub mark: bundles::ApplicationMark,
}

impl From<bundles::McpServer> for McpServer {
	fn from(server: bundles::McpServer) -> Self {
		Self { name: server.name, config: server.config, mark: server.mark }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::tests::assert_crosses_as;
	use super::super::Chat;
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	#[test]
	fn a_bot_and_the_chat_it_holds_cross_as_camel_case() {
		assert_crosses_as(
			Bot {
				id: "default".into(),
				section_id: None,
				pin_position: None,
				name: "Claude".into(),
				title: "Reviewer".into(),
				model: "opus".into(),
				avatar_blot: Some(AvatarBlot::Red),
				avatar_image_path: Some("/pictures/owl.png".into()),
				instructions: "Answer briefly.".into(),
				memory: "They bake on Sundays.".into(),
				denied_tools: vec![
					"Bash".into(),
					"Edit".into(),
					"NotebookEdit".into(),
					"Write".into(),
				],
				changes_nothing: true,
				permissions: crate::bundles::BotPermissions::unruled(true),
				output_style: "Concise".into(),
				created_at: 1,
				effort: Some(crate::bundles::EffortLevel::Xhigh),
			},
			json!({
				"id": "default",
				"sectionId": null,
				"pinPosition": null,
				"name": "Claude",
				"title": "Reviewer",
				"model": "opus",
				"avatarBlot": "red",
				"avatarImagePath": "/pictures/owl.png",
				"instructions": "Answer briefly.",
				"memory": "They bake on Sundays.",
				"deniedTools": ["Bash", "Edit", "NotebookEdit", "Write"],
				"changesNothing": true,
				"permissions": {
					"defaultMode": "auto",
					"allow": [],
					"ask": [],
					"deny": ["Bash", "Edit", "Write", "NotebookEdit"]
				},
				"outputStyle": "Concise",
				"effort": "xhigh",
				"createdAt": 1
			}),
		);
		assert_crosses_as(
			Chat { id: "c1".into(), created_at: 1, updated_at: 2 },
			json!({ "id": "c1", "createdAt": 1, "updatedAt": 2 }),
		);
	}

	#[test]
	fn a_bot_with_nothing_said_about_it_crosses_with_its_absences_intact() {
		assert_crosses_as(
			BotIdentity {
				name: "Claude".into(),
				title: String::new(),
				model: "sonnet".into(),
				avatar_blot: None,
				avatar_image_path: None,
				instructions: String::new(),
				denied_tools: Vec::new(),
				permissions: crate::bundles::BotPermissions::default(),
				output_style: "Concise".into(),
				effort: None,
			},
			json!({
				"name": "Claude",
				"title": "",
				"model": "sonnet",
				"avatarBlot": null,
				"avatarImagePath": null,
				"instructions": "",
				"deniedTools": [],
				"permissions": {
					"defaultMode": "auto",
					"allow": [],
					"ask": [],
					"deny": []
				},
				"outputStyle": "Concise",
				"effort": null
			}),
		);
	}

	#[test]
	fn every_blot_crosses_as_one_word_and_nothing_else_parses() {
		for (blot, wire) in [
			(AvatarBlot::Red, "red"),
			(AvatarBlot::Yellow, "yellow"),
			(AvatarBlot::Green, "green"),
			(AvatarBlot::Cyan, "cyan"),
			(AvatarBlot::Blue, "blue"),
			(AvatarBlot::Purple, "purple"),
			(AvatarBlot::Pink, "pink"),
			(AvatarBlot::Orange, "orange"),
		] {
			assert_crosses_as(blot, json!(wire));
		}
		assert_crosses_as(None::<AvatarBlot>, json!(null));
		assert!(
			serde_json::from_value::<AvatarBlot>(json!("chartreuse")).is_err(),
			"a colour outside the palette parsed at the boundary"
		);
	}

	#[test]
	fn an_identity_still_spelling_the_abandoned_words_crosses_as_a_bot_with_no_mark() {
		let submitted = json!({
			"name": "Nyx",
			"title": "",
			"description": "Reads a diff.",
			"model": "sonnet",
			"avatarPose": "idle",
			"avatarImagePath": null,
			"instructions": "",
			"changesNothing": true,
			"deniedTools": []
		});

		let parsed = serde_json::from_value::<BotIdentity>(submitted).expect("the identity parses");

		assert_eq!(parsed.avatar_blot, None, "a pose reached the mark it is not");
		assert!(parsed.denied_tools.is_empty(), "a switch reached the list it is not");
	}

	fn a_stored_bot(model: &str) -> conversations::Bot {
		conversations::Bot {
			id: "b1".into(),
			section_id: None,
			pin_position: None,
			name: "Nyx".into(),
			title: String::new(),
			model: model.to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: String::new(),
			memory: String::new(),
			denied_tools: Vec::new(),
			permissions: None,
			created_at: 1,
			effort: None,
		}
	}

	fn a_bundle_root(name: &str) -> RemovedOnDrop {
		crate::db::connection::fixture_root(&format!("contract-{name}"))
	}

	#[test]
	fn a_bot_wearing_a_path_the_host_will_not_serve_crosses_without_one() {
		let stored = |path: Option<&str>| conversations::Bot {
			avatar_image_path: path.map(str::to_owned),
			..a_stored_bot("sonnet")
		};
		let dir = std::env::temp_dir();

		assert_eq!(Bot::of(stored(Some("/etc/passwd")), Some(&dir), None).avatar_image_path, None);
		assert_eq!(Bot::of(stored(Some("/etc/passwd")), None, None).avatar_image_path, None);
		assert_eq!(Bot::of(stored(None), Some(&dir), None).avatar_image_path, None);
	}

	#[test]
	fn a_bot_is_reported_on_the_model_its_bundle_names() {
		let root = a_bundle_root("model");
		crate::bundles::write(&root, &a_stored_bot("haiku")).expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).model, "haiku");
		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, None).model, "sonnet");

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_is_reported_on_the_rules_it_holds_and_never_on_the_ones_its_file_declares() {
		let root = a_bundle_root("rules");
		let stored = a_stored_bot("sonnet");
		crate::bundles::write(&root, &stored).expect("the bundle is written");
		crate::bundles::set_permissions(
			&root,
			&stored,
			&crate::bundles::BotPermissions { allow: vec!["Bash".into()], ..Default::default() },
		)
		.expect("the file declares its rules");

		let held =
			crate::bundles::BotPermissions { allow: vec!["Read".into()], ..Default::default() };
		let ruled =
			conversations::Bot { permissions: Some(held.clone()), ..a_stored_bot("sonnet") };

		assert_eq!(Bot::of(ruled, None, Some(&root)).permissions, held);
		assert_eq!(
			Bot::of(a_stored_bot("sonnet"), None, Some(&root)).permissions,
			crate::bundles::BotPermissions::default(),
			"a bot holding no rules read the ones its file declares"
		);

		let held_back = conversations::Bot {
			denied_tools: crate::bundles::CHANGING_TOOLS.map(str::to_owned).to_vec(),
			..a_stored_bot("sonnet")
		};
		assert_eq!(
			Bot::of(held_back, None, None).permissions,
			crate::bundles::BotPermissions::unruled(true),
			"a bot that changed nothing lost the denial the switch stood for"
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_is_reported_on_the_style_its_bundle_names() {
		let root = a_bundle_root("style");
		crate::bundles::write_styled(&root, &a_stored_bot("sonnet"), "default", None)
			.expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).output_style, "default");
		assert_eq!(
			Bot::of(a_stored_bot("sonnet"), None, None).output_style,
			default_output_style()
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_is_reported_on_the_tint_its_bundle_names() {
		let root = a_bundle_root("tint");
		let marked = conversations::Bot {
			avatar_blot: Some(conversations::AvatarBlot::Purple),
			..a_stored_bot("sonnet")
		};
		crate::bundles::write(&root, &marked).expect("the bundle is written");
		let stored_pink = || conversations::Bot {
			avatar_blot: Some(conversations::AvatarBlot::Pink),
			..a_stored_bot("sonnet")
		};

		assert_eq!(Bot::of(stored_pink(), None, Some(&root)).avatar_blot, Some(AvatarBlot::Purple));
		assert_eq!(Bot::of(stored_pink(), None, None).avatar_blot, Some(AvatarBlot::Pink));

		crate::bundles::write(&root, &a_stored_bot("sonnet")).expect("the bundle is rewritten");
		assert_eq!(Bot::of(stored_pink(), None, Some(&root)).avatar_blot, None);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_bot_carries_the_memory_its_block_holds_and_the_one_stored_when_the_block_is_empty() {
		let root = a_bundle_root("memory");
		let learned =
			|| conversations::Bot { memory: "They use bun.".into(), ..a_stored_bot("sonnet") };
		crate::bundles::write(&root, &learned()).expect("the bundle is written");

		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).memory, "They use bun.");
		assert_eq!(Bot::of(learned(), None, None).memory, "They use bun.");

		crate::bundles::write_remembered(&root, &learned(), "").expect("the memory is cleared");
		assert_eq!(Bot::of(a_stored_bot("sonnet"), None, Some(&root)).memory, "");

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_brief_ending_in_a_space_crosses_as_the_reader_typed_it() {
		let root = a_bundle_root("still-typing");
		let typed = conversations::Bot { instructions: "Parles ".into(), ..a_stored_bot("sonnet") };
		crate::bundles::write(&root, &typed).expect("the bundle is written");

		assert_eq!(Bot::of(typed, None, Some(&root)).instructions, "Parles ");

		let _ = std::fs::remove_dir_all(&root);
	}
}
