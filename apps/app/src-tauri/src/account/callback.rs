use std::future::{Future, IntoFuture};
use std::sync::Arc;

use axum::extract::State;
use axum::http::{StatusCode, Uri};
use axum::response::Html;
use axum::routing::get;
use axum::Router;
use reqwest::Url;
use tokio::net::TcpListener;
use tokio::sync::Notify;

pub const CALLBACK_PATH: &str = "/callback";

const NONCE_BYTES: usize = 32;

const BACK_TO_KIROSHI_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Kiroshi</title></head><body><p>You can close this tab and go back to Kiroshi.</p></body></html>";

const REFUSED_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Kiroshi</title></head><body><p>This sign-in did not come from Kiroshi. Go back to Kiroshi and sign in again.</p></body></html>";

pub fn nonce() -> Result<String, getrandom::Error> {
	let mut bytes = [0u8; NONCE_BYTES];
	getrandom::fill(&mut bytes)?;
	Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

pub fn callback_url(port: u16, nonce: &str) -> String {
	format!("http://127.0.0.1:{port}{CALLBACK_PATH}?state={nonce}")
}

pub async fn served_while<T>(
	listener: TcpListener,
	nonce: String,
	called: Arc<Notify>,
	work: impl Future<Output = T>,
) -> T {
	let expecting = Expecting { nonce: Arc::from(nonce), called };
	let router = Router::new().route(CALLBACK_PATH, get(answered)).with_state(expecting);
	let stop = Arc::new(Notify::new());
	let stopped = Arc::clone(&stop);
	let serving = axum::serve(listener, router)
		.with_graceful_shutdown(async move { stopped.notified().await })
		.into_future();
	let working = async move {
		let worked = work.await;
		stop.notify_one();
		worked
	};
	let (served, worked) = tokio::join!(serving, working);
	if let Err(error) = served {
		eprintln!("the account callback listener stopped on an error: {error}");
	}
	worked
}

#[derive(Clone)]
struct Expecting {
	nonce: Arc<str>,
	called: Arc<Notify>,
}

fn state_of(uri: &Uri) -> Option<String> {
	let url = Url::parse(&format!("http://127.0.0.1{uri}")).ok()?;
	url.query_pairs().find(|(key, _)| key == "state").map(|(_, value)| value.into_owned())
}

async fn answered(
	State(expecting): State<Expecting>,
	uri: Uri,
) -> (StatusCode, Html<&'static str>) {
	if state_of(&uri).as_deref() != Some(&*expecting.nonce) {
		return (StatusCode::BAD_REQUEST, Html(REFUSED_PAGE));
	}
	expecting.called.notify_one();
	(StatusCode::OK, Html(BACK_TO_KIROSHI_PAGE))
}
