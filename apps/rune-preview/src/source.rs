use std::sync::Arc;

use serde::de::DeserializeOwned;
use serde_json::Value;

use crate::events::{self, HostEvent};
use crate::host::{Host, HostError, Profile};
use crate::local::LocalCore;

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

	pub fn running_profile(&self) -> Option<Profile> {
		match self {
			Source::InProcess(_) => None,
			Source::Running(host) => Some(host.profile()),
		}
	}

	pub fn listen(&self, deliver: impl Fn(HostEvent) + Send + Sync + 'static) {
		match self {
			Source::InProcess(core) => core.listen(deliver),
			Source::Running(host) => events::listen(host, deliver),
		}
	}
}
