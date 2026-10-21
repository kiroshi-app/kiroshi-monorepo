use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::contract::PluginScope;
use crate::bundles::{self, plugin, ApplicationMark};
use crate::conversations::commands::{bot_owner, bot_row, bundled, ready, recounted};
use crate::conversations::contract::{
	BotChangedFile, BotHistoryEntry, McpServer, Skill, SkillDraft, TranscriptStoreError,
};
use crate::db;
use crate::db::repositories::conversations::Bot as StoredBot;
use crate::environment;
use crate::environment::contract::EnvOwner;
use crate::json::JsonValue;

enum Plugin {
	Bot { root: PathBuf, id: String },
	Owned { path: PathBuf, owner: EnvOwner },
}

impl Plugin {
	fn is_laid_down(&self) -> bool {
		match self {
			Plugin::Bot { root, id } => bundles::dir(root, id).is_ok(),
			Plugin::Owned { .. } => true,
		}
	}
}

fn located<R: Runtime>(app: &AppHandle<R>, scope: &PluginScope) -> Option<Plugin> {
	match scope {
		PluginScope::Bot { id } => {
			bundles::root(app).map(|root| Plugin::Bot { root, id: id.clone() })
		}
		PluginScope::Space { id } => bundles::space::laid_down(app, id)
			.map(|path| Plugin::Owned { path, owner: EnvOwner::Space { id: id.clone() } }),
		PluginScope::User => {
			bundles::user::laid_down(app).map(|path| Plugin::Owned { path, owner: EnvOwner::User })
		}
	}
}

fn laid_down<R: Runtime>(app: &AppHandle<R>, scope: &PluginScope) -> Option<Plugin> {
	located(app, scope).filter(Plugin::is_laid_down)
}

fn writable<R: Runtime>(
	app: &AppHandle<R>,
	scope: &PluginScope,
) -> Result<Plugin, TranscriptStoreError> {
	located(app, scope)
		.ok_or_else(|| TranscriptStoreError::UnwritableBundle { detail: absent(scope).to_owned() })
}

fn absent(scope: &PluginScope) -> &'static str {
	match scope {
		PluginScope::Bot { .. } => "there is no application data directory to keep bundles in",
		PluginScope::Space { .. } => "the space's plugin has not been laid down yet",
		PluginScope::User => "the person's own plugin has not been laid down yet",
	}
}

async fn stored_bot(
	state: &db::DatabaseState,
	bot_id: &str,
) -> Result<StoredBot, TranscriptStoreError> {
	bot_row(ready(state)?, bot_id).await
}

fn refuse_system_skill(
	root: &Path,
	bot_id: &str,
	skill_id: &str,
) -> Result<(), TranscriptStoreError> {
	if bundles::is_system_skill(root, bot_id, skill_id) {
		return Err(TranscriptStoreError::SystemSkill { id: skill_id.to_owned() });
	}
	Ok(())
}

