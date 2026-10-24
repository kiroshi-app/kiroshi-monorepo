use std::collections::BTreeMap;
use std::path::Path;

use super::refusal::on_one_line;
use crate::agent::protocol::OauthCredentials;
use crate::environment::contract::{
	EnvError, EnvOwner, EnvScope, Values, OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET,
	OAUTH_EXPIRES_AT, OAUTH_REASON, OAUTH_REDIRECT_URI, OAUTH_REFRESH_TOKEN, RESERVED_NAMES,
};
use crate::environment::store;

const AN_UNREADABLE_EXPIRY_HAS_PASSED: i64 = i64::MIN;

const REDACTED: &str = "[redacted]";

const SECRET_NAMES: [&str; 3] = [OAUTH_ACCESS_TOKEN, OAUTH_REFRESH_TOKEN, OAUTH_CLIENT_SECRET];

const TOKEN_NAMES: [&str; 3] = [OAUTH_ACCESS_TOKEN, OAUTH_REFRESH_TOKEN, OAUTH_EXPIRES_AT];

pub fn expires_at(held: &Values) -> Option<i64> {
	held.get(OAUTH_EXPIRES_AT).map(|at| at.parse().unwrap_or(AN_UNREADABLE_EXPIRY_HAS_PASSED))
}

pub fn scrubbed(reason: String, held: &Values) -> String {
	SECRET_NAMES
		.iter()
		.filter_map(|name| held.get(*name))
		.filter(|secret| !secret.is_empty())
		.fold(reason, |reason, secret| reason.replace(secret.as_str(), REDACTED))
}

pub fn held(grant: &OauthCredentials) -> Values {
	RESERVED_NAMES
		.iter()
		.filter_map(|name| named(grant, name).map(|value| ((*name).to_owned(), value)))
		.collect()
}

pub struct ServedGrant {
	pub scope: EnvScope,
	pub held: Values,
}

pub type ServedGrants = BTreeMap<String, ServedGrant>;

#[derive(PartialEq, PartialOrd)]
enum Hold {
	Reserved,
	Refused,
	Granted,
}

fn hold_of(held: &Values) -> Option<Hold> {
	if held.contains_key(OAUTH_ACCESS_TOKEN) {
		return Some(Hold::Granted);
	}
	if held.contains_key(OAUTH_REASON) {
		return Some(Hold::Refused);
	}
	RESERVED_NAMES.iter().any(|reserved| held.contains_key(*reserved)).then_some(Hold::Reserved)
}

pub fn served(root: &Path, owner: &EnvOwner) -> Result<ServedGrants, EnvError> {
	let mut served = ServedGrants::new();
	for scope in store::server_scopes(root, owner)? {
		let held = store::values(root, &scope)?;
		let EnvScope::Server { name, .. } = &scope else {
			continue;
		};
		let Some(hold) = hold_of(&held) else {
			continue;
		};
		if served.get(name).and_then(|kept| hold_of(&kept.held)).is_some_and(|kept| kept > hold) {
			continue;
		}
		served.insert(name.clone(), ServedGrant { scope: scope.clone(), held });
	}
	Ok(served)
}

fn named(held: &OauthCredentials, name: &str) -> Option<String> {
	match name {
		OAUTH_ACCESS_TOKEN => Some(held.access_token.clone()),
		OAUTH_CLIENT_ID => Some(held.client_id.clone()),
		OAUTH_REFRESH_TOKEN => held.refresh_token.clone(),
		OAUTH_CLIENT_SECRET => held.client_secret.clone(),
		OAUTH_EXPIRES_AT => held.expires_at.map(|at| at.to_string()),
		OAUTH_REDIRECT_URI => held.redirect_uri.clone(),
		_ => None,
	}
}

pub fn store(root: &Path, scope: &EnvScope, held: &OauthCredentials) -> Result<(), EnvError> {
	for name in RESERVED_NAMES {
		let written = match named(held, name) {
			Some(value) => store::set(root, scope, name, &value),
			None => store::delete(root, scope, name),
		};
		if let Err(refused) = written {
			return Err(rolled_back(root, scope, refused));
		}
	}
	Ok(())
}

pub fn forget(root: &Path, scope: &EnvScope) -> Result<(), EnvError> {
	store::delete_all(root, scope, &RESERVED_NAMES)
}

pub fn forget_tokens(root: &Path, scope: &EnvScope) -> Result<(), EnvError> {
	store::delete_all(root, scope, &TOKEN_NAMES)
}

