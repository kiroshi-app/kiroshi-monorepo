use std::sync::Arc;

use tauri::http::header::{HeaderValue, CONTENT_SECURITY_POLICY};
use tauri::webview::{DownloadEvent, NewWindowResponse};
use tauri::{AppHandle, Url, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::host::{HandlerEvent, HostState};
use crate::probe;
use crate::Mode;

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const FIRST_VIEW_LABEL: &str = "view-1";

const FRAME_DIRECTIVE: &str = "frame-src";
const WINDOW_WIDTH: f64 = 560.0;
const WINDOW_HEIGHT: f64 = 420.0;
const WINDOW_TOP: f64 = 60.0;
const MAIN_WINDOW_LEFT: f64 = 40.0;
const VIEW_WINDOW_LEFT: f64 = 640.0;

#[derive(Clone, Copy, PartialEq)]
enum Surface {
	Main,
	View,
}

fn is_app_url(url: &Url) -> bool {
	url.scheme() == "tauri" || url.host_str() == Some("tauri.localhost")
}

fn with_frame_source(policy: &str, origin: &str) -> String {
	let frame_source = format!("{FRAME_DIRECTIVE} {origin}");
	policy
		.split(';')
		.map(str::trim)
		.filter(|directive| !directive.is_empty() && !directive.starts_with(FRAME_DIRECTIVE))
		.chain(std::iter::once(frame_source.as_str()))
		.collect::<Vec<_>>()
		.join("; ")
}

fn guarded<'a>(
	builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
	host: &Arc<HostState>,
	label: &str,
	surface: Surface,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
	let record = |handler: &'static str| {
		let host = Arc::clone(host);
		let window = label.to_owned();
		move |url: &Url, allowed: bool| {
			host.record_handler_event(HandlerEvent {
				handler,
				window: window.clone(),
				url: url.to_string(),
				allowed,
			});
		}
	};
	let (navigation_host, record_navigation) = (Arc::clone(host), record("on_navigation"));
	let record_new_window = record("on_new_window");
	let record_download = record("on_download");
	builder
		.on_navigation(move |url| {
			let allowed = url.scheme() == "about"
				|| navigation_host.view().urls.iter().any(|allowed| allowed == url.as_str())
				|| (surface == Surface::Main && is_app_url(url));
			record_navigation(url, allowed);
			allowed
		})
		.on_new_window(move |url, _features| {
			record_new_window(&url, false);
			NewWindowResponse::Deny
		})
		.on_download(move |_webview, event| {
			if let DownloadEvent::Requested { url, .. } = event {
				record_download(&url, false);
				return false;
			}
			true
		})
}

pub fn open_main_window(app: &AppHandle, host: &Arc<HostState>) -> tauri::Result<WebviewWindow> {
	let csp_host = Arc::clone(host);
	let builder =
		WebviewWindowBuilder::new(app, MAIN_WINDOW_LABEL, WebviewUrl::App("index.html".into()))
			.title("OPE-2298 main window")
			.position(MAIN_WINDOW_LEFT, WINDOW_TOP)
			.inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
			.always_on_top(true)
			.initialization_script_for_all_frames(probe::TRACER)
			.on_web_resource_request(move |_request, response| {
				let Some(header) = response.headers_mut().get_mut(CONTENT_SECURITY_POLICY) else {
					return;
				};
				let rewritten = match header.to_str() {
					Ok(policy) => with_frame_source(policy, &csp_host.view().origin),
					Err(cause) => return eprintln!("the main window CSP is not readable: {cause}"),
				};
				match HeaderValue::from_str(&rewritten) {
					Ok(value) => {
						*header = value;
						csp_host.record_main_window_csp(rewritten);
					}
					Err(cause) => eprintln!("the main window CSP could not be rewritten: {cause}"),
				}
			});
	guarded(builder, host, MAIN_WINDOW_LABEL, Surface::Main).build()
}

pub fn open_view_window(
	app: &AppHandle,
	host: &Arc<HostState>,
	mode: Mode,
	label: &str,
	url: Url,
) -> tauri::Result<WebviewWindow> {
	let builder = WebviewWindowBuilder::new(app, label, WebviewUrl::External(url))
		.title("OPE-2298 hostile view")
		.position(VIEW_WINDOW_LEFT, WINDOW_TOP)
		.inner_size(WINDOW_WIDTH, WINDOW_HEIGHT)
		.always_on_top(true)
		.initialization_script_for_all_frames(probe::TRACER)
		.incognito(mode.isolates_view_storage());
	let builder = if mode.frames_view_documents() {
		builder.initialization_script_for_all_frames(probe::frame_responder())
	} else {
		builder
	};
	guarded(builder, host, label, Surface::View).build()
}
