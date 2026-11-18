use std::future::Future;
use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use reqwest::Url;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpStream;
use tokio::sync::{watch as signal, Notify};

use super::commands::replay_kept;
use super::contract::{RuntimeScope, TransportError};
use super::session::{Keeping, StrandedTurn, StrandedTurns};
use super::translate::now_ms;
use crate::db;
use crate::db::repositories::turn_replays::{ClaimedTurn, KeptTurn, ReplayedRun};
use crate::environment::contract::EnvOwner;
use crate::environment::store as environment;

pub const PROBE_INTERVAL: Duration = Duration::from_secs(5);
const PROBE_TIMEOUT: Duration = Duration::from_secs(3);
const BASE_URL_VARIABLE: &str = "ANTHROPIC_BASE_URL";
const SDK_DEFAULT_BASE_URL: &str = "https://api.anthropic.com";

pub struct TurnReplays {
	stranded: Arc<Notify>,
	_stop: signal::Sender<bool>,
}

impl TurnReplays {
	fn stranded(&self) {
		self.stranded.notify_one();
	}
}

pub fn spawn<R: Runtime>(app: AppHandle<R>) -> TurnReplays {
	let stranded = Arc::new(Notify::new());
	let (stop, halted) = signal::channel(false);
	tauri::async_runtime::spawn(watch(app, stranded.clone(), halted));
	TurnReplays { stranded, _stop: stop }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderProbe {
	host: String,
	port: u16,
}

impl ProviderProbe {
	fn of(base_url: &str) -> Option<Self> {
		let url = Url::parse(base_url).ok()?;
		Some(Self { host: url.host_str()?.to_owned(), port: url.port_or_known_default()? })
	}

	async fn connects(&self) -> bool {
		let connecting = TcpStream::connect((self.host.as_str(), self.port));
		matches!(tokio::time::timeout(PROBE_TIMEOUT, connecting).await, Ok(Ok(_)))
	}
}

fn replay_target(root: &Path, owner: &EnvOwner) -> Result<String, String> {
	let resolved = environment::resolve(root, owner).map_err(|error| format!("{error:?}"))?;
	let base_url = resolved
		.base
		.get(BASE_URL_VARIABLE)
		.filter(|base_url| !base_url.is_empty())
		.map_or(SDK_DEFAULT_BASE_URL, String::as_str);
	match ProviderProbe::of(base_url) {
		Some(_) => Ok(base_url.to_owned()),
		None => Err(format!("{BASE_URL_VARIABLE} names no host and port to probe")),
	}
}

async fn watch<R: Runtime>(
	app: AppHandle<R>,
	stranded: Arc<Notify>,
	mut halted: signal::Receiver<bool>,
) {
	let state = app.state::<db::DatabaseState>();
	let database = match state.inner() {
		Ok(database) => database,
		Err(failure) => return log::error!("no turn will replay: {failure:?}"),
	};
	loop {
		let (hosts, is_waiting) = match database.turn_replays().pending_hosts().await {
			Ok(hosts) => {
				let is_waiting = !hosts.is_empty();
				(hosts, is_waiting)
			}
			Err(failure) => {
				log::error!("the pending turn replays could not be read: {failure:?}");
				(Vec::new(), true)
			}
		};
		tokio::select! {
			_ = halted.changed() => return,
			() = stranded.notified(), if !is_waiting => {}
			() = tokio::time::sleep(PROBE_INTERVAL), if is_waiting => {
				let claimed = claim_reachable(database, hosts).await;
				replay_claimed(claimed, |kept| replay_kept(&app, kept)).await;
			}
		}
	}
}

async fn claim_reachable(database: &db::Database, hosts: Vec<String>) -> Vec<ClaimedTurn> {
	let mut claimed = Vec::new();
	for base_url in hosts {
		let Some(probe) = ProviderProbe::of(&base_url) else {
			log::error!("a kept turn names a base URL with no host and port to probe");
			continue;
		};
		if !probe.connects().await {
			continue;
		}
		match database.turn_replays().claim_pending_on(&base_url, now_ms()).await {
			Ok(turns) => claimed.extend(turns),
			Err(failure) => log::error!(
				"the turn replays waiting on {} could not be claimed: {failure:?}",
				probe.host
			),
		}
	}
	claimed
}

async fn replay_claimed<F, Delivered>(claimed: Vec<ClaimedTurn>, deliver: F)
where
	F: Fn(KeptTurn) -> Delivered,
	Delivered: Future<Output = Result<(), TransportError>>,
{
	for ClaimedTurn { kept, is_superseded } in claimed {
		let turn_id = kept.stranded.turn_id.clone();
		if is_superseded {
			log::info!("the turn replay is dropped turn={turn_id} replay=true reason=superseded");
			continue;
		}
		match deliver(kept).await {
			Ok(()) => log::info!("the turn replays turn={turn_id} replay=true"),
			Err(error) => log::error!(
				"the turn could not replay turn={turn_id} replay=true kind={}",
				kind_of(&error)
			),
		}
	}
}

fn kind_of(error: &TransportError) -> String {
	let tagged = serde_json::to_value(error).ok();
	match tagged.as_ref().and_then(|tagged| tagged.get("kind")).and_then(|kind| kind.as_str()) {
		Some(kind) => kind.to_owned(),
		None => format!("{error:?}"),
	}
}

#[derive(Debug)]
pub(crate) struct KeptForReplay<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
	run: ReplayedRun,
	owner: EnvOwner,
}

