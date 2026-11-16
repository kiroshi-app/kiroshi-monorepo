use std::thread;
use std::time::Duration;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::{LogicalSize, WebviewWindow};

use crate::placement::{Placement, Rectangle, ThreadView, PIXEL_TOLERANCE};
use crate::proofs::Verdict;
use crate::scenario::wait_until;
use crate::windows::{WINDOW_HEIGHT, WINDOW_WIDTH};

const PLACEMENT_TIMEOUT: Duration = Duration::from_secs(3);
const PLACEMENT_SETTLE: Duration = Duration::from_millis(300);
const OUTSIDE_MARGIN: f64 = 24.0;
const WINDOW_SIZES: [(f64, f64); 2] =
	[(WINDOW_WIDTH + 140.0, WINDOW_HEIGHT + 120.0), (WINDOW_WIDTH, WINDOW_HEIGHT)];
const OVERLAYS: [&str; 3] = ["menu", "popover", "sheet"];
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
		let covered = applied.is_visible.then(|| applied.bounds.intersection(rectangle)).flatten();
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

pub struct Stage<'a> {
	pub main_window: &'a WebviewWindow,
	pub thread_view: &'a ThreadView,
}

impl Stage<'_> {
	pub fn play(&self, document_requests: impl Fn() -> usize) -> Vec<Behaviour> {
		match self.observe(document_requests) {
			Ok(observed) => observed.behaviours(),
			Err(reason) => not_played(&reason),
		}
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
		let rest = self
			.thread_view
			.latest_report()
			.ok_or("the main page reported no placeholder rectangle")?;
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
