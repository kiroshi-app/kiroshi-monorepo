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
use crate::events::{Frame, BUFFERED_FRAMES};

pub(crate) const RESUME_COMMAND: &str = "relay_resume";

pub(super) const RING_FRAMES: usize = BUFFERED_FRAMES;

pub(super) const RING_BYTES: usize = 4 * 1024 * 1024;

struct Recorded {
	seq: u64,
	published: Frame,
}

pub(super) struct Stamped {
	pub(super) seq: u64,
	pub(super) frame: String,
}

pub(super) struct LastSent {
	epoch: String,
	pub(super) seq: u64,
}

pub(super) struct Relaying<'a> {
	pub(super) ring: &'a watch::Sender<Ring>,
	pub(super) last_sent: LastSent,
}

impl<'a> Relaying<'a> {
	pub(super) fn from_the_start_of(ring: &'a watch::Sender<Ring>) -> Self {
		let epoch = ring.borrow().epoch.clone();
		Self { ring, last_sent: LastSent { epoch, seq: 0 } }
	}
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

	fn recorded(&mut self, published: &Frame) {
		self.last_seq += 1;
		self.bytes += published.len();
		self.frames.push_back(Recorded { seq: self.last_seq, published: published.clone() });
		while self.frames.len() > RING_FRAMES || self.bytes > RING_BYTES {
			let Some(evicted) = self.frames.pop_front() else {
				break;
			};
			self.bytes -= evicted.published.len();
		}
	}

	fn restarted(&mut self, missed: u64) {
		*self = Self { missed, ..Self::started() };
	}

	fn oldest_seq(&self) -> u64 {
		self.frames.front().map_or(self.last_seq + 1, |recorded| recorded.seq)
	}

	pub(super) fn rejoined(&self, last_sent: &mut LastSent) -> Vec<Stamped> {
		if last_sent.epoch != self.epoch {
			*last_sent = LastSent { epoch: self.epoch.clone(), seq: 0 };
		}
		self.unsent(last_sent.seq)
	}

	pub(super) fn followed(&self, last_sent: &LastSent) -> Result<Vec<Stamped>, u64> {
		if last_sent.epoch != self.epoch {
			return Err(self.missed);
		}
		Ok(self.unsent(last_sent.seq))
	}

	fn unsent(&self, sent_seq: u64) -> Vec<Stamped> {
		self.between(sent_seq, self.last_seq)
			.map(|recorded| Stamped {
				seq: recorded.seq,
				frame: bridge::forwarded(&recorded.published, &self.epoch, recorded.seq),
			})
			.collect()
	}

