use std::process::ExitCode;

#[cfg(not(target_os = "macos"))]
fn main() -> ExitCode {
	eprintln!("the live HTML behaviours play on macOS alone");
	ExitCode::from(2)
}

#[cfg(target_os = "macos")]
fn main() -> ExitCode {
	match macos::run() {
		Ok(()) => ExitCode::SUCCESS,
		Err(cause) => {
			eprintln!("the live HTML behaviours could not start: {cause}");
			ExitCode::FAILURE
		}
	}
}

#[cfg(target_os = "macos")]
mod scroll;

#[cfg(target_os = "macos")]
mod macos {
	use std::error::Error;
	use std::net::{Ipv4Addr, SocketAddr};
	use std::path::PathBuf;
	use std::process::Command;
	use std::sync::atomic::{AtomicUsize, Ordering};
	use std::sync::Arc;
	use std::time::Duration;

	use axum::response::Html;
	use axum::routing::get;
	use axum::Router;
	use kiroshi_app::live_html::contract::LiveHtmlRectangle;
	use kiroshi_app::live_html::server::CONTENT_DOCUMENT;
	use kiroshi_app::live_html::watch::{Guard, ReceivedRequest, ViewWatch};
	use kiroshi_app::live_html::LiveViews;
	use objc2::rc::Retained;
	use objc2::runtime::{AnyObject, Sel};
	use objc2::{msg_send, sel};
	use objc2_app_kit::{NSView, NSWindow};
	use objc2_foundation::{NSEdgeInsets, NSPoint};
	use serde::{Deserialize, Serialize};
	use serde_json::{json, Value};
	use tauri::ipc::Invoke;
	use tauri::{AppHandle, Manager, Url, Webview, WebviewWindowBuilder, Window};

	use super::scroll::{send_scroll, Gesture};

	const MAIN_WINDOW_LABEL: &str = "main";
	const MAIN_PAGE: &str = include_str!("main.html");
	const PROTOTYPE: &str = include_str!("prototype.html");
	const CAPTURES_VARIABLE: &str = "LIVE_HTML_CAPTURES";
	const NATIVE_DEPTH: usize = 3;
	const WINDOW_OCCLUSION_VISIBLE: usize = 1 << 1;
	const HOLDER_CLASS: &str = "KiroshiLiveHtmlHolder";
	const CORNER_INSET: f64 = 2.0;

	#[derive(Default)]
	struct ContentLoads(AtomicUsize);

	impl ViewWatch for ContentLoads {
		fn initialization_scripts(&self) -> Vec<String> {
			Vec::new()
		}

		fn guard_answered(&self, view: &str, guard: Guard, url: &str, is_allowed: bool) {
			println!("{view}: {} answered {is_allowed} to {url}", guard.handler());
		}

		fn request_received(&self, _view: &str, request: &ReceivedRequest<'_>) {
			if request.target.ends_with(CONTENT_DOCUMENT) {
				self.0.fetch_add(1, Ordering::SeqCst);
			}
		}
	}

	#[derive(Clone, Copy, Deserialize, Serialize)]
	struct Rectangle {
		x: f64,
		y: f64,
		width: f64,
		height: f64,
	}

	impl From<LiveHtmlRectangle> for Rectangle {
		fn from(rectangle: LiveHtmlRectangle) -> Self {
			Self {
				x: rectangle.x,
				y: rectangle.y,
				width: rectangle.width,
				height: rectangle.height,
			}
		}
	}

	struct Painted {
		magenta: Option<Rectangle>,
		cyan: Option<Rectangle>,
		blue: Option<Rectangle>,
		probed: Vec<[u8; 4]>,
		magenta_corners: Option<Vec<[u8; 4]>>,
	}

	fn window_number(window: &Window) -> Result<isize, String> {
		let handle = window.ns_window().map_err(|cause| cause.to_string())?;
		let window: *mut AnyObject = handle.cast();
		Ok(unsafe { msg_send![window, windowNumber] })
	}

	fn bounding_box(
		image: &image::RgbaImage,
		scale: f64,
		is_painted: impl Fn([u8; 4]) -> bool,
	) -> Option<Rectangle> {
		let mut found: Option<(u32, u32, u32, u32)> = None;
		for (x, y, pixel) in image.enumerate_pixels() {
			if is_painted(pixel.0) {
				let (left, top, right, bottom) = found.unwrap_or((x, y, x, y));
				found = Some((left.min(x), top.min(y), right.max(x), bottom.max(y)));
			}
		}
		found.map(|(left, top, right, bottom)| Rectangle {
			x: f64::from(left) / scale,
			y: f64::from(top) / scale,
			width: f64::from(right - left + 1) / scale,
			height: f64::from(bottom - top + 1) / scale,
		})
	}

