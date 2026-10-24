use std::collections::HashSet;
use std::future::Future;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use tauri::{AppHandle, Manager, Runtime};
use tauri_plugin_opener::OpenerExt;

use super::asking::AuthorizationAnswers;
use super::contract::{Disconnected, OauthError};
use super::credentials::{self, ServedGrants};
use super::refresh::{self, Renewal, Renewals};
use super::refusal::{refusal_line, withheld_reason, Refused, Step};
use super::reports::{ApplicationReports, Standing};
use super::status::{reads_the_answer, status, ApplicationRow, Evidence};
use crate::agent::commands::AgentState;
use crate::agent::contract::TransportError;
use crate::agent::protocol::{
	AuthorizeRequest, Authorized, OauthCredentials, OauthFailureKind, RefreshRequest,
	RevocationRequest,
};
use crate::agent::sidecar::Opening;
use crate::agent::translate::now_ms;
use crate::bundles::{self, AuthorizationWithheld, McpServer};
use crate::environment::commands::writable_root;
use crate::environment::contract::{
	EnvError, EnvOwner, EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
	OAUTH_REDIRECT_URI, OAUTH_REFRESH_TOKEN,
};
use crate::environment::store;
use crate::hosting::authorship::Caller;

const NOTHING_STORED: &str = "no access token was stored for that server";

const NO_BUNDLES: &str = "the bundle directory is unavailable";

const OPENABLE_SCHEMES: [&str; 2] = ["http://", "https://"];

pub(crate) fn is_openable(url: &str) -> bool {
	let lowered = url.to_ascii_lowercase();
	OPENABLE_SCHEMES.iter().any(|scheme| lowered.starts_with(scheme))
}

enum Flow {
	Authorizing(EnvScope),
	Revoking,
}

#[derive(Default)]
pub struct McpOauthState {
	running: Mutex<Option<Flow>>,
}

impl McpOauthState {
	fn begin(&self, flow: Flow) -> Result<Running<'_>, OauthError> {
		let mut running = self.held();
		if running.is_some() {
			return Err(OauthError::AlreadyRunning);
		}
		*running = Some(flow);
		Ok(Running { state: self })
	}

	fn held(&self) -> MutexGuard<'_, Option<Flow>> {
		self.running.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn is_running(&self) -> bool {
		self.held().is_some()
	}

	fn is_authorizing(&self, scope: &EnvScope) -> bool {
		matches!(self.held().as_ref(), Some(Flow::Authorizing(held)) if held == scope)
	}
}

struct Running<'a> {
	state: &'a McpOauthState,
}

impl Drop for Running<'_> {
	fn drop(&mut self) {
		*self.state.held() = None;
	}
}

async fn connected<R: Runtime>(
	app: &AppHandle<R>,
	request: AuthorizeRequest,
	stored: &Values,
) -> Result<OauthCredentials, Refused> {
	let settled = settlement(app, &request).await?;
	let registers_anew = request.client_id.is_some() && calls_for_a_new_client(&settled);
	let refused = match grant_of(settled) {
		Err(refused) if registers_anew => refused,
		granted => return granted,
	};
	eprintln!("{}", refusal_line(&Step::HandingTheStoredClient.refused(refused.error), stored));
	let registering = AuthorizeRequest { url: request.url, ..AuthorizeRequest::default() };
	grant_of(settlement(app, &registering).await?)
}

fn calls_for_a_new_client(settled: &Authorized) -> bool {
	if settled.credentials.is_some() {
		return false;
	}
	settled.error.as_ref().is_none_or(|failure| match failure.kind {
		OauthFailureKind::Cancelled | OauthFailureKind::Busy => false,
		OauthFailureKind::Denied => failure.refuses_the_client(),
		OauthFailureKind::TimedOut | OauthFailureKind::Rejected | OauthFailureKind::Failed => true,
	})
}

fn authorize_request(url: String, stored: &Values) -> AuthorizeRequest {
	let (Some(client_id), Some(redirect_uri)) =
		(stored.get(OAUTH_CLIENT_ID), stored.get(OAUTH_REDIRECT_URI))
	else {
		return AuthorizeRequest { url, ..AuthorizeRequest::default() };
	};
	AuthorizeRequest {
		url,
		client_id: Some(client_id.clone()),
		client_secret: stored.get(OAUTH_CLIENT_SECRET).cloned(),
		redirect_uri: Some(redirect_uri.clone()),
	}
}

async fn settlement<R: Runtime>(
	app: &AppHandle<R>,
	request: &AuthorizeRequest,
) -> Result<Authorized, Refused> {
	let sidecar = app
		.state::<AgentState>()
		.sidecar()
		.await
		.map_err(|error| Step::ReachingTheSidecar.refused(error.into()))?;
	let mut flow = sidecar
		.begin_oauth(request)
		.map_err(|error| Step::StartingTheFlow.refused(error.into()))?;
	let opened = flow.opened().await.map_err(|error| Step::OpeningTheFlow.refused(error.into()))?;
	match opened {
		Opening::Settled(settled) => Ok(settled),
		Opening::Authorization(authorization) => {
			if !is_openable(&authorization) {
				return Err(
					Step::HandingTheUrl.refused(OauthError::RefusedUrl { url: authorization })
				);
			}
			if app.opener().open_url(authorization.clone(), None::<&str>).is_err() {
				return Err(Step::OpeningTheBrowser
					.refused(OauthError::BrowserRefused { url: authorization }));
			}
			flow.settled().await.map_err(|error| Step::SettlingTheFlow.refused(error.into()))
		}
	}
}

