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
const HOLDS: &str = "holds";
const FAILS: &str = "fails";
const PACKING_SOURCE: &str = "tauri-runtime-wry 2.12.1 src/lib.rs:5171-5174 builds every webview of a window with build_gtk on the default vbox of the window, and wry 0.57.0 src/webkitgtk/mod.rs:690-694 adds it to that GtkBox with pack_start(webview, true, true, 0)";
const BOUNDS_SOURCE: &str = "wry 0.57.0 src/webkitgtk/mod.rs:957-958 reads only allocated_size outside an X11 child window, so the position is always 0, 0, and src/webkitgtk/mod.rs:963-984 set_bounds acts only on an X11 child window or on a webview built in a GtkFixed";

thread_local! {
	static WRY_PROBE: RefCell<Option<wry::WebView>> = const { RefCell::new(None) };
}

#[derive(Clone, Serialize)]
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

#[derive(Serialize)]
pub struct Trial {
	name: &'static str,
	calls: &'static str,
	is_a_webview_tauri_manages: bool,
	rectangle_asked: Rectangle,
	#[serde(flatten)]
	reading: Reading,
	result: &'static str,
	reason: String,
}

impl Trial {
	fn judged(
		name: &'static str,
		calls: &'static str,
		is_a_webview_tauri_manages: bool,
		rectangle_asked: Rectangle,
		reading: Reading,
	) -> Self {
		let verdict = verdict_of(rectangle_asked, &reading);
		Self {
			name,
			calls,
			is_a_webview_tauri_manages,
			rectangle_asked,
			reading,
			result: if verdict.is_ok() { HOLDS } else { FAILS },
			reason: verdict.unwrap_or_else(|reason| reason),
		}
	}

	fn not_mounted(
		name: &'static str,
		calls: &'static str,
		is_a_webview_tauri_manages: bool,
		rectangle_asked: Rectangle,
		cause: String,
	) -> Self {
		Self {
			name,
			calls,
			is_a_webview_tauri_manages,
			rectangle_asked,
			reading: Reading {
				rectangle_read_back: None,
				rectangle_read_back_from: "nothing: the view was not mounted",
				rectangle_read_back_through_the_bounds_getter: None,
				main_webview_bounds_read_back: None,
				main_webview_bounds_read_back_through_tauri: None,
				window_content: None,
				faults: Vec::new(),
				widget_tree: Value::Null,
			},
			result: FAILS,
			reason: format!("the view could not be mounted this way: {cause}"),
		}
	}

	pub fn holds(&self) -> bool {
		self.result == HOLDS
	}

	pub fn name(&self) -> &'static str {
		self.name
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

	fn shared_reading(
		&self,
		faults: &mut Vec<String>,
	) -> (Option<Rectangle>, Option<Rectangle>, Option<Rectangle>, Value) {
		let main_webview = self.main_webview();
		let by_gtk = kept(layer::rectangle_read_by_gtk(main_webview), faults);
		let by_tauri = kept(bounds_of(main_webview).map_err(|cause| cause.to_string()), faults);
		let content = kept(layer::window_content(main_webview), faults);
		let tree = layer::widget_tree(main_webview)
			.unwrap_or_else(|fault| json!({ "unavailable": fault }));
		(by_gtk, by_tauri, content, tree)
	}

	fn reading_of(&self, probe: &Webview) -> Reading {
		thread::sleep(LAYOUT_SETTLE);
		let mut faults = Vec::new();
		let rectangle_read_back = kept(layer::rectangle_read_by_gtk(probe), &mut faults);
		let through_the_getter =
			kept(bounds_of(probe).map_err(|cause| cause.to_string()), &mut faults);
		let (main_by_gtk, main_by_tauri, window_content, widget_tree) =
			self.shared_reading(&mut faults);
		Reading {
			rectangle_read_back,
			rectangle_read_back_from:
				"the GTK allocation of the webview widget, translated to the window content",
			rectangle_read_back_through_the_bounds_getter: through_the_getter,
			main_webview_bounds_read_back: main_by_gtk,
			main_webview_bounds_read_back_through_tauri: main_by_tauri,
			window_content,
			faults,
			widget_tree,
		}
	}

