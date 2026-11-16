use std::path::PathBuf;
use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{LogicalSize, Webview, WebviewWindow};

use crate::capture::{self, Bitmap, Paint, PaintedBox, Shot, PLACEHOLDER_PAINT, VIEW_PAINT};
use crate::placement::{
	bounds_of, Extent, Placement, Rectangle, Seat, Shift, ThreadView, PIXEL_TOLERANCE,
};
use crate::proofs::Verdict;
use crate::run_name;
use crate::scenario::wait_until;
use crate::windows::{WINDOW_HEIGHT, WINDOW_WIDTH};

const PLACEMENT_TIMEOUT: Duration = Duration::from_secs(3);
const PLACEMENT_SETTLE: Duration = Duration::from_millis(300);
const DRAWING_SETTLE: Duration = Duration::from_millis(700);
const SOLID_SHARE: f64 = 0.98;
const VIEW_PAINT_SCRIPT: &str = r#"(() => {
	const cover = document.createElement("div");
	cover.style.position = "fixed";
	cover.style.inset = "0";
	cover.style.zIndex = "2147483647";
	cover.style.background = "PAINT";
	document.documentElement.append(cover);
})()"#;
const OUTSIDE_MARGIN: f64 = 24.0;
const WINDOW_SIZES: [(f64, f64); 2] =
	[(WINDOW_WIDTH + 140.0, WINDOW_HEIGHT + 120.0), (WINDOW_WIDTH, WINDOW_HEIGHT)];
const OVERLAYS: [&str; 3] = ["menu", "popover", "sheet"];
pub const NO_REPORT: &str = "the main page reported no placeholder rectangle";
const NAMES: [&str; 5] = [
	"The view follows its placeholder when the thread column scrolls",
	"The view is cut to the visible area of the column and hidden outside it",
	"The view covers no menu, popover or sheet of the main page",
	"The view follows its placeholder when the main window is resized",
	"The view is enlarged then brought back without a reload",
];

#[derive(Serialize)]
pub struct Behaviour {
	behaviour: usize,
	name: &'static str,
	result: Verdict,
	evidence: Value,
}

impl Behaviour {
	pub fn is_green(&self) -> bool {
		self.result == Verdict::Green
	}
}

fn judged(readings: [(bool, Value); 5]) -> Vec<Behaviour> {
	NAMES
		.into_iter()
		.zip(readings)
		.enumerate()
		.map(|(index, (name, (is_green, evidence)))| Behaviour {
			behaviour: index + 1,
			name,
			result: is_green.into(),
			evidence,
		})
		.collect()
}

pub fn not_played(reason: &str) -> Vec<Behaviour> {
	judged(std::array::from_fn(|_| (false, json!({ "not_played": reason }))))
}

struct Step {
	action: String,
	outcome: Result<Placement, String>,
}

impl Step {
	fn holds(&self, check: impl Fn(&Placement) -> bool) -> bool {
		self.outcome.as_ref().is_ok_and(check)
	}

	fn evidence(&self) -> Value {
		let mut evidence = match &self.outcome {
			Ok(placement) => placement.evidence(),
			Err(fault) => json!({ "fault": fault }),
		};
		evidence["action"] = json!(self.action);
		evidence
	}
}

fn follows_the_placeholder(placement: &Placement) -> bool {
	placement.shows(placement.report.placeholder)
}

fn is_cut_to_the_column(placement: &Placement) -> bool {
	placement
		.report
		.visible_placeholder()
		.is_some_and(|visible| visible != placement.report.placeholder && placement.shows(visible))
}

fn is_hidden_outside_the_column(placement: &Placement) -> bool {
	placement.report.visible_placeholder().is_none() && placement.hides()
}

fn evidence_of(steps: &[Step]) -> Vec<Value> {
	steps.iter().map(Step::evidence).collect()
}

struct OverlayRun {
	kind: &'static str,
	opened: Step,
	closed: Step,
}

impl OverlayRun {
	fn rectangle(&self) -> Option<Rectangle> {
		let placement = self.opened.outcome.as_ref().ok()?;
		let overlay = placement.report.overlays.iter().find(|overlay| overlay.kind == self.kind)?;
		Some(overlay.rectangle)
	}

	fn area_under_the_child_webview(&self) -> Option<f64> {
		let rectangle = self.rectangle()?;
		let applied = self.opened.outcome.as_ref().ok()?.applied.as_ref().ok()?;
		let covered = applied
			.is_visible
			.then(|| applied.bounds_in_the_page().intersection(rectangle))
			.flatten();
		Some(covered.map_or(0.0, Rectangle::area))
	}