fn grant_of(settled: Authorized) -> Result<OauthCredentials, Refused> {
	match (settled.credentials, settled.error) {
		(Some(credentials), _) => Ok(credentials),
		(None, Some(failure)) => {
			Err(Step::AskingTheAuthorizationServer.refused(OauthError::from(failure)))
		}
		(None, None) => Err(Step::ReadingTheSettlement.refused(OauthError::Failed {
			detail: "the authorization flow settled with neither a grant nor a reason".to_owned(),
			step: None,
			status: None,
			body: None,
		})),
	}
}

fn written(refused: Refused, held: &Values) -> OauthError {
	eprintln!("{}", refusal_line(&refused, held));
	refused.error
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_connect<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<(), OauthError> {
	refuse_what_kiroshi_does_not_authorize(&app, &owner, &name, &url)
		.map_err(|refused| written(refused, &Values::new()))?;
	let state = app.state::<McpOauthState>();
	let scope = EnvScope::Server { name: name.clone(), owner };
	let _running = state
		.begin(Flow::Authorizing(scope.clone()))
		.map_err(|error| written(Step::ClaimingTheState.refused(error), &Values::new()))?;
	let root = writable_root(&app).map_err(|error| {
		written(Step::WritingTheStoreRoot.refused(error.into()), &Values::new())
	})?;
	let stored = store::values(&root, &scope).map_err(|error| {
		written(Step::ReadingTheStoredClient.refused(error.into()), &Values::new())
	})?;
	let credentials = connected(&app, authorize_request(url, &stored), &stored)
		.await
		.map_err(|refused| written(refused, &stored))?;
	kept(&root, &scope, &name, &credentials, &app.state::<ApplicationReports>()).map_err(|error| {
		written(Step::StoringTheGrant.refused(error), &credentials::held(&credentials))
	})
}

fn refuse_what_kiroshi_does_not_authorize<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
	name: &str,
	url: &str,
) -> Result<(), Refused> {
	let withheld = authorization_withheld(app, owner, name, url)
		.map_err(|error| Step::ReadingTheDeclaredServer.refused(error.into()))?;
	match withheld {
		Some(carries) => Err(Step::CheckingTheServer.refused(OauthError::NotAuthorizable {
			carries,
			detail: withheld_reason(carries).to_owned(),
		})),
		None => Ok(()),
	}
}

fn authorization_withheld<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
	name: &str,
	url: &str,
) -> Result<Option<AuthorizationWithheld>, EnvError> {
	let declared = declared_servers(app, owner)?.into_iter().find(|server| server.name == name);
	let asked = declared.unwrap_or_else(|| McpServer {
		name: name.to_owned(),
		config: serde_json::json!({ "url": url }),
		mark: bundles::ApplicationMark::default(),
	});
	Ok(asked.authorization_withheld())
}

