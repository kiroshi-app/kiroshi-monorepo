use std::collections::HashMap;
use std::sync::Arc;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::Signature;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};

use super::contract::HostingFailureKind;
use super::roster::{self, Rostered};
use crate::crypto::commands::{CurrentSpaceKey, DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::{DeviceId, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::frame::{self, fresh_challenge, Frame, Header, CHALLENGE_LENGTH, VERSION};
use crate::crypto::space_key::HeldSpaceKey;
use crate::crypto::subkey::Subkey;
use crate::db::{Database, DatabaseError, DatabaseState};
use crate::spaces::commands::ready;

pub(crate) const HELLO: &str = r#"{"hello":{}}"#;

pub(crate) const CTR_BLOCK: u64 = 1024;

pub(crate) const MAX_CTR: u64 = (1 << 53) - 1;

const SIGNATURE_LENGTH: usize = 64;

pub(super) struct HostKeys {
	pub(super) device: DeviceKeys,
	pub(super) space: CurrentSpaceKey,
}

impl HostKeys {
	pub(super) fn current_space_key(&self) -> Arc<HeldSpaceKey> {
		self.space.borrow().clone()
	}
}

pub(super) async fn host_keys<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
) -> Result<HostKeys, (HostingFailureKind, String)> {
	let device =
		device_keys(app).map_err(|detail| (HostingFailureKind::DeviceKeysNotLoaded, detail))?;
	let space = space_key(app, space_id)
		.await
		.map_err(|detail| (HostingFailureKind::SpaceKeyNotRead, detail))?;
	Ok(HostKeys { device, space })
}

fn device_keys<R: Runtime>(app: &AppHandle<R>) -> Result<DeviceKeys, String> {
	app.try_state::<DeviceKeysState>()
		.ok_or_else(|| "the device keys are not loaded".to_owned())?
		.keys()
		.map(|keys| DeviceKeys::from_secret(&keys.secret()))
		.map_err(|failure| format!("the device keys are unavailable: {failure:?}"))
}

async fn space_key<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
) -> Result<CurrentSpaceKey, String> {
	let space_keys = app
		.try_state::<SpaceKeys>()
		.ok_or_else(|| "the space key store is not loaded".to_owned())?;
	let watched = |space_keys: &SpaceKeys| {
		space_keys
			.watched(space_id)
			.map_err(|failure| format!("the space key did not read: {failure:?}"))
	};
	if let Some(space) = watched(&space_keys)? {
		return Ok(space);
	}
	let first = HeldSpaceKey::first()
		.map_err(|failure| format!("no space key was generated: {failure:?}"))?;
	space_key_stored(app, &space_keys, space_id, first).await?;
	watched(&space_keys)?.ok_or_else(|| "the new space key did not read back".to_owned())
}

