use std::fmt;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{LogicalPosition, LogicalSize, Rect, Webview};

use crate::sensors::locked;

pub const PLACEMENT_EVENT: &str = "spike-view-placement";
pub const PIXEL_TOLERANCE: f64 = 1.0;

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Serialize)]
pub struct Rectangle {
	pub x: f64,
	pub y: f64,
	pub width: f64,
	pub height: f64,
}

impl Rectangle {
	pub fn intersection(self, other: Self) -> Option<Self> {
		let x = self.x.max(other.x);
		let y = self.y.max(other.y);
		let width = (self.x + self.width).min(other.x + other.width) - x;
		let height = (self.y + self.height).min(other.y + other.height) - y;
		(width > 0.0 && height > 0.0).then_some(Self { x, y, width, height })
	}

	pub fn area(self) -> f64 {
		self.width * self.height
	}

	pub fn largest_difference(self, other: Self) -> f64 {
		[self.x - other.x, self.y - other.y, self.width - other.width, self.height - other.height]
			.into_iter()
			.map(f64::abs)
			.fold(0.0, f64::max)
	}

	pub fn matches(self, other: Self) -> bool {
		self.largest_difference(other) <= PIXEL_TOLERANCE
	}

	pub fn moved_by(self, shift: Shift) -> Self {
		Self { x: self.x + shift.x, y: self.y + shift.y, ..self }
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize)]
pub struct Shift {
	pub x: f64,
	pub y: f64,
}

impl Shift {
	pub fn reversed(self) -> Self {
		Self { x: -self.x, y: -self.y }
	}

	pub fn exceeds_the_tolerance(self) -> bool {
		self.x.abs().max(self.y.abs()) > PIXEL_TOLERANCE
	}
}

impl fmt::Display for Rectangle {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		let Self { x, y, width, height } = self;
		write!(formatter, "{width} x {height} at {x}, {y}")
	}
}

impl From<Rectangle> for Rect {
	fn from(rectangle: Rectangle) -> Self {
		Self {
			position: LogicalPosition::new(rectangle.x, rectangle.y).into(),
			size: LogicalSize::new(rectangle.width, rectangle.height).into(),
		}
	}
}

#[derive(Clone, Copy, Deserialize, Serialize)]
pub struct Extent {
	pub width: f64,
	pub height: f64,
}

#[derive(Clone, Deserialize, Serialize)]
pub struct Overlay {
	pub kind: String,
	pub rectangle: Rectangle,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlacementReport {
	pub sequence: u64,
	pub cause: String,
	pub caused_at_epoch_ms: u64,
	pub viewport: Extent,
	pub placeholder: Rectangle,
	pub column: Rectangle,
	pub overlays: Vec<Overlay>,
}

impl PlacementReport {
	pub fn visible_placeholder(&self) -> Option<Rectangle> {
		self.placeholder.intersection(self.column)
	}

	pub fn target(&self) -> Option<Rectangle> {
		let visible = self.visible_placeholder()?;
		let is_under_an_overlay =
			self.overlays.iter().any(|overlay| overlay.rectangle.intersection(visible).is_some());
		(!is_under_an_overlay).then_some(visible)
	}
}

#[derive(Clone, Copy)]
pub struct Applied {
	pub bounds: Rectangle,
	pub page_origin: Shift,
	pub is_visible: bool,
	pub delay_ms: u128,
}

impl Applied {
	pub fn bounds_in_the_page(&self) -> Rectangle {
		self.bounds.moved_by(self.page_origin.reversed())
	}
}

#[derive(Clone)]
pub struct Placement {
	pub report: PlacementReport,
	pub applied: Result<Applied, String>,
}

impl Placement {
	pub fn shows(&self, expected: Rectangle) -> bool {
		self.applied.as_ref().is_ok_and(|applied| {
			applied.is_visible && applied.bounds_in_the_page().matches(expected)
		})
	}

	pub fn hides(&self) -> bool {
		self.applied.as_ref().is_ok_and(|applied| !applied.is_visible)
	}

