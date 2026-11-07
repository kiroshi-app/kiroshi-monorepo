pub mod cors;
pub mod events;
pub mod files;
pub mod invoke;
pub mod token;

use axum::Router;

use crate::routines::webhook::Calls;

pub fn routes(calls: &Calls) -> Router<Calls> {
	invoke::route(calls.clone())
		.merge(events::route(calls.clone()))
		.merge(files::route(calls.clone()))
}
