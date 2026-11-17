use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::NSView;
use objc2_foundation::{NSEdgeInsets, NSPoint, NSRect, NSSize, NSString};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tokio::sync::oneshot;
use wry::dpi::{LogicalPosition, LogicalSize};
use wry::{NewWindowResponse, Rect, WebView, WebViewBuilder, WebViewExtMacOS};

use super::contract::{LiveHtmlError, LiveHtmlRectangle};
use super::placement::{ContentView, Frame, Placement};
use super::watch::Guard;
use super::ViewToMount;

const MAIN_THREAD_TIMEOUT: Duration = Duration::from_secs(5);
pub const HOLDER_IDENTIFIER: &str = "kiroshi-live-html-holder";

struct Shown {
	webview: WebView,
	placement: Placement,
}

thread_local! {
	static MOUNTED: RefCell<HashMap<String, Shown>> = RefCell::new(HashMap::new());
}

pub fn ensure_available() -> Result<(), LiveHtmlError> {
	Ok(())
}

pub async fn top_inset<R: Runtime>(main_window: &WebviewWindow<R>) -> Result<f64, LiveHtmlError> {
	let (answer, answered) = oneshot::channel();
	main_window
		.with_webview(move |platform| {
			let inset = unsafe { Retained::retain(platform.inner().cast::<NSView>()) }
				.ok_or_else(|| "the main webview has no native view".to_owned())
				.map(|view| page_top_inset(&view));
			if answer.send(inset).is_err() {
				log::warn!("the main webview inset was read after its deadline");
			}
		})
		.map_err(|failure| unplaced(failure.to_string()))?;
	answered_in_time(answered).await
}

pub async fn mount<R: Runtime>(
	main_window: WebviewWindow<R>,
	view: ViewToMount,
	placement: Placement,
) -> Result<(), LiveHtmlError> {
	let app = tauri::Manager::app_handle(&main_window).clone();
	on_main_thread(&app, move || {
		let marker = MainThreadMarker::new().ok_or("the native step ran off the main thread")?;
		let id = view.id.clone();
		let webview = guarded(view)
			.with_bounds(rectangle_below_the_inset(placement))
			.build_as_child(&main_window)
			.map_err(|failure| failure.to_string())?;
		place_native(&native_view_of(&webview), placement, marker)?;
		MOUNTED.with_borrow_mut(|mounted| mounted.insert(id, Shown { webview, placement }));
		Ok(())
	})
	.await
}

pub async fn place<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	placement: Placement,
) -> Result<(), LiveHtmlError> {
	on_main_thread(app, move || {
		let marker = MainThreadMarker::new().ok_or("the native step ran off the main thread")?;
		MOUNTED.with_borrow_mut(|mounted| {
			let shown = mounted.get_mut(&id).ok_or("the view holds no native webview")?;
			place_native(&native_view_of(&shown.webview), placement, marker)?;
			shown.placement = placement;
			Ok(())
		})
	})
	.await
}

pub fn replace_all<R: Runtime>(app: &AppHandle<R>) {
	let replaced = app.run_on_main_thread(|| {
		let Some(marker) = MainThreadMarker::new() else {
			log::error!("the live views were re-placed off the main thread");
			return;
		};
		MOUNTED.with_borrow(|mounted| {
			for (id, shown) in mounted {
				if let Err(failure) =
					place_native(&native_view_of(&shown.webview), shown.placement, marker)
				{
					log::error!(
						"live view {id} was not re-placed on the new pixel grid: {failure}"
					);
				}
			}
		});
	});
	if let Err(failure) = replaced {
		log::error!("the live views were not re-placed on the new pixel grid: {failure}");
	}
}

pub async fn set_drawn<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	is_drawn: bool,
) -> Result<(), LiveHtmlError> {
	on_main_thread(app, move || {
		let view = mounted_view(&id)?;
		placed_holder(&view)?.setHidden(!is_drawn);
		Ok(())
	})
	.await
}

