use gtk::prelude::*;
use serde::Serialize;
use serde_json::{json, Value};
use tauri::Webview;

use crate::native;
use crate::placement::Rectangle;

const LAYER_NAME: &str = "spike-view-layer";
const BOARD_NAME: &str = "spike-view-board";
const WEBVIEW_TYPE: &str = "WebKitWebView";

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Holder {
	FixedBoard,
	OverlayMargins,
}

fn rectangle_within(widget: &gtk::Widget, reference: &gtk::Widget) -> Option<Rectangle> {
	let (x, y) = widget.translate_coordinates(reference, 0, 0)?;
	Some(Rectangle {
		x: f64::from(x),
		y: f64::from(y),
		width: f64::from(widget.allocated_width()),
		height: f64::from(widget.allocated_height()),
	})
}

fn window_content_of(widget: &gtk::Widget) -> Result<gtk::Box, String> {
	let mut content = None;
	let mut ancestor = widget.parent();
	while let Some(widget) = ancestor {
		ancestor = widget.parent();
		if let Ok(found) = widget.downcast::<gtk::Box>() {
			content = Some(found);
		}
	}
	content.ok_or_else(|| "the widget is in no GtkBox of the main window".to_owned())
}

pub fn window_content(main_webview: &Webview) -> Result<Rectangle, String> {
	native::read(main_webview, |platform| {
		let content = window_content_of(platform.inner().upcast_ref())?;
		Ok(Rectangle {
			x: 0.0,
			y: 0.0,
			width: f64::from(content.allocated_width()),
			height: f64::from(content.allocated_height()),
		})
	})?
}

pub fn rectangle_in_the_window_content(widget: &gtk::Widget) -> Result<Rectangle, String> {
	let content = window_content_of(widget)?;
	rectangle_within(widget, content.upcast_ref())
		.ok_or_else(|| "the widget is not realized inside the window content".to_owned())
}

fn described(widget: &gtk::Widget, content: Option<&gtk::Widget>) -> Value {
	let allocation = widget.allocation();
	let (requested_width, requested_height) = widget.size_request();
	let mut node = json!({
		"type": widget.type_().name(),
		"name": widget.widget_name().as_str(),
		"is_visible": widget.is_visible(),
		"allocation": {
			"x": allocation.x(),
			"y": allocation.y(),
			"width": allocation.width(),
			"height": allocation.height(),
		},
		"size_request": { "width": requested_width, "height": requested_height },
		"rectangle_in_the_window_content": content.and_then(|content| rectangle_within(widget, content)),
	});
	if let Some(holder) = widget.parent().and_then(|parent| parent.downcast::<gtk::Box>().ok()) {
		let (expand, fill, padding, pack_type) = holder.query_child_packing(widget);
		node["packing_in_its_box"] = json!({
			"expand": expand,
			"fill": fill,
			"padding": padding,
			"pack_type": format!("{pack_type:?}"),
		});
	}
	if let Some(holder) = widget.downcast_ref::<gtk::Box>() {
		node["orientation"] = json!(format!("{:?}", holder.orientation()));
		node["homogeneous"] = json!(holder.is_homogeneous());
	}
	if let Some(container) = widget.downcast_ref::<gtk::Container>() {
		let is_the_content = content.is_none() && widget.is::<gtk::Box>();
		let content = if is_the_content { Some(widget) } else { content };
		let children: Vec<Value> =
			container.children().iter().map(|child| described(child, content)).collect();
		node["children"] = json!(children);
	}
	node
}

pub fn widget_tree(main_webview: &Webview) -> Result<Value, String> {
	native::read(main_webview, |platform| {
		let widget: gtk::Widget = platform.inner().upcast();
		let window = widget.toplevel().ok_or("the main webview has no toplevel window")?;
		Ok(json!({
			"display": gtk::gdk::Display::default().map(|display| display.type_().name()),
			"window": described(&window, None),
		}))
	})?
}

pub fn rectangle_read_by_gtk(webview: &Webview) -> Result<Rectangle, String> {
	native::read(webview, |platform| {
		rectangle_in_the_window_content(platform.inner().upcast_ref())
	})?
}

fn named(container: &impl IsA<gtk::Container>, name: &str) -> Option<gtk::Widget> {
	container.children().into_iter().find(|widget| widget.widget_name() == name)
}

