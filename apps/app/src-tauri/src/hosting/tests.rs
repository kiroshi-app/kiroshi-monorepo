use std::collections::{HashSet, VecDeque};
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Path, RawQuery, State as Served};
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::{delete, get, patch, post};
use axum::Router;
use base64::prelude::{Engine as _, BASE64_STANDARD, BASE64_URL_SAFE_NO_PAD};
use serde_json::{json, Value};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{Listener, Manager, WebviewWindow, WebviewWindowBuilder};
use tokio::net::TcpListener;
use tokio::sync::{mpsc, watch};

use super::authorship::Caller;
use super::bridge::{belongs_to_the_host, LocalApi};
use super::contract::{AccountDevices, RosterDevice};
use super::contract::{
	HostingFailureKind, HostingState, InvitationState, Member, MemberStatus, MembersError,
	SpaceInvitation, SpaceMembers, TransportFailure, UnreachableReason, CHANGED_EVENT,
	MEMBERS_CHANGED_EVENT,
};
use super::devices::{devices, remove_device};
use super::members::{invite, invite_again, list, remove, resend, withdraw};
use super::reach;
use super::replay::{RESUME_COMMAND, RING_FRAMES};
use super::roster::SignedRow;
use super::sealing_member::{
	host_frame_opened, space_key_of, verified_set, HostFrame, SealingMember, Space,
};
use super::wire::{host_keys, HELLO};
use super::{opening, renamed, resumed, signed_out, start, stop, Hosting, Opening};
use crate::account::contract::SignedOutReason;
use crate::account::contract::{AccountState, CHANGED_EVENT as ACCOUNT_CHANGED_EVENT};
use crate::account::session::restore;
use crate::account::session::{sign_out, AccountSession};
use crate::agent::commands;
use crate::agent::contract as agent;
use crate::agent::protocol::OauthCredentials;
use crate::agent::protocol::SpaceMember;
use crate::agent::reply_writer::TurnSink;
use crate::bundles::{self, BotPermissions, DEFAULT_OUTPUT_STYLE};
use crate::companions::contract::{
	CREATED_EVENT as COMPANION_CREATED_EVENT, DELETED_EVENT as COMPANION_DELETED_EVENT,
	UPDATED_EVENT as COMPANION_UPDATED_EVENT,
};
use crate::conversations::commands::{
	conversation_add_participant, conversation_append_user_message, conversation_create,
	conversation_create_bot_from_draft, conversation_delete, conversation_delete_bot,
	conversation_duplicate_bot, conversation_page, conversation_remove_participant,
	conversation_send_user_message, conversation_set_lead, conversation_update,
	conversation_update_bot,
};
use crate::conversations::contract::{
	AvatarBlot, Bot, BotDraft, BotIdentity, Conversation, ConversationInPage, LastWord,
	NewUserMessage, ObservedState, ParticipantRole, TranscriptStoreError, WrittenFrom,
	CREATED_EVENT as CONVERSATION_CREATED_EVENT, DELETED_EVENT as CONVERSATION_DELETED_EVENT,
	MESSAGE_STORED_EVENT, STATE_CHANGED_EVENT, UPDATED_EVENT as CONVERSATION_UPDATED_EVENT,
};
use crate::conversations::state as conversation_state;
use crate::conversations::turn_run_deadline::{arm_start_deadlines, TurnRunDeadlines};
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::{verify, DeviceKeys};
use crate::crypto::error::CryptoError;
use crate::crypto::frame::CHALLENGE_LENGTH;
use crate::crypto::space_key::HeldSpaceKey;
use crate::db::connection::temp_dir;
use crate::db::repositories::conversations::{a_pending_prompt, PromptKind};
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::db::repositories::messages::{EndedRun, MessagePageQuery, MessageRole, NewTurn};
use crate::db::{self, DatabaseState};
use crate::environment::commands::{env_list, writable_root};
use crate::environment::connection;
use crate::environment::contract::{ConnectionKind, EnvError, EnvOwner, EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::events::{self, Event, BUFFERED_FRAMES};
use crate::joined_spaces::contract::JoinedSpaceConnection;
use crate::joined_spaces::relay::RelayGuests;
use crate::logging::contract::InstallKind;
use crate::mcp_oauth::asking::AuthorizationAnswers;
use crate::mcp_oauth::commands::{mcp_application_status, McpOauthState};
use crate::mcp_oauth::credentials;
use crate::mcp_oauth::reports::ApplicationReports;
use crate::removed_on_drop::RemovedOnDrop;
use crate::routines::commands::CHANGED_EVENT as ROUTINE_CHANGED_EVENT;
use crate::routines::webhook::{self, Webhook};
use crate::search::contract::{CatalogueScope, MessageSearchQuery};
use crate::spaces::commands::{
	bot_add_to_space, bot_move_to_space, bot_remove_from_space, space_delete, space_update,
};
use crate::spaces::contract::{Space as SpaceShown, SpaceError};
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
use crate::test_log::{capturing, warnings_naming};

const BEARER: &str = "bearer-that-never-leaves";
const LOCAL_TOKEN: &str = "host-token-of-the-loopback";
const PERSONAL: &str = "personal";
const JOINED_SPACE_TOKEN: &str = "joined-space-token-of-the-host";
const INVOKE_ROUTE: &str = "/api/invoke/{command}";
const PATIENCE: Duration = Duration::from_secs(60);
const OWNER_EMAIL: &str = "owner@example.com";
const POLL_EVERY: Duration = Duration::from_millis(100);
const MEMBER_ACCOUNT: &str = "member-account";
const OWNER_ACCOUNT: &str = "owner";
const OTHER_BEARER: &str = "bearer-of-another-account";
const OTHER_ACCOUNT: &str = "another-account";
const DEVICE_REGISTER_CONTEXT: &[u8] = b"kiroshi-device-register-v1";

#[derive(Clone)]
struct RelayDevice {
	ed25519: String,
	id: String,
	account_id: String,
}

#[derive(Clone, Default)]
struct DeviceRelay {
	devices: Arc<Mutex<Vec<RelayDevice>>>,
	challenges: Arc<Mutex<Vec<(String, &'static str)>>>,
	issued: Arc<AtomicUsize>,
	expiring: Arc<AtomicUsize>,
	throttled: Arc<AtomicUsize>,
	opened: Arc<Mutex<Vec<String>>>,
	is_signature_tampered: Arc<AtomicBool>,
	refusal: Arc<Mutex<Option<(StatusCode, &'static str)>>>,
	bodies: Arc<Mutex<Vec<Value>>>,
	answers: Arc<Mutex<Vec<(StatusCode, Value)>>>,
	deletion_status: Arc<Mutex<Option<StatusCode>>>,
	account_calls: Arc<Mutex<Vec<String>>>,
}

impl DeviceRelay {
	fn answers(&self) -> Vec<(StatusCode, Value)> {
		self.answers.lock().expect("the relay").clone()
	}

	fn statuses(&self) -> Vec<StatusCode> {
		self.answers().into_iter().map(|(status, _)| status).collect()
	}

	fn bodies(&self) -> Vec<Value> {
		self.bodies.lock().expect("the relay").clone()
	}

	fn account_calls(&self) -> Vec<String> {
		self.account_calls.lock().expect("the relay").clone()
	}

	fn device_of(&self, ed25519: &str) -> Option<RelayDevice> {
		let devices = self.devices.lock().expect("the relay");
		devices.iter().find(|device| device.ed25519 == ed25519).cloned()
	}

	fn is_a_device_of(&self, account_id: &str, id: &str) -> bool {
		let devices = self.devices.lock().expect("the relay");
		devices.iter().any(|device| device.id == id && device.account_id == account_id)
	}

	fn opened(&self) -> Vec<String> {
		self.opened.lock().expect("the relay").clone()
	}
}

#[derive(Clone)]
struct Relay {
	refusal: Option<StatusCode>,
	is_registration_open: Arc<watch::Sender<bool>>,
	is_registration_down: Arc<AtomicBool>,
	registered: Arc<Mutex<Vec<String>>>,
	instance_bodies: Arc<Mutex<Vec<(String, Value)>>>,
	is_description_open: Arc<watch::Sender<bool>>,
	descriptions_dropped: Arc<AtomicUsize>,
	known: Arc<Mutex<HashSet<String>>>,
	attempts: Arc<AtomicUsize>,
	sockets: mpsc::UnboundedSender<(WebSocket, String)>,
	device: DeviceRelay,
	members: Arc<Mutex<Vec<Value>>>,
	invitations: Arc<Mutex<Vec<Value>>>,
	member_calls: Arc<Mutex<Vec<String>>>,
	member_answer: Arc<Mutex<Option<(StatusCode, Value)>>>,
	refused_call: Arc<Mutex<Option<(String, StatusCode, Value)>>>,
	listed_devices: Arc<Mutex<Option<Vec<Value>>>>,
	device_lists: Arc<AtomicUsize>,
	noticed: Arc<watch::Sender<()>>,
}

fn cloud_member(user_id: &str, email: &str, role: &str, state: &str) -> Value {
	json!({ "userId": user_id, "email": email, "name": null, "role": role, "state": state })
}

fn member_call(relay: &Relay, call: String) -> Option<Response> {
	let refused = relay.refused_call.lock().expect("the relay").clone();
	let refused = refused.filter(|(refused, _, _)| *refused == call);
	relay.member_calls.lock().expect("the relay").push(call);
	relay.noticed.send_replace(());
	let forced = relay.member_answer.lock().expect("the relay").clone();
	let forced = forced.or(refused.map(|(_, status, body)| (status, body)));
	forced.map(|(status, body)| answered_json(status, body))
}

async fn members_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	assert!(account_of(&headers).is_some(), "an unknown bearer listed the members");
	if let Some(forced) = member_call(&relay, "GET".to_owned()) {
		return forced;
	}
	answered_json(StatusCode::OK, Value::Array(relay.members.lock().expect("the relay").clone()))
}

async fn member_removed(
	Served(relay): Served<Relay>,
	Path((_, user_id)): Path<(String, String)>,
	headers: HeaderMap,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	if let Some(forced) = member_call(&relay, format!("DELETE {user_id}")) {
		return forced;
	}
	let mut members = relay.members.lock().expect("the relay");
	let before = members.len();
	members.retain(|member| member["userId"] != user_id.as_str());
	if members.len() == before {
		return StatusCode::NOT_FOUND.into_response();
	}
	StatusCode::NO_CONTENT.into_response()
}

fn cloud_invitation(id: &str, email: &str, state: &str) -> Value {
	json!({
		"id": id,
		"email": email,
		"sentAt": "2026-10-01T00:00:00.000Z",
		"expiresAt": "2026-10-08T00:00:00.000Z",
		"state": state,
	})
}

async fn invitations_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	if let Some(forced) = member_call(&relay, "GET invitations".to_owned()) {
		return forced;
	}
	let invitations = relay.invitations.lock().expect("the relay").clone();
	answered_json(StatusCode::OK, Value::Array(invitations))
}

async fn invitation_sent(
	Served(relay): Served<Relay>,
	headers: HeaderMap,
	body: String,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let email = body["email"].as_str().expect("an email").to_owned();
	if let Some(forced) = member_call(&relay, format!("POST invitations {email}")) {
		return forced;
	}
	let sent = cloud_invitation(&uuid::Uuid::new_v4().to_string(), &email, "valid");
	relay.invitations.lock().expect("the relay").push(sent.clone());
	answered_json(StatusCode::CREATED, sent)
}

async fn invitation_withdrawn(
	Served(relay): Served<Relay>,
	Path((_, invitation_id)): Path<(String, String)>,
	headers: HeaderMap,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	if let Some(forced) = member_call(&relay, format!("DELETE invitations {invitation_id}")) {
		return forced;
	}
	let mut invitations = relay.invitations.lock().expect("the relay");
	let Some(invitation) = invitations.iter_mut().find(|sent| sent["id"] == invitation_id.as_str())
	else {
		return StatusCode::NOT_FOUND.into_response();
	};
	invitation["state"] = json!("withdrawn");
	StatusCode::NO_CONTENT.into_response()
}

async fn invitation_resent(
	Served(relay): Served<Relay>,
	Path((_, invitation_id)): Path<(String, String)>,
	headers: HeaderMap,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	let call = format!("POST invitations {invitation_id}/resend");
	if let Some(forced) = member_call(&relay, call) {
		return forced;
	}
	let mut invitations = relay.invitations.lock().expect("the relay");
	let Some(invitation) = invitations.iter_mut().find(|sent| sent["id"] == invitation_id.as_str())
	else {
		return StatusCode::NOT_FOUND.into_response();
	};
	let email = invitation["email"].as_str().expect("an email").to_owned();
	*invitation = cloud_invitation(&uuid::Uuid::new_v4().to_string(), &email, "valid");
	answered_json(StatusCode::CREATED, invitation.clone())
}

async fn devices_listed(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	let listed = relay.listed_devices.lock().expect("the relay").clone();
	relay.device_lists.fetch_add(1, Ordering::SeqCst);
	relay.noticed.send_replace(());
	match listed {
		Some(listed) => answered_json(StatusCode::OK, Value::Array(listed)),
		None => StatusCode::SERVICE_UNAVAILABLE.into_response(),
	}
}

async fn me(headers: HeaderMap) -> Response {
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	answered_json(
		StatusCode::OK,
		json!({ "id": account_id, "email": OWNER_EMAIL, "createdAt": "2026-10-01T00:00:00.000Z", "plan": "pro" }),
	)
}

fn account_of(headers: &HeaderMap) -> Option<&'static str> {
	match bearer_of(headers) {
		BEARER => Some(OWNER_ACCOUNT),
		OTHER_BEARER => Some(OTHER_ACCOUNT),
		_ => None,
	}
}

fn bearer_of(headers: &HeaderMap) -> &str {
	let header = headers.get("authorization").and_then(|value| value.to_str().ok());
	header.unwrap_or_default().trim_start_matches("Bearer ")
}

async fn registration(Served(relay): Served<Relay>, headers: HeaderMap, body: String) -> Response {
	let body: Value = serde_json::from_str(&body).expect("a json body");
	if bearer_of(&headers) != BEARER {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if relay.is_registration_down.load(Ordering::SeqCst) {
		return StatusCode::SERVICE_UNAVAILABLE.into_response();
	}
	relay
		.instance_bodies
		.lock()
		.expect("the relay")
		.push(("POST /instances".to_owned(), body.clone()));
	let id = uuid::Uuid::new_v4().to_string();
	relay
		.registered
		.lock()
		.expect("the relay")
		.push(body["name"].as_str().unwrap_or("").to_owned());
	relay.noticed.send_replace(());
	let mut is_open = relay.is_registration_open.subscribe();
	is_open.wait_for(|is_open| *is_open).await.expect("the relay opens");
	relay.known.lock().expect("the relay").insert(id.clone());
	answered_json(StatusCode::CREATED, json!({ "id": id, "name": body["name"], "role": "owner" }))
}

async fn instance_described(
	Served(relay): Served<Relay>,
	Path(id): Path<String>,
	headers: HeaderMap,
	body: String,
) -> Response {
	if bearer_of(&headers) != BEARER {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	let body: Value = serde_json::from_str(&body).expect("a json body");
	let call = format!("PATCH /instances/{id}");
	relay.instance_bodies.lock().expect("the relay").push((call, body));
	relay.noticed.send_replace(());
	let mut held = HeldDescription { relay: relay.clone(), is_answered: false };
	let mut is_open = relay.is_description_open.subscribe();
	is_open.wait_for(|is_open| *is_open).await.expect("the relay opens");
	held.is_answered = true;
	if !relay.known.lock().expect("the relay").contains(&id) {
		return StatusCode::NOT_FOUND.into_response();
	}
	answered_json(StatusCode::OK, json!({ "id": id }))
}

struct HeldDescription {
	relay: Relay,
	is_answered: bool,
}

impl Drop for HeldDescription {
	fn drop(&mut self) {
		if !self.is_answered {
			self.relay.descriptions_dropped.fetch_add(1, Ordering::SeqCst);
			self.relay.noticed.send_replace(());
		}
	}
}

async fn device_challenged(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	let device = &relay.device;
	let is_throttled =
		device.throttled.try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1));
	if is_throttled.is_ok() {
		let (status, refusal) = device_refused(StatusCode::TOO_MANY_REQUESTS, "RATE_LIMITED");
		return answered_json(status, refusal);
	}
	device.issued.fetch_add(1, Ordering::SeqCst);
	let nonce = [uuid::Uuid::new_v4().into_bytes(), uuid::Uuid::new_v4().into_bytes()].concat();
	let nonce = BASE64_URL_SAFE_NO_PAD.encode(nonce);
	let is_expired =
		device.expiring.try_update(Ordering::SeqCst, Ordering::SeqCst, |n| n.checked_sub(1));
	if is_expired.is_err() {
		device.challenges.lock().expect("the relay").push((nonce.clone(), account_id));
	}
	answered_json(
		StatusCode::CREATED,
		json!({ "nonce": nonce, "expiresAt": "2099-10-01T00:00:00.000Z" }),
	)
}

fn device_refused(status: StatusCode, code: &str) -> (StatusCode, Value) {
	(status, json!({ "error": { "code": code, "message": code } }))
}

struct Proving<'a> {
	body: &'a Value,
	account_id: &'static str,
}

fn decoded(body: &Value, key: &str) -> Vec<u8> {
	let text = body[key].as_str().unwrap_or_else(|| panic!("{key} is missing from {body}"));
	BASE64_URL_SAFE_NO_PAD.decode(text).unwrap_or_else(|_| panic!("{key} is not base64url"))
}

fn is_proven(relay: &DeviceRelay, Proving { body, account_id }: Proving<'_>) -> bool {
	let key: [u8; 32] = decoded(body, "ed25519PublicKey").try_into().expect("a 32-byte key");
	let nonce = decoded(body, "nonce");
	let mut signature: [u8; 64] = decoded(body, "signature").try_into().expect("64 bytes");
	if relay.is_signature_tampered.load(Ordering::SeqCst) {
		signature[0] ^= 1;
	}
	let signed = [DEVICE_REGISTER_CONTEXT, account_id.as_bytes(), &key, &nonce].concat();
	let key = ed25519_dalek::VerifyingKey::from_bytes(&key).expect("a point");
	let signature = ed25519_dalek::Signature::from_bytes(&signature);
	verify(&key, &signed, &signature).is_ok()
}

fn device_answer(relay: &DeviceRelay, proving: Proving<'_>) -> (StatusCode, Value) {
	let Proving { body, account_id } = proving;
	if let Some((status, code)) = *relay.refusal.lock().expect("the relay") {
		return device_refused(status, code);
	}
	if body.get("nonce").is_none() || body.get("signature").is_none() {
		return device_refused(StatusCode::BAD_REQUEST, "VALIDATION_ERROR");
	}
	let nonce = body["nonce"].as_str().unwrap_or_default();
	let mut challenges = relay.challenges.lock().expect("the relay");
	let Some(issued) =
		challenges.iter().position(|(issued, to)| issued == nonce && *to == account_id)
	else {
		return device_refused(StatusCode::BAD_REQUEST, "DEVICE_CHALLENGE_INVALID");
	};
	challenges.remove(issued);
	drop(challenges);
	if !is_proven(relay, proving) {
		return device_refused(StatusCode::FORBIDDEN, "DEVICE_PROOF_INVALID");
	}
	let ed25519 = body["ed25519PublicKey"].as_str().expect("a key").to_owned();
	let mut devices = relay.devices.lock().expect("the relay");
	let created_at = "2026-10-01T00:00:00.000Z";
	match devices.iter_mut().find(|device| device.ed25519 == ed25519) {
		None => {
			let id = uuid::Uuid::new_v4().to_string();
			devices.push(RelayDevice {
				ed25519,
				id: id.clone(),
				account_id: account_id.to_owned(),
			});
			let answer = json!({ "id": id, "createdAt": created_at, "transferred": false, "status": "approved" });
			(StatusCode::CREATED, answer)
		}
		Some(device) => {
			let transferred = device.account_id != account_id;
			device.account_id = account_id.to_owned();
			let answer = json!({
				"id": device.id,
				"createdAt": created_at,
				"transferred": transferred,
				"status": "approved"
			});
			(StatusCode::OK, answer)
		}
	}
}

async fn device_registered(
	Served(relay): Served<Relay>,
	headers: HeaderMap,
	body: String,
) -> Response {
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	let body: Value = serde_json::from_str(&body).expect("a json body");
	relay.device.bodies.lock().expect("the relay").push(body.clone());
	let (status, answer) = device_answer(&relay.device, Proving { body: &body, account_id });
	relay.device.answers.lock().expect("the relay").push((status, answer.clone()));
	relay.noticed.send_replace(());
	answered_json(status, answer)
}

async fn device_deleted(
	Served(relay): Served<Relay>,
	Path(id): Path<String>,
	headers: HeaderMap,
) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	relay.device.account_calls.lock().expect("the relay").push(format!("DELETE {id}"));
	let forced = *relay.device.deletion_status.lock().expect("the relay");
	if let Some(status) = forced {
		return status.into_response();
	}
	let mut devices = relay.device.devices.lock().expect("the relay");
	devices.retain(|device| device.id != id);
	StatusCode::NO_CONTENT.into_response()
}

async fn cloud_signed_out(Served(relay): Served<Relay>, headers: HeaderMap) -> Response {
	assert_eq!(bearer_of(&headers), BEARER);
	relay.device.account_calls.lock().expect("the relay").push("sign-out".to_owned());
	StatusCode::OK.into_response()
}

async fn host(
	Served(relay): Served<Relay>,
	Path(id): Path<String>,
	RawQuery(query): RawQuery,
	headers: HeaderMap,
	upgrade: WebSocketUpgrade,
) -> Response {
	relay.attempts.fetch_add(1, Ordering::SeqCst);
	relay.noticed.send_replace(());
	let Some(account_id) = account_of(&headers) else {
		return StatusCode::UNAUTHORIZED.into_response();
	};
	if let Some(status) = relay.refusal {
		return status.into_response();
	}
	let device = query.as_deref().and_then(|query| query.strip_prefix("device="));
	let Some(device) = device.filter(|device| relay.device.is_a_device_of(account_id, device))
	else {
		return StatusCode::FORBIDDEN.into_response();
	};
	relay.device.opened.lock().expect("the relay").push(device.to_owned());
	if !relay.known.lock().expect("the relay").contains(&id) {
		return StatusCode::NOT_FOUND.into_response();
	}
	upgrade.on_upgrade(move |socket| async move {
		relay.sockets.send((socket, id)).expect("the test holds the sockets");
	})
}

async fn invoked(Path(command): Path<String>, headers: HeaderMap, args: String) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	answered_json(StatusCode::OK, json!({ "command": command, "args": args }))
}

async fn joined_space_connected(
	Path(command): Path<String>,
	Served(database): Served<PathBuf>,
	headers: HeaderMap,
	args: String,
) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	if command != "joined_space_connect" {
		return answered_json(StatusCode::OK, json!({ "command": command, "args": args }));
	}
	let id = args["id"].as_str().expect("a joined space id").to_owned();
	let found = db::open(&database).joined_spaces().find(id).await.expect("the host reads");
	let connection = found.map(|found| {
		JoinedSpaceConnection::over(
			found,
			"http://h.test".to_owned(),
			JOINED_SPACE_TOKEN.to_owned(),
		)
	});
	answered_json(StatusCode::OK, json!(connection))
}

#[derive(Clone)]
struct HostEffects {
	database: PathBuf,
	env_root: PathBuf,
	reached: Arc<Mutex<Vec<String>>>,
}

impl HostEffects {
	fn reached(&self) -> Vec<String> {
		self.reached.lock().expect("the local api").clone()
	}
}

fn typed<T: serde::de::DeserializeOwned>(args: &Value, key: &str) -> T {
	serde_json::from_value(args[key].clone()).expect("a typed argument")
}

async fn host_effect_applied(
	Path(command): Path<String>,
	Served(effects): Served<HostEffects>,
	headers: HeaderMap,
	args: String,
) -> Response {
	let args: Value = serde_json::from_str(&args).expect("json arguments");
	if bearer_of(&headers) != LOCAL_TOKEN {
		return StatusCode::UNAUTHORIZED.into_response();
	}
	effects.reached.lock().expect("the local api").push(command.clone());
	let database = db::open(&effects.database);
	let root = &effects.env_root;
	let text = |key: &str| args[key].as_str().expect("a text argument").to_owned();
	match command.as_str() {
		"search_catalogue" => {
			let scope =
				CatalogueScope { query: text("query"), space_id: text("spaceId"), kind: None };
			let found = database.catalogue().search(scope).await.expect("the host searches");
			return answered_json(StatusCode::OK, json!(found));
		}
		"search_recent" => {
			let found = database.catalogue().recent(text("spaceId")).await.expect("the host reads");
			return answered_json(StatusCode::OK, json!(found));
		}
		"search_messages" => {
			let query: MessageSearchQuery = typed(&args, "query");
			let found = database.search().messages(query).await.expect("the host searches");
			return answered_json(StatusCode::OK, json!(found));
		}
		"joined_space_remove" => {
			database.joined_spaces().remove(text("id")).await.expect("the host leaves");
		}
		"env_set" => store::set(root, &typed(&args, "scope"), &text("name"), &text("value"))
			.expect("the host sets"),
		"env_delete" => {
			store::delete(root, &typed(&args, "scope"), &text("name")).expect("the host deletes")
		}
		"connection_set" => {
			connection::hold(root, typed(&args, "kind"), &text("value")).expect("the host connects")
		}
		"mcp_oauth_disconnect" => {
			let scope = EnvScope::Server { name: text("name"), owner: typed(&args, "owner") };
			credentials::forget(root, &scope).expect("the host disconnects");
		}
		_ => {}
	}
	answered_json(StatusCode::OK, Value::Null)
}

fn answered_json(status: StatusCode, body: Value) -> Response {
	(status, [(header::CONTENT_TYPE, "application/json")], body.to_string()).into_response()
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tauri::async_runtime::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

struct Harness {
	app: AppOfItsOwn,
	relay: Relay,
	sockets: mpsc::UnboundedReceiver<(WebSocket, String)>,
	heard: Arc<Mutex<Vec<Value>>>,
	heard_members: Arc<Mutex<Vec<Value>>>,
	_temporary: Vec<RemovedOnDrop>,
}

impl Harness {
	async fn new(name: &str, refusal: Option<StatusCode>, bearer: Option<&str>) -> Self {
		Self::polling_members(name, refusal, bearer, super::members::MEMBERS_EVERY).await
	}

	async fn polling_members(
		name: &str,
		refusal: Option<StatusCode>,
		bearer: Option<&str>,
		members_every: Duration,
	) -> Self {
		let local = Router::new().route(INVOKE_ROUTE, post(invoked));
		Self::serving(name, refusal, bearer, members_every, temp_dir(), local).await
	}

	async fn connecting_joined_spaces(name: &str) -> Self {
		let database = temp_dir();
		let local = Router::new()
			.route(INVOKE_ROUTE, post(joined_space_connected))
			.with_state(database.to_path_buf());
		Self::serving(name, None, Some(BEARER), super::members::MEMBERS_EVERY, database, local)
			.await
	}

	async fn applying_host_effects(name: &str) -> (Self, HostEffects) {
		let database = temp_dir();
		let env_root = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-hosting-env-{name}-{}", uuid::Uuid::new_v4())),
		);
		let effects = HostEffects {
			database: database.to_path_buf(),
			env_root: env_root.to_path_buf(),
			reached: Arc::default(),
		};
		let local = Router::new()
			.route(INVOKE_ROUTE, post(host_effect_applied))
			.with_state(effects.clone());
		let every = super::members::MEMBERS_EVERY;
		let mut harness = Self::serving(name, None, Some(BEARER), every, database, local).await;
		harness._temporary.push(env_root);
		(harness, effects)
	}

	async fn serving(
		name: &str,
		refusal: Option<StatusCode>,
		bearer: Option<&str>,
		members_every: Duration,
		database: RemovedOnDrop,
		local: Router,
	) -> Self {
		let (sockets_in, sockets) = mpsc::unbounded_channel();
		let relay = Relay {
			refusal,
			is_registration_open: Arc::new(watch::channel(true).0),
			is_registration_down: Arc::default(),
			registered: Arc::default(),
			instance_bodies: Arc::default(),
			is_description_open: Arc::new(watch::channel(true).0),
			descriptions_dropped: Arc::default(),
			known: Arc::default(),
			attempts: Arc::default(),
			sockets: sockets_in,
			device: DeviceRelay::default(),
			members: Arc::new(Mutex::new(vec![cloud_member(
				"owner",
				OWNER_EMAIL,
				"owner",
				"joined",
			)])),
			invitations: Arc::default(),
			member_calls: Arc::default(),
			member_answer: Arc::default(),
			refused_call: Arc::default(),
			listed_devices: Arc::default(),
			device_lists: Arc::default(),
			noticed: Arc::new(watch::channel(()).0),
		};
		let cloud = served(
			Router::new()
				.route("/instances", post(registration))
				.route("/instances/{id}", patch(instance_described))
				.route("/devices", post(device_registered))
				.route("/devices/challenge", post(device_challenged))
				.route("/devices/{id}", delete(device_deleted))
				.route("/api/auth/sign-out", post(cloud_signed_out))
				.route("/instances/{id}/relay/host", get(host))
				.route("/instances/{id}/members", get(members_listed).post(invitation_sent))
				.route("/instances/{id}/members/{user_id}", delete(member_removed))
				.route("/instances/{id}/invitations", get(invitations_listed))
				.route("/instances/{id}/invitations/{invitation_id}", delete(invitation_withdrawn))
				.route(
					"/instances/{id}/invitations/{invitation_id}/resend",
					post(invitation_resent),
				)
				.route("/instances/{id}/devices", get(devices_listed))
				.route("/me", get(me))
				.with_state(relay.clone()),
		)
		.await;
		let local = served(local).await;
		let root = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-hosting-{name}-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		let app = an_app_of_its_own(&format!("hosting-{name}"), mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		let profile = app.path().app_data_dir().expect("the data folder resolves");
		let identifier = app.config().identifier.clone();
		app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(profile)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		app.manage(RelayGuests::new(&cloud));
		app.manage(
			Hosting::new(
				&cloud,
				Some(
					LocalApi::new(local, LOCAL_TOKEN.to_owned()).expect("the local client builds"),
				),
			)
			.polling_members_every(members_every),
		);
		let heard = Arc::new(Mutex::new(Vec::new()));
		let hearing = Arc::clone(&heard);
		let noticing = Arc::clone(&relay.noticed);
		app.listen(CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("a json payload");
			hearing.lock().expect("the events").push(payload);
			noticing.send_replace(());
		});
		let heard_members = Arc::new(Mutex::new(Vec::new()));
		let hearing_members = Arc::clone(&heard_members);
		let noticing = Arc::clone(&relay.noticed);
		app.listen(MEMBERS_CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("a json payload");
			hearing_members.lock().expect("the events").push(payload);
			noticing.send_replace(());
		});
		let noticing = Arc::clone(&relay.noticed);
		app.listen(ACCOUNT_CHANGED_EVENT, move |_| {
			noticing.send_replace(());
		});
		Self { app, relay, sockets, heard, heard_members, _temporary: vec![database, root] }
	}

	async fn signed_in(name: &str) -> Self {
		Self::new(name, None, Some(BEARER)).await
	}

	fn state(&self) -> HostingState {
		self.app.state::<Hosting>().current(PERSONAL)
	}

	async fn reached(&self, expected: HostingState) {
		self.reached_by(PERSONAL, expected).await;
	}

	async fn noticed_until<T>(&self, awaited: &str, found: impl Fn() -> Option<T>) -> T {
		let mut noticed = self.relay.noticed.subscribe();
		loop {
			if let Some(found) = found() {
				return found;
			}
			tokio::time::timeout(PATIENCE, noticed.changed())
				.await
				.unwrap_or_else(|_| panic!("{awaited} was not noticed within {PATIENCE:?}"))
				.expect("the harness listens");
		}
	}

	async fn reached_by(&self, space_id: &str, expected: HostingState) {
		let current = || self.app.state::<Hosting>().current(space_id);
		let awaited = format!("space {space_id} reaching {expected:?}");
		self.noticed_until(&awaited, || (current() == expected).then_some(())).await;
	}

	async fn failed(&self) -> (HostingFailureKind, String) {
		let failure = || match self.state() {
			HostingState::Failed { failure, detail } => Some((failure, detail)),
			_ => None,
		};
		self.noticed_until("a failed space", failure).await
	}

	fn running_relay(&self) -> watch::Sender<bool> {
		let hosting = self.app.state::<Hosting>();
		let hosts = hosting.hosts();
		let run = hosts.get(PERSONAL).and_then(|host| host.run.as_ref());
		run.map(|run| run.stop.clone()).expect("a relay runs")
	}

	async fn started(&self) -> HostingState {
		start(self.app.handle(), PERSONAL.to_owned()).await.expect("the hosting starts")
	}

	async fn stopped(&self) -> HostingState {
		stop(self.app.handle(), PERSONAL.to_owned()).await.expect("the hosting stops")
	}

	async fn member(&mut self) -> MemberWire {
		self.member_of(MEMBER_ACCOUNT).await
	}

	async fn member_of(&mut self, account_id: &str) -> MemberWire {
		self.member_in(PERSONAL, account_id).await
	}

	async fn member_in(&mut self, space_id: &str, account_id: &str) -> MemberWire {
		let (socket, instance_id) = tokio::time::timeout(PATIENCE, self.sockets.recv())
			.await
			.expect("the host connected in time")
			.expect("the relay is up");
		let device = SealingMember::new(account_id);
		self.rostered(space_id, &device).await;
		MemberWire {
			socket,
			instance_id,
			host: self.host_keys().signing_public(),
			space: self.space_key(space_id),
			device,
			ctr: 0,
			challenge: None,
			held: VecDeque::new(),
			texts: Vec::new(),
		}
	}

	fn host_keys(&self) -> DeviceKeys {
		let state = self.app.state::<DeviceKeysState>();
		DeviceKeys::from_secret(&state.keys().expect("the device keys").secret())
	}

	fn space_key(&self, space_id: &str) -> HeldSpaceKey {
		let held = self.app.state::<SpaceKeys>().held(space_id).expect("the space key reads");
		held.expect("the hosted space holds a key")
	}

	async fn rostered(&self, space_id: &str, device: &SealingMember) {
		let state = self.app.state::<DatabaseState>();
		let roster = state.as_ref().expect("the database").space_relay();
		let row = device.row(&self.host_keys(), space_id);
		roster.rostered(space_id.to_owned(), row).await.expect("the member is rostered");
	}

	fn attempts(&self) -> usize {
		self.relay.attempts.load(Ordering::SeqCst)
	}

	fn registered(&self) -> Vec<String> {
		self.relay.registered.lock().expect("the relay").clone()
	}

	fn instance_bodies(&self) -> Vec<(String, Value)> {
		self.relay.instance_bodies.lock().expect("the relay").clone()
	}

	async fn instance_bodies_until(&self, count: usize) -> Vec<(String, Value)> {
		let reached = || Some(self.instance_bodies()).filter(|bodies| bodies.len() >= count);
		self.noticed_until("the awaited instance calls", reached).await
	}

	async fn known_instance(&self) -> String {
		let instance_id = uuid::Uuid::new_v4().to_string();
		self.plant(&instance_id).await;
		self.relay.known.lock().expect("the relay").insert(instance_id.clone());
		instance_id
	}

	async fn coloured(&self, colour: Option<AvatarBlot>) {
		let state = self.app.state::<DatabaseState>();
		let spaces = state.as_ref().expect("the database").spaces();
		let personal = "Personal".to_owned();
		spaces.update(PERSONAL.to_owned(), personal, colour.map(Into::into)).await.expect("stored");
	}

	async fn updated(
		&self,
		name: &str,
		colour: Option<AvatarBlot>,
	) -> Result<SpaceShown, SpaceError> {
		let state = self.app.state::<DatabaseState>();
		space_update(self.app.handle().clone(), state, PERSONAL.to_owned(), name.to_owned(), colour)
			.await
	}

	async fn stored(&self) -> (Option<String>, Vec<String>) {
		let state = self.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		let registration = hosting.registration(PERSONAL.to_owned()).await.expect("the row");
		(registration.instance_id, hosting.hosted_space_ids().await.expect("the flags"))
	}

	async fn joined_a_space(&self) -> JoinedSpace {
		let state = self.app.state::<DatabaseState>();
		let candidate = JoinedSpace {
			id: uuid::Uuid::new_v4().to_string(),
			reach: JoinedReach::Relay { instance_id: "joined-instance".to_owned() },
			remote_space_id: None,
			name: "h.test".to_owned(),
			inviter_email: None,
			listing: Default::default(),
		};
		let joined_spaces = state.as_ref().expect("the database").joined_spaces();
		joined_spaces.join(candidate).await.expect("the host joins a space")
	}

	async fn plant(&self, instance_id: &str) {
		let state = self.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.registered(PERSONAL.to_owned(), instance_id.to_owned()).await.expect("planted");
	}

	fn heard_kinds(&self) -> Vec<String> {
		let heard = self.heard.lock().expect("the events");
		heard
			.iter()
			.inspect(|change| assert_eq!(change["spaceId"], PERSONAL))
			.map(|change| change["state"]["kind"].as_str().expect("a kind").to_owned())
			.collect()
	}

	async fn heard_until(&self, is_heard: impl Fn(&[String]) -> bool) -> Vec<String> {
		let heard = || Some(self.heard_kinds()).filter(|kinds| is_heard(kinds));
		self.noticed_until("the awaited hosting changes", heard).await
	}
}

