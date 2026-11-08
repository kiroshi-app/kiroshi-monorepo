use rune::Key;

use super::model::{Corner, Item, Point, Rect, Viewport, round_half_up};

#[cfg(test)]
mod tests;

pub const MIN_OBJECT_SIZE: f64 = 8.0;

pub fn arrow_direction_of(key: &Key) -> Option<Point> {
	match key {
		Key::Left => Some(Point::new(-1.0, 0.0)),
		Key::Right => Some(Point::new(1.0, 0.0)),
		Key::Up => Some(Point::new(0.0, -1.0)),
		Key::Down => Some(Point::new(0.0, 1.0)),
		_ => None,
	}
}

pub fn scale_point(point: Point, by: f64) -> Point {
	Point::new(point.x * by, point.y * by)
}

pub fn moved_rect(rect: Rect, delta: Point) -> Rect {
	Rect { x: rect.x + delta.x, y: rect.y + delta.y, ..rect }
}

pub fn resized_from_corner(rect: Rect, corner: Corner, delta: Point) -> Rect {
	let width = MIN_OBJECT_SIZE.max(rect.width + if corner.is_left() { -delta.x } else { delta.x });
	let height =
		MIN_OBJECT_SIZE.max(rect.height + if corner.is_top() { -delta.y } else { delta.y });
	Rect {
		x: if corner.is_left() { rect.x + rect.width - width } else { rect.x },
		y: if corner.is_top() { rect.y + rect.height - height } else { rect.y },
		width,
		height,
	}
}

pub fn rounded_rect(rect: Rect) -> Rect {
	Rect::new(
		round_half_up(rect.x),
		round_half_up(rect.y),
		round_half_up(rect.width),
		round_half_up(rect.height),
	)
}

pub fn to_screen_rect(rect: Rect, viewport: Viewport) -> Rect {
	Rect::new(
		viewport.offset.x + rect.x * viewport.zoom,
		viewport.offset.y + rect.y * viewport.zoom,
		rect.width * viewport.zoom,
		rect.height * viewport.zoom,
	)
}

pub fn in_reading_order<'a>(items: impl IntoIterator<Item = &'a Item>) -> Vec<&'a Item> {
	let mut ordered: Vec<&Item> = items.into_iter().collect();
	ordered.sort_by(|a, b| a.rect.y.total_cmp(&b.rect.y).then(a.rect.x.total_cmp(&b.rect.x)));
	ordered
}
