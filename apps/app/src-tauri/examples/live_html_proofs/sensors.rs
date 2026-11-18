use std::ffi::c_void;
use std::io::{self, Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpStream, UdpSocket};
use std::sync::mpsc;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

use objc2::encode::{Encoding, RefEncode};
use objc2::rc::Retained;
use objc2::runtime::{AnyObject, Sel};
use objc2::{msg_send, sel, ClassType, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSEvent, NSView, NSWindow};
use objc2_foundation::{NSPoint, NSRect, NSString};
use serde::Serialize;
use tauri::WebviewWindow;

use kiroshi_app::live_html::server::{CONTENT_DOCUMENT, WRAPPER_DOCUMENT};
use kiroshi_app::live_html::HOLDER_IDENTIFIER;

use crate::http::{Listener, Request, Response};

const PROBE_TIMEOUT: Duration = Duration::from_secs(2);
const ROUTING_PROBE_ADDRESS: (Ipv4Addr, u16) = (Ipv4Addr::new(192, 0, 2, 1), 9);
const RECORDED_BODY_CHARS: usize = 512;

pub fn locked<T>(mutex: &Mutex<T>) -> MutexGuard<'_, T> {
	mutex.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn non_loopback_ipv4() -> io::Result<Ipv4Addr> {
	let socket = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))?;
	socket.connect(ROUTING_PROBE_ADDRESS)?;
	match socket.local_addr()?.ip() {
		IpAddr::V4(address) if !address.is_loopback() && !address.is_unspecified() => Ok(address),
		address => Err(io::Error::other(format!(
			"the routed address {address} is not a non-loopback IPv4 address"
		))),
	}
}

fn summary(request: Option<&Request>) -> String {
	match request {
		Some(request) => {
			let body: String = request.body.chars().take(RECORDED_BODY_CHARS).collect();
			format!("{} {} {}", request.method, request.target, body).trim_end().to_owned()
		}
		None => "connection without a request".to_owned(),
	}
}

#[derive(Clone)]
pub struct Connection {
	pub accepted_at: Instant,
	pub bytes_received: usize,
	pub target: Option<String>,
	pub summary: String,
}

pub struct Tripwire {
	listener: Listener,
	connections: Arc<Mutex<Vec<Connection>>>,
	control_connections: usize,
}

pub struct TripwireReading {
	pub address: String,
	pub control_connections: usize,
	pub connections: Vec<Connection>,
}

impl TripwireReading {
	pub fn view_connections(&self) -> &[Connection] {
		self.connections.get(self.control_connections..).unwrap_or(&[])
	}

	pub fn is_silent(&self) -> bool {
		self.control_connections > 0 && self.view_connections().is_empty()
	}
}

impl Tripwire {
	pub fn open(ip: IpAddr) -> io::Result<Self> {
		let connections = Arc::new(Mutex::new(Vec::new()));
		let recorded = Arc::clone(&connections);
		let listener = Listener::open(SocketAddr::new(ip, 0), move |incoming| {
			locked(&recorded).push(Connection {
				accepted_at: incoming.accepted_at,
				bytes_received: incoming.bytes_received,
				target: incoming.request.as_ref().map(|request| request.target.clone()),
				summary: summary(incoming.request.as_ref()),
			});
			Response {
				status: "200 OK",
				headers: vec![
					("Access-Control-Allow-Origin", "*".to_owned()),
					("Content-Type", "text/plain".to_owned()),
				],
				body: b"tripwire".to_vec(),
			}
		})?;
		let mut control = TcpStream::connect_timeout(&listener.address(), PROBE_TIMEOUT)?;
		control.set_read_timeout(Some(PROBE_TIMEOUT))?;
		control.write_all(b"GET /control HTTP/1.1\r\nHost: tripwire\r\n\r\n")?;
		control.read_to_end(&mut Vec::new())?;
		let control_connections = locked(&connections).len();
		Ok(Self { listener, connections, control_connections })
	}

	pub fn address(&self) -> SocketAddr {
		self.listener.address()
	}