async fn ended_on_its_own(relay: watch::Sender<bool>) {
	tokio::time::timeout(PATIENCE, relay.closed()).await.expect("the relay ended on its own");
}

struct MemberWire {
	socket: WebSocket,
	instance_id: String,
	host: ed25519_dalek::VerifyingKey,
	space: HeldSpaceKey,
	device: SealingMember,
	ctr: u64,
	challenge: Option<[u8; CHALLENGE_LENGTH]>,
	held: VecDeque<Value>,
	texts: Vec<String>,
}

impl MemberWire {
	fn space(&self) -> Space<'_> {
		Space { instance_id: &self.instance_id, key: &self.space, host: &self.host }
	}

	async fn recv(&mut self) -> Option<Result<Message, axum::Error>> {
		self.socket.recv().await
	}

	async fn send(&mut self, message: Message) -> Result<(), axum::Error> {
		self.socket.send(message).await
	}

	async fn close_frame(&mut self) -> Option<CloseFrame> {
		loop {
			let frame = tokio::time::timeout(PATIENCE, self.recv()).await.expect("a frame in time");
			match frame {
				Some(Ok(Message::Close(close))) => return close,
				Some(Ok(_)) => {}
				other => panic!("the relay took no close frame: {other:?}"),
			}
		}
	}

	async fn texts_until_closed(&mut self) -> Vec<String> {
		let mut texts = Vec::new();
		loop {
			let frame = tokio::time::timeout(PATIENCE, self.recv()).await.expect("the socket ends");
			match frame {
				Some(Ok(Message::Text(text))) => texts.push(text.as_str().to_owned()),
				Some(Ok(Message::Close(_)) | Err(_)) | None => return texts,
				Some(Ok(_)) => {}
			}
		}
	}

	async fn sealed_sent(&mut self, plaintext: &str, challenge: Option<[u8; CHALLENGE_LENGTH]>) {
		self.ctr += 1;
		let sealed = self.device.sealed(&self.space(), self.ctr, plaintext, challenge);
		self.socket.send(Message::Text(sealed.into())).await.expect("the member frame leaves");
	}

	async fn said(&mut self, plaintext: &str) {
		if self.challenge.is_none() {
			self.greeted().await;
		}
		self.sealed_sent(plaintext, self.challenge).await;
	}

	async fn greeted(&mut self) -> HostFrame {
		self.sealed_sent(HELLO, None).await;
		loop {
			let frame = self.next_sealed().await;
			if is_a_hello(&frame) {
				self.challenge = frame.challenge;
				return frame;
			}
			self.held.push_back(frame.plaintext);
		}
	}

	async fn next_sealed(&mut self) -> HostFrame {
		loop {
			let frame = tokio::time::timeout(PATIENCE, self.socket.recv())
				.await
				.expect("a frame in time")
				.expect("the socket is open")
				.expect("a readable frame");
			let Message::Text(text) = frame else {
				continue;
			};
			self.texts.push(text.as_str().to_owned());
			if let Some(opened) = self.device.opened(&self.space(), text.as_str()) {
				return opened;
			}
		}
	}

	async fn next_plaintext(&mut self) -> Value {
		if let Some(held) = self.held.pop_front() {
			return held;
		}
		loop {
			let frame = self.next_sealed().await;
			if !is_a_hello(&frame) {
				return frame.plaintext;
			}
			self.challenge = frame.challenge;
		}
	}
}

fn is_a_hello(frame: &HostFrame) -> bool {
	frame.plaintext == json!({ "hello": {} }) && frame.challenge.is_some()
}

async fn next_json(member: &mut MemberWire) -> Value {
	member.next_plaintext().await
}

async fn next_stamped(member: &mut MemberWire, wanted: impl Fn(&Value) -> bool) -> Value {
	loop {
		let frame = next_json(member).await;
		if wanted(&frame) {
			return frame;
		}
	}
}

fn unstamped(mut frame: Value) -> Value {
	if let Some(fields) = frame.as_object_mut().filter(|fields| fields.contains_key("event")) {
		let epoch = fields.remove("epoch");
		let seq = fields.remove("seq");
		assert!(
			epoch.as_ref().is_some_and(Value::is_string) && seq.as_ref().is_some_and(Value::is_u64),
			"an event frame carries its epoch {epoch:?} and seq {seq:?}"
		);
	}
	frame
}

async fn next_text(member: &mut MemberWire, wanted: impl Fn(&Value) -> bool) -> Value {
	loop {
		let frame = unstamped(next_json(member).await);
		if wanted(&frame) {
			return frame;
		}
	}
}

async fn members_heard(member: &mut MemberWire) -> Value {
	next_text(member, |frame| frame["event"]["event"] == MEMBERS_CHANGED_EVENT).await
}

async fn answer(member: &mut MemberWire) -> Value {
	next_text(member, |frame| frame.get("event").is_none()).await
}

async fn send(member: &mut MemberWire, text: &str) {
	member.said(text).await;
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

#[test]
fn a_first_start_registers_once_and_a_later_start_reuses_the_instance() {
	run(async {
		let mut harness = Harness::signed_in("reuse").await;

		assert_eq!(harness.started().await, HostingState::Connecting);
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (registered, flagged) = harness.stored().await;
		harness.stopped().await;
		harness.started().await;
		let _second = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.registered(), vec!["Personal".to_owned()]);
		assert!(harness
			.relay
			.known
			.lock()
			.expect("the relay")
			.contains(&registered.clone().expect("an id")));
		assert_eq!(flagged, vec![PERSONAL.to_owned()]);
		assert_eq!(harness.stored().await.0, registered);
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn an_instance_the_relay_forgot_is_registered_anew_and_replaced() {
	run(async {
		let mut harness = Harness::signed_in("forgotten").await;
		let forgotten = uuid::Uuid::new_v4().to_string();
		harness.plant(&forgotten).await;

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let (stored, _) = harness.stored().await;
		assert_eq!(harness.registered().len(), 1);
		assert_ne!(stored.as_deref(), Some(forgotten.as_str()));
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn a_registration_carries_the_space_colour_and_a_later_start_patches_name_and_colour_once() {
	run(async {
		let mut harness = Harness::signed_in("described").await;
		harness.coloured(None).await;

		harness.started().await;
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		harness.coloured(Some(AvatarBlot::Cyan)).await;
		harness.started().await;
		let _second = harness.member().await;
		harness.reached(HostingState::Online).await;

		let instance_id = harness.stored().await.0.expect("an instance");
		assert_eq!(
			harness.instance_bodies_until(2).await,
			vec![
				("POST /instances".to_owned(), json!({ "name": "Personal", "colour": null })),
				(
					format!("PATCH /instances/{instance_id}"),
					json!({ "name": "Personal", "colour": "cyan" })
				),
			]
		);
	});
}

#[test]
fn a_start_connects_while_its_patch_is_held_and_a_stop_drops_the_held_patch() {
	run(async {
		let mut harness = Harness::signed_in("held-description").await;
		let instance_id = harness.known_instance().await;
		harness.relay.is_description_open.send_replace(false);

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let held = harness.instance_bodies_until(1).await;
		harness.stopped().await;
		let dropped = || {
			let dropped = harness.relay.descriptions_dropped.load(Ordering::SeqCst);
			(dropped > 0).then_some(dropped)
		};

		assert_eq!(
			held,
			vec![(
				format!("PATCH /instances/{instance_id}"),
				json!({ "name": "Personal", "colour": "red" })
			)]
		);
		let dropped = harness.noticed_until("the held PATCH dropped", dropped);
		let dropped = tokio::time::timeout(BEFORE_THE_PATCH_TIMES_OUT, dropped).await;
		assert_eq!(dropped.expect("the stop dropped the held PATCH"), 1);
	});
}

#[test]
fn a_space_update_returns_before_its_held_patch_is_answered_and_an_unchanged_one_sends_none() {
	run(async {
		let harness = Harness::signed_in("relabelled").await;
		let instance_id = harness.known_instance().await;
		harness.relay.is_description_open.send_replace(false);

		let renamed = tokio::time::timeout(
			BEFORE_THE_PATCH_TIMES_OUT,
			harness.updated("Studio", Some(AvatarBlot::Red)),
		)
		.await
		.expect("space_update answered while its PATCH is held");
		let renaming = harness.instance_bodies_until(1).await;
		let unchanged = harness.updated("Studio", Some(AvatarBlot::Red)).await;
		let recoloured = harness.updated("Studio", Some(AvatarBlot::Blue)).await;
		let patched = harness.instance_bodies_until(2).await;
		harness.relay.is_description_open.send_replace(true);

		assert_eq!(renamed.expect("the rename").name, "Studio");
		assert!(unchanged.is_ok());
		assert_eq!(recoloured.expect("the recolour").colour, Some(AvatarBlot::Blue));
		let call = format!("PATCH /instances/{instance_id}");
		assert_eq!(renaming, vec![(call.clone(), json!({ "name": "Studio", "colour": "red" }))]);
		assert_eq!(patched[1], (call, json!({ "name": "Studio", "colour": "blue" })));
		assert_eq!(patched.len(), 2);
	});
}

#[test]
fn a_space_update_whose_patch_the_relay_refuses_returns_the_space_and_warns_with_the_instance() {
	run(async {
		capturing();
		let harness = Harness::signed_in("relabel-refused").await;
		let instance_id = uuid::Uuid::new_v4().to_string();
		harness.plant(&instance_id).await;

		let updated = harness.updated("Studio", None).await.expect("the update");
		let warned = warnings_naming(&instance_id).await;

		assert_eq!((updated.name.as_str(), updated.colour), ("Studio", None));
		assert_eq!(
			warned,
			vec![format!(
				"instance {instance_id} was not described to the relay: the cloud answered 404 Not Found"
			)]
		);
	});
}

#[test]
fn without_a_bearer_the_space_needs_a_sign_in_and_nothing_is_called() {
	run(async {
		let harness = Harness::new("no-bearer", None, None).await;

		assert_eq!(harness.started().await, HostingState::NeedsSignIn);

		assert!(harness.registered().is_empty());
		assert_eq!(harness.attempts(), 0);
		assert_eq!(harness.heard_until(|kinds| !kinds.is_empty()).await, vec!["needsSignIn"]);
	});
}

#[test]
fn a_bearer_the_relay_refuses_needs_a_sign_in_and_is_not_retried() {
	run(async {
		let harness = Harness::new("revoked", Some(StatusCode::UNAUTHORIZED), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		harness.reached(HostingState::NeedsSignIn).await;
		ended_on_its_own(relay).await;

		assert_eq!(harness.attempts(), 1);
		assert_eq!(harness.state(), HostingState::NeedsSignIn);
	});
}

#[test]
fn an_instance_owned_by_another_account_fails_naming_403_and_is_not_retried() {
	run(async {
		let harness = Harness::new("forbidden", Some(StatusCode::FORBIDDEN), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::NotOwner);
		assert!(detail.contains("403"), "{detail}");
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn an_instance_the_relay_answers_410_on_registers_again_once_then_fails_naming_410() {
	run(async {
		let harness = Harness::new("gone", Some(StatusCode::GONE), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::InstanceGoneAfterReregistration);
		assert!(detail.contains("410"), "{detail}");
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn an_instance_the_relay_answers_404_on_registers_again_once_then_fails_as_unknown() {
	run(async {
		let harness = Harness::new("unknown", Some(StatusCode::NOT_FOUND), Some(BEARER)).await;

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::InstanceUnknownAfterReregistration);
		assert!(detail.contains("404"), "{detail}");
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn a_relay_answering_503_is_retried_on_connecting_and_never_fails() {
	run(async {
		let harness =
			Harness::new("unavailable", Some(StatusCode::SERVICE_UNAVAILABLE), Some(BEARER)).await;

		harness.started().await;
		let is_attempted_again = || (harness.attempts() >= 2).then_some(());
		harness.noticed_until("the relay attempted again", is_attempted_again).await;

		assert_eq!(harness.state(), HostingState::Connecting);
	});
}

#[test]
fn a_relay_device_table_that_does_not_read_fails_as_database_unavailable() {
	run(async {
		let harness = Harness::signed_in("database-unavailable").await;
		relay_database(&harness)
			.call_mut(|connection| Ok(connection.execute_batch("DROP TABLE relay_devices")?))
			.await
			.expect("the table is dropped");

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::DatabaseUnavailable);
		assert!(detail.contains("the relay device id did not read"), "{detail}");
		assert_eq!(harness.attempts(), 0);
	});
}

#[test]
fn each_unmet_precondition_of_a_start_maps_to_its_own_state() {
	let opened =
		|bearer: Result<Option<String>, EnvError>, approval: bool, listening: bool| match opening(
			Opening { bearer, is_awaiting_approval: approval, is_local_api_listening: listening },
		) {
			HostingState::Failed { failure, .. } => Some(failure),
			HostingState::Connecting => None,
			state => panic!("no start settles on {state:?} with a bearer or a store failure"),
		};
	let signed_in = || Ok(Some(BEARER.to_owned()));
	let unreadable = || Err(EnvError::Unreadable { detail: "locked".to_owned() });

	assert_eq!(
		opening(Opening {
			bearer: Ok(None),
			is_awaiting_approval: true,
			is_local_api_listening: false
		}),
		HostingState::NeedsSignIn
	);
	assert_eq!(
		opened(unreadable(), true, false),
		Some(HostingFailureKind::AccountSessionStoreFailed)
	);
	assert_eq!(opened(signed_in(), true, false), Some(HostingFailureKind::DeviceAwaitingApproval));
	assert_eq!(
		opened(signed_in(), false, false),
		Some(HostingFailureKind::LocalHostApiNotListening)
	);
	assert_eq!(opened(signed_in(), false, true), None);
}

#[test]
fn host_keys_without_device_keys_or_without_a_space_key_store_fail_with_their_own_kind() {
	run(async {
		let app = an_app_of_its_own("hosting-keys", mock_builder());
		let without_device = host_keys(app.handle(), PERSONAL).await.err().map(|(kind, _)| kind);
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
		let without_space = host_keys(app.handle(), PERSONAL).await.err().map(|(kind, _)| kind);

		assert_eq!(without_device, Some(HostingFailureKind::DeviceKeysNotLoaded));
		assert_eq!(without_space, Some(HostingFailureKind::SpaceKeyNotRead));
	});
}

#[test]
fn a_host_replaced_by_another_fails_naming_4001_and_does_not_reconnect() {
	run(async {
		let mut harness = Harness::signed_in("replaced").await;
		harness.started().await;
		let relay = harness.running_relay();
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let close = CloseFrame { code: 4001, reason: "Host replaced".into() };
		member.send(Message::Close(Some(close))).await.expect("the close leaves");
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::TakenOverByAnotherHost);
		assert!(detail.contains("4001"), "{detail}");
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn a_dropped_socket_reconnects_after_the_first_backoff() {
	run(async {
		let mut harness = Harness::signed_in("dropped").await;
		harness.started().await;
		let member = harness.member().await;
		harness.reached(HostingState::Online).await;

		drop(member);
		harness.reached(HostingState::Connecting).await;
		let _again = harness.member().await;
		harness.reached(HostingState::Online).await;

		let heard = harness.heard_until(|kinds| kinds.len() >= 4).await;

		assert_eq!(heard, vec!["connecting", "online", "connecting", "online"]);
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn a_relay_restarting_4005_reconnects_after_the_first_backoff() {
	run(async {
		let mut harness = Harness::signed_in("restarting").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let close = CloseFrame { code: 4005, reason: "Server restarting".into() };
		member.send(Message::Close(Some(close))).await.expect("the close leaves");
		harness.reached(HostingState::Connecting).await;
		let _again = harness.member().await;
		harness.reached(HostingState::Online).await;

		let heard = harness.heard_until(|kinds| kinds.len() >= 4).await;

		assert_eq!(heard, vec!["connecting", "online", "connecting", "online"]);
		assert_eq!(harness.attempts(), 2);
	});
}

#[test]
fn a_member_call_reaches_the_local_api_with_the_host_token_and_its_answer_comes_back() {
	run(async {
		let mut harness = Harness::signed_in("invoke").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "c1", "command": "agent_models", "args": {"a": 1}}"#).await;

		assert_eq!(
			answer(&mut member).await,
			json!({
				"id": "c1",
				"status": 200,
				"body": { "command": "agent_models", "args": { "a": 1 } }
			})
		);
	});
}

#[test]
fn the_shared_space_frame_is_answered_with_the_hosted_space() {
	run(async {
		let mut harness = Harness::signed_in("shared-space").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "s1", "command": "relay_shared_space"}"#).await;

		assert_eq!(
			answer(&mut member).await,
			json!({ "id": "s1", "status": 200, "body": { "spaceId": PERSONAL } })
		);
	});
}

#[test]
fn a_malformed_member_frame_is_answered_400_and_the_socket_stays_open() {
	run(async {
		let mut harness = Harness::signed_in("malformed").await;
		harness.started().await;
		let mut member = harness.member().await;

		send(&mut member, r#"{"id": "m1", "command": 7}"#).await;
		let refused = answer(&mut member).await;
		send(&mut member, r#"{"id": "m2", "command": "agent_models"}"#).await;
		let answered = answer(&mut member).await;

		assert_eq!((refused["id"].clone(), refused["status"].clone()), (json!("m1"), json!(400)));
		assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("m2"), json!(200)));
		assert_eq!(harness.state(), HostingState::Online);
	});
}

async fn a_relay_guest_is_refused(command: &str) {
	refused_on(&mut Harness::signed_in(command).await, command).await;
}

async fn refused_on(harness: &mut Harness, command: &str) -> Value {
	refused_with(harness, command, json!({ "spaceId": PERSONAL })).await.1
}

async fn refused_with(harness: &mut Harness, command: &str, args: Value) -> (Value, Value) {
	assert!(belongs_to_the_host(command, &args), "{command} is not host only");
	restore(harness.app.handle().clone()).await;
	harness.started().await;
	let mut member = harness.member().await;
	harness.reached(HostingState::Online).await;

	let frame = json!({ "id": command, "command": command, "args": args });
	send(&mut member, &frame.to_string()).await;
	let refused = answer(&mut member).await;
	send(&mut member, r#"{"id": "after", "command": "agent_models"}"#).await;
	let answered = answer(&mut member).await;

	assert_eq!(
		refused,
		json!({ "id": command, "status": 403, "body": "this command belongs to the host" })
	);
	assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("after"), json!(200)));
	assert_eq!(harness.state(), HostingState::Online);
	let session = harness.app.state::<AccountSession>();
	assert!(matches!(session.current(), AccountState::SignedIn(_)), "{:?}", session.current());
	assert_eq!(session.bearer().expect("the session store reads").as_deref(), Some(BEARER));
	(refused, answered)
}

#[test]
fn a_relay_guest_cannot_start_the_hosting() {
	run(a_relay_guest_is_refused("hosting_start"));
}

#[test]
fn a_relay_guest_cannot_stop_the_hosting() {
	run(a_relay_guest_is_refused("hosting_stop"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_account_in() {
	run(a_relay_guest_is_refused("account_sign_in"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_account_out() {
	run(a_relay_guest_is_refused("account_sign_out"));
}

#[test]
fn a_relay_guest_cannot_sign_the_host_agent_in() {
	run(a_relay_guest_is_refused("agent_sign_in"));
}

#[test]
fn a_relay_guest_cannot_enter_the_host_agent_sign_in_code() {
	run(a_relay_guest_is_refused("agent_sign_in_code"));
}

#[test]
fn a_relay_guest_cannot_cancel_the_host_agent_sign_in() {
	run(a_relay_guest_is_refused("agent_sign_in_cancel"));
}

async fn a_relay_guest_is_refused_before_the_local_api(command: &str) {
	let (mut harness, effects) = Harness::applying_host_effects(command).await;

	refused_on(&mut harness, command).await;

	assert_eq!(effects.reached(), ["agent_models"]);
}

#[test]
fn a_relay_guest_cannot_read_the_host_account() {
	run(a_relay_guest_is_refused_before_the_local_api("account_state"));
}

#[test]
fn a_relay_guest_cannot_read_the_host_preferences() {
	run(a_relay_guest_is_refused_before_the_local_api("user_preferences"));
}

#[test]
fn a_relay_guest_cannot_delete_a_space_and_its_instance_registration() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("space_delete").await;

		refused_on(&mut harness, "space_delete").await;

		let spaces = db::open(&effects.database).spaces().list().await.expect("the host lists");
		assert!(spaces.iter().any(|space| space.id == PERSONAL), "{spaces:?}");
		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_relay_guest_cannot_read_the_stored_token_of_a_joined_space() {
	run(async {
		let mut harness = Harness::connecting_joined_spaces("joined-connect").await;
		let joined = harness.joined_a_space().await;

		let (refused, _) =
			refused_with(&mut harness, "joined_space_connect", json!({ "id": joined.id })).await;

		assert!(!refused.to_string().contains(JOINED_SPACE_TOKEN), "{refused}");
	});
}

#[test]
fn a_relay_guest_cannot_remove_a_joined_space_of_the_host() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("joined-remove").await;
		let joined = harness.joined_a_space().await;

		refused_with(&mut harness, "joined_space_remove", json!({ "id": joined.id })).await;

		let listed = db::open(&effects.database).joined_spaces().list().await.expect("listed");
		assert!(listed.iter().any(|kept| kept.id == joined.id), "{listed:?}");
	});
}

#[test]
fn a_relay_guest_cannot_list_the_joined_spaces_of_the_host() {
	run(a_relay_guest_is_refused("joined_spaces_list"));
}

#[test]
fn a_relay_guest_cannot_read_the_conversation_ids_of_the_host() {
	run(a_relay_guest_is_refused("conversation_local_ids"));
}

#[test]
fn a_relay_guest_cannot_replace_the_host_agent_connection() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("connection-set").await;
		connection::hold(&effects.env_root, ConnectionKind::ApiKey, "host-key")
			.expect("the host connects");
		let before = connection::held(&effects.env_root).expect("the host reads");

		refused_with(
			&mut harness,
			"connection_set",
			json!({ "kind": "apiKey", "value": "guest-key" }),
		)
		.await;

		assert_eq!(connection::held(&effects.env_root).expect("the host reads"), before);
	});
}

#[test]
fn a_relay_guest_cannot_connect_an_application_with_the_host_identity() {
	run(a_relay_guest_is_refused("mcp_oauth_connect"));
}

#[test]
fn a_relay_guest_cannot_cancel_a_host_application_connection() {
	run(a_relay_guest_is_refused("mcp_oauth_cancel"));
}

#[test]
fn a_relay_guest_cannot_create_a_host_space() {
	run(a_relay_guest_is_refused("space_create"));
}

#[test]
fn a_relay_guest_cannot_import_a_host_file_as_a_space() {
	run(a_relay_guest_is_refused("space_import"));
}

#[test]
fn a_relay_guest_cannot_export_a_space_to_a_host_path() {
	run(a_relay_guest_is_refused("space_export"));
}

#[test]
fn a_relay_guest_cannot_reorder_the_host_spaces() {
	run(a_relay_guest_is_refused("space_reorder"));
}

#[test]
fn a_relay_guest_cannot_change_the_host_profile() {
	run(a_relay_guest_is_refused("user_set_preferences"));
}

#[test]
fn a_relay_guest_cannot_change_the_host_profile_picture() {
	run(a_relay_guest_is_refused("user_set_profile_picture"));
}

fn a_stdio_server_on(scope: Value) -> Value {
	json!({
		"scope": scope,
		"name": "spawned",
		"config": { "command": "spawned-by-the-guest" },
		"mark": null
	})
}

#[test]
fn a_relay_guest_cannot_add_a_server_to_the_host_person_plugin() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("plugin-person").await;
		let args = a_stdio_server_on(json!({ "kind": "user" }));

		refused_with(&mut harness, "plugin_set_mcp_server", args).await;

		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_relay_guest_adding_a_server_to_a_space_plugin_reaches_the_host() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("plugin-space").await;
		harness.started().await;
		let mut member = harness.member_of(A_JOINER).await;
		let args = a_stdio_server_on(json!({ "kind": "space", "id": PERSONAL }));

		let frame = json!({ "id": "p", "command": "plugin_set_mcp_server", "args": args });
		send(&mut member, &frame.to_string()).await;
		let answered = answer(&mut member).await;

		assert_eq!((answered["id"].clone(), answered["status"].clone()), (json!("p"), json!(200)));
		assert_eq!(effects.reached(), ["plugin_set_mcp_server"]);
	});
}

#[test]
fn a_local_event_is_forwarded_to_the_relay() {
	run(async {
		let mut harness = Harness::signed_in("event").await;
		harness.started().await;
		let mut member = harness.member().await;
		send(&mut member, r#"{"id": "warm", "command": "agent_models"}"#).await;
		answer(&mut member).await;

		let payload = json!({ "spaceId": PERSONAL, "n": 1 });
		events::emit(harness.app.handle(), Event::untyped(CHANGED_EVENT), payload)
			.expect("emitted");
		let forwarded =
			next_text(&mut member, |frame| frame["event"]["payload"]["n"] == json!(1)).await;

		assert!(forwarded["event"].to_string().contains(r#""n":1"#), "{forwarded}");
	});
}

#[test]
fn the_first_member_announcement_of_an_online_space_crosses_the_relay() {
	run(async {
		let mut harness = Harness::signed_in("members-local").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let first = members_heard(&mut member).await;

		let announced = harness.heard_member_lists();
		assert_eq!(announced.len(), 1);
		let invitations = harness.heard_invitation_lists();
		let payload =
			json!({ "spaceId": PERSONAL, "members": announced[0], "invitations": invitations[0] });
		assert_eq!(first, as_forwarded((MEMBERS_CHANGED_EVENT, payload)));
	});
}

#[test]
fn stopping_closes_with_1000_clears_the_flag_and_keeps_the_instance() {
	run(async {
		let mut harness = Harness::signed_in("stop").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;
		let (registered, _) = harness.stored().await;

		assert_eq!(harness.stopped().await, HostingState::Off);
		let closed = member.close_frame().await;

		let Some(close) = closed else {
			panic!("the relay took no close frame: {closed:?}");
		};
		assert_eq!(close.code, 1000);
		assert_eq!(harness.stored().await, (registered, Vec::new()));
		let heard =
			harness.heard_until(|kinds| kinds.last().is_some_and(|kind| kind == "off")).await;
		assert_eq!(heard.last().map(String::as_str), Some("off"));
	});
}

#[test]
fn a_lagged_event_broadcast_closes_with_1013_and_reconnects() {
	run(async {
		let mut harness = Harness::signed_in("lagged").await;
		harness.started().await;
		let mut first = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut first, is_a_members_change).await);

		let (held, is_held) = tokio::sync::oneshot::channel();
		let (release, released) = std::sync::mpsc::channel::<()>();
		let app = harness.app.handle().clone();
		let holding = tauri::async_runtime::spawn(async move {
			let state = app.state::<DatabaseState>();
			let database = state.as_ref().expect("the database");
			database
				.call(move |_| {
					held.send(()).expect("the test waits for the lock");
					released.recv().expect("the test releases the lock");
					Ok(())
				})
				.await
		});
		is_held.await.expect("the database lock is held");
		let lookup = json!({ "conversationId": "c-lagged" });
		for _ in 0..BUFFERED_FRAMES + 2 {
			events::emit(
				harness.app.handle(),
				Event::untyped(MESSAGE_STORED_EVENT),
				lookup.clone(),
			)
			.expect("emitted");
		}
		release.send(()).expect("the holder waits");
		holding.await.expect("the holder ends").expect("the lock is released");

		let close = loop {
			let frame =
				tokio::time::timeout(PATIENCE, first.recv()).await.expect("a frame in time");
			match frame {
				Some(Ok(Message::Close(close))) => break close,
				Some(Ok(_)) => continue,
				other => panic!("the relay took no close frame: {other:?}"),
			}
		};
		let mut second = harness.member().await;
		harness.reached(HostingState::Online).await;
		let heard = harness.heard_until(|kinds| kinds.len() >= 4).await;
		let (replayed, answer) = resumed_from(&mut second, &epoch, since).await;

		assert_eq!(close.map(|close| close.code), Some(1013));
		assert_eq!(heard, vec!["connecting", "online", "connecting", "online"]);
		assert_eq!(harness.attempts(), 2);
		assert!(replayed.is_empty());
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "tooOld": true }));
	});
}

const RESUME_TOKEN: &str = "resume-token";

fn is_a_members_change(frame: &Value) -> bool {
	frame["event"]["event"] == MEMBERS_CHANGED_EVENT && frame["event"]["payload"]["n"].is_null()
}

fn stamp_of(frame: &Value) -> (String, u64) {
	let epoch = frame["epoch"].as_str().expect("an epoch").to_owned();
	(epoch, frame["seq"].as_u64().expect("a seq"))
}

fn numbered(harness: &Harness, n: usize) {
	let payload = json!({ "spaceId": PERSONAL, "n": n });
	events::emit(harness.app.handle(), Event::untyped(MEMBERS_CHANGED_EVENT), payload)
		.expect("emitted");
}

async fn numbered_through(harness: &Harness, member: &mut MemberWire, n: usize) -> Value {
	numbered(harness, n);
	next_stamped(member, |frame| frame["event"]["payload"]["n"] == n).await
}

fn number_of(frame: &Value) -> Option<u64> {
	frame["event"]["payload"]["n"].as_u64()
}

async fn resumed_from(member: &mut MemberWire, epoch: &str, since: u64) -> (Vec<Value>, Value) {
	let args = json!({ "epoch": epoch, "since": since, "token": RESUME_TOKEN });
	let call = json!({ "id": "resume", "command": RESUME_COMMAND, "args": args });
	send(member, &call.to_string()).await;
	let mut heard = Vec::new();
	loop {
		let frame = next_json(member).await;
		if frame.get("event").is_some() {
			heard.push(frame);
		} else if frame["id"] == "resume" {
			let count = frame["body"]["replayed"].as_u64().unwrap_or(0) as usize;
			let replayed = heard.split_off(heard.len() - count);
			return (replayed, frame);
		}
	}
}

fn assert_continues(replayed: &[Value], epoch: &str, since: u64) {
	let stamps: Vec<(String, u64)> = replayed.iter().map(stamp_of).collect();
	let expected: Vec<(String, u64)> =
		(since + 1..).take(replayed.len()).map(|seq| (epoch.to_owned(), seq)).collect();
	assert_eq!(stamps, expected);
}

#[test]
fn a_resume_inside_the_ring_replays_every_missed_frame_once_in_seq_order() {
	run(async {
		let mut harness = Harness::signed_in("resume").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);
		for n in 1..5 {
			numbered(&harness, n);
		}
		let mut last = numbered_through(&harness, &mut member, 5).await;

		let (replayed, answer) = resumed_from(&mut member, &epoch, since).await;

		assert_continues(&replayed, &epoch, since);
		assert!(replayed.iter().all(|frame| frame["token"] == RESUME_TOKEN));
		last["token"] = json!(RESUME_TOKEN);
		assert_eq!(replayed.last(), Some(&last));
		assert_eq!(replayed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1, 2, 3, 4, 5]);
		assert_eq!(answer["status"], 200);
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "replayed": replayed.len() }));
	});
}

#[test]
fn a_resume_from_beyond_the_ring_bound_answers_too_old() {
	run(async {
		let mut harness = Harness::signed_in("resume-too-old").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);
		for n in 1..=RING_FRAMES + 2 {
			numbered_through(&harness, &mut member, n).await;
		}

		let (replayed, answer) = resumed_from(&mut member, &epoch, since).await;

		assert!(replayed.is_empty());
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "tooOld": true }));
	});
}

#[test]
fn a_reopened_host_socket_first_sends_the_frames_recorded_while_it_was_down_in_seq_order() {
	run(async {
		let mut harness = Harness::signed_in("outage-pushed").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);

		drop(member);
		harness.reached(HostingState::Connecting).await;
		numbered(&harness, 1);
		numbered(&harness, 2);
		let mut again = harness.member().await;
		let mut pushed = Vec::new();
		while pushed.last().and_then(number_of) != Some(2) {
			pushed.push(next_stamped(&mut again, |frame| frame.get("event").is_some()).await);
		}

		assert_continues(&pushed, &epoch, since);
		assert_eq!(pushed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1, 2]);
	});
}

