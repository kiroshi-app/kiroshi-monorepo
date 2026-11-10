use std::collections::{BTreeMap, VecDeque};

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) enum Addressee {
	Everyone,
	Account(String),
	EveryoneBut(Vec<String>),
}

impl Addressee {
	pub(super) fn reaches(&self, account_id: &str) -> bool {
		match self {
			Addressee::Everyone => true,
			Addressee::Account(addressed) => addressed == account_id,
			Addressee::EveryoneBut(left_out) => !left_out.iter().any(|left| left == account_id),
		}
	}

	fn named(&self) -> &[String] {
		match self {
			Addressee::Everyone => &[],
			Addressee::Account(addressed) => std::slice::from_ref(addressed),
			Addressee::EveryoneBut(left_out) => left_out,
		}
	}
}

#[derive(Clone, Default)]
struct Sequences {
	others: u64,
	named: BTreeMap<String, u64>,
}

impl Sequences {
	fn counted(&mut self, addressee: &Addressee) {
		for account_id in addressee.named() {
			self.named.entry(account_id.clone()).or_insert(self.others);
		}
		if !matches!(addressee, Addressee::Account(_)) {
			self.others += 1;
		}
		for (account_id, last) in &mut self.named {
			if addressee.reaches(account_id) {
				*last += 1;
			}
		}
	}

	fn last_of(&self, account_id: &str) -> u64 {
		self.named.get(account_id).copied().unwrap_or(self.others)
	}
}

struct Recorded {
	position: u64,
	sequences: Sequences,
	published: Frame,
	addressee: Addressee,
}

impl Recorded {
	fn seq_of(&self, account_id: &str) -> Option<u64> {
		self.addressee.reaches(account_id).then(|| self.sequences.last_of(account_id))
	}
}

pub(super) struct Stamped {
	pub(super) position: u64,
	pub(super) addressee: Addressee,
	epoch: String,
	published: Frame,
	sequences: Sequences,
}

impl Stamped {
	pub(super) fn to_everyone(&self) -> String {
		let Sequences { others, named } = &self.sequences;
		bridge::forwarded_to_everyone(&self.published, &self.epoch, *others, named)
	}

	pub(super) fn to_account(&self, account_id: &str) -> String {
		bridge::forwarded(&self.published, &self.epoch, self.sequences.last_of(account_id))
	}
}

pub(super) struct LastSent {
	epoch: String,
	pub(super) position: u64,
}

pub(super) struct Relaying<'a> {
	pub(super) ring: &'a watch::Sender<Ring>,
	pub(super) last_sent: LastSent,
}

impl<'a> Relaying<'a> {
	pub(super) fn from_the_start_of(ring: &'a watch::Sender<Ring>) -> Self {
		let epoch = ring.borrow().epoch.clone();
		Self { ring, last_sent: LastSent { epoch, position: 0 } }
	}
}

pub(super) struct Ring {
	epoch: String,
	last_position: u64,
	sequences: Sequences,
	missed: u64,
	frames: VecDeque<Recorded>,
	bytes: usize,
}

impl Ring {
	pub(super) fn started() -> Self {
		Self {
			epoch: uuid::Uuid::new_v4().to_string(),
			last_position: 0,
			sequences: Sequences::default(),
			missed: 0,
			frames: VecDeque::new(),
			bytes: 0,
		}
	}

	fn recorded(&mut self, published: &Frame, addressee: Addressee) {
		self.last_position += 1;
		self.sequences.counted(&addressee);
		self.bytes += published.len();
		self.frames.push_back(Recorded {
			position: self.last_position,
			sequences: self.sequences.clone(),
			published: published.clone(),
			addressee,
		});
		while self.frames.len() > RING_FRAMES || self.bytes > RING_BYTES {
			let Some(evicted) = self.frames.pop_front() else {
				break;
			};
			self.bytes -= evicted.published.len();
		}
	}

	fn all_recorded(&mut self, addressed: Vec<(Frame, Addressee)>) {
		for (frame, addressee) in addressed {
			self.recorded(&frame, addressee);
		}
	}

