use std::any::{type_name, Any, TypeId};
use std::collections::HashMap;
use std::fmt;
use std::future::Future;
use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Arc, PoisonError, RwLock};

use serde::Serialize;
use serde_json::value::RawValue;
use tokio::runtime::Handle;
use tokio::sync::broadcast;
use tokio::task::JoinHandle;

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

pub trait Desktop: Send + Sync + 'static {
	fn open_url(&self, url: &str) -> Result<(), String>;

	fn raise_main_window(&self);

	fn open_render_window(&self, window: &RenderWindow) -> Result<(), String>;

	fn close_window(&self, label: &str) -> Result<(), String>;
}

#[derive(Debug, Clone, PartialEq)]
pub struct RenderWindow {
	pub label: String,
	pub route: String,
	pub width: f64,
	pub height: f64,
}

#[derive(Debug, PartialEq, Eq)]
pub enum RenderWindowError {
	NoDesktop,
	Refused(String),
}

impl fmt::Display for RenderWindowError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::NoDesktop => {
				formatter.write_str("no desktop is installed to open a render window")
			}
			Self::Refused(cause) => {
				write!(formatter, "the desktop did not open the render window: {cause}")
			}
		}
	}
}

impl std::error::Error for RenderWindowError {}

#[derive(Debug, PartialEq, Eq)]
pub enum OpenUrlError {
	NoDesktop,
	Refused(String),
}

impl fmt::Display for OpenUrlError {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			Self::NoDesktop => formatter.write_str("no desktop is installed to open a link"),
			Self::Refused(cause) => write!(formatter, "the desktop did not open the link: {cause}"),
		}
	}
}

impl std::error::Error for OpenUrlError {}

pub trait ClientScoped: Send + Sync + 'static {
	fn forget_client(&self, core: &Core, client: &ClientId);
}

type Listener = Box<dyn Fn(&CoreEvent) -> Result<(), String> + Send + Sync>;

type Forgetter = fn(&Core, &ClientId);

type Registry = HashMap<TypeId, Arc<dyn Any + Send + Sync>>;

struct Inner {
	data_dir: PathBuf,
	identifier: String,
	runtime: Handle,
	registry: RwLock<Registry>,
	frames: broadcast::Sender<Frame>,
	events: broadcast::Sender<CoreEvent>,
	listeners: RwLock<Vec<Listener>>,
	forgetters: RwLock<Vec<Forgetter>>,
}

pub const UNMANAGED: &str = "the core holds no ";

pub fn unmanaged_state(panic: &(dyn Any + Send)) -> Option<&str> {
	let told = panic
		.downcast_ref::<String>()
		.map(String::as_str)
		.or_else(|| panic.downcast_ref::<&str>().copied())?;
	told.strip_prefix(UNMANAGED)?.split_once(':').map(|(state, _)| state)
}

#[derive(Clone)]
pub struct Core(Arc<Inner>);

impl fmt::Debug for Core {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter
			.debug_struct("Core")
			.field("identifier", &self.0.identifier)
			.finish_non_exhaustive()
	}
}

pub struct Managed<'a, T>(&'a T);

impl<'a, T> Managed<'a, T> {
	pub fn inner(&self) -> &'a T {
		self.0
	}
}

impl<T> Deref for Managed<'_, T> {
	type Target = T;

	fn deref(&self) -> &T {
		self.0
	}
}

impl<T> Clone for Managed<'_, T> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<T> Copy for Managed<'_, T> {}

impl Core {
	pub fn new(
		data_dir: impl Into<PathBuf>,
		identifier: impl Into<String>,
		runtime: Handle,
	) -> Self {
		Self(Arc::new(Inner {
			data_dir: data_dir.into(),
			identifier: identifier.into(),
			runtime,
			registry: RwLock::default(),
			frames: broadcast::channel(BUFFERED_FRAMES).0,
			events: broadcast::channel(BUFFERED_FRAMES).0,
			listeners: RwLock::default(),
			forgetters: RwLock::default(),
		}))
	}

	pub fn data_dir(&self) -> &Path {
		&self.0.data_dir
	}

	pub fn identifier(&self) -> &str {
		&self.0.identifier
	}