	fn overlaps_the_placeholder(&self) -> bool {
		self.rectangle().is_some_and(|rectangle| {
			self.opened.holds(|placement| {
				placement
					.report
					.visible_placeholder()
					.is_some_and(|visible| visible.intersection(rectangle).is_some())
			})
		})
	}

	fn is_never_covered(&self) -> bool {
		self.overlaps_the_placeholder()
			&& self.area_under_the_child_webview() == Some(0.0)
			&& self.closed.holds(follows_the_placeholder)
	}

	fn evidence(&self) -> Value {
		json!({
			"overlay": self.kind,
			"overlay_rectangle": self.rectangle(),
			"overlaps_the_placeholder": self.overlaps_the_placeholder(),
			"overlay_area_under_the_child_webview_px2": self.area_under_the_child_webview(),
			"while_open": self.opened.evidence(),
			"after_close": self.closed.evidence(),
		})
	}
}

struct Observed {
	scrolls: Vec<Step>,
	cut: Vec<Step>,
	outside: Vec<Step>,
	rest: Step,
	overlays: Vec<OverlayRun>,
	resizes: Vec<Step>,
	target_before_enlarging: Option<Rectangle>,
	enlarged: Step,
	brought_back: Step,
	document_requests: (usize, usize),
}

impl Observed {
	fn behaviours(&self) -> Vec<Behaviour> {
		let before = self.target_before_enlarging;
		let is_enlarged = self.enlarged.holds(|placement| {
			placement.report.visible_placeholder().zip(before).is_some_and(|(target, before)| {
				target.area() > before.area() && placement.shows(target)
			})
		});
		let is_brought_back = self
			.brought_back
			.holds(|placement| before.is_some_and(|before| placement.shows(before)));
		let (requests_before, requests_after) = self.document_requests;
		judged([
			(
				self.scrolls.iter().all(|step| step.holds(follows_the_placeholder)),
				json!({ "pixel_tolerance": PIXEL_TOLERANCE, "scrolls": evidence_of(&self.scrolls) }),
			),
			(
				self.cut.iter().all(|step| step.holds(is_cut_to_the_column))
					&& self.outside.iter().all(|step| step.holds(is_hidden_outside_the_column)),
				json!({
					"pixel_tolerance": PIXEL_TOLERANCE,
					"placeholder_partly_outside": evidence_of(&self.cut),
					"placeholder_fully_outside": evidence_of(&self.outside),
				}),
			),
			(
				self.rest.holds(follows_the_placeholder)
					&& self.overlays.iter().all(OverlayRun::is_never_covered),
				json!({
					"before_any_overlay": self.rest.evidence(),
					"overlays": self.overlays.iter().map(OverlayRun::evidence).collect::<Vec<_>>(),
				}),
			),
			(
				self.resizes.iter().all(|step| step.holds(follows_the_placeholder)),
				json!({ "pixel_tolerance": PIXEL_TOLERANCE, "resizes": evidence_of(&self.resizes) }),
			),
			(
				is_enlarged && is_brought_back && requests_after <= requests_before,
				json!({
					"pixel_tolerance": PIXEL_TOLERANCE,
					"target_before_enlarging": before,
					"enlarged": self.enlarged.evidence(),
					"brought_back": self.brought_back.evidence(),
					"document_requests_before": requests_before,
					"document_requests_after": requests_after,
				}),
			),
		])
	}
}

#[derive(Serialize)]
pub struct Mount {
	window_inner_size: Extent,
	window_content: Rectangle,
	main_webview_bounds: Rectangle,
	child_webview_bounds: Rectangle,
	main_webview_bounds_after_one_refit: Option<Rectangle>,
	main_webview_fills_the_window: bool,
	main_page_viewport: Option<Extent>,
}

impl Mount {
	fn refusal(&self) -> String {
		let Extent { width, height } = self.window_inner_size;
		let content = self.window_content;
		let after_one_refit = match self.main_webview_bounds_after_one_refit {
			Some(bounds) => format!("{bounds} after one refit to the window inner size"),
			None => "no refit".to_owned(),
		};
		format!(
			"the main webview does not fill the window: window inner size {width} x {height}, window content {content}, main webview bounds {}, then {after_one_refit}, child webview bounds {}",
			self.main_webview_bounds, self.child_webview_bounds
		)
	}
}

#[derive(Serialize)]
struct Drawn {
	capture: String,
	paint: &'static str,
	rectangle_in_window_points: Rectangle,
	painted_box_in_capture_pixels: PaintedBox,
	share_of_the_box_painted: f64,
}

