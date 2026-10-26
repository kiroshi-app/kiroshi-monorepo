mod admission;
pub mod authorship;
pub mod bridge;
pub mod commands;
pub mod contract;
mod devices;
pub(crate) mod handover;
#[cfg(test)]
mod member_socket;
mod members;
mod reach;
pub(crate) mod relay;
pub(crate) mod replay;
pub mod roster;
#[cfg(test)]
mod sealing_member;
pub(crate) mod wire;

pub(crate) use members::MEMBERS_EVERY;

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch;

use crate::account::cloud::Cloud;
use crate::account::session::AccountSession;
use crate::db::repositories::conversations::AvatarBlot;
use crate::db::repositories::space_hosting::Registration;
use crate::db::DatabaseState;
use crate::environment::contract::EnvError;
use crate::events::{self, HOSTING_CHANGED};
use crate::host_api::token;
use crate::routines::webhook::Webhook;
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;
use authorship::RelayedMembers;
use bridge::LocalApi;
use contract::{HostingChanged, HostingFailureKind, HostingState, SpaceMembers};
use relay::Hosted;

pub struct Hosting {
	cloud: Cloud,
	local: Option<LocalApi>,
	hosts: Mutex<HashMap<String, Host>>,
	turn: tokio::sync::Mutex<()>,
	members_turn: tokio::sync::Mutex<()>,
	members_every: Duration,
	relayed: RelayedMembers,
}

#[derive(Default)]
struct Host {
	state: HostingState,
	instance_id: Option<String>,
	run: Option<Run>,
	members: Option<SpaceMembers>,
}

struct Run {
	stop: watch::Sender<bool>,
	handle: JoinHandle<()>,
}

impl Hosting {
	pub fn new(api_url: &str, local: Option<LocalApi>) -> Self {
		Self {
			cloud: Cloud::new(api_url),
			local,
			hosts: Mutex::new(HashMap::new()),
			turn: tokio::sync::Mutex::new(()),
			members_turn: tokio::sync::Mutex::new(()),
			members_every: members::MEMBERS_EVERY,
			relayed: RelayedMembers::default(),
		}
	}

	#[cfg(test)]
	fn polling_members_every(self, members_every: Duration) -> Self {
		Self { members_every, ..self }
	}

	pub fn current(&self, space_id: &str) -> HostingState {
		self.hosts().get(space_id).map(|host| host.state.clone()).unwrap_or_default()
	}

	pub fn is_hosting(&self) -> bool {
		self.hosts().values().any(|host| host.state.is_running())
	}

	fn hosts(&self) -> MutexGuard<'_, HashMap<String, Host>> {
		self.hosts.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn taken_run(&self, space_id: &str) -> Option<Run> {
		self.hosts().get_mut(space_id).and_then(|host| host.run.take())
	}

	fn taken_runs(&self) -> Vec<(String, Run)> {
		self.hosts()
			.iter_mut()
			.filter_map(|(space_id, host)| host.run.take().map(|run| (space_id.clone(), run)))
			.collect()
	}
}

pub fn local_api<R: Runtime>(app: &AppHandle<R>) -> Option<LocalApi> {
	let Some(origin) = app.try_state::<Webhook>().and_then(|webhook| webhook.origin()) else {
		log::error!("no space can be hosted: the local host api is not listening");
		return None;
	};
	let token = match token::loaded(app) {
		Ok(token) => token,
		Err(failure) => {
			log::error!("no space can be hosted: the host token was not loaded: {failure:?}");
			return None;
		}
	};
	LocalApi::new(origin, token.bearer().to_owned())
		.inspect_err(|failure| log::error!("no space can be hosted: {failure}"))
		.ok()
}

fn entered<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: Option<&str>,
	state: HostingState,
) {
	let hosting = app.state::<Hosting>();
	let instance_id = {
		let mut hosts = hosting.hosts();
		let host = hosts.entry(space_id.to_owned()).or_default();
		if let Some(instance_id) = instance_id {
			host.instance_id = Some(instance_id.to_owned());
		}
		if host.state == state {
			return;
		}
		host.state = state.clone();
		host.instance_id.clone()
	};
	let instance_id = instance_id.as_deref().unwrap_or("none");
	match &state {
		HostingState::Failed { failure, detail } => log::error!(
			"hosting of space {space_id} (instance {instance_id}) failed: {failure:?}: {detail}"
		),
		_ => log::info!("hosting of space {space_id} (instance {instance_id}) entered {state:?}"),
	}
	let changed = HostingChanged { space_id: space_id.to_owned(), state };
	if let Err(error) = events::emit(app, HOSTING_CHANGED, changed) {
		log::error!("the hosting state of space {space_id} did not reach the front: {error}");
	}
}

pub async fn start<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	let hosting = app.state::<Hosting>();
	let _turn = hosting.turn.lock().await;
	let database_state = app.state::<DatabaseState>();
	let database = ready(&database_state)?;
	let registration = database.space_hosting().registration(space_id.clone()).await?;
	let current = hosting.current(&space_id);
	if current.is_running() {
		return Ok(current);
	}
	database.space_hosting().set_hosted(space_id.clone(), true).await?;
	Ok(begun(app, &hosting, space_id, registration).await)
}

