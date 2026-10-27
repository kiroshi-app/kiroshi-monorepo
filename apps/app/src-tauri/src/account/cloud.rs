use std::collections::HashMap;
use std::fmt;
use std::sync::{LazyLock, Mutex, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use reqwest::header::{HeaderMap, RETRY_AFTER};
use reqwest::{Client, Method, RequestBuilder, StatusCode, Url};
use serde::Deserialize;
use serde_json::{json, Value};
use tokio::time::{sleep_until, Instant};

use super::contract::{AccountPlan, KiroshiAccount};
use crate::crypto::device_keys::DeviceKeys;
use crate::db::repositories::conversations::Hue;
use crate::db::repositories::joined_spaces::HostListing;
use crate::devices::contract::{DeviceKind, DeviceStatus};
use crate::hosting::contract::{
	InvitationState, SpaceInvitation, TransportFailure, UnreachableReason,
};
use crate::invitations::contract::Invitation;
use crate::mcp_oauth::commands::is_openable;
use crate::missions::github::installed_tls_provider;

const API_URL_OVERRIDE: &str = "KIROSHI_API_URL";

const AUTHORIZATION_REQUESTS_PATH: &str = "/authorization-requests";

const PLATFORM: &str = "macos";

const ME_PATH: &str = "/me";

const SIGN_OUT_PATH: &str = "/api/auth/sign-out";

const INSTANCES_PATH: &str = "/instances";

const INVITATIONS_PATH: &str = "/invitations";

const DEVICES_PATH: &str = "/devices";

const DEVICE_CHALLENGE_PATH: &str = "/devices/challenge";

const CURRENT_DEVICE_PATH: &str = "/devices/current";

const APPROVAL_CODE_PATH: &str = "/devices/approval-code";

const APPROVAL_CODE_VERIFY_PATH: &str = "/devices/approval-code/verify";

const DEVICE_REGISTER_CONTEXT: &[u8] = b"kiroshi-device-register-v1";

const DEVICE_CHALLENGE_INVALID: &str = "DEVICE_CHALLENGE_INVALID";

const NONCE_LENGTH: usize = 32;

const REQUEST_BOUND: Duration = Duration::from_secs(20);

const REFUSAL_DETAIL_BOUND: usize = 512;

const PAUSE_WITHOUT_RETRY_AFTER: Duration = Duration::from_secs(5);

const LONGEST_PAUSE: Duration = Duration::from_secs(120);

static PAUSES: LazyLock<Mutex<HashMap<String, Instant>>> =
	LazyLock::new(|| Mutex::new(HashMap::new()));

pub(crate) fn retry_after(headers: &HeaderMap) -> Duration {
	let Some(value) = headers.get(RETRY_AFTER) else {
		return PAUSE_WITHOUT_RETRY_AFTER;
	};
	match value.to_str().ok().and_then(|value| value.trim().parse::<u64>().ok()) {
		Some(seconds) => Duration::from_secs(seconds).min(LONGEST_PAUSE),
		None => {
			log::warn!("the relay sent a Retry-After that is not whole seconds: {value:?}");
			PAUSE_WITHOUT_RETRY_AFTER
		}
	}
}

pub fn api_url() -> String {
	resolve_api_url(env!("KIROSHI_CLOUD_API_URL"), std::env::var(API_URL_OVERRIDE).ok())
}

fn resolve_api_url(compiled: &str, overridden: Option<String>) -> String {
	match overridden {
		Some(overridden) if cfg!(debug_assertions) => overridden,
		_ => compiled.to_owned(),
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MeError {
	Revoked,
	Unreachable(String),
}

pub struct AuthorizationRequest {
	pub id: String,
	pub poll_secret: String,
	pub verification_url: String,
	pub expires_at: String,
	pub deadline: DateTime<Utc>,
	pub interval: Duration,
}

pub enum Polled {
	Pending { interval: Duration },
	Approved { token: String },
	Expired,
	Cancelled,
	SlowedDown,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum PollError {
	Unanswered(String),
	Unexpected(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InstancesError {
	Revoked,
	Unreachable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegisterError {
	Revoked,
	Unreachable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceRegisterError {
	Revoked,
	Refused(DeviceRefusal),
	Unreachable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceRefusal {
	pub path: &'static str,
	pub status: StatusCode,
	pub code: Option<String>,
}

impl DeviceRefusal {
	fn is_challenge_invalid(&self) -> bool {
		self.status == StatusCode::BAD_REQUEST
			&& self.code.as_deref() == Some(DEVICE_CHALLENGE_INVALID)
	}
}

impl fmt::Display for DeviceRefusal {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		write!(formatter, "POST {} answered {}", self.path, self.status.as_u16())?;
		match &self.code {
			Some(code) => write!(formatter, " {code}"),
			None => write!(formatter, " with no readable code"),
		}
	}
}

pub struct RegisteredDevice {
	pub id: String,
	pub transferred: bool,
	pub status: DeviceStatus,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceCallError {
	Revoked,
	Refused { status: StatusCode, code: Option<String> },
	Unreachable(String),
}

impl fmt::Display for DeviceCallError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			DeviceCallError::Revoked => write!(formatter, "the relay refused the session (401)"),
			DeviceCallError::Refused { status, code } => {
				write!(formatter, "the relay answered {}", status.as_u16())?;
				match code {
					Some(code) => write!(formatter, " {code}"),
					None => write!(formatter, " with no readable code"),
				}
			}
			DeviceCallError::Unreachable(reason) => write!(formatter, "{reason}"),
		}
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentDevice {
	pub status: DeviceStatus,
	pub approval_expires_at: Option<String>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudAccountDevice {
	pub id: String,
	pub name: Option<String>,
	pub kind: DeviceKind,
	pub status: DeviceStatus,
	pub approval_expires_at: Option<String>,
	pub last_active_at: String,
	pub current: bool,
	pub ed25519_public_key: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemberCallError {
	Revoked,
	Forbidden,
	InvalidEmail,
	AlreadyMember,
	LimitReached,
	UnknownMember,
	UnknownInvitation,
	OwnerNotRemovable,
	Unreachable { reason: UnreachableReason, detail: String },
}

impl MemberCallError {
	fn unsent(detail: String) -> Self {
		MemberCallError::Unreachable {
			reason: UnreachableReason::Transport { failure: TransportFailure::Unsent },
			detail,
		}
	}

	fn unreadable_list(error: reqwest::Error) -> Self {
		MemberCallError::Unreachable {
			reason: UnreachableReason::UnreadableList,
			detail: error.without_url().to_string(),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum LeaveCallError {
	Revoked,
	UnknownMembership,
	OwnerNotRemovable,
	Refused(String),
	Unreachable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum InvitationCallError {
	Revoked,
	Offline(String),
	Unreachable(String),
	Expired,
	Withdrawn,
	Used,
	OtherEmail,
	Unknown,
	AlreadyJoined,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct JoinedInstance {
	pub instance_id: String,
	pub name: String,
}

struct Unanswered {
	failure: TransportFailure,
	reason: String,
}

impl From<Unanswered> for String {
	fn from(unanswered: Unanswered) -> Self {
		unanswered.reason
	}
}

impl From<Unanswered> for InvitationCallError {
	fn from(Unanswered { failure, reason }: Unanswered) -> Self {
		match failure {
			TransportFailure::Offline => InvitationCallError::Offline(reason),
			TransportFailure::TimedOut | TransportFailure::Unsent => {
				InvitationCallError::Unreachable(reason)
			}
		}
	}
}

impl From<Unanswered> for MemberCallError {
	fn from(Unanswered { failure, reason }: Unanswered) -> Self {
		MemberCallError::Unreachable {
			reason: UnreachableReason::Transport { failure },
			detail: reason,
		}
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudMember {
	pub user_id: String,
	pub email: String,
	pub name: Option<String>,
	pub role: MemberRole,
	pub state: MembershipState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudRosterMember {
	pub user_id: String,
	pub name: Option<String>,
	pub role: MemberRole,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudDevice {
	#[serde(rename = "id")]
	pub device_id: String,
	pub user_id: String,
	pub status: DeviceStatus,
	pub ed25519_public_key: String,
	pub x25519_public_key: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MemberRole {
	Owner,
	Member,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum MembershipState {
	Joined,
	Pending,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct SentInvitation {
	id: String,
	email: String,
	sent_at: String,
	expires_at: String,
	state: SentInvitationState,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
enum SentInvitationState {
	Valid,
	Used,
	Expired,
	Withdrawn,
}

impl SentInvitation {
	fn into_shown(self) -> Option<SpaceInvitation> {
		let state = match self.state {
			SentInvitationState::Valid => InvitationState::Invited,
			SentInvitationState::Expired => InvitationState::Expired,
			SentInvitationState::Withdrawn => InvitationState::Withdrawn,
			SentInvitationState::Used => return None,
		};
		Some(SpaceInvitation {
			id: self.id,
			email: self.email,
			sent_at: self.sent_at,
			expires_at: self.expires_at,
			state,
		})
	}
}

#[derive(Deserialize)]
pub struct CloudInstance {
	pub id: String,
	pub name: String,
	#[serde(flatten)]
	pub listing: HostListing,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct ListedInvitation {
	#[serde(flatten)]
	pub invitation: Invitation,
	#[serde(flatten)]
	pub listing: HostListing,
}

#[derive(Deserialize)]
struct Registered {
	id: String,
}

#[derive(Deserialize)]
struct DeviceRegistered {
	id: String,
	transferred: bool,
	status: DeviceStatus,
}

#[derive(Deserialize)]
struct DeviceChallenge {
	nonce: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedRequest {
	id: String,
	poll_secret: String,
	#[serde(rename = "verificationURL")]
	verification_url: String,
	expires_at: String,
	interval: u64,
}

impl TryFrom<CreatedRequest> for AuthorizationRequest {
	type Error = String;

	fn try_from(created: CreatedRequest) -> Result<Self, String> {
		let id = uuid::Uuid::parse_str(&created.id)
			.map_err(|error| format!("the authorization request id is not a uuid: {error}"))?;
		if !is_openable(&created.verification_url) {
			return Err("the authorization request carried no web verificationURL".to_owned());
		}
		let deadline = DateTime::parse_from_rfc3339(&created.expires_at)
			.map_err(|error| format!("the authorization request expiresAt is unreadable: {error}"))?
			.with_timezone(&Utc);
		Ok(Self {
			id: id.to_string(),
			poll_secret: created.poll_secret,
			verification_url: created.verification_url,
			expires_at: created.expires_at,
			deadline,
			interval: Duration::from_secs(created.interval),
		})
	}
}

#[derive(Deserialize)]
#[serde(tag = "status", rename_all = "lowercase")]
enum PollAnswer {
	Pending { interval: u64 },
	Approved { token: String },
	Expired,
	Cancelled,
}

impl From<PollAnswer> for Polled {
	fn from(answer: PollAnswer) -> Self {
		match answer {
			PollAnswer::Pending { interval } => {
				Polled::Pending { interval: Duration::from_secs(interval) }
			}
			PollAnswer::Approved { token } => Polled::Approved { token },
			PollAnswer::Expired => Polled::Expired,
			PollAnswer::Cancelled => Polled::Cancelled,
		}
	}
}

#[derive(Deserialize)]
struct Refusal {
	error: RefusalCode,
}

#[derive(Deserialize)]
struct RefusalCode {
	code: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Me {
	id: String,
	email: String,
	created_at: String,
	#[serde(default)]
	plan: Option<Value>,
}

impl From<Me> for KiroshiAccount {
	fn from(me: Me) -> Self {
		let plan = me.plan.and_then(plan_read);
		Self { id: me.id, email: me.email, created_at: me.created_at, plan }
	}
}

fn plan_read(named: Value) -> Option<AccountPlan> {
	serde_json::from_value(named.clone())
		.inspect_err(|error| eprintln!("the cloud answered plan {named}, read as none: {error}"))
		.ok()
}

#[derive(Debug, Clone)]
pub struct Cloud {
	base: String,
}

impl Cloud {
	pub fn new(base: &str) -> Self {
		Self { base: base.trim_end_matches('/').to_owned() }
	}

	pub async fn create_authorization_request(
		&self,
		device_name: &str,
		callback_url: &str,
	) -> Result<AuthorizationRequest, String> {
		let body =
			json!({ "deviceName": device_name, "platform": PLATFORM, "callbackURL": callback_url });
		let answered = self
			.answered(|client| client.post(self.at(AUTHORIZATION_REQUESTS_PATH)).json(&body))
			.await?;
		if answered.status() != StatusCode::CREATED {
			return Err(format!(
				"the cloud answered {} to the authorization request",
				answered.status()
			));
		}
		let created = answered.json::<CreatedRequest>().await.map_err(|error| {
			format!("the authorization request answered by the cloud did not parse: {error}")
		})?;
		AuthorizationRequest::try_from(created)
	}

	pub async fn poll_authorization_request(
		&self,
		request: &AuthorizationRequest,
	) -> Result<Polled, PollError> {
		let poll = self.at(&format!("{AUTHORIZATION_REQUESTS_PATH}/{}/poll", request.id));
		let body = json!({ "pollSecret": request.poll_secret });
		let answered = self
			.reached(|client| client.post(poll).json(&body))
			.await
			.map_err(|unanswered| PollError::Unanswered(unanswered.into()))?;
		match answered.status() {
			StatusCode::NOT_FOUND | StatusCode::GONE => return Ok(Polled::Expired),
			StatusCode::TOO_MANY_REQUESTS => return Ok(Polled::SlowedDown),
			_ => {}
		}
		let answered = successful(answered).map_err(PollError::Unexpected)?;
		answered.json::<PollAnswer>().await.map(Polled::from).map_err(|error| {
			PollError::Unexpected(format!("the poll answered by the cloud did not parse: {error}"))
		})
	}

	pub async fn me(&self, bearer: &str) -> Result<KiroshiAccount, MeError> {
		let answered = self
			.answered(|client| client.get(self.at(ME_PATH)).bearer_auth(bearer))
			.await
			.map_err(MeError::Unreachable)?;
		if answered.status() == StatusCode::UNAUTHORIZED {
			return Err(MeError::Revoked);
		}
		let answered = successful(answered).map_err(MeError::Unreachable)?;
		answered.json::<Me>().await.map(KiroshiAccount::from).map_err(|error| {
			MeError::Unreachable(format!(
				"the account answered by the cloud did not parse: {error}"
			))
		})
	}

	pub async fn rename(&self, bearer: &str, name: &str) -> Result<(), MeError> {
		let body = json!({ "name": name });
		let answered = self
			.answered(|client| client.patch(self.at(ME_PATH)).bearer_auth(bearer).json(&body))
			.await
			.map_err(MeError::Unreachable)?;
		if answered.status() == StatusCode::UNAUTHORIZED {
			return Err(MeError::Revoked);
		}
		successful(answered).map(drop).map_err(MeError::Unreachable)
	}

	pub async fn sign_out(&self, bearer: &str) -> Result<(), String> {
		self.sent(|client| client.post(self.at(SIGN_OUT_PATH)).bearer_auth(bearer)).await.map(drop)
	}

	pub async fn register_instance(
		&self,
		bearer: &str,
		name: &str,
		colour: Option<Hue>,
	) -> Result<String, RegisterError> {
		let body = json!({ "name": name, "colour": colour });
		let answered = self
			.answered(|client| client.post(self.at(INSTANCES_PATH)).bearer_auth(bearer).json(&body))
			.await
			.map_err(RegisterError::Unreachable)?;
		if answered.status() == StatusCode::UNAUTHORIZED {
			return Err(RegisterError::Revoked);
		}
		let answered = successful(answered).map_err(RegisterError::Unreachable)?;
		let registered = answered.json::<Registered>().await.map_err(|error| {
			RegisterError::Unreachable(format!(
				"the registered instance carried no readable id: {error}"
			))
		})?;
		uuid::Uuid::parse_str(&registered.id).map(|id| id.to_string()).map_err(|error| {
			RegisterError::Unreachable(format!("the registered instance id is not a uuid: {error}"))
		})
	}

	pub async fn describe_instance(
		&self,
		bearer: &str,
		instance_id: &str,
		name: &str,
		colour: Option<Hue>,
	) -> Result<(), String> {
		let mut instance = Url::parse(&self.at(INSTANCES_PATH))
			.map_err(|error| format!("the instance url is unusable: {error}"))?;
		instance
			.path_segments_mut()
			.map_err(|()| "the cloud url has no path".to_owned())?
			.push(instance_id);
		let body = json!({ "name": name, "colour": colour });
		self.sent(|client| client.patch(instance).bearer_auth(bearer).json(&body)).await.map(drop)
	}

	pub async fn register_device(
		&self,
		bearer: &str,
		account_id: &str,
		keys: &DeviceKeys,
	) -> Result<RegisteredDevice, DeviceRegisterError> {
		match self.proven_device(bearer, account_id, keys).await {
			Err(DeviceRegisterError::Refused(refusal)) if refusal.is_challenge_invalid() => {
				self.proven_device(bearer, account_id, keys).await
			}
			registered => registered,
		}
	}

	async fn proven_device(
		&self,
		bearer: &str,
		account_id: &str,
		keys: &DeviceKeys,
	) -> Result<RegisteredDevice, DeviceRegisterError> {
		let nonce = self.device_challenge(bearer).await?;
		let decoded = BASE64_URL_SAFE_NO_PAD
			.decode(&nonce)
			.ok()
			.filter(|decoded| decoded.len() == NONCE_LENGTH)
			.ok_or_else(|| {
				DeviceRegisterError::Unreachable(
					"the device challenge nonce is not 32 base64url bytes".to_owned(),
				)
			})?;
		let signing = keys.signing_public();
		let proven =
			[DEVICE_REGISTER_CONTEXT, account_id.as_bytes(), signing.as_bytes(), &decoded].concat();
		let body = json!({
			"ed25519PublicKey": BASE64_URL_SAFE_NO_PAD.encode(signing.as_bytes()),
			"x25519PublicKey": BASE64_URL_SAFE_NO_PAD.encode(keys.agreement_public().as_bytes()),
			"nonce": nonce,
			"signature": BASE64_URL_SAFE_NO_PAD.encode(keys.sign(&proven).to_bytes()),
		});
		let answered = self
			.answered(|client| client.post(self.at(DEVICES_PATH)).bearer_auth(bearer).json(&body))
			.await
			.map_err(DeviceRegisterError::Unreachable)?;
		let answered = device_call_answered(DEVICES_PATH, answered).await?;
		let registered = answered.json::<DeviceRegistered>().await.map_err(|error| {
			DeviceRegisterError::Unreachable(format!(
				"the registered device carried no readable id, transferred and status: {error}"
			))
		})?;
		let id = uuid::Uuid::parse_str(&registered.id).map_err(|error| {
			DeviceRegisterError::Unreachable(format!(
				"the registered device id is not a uuid: {error}"
			))
		})?;
		Ok(RegisteredDevice {
			id: id.to_string(),
			transferred: registered.transferred,
			status: registered.status,
		})
	}

	async fn device_challenge(&self, bearer: &str) -> Result<String, DeviceRegisterError> {
		let answered = self
			.answered(|client| client.post(self.at(DEVICE_CHALLENGE_PATH)).bearer_auth(bearer))
			.await
			.map_err(DeviceRegisterError::Unreachable)?;
		let answered = device_call_answered(DEVICE_CHALLENGE_PATH, answered).await?;
		let challenge = answered.json::<DeviceChallenge>().await.map_err(|error| {
			DeviceRegisterError::Unreachable(format!(
				"the device challenge carried no readable nonce: {error}"
			))
		})?;
		Ok(challenge.nonce)
	}

	pub async fn delete_device(
		&self,
		bearer: &str,
		relay_device_id: &str,
	) -> Result<(), DeviceCallError> {
		let device = self.device_url(&[relay_device_id])?;
		self.device_called(|client| client.delete(device).bearer_auth(bearer)).await.map(drop)
	}

	pub async fn current_device(&self, bearer: &str) -> Result<CurrentDevice, DeviceCallError> {
		let current = self.at(CURRENT_DEVICE_PATH);
		let answered = self.device_called(|client| client.get(current).bearer_auth(bearer)).await?;
		answered.json::<CurrentDevice>().await.map_err(|error| {
			DeviceCallError::Unreachable(format!(
				"the current device answered by the relay did not parse: {error}"
			))
		})
	}

	pub async fn account_devices(
		&self,
		bearer: &str,
	) -> Result<Vec<CloudAccountDevice>, DeviceCallError> {
		let devices = self.at(DEVICES_PATH);
		let answered = self.device_called(|client| client.get(devices).bearer_auth(bearer)).await?;
		answered.json::<Vec<CloudAccountDevice>>().await.map_err(|error| {
			DeviceCallError::Unreachable(format!(
				"the device list answered by the relay did not parse: {error}"
			))
		})
	}

	pub async fn request_approval_code(&self, bearer: &str) -> Result<(), DeviceCallError> {
		let requested = self.at(APPROVAL_CODE_PATH);
		self.device_called(|client| client.post(requested).bearer_auth(bearer)).await.map(drop)
	}

	pub async fn verify_approval_code(
		&self,
		bearer: &str,
		code: &str,
	) -> Result<(), DeviceCallError> {
		let verified = self.at(APPROVAL_CODE_VERIFY_PATH);
		let body = json!({ "code": code });
		self.device_called(|client| client.post(verified).bearer_auth(bearer).json(&body))
			.await
			.map(drop)
	}

	pub async fn approve_device(
		&self,
		bearer: &str,
		relay_device_id: &str,
	) -> Result<(), DeviceCallError> {
		let approved = self.device_url(&[relay_device_id, "approve"])?;
		self.device_called(|client| client.post(approved).bearer_auth(bearer)).await.map(drop)
	}

	pub async fn reject_device(
		&self,
		bearer: &str,
		relay_device_id: &str,
	) -> Result<(), DeviceCallError> {
		let rejected = self.device_url(&[relay_device_id, "reject"])?;
		self.device_called(|client| client.post(rejected).bearer_auth(bearer)).await.map(drop)
	}

	fn device_url(&self, segments: &[&str]) -> Result<Url, DeviceCallError> {
		let mut device = Url::parse(&self.at(DEVICES_PATH)).map_err(|error| {
			DeviceCallError::Unreachable(format!("the device url is unusable: {error}"))
		})?;
		device
			.path_segments_mut()
			.map_err(|()| DeviceCallError::Unreachable("the cloud url has no path".to_owned()))?
			.extend(segments);
		Ok(device)
	}

	async fn device_called(
		&self,
		request: impl FnOnce(&Client) -> RequestBuilder,
	) -> Result<reqwest::Response, DeviceCallError> {
		let answered = self.answered(request).await.map_err(DeviceCallError::Unreachable)?;
		let status = answered.status();
		if status.is_success() {
			return Ok(answered);
		}
		if status == StatusCode::UNAUTHORIZED {
			return Err(DeviceCallError::Revoked);
		}
		let code = answered.json::<Refusal>().await.ok().map(|refusal| refusal.error.code);
		Err(DeviceCallError::Refused { status, code })
	}

	pub async fn members(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<CloudMember>, MemberCallError> {
		let members = self.members_url(instance_id);
		let answered = self.reached(|client| client.get(members).bearer_auth(bearer)).await?;
		let answered = member_call_answered(Method::GET, answered).await?;
		answered.json::<Vec<CloudMember>>().await.map_err(MemberCallError::unreadable_list)
	}

	pub async fn roster(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<CloudRosterMember>, MemberCallError> {
		let roster = self.at(&format!("{INSTANCES_PATH}/{instance_id}/roster"));
		let answered = self.reached(|client| client.get(roster).bearer_auth(bearer)).await?;
		let answered = member_call_answered(Method::GET, answered).await?;
		answered.json::<Vec<CloudRosterMember>>().await.map_err(MemberCallError::unreadable_list)
	}

	pub async fn invite_member(
		&self,
		bearer: &str,
		instance_id: &str,
		email: &str,
	) -> Result<(), MemberCallError> {
		let members = self.members_url(instance_id);
		let body = json!({ "email": email });
		let answered =
			self.reached(|client| client.post(members).bearer_auth(bearer).json(&body)).await?;
		match member_call_answered(Method::POST, answered).await {
			Err(MemberCallError::Unreachable {
				reason: UnreachableReason::RelayStatus { status: 400 },
				..
			}) => Err(MemberCallError::InvalidEmail),
			answered => answered.map(drop),
		}
	}

	pub async fn sent_invitations(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<SpaceInvitation>, MemberCallError> {
		let invitations = self.at(&format!("{INSTANCES_PATH}/{instance_id}{INVITATIONS_PATH}"));
		let answered = self.reached(|client| client.get(invitations).bearer_auth(bearer)).await?;
		let answered = member_call_answered(Method::GET, answered).await?;
		let sent = answered
			.json::<Vec<SentInvitation>>()
			.await
			.map_err(MemberCallError::unreadable_list)?;
		Ok(sent.into_iter().filter_map(SentInvitation::into_shown).collect())
	}

	pub async fn withdraw_invitation(
		&self,
		bearer: &str,
		instance_id: &str,
		invitation_id: &str,
	) -> Result<(), MemberCallError> {
		let invitation = self.sent_invitation_url(instance_id, &[invitation_id])?;
		let answered = self.reached(|client| client.delete(invitation).bearer_auth(bearer)).await?;
		invitation_answered(Method::DELETE, answered).await
	}

	pub async fn resend_invitation(
		&self,
		bearer: &str,
		instance_id: &str,
		invitation_id: &str,
	) -> Result<(), MemberCallError> {
		let resend = self.sent_invitation_url(instance_id, &[invitation_id, "resend"])?;
		let answered = self.reached(|client| client.post(resend).bearer_auth(bearer)).await?;
		invitation_answered(Method::POST, answered).await
	}

	pub async fn devices(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<CloudDevice>, MemberCallError> {
		let devices = self.at(&format!("{INSTANCES_PATH}/{instance_id}{DEVICES_PATH}"));
		let answered = self.reached(|client| client.get(devices).bearer_auth(bearer)).await?;
		let answered = member_call_answered(Method::GET, answered).await?;
		answered.json::<Vec<CloudDevice>>().await.map_err(MemberCallError::unreadable_list)
	}

	pub async fn remove_member(
		&self,
		bearer: &str,
		instance_id: &str,
		user_id: &str,
	) -> Result<(), MemberCallError> {
		let mut member = Url::parse(&self.members_url(instance_id)).map_err(|error| {
			MemberCallError::unsent(format!("the member url is unusable: {error}"))
		})?;
		member
			.path_segments_mut()
			.map_err(|()| MemberCallError::unsent("the cloud url has no path".to_owned()))?
			.push(user_id);
		let answered = self.reached(|client| client.delete(member).bearer_auth(bearer)).await?;
		if answered.status() == StatusCode::NOT_FOUND {
			return Err(MemberCallError::UnknownMember);
		}
		member_call_answered(Method::DELETE, answered).await.map(drop)
	}

	pub async fn leave_instance(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<(), LeaveCallError> {
		let membership = self.at(&format!("{INSTANCES_PATH}/{instance_id}/membership"));
		let answered = self
			.answered(|client| client.delete(membership).bearer_auth(bearer))
			.await
			.map_err(LeaveCallError::Unreachable)?;
		match answered.status() {
			StatusCode::UNAUTHORIZED => Err(LeaveCallError::Revoked),
			StatusCode::NOT_FOUND => Err(LeaveCallError::UnknownMembership),
			StatusCode::CONFLICT => Err(leave_conflicted(answered).await),
			_ => successful(answered).map(drop).map_err(LeaveCallError::Refused),
		}
	}

	pub async fn instances(&self, bearer: &str) -> Result<Vec<CloudInstance>, InstancesError> {
		let answered = self
			.answered(|client| client.get(self.at(INSTANCES_PATH)).bearer_auth(bearer))
			.await
			.map_err(InstancesError::Unreachable)?;
		if answered.status() == StatusCode::UNAUTHORIZED {
			return Err(InstancesError::Revoked);
		}
		let answered = successful(answered).map_err(InstancesError::Unreachable)?;
		answered.json::<Vec<CloudInstance>>().await.map_err(|error| {
			InstancesError::Unreachable(format!(
				"the instance list answered by the cloud did not parse: {error}"
			))
		})
	}

	pub async fn invitations(
		&self,
		bearer: &str,
	) -> Result<Vec<ListedInvitation>, InvitationCallError> {
		let answered = self
			.reached(|client| client.get(self.at(INVITATIONS_PATH)).bearer_auth(bearer))
			.await?;
		let answered = invitation_call_answered(answered).await?;
		answered.json::<Vec<ListedInvitation>>().await.map_err(|error| {
			InvitationCallError::Unreachable(format!(
				"the invitation list answered by the cloud did not parse: {error}"
			))
		})
	}

	pub async fn accept_invitation(
		&self,
		bearer: &str,
		invitation_id: &str,
	) -> Result<JoinedInstance, InvitationCallError> {
		let accept = self.invitation_url(invitation_id, "accept")?;
		let answered = self.reached(|client| client.post(accept).bearer_auth(bearer)).await?;
		let answered = invitation_call_answered(answered).await?;
		answered.json::<JoinedInstance>().await.map_err(|error| {
			InvitationCallError::Unreachable(format!(
				"the accepted instance carried no readable id and name: {error}"
			))
		})
	}

	pub async fn decline_invitation(
		&self,
		bearer: &str,
		invitation_id: &str,
	) -> Result<(), InvitationCallError> {
		let decline = self.invitation_url(invitation_id, "decline")?;
		let answered = self.reached(|client| client.post(decline).bearer_auth(bearer)).await?;
		invitation_call_answered(answered).await.map(drop)
	}

	fn invitation_url(&self, invitation_id: &str, verb: &str) -> Result<Url, InvitationCallError> {
		let mut invitation = Url::parse(&self.at(INVITATIONS_PATH)).map_err(|error| {
			InvitationCallError::Unreachable(format!("the invitation url is unusable: {error}"))
		})?;
		invitation
			.path_segments_mut()
			.map_err(|()| InvitationCallError::Unreachable("the cloud url has no path".to_owned()))?
			.push(invitation_id)
			.push(verb);
		Ok(invitation)
	}

	fn sent_invitation_url(
		&self,
		instance_id: &str,
		segments: &[&str],
	) -> Result<Url, MemberCallError> {
		let invitations = self.at(&format!("{INSTANCES_PATH}/{instance_id}{INVITATIONS_PATH}"));
		let mut invitation = Url::parse(&invitations).map_err(|error| {
			MemberCallError::unsent(format!("the invitation url is unusable: {error}"))
		})?;
		invitation
			.path_segments_mut()
			.map_err(|()| MemberCallError::unsent("the cloud url has no path".to_owned()))?
			.extend(segments);
		Ok(invitation)
	}

	fn members_url(&self, instance_id: &str) -> String {
		self.at(&format!("{INSTANCES_PATH}/{instance_id}/members"))
	}

	pub fn host_relay_url(&self, instance_id: &str, relay_device_id: &str) -> String {
		format!("{}?device={relay_device_id}", self.relay_url(instance_id, "host"))
	}

	pub fn member_relay_url(&self, instance_id: &str) -> String {
		self.relay_url(instance_id, "member")
	}

	fn relay_url(&self, instance_id: &str, side: &str) -> String {
		let relay = self.at(&format!("{INSTANCES_PATH}/{instance_id}/relay/{side}"));
		match relay.strip_prefix("http") {
			Some(rest) => format!("ws{rest}"),
			None => relay,
		}
	}

	fn at(&self, path: &str) -> String {
		format!("{}{path}", self.base)
	}

	pub(crate) fn rate_limited(&self, path: &str, retry_after: Duration) {
		let until = Instant::now() + retry_after;
		let mut pauses = PAUSES.lock().unwrap_or_else(PoisonError::into_inner);
		let paused = pauses.entry(self.base.clone()).or_insert(until);
		*paused = (*paused).max(until);
		log::warn!(
			"the relay answered {} to {path}: background requests pause for {retry_after:?}",
			StatusCode::TOO_MANY_REQUESTS
		);
	}

	fn paused_until(&self) -> Option<Instant> {
		let pauses = PAUSES.lock().unwrap_or_else(PoisonError::into_inner);
		pauses.get(&self.base).copied().filter(|until| *until > Instant::now())
	}

	pub(crate) async fn unpaused(&self) {
		while let Some(until) = self.paused_until() {
			sleep_until(until).await;
		}
	}

	async fn sent(
		&self,
		request: impl FnOnce(&Client) -> RequestBuilder,
	) -> Result<reqwest::Response, String> {
		successful(self.answered(request).await?)
	}

	async fn answered(
		&self,
		request: impl FnOnce(&Client) -> RequestBuilder,
	) -> Result<reqwest::Response, String> {
		self.reached(request).await.map_err(String::from)
	}

	async fn reached(
		&self,
		request: impl FnOnce(&Client) -> RequestBuilder,
	) -> Result<reqwest::Response, Unanswered> {
		installed_tls_provider();
		let client =
			Client::builder().timeout(REQUEST_BOUND).build().map_err(|error| Unanswered {
				failure: TransportFailure::Unsent,
				reason: format!("the cloud client could not be built: {error}"),
			})?;
		let answered = request(&client).send().await.map_err(|error| {
			let failure = if error.is_timeout() {
				TransportFailure::TimedOut
			} else if error.is_connect() {
				TransportFailure::Offline
			} else {
				TransportFailure::Unsent
			};
			let reason = format!("the cloud could not be reached: {}", error.without_url());
			Unanswered { failure, reason }
		})?;
		if answered.status() == StatusCode::TOO_MANY_REQUESTS {
			self.rate_limited(answered.url().path(), retry_after(answered.headers()));
		}
		Ok(answered)
	}
}

async fn invitation_call_answered(
	answered: reqwest::Response,
) -> Result<reqwest::Response, InvitationCallError> {
	match answered.status() {
		StatusCode::UNAUTHORIZED => Err(InvitationCallError::Revoked),
		StatusCode::NOT_FOUND => Err(InvitationCallError::Unknown),
		StatusCode::FORBIDDEN | StatusCode::GONE | StatusCode::CONFLICT => {
			Err(invitation_refused(answered).await)
		}
		_ => successful(answered).map_err(InvitationCallError::Unreachable),
	}
}

async fn invitation_refused(answered: reqwest::Response) -> InvitationCallError {
	let status = answered.status();
	let code = match answered.json::<Refusal>().await {
		Ok(refusal) => refusal.error.code,
		Err(error) => {
			return InvitationCallError::Unreachable(format!(
				"the cloud answered {status} with an unreadable body: {error}"
			))
		}
	};
	match (status, code.as_str()) {
		(StatusCode::GONE, "INVITATION_EXPIRED") => InvitationCallError::Expired,
		(StatusCode::GONE, "INVITATION_WITHDRAWN") => InvitationCallError::Withdrawn,
		(StatusCode::GONE, "INVITATION_USED") => InvitationCallError::Used,
		(StatusCode::FORBIDDEN, "INVITATION_EMAIL_MISMATCH") => InvitationCallError::OtherEmail,
		(StatusCode::CONFLICT, "ALREADY_JOINED") => InvitationCallError::AlreadyJoined,
		_ => InvitationCallError::Unreachable(format!("the cloud answered {status} coded {code}")),
	}
}

async fn leave_conflicted(answered: reqwest::Response) -> LeaveCallError {
	match answered.json::<Refusal>().await {
		Ok(refusal) if refusal.error.code == "OWNER_NOT_REMOVABLE" => {
			LeaveCallError::OwnerNotRemovable
		}
		Ok(refusal) => LeaveCallError::Refused(format!(
			"the cloud answered a conflict coded {}",
			refusal.error.code
		)),
		Err(error) => LeaveCallError::Refused(format!(
			"the cloud answered a conflict with an unreadable body: {error}"
		)),
	}
}

async fn device_call_answered(
	path: &'static str,
	answered: reqwest::Response,
) -> Result<reqwest::Response, DeviceRegisterError> {
	let status = answered.status();
	if status == StatusCode::UNAUTHORIZED {
		return Err(DeviceRegisterError::Revoked);
	}
	let is_transient =
		matches!(status, StatusCode::REQUEST_TIMEOUT | StatusCode::TOO_MANY_REQUESTS);
	if is_transient || !status.is_client_error() {
		return successful(answered).map_err(DeviceRegisterError::Unreachable);
	}
	let code = answered.json::<Refusal>().await.ok().map(|refusal| refusal.error.code);
	Err(DeviceRegisterError::Refused(DeviceRefusal { path, status, code }))
}

async fn member_call_answered(
	method: Method,
	answered: reqwest::Response,
) -> Result<reqwest::Response, MemberCallError> {
	let status = answered.status();
	if status.is_success() {
		return Ok(answered);
	}
	let path = answered.url().path().to_owned();
	let body = answered.text().await.map_err(|error| error.without_url().to_string());
	log::warn!("the relay answered {method} {path} with {status}: {}", shown(&body));
	Err(member_refusal(status, body))
}

fn member_refusal(status: StatusCode, body: Result<String, String>) -> MemberCallError {
	match status {
		StatusCode::UNAUTHORIZED => MemberCallError::Revoked,
		StatusCode::FORBIDDEN => MemberCallError::Forbidden,
		StatusCode::CONFLICT => conflicted(body),
		status => MemberCallError::Unreachable {
			reason: UnreachableReason::RelayStatus { status: status.as_u16() },
			detail: shown(&body),
		},
	}
}

fn shown(body: &Result<String, String>) -> String {
	match body {
		Ok(body) => bounded(body),
		Err(error) => format!("the body did not read: {error}"),
	}
}

async fn invitation_answered(
	method: Method,
	answered: reqwest::Response,
) -> Result<(), MemberCallError> {
	if answered.status() == StatusCode::NOT_FOUND {
		return Err(MemberCallError::UnknownInvitation);
	}
	member_call_answered(method, answered).await.map(drop)
}

fn conflicted(body: Result<String, String>) -> MemberCallError {
	let body = match body {
		Ok(body) => body,
		Err(error) => {
			return unreadable_conflict(format!("the conflict body did not read: {error}"))
		}
	};
	let refusal = match serde_json::from_str::<Refusal>(&body) {
		Ok(refusal) => refusal,
		Err(error) => {
			return unreadable_conflict(format!("the conflict body did not parse: {error}"))
		}
	};
	match refusal.error.code.as_str() {
		"ALREADY_MEMBER" | "ALREADY_INVITED" => MemberCallError::AlreadyMember,
		"MEMBER_LIMIT_REACHED" => MemberCallError::LimitReached,
		"OWNER_NOT_REMOVABLE" => MemberCallError::OwnerNotRemovable,
		_ => MemberCallError::Unreachable {
			reason: UnreachableReason::RelayConflict { code: refusal.error.code },
			detail: bounded(&body),
		},
	}
}

fn unreadable_conflict(detail: String) -> MemberCallError {
	MemberCallError::Unreachable { reason: UnreachableReason::UnreadableConflict, detail }
}

fn bounded(body: &str) -> String {
	let mut end = body.len().min(REFUSAL_DETAIL_BOUND);
	while !body.is_char_boundary(end) {
		end -= 1;
	}
	body[..end].to_owned()
}

fn successful(answered: reqwest::Response) -> Result<reqwest::Response, String> {
	let status = answered.status();
	if status.is_success() {
		return Ok(answered);
	}
	Err(format!("the cloud answered {status}"))
}

#[cfg(test)]
mod tests {
	use std::net::Ipv4Addr;
	use std::sync::{Arc, Mutex};

	use axum::http::{Method as Asked, StatusCode as Answered, Uri};
	use axum::Router;
	use tokio::net::TcpListener;

	use super::*;
	use crate::hosting::contract::MembersError;

	const INSTANCE: &str = "i1";

	async fn answering(status: u16, body: &str) -> Cloud {
		let status = Answered::from_u16(status).expect("a valid status");
		let body = body.to_owned();
		serving(Router::new().fallback(move || {
			let body = body.clone();
			async move { (status, body) }
		}))
		.await
	}

	async fn serving(router: Router) -> Cloud {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
		let address = listener.local_addr().expect("the fake is named");
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the fake serves") });
		Cloud::new(&format!("http://{address}"))
	}

	async fn invited(status: u16, body: &str) -> Result<(), MemberCallError> {
		answering(status, body).await.invite_member("bearer", INSTANCE, "ada@example.com").await
	}

	async fn rate_limiting(retry_after: &'static str, reached: Arc<Mutex<usize>>) -> Cloud {
		serving(Router::new().fallback(move || {
			let reached = Arc::clone(&reached);
			async move {
				*reached.lock().expect("the count") += 1;
				(Answered::TOO_MANY_REQUESTS, [(RETRY_AFTER, retry_after)], "slow down")
			}
		}))
		.await
	}

	fn retried_after(value: Option<&str>) -> Duration {
		let mut headers = HeaderMap::new();
		if let Some(value) = value {
			headers.insert(RETRY_AFTER, value.parse().expect("a header value"));
		}
		retry_after(&headers)
	}

	#[test]
	fn the_retry_after_reads_its_whole_seconds() {
		assert_eq!(retried_after(Some("7")), Duration::from_secs(7));
	}

	#[test]
	fn a_retry_after_absent_or_not_in_whole_seconds_pauses_five_seconds() {
		assert_eq!(retried_after(None), Duration::from_secs(5));
		assert_eq!(retried_after(Some("Wed, 21 Oct 2026 07:28:00 GMT")), Duration::from_secs(5));
		assert_eq!(retried_after(Some("1.5")), Duration::from_secs(5));
	}

	#[test]
	fn a_retry_after_above_two_minutes_pauses_two_minutes() {
		assert_eq!(retried_after(Some("121")), Duration::from_secs(120));
		assert_eq!(retried_after(Some("86400")), Duration::from_secs(120));
		assert_eq!(retried_after(Some("120")), Duration::from_secs(120));
	}

	#[tokio::test]
	async fn a_429_pauses_every_cloud_of_its_base_for_its_retry_after() {
		let cloud = rate_limiting("2", Arc::new(Mutex::new(0))).await;
		let other = Cloud::new(&cloud.base);

		let read = cloud.me("bearer").await;
		tokio::time::pause();
		let paused_at = Instant::now();
		let early = tokio::time::timeout(Duration::from_millis(1900), other.unpaused()).await;
		other.unpaused().await;

		assert_eq!(
			read,
			Err(MeError::Unreachable(format!(
				"the cloud answered {}",
				Answered::TOO_MANY_REQUESTS
			)))
		);
		assert!(early.is_err());
		assert!(paused_at.elapsed() >= Duration::from_millis(1900));
	}

	#[tokio::test]
	async fn a_gesture_still_reaches_the_relay_while_it_pauses_the_background() {
		let reached = Arc::new(Mutex::new(0));
		let cloud = rate_limiting("60", Arc::clone(&reached)).await;

		let first = cloud.invite_member("bearer", INSTANCE, "ada@example.com").await;
		let again = cloud.invite_member("bearer", INSTANCE, "ada@example.com").await;

		assert!(cloud.paused_until().is_some());
		assert!(first.is_err() && again.is_err());
		assert_eq!(*reached.lock().expect("the count"), 2);
	}

	#[tokio::test]
	async fn an_invite_posts_its_email_to_the_members_route_the_relay_serves() {
		let received = Arc::new(Mutex::new(Vec::new()));
		let recorded = Arc::clone(&received);
		let cloud = serving(Router::new().fallback(move |method: Asked, uri: Uri, body: String| {
			let recorded = Arc::clone(&recorded);
			async move {
				recorded.lock().expect("the record").push(format!("{method} {} {body}", uri.path()));
				let invitation = r#"{"id":"0b6f7d2e-3c4a-4e5f-8a9b-1c2d3e4f5a6b","email":"ada@example.com","sentAt":"2026-10-20T15:55:00.000Z","expiresAt":"2026-10-27T15:55:00.000Z","invitationEmail":"sent"}"#;
				(Answered::CREATED, invitation)
			}
		}))
		.await;

		let invited = cloud.invite_member("bearer", INSTANCE, "ada@example.com").await;

		assert_eq!(invited, Ok(()));
		assert_eq!(
			*received.lock().expect("the record"),
			vec![format!(r#"POST /instances/{INSTANCE}/members {{"email":"ada@example.com"}}"#)]
		);
	}

	#[tokio::test]
	async fn the_device_list_decodes_the_body_the_relay_answers() {
		let body = r#"[
			{"id":"7c9e6679-7425-40de-944b-e07fc1f90ae7","userId":"9b2e1c4a-5d6f-4a7b-8c9d-0e1f2a3b4c5d","status":"approved","ed25519PublicKey":"ed-of-the-host","x25519PublicKey":"x-of-the-host"},
			{"id":"1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b","userId":"3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f","status":"pending","ed25519PublicKey":"ed-of-the-member","x25519PublicKey":"x-of-the-member"}
		]"#;

		let listed = answering(200, body).await.devices("bearer", INSTANCE).await;

		let listed = listed.expect("the relay device list decodes");
		let read: Vec<_> = listed
			.iter()
			.map(|device| {
				(
					device.device_id.as_str(),
					device.user_id.as_str(),
					device.status,
					device.ed25519_public_key.as_str(),
					device.x25519_public_key.as_str(),
				)
			})
			.collect();
		assert_eq!(
			read,
			vec![
				(
					"7c9e6679-7425-40de-944b-e07fc1f90ae7",
					"9b2e1c4a-5d6f-4a7b-8c9d-0e1f2a3b4c5d",
					DeviceStatus::Approved,
					"ed-of-the-host",
					"x-of-the-host",
				),
				(
					"1f2e3d4c-5b6a-4978-8a9b-0c1d2e3f4a5b",
					"3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f",
					DeviceStatus::Pending,
					"ed-of-the-member",
					"x-of-the-member",
				),
			]
		);
	}

	#[tokio::test]
	async fn an_unmapped_status_is_a_relay_status_carrying_its_body() {
		for status in [404, 422, 429, 500] {
			assert_eq!(
				invited(status, r#"{"error":{"code":"X"}}"#).await,
				Err(MemberCallError::Unreachable {
					reason: UnreachableReason::RelayStatus { status },
					detail: r#"{"error":{"code":"X"}}"#.to_owned(),
				}),
				"{status}"
			);
		}
	}

	#[tokio::test]
	async fn a_relay_status_keeps_at_most_the_first_512_bytes_of_its_body() {
		let body = format!("a{}", "é".repeat(300));

		let Err(MemberCallError::Unreachable { detail, .. }) = invited(500, &body).await else {
			panic!("a 500 is unreachable");
		};

		assert_eq!(detail.len(), 511);
		assert!(body.starts_with(&detail));
	}

	#[tokio::test]
	async fn the_mapped_refusals_are_unchanged() {
		assert_eq!(invited(400, "{}").await, Err(MemberCallError::InvalidEmail));
		assert_eq!(invited(401, "{}").await, Err(MemberCallError::Revoked));
		assert_eq!(invited(403, "{}").await, Err(MemberCallError::Forbidden));
		for (code, refusal) in [
			("ALREADY_MEMBER", MemberCallError::AlreadyMember),
			("MEMBER_LIMIT_REACHED", MemberCallError::LimitReached),
			("OWNER_NOT_REMOVABLE", MemberCallError::OwnerNotRemovable),
		] {
			let body = format!(r#"{{"error":{{"code":"{code}"}}}}"#);
			assert_eq!(invited(409, &body).await, Err(refusal), "{code}");
		}
	}

	#[tokio::test]
	async fn a_404_on_a_sent_invitation_is_still_an_unknown_invitation() {
		let cloud = answering(404, "{}").await;

		assert_eq!(
			cloud.withdraw_invitation("bearer", INSTANCE, "inv1").await,
			Err(MemberCallError::UnknownInvitation)
		);
	}

	#[tokio::test]
	async fn an_email_already_holding_a_valid_invitation_is_already_invited() {
		let refused = invited(409, r#"{"error":{"code":"ALREADY_INVITED"}}"#).await;

		assert_eq!(refused.map_err(MembersError::from), Err(MembersError::AlreadyInvited));
	}

	#[tokio::test]
	async fn a_conflict_with_another_code_is_a_relay_conflict_carrying_it() {
		let body = r#"{"error":{"code":"INSTANCE_FROZEN","message":"held"}}"#;

		assert_eq!(
			invited(409, body).await,
			Err(MemberCallError::Unreachable {
				reason: UnreachableReason::RelayConflict { code: "INSTANCE_FROZEN".to_owned() },
				detail: body.to_owned(),
			})
		);
	}

	#[tokio::test]
	async fn a_conflict_with_an_unreadable_body_is_an_unreadable_conflict() {
		let Err(MemberCallError::Unreachable { reason, detail }) = invited(409, "busy").await
		else {
			panic!("an unreadable conflict is unreachable");
		};

		assert_eq!(reason, UnreachableReason::UnreadableConflict);
		assert!(detail.contains("did not parse"), "{detail}");
	}

	#[tokio::test]
	async fn a_closed_port_is_an_offline_transport() {
		let closed = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = closed.local_addr().expect("the port is named");
		drop(closed);

		let Err(MemberCallError::Unreachable { reason, .. }) =
			Cloud::new(&format!("http://{address}"))
				.invite_member("bearer", INSTANCE, "ada@example.com")
				.await
		else {
			panic!("a closed port is unreachable");
		};

		assert_eq!(reason, UnreachableReason::Transport { failure: TransportFailure::Offline });
	}

	#[test]
	fn the_base_url_loses_its_trailing_slash() {
		assert_eq!(Cloud::new("http://127.0.0.1:9/").at(ME_PATH), "http://127.0.0.1:9/me");
	}

	#[test]
	fn the_host_relay_is_reached_over_the_websocket_scheme_of_the_base() {
		assert_eq!(
			Cloud::new("https://api.kiroshi.app/").host_relay_url("i1", "d1"),
			"wss://api.kiroshi.app/instances/i1/relay/host?device=d1"
		);
		assert_eq!(
			Cloud::new("http://127.0.0.1:9").host_relay_url("i1", "d1"),
			"ws://127.0.0.1:9/instances/i1/relay/host?device=d1"
		);
	}

	#[test]
	fn the_member_relay_is_reached_over_the_websocket_scheme_of_the_base() {
		assert_eq!(
			Cloud::new("https://api.kiroshi.app/").member_relay_url("i1"),
			"wss://api.kiroshi.app/instances/i1/relay/member"
		);
	}

	#[test]
	fn the_compiled_base_url_is_kiroshi_cloud() {
		assert_eq!(env!("KIROSHI_CLOUD_API_URL"), "https://api.kiroshi.app");
	}

	#[test]
	fn the_compiled_base_url_applies_without_an_override() {
		assert_eq!(resolve_api_url("https://compiled.test", None), "https://compiled.test");
	}

	#[test]
	fn a_debug_build_prefers_the_runtime_override() {
		let resolved =
			resolve_api_url("https://compiled.test", Some("http://127.0.0.1:9".to_owned()));
		let expected =
			if cfg!(debug_assertions) { "http://127.0.0.1:9" } else { "https://compiled.test" };
		assert_eq!(resolved, expected);
	}
}
