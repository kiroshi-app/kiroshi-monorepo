use super::model::{HeadSize, Point, Rect, Routing, Side, round_half_up};

#[cfg(test)]
mod tests;

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct ConnectorEnd {
	pub rect: Rect,
	pub side: Option<Side>,
	pub point: Option<Point>,
}

impl ConnectorEnd {
	pub const fn of(rect: Rect) -> ConnectorEnd {
		ConnectorEnd { rect, side: None, point: None }
	}

	pub const fn sided(rect: Rect, side: Side) -> ConnectorEnd {
		ConnectorEnd { rect, side: Some(side), point: None }
	}

	pub const fn pointed(rect: Rect, point: Point) -> ConnectorEnd {
		ConnectorEnd { rect, side: None, point: Some(point) }
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SideEnd {
	pub rect: Rect,
	pub side: Side,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Obstacles {
	pub blocks: Vec<Rect>,
	pub titles: Vec<Rect>,
	pub frames: Vec<Rect>,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Arrow {
	pub source: ConnectorEnd,
	pub target: ConnectorEnd,
	pub routing: Routing,
	pub bend: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Route {
	pub points: Vec<Point>,
	pub control: Option<Point>,
	pub arrow: Point,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PathCommand {
	Move(Point),
	Line(Point),
	Quad(Point, Point),
}

#[derive(Clone, Copy)]
struct ElbowEnd {
	start: Point,
	stub: Point,
	heading: usize,
	preference: f64,
}

pub const SIDES: [Side; 4] = [Side::Top, Side::Right, Side::Bottom, Side::Left];
pub const ARROW_GAP: f64 = 8.0;
pub const CORNER_RADIUS: f64 = 8.0;
const SHAPE_CLEARANCE: f64 = 48.0;
const FRAME_CLEARANCE: f64 = 24.0;
const BEND_COST: f64 = SHAPE_CLEARANCE;
const OFF_CENTRE_BEND_COST: f64 = 0.001;
const SIDE_PREFERENCE_COST: f64 = 0.000001;
const SOFT_ZONE_COST: f64 = 4.0;
const SHARED_SIDE_COST: f64 = SHAPE_CLEARANCE * 2.0;
const CROSSING_SAMPLES: usize = 64;
const FRACTION_SAMPLES: usize = 200;
const DIRECTION_SPAN: f64 = 0.01;
const SECTION_TITLE_INSET: f64 = 12.0;
const SECTION_TITLE_HEIGHT: f64 = 24.0;
const SECTION_TITLE_PADDING: f64 = 16.0;
const SECTION_TITLE_CHARACTER_WIDTH: f64 = 8.0;

const HEADINGS: [Point; 4] =
	[Point::new(0.0, -1.0), Point::new(1.0, 0.0), Point::new(0.0, 1.0), Point::new(-1.0, 0.0)];

pub fn head_of(size: HeadSize) -> (f64, f64) {
	match size {
		HeadSize::Small => (7.0, 4.0),
		HeadSize::Medium => (10.0, 6.0),
		HeadSize::Large => (14.0, 8.0),
	}
}

fn heading_of(side: Side) -> usize {
	match side {
		Side::Top => 0,
		Side::Right => 1,
		Side::Bottom => 2,
		Side::Left => 3,
	}
}

fn reverse_of(heading: usize) -> usize {
	(heading + 2) % 4
}

fn centre_of(rect: Rect) -> Point {
	Point::new(rect.x + rect.width / 2.0, rect.y + rect.height / 2.0)
}

pub fn anchor_of(rect: Rect, side: Side) -> Point {
	let middle = centre_of(rect);
	match side {
		Side::Top => Point::new(middle.x, rect.y),
		Side::Right => Point::new(rect.x + rect.width, middle.y),
		Side::Bottom => Point::new(middle.x, rect.y + rect.height),
		Side::Left => Point::new(rect.x, middle.y),
	}
}

fn offset(point: Point, heading: usize, by: f64) -> Point {
	Point::new(point.x + HEADINGS[heading].x * by, point.y + HEADINGS[heading].y * by)
}

fn unit(from: Point, to: Point) -> Option<Point> {
	let length = (to.x - from.x).hypot(to.y - from.y);
	(length != 0.0).then(|| Point::new((to.x - from.x) / length, (to.y - from.y) / length))
}

fn along(from: Point, direction: Point, by: f64) -> Point {
	Point::new(from.x + direction.x * by, from.y + direction.y * by)
}

fn distance(a: Point, b: Point) -> f64 {
	(a.x - b.x).abs() + (a.y - b.y).abs()
}

fn has_area(rect: Rect) -> bool {
	rect.width > 0.0 && rect.height > 0.0
}

fn inflated(rect: Rect, by: f64) -> Rect {
	Rect::new(rect.x - by, rect.y - by, rect.width + by * 2.0, rect.height + by * 2.0)
}

fn intersects(a: Rect, b: Rect) -> bool {
	a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

fn span_of(rects: &[Rect]) -> Rect {
	let left = rects.iter().map(|rect| rect.x).fold(f64::INFINITY, f64::min);
	let top = rects.iter().map(|rect| rect.y).fold(f64::INFINITY, f64::min);
	let right = rects.iter().map(|rect| rect.x + rect.width).fold(f64::NEG_INFINITY, f64::max);
	let bottom = rects.iter().map(|rect| rect.y + rect.height).fold(f64::NEG_INFINITY, f64::max);
	Rect::new(left, top, right - left, bottom - top)
}

fn reference_of(end: &ConnectorEnd) -> Point {
	end.point.unwrap_or_else(|| match end.side {
		Some(side) => anchor_of(end.rect, side),
		None => centre_of(end.rect),
	})
}

fn outline_exit(rect: Rect, towards: Point) -> Point {
	let centre = centre_of(rect);
	let dx = towards.x - centre.x;
	let dy = towards.y - centre.y;
	let scale_x = if dx == 0.0 { f64::INFINITY } else { rect.width / 2.0 / dx.abs() };
	let scale_y = if dy == 0.0 { f64::INFINITY } else { rect.height / 2.0 / dy.abs() };
	let scale = scale_x.min(scale_y);
	if scale.is_finite() {
		Point::new(centre.x + dx * scale, centre.y + dy * scale)
	} else {
		centre
	}
}

pub fn line_end_of(end: &ConnectorEnd, towards: Point) -> Point {
	if let Some(point) = end.point {
		return point;
	}
	let outline = match end.side {
		Some(side) => anchor_of(end.rect, side),
		None => outline_exit(end.rect, towards),
	};
	match unit(outline, towards) {
		Some(direction) => along(outline, direction, ARROW_GAP),
		None => outline,
	}
}

pub fn curve_control(from: Point, to: Point, bend: f64) -> Point {
	let chord = unit(from, to).unwrap_or(Point::new(1.0, 0.0));
	Point::new(
		(from.x + to.x) / 2.0 + chord.y * bend * 2.0,
		(from.y + to.y) / 2.0 - chord.x * bend * 2.0,
	)
}

pub fn bend_through(from: Point, to: Point, through: Point) -> f64 {
	let chord = unit(from, to).unwrap_or(Point::new(1.0, 0.0));
	let middle = Point::new((from.x + to.x) / 2.0, (from.y + to.y) / 2.0);
	round_half_up((through.x - middle.x) * chord.y - (through.y - middle.y) * chord.x)
}

fn is_between(value: f64, low: f64, high: f64) -> bool {
	low < value && value < high
}

fn is_inside(point: Point, rect: Rect) -> bool {
	is_between(point.x, rect.x, rect.x + rect.width)
		&& is_between(point.y, rect.y, rect.y + rect.height)
}

fn overlaps_open(a1: f64, a2: f64, b1: f64, b2: f64) -> bool {
	a1.min(a2).max(b1) < a1.max(a2).min(b2) || (a1 == a2 && is_between(a1, b1, b2))
}

fn crosses_inside(a: Point, b: Point, rect: Rect) -> bool {
	let right = rect.x + rect.width;
	let bottom = rect.y + rect.height;
	if a.y == b.y {
		return is_between(a.y, rect.y, bottom) && overlaps_open(a.x, b.x, rect.x, right);
	}
	is_between(a.x, rect.x, right) && overlaps_open(a.y, b.y, rect.y, bottom)
}

fn runs_along_frame(a: Point, b: Point, frame: Rect) -> bool {
	let is_horizontal = a.y == b.y;
	let (edges, level, span) = if is_horizontal {
		(
			[frame.y, frame.y + frame.height],
			a.y,
			(frame.x - FRAME_CLEARANCE, frame.x + frame.width + FRAME_CLEARANCE),
		)
	} else {
		(
			[frame.x, frame.x + frame.width],
			a.x,
			(frame.y - FRAME_CLEARANCE, frame.y + frame.height + FRAME_CLEARANCE),
		)
	};
	edges.iter().any(|edge| (level - edge).abs() < FRAME_CLEARANCE)
		&& if is_horizontal {
			overlaps_open(a.x, b.x, span.0, span.1)
		} else {
			overlaps_open(a.y, b.y, span.0, span.1)
		}
}

fn is_collinear(a: Point, b: Point, c: Point) -> bool {
	(a.x == b.x && b.x == c.x) || (a.y == b.y && b.y == c.y)
}

fn simplified(points: &[Point]) -> Vec<Point> {
	let mut kept: Vec<Point> = Vec::with_capacity(points.len());
	for &point in points {
		let last = kept.last().copied();
		if last == Some(point) {
			continue;
		}
		let before_last = kept.len().checked_sub(2).map(|at| kept[at]);
		if let (Some(last), Some(before_last)) = (last, before_last)
			&& is_collinear(before_last, last, point)
		{
			kept.pop();
		}
		kept.push(point);
	}
	kept
}

fn distance_ahead(from: Point, heading: usize, blocks: &[Rect]) -> f64 {
	let Point { x, y } = HEADINGS[heading];
	blocks
		.iter()
		.filter_map(|rect| {
			let is_in_line = if x == 0.0 {
				is_between(from.x, rect.x, rect.x + rect.width)
			} else {
				is_between(from.y, rect.y, rect.y + rect.height)
			};
			if !is_in_line {
				return None;
			}
			let distance = if x > 0.0 {
				rect.x - from.x
			} else if x < 0.0 {
				from.x - rect.x - rect.width
			} else if y > 0.0 {
				rect.y - from.y
			} else {
				from.y - rect.y - rect.height
			};
			(distance >= 0.0).then_some(distance)
		})
		.fold(f64::INFINITY, f64::min)
}

fn nearest_side_of(rect: Rect, point: Point) -> Side {
	let distance_to = |side: Side| match side {
		Side::Top => point.y - rect.y,
		Side::Right => rect.x + rect.width - point.x,
		Side::Bottom => rect.y + rect.height - point.y,
		Side::Left => point.x - rect.x,
	};
	SIDES
		.into_iter()
		.reduce(
			|nearest, side| if distance_to(side) < distance_to(nearest) { side } else { nearest },
		)
		.unwrap_or(Side::Top)
}

fn elbow_ends_of(end: &ConnectorEnd, blocks: &[Rect], busy: &[SideEnd]) -> Vec<ElbowEnd> {
	let sides: Vec<Side> = match (end.point, end.side) {
		(Some(point), side) => vec![side.unwrap_or_else(|| nearest_side_of(end.rect, point))],
		(None, Some(side)) => vec![side],
		(None, None) => SIDES.to_vec(),
	};
	sides
		.into_iter()
		.map(|side| {
			let heading = heading_of(side);
			let anchor = end.point.unwrap_or_else(|| anchor_of(end.rect, side));
			let ahead = distance_ahead(anchor, heading, blocks);
			let stub_length = SHAPE_CLEARANCE.min(ahead / 2.0);
			let gap = if end.point.is_some() { 0.0 } else { ARROW_GAP.min(stub_length / 2.0) };
			let is_shared = busy.iter().any(|taken| taken.side == side && taken.rect == end.rect);
			ElbowEnd {
				start: offset(anchor, heading, gap),
				stub: offset(anchor, heading, stub_length),
				heading,
				preference: heading as f64 * SIDE_PREFERENCE_COST
					+ if is_shared { SHARED_SIDE_COST } else { 0.0 },
			}
		})
		.collect()
}

#[derive(Clone, Copy)]
enum Axis {
	X,
	Y,
}

fn lanes_of(
	axis: Axis,
	ends: &[ElbowEnd],
	source: Rect,
	target: Rect,
	blocks: &[Rect],
	frames: &[Rect],
) -> Vec<f64> {
	let start = |rect: &Rect| match axis {
		Axis::X => rect.x,
		Axis::Y => rect.y,
	};
	let size = |rect: &Rect| match axis {
		Axis::X => rect.width,
		Axis::Y => rect.height,
	};
	let of_point = |point: &Point| match axis {
		Axis::X => point.x,
		Axis::Y => point.y,
	};
	let mut lanes: Vec<f64> = ends.iter().map(|end| of_point(&end.stub)).collect();
	for rect in blocks {
		lanes.extend([start(rect) - SHAPE_CLEARANCE, start(rect) + size(rect) + SHAPE_CLEARANCE]);
	}
	for rect in frames {
		lanes.extend([start(rect) - FRAME_CLEARANCE, start(rect) + size(rect) + FRAME_CLEARANCE]);
	}
	if start(&source) + size(&source) < start(&target) {
		lanes.push((start(&source) + size(&source) + start(&target)) / 2.0);
	}
	if start(&target) + size(&target) < start(&source) {
		lanes.push((start(&target) + size(&target) + start(&source)) / 2.0);
	}
	lanes.sort_by(f64::total_cmp);
	lanes.dedup_by(|a, b| a == b);
	lanes
}

fn push_entry(queue: &mut Vec<(f64, usize)>, entry: (f64, usize)) {
	queue.push(entry);
	let mut at = queue.len() - 1;
	while at > 0 {
		let parent = (at - 1) >> 1;
		if queue[parent].0 <= queue[at].0 {
			return;
		}
		queue.swap(parent, at);
		at = parent;
	}
}

fn pop_entry(queue: &mut Vec<(f64, usize)>) -> Option<(f64, usize)> {
	let top = *queue.first()?;
	let last = queue.pop()?;
	if queue.is_empty() {
		return Some(top);
	}
	queue[0] = last;
	let mut at = 0;
	loop {
		let left = at * 2 + 1;
		let mut least = at;
		for child in [left, left + 1] {
			if child < queue.len() && queue[child].0 < queue[least].0 {
				least = child;
			}
		}
		if least == at {
			return Some(top);
		}
		queue.swap(least, at);
		at = least;
	}
}

struct Grid {
	xs: Vec<f64>,
	ys: Vec<f64>,
}

impl Grid {
	fn node_of(&self, point: Point) -> Option<usize> {
		let column = self.xs.iter().position(|x| *x == point.x)?;
		let row = self.ys.iter().position(|y| *y == point.y)?;
		Some(row * self.xs.len() + column)
	}

	fn point_at(&self, node: usize) -> Point {
		Point::new(self.xs[node % self.xs.len()], self.ys[node / self.xs.len()])
	}

	fn neighbour_of(&self, node: usize, heading: usize) -> Option<usize> {
		let column = (node % self.xs.len()) as i64 + HEADINGS[heading].x as i64;
		let row = (node / self.xs.len()) as i64 + HEADINGS[heading].y as i64;
		if column < 0 || column >= self.xs.len() as i64 || row < 0 || row >= self.ys.len() as i64 {
			return None;
		}
		Some(row as usize * self.xs.len() + column as usize)
	}
}

fn elbow_points(
	source: &ConnectorEnd,
	target: &ConnectorEnd,
	obstacles: &Obstacles,
	busy: &[SideEnd],
) -> Vec<Point> {
	let region = inflated(span_of(&[source.rect, target.rect]), SHAPE_CLEARANCE * 2.0);
	let points: Vec<Point> = [source.point, target.point].into_iter().flatten().collect();
	let is_in_the_way = |rect: &Rect| {
		has_area(*rect)
			&& intersects(*rect, region)
			&& !points.iter().any(|point| is_inside(*point, *rect))
	};
	let candidates: Vec<Rect> =
		[source.rect, target.rect].into_iter().chain(obstacles.blocks.iter().copied()).collect();
	let blocks: Vec<Rect> = candidates
		.iter()
		.enumerate()
		.filter(|(index, rect)| {
			is_in_the_way(rect)
				&& candidates.iter().position(|other| other == *rect) == Some(*index)
		})
		.map(|(_, rect)| *rect)
		.collect();
	let walls: Vec<Rect> = blocks
		.iter()
		.copied()
		.chain(obstacles.titles.iter().copied().filter(is_in_the_way))
		.collect();
	let frames: Vec<Rect> =
		obstacles.frames.iter().copied().filter(|rect| intersects(*rect, region)).collect();
	let soft_zones: Vec<Rect> =
		blocks.iter().map(|rect| inflated(*rect, SHAPE_CLEARANCE)).collect();
	let source_ends = elbow_ends_of(source, &walls, busy);
	let target_ends = elbow_ends_of(target, &walls, busy);
	let ends: Vec<ElbowEnd> = source_ends.iter().chain(&target_ends).copied().collect();
	let grid = Grid {
		xs: lanes_of(Axis::X, &ends, source.rect, target.rect, &blocks, &frames),
		ys: lanes_of(Axis::Y, &ends, source.rect, target.rect, &blocks, &frames),
	};
	let source_centre = centre_of(source.rect);
	let target_centre = centre_of(target.rect);
	let centre = Point::new(
		(source_centre.x + target_centre.x) / 2.0,
		(source_centre.y + target_centre.y) / 2.0,
	);
	let bend_at = |point: Point| BEND_COST + distance(point, centre) * OFF_CENTRE_BEND_COST;
	let leg_cost = |from: Point, to: Point| {
		let is_soft = soft_zones.iter().any(|zone| crosses_inside(from, to, *zone))
			|| frames.iter().any(|frame| runs_along_frame(from, to, *frame));
		distance(from, to) * if is_soft { 1.0 + SOFT_ZONE_COST } else { 1.0 }
	};
	let state_of = |node: usize, heading: usize| node * 4 + heading;
	let states = grid.xs.len() * grid.ys.len() * 4;
	let mut cost = vec![f64::INFINITY; states];
	let mut previous: Vec<Option<usize>> = vec![None; states];
	let mut settled = vec![false; states];
	let mut queue: Vec<(f64, usize)> = Vec::new();
	for end in &source_ends {
		let Some(node) = grid.node_of(end.stub) else { continue };
		let state = state_of(node, end.heading);
		let reached = distance(end.start, end.stub) + end.preference;
		if reached < cost[state] {
			cost[state] = reached;
			push_entry(&mut queue, (reached, state));
		}
	}
	let mut best: Option<(usize, ElbowEnd)> = None;
	let mut best_cost = f64::INFINITY;
	while let Some((reached, state)) = pop_entry(&mut queue) {
		if settled[state] || reached > cost[state] {
			continue;
		}
		settled[state] = true;
		let node = state / 4;
		let heading = state % 4;
		for end in &target_ends {
			let inward = reverse_of(end.heading);
			if grid.node_of(end.stub) != Some(node) || heading == end.heading {
				continue;
			}
			let total = reached
				+ if heading == inward { 0.0 } else { bend_at(grid.point_at(node)) }
				+ distance(end.stub, end.start)
				+ end.preference;
			if total < best_cost {
				best = Some((state, *end));
				best_cost = total;
			}
		}
		for turn in 0..HEADINGS.len() {
			if turn == reverse_of(heading) {
				continue;
			}
			let Some(next) = grid.neighbour_of(node, turn) else { continue };
			let from = grid.point_at(node);
			let to = grid.point_at(next);
			if walls.iter().any(|rect| crosses_inside(from, to, *rect)) {
				continue;
			}
			let total =
				reached + leg_cost(from, to) + if turn == heading { 0.0 } else { bend_at(from) };
			let next_state = state_of(next, turn);
			if total < cost[next_state] {
				cost[next_state] = total;
				previous[next_state] = Some(state);
				push_entry(&mut queue, (total, next_state));
			}
		}
	}
	let Some((best_state, best_end)) = best else {
		let first = source_ends[0];
		let last = target_ends[0];
		return simplified(&[
			first.start,
			first.stub,
			Point::new(last.stub.x, first.stub.y),
			last.stub,
			last.start,
		]);
	};
	let mut path: Vec<Point> = Vec::new();
	let mut first_state = best_state;
	let mut walked = Some(best_state);
	while let Some(state) = walked {
		path.push(grid.point_at(state / 4));
		first_state = state;
		walked = previous[state];
	}
	path.reverse();
	let start = source_ends
		.iter()
		.find(|end| {
			grid.node_of(end.stub) == Some(first_state / 4) && end.heading == first_state % 4
		})
		.map_or(source_ends[0].start, |end| end.start);
	let mut route = vec![start];
	route.extend(path);
	route.push(best_end.start);
	simplified(&route)
}

fn side_facing(from: Point, towards: Point) -> Side {
	let dx = towards.x - from.x;
	let dy = towards.y - from.y;
	if dx.abs() > dy.abs() {
		return if dx > 0.0 { Side::Right } else { Side::Left };
	}
	if dy > 0.0 { Side::Bottom } else { Side::Top }
}

fn facing(end: &ConnectorEnd, other: &ConnectorEnd) -> ConnectorEnd {
	match end.point {
		Some(point) if end.side.is_none() && !has_area(end.rect) => {
			ConnectorEnd { side: Some(side_facing(point, reference_of(other))), ..*end }
		}
		_ => *end,
	}
}

pub fn route_connector(
	source: &ConnectorEnd,
	target: &ConnectorEnd,
	routing: Routing,
	bend: f64,
	obstacles: &Obstacles,
	busy: &[SideEnd],
) -> Route {
	let is_loose = !has_area(source.rect) && !has_area(target.rect);
	if routing == Routing::Elbow && !is_loose {
		let points =
			elbow_points(&facing(source, target), &facing(target, source), obstacles, busy);
		let arrow = match points.as_slice() {
			[.., before_last, last] => unit(*before_last, *last),
			_ => None,
		};
		return Route { points, control: None, arrow: arrow.unwrap_or(HEADINGS[2]) };
	}
	let from = line_end_of(source, reference_of(target));
	let to = line_end_of(target, reference_of(source));
	let control = (bend != 0.0).then(|| curve_control(from, to, bend));
	Route {
		points: vec![from, to],
		control,
		arrow: unit(control.unwrap_or(from), to).unwrap_or(HEADINGS[1]),
	}
}

pub fn route_connectors(arrows: &[Arrow], obstacles: &Obstacles) -> Vec<Route> {
	let mut busy: Vec<SideEnd> = Vec::new();
	let mut routes = Vec::with_capacity(arrows.len());
	for arrow in arrows {
		let route = route_connector(
			&arrow.source,
			&arrow.target,
			arrow.routing,
			arrow.bend,
			obstacles,
			&busy,
		);
		let tips = [route.points.first().copied(), route.points.last().copied()];
		for (end, tip) in [arrow.source, arrow.target].into_iter().zip(tips) {
			if let Some(tip) = tip
				&& has_area(end.rect)
				&& end.point.is_none()
			{
				busy.push(SideEnd { rect: end.rect, side: nearest_side_of(end.rect, tip) });
			}
		}
		routes.push(route);
	}
	routes
}

pub fn loose_end(point: Point, towards: Point) -> ConnectorEnd {
	ConnectorEnd {
		rect: Rect::at(point),
		side: Some(side_facing(point, towards)),
		point: Some(point),
	}
}

pub fn exact_point_of(rect: Rect, anchor: Point) -> Point {
	Point::new(rect.x + rect.width * anchor.x, rect.y + rect.height * anchor.y)
}

pub fn section_title_box(rect: Rect, title: &str) -> Rect {
	Rect::new(
		rect.x + SECTION_TITLE_INSET,
		rect.y + SECTION_TITLE_INSET,
		(rect.width - SECTION_TITLE_INSET * 2.0).min(
			SECTION_TITLE_PADDING
				+ title.encode_utf16().count() as f64 * SECTION_TITLE_CHARACTER_WIDTH,
		),
		SECTION_TITLE_HEIGHT,
	)
}

fn towards_by(from: Point, to: Point, by: f64) -> Point {
	along(from, unit(from, to).unwrap_or_default(), by)
}

pub fn route_commands(points: &[Point], control: Option<Point>, radius: f64) -> Vec<PathCommand> {
	if let (Some(control), [from, to]) = (control, points) {
		return vec![PathCommand::Move(*from), PathCommand::Quad(control, *to)];
	}
	let mut commands = Vec::with_capacity(points.len() * 2);
	for (index, point) in points.iter().copied().enumerate() {
		let previous = index.checked_sub(1).map(|at| points[at]);
		let next = points.get(index + 1).copied();
		match (previous, next) {
			(None, _) => commands.push(PathCommand::Move(point)),
			(Some(_), None) => commands.push(PathCommand::Line(point)),
			(Some(previous), Some(next)) => {
				let corner = radius
					.min((point.x - previous.x).hypot(point.y - previous.y) / 2.0)
					.min((next.x - point.x).hypot(next.y - point.y) / 2.0);
				commands.push(PathCommand::Line(towards_by(point, previous, corner)));
				commands.push(PathCommand::Quad(point, towards_by(point, next, corner)));
			}
		}
	}
	commands
}

fn rounded(value: f64) -> f64 {
	round_half_up(value * 100.0) / 100.0 + 0.0
}

fn point_data(point: Point) -> String {
	format!("{} {}", rounded(point.x), rounded(point.y))
}

pub fn path_data(commands: &[PathCommand]) -> String {
	commands
		.iter()
		.map(|command| match command {
			PathCommand::Move(point) => format!("M{}", point_data(*point)),
			PathCommand::Line(point) => format!("L{}", point_data(*point)),
			PathCommand::Quad(control, point) => {
				format!("Q{} {}", point_data(*control), point_data(*point))
			}
		})
		.collect::<Vec<_>>()
		.join(" ")
}

pub fn route_path_data(route: &Route) -> String {
	path_data(&route_commands(&route.points, route.control, CORNER_RADIUS))
}

pub fn point_along(points: &[Point], control: Option<Point>, fraction: f64) -> Point {
	if let (Some(control), [from, to]) = (control, points) {
		let rest = 1.0 - fraction;
		return Point::new(
			rest * rest * from.x + 2.0 * rest * fraction * control.x + fraction.powi(2) * to.x,
			rest * rest * from.y + 2.0 * rest * fraction * control.y + fraction.powi(2) * to.y,
		);
	}
	let legs: Vec<(Point, Point, f64)> = points
		.windows(2)
		.map(|leg| (leg[0], leg[1], (leg[1].x - leg[0].x).hypot(leg[1].y - leg[0].y)))
		.collect();
	let mut left = legs.iter().map(|leg| leg.2).sum::<f64>() * fraction;
	for (from, to, length) in legs {
		if left <= length {
			return towards_by(from, to, left);
		}
		left -= length;
	}
	points.last().copied().unwrap_or_default()
}

impl Route {
	pub fn along(&self, fraction: f64) -> Point {
		point_along(&self.points, self.control, fraction)
	}
}

pub fn fraction_nearest(route: &Route, point: Point) -> f64 {
	let gap_at = |fraction: f64| {
		let at = route.along(fraction);
		(at.x - point.x).hypot(at.y - point.y)
	};
	(0..=FRACTION_SAMPLES)
		.map(|step| step as f64 / FRACTION_SAMPLES as f64)
		.reduce(
			|nearest, fraction| if gap_at(fraction) < gap_at(nearest) { fraction } else { nearest },
		)
		.unwrap_or(0.0)
}

pub fn direction_along(route: &Route, fraction: f64) -> Point {
	unit(
		route.along((fraction - DIRECTION_SPAN).max(0.0)),
		route.along((fraction + DIRECTION_SPAN).min(1.0)),
	)
	.unwrap_or(HEADINGS[1])
}

pub fn crossed_rects(route: &Route, rects: &[Rect]) -> Vec<Rect> {
	let hull: Vec<Rect> =
		route.points.iter().chain(&route.control).map(|point| Rect::at(*point)).collect();
	let area = inflated(span_of(&hull), 1.0);
	let samples: Vec<Point> = (0..=CROSSING_SAMPLES)
		.map(|step| route.along(step as f64 / CROSSING_SAMPLES as f64))
		.collect();
	rects
		.iter()
		.copied()
		.filter(|rect| {
			intersects(*rect, area) && samples.iter().any(|point| is_inside(*point, *rect))
		})
		.collect()
}

pub fn arrowhead_points(tip: Point, direction: Point, size: HeadSize) -> [Point; 3] {
	let (length, half_width) = head_of(size);
	let back = along(tip, direction, -length);
	let wing = Point::new(-direction.y * half_width, direction.x * half_width);
	[
		Point::new(back.x + wing.x, back.y + wing.y),
		tip,
		Point::new(back.x - wing.x, back.y - wing.y),
	]
}

pub fn arrowhead_path_data(tip: Point, direction: Point, size: HeadSize) -> String {
	let [first, tip, last] = arrowhead_points(tip, direction, size);
	format!("M{} L{} L{}", point_data(first), point_data(tip), point_data(last))
}