	fn reading_of_the_wry_probe(&self, is_in_the_window_content: bool) -> Reading {
		thread::sleep(LAYOUT_SETTLE);
		let mut faults = Vec::new();
		let read = native::read(self.main_webview(), move |_| {
			WRY_PROBE.with_borrow(|probe| {
				let probe = probe.as_ref().ok_or("the wry webview is gone")?;
				let by_wry = probe.bounds().map_err(|cause| cause.to_string()).map(|bounds| {
					let scale = f64::from(probe.webview().scale_factor());
					let position = bounds.position.to_logical::<f64>(scale);
					let size = bounds.size.to_logical::<f64>(scale);
					Rectangle {
						x: position.x,
						y: position.y,
						width: size.width,
						height: size.height,
					}
				});
				let by_gtk = is_in_the_window_content
					.then(|| layer::rectangle_in_the_window_content(probe.webview().upcast_ref()));
				Ok::<_, String>((by_wry, by_gtk))
			})
		});
		let (by_wry, by_gtk) = match read.and_then(|read| read) {
			Ok((by_wry, by_gtk)) => (kept(by_wry, &mut faults), by_gtk),
			Err(fault) => {
				faults.push(fault);
				(None, None)
			}
		};
		let (rectangle_read_back, rectangle_read_back_from) = match by_gtk {
			Some(by_gtk) => (
				kept(by_gtk, &mut faults),
				"the GTK allocation of the webview widget, translated to the window content",
			),
			None => (
				by_wry,
				"XGetWindowAttributes on the X11 child window, through the bounds getter of wry",
			),
		};
		let (main_by_gtk, main_by_tauri, window_content, widget_tree) =
			self.shared_reading(&mut faults);
		Reading {
			rectangle_read_back,
			rectangle_read_back_from,
			rectangle_read_back_through_the_bounds_getter: by_wry,
			main_webview_bounds_read_back: main_by_gtk,
			main_webview_bounds_read_back_through_tauri: main_by_tauri,
			window_content,
			faults,
			widget_tree,
		}
	}

	fn tauri_trials(&self, trials: &mut Vec<Trial>) -> Option<Holder> {
		const ADD_CHILD: (&str, &str) = (
			"tauri-window-add-child",
			"tauri::Window::add_child(builder, position, size) with the rectangle asked for",
		);
		let asked = self.asked;
		let probe = match open_blank_child(self.main_window, PROBE_LABEL, PROBE_URL, asked) {
			Ok(probe) => probe,
			Err(cause) => {
				let (name, calls) = ADD_CHILD;
				trials.push(Trial::not_mounted(name, calls, true, asked, cause.to_string()));
				return None;
			}
		};
		let mut record = |name, calls, moved: Result<(), String>| {
			let trial = match moved {
				Ok(()) => Trial::judged(name, calls, true, asked, self.reading_of(&probe)),
				Err(cause) => Trial::not_mounted(name, calls, true, asked, cause),
			};
			let holds = trial.holds();
			trials.push(trial);
			holds
		};
		let through_tauri = |moved: tauri::Result<()>| moved.map_err(|cause| cause.to_string());
		record(ADD_CHILD.0, ADD_CHILD.1, Ok(()));
		record(
			"tauri-webview-set-bounds",
			"tauri::Webview::set_bounds(rectangle) on the child webview add_child mounted",
			through_tauri(probe.set_bounds(asked.into())),
		);
		record(
			"tauri-webview-set-position-and-size",
			"tauri::Webview::set_position(position) then tauri::Webview::set_size(size) on the same child webview",
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
			record(name, calls, moved).then_some(holder)
		});
		if let Err(cause) = probe.close() {
			eprintln!("the placement probe could not be closed: {cause}");
		}
		thread::sleep(LAYOUT_SETTLE);
		layered.into_iter().flatten().next()
	}

	fn wry_trial(
		&self,
		name: &'static str,
		calls: &'static str,
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
			Ok(()) => Trial::judged(
				name,
				calls,
				false,
				asked,
				self.reading_of_the_wry_probe(is_in_the_window_content),
			),
			Err(cause) => Trial::not_mounted(name, calls, false, asked, cause),
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
		"wry-build-gtk-in-a-fixed",
		"wry::WebViewBuilder::with_bounds(rectangle).build_gtk(&fixed) on the GtkFixed laid over the main webview, then wry::WebView::set_bounds(rectangle): a webview of wry alone, outside the Tauri runtime",
		true,
		|builder, main_webview| {
			let board = layer::board_under(main_webview)?;
			builder.build_gtk(&board).map_err(|cause| cause.to_string())
		},
	));
	let parent = main_window.clone();
	trials.push(bench.wry_trial(
		"wry-build-as-child",
		"wry::WebViewBuilder::with_bounds(rectangle).build_as_child(&main_window), then wry::WebView::set_bounds(rectangle): an X11 child window of the main window holding a webview of wry alone, outside the Tauri runtime",
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
