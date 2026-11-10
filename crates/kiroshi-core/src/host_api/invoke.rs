use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::{DefaultBodyLimit, Path, Request, State};
use axum::http::{header, HeaderMap, HeaderName, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{post, MethodRouter};
use axum::Router;
use serde_json::{Map, Value};

use super::token::HostToken;
use crate::core_context::Core;
use crate::hosting::caller::Caller;
use crate::invoke::dispatch_as;
use crate::routines::webhook::{named_here, Calls};

pub const PATH: &str = "/api/invoke/{command}";

pub const MAX_BODY_BYTES: usize = 128 * 1024 * 1024;

pub const RELAYED_MEMBER_HEADER: HeaderName = HeaderName::from_static("kiroshi-relayed-member");

const BEARER: &str = "Bearer ";

pub const JSON: &str = "application/json";

pub const BYTES: &str = "application/octet-stream";

pub const REFUSED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no host api answers this call");

pub const UNAUTHORIZED: (StatusCode, &str) =
	(StatusCode::UNAUTHORIZED, "the call carried no valid bearer token");

pub const UNREGISTERED: (StatusCode, &str) = (StatusCode::NOT_FOUND, "no command bears this name");

pub const TOO_LARGE: (StatusCode, &str) =
	(StatusCode::PAYLOAD_TOO_LARGE, "the call carried more than the cap");

pub const UNREADABLE: (StatusCode, &str) =
	(StatusCode::BAD_REQUEST, "the call carried no readable JSON arguments");

pub fn route(calls: Calls) -> Router<Calls> {
	guarded_route(calls, post(answering))
}

pub fn guarded_route(calls: Calls, answering: MethodRouter<Calls>) -> Router<Calls> {
	Router::new()
		.route(PATH, answering.layer(DefaultBodyLimit::max(MAX_BODY_BYTES)))
		.route_layer(middleware::from_fn_with_state(calls, guarded))
}

async fn answering(
	State(calls): State<Calls>,
	Path(command): Path<String>,
	headers: HeaderMap,
	body: Result<Bytes, BytesRejection>,
) -> Response {
	match called_arguments(&command, body) {
		Ok(arguments) => answered(&calls.core, &command, &headers, arguments).await,
		Err(refused) => refused.into_response(),
	}
}

pub fn called_arguments(
	command: &str,
	body: Result<Bytes, BytesRejection>,
) -> Result<Value, (StatusCode, &'static str)> {
	if !names_an_app_command(command) {
		return Err(UNREGISTERED);
	}
	let body = body.map_err(unread)?;
	arguments(&body).ok_or(UNREADABLE)
}

pub async fn answered(
	core: &Core,
	command: &str,
	headers: &HeaderMap,
	arguments: Value,
) -> Response {
	match dispatch_as(core, Caller::of(core, headers), command, arguments).await {
		Some(answer) => answer.into_http(command),
		None => UNREGISTERED.into_response(),
	}
}

pub async fn guarded(State(calls): State<Calls>, request: Request, next: Next) -> Response {
	if !named_here(request.headers()) {
		return REFUSED.into_response();
	}
	if !authorized(&calls, request.headers()) {
		return UNAUTHORIZED.into_response();
	}
	if declares_more_than_the_cap(request.headers()) {
		return TOO_LARGE.into_response();
	}
	next.run(request).await
}

pub fn declares_more_than_the_cap(headers: &HeaderMap) -> bool {
	headers
		.get(header::CONTENT_LENGTH)
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.parse::<usize>().ok())
		.is_some_and(|declared| declared > MAX_BODY_BYTES)
}

pub fn authorized(calls: &Calls, headers: &HeaderMap) -> bool {
	calls.token.as_ref().is_some_and(|token| bearer_admitted(token, headers))
}

pub fn bearer_admitted(token: &HostToken, headers: &HeaderMap) -> bool {
	headers
		.get(header::AUTHORIZATION)
		.and_then(|value| value.to_str().ok())
		.and_then(|value| value.strip_prefix(BEARER))
		.is_some_and(|presented| token.admits(presented))
}

pub fn names_an_app_command(command: &str) -> bool {
	!command.is_empty()
		&& command
			.bytes()
			.all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'_')
}

pub fn arguments(body: &[u8]) -> Option<Value> {
	if body.is_empty() {
		return Some(Value::Object(Map::new()));
	}
	serde_json::from_slice(body).ok()
}

pub fn unread(rejection: BytesRejection) -> (StatusCode, &'static str) {
	match rejection.status() {
		StatusCode::PAYLOAD_TOO_LARGE => TOO_LARGE,
		_ => UNREADABLE,
	}
}