	fn between(&self, since: u64, until: u64) -> impl Iterator<Item = &Recorded> {
		self.frames.iter().filter(move |recorded| recorded.seq > since && recorded.seq <= until)
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
		let frames: Vec<String> = self
			.between(args.since, sent_seq)
			.map(|recorded| {
				bridge::replayed(&recorded.published, &self.epoch, recorded.seq, &args.token)
			})
			.collect();
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
			ring.recorded(&Frame::from(*frame));
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

	fn parsed(frame: &str) -> Value {
		serde_json::from_str(frame).expect("a json frame")
	}

	fn seqs_of(unsent: &[Stamped]) -> Vec<u64> {
		unsent.iter().map(|stamped| stamped.seq).collect()
	}

	fn body_of(answer: &str) -> Value {
		let answer = parsed(answer);
		assert_eq!((answer["id"].clone(), answer["status"].clone()), (json!(7), json!(200)));
		answer["body"].clone()
	}

	fn sent_up_to(ring: &Ring, seq: u64) -> LastSent {
		LastSent { epoch: ring.epoch.clone(), seq }
	}

	#[test]
	fn an_unsent_frame_is_stamped_with_the_epoch_and_its_seq() {
		let ring =
			a_ring_of(&[r#"{"event":"a://b","payload":1}"#, r#"{"event":"a://c","payload":2}"#]);

		let unsent = ring.followed(&sent_up_to(&ring, 0)).expect("the same epoch");

		let frames: Vec<Value> = unsent.iter().map(|stamped| parsed(&stamped.frame)).collect();
		assert_eq!(
			frames,
			vec![
				json!({ "event": { "event": "a://b", "payload": 1 }, "epoch": ring.epoch, "seq": 1 }),
				json!({ "event": { "event": "a://c", "payload": 2 }, "epoch": ring.epoch, "seq": 2 }),
			]
		);
	}

	#[test]
	fn the_ring_evicts_the_oldest_frame_past_its_frame_count() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		assert_eq!(ring.frames.len(), RING_FRAMES);
		assert_eq!(ring.oldest_seq(), 4);
		assert_eq!(ring.last_seq, (RING_FRAMES + 3) as u64);
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
	fn a_rejoined_socket_of_the_same_epoch_gets_every_frame_above_its_last_sent_seq() {
		let ring = a_ring_of(&["{}"; 5]);
		let mut last_sent = sent_up_to(&ring, 2);

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(seqs_of(&unsent), vec![3, 4, 5]);
		assert_eq!(last_sent.seq, 2);
	}

	#[test]
	fn a_rejoined_socket_whose_next_frame_was_evicted_gets_what_the_ring_still_holds() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);
		let mut last_sent = sent_up_to(&ring, 1);

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(unsent.first().map(|stamped| stamped.seq), Some(4));
		assert_eq!(unsent.len(), RING_FRAMES);
	}

	#[test]
	fn a_rejoined_socket_of_a_past_epoch_starts_the_new_epoch_from_its_first_frame() {
		let ring = a_ring_of(&["{}"; 2]);
		let mut last_sent = LastSent { epoch: "a-past-epoch".to_owned(), seq: 40 };

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(seqs_of(&unsent), vec![1, 2]);
		assert_eq!((last_sent.epoch.as_str(), last_sent.seq), (ring.epoch.as_str(), 0));
	}

	#[test]
	fn a_live_socket_of_a_past_epoch_learns_how_many_events_were_missed() {
		let mut ring = a_ring_of(&["{}"; 2]);
		let last_sent = sent_up_to(&ring, 2);

		ring.restarted(9);

		assert_eq!(ring.followed(&last_sent).err(), Some(9));
	}

	#[test]
	fn a_resume_inside_the_ring_replays_up_to_the_sent_seq_stamped_with_its_token() {
		let ring = a_ring_of(&["{}"; 5]);

		let resumed = ring.resumed(&a_resume(&ring.epoch, 2), 4);

		let replayed: Vec<Value> = resumed.frames.iter().map(|frame| parsed(frame)).collect();
		assert_eq!(
			replayed,
			vec![
				json!({ "event": {}, "epoch": ring.epoch, "seq": 3, "token": "t-1" }),
				json!({ "event": {}, "epoch": ring.epoch, "seq": 4, "token": "t-1" }),
			]
		);
		assert_eq!(body_of(&resumed.answer), json!({ "token": "t-1", "replayed": 2 }));
	}

	#[test]
	fn a_resume_from_just_before_the_oldest_frame_replays_the_whole_ring() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let resumed = ring.resumed(&a_resume(&ring.epoch, 3), ring.last_seq);

		assert_eq!(resumed.frames.len(), RING_FRAMES);
	}

	#[test]
	fn a_resume_older_than_the_ring_or_of_another_epoch_is_too_old() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let evicted = ring.resumed(&a_resume(&ring.epoch, 2), ring.last_seq);
		let foreign = ring.resumed(&a_resume("another-epoch", ring.last_seq), ring.last_seq);

		for resumed in [evicted, foreign] {
			assert!(resumed.frames.is_empty());
			assert_eq!(body_of(&resumed.answer), json!({ "token": "t-1", "tooOld": true }));
		}
	}

	#[test]
	fn a_restart_draws_a_new_epoch_and_empties_the_ring() {
		let mut ring = a_ring_of(&["{}"; 3]);
		let before = ring.epoch.clone();

		ring.restarted(9);

		assert_ne!(ring.epoch, before);
		assert_eq!((ring.last_seq, ring.missed, ring.frames.len(), ring.bytes), (0, 9, 0, 0));
	}

	#[test]
	fn a_resume_frame_without_its_args_is_refused() {
		let refused = resume_call(r#"{"id": 3, "command": "relay_resume", "args": {"since": 1}}"#)
			.expect("a resume call");

		let refusal = parsed(&refused.err().expect("a refusal"));
		assert_eq!((refusal["id"].clone(), refusal["status"].clone()), (json!(3), json!(400)));
	}
}
