use std::collections::BTreeMap;

use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::MutexGuard;

use super::contract::{AccountDevices, MembersError, RosterDevice};
use super::roster::{self, VerifiedRoster};
use super::{wire, Hosting};
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::fingerprint::fingerprint;
use crate::crypto::space_key::HeldSpaceKey;
use crate::db::{Database, DatabaseState};
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;

pub async fn devices<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	let _turn = settled_turn(app, &space_id).await?;
	listed_devices(app, &space_id).await
}

pub async fn remove_device<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	device_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	let host = host_device(app)?;
	let _turn = settled_turn(app, &space_id).await?;
	let roster = roster_of(app, &space_id, &host).await?;
	let target = roster
		.rows
		.iter()
		.find(|row| row.rostered.device_id.to_string() == device_id)
		.ok_or(MembersError::UnknownDevice)?;
	if target.rostered.device_id == host.device_id() {
		return Err(MembersError::HostDeviceNotRemovable);
	}
	database_of(app)?
		.space_relay()
		.device_revoked(space_id.clone(), device_id)
		.await
		.map_err(SpaceError::from)?;
	rotated(app, &space_id).await?;
	listed_devices(app, &space_id).await
}

const NO_ROSTER_ROW: &str = "no roster row has that device";

pub(super) enum Revocation {
	Applied,
	Ignored(&'static str),
}

pub(super) async fn device_left<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	relay_device_id: &str,
	account_id: &str,
) -> Result<Revocation, MembersError> {
	let host = host_device(app)?;
	let _turn = settled_turn(app, space_id).await?;
	let space_relay = database_of(app)?.space_relay();
	let row = space_relay
		.roster_row_of_relay_device(space_id.to_owned(), relay_device_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	let Some(row) = row else {
		return Ok(Revocation::Ignored(NO_ROSTER_ROW));
	};
	if row.device_id == host.device_id().to_string() {
		return Ok(Revocation::Ignored("it names the host device"));
	}
	if row.account_id != account_id {
		return Ok(Revocation::Ignored("the roster row belongs to another account"));
	}
	let is_deleted = space_relay
		.device_revoked(space_id.to_owned(), row.device_id)
		.await
		.map_err(SpaceError::from)?;
	if !is_deleted {
		return Ok(Revocation::Ignored(NO_ROSTER_ROW));
	}
	rotated(app, space_id).await?;
	Ok(Revocation::Applied)
}

pub(super) async fn settled_turn<'a, R: Runtime>(
	app: &'a AppHandle<R>,
	space_id: &str,
) -> Result<MutexGuard<'a, ()>, MembersError> {
	let turn = app.state::<Hosting>().inner().members_turn.lock().await;
	let is_pending = database_of(app)?
		.space_relay()
		.is_rotation_pending(space_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	if is_pending {
		rotated(app, space_id).await?;
	}
	Ok(turn)
}

pub(super) async fn member_removed<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	account_id: &str,
) -> Result<(), MembersError> {
	account_revoked(app, space_id, account_id).await?;
	rotated(app, space_id).await
}

pub(super) async fn invitation_withdrawn<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	account_id: &str,
) -> Result<(), MembersError> {
	if account_revoked(app, space_id, account_id).await? > 0 {
		rotated(app, space_id).await?;
	}
	Ok(())
}

async fn account_revoked<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	account_id: &str,
) -> Result<usize, MembersError> {
	let revoked = database_of(app)?
		.space_relay()
		.account_revoked(space_id.to_owned(), account_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	Ok(revoked)
}

async fn listed_devices<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
) -> Result<Vec<AccountDevices>, MembersError> {
	let host = host_device(app)?;
	let roster = roster_of(app, space_id, &host).await?;
	Ok(grouped(&roster, &host))
}

pub(super) fn host_device<R: Runtime>(app: &AppHandle<R>) -> Result<DeviceKeys, MembersError> {
	app.state::<DeviceKeysState>()
		.keys()
		.map(|keys| DeviceKeys::from_secret(&keys.secret()))
		.map_err(|error| MembersError::DeviceKeys { error })
}

pub(super) fn database_of<R: Runtime>(app: &AppHandle<R>) -> Result<&Database, MembersError> {
	Ok(ready(app.state::<DatabaseState>().inner())?)
}

async fn roster_of<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	host: &DeviceKeys,
) -> Result<VerifiedRoster, MembersError> {
	let database = database_of(app)?;
	let roster = roster::verified_roster(database, space_id, &host.signing_public()).await;
	Ok(roster.map_err(SpaceError::from)?)
}

async fn rotated<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Result<(), MembersError> {
	let not_rotated = |reason: String| MembersError::KeyNotRotated { reason };
	let space_keys = app
		.try_state::<SpaceKeys>()
		.ok_or_else(|| not_rotated("the space key store is not loaded".to_owned()))?;
	let current = space_keys
		.watched(space_id)
		.map_err(|failure| not_rotated(format!("the space key did not read: {failure:?}")))?;
	if let Some(current) = current {
		let key_id = current.borrow().key_id;
		let next_id = key_id
			.checked_add(1)
			.ok_or_else(|| not_rotated(format!("space key_id {key_id} has no successor")))?;
		let next = HeldSpaceKey::under(next_id)
			.map_err(|failure| not_rotated(format!("no space key was generated: {failure:?}")))?;
		wire::space_key_stored(app, &space_keys, space_id, next).await.map_err(not_rotated)?;
		eprintln!("hosted space {space_id} rotated its space key to key_id {next_id}");
	}
	database_of(app)?
		.space_relay()
		.rotation_settled(space_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	Ok(())
}

fn grouped(roster: &VerifiedRoster, host: &DeviceKeys) -> Vec<AccountDevices> {
	let host_id = host.device_id();
	let mut accounts: BTreeMap<&str, Vec<RosterDevice>> = BTreeMap::new();
	for row in &roster.rows {
		let rostered = &row.rostered;
		accounts.entry(rostered.account_id.as_str()).or_default().push(RosterDevice {
			device_id: rostered.device_id.to_string(),
			fingerprint: fingerprint(&rostered.signing).map(str::to_owned).to_vec(),
			added_at: row.row.added_at,
			is_host: rostered.device_id == host_id,
		});
	}
	accounts
		.into_iter()
		.map(|(account_id, mut devices)| {
			devices.sort_by_key(|device| device.added_at);
			AccountDevices { account_id: account_id.to_owned(), devices }
		})
		.collect()
}
