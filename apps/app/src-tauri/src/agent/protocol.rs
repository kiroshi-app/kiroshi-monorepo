use serde::de::DeserializeOwned;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use super::contract::{Account, AgentCommand};
use crate::environment::contract::{ResolvedEnv, Values};

fn null_as_default<'de, D, T>(deserializer: D) -> Result<T, D::Error>
where
	D: Deserializer<'de>,
	T: Default + Deserialize<'de>,
{
	Ok(Option::<T>::deserialize(deserializer)?.unwrap_or_default())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Ready {
	pub provider: String,
	pub version: String,
	#[serde(default)]
	pub sdk_version: Option<String>,
	#[serde(default)]
	pub capabilities: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Envelope {
	pub session: String,
	pub frame: Value,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenRequest {
	pub cwd: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub resume: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub system_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub user_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub space_plugin_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub agent: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub identity: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub output_style: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub settings_path: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub app_data_dir: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub conversation_id: Option<String>,
	pub partial_messages: bool,
	#[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
	pub env: std::collections::BTreeMap<String, String>,
	#[serde(skip_serializing_if = "ResolvedEnv::is_untouched")]
	pub server_env: ResolvedEnv,
	#[serde(skip_serializing_if = "std::collections::BTreeMap::is_empty")]
	pub connection: Values,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub output_schema: Option<Value>,
	#[serde(skip_serializing_if = "std::ops::Not::not")]
	pub mission_thread: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Frame {
	Opened,
	Closed(ClosedFrame),
	System(SystemFrame),
	StreamEvent(StreamEventFrame),
	Assistant(MessageFrame),
	User(MessageFrame),
	Result(ResultFrame),
	Commands(CommandsFrame),
	ControlRequest(ControlRequestFrame),
	HostRequest(HostRequestFrame),
	ControlResponse(ControlResponseFrame),
	SettingsRejected(RejectionFrame),
	ServerEnvRejected(RejectionFrame),
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ClosedFrame {
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RejectionFrame {
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SystemFrame {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub session_id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CommandsFrame {
	#[serde(default, deserialize_with = "null_as_default")]
	pub commands: Vec<AgentCommand>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamEventFrame {
	#[serde(default)]
	pub event: Option<StreamEvent>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum StreamEvent {
	MessageStart {
		#[serde(default)]
		message: Option<StreamMessageHeader>,
	},
	ContentBlockStart {
		#[serde(default)]
		content_block: Option<ContentBlock>,
	},
	ContentBlockDelta {
		#[serde(default)]
		delta: Option<ContentDelta>,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct StreamMessageHeader {
	#[serde(default)]
	pub id: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentDelta {
	TextDelta {
		#[serde(default, deserialize_with = "null_as_default")]
		text: String,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageFrame {
	#[serde(default)]
	pub message: Option<MessageBody>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MessageBody {
	#[serde(default)]
	pub id: Option<String>,
	#[serde(default, deserialize_with = "null_as_default")]
	pub content: Vec<ContentBlock>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum ContentBlock {
	Text {
		#[serde(default, deserialize_with = "null_as_default")]
		text: String,
	},
	ToolUse {
		id: String,
		name: String,
		#[serde(default)]
		input: Value,
	},
	ToolResult {
		tool_use_id: String,
		#[serde(default, deserialize_with = "null_as_default")]
		is_error: bool,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ResultFrame {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub session_id: Option<String>,
	#[serde(default, deserialize_with = "null_as_default")]
	pub is_error: bool,
	#[serde(default)]
	pub structured_output: Option<Value>,
	#[serde(default)]
	pub total_cost_usd: Option<f64>,
	#[serde(default, rename = "modelUsage")]
	pub model_usage: Option<Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlRequestFrame {
	pub request_id: String,
	pub request: ControlRequestBody,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "subtype", rename_all = "snake_case")]
pub enum ControlRequestBody {
	CanUseTool {
		tool_name: String,
		#[serde(default)]
		display_name: Option<String>,
		#[serde(default)]
		description: Option<String>,
		#[serde(default)]
		input: Value,
	},
	#[serde(other)]
	Ignored,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HostRequestFrame {
	pub request_id: String,
	pub request: Value,
}

pub type HostAnswer = Result<Value, Value>;

#[derive(Debug, Clone, Deserialize)]
pub struct ControlResponseFrame {
	pub response: ControlResponseBody,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ControlResponseBody {
	#[serde(default)]
	pub subtype: Option<String>,
	#[serde(default)]
	pub request_id: Option<String>,
	#[serde(default)]
	pub error: Option<String>,
}

fn command(kind: &str, session: &str, body: Value) -> Value {
	let mut frame = serde_json::json!({ "type": kind, "session": session });
	if let (Some(frame), Some(body)) = (frame.as_object_mut(), body.as_object()) {
		frame.extend(body.clone());
	}
	frame
}

pub fn open_command(session: &str, request: &OpenRequest) -> Value {
	command(
		"open",
		session,
		serde_json::to_value(request).unwrap_or_else(|_| serde_json::json!({})),
	)
}

pub fn prompt_command(session: &str, text: &str) -> Value {
	command("prompt", session, serde_json::json!({ "text": text }))
}

pub fn interrupt_command(session: &str) -> Value {
	command("interrupt", session, Value::Null)
}

pub fn close_command(session: &str) -> Value {
	command("close", session, Value::Null)
}

pub fn allow_command(session: &str, request_id: &str, input: &Value) -> Value {
	command(
		"permission",
		session,
		serde_json::json!({
			"requestId": request_id,
			"decision": { "behavior": "allow", "updatedInput": input }
		}),
	)
}

pub fn deny_command(session: &str, request_id: &str, message: &str) -> Value {
	command(
		"permission",
		session,
		serde_json::json!({
			"requestId": request_id,
			"decision": { "behavior": "deny", "message": message }
		}),
	)
}

pub fn host_response_command(session: &str, request_id: &str, answer: &HostAnswer) -> Value {
	let body = match answer {
		Ok(result) => serde_json::json!({ "requestId": request_id, "result": result }),
		Err(error) => serde_json::json!({ "requestId": request_id, "error": error }),
	};
	command("host_response", session, body)
}

pub const CHECK: &str = "check";
pub const MODELS: &str = "models";
pub const TOOLS: &str = "tools";
pub const TITLE: &str = "title";
pub const SIGN_IN: &str = "sign_in";
pub const SIGN_IN_STARTED: &str = "sign_in_started";
pub const SIGN_IN_CODE: &str = "sign_in_code";
pub const SIGN_IN_CANCEL: &str = "sign_in_cancel";

pub fn sign_in_code_command(text: &str) -> Value {
	serde_json::json!({ "type": SIGN_IN_CODE, "text": text })
}

pub fn sign_in_cancel_command() -> Value {
	serde_json::json!({ "type": SIGN_IN_CANCEL })
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SignInFailureKind {
	Busy,
	Cancelled,
	TimedOut,
	#[serde(other)]
	Failed,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignInFailure {
	pub kind: SignInFailureKind,
	#[serde(default)]
	pub detail: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SignedIn {
	#[serde(default, deserialize_with = "null_as_default")]
	pub signed_in: bool,
	#[serde(default)]
	pub error: Option<SignInFailure>,
}

pub fn ask_command(kind: &str) -> Value {
	serde_json::json!({ "type": kind })
}

pub fn sourced_command(kind: &str, connection: &Values) -> Value {
	serde_json::json!({ "type": kind, "connection": connection })
}

pub fn title_command(text: &str, connection: &Values) -> Value {
	serde_json::json!({ "type": TITLE, "text": text, "connection": connection })
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Checked {
	#[serde(default, deserialize_with = "null_as_default")]
	pub authenticated: bool,
	#[serde(default)]
	pub detail: Option<String>,
	#[serde(default)]
	pub account: Option<Account>,
	#[serde(default)]
	pub auth_method: Option<String>,
}

pub fn listed<Item: DeserializeOwned>(
	command: &str,
	answer: Value,
) -> Result<Vec<Item>, serde_json::Error> {
	let mut fields: serde_json::Map<String, Value> = serde_json::from_value(answer)?;
	let list = fields.remove(command).unwrap_or(Value::Null);
	Ok(serde_json::from_value::<Option<Vec<Item>>>(list)?.unwrap_or_default())
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Titled {
	#[serde(default)]
	pub title: Option<String>,
	#[serde(default)]
	pub icon: Option<String>,
}

pub const OAUTH_AUTHORIZE: &str = "mcp_oauth_authorize";
pub const OAUTH_STARTED: &str = "oauth_started";
pub const OAUTH_CANCEL: &str = "mcp_oauth_cancel";
pub const OAUTH_REVOKE: &str = "mcp_oauth_revoke";
pub const OAUTH_REFRESH: &str = "mcp_oauth_refresh";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RevocationRequest {
	pub url: String,
	pub token: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub refresh_token: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_secret: Option<String>,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthorizeRequest {
	pub url: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_secret: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub redirect_uri: Option<String>,
}

pub fn oauth_authorize_command(request: &AuthorizeRequest) -> Value {
	command_carrying(OAUTH_AUTHORIZE, request)
}

pub fn oauth_cancel_command() -> Value {
	serde_json::json!({ "type": OAUTH_CANCEL })
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefreshRequest {
	pub url: String,
	pub refresh_token: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_id: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub client_secret: Option<String>,
}

pub fn oauth_revoke_command(request: &RevocationRequest) -> Value {
	command_carrying(OAUTH_REVOKE, request)
}

pub fn oauth_refresh_command(request: &RefreshRequest) -> Value {
	command_carrying(OAUTH_REFRESH, request)
}

fn command_carrying(kind: &str, request: &impl Serialize) -> Value {
	let mut frame = serde_json::json!({ "type": kind });
	if let (Some(frame), Ok(Value::Object(body))) =
		(frame.as_object_mut(), serde_json::to_value(request))
	{
		frame.extend(body);
	}
	frame
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthStarted {
	pub url: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum OauthFailureKind {
	Busy,
	Cancelled,
	TimedOut,
	Denied,
	Rejected,
	#[serde(other)]
	Failed,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum OauthStep {
	Discovery,
	Registration,
	TokenExchange,
}

fn step_the_app_knows<'de, D>(deserializer: D) -> Result<Option<OauthStep>, D::Error>
where
	D: Deserializer<'de>,
{
	Ok(Option::<Value>::deserialize(deserializer)?
		.and_then(|named| serde_json::from_value(named).ok()))
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthFailure {
	pub kind: OauthFailureKind,
	#[serde(default)]
	pub detail: Option<String>,
	#[serde(default, deserialize_with = "step_the_app_knows")]
	pub step: Option<OauthStep>,
	#[serde(default)]
	pub status: Option<u16>,
	#[serde(default)]
	pub body: Option<String>,
	#[serde(default)]
	pub code: Option<String>,
}

const INVALID_GRANT: &str = "invalid_grant";
const INVALID_CLIENT: &str = "invalid_client";
const UNAUTHORIZED_CLIENT: &str = "unauthorized_client";

impl OauthFailure {
	pub fn refuses_the_grant(&self) -> bool {
		self.code.as_deref() == Some(INVALID_GRANT)
	}

	pub fn refuses_the_client(&self) -> bool {
		matches!(self.code.as_deref(), Some(INVALID_CLIENT | UNAUTHORIZED_CLIENT))
	}
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OauthCredentials {
	pub access_token: String,
	#[serde(default)]
	pub refresh_token: Option<String>,
	#[serde(default)]
	pub expires_at: Option<i64>,
	pub client_id: String,
	#[serde(default)]
	pub client_secret: Option<String>,
	#[serde(default)]
	pub redirect_uri: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Authorized {
	#[serde(default)]
	pub credentials: Option<OauthCredentials>,
	#[serde(default)]
	pub error: Option<OauthFailure>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Revoked {
	#[serde(default, deserialize_with = "null_as_default")]
	pub revoked: bool,
	#[serde(default)]
	pub detail: Option<String>,
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json};

	use super::*;

	fn failure(frame: Value) -> OauthFailure {
		from_value(frame).expect("the frame reads")
	}

	#[test]
	fn an_authorize_command_hands_the_stored_client_when_it_names_one() {
		let handed = AuthorizeRequest {
			url: "https://mcp.granola.test/mcp".to_owned(),
			client_id: Some("registered".to_owned()),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: Some("http://127.0.0.1:53682/oauth/callback".to_owned()),
		};
		let bare = AuthorizeRequest { url: handed.url.clone(), ..Default::default() };

		assert_eq!(
			oauth_authorize_command(&handed),
			json!({
				"type": "mcp_oauth_authorize",
				"url": "https://mcp.granola.test/mcp",
				"clientId": "registered",
				"clientSecret": "confidential",
				"redirectUri": "http://127.0.0.1:53682/oauth/callback"
			})
		);
		assert_eq!(
			oauth_authorize_command(&bare),
			json!({ "type": "mcp_oauth_authorize", "url": "https://mcp.granola.test/mcp" })
		);
	}

	#[test]
	fn a_failure_reads_the_code_it_names_and_what_that_code_refuses() {
		let named = |code: &str| failure(json!({ "kind": "rejected", "code": code }));

		assert!(named("invalid_grant").refuses_the_grant());
		assert!(!named("invalid_grant").refuses_the_client());
		assert!(named("invalid_client").refuses_the_client());
		assert!(named("unauthorized_client").refuses_the_client());
		assert!(!named("temporarily_unavailable").refuses_the_grant());
		assert!(!named("temporarily_unavailable").refuses_the_client());
		assert_eq!(failure(json!({ "kind": "failed" })).code, None);
	}

	#[test]
	fn a_refused_request_reads_its_step_its_status_and_its_body() {
		let read = failure(json!({
			"kind": "failed",
			"detail": "the registration endpoint answered 403",
			"step": "registration",
			"status": 403,
			"body": "Forbidden"
		}));

		assert_eq!(read.kind, OauthFailureKind::Failed);
		assert_eq!(read.step, Some(OauthStep::Registration));
		assert_eq!(read.status, Some(403));
		assert_eq!(read.body.as_deref(), Some("Forbidden"));
	}

	#[test]
	fn a_step_no_request_of_the_flow_is_named_by_leaves_the_rest_readable() {
		for named in [json!("introspection"), json!(7), Value::Null] {
			let read = failure(json!({
				"kind": "rejected",
				"detail": "the token endpoint answered 400: invalid_grant",
				"step": named,
				"status": 400
			}));

			assert_eq!(read.kind, OauthFailureKind::Rejected);
			assert_eq!(read.step, None);
			assert_eq!(read.status, Some(400));
		}
	}

	#[test]
	fn a_failure_naming_no_refused_request_reads_no_step_no_status_and_no_body() {
		let read = failure(json!({ "kind": "failed", "detail": "no server url was named" }));

		assert_eq!(read.step, None);
		assert_eq!(read.status, None);
		assert_eq!(read.body, None);
	}

	#[test]
	fn each_step_the_sidecar_names_reads_as_the_step_of_its_own() {
		let step = |named| failure(json!({ "kind": "failed", "step": named })).step;

		assert_eq!(step("discovery"), Some(OauthStep::Discovery));
		assert_eq!(step("registration"), Some(OauthStep::Registration));
		assert_eq!(step("tokenExchange"), Some(OauthStep::TokenExchange));
	}
}
