use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use kiroshi_app::agent::contract::OfferedModel;
use kiroshi_app::agent::protocol::{
	listed, Authorized, Checked, ContentBlock, ContentDelta, ControlRequestBody, Envelope, Frame,
	OauthFailureKind, OauthStarted, OauthStep, Ready, Revoked, SignInFailureKind, SignedIn,
	StreamEvent, Titled,
};
use kiroshi_app::bundles;
use kiroshi_app::bundles::EffortLevel;
use kiroshi_app::routines::sources::stacked;
use serde::Serialize;
use serde_json::{json, Value};

const REWRITE: &str = "bun run snapshots";

const FRAMES: &str = "sidecar-frames.ndjson";

const COMMANDS: &str = "host-commands.ndjson";

const LAYERS_SNAPSHOT: &str = "plugin-layers.rust.json";

const LAYERS: [&str; 4] = ["system", "user", "space", "companion"];

fn contracts() -> PathBuf {
	PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../contracts")
}

fn lines(name: &str) -> Vec<Value> {
	let path = contracts().join(name);
	let text = std::fs::read_to_string(&path)
		.unwrap_or_else(|error| panic!("{} reads: {error}", path.display()));
	text.lines()
		.filter(|line| !line.trim().is_empty())
		.map(|line| serde_json::from_str(line).expect("every line of the file is json"))
		.collect()
}

fn named(value: &Value) -> String {
	value
		.get("frame")
		.unwrap_or(value)
		.get("type")
		.and_then(Value::as_str)
		.expect("every line names a type")
		.to_owned()
}

fn read<T: serde::de::DeserializeOwned>(value: Value) -> T {
	serde_json::from_value(value).expect("the line reads as the type the host parses it with")
}

fn delta_name(delta: ContentDelta) -> &'static str {
	match delta {
		ContentDelta::TextDelta { text } => {
			assert_eq!(text, "The release note is ");
			"content_block_delta/text_delta"
		}
		ContentDelta::Ignored => "content_block_delta/ignored",
	}
}

fn block_name(block: ContentBlock) -> &'static str {
	match block {
		ContentBlock::Text { text } => {
			assert_eq!(text, "Reading the release note.");
			"content_block/text"
		}
		ContentBlock::ToolUse { id, name, input } => {
			assert_eq!(id, "toolu-0001");
			assert_eq!(name, "Read");
			assert_eq!(input, json!({ "file_path": "/workspace/space/README.md" }));
			"content_block/tool_use"
		}
		ContentBlock::ToolResult { tool_use_id, is_error } => {
			assert_eq!(tool_use_id, "toolu-0001");
			assert!(is_error);
			"content_block/tool_result"
		}
		ContentBlock::Ignored => "content_block/ignored",
	}
}

fn event_name(event: StreamEvent) -> Vec<&'static str> {
	match event {
		StreamEvent::MessageStart { message } => {
			assert_eq!(message.and_then(|header| header.id).as_deref(), Some("msg-0001"));
			vec!["stream_event/message_start"]
		}
		StreamEvent::ContentBlockStart { content_block } => {
			let block = content_block.expect("the start carries its block");
			vec!["stream_event/content_block_start", block_name(block)]
		}
		StreamEvent::ContentBlockDelta { delta } => {
			vec![delta_name(delta.expect("the delta is carried"))]
		}
		StreamEvent::Ignored => vec!["stream_event/ignored"],
	}
}

fn request_name(request: ControlRequestBody) -> &'static str {
	match request {
		ControlRequestBody::CanUseTool { tool_name, display_name, description, input } => {
			assert_eq!(tool_name, "Read");
			assert_eq!(display_name.as_deref(), Some("Read a file"));
			assert_eq!(description.as_deref(), Some("Read the file the agent named"));
			assert_eq!(input, json!({ "file_path": "/workspace/space/README.md" }));
			"control_request/can_use_tool"
		}
		ControlRequestBody::Ignored => "control_request/ignored",
	}
}

