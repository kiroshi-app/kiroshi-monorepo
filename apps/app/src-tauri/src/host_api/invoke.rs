use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::Path;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use serde_json::Value;
use std::sync::{Mutex, PoisonError};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeError, InvokeResponse, InvokeResponseBody};
use tauri::webview::InvokeRequest;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;

use super::cors::WINDOW_ORIGIN;
use crate::routines::webhook::Calls;
pub use kiroshi_core::host_api::invoke::*;
use kiroshi_core::invoke::Answer;
const MAIN_WEBVIEW: &str = "main";

pub(crate) const DISPATCHER_WEBVIEW: &str = "dispatcher";

const BLANK_PAGE: &str = "about:blank";

static DISPATCHER_OPENING: Mutex<()> = Mutex::new(());

const UNANSWERED: (StatusCode, &str) =
	(StatusCode::INTERNAL_SERVER_ERROR, "the command gave no answer");

pub(crate) fn route_with_webview<R: Runtime>(calls: Calls, app: AppHandle<R>) -> Router<Calls> {
	let answering = move |Path(command): Path<String>,
	                      headers: HeaderMap,
	                      body: Result<Bytes, BytesRejection>| {
		invoked(app.clone(), command, headers, body)
	};
	guarded_route(calls, post(answering))
}

async fn invoked<R: Runtime>(
	app: AppHandle<R>,
	command: String,
	headers: HeaderMap,
	body: Result<Bytes, BytesRejection>,
) -> Response {
	let arguments = match called_arguments(&command, body) {
		Ok(arguments) => arguments,
		Err(refused) => return refused.into_response(),
	};
	if kiroshi_core::invoke::handles(&command) {
		return answered(crate::events::core(&app), &command, &headers, arguments).await;
	}
	match dispatched(app, command.clone(), arguments, headers).await {
		Some(response) => answered_by_the_webview(&command, response),
		None => UNANSWERED.into_response(),
	}
}

async fn dispatched<R: Runtime>(
	app: AppHandle<R>,
	command: String,
	arguments: Value,
	headers: HeaderMap,
) -> Option<InvokeResponse> {
	let url = match WINDOW_ORIGIN.parse::<Url>() {
		Ok(url) => url,
		Err(failure) => {
			eprintln!("the host gave no local address to invoke {command} from: {failure}");
			return None;
		}
	};
	let request = InvokeRequest {
		cmd: command.clone(),
		callback: CallbackFn(0),
		error: CallbackFn(1),
		url,
		body: InvokeBody::Json(arguments),
		headers: HeaderMap::from_iter(
			headers.get(&RELAYED_MEMBER_HEADER).map(|nonce| (RELAYED_MEMBER_HEADER, nonce.clone())),
		),
		invoke_key: app.invoke_key().to_owned(),
	};
	let (answer, answering) = oneshot::channel();
	let responder = Box::new(move |_, _, response, _, _| {
		if answer.send(response).is_err() {
			eprintln!("the command {command} answered after its caller left");
		}
	});
	tauri::async_runtime::spawn_blocking(move || {
		if let Some(webview) = dispatching_window(&app) {
			webview.on_message(request, responder);
		}
	});
	answering.await.ok()
}

fn dispatching_window<R: Runtime>(app: &AppHandle<R>) -> Option<WebviewWindow<R>> {
	if let Some(window) = app.get_webview_window(MAIN_WEBVIEW) {
		return Some(window);
	}
	let _opening = DISPATCHER_OPENING.lock().unwrap_or_else(PoisonError::into_inner);
	if let Some(window) = app.get_webview_window(DISPATCHER_WEBVIEW) {
		return Some(window);
	}
	let blank = match BLANK_PAGE.parse::<Url>() {
		Ok(blank) => blank,
		Err(failure) => {
			eprintln!("the dispatcher window gave no blank page to open: {failure}");
			return None;
		}
	};
	match WebviewWindowBuilder::new(app, DISPATCHER_WEBVIEW, WebviewUrl::External(blank))
		.visible(false)
		.build()
	{
		Ok(window) => Some(window),
		Err(failure) => {
			eprintln!("the dispatcher window did not open: {failure}");
			None
		}
	}
}

fn answered_by_the_webview(command: &str, response: InvokeResponse) -> Response {
	match response {
		InvokeResponse::Ok(InvokeResponseBody::Json(json)) => {
			(StatusCode::OK, [(header::CONTENT_TYPE, JSON)], json).into_response()
		}
		InvokeResponse::Ok(InvokeResponseBody::Raw(bytes)) => {
			(StatusCode::OK, [(header::CONTENT_TYPE, BYTES)], bytes).into_response()
		}
		InvokeResponse::Err(InvokeError(error)) if error == unregistered(command) => {
			UNREGISTERED.into_response()
		}
		InvokeResponse::Err(InvokeError(error)) => Answer::Refused(error).into_http(command),
	}
}

fn unregistered(command: &str) -> Value {
	Value::String(format!("Command {command} not found"))
}
