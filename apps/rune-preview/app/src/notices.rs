use std::collections::HashMap;
use std::time::Duration;

use kiroshi_rune_os::policy::{
	self, AgentChange, AgentState, Context, Language, Notice, NoticeKind, NoticeTarget, Switches,
	Turn,
};
use kiroshi_rune_os::{Gesture, GestureFailure, Notifier};

use crate::model::RuntimeScope;

const PREVIEW_LENGTH: usize = 140;

const FOCUS_WATCH: Duration = Duration::from_millis(500);

pub trait Desktop {
	fn holds_focus(&self) -> bool;
	fn show(&self, notice: Notice) -> Result<(), GestureFailure>;
	fn set_badge(&self, count: u32) -> Result<(), GestureFailure>;
	fn bring_to_front(&self) -> Result<(), GestureFailure>;
}

impl Desktop for Notifier {
	fn holds_focus(&self) -> bool {
		kiroshi_rune_os::holds_focus()
	}

	fn show(&self, notice: Notice) -> Result<(), GestureFailure> {
		Notifier::show(self, notice)
	}

	fn set_badge(&self, count: u32) -> Result<(), GestureFailure> {
		Notifier::set_badge(self, count)
	}

	fn bring_to_front(&self) -> Result<(), GestureFailure> {
		kiroshi_rune_os::bring_to_front()
	}
}

#[derive(Default)]
pub struct Notices {
	desktop: Option<Box<dyn Desktop>>,
	badge: u32,
	replies: HashMap<(String, String), String>,
}

impl Notices {
	pub fn attach(&mut self, desktop: Box<dyn Desktop>) {
		self.desktop = Some(desktop);
	}

	pub fn replied(&mut self, scope: &RuntimeScope, reply: String) {
		self.replies.insert(key_of(scope), reply);
	}

	pub fn turn_ended(&mut self, scope: &RuntimeScope, outcome: &str, name: &str) {
		let reply = self.replies.remove(&key_of(scope));
		let Some(desktop) = self.desktop.as_deref() else { return };
		let Some((before, after)) = turns_of(outcome) else {
			eprintln!(
				"a turn of conversation {} ended as {outcome:?}, which no notice reads",
				scope.conversation_id
			);
			return;
		};
		let context = Context {
			switches: Switches::ALL_ON,
			has_focus: desktop.holds_focus(),
			language: Language::En,
		};
		let before = AgentState { turn: before, ..AgentState::IDLE };
		let after = AgentState { turn: after, ..AgentState::IDLE };
		let target =
			NoticeTarget { kind: NoticeKind::Conversation, id: scope.conversation_id.clone() };
		let change = AgentChange { name, target, before: &before, after: &after };
		let preview = reply.as_deref().and_then(preview_of);
		for notice in policy::agent_notices(change, context) {
			let body = preview.clone().unwrap_or(notice.body);
			self.post(Notice { body, ..notice });
		}
	}

	pub fn focus_wake(&mut self) -> Option<Duration> {
		if self.badge == 0 {
			return None;
		}
		let desktop = self.desktop.as_deref()?;
		if !desktop.holds_focus() {
			return Some(FOCUS_WATCH);
		}
		self.badge = 0;
		if let Err(failure) = desktop.set_badge(0) {
			eprintln!("the badge was not cleared on focus: {failure}");
		}
		None
	}

	pub fn banner_refused(&mut self, target: &NoticeTarget, failure: &GestureFailure) {
		eprintln!("{}", refusal_of(failure, &target.id));
		if self.badge == 0 {
			return;
		}
		self.wear(self.badge - 1, &target.id);
	}

	pub fn bring_to_front(&self) {
		let Some(desktop) = self.desktop.as_deref() else { return };
		if let Err(failure) = desktop.bring_to_front() {
			eprintln!("a clicked notice did not bring the window back: {failure}");
		}
	}

	fn post(&mut self, notice: Notice) {
		let Some(desktop) = self.desktop.as_deref() else { return };
		let conversation_id = notice.target.id.clone();
		if let Err(failure) = desktop.show(notice) {
			eprintln!("{}", refusal_of(&failure, &conversation_id));
			if failure.gesture == Gesture::Banner {
				return;
			}
		}
		self.wear(self.badge.saturating_add(1), &conversation_id);
	}

	fn wear(&mut self, count: u32, conversation_id: &str) {
		self.badge = count;
		let Some(desktop) = self.desktop.as_deref() else { return };
		if let Err(failure) = desktop.set_badge(count) {
			eprintln!("{}", refusal_of(&failure, conversation_id));
		}
	}
}

fn refusal_of(failure: &GestureFailure, conversation_id: &str) -> String {
	format!(
		"the {} of conversation {conversation_id} was refused, the OS answered: {}",
		failure.gesture, failure.answer
	)
}

fn key_of(scope: &RuntimeScope) -> (String, String) {
	(scope.conversation_id.clone(), scope.bot_id.clone())
}

fn turns_of(outcome: &str) -> Option<(Turn, Turn)> {
	match outcome {
		"completed" => Some((Turn::Running, Turn::Idle)),
		"cancelled" => Some((Turn::Stopping, Turn::Idle)),
		"failed" => Some((Turn::Running, Turn::Failed)),
		_ => None,
	}
}

