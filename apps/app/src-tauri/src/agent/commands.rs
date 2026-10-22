use std::collections::{BTreeSet, HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::{Arc, MutexGuard, PoisonError};

use serde::de::DeserializeOwned;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::{broadcast, Mutex};

use super::contract::{
	AccountReport, AgentEvent, CancelFailureReason, CancelOutcome, CheckReport, ConnectionState,
	ConversationNaming, EventTurn, EvolvedBundle, LiveSession, OfferedModel, PermissionDecision,
	QuestionRequest, RuntimeScope, ScopedEvent, SessionHandle, SubmittedTurn, TransportError,
	TurnOutcome,
};
use super::host::hosted;
use super::lease::RunLease;
use super::protocol::{self, Checked, SpaceMember};
use super::reply_writer::{HostWrites, ReplyWriter, TurnAttachments, TurnSink};
use super::session::{Bundle, EventSink, GatedSink, Session, SessionOptions};
use super::sidecar::{self, Sidecar, SidecarOptions};
use super::translate::now_ms;
use crate::applications::host::ApplicationHost;
use crate::bundles;
use crate::bundles::host::BundleHost;
use crate::companions::host::CompanionHost;
use crate::conversations::commands::{announce_conversation, ready, space_of_the_conversation};
use crate::conversations::contract::TranscriptStoreError;
use crate::conversations::host_turn::{ended_as, HostTurns};
use crate::db;
use crate::db::repositories::conversations::{Bot as StoredBot, ConversationError, MISSION_KIND};
use crate::db::repositories::runtime_context::ParticipantKey;
use crate::db::repositories::space_children::SpaceChild;
use crate::environment::connection;
use crate::environment::contract::{EnvError, EnvOwner, ResolvedEnv, Values};
use crate::environment::store as environment;
use crate::events::{self, Frame, AGENT_EVENT, CONVERSATION_UPDATED};
use crate::hosting::authorship;
use crate::json::JsonValue;
use crate::logging;
use crate::mcp_oauth::refresh;
use crate::mcp_oauth::reports::StandingHost;
use crate::missions::host::MissionHost;
use crate::private_files;
use crate::routines::host::RoutineHost;

pub const EVENT_CHANNEL: &str = "agent://event";

const RUNS_DIR: &str = "runs";

pub(crate) fn announce<R: Runtime>(
	app: &AppHandle<R>,
	scope: Option<RuntimeScope>,
	event: AgentEvent,
) {
	announce_in_turn(app, scope, None, event);
}

fn announce_in_turn<R: Runtime>(
	app: &AppHandle<R>,
	scope: Option<RuntimeScope>,
	turn: Option<EventTurn>,
	event: AgentEvent,
) {
	announce_scoped(app, ScopedEvent { scope, turn, event });
}

fn announce_scoped<R: Runtime>(app: &AppHandle<R>, scoped: ScopedEvent) {
	if let Err(failure) = events::emit(app, AGENT_EVENT, scoped) {
		log::warn!("a turn event was not announced: {failure}");
	}
}

pub(crate) fn subscribed_with_pending_questions<R: Runtime>(
	app: &AppHandle<R>,
) -> (Vec<Frame>, broadcast::Receiver<Frame>) {
	let Some(state) = app.try_state::<AgentState>() else {
		return (Vec::new(), events::subscribed(app));
	};
	let (pending, heard) = state.live.questions_pending_at(|| events::subscribed(app));
	(pending.into_iter().filter_map(|question| framed_question(question.scoped())).collect(), heard)
}

fn framed_question(asked: ScopedEvent) -> Option<Frame> {
	match events::frame(AGENT_EVENT, &asked) {
		Ok(frame) => Some(frame),
		Err(failure) => {
			log::warn!("a pending question did not serialize for a new listener: {failure}");
			None
		}
	}
}

type Participant = (String, String);

type RunKey = String;

fn run_key(scope: &RuntimeScope) -> RunKey {
	scope.runtime_session_id.clone()
}

fn participant(scope: &RuntimeScope) -> Participant {
	(scope.conversation_id.clone(), scope.bot_id.clone())
}

fn participant_key(scope: &RuntimeScope) -> ParticipantKey {
	ParticipantKey { conversation_id: scope.conversation_id.clone(), bot_id: scope.bot_id.clone() }
}

struct Live<S = Arc<Session>> {
	runs: std::sync::Mutex<HashMap<RunKey, Run<S>>>,
	questions: std::sync::Mutex<Vec<PendingQuestion>>,
}

#[derive(Clone)]
struct PendingQuestion {
	scope: RuntimeScope,
	turn: Option<EventTurn>,
	request: QuestionRequest,
}

impl PendingQuestion {
	fn scoped(self) -> ScopedEvent {
		ScopedEvent {
			scope: Some(self.scope),
			turn: self.turn,
			event: AgentEvent::QuestionRequested { request: self.request },
		}
	}

	fn asked_by(&self, scope: &RuntimeScope) -> bool {
		run_key(&self.scope) == run_key(scope)
	}
}

struct Run<S> {
	scope: RuntimeScope,
	session: Option<S>,
	started_at: i64,
}

impl<S> Run<S> {
	fn reported(&self) -> LiveSession {
		LiveSession {
			bot_id: self.scope.bot_id.clone(),
			conversation_id: self.scope.conversation_id.clone(),
			runtime_session_id: self.scope.runtime_session_id.clone(),
			started_at: self.started_at,
		}
	}
}

struct Admission<S> {
	replaced: Option<S>,
	keeps_lineage: bool,
}

impl<S> Admission<S> {
	fn resume(&self, asked: Option<String>) -> Option<String> {
		asked.filter(|_| self.keeps_lineage)
	}
}

impl<S> Default for Live<S> {
	fn default() -> Self {
		Self {
			runs: std::sync::Mutex::new(HashMap::new()),
			questions: std::sync::Mutex::new(Vec::new()),
		}
	}
}

impl<S> Live<S> {
	fn questions(&self) -> MutexGuard<'_, Vec<PendingQuestion>> {
		self.questions.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn release_question(&self, scope: &RuntimeScope, id: &str) {
		self.questions()
			.retain(|question| !(question.asked_by(scope) && question.request.id == id));
	}

	fn drop_questions(&self, scope: &RuntimeScope) {
		self.questions().retain(|question| !question.asked_by(scope));
	}

	fn questions_in(&self, conversation_id: &str) -> Vec<ScopedEvent> {
		self.questions()
			.iter()
			.filter(|question| question.scope.conversation_id == conversation_id)
			.cloned()
			.map(PendingQuestion::scoped)
			.collect()
	}

	fn questions_pending_at<T>(&self, subscribe: impl FnOnce() -> T) -> (Vec<PendingQuestion>, T) {
		let questions = self.questions();
		(questions.clone(), subscribe())
	}
}

impl<S: Clone> Live<S> {
	fn take_over(&self, scope: RuntimeScope) -> Admission<S> {
		let mut runs = self.runs.lock().expect("live runs");
		let key = run_key(&scope);
		let keeps_lineage = !runs
			.iter()
			.any(|(held, run)| held != &key && participant(&run.scope) == participant(&scope));
		let replaced = runs
			.insert(key, Run { scope: scope.clone(), session: None, started_at: now_ms() })
			.and_then(|replaced| replaced.session);
		drop(runs);
		self.drop_questions(&scope);
		Admission { replaced, keeps_lineage }
	}

	fn install(&self, scope: &RuntimeScope, session: S) -> bool {
		let mut runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get_mut(&run_key(scope)) else {
			return false;
		};
		if &run.scope != scope {
			return false;
		}
		run.session = Some(session);
		true
	}

	fn clear(&self, scope: &RuntimeScope) -> Option<S> {
		let cleared = self
			.runs
			.lock()
			.expect("live runs")
			.remove(&run_key(scope))
			.and_then(|run| run.session);
		self.drop_questions(scope);
		cleared
	}

	fn clear_all(&self) -> Vec<S> {
		let cleared = std::mem::take(&mut *self.runs.lock().expect("live runs"));
		self.questions().clear();
		cleared.into_values().filter_map(|run| run.session).collect()
	}

	fn hold_question(&self, asked: PendingQuestion, announce: impl FnOnce(PendingQuestion)) {
		let mut questions = self.questions();
		if !self.holds(&asked.scope) {
			return;
		}
		questions.push(asked.clone());
		announce(asked);
	}

	fn report(&self) -> Vec<LiveSession> {
		let mut held: Vec<LiveSession> =
			self.runs.lock().expect("live runs").values().map(Run::reported).collect();
		held.sort_by(|left, right| {
			(left.started_at, &left.runtime_session_id)
				.cmp(&(right.started_at, &right.runtime_session_id))
		});
		held
	}

	fn holds(&self, scope: &RuntimeScope) -> bool {
		self.runs.lock().expect("live runs").values().any(|run| &run.scope == scope)
	}

	fn is_foreign(&self, scope: &RuntimeScope) -> bool {
		self.runs
			.lock()
			.expect("live runs")
			.get(&run_key(scope))
			.is_some_and(|run| &run.scope != scope)
	}

	fn session_for(&self, scope: &RuntimeScope) -> Result<S, TransportError> {
		let runs = self.runs.lock().expect("live runs");
		let Some(run) = runs.get(&run_key(scope)) else {
			return Err(TransportError::NotStarted);
		};
		if &run.scope != scope {
			return Err(stale(scope));
		}
		run.session.clone().ok_or(TransportError::NotStarted)
	}
}

struct RunSink<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
	live: Arc<Live>,
	records_its_own_lineage: bool,
}

impl<R: Runtime> TurnSink for RunSink<R> {
	fn emit(&self, event: AgentEvent, turn: Option<EventTurn>) {
		if !self.live.holds(&self.scope) && !closes_the_run(&event) {
			return;
		}
		if let AgentEvent::QuestionRequested { request } = &event {
			let asked =
				PendingQuestion { scope: self.scope.clone(), turn, request: request.clone() };
			return self
				.live
				.hold_question(asked, |asked| announce_scoped(&self.app, asked.scoped()));
		}
		self.release_questions_settled_by(&event);
		if let AgentEvent::SessionReady { session_id, .. } = &event {
			self.record_its_own_lineage(session_id.clone());
		}
		let ended = matches!(event, AgentEvent::TurnEnded { .. });
		announce_in_turn(&self.app, Some(self.scope.clone()), turn, event);
		if ended {
			self.record_writes();
		}
	}
}