	pub fn reading(&self) -> TripwireReading {
		TripwireReading {
			address: self.address().to_string(),
			control_connections: self.control_connections,
			connections: locked(&self.connections).clone(),
		}
	}
}

pub const WRITER_ROLE: &str = "writer";
pub const READER_ROLE: &str = "reader";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Targets {
	pub role: &'static str,
	pub loopback_tripwire: String,
	pub lan_tripwire: Option<String>,
	pub navigation_sink: String,
}

#[derive(Clone)]
pub struct Beacon {
	pub at: Instant,
	pub attempt: String,
	pub outcome: String,
}

#[derive(Clone, Serialize)]
pub struct CspReport {
	pub blocked_uri: String,
	pub directive: String,
}

#[derive(Clone, Default)]
pub struct ViewRecord {
	pub document_requests: usize,
	pub first_document_request: Option<Instant>,
	pub beacons: Vec<Beacon>,
	pub csp_reports: Vec<CspReport>,
	pub cookie_headers: Vec<String>,
	pub unrouted_requests: Vec<String>,
}

impl ViewRecord {
	pub fn outcome(&self, attempt: &str) -> Option<&str> {
		self.beacons
			.iter()
			.rev()
			.find(|beacon| beacon.attempt == attempt)
			.map(|beacon| beacon.outcome.as_str())
	}

	pub fn beacon_at(&self, attempt: &str, outcome: &str) -> Option<Instant> {
		self.beacons
			.iter()
			.find(|beacon| beacon.attempt == attempt && beacon.outcome == outcome)
			.map(|beacon| beacon.at)
	}
}

#[derive(Clone)]
pub struct SeenRequest {
	pub at: Instant,
	pub method: String,
	pub target: String,
	pub cookie: Option<String>,
	pub body: String,
}

impl SeenRequest {
	fn summary(&self) -> String {
		let body: String = self.body.chars().take(RECORDED_BODY_CHARS).collect();
		format!("{} {} {}", self.method, self.target, body).trim_end().to_owned()
	}
}

impl ViewRecord {
	pub fn of(token: &str, requests: &[SeenRequest]) -> Self {
		let mut record = Self::default();
		for request in requests {
			record.add(token, request);
		}
		record
	}

	fn add(&mut self, token: &str, request: &SeenRequest) {
		if let Some(cookie) = &request.cookie {
			if !self.cookie_headers.iter().any(|seen| seen == cookie) {
				self.cookie_headers.push(cookie.clone());
			}
		}
		let route = request
			.target
			.strip_prefix('/')
			.and_then(|target| target.strip_prefix(token))
			.and_then(|rest| rest.strip_prefix('/'));
		match (request.method.as_str(), route) {
			("GET", Some(CONTENT_DOCUMENT)) => {
				self.document_requests += 1;
				self.first_document_request.get_or_insert(request.at);
			}
			("GET", Some(WRAPPER_DOCUMENT)) => {}
			("POST", Some("csp-report")) => match csp_report(&request.body) {
				Some(report) => self.csp_reports.push(report),
				None => self.unrouted_requests.push(request.summary()),
			},
			("GET", Some(route)) => {
				match route.strip_prefix("beacon/").and_then(|beacon| beacon.split_once('/')) {
					Some((attempt, outcome)) => self.beacons.push(Beacon {
						at: request.at,
						attempt: attempt.to_owned(),
						outcome: outcome.to_owned(),
					}),
					None => self.unrouted_requests.push(request.summary()),
				}
			}
			_ => self.unrouted_requests.push(request.summary()),
		}
	}
}

fn csp_report(body: &str) -> Option<CspReport> {
	let parsed: serde_json::Value = serde_json::from_str(body).ok()?;
	let report = parsed.get("csp-report")?;
	let field = |names: [&str; 2]| {
		names.iter().find_map(|name| report.get(name)?.as_str()).map(str::to_owned)
	};
	Some(CspReport {
		blocked_uri: field(["blocked-uri", "blockedURL"])?,
		directive: field(["effective-directive", "violated-directive"])?,
	})
}

#[derive(Serialize)]
pub struct DrawnFrames {
	pub backing_scale: f64,
	pub holder_in_device_pixels: [f64; 4],
	pub view_in_device_pixels: [f64; 4],
	pub holder_contents_scale: f64,
	pub view_contents_scale: f64,
}

