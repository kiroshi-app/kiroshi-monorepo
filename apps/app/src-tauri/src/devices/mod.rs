pub mod commands;
pub mod contract;

use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use chrono::{DateTime, SecondsFormat, TimeDelta, Utc};
use ed25519_dalek::VerifyingKey;
use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::watch;
use tokio::time::sleep;

use crate::account::cloud::{
	Cloud, CloudAccountDevice, CurrentDevice, DeviceCallError, DeviceRegisterError,
};
use crate::account::contract::AccountState;
use crate::account::session::{self, AccountSession};
use crate::crypto::commands::DeviceKeysState;
use crate::crypto::fingerprint::fingerprint;
use crate::db::DatabaseState;
use crate::events::{
	self, DEVICE_APPROVAL_CHANGED, DEVICE_APPROVAL_REQUESTED, DEVICE_APPROVAL_SETTLED,
};
use crate::hosting;
use contract::{
	AccountDevice, DeviceApproval, DeviceApprovalRequested, DeviceApprovalSettled, DeviceError,
	DeviceStatus,
};

const PENDING_EVERY: Duration = Duration::from_secs(5);

const APPROVED_EVERY: Duration = Duration::from_secs(15);

const APPROVAL_WINDOW_MINUTES: i64 = 30;

pub struct Devices {
	cloud: Cloud,
	approval: watch::Sender<DeviceApproval>,
	pending_every: Duration,
	approved_every: Duration,
	follow: Mutex<Option<JoinHandle<()>>>,
	hosts_resuming: Mutex<Option<JoinHandle<()>>>,
	announced: Mutex<HashMap<String, String>>,
}

enum Unregistered {
	SignedOut,
	Refused(String),
	Unreachable(String),
}

impl From<Unregistered> for DeviceError {
	fn from(unregistered: Unregistered) -> Self {
		match unregistered {
			Unregistered::SignedOut => DeviceError::SignedOut,
			Unregistered::Refused(detail) | Unregistered::Unreachable(detail) => {
				DeviceError::Unreachable { detail }
			}
		}
	}
}

impl Devices {
	pub fn new(api_url: &str) -> Self {
		Self {
			cloud: Cloud::new(api_url),
			approval: watch::channel(DeviceApproval::None).0,
			pending_every: PENDING_EVERY,
			approved_every: APPROVED_EVERY,
			follow: Mutex::new(None),
			hosts_resuming: Mutex::new(None),
			announced: Mutex::new(HashMap::new()),
		}
	}

	#[cfg(test)]
	pub(crate) fn polling_every(self, pending_every: Duration, approved_every: Duration) -> Self {
		Self { pending_every, approved_every, ..self }
	}

	pub fn current(&self) -> DeviceApproval {
		self.approval.borrow().clone()
	}

