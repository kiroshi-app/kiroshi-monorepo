use std::collections::{HashMap, VecDeque};
use std::time::Duration;

use serde::Deserialize;
use serde_json::{json, Value};
use tokio::time::Instant;

const RESYNC_EVERY: Duration = Duration::from_secs(5);

const DEVICE_SOCKET_FULL: &str = "Device socket is full";

const PAYLOAD_TOO_LARGE: u64 = 413;

const BAD_REQUEST: u64 = 400;

const ENVELOPE_REFUSALS: [&str; 4] = [
	"Frame must be a v2 envelope",
	"Frame v2 to must be a device id",
	"Frame v2 must name the instance of the socket",
	"Frame v2 must leave from to the relay",
];

const HELD_ANSWERS: usize = 1024;

#[derive(Debug, PartialEq, Eq)]
pub(super) struct RelayRefusal {
	status: u64,
	reason: String,
	device_id: Option<String>,
}

impl RelayRefusal {
	pub(super) fn backlogged_device(&self) -> Option<&str> {
		let is_full = self.status == PAYLOAD_TOO_LARGE && self.reason == DEVICE_SOCKET_FULL;
		self.device_id.as_deref().filter(|_| is_full)
	}

	fn is_known(&self) -> bool {
		self.backlogged_device().is_some()
			|| (self.status == BAD_REQUEST && ENVELOPE_REFUSALS.contains(&self.reason.as_str()))
	}
}

pub(super) fn refusal_of(envelope: &Value) -> Option<RelayRefusal> {
	if envelope.get("id") != Some(&Value::Null) {
		return None;
	}
	let status = envelope.get("status").and_then(Value::as_u64)?;
	let body = envelope.get("body");
	let reason = match body.and_then(|body| body.get("error")) {
		Some(Value::String(reason)) => reason.clone(),
		_ => body.map_or_else(|| "none".to_owned(), Value::to_string),
	};
	let device_id =
		body.and_then(|body| body.get("deviceId")).and_then(Value::as_str).map(str::to_owned);
	Some(RelayRefusal { status, reason, device_id })
}