	pub fn evidence(&self) -> Value {
		let intersection = self.report.visible_placeholder();
		let mut evidence = json!({
			"reported_on": self.report.cause,
			"placeholder": self.report.placeholder,
			"visible_column": self.report.column,
			"intersection": intersection,
		});
		match &self.applied {
			Ok(applied) => {
				evidence["child_webview_bounds"] = json!(applied.bounds);
				evidence["page_origin_in_the_main_webview"] = json!(applied.page_origin);
				evidence["child_webview_visible"] = json!(applied.is_visible);
				evidence["bounds_differ_from_the_intersection_by_px"] = json!(intersection
					.map(|visible| applied.bounds_in_the_page().largest_difference(visible)));
				evidence["delay_from_the_page_event_to_the_bounds_applied_ms"] =
					json!(applied.delay_ms);
			}
			Err(cause) => evidence["fault"] = json!(cause),
		}
		evidence
	}
}

pub fn bounds_of(webview: &Webview) -> tauri::Result<Rectangle> {
	let scale = webview.window().scale_factor()?;
	let bounds = webview.bounds()?;
	let position = bounds.position.to_logical::<f64>(scale);
	let size = bounds.size.to_logical::<f64>(scale);
	Ok(Rectangle { x: position.x, y: position.y, width: size.width, height: size.height })
}

#[derive(Clone)]
pub enum Seat {
	Bounds(Webview),
	#[cfg(target_os = "linux")]
	Layer(Webview),
}

#[derive(Clone, Copy, Default)]
pub enum Seating {
	#[default]
	Bounds,
	#[cfg(target_os = "linux")]
	Layer(crate::layer::Holder),
}

impl Seat {
	pub fn take(webview: Webview, seating: Seating) -> Result<Self, String> {
		match seating {
			Seating::Bounds => Ok(Self::Bounds(webview)),
			#[cfg(target_os = "linux")]
			Seating::Layer(holder) => {
				crate::layer::raise(&webview, holder)?;
				Ok(Self::Layer(webview))
			}
		}
	}

	pub fn webview(&self) -> &Webview {
		match self {
			Self::Bounds(webview) => webview,
			#[cfg(target_os = "linux")]
			Self::Layer(webview) => webview,
		}
	}

	fn move_to(&self, target: Rectangle) -> Result<(), String> {
		match self {
			Self::Bounds(webview) => {
				webview.set_bounds(target.into()).map_err(|cause| cause.to_string())
			}
			#[cfg(target_os = "linux")]
			Self::Layer(webview) => crate::layer::show_at(webview, target),
		}
	}

	pub fn rectangle(&self) -> Result<Rectangle, String> {
		match self {
			Self::Bounds(webview) => bounds_of(webview).map_err(|cause| cause.to_string()),
			#[cfg(target_os = "linux")]
			Self::Layer(webview) => crate::layer::rectangle_over_the_main_webview(webview),
		}
	}

	pub fn show(&self, is_shown: bool) -> Result<(), String> {
		let webview = self.webview();
		let shown = if is_shown { webview.show() } else { webview.hide() };
		shown.map_err(|cause| cause.to_string())
	}
}

fn apply(seat: &Seat, report: &PlacementReport, page_origin: Shift) -> Result<Applied, String> {
	let target = report.target();
	if let Some(target) = target {
		seat.move_to(target.moved_by(page_origin))?;
	}
	seat.show(target.is_some())?;
	let bounds = seat.rectangle()?;
	let applied_at_epoch_ms = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_err(|cause| cause.to_string())?
		.as_millis();
	Ok(Applied {
		bounds,
		page_origin,
		is_visible: target.is_some(),
		delay_ms: applied_at_epoch_ms.saturating_sub(u128::from(report.caused_at_epoch_ms)),
	})
}

#[derive(Default)]
struct Followed {
	seat: Option<Seat>,
	page_origin: Shift,
	latest: Option<PlacementReport>,
	placements: Vec<Placement>,
}

impl Followed {
	fn place(&mut self) {
		let (Some(seat), Some(report)) = (&self.seat, &self.latest) else {
			return;
		};
		let applied = apply(seat, report, self.page_origin);
		self.placements.push(Placement { report: report.clone(), applied });
	}
}

#[derive(Default)]
pub struct ThreadView {
	followed: Mutex<Followed>,
}

impl ThreadView {
	pub fn follow(&self, report: PlacementReport) {
		let mut followed = locked(&self.followed);
		if followed.latest.as_ref().is_some_and(|latest| latest.sequence >= report.sequence) {
			return;
		}
		followed.latest = Some(report);
		followed.place();
	}

