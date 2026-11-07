use std::future::Future;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use reqwest::header::{HeaderValue, ACCEPT};
use reqwest::Client;

use super::contract::{UpdateChannel, UpdateState};
use super::feed::{Feed, Offer};
use super::install::{installed, Relaunch};
use super::signature::verified;
use super::source::{RunningApp, UpdateSource};
use crate::core_context::Core;
use crate::events;

const CHECK_BOUND: Duration = Duration::from_secs(30);
const DOWNLOAD_BOUND: Duration = Duration::from_secs(15 * 60);
const CHECK_EXCEEDED: &str = "the update check took longer than 30 s";
const DOWNLOAD_EXCEEDED: &str = "the update download took longer than 15 min";
const USER_AGENT: &str = concat!("kiroshi-updater/", env!("CARGO_PKG_VERSION"));

pub struct Updates {
	source: UpdateSource,
	running: RunningApp,
	held: Mutex<Held>,
}

#[derive(Default)]
struct Held {
	state: UpdateState,
	offered: Option<Offer>,
	ready: Option<Relaunch>,
	checking: Option<UpdateChannel>,
	wanted: Option<UpdateChannel>,
}

enum Settled {
	Done(UpdateState),
	Again(UpdateChannel),
}

impl Updates {
	pub fn new(source: UpdateSource, running: RunningApp) -> Self {
		Self { source, running, held: Mutex::default() }
	}

	pub fn state(&self) -> UpdateState {
		self.held().state.clone()
	}

	pub(super) fn source(&self) -> &UpdateSource {
		&self.source
	}

	pub(super) fn running(&self) -> &RunningApp {
		&self.running
	}

