use std::future::Future;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use semver::Version;
use tauri::{AppHandle, Manager, Runtime, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

use super::contract::{UpdateChannel, UpdateState};
use crate::events;

const STABLE_MANIFEST: &str =
	"https://github.com/shoto290/kiroshi-monorepo/releases/latest/download/latest.json";
const BETA_MANIFEST: &str =
	"https://github.com/shoto290/kiroshi-monorepo/releases/download/beta/latest.json";
const CHECK_BOUND: Duration = Duration::from_secs(30);
const DOWNLOAD_BOUND: Duration = Duration::from_secs(15 * 60);

#[derive(Default)]
pub struct Updates(Mutex<Held>);

#[derive(Default)]
struct Held {
	state: UpdateState,
	offered: Option<Update>,
	checking: Option<UpdateChannel>,
	wanted: Option<UpdateChannel>,
}

enum Settled {
	Done(UpdateState),
	Again(UpdateChannel),
}

impl Updates {
	pub fn state(&self) -> UpdateState {
		self.held().state.clone()
	}

	fn held(&self) -> MutexGuard<'_, Held> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn claim_check(&self, channel: UpdateChannel) -> Result<(), UpdateState> {
		let mut held = self.held();
		if let Some(running) = held.checking {
			held.wanted = (channel != running).then_some(channel);
			return Err(held.state.clone());
		}
		if is_busy(&held.state) {
			return Err(held.state.clone());
		}
		*held = Held {
			state: UpdateState::Checking,
			offered: None,
			checking: Some(channel),
			wanted: None,
		};
		Ok(())
	}

	fn settle_check(&self, state: UpdateState, offered: Option<Update>) -> Settled {
		let mut held = self.held();
		if let Some(stored) = held.wanted.take() {
			held.checking = Some(stored);
			return Settled::Again(stored);
		}
		*held = Held { state: state.clone(), offered, checking: None, wanted: None };
		Settled::Done(state)
	}

	fn fail_unless_busy(&self, failure: UpdateState) -> Result<UpdateState, UpdateState> {
		let mut held = self.held();
		if is_busy(&held.state) {
			return Err(held.state.clone());
		}
		*held = Held { state: failure.clone(), ..Held::default() };
		Ok(failure)
	}

	fn claim_install(&self) -> Result<Update, UpdateState> {
		let mut held = self.held();
		let Some(update) = held.offered.take() else {
			return Err(held.state.clone());
		};
		held.state = UpdateState::Downloading { downloaded_bytes: 0, total_bytes: None };
		Ok(update)
	}

	fn settle(&self, state: UpdateState) {
		*self.held() = Held { state, ..Held::default() };
	}
}

fn is_busy(state: &UpdateState) -> bool {
	matches!(
		state,
		UpdateState::Checking
			| UpdateState::Downloading { .. }
			| UpdateState::ReadyToRestart { .. }
	)
}

fn manifest_url(channel: UpdateChannel) -> &'static str {
	match channel {
		UpdateChannel::Stable => STABLE_MANIFEST,
		UpdateChannel::Beta => BETA_MANIFEST,
	}
}

fn is_offered(running: &Version, remote: &Version) -> bool {
	remote > running
}

pub async fn check<R: Runtime>(
	app: &AppHandle<R>,
	channel: Result<UpdateChannel, String>,
) -> UpdateState {
	let channel = match channel {
		Ok(channel) => channel,
		Err(message) => {
			return match app.state::<Updates>().fail_unless_busy(failed("check", message)) {
				Ok(failure) => announced(app, failure),
				Err(current) => current,
			}
		}
	};
	match begin(app, channel) {
		Ok(()) => run(app, channel).await,
		Err(current) => current,
	}
}

pub fn check_on<R: Runtime>(app: &AppHandle<R>, channel: UpdateChannel) {
	if begin(app, channel).is_err() {
		return;
	}
	let app = app.clone();
	tauri::async_runtime::spawn(async move { run(&app, channel).await });
}

fn begin<R: Runtime>(app: &AppHandle<R>, channel: UpdateChannel) -> Result<(), UpdateState> {
	app.state::<Updates>().claim_check(channel)?;
	announced(app, UpdateState::Checking);
	Ok(())
}

async fn run<R: Runtime>(app: &AppHandle<R>, channel: UpdateChannel) -> UpdateState {
	settled_after(app, channel, |channel| checked(app, channel)).await
}