	pub fn attach(&self, seat: Seat) {
		let mut followed = locked(&self.followed);
		followed.seat = Some(seat);
		followed.place();
	}

	pub fn detach(&self) {
		locked(&self.followed).seat = None;
	}

	pub fn place_from(&self, page_origin: Shift) {
		let mut followed = locked(&self.followed);
		followed.page_origin = page_origin;
		followed.place();
	}

	pub fn page_origin(&self) -> Shift {
		locked(&self.followed).page_origin
	}

	pub fn latest_report(&self) -> Option<PlacementReport> {
		locked(&self.followed).latest.clone()
	}

	pub fn placements(&self) -> Vec<Placement> {
		locked(&self.followed).placements.clone()
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const COLUMN: Rectangle = Rectangle { x: 16.0, y: 40.0, width: 500.0, height: 300.0 };

	fn report(placeholder: Rectangle, overlays: Vec<Overlay>) -> PlacementReport {
		PlacementReport {
			sequence: 1,
			cause: "scroll".to_owned(),
			caused_at_epoch_ms: 0,
			viewport: Extent { width: 560.0, height: 420.0 },
			placeholder,
			column: COLUMN,
			overlays,
		}
	}

	#[test]
	fn a_placeholder_inside_the_column_is_its_own_target() {
		let placeholder = Rectangle { x: 28.0, y: 100.0, width: 476.0, height: 160.0 };
		assert_eq!(report(placeholder, Vec::new()).target(), Some(placeholder));
	}

	#[test]
	fn a_placeholder_cut_by_the_column_edge_targets_the_intersection() {
		let placeholder = Rectangle { x: 28.0, y: -40.0, width: 476.0, height: 160.0 };
		let visible = Rectangle { x: 28.0, y: 40.0, width: 476.0, height: 80.0 };
		assert_eq!(report(placeholder, Vec::new()).target(), Some(visible));
	}

	#[test]
	fn a_placeholder_outside_the_column_has_no_target() {
		let placeholder = Rectangle { x: 28.0, y: 340.0, width: 476.0, height: 160.0 };
		assert_eq!(report(placeholder, Vec::new()).target(), None);
	}

	#[test]
	fn an_overlay_over_the_visible_placeholder_removes_the_target() {
		let placeholder = Rectangle { x: 28.0, y: 100.0, width: 476.0, height: 160.0 };
		let menu = Overlay {
			kind: "menu".to_owned(),
			rectangle: Rectangle { x: 52.0, y: 124.0, width: 160.0, height: 120.0 },
		};
		assert_eq!(report(placeholder, vec![menu]).target(), None);
	}

	#[test]
	fn an_overlay_beside_the_placeholder_keeps_the_target() {
		let placeholder = Rectangle { x: 28.0, y: 100.0, width: 476.0, height: 160.0 };
		let menu = Overlay {
			kind: "menu".to_owned(),
			rectangle: Rectangle { x: 52.0, y: 270.0, width: 160.0, height: 60.0 },
		};
		assert_eq!(report(placeholder, vec![menu]).target(), Some(placeholder));
	}

	#[test]
	fn bounds_set_from_a_page_origin_are_compared_in_page_coordinates() {
		let placeholder = Rectangle { x: 28.0, y: 100.0, width: 476.0, height: 160.0 };
		let page_origin = Shift { x: 0.0, y: 32.0 };
		let applied = Applied {
			bounds: placeholder.moved_by(page_origin),
			page_origin,
			is_visible: true,
			delay_ms: 0,
		};
		let placement = Placement { report: report(placeholder, Vec::new()), applied: Ok(applied) };
		assert!(placement.shows(placeholder));
		assert!(!placement.shows(placeholder.moved_by(page_origin)));
	}

	#[test]
	fn rectangles_one_pixel_apart_match_and_two_pixels_apart_do_not() {
		let placeholder = Rectangle { x: 28.0, y: 100.0, width: 476.0, height: 160.0 };
		assert!(placeholder.matches(Rectangle { y: 101.0, ..placeholder }));
		assert!(!placeholder.matches(Rectangle { height: 162.0, ..placeholder }));
	}
}
