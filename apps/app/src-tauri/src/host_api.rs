pub use kiroshi_core::host_api::cors;
pub use kiroshi_core::host_api::events;
pub use kiroshi_core::host_api::files;
pub mod invoke;
pub use kiroshi_core::host_api::token;

use axum::Router;
use tauri::{AppHandle, Runtime};

use crate::routines::webhook::Calls;

pub fn routes<R: Runtime>(app: AppHandle<R>) -> impl FnOnce(&Calls) -> Router<Calls> {
	move |calls| {
		invoke::route(calls.clone(), app)
			.merge(events::route(calls.clone()))
			.merge(files::route(calls.clone()))
	}
}
