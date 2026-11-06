use std::any::{type_name, Any, TypeId};
use std::collections::HashMap;
use std::fmt;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock};

use serde::Serialize;
use serde_json::value::RawValue;
use tokio::sync::broadcast;

use crate::events::{Event, Frame, BUFFERED_FRAMES};

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct ClientId(String);

impl ClientId {
	pub fn new(id: impl Into<String>) -> Self {
		Self(id.into())
	}

	pub fn as_str(&self) -> &str {
		&self.0
	}
}

impl fmt::Display for ClientId {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.write_str(&self.0)
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Audience {
	Everyone,
	Client(ClientId),
	LocalClients,
}

#[derive(Clone, Debug)]
pub struct CoreEvent {
	pub name: &'static str,
	pub payload: Box<RawValue>,
	pub audience: Audience,
}

#[derive(Debug)]
pub enum EmitError {
	Unserializable { event: &'static str, cause: serde_json::Error },
	Undelivered { event: &'static str, cause: String },
}

impl fmt::Display for EmitError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::Unserializable { event, cause } => {
				write!(formatter, "the event {event} did not serialize: {cause}")
			}
			Self::Undelivered { event, cause } => {
				write!(formatter, "the event {event} was not delivered: {cause}")
			}
		}
	}
}

impl std::error::Error for EmitError {}

type Listener = Box<dyn Fn(&CoreEvent) -> Result<(), String> + Send + Sync>;

type Registry = HashMap<TypeId, Arc<dyn Any + Send + Sync>>;

struct Inner {
	data_dir: PathBuf,
	registry: RwLock<Registry>,
	frames: broadcast::Sender<Frame>,
	events: broadcast::Sender<CoreEvent>,
	listeners: RwLock<Vec<Listener>>,
}

#[derive(Clone)]
pub struct Core(Arc<Inner>);

pub struct Managed<T>(Arc<T>);

impl<T> Managed<T> {
	pub fn inner(&self) -> &T {
		&self.0
	}
}

impl<T> Deref for Managed<T> {
	type Target = T;

	fn deref(&self) -> &T {
		&self.0
	}
}

impl<T> Clone for Managed<T> {
	fn clone(&self) -> Self {
		Self(self.0.clone())
	}
}

impl Core {
	pub fn new(data_dir: impl Into<PathBuf>) -> Self {
		Self(Arc::new(Inner {
			data_dir: data_dir.into(),
			registry: RwLock::default(),
			frames: broadcast::channel(BUFFERED_FRAMES).0,
			events: broadcast::channel(BUFFERED_FRAMES).0,
			listeners: RwLock::default(),
		}))
	}

	pub fn data_dir(&self) -> &Path {
		&self.0.data_dir
	}