fn kept(
	root: &Path,
	scope: &EnvScope,
	name: &str,
	grant: &OauthCredentials,
	reports: &ApplicationReports,
) -> Result<(), OauthError> {
	credentials::store(root, scope, grant)?;
	reports.forget(name);
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_cancel<R: Runtime>(app: AppHandle<R>) -> Result<(), OauthError> {
	if !app.state::<McpOauthState>().is_running() {
		return Ok(());
	}
	Ok(app.state::<AgentState>().sidecar().await?.cancel_oauth()?)
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_oauth_disconnect<R: Runtime>(
	app: AppHandle<R>,
	caller: Caller,
	owner: EnvOwner,
	name: String,
	url: String,
) -> Result<Disconnected, OauthError> {
	if caller.is_relayed() && held_at(&writable_root(&app)?, &owner, &name)?.is_personal() {
		return Err(OauthError::RefusedToAMember);
	}
	let state = app.state::<McpOauthState>();
	let _running = state.begin(Flow::Revoking)?;
	let settled = disconnected(&app, &owner, &name, &url).await;
	app.state::<ApplicationReports>().forget(&name);
	settled
}

async fn disconnected<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
	name: &str,
	url: &str,
) -> Result<Disconnected, OauthError> {
	let root = writable_root(app)?;
	let scope = held_at(&root, owner, name)?;
	let held = store::values(&root, &scope)?;
	let revocation = revoked(app, url, &held).await;
	credentials::forget(&root, &scope)?;
	Ok(revocation)
}

fn held_at(root: &Path, owner: &EnvOwner, name: &str) -> Result<EnvScope, EnvError> {
	let served = credentials::served(root, owner)?.remove(name);
	Ok(served.map_or_else(
		|| EnvScope::Server { name: name.to_owned(), owner: owner.clone() },
		|grant| grant.scope,
	))
}

#[tauri::command]
#[specta::specta]
pub async fn mcp_application_status<R: Runtime>(
	app: AppHandle<R>,
	caller: Caller,
	owner: EnvOwner,
) -> Result<Vec<ApplicationRow>, EnvError> {
	if !caller.is_relayed() {
		return application_rows(app, owner).await;
	}
	if owner == EnvOwner::User {
		return Ok(Vec::new());
	}
	let rows = application_rows(app, owner).await?;
	Ok(rows
		.into_iter()
		.filter(|row| !row.scope.as_ref().is_some_and(EnvScope::is_personal))
		.collect())
}

pub async fn application_rows<R: Runtime>(
	app: AppHandle<R>,
	owner: EnvOwner,
) -> Result<Vec<ApplicationRow>, EnvError> {
	let root = writable_root(&app)?;
	let servers = declared_servers(&app, &owner)?;
	let handle = app.clone();
	renewed_rows(
		&root,
		&owner,
		servers,
		&app.state::<McpOauthState>(),
		&app.state::<ApplicationReports>(),
		&app.state::<AuthorizationAnswers>(),
		move |request| {
			let handle = handle.clone();
			async move { refreshed(&handle, request).await }
		},
	)
	.await
}

pub(super) async fn refreshed<R: Runtime>(
	app: &AppHandle<R>,
	request: RefreshRequest,
) -> Result<Authorized, TransportError> {
	let agent = app.try_state::<AgentState>().ok_or(TransportError::NotStarted)?;
	agent.sidecar().await?.refresh_oauth(&request).await
}

async fn renewed_rows<F, Exchanged>(
	root: &Path,
	owner: &EnvOwner,
	servers: Vec<McpServer>,
	flows: &McpOauthState,
	reports: &ApplicationReports,
	answers: &AuthorizationAnswers,
	exchange: F,
) -> Result<Vec<ApplicationRow>, EnvError>
where
	F: Fn(RefreshRequest) -> Exchanged,
	Exchanged: Future<Output = Result<Authorized, TransportError>>,
{
	let renewals = refresh::before_reading(root, owner, &servers, exchange).await?;
	forget_renewed(reports, &renewals);
	let grants = credentials::served(root, owner)?;
	let nothing_asked = HashSet::new();
	let unasked = Readings {
		owner,
		flows,
		reports,
		grants: &grants,
		renewals: &renewals,
		asking: &nothing_asked,
		now: now_ms(),
	};
	let asking = answers.asking_authorization(unasked.worth_asking(&servers), unasked.now).await;
	let readings = Readings { asking: &asking, ..unasked };
	Ok(servers.into_iter().map(|server| readings.row(server)).collect())
}

fn forget_renewed(reports: &ApplicationReports, renewals: &Renewals) {
	for (name, renewal) in renewals {
		if matches!(renewal, Renewal::Renewed) {
			reports.forget(name);
		}
	}
}

struct Readings<'a> {
	owner: &'a EnvOwner,
	flows: &'a McpOauthState,
	reports: &'a ApplicationReports,
	grants: &'a ServedGrants,
	renewals: &'a Renewals,
	asking: &'a HashSet<String>,
	now: i64,
}

impl Readings<'_> {
	fn worth_asking(&self, servers: &[McpServer]) -> HashSet<String> {
		servers
			.iter()
			.filter(|server| server.kiroshi_authorizes())
			.filter(|server| reads_the_answer(&self.evidence(server), self.now))
			.filter_map(|server| server.url().map(str::to_owned))
			.collect()
	}

	fn evidence(&self, server: &McpServer) -> Evidence {
		let named = EnvScope::Server { name: server.name.clone(), owner: self.owner.clone() };
		Evidence {
			is_authorizing: self.flows.is_authorizing(&named),
			refusal: refusal(self.renewals, &server.name),
			reported: last_reported(self.reports, self.owner, &server.name),
			held: self.grants.get(&server.name).map(|grant| grant.held.clone()).unwrap_or_default(),
			asks_for_authorization: server.url().is_some_and(|url| self.asking.contains(url)),
		}
	}

	fn row(&self, server: McpServer) -> ApplicationRow {
		let grant = self.grants.get(&server.name);
		let evidence = self.evidence(&server);
		ApplicationRow {
			status: status(evidence, self.now),
			scope: grant.map(|grant| grant.scope.clone()),
			name: server.name,
		}
	}
}

fn refusal(renewals: &Renewals, name: &str) -> Option<String> {
	match renewals.get(name) {
		Some(Renewal::Awaiting { reason }) => reason.clone(),
		Some(Renewal::Renewed) | None => None,
	}
}

fn last_reported(reports: &ApplicationReports, owner: &EnvOwner, name: &str) -> Option<Standing> {
	match owner {
		EnvOwner::Bot { id, .. } => reports.last(id, name),
		EnvOwner::User | EnvOwner::Space { .. } => None,
	}
}

pub(super) fn declared_servers<R: Runtime>(
	app: &AppHandle<R>,
	owner: &EnvOwner,
) -> Result<Vec<McpServer>, EnvError> {
	match owner {
		EnvOwner::Bot { id, .. } => bundles::root(app)
			.map(|root| bundles::mcp_servers(&root, id))
			.ok_or_else(|| EnvError::Unreadable { detail: NO_BUNDLES.to_owned() }),
		EnvOwner::Space { id } => Ok(bundles::space::laid_down(app, id)
			.map_or_else(Vec::new, |bundle| bundles::mcp_servers_at(&bundle))),
		EnvOwner::User => Ok(bundles::user::laid_down(app)
			.map_or_else(Vec::new, |bundle| bundles::mcp_servers_at(&bundle))),
	}
}

