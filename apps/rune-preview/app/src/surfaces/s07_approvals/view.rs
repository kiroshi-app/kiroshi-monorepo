use kiroshi_core::agent::contract::{AskedQuestion, PermissionDecision};
use rune::{El, col, row};

use kiroshi_rune_kit::strings::chat::screen::{approval, notice};
use kiroshi_rune_kit::strings::{Key as Copy, Language};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{
	InlineNotice, NoticeEvent, NoticeRetry, Tone, inline_notice,
};
use kiroshi_rune_kit::surfaces::s05_thread::{Agent, COLUMN, COLUMN_INSET};
use kiroshi_rune_kit::surfaces::s07_approvals::{
	AnsweredQuestion, Answerer, ApprovalParameter, ApprovalStatus, Draft as PanelDraft,
	ParameterValue, Question, QuestionFailure, QuestionOption, QuestionPanel, ToolApproval,
	answered_question_card, tool_approval, tool_question, waiting_bar,
};
use kiroshi_rune_kit::tokens::{SPACING, Tokens};

use super::prompt::{Answered, Approval, Asked};
use super::{State, changed};
use crate::app::{App, Person};
use crate::conversations::{now_ms, roster_timestamp};
use crate::host::HostError;

const LANGUAGE: Language = Language::En;

const SHELL_TOOL: &str = "Bash";

const NAME: &str = "{{name}}";

fn said(key: Copy) -> String {
	key.text(LANGUAGE).to_owned()
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn agent_name<'a>(roster: &'a [Agent], bot_id: &str) -> Option<&'a str> {
	let agent = roster.iter().find(|agent| agent.id == bot_id)?;
	Some(agent.name.trim()).filter(|name| !name.is_empty())
}

fn viewer_name(app: &App) -> &str {
	match app.ready().map(|ready| &ready.person) {
		Some(Person::SignedIn(email)) => email,
		Some(Person::SignedOut | Person::Unread) | None => "",
	}
}

fn approval_description(name: Option<&str>) -> String {
	match name {
		Some(name) => approval::DESCRIPTION_NAMED.text(LANGUAGE).replace(NAME, name),
		None => said(approval::DESCRIPTION),
	}
}

fn status_of(resolved: Option<PermissionDecision>) -> ApprovalStatus {
	match resolved {
		None => ApprovalStatus::Pending,
		Some(PermissionDecision::AllowOnce) => ApprovalStatus::Allowed,
		Some(PermissionDecision::Deny) => ApprovalStatus::Denied,
	}
}

const RETRY: NoticeRetry = NoticeRetry { label: None, busy: false };

fn failure_notice(
	t: &Tokens,
	failure: &HostError,
	retry: Option<NoticeRetry>,
	on: impl Fn(&mut App, NoticeEvent) + Clone + 'static,
) -> El {
	let title = said(notice::FAILED);
	let description = failure_text(failure);
	let shown = InlineNotice {
		tone: Tone::Error,
		title: &title,
		description: Some(&description),
		retry,
		dismissible: true,
	};
	inline_notice(t, LANGUAGE, &shown, on)
}

fn approval_view(t: &Tokens, approval: &Approval, roster: &[Agent]) -> Vec<El> {
	let request = &approval.request;
	let detail = request.detail.as_deref();
	let is_shell = request.tool_name == SHELL_TOOL;
	let path = said(approval::PATH);
	let parameters: Vec<ApprovalParameter> = detail
		.filter(|_| !is_shell)
		.map(|detail| ApprovalParameter { label: &path, value: ParameterValue::Shown(detail) })
		.into_iter()
		.collect();
	let description = approval_description(agent_name(roster, &approval.scope.bot_id));
	let data = ToolApproval {
		tool: &request.tool_name,
		title: Some(&request.title),
		description: Some(&description),
		code: detail.filter(|_| is_shell),
		parameters: &parameters,
		status: status_of(approval.resolved),
		is_open: approval.is_input_open,
	};
	let id = request.id.clone();
	let decided = id.clone();
	let mut shown = vec![tool_approval(t, LANGUAGE, &data, move |app: &mut App, event| {
		changed(app, |state| state.approval_event(&decided, event))
	})];
	if let Some(failure) = approval.call.failure() {
		shown.push(failure_notice(t, failure, None, move |app, _| {
			changed(app, |state| state.dismiss_approval_failure(&id))
		}));
	}
	shown
}

fn options_of(asked: &AskedQuestion) -> Vec<QuestionOption<'_>> {
	asked
		.options
		.iter()
		.map(|option| QuestionOption {
			label: &option.label,
			description: option.description.as_deref().unwrap_or_default(),
			preview: option.preview.as_deref(),
		})
		.collect()
}

