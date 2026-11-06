use std::future::Future;
use std::sync::Arc;

use serde::de::{DeserializeOwned, Error as _};
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

use super::protocol::HostAnswer;
use super::session::{Answering, HostRequests};
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