	fn held(&self) -> MutexGuard<'_, Held> {
		self.held.lock().unwrap_or_else(PoisonError::into_inner)
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
		*held = Held { state: UpdateState::Checking, checking: Some(channel), ..Held::default() };
		Ok(())
	}

	fn settle_check(&self, state: UpdateState, offered: Option<Offer>) -> Settled {
		let mut held = self.held();
		if let Some(stored) = held.wanted.take() {
			held.checking = Some(stored);
			return Settled::Again(stored);
		}
		*held = Held { state: state.clone(), offered, ..Held::default() };
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

	fn claim_install(&self) -> Result<Offer, UpdateState> {
		let mut held = self.held();
		let Some(offer) = held.offered.take() else {
			return Err(held.state.clone());
		};
		held.state = UpdateState::Downloading { downloaded_bytes: 0, total_bytes: None };
		Ok(offer)
	}

	fn claim_restart(&self) -> Result<Relaunch, UpdateState> {
		let held = self.held();
		match (&held.state, &held.ready) {
			(UpdateState::ReadyToRestart { .. }, Some(relaunch)) => Ok(relaunch.clone()),
			_ => Err(held.state.clone()),
		}
	}

	fn settle(&self, state: UpdateState) {
		*self.held() = Held { state, ..Held::default() };
	}

	fn settle_ready(&self, state: UpdateState, relaunch: Relaunch) {
		*self.held() = Held { state, ready: Some(relaunch), ..Held::default() };
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

pub(super) async fn check(core: &Core, channel: Result<UpdateChannel, String>) -> UpdateState {
	let updates = core.state::<Updates>();
	let channel = match channel {
		Ok(channel) => channel,
		Err(message) => {
			return match updates.fail_unless_busy(failed("check", message)) {
				Ok(failure) => announced(core, failure),
				Err(current) => current,
			}
		}
	};
	if let Err(current) = updates.claim_check(channel) {
		return current;
	}
	announced(core, UpdateState::Checking);
	settled_after(core, channel, |channel| checked(core, channel)).await
}

async fn settled_after<Check, Checking>(
	core: &Core,
	mut channel: UpdateChannel,
	check: Check,
) -> UpdateState
where
	Check: Fn(UpdateChannel) -> Checking,
	Checking: Future<Output = (UpdateState, Option<Offer>)>,
{
	let updates = core.state::<Updates>();
	loop {
		let (state, offered) = check(channel).await;
		match updates.settle_check(state, offered) {
			Settled::Done(state) => return announced(core, state),
			Settled::Again(stored) => channel = stored,
		}
	}
}

async fn checked(core: &Core, channel: UpdateChannel) -> (UpdateState, Option<Offer>) {
	let updates = core.state::<Updates>();
	let feed = updates.source().feed(channel).to_owned();
	log::info!("checking for updates on the {channel:?} channel");
	let offered = within(CHECK_BOUND, CHECK_EXCEEDED, async {
		fetched_feed(&feed).await?.offer_for(updates.running())
	})
	.await;
	match offered {
		Ok(Some(offer)) => (UpdateState::Available { version: offer.version.clone() }, Some(offer)),
		Ok(None) => (UpdateState::UpToDate, None),
		Err(message) => (failed("check", message), None),
	}
}

async fn fetched_feed(url: &str) -> Result<Feed, String> {
	client()?
		.get(url)
		.header(ACCEPT, HeaderValue::from_static("application/json"))
		.send()
		.await
		.and_then(|response| response.error_for_status())
		.map_err(|error| format!("the update feed was not read: {error}"))?
		.json()
		.await
		.map_err(|error| format!("the update feed did not parse: {error}"))
}

pub(super) async fn install(core: &Core) -> UpdateState {
	let updates = core.state::<Updates>();
	let offer = match updates.claim_install() {
		Ok(offer) => offer,
		Err(current) => return current,
	};
	announced(core, UpdateState::Downloading { downloaded_bytes: 0, total_bytes: None });
	let settled = match installed_offer(core, &offer).await {
		Ok(relaunch) => {
			let ready = UpdateState::ReadyToRestart { version: offer.version };
			updates.settle_ready(ready.clone(), relaunch);
			ready
		}
		Err(message) => {
			let failure = failed("install", message);
			updates.settle(failure.clone());
			failure
		}
	};
	announced(core, settled)
}

async fn installed_offer(core: &Core, offer: &Offer) -> Result<Relaunch, String> {
	let updates = core.state::<Updates>();
	let artifact =
		within(DOWNLOAD_BOUND, DOWNLOAD_EXCEEDED, downloaded(core, &offer.artifact.url)).await?;
	verified(&artifact, &offer.artifact.signature, &updates.source().public_key, &offer.version)?;
	installed(core, updates.running(), artifact).await
}

async fn downloaded(core: &Core, url: &str) -> Result<Vec<u8>, String> {
	let updates = core.state::<Updates>();
	let unread = |error: reqwest::Error| format!("the update was not downloaded: {error}");
	let mut response = client()?
		.get(url)
		.header(ACCEPT, HeaderValue::from_static("application/octet-stream"))
		.send()
		.await
		.and_then(|response| response.error_for_status())
		.map_err(unread)?;
	let total_bytes = response.content_length();
	let mut artifact = Vec::new();
	while let Some(chunk) = response.chunk().await.map_err(unread)? {
		artifact.extend_from_slice(&chunk);
		let progress =
			UpdateState::Downloading { downloaded_bytes: artifact.len() as u64, total_bytes };
		updates.settle(progress.clone());
		announced(core, progress);
	}
	Ok(artifact)
}

pub(super) fn restart(core: &Core) -> UpdateState {
	let updates = core.state::<Updates>();
	let relaunch = match updates.claim_restart() {
		Ok(relaunch) => relaunch,
		Err(current) => return current,
	};
	match relaunch.spawned() {
		Ok(()) => {
			log::info!("the updated app is relaunched, this one exits");
			std::process::exit(0)
		}
		Err(error) => {
			let failure = failed("relaunch", format!("the updated app did not relaunch: {error}"));
			updates.settle(failure.clone());
			announced(core, failure)
		}
	}
}

fn client() -> Result<Client, String> {
	crate::missions::github::installed_tls_provider();
	Client::builder()
		.user_agent(USER_AGENT)
		.build()
		.map_err(|error| format!("the http client was not built: {error}"))
}

async fn within<T>(
	bound: Duration,
	exceeded: &str,
	work: impl Future<Output = Result<T, String>>,
) -> Result<T, String> {
	tokio::time::timeout(bound, work).await.unwrap_or_else(|_| Err(exceeded.to_owned()))
}

fn failed(operation: &str, message: String) -> UpdateState {
	log::warn!("the update {operation} failed: {message}");
	UpdateState::Failed { message }
}

fn announced(core: &Core, state: UpdateState) -> UpdateState {
	if let Err(error) = core.emit(events::UPDATE_CHANGED, state.clone()) {
		log::warn!("the update state {state:?} reached no client: {error}");
	}
	state
}

#[cfg(test)]
mod tests {
	use std::path::PathBuf;
	use std::sync::Arc;

	use tokio::sync::Notify;

	use super::*;
	use crate::test_core::{a_core_of_its_own, CoreOfItsOwn};
	use crate::updates::source::Installer;

	fn a_running_app() -> RunningApp {
		RunningApp {
			version: semver::Version::new(0, 24, 1),
			location: PathBuf::from("Kiroshi.app"),
			platform: "darwin-aarch64".to_owned(),
			installer: Installer::MacBundle,
		}
	}

	fn updates_in(state: UpdateState) -> Updates {
		let updates = Updates::new(UpdateSource::release(), a_running_app());
		updates.settle(state);
		updates
	}

	fn an_offer() -> Offer {
		serde_json::from_value::<Feed>(serde_json::json!({
			"version": "0.25.0",
			"platforms": { "darwin-aarch64": { "url": "https://example.test/a", "signature": "s" } },
		}))
		.expect("a feed")
		.offer_for(&a_running_app())
		.expect("the feed reads")
		.expect("an offer")
	}

	#[test]
	fn a_check_is_refused_while_another_check_or_a_download_or_a_restart_is_held() {
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

	#[test]
	fn an_offered_release_is_claimed_by_one_install_only() {
		let updates = updates_in(UpdateState::UpToDate);
		updates.settle_check(
			UpdateState::Available { version: "0.25.0".to_owned() },
			Some(an_offer()),
		);

		let first = updates.claim_install();
		let second = updates.claim_install();

		assert_eq!(first.map(|offer| offer.version), Ok("0.25.0".to_owned()));
		assert_eq!(
			second.map(|offer| offer.version),
			Err(UpdateState::Downloading { downloaded_bytes: 0, total_bytes: None })
		);
	}

	#[test]
	fn a_restart_outside_ready_to_restart_answers_the_state_unchanged() {
		for state in
			[UpdateState::UpToDate, UpdateState::Available { version: "0.25.0".to_owned() }]
		{
			let updates = updates_in(state.clone());

			assert_eq!(updates.claim_restart(), Err(state.clone()));
			assert_eq!(updates.state(), state);
		}
	}

	#[tokio::test(start_paused = true)]
	async fn a_check_past_its_bound_fails_naming_the_bound() {
		let answered =
			within(CHECK_BOUND, CHECK_EXCEEDED, std::future::pending::<Result<(), String>>()).await;

		assert_eq!(answered, Err("the update check took longer than 30 s".to_owned()));
	}

	#[tokio::test(start_paused = true)]
	async fn a_download_past_its_bound_fails_naming_the_bound() {
		let answered =
			within(DOWNLOAD_BOUND, DOWNLOAD_EXCEEDED, std::future::pending::<Result<(), String>>())
				.await;

		assert_eq!(answered, Err("the update download took longer than 15 min".to_owned()));
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

		fn started_on_stable(&self, core: &CoreOfItsOwn) -> tokio::task::JoinHandle<UpdateState> {
			let core = core.core().clone();
			let (asked, entered, released) =
				(self.asked.clone(), self.entered.clone(), self.released.clone());
			core.state::<Updates>()
				.claim_check(UpdateChannel::Stable)
				.expect("the first check is claimed");
			tokio::spawn(async move {
				settled_after(&core, UpdateChannel::Stable, |channel| {
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

	fn a_core() -> CoreOfItsOwn {
		let core = a_core_of_its_own("updates");
		core.manage(Updates::new(UpdateSource::release(), a_running_app()));
		core
	}

	fn claimed(core: &CoreOfItsOwn, channel: UpdateChannel) -> Result<(), UpdateState> {
		core.state::<Updates>().claim_check(channel)
	}

	#[tokio::test]
	async fn a_channel_switched_during_a_check_drops_its_offer_and_checks_the_stored_channel() {
		let core = a_core();
		let check = HeldCheck::new();
		let running = check.started_on_stable(&core);
		check.entered.notified().await;

		let answered = claimed(&core, UpdateChannel::Beta);
		check.released.notify_one();
		let settled = running.await.expect("the check settles");

		assert_eq!(answered, Err(UpdateState::Checking));
		assert_eq!(check.asked(), vec![UpdateChannel::Stable, UpdateChannel::Beta]);
		assert_eq!(settled, UpdateState::UpToDate);
		assert_eq!(core.state::<Updates>().state(), UpdateState::UpToDate);
	}

	#[tokio::test]
	async fn a_channel_switched_back_during_a_check_keeps_its_result() {
		let core = a_core();
		let check = HeldCheck::new();
		let running = check.started_on_stable(&core);
		check.entered.notified().await;

		assert_eq!(claimed(&core, UpdateChannel::Beta), Err(UpdateState::Checking));
		assert_eq!(claimed(&core, UpdateChannel::Stable), Err(UpdateState::Checking));
		check.released.notify_one();
		let settled = running.await.expect("the check settles");

		let offered = UpdateState::Available { version: "0.24.2".to_owned() };
		assert_eq!(check.asked(), vec![UpdateChannel::Stable]);
		assert_eq!(settled, offered);
		assert_eq!(core.state::<Updates>().state(), offered);
	}
}