impl<R: Runtime> KeptForReplay<R> {
	pub(crate) fn new(
		app: AppHandle<R>,
		scope: RuntimeScope,
		run: ReplayedRun,
		owner: EnvOwner,
	) -> Self {
		Self { app, scope, run, owner }
	}
}

impl<R: Runtime> StrandedTurns for KeptForReplay<R> {
	fn keep(&self, stranded: StrandedTurn) -> Keeping {
		let app = self.app.clone();
		let scope = self.scope.clone();
		let run = self.run.clone();
		let owner = self.owner.clone();
		Box::pin(async move {
			let turn_id = stranded.turn_id.clone();
			let Some(root) = environment::root(&app) else {
				return log::error!(
					"the turn could not be kept for a replay turn={turn_id}: no environment root"
				);
			};
			match replay_target(&root, &owner) {
				Ok(base_url) => {
					keep_for_replay(&app, KeptTurn { scope, run, stranded, base_url }).await
				}
				Err(failure) => {
					log::error!("the turn could not be kept for a replay turn={turn_id}: {failure}")
				}
			}
		})
	}
}

async fn keep_for_replay<R: Runtime>(app: &AppHandle<R>, kept: KeptTurn) {
	let turn_id = kept.stranded.turn_id.clone();
	let Some(Ok(database)) =
		app.try_state::<db::DatabaseState>().map(|state| state.inner().as_ref())
	else {
		return log::error!("the turn could not be kept for a replay turn={turn_id}: no database");
	};
	match database.turn_replays().keep(kept, now_ms()).await {
		Ok(true) => {
			log::info!("the turn waits for the network to replay turn={turn_id}");
			if let Some(replays) = app.try_state::<TurnReplays>() {
				replays.stranded();
			}
		}
		Ok(false) => log::info!("the turn was already kept for its one replay turn={turn_id}"),
		Err(failure) => {
			log::error!("the turn could not be kept for a replay turn={turn_id}: {failure:?}")
		}
	}
}

#[cfg(test)]
mod tests {
	use tokio::net::TcpListener;

	use super::*;

	#[test]
	fn the_probe_aims_at_the_host_and_port_of_the_base_url() {
		assert_eq!(
			ProviderProbe::of("https://api.anthropic.com"),
			Some(ProviderProbe { host: "api.anthropic.com".to_owned(), port: 443 })
		);
		assert_eq!(
			ProviderProbe::of("http://localhost:8080/v1"),
			Some(ProviderProbe { host: "localhost".to_owned(), port: 8080 })
		);
		assert_eq!(ProviderProbe::of("not a url"), None);
	}