#[test]
fn a_host_socket_reconnection_keeps_the_epoch_and_continues_the_seq() {
	run(async {
		let mut harness = Harness::signed_in("resume-reconnected").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (epoch, since) = stamp_of(&next_stamped(&mut member, is_a_members_change).await);

		drop(member);
		harness.reached(HostingState::Connecting).await;
		numbered(&harness, 1);
		let mut again = harness.member().await;
		harness.reached(HostingState::Online).await;
		let (replayed, answer) = resumed_from(&mut again, &epoch, since).await;
		let live = numbered_through(&harness, &mut again, 2).await;

		assert_continues(&replayed, &epoch, since);
		assert_eq!(replayed.iter().filter_map(number_of).collect::<Vec<_>>(), vec![1]);
		assert_eq!(answer["body"], json!({ "token": RESUME_TOKEN, "replayed": replayed.len() }));
		let (live_epoch, live_seq) = stamp_of(&live);
		assert_eq!(live_epoch, epoch);
		assert!(live_seq > since + replayed.len() as u64, "{live_seq} follows the replay");
	});
}

#[test]
fn a_second_start_answers_the_current_state_without_another_socket() {
	run(async {
		let mut harness = Harness::signed_in("twice").await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.started().await, HostingState::Online);

		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn signing_out_closes_the_relay_and_needs_a_sign_in_keeping_the_flag() {
	run(async {
		let mut harness = Harness::signed_in("signed-out").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;

		signed_out(harness.app.handle()).await;
		member.close_frame().await;

		assert_eq!(harness.state(), HostingState::NeedsSignIn);
		assert_eq!(harness.stored().await.1, vec![PERSONAL.to_owned()]);
	});
}

#[test]
fn a_flagged_space_comes_back_online_when_the_account_is_restored() {
	run(async {
		let mut harness = Harness::signed_in("resumed").await;
		let known = uuid::Uuid::new_v4().to_string();
		harness.relay.known.lock().expect("the relay").insert(known.clone());
		harness.plant(&known).await;

		resumed(harness.app.handle()).await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert!(harness.registered().is_empty());
	});
}

#[test]
fn a_registration_refused_401_needs_a_sign_in_and_opens_no_socket() {
	run(async {
		let harness = Harness::new("register-revoked", None, Some("bearer-the-cloud-forgot")).await;

		harness.started().await;
		harness.reached(HostingState::NeedsSignIn).await;

		assert!(harness.registered().is_empty());
		assert_eq!(harness.attempts(), 0);
		assert_eq!(harness.stored().await, (None, vec![PERSONAL.to_owned()]));
	});
}

#[test]
fn a_stop_during_registration_keeps_the_answered_instance_and_a_later_start_reuses_it() {
	run(async {
		let mut harness = Harness::signed_in("stop-registering").await;
		harness.relay.is_registration_open.send_replace(false);

		harness.started().await;
		let is_registering = || (!harness.registered().is_empty()).then_some(());
		harness.noticed_until("a registration", is_registering).await;
		let mut stopping = harness.running_relay().subscribe();
		let (stopped, ()) = tokio::join!(harness.stopped(), async {
			stopping.wait_for(|is_stopping| *is_stopping).await.expect("the relay is told");
			harness.relay.is_registration_open.send_replace(true);
		});
		assert_eq!(stopped, HostingState::Off);
		let (kept, flagged) = harness.stored().await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let kept = kept.expect("the answered instance was stored");
		assert!(harness.relay.known.lock().expect("the relay").contains(&kept));
		assert!(flagged.is_empty());
		assert_eq!(harness.registered().len(), 1);
		assert_eq!(harness.stored().await.0, Some(kept));
		assert_eq!(harness.attempts(), 1);
	});
}

#[test]
fn deleting_a_hosted_space_closes_its_relay_with_1000_and_reads_off() {
	run(async {
		let mut harness = Harness::signed_in("deleted").await;
		let work = {
			let state = harness.app.state::<DatabaseState>();
			let database = state.as_ref().expect("the database");
			database.spaces().create("Work".to_owned()).await.expect("the space").id
		};
		start(harness.app.handle(), work.clone()).await.expect("the hosting starts");
		let mut member = harness.member_in(&work, MEMBER_ACCOUNT).await;
		harness.reached_by(&work, HostingState::Online).await;
		members_heard(&mut member).await;

		space_delete(harness.app.handle().clone(), harness.app.state(), work.clone())
			.await
			.expect("the space is deleted");
		let closed = member.close_frame().await;

		let Some(close) = closed else {
			panic!("the relay took no close frame: {closed:?}");
		};
		assert_eq!(close.code, 1000);
		assert_eq!(harness.app.state::<Hosting>().current(&work), HostingState::Off);
		let state = harness.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		assert!(hosting.hosted_space_ids().await.expect("the flags").is_empty());
	});
}

#[test]
fn a_first_start_persists_the_intent_before_registering() {
	run(async {
		let harness = Harness::signed_in("intent").await;
		harness.relay.is_registration_down.store(true, Ordering::SeqCst);

		assert_eq!(harness.started().await, HostingState::Connecting);

		assert_eq!(harness.stored().await, (None, vec![PERSONAL.to_owned()]));
		assert!(harness.registered().is_empty());
	});
}

#[test]
fn a_space_whose_registration_never_succeeded_is_resumed_and_registered() {
	run(async {
		let mut harness = Harness::signed_in("intent-resumed").await;
		let state = harness.app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.set_hosted(PERSONAL.to_owned(), true).await.expect("the intent is kept");

		resumed(harness.app.handle()).await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		assert_eq!(harness.registered(), vec!["Personal".to_owned()]);
		assert!(harness.stored().await.0.is_some());
	});
}

const BEFORE_THE_PATCH_TIMES_OUT: Duration = Duration::from_secs(5);

const INSTANCE: &str = "6f1c2a7e-0d4b-4c9a-9a51-2f7f3f1d8c10";

impl Harness {
	async fn hosted(name: &str) -> Self {
		let harness = Self::signed_in(name).await;
		harness.plant(INSTANCE).await;
		harness
	}

	fn seed(&self, members: &[Value]) {
		self.relay.members.lock().expect("the relay").extend_from_slice(members);
	}

	fn member_calls(&self) -> Vec<String> {
		self.relay.member_calls.lock().expect("the relay").clone()
	}

	fn forget_member_calls(&self) {
		self.relay.member_calls.lock().expect("the relay").clear();
	}

	fn cloud_answers(&self, status: StatusCode, body: Value) {
		*self.relay.member_answer.lock().expect("the relay") = Some((status, body));
	}

	fn heard_member_lists(&self) -> Vec<Value> {
		let heard = self.heard_members.lock().expect("the events");
		heard
			.iter()
			.inspect(|change| assert_eq!(change["spaceId"], PERSONAL))
			.map(|change| change["members"].clone())
			.collect()
	}

	fn seed_invitations(&self, invitations: &[Value]) {
		self.relay.invitations.lock().expect("the relay").extend_from_slice(invitations);
	}

	async fn listed(&self) -> Result<SpaceMembers, MembersError> {
		list(self.app.handle(), PERSONAL.to_owned()).await
	}

	async fn invited(&self, email: &str) -> Result<SpaceMembers, MembersError> {
		invite(self.app.handle(), PERSONAL.to_owned(), email.to_owned()).await
	}

	async fn withdrawn(&self, invitation_id: &str) -> Result<SpaceMembers, MembersError> {
		withdraw(self.app.handle(), PERSONAL.to_owned(), invitation_id.to_owned()).await
	}

	async fn resent(&self, invitation_id: &str) -> Result<SpaceMembers, MembersError> {
		resend(self.app.handle(), PERSONAL.to_owned(), invitation_id.to_owned()).await
	}

	async fn removed(&self, user_id: &str) -> Result<SpaceMembers, MembersError> {
		remove(self.app.handle(), PERSONAL.to_owned(), user_id.to_owned()).await
	}

	async fn invited_again(&self, user_id: &str) -> Result<SpaceMembers, MembersError> {
		invite_again(self.app.handle(), PERSONAL.to_owned(), user_id.to_owned()).await
	}

	async fn rostered_account(&self, account_id: &str) {
		self.rostered(PERSONAL, &SealingMember::new(account_id)).await;
	}

	fn cloud_refuses(&self, call: &str, status: StatusCode, body: Value) {
		*self.relay.refused_call.lock().expect("the relay") = Some((call.to_owned(), status, body));
	}

	async fn listed_with_a_guest_and_a_joiner(&self) {
		self.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "joined"),
		]);
		self.listed().await.expect("the members list");
		self.forget_member_calls();
	}

	fn heard_invitation_lists(&self) -> Vec<Value> {
		let heard = self.heard_members.lock().expect("the events");
		heard.iter().map(|change| change["invitations"].clone()).collect()
	}
}

fn member(user_id: &str, email: &str, status: MemberStatus) -> Member {
	Member { user_id: user_id.to_owned(), name: None, email: email.to_owned(), status }
}

fn user_ids(listed: &SpaceMembers) -> Vec<&str> {
	listed.members.iter().map(|member| member.user_id.as_str()).collect()
}

fn invitation_states(listed: &SpaceMembers) -> Vec<(&str, InvitationState)> {
	listed.invitations.iter().map(|sent| (sent.email.as_str(), sent.state)).collect()
}

const LIST_READ: [&str; 2] = ["GET", "GET invitations"];

fn calls_then_read_back(calls: &[&str]) -> Vec<String> {
	calls.iter().chain(LIST_READ.iter()).map(|call| (*call).to_owned()).collect()
}

#[test]
fn the_host_the_joined_members_and_every_unused_invitation_are_listed_in_the_cloud_order() {
	run(async {
		let harness = Harness::hosted("members-list").await;
		harness.rostered_account("joiner").await;
		harness.seed(&[
			json!({ "userId": "joiner", "email": "joiner@example.com", "name": "Joiner", "role": "member", "state": "joined" }),
			cloud_member("guest", "guest@example.com", "member", "pending"),
		]);
		harness.seed_invitations(&[
			cloud_invitation("i1", "bob@example.com", "valid"),
			cloud_invitation("i2", "eve@example.com", "expired"),
			cloud_invitation("i3", "joe@example.com", "withdrawn"),
			cloud_invitation("i4", "sam@example.com", "used"),
		]);

		let listed = harness.listed().await.expect("the members list");

		assert_eq!(
			listed.members,
			vec![
				member("owner", OWNER_EMAIL, MemberStatus::Host),
				Member {
					name: Some("Joiner".to_owned()),
					..member("joiner", "joiner@example.com", MemberStatus::Joined)
				},
			]
		);
		assert_eq!(
			listed.invitations[0],
			SpaceInvitation {
				id: "i1".to_owned(),
				email: "bob@example.com".to_owned(),
				sent_at: "2026-10-01T00:00:00.000Z".to_owned(),
				expires_at: "2026-10-08T00:00:00.000Z".to_owned(),
				state: InvitationState::Invited,
			}
		);
		assert_eq!(
			invitation_states(&listed),
			vec![
				("bob@example.com", InvitationState::Invited),
				("eve@example.com", InvitationState::Expired),
				("joe@example.com", InvitationState::Withdrawn),
			]
		);
		assert_eq!(harness.member_calls(), LIST_READ);
	});
}

#[test]
fn a_joined_member_without_a_signed_roster_row_is_listed_as_needing_a_new_invitation() {
	run(async {
		let harness = Harness::hosted("members-pre-v2").await;
		harness.rostered_account("joiner").await;
		harness.seed(&[
			cloud_member("joiner", "joiner@example.com", "member", "joined"),
			cloud_member("early", "early@example.com", "member", "joined"),
			cloud_member("guest", "guest@example.com", "member", "pending"),
		]);

		let listed = harness.listed().await.expect("the members list");

		assert_eq!(
			listed.members,
			vec![
				member("owner", OWNER_EMAIL, MemberStatus::Host),
				member("joiner", "joiner@example.com", MemberStatus::Joined),
				member("early", "early@example.com", MemberStatus::NeedsInvitation),
			]
		);
		let heard = harness.heard_member_lists();
		assert_eq!(heard[0][2]["status"], "needsInvitation");
	});
}

#[test]
fn inviting_a_pre_v2_member_again_removes_the_membership_and_reads_its_address_back_invited() {
	run(async {
		let harness = Harness::hosted("members-invite-again").await;
		harness.seed(&[cloud_member("early", "early@example.com", "member", "joined")]);

		let listed = harness.invited_again("early").await.expect("the member is invited again");

		assert_eq!(user_ids(&listed), vec!["owner"]);
		assert_eq!(
			invitation_states(&listed),
			vec![("early@example.com", InvitationState::Invited)]
		);
		assert_eq!(
			harness.member_calls(),
			calls_then_read_back(&["GET", "DELETE early", "POST invitations early@example.com"])
		);
		assert_eq!(harness.heard_invitation_lists().len(), 1);
	});
}

#[test]
fn an_invitation_refused_after_the_removal_landed_is_named_as_both() {
	run(async {
		let harness = Harness::hosted("members-invite-again-refused").await;
		harness.seed(&[cloud_member("early", "early@example.com", "member", "joined")]);
		harness.cloud_refuses(
			"POST invitations early@example.com",
			StatusCode::CONFLICT,
			json!({ "error": { "code": "MEMBER_LIMIT_REACHED" } }),
		);

		let refused = harness.invited_again("early").await;

		assert_eq!(
			refused,
			Err(MembersError::RemovedButNotInvited { cause: Box::new(MembersError::LimitReached) })
		);
		assert_eq!(
			harness.member_calls(),
			vec!["GET", "DELETE early", "POST invitations early@example.com"]
		);
		assert_eq!(user_ids(&harness.listed().await.expect("the members list")), vec!["owner"]);
	});
}

#[test]
fn an_invitation_sent_again_whose_list_does_not_read_back_is_named_as_sent() {
	run(async {
		let harness = Harness::hosted("members-invite-again-unlisted").await;
		harness.seed(&[cloud_member("early", "early@example.com", "member", "joined")]);
		harness.cloud_refuses(
			"GET invitations",
			StatusCode::SERVICE_UNAVAILABLE,
			json!({ "error": { "code": "UNAVAILABLE" } }),
		);

		let refused = harness.invited_again("early").await;

		assert!(matches!(
			&refused,
			Err(MembersError::InvitedButNotListed { cause })
				if matches!(**cause, MembersError::Unreachable { .. })
		));
		assert_eq!(
			harness.member_calls(),
			calls_then_read_back(&["GET", "DELETE early", "POST invitations early@example.com"])
		);
		let sent = harness.relay.invitations.lock().expect("the relay").clone();
		assert_eq!(sent.len(), 1);
		assert_eq!(
			(&sent[0]["email"], &sent[0]["state"]),
			(&json!("early@example.com"), &json!("valid"))
		);
	});
}

#[test]
fn a_member_not_needing_a_new_invitation_is_refused_invite_again_before_any_change() {
	run(async {
		let harness = Harness::hosted("members-invite-again-mismatch").await;
		harness.listed_with_a_guest_and_a_joiner().await;
		harness.rostered_account("joiner").await;

		for user_id in ["joiner", "guest", "owner"] {
			assert_eq!(
				harness.invited_again(user_id).await,
				Err(MembersError::NotNeedingInvitation)
			);
		}
		assert_eq!(harness.invited_again("stranger").await, Err(MembersError::UnknownMember));
		assert_eq!(harness.member_calls(), vec!["GET"; 4]);
		assert_eq!(harness.heard_member_lists().len(), 1);
	});
}

#[test]
fn an_invite_is_trimmed_lowercased_posted_and_read_back_as_an_invited_invitation() {
	run(async {
		let harness = Harness::hosted("members-invite").await;

		let listed = harness.invited("  Ada@Example.COM ").await.expect("the invite lands");

		assert_eq!(invitation_states(&listed), vec![("ada@example.com", InvitationState::Invited)]);
		assert_eq!(listed.invitations[0].expires_at, "2026-10-08T00:00:00.000Z");
		assert_eq!(
			harness.member_calls(),
			calls_then_read_back(&["POST invitations ada@example.com"])
		);
		let heard = harness.heard_invitation_lists();
		assert_eq!(heard.len(), 1);
		assert_eq!(heard[0][0]["email"], "ada@example.com");
		assert_eq!(heard[0][0]["state"], "invited");
	});
}

#[test]
fn an_invitation_is_withdrawn_then_invited_again_each_read_back_and_announced() {
	run(async {
		let harness = Harness::hosted("members-withdraw").await;
		harness.seed_invitations(&[cloud_invitation("i1", "bob@example.com", "valid")]);

		let withdrawn = harness.withdrawn("i1").await.expect("the invitation is withdrawn");
		let resent = harness.resent("i1").await.expect("the invitation is sent again");

		assert_eq!(
			invitation_states(&withdrawn),
			vec![("bob@example.com", InvitationState::Withdrawn)]
		);
		assert_eq!(invitation_states(&resent), vec![("bob@example.com", InvitationState::Invited)]);
		assert_ne!(resent.invitations[0].id, "i1");
		assert_eq!(user_ids(&resent), vec!["owner"]);
		let mut calls = calls_then_read_back(&["DELETE invitations i1"]);
		calls.extend(calls_then_read_back(&["POST invitations i1/resend"]));
		assert_eq!(harness.member_calls(), calls);
		let heard = harness.heard_invitation_lists();
		assert_eq!(heard.len(), 2);
		assert_eq!(heard[0][0]["state"], "withdrawn");
		assert_eq!(heard[1][0]["state"], "invited");
	});
}

#[test]
fn an_unknown_invitation_is_refused_typed_and_announces_nothing() {
	run(async {
		let harness = Harness::hosted("members-unknown-invitation").await;

		assert_eq!(harness.withdrawn("nope").await, Err(MembersError::UnknownInvitation));
		assert_eq!(harness.resent("nope").await, Err(MembersError::UnknownInvitation));
		assert_eq!(
			harness.member_calls(),
			vec!["DELETE invitations nope", "POST invitations nope/resend"]
		);
		assert!(harness.heard_member_lists().is_empty());
	});
}

#[test]
fn a_joined_member_is_removed_with_the_list_read_back_on_a_space_never_listed_in_this_process() {
	run(async {
		let harness = Harness::hosted("members-end").await;
		harness.seed(&[cloud_member("joiner", "joiner@example.com", "member", "joined")]);

		let removed = harness.removed("joiner").await.expect("the member is removed");

		assert_eq!(user_ids(&removed), vec!["owner"]);
		assert_eq!(harness.member_calls(), calls_then_read_back(&["GET", "DELETE joiner"]));
		let heard = harness.heard_member_lists();
		assert_eq!(heard.len(), 1);
		assert_eq!(
			heard[0],
			json!([{ "userId": "owner", "name": null, "email": OWNER_EMAIL, "status": "host" }])
		);
	});
}

#[test]
fn what_is_not_an_email_is_refused_before_the_cloud_and_a_cloud_400_alike() {
	run(async {
		let harness = Harness::hosted("members-not-email").await;

		assert_eq!(harness.invited("ada@").await, Err(MembersError::NotAnEmail));
		assert!(harness.member_calls().is_empty());

		harness.cloud_answers(
			StatusCode::BAD_REQUEST,
			json!({ "error": { "code": "INVALID_EMAIL" } }),
		);
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NotAnEmail));
		assert_eq!(harness.member_calls(), vec!["POST invitations ada@example.com"]);
	});
}

#[test]
fn the_own_account_email_is_refused_before_the_cloud() {
	run(async {
		let harness = Harness::hosted("members-own").await;
		restore(harness.app.handle().clone()).await;

		assert_eq!(harness.invited(" Owner@Example.com").await, Err(MembersError::OwnAccount));
		assert!(harness.member_calls().is_empty());
	});
}

#[test]
fn the_cloud_conflicts_are_typed_refusals() {
	run(async {
		let harness = Harness::hosted("members-conflicts").await;

		for (code, refusal) in [
			("ALREADY_MEMBER", MembersError::AlreadyInvited),
			("MEMBER_LIMIT_REACHED", MembersError::LimitReached),
		] {
			harness.cloud_answers(StatusCode::CONFLICT, json!({ "error": { "code": code } }));
			assert_eq!(harness.invited("ada@example.com").await, Err(refusal));
		}
		assert!(harness.heard_member_lists().is_empty());
	});
}

#[test]
fn a_pending_member_the_host_or_an_unknown_member_is_refused_removal_from_a_fresh_read() {
	run(async {
		let harness = Harness::hosted("members-mismatch").await;
		harness.listed_with_a_guest_and_a_joiner().await;

		assert_eq!(harness.removed("guest").await, Err(MembersError::NotJoined));
		assert_eq!(harness.removed("owner").await, Err(MembersError::HostNotRemovable));
		assert_eq!(harness.removed("stranger").await, Err(MembersError::UnknownMember));
		assert_eq!(harness.member_calls(), vec!["GET"; 3]);
	});
}

#[test]
fn the_status_is_decided_on_the_cloud_list_not_on_a_stale_one() {
	run(async {
		let harness = Harness::hosted("members-stale").await;
		harness.listed_with_a_guest_and_a_joiner().await;
		for member in harness.relay.members.lock().expect("the relay").iter_mut() {
			if member["userId"] == "guest" {
				member["state"] = json!("joined");
			}
		}

		let removed = harness.removed("guest").await.expect("the now joined guest is removed");

		assert_eq!(user_ids(&removed), vec!["owner", "joiner"]);
		assert_eq!(harness.member_calls(), calls_then_read_back(&["GET", "DELETE guest"]));
	});
}

#[test]
fn a_sent_name_announces_the_unchanged_member_list_again_on_the_next_read() {
	run(async {
		let harness = Harness::hosted("members-renamed").await;
		harness.listed().await.expect("the members list");
		harness.listed().await.expect("the members list");
		assert_eq!(harness.heard_member_lists().len(), 1);

		renamed(harness.app.handle());
		harness.listed().await.expect("the members list");

		let announced = harness.heard_member_lists();
		assert_eq!(announced.len(), 2);
		assert_eq!(announced[0], announced[1]);
	});
}

#[test]
fn a_space_without_an_instance_refuses_every_member_command_before_the_cloud() {
	run(async {
		let harness = Harness::signed_in("members-not-hosting").await;

		assert_eq!(harness.listed().await, Err(MembersError::NotHosting));
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NotHosting));
		assert_eq!(harness.withdrawn("i1").await, Err(MembersError::NotHosting));
		assert_eq!(harness.resent("i1").await, Err(MembersError::NotHosting));
		assert_eq!(harness.removed("joiner").await, Err(MembersError::NotHosting));
		assert!(harness.member_calls().is_empty());
	});
}

#[test]
fn a_cloud_401_needs_a_sign_in() {
	run(async {
		let harness = Harness::hosted("members-revoked").await;
		harness.listed_with_a_guest_and_a_joiner().await;
		harness.cloud_answers(StatusCode::UNAUTHORIZED, json!({}));

		assert_eq!(harness.listed().await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.invited("ada@example.com").await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.withdrawn("i1").await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.resent("i1").await, Err(MembersError::NeedsSignIn));
		assert_eq!(harness.removed("joiner").await, Err(MembersError::NeedsSignIn));
	});
}

#[test]
fn a_5xx_or_an_unreadable_list_is_unreachable_with_its_cause() {
	run(async {
		let harness = Harness::hosted("members-5xx").await;

		harness.cloud_answers(StatusCode::SERVICE_UNAVAILABLE, json!({ "down": true }));
		assert_eq!(
			harness.listed().await,
			Err(MembersError::Unreachable {
				reason: UnreachableReason::RelayStatus { status: 503 },
				detail: r#"{"down":true}"#.to_owned(),
			})
		);

		harness.cloud_answers(StatusCode::OK, json!({ "members": [] }));
		let Err(MembersError::Unreachable { reason, detail }) = harness.listed().await else {
			panic!("an unreadable list is unreachable");
		};
		assert_eq!(reason, UnreachableReason::UnreadableList);
		assert!(detail.contains("decoding"), "{detail}");
	});
}

#[test]
fn an_invite_that_landed_but_did_not_read_back_is_told_apart_from_one_that_never_landed() {
	run(async {
		let harness = Harness::hosted("members-invite-not-read-back").await;
		harness.cloud_refuses("GET", StatusCode::BAD_GATEWAY, json!({}));

		let refused = harness.invited("ada@example.com").await;

		assert_eq!(
			refused,
			Err(MembersError::Unreachable {
				reason: UnreachableReason::ListNotReadBack {
					cause: Box::new(UnreachableReason::RelayStatus { status: 502 }),
				},
				detail: "{}".to_owned(),
			})
		);
		assert_eq!(
			harness.relay.invitations.lock().expect("the relay").len(),
			1,
			"the invitation landed"
		);
	});
}

#[test]
fn one_invitation_in_a_state_the_relay_never_sends_makes_the_list_unreachable() {
	run(async {
		let harness = Harness::hosted("members-unknown-invitation-state").await;
		harness.seed_invitations(&[
			cloud_invitation("i1", "bob@example.com", "valid"),
			cloud_invitation("i2", "eve@example.com", "invited"),
		]);

		let Err(MembersError::Unreachable { reason, .. }) = harness.listed().await else {
			panic!("an unknown invitation state is unreachable");
		};
		assert_eq!(reason, UnreachableReason::UnreadableList);
	});
}

