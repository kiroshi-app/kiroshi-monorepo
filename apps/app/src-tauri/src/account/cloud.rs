use std::fmt;
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use chrono::{DateTime, Utc};
use reqwest::{Client, RequestBuilder, StatusCode, Url};
use serde::Deserialize;
use serde_json::{json, Value};

use super::contract::{AccountPlan, KiroshiAccount};
use crate::crypto::device_keys::DeviceKeys;
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

const DEVICE_REGISTER_CONTEXT: &[u8] = b"kiroshi-device-register-v1";

const DEVICE_CHALLENGE_INVALID: &str = "DEVICE_CHALLENGE_INVALID";

const NONCE_LENGTH: usize = 32;

const REQUEST_BOUND: Duration = Duration::from_secs(20);

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
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MemberCallError {
	Revoked,
	Forbidden,
	InvalidEmail,
	AlreadyMember,
	LimitReached,
	UnknownMember,
	OwnerNotRemovable,
	Unreachable(String),
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
	Withdrawn,
	Unknown,
	AlreadyJoined,
}

#[derive(Deserialize)]
pub struct JoinedInstance {
	pub name: String,
}

enum Unanswered {
	Offline(String),
	Unreachable(String),
}

impl From<Unanswered> for String {
	fn from(unanswered: Unanswered) -> Self {
		match unanswered {
			Unanswered::Offline(reason) | Unanswered::Unreachable(reason) => reason,
		}
	}
}