	fn painted(path: &PathBuf, window_width: f64, probes: &[[f64; 2]]) -> Result<Painted, String> {
		let image = image::open(path).map_err(|cause| cause.to_string())?.to_rgba8();
		let scale = f64::from(image.width()) / window_width;
		let colors_at = |probes: &[[f64; 2]]| -> Result<Vec<[u8; 4]>, String> {
			probes
				.iter()
				.map(|[x, y]| {
					let pixel = |point: f64| (point * scale).round() as u32;
					image
						.get_pixel_checked(pixel(*x), pixel(*y))
						.map(|pixel| pixel.0)
						.ok_or_else(|| format!("the probe {x},{y} falls outside the capture"))
				})
				.collect()
		};
		let magenta = bounding_box(&image, scale, |[r, g, b, _]| r > 220 && g < 70 && b > 230);
		Ok(Painted {
			magenta_corners: magenta
				.as_ref()
				.and_then(inside_corners)
				.map(|corners| colors_at(&corners))
				.transpose()?,
			magenta,
			cyan: bounding_box(&image, scale, |[r, g, b, _]| r < 140 && g > 230 && b > 230),
			blue: bounding_box(&image, scale, |[r, g, b, _]| r < 70 && g < 70 && b > 200),
			probed: colors_at(probes)?,
		})
	}

	fn inside_corners(drawn: &Rectangle) -> Option<[[f64; 2]; 4]> {
		let (left, top) = (drawn.x + CORNER_INSET, drawn.y + CORNER_INSET);
		let (right, bottom) =
			(drawn.x + drawn.width - CORNER_INSET, drawn.y + drawn.height - CORNER_INSET);
		(left <= right && top <= bottom).then_some([
			[left, top],
			[right, top],
			[right, bottom],
			[left, bottom],
		])
	}

	fn native_tree(view: &NSView, depth: usize) -> Value {
		let class = view.class().name().to_string_lossy().into_owned();
		let frame = view.frame();
		let is_webview = class.contains("WKWebView");
		let children: Vec<Value> = if is_webview || depth >= NATIVE_DEPTH {
			Vec::new()
		} else {
			view.subviews().iter().map(|child| native_tree(&child, depth + 1)).collect()
		};
		let layer: *mut AnyObject = unsafe { msg_send![view, layer] };
		json!({
			"class": class,
			"frame": [frame.origin.x, frame.origin.y, frame.size.width, frame.size.height],
			"hidden": view.isHidden(),
			"alpha": view.alphaValue(),
			"wants_layer": view.wantsLayer(),
			"has_layer": !layer.is_null(),
			"children": children,
		})
	}

	fn top_insets(content: &NSView) -> Value {
		let Some(main_webview) = content
			.subviews()
			.iter()
			.find(|view| view.class().name().to_string_lossy().contains("WryWebView"))
		else {
			return Value::Null;
		};
		let responds = |selector: Sel| -> bool {
			unsafe { msg_send![&*main_webview, respondsToSelector: selector] }
		};
		let safe_area = responds(sel!(safeAreaInsets)).then(|| {
			let insets: NSEdgeInsets = unsafe { msg_send![&*main_webview, safeAreaInsets] };
			insets.top
		});
		let obscured = responds(sel!(obscuredContentInsets)).then(|| {
			let insets: NSEdgeInsets = unsafe { msg_send![&*main_webview, obscuredContentInsets] };
			insets.top
		});
		json!({
			"safe_area_insets_top": safe_area,
			"obscured_content_insets_top": obscured,
		})
	}

