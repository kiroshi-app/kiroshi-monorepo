use std::collections::HashMap;

use super::model::{Connector, End, Item, Object, Point, Rect, Size, Viewport};

#[cfg(test)]
mod tests;

pub const ZOOM_MIN: f64 = 0.1;
pub const ZOOM_MAX: f64 = 4.0;
pub const CULL_MARGIN: f64 = 256.0;
const ZOOM_STEPS: [f64; 9] = [0.1, 0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 3.0, 4.0];
const GRID_PITCH: f64 = 24.0;
const GRID_MIN_SCREEN_PITCH: f64 = 12.0;
const PINCH_SENSITIVITY: f64 = 0.01;
const ZOOM_EPSILON: f64 = 1e-6;

pub struct Culled<'a> {
	pub object: &'a Object,
	pub bounds: Rect,
}

pub fn clamp_zoom(zoom: f64) -> f64 {
	zoom.clamp(ZOOM_MIN, ZOOM_MAX)
}

pub fn is_at_zoom_min(zoom: f64) -> bool {
	zoom <= ZOOM_MIN + ZOOM_EPSILON
}

pub fn is_at_zoom_max(zoom: f64) -> bool {
	zoom >= ZOOM_MAX - ZOOM_EPSILON
}

pub fn zoom_step_out(zoom: f64) -> f64 {
	ZOOM_STEPS.iter().rev().copied().find(|step| *step < zoom - ZOOM_EPSILON).unwrap_or(ZOOM_MIN)
}

pub fn zoom_step_in(zoom: f64) -> f64 {
	ZOOM_STEPS.iter().copied().find(|step| *step > zoom + ZOOM_EPSILON).unwrap_or(ZOOM_MAX)
}

pub fn pinch_zoom(zoom: f64, delta_y: f64) -> f64 {
	zoom * (-delta_y * PINCH_SENSITIVITY).exp()
}

pub fn zoom_around(viewport: Viewport, zoom: f64, anchor: Point) -> Viewport {
	let next = clamp_zoom(zoom);
	let ratio = next / viewport.zoom;
	Viewport {
		zoom: next,
		offset: Point::new(
			anchor.x - (anchor.x - viewport.offset.x) * ratio,
			anchor.y - (anchor.y - viewport.offset.y) * ratio,
		),
	}
}

pub fn pan_by(viewport: Viewport, delta: Point) -> Viewport {
	Viewport {
		zoom: viewport.zoom,
		offset: Point::new(viewport.offset.x - delta.x, viewport.offset.y - delta.y),
	}
}

fn visible_rect(viewport: Viewport, size: Size) -> Rect {
	Rect::new(
		-viewport.offset.x / viewport.zoom,
		-viewport.offset.y / viewport.zoom,
		size.width / viewport.zoom,
		size.height / viewport.zoom,
	)
}

fn expand(rect: Rect, by: f64) -> Rect {
	Rect::new(rect.x - by, rect.y - by, rect.width + by * 2.0, rect.height + by * 2.0)
}

fn intersects(a: Rect, b: Rect) -> bool {
	a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
}

pub fn union_of(a: Rect, b: Rect) -> Rect {
	let x = a.x.min(b.x);
	let y = a.y.min(b.y);
	Rect::new(
		x,
		y,
		(a.x + a.width).max(b.x + b.width) - x,
		(a.y + a.height).max(b.y + b.height) - y,
	)
}

fn items_by_id(objects: &[Object]) -> HashMap<&str, &Item> {
	objects.iter().filter_map(Object::as_item).map(|item| (item.id.as_str(), item)).collect()
}

fn end_bounds(end: &End, items: &HashMap<&str, &Item>) -> Option<Rect> {
	if let Some(point) = end.point {
		return Some(Rect::at(point));
	}
	items.get(end.item.as_str()).map(|item| item.rect)
}

fn connector_bounds(connector: &Connector, items: &HashMap<&str, &Item>) -> Option<Rect> {
	Some(union_of(end_bounds(&connector.from, items)?, end_bounds(&connector.to, items)?))
}

fn bounds_of(object: &Object, items: &HashMap<&str, &Item>) -> Option<Rect> {
	match object {
		Object::Item(item) => Some(item.rect),
		Object::Connector(connector) => connector_bounds(connector, items),
	}
}

pub fn cull(objects: &[Object], viewport: Viewport, size: Size) -> Vec<Culled<'_>> {
	let area = expand(visible_rect(viewport, size), CULL_MARGIN / viewport.zoom);
	let items = items_by_id(objects);
	objects
		.iter()
		.filter_map(|object| {
			let bounds = bounds_of(object, &items)?;
			intersects(bounds, area).then_some(Culled { object, bounds })
		})
		.collect()
}

pub fn grid_screen_pitch(zoom: f64) -> f64 {
	let mut pitch = GRID_PITCH * zoom;
	while pitch < GRID_MIN_SCREEN_PITCH {
		pitch *= 2.0;
	}
	pitch
}

fn fit_zoom_of(bounds: Rect, area: Size, margin: f64) -> f64 {
	1f64.min((area.width - 2.0 * margin) / bounds.width)
		.min((area.height - 2.0 * margin) / bounds.height)
}

fn centred_at(bounds: Rect, area: Size, zoom: f64) -> Viewport {
	Viewport {
		zoom,
		offset: Point::new(
			(area.width - bounds.width * zoom) / 2.0 - bounds.x * zoom,
			(area.height - bounds.height * zoom) / 2.0 - bounds.y * zoom,
		),
	}
}

pub fn fit_bounds(bounds: Rect, area: Size, margin: f64) -> Viewport {
	centred_at(bounds, area, fit_zoom_of(bounds, area, margin).max(0.0))
}

pub fn content_bounds(objects: &[Object]) -> Option<Rect> {
	let items = items_by_id(objects);
	objects.iter().filter_map(|object| bounds_of(object, &items)).reduce(union_of)
}

pub fn opening_viewport(objects: &[Object], area: Size, margin: f64) -> Viewport {
	match content_bounds(objects) {
		Some(bounds) => centred_at(bounds, area, clamp_zoom(fit_zoom_of(bounds, area, margin))),
		None => Viewport { zoom: 1.0, offset: Point::new(area.width / 2.0, area.height / 2.0) },
	}
}