#[test]
fn an_unreachable_cloud_is_unreachable_with_its_cause() {
	run(async {
		let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = closed.local_addr().expect("the port is named");
		drop(closed);
		let root = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-hosting-down-{}", uuid::Uuid::new_v4())),
		);
		store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("the bearer is kept");
		let cloud = format!("http://{address}");
		let database = temp_dir();
		let app = an_app_of_its_own("hosting-down", mock_builder());
		app.manage::<DatabaseState>(Ok(db::open(&database)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		app.manage(Hosting::new(&cloud, None));
		let state = app.state::<DatabaseState>();
		let hosting = state.as_ref().expect("the database").space_hosting();
		hosting.registered(PERSONAL.to_owned(), INSTANCE.to_owned()).await.expect("planted");

		let listed = list(app.handle(), PERSONAL.to_owned()).await;

		let Err(MembersError::Unreachable { reason, detail }) = listed else {
			panic!("a closed port is unreachable");
		};
		assert_eq!(reason, UnreachableReason::Transport { failure: TransportFailure::Offline });
		assert!(detail.contains("could not be reached"), "{detail}");
	});
}

#[test]
fn an_online_space_polls_its_members_and_announces_only_a_changed_list() {
	run(async {
		let mut harness =
			Harness::polling_members("members-poll", None, Some(BEARER), POLL_EVERY).await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let polled_a_few_times = || (harness.member_calls().len() >= 8).then_some(());
		harness.noticed_until("four member polls", polled_a_few_times).await;
		assert_eq!(harness.heard_member_lists().len(), 1);

		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "joined")]);
		let changed_twice = || Some(harness.heard_member_lists()).filter(|heard| heard.len() == 2);
		let heard = harness.noticed_until("a second member list", changed_twice).await;
		assert_eq!(heard.len(), 2);
		assert_eq!(heard[1][1]["userId"], "guest");
	});
}

#[test]
fn an_online_space_polls_its_members_at_once_before_the_fifteen_seconds() {
	run(async {
		let mut harness = Harness::signed_in("members-at-once").await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let is_listed = || (!harness.heard_member_lists().is_empty()).then_some(());
		harness.noticed_until("a member list", is_listed).await;

		assert_eq!(harness.heard_member_lists().len(), 1);
		assert_eq!(harness.member_calls(), LIST_READ);
	});
}

#[test]
fn the_members_are_polled_every_fifteen_seconds() {
	assert_eq!(Hosting::new("http://127.0.0.1:9", None).members_every, Duration::from_secs(15));
}

#[test]
fn a_space_that_is_not_online_does_not_poll_its_members() {
	run(async {
		let harness =
			Harness::polling_members("members-offline", None, Some(BEARER), POLL_EVERY).await;
		harness.plant(INSTANCE).await;

		let hosts = harness.app.state::<Hosting>();
		assert!(hosts.hosts().get(PERSONAL).and_then(|host| host.run.as_ref()).is_none());
		assert!(harness.member_calls().is_empty());
	});
}

const ELSEWHERE: &str = "elsewhere";
const OTHER_SPACE_REFUSAL: &str = "this command reaches outside the shared space";
const TWO_SPACES: &str = "
	INSERT INTO spaces (id, name, colour, position, created_at)
		VALUES ('elsewhere', 'Elsewhere', 'blue', 1, 1);
	INSERT INTO sections (id, space_id, name, position, created_at)
		VALUES ('s-mine', 'personal', 'Mine', 0, 1), ('s-theirs', 'elsewhere', 'Theirs', 0, 1);
	INSERT INTO bots (id, name, model, created_at)
		VALUES ('b-mine', 'Mine', 'sonnet', 1), ('b-theirs', 'Theirs', 'sonnet', 1),
			('b-shared', 'Shared', 'sonnet', 1);
	INSERT INTO bot_spaces (bot_id, space_id, joined_at)
		VALUES ('b-mine', 'personal', 1), ('b-theirs', 'elsewhere', 1),
			('b-shared', 'elsewhere', 1), ('b-shared', 'personal', 2);
	INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
		VALUES ('c-mine', 'topic', 'personal', 'Mine', 1, 1),
			('c-theirs', 'topic', 'elsewhere', 'Theirs', 1, 1),
			('c-shared', 'topic', 'elsewhere', 'Shared', 1, 1);
	INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
		VALUES ('c-shared', 'b-shared', 'lead', 1, 0);
	INSERT INTO turns (id, conversation_id, seq, started_at, completed_at)
		VALUES ('t-mine', 'c-mine', 1, 1, 1), ('t-theirs', 'c-theirs', 1, 1, 1);
	INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at,
				written_from)
		VALUES ('m-mine', 'c-mine', 't-mine', 1, 'user', 'mine', 'complete', 1, 'here'),
			('m-theirs', 'c-theirs', 't-theirs', 1, 'user', 'theirs', 'complete', 1, 'here');
";

const A_JOINER: &str = "joiner-account";

struct Guest {
	harness: Harness,
	effects: HostEffects,
	member: MemberWire,
}

impl Guest {
	async fn of_two_spaces(name: &str) -> Self {
		let (mut harness, effects) = Harness::applying_host_effects(name).await;
		db::open(&effects.database)
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the two spaces are planted");
		harness.started().await;
		let mut member = harness.member_of(A_JOINER).await;
		harness.reached(HostingState::Online).await;
		members_heard(&mut member).await;
		let mut guest = Self { harness, effects, member };
		guest.relay_listens().await;
		guest
	}

	async fn relay_listens(&mut self) {
		let probed = (CHANGED_EVENT, json!({ "spaceId": PERSONAL, "probe": 0 }));
		events::emit(self.harness.app.handle(), Event::untyped(probed.0), probed.1.clone())
			.expect("emitted");
		let expected = as_forwarded(probed);
		next_text(&mut self.member, |frame| *frame == expected).await;
	}

	async fn called(&mut self, command: &str, args: Value) -> Value {
		let frame = json!({ "id": command, "command": command, "args": args });
		send(&mut self.member, &frame.to_string()).await;
		answer(&mut self.member).await
	}

	async fn refused(&mut self, command: &str, args: Value) {
		assert_eq!(
			self.called(command, args.clone()).await,
			json!({ "id": command, "status": 403, "body": OTHER_SPACE_REFUSAL }),
			"{command} {args}"
		);
	}

	async fn forwarded(&mut self, command: &str, args: Value) {
		let answered = self.called(command, args.clone()).await;
		assert_eq!(answered["status"], json!(200), "{command} {args} {answered}");
	}
}

async fn kept_in_the_shared_space(command: &str, other: Value, shared: Value) {
	let mut guest = Guest::of_two_spaces(command).await;

	guest.refused(command, other).await;
	guest.forwarded(command, shared).await;

	assert_eq!(guest.effects.reached(), [command]);
	assert_eq!(guest.harness.state(), HostingState::Online);
}

async fn kept_in_the_space_named(command: &str, args: impl Fn(&str) -> Value) {
	kept_in_the_shared_space(command, args(ELSEWHERE), args(PERSONAL)).await;
}

fn space_named(space_id: &str) -> Value {
	json!({ "spaceId": space_id })
}

fn a_turn_summoning_a_bot() -> Value {
	json!({ "message": { "conversationId": "c-mine", "repliedToMessageId": null }, "summoned": ["b-mine"] })
}

fn an_approval_answer() -> Value {
	json!({ "scope": a_runtime_scope("c-mine"), "requestId": "p1", "decision": "allow" })
}

fn an_agent_launch() -> Value {
	json!({ "scope": a_runtime_scope("c-mine") })
}

async fn answered_as_today(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(&format!("member-{command}")).await;

	guest.forwarded(command, args).await;

	assert_eq!(guest.effects.reached(), [command]);
}

#[test]
fn a_member_sends_a_turn() {
	run(answered_as_today("conversation_send_turn", a_turn_summoning_a_bot()));
}

#[test]
fn a_member_answers_an_approval() {
	run(answered_as_today("agent_respond_to_permission", an_approval_answer()));
}

#[test]
fn a_member_launches_an_agent() {
	run(answered_as_today("agent_start_or_resume_session", an_agent_launch()));
}

#[test]
fn a_member_reads_a_conversation_page() {
	run(answered_as_today(
		"conversation_message_page",
		json!({ "conversationId": "c-mine", "beforeSeq": null, "limit": 50 }),
	));
}

fn an_env_scope_of(space_id: &str) -> Value {
	json!({ "kind": "space", "id": space_id })
}

fn a_bot_env_scope(bot_id: &str, space_id: &str) -> Value {
	json!({ "kind": "bot", "id": bot_id, "spaceId": space_id })
}

fn a_search_of(space_id: &str) -> Value {
	json!({ "query": { "text": "mine", "spaceId": space_id } })
}

#[test]
fn a_member_lists_the_members_of_the_shared_space_only() {
	run(kept_in_the_space_named("hosting_members", space_named));
}

#[test]
fn a_member_invites_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_invite_member",
		|space_id| json!({ "spaceId": space_id, "email": "friend@example.com" }),
	));
}

#[test]
fn a_member_withdraws_an_invitation_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_withdraw_invitation",
		|space_id| json!({ "spaceId": space_id, "invitationId": "i1" }),
	));
}

#[test]
fn a_member_invites_again_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_resend_invitation",
		|space_id| json!({ "spaceId": space_id, "invitationId": "i1" }),
	));
}

#[test]
fn a_member_invites_a_member_again_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_invite_member_again",
		|space_id| json!({ "spaceId": space_id, "userId": "joined" }),
	));
}

#[test]
fn a_member_removes_a_member_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"hosting_remove_member",
		|space_id| json!({ "spaceId": space_id, "userId": "joined" }),
	));
}

#[test]
fn a_member_searches_the_messages_of_the_shared_space_only() {
	run(async {
		let command = "search_messages";
		let mut guest = Guest::of_two_spaces(command).await;

		guest.refused(command, a_search_of(ELSEWHERE)).await;
		guest.forwarded(command, a_search_of(PERSONAL)).await;

		assert_eq!(guest.effects.reached(), [command]);
	});
}

#[test]
fn a_member_shuts_down_a_session_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"agent_shutdown",
		json!({ "scope": a_runtime_scope("c-theirs") }),
		json!({ "scope": a_runtime_scope("c-mine") }),
	));
}

#[test]
fn a_member_reads_the_live_sessions_of_the_shared_space_only() {
	run(kept_in_the_space_named("agent_live_sessions_in_space", space_named));
}

#[test]
fn a_member_reads_the_pending_questions_of_the_shared_space_only() {
	run(kept_in_the_space_named("agent_pending_questions_in_space", space_named));
}

#[test]
fn a_member_lists_the_env_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_list",
		json!({ "scope": an_env_scope_of(ELSEWHERE) }),
		json!({ "scope": an_env_scope_of(PERSONAL) }),
	));
}

#[test]
fn a_member_sets_an_env_entry_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_set",
		json!({ "scope": an_env_scope_of(ELSEWHERE), "name": "GREETING", "value": "member" }),
		json!({ "scope": an_env_scope_of(PERSONAL), "name": "GREETING", "value": "member" }),
	));
}

#[test]
fn a_member_deletes_an_env_entry_of_a_bot_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"env_delete",
		json!({ "scope": a_bot_env_scope("b-theirs", ELSEWHERE), "name": "GREETING" }),
		json!({ "scope": a_bot_env_scope("b-mine", PERSONAL), "name": "GREETING" }),
	));
}

#[test]
fn a_member_reads_the_application_status_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"mcp_application_status",
		json!({ "owner": an_env_scope_of(ELSEWHERE) }),
		json!({ "owner": an_env_scope_of(PERSONAL) }),
	));
}

#[test]
fn a_member_disconnects_an_application_of_the_shared_space_only() {
	let disconnect = |owner: Value| json!({ "owner": owner, "name": "granola", "url": "https://granola.test/mcp" });
	run(kept_in_the_shared_space(
		"mcp_oauth_disconnect",
		disconnect(an_env_scope_of(ELSEWHERE)),
		disconnect(an_env_scope_of(PERSONAL)),
	));
}

#[test]
fn a_member_reaches_no_env_or_application_of_the_host_person_or_outside_the_shared_space() {
	run(async {
		let mut guest = Guest::of_two_spaces("env-outside").await;
		let outside = [
			json!({ "kind": "user" }),
			a_bot_env_scope("b-theirs", PERSONAL),
			a_bot_env_scope("b-mine", ELSEWHERE),
			json!({ "kind": "server", "name": "clock", "owner": an_env_scope_of(PERSONAL) }),
		];
		let held_with_another_space = a_bot_env_scope("b-shared", PERSONAL);

		for scope in outside.clone() {
			guest.refused("env_list", json!({ "scope": scope })).await;
			guest.refused("mcp_application_status", json!({ "owner": scope })).await;
		}
		for scope in outside.into_iter().chain([held_with_another_space]) {
			guest.refused("env_set", json!({ "scope": scope, "name": "A", "value": "b" })).await;
			guest.refused("env_delete", json!({ "scope": scope, "name": "A" })).await;
			guest
				.refused(
					"mcp_oauth_disconnect",
					json!({ "owner": scope, "name": "granola", "url": "https://granola.test/mcp" }),
				)
				.await;
		}

		assert!(guest.effects.reached().is_empty(), "{:?}", guest.effects.reached());
	});
}

#[test]
fn the_live_sessions_in_a_space_hold_only_the_sessions_of_its_conversations() {
	run(async {
		let guest = Guest::of_two_spaces("live-sessions-in-space").await;
		let app = guest.harness.app.handle();
		commands::a_run_held_by_the_app(app, a_held_scope_in("c-mine", "b-mine"));
		commands::a_run_held_by_the_app(app, a_held_scope_in("c-theirs", "b-theirs"));
		commands::a_run_held_by_the_app(app, a_held_scope_in("c-shared", "b-shared"));

		let listed =
			commands::agent_live_sessions_in_space(app.state(), app.state(), PERSONAL.to_owned())
				.await
				.expect("the sessions read");

		let conversations: Vec<&str> =
			listed.iter().map(|session| session.conversation_id.as_str()).collect();
		assert_eq!(conversations, ["c-mine"]);
		assert_eq!(listed[0].bot_id, "b-mine");
		assert_eq!(listed[0].runtime_session_id, "r-c-mine");
	});
}

fn a_held_scope_in(conversation_id: &str, bot_id: &str) -> agent::RuntimeScope {
	agent::RuntimeScope {
		conversation_id: conversation_id.to_owned(),
		bot_id: bot_id.to_owned(),
		runtime_session_id: format!("r-{conversation_id}"),
		epoch: 0,
	}
}

fn a_turn_in(conversation_id: &str) -> Option<agent::EventTurn> {
	Some(agent::EventTurn {
		turn_id: format!("t-{conversation_id}"),
		conversation_id: conversation_id.to_owned(),
	})
}

fn a_question(id: &str) -> agent::AgentEvent {
	agent::AgentEvent::QuestionRequested {
		request: agent::QuestionRequest { id: id.to_owned(), questions: Vec::new(), subject: None },
	}
}

fn its_answer(id: &str) -> agent::AgentEvent {
	agent::AgentEvent::PermissionResolved {
		id: id.to_owned(),
		decision: agent::PermissionDecision::AllowOnce,
	}
}

async fn pending_in_the_space(
	app: &tauri::AppHandle<MockRuntime>,
	space_id: &str,
) -> Vec<agent::ScopedEvent> {
	commands::agent_pending_questions_in_space(app.state(), app.state(), space_id.to_owned())
		.await
		.expect("the questions read")
}

async fn pending_in_the_conversation(
	app: &tauri::AppHandle<MockRuntime>,
	conversation_id: &str,
) -> Vec<agent::ScopedEvent> {
	commands::agent_pending_questions(app.state(), conversation_id.to_owned())
		.await
		.expect("the questions read")
}

#[test]
fn the_pending_questions_in_a_space_hold_the_questions_of_each_of_its_conversations_only() {
	run(async {
		let guest = Guest::of_two_spaces("pending-questions-in-space").await;
		let app = guest.harness.app.handle();
		for (conversation_id, bot_id) in
			[("c-theirs", "b-theirs"), ("c-shared", "b-shared"), ("c-mine", "b-mine")]
		{
			commands::a_run_held_by_the_app(app, a_held_scope_in(conversation_id, bot_id))
				.emit(a_question(&format!("q-{conversation_id}")), a_turn_in(conversation_id));
		}

		let listed = pending_in_the_space(app, ELSEWHERE).await;

		let mut expected = pending_in_the_conversation(app, "c-theirs").await;
		expected.extend(pending_in_the_conversation(app, "c-shared").await);
		assert_eq!(expected.len(), 2);
		assert_eq!(listed, expected);
		assert_eq!(
			pending_in_the_space(app, PERSONAL).await,
			pending_in_the_conversation(app, "c-mine").await
		);
	});
}

#[test]
fn the_pending_questions_in_a_space_leave_out_every_question_settled_or_let_go() {
	run(async {
		let guest = Guest::of_two_spaces("pending-questions-settled").await;
		let app = guest.harness.app.handle();
		let scope = a_held_scope_in("c-theirs", "b-theirs");
		let cancelled = agent::AgentEvent::TurnEnded {
			ended: agent::TurnEnded {
				session_id: None,
				outcome: agent::TurnOutcome::Cancelled,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		};

		for settled in ["answered", "cancelled", "shut down", "taken over"] {
			let run = commands::a_run_held_by_the_app(app, scope.clone());
			run.emit(a_question(settled), a_turn_in("c-theirs"));
			assert_eq!(
				pending_in_the_space(app, ELSEWHERE).await.len(),
				1,
				"{settled} was not asked"
			);
			assert!(pending_in_the_space(app, PERSONAL).await.is_empty());

			match settled {
				"answered" => run.emit(its_answer(settled), a_turn_in("c-theirs")),
				"cancelled" => run.emit(cancelled.clone(), a_turn_in("c-theirs")),
				"shut down" => commands::shutdown_session(app, &app.state(), &scope).await,
				_ => {
					commands::a_run_held_by_the_app(app, scope.clone());
				}
			}

			assert!(
				pending_in_the_space(app, ELSEWHERE).await.is_empty(),
				"{settled} kept it listed"
			);
		}
	});
}

#[test]
fn a_relay_guest_hears_a_question_of_the_shared_space_and_its_answer_without_reading_the_conversation(
) {
	run(async {
		let mut guest = Guest::of_two_spaces("question-heard").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_live_scope_of("c-mine");
		let run = commands::a_live_run(&app, scope.clone());
		let elsewhere = commands::a_live_run(&app, a_live_scope_of("c-theirs"));

		elsewhere.emit(a_question("q-theirs"), a_turn_in("c-theirs"));
		run.emit(a_question("q-mine"), a_turn_in("c-mine"));
		run.emit(its_answer("q-mine"), a_turn_in("c-mine"));
		let heard = guest.events_until_the_marker().await;

		let expected: Vec<Value> = [a_question("q-mine"), its_answer("q-mine")]
			.into_iter()
			.map(|event| {
				let emitted = agent::ScopedEvent {
					scope: Some(scope.clone()),
					turn: a_turn_in("c-mine"),
					event,
				};
				as_forwarded((
					commands::EVENT_CHANNEL,
					serde_json::to_value(emitted).expect("a payload"),
				))
			})
			.collect();
		assert_eq!(heard, expected);
	});
}

#[test]
fn a_relay_guest_hears_a_pending_question_settled_when_the_host_shuts_its_session_down() {
	run(async {
		let mut guest = Guest::of_two_spaces("question-shut-down").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_held_scope_in("c-mine", "b-mine");
		commands::a_run_held_by_the_app(&app, scope.clone())
			.emit(a_question("q-mine"), a_turn_in("c-mine"));

		commands::shutdown_session(&app, &app.state(), &scope).await;
		let heard = guest.events_until_the_marker().await;

		let denied = agent::AgentEvent::PermissionResolved {
			id: "q-mine".to_owned(),
			decision: agent::PermissionDecision::Deny,
		};
		let expected: Vec<Value> = [a_question("q-mine"), denied]
			.into_iter()
			.map(|event| {
				let emitted = agent::ScopedEvent {
					scope: Some(scope.clone()),
					turn: a_turn_in("c-mine"),
					event,
				};
				as_forwarded((
					commands::EVENT_CHANNEL,
					serde_json::to_value(emitted).expect("a payload"),
				))
			})
			.collect();
		assert_eq!(heard, expected);
		assert!(pending_in_the_space(&app, PERSONAL).await.is_empty());
	});
}

fn held_of(command: &str, index: usize) -> reach::Held {
	match reach::reach_of(command) {
		Some(reach::Reach::Scoped(helds)) => helds[index],
		reach => panic!("{command} is not scoped: {reach:?}"),
	}
}

async fn shared_space_refusal(guest: &Guest, command: &str, args: Value) -> reach::Refusal {
	reach::stays_in_the_shared_space(guest.harness.app.handle(), PERSONAL, command, &args)
		.await
		.expect_err("the call is refused")
}

#[test]
fn the_shared_space_check_names_a_conversation_of_another_space() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-other-space").await;

		let refusal = shared_space_refusal(
			&guest,
			"conversation_message_page",
			json!({ "conversationId": "c-theirs", "beforeSeq": null, "limit": 10 }),
		)
		.await;

		assert_eq!(
			refusal,
			reach::Refusal::Unheld {
				held: held_of("conversation_message_page", 0),
				offending: reach::Offending::Value(json!("c-theirs")),
			}
		);
	});
}

#[test]
fn the_shared_space_check_names_a_missing_required_id_as_absent() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-absent").await;

		let missing = shared_space_refusal(&guest, "conversation_message_page", json!({})).await;
		let null = shared_space_refusal(
			&guest,
			"conversation_message_page",
			json!({ "conversationId": null }),
		)
		.await;

		let absent = reach::Refusal::Unheld {
			held: held_of("conversation_message_page", 0),
			offending: reach::Offending::Absent,
		};
		assert_eq!(missing, absent);
		assert_eq!(null, absent);
	});
}

#[test]
fn the_shared_space_check_names_the_first_unheld_id_of_an_array() {
	run(async {
		let guest = Guest::of_two_spaces("refusal-array").await;

		let refusal = shared_space_refusal(
			&guest,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "botIds": ["b-mine", "b-theirs", "b-other"] }),
		)
		.await;

		assert_eq!(
			refusal,
			reach::Refusal::Unheld {
				held: held_of("conversation_create", 2),
				offending: reach::Offending::Value(json!("b-theirs")),
			}
		);
	});
}

#[test]
fn the_refusal_line_names_the_command_space_argument_check_and_value_and_no_account() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_message_page", 0),
		offending: reach::Offending::Value(json!("c-theirs")),
	};

	assert_eq!(
		reach::refusal_line("conversation_message_page", PERSONAL, &refusal),
		"the relayed conversation_message_page was refused outside shared space personal: \
		 /conversationId failed the Conversation check with \"c-theirs\""
	);
}

#[test]
fn the_refusal_line_logs_a_missing_value_as_absent() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_list", 0),
		offending: reach::Offending::Absent,
	};

	assert_eq!(
		reach::refusal_line("conversation_list", PERSONAL, &refusal),
		"the relayed conversation_list was refused outside shared space personal: /spaceId \
		 failed the Space check with absent"
	);
}

#[test]
fn the_refusal_line_names_the_reach_when_there_is_no_argument() {
	assert_eq!(
		reach::refusal_line("account_get", PERSONAL, &reach::Refusal::HostOnly),
		"the relayed account_get was refused outside shared space personal: its reach is HostOnly"
	);
	assert_eq!(
		reach::refusal_line("unknown", PERSONAL, &reach::Refusal::NoReach),
		"the relayed unknown was refused outside shared space personal: it has no reach"
	);
}

#[test]
fn the_refusal_line_caps_the_value_at_200_characters() {
	let refusal = reach::Refusal::Unheld {
		held: held_of("conversation_message_page", 0),
		offending: reach::Offending::Value(json!("x".repeat(500))),
	};

	let line = reach::refusal_line("conversation_message_page", PERSONAL, &refusal);

	let value = line.rsplit(" with ").next().expect("a value is logged");
	assert_eq!(value, format!("\"{}", "x".repeat(199)));
}

#[test]
fn a_relay_guest_reads_the_bots_of_the_shared_space_only() {
	run(kept_in_the_space_named("conversation_bots", space_named));
}

#[test]
fn a_relay_guest_reads_the_bots_by_presence_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_bots_by_presence",
		|space_id| json!({ "spaceId": space_id, "excludedConversationId": null }),
	));
}

#[test]
fn a_relay_guest_creates_a_bot_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create_bot",
		|space_id| json!({ "spaceId": space_id, "identity": {} }),
	));
}

#[test]
fn a_relay_guest_creates_a_bot_from_a_draft_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create_bot_from_draft",
		|space_id| json!({ "spaceId": space_id, "draft": {} }),
	));
}

#[test]
fn a_relay_guest_duplicates_a_bot_into_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_duplicate_bot",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_opens_a_main_chat_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_main_chat",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_reads_the_solo_states_of_the_shared_space_only() {
	run(kept_in_the_space_named("conversation_solo_states", space_named));
}

#[test]
fn a_relay_guest_creates_a_conversation_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_create",
		|space_id| json!({ "spaceId": space_id, "sectionId": null, "title": "t", "botIds": ["b-mine"] }),
	));
}

#[test]
fn a_relay_guest_lists_the_conversations_of_the_shared_space_only() {
	run(kept_in_the_space_named("conversation_list", space_named));
}

#[test]
fn a_relay_guest_pages_the_conversations_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"conversation_page",
		|space_id| json!({ "spaceId": space_id, "cursor": null, "limit": null }),
	));
}

#[test]
fn a_relay_guest_reads_the_hosting_state_of_the_shared_space_only() {
	run(kept_in_the_space_named("hosting_state", space_named));
}

#[test]
fn a_relay_guest_reads_the_mission_feed_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"mission_space_feed",
		|space_id| json!({ "spaceId": space_id, "closedSince": 0 }),
	));
}

#[test]
fn a_relay_guest_pages_the_mission_feed_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"mission_space_page",
		|space_id| json!({ "spaceId": space_id, "closedSince": 0, "cursor": null, "limit": null }),
	));
}

#[test]
fn a_relay_guest_searches_the_catalogue_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"search_catalogue",
		|space_id| json!({ "query": "q", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_reads_the_recent_chats_of_the_shared_space_only() {
	run(kept_in_the_space_named("search_recent", |space_id| json!({ "spaceId": space_id })));
}

#[test]
fn a_relay_guest_asking_for_every_space_is_answered_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("all-spaces").await;
		let mut messages = a_search_of(PERSONAL);
		messages["query"]["allSpaces"] = json!(true);

		let catalogue = guest
			.called(
				"search_catalogue",
				json!({ "query": "", "spaceId": PERSONAL, "allSpaces": true }),
			)
			.await;
		let recent =
			guest.called("search_recent", json!({ "spaceId": PERSONAL, "allSpaces": true })).await;
		let hits = guest.called("search_messages", messages).await;

		let spaces_of = |rows: &Value| -> Vec<String> {
			rows.as_array()
				.expect("a list of rows")
				.iter()
				.map(|row| row["spaceId"].as_str().expect("a space id").to_owned())
				.collect()
		};
		assert_eq!(spaces_of(&catalogue["body"]["chats"]), [PERSONAL], "{catalogue}");
		assert_eq!(spaces_of(&recent["body"]), [PERSONAL], "{recent}");
		assert_eq!(spaces_of(&hits["body"]), [PERSONAL], "{hits}");
		assert_eq!(
			guest.effects.reached(),
			["search_catalogue", "search_recent", "search_messages"]
		);
	});
}

#[test]
fn a_relay_guest_lists_the_sections_of_the_shared_space_only() {
	run(kept_in_the_space_named("section_list", space_named));
}

#[test]
fn a_relay_guest_creates_a_section_in_the_shared_space_only() {
	run(kept_in_the_space_named(
		"section_create",
		|space_id| json!({ "spaceId": space_id, "name": "n" }),
	));
}

#[test]
fn a_relay_guest_pins_the_roster_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"roster_pin",
		|space_id| json!({ "spaceId": space_id, "pins": [] }),
	));
}

#[test]
fn a_relay_guest_moves_a_bot_to_a_section_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_move_to_section",
		|space_id| json!({ "botId": "b-mine", "sectionId": "s-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_updates_the_shared_space_only() {
	run(kept_in_the_space_named(
		"space_update",
		|space_id| json!({ "id": space_id, "name": "n", "colour": null }),
	));
}

#[test]
fn a_relay_guest_cannot_move_a_bot_out_of_the_shared_space() {
	run(kept_in_the_space_named(
		"bot_move_to_space",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_adds_a_bot_to_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_add_to_space",
		|space_id| json!({ "botId": "b-mine", "spaceId": space_id, "sectionId": null }),
	));
}

#[test]
fn a_relay_guest_removes_a_bot_from_the_shared_space_only() {
	run(kept_in_the_space_named(
		"bot_remove_from_space",
		|space_id| json!({ "botId": "b-shared", "spaceId": space_id }),
	));
}

#[test]
fn a_relay_guest_reads_the_preferences_of_the_shared_space_only() {
	run(kept_in_the_space_named("space_preferences", space_named));
}

#[test]
fn a_relay_guest_sets_the_preferences_of_the_shared_space_only() {
	run(kept_in_the_space_named(
		"space_set_preferences",
		|space_id| json!({ "spaceId": space_id, "preferences": {} }),
	));
}

#[test]
fn a_relay_guest_reaches_the_plugin_of_the_shared_space_or_its_bots_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("plugin-scopes").await;
		let plugin_commands: Vec<&str> = super::reach::REACHES
			.iter()
			.map(|(command, _)| *command)
			.filter(|command| command.starts_with("plugin_"))
			.collect();

		for command in &plugin_commands {
			for other in [
				json!({ "kind": "space", "id": ELSEWHERE }),
				json!({ "kind": "bot", "id": "b-theirs" }),
				json!({ "kind": "space" }),
			] {
				guest.refused(command, json!({ "scope": other })).await;
			}
			for shared in [
				json!({ "kind": "space", "id": PERSONAL }),
				json!({ "kind": "bot", "id": "b-mine" }),
			] {
				guest.forwarded(command, json!({ "scope": shared })).await;
			}
			let shared_in = json!({ "scope": { "kind": "bot", "id": "b-shared" } });
			if PLUGIN_READS.contains(command) {
				guest.forwarded(command, shared_in).await;
			} else {
				guest.refused(command, shared_in).await;
			}
		}

		let reached = guest.effects.reached();
		assert_eq!(reached.len(), plugin_commands.len() * 2 + PLUGIN_READS.len());
	});
}

#[test]
fn a_relay_guest_omitting_the_space_id_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("omitted-space").await;

		guest.refused("conversation_list", json!({})).await;
		guest.refused("conversation_list", json!({ "spaceId": null })).await;

		assert!(guest.effects.reached().is_empty());
	});
}

#[test]
fn a_relay_guest_reads_a_conversation_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_message_page",
		json!({ "conversationId": "c-theirs", "beforeSeq": null, "limit": 10 }),
		json!({ "conversationId": "c-mine", "beforeSeq": null, "limit": 10 }),
	));
}

#[test]
fn a_relay_guest_cannot_seat_a_bot_of_another_space_in_a_shared_conversation() {
	run(kept_in_the_shared_space(
		"conversation_add_participant",
		json!({ "conversationId": "c-mine", "botId": "b-theirs", "invitedByBotId": null }),
		json!({ "conversationId": "c-mine", "botId": "b-shared", "invitedByBotId": null }),
	));
}

#[test]
fn a_relay_guest_updates_a_bot_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_update_bot",
		json!({ "id": "b-theirs", "identity": {} }),
		json!({ "id": "b-mine", "identity": {} }),
	));
}

#[test]
fn a_bot_added_to_the_shared_space_from_another_one_belongs_to_the_shared_space() {
	run(kept_in_the_shared_space(
		"conversation_bot_commands",
		json!({ "botId": "b-theirs" }),
		json!({ "botId": "b-shared" }),
	));
}

#[test]
fn a_relay_guest_cannot_start_a_conversation_seating_a_bot_of_another_space() {
	run(kept_in_the_shared_space(
		"conversation_create",
		json!({ "spaceId": PERSONAL, "sectionId": null, "title": "t", "botIds": ["b-mine", "b-theirs"] }),
		json!({ "spaceId": PERSONAL, "sectionId": "s-mine", "title": "t", "botIds": ["b-mine", "b-shared"] }),
	));
}

