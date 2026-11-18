use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::ffi::c_void;
use std::ptr::NonNull;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use block2::RcBlock;
use objc2::encode::{Encoding, RefEncode};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{class, define_class, msg_send, sel, ClassType, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSEvent, NSEventMask, NSEventType, NSView};
use objc2_foundation::{NSEdgeInsets, NSPoint, NSRect, NSSize, NSString};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tokio::sync::oneshot;
use wry::dpi::{LogicalPosition, LogicalSize};
use wry::http::Request;
use wry::{NewWindowResponse, Rect, WebView, WebViewBuilder, WebViewExtMacOS};

use super::base;
use super::contract::{LiveHtmlCorners, LiveHtmlError, LiveHtmlMeasured, LiveHtmlRectangle};
use super::measure::{self, PageSize, SizeReport};
use super::placement::{ContentView, Frame, Placement};
use super::watch::Guard;
use super::ViewToMount;
use crate::events;

const MAIN_THREAD_TIMEOUT: Duration = Duration::from_secs(5);
const NATIVE_STEP: Deadline = Deadline {
	limit: MAIN_THREAD_TIMEOUT,
	dropped: "the main thread dropped the native step",
	missed: "the main thread did not run the native step in time",
};
const SCRIPT_ANSWER: Deadline = Deadline {
	limit: Duration::from_secs(30),
	dropped: "the view dropped the script before answering it",
	missed: "the view did not answer the script in time",
};
const STILL_ANSWER: Deadline = Deadline {
	limit: MAIN_THREAD_TIMEOUT,
	dropped: "the view dropped its still before handing it",
	missed: "the view did not hand its still in time",
};
const REST_AFTER_THE_LAST_MOVE: Duration = Duration::from_millis(150);
const PNG_FILE_TYPE: usize = 4;
pub const HOLDER_IDENTIFIER: &str = "kiroshi-live-html-holder";
pub const EVENTS_FOR_THE_MAIN_WEBVIEW: [NSEventType; 6] = [
	NSEventType::ScrollWheel,
	NSEventType::Magnify,
	NSEventType::SmartMagnify,
	NSEventType::Rotate,
	NSEventType::BeginGesture,
	NSEventType::EndGesture,
];

define_class!(
	#[unsafe(super(NSView))]
	#[thread_kind = MainThreadOnly]
	#[name = "KiroshiLiveHtmlHolder"]
	struct Holder;

	impl Holder {
		#[unsafe(method_id(hitTest:))]
		fn hit_test(&self, point: NSPoint) -> Option<Retained<NSView>> {
			if is_for_the_main_webview(self.mtm()) {
				None
			} else {
				unsafe { msg_send![super(self), hitTest: point] }
			}
		}
	}
);