fn question_view(t: &Tokens, asked: &Asked, roster: &[Agent]) -> El {
	let options: Vec<Vec<QuestionOption>> =
		asked.request.questions.iter().map(options_of).collect();
	let failure_title = said(notice::FAILED);
	let failure_detail = asked.call.failure().map(failure_text);
	let questions: Vec<Question> = asked
		.request
		.questions
		.iter()
		.zip(&options)
		.enumerate()
		.map(|(index, (question, options))| Question {
			is_multi_select: question.multi_select,
			failure: failure_detail
				.as_deref()
				.filter(|_| index == asked.shown)
				.map(|detail| QuestionFailure { title: &failure_title, detail: Some(detail) }),
			..Question::ask(&question.question, &question.header, options)
		})
		.collect();
	let drafts: Vec<PanelDraft> = asked
		.drafts
		.iter()
		.map(|draft| PanelDraft { chosen: &draft.chosen, edit: &draft.edit })
		.collect();
	let panel = QuestionPanel {
		questions: &questions,
		drafts: &drafts,
		shown: asked.shown,
		companion: agent_name(roster, &asked.scope.bot_id),
		can_skip: true,
		can_minimise: true,
		has_digit_keys: true,
		is_refused: asked.is_refused,
		is_pending: asked.call.is_sending(),
		has_copied: false,
	};
	let id = asked.request.id.clone();
	let on = move |app: &mut App, event| changed(app, |state| state.question_event(&id, event));
	if asked.is_minimised {
		return waiting_bar(t, LANGUAGE, &panel, on);
	}
	let edited = asked.request.id.clone();
	tool_question(
		t,
		LANGUAGE,
		&panel,
		move |app: &mut App| app.surfaces.s07_approvals.edit_mut(&edited),
		on,
	)
}

fn answered_view(t: &Tokens, answered: &Answered, viewer: &str, now: i64) -> Vec<El> {
	let options: Vec<Vec<QuestionOption>> =
		answered.request.questions.iter().map(options_of).collect();
	let questions: Vec<AnsweredQuestion> = answered
		.request
		.questions
		.iter()
		.zip(&options)
		.zip(&answered.picks)
		.map(|((question, options), pick)| AnsweredQuestion {
			header: &question.question,
			options,
			chosen: &pick.chosen,
			free_text: Some(pick.written.as_str()),
		})
		.collect();
	let answerer = Answerer { name: viewer, image: None, is_viewer: true };
	let answered_at = roster_timestamp(answered.answered_at, now);
	let mut shown = vec![answered_question_card(t, LANGUAGE, &answerer, &answered_at, &questions)];
	if let Some(failure) = answered.written.failure() {
		let id = answered.request.id.clone();
		shown.push(failure_notice(t, failure, Some(RETRY), move |app, event| {
			changed(app, |state| state.written_notice_event(&id, event))
		}));
	}
	shown
}

fn read_failure_view(t: &Tokens, state: &State, conversation_id: &str) -> Option<El> {
	let read =
		state.read_failure.as_ref().filter(|read| read.conversation_id == conversation_id)?;
	Some(failure_notice(t, &read.failure, Some(RETRY), |app, event| {
		changed(app, |state| state.read_notice_event(event))
	}))
}

fn prompts_in(app: &App, t: &Tokens, conversation_id: &str, roster: &[Agent]) -> Vec<El> {
	let state = &app.surfaces.s07_approvals;
	let viewer = viewer_name(app);
	let now = now_ms();
	let answered = state
		.answered
		.iter()
		.filter(|answered| answered.conversation_id == conversation_id)
		.flat_map(|answered| answered_view(t, answered, viewer, now));
	let approvals = state
		.approvals
		.iter()
		.filter(|approval| approval.scope.conversation_id == conversation_id)
		.flat_map(|approval| approval_view(t, approval, roster));
	let question = state
		.questions
		.iter()
		.find(|asked| asked.scope.conversation_id == conversation_id)
		.map(|asked| question_view(t, asked, roster));
	let read_failure = read_failure_view(t, state, conversation_id);
	answered.chain(approvals).chain(question).chain(read_failure).collect()
}

pub fn dock(app: &App, t: &Tokens, conversation_id: &str, roster: &[Agent]) -> Option<El> {
	let prompts = prompts_in(app, t, conversation_id, roster);
	if prompts.is_empty() {
		return None;
	}
	let stack = col().w_full().max_w(COLUMN).gap(SPACING * 3.0).children(prompts);
	Some(
		row()
			.key("approvals-dock")
			.w_full()
			.justify_center()
			.px(COLUMN_INSET)
			.pb(SPACING * 3.0)
			.child(stack),
	)
}