	fn restarted(&mut self, missed: u64) {
		*self = Self { missed, ..Self::started() };
	}

	fn oldest_seq_of(&self, account_id: &str) -> u64 {
		self.frames
			.iter()
			.find_map(|recorded| recorded.seq_of(account_id))
			.unwrap_or_else(|| self.sequences.last_of(account_id) + 1)
	}

	pub(super) fn rejoined(&self, last_sent: &mut LastSent) -> Vec<Stamped> {
		if last_sent.epoch != self.epoch {
			*last_sent = LastSent { epoch: self.epoch.clone(), position: 0 };
		}
		self.unsent(last_sent.position)
	}

	pub(super) fn followed(&self, last_sent: &LastSent) -> Result<Vec<Stamped>, u64> {
		if last_sent.epoch != self.epoch {
			return Err(self.missed);
		}
		Ok(self.unsent(last_sent.position))
	}

	fn unsent(&self, sent_position: u64) -> Vec<Stamped> {
		self.frames
			.iter()
			.filter(|recorded| recorded.position > sent_position)
			.map(|recorded| Stamped {
				position: recorded.position,
				addressee: recorded.addressee.clone(),
				epoch: self.epoch.clone(),
				published: recorded.published.clone(),
				sequences: recorded.sequences.clone(),
			})
			.collect()
	}

