use super::commands::ready;
use super::contract::{JoinedSpaceError, JoinedSpaceWait};
use super::relay::RelayGuests;
use super::roster_set::{verified_set, Handed, HeldRoster};
use super::wait_reason::{last_wait, wait_of, Stall};
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

pub(super) fn device_keys(
	core: &crate::core_context::Core,
) -> Result<DeviceKeys, JoinedSpaceError> {
	core.try_state::<DeviceKeysState>()
		.ok_or_else(|| JoinedSpaceError::KeyStore {
			detail: "the device keys are not loaded".to_owned(),
		})?
		.keys()
		.map(|keys| DeviceKeys::from_secret(&keys.secret()))
		.map_err(key_store)
}

pub(super) async fn held(
	core: &crate::core_context::Core,
	instance_id: &str,
) -> Result<Result<Held, JoinedSpaceWait>, JoinedSpaceError> {
	let device = device_keys(core)?;
	let space = space_keys(core)?.held(&key_item(instance_id)).map_err(key_store)?;
	let Some(space) = space.filter(|_| !is_unadmitted(core, instance_id)) else {
		return Ok(Err(last_wait(core, instance_id)));
	};
	let Some(roster) = roster_verified(core, instance_id, &device).await? else {
		return Ok(Err(wait_of(Stall::RosterMissing)));
	};
	Ok(Ok(Held { device, space, roster }))
}

pub(super) fn wait(
	core: &crate::core_context::Core,
	instance_id: &str,
) -> Result<Option<JoinedSpaceWait>, JoinedSpaceError> {
	let space = space_keys(core)?.held(&key_item(instance_id)).map_err(key_store)?;
	let is_waiting = space.is_none() || is_unadmitted(core, instance_id);
	Ok(is_waiting.then(|| last_wait(core, instance_id)))
}

fn is_unadmitted(core: &crate::core_context::Core, instance_id: &str) -> bool {
	core.try_state::<RelayGuests>().is_some_and(|guests| guests.is_unadmitted(instance_id))
}

pub(super) fn wait_or_unread(
	core: &crate::core_context::Core,
	id: &str,
	instance_id: &str,
) -> Option<JoinedSpaceWait> {
	wait(core, instance_id).unwrap_or_else(|failure| {
		let unread = wait_of(Stall::KeyRead(failure));
		log::warn!(
			"joined space {id} (instance {instance_id}) waits for its host ({:?}): {}",
			unread.reason,
			unread.detail
		);
		Some(unread)
	})
}

pub(super) async fn roster(
	core: &crate::core_context::Core,
	instance_id: &str,
) -> Result<Option<HeldRoster>, JoinedSpaceError> {
	roster_verified(core, instance_id, &device_keys(core)?).await
}

async fn roster_verified(
	core: &crate::core_context::Core,
	instance_id: &str,
	device: &DeviceKeys,
) -> Result<Option<HeldRoster>, JoinedSpaceError> {
	let state = core.state::<db::DatabaseState>();
	let stored = ready(&state)?.joined_space_relay().roster(instance_id.to_owned()).await?;
	let Some(stored) = stored else {
		return Ok(None);
	};
	let set: RosterSet =
		serde_json::from_str(&stored.roster).map_err(|_| JoinedSpaceError::BadSignature)?;
	verified_set(set, None, &device.device_id()).map(Some)
}

pub(super) async fn kept(
	core: &crate::core_context::Core,
	instance_id: &str,
	handed: &Handed,
) -> Result<bool, JoinedSpaceError> {
	let space_keys = space_keys(core)?;
	if !roster_kept(core, instance_id, &handed.roster).await? {
		return Ok(false);
	}
	let space = &handed.space;
	let state = core.state::<db::DatabaseState>();
	let relay = ready(&state)?.joined_space_relay();
	relay.counter_started(instance_id.to_owned(), space.key_id).await?;
	let copy = HeldSpaceKey { key_id: space.key_id, key: space.key.clone() };
	space_keys.stored(&key_item(instance_id), copy).map_err(key_store)?;
	if let Some(guests) = core.try_state::<RelayGuests>() {
		guests.admitted(instance_id);
	}
	Ok(true)
}

pub(super) async fn roster_kept(
	core: &crate::core_context::Core,
	instance_id: &str,
	roster: &HeldRoster,
) -> Result<bool, JoinedSpaceError> {
	let set = &roster.set;
	let roster = serde_json::to_string(set).map_err(|failure| JoinedSpaceError::KeyStore {
		detail: format!("the roster set did not serialise: {failure}"),
	})?;
	let held = joined_space_relay::HeldRoster { key_id: set.key_id, version: set.version, roster };
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.joined_space_relay().roster_kept(instance_id.to_owned(), held).await?)
}

fn space_keys(
	core: &crate::core_context::Core,
) -> Result<crate::core_context::Managed<'_, SpaceKeys>, JoinedSpaceError> {
	core.try_state::<SpaceKeys>().ok_or_else(|| JoinedSpaceError::KeyStore {
		detail: "the space key store is not loaded".to_owned(),
	})
}

fn key_item(instance_id: &str) -> String {
	format!("{KEY_ITEM_PREFIX}{instance_id}")
}

fn key_store(failure: DeviceKeysError) -> JoinedSpaceError {
	JoinedSpaceError::KeyStore { detail: format!("{failure:?}") }
}
