use axum::extract::Request;
use axum::http::{header, HeaderMap, HeaderValue, Method, StatusCode};
use axum::middleware::Next;
use axum::response::{IntoResponse, Response};

pub const WEB_ORIGIN: &str = "http://127.0.0.1:1420";

pub const WINDOW_ORIGIN: &str = if cfg!(any(windows, target_os = "android")) {
	"http://tauri.localhost"
} else {
	"tauri://localhost"
};

pub const ACCEPTED_ORIGINS: [&str; 3] = [WEB_ORIGIN, "http://localhost:1420", WINDOW_ORIGIN];

const API_PREFIX: &str = "/api/";

const ALLOWED_METHODS: &str = "GET, POST, OPTIONS";

const ALLOWED_HEADERS: &str = "Authorization, Content-Type";

pub(crate) async fn shared(request: Request, next: Next) -> Response {
	let Some(origin) = accepted_origin(&request) else {
		return next.run(request).await;
	};
	if request.method() == Method::OPTIONS {
		return preflight(origin);
	}
	let mut response = next.run(request).await;
	allow(response.headers_mut(), origin);
	response
}

fn accepted_origin(request: &Request) -> Option<HeaderValue> {
	if !request.uri().path().starts_with(API_PREFIX) {
		return None;
	}
	let origin = request.headers().get(header::ORIGIN)?;
	ACCEPTED_ORIGINS.contains(&origin.to_str().ok()?).then(|| origin.clone())
}

fn preflight(origin: HeaderValue) -> Response {
	let mut response = StatusCode::NO_CONTENT.into_response();
	let headers = response.headers_mut();
	allow(headers, origin);
	headers.insert(header::ACCESS_CONTROL_ALLOW_METHODS, HeaderValue::from_static(ALLOWED_METHODS));
	headers.insert(header::ACCESS_CONTROL_ALLOW_HEADERS, HeaderValue::from_static(ALLOWED_HEADERS));
	response
}

fn allow(headers: &mut HeaderMap, origin: HeaderValue) {
	headers.insert(header::ACCESS_CONTROL_ALLOW_ORIGIN, origin);
	headers.append(header::VARY, HeaderValue::from_static("Origin"));
}
