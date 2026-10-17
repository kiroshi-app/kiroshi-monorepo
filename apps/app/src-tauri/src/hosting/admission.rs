use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde_json::{json, Value};
use zeroize::Zeroizing;

use super::handover;
use super::roster::{signed_row, Enrolled};
use super::wire::{unstored, Dropped, HostKeys, Refusal};
use crate::crypto::frame::VERSION;
use crate::crypto::join::{self, JoinRequest, PAYLOAD_LENGTH};
use crate::crypto::sealed_box;
use crate::db::repositories::space_relay::JoinSecret;
use crate::db::Database;

#[derive(Debug)]
pub(super) struct Join {
	from: String,
	sealed: Option<Vec<u8>>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum JoinRefused {
	Used,
	Unknown,
	Malformed,
}

impl JoinRefused {
	fn as_wire(self) -> &'static str {
		match self {
			JoinRefused::Used => "used",
			JoinRefused::Unknown => "unknown",
			JoinRefused::Malformed => "malformed",
		}
	}
}

pub(super) struct HostedSpace<'a> {
	pub(super) database: &'a Database,
	pub(super) keys: &'a HostKeys,
	pub(super) space_id: &'a str,
	pub(super) instance_id: &'a str,
}

pub(super) fn join_of(text: &str) -> Option<Result<Join, Refusal>> {
	let envelope: Value = serde_json::from_str(text).ok()?;
	let join = envelope.get("join")?;
	let from = envelope.get("from").and_then(Value::as_str).map(str::to_owned);
	if envelope.get("v").and_then(Value::as_u64) != Some(u64::from(VERSION)) {
		return Some(Err(Refusal { from, cause: Dropped::NotV2 }));
	}
	let Some(from) = from else {
		return Some(Err(Refusal { from: None, cause: Dropped::Malformed("from") }));
	};
	let sealed = join.as_str().and_then(|sealed| BASE64_STANDARD.decode(sealed).ok());
	Some(Ok(Join { from, sealed }))
}

impl HostedSpace<'_> {
	pub(super) async fn answered(&self, join: Join) -> Result<String, Refusal> {
		let from = join.from.clone();
		self.decided(join).await.map_err(|cause| Refusal { from: Some(from), cause })
	}

	async fn decided(&self, join: Join) -> Result<String, Dropped> {
		let Some(sealed) = join.sealed.as_deref().filter(|sealed| self.opens(sealed)) else {
			return Ok(self.refused(&join.from, JoinRefused::Malformed));
		};
		let secrets = self
			.database
			.space_relay()
			.join_secrets(self.space_id.to_owned())
			.await
			.map_err(unstored)?;
		let matched = secrets.into_iter().find_map(|secret| {
			let request = join::open(&secret.secret, self.keys.device.agreement(), sealed).ok()?;
			Some((secret, request))
		});
		match matched {
			None => Ok(self.refused(&join.from, JoinRefused::Unknown)),
			Some((secret, _)) if secret.is_used => Ok(self.refused(&join.from, JoinRefused::Used)),
			Some((secret, request)) => self.admitted(&join.from, &secret, &request).await,
		}
	}

	fn opens(&self, sealed: &[u8]) -> bool {
		sealed_box::open(self.keys.device.agreement(), sealed)
			.is_ok_and(|payload| payload.len() == PAYLOAD_LENGTH)
	}

	async fn admitted(
		&self,
		from: &str,
		secret: &JoinSecret,
		request: &JoinRequest,
	) -> Result<String, Dropped> {
		let now = chrono::Utc::now().timestamp_millis();
		let enrolled = Enrolled {
			relay_device_id: from,
			account_id: &secret.account_id,
			signing: &request.signing,
			agreement: request.agreement.as_bytes(),
			added_at: now,
		};
		let row = signed_row(&self.keys.device, self.space_id, &enrolled);
		let device_id = row.device_id.clone();
		let is_admitted = self
			.database
			.space_relay()
			.admitted(self.space_id.to_owned(), secret.id, now, row)
			.await
			.map_err(unstored)?;
		if !is_admitted {
			return Ok(self.refused(from, JoinRefused::Used));
		}
		eprintln!(
			"hosted space {} admitted device {device_id} of account {} at relay device {}",
			self.space_id,
			json!(secret.account_id),
			json!(from)
		);
		let handover = handover::current(self.database, self.keys, self.space_id)
			.await
			.map_err(Dropped::Unstored)?;
		let mac = join::answer_mac(&secret.secret, &handover.plaintext);
		let answer = Zeroizing::new([mac.as_slice(), &handover.plaintext].concat());
		let joined = sealed_box::seal(&request.agreement, &answer).map_err(Dropped::Refused)?;
		Ok(json!({
			"v": VERSION,
			"instance": self.instance_id,
			"to": from,
			"joined": BASE64_STANDARD.encode(joined),
		})
		.to_string())
	}

	fn refused(&self, from: &str, refusal: JoinRefused) -> String {
		eprintln!(
			"hosted space {} refused a join from {}: {}",
			self.space_id,
			json!(from),
			refusal.as_wire()
		);
		json!({
			"v": VERSION,
			"instance": self.instance_id,
			"to": from,
			"join_refused": refusal.as_wire(),
		})
		.to_string()
	}
}
