use super::*;

const SOURCE: Rect = Rect::new(0.0, 0.0, 160.0, 120.0);

const LAYOUTS: [(&str, Rect); 5] = [
	("apart on both axes", Rect::new(320.0, 280.0, 144.0, 80.0)),
	("overlapping on the vertical axis", Rect::new(280.0, 60.0, 144.0, 80.0)),
	("overlapping on the horizontal axis", Rect::new(60.0, 260.0, 144.0, 80.0)),
	("close and overlapping on the vertical axis", Rect::new(176.0, 40.0, 144.0, 80.0)),
	("close and overlapping on the horizontal axis", Rect::new(40.0, 136.0, 144.0, 80.0)),
];

const LEFT_SHAPE: Rect = Rect::new(80.0, 126.0, 160.0, 120.0);
const RIGHT_SHAPE: Rect = Rect::new(400.0, 126.0, 160.0, 120.0);
const FAR_SHAPE: Rect = Rect::new(720.0, 126.0, 160.0, 120.0);

const fn sticky(x: f64, y: f64) -> Rect {
	Rect::new(x, y, 160.0, 160.0)
}

const DESKTOP_FRAME: Rect = Rect::new(40.0, 80.0, 608.0, 232.0);
const SIDECAR_FRAME: Rect = Rect::new(40.0, 400.0, 408.0, 232.0);
const CLOUD_FRAME: Rect = Rect::new(720.0, 80.0, 408.0, 232.0);
const INTERFACE_REACT: Rect = sticky(64.0, 128.0);
const HOST_RUST: Rect = sticky(264.0, 128.0);
const LOCAL_STORAGE: Rect = sticky(464.0, 128.0);
const RELAY: Rect = sticky(744.0, 128.0);
const IPHONE_APP: Rect = sticky(944.0, 128.0);
const AGENT_SDK: Rect = sticky(64.0, 448.0);
const BOT_PLUGIN: Rect = sticky(264.0, 448.0);

fn after_board_obstacles() -> Obstacles {
	Obstacles {
		blocks: vec![
			INTERFACE_REACT,
			HOST_RUST,
			LOCAL_STORAGE,
			RELAY,
			IPHONE_APP,
			AGENT_SDK,
			BOT_PLUGIN,
		],
		titles: vec![
			section_title_box(DESKTOP_FRAME, "Application de bureau"),
			section_title_box(SIDECAR_FRAME, "Sidecar"),
			section_title_box(CLOUD_FRAME, "Cloud"),
		],
		frames: vec![DESKTOP_FRAME, SIDECAR_FRAME, CLOUD_FRAME],
	}
}

fn arrow(source: Rect, target: Rect, routing: Routing) -> Arrow {
	Arrow { source: ConnectorEnd::of(source), target: ConnectorEnd::of(target), routing, bend: 0.0 }
}

