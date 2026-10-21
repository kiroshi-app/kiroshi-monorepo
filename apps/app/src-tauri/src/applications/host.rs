use std::sync::Arc;

use serde::Deserialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime};

use super::contract::{
	Application, ApplicationCallError, ApplicationInstall, ApplicationInstalled, ApplicationSearch,
	ApplicationState, ApplicationsError, Destination, Install, InstallCase, InstallDraft,
	InstallOutcome,
};
use super::directory::Directory;
use super::runnable::{refusal, Runners};
use super::search::terms;
use crate::account::cloud::api_url;
use crate::agent::host::{Host, Refusal};
use crate::bundles::ApplicationMark;
use crate::conversations::commands::ready;
use crate::conversations::contract::McpServer;
use crate::environment::contract::EnvOwner;
use crate::events::{self, APPLICATION_INSTALLED};
use crate::mcp_oauth::commands::application_rows;
use crate::plugins::commands::{plugin_mcp_servers, plugin_set_mcp_server};

const OFFERS: usize = 9;

#[derive(Debug)]
pub struct ApplicationHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
	runners: Runners,
	directory: Arc<Directory>,
}

fn held_directory<R: Runtime>(app: &AppHandle<R>) -> Arc<Directory> {
	match app.try_state::<Arc<Directory>>() {
		Some(state) => state.inner().clone(),
		None => Directory::at(api_url(), None),
	}
}

impl<R: Runtime> ApplicationHost<R> {
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		let directory = held_directory(&app);
		Self { app, conversation_id, bot_id, runners: Runners::default(), directory }
	}

	async fn search(&self, query: &str) -> Result<ApplicationSearch, ApplicationCallError> {
		let answered = match self.directory.searched(query).await {
			Ok(answered) => answered,
			Err(failure) => return Ok(unanswered(failure)),
		};
		let curated = self.directory.curated().await?;
		let found =
			offered(answered.applications.into_iter().filter(|held| !curated.contains(held)));
		Ok(ApplicationSearch {
			applications: matching(curated, query).into_iter().chain(found).collect(),
			registry_failure: answered.registry_failure,
			read_at: None,
			is_stale: None,
		})
	}

	async fn install(&self, asked: Named) -> Result<InstallOutcome, ApplicationCallError> {
		let scope = destination(&asked.scope)?;
		let owner = self.owner(scope).await?;
		if self.declared(&owner).await?.iter().any(|server| server.name == asked.application) {
			return Ok(InstallOutcome::AlreadyInstalled { application: asked.application, scope });
		}
		let application = self.application(&asked.application).await?;
		let install = InstallCase::try_from(application.install.clone()).map_err(|refusal| {
			ApplicationCallError::ApplicationRefused {
				application: application.name.clone(),
				reason: refusal.reason,
			}
		})?;
		if let Some(refused) = refusal(&self.runners, &application.config).await {
			return Err(ApplicationCallError::ApplicationRefused {
				application: application.name,
				reason: refused.reason,
			});
		}
		self.declare(&owner, &application).await?;
		let draft = InstallDraft {
			conversation_id: self.conversation_id.clone(),
			application: application.name.clone(),
			title: application.title.clone(),
			logo: application.logo.clone(),
			logo_url: application.logo_url.clone(),
			description: Some(application.description.clone())
				.filter(|description| !description.is_empty()),
			scope,
			destination_id: destination_id(&owner),
			install: install.clone(),
		};
		self.announce(self.recorded(draft).await)?;
		Ok(InstallOutcome::Installed { application: application.name, scope, install })
	}

	async fn recorded(&self, draft: InstallDraft) -> ApplicationInstalled {
		match self.record(draft.clone()).await {
			Ok(recorded) => recorded.into(),
			Err(failure) => {
				eprintln!(
					"the install of {} in this conversation was not recorded: {failure:?}",
					draft.application
				);
				draft.into()
			}
		}
	}

	async fn record(
		&self,
		draft: InstallDraft,
	) -> Result<ApplicationInstall, ApplicationCallError> {
		let state = Self::database(&self.app)?;
		Ok(ready(&state)?.application_installs().record(draft).await?)
	}

	async fn status(&self, asked: Named) -> Result<ApplicationState, ApplicationCallError> {
		let owner = self.owner(destination(&asked.scope)?).await?;
		let rows = application_rows(self.app.clone(), owner).await?;
		Ok(rows
			.into_iter()
			.find(|row| row.name == asked.application)
			.map_or(ApplicationState::NotInstalled, |row| row.status.into()))
	}

	async fn application(&self, name: &str) -> Result<Application, ApplicationCallError> {
		self.directory.named(name).await?.ok_or_else(|| ApplicationCallError::UnknownApplication {
			application: name.to_owned(),
		})
	}

	async fn owner(&self, scope: Destination) -> Result<EnvOwner, ApplicationCallError> {
		match scope {
			Destination::User => Ok(EnvOwner::User),
			Destination::Space => Ok(EnvOwner::Space { id: self.space().await? }),
			Destination::Companion => {
				Ok(EnvOwner::Bot { id: self.bot_id.clone(), space_id: self.space().await? })
			}
		}
	}

	async fn declared(&self, owner: &EnvOwner) -> Result<Vec<McpServer>, ApplicationCallError> {
		Ok(plugin_mcp_servers(self.app.clone(), owner.into()).await?)
	}

	async fn declare(
		&self,
		owner: &EnvOwner,
		application: &Application,
	) -> Result<McpServer, ApplicationCallError> {
		let name = application.name.clone();
		let config = application.config.clone();
		let mark = Some(mark_of(application));
		Ok(plugin_set_mcp_server(
			self.app.clone(),
			Self::database(&self.app)?,
			owner.into(),
			name,
			config.into(),
			mark,
		)
		.await?)
	}

	async fn space(&self) -> Result<String, ApplicationCallError> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)?;
		database.conversations().space(self.conversation_id.clone()).await?.ok_or_else(|| {
			ApplicationCallError::ConversationWithoutSpace {
				conversation_id: self.conversation_id.clone(),
			}
		})
	}

	fn announce(&self, installed: ApplicationInstalled) -> Result<(), ApplicationCallError> {
		events::emit(&self.app, APPLICATION_INSTALLED, installed)
			.map_err(|error| ApplicationCallError::Undeliverable { detail: error.to_string() })
	}
}