async fn begun<R: Runtime>(
	app: &AppHandle<R>,
	hosting: &Hosting,
	space_id: String,
	registration: Registration,
) -> HostingState {
	finished(&space_id, hosting.taken_run(&space_id)).await;
	let instance_id = registration.instance_id.clone();
	let state = opening(Opening {
		bearer: app.state::<AccountSession>().bearer(),
		is_awaiting_approval: crate::devices::is_awaiting_approval(app),
		is_local_api_listening: hosting.local.is_some(),
	});
	entered(app, &space_id, instance_id.as_deref(), state.clone());
	if let (HostingState::Connecting, Some(local)) = (&state, &hosting.local) {
		let (stop, stopped) = watch::channel(false);
		let hosted = Hosted {
			space_id: space_id.clone(),
			name: registration.name,
			colour: registration.colour,
			instance_id,
		};
		let handle =
			tauri::async_runtime::spawn(relay::hosted(app.clone(), hosted, local.clone(), stopped));
		hosting.hosts().entry(space_id).or_default().run = Some(Run { stop, handle });
	}
	state
}

struct Opening {
	bearer: Result<Option<String>, EnvError>,
	is_awaiting_approval: bool,
	is_local_api_listening: bool,
}

fn opening(preconditions: Opening) -> HostingState {
	let failed =
		|failure, detail: &str| HostingState::Failed { failure, detail: detail.to_owned() };
	match preconditions {
		Opening { bearer: Ok(None), .. } => HostingState::NeedsSignIn,
		Opening { bearer: Err(error), .. } => failed(
			HostingFailureKind::AccountSessionStoreFailed,
			&format!("the account session store failed: {error:?}"),
		),
		Opening { is_awaiting_approval: true, .. } => failed(
			HostingFailureKind::DeviceAwaitingApproval,
			"this device awaits its approval by another device of the account",
		),
		Opening { is_local_api_listening: false, .. } => failed(
			HostingFailureKind::LocalHostApiNotListening,
			"the local host api is not listening",
		),
		Opening { .. } => HostingState::Connecting,
	}
}

async fn finished(space_id: &str, run: Option<Run>) {
	let Some(run) = run else {
		return;
	};
	run.stop.send_replace(true);
	if let Err(error) = run.handle.await {
		log::error!("the relay of space {space_id} ended abnormally: {error}");
	}
}

pub async fn stop<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	let hosting = app.state::<Hosting>();
	let _turn = hosting.turn.lock().await;
	let database_state = app.state::<DatabaseState>();
	let database = ready(&database_state)?;
	let registration = database.space_hosting().registration(space_id.clone()).await?;
	finished(&space_id, hosting.taken_run(&space_id)).await;
	database.space_hosting().set_hosted(space_id.clone(), false).await?;
	entered(app, &space_id, registration.instance_id.as_deref(), HostingState::Off);
	Ok(HostingState::Off)
}

pub async fn forgotten<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let Some(hosting) = app.try_state::<Hosting>() else {
		return;
	};
	let _turn = hosting.turn.lock().await;
	let Some(run) = hosting.taken_run(space_id) else {
		return;
	};
	finished(space_id, Some(run)).await;
	entered(app, space_id, None, HostingState::Off);
	hosting.hosts().remove(space_id);
}

pub async fn signed_out<R: Runtime>(app: &AppHandle<R>) {
	let Some(hosting) = app.try_state::<Hosting>() else {
		return;
	};
	let _turn = hosting.turn.lock().await;
	let mut space_ids = Vec::new();
	for (space_id, run) in hosting.taken_runs() {
		finished(&space_id, Some(run)).await;
		space_ids.push(space_id);
	}
	space_ids.extend(flagged(app).await);
	for space_id in space_ids {
		entered(app, &space_id, None, HostingState::NeedsSignIn);
	}
}

pub async fn described<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	name: &str,
	colour: Option<AvatarBlot>,
) {
	let Some(hosting) = app.try_state::<Hosting>() else {
		return;
	};
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => {
			return log::warn!("instance {instance_id} was not described to the relay: signed out")
		}
		Err(error) => {
			return log::warn!(
				"instance {instance_id} was not described to the relay: the account session store failed: {error:?}"
			)
		}
	};
	if let Err(failure) = hosting.cloud.describe_instance(&bearer, instance_id, name, colour).await
	{
		log::warn!("instance {instance_id} was not described to the relay: {failure}");
	}
}

pub fn renamed<R: Runtime>(app: &AppHandle<R>) {
	let Some(hosting) = app.try_state::<Hosting>() else {
		return;
	};
	for host in hosting.hosts().values_mut() {
		host.members = None;
	}
}

pub async fn resumed<R: Runtime>(app: &AppHandle<R>) {
	let Some(hosting) = app.try_state::<Hosting>() else {
		return;
	};
	let _turn = hosting.turn.lock().await;
	let database_state = app.state::<DatabaseState>();
	let Ok(database) = ready(&database_state) else {
		return log::error!("no hosted space was resumed: the database is unavailable");
	};
	for space_id in flagged(app).await {
		if hosting.current(&space_id).is_running() {
			continue;
		}
		match database.space_hosting().registration(space_id.clone()).await {
			Ok(registration) => {
				begun(app, &hosting, space_id, registration).await;
			}
			Err(failure) => log::error!("hosted space {space_id} was not resumed: {failure:?}"),
		}
	}
}

async fn flagged<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
	let database_state = app.state::<DatabaseState>();
	let listed = match ready(&database_state) {
		Ok(database) => database.space_hosting().hosted_space_ids().await.map_err(SpaceError::from),
		Err(failure) => Err(failure),
	};
	listed.unwrap_or_else(|failure| {
		log::error!("the hosted spaces were not read: {failure:?}");
		Vec::new()
	})
}

#[cfg(test)]
mod tests;
