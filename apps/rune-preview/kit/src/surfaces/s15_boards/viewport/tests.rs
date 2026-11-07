use super::*;
use crate::surfaces::s15_boards::model::{Content, Routing, Side};

const AT_ORIGIN: Viewport = Viewport::new(0.0, 0.0, 1.0);
const SCREEN: Size = Size::new(800.0, 600.0);

fn sticky(id: &str, x: f64, y: f64) -> Object {
	Object::Item(Item {
		id: id.to_owned(),
		rect: Rect::new(x, y, 100.0, 100.0),
		z_order: 0,
		content: Content::Foreign { text: id.to_owned() },
	})
}

fn connector(id: &str, from: &str, to: &str) -> Object {
	Object::Connector(Connector::between(
		id,
		End::sided(from, Side::Right),
		End::sided(to, Side::Left),
		Routing::Straight,
	))
}

fn to_screen(viewport: Viewport, point: Point) -> Point {
	viewport.to_screen(point)
}

fn to_board(viewport: Viewport, point: Point) -> Point {
	Point::new(
		(point.x - viewport.offset.x) / viewport.zoom,
		(point.y - viewport.offset.y) / viewport.zoom,
	)
}

fn culled_ids(objects: &[Object], viewport: Viewport) -> Vec<String> {
	cull(objects, viewport, SCREEN).iter().map(|culled| culled.object.id().to_owned()).collect()
}

fn close(a: f64, b: f64) -> bool {
	(a - b).abs() < 0.005
}

#[test]
fn zoom_around_keeps_the_board_point_under_the_anchor_fixed_on_screen() {
	let viewport = Viewport::new(-120.0, 75.0, 1.3);
	let anchor = Point::new(312.0, 208.0);
	let pinned = to_board(viewport, anchor);
	let zoomed = zoom_around(viewport, 2.7, anchor);
	assert_eq!(zoomed.zoom, 2.7);
	let on_screen = to_screen(zoomed, pinned);
	assert!(close(on_screen.x, anchor.x) && close(on_screen.y, anchor.y));
}

#[test]
fn zoom_around_holds_the_zoom_at_its_bounds_and_keeps_the_anchor_fixed() {
	let anchor = Point::new(400.0, 300.0);
	let pinned = to_board(AT_ORIGIN, anchor);
	let too_far = zoom_around(AT_ORIGIN, 12.0, anchor);
	let too_close = zoom_around(AT_ORIGIN, 0.01, anchor);
	assert_eq!(too_far.zoom, ZOOM_MAX);
	assert_eq!(too_close.zoom, ZOOM_MIN);
	assert!(close(to_screen(too_far, pinned).x, anchor.x));
	assert!(close(to_screen(too_close, pinned).y, anchor.y));
}

#[test]
fn pan_by_moves_the_board_against_the_scroll_delta_at_any_zoom() {
	let viewport = Viewport::new(10.0, 20.0, 2.0);
	assert_eq!(pan_by(viewport, Point::new(30.0, -40.0)), Viewport::new(-20.0, 60.0, 2.0));
}

#[test]
fn zoom_steps_stop_between_the_stops_and_at_the_bounds() {
	assert_eq!(zoom_step_in(1.0), 1.5);
	assert_eq!(zoom_step_out(1.0), 0.75);
	assert_eq!(zoom_step_in(0.87), 1.0);
	assert_eq!(zoom_step_out(0.87), 0.75);
	assert_eq!(zoom_step_in(ZOOM_MAX), ZOOM_MAX);
	assert_eq!(zoom_step_out(ZOOM_MIN), ZOOM_MIN);
}

#[test]
fn cull_keeps_the_objects_on_screen_and_drops_the_ones_past_the_margin() {
	let objects = [
		sticky("visible", 100.0, 100.0),
		sticky("in-margin", SCREEN.width + CULL_MARGIN - 50.0, 100.0),
		sticky("past-margin", SCREEN.width + CULL_MARGIN + 50.0, 100.0),
		sticky("above", 100.0, -CULL_MARGIN - 200.0),
	];
	assert_eq!(culled_ids(&objects, AT_ORIGIN), ["visible", "in-margin"]);
}

#[test]
fn cull_follows_the_pan_and_the_zoom() {
	let objects = [sticky("near", 0.0, 0.0), sticky("far", 5000.0, 3000.0)];
	assert_eq!(culled_ids(&objects, AT_ORIGIN), ["near"]);
	assert_eq!(culled_ids(&objects, Viewport::new(-4800.0, -2800.0, 1.0)), ["far"]);
	assert_eq!(culled_ids(&objects, Viewport::new(0.0, 0.0, 0.1)), ["near", "far"]);
}