	fn measured_window(app: &AppHandle, window: &Window) -> Result<Value, String> {
		let scale = window.scale_factor().map_err(|cause| cause.to_string())?;
		let inner =
			window.inner_size().map_err(|cause| cause.to_string())?.to_logical::<f64>(scale);
		let webviews: Vec<Value> = window
			.webviews()
			.iter()
			.map(|webview| {
				let bounds = webview.bounds().map(|bounds| {
					let position = bounds.position.to_logical::<f64>(scale);
					let size = bounds.size.to_logical::<f64>(scale);
					[position.x, position.y, size.width, size.height]
				});
				json!({ "label": webview.label(), "tauri_bounds": bounds.map_err(|cause| cause.to_string()) })
			})
			.collect();
		let handle = window.ns_window().map_err(|cause| cause.to_string())?;
		let ns_window =
			unsafe { Retained::retain(handle.cast::<NSWindow>()) }.ok_or("no native window")?;
		let occlusion: usize = unsafe { msg_send![&*ns_window, occlusionState] };
		let main_bounds = window
			.webviews()
			.iter()
			.find(|webview| webview.label() == MAIN_WINDOW_LABEL)
			.and_then(|webview| webview.bounds().ok())
			.map(|bounds| bounds.size.to_logical::<f64>(scale));
		Ok(json!({
			"inner_size": [inner.width, inner.height],
			"main_webview_fills_the_window": main_bounds.is_some_and(|size| size.width == inner.width && size.height == inner.height),
			"window_is_visible_to_the_window_server": occlusion & WINDOW_OCCLUSION_VISIBLE != 0,
			"main_is_a_webview_window": app.get_webview_window(MAIN_WINDOW_LABEL).is_some(),
			"webviews": webviews,
			"main_webview_top_insets": ns_window.contentView().map(|view| top_insets(&view)),
			"content_view": ns_window.contentView().map(|view| native_tree(&view, 0)),
		}))
	}

	fn captured(window: &Window, step: &str, probes: &[[f64; 2]]) -> Result<Painted, String> {
		let directory = std::env::var(CAPTURES_VARIABLE)
			.map_err(|_| format!("{CAPTURES_VARIABLE} names no directory"))?;
		let path = PathBuf::from(directory).join(format!("{step}.png"));
		let number = window_number(window)?;
		let captured = Command::new("screencapture")
			.args(["-x", "-o", &format!("-l{number}")])
			.arg(&path)
			.status()
			.map_err(|cause| cause.to_string())?;
		if !captured.success() {
			return Err(format!("screencapture failed for {step}: {captured}"));
		}
		let width = window.outer_size().map_err(|cause| cause.to_string())?.width;
		let scale = window.scale_factor().map_err(|cause| cause.to_string())?;
		painted(&path, f64::from(width) / scale, probes)
	}

	#[tauri::command]
	fn capture_step(
		app: AppHandle,
		webview: Webview,
		loads: tauri::State<'_, Arc<ContentLoads>>,
		step: String,
		rectangle: Rectangle,
		clip: Option<Rectangle>,
		note: Option<Value>,
	) -> Result<Value, String> {
		let window = webview.window();
		let painted = captured(&window, &step, &[])?;
		let reading = json!({
			"step": step,
			"asked": rectangle,
			"clip": clip,
			"magenta_drawn_in_window_points": painted.magenta,
			"cyan_drawn_in_window_points": painted.cyan,
			"blue_drawn_in_window_points": painted.blue,
			"content_loads": loads.0.load(Ordering::SeqCst),
			"measured": measured_window(&app, &window)?,
			"note": note,
		});
		println!("{reading}");
		Ok(reading)
	}

	#[tauri::command]
	fn probe_colors(
		webview: Webview,
		step: String,
		probes: Vec<[f64; 2]>,
	) -> Result<Vec<[u8; 4]>, String> {
		let probed = captured(&webview.window(), &step, &probes)?.probed;
		println!("{}", json!({ "step": step, "probes": probes, "probed": probed }));
		Ok(probed)
	}

	#[derive(Deserialize)]
	#[serde(rename_all = "camelCase")]
	struct Swipe {
		step: String,
		pointer: [f64; 2],
		gesture: Gesture,
		interval_ms: u64,
		captures_at: Vec<usize>,
	}

