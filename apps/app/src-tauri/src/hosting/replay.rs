use std::collections::VecDeque;

use reqwest::StatusCode;
use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Runtime};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::watch;

use super::bridge;
use super::reach::GuestEvents;
use crate::agent::commands::subscribed_with_pending_questions;
use crate::events::BUFFERED_FRAMES;

pub(crate) const RESUME_COMMAND: &str = "relay_resume";

pub(super) const RING_FRAMES: usize = BUFFERED_FRAMES;

pub(super) const RING_BYTES: usize = 4 * 1024 * 1024;

struct Recorded {
	seq: u64,
	frame: String,
}

pub(super) struct Ring {
	epoch: String,
	last_seq: u64,
	missed: u64,
	frames: VecDeque<Recorded>,
	bytes: usize,
}

impl Ring {
	pub(super) fn started() -> Self {
		Self {
			epoch: uuid::Uuid::new_v4().to_string(),
			last_seq: 0,
			missed: 0,
			frames: VecDeque::new(),
			bytes: 0,
		}
	}

	pub(super) fn epoch(&self) -> &str {
		&self.epoch
	}

	pub(super) fn last_seq(&self) -> u64 {
		self.last_seq
	}

	fn recorded(&mut self, published: &str) {
		self.last_seq += 1;
		let frame = bridge::forwarded(published, &self.epoch, self.last_seq);
		self.bytes += frame.len();
		self.frames.push_back(Recorded { seq: self.last_seq, frame });
		while self.frames.len() > RING_FRAMES || self.bytes > RING_BYTES {
			let Some(evicted) = self.frames.pop_front() else {
				break;
			};
			self.bytes -= evicted.frame.len();
		}
	}

	fn restarted(&mut self, missed: u64) {
		*self = Self { missed, ..Self::started() };
	}

	fn oldest_seq(&self) -> u64 {
		self.frames.front().map_or(self.last_seq + 1, |recorded| recorded.seq)
	}

	pub(super) fn followed(&self, epoch: &str, sent_seq: u64) -> Result<(Vec<String>, u64), u64> {
		if self.epoch != epoch {
			return Err(self.missed);
		}
		Ok((self.between(sent_seq, self.last_seq), self.last_seq))
	}

	fn between(&self, since: u64, until: u64) -> Vec<String> {
		self.frames
			.iter()
			.filter(|recorded| recorded.seq > since && recorded.seq <= until)
			.map(|recorded| recorded.frame.clone())
			.collect()
	}

	pub(super) fn resumed(&self, call: &ResumeCall, sent_seq: u64) -> Resumed {
		let args = &call.args;
		if args.epoch != self.epoch || args.since < self.oldest_seq() - 1 {
			let body = json!({ "token": args.token, "tooOld": true });
			return Resumed {
				frames: Vec::new(),
				answer: bridge::answer(call.id.clone(), StatusCode::OK, body),
			};
		}
		let frames = self.between(args.since, sent_seq);
		let body = json!({ "token": args.token, "replayed": frames.len() });
		Resumed { frames, answer: bridge::answer(call.id.clone(), StatusCode::OK, body) }
	}
}

pub(super) struct Resumed {
	pub(super) frames: Vec<String>,
	pub(super) answer: String,
}

#[derive(Deserialize)]
struct ResumeArgs {
	epoch: String,
	since: u64,
	token: String,
}

pub(super) struct ResumeCall {
	id: Value,
	args: ResumeArgs,
}

pub(super) fn resume_call(text: &str) -> Option<Result<ResumeCall, String>> {
	let frame: Value = serde_json::from_str(text).ok()?;
	if frame.get("command").and_then(Value::as_str) != Some(RESUME_COMMAND) {
		return None;
	}
	let id = frame.get("id").filter(|id| id.is_string() || id.is_number()).cloned();
	let args = frame.get("args").cloned().map(serde_json::from_value::<ResumeArgs>);
	Some(match (id, args) {
		(Some(id), Some(Ok(args))) => Ok(ResumeCall { id, args }),
		(id, _) => Err(bridge::refused(id)),
	})
}

