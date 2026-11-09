use std::path::Path;
use std::sync::Arc;
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};

use reqwest::header::CONTENT_TYPE;
use reqwest::{Client, IntoUrl, StatusCode, Url};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::{Mutex, OwnedMutexGuard};

use super::authorship::{self, RelayedMember};
use super::reach::{self, Reach};
use super::Hosting;

use crate::account::session::{trimmed_to, DEVICE_NAME_LIMIT};
use crate::attachments;
use crate::avatars::Avatars;
use crate::db::repositories::space_children::SpaceChild;
use crate::db::{Database, DatabaseState};
use crate::file_store::FileStore;
use crate::host_api::files::{plain, ATTACHMENT_PATH, AVATAR_PATH};
use crate::host_api::invoke::{names_an_app_command, RELAYED_MEMBER_HEADER};
use crate::missions::github::installed_tls_provider;

const INVOKE_BOUND: Duration = Duration::from_secs(300);

const HOST_ONLY_REFUSAL: &str = "this command belongs to the host";

const OTHER_SPACE_REFUSAL: &str = "this command reaches outside the shared space";

const OTHER_PERSON_REFUSAL: &str = "this command reaches the main conversation of another person";

pub(crate) const SHARED_SPACE_COMMAND: &str = "relay_shared_space";

pub(crate) const AVATAR_COMMAND: &str = "relay_avatar";

const MAX_AVATAR_BYTES: u64 = 1024 * 1024;

const NO_AVATAR: &str = "no avatar of the shared space bears this name";

const AVATAR_TOO_LARGE: &str = "the avatar is too large to cross the relay";

const AVATAR_UNREAD: &str = "the avatar was not read";

pub(crate) const ATTACHMENT_COMMAND: &str = "relay_attachment";

const NO_ATTACHMENT: &str = "no attachment of the shared space bears this name";

const ATTACHMENT_TOO_LARGE: &str = "the attachment is too large to cross the relay";

const ATTACHMENT_UNREAD: &str = "the attachment was not read";

#[derive(Clone)]
pub struct LocalApi {
	origin: String,
	token: String,
	client: Client,
}

impl LocalApi {
	pub fn new(origin: String, token: String) -> Result<Self, String> {
		installed_tls_provider();
		let client = Client::builder()
			.timeout(INVOKE_BOUND)
			.build()
			.map_err(|error| format!("the local host api client could not be built: {error}"))?;
		Ok(Self { origin, token, client })
	}
}

#[derive(Debug, PartialEq)]
pub(super) struct MemberCall {
	id: Value,
	command: String,
	args: Value,
	sender: String,
	computer: Option<String>,
}

pub(super) fn member_call(text: &str, sender: &str) -> Result<MemberCall, String> {
	let frame: Value = serde_json::from_str(text).unwrap_or(Value::Null);
	let id = frame.get("id").filter(|id| id.is_string() || id.is_number()).cloned();
	let command = frame
		.get("command")
		.and_then(Value::as_str)
		.filter(|command| names_an_app_command(command));
	let args = match frame.get("args") {
		None => Some(Value::Object(Map::new())),
		Some(args) => Some(args.clone()).filter(Value::is_object),
	};
	match (id, command, args) {
		(Some(id), Some(command), Some(args)) if belongs_to_the_host(command, &args) => {
			Err(answer(id, StatusCode::FORBIDDEN, json!(HOST_ONLY_REFUSAL)))
		}
		(Some(id), Some(command), Some(args)) => Ok(MemberCall {
			id,
			command: command.to_owned(),
			args,
			sender: sender.to_owned(),
			computer: computer_of(&frame),
		}),
		(id, _, _) => Err(refused(id)),
	}
}

fn computer_of(frame: &Value) -> Option<String> {
	let named = frame.get("computer").and_then(Value::as_str)?;
	let flat = named
		.split(|character: char| character.is_whitespace() || character.is_control())
		.filter(|word| !word.is_empty())
		.collect::<Vec<_>>()
		.join(" ");
	Some(trimmed_to(&flat, DEVICE_NAME_LIMIT)).filter(|name| !name.is_empty())
}

#[derive(Debug, PartialEq)]
pub(super) struct AvatarCall {
	id: Value,
	file: String,
}

#[derive(Debug, PartialEq)]
pub(super) struct AttachmentCall {
	id: Value,
	conversation_id: String,
	file: String,
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct RelayedFile {
	pub(crate) content_type: String,
	base64: String,
}

impl RelayedFile {
	pub(super) fn of(content_type: String, bytes: &[u8]) -> Self {
		Self { content_type, base64: BASE64_STANDARD.encode(bytes) }
	}

