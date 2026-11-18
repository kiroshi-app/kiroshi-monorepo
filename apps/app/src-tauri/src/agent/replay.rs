use std::sync::Arc;
use std::time::Duration;

use reqwest::Url;
use tauri::{AppHandle, Manager, Runtime};
use tokio::net::TcpStream;
use tokio::sync::{watch as signal, Notify};

use super::commands::replay_kept;
use super::contract::RuntimeScope;
use super::session::{Keeping, StrandedTurn, StrandedTurns};
use super::translate::now_ms;
use crate::db;
use crate::db::repositories::turn_replays::{KeptTurn, ReplayedRun};

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
	match ProviderProbe::configured() {
		Some(probe) => {
			tauri::async_runtime::spawn(watch(app, probe, stranded.clone(), halted));
		}
		None => log::error!(
			"no turn will replay: the provider base URL names no host and port to probe"
		),
	}
	TurnReplays { stranded, _stop: stop }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct ProviderProbe {
	host: String,
	port: u16,
}

impl ProviderProbe {
	fn configured() -> Option<Self> {
		let configured = std::env::var(BASE_URL_VARIABLE).ok().filter(|url| !url.is_empty());
		Self::of(configured.as_deref().unwrap_or(SDK_DEFAULT_BASE_URL))
	}

	fn of(base_url: &str) -> Option<Self> {
		let url = Url::parse(base_url).ok()?;
		Some(Self { host: url.host_str()?.to_owned(), port: url.port_or_known_default()? })
	}

	async fn connects(&self) -> bool {
		let connecting = TcpStream::connect((self.host.as_str(), self.port));
		matches!(tokio::time::timeout(PROBE_TIMEOUT, connecting).await, Ok(Ok(_)))
	}
}

async fn watch<R: Runtime>(
	app: AppHandle<R>,
	probe: ProviderProbe,
	stranded: Arc<Notify>,
	mut halted: signal::Receiver<bool>,
) {
	let state = app.state::<db::DatabaseState>();
	let database = match state.inner() {
		Ok(database) => database,
		Err(failure) => return log::error!("no turn will replay: {failure:?}"),
	};
	loop {
		let has_pending = match database.turn_replays().any_pending().await {
			Ok(has_pending) => has_pending,
			Err(failure) => {
				log::error!("the pending turn replays could not be read: {failure:?}");
				true
			}
		};
		tokio::select! {
			_ = halted.changed() => return,
			() = stranded.notified(), if !has_pending => {}
			() = tokio::time::sleep(PROBE_INTERVAL), if has_pending => {
				if probe.connects().await {
					replay_pending(&app, database).await;
				}
			}
		}
	}
}

async fn replay_pending<R: Runtime>(app: &AppHandle<R>, database: &db::Database) {
	let claimed = match database.turn_replays().claim_pending(now_ms()).await {
		Ok(claimed) => claimed,
		Err(failure) => {
			return log::error!("the pending turn replays could not be claimed: {failure:?}")
		}
	};
	for kept in claimed {
		let turn_id = kept.stranded.turn_id.clone();
		match replay_kept(app, kept).await {
			Ok(()) => log::info!("the turn replays turn={turn_id} replay=true"),
			Err(error) => {
				log::warn!("the turn could not replay turn={turn_id} replay=true: {error:?}")
			}
		}
	}
}

#[derive(Debug)]
pub(crate) struct KeptForReplay<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
	run: ReplayedRun,
}

impl<R: Runtime> KeptForReplay<R> {
	pub(crate) fn new(app: AppHandle<R>, scope: RuntimeScope, run: ReplayedRun) -> Self {
		Self { app, scope, run }
	}
}

impl<R: Runtime> StrandedTurns for KeptForReplay<R> {
	fn keep(&self, stranded: StrandedTurn) -> Keeping {
		let app = self.app.clone();
		let kept = KeptTurn { scope: self.scope.clone(), run: self.run.clone(), stranded };
		Box::pin(async move { keep_for_replay(&app, kept).await })
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
}
