use std::net::{Ipv4Addr, SocketAddr, TcpListener as StandardListener};
use std::sync::Arc;

use axum::body::to_bytes;
use axum::extract::{Request, State};
use axum::http::{header, Method, StatusCode};
use axum::response::{IntoResponse, Response};
use axum::Router;
use tokio::net::TcpListener;
use tokio::sync::watch as signal;

use super::attachment::AttachedPage;
use super::base;
use super::contract::{LiveHtmlError, LiveHtmlTheme};
use super::watch::{ReceivedRequest, ViewWatch};

pub const ALLOWED_HOSTS: [&str; 1] = ["cdn.jsdelivr.net"];
pub const WRAPPER_DOCUMENT: &str = "view.html";
pub const CONTENT_DOCUMENT: &str = "content.html";
const REPORT_ROUTE: &str = "csp-report";
const MAX_BODY_BYTES: usize = 64 * 1024;
const WRAPPER_CSP: &str = "default-src 'none'; frame-src 'self'; style-src 'unsafe-inline'";
const WRAPPER_HTML: &str = r#"<!doctype html>
<html lang="en">
	<head>
		<meta charset="utf-8" />
		<style>
			html, body, iframe { margin: 0; padding: 0; border: 0; width: 100%; height: 100%; display: block; overflow: hidden; }
		</style>
	</head>
	<body>
		<iframe src="content.html" title="live view"></iframe>
	</body>
</html>
"#;

pub enum Page {
	Written(String),
	Attached(AttachedPage),
}

pub struct ContentServer {
	address: SocketAddr,
	token: String,
	theme: signal::Sender<Option<LiveHtmlTheme>>,
	content_failure: signal::Receiver<Option<LiveHtmlError>>,
	stop: signal::Sender<bool>,
}

struct Served {
	view: String,
	token: String,
	page: Page,
	theme: signal::Receiver<Option<LiveHtmlTheme>>,
	content_failure: signal::Sender<Option<LiveHtmlError>>,
	csp: String,
	watch: Arc<dyn ViewWatch>,
}

impl ContentServer {
	pub fn open(
		view: &str,
		page: Page,
		theme: Option<LiveHtmlTheme>,
		watch: Arc<dyn ViewWatch>,
	) -> std::io::Result<Self> {
		let listener = StandardListener::bind((Ipv4Addr::LOCALHOST, 0))?;
		listener.set_nonblocking(true)?;
		let address = listener.local_addr()?;
		let token = uuid::Uuid::new_v4().simple().to_string();
		let (stop, halted) = signal::channel(false);
		let (theme, shown_theme) = signal::channel(theme);
		let (failed_content, content_failure) = signal::channel(None);
		let served = Served {
			view: view.to_owned(),
			csp: content_csp(&token),
			token: token.clone(),
			page,
			theme: shown_theme,
			content_failure: failed_content,
			watch,
		};
		tauri::async_runtime::spawn(answering(Arc::new(served), listener, halted));
		Ok(Self { address, token, theme, content_failure, stop })
	}

	pub fn content_failure(&self) -> Option<LiveHtmlError> {
		self.content_failure.borrow().clone()
	}

	pub fn retheme(&self, theme: LiveHtmlTheme) {
		self.theme.send_replace(Some(theme));
	}

	pub fn wrapper_url(&self) -> String {
		self.url_of(WRAPPER_DOCUMENT)
	}

	pub fn content_url(&self) -> String {
		self.url_of(CONTENT_DOCUMENT)
	}

	fn url_of(&self, document: &str) -> String {
		format!("http://{}/{}/{document}", self.address, self.token)
	}
}

impl Drop for ContentServer {
	fn drop(&mut self) {
		self.stop.send_replace(true);
	}
}

fn content_csp(token: &str) -> String {
	let hosts = ALLOWED_HOSTS.map(|host| format!("https://{host}")).join(" ");
	format!(
		"default-src 'none'; script-src 'unsafe-inline' {hosts}; style-src 'unsafe-inline' {hosts}; img-src 'self' data: {hosts}; font-src {hosts}; connect-src {hosts}; form-action 'none'; base-uri 'none'; sandbox allow-scripts; report-uri /{token}/{REPORT_ROUTE}"
	)
}

