use std::cell::RefCell;
use std::thread;
use std::time::Duration;

use gtk::prelude::*;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::{LogicalPosition, LogicalSize, Webview, WebviewWindow};
use wry::{WebViewBuilder, WebViewBuilderExtUnix, WebViewExtUnix};

use crate::layer::{self, Holder};
use crate::native;
use crate::placement::{bounds_of, Rectangle};
use crate::windows::open_blank_child;

const PROBE_LABEL: &str = "placement-probe";
const PROBE_URL: &str = "about:blank";
const LAYOUT_SETTLE: Duration = Duration::from_millis(500);
const GTK_ALLOCATION: &str =
	"the GTK allocation of the webview widget, translated to the window content";
const X11_ATTRIBUTES: &str =
	"XGetWindowAttributes on the X11 child window, through the bounds getter of wry";
const HOLDS: &str = "holds";
const FAILS: &str = "fails";
const PACKING_SOURCE: &str = "tauri-runtime-wry 2.12.1 src/lib.rs:5171-5174 builds every webview of a window with build_gtk on the default vbox of the window, and wry 0.57.0 src/webkitgtk/mod.rs:690-694 adds it to that GtkBox with pack_start(webview, true, true, 0)";
const BOUNDS_SOURCE: &str = "wry 0.57.0 src/webkitgtk/mod.rs:957-958 reads only allocated_size outside an X11 child window, so the position is always 0, 0, and src/webkitgtk/mod.rs:963-984 set_bounds acts only on an X11 child window or on a webview built in a GtkFixed";

thread_local! {
	static WRY_PROBE: RefCell<Option<wry::WebView>> = const { RefCell::new(None) };
}

#[derive(Default, Serialize)]
struct Reading {
	rectangle_read_back: Option<Rectangle>,
	rectangle_read_back_from: &'static str,
	rectangle_read_back_through_the_bounds_getter: Option<Rectangle>,
	main_webview_bounds_read_back: Option<Rectangle>,
	main_webview_bounds_read_back_through_tauri: Option<Rectangle>,
	window_content: Option<Rectangle>,
	faults: Vec<String>,
	widget_tree: Value,
}

#[derive(Clone, Copy, Serialize)]
struct Way {
	name: &'static str,
	calls: &'static str,
	is_a_webview_tauri_manages: bool,
}

impl Way {
	const fn of_tauri(name: &'static str, calls: &'static str) -> Self {
		Self { name, calls, is_a_webview_tauri_manages: true }
	}

	const fn of_wry_alone(name: &'static str, calls: &'static str) -> Self {
		Self { name, calls, is_a_webview_tauri_manages: false }
	}
}

#[derive(Serialize)]
pub struct Trial {
	#[serde(flatten)]
	way: Way,
	rectangle_asked: Rectangle,
	#[serde(flatten)]
	reading: Reading,
	result: &'static str,
	reason: String,
}

impl Trial {
	fn judged(way: Way, rectangle_asked: Rectangle, reading: Reading) -> Self {
		let verdict = verdict_of(rectangle_asked, &reading);
		Self {
			way,
			rectangle_asked,
			reading,
			result: if verdict.is_ok() { HOLDS } else { FAILS },
			reason: verdict.unwrap_or_else(|reason| reason),
		}
	}

	fn not_mounted(way: Way, rectangle_asked: Rectangle, cause: String) -> Self {
		Self {
			way,
			rectangle_asked,
			reading: Reading {
				rectangle_read_back_from: "nothing: the view was not mounted",
				..Reading::default()
			},
			result: FAILS,
			reason: format!("the view could not be mounted this way: {cause}"),
		}
	}

	pub fn holds(&self) -> bool {
		self.result == HOLDS
	}

	pub fn name(&self) -> &'static str {
		self.way.name
	}
}

