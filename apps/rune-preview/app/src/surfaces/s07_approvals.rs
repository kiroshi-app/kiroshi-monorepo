mod answers;
mod calls;
mod prompt;
#[cfg(test)]
mod tests;
mod view;

use kiroshi_core::agent::contract::{
	AgentEvent, PermissionDecision, PermissionRequest, QuestionRequest, RuntimeScope, ScopedEvent,
};
use kiroshi_core::conversations::contract::NewUserMessage;
use rune::{TextEdit, Waker};
use serde::de::Error as _;
use serde_json::Value;

use kiroshi_rune_kit::surfaces::s04_boot::notice::NoticeEvent;
use kiroshi_rune_kit::surfaces::s07_approvals::{ApprovalEvent, QuestionEvent};

use crate::app::App;
use crate::conversations::now_ms;
use crate::host::HostError;
use crate::source::Source;

pub use view::dock;

use answers::{answered_text, answers_of, question_message_id_of};
use calls::{Answer, Call, Calls};
use prompt::{Answered, Approval, Asked, Submitted};

const PERMISSION_REQUESTED: &str = "permissionRequested";

const QUESTION_REQUESTED: &str = "questionRequested";

const PERMISSION_RESOLVED: &str = "permissionResolved";

#[derive(Debug, PartialEq)]
pub enum Heard {
	Permission { scope: RuntimeScope, request: PermissionRequest },
	Question { scope: RuntimeScope, turn_id: Option<String>, request: QuestionRequest },
	Resolved { id: String, decision: PermissionDecision },
}

fn heard_from(scoped: ScopedEvent) -> Option<Heard> {
	let turn_id = scoped.turn.map(|turn| turn.turn_id);
	match (scoped.event, scoped.scope) {
		(AgentEvent::PermissionRequested { request }, Some(scope)) => {
			Some(Heard::Permission { scope, request })
		}
		(AgentEvent::QuestionRequested { request }, Some(scope)) => {
			Some(Heard::Question { scope, turn_id, request })
		}
		(AgentEvent::PermissionResolved { id, decision }, _) => {
			Some(Heard::Resolved { id, decision })
		}
		_ => None,
	}
}

fn is_heard_here(payload: &Value) -> bool {
	let kind = payload.pointer("/event/type").and_then(Value::as_str);
	matches!(kind, Some(PERMISSION_REQUESTED | QUESTION_REQUESTED | PERMISSION_RESOLVED))
}

pub fn heard_of(payload: &Value) -> Option<Result<Heard, serde_json::Error>> {
	if !is_heard_here(payload) {
		return None;
	}
	let heard = serde_json::from_value::<ScopedEvent>(payload.clone()).and_then(|scoped| {
		heard_from(scoped).ok_or_else(|| serde_json::Error::custom("the prompt names no scope"))
	});
	Some(heard)
}

struct ReadFailure {
	conversation_id: String,
	failure: HostError,
}