fn closes_the_run(event: &AgentEvent) -> bool {
	matches!(
		event,
		AgentEvent::TurnEnded { .. }
			| AgentEvent::Failed { error: TransportError::WriteFailed { .. } }
	)
}

impl<R: Runtime> RunSink<R> {
	fn release_questions_settled_by(&self, event: &AgentEvent) {
		match event {
			AgentEvent::PermissionResolved { id, .. } => {
				self.live.release_question(&self.scope, id)
			}
			AgentEvent::TurnEnded { .. } => self.live.drop_questions(&self.scope),
			AgentEvent::Failed { error } if error.is_fatal() => {
				self.live.drop_questions(&self.scope)
			}
			_ => {}
		}
	}

	fn record_its_own_lineage(&self, provider_session_id: String) {
		if !self.records_its_own_lineage {
			return;
		}
		let app = self.app.clone();
		let scope = self.scope.clone();
		tauri::async_runtime::spawn(async move {
			let refused = match bot_database(&app) {
				Some(database) => {
					record_its_own_provider_session(database, &scope, provider_session_id)
						.await
						.err()
				}
				None => Some(TransportError::WriteFailed {
					detail: NO_DATABASE_FOR_THE_LINEAGE.to_owned(),
				}),
			};
			if let Some(error) = refused {
				announce(&app, Some(scope), AgentEvent::Failed { error });
			}
		});
	}

	fn record_writes(&self) {
		let app = self.app.clone();
		let scope = self.scope.clone();
		let live = self.live.clone();
		tauri::async_runtime::spawn(async move {
			for (bundle, evolved) in evolutions(&app, &scope).await {
				if !live.holds(&scope) {
					return;
				}
				if let Some(event) = evolution_announced(bundle, evolved) {
					announce(&app, Some(scope.clone()), event);
				}
			}
		});
	}
}

fn evolution_announced(bundle: EvolvedBundle, evolved: bundles::Evolved) -> Option<AgentEvent> {
	match evolved {
		bundles::Evolved::Unchanged => None,
		bundles::Evolved::Recorded(evolution) => Some(AgentEvent::BotEvolved {
			bundle,
			commit_id: evolution.commit_id,
			title: evolution.title,
		}),
		bundles::Evolved::Failed(error) => {
			Some(AgentEvent::BotEvolutionFailed { bundle, detail: error.message().to_owned() })
		}
	}
}

async fn evolutions<R: Runtime>(
	app: &AppHandle<R>,
	scope: &RuntimeScope,
) -> Vec<(EvolvedBundle, bundles::Evolved)> {
	let mut announced = Vec::new();
	if let Some(path) = bundles::user::laid_down(app) {
		announced.push((EvolvedBundle::User, bundles::user::evolve(&path)));
	}
	let Some(database) = bot_database(app) else {
		return announced;
	};
	let Ok(Some(bot)) = database.conversations().bot(scope.bot_id.clone()).await else {
		return announced;
	};
	if let Ok(space_id) =
		space_of_the_conversation(database, &scope.conversation_id, &scope.bot_id).await
	{
		if let Some(path) = bundles::space::laid_down(app, &space_id) {
			announced.push((EvolvedBundle::Space, bundles::space::evolve(&path)));
		}
	}
	let Some(root) = bundles::root(app) else {
		return announced;
	};
	let evolved = bundles::evolve(&root, &bot);
	if matches!(evolved, bundles::Evolved::Recorded(_)) {
		reconcile_bot(database, &root, &bot).await;
	}
	announced.push((EvolvedBundle::Bot, evolved));
	announced
}

const NO_DATABASE_FOR_THE_LINEAGE: &str =
	"the provider session id could not be recorded without the store";

async fn record_its_own_provider_session(
	database: &db::Database,
	scope: &RuntimeScope,
	provider_session_id: String,
) -> Result<(), TransportError> {
	database
		.runtime_context()
		.record_provider_session(
			participant_key(scope),
			scope.runtime_session_id.clone(),
			provider_session_id,
		)
		.await
		.map_err(|error| TransportError::WriteFailed {
			detail: format!("the provider session id could not be recorded: {error:?}"),
		})
}

fn bot_database<R: Runtime>(app: &AppHandle<R>) -> Option<&db::Database> {
	app.try_state::<db::DatabaseState>()?.inner().as_ref().ok()
}

pub(crate) async fn reconcile_bot(database: &db::Database, root: &Path, bot: &StoredBot) {
	if let Some(found) = bundles::adopted(root, bot) {
		let _ = database.conversations().adopt_instructions(bot.id.clone(), found).await;
	}
	if let Some(learned) = bundles::adopted_memory(root, bot) {
		let _ = database.conversations().adopt_memory(bot.id.clone(), learned).await;
	}
}

pub(crate) fn learned_block(root: &Path, bot_id: &str) -> Option<String> {
	bundles::generated(root, bot_id).map(|written| written.memory)
}

pub(crate) async fn store_a_changed_block(
	database: &db::Database,
	root: &Path,
	bot_id: &str,
	held: Option<String>,
) -> Result<(), ConversationError> {
	let Some(changed) =
		learned_block(root, bot_id).filter(|changed| held.as_ref() != Some(changed))
	else {
		return Ok(());
	};
	database.conversations().adopt_memory(bot_id.to_owned(), changed).await
}

#[derive(Default)]
struct Gate {
	quitting: bool,
	busy: HashSet<RunKey>,
}

pub struct AgentState {
	gate: std::sync::Mutex<Gate>,
	live: Arc<Live>,
	sidecar: Mutex<Option<Arc<Sidecar>>>,
	models: Catalogue<OfferedModel>,
	tools: Catalogue<String>,
	host_writes: Arc<HostWrites>,
	host_turns: HostTurns,
	lease: RunLease,
}

struct Catalogue<Item> {
	command: &'static str,
	computed: Mutex<Option<ComputedCatalogue<Item>>>,
}

struct ComputedCatalogue<Item> {
	source: Values,
	list: Vec<Item>,
}

impl Default for AgentState {
	fn default() -> Self {
		Self {
			gate: std::sync::Mutex::default(),
			live: Arc::default(),
			sidecar: Mutex::default(),
			models: Catalogue::of(protocol::MODELS),
			tools: Catalogue::of(protocol::TOOLS),
			host_writes: Arc::default(),
			host_turns: HostTurns::default(),
			lease: RunLease::default(),
		}
	}
}

impl<Item: Clone> Catalogue<Item> {
	fn of(command: &'static str) -> Self {
		Self { command, computed: Mutex::default() }
	}

	async fn held(&self, connection: &Values) -> Option<Vec<Item>> {
		let computed = self.computed.lock().await;
		computed.as_ref().filter(|held| &held.source == connection).map(|held| held.list.clone())
	}

	async fn served<Computing>(
		&self,
		connection: &Values,
		computing: impl FnOnce() -> Computing,
	) -> Vec<Item>
	where
		Computing: std::future::Future<Output = Vec<Item>>,
	{
		let mut computed = self.computed.lock().await;
		if let Some(held) = computed.as_ref().filter(|held| &held.source == connection) {
			return held.list.clone();
		}
		let list = computing().await;
		*computed = match list.is_empty() {
			true => None,
			false => Some(ComputedCatalogue { source: connection.clone(), list: list.clone() }),
		};
		list
	}
}

impl AgentState {
	pub fn leasing(lease: RunLease) -> Self {
		Self { lease, ..Self::default() }
	}

	pub fn host_writes(&self) -> &HostWrites {
		&self.host_writes
	}

	pub(crate) fn host_turns(&self) -> &HostTurns {
		&self.host_turns
	}

	pub fn live_session_count(&self) -> usize {
		self.live.report().len()
	}

	fn claim(&self, scope: &RuntimeScope) -> Result<Claim<'_>, TransportError> {
		let mut gate = self.gate.lock().expect("gate");
		let run = run_key(scope);
		if gate.quitting || !gate.busy.insert(run.clone()) {
			return Err(TransportError::TransitionInProgress);
		}
		Ok(Claim { state: self, run })
	}

	fn enter_quit(&self) {
		self.gate.lock().expect("gate").quitting = true;
	}

	pub async fn sidecar(&self) -> Result<Arc<Sidecar>, TransportError> {
		let mut slot = self.sidecar.lock().await;
		if let Some(running) = slot.as_ref().filter(|running| running.is_live()) {
			return Ok(running.clone());
		}
		let started = Sidecar::start(SidecarOptions::new(sidecar::resolve()?)).await?;
		*slot = Some(started.clone());
		Ok(started)
	}

	async fn take_sidecar(&self) -> Option<Arc<Sidecar>> {
		self.sidecar.lock().await.take()
	}

	async fn offered<Item: Clone + DeserializeOwned>(
		&self,
		catalogue: &Catalogue<Item>,
		connection: &Values,
	) -> Vec<Item> {
		catalogue
			.served(connection, || async {
				let Ok(sidecar) = self.sidecar().await else {
					return Vec::new();
				};
				let Ok(offered) = sidecar.offered(catalogue.command, connection).await else {
					return Vec::new();
				};
				offered
			})
			.await
	}

	async fn title(&self, text: &str, connection: &Values) -> Option<ConversationNaming> {
		let sidecar = self.sidecar().await.ok()?;
		sidecar.title(text, connection).await.ok().flatten()
	}
}

struct Claim<'a> {
	state: &'a AgentState,
	run: RunKey,
}

impl Drop for Claim<'_> {
	fn drop(&mut self) {
		self.state.gate.lock().expect("gate").busy.remove(&self.run);
	}
}

fn stale(scope: &RuntimeScope) -> TransportError {
	TransportError::StaleRuntimeSession { runtime_session_id: scope.runtime_session_id.clone() }
}

