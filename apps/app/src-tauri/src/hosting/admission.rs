use std::collections::HashSet;

use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use serde_json::json;
use tauri::{AppHandle, Manager, Runtime};

use super::contract::MembersError;
use super::devices::{self, database_of, host_device, settled_turn, Revocation};
use super::members::{self, bearer_of, signed_out_if_revoked};
use super::roster::{self, signed_row, Enrolled, Rostered};
use super::Hosting;
use crate::account::cloud::CloudDevice;
use crate::crypto::device_keys::{DeviceId, DeviceKeys};
use crate::devices::contract::DeviceStatus;
use crate::spaces::contract::SpaceError;

struct ListedDevice {
	relay_device_id: String,
	account_id: String,
	signing: VerifyingKey,
	agreement: [u8; 32],
}

impl ListedDevice {
	fn of(device: &CloudDevice) -> Option<Self> {
		let signing = key_of(&device.ed25519_public_key)?;
		Some(Self {
			relay_device_id: device.device_id.clone(),
			account_id: device.user_id.clone(),
			signing: VerifyingKey::from_bytes(&signing).ok()?,
			agreement: key_of(&device.x25519_public_key)?,
		})
	}

	fn device_id(&self) -> DeviceId {
		DeviceId::of(&self.signing)
	}

	fn is_rostered_as(&self, rostered: &Rostered) -> bool {
		rostered.relay_device_id == self.relay_device_id
			&& rostered.account_id == self.account_id
			&& rostered.signing == self.signing
			&& *rostered.agreement.as_bytes() == self.agreement
	}
}

struct Settled {
	admitted: Vec<String>,
	unlisted: Vec<Rostered>,
}

pub(super) async fn admitted<R: Runtime>(
	app: AppHandle<R>,
	space_id: String,
	instance_id: String,
) -> Result<Vec<String>, MembersError> {
	let Some(settled) = settled(&app, &space_id, &instance_id).await? else {
		return Ok(Vec::new());
	};
	for unlisted in &settled.unlisted {
		let revocation =
			devices::device_left(&app, &space_id, &unlisted.relay_device_id, &unlisted.account_id)
				.await?;
		if let Revocation::Ignored(reason) = revocation {
			log::warn!(
				"hosted space {space_id} kept unlisted device {}: {reason}",
				unlisted.device_id
			);
		}
	}
	if !settled.admitted.is_empty() || !settled.unlisted.is_empty() {
		if let Err(failure) = members::read_back(&app, &space_id, &instance_id).await {
			log::warn!("hosted space {space_id} announced no member list: {failure:?}");
		}
	}
	Ok(settled.admitted)
}

async fn settled<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: &str,
) -> Result<Option<Settled>, MembersError> {
	let host = host_device(app)?;
	let _turn = settled_turn(app, space_id).await?;
	let listed = match device_list(app, instance_id).await {
		Ok(listed) => listed,
		Err(failure) => {
			log::warn!("hosted space {space_id} changed no roster row: the device list did not read: {failure:?}");
			return Ok(None);
		}
	};
	let devices: Vec<ListedDevice> = listed.iter().filter_map(well_formed).collect();
	if !devices.iter().any(|device| device.device_id() == host.device_id()) {
		log::warn!(
			"hosted space {space_id} changed no roster row: the device list omits the host device"
		);
		return Ok(None);
	}
	let database = database_of(app)?;
	let roster = roster::verified_roster(database, space_id, &host.signing_public())
		.await
		.map_err(SpaceError::from)?;
	let removed: HashSet<String> = database
		.space_relay()
		.removed_devices(space_id.to_owned())
		.await
		.map_err(SpaceError::from)?
		.into_iter()
		.collect();
	let listed_ids: HashSet<&str> = listed.iter().map(|device| device.device_id.as_str()).collect();
	let (kept, unlisted): (Vec<Rostered>, Vec<Rostered>) = roster
		.rows
		.into_iter()
		.map(|row| row.rostered)
		.filter(|rostered| rostered.device_id != host.device_id())
		.partition(|rostered| listed_ids.contains(rostered.relay_device_id.as_str()));
	let mut admitted = Vec::new();
	for device in devices.iter().filter(|device| device.device_id() != host.device_id()) {
		if is_removed(space_id, &removed, device) || is_held(space_id, &kept, device) {
			continue;
		}
		enrolled(app, &host, space_id, device).await?;
		admitted.push(device);
	}
	let unlisted = unlisted
		.into_iter()
		.filter(|rostered| admitted.iter().all(|device| device.device_id() != rostered.device_id))
		.collect();
	let admitted = admitted.into_iter().map(|device| device.relay_device_id.clone()).collect();
	Ok(Some(Settled { admitted, unlisted }))
}

async fn device_list<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
) -> Result<Vec<CloudDevice>, MembersError> {
	let bearer = bearer_of(app)?;
	let listed = app
		.state::<Hosting>()
		.cloud
		.devices(&bearer, instance_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	Ok(listed.into_iter().filter(|device| device.status == DeviceStatus::Approved).collect())
}

fn well_formed(device: &CloudDevice) -> Option<ListedDevice> {
	let listed = ListedDevice::of(device);
	if listed.is_none() {
		log::warn!(
			"the device list carried unreadable keys for relay device {}",
			json!(device.device_id)
		);
	}
	listed
}

fn is_removed(space_id: &str, removed: &HashSet<String>, device: &ListedDevice) -> bool {
	let device_id = device.device_id().to_string();
	let is_removed = removed.contains(&device_id);
	if is_removed {
		log::info!(
			"hosted space {space_id} skipped device {device_id}: it was removed from the space"
		);
	}
	is_removed
}

fn is_held(space_id: &str, rostered: &[Rostered], device: &ListedDevice) -> bool {
	let device_id = device.device_id();
	let held = rostered.iter().find(|rostered| {
		rostered.relay_device_id == device.relay_device_id || rostered.device_id == device_id
	});
	let Some(held) = held else {
		return false;
	};
	if !device.is_rostered_as(held) {
		log::warn!(
			"hosted space {space_id} kept the roster row of device {} unchanged: the device list names relay device {} with other keys",
			held.device_id,
			json!(device.relay_device_id)
		);
	}
	true
}

async fn enrolled<R: Runtime>(
	app: &AppHandle<R>,
	host: &DeviceKeys,
	space_id: &str,
	device: &ListedDevice,
) -> Result<(), MembersError> {
	let enrolled = Enrolled {
		relay_device_id: &device.relay_device_id,
		account_id: &device.account_id,
		signing: &device.signing,
		agreement: &device.agreement,
		added_at: chrono::Utc::now().timestamp_millis(),
	};
	let row = signed_row(host, space_id, &enrolled);
	let device_id = row.device_id.clone();
	database_of(app)?
		.space_relay()
		.rostered(space_id.to_owned(), row)
		.await
		.map_err(SpaceError::from)?;
	log::info!(
		"hosted space {space_id} admitted device {device_id} of account {} at relay device {}",
		json!(device.account_id),
		json!(device.relay_device_id)
	);
	Ok(())
}

fn key_of(encoded: &str) -> Option<[u8; 32]> {
	BASE64_URL_SAFE_NO_PAD.decode(encoded).ok()?.try_into().ok()
}
