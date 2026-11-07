use std::future::Future;
use std::sync::Arc;

use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use super::contract::RuntimeScope;
use super::protocol::HostAnswer;
use super::session::{Answering, HostRequests};
use crate::core_context::Core;
use crate::db::DatabaseState;

const NO_DATABASE: &str = "the store this session writes to is not open";

pub trait Refusal: Serialize + Send {
	fn unreadable(detail: String) -> Self;

	fn unexpected(detail: String) -> Self;
}

pub trait Host: std::fmt::Debug + Send + Sync + 'static {
	const SUBTYPE: &'static str;

	const IS_PAYLOAD_REQUIRED: bool = false;

	type Operation: DeserializeOwned + Send;

	type Error: Refusal;

	fn served(
		&self,
		operation: Self::Operation,
		payload: Value,
	) -> impl Future<Output = Result<Value, Self::Error>> + Send;

	fn answer(&self, request: Value) -> impl Future<Output = HostAnswer> + Send {
		async move {
			let (operation, payload) = asked::<Self>(request).map_err(refused)?;
			self.served(operation, payload).await.map_err(refused)
		}
	}

	fn read<T: DeserializeOwned>(payload: Value) -> Result<T, Self::Error> {
		serde_json::from_value(payload).map_err(|error| Self::Error::unreadable(error.to_string()))
	}

	fn answered<T: Serialize>(answer: T) -> Result<Value, Self::Error> {
		serde_json::to_value(answer).map_err(|error| Self::Error::unexpected(error.to_string()))
	}

	fn database(
		core: &crate::core_context::Core,
	) -> Result<&crate::core_context::Core, Self::Error> {
		if core.try_state::<DatabaseState>().is_none() {
			return Err(Self::Error::unexpected(NO_DATABASE.to_owned()));
		}
		Ok(core)
	}
}

pub fn hosted<H: Host>(host: H) -> Arc<dyn HostRequests> {
	Arc::new(Hosted(Arc::new(host)))
}

pub trait SessionHosts: Send + Sync + 'static {
	fn hosts_for(
		&self,
		core: &Core,
		scope: &RuntimeScope,
		space_id: &str,
	) -> Vec<Arc<dyn HostRequests>>;
}

pub fn install_session_hosts(core: &Core, hosts: impl SessionHosts) -> bool {
	core.manage::<Box<dyn SessionHosts>>(Box::new(hosts))
}

pub fn session_hosts(
	core: &Core,
	scope: &RuntimeScope,
	space_id: &str,
) -> Vec<Arc<dyn HostRequests>> {
	core.try_state::<Box<dyn SessionHosts>>()
		.map_or_else(Vec::new, |hosts| hosts.hosts_for(core, scope, space_id))
}

#[derive(Debug)]
struct Hosted<H>(Arc<H>);

impl<H: Host> HostRequests for Hosted<H> {
	fn subtype(&self) -> &'static str {
		H::SUBTYPE
	}

	fn serve(&self, request: Value) -> Answering {
		let host = Arc::clone(&self.0);
		Box::pin(async move { host.answer(request).await })
	}
}

#[derive(Deserialize)]
struct Asked<O> {
	operation: O,
	#[serde(default, deserialize_with = "present")]
	payload: Option<Value>,
}

fn present<'de, D: Deserializer<'de>>(deserializer: D) -> Result<Option<Value>, D::Error> {
	Value::deserialize(deserializer).map(Some)
}

fn asked<H: Host + ?Sized>(request: Value) -> Result<(H::Operation, Value), H::Error> {
	let Asked { operation, payload } = H::read(request)?;
	match payload {
		Some(payload) => Ok((operation, payload)),
		None if H::IS_PAYLOAD_REQUIRED => {
			Err(H::Error::unreadable(serde_json::Error::missing_field("payload").to_string()))
		}
		None => Ok((operation, Value::Object(serde_json::Map::new()))),
	}
}

fn refused<E: Refusal>(error: E) -> Value {
	serde_json::to_value(&error).unwrap_or_else(
		|failure| serde_json::json!({ "kind": "unexpected", "detail": failure.to_string() }),
	)
}

#[cfg(test)]
mod tests {
	use std::sync::Mutex;

	use super::*;
	use crate::test_core::a_core_of_its_own;

	#[derive(Clone, Default)]
	struct Asked(Arc<Mutex<Vec<(String, String)>>>);

	impl SessionHosts for Asked {
		fn hosts_for(
			&self,
			_: &Core,
			scope: &RuntimeScope,
			space_id: &str,
		) -> Vec<Arc<dyn HostRequests>> {
			let asked = (scope.conversation_id.clone(), space_id.to_owned());
			self.0.lock().expect("unlocked").push(asked);
			Vec::new()
		}
	}

	fn a_scope() -> RuntimeScope {
		RuntimeScope {
			conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			runtime_session_id: "r1".to_owned(),
			epoch: 0,
		}
	}

	#[test]
	fn a_session_is_hosted_by_what_the_installed_hosts_hand_it_and_by_nothing_without_them() {
		let core = a_core_of_its_own("session-hosts");
		assert!(session_hosts(&core, &a_scope(), "personal").is_empty());
		let asked = Asked::default();
		assert!(install_session_hosts(&core, asked.clone()));

		session_hosts(&core, &a_scope(), "personal");

		assert_eq!(
			*asked.0.lock().expect("unlocked"),
			vec![("c1".to_owned(), "personal".to_owned())]
		);
	}
}