#[tauri::command]
#[specta::specta]
pub async fn agent_models<R: Runtime>(app: AppHandle<R>) -> Vec<OfferedModel> {
	let state = app.state::<AgentState>();
	state.offered(&state.models, &held_connection(&app)).await
}

pub async fn supported_effort_levels<R: Runtime>(
	app: &AppHandle<R>,
	model: &str,
) -> Option<Vec<bundles::EffortLevel>> {
	let state = app.try_state::<AgentState>()?;
	let offered = state.models.held(&held_connection(app)).await?;
	offered
		.into_iter()
		.find(|offered| offered.value == model)
		.map(|offered| offered.supported_effort_levels)
}

#[tauri::command]
#[specta::specta]
pub async fn agent_tools<R: Runtime>(app: AppHandle<R>) -> Vec<String> {
	let state = app.state::<AgentState>();
	state.offered(&state.tools, &held_connection(&app)).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_title<R: Runtime>(
	app: AppHandle<R>,
	text: String,
) -> Option<ConversationNaming> {
	app.state::<AgentState>().title(&text, &held_connection(&app)).await
}

pub(crate) fn held_connection<R: Runtime>(app: &AppHandle<R>) -> Values {
	let Some(root) = environment::root(app) else {
		return Values::new();
	};
	held_and_redacted(&root).unwrap_or_else(|failure| {
		log::warn!("{ENV_UNREADABLE}: {failure:?}");
		Values::new()
	})
}

pub(crate) fn held_and_redacted(root: &Path) -> Result<Values, EnvError> {
	let held = connection::held(root)?;
	logging::scrub::remember_env_values(held.values());
	Ok(held)
}

#[tauri::command]
#[specta::specta]
pub async fn agent_check<R: Runtime>(
	app: AppHandle<R>,
	scope: Option<RuntimeScope>,
) -> CheckReport {
	announce(
		&app,
		scope.clone(),
		AgentEvent::ConnectionChanged { state: ConnectionState::Checking },
	);
	let env_root = environment::root(&app);
	let report = check(app.state::<AgentState>().inner(), env_root.as_deref()).await;
	announce(&app, scope, AgentEvent::ConnectionChanged { state: report.connection });
	report
}

#[tauri::command]
#[specta::specta]
pub async fn agent_account<R: Runtime>(app: AppHandle<R>) -> AccountReport {
	announce(&app, None, AgentEvent::ConnectionChanged { state: ConnectionState::Checking });
	let env_root = environment::root(&app);
	let read = account(app.state::<AgentState>().inner(), env_root.as_deref()).await;
	announce(&app, None, AgentEvent::ConnectionChanged { state: read.report.connection });
	read
}

pub async fn check(state: &AgentState, env_root: Option<&Path>) -> CheckReport {
	let (binary_version, probe) = probed(state, env_root).await;
	reported(binary_version, probe)
}

pub async fn account(state: &AgentState, env_root: Option<&Path>) -> AccountReport {
	let (binary_version, probe) = probed(state, env_root).await;
	let account = probe.as_ref().ok().and_then(|checked| checked.account.clone());
	AccountReport { report: reported(binary_version, probe), account }
}

async fn probed(
	state: &AgentState,
	env_root: Option<&Path>,
) -> (Option<String>, Result<Checked, TransportError>) {
	let sidecar = match state.sidecar().await {
		Ok(sidecar) => sidecar,
		Err(error) => return (None, Err(error)),
	};
	let version = sidecar.version().to_owned();
	let connection = match env_root.map(held_and_redacted).transpose() {
		Ok(held) => held.unwrap_or_default(),
		Err(error) => {
			let detail = format!("{ENV_UNREADABLE}: {error:?}");
			return (Some(version), Err(TransportError::AuthCheckFailed { detail }));
		}
	};
	(Some(version), sidecar.checked(&connection).await)
}

fn reported(binary_version: Option<String>, probe: Result<Checked, TransportError>) -> CheckReport {
	let (auth_method, error) = match probe {
		Ok(checked) if checked.authenticated => (checked.auth_method, None),
		Ok(checked) => (checked.auth_method, Some(TransportError::NotAuthenticated)),
		Err(error) => (None, Some(error)),
	};
	CheckReport {
		connection: match error {
			None => ConnectionState::Ready,
			Some(_) => ConnectionState::Unavailable,
		},
		binary_version,
		authenticated: error.is_none(),
		auth_method,
		error,
	}
}

struct RuntimeIdentity {
	bundle: Bundle,
	server_env: ResolvedEnv,
	space_id: String,
}

struct ResolvedRun {
	bot: StoredBot,
	space_id: String,
	root: PathBuf,
}

const DATABASE_UNREACHED: &str = "the database could not be reached";
const ROW_MISSING: &str = "its row is missing";
const ROW_UNREADABLE: &str = "its row could not be read";
const SPACE_UNRESOLVED: &str = "the space of the conversation could not be resolved";
const ROOT_UNRESOLVED: &str = "the bundle root could not be resolved";

pub const ENV_UNREADABLE: &str = "the environment store could not be read";

async fn served_environment<R: Runtime>(
	app: &AppHandle<R>,
	sidecar: &Sidecar,
	bot_id: &str,
	space_id: &str,
	serving: &[PathBuf],
) -> ResolvedEnv {
	let Some(root) = environment::root(app) else {
		return ResolvedEnv::failed(ENV_UNREADABLE);
	};
	let owner = EnvOwner::Bot { id: bot_id.to_owned(), space_id: space_id.to_owned() };
	let needs_authorization = refresh::before_open(&root, &owner, serving, sidecar).await;
	let resolved = environment::resolve(&root, &owner);
	if let Ok(served) = &resolved {
		redacted_from_the_log(served);
	}
	awaiting_served(resolved, needs_authorization)
}

fn redacted_from_the_log(served: &ResolvedEnv) {
	let per_server = served.per_server.values().flat_map(|own| own.values());
	logging::scrub::remember_env_values(served.base.values().chain(per_server));
}

fn awaiting_served(
	resolved: Result<ResolvedEnv, EnvError>,
	needs_authorization: BTreeSet<String>,
) -> ResolvedEnv {
	let resolved = resolved.unwrap_or_else(|_| ResolvedEnv::failed(ENV_UNREADABLE));
	ResolvedEnv { needs_authorization, ..resolved }
}

async fn runtime_identity<R: Runtime>(
	app: &AppHandle<R>,
	state: &db::DatabaseState,
	scope: &RuntimeScope,
	sidecar: &Sidecar,
) -> Result<RuntimeIdentity, TransportError> {
	let database = state.as_ref().map_err(|failure| {
		identity_refused(&scope.bot_id, &format!("{DATABASE_UNREACHED}: {failure:?}"))
	})?;
	let LaidDownSession { bundle, space_id, serving } =
		laid_down_session(app, database, scope).await?;
	let server_env = served_environment(app, sidecar, &scope.bot_id, &space_id, &serving).await;
	Ok(RuntimeIdentity { bundle, server_env, space_id })
}

pub(crate) struct LaidDownSession {
	bundle: Bundle,
	space_id: String,
	serving: Vec<PathBuf>,
}

pub(crate) async fn laid_down_session<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	scope: &RuntimeScope,
) -> Result<LaidDownSession, TransportError> {
	let _memory = bundles::holding_the_memory(&scope.bot_id).await;
	let ResolvedRun { bot, space_id, root } =
		resolved_run(database, bundles::root(app), scope).await?;
	let system = bundles::system::laid_down(app);
	let user = bundles::user::laid_down(app);
	let space = bundles::space::laid_down(app, &space_id);
	let permissions = settled_permissions(database, Some(&root), &bot).await;
	let bundle = laid_down_bundle(
		&root,
		&bot,
		&permissions,
		system.as_deref(),
		user.as_deref(),
		space.as_deref(),
	)
	.map_err(unavailable_bundle)?;
	reconcile_bot(database, &root, &bot).await;
	let serving: Vec<PathBuf> =
		[system, user, space, Some(PathBuf::from(&bundle.path))].into_iter().flatten().collect();
	Ok(LaidDownSession { bundle, space_id, serving })
}

async fn resolved_run(
	database: &db::Database,
	root: Option<PathBuf>,
	scope: &RuntimeScope,
) -> Result<ResolvedRun, TransportError> {
	let refused = |step: String| identity_refused(&scope.bot_id, &step);
	let bot = match database.conversations().bot(scope.bot_id.clone()).await {
		Ok(Some(bot)) => bot,
		Ok(None) => return Err(refused(ROW_MISSING.to_owned())),
		Err(error) => return Err(refused(format!("{ROW_UNREADABLE}: {error:?}"))),
	};
	let space_id = space_of_the_conversation(database, &scope.conversation_id, &scope.bot_id)
		.await
		.map_err(|error| refused(format!("{SPACE_UNRESOLVED}: {error:?}")))?;
	let root = root.ok_or_else(|| refused(ROOT_UNRESOLVED.to_owned()))?;
	Ok(ResolvedRun { bot, space_id, root })
}

fn unavailable_bundle(error: bundles::BundleUnavailable) -> TransportError {
	identity_refused(&error.bot_id, &format!("its bundle is unavailable: {}", error.cause))
}

fn identity_refused(bot_id: &str, step: &str) -> TransportError {
	let detail = format!("the session of bot {bot_id} did not start: {step}");
	log::warn!("{detail}");
	TransportError::SpawnFailed { detail }
}

async fn members_reading<R: Runtime>(
	app: &AppHandle<R>,
	state: &db::DatabaseState,
	space_id: &str,
) -> Vec<SpaceMember> {
	let Ok(database) = state.as_ref() else {
		return Vec::new();
	};
	authorship::members_of(app, database, space_id).await.unwrap_or_else(|failure| {
		log::warn!("the members of space {space_id} were not named to a session: {failure:?}");
		Vec::new()
	})
}