	pub(super) fn resumed(
		&self,
		call: &ResumeCall,
		sent_position: u64,
		account_id: &str,
	) -> Resumed {
		let args = &call.args;
		if args.epoch != self.epoch || args.since < self.oldest_seq_of(account_id) - 1 {
			let body = json!({ "token": args.token, "tooOld": true });
			return Resumed {
				frames: Vec::new(),
				answer: bridge::answer(call.id.clone(), StatusCode::OK, body),
			};
		}
		let frames: Vec<String> = self
			.frames
			.iter()
			.take_while(|recorded| recorded.position <= sent_position)
			.filter_map(|recorded| {
				let seq = recorded.seq_of(account_id).filter(|seq| *seq > args.since)?;
				Some(bridge::replayed(&recorded.published, &self.epoch, seq, &args.token))
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
			let addressed = guest_events.reach_the_guest(app, &frame).await;
			ring.send_modify(|ring| ring.all_recorded(addressed));
		}
		let missed = loop {
			match heard.recv().await {
				Ok(frame) => {
					let addressed = guest_events.reach_the_guest(app, &frame).await;
					ring.send_modify(|ring| ring.all_recorded(addressed));
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
			ring.recorded(&Frame::from(*frame), Addressee::Everyone);
		}
		ring
	}

	fn a_ring_addressed(addressees: &[Addressee]) -> Ring {
		let mut ring = Ring::started();
		for addressee in addressees {
			ring.recorded(&Frame::from("{}"), addressee.clone());
		}
		ring
	}

	fn to(account_id: &str) -> Addressee {
		Addressee::Account(account_id.to_owned())
	}

	fn all_but(account_id: &str) -> Addressee {
		Addressee::EveryoneBut(vec![account_id.to_owned()])
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

	fn positions_of(unsent: &[Stamped]) -> Vec<u64> {
		unsent.iter().map(|stamped| stamped.position).collect()
	}

	fn seqs_received_by(ring: &Ring, account_id: &str) -> Vec<u64> {
		ring.followed(&sent_up_to(ring, 0))
			.expect("the same epoch")
			.iter()
			.filter(|stamped| stamped.addressee.reaches(account_id))
			.map(|stamped| {
				let frame = match stamped.addressee {
					Addressee::Everyone => parsed(&stamped.to_everyone()),
					_ => parsed(&stamped.to_account(account_id)),
				};
				frame["seqs"][account_id]
					.as_u64()
					.or(frame["rest"].as_u64())
					.or(frame["seq"].as_u64())
					.expect("a seq")
			})
			.collect()
	}

	fn seqs_replayed_to(ring: &Ring, account_id: &str, since: u64) -> Vec<u64> {
		let resumed = ring.resumed(&a_resume(&ring.epoch, since), ring.last_position, account_id);
		resumed.frames.iter().map(|frame| parsed(frame)["seq"].as_u64().expect("a seq")).collect()
	}

	fn body_of(answer: &str) -> Value {
		let answer = parsed(answer);
		assert_eq!((answer["id"].clone(), answer["status"].clone()), (json!(7), json!(200)));
		answer["body"].clone()
	}

	fn sent_up_to(ring: &Ring, position: u64) -> LastSent {
		LastSent { epoch: ring.epoch.clone(), position }
	}

	#[test]
	fn an_unsent_frame_is_stamped_with_the_epoch_and_its_seq() {
		let ring =
			a_ring_of(&[r#"{"event":"a://b","payload":1}"#, r#"{"event":"a://c","payload":2}"#]);

		let unsent = ring.followed(&sent_up_to(&ring, 0)).expect("the same epoch");

		let frames: Vec<Value> =
			unsent.iter().map(|stamped| parsed(&stamped.to_everyone())).collect();
		assert_eq!(
			frames,
			vec![
				json!({ "event": { "event": "a://b", "payload": 1 }, "epoch": ring.epoch, "seq": 1 }),
				json!({ "event": { "event": "a://c", "payload": 2 }, "epoch": ring.epoch, "seq": 2 }),
			]
		);
	}

	#[test]
	fn a_frame_to_everyone_carries_the_seq_of_each_named_account_and_of_the_rest_without_seq() {
		let ring = a_ring_addressed(&[Addressee::Everyone, to("owner"), Addressee::Everyone]);

		let unsent = ring.followed(&sent_up_to(&ring, 2)).expect("the same epoch");

		let frames: Vec<Value> =
			unsent.iter().map(|stamped| parsed(&stamped.to_everyone())).collect();
		assert_eq!(
			frames,
			vec![json!({ "event": {}, "epoch": ring.epoch, "rest": 2, "seqs": { "owner": 3 } })]
		);
	}

	#[test]
	fn a_frame_to_one_account_leaves_the_seq_of_every_other_account_unchanged() {
		let mut ring = a_ring_addressed(&[Addressee::Everyone, Addressee::Everyone]);
		let before = ring.sequences.last_of("someone-else");

		ring.recorded(&Frame::from("{}"), to("owner"));

		assert_eq!(ring.sequences.last_of("someone-else"), before);
		assert_eq!(ring.sequences.last_of("owner"), before + 1);
	}

	#[test]
	fn each_account_receives_seqs_rising_by_one_whatever_the_mix_of_addressees() {
		let ring = a_ring_addressed(&[
			to("ann"),
			Addressee::Everyone,
			all_but("ann"),
			to("bob"),
			Addressee::Everyone,
			to("ann"),
			Addressee::EveryoneBut(vec!["ann".to_owned(), "bob".to_owned()]),
			to("cid"),
			Addressee::Everyone,
		]);

		let accounts = ["ann", "bob", "cid", "dee"];
		let received: Vec<(&str, Vec<u64>)> =
			accounts.iter().map(|&account| (account, seqs_received_by(&ring, account))).collect();
		let expected: Vec<(&str, Vec<u64>)> = vec![
			("ann", (1..=5).collect()),
			("bob", (1..=5).collect()),
			("cid", (1..=6).collect()),
			("dee", (1..=5).collect()),
		];
		assert_eq!(received, expected);
	}

	#[test]
	fn a_tailored_list_gives_each_account_exactly_one_seq() {
		let mut ring = a_ring_addressed(&[Addressee::Everyone]);
		ring.all_recorded(vec![
			(Frame::from(r#"{"for":"ann"}"#), to("ann")),
			(Frame::from(r#"{"for":"bob"}"#), to("bob")),
			(
				Frame::from(r#"{"for":"the rest"}"#),
				Addressee::EveryoneBut(vec!["ann".to_owned(), "bob".to_owned()]),
			),
		]);

		let accounts = ["ann", "bob", "someone-else"];
		let received: Vec<(&str, Vec<u64>)> =
			accounts.iter().map(|&account| (account, seqs_received_by(&ring, account))).collect();
		let expected: Vec<(&str, Vec<u64>)> =
			accounts.iter().map(|&account| (account, vec![1, 2])).collect();
		assert_eq!(received, expected);
	}

	#[test]
	fn the_ring_evicts_the_oldest_frame_past_its_frame_count() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		assert_eq!(ring.frames.len(), RING_FRAMES);
		assert_eq!(ring.oldest_seq_of("anyone"), 4);
		assert_eq!(ring.sequences.last_of("anyone"), (RING_FRAMES + 3) as u64);
	}

	#[test]
	fn the_ring_evicts_the_oldest_frames_past_its_byte_size() {
		let large = format!("\"{}\"", "x".repeat(RING_BYTES / 3));

		let ring = a_ring_of(&[&large, &large, &large, &large]);

		assert_eq!(ring.frames.len(), 2);
		assert_eq!(ring.oldest_seq_of("anyone"), 3);
		assert!(ring.bytes <= RING_BYTES);
	}

	#[test]
	fn a_rejoined_socket_of_the_same_epoch_gets_every_frame_above_its_last_sent_position() {
		let ring = a_ring_of(&["{}"; 5]);
		let mut last_sent = sent_up_to(&ring, 2);

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(positions_of(&unsent), vec![3, 4, 5]);
		assert_eq!(last_sent.position, 2);
	}

	#[test]
	fn a_rejoined_socket_gets_every_unsent_frame_of_each_account_in_recorded_order() {
		let ring = a_ring_addressed(&[
			Addressee::Everyone,
			to("ann"),
			all_but("ann"),
			to("bob"),
			Addressee::Everyone,
		]);
		let mut last_sent = sent_up_to(&ring, 1);

		let unsent = ring.rejoined(&mut last_sent);

		let addressees: Vec<Addressee> =
			unsent.iter().map(|stamped| stamped.addressee.clone()).collect();
		assert_eq!(addressees, vec![to("ann"), all_but("ann"), to("bob"), Addressee::Everyone]);
		assert_eq!(seqs_received_by(&ring, "ann"), vec![1, 2, 3]);
		assert_eq!(seqs_received_by(&ring, "bob"), vec![1, 2, 3, 4]);
	}

	#[test]
	fn a_rejoined_socket_whose_next_frame_was_evicted_gets_what_the_ring_still_holds() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);
		let mut last_sent = sent_up_to(&ring, 1);

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(unsent.first().map(|stamped| stamped.position), Some(4));
		assert_eq!(unsent.len(), RING_FRAMES);
	}

	#[test]
	fn a_rejoined_socket_of_a_past_epoch_starts_the_new_epoch_from_its_first_frame() {
		let ring = a_ring_of(&["{}"; 2]);
		let mut last_sent = LastSent { epoch: "a-past-epoch".to_owned(), position: 40 };

		let unsent = ring.rejoined(&mut last_sent);

		assert_eq!(positions_of(&unsent), vec![1, 2]);
		assert_eq!((last_sent.epoch.as_str(), last_sent.position), (ring.epoch.as_str(), 0));
	}

	#[test]
	fn a_live_socket_of_a_past_epoch_learns_how_many_events_were_missed() {
		let mut ring = a_ring_of(&["{}"; 2]);
		let last_sent = sent_up_to(&ring, 2);

		ring.restarted(9);

		assert_eq!(ring.followed(&last_sent).err(), Some(9));
	}

	#[test]
	fn a_resume_inside_the_ring_replays_up_to_the_sent_position_stamped_with_its_token() {
		let ring = a_ring_of(&["{}"; 5]);

		let resumed = ring.resumed(&a_resume(&ring.epoch, 2), 4, "anyone");

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
	fn a_resume_replays_a_frame_addressed_to_one_account_only_to_that_account() {
		let ring = a_ring_addressed(&[Addressee::Everyone, to("owner"), Addressee::Everyone]);

		assert_eq!(seqs_replayed_to(&ring, "owner", 0), [1, 2, 3]);
		assert_eq!(seqs_replayed_to(&ring, "someone-else", 0), [1, 2]);
	}

	#[test]
	fn a_resume_replays_the_frames_of_its_account_from_since_on_its_own_seq() {
		let ring = a_ring_addressed(&[
			to("ann"),
			Addressee::Everyone,
			to("ann"),
			all_but("ann"),
			to("ann"),
			Addressee::Everyone,
		]);

		assert_eq!(seqs_replayed_to(&ring, "bob", 1), [2, 3]);
		assert_eq!(seqs_replayed_to(&ring, "ann", 2), [3, 4, 5]);
	}

	#[test]
	fn a_resume_replays_to_each_account_only_the_frame_tailored_for_it() {
		let mut ring = Ring::started();
		let tailored = [
			(Frame::from(r#"{"for":"owner"}"#), to("owner")),
			(Frame::from(r#"{"for":"the rest"}"#), all_but("owner")),
		];
		ring.all_recorded(tailored.to_vec());

		let replayed_to = |account_id| {
			let resumed = ring.resumed(&a_resume(&ring.epoch, 0), ring.last_position, account_id);
			resumed.frames.iter().map(|frame| parsed(frame)["event"].clone()).collect::<Vec<_>>()
		};

		assert_eq!(replayed_to("owner"), [json!({ "for": "owner" })]);
		assert_eq!(replayed_to("someone-else"), [json!({ "for": "the rest" })]);
	}

	#[test]
	fn a_resume_from_just_before_the_oldest_frame_replays_the_whole_ring() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let resumed = ring.resumed(&a_resume(&ring.epoch, 3), ring.last_position, "anyone");

		assert_eq!(resumed.frames.len(), RING_FRAMES);
	}

	#[test]
	fn a_resume_older_than_the_ring_or_of_another_epoch_is_too_old() {
		let ring = a_ring_of(&vec!["{}"; RING_FRAMES + 3]);

		let evicted = ring.resumed(&a_resume(&ring.epoch, 2), ring.last_position, "anyone");
		let foreign = ring.resumed(&a_resume("another-epoch", 0), ring.last_position, "anyone");

		for resumed in [evicted, foreign] {
			assert!(resumed.frames.is_empty());
			assert_eq!(body_of(&resumed.answer), json!({ "token": "t-1", "tooOld": true }));
		}
	}

	#[test]
	fn a_resume_is_too_old_once_the_oldest_held_frame_of_its_account_is_above_since_plus_one() {
		let mut addressees = vec![Addressee::Everyone, to("ann")];
		addressees.extend(vec![to("bob"); RING_FRAMES - 1]);
		let ring = a_ring_addressed(&addressees);

		let ann = ring.resumed(&a_resume(&ring.epoch, 1), ring.last_position, "ann");
		let bob = ring.resumed(&a_resume(&ring.epoch, 1), ring.last_position, "bob");

		assert_eq!(body_of(&ann.answer), json!({ "token": "t-1", "replayed": 1 }));
		assert_eq!(body_of(&bob.answer), json!({ "token": "t-1", "replayed": RING_FRAMES - 1 }));
		let evicted = ring.resumed(&a_resume(&ring.epoch, 0), ring.last_position, "bob");
		assert_eq!(body_of(&evicted.answer), json!({ "token": "t-1", "tooOld": true }));
	}

	#[test]
	fn a_restart_draws_a_new_epoch_and_empties_the_ring() {
		let mut ring = a_ring_addressed(&[Addressee::Everyone, to("owner")]);
		let before = ring.epoch.clone();

		ring.restarted(9);

		assert_ne!(ring.epoch, before);
		assert_eq!((ring.last_position, ring.missed, ring.frames.len(), ring.bytes), (0, 9, 0, 0));
		assert_eq!(ring.sequences.last_of("owner"), 0);
	}

	#[test]
	fn a_resume_frame_without_its_args_is_refused() {
		let refused = resume_call(r#"{"id": 3, "command": "relay_resume", "args": {"since": 1}}"#)
			.expect("a resume call");

		let refusal = parsed(&refused.err().expect("a refusal"));
		assert_eq!((refusal["id"].clone(), refusal["status"].clone()), (json!(3), json!(400)));
	}
}