	pub fn spawn<F>(&self, future: F) -> JoinHandle<F::Output>
	where
		F: Future + Send + 'static,
		F::Output: Send + 'static,
	{
		self.0.runtime.spawn(future)
	}

	pub fn spawn_blocking<F, T>(&self, work: F) -> JoinHandle<T>
	where
		F: FnOnce() -> T + Send + 'static,
		T: Send + 'static,
	{
		self.0.runtime.spawn_blocking(work)
	}

	pub fn install_desktop(&self, desktop: impl Desktop) -> bool {
		self.manage::<Box<dyn Desktop>>(Box::new(desktop))
	}

	pub fn open_url(&self, url: &str) -> Result<(), OpenUrlError> {
		let desktop = self.try_state::<Box<dyn Desktop>>().ok_or(OpenUrlError::NoDesktop)?;
		desktop.open_url(url).map_err(OpenUrlError::Refused)
	}

	pub fn raise_main_window(&self) {
		if let Some(desktop) = self.try_state::<Box<dyn Desktop>>() {
			desktop.raise_main_window();
		}
	}

	pub fn open_render_window(&self, window: &RenderWindow) -> Result<(), RenderWindowError> {
		let desktop = self.try_state::<Box<dyn Desktop>>().ok_or(RenderWindowError::NoDesktop)?;
		desktop.open_render_window(window).map_err(RenderWindowError::Refused)
	}

	pub fn close_window(&self, label: &str) -> Result<(), String> {
		match self.try_state::<Box<dyn Desktop>>() {
			Some(desktop) => desktop.close_window(label),
			None => Ok(()),
		}
	}

