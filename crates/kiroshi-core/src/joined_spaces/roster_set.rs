use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::{Signature, VerifyingKey};
use zeroize::{Zeroize, Zeroizing};

use super::contract::JoinedSpaceError;
use crate::crypto::device_keys::{verify, DeviceId, KEY_LENGTH};
use crate::crypto::space_key::HeldSpaceKey;
use crate::db::repositories::space_relay::RosterRow;
use crate::hosting::handover::KeyHandover;
use crate::hosting::roster::{self, set_bytes, RosterSet, Rostered, SignedRow};

pub(super) struct HeldRoster {
	pub(super) set: RosterSet,
	pub(super) host: Rostered,
	pub(super) own: Rostered,
	pub(super) rows: Vec<Rostered>,
}

pub(super) struct Handed {
	pub(super) space: HeldSpaceKey,
	pub(super) roster: HeldRoster,
}

pub(super) fn verified_set(
	set: RosterSet,
	trusted_host: Option<&VerifyingKey>,
	own: &DeviceId,
) -> Result<HeldRoster, JoinedSpaceError> {
	let rows: Vec<RosterRow> =
		set.rows.iter().map(row_of).collect::<Option<_>>().ok_or(JoinedSpaceError::BadSignature)?;
	let host_key = rows
		.iter()
		.find(|row| row.device_id == set.host)
		.and_then(signing_of)
		.filter(|host| trusted_host.is_none_or(|trusted| trusted == host))
		.ok_or(JoinedSpaceError::BadSignature)?;
	let rows: Vec<Rostered> = rows
		.iter()
		.map(|row| roster::verified(&host_key, &set.space_id, row))
		.collect::<Result<_, _>>()
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	let device_ids: Vec<DeviceId> = rows.iter().map(|row| row.device_id).collect();
	let sig = BASE64_STANDARD
		.decode(&set.sig)
		.ok()
		.and_then(|sig| Signature::from_slice(&sig).ok())
		.ok_or(JoinedSpaceError::BadSignature)?;
	verify(&host_key, &set_bytes(&set.space_id, set.version, set.key_id, &device_ids), &sig)
		.map_err(|_| JoinedSpaceError::BadSignature)?;
	let host_id = DeviceId::of(&host_key);
	let found = |device_id: &DeviceId| rows.iter().find(|row| row.device_id == *device_id).cloned();
	let host = found(&host_id).ok_or(JoinedSpaceError::BadSignature)?;
	let own = found(own).ok_or(JoinedSpaceError::NotInRoster)?;
	Ok(HeldRoster { set, host, own, rows })
}

pub(super) fn verified_handover(
	mut handover: KeyHandover,
	trusted_host: Option<&VerifyingKey>,
	own: &DeviceId,
) -> Result<Handed, JoinedSpaceError> {
	let key = BASE64_STANDARD.decode(&handover.space_key).map(Zeroizing::new);
	handover.space_key.zeroize();
	let key: [u8; KEY_LENGTH] = key
		.ok()
		.and_then(|key| key.as_slice().try_into().ok())
		.ok_or(JoinedSpaceError::BadSignature)?;
	if handover.key_id != handover.roster.key_id {
		return Err(JoinedSpaceError::BadSignature);
	}
	let roster = verified_set(handover.roster, trusted_host, own)?;
	let space = HeldSpaceKey { key_id: handover.key_id, key: Zeroizing::new(key) };
	Ok(Handed { space, roster })
}

fn row_of(row: &SignedRow) -> Option<RosterRow> {
	Some(RosterRow {
		device_id: row.device_id.clone(),
		relay_device_id: row.relay_device_id.clone(),
		account_id: row.account_id.clone(),
		signing_public_key: BASE64_STANDARD.decode(&row.signing_public_key).ok()?,
		agreement_public_key: BASE64_STANDARD.decode(&row.agreement_public_key).ok()?,
		fingerprint: row.fingerprint.clone(),
		added_at: row.added_at,
		signature: BASE64_STANDARD.decode(&row.signature).ok()?,
	})
}

fn signing_of(row: &RosterRow) -> Option<VerifyingKey> {
	let bytes = <[u8; KEY_LENGTH]>::try_from(row.signing_public_key.as_slice()).ok()?;
	VerifyingKey::from_bytes(&bytes).ok()
}

#[cfg(test)]
pub(super) mod fixtures {
	use base64::prelude::{Engine as _, BASE64_STANDARD};

	use crate::crypto::device_keys::{DeviceId, DeviceKeys};
	use crate::crypto::space_key::HeldSpaceKey;
	use crate::hosting::handover::KeyHandover;
	use crate::hosting::roster::{set_bytes, signed_row, Enrolled, RosterSet, SignedRow};

	pub(in crate::joined_spaces) const SPACE: &str = "personal";

