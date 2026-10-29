use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;
use serde_json::Value;
use tauri::{AppHandle, Manager, Runtime, State, WebviewWindow};

use super::native_move;
use super::secondary::ScreenPosition;
use crate::events::{self, TAB_DRAG};
use crate::json::JsonValue;

pub const TAB_DRAG_EVENT: &str = "window://tab-drag";

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TabDrag {
	#[serde(rename_all = "camelCase")]
	Started {
		origin_label: String,
		origin_space_id: String,
		#[specta(type = JsonValue)]
		tab: Value,
	},
	#[serde(rename_all = "camelCase")]
	Moved { origin_label: String, point: ScreenPosition },
	#[serde(rename_all = "camelCase")]
	Dropped { origin_label: String, point: ScreenPosition },
	#[serde(rename_all = "camelCase")]
	Cancelled { origin_label: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TabDragError {
	NoDragInProgress,
	NotTheOrigin,
	Unavailable,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum NativeWindowError {
	Unavailable,
}

#[derive(Default)]
pub struct DragOrigin(Mutex<Option<String>>);

impl DragOrigin {
	fn held(&self) -> MutexGuard<'_, Option<String>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

#[tauri::command]
#[specta::specta]
pub fn window_tab_drag_start<R: Runtime>(
	window: WebviewWindow<R>,
	tab: JsonValue,
	space_id: String,
) -> Result<(), TabDragError> {
	let origin_label = window.label().to_owned();
	let superseded = drag_origin(window.app_handle()).held().replace(origin_label.clone());
	if let Some(origin_label) = superseded {
		broadcast(window.app_handle(), TabDrag::Cancelled { origin_label })?;
	}
	let started = TabDrag::Started { origin_label, origin_space_id: space_id, tab: tab.into() };
	broadcast(window.app_handle(), started)
}

#[tauri::command]
#[specta::specta]
pub fn window_tab_drag_move<R: Runtime>(
	window: WebviewWindow<R>,
	point: ScreenPosition,
) -> Result<(), TabDragError> {
	let origin_label = dragged_by(&drag_origin(window.app_handle()).held(), window.label())?;
	broadcast(window.app_handle(), TabDrag::Moved { origin_label, point })
}

#[tauri::command]
#[specta::specta]
pub fn window_tab_drag_drop<R: Runtime>(
	window: WebviewWindow<R>,
	point: ScreenPosition,
) -> Result<(), TabDragError> {
	let origin_label = ended_by(&window)?;
	broadcast(window.app_handle(), TabDrag::Dropped { origin_label, point })
}

#[tauri::command]
#[specta::specta]
pub fn window_tab_drag_cancel<R: Runtime>(window: WebviewWindow<R>) -> Result<(), TabDragError> {
	let origin_label = ended_by(&window)?;
	broadcast(window.app_handle(), TabDrag::Cancelled { origin_label })
}

#[tauri::command]
#[specta::specta]
pub fn window_start_native_move<R: Runtime>(
	window: WebviewWindow<R>,
) -> Result<(), NativeWindowError> {
	let watch = native_move::watch(&window);
	acted_on(&window, "moved", window.start_dragging())?;
	if let Some(watch) = watch {
		native_move::follow_release(watch);
	}
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn window_hide<R: Runtime>(window: WebviewWindow<R>) -> Result<(), NativeWindowError> {
	acted_on(&window, "hidden", window.hide())
}

#[tauri::command]
#[specta::specta]
pub fn window_show<R: Runtime>(window: WebviewWindow<R>) -> Result<(), NativeWindowError> {
	acted_on(&window, "shown", window.show())
}

pub(super) fn cancel_when_origin_destroyed<R: Runtime>(window: &WebviewWindow<R>) {
	let Ok(origin_label) = ended_by(window) else {
		return;
	};
	let cancelled = TabDrag::Cancelled { origin_label };
	if let Err(failure) = events::emit_to_windows(window.app_handle(), TAB_DRAG, cancelled) {
		eprintln!(
			"the drag of the destroyed window {} ended unannounced: {failure}",
			window.label()
		);
	}
}

fn dragged_by(held: &Option<String>, label: &str) -> Result<String, TabDragError> {
	match held.as_deref() {
		None => Err(TabDragError::NoDragInProgress),
		Some(origin) if origin != label => Err(TabDragError::NotTheOrigin),
		Some(origin) => Ok(origin.to_owned()),
	}
}

fn ended_by<R: Runtime>(window: &WebviewWindow<R>) -> Result<String, TabDragError> {
	let state = drag_origin(window.app_handle());
	let mut held = state.held();
	let origin_label = dragged_by(&held, window.label())?;
	*held = None;
	Ok(origin_label)
}

fn broadcast<R: Runtime>(app: &AppHandle<R>, drag: TabDrag) -> Result<(), TabDragError> {
	events::emit_to_windows(app, TAB_DRAG, drag).map_err(|failure| {
		eprintln!("the tab drag did not reach the windows: {failure}");
		TabDragError::Unavailable
	})
}

fn acted_on<R: Runtime>(
	window: &WebviewWindow<R>,
	action: &str,
	outcome: tauri::Result<()>,
) -> Result<(), NativeWindowError> {
	outcome.map_err(|failure| {
		eprintln!("the window {} was not {action}: {failure}", window.label());
		NativeWindowError::Unavailable
	})
}

fn drag_origin<R: Runtime>(app: &AppHandle<R>) -> State<'_, DragOrigin> {
	if app.try_state::<DragOrigin>().is_none() {
		app.manage(DragOrigin::default());
	}
	app.state::<DragOrigin>()
}
