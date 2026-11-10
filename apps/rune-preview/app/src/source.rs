use std::cell::Cell;
use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::sync::{Arc, LazyLock, Mutex, PoisonError};

use kiroshi_core::joined_spaces::contract::JoinedSpaceConnection;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use crate::events::{self, HostEvent, JoinedHeard};
use crate::host::{Access, Host, HostError, JOINED_SPACE_CONNECT, Profile};
use crate::local::LocalCore;

#[cfg(test)]
mod tests;

const JOINED_SPACE_REMOVE: &str = "joined_space_remove";

static JOINED_SOURCES: LazyLock<JoinedSources> = LazyLock::new(JoinedSources::default);

#[derive(Clone)]
pub enum Source {
	InProcess(Arc<LocalCore>),
	Running(Host),
}

impl Source {
	pub fn invoke<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		match self {
			Source::InProcess(core) => core.invoke(command, arguments),
			Source::Running(host) => host.invoke(command, arguments),
		}
	}

	pub fn invoke_turn<T: DeserializeOwned>(
		&self,
		command: &str,
		arguments: Value,
	) -> Result<T, HostError> {
		match self {
			Source::InProcess(core) => core.invoke(command, arguments),
			Source::Running(host) => host.invoke_turn(command, arguments),
		}
	}

	pub fn access(&self) -> Option<Access> {
		match self {
			Source::InProcess(_) => None,
			Source::Running(host) => Some(host.access()),
		}
	}

	pub fn running_profile(&self) -> Option<Profile> {
		match self {
			Source::InProcess(_) => None,
			Source::Running(host) => host.profile(),
		}
	}

	pub fn listen(&self, deliver: impl Fn(HostEvent) + Send + Sync + 'static) {
		match self {
			Source::InProcess(core) => core.listen(deliver),
			Source::Running(host) => match host.joined_space() {
				Some(joined) => deliver(HostEvent::Lost(format!(
					"joined Space {} streams its events through joined_sources().hear",
					joined.id()
				))),
				None => events::listen(host, deliver),
			},
		}
	}

	pub fn of_space(&self, space_id: &str) -> Source {
		JOINED_SOURCES.source_of(self, space_id)
	}
}

pub struct JoinedEvent {
	pub space_id: String,
	pub heard: JoinedHeard,
}

type Hearer = Arc<dyn Fn(JoinedEvent) + Send + Sync>;

struct Registered {
	host: Host,
	_stream: Option<Sender<()>>,
}

#[derive(Default)]
pub struct JoinedSources {
	spaces: Mutex<HashMap<String, Registered>>,
	hearer: Arc<Mutex<Option<Hearer>>>,
}

pub fn joined_sources() -> &'static JoinedSources {
	&JOINED_SOURCES
}

impl JoinedSources {
	pub fn hear(&self, deliver: impl Fn(JoinedEvent) + Send + Sync + 'static) {
		*self.hearer.lock().unwrap_or_else(PoisonError::into_inner) = Some(Arc::new(deliver));
	}

	pub fn source_of(&self, local: &Source, space_id: &str) -> Source {
		let spaces = self.spaces.lock().unwrap_or_else(PoisonError::into_inner);
		spaces
			.get(space_id)
			.map_or_else(|| local.clone(), |registered| Source::Running(registered.host.clone()))
	}

	pub fn connect(
		&self,
		local: &Source,
		joined_id: &str,
	) -> Result<JoinedSpaceConnection, HostError> {
		let connection: JoinedSpaceConnection =
			local.invoke(JOINED_SPACE_CONNECT, json!({ "id": joined_id }))?;
		self.register(local, connection.clone());
		Ok(connection)
	}

	pub fn leave(&self, local: &Source, joined_id: &str) -> Result<(), HostError> {
		local.invoke::<()>(JOINED_SPACE_REMOVE, json!({ "id": joined_id }))?;
		self.spaces.lock().unwrap_or_else(PoisonError::into_inner).remove(joined_id);
		Ok(())
	}

	fn register(&self, local: &Source, connection: JoinedSpaceConnection) {
		let space_id = connection.id.clone();
		let host = Host::joined(local, connection);
		let mut spaces = self.spaces.lock().unwrap_or_else(PoisonError::into_inner);
		spaces.remove(&space_id);
		let stream = host
			.joined_space()
			.and_then(|joined| events::listen_joined(joined, self.delivered_as(&space_id)));
		spaces.insert(space_id, Registered { host, _stream: stream });
	}

	fn delivered_as(&self, space_id: &str) -> impl Fn(JoinedHeard) + Send + 'static {
		let (space_id, hearer) = (space_id.to_owned(), Arc::clone(&self.hearer));
		let has_warned = Cell::new(false);
		move |heard| {
			let held = hearer.lock().unwrap_or_else(PoisonError::into_inner).clone();
			match held {
				Some(hear) => hear(JoinedEvent { space_id: space_id.clone(), heard }),
				None if !has_warned.replace(true) => {
					eprintln!("no one hears the events of joined Space {space_id} yet");
				}
				None => {}
			}
		}
	}
}