async fn opens_on_a_mission_thread(state: &db::DatabaseState, conversation_id: &str) -> bool {
	let Ok(database) = state.as_ref() else {
		return false;
	};
	matches!(
		database.conversations().kind(conversation_id.to_owned()).await,
		Ok(Some(kind)) if kind == MISSION_KIND
	)
}

async fn settled_permissions(
	database: &db::Database,
	root: Option<&Path>,
	bot: &StoredBot,
) -> bundles::BotPermissions {
	if let Some(stored) = bot.permissions.clone() {
		return stored;
	}
	let carried = root
		.and_then(|root| bundles::permissions(root, &bot.id))
		.unwrap_or_else(|| bundles::BotPermissions::unruled_like(&bot.denied_tools));
	let _ = database.conversations().adopt_permissions(bot.id.clone(), carried.clone()).await;
	carried
}

fn laid_down_bundle(
	root: &Path,
	bot: &StoredBot,
	permissions: &bundles::BotPermissions,
	system: Option<&Path>,
	user: Option<&Path>,
	space: Option<&Path>,
) -> Result<Bundle, bundles::BundleUnavailable> {
	bundles::set_permissions(root, bot, permissions)
		.map_err(|cause| bundles::BundleUnavailable { bot_id: bot.id.clone(), cause })?;
	let held = bundles::ensure(root, bot)?;
	Ok(Bundle {
		path: held.to_string_lossy().into_owned(),
		system_path: system.map(|path| path.to_string_lossy().into_owned()),
		user_path: user.map(|path| path.to_string_lossy().into_owned()),
		space_path: space.map(|path| path.to_string_lossy().into_owned()),
		agent: bundles::agent_ref(bot),
		identity: bundles::identity(bot),
		output_style: bundles::output_style(root, &bot.id),
		settings_path: bundles::settings_file(root, &bot.id)
			.map(|path| path.to_string_lossy().into_owned()),
	})
}

fn its_own_directory<R: Runtime>(app: &AppHandle<R>, bot_id: &str) -> PathBuf {
	app.path()
		.app_data_dir()
		.map_or_else(|_| std::env::temp_dir(), |app_data| reserved_directory(app_data, bot_id))
}

fn reserved_directory(app_data: PathBuf, bot_id: &str) -> PathBuf {
	let mine = app_data.join(RUNS_DIR).join(bot_id);
	if private_files::create_dir(&mine).is_ok() {
		mine
	} else {
		app_data
	}
}

#[tauri::command]
#[specta::specta]
pub async fn agent_start_or_resume_session<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, AgentState>,
	database: State<'_, db::DatabaseState>,
	scope: RuntimeScope,
	resume: Option<String>,
	cwd: Option<String>,
	output_schema: Option<JsonValue>,
) -> Result<SessionHandle, TransportError> {
	let output_schema = output_schema.map(JsonValue::into);
	let _claim = state.claim(&scope)?;

	let admitted = state.live.take_over(scope.clone());
	let lineage_is_held_elsewhere = resume.is_some() && !admitted.keeps_lineage;
	let resume = admitted.resume(resume);
	if let Some(previous) = admitted.replaced {
		previous.shutdown().await;
	}

	let sidecar = state.sidecar().await?;
	let mission_thread = opens_on_a_mission_thread(&database, &scope.conversation_id).await;
	let running_in =
		cwd.map(PathBuf::from).unwrap_or_else(|| its_own_directory(&app, &scope.bot_id));

	let announcing: Arc<dyn TurnSink> = Arc::new(RunSink {
		app: app.clone(),
		scope: scope.clone(),
		live: state.live.clone(),
		records_its_own_lineage: lineage_is_held_elsewhere,
	});
	let attachments = Arc::new(TurnAttachments::default());
	let sink: Arc<dyn EventSink> = Arc::new(ReplyWriter::spawn(
		app.clone(),
		&scope,
		state.host_writes.clone(),
		attachments.clone(),
		announcing,
	));
	let identity = match runtime_identity(&app, &database, &scope, &sidecar).await {
		Ok(identity) => identity,
		Err(error) => return Err(refused(sink.as_ref(), error)),
	};
	let members = members_reading(&app, &database, &identity.space_id).await;
	let options = SessionOptions::new(running_in)
		.bundled(Some(identity.bundle))
		.serving(identity.server_env)
		.connected(held_connection(&app))
		.with_app_data(app.path().app_data_dir().ok())
		.in_conversation(scope.conversation_id.clone())
		.hosting(hosted(RoutineHost::new(
			app.clone(),
			scope.conversation_id.clone(),
			scope.bot_id.clone(),
		)))
		.hosting(hosted(MissionHost::new(
			app.clone(),
			scope.conversation_id.clone(),
			scope.bot_id.clone(),
		)))
		.hosting(hosted(CompanionHost::new(
			app.clone(),
			scope.conversation_id.clone(),
			scope.bot_id.clone(),
			attachments,
		)))
		.hosting(hosted(StandingHost::new(
			app.clone(),
			scope.bot_id.clone(),
			Some(identity.space_id),
		)))
		.hosting(hosted(ApplicationHost::new(
			app.clone(),
			scope.conversation_id.clone(),
			scope.bot_id.clone(),
		)))
		.hosting(hosted(BundleHost::new(app.clone(), scope.clone())))
		.answering(output_schema)
		.on_mission_thread(mission_thread)
		.read_by(members)
		.leased(state.lease);

	let refused_id = resume.clone();
	let started = match start_with_fallback(sidecar, options, resume, sink.clone()).await {
		Ok(started) => started,
		Err(error) => return Err(refused(sink.as_ref(), error)),
	};

	if lineage_is_held_elsewhere {
		sink.emit(AgentEvent::Failed {
			error: TransportError::ResumeFailed { forgot_session_id: false },
		});
	}

	if let Some(refusal) = &started.resume_refusal {
		let forgot_session_id =
			forget_the_id_a_refusal_blames(&database, &scope, refused_id, refusal).await;
		sink.emit(AgentEvent::Failed { error: TransportError::ResumeFailed { forgot_session_id } });
	}

	let session = Arc::new(started.session);
	let handle = SessionHandle { resumed: session.resumed() };
	if !state.live.install(&scope, session.clone()) {
		session.shutdown().await;
		return Err(TransportError::TransitionInProgress);
	}
	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Ready });
	Ok(handle)
}

fn refused(sink: &dyn EventSink, error: TransportError) -> TransportError {
	sink.emit(AgentEvent::ConnectionChanged { state: ConnectionState::Unavailable });
	sink.emit(AgentEvent::Failed { error: error.clone() });
	error
}

async fn forget_the_id_a_refusal_blames(
	state: &db::DatabaseState,
	scope: &RuntimeScope,
	refused_id: Option<String>,
	refusal: &TransportError,
) -> bool {
	if !matches!(refusal, TransportError::Crashed { .. }) {
		return false;
	}
	let (Ok(database), Some(refused_id)) = (state.as_ref(), refused_id) else {
		return true;
	};
	let _ = database
		.runtime_context()
		.forget_provider_session(participant_key(scope), refused_id)
		.await;
	true
}

pub struct Started {
	pub session: Session,
	pub resume_refusal: Option<TransportError>,
}

pub async fn start_with_fallback(
	sidecar: Arc<Sidecar>,
	options: SessionOptions,
	resume: Option<String>,
	sink: Arc<dyn EventSink>,
) -> Result<Started, TransportError> {
	if resume.is_none() {
		let session = Session::start(sidecar, options, sink).await?;
		return Ok(Started { session, resume_refusal: None });
	}

	let gated = Arc::new(GatedSink::new(sink.clone()));
	let resuming = Session::start(sidecar.clone(), options.clone().resuming(resume), gated.clone());
	let refusal = match resuming.await {
		Ok(session) => {
			gated.promote();
			return Ok(Started { session, resume_refusal: None });
		}
		Err(error) => error,
	};

	gated.discard();
	let session = Session::start(sidecar, options, sink).await?;
	Ok(Started { session, resume_refusal: Some(refusal) })
}

#[tauri::command]
#[specta::specta]
pub async fn agent_submit_prompt(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	text: String,
	turn: Option<SubmittedTurn>,
) -> Result<(), TransportError> {
	let turn_id = turn.as_ref().map(|handed| handed.turn_id.clone());
	state.live.session_for(&scope)?.submit(&text, turn).await?;
	if let Some(turn_id) = turn_id {
		state.host_writes.record_submitted(&turn_id);
	}
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_cancel_turn<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, AgentState>,
	scope: RuntimeScope,
) -> Result<CancelOutcome, TransportError> {
	if let Some(outcome) = state.host_turns().stop(&scope).await {
		return Ok(outcome);
	}
	Ok(cancel_session_turn(&app, &state, &scope).await)
}

pub(crate) async fn cancel_session_turn<R: Runtime>(
	app: &AppHandle<R>,
	state: &AgentState,
	scope: &RuntimeScope,
) -> CancelOutcome {
	let interrupted = match state.live.session_for(scope) {
		Ok(session) => session.cancel_turn().await,
		Err(refused) => Err(refused),
	};
	match interrupted {
		Ok(()) => CancelOutcome::Cancelled,
		Err(TransportError::NoActiveTurn | TransportError::NotStarted) => {
			match close_stored_runs(app, &state.host_writes, scope).await {
				Ok(0) => CancelOutcome::NothingToCancel,
				Ok(_) => CancelOutcome::Cancelled,
				Err(error) => {
					CancelOutcome::failed(&scope.bot_id, CancelFailureReason::Store(error))
				}
			}
		}
		Err(error) => CancelOutcome::failed(&scope.bot_id, CancelFailureReason::Session(error)),
	}
}

async fn close_stored_runs<R: Runtime>(
	app: &AppHandle<R>,
	owned: &HostWrites,
	scope: &RuntimeScope,
) -> Result<usize, TranscriptStoreError> {
	let Some(state) = app.try_state::<db::DatabaseState>() else {
		return Err(TranscriptStoreError::Unavailable {
			failure: (&db::DatabaseError::AppDataDir).into(),
		});
	};
	let database = ready(state.inner())?;
	let conversation_id = &scope.conversation_id;
	let has_completed = complete_unsubmitted_turns(database, owned, conversation_id).await?;
	let closed = database
		.messages()
		.cancel_open_runs(conversation_id.clone(), scope.bot_id.clone(), now_ms())
		.await?;
	if closed > 0 {
		announce(app, Some(scope.clone()), ended_as(TurnOutcome::Cancelled));
	}
	if has_completed || closed > 0 {
		announce_conversation(app, database, CONVERSATION_UPDATED, conversation_id).await;
	}
	Ok(closed)
}

