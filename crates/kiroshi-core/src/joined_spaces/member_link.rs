use std::collections::{BTreeMap, HashMap};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use serde_json::{json, Value};
use tokio::sync::{broadcast, mpsc, oneshot, watch};
use tokio::time::{timeout, Instant};

use crate::events::Frame;
use crate::hosting::replay::RESUME_COMMAND;

const CALL_BOUND: Duration = Duration::from_secs(300);

const HELD_FRAMES: usize = 1024;

pub(super) const LEARN_BOUND: Duration = Duration::from_secs(30);

pub(super) const BUFFERED_EVENTS: usize = 2 * HELD_FRAMES;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Presence {
	Connecting,
	Online,
	Down,
	Ended,
}

pub(super) struct Answer {
	pub(super) status: u16,
	pub(super) body: Value,
}

#[derive(Debug, PartialEq)]
pub(super) enum Resync {
	InStep,
	Resume(String),
	Reread,
}

#[derive(Clone)]
struct Applied {
	epoch: String,
	seq: u64,
}

struct Resuming {
	token: String,
	deadline: Instant,
	held: BTreeMap<u64, String>,
}

enum Sequence {
	Unknown,
	Applied(Applied),
	Resuming(Applied, Resuming),
}

struct Stamped<'a> {
	event: String,
	epoch: &'a str,
	seq: u64,
	replay_token: Option<&'a str>,
}

impl Sequence {
	fn awaits_the_replay_of(&self, token: &str) -> bool {
		matches!(self, Sequence::Resuming(_, resuming) if resuming.token == token)
	}
}

pub(super) struct MemberLink {
	instance_id: String,
	computer: String,
	calls: Mutex<Option<mpsc::Sender<String>>>,
	events: Mutex<Option<broadcast::Sender<Frame>>>,
	pending: Mutex<HashMap<u64, oneshot::Sender<Answer>>>,
	presence: watch::Sender<Presence>,
	next_call: AtomicU64,
	sequence: Mutex<Sequence>,
}

impl MemberLink {
	pub(super) fn new(instance_id: &str, computer: String) -> Self {
		Self {
			instance_id: instance_id.to_owned(),
			computer,
			calls: Mutex::new(None),
			events: Mutex::new(Some(broadcast::channel(BUFFERED_EVENTS).0)),
			pending: Mutex::new(HashMap::new()),
			presence: watch::channel(Presence::Connecting).0,
			next_call: AtomicU64::new(1),
			sequence: Mutex::new(Sequence::Unknown),
		}
	}

	pub(super) fn instance_id(&self) -> &str {
		&self.instance_id
	}

	fn calls(&self) -> MutexGuard<'_, Option<mpsc::Sender<String>>> {
		self.calls.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn events(&self) -> MutexGuard<'_, Option<broadcast::Sender<Frame>>> {
		self.events.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn pending(&self) -> MutexGuard<'_, HashMap<u64, oneshot::Sender<Answer>>> {
		self.pending.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn sequence(&self) -> MutexGuard<'_, Sequence> {
		self.sequence.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub(super) fn presence(&self) -> watch::Receiver<Presence> {
		self.presence.subscribe()
	}

	pub(super) async fn settled(&self) -> Presence {
		let mut presence = self.presence();
		let settled = timeout(LEARN_BOUND, presence.wait_for(|now| *now != Presence::Connecting))
			.await
			.ok()
			.and_then(Result::ok)
			.map(|now| *now);
		settled.unwrap_or(Presence::Connecting)
	}

	pub(super) fn connecting(&self) {
		self.presence.send_replace(Presence::Connecting);
	}

	pub(super) fn opened(&self, calls: mpsc::Sender<String>) -> Resync {
		*self.calls() = Some(calls);
		self.presence.send_replace(Presence::Online);
		let mut sequence = self.sequence();
		match &*sequence {
			Sequence::Applied(applied) => {
				let (resuming, frame) = self.resume_from(applied);
				*sequence = Sequence::Resuming(applied.clone(), resuming);
				Resync::Resume(frame)
			}
			Sequence::Unknown | Sequence::Resuming(..) => Resync::Reread,
		}
	}