	#[tokio::test]
	async fn a_probe_connects_to_a_listening_host_and_not_to_a_closed_port() {
		let listening = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
		let open_port = listening.local_addr().expect("the bound address").port();
		let closed_port = {
			let released = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
			released.local_addr().expect("the bound address").port()
		};

		let reachable = ProviderProbe { host: "127.0.0.1".to_owned(), port: open_port };
		let unreachable = ProviderProbe { host: "127.0.0.1".to_owned(), port: closed_port };

		assert!(reachable.connects().await);
		assert!(!unreachable.connects().await);
	}

	use std::sync::Mutex;

	use crate::agent::contract::SubmittedTurn;
	use crate::db::connection::temp_dir;
	use crate::environment::contract::EnvScope;

	const A_CONVERSATION: &str = "
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'main', 'Chat', 1, 1);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c1', 1, 90);
	";

	const A_NEWER_PROMPT: &str = "
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t9', 'c1', 9, 500);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m9', 'c1', 't9', 9, 'user', 'summarise the release', 'complete', 500);
	";

	fn a_bot(id: &str) -> EnvOwner {
		EnvOwner::Bot { id: id.to_owned(), space_id: "personal".to_owned() }
	}

	fn a_kept_turn(turn_id: &str, bot_id: &str, base_url: String) -> KeptTurn {
		KeptTurn {
			scope: RuntimeScope {
				conversation_id: "c1".to_owned(),
				bot_id: bot_id.to_owned(),
				runtime_session_id: format!("rs-{bot_id}"),
				epoch: 1,
			},
			run: ReplayedRun {
				cwd: None,
				output_schema: None,
				denied_tools: Vec::new(),
				permission_mode: None,
			},
			stranded: StrandedTurn {
				turn_id: turn_id.to_owned(),
				handed: Some(SubmittedTurn {
					turn_id: turn_id.to_owned(),
					prompt_id: format!("p-{turn_id}"),
				}),
				prompt: "summarise the release".to_owned(),
				sdk_session_id: Some("sdk-1".to_owned()),
				prompted_at: 100,
			},
			base_url,
		}
	}

	async fn written(database: &db::Database, statements: &'static str) {
		database
			.call_mut(move |connection| Ok(connection.execute_batch(statements)?))
			.await
			.expect("the fixture is written");
	}

	async fn closed_port() -> u16 {
		let released = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
		released.local_addr().expect("the bound address").port()
	}

	async fn delivered_from(claimed: Vec<ClaimedTurn>) -> Vec<String> {
		let delivered = Mutex::new(Vec::new());
		replay_claimed(claimed, |kept| {
			delivered.lock().expect("the delivered lock").push(kept.stranded.turn_id);
			std::future::ready(Ok(()))
		})
		.await;
		delivered.into_inner().expect("the delivered lock")
	}

	#[test]
	fn the_base_url_of_a_kept_turn_is_the_one_its_bot_env_sets_and_the_sdk_default_otherwise() {
		let root = temp_dir();
		let routed = a_bot("b1");
		environment::set(
			&root,
			&EnvScope::from(&routed),
			BASE_URL_VARIABLE,
			"http://127.0.0.1:4100",
		)
		.expect("the variable is set");

		assert_eq!(replay_target(&root, &routed), Ok("http://127.0.0.1:4100".to_owned()));
		assert_eq!(replay_target(&root, &a_bot("b2")), Ok(SDK_DEFAULT_BASE_URL.to_owned()));
	}

	#[tokio::test]
	async fn a_turn_kept_on_its_bot_base_url_replays_when_that_host_accepts_and_one_on_a_closed_port_stays_pending(
	) {
		let dir = temp_dir();
		let database = db::open(&dir);
		written(&database, A_CONVERSATION).await;
		let listening = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
		let open_port = listening.local_addr().expect("the bound address").port();
		let closed_url = format!("http://127.0.0.1:{}", closed_port().await);
		environment::set(
			&dir,
			&EnvScope::from(&a_bot("b1")),
			BASE_URL_VARIABLE,
			&format!("http://127.0.0.1:{open_port}"),
		)
		.expect("the variable is set");
		environment::set(&dir, &EnvScope::from(&a_bot("b2")), BASE_URL_VARIABLE, &closed_url)
			.expect("the variable is set");
		for (turn_id, bot_id) in [("t1", "b1"), ("t1", "b2")] {
			let base_url = replay_target(&dir, &a_bot(bot_id)).expect("a target");
			database
				.turn_replays()
				.keep(a_kept_turn(turn_id, bot_id, base_url), 110)
				.await
				.expect("kept");
		}

		let hosts = database.turn_replays().pending_hosts().await.expect("read");
		let claimed = claim_reachable(&database, hosts).await;
		let bots: Vec<String> = claimed.iter().map(|turn| turn.kept.scope.bot_id.clone()).collect();
		let delivered = delivered_from(claimed).await;
		let again = claim_reachable(&database, vec![format!("http://127.0.0.1:{open_port}")]).await;

		assert_eq!(bots, vec!["b1".to_owned()]);
		assert_eq!(delivered, vec!["t1".to_owned()]);
		assert!(again.is_empty(), "a turn replayed twice: {again:?}");
		assert_eq!(database.turn_replays().pending_hosts().await.expect("read"), vec![closed_url]);
	}

	#[tokio::test]
	async fn a_turn_followed_by_a_newer_prompt_is_claimed_as_superseded_and_never_delivered() {
		let dir = temp_dir();
		let database = db::open(&dir);
		written(&database, A_CONVERSATION).await;
		let listening = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
		let base_url =
			format!("http://127.0.0.1:{}", listening.local_addr().expect("bound").port());
		database
			.turn_replays()
			.keep(a_kept_turn("t1", "b1", base_url.clone()), 110)
			.await
			.expect("kept");
		written(&database, A_NEWER_PROMPT).await;

		let claimed = claim_reachable(&database, vec![base_url]).await;
		let is_superseded: Vec<bool> = claimed.iter().map(|turn| turn.is_superseded).collect();
		let delivered = delivered_from(claimed).await;

		assert_eq!(is_superseded, vec![true]);
		assert!(delivered.is_empty(), "a superseded turn was delivered: {delivered:?}");
		assert!(database.turn_replays().pending_hosts().await.expect("read").is_empty());
	}

	#[tokio::test]
	async fn a_replay_that_fails_to_deliver_stays_claimed() {
		let dir = temp_dir();
		let database = db::open(&dir);
		written(&database, A_CONVERSATION).await;
		let listening = TcpListener::bind("127.0.0.1:0").await.expect("a port is bound");
		let base_url =
			format!("http://127.0.0.1:{}", listening.local_addr().expect("bound").port());
		database
			.turn_replays()
			.keep(a_kept_turn("t1", "b1", base_url.clone()), 110)
			.await
			.expect("kept");

		let claimed = claim_reachable(&database, vec![base_url.clone()]).await;
		replay_claimed(claimed, |_| std::future::ready(Err(TransportError::TurnAlreadyRunning)))
			.await;

		assert!(database.turn_replays().pending_hosts().await.expect("read").is_empty());
		assert!(claim_reachable(&database, vec![base_url]).await.is_empty());
	}

	#[test]
	fn an_error_is_logged_under_the_kind_it_travels_as() {
		assert_eq!(kind_of(&TransportError::TurnAlreadyRunning), "turnAlreadyRunning");
		assert_eq!(kind_of(&TransportError::NotStarted), "notStarted");
	}
}
