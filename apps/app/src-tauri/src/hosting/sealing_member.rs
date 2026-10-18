use base64::prelude::{Engine as _, BASE64_STANDARD, BASE64_URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::{json, Value};
use x25519_dalek::PublicKey;
use zeroize::Zeroizing;

use super::handover::{rekey_bytes, KeyHandover};
use super::roster::{self, set_bytes, signed_row, Enrolled, RosterSet};
use crate::crypto::device_keys::{verify, DeviceId, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::frame::{self, Frame, Header, CHALLENGE_LENGTH};
use crate::crypto::join;
use crate::crypto::sealed_box;
use crate::crypto::space_key::HeldSpaceKey;
use crate::crypto::subkey::Subkey;
use crate::db::repositories::space_relay::RosterRow;

pub(super) struct SealingMember {
	pub(super) keys: DeviceKeys,
	pub(super) relay_device_id: String,
	pub(super) account_id: String,
}

#[derive(Debug, PartialEq)]
pub(super) struct HostFrame {
	pub(super) plaintext: Value,
	pub(super) challenge: Option<[u8; CHALLENGE_LENGTH]>,
	pub(super) ctr: u64,
}

pub(super) struct Space<'a> {
	pub(super) instance_id: &'a str,
	pub(super) key: &'a HeldSpaceKey,
	pub(super) host: &'a VerifyingKey,
}

impl SealingMember {
	pub(super) fn new(account_id: &str) -> Self {
		Self {
			keys: DeviceKeys::generate().expect("randomness"),
			relay_device_id: uuid::Uuid::new_v4().to_string(),
			account_id: account_id.to_owned(),
		}
	}

	pub(super) fn row(&self, host: &DeviceKeys, space_id: &str) -> RosterRow {
		let agreement = self.keys.agreement_public();
		let enrolled = Enrolled {
			relay_device_id: &self.relay_device_id,
			account_id: &self.account_id,
			signing: &self.keys.signing_public(),
			agreement: agreement.as_bytes(),
			added_at: 1,
		};
		signed_row(host, space_id, &enrolled)
	}

	pub(super) fn sealed(
		&self,
		space: &Space<'_>,
		ctr: u64,
		plaintext: &str,
		challenge: Option<[u8; CHALLENGE_LENGTH]>,
	) -> String {
		let header = Header {
			instance: space.instance_id.to_owned(),
			from: self.keys.device_id(),
			to: None,
			key_id: space.key.key_id,
			ctr,
			challenge,
		};
		let subkey = Subkey::derive(&space.key.key, space.key.key_id, &self.keys.device_id());
		let sealed = frame::seal(header, plaintext.as_bytes(), &subkey, &self.keys)
			.expect("the frame seals");
		let mut envelope = json!({
			"from": self.relay_device_id,
			"v": 2,
			"instance": space.instance_id,
			"key_id": space.key.key_id,
			"ctr": ctr,
			"ct": BASE64_STANDARD.encode(&sealed.ciphertext),
			"sig": BASE64_STANDARD.encode(sealed.sig.to_bytes()),
		});
		if let Some(challenge) = challenge {
			envelope["challenge"] = json!(BASE64_STANDARD.encode(challenge));
		}
		envelope.to_string()
	}

	pub(super) fn join_frame(&self, link: &JoinLink, secret: &[u8]) -> String {
		let sealed = join::seal(secret, &self.keys, &link.host).expect("the join seals");
		json!({
			"from": self.relay_device_id,
			"v": 2,
			"instance": link.instance_id,
			"join": BASE64_STANDARD.encode(sealed),
		})
		.to_string()
	}

	pub(super) fn joined_answer(&self, envelope: &Value, secret: &[u8]) -> KeyHandover {
		assert_eq!(envelope["to"], self.relay_device_id.as_str(), "{envelope}");
		let opened = sealed_box::open(self.keys.agreement(), &decoded(envelope, "joined"))
			.expect("the joined answer opens");
		let (mac, answer) = opened.split_at(32);
		assert_eq!(mac, join::answer_mac(secret, answer), "the joined mac does not verify");
		serde_json::from_slice(answer).expect("a key handover")
	}

	pub(super) fn rekey_opened(
		&self,
		envelope: &Value,
		instance_id: &str,
		host: &VerifyingKey,
	) -> Result<KeyHandover, CryptoError> {
		assert_eq!(envelope["to"], self.relay_device_id.as_str(), "{envelope}");
		let sealed = decoded(envelope, "rekey");
		let sig =
			Signature::from_bytes(&decoded(envelope, "sig").try_into().expect("a 64-byte sig"));
		verify(host, &rekey_bytes(instance_id, &self.keys.device_id(), &sealed), &sig)?;
		let opened = sealed_box::open(self.keys.agreement(), &sealed)?;
		Ok(serde_json::from_slice(&opened).expect("a key handover"))
	}

	pub(super) fn opened(&self, space: &Space<'_>, text: &str) -> Option<HostFrame> {
		let envelope: Value = serde_json::from_str(text).expect("a json frame");
		let to = match envelope.get("to") {
			None => None,
			Some(to) if *to == self.relay_device_id.as_str() => Some(self.keys.device_id()),
			Some(_) => return None,
		};
		Some(host_frame_opened(space, &envelope, to).expect("the host frame opens"))
	}
}

pub(super) fn host_frame_opened(
	space: &Space<'_>,
	envelope: &Value,
	to: Option<DeviceId>,
) -> Result<HostFrame, CryptoError> {
	assert_eq!(envelope["v"], 2, "{envelope}");
	assert!(envelope.get("from").is_none(), "a host frame wrote its own from: {envelope}");
	let decoded = |key: &str| {
		BASE64_STANDARD.decode(envelope[key].as_str().expect("a base64 field")).expect("base64")
	};
	let challenge = envelope
		.get("challenge")
		.map(|_| decoded("challenge").try_into().expect("a 32-byte challenge"));
	let ctr = envelope["ctr"].as_u64().expect("a ctr");
	let key_id = u32::try_from(envelope["key_id"].as_u64().expect("a key_id")).expect("a u32");
	let host = DeviceId::of(space.host);
	let header =
		Header { instance: space.instance_id.to_owned(), from: host, to, key_id, ctr, challenge };
	let sig = Signature::from_bytes(&decoded("sig").try_into().expect("a 64-byte sig"));
	let sealed = Frame { header, ciphertext: decoded("ct"), sig };
	let subkey = Subkey::derive(&space.key.key, key_id, &host);
	let plaintext = frame::open(&sealed, &subkey, space.host)?;
	let plaintext = serde_json::from_slice(&plaintext).expect("a json plaintext");
	Ok(HostFrame { plaintext, challenge, ctr })
}

pub(super) struct JoinLink {
	pub(super) instance_id: String,
	pub(super) host: PublicKey,
	pub(super) secret: Vec<u8>,
}

pub(super) fn join_link_of(link: &str) -> JoinLink {
	let fragment = link.strip_prefix("https://kiroshi.app/join#").expect("a kiroshi join link");
	let parts: Vec<&str> = fragment.split('.').collect();
	let [instance_id, host, secret] = parts.as_slice() else {
		panic!("a join link carries three dotted parts: {link}");
	};
	let unpadded = |part: &str| BASE64_URL_SAFE_NO_PAD.decode(part).expect("unpadded base64url");
	let host: [u8; 32] = unpadded(host).try_into().expect("a 32-byte agreement key");
	let secret = unpadded(secret);
	assert_eq!(secret.len(), 32, "the secret is 32 bytes");
	JoinLink { instance_id: (*instance_id).to_owned(), host: PublicKey::from(host), secret }
}

pub(super) fn space_key_of(handover: &KeyHandover) -> HeldSpaceKey {
	let key = BASE64_STANDARD.decode(&handover.space_key).expect("a base64 space key");
	assert_eq!(handover.key_id, handover.roster.key_id, "the roster names the handed key_id");
	HeldSpaceKey { key_id: handover.key_id, key: Zeroizing::new(key.try_into().expect("32 bytes")) }
}

pub(super) fn verified_set(
	host: &VerifyingKey,
	set: &RosterSet,
) -> Result<Vec<DeviceId>, CryptoError> {
	let mut device_ids = Vec::with_capacity(set.rows.len());
	for row in &set.rows {
		let row = RosterRow {
			device_id: row.device_id.clone(),
			relay_device_id: row.relay_device_id.clone(),
			account_id: row.account_id.clone(),
			signing_public_key: BASE64_STANDARD.decode(&row.signing_public_key).expect("base64"),
			agreement_public_key: BASE64_STANDARD
				.decode(&row.agreement_public_key)
				.expect("base64"),
			fingerprint: row.fingerprint.clone(),
			added_at: row.added_at,
			signature: BASE64_STANDARD.decode(&row.signature).expect("base64"),
		};
		device_ids.push(roster::verified(host, &set.space_id, &row)?.device_id);
	}
	if set.host != DeviceId::of(host).to_string() {
		return Err(CryptoError::ForeignSender);
	}
	let sig = BASE64_STANDARD.decode(&set.sig).expect("base64");
	let sig = Signature::from_slice(&sig).map_err(|_| CryptoError::ForgedSignature)?;
	verify(host, &set_bytes(&set.space_id, set.version, set.key_id, &device_ids), &sig)?;
	Ok(device_ids)
}

fn decoded(envelope: &Value, key: &str) -> Vec<u8> {
	BASE64_STANDARD.decode(envelope[key].as_str().expect("a base64 field")).expect("base64")
}
