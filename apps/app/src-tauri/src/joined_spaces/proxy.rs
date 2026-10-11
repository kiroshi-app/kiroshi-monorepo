use std::future::IntoFuture;
use std::net::Ipv4Addr;
use std::sync::Arc;

use axum::body::Bytes;
use axum::extract::rejection::BytesRejection;
use axum::extract::ws::WebSocketUpgrade;
use axum::extract::{DefaultBodyLimit, Path, Request, State};
use axum::http::{header, StatusCode};
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::Router;
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::watch;

use super::member_link::{MemberLink, Presence};
use crate::host_api::files::{AVATAR_PATH, INERT, NO_SNIFF};
use crate::host_api::invoke::{
	self, arguments, bearer_admitted, declares_more_than_the_cap, names_an_app_command, unread,
	JSON, MAX_BODY_BYTES, REFUSED, TOO_LARGE, UNAUTHORIZED, UNREADABLE, UNREGISTERED,
};
use crate::host_api::token::HostToken;
use crate::host_api::{cors, events};
use crate::hosting::bridge::{RelayedAvatar, AVATAR_COMMAND};
use crate::hosting::relay::until_stopped;
use crate::routines::webhook::named_here;

const HOST_OFFLINE: (StatusCode, &str) =
	(StatusCode::SERVICE_UNAVAILABLE, "the host of this space is offline");

const IMMUTABLE: &str = "private, max-age=31536000, immutable";

const UNREAD_AVATAR: (StatusCode, &str) =
	(StatusCode::BAD_GATEWAY, "the host relayed an avatar that could not be read");

#[derive(Clone)]
struct Proxy {
	link: Arc<MemberLink>,
	token: Arc<HostToken>,
}

pub(super) async fn served(
	link: Arc<MemberLink>,
	token: Arc<HostToken>,
	mut stop: watch::Receiver<bool>,
) -> std::io::Result<String> {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await?;
	let origin = format!("http://{}", listener.local_addr()?);
	let router = routed(Proxy { link, token });
	tauri::async_runtime::spawn(async move {
		if let Some(Err(failure)) =
			until_stopped(&mut stop, axum::serve(listener, router).into_future()).await
		{
			eprintln!("a joined space proxy stopped serving: {failure}");
		}
	});
	Ok(origin)
}

fn routed(proxy: Proxy) -> Router {
	let invokes = Router::new()
		.route(invoke::PATH, post(invoked).layer(DefaultBodyLimit::max(MAX_BODY_BYTES)))
		.route_layer(middleware::from_fn_with_state(proxy.clone(), invoke_guarded));
	let events = Router::new()
		.route(events::PATH, get(events_opened))
		.route(AVATAR_PATH, get(avatar))
		.route_layer(middleware::from_fn_with_state(proxy.clone(), events_guarded));
	invokes.merge(events).layer(middleware::from_fn(cors::shared)).with_state(proxy)
}

async fn invoke_guarded(State(proxy): State<Proxy>, request: Request, next: Next) -> Response {
	if !named_here(request.headers()) {
		return REFUSED.into_response();
	}
	if !bearer_admitted(&proxy.token, request.headers()) {
		return UNAUTHORIZED.into_response();
	}
	if declares_more_than_the_cap(request.headers()) {
		return TOO_LARGE.into_response();
	}
	next.run(request).await
}

async fn events_guarded(State(proxy): State<Proxy>, request: Request, next: Next) -> Response {
	if !named_here(request.headers()) {
		return REFUSED.into_response();
	}
	if !bearer_admitted(&proxy.token, request.headers())
		&& !events::query_admitted(&proxy.token, request.uri())
	{
		return UNAUTHORIZED.into_response();
	}
	next.run(request).await
}

async fn invoked(
	State(proxy): State<Proxy>,
	Path(command): Path<String>,
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
	if proxy.link.settled().await != Presence::Online {
		return HOST_OFFLINE.into_response();
	}
	match proxy.link.called(&command, arguments).await {
		Some(answer) => answered(answer.status, answer.body),
		None => HOST_OFFLINE.into_response(),
	}
}

fn answered(status: u16, body: Value) -> Response {
	let status = StatusCode::from_u16(status).unwrap_or(StatusCode::BAD_GATEWAY);
	match body {
		Value::String(text) if !is_json_answered(status) => (status, text).into_response(),
		body => (status, [(header::CONTENT_TYPE, JSON)], body.to_string()).into_response(),
	}
}

fn is_json_answered(status: StatusCode) -> bool {
	status.is_success() || status == StatusCode::INTERNAL_SERVER_ERROR
}