	pub fn manage<T: Send + Sync + 'static>(&self, value: T) -> bool {
		let mut registry = self.0.registry.write().unwrap_or_else(PoisonError::into_inner);
		if registry.contains_key(&TypeId::of::<T>()) {
			return false;
		}
		registry.insert(TypeId::of::<T>(), Arc::new(value));
		true
	}

	pub fn manage_client_scoped<T: ClientScoped>(&self, value: T) -> bool {
		if !self.manage(value) {
			return false;
		}
		self.0.forgetters.write().unwrap_or_else(PoisonError::into_inner).push(forget::<T>);
		true
	}

	pub fn clear_client(&self, client: &ClientId) {
		let forgetters = self.0.forgetters.read().unwrap_or_else(PoisonError::into_inner).clone();
		for forget in forgetters {
			forget(self, client);
		}
	}

	pub fn try_state<T: Send + Sync + 'static>(&self) -> Option<Managed<'_, T>> {
		let registry = self.0.registry.read().unwrap_or_else(PoisonError::into_inner);
		let value: *const T = registry.get(&TypeId::of::<T>())?.downcast_ref::<T>()?;
		Some(Managed(unsafe { &*value }))
	}

	pub fn state<T: Send + Sync + 'static>(&self) -> Managed<'_, T> {
		self.try_state().unwrap_or_else(|| {
			panic!("{UNMANAGED}{}: manage it before reading it", type_name::<T>())
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

fn forget<T: ClientScoped>(core: &Core, client: &ClientId) {
	if let Some(scoped) = core.try_state::<T>() {
		scoped.forget_client(core, client);
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_core() -> Core {
		Core::new(std::env::temp_dir(), "com.kiroshi.test", crate::test_core::runtime())
	}

	struct Opened(std::sync::Mutex<Vec<String>>);

	impl Desktop for Arc<Opened> {
		fn open_url(&self, url: &str) -> Result<(), String> {
			self.0.lock().expect("unlocked").push(url.to_owned());
			Ok(())
		}

		fn raise_main_window(&self) {
			self.0.lock().expect("unlocked").push("raised".to_owned());
		}

		fn open_render_window(&self, window: &RenderWindow) -> Result<(), String> {
			self.0.lock().expect("unlocked").push(format!("opened {}", window.label));
			Ok(())
		}

		fn close_window(&self, label: &str) -> Result<(), String> {
			self.0.lock().expect("unlocked").push(format!("closed {label}"));
			Ok(())
		}
	}

	#[test]
	fn the_main_window_rises_through_the_installed_desktop_and_nothing_rises_without_one() {
		let core = a_core();
		core.raise_main_window();
		let opened = Arc::new(Opened(std::sync::Mutex::default()));
		assert!(core.install_desktop(opened.clone()));

		core.raise_main_window();

		assert_eq!(*opened.0.lock().expect("unlocked"), vec!["raised".to_owned()]);
	}

	#[test]
	fn a_link_opens_through_the_installed_desktop_and_fails_by_name_without_one() {
		let core = a_core();
		assert_eq!(core.open_url("https://kiroshi.app"), Err(OpenUrlError::NoDesktop));
		let opened = Arc::new(Opened(std::sync::Mutex::default()));
		assert!(core.install_desktop(opened.clone()));

		core.open_url("https://kiroshi.app").expect("opened");

		assert_eq!(*opened.0.lock().expect("unlocked"), vec!["https://kiroshi.app".to_owned()]);
	}

	#[test]
	fn a_render_window_opens_and_closes_through_the_installed_desktop_and_fails_by_name_without_one(
	) {
		let core = a_core();
		let window = RenderWindow {
			label: "screenshot-r1".to_owned(),
			route: "screenshot.html".to_owned(),
			width: 794.0,
			height: 600.0,
		};
		assert_eq!(core.open_render_window(&window), Err(RenderWindowError::NoDesktop));
		let opened = Arc::new(Opened(std::sync::Mutex::default()));
		assert!(core.install_desktop(opened.clone()));

		core.open_render_window(&window).expect("opened");
		core.close_window("screenshot-r1").expect("closed");

		assert_eq!(
			*opened.0.lock().expect("unlocked"),
			vec!["opened screenshot-r1".to_owned(), "closed screenshot-r1".to_owned()]
		);
	}

	#[test]
	fn spawned_work_runs_on_the_runtime_the_core_was_given() {
		let core = a_core();
		let answer =
			crate::test_core::runtime().block_on(core.spawn(async { 7 })).expect("the task ran");
		assert_eq!(answer, 7);
	}
	const FIRST_RUN_DONE: Event<()> = Event::new("user://first-run-done");

	#[test]
	fn an_emitted_event_reaches_a_subscriber_without_a_tauri_runtime() {
		let core = a_core();
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
		let core = a_core();
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
		let core = a_core();
		let (told, hearing) = std::sync::mpsc::channel();
		core.listen(|_| Err("the window is gone".into()));
		core.listen(move |event| told.send(event.name).map_err(|failure| failure.to_string()));

		assert!(core.emit(FIRST_RUN_DONE, ()).is_err());
		assert_eq!(hearing.try_recv(), Ok(FIRST_RUN_DONE.name()));
	}

	#[derive(Default)]
	struct Forgotten(std::sync::Mutex<Vec<ClientId>>);

	impl ClientScoped for Forgotten {
		fn forget_client(&self, _: &Core, client: &ClientId) {
			self.0.lock().expect("the test holds the lock").push(client.clone());
		}
	}

	#[test]
	fn clearing_a_client_reaches_every_client_scoped_state_once() {
		let core = a_core();
		assert!(core.manage_client_scoped(Forgotten::default()));
		assert!(!core.manage_client_scoped(Forgotten::default()));

		core.clear_client(&ClientId::new("window-1"));

		let forgotten = core.state::<Forgotten>();
		assert_eq!(*forgotten.inner().0.lock().expect("unlocked"), vec![ClientId::new("window-1")]);
	}

	#[test]
	fn clearing_a_client_with_no_client_scoped_state_reaches_nothing() {
		let core = a_core();
		assert!(core.manage(Forgotten::default()));

		core.clear_client(&ClientId::new("window-1"));

		assert!(core.state::<Forgotten>().inner().0.lock().expect("unlocked").is_empty());
	}

	#[test]
	fn managed_state_is_found_by_its_type() {
		let core = a_core();
		assert!(core.try_state::<u32>().is_none());
		assert!(core.manage(7_u32));
		assert_eq!(*core.state::<u32>(), 7);
	}

	#[test]
	fn a_second_insert_of_a_type_is_refused_and_the_held_value_stays() {
		let core = a_core();
		assert!(core.manage(String::from("first")));
		let held = core.state::<String>().inner();

		assert!(!core.manage(String::from("second")));

		assert_eq!(held, "first");
		assert_eq!(core.state::<String>().inner(), "first");
		assert!(std::ptr::eq(held, core.state::<String>().inner()));
	}
}