fn frame_names(frame: Frame) -> Vec<&'static str> {
	match frame {
		Frame::Opened => vec!["opened"],
		Frame::Closed(held) => {
			assert_eq!(held.detail.as_deref(), Some("the query ended"));
			vec!["closed"]
		}
		Frame::System(held) => {
			assert_eq!(held.subtype.as_deref(), Some("init"));
			assert_eq!(held.session_id.as_deref(), Some("sdk-0001"));
			vec!["system"]
		}
		Frame::StreamEvent(held) => event_name(held.event.expect("the frame carries its event")),
		Frame::Assistant(held) => {
			let body = held.message.expect("the assistant frame carries its message");
			assert_eq!(body.id.as_deref(), Some("msg-0001"));
			let mut names = vec!["assistant"];
			names.extend(body.content.into_iter().map(block_name));
			names
		}
		Frame::User(held) => {
			let body = held.message.expect("the user frame carries its message");
			assert_eq!(body.id.as_deref(), Some("msg-0002"));
			let mut names = vec!["user"];
			names.extend(body.content.into_iter().map(block_name));
			names
		}
		Frame::Result(held) => {
			assert_eq!(held.subtype.as_deref(), Some("success"));
			assert_eq!(held.session_id.as_deref(), Some("sdk-0001"));
			assert!(!held.is_error);
			assert_eq!(
				held.structured_output,
				Some(json!({ "summary": "the release note is drafted" }))
			);
			assert_eq!(held.total_cost_usd, Some(0.0412));
			assert_eq!(
				held.model_usage,
				Some(json!({ "claude-sonnet-4-5": { "inputTokens": 1200, "outputTokens": 340 } }))
			);
			vec!["result"]
		}
		Frame::Commands(held) => {
			assert_eq!(held.commands.len(), 1);
			assert_eq!(held.commands[0].name, "review");
			assert_eq!(
				held.commands[0].description.as_deref(),
				Some("Review the diff of the working tree")
			);
			vec!["commands"]
		}
		Frame::ControlRequest(held) => {
			assert!(held.request_id.starts_with("req-"));
			vec!["control_request", request_name(held.request)]
		}
		Frame::HostRequest(held) => {
			assert_eq!(held.request_id, "host-0001");
			assert_eq!(held.request["subtype"], json!("routine"));
			assert_eq!(held.request["operation"], json!("create"));
			assert_eq!(held.request["payload"], json!({ "title": "Morning report" }));
			vec!["host_request"]
		}
		Frame::ControlResponse(held) => {
			assert_eq!(held.response.subtype.as_deref(), Some("error"));
			assert_eq!(held.response.request_id.as_deref(), Some("req-0001"));
			assert_eq!(
				held.response.error.as_deref(),
				Some("the session no longer holds that request")
			);
			vec!["control_response"]
		}
		Frame::SettingsRejected(held) => {
			assert_eq!(
				held.detail.as_deref(),
				Some("bypassPermissions is refused, this session opens under auto.")
			);
			vec!["settings_rejected"]
		}
		Frame::ServerEnvRejected(held) => {
			assert_eq!(held.detail.as_deref(), Some("clock was left out for want of CLOCK_URL"));
			vec!["server_env_rejected"]
		}
		Frame::Ignored => vec!["ignored"],
	}
}