fn after_board_arrows() -> [(&'static str, Arrow); 6] {
	[
		("M232 208 L256 208", arrow(INTERFACE_REACT, HOST_RUST, Routing::Straight)),
		("M432 208 L456 208", arrow(HOST_RUST, LOCAL_STORAGE, Routing::Straight)),
		("M912 208 L936 208", arrow(RELAY, IPHONE_APP, Routing::Straight)),
		("M232 528 L256 528", arrow(AGENT_SDK, BOT_PLUGIN, Routing::Straight)),
		(
			"M344 296 L344 360 Q344 368 336 368 L152 368 Q144 368 144 376 L144 440",
			arrow(HOST_RUST, AGENT_SDK, Routing::Elbow),
		),
		(
			"M344 120 L344 64 Q344 56 352 56 L816 56 Q824 56 824 64 L824 120",
			arrow(HOST_RUST, RELAY, Routing::Elbow),
		),
	]
}

fn outward(side: Side) -> Point {
	HEADINGS[heading_of(side)]
}

fn inward(side: Side) -> Point {
	HEADINGS[reverse_of(heading_of(side))]
}

fn direction_of(from: Point, to: Point) -> Point {
	let sign = |value: f64| if value == 0.0 { 0.0 } else { value.signum() };
	Point::new(sign(to.x - from.x), sign(to.y - from.y))
}

fn segments_of(points: &[Point]) -> Vec<(Point, Point)> {
	points.windows(2).map(|leg| (leg[0], leg[1])).collect()
}

fn sampled_crosses_inside(a: Point, b: Point, rect: Rect) -> bool {
	let steps = 64;
	(0..=steps).any(|step| {
		let point = Point::new(
			a.x + (b.x - a.x) * step as f64 / steps as f64,
			a.y + (b.y - a.y) * step as f64 / steps as f64,
		);
		rect.x < point.x
			&& point.x < rect.x + rect.width
			&& rect.y < point.y
			&& point.y < rect.y + rect.height
	})
}

fn outward_by(side: Side, rect: Rect, by: f64) -> Point {
	let anchor = anchor_of(rect, side);
	let direction = outward(side);
	Point::new(anchor.x + direction.x * by, anchor.y + direction.y * by)
}

fn straight(source: ConnectorEnd, target: ConnectorEnd) -> Route {
	route_connector(&source, &target, Routing::Straight, 0.0, &Obstacles::default(), &[])
}

fn bent(source: ConnectorEnd, target: ConnectorEnd, bend: f64) -> Route {
	route_connector(&source, &target, Routing::Straight, bend, &Obstacles::default(), &[])
}

fn elbow(source: ConnectorEnd, target: ConnectorEnd, obstacles: &Obstacles) -> Route {
	route_connector(&source, &target, Routing::Elbow, 0.0, obstacles, &[])
}

fn close(a: f64, b: f64) -> bool {
	(a - b).abs() < 0.005
}

fn plain(points: &[Point]) -> Route {
	Route { points: points.to_vec(), control: None, arrow: HEADINGS[1] }
}

#[test]
fn the_gap_stops_8_before_the_outline_of_a_shape_bound_at_its_centre() {
	assert_eq!(
		line_end_of(&ConnectorEnd::of(LEFT_SHAPE), Point::new(480.0, 186.0)),
		Point::new(248.0, 186.0)
	);
	assert_eq!(
		line_end_of(&ConnectorEnd::of(RIGHT_SHAPE), Point::new(160.0, 186.0)),
		Point::new(392.0, 186.0)
	);
}

#[test]
fn the_gap_stops_8_before_a_bound_side_along_the_line() {
	assert_eq!(
		line_end_of(&ConnectorEnd::sided(LEFT_SHAPE, Side::Right), Point::new(480.0, 186.0)),
		Point::new(248.0, 186.0)
	);
}

#[test]
fn the_gap_vanishes_on_an_exact_point() {
	let point = Point::new(440.0, 186.0);
	assert_eq!(
		line_end_of(&ConnectorEnd::pointed(RIGHT_SHAPE, point), Point::new(160.0, 186.0)),
		point
	);
}

#[test]
fn quick_release_joins_two_centres_from_248_to_392_on_186() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(
		route,
		Route {
			points: vec![Point::new(248.0, 186.0), Point::new(392.0, 186.0)],
			control: None,
			arrow: Point::new(1.0, 0.0),
		}
	);
	assert_eq!(route_path_data(&route), "M248 186 L392 186");
}

#[test]
fn exact_point_ends_the_line_and_the_head_tip_on_the_bound_point() {
	let point = exact_point_of(RIGHT_SHAPE, Point::new(0.25, 0.5));
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::pointed(RIGHT_SHAPE, point));
	assert_eq!(point, Point::new(440.0, 186.0));
	assert_eq!(route.points, [Point::new(248.0, 186.0), point]);
	assert_eq!(
		arrowhead_path_data(point, route.arrow, HeadSize::Medium),
		"M430 192 L440 186 L430 180"
	);
}

#[test]
fn straight_joins_every_side_to_every_side_8_off_each_anchor() {
	let target = LAYOUTS[1].1;
	for from_side in SIDES {
		for to_side in SIDES {
			let route = straight(
				ConnectorEnd::sided(SOURCE, from_side),
				ConnectorEnd::sided(target, to_side),
			);
			let from = anchor_of(SOURCE, from_side);
			let to = anchor_of(target, to_side);
			assert_eq!(route.points.len(), 2);
			assert!(close(
				(route.points[0].x - from.x).hypot(route.points[0].y - from.y),
				ARROW_GAP
			));
			assert!(close((route.points[1].x - to.x).hypot(route.points[1].y - to.y), ARROW_GAP));
		}
	}
}