fn is_for_the_main_webview(marker: MainThreadMarker) -> bool {
	NSApplication::sharedApplication(marker)
		.currentEvent()
		.is_some_and(|event| EVENTS_FOR_THE_MAIN_WEBVIEW.contains(&event.r#type()))
}

struct Deadline {
	limit: Duration,
	dropped: &'static str,
	missed: &'static str,
}

#[repr(C)]
struct CGPath {
	_opaque: [u8; 0],
}

unsafe impl RefEncode for CGPath {
	const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Struct("CGPath", &[]));
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
	fn CGPathCreateMutable() -> *mut CGPath;
	fn CGPathMoveToPoint(path: *mut CGPath, transform: *const c_void, x: f64, y: f64);
	fn CGPathAddArcToPoint(
		path: *mut CGPath,
		transform: *const c_void,
		corner_x: f64,
		corner_y: f64,
		toward_x: f64,
		toward_y: f64,
		radius: f64,
	);
	fn CGPathCloseSubpath(path: *mut CGPath);
	fn CGPathRelease(path: *mut CGPath);
}

struct Outline(NonNull<CGPath>);

impl Outline {
	fn around(bounds: NSRect, is_flipped: bool, corners: LiveHtmlCorners) -> Result<Self, String> {
		let NSRect { origin, size } = bounds;
		let LiveHtmlCorners { top_left, top_right, bottom_right, bottom_left } =
			corners.fitted_to(size.width, size.height);
		let (left, right) = (origin.x, origin.x + size.width);
		let (top, bottom) = if is_flipped {
			(origin.y, origin.y + size.height)
		} else {
			(origin.y + size.height, origin.y)
		};
		let path = NonNull::new(unsafe { CGPathCreateMutable() })
			.ok_or("CoreGraphics gave no path to round the webview with")?;
		let (outline, untransformed) = (path.as_ptr(), std::ptr::null());
		unsafe {
			CGPathMoveToPoint(outline, untransformed, left + top_left, top);
			CGPathAddArcToPoint(outline, untransformed, right, top, right, bottom, top_right);
			CGPathAddArcToPoint(outline, untransformed, right, bottom, left, bottom, bottom_right);
			CGPathAddArcToPoint(outline, untransformed, left, bottom, left, top, bottom_left);
			CGPathAddArcToPoint(outline, untransformed, left, top, right, top, top_left);
			CGPathCloseSubpath(outline);
		}
		Ok(Self(path))
	}
}

impl Drop for Outline {
	fn drop(&mut self) {
		unsafe { CGPathRelease(self.0.as_ptr()) }
	}
}

struct Shown {
	webview: WebView,
	placement: Placement,
	corners: Option<LiveHtmlCorners>,
	is_drawn: bool,
	has_a_still: bool,
}

impl Shown {
	fn new(webview: WebView, placement: Placement) -> Self {
		Self { webview, placement, corners: None, is_drawn: true, has_a_still: false }
	}

	fn place(&self, placement: Placement, marker: MainThreadMarker) -> Result<(), String> {
		let view = native_view_of(&self.webview);
		let size_before = view.bounds().size;
		place_native(&view, placement, marker)?;
		match self.corners {
			Some(corners) if view.bounds().size != size_before => cut_corners(&view, corners),
			_ => Ok(()),
		}
	}

	fn place_on_the_new_pixel_grid(&self, marker: MainThreadMarker) -> Result<(), String> {
		let view = native_view_of(&self.webview);
		place_native(&view, self.placement, marker)?;
		self.corners.map_or(Ok(()), |corners| cut_corners(&view, corners))
	}

	fn draw(&self) -> Result<(), String> {
		let holder = placed_holder(&native_view_of(&self.webview))?;
		let stands_aside = self.has_a_still && MOTION.with(|motion| motion.is_moving.get());
		holder.setHidden(!self.is_drawn);
		holder.setAlphaValue(if stands_aside { 0.0 } else { 1.0 });
		Ok(())
	}
}

#[derive(Default)]
struct Motion {
	wheel_monitor: RefCell<Option<Retained<AnyObject>>>,
	moves: Cell<u64>,
	is_moving: Cell<bool>,
}

thread_local! {
	static MOUNTED: RefCell<HashMap<String, Shown>> = RefCell::new(HashMap::new());
	static MOTION: Motion = Motion::default();
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
	answered_in_time(NATIVE_STEP, answered).await
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
		let webview = guarded(tauri::Manager::app_handle(&main_window).clone(), view)
			.with_bounds(rectangle_below_the_inset(placement))
			.build_as_child(&main_window)
			.map_err(|failure| failure.to_string())?;
		place_native(&native_view_of(&webview), placement, marker)?;
		MOUNTED.with_borrow_mut(|mounted| mounted.insert(id, Shown::new(webview, placement)));
		watch_the_wheel(tauri::Manager::app_handle(&main_window).clone())
	})
	.await
}

pub async fn still<R: Runtime>(app: &AppHandle<R>, id: String) -> Result<String, LiveHtmlError> {
	let (answer, answered) = oneshot::channel();
	let answer = Arc::new(Mutex::new(Some(answer)));
	on_main_thread(app, move || {
		let view = mounted_view(&id)?;
		let handed = RcBlock::new(move |image: *mut AnyObject, failure: *mut AnyObject| {
			let still = unsafe { image.as_ref() }
				.ok_or_else(|| snapshot_failure(failure))
				.and_then(png_data_url);
			let sender = answer.lock().unwrap_or_else(PoisonError::into_inner).take();
			if is_still_delivered(sender, still) {
				MOUNTED.with_borrow_mut(|mounted| {
					if let Some(shown) = mounted.get_mut(&id) {
						shown.has_a_still = true;
					}
				});
			}
		});
		unsafe {
			let _: () = msg_send![
				&*view,
				takeSnapshotWithConfiguration: std::ptr::null::<AnyObject>(),
				completionHandler: &*handed
			];
		}
		Ok(())
	})
	.await?;
	answered_in_time(STILL_ANSWER, answered).await
}