	pub(in crate::joined_spaces) struct Device<'a> {
		pub(in crate::joined_spaces) keys: &'a DeviceKeys,
		pub(in crate::joined_spaces) relay_device_id: &'a str,
		pub(in crate::joined_spaces) account_id: &'a str,
	}

	pub(in crate::joined_spaces) fn signed_set(
		host: &DeviceKeys,
		key_id: u32,
		version: u64,
		devices: &[Device<'_>],
	) -> RosterSet {
		let mut rows: Vec<SignedRow> = devices
			.iter()
			.map(|device| {
				let agreement = device.keys.agreement_public();
				let enrolled = Enrolled {
					relay_device_id: device.relay_device_id,
					account_id: device.account_id,
					signing: &device.keys.signing_public(),
					agreement: agreement.as_bytes(),
					added_at: 1,
				};
				SignedRow::from(&signed_row(host, SPACE, &enrolled))
			})
			.collect();
		rows.sort_by(|a, b| a.device_id.cmp(&b.device_id));
		let device_ids: Vec<DeviceId> =
			devices.iter().map(|device| device.keys.device_id()).collect();
		let sig = host.sign(&set_bytes(SPACE, version, key_id, &device_ids));
		RosterSet {
			space_id: SPACE.to_owned(),
			host: host.device_id().to_string(),
			key_id,
			version,
			rows,
			sig: BASE64_STANDARD.encode(sig.to_bytes()),
		}
	}

	pub(in crate::joined_spaces) fn handover_of(
		space: &HeldSpaceKey,
		roster: RosterSet,
	) -> KeyHandover {
		KeyHandover {
			key_id: space.key_id,
			space_key: BASE64_STANDARD.encode(space.key.as_slice()),
			roster,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::fixtures::{handover_of, signed_set, Device};
	use super::*;
	use crate::crypto::device_keys::DeviceKeys;

	struct Fixture {
		host: DeviceKeys,
		member: DeviceKeys,
	}

	impl Fixture {
		fn new() -> Self {
			Self {
				host: DeviceKeys::generate().expect("randomness"),
				member: DeviceKeys::generate().expect("randomness"),
			}
		}

		fn set(&self, version: u64) -> RosterSet {
			signed_set(&self.host, 2, version, &self.devices())
		}

		fn devices(&self) -> [Device<'_>; 2] {
			[
				Device { keys: &self.host, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &self.member, relay_device_id: "r-member", account_id: "bob" },
			]
		}
	}

	#[test]
	fn a_set_signed_by_its_host_row_names_the_host_and_this_device() {
		let fixture = Fixture::new();

		let held = verified_set(fixture.set(7), None, &fixture.member.device_id());

		let held = held.expect("the set verifies");
		assert_eq!(held.host.device_id, fixture.host.device_id());
		assert_eq!(held.own.relay_device_id, "r-member");
		assert_eq!(held.rows.len(), 2);
	}

	#[test]
	fn a_swapped_row_a_forged_set_signature_or_another_host_fails_the_signature() {
		let fixture = Fixture::new();
		let own = fixture.member.device_id();
		let mut renamed = fixture.set(7);
		renamed.rows[0].account_id = "eve".to_owned();
		let mut bumped = fixture.set(7);
		bumped.version = 8;
		let stranger = DeviceKeys::generate().expect("randomness");
		let foreign = signed_set(
			&stranger,
			2,
			7,
			&[
				Device { keys: &stranger, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &fixture.member, relay_device_id: "r-member", account_id: "bob" },
			],
		);

		for (case, set, trusted) in [
			("a swapped row", renamed, None),
			("a forged set signature", bumped, None),
			("another host", foreign, Some(fixture.host.signing_public())),
		] {
			let refused = verified_set(set, trusted.as_ref(), &own).err();
			assert_eq!(refused, Some(JoinedSpaceError::BadSignature), "{case}");
		}
	}

	#[test]
	fn a_verified_set_without_this_device_answers_not_in_roster() {
		let fixture = Fixture::new();
		let host_only = signed_set(&fixture.host, 2, 7, &fixture.devices()[..1]);

		let refused = verified_set(host_only, None, &fixture.member.device_id()).err();

		assert_eq!(refused, Some(JoinedSpaceError::NotInRoster));
	}

	#[test]
	fn a_handover_whose_key_id_differs_from_its_roster_is_refused() {
		let fixture = Fixture::new();
		let space = HeldSpaceKey::under(3).expect("randomness");
		let own = fixture.member.device_id();

		let refused = verified_handover(handover_of(&space, fixture.set(7)), None, &own).err();
		let matching = HeldSpaceKey::under(2).expect("randomness");
		let handed = verified_handover(handover_of(&matching, fixture.set(7)), None, &own);

		assert_eq!(refused, Some(JoinedSpaceError::BadSignature));
		let handed = handed.expect("the handover verifies");
		assert_eq!((handed.space.key_id, *handed.space.key), (2, *matching.key));
	}
}
