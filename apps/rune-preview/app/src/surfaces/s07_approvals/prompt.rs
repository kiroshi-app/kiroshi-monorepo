use kiroshi_core::agent::contract::{
	PermissionDecision, PermissionRequest, QuestionRequest, RuntimeScope,
};
use rune::TextEdit;

use super::answers::Pick;
use crate::host::HostError;

#[derive(Debug, Default)]
pub enum Call {
	#[default]
	Idle,
	Sending,
	Failed(HostError),
}

impl Call {
	pub fn is_sending(&self) -> bool {
		matches!(self, Call::Sending)
	}

	pub fn failure(&self) -> Option<&HostError> {
		match self {
			Call::Failed(failure) => Some(failure),
			Call::Idle | Call::Sending => None,
		}
	}
}

pub struct Approval {
	pub scope: RuntimeScope,
	pub request: PermissionRequest,
	pub resolved: Option<PermissionDecision>,
	pub is_input_open: bool,
	pub call: Call,
}

impl Approval {
	pub fn new(scope: RuntimeScope, request: PermissionRequest) -> Approval {
		Approval { scope, request, resolved: None, is_input_open: false, call: Call::Idle }
	}

	pub fn can_decide(&self) -> bool {
		self.resolved.is_none() && !self.call.is_sending()
	}
}

pub struct Draft {
	pub chosen: Vec<usize>,
	pub edit: TextEdit,
}

impl Draft {
	fn blank() -> Draft {
		Draft { chosen: Vec::new(), edit: TextEdit::new("") }
	}

	pub fn is_answered(&self) -> bool {
		!self.chosen.is_empty() || !self.edit.text.trim().is_empty()
	}

	fn pick(&self) -> Pick {
		Pick { chosen: self.chosen.clone(), written: self.edit.text.clone() }
	}
}

pub enum Submitted {
	Refused,
	Advanced,
	Sent,
}

pub struct Asked {
	pub scope: RuntimeScope,
	pub turn_id: Option<String>,
	pub request: QuestionRequest,
	pub drafts: Vec<Draft>,
	pub shown: usize,
	pub is_refused: bool,
	pub is_minimised: bool,
	pub call: Call,
}

impl Asked {
	pub fn new(scope: RuntimeScope, turn_id: Option<String>, request: QuestionRequest) -> Asked {
		let drafts = request.questions.iter().map(|_| Draft::blank()).collect();
		Asked {
			scope,
			turn_id,
			request,
			drafts,
			shown: 0,
			is_refused: false,
			is_minimised: false,
			call: Call::Idle,
		}
	}

	pub fn picks(&self) -> Vec<Pick> {
		self.drafts.iter().map(Draft::pick).collect()
	}

	fn is_multi_select(&self, index: usize) -> bool {
		self.request.questions.get(index).is_some_and(|asked| asked.multi_select)
	}

	fn is_answered(&self, index: usize) -> bool {
		self.drafts.get(index).is_some_and(Draft::is_answered)
	}

	fn waiting_after_shown(&self) -> Option<usize> {
		(0..self.drafts.len()).find(|&index| index != self.shown && !self.is_answered(index))
	}

	fn shown_draft(&mut self) -> Option<&mut Draft> {
		self.drafts.get_mut(self.shown)
	}

	pub fn choose(&mut self, option: usize) {
		let Some(draft) = self.shown_draft() else { return };
		draft.chosen = vec![option];
		draft.edit = TextEdit::new("");
		if !self.is_multi_select(self.shown)
			&& let Some(next) = self.waiting_after_shown()
		{
			self.shown = next;
		}
	}

	pub fn toggle(&mut self, option: usize) {
		let Some(draft) = self.shown_draft() else { return };
		match draft.chosen.iter().position(|&held| held == option) {
			Some(at) => {
				draft.chosen.remove(at);
			}
			None => draft.chosen.push(option),
		}
		draft.edit = TextEdit::new("");
	}

	pub fn typed(&mut self) {
		if let Some(draft) = self.shown_draft() {
			draft.chosen.clear();
		}
	}

	pub fn show(&mut self, index: usize) {
		if index < self.drafts.len() {
			self.shown = index;
		}
	}

	pub fn submit(&mut self) -> Submitted {
		if !self.is_answered(self.shown) {
			self.is_refused = true;
			return Submitted::Refused;
		}
		if let Some(waiting) = self.waiting_after_shown() {
			self.shown = waiting;
			return Submitted::Advanced;
		}
		self.call = Call::Sending;
		Submitted::Sent
	}
}

pub struct Answered {
	pub conversation_id: String,
	pub turn_id: Option<String>,
	pub request: QuestionRequest,
	pub picks: Vec<Pick>,
	pub answered_at: i64,
	pub written: Call,
}