#[test]
fn a_relay_guest_renames_a_section_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"section_rename",
		json!({ "id": "s-theirs", "name": "n" }),
		json!({ "id": "s-mine", "name": "n" }),
	));
}

#[test]
fn a_relay_guest_completes_a_turn_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_complete_turn",
		json!({ "id": "t-theirs", "completedAt": 1 }),
		json!({ "id": "t-mine", "completedAt": 1 }),
	));
}

#[test]
fn a_relay_guest_writes_a_message_of_the_shared_space_only() {
	run(kept_in_the_shared_space(
		"conversation_append_user_message",
		json!({ "message": {
			"id": "new", "conversationId": "c-mine", "turnId": "t-mine",
			"authorBotId": null, "repliedToMessageId": "m-theirs", "content": "c", "createdAt": 1
		} }),
		json!({ "message": {
			"id": "new", "conversationId": "c-mine", "turnId": "t-mine",
			"authorBotId": "b-mine", "repliedToMessageId": "m-mine", "content": "c", "createdAt": 1
		} }),
	));
}

#[test]
fn a_relay_guest_naming_a_row_the_host_does_not_hold_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("unknown-child").await;

		guest.refused("conversation_delete", json!({ "conversationId": "c-unknown" })).await;
		guest.refused("conversation_delete_bot", json!({ "id": "b-unknown" })).await;
		guest.refused("mission_detail", json!({ "missionId": "mi-unknown" })).await;
		guest.refused("routine_key", json!({ "id": "r-unknown" })).await;
		guest.refused("routine_renew_lease", json!({ "runId": "run-unknown" })).await;

		assert!(guest.effects.reached().is_empty());
	});
}

#[test]
fn a_child_lookup_the_store_fails_is_refused() {
	run(async {
		let mut guest = Guest::of_two_spaces("failed-lookup").await;
		db::open(&guest.effects.database)
			.call_mut(|connection| {
				Ok(connection.execute_batch("ALTER TABLE sections RENAME TO sections_gone")?)
			})
			.await
			.expect("the sections table is moved away");

		guest.refused("section_rename", json!({ "id": "s-mine", "name": "n" })).await;

		assert!(guest.effects.reached().is_empty());
		assert_eq!(guest.harness.state(), HostingState::Online);
	});
}

const PLUGIN_READS: [&str; 5] = [
	"plugin_skills",
	"plugin_skill_file",
	"plugin_mcp_servers",
	"plugin_history",
	"plugin_history_diff",
];

async fn footprint_of(
	database: &std::path::Path,
	bot_id: &str,
) -> (bool, Vec<String>, Vec<String>) {
	let bot_id = bot_id.to_owned();
	db::open(database)
		.call(move |connection| {
			let texts = |query: &str| -> rusqlite::Result<Vec<String>> {
				let mut statement = connection.prepare(query)?;
				let rows = statement.query_map([&bot_id], |row| row.get(0))?;
				rows.collect()
			};
			let is_stored = !texts("SELECT id FROM bots WHERE id = ?1")?.is_empty();
			let spaces =
				texts("SELECT space_id FROM bot_spaces WHERE bot_id = ?1 ORDER BY space_id")?;
			let chats = texts(
				"SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1
					ORDER BY conversation_id",
			)?;
			Ok((is_stored, spaces, chats))
		})
		.await
		.expect("the bot footprint reads")
}

async fn a_write_on_a_bot_in_two_spaces_is_refused(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(command).await;
	let before = footprint_of(&guest.effects.database, "b-shared").await;

	guest.refused(command, args).await;

	assert!(guest.effects.reached().is_empty());
	assert_eq!(footprint_of(&guest.effects.database, "b-shared").await, before);
	assert_eq!(
		before,
		(true, vec![ELSEWHERE.to_owned(), PERSONAL.to_owned()], vec!["c-shared".to_owned()])
	);
}

async fn a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(command: &str, args: Value) {
	let mut guest = Guest::of_two_spaces(command).await;

	guest.forwarded(command, args).await;

	assert_eq!(guest.effects.reached(), [command]);
}

fn a_bot_plugin(bot_id: &str) -> Value {
	json!({ "scope": { "kind": "bot", "id": bot_id } })
}

#[test]
fn a_relay_guest_cannot_update_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_update_bot",
		json!({ "id": "b-shared", "identity": {} }),
	));
}

#[test]
fn a_relay_guest_updates_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_update_bot",
		json!({ "id": "b-mine", "identity": {} }),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_delete_bot",
		json!({ "id": "b-shared" }),
	));
}

#[test]
fn a_relay_guest_deletes_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_delete_bot",
		json!({ "id": "b-mine" }),
	));
}

#[test]
fn a_relay_guest_cannot_set_the_avatar_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_set_bot_avatar_image",
		json!({ "id": "b-shared", "bytes": [] }),
	));
}

#[test]
fn a_relay_guest_sets_the_avatar_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_set_bot_avatar_image",
		json!({ "id": "b-mine", "bytes": [] }),
	));
}

#[test]
fn a_relay_guest_cannot_set_the_memory_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_set_bot_memory",
		json!({ "id": "b-shared", "memory": "m" }),
	));
}

#[test]
fn a_relay_guest_sets_the_memory_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_set_bot_memory",
		json!({ "id": "b-mine", "memory": "m" }),
	));
}

#[test]
fn a_relay_guest_cannot_record_the_commands_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"conversation_record_bot_commands",
		json!({ "botId": "b-shared", "commands": [] }),
	));
}

#[test]
fn a_relay_guest_records_the_commands_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"conversation_record_bot_commands",
		json!({ "botId": "b-mine", "commands": [] }),
	));
}

#[test]
fn a_relay_guest_cannot_create_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_create_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_creates_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_create_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_update_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_update_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_updates_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_update_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_preload_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_set_skill_preloaded",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_preloads_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_set_skill_preloaded",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_skill_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_delete_skill", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_deletes_a_skill_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_skill",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_write_a_skill_file_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_write_skill_file",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_writes_a_skill_file_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_write_skill_file",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_skill_file_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_delete_skill_file",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_deletes_a_skill_file_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_skill_file",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_set_a_server_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_set_mcp_server",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_sets_a_server_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_set_mcp_server",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_delete_a_server_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"plugin_delete_mcp_server",
		a_bot_plugin("b-shared"),
	));
}

#[test]
fn a_relay_guest_deletes_a_server_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_delete_mcp_server",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_revert_the_plugin_of_a_bot_also_in_another_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused("plugin_revert", a_bot_plugin("b-shared")));
}

#[test]
fn a_relay_guest_reverts_the_plugin_of_a_bot_of_the_shared_space_alone() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"plugin_revert",
		a_bot_plugin("b-mine"),
	));
}

#[test]
fn a_relay_guest_cannot_move_a_bot_also_in_another_space_into_the_shared_space() {
	run(a_write_on_a_bot_in_two_spaces_is_refused(
		"bot_move_to_space",
		json!({ "botId": "b-shared", "spaceId": PERSONAL }),
	));
}

#[test]
fn a_relay_guest_moves_a_bot_of_the_shared_space_alone_into_the_shared_space() {
	run(a_write_on_a_bot_of_the_shared_space_alone_is_forwarded(
		"bot_move_to_space",
		json!({ "botId": "b-mine", "spaceId": PERSONAL }),
	));
}

fn a_runtime_scope(conversation_id: &str) -> Value {
	json!({ "conversationId": conversation_id, "botId": "b-mine", "runtimeSessionId": "r", "epoch": 0 })
}

#[test]
fn a_relay_guest_cannot_pick_the_start_folder_of_a_session() {
	run(async {
		let command = "agent_start_or_resume_session";
		let mut guest = Guest::of_two_spaces("start-folder").await;

		guest.refused(command, json!({ "scope": a_runtime_scope("c-mine"), "cwd": "/" })).await;
		guest.forwarded(command, json!({ "scope": a_runtime_scope("c-mine"), "cwd": null })).await;
		guest.forwarded(command, json!({ "scope": a_runtime_scope("c-mine") })).await;

		assert_eq!(guest.effects.reached(), [command, command]);
	});
}

fn a_shared_space_marker() -> (&'static str, Value) {
	(CHANGED_EVENT, json!({ "spaceId": PERSONAL, "marker": true }))
}

fn as_forwarded((event, payload): (&str, Value)) -> Value {
	json!({ "event": { "event": event, "payload": payload } })
}

fn an_agent_event_of(scope: Value) -> (&'static str, Value) {
	(commands::EVENT_CHANNEL, json!({ "scope": scope, "event": { "type": "turnStarted" } }))
}

impl Guest {
	async fn first_event_after(&mut self, published: Vec<(&'static str, Value)>) -> Value {
		for (event, payload) in published {
			events::emit(self.harness.app.handle(), Event::untyped(event), payload)
				.expect("emitted");
		}
		next_text(&mut self.member, |frame| frame.get("event").is_some()).await
	}

	async fn breaks_the_child_lookups(&self) {
		db::open(&self.effects.database)
			.call_mut(|connection| {
				Ok(connection.execute_batch("ALTER TABLE conversations RENAME TO gone")?)
			})
			.await
			.expect("the conversations table is renamed");
	}
}

fn a_conversation_in(space_id: &str) -> &'static str {
	if space_id == PERSONAL {
		"c-mine"
	} else {
		"c-theirs"
	}
}

async fn only_the_shared_space_frame_is_heard(of_space: impl Fn(&str) -> (&'static str, Value)) {
	let mut guest = Guest::of_two_spaces("scoped-event").await;

	let heard = guest.first_event_after(vec![of_space(ELSEWHERE), of_space(PERSONAL)]).await;

	assert_eq!(heard, as_forwarded(of_space(PERSONAL)));
}

#[test]
fn a_relay_guest_hears_an_agent_event_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		an_agent_event_of(a_runtime_scope(a_conversation_in(space_id)))
	}));
}

#[test]
fn a_relay_guest_hears_a_routine_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(ROUTINE_CHANGED_EVENT, json!({ "conversationId": a_conversation_in(space_id) }))
	}));
}

#[test]
fn a_relay_guest_hears_a_hosting_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(CHANGED_EVENT, json!({ "spaceId": space_id, "state": "online" }))
	}));
}

#[test]
fn a_relay_guest_hears_a_members_change_of_the_shared_space_only() {
	run(only_the_shared_space_frame_is_heard(|space_id| {
		(MEMBERS_CHANGED_EVENT, json!({ "spaceId": space_id, "members": [] }))
	}));
}

#[test]
fn a_relay_guest_hears_no_host_only_event() {
	run(async {
		let mut guest = Guest::of_two_spaces("host-only-events").await;
		let host_only = reach::AUDIENCES
			.iter()
			.filter(|(_, audience)| matches!(audience, reach::Audience::HostOnly))
			.map(|(event, _)| (*event, json!({ "spaceId": PERSONAL, "conversationId": "c-mine" })));

		let heard =
			guest.first_event_after(host_only.chain([a_shared_space_marker()]).collect()).await;

		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

async fn kept_off_the_relay(published: (&'static str, Value)) {
	let mut guest = Guest::of_two_spaces("kept-off").await;

	let heard = guest.first_event_after(vec![published, a_shared_space_marker()]).await;

	assert_eq!(heard, as_forwarded(a_shared_space_marker()));
}

#[test]
fn a_relay_guest_hears_no_event_left_unclassified() {
	run(kept_off_the_relay(("test://unclassified", json!({ "spaceId": PERSONAL }))));
}

#[test]
fn a_relay_guest_hears_no_event_whose_payload_misses_its_scope() {
	run(kept_off_the_relay((ROUTINE_CHANGED_EVENT, json!({ "conversationId": null }))));
}

#[test]
fn a_relay_guest_hears_no_event_whose_child_lookup_failed() {
	run(async {
		let mut guest = Guest::of_two_spaces("failed-lookup").await;
		guest.breaks_the_child_lookups().await;

		let published = vec![an_agent_event_of(a_runtime_scope("c-mine")), a_shared_space_marker()];
		let heard = guest.first_event_after(published).await;

		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

#[test]
fn a_relay_guest_hears_a_known_child_again_without_another_lookup() {
	run(async {
		let mut guest = Guest::of_two_spaces("cached-child").await;
		let mine = an_agent_event_of(a_runtime_scope("c-mine"));
		assert_eq!(guest.first_event_after(vec![mine.clone()]).await, as_forwarded(mine.clone()));

		guest.breaks_the_child_lookups().await;
		let heard = guest.first_event_after(vec![mine.clone()]).await;

		assert_eq!(heard, as_forwarded(mine));
	});
}

impl Guest {
	async fn events_until_the_marker(&mut self) -> Vec<Value> {
		let marker = a_shared_space_marker();
		events::emit(self.harness.app.handle(), Event::untyped(marker.0), marker.1)
			.expect("emitted");
		let mut heard = Vec::new();
		loop {
			let frame = next_text(&mut self.member, |frame| frame.get("event").is_some()).await;
			if frame == as_forwarded(a_shared_space_marker()) {
				return heard;
			}
			heard.push(frame);
		}
	}
}

fn a_turn_of_the_shared_conversation() -> Vec<agent::AgentEvent> {
	let reply = agent::ChatMessage {
		id: "m-reply".to_owned(),
		role: agent::MessageRole::Assistant,
		text: "hello".to_owned(),
		completion: agent::MessageCompletion::Complete,
		timestamp: 1,
	};
	vec![
		agent::AgentEvent::TurnChanged { state: agent::TurnState::Running },
		agent::AgentEvent::MessageStarted {
			message: agent::ChatMessage {
				text: String::new(),
				completion: agent::MessageCompletion::Streaming,
				..reply.clone()
			},
		},
		agent::AgentEvent::MessageDelta { id: reply.id.clone(), seq: 1, text: reply.text.clone() },
		agent::AgentEvent::MessageCompleted { message: reply },
		agent::AgentEvent::TurnChanged { state: agent::TurnState::Idle },
	]
}

fn a_live_scope_of(conversation_id: &str) -> agent::RuntimeScope {
	serde_json::from_value(a_runtime_scope(conversation_id)).expect("a runtime scope")
}

#[test]
fn a_relay_guest_hears_every_event_of_a_host_turn_in_the_shared_conversation_in_order() {
	run(async {
		let mut guest = Guest::of_two_spaces("live-turn").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_live_scope_of("c-mine");
		let run = commands::a_live_run(&app, scope.clone());
		let turn =
			agent::EventTurn { turn_id: "t-mine".to_owned(), conversation_id: "c-mine".to_owned() };
		let checking =
			agent::AgentEvent::ConnectionChanged { state: agent::ConnectionState::Checking };

		let elsewhere = commands::a_live_run(&app, a_live_scope_of("c-theirs"));
		let turn_elsewhere = agent::EventTurn {
			turn_id: "t-theirs".to_owned(),
			conversation_id: "c-theirs".to_owned(),
		};

		commands::a_host_wide_announce(&app, checking.clone());
		commands::a_host_wide_announce(&app, checking);
		for event in a_turn_of_the_shared_conversation() {
			elsewhere.emit(event.clone(), Some(turn_elsewhere.clone()));
			run.emit(event, Some(turn.clone()));
		}
		let heard = guest.events_until_the_marker().await;

		let expected: Vec<Value> = a_turn_of_the_shared_conversation()
			.into_iter()
			.map(|event| {
				let emitted = agent::ScopedEvent {
					scope: Some(scope.clone()),
					turn: Some(turn.clone()),
					event,
				};
				as_forwarded((
					commands::EVENT_CHANNEL,
					serde_json::to_value(emitted).expect("a payload"),
				))
			})
			.collect();
		assert_eq!(heard, expected);
	});
}

#[test]
fn a_relay_guest_hears_the_end_of_a_host_turn_in_the_shared_conversation() {
	run(async {
		let mut guest = Guest::of_two_spaces("turn-ended").await;
		let app = guest.harness.app.handle().clone();
		let scope = a_live_scope_of("c-mine");
		let run = commands::a_live_run(&app, scope.clone());
		let turn =
			agent::EventTurn { turn_id: "t-mine".to_owned(), conversation_id: "c-mine".to_owned() };
		let ended = agent::AgentEvent::TurnEnded {
			ended: agent::TurnEnded {
				session_id: None,
				outcome: agent::TurnOutcome::Completed,
				structured_output: None,
				total_cost_usd: None,
				model_usage: None,
			},
		};

		run.emit(ended.clone(), Some(turn.clone()));
		let heard = guest.events_until_the_marker().await;

		let emitted = agent::ScopedEvent { scope: Some(scope), turn: Some(turn), event: ended };
		assert_eq!(
			heard,
			[as_forwarded((
				commands::EVENT_CHANNEL,
				serde_json::to_value(emitted).expect("a payload")
			))]
		);
	});
}

#[test]
fn a_relay_guest_hears_the_state_change_of_a_main_conversation_of_the_shared_space() {
	run(async {
		let mut guest = Guest::of_two_spaces("main-state").await;
		let app = guest.harness.app.handle().clone();
		let database = db::open(&guest.effects.database);
		let conversations = database.conversations();
		let main = conversations
			.ensure_chat("b-mine".to_owned(), Some(PERSONAL.to_owned()))
			.await
			.expect("the main conversation opens");
		let prompt = a_pending_prompt(&main.id, PromptKind::Permission);
		conversations.hold_prompt(prompt).await.expect("the prompt is held");

		conversation_state::observe(&app, &database, &main.id).await.expect("the state reads");
		let heard = guest.events_until_the_marker().await;

		let changed = json!({
			"conversationId": main.id,
			"spaceId": PERSONAL,
			"state": "needs_you",
			"pendingPrompt": { "promptId": "p1", "kind": "permission", "text": "Run git push" },
			"workingBotIds": [],
		});
		assert_eq!(heard, [as_forwarded((STATE_CHANGED_EVENT, changed))]);
	});
}

#[test]
fn a_host_wide_connection_check_reaches_no_relay_guest_and_is_not_logged_as_kept_off() {
	run(async {
		let mut guest = Guest::of_two_spaces("host-wide-check").await;
		let app = guest.harness.app.handle().clone();
		let mut published = events::subscribed(&app);

		commands::a_host_wide_announce(
			&app,
			agent::AgentEvent::ConnectionChanged { state: agent::ConnectionState::Checking },
		);
		let heard = guest.events_until_the_marker().await;

		assert_eq!(heard, Vec::<Value>::new());
		let frame: Value =
			serde_json::from_str(&published.recv().await.expect("the check is published"))
				.expect("a json frame");
		assert_eq!(frame["event"], json!(commands::EVENT_CHANNEL));
		assert_eq!(
			reach::verdict(commands::EVENT_CHANNEL, &frame["payload"]),
			reach::Verdict::HostOnly
		);
	});
}

const GUEST: &str = "guest-account";
const GUEST_EMAIL: &str = "guest@example.com";
const HOST_NAME: &str = "Ada on the host";

struct Authoring {
	app: AppOfItsOwn,
	window: WebviewWindow<MockRuntime>,
	local: LocalApi,
	conversation_id: String,
	_root: RemovedOnDrop,
}

impl Authoring {
	async fn new(bearer: Option<&str>) -> Self {
		let cloud = served(Router::new().route("/me", get(me))).await;
		let app = an_app_of_its_own(
			"hosting-authorship",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		app.manage(db::bootstrap(app.handle()));
		let root = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-hosting-authorship-{}", uuid::Uuid::new_v4())),
		);
		if let Some(bearer) = bearer {
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer)
				.expect("the bearer is kept");
		}
		app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), &cloud));
		restore(app.handle().clone()).await;
		app.manage(webhook::start(app.handle().clone()));
		let local = super::local_api(app.handle()).expect("the local host api listens");
		app.manage(Hosting::new(&cloud, Some(local.clone())));
		app.state::<Hosting>().hosts().entry(PERSONAL.to_owned()).or_default().members =
			Some(SpaceMembers {
				members: vec![Member {
					user_id: GUEST.to_owned(),
					name: None,
					email: GUEST_EMAIL.to_owned(),
					status: MemberStatus::Joined,
				}],
				invitations: Vec::new(),
			});
		let window = WebviewWindowBuilder::new(app.handle(), "main", Default::default())
			.build()
			.expect("the window builds");
		let mut preferences = direct(&window, "user_preferences", json!({}));
		preferences["displayName"] = json!(HOST_NAME);
		direct(&window, "user_set_preferences", json!({ "preferences": preferences }));
		let chat = direct(&window, "conversation_main_chat", json!({ "botId": "default" }));
		let conversation_id = chat["id"].as_str().expect("the chat holds an id").to_owned();
		Self { app, window, local, conversation_id, _root: root }
	}

	fn turn(&self, turn_id: &str) {
		direct(
			&self.window,
			"conversation_start_turn",
			json!({ "turn": { "id": turn_id, "conversationId": self.conversation_id, "startedAt": 1 } }),
		);
	}

	fn sent(&self, id: &str) -> Value {
		self.turn(id);
		self.unstarted(id)
	}

	fn unstarted(&self, id: &str) -> Value {
		json!({
			"message": {
				"id": id,
				"conversationId": self.conversation_id,
				"turnId": id,
				"authorBotId": null,
				"repliedToMessageId": null,
				"content": "hello",
				"createdAt": 1,
				"authorAccountId": "forged-account",
				"authorName": "Forged",
			},
			"summoned": [],
		})
	}

	async fn relayed(&self, frame: Value) -> Value {
		self.relayed_by(GUEST, frame).await
	}

	async fn relayed_by(&self, account_id: &str, frame: Value) -> Value {
		let answer = self.answered_by(account_id, frame).await;
		assert_eq!(answer["status"], json!(200), "{answer}");
		answer["body"].clone()
	}

	async fn answered(&self, frame: Value) -> Value {
		self.answered_by(GUEST, frame).await
	}

	async fn answered_by(&self, account_id: &str, frame: Value) -> Value {
		let call =
			super::bridge::member_call(&frame.to_string(), account_id).expect("a member call");
		let answer = super::bridge::bridged(
			self.app.handle().clone(),
			self.local.clone(),
			PERSONAL.to_owned(),
			call,
		)
		.await;
		serde_json::from_str(&answer).expect("a json answer")
	}

	fn page(&self) -> Value {
		json!({ "conversationId": self.conversation_id, "beforeSeq": null, "limit": 50 })
	}

	fn reopened_store(&self) -> db::Database {
		let file = db::connection::file(self.app.handle()).expect("the store file is known");
		db::open(file.parent().expect("the store lives in a directory"))
	}

	async fn stored_authors(
		database: &db::Database,
		conversation_id: &str,
	) -> Vec<(String, Option<String>, Option<String>)> {
		database
			.messages()
			.page_messages(MessagePageQuery {
				conversation_id: conversation_id.to_owned(),
				before_seq: None,
				limit: 50,
			})
			.await
			.expect("the reopened store reads its page")
			.messages
			.into_iter()
			.filter(|message| message.role == MessageRole::User)
			.map(|message| (message.id, message.author.account_id, message.author.name))
			.collect()
	}

	fn stored_guest(id: &str) -> (String, Option<String>, Option<String>) {
		(id.to_owned(), Some(GUEST.to_owned()), Some(GUEST_EMAIL.to_owned()))
	}

	fn authors(page: &Value) -> Vec<(Value, Value, Value)> {
		page["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.map(|message| {
				(
					message["id"].clone(),
					message["authorAccountId"].clone(),
					message["authorName"].clone(),
				)
			})
			.collect()
	}
}

impl Drop for Authoring {
	fn drop(&mut self) {
		self.app.state::<Webhook>().stop();
	}
}

fn direct(window: &WebviewWindow<MockRuntime>, command: &str, body: Value) -> Value {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: command.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("a url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.unwrap_or_else(|error| panic!("{command} was refused: {error:?}"))
	.deserialize::<Value>()
	.expect("the answer is JSON")
}

#[test]
fn a_message_typed_on_the_host_and_one_relayed_from_a_guest_carry_two_authors_read_by_either_side()
{
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.sent("relayed"),
		}))
		.await;

		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;
		let read_by_the_host = direct(&host.window, "conversation_message_page", host.page());

		let expected = vec![
			(json!("typed"), json!("owner"), json!(HOST_NAME)),
			(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL)),
		];
		assert_eq!(Authoring::authors(&read_by_the_guest), expected);
		assert_eq!(Authoring::authors(&read_by_the_host), expected);
	});
}

#[test]
fn one_account_reads_as_one_name_on_the_host_or_through_the_relay_and_each_line_names_its_computer()
{
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed_by(
			"owner",
			json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": host.sent("from-harbour"),
				"computer": "Harbour",
			}),
		)
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"args": host.sent("unnamed-computer"),
		}))
		.await;

		let header = |id: &str| {
			direct(
				&host.window,
				"conversation_message_header",
				json!({ "conversationId": host.conversation_id, "messageId": id }),
			)
		};
		let here = crate::account::session::this_computer().await;
		let at = "1970-01-01T00:00:00Z";

		assert_eq!(
			header("typed"),
			json!(format!("[{HOST_NAME} <{OWNER_EMAIL}> · from {here} · {at}]"))
		);
		assert_eq!(
			header("from-harbour"),
			json!(format!("[{HOST_NAME} <{OWNER_EMAIL}> · from Harbour · {at}]"))
		);
		assert_eq!(
			header("unnamed-computer"),
			json!(format!("[{GUEST_EMAIL} · from another computer · {at}]"))
		);
	});
}

#[test]
fn a_hosted_space_with_a_joined_member_names_every_member_to_a_session_and_marks_the_host() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let database = host.reopened_store();
		let members_of = || super::authorship::members_of(host.app.handle(), &database, PERSONAL);
		let hosted_with = |members: Vec<Member>| {
			let hosting = host.app.state::<Hosting>();
			let mut hosts = hosting.hosts();
			let hosted = hosts.entry(PERSONAL.to_owned()).or_default();
			hosted.state = HostingState::Online;
			hosted.members = Some(SpaceMembers { members, invitations: Vec::new() });
		};
		let member =
			|user_id: &str, name: Option<&str>, email: &str, status: MemberStatus| Member {
				user_id: user_id.to_owned(),
				name: name.map(str::to_owned),
				email: email.to_owned(),
				status,
			};
		let owner = member("owner", Some("Cloud Ada"), OWNER_EMAIL, MemberStatus::Host);

		assert_eq!(members_of().await.expect("the members are read"), vec![], "an unhosted space");

		hosted_with(vec![owner.clone()]);
		assert_eq!(members_of().await.expect("the members are read"), vec![], "a host alone");

		hosted_with(vec![owner, member(GUEST, None, GUEST_EMAIL, MemberStatus::Joined)]);
		assert_eq!(
			members_of().await.expect("the members are read"),
			vec![
				SpaceMember {
					name: Some(HOST_NAME.to_owned()),
					email: OWNER_EMAIL.to_owned(),
					is_host: true
				},
				SpaceMember { name: None, email: GUEST_EMAIL.to_owned(), is_host: false },
			]
		);
	});
}

#[test]
fn a_relayed_frame_stores_its_roster_account_over_a_forged_author() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_append_user_message",
			"args": { "message": host.sent("vouched")["message"] },
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("vouched"), json!(GUEST), json!(GUEST_EMAIL))]
		);
		assert!(
			host.app.state::<Hosting>().relayed.is_empty(),
			"a vouched member outlived its call"
		);
	});
}

#[test]
fn a_human_message_records_whether_it_was_written_here_or_came_through_the_relay() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		direct(&host.window, "conversation_send_user_message", host.sent("typed"));
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.sent("vouched"),
		}))
		.await;
		let unvouched = serde_json::from_value(host.unstarted("unvouched")["message"].clone())
			.expect("the message parses");
		conversation_send_user_message(
			host.app.handle().clone(),
			host.app.state(),
			Caller::Relayed(None),
			unvouched,
			vec![],
		)
		.await
		.expect("the unvouched message is sent");

		let read = direct(&host.window, "conversation_message_page", host.page());

		let origins: Vec<(Value, Value, Value)> = read["messages"]
			.as_array()
			.expect("a page of messages")
			.iter()
			.map(|message| {
				(
					message["id"].clone(),
					message["authorAccountId"].clone(),
					message["writtenFrom"].clone(),
				)
			})
			.collect();
		assert_eq!(
			origins,
			vec![
				(json!("typed"), json!("owner"), json!("here")),
				(json!("vouched"), json!(GUEST), json!("relay")),
				(json!("unvouched"), Value::Null, json!("relay")),
			]
		);
	});
}

#[test]
fn a_message_written_on_a_signed_out_host_carries_no_account() {
	run(async {
		let host = Authoring::new(None).await;
		direct(
			&host.window,
			"conversation_append_user_message",
			json!({ "message": host.sent("typed")["message"] }),
		);

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("typed"), Value::Null, json!(HOST_NAME))]
		);
	});
}

#[test]
fn a_guest_message_sent_on_a_turn_it_opens_lands_on_the_host_with_its_author() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let seq = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": host.unstarted("first"),
			}))
			.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert!(seq.is_i64(), "{seq}");
		assert_eq!(
			Authoring::authors(&read),
			vec![(json!("first"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn a_guest_message_refused_by_the_host_answers_a_text_naming_the_refusal() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let mut elsewhere = host.unstarted("elsewhere");
		elsewhere["message"]["conversationId"] = json!("a-conversation-of-no-shared-space");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": elsewhere,
			}))
			.await;

		assert_eq!(answer["status"], json!(403), "{answer}");
		assert_eq!(answer["body"], json!(OTHER_SPACE_REFUSAL));
	});
}

#[test]
fn a_guest_reads_the_same_conversation_page_as_the_host_solo_rows_included() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let args = json!({ "spaceId": PERSONAL, "cursor": null, "limit": null });

		let read_by_the_guest = host
			.relayed(json!({
				"id": 1,
				"command": "conversation_page",
				"args": args,
			}))
			.await;
		let read_by_the_host = direct(&host.window, "conversation_page", args);

		let solo_bot_of = |id: &Value| {
			read_by_the_guest["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == *id)
				.map(|row| row["soloBotId"].clone())
		};
		assert_eq!(read_by_the_guest, read_by_the_host);
		assert_eq!(read_by_the_guest["conversations"].as_array().map(Vec::len), Some(2));
		assert_eq!(solo_bot_of(&room["id"]), Some(Value::Null));
		assert_eq!(solo_bot_of(&json!(host.conversation_id)), Some(json!("default")));
	});
}

#[test]
fn a_guest_reads_the_state_the_host_computed_for_each_conversation() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let room_id = room["id"].as_str().expect("the room has an id");
		let state = host.app.state::<DatabaseState>();
		let conversations = state.as_ref().expect("the database").conversations();
		let prompt = a_pending_prompt(room_id, PromptKind::Question);
		conversations.hold_prompt(prompt).await.expect("the prompt is held");
		let state_of = |rows: &Value| {
			rows.as_array()
				.expect("the read holds a list")
				.iter()
				.find(|row| row["id"] == room["id"])
				.map(|row| row["state"].clone())
		};

		let listed = host
			.relayed(
				json!({ "id": 1, "command": "conversation_list", "args": { "spaceId": PERSONAL } }),
			)
			.await;
		let paged = host
			.relayed(json!({
				"id": 2,
				"command": "conversation_page",
				"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
			}))
			.await;

		assert_eq!(state_of(&listed), Some(json!("needs_you")));
		assert_eq!(state_of(&paged["conversations"]), Some(json!("needs_you")));
		assert_eq!(
			listed,
			direct(&host.window, "conversation_list", json!({ "spaceId": PERSONAL }))
		);
	});
}