	pub(crate) fn bytes(&self) -> Option<Vec<u8>> {
		BASE64_STANDARD.decode(&self.base64).ok()
	}
}

pub(super) fn avatar_call(text: &str) -> Option<Result<AvatarCall, String>> {
	let frame: Value = serde_json::from_str(text).ok()?;
	if frame.get("command").and_then(Value::as_str) != Some(AVATAR_COMMAND) {
		return None;
	}
	let id = frame.get("id").filter(|id| id.is_string() || id.is_number()).cloned();
	let file = frame.pointer("/args/file").and_then(Value::as_str);
	Some(match (id, file) {
		(Some(id), Some(file)) => Ok(AvatarCall { id, file: file.to_owned() }),
		(id, _) => Err(refused(id)),
	})
}

pub(super) fn attachment_call(text: &str) -> Option<Result<AttachmentCall, String>> {
	let frame: Value = serde_json::from_str(text).ok()?;
	if frame.get("command").and_then(Value::as_str) != Some(ATTACHMENT_COMMAND) {
		return None;
	}
	let id = frame.get("id").filter(|id| id.is_string() || id.is_number()).cloned();
	let conversation_id = frame.pointer("/args/conversationId").and_then(Value::as_str);
	let file = frame.pointer("/args/file").and_then(Value::as_str);
	Some(match (id, conversation_id, file) {
		(Some(id), Some(conversation_id), Some(file)) => Ok(AttachmentCall {
			id,
			conversation_id: conversation_id.to_owned(),
			file: file.to_owned(),
		}),
		(id, _, _) => Err(refused(id)),
	})
}

pub(super) fn shared_space_answer(text: &str, shared_space_id: &str) -> Option<String> {
	let frame: Value = serde_json::from_str(text).ok()?;
	if frame.get("command").and_then(Value::as_str) != Some(SHARED_SPACE_COMMAND) {
		return None;
	}
	let id = frame.get("id").filter(|id| id.is_string() || id.is_number())?.clone();
	Some(answer(id, StatusCode::OK, json!({ "spaceId": shared_space_id })))
}

pub(super) fn belongs_to_the_host(command: &str, args: &Value) -> bool {
	matches!(reach::reach_of(command), None | Some(Reach::HostOnly))
		|| (command.starts_with("plugin_") && args["scope"]["kind"] == "user")
}

pub(super) fn refused(id: Option<Value>) -> String {
	answer(
		id.unwrap_or(Value::Null),
		StatusCode::BAD_REQUEST,
		json!("a member frame is {\"id\", \"command\", \"args\"}"),
	)
}

pub(super) fn forwarded(frame: &str, epoch: &str, seq: u64) -> String {
	format!("{{\"event\":{frame},\"epoch\":\"{epoch}\",\"seq\":{seq}}}")
}

pub(super) fn replayed(frame: &str, epoch: &str, seq: u64, token: &str) -> String {
	let token = Value::from(token);
	format!("{{\"event\":{frame},\"epoch\":\"{epoch}\",\"seq\":{seq},\"token\":{token}}}")
}

pub(super) async fn bridged<R: Runtime>(
	app: AppHandle<R>,
	local: LocalApi,
	shared_space_id: String,
	call: MemberCall,
) -> String {
	let caller = authorship::person_of(&app, &call.sender);
	let reached = reach::stays_in_the_shared_space(
		&app,
		&shared_space_id,
		&caller,
		&call.command,
		&call.args,
	)
	.await;
	if let Err(refusal) = reached {
		log::warn!("{}", reach::refusal_line(&call.command, &shared_space_id, &refusal));
		let reason = match refusal {
			reach::Refusal::NotOwned { .. } => OTHER_PERSON_REFUSAL,
			_ => OTHER_SPACE_REFUSAL,
		};
		return answer(call.id, StatusCode::FORBIDDEN, json!(reason));
	}
	let hosting = app.state::<Hosting>();
	let member = RelayedMember {
		space_id: shared_space_id.clone(),
		user_id: call.sender.clone(),
		computer: call.computer.clone(),
	};
	let vouched = hosting.relayed.vouch(member);
	match invoked(&local, &call, &vouched.nonce).await {
		Ok((status, body)) => answer(call.id, status, body),
		Err(reason) => answer(call.id, StatusCode::BAD_GATEWAY, json!(reason)),
	}
}

async fn invoked(
	local: &LocalApi,
	call: &MemberCall,
	relayed_member: &str,
) -> Result<(StatusCode, Value), String> {
	let request = local
		.client
		.post(format!("{}/api/invoke/{}", local.origin, call.command))
		.bearer_auth(&local.token)
		.header(RELAYED_MEMBER_HEADER, relayed_member)
		.json(&call.args);
	let answered = request.send().await.map_err(|error| {
		format!("the local host api could not be reached: {}", error.without_url())
	})?;
	let status = answered.status();
	let body = answered
		.bytes()
		.await
		.map_err(|error| format!("the local host api answer was cut: {}", error.without_url()))?;
	Ok((status, body_of(&body)))
}

pub(super) struct FileAnswer {
	pub(super) frame: String,
	pub(super) turn: OwnedMutexGuard<()>,
}

pub(super) async fn avatar_bridged<R: Runtime>(
	app: AppHandle<R>,
	local: LocalApi,
	shared_space_id: String,
	turn: Arc<Mutex<()>>,
	call: AvatarCall,
) -> FileAnswer {
	let state = app.state::<DatabaseState>();
	let (Ok(database), Some(dir)) = (state.as_ref(), Avatars::dir(&app)) else {
		log::error!("a relayed avatar was not read: the database or the data directory is missing");
		let frame =
			answer(call.id, StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": AVATAR_UNREAD }));
		return FileAnswer { frame, turn: turn.lock_owned().await };
	};
	let ((status, body), turn) =
		relayed_avatar(database, &dir, &local, turn, shared_space_id, &call.file).await;
	FileAnswer { frame: answer(call.id, status, body), turn }
}

async fn relayed_avatar(
	database: &Database,
	dir: &Path,
	local: &LocalApi,
	turn: Arc<Mutex<()>>,
	shared_space_id: String,
	file: &str,
) -> ((StatusCode, Value), OwnedMutexGuard<()>) {
	let turn = turn.lock_owned().await;
	let recorded = dir.join(file).to_string_lossy().into_owned();
	let relayed = match database.space_children().holds_avatar(shared_space_id, recorded).await {
		Ok(true) => match fetched_avatar(local, file).await {
			Ok(answer) => answer,
			Err(reason) => (StatusCode::BAD_GATEWAY, json!({ "error": reason })),
		},
		Ok(false) => (StatusCode::NOT_FOUND, json!(NO_AVATAR)),
		Err(failure) => {
			log::warn!("a relayed avatar was not read: the avatar lookup failed: {failure:?}");
			(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": AVATAR_UNREAD }))
		}
	};
	(relayed, turn)
}

pub(super) async fn attachment_bridged<R: Runtime>(
	app: AppHandle<R>,
	local: LocalApi,
	shared_space_id: String,
	turn: Arc<Mutex<()>>,
	call: AttachmentCall,
) -> FileAnswer {
	let state = app.state::<DatabaseState>();
	let Ok(database) = state.as_ref() else {
		log::error!("a relayed attachment was not read: the database is missing");
		let frame = answer(
			call.id,
			StatusCode::INTERNAL_SERVER_ERROR,
			json!({ "error": ATTACHMENT_UNREAD }),
		);
		return FileAnswer { frame, turn: turn.lock_owned().await };
	};
	let ((status, body), turn) =
		relayed_attachment(database, &local, turn, shared_space_id, &call).await;
	FileAnswer { frame: answer(call.id, status, body), turn }
}

async fn relayed_attachment(
	database: &Database,
	local: &LocalApi,
	turn: Arc<Mutex<()>>,
	shared_space_id: String,
	call: &AttachmentCall,
) -> ((StatusCode, Value), OwnedMutexGuard<()>) {
	let turn = turn.lock_owned().await;
	if !plain(&call.conversation_id) || !plain(&call.file) {
		return ((StatusCode::NOT_FOUND, json!(NO_ATTACHMENT)), turn);
	}
	let conversation_id = call.conversation_id.clone();
	let held =
		database.space_children().holds(shared_space_id, SpaceChild::Conversation, conversation_id);
	let relayed = match held.await {
		Ok(true) => match fetched_attachment(local, call).await {
			Ok(answer) => answer,
			Err(reason) => (StatusCode::BAD_GATEWAY, json!({ "error": reason })),
		},
		Ok(false) => (StatusCode::NOT_FOUND, json!(NO_ATTACHMENT)),
		Err(failure) => {
			log::warn!(
				"a relayed attachment was not read: the conversation lookup failed: {failure:?}"
			);
			(StatusCode::INTERNAL_SERVER_ERROR, json!({ "error": ATTACHMENT_UNREAD }))
		}
	};
	(relayed, turn)
}

struct RelayCap {
	max_bytes: u64,
	too_large: &'static str,
}

const AVATAR_CAP: RelayCap = RelayCap { max_bytes: MAX_AVATAR_BYTES, too_large: AVATAR_TOO_LARGE };

const ATTACHMENT_CAP: RelayCap =
	RelayCap { max_bytes: attachments::MAX_BYTES, too_large: ATTACHMENT_TOO_LARGE };

async fn fetched_avatar(local: &LocalApi, file: &str) -> Result<(StatusCode, Value), String> {
	let url = format!("{}{}", local.origin, AVATAR_PATH.replace("{file}", file));
	fetched_file(local, url, &AVATAR_CAP).await
}

async fn fetched_attachment(
	local: &LocalApi,
	call: &AttachmentCall,
) -> Result<(StatusCode, Value), String> {
	let mut url = Url::parse(&local.origin)
		.map_err(|error| format!("the local host api origin is unusable: {error}"))?;
	let segments = ATTACHMENT_PATH.split('/').filter(|segment| !segment.is_empty()).map(
		|segment| match segment {
			"{conversation_id}" => call.conversation_id.as_str(),
			"{file}" => call.file.as_str(),
			literal => literal,
		},
	);
	url.path_segments_mut()
		.map_err(|()| "the local host api origin cannot hold a path".to_owned())?
		.pop_if_empty()
		.extend(segments);
	fetched_file(local, url, &ATTACHMENT_CAP).await
}

async fn fetched_file(
	local: &LocalApi,
	url: impl IntoUrl,
	cap: &RelayCap,
) -> Result<(StatusCode, Value), String> {
	let answered =
		local.client.get(url).bearer_auth(&local.token).send().await.map_err(|error| {
			format!("the local host api could not be reached: {}", error.without_url())
		})?;
	let status = answered.status();
	let is_too_large = answered.content_length().is_some_and(|length| length > cap.max_bytes);
	if status == StatusCode::OK && is_too_large {
		return Ok((StatusCode::PAYLOAD_TOO_LARGE, json!(cap.too_large)));
	}
	let content_type = answered
		.headers()
		.get(CONTENT_TYPE)
		.and_then(|content_type| content_type.to_str().ok())
		.map(str::to_owned);
	let body = answered
		.bytes()
		.await
		.map_err(|error| format!("the local host api answer was cut: {}", error.without_url()))?;
	if status != StatusCode::OK {
		return Ok((status, body_of(&body)));
	}
	if body.len() as u64 > cap.max_bytes {
		return Ok((StatusCode::PAYLOAD_TOO_LARGE, json!(cap.too_large)));
	}
	let content_type =
		content_type.ok_or("the local host api answered a file without a content type")?;
	Ok((StatusCode::OK, json!(RelayedFile::of(content_type, &body))))
}

fn body_of(body: &[u8]) -> Value {
	if body.is_empty() {
		return Value::Null;
	}
	serde_json::from_slice(body)
		.unwrap_or_else(|_| Value::String(String::from_utf8_lossy(body).into_owned()))
}

pub(super) fn answer(id: Value, status: StatusCode, body: Value) -> String {
	json!({ "id": id, "status": status.as_u16(), "body": body }).to_string()
}

#[cfg(test)]
mod tests {
	use std::path::Path;
	use std::sync::atomic::{AtomicUsize, Ordering};

	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	fn status_of(answer: &str) -> (Value, Value) {
		let answer: Value = serde_json::from_str(answer).expect("a json answer");
		(answer["id"].clone(), answer["status"].clone())
	}

	#[test]
	fn a_call_without_args_invokes_with_none() {
		assert_eq!(
			member_call(r#"{"id": 3, "command": "agent_models"}"#, "a1"),
			Ok(MemberCall {
				id: json!(3),
				command: "agent_models".to_owned(),
				args: json!({}),
				sender: "a1".to_owned(),
				computer: None,
			})
		);
	}

	#[test]
	fn a_call_carries_the_computer_the_member_named_trimmed_and_none_when_blank_or_absent() {
		let computer =
			|frame: Value| member_call(&frame.to_string(), "a1").map(|call| call.computer);

		assert_eq!(
			computer(json!({ "id": 1, "command": "agent_models", "computer": "  Studio  " })),
			Ok(Some("Studio".to_owned()))
		);
		assert_eq!(
			computer(json!({ "id": 2, "command": "agent_models", "computer": "  " })),
			Ok(None)
		);
		assert_eq!(
			computer(json!({ "id": 3, "command": "agent_models", "computer": 7 })),
			Ok(None)
		);
		assert_eq!(computer(json!({ "id": 4, "command": "agent_models" })), Ok(None));
		assert_eq!(
			computer(json!({ "id": 5, "command": "agent_models", "computer": "Stu\ndio\t x" })),
			Ok(Some("Stu dio x".to_owned()))
		);
		assert_eq!(
			computer(json!({ "id": 6, "command": "agent_models", "computer": "Stu\u{7}\r\ndio" })),
			Ok(Some("Stu dio".to_owned()))
		);
	}

	#[test]
	fn the_sender_is_the_roster_account_even_when_the_plaintext_carries_another_sender() {
		let sent = |frame: Value| member_call(&frame.to_string(), "roster").map(|call| call.sender);

		assert_eq!(
			sent(json!({ "id": 1, "command": "agent_models", "sender": { "accountId": "a1" } })),
			Ok("roster".to_owned())
		);
		assert_eq!(
			sent(json!({ "id": 2, "command": "agent_models", "from": "a2" })),
			Ok("roster".to_owned())
		);
	}

	#[test]
	fn the_shared_space_frame_is_answered_with_the_shared_space_and_others_are_left_alone() {
		assert_eq!(
			shared_space_answer(r#"{"id": 4, "command": "relay_shared_space"}"#, "s1")
				.map(|answer| serde_json::from_str::<Value>(&answer).expect("a json answer")),
			Some(json!({ "id": 4, "status": 200, "body": { "spaceId": "s1" } }))
		);
		assert_eq!(shared_space_answer(r#"{"id": 4, "command": "space_list"}"#, "s1"), None);
		assert_eq!(shared_space_answer(r#"{"command": "relay_shared_space"}"#, "s1"), None);
		assert_eq!(shared_space_answer("not json", "s1"), None);
	}

	#[test]
	fn a_frame_of_another_shape_is_refused_with_the_id_it_carried() {
		for (frame, id) in [
			("not json", Value::Null),
			(r#"{"command": "space_list"}"#, Value::Null),
			(r#"{"id": {}, "command": "space_list"}"#, Value::Null),
			(r#"{"id": "a", "command": "../events"}"#, json!("a")),
			(r#"{"id": "b", "command": "space_list", "args": [1]}"#, json!("b")),
			(r#"{"id": 9}"#, json!(9)),
		] {
			let refusal = member_call(frame, "a1").expect_err(frame);
			assert_eq!(status_of(&refusal), (id, json!(400)), "{frame}");
		}
	}

	#[test]
	fn a_member_command_of_the_host_or_one_left_unclassified_is_refused_with_403() {
		let host_only = reach::REACHES
			.iter()
			.filter(|(_, reach)| *reach == Reach::HostOnly)
			.map(|(command, _)| *command);
		for command in host_only.chain(["a_command_nobody_classified"]) {
			let frame = json!({ "id": "m", "command": command, "args": { "spaceId": "s" } });
			let refusal = member_call(&frame.to_string(), "a1").expect_err(command);
			assert_eq!(
				serde_json::from_str::<Value>(&refusal).expect("a json answer"),
				json!({ "id": "m", "status": 403, "body": HOST_ONLY_REFUSAL }),
				"{command}"
			);
		}
	}

	fn registered_commands() -> Vec<String> {
		let bindings = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-host-only-{}.ts", uuid::Uuid::new_v4())),
		);
		crate::commands::builder()
			.dangerously_cast_bigints_to_number()
			.export(specta_typescript::Typescript::default(), &bindings)
			.expect("the command surface exports");
		let surface = std::fs::read_to_string(&bindings).expect("the bindings read back");
		std::fs::remove_file(&bindings).expect("the bindings are cleaned up");
		surface
			.split("__TAURI_INVOKE")
			.skip(1)
			.filter_map(|invoked| invoked.split("(\"").nth(1)?.split('"').next())
			.map(str::to_owned)
			.collect()
	}

	#[test]
	fn the_reach_table_classifies_every_registered_command_once_and_nothing_else() {
		let mut registered = registered_commands();
		let mut classified: Vec<String> =
			reach::REACHES.iter().map(|(command, _)| (*command).to_owned()).collect();
		registered.sort();
		classified.sort();

		assert_eq!(classified, registered);
	}

	fn declared_event_name(line: &str) -> Option<&str> {
		let (declared, value) =
			line.trim_start_matches("pub ").strip_prefix("const ")?.split_once(": &str = \"")?;
		let is_an_event = declared.ends_with("_EVENT") || declared.ends_with("_CHANNEL");
		let name = value.strip_suffix("\";")?;
		(is_an_event && !name.contains(char::is_whitespace)).then_some(name)
	}

	#[test]
	fn the_audience_table_classifies_every_published_event_once_and_nothing_else() {
		let sources =
			crate::events::tests::rust_files(&Path::new(env!("CARGO_MANIFEST_DIR")).join("src"));
		let mut published: Vec<String> = sources
			.iter()
			.flat_map(|path| {
				let source = std::fs::read_to_string(path).expect("the file reads");
				source
					.lines()
					.filter_map(|line| declared_event_name(line.trim()))
					.map(str::to_owned)
					.collect::<Vec<_>>()
			})
			.collect();
		let mut classified: Vec<String> =
			reach::AUDIENCES.iter().map(|(event, _)| (*event).to_owned()).collect();
		published.sort();
		classified.sort();

		assert_eq!(classified, published);
	}

	#[test]
	fn an_event_name_is_read_from_its_constant_only() {
		assert_eq!(
			declared_event_name(r#"pub const CHANGED_EVENT: &str = "a://b";"#),
			Some("a://b")
		);
		assert_eq!(declared_event_name(r#"const EVENT_CHANNEL: &str = "a://c";"#), Some("a://c"));
		assert_eq!(declared_event_name(r#"const INSERT_EVENT: &str = "INSERT INTO x"#), None);
		assert_eq!(declared_event_name(r#"const LINK: &str = "a://d";"#), None);
	}

	#[test]
	fn a_plugin_command_on_the_host_person_plugin_is_refused_and_on_a_space_or_bot_forwarded() {
		let plugin_commands: Vec<String> = registered_commands()
			.into_iter()
			.filter(|command| command.starts_with("plugin_"))
			.collect();
		assert!(!plugin_commands.is_empty());

		for command in &plugin_commands {
			let person =
				json!({ "id": "m", "command": command, "args": { "scope": { "kind": "user" } } });
			let refusal = member_call(&person.to_string(), "a1").expect_err(command);
			assert_eq!(status_of(&refusal), (json!("m"), json!(403)), "{command}");
			for scope in
				[json!({ "kind": "space", "id": "s" }), json!({ "kind": "bot", "id": "b" })]
			{
				let frame = json!({ "id": "m", "command": command, "args": { "scope": scope } });
				assert!(member_call(&frame.to_string(), "a1").is_ok(), "{command} {scope}");
			}
		}
	}

	#[test]
	fn an_event_is_wrapped_untouched_beside_its_epoch_and_seq() {
		assert_eq!(
			forwarded(r#"{"event":"a://b","payload":1}"#, "e-1", 7),
			r#"{"event":{"event":"a://b","payload":1},"epoch":"e-1","seq":7}"#
		);
	}

	#[test]
	fn a_replayed_event_carries_the_resume_token_escaped() {
		assert_eq!(
			replayed(r#"{"event":"a://b","payload":1}"#, "e-1", 7, r#"t"1"#),
			r#"{"event":{"event":"a://b","payload":1},"epoch":"e-1","seq":7,"token":"t\"1"}"#
		);
	}

	#[test]
	fn a_body_that_is_not_json_crosses_as_its_text() {
		assert_eq!(body_of(b"no command bears this name"), json!("no command bears this name"));
		assert_eq!(body_of(b""), Value::Null);
		assert_eq!(body_of(br#"{"a":1}"#), json!({ "a": 1 }));
	}

	const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

	#[test]
	fn an_avatar_frame_is_read_apart_and_a_malformed_one_refused_with_its_id() {
		assert_eq!(
			avatar_call(r#"{"id": 5, "command": "relay_avatar", "args": {"file": "a.png"}}"#),
			Some(Ok(AvatarCall { id: json!(5), file: "a.png".to_owned() }))
		);
		let refusal = avatar_call(r#"{"id": 6, "command": "relay_avatar", "args": {}}"#)
			.expect("an avatar frame")
			.expect_err("no file");
		assert_eq!(status_of(&refusal), (json!(6), json!(400)));
		assert_eq!(avatar_call(r#"{"id": 7, "command": "space_list"}"#), None);
		assert_eq!(avatar_call("not json"), None);
	}

	#[test]
	fn an_attachment_frame_is_read_apart_and_a_malformed_one_refused_with_its_id() {
		assert_eq!(
			attachment_call(
				r#"{"id": 5, "command": "relay_attachment", "args": {"conversationId": "c1", "file": "a.pdf"}}"#
			),
			Some(Ok(AttachmentCall {
				id: json!(5),
				conversation_id: "c1".to_owned(),
				file: "a.pdf".to_owned()
			}))
		);
		for args in [r#"{"file": "a.pdf"}"#, r#"{"conversationId": "c1"}"#] {
			let frame = format!(r#"{{"id": 6, "command": "relay_attachment", "args": {args}}}"#);
			let refusal =
				attachment_call(&frame).expect("an attachment frame").expect_err("a missing arg");
			assert_eq!(status_of(&refusal), (json!(6), json!(400)), "{args}");
		}
		assert_eq!(attachment_call(r#"{"id": 7, "command": "relay_avatar"}"#), None);
		assert_eq!(attachment_call("not json"), None);
	}

	#[test]
	fn a_relayed_avatar_gives_back_the_bytes_it_carried_and_nothing_from_bad_base64() {
		let bytes: Vec<u8> = (0..=u8::MAX).collect();
		let relayed = RelayedFile::of("image/png".to_owned(), &bytes);

		assert_eq!(relayed.bytes(), Some(bytes));
		for base64 in ["A", "!!!!", "iVBORw0KGgo"] {
			let broken =
				RelayedFile { content_type: "image/png".to_owned(), base64: base64.to_owned() };
			assert_eq!(broken.bytes(), None, "{base64}");
		}
	}

	#[derive(Default)]
	struct Reads {
		started: AtomicUsize,
		in_flight: AtomicUsize,
		peak: AtomicUsize,
		turn: std::sync::Mutex<Option<Arc<Mutex<()>>>>,
		outside_the_turn: AtomicUsize,
		asked: std::sync::Mutex<Vec<(String, String)>>,
	}

	impl Reads {
		fn counted(&self) {
			self.started.fetch_add(1, Ordering::SeqCst);
			let in_flight = self.in_flight.fetch_add(1, Ordering::SeqCst) + 1;
			self.peak.fetch_max(in_flight, Ordering::SeqCst);
			let turn = self.turn.lock().expect("the reads").clone();
			if turn.is_some_and(|turn| turn.try_lock().is_ok()) {
				self.outside_the_turn.fetch_add(1, Ordering::SeqCst);
			}
			self.in_flight.fetch_sub(1, Ordering::SeqCst);
		}
	}

	struct FakeLocalApi {
		local: LocalApi,
		reads: Arc<Reads>,
	}

	async fn a_local_api() -> FakeLocalApi {
		use std::future::IntoFuture as _;

		use axum::extract::Path as Segment;
		use axum::response::IntoResponse;

		let reads = Arc::new(Reads::default());
		let counted = reads.clone();
		let asked = reads.clone();
		let router = axum::Router::new()
			.route(
				AVATAR_PATH,
				axum::routing::get(move |Segment(file): Segment<String>| async move {
					counted.counted();
					let png = [(axum::http::header::CONTENT_TYPE, "image/png")];
					let max = MAX_AVATAR_BYTES as usize;
					match file.as_str() {
						"held.png" | "also.png" | "third.png" => {
							(png, PNG.to_vec()).into_response()
						}
						"max.png" => (png, vec![0; max]).into_response(),
						"huge.png" => (png, vec![0; max + 1]).into_response(),
						_ => (axum::http::StatusCode::NOT_FOUND, "no file answers this path")
							.into_response(),
					}
				}),
			)
			.route(
				ATTACHMENT_PATH,
				axum::routing::get(
					move |Segment((conversation_id, file)): Segment<(String, String)>| async move {
						asked
							.asked
							.lock()
							.expect("the reads")
							.push((conversation_id, file.clone()));
						let max = attachments::MAX_BYTES as usize;
						let typed =
							|content_type| [(axum::http::header::CONTENT_TYPE, content_type)];
						match file.as_str() {
							"brief.pdf" => {
								(typed("application/pdf"), BRIEF.to_vec()).into_response()
							}
							"max.bin" => (typed(BYTES), vec![0; max]).into_response(),
							"huge.bin" => (typed(BYTES), vec![0; max + 1]).into_response(),
							_ => (axum::http::StatusCode::NOT_FOUND, "no file answers this path")
								.into_response(),
						}
					},
				),
			);
		let listener =
			tokio::net::TcpListener::bind("127.0.0.1:0").await.expect("the fake api binds");
		let origin = format!("http://{}", listener.local_addr().expect("an address"));
		tokio::spawn(axum::serve(listener, router).into_future());
		let local = LocalApi::new(origin, "local-token".to_owned()).expect("a client");
		FakeLocalApi { local, reads }
	}

	async fn a_bot_wearing(database: &Database, space_id: &str, avatar: &Path) {
		let identity = crate::db::repositories::conversations::BotIdentity {
			name: "Wearer".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: Some(avatar.to_string_lossy().into_owned()),
			instructions: "Answer briefly.".to_owned(),
			denied_tools: Vec::new(),
			effort: None,
		};
		database
			.conversations()
			.create_bot(identity, Some(space_id.to_owned()), None)
			.await
			.expect("the bot is created");
	}

	#[tokio::test]
	async fn an_avatar_crosses_only_when_a_companion_of_the_space_wears_it_and_it_fits() {
		let database_dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&database_dir);
		let shared = database.spaces().create("Shared".to_owned()).await.expect("a space").id;
		let other = database.spaces().create("Other".to_owned()).await.expect("a space").id;
		let dir = Path::new("/avatars");
		for held in ["held.png", "max.png", "huge.png", "gone.png"] {
			a_bot_wearing(&database, &shared, &dir.join(held)).await;
		}
		a_bot_wearing(&database, &other, &dir.join("foreign.png")).await;
		let api = a_local_api().await;
		let turn = Arc::new(Mutex::new(()));
		let relayed = |file: &'static str| {
			let answered =
				relayed_avatar(&database, dir, &api.local, turn.clone(), shared.clone(), file);
			async { answered.await.0 }
		};

		let (status, body) = relayed("held.png").await;
		assert_eq!(status, StatusCode::OK);
		let avatar: RelayedFile = serde_json::from_value(body).expect("a relayed avatar");
		assert_eq!(
			(avatar.content_type.as_str(), avatar.bytes()),
			("image/png", Some(PNG.to_vec()))
		);

		assert_eq!(relayed("max.png").await.0, StatusCode::OK);
		assert_eq!(
			relayed("huge.png").await,
			(StatusCode::PAYLOAD_TOO_LARGE, json!(AVATAR_TOO_LARGE))
		);
		assert_eq!(relayed("gone.png").await.0, StatusCode::NOT_FOUND);
		let reads_before_refusals = api.reads.started.load(Ordering::SeqCst);

		for refused in ["foreign.png", "unknown.png", "../held.png"] {
			assert_eq!(
				relayed(refused).await,
				(StatusCode::NOT_FOUND, json!(NO_AVATAR)),
				"{refused}"
			);
		}
		assert_eq!(api.reads.started.load(Ordering::SeqCst), reads_before_refusals);
	}

	const BRIEF: &[u8] = b"%PDF-1.7 the brief";

	const BYTES: &str = "application/octet-stream";

	async fn a_conversation_in(database: &Database, id: &'static str, space_id: &str) {
		let space_id = space_id.to_owned();
		database
			.call_mut(move |connection| {
				Ok(connection.execute(
					"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
						VALUES (?1, 'topic', ?2, 'Talk', 1, 1)",
					rusqlite::params![id, space_id],
				)?)
			})
			.await
			.expect("the conversation is planted");
	}

	fn an_attachment(conversation_id: &str, file: &str) -> AttachmentCall {
		AttachmentCall {
			id: json!(1),
			conversation_id: conversation_id.to_owned(),
			file: file.to_owned(),
		}
	}

	#[tokio::test]
	async fn an_attachment_crosses_only_when_its_conversation_is_of_the_space_and_stays_in_it() {
		let database_dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&database_dir);
		let shared = database.spaces().create("Shared".to_owned()).await.expect("a space").id;
		let other = database.spaces().create("Other".to_owned()).await.expect("a space").id;
		a_conversation_in(&database, "c-shared", &shared).await;
		a_conversation_in(&database, "c-other", &other).await;
		let api = a_local_api().await;
		let turn = Arc::new(Mutex::new(()));
		let relayed = |conversation_id: &'static str, file: &'static str| {
			let call = an_attachment(conversation_id, file);
			let local = api.local.clone();
			let (database, turn, shared) = (&database, turn.clone(), shared.clone());
			async move { relayed_attachment(database, &local, turn, shared, &call).await.0 }
		};

		let (status, body) = relayed("c-shared", "brief.pdf").await;
		assert_eq!(status, StatusCode::OK);
		let brief: RelayedFile = serde_json::from_value(body).expect("a relayed file");
		assert_eq!(
			(brief.content_type.as_str(), brief.bytes()),
			("application/pdf", Some(BRIEF.to_vec()))
		);
		assert_eq!(relayed("c-shared", "max.bin").await.0, StatusCode::OK);
		assert_eq!(
			relayed("c-shared", "huge.bin").await,
			(StatusCode::PAYLOAD_TOO_LARGE, json!(ATTACHMENT_TOO_LARGE))
		);
		assert_eq!(relayed("c-shared", "%2e%2e").await.0, StatusCode::NOT_FOUND);
		let asked_before_refusals = api.reads.asked.lock().expect("the reads").clone();
		assert_eq!(
			asked_before_refusals.last(),
			Some(&("c-shared".to_owned(), "%2e%2e".to_owned()))
		);

		for (conversation_id, file) in [
			("c-other", "brief.pdf"),
			("c-none", "brief.pdf"),
			("..", "brief.pdf"),
			("../c-shared", "brief.pdf"),
			("c-shared", ".."),
			("c-shared", "."),
			("c-shared", ""),
			("c-shared", "../c-other/brief.pdf"),
			("c-shared", "..\\brief.pdf"),
		] {
			assert_eq!(
				relayed(conversation_id, file).await,
				(StatusCode::NOT_FOUND, json!(NO_ATTACHMENT)),
				"{conversation_id} {file}"
			);
		}
		assert_eq!(*api.reads.asked.lock().expect("the reads"), asked_before_refusals);
	}

	#[tokio::test]
	async fn avatars_asked_at_once_are_read_one_at_a_time_and_all_answered() {
		let database_dir = crate::db::connection::temp_dir();
		let database = crate::db::open(&database_dir);
		let shared = database.spaces().create("Shared".to_owned()).await.expect("a space").id;
		let dir = Path::new("/avatars");
		let files = ["held.png", "also.png", "third.png"];
		for file in files {
			a_bot_wearing(&database, &shared, &dir.join(file)).await;
		}
		let api = a_local_api().await;
		let turn = Arc::new(Mutex::new(()));
		*api.reads.turn.lock().expect("the reads") = Some(turn.clone());

		let statuses = futures_util::future::join_all(files.map(|file| {
			let answered =
				relayed_avatar(&database, dir, &api.local, turn.clone(), shared.clone(), file);
			async {
				let ((status, _), _sent) = answered.await;
				status
			}
		}))
		.await;

		assert_eq!(statuses, [StatusCode::OK; 3]);
		assert_eq!(api.reads.started.load(Ordering::SeqCst), 3);
		assert_eq!(api.reads.peak.load(Ordering::SeqCst), 1);
		assert_eq!(api.reads.outside_the_turn.load(Ordering::SeqCst), 0);
	}
}