fn preview_of(reply: &str) -> Option<String> {
	let line = reply.split_whitespace().collect::<Vec<_>>().join(" ");
	if line.is_empty() {
		return None;
	}
	if line.chars().count() <= PREVIEW_LENGTH {
		return Some(line);
	}
	let cut: String = line.chars().take(PREVIEW_LENGTH - 1).collect();
	Some(format!("{}…", cut.trim_end()))
}

#[cfg(test)]
pub mod fake {
	use std::cell::RefCell;
	use std::rc::Rc;

	use super::*;

	#[derive(Default)]
	pub struct Record {
		pub is_focused: bool,
		pub refusing: Option<Gesture>,
		pub shown: Vec<Notice>,
		pub badges: Vec<u32>,
		pub raised: usize,
	}

	pub struct FakeDesktop(pub Rc<RefCell<Record>>);

	impl FakeDesktop {
		fn refuses(&self, gesture: Gesture) -> Result<(), GestureFailure> {
			if self.0.borrow().refusing != Some(gesture) {
				return Ok(());
			}
			Err(GestureFailure { gesture, answer: format!("the fake refused the {gesture}") })
		}
	}

	impl Desktop for FakeDesktop {
		fn holds_focus(&self) -> bool {
			self.0.borrow().is_focused
		}

		fn show(&self, notice: Notice) -> Result<(), GestureFailure> {
			self.refuses(Gesture::Banner)?;
			self.0.borrow_mut().shown.push(notice);
			self.refuses(Gesture::Chime)
		}

		fn set_badge(&self, count: u32) -> Result<(), GestureFailure> {
			self.refuses(Gesture::Badge)?;
			self.0.borrow_mut().badges.push(count);
			Ok(())
		}

		fn bring_to_front(&self) -> Result<(), GestureFailure> {
			self.0.borrow_mut().raised += 1;
			Ok(())
		}
	}
}

#[cfg(test)]
mod tests {
	use std::cell::RefCell;
	use std::rc::Rc;

	use super::*;

	#[test]
	fn a_short_reply_is_previewed_on_one_line() {
		assert_eq!(
			preview_of("Done.\n\nThe tests pass."),
			Some("Done. The tests pass.".to_owned())
		);
	}

	#[test]
	fn a_long_reply_is_cut_to_the_preview_length() {
		let preview = preview_of(&"word ".repeat(100)).expect("a preview");

		assert!(preview.chars().count() <= PREVIEW_LENGTH);
		assert!(preview.ends_with("word…"), "{preview}");
	}

	#[test]
	fn a_blank_reply_gives_no_preview() {
		assert_eq!(preview_of(" \n "), None);
	}

	fn scope() -> RuntimeScope {
		RuntimeScope { conversation_id: "c-1".into(), bot_id: "wren".into() }
	}

	#[test]
	fn a_refusal_names_the_gesture_the_conversation_and_the_os_answer() {
		let failure = GestureFailure { gesture: Gesture::Chime, answer: "muted".into() };

		let line = refusal_of(&failure, "c-1");

		assert_eq!(line, "the chime of conversation c-1 was refused, the OS answered: muted");
	}

	#[test]
	fn a_reply_preview_is_dropped_on_every_turn_outcome() {
		let record = Rc::new(RefCell::new(fake::Record::default()));
		for outcome in ["completed", "cancelled", "failed", "exploded"] {
			let mut notices = Notices::default();
			notices.attach(Box::new(fake::FakeDesktop(Rc::clone(&record))));
			notices.replied(&scope(), "Done.".into());

			notices.turn_ended(&scope(), outcome, "Wren");

			assert!(notices.replies.is_empty(), "{outcome}");
		}
	}

	#[test]
	fn a_reply_preview_is_dropped_while_the_app_holds_focus() {
		let record = Rc::new(RefCell::new(fake::Record { is_focused: true, ..Default::default() }));
		let mut notices = Notices::default();
		notices.attach(Box::new(fake::FakeDesktop(Rc::clone(&record))));
		notices.replied(&scope(), "Done.".into());

		notices.turn_ended(&scope(), "completed", "Wren");

		assert!(notices.replies.is_empty());
		assert!(record.borrow().shown.is_empty());
	}

	#[test]
	fn a_reply_preview_is_kept_per_conversation_and_agent() {
		let mut notices = Notices::default();
		let other = RuntimeScope { conversation_id: "c-1".into(), bot_id: "ash".into() };
		notices.replied(&scope(), "Done.".into());
		notices.replied(&other, "Later.".into());

		notices.turn_ended(&scope(), "completed", "Wren");

		assert_eq!(notices.replies.len(), 1);
		assert!(notices.replies.contains_key(&key_of(&other)));
	}

	#[test]
	fn only_a_completed_turn_reads_as_finished() {
		assert_eq!(turns_of("completed"), Some((Turn::Running, Turn::Idle)));
		assert_eq!(turns_of("cancelled"), Some((Turn::Stopping, Turn::Idle)));
		assert_eq!(turns_of("failed"), Some((Turn::Running, Turn::Failed)));
		assert_eq!(turns_of("exploded"), None);
	}
}