#[test]
fn a_guest_reads_the_same_solo_states_as_the_host() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let state = host.app.state::<DatabaseState>();
		let conversations = state.as_ref().expect("the database").conversations();
		let prompt = a_pending_prompt(&host.conversation_id, PromptKind::Question);
		conversations.hold_prompt(prompt).await.expect("the prompt is held");
		let args = json!({ "spaceId": PERSONAL });

		let read_by_the_guest = host
			.relayed(json!({ "id": 1, "command": "conversation_solo_states", "args": args }))
			.await;
		let read_by_the_host = direct(&host.window, "conversation_solo_states", args);

		assert_eq!(read_by_the_guest, read_by_the_host);
		assert_eq!(read_by_the_guest.as_array().map(Vec::len), Some(1), "{read_by_the_guest}");
		assert_eq!(read_by_the_guest[0]["botId"], json!("default"));
		assert_eq!(read_by_the_guest[0]["conversationId"], json!(host.conversation_id));
		assert_eq!(read_by_the_guest[0]["state"], json!("needs_you"));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_conversation_until_it_completes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("t1");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(host.conversation_id))
				.map(|row| row["activeTurn"].clone())
		};
		direct(
			&host.window,
			"conversation_open_assistant_message",
			json!({ "message": {
				"id": "r1",
				"conversationId": host.conversation_id,
				"turnId": "t1",
				"authorBotId": "default",
				"repliedToMessageId": null,
				"createdAt": 2,
			} }),
		);

		let during_the_turn = read_by_the_guest().await;
		direct(
			&host.window,
			"conversation_finalize_message",
			json!({ "id": "r1", "completion": "complete", "settledText": null }),
		);
		let once_the_reply_settled = read_by_the_guest().await;
		direct(&host.window, "conversation_complete_turn", json!({ "id": "t1", "completedAt": 3 }));
		let after_the_turn = read_by_the_guest().await;

		let speaking = Some(json!({ "bots": [{ "botId": "default", "startedAt": 1 }] }));
		assert_eq!(during_the_turn, speaking);
		assert_eq!(once_the_reply_settled, speaking);
		assert_eq!(after_the_turn, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_open_turn_of_a_room_while_the_second_of_its_two_bots_still_writes() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		for bot_id in ["default", ada.as_str()] {
			let turn =
				NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
			messages.start_run(turn, bot_id.to_owned()).await.expect("the run starts");
		}
		let reply = |id: &str, bot_id: &str| {
			direct(
				&host.window,
				"conversation_open_assistant_message",
				json!({ "message": {
					"id": id,
					"conversationId": room_id,
					"turnId": "t1",
					"authorBotId": bot_id,
					"repliedToMessageId": null,
					"createdAt": 2,
				} }),
			);
		};
		let ended = |bot_id: &str| EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: bot_id.to_owned(),
			handed_to: Vec::new(),
			ended_at: 3,
		};
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		reply("r1", "default");
		reply("r2", &ada);

		messages.end_run(ended("default")).await.expect("the first run ends");
		let while_the_second_writes = read_by_the_guest().await;
		messages.end_run(ended(&ada)).await.expect("the second run ends");
		let after_the_last = read_by_the_guest().await;

		let mut both = ["default".to_owned(), ada.clone()];
		both.sort_unstable();
		let both: Vec<_> =
			both.iter().map(|bot_id| json!({ "botId": bot_id, "startedAt": 1 })).collect();
		assert_eq!(while_the_second_writes, Some(json!({ "bots": both })));
		assert_eq!(after_the_last, Some(Value::Null));
	});
}

#[test]
fn a_guest_reads_the_turn_as_not_working_once_a_handed_bot_misses_its_start_deadline() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.app.manage(TurnRunDeadlines::after(Duration::ZERO));
		let ada = direct(
			&host.window,
			"conversation_create_bot",
			json!({ "spaceId": PERSONAL, "identity": as_json(a_bot_identity()) }),
		);
		let ada = ada["id"].as_str().expect("the bot holds an id").to_owned();
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": ["default", ada] }),
		);
		let room_id = room["id"].as_str().expect("the room holds an id").to_owned();
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		let turn = NewTurn { id: "t1".to_owned(), conversation_id: room_id.clone(), started_at: 1 };
		messages.start_run(turn, "default".to_owned()).await.expect("the run starts");
		let read_by_the_guest = || async {
			let page = host
				.relayed(json!({
					"id": 1,
					"command": "conversation_page",
					"args": { "spaceId": PERSONAL, "cursor": null, "limit": null },
				}))
				.await;
			page["conversations"]
				.as_array()
				.expect("the page holds a list")
				.iter()
				.find(|row| row["id"] == json!(room_id))
				.map(|row| row["activeTurn"].clone())
		};
		let (announced, mut updates) = mpsc::unbounded_channel();
		host.app.listen(CONVERSATION_UPDATED_EVENT, move |event| {
			let payload: Value =
				serde_json::from_str(event.payload()).expect("the payload is JSON");
			announced
				.send(payload["conversation"]["activeTurn"].clone())
				.expect("the test listens");
		});
		let handed = EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: "default".to_owned(),
			handed_to: vec![ada.clone()],
			ended_at: 2,
		};

		messages.end_run(handed).await.expect("the run ends handing over");
		let while_awaited = read_by_the_guest().await;
		arm_start_deadlines(host.app.handle(), &room_id, "t1", std::slice::from_ref(&ada));
		let announced_at_the_deadline = tokio::time::timeout(PATIENCE, updates.recv())
			.await
			.expect("the deadline announced in time");
		let after_the_deadline = read_by_the_guest().await;

		assert_eq!(while_awaited, Some(json!({ "bots": [{ "botId": ada, "startedAt": 1 }] })));
		assert_eq!(announced_at_the_deadline, Some(Value::Null));
		assert_eq!(after_the_deadline, Some(Value::Null));
	});
}

#[test]
fn a_guest_message_naming_a_turn_of_another_conversation_is_refused_and_not_written() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.turn("taken");
		let room = direct(
			&host.window,
			"conversation_create",
			json!({ "spaceId": PERSONAL, "sectionId": null, "title": "Room", "botIds": [] }),
		);
		let mut borrowed = host.unstarted("borrowed");
		borrowed["message"]["conversationId"] = room["id"].clone();
		borrowed["message"]["turnId"] = json!("taken");

		let answer = host
			.answered(json!({
				"id": 1,
				"command": "conversation_send_user_message",
				"args": borrowed,
			}))
			.await;
		let mut room_page = host.page();
		room_page["conversationId"] = room["id"].clone();
		let read = direct(&host.window, "conversation_message_page", room_page);

		assert_ne!(answer["status"], json!(200), "{answer}");
		assert_eq!(Authoring::authors(&read), vec![]);
	});
}

#[test]
fn a_relayed_guest_message_keeps_its_author_in_a_reopened_store_read_by_either_side() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.unstarted("relayed"),
		}))
		.await;

		let reopened = host.reopened_store();
		reopened.messages().recover_unfinished().await.expect("the restart sweep runs");
		let read_by_the_restarted_host =
			Authoring::stored_authors(&reopened, &host.conversation_id).await;
		let read_by_the_guest = host
			.relayed(
				json!({ "id": 2, "command": "conversation_message_page", "args": host.page() }),
			)
			.await;

		assert_eq!(read_by_the_restarted_host, vec![Authoring::stored_guest("relayed")]);
		assert_eq!(
			Authoring::authors(&read_by_the_guest),
			vec![(json!("relayed"), json!(GUEST), json!(GUEST_EMAIL))]
		);
	});
}

#[test]
fn every_later_write_on_a_relayed_guest_message_or_its_turn_leaves_its_author_unchanged() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let conversation_id = host.conversation_id.clone();
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"args": host.unstarted("relayed"),
		}))
		.await;
		let reply = json!({ "message": {
			"id": "reply",
			"conversationId": conversation_id,
			"turnId": "relayed",
			"authorBotId": null,
			"repliedToMessageId": "relayed",
			"createdAt": 2,
		} });
		direct(&host.window, "conversation_open_assistant_message", reply);
		for id in ["reply", "relayed"] {
			direct(&host.window, "conversation_append_text", json!({ "id": id, "delta": "more" }));
			direct(
				&host.window,
				"conversation_finalize_message",
				json!({ "id": id, "completion": "complete", "settledText": "settled" }),
			);
		}
		direct(
			&host.window,
			"conversation_complete_turn",
			json!({ "id": "relayed", "completedAt": 3 }),
		);
		let pin = json!({
			"conversationId": conversation_id,
			"messageId": "relayed",
			"blockIndex": 0,
			"pinnedAt": 4,
		});
		host.relayed(json!({
			"id": 2,
			"command": "conversation_pin_message",
			"args": pin,
		}))
		.await;
		host.relayed_by(
			"another-account",
			json!({ "id": 3, "command": "conversation_pin_message", "args": pin }),
		)
		.await;
		let state = host.app.state::<DatabaseState>();
		let messages = state.as_ref().expect("the store is open").messages();
		messages
			.replace_content("relayed".to_owned(), "rewritten".to_owned())
			.await
			.expect("the content is rewritten");
		messages
			.ensure_turn(NewTurn {
				id: "relayed".to_owned(),
				conversation_id: conversation_id.clone(),
				started_at: 5,
			})
			.await
			.expect("the turn is kept");
		messages.complete_turn("relayed".to_owned(), 6).await.expect("the turn completes");
		messages.recover_unfinished().await.expect("the restart sweep runs");
		let duplicate = host
			.answered_by(
				"another-account",
				json!({
					"id": 4,
					"command": "conversation_append_user_message",
					"args": { "message": host.unstarted("relayed")["message"] },
				}),
			)
			.await;

		let read = Authoring::stored_authors(&host.reopened_store(), &conversation_id).await;

		assert_ne!(duplicate["status"], json!(200), "{duplicate}");
		assert_eq!(read, vec![Authoring::stored_guest("relayed")]);
	});
}

#[test]
fn a_relayed_frame_stores_the_roster_account_whatever_its_plaintext_from_or_sender_says() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.relayed(json!({
			"id": 1,
			"command": "conversation_send_user_message",
			"from": "another-account",
			"args": host.unstarted("forged-from"),
		}))
		.await;
		host.relayed(json!({
			"id": 2,
			"command": "conversation_send_user_message",
			"sender": { "accountId": "another-account" },
			"args": host.unstarted("forged-sender"),
		}))
		.await;

		let read = direct(&host.window, "conversation_message_page", host.page());

		assert_eq!(
			Authoring::authors(&read),
			vec![
				(json!("forged-from"), json!(GUEST), json!(GUEST_EMAIL)),
				(json!("forged-sender"), json!(GUEST), json!(GUEST_EMAIL)),
			]
		);
	});
}

impl Guest {
	async fn first_event(&mut self) -> Value {
		next_text(&mut self.member, |frame| frame.get("event").is_some()).await
	}

	async fn conversation_created_in(&self, space_id: &str) -> Conversation {
		let app = self.harness.app.handle().clone();
		conversation_create(
			app,
			self.harness.app.state(),
			space_id.to_owned(),
			None,
			"New".to_owned(),
			vec![],
		)
		.await
		.expect("the conversation is created")
	}

	async fn conversation_updated(&self, conversation_id: &str) -> Conversation {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_update(
			app,
			state,
			conversation_id.to_owned(),
			"Renamed".to_owned(),
			String::new(),
			None,
			None,
			None,
		)
		.await
		.expect("the conversation is updated")
	}

	async fn conversation_deleted(&self, conversation_id: &str) {
		let app = self.harness.app.handle().clone();
		conversation_delete(app, self.harness.app.state(), conversation_id.to_owned())
			.await
			.expect("the conversation is deleted");
	}

	async fn paged_row(&self, conversation_id: &str) -> ConversationInPage {
		let app = self.harness.app.handle().clone();
		let page =
			conversation_page(app, self.harness.app.state(), PERSONAL.to_owned(), None, None)
				.await
				.expect("the page is read");
		page.conversations
			.into_iter()
			.find(|row| row.conversation.id == conversation_id)
			.expect("the conversation is on the page")
	}

	async fn first_conversation_updated(&mut self) -> Value {
		next_text(&mut self.member, |frame| frame["event"]["event"] == CONVERSATION_UPDATED_EVENT)
			.await
	}

	async fn companion_seated(
		&self,
		conversation_id: &str,
		bot_id: &str,
		invited_by_bot_id: Option<&str>,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		conversation_add_participant(
			app,
			self.harness.app.state(),
			conversation_id.to_owned(),
			bot_id.to_owned(),
			invited_by_bot_id.map(str::to_owned),
		)
		.await
	}

	async fn companion_removed(
		&self,
		conversation_id: &str,
		bot_id: &str,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_remove_participant(app, state, conversation_id.to_owned(), bot_id.to_owned())
			.await
	}

	async fn lead_given(
		&self,
		conversation_id: &str,
		bot_id: &str,
	) -> Result<Conversation, TranscriptStoreError> {
		let app = self.harness.app.handle().clone();
		let state = self.harness.app.state();
		conversation_set_lead(app, state, conversation_id.to_owned(), bot_id.to_owned()).await
	}

	async fn user_message_appended(&self, conversation_id: &str, turn_id: &str) -> i64 {
		let app = self.harness.app.handle().clone();
		let message = a_user_message(conversation_id, turn_id);
		conversation_append_user_message(app, self.harness.app.state(), Caller::Host, message)
			.await
			.expect("the message is appended")
	}

	async fn host_named(&self, display_name: &str) {
		let database = db::open(&self.effects.database);
		let mut preferences = database.user().preferences().await.expect("the preferences read");
		preferences.display_name = display_name.to_owned();
		database.user().set_preferences(preferences).await.expect("the host is named");
	}

	async fn user_message_sent(&self, conversation_id: &str) -> i64 {
		let app = self.harness.app.handle().clone();
		let message = a_user_message(conversation_id, &format!("t-new-{conversation_id}"));
		conversation_send_user_message(app, self.harness.app.state(), Caller::Host, message, vec![])
			.await
			.expect("the message is sent")
	}

	async fn bot_created_in(&self, space_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		let draft =
			BotDraft { name: "Fresh".to_owned(), job: String::new(), description: String::new() };
		conversation_create_bot_from_draft(
			app,
			self.harness.app.state(),
			draft,
			space_id.to_owned(),
		)
		.await
		.expect("the bot is created")
	}

	async fn bot_updated(&self, bot_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		conversation_update_bot(app, self.harness.app.state(), bot_id.to_owned(), a_bot_identity())
			.await
			.expect("the bot is updated")
	}

	async fn bot_deleted(&self, bot_id: &str) {
		let app = self.harness.app.handle().clone();
		conversation_delete_bot(app, self.harness.app.state(), bot_id.to_owned())
			.await
			.expect("the bot is deleted");
	}
}

fn a_user_message(conversation_id: &str, turn_id: &str) -> NewUserMessage {
	NewUserMessage {
		id: format!("m-new-{conversation_id}"),
		conversation_id: conversation_id.to_owned(),
		turn_id: turn_id.to_owned(),
		author_bot_id: None,
		replied_to_message_id: None,
		content: "hello".to_owned(),
		created_at: 2,
	}
}

fn a_bot_identity() -> BotIdentity {
	BotIdentity {
		name: "Renamed".to_owned(),
		title: String::new(),
		model: "sonnet".to_owned(),
		avatar_blot: None,
		avatar_image_path: None,
		instructions: String::new(),
		denied_tools: Vec::new(),
		permissions: BotPermissions::default(),
		output_style: DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: None,
	}
}

fn as_json(payload: impl serde::Serialize) -> Value {
	serde_json::to_value(payload).expect("the payload serializes")
}

fn the_stored_message(heard: &Value) -> (&Value, &Value, &Value, &Value) {
	let payload = &heard["event"]["payload"];
	(&heard["event"]["event"], &payload["conversationId"], &payload["seq"], &payload["content"])
}

#[test]
fn a_relay_guest_hears_a_message_appended_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("message-appended").await;

		guest.user_message_appended("c-theirs", "t-theirs").await;
		let seq = guest.user_message_appended("c-mine", "t-mine").await;
		let heard = guest.first_event().await;

		assert_eq!(
			the_stored_message(&heard),
			(&json!(MESSAGE_STORED_EVENT), &json!("c-mine"), &json!(seq), &json!("hello"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_message_sent_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("message-sent").await;

		guest.user_message_sent("c-theirs").await;
		let seq = guest.user_message_sent("c-mine").await;
		let heard = guest.first_event().await;

		assert_eq!(
			the_stored_message(&heard),
			(&json!(MESSAGE_STORED_EVENT), &json!("c-mine"), &json!(seq), &json!("hello"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_created_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-created").await;

		guest.conversation_created_in(ELSEWHERE).await;
		let created = guest.conversation_created_in(PERSONAL).await;
		let heard = guest.first_event().await;

		let conversation = in_page(&created, created.created_at, None);
		let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
		assert_eq!(heard, as_forwarded((CONVERSATION_CREATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-updated").await;

		guest.conversation_updated("c-theirs").await;
		let updated = guest.conversation_updated("c-mine").await;
		let heard = guest.first_event().await;

		let conversation = in_page(&updated, 1, Some(the_last_word_of_mine()));
		let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
		assert_eq!(heard, as_forwarded((CONVERSATION_UPDATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_whose_last_word_is_the_message_sent() {
	run(async {
		let mut guest = Guest::of_two_spaces("last-word-sent").await;
		guest.host_named(HOST_NAME).await;

		guest.user_message_sent("c-theirs").await;
		guest.user_message_sent("c-mine").await;
		let heard = guest.first_conversation_updated().await;
		let paged = guest.paged_row("c-mine").await;

		let conversation = &heard["event"]["payload"]["conversation"];
		assert_eq!(heard["event"]["payload"]["spaceId"], json!(PERSONAL));
		assert_eq!(
			conversation["lastWord"],
			json!({
				"text": "hello",
				"at": 2,
				"authorBotId": null,
				"authorAccountId": null,
				"authorName": HOST_NAME,
				"writtenFrom": "here",
			})
		);
		assert_eq!(conversation["lastActivityAt"], json!(2));
		assert_eq!(*conversation, as_json(paged));
	});
}

fn in_page(
	conversation: &Conversation,
	last_activity_at: i64,
	last_word: Option<LastWord>,
) -> Value {
	as_json(ConversationInPage {
		conversation: conversation.clone(),
		last_activity_at,
		last_word,
		solo_bot_id: None,
		active_turn: None,
		observed: ObservedState::idle(),
	})
}

fn the_last_word_of_mine() -> LastWord {
	LastWord {
		text: Some("mine".to_owned()),
		at: 1,
		author_bot_id: None,
		author_account_id: None,
		author_name: None,
		written_from: Some(WrittenFrom::Here),
	}
}

fn seated_in(conversation: &Conversation, bot_id: &str) -> bool {
	conversation
		.participants
		.iter()
		.any(|participant| participant.bot_id == bot_id && participant.left_at.is_none())
}

fn led_by(conversation: &Conversation) -> Option<&str> {
	conversation
		.participants
		.iter()
		.find(|participant| participant.role == ParticipantRole::Lead)
		.map(|participant| participant.bot_id.as_str())
}

fn stored_in_the_shared_space(conversation: &Conversation) -> Value {
	let conversation = in_page(conversation, 1, Some(the_last_word_of_mine()));
	let payload = json!({ "spaceId": PERSONAL, "conversation": conversation });
	as_forwarded((CONVERSATION_UPDATED_EVENT, payload))
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_with_the_companion_seated_in_it() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-seated").await;

		let seated = guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		let heard = guest.first_conversation_updated().await;

		assert!(seated_in(&seated, "b-mine"), "the companion is missing from the participants");
		assert_eq!(heard, stored_in_the_shared_space(&seated));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_without_the_companion_removed_from_it() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removed").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.first_conversation_updated().await;

		let removed = guest.companion_removed("c-mine", "b-mine").await.expect("removed");
		let heard = guest.first_conversation_updated().await;

		assert!(!seated_in(&removed, "b-mine"), "the removed companion is still seated");
		assert_eq!(heard, stored_in_the_shared_space(&removed));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_updated_with_the_new_lead() {
	run(async {
		let mut guest = Guest::of_two_spaces("lead-changed").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.companion_seated("c-mine", "b-shared", None).await.expect("seated");
		guest.first_conversation_updated().await;
		guest.first_conversation_updated().await;

		let led = guest.lead_given("c-mine", "b-shared").await.expect("led");
		let heard = guest.first_conversation_updated().await;

		assert_eq!(led_by(&led), Some("b-shared"));
		assert_eq!(heard, stored_in_the_shared_space(&led));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_companion_seated_again() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-seated-again").await;
		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated");
		guest.first_conversation_updated().await;

		guest.companion_seated("c-mine", "b-mine", None).await.expect("seated again");
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_member_change_in_another_space() {
	run(async {
		let mut guest = Guest::of_two_spaces("member-change-elsewhere").await;

		guest.companion_seated("c-theirs", "b-theirs", None).await.expect("seated");
		guest.companion_seated("c-shared", "b-theirs", None).await.expect("seated");
		guest.lead_given("c-shared", "b-theirs").await.expect("led");
		guest.companion_removed("c-shared", "b-shared").await.expect("removed");
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_nothing_from_a_member_write_that_fails() {
	run(async {
		let mut guest = Guest::of_two_spaces("member-write-fails").await;
		let refused = |bot_id: &str| TranscriptStoreError::UnknownParticipant {
			conversation_id: "c-mine".to_owned(),
			bot_id: bot_id.to_owned(),
		};

		let seated = guest.companion_seated("c-mine", "b-mine", Some("b-shared")).await;
		let removed = guest.companion_removed("c-mine", "b-mine").await;
		let led = guest.lead_given("c-mine", "b-mine").await;
		let renamed = guest.conversation_updated("c-mine").await;
		let heard = guest.first_conversation_updated().await;

		assert_eq!(seated, Err(refused("b-shared")));
		assert_eq!(removed, Err(refused("b-mine")));
		assert_eq!(led, Err(refused("b-mine")));
		assert_eq!(heard, stored_in_the_shared_space(&renamed));
	});
}

#[test]
fn a_relay_guest_hears_a_conversation_deleted_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("conversation-deleted").await;

		guest.conversation_deleted("c-theirs").await;
		guest.conversation_deleted("c-mine").await;
		let heard = guest.first_event().await;

		let payload = json!({ "spaceId": PERSONAL, "conversationId": "c-mine" });
		assert_eq!(heard, as_forwarded((CONVERSATION_DELETED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_created_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-created").await;

		guest.bot_created_in(ELSEWHERE).await;
		let created = guest.bot_created_in(PERSONAL).await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": created.id, "name": created.name });
		assert_eq!(heard, as_forwarded((COMPANION_CREATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_updated_in_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-updated").await;

		guest.bot_updated("b-theirs").await;
		let updated = guest.bot_updated("b-mine").await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": "b-mine", "bot": as_json(updated) });
		assert_eq!(heard, as_forwarded((COMPANION_UPDATED_EVENT, payload)));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_deleted_from_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-deleted").await;

		guest.bot_deleted("b-theirs").await;
		guest.bot_deleted("b-shared").await;
		let heard = guest.first_event().await;

		let payload = json!({ "id": "b-shared", "spaceId": PERSONAL });
		assert_eq!(heard, as_forwarded((COMPANION_DELETED_EVENT, payload)));
	});
}

impl Guest {
	async fn planted(&self, rows: &'static str) {
		db::open(&self.effects.database)
			.call_mut(move |connection| Ok(connection.execute_batch(rows)?))
			.await
			.expect("the rows are planted");
	}

	async fn bot_duplicated_into(&self, bot_id: &str, space_id: &str) -> Bot {
		let app = self.harness.app.handle().clone();
		let destination = Some(space_id.to_owned());
		conversation_duplicate_bot(app, self.harness.app.state(), bot_id.to_owned(), destination)
			.await
			.expect("the bot is duplicated")
	}

	async fn bot_added(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_add_to_space(
			app,
			self.harness.app.state(),
			bot_id.to_owned(),
			space_id.to_owned(),
			None,
		)
		.await
		.expect("the bot is added");
	}

	async fn bot_moved(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_move_to_space(app, self.harness.app.state(), bot_id.to_owned(), space_id.to_owned())
			.await
			.expect("the bot is moved");
	}

	async fn bot_removed(&self, bot_id: &str, space_id: &str) {
		let app = self.harness.app.handle().clone();
		bot_remove_from_space(
			app,
			self.harness.app.state(),
			bot_id.to_owned(),
			space_id.to_owned(),
		)
		.await
		.expect("the bot is removed");
	}
}

fn a_companion_created(id: &str, name: &str) -> Value {
	as_forwarded((COMPANION_CREATED_EVENT, json!({ "id": id, "name": name })))
}

fn a_companion_deleted(id: &str, space_id: &str) -> Value {
	as_forwarded((COMPANION_DELETED_EVENT, json!({ "id": id, "spaceId": space_id })))
}

#[test]
fn a_relay_guest_hears_a_companion_duplicated_into_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-duplicated").await;

		guest.bot_duplicated_into("b-theirs", ELSEWHERE).await;
		let copy = guest.bot_duplicated_into("b-mine", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(heard, a_companion_created(&copy.id, &copy.name));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_added_to_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-added").await;
		guest
			.planted("INSERT INTO spaces (id, name, colour, position, created_at) VALUES ('third', 'Third', 'red', 2, 1);")
			.await;

		guest.bot_added("b-theirs", "third").await;
		let before = guest.first_event_after(vec![a_shared_space_marker()]).await;
		guest.bot_added("b-theirs", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(
			(before, heard),
			(as_forwarded(a_shared_space_marker()), a_companion_created("b-theirs", "Theirs"))
		);
	});
}

#[test]
fn a_relay_guest_hears_a_companion_removed_from_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removed").await;
		guest
			.planted("INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b-theirs', 'personal', 3);")
			.await;

		guest.bot_removed("b-theirs", ELSEWHERE).await;
		guest.bot_removed("b-shared", PERSONAL).await;
		let heard = guest.first_event().await;

		assert_eq!(heard, a_companion_deleted("b-shared", PERSONAL));
	});
}

#[test]
fn a_relay_guest_hears_a_companion_moved_into_and_out_of_the_shared_space_only() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-moved").await;

		guest.bot_moved("b-theirs", PERSONAL).await;
		guest.bot_moved("b-mine", ELSEWHERE).await;
		let arrived = guest.first_event().await;
		let left = guest.first_event().await;

		assert_eq!(
			(arrived, left),
			(a_companion_created("b-theirs", "Theirs"), a_companion_deleted("b-mine", PERSONAL))
		);
	});
}

#[test]
fn a_relay_guest_hears_nothing_of_a_refused_companion_removal() {
	run(async {
		let mut guest = Guest::of_two_spaces("companion-removal-refused").await;
		let app = guest.harness.app.handle().clone();

		let refused = bot_remove_from_space(
			app,
			guest.harness.app.state(),
			"b-mine".to_owned(),
			PERSONAL.to_owned(),
		)
		.await;
		let heard = guest.first_event_after(vec![a_shared_space_marker()]).await;

		assert!(refused.is_err());
		assert_eq!(heard, as_forwarded(a_shared_space_marker()));
	});
}

const GUEST_LOCAL_CONVERSATION: &str = "c-guest-local";

#[test]
fn a_guest_reads_the_installs_of_a_shared_conversation_and_not_of_its_own() {
	run(kept_in_the_shared_space(
		"application_installs",
		json!({ "conversationId": GUEST_LOCAL_CONVERSATION }),
		json!({ "conversationId": "c-mine" }),
	));
}

#[test]
fn a_guest_reads_the_pending_questions_of_a_shared_conversation_and_not_of_its_own() {
	run(kept_in_the_shared_space(
		"agent_pending_questions",
		json!({ "conversationId": GUEST_LOCAL_CONVERSATION }),
		json!({ "conversationId": "c-mine" }),
	));
}

#[test]
fn the_installs_refusal_names_the_conversation_the_host_does_not_hold() {
	run(async {
		let guest = Guest::of_two_spaces("installs-refusal").await;
		let args = json!({ "conversationId": GUEST_LOCAL_CONVERSATION });

		let refusal = shared_space_refusal(&guest, "application_installs", args).await;

		assert_eq!(
			reach::refusal_line("application_installs", PERSONAL, &refusal),
			format!(
				"the relayed application_installs was refused outside shared space {PERSONAL}: \
				 /conversationId failed the Conversation check with \"{GUEST_LOCAL_CONVERSATION}\""
			)
		);
	});
}

const DEFAULT_BOT: &str = "default";

fn the_default_bot() -> EnvOwner {
	EnvOwner::Bot { id: DEFAULT_BOT.to_owned(), space_id: PERSONAL.to_owned() }
}

fn a_host_grant() -> OauthCredentials {
	OauthCredentials {
		access_token: "host-access".to_owned(),
		refresh_token: Some("host-refresh".to_owned()),
		expires_at: None,
		client_id: "registered".to_owned(),
		client_secret: None,
		redirect_uri: None,
	}
}

fn granted_to_the_host_person(name: &str) -> EnvScope {
	EnvScope::Server { name: name.to_owned(), owner: EnvOwner::User }
}

impl Authoring {
	fn env_root(&self) -> PathBuf {
		writable_root(self.app.handle()).expect("the env root is writable")
	}

	fn reading_applications(&self) {
		let person = bundles::user::path(self.app.handle()).expect("the plugin has a home");
		bundles::user::lay_down(&person).expect("the plugin is laid down");
		self.app.manage(McpOauthState::default());
		self.app.manage(ApplicationReports::default());
		self.app.manage(AuthorizationAnswers::default());
	}

	async fn bundled_default_bot(&self) {
		let state = self.app.state::<DatabaseState>();
		let database = state.as_ref().expect("the database");
		let bot = database
			.conversations()
			.bot(DEFAULT_BOT.to_owned())
			.await
			.expect("the bot reads")
			.expect("the default bot is planted");
		let root = bundles::root(self.app.handle()).expect("the bundles have a root");
		bundles::lay_down(&root, &bot).expect("the bot bundle lands");
	}

	fn declared(&self, plugin: Value, name: &str) {
		direct(
			&self.window,
			"plugin_set_mcp_server",
			json!({ "scope": plugin, "name": name, "config": { "command": name }, "mark": null }),
		);
	}
}

fn names_of(listed: &Value) -> Vec<&str> {
	listed
		.as_array()
		.expect("a list")
		.iter()
		.map(|item| item["name"].as_str().expect("a name"))
		.collect()
}

#[test]
fn a_member_lists_a_bot_env_without_any_entry_defined_in_or_served_from_the_host_person() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let root = host.env_root();
		let bot = EnvScope::from(&the_default_bot());
		store::set(&root, &EnvScope::User, "HOST_ONLY", "person").expect("the host sets");
		store::set(&root, &EnvScope::User, "SHADOWED", "person").expect("the host sets");
		store::set(&root, &EnvScope::Space { id: PERSONAL.to_owned() }, "SHARED", "space")
			.expect("the host sets");
		store::set(&root, &bot, "SHADOWED", "bot").expect("the host sets");
		let args = json!({ "scope": bot });

		let relayed = host.relayed(json!({ "id": 1, "command": "env_list", "args": args })).await;
		let on_the_host = direct(&host.window, "env_list", args);

		assert_eq!(names_of(&relayed), ["SHADOWED", "SHARED"]);
		for entry in relayed.as_array().expect("a list") {
			assert_ne!(entry["definedIn"]["kind"], "user", "{entry}");
			assert_ne!(entry["servedFrom"]["kind"], "user", "{entry}");
		}
		assert_eq!(names_of(&on_the_host), ["HOST_ONLY", "SHADOWED", "SHADOWED", "SHARED"]);
	});
}

#[test]
fn a_relayed_env_list_of_a_server_of_the_host_person_answers_no_entry() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		let scope = granted_to_the_host_person("granola");
		store::set(&host.env_root(), &scope, "PLANTED", "host").expect("the host sets");
		let listed = |caller| env_list(host.app.handle().clone(), caller, scope.clone());

		let relayed = listed(Caller::Relayed(None)).await.expect("the list reads");
		let on_the_host = listed(Caller::Host).await.expect("the list reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(
			on_the_host.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(),
			["PLANTED"]
		);
	});
}

#[test]
fn a_member_reads_no_application_served_by_a_grant_of_the_host_person_nor_one_of_its_plugin() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.bundled_default_bot().await;
		let root = host.env_root();
		let bot = json!({ "kind": "bot", "id": DEFAULT_BOT });
		host.declared(bot.clone(), "granola");
		host.declared(bot, "clock");
		host.declared(json!({ "kind": "user" }), "notion");
		credentials::store(&root, &granted_to_the_host_person("granola"), &a_host_grant())
			.expect("the host connects granola");
		credentials::store(&root, &granted_to_the_host_person("notion"), &a_host_grant())
			.expect("the host connects notion");
		let args = json!({ "owner": the_default_bot() });

		let relayed = host
			.relayed(json!({ "id": 1, "command": "mcp_application_status", "args": args }))
			.await;
		let on_the_host = direct(&host.window, "mcp_application_status", args);

		assert_eq!(names_of(&relayed), ["clock"]);
		assert_eq!(names_of(&on_the_host), ["clock", "granola"]);
		assert_eq!(on_the_host[1]["scope"], json!(granted_to_the_host_person("granola")));
	});
}

#[test]
fn a_relayed_status_of_the_host_person_plugin_answers_no_row() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		host.declared(json!({ "kind": "user" }), "notion");
		let status =
			|caller| mcp_application_status(host.app.handle().clone(), caller, EnvOwner::User);

		let relayed = status(Caller::Relayed(None)).await.expect("the status reads");
		let on_the_host = status(Caller::Host).await.expect("the status reads");

		assert_eq!(relayed, Vec::new());
		assert_eq!(on_the_host.iter().map(|row| row.name.as_str()).collect::<Vec<_>>(), ["notion"]);
	});
}

#[test]
fn a_member_disconnecting_through_a_bot_served_by_a_grant_of_the_host_person_is_refused() {
	run(async {
		let host = Authoring::new(Some(BEARER)).await;
		host.reading_applications();
		let root = host.env_root();
		let grant = granted_to_the_host_person("granola");
		credentials::store(&root, &grant, &a_host_grant()).expect("the host connects");
		let before = store::values(&root, &grant).expect("the grant reads");

		let answered = host
			.answered(json!({
				"id": 1,
				"command": "mcp_oauth_disconnect",
				"args": {
					"owner": the_default_bot(),
					"name": "granola",
					"url": "https://granola.test/mcp",
				},
			}))
			.await;

		assert_eq!(answered["status"], json!(403), "{answered}");
		assert_eq!(answered["body"], json!({ "kind": "refusedToAMember" }));
		assert!(!before.is_empty());
		assert_eq!(store::values(&root, &grant).expect("the grant reads"), before);
	});
}

fn relay_database(harness: &Harness) -> &crate::db::Database {
	let state = harness.app.state::<DatabaseState>().inner();
	state.as_ref().expect("the database")
}

#[test]
fn a_first_connect_registers_the_device_once_and_opens_the_host_socket_with_its_id() {
	run(async {
		let mut harness = Harness::signed_in("device").await;
		harness.started().await;
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		harness.started().await;
		let _second = harness.member().await;
		harness.reached(HostingState::Online).await;

		let host = harness.host_keys();
		let bodies = harness.relay.device.bodies();
		let [body] = bodies.as_slice() else {
			panic!("the device registered {} times", bodies.len());
		};
		let sent: Vec<&str> =
			body.as_object().expect("an object").keys().map(String::as_str).collect();
		assert_eq!(sent, ["ed25519PublicKey", "nonce", "signature", "x25519PublicKey"]);
		assert_eq!(
			(&body["ed25519PublicKey"], &body["x25519PublicKey"]),
			(
				&json!(BASE64_URL_SAFE_NO_PAD.encode(host.signing_public().as_bytes())),
				&json!(BASE64_URL_SAFE_NO_PAD.encode(host.agreement_public().as_bytes()))
			)
		);
		assert_eq!((decoded(body, "nonce").len(), decoded(body, "signature").len()), (32, 64));
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::CREATED]);
		let answers = harness.relay.device.answers();
		let relay_device_id = &answers[0].1["id"].as_str().expect("an id").to_owned();
		let database = relay_database(&harness);
		let held = database
			.relay_devices()
			.relay_device_id("owner".to_owned(), host.device_id().to_string())
			.await
			.expect("the relay device id reads");
		assert_eq!(held.as_ref(), Some(relay_device_id));
		let host_row = database
			.space_relay()
			.roster_row(PERSONAL.to_owned(), host.device_id().to_string())
			.await
			.expect("the roster reads")
			.expect("the host rosters its own device");
		assert_eq!(
			(host_row.relay_device_id, host_row.account_id),
			(relay_device_id.clone(), "owner".to_owned())
		);
		assert_eq!(harness.attempts(), 2);
	});
}

async fn held_relay_device(harness: &Harness) -> Option<String> {
	let device_id = harness.host_keys().device_id().to_string();
	let devices = relay_database(harness).relay_devices();
	devices.relay_device_id(OWNER_ACCOUNT.to_owned(), device_id).await.expect("the id reads")
}

async fn account_reached(harness: &Harness, expected: AccountState) {
	let session = harness.app.state::<AccountSession>();
	let is_reached = || (session.current() == expected).then_some(());
	harness.noticed_until(&format!("the account reaching {expected:?}"), is_reached).await;
}

fn bearer_stored(harness: &Harness, bearer: &str) {
	let root = &harness._temporary[1];
	store::set(root, &EnvScope::Account, ACCOUNT_BEARER, bearer).expect("the bearer is kept");
}

fn bearer_held(harness: &Harness) -> Option<String> {
	harness.app.state::<AccountSession>().bearer().expect("the bearer reads")
}

#[test]
fn the_same_key_registered_again_by_the_same_account_answers_200_with_the_same_id() {
	run(async {
		let mut harness = Harness::signed_in("device-again").await;
		harness.started().await;
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		let device_id = harness.host_keys().device_id().to_string();
		let devices = relay_database(&harness).relay_devices();
		devices.forgotten(OWNER_ACCOUNT.to_owned(), device_id).await.expect("forgotten");

		harness.started().await;
		let _second = harness.member().await;
		harness.reached(HostingState::Online).await;

		let answers = harness.relay.device.answers();
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::CREATED, StatusCode::OK]);
		assert_eq!(answers[1].1["id"], answers[0].1["id"]);
		assert_eq!(answers[1].1["transferred"], json!(false));
		assert_eq!(held_relay_device(&harness).await.as_deref(), answers[1].1["id"].as_str());
	});
}