async fn answering(
	served: Arc<Served>,
	listener: StandardListener,
	halted: signal::Receiver<bool>,
) {
	let view = served.view.clone();
	let listener = match TcpListener::from_std(listener) {
		Ok(listener) => listener,
		Err(failure) => {
			return log::error!("live view {view}: the server kept no socket: {failure}")
		}
	};
	let routes = Router::new().fallback(answer).with_state(served);
	let answered = axum::serve(listener, routes).with_graceful_shutdown(stopping(halted)).await;
	if let Err(failure) = answered {
		log::error!("live view {view}: the server stopped answering: {failure}");
	}
}

async fn stopping(mut halted: signal::Receiver<bool>) {
	if halted.wait_for(|is_halted| *is_halted).await.is_err() {
		log::warn!("a live view server lost the signal that stops it");
	}
}

async fn answer(State(served): State<Arc<Served>>, request: Request) -> Response {
	let (parts, body) = request.into_parts();
	let Ok(body) = to_bytes(body, MAX_BODY_BYTES).await else {
		return StatusCode::PAYLOAD_TOO_LARGE.into_response();
	};
	let body = String::from_utf8_lossy(&body);
	let target = parts.uri.path_and_query().map_or("/", |target| target.as_str());
	let cookie = parts.headers.get(header::COOKIE).and_then(|value| value.to_str().ok());
	served.watch.request_received(
		&served.view,
		&ReceivedRequest { method: parts.method.as_str(), target, cookie, body: &body },
	);
	let route = parts
		.uri
		.path()
		.strip_prefix('/')
		.and_then(|path| path.strip_prefix(served.token.as_str()))
		.and_then(|path| path.strip_prefix('/'));
	match (parts.method, route) {
		(Method::GET, Some(WRAPPER_DOCUMENT)) => document(
			WRAPPER_HTML.to_owned(),
			format!("{WRAPPER_CSP}; report-uri /{}/{REPORT_ROUTE}", served.token),
		),
		(Method::GET, Some(CONTENT_DOCUMENT)) => content(served).await,
		(Method::POST, Some(REPORT_ROUTE)) => StatusCode::NO_CONTENT.into_response(),
		_ => StatusCode::NOT_FOUND.into_response(),
	}
}

async fn content(served: Arc<Served>) -> Response {
	let reading = Arc::clone(&served);
	let laid = tokio::task::spawn_blocking(move || {
		let theme = *reading.theme.borrow();
		match &reading.page {
			Page::Written(html) => Ok(base::laid_under(html, theme)),
			Page::Attached(page) => page.read().map(|html| base::laid_under(&html, theme)),
		}
	})
	.await
	.unwrap_or_else(|failure| Err(LiveHtmlError::Unreadable { detail: failure.to_string() }));
	served.content_failure.send_replace(laid.as_ref().err().cloned());
	match laid {
		Ok(html) => document(html, served.csp.clone()),
		Err(failure) => {
			log::warn!("live view {}: its page was not served: {failure:?}", served.view);
			StatusCode::INTERNAL_SERVER_ERROR.into_response()
		}
	}
}

fn document(html: String, csp: String) -> Response {
	(
		[
			(header::CONTENT_TYPE, "text/html; charset=utf-8".to_owned()),
			(header::CONTENT_SECURITY_POLICY, csp),
			(header::CACHE_CONTROL, "no-store".to_owned()),
		],
		html,
	)
		.into_response()
}

pub(crate) fn reported_directive(request: &ReceivedRequest<'_>) -> Option<String> {
	if request.method != Method::POST.as_str() || !request.target.ends_with(REPORT_ROUTE) {
		return None;
	}
	let report: serde_json::Value = serde_json::from_str(request.body).ok()?;
	let report = report.get("csp-report")?;
	["effective-directive", "violated-directive"]
		.iter()
		.find_map(|field| report.get(field)?.as_str())
		.map(str::to_owned)
}

#[cfg(test)]
pub(super) mod tests;