pub(super) fn refusal_line(
	space_id: &str,
	instance_id: &str,
	refusal: &RelayRefusal,
	sequel: &str,
) -> String {
	let known = if refusal.is_known() { "" } else { " the host does not know" };
	let device = refusal
		.device_id
		.as_deref()
		.map_or_else(String::new, |device_id| format!(", relay device {}", json!(device_id)));
	format!(
		"hosted space {space_id} (instance {instance_id}) heard a relay refusal{known}: status {}, reason {}{device}{sequel}",
		refusal.status,
		json!(refusal.reason)
	)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SentKind {
	Event,
	CallAnswer,
	FileAnswer,
	Rekey,
}

#[derive(Deserialize)]
struct AnsweredCall {
	id: Value,
}

#[derive(Default)]
struct Unconfirmed {
	events: u64,
	call_answers: u64,
	file_answers: u64,
	rekeys: u64,
	events_to_everyone_before: u64,
	answered: VecDeque<Value>,
}

struct Behind {
	resync_at: Instant,
	is_refused_again: bool,
}

pub(super) enum Resync {
	Due(String),
	Settled(String),
}

#[derive(Default)]
pub(super) struct Deliveries {
	events_to_everyone: u64,
	unconfirmed: HashMap<String, Unconfirmed>,
	behind: HashMap<String, Behind>,
}

impl Deliveries {
	pub(super) fn sent_to_everyone(&mut self) {
		self.events_to_everyone += 1;
	}

	pub(super) fn sent(&mut self, relay_device_id: &str, kind: SentKind) {
		let unconfirmed = self.unconfirmed.entry(relay_device_id.to_owned()).or_default();
		match kind {
			SentKind::Event => unconfirmed.events += 1,
			SentKind::CallAnswer => unconfirmed.call_answers += 1,
			SentKind::FileAnswer => unconfirmed.file_answers += 1,
			SentKind::Rekey => unconfirmed.rekeys += 1,
		}
	}

	pub(super) fn answered(&mut self, relay_device_id: &str, kind: SentKind, answer: &str) {
		self.sent(relay_device_id, kind);
		let Ok(AnsweredCall { id }) = serde_json::from_str(answer) else {
			return;
		};
		let unconfirmed = self.unconfirmed.entry(relay_device_id.to_owned()).or_default();
		unconfirmed.answered.push_back(id);
		if unconfirmed.answered.len() > HELD_ANSWERS {
			unconfirmed.answered.pop_front();
		}
	}

	pub(super) fn unconfirmed_line(&self, relay_device_id: &str) -> String {
		let held = self.unconfirmed.get(relay_device_id);
		let count = |of: fn(&Unconfirmed) -> u64| held.map_or(0, of);
		let events = self.events_to_everyone - count(|held| held.events_to_everyone_before)
			+ count(|held| held.events);
		format!(
			", unconfirmed frames sent to it: {events} events, {} call answers, {} file answers, {} rekeys",
			count(|held| held.call_answers),
			count(|held| held.file_answers),
			count(|held| held.rekeys)
		)
	}

	pub(super) fn has_unconfirmed_rekeys(&self, relay_device_id: &str) -> bool {
		self.unconfirmed.get(relay_device_id).is_some_and(|held| held.rekeys > 0)
	}

	pub(super) fn refused(&mut self, relay_device_id: &str) -> bool {
		if let Some(behind) = self.behind.get_mut(relay_device_id) {
			behind.is_refused_again = true;
			return false;
		}
		let behind = Behind { resync_at: Instant::now() + RESYNC_EVERY, is_refused_again: false };
		self.behind.insert(relay_device_id.to_owned(), behind);
		true
	}

	pub(super) fn next_resync_at(&self) -> Option<Instant> {
		self.behind.values().map(|behind| behind.resync_at).min()
	}

	pub(super) fn resyncs_due(&mut self, now: Instant) -> Vec<Resync> {
		let mut resyncs = Vec::new();
		self.behind.retain(|relay_device_id, behind| {
			if behind.resync_at > now {
				return true;
			}
			if behind.is_refused_again {
				*behind = Behind { resync_at: now + RESYNC_EVERY, is_refused_again: false };
				resyncs.push(Resync::Due(relay_device_id.clone()));
				return true;
			}
			resyncs.push(Resync::Settled(relay_device_id.clone()));
			false
		});
		for resync in &resyncs {
			if let Resync::Settled(relay_device_id) = resync {
				let confirmed = Unconfirmed {
					events_to_everyone_before: self.events_to_everyone,
					..Default::default()
				};
				self.unconfirmed.insert(relay_device_id.clone(), confirmed);
			}
		}
		resyncs
	}

	pub(super) fn left(&mut self, relay_device_id: &str) {
		self.behind.remove(relay_device_id);
		self.unconfirmed.remove(relay_device_id);
	}

	pub(super) fn resync_frame(&self, relay_device_id: &str) -> String {
		let answered: Vec<&Value> = self
			.unconfirmed
			.get(relay_device_id)
			.map(|held| held.answered.iter().collect())
			.unwrap_or_default();
		json!({ "resync": { "answered": answered } }).to_string()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const DEVICE: &str = "6b1f9a52-1c1e-4a40-9a77-3a5f0f0e2d11";

	fn refusal(text: &str) -> Option<RelayRefusal> {
		refusal_of(&serde_json::from_str(text).expect("json"))
	}

	fn full(device_id: &str) -> String {
		json!({ "id": null, "status": 413, "body": { "error": DEVICE_SOCKET_FULL, "deviceId": device_id } })
			.to_string()
	}

	#[test]
	fn every_refusal_the_relay_answers_a_host_is_read_and_only_the_device_one_names_a_device() {
		for reason in ENVELOPE_REFUSALS {
			let text = json!({ "id": null, "status": 400, "body": { "error": reason } });
			let read = refusal(&text.to_string()).expect("a refusal");
			assert!(read.is_known(), "{reason}");
			assert_eq!(read.backlogged_device(), None);
		}
		let read = refusal(&full(DEVICE)).expect("a refusal");
		assert!(read.is_known());
		assert_eq!(read.backlogged_device(), Some(DEVICE));
	}

	#[test]
	fn a_refusal_of_an_unknown_status_or_reason_is_read_with_its_raw_reason_and_names_no_backlog() {
		let unknown_reason =
			refusal(r#"{"id":null,"status":413,"body":{"error":"Host socket is full"}}"#)
				.expect("a refusal");
		let unknown_status = refusal(
			r#"{"id":null,"status":429,"body":{"error":"Device socket is full","deviceId":"d"}}"#,
		)
		.expect("a refusal");
		let no_error =
			refusal(r#"{"id":null,"status":500,"body":{"detail":1}}"#).expect("a refusal");

		for read in [&unknown_reason, &unknown_status, &no_error] {
			assert!(!read.is_known());
			assert_eq!(read.backlogged_device(), None);
		}
		assert!(refusal_line("s", "i", &unknown_reason, "").contains("\"Host socket is full\""));
		assert!(refusal_line("s", "i", &no_error, "").contains(r#""{\"detail\":1}""#));
	}

	#[test]
	fn an_answer_an_event_or_a_frame_with_an_id_is_no_refusal() {
		assert_eq!(refusal(r#"{"id":3,"status":413,"body":"x"}"#), None);
		assert_eq!(refusal(r#"{"event":"device.approved"}"#), None);
		assert_eq!(refusal(r#"{"id":null,"body":{}}"#), None);
	}

	#[test]
	fn the_unconfirmed_line_counts_events_to_everyone_and_each_kind_sent_to_the_device() {
		let mut deliveries = Deliveries::default();
		deliveries.sent_to_everyone();
		deliveries.sent_to_everyone();
		deliveries.sent(DEVICE, SentKind::Event);
		deliveries.answered(DEVICE, SentKind::CallAnswer, r#"{"id":7,"status":200,"body":1}"#);
		deliveries.answered(DEVICE, SentKind::FileAnswer, r#"{"id":8,"status":200,"body":1}"#);
		deliveries.sent(DEVICE, SentKind::Rekey);
		deliveries.sent("another", SentKind::Rekey);

		assert_eq!(
			deliveries.unconfirmed_line(DEVICE),
			", unconfirmed frames sent to it: 3 events, 1 call answers, 1 file answers, 1 rekeys"
		);
		assert_eq!(
			deliveries.resync_frame(DEVICE),
			json!({ "resync": { "answered": [7, 8] } }).to_string()
		);
		assert!(deliveries.has_unconfirmed_rekeys(DEVICE));
		assert!(!deliveries.has_unconfirmed_rekeys("a device sent nothing"));
	}

	#[test]
	fn a_device_resynced_again_until_one_interval_passes_without_a_refusal_then_starts_a_new_ledger(
	) {
		let mut deliveries = Deliveries::default();
		deliveries.sent_to_everyone();
		deliveries.answered(DEVICE, SentKind::CallAnswer, r#"{"id":7,"status":200,"body":1}"#);

		assert!(deliveries.refused(DEVICE));
		assert!(!deliveries.refused(DEVICE));
		let first = deliveries.next_resync_at().expect("a resync is due");
		assert!(deliveries.resyncs_due(first - Duration::from_millis(1)).is_empty());
		let due = deliveries.resyncs_due(first);
		assert!(matches!(due.as_slice(), [Resync::Due(device)] if device == DEVICE));

		let second = deliveries.next_resync_at().expect("a resync is due again");
		assert_eq!(second, first + RESYNC_EVERY);
		let settled = deliveries.resyncs_due(second);
		assert!(matches!(settled.as_slice(), [Resync::Settled(device)] if device == DEVICE));
		assert_eq!(deliveries.next_resync_at(), None);
		assert_eq!(
			deliveries.unconfirmed_line(DEVICE),
			", unconfirmed frames sent to it: 0 events, 0 call answers, 0 file answers, 0 rekeys"
		);
	}

	#[test]
	fn a_device_that_left_is_no_longer_resynced() {
		let mut deliveries = Deliveries::default();
		assert!(deliveries.refused(DEVICE));

		deliveries.left(DEVICE);

		assert_eq!(deliveries.next_resync_at(), None);
		assert!(deliveries.refused(DEVICE));
	}

	#[test]
	fn the_answers_held_for_a_resync_are_bounded() {
		let mut deliveries = Deliveries::default();
		for id in 0..HELD_ANSWERS + 3 {
			let answer = json!({ "id": id, "status": 200, "body": null }).to_string();
			deliveries.answered(DEVICE, SentKind::CallAnswer, &answer);
		}

		let frame: Value = serde_json::from_str(&deliveries.resync_frame(DEVICE)).expect("json");
		let answered = frame["resync"]["answered"].as_array().expect("the answered ids");
		assert_eq!(answered.len(), HELD_ANSWERS);
		assert_eq!(answered[0], json!(3));
	}
}