#[test]
fn a_key_another_account_registered_moves_to_this_account_and_is_stored_under_it() {
	run(async {
		let mut harness = Harness::signed_in("device-moved").await;
		let ed25519 =
			BASE64_URL_SAFE_NO_PAD.encode(harness.host_keys().signing_public().as_bytes());
		let moved = uuid::Uuid::new_v4().to_string();
		harness.relay.device.devices.lock().expect("the relay").push(RelayDevice {
			ed25519: ed25519.clone(),
			id: moved.clone(),
			account_id: "former-owner".to_owned(),
		});

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let answers = harness.relay.device.answers();
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::OK]);
		assert_eq!(answers[0].1["transferred"], json!(true));
		assert_eq!(held_relay_device(&harness).await, Some(moved));
		let device = harness.relay.device.device_of(&ed25519).expect("the device");
		assert_eq!(device.account_id, OWNER_ACCOUNT);
	});
}

#[test]
fn an_account_signing_back_in_after_another_took_the_key_draws_a_new_challenge_and_registers_again()
{
	run(async {
		let mut harness = Harness::signed_in("device-back").await;
		harness.started().await;
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		assert!(held_relay_device(&harness).await.is_some());

		bearer_stored(&harness, OTHER_BEARER);
		harness.started().await;
		let _other = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		assert_eq!(held_relay_device(&harness).await, None);

		bearer_stored(&harness, BEARER);
		harness.started().await;
		let _again = harness.member().await;
		harness.reached(HostingState::Online).await;

		let answers = harness.relay.device.answers();
		assert_eq!(
			harness.relay.device.statuses(),
			vec![StatusCode::CREATED, StatusCode::OK, StatusCode::OK]
		);
		assert_eq!(
			(&answers[1].1["transferred"], &answers[2].1["transferred"]),
			(&json!(true), &json!(true))
		);
		assert_eq!(harness.relay.device.issued.load(Ordering::SeqCst), 3);
		let answered_for_the_owner = answers[2].1["id"].as_str().expect("an id");
		assert_eq!(
			harness.relay.device.opened().last().map(String::as_str),
			Some(answered_for_the_owner)
		);
		assert_eq!(held_relay_device(&harness).await.as_deref(), Some(answered_for_the_owner));
		let device_id = harness.host_keys().device_id().to_string();
		let other = relay_database(&harness)
			.relay_devices()
			.relay_device_id(OTHER_ACCOUNT.to_owned(), device_id);
		assert_eq!(other.await.expect("the id reads"), None);
	});
}

#[test]
fn a_rate_limited_challenge_is_retried_and_the_device_registers() {
	run(async {
		let mut harness = Harness::signed_in("device-throttled").await;
		harness.relay.device.throttled.store(1, Ordering::SeqCst);

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let answers = harness.relay.device.answers();
		assert_eq!(harness.relay.device.throttled.load(Ordering::SeqCst), 0);
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::CREATED]);
		let registered = answers[0].1["id"].as_str().expect("an id");
		assert_eq!(harness.relay.device.opened(), vec![registered.to_owned()]);
	});
}

#[test]
fn a_signature_the_relay_cannot_verify_fails_naming_403_and_keeps_the_account_signed_in() {
	run(async {
		let harness = Harness::signed_in("device-proof-invalid").await;
		restore(harness.app.handle().clone()).await;
		harness.relay.device.is_signature_tampered.store(true, Ordering::SeqCst);

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::DeviceRefused);
		assert!(detail.contains("403 DEVICE_PROOF_INVALID"), "{detail}");
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::FORBIDDEN]);
		assert_eq!(harness.attempts(), 0);
		let account = harness.app.state::<AccountSession>().current();
		assert!(matches!(account, AccountState::SignedIn(_)), "the account was signed out");
		assert_eq!(bearer_held(&harness).as_deref(), Some(BEARER));
		assert_eq!(held_relay_device(&harness).await, None);
	});
}

#[test]
fn an_expired_challenge_is_drawn_again_once_and_the_device_registers() {
	run(async {
		let mut harness = Harness::signed_in("device-challenge-expired").await;
		harness.relay.device.expiring.store(1, Ordering::SeqCst);

		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let answers = harness.relay.device.answers();
		assert_eq!(
			harness.relay.device.statuses(),
			vec![StatusCode::BAD_REQUEST, StatusCode::CREATED]
		);
		assert_eq!(answers[0].1["error"]["code"], "DEVICE_CHALLENGE_INVALID");
		assert_eq!(harness.relay.device.issued.load(Ordering::SeqCst), 2);
		assert_eq!(held_relay_device(&harness).await.as_deref(), answers[1].1["id"].as_str());
	});
}

#[test]
fn a_second_invalid_challenge_fails_naming_400_device_challenge_invalid() {
	run(async {
		let harness = Harness::signed_in("device-challenge-invalid").await;
		harness.relay.device.expiring.store(2, Ordering::SeqCst);

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::DeviceRefused);
		assert!(detail.contains("400 DEVICE_CHALLENGE_INVALID"), "{detail}");
		assert_eq!(
			harness.relay.device.statuses(),
			vec![StatusCode::BAD_REQUEST, StatusCode::BAD_REQUEST]
		);
		assert_eq!(harness.relay.device.issued.load(Ordering::SeqCst), 2);
		assert_eq!(harness.attempts(), 0);
	});
}

#[test]
fn a_409_from_the_device_registration_fails_naming_its_status_and_code_like_any_other_4xx() {
	run(async {
		let harness = Harness::signed_in("device-key-taken").await;
		let refusal = Some((StatusCode::CONFLICT, "DEVICE_KEY_TAKEN"));
		*harness.relay.device.refusal.lock().expect("the relay") = refusal;

		harness.started().await;
		let relay = harness.running_relay();
		let (failure, detail) = harness.failed().await;
		ended_on_its_own(relay).await;

		assert_eq!(failure, HostingFailureKind::DeviceRefused);
		assert!(detail.contains("409 DEVICE_KEY_TAKEN"), "{detail}");
		assert_eq!(harness.relay.device.statuses(), vec![StatusCode::CONFLICT]);
		assert_eq!(harness.attempts(), 0);
	});
}

#[test]
fn signing_out_deletes_the_relay_device_first_and_still_signs_out_when_the_relay_answers_500() {
	run(async {
		let mut harness = Harness::signed_in("device-sign-out").await;
		restore(harness.app.handle().clone()).await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let relay_device_id = held_relay_device(&harness).await.expect("a registered device");
		let device_id = harness.host_keys().device_id();
		*harness.relay.device.deletion_status.lock().expect("the relay") =
			Some(StatusCode::INTERNAL_SERVER_ERROR);

		sign_out(harness.app.handle()).await.expect("the sign-out settles");

		assert_eq!(
			harness.relay.device.account_calls(),
			vec![format!("DELETE {relay_device_id}"), "sign-out".to_owned()]
		);
		let account = harness.app.state::<AccountSession>().current();
		assert_eq!(account, AccountState::SignedOut { reason: None });
		assert_eq!(bearer_held(&harness), None);
		assert_eq!(held_relay_device(&harness).await, None);
		assert_eq!(harness.host_keys().device_id(), device_id);
	});
}

#[test]
fn a_device_revoked_4006_signs_the_account_out_with_its_reason_and_does_not_reconnect() {
	run(async {
		let mut harness = Harness::signed_in("device-revoked").await;
		restore(harness.app.handle().clone()).await;
		harness.started().await;
		let relay = harness.running_relay();
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let close = CloseFrame { code: 4006, reason: "deviceRevoked".into() };
		member.send(Message::Close(Some(close))).await.expect("the close leaves");
		harness.reached(HostingState::NeedsSignIn).await;
		ended_on_its_own(relay).await;
		let revoked = AccountState::SignedOut { reason: Some(SignedOutReason::DeviceRevoked) };
		account_reached(&harness, revoked).await;

		assert_eq!(harness.attempts(), 1);
		assert_eq!(bearer_held(&harness), None);
		assert_eq!(held_relay_device(&harness).await, None);
		assert!(harness.relay.device.account_calls().is_empty());
	});
}

#[cfg(unix)]
#[test]
fn a_first_start_keeps_a_fresh_space_key_in_an_owner_only_file_and_never_in_sqlite() {
	use std::os::unix::fs::PermissionsExt;

	run(async {
		let mut harness = Harness::signed_in("space-key").await;
		harness.started().await;
		let _member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let first = harness.space_key(PERSONAL);
		harness.stopped().await;
		harness.started().await;
		let _again = harness.member().await;
		harness.reached(HostingState::Online).await;

		let profile = harness.app.path().app_data_dir().expect("the data folder resolves");
		let file = profile.join(format!("space-key-{PERSONAL}"));
		let mode = std::fs::metadata(&file).expect("the key file").permissions().mode();
		let again = harness.space_key(PERSONAL);
		assert_eq!((first.key_id, mode & 0o777), (1, 0o600));
		assert_eq!(*again.key, *first.key);
		let database_dir = &harness._temporary[0];
		for entry in std::fs::read_dir(database_dir).expect("the database folder") {
			let bytes = std::fs::read(entry.expect("an entry").path()).expect("a database file");
			assert!(!bytes.windows(first.key.len()).any(|window| window == first.key.as_slice()));
		}
	});
}

#[test]
fn a_seeded_member_says_hello_calls_gets_its_answer_and_hears_an_event_over_sealed_frames_only() {
	run(async {
		let mut harness = Harness::signed_in("v2-wire").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		let hello = member.greeted().await;
		send(&mut member, r#"{"id": "c1", "command": "agent_models", "args": {"a": 1}}"#).await;
		let answered = answer(&mut member).await;
		let payload = json!({ "spaceId": PERSONAL, "n": 1 });
		events::emit(harness.app.handle(), Event::untyped(CHANGED_EVENT), payload)
			.expect("emitted");
		let event =
			next_text(&mut member, |frame| frame["event"]["payload"]["n"] == json!(1)).await;

		assert_eq!(hello.plaintext, json!({ "hello": {} }));
		assert_eq!(hello.challenge.map(|challenge| challenge.len()), Some(CHALLENGE_LENGTH));
		assert_eq!(
			answered,
			json!({ "id": "c1", "status": 200, "body": { "command": "agent_models", "args": { "a": 1 } } })
		);
		assert_eq!(event["event"]["event"], json!(CHANGED_EVENT));
		assert!(!member.texts.is_empty());
		for text in &member.texts {
			let envelope: Value = serde_json::from_str(text).expect("a json frame");
			assert_eq!(envelope["v"], json!(2), "{text}");
			assert!(envelope.get("from").is_none(), "{text}");
			let fields: &[&str] = if envelope.get("rekey").is_some() {
				&["instance", "to", "rekey", "sig"]
			} else {
				&["instance", "key_id", "ctr", "ct", "sig"]
			};
			for field in fields {
				assert!(envelope.get(field).is_some(), "{field} is missing from {text}");
			}
			for plaintext in ["agent_models", "command", "hello", CHANGED_EVENT] {
				assert!(!text.contains(plaintext), "{plaintext} crossed in clear: {text}");
			}
		}
	});
}

const A_STALE_CHALLENGE: [u8; CHALLENGE_LENGTH] = [9; CHALLENGE_LENGTH];

async fn next_hello(member: &mut MemberWire) -> Option<[u8; CHALLENGE_LENGTH]> {
	loop {
		let frame = member.next_sealed().await;
		if is_a_hello(&frame) {
			return frame.challenge;
		}
	}
}

async fn resent_runs(member: &mut MemberWire, challenge: Option<[u8; CHALLENGE_LENGTH]>) -> Value {
	member.challenge = challenge;
	send(member, r#"{"id": "resent", "command": "agent_models"}"#).await;
	answer(member).await
}

#[test]
fn two_stale_frames_in_a_row_are_answered_with_the_same_challenge_and_a_resend_under_it_runs() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("stale-twice").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let held = member.greeted().await.challenge;

		for id in ["stale-1", "stale-2"] {
			let call = json!({ "id": id, "command": "agent_models" }).to_string();
			member.sealed_sent(&call, Some(A_STALE_CHALLENGE)).await;
		}
		let first = next_hello(&mut member).await;
		let second = next_hello(&mut member).await;
		let answered = resent_runs(&mut member, second).await;

		assert!(held.is_some());
		assert_eq!((first, second), (held, held));
		assert_eq!(answered["id"], json!("resent"));
		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_hello_replaces_the_held_challenge() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("hello-again").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		let replaced = member.greeted().await.challenge;
		let held = member.greeted().await.challenge;

		member.sealed_sent(r#"{"id": "stale", "command": "agent_models"}"#, replaced).await;
		let answered_with = next_hello(&mut member).await;
		let answered = resent_runs(&mut member, answered_with).await;

		assert!(held.is_some() && held != replaced);
		assert_eq!(answered_with, held);
		assert_eq!(answered["id"], json!("resent"));
		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_stale_frame_from_a_device_the_host_holds_no_challenge_for_draws_a_fresh_one() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("stale-unheld").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;

		member
			.sealed_sent(r#"{"id": "stale", "command": "agent_models"}"#, Some(A_STALE_CHALLENGE))
			.await;
		let fresh = next_hello(&mut member).await;
		let answered = resent_runs(&mut member, fresh).await;

		assert!(fresh.is_some() && fresh != Some(A_STALE_CHALLENGE));
		assert_eq!(answered["id"], json!("resent"));
		assert_eq!(effects.reached(), ["agent_models"]);
	});
}

#[test]
fn a_plaintext_frame_or_one_signed_outside_the_roster_gets_nothing_back() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("dropped-frames").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		member.greeted().await;

		let plaintext = r#"{"id": "clear", "command": "agent_models"}"#;
		member.send(Message::Text(plaintext.into())).await.expect("the frame leaves");
		let impostor = SealingMember {
			relay_device_id: member.device.relay_device_id.clone(),
			..SealingMember::new(MEMBER_ACCOUNT)
		};
		let forged = impostor.sealed(
			&member.space(),
			1,
			r#"{"id": "forged", "command": "agent_models"}"#,
			member.challenge,
		);
		member.send(Message::Text(forged.into())).await.expect("the frame leaves");
		send(&mut member, r#"{"id": "genuine", "command": "agent_models"}"#).await;
		let answered = answer(&mut member).await;

		assert_eq!(answered["id"], json!("genuine"));
		assert_eq!(effects.reached(), ["agent_models"]);
		assert_eq!(harness.state(), HostingState::Online);
	});
}

fn versioned(sealed: &str, v: Option<u64>) -> String {
	let mut envelope: Value = serde_json::from_str(sealed).expect("a json frame");
	match v {
		Some(v) => envelope["v"] = json!(v),
		None => {
			envelope.as_object_mut().expect("an envelope").remove("v");
		}
	}
	envelope.to_string()
}

#[test]
fn a_sealed_frame_whose_v_is_absent_or_one_is_dropped_without_dispatching_its_call() {
	run(async {
		let (mut harness, effects) = Harness::applying_host_effects("v1-frames").await;
		harness.started().await;
		let mut member = harness.member().await;
		harness.reached(HostingState::Online).await;
		member.greeted().await;

		let call = r#"{"id": "relabelled", "command": "agent_models"}"#;
		for (ctr, v) in [(100, None), (101, Some(1))] {
			let sealed = member.device.sealed(&member.space(), ctr, call, member.challenge);
			let relabelled = versioned(&sealed, v);
			member.send(Message::Text(relabelled.into())).await.expect("the frame leaves");
		}
		send(&mut member, r#"{"id": "genuine", "command": "agent_models"}"#).await;
		let answered = answer(&mut member).await;

		assert_eq!(answered["id"], json!("genuine"));
		assert_eq!(effects.reached(), ["agent_models"]);
		assert_eq!(harness.state(), HostingState::Online);
	});
}

#[test]
fn a_reserved_ctr_bound_that_does_not_read_back_sends_nothing_and_fails() {
	run(async {
		let mut harness = Harness::signed_in("unreadable-ctr").await;
		harness.started().await;
		let _first = harness.member().await;
		harness.reached(HostingState::Online).await;
		harness.stopped().await;
		relay_database(&harness)
			.call_mut(|connection| {
				Ok(connection.execute_batch("DELETE FROM relay_reserved_counters")?)
			})
			.await
			.expect("the bound is lost");

		harness.started().await;
		let mut member = harness.member().await;
		let (failure, detail) = harness.failed().await;

		assert_eq!(failure, HostingFailureKind::SealingFailed);
		assert!(detail.contains("reserved ctr bound"), "{detail}");
		let sent = member.texts_until_closed().await;
		assert!(sent.is_empty(), "{sent:?}");
	});
}

struct RelaySide {
	socket: WebSocket,
	instance_id: String,
	unread: VecDeque<Value>,
}

impl RelaySide {
	async fn sent(&mut self, text: String) {
		self.socket.send(Message::Text(text.into())).await.expect("the frame reaches the host");
	}

	async fn taken(&mut self, wanted: impl Fn(&Value) -> bool) -> Value {
		if let Some(at) = self.unread.iter().position(&wanted) {
			return self.unread.remove(at).expect("a held frame");
		}
		loop {
			let frame = tokio::time::timeout(PATIENCE, self.socket.recv())
				.await
				.expect("a frame in time")
				.expect("the socket is open")
				.expect("a readable frame");
			let Message::Text(text) = frame else {
				continue;
			};
			let envelope: Value = serde_json::from_str(text.as_str()).expect("a json frame");
			if wanted(&envelope) {
				return envelope;
			}
			self.unread.push_back(envelope);
		}
	}

	async fn addressed(&mut self, device: &SealingMember, key: &str) -> Value {
		let to = device.relay_device_id.clone();
		self.taken(|envelope| envelope["to"] == to.as_str() && envelope.get(key).is_some()).await
	}

	async fn frames_until_closed(&mut self) -> Vec<Value> {
		let mut frames: Vec<Value> = self.unread.drain(..).collect();
		loop {
			let frame = tokio::time::timeout(PATIENCE, self.socket.recv())
				.await
				.expect("the session ends in time");
			match frame {
				Some(Ok(Message::Text(text))) => {
					frames.push(serde_json::from_str(text.as_str()).expect("a json frame"));
				}
				Some(Ok(Message::Close(_)) | Err(_)) | None => return frames,
				Some(Ok(_)) => {}
			}
		}
	}

	fn has_held_any_frame_to(&self, device: &SealingMember) -> bool {
		self.unread.iter().any(|envelope| envelope["to"] == device.relay_device_id.as_str())
	}
}

struct Joined {
	member: SealingMember,
	space: HeldSpaceKey,
	ctr: u64,
	rows: Vec<SignedRow>,
}

impl Harness {
	async fn relay_side(&mut self) -> RelaySide {
		let (socket, instance_id) = tokio::time::timeout(PATIENCE, self.sockets.recv())
			.await
			.expect("the host connected in time")
			.expect("the relay is up");
		RelaySide { socket, instance_id, unread: VecDeque::new() }
	}

	fn host_listed(&self) -> Value {
		let host = self.host_keys();
		let ed25519 = BASE64_URL_SAFE_NO_PAD.encode(host.signing_public().as_bytes());
		let registered = self.relay.device.device_of(&ed25519).expect("the host device registered");
		listed_device(&registered.id, OWNER_ACCOUNT, &host)
	}

	fn approved(&self, device: &SealingMember) {
		self.listed_as(device, "approved");
	}

	fn listed_pending(&self, device: &SealingMember) {
		self.listed_as(device, "pending");
	}

	fn listed_as(&self, device: &SealingMember, status: &str) {
		let host = self.host_listed();
		let mut listed = self.relay.listed_devices.lock().expect("the relay");
		let listed = listed.get_or_insert_with(|| vec![host]);
		listed.retain(|listed| listed["id"] != device.relay_device_id.as_str());
		let mut entry = listed_device(&device.relay_device_id, &device.account_id, &device.keys);
		entry["status"] = json!(status);
		listed.push(entry);
	}

	fn unlisted(&self, device: &SealingMember) {
		let mut listed = self.relay.listed_devices.lock().expect("the relay");
		let listed = listed.as_mut().expect("a device list");
		listed.retain(|listed| listed["id"] != device.relay_device_id.as_str());
	}

	fn device_lists(&self) -> usize {
		self.relay.device_lists.load(Ordering::SeqCst)
	}

	async fn joined(&self, relay: &mut RelaySide, account_id: &str) -> Joined {
		let member = SealingMember::new(account_id);
		self.approved(&member);
		relay.sent(device_approved_event(&member.relay_device_id, account_id)).await;
		let rekey = relay.addressed(&member, "rekey").await;
		let host = self.host_keys().signing_public();
		let handover =
			member.rekey_opened(&rekey, &relay.instance_id, &host).expect("the rekey opens");
		let rostered = verified_set(&host, &handover.roster);
		assert!(rostered.expect("the roster set verifies").contains(&member.keys.device_id()));
		Joined { space: space_key_of(&handover), rows: handover.roster.rows, member, ctr: 0 }
	}

	async fn devices(&self) -> Vec<AccountDevices> {
		devices(self.app.handle(), PERSONAL.to_owned()).await.expect("the roster reads")
	}

	#[cfg(unix)]
	async fn removed_while_no_key_is_stored(
		&self,
		device: &SealingMember,
	) -> Result<Vec<AccountDevices>, MembersError> {
		self.profile_locked(true);
		let device_id = device.keys.device_id().to_string();
		let removed = remove_device(self.app.handle(), PERSONAL.to_owned(), device_id).await;
		self.profile_locked(false);
		removed
	}

	#[cfg(unix)]
	fn profile_locked(&self, is_locked: bool) {
		use std::os::unix::fs::PermissionsExt;

		let profile = self.app.path().app_data_dir().expect("the data folder resolves");
		let mode = if is_locked { 0o500 } else { 0o700 };
		std::fs::set_permissions(&profile, std::fs::Permissions::from_mode(mode))
			.expect("the profile permissions change");
	}

	async fn is_rotation_pending(&self) -> bool {
		let state = self.app.state::<DatabaseState>();
		let relay = state.as_ref().expect("the database").space_relay();
		relay.is_rotation_pending(PERSONAL.to_owned()).await.expect("the marker reads")
	}

	fn flagged_joined(&self, user_id: &str) {
		for member in self.relay.members.lock().expect("the relay").iter_mut() {
			if member["userId"] == user_id {
				member["state"] = json!("joined");
			}
		}
	}
}

fn listed_device(relay_device_id: &str, account_id: &str, keys: &DeviceKeys) -> Value {
	json!({
		"id": relay_device_id,
		"userId": account_id,
		"status": "approved",
		"ed25519PublicKey": BASE64_URL_SAFE_NO_PAD.encode(keys.signing_public().as_bytes()),
		"x25519PublicKey": BASE64_URL_SAFE_NO_PAD.encode(keys.agreement_public().as_bytes()),
	})
}

fn a_member_call(id: &str) -> String {
	json!({ "id": id, "command": "agent_models" }).to_string()
}

async fn called(
	relay: &mut RelaySide,
	device: &mut Joined,
	host: &ed25519_dalek::VerifyingKey,
) -> Value {
	let space = Space { instance_id: &relay.instance_id.clone(), key: &device.space, host };
	let device_id = device.member.keys.device_id();
	device.ctr += 1;
	relay.sent(device.member.sealed(&space, device.ctr, HELLO, None)).await;
	let greeting = relay.addressed(&device.member, "ct").await;
	let greeting = host_frame_opened(&space, &greeting, Some(device_id)).expect("the hello opens");
	assert_eq!(greeting.plaintext, json!({ "hello": {} }));
	device.ctr += 1;
	let call = a_member_call(&format!("call-{}", device.ctr));
	relay.sent(device.member.sealed(&space, device.ctr, &call, greeting.challenge)).await;
	let answer = relay.addressed(&device.member, "ct").await;
	host_frame_opened(&space, &answer, Some(device_id)).expect("the answer opens").plaintext
}

fn device_ids(devices: &[AccountDevices]) -> Vec<(String, Vec<String>)> {
	devices
		.iter()
		.map(|account| {
			let ids = account.devices.iter().map(|device| device.device_id.clone()).collect();
			(account.account_id.clone(), ids)
		})
		.collect()
}

#[test]
fn a_joined_member_client_verifies_its_answer_and_exchanges_a_sealed_call() {
	run(async {
		let mut harness = Harness::signed_in("join-call").await;
		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "pending")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();

		let mut guest = harness.joined(&mut relay, "guest").await;
		let answer = called(&mut relay, &mut guest, &host).await;

		assert_eq!(guest.space.key_id, 1);
		assert_eq!(*guest.space.key, *harness.space_key(PERSONAL).key);
		assert_eq!(guest.rows.len(), 2);
		assert_eq!((answer["id"].clone(), answer["status"].clone()), (json!("call-2"), json!(200)));
	});
}