fn sessionless_name(value: Value) -> String {
	let kind = named(&value);
	match kind.as_str() {
		"ready" => {
			let held: Ready = read(value);
			assert_eq!(held.provider, "claude");
			assert_eq!(held.version, "2.1.237");
			assert_eq!(held.sdk_version.as_deref(), Some("0.3.237"));
			assert!(held.capabilities.contains(&"partialMessages".to_owned()));
		}
		"check" => {
			let held: Checked = read(value);
			assert!(held.authenticated);
			assert_eq!(held.auth_method.as_deref(), Some("oauth"));
			assert_eq!(held.detail.as_deref(), Some("the probe answered"));
			let account = held.account.expect("the report carries its account");
			assert_eq!(account.email.as_deref(), Some("someone@example.test"));
			assert_eq!(account.plan.as_deref(), Some("max"));
		}
		"models" => {
			assert_eq!(
				listed::<OfferedModel>("models", value).expect("the catalogue reads"),
				[
					OfferedModel {
						value: "claude-sonnet-4-5".to_owned(),
						supported_effort_levels: vec![
							EffortLevel::Low,
							EffortLevel::Medium,
							EffortLevel::High
						],
					},
					OfferedModel {
						value: "claude-opus-4-1".to_owned(),
						supported_effort_levels: Vec::new(),
					},
				]
			);
		}
		"tools" => {
			assert_eq!(
				listed::<String>("tools", value).expect("the catalogue reads"),
				["Read", "Write", "WebFetch"]
			);
		}
		"title" => {
			let held: Titled = read(value);
			assert_eq!(held.title.as_deref(), Some("The release note of 0.21.2"));
			assert_eq!(held.icon.as_deref(), Some("Rocket"));
		}
		"sign_in" => {
			let held: SignedIn = read(value);
			assert!(!held.signed_in);
			let failure = held.error.expect("the refusal carries its reason");
			assert_eq!(failure.kind, SignInFailureKind::TimedOut);
			assert_eq!(failure.detail.as_deref(), Some("the child outlasted its deadline"));
		}
		"sign_in_started" | "oauth_started" => {
			let held: OauthStarted = read(value);
			assert!(held.url.starts_with("https://"));
		}
		"mcp_oauth_authorize" => {
			let held: Authorized = read(value);
			let granted = held.credentials.expect("the grant is carried");
			assert_eq!(granted.access_token, "<redacted>");
			assert_eq!(granted.refresh_token.as_deref(), Some("<redacted>"));
			assert_eq!(granted.expires_at, Some(1_758_326_400_000));
			assert_eq!(granted.client_id, "registered");
			assert_eq!(granted.client_secret.as_deref(), Some("<redacted>"));
			assert_eq!(
				granted.redirect_uri.as_deref(),
				Some("http://127.0.0.1:53682/oauth/callback")
			);
			assert!(held.error.is_none());
		}
		"mcp_oauth_refresh" => {
			let held: Authorized = read(value);
			assert!(held.credentials.is_none());
			let failure = held.error.expect("the refusal is carried");
			assert_eq!(failure.kind, OauthFailureKind::Rejected);
			assert_eq!(
				failure.detail.as_deref(),
				Some("the token endpoint answered 400: invalid_grant")
			);
			assert_eq!(failure.step, Some(OauthStep::TokenExchange));
			assert_eq!(failure.status, Some(400));
			assert_eq!(failure.body.as_deref(), Some("the grant is no longer accepted"));
			assert!(failure.refuses_the_grant());
		}
		"mcp_oauth_revoke" => {
			let held: Revoked = read(value);
			assert!(held.revoked);
			assert_eq!(
				held.detail.as_deref(),
				Some("both tokens were posted to the revocation endpoint")
			);
		}
		"unreadable" => {}
		other => panic!("{FRAMES} carries {other}, which no host type reads"),
	}
	kind
}

#[test]
fn every_frame_the_sidecar_sends_reads_as_the_variant_the_host_matches() {
	let mut read_as: BTreeSet<String> = BTreeSet::new();
	for line in lines(FRAMES) {
		if line.get("session").is_none() {
			read_as.insert(sessionless_name(line));
			continue;
		}
		let envelope: Envelope = read(line);
		assert_eq!(envelope.session, "k1");
		read_as.extend(frame_names(read(envelope.frame)).into_iter().map(str::to_owned));
	}

	assert_eq!(
		read_as,
		BTreeSet::from(
			[
				"assistant",
				"check",
				"closed",
				"commands",
				"content_block/ignored",
				"content_block/text",
				"content_block/tool_result",
				"content_block/tool_use",
				"content_block_delta/ignored",
				"content_block_delta/text_delta",
				"control_request",
				"control_request/can_use_tool",
				"control_request/ignored",
				"control_response",
				"host_request",
				"ignored",
				"mcp_oauth_authorize",
				"mcp_oauth_refresh",
				"mcp_oauth_revoke",
				"models",
				"opened",
				"ready",
				"result",
				"server_env_rejected",
				"settings_rejected",
				"sign_in",
				"sign_in_started",
				"oauth_started",
				"stream_event/content_block_start",
				"stream_event/ignored",
				"stream_event/message_start",
				"system",
				"title",
				"tools",
				"unreadable",
				"user",
			]
			.map(str::to_owned)
		),
		"{FRAMES} carries one line per variant the host matches"
	);
}