fn history_of(target: &Plugin) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let entries = match target {
		Plugin::Bot { root, id } => bundles::history(root, id),
		Plugin::Owned { path, .. } => plugin::history(path),
	};
	recounted(entries).map(|entries| entries.into_iter().map(BotHistoryEntry::from).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_skills<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
) -> Result<Vec<Skill>, TranscriptStoreError> {
	let skills = match laid_down(&app, &scope) {
		None => Vec::new(),
		Some(Plugin::Bot { root, id }) => bundles::skills(&root, &id),
		Some(Plugin::Owned { path, .. }) => plugin::skills(&path),
	};
	Ok(skills.into_iter().map(Skill::from).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_create_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let created = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			let bot = stored_bot(&state, &id).await?;
			bundles::create_skill(&root, &bot, &draft.into())
		}
		Plugin::Owned { path, .. } => plugin::create_skill(&path, &draft.into()),
	};
	bundled(created).map(Skill::from)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_update_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	skill_id: String,
	draft: SkillDraft,
) -> Result<Skill, TranscriptStoreError> {
	let updated = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			refuse_system_skill(&root, &id, &skill_id)?;
			let bot = stored_bot(&state, &id).await?;
			bundles::update_skill(&root, &bot, &skill_id, &draft.into())
		}
		Plugin::Owned { path, .. } => plugin::update_skill(&path, &skill_id, &draft.into()),
	};
	bundled(updated).map(Skill::from)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_set_skill_preloaded<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	skill_id: String,
	is_preloaded: bool,
) -> Result<Skill, TranscriptStoreError> {
	let set = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			refuse_system_skill(&root, &id, &skill_id)?;
			let bot = stored_bot(&state, &id).await?;
			bundles::set_skill_preloaded(&root, &bot, &skill_id, is_preloaded)
		}
		Plugin::Owned { path, .. } => plugin::set_skill_preloaded(&path, &skill_id, is_preloaded),
	};
	bundled(set).map(Skill::from)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_skill<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	skill_id: String,
) -> Result<(), TranscriptStoreError> {
	let removed = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			refuse_system_skill(&root, &id, &skill_id)?;
			let bot = stored_bot(&state, &id).await?;
			bundles::remove_skill(&root, &bot, &skill_id)
		}
		Plugin::Owned { path, .. } => plugin::remove_skill(&path, &skill_id),
	};
	bundled(removed)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_skill_file<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
	skill_id: String,
	path: String,
) -> Result<String, TranscriptStoreError> {
	let read = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => bundles::skill_file(&root, &id, &skill_id, &path),
		Plugin::Owned { path: bundle, .. } => plugin::skill_file(&bundle, &skill_id, &path),
	};
	bundled(read)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_write_skill_file<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
	skill_id: String,
	path: String,
	text: String,
) -> Result<Skill, TranscriptStoreError> {
	let written = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			refuse_system_skill(&root, &id, &skill_id)?;
			bundles::write_skill_file(&root, &id, &skill_id, &path, &text)
		}
		Plugin::Owned { path: bundle, .. } => {
			plugin::write_skill_file(&bundle, &skill_id, &path, &text)
		}
	};
	bundled(written).map(Skill::from)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_skill_file<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
	skill_id: String,
	path: String,
) -> Result<(), TranscriptStoreError> {
	let removed = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			refuse_system_skill(&root, &id, &skill_id)?;
			bundles::remove_skill_file(&root, &id, &skill_id, &path)
		}
		Plugin::Owned { path: bundle, .. } => plugin::remove_skill_file(&bundle, &skill_id, &path),
	};
	bundled(removed)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_mcp_servers<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
) -> Result<Vec<McpServer>, TranscriptStoreError> {
	let servers = match laid_down(&app, &scope) {
		None => Vec::new(),
		Some(Plugin::Bot { root, id }) => bundles::mcp_servers(&root, &id),
		Some(Plugin::Owned { path, .. }) => plugin::mcp_servers(&path),
	};
	Ok(servers.into_iter().map(McpServer::from).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_set_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	name: String,
	config: JsonValue,
	mark: Option<ApplicationMark>,
) -> Result<McpServer, TranscriptStoreError> {
	let config = config.0;
	let set = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			let bot = stored_bot(&state, &id).await?;
			bundles::set_mcp_server(&root, &bot, &name, &config, mark.as_ref())
		}
		Plugin::Owned { path, .. } => plugin::set_mcp_server(&path, &name, &config, mark.as_ref()),
	};
	bundled(set).map(McpServer::from)
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_delete_mcp_server<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	name: String,
) -> Result<(), TranscriptStoreError> {
	let owner = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			let database = ready(&state)?;
			let bot = bot_row(database, &id).await?;
			bundled(bundles::remove_mcp_server(&root, &bot, &name))?;
			bot_owner(database, &bot.id).await?
		}
		Plugin::Owned { path, owner } => {
			bundled(plugin::remove_mcp_server(&path, &name))?;
			owner
		}
	};
	environment::store::forget_server(&app, &owner, &name);
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_history<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	match laid_down(&app, &scope) {
		None => Ok(Vec::new()),
		Some(target) => history_of(&target),
	}
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_history_diff<R: Runtime>(
	app: AppHandle<R>,
	scope: PluginScope,
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotChangedFile>, TranscriptStoreError> {
	let files = match writable(&app, &scope)? {
		Plugin::Bot { root, id } => {
			bundles::changed_files(&root, &id, &oldest_commit_id, &newest_commit_id)
		}
		Plugin::Owned { path, .. } => {
			plugin::changed_files(&path, &oldest_commit_id, &newest_commit_id)
		}
	};
	recounted(files).map(|files| files.into_iter().map(BotChangedFile::from).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn plugin_revert<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	scope: PluginScope,
	oldest_commit_id: String,
	newest_commit_id: String,
) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
	let target = writable(&app, &scope)?;
	match &target {
		Plugin::Bot { root, id } => {
			let database = ready(&state)?;
			unreverted(bundles::revert(root, id, &oldest_commit_id, &newest_commit_id))?;
			store_the_restored_memory(database, root, id).await?;
		}
		Plugin::Owned { path, .. } => {
			unreverted(plugin::revert(path, &oldest_commit_id, &newest_commit_id))?;
		}
	}
	history_of(&target)
}

fn unreverted(reverted: Result<String, git2::Error>) -> Result<String, TranscriptStoreError> {
	reverted.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })
}