#[test]
fn curve_bends_the_chord_into_a_quadratic_through_its_offset_midpoint() {
	let route = bent(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE), 66.0);
	assert_eq!(route.points, [Point::new(248.0, 186.0), Point::new(392.0, 186.0)]);
	assert_eq!(route.control, Some(Point::new(320.0, 54.0)));
	assert_eq!(route.along(0.5), Point::new(320.0, 120.0));
	assert_eq!(route_path_data(&route), "M248 186 Q320 54 392 186");
	assert!(close(route.arrow.x, 72.0 / 72f64.hypot(132.0)));
	assert!(close(route.arrow.y, 132.0 / 72f64.hypot(132.0)));
}

#[test]
fn a_negative_bend_bows_to_the_other_side() {
	assert_eq!(
		curve_control(Point::new(248.0, 186.0), Point::new(392.0, 186.0), -66.0),
		Point::new(320.0, 318.0)
	);
}

const CHORD: (Point, Point) = (Point::new(248.0, 186.0), Point::new(392.0, 186.0));

#[test]
fn the_middle_handle_bends_the_arrow_by_its_offset_from_the_chord() {
	assert_eq!(bend_through(CHORD.0, CHORD.1, Point::new(320.0, 120.0)), 66.0);
}

#[test]
fn the_middle_handle_measures_across_the_chord_only() {
	assert_eq!(bend_through(CHORD.0, CHORD.1, Point::new(260.0, 252.0)), -66.0);
}

#[test]
fn the_curve_runs_through_the_dragged_handle() {
	let bend = bend_through(CHORD.0, CHORD.1, Point::new(320.0, 90.0));
	let route = bent(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE), bend);
	assert_eq!(route.along(0.5), Point::new(320.0, 90.0));
}

#[test]
fn elbow_routes_every_side_pair_in_every_layout() {
	for (layout, target) in LAYOUTS {
		for from_side in SIDES {
			for to_side in SIDES {
				let route = elbow(
					ConnectorEnd::sided(SOURCE, from_side),
					ConnectorEnd::sided(target, to_side),
					&Obstacles::default(),
				);
				let case = format!("{from_side:?} to {to_side:?} with the objects {layout}");
				let points = &route.points;
				let segments = segments_of(points);
				let from = anchor_of(SOURCE, from_side);
				let to = anchor_of(target, to_side);
				assert_eq!(direction_of(from, points[0]), outward(from_side), "{case}");
				assert_eq!(direction_of(to, points[points.len() - 1]), outward(to_side), "{case}");
				for (a, b) in &segments {
					assert!(a.x == b.x || a.y == b.y, "{case}");
					assert!(a != b, "{case}");
					assert!(!sampled_crosses_inside(*a, *b, SOURCE), "{case}");
					assert!(!sampled_crosses_inside(*a, *b, target), "{case}");
				}
				let first = segments[0];
				let last = segments[segments.len() - 1];
				assert_eq!(direction_of(first.0, first.1), outward(from_side), "{case}");
				assert_eq!(direction_of(last.0, last.1), inward(to_side), "{case}");
				assert_eq!(route.arrow, direction_of(last.0, last.1), "{case}");
			}
		}
	}
}

#[test]
fn elbow_draws_one_segment_between_facing_anchors_on_the_same_line() {
	let target = Rect::new(280.0, 0.0, 160.0, 120.0);
	let route = elbow(
		ConnectorEnd::sided(SOURCE, Side::Right),
		ConnectorEnd::sided(target, Side::Left),
		&Obstacles::default(),
	);
	assert_eq!(route.points, [Point::new(168.0, 60.0), Point::new(272.0, 60.0)]);
}

#[test]
fn elbow_turns_halfway_between_facing_anchors_on_different_lines() {
	let target = Rect::new(280.0, 160.0, 160.0, 120.0);
	let route = elbow(
		ConnectorEnd::sided(SOURCE, Side::Right),
		ConnectorEnd::sided(target, Side::Left),
		&Obstacles::default(),
	);
	assert_eq!(
		route.points,
		[
			Point::new(168.0, 60.0),
			Point::new(220.0, 60.0),
			Point::new(220.0, 220.0),
			Point::new(272.0, 220.0)
		]
	);
}