async fn avatar(State(proxy): State<Proxy>, Path(file): Path<String>) -> Response {
	if proxy.link.settled().await != Presence::Online {
		return HOST_OFFLINE.into_response();
	}
	let Some(answer) = proxy.link.called(AVATAR_COMMAND, json!({ "file": file })).await else {
		return HOST_OFFLINE.into_response();
	};
	if answer.status != StatusCode::OK.as_u16() {
		return answered(answer.status, answer.body);
	}
	let relayed = serde_json::from_value::<RelayedAvatar>(answer.body).ok();
	let Some((bytes, content_type)) =
		relayed.and_then(|relayed| Some((relayed.bytes()?, relayed.content_type)))
	else {
		eprintln!("a joined space proxy got an avatar from the host it could not read");
		return UNREAD_AVATAR.into_response();
	};
	let headers = [
		(header::CONTENT_TYPE, content_type.as_str()),
		(header::X_CONTENT_TYPE_OPTIONS, NO_SNIFF),
		(header::CONTENT_SECURITY_POLICY, INERT),
		(header::CACHE_CONTROL, IMMUTABLE),
	];
	(headers, bytes).into_response()
}

async fn events_opened(State(proxy): State<Proxy>, upgrade: WebSocketUpgrade) -> Response {
	if proxy.link.settled().await != Presence::Online {
		return HOST_OFFLINE.into_response();
	}
	let Some(heard) = proxy.link.subscribed() else {
		return HOST_OFFLINE.into_response();
	};
	upgrade
		.on_failed_upgrade(|failure| {
			eprintln!("a joined space proxy event client never connected: {failure}")
		})
		.on_upgrade(|socket| events::relayed(socket, heard))
}

#[cfg(test)]
mod tests {
	use axum::http::Method;
	use tokio::sync::mpsc;

	use super::*;

	#[test]
	fn a_text_refusal_crosses_as_text_and_a_command_answer_as_json() {
		let refusal = answered(404, Value::String("no command bears this name".to_owned()));
		let command_error = answered(500, Value::String("failed".to_owned()));
		let success = answered(200, serde_json::json!({ "a": 1 }));

		assert_eq!(refusal.status(), StatusCode::NOT_FOUND);
		assert!(refusal.headers().get(header::CONTENT_TYPE).is_some_and(|kind| kind != JSON));
		for json in [command_error, success] {
			assert_eq!(
				json.headers().get(header::CONTENT_TYPE).map(|kind| kind.as_bytes()),
				Some(JSON.as_bytes())
			);
		}
	}

	const PNG: &[u8] = b"\x89PNG\r\n\x1a\n";

	async fn a_guest_proxy(link: Arc<MemberLink>, token: Arc<HostToken>) -> String {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the proxy binds");
		let origin = format!("http://{}", listener.local_addr().expect("an address"));
		tokio::spawn(axum::serve(listener, routed(Proxy { link, token })).into_future());
		origin
	}

	fn a_host_answering_avatars(link: Arc<MemberLink>, mut sent: mpsc::Receiver<String>) {
		tokio::spawn(async move {
			while let Some(frame) = sent.recv().await {
				let frame: Value = serde_json::from_str(&frame).expect("a json frame");
				assert_eq!(frame["command"], AVATAR_COMMAND);
				let (status, body) = match frame["args"]["file"].as_str() {
					Some("held.png") => {
						(200, json!({ "contentType": "image/png", "base64": "iVBORw0KGgo=" }))
					}
					Some("broken.png") => {
						(200, json!({ "contentType": "image/png", "base64": "not base64" }))
					}
					Some("huge.png") => (413, json!("the avatar is too large to cross the relay")),
					_ => (404, json!("no avatar of the shared space bears this name")),
				};
				let answer = json!({ "id": frame["id"], "status": status, "body": body });
				link.received(&answer.to_string());
			}
		});
	}

	fn a_client() -> reqwest::Client {
		crate::missions::github::installed_tls_provider();
		reqwest::Client::new()
	}

	fn avatar_url(origin: &str, file: &str) -> String {
		format!("{origin}{}", AVATAR_PATH.replace("{file}", file))
	}