pub async fn round<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	corners: LiveHtmlCorners,
) -> Result<(), LiveHtmlError> {
	on_main_thread(app, move || {
		MOUNTED.with_borrow_mut(|mounted| {
			let shown = mounted.get_mut(&id).ok_or("the view holds no native webview")?;
			cut_corners(&native_view_of(&shown.webview), corners)?;
			shown.corners = Some(corners);
			Ok(())
		})
	})
	.await
}

pub async fn place<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	placement: Placement,
) -> Result<(), LiveHtmlError> {
	let on_main = app.clone();
	on_main_thread(app, move || {
		let marker = MainThreadMarker::new().ok_or("the native step ran off the main thread")?;
		let has_moved = MOUNTED.with_borrow_mut(|mounted| -> Result<bool, String> {
			let shown = mounted.get_mut(&id).ok_or("the view holds no native webview")?;
			shown.place(placement, marker)?;
			Ok(std::mem::replace(&mut shown.placement, placement) != placement)
		})?;
		if has_moved {
			stand_aside_until_the_thread_rests(&on_main);
		}
		Ok(())
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
				if let Err(failure) = shown.place_on_the_new_pixel_grid(marker) {
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
		MOUNTED.with_borrow_mut(|mounted| {
			let shown = mounted.get_mut(&id).ok_or("the view holds no native webview")?;
			shown.is_drawn = is_drawn;
			shown.draw()
		})
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
		if MOUNTED.with_borrow(HashMap::is_empty) {
			stop_watching_the_wheel();
		}
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

pub async fn retheme<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	script: String,
) -> Result<(), LiveHtmlError> {
	on_main_thread(app, move || {
		MOUNTED.with_borrow(|mounted| match mounted.get(&id) {
			Some(shown) => {
				shown.webview.evaluate_script(&script).map_err(|failure| failure.to_string())
			}
			None => Ok(()),
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
	script_answered(answered).await
}

async fn script_answered(
	answered: oneshot::Receiver<Result<String, String>>,
) -> Result<String, LiveHtmlError> {
	answered_in_time(SCRIPT_ANSWER, answered).await
}

fn guarded<R: Runtime>(app: AppHandle<R>, view: ViewToMount) -> WebViewBuilder<'static> {
	let ViewToMount { id, url, allowed, scripts, watch } = view;
	let (navigation, new_window, download) = (Arc::clone(&watch), Arc::clone(&watch), watch);
	let (measuring, navigating, opening, downloading) = (id.clone(), id.clone(), id.clone(), id);
	let builder = scripts.into_iter().fold(
		WebViewBuilder::new()
			.with_url(url)
			.with_incognito(true)
			.with_initialization_script_for_main_only(measure::SCRIPT, false)
			.with_initialization_script_for_main_only(base::RETHEMED_SCRIPT, false),
		|builder, script| builder.with_initialization_script_for_main_only(script, false),
	);
	builder
		.with_ipc_handler(reporting_size(app, measuring))
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

fn reporting_size<R: Runtime>(app: AppHandle<R>, id: String) -> impl Fn(Request<String>) {
	let report = Arc::new(Mutex::new(SizeReport::default()));
	move |message| {
		let Some(size) = measure::page_size(message.body()) else {
			return;
		};
		if let Some(size) = locked(&report).posted(size) {
			emit_and_hold(&app, &id, &report, size);
		}
	}
}

fn emit_and_hold<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
	report: &Arc<Mutex<SizeReport>>,
	size: PageSize,
) {
	if !MOUNTED.with_borrow(|mounted| mounted.contains_key(id)) {
		return;
	}
	let PageSize { width, height } = size;
	let measured = LiveHtmlMeasured { id: id.to_owned(), width, height };
	if let Err(failure) = events::emit(app, events::LIVE_HTML_MEASURED, measured) {
		log::error!("live view {id}: its size reached no window: {failure}");
	}
	let (app, id, report) = (app.clone(), id.to_owned(), Arc::downgrade(report));
	tauri::async_runtime::spawn(async move {
		tokio::time::sleep(measure::REPORT_WINDOW).await;
		let (on_main, view) = (app.clone(), id.clone());
		let ended = app.run_on_main_thread(move || {
			if let Some(report) = report.upgrade() {
				if let Some(size) = locked(&report).window_ended() {
					emit_and_hold(&on_main, &id, &report, size);
				}
			}
		});
		if let Err(failure) = ended {
			log::error!("live view {view}: its held size was never reported: {failure}");
		}
	});
}

fn locked(report: &Mutex<SizeReport>) -> std::sync::MutexGuard<'_, SizeReport> {
	report.lock().unwrap_or_else(PoisonError::into_inner)
}

fn watch_the_wheel<R: Runtime>(app: AppHandle<R>) -> Result<(), String> {
	if MOTION.with(|motion| motion.wheel_monitor.borrow().is_some()) {
		return Ok(());
	}
	let turned = RcBlock::new(move |event: NonNull<NSEvent>| -> *mut NSEvent {
		stand_aside_until_the_thread_rests(&app);
		event.as_ptr()
	});
	let monitor: Option<Retained<AnyObject>> = unsafe {
		msg_send![
			NSEvent::class(),
			addLocalMonitorForEventsMatchingMask: NSEventMask::ScrollWheel,
			handler: &*turned
		]
	};
	let monitor = monitor.ok_or("AppKit gave no monitor for the wheel")?;
	MOTION.with(|motion| motion.wheel_monitor.replace(Some(monitor)));
	Ok(())
}

fn stop_watching_the_wheel() {
	let Some(monitor) = MOTION.with(|motion| motion.wheel_monitor.take()) else {
		return;
	};
	unsafe { NSEvent::removeMonitor(&monitor) };
	MOTION.with(|motion| motion.is_moving.set(false));
}

fn stand_aside_until_the_thread_rests<R: Runtime>(app: &AppHandle<R>) {
	let last_move = MOTION.with(|motion| {
		let last_move = motion.moves.get() + 1;
		motion.moves.set(last_move);
		last_move
	});
	set_moving(true);
	let app = app.clone();
	tauri::async_runtime::spawn(async move {
		tokio::time::sleep(REST_AFTER_THE_LAST_MOVE).await;
		let stood_back = app.run_on_main_thread(move || {
			if MOTION.with(|motion| motion.moves.get()) == last_move {
				set_moving(false);
			}
		});
		if let Err(failure) = stood_back {
			log::error!("the live views stayed behind their stills: {failure}");
		}
	});
}

fn set_moving(is_moving: bool) {
	if MOTION.with(|motion| motion.is_moving.replace(is_moving)) == is_moving {
		return;
	}
	MOUNTED.with_borrow(|mounted| {
		for (id, shown) in mounted {
			if let Err(failure) = shown.draw() {
				log::error!("live view {id} was not redrawn around its still: {failure}");
			}
		}
	});
}

fn is_still_delivered(
	sender: Option<oneshot::Sender<Result<String, String>>>,
	still: Result<String, String>,
) -> bool {
	let is_a_still = still.is_ok();
	let is_delivered = sender.is_some_and(|sender| sender.send(still).is_ok());
	if !is_delivered {
		log::warn!("a live view handed its still after its deadline");
	}
	is_delivered && is_a_still
}

fn snapshot_failure(failure: *mut AnyObject) -> String {
	let Some(failure) = (unsafe { failure.as_ref() }) else {
		return "the view drew no still and gave no error".to_owned();
	};
	let description: Option<Retained<NSString>> =
		unsafe { msg_send![failure, localizedDescription] };
	match description {
		Some(description) => format!("the view drew no still: {description}"),
		None => "the view drew no still and its error has no description".to_owned(),
	}
}

fn png_data_url(image: &AnyObject) -> Result<String, String> {
	let tiff: Option<Retained<AnyObject>> = unsafe { msg_send![image, TIFFRepresentation] };
	let tiff = tiff.ok_or("the still has no bitmap")?;
	let bitmap: Option<Retained<AnyObject>> =
		unsafe { msg_send![class!(NSBitmapImageRep), imageRepWithData: &*tiff] };
	let bitmap = bitmap.ok_or("the still bitmap is unreadable")?;
	let no_properties: Retained<AnyObject> = unsafe { msg_send![class!(NSDictionary), dictionary] };
	let png: Option<Retained<AnyObject>> = unsafe {
		msg_send![&*bitmap, representationUsingType: PNG_FILE_TYPE, properties: &*no_properties]
	};
	let png = png.ok_or("the still was not encoded as PNG")?;
	let length: usize = unsafe { msg_send![&*png, length] };
	let bytes: *const c_void = unsafe { msg_send![&*png, bytes] };
	if bytes.is_null() {
		return Err("the still PNG holds no bytes".to_owned());
	}
	let bytes = unsafe { std::slice::from_raw_parts(bytes.cast::<u8>(), length) };
	Ok(format!("data:image/png;base64,{}", BASE64_STANDARD.encode(bytes)))
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
	answered_in_time(NATIVE_STEP, answered).await
}

async fn answered_in_time<T>(
	deadline: Deadline,
	answered: oneshot::Receiver<Result<T, String>>,
) -> Result<T, LiveHtmlError> {
	match tokio::time::timeout(deadline.limit, answered).await {
		Ok(Ok(stepped)) => stepped.map_err(unplaced),
		Ok(Err(_)) => Err(unplaced(deadline.dropped.to_owned())),
		Err(_) => Err(unplaced(deadline.missed.to_owned())),
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
	let frames = placement.frames(&ContentView {
		height: parent.bounds().size.height,
		is_flipped: parent.isFlipped(),
		backing_scale: window.backingScaleFactor(),
	});
	holder.setFrame(native_rectangle(frames.holder));
	view.setFrame(native_rectangle(frames.view));
	Ok(())
}

fn cut_corners(view: &NSView, corners: LiveHtmlCorners) -> Result<(), String> {
	let layer: *mut AnyObject = unsafe { msg_send![view, layer] };
	if layer.is_null() {
		return Err("the webview has no layer to round".to_owned());
	}
	let window = view.window().ok_or("the webview to round is in no window")?;
	let outline = Outline::around(view.bounds(), view.isFlipped(), corners)?;
	let mask: Retained<AnyObject> = unsafe { msg_send![class!(CAShapeLayer), layer] };
	unsafe {
		let _: () = msg_send![&*mask, setContentsScale: window.backingScaleFactor()];
		let _: () = msg_send![&*mask, setPath: outline.0.as_ptr()];
		let _: () = msg_send![layer, setMask: &*mask];
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
	let holder: Retained<Holder> = unsafe {
		msg_send![super(Holder::alloc(marker).set_ivars(())), initWithFrame: NSRect::ZERO]
	};
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
	Ok(holder.into_super())
}

fn native_rectangle(frame: Frame) -> NSRect {
	NSRect::new(NSPoint::new(frame.x, frame.y), NSSize::new(frame.width, frame.height))
}

#[cfg(test)]
mod tests {
	use std::ffi::c_void;
	use std::time::Duration;

	use objc2_foundation::{NSPoint, NSRect, NSSize};
	use tokio::sync::oneshot;

	use super::{
		is_still_delivered, script_answered, CGPath, LiveHtmlCorners, LiveHtmlError, Outline,
	};

	const HOSTILE_PAGE_BUSY_LOOP: Duration = Duration::from_secs(10);
	const WIDTH: f64 = 480.0;
	const HEIGHT: f64 = 160.0;
	const EACH_ITS_OWN: LiveHtmlCorners =
		LiveHtmlCorners { top_left: 0.0, top_right: 8.0, bottom_right: 24.0, bottom_left: 16.0 };

	#[link(name = "CoreGraphics", kind = "framework")]
	extern "C" {
		fn CGPathContainsPoint(
			path: *const CGPath,
			transform: *const c_void,
			point: NSPoint,
			is_even_odd: bool,
		) -> bool;
	}

	fn assert_each_corner_is_cut_to_its_own_radius(is_flipped: bool) {
		let bounds = NSRect::new(NSPoint::new(0.0, 0.0), NSSize::new(WIDTH, HEIGHT));
		let outline = Outline::around(bounds, is_flipped, EACH_ITS_OWN).expect("a path is built");
		let is_kept = |from_the_left: f64, from_the_top: f64| {
			let y = if is_flipped { from_the_top } else { HEIGHT - from_the_top };
			let point = NSPoint::new(from_the_left, y);
			unsafe { CGPathContainsPoint(outline.0.as_ptr(), std::ptr::null(), point, false) }
		};

		assert!(is_kept(1.0, 1.0), "the top left corner of radius 0 was cut");
		assert!(
			!is_kept(WIDTH - 2.0, 2.0) && is_kept(WIDTH - 3.0, 3.0),
			"the top right corner was not cut to 8"
		);
		assert!(
			!is_kept(WIDTH - 6.0, HEIGHT - 6.0) && is_kept(WIDTH - 8.0, HEIGHT - 8.0),
			"the bottom right corner was not cut to 24"
		);
		assert!(
			!is_kept(4.0, HEIGHT - 4.0) && is_kept(5.0, HEIGHT - 5.0),
			"the bottom left corner was not cut to 16"
		);
	}

	#[test]
	fn a_flipped_view_is_cut_at_each_corner_to_its_own_radius() {
		assert_each_corner_is_cut_to_its_own_radius(true);
	}

	#[test]
	fn an_unflipped_view_is_cut_at_each_corner_to_its_own_radius() {
		assert_each_corner_is_cut_to_its_own_radius(false);
	}

	#[tokio::test(start_paused = true)]
	async fn a_live_html_script_is_answered_after_a_page_busy_loop_longer_than_a_native_step() {
		let (answer, answered) = oneshot::channel();
		tokio::spawn(async move {
			tokio::time::sleep(HOSTILE_PAGE_BUSY_LOOP).await;
			answer.send(Ok("undefined".to_owned()))
		});

		let result = script_answered(answered).await;

		assert_eq!(result, Ok("undefined".to_owned()));
	}

	#[tokio::test(start_paused = true)]
	async fn a_live_html_script_never_answered_fails_on_the_view_not_on_the_main_thread() {
		let (_answer, answered) = oneshot::channel::<Result<String, String>>();

		let result = script_answered(answered).await;

		assert_eq!(
			result,
			Err(LiveHtmlError::Unplaced {
				detail: "the view did not answer the script in time".to_owned()
			})
		);
	}

	#[test]
	fn a_live_html_still_counts_as_handed_once_its_caller_receives_it() {
		let (answer, mut answered) = oneshot::channel();

		let is_delivered =
			is_still_delivered(Some(answer), Ok("data:image/png;base64,".to_owned()));

		assert!(is_delivered);
		assert_eq!(answered.try_recv(), Ok(Ok("data:image/png;base64,".to_owned())));
	}

	#[test]
	fn a_live_html_still_handed_after_its_caller_stopped_waiting_is_not_counted() {
		let (answer, answered) = oneshot::channel();
		drop(answered);

		assert!(!is_still_delivered(Some(answer), Ok("data:image/png;base64,".to_owned())));
	}

	#[test]
	fn a_live_html_still_handed_a_second_time_is_not_counted() {
		assert!(!is_still_delivered(None, Ok("data:image/png;base64,".to_owned())));
	}

	#[test]
	fn a_live_html_still_that_failed_is_delivered_but_not_counted() {
		let (answer, mut answered) = oneshot::channel();

		let is_delivered =
			is_still_delivered(Some(answer), Err("the view drew no still".to_owned()));

		assert!(!is_delivered);
		assert_eq!(answered.try_recv(), Ok(Err("the view drew no still".to_owned())));
	}
}
