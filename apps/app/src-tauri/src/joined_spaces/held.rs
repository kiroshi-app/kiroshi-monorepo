use tauri::{AppHandle, Manager, Runtime};

use super::commands::ready;
use super::contract::JoinedSpaceError;
use super::roster_set::{verified_set, Handed, HeldRoster};
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::contract::DeviceKeysError;
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::space_key::HeldSpaceKey;
use crate::db;
use crate::db::repositories::joined_space_relay;
use crate::hosting::roster::RosterSet;

const KEY_ITEM_PREFIX: &str = "joined-";

pub(super) struct Held {
	pub(super) device: DeviceKeys,
	pub(super) space: HeldSpaceKey,
	pub(super) roster: HeldRoster,
}

pub(super) fn device_keys<R: Runtime>(app: &AppHandle<R>) -> Result<DeviceKeys, JoinedSpaceError> {
	app.try_state::<DeviceKeysState>()
		.ok_or_else(|| JoinedSpaceError::KeyStore {
			detail: "the device keys are not loaded".to_owned(),
		})?
		.keys()
		.map(|keys| DeviceKeys::from_secret(&keys.secret()))
		.map_err(key_store)
}

pub(super) async fn held<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
) -> Result<Option<Held>, JoinedSpaceError> {
	let device = device_keys(app)?;
	let Some(space) = space_keys(app)?.held(&key_item(instance_id)).map_err(key_store)? else {
		return Ok(None);
	};
	let roster = roster_verified(app, instance_id, &device).await?;
	Ok(roster.map(|roster| Held { device, space, roster }))
}

pub(super) async fn roster<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
) -> Result<Option<HeldRoster>, JoinedSpaceError> {
	roster_verified(app, instance_id, &device_keys(app)?).await
}

async fn roster_verified<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	device: &DeviceKeys,
) -> Result<Option<HeldRoster>, JoinedSpaceError> {
	let state = app.state::<db::DatabaseState>();
	let stored = ready(&state)?.joined_space_relay().roster(instance_id.to_owned()).await?;
	let Some(stored) = stored else {
		return Ok(None);
	};
	let set: RosterSet =
		serde_json::from_str(&stored.roster).map_err(|_| JoinedSpaceError::BadSignature)?;
	verified_set(set, None, &device.device_id()).map(Some)
}

pub(super) async fn kept<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	handed: &Handed,
) -> Result<bool, JoinedSpaceError> {
	let space_keys = space_keys(app)?;
	let set = &handed.roster.set;
	let roster = serde_json::to_string(set).map_err(|failure| JoinedSpaceError::KeyStore {
		detail: format!("the roster set did not serialise: {failure}"),
	})?;
	let held = joined_space_relay::HeldRoster { key_id: set.key_id, version: set.version, roster };
	let state = app.state::<db::DatabaseState>();
	let relay = ready(&state)?.joined_space_relay();
	if !relay.roster_kept(instance_id.to_owned(), held).await? {
		return Ok(false);
	}
	let space = &handed.space;
	relay.counter_started(instance_id.to_owned(), space.key_id).await?;
	let copy = HeldSpaceKey { key_id: space.key_id, key: space.key.clone() };
	space_keys.stored(&key_item(instance_id), copy).map_err(key_store)?;
	Ok(true)
}

fn space_keys<R: Runtime>(
	app: &AppHandle<R>,
) -> Result<tauri::State<'_, SpaceKeys>, JoinedSpaceError> {
	app.try_state::<SpaceKeys>().ok_or_else(|| JoinedSpaceError::KeyStore {
		detail: "the space key store is not loaded".to_owned(),
	})
}

fn key_item(instance_id: &str) -> String {
	format!("{KEY_ITEM_PREFIX}{instance_id}")
}

fn key_store(failure: DeviceKeysError) -> JoinedSpaceError {
	JoinedSpaceError::KeyStore { detail: format!("{failure:?}") }
}