fn layer_holding(view: &gtk::Widget) -> Result<gtk::Overlay, String> {
	if let Some(layer) = view.ancestor(gtk::Overlay::static_type()) {
		return layer.downcast().map_err(|_| "the layer is not a GtkOverlay".to_owned());
	}
	let content = window_content_of(view)?;
	if let Some(layer) = named(&content, LAYER_NAME) {
		return layer.downcast().map_err(|_| "the layer is not a GtkOverlay".to_owned());
	}
	let main_webview = content
		.children()
		.into_iter()
		.find(|widget| widget != view && widget.type_().name() == WEBVIEW_TYPE)
		.ok_or("the window content holds no main webview")?;
	let layer = gtk::Overlay::new();
	layer.set_widget_name(LAYER_NAME);
	content.remove(&main_webview);
	layer.add(&main_webview);
	content.pack_start(&layer, true, true, 0);
	layer.show();
	Ok(layer)
}

fn board_of(layer: &gtk::Overlay) -> Result<gtk::Fixed, String> {
	if let Some(board) = named(layer, BOARD_NAME) {
		return board.downcast().map_err(|_| "the board is not a GtkFixed".to_owned());
	}
	let board = gtk::Fixed::new();
	board.set_widget_name(BOARD_NAME);
	layer.add_overlay(&board);
	layer.set_overlay_pass_through(&board, true);
	board.show();
	Ok(board)
}

fn leave_the_parent(view: &gtk::Widget) -> Result<(), String> {
	let parent = view
		.parent()
		.and_then(|parent| parent.downcast::<gtk::Container>().ok())
		.ok_or("the view has no parent container")?;
	parent.remove(view);
	Ok(())
}

fn raised(view: &gtk::Widget, holder: Holder) -> Result<(), String> {
	let layer = layer_holding(view)?;
	leave_the_parent(view)?;
	view.set_margin_start(0);
	view.set_margin_top(0);
	match holder {
		Holder::FixedBoard => board_of(&layer)?.put(view, 0, 0),
		Holder::OverlayMargins => {
			view.set_halign(gtk::Align::Start);
			view.set_valign(gtk::Align::Start);
			layer.add_overlay(view);
			layer.set_overlay_pass_through(view, true);
		}
	}
	Ok(())
}

pub fn raise(view: &Webview, holder: Holder) -> Result<(), String> {
	native::read(view, move |platform| raised(platform.inner().upcast_ref(), holder))?
}

fn moved(view: &gtk::Widget, target: Rectangle) -> Result<(), String> {
	let Rectangle { x, y, width, height } = target;
	let [x, y, width, height] = [x, y, width, height].map(|length| length.round() as i32);
	let parent = view.parent().ok_or("the view is in no layer")?;
	view.show();
	view.set_size_request(width, height);
	if let Some(board) = parent.downcast_ref::<gtk::Fixed>() {
		board.move_(view, x, y);
	} else if parent.is::<gtk::Overlay>() {
		view.set_margin_start(x);
		view.set_margin_top(y);
	} else {
		return Err(format!("the view is in a {}, not in the layer", parent.type_().name()));
	}
	let layer = layer_holding(view)?;
	layer.size_allocate(&layer.allocation());
	Ok(())
}

pub fn show_at(view: &Webview, target: Rectangle) -> Result<(), String> {
	native::read(view, move |platform| moved(platform.inner().upcast_ref(), target))?
}

pub fn rectangle_over_the_main_webview(view: &Webview) -> Result<Rectangle, String> {
	native::read(view, |platform| {
		let view: gtk::Widget = platform.inner().upcast();
		let main_webview =
			layer_holding(&view)?.child().ok_or("the layer holds no main webview")?;
		rectangle_within(&view, &main_webview)
			.ok_or_else(|| "the view is not realized over the main webview".to_owned())
	})?
}

pub fn board_under(main_webview: &gtk::Widget) -> Result<gtk::Fixed, String> {
	let layer = main_webview
		.parent()
		.and_then(|parent| parent.downcast::<gtk::Overlay>().ok())
		.ok_or("the main webview is in no layer")?;
	board_of(&layer)
}

pub fn remove(main_webview: &Webview) -> Result<(), String> {
	native::read(main_webview, |platform| {
		let main_webview: gtk::Widget = platform.inner().upcast();
		let Some(layer) =
			main_webview.parent().and_then(|parent| parent.downcast::<gtk::Overlay>().ok())
		else {
			return Ok(());
		};
		let content = window_content_of(&main_webview)?;
		layer.remove(&main_webview);
		content.remove(&layer);
		content.pack_start(&main_webview, true, true, 0);
		Ok(())
	})?
}