async fn revoked<R: Runtime>(app: &AppHandle<R>, url: &str, held: &Values) -> Disconnected {
	let Some(token) = held.get(OAUTH_ACCESS_TOKEN) else {
		return Disconnected { revoked: false, detail: Some(NOTHING_STORED.to_owned()) };
	};
	let request = RevocationRequest {
		url: url.to_owned(),
		token: token.clone(),
		refresh_token: held.get(OAUTH_REFRESH_TOKEN).cloned(),
		client_id: held.get(OAUTH_CLIENT_ID).cloned(),
		client_secret: held.get(OAUTH_CLIENT_SECRET).cloned(),
	};
	match app.state::<AgentState>().sidecar().await {
		Ok(sidecar) => match sidecar.revoke_oauth(&request).await {
			Ok(answer) => Disconnected { revoked: answer.revoked, detail: answer.detail },
			Err(error) => Disconnected { revoked: false, detail: Some(format!("{error:?}")) },
		},
		Err(error) => Disconnected { revoked: false, detail: Some(format!("{error:?}")) },
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::agent::protocol::{OauthFailure, OauthFailureKind};
	use crate::mcp_oauth::status::ApplicationStatus;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::an_app_of_its_own;
	use tauri::test::mock_builder;

	fn a_server(name: &str) -> EnvScope {
		EnvScope::Server {
			name: name.to_owned(),
			owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		}
	}

	#[tokio::test]
	async fn the_applications_of_the_user_are_the_servers_the_user_plugin_declares() {
		let app = an_app_of_its_own("mcp-oauth-user-applications", mock_builder());
		app.manage(McpOauthState::default());
		app.manage(ApplicationReports::default());
		app.manage(AuthorizationAnswers::default());
		let path = bundles::user::path(app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&path).expect("the plugin is laid down");
		for name in ["clock", "granola"] {
			let config = serde_json::json!({ "command": name });
			bundles::plugin::set_mcp_server(&path, name, &config, None).expect("the server lands");
		}
		bundles::plugin::set_mcp_server(
			&path,
			"notion",
			&serde_json::json!({ "url": "https://mcp.notion.test/mcp" }),
			None,
		)
		.expect("the server lands");
		let root = writable_root(app.handle()).expect("the data dir is writable");
		let notion = EnvScope::Server { name: "notion".to_owned(), owner: EnvOwner::User };
		credentials::store(&root, &notion, &an_aging_grant(Some("held-refresh")))
			.expect("the grant is written");

		let rows = mcp_application_status(app.handle().clone(), Caller::Host, EnvOwner::User)
			.await
			.expect("the status reads");

		assert_eq!(
			rows.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(),
			["clock", "granola", "notion"]
		);
		assert_eq!(rows[2].status, ApplicationStatus::Connected);
		assert_eq!(
			store::values(&root, &notion)
				.expect("the scope is readable")
				.get(OAUTH_ACCESS_TOKEN)
				.map(String::as_str),
			Some("held-access")
		);
	}

	#[tokio::test]
	async fn a_connect_to_a_server_kiroshi_does_not_authorize_is_refused_naming_why_and_opens_no_flow(
	) {
		let app = an_app_of_its_own("mcp-oauth-withheld", mock_builder());
		app.manage(McpOauthState::default());
		app.manage(ApplicationReports::default());
		let path = bundles::user::path(app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&path).expect("the plugin is laid down");
		let declared = [
			("paper", serde_json::json!({ "url": "http://127.0.0.1:29979/mcp" })),
			(
				"linear",
				serde_json::json!({
					"url": "https://mcp.linear.test/mcp",
					"headers": { "Authorization": "Bearer held" }
				}),
			),
			("granola", serde_json::json!({ "url": "https://${GRANOLA_HOST}/mcp" })),
			("clock", serde_json::json!({ "command": "clock" })),
		];
		for (name, config) in &declared {
			bundles::plugin::set_mcp_server(&path, name, config, None).expect("the server lands");
		}
		let asked = [
			("paper", "http://127.0.0.1:29979/mcp", AuthorizationWithheld::LoopbackAddress),
			(
				"linear",
				"https://mcp.linear.test/mcp",
				AuthorizationWithheld::OwnAuthorizationHeader,
			),
			("granola", "https://granola.test/mcp", AuthorizationWithheld::UnexpandedPlaceholder),
			("undeclared", "http://localhost:3000/mcp", AuthorizationWithheld::LoopbackAddress),
			("clock", "https://clock.test/mcp", AuthorizationWithheld::ServedOverNoUrl),
		];

		for (name, url, carries) in asked {
			let refused = mcp_oauth_connect(
				app.handle().clone(),
				EnvOwner::User,
				name.to_owned(),
				url.to_owned(),
			)
			.await;

			let detail = withheld_reason(carries).to_owned();
			assert_eq!(refused, Err(OauthError::NotAuthorizable { carries, detail }), "{name}");
			assert!(!app.state::<McpOauthState>().is_running(), "{name}");
		}
		assert_eq!(
			serde_json::to_value(OauthError::NotAuthorizable {
				carries: AuthorizationWithheld::LoopbackAddress,
				detail: withheld_reason(AuthorizationWithheld::LoopbackAddress).to_owned(),
			})
			.expect("the error serializes"),
			serde_json::json!({
				"kind": "notAuthorizable",
				"carries": "loopbackAddress",
				"detail": "it is served on a loopback address"
			})
		);
	}

	#[test]
	fn a_second_flow_is_refused_while_one_is_running() {
		let state = McpOauthState::default();
		let running =
			state.begin(Flow::Authorizing(a_server("granola"))).expect("the first flow claims");

		assert_eq!(state.begin(Flow::Revoking).err(), Some(OauthError::AlreadyRunning));
		assert!(state.is_running());

		drop(running);

		assert!(!state.is_running());
		state.begin(Flow::Revoking).expect("a flow that settled leaves the state free");
	}

	#[test]
	fn a_running_authorization_reads_as_connecting_for_its_server_and_no_other() {
		let state = McpOauthState::default();
		let running = state.begin(Flow::Authorizing(a_server("granola"))).expect("the flow claims");

		assert!(state.is_authorizing(&a_server("granola")));
		assert!(!state.is_authorizing(&a_server("notion")));
		assert!(!state.is_authorizing(&EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}));

		drop(running);

		assert!(!state.is_authorizing(&a_server("granola")));
	}

	fn a_live_grant() -> OauthCredentials {
		OauthCredentials {
			access_token: "granted".to_owned(),
			refresh_token: Some("renewable".to_owned()),
			expires_at: Some(now_ms() + 3_600_000),
			client_id: "registered".to_owned(),
			client_secret: None,
			redirect_uri: None,
		}
	}

	#[test]
	fn a_server_a_session_reported_waiting_reads_connected_once_the_person_authorizes_it() {
		let root = crate::db::connection::fixture_root("mcp-oauth-connect-clears");
		let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let reports = ApplicationReports::default();
		reports.record("b1", "granola", Standing::NeedsAuth { reason: None });
		reports.record("b2", "granola", Standing::NeedsAuth { reason: None });
		reports.record("b1", "clock", Standing::Holding);

		kept(&root, &a_server("granola"), "granola", &a_live_grant(), &reports)
			.expect("the grant is stored");

		let grants = credentials::served(&root, &owner).expect("the grants are readable");
		let readings = Readings {
			owner: &owner,
			flows: &McpOauthState::default(),
			reports: &reports,
			grants: &grants,
			renewals: &Renewals::new(),
			asking: &HashSet::new(),
			now: now_ms(),
		};
		let granola = a_granola();
		assert_eq!(readings.row(granola).status, ApplicationStatus::Connected);
		assert_eq!(reports.last("b2", "granola"), None);
		assert_eq!(reports.last("b1", "clock"), Some(Standing::Holding));
	}

	fn a_bot() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn granola_of_the_space() -> EnvScope {
		EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}
	}

	#[test]
	fn a_connect_hands_the_stored_client_only_beside_its_redirect_uri() {
		let stored = Values::from([
			(OAUTH_CLIENT_ID.to_owned(), "registered".to_owned()),
			(OAUTH_CLIENT_SECRET.to_owned(), "confidential".to_owned()),
			(OAUTH_REDIRECT_URI.to_owned(), "http://127.0.0.1:53682/oauth/callback".to_owned()),
		]);
		let no_redirect = Values::from([
			(OAUTH_CLIENT_ID.to_owned(), "registered".to_owned()),
			(OAUTH_CLIENT_SECRET.to_owned(), "confidential".to_owned()),
		]);
		let orphan = Values::from([(OAUTH_CLIENT_SECRET.to_owned(), "confidential".to_owned())]);
		let registering = AuthorizeRequest { url: "https://a".to_owned(), ..Default::default() };

		assert_eq!(
			authorize_request("https://a".to_owned(), &stored),
			AuthorizeRequest {
				url: "https://a".to_owned(),
				client_id: Some("registered".to_owned()),
				client_secret: Some("confidential".to_owned()),
				redirect_uri: Some("http://127.0.0.1:53682/oauth/callback".to_owned()),
			}
		);
		assert_eq!(authorize_request("https://a".to_owned(), &no_redirect), registering);
		assert_eq!(authorize_request("https://a".to_owned(), &orphan), registering);
	}

	fn a_root(name: &str) -> RemovedOnDrop {
		crate::db::connection::fixture_root(&format!("mcp-oauth-commands-{name}"))
	}

	fn read_row(root: &Path, owner: &EnvOwner) -> ApplicationRow {
		let grants = credentials::served(root, owner).expect("the grants are readable");
		let readings = Readings {
			owner,
			flows: &McpOauthState::default(),
			reports: &ApplicationReports::default(),
			grants: &grants,
			renewals: &Renewals::new(),
			asking: &HashSet::new(),
			now: now_ms(),
		};
		readings.row(a_granola())
	}

	#[test]
	fn a_row_names_the_broader_scope_a_bot_holding_no_grant_is_served_from() {
		let root = a_root("row-broader");
		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		let row = read_row(&root, &a_bot());

		assert_eq!(row.scope, Some(granola_of_the_space()));
		assert_eq!(row.status, ApplicationStatus::Connected);
	}

	#[test]
	fn a_connect_stores_at_the_owner_named_and_the_row_then_names_that_owner() {
		let root = a_root("row-named");
		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		kept(
			&root,
			&a_server("granola"),
			"granola",
			&a_live_grant(),
			&ApplicationReports::default(),
		)
		.expect("the grant is stored");

		assert_eq!(read_row(&root, &a_bot()).scope, Some(a_server("granola")));
		assert!(store::values(&root, &a_server("granola"))
			.expect("the scope is readable")
			.contains_key(OAUTH_ACCESS_TOKEN));
	}

	#[test]
	fn a_disconnect_acts_on_the_broader_grant_a_bot_is_served_and_else_on_the_owner_named() {
		let root = a_root("held-at");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(a_server("granola")));

		credentials::store(&root, &granola_of_the_space(), &a_live_grant())
			.expect("the space grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(granola_of_the_space()));

		let root = a_root("held-at-user");
		let of_the_user = EnvScope::Server { name: "granola".to_owned(), owner: EnvOwner::User };
		credentials::store(&root, &of_the_user, &a_live_grant())
			.expect("the user grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(of_the_user));

		credentials::store(&root, &a_server("granola"), &a_live_grant())
			.expect("the bot grant is written");

		assert_eq!(held_at(&root, &a_bot(), "granola"), Ok(a_server("granola")));
	}

	#[tokio::test]
	async fn a_settled_disconnect_forgets_every_standing_of_that_server() {
		let app = an_app_of_its_own("mcp-oauth-disconnect", mock_builder());
		app.manage(McpOauthState::default());
		app.manage(ApplicationReports::default());
		let reports = app.state::<ApplicationReports>();
		reports.record("b-disconnect-test", "granola", Standing::Holding);
		reports.record("b-other", "granola", Standing::NeedsAuth { reason: None });
		reports.record("b-disconnect-test", "clock", Standing::Holding);
		let owner =
			EnvOwner::Bot { id: "b-disconnect-test".to_owned(), space_id: "s-test".to_owned() };

		let settled = mcp_oauth_disconnect(
			app.handle().clone(),
			Caller::Host,
			owner,
			"granola".to_owned(),
			"https://mcp.granola.test/mcp".to_owned(),
		)
		.await;

		assert_eq!(
			settled,
			Ok(Disconnected { revoked: false, detail: Some(NOTHING_STORED.to_owned()) })
		);
		assert_eq!(reports.last("b-disconnect-test", "granola"), None);
		assert_eq!(reports.last("b-other", "granola"), None);
		assert_eq!(reports.last("b-disconnect-test", "clock"), Some(Standing::Holding));
	}

	fn granola_declared() -> Vec<McpServer> {
		vec![a_granola()]
	}

	const GRANOLA_URL: &str = "https://mcp.granola.test/mcp";

	fn a_granola() -> McpServer {
		McpServer {
			name: "granola".to_owned(),
			config: serde_json::json!({ "url": GRANOLA_URL }),
			mark: bundles::ApplicationMark::default(),
		}
	}

	fn an_aging_grant(refresh_token: Option<&str>) -> OauthCredentials {
		OauthCredentials {
			access_token: "held-access".to_owned(),
			refresh_token: refresh_token.map(str::to_owned),
			expires_at: Some(now_ms()),
			client_id: "registered".to_owned(),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: None,
		}
	}

	fn a_renewed_grant() -> OauthCredentials {
		OauthCredentials {
			access_token: "renewed-access".to_owned(),
			refresh_token: Some("renewed-refresh".to_owned()),
			expires_at: Some(now_ms() + 3_600_000),
			client_id: "registered".to_owned(),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: None,
		}
	}

	#[tokio::test]
	async fn a_renewal_that_lands_reads_connected_and_drops_the_standing_a_session_reported() {
		let root = a_root("renewal-lands");
		credentials::store(&root, &a_server("granola"), &an_aging_grant(Some("held-refresh")))
			.expect("the grant is written");
		let reports = ApplicationReports::default();
		reports.record("b1", "granola", Standing::NeedsAuth { reason: None });

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&reports,
			&AuthorizationAnswers::default(),
			|_| async { Ok(Authorized { credentials: Some(a_renewed_grant()), error: None }) },
		)
		.await
		.expect("the rows read");

		assert_eq!(rows[0].status, ApplicationStatus::Connected);
		assert_eq!(reports.last("b1", "granola"), None);
		assert_eq!(
			store::values(&root, &a_server("granola"))
				.expect("the scope is readable")
				.get(OAUTH_ACCESS_TOKEN)
				.map(String::as_str),
			Some("renewed-access")
		);
	}

	#[tokio::test]
	async fn a_renewal_the_store_refused_needs_authorization_over_the_standing_last_reported() {
		let root = a_root("renewal-lost");
		credentials::store(&root, &a_server("granola"), &an_aging_grant(Some("held-refresh")))
			.expect("the grant is written");
		let reports = ApplicationReports::default();
		reports.record("b1", "granola", Standing::Holding);
		crate::private_files::interrupt_the_write_after(0);

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&reports,
			&AuthorizationAnswers::default(),
			|_| async { Ok(Authorized { credentials: Some(a_renewed_grant()), error: None }) },
		)
		.await
		.expect("the rows read");

		let ApplicationStatus::NeedsAuthorization { reason: Some(reason) } = &rows[0].status else {
			panic!("a grant that could not be stored awaits authorization: {:?}", rows[0].status);
		};
		assert!(reason.contains("the refreshed grant could not be stored"));
		for secret in ["held-access", "held-refresh", "renewed-access", "confidential"] {
			assert!(!reason.contains(secret));
		}
	}

	#[tokio::test]
	async fn a_refused_renewal_needs_authorization_and_carries_the_reason_with_no_secret_in_it() {
		let root = a_root("renewal-refused");
		credentials::store(&root, &a_server("granola"), &an_aging_grant(Some("held-refresh")))
			.expect("the grant is written");

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&ApplicationReports::default(),
			&AuthorizationAnswers::default(),
			|_| async {
				Ok(Authorized {
					credentials: None,
					error: Some(OauthFailure {
						kind: OauthFailureKind::Rejected,
						detail: Some("held-refresh is revoked, so is held-access".to_owned()),
						step: None,
						status: None,
						body: None,
						code: Some("invalid_grant".to_owned()),
					}),
				})
			},
		)
		.await
		.expect("the rows read");

		assert_eq!(
			rows[0].status,
			ApplicationStatus::NeedsAuthorization {
				reason: Some("[redacted] is revoked, so is [redacted]".to_owned())
			}
		);
		let crossed = serde_json::to_string(&rows).expect("the rows serialize");
		for secret in ["held-access", "held-refresh", "confidential"] {
			assert!(!crossed.contains(secret));
		}
	}

	#[tokio::test]
	async fn a_renewal_the_sidecar_never_answered_leaves_the_row_on_the_grant_on_disk() {
		let root = a_root("renewal-unreachable");
		credentials::store(&root, &a_server("granola"), &an_aging_grant(Some("held-refresh")))
			.expect("the grant is written");

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&ApplicationReports::default(),
			&AuthorizationAnswers::default(),
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read");

		assert_eq!(rows[0].status, ApplicationStatus::Connected);
		assert_eq!(
			store::values(&root, &a_server("granola"))
				.expect("the scope is readable")
				.get(OAUTH_ACCESS_TOKEN)
				.map(String::as_str),
			Some("held-access")
		);
	}

	#[tokio::test]
	async fn a_grant_outside_the_renewal_window_sends_no_request_and_reads_from_disk() {
		let root = a_root("renewal-untouched");
		credentials::store(&root, &a_server("granola"), &a_live_grant())
			.expect("the grant is written");
		let asked = std::cell::Cell::new(0);

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&ApplicationReports::default(),
			&AuthorizationAnswers::default(),
			|_| {
				asked.set(asked.get() + 1);
				async { Err(TransportError::NotStarted) }
			},
		)
		.await
		.expect("the rows read");

		assert_eq!(asked.get(), 0);
		assert_eq!(rows[0].status, ApplicationStatus::Connected);
	}

	async fn unreported_rows_of_an_expired_grant(
		root_name: &str,
		answers: &AuthorizationAnswers,
	) -> Vec<ApplicationRow> {
		let root = a_root(root_name);
		credentials::store(&root, &a_server("granola"), &an_aging_grant(None))
			.expect("the grant is written");
		renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&ApplicationReports::default(),
			answers,
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read")
	}

	#[tokio::test]
	async fn an_unusable_grant_of_a_server_answering_that_it_asks_for_authorization_needs_it() {
		let answers = AuthorizationAnswers::default();
		answers.answered(GRANOLA_URL, true, now_ms());

		let rows = unreported_rows_of_an_expired_grant("spent-asking", &answers).await;

		assert_eq!(rows[0].status, ApplicationStatus::NeedsAuthorization { reason: None });
	}

	#[tokio::test]
	async fn an_unusable_grant_of_a_server_nothing_says_asks_for_authorization_is_unknown() {
		let asking_none = AuthorizationAnswers::default();
		asking_none.answered(GRANOLA_URL, false, now_ms());

		let rows = unreported_rows_of_an_expired_grant("spent-asking-none", &asking_none).await;

		assert_eq!(rows[0].status, ApplicationStatus::Unknown);
	}

	#[tokio::test]
	async fn a_server_served_on_a_loopback_address_is_never_asked_and_reads_unknown() {
		let paper = McpServer {
			name: "paper".to_owned(),
			config: serde_json::json!({ "url": "http://127.0.0.1:29979/mcp" }),
			mark: bundles::ApplicationMark::default(),
		};
		let answers = AuthorizationAnswers::default();
		answers.answered("http://127.0.0.1:29979/mcp", true, now_ms());

		let root = a_root("loopback-unasked");
		let rows = renewed_rows(
			&root,
			&EnvOwner::User,
			vec![paper],
			&McpOauthState::default(),
			&ApplicationReports::default(),
			&answers,
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read");

		assert_eq!(rows[0].status, ApplicationStatus::Unknown);
	}

	fn a_remote(name: &str) -> McpServer {
		McpServer {
			name: name.to_owned(),
			config: serde_json::json!({ "url": format!("https://mcp.{name}.test/mcp") }),
			mark: bundles::ApplicationMark::default(),
		}
	}

	#[tokio::test]
	async fn a_status_read_sends_no_request_to_a_server_whose_row_reads_no_answer() {
		let root = a_root("asked-only-where-read");
		let reports = ApplicationReports::default();
		reports.record("b1", "holding", Standing::Holding);
		reports.record("b1", "waiting", Standing::NeedsAuth { reason: None });
		credentials::remember_refusal(&root, &a_server("refused"), "invalid_grant")
			.expect("the reason is written");
		credentials::store(&root, &a_server("granted"), &a_live_grant())
			.expect("the grant is written");
		let flows = McpOauthState::default();
		let _running =
			flows.begin(Flow::Authorizing(a_server("authorizing"))).expect("the flow claims");
		let unasked = ["holding", "waiting", "refused", "granted", "authorizing"];
		let answers = AuthorizationAnswers::default();

		let rows = renewed_rows(
			&root,
			&a_bot(),
			unasked.iter().chain(["unreported"].iter()).map(|name| a_remote(name)).collect(),
			&flows,
			&reports,
			&answers,
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read");

		assert_eq!(rows.len(), 6);
		for name in unasked {
			let url = a_remote(name).url().map(str::to_owned).expect("the server has a url");
			assert!(!answers.holds_anything_for(&url), "{name} was asked");
		}
		assert!(answers.holds_anything_for("https://mcp.unreported.test/mcp"));
	}

	fn left_out_by_a_session(reports: &ApplicationReports) {
		reports.record(
			"b1",
			"granola",
			Standing::LeftOut { reason: Some("it read failed".to_owned()) },
		);
	}

	async fn left_out_rows_holding_no_grant(root_name: &str, asks: bool) -> Vec<ApplicationRow> {
		let reports = ApplicationReports::default();
		left_out_by_a_session(&reports);
		let answers = AuthorizationAnswers::default();
		answers.answered(GRANOLA_URL, asks, now_ms());
		let root = a_root(root_name);
		renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&reports,
			&answers,
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read")
	}

	#[tokio::test]
	async fn an_application_a_session_left_out_answering_it_asks_for_none_reads_failed_with_its_reason(
	) {
		let rows = left_out_rows_holding_no_grant("left-out-asking-none", false).await;

		assert_eq!(
			rows[0].status,
			ApplicationStatus::Failed { reason: Some("it read failed".to_owned()) }
		);
	}

	#[tokio::test]
	async fn an_application_a_session_left_out_answering_it_asks_for_authorization_needs_it() {
		let rows = left_out_rows_holding_no_grant("left-out-asking", true).await;

		assert_eq!(rows[0].status, ApplicationStatus::NeedsAuthorization { reason: None });
	}

	#[tokio::test]
	async fn an_application_a_session_left_out_holding_a_usable_grant_reads_failed() {
		let root = a_root("left-out-holding");
		credentials::store(&root, &a_server("granola"), &a_live_grant())
			.expect("the grant is written");
		let reports = ApplicationReports::default();
		left_out_by_a_session(&reports);

		let rows = renewed_rows(
			&root,
			&a_bot(),
			granola_declared(),
			&McpOauthState::default(),
			&reports,
			&AuthorizationAnswers::default(),
			|_| async { Err(TransportError::NotStarted) },
		)
		.await
		.expect("the rows read");

		assert_eq!(
			rows[0].status,
			ApplicationStatus::Failed { reason: Some("it read failed".to_owned()) }
		);
	}

	#[test]
	fn a_disconnect_reads_as_connecting_for_no_server() {
		let state = McpOauthState::default();
		let _revoking = state.begin(Flow::Revoking).expect("the disconnect claims");

		assert!(!state.is_authorizing(&a_server("granola")));
	}

	#[test]
	fn a_state_holding_no_flow_reads_as_holding_none() {
		assert!(!McpOauthState::default().is_running());
	}

	#[test]
	fn a_disconnect_claims_the_same_state_a_connect_does() {
		let state = McpOauthState::default();
		let connecting =
			state.begin(Flow::Authorizing(a_server("granola"))).expect("the connect claims");

		assert_eq!(state.begin(Flow::Revoking).err(), Some(OauthError::AlreadyRunning));

		drop(connecting);
		let disconnecting = state.begin(Flow::Revoking).expect("the disconnect claims in turn");

		assert_eq!(
			state.begin(Flow::Authorizing(a_server("granola"))).err(),
			Some(OauthError::AlreadyRunning)
		);
		drop(disconnecting);
	}

	#[test]
	fn only_an_http_url_is_ever_handed_to_a_browser() {
		assert!(is_openable("https://authority.test/authorize?state=1"));
		assert!(is_openable("http://127.0.0.1:8080/authorize"));
		assert!(is_openable("HTTPS://authority.test/authorize"));
		assert!(!is_openable("javascript:alert(1)"));
		assert!(!is_openable("file:///etc/passwd"));
		assert!(!is_openable("data:text/html,<script>1</script>"));
		assert!(!is_openable("authorize"));
	}
}