	fn follow(&self) -> MutexGuard<'_, Option<JoinHandle<()>>> {
		self.follow.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn hosts_resuming(&self) -> MutexGuard<'_, Option<JoinHandle<()>>> {
		self.hosts_resuming.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn announced(&self) -> MutexGuard<'_, HashMap<String, String>> {
		self.announced.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub fn is_awaiting_approval<R: Runtime>(app: &AppHandle<R>) -> bool {
	app.try_state::<Devices>().is_some_and(|devices| {
		matches!(devices.current(), DeviceApproval::Pending { .. } | DeviceApproval::Expired)
	})
}

pub async fn signed_in<R: Runtime>(app: &AppHandle<R>) {
	let Some(devices) = app.try_state::<Devices>() else {
		return;
	};
	let previous = devices.follow().take();
	stopped(previous).await;
	*devices.follow() = Some(tauri::async_runtime::spawn(followed(app.clone())));
}

pub async fn signed_out<R: Runtime>(app: &AppHandle<R>) {
	let Some(devices) = app.try_state::<Devices>() else {
		return;
	};
	let follow = devices.follow().take();
	stopped(follow).await;
	let resuming = devices.hosts_resuming().take();
	if let Some(resuming) = resuming {
		if let Err(error) = resuming.await {
			eprintln!("the hosts resumed on approval ended abnormally: {error}");
		}
	}
	devices.announced().clear();
	entered(app, &devices, DeviceApproval::None);
}

async fn stopped(follow: Option<JoinHandle<()>>) {
	let Some(follow) = follow else {
		return;
	};
	follow.abort();
	if let Err(error) = follow.await {
		if !matches!(&error, tauri::Error::JoinError(joined) if joined.is_cancelled()) {
			eprintln!("the device approval follow ended abnormally: {error}");
		}
	}
}

fn entered<R: Runtime>(app: &AppHandle<R>, devices: &Devices, next: DeviceApproval) {
	let is_changed = devices.approval.send_if_modified(|held| {
		let is_kept =
			*held == next || (*held == DeviceApproval::Approved && next != DeviceApproval::None);
		if !is_kept {
			*held = next.clone();
		}
		!is_kept
	});
	if !is_changed {
		return;
	}
	eprintln!("this device entered approval {next:?}");
	if next == DeviceApproval::Approved {
		hosts_resumed(app, devices);
	}
	if let Err(error) = events::emit(app, DEVICE_APPROVAL_CHANGED, next) {
		eprintln!("the device approval did not reach the front: {error}");
	}
}

fn hosts_resumed<R: Runtime>(app: &AppHandle<R>, devices: &Devices) {
	let resuming = app.clone();
	*devices.hosts_resuming() =
		Some(tauri::async_runtime::spawn(async move { hosting::resumed(&resuming).await }));
}

async fn followed<R: Runtime>(app: AppHandle<R>) {
	let devices = app.state::<Devices>();
	if !registered_once_answered(&app, &devices).await {
		return;
	}
	let mut approval = devices.approval.subscribe();
	loop {
		devices.cloud.unpaused().await;
		let held = approval.borrow_and_update().clone();
		match held {
			DeviceApproval::Pending { expires_at } => {
				sleep(devices.pending_every).await;
				pending_followed(&app, &devices, &expires_at).await;
			}
			DeviceApproval::Approved => {
				requests_followed(&app, &devices).await;
				sleep(devices.approved_every).await;
			}
			DeviceApproval::Expired | DeviceApproval::None => {
				if approval.changed().await.is_err() {
					return;
				}
			}
		}
	}
}

async fn registered_once_answered<R: Runtime>(app: &AppHandle<R>, devices: &Devices) -> bool {
	loop {
		devices.cloud.unpaused().await;
		match registration(app, devices).await {
			Ok(approval) => {
				entered(app, devices, approval);
				return true;
			}
			Err(Unregistered::Unreachable(reason)) => {
				eprintln!("this device did not register with the relay, retrying: {reason}");
				sleep(devices.pending_every).await;
			}
			Err(Unregistered::Refused(reason)) => {
				eprintln!("this device did not register with the relay: {reason}");
				hosts_resumed(app, devices);
				return false;
			}
			Err(Unregistered::SignedOut) => return false,
		}
	}
}

async fn registration<R: Runtime>(
	app: &AppHandle<R>,
	devices: &Devices,
) -> Result<DeviceApproval, Unregistered> {
	let bearer = bearer_of(app).map_err(|failure| match failure {
		DeviceError::SignedOut => Unregistered::SignedOut,
		failure => Unregistered::Refused(format!("{failure:?}")),
	})?;
	let AccountState::SignedIn(account) = app.state::<AccountSession>().current() else {
		return Err(Unregistered::SignedOut);
	};
	let keys_state = app
		.try_state::<DeviceKeysState>()
		.ok_or_else(|| Unregistered::Refused("the device keys are not loaded".to_owned()))?;
	let keys = keys_state.keys().map_err(|failure| {
		Unregistered::Refused(format!("the device keys are unavailable: {failure:?}"))
	})?;
	let registered = match devices.cloud.register_device(&bearer, &account.id, keys).await {
		Ok(registered) => registered,
		Err(DeviceRegisterError::Revoked) => {
			signed_out_on_401(app, &bearer);
			return Err(Unregistered::SignedOut);
		}
		Err(DeviceRegisterError::Refused(refusal)) => {
			return Err(Unregistered::Refused(refusal.to_string()))
		}
		Err(DeviceRegisterError::Unreachable(reason)) => {
			return Err(Unregistered::Unreachable(reason))
		}
	};
	let database_state = app
		.try_state::<DatabaseState>()
		.ok_or_else(|| Unregistered::Refused("the database is not loaded".to_owned()))?;
	let database = database_state.inner().as_ref().map_err(|failure| {
		Unregistered::Refused(format!("the database is unavailable: {failure:?}"))
	})?;
	database
		.relay_devices()
		.registered(account.id, keys.device_id().to_string(), registered.id.clone())
		.await
		.map_err(|failure| {
			Unregistered::Refused(format!("the relay device id was not stored: {failure:?}"))
		})?;
	eprintln!(
		"this device registered with the relay as {} ({:?}, transferred {})",
		registered.id, registered.status, registered.transferred
	);
	Ok(match registered.status {
		DeviceStatus::Approved => DeviceApproval::Approved,
		DeviceStatus::Pending => pending_after_registration(devices, &bearer).await,
	})
}

async fn pending_after_registration(devices: &Devices, bearer: &str) -> DeviceApproval {
	match devices.cloud.current_device(bearer).await {
		Ok(current) => approval_of(current),
		Err(failure) => {
			eprintln!("the approval expiry was not read, estimated 30 minutes ahead: {failure}");
			let estimated = Utc::now() + TimeDelta::minutes(APPROVAL_WINDOW_MINUTES);
			DeviceApproval::Pending {
				expires_at: estimated.to_rfc3339_opts(SecondsFormat::Millis, true),
			}
		}
	}
}

fn approval_of(current: CurrentDevice) -> DeviceApproval {
	match (current.status, current.approval_expires_at) {
		(DeviceStatus::Approved, _) => DeviceApproval::Approved,
		(DeviceStatus::Pending, Some(expires_at)) => pending_or_expired(&expires_at),
		(DeviceStatus::Pending, None) => DeviceApproval::Expired,
	}
}

fn pending_or_expired(expires_at: &str) -> DeviceApproval {
	match instant_of(expires_at).is_some_and(|expiry| expiry > Utc::now()) {
		true => DeviceApproval::Pending { expires_at: expires_at.to_owned() },
		false => DeviceApproval::Expired,
	}
}

fn instant_of(stamp: &str) -> Option<DateTime<Utc>> {
	DateTime::parse_from_rfc3339(stamp)
		.map(|instant| instant.with_timezone(&Utc))
		.inspect_err(|error| eprintln!("the relay sent the unreadable instant {stamp}: {error}"))
		.ok()
}

async fn pending_followed<R: Runtime>(app: &AppHandle<R>, devices: &Devices, expires_at: &str) {
	let Ok(bearer) = bearer_of(app) else {
		return;
	};
	let next = match devices.cloud.current_device(&bearer).await {
		Ok(current) => approval_of(current),
		Err(DeviceCallError::Revoked) => return signed_out_on_401(app, &bearer),
		Err(failure) => {
			eprintln!("the approval of this device was not read: {failure}");
			pending_or_expired(expires_at)
		}
	};
	entered(app, devices, next);
}

async fn requests_followed<R: Runtime>(app: &AppHandle<R>, devices: &Devices) {
	let Ok(bearer) = bearer_of(app) else {
		return;
	};
	let listed = match answered(app, &bearer, devices.cloud.account_devices(&bearer).await) {
		Ok(listed) => listed,
		Err(failure) => return eprintln!("the devices of the account were not read: {failure:?}"),
	};
	let (requested, settled) = announcements(&mut devices.announced(), &listed, Utc::now());
	for request in requested {
		if let Err(error) = events::emit(app, DEVICE_APPROVAL_REQUESTED, request) {
			eprintln!("a device approval request did not reach the front: {error}");
		}
	}
	for device_id in settled {
		let settled = DeviceApprovalSettled { device_id };
		if let Err(error) = events::emit(app, DEVICE_APPROVAL_SETTLED, settled) {
			eprintln!("a settled device approval request did not reach the front: {error}");
		}
	}
}

fn announcements(
	announced: &mut HashMap<String, String>,
	listed: &[CloudAccountDevice],
	now: DateTime<Utc>,
) -> (Vec<DeviceApprovalRequested>, Vec<String>) {
	let is_pending = |device_id: &str| {
		listed.iter().any(|device| device.id == device_id && device.status == DeviceStatus::Pending)
	};
	let settled: Vec<String> =
		announced.keys().filter(|device_id| !is_pending(device_id)).cloned().collect();
	for device_id in &settled {
		announced.remove(device_id);
	}
	let mut requested = Vec::new();
	for request in listed.iter().filter_map(|device| request_of(device, now)) {
		if announced.get(&request.device_id) != Some(&request.expires_at) {
			announced.insert(request.device_id.clone(), request.expires_at.clone());
			requested.push(request);
		}
	}
	(requested, settled)
}

fn request_of(device: &CloudAccountDevice, now: DateTime<Utc>) -> Option<DeviceApprovalRequested> {
	if device.status != DeviceStatus::Pending {
		return None;
	}
	let expires_at = device.approval_expires_at.as_deref()?;
	let expiry = instant_of(expires_at).filter(|expiry| *expiry > now)?;
	let asked_at = expiry - TimeDelta::minutes(APPROVAL_WINDOW_MINUTES);
	Some(DeviceApprovalRequested {
		device_id: device.id.clone(),
		name: device.name.clone(),
		kind: device.kind,
		asked_at: asked_at.to_rfc3339_opts(SecondsFormat::Millis, true),
		expires_at: expires_at.to_owned(),
		fingerprint: fingerprint_of(device),
	})
}

fn presented(device: CloudAccountDevice) -> AccountDevice {
	let fingerprint = fingerprint_of(&device);
	AccountDevice {
		id: device.id,
		name: device.name,
		kind: device.kind,
		status: device.status,
		approval_expires_at: device.approval_expires_at,
		last_active_at: device.last_active_at,
		current: device.current,
		fingerprint,
	}
}

fn fingerprint_of(device: &CloudAccountDevice) -> Option<Vec<String>> {
	let encoded = device.ed25519_public_key.as_deref()?;
	let signing = BASE64_URL_SAFE_NO_PAD
		.decode(encoded)
		.ok()
		.and_then(|bytes| <[u8; 32]>::try_from(bytes).ok())
		.and_then(|bytes| VerifyingKey::from_bytes(&bytes).ok());
	let Some(signing) = signing else {
		eprintln!("device {} carries an unreadable ed25519PublicKey", device.id);
		return None;
	};
	Some(fingerprint(&signing).map(str::to_owned).to_vec())
}

fn signed_out_on_401<R: Runtime>(app: &AppHandle<R>, bearer: &str) {
	match app.state::<Devices>().current() {
		DeviceApproval::Pending { .. } => session::device_refused(app, bearer),
		_ => session::revoked(app, bearer),
	}
}

fn bearer_of<R: Runtime>(app: &AppHandle<R>) -> Result<String, DeviceError> {
	match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(DeviceError::SignedOut),
		Err(error) => {
			Err(DeviceError::Unreachable { detail: format!("the session store failed: {error:?}") })
		}
	}
}