impl From<Unanswered> for InvitationCallError {
	fn from(unanswered: Unanswered) -> Self {
		match unanswered {
			Unanswered::Offline(reason) => InvitationCallError::Offline(reason),
			Unanswered::Unreachable(reason) => InvitationCallError::Unreachable(reason),
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
pub struct CloudInstance {
	pub id: String,
	pub name: String,
}

#[derive(Deserialize)]
struct Registered {
	id: String,
}

#[derive(Deserialize)]
struct DeviceRegistered {
	id: String,
	transferred: bool,
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
	) -> Result<String, RegisterError> {
		let body = json!({ "name": name });
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
				"the registered device carried no readable id and transferred: {error}"
			))
		})?;
		let id = uuid::Uuid::parse_str(&registered.id).map_err(|error| {
			DeviceRegisterError::Unreachable(format!(
				"the registered device id is not a uuid: {error}"
			))
		})?;
		Ok(RegisteredDevice { id: id.to_string(), transferred: registered.transferred })
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

	pub async fn delete_device(&self, bearer: &str, relay_device_id: &str) -> Result<(), String> {
		let mut device = Url::parse(&self.at(DEVICES_PATH))
			.map_err(|error| format!("the device url is unusable: {error}"))?;
		device
			.path_segments_mut()
			.map_err(|()| "the cloud url has no path".to_owned())?
			.push(relay_device_id);
		self.sent(|client| client.delete(device).bearer_auth(bearer)).await.map(drop)
	}

	pub async fn members(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<CloudMember>, MemberCallError> {
		let members = self.members_url(instance_id);
		let answered = self
			.answered(|client| client.get(members).bearer_auth(bearer))
			.await
			.map_err(MemberCallError::Unreachable)?;
		let answered = member_call_answered(answered).await?;
		answered.json::<Vec<CloudMember>>().await.map_err(|error| {
			MemberCallError::Unreachable(format!(
				"the member list answered by the cloud did not parse: {error}"
			))
		})
	}

	pub async fn roster(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<Vec<CloudRosterMember>, MemberCallError> {
		let roster = self.at(&format!("{INSTANCES_PATH}/{instance_id}/roster"));
		let answered = self
			.answered(|client| client.get(roster).bearer_auth(bearer))
			.await
			.map_err(MemberCallError::Unreachable)?;
		let answered = member_call_answered(answered).await?;
		answered.json::<Vec<CloudRosterMember>>().await.map_err(|error| {
			MemberCallError::Unreachable(format!(
				"the roster answered by the relay did not parse: {error}"
			))
		})
	}

	pub async fn invite_member(
		&self,
		bearer: &str,
		instance_id: &str,
		email: &str,
	) -> Result<(), MemberCallError> {
		let members = self.members_url(instance_id);
		let body = json!({ "email": email });
		let answered = self
			.answered(|client| client.post(members).bearer_auth(bearer).json(&body))
			.await
			.map_err(MemberCallError::Unreachable)?;
		if answered.status() == StatusCode::BAD_REQUEST {
			return Err(MemberCallError::InvalidEmail);
		}
		member_call_answered(answered).await.map(drop)
	}

	pub async fn remove_member(
		&self,
		bearer: &str,
		instance_id: &str,
		user_id: &str,
	) -> Result<(), MemberCallError> {
		let mut member = Url::parse(&self.members_url(instance_id)).map_err(|error| {
			MemberCallError::Unreachable(format!("the member url is unusable: {error}"))
		})?;
		member
			.path_segments_mut()
			.map_err(|()| MemberCallError::Unreachable("the cloud url has no path".to_owned()))?
			.push(user_id);
		let answered = self
			.answered(|client| client.delete(member).bearer_auth(bearer))
			.await
			.map_err(MemberCallError::Unreachable)?;
		if answered.status() == StatusCode::NOT_FOUND {
			return Err(MemberCallError::UnknownMember);
		}
		member_call_answered(answered).await.map(drop)
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

	pub async fn invitations(&self, bearer: &str) -> Result<Vec<Invitation>, InvitationCallError> {
		let answered = self
			.reached(|client| client.get(self.at(INVITATIONS_PATH)).bearer_auth(bearer))
			.await?;
		let answered = invitation_call_answered(answered).await?;
		answered.json::<Vec<Invitation>>().await.map_err(|error| {
			InvitationCallError::Unreachable(format!(
				"the invitation list answered by the cloud did not parse: {error}"
			))
		})
	}

	pub async fn accept_invitation(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<JoinedInstance, InvitationCallError> {
		let accept = self.invitation_url(instance_id, "accept")?;
		let answered = self.reached(|client| client.post(accept).bearer_auth(bearer)).await?;
		let answered = invitation_call_answered(answered).await?;
		answered.json::<JoinedInstance>().await.map_err(|error| {
			InvitationCallError::Unreachable(format!(
				"the accepted instance carried no readable name: {error}"
			))
		})
	}

	pub async fn decline_invitation(
		&self,
		bearer: &str,
		instance_id: &str,
	) -> Result<(), InvitationCallError> {
		let decline = self.invitation_url(instance_id, "decline")?;
		let answered = self.reached(|client| client.post(decline).bearer_auth(bearer)).await?;
		invitation_call_answered(answered).await.map(drop)
	}

	fn invitation_url(&self, instance_id: &str, verb: &str) -> Result<Url, InvitationCallError> {
		let mut invitation = Url::parse(&self.at(INVITATIONS_PATH)).map_err(|error| {
			InvitationCallError::Unreachable(format!("the invitation url is unusable: {error}"))
		})?;
		invitation
			.path_segments_mut()
			.map_err(|()| InvitationCallError::Unreachable("the cloud url has no path".to_owned()))?
			.push(instance_id)
			.push(verb);
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
		let client = Client::builder().timeout(REQUEST_BOUND).build().map_err(|error| {
			Unanswered::Unreachable(format!("the cloud client could not be built: {error}"))
		})?;
		request(&client).send().await.map_err(|error| {
			let is_offline = error.is_connect() && !error.is_timeout();
			let reason = format!("the cloud could not be reached: {}", error.without_url());
			if is_offline {
				Unanswered::Offline(reason)
			} else {
				Unanswered::Unreachable(reason)
			}
		})
	}
}

async fn invitation_call_answered(
	answered: reqwest::Response,
) -> Result<reqwest::Response, InvitationCallError> {
	match answered.status() {
		StatusCode::UNAUTHORIZED => Err(InvitationCallError::Revoked),
		StatusCode::NOT_FOUND => Err(InvitationCallError::Unknown),
		StatusCode::GONE => Err(InvitationCallError::Withdrawn),
		StatusCode::CONFLICT => Err(already_joined(answered).await),
		_ => successful(answered).map_err(InvitationCallError::Unreachable),
	}
}

async fn already_joined(answered: reqwest::Response) -> InvitationCallError {
	match answered.json::<Refusal>().await {
		Ok(refusal) if refusal.error.code == "ALREADY_JOINED" => InvitationCallError::AlreadyJoined,
		Ok(refusal) => InvitationCallError::Unreachable(format!(
			"the cloud answered a conflict coded {}",
			refusal.error.code
		)),
		Err(error) => InvitationCallError::Unreachable(format!(
			"the cloud answered a conflict with an unreadable body: {error}"
		)),
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
	if !status.is_client_error() {
		return successful(answered).map_err(DeviceRegisterError::Unreachable);
	}
	let code = answered.json::<Refusal>().await.ok().map(|refusal| refusal.error.code);
	Err(DeviceRegisterError::Refused(DeviceRefusal { path, status, code }))
}

async fn member_call_answered(
	answered: reqwest::Response,
) -> Result<reqwest::Response, MemberCallError> {
	match answered.status() {
		StatusCode::UNAUTHORIZED => Err(MemberCallError::Revoked),
		StatusCode::FORBIDDEN => Err(MemberCallError::Forbidden),
		StatusCode::CONFLICT => Err(conflicted(answered).await),
		_ => successful(answered).map_err(MemberCallError::Unreachable),
	}
}

async fn conflicted(answered: reqwest::Response) -> MemberCallError {
	let refusal = match answered.json::<Refusal>().await {
		Ok(refusal) => refusal,
		Err(error) => {
			return MemberCallError::Unreachable(format!(
				"the cloud answered a conflict with an unreadable body: {error}"
			))
		}
	};
	match refusal.error.code.as_str() {
		"ALREADY_MEMBER" => MemberCallError::AlreadyMember,
		"MEMBER_LIMIT_REACHED" => MemberCallError::LimitReached,
		"OWNER_NOT_REMOVABLE" => MemberCallError::OwnerNotRemovable,
		code => MemberCallError::Unreachable(format!("the cloud answered a conflict coded {code}")),
	}
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
	use super::*;

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
