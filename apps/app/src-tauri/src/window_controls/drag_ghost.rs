use std::sync::{Mutex, MutexGuard, PoisonError};
use std::thread;

use serde::{Deserialize, Serialize};
use tauri::{
	AppHandle, LogicalPosition, LogicalSize, Manager, Runtime, State, WebviewUrl, WebviewWindow,
	WebviewWindowBuilder,
};

use super::cursor::{self, Cursor, FollowFailure, Followed, GrabOffset, Unobservable};
use super::secondary::{ScreenPosition, WindowSize};
use crate::events::{self, DRAG_GHOST_ENDED};

pub const DRAG_GHOST: &str = "drag-ghost";

pub const DRAG_GHOST_ROUTE: &str = "/drag-ghost.html";

pub use kiroshi_core::desktop_events::DRAG_GHOST_TAB_EVENT as TAB_EVENT;

pub use kiroshi_core::desktop_events::DRAG_GHOST_ENDED_EVENT as ENDED_EVENT;

const THUMBNAIL_SCHEME: &str = "data:image/";

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DragGhostTab {
	pub tab_id: String,
	pub href: String,
	pub title: String,
	#[serde(default)]
	#[specta(type = Option<String>, optional)]
	pub thumbnail: Option<String>,
	#[serde(default)]
	#[specta(type = Option<GrabOffset>, optional)]
	pub grab: Option<GrabOffset>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
pub struct DragGhostSupport {
	pub supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DragGhostError {
	Unavailable,
	InvalidThumbnail,
	NotBuilt { reason: String },
	NotClickThrough { reason: String },
	NotShown { reason: String },
	NotMoved { reason: String },
	CursorUnreadable { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DragGhostEnded {
	Released { point: ScreenPosition },
	Hidden { point: ScreenPosition },
	Lost { error: DragGhostError },
}

#[derive(Default)]
pub struct DragGhostState(Mutex<Ghost>);

#[derive(Default)]
struct Ghost {
	last_tab: Option<DragGhostTab>,
	follow: Option<Follow>,
	follows: u64,
}

struct Follow {
	id: u64,
	origin: String,
}

impl DragGhostState {
	fn held(&self) -> MutexGuard<'_, Ghost> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl From<FollowFailure> for DragGhostError {
	fn from(failure: FollowFailure) -> Self {
		match failure {
			FollowFailure::Unobservable(unobservable) => unobservable.into(),
			FollowFailure::Unplaced(failure) => Self::NotMoved { reason: failure.to_string() },
		}
	}
}

impl From<Unobservable> for DragGhostError {
	fn from(unobservable: Unobservable) -> Self {
		Self::CursorUnreadable { reason: unobservable.to_string() }
	}
}

const UNSUPPORTED: DragGhostSupport = DragGhostSupport { supported: false };

const SUPPORTED: DragGhostSupport = DragGhostSupport { supported: true };

#[tauri::command]
#[specta::specta]
pub async fn drag_ghost_show<R: Runtime>(
	window: WebviewWindow<R>,
	at: ScreenPosition,
	size: WindowSize,
	tab: DragGhostTab,
) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	shown(window.app_handle(), window.label(), at, size, tab)
		.inspect_err(|failure| log::error!("the drag ghost was not shown: {failure:?}"))?;
	Ok(SUPPORTED)
}

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_tab<R: Runtime>(app: AppHandle<R>) -> Option<DragGhostTab> {
	ghost_state(&app).held().last_tab.clone()
}

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_move<R: Runtime>(
	app: AppHandle<R>,
	at: ScreenPosition,
) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	if ghost_state(&app).held().follow.is_some() {
		return Ok(SUPPORTED);
	}
	ghost_of(&app)?.set_position(logical(at)).map_err(|failure| unavailable("moved", &failure))?;
	Ok(SUPPORTED)
}

#[tauri::command]
#[specta::specta]
pub fn drag_ghost_hide<R: Runtime>(app: AppHandle<R>) -> Result<DragGhostSupport, DragGhostError> {
	if !is_supported() {
		return Ok(UNSUPPORTED);
	}
	let ghost = ghost_of(&app)?;
	let interrupted = ghost_state(&app).held().follow.take();
	let hidden = ghost.hide().map_err(|failure| unavailable("hidden", &failure));
	if let Some(follow) = interrupted {
		announced(&app, &follow.origin, hidden_at(cursor::read(&ghost)));
	}
	hidden.map(|()| SUPPORTED)
}

pub fn open<R: Runtime>(app: &AppHandle<R>) {
	if !is_supported() {
		return;
	}
	if let Err(failure) = ready(app) {
		log::error!("the drag ghost did not open at startup: {failure:?}");
	}
}

fn shown<R: Runtime>(
	app: &AppHandle<R>,
	origin: &str,
	at: ScreenPosition,
	size: WindowSize,
	tab: DragGhostTab,
) -> Result<(), DragGhostError> {
	refuse_unless_image(tab.thumbnail.as_deref())?;
	let ghost = ready(app)?;
	let cursor = cursor::read(&ghost)?;
	let grab = tab.grab.map_or_else(|| cursor.grab_from(logical(at)), GrabOffset::logical);
	delivered(app, tab)?;
	ghost
		.set_size(LogicalSize::new(f64::from(size.width), f64::from(size.height)))
		.and_then(|()| ghost.set_position(cursor.placement(grab)))
		.and_then(|()| ghost.show())
		.map_err(|failure| DragGhostError::NotShown { reason: failure.to_string() })?;
	follow_cursor(app, &ghost, origin, grab)
}

fn refuse_unless_image(thumbnail: Option<&str>) -> Result<(), DragGhostError> {
	match thumbnail {
		Some(thumbnail) if !thumbnail.starts_with(THUMBNAIL_SCHEME) => {
			Err(DragGhostError::InvalidThumbnail)
		}
		_ => Ok(()),
	}
}

fn ready<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, DragGhostError> {
	let ghost = match app.get_webview_window(DRAG_GHOST) {
		Some(ghost) => ghost,
		None => built(app)
			.map_err(|failure| DragGhostError::NotBuilt { reason: failure.to_string() })?,
	};
	ghost
		.set_ignore_cursor_events(true)
		.map_err(|failure| DragGhostError::NotClickThrough { reason: failure.to_string() })?;
	Ok(ghost)
}

fn built<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<WebviewWindow<R>> {
	let route = DRAG_GHOST_ROUTE.trim_start_matches('/');
	WebviewWindowBuilder::new(app, DRAG_GHOST, WebviewUrl::App(route.into()))
		.visible(false)
		.transparent(true)
		.decorations(false)
		.shadow(false)
		.resizable(false)
		.always_on_top(true)
		.skip_taskbar(true)
		.focusable(false)
		.focused(false)
		.build()
}

fn delivered<R: Runtime>(app: &AppHandle<R>, tab: DragGhostTab) -> Result<(), DragGhostError> {
	ghost_state(app).held().last_tab = Some(tab.clone());
	events::emit_to(app, DRAG_GHOST, events::DRAG_GHOST_TAB, tab)
		.map_err(|failure| unavailable("handed its tab", &failure))
}

fn follow_cursor<R: Runtime>(
	app: &AppHandle<R>,
	ghost: &WebviewWindow<R>,
	origin: &str,
	grab: LogicalPosition<f64>,
) -> Result<(), DragGhostError> {
	let id = followed_from(app, origin);
	let (app, ghost) = (app.clone(), ghost.clone());
	thread::Builder::new()
		.name("drag-ghost-follow".to_owned())
		.spawn(move || {
			let followed = cursor::follow(
				|| is_following(&app, id),
				|| cursor::read(&ghost),
				|cursor| ghost.set_position(cursor.placement(grab)),
			);
			settled(&app, &ghost, id, followed);
		})
		.map(drop)
		.map_err(|failure| DragGhostError::NotShown { reason: failure.to_string() })
}

fn followed_from<R: Runtime>(app: &AppHandle<R>, origin: &str) -> u64 {
	let state = ghost_state(app);
	let mut ghost = state.held();
	ghost.follows += 1;
	ghost.follow = Some(Follow { id: ghost.follows, origin: origin.to_owned() });
	ghost.follows
}

fn is_following<R: Runtime>(app: &AppHandle<R>, id: u64) -> bool {
	ghost_state(app).held().follow.as_ref().is_some_and(|follow| follow.id == id)
}

fn settled<R: Runtime>(app: &AppHandle<R>, ghost: &WebviewWindow<R>, id: u64, followed: Followed) {
	let ending = match followed {
		Followed::Stopped => return,
		Followed::Released(cursor) => DragGhostEnded::Released { point: cursor.point() },
		Followed::Lost(failure) => {
			log::error!("the drag ghost stopped following the cursor: {failure}");
			DragGhostEnded::Lost { error: failure.into() }
		}
	};
	let Some(follow) = ghost_state(app).held().follow.take_if(|follow| follow.id == id) else {
		return;
	};
	if let Err(failure) = ghost.hide() {
		log::error!("the drag ghost was not hidden on the release: {failure}");
	}
	announced(app, &follow.origin, ending);
}

fn hidden_at(reading: Result<Cursor, Unobservable>) -> DragGhostEnded {
	match reading {
		Ok(cursor) => DragGhostEnded::Hidden { point: cursor.point() },
		Err(unobservable) => {
			log::error!("the drag ghost was hidden where the cursor is unknown: {unobservable}");
			DragGhostEnded::Lost { error: unobservable.into() }
		}
	}
}

fn announced<R: Runtime>(app: &AppHandle<R>, origin: &str, ending: DragGhostEnded) {
	if let Err(failure) = events::emit_to(app, origin, DRAG_GHOST_ENDED, ending) {
		log::error!("the end of the drag ghost did not reach the window {origin}: {failure}");
	}
}

fn is_supported() -> bool {
	supports_drag_ghost(std::env::consts::OS)
}

fn supports_drag_ghost(os: &str) -> bool {
	matches!(os, "macos" | "windows")
}

fn ghost_of<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, DragGhostError> {
	app.get_webview_window(DRAG_GHOST).ok_or_else(|| {
		eprintln!("the drag ghost is not open");
		DragGhostError::Unavailable
	})
}

fn ghost_state<R: Runtime>(app: &AppHandle<R>) -> State<'_, DragGhostState> {
	if app.try_state::<DragGhostState>().is_none() {
		app.manage(DragGhostState::default());
	}
	app.state::<DragGhostState>()
}

fn logical(at: ScreenPosition) -> LogicalPosition<f64> {
	LogicalPosition::new(f64::from(at.x), f64::from(at.y))
}

fn unavailable(gesture: &str, failure: &dyn std::fmt::Display) -> DragGhostError {
	eprintln!("the drag ghost was not {gesture}: {failure}");
	DragGhostError::Unavailable
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc;

	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{Listener, PhysicalPosition, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

	use super::{
		delivered, drag_ghost_tab, followed_from, hidden_at, is_following, refuse_unless_image,
		settled, supports_drag_ghost, Cursor, DragGhostEnded, DragGhostError, DragGhostTab,
		FollowFailure, Followed, Unobservable, DRAG_GHOST,
	};
	use crate::events::{DRAG_GHOST_ENDED, DRAG_GHOST_TAB};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use crate::window_controls::is_app_window;
	use crate::window_controls::secondary::ScreenPosition;

	const ORIGIN: &str = "window-1";

	fn app(name: &str) -> AppOfItsOwn {
		an_app_of_its_own(name, mock_builder())
	}

	fn window_of(app: &AppOfItsOwn, label: &str) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(app.handle(), label, WebviewUrl::default())
			.build()
			.expect("the window opens")
	}

	fn heard_by(window: &WebviewWindow<MockRuntime>, event: &'static str) -> mpsc::Receiver<Value> {
		let (told, heard) = mpsc::channel();
		window.listen(event, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("JSON");
			told.send(payload).expect("the test listens");
		});
		heard
	}

	fn tab() -> DragGhostTab {
		DragGhostTab {
			tab_id: "tab-1".to_owned(),
			href: "/conversations/c-1".to_owned(),
			title: "Roadmap".to_owned(),
			thumbnail: Some("data:image/png;base64,iVBORw0KGgo=".to_owned()),
			grab: None,
		}
	}

	fn released_at(x: f64, y: f64) -> Followed {
		Followed::Released(Cursor {
			physical: PhysicalPosition::new(x, y),
			scale: 2.0,
			is_primary_pressed: false,
		})
	}

	#[test]
	fn the_drag_ghost_is_supported_on_macos_and_windows() {
		assert!(supports_drag_ghost("macos"));
		assert!(supports_drag_ghost("windows"));
	}

	#[test]
	fn the_drag_ghost_is_unsupported_on_linux_and_anywhere_else() {
		for os in ["linux", "freebsd", ""] {
			assert!(!supports_drag_ghost(os), "{os} was supported");
		}
	}

	#[test]
	fn the_drag_ghost_is_no_app_window() {
		assert!(!is_app_window(DRAG_GHOST));
	}

	#[test]
	fn the_tab_shown_reaches_the_ghost_page_whole_and_is_answered_to_a_page_loaded_later() {
		let app = app("drag-ghost-delivery");
		let ghost = window_of(&app, DRAG_GHOST);
		let heard = heard_by(&ghost, DRAG_GHOST_TAB.name());

		assert_eq!(drag_ghost_tab(app.handle().clone()), None);
		delivered(app.handle(), tab()).expect("the tab reaches the ghost");

		let heard: Vec<Value> = heard.try_iter().collect();
		assert_eq!(
			heard,
			vec![json!({
				"tabId": "tab-1",
				"href": "/conversations/c-1",
				"title": "Roadmap",
				"thumbnail": "data:image/png;base64,iVBORw0KGgo=",
				"grab": null,
			})]
		);
		assert_eq!(drag_ghost_tab(app.handle().clone()), Some(tab()));
	}

	#[test]
	fn a_thumbnail_that_is_no_image_data_url_is_refused() {
		assert_eq!(
			refuse_unless_image(Some("javascript:alert(1)")),
			Err(DragGhostError::InvalidThumbnail)
		);
		assert_eq!(
			refuse_unless_image(Some("https://example.test/a.png")),
			Err(DragGhostError::InvalidThumbnail)
		);
		assert_eq!(refuse_unless_image(Some("data:image/webp;base64,UklGRg==")), Ok(()));
		assert_eq!(refuse_unless_image(None), Ok(()));
	}

	#[test]
	fn the_release_hides_the_ghost_and_tells_the_origin_once_where_the_cursor_was_let_go() {
		let app = app("drag-ghost-release");
		let (origin, ghost) = (window_of(&app, ORIGIN), window_of(&app, DRAG_GHOST));
		let (heard_by_origin, heard_by_ghost) =
			(heard_by(&origin, DRAG_GHOST_ENDED.name()), heard_by(&ghost, DRAG_GHOST_ENDED.name()));

		let id = followed_from(app.handle(), ORIGIN);
		settled(app.handle(), &ghost, id, released_at(1281.0, 425.0));
		settled(app.handle(), &ghost, id, released_at(0.0, 0.0));

		let heard: Vec<Value> = heard_by_origin.try_iter().collect();
		assert_eq!(heard, vec![json!({ "kind": "released", "point": { "x": 641, "y": 213 } })]);
		assert_eq!(heard_by_ghost.try_iter().count(), 0);
		assert!(!is_following(app.handle(), id), "the ghost still follows after the release");
	}

	#[test]
	fn a_follow_superseded_by_a_later_show_ends_silently() {
		let app = app("drag-ghost-superseded");
		let (origin, ghost) = (window_of(&app, ORIGIN), window_of(&app, DRAG_GHOST));
		let heard = heard_by(&origin, DRAG_GHOST_ENDED.name());

		let superseded = followed_from(app.handle(), ORIGIN);
		let current = followed_from(app.handle(), ORIGIN);
		settled(app.handle(), &ghost, superseded, released_at(0.0, 0.0));

		assert_eq!(heard.try_iter().count(), 0);
		assert!(is_following(app.handle(), current), "the later follow was ended");
	}

	#[test]
	fn a_follow_that_loses_the_cursor_tells_the_origin_with_a_typed_error() {
		let app = app("drag-ghost-lost");
		let (origin, ghost) = (window_of(&app, ORIGIN), window_of(&app, DRAG_GHOST));
		let heard = heard_by(&origin, DRAG_GHOST_ENDED.name());

		let id = followed_from(app.handle(), ORIGIN);
		let lost = FollowFailure::Unobservable(Unobservable {
			platform: "test",
			reason: "no pointer".to_owned(),
		});
		settled(app.handle(), &ghost, id, Followed::Lost(lost));

		let heard: Vec<Value> = heard.try_iter().collect();
		assert_eq!(
			heard,
			vec![json!({
				"kind": "lost",
				"error": {
					"kind": "cursorUnreadable",
					"reason": "the cursor is not observable on test: no pointer",
				},
			})]
		);
	}

	#[test]
	fn a_ghost_hidden_mid_follow_ends_at_the_cursor_it_was_hidden_under() {
		let hidden = hidden_at(Ok(Cursor {
			physical: PhysicalPosition::new(400.0, 300.0),
			scale: 2.0,
			is_primary_pressed: true,
		}));

		assert_eq!(hidden, DragGhostEnded::Hidden { point: ScreenPosition { x: 200, y: 150 } });
	}

	#[cfg(any(target_os = "macos", windows))]
	#[test]
	fn hiding_the_ghost_mid_follow_stops_the_follow_and_tells_the_origin_once() {
		let app = app("drag-ghost-hide");
		let (origin, ghost) = (window_of(&app, ORIGIN), window_of(&app, DRAG_GHOST));
		let heard = heard_by(&origin, DRAG_GHOST_ENDED.name());

		let id = followed_from(app.handle(), ORIGIN);
		super::drag_ghost_hide(app.handle().clone()).expect("the ghost hides");
		settled(app.handle(), &ghost, id, released_at(0.0, 0.0));
		super::drag_ghost_hide(app.handle().clone()).expect("the ghost hides again");

		assert_eq!(heard.try_iter().count(), 1);
		assert!(!is_following(app.handle(), id), "the ghost still follows once hidden");
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn a_ghost_missing_at_show_is_built_again_before_the_show_answers() {
		use tauri::ipc::CallbackFn;
		use tauri::test::{get_ipc_response, INVOKE_KEY};
		use tauri::webview::InvokeRequest;
		use tauri::Manager;

		let app = an_app_of_its_own(
			"drag-ghost-rebuilt",
			mock_builder().invoke_handler(crate::commands::invoke_handler()),
		);
		let origin = window_of(&app, ORIGIN);
		assert!(app.handle().get_webview_window(DRAG_GHOST).is_none());

		let answer = get_ipc_response(
			&origin,
			InvokeRequest {
				cmd: "drag_ghost_show".into(),
				callback: CallbackFn(0),
				error: CallbackFn(1),
				url: "tauri://localhost".parse().expect("a url"),
				body: json!({
					"at": { "x": 10, "y": 10 },
					"size": { "width": 320, "height": 200 },
					"tab": { "tabId": "tab-1", "href": "/", "title": "Roadmap" },
				})
				.into(),
				headers: Default::default(),
				invoke_key: INVOKE_KEY.to_string(),
			},
		);

		assert!(app.handle().get_webview_window(DRAG_GHOST).is_some(), "the ghost was not built");
		assert_eq!(
			answer.expect_err("the mock runtime has no primary monitor to read under"),
			json!({
				"kind": "cursorUnreadable",
				"reason": "the cursor is not observable on macos: no primary monitor is attached",
			})
		);
	}
}