impl<R: Runtime> Host for ApplicationHost<R> {
	const SUBTYPE: &'static str = "application";

	const IS_PAYLOAD_REQUIRED: bool = true;

	type Operation = Operation;

	type Error = ApplicationCallError;

	async fn served(
		&self,
		operation: Operation,
		payload: Value,
	) -> Result<Value, ApplicationCallError> {
		match operation {
			Operation::Search => {
				let asked: Searched = Self::read(payload)?;
				Self::answered(self.search(&asked.query).await?)
			}
			Operation::Install => {
				let asked: Named = Self::read(payload)?;
				Self::answered(self.install(asked).await?)
			}
			Operation::Status => {
				let asked: Named = Self::read(payload)?;
				Self::answered(self.status(asked).await?)
			}
		}
	}
}

impl Refusal for ApplicationCallError {
	fn unreadable(detail: String) -> Self {
		Self::UnreadableRequest { detail }
	}

	fn unexpected(detail: String) -> Self {
		Self::Unexpected { detail }
	}
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	Search,
	Install,
	Status,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Searched {
	query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Named {
	application: String,
	scope: String,
}

fn destination(scope: &str) -> Result<Destination, ApplicationCallError> {
	match scope {
		"companion" => Ok(Destination::Companion),
		"space" => Ok(Destination::Space),
		"user" => Ok(Destination::User),
		unknown => Err(ApplicationCallError::UnknownScope { scope: unknown.to_owned() }),
	}
}

fn destination_id(owner: &EnvOwner) -> Option<String> {
	match owner {
		EnvOwner::Bot { id, .. } | EnvOwner::Space { id } => Some(id.clone()),
		EnvOwner::User => None,
	}
}

fn mark_of(application: &Application) -> ApplicationMark {
	ApplicationMark {
		title: Some(application.title.clone()),
		logo: application.logo.clone(),
		logo_url: application.logo_url.clone(),
	}
}

fn unanswered(failure: ApplicationsError) -> ApplicationSearch {
	ApplicationSearch {
		applications: Vec::new(),
		registry_failure: Some(failure),
		read_at: None,
		is_stale: None,
	}
}

fn offered(found: impl Iterator<Item = Application>) -> Vec<Application> {
	found.filter(installable).take(OFFERS).collect()
}

fn installable(application: &Application) -> bool {
	!matches!(application.install, Install::Refused(_))
}

fn matching(curated: Vec<Application>, query: &str) -> Vec<Application> {
	let terms = terms(query);
	curated.into_iter().filter(|held| terms.iter().all(|term| answers_to(held, term))).collect()
}

fn answers_to(application: &Application, term: &str) -> bool {
	[&application.name, &application.title, &application.description]
		.iter()
		.any(|read| read.to_lowercase().contains(term))
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;
	use std::sync::mpsc;
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener as _};

	use super::*;
	use crate::agent::translate::now_ms;
	use crate::applications::contract::ApplicationInstall;
	use crate::applications::directory::tests::{self as directory_stub, a_page, a_row, carrying};
	use crate::applications::runnable::tests::a_path_carrying;
	use crate::applications::runnable::{NPX, UVX};
	use crate::bundles;
	use crate::db;
	use crate::mcp_oauth::asking::AuthorizationAnswers;
	use crate::mcp_oauth::commands::McpOauthState;
	use crate::mcp_oauth::reports::{ApplicationReports, Standing};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const A_SPACE: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'main', 'personal', 'Chat', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('nowhere', 'main', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('nowhere', 'b1', 'assistant', 1, 0);
	";

	const SCOPES: [&str; 3] = ["companion", "space", "user"];

	const PATIENCE: Duration = Duration::from_secs(60);

	const NO_PACKAGE_REGISTRY: &str = "http://127.0.0.1:1";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("application-host-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app.manage(McpOauthState::default());
		app.manage(ApplicationReports::default());
		app.manage(AuthorizationAnswers::default());
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_SPACE)?))
			.await
			.expect("the space is planted");
		bundles::space::lay_down(app.handle(), "personal").expect("the space plugin lands");
		bundles::user::lay_down(&user_plugin(&app)).expect("the person plugin lands");
		let bot = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.conversations()
			.bot("b1".to_owned())
			.await
			.expect("the bot reads")
			.expect("the bot is planted");
		let root = bundles::root(app.handle()).expect("the bundles have a root");
		bundles::lay_down(&root, &bot).expect("the bot bundle lands");
		app
	}

	fn user_plugin(app: &App<MockRuntime>) -> PathBuf {
		bundles::user::path(app.handle()).expect("the person plugin has a home")
	}

	fn space_plugin(app: &App<MockRuntime>) -> PathBuf {
		bundles::space::path(app.handle(), "personal").expect("the space plugin has a home")
	}

	fn reading(app: &App<MockRuntime>, conversation_id: &str) -> ApplicationHost<MockRuntime> {
		holding(app, conversation_id, the_catalogue().into_iter().chain(the_others()).collect())
	}

	fn holding(
		app: &App<MockRuntime>,
		conversation_id: &str,
		rows: Vec<Value>,
	) -> ApplicationHost<MockRuntime> {
		ApplicationHost {
			app: app.handle().clone(),
			conversation_id: conversation_id.to_owned(),
			bot_id: "b1".to_owned(),
			runners: runners_carrying(app, &[NPX, UVX]),
			directory: directory_stub::holding(rows),
		}
	}

	fn the_catalogue() -> Vec<Value> {
		vec![
			carrying(
				a_row("superset", "curated", 1),
				json!({
					"display_name": "Superset",
					"one_liner": "Run workspaces, terminals, agents and tasks.",
					"config": {
						"type": "http",
						"url": "https://api.superset.sh/mcp",
						"headers": { "Authorization": "Bearer ${SUPERSET_API_KEY}" },
					},
					"remote": {
						"auth_posture": "auth_required",
						"required_fields": [{ "field": "SUPERSET_API_KEY", "source_url": null }],
					},
				}),
			),
			carrying(
				a_row("paper", "curated", 2),
				json!({
					"display_name": "Paper",
					"one_liner": "Read and write designs in the Paper desktop app.",
					"config": { "type": "http", "url": "http://127.0.0.1:29979/mcp" },
					"remote": { "auth_posture": "no_auth", "required_fields": [] },
				}),
			),
		]
	}

	fn the_others() -> Vec<Value> {
		vec![
			carrying(
				a_row("com.notion/mcp", "partner", 1),
				json!({ "config": { "type": "http", "url": "https://mcp.notion.test/mcp" } }),
			),
			carrying(
				a_row("io.github.Digital-Defiance/mcp-filesystem", "partner", 1),
				json!({
					"type": "local",
					"remote": null,
					"local": { "packages": [{ "environment_variables": [] }] },
					"config": {
						"type": "stdio",
						"command": "npx",
						"args": ["-y", "@digital-defiance/mcp-filesystem"],
						"env": { "ALLOWED_ROOT": "/srv/data" },
					},
				}),
			),
			a_collapsed_row("io.test/collapsed"),
		]
	}

	fn a_collapsed_row(name: &str) -> Value {
		carrying(
			a_row(name, "partner", 2),
			json!({
				"config": {
					"type": "http",
					"url": "https://collapsed.test/mcp",
					"headers": { "api-key": "${API_KEY}" },
				},
				"remote": {
					"auth_posture": "auth_required",
					"required_fields": [
						{ "field": "api-key", "source_url": null },
						{ "field": "api_key", "source_url": null },
					],
				},
			}),
		)
	}

	fn runners_carrying(app: &App<MockRuntime>, commands: &[&str]) -> Runners {
		let home = app.path().app_data_dir().expect("the data folder resolves");
		Runners {
			path: a_path_carrying(&home, commands),
			npm: NO_PACKAGE_REGISTRY.to_owned(),
			pypi: NO_PACKAGE_REGISTRY.to_owned(),
		}
	}

	fn asking(operation: &str, payload: Value) -> Value {
		json!({ "subtype": "application", "operation": operation, "payload": payload })
	}

	fn an_install(application: &str, scope: &str) -> Value {
		asking("install", json!({ "application": application, "scope": scope }))
	}

	fn a_status(application: &str, scope: &str) -> Value {
		asking("status", json!({ "application": application, "scope": scope }))
	}

	fn names(answer: &Value) -> Vec<&str> {
		answer["applications"]
			.as_array()
			.expect("the search lists applications")
			.iter()
			.map(|held| held["name"].as_str().expect("an application is named"))
			.collect()
	}

	fn declarations(app: &App<MockRuntime>) -> [Vec<(String, Value)>; 3] {
		let root = bundles::root(app.handle()).expect("the bundles have a root");
		[
			bundles::mcp_servers(&root, "b1"),
			bundles::plugin::mcp_servers(&space_plugin(app)),
			bundles::plugin::mcp_servers(&user_plugin(app)),
		]
		.map(|servers| servers.into_iter().map(|server| (server.name, server.config)).collect())
	}

	fn marks(app: &App<MockRuntime>) -> [Vec<(String, ApplicationMark)>; 3] {
		let root = bundles::root(app.handle()).expect("the bundles have a root");
		[
			bundles::mcp_servers(&root, "b1"),
			bundles::plugin::mcp_servers(&space_plugin(app)),
			bundles::plugin::mcp_servers(&user_plugin(app)),
		]
		.map(|servers| servers.into_iter().map(|server| (server.name, server.mark)).collect())
	}

	fn curated(name: &str) -> Application {
		directory_stub::applications(the_catalogue())
			.into_iter()
			.find(|held| held.name == name)
			.unwrap_or_else(|| panic!("{name} is curated"))
	}

	fn curated_mark(name: &str) -> ApplicationMark {
		mark_of(&curated(name))
	}

	fn curated_logo_url(name: &str) -> Option<String> {
		curated(name).logo_url
	}

	fn curated_config(name: &str) -> Value {
		curated(name).config
	}

	fn heard(app: &App<MockRuntime>) -> mpsc::Receiver<String> {
		let (announced, arriving) = mpsc::channel();
		app.listen(APPLICATION_INSTALLED.name(), move |event| {
			announced.send(event.payload().to_owned()).expect("the test is listening");
		});
		arriving
	}

	#[tokio::test]
	async fn a_search_answers_the_curated_matches_before_the_directory_ones() {
		let app = a_host("curated-first").await;

		let answer = a_host_reading(&app, &["superset-notes"])
			.answer(asking("search", json!({ "query": "superset" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer), ["superset", "superset-notes"]);
		assert_eq!(answer["applications"][0]["install"]["kind"], "key");
		assert_eq!(answer["applications"][0]["logoUrl"], json!(curated_logo_url("superset")));
		assert!(answer.get("registryFailure").is_none(), "got {answer}");
	}

	const A_DIRECTORY_PAGE: [&str; 12] = [
		"zinc-1", "zinc-2", "zinc-3", "zinc-4", "zinc-5", "zinc-6", "zinc-7", "zinc-8", "zinc-9",
		"zinc-10", "zinc-11", "zinc-12",
	];

	fn a_host_reading(app: &App<MockRuntime>, page: &[&str]) -> ApplicationHost<MockRuntime> {
		let page = a_page(page).as_array().cloned().expect("a page is a list");
		holding(app, "c1", the_catalogue().into_iter().chain(page).collect())
	}

	#[tokio::test]
	async fn a_search_answers_nine_directory_rows_at_most() {
		let app = a_host("bounded-directory").await;

		let answer = a_host_reading(&app, &A_DIRECTORY_PAGE)
			.answer(asking("search", json!({ "query": "zinc" })))
			.await
			.expect("the search answers");

		assert_eq!(
			names(&answer),
			[
				"zinc-1", "zinc-2", "zinc-3", "zinc-4", "zinc-5", "zinc-6", "zinc-7", "zinc-8",
				"zinc-9"
			]
		);
	}

	#[tokio::test]
	async fn a_curated_match_is_answered_beside_the_nine_directory_rows_and_is_not_cut() {
		let app = a_host("bounded-beside-curated").await;
		let page: Vec<String> = (1..=12).map(|held| format!("superset-{held}")).collect();
		let page: Vec<&str> = page.iter().map(String::as_str).collect();

		let answer = a_host_reading(&app, &page)
			.answer(asking("search", json!({ "query": "superset" })))
			.await
			.expect("the search answers");

		let answered = names(&answer);
		assert_eq!(answered.len(), 10, "got {answered:?}");
		assert_eq!(answered[0], "superset");
		assert_eq!(answered[1], "superset-1");
		assert_eq!(answered[9], "superset-9");
	}

	#[tokio::test]
	async fn a_remote_row_whose_install_is_refused_is_left_out_and_takes_none_of_the_nine() {
		let app = a_host("refused-row").await;
		let page = a_page(&A_DIRECTORY_PAGE).as_array().cloned().expect("a page is a list");
		let rows = std::iter::once(a_collapsed_row("zinc-collapsed")).chain(page).collect();

		let answer = holding(&app, "c1", rows)
			.answer(asking("search", json!({ "query": "zinc" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer).len(), 9, "got {answer}");
		assert!(!names(&answer).contains(&"zinc-collapsed"), "got {answer}");
	}

	#[tokio::test]
	async fn a_search_no_curated_application_matches_answers_the_directory_alone() {
		let app = a_host("directory-alone").await;

		let answer = reading(&app, "c1")
			.answer(asking("search", json!({ "query": "filesystem" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer), ["io.github.Digital-Defiance/mcp-filesystem"]);
	}

	#[tokio::test]
	async fn a_search_while_the_cloud_is_down_answers_the_cached_curated_matches_and_the_failure() {
		let app = a_host("cloud-down").await;
		let (file, _cache_dir) = directory_stub::a_cache_file_read_long_ago(the_catalogue()).await;
		let directory = Directory::at(directory_stub::unreached().await, Some(file));
		let host = ApplicationHost { directory: directory.clone(), ..reading(&app, "c1") };

		let refreshing = host
			.answer(asking("search", json!({ "query": "superset" })))
			.await
			.expect("the search answers");
		directory_stub::settled(&directory).await;
		let answer = host
			.answer(asking("search", json!({ "query": "superset" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&refreshing), ["superset"]);
		assert_eq!(refreshing["registryFailure"], Value::Null);
		assert_eq!(names(&answer), ["superset"]);
		assert_eq!(answer["registryFailure"]["kind"], "registryUnreached");
	}

	#[tokio::test]
	async fn a_search_while_the_cloud_is_down_and_nothing_is_cached_answers_only_the_failure() {
		let app = a_host("cloud-down-uncached").await;
		let host = ApplicationHost {
			directory: Directory::at(directory_stub::unreached().await, None),
			..reading(&app, "c1")
		};

		let answer = host
			.answer(asking("search", json!({ "query": "superset" })))
			.await
			.expect("the search answers");

		assert_eq!(names(&answer), Vec::<&str>::new());
		assert_eq!(answer["registryFailure"]["kind"], "registryUnreached");
	}

	#[tokio::test]
	async fn an_install_lands_in_the_mcp_json_of_its_scope_and_of_no_other() {
		for (at, scope) in SCOPES.iter().enumerate() {
			let app = a_host(&format!("lands-{scope}")).await;

			let answer = reading(&app, "c1")
				.answer(an_install("paper", scope))
				.await
				.expect("the install answers");

			assert_eq!(
				answer,
				json!({
					"outcome": "installed",
					"application": "paper",
					"scope": scope,
					"install": { "kind": "nothing" },
				})
			);
			for (held_at, declared) in declarations(&app).into_iter().enumerate() {
				let expected = if held_at == at {
					vec![("paper".to_owned(), curated_config("paper"))]
				} else {
					Vec::new()
				};
				assert_eq!(declared, expected, "installing in {scope}");
			}
		}
	}

	#[tokio::test]
	async fn an_install_keeps_the_mark_of_its_application_and_the_listing_answers_it_back() {
		for scope in SCOPES {
			let app = a_host(&format!("mark-{scope}")).await;

			reading(&app, "c1")
				.answer(an_install("paper", scope))
				.await
				.expect("the install answers");

			let kept: Vec<(String, ApplicationMark)> = marks(&app).into_iter().flatten().collect();

			assert_eq!(kept, [("paper".to_owned(), curated_mark("paper"))], "in {scope}");
		}
	}

	#[tokio::test]
	async fn a_key_install_answers_the_secret_still_needed_and_nothing_else_about_credentials() {
		let app = a_host("key").await;

		let answer = reading(&app, "c1")
			.answer(an_install("superset", "user"))
			.await
			.expect("the install answers");

		assert_eq!(answer["install"], json!({ "kind": "key", "secrets": ["SUPERSET_API_KEY"] }));
	}

	async fn recorded_in(app: &App<MockRuntime>, conversation_id: &str) -> Vec<ApplicationInstall> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.application_installs()
			.of_conversation(conversation_id.to_owned())
			.await
			.expect("the installs read")
	}

	fn without_moments(mut announced: Value) -> Value {
		let held = announced.as_object_mut().expect("the event is an object");
		held.remove("id");
		held.remove("createdAt");
		announced
	}

	#[tokio::test]
	async fn an_install_announces_the_row_it_wrote_and_the_conversation_it_came_from() {
		let app = a_host("announced").await;
		let arriving = heard(&app);
		let host = reading(&app, "c1");

		let mut announced = Vec::new();
		for scope in SCOPES {
			host.answer(an_install("superset", scope)).await.expect("the install answers");
			let payload = arriving.recv_timeout(PATIENCE).expect("the event is announced");
			announced.push(serde_json::from_str::<Value>(&payload).expect("the event is JSON"));
		}

		let expected = |scope: &str, destination: Value| {
			let mut held = json!({
				"conversationId": "c1",
				"application": "superset",
				"title": "Superset",
				"logoUrl": curated_logo_url("superset"),
				"description": curated("superset").description,
				"scope": scope,
				"install": { "kind": "key", "secrets": ["SUPERSET_API_KEY"] },
				"lastMessageSeq": 0,
			});
			if let Some(id) = destination.as_str() {
				held["destinationId"] = json!(id);
			}
			held
		};
		assert_eq!(
			announced.iter().cloned().map(without_moments).collect::<Vec<_>>(),
			[
				expected("companion", json!("b1")),
				expected("space", json!("personal")),
				expected("user", Value::Null),
			]
		);
		let mut announced_ids = announced
			.iter()
			.map(|event| event["id"].as_str().expect("the event names its row").to_owned())
			.collect::<Vec<_>>();
		announced_ids.sort();
		let mut recorded_ids =
			recorded_in(&app, "c1").await.into_iter().map(|held| held.id).collect::<Vec<_>>();
		recorded_ids.sort();
		assert_eq!(
			announced_ids, recorded_ids,
			"the announced rows are not the rows that were written"
		);
		for event in &announced {
			assert!(event["createdAt"].as_i64().is_some_and(|held| held > 0), "got {event}");
		}
	}

	#[tokio::test]
	async fn an_install_writes_one_row_carrying_the_application_the_destination_and_the_secret_name(
	) {
		let app = a_host("recorded").await;

		reading(&app, "c1")
			.answer(an_install("superset", "space"))
			.await
			.expect("the install answers");

		let recorded = recorded_in(&app, "c1").await;
		assert_eq!(recorded.len(), 1);
		let held = &recorded[0];
		assert_eq!(held.conversation_id, "c1");
		assert_eq!(held.application, "superset");
		assert_eq!(held.title, "Superset");
		assert_eq!(held.scope, Destination::Space);
		assert_eq!(held.destination_id.as_deref(), Some("personal"));
		assert_eq!(held.install, InstallCase::Key { secrets: vec!["SUPERSET_API_KEY".to_owned()] });
		assert_eq!(held.logo, None);
		assert_eq!(held.logo_url, curated_logo_url("superset"));
		assert_eq!(held.description.as_deref(), Some(curated("superset").description.as_str()));
		assert_eq!(held.last_message_seq, 0);
		assert!(held.created_at > 0, "the row holds no moment");
	}

	#[tokio::test]
	async fn a_directory_install_writes_its_readable_name_its_icon_url_and_its_description() {
		let app = a_host("recorded-directory").await;

		let host = a_host_reading(&app, &["zinc-1"]);

		host.answer(an_install("zinc-1", "user")).await.expect("the install answers");

		let recorded = recorded_in(&app, "c1").await;
		assert_eq!(recorded.len(), 1);
		let held = &recorded[0];
		assert_eq!(held.title, "zinc-1");
		assert_eq!(held.logo, None);
		assert_eq!(held.logo_url.as_deref(), Some("https://zinc-1.test/icon.png"));
		assert_eq!(held.description.as_deref(), Some("zinc-1 does things."));
	}

	#[tokio::test]
	async fn an_install_the_scope_already_declared_writes_no_row() {
		let app = a_host("kept-no-row").await;
		bundles::plugin::set_mcp_server(
			&space_plugin(&app),
			"superset",
			&json!({ "type": "http", "url": "https://mine.test/mcp" }),
			None,
		)
		.expect("the declaration lands");

		reading(&app, "c1")
			.answer(an_install("superset", "space"))
			.await
			.expect("the install answers");

		assert_eq!(recorded_in(&app, "c1").await, Vec::new());
	}

	#[tokio::test]
	async fn an_install_whose_row_cannot_be_written_still_answers_installed_and_names_no_row() {
		let app = a_host("unwritable-row").await;
		let arriving = heard(&app);

		let answer = reading(&app, "ghost")
			.answer(an_install("paper", "user"))
			.await
			.expect("the install answers");

		assert_eq!(answer["outcome"], "installed");
		let announced = serde_json::from_str::<Value>(
			&arriving.recv_timeout(PATIENCE).expect("the event is announced"),
		)
		.expect("the event is JSON");
		assert_eq!(announced.get("id"), None, "got {announced}");
		assert_eq!(announced.get("lastMessageSeq"), None, "got {announced}");
		assert_eq!(announced["conversationId"], "ghost");
		assert_eq!(announced["application"], "paper");
		assert_eq!(recorded_in(&app, "ghost").await, Vec::new());
	}

	#[tokio::test]
	async fn every_install_of_a_conversation_is_recorded_and_a_conversation_with_none_reads_empty()
	{
		let app = a_host("read-installs").await;
		let host = reading(&app, "c1");
		for application in ["paper", "superset"] {
			host.answer(an_install(application, "user")).await.expect("the install answers");
		}

		let mut read = recorded_in(&app, "c1")
			.await
			.into_iter()
			.map(|held| held.application)
			.collect::<Vec<_>>();
		read.sort();

		assert_eq!(read, ["paper", "superset"]);
		assert_eq!(recorded_in(&app, "nowhere").await, Vec::new());
	}

	async fn searched(app: &App<MockRuntime>, query: &str) -> Value {
		a_host_reading(app, &[])
			.answer(asking("search", json!({ "query": query })))
			.await
			.expect("the search answers")
	}

	#[tokio::test]
	async fn a_query_naming_what_an_application_does_answers_it_through_its_description() {
		let app = a_host("described").await;

		assert_eq!(names(&searched(&app, "designs").await), ["paper"]);
	}

	#[tokio::test]
	async fn a_query_answers_only_the_applications_matching_every_term_of_three_characters_or_more()
	{
		let app = a_host("every-term").await;

		assert_eq!(names(&searched(&app, "run workspaces").await), ["superset"]);
		assert_eq!(names(&searched(&app, "write designs").await), ["paper"]);
		assert_eq!(names(&searched(&app, "workspaces designs").await), Vec::<&str>::new());
	}

	#[tokio::test]
	async fn a_query_whose_every_term_is_discarded_answers_the_whole_catalogue() {
		let app = a_host("all-discarded").await;
		let everything: Vec<String> = directory_stub::applications(the_catalogue())
			.into_iter()
			.map(|held| held.name)
			.collect();

		assert_eq!(names(&searched(&app, "an my").await), everything);
		assert_eq!(names(&searched(&app, "").await), everything);
	}

	#[tokio::test]
	async fn a_directory_install_answers_the_install_of_its_row() {
		let app = a_host("directory-install").await;

		let answer = reading(&app, "c1")
			.answer(an_install("com.notion/mcp", "space"))
			.await
			.expect("the install answers");

		assert_eq!(answer["outcome"], "installed");
		assert_eq!(answer["install"], json!({ "kind": "oauth" }));
		assert_eq!(declarations(&app)[1][0].0, "com.notion/mcp");
	}

	#[tokio::test]
	async fn a_scope_already_declaring_the_server_keeps_the_config_it_had() {
		let app = a_host("kept").await;
		let mine = json!({ "type": "http", "url": "https://mine.test/mcp" });
		bundles::plugin::set_mcp_server(&space_plugin(&app), "superset", &mine, None)
			.expect("the declaration lands");
		let arriving = heard(&app);

		let answer = reading(&app, "c1")
			.answer(an_install("superset", "space"))
			.await
			.expect("the install answers");

		assert_eq!(
			answer,
			json!({ "outcome": "alreadyInstalled", "application": "superset", "scope": "space" })
		);
		assert_eq!(declarations(&app)[1], [("superset".to_owned(), mine)]);
		assert!(arriving.try_recv().is_err(), "nothing is announced");
	}

	#[tokio::test]
	async fn an_unknown_scope_is_refused_by_name_and_nothing_is_written() {
		let app = a_host("unknown-scope").await;

		let refusal = reading(&app, "c1")
			.answer(an_install("paper", "team"))
			.await
			.expect_err("the scope is refused");

		assert_eq!(refusal, json!({ "kind": "unknownScope", "scope": "team" }));
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
	}

	#[tokio::test]
	async fn an_application_the_directory_does_not_hold_is_refused() {
		let app = a_host("unknown-application").await;

		for scope in SCOPES {
			let refusal = reading(&app, "c1")
				.answer(an_install("io.test/nowhere", scope))
				.await
				.expect_err("the application is refused");

			assert_eq!(
				refusal,
				json!({ "kind": "unknownApplication", "application": "io.test/nowhere" })
			);
		}
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
	}

	#[tokio::test]
	async fn an_application_whose_install_refuses_it_is_named_and_neither_declared_nor_recorded() {
		let app = a_host("refusing-install").await;
		let arriving = heard(&app);

		let refusal = reading(&app, "c1")
			.answer(an_install("io.test/collapsed", "space"))
			.await
			.expect_err("the application is refused");

		assert_eq!(refusal["kind"], "applicationRefused");
		assert_eq!(refusal["application"], "io.test/collapsed");
		let reason = refusal["reason"].as_str().expect("the refusal carries a reason");
		assert!(reason.contains("api_key"), "got {reason}");
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
		assert!(recorded_in(&app, "c1").await.is_empty(), "an install was recorded");
		assert!(arriving.try_recv().is_err(), "it was announced");
	}

	#[tokio::test]
	async fn an_install_of_a_config_no_runner_of_this_machine_runs_is_refused_and_writes_nothing() {
		let app = a_host("no-runner").await;
		let arriving = heard(&app);
		let host =
			ApplicationHost { runners: runners_carrying(&app, &[UVX]), ..reading(&app, "c1") };

		let refusal = host
			.answer(an_install("io.github.Digital-Defiance/mcp-filesystem", "space"))
			.await
			.expect_err("the install is refused");

		assert_eq!(refusal["kind"], "applicationRefused");
		assert_eq!(refusal["application"], "io.github.Digital-Defiance/mcp-filesystem");
		let reason = refusal["reason"].as_str().expect("the refusal carries a reason");
		assert!(reason.contains(NPX), "got {reason}");
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
		assert!(recorded_in(&app, "c1").await.is_empty(), "an install was recorded");
		assert!(arriving.try_recv().is_err(), "it was announced");
	}

	#[tokio::test]
	async fn a_companion_or_space_install_from_a_conversation_in_no_space_is_refused() {
		let app = a_host("no-space").await;

		for scope in ["companion", "space"] {
			let refusal = reading(&app, "nowhere")
				.answer(an_install("paper", scope))
				.await
				.expect_err("the conversation is refused");

			assert_eq!(
				refusal,
				json!({ "kind": "conversationWithoutSpace", "conversationId": "nowhere" })
			);
		}
		assert_eq!(declarations(&app), [Vec::new(), Vec::new(), Vec::new()]);
	}

	#[tokio::test]
	async fn the_status_tells_apart_not_installed_connected_needs_authorization_and_failed() {
		let app = a_host("status").await;
		let host = reading(&app, "c1");
		for application in ["superset", "paper"] {
			host.answer(an_install(application, "companion")).await.expect("the install answers");
		}
		let from_the_directory =
			host.answer(an_install("com.notion/mcp", "user")).await.expect("the install answers");
		assert_eq!(from_the_directory["install"], json!({ "kind": "oauth" }));
		let reports = app.state::<ApplicationReports>();
		reports.record("b1", "superset", Standing::Holding);
		reports.record("b1", "paper", Standing::LeftOut { reason: Some("refused".to_owned()) });
		app.state::<AuthorizationAnswers>().answered("https://mcp.notion.test/mcp", true, now_ms());

		let host = &host;
		let read = move |application: &'static str, scope: &'static str| async move {
			host.answer(a_status(application, scope)).await.expect("the status reads")
		};

		assert_eq!(read("superset", "space").await, json!({ "status": "notInstalled" }));
		assert_eq!(read("superset", "companion").await, json!({ "status": "connected" }));
		assert_eq!(read("com.notion/mcp", "user").await, json!({ "status": "needsAuthorization" }));
		assert_eq!(
			read("paper", "companion").await,
			json!({ "status": "failed", "reason": "refused" })
		);
	}

	#[tokio::test]
	async fn a_status_in_an_unknown_scope_is_refused_by_name() {
		let app = a_host("status-unknown-scope").await;

		let refusal = reading(&app, "c1")
			.answer(a_status("superset", "team"))
			.await
			.expect_err("the scope is refused");

		assert_eq!(refusal, json!({ "kind": "unknownScope", "scope": "team" }));
	}
}
