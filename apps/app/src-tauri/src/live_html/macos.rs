use std::cell::RefCell;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, PoisonError};
use std::time::Duration;

use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{define_class, msg_send, sel, MainThreadMarker, MainThreadOnly};
use objc2_app_kit::{NSApplication, NSEventType, NSView};
use objc2_foundation::{NSEdgeInsets, NSPoint, NSRect, NSSize, NSString};
use tauri::{AppHandle, Runtime, WebviewWindow};
use tokio::sync::oneshot;
use wry::dpi::{LogicalPosition, LogicalSize};
use wry::http::Request;
use wry::{NewWindowResponse, Rect, WebView, WebViewBuilder, WebViewExtMacOS};

use super::contract::{LiveHtmlError, LiveHtmlMeasured, LiveHtmlRectangle};
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
			.with_initialization_script_for_main_only(measure::SCRIPT, false),
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
	use std::time::Duration;

	use tokio::sync::oneshot;

	use super::{answered_in_time, LiveHtmlError, SCRIPT_ANSWER};

	const HOSTILE_PAGE_BUSY_LOOP: Duration = Duration::from_secs(10);

	#[tokio::test(start_paused = true)]
	async fn a_live_html_script_is_answered_after_a_page_busy_loop_longer_than_a_native_step() {
		let (answer, answered) = oneshot::channel();
		tokio::spawn(async move {
			tokio::time::sleep(HOSTILE_PAGE_BUSY_LOOP).await;
			answer.send(Ok("undefined".to_owned()))
		});

		let result = answered_in_time(SCRIPT_ANSWER, answered).await;

		assert_eq!(result, Ok("undefined".to_owned()));
	}

	#[tokio::test(start_paused = true)]
	async fn a_live_html_script_never_answered_fails_on_the_view_not_on_the_main_thread() {
		let (_answer, answered) = oneshot::channel::<Result<String, String>>();

		let result = answered_in_time(SCRIPT_ANSWER, answered).await;

		assert_eq!(
			result,
			Err(LiveHtmlError::Unplaced {
				detail: "the view did not answer the script in time".to_owned()
			})
		);
	}
}
