use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde::{Deserialize, Serialize};
use x25519_dalek::PublicKey;

use crate::crypto::device_keys::{verify, DeviceId, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::fingerprint::fingerprint;
use crate::db::repositories::space_relay::RosterRow;
use crate::db::{Database, DatabaseError};

const ROSTER_DOMAIN: &[u8] = b"kiroshi/v2/roster";

const ROSTER_SET_DOMAIN: &[u8] = b"kiroshi/v2/roster-set";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct Rostered {
	pub(crate) device_id: DeviceId,
	pub(crate) relay_device_id: String,
	pub(crate) account_id: String,
	pub(crate) signing: VerifyingKey,
	pub(crate) agreement: PublicKey,
}

pub(super) struct VerifiedRow {
	pub(super) row: RosterRow,
	pub(super) rostered: Rostered,
}

pub(super) struct VerifiedRoster {
	pub(super) version: u64,
	pub(super) rows: Vec<VerifiedRow>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct SignedRow {
	pub(crate) device_id: String,
	pub(crate) relay_device_id: String,
	pub(crate) account_id: String,
	pub(crate) signing_public_key: String,
	pub(crate) agreement_public_key: String,
	pub(crate) fingerprint: String,
	pub(crate) added_at: i64,
	pub(crate) signature: String,
}

impl From<&RosterRow> for SignedRow {
	fn from(row: &RosterRow) -> Self {
		Self {
			device_id: row.device_id.clone(),
			relay_device_id: row.relay_device_id.clone(),
			account_id: row.account_id.clone(),
			signing_public_key: BASE64_STANDARD.encode(&row.signing_public_key),
			agreement_public_key: BASE64_STANDARD.encode(&row.agreement_public_key),
			fingerprint: row.fingerprint.clone(),
			added_at: row.added_at,
			signature: BASE64_STANDARD.encode(&row.signature),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub(crate) struct RosterSet {
	pub(crate) space_id: String,
	pub(crate) host: String,
	pub(crate) key_id: u32,
	pub(crate) version: u64,
	pub(crate) rows: Vec<SignedRow>,
	pub(crate) sig: String,
}

pub struct Enrolled<'a> {
	pub relay_device_id: &'a str,
	pub account_id: &'a str,
	pub signing: &'a VerifyingKey,
	pub agreement: &'a [u8; 32],
	pub added_at: i64,
}

pub fn signed_row(host: &DeviceKeys, space_id: &str, enrolled: &Enrolled<'_>) -> RosterRow {
	let mut row = RosterRow {
		device_id: DeviceId::of(enrolled.signing).to_string(),
		relay_device_id: enrolled.relay_device_id.to_owned(),
		account_id: enrolled.account_id.to_owned(),
		signing_public_key: enrolled.signing.as_bytes().to_vec(),
		agreement_public_key: enrolled.agreement.to_vec(),
		fingerprint: fingerprint(enrolled.signing).join(" "),
		added_at: enrolled.added_at,
		signature: Vec::new(),
	};
	row.signature = host.sign(&canonical_bytes(space_id, &row)).to_bytes().to_vec();
	row
}

pub(crate) fn verified(
	host: &VerifyingKey,
	space_id: &str,
	row: &RosterRow,
) -> Result<Rostered, CryptoError> {
	let signature =
		Signature::from_slice(&row.signature).map_err(|_| CryptoError::ForgedSignature)?;
	verify(host, &canonical_bytes(space_id, row), &signature)?;
	let signing = <[u8; 32]>::try_from(row.signing_public_key.as_slice())
		.ok()
		.and_then(|bytes| VerifyingKey::from_bytes(&bytes).ok())
		.ok_or(CryptoError::MalformedKey)?;
	let agreement = <[u8; 32]>::try_from(row.agreement_public_key.as_slice())
		.map(PublicKey::from)
		.map_err(|_| CryptoError::MalformedKey)?;
	let device_id = DeviceId::from_hex(&row.device_id)
		.filter(|device_id| *device_id == DeviceId::of(&signing))
		.ok_or(CryptoError::ForeignSender)?;
	Ok(Rostered {
		device_id,
		relay_device_id: row.relay_device_id.clone(),
		account_id: row.account_id.clone(),
		signing,
		agreement,
	})
}

pub(super) async fn verified_roster(
	database: &Database,
	space_id: &str,
	host: &VerifyingKey,
) -> Result<VerifiedRoster, DatabaseError> {
	let roster = database.space_relay().roster(space_id.to_owned()).await?;
	let mut rows = Vec::with_capacity(roster.rows.len());
	let mut ignored = Vec::new();
	for row in roster.rows {
		match verified(host, space_id, &row) {
			Ok(rostered) => rows.push(VerifiedRow { row, rostered }),
			Err(failure) => ignored.push(format!("{} ({failure:?})", row.device_id)),
		}
	}
	if !ignored.is_empty() {
		eprintln!("hosted space {space_id} ignored the roster rows of {}", ignored.join(", "));
	}
	Ok(VerifiedRoster { version: roster.version, rows })
}

pub(super) fn signed_set(
	host: &DeviceKeys,
	space_id: &str,
	key_id: u32,
	roster: &VerifiedRoster,
) -> RosterSet {
	let device_ids: Vec<DeviceId> = roster.rows.iter().map(|row| row.rostered.device_id).collect();
	let sig = host.sign(&set_bytes(space_id, roster.version, key_id, &device_ids));
	RosterSet {
		space_id: space_id.to_owned(),
		host: host.device_id().to_string(),
		key_id,
		version: roster.version,
		rows: roster.rows.iter().map(|row| SignedRow::from(&row.row)).collect(),
		sig: BASE64_STANDARD.encode(sig.to_bytes()),
	}
}

pub(crate) fn set_bytes(
	space_id: &str,
	version: u64,
	key_id: u32,
	device_ids: &[DeviceId],
) -> Vec<u8> {
	let mut sorted: Vec<&[u8; 16]> = device_ids.iter().map(DeviceId::as_bytes).collect();
	sorted.sort_unstable();
	let mut bytes = ROSTER_SET_DOMAIN.to_vec();
	bytes.extend_from_slice(&(space_id.len() as u64).to_be_bytes());
	bytes.extend_from_slice(space_id.as_bytes());
	bytes.extend_from_slice(&version.to_be_bytes());
	bytes.extend_from_slice(&key_id.to_be_bytes());
	bytes.extend_from_slice(&(sorted.len() as u64).to_be_bytes());
	for device_id in sorted {
		bytes.extend_from_slice(device_id);
	}
	bytes
}

fn canonical_bytes(space_id: &str, row: &RosterRow) -> Vec<u8> {
	let mut bytes = ROSTER_DOMAIN.to_vec();
	for field in [
		space_id.as_bytes(),
		row.device_id.as_bytes(),
		row.relay_device_id.as_bytes(),
		row.account_id.as_bytes(),
		&row.signing_public_key,
		&row.agreement_public_key,
		row.fingerprint.as_bytes(),
	] {
		bytes.extend_from_slice(&(field.len() as u64).to_be_bytes());
		bytes.extend_from_slice(field);
	}
	bytes.extend_from_slice(&row.added_at.to_be_bytes());
	bytes
}

pub(super) async fn host_rostered(
	database: &Database,
	space_id: &str,
	host: &DeviceKeys,
	relay_device_id: &str,
	account_id: &str,
) -> Result<(), DatabaseError> {
	let roster = database.space_relay();
	let held = roster.roster_row(space_id.to_owned(), host.device_id().to_string()).await?;
	let is_current = held
		.and_then(|row| verified(&host.signing_public(), space_id, &row).ok())
		.is_some_and(|row| row.relay_device_id == relay_device_id && row.account_id == account_id);
	if is_current {
		return Ok(());
	}
	let agreement = host.agreement_public();
	let enrolled = Enrolled {
		relay_device_id,
		account_id,
		signing: &host.signing_public(),
		agreement: agreement.as_bytes(),
		added_at: chrono::Utc::now().timestamp_millis(),
	};
	roster.rostered(space_id.to_owned(), signed_row(host, space_id, &enrolled)).await
}

pub(super) async fn sender_of(
	database: &Database,
	space_id: &str,
	host: &DeviceKeys,
	relay_device_id: &str,
) -> Result<Option<Rostered>, DatabaseError> {
	let row = database
		.space_relay()
		.roster_row_of_relay_device(space_id.to_owned(), relay_device_id.to_owned())
		.await?;
	let Some(row) = row else {
		return Ok(None);
	};
	match verified(&host.signing_public(), space_id, &row) {
		Ok(sender) if sender.device_id == host.device_id() => Ok(None),
		Ok(sender) => Ok(Some(sender)),
		Err(failure) => {
			eprintln!(
				"hosted space {space_id} ignored the roster row of device {}: {failure:?}",
				row.device_id
			);
			Ok(None)
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_member_row(host: &DeviceKeys, member: &DeviceKeys) -> RosterRow {
		let agreement = member.agreement_public();
		let enrolled = Enrolled {
			relay_device_id: "r-1",
			account_id: "a-1",
			signing: &member.signing_public(),
			agreement: agreement.as_bytes(),
			added_at: 7,
		};
		signed_row(host, "s-1", &enrolled)
	}

	#[test]
	fn a_row_signed_by_the_host_verifies_into_its_member() {
		let host = DeviceKeys::generate().expect("randomness");
		let member = DeviceKeys::generate().expect("randomness");

		let rostered = verified(&host.signing_public(), "s-1", &a_member_row(&host, &member));

		assert_eq!(
			rostered,
			Ok(Rostered {
				device_id: member.device_id(),
				relay_device_id: "r-1".to_owned(),
				account_id: "a-1".to_owned(),
				signing: member.signing_public(),
				agreement: member.agreement_public(),
			})
		);
	}

	#[test]
	fn a_row_altered_signed_by_another_key_or_moved_to_another_space_does_not_verify() {
		let host = DeviceKeys::generate().expect("randomness");
		let member = DeviceKeys::generate().expect("randomness");
		let other = DeviceKeys::generate().expect("randomness");
		let row = a_member_row(&host, &member);
		let alterations: [fn(&mut RosterRow); 4] = [
			|row| row.account_id.push('x'),
			|row| row.relay_device_id.push('x'),
			|row| row.added_at += 1,
			|row| row.agreement_public_key[0] ^= 1,
		];

		for alter in alterations {
			let mut altered = row.clone();
			alter(&mut altered);
			assert_eq!(
				verified(&host.signing_public(), "s-1", &altered),
				Err(CryptoError::ForgedSignature)
			);
		}
		assert_eq!(
			verified(&host.signing_public(), "s-2", &row),
			Err(CryptoError::ForgedSignature)
		);
		assert_eq!(
			verified(&host.signing_public(), "s-1", &a_member_row(&other, &member)),
			Err(CryptoError::ForgedSignature)
		);
	}

	#[tokio::test]
	async fn a_host_signed_roster_row_whose_device_id_does_not_match_its_signing_key_resolves_no_sender(
	) {
		let dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&dir);
		let host = DeviceKeys::generate().expect("randomness");
		let member = DeviceKeys::generate().expect("randomness");
		let other = DeviceKeys::generate().expect("randomness");
		let mut row = a_member_row(&host, &member);
		row.device_id = other.device_id().to_string();
		row.signature = host.sign(&canonical_bytes("personal", &row)).to_bytes().to_vec();
		database
			.space_relay()
			.rostered("personal".to_owned(), row.clone())
			.await
			.expect("rostered");

		let sender =
			sender_of(&database, "personal", &host, "r-1").await.expect("the roster reads");

		assert_eq!(
			verified(&host.signing_public(), "personal", &row),
			Err(CryptoError::ForeignSender)
		);
		assert_eq!(sender, None);
	}
}