pub async fn detach<R: Runtime>(app: &AppHandle<R>, id: String) -> Result<(), LiveHtmlError> {
	on_main_thread(app, move || {
		let Shown { webview, .. } = MOUNTED
			.with_borrow_mut(|mounted| mounted.remove(&id))
			.ok_or_else(|| "the view holds no native webview".to_owned())?;
		let holder = placed_holder(&native_view_of(&webview));
		drop(webview);
		holder?.removeFromSuperview();
		Ok(())
	})
	.await
}

pub async fn url<R: Runtime>(app: &AppHandle<R>, id: String) -> Result<String, LiveHtmlError> {
	on_main_thread(app, move || {
		MOUNTED.with_borrow(|mounted| {
			let shown = mounted.get(&id).ok_or("the view holds no native webview")?;
			shown.webview.url().map_err(|failure| failure.to_string())
		})
	})
	.await
}

pub async fn evaluate<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	script: String,
) -> Result<String, LiveHtmlError> {
	let (answer, answered) = oneshot::channel();
	let answer = Arc::new(Mutex::new(Some(answer)));
	on_main_thread(app, move || {
		MOUNTED.with_borrow(|mounted| {
			let shown = mounted.get(&id).ok_or("the view holds no native webview")?;
			shown
				.webview
				.evaluate_script_with_callback(&script, move |result| {
					let sender = answer.lock().unwrap_or_else(PoisonError::into_inner).take();
					if sender.is_some_and(|sender| sender.send(Ok(result)).is_err()) {
						log::warn!("a live view script answered after its deadline");
					}
				})
				.map_err(|failure| failure.to_string())
		})
	})
	.await?;
	answered_in_time(answered).await
}

fn guarded(view: ViewToMount) -> WebViewBuilder<'static> {
	let ViewToMount { id, url, allowed, scripts, watch } = view;
	let (navigation, new_window, download) = (Arc::clone(&watch), Arc::clone(&watch), watch);
	let (navigating, opening, downloading) = (id.clone(), id.clone(), id);
	let builder = scripts
		.into_iter()
		.fold(WebViewBuilder::new().with_url(url).with_incognito(true), |builder, script| {
			builder.with_initialization_script_for_main_only(script, false)
		});
	builder
		.with_navigation_handler(move |url| {
			let is_allowed = url.starts_with("about:") || allowed.contains(&url);
			navigation.guard_answered(&navigating, Guard::Navigation, &url, is_allowed);
			is_allowed
		})
		.with_new_window_req_handler(move |url, _features| {
			new_window.guard_answered(&opening, Guard::NewWindow, &url, false);
			NewWindowResponse::Deny
		})
		.with_download_started_handler(move |url, _destination| {
			download.guard_answered(&downloading, Guard::Download, &url, false);
			false
		})
}

fn rectangle_below_the_inset(placement: Placement) -> Rect {
	let LiveHtmlRectangle { x, y, width, height } = placement.rectangle;
	Rect {
		position: LogicalPosition::new(x, y + placement.top_inset).into(),
		size: LogicalSize::new(width, height).into(),
	}
}

async fn on_main_thread<R: Runtime, T: Send + 'static>(
	app: &AppHandle<R>,
	step: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, LiveHtmlError> {
	let (answer, answered) = oneshot::channel();
	app.run_on_main_thread(move || {
		if answer.send(step()).is_err() {
			log::warn!("a live view native step answered after its deadline");
		}
	})
	.map_err(|failure| unplaced(failure.to_string()))?;
	answered_in_time(answered).await
}

async fn answered_in_time<T>(
	answered: oneshot::Receiver<Result<T, String>>,
) -> Result<T, LiveHtmlError> {
	match tokio::time::timeout(MAIN_THREAD_TIMEOUT, answered).await {
		Ok(Ok(stepped)) => stepped.map_err(unplaced),
		Ok(Err(_)) => Err(unplaced("the main thread dropped the native step".to_owned())),
		Err(_) => Err(unplaced("the main thread did not run the native step in time".to_owned())),
	}
}

fn unplaced(detail: String) -> LiveHtmlError {
	LiveHtmlError::Unplaced { detail }
}