async fn store_the_restored_memory(
	database: &db::Database,
	root: &Path,
	bot_id: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(restored) = bundles::generated(root, bot_id) else {
		return Ok(());
	};
	database.conversations().adopt_memory(bot_id.to_owned(), restored.memory).await?;
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::*;
	use crate::agent::contract::RuntimeScope;
	use crate::agent::host::Host as _;
	use crate::bundles::host::BundleHost;
	use crate::conversations::contract::Bot;
	use crate::db::repositories::conversations::BotIdentity;
	use crate::db::DatabaseError;
	use crate::environment::contract::EnvScope;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Manager};

	fn a_bare_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("plugin-commands-{name}"), mock_builder());
		app
	}

	fn a_host(name: &str) -> AppOfItsOwn {
		let app = a_bare_host(name);
		app.manage(db::bootstrap(app.handle()));
		app
	}

	fn a_host_without_a_database(name: &str) -> AppOfItsOwn {
		let app = a_bare_host(name);
		app.manage::<db::DatabaseState>(Err(DatabaseError::AppDataDir));
		app
	}

	fn database(app: &App<MockRuntime>) -> &db::Database {
		app.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
	}

	async fn a_bot_in_a_space(app: &App<MockRuntime>) -> (String, String) {
		let database = database(app);
		let space = database.spaces().create("Vocca".to_owned()).await.expect("the space lands");
		let identity = BotIdentity {
			name: "Bean".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: "Answer briefly.".to_owned(),
			denied_tools: Vec::new(),
			effort: None,
		};
		let bot = database
			.conversations()
			.create_bot(identity, Some(space.id.clone()), None)
			.await
			.expect("the bot lands");
		let root = bundles::root(app.handle()).expect("the bundles have a home");
		bundles::write(&root, &bot).expect("the bundle is written");
		(bot.id, space.id)
	}

	fn a_space_laid_down(app: &App<MockRuntime>, space_id: &str) {
		bundles::space::lay_down(app.handle(), space_id).expect("the space plugin is laid down");
	}

	fn the_person_laid_down(app: &App<MockRuntime>) {
		let path = bundles::user::path(app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&path).expect("the person plugin is laid down");
	}

	fn a_clock() -> serde_json::Value {
		serde_json::json!({ "command": "clock" })
	}

	fn bot(id: &str) -> PluginScope {
		PluginScope::Bot { id: id.to_owned() }
	}

	fn space(id: &str) -> PluginScope {
		PluginScope::Space { id: id.to_owned() }
	}

	async fn reads_empty(app: &App<MockRuntime>, scope: PluginScope) {
		let handle = app.handle().clone();
		let skills = plugin_skills(handle.clone(), scope.clone()).await.expect("the skills read");
		let servers =
			plugin_mcp_servers(handle.clone(), scope.clone()).await.expect("the servers read");
		let history = plugin_history(handle, scope).await.expect("the history reads");

		assert!(skills.is_empty(), "got {skills:?}");
		assert!(servers.is_empty(), "got {servers:?}");
		assert!(history.is_empty(), "got {history:?}");
	}

	async fn set_clock(app: &App<MockRuntime>, scope: &PluginScope) {
		plugin_set_mcp_server(
			app.handle().clone(),
			app.state(),
			scope.clone(),
			"clock".to_owned(),
			a_clock().into(),
			None,
		)
		.await
		.expect("the server lands");
	}

	async fn forgets_the_clock_of(app: &App<MockRuntime>, scope: PluginScope, owner: EnvOwner) {
		let root = environment::store::root(app.handle()).expect("the store has a home");
		let server = EnvScope::Server { name: "clock".to_owned(), owner };
		set_clock(app, &scope).await;
		environment::store::set(&root, &server, "REGION", "eu").expect("the value is written");

		plugin_delete_mcp_server(
			app.handle().clone(),
			app.state(),
			scope.clone(),
			"clock".to_owned(),
		)
		.await
		.expect("the server is removed");

		let listed =
			plugin_mcp_servers(app.handle().clone(), scope).await.expect("the servers read");
		assert!(listed.is_empty(), "got {listed:?}");
		assert!(environment::store::values(&root, &server).expect("the store reads").is_empty());
	}

	#[tokio::test]
	async fn a_bot_without_a_bundle_reads_empty() {
		let app = a_host("bot-empty");

		reads_empty(&app, bot("b-absent")).await;
	}

	#[tokio::test]
	async fn a_space_whose_plugin_was_never_laid_down_reads_empty() {
		let app = a_host_without_a_database("space-empty");

		reads_empty(&app, space("s-absent")).await;
	}

	#[tokio::test]
	async fn a_person_whose_plugin_was_never_laid_down_reads_empty() {
		let app = a_host_without_a_database("user-empty");

		reads_empty(&app, PluginScope::User).await;
	}

	#[tokio::test]
	async fn a_server_deleted_from_a_bot_forgets_the_environment_of_that_bot_in_its_space() {
		let app = a_host("bot-forget");
		let (bot_id, space_id) = a_bot_in_a_space(&app).await;

		forgets_the_clock_of(&app, bot(&bot_id), EnvOwner::Bot { id: bot_id.clone(), space_id })
			.await;
	}

	#[tokio::test]
	async fn a_server_deleted_from_a_space_forgets_the_environment_of_that_space() {
		let app = a_host_without_a_database("space-forget");
		a_space_laid_down(&app, "s1");

		forgets_the_clock_of(&app, space("s1"), EnvOwner::Space { id: "s1".to_owned() }).await;
	}

	#[tokio::test]
	async fn a_server_deleted_from_the_person_forgets_the_environment_of_the_person() {
		let app = a_host_without_a_database("user-forget");
		the_person_laid_down(&app);

		forgets_the_clock_of(&app, PluginScope::User, EnvOwner::User).await;
	}

	#[tokio::test]
	async fn deleting_a_server_the_person_never_declared_is_refused_and_forgets_nothing() {
		let app = a_host_without_a_database("user-undeclared");
		the_person_laid_down(&app);
		let root = environment::store::root(app.handle()).expect("the store has a home");
		let server = EnvScope::Server { name: "clock".to_owned(), owner: EnvOwner::User };
		environment::store::set(&root, &server, "REGION", "eu").expect("the value is written");

		let refused = plugin_delete_mcp_server(
			app.handle().clone(),
			app.state(),
			PluginScope::User,
			"clock".to_owned(),
		)
		.await;

		assert!(matches!(refused, Err(TranscriptStoreError::UnwritableBundle { .. })));
		let held = environment::store::values(&root, &server).expect("the store reads");
		assert_eq!(held.get("REGION").map(String::as_str), Some("eu"));
	}

	#[tokio::test]
	async fn a_configuration_that_is_not_an_object_is_refused_and_the_file_stands() {
		let app = a_host_without_a_database("user-not-an-object");
		the_person_laid_down(&app);
		set_clock(&app, &PluginScope::User).await;
		let path = bundles::user::laid_down(app.handle()).expect("the plugin is laid down");
		let held = fs::read_to_string(path.join(".mcp.json")).expect("the file reads");

		let refused = plugin_set_mcp_server(
			app.handle().clone(),
			app.state(),
			PluginScope::User,
			"broken".to_owned(),
			serde_json::json!(["clock"]).into(),
			None,
		)
		.await;

		assert!(matches!(refused, Err(TranscriptStoreError::UnwritableBundle { .. })));
		assert_eq!(fs::read_to_string(path.join(".mcp.json")).expect("the file reads"), held);
	}

	#[tokio::test]
	async fn a_write_on_a_plugin_that_was_never_laid_down_names_what_is_missing() {
		let app = a_host_without_a_database("never-laid-write");

		let on_space = plugin_skill_file(
			app.handle().clone(),
			space("s-absent"),
			"about-this-space".to_owned(),
			"SKILL.md".to_owned(),
		)
		.await;
		let on_person = plugin_delete_skill(
			app.handle().clone(),
			app.state(),
			PluginScope::User,
			"about-me".to_owned(),
		)
		.await;

		assert_eq!(
			on_space,
			Err(TranscriptStoreError::UnwritableBundle {
				detail: "the space's plugin has not been laid down yet".to_owned()
			})
		);
		assert_eq!(
			on_person,
			Err(TranscriptStoreError::UnwritableBundle {
				detail: "the person's own plugin has not been laid down yet".to_owned()
			})
		);
	}

	#[tokio::test]
	async fn a_bot_write_reads_the_bot_from_the_database() {
		let app = a_host_without_a_database("bot-needs-database");

		let refused = plugin_set_mcp_server(
			app.handle().clone(),
			app.state(),
			bot("b1"),
			"clock".to_owned(),
			a_clock().into(),
			None,
		)
		.await;

		assert!(
			matches!(refused, Err(TranscriptStoreError::Unavailable { .. })),
			"got {refused:?}"
		);
	}

	#[tokio::test]
	async fn a_bot_skill_write_that_names_a_system_skill_is_refused_and_writes_nothing() {
		let app = a_host("bot-system-skill");
		let (bot_id, _) = a_bot_in_a_space(&app).await;
		let root = bundles::root(app.handle()).expect("the bundles have a home");
		let marked = bundles::dir(&root, &bot_id)
			.expect("the bundle is held")
			.join("skills")
			.join("remembering");
		fs::create_dir_all(&marked).expect("the skill directory is made");
		let held =
			"---\nname: remembering\nmetadata:\n  kiroshi:\n    system: true\n---\n\nOld rules.\n";
		fs::write(marked.join("SKILL.md"), held).expect("the marked skill lands");

		let refused = plugin_write_skill_file(
			app.handle().clone(),
			bot(&bot_id),
			"remembering".to_owned(),
			"SKILL.md".to_owned(),
			"New rules.".to_owned(),
		)
		.await;

		assert_eq!(
			refused.map(|skill| skill.id),
			Err(TranscriptStoreError::SystemSkill { id: "remembering".to_owned() })
		);
		assert_eq!(fs::read_to_string(marked.join("SKILL.md")).expect("the skill reads"), held);
	}

	const THE_AGENT: &str = "agents/agent.md";

	async fn a_learned_write(app: &App<MockRuntime>, bot_id: &str, memory: &str) -> String {
		let session = BundleHost::new(
			app.handle().clone(),
			RuntimeScope {
				conversation_id: "c1".to_owned(),
				bot_id: bot_id.to_owned(),
				runtime_session_id: "r1".to_owned(),
				epoch: 0,
			},
		);
		let answer = session
			.answer(serde_json::json!({
				"subtype": "bundle",
				"operation": "write",
				"payload": { "path": THE_AGENT, "text": memory, "title": "Learned the day", "summary": "They said so." },
			}))
			.await
			.expect("the write is served");
		answer["commitId"].as_str().expect("a commit id is answered").to_owned()
	}

	async fn stored(app: &App<MockRuntime>, bot_id: &str) -> StoredBot {
		database(app)
			.conversations()
			.bot(bot_id.to_owned())
			.await
			.expect("the bot reads")
			.expect("the bot is there")
	}

	fn agent_bytes(root: &Path, bot_id: &str) -> Vec<u8> {
		fs::read(bundles::agent_file(root, bot_id).expect("the agent file is there"))
			.expect("the agent file reads")
	}

	async fn undoing(
		app: &App<MockRuntime>,
		bot_id: &str,
		commit_id: &str,
	) -> Result<Vec<BotHistoryEntry>, TranscriptStoreError> {
		plugin_revert(
			app.handle().clone(),
			app.state::<db::DatabaseState>(),
			bot(bot_id),
			commit_id.to_owned(),
			commit_id.to_owned(),
		)
		.await
	}

	#[tokio::test]
	async fn undoing_the_learned_block_s_creation_holds_across_the_next_session_start() {
		let app = a_host("undo-learned-block");
		let (bot_id, _) = a_bot_in_a_space(&app).await;
		let root = bundles::root(app.handle()).expect("the bundles have a home");
		let created = a_learned_write(&app, &bot_id, "They bake on Sundays.").await;
		assert_eq!(stored(&app, &bot_id).await.memory, "They bake on Sundays.");

		undoing(&app, &bot_id, &created).await.expect("the undo lands");
		let undone_agent = agent_bytes(&root, &bot_id);
		let commits = bundles::history(&root, &bot_id).expect("the history reads").len();
		let after_undo = stored(&app, &bot_id).await;
		assert_eq!(after_undo.memory, "");

		bundles::ensure(&root, &after_undo).expect("the session start lays the bundle down");

		assert_eq!(agent_bytes(&root, &bot_id), undone_agent);
		assert_eq!(bundles::history(&root, &bot_id).expect("the history reads").len(), commits);
		let read = Bot::of(stored(&app, &bot_id).await, None, Some(&root));
		assert_eq!(read.memory, "");
	}

	#[tokio::test]
	async fn undoing_a_later_learned_write_stores_the_memory_the_restored_block_holds() {
		let app = a_host("undo-later-learned-block");
		let (bot_id, _) = a_bot_in_a_space(&app).await;
		let root = bundles::root(app.handle()).expect("the bundles have a home");
		a_learned_write(&app, &bot_id, "They bake on Sundays.").await;
		let moved = a_learned_write(&app, &bot_id, "They bake on Saturdays.").await;

		undoing(&app, &bot_id, &moved).await.expect("the undo lands");

		let after_undo = stored(&app, &bot_id).await;
		assert_eq!(after_undo.memory, "They bake on Sundays.");
		assert_eq!(Bot::of(after_undo, None, Some(&root)).memory, "They bake on Sundays.");
	}

	#[tokio::test]
	async fn an_undo_whose_memory_cannot_be_stored_answers_that_failure() {
		let app = a_host("undo-unstored-memory");
		let (bot_id, _) = a_bot_in_a_space(&app).await;
		let created = a_learned_write(&app, &bot_id, "They bake on Sundays.").await;
		database(&app).conversations().delete_bot(bot_id.clone()).await.expect("the row goes");

		let refused = undoing(&app, &bot_id, &created).await;

		assert_eq!(refused.map(|_| ()), Err(TranscriptStoreError::UnknownBot { id: bot_id }));
	}
}