#[test]
fn elbow_passes_48_above_the_shape_in_its_way_with_corners_of_radius_8() {
	let obstacles = Obstacles {
		blocks: vec![LEFT_SHAPE, RIGHT_SHAPE, FAR_SHAPE],
		titles: Vec::new(),
		frames: Vec::new(),
	};
	let route = elbow(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(FAR_SHAPE), &obstacles);
	assert_eq!(
		route.points,
		[
			outward_by(Side::Top, LEFT_SHAPE, 8.0),
			Point::new(160.0, 78.0),
			Point::new(800.0, 78.0),
			outward_by(Side::Top, FAR_SHAPE, 8.0)
		]
	);
	assert_eq!(
		route_path_data(&route),
		"M160 118 L160 86 Q160 78 168 78 L792 78 Q800 78 800 86 L800 118"
	);
	for (a, b) in segments_of(&route.points) {
		for shape in [LEFT_SHAPE, RIGHT_SHAPE, FAR_SHAPE] {
			assert!(!sampled_crosses_inside(a, b, shape));
		}
	}
}

#[test]
fn after_board_draws_every_arrow_on_its_path() {
	let cases = after_board_arrows();
	let arrows: Vec<Arrow> = cases.iter().map(|(_, arrow)| *arrow).collect();
	let routes = route_connectors(&arrows, &after_board_obstacles());
	for (index, ((path, _), route)) in cases.iter().zip(&routes).enumerate() {
		assert_eq!(route_path_data(route), *path, "arrow {}", index + 1);
	}
}

#[test]
fn after_board_sends_the_host_to_the_relay_over_the_top_since_its_bottom_leads_to_the_agent_sdk() {
	let obstacles = after_board_obstacles();
	let alone = elbow(ConnectorEnd::of(HOST_RUST), ConnectorEnd::of(RELAY), &obstacles);
	assert_eq!(alone.points[0], Point::new(344.0, 296.0));
	let arrows: Vec<Arrow> = after_board_arrows().iter().map(|(_, arrow)| *arrow).collect();
	let routes = route_connectors(&arrows, &obstacles);
	assert_eq!(routes[5].points[0], Point::new(344.0, 120.0));
}

#[test]
fn after_board_crosses_no_sticky_and_no_frame_title_on_any_arrow() {
	let obstacles = after_board_obstacles();
	let arrows: Vec<Arrow> = after_board_arrows().iter().map(|(_, arrow)| *arrow).collect();
	for route in route_connectors(&arrows, &obstacles) {
		for (a, b) in segments_of(&route.points) {
			for block in obstacles.blocks.iter().chain(&obstacles.titles) {
				assert!(!sampled_crosses_inside(a, b, *block));
			}
		}
	}
}

const LOOSE_POINT: Point = Point::new(600.0, 320.0);

fn loose() -> ConnectorEnd {
	ConnectorEnd::pointed(Rect::at(LOOSE_POINT), LOOSE_POINT)
}

#[test]
fn a_loose_end_ends_the_line_and_the_head_tip_on_a_board_point_with_no_gap() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), loose());
	assert_eq!(route.points[1], LOOSE_POINT);
	let length = (LOOSE_POINT.x - 160.0).hypot(LOOSE_POINT.y - 186.0);
	assert!(close(route.points[0].x, 240.0 + ARROW_GAP * (LOOSE_POINT.x - 160.0) / length));
}

#[test]
fn a_loose_end_starts_the_line_on_a_board_point_with_no_gap() {
	let route = straight(loose(), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(route.points[0], LOOSE_POINT);
}

#[test]
fn two_loose_ends_draw_a_straight_arrow_elbow_or_not() {
	let other = Point::new(100.0, 40.0);
	let route =
		elbow(loose(), ConnectorEnd::pointed(Rect::at(other), other), &Obstacles::default());
	assert_eq!(route.points, [LOOSE_POINT, other]);
}

#[test]
fn an_elbow_from_a_shape_to_a_board_point_ends_on_the_point() {
	let route = elbow(ConnectorEnd::of(LEFT_SHAPE), loose(), &Obstacles::default());
	assert_eq!(route.points[route.points.len() - 1], LOOSE_POINT);
	for (a, b) in segments_of(&route.points) {
		assert!(a.x == b.x || a.y == b.y);
	}
}

#[test]
fn crossed_rects_names_the_shapes_a_straight_arrow_passes_across() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(FAR_SHAPE));
	assert_eq!(crossed_rects(&route, &[RIGHT_SHAPE, AGENT_SDK]), [RIGHT_SHAPE]);
}

