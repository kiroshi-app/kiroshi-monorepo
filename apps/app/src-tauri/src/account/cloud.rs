use std::time::Duration;

use chrono::{DateTime, Utc};
use reqwest::{Client, RequestBuilder, StatusCode, Url};
use serde::Deserialize;
use serde_json::{json, Value};

use super::contract::KiroshiAccount;
use crate::invitations::contract::Invitation;
use crate::missions::github::installed_tls_provider;

const API_URL_OVERRIDE: &str = "KIROSHI_API_URL";

const MAGIC_LINK_PATH: &str = "/api/auth/sign-in/magic-link";

const ME_PATH: &str = "/me";

const SIGN_OUT_PATH: &str = "/api/auth/sign-out";

const INSTANCES_PATH: &str = "/instances";

const INVITATIONS_PATH: &str = "/invitations";

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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum MagicLinkError {
	Rejected(String),
	Unreachable(String),
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RegisterError {
	Revoked,
	Unreachable(String),
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
#[serde(rename_all = "camelCase")]
struct MagicLinkSent {
	expires_at: String,
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
		let plan = me.plan.and_then(|named| serde_json::from_value(named).ok());
		Self { id: me.id, email: me.email, created_at: me.created_at, plan }
	}
}

#[derive(Debug, Clone)]
pub struct Cloud {
	base: String,
}

impl Cloud {
	pub fn new(base: &str) -> Self {
		Self { base: base.trim_end_matches('/').to_owned() }
	}

	pub async fn request_magic_link(
		&self,
		email: &str,
		callback_url: &str,
	) -> Result<DateTime<Utc>, MagicLinkError> {
		let body = json!({ "email": email, "callbackURL": callback_url });
		let answered = self
			.answered(|client| client.post(self.at(MAGIC_LINK_PATH)).json(&body))
			.await
			.map_err(MagicLinkError::Unreachable)?;
		if answered.status() == StatusCode::BAD_REQUEST {
			let refusal = answered.json::<Refusal>().await.map_err(|error| {
				MagicLinkError::Unreachable(format!(
					"the cloud refused the magic link with an unreadable answer: {error}"
				))
			})?;
			return Err(MagicLinkError::Rejected(refusal.error.code));
		}
		let answered = successful(answered).map_err(MagicLinkError::Unreachable)?;
		let unreadable = |detail: String| {
			MagicLinkError::Unreachable(format!(
				"the magic link answer carried no readable expiresAt: {detail}"
			))
		};
		let sent = answered
			.json::<MagicLinkSent>()
			.await
			.map_err(|error| unreadable(error.to_string()))?;
		DateTime::parse_from_rfc3339(&sent.expires_at)
			.map(|expires_at| expires_at.with_timezone(&Utc))
			.map_err(|error| unreadable(error.to_string()))
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

	pub async fn instances(&self, bearer: &str) -> Result<Vec<CloudInstance>, String> {
		let answered =
			self.sent(|client| client.get(self.at(INSTANCES_PATH)).bearer_auth(bearer)).await?;
		answered.json::<Vec<CloudInstance>>().await.map_err(|error| {
			format!("the instance list answered by the cloud did not parse: {error}")
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

	pub fn host_relay_url(&self, instance_id: &str) -> String {
		self.relay_url(instance_id, "host")
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
			Cloud::new("https://api.kiroshi.app/").host_relay_url("i1"),
			"wss://api.kiroshi.app/instances/i1/relay/host"
		);
		assert_eq!(
			Cloud::new("http://127.0.0.1:9").host_relay_url("i1"),
			"ws://127.0.0.1:9/instances/i1/relay/host"
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