async fn settled_after<R, Check, Checking>(
	app: &AppHandle<R>,
	mut channel: UpdateChannel,
	check: Check,
) -> UpdateState
where
	R: Runtime,
	Check: Fn(UpdateChannel) -> Checking,
	Checking: Future<Output = (UpdateState, Option<Update>)>,
{
	let updates = app.state::<Updates>();
	loop {
		let (state, offered) = check(channel).await;
		match updates.settle_check(state, offered) {
			Settled::Done(state) => return announced(app, state),
			Settled::Again(stored) => channel = stored,
		}
	}
}

async fn checked<R: Runtime>(
	app: &AppHandle<R>,
	channel: UpdateChannel,
) -> (UpdateState, Option<Update>) {
	let manifest = manifest_url(channel);
	eprintln!("info: checking for updates on the {channel:?} channel at {manifest}");
	match offered_release(app, manifest).await {
		Ok(Some(update)) => {
			(UpdateState::Available { version: update.version.clone() }, Some(update))
		}
		Ok(None) => (UpdateState::UpToDate, None),
		Err(message) => (failed("check", message), None),
	}
}

async fn offered_release<R: Runtime>(
	app: &AppHandle<R>,
	manifest: &str,
) -> Result<Option<Update>, String> {
	let endpoint: Url = manifest.parse().map_err(|error| format!("{manifest}: {error}"))?;
	app.updater_builder()
		.endpoints(vec![endpoint])
		.map_err(|error| error.to_string())?
		.timeout(CHECK_BOUND)
		.version_comparator(|running, release| is_offered(&running, &release.version))
		.build()
		.map_err(|error| error.to_string())?
		.check()
		.await
		.map_err(|error| error.to_string())
}

pub async fn install<R: Runtime>(app: &AppHandle<R>) -> UpdateState {
	let updates = app.state::<Updates>();
	let mut update = match updates.claim_install() {
		Ok(update) => update,
		Err(current) => return current,
	};
	announced(app, UpdateState::Downloading { downloaded_bytes: 0, total_bytes: None });
	update.timeout = Some(DOWNLOAD_BOUND);
	let mut downloaded_bytes: u64 = 0;
	let installed = update
		.download_and_install(
			|chunk, total_bytes| {
				downloaded_bytes += chunk as u64;
				let progress = UpdateState::Downloading { downloaded_bytes, total_bytes };
				updates.settle(progress.clone());
				announced(app, progress);
			},
			|| {},
		)
		.await;
	let state = match installed {
		Ok(()) => UpdateState::ReadyToRestart { version: update.version.clone() },
		Err(error) => failed("install", error.to_string()),
	};
	updates.settle(state.clone());
	announced(app, state)
}

fn failed(operation: &str, message: String) -> UpdateState {
	eprintln!("warn: the update {operation} failed: {message}");
	UpdateState::Failed { message }
}

fn announced<R: Runtime>(app: &AppHandle<R>, state: UpdateState) -> UpdateState {
	if let Err(error) = events::emit(app, events::UPDATE_CHANGED, state.clone()) {
		eprintln!("warn: the update state {state:?} reached no window: {error}");
	}
	state
}

#[cfg(test)]
mod tests {
	use std::sync::Arc;

	use tauri::test::{mock_builder, MockRuntime};
	use tokio::sync::Notify;

	use super::*;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn version(text: &str) -> Version {
		Version::parse(text).expect("a version")
	}

	fn updates_in(state: UpdateState) -> Updates {
		Updates(Mutex::new(Held { state, ..Held::default() }))
	}

	#[test]
	fn stable_checks_the_manifest_the_config_names() {
		let config: serde_json::Value =
			serde_json::from_str(include_str!("../../tauri.conf.json")).expect("the config parses");

		assert_eq!(config["plugins"]["updater"]["endpoints"][0], STABLE_MANIFEST);
		assert_eq!(manifest_url(UpdateChannel::Stable), STABLE_MANIFEST);
	}

	#[test]
	fn beta_checks_the_beta_release_manifest() {
		assert_eq!(
			manifest_url(UpdateChannel::Beta),
			"https://github.com/shoto290/kiroshi-monorepo/releases/download/beta/latest.json"
		);
	}

	#[test]
	fn a_stable_release_older_than_the_running_beta_is_not_offered() {
		assert!(!is_offered(&version("0.25.0-beta.1"), &version("0.24.1")));
	}

	#[test]
	fn the_stable_release_of_the_running_beta_is_offered() {
		assert!(is_offered(&version("0.25.0-beta.1"), &version("0.25.0")));
	}

	#[test]
	fn the_running_version_is_not_offered_again() {
		assert!(!is_offered(&version("0.24.1"), &version("0.24.1")));
	}