impl DrawnFrames {
	pub fn edges_off_the_grid(&self) -> Vec<f64> {
		[self.holder_in_device_pixels, self.view_in_device_pixels]
			.into_iter()
			.flat_map(|[x, y, width, height]| [x, y, x + width, y + height])
			.filter(|edge| edge.fract() != 0.0)
			.collect()
	}

	pub fn is_at_the_backing_scale(&self) -> bool {
		self.holder_contents_scale == self.backing_scale
			&& self.view_contents_scale == self.backing_scale
	}
}

pub fn drawn_frames(main_window: &WebviewWindow) -> Result<Vec<DrawnFrames>, String> {
	on_the_ns_window(main_window, "the drawn frames were read", frames_in)
}

pub fn force_backing_scale(main_window: &WebviewWindow, scale: f64) -> Result<(), String> {
	on_the_ns_window(main_window, "the backing scale was forced", move |window| {
		force_through_private_appkit(window, scale)
	})
}

fn on_the_ns_window<T: Send + 'static>(
	main_window: &WebviewWindow,
	step: &'static str,
	act: impl FnOnce(&NSWindow) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
	on_the_main_webview(main_window, step, move |window, _| act(window))
}

fn on_the_main_webview<T: Send + 'static>(
	main_window: &WebviewWindow,
	step: &'static str,
	act: impl FnOnce(&NSWindow, &NSView) -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
	let (answer, answered) = mpsc::channel();
	main_window
		.with_webview(move |platform| {
			let window = unsafe { Retained::retain(platform.ns_window().cast::<NSWindow>()) };
			let webview = unsafe { Retained::retain(platform.inner().cast::<NSView>()) };
			let reading = window
				.zip(webview)
				.ok_or_else(|| "the main window has no native window or webview".to_owned());
			if answer.send(reading.and_then(|(window, webview)| act(&window, &webview))).is_err() {
				eprintln!("{step} after its deadline");
			}
		})
		.map_err(|cause| cause.to_string())?;
	answered.recv_timeout(PROBE_TIMEOUT).map_err(|cause| cause.to_string())?
}

fn force_through_private_appkit(window: &NSWindow, scale: f64) -> Result<(), String> {
	let set = sel!(_setBackingScaleFactor:);
	let announce = sel!(_postWindowDidChangeBackingPropertiesAndDisplayWindowForPreviousBackingScaleFactor:previousColorSpace:);
	let responds =
		|selector: Sel| -> bool { unsafe { msg_send![window, respondsToSelector: selector] } };
	if !responds(set) || !responds(announce) {
		return Err("this macOS offers no private call to force a backing scale".to_owned());
	}
	let previous = window.backingScaleFactor();
	unsafe {
		let color_space: *mut AnyObject = msg_send![window, colorSpace];
		let _: () = msg_send![window, _setBackingScaleFactor: scale];
		let _: () = msg_send![
			window,
			_postWindowDidChangeBackingPropertiesAndDisplayWindowForPreviousBackingScaleFactor: previous,
			previousColorSpace: color_space
		];
	}
	Ok(())
}

fn frames_in(window: &NSWindow) -> Result<Vec<DrawnFrames>, String> {
	let content = window.contentView().ok_or("the main window has no content view")?;
	holders_in(&content)
		.iter()
		.map(|holder| {
			let view = holder.subviews().firstObject().ok_or("a holder holds no webview")?;
			let in_device_pixels = |view: &NSView| {
				let NSRect { origin, size } =
					window.convertRectToBacking(view.convertRect_toView(view.bounds(), None));
				[origin.x, origin.y, size.width, size.height]
			};
			Ok(DrawnFrames {
				backing_scale: window.backingScaleFactor(),
				holder_in_device_pixels: in_device_pixels(holder),
				view_in_device_pixels: in_device_pixels(&view),
				holder_contents_scale: contents_scale(holder)?,
				view_contents_scale: contents_scale(&view)?,
			})
		})
		.collect()
}