#[derive(Serialize)]
pub struct Sighting {
	name: &'static str,
	placeholder_reported_by_the_page: Rectangle,
	page_origin_the_host_placed_from: Shift,
	rectangle_asked: Rectangle,
	child_webview_bounds_read_back: Rectangle,
	pixels_per_point: f64,
	placeholder_drawn: Drawn,
	view_drawn: Drawn,
	view_offset_from_its_placeholder: Shift,
	view_size_minus_placeholder_size: Extent,
	page_origin_drawn_in_the_main_webview: Shift,
}

impl Sighting {
	pub fn is_drawn_over_its_placeholder(&self) -> bool {
		let Extent { width, height } = self.view_size_minus_placeholder_size;
		!self.view_offset_from_its_placeholder.exceeds_the_tolerance()
			&& width.abs().max(height.abs()) <= PIXEL_TOLERANCE
	}
}

struct Frame {
	region: Rectangle,
	inner_origin: Shift,
}

pub struct ThreadPlay {
	pub mount: Result<Mount, String>,
	pub native_geometry: Value,
	pub sightings: Vec<Result<Sighting, String>>,
	pub behaviours: Vec<Behaviour>,
}

impl ThreadPlay {
	pub fn is_drawn_over_its_placeholder(&self) -> Option<bool> {
		let last = self.sightings.last()?.as_ref().ok()?;
		Some(last.is_drawn_over_its_placeholder())
	}
}

pub struct Stage<'a> {
	pub main_window: &'a WebviewWindow,
	pub thread_view: &'a ThreadView,
	pub seat: &'a Seat,
}