fn answered<R: Runtime, T>(
	app: &AppHandle<R>,
	bearer: &str,
	answer: Result<T, DeviceCallError>,
) -> Result<T, DeviceError> {
	answer.map_err(|failure| {
		if failure == DeviceCallError::Revoked {
			signed_out_on_401(app, bearer);
		}
		DeviceError::from(failure)
	})
}

pub async fn retried<R: Runtime>(app: &AppHandle<R>) -> Result<DeviceApproval, DeviceError> {
	let devices = app.state::<Devices>();
	let current = devices.current();
	if current != DeviceApproval::Expired {
		return Ok(current);
	}
	let approval = registration(app, &devices).await?;
	entered(app, &devices, approval);
	Ok(devices.current())
}

pub async fn code_requested<R: Runtime>(app: &AppHandle<R>) -> Result<(), DeviceError> {
	let bearer = bearer_of(app)?;
	let answer = app.state::<Devices>().cloud.request_approval_code(&bearer).await;
	answered(app, &bearer, answer)
}

pub async fn code_submitted<R: Runtime>(app: &AppHandle<R>, code: &str) -> Result<(), DeviceError> {
	let devices = app.state::<Devices>();
	let bearer = bearer_of(app)?;
	let answer = devices.cloud.verify_approval_code(&bearer, code).await;
	answered(app, &bearer, answer)?;
	entered(app, &devices, DeviceApproval::Approved);
	Ok(())
}

pub async fn approved<R: Runtime>(app: &AppHandle<R>, device_id: &str) -> Result<(), DeviceError> {
	let bearer = bearer_of(app)?;
	let answer = app.state::<Devices>().cloud.approve_device(&bearer, device_id).await;
	answered(app, &bearer, answer)
}

pub async fn refused<R: Runtime>(app: &AppHandle<R>, device_id: &str) -> Result<(), DeviceError> {
	let bearer = bearer_of(app)?;
	let answer = app.state::<Devices>().cloud.reject_device(&bearer, device_id).await;
	answered(app, &bearer, answer)
}

pub async fn listed<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<AccountDevice>, DeviceError> {
	let bearer = bearer_of(app)?;
	let answer = app.state::<Devices>().cloud.account_devices(&bearer).await;
	Ok(answered(app, &bearer, answer)?.into_iter().map(presented).collect())
}

pub async fn removed<R: Runtime>(app: &AppHandle<R>, device_id: &str) -> Result<(), DeviceError> {
	let bearer = bearer_of(app)?;
	let answer = app.state::<Devices>().cloud.delete_device(&bearer, device_id).await;
	answered(app, &bearer, answer)
}

#[cfg(test)]
mod tests;
