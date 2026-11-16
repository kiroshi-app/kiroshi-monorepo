use std::sync::Arc;

use tauri::http::header::{HeaderValue, CONTENT_SECURITY_POLICY};
use tauri::webview::{DownloadEvent, NewWindowResponse, WebviewBuilder};
use tauri::{
	AppHandle, LogicalPosition, LogicalSize, Url, Webview, WebviewUrl, WebviewWindow,
	WebviewWindowBuilder,
};

use crate::host::{HandlerEvent, HostState};
use crate::placement::Rectangle;
use crate::probe;
use crate::Mode;

pub const MAIN_WINDOW_LABEL: &str = "main";
pub const FIRST_VIEW_LABEL: &str = "view-1";

const FRAME_DIRECTIVE: &str = "frame-src";
pub const WINDOW_WIDTH: f64 = 560.0;
pub const WINDOW_HEIGHT: f64 = 420.0;
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

struct Guards {
	host: Arc<HostState>,
	label: String,
	surface: Surface,
}

impl Guards {
	fn new(host: &Arc<HostState>, label: &str, surface: Surface) -> Arc<Self> {
		Arc::new(Self { host: Arc::clone(host), label: label.to_owned(), surface })
	}

	fn record(&self, handler: &'static str, url: &Url, allowed: bool) {
		self.host.record_handler_event(HandlerEvent {
			handler,
			window: self.label.clone(),
			url: url.to_string(),
			allowed,
		});
	}

	fn allows_navigation(&self, url: &Url) -> bool {
		let allowed = url.scheme() == "about"
			|| self.host.view().urls.iter().any(|allowed| allowed == url.as_str())
			|| (self.surface == Surface::Main && is_app_url(url));
		self.record("on_navigation", url, allowed);
		allowed
	}

	fn denies_new_window<R: tauri::Runtime>(&self, url: &Url) -> NewWindowResponse<R> {
		self.record("on_new_window", url, false);
		NewWindowResponse::Deny
	}

	fn allows_download(&self, event: DownloadEvent<'_>) -> bool {
		if let DownloadEvent::Requested { url, .. } = event {
			self.record("on_download", &url, false);
			return false;
		}
		true
	}
}

fn guarded_window<'a>(
	builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
	guards: Arc<Guards>,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
	let (navigation, new_window, download) = (Arc::clone(&guards), Arc::clone(&guards), guards);
	builder
		.on_navigation(move |url| navigation.allows_navigation(url))
		.on_new_window(move |url, _features| new_window.denies_new_window(&url))
		.on_download(move |_webview, event| download.allows_download(event))
}

fn guarded_child(
	builder: WebviewBuilder<tauri::Wry>,
	guards: Arc<Guards>,
) -> WebviewBuilder<tauri::Wry> {
	let (navigation, new_window, download) = (Arc::clone(&guards), Arc::clone(&guards), guards);
	builder
		.on_navigation(move |url| navigation.allows_navigation(url))
		.on_new_window(move |url, _features| new_window.denies_new_window(&url))
		.on_download(move |_webview, event| download.allows_download(event))
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
			.initialization_script_for_all_frames(probe::INPUT_RECORDER)
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
	guarded_window(builder, Guards::new(host, MAIN_WINDOW_LABEL, Surface::Main)).build()
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
	guarded_window(builder, Guards::new(host, label, Surface::View)).build()
}

pub fn open_view_child(
	main_window: &WebviewWindow,
	host: &Arc<HostState>,
	mode: Mode,
	label: &str,
	url: Url,
	slot: Rectangle,
) -> tauri::Result<Webview> {
	let builder = WebviewBuilder::new(label, WebviewUrl::External(url))
		.initialization_script_for_all_frames(probe::TRACER)
		.initialization_script_for_all_frames(probe::frame_responder())
		.initialization_script_for_all_frames(probe::INPUT_RECORDER)
		.incognito(mode.isolates_view_storage());
	let main_webview: &Webview = main_window.as_ref();
	main_webview.window().add_child(
		guarded_child(builder, Guards::new(host, label, Surface::View)),
		LogicalPosition::new(slot.x, slot.y),
		LogicalSize::new(slot.width, slot.height),
	)
}

#[cfg(target_os = "linux")]
pub fn open_blank_child(
	main_window: &WebviewWindow,
	label: &str,
	url: &str,
	slot: Rectangle,
) -> tauri::Result<Webview> {
	let url = url.parse::<Url>().map_err(|cause| tauri::Error::InvalidUrl(cause))?;
	let main_webview: &Webview = main_window.as_ref();
	main_webview.window().add_child(
		WebviewBuilder::new(label, WebviewUrl::External(url)),
		LogicalPosition::new(slot.x, slot.y),
		LogicalSize::new(slot.width, slot.height),
	)
}