pub(super) async fn recorded<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	ring: &watch::Sender<Ring>,
) {
	let mut guest_events = GuestEvents::new(space_id);
	loop {
		let (pending, mut heard) = subscribed_with_pending_questions(app);
		for frame in pending {
			if guest_events.reach_the_guest(app, &frame).await {
				ring.send_modify(|ring| ring.recorded(&frame));
			}
		}
		let missed = loop {
			match heard.recv().await {
				Ok(frame) => {
					if guest_events.reach_the_guest(app, &frame).await {
						ring.send_modify(|ring| ring.recorded(&frame));
					}
				}
				Err(RecvError::Lagged(missed)) => break missed,
				Err(RecvError::Closed) => return,
			}
		};
		ring.send_modify(|ring| ring.restarted(missed));
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_ring_of(published: &[&str]) -> Ring {
		let mut ring = Ring::started();
		for frame in published {
			ring.recorded(frame);
		}
		ring
	}

	fn a_resume(epoch: &str, since: u64) -> ResumeCall {
		let text = json!({
			"id": 7,
			"command": RESUME_COMMAND,
			"args": { "epoch": epoch, "since": since, "token": "t-1" },
		})
		.to_string();
		resume_call(&text).expect("a resume call").expect("a readable resume call")
	}

	fn seqs(frames: &[String]) -> Vec<u64> {
		frames
			.iter()
			.map(|frame| {
				let frame: Value = serde_json::from_str(frame).expect("a json frame");
				frame["seq"].as_u64().expect("a seq")
			})
			.collect()
	}

	fn body_of(answer: &str) -> Value {
		let answer: Value = serde_json::from_str(answer).expect("a json answer");
		assert_eq!((answer["id"].clone(), answer["status"].clone()), (json!(7), json!(200)));
		answer["body"].clone()
	}

	#[test]
	fn a_recorded_frame_is_stamped_with_the_epoch_and_the_next_seq() {
		let ring =
			a_ring_of(&[r#"{"event":"a://b","payload":1}"#, r#"{"event":"a://c","payload":2}"#]);

		let frames: Vec<Value> = ring
			.between(0, 2)
			.iter()
			.map(|frame| serde_json::from_str(frame).expect("a json frame"))
			.collect();

		assert_eq!(
			frames,
			vec![
				json!({ "event": { "event": "a://b", "payload": 1 }, "epoch": ring.epoch(), "seq": 1 }),
				json!({ "event": { "event": "a://c", "payload": 2 }, "epoch": ring.epoch(), "seq": 2 }),
			]
		);
	}

	#[test]
	fn the_ring_evicts_the_oldest_frame_past_its_frame_count() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		assert_eq!(ring.frames.len(), RING_FRAMES);
		assert_eq!(ring.oldest_seq(), 4);
		assert_eq!(ring.last_seq(), (RING_FRAMES + 3) as u64);
	}

	#[test]
	fn the_ring_evicts_the_oldest_frames_past_its_byte_size() {
		let large = format!("\"{}\"", "x".repeat(RING_BYTES / 3));

		let ring = a_ring_of(&[&large, &large, &large, &large]);

		assert_eq!(ring.frames.len(), 2);
		assert_eq!(ring.oldest_seq(), 3);
		assert!(ring.bytes <= RING_BYTES);
	}

	#[test]
	fn a_resume_inside_the_ring_replays_what_follows_since_up_to_the_sent_seq() {
		let ring = a_ring_of(&["{}"; 5]);

		let resumed = ring.resumed(&a_resume(ring.epoch(), 2), 4);

		assert_eq!(seqs(&resumed.frames), vec![3, 4]);
		assert_eq!(body_of(&resumed.answer), json!({ "token": "t-1", "replayed": 2 }));
	}

	#[test]
	fn a_resume_from_just_before_the_oldest_frame_replays_the_whole_ring() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let resumed = ring.resumed(&a_resume(ring.epoch(), 3), ring.last_seq());

		assert_eq!(resumed.frames.len(), RING_FRAMES);
	}

	#[test]
	fn a_resume_older_than_the_ring_or_of_another_epoch_is_too_old() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let evicted = ring.resumed(&a_resume(ring.epoch(), 2), ring.last_seq());
		let foreign = ring.resumed(&a_resume("another-epoch", ring.last_seq()), ring.last_seq());

		for resumed in [evicted, foreign] {
			assert!(resumed.frames.is_empty());
			assert_eq!(body_of(&resumed.answer), json!({ "token": "t-1", "tooOld": true }));
		}
	}

	#[test]
	fn a_restart_draws_a_new_epoch_and_empties_the_ring() {
		let mut ring = a_ring_of(&["{}"; 3]);
		let before = ring.epoch().to_owned();

		ring.restarted(9);

		assert_ne!(ring.epoch(), before);
		assert_eq!((ring.last_seq(), ring.missed, ring.frames.len(), ring.bytes), (0, 9, 0, 0));
	}

	#[test]
	fn a_resume_frame_without_its_args_is_refused() {
		let refused = resume_call(r#"{"id": 3, "command": "relay_resume", "args": {"since": 1}}"#)
			.expect("a resume call");

		let refusal: Value =
			serde_json::from_str(&refused.err().expect("a refusal")).expect("json");
		assert_eq!((refusal["id"].clone(), refusal["status"].clone()), (json!(3), json!(400)));
	}
}