pub(super) async fn space_key_stored<R: Runtime>(
	app: &AppHandle<R>,
	space_keys: &SpaceKeys,
	space_id: &str,
	space: HeldSpaceKey,
) -> Result<(), String> {
	let key_id = space.key_id;
	let state = app.state::<DatabaseState>();
	let database =
		ready(&state).map_err(|failure| format!("the database is unavailable: {failure:?}"))?;
	database.space_relay().counter_started(space_id.to_owned(), key_id).await.map_err(
		|failure| format!("the ctr of space key_id {key_id} was not started: {failure:?}"),
	)?;
	space_keys
		.stored(space_id, space)
		.map_err(|failure| format!("space key_id {key_id} was not stored: {failure:?}"))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum Dropped {
	NotV2,
	Malformed(&'static str),
	UnknownKey(u32),
	StaleKey(u32),
	UnknownSender,
	Refused(CryptoError),
	Unstored(String),
}

#[derive(Debug)]
pub(super) struct Refusal {
	pub(super) from: Option<String>,
	pub(super) cause: Dropped,
}

pub(super) fn dropped_line(space_id: &str, refusal: &Refusal) -> String {
	let from =
		refusal.from.as_deref().map_or_else(|| "none".to_owned(), |from| json!(from).to_string());
	format!("hosted space {space_id} dropped a relay frame from {from}: {:?}", refusal.cause)
}

pub(super) struct Opened {
	pub(super) sender: Rostered,
	pub(super) challenge: Option<[u8; CHALLENGE_LENGTH]>,
	pub(super) plaintext: String,
}

impl Opened {
	pub(super) fn is_hello(&self) -> bool {
		serde_json::from_str::<Value>(&self.plaintext)
			.is_ok_and(|plaintext| plaintext == json!({ "hello": {} }))
	}
}

pub(crate) struct Fields {
	pub(crate) key_id: u32,
	pub(crate) ctr: u64,
	pub(crate) challenge: Option<[u8; CHALLENGE_LENGTH]>,
	pub(crate) ciphertext: Vec<u8>,
	pub(crate) sig: Signature,
}

struct Sealing {
	space: Arc<HeldSpaceKey>,
	subkey: Subkey,
	next_ctr: u64,
	reserved: u64,
}

impl Sealing {
	fn under(space: Arc<HeldSpaceKey>, host: &DeviceId) -> Self {
		let subkey = Subkey::derive(&space.key, space.key_id, host);
		Self { space, subkey, next_ctr: 1, reserved: 0 }
	}
}

pub(super) struct Wire<'a> {
	database: &'a Database,
	keys: &'a HostKeys,
	space_id: &'a str,
	instance_id: &'a str,
	sealing: Sealing,
	challenges: HashMap<DeviceId, [u8; CHALLENGE_LENGTH]>,
}

impl<'a> Wire<'a> {
	pub(super) fn new(
		database: &'a Database,
		keys: &'a HostKeys,
		space_id: &'a str,
		instance_id: &'a str,
	) -> Self {
		let sealing = Sealing::under(keys.current_space_key(), &keys.device.device_id());
		Self { database, keys, space_id, instance_id, sealing, challenges: HashMap::new() }
	}

	pub(super) async fn opened(&self, text: &str) -> Result<Opened, Refusal> {
		let envelope: Value = serde_json::from_str(text)
			.map_err(|_| Refusal { from: None, cause: Dropped::NotV2 })?;
		let from = envelope.get("from").and_then(Value::as_str).map(str::to_owned);
		let refused = |cause| Refusal { from: from.clone(), cause };
		if envelope.get("v").and_then(Value::as_u64) != Some(u64::from(VERSION)) {
			return Err(refused(Dropped::NotV2));
		}
		let wire_from = from.as_deref().ok_or_else(|| refused(Dropped::Malformed("from")))?;
		let fields = fields_of(&envelope).map_err(refused)?;
		self.opened_from(wire_from, fields).await.map_err(refused)
	}

	async fn opened_from(&self, wire_from: &str, fields: Fields) -> Result<Opened, Dropped> {
		let key_id = fields.key_id;
		let space = self.keys.current_space_key();
		if key_id > space.key_id {
			return Err(Dropped::UnknownKey(key_id));
		}
		let sender = roster::sender_of(self.database, self.space_id, &self.keys.device, wire_from)
			.await
			.map_err(unstored)?
			.ok_or(Dropped::UnknownSender)?;
		if key_id < space.key_id {
			return Err(Dropped::StaleKey(key_id));
		}
		let counters = self.database.space_relay();
		let device_id = sender.device_id.to_string();
		let last = counters
			.last_accepted(self.space_id.to_owned(), device_id.clone(), key_id)
			.await
			.map_err(unstored)?;
		if last.is_some_and(|last| fields.ctr <= last) {
			return Err(Dropped::Refused(CryptoError::Replay));
		}
		let header = Header {
			instance: self.instance_id.to_owned(),
			from: sender.device_id,
			to: None,
			key_id,
			ctr: fields.ctr,
			challenge: fields.challenge,
		};
		let frame = Frame { header, ciphertext: fields.ciphertext, sig: fields.sig };
		let subkey = Subkey::derive(&space.key, key_id, &sender.device_id);
		let plaintext = frame::open(&frame, &subkey, &sender.signing).map_err(Dropped::Refused)?;
		let is_advanced = counters
			.accepted(self.space_id.to_owned(), device_id, key_id, fields.ctr)
			.await
			.map_err(unstored)?;
		if !is_advanced {
			return Err(Dropped::Refused(CryptoError::Replay));
		}
		let plaintext =
			String::from_utf8(plaintext).map_err(|_| Dropped::Malformed("plaintext"))?;
		Ok(Opened { sender, challenge: frame.header.challenge, plaintext })
	}

	pub(super) fn is_current(&self, opened: &Opened) -> bool {
		let held = self.challenges.get(&opened.sender.device_id);
		held.is_some_and(|held| opened.challenge.as_ref() == Some(held))
	}

	pub(super) async fn hello(&mut self, to: &Rostered) -> Result<String, String> {
		let challenge =
			fresh_challenge().map_err(|failure| format!("no challenge was drawn: {failure:?}"))?;
		self.challenges.insert(to.device_id, challenge);
		self.sealed_with(HELLO, Some(to), Some(challenge)).await
	}

	pub(super) async fn rechallenged(&mut self, to: &Rostered) -> Result<String, String> {
		match self.challenges.get(&to.device_id).copied() {
			Some(held) => self.sealed_with(HELLO, Some(to), Some(held)).await,
			None => self.hello(to).await,
		}
	}

	pub(super) async fn sealed(
		&mut self,
		plaintext: &str,
		to: Option<&Rostered>,
	) -> Result<String, String> {
		self.sealed_with(plaintext, to, None).await
	}

	async fn sealed_with(
		&mut self,
		plaintext: &str,
		to: Option<&Rostered>,
		challenge: Option<[u8; CHALLENGE_LENGTH]>,
	) -> Result<String, String> {
		let current = self.keys.current_space_key();
		if current.key_id != self.sealing.space.key_id {
			self.sealing = Sealing::under(current, &self.keys.device.device_id());
		}
		let header = Header {
			instance: self.instance_id.to_owned(),
			from: self.keys.device.device_id(),
			to: to.map(|to| to.device_id),
			key_id: self.sealing.space.key_id,
			ctr: self.next_ctr().await?,
			challenge,
		};
		let frame =
			frame::seal(header, plaintext.as_bytes(), &self.sealing.subkey, &self.keys.device)
				.map_err(|failure| format!("a relay frame was not sealed: {failure:?}"))?;
		Ok(envelope_of(&frame, to.map(|to| to.relay_device_id.as_str())))
	}

	async fn next_ctr(&mut self) -> Result<u64, String> {
		let sealing = &mut self.sealing;
		if sealing.next_ctr > sealing.reserved {
			let key_id = sealing.space.key_id;
			let reserved = self
				.database
				.space_relay()
				.reserved(self.space_id.to_owned(), key_id, CTR_BLOCK)
				.await
				.map_err(|failure| {
					format!(
						"the reserved ctr bound of key_id {key_id} did not read back: {failure:?}"
					)
				})?
				.ok_or_else(|| format!("no reserved ctr bound of key_id {key_id} reads back"))?;
			if reserved > MAX_CTR {
				return Err(format!("the ctr of key_id {key_id} reached its bound"));
			}
			sealing.next_ctr = sealing.next_ctr.max(reserved.saturating_sub(CTR_BLOCK) + 1);
			sealing.reserved = reserved;
		}
		let ctr = sealing.next_ctr;
		sealing.next_ctr += 1;
		Ok(ctr)
	}
}

pub(crate) fn unstored(failure: DatabaseError) -> Dropped {
	Dropped::Unstored(format!("{failure:?}"))
}

pub(crate) fn fields_of(envelope: &Value) -> Result<Fields, Dropped> {
	let key_id = envelope
		.get("key_id")
		.and_then(Value::as_u64)
		.and_then(|key_id| u32::try_from(key_id).ok())
		.ok_or(Dropped::Malformed("key_id"))?;
	let ctr = envelope
		.get("ctr")
		.and_then(Value::as_u64)
		.filter(|ctr| *ctr <= MAX_CTR)
		.ok_or(Dropped::Malformed("ctr"))?;
	let challenge = match envelope.get("challenge") {
		None => None,
		Some(challenge) => Some(sized(challenge).ok_or(Dropped::Malformed("challenge"))?),
	};
	let ciphertext = envelope.get("ct").and_then(decoded).ok_or(Dropped::Malformed("ct"))?;
	let sig = envelope
		.get("sig")
		.and_then(sized::<SIGNATURE_LENGTH>)
		.map(|sig| Signature::from_bytes(&sig))
		.ok_or(Dropped::Malformed("sig"))?;
	Ok(Fields { key_id, ctr, challenge, ciphertext, sig })
}

fn decoded(field: &Value) -> Option<Vec<u8>> {
	BASE64_STANDARD.decode(field.as_str()?).ok()
}

fn sized<const N: usize>(field: &Value) -> Option<[u8; N]> {
	decoded(field)?.try_into().ok()
}

pub(crate) fn envelope_of(frame: &Frame, to: Option<&str>) -> String {
	let header = &frame.header;
	let mut envelope = json!({
		"v": VERSION,
		"instance": header.instance,
		"key_id": header.key_id,
		"ctr": header.ctr,
		"ct": BASE64_STANDARD.encode(&frame.ciphertext),
		"sig": BASE64_STANDARD.encode(frame.sig.to_bytes()),
	});
	if let Some(to) = to {
		envelope["to"] = json!(to);
	}
	if let Some(challenge) = header.challenge {
		envelope["challenge"] = json!(BASE64_STANDARD.encode(challenge));
	}
	envelope.to_string()
}

#[cfg(test)]
mod tests {
	use ed25519_dalek::VerifyingKey;

	use super::super::roster;
	use super::super::sealing_member::{host_frame_opened, SealingMember, Space};
	use super::*;
	use crate::db::connection::temp_dir;

	const SPACE: &str = "personal";
	const INSTANCE: &str = "instance-1";
	const CALL: &str = r#"{"id":1,"command":"agent_models"}"#;

	fn host_keys() -> HostKeys {
		HostKeys {
			device: DeviceKeys::generate().expect("randomness"),
			space: tokio::sync::watch::channel(Arc::new(
				HeldSpaceKey::first().expect("randomness"),
			))
			.1,
		}
	}

	fn space_of<'a>(held: &'a HeldSpaceKey, host: &'a VerifyingKey) -> Space<'a> {
		Space { instance_id: INSTANCE, key: held, host }
	}

	async fn rostered(database: &Database, keys: &HostKeys, member: &SealingMember) -> Rostered {
		let row = member.row(&keys.device, SPACE);
		database.space_relay().rostered(SPACE.to_owned(), row.clone()).await.expect("rostered");
		roster::verified(&keys.device.signing_public(), SPACE, &row).expect("a verified row")
	}

	async fn dropped(wire: &Wire<'_>, text: &str) -> Option<Dropped> {
		wire.opened(text).await.err().map(|refusal| refusal.cause)
	}

	#[tokio::test]
	async fn a_frame_signed_by_a_key_outside_the_roster_is_dropped_and_logged() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		let space = space_of(&held, &host);
		let member = SealingMember::new("a1");
		rostered(&database, &keys, &member).await;
		let impostor = SealingMember {
			relay_device_id: member.relay_device_id.clone(),
			..SealingMember::new("a1")
		};
		let stranger = SealingMember::new("a2");
		let wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		let forged = wire.opened(&impostor.sealed(&space, 1, CALL, None)).await.err();
		let unknown = wire.opened(&stranger.sealed(&space, 1, CALL, None)).await.err();

		let forged = forged.expect("the impostor frame is dropped");
		let unknown = unknown.expect("the stranger frame is dropped");
		assert_eq!(forged.cause, Dropped::Refused(CryptoError::ForgedSignature));
		assert_eq!(unknown.cause, Dropped::UnknownSender);
		let line = dropped_line(SPACE, &unknown);
		assert!(line.contains(SPACE), "{line}");
		assert!(line.contains(&stranger.relay_device_id), "{line}");
		assert!(line.contains("UnknownSender"), "{line}");
		assert!(!line.contains("\"ct\"") && !line.contains("agent_models"), "{line}");
		assert!(wire.opened(&member.sealed(&space, 1, CALL, None)).await.is_ok());
	}

	#[tokio::test]
	async fn a_roster_row_whose_signature_does_not_verify_resolves_no_sender() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		let member = SealingMember::new("a1");
		let mut row = member.row(&keys.device, SPACE);
		row.account_id = "another-account".to_owned();
		database.space_relay().rostered(SPACE.to_owned(), row).await.expect("rostered");
		let wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		let sealed = member.sealed(&space_of(&held, &host), 1, CALL, None);

		assert_eq!(dropped(&wire, &sealed).await, Some(Dropped::UnknownSender));
	}

	#[tokio::test]
	async fn a_frame_from_the_host_own_device_resolves_no_sender() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		roster::host_rostered(&database, SPACE, &keys.device, "r-host", "owner")
			.await
			.expect("the host row is kept");
		let reflected = SealingMember {
			keys: DeviceKeys::from_secret(&keys.device.secret()),
			relay_device_id: "r-host".to_owned(),
			account_id: "owner".to_owned(),
		};
		let wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		let sealed = reflected.sealed(&space_of(&held, &host), 1, CALL, None);

		assert_eq!(dropped(&wire, &sealed).await, Some(Dropped::UnknownSender));
	}

	#[tokio::test]
	async fn a_frame_that_is_not_v2_or_misses_a_field_is_dropped_typed() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		assert_eq!(dropped(&wire, CALL).await, Some(Dropped::NotV2));
		assert_eq!(dropped(&wire, "not json").await, Some(Dropped::NotV2));
		assert_eq!(
			dropped(&wire, r#"{"v":2,"from":"r","key_id":1,"ctr":1,"sig":"AA=="}"#).await,
			Some(Dropped::Malformed("ct"))
		);
		assert_eq!(
			dropped(&wire, r#"{"v":2,"key_id":1,"ctr":1}"#).await,
			Some(Dropped::Malformed("from"))
		);
	}

	#[tokio::test]
	async fn a_replayed_ctr_is_refused_including_after_the_database_is_reopened() {
		let dir = temp_dir();
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		let space = space_of(&held, &host);
		let member = SealingMember::new("a1");
		let fifth = member.sealed(&space, 5, CALL, None);
		{
			let database = crate::db::open(&dir);
			rostered(&database, &keys, &member).await;
			let wire = Wire::new(&database, &keys, SPACE, INSTANCE);
			assert!(wire.opened(&fifth).await.is_ok());
			assert_eq!(dropped(&wire, &fifth).await, Some(Dropped::Refused(CryptoError::Replay)));
			let fourth = member.sealed(&space, 4, CALL, None);
			assert_eq!(dropped(&wire, &fourth).await, Some(Dropped::Refused(CryptoError::Replay)));
		}

		let reopened = crate::db::open(&dir);
		let wire = Wire::new(&reopened, &keys, SPACE, INSTANCE);

		assert_eq!(dropped(&wire, &fifth).await, Some(Dropped::Refused(CryptoError::Replay)));
		assert!(wire.opened(&member.sealed(&space, 6, CALL, None)).await.is_ok());
	}

	#[tokio::test]
	async fn an_answer_sealed_to_device_a_does_not_open_as_addressed_to_device_b() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		let space = space_of(&held, &host);
		database
			.space_relay()
			.counter_started(SPACE.to_owned(), held.key_id)
			.await
			.expect("started");
		let device_a = SealingMember::new("a");
		let device_b = SealingMember::new("b");
		let to_a = rostered(&database, &keys, &device_a).await;
		let mut wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		let sealed = wire.sealed(r#"{"id":1,"status":200,"body":null}"#, Some(&to_a)).await;

		let envelope: Value = serde_json::from_str(&sealed.expect("sealed")).expect("json");
		assert_eq!(envelope["to"], json!(device_a.relay_device_id));
		assert!(host_frame_opened(&space, &envelope, Some(device_a.keys.device_id())).is_ok());
		assert_eq!(
			host_frame_opened(&space, &envelope, Some(device_b.keys.device_id())),
			Err(CryptoError::ForgedSignature)
		);
	}

	#[tokio::test]
	async fn every_sealed_frame_takes_a_fresh_ctr_under_a_bound_reserved_before_it_leaves() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let host = keys.device.signing_public();
		let held = keys.current_space_key();
		let space = space_of(&held, &host);
		let relay = database.space_relay();
		relay.counter_started(SPACE.to_owned(), held.key_id).await.expect("started");
		let ctr_of = |sealed: Result<String, String>| {
			let envelope: Value = serde_json::from_str(&sealed.expect("sealed")).expect("json");
			host_frame_opened(&space, &envelope, None).expect("the event opens").ctr
		};

		let mut first = Wire::new(&database, &keys, SPACE, INSTANCE);
		let before =
			[ctr_of(first.sealed("{}", None).await), ctr_of(first.sealed("{}", None).await)];
		let mut restarted = Wire::new(&database, &keys, SPACE, INSTANCE);
		let after = ctr_of(restarted.sealed("{}", None).await);
		let reserved = relay.reserved(SPACE.to_owned(), held.key_id, 0).await.expect("read");

		assert_eq!(before, [1, 2]);
		assert_eq!(after, CTR_BLOCK + 1);
		assert_eq!(reserved, Some(2 * CTR_BLOCK));
	}

	#[tokio::test]
	async fn without_a_reserved_bound_that_reads_back_nothing_is_sealed() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let keys = host_keys();
		let mut wire = Wire::new(&database, &keys, SPACE, INSTANCE);

		let refused = wire.sealed("{}", None).await;

		assert_eq!(refused, Err("no reserved ctr bound of key_id 1 reads back".to_owned()));
	}
}
