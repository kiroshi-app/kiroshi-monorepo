use ed25519_dalek::{Signature, VerifyingKey};

use crate::crypto::device_keys::{verify, DeviceId, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::fingerprint::fingerprint;
use crate::db::repositories::space_relay::RosterRow;
use crate::db::{Database, DatabaseError};

const ROSTER_DOMAIN: &[u8] = b"kiroshi/v2/roster";

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct Rostered {
	pub(super) device_id: DeviceId,
	pub(super) relay_device_id: String,
	pub(super) account_id: String,
	pub(super) signing: VerifyingKey,
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

pub(super) fn verified(
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
	let device_id = DeviceId::from_hex(&row.device_id).ok_or(CryptoError::ForeignSender)?;
	Ok(Rostered {
		device_id,
		relay_device_id: row.relay_device_id.clone(),
		account_id: row.account_id.clone(),
		signing,
	})
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
}