fn fenced_json(text: &str) -> String {
	let mut held = String::new();
	let mut inside = false;
	for line in text.lines() {
		if line.trim_end() == "```json" {
			inside = true;
			continue;
		}
		if line.starts_with("```") {
			inside = false;
			continue;
		}
		if inside {
			held.push_str(line);
			held.push('\n');
		}
	}
	held
}

fn typed_names(text: &str) -> BTreeSet<String> {
	const KEY: &str = "\"type\":";
	let mut names = BTreeSet::new();
	let mut rest = text;
	while let Some(at) = rest.find(KEY) {
		rest = &rest[at + KEY.len()..];
		let Some(quoted) = rest.trim_start().strip_prefix('"') else {
			continue;
		};
		if let Some(end) = quoted.find('"') {
			names.insert(quoted[..end].to_owned());
		}
	}
	names
}

#[test]
fn the_protocol_document_names_every_message_of_both_contract_files() {
	let protocol = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("src/agent/PROTOCOL.md");
	let documented =
		typed_names(&fenced_json(&std::fs::read_to_string(&protocol).expect("PROTOCOL.md reads")));
	let committed: BTreeSet<String> =
		[FRAMES, COMMANDS].iter().flat_map(|file| lines(file)).map(|line| named(&line)).collect();

	let undocumented: Vec<&String> = committed.difference(&documented).collect();
	assert!(undocumented.is_empty(), "no fenced json block of PROTOCOL.md names {undocumented:?}");

	let uncommitted: Vec<&String> = documented.difference(&committed).collect();
	assert!(
		uncommitted.is_empty(),
		"PROTOCOL.md names {uncommitted:?}, which neither {FRAMES} nor {COMMANDS} carries"
	);
}

fn rendered(value: &Value) -> String {
	let mut buffer = Vec::new();
	let formatter = serde_json::ser::PrettyFormatter::with_indent(b"\t");
	let mut serializer = serde_json::Serializer::with_formatter(&mut buffer, formatter);
	value.serialize(&mut serializer).expect("the snapshot renders");
	format!("{}\n", String::from_utf8(buffer).expect("the snapshot is utf8"))
}

fn frozen(name: &str, live: &Value) {
	let path = contracts().join(name);
	let written = rendered(live);
	if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
		std::fs::write(&path, &written).expect("the snapshot is written");
		return;
	}
	let held = std::fs::read_to_string(&path).expect("the snapshot reads");
	assert_eq!(held, written, "{name} differs from the live readers, rewrite it with `{REWRITE}`");
}

fn layer_root() -> PathBuf {
	contracts().join("plugin-layers")
}

fn layer_reading(root: &Path, layer: &str) -> Value {
	let generated = bundles::generated(root, layer).expect("the layer carries its agent file");
	json!({
		"frontmatterDenials": generated.denied_tools,
		"outputStyle": bundles::output_style(root, layer),
		"permissions": bundles::permissions(root, layer),
	})
}

#[test]
fn the_plugin_readers_extract_what_the_snapshot_holds() {
	let root = layer_root();
	let layers: serde_json::Map<String, Value> =
		LAYERS.iter().map(|layer| ((*layer).to_owned(), layer_reading(&root, layer))).collect();
	let layered: Vec<PathBuf> = LAYERS
		.iter()
		.map(|layer| bundles::dir(&root, layer).expect("the bundle is held"))
		.collect();
	let sources = stacked(&layered).expect("every layer declares readable sources");

	frozen(LAYERS_SNAPSHOT, &json!({ "layers": layers, "triggerSources": sources }));
}
