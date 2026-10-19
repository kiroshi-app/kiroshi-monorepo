use std::cmp::Ordering;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use ed25519_dalek::Signature;
use serde_json::Value;

use super::contract::JoinedSpaceError;
use super::held::Held;
use super::roster_set::{verified_handover, Handed, HeldRoster};
use crate::crypto::device_keys::verify;
use crate::crypto::error::CryptoError;
use crate::crypto::frame::{self, Frame, Header, CHALLENGE_LENGTH, VERSION};
use crate::crypto::sealed_box;
use crate::crypto::subkey::Subkey;
use crate::db::repositories::JoinedSpaceRelayRepository;
use crate::hosting::handover::{rekey_bytes, KeyHandover};
use crate::hosting::wire::{envelope_of, fields_of, unstored, Dropped, CTR_BLOCK, HELLO, MAX_CTR};

#[derive(Debug, PartialEq)]
pub(super) enum Refusal {
	Frame(Dropped),
	Roster(JoinedSpaceError),
}

impl From<Dropped> for Refusal {
	fn from(dropped: Dropped) -> Self {
		Refusal::Frame(dropped)
	}
}

pub(super) enum Heard {
	Hello,
	Frame(String),
	Rekey(Box<Handed>),
	Roster(Box<HeldRoster>),
	Current,
}

pub(super) struct MemberWire<'a> {
	relay: &'a JoinedSpaceRelayRepository,
	instance_id: &'a str,
	held: Held,
	challenge: Option<[u8; CHALLENGE_LENGTH]>,
	next_ctr: u64,
	reserved: u64,
}

impl<'a> MemberWire<'a> {
	pub(super) fn new(
		relay: &'a JoinedSpaceRelayRepository,
		instance_id: &'a str,
		held: Held,
	) -> Self {
		Self { relay, instance_id, held, challenge: None, next_ctr: 1, reserved: 0 }
	}

	pub(super) fn into_held(self) -> Held {
		self.held
	}

	pub(super) fn is_greeted(&self) -> bool {
		self.challenge.is_some()
	}

	pub(super) async fn hello(&mut self) -> Result<String, String> {
		self.sealed_with(HELLO, None).await
	}

	pub(super) async fn sealed(&mut self, plaintext: &str) -> Result<String, String> {
		self.sealed_with(plaintext, self.challenge).await
	}

	pub(super) fn rekeyed(&mut self, handed: Handed) {
		self.held.space = handed.space;
		self.held.roster = handed.roster;
		self.next_ctr = 1;
		self.reserved = 0;
	}

	pub(super) fn roster_taken(&mut self, roster: HeldRoster) {
		self.held.roster = roster;
	}

	async fn sealed_with(
		&mut self,
		plaintext: &str,
		challenge: Option<[u8; CHALLENGE_LENGTH]>,
	) -> Result<String, String> {
		let own = self.held.device.device_id();
		let key_id = self.held.space.key_id;
		let header = Header {
			instance: self.instance_id.to_owned(),
			from: own,
			to: None,
			key_id,
			ctr: self.next_ctr().await?,
			challenge,
		};
		let subkey = Subkey::derive(&self.held.space.key, key_id, &own);
		let sealed = frame::seal(header, plaintext.as_bytes(), &subkey, &self.held.device)
			.map_err(|failure| format!("a member frame was not sealed: {failure:?}"))?;
		Ok(envelope_of(&sealed, None))
	}

	async fn next_ctr(&mut self) -> Result<u64, String> {
		let key_id = self.held.space.key_id;
		if self.next_ctr > self.reserved {
			let reserved = self
				.relay
				.reserved(self.instance_id.to_owned(), key_id, CTR_BLOCK)
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
			self.next_ctr = self.next_ctr.max(reserved.saturating_sub(CTR_BLOCK) + 1);
			self.reserved = reserved;
		}
		let ctr = self.next_ctr;
		self.next_ctr += 1;
		Ok(ctr)
	}