	pub(super) fn closed(&self, presence: Presence) {
		self.calls().take();
		self.pending().clear();
		let mut sequence = self.sequence();
		if let Sequence::Resuming(applied, _) = &*sequence {
			*sequence = Sequence::Applied(applied.clone());
		}
		drop(sequence);
		self.presence.send_replace(presence);
	}

	pub(super) fn ended(&self, presence: Presence) {
		self.closed(presence);
		self.events().take();
	}

	pub(super) fn resume_deadline(&self) -> Option<Instant> {
		match &*self.sequence() {
			Sequence::Resuming(_, resuming) => Some(resuming.deadline),
			Sequence::Unknown | Sequence::Applied(_) => None,
		}
	}

	pub(super) fn resume_lapsed(&self) -> Resync {
		let mut sequence = self.sequence();
		if !matches!(*sequence, Sequence::Resuming(..)) {
			return Resync::InStep;
		}
		*sequence = Sequence::Unknown;
		Resync::Reread
	}

	fn resume_from(&self, applied: &Applied) -> (Resuming, String) {
		let id = self.next_call.fetch_add(1, Ordering::Relaxed);
		let token = uuid::Uuid::new_v4().to_string();
		let args = json!({ "epoch": applied.epoch, "since": applied.seq, "token": token });
		let frame = json!({ "id": id, "command": RESUME_COMMAND, "args": args }).to_string();
		let resuming =
			Resuming { token, deadline: Instant::now() + CALL_BOUND, held: BTreeMap::new() };
		(resuming, frame)
	}

	pub(super) fn subscribed(&self) -> Option<broadcast::Receiver<Frame>> {
		self.events().as_ref().map(broadcast::Sender::subscribe)
	}

	pub(super) async fn called(&self, command: &str, args: Value) -> Option<Answer> {
		let calls = self.calls().clone()?;
		let id = self.next_call.fetch_add(1, Ordering::Relaxed);
		let (answer, answered) = oneshot::channel();
		self.pending().insert(id, answer);
		let frame =
			json!({ "id": id, "command": command, "args": args, "computer": self.computer })
				.to_string();
		let answered = match calls.send(frame).await {
			Ok(()) => timeout(CALL_BOUND, answered).await.ok().and_then(Result::ok),
			Err(_) => None,
		};
		self.pending().remove(&id);
		answered
	}

	pub(super) fn received(&self, text: &str) -> Resync {
		let Ok(frame) = serde_json::from_str::<Value>(text) else {
			log::warn!(
				"the member relay of instance {} sent a frame that is not json",
				self.instance_id
			);
			return Resync::InStep;
		};
		if let Some(event) = frame.get("event") {
			let epoch = frame.get("epoch").and_then(Value::as_str);
			let seq = frame.get("seq").and_then(Value::as_u64);
			let (Some(epoch), Some(seq)) = (epoch, seq) else {
				self.heard(event.to_string());
				return Resync::InStep;
			};
			let replay_token = frame.get("token").and_then(Value::as_str);
			return self.sequenced(Stamped { event: event.to_string(), epoch, seq, replay_token });
		}
		if let Some(body) = frame.get("body").filter(|body| is_a_resume_answer(body)) {
			return self.resume_answered(body);
		}
		self.answered(&frame);
		Resync::InStep
	}

	fn sequenced(&self, stamped: Stamped<'_>) -> Resync {
		let mut sequence = self.sequence();
		if stamped.replay_token.is_some_and(|token| !sequence.awaits_the_replay_of(token)) {
			return Resync::InStep;
		}
		match &mut *sequence {
			Sequence::Applied(applied) if applied.epoch == stamped.epoch => {
				if stamped.seq <= applied.seq {
					return Resync::InStep;
				}
				if stamped.seq == applied.seq + 1 {
					applied.seq = stamped.seq;
					self.heard(stamped.event);
					return Resync::InStep;
				}
				let (mut resuming, frame) = self.resume_from(applied);
				resuming.held.insert(stamped.seq, stamped.event);
				*sequence = Sequence::Resuming(applied.clone(), resuming);
				Resync::Resume(frame)
			}
			Sequence::Resuming(applied, resuming) if applied.epoch == stamped.epoch => {
				if stamped.seq > applied.seq {
					resuming.held.insert(stamped.seq, stamped.event);
				}
				if resuming.held.len() <= HELD_FRAMES {
					return Resync::InStep;
				}
				*sequence = Sequence::Unknown;
				Resync::Reread
			}
			Sequence::Unknown => {
				self.adopted(&mut sequence, stamped);
				Resync::InStep
			}
			Sequence::Applied(_) | Sequence::Resuming(..) => {
				self.adopted(&mut sequence, stamped);
				Resync::Reread
			}
		}
	}