	#[tokio::test]
	async fn a_held_avatar_crosses_as_its_bytes_and_a_foreign_or_huge_one_is_refused() {
		let link = Arc::new(MemberLink::new());
		let (calls, sent) = mpsc::channel(4);
		link.opened(calls);
		a_host_answering_avatars(link.clone(), sent);
		let token = Arc::new(HostToken::random());
		let origin = a_guest_proxy(link, token.clone()).await;
		let client = a_client();

		let by_query = client
			.get(format!("{}?token={}", avatar_url(&origin, "held.png"), token.bearer()))
			.send()
			.await
			.expect("an answer");
		assert_eq!(by_query.status(), StatusCode::OK);
		assert_eq!(by_query.headers()[header::CONTENT_TYPE], "image/png");
		assert_eq!(by_query.headers()[header::X_CONTENT_TYPE_OPTIONS], NO_SNIFF);
		assert_eq!(by_query.headers()[header::CACHE_CONTROL], IMMUTABLE);
		assert_eq!(by_query.bytes().await.expect("the bytes").as_ref(), PNG);

		for (file, status) in [
			("held.png", StatusCode::OK),
			("foreign.png", StatusCode::NOT_FOUND),
			("huge.png", StatusCode::PAYLOAD_TOO_LARGE),
			("broken.png", StatusCode::BAD_GATEWAY),
		] {
			let by_bearer = client
				.get(avatar_url(&origin, file))
				.bearer_auth(token.bearer())
				.send()
				.await
				.expect("an answer");
			assert_eq!(by_bearer.status(), status, "{file}");
			let cache_control = by_bearer.headers().get(header::CACHE_CONTROL);
			assert_eq!(cache_control.is_some(), status == StatusCode::OK, "{file}");
		}
	}

	#[tokio::test]
	async fn an_avatar_asked_without_an_admitted_token_is_refused_before_the_relay() {
		let link = Arc::new(MemberLink::new());
		let (calls, mut sent) = mpsc::channel(4);
		link.opened(calls);
		let origin = a_guest_proxy(link, Arc::new(HostToken::random())).await;
		let client = a_client();

		for asked in [
			client.get(avatar_url(&origin, "held.png")),
			client.get(format!("{}?token=wrong", avatar_url(&origin, "held.png"))),
			client.get(avatar_url(&origin, "held.png")).bearer_auth("wrong"),
		] {
			let answer = asked.send().await.expect("an answer");
			assert_eq!(answer.status(), StatusCode::UNAUTHORIZED);
		}
		assert!(sent.try_recv().is_err());
	}

	#[tokio::test]
	async fn an_avatar_asked_of_an_offline_host_answers_the_offline_text() {
		let link = Arc::new(MemberLink::new());
		link.closed(Presence::Down);
		let token = Arc::new(HostToken::random());
		let origin = a_guest_proxy(link, token.clone()).await;

		let answer = a_client()
			.get(avatar_url(&origin, "held.png"))
			.bearer_auth(token.bearer())
			.send()
			.await
			.expect("an answer");

		assert_eq!(answer.status(), HOST_OFFLINE.0);
		assert_eq!(answer.text().await.expect("the text"), HOST_OFFLINE.1);
	}

	#[tokio::test]
	async fn a_preflight_from_the_packaged_window_is_allowed_before_any_token() {
		let link = Arc::new(MemberLink::new());
		let origin = a_guest_proxy(link, Arc::new(HostToken::random())).await;

		for path in
			[invoke::PATH.replace("{command}", "conversation_list"), events::PATH.to_owned()]
		{
			let answer = a_client()
				.request(Method::OPTIONS, format!("{origin}{path}"))
				.header(header::ORIGIN, cors::WINDOW_ORIGIN)
				.header(header::ACCESS_CONTROL_REQUEST_METHOD, "POST")
				.header(header::ACCESS_CONTROL_REQUEST_HEADERS, "authorization")
				.send()
				.await
				.expect("an answer");

			assert!(answer.status().is_success(), "{path}: {}", answer.status());
			let headers = answer.headers();
			assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_ORIGIN], cors::WINDOW_ORIGIN);
			assert_eq!(headers[header::ACCESS_CONTROL_ALLOW_METHODS], "GET, POST, OPTIONS");
			assert_eq!(
				headers[header::ACCESS_CONTROL_ALLOW_HEADERS],
				"Authorization, Content-Type"
			);
		}
	}

	#[tokio::test]
	async fn an_attachment_is_still_not_served_by_the_proxy() {
		let link = Arc::new(MemberLink::new());
		let (calls, mut sent) = mpsc::channel(4);
		link.opened(calls);
		let token = Arc::new(HostToken::random());
		let origin = a_guest_proxy(link, token.clone()).await;

		let answer = a_client()
			.get(format!("{origin}/api/files/attachments/c1/a.png"))
			.bearer_auth(token.bearer())
			.send()
			.await
			.expect("an answer");

		assert_eq!(answer.status(), StatusCode::NOT_FOUND);
		assert!(sent.try_recv().is_err());
	}
}