	pub(super) async fn opened(&mut self, text: &str) -> Result<Heard, Refusal> {
		let envelope: Value = serde_json::from_str(text).map_err(|_| Dropped::NotV2)?;
		if envelope.get("v").and_then(Value::as_u64) != Some(u64::from(VERSION)) {
			return Err(Dropped::NotV2.into());
		}
		let host = &self.held.roster.host;
		if envelope.get("from").and_then(Value::as_str) != Some(host.relay_device_id.as_str()) {
			return Err(Dropped::UnknownSender.into());
		}
		let own = &self.held.roster.own;
		let to = match envelope.get("to") {
			None => None,
			Some(to) if *to == own.relay_device_id.as_str() => Some(own.device_id),
			Some(_) => return Err(Dropped::Malformed("to").into()),
		};
		if envelope.get("rekey").is_some() {
			return self.rekey_opened(&envelope);
		}
		let fields = fields_of(&envelope)?;
		let key_id = self.held.space.key_id;
		if fields.key_id > key_id {
			return Err(Dropped::UnknownKey(fields.key_id).into());
		}
		if fields.key_id < key_id {
			return Err(Dropped::StaleKey(fields.key_id).into());
		}
		let header = Header {
			instance: self.instance_id.to_owned(),
			from: host.device_id,
			to,
			key_id,
			ctr: fields.ctr,
			challenge: fields.challenge,
		};
		let sealed = Frame { header, ciphertext: fields.ciphertext, sig: fields.sig };
		let subkey = Subkey::derive(&self.held.space.key, key_id, &host.device_id);
		let plaintext = frame::open(&sealed, &subkey, &host.signing).map_err(Dropped::Refused)?;
		let is_advanced = self
			.relay
			.accepted(self.instance_id.to_owned(), key_id, fields.ctr)
			.await
			.map_err(unstored)?;
		if !is_advanced {
			return Err(Dropped::Refused(CryptoError::Replay).into());
		}
		let plaintext =
			String::from_utf8(plaintext).map_err(|_| Dropped::Malformed("plaintext"))?;
		if plaintext == HELLO {
			self.challenge = Some(fields.challenge.ok_or(Dropped::Malformed("challenge"))?);
			return Ok(Heard::Hello);
		}
		Ok(Heard::Frame(plaintext))
	}

	fn rekey_opened(&self, envelope: &Value) -> Result<Heard, Refusal> {
		let decoded = |key: &'static str| {
			let field = envelope.get(key).and_then(Value::as_str).ok_or(Dropped::Malformed(key))?;
			BASE64_STANDARD.decode(field).map_err(|_| Dropped::Malformed(key))
		};
		let sealed = decoded("rekey")?;
		let sig = Signature::from_slice(&decoded("sig")?).map_err(|_| Dropped::Malformed("sig"))?;
		let roster = &self.held.roster;
		let signed = rekey_bytes(self.instance_id, &roster.own.device_id, &sealed);
		verify(&roster.host.signing, &signed, &sig).map_err(Dropped::Refused)?;
		let opened =
			sealed_box::open(self.held.device.agreement(), &sealed).map_err(Dropped::Refused)?;
		let handover: KeyHandover =
			serde_json::from_slice(&opened).map_err(|_| Dropped::Malformed("rekey"))?;
		let handed = verified_handover(handover, Some(&roster.host.signing), &roster.own.device_id)
			.map_err(Refusal::Roster)?;
		let version = handed.roster.set.version;
		match handed.space.key_id.cmp(&self.held.space.key_id) {
			Ordering::Greater if version >= roster.set.version => {
				Ok(Heard::Rekey(Box::new(handed)))
			}
			Ordering::Equal if version > roster.set.version => {
				Ok(Heard::Roster(Box::new(handed.roster)))
			}
			Ordering::Equal if version == roster.set.version => Ok(Heard::Current),
			_ => Err(Dropped::StaleKey(handed.space.key_id).into()),
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Manager};

	use super::super::held;
	use super::super::test_host::{SealingHost, CHALLENGE};
	use super::*;
	use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
	use crate::crypto::device_keys::DeviceKeys;
	use crate::db::connection::temp_dir;
	use crate::db::{self, DatabaseState};
	use crate::logging::contract::InstallKind;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const INSTANCE: &str = "instance-1";

	const CALL: &str = r#"{"id":1,"command":"conversation_list","args":{}}"#;

	struct Member {
		app: AppOfItsOwn,
		host: SealingHost,
		_database: RemovedOnDrop,
	}

