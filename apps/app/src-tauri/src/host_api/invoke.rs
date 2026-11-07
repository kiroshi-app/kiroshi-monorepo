use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, Path, Request, State};
use axum::http::{header, HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::post;
use axum::Router;
use serde::Deserialize;
use serde_json::{Map, Value};
use std::sync::{Mutex, PoisonError};
use tauri::ipc::{CallbackFn, InvokeBody, InvokeError, InvokeResponse, InvokeResponseBody};
use tauri::webview::InvokeRequest;
use tauri::{AppHandle, Manager, Runtime, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};
use tokio::sync::oneshot;

use super::cors::WINDOW_ORIGIN;
use crate::attachments::contract::AttachmentStoreError;
use crate::hosting::contract::REFUSED_TO_A_MEMBER;
use crate::routines::webhook::{named_here, Calls};
pub use kiroshi_core::host_api::invoke::*;
const MAIN_WEBVIEW: &str = "main";

pub(crate) const DISPATCHER_WEBVIEW: &str = "dispatcher";

const STORE_ATTACHMENTS: &str = "chat_store_attachments";

const BLANK_PAGE: &str = "about:blank";

static DISPATCHER_OPENING: Mutex<()> = Mutex::new(());

const UNANSWERED: (StatusCode, &str) =
	(StatusCode::INTERNAL_SERVER_ERROR, "the command gave no answer");

pub(crate) fn route<R: Runtime>(calls: Calls, app: AppHandle<R>) -> Router<Calls> {
	let answering = move |Path(command): Path<String>,
	                      headers: HeaderMap,
	                      body: Result<Bytes, BytesRejection>| {
		invoked(app.clone(), command, headers, body)
	};
	Router::new()
		.route(PATH, post(answering).layer(DefaultBodyLimit::max(MAX_BODY_BYTES)))
		.route_layer(middleware::from_fn_with_state(calls, guarded))
}

async fn invoked<R: Runtime>(
	app: AppHandle<R>,
	command: String,
	headers: HeaderMap,
	body: Result<Bytes, BytesRejection>,
) -> Response {
	if !names_an_app_command(&command) {
		return UNREGISTERED.into_response();
	}
	let arguments = match body {
		Ok(body) => arguments(&body),
		Err(rejection) => return unread(rejection),
	};
	let Some(arguments) = arguments else {
		return UNREADABLE.into_response();
	};
	let relayed_member = headers
		.get(&RELAYED_MEMBER_HEADER)
		.cloned()
		.unwrap_or_else(|| HeaderValue::from_static(""));
	if relayed_member.is_empty() && kiroshi_core::invoke::handles(&command) {
		let core = crate::events::core(&app);
		if let Some(answer) = kiroshi_core::invoke::dispatch(core, &command, arguments).await {
			return answer.into_response();
		}
		return UNREGISTERED.into_response();
	}
	match dispatched(app, command.clone(), arguments, relayed_member).await {
		Some(response) => answered(&command, response),
		None => UNANSWERED.into_response(),
	}
}

async fn dispatched<R: Runtime>(
	app: AppHandle<R>,
	command: String,
	arguments: Value,
	relayed_member: HeaderValue,
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
		headers: HeaderMap::from_iter([(RELAYED_MEMBER_HEADER, relayed_member)]),
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

fn answered(command: &str, response: InvokeResponse) -> Response {
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
		InvokeResponse::Err(InvokeError(error)) if error["kind"] == REFUSED_TO_A_MEMBER => {
			(StatusCode::FORBIDDEN, [(header::CONTENT_TYPE, JSON)], error.to_string())
				.into_response()
		}
		InvokeResponse::Err(InvokeError(error)) => {
			let status = attachment_refusal_status(command, &error)
				.unwrap_or(StatusCode::INTERNAL_SERVER_ERROR);
			(status, [(header::CONTENT_TYPE, JSON)], error.to_string()).into_response()
		}
	}
}

fn attachment_refusal_status(command: &str, error: &Value) -> Option<StatusCode> {
	if command != STORE_ATTACHMENTS {
		return None;
	}
	match AttachmentStoreError::deserialize(error).ok()? {
		AttachmentStoreError::Unreadable { .. } => Some(StatusCode::BAD_REQUEST),
		refusal if refusal.exceeds_a_limit() => Some(StatusCode::PAYLOAD_TOO_LARGE),
		_ => None,
	}
}

fn unregistered(command: &str) -> Value {
	Value::String(format!("Command {command} not found"))
}
