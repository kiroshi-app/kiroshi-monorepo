use objc2::runtime::{AnyObject, Bool};
use objc2::{msg_send, sel};
use objc2_foundation::{NSEdgeInsets, NSRect};
use serde::Serialize;
use tauri::Webview;

use crate::native;
use crate::placement::Rectangle;

const FULL_SIZE_CONTENT_VIEW: usize = 1 << 15;

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
	fn CGPreflightScreenCaptureAccess() -> bool;
}

pub fn is_allowed_to_capture_the_screen() -> bool {
	unsafe { CGPreflightScreenCaptureAccess() }
}

#[derive(Clone, Copy, Serialize)]
pub struct Insets {
	pub top: f64,
	pub left: f64,
	pub bottom: f64,
	pub right: f64,
}

impl From<NSEdgeInsets> for Insets {
	fn from(insets: NSEdgeInsets) -> Self {
		Self { top: insets.top, left: insets.left, bottom: insets.bottom, right: insets.right }
	}
}

impl From<NSRect> for Rectangle {
	fn from(rectangle: NSRect) -> Self {
		Self {
			x: rectangle.origin.x,
			y: rectangle.origin.y,
			width: rectangle.size.width,
			height: rectangle.size.height,
		}
	}
}

#[derive(Clone, Serialize)]
pub struct ViewGeometry {
	pub class: Option<String>,
	pub superview_class: Option<String>,
	pub frame_in_its_superview: Rectangle,
	pub is_flipped: bool,
	pub rectangle_from_the_top_left_of_the_window_frame: Rectangle,
	pub safe_area_insets: Insets,
	pub obscured_content_insets: Option<Insets>,
}

#[derive(Clone, Serialize)]
pub struct WindowGeometry {
	pub window_frame_width: f64,
	pub window_frame_height: f64,
	pub content_layout_height: f64,
	pub title_bar_height: f64,
	pub style_mask: usize,
	pub has_a_full_size_content_view: bool,
	pub content_view: Option<ViewGeometry>,
}

pub const INSET_SOURCES: [&str; 4] = [
	"tauri-runtime-wry 2.12.1 src/lib.rs:783 gives every window TitleBarStyle::Visible by default, and src/lib.rs:1119-1123 turns that style into with_fullsize_content_view(true)",
	"tao 0.37.1 src/platform_impl/macos/window.rs:242-243 adds NSWindowStyleMask::FullSizeContentView, and src/platform_impl/macos/window.rs:735-741 answers inner_size with the frame of that content view, title bar included",
	"tauri-runtime-wry 2.12.1 src/lib.rs:4924-4927 sizes the main webview to that inner size at 0, 0",
	"wry 0.57.0 src/wkwebview/mod.rs:1031-1047 places a child webview from the top of its superview, the content view, with no inset",
];

pub fn inset_cause(
	window: &WindowGeometry,
	main_webview: &ViewGeometry,
	view: &ViewGeometry,
) -> String {
	format!(
		"the window has the full-size content view style ({}), so its content view and the main webview span the {} pt of the window frame, the {} pt title bar included; AppKit reports that title bar to the main webview as safeAreaInsets.top {} and WKWebView lays its page out below it (obscuredContentInsets.top {}), which leaves the page a viewport {} pt high whose origin is {} pt below the origin of the main webview bounds; the child webview has safeAreaInsets.top {} and is placed from the top of the content view",
		window.has_a_full_size_content_view,
		window.window_frame_height,
		window.title_bar_height,
		main_webview.safe_area_insets.top,
		main_webview
			.obscured_content_insets
			.map_or_else(|| "unread".to_owned(), |insets| insets.top.to_string()),
		window.content_layout_height,
		main_webview.safe_area_insets.top,
		view.safe_area_insets.top,
	)
}

unsafe fn class_name(object: *mut AnyObject) -> Option<String> {
	object.as_ref().map(|object| object.class().name().to_string_lossy().into_owned())
}

unsafe fn view_geometry(view: *mut AnyObject, window: *mut AnyObject) -> ViewGeometry {
	let frame: NSRect = msg_send![view, frame];
	let bounds: NSRect = msg_send![view, bounds];
	let nowhere: *mut AnyObject = std::ptr::null_mut();
	let in_window: NSRect = msg_send![view, convertRect: bounds, toView: nowhere];
	let window_frame: NSRect = msg_send![window, frame];
	let superview: *mut AnyObject = msg_send![view, superview];
	let is_flipped: Bool = msg_send![view, isFlipped];
	let safe_area_insets: NSEdgeInsets = msg_send![view, safeAreaInsets];
	let reads_obscured_insets: Bool =
		msg_send![view, respondsToSelector: sel!(obscuredContentInsets)];
	let obscured_content_insets = reads_obscured_insets.as_bool().then(|| {
		let insets: NSEdgeInsets = msg_send![view, obscuredContentInsets];
		insets.into()
	});
	ViewGeometry {
		class: class_name(view),
		superview_class: class_name(superview),
		frame_in_its_superview: frame.into(),
		is_flipped: is_flipped.as_bool(),
		rectangle_from_the_top_left_of_the_window_frame: Rectangle {
			x: in_window.origin.x,
			y: window_frame.size.height - in_window.origin.y - in_window.size.height,
			width: in_window.size.width,
			height: in_window.size.height,
		},
		safe_area_insets: safe_area_insets.into(),
		obscured_content_insets,
	}
}

pub fn view(webview: &Webview) -> Result<ViewGeometry, String> {
	native::read(webview, |platform| unsafe {
		view_geometry(platform.inner().cast(), platform.ns_window().cast())
	})
}

pub fn window(main_webview: &Webview) -> Result<WindowGeometry, String> {
	native::read(main_webview, |platform| {
		let window: *mut AnyObject = platform.ns_window().cast();
		unsafe {
			let frame: NSRect = msg_send![window, frame];
			let content_layout: NSRect = msg_send![window, contentLayoutRect];
			let style_mask: usize = msg_send![window, styleMask];
			let content_view: *mut AnyObject = msg_send![window, contentView];
			WindowGeometry {
				window_frame_width: frame.size.width,
				window_frame_height: frame.size.height,
				content_layout_height: content_layout.size.height,
				title_bar_height: frame.size.height - content_layout.size.height,
				style_mask,
				has_a_full_size_content_view: style_mask & FULL_SIZE_CONTENT_VIEW != 0,
				content_view: (!content_view.is_null())
					.then(|| view_geometry(content_view, window)),
			}
		}
	})
}

pub fn window_number(main_webview: &Webview) -> Result<isize, String> {
	native::read(main_webview, |platform| {
		let window: *mut AnyObject = platform.ns_window().cast();
		unsafe { msg_send![window, windowNumber] }
	})
}
