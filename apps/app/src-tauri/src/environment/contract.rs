use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

pub type Values = BTreeMap<String, String>;
pub type PerServer = BTreeMap<String, Values>;

pub const OAUTH_ACCESS_TOKEN: &str = "KIROSHI_OAUTH_ACCESS_TOKEN";
pub const OAUTH_REFRESH_TOKEN: &str = "KIROSHI_OAUTH_REFRESH_TOKEN";
pub const OAUTH_EXPIRES_AT: &str = "KIROSHI_OAUTH_EXPIRES_AT";
pub const OAUTH_CLIENT_ID: &str = "KIROSHI_OAUTH_CLIENT_ID";
pub const OAUTH_CLIENT_SECRET: &str = "KIROSHI_OAUTH_CLIENT_SECRET";
pub const OAUTH_REASON: &str = "KIROSHI_OAUTH_REASON";
pub const OAUTH_REDIRECT_URI: &str = "KIROSHI_OAUTH_REDIRECT_URI";

pub const RESERVED_NAMES: [&str; 7] = [
	OAUTH_ACCESS_TOKEN,
	OAUTH_REFRESH_TOKEN,
	OAUTH_EXPIRES_AT,
	OAUTH_CLIENT_ID,
	OAUTH_CLIENT_SECRET,
	OAUTH_REASON,
	OAUTH_REDIRECT_URI,
];

pub const API_KEY: &str = "ANTHROPIC_API_KEY";
pub const SUBSCRIPTION_TOKEN: &str = "CLAUDE_CODE_OAUTH_TOKEN";

pub const CONNECTION_NAMES: [&str; 2] = [API_KEY, SUBSCRIPTION_TOKEN];

pub const ACCOUNT_BEARER: &str = "KIROSHI_ACCOUNT_BEARER";

pub fn is_reserved(name: &str) -> bool {
	RESERVED_NAMES.contains(&name) || is_a_connection_name(name)
}