	#[test]
	fn a_check_is_refused_while_another_check_or_a_download_runs() {
		let busy = [
			UpdateState::Checking,
			UpdateState::Downloading { downloaded_bytes: 10, total_bytes: Some(100) },
			UpdateState::ReadyToRestart { version: "0.25.0".to_owned() },
		];
		for state in busy {
			let updates = updates_in(state.clone());

			assert_eq!(updates.claim_check(UpdateChannel::Stable), Err(state.clone()));
			assert_eq!(updates.state(), state);
		}
	}

	#[test]
	fn a_check_moves_a_settled_state_to_checking() {
		let settled =
			[UpdateState::UpToDate, UpdateState::Failed { message: "offline".to_owned() }];
		for state in settled {
			let updates = updates_in(state);

			assert_eq!(updates.claim_check(UpdateChannel::Stable), Ok(()));
			assert_eq!(updates.state(), UpdateState::Checking);
		}
	}

	#[test]
	fn an_install_without_an_offered_release_answers_the_state_unchanged() {
		let updates = updates_in(UpdateState::UpToDate);

		assert!(matches!(updates.claim_install(), Err(UpdateState::UpToDate)));
		assert_eq!(updates.state(), UpdateState::UpToDate);
	}

	struct HeldCheck {
		asked: Arc<Mutex<Vec<UpdateChannel>>>,
		entered: Arc<Notify>,
		released: Arc<Notify>,
	}

	impl HeldCheck {
		fn new() -> Self {
			Self {
				asked: Arc::default(),
				entered: Arc::new(Notify::new()),
				released: Arc::new(Notify::new()),
			}
		}

		fn asked(&self) -> Vec<UpdateChannel> {
			self.asked.lock().expect("the asked channels").clone()
		}

		fn started_on_stable(&self, app: &AppOfItsOwn) -> tokio::task::JoinHandle<UpdateState> {
			let handle = app.handle().clone();
			let (asked, entered, released) =
				(self.asked.clone(), self.entered.clone(), self.released.clone());
			begin(&handle, UpdateChannel::Stable).expect("the first check is claimed");
			tokio::spawn(async move {
				settled_after(&handle, UpdateChannel::Stable, |channel| {
					let (asked, entered, released) =
						(asked.clone(), entered.clone(), released.clone());
					async move {
						asked.lock().expect("the asked channels").push(channel);
						if channel != UpdateChannel::Stable {
							return (UpdateState::UpToDate, None);
						}
						entered.notify_one();
						released.notified().await;
						(UpdateState::Available { version: "0.24.2".to_owned() }, None)
					}
				})
				.await
			})
		}
	}

	fn an_app() -> AppOfItsOwn {
		an_app_of_its_own("updates", mock_builder().manage(Updates::default()))
	}

	fn held_state(app: &AppOfItsOwn) -> UpdateState {
		app.handle().state::<Updates>().state()
	}

	#[tokio::test]
	async fn a_channel_switched_during_a_check_drops_its_offer_and_checks_the_stored_channel() {
		let app = an_app();
		let check = HeldCheck::new();
		let running = check.started_on_stable(&app);
		check.entered.notified().await;

		let answered = begin::<MockRuntime>(app.handle(), UpdateChannel::Beta);
		check.released.notify_one();
		let settled = running.await.expect("the check settles");

		assert_eq!(answered, Err(UpdateState::Checking));
		assert_eq!(check.asked(), vec![UpdateChannel::Stable, UpdateChannel::Beta]);
		assert_eq!(settled, UpdateState::UpToDate);
		assert_eq!(held_state(&app), UpdateState::UpToDate);
	}

	#[tokio::test]
	async fn a_channel_switched_back_during_a_check_keeps_its_result() {
		let app = an_app();
		let check = HeldCheck::new();
		let running = check.started_on_stable(&app);
		check.entered.notified().await;

		assert_eq!(
			begin::<MockRuntime>(app.handle(), UpdateChannel::Beta),
			Err(UpdateState::Checking)
		);
		assert_eq!(
			begin::<MockRuntime>(app.handle(), UpdateChannel::Stable),
			Err(UpdateState::Checking)
		);
		check.released.notify_one();
		let settled = running.await.expect("the check settles");

		let offered = UpdateState::Available { version: "0.24.2".to_owned() };
		assert_eq!(check.asked(), vec![UpdateChannel::Stable]);
		assert_eq!(settled, offered);
		assert_eq!(held_state(&app), offered);
	}
}