async fn complete_unsubmitted_turns(
	database: &db::Database,
	owned: &HostWrites,
	conversation_id: &str,
) -> Result<bool, TranscriptStoreError> {
	let messages = database.messages();
	let mut has_completed = false;
	for id in messages.open_turns_without_reply(conversation_id.to_owned()).await? {
		if owned.owns_turn(&id) && !owned.was_submitted(&id) {
			messages.complete_turn(id, now_ms()).await?;
			has_completed = true;
		}
	}
	Ok(has_completed)
}

#[tauri::command]
#[specta::specta]
pub async fn agent_respond_to_permission(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	id: String,
	decision: PermissionDecision,
) -> Result<(), TransportError> {
	state.live.session_for(&scope)?.respond_to_permission(&id, decision).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_answer_question(
	state: State<'_, AgentState>,
	scope: RuntimeScope,
	id: String,
	answers: HashMap<String, String>,
	annotations: Option<JsonValue>,
) -> Result<(), TransportError> {
	let annotations = annotations.map(JsonValue::into);
	state.live.session_for(&scope)?.answer_question(&id, answers, annotations).await
}

#[tauri::command]
#[specta::specta]
pub async fn agent_live_sessions(
	state: State<'_, AgentState>,
) -> Result<Vec<LiveSession>, TransportError> {
	Ok(state.live.report())
}

#[tauri::command]
#[specta::specta]
pub async fn agent_live_sessions_in_space(
	state: State<'_, AgentState>,
	database: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<LiveSession>, TranscriptStoreError> {
	let children = ready(&database)?.space_children();
	let mut in_the_space = Vec::new();
	for session in state.live.report() {
		let conversation_id = session.conversation_id.clone();
		if children.holds(space_id.clone(), SpaceChild::Conversation, conversation_id).await? {
			in_the_space.push(session);
		}
	}
	Ok(in_the_space)
}

#[tauri::command]
#[specta::specta]
pub async fn agent_pending_questions(
	state: State<'_, AgentState>,
	conversation_id: String,
) -> Result<Vec<ScopedEvent>, TransportError> {
	Ok(state.live.questions_in(&conversation_id))
}

pub async fn shutdown_session(state: &AgentState, scope: &RuntimeScope) {
	let session = state.live.clear(scope);
	if let Some(session) = session {
		session.shutdown().await;
	}
}

pub async fn terminate_session(state: &AgentState) {
	state.enter_quit();
	let ending: Vec<_> = state
		.live
		.clear_all()
		.into_iter()
		.map(|session| tauri::async_runtime::spawn(async move { session.shutdown().await }))
		.collect();
	for termination in ending {
		let _ = termination.await;
	}
	if let Some(sidecar) = state.take_sidecar().await {
		sidecar.terminate().await;
	}
	sidecar::sweep_live_groups();
}

#[tauri::command]
#[specta::specta]
pub async fn agent_shutdown<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, AgentState>,
	scope: RuntimeScope,
) -> Result<(), TransportError> {
	let _claim = state.claim(&scope)?;
	if state.live.is_foreign(&scope) {
		return Err(stale(&scope));
	}
	shutdown_session(&state, &scope).await;
	announce(&app, Some(scope), AgentEvent::ConnectionChanged { state: ConnectionState::Checking });
	Ok(())
}

#[cfg(test)]
pub(crate) fn a_live_run<R: Runtime>(app: &AppHandle<R>, scope: RuntimeScope) -> impl TurnSink {
	let live = Arc::new(Live::default());
	live.take_over(scope.clone());
	RunSink { app: app.clone(), scope, live, records_its_own_lineage: false }
}

#[cfg(test)]
pub(crate) fn a_run_held_by_the_app<R: Runtime>(
	app: &AppHandle<R>,
	scope: RuntimeScope,
) -> impl TurnSink {
	if app.try_state::<AgentState>().is_none() {
		app.manage(AgentState::default());
	}
	let live = app.state::<AgentState>().live.clone();
	live.take_over(scope.clone());
	RunSink { app: app.clone(), scope, live, records_its_own_lineage: false }
}

#[cfg(test)]
pub(crate) fn a_host_wide_announce<R: Runtime>(app: &AppHandle<R>, event: AgentEvent) {
	announce(app, None, event);
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::repositories::runtime_context::RuntimeSessionStatus;
	use crate::removed_on_drop::RemovedOnDrop;

	#[test]
	fn a_bundle_git_refused_is_announced_as_its_own_failure_and_not_as_a_failed_turn() {
		let announced = evolution_announced(
			EvolvedBundle::Space,
			bundles::Evolved::Failed(git2::Error::from_str("the objects are read-only")),
		);

		assert_eq!(
			announced,
			Some(AgentEvent::BotEvolutionFailed {
				bundle: EvolvedBundle::Space,
				detail: "the objects are read-only".to_owned(),
			})
		);
	}

	#[test]
	fn a_bundle_left_alone_announces_nothing_and_a_recorded_one_announces_its_commit() {
		assert_eq!(evolution_announced(EvolvedBundle::Bot, bundles::Evolved::Unchanged), None);
		let recorded = bundles::Evolved::Recorded(bundles::Evolution {
			commit_id: "abc".to_owned(),
			title: "Bean learned about figs".to_owned(),
		});

		assert_eq!(
			evolution_announced(EvolvedBundle::User, recorded),
			Some(AgentEvent::BotEvolved {
				bundle: EvolvedBundle::User,
				commit_id: "abc".to_owned(),
				title: "Bean learned about figs".to_owned(),
			})
		);
	}

	fn a_source(name: &str, value: &str) -> Values {
		Values::from([(name.to_owned(), value.to_owned())])
	}

	async fn computed(
		catalogue: &Catalogue<String>,
		connection: &Values,
		asks: &std::sync::atomic::AtomicUsize,
		list: &[&str],
	) -> Vec<String> {
		catalogue
			.served(connection, || async {
				asks.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
				list.iter().map(|named| (*named).to_owned()).collect()
			})
			.await
	}

	#[tokio::test]
	async fn a_catalogue_is_computed_again_once_the_held_source_changes() {
		let catalogue = Catalogue::of(protocol::MODELS);
		let asks = std::sync::atomic::AtomicUsize::new(0);
		let key = a_source("ANTHROPIC_API_KEY", "sk-held");
		let token = a_source("CLAUDE_CODE_OAUTH_TOKEN", "held-token");

		assert_eq!(computed(&catalogue, &key, &asks, &["quasar"]).await, ["quasar"]);
		assert_eq!(computed(&catalogue, &token, &asks, &["nimbus"]).await, ["nimbus"]);
		assert_eq!(asks.load(std::sync::atomic::Ordering::Relaxed), 2);

		assert_eq!(computed(&catalogue, &token, &asks, &["never asked"]).await, ["nimbus"]);
		assert_eq!(
			asks.load(std::sync::atomic::Ordering::Relaxed),
			2,
			"the sidecar was asked for a list already computed with that source"
		);
	}

	#[tokio::test]
	async fn an_empty_list_is_computed_again_on_the_next_ask() {
		let catalogue = Catalogue::of(protocol::MODELS);
		let asks = std::sync::atomic::AtomicUsize::new(0);
		let nothing_held = Values::new();

		assert!(computed(&catalogue, &nothing_held, &asks, &[]).await.is_empty());
		assert_eq!(computed(&catalogue, &nothing_held, &asks, &["quasar"]).await, ["quasar"]);
		assert_eq!(asks.load(std::sync::atomic::Ordering::Relaxed), 2);
	}

	#[test]
	fn the_names_awaiting_authorization_reach_the_session_when_the_store_cannot_be_read() {
		let awaiting = BTreeSet::from(["granola".to_owned()]);

		let served = awaiting_served(
			Err(EnvError::Unreadable { detail: "the disk is gone".to_owned() }),
			awaiting.clone(),
		);

		assert_eq!(served.needs_authorization, awaiting);
		assert_eq!(served.failure.as_deref(), Some(ENV_UNREADABLE));
	}

	#[test]
	fn the_names_awaiting_authorization_ride_a_store_that_was_read() {
		let awaiting = BTreeSet::from(["granola".to_owned()]);

		let served = awaiting_served(Ok(ResolvedEnv::default()), awaiting.clone());

		assert_eq!(served.needs_authorization, awaiting);
		assert_eq!(served.failure, None);
	}

	fn a_fresh_app_data(name: &str) -> RemovedOnDrop {
		let app_data = RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-app-data-{name}")));
		let _ = std::fs::remove_dir_all(&app_data);
		std::fs::create_dir_all(&app_data).expect("the app data directory is there");
		app_data
	}

	#[test]
	fn a_bot_with_no_directory_runs_in_one_reserved_for_it_inside_the_app_data() {
		let app_data = a_fresh_app_data("reserved");

		let running_in = reserved_directory(app_data.to_path_buf(), "bot-a");

		assert_eq!(running_in, app_data.join(RUNS_DIR).join("bot-a"));
		assert!(running_in.is_dir(), "the reserved directory was not created");
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	#[test]
	fn two_bots_with_no_directory_never_share_one() {
		let app_data = a_fresh_app_data("distinct");

		let first = reserved_directory(app_data.to_path_buf(), "bot-a");
		let second = reserved_directory(app_data.to_path_buf(), "bot-b");

		assert_ne!(first, second);
		assert!(first.is_dir() && second.is_dir());
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	#[test]
	fn a_reserved_directory_that_cannot_be_created_falls_back_to_the_app_data() {
		let app_data = a_fresh_app_data("blocked");
		std::fs::write(app_data.join(RUNS_DIR), b"i am a file").expect("the file is written");

		let running_in = reserved_directory(app_data.to_path_buf(), "bot-a");

		assert_eq!(running_in, *app_data);
		std::fs::remove_dir_all(&app_data).expect("cleanup");
	}

	fn a_stored_bot() -> StoredBot {
		StoredBot {
			id: "b1".to_owned(),
			section_id: None,
			pin_position: None,
			name: "Bean".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: "Answer briefly.".to_owned(),
			memory: String::new(),
			denied_tools: Vec::new(),
			permissions: None,
			created_at: 1,
			effort: None,
		}
	}

	fn a_fresh_bundle_root(name: &str) -> RemovedOnDrop {
		let root =
			RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-session-rules-{name}")));
		let _ = std::fs::remove_dir_all(&root);
		root
	}

	fn a_rule(allow: &str) -> bundles::BotPermissions {
		bundles::BotPermissions { allow: vec![allow.to_owned()], ..Default::default() }
	}

	fn a_settings_path(root: &Path, bot: &StoredBot) -> PathBuf {
		bundles::dir(root, &bot.id).expect("the bundle is held").join("settings.json")
	}

	fn what_the_bot_wrote(root: &Path, bot: &StoredBot, allow: &str) {
		private_files::replace(
			&a_settings_path(root, bot),
			serde_json::json!({
				"env": { "TZ": "UTC" },
				"permissions": { "allow": [allow], "defaultMode": "acceptEdits" }
			})
			.to_string()
			.as_bytes(),
		)
		.expect("the settings file is written");
	}

	fn settings_of(root: &Path, bot: &StoredBot) -> serde_json::Value {
		let read = std::fs::read(a_settings_path(root, bot)).expect("the settings file is read");
		serde_json::from_slice(&read).expect("the settings file parses")
	}

	fn heard_refusal_of(error: TransportError) -> Vec<AgentEvent> {
		let (sink, mut heard) = tokio::sync::mpsc::unbounded_channel();
		refused(&sink, error);
		std::iter::from_fn(|| heard.try_recv().ok()).collect()
	}

	fn assert_refused_naming(error: TransportError, bot_id: &str, step: &str) {
		let heard = heard_refusal_of(error);
		assert_eq!(
			heard.first(),
			Some(&AgentEvent::ConnectionChanged { state: ConnectionState::Unavailable })
		);
		let Some(AgentEvent::Failed { error: TransportError::SpawnFailed { detail } }) =
			heard.get(1)
		else {
			panic!("no spawnFailed was heard: {heard:?}");
		};
		assert!(detail.contains(bot_id), "the bot is not named: {detail}");
		assert!(detail.contains(step), "the step is not named: {detail}");
	}

	async fn a_run_of_a_seated_bot(database: &crate::db::Database) -> RuntimeScope {
		let bot = database
			.conversations()
			.create_bot(a_stored_bot().into(), None, None)
			.await
			.expect("the bot");
		RuntimeScope { bot_id: bot.id, ..a_scope() }
	}

	#[tokio::test]
	async fn a_run_whose_bot_row_is_missing_is_refused_naming_the_step() {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let root = a_fresh_bundle_root("no-row");

		let Err(error) = resolved_run(&database, Some(root.to_path_buf()), &a_scope()).await else {
			panic!("a run with no bot row was resolved");
		};

		assert_refused_naming(error, &a_scope().bot_id, ROW_MISSING);
	}

	#[tokio::test]
	async fn a_run_whose_space_cannot_be_resolved_is_refused_naming_the_step() {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let scope = a_run_of_a_seated_bot(&database).await;
		database
			.call_mut(|connection| {
				Ok(connection.execute_batch("ALTER TABLE conversations RENAME TO unreadable")?)
			})
			.await
			.expect("the conversations are made unreadable");
		let root = a_fresh_bundle_root("no-space");

		let Err(error) = resolved_run(&database, Some(root.to_path_buf()), &scope).await else {
			panic!("a run with no readable space was resolved");
		};

		assert_refused_naming(error, &scope.bot_id, SPACE_UNRESOLVED);
	}

	#[tokio::test]
	async fn a_run_with_no_bundle_root_is_refused_naming_the_step() {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let scope = a_run_of_a_seated_bot(&database).await;

		let Err(error) = resolved_run(&database, None, &scope).await else {
			panic!("a run with no bundle root was resolved");
		};

		assert_refused_naming(error, &scope.bot_id, ROOT_UNRESOLVED);
	}

	#[test]
	fn a_session_start_on_a_bot_with_no_bundle_fails_by_name_and_lays_down_nothing() {
		let root = a_fresh_bundle_root("unbundled");
		std::fs::create_dir_all(root.join("plugins")).expect("the plugins directory stands");
		let bot = a_stored_bot();

		let refused = laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect_err("the session start is refused");

		assert_eq!(refused.bot_id, bot.id);
		assert_eq!(refused.cause.kind(), std::io::ErrorKind::NotFound);
		assert_eq!(std::fs::read_dir(root.join("plugins")).expect("the plugins list").count(), 0);
		assert!(matches!(
			unavailable_bundle(refused),
			TransportError::SpawnFailed { detail } if detail.contains(&bot.id)
		));
	}

	#[test]
	fn a_session_start_writes_the_stored_rules_over_the_ones_the_bot_gave_itself() {
		let root = a_fresh_bundle_root("replaced");
		let bot = a_stored_bot();
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");

		assert_eq!(bundles::permissions(&root, &bot.id), Some(a_rule("Read")));
		assert_eq!(
			settings_of(&root, &bot)["env"]["TZ"],
			serde_json::json!("UTC"),
			"a key the app does not own was rewritten"
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[test]
	fn a_session_start_that_changes_nothing_leaves_the_history_where_it_was() {
		let root = a_fresh_bundle_root("quiet");
		let bot = a_stored_bot();
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");
		let after_the_rewrite = bundles::history(&root, &bot.id).expect("the history reads").len();

		laid_down_bundle(&root, &bot, &a_rule("Read"), None, None, None)
			.expect("the bundle is laid down");

		assert_eq!(
			bundles::history(&root, &bot.id).expect("the history reads").len(),
			after_the_rewrite
		);

		let _ = std::fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn the_rules_a_bundle_carries_become_the_stored_ones_once() {
		let root = a_fresh_bundle_root("adopted");
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let bot = database
			.conversations()
			.create_bot(a_stored_bot().into(), None, None)
			.await
			.expect("the bot");
		bundles::write(&root, &bot).expect("the bundle is written");
		what_the_bot_wrote(&root, &bot, "Bash");

		let settled = settled_permissions(&database, Some(&root), &bot).await;
		assert_eq!(settled.allow, ["Bash"]);

		let held =
			database.conversations().bot(bot.id.clone()).await.expect("the bot").expect("a row");
		assert_eq!(held.permissions.as_ref(), Some(&settled));

		what_the_bot_wrote(&root, &bot, "Write");

		assert_eq!(
			settled_permissions(&database, Some(&root), &held).await.allow,
			["Bash"],
			"the file was adopted a second time"
		);

		drop(database);
		let _ = std::fs::remove_dir_all(&root);
		std::fs::remove_dir_all(&dir).expect("cleanup");
	}

	const REPLACED_SESSION: &str = "the session that was replaced";
	const REPLACEMENT_SESSION: &str = "the session that replaced it";

	fn a_scope() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c1".into(),
			bot_id: "b1".into(),
			runtime_session_id: "r1".into(),
			epoch: 1,
		}
	}

	fn the_next_run() -> RuntimeScope {
		RuntimeScope { runtime_session_id: "r2".into(), epoch: 2, ..a_scope() }
	}

	fn another_bots_run() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c2".into(),
			bot_id: "b2".into(),
			runtime_session_id: "r9".into(),
			epoch: 1,
		}
	}

	const ANOTHER_BOTS_SESSION: &str = "the session of the bot next door";

	fn a_run_named(runtime_session_id: &str) -> RuntimeScope {
		RuntimeScope { runtime_session_id: runtime_session_id.into(), ..a_scope() }
	}

	fn is_stale(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::StaleRuntimeSession { .. }))
	}

	fn is_unheld(outcome: &Result<&str, TransportError>) -> bool {
		matches!(outcome, Err(TransportError::NotStarted))
	}

	#[test]
	fn a_scope_differing_on_the_epoch_is_stale_and_one_naming_another_run_is_not_held() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));

		assert!(live.holds(&a_scope()), "the host stopped recognising the run it holds");
		assert!(!live.is_foreign(&a_scope()), "the live run was refused as somebody else's");

		let drifted = RuntimeScope { epoch: 2, ..a_scope() };
		assert!(live.is_foreign(&drifted), "a scope naming another epoch reached the run");
		assert!(!live.holds(&drifted), "a run the host never held was taken for it");
		assert!(
			is_stale(&live.session_for(&drifted)),
			"a scope naming another epoch was handed the session"
		);

		for other in [
			the_next_run(),
			another_bots_run(),
			RuntimeScope { bot_id: "b2".into(), runtime_session_id: "r3".into(), ..a_scope() },
		] {
			assert!(!live.holds(&other), "a run the host never held was taken for it: {other:?}");
			assert!(
				!live.is_foreign(&other),
				"a run the host never held was refused as a stale one: {other:?}"
			);
			assert!(
				is_unheld(&live.session_for(&other)),
				"a run the host never held was handed another's session: {other:?}"
			);
		}
	}

	#[test]
	fn two_runs_of_one_bot_are_held_at_the_same_time_and_only_the_first_keeps_the_lineage() {
		let live = Live::<&str>::default();

		let first = live.take_over(a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));
		let second = live.take_over(the_next_run());
		assert!(live.install(&the_next_run(), REPLACEMENT_SESSION));

		assert!(first.keeps_lineage, "the first instance of a bot was refused the lineage");
		assert!(
			second.replaced.is_none(),
			"a second instance handed back the first one's child to be shut down"
		);
		assert!(!second.keeps_lineage, "two instances of one bot both kept the lineage");
		assert_eq!(
			live.session_for(&a_scope()).ok(),
			Some(REPLACED_SESSION),
			"the first instance lost its session to the second one"
		);
		assert_eq!(live.session_for(&the_next_run()).ok(), Some(REPLACEMENT_SESSION));
		assert!(live.holds(&a_scope()) && live.holds(&the_next_run()));
	}

	#[test]
	fn a_run_started_again_under_its_own_id_hands_back_the_child_it_replaces() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		assert!(live.install(&a_scope(), REPLACED_SESSION));

		let again = live.take_over(a_scope());

		assert_eq!(
			again.replaced,
			Some(REPLACED_SESSION),
			"a restart of one run left its child behind"
		);
		assert!(again.keeps_lineage, "a run restarting under its own id was refused the lineage");
		assert!(
			is_unheld(&live.session_for(&a_scope())),
			"a restarted run answered with the child it replaced"
		);
	}

	#[test]
	fn the_lineage_comes_back_to_the_next_run_once_the_bot_holds_none() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		assert!(!live.take_over(the_next_run()).keeps_lineage);

		live.clear(&a_scope());
		live.clear(&the_next_run());

		assert!(
			live.take_over(a_scope()).keeps_lineage,
			"the lineage stayed with a run the host had let go"
		);
	}

	#[test]
	fn ten_runs_admitted_in_a_row_are_all_held_live() {
		let live = Live::<&str>::default();
		let runs: Vec<RuntimeScope> =
			(0..10).map(|index| a_run_named(&format!("r{index}"))).collect();

		for scope in &runs {
			live.take_over(scope.clone());
			assert!(live.install(scope, REPLACED_SESSION));
		}

		for scope in &runs {
			assert!(live.holds(scope), "a run the host admitted was not held live");
		}
		assert_eq!(live.clear_all().len(), runs.len(), "the host let go of a run it had admitted");
	}

	#[test]
	fn two_bots_each_hold_their_own_session_at_the_same_time() {
		let live = Live::<&str>::default();

		assert!(live.take_over(a_scope()).replaced.is_none());
		assert!(live.install(&a_scope(), REPLACED_SESSION));
		assert!(
			live.take_over(another_bots_run()).replaced.is_none(),
			"starting one bot handed back another bot's child to be shut down"
		);
		assert!(live.install(&another_bots_run(), ANOTHER_BOTS_SESSION));

		assert_eq!(live.session_for(&a_scope()).ok(), Some(REPLACED_SESSION));
		assert_eq!(live.session_for(&another_bots_run()).ok(), Some(ANOTHER_BOTS_SESSION));
		assert!(live.holds(&a_scope()) && live.holds(&another_bots_run()));

		assert_eq!(live.clear(&a_scope()), Some(REPLACED_SESSION));
		assert!(
			live.holds(&another_bots_run()),
			"ending one bot's run ended the run of the bot beside it"
		);
		assert_eq!(
			live.session_for(&another_bots_run()).ok(),
			Some(ANOTHER_BOTS_SESSION),
			"a bot lost its own session when another bot's was shut down"
		);
	}

	#[test]
	fn the_exit_gives_up_every_bots_child_at_once() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		live.install(&a_scope(), REPLACED_SESSION);
		live.take_over(another_bots_run());
		live.install(&another_bots_run(), ANOTHER_BOTS_SESSION);
		live.take_over(a_run_named("r7"));

		let mut ended = live.clear_all();
		ended.sort_unstable();
		assert_eq!(
			ended,
			vec![ANOTHER_BOTS_SESSION, REPLACED_SESSION],
			"the exit left a live child behind"
		);
		assert!(!live.holds(&a_scope()) && !live.holds(&another_bots_run()));
		assert!(
			is_unheld(&live.session_for(&another_bots_run())),
			"a command reached a session after the exit gave it up"
		);
	}

	const ONE_START: i64 = 1_700_000_000_000;

	fn held_since<S>(live: &Live<S>, scope: RuntimeScope, started_at: i64) {
		live.runs
			.lock()
			.expect("live runs")
			.insert(run_key(&scope), Run { scope, session: None, started_at });
	}

	fn reported_runs<S: Clone>(live: &Live<S>) -> Vec<String> {
		live.report().into_iter().map(|held| held.runtime_session_id).collect()
	}

	#[test]
	fn the_report_names_every_run_the_host_holds_in_the_order_they_started() {
		let live = Live::<&str>::default();
		held_since(&live, another_bots_run(), ONE_START);
		let before = now_ms();
		live.take_over(a_scope());
		let after = now_ms();

		let held = live.report();

		assert_eq!(
			held.iter().map(|run| run.runtime_session_id.as_str()).collect::<Vec<_>>(),
			["r9", "r1"],
			"the runs were not reported in the order they started"
		);
		assert_eq!((held[0].bot_id.as_str(), held[0].conversation_id.as_str()), ("b2", "c2"));
		assert_eq!((held[1].bot_id.as_str(), held[1].conversation_id.as_str()), ("b1", "c1"));
		assert!(
			(before..=after).contains(&held[1].started_at),
			"a run took over without the moment it started"
		);
	}

	#[test]
	fn runs_sharing_one_start_are_reported_by_id_and_in_the_same_order_twice() {
		let live = Live::<&str>::default();
		held_since(&live, the_next_run(), ONE_START);
		held_since(&live, a_scope(), ONE_START);

		let held = live.report();

		assert_eq!(
			held.iter().map(|run| run.runtime_session_id.as_str()).collect::<Vec<_>>(),
			["r1", "r2"],
			"runs sharing a start were not reported by their runtime session id"
		);
		assert_eq!(live.report(), held, "two reports of the same runs disagreed on the order");
	}

	#[test]
	fn a_run_started_again_under_its_own_id_is_reported_once_and_installing_keeps_its_start() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());
		let started_at = live.report()[0].started_at;

		assert!(live.install(&a_scope(), REPLACED_SESSION));
		assert_eq!(
			live.report()[0].started_at,
			started_at,
			"installing a session moved the start of the run it was installed on"
		);

		live.take_over(a_scope());
		assert!(live.install(&a_scope(), REPLACEMENT_SESSION));

		assert_eq!(
			reported_runs(&live),
			["r1"],
			"a run started again under its own id was reported twice"
		);
	}

	#[test]
	fn a_run_the_host_let_go_leaves_the_report_and_the_exit_empties_it() {
		let live = Live::<&str>::default();
		assert!(live.report().is_empty(), "a host holding no run reported one");

		live.take_over(a_scope());
		live.take_over(another_bots_run());
		live.clear(&a_scope());

		assert_eq!(reported_runs(&live), ["r9"], "a run the host let go stayed in the report");

		live.clear_all();

		assert!(live.report().is_empty(), "the exit left a run in the report");
	}

	#[test]
	fn a_child_built_for_a_run_the_host_has_left_is_never_installed() {
		let live = Live::<&str>::default();
		live.take_over(a_scope());

		live.clear_all();

		assert!(
			!live.install(&a_scope(), REPLACED_SESSION),
			"a start installed its child into a host that had let its run go"
		);
		assert!(
			matches!(live.session_for(&a_scope()), Err(TransportError::NotStarted)),
			"a host standing for no run answered with a session all the same"
		);
	}

	#[test]
	fn a_transition_holds_one_run_and_lets_every_other_run_through() {
		let state = AgentState::default();

		let held = state.claim(&a_scope()).expect("the first claim is free");
		assert!(
			matches!(state.claim(&a_scope()), Err(TransportError::TransitionInProgress)),
			"one run took two transitions at once"
		);
		assert!(
			state.claim(&the_next_run()).is_ok(),
			"one instance's transition refused another instance of the same bot"
		);
		assert!(
			state.claim(&another_bots_run()).is_ok(),
			"one bot's transition refused another bot's"
		);

		drop(held);
		assert!(state.claim(&a_scope()).is_ok(), "a spent transition kept its seat");
	}

	#[test]
	fn nothing_starts_for_any_bot_once_the_host_is_quitting() {
		let state = AgentState::default();
		state.enter_quit();

		for scope in [a_scope(), another_bots_run()] {
			assert!(
				matches!(state.claim(&scope), Err(TransportError::TransitionInProgress)),
				"a start was let through after the quit: {scope:?}"
			);
		}
	}

	const A_CONVERSATION: &str = "
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'First', 1, 1);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0);
	";

	async fn a_database_resuming(provider_session_id: &str) -> (db::DatabaseState, RemovedOnDrop) {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is there");
		let participant = participant_key(&a_scope());
		let session = database
			.runtime_context()
			.open(participant.clone(), 1, None)
			.await
			.expect("the runtime session opens");
		database
			.runtime_context()
			.record_provider_session(participant, session.id, provider_session_id.to_owned())
			.await
			.expect("the provider session is recorded");
		(Ok(database), dir)
	}

	async fn stored_id(state: &db::DatabaseState) -> Option<String> {
		state
			.as_ref()
			.expect("the database opens")
			.runtime_context()
			.active_session(participant_key(&a_scope()))
			.await
			.expect("the live session")
			.and_then(|session| session.provider_session_id)
	}

	async fn a_conversation_of_two_instances(
	) -> (db::DatabaseState, RuntimeScope, RuntimeScope, RemovedOnDrop) {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_CONVERSATION)?))
			.await
			.expect("the conversation is there");
		let participant = participant_key(&a_scope());
		let runtime = database.runtime_context();
		let first = runtime.open(participant.clone(), 1, None).await.expect("the first instance");
		let second = runtime.open(participant.clone(), 2, None).await.expect("the second instance");
		runtime
			.record_provider_session(participant, first.id.clone(), "session-1".to_owned())
			.await
			.expect("the lineage is recorded");
		let scope_of =
			|id: String, seq: i64| RuntimeScope { runtime_session_id: id, epoch: seq, ..a_scope() };
		(Ok(database), scope_of(first.id, first.seq), scope_of(second.id, second.seq), dir)
	}

	#[tokio::test]
	async fn only_a_mission_conversation_opens_on_a_mission_thread() {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		database
			.call_mut(|connection| {
				Ok(connection.execute_batch(
					"INSERT INTO conversations (id, kind, title, created_at, updated_at)
						VALUES ('m1', 'mission', 'Ship it', 1, 1);
					INSERT INTO conversations (id, kind, title, created_at, updated_at)
						VALUES ('c1', 'main', 'First', 1, 1);",
				)?)
			})
			.await
			.expect("the conversations are there");
		let state: db::DatabaseState = Ok(database);

		assert!(opens_on_a_mission_thread(&state, "m1").await);
		assert!(!opens_on_a_mission_thread(&state, "c1").await);
		assert!(!opens_on_a_mission_thread(&state, "missing").await);
	}

	#[tokio::test]
	async fn a_second_instance_starts_cold_and_records_its_own_provider_session() {
		let (state, lineage, beside_it, _dir) = a_conversation_of_two_instances().await;
		let live = Live::<&str>::default();

		let holder = live.take_over(lineage.clone());
		let cold = live.take_over(beside_it.clone());

		assert_eq!(
			holder.resume(Some("session-1".to_owned())),
			Some("session-1".to_owned()),
			"the instance holding the lineage was refused its own resume id"
		);
		assert_eq!(
			cold.resume(Some("session-1".to_owned())),
			None,
			"a second instance was handed the resume id the first one is running on"
		);

		let database = state.as_ref().expect("the database opens");
		record_its_own_provider_session(database, &beside_it, "session-2".to_owned())
			.await
			.expect("the second instance records its own provider session");

		let sessions = database
			.runtime_context()
			.sessions_for(participant_key(&a_scope()))
			.await
			.expect("the sessions");
		let recorded: Vec<_> = sessions
			.iter()
			.map(|session| (session.provider_session_id.as_deref(), session.status))
			.collect();
		assert_eq!(
			recorded,
			vec![
				(Some("session-1"), RuntimeSessionStatus::Active),
				(Some("session-2"), RuntimeSessionStatus::Active)
			],
			"the second instance did not write its own id on its own live row"
		);
	}

	#[tokio::test]
	async fn a_timed_out_resume_keeps_the_stored_id_and_a_crashed_one_spends_it() {
		let (state, _dir) = a_database_resuming("session-1").await;

		let spent = forget_the_id_a_refusal_blames(
			&state,
			&a_scope(),
			Some("session-1".into()),
			&TransportError::StartupTimeout { timeout_ms: 30_000 },
		)
		.await;
		assert!(!spent, "a slow resume was reported to the frontend as a spent id");
		assert_eq!(
			stored_id(&state).await.as_deref(),
			Some("session-1"),
			"a slow resume cost the id"
		);

		let spent = forget_the_id_a_refusal_blames(
			&state,
			&a_scope(),
			Some("session-1".into()),
			&TransportError::Crashed { code: Some(4), detail: None },
		)
		.await;
		assert!(spent, "the frontend was left holding an id the host gave up on");
		assert_eq!(
			stored_id(&state).await,
			None,
			"a refused id outlived the crash that proved it dead"
		);
	}

	mod pending_questions {
		use tauri::test::{mock_builder, MockRuntime};

		use super::super::super::contract::{TurnEnded, TurnOutcome};
		use super::*;
		use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

		fn an_app(name: &str) -> AppOfItsOwn {
			an_app_of_its_own(&format!("pending-question-{name}"), mock_builder())
		}

		fn the_turn() -> Option<EventTurn> {
			Some(EventTurn { turn_id: "t1".into(), conversation_id: "c1".into() })
		}

		fn question(id: &str) -> AgentEvent {
			AgentEvent::QuestionRequested {
				request: QuestionRequest { id: id.into(), questions: Vec::new(), subject: None },
			}
		}

		fn answered(id: &str) -> AgentEvent {
			AgentEvent::PermissionResolved {
				id: id.into(),
				decision: PermissionDecision::AllowOnce,
			}
		}

		fn turn_ended() -> AgentEvent {
			AgentEvent::TurnEnded {
				ended: TurnEnded {
					session_id: None,
					outcome: TurnOutcome::Completed,
					structured_output: None,
					total_cost_usd: None,
					model_usage: None,
				},
			}
		}

		fn crashed() -> AgentEvent {
			AgentEvent::Failed { error: TransportError::Crashed { code: Some(1), detail: None } }
		}

		fn a_late_listener(app: &AppHandle<MockRuntime>) -> Vec<Frame> {
			let (pending, mut heard) = subscribed_with_pending_questions(app);
			assert!(heard.try_recv().is_err(), "the late listener heard a live frame");
			pending
		}

		async fn pending_in(
			app: &AppHandle<MockRuntime>,
			conversation_id: &str,
		) -> Vec<ScopedEvent> {
			agent_pending_questions(app.state(), conversation_id.to_owned())
				.await
				.expect("the command answers")
		}

		#[tokio::test]
		async fn the_command_returns_a_pending_question_as_it_was_announced() {
			let app = an_app("command-asked");
			let mut original = events::subscribed(app.handle());
			let run = a_run_held_by_the_app(app.handle(), a_scope());
			run.emit(question("q1"), the_turn());
			let announced = original.try_recv().expect("the question was emitted");

			let pending = pending_in(app.handle(), "c1").await;

			let returned: Vec<Frame> = pending
				.iter()
				.map(|question| events::frame(AGENT_EVENT, question).expect("a frame"))
				.collect();
			assert_eq!(returned, vec![announced]);
		}

		#[tokio::test]
		async fn the_command_returns_an_empty_list_when_no_question_waits() {
			let app = an_app("command-empty");
			a_run_held_by_the_app(app.handle(), a_scope());

			assert!(pending_in(app.handle(), "c1").await.is_empty());
		}

		#[tokio::test]
		async fn the_command_returns_no_question_of_another_conversation() {
			let app = an_app("command-elsewhere");
			let here = a_run_held_by_the_app(app.handle(), a_scope());
			let elsewhere = a_run_held_by_the_app(app.handle(), another_bots_run());
			here.emit(question("q1"), the_turn());
			elsewhere.emit(
				question("q9"),
				Some(EventTurn { turn_id: "t9".into(), conversation_id: "c2".into() }),
			);

			let pending = pending_in(app.handle(), "c1").await;

			assert_eq!(pending.len(), 1);
			assert!(pending.iter().all(|question| question
				.scope
				.as_ref()
				.is_some_and(|scope| scope.conversation_id == "c1")));
		}

		#[test]
		fn a_listener_subscribing_after_a_question_hears_it_once_in_its_turn() {
			let app = an_app("asked");
			let mut original = events::subscribed(app.handle());
			let run = a_run_held_by_the_app(app.handle(), a_scope());

			run.emit(question("q1"), the_turn());

			let emitted = original.try_recv().expect("the question was emitted");
			assert_eq!(a_late_listener(app.handle()), vec![emitted]);
		}

		#[test]
		fn a_question_asked_after_a_listener_subscribed_reaches_it_live_only() {
			let app = an_app("asked-live");
			let run = a_run_held_by_the_app(app.handle(), a_scope());
			let (pending, mut heard) = subscribed_with_pending_questions(app.handle());

			run.emit(question("q1"), the_turn());

			assert!(pending.is_empty());
			assert!(heard.try_recv().is_ok());
			assert!(heard.try_recv().is_err(), "the question reached the listener twice");
		}

		#[tokio::test]
		async fn a_question_answered_or_ended_with_its_turn_reaches_no_later_listener() {
			for (name, settling) in
				[("answered", answered("q1")), ("ended", turn_ended()), ("crashed", crashed())]
			{
				let app = an_app(name);
				let run = a_run_held_by_the_app(app.handle(), a_scope());
				run.emit(question("q1"), the_turn());

				run.emit(settling, the_turn());

				assert!(
					a_late_listener(app.handle()).is_empty(),
					"{name} left the question pending"
				);
				assert!(pending_in(app.handle(), "c1").await.is_empty(), "{name} kept it listed");
			}
		}

		#[test]
		fn an_answer_releases_its_own_question_and_keeps_the_other() {
			let app = an_app("answered-one");
			let mut original = events::subscribed(app.handle());
			let run = a_run_held_by_the_app(app.handle(), a_scope());
			run.emit(question("q1"), the_turn());
			run.emit(question("q2"), the_turn());
			let kept = original.try_recv().and_then(|_| original.try_recv()).expect("q2 emitted");

			run.emit(answered("q1"), the_turn());

			assert_eq!(a_late_listener(app.handle()), vec![kept]);
		}

		#[tokio::test]
		async fn a_stopped_session_leaves_no_question_pending() {
			let app = an_app("stopped");
			let run = a_run_held_by_the_app(app.handle(), a_scope());
			run.emit(question("q1"), the_turn());

			shutdown_session(&app.state::<AgentState>(), &a_scope()).await;

			assert!(a_late_listener(app.handle()).is_empty());
			assert!(pending_in(app.handle(), "c1").await.is_empty());
		}

		#[tokio::test]
		async fn a_replaced_or_cleared_session_leaves_no_question_pending() {
			let replaced = an_app("replaced");
			a_run_held_by_the_app(replaced.handle(), a_scope()).emit(question("q1"), the_turn());
			let cleared = an_app("cleared");
			a_run_held_by_the_app(cleared.handle(), a_scope()).emit(question("q1"), the_turn());

			replaced.state::<AgentState>().live.take_over(a_scope());
			cleared.state::<AgentState>().live.clear_all();

			for app in [&replaced, &cleared] {
				assert!(a_late_listener(app.handle()).is_empty());
				assert!(pending_in(app.handle(), "c1").await.is_empty());
			}
		}

		#[test]
		fn a_question_of_a_run_already_let_go_is_neither_held_nor_emitted() {
			let app = an_app("let-go");
			let run = a_run_held_by_the_app(app.handle(), a_scope());
			let mut original = events::subscribed(app.handle());
			app.state::<AgentState>().live.clear(&a_scope());

			run.emit(question("q1"), the_turn());

			assert!(original.try_recv().is_err());
			assert!(a_late_listener(app.handle()).is_empty());
		}
	}
}