pub fn is_a_connection_name(name: &str) -> bool {
	CONNECTION_NAMES.contains(&name)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum ConnectionKind {
	ApiKey,
	SubscriptionToken,
}

impl ConnectionKind {
	pub fn name(self) -> &'static str {
		match self {
			ConnectionKind::ApiKey => API_KEY,
			ConnectionKind::SubscriptionToken => SUBSCRIPTION_TOKEN,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvOwner {
	User,
	#[serde(rename_all = "camelCase")]
	Space {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	Bot {
		id: String,
		space_id: String,
	},
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvScope {
	User,
	#[serde(rename_all = "camelCase")]
	Space {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	Bot {
		id: String,
		space_id: String,
	},
	#[serde(rename_all = "camelCase")]
	Server {
		name: String,
		owner: EnvOwner,
	},
	#[serde(skip_deserializing)]
	Person,
	#[serde(skip_deserializing)]
	Account,
}

impl EnvScope {
	pub fn is_personal(&self) -> bool {
		matches!(
			self,
			EnvScope::User
				| EnvScope::Person
				| EnvScope::Account
				| EnvScope::Server { owner: EnvOwner::User, .. }
		)
	}
}

impl From<&EnvOwner> for EnvScope {
	fn from(owner: &EnvOwner) -> Self {
		match owner {
			EnvOwner::User => EnvScope::User,
			EnvOwner::Space { id } => EnvScope::Space { id: id.clone() },
			EnvOwner::Bot { id, space_id } => {
				EnvScope::Bot { id: id.clone(), space_id: space_id.clone() }
			}
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct EnvEntry {
	pub name: String,
	pub defined_in: EnvScope,
	pub served_from: EnvScope,
	#[serde(default, skip_serializing_if = "std::ops::Not::not")]
	pub is_unset: bool,
}

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedEnv {
	pub base: Values,
	pub per_server: PerServer,
	#[serde(skip_serializing_if = "BTreeSet::is_empty")]
	pub needs_authorization: BTreeSet<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	pub failure: Option<String>,
}

impl ResolvedEnv {
	pub fn failed(detail: impl Into<String>) -> Self {
		Self { failure: Some(detail.into()), ..Self::default() }
	}

	pub fn is_untouched(&self) -> bool {
		self.base.is_empty()
			&& self.per_server.is_empty()
			&& self.needs_authorization.is_empty()
			&& self.failure.is_none()
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnvError {
	#[serde(rename_all = "camelCase")]
	InvalidName {
		name: String,
	},
	#[serde(rename_all = "camelCase")]
	InvalidScope {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unreadable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unwritable {
		detail: String,
	},
	EmptyValue,
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json, to_value};

	use super::*;

	#[test]
	fn a_scope_of_the_host_person_is_personal_and_one_of_a_space_or_a_bot_is_not() {
		let bot = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let space = EnvOwner::Space { id: "s1".to_owned() };
		let server_of = |owner: &EnvOwner| EnvScope::Server {
			name: "granola".to_owned(),
			owner: owner.clone(),
		};
		let personal =
			[EnvScope::User, EnvScope::Person, EnvScope::Account, server_of(&EnvOwner::User)];
		let shared =
			[EnvScope::from(&space), EnvScope::from(&bot), server_of(&space), server_of(&bot)];

		assert!(personal.iter().all(EnvScope::is_personal), "{personal:?}");
		assert!(!shared.iter().any(EnvScope::is_personal), "{shared:?}");
	}

	#[test]
	fn a_server_scope_crosses_to_the_front_carrying_its_owner() {
		assert_eq!(
			to_value(EnvScope::Server {
				name: "clock".to_owned(),
				owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
			})
			.expect("the scope serializes"),
			json!({
				"kind": "server",
				"name": "clock",
				"owner": { "kind": "bot", "id": "b1", "spaceId": "s1" }
			})
		);
	}

	#[test]
	fn a_scope_crosses_back_from_the_front_under_the_names_it_reads() {
		assert_eq!(
			from_value::<EnvScope>(json!({ "kind": "bot", "id": "b1", "spaceId": "s1" }))
				.expect("the scope deserializes"),
			EnvScope::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
		);
		assert_eq!(
			from_value::<EnvScope>(json!({ "kind": "space", "id": "s1" }))
				.expect("the scope deserializes"),
			EnvScope::Space { id: "s1".to_owned() }
		);
	}

	#[test]
	fn every_name_a_grant_writes_is_reserved_and_opens_with_the_one_prefix() {
		assert_eq!(RESERVED_NAMES.len(), 7);
		assert!(RESERVED_NAMES.iter().all(|name| name.starts_with("KIROSHI_OAUTH_")));
		assert!(RESERVED_NAMES.iter().all(|name| is_reserved(name)));
		assert!(!is_reserved("KIROSHI_OAUTH"));
		assert!(!is_reserved("GRANOLA_REGION"));
	}

	#[test]
	fn both_connection_names_are_reserved_and_a_kind_serializes_in_camel_case() {
		assert!(CONNECTION_NAMES.iter().all(|name| is_reserved(name)));
		assert_eq!(
			to_value(ConnectionKind::SubscriptionToken).expect("the kind serializes"),
			json!("subscriptionToken")
		);
	}

	#[test]
	fn the_scope_wider_than_every_space_cannot_be_named_by_the_front() {
		assert!(from_value::<EnvScope>(json!({ "kind": "person" })).is_err());
	}

	#[test]
	fn the_scope_holding_the_account_bearer_cannot_be_named_by_the_front() {
		assert!(from_value::<EnvScope>(json!({ "kind": "account" })).is_err());
	}

	#[test]
	fn an_empty_value_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(EnvError::EmptyValue).expect("the error"),
			json!({ "kind": "emptyValue" })
		);
	}

	#[test]
	fn a_refused_name_crosses_as_its_own_kind() {
		assert_eq!(
			to_value(EnvError::InvalidName { name: "lower".to_owned() }).expect("the error"),
			json!({ "kind": "invalidName", "name": "lower" })
		);
	}

	#[test]
	fn an_entry_names_where_it_is_defined_and_what_serves_it() {
		assert_eq!(
			to_value(EnvEntry {
				name: "TOKEN".to_owned(),
				defined_in: EnvScope::Space { id: "s1".to_owned() },
				served_from: EnvScope::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
				is_unset: false,
			})
			.expect("the entry serializes"),
			json!({
				"name": "TOKEN",
				"definedIn": { "kind": "space", "id": "s1" },
				"servedFrom": { "kind": "bot", "id": "b1", "spaceId": "s1" }
			})
		);
	}

	#[test]
	fn an_entry_declared_without_a_value_crosses_marked_unset() {
		let space = EnvScope::Space { id: "s1".to_owned() };
		assert_eq!(
			to_value(EnvEntry {
				name: "TOKEN".to_owned(),
				defined_in: space.clone(),
				served_from: space,
				is_unset: true,
			})
			.expect("the entry serializes"),
			json!({
				"name": "TOKEN",
				"definedIn": { "kind": "space", "id": "s1" },
				"servedFrom": { "kind": "space", "id": "s1" },
				"isUnset": true
			})
		);
	}
}