fn holders_in(view: &NSView) -> Vec<Retained<NSView>> {
	view.subviews()
		.iter()
		.flat_map(|subview| {
			let nested = holders_in(&subview);
			is_holder(&subview).then_some(subview).into_iter().chain(nested)
		})
		.collect()
}

fn is_holder(view: &NSView) -> bool {
	let identifier: Option<Retained<NSString>> = unsafe { msg_send![view, identifier] };
	identifier.is_some_and(|identifier| identifier.to_string() == HOLDER_IDENTIFIER)
}

fn contents_scale(view: &NSView) -> Result<f64, String> {
	let layer: *mut AnyObject = unsafe { msg_send![view, layer] };
	if layer.is_null() {
		return Err("a drawn view has no layer".to_owned());
	}
	Ok(unsafe { msg_send![layer, contentsScale] })
}

#[repr(C)]
struct CGEvent {
	_opaque: [u8; 0],
}

unsafe impl RefEncode for CGEvent {
	const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Struct("__CGEvent", &[]));
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
	fn CGEventCreateScrollWheelEvent2(
		source: *const c_void,
		units: u32,
		wheel_count: u32,
		wheel1: i32,
		wheel2: i32,
		wheel3: i32,
	) -> *mut CGEvent;
	fn CGEventSetLocation(event: *mut CGEvent, location: NSPoint);
	fn CGEventSetIntegerValueField(event: *mut CGEvent, field: u32, value: i64);
	fn CGMainDisplayID() -> u32;
	fn CGDisplayBounds(display: u32) -> NSRect;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
	fn CFRelease(object: *const c_void);
}