fn verdict_of(asked: Rectangle, reading: &Reading) -> Result<String, String> {
	let (Some(view), Some(main_webview), Some(content)) = (
		reading.rectangle_read_back,
		reading.main_webview_bounds_read_back,
		reading.window_content,
	) else {
		return Err(format!("a rectangle could not be read back: {}", reading.faults.join("; ")));
	};
	let fills = main_webview.matches(content);
	let sits = view.matches(asked);
	if fills && sits {
		return Ok(format!(
			"the main webview fills the window content, {content}, and the view sits at {view}, within 1 px of the {asked} asked for"
		));
	}
	let mut reasons = Vec::new();
	if !fills {
		reasons.push(format!(
			"the main webview is at {main_webview} where the window content is {content}"
		));
	}
	if !sits {
		reasons.push(format!("the view is at {view} where {asked} was asked for"));
	}
	Err(reasons.join(", and "))
}

fn kept<T>(reading: Result<T, String>, faults: &mut Vec<String>) -> Option<T> {
	reading.map_err(|fault| faults.push(fault)).ok()
}

struct Bench<'a> {
	main_window: &'a WebviewWindow,
	asked: Rectangle,
}

impl Bench<'_> {
	fn main_webview(&self) -> &Webview {
		self.main_window.as_ref()
	}

	fn reading(
		&self,
		view: Result<Rectangle, String>,
		view_read_from: &'static str,
		view_through_the_getter: Result<Rectangle, String>,
	) -> Reading {
		let main_webview = self.main_webview();
		let mut faults = Vec::new();
		Reading {
			rectangle_read_back: kept(view, &mut faults),
			rectangle_read_back_from: view_read_from,
			rectangle_read_back_through_the_bounds_getter: kept(
				view_through_the_getter,
				&mut faults,
			),
			main_webview_bounds_read_back: kept(
				layer::rectangle_read_by_gtk(main_webview),
				&mut faults,
			),
			main_webview_bounds_read_back_through_tauri: kept(
				bounds_of(main_webview).map_err(|cause| cause.to_string()),
				&mut faults,
			),
			window_content: kept(layer::window_content(main_webview), &mut faults),
			widget_tree: layer::widget_tree(main_webview)
				.unwrap_or_else(|fault| json!({ "unavailable": fault })),
			faults,
		}
	}

	fn reading_of(&self, probe: &Webview) -> Reading {
		thread::sleep(LAYOUT_SETTLE);
		self.reading(
			layer::rectangle_read_by_gtk(probe),
			GTK_ALLOCATION,
			bounds_of(probe).map_err(|cause| cause.to_string()),
		)
	}

	fn reading_of_the_wry_probe(&self, is_in_the_window_content: bool) -> Reading {
		thread::sleep(LAYOUT_SETTLE);
		let read = native::read(self.main_webview(), move |_| {
			WRY_PROBE.with_borrow(|probe| {
				let probe = probe.as_ref().ok_or("the wry webview is gone")?;
				let bounds = probe.bounds().map_err(|cause| cause.to_string())?;
				let scale = f64::from(probe.webview().scale_factor());
				let position = bounds.position.to_logical::<f64>(scale);
				let size = bounds.size.to_logical::<f64>(scale);
				let by_wry = Rectangle {
					x: position.x,
					y: position.y,
					width: size.width,
					height: size.height,
				};
				let by_gtk = is_in_the_window_content
					.then(|| layer::rectangle_in_the_window_content(probe.webview().upcast_ref()))
					.transpose()?;
				Ok::<_, String>((by_wry, by_gtk))
			})
		});
		match read.and_then(|read| read) {
			Ok((by_wry, Some(by_gtk))) => self.reading(Ok(by_gtk), GTK_ALLOCATION, Ok(by_wry)),
			Ok((by_wry, None)) => self.reading(Ok(by_wry), X11_ATTRIBUTES, Ok(by_wry)),
			Err(fault) => self.reading(Err(fault.clone()), X11_ATTRIBUTES, Err(fault)),
		}
	}

	fn tauri_trials(&self, trials: &mut Vec<Trial>) -> Option<Holder> {
		const ADD_CHILD: Way = Way::of_tauri(
			"tauri-window-add-child",
			"tauri::Window::add_child(builder, position, size) with the rectangle asked for",
		);
		let asked = self.asked;
		let probe = match open_blank_child(self.main_window, PROBE_LABEL, PROBE_URL, asked) {
			Ok(probe) => probe,
			Err(cause) => {
				trials.push(Trial::not_mounted(ADD_CHILD, asked, cause.to_string()));
				return None;
			}
		};
		let mut record = |way: Way, moved: Result<(), String>| {
			let trial = match moved {
				Ok(()) => Trial::judged(way, asked, self.reading_of(&probe)),
				Err(cause) => Trial::not_mounted(way, asked, cause),
			};
			let holds = trial.holds();
			trials.push(trial);
			holds
		};
		let through_tauri = |moved: tauri::Result<()>| moved.map_err(|cause| cause.to_string());
		record(ADD_CHILD, Ok(()));
		record(
			Way::of_tauri(
				"tauri-webview-set-bounds",
				"tauri::Webview::set_bounds(rectangle) on the child webview add_child mounted",
			),
			through_tauri(probe.set_bounds(asked.into())),
		);
		record(
			Way::of_tauri(
				"tauri-webview-set-position-and-size",
				"tauri::Webview::set_position(position) then tauri::Webview::set_size(size) on the same child webview",
			),
			through_tauri(
				probe
					.set_position(LogicalPosition::new(asked.x, asked.y))
					.and_then(|()| probe.set_size(LogicalSize::new(asked.width, asked.height))),
			),
		);
		let layered = [
			(
				Holder::FixedBoard,
				"gtk-fixed-over-the-main-webview",
				"GTK on the widget tauri::Webview::with_webview gives: the main webview moves from the default vbox into a GtkOverlay packed in its place, a pass-through GtkFixed is added with gtk_overlay_add_overlay, the view widget moves into it with gtk_fixed_put, then gtk_widget_set_size_request and gtk_fixed_move",
			),
			(
				Holder::OverlayMargins,
				"gtk-overlay-margins",
				"GTK on the same widget: the view is added to the GtkOverlay with gtk_overlay_add_overlay, aligned to the start on both axes, then placed with gtk_widget_set_margin_start, gtk_widget_set_margin_top and gtk_widget_set_size_request",
			),
		]
		.map(|(holder, name, calls)| {
			let moved = layer::raise(&probe, holder).and_then(|()| layer::show_at(&probe, asked));
			record(Way::of_tauri(name, calls), moved).then_some(holder)
		});
		if let Err(cause) = probe.close() {
			eprintln!("the placement probe could not be closed: {cause}");
		}
		thread::sleep(LAYOUT_SETTLE);
		layered.into_iter().flatten().next()
	}

	fn wry_trial(
		&self,
		way: Way,
		is_in_the_window_content: bool,
		build: impl FnOnce(WebViewBuilder<'_>, &gtk::Widget) -> Result<wry::WebView, String>
			+ Send
			+ 'static,
	) -> Trial {
		let asked = self.asked;
		let built = native::read(self.main_webview(), move |platform| {
			let bounds = wry::Rect {
				position: wry::dpi::LogicalPosition::new(asked.x, asked.y).into(),
				size: wry::dpi::LogicalSize::new(asked.width, asked.height).into(),
			};
			let builder = WebViewBuilder::new().with_url(PROBE_URL).with_bounds(bounds);
			let probe = build(builder, platform.inner().upcast_ref())?;
			probe.set_bounds(bounds).map_err(|cause| cause.to_string())?;
			WRY_PROBE.set(Some(probe));
			Ok::<_, String>(())
		});
		let trial = match built.and_then(|built| built) {
			Ok(()) => {
				Trial::judged(way, asked, self.reading_of_the_wry_probe(is_in_the_window_content))
			}
			Err(cause) => Trial::not_mounted(way, asked, cause),
		};
		if let Err(cause) = native::read(self.main_webview(), |_| WRY_PROBE.set(None)) {
			eprintln!("the wry probe could not be dropped: {cause}");
		}
		thread::sleep(LAYOUT_SETTLE);
		trial
	}
}