#[test]
fn cull_scales_the_margin_with_the_zoom_so_it_stays_the_same_on_screen() {
	let just_past_margin = SCREEN.width + CULL_MARGIN + 10.0;
	let objects = [sticky("edge", just_past_margin / 2.0, 0.0)];
	assert!(culled_ids(&objects, Viewport::new(0.0, 0.0, 2.0)).is_empty());
}

#[test]
fn cull_mounts_a_connector_by_the_bounds_of_its_endpoints() {
	let objects = [
		sticky("left", -3000.0, 200.0),
		sticky("right", 3000.0, 200.0),
		sticky("far-a", 9000.0, 9000.0),
		sticky("far-b", 9500.0, 9000.0),
		connector("across", "left", "right"),
		connector("away", "far-a", "far-b"),
		connector("dangling", "left", "missing"),
	];
	assert_eq!(culled_ids(&objects, AT_ORIGIN), ["across"]);
	let across = cull(&objects, AT_ORIGIN, SCREEN);
	assert_eq!(across[0].bounds, Rect::new(-3000.0, 200.0, 6100.0, 100.0));
}

#[test]
fn grid_screen_pitch_follows_the_zoom_and_doubles_once_the_dots_would_crowd() {
	assert_eq!(grid_screen_pitch(1.0), 24.0);
	assert_eq!(grid_screen_pitch(2.0), 48.0);
	assert_eq!(grid_screen_pitch(0.5), 12.0);
	assert_eq!(grid_screen_pitch(0.25), 12.0);
	assert!(close(grid_screen_pitch(ZOOM_MIN), 19.2));
}

const PREVIEW: Size = Size::new(271.0, 180.0);

#[test]
fn fit_bounds_shrinks_a_wide_board_to_the_width_centred_keeping_the_margin() {
	let fitted = fit_bounds(Rect::new(-100.0, 50.0, 1000.0, 200.0), PREVIEW, 20.0);
	assert!((fitted.zoom - 0.231).abs() < 0.0005);
	assert!(close(fitted.offset.x + -100.0 * fitted.zoom, 20.0));
	assert!(close(fitted.offset.y + 50.0 * fitted.zoom, (180.0 - 200.0 * fitted.zoom) / 2.0));
}

#[test]
fn fit_bounds_shrinks_a_tall_board_to_the_height_centred_keeping_the_margin() {
	let fitted = fit_bounds(Rect::new(0.0, 0.0, 200.0, 700.0), PREVIEW, 20.0);
	assert!(close(fitted.zoom, 0.2));
	assert!(close(fitted.offset.y, 20.0));
	assert!(close(fitted.offset.x, (271.0 - 40.0) / 2.0));
}

#[test]
fn fit_bounds_never_magnifies_a_board_smaller_than_the_preview() {
	let fitted = fit_bounds(Rect::new(10.0, 10.0, 100.0, 60.0), PREVIEW, 20.0);
	assert_eq!(fitted, Viewport::new(75.5, 50.0, 1.0));
}

const MARGIN: f64 = 48.0;

#[test]
fn opening_frames_content_far_from_the_origin_centred_the_margin_on_the_limiting_axis() {
	let objects = [
		sticky("near", 5000.0, 3000.0),
		sticky("far", 7900.0, 4900.0),
		connector("link", "near", "far"),
	];
	let opening = opening_viewport(&objects, SCREEN, MARGIN);
	let top_left = to_screen(opening, Point::new(5000.0, 3000.0));
	let bottom_right = to_screen(opening, Point::new(8000.0, 5000.0));
	assert!(close(opening.zoom, (800.0 - 2.0 * MARGIN) / 3000.0));
	assert!(close(top_left.x, MARGIN));
	assert!(close(SCREEN.width - bottom_right.x, MARGIN));
	assert!(close(top_left.y, SCREEN.height - bottom_right.y));
}

#[test]
fn opening_shows_content_that_fits_at_100_percent_centred() {
	let opening = opening_viewport(
		&[sticky("a", -300.0, -200.0), sticky("b", -150.0, -200.0)],
		SCREEN,
		MARGIN,
	);
	assert_eq!(opening, Viewport::new(575.0, 450.0, 1.0));
}

#[test]
fn opening_holds_the_zoom_at_the_minimum_when_the_canvas_is_narrower_than_its_margins() {
	let opening = opening_viewport(&[sticky("a", 0.0, 0.0)], Size::new(100.0, 80.0), MARGIN);
	assert_eq!(opening.zoom, ZOOM_MIN);
	assert_eq!(to_screen(opening, Point::new(50.0, 50.0)), Point::new(50.0, 40.0));
}

#[test]
fn opening_puts_the_origin_of_an_empty_board_at_the_centre_at_100_percent() {
	assert_eq!(opening_viewport(&[], SCREEN, MARGIN), Viewport::new(400.0, 300.0, 1.0));
}