#[test]
fn crossed_rects_follows_the_curve_of_a_bent_arrow() {
	let route = bent(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(FAR_SHAPE), 140.0);
	assert!(crossed_rects(&route, &[RIGHT_SHAPE]).is_empty());
}

#[test]
fn loose_end_sits_on_the_point_and_faces_the_point_it_is_drawn_from() {
	assert_eq!(
		loose_end(Point::new(400.0, 50.0), Point::new(160.0, 60.0)),
		ConnectorEnd {
			rect: Rect::new(400.0, 50.0, 0.0, 0.0),
			side: Some(Side::Left),
			point: Some(Point::new(400.0, 50.0)),
		}
	);
	assert_eq!(loose_end(Point::new(170.0, 400.0), Point::new(160.0, 60.0)).side, Some(Side::Top));
}

#[test]
fn path_data_draws_a_straight_route_as_one_line() {
	assert_eq!(
		route_path_data(&plain(&[Point::new(0.0, 0.0), Point::new(30.0, 40.0)])),
		"M0 0 L30 40"
	);
}

#[test]
fn path_data_rounds_each_turn_with_a_quadratic_corner_of_radius_8() {
	assert_eq!(
		route_path_data(&plain(&[
			Point::new(0.0, 0.0),
			Point::new(40.0, 0.0),
			Point::new(40.0, 40.0)
		])),
		"M0 0 L32 0 Q40 0 40 8 L40 40"
	);
}

#[test]
fn path_data_shrinks_a_corner_to_half_of_a_short_segment() {
	assert_eq!(
		route_path_data(&plain(&[
			Point::new(0.0, 0.0),
			Point::new(6.0, 0.0),
			Point::new(6.0, 40.0)
		])),
		"M0 0 L3 0 Q6 0 6 3 L6 40"
	);
}

#[test]
fn the_label_centres_on_the_middle_of_the_route_by_default() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(route.along(0.5), Point::new(320.0, 186.0));
}

#[test]
fn the_label_slides_along_the_route_with_its_position() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(route.along(0.25), Point::new(284.0, 186.0));
}

#[test]
fn the_label_measures_an_elbow_along_its_length() {
	let route = plain(&[Point::new(0.0, 0.0), Point::new(40.0, 0.0), Point::new(40.0, 40.0)]);
	assert_eq!(route.along(0.75), Point::new(40.0, 20.0));
}

#[test]
fn a_dragged_label_slides_to_the_point_of_the_route_nearest_the_pointer() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(fraction_nearest(&route, Point::new(284.0, 140.0)), 0.25);
}

#[test]
fn a_dragged_label_stays_on_the_route_past_its_ends() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(fraction_nearest(&route, Point::new(900.0, 186.0)), 1.0);
}

#[test]
fn a_dragged_label_follows_the_curve_of_a_bent_arrow() {
	let curve = bent(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE), 66.0);
	assert_eq!(fraction_nearest(&curve, Point::new(320.0, 100.0)), 0.5);
}

#[test]
fn the_label_tick_runs_along_a_straight_route() {
	let route = straight(ConnectorEnd::of(LEFT_SHAPE), ConnectorEnd::of(RIGHT_SHAPE));
	assert_eq!(direction_along(&route, 0.5), Point::new(1.0, 0.0));
}

#[test]
fn the_label_tick_runs_along_the_leg_of_an_elbow_the_fraction_falls_on() {
	let route = plain(&[Point::new(0.0, 0.0), Point::new(40.0, 0.0), Point::new(40.0, 40.0)]);
	assert_eq!(direction_along(&route, 0.75), Point::new(0.0, 1.0));
}

#[test]
fn three_head_sizes_open_a_chevron_7_by_4_10_by_6_and_14_by_8() {
	let tip = Point::new(392.0, 186.0);
	let right = Point::new(1.0, 0.0);
	assert_eq!(arrowhead_path_data(tip, right, HeadSize::Small), "M385 190 L392 186 L385 182");
	assert_eq!(arrowhead_path_data(tip, right, HeadSize::Medium), "M382 192 L392 186 L382 180");
	assert_eq!(arrowhead_path_data(tip, right, HeadSize::Large), "M378 194 L392 186 L378 178");
}