#[derive(Serialize)]
pub struct Cause {
	halved_views: String,
	measurement: Value,
	position_read_as_zero: String,
	upstream_sources: [&'static str; 2],
}

pub struct Tried {
	pub cause: Option<Cause>,
	pub trials: Vec<Trial>,
	pub holder: Option<Holder>,
}

fn cause_of(add_child: &Trial) -> Cause {
	let reading = &add_child.reading;
	let described = |rectangle: Option<Rectangle>| {
		rectangle.map_or_else(|| "unread".to_owned(), |rectangle| rectangle.to_string())
	};
	Cause {
		halved_views: format!(
			"the default vbox of the main window, a vertical GtkBox, holds the main webview and the child webview as two children packed with expand and fill, so GTK gives each half of its height: main webview {}, child webview {}, window content {}",
			described(reading.main_webview_bounds_read_back),
			described(reading.rectangle_read_back),
			described(reading.window_content),
		),
		measurement: json!({
			"taken": "after tauri::Window::add_child, before any other call",
			"rectangle_asked": add_child.rectangle_asked,
			"child_webview_allocation_in_the_window_content": reading.rectangle_read_back,
			"main_webview_allocation_in_the_window_content": reading.main_webview_bounds_read_back,
			"child_webview_bounds_through_tauri": reading.rectangle_read_back_through_the_bounds_getter,
			"main_webview_bounds_through_tauri": reading.main_webview_bounds_read_back_through_tauri,
			"window_content": reading.window_content,
			"widget_tree": reading.widget_tree,
		}),
		position_read_as_zero: format!(
			"the child webview is not at 0, 0: GTK allocates it at {}, below the main webview, while tauri::Webview::bounds answers {}",
			described(reading.rectangle_read_back),
			described(reading.rectangle_read_back_through_the_bounds_getter),
		),
		upstream_sources: [PACKING_SOURCE, BOUNDS_SOURCE],
	}
}

pub fn run(main_window: &WebviewWindow, asked: Rectangle) -> Tried {
	let bench = Bench { main_window, asked };
	let mut trials = Vec::new();
	let holder = bench.tauri_trials(&mut trials);
	let cause = trials.first().map(cause_of);
	trials.push(bench.wry_trial(
		Way::of_wry_alone(
			"wry-build-gtk-in-a-fixed",
			"wry::WebViewBuilder::with_bounds(rectangle).build_gtk(&fixed) on the GtkFixed laid over the main webview, then wry::WebView::set_bounds(rectangle): a webview of wry alone, outside the Tauri runtime",
		),
		true,
		|builder, main_webview| {
			let board = layer::board_under(main_webview)?;
			builder.build_gtk(&board).map_err(|cause| cause.to_string())
		},
	));
	let parent = main_window.clone();
	trials.push(bench.wry_trial(
		Way::of_wry_alone(
			"wry-build-as-child",
			"wry::WebViewBuilder::with_bounds(rectangle).build_as_child(&main_window), then wry::WebView::set_bounds(rectangle): an X11 child window of the main window holding a webview of wry alone, outside the Tauri runtime",
		),
		false,
		move |builder, _| builder.build_as_child(&parent).map_err(|cause| cause.to_string()),
	));
	if holder.is_none() {
		if let Err(cause) = layer::remove(bench.main_webview()) {
			eprintln!("the layer could not be removed: {cause}");
		}
	}
	Tried { cause, trials, holder }
}