fn native_view_of(webview: &WebView) -> Retained<NSView> {
	unsafe { Retained::cast_unchecked::<NSView>(webview.webview()) }
}

fn mounted_view(id: &str) -> Result<Retained<NSView>, String> {
	MOUNTED
		.with_borrow(|mounted| mounted.get(id).map(|shown| native_view_of(&shown.webview)))
		.ok_or_else(|| "the view holds no native webview".to_owned())
}

fn page_top_inset(view: &NSView) -> f64 {
	let responds =
		|selector: Sel| -> bool { unsafe { msg_send![view, respondsToSelector: selector] } };
	if responds(sel!(obscuredContentInsets)) {
		let insets: NSEdgeInsets = unsafe { msg_send![view, obscuredContentInsets] };
		return insets.top;
	}
	if responds(sel!(safeAreaInsets)) {
		return view.safeAreaInsets().top;
	}
	0.0
}

fn place_native(
	view: &NSView,
	placement: Placement,
	marker: MainThreadMarker,
) -> Result<(), String> {
	let holder = holder_of(view, marker)?;
	let parent = unsafe { holder.superview() }.ok_or("the holder of the webview is in no view")?;
	let window = parent.window().ok_or("the holder of the webview is in no window")?;
	let backing_scale = window.backingScaleFactor();
	let frames = placement.frames(&ContentView {
		height: parent.bounds().size.height,
		is_flipped: parent.isFlipped(),
		backing_scale,
	});
	holder.setFrame(native_rectangle(frames.holder));
	view.setFrame(native_rectangle(frames.view));
	draw_at_backing_scale(&holder, backing_scale)?;
	draw_at_backing_scale(view, backing_scale)?;
	Ok(())
}

fn draw_at_backing_scale(view: &NSView, backing_scale: f64) -> Result<(), String> {
	let layer: *mut AnyObject = unsafe { msg_send![view, layer] };
	if layer.is_null() {
		return Err("a live view has no layer to draw at the backing scale".to_owned());
	}
	unsafe {
		let _: () = msg_send![layer, setContentsScale: backing_scale];
	}
	Ok(())
}

fn is_holder(view: &NSView) -> bool {
	let identifier: Option<Retained<NSString>> = unsafe { msg_send![view, identifier] };
	identifier.is_some_and(|identifier| identifier.to_string() == HOLDER_IDENTIFIER)
}

fn placed_holder(view: &NSView) -> Result<Retained<NSView>, String> {
	unsafe { view.superview() }
		.filter(|superview| is_holder(superview))
		.ok_or_else(|| "the webview is not in its holder".to_owned())
}

fn holder_of(view: &NSView, marker: MainThreadMarker) -> Result<Retained<NSView>, String> {
	if let Ok(holder) = placed_holder(view) {
		return Ok(holder);
	}
	let parent = unsafe { view.superview() }.ok_or("the webview is in no view")?;
	let holder = NSView::initWithFrame(NSView::alloc(marker), NSRect::ZERO);
	let identifier = NSString::from_str(HOLDER_IDENTIFIER);
	unsafe {
		let _: () = msg_send![&*holder, setIdentifier: &*identifier];
	}
	holder.setAutoresizesSubviews(false);
	holder.setWantsLayer(true);
	let clips_to_bounds: bool =
		unsafe { msg_send![&*holder, respondsToSelector: sel!(setClipsToBounds:)] };
	if clips_to_bounds {
		holder.setClipsToBounds(true);
	}
	let layer: *mut AnyObject = unsafe { msg_send![&*holder, layer] };
	if layer.is_null() {
		return Err("the holder of the webview has no layer to clip with".to_owned());
	}
	unsafe {
		let _: () = msg_send![layer, setMasksToBounds: true];
	}
	parent.addSubview(&holder);
	holder.addSubview(view);
	Ok(holder)
}

fn native_rectangle(frame: Frame) -> NSRect {
	NSRect::new(NSPoint::new(frame.x, frame.y), NSSize::new(frame.width, frame.height))
}