	fn adopted(&self, sequence: &mut Sequence, stamped: Stamped<'_>) {
		*sequence =
			Sequence::Applied(Applied { epoch: stamped.epoch.to_owned(), seq: stamped.seq });
		self.heard(stamped.event);
	}

	fn resume_answered(&self, body: &Value) -> Resync {
		let mut sequence = self.sequence();
		let Sequence::Resuming(applied, resuming) = &mut *sequence else {
			return Resync::InStep;
		};
		if body["token"] != resuming.token.as_str() {
			return Resync::InStep;
		}
		if body["tooOld"] == true {
			*sequence = Sequence::Unknown;
			return Resync::Reread;
		}
		let mut caught_up = applied.clone();
		for (seq, event) in std::mem::take(&mut resuming.held) {
			caught_up.seq = seq;
			self.heard(event);
		}
		*sequence = Sequence::Applied(caught_up);
		Resync::InStep
	}

	fn answered(&self, frame: &Value) {
		let (Some(id), Some(status)) = (
			frame.get("id").and_then(Value::as_u64),
			frame
				.get("status")
				.and_then(Value::as_u64)
				.and_then(|status| u16::try_from(status).ok()),
		) else {
			return log::warn!(
				"the member relay of instance {} sent a frame that is neither an event nor an answer",
				self.instance_id
			);
		};
		let Some(caller) = self.pending().remove(&id) else {
			return log::warn!(
				"the member relay of instance {} answered call {id} that no caller awaits",
				self.instance_id
			);
		};
		let body = frame.get("body").cloned().unwrap_or(Value::Null);
		if caller.send(Answer { status, body }).is_err() {
			log::warn!(
				"the member relay of instance {} answered call {id} after its caller left",
				self.instance_id
			);
		}
	}

	fn heard(&self, event: String) {
		let events = self.events();
		let Some(events) = events.as_ref() else {
			return;
		};
		if events.receiver_count() > 0 && events.send(event.into()).is_err() {
			log::warn!("a relayed event of instance {} found no listener left", self.instance_id);
		}
	}
}