	async fn a_member() -> Member {
		let database = temp_dir();
		let app = an_app_of_its_own("member-wire", mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		let profile = app.path().app_data_dir().expect("the data folder resolves");
		let identifier = app.config().identifier.clone();
		app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(profile)));
		let host = SealingHost::planted(app.handle(), INSTANCE).await;
		Member { app, host, _database: database }
	}

	fn relay_of(app: &App<MockRuntime>) -> &JoinedSpaceRelayRepository {
		let state = app.state::<DatabaseState>().inner();
		state.as_ref().expect("the database").joined_space_relay()
	}

	async fn held_of(app: &App<MockRuntime>) -> Held {
		held::held(app.handle(), INSTANCE).await.expect("the keys read").expect("the keys are held")
	}

	fn ctr_of(sealed: &str) -> u64 {
		let envelope: Value = serde_json::from_str(sealed).expect("a json frame");
		envelope["ctr"].as_u64().expect("a ctr")
	}

	async fn dropped(wire: &mut MemberWire<'_>, text: &str) -> Option<Refusal> {
		wire.opened(text).await.err()
	}

	#[tokio::test]
	async fn the_hello_leaves_first_and_every_later_frame_carries_the_held_challenge_under_a_greater_ctr(
	) {
		let member = a_member().await;
		let relay = relay_of(&member.app);
		let mut wire = MemberWire::new(relay, INSTANCE, held_of(&member.app).await);

		let hello = wire.hello().await.expect("the hello seals");
		let greeted = matches!(wire.opened(&member.host.hello()).await, Ok(Heard::Hello));
		let first = wire.sealed(CALL).await.expect("the call seals");
		let second = wire.sealed(CALL).await.expect("the call seals");
		let mut restarted = MemberWire::new(relay, INSTANCE, wire.into_held());
		let after_restart = restarted.sealed(CALL).await.expect("the call seals");

		let opened_hello = member.host.opened(&hello);
		assert_eq!(
			(opened_hello.plaintext, opened_hello.challenge),
			(json!({ "hello": {} }), None)
		);
		assert!(greeted);
		assert_eq!(member.host.opened(&first).challenge, Some(CHALLENGE));
		assert_eq!(member.host.opened(&first).plaintext["command"], "conversation_list");
		let ctrs = [ctr_of(&hello), ctr_of(&first), ctr_of(&second), ctr_of(&after_restart)];
		assert!(ctrs.windows(2).all(|pair| pair[0] < pair[1]), "{ctrs:?}");
		assert!(serde_json::from_str::<Value>(&first).expect("json").get("to").is_none());
	}

	#[tokio::test]
	async fn a_host_frame_replayed_forged_or_relayed_from_another_device_is_dropped_typed() {
		let member = a_member().await;
		let mut wire = MemberWire::new(relay_of(&member.app), INSTANCE, held_of(&member.app).await);
		let answer = member.host.sealed(r#"{"id":1,"status":200,"body":[]}"#);
		let mut forged: Value = serde_json::from_str(&member.host.sealed("{}")).expect("json");
		forged["ctr"] = json!(forged["ctr"].as_u64().expect("a ctr") + 100);
		let mut foreign: Value = serde_json::from_str(&member.host.sealed("{}")).expect("json");
		foreign["from"] = json!("r-stranger");
		let mut misrouted: Value = serde_json::from_str(&member.host.sealed("{}")).expect("json");
		misrouted["to"] = json!("r-another-member");

		let heard = wire.opened(&answer).await.ok();
		let replayed = dropped(&mut wire, &answer).await;

		assert!(
			matches!(heard, Some(Heard::Frame(plaintext)) if plaintext.contains("\"status\":200"))
		);
		assert_eq!(replayed, Some(Refusal::Frame(Dropped::Refused(CryptoError::Replay))));
		assert_eq!(
			dropped(&mut wire, &forged.to_string()).await,
			Some(Refusal::Frame(Dropped::Refused(CryptoError::ForgedSignature)))
		);
		assert_eq!(
			dropped(&mut wire, &foreign.to_string()).await,
			Some(Refusal::Frame(Dropped::UnknownSender))
		);
		assert_eq!(
			dropped(&mut wire, &misrouted.to_string()).await,
			Some(Refusal::Frame(Dropped::Malformed("to")))
		);
		assert_eq!(dropped(&mut wire, CALL).await, Some(Refusal::Frame(Dropped::NotV2)));
	}

	#[tokio::test]
	async fn a_rekey_is_taken_only_under_a_greater_key_id_with_a_roster_at_least_as_recent() {
		let member = a_member().await;
		let mut wire = MemberWire::new(relay_of(&member.app), INSTANCE, held_of(&member.app).await);
		let stranger = DeviceKeys::generate().expect("randomness");

		let same_key = dropped(&mut wire, &member.host.rekey(1, 0)).await;
		let older_roster = dropped(&mut wire, &member.host.rekey(2, 0)).await;
		let forged = dropped(&mut wire, &member.host.rekey_signed_by(&stranger, 2, 2)).await;
		let taken = wire.opened(&member.host.rekey(2, 1)).await;

		assert_eq!(same_key, Some(Refusal::Frame(Dropped::StaleKey(1))));
		assert_eq!(older_roster, Some(Refusal::Frame(Dropped::StaleKey(2))));
		assert_eq!(forged, Some(Refusal::Frame(Dropped::Refused(CryptoError::ForgedSignature))));
		let Ok(Heard::Rekey(handed)) = taken else {
			panic!("the newer rekey is taken");
		};
		assert_eq!((handed.space.key_id, handed.roster.set.version), (2, 1));
		assert!(held::kept(member.app.handle(), INSTANCE, &handed)
			.await
			.expect("the rekey is kept"));
		wire.rekeyed(*handed);
		let sealed = wire.sealed(CALL).await.expect("the call seals under the new key");
		let envelope: Value = serde_json::from_str(&sealed).expect("json");
		assert_eq!(envelope["key_id"], 2);
		let lower_key = dropped(&mut wire, &member.host.rekey(1, 5)).await;
		assert_eq!(lower_key, Some(Refusal::Frame(Dropped::StaleKey(1))));
	}

	#[tokio::test]
	async fn a_newer_roster_under_the_held_key_id_is_taken_and_keeps_the_key_and_both_counters() {
		let member = a_member().await;
		let held_key = *held_of(&member.app).await.space.key;
		let mut wire = MemberWire::new(relay_of(&member.app), INSTANCE, held_of(&member.app).await);
		let newcomer = DeviceKeys::generate().expect("randomness");
		let before = wire.sealed(CALL).await.expect("the call seals");
		let heard_before = member.host.sealed("{}");
		assert!(matches!(wire.opened(&heard_before).await, Ok(Heard::Frame(_))));

		let taken = wire.opened(&member.host.roster_admitting(&newcomer, 2)).await;
		let Ok(Heard::Roster(roster)) = taken else {
			panic!("the newer roster under the held key_id is taken");
		};
		assert!(held::roster_kept(member.app.handle(), INSTANCE, &roster)
			.await
			.expect("the roster is stored"));
		wire.roster_taken(*roster);
		let current = wire.opened(&member.host.roster_admitting(&newcomer, 2)).await;
		let older = dropped(&mut wire, &member.host.roster_admitting(&newcomer, 1)).await;
		let after = wire.sealed(CALL).await.expect("the call seals under the held key");
		let replayed = dropped(&mut wire, &heard_before).await;
		let heard_after = wire.opened(&member.host.sealed("{}")).await;

		assert_eq!(ctr_of(&after), ctr_of(&before) + 1);
		assert_eq!(member.host.opened(&after).plaintext["command"], "conversation_list");
		assert!(matches!(current, Ok(Heard::Current)));
		assert_eq!(older, Some(Refusal::Frame(Dropped::StaleKey(1))));
		assert_eq!(replayed, Some(Refusal::Frame(Dropped::Refused(CryptoError::Replay))));
		assert!(matches!(heard_after, Ok(Heard::Frame(_))));
		let stored = held_of(&member.app).await;
		assert_eq!((stored.space.key_id, *stored.space.key), (1, held_key));
		assert_eq!((stored.roster.set.version, stored.roster.rows.len()), (2, 3));
	}
}