	pub fn manage<T: Send + Sync + 'static>(&self, value: T) -> bool {
		let mut registry = self.0.registry.write().unwrap_or_else(PoisonError::into_inner);
		if registry.contains_key(&TypeId::of::<T>()) {
			return false;
		}
		registry.insert(TypeId::of::<T>(), Arc::new(value));
		true
	}

	pub fn try_state<T: Send + Sync + 'static>(&self) -> Option<Managed<T>> {
		let registry = self.0.registry.read().unwrap_or_else(PoisonError::into_inner);
		let held = registry.get(&TypeId::of::<T>())?.clone();
		held.downcast::<T>().ok().map(Managed)
	}

	pub fn state<T: Send + Sync + 'static>(&self) -> Managed<T> {
		self.try_state().unwrap_or_else(|| {
			panic!("the core holds no {}: manage it before reading it", type_name::<T>())
		})
	}

	pub fn listen(
		&self,
		listener: impl Fn(&CoreEvent) -> Result<(), String> + Send + Sync + 'static,
	) {
		self.0.listeners.write().unwrap_or_else(PoisonError::into_inner).push(Box::new(listener));
	}

	pub fn subscribe(&self) -> broadcast::Receiver<CoreEvent> {
		self.0.events.subscribe()
	}

	pub fn subscribe_frames(&self) -> broadcast::Receiver<Frame> {
		self.0.frames.subscribe()
	}

	pub fn emit<P: Serialize>(&self, event: Event<P>, payload: P) -> Result<(), EmitError> {
		self.deliver(event, &payload, Audience::Everyone)
	}

	pub fn emit_to<P: Serialize>(
		&self,
		client: &ClientId,
		event: Event<P>,
		payload: P,
	) -> Result<(), EmitError> {
		self.deliver(event, &payload, Audience::Client(client.clone()))
	}

	pub fn emit_locally<P: Serialize>(&self, event: Event<P>, payload: P) -> Result<(), EmitError> {
		self.deliver(event, &payload, Audience::LocalClients)
	}

	fn deliver<P: Serialize>(
		&self,
		event: Event<P>,
		payload: &P,
		audience: Audience,
	) -> Result<(), EmitError> {
		let name = event.name();
		let payload = serde_json::value::to_raw_value(payload)
			.map_err(|cause| EmitError::Unserializable { event: name, cause })?;
		if audience != Audience::LocalClients {
			self.relay(name, &payload);
		}
		let core_event = CoreEvent { name, payload, audience };
		let failures: Vec<String> = self
			.0
			.listeners
			.read()
			.unwrap_or_else(PoisonError::into_inner)
			.iter()
			.filter_map(|listener| listener(&core_event).err())
			.collect();
		if self.0.events.receiver_count() > 0 && self.0.events.send(core_event).is_err() {
			eprintln!("the event {name} found no subscriber left to reach");
		}
		match failures.is_empty() {
			true => Ok(()),
			false => Err(EmitError::Undelivered { event: name, cause: failures.join("; ") }),
		}
	}

	fn relay(&self, name: &'static str, payload: &RawValue) {
		if self.0.frames.receiver_count() == 0 {
			return;
		}
		match crate::events::framed(name, payload) {
			Ok(frame) => {
				if self.0.frames.send(frame).is_err() {
					eprintln!("the event {name} found no host api client left to reach");
				}
			}
			Err(failure) => {
				eprintln!("the event {name} did not serialize for the host api: {failure}")
			}
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::events::FIRST_RUN_DONE;

	#[test]
	fn an_emitted_event_reaches_a_subscriber_without_a_tauri_runtime() {
		let core = Core::new(std::env::temp_dir());
		let mut heard = core.subscribe();

		core.emit(FIRST_RUN_DONE, ()).expect("emitted");

		let event = heard.try_recv().expect("the subscriber heard");
		assert_eq!(
			(event.name, event.payload.get(), event.audience),
			(FIRST_RUN_DONE.name(), "null", Audience::Everyone)
		);
	}

	#[test]
	fn an_event_for_one_client_names_it_and_a_local_event_skips_the_host_api() {
		let core = Core::new(std::env::temp_dir());
		let mut heard = core.subscribe();
		let mut frames = core.subscribe_frames();
		let client = ClientId::new("main");

		core.emit_to(&client, FIRST_RUN_DONE, ()).expect("emitted");
		core.emit_locally(FIRST_RUN_DONE, ()).expect("emitted");

		assert_eq!(heard.try_recv().expect("heard").audience, Audience::Client(client));
		assert_eq!(heard.try_recv().expect("heard").audience, Audience::LocalClients);
		assert!(frames.try_recv().is_ok());
		assert!(frames.try_recv().is_err());
	}

	#[test]
	fn a_failing_listener_fails_the_emit_and_the_others_still_hear() {
		let core = Core::new(std::env::temp_dir());
		let (told, hearing) = std::sync::mpsc::channel();
		core.listen(|_| Err("the window is gone".into()));
		core.listen(move |event| told.send(event.name).map_err(|failure| failure.to_string()));

		assert!(core.emit(FIRST_RUN_DONE, ()).is_err());
		assert_eq!(hearing.try_recv(), Ok(FIRST_RUN_DONE.name()));
	}

	#[test]
	fn managed_state_is_found_by_its_type_and_managed_once() {
		let core = Core::new(std::env::temp_dir());
		assert!(core.try_state::<u32>().is_none());
		assert!(core.manage(7_u32));
		assert!(!core.manage(8_u32));
		assert_eq!(*core.state::<u32>(), 7);
	}
}