pub fn remember_refusal(root: &Path, scope: &EnvScope, reason: &str) -> Result<(), EnvError> {
	store::set(root, scope, OAUTH_REASON, &on_one_line(reason))
}

fn rolled_back(root: &Path, scope: &EnvScope, refused: EnvError) -> EnvError {
	match forget(root, scope) {
		Ok(()) => refused,
		Err(also) => EnvError::Unwritable {
			detail: format!("{refused:?}, and the partial write could not be undone: {also:?}"),
		},
	}
}

#[cfg(test)]
mod tests {

	use super::*;
	use crate::environment::contract::EnvOwner;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_root(name: &str) -> RemovedOnDrop {
		crate::db::connection::fixture_root(&format!("mcp-oauth-{name}"))
	}

	fn a_server() -> EnvScope {
		EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		}
	}

	const REGISTERED_REDIRECT: &str = "http://127.0.0.1:53682/oauth/callback";

	fn a_full_grant() -> OauthCredentials {
		OauthCredentials {
			access_token: "granted".to_owned(),
			refresh_token: Some("renewable".to_owned()),
			expires_at: Some(1_700_000_000_000),
			client_id: "registered".to_owned(),
			client_secret: Some("confidential".to_owned()),
			redirect_uri: Some(REGISTERED_REDIRECT.to_owned()),
		}
	}

	fn a_bare_grant() -> OauthCredentials {
		OauthCredentials {
			access_token: "granted-again".to_owned(),
			refresh_token: None,
			expires_at: None,
			client_id: "registered-again".to_owned(),
			client_secret: None,
			redirect_uri: None,
		}
	}

	#[test]
	fn the_six_names_of_a_full_grant_land_at_server_scope() {
		let root = a_root("six-names");
		let scope = a_server();

		store(&root, &scope, &a_full_grant()).expect("the grant is written");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("granted"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN).map(String::as_str), Some("renewable"));
		assert_eq!(kept.get(OAUTH_EXPIRES_AT).map(String::as_str), Some("1700000000000"));
		assert_eq!(kept.get(OAUTH_CLIENT_ID).map(String::as_str), Some("registered"));
		assert_eq!(kept.get(OAUTH_CLIENT_SECRET).map(String::as_str), Some("confidential"));
		assert_eq!(kept.get(OAUTH_REDIRECT_URI).map(String::as_str), Some(REGISTERED_REDIRECT));
		assert_eq!(kept.len(), 6);
	}

	#[test]
	fn a_stored_grant_takes_the_stored_reason_away() {
		let root = a_root("grant-clears-reason");
		let scope = a_server();
		remember_refusal(&root, &scope, "refused").expect("the reason is written");

		store(&root, &scope, &a_bare_grant()).expect("the grant is written");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(kept.get(OAUTH_REASON), None);
	}

	#[test]
	fn forgetting_the_tokens_keeps_the_client() {
		let root = a_root("forget-tokens");
		let scope = a_server();
		store(&root, &scope, &a_full_grant()).expect("the grant is written");

		forget_tokens(&root, &scope).expect("the tokens are deleted");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(
			kept.keys().map(String::as_str).collect::<Vec<_>>(),
			vec![OAUTH_CLIENT_ID, OAUTH_CLIENT_SECRET, OAUTH_REDIRECT_URI]
		);
	}

	fn a_bot() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn the_space_server() -> EnvScope {
		EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		}
	}

	fn refused_at(root: &Path, scope: &EnvScope) {
		store(root, scope, &a_full_grant()).expect("the grant is written");
		forget_tokens(root, scope).expect("the tokens are deleted");
		remember_refusal(root, scope, "invalid_grant").expect("the reason is written");
	}

	fn served_scope(root: &Path) -> Option<EnvScope> {
		served(root, &a_bot())
			.expect("the grants are readable")
			.remove("granola")
			.map(|grant| grant.scope)
	}

	#[test]
	fn a_broader_access_token_is_served_over_a_narrower_refusal() {
		let root = a_root("served-token-over-reason");
		store(&root, &the_space_server(), &a_bare_grant()).expect("the space grant is written");
		refused_at(&root, &a_server());

		assert_eq!(served_scope(&root), Some(the_space_server()));
	}

	#[test]
	fn with_no_access_token_the_narrowest_refusal_is_served() {
		let root = a_root("served-narrowest-reason");
		refused_at(&root, &the_space_server());
		refused_at(&root, &a_server());

		assert_eq!(served_scope(&root), Some(a_server()));
	}

	#[test]
	fn a_refusal_is_served_over_a_narrower_client_alone() {
		let root = a_root("served-reason-over-client");
		refused_at(&root, &the_space_server());
		store(&root, &a_server(), &a_full_grant()).expect("the grant is written");
		forget_tokens(&root, &a_server()).expect("the tokens are deleted");

		assert_eq!(served_scope(&root), Some(the_space_server()));
	}

	#[test]
	fn a_reason_is_stored_on_one_line_and_listed_nowhere() {
		let root = a_root("reason-listing");
		let scope = a_server();

		remember_refusal(&root, &scope, "the grant\nwas   refused").expect("the reason is written");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(kept.get(OAUTH_REASON).map(String::as_str), Some("the grant was refused"));
		assert!(store::list(&root, &scope).expect("the scope lists").is_empty());
	}

	#[test]
	fn a_grant_naming_no_expiry_writes_no_expiry() {
		let root = a_root("no-expiry");
		let scope = a_server();

		store(&root, &scope, &a_bare_grant()).expect("the grant is written");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(
			kept.keys().map(String::as_str).collect::<Vec<_>>(),
			vec![OAUTH_ACCESS_TOKEN, OAUTH_CLIENT_ID]
		);
	}

	#[test]
	fn a_second_grant_leaves_no_value_of_the_first_behind() {
		let root = a_root("second-grant");
		let scope = a_server();
		store(&root, &scope, &a_full_grant()).expect("the first grant is written");

		store(&root, &scope, &a_bare_grant()).expect("the second grant is written");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(kept.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("granted-again"));
		assert_eq!(kept.get(OAUTH_CLIENT_ID).map(String::as_str), Some("registered-again"));
		assert_eq!(kept.get(OAUTH_REFRESH_TOKEN), None);
		assert_eq!(kept.get(OAUTH_EXPIRES_AT), None);
		assert_eq!(kept.get(OAUTH_CLIENT_SECRET), None);
		assert_eq!(kept.get(OAUTH_REDIRECT_URI), None);
	}

	#[test]
	fn forgetting_takes_every_reserved_name_away_and_leaves_the_rest() {
		let root = a_root("forget");
		let scope = a_server();
		store::set(&root, &scope, "GRANOLA_REGION", "eu").expect("the name is written");
		store(&root, &scope, &a_full_grant()).expect("the grant is written");

		forget(&root, &scope).expect("the reserved names are deleted");

		let kept = store::values(&root, &scope).expect("the scope is readable");
		assert_eq!(kept.get("GRANOLA_REGION").map(String::as_str), Some("eu"));
		assert!(RESERVED_NAMES.iter().all(|name| !kept.contains_key(*name)));
	}

	#[test]
	fn the_bot_grant_is_the_one_served_when_the_space_holds_one_too() {
		let root = a_root("served");
		let bot = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let space = EnvScope::Server {
			name: "granola".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		};
		store(&root, &space, &a_bare_grant()).expect("the space grant is written");
		store(&root, &a_server(), &a_full_grant()).expect("the bot grant is written");

		let served = served(&root, &bot).expect("the grants are readable");

		let grant = served.get("granola").expect("granola is served a grant");
		assert_eq!(grant.scope, a_server());
		assert_eq!(grant.held.get(OAUTH_ACCESS_TOKEN).map(String::as_str), Some("granted"));
		assert_eq!(
			store::resolve(&root, &bot).expect("the env resolves").per_server["granola"]
				[OAUTH_ACCESS_TOKEN],
			"granted"
		);
	}

	#[test]
	fn forgetting_a_scope_that_never_held_a_grant_is_no_error() {
		let root = a_root("forget-empty");

		forget(&root, &a_server()).expect("nothing to delete is not a failure");
	}

	#[test]
	fn a_listing_of_a_server_scope_names_none_of_the_six() {
		let root = a_root("listing");
		let scope = a_server();
		store::set(&root, &scope, "GRANOLA_REGION", "eu").expect("the name is written");
		store(&root, &scope, &a_full_grant()).expect("the grant is written");

		let listed = store::list(&root, &scope).expect("the scope lists");

		assert_eq!(
			listed.iter().map(|entry| entry.name.as_str()).collect::<Vec<_>>(),
			vec!["GRANOLA_REGION"]
		);
	}
}
