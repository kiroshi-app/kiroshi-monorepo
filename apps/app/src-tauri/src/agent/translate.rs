use std::collections::HashMap;
use std::path::Path;
use std::time::{SystemTime, UNIX_EPOCH};

use serde_json::Value;

use super::contract::{
	ActivityEvent, ActivityKind, ActivityStatus, AgentEvent, AskedQuestion, ChatMessage,
	MessageCompletion, MessageRole, PermissionRequest, QuestionOption, QuestionRequest,
	QuestionSubject, TransportError, TurnEnded, TurnOutcome,
};
use super::protocol::{
	CommandsFrame, ContentBlock, ContentDelta, ControlRequestBody, Frame, RejectionFrame,
	ResultFrame, StreamEvent, SystemFrame,
};
use super::redact;

pub(crate) fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map(|elapsed| elapsed.as_millis() as i64)
		.unwrap_or_default()
}

fn string_field(input: &Value, key: &str) -> Option<String> {
	input.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn path_label(input: &Value) -> Option<String> {
	let raw = string_field(input, "file_path").or_else(|| string_field(input, "path"))?;
	let path = Path::new(&raw);
	Some(
		path.file_name()
			.map_or_else(|| redact::path(path), |name| name.to_string_lossy().into_owned()),
	)
}

fn tool_title(name: &str, input: &Value) -> String {
	let detail = string_field(input, "description")
		.or_else(|| path_label(input))
		.or_else(|| string_field(input, "pattern"))
		.or_else(|| string_field(input, "query"));

	match detail {
		Some(detail) if !detail.is_empty() => format!("{name} · {detail}"),
		_ => name.to_owned(),
	}
}

fn permission_detail(name: &str, input: &Value) -> Option<String> {
	let raw = match name {
		"Bash" => string_field(input, "command")?,
		_ => string_field(input, "file_path").or_else(|| string_field(input, "path"))?,
	};
	Some(redact::text(&raw))
}

pub const ASK_USER_QUESTION: &str = "AskUserQuestion";

const SERVER_LEFT_OUT: &str = "a server was left out: a variable is defined by no scope";
const INTERRUPT_UNEXPLAINED: &str = "the sidecar refused the interrupt without a reason";

fn read_list<T>(value: &Value, key: &str, read: impl Fn(&Value) -> Option<T>) -> Vec<T> {
	value
		.get(key)
		.and_then(Value::as_array)
		.map_or_else(Vec::new, |items| items.iter().filter_map(read).collect())
}

fn asked_question(value: &Value) -> Option<AskedQuestion> {
	Some(AskedQuestion {
		header: string_field(value, "header")?,
		question: string_field(value, "question")?,
		options: read_list(value, "options", question_option),
		multi_select: value.get("multiSelect").and_then(Value::as_bool).unwrap_or_default(),
	})
}

const APPLICATION_SCOPE_SOURCE: &str = "application-scope:";

fn question_subject(input: &Value) -> Option<QuestionSubject> {
	let source = string_field(input.get("metadata")?, "source")?;
	let application = source.strip_prefix(APPLICATION_SCOPE_SOURCE)?.trim();
	(!application.is_empty())
		.then(|| QuestionSubject::ApplicationScope { application: application.to_owned() })
}

fn question_option(value: &Value) -> Option<QuestionOption> {
	Some(QuestionOption {
		label: string_field(value, "label")?,
		description: string_field(value, "description"),
		preview: string_field(value, "preview"),
	})
}

#[derive(Debug)]
struct StreamingMessage {
	id: String,
	spoke: bool,
}

fn ending_for(outcome: TurnOutcome, spoke: bool) -> Option<MessageCompletion> {
	match outcome {
		TurnOutcome::Cancelled => Some(MessageCompletion::Cancelled),
		TurnOutcome::Failed => Some(MessageCompletion::Failed),
		TurnOutcome::Completed => spoke.then_some(MessageCompletion::Complete),
	}
}

#[derive(Debug, Default)]
pub struct Translator {
	session_id: Option<String>,
	resumed: bool,
	streaming_message: Option<StreamingMessage>,
	delta_seq: u64,
	cancelling: bool,
	pending_permissions: HashMap<String, Value>,
	activity_titles: HashMap<String, String>,
}

impl Translator {
	pub fn new(resumed: bool) -> Self {
		Self { resumed, ..Self::default() }
	}

	pub fn session_id(&self) -> Option<&str> {
		self.session_id.as_deref()
	}

	pub fn mark_cancelling(&mut self) {
		self.cancelling = true;
	}

	pub fn is_waiting_on_person(&self) -> bool {
		!self.pending_permissions.is_empty()
	}

	pub fn take_permission_input(&mut self, request_id: &str) -> Option<Value> {
		self.pending_permissions.remove(request_id)
	}

	pub fn ingest(&mut self, frame: Frame) -> Vec<AgentEvent> {
		match frame {
			Frame::System(system) => self.on_system(system),
			Frame::StreamEvent(frame) => {
				frame.event.map(|event| self.on_stream(event)).unwrap_or_default()
			}
			Frame::Assistant(frame) => {
				frame.message.map(|body| self.on_assistant(body.content)).unwrap_or_default()
			}
			Frame::User(frame) => {
				frame.message.map(|body| self.on_user(body.content)).unwrap_or_default()
			}
			Frame::Result(result) => {
				if let Some(id) = result.session_id.clone() {
					self.session_id.get_or_insert(id);
				}
				self.on_result(result)
			}
			Frame::Commands(frame) => Self::on_commands(frame),
			Frame::SettingsRejected(frame) => Self::on_settings_rejected(frame),
			Frame::ServerEnvRejected(frame) => Self::on_server_env_rejected(frame),
			Frame::InterruptFailed(frame) => self.on_interrupt_failed(frame),
			Frame::ControlRequest(request) => {
				self.on_control_request(request.request_id, request.request)
			}
			Frame::Opened
			| Frame::Closed(_)
			| Frame::ControlResponse(_)
			| Frame::HostRequest(_)
			| Frame::Heartbeat
			| Frame::Ignored => Vec::new(),
		}
	}

	fn on_system(&mut self, frame: SystemFrame) -> Vec<AgentEvent> {
		if frame.subtype.as_deref() != Some("init") {
			return Vec::new();
		}
		let Some(session_id) = frame.session_id.filter(|_| self.session_id.is_none()) else {
			return Vec::new();
		};
		self.session_id = Some(session_id.clone());
		vec![AgentEvent::SessionReady { session_id, resumed: self.resumed }]
	}

	fn on_settings_rejected(frame: RejectionFrame) -> Vec<AgentEvent> {
		let Some(detail) = frame.detail.filter(|detail| !detail.trim().is_empty()) else {
			return Vec::new();
		};
		vec![AgentEvent::Failed { error: TransportError::SettingsRejected { detail } }]
	}

	fn on_server_env_rejected(frame: RejectionFrame) -> Vec<AgentEvent> {
		let detail = frame
			.detail
			.filter(|detail| !detail.trim().is_empty())
			.unwrap_or_else(|| SERVER_LEFT_OUT.to_owned());
		vec![AgentEvent::Failed { error: TransportError::ServerEnvRejected { detail } }]
	}

	fn on_commands(frame: CommandsFrame) -> Vec<AgentEvent> {
		if frame.commands.is_empty() {
			return Vec::new();
		}
		vec![AgentEvent::CommandsListed { commands: frame.commands }]
	}

	fn on_stream(&mut self, event: StreamEvent) -> Vec<AgentEvent> {
		match event {
			StreamEvent::MessageStart { message } => {
				let id = message.and_then(|header| header.id).unwrap_or_else(new_id);
				self.streaming_message = Some(StreamingMessage { id: id.clone(), spoke: false });
				vec![AgentEvent::MessageStarted {
					message: ChatMessage {
						id,
						role: MessageRole::Assistant,
						text: String::new(),
						completion: MessageCompletion::Streaming,
						timestamp: now_ms(),
					},
				}]
			}
			StreamEvent::ContentBlockDelta { delta: Some(ContentDelta::TextDelta { text }) } => {
				let Some(message) = self.streaming_message.as_mut() else {
					return Vec::new();
				};
				message.spoke = true;
				let id = message.id.clone();
				self.delta_seq += 1;
				vec![AgentEvent::MessageDelta { id, seq: self.delta_seq, text }]
			}
			StreamEvent::ContentBlockStart {
				content_block: Some(ContentBlock::ToolUse { id, name, input }),
			} => {
				vec![self.tool_started(id, &name, &input)]
			}
			_ => Vec::new(),
		}
	}

	fn tool_started(&mut self, id: String, name: &str, input: &Value) -> AgentEvent {
		let title = tool_title(name, input);
		self.activity_titles.insert(id.clone(), title.clone());
		AgentEvent::Activity {
			activity: ActivityEvent {
				id,
				title,
				kind: ActivityKind::Tool,
				status: ActivityStatus::Running,
			},
		}
	}

	fn on_user(&mut self, content: Vec<ContentBlock>) -> Vec<AgentEvent> {
		content
			.into_iter()
			.filter_map(|block| match block {
				ContentBlock::ToolResult { tool_use_id, is_error } => Some(AgentEvent::Activity {
					activity: ActivityEvent {
						title: self.activity_titles.remove(&tool_use_id).unwrap_or_default(),
						id: tool_use_id,
						kind: ActivityKind::Tool,
						status: if is_error {
							ActivityStatus::Failed
						} else {
							ActivityStatus::Succeeded
						},
					},
				}),
				_ => None,
			})
			.collect()
	}

	fn on_assistant(&mut self, content: Vec<ContentBlock>) -> Vec<AgentEvent> {
		let mut events = Vec::new();
		let mut text = String::new();

		for block in content {
			match block {
				ContentBlock::Text { text: chunk } => text.push_str(&chunk),
				ContentBlock::ToolUse { id, name, input } => {
					events.push(self.tool_started(id, &name, &input))
				}
				_ => {}
			}
		}

		if !text.is_empty() {
			let id = self.streaming_message.take().map(|message| message.id).unwrap_or_else(new_id);
			events.push(AgentEvent::MessageCompleted {
				message: ChatMessage {
					id,
					role: MessageRole::Assistant,
					text,
					completion: MessageCompletion::Complete,
					timestamp: now_ms(),
				},
			});
		}

		events
	}

	fn on_result(&mut self, frame: ResultFrame) -> Vec<AgentEvent> {
		let outcome = if self.cancelling {
			TurnOutcome::Cancelled
		} else if frame.is_error
			|| frame.subtype.as_deref().is_some_and(|subtype| subtype != "success")
		{
			TurnOutcome::Failed
		} else {
			TurnOutcome::Completed
		};
		self.end_turn(outcome, frame)
	}

	pub fn abandon_turn(&mut self) -> Vec<AgentEvent> {
		self.end_turn(TurnOutcome::Failed, ResultFrame::default())
	}

	fn on_interrupt_failed(&mut self, frame: RejectionFrame) -> Vec<AgentEvent> {
		let detail = frame
			.detail
			.filter(|detail| !detail.trim().is_empty())
			.unwrap_or_else(|| INTERRUPT_UNEXPLAINED.to_owned());
		let failed = AgentEvent::Failed { error: TransportError::WriteFailed { detail } };
		if !self.cancelling {
			return vec![failed];
		}
		let mut events = vec![failed];
		events.extend(self.abandon_turn());
		events
	}

	fn end_turn(&mut self, outcome: TurnOutcome, frame: ResultFrame) -> Vec<AgentEvent> {
		let mut events = Vec::new();
		if let Some(message) = self.streaming_message.take() {
			if let Some(completion) = ending_for(outcome, message.spoke) {
				events.push(AgentEvent::MessageCompleted {
					message: ChatMessage {
						id: message.id,
						role: MessageRole::Assistant,
						text: String::new(),
						completion,
						timestamp: now_ms(),
					},
				});
			}
		}

		self.cancelling = false;
		self.activity_titles.clear();
		self.pending_permissions.clear();

		events.push(AgentEvent::TurnEnded {
			ended: TurnEnded {
				session_id: self.session_id.clone(),
				outcome,
				structured_output: frame.structured_output,
				total_cost_usd: frame.total_cost_usd,
				model_usage: frame.model_usage,
			},
		});
		events
	}

	fn on_control_request(
		&mut self,
		request_id: String,
		body: ControlRequestBody,
	) -> Vec<AgentEvent> {
		let ControlRequestBody::CanUseTool { tool_name, display_name, description, input } = body
		else {
			return Vec::new();
		};

		let label = display_name.unwrap_or_else(|| tool_name.clone());
		let title = match description.as_deref() {
			Some(detail) if !detail.is_empty() => format!("{label} · {detail}"),
			_ => label,
		};
		let detail = permission_detail(&tool_name, &input);
		let questions = (tool_name == ASK_USER_QUESTION)
			.then(|| read_list(&input, "questions", asked_question));
		let subject = question_subject(&input);
		self.pending_permissions.insert(request_id.clone(), input);

		let pending = AgentEvent::Activity {
			activity: ActivityEvent {
				id: request_id.clone(),
				title: title.clone(),
				kind: ActivityKind::Permission,
				status: ActivityStatus::Pending,
			},
		};

		let asked = match questions {
			Some(questions) => AgentEvent::QuestionRequested {
				request: QuestionRequest { id: request_id, questions, subject },
			},
			None => AgentEvent::PermissionRequested {
				request: PermissionRequest { id: request_id, tool_name, title, detail },
			},
		};

		vec![pending, asked]
	}
}

fn new_id() -> String {
	uuid::Uuid::new_v4().to_string()
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::super::contract::AgentCommand;
	use super::*;

	const ANSWER: &str = "Both files are in place.";

	fn ingest(translator: &mut Translator, frames: Vec<Value>) -> Vec<AgentEvent> {
		frames
			.into_iter()
			.flat_map(|frame| {
				let frame = serde_json::from_value(frame).expect("a frame the transport parses");
				translator.ingest(frame)
			})
			.collect()
	}

	fn tool_round(round: usize) -> Vec<Value> {
		let message_id = format!("msg_tool_{round}");
		let tool_id = format!("toolu_{round}");
		let call = json!({
			"type": "tool_use", "id": tool_id, "name": "Read",
			"input": { "file_path": "/tmp/notes.txt" }
		});
		vec![
			json!({
				"type": "stream_event",
				"event": { "type": "message_start", "message": { "id": message_id } }
			}),
			json!({
				"type": "stream_event",
				"event": { "type": "content_block_start", "index": 0, "content_block": call }
			}),
			json!({
				"type": "assistant",
				"message": { "id": message_id, "role": "assistant", "content": [call] }
			}),
			json!({
				"type": "user",
				"message": {
					"role": "user",
					"content": [{ "type": "tool_result", "tool_use_id": tool_id, "is_error": false }]
				}
			}),
		]
	}

	fn spoken_answer(text: &str) -> Vec<Value> {
		let mut frames = vec![json!({
			"type": "stream_event",
			"event": { "type": "message_start", "message": { "id": "msg_answer" } }
		})];
		for chunk in text.split_inclusive(' ') {
			frames.push(json!({
				"type": "stream_event",
				"event": {
					"type": "content_block_delta", "index": 0,
					"delta": { "type": "text_delta", "text": chunk }
				}
			}));
		}
		frames.push(json!({
			"type": "assistant",
			"message": {
				"id": "msg_answer", "role": "assistant",
				"content": [{ "type": "text", "text": text }]
			}
		}));
		frames
	}

	fn result(subtype: &str, is_error: bool) -> Value {
		json!({ "type": "result", "subtype": subtype, "is_error": is_error, "session_id": "s-1" })
	}

	fn completed(events: &[AgentEvent]) -> Vec<&ChatMessage> {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::MessageCompleted { message } => Some(message),
				_ => None,
			})
			.collect()
	}

	fn streamed(events: &[AgentEvent]) -> String {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::MessageDelta { text, .. } => Some(text.as_str()),
				_ => None,
			})
			.collect()
	}

	fn statuses(events: &[AgentEvent]) -> Vec<ActivityStatus> {
		events
			.iter()
			.filter_map(|event| match event {
				AgentEvent::Activity { activity } => Some(activity.status),
				_ => None,
			})
			.collect()
	}

	fn with_field(mut object: Value, key: &str, value: Option<Value>) -> Value {
		if let Some(value) = value {
			object[key] = value;
		}
		object
	}

	fn init(session_id: &str) -> Value {
		json!({ "type": "system", "subtype": "init", "session_id": session_id })
	}

	fn commands(listed: Option<Value>) -> Value {
		with_field(json!({ "type": "commands" }), "commands", listed)
	}

	fn message(kind: &str, content: Option<Value>) -> Value {
		let body = json!({ "id": "msg_null", "role": kind });
		json!({ "type": kind, "message": with_field(body, "content", content) })
	}

	fn outcome(events: &[AgentEvent]) -> Option<TurnOutcome> {
		turn_ended(events).map(|ended| ended.outcome)
	}

	fn turn_ended(events: &[AgentEvent]) -> Option<&TurnEnded> {
		events.iter().find_map(|event| match event {
			AgentEvent::TurnEnded { ended } => Some(ended),
			_ => None,
		})
	}

	#[test]
	fn a_result_carries_its_structured_output_cost_and_model_usage_to_the_turn() {
		let structured_output = json!({ "Verdict": "routine", "notes": ["nothing to report"] });
		let model_usage = json!({ "claude-sonnet-4-5": { "inputTokens": 12, "costUSD": 0.03 } });
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![json!({
				"type": "result",
				"subtype": "success",
				"is_error": false,
				"session_id": "s-1",
				"structured_output": structured_output,
				"total_cost_usd": 0.0425,
				"modelUsage": model_usage,
			})],
		);

		let ended = turn_ended(&events).expect("a turn that ended");
		assert_eq!(ended.structured_output, Some(structured_output));
		assert_eq!(ended.total_cost_usd, Some(0.0425));
		assert_eq!(ended.model_usage, Some(model_usage));
	}

	#[test]
	fn a_result_without_the_three_values_ends_the_turn_with_none_of_them() {
		let mut translator = Translator::new(false);

		let events = ingest(&mut translator, vec![result("success", false)]);

		let ended = turn_ended(&events).expect("a turn that ended");
		assert_eq!(ended.session_id.as_deref(), Some("s-1"));
		assert_eq!(ended.outcome, TurnOutcome::Completed);
		assert_eq!(ended.structured_output, None);
		assert_eq!(ended.total_cost_usd, None);
		assert_eq!(ended.model_usage, None);
	}

	#[test]
	fn tools_are_activities_and_the_answer_is_the_only_message_that_ends() {
		let mut translator = Translator::new(false);
		let mut frames: Vec<Value> = (1..=14).flat_map(tool_round).collect();
		frames.extend(spoken_answer(ANSWER));
		frames.push(result("success", false));

		let events = ingest(&mut translator, frames);

		assert_eq!(streamed(&events), ANSWER);
		assert_eq!(
			completed(&events)
				.iter()
				.map(|message| (message.text.as_str(), message.completion))
				.collect::<Vec<_>>(),
			vec![(ANSWER, MessageCompletion::Complete)]
		);
		assert_eq!(
			statuses(&events),
			[ActivityStatus::Running, ActivityStatus::Running, ActivityStatus::Succeeded]
				.repeat(14)
		);
		assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	}

	#[test]
	fn a_turn_that_ends_well_after_a_tool_finishes_no_message() {
		let mut translator = Translator::new(false);
		let mut frames = tool_round(1);
		frames.push(result("success", false));

		let events = ingest(&mut translator, frames);

		assert_eq!(completed(&events), Vec::<&ChatMessage>::new());
		assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
	}

	#[test]
	fn a_turn_cut_off_before_a_word_still_finishes_its_message() {
		for (subtype, is_error, cancelling, expected) in [
			("error_during_execution", false, true, MessageCompletion::Cancelled),
			("error_during_execution", true, false, MessageCompletion::Failed),
		] {
			let mut translator = Translator::new(false);
			let mut events = ingest(&mut translator, tool_round(1));
			if cancelling {
				translator.mark_cancelling();
			}
			events.extend(ingest(&mut translator, vec![result(subtype, is_error)]));

			assert_eq!(
				completed(&events)
					.iter()
					.map(|message| (message.text.as_str(), message.completion))
					.collect::<Vec<_>>(),
				vec![("", expected)]
			);
		}
	}

	#[test]
	fn a_refused_interrupt_fails_the_turn_it_was_stopping_and_only_warns_otherwise() {
		let refused =
			json!({ "type": "interrupt_failed", "detail": "the query is already closed" });
		let failed = AgentEvent::Failed {
			error: TransportError::WriteFailed { detail: "the query is already closed".to_owned() },
		};
		let mut stopping = Translator::new(false);
		ingest(&mut stopping, tool_round(1));
		stopping.mark_cancelling();
		let mut idle = Translator::new(false);

		let while_stopping = ingest(&mut stopping, vec![refused.clone()]);
		let while_idle = ingest(&mut idle, vec![refused]);

		assert_eq!(while_stopping.first(), Some(&failed));
		assert_eq!(outcome(&while_stopping), Some(TurnOutcome::Failed));
		assert_eq!(while_idle, vec![failed]);
	}

	#[test]
	fn an_init_frame_announces_the_session_it_carries() {
		for (resumed, session_id) in [(false, "s-1"), (true, "carried-over")] {
			let mut translator = Translator::new(resumed);

			let events = ingest(&mut translator, vec![init(session_id)]);

			assert_eq!(
				events,
				vec![AgentEvent::SessionReady { session_id: session_id.to_owned(), resumed }]
			);
		}
	}

	#[test]
	fn a_rejected_settings_file_reaches_the_reader_with_its_reason() {
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![
				json!({ "type": "settings_rejected", "detail": "keys were dropped: model" }),
				json!({ "type": "settings_rejected" }),
				json!({ "type": "settings_rejected", "detail": "  " }),
			],
		);

		assert_eq!(
			events,
			vec![AgentEvent::Failed {
				error: TransportError::SettingsRejected {
					detail: "keys were dropped: model".to_owned()
				}
			}]
		);
	}

	#[test]
	fn every_left_out_server_reaches_the_reader() {
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![
				json!({
					"type": "server_env_rejected",
					"detail": "the server \"linear\" was left out: LINEAR_KEY is defined by no scope",
				}),
				json!({ "type": "server_env_rejected", "detail": "  " }),
				json!({ "type": "server_env_rejected" }),
			],
		);

		assert_eq!(
			events,
			vec![
				AgentEvent::Failed {
					error: TransportError::ServerEnvRejected {
						detail:
							"the server \"linear\" was left out: LINEAR_KEY is defined by no scope"
								.to_owned()
					}
				},
				AgentEvent::Failed {
					error: TransportError::ServerEnvRejected { detail: SERVER_LEFT_OUT.to_owned() }
				},
				AgentEvent::Failed {
					error: TransportError::ServerEnvRejected { detail: SERVER_LEFT_OUT.to_owned() }
				},
			]
		);
	}

	#[test]
	fn a_commands_frame_lists_what_it_carries() {
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![commands(Some(json!([
				{ "name": "review", "description": "Review the pending changes" },
				{ "name": "plan" },
			])))],
		);

		assert_eq!(
			events,
			vec![AgentEvent::CommandsListed {
				commands: vec![
					AgentCommand {
						name: "review".to_owned(),
						description: Some("Review the pending changes".to_owned()),
					},
					AgentCommand::named("plan"),
				],
			}]
		);
	}

	#[test]
	fn a_frame_carrying_no_commands_lists_nothing() {
		for listed in [None, Some(Value::Null), Some(json!([]))] {
			let mut translator = Translator::new(false);

			assert!(ingest(&mut translator, vec![commands(listed)]).is_empty());
		}
	}

	#[test]
	fn a_frame_whose_content_is_null_carries_none() {
		for kind in ["assistant", "user"] {
			for content in [None, Some(Value::Null)] {
				let mut translator = Translator::new(false);

				let events = ingest(&mut translator, vec![message(kind, content)]);

				assert!(events.is_empty(), "a {kind} frame carrying no content said something");
			}
		}
	}

	#[test]
	fn a_null_text_reads_as_an_empty_one() {
		for text in [None, Some(Value::Null)] {
			let mut translator = Translator::new(false);
			let block = with_field(json!({ "type": "text" }), "text", text.clone());
			let delta = with_field(json!({ "type": "text_delta" }), "text", text);

			let events = ingest(
				&mut translator,
				vec![
					json!({
						"type": "stream_event",
						"event": { "type": "message_start", "message": { "id": "msg_null" } }
					}),
					json!({
						"type": "stream_event",
						"event": { "type": "content_block_delta", "index": 0, "delta": delta }
					}),
					message("assistant", Some(json!([block]))),
				],
			);

			assert_eq!(streamed(&events), "");
			assert_eq!(completed(&events), Vec::<&ChatMessage>::new());
		}
	}

	#[test]
	fn a_null_error_flag_reads_as_one_that_worked() {
		for is_error in [None, Some(Value::Null)] {
			let mut translator = Translator::new(false);
			let tool_result = with_field(
				json!({ "type": "tool_result", "tool_use_id": "toolu_1" }),
				"is_error",
				is_error.clone(),
			);
			let ended = with_field(
				json!({ "type": "result", "subtype": "success", "session_id": "s-1" }),
				"is_error",
				is_error,
			);
			let mut frames = tool_round(1);
			frames.pop();
			frames.push(message("user", Some(json!([tool_result]))));
			frames.push(ended);

			let events = ingest(&mut translator, frames);

			assert_eq!(
				statuses(&events),
				[ActivityStatus::Running, ActivityStatus::Running, ActivityStatus::Succeeded]
			);
			assert_eq!(outcome(&events), Some(TurnOutcome::Completed));
		}
	}

	fn control_request(tool_name: &str, input: Value) -> Value {
		json!({
			"type": "control_request",
			"request_id": "req-1",
			"request": {
				"subtype": "can_use_tool",
				"tool_name": tool_name,
				"display_name": tool_name,
				"description": null,
				"input": input
			}
		})
	}

	fn asked(events: &[AgentEvent]) -> Option<&QuestionRequest> {
		events.iter().find_map(|event| match event {
			AgentEvent::QuestionRequested { request } => Some(request),
			_ => None,
		})
	}

	#[test]
	fn a_question_is_carried_instead_of_a_permission() {
		let mut translator = Translator::new(false);
		let input = json!({
			"questions": [
				{
					"header": "Library",
					"question": "Which library?",
					"multiSelect": false,
					"options": [
						{ "label": "date-fns", "description": "Small.", "preview": "format()" },
						{ "label": "Luxon", "description": "Zones." }
					]
				},
				{
					"header": "Extras",
					"question": "Which extras?",
					"multiSelect": true,
					"options": [{ "label": "Tests", "description": "A spec." }]
				}
			]
		});

		let events = ingest(&mut translator, vec![control_request(ASK_USER_QUESTION, input)]);

		assert_eq!(statuses(&events), [ActivityStatus::Pending]);
		assert!(!events
			.iter()
			.any(|event| matches!(event, AgentEvent::PermissionRequested { .. })));
		let request = asked(&events).expect("a question request");
		assert_eq!(request.id, "req-1");
		assert_eq!(
			request.questions,
			vec![
				AskedQuestion {
					header: "Library".to_owned(),
					question: "Which library?".to_owned(),
					multi_select: false,
					options: vec![
						QuestionOption {
							label: "date-fns".to_owned(),
							description: Some("Small.".to_owned()),
							preview: Some("format()".to_owned()),
						},
						QuestionOption {
							label: "Luxon".to_owned(),
							description: Some("Zones.".to_owned()),
							preview: None,
						},
					],
				},
				AskedQuestion {
					header: "Extras".to_owned(),
					question: "Which extras?".to_owned(),
					multi_select: true,
					options: vec![QuestionOption {
						label: "Tests".to_owned(),
						description: Some("A spec.".to_owned()),
						preview: None,
					}],
				},
			]
		);
		assert!(translator.take_permission_input("req-1").is_some());
	}

	#[test]
	fn a_question_frame_carrying_nothing_readable_asks_nothing() {
		for input in [json!({}), json!({ "questions": [{ "header": "Only" }] })] {
			let mut translator = Translator::new(false);

			let events = ingest(&mut translator, vec![control_request(ASK_USER_QUESTION, input)]);

			assert_eq!(asked(&events).expect("a question request").questions, Vec::new());
		}
	}

	fn a_scope_question(source: Value) -> Value {
		json!({
			"questions": [{
				"header": "Where",
				"question": "Where does it go?",
				"multiSelect": false,
				"options": [{ "label": "You alone", "description": "Your companion." }]
			}],
			"metadata": { "source": source }
		})
	}

	#[test]
	fn a_question_whose_source_names_an_application_scope_carries_that_subject() {
		let mut translator = Translator::new(false);

		let events = ingest(
			&mut translator,
			vec![control_request(
				ASK_USER_QUESTION,
				a_scope_question(json!("application-scope:com.notion/mcp")),
			)],
		);

		let request = asked(&events).expect("a question request");
		assert_eq!(
			request.subject,
			Some(QuestionSubject::ApplicationScope { application: "com.notion/mcp".to_owned() })
		);
		assert_eq!(request.questions.len(), 1);
	}

	#[test]
	fn a_question_whose_source_is_absent_empty_or_of_another_form_carries_no_subject() {
		let sources = [
			json!("application-scope:"),
			json!("application-scope:   "),
			json!("remember"),
			json!(""),
			json!(7),
		];
		for source in sources {
			let mut translator = Translator::new(false);

			let events = ingest(
				&mut translator,
				vec![control_request(ASK_USER_QUESTION, a_scope_question(source.clone()))],
			);

			assert_eq!(asked(&events).expect("a question request").subject, None, "for {source}");
		}

		let mut translator = Translator::new(false);
		let events = ingest(
			&mut translator,
			vec![control_request(ASK_USER_QUESTION, json!({ "questions": [] }))],
		);
		assert_eq!(asked(&events).expect("a question request").subject, None);
	}

	#[test]
	fn a_permission_request_and_its_activity_are_left_alone_by_a_scope_source() {
		let mut translator = Translator::new(false);
		let input = json!({
			"file_path": "/tmp/notes.txt",
			"metadata": { "source": "application-scope:linear" }
		});

		let events = ingest(&mut translator, vec![control_request("Write", input)]);

		assert_eq!(statuses(&events), [ActivityStatus::Pending]);
		assert!(events.iter().any(|event| matches!(
			event,
			AgentEvent::PermissionRequested { request } if request.tool_name == "Write"
		)));
		assert!(asked(&events).is_none());
	}

	#[test]
	fn another_tool_still_asks_for_a_permission() {
		let mut translator = Translator::new(false);
		let input = json!({ "file_path": "/tmp/notes.txt" });

		let events = ingest(&mut translator, vec![control_request("Write", input)]);

		assert!(asked(&events).is_none());
		assert!(events.iter().any(|event| matches!(
			event,
			AgentEvent::PermissionRequested { request } if request.tool_name == "Write"
		)));
	}

	#[test]
	fn a_question_left_unanswered_is_dropped_when_the_turn_ends() {
		let mut translator = Translator::new(false);
		let input = json!({ "questions": [] });

		ingest(&mut translator, vec![control_request(ASK_USER_QUESTION, input)]);
		ingest(
			&mut translator,
			vec![json!({ "type": "result", "subtype": "success", "session_id": "s-1" })],
		);

		assert!(translator.take_permission_input("req-1").is_none());
	}
}