const LINE_UNITS: u32 = 1;
const PIXEL_UNITS: u32 = 0;
const IS_CONTINUOUS: u32 = 88;
const SCROLL_PHASE: u32 = 99;
const MOMENTUM_PHASE: u32 = 123;
const NO_PHASE: i64 = 0;
const SCROLL_BEGAN: i64 = 1;
const SCROLL_CHANGED: i64 = 2;
const SCROLL_ENDED: i64 = 4;
const MOMENTUM_BEGAN: i64 = 1;
const MOMENTUM_CONTINUED: i64 = 2;
const MOMENTUM_ENDED: i64 = 3;
const POINTER_BESIDE_THE_VIEW: f64 = 120.0;

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollDevice {
	MouseWheel,
	Trackpad,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Pointer {
	OverTheView,
	BesideTheView,
}

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScrollTarget {
	MainWebview,
	LiveView,
	Elsewhere,
}

#[derive(Clone, Copy, Serialize)]
pub struct ScrollStep {
	pub delta: i32,
	pub phase: i64,
	pub momentum_phase: i64,
}

impl ScrollStep {
	pub const fn notch(delta: i32) -> Self {
		Self { delta, phase: NO_PHASE, momentum_phase: NO_PHASE }
	}

	pub const fn began(delta: i32) -> Self {
		Self { delta, phase: SCROLL_BEGAN, momentum_phase: NO_PHASE }
	}

	pub const fn changed(delta: i32) -> Self {
		Self { delta, phase: SCROLL_CHANGED, momentum_phase: NO_PHASE }
	}

	pub const fn ended() -> Self {
		Self { delta: 0, phase: SCROLL_ENDED, momentum_phase: NO_PHASE }
	}

	pub const fn momentum_began(delta: i32) -> Self {
		Self { delta, phase: NO_PHASE, momentum_phase: MOMENTUM_BEGAN }
	}

	pub const fn momentum(delta: i32) -> Self {
		Self { delta, phase: NO_PHASE, momentum_phase: MOMENTUM_CONTINUED }
	}

	pub const fn momentum_ended() -> Self {
		Self { delta: 0, phase: NO_PHASE, momentum_phase: MOMENTUM_ENDED }
	}
}

pub fn send_scroll(
	main_window: &WebviewWindow,
	device: ScrollDevice,
	step: ScrollStep,
	pointer: Pointer,
) -> Result<ScrollTarget, String> {
	on_the_main_webview(main_window, "a scroll event was sent", move |window, main_webview| {
		let marker = MainThreadMarker::new().ok_or("the scroll was sent off the main thread")?;
		let content = window.contentView().ok_or("the main window has no content view")?;
		let event = scroll_event(window, device, step, pointer_location(window, pointer)?)?;
		let app = NSApplication::sharedApplication(marker);
		make_current_through_private_appkit(&app, &event)?;
		let target = target_of(content.hitTest(event.locationInWindow()), main_webview);
		app.sendEvent(&event);
		Ok(target)
	})
}

fn make_current_through_private_appkit(app: &NSApplication, event: &NSEvent) -> Result<(), String> {
	let make_current = sel!(_setCurrentEvent:);
	let responds: bool = unsafe { msg_send![app, respondsToSelector: make_current] };
	if !responds {
		return Err("this macOS offers no private call to make an event the current one".to_owned());
	}
	unsafe {
		let _: () = msg_send![app, _setCurrentEvent: event];
	}
	Ok(())
}

fn target_of(hit: Option<Retained<NSView>>, main_webview: &NSView) -> ScrollTarget {
	let mut view = hit;
	while let Some(current) = view {
		if std::ptr::eq(&*current, main_webview) {
			return ScrollTarget::MainWebview;
		}
		if is_holder(&current) {
			return ScrollTarget::LiveView;
		}
		view = unsafe { current.superview() };
	}
	ScrollTarget::Elsewhere
}

fn pointer_location(window: &NSWindow, pointer: Pointer) -> Result<NSPoint, String> {
	let content = window.contentView().ok_or("the main window has no content view")?;
	let [holder] = holders_in(&content).try_into().map_err(|holders: Vec<_>| {
		format!("{} holders in the main window, where one view is mounted", holders.len())
	})?;
	let NSRect { origin, size } =
		window.convertRectToScreen(holder.convertRect_toView(holder.bounds(), None));
	let x = match pointer {
		Pointer::OverTheView => origin.x + size.width / 2.0,
		Pointer::BesideTheView => origin.x + size.width + POINTER_BESIDE_THE_VIEW,
	};
	let main_display_height = unsafe { CGDisplayBounds(CGMainDisplayID()) }.size.height;
	Ok(NSPoint::new(x, main_display_height - (origin.y + size.height / 2.0)))
}

fn scroll_event(
	window: &NSWindow,
	device: ScrollDevice,
	step: ScrollStep,
	location: NSPoint,
) -> Result<Retained<NSEvent>, String> {
	let units = match device {
		ScrollDevice::MouseWheel => LINE_UNITS,
		ScrollDevice::Trackpad => PIXEL_UNITS,
	};
	let event =
		unsafe { CGEventCreateScrollWheelEvent2(std::ptr::null(), units, 1, step.delta, 0, 0) };
	if event.is_null() {
		return Err("CoreGraphics created no scroll event".to_owned());
	}
	let fields = [
		(IS_CONTINUOUS, matches!(device, ScrollDevice::Trackpad).into()),
		(SCROLL_PHASE, step.phase),
		(MOMENTUM_PHASE, step.momentum_phase),
	];
	let converted: Option<Retained<NSEvent>> = unsafe {
		CGEventSetLocation(event, location);
		for (field, value) in fields {
			CGEventSetIntegerValueField(event, field, value);
		}
		let converted = msg_send![NSEvent::class(), eventWithCGEvent: event];
		CFRelease(event.cast());
		converted
	};
	let converted = converted.ok_or("AppKit made no event of the scroll event")?;
	in_the_window_through_private_appkit(&converted, window)
}

fn in_the_window_through_private_appkit(
	event: &NSEvent,
	window: &NSWindow,
) -> Result<Retained<NSEvent>, String> {
	let relative = sel!(_eventRelativeToWindow:);
	let responds: bool = unsafe { msg_send![event, respondsToSelector: relative] };
	if !responds {
		return Err("this macOS offers no private call to aim an event at a window".to_owned());
	}
	let aimed: Option<Retained<NSEvent>> =
		unsafe { msg_send![event, _eventRelativeToWindow: window] };
	aimed.ok_or_else(|| "AppKit aimed the scroll event at no window".to_owned())
}