impl Stage<'_> {
	pub fn play(&self, document_requests: impl Fn() -> usize) -> ThreadPlay {
		let mount = self.mount().map_err(|cause| format!("the mount could not be read: {cause}"));
		let native_geometry = self.native_geometry();
		let refusal = match &mount {
			Ok(mount) if mount.main_webview_fills_the_window => None,
			Ok(mount) => Some(mount.refusal()),
			Err(cause) => Some(cause.clone()),
		};
		if let Some(refusal) = refusal {
			let behaviours = not_played(&refusal);
			return ThreadPlay { mount, native_geometry, sightings: Vec::new(), behaviours };
		}
		let mut sightings = vec![self.sight("as-mounted")];
		let correction = sightings[0].as_ref().ok().and_then(|sighting| {
			sighting
				.view_offset_from_its_placeholder
				.exceeds_the_tolerance()
				.then_some(sighting.page_origin_drawn_in_the_main_webview)
		});
		if let Some(page_origin) = correction {
			self.thread_view.place_from(page_origin);
		}
		let behaviours = match self.observe(document_requests) {
			Ok(observed) => observed.behaviours(),
			Err(reason) => not_played(&reason),
		};
		if correction.is_some() {
			sightings.push(self.sight("corrected"));
		}
		ThreadPlay { mount, native_geometry, sightings, behaviours }
	}

	#[cfg(target_os = "macos")]
	fn native_geometry(&self) -> Value {
		use crate::cocoa;
		use crate::probe::evidence;
		let main_webview: &Webview = self.main_window.as_ref();
		let (window, main_webview, view) = (
			cocoa::window(main_webview),
			cocoa::view(main_webview),
			cocoa::view(self.seat.webview()),
		);
		let difference = match (&window, &main_webview, &view) {
			(Ok(window), Ok(main_webview), Ok(view)) => json!({
				"cause": cocoa::inset_cause(window, main_webview, view),
				"upstream_sources": cocoa::INSET_SOURCES,
			}),
			_ => json!({ "unavailable": "the AppKit geometry could not be read" }),
		};
		json!({
			"read_from": "AppKit, on the main thread, after the mount",
			"host_may_capture_the_screen": cocoa::is_allowed_to_capture_the_screen(),
			"main_page_viewport_and_main_webview_bounds_difference": difference,
			"window": evidence(&window),
			"main_webview": evidence(&main_webview),
			"child_webview": evidence(&view),
		})
	}

	#[cfg(target_os = "linux")]
	fn native_geometry(&self) -> Value {
		json!({
			"read_from": "GTK, on the main thread, after the mount",
			"widget_tree": crate::probe::evidence(&crate::layer::widget_tree(self.main_window.as_ref())),
		})
	}

	#[cfg(not(any(target_os = "macos", target_os = "linux")))]
	fn native_geometry(&self) -> Value {
		Value::Null
	}

	#[cfg(target_os = "linux")]
	fn window_content(&self, _inner: Rectangle) -> Result<Rectangle, String> {
		crate::layer::window_content(self.main_window.as_ref())
	}

	#[cfg(not(target_os = "linux"))]
	fn window_content(&self, inner: Rectangle) -> Result<Rectangle, String> {
		Ok(inner)
	}

	fn frame(&self) -> tauri::Result<Frame> {
		let scale = self.main_window.scale_factor()?;
		let outer = self.main_window.outer_position()?.to_logical::<f64>(scale);
		let inner = self.main_window.inner_position()?.to_logical::<f64>(scale);
		let size = self.main_window.outer_size()?.to_logical::<f64>(scale);
		Ok(Frame {
			region: Rectangle { x: outer.x, y: outer.y, width: size.width, height: size.height },
			inner_origin: Shift { x: inner.x - outer.x, y: inner.y - outer.y },
		})
	}

	#[cfg(target_os = "macos")]
	fn shot(&self, _frame: &Frame) -> Result<Shot, String> {
		crate::cocoa::window_number(self.main_window.as_ref()).map(Shot::Window)
	}

	#[cfg(not(target_os = "macos"))]
	fn shot(&self, frame: &Frame) -> Result<Shot, String> {
		Ok(Shot::Region(frame.region))
	}

	fn drawn(&self, name: &str, paint: Paint) -> Result<Drawn, String> {
		thread::sleep(DRAWING_SETTLE);
		let frame = self.frame().map_err(|cause| cause.to_string())?;
		let bitmap_file =
			PathBuf::from(format!("capture-{}-in-thread-{name}-{}.bmp", run_name(), paint.name));
		let bitmap: Bitmap = capture::grab(&self.shot(&frame)?, &bitmap_file)?;
		let file = capture::kept_as_a_picture(&bitmap_file)?.display().to_string();
		let painted = bitmap.painted_box(paint).ok_or_else(|| {
			format!(
				"{file} holds no {} pixel: the capture is {} x {} pixels for a region of {}",
				paint.name, bitmap.width, bitmap.height, frame.region
			)
		})?;
		if painted.painted_share() < SOLID_SHARE {
			return Err(format!(
				"{file} holds {} pixels in more than one place: {} of them in a box of {} x {} at {}, {}",
				paint.name, painted.painted_pixels, painted.width, painted.height, painted.left, painted.top
			));
		}
		let pixels_per_point = bitmap.width as f64 / frame.region.width;
		Ok(Drawn {
			capture: file,
			paint: paint.css,
			rectangle_in_window_points: painted
				.in_points(pixels_per_point)
				.moved_by(frame.inner_origin.reversed()),
			painted_box_in_capture_pixels: painted,
			share_of_the_box_painted: painted.painted_share(),
		})
	}

	fn sight(&self, name: &'static str) -> Result<Sighting, String> {
		let through_tauri = |done: tauri::Result<()>| done.map_err(|cause| cause.to_string());
		through_tauri(self.main_window.eval(format!(
			"window.__spikeThread.paintPlaceholder(\"{}\")",
			PLACEHOLDER_PAINT.css
		)))?;
		through_tauri(
			self.seat.webview().eval(VIEW_PAINT_SCRIPT.replace("PAINT", VIEW_PAINT.css)),
		)?;
		self.seat.show(false)?;
		let placeholder_drawn = self.drawn(name, PLACEHOLDER_PAINT);
		let page_origin = self.thread_view.page_origin();
		self.thread_view.place_from(page_origin);
		let placeholder_drawn = placeholder_drawn?;
		let view_drawn = self.drawn(name, VIEW_PAINT)?;
		let report = self.thread_view.latest_report().ok_or(NO_REPORT)?;
		let target = report.target().ok_or("the placeholder is hidden or under an overlay")?;
		let (placeholder, view) =
			(placeholder_drawn.rectangle_in_window_points, view_drawn.rectangle_in_window_points);
		Ok(Sighting {
			name,
			placeholder_reported_by_the_page: target,
			page_origin_the_host_placed_from: page_origin,
			rectangle_asked: target.moved_by(page_origin),
			child_webview_bounds_read_back: self.seat.rectangle()?,
			pixels_per_point: view_drawn.painted_box_in_capture_pixels.width as f64 / view.width,
			view_offset_from_its_placeholder: Shift {
				x: view.x - placeholder.x,
				y: view.y - placeholder.y,
			},
			view_size_minus_placeholder_size: Extent {
				width: view.width - placeholder.width,
				height: view.height - placeholder.height,
			},
			page_origin_drawn_in_the_main_webview: Shift {
				x: (placeholder.x - target.x).round(),
				y: (placeholder.y - target.y).round(),
			},
			placeholder_drawn,
			view_drawn,
		})
	}

	fn mount(&self) -> tauri::Result<Mount> {
		let main_webview: &Webview = self.main_window.as_ref();
		let scale = self.main_window.scale_factor()?;
		let inner = self.main_window.inner_size()?.to_logical::<f64>(scale);
		let inner = Rectangle { x: 0.0, y: 0.0, width: inner.width, height: inner.height };
		let window = self.window_content(inner).map_err(std::io::Error::other)?;
		let main_webview_bounds = bounds_of(main_webview)?;
		let child_webview_bounds = self.seat.rectangle().map_err(std::io::Error::other)?;
		let main_webview_bounds_after_one_refit = if main_webview_bounds.matches(window) {
			None
		} else {
			let known = self.thread_view.placements().len();
			main_webview.set_bounds(window.into())?;
			let refitted = bounds_of(main_webview)?;
			if let Err(stillness) = self.settled_placement(known) {
				eprintln!("the refit of the main webview moved no placement: {stillness}");
			}
			Some(refitted)
		};
		Ok(Mount {
			window_inner_size: Extent { width: inner.width, height: inner.height },
			window_content: window,
			main_webview_bounds,
			child_webview_bounds,
			main_webview_fills_the_window: main_webview_bounds_after_one_refit
				.unwrap_or(main_webview_bounds)
				.matches(window),
			main_webview_bounds_after_one_refit,
			main_page_viewport: self.thread_view.latest_report().map(|report| report.viewport),
		})
	}

	fn settled_placement(&self, known: usize) -> Result<Placement, String> {
		let placements = || self.thread_view.placements();
		if !wait_until(PLACEMENT_TIMEOUT, || placements().len() > known) {
			return Err("the main page reported no placement".to_owned());
		}
		let is_quiet = || {
			let seen = placements().len();
			thread::sleep(PLACEMENT_SETTLE);
			placements().len() == seen
		};
		if !wait_until(PLACEMENT_TIMEOUT, is_quiet) {
			return Err("the main page never stopped reporting placements".to_owned());
		}
		placements().pop().ok_or_else(|| "the host applied no placement".to_owned())
	}

	fn after(&self, action: String, act: impl FnOnce() -> tauri::Result<()>) -> Step {
		let known = self.thread_view.placements().len();
		let outcome =
			act().map_err(|cause| cause.to_string()).and_then(|()| self.settled_placement(known));
		Step { action, outcome }
	}

	fn page(&self, call: String) -> Step {
		let script = format!("window.__spikeThread.{call}");
		self.after(call, || self.main_window.eval(script))
	}

	fn scroll_to(&self, offset: f64) -> Step {
		self.page(format!("scrollPlaceholderTo({})", offset.round()))
	}

	fn resize_to(&self, (width, height): (f64, f64)) -> Step {
		self.after(format!("resize the main window to {width} x {height}"), || {
			self.main_window.set_size(LogicalSize::new(width, height))
		})
	}

	fn observe(&self, document_requests: impl Fn() -> usize) -> Result<Observed, String> {
		let rest = self.thread_view.latest_report().ok_or(NO_REPORT)?;
		let (column, placeholder) = (rest.column.height, rest.placeholder.height);
		let free = column - placeholder;
		if free <= 0.0 {
			return Err(format!(
				"the placeholder, {placeholder} px high, does not fit the {column} px of the visible column"
			));
		}
		let scrolls = [0.0, free, free / 2.0].map(|offset| self.scroll_to(offset)).into();
		let cut = [-placeholder / 2.0, column - placeholder / 2.0]
			.map(|offset| self.scroll_to(offset))
			.into();
		let outside = [-placeholder - OUTSIDE_MARGIN, column + OUTSIDE_MARGIN]
			.map(|offset| self.scroll_to(offset))
			.into();
		let rest = self.scroll_to(free / 2.0);
		let overlays = OVERLAYS
			.map(|kind| OverlayRun {
				kind,
				opened: self.page(format!("openOverlay(\"{kind}\")")),
				closed: self.page(format!("closeOverlay(\"{kind}\")")),
			})
			.into();
		let resizes = WINDOW_SIZES.map(|size| self.resize_to(size)).into();
		let target_before_enlarging =
			self.thread_view.latest_report().and_then(|report| report.visible_placeholder());
		let requests_before = document_requests();
		let enlarged = self.page("enlarge()".to_owned());
		let brought_back = self.page("bringBack()".to_owned());
		Ok(Observed {
			scrolls,
			cut,
			outside,
			rest,
			overlays,
			resizes,
			target_before_enlarging,
			enlarged,
			brought_back,
			document_requests: (requests_before, document_requests()),
		})
	}
}
