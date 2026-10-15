use axum::extract::ws::{close_code, CloseFrame, Message, WebSocket, WebSocketUpgrade};
use axum::extract::{Request, State};
use axum::http::Uri;
use axum::middleware::{self, Next};
use axum::response::{IntoResponse, Response};
use axum::routing::get;
use axum::Router;
use std::time::Duration;

use tauri::Runtime;
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;
use tokio::time::{error::Elapsed, timeout};

use super::invoke::{self, REFUSED, UNAUTHORIZED};
use super::token::HostToken;
use crate::agent::commands::subscribed_with_pending_questions;
use crate::events::Frame;
use crate::routines::webhook::{named_here, Calls};

pub const PATH: &str = "/api/events";

const TOKEN_PARAMETER: &str = "token=";

pub(crate) const FELL_BEHIND: &str = "the client fell behind the event buffer";

pub const SEND_PATIENCE: Duration = Duration::from_secs(5);

pub(crate) fn route<R: Runtime>(calls: Calls<R>) -> Router<Calls<R>> {
	Router::new()
		.route(PATH, get(opened::<R>))
		.route_layer(middleware::from_fn_with_state(calls, guarded::<R>))
}

pub(crate) async fn guarded<R: Runtime>(
	State(calls): State<Calls<R>>,
	request: Request,
	next: Next,
) -> Response {
	if !named_here(request.headers()) {
		return REFUSED.into_response();
	}
	if !invoke::authorized(&calls, request.headers())
		&& !queried_token_admitted(&calls, request.uri())
	{
		return UNAUTHORIZED.into_response();
	}
	next.run(request).await
}

fn queried_token_admitted<R: Runtime>(calls: &Calls<R>, uri: &Uri) -> bool {
	calls.token.as_ref().is_some_and(|token| query_admitted(token, uri))
}

pub(crate) fn query_admitted(token: &HostToken, uri: &Uri) -> bool {
	uri.query()
		.and_then(|query| query.split('&').find_map(|pair| pair.strip_prefix(TOKEN_PARAMETER)))
		.is_some_and(|presented| token.admits(presented))
}

async fn opened<R: Runtime>(State(calls): State<Calls<R>>, upgrade: WebSocketUpgrade) -> Response {
	let (pending, heard) = subscribed_with_pending_questions(&calls.app);
	upgrade
		.on_failed_upgrade(|failure| {
			eprintln!("a host api event client never connected: {failure}")
		})
		.on_upgrade(|socket| caught_up_then_relayed(socket, pending, heard))
}

async fn caught_up_then_relayed(
	mut socket: WebSocket,
	pending: Vec<Frame>,
	heard: Receiver<Frame>,
) {
	for frame in pending {
		if !delivered(&mut socket, &frame).await {
			return;
		}
	}
	relayed(socket, heard).await
}

async fn relayed(socket: WebSocket, mut heard: Receiver<Frame>) {
	if let Some((socket, missed)) = relayed_until_behind(socket, &mut heard).await {
		fell_behind(socket, missed).await;
	}
}

pub(crate) async fn relayed_until_behind(
	mut socket: WebSocket,
	heard: &mut Receiver<Frame>,
) -> Option<(WebSocket, u64)> {
	loop {
		tokio::select! {
			frame = heard.recv() => match frame {
				Ok(frame) => {
					if !delivered(&mut socket, &frame).await {
						return None;
					}
				}
				Err(RecvError::Lagged(missed)) => return Some((socket, missed)),
				Err(RecvError::Closed) => return None,
			},
			sent = socket.recv() => {
				if !keeps_listening(sent) {
					return None;
				}
			}
		}
	}
}

async fn delivered(socket: &mut WebSocket, frame: &Frame) -> bool {
	match sent_in_time(socket, Message::Text(frame.as_ref().into())).await {
		Ok(Ok(())) => true,
		Ok(Err(failure)) => {
			eprintln!("a host api event client left mid frame: {failure}");
			false
		}
		Err(_) => {
			eprintln!(
				"a host api event client was dropped: it stalled on a frame for {SEND_PATIENCE:?}"
			);
			false
		}
	}
}

fn keeps_listening(sent: Option<Result<Message, axum::Error>>) -> bool {
	match sent {
		None | Some(Ok(Message::Close(_))) => false,
		Some(Ok(_)) => true,
		Some(Err(failure)) => {
			eprintln!("a host api event client was dropped: its socket failed: {failure}");
			false
		}
	}
}

async fn fell_behind(mut socket: WebSocket, missed: u64) {
	let close = CloseFrame { code: close_code::AGAIN, reason: FELL_BEHIND.into() };
	match sent_in_time(&mut socket, Message::Close(Some(close))).await {
		Ok(Ok(())) => eprintln!("a host api event client was dropped: it fell {missed} events behind"),
		Ok(Err(failure)) => eprintln!(
			"a host api event client was dropped: it fell {missed} events behind, and took no close frame: {failure}"
		),
		Err(_) => eprintln!(
			"a host api event client was dropped: it fell {missed} events behind, and stalled on the close frame"
		),
	}
}

async fn sent_in_time(
	socket: &mut WebSocket,
	message: Message,
) -> Result<Result<(), axum::Error>, Elapsed> {
	timeout(SEND_PATIENCE, socket.send(message)).await
}
