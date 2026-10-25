use std::path::Path;

use super::contract::{
	is_a_connection_name, ConnectionKind, EnvError, EnvScope, Values, CONNECTION_NAMES,
};
use super::store;

pub fn hold(root: &Path, kind: ConnectionKind, value: &str) -> Result<(), EnvError> {
	let value = value.trim();
	if value.is_empty() {
		return Err(EnvError::EmptyValue);
	}
	store::set_one_of(root, &EnvScope::Person, &CONNECTION_NAMES, kind.name(), value)
}

pub fn clear(root: &Path) -> Result<(), EnvError> {
	store::delete_all(root, &EnvScope::Person, &CONNECTION_NAMES)
}

pub fn held(root: &Path) -> Result<Values, EnvError> {
	let values = store::values(root, &EnvScope::Person)?;
	Ok(values.into_iter().find(|(name, _)| is_a_connection_name(name)).into_iter().collect())
}

#[cfg(test)]
mod tests {

	use super::*;
	use crate::db::connection::fixture_root;
	use crate::environment::contract::{EnvOwner, API_KEY, SUBSCRIPTION_TOKEN};
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_root(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("connection-{name}"))
	}

	fn a_bot() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn holding(pairs: &[(&str, &str)]) -> Values {
		pairs.iter().map(|(name, value)| ((*name).to_owned(), (*value).to_owned())).collect()
	}

	#[test]
	fn a_stored_key_is_held_under_its_name() {
		let root = a_root("stored");

		hold(&root, ConnectionKind::ApiKey, "sk-typed").expect("the key is stored");

		assert_eq!(held(&root).expect("the store reads"), holding(&[(API_KEY, "sk-typed")]));
	}

	#[test]
	fn a_value_with_surrounding_whitespace_is_held_without_it() {
		let root = a_root("trimmed");

		hold(&root, ConnectionKind::SubscriptionToken, "  token\n").expect("the token is stored");

		assert_eq!(
			held(&root).expect("the store reads"),
			holding(&[(SUBSCRIPTION_TOKEN, "token")])
		);
	}

	#[test]
	fn a_new_source_takes_the_place_of_the_held_one() {
		let root = a_root("replaced");
		hold(&root, ConnectionKind::ApiKey, "sk-first").expect("the key is stored");

		hold(&root, ConnectionKind::SubscriptionToken, "token").expect("the token is stored");

		assert_eq!(
			held(&root).expect("the store reads"),
			holding(&[(SUBSCRIPTION_TOKEN, "token")])
		);

		hold(&root, ConnectionKind::ApiKey, "sk-second").expect("the key is stored");

		assert_eq!(held(&root).expect("the store reads"), holding(&[(API_KEY, "sk-second")]));
	}

	#[test]
	fn an_empty_or_blank_value_is_refused_and_the_held_source_stands() {
		let root = a_root("blank");
		hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is stored");

		for offered in ["", "   ", "\n\t "] {
			assert_eq!(
				hold(&root, ConnectionKind::SubscriptionToken, offered),
				Err(EnvError::EmptyValue)
			);
			assert_eq!(hold(&root, ConnectionKind::ApiKey, offered), Err(EnvError::EmptyValue));
		}

		assert_eq!(held(&root).expect("the store reads"), holding(&[(API_KEY, "sk-held")]));
	}

	#[test]
	fn clearing_removes_both_names_and_leaves_every_other_scope_untouched() {
		let root = a_root("cleared");
		let space = EnvScope::Space { id: "s1".to_owned() };
		let bot = EnvScope::from(&a_bot());
		store::set(&root, &space, "REGION", "eu").expect("the space keeps it");
		store::set(&root, &bot, "TOKEN", "bot").expect("the bot keeps it");
		hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is stored");

		clear(&root).expect("the connection is cleared");

		assert_eq!(held(&root).expect("the store reads"), Values::new());
		assert_eq!(
			store::values(&root, &space).expect("the space reads"),
			holding(&[("REGION", "eu")])
		);
		assert_eq!(
			store::values(&root, &bot).expect("the bot reads"),
			holding(&[("TOKEN", "bot")])
		);
		clear(&root).expect("clearing nothing changes nothing");
	}

	#[test]
	fn nothing_but_a_connection_name_lands_wider_than_a_space() {
		let root = a_root("person-scope");

		assert_eq!(
			store::set(&root, &EnvScope::Person, "REGION", "eu"),
			Err(EnvError::InvalidName { name: "REGION".to_owned() })
		);
		assert_eq!(
			store::set_one_of(&root, &EnvScope::Person, &CONNECTION_NAMES, "REGION", "eu"),
			Err(EnvError::InvalidName { name: "REGION".to_owned() })
		);
		assert_eq!(
			store::values(&root, &EnvScope::Person).expect("the store reads"),
			Values::new()
		);
	}

	#[test]
	fn a_held_source_stays_out_of_the_environment_resolved_for_a_companion() {
		let root = a_root("resolved");
		hold(&root, ConnectionKind::SubscriptionToken, "token").expect("the token is stored");
		let other = EnvOwner::Bot { id: "b9".to_owned(), space_id: "s9".to_owned() };

		for owner in [a_bot(), other, EnvOwner::Space { id: "s2".to_owned() }] {
			let resolved = store::resolve(&root, &owner).expect("the store reads");
			assert_eq!(resolved.base.get(SUBSCRIPTION_TOKEN), None);
			assert_eq!(resolved.base.get(API_KEY), None);
		}
	}

	#[test]
	fn a_name_a_narrower_scope_still_holds_reaches_neither_the_base_nor_an_overlay() {
		let root = a_root("legacy");
		let space = EnvScope::Space { id: "s1".to_owned() };
		let bot = EnvScope::from(&a_bot());
		let server = EnvScope::Server { name: "clock".to_owned(), owner: a_bot() };
		store::set(&root, &space, API_KEY, "from-the-space").expect("the space keeps it");
		store::set(&root, &bot, SUBSCRIPTION_TOKEN, "from-the-bot").expect("the bot keeps it");
		store::set(&root, &server, API_KEY, "from-the-server").expect("the server keeps it");
		hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is stored");

		let resolved = store::resolve(&root, &a_bot()).expect("the store reads");

		for name in CONNECTION_NAMES {
			assert_eq!(resolved.base.get(name), None, "{name} reached the base");
			assert!(
				resolved.per_server.values().all(|overlay| !overlay.contains_key(name)),
				"{name} reached an overlay"
			);
		}
		assert_eq!(held(&root).expect("the store reads"), holding(&[(API_KEY, "sk-held")]));
	}

	#[test]
	fn no_listing_at_any_scope_shows_a_connection_name() {
		let root = a_root("listed");
		hold(&root, ConnectionKind::ApiKey, "sk-held").expect("the key is stored");
		let space = EnvScope::Space { id: "s1".to_owned() };
		store::set(&root, &space, "REGION", "eu").expect("the space keeps it");
		let server = EnvScope::Server { name: "clock".to_owned(), owner: a_bot() };

		for scope in [space, EnvScope::from(&a_bot()), server, EnvScope::Person] {
			let listed = store::list(&root, &scope).expect("the chain reads");
			assert!(
				listed.iter().all(|entry| !CONNECTION_NAMES.contains(&entry.name.as_str())),
				"a connection name was listed at {scope:?}"
			);
		}
	}
}
