use std::sync::atomic::{AtomicU64, Ordering};

use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};

use super::contract::JoinedSpaceError;
use super::held::{device_keys, held, kept};
use super::join::handed;
use super::roster_set::fixtures::{handover_of, signed_set, Device};
use super::roster_set::{verified_set, Handed};
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::frame::{self, Frame, Header, CHALLENGE_LENGTH};
use crate::crypto::sealed_box;
use crate::crypto::space_key::HeldSpaceKey;
use crate::crypto::subkey::Subkey;
use crate::hosting::handover::rekey_bytes;
use crate::hosting::wire::{envelope_of, fields_of, HELLO};

pub(crate) const CHALLENGE: [u8; CHALLENGE_LENGTH] = [9; CHALLENGE_LENGTH];

const HOST_RELAY_ID: &str = "r-host";

const MEMBER_RELAY_ID: &str = "r-member";

pub(crate) struct SealingHost {
	instance_id: String,
	host: DeviceKeys,
	member: DeviceKeys,
	space: HeldSpaceKey,
	ctr: AtomicU64,
}

pub(crate) struct MemberFrame {
	pub(crate) plaintext: Value,
	pub(crate) challenge: Option<[u8; CHALLENGE_LENGTH]>,
}

impl SealingHost {
	pub(crate) fn new<R: Runtime>(app: &AppHandle<R>, instance_id: &str) -> Self {
		Self {
			instance_id: instance_id.to_owned(),
			host: DeviceKeys::generate().expect("randomness"),
			member: device_keys(app).expect("the member device keys"),
			space: HeldSpaceKey::first().expect("randomness"),
			ctr: AtomicU64::new(0),
		}
	}

	pub(crate) async fn planted<R: Runtime>(app: &AppHandle<R>, instance_id: &str) -> Self {
		let planted = Self::new(app, instance_id);
		let set = signed_set(&planted.host, 1, 1, &planted.devices());
		let roster = verified_set(set, None, &planted.member.device_id()).expect("a verified set");
		let space = HeldSpaceKey { key_id: planted.space.key_id, key: planted.space.key.clone() };
		let handed = Handed { space, roster };
		assert!(kept(app, instance_id, &handed).await.expect("the roster is kept"));
		planted
	}

	pub(crate) fn host_keys(&self) -> &DeviceKeys {
		&self.host
	}

	fn devices(&self) -> [Device<'_>; 2] {
		[
			Device { keys: &self.host, relay_device_id: HOST_RELAY_ID, account_id: "owner" },
			Device { keys: &self.member, relay_device_id: MEMBER_RELAY_ID, account_id: "member" },
		]
	}

	pub(crate) fn joined(&self) -> String {
		self.joined_rostering(&self.devices())
	}

	pub(crate) fn joined_without_the_member(&self) -> String {
		self.joined_rostering(&self.devices()[..1])
	}

	fn joined_rostering(&self, devices: &[Device<'_>]) -> String {
		let set = signed_set(&self.host, self.space.key_id, 1, devices);
		let handover = serde_json::to_vec(&handover_of(&self.space, set)).expect("a json handover");
		let sealed = sealed_box::seal(&self.member.agreement_public(), &handover).expect("sealed");
		self.addressed("joined", json!(BASE64_STANDARD.encode(sealed)))
	}

	pub(crate) fn pending(&self) -> String {
		self.addressed("join_refused", json!("pending"))
	}

	fn addressed(&self, answer: &str, value: Value) -> String {
		let mut frame = json!({
			"from": HOST_RELAY_ID,
			"v": 2,
			"instance": self.instance_id,
			"to": MEMBER_RELAY_ID,
		});
		frame[answer] = value;
		frame.to_string()
	}

	pub(crate) fn rekey(&self, key_id: u32, version: u64) -> String {
		self.rekey_signed_by(&self.host, key_id, version)
	}

	pub(crate) fn rekey_signed_by(&self, signer: &DeviceKeys, key_id: u32, version: u64) -> String {
		let space = HeldSpaceKey::under(key_id).expect("randomness");
		let set = signed_set(&self.host, key_id, version, &self.devices());
		let handover = serde_json::to_vec(&handover_of(&space, set)).expect("a json handover");
		let sealed = sealed_box::seal(&self.member.agreement_public(), &handover).expect("sealed");
		let sig = signer.sign(&rekey_bytes(&self.instance_id, &self.member.device_id(), &sealed));
		json!({
			"from": HOST_RELAY_ID,
			"v": 2,
			"instance": self.instance_id,
			"to": MEMBER_RELAY_ID,
			"rekey": BASE64_STANDARD.encode(sealed),
			"sig": BASE64_STANDARD.encode(sig.to_bytes()),
		})
		.to_string()
	}

	pub(crate) fn hello(&self) -> String {
		self.sealed_with(HELLO, Some(CHALLENGE))
	}

	pub(crate) fn sealed(&self, plaintext: &str) -> String {
		self.sealed_with(plaintext, None)
	}

	fn sealed_with(&self, plaintext: &str, challenge: Option<[u8; CHALLENGE_LENGTH]>) -> String {
		let from = self.host.device_id();
		let header = Header {
			instance: self.instance_id.clone(),
			from,
			to: Some(self.member.device_id()),
			key_id: self.space.key_id,
			ctr: self.ctr.fetch_add(1, Ordering::SeqCst) + 1,
			challenge,
		};
		let subkey = Subkey::derive(&self.space.key, self.space.key_id, &from);
		let sealed = frame::seal(header, plaintext.as_bytes(), &subkey, &self.host)
			.expect("the host frame seals");
		let envelope = envelope_of(&sealed, Some(MEMBER_RELAY_ID));
		format!("{{\"from\":{},{}", json!(HOST_RELAY_ID), &envelope[1..])
	}

	pub(crate) fn opened(&self, text: &str) -> MemberFrame {
		let envelope: Value = serde_json::from_str(text).expect("a json member frame");
		let fields = fields_of(&envelope).expect("a sealed member frame");
		let sender = self.member.device_id();
		let header = Header {
			instance: self.instance_id.clone(),
			from: sender,
			to: None,
			key_id: fields.key_id,
			ctr: fields.ctr,
			challenge: fields.challenge,
		};
		let subkey = Subkey::derive(&self.space.key, fields.key_id, &sender);
		let sealed = Frame { header, ciphertext: fields.ciphertext, sig: fields.sig };
		let plaintext = frame::open(&sealed, &subkey, &self.member.signing_public())
			.expect("the member frame opens");
		let plaintext = serde_json::from_slice(&plaintext).expect("a json plaintext");
		MemberFrame { plaintext, challenge: fields.challenge }
	}
}

pub(crate) async fn joined_answer_held<R: Runtime>(
	app: &AppHandle<R>,
	instance_id: &str,
	joined: &[u8],
) -> Result<Option<(u32, u64)>, JoinedSpaceError> {
	let handed = handed(&device_keys(app)?, joined)?;
	if !kept(app, instance_id, &handed).await? {
		return Ok(None);
	}
	let held = held(app, instance_id).await?;
	Ok(held.map(|held| (held.space.key_id, held.roster.set.version)))
}