fn is_a_resume_answer(body: &Value) -> bool {
	body.get("token").is_some_and(Value::is_string)
		&& (body.get("replayed").is_some() || body.get("tooOld").is_some())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[tokio::test]
	async fn a_call_is_framed_with_an_id_and_its_answer_reaches_the_caller() {
		let link = MemberLink::new("instance-1", "Studio".to_owned());
		let (calls, mut sent) = mpsc::channel(4);
		link.opened(calls);

		let answering = async {
			let frame: Value =
				serde_json::from_str(&sent.recv().await.expect("a frame")).expect("a json frame");
			assert_eq!(frame["command"], "space_list");
			assert_eq!(frame["args"], json!({ "a": 1 }));
			assert_eq!(frame["computer"], "Studio");
			link.received(&json!({ "id": frame["id"], "status": 200, "body": [1] }).to_string());
		};
		let (answer, ()) = tokio::join!(link.called("space_list", json!({ "a": 1 })), answering);

		let answer = answer.expect("an answer");
		assert_eq!((answer.status, answer.body), (200, json!([1])));
	}

	#[tokio::test]
	async fn a_call_while_closed_or_cut_by_a_close_gets_no_answer() {
		let link = MemberLink::new("instance-1", "Studio".to_owned());
		assert!(link.called("space_list", json!({})).await.is_none());

		let (calls, mut sent) = mpsc::channel(4);
		link.opened(calls);
		let cutting = async {
			sent.recv().await.expect("a frame");
			link.closed(Presence::Down);
		};
		let (answer, ()) = tokio::join!(link.called("space_list", json!({})), cutting);

		assert!(answer.is_none());
		assert_eq!(*link.presence().borrow(), Presence::Down);
		assert!(link.subscribed().is_some());
	}

	#[tokio::test]
	async fn a_link_ended_for_good_closes_every_subscriber_and_takes_no_new_one() {
		for presence in [Presence::Ended, Presence::Down] {
			let link = MemberLink::new("instance-1", "Studio".to_owned());
			let (calls, _sent) = mpsc::channel(4);
			link.opened(calls);
			let mut heard = link.subscribed().expect("a subscriber");

			link.ended(presence);

			assert_eq!(heard.recv().await, Err(broadcast::error::RecvError::Closed));
			assert!(link.subscribed().is_none());
			assert_eq!(*link.presence().borrow(), presence);
		}
	}

	#[tokio::test]
	async fn an_event_frame_reaches_every_subscriber_unwrapped() {
		let link = MemberLink::new("instance-1", "Studio".to_owned());
		let (calls, _sent) = mpsc::channel(4);
		link.opened(calls);
		let mut heard = link.subscribed().expect("an open session");

		link.received(r#"{"event":{"event":"a://b","payload":1}}"#);

		let frame = heard.recv().await.expect("the event");
		assert_eq!(
			serde_json::from_str::<Value>(&frame).expect("json"),
			json!({ "event": "a://b", "payload": 1 })
		);
	}

	fn stamped(epoch: &str, seq: u64) -> String {
		json!({ "event": { "event": "a://b", "payload": seq }, "epoch": epoch, "seq": seq })
			.to_string()
	}

	fn replayed(epoch: &str, seq: u64, token: &Value) -> String {
		let event = json!({ "event": "a://b", "payload": seq });
		json!({ "event": event, "epoch": epoch, "seq": seq, "token": token }).to_string()
	}

	fn resume_args(resync: &Resync) -> Value {
		let Resync::Resume(frame) = resync else {
			panic!("a resume, not {resync:?}");
		};
		let frame: Value = serde_json::from_str(frame).expect("a json resume");
		assert_eq!(frame["command"], RESUME_COMMAND);
		frame["args"].clone()
	}

	fn resume_answer(args: &Value, body: Value) -> String {
		let mut body = body;
		body["token"] = args["token"].clone();
		json!({ "id": 99, "status": 200, "body": body }).to_string()
	}

	fn delivered(heard: &mut broadcast::Receiver<Frame>) -> Vec<u64> {
		let mut payloads = Vec::new();
		while let Ok(frame) = heard.try_recv() {
			let frame: Value = serde_json::from_str(&frame).expect("json");
			assert_eq!(frame.get("epoch"), None);
			assert_eq!(frame.get("seq"), None);
			payloads.push(frame["payload"].as_u64().expect("a payload"));
		}
		payloads
	}

	fn an_open_link_applied_to(epoch: &str, seq: u64) -> MemberLink {
		let link = MemberLink::new("instance-1", "Studio".to_owned());
		let (calls, _sent) = mpsc::channel(4);
		assert_eq!(link.opened(calls), Resync::Reread);
		assert_eq!(link.received(&stamped(epoch, seq)), Resync::InStep);
		link
	}

	#[test]
	fn a_reopened_link_resumes_from_its_last_applied_seq_and_delivers_the_replay_once_in_order() {
		let link = an_open_link_applied_to("e-1", 3);
		link.closed(Presence::Down);
		let (calls, _sent) = mpsc::channel(4);

		let resume = link.opened(calls);
		let mut heard = link.subscribed().expect("an open session");
		let args = resume_args(&resume);
		let live = link.received(&stamped("e-1", 6));
		let replayed = [5, 3, 4, 5].map(|seq| link.received(&replayed("e-1", seq, &args["token"])));
		let answered = link.received(&resume_answer(&args, json!({ "replayed": 3 })));

		assert_eq!((args["epoch"].clone(), args["since"].clone()), (json!("e-1"), json!(3)));
		assert!(args["token"].is_string());
		assert_eq!(
			(live, replayed),
			(Resync::InStep, [Resync::InStep, Resync::InStep, Resync::InStep, Resync::InStep])
		);
		assert_eq!(answered, Resync::InStep);
		assert_eq!(delivered(&mut heard), vec![4, 5, 6]);
		assert_eq!(link.resume_deadline(), None);
	}

	#[test]
	fn a_subscriber_taken_before_a_drop_hears_the_resumed_frames_in_order_with_no_reread() {
		let link = an_open_link_applied_to("e-1", 3);
		let mut heard = link.subscribed().expect("a subscriber");
		assert_eq!(link.received(&stamped("e-1", 4)), Resync::InStep);
		link.closed(Presence::Down);
		let (calls, _sent) = mpsc::channel(4);

		let args = resume_args(&link.opened(calls));
		let resynced = [
			link.received(&stamped("e-1", 7)),
			link.received(&replayed("e-1", 6, &args["token"])),
			link.received(&replayed("e-1", 5, &args["token"])),
			link.received(&resume_answer(&args, json!({ "replayed": 2 }))),
			link.received(&stamped("e-1", 8)),
		];

		assert_eq!(args["since"], 4);
		assert_eq!(
			resynced,
			[Resync::InStep, Resync::InStep, Resync::InStep, Resync::InStep, Resync::InStep]
		);
		assert_eq!(delivered(&mut heard), vec![4, 5, 6, 7, 8]);
	}

	#[test]
	fn a_resume_releasing_every_held_frame_at_once_reaches_a_subscriber_without_lagging() {
		let link = an_open_link_applied_to("e-1", 0);
		let mut heard = link.subscribed().expect("a subscriber");
		link.closed(Presence::Down);
		let (calls, _sent) = mpsc::channel(4);
		let args = resume_args(&link.opened(calls));
		let last = u64::try_from(HELD_FRAMES).expect("a seq");

		assert!((1..=last).all(|seq| link.received(&stamped("e-1", seq)) == Resync::InStep));
		let answered = link.received(&resume_answer(&args, json!({ "replayed": 0 })));

		assert_eq!(answered, Resync::InStep);
		assert_eq!(delivered(&mut heard), (1..=last).collect::<Vec<_>>());
		assert_eq!(heard.try_recv(), Err(broadcast::error::TryRecvError::Empty));
	}

	#[test]
	fn an_epoch_change_while_resuming_rereads_once_for_the_gap() {
		let link = an_open_link_applied_to("e-1", 3);
		let mut heard = link.subscribed().expect("a subscriber");
		link.closed(Presence::Down);
		let (calls, _sent) = mpsc::channel(4);
		let args = resume_args(&link.opened(calls));

		let switched = link.received(&stamped("e-2", 1));
		let late_answer = link.received(&resume_answer(&args, json!({ "replayed": 0 })));
		let next = link.received(&stamped("e-2", 2));

		assert_eq!((switched, late_answer, next), (Resync::Reread, Resync::InStep, Resync::InStep));
		assert_eq!(delivered(&mut heard), vec![1, 2]);
	}

	#[test]
	fn a_too_old_answer_rereads_and_adopts_the_next_frame() {
		let link = an_open_link_applied_to("e-1", 3);
		link.closed(Presence::Down);
		let (calls, _sent) = mpsc::channel(4);
		let args = resume_args(&link.opened(calls));
		let mut heard = link.subscribed().expect("an open session");

		let answered = link.received(&resume_answer(&args, json!({ "tooOld": true })));
		let next = [40, 41, 41].map(|seq| link.received(&stamped("e-1", seq)));

		assert_eq!(answered, Resync::Reread);
		assert_eq!(next, [Resync::InStep, Resync::InStep, Resync::InStep]);
		assert_eq!(delivered(&mut heard), vec![40, 41]);
	}

	#[test]
	fn a_gap_on_a_live_link_holds_frames_resumes_and_drops_a_duplicate() {
		let link = an_open_link_applied_to("e-1", 1);
		let mut heard = link.subscribed().expect("an open session");

		let gap = link.received(&stamped("e-1", 3));
		let args = resume_args(&gap);
		let held = [4, 2].map(|seq| link.received(&stamped("e-1", seq)));
		let delivered_before_the_answer = delivered(&mut heard);
		link.received(&resume_answer(&args, json!({ "replayed": 1 })));
		let after = [4, 5].map(|seq| link.received(&stamped("e-1", seq)));

		assert_eq!(args["since"], 1);
		assert_eq!(held, [Resync::InStep, Resync::InStep]);
		assert!(delivered_before_the_answer.is_empty());
		assert_eq!(after, [Resync::InStep, Resync::InStep]);
		assert_eq!(delivered(&mut heard), vec![2, 3, 4, 5]);
	}

	#[test]
	fn a_resume_answer_bearing_another_token_is_ignored() {
		let link = an_open_link_applied_to("e-1", 1);
		let mut heard = link.subscribed().expect("an open session");
		let args = resume_args(&link.received(&stamped("e-1", 3)));

		let foreign = link
			.received(&resume_answer(&json!({ "token": "not-mine" }), json!({ "tooOld": true })));
		link.received(&stamped("e-1", 2));
		let delivered_on_the_foreign_answer = delivered(&mut heard);
		link.received(&resume_answer(&args, json!({ "replayed": 1 })));

		assert_eq!(foreign, Resync::InStep);
		assert!(delivered_on_the_foreign_answer.is_empty());
		assert_eq!(delivered(&mut heard), vec![2, 3]);
	}

	#[test]
	fn a_frame_of_another_epoch_is_adopted_delivered_and_rereads() {
		let link = an_open_link_applied_to("e-1", 7);
		let mut heard = link.subscribed().expect("an open session");

		let switched = link.received(&stamped("e-2", 1));
		let next = link.received(&stamped("e-2", 2));

		assert_eq!((switched, next), (Resync::Reread, Resync::InStep));
		assert_eq!(delivered(&mut heard), vec![1, 2]);
	}

	#[test]
	fn a_lapsed_resume_rereads_and_adopts_the_next_frame() {
		let link = an_open_link_applied_to("e-1", 1);
		let mut heard = link.subscribed().expect("an open session");
		resume_args(&link.received(&stamped("e-1", 3)));
		assert!(link.resume_deadline().is_some());

		let lapsed = link.resume_lapsed();
		let next = link.received(&stamped("e-1", 9));

		assert_eq!((lapsed, next), (Resync::Reread, Resync::InStep));
		assert_eq!(link.resume_deadline(), None);
		assert_eq!(delivered(&mut heard), vec![9]);
	}

	#[test]
	fn a_link_that_awaits_no_replay_drops_one_meant_for_another_member_and_adopts_the_live_frame() {
		let link = MemberLink::new("instance-1", "Studio".to_owned());
		let (calls, _sent) = mpsc::channel(4);
		assert_eq!(link.opened(calls), Resync::Reread);
		let mut heard = link.subscribed().expect("an open session");

		let foreign = link.received(&replayed("e-1", 2, &json!("not-mine")));
		let live = [5, 6].map(|seq| link.received(&stamped("e-1", seq)));

		assert_eq!((foreign, live), (Resync::InStep, [Resync::InStep, Resync::InStep]));
		assert_eq!(delivered(&mut heard), vec![5, 6]);
	}

	#[test]
	fn a_resuming_link_holds_only_the_frames_replayed_for_its_own_token() {
		let link = an_open_link_applied_to("e-1", 1);
		let mut heard = link.subscribed().expect("an open session");
		let args = resume_args(&link.received(&stamped("e-1", 4)));

		let foreign = link.received(&replayed("e-1", 2, &json!("not-mine")));
		let own = link.received(&replayed("e-1", 3, &args["token"]));
		link.received(&resume_answer(&args, json!({ "replayed": 1 })));

		assert_eq!((foreign, own), (Resync::InStep, Resync::InStep));
		assert_eq!(delivered(&mut heard), vec![3, 4]);
	}
}
