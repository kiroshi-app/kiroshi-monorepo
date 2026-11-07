use rune::{Color, El, LineCap, Path, Shape, canvas};

use super::model::{HeadSize, Point, Rect, Size, Viewport};
use super::route::{
	CORNER_RADIUS, PathCommand, Route, arrowhead_points, direction_along, route_commands,
};
use crate::tokens::Tokens;

pub const STROKE: f64 = 1.5;
const HALO_STROKE: f64 = 4.5;
const SOURCE_DOT_RADIUS: f64 = 4.0;
const MARKER_RING_RADIUS: f64 = 9.0;
const MARKER_DOT_RADIUS: f64 = 3.0;
const MARKER_STROKE: f64 = 2.0;
const MIDDLE_TICK_HALF_LENGTH: f64 = 8.0;
const TICK_DASH: f64 = 2.0;
const TICK_GAP: f64 = 3.0;
const MASK_SAMPLES: usize = 96;
const CIRCLE_SEGMENTS: usize = 48;
pub const LABEL_MIDDLE: f64 = 0.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Look {
	Rest,
	Selected,
	Draft,
}

pub struct Line<'a> {
	pub route: &'a Route,
	pub look: Look,
	pub head: HeadSize,
	pub passes_under: &'a [Rect],
	pub has_halo: bool,
	pub marker: Option<Point>,
	pub has_middle_tick: bool,
}

pub struct Ink {
	shape: Shape,
	viewport: Viewport,
}

fn screen(viewport: Viewport, point: Point) -> [f32; 2] {
	let at = viewport.to_screen(point);
	[at.x as f32, at.y as f32]
}

fn circle_points(viewport: Viewport, centre: Point, radius: f64) -> Vec<[f32; 2]> {
	(0..CIRCLE_SEGMENTS)
		.map(|step| {
			let angle = step as f64 / CIRCLE_SEGMENTS as f64 * std::f64::consts::TAU;
			screen(
				viewport,
				Point::new(centre.x + radius * angle.cos(), centre.y + radius * angle.sin()),
			)
		})
		.collect()
}

fn polyline(points: &[[f32; 2]]) -> Path {
	let mut path = Path::new().move_to(points[0]);
	for point in &points[1..] {
		path = path.line_to(*point);
	}
	path
}

fn path_of(viewport: Viewport, commands: &[PathCommand]) -> Path {
	commands.iter().fold(Path::new(), |path, command| match command {
		PathCommand::Move(point) => path.move_to(screen(viewport, *point)),
		PathCommand::Line(point) => path.line_to(screen(viewport, *point)),
		PathCommand::Quad(control, point) => {
			path.quad_to(screen(viewport, *control), screen(viewport, *point))
		}
	})
}

fn is_inside(point: Point, rect: &Rect) -> bool {
	rect.x < point.x
		&& point.x < rect.x + rect.width
		&& rect.y < point.y
		&& point.y < rect.y + rect.height
}

fn visible_runs(route: &Route, holes: &[Rect]) -> Vec<Vec<Point>> {
	let mut runs: Vec<Vec<Point>> = Vec::new();
	let mut current: Vec<Point> = Vec::new();
	for step in 0..=MASK_SAMPLES {
		let point = route.along(step as f64 / MASK_SAMPLES as f64);
		if holes.iter().any(|hole| is_inside(point, hole)) {
			if current.len() > 1 {
				runs.push(std::mem::take(&mut current));
			}
			current.clear();
		} else {
			current.push(point);
		}
	}
	if current.len() > 1 {
		runs.push(current);
	}
	runs
}

impl Ink {
	pub fn new(viewport: Viewport) -> Ink {
		Ink { shape: Shape::new(), viewport }
	}

	fn width(&self, board: f64) -> f32 {
		(board * self.viewport.zoom) as f32
	}