#[derive(Default)]
pub struct State {
	approvals: Vec<Approval>,
	questions: Vec<Asked>,
	answered: Vec<Answered>,
	read_failure: Option<ReadFailure>,
	spare: TextEdit,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
	}

	fn opened(&mut self, conversation_id: &str) {
		self.settle(conversation_id);
		self.read_failure = None;
		self.queue(Call::Pending { conversation_id: conversation_id.to_owned() });
	}

	pub fn heard(&mut self, heard: Heard) {
		match heard {
			Heard::Permission { scope, request } => self.asked_permission(scope, request),
			Heard::Question { scope, turn_id, request } => {
				self.asked_question(scope, turn_id, request)
			}
			Heard::Resolved { id, decision } => self.resolved(&id, decision),
		}
	}

	fn asked_permission(&mut self, scope: RuntimeScope, request: PermissionRequest) {
		if self.approvals.iter().any(|held| held.request.id == request.id) {
			return;
		}
		self.settle(&scope.conversation_id);
		self.approvals.push(Approval::new(scope, request));
	}

	fn asked_question(
		&mut self,
		scope: RuntimeScope,
		turn_id: Option<String>,
		request: QuestionRequest,
	) {
		if self.questions.iter().any(|held| held.request.id == request.id) {
			return;
		}
		self.settle(&scope.conversation_id);
		self.questions.push(Asked::new(scope, turn_id, request));
	}

	fn resolved(&mut self, id: &str, decision: PermissionDecision) {
		if let Some(approval) = self.approval_mut(id) {
			approval.resolved = Some(decision);
			approval.call = prompt::Call::Idle;
		}
		self.questions.retain(|asked| asked.request.id != id || asked.call.is_sending());
	}

	fn settle(&mut self, conversation_id: &str) {
		self.approvals.retain(|approval| {
			approval.resolved.is_none() || approval.scope.conversation_id != conversation_id
		});
		self.answered.retain(|answered| answered.conversation_id != conversation_id);
	}

	fn approval_mut(&mut self, id: &str) -> Option<&mut Approval> {
		self.approvals.iter_mut().find(|approval| approval.request.id == id)
	}

	fn question_mut(&mut self, id: &str) -> Option<&mut Asked> {
		self.questions.iter_mut().find(|asked| asked.request.id == id)
	}

	fn answered_mut(&mut self, id: &str) -> Option<&mut Answered> {
		self.answered.iter_mut().find(|answered| answered.request.id == id)
	}

	pub fn approval_event(&mut self, id: &str, event: ApprovalEvent) {
		match event {
			ApprovalEvent::AllowOnce => self.decide(id, PermissionDecision::AllowOnce),
			ApprovalEvent::Deny => self.decide(id, PermissionDecision::Deny),
			ApprovalEvent::ToggleInput => {
				if let Some(approval) = self.approval_mut(id) {
					approval.is_input_open = !approval.is_input_open;
				}
			}
		}
	}

	fn decide(&mut self, id: &str, decision: PermissionDecision) {
		let Some(approval) = self.approval_mut(id).filter(|approval| approval.can_decide()) else {
			return;
		};
		approval.call = prompt::Call::Sending;
		let scope = approval.scope.clone();
		self.queue(Call::Respond { scope, id: id.to_owned(), decision });
	}

	pub fn question_event(&mut self, id: &str, event: QuestionEvent) {
		let Some(asked) = self.question_mut(id).filter(|asked| !asked.call.is_sending()) else {
			return;
		};
		match event {
			QuestionEvent::Choose(option) => asked.choose(option),
			QuestionEvent::Toggle(option) => asked.toggle(option),
			QuestionEvent::Typed => asked.typed(),
			QuestionEvent::Show(index) => asked.show(index),
			QuestionEvent::Minimise => asked.is_minimised = true,
			QuestionEvent::Expand => asked.is_minimised = false,
			QuestionEvent::Skip => self.skip(id),
			QuestionEvent::Submit => self.submit(id),
			QuestionEvent::Exit | QuestionEvent::Act | QuestionEvent::CopyLink => {}
		}
	}

	fn skip(&mut self, id: &str) {
		let Some(asked) = self.question_mut(id) else { return };
		asked.call = prompt::Call::Sending;
		let scope = asked.scope.clone();
		self.queue(Call::Respond { scope, id: id.to_owned(), decision: PermissionDecision::Deny });
	}

	fn submit(&mut self, id: &str) {
		let Some(asked) = self.question_mut(id) else { return };
		let Submitted::Sent = asked.submit() else { return };
		let answers = answers_of(&asked.request, &asked.picks());
		let scope = asked.scope.clone();
		self.queue(Call::Answer { scope, id: id.to_owned(), answers });
	}

	pub fn edit_mut(&mut self, id: &str) -> &mut TextEdit {
		let shown =
			self.questions.iter_mut().find(|asked| asked.request.id == id).and_then(|asked| {
				let index = asked.shown;
				asked.drafts.get_mut(index)
			});
		match shown {
			Some(draft) => &mut draft.edit,
			None => &mut self.spare,
		}
	}

	pub fn approval_notice_event(&mut self, id: &str, event: NoticeEvent) {
		match event {
			NoticeEvent::Retry | NoticeEvent::Dismiss => {
				if let Some(approval) = self.approval_mut(id) {
					approval.call = prompt::Call::Idle;
				}
			}
		}
	}

	pub fn written_notice_event(&mut self, request_id: &str, event: NoticeEvent) {
		match event {
			NoticeEvent::Retry => self.write(request_id),
			NoticeEvent::Dismiss => {
				if let Some(answered) = self.answered_mut(request_id) {
					answered.written = prompt::Call::Idle;
				}
			}
		}
	}

	pub fn read_notice_event(&mut self, event: NoticeEvent) {
		let Some(read) = self.read_failure.take() else { return };
		match event {
			NoticeEvent::Retry => self.opened(&read.conversation_id),
			NoticeEvent::Dismiss => {}
		}
	}

	fn received(&mut self, answer: Answer, now: i64) {
		match answer {
			Answer::Pending { conversation_id, read } => self.pending_read(conversation_id, read),
			Answer::Responded { id, outcome } => self.responded(&id, outcome),
			Answer::Answered { id, outcome } => self.answered_by_agent(&id, outcome, now),
			Answer::Written { request_id, outcome } => {
				if let Some(answered) = self.answered_mut(&request_id) {
					answered.written =
						outcome.map_or_else(prompt::Call::Failed, |()| prompt::Call::Idle);
				}
			}
		}
	}

	fn pending_read(&mut self, conversation_id: String, read: Result<Vec<ScopedEvent>, HostError>) {
		match read {
			Ok(pending) => {
				for heard in pending.into_iter().filter_map(heard_from) {
					if let Heard::Question { scope, turn_id, request } = heard {
						self.asked_question(scope, turn_id, request);
					}
				}
			}
			Err(failure) => self.read_failure = Some(ReadFailure { conversation_id, failure }),
		}
	}

	fn responded(&mut self, id: &str, outcome: Result<(), HostError>) {
		if let Some(approval) = self.approval_mut(id) {
			approval.call = match outcome {
				Ok(()) => prompt::Call::Idle,
				Err(failure) => prompt::Call::Failed(failure),
			};
			return;
		}
		match outcome {
			Ok(()) => self.questions.retain(|asked| asked.request.id != id),
			Err(failure) => {
				if let Some(asked) = self.question_mut(id) {
					asked.call = prompt::Call::Failed(failure);
				}
			}
		}
	}

	fn answered_by_agent(&mut self, id: &str, outcome: Result<(), HostError>, now: i64) {
		if let Err(failure) = outcome {
			if let Some(asked) = self.question_mut(id) {
				asked.call = prompt::Call::Failed(failure);
			}
			return;
		}
		let Some(at) = self.questions.iter().position(|asked| asked.request.id == id) else {
			return;
		};
		let asked = self.questions.remove(at);
		self.answered.push(Answered {
			conversation_id: asked.scope.conversation_id.clone(),
			turn_id: asked.turn_id.clone(),
			picks: asked.picks(),
			request: asked.request,
			answered_at: now,
			written: prompt::Call::Idle,
		});
		self.write(id);
	}

	fn write(&mut self, request_id: &str) {
		let Some(answered) = self.answered_mut(request_id) else { return };
		let Some(message) = answer_message(answered, uuid::Uuid::new_v4().to_string()) else {
			return;
		};
		answered.written = prompt::Call::Sending;
		self.queue(Call::Write { request_id: request_id.to_owned(), message });
	}

	fn take_answers(&mut self, now: i64) -> bool {
		let answers = self.calls.as_ref().map(Calls::answers).unwrap_or_default();
		let has_answers = !answers.is_empty();
		for answer in answers {
			self.received(answer, now);
		}
		self.flush();
		has_answers
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
	}

	fn flush(&mut self) {
		if self.calls.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.calls = Some(Calls::new(source.clone(), waker.clone()));
		}
		let Some(calls) = self.calls.as_ref() else { return };
		for call in self.queued.drain(..) {
			calls.send(call);
		}
	}
}

fn answer_message(answered: &Answered, id: String) -> Option<NewUserMessage> {
	let turn_id = answered.turn_id.clone()?;
	let answers = answers_of(&answered.request, &answered.picks);
	let content = answered_text(&answered.request, &answers);
	if content.is_empty() {
		return None;
	}
	Some(NewUserMessage {
		id,
		conversation_id: answered.conversation_id.clone(),
		turn_id,
		author_bot_id: None,
		replied_to_message_id: Some(question_message_id_of(&answered.request.id)),
		replied_to_message_ids: Vec::new(),
		reply_links: Vec::new(),
		documents: Vec::new(),
		content,
		created_at: answered.answered_at,
	})
}

pub fn open_conversation(app: &mut App, conversation_id: &str) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	let approvals = &mut app.surfaces.s07_approvals;
	approvals.use_source(source);
	approvals.opened(conversation_id);
	approvals.flush();
}

pub fn poll(app: &mut App) -> bool {
	app.surfaces.s07_approvals.take_answers(now_ms())
}

fn changed(app: &mut App, change: impl FnOnce(&mut State)) {
	let approvals = &mut app.surfaces.s07_approvals;
	change(approvals);
	approvals.flush();
}
