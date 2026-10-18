use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::json;
use zeroize::{Zeroize, Zeroizing};

use super::roster::{self, RosterSet, Rostered, VerifiedRoster};
use super::wire::HostKeys;
use crate::crypto::device_keys::DeviceId;
use crate::crypto::frame::VERSION;
use crate::crypto::sealed_box;
use crate::db::Database;

const REKEY_DOMAIN: &[u8] = b"kiroshi/v2/rekey";

#[derive(Serialize, Deserialize)]
pub(super) struct KeyHandover {
	pub(super) key_id: u32,
	pub(super) space_key: String,
	pub(super) roster: RosterSet,
}

pub(super) struct Handover {
	pub(super) plaintext: Zeroizing<Vec<u8>>,
	pub(super) roster: VerifiedRoster,
}

pub(super) async fn current(
	database: &Database,
	keys: &HostKeys,
	space_id: &str,
) -> Result<Handover, String> {
	let space = keys.current_space_key();
	let host = keys.device.signing_public();
	let roster = roster::verified_roster(database, space_id, &host)
		.await
		.map_err(|failure| format!("the roster did not read: {failure:?}"))?;
	let mut handover = KeyHandover {
		key_id: space.key_id,
		space_key: BASE64_STANDARD.encode(space.key.as_slice()),
		roster: roster::signed_set(&keys.device, space_id, space.key_id, &roster),
	};
	let plaintext = serde_json::to_vec(&handover).map(Zeroizing::new);
	handover.space_key.zeroize();
	let plaintext =
		plaintext.map_err(|failure| format!("the key handover did not serialise: {failure}"))?;
	Ok(Handover { plaintext, roster })
}

impl Handover {
	pub(super) fn holds(&self, device_id: &DeviceId) -> bool {
		self.roster.rows.iter().any(|row| row.rostered.device_id == *device_id)
	}

	pub(super) fn members<'a>(&'a self, keys: &HostKeys) -> impl Iterator<Item = &'a Rostered> {
		let host = keys.device.device_id();
		self.roster
			.rows
			.iter()
			.map(|row| &row.rostered)
			.filter(move |rostered| rostered.device_id != host)
	}

	pub(super) fn rekey_frame(
		&self,
		keys: &HostKeys,
		instance_id: &str,
		to: &Rostered,
	) -> Result<String, String> {
		let sealed = sealed_box::seal(&to.agreement, &self.plaintext).map_err(|failure| {
			format!("the rekey of device {} was not sealed: {failure:?}", to.device_id)
		})?;
		let sig = keys.device.sign(&rekey_bytes(instance_id, &to.device_id, &sealed));
		Ok(json!({
			"v": VERSION,
			"instance": instance_id,
			"to": to.relay_device_id,
			"rekey": BASE64_STANDARD.encode(&sealed),
			"sig": BASE64_STANDARD.encode(sig.to_bytes()),
		})
		.to_string())
	}
}

pub(super) fn rekey_bytes(instance_id: &str, to: &DeviceId, sealed: &[u8]) -> Vec<u8> {
	let mut bytes = REKEY_DOMAIN.to_vec();
	bytes.extend_from_slice(&(instance_id.len() as u64).to_be_bytes());
	bytes.extend_from_slice(instance_id.as_bytes());
	bytes.extend_from_slice(to.as_bytes());
	bytes.extend_from_slice(&(sealed.len() as u64).to_be_bytes());
	bytes.extend_from_slice(sealed);
	bytes
}
