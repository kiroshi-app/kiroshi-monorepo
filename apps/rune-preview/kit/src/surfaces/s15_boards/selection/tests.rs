use super::*;
use crate::surfaces::s15_boards::model::Content;

const RECT: Rect = Rect::new(100.0, 200.0, 160.0, 120.0);

fn item_at(id: &str, x: f64, y: f64) -> Item {
	Item {
		id: id.to_owned(),
		rect: Rect::new(x, y, 10.0, 10.0),
		z_order: 0,
		content: Content::Foreign { text: id.to_owned() },
	}
}

#[test]
fn moved_rect_shifts_the_position_and_keeps_the_size() {
	assert_eq!(moved_rect(RECT, Point::new(-10.0, 5.0)), Rect::new(90.0, 205.0, 160.0, 120.0));
}

#[test]
fn resizing_from_the_bottom_right_keeps_the_top_left_fixed() {
	assert_eq!(
		resized_from_corner(RECT, Corner::BottomRight, Point::new(20.0, 10.0)),
		Rect::new(100.0, 200.0, 180.0, 130.0)
	);
}

#[test]
fn resizing_from_the_top_left_keeps_the_bottom_right_fixed() {
	assert_eq!(
		resized_from_corner(RECT, Corner::TopLeft, Point::new(20.0, 10.0)),
		Rect::new(120.0, 210.0, 140.0, 110.0)
	);
}

#[test]
fn resizing_from_the_top_right_keeps_the_bottom_left_fixed() {
	assert_eq!(
		resized_from_corner(RECT, Corner::TopRight, Point::new(20.0, -10.0)),
		Rect::new(100.0, 190.0, 180.0, 130.0)
	);
}

#[test]
fn resizing_holds_the_minimum_size_against_the_fixed_corner() {
	assert_eq!(
		resized_from_corner(RECT, Corner::TopLeft, Point::new(500.0, 500.0)),
		Rect::new(
			100.0 + 160.0 - MIN_OBJECT_SIZE,
			200.0 + 120.0 - MIN_OBJECT_SIZE,
			MIN_OBJECT_SIZE,
			MIN_OBJECT_SIZE
		)
	);
}

#[test]
fn rounded_rect_rounds_every_edge_to_a_whole_board_pixel() {
	assert_eq!(rounded_rect(Rect::new(1.4, 1.6, 9.5, 2.2)), Rect::new(1.0, 2.0, 10.0, 2.0));
}

#[test]
fn to_screen_rect_scales_by_the_zoom_and_shifts_by_the_offset() {
	assert_eq!(
		to_screen_rect(RECT, Viewport::new(10.0, -20.0, 2.0)),
		Rect::new(210.0, 380.0, 320.0, 240.0)
	);
}

#[test]
fn reading_order_sorts_top_to_bottom_then_left_to_right() {
	let items = [item_at("c", 0.0, 100.0), item_at("b", 50.0, 0.0), item_at("a", 0.0, 0.0)];
	let order: Vec<&str> = in_reading_order(&items).iter().map(|item| item.id.as_str()).collect();
	assert_eq!(order, ["a", "b", "c"]);
}

#[test]
fn arrow_direction_maps_each_arrow_to_a_unit_step_and_anything_else_to_nothing() {
	assert_eq!(arrow_direction_of(&Key::Left), Some(Point::new(-1.0, 0.0)));
	assert_eq!(arrow_direction_of(&Key::Down), Some(Point::new(0.0, 1.0)));
	assert_eq!(arrow_direction_of(&Key::Text("a".to_owned())), None);
}