	fn stroke_route(&mut self, line: &Line, width: f64, colour: Color) {
		let width = self.width(width);
		let shape = std::mem::take(&mut self.shape);
		self.shape = if line.passes_under.is_empty() {
			let commands = route_commands(&line.route.points, line.route.control, CORNER_RADIUS);
			shape.stroke_path(&path_of(self.viewport, &commands), width, LineCap::Round, colour)
		} else {
			visible_runs(line.route, line.passes_under).iter().fold(shape, |shape, run| {
				let points: Vec<[f32; 2]> =
					run.iter().map(|point| screen(self.viewport, *point)).collect();
				shape.stroke_path(&polyline(&points), width, LineCap::Round, colour)
			})
		};
		if let Some(tip) = line.route.points.last()
			&& !line.passes_under.iter().any(|hole| is_inside(*tip, hole))
		{
			let head: Vec<[f32; 2]> = arrowhead_points(*tip, line.route.arrow, line.head)
				.iter()
				.map(|point| screen(self.viewport, *point))
				.collect();
			self.shape = std::mem::take(&mut self.shape).stroke_path(
				&polyline(&head),
				width,
				LineCap::Round,
				colour,
			);
		}
	}

	pub fn line(&mut self, t: &Tokens, line: &Line) {
		let colour = if line.look == Look::Rest { t.board_shape_border } else { t.user_bubble };
		if line.has_halo {
			self.stroke_route(line, HALO_STROKE, t.board_surface);
		}
		self.stroke_route(line, STROKE, colour);
		if line.has_middle_tick {
			self.middle_tick(t, line.route);
		}
		if let Some(at) = line.marker {
			self.marker(t, at);
		}
	}

	fn middle_tick(&mut self, t: &Tokens, route: &Route) {
		let middle = route.along(LABEL_MIDDLE);
		let along = direction_along(route, LABEL_MIDDLE);
		let across = Point::new(-along.y, along.x);
		let colour = t.user_bubble.alpha(t.user_bubble.a * 0.6);
		let mut offset = -MIDDLE_TICK_HALF_LENGTH;
		while offset < MIDDLE_TICK_HALF_LENGTH {
			let end = (offset + TICK_DASH).min(MIDDLE_TICK_HALF_LENGTH);
			let a = Point::new(middle.x + across.x * offset, middle.y + across.y * offset);
			let b = Point::new(middle.x + across.x * end, middle.y + across.y * end);
			self.shape = std::mem::take(&mut self.shape).line(
				screen(self.viewport, a),
				screen(self.viewport, b),
				self.width(STROKE),
				LineCap::Butt,
				colour,
			);
			offset = end + TICK_GAP;
		}
	}

	fn ring(&mut self, centre: Point, radius: f64, width: f64, colour: Color) {
		let points = circle_points(self.viewport, centre, radius);
		let path = polyline(&points).close();
		self.shape = std::mem::take(&mut self.shape).stroke_path(
			&path,
			self.width(width),
			LineCap::Round,
			colour,
		);
	}

	fn disc(&mut self, centre: Point, radius: f64, colour: Color) {
		self.shape = std::mem::take(&mut self.shape)
			.fill(circle_points(self.viewport, centre, radius), colour);
	}

	pub fn marker(&mut self, t: &Tokens, at: Point) {
		self.ring(at, MARKER_RING_RADIUS, MARKER_STROKE, t.board_arrow_marker);
		self.disc(at, MARKER_DOT_RADIUS, t.board_arrow_marker);
	}

	pub fn source_dot(&mut self, t: &Tokens, at: Point) {
		self.disc(at, SOURCE_DOT_RADIUS, t.board_surface);
		self.ring(at, SOURCE_DOT_RADIUS, STROKE, t.user_bubble);
	}

	pub fn is_empty(&self) -> bool {
		self.shape.is_empty()
	}

	pub fn draw(self, area: Size) -> El {
		canvas(self.shape)
			.absolute(0.0, 0.0)
			.size(area.width as f32, area.height as f32)
			.a11y_hidden()
	}
}

pub fn dot_grid(t: &Tokens, area: Size, offset: Point, pitch: f64) -> El {
	let start = |origin: f64| origin.rem_euclid(pitch);
	let mut shape = Shape::new();
	let mut y = start(offset.y);
	while y < area.height {
		let mut x = start(offset.x);
		while x < area.width {
			let (left, top) = (x as f32, y as f32);
			shape = shape.fill(
				vec![[left, top], [left + 1.0, top], [left + 1.0, top + 1.0], [left, top + 1.0]],
				t.board_dot,
			);
			x += pitch;
		}
		y += pitch;
	}
	canvas(shape).absolute(0.0, 0.0).size(area.width as f32, area.height as f32).a11y_hidden()
}