#[test]
fn removing_a_member_rekeys_the_remaining_device_while_the_removed_one_is_dropped_and_locked_out() {
	run(async {
		let mut harness = Harness::signed_in("join-rekey").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "pending"),
		]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut guest = harness.joined(&mut relay, "guest").await;
		let mut joiner = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&guest.member, "rekey").await;
		called(&mut relay, &mut guest, &host).await;
		relay.addressed(&guest.member, "rekey").await;
		harness.flagged_joined("guest");

		remove(harness.app.handle(), PERSONAL.to_owned(), "guest".to_owned())
			.await
			.expect("the guest is removed");
		let rekey = relay.addressed(&joiner.member, "rekey").await;
		let handover = joiner
			.member
			.rekey_opened(&rekey, &relay.instance_id, &host)
			.expect("the rekey verifies and opens");
		let rostered = verified_set(&host, &handover.roster).expect("the new roster set verifies");
		let mut forged = handover.roster.clone();
		let guest_row = guest.rows.iter().find(|row| row.account_id == "guest").expect("a row");
		forged.rows.push(guest_row.clone());
		let old_space = std::mem::replace(&mut joiner.space, space_key_of(&handover));
		joiner.ctr = 0;
		let answer = called(&mut relay, &mut joiner, &host).await;
		guest.ctr += 1;
		let guest_space =
			Space { instance_id: &relay.instance_id.clone(), key: &guest.space, host: &host };
		relay
			.sent(guest.member.sealed(&guest_space, guest.ctr, &a_member_call("removed"), None))
			.await;
		let after = called(&mut relay, &mut joiner, &host).await;
		let event =
			relay.taken(|envelope| envelope.get("to").is_none() && envelope["key_id"] == 2).await;
		let joiner_space =
			Space { instance_id: &relay.instance_id.clone(), key: &joiner.space, host: &host };
		let stale = Space { instance_id: &relay.instance_id.clone(), key: &old_space, host: &host };
		relay.sent(joiner.member.sealed(&stale, 99, HELLO, None)).await;
		let rekeyed_again = relay.addressed(&joiner.member, "rekey").await;

		assert_eq!(handover.key_id, 2);
		assert_eq!(*joiner.space.key, *harness.space_key(PERSONAL).key);
		assert!(!rostered.contains(&guest.member.keys.device_id()));
		assert!(rostered.contains(&joiner.member.keys.device_id()));
		assert_eq!(verified_set(&host, &forged), Err(CryptoError::ForgedSignature));
		assert_eq!(answer["status"], 200);
		assert_eq!(after["status"], 200);
		assert!(!relay.has_held_any_frame_to(&guest.member));
		assert!(host_frame_opened(&joiner_space, &event, None).is_ok());
		assert_eq!(host_frame_opened(&guest_space, &event, None), Err(CryptoError::Unauthentic));
		assert_eq!(rekeyed_again["to"], joiner.member.relay_device_id.as_str());
		assert!(joiner.member.rekey_opened(&rekeyed_again, &relay.instance_id, &host).is_ok());
		assert_eq!(
			device_ids(&harness.devices().await)
				.into_iter()
				.map(|(account, _)| account)
				.collect::<Vec<_>>(),
			vec!["joiner".to_owned(), "owner".to_owned()]
		);
	});
}

#[test]
fn a_second_device_of_the_host_account_is_admitted_without_invitation_and_removing_it_rotates() {
	run(async {
		let mut harness = Harness::signed_in("join-own-device").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys();

		let own = harness.joined(&mut relay, OWNER_ACCOUNT).await;
		let listed = harness.devices().await;
		let removed = remove_device(
			harness.app.handle(),
			PERSONAL.to_owned(),
			own.member.keys.device_id().to_string(),
		)
		.await
		.expect("the device is removed");

		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].account_id, "owner");
		let flags: Vec<(String, bool)> = listed[0]
			.devices
			.iter()
			.map(|device| (device.device_id.clone(), device.is_host))
			.collect();
		assert!(flags.contains(&(host.device_id().to_string(), true)));
		assert!(flags.contains(&(own.member.keys.device_id().to_string(), false)));
		assert_eq!(listed[0].devices[0].fingerprint.len(), 6);
		assert_eq!(
			removed,
			vec![AccountDevices {
				account_id: "owner".to_owned(),
				devices: vec![listed_host(&listed)],
			}]
		);
		assert_eq!(harness.space_key(PERSONAL).key_id, 2);
	});
}

fn listed_host(listed: &[AccountDevices]) -> RosterDevice {
	listed
		.iter()
		.flat_map(|account| account.devices.iter())
		.find(|device| device.is_host)
		.cloned()
		.expect("the host device is listed")
}

#[test]
fn removing_the_host_device_or_an_unknown_device_is_refused_and_changes_nothing() {
	run(async {
		let mut harness = Harness::signed_in("join-remove-refused").await;
		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "pending")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		harness.joined(&mut relay, "guest").await;
		let before = harness.devices().await;
		let removed =
			|device_id: String| remove_device(harness.app.handle(), PERSONAL.to_owned(), device_id);

		let host = removed(harness.host_keys().device_id().to_string()).await;
		let unknown = removed("0".repeat(32)).await;

		assert_eq!(host, Err(MembersError::HostDeviceNotRemovable));
		assert_eq!(unknown, Err(MembersError::UnknownDevice));
		assert_eq!(harness.devices().await, before);
		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
	});
}

#[cfg(unix)]
#[test]
fn a_rotation_whose_key_is_not_stored_stays_pending_until_the_next_devices_call_rotates() {
	run(async {
		let mut harness = Harness::signed_in("join-unrotated").await;
		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "pending")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let guest = harness.joined(&mut relay, "guest").await;

		let refused = harness.removed_while_no_key_is_stored(&guest.member).await;
		let left_pending =
			(harness.is_rotation_pending().await, harness.space_key(PERSONAL).key_id);
		let listed = harness.devices().await;

		let Err(MembersError::KeyNotRotated { reason }) = refused else {
			panic!("the rotation failure is not named: {refused:?}");
		};
		assert!(reason.contains("key_id 2"), "{reason}");
		assert!(!reason.contains(&BASE64_STANDARD.encode(guest.space.key.as_slice())), "{reason}");
		assert_eq!(left_pending, (true, 1));
		assert_eq!(device_ids(&listed).len(), 1);
		assert_eq!(harness.space_key(PERSONAL).key_id, 2);
		assert!(!harness.is_rotation_pending().await);
	});
}

#[test]
fn withdrawing_an_invitation_keeps_the_key_id_and_the_roster() {
	run(async {
		let mut harness = Harness::signed_in("join-withdraw-unused").await;
		harness.seed_invitations(&[cloud_invitation("i1", "guest@example.com", "valid")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		harness.joined(&mut relay, "joiner").await;
		let before = harness.devices().await;

		withdraw(harness.app.handle(), PERSONAL.to_owned(), "i1".to_owned())
			.await
			.expect("the invitation is withdrawn");

		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
		assert_eq!(harness.devices().await, before);
		assert!(!harness.is_rotation_pending().await);
	});
}

#[cfg(unix)]
#[test]
fn a_rotation_left_pending_rotates_when_the_host_socket_comes_back_online() {
	run(async {
		let mut harness = Harness::signed_in("join-pending-online").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "pending"),
		]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let guest = harness.joined(&mut relay, "guest").await;
		let joiner = harness.joined(&mut relay, "joiner").await;
		let refused = harness.removed_while_no_key_is_stored(&guest.member).await;
		harness.unlisted(&guest.member);
		let left_pending = harness.is_rotation_pending().await;

		harness.stopped().await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let stale =
			Space { instance_id: &relay.instance_id.clone(), key: &joiner.space, host: &host };
		relay.sent(joiner.member.sealed(&stale, 50, HELLO, None)).await;
		let rekey = relay.addressed(&joiner.member, "rekey").await;
		let handover = joiner
			.member
			.rekey_opened(&rekey, &relay.instance_id, &host)
			.expect("the rekey verifies and opens");

		assert!(matches!(refused, Err(MembersError::KeyNotRotated { .. })), "{refused:?}");
		assert!(left_pending);
		assert_eq!(handover.key_id, 2);
		assert_eq!(harness.space_key(PERSONAL).key_id, 2);
		assert!(!harness.is_rotation_pending().await);
	});
}

#[cfg(unix)]
#[test]
fn a_pending_rotation_failing_at_socket_start_ends_the_session_unsealed_and_the_reconnect_retries_it(
) {
	run(async {
		let mut harness = Harness::signed_in("join-start-unrotated").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "pending"),
		]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let guest = harness.joined(&mut relay, "guest").await;
		let joiner = harness.joined(&mut relay, "joiner").await;
		let refused = harness.removed_while_no_key_is_stored(&guest.member).await;
		harness.unlisted(&guest.member);
		harness.stopped().await;
		harness.profile_locked(true);

		harness.started().await;
		let mut refused_session = harness.relay_side().await;
		let frames = refused_session.frames_until_closed().await;
		harness.profile_locked(false);
		let mut retried = harness.relay_side().await;
		let stale =
			Space { instance_id: &retried.instance_id.clone(), key: &joiner.space, host: &host };
		retried.sent(joiner.member.sealed(&stale, 50, HELLO, None)).await;
		let rekey = retried.addressed(&joiner.member, "rekey").await;

		assert!(matches!(refused, Err(MembersError::KeyNotRotated { .. })), "{refused:?}");
		assert!(frames.iter().all(|frame| frame.get("ct").is_none()), "{frames:?}");
		let handover = joiner.member.rekey_opened(&rekey, &retried.instance_id, &host);
		assert_eq!(handover.expect("the rekey opens").key_id, 2);
		assert!(!harness.is_rotation_pending().await);
	});
}

fn device_revoked_event(relay_device_id: &str, user_id: &str) -> String {
	json!({ "event": "device.revoked", "deviceId": relay_device_id, "userId": user_id }).to_string()
}

fn device_approved_event(relay_device_id: &str, user_id: &str) -> String {
	json!({ "event": "device.approved", "deviceId": relay_device_id, "userId": user_id })
		.to_string()
}

#[test]
fn a_device_revoked_event_drops_the_row_and_rekeys_the_remaining_devices_with_the_next_key_id() {
	run(async {
		let mut harness = Harness::signed_in("revoked-event").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "pending"),
		]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut guest = harness.joined(&mut relay, "guest").await;
		let mut joiner = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&guest.member, "rekey").await;

		relay.sent(device_revoked_event(&guest.member.relay_device_id, "guest")).await;
		let rekey = relay.addressed(&joiner.member, "rekey").await;
		let handover = joiner
			.member
			.rekey_opened(&rekey, &relay.instance_id, &host)
			.expect("the rekey verifies and opens");
		let rostered = verified_set(&host, &handover.roster).expect("the new roster set verifies");
		guest.ctr += 1;
		let guest_space =
			Space { instance_id: &relay.instance_id.clone(), key: &guest.space, host: &host };
		relay
			.sent(guest.member.sealed(&guest_space, guest.ctr, &a_member_call("left"), None))
			.await;
		joiner.space = space_key_of(&handover);
		joiner.ctr = 0;
		let answer = called(&mut relay, &mut joiner, &host).await;

		assert_eq!(handover.key_id, 2);
		assert_eq!(harness.space_key(PERSONAL).key_id, 2);
		assert!(!rostered.contains(&guest.member.keys.device_id()));
		assert!(rostered.contains(&joiner.member.keys.device_id()));
		assert_eq!(answer["status"], 200);
		assert!(!relay.has_held_any_frame_to(&guest.member));
		assert!(!harness.is_rotation_pending().await);
		assert_eq!(harness.state(), HostingState::Online);
		let accounts: Vec<String> =
			device_ids(&harness.devices().await).into_iter().map(|(account, _)| account).collect();
		assert_eq!(accounts, vec!["joiner".to_owned(), "owner".to_owned()]);
	});
}

#[test]
fn a_device_revoked_event_naming_no_row_another_account_the_host_or_sent_by_a_member_changes_nothing(
) {
	run(async {
		let mut harness = Harness::signed_in("revoked-event-ignored").await;
		harness.seed(&[cloud_member("guest", "guest@example.com", "member", "pending")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut guest = harness.joined(&mut relay, "guest").await;
		let host_relay_device = held_relay_device(&harness).await.expect("a registered device");
		let before = harness.devices().await;

		relay.sent(device_revoked_event(&"0".repeat(32), "guest")).await;
		relay.sent(device_revoked_event(&guest.member.relay_device_id, "owner")).await;
		relay.sent(device_revoked_event(&host_relay_device, "owner")).await;
		let mut forged: Value =
			serde_json::from_str(&device_revoked_event(&guest.member.relay_device_id, "guest"))
				.expect("json");
		forged["from"] = json!(guest.member.relay_device_id);
		relay.sent(forged.to_string()).await;
		let answer = called(&mut relay, &mut guest, &host).await;

		assert_eq!(answer["status"], 200);
		assert_eq!(harness.devices().await, before);
		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
		assert!(!harness.is_rotation_pending().await);
		assert_eq!(harness.state(), HostingState::Online);
	});
}

#[cfg(unix)]
#[test]
fn a_device_revoked_event_whose_rotation_fails_ends_the_session_and_the_reconnect_rotates() {
	run(async {
		let mut harness = Harness::signed_in("revoked-event-unrotated").await;
		harness.seed(&[
			cloud_member("guest", "guest@example.com", "member", "pending"),
			cloud_member("joiner", "joiner@example.com", "member", "pending"),
		]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let guest = harness.joined(&mut relay, "guest").await;
		let joiner = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&guest.member, "rekey").await;

		harness.profile_locked(true);
		harness.unlisted(&guest.member);
		relay.sent(device_revoked_event(&guest.member.relay_device_id, "guest")).await;
		let frames = relay.frames_until_closed().await;
		let left_pending = harness.is_rotation_pending().await;
		let roster = relay_database(&harness).space_relay().roster(PERSONAL.to_owned()).await;
		let mut accounts: Vec<String> =
			roster.expect("the roster reads").rows.into_iter().map(|row| row.account_id).collect();
		accounts.sort();
		harness.profile_locked(false);
		let mut retried = harness.relay_side().await;
		let stale =
			Space { instance_id: &retried.instance_id.clone(), key: &joiner.space, host: &host };
		retried.sent(joiner.member.sealed(&stale, 50, HELLO, None)).await;
		let rekey = retried.addressed(&joiner.member, "rekey").await;

		assert!(frames.iter().all(|frame| frame.get("rekey").is_none()), "{frames:?}");
		assert!(left_pending);
		assert_eq!(accounts, vec!["joiner".to_owned(), "owner".to_owned()]);
		let handover = joiner.member.rekey_opened(&rekey, &retried.instance_id, &host);
		assert_eq!(handover.expect("the rekey opens").key_id, 2);
		assert!(!harness.is_rotation_pending().await);
	});
}

impl Harness {
	async fn device_list_settled(&self, reads: usize) {
		let is_read = || (self.device_lists() >= reads).then_some(());
		self.noticed_until("the device list read", is_read).await;
		self.devices().await;
	}

	async fn roster_version(&self) -> u64 {
		let roster = relay_database(self).space_relay().roster(PERSONAL.to_owned()).await;
		roster.expect("the roster reads").version
	}

	async fn rostered_as(&self, device: &SealingMember) -> Option<super::roster::Rostered> {
		let relay = relay_database(self).space_relay();
		let row =
			relay.roster_row_of_relay_device(PERSONAL.to_owned(), device.relay_device_id.clone());
		let row = row.await.expect("the roster row reads")?;
		let host = self.host_keys().signing_public();
		Some(super::roster::verified(&host, PERSONAL, &row).expect("the host signed the row"))
	}

	fn accepted(&self, user_id: &str, email: &str, devices: &[&SealingMember]) {
		self.relay.invitations.lock().expect("the relay").retain(|sent| sent["email"] != email);
		self.seed(&[cloud_member(user_id, email, "member", "joined")]);
		for device in devices {
			self.approved(device);
		}
	}
}

fn rekeyed_handover(
	relay: &RelaySide,
	device: &SealingMember,
	rekey: &Value,
	host: &ed25519_dalek::VerifyingKey,
) -> super::handover::KeyHandover {
	device.rekey_opened(rekey, &relay.instance_id, host).expect("the rekey verifies and opens")
}

#[test]
fn an_accepted_invitation_admits_every_approved_device_of_the_member_and_announces_the_list() {
	run(async {
		let mut harness = Harness::signed_in("devices-accepted").await;
		harness.seed_invitations(&[cloud_invitation("i1", "guest@example.com", "valid")]);
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let laptop = SealingMember::new("guest");
		let phone = SealingMember::new("guest");

		harness.accepted("guest", "guest@example.com", &[&laptop, &phone]);
		relay.sent(device_approved_event(&laptop.relay_device_id, "guest")).await;
		let laptop_rekey = relay.addressed(&laptop, "rekey").await;
		let phone_rekey = relay.addressed(&phone, "rekey").await;
		let handover = rekeyed_handover(&relay, &phone, &phone_rekey, &host);
		let rostered = verified_set(&host, &handover.roster).expect("the roster set verifies");
		let heard = || {
			let members = harness.heard_member_lists();
			members.last().filter(|last| last.as_array().is_some_and(|all| all.len() == 2)).cloned()
		};
		let members = harness.noticed_until("the joined member list", heard).await;

		assert_eq!(rekeyed_handover(&relay, &laptop, &laptop_rekey, &host).key_id, 1);
		assert_eq!(*space_key_of(&handover).key, *harness.space_key(PERSONAL).key);
		assert!(rostered.contains(&laptop.keys.device_id()));
		assert!(rostered.contains(&phone.keys.device_id()));
		let row = harness.rostered_as(&laptop).await.expect("the laptop is rostered");
		assert_eq!(row.relay_device_id, laptop.relay_device_id);
		assert_eq!(row.account_id, "guest");
		assert_eq!(row.signing, laptop.keys.signing_public());
		assert_eq!(row.agreement, laptop.keys.agreement_public());
		assert_eq!(members[1]["userId"], "guest");
		assert_eq!(members[1]["status"], "joined");
		assert_eq!(harness.heard_invitation_lists().last(), Some(&json!([])));
	});
}

#[test]
fn a_pending_device_gets_no_rekey_until_the_device_list_returns_it_approved() {
	run(async {
		let mut harness = Harness::signed_in("devices-pending").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let approved = SealingMember::new("guest");
		let pending = SealingMember::new("guest");

		harness.approved(&approved);
		harness.listed_pending(&pending);
		relay.sent(device_approved_event(&pending.relay_device_id, "guest")).await;
		relay.addressed(&approved, "rekey").await;
		let before_approval = harness.rostered_as(&pending).await;
		let held_before = relay.has_held_any_frame_to(&pending);
		harness.approved(&pending);
		relay.sent(device_approved_event(&pending.relay_device_id, "guest")).await;
		let rekey = relay.addressed(&pending, "rekey").await;
		let handover = rekeyed_handover(&relay, &pending, &rekey, &host);

		assert!(before_approval.is_none());
		assert!(!held_before);
		assert!(verified_set(&host, &handover.roster)
			.expect("the roster set verifies")
			.contains(&pending.keys.device_id()));
		assert!(harness.rostered_as(&pending).await.is_some());
	});
}

#[test]
fn a_device_approved_event_admits_and_rekeys_the_device_on_the_open_host_socket() {
	run(async {
		let mut harness = Harness::signed_in("device-approved-open").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		harness.device_list_settled(1).await;
		let opens = harness.attempts();
		let device = SealingMember::new("guest");

		harness.approved(&device);
		relay.sent(device_approved_event(&device.relay_device_id, "guest")).await;
		let rekey = relay.addressed(&device, "rekey").await;

		assert_eq!(rekeyed_handover(&relay, &device, &rekey, &host).key_id, 1);
		assert!(harness.rostered_as(&device).await.is_some());
		assert_eq!(harness.attempts(), opens);
		assert_eq!(harness.state(), HostingState::Online);
	});
}

#[test]
fn an_admission_sends_the_new_signed_roster_to_every_rostered_member_under_the_unchanged_key() {
	run(async {
		let mut harness = Harness::signed_in("admission-roster").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let guest = harness.joined(&mut relay, "guest").await;

		let joiner = harness.joined(&mut relay, "joiner").await;
		let rekey = relay.addressed(&guest.member, "rekey").await;
		let handover = rekeyed_handover(&relay, &guest.member, &rekey, &host);
		let rostered = verified_set(&host, &handover.roster).expect("the roster set verifies");

		assert_eq!(handover.key_id, guest.space.key_id);
		assert_eq!(*space_key_of(&handover).key, *guest.space.key);
		assert!(rostered.contains(&guest.member.keys.device_id()));
		assert!(rostered.contains(&joiner.member.keys.device_id()));
		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
	});
}

#[test]
fn a_member_that_missed_an_admission_gets_the_current_roster_before_its_hello_is_answered() {
	run(async {
		let mut harness = Harness::signed_in("admission-missed").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut guest = harness.joined(&mut relay, "guest").await;
		let joiner = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&guest.member, "rekey").await;

		let space =
			Space { instance_id: &relay.instance_id.clone(), key: &guest.space, host: &host };
		guest.ctr += 1;
		relay.sent(guest.member.sealed(&space, guest.ctr, HELLO, None)).await;
		let to = guest.member.relay_device_id.clone();
		let first = relay.taken(|envelope| envelope["to"] == to.as_str()).await;
		let greeting = relay.addressed(&guest.member, "ct").await;

		let handover = rekeyed_handover(&relay, &guest.member, &first, &host);
		let rostered = verified_set(&host, &handover.roster).expect("the roster set verifies");
		assert_eq!(handover.key_id, guest.space.key_id);
		assert!(rostered.contains(&joiner.member.keys.device_id()));
		let greeting = host_frame_opened(&space, &greeting, Some(guest.member.keys.device_id()))
			.expect("the hello opens");
		assert_eq!(greeting.plaintext, json!({ "hello": {} }));
	});
}

#[test]
fn a_device_approved_event_missing_its_device_or_user_id_still_admits() {
	run(async {
		let mut harness = Harness::signed_in("device-approved-partial").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		harness.device_list_settled(1).await;
		let laptop = SealingMember::new("guest");
		let phone = SealingMember::new("guest");

		harness.approved(&laptop);
		let without_user =
			json!({ "event": "device.approved", "deviceId": laptop.relay_device_id });
		relay.sent(without_user.to_string()).await;
		relay.addressed(&laptop, "rekey").await;
		harness.approved(&phone);
		relay.sent(json!({ "event": "device.approved", "userId": "guest" }).to_string()).await;
		relay.addressed(&phone, "rekey").await;

		assert!(harness.rostered_as(&laptop).await.is_some());
		assert!(harness.rostered_as(&phone).await.is_some());
	});
}

#[test]
fn a_device_approved_frame_sent_by_a_member_or_the_retired_device_list_event_admits_nothing() {
	run(async {
		let mut harness = Harness::signed_in("device-approved-ignored").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut guest = harness.joined(&mut relay, "guest").await;
		harness.device_list_settled(2).await;
		let reads = harness.device_lists();
		let newcomer = SealingMember::new("joiner");
		let mut forged: Value =
			serde_json::from_str(&device_approved_event(&newcomer.relay_device_id, "joiner"))
				.expect("json");
		forged["from"] = json!(guest.member.relay_device_id);
		let retired_event = ["devices", "changed"].join(".");
		let retired = json!({ "event": retired_event });

		harness.approved(&newcomer);
		relay.sent(forged.to_string()).await;
		relay.sent(retired.to_string()).await;
		let answer = called(&mut relay, &mut guest, &host).await;
		let held_before = relay.has_held_any_frame_to(&newcomer);
		relay.sent(device_approved_event(&newcomer.relay_device_id, "joiner")).await;
		relay.addressed(&newcomer, "rekey").await;
		harness.device_list_settled(reads + 1).await;

		assert_eq!(answer["status"], 200);
		assert!(!held_before);
		assert_eq!(harness.device_lists(), reads + 1);
		assert_eq!(harness.state(), HostingState::Online);
	});
}

#[test]
fn a_device_listed_while_the_host_socket_was_closed_is_admitted_at_the_next_socket_open() {
	run(async {
		let mut harness = Harness::signed_in("devices-caught-up").await;
		harness.started().await;
		let _first = harness.relay_side().await;
		harness.stopped().await;
		let device = SealingMember::new("guest");
		harness.approved(&device);

		harness.started().await;
		let mut relay = harness.relay_side().await;
		let rekey = relay.addressed(&device, "rekey").await;
		let host = harness.host_keys().signing_public();
		let handover = rekeyed_handover(&relay, &device, &rekey, &host);

		assert_eq!(handover.key_id, harness.space_key(PERSONAL).key_id);
		assert!(harness.rostered_as(&device).await.is_some());
	});
}

#[test]
fn a_rostered_device_missing_from_a_list_that_names_the_host_is_removed_and_the_key_rotated() {
	run(async {
		let mut harness = Harness::signed_in("devices-unlisted").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let gone = harness.joined(&mut relay, "guest").await;
		let mut kept = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&gone.member, "rekey").await;

		harness.unlisted(&gone.member);
		relay.sent(device_approved_event(&kept.member.relay_device_id, "joiner")).await;
		let rekey = relay.addressed(&kept.member, "rekey").await;
		let handover = rekeyed_handover(&relay, &kept.member, &rekey, &host);
		kept.space = space_key_of(&handover);
		kept.ctr = 0;
		let answer = called(&mut relay, &mut kept, &host).await;

		assert_eq!(handover.key_id, 2);
		assert!(!verified_set(&host, &handover.roster)
			.expect("the roster set verifies")
			.contains(&gone.member.keys.device_id()));
		assert!(harness.rostered_as(&gone.member).await.is_none());
		assert_eq!(answer["status"], 200);
		assert!(!relay.has_held_any_frame_to(&gone.member));
	});
}

#[test]
fn a_device_list_that_omits_the_host_device_or_fails_to_read_changes_no_roster_row() {
	run(async {
		let mut harness = Harness::signed_in("devices-unread").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let rostered = harness.joined(&mut relay, "guest").await;
		let newcomer = SealingMember::new("joiner");
		harness.device_list_settled(2).await;
		let before = (harness.devices().await, harness.roster_version().await);
		let reads = harness.device_lists();

		*harness.relay.listed_devices.lock().expect("the relay") =
			Some(vec![listed_device(&newcomer.relay_device_id, "joiner", &newcomer.keys)]);
		relay.sent(device_approved_event(&newcomer.relay_device_id, "joiner")).await;
		harness.device_list_settled(reads + 1).await;
		*harness.relay.listed_devices.lock().expect("the relay") = None;
		relay.sent(device_approved_event(&newcomer.relay_device_id, "joiner")).await;
		harness.device_list_settled(reads + 2).await;

		assert_eq!((harness.devices().await, harness.roster_version().await), before);
		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
		assert!(harness.rostered_as(&rostered.member).await.is_some());
		assert!(harness.rostered_as(&newcomer).await.is_none());
		assert!(!relay.has_held_any_frame_to(&newcomer));
		assert_eq!(harness.state(), HostingState::Online);
	});
}

#[test]
fn a_listed_device_rostered_under_other_keys_keeps_its_row_unchanged() {
	run(async {
		let mut harness = Harness::signed_in("devices-other-keys").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let rostered = harness.joined(&mut relay, "guest").await;
		let impostor = SealingMember {
			relay_device_id: rostered.member.relay_device_id.clone(),
			..SealingMember::new("guest")
		};
		harness.device_list_settled(2).await;
		let before = (harness.devices().await, harness.roster_version().await);
		let reads = harness.device_lists();

		harness.unlisted(&rostered.member);
		harness.approved(&impostor);
		relay.sent(device_approved_event(&impostor.relay_device_id, "guest")).await;
		harness.device_list_settled(reads + 1).await;

		assert_eq!((harness.devices().await, harness.roster_version().await), before);
		let row = harness.rostered_as(&rostered.member).await.expect("the row is kept");
		assert_eq!(row.signing, rostered.member.keys.signing_public());
		assert_eq!(harness.space_key(PERSONAL).key_id, 1);
	});
}

#[test]
fn two_overlapping_device_list_reads_admit_a_device_once() {
	run(async {
		let mut harness = Harness::signed_in("devices-overlap").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let device = SealingMember::new("guest");
		harness.device_list_settled(1).await;
		let reads = harness.device_lists();
		let before = harness.roster_version().await;

		harness.approved(&device);
		relay.sent(device_approved_event(&device.relay_device_id, "guest")).await;
		relay.sent(device_approved_event(&device.relay_device_id, "guest")).await;
		relay.addressed(&device, "rekey").await;
		harness.device_list_settled(reads + 2).await;

		assert_eq!(harness.roster_version().await, before + 1);
		let roster = relay_database(&harness).space_relay().roster(PERSONAL.to_owned()).await;
		let rows = roster.expect("the roster reads").rows;
		let device_rows = rows.iter().filter(|row| row.relay_device_id == device.relay_device_id);
		assert_eq!(device_rows.count(), 1);
	});
}

#[test]
fn a_join_frame_is_dropped_unanswered_and_the_socket_stays_open() {
	run(async {
		let mut harness = Harness::signed_in("devices-no-join").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let mut member = harness.joined(&mut relay, "guest").await;
		let joiner = SealingMember::new("joiner");

		relay
			.sent(
				json!({ "v": 2, "instance": relay.instance_id, "from": joiner.relay_device_id, "join": "bm90IGEgc2VhbGVkIGJveA==" })
					.to_string(),
			)
			.await;
		let answer = called(&mut relay, &mut member, &host).await;

		assert_eq!(answer["status"], 200);
		assert!(!relay.has_held_any_frame_to(&joiner));
		assert!(harness.rostered_as(&joiner).await.is_none());
	});
}

#[test]
fn a_device_removed_from_the_space_stays_out_while_listed_and_its_new_keys_are_admitted() {
	run(async {
		let mut harness = Harness::signed_in("devices-removed").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		let removed = harness.joined(&mut relay, "guest").await;
		let kept = harness.joined(&mut relay, "joiner").await;
		relay.addressed(&removed.member, "rekey").await;
		let removed_id = removed.member.keys.device_id().to_string();
		remove_device(harness.app.handle(), PERSONAL.to_owned(), removed_id)
			.await
			.expect("the device is removed");
		relay.addressed(&kept.member, "rekey").await;
		harness.device_list_settled(3).await;
		let reads = harness.device_lists();
		let version = harness.roster_version().await;

		relay.sent(device_approved_event(&removed.member.relay_device_id, "guest")).await;
		harness.device_list_settled(reads + 1).await;
		let after_change =
			(harness.rostered_as(&removed.member).await, harness.roster_version().await);
		let signed_in_again = SealingMember::new("guest");
		harness.approved(&signed_in_again);
		relay.sent(device_approved_event(&signed_in_again.relay_device_id, "guest")).await;
		let rekey = relay.addressed(&signed_in_again, "rekey").await;
		let handover = rekeyed_handover(&relay, &signed_in_again, &rekey, &host);

		assert_eq!(after_change, (None, version));
		assert!(!relay.has_held_any_frame_to(&removed.member));
		assert_eq!(handover.key_id, 2);
		assert!(harness.rostered_as(&signed_in_again).await.is_some());
		assert!(harness.rostered_as(&removed.member).await.is_none());
	});
}

#[test]
fn a_failed_admission_keeps_the_host_socket_open_and_the_next_device_approved_admits() {
	run(async {
		let mut harness = Harness::signed_in("devices-failed").await;
		harness.started().await;
		let mut relay = harness.relay_side().await;
		let host = harness.host_keys().signing_public();
		harness.device_list_settled(1).await;
		let reads = harness.device_lists();
		let attempts = harness.attempts();
		let renamed = |from: &'static str, to: &'static str| {
			relay_database(&harness).call_mut(move |connection| {
				connection.execute_batch(&format!("ALTER TABLE {from} RENAME TO {to}"))?;
				Ok(())
			})
		};
		let unadmitted = SealingMember::new("guest");

		renamed("space_removed_devices", "space_removed_devices_aside").await.expect("aside");
		harness.approved(&unadmitted);
		relay.sent(device_approved_event(&unadmitted.relay_device_id, "guest")).await;
		harness.device_list_settled(reads + 1).await;
		let after_failure = harness.rostered_as(&unadmitted).await;
		renamed("space_removed_devices_aside", "space_removed_devices").await.expect("back");
		relay.sent(device_approved_event(&unadmitted.relay_device_id, "guest")).await;
		let rekey = relay.addressed(&unadmitted, "rekey").await;

		assert!(after_failure.is_none());
		assert_eq!(rekeyed_handover(&relay, &unadmitted, &rekey, &host).key_id, 1);
		assert!(harness.rostered_as(&unadmitted).await.is_some());
		assert_eq!(harness.attempts(), attempts);
		assert_eq!(harness.state(), HostingState::Online);
	});
}
