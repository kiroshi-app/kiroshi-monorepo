use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::{Signature, VerifyingKey};
use serde_json::{json, Value};

use super::roster::{signed_row, Enrolled};
use crate::crypto::device_keys::{DeviceId, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::frame::{self, Frame, Header, CHALLENGE_LENGTH};
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