	fn on_main_window<T: Send + 'static>(
		window: &Window,
		step: impl FnOnce(&NSWindow) -> Result<T, String> + Send + 'static,
	) -> Result<T, String> {
		let (sent, received) = std::sync::mpsc::channel();
		let on_main = window.clone();
		window
			.run_on_main_thread(move || {
				let answer = on_main
					.ns_window()
					.map_err(|cause| cause.to_string())
					.and_then(|handle| {
						unsafe { Retained::retain(handle.cast::<NSWindow>()) }
							.ok_or_else(|| "no native window".to_owned())
					})
					.and_then(|ns_window| step(&ns_window));
				if sent.send(answer).is_err() {
					eprintln!("a main window step answered after the swipe stopped waiting");
				}
			})
			.map_err(|cause| cause.to_string())?;
		received.recv().map_err(|cause| cause.to_string())?
	}

	fn holders_standing_aside(window: &NSWindow) -> Result<Vec<bool>, String> {
		let content = window.contentView().ok_or("the main window has no content view")?;
		Ok(content
			.subviews()
			.iter()
			.filter(|view| view.class().name().to_string_lossy().contains(HOLDER_CLASS))
			.map(|holder| holder.alphaValue() == 0.0)
			.collect())
	}

	#[tauri::command]
	async fn standing_aside(webview: Webview) -> Result<Vec<bool>, String> {
		on_main_window(&webview.window(), holders_standing_aside)
	}

	#[tauri::command]
	async fn swipe_while_capturing(webview: Webview, swipe: Swipe) -> Result<Value, String> {
		let window = webview.window();
		let pointer = NSPoint::new(swipe.pointer[0], swipe.pointer[1]);
		let captures = std::thread::scope(|scope| {
			let mut shots = Vec::new();
			for (index, step) in swipe.gesture.steps().into_iter().enumerate() {
				let standing_aside = on_main_window(&window, move |ns_window| {
					send_scroll(ns_window, step, pointer)?;
					holders_standing_aside(ns_window)
				})?;
				if swipe.captures_at.contains(&index) {
					let (window, name) = (&window, format!("{}-{index}", swipe.step));
					shots.push(scope.spawn(move || {
						captured(window, &name, &[]).map(|painted| {
							json!({
								"event": index,
								"holders_standing_aside": standing_aside,
								"magenta": painted.magenta,
								"cyan": painted.cyan,
								"magenta_corners": painted.magenta_corners,
							})
						})
					}));
				}
				std::thread::sleep(Duration::from_millis(swipe.interval_ms));
			}
			shots
				.into_iter()
				.map(|shot| shot.join().map_err(|_| "a capture panicked".to_owned())?)
				.collect::<Result<Vec<_>, String>>()
		})?;
		let reading = json!({ "step": swipe.step, "captures": captures });
		println!("{reading}");
		Ok(reading)
	}

	#[tauri::command]
	fn resize_window(webview: Webview, width: f64, height: f64) -> Result<(), String> {
		webview
			.window()
			.set_size(tauri::LogicalSize::new(width, height))
			.map_err(|cause| cause.to_string())
	}

	#[tauri::command]
	fn finish_run(failure: Option<String>) {
		match failure {
			Some(failure) => {
				eprintln!("the behaviours stopped: {failure}");
				std::process::exit(1);
			}
			None => std::process::exit(0),
		}
	}

	fn own_commands(invoke: Invoke<tauri::Wry>) -> bool {
		let handled: fn(Invoke<tauri::Wry>) -> bool = tauri::generate_handler![
			capture_step,
			probe_colors,
			standing_aside,
			swipe_while_capturing,
			resize_window,
			finish_run
		];
		handled(invoke)
	}

	fn main_page_server(port: u16) -> std::io::Result<()> {
		let listener = std::net::TcpListener::bind(SocketAddr::from((Ipv4Addr::LOCALHOST, port)))?;
		listener.set_nonblocking(true)?;
		let pages = Router::new()
			.route("/prototype.html", get(|| async { Html(PROTOTYPE) }))
			.fallback(|| async { Html(MAIN_PAGE) });
		tauri::async_runtime::spawn(async move {
			let served = match tokio::net::TcpListener::from_std(listener) {
				Ok(listener) => axum::serve(listener, pages).await,
				Err(cause) => Err(cause),
			};
			if let Err(cause) = served {
				eprintln!("the main page stopped being served: {cause}");
			}
		});
		Ok(())
	}

	pub fn run() -> Result<(), Box<dyn Error>> {
		let context = tauri::generate_context!();
		let port = context
			.config()
			.build
			.dev_url
			.as_ref()
			.and_then(Url::port)
			.ok_or("tauri.conf.json names no devUrl port to serve the main page on")?;
		main_page_server(port)?;
		let loads = Arc::new(ContentLoads::default());
		let watch: Arc<dyn ViewWatch> = loads.clone();
		let product_commands = kiroshi_app::commands::invoke_handler::<tauri::Wry>();
		tauri::Builder::default()
			.manage(loads)
			.manage(LiveViews::watched(watch))
			.on_page_load(kiroshi_app::live_html::remove_on_main_page_load)
			.invoke_handler(move |invoke| match invoke.message.command() {
				"capture_step"
				| "probe_colors"
				| "standing_aside"
				| "swipe_while_capturing"
				| "resize_window"
				| "finish_run" => own_commands(invoke),
				_ => product_commands(invoke),
			})
			.setup(|app| {
				let config = app
					.config()
					.app
					.windows
					.iter()
					.find(|window| window.label == MAIN_WINDOW_LABEL)
					.cloned()
					.ok_or("tauri.conf.json declares no main window")?;
				WebviewWindowBuilder::from_config(app.handle(), &config)?
					.visible(true)
					.always_on_top(true)
					.build()?;
				Ok(())
			})
			.run(context)?;
		Ok(())
	}
}
