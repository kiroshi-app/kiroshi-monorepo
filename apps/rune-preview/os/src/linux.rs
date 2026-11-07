use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Mutex, OnceLock};

use notify_rust::{Hint, Notification, NotificationResponse};
use x11rb::connection::Connection;
use x11rb::protocol::xproto::{
	Atom, AtomEnum, ClientMessageEvent, ConnectionExt, EventMask, Window,
};
use x11rb::rust_connection::RustConnection;
use zbus::blocking::Connection as SessionBus;
use zbus::zvariant::Value;

use crate::policy::Notice;
use crate::{BannerOutcome, CHIME, Heard, post_waiting, report};

const CLICK_ACTION: &str = "default";

const PAGER_SOURCE: u32 = 2;

const CLIENT_LIST_LENGTH: u32 = 1024;

pub fn holds_focus() -> Result<bool, String> {
	if is_wayland() {
		return Err("Linux under Wayland".into());
	}
	let desktop = Desktop::open().map_err(|failure| format!("Linux under X11 ({failure})"))?;
	desktop.holds_focus().map_err(|failure| format!("Linux under X11 ({failure})"))
}

pub fn bring_to_front() -> Result<(), String> {
	if is_wayland() {
		return Err("Wayland lets no app raise its own window".into());
	}
	Desktop::open()?.raise()
}

pub fn play_chime() -> Result<(), String> {
	let chime = chime_file()?;
	let status = Command::new("paplay")
		.arg(chime)
		.status()
		.map_err(|failure| format!("paplay did not start: {failure}"))?;
	status.success().then_some(()).ok_or_else(|| format!("paplay answered {status}"))
}

pub fn post_banner(app_id: &str, notice: Notice, heard: Heard) {
	let Notice { title, body, target } = notice;
	let app_id = app_id.to_owned();
	post_waiting(heard, target, move |heard, target| {
		let shown = Notification::new()
			.appname(&app_id)
			.summary(&title)
			.body(&body)
			.action(CLICK_ACTION, CLICK_ACTION)
			.hint(Hint::SuppressSound(true))
			.show();
		let handle = match shown {
			Ok(handle) => handle,
			Err(failure) => {
				return report(heard, target, format!("the notification server: {failure}"));
			}
		};
		let mut is_clicked = false;
		let waited = handle.wait_for_response(|response: &NotificationResponse| {
			is_clicked = matches!(response, NotificationResponse::Default)
				|| matches!(response, NotificationResponse::Action(action) if action == CLICK_ACTION);
		});
		match waited {
			Ok(()) if is_clicked => heard(BannerOutcome::Clicked(target)),
			Ok(()) => {}
			Err(failure) => eprintln!("the notification response was not read: {failure}"),
		}
	});
}

pub fn wear_badge(app_id: &str, count: u32) -> Result<(), String> {
	let mut session = SESSION.lock().map_err(|_| "the session bus lock was poisoned")?;
	if session.is_none() {
		let opened = SessionBus::session()
			.map_err(|failure| format!("the session bus did not answer: {failure}"))?;
		*session = Some(opened);
	}
	let Some(bus) = session.as_ref() else {
		return Err("the session bus was not kept".into());
	};
	let properties: HashMap<&str, Value> = HashMap::from([
		("count", Value::from(i64::from(count))),
		("count-visible", Value::from(count > 0)),
	]);
	bus.emit_signal(
		None::<&str>,
		"/",
		"com.canonical.Unity.LauncherEntry",
		"Update",
		&(format!("application://{app_id}.desktop"), properties),
	)
	.map_err(|failure| format!("the launcher entry update was refused: {failure}"))
}

static SESSION: Mutex<Option<SessionBus>> = Mutex::new(None);

fn is_wayland() -> bool {
	env::var_os("WAYLAND_DISPLAY").is_some()
}

fn chime_file() -> Result<&'static PathBuf, String> {
	static WRITTEN: OnceLock<Result<PathBuf, String>> = OnceLock::new();
	WRITTEN
		.get_or_init(|| {
			let path = env::temp_dir().join(format!("kiroshi-chime-{}.wav", std::process::id()));
			fs::write(&path, CHIME)
				.map(|()| path)
				.map_err(|failure| format!("the chime was not written for paplay: {failure}"))
		})
		.as_ref()
		.map_err(Clone::clone)
}

struct Desktop {
	connection: RustConnection,
	root: Window,
	active_window: Atom,
	window_process: Atom,
	client_list: Atom,
}

impl Desktop {
	fn open() -> Result<Desktop, String> {
		let (connection, screen) = x11rb::connect(None)
			.map_err(|failure| format!("the X display did not answer: {failure}"))?;
		let root = connection
			.setup()
			.roots
			.get(screen)
			.map(|screen| screen.root)
			.ok_or("the X display has no such screen")?;
		let active_window = atom(&connection, b"_NET_ACTIVE_WINDOW")?;
		let window_process = atom(&connection, b"_NET_WM_PID")?;
		let client_list = atom(&connection, b"_NET_CLIENT_LIST")?;
		Ok(Desktop { connection, root, active_window, window_process, client_list })
	}

	fn holds_focus(&self) -> Result<bool, String> {
		let Some(active) =
			self.values(self.root, self.active_window, AtomEnum::WINDOW, 1)?.first().copied()
		else {
			return Ok(false);
		};
		self.is_own(active)
	}

	fn raise(&self) -> Result<(), String> {
		let clients =
			self.values(self.root, self.client_list, AtomEnum::WINDOW, CLIENT_LIST_LENGTH)?;
		let mut own = None;
		for window in clients {
			if self.is_own(window)? {
				own = Some(window);
				break;
			}
		}
		let window = own.ok_or("the process shows no window")?;
		let request =
			ClientMessageEvent::new(32, window, self.active_window, [PAGER_SOURCE, 0, 0, 0, 0]);
		self.connection
			.send_event(
				false,
				self.root,
				EventMask::SUBSTRUCTURE_REDIRECT | EventMask::SUBSTRUCTURE_NOTIFY,
				request,
			)
			.map_err(|failure| format!("the raise request was not sent: {failure}"))?;
		self.connection
			.flush()
			.map_err(|failure| format!("the raise request was not sent: {failure}"))
	}

	fn is_own(&self, window: Window) -> Result<bool, String> {
		let process = self.values(window, self.window_process, AtomEnum::CARDINAL, 1)?;
		Ok(process.first() == Some(&std::process::id()))
	}

	fn values(
		&self,
		window: Window,
		property: Atom,
		kind: AtomEnum,
		length: u32,
	) -> Result<Vec<u32>, String> {
		let reply = self
			.connection
			.get_property(false, window, property, kind, 0, length)
			.map_err(|failure| format!("a window property was not asked: {failure}"))?
			.reply()
			.map_err(|failure| format!("a window property was not read: {failure}"))?;
		Ok(reply.value32().map(Iterator::collect).unwrap_or_default())
	}
}

fn atom(connection: &RustConnection, name: &[u8]) -> Result<Atom, String> {
	let reply = connection
		.intern_atom(false, name)
		.map_err(|failure| format!("an atom was not asked: {failure}"))?
		.reply()
		.map_err(|failure| format!("an atom was not read: {failure}"))?;
	Ok(reply.atom)
}
