use std::collections::BTreeMap;
use std::process::Command;
use std::thread;
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{Webview, WebviewWindow};

use crate::capture::{answered, is_under_wayland};
use crate::open_points::{Status, Unproven};
use crate::placement::{Rectangle, Shift};
use crate::probe;

const POLL: Duration = Duration::from_millis(100);
const READING_TIMEOUT: Duration = Duration::from_secs(4);
const DELIVERY: Duration = Duration::from_millis(1200);
const KEY_DELAY_MS: &str = "60";
const VIEW_FIELD: &str = "view-field";
const MAIN_FIELD: &str = "main-field";
const VIEW_TEXT: &str = "view2364";
const MAIN_TEXT: &str = "main2364";
const MAIN_READING: &str = "JSON.stringify(window.__spikeInputSeen?.() ?? null)";
const VIEW_READING: &str = r#"(() => {
	const frame = document.querySelector("iframe");
	addEventListener("message", (event) => {
		if (!event.data?.spikeInputSeen) {
			return;
		}
		const box = frame.getBoundingClientRect();
		window.SLOT = JSON.stringify({
			wrapper: window.__spikeInputSeen(),
			document: event.data.spikeInputSeen,
			frameOrigin: { x: box.x + frame.clientLeft, y: box.y + frame.clientTop },
		});
	});
	frames[0].postMessage("spike-input-probe", "*");
})()"#;
const STATEMENTS: [&str; 4] = [
	"A click sent through the display server inside the rectangle of the view reaches the document of the view and not the main page",
	"Text typed through the display server after that click is held by a field of the view and changes no field of the main page",
	"A click sent through the display server on the main page outside the rectangle reaches the main page and not the view",
	"Text typed through the display server after a click on a field of the main page is held by that field and gives the view no key event",
];
const NO_ROUTE: &str =
	"this display setup offers no route to send a click or a key from outside the harness";

#[derive(Clone, Deserialize, PartialEq, Serialize)]
struct Click {
	x: f64,
	y: f64,
	target: String,
}

#[derive(Clone, Deserialize, PartialEq, Serialize)]
struct Field {
	value: String,
	x: f64,
	y: f64,
}

#[derive(Clone, Deserialize, PartialEq, Serialize)]
#[serde(rename_all(deserialize = "camelCase"))]
struct Seen {
	clicks: Vec<Click>,
	key_downs: usize,
	fields: BTreeMap<String, Field>,
}

impl Seen {
	fn holds(&self, field: &str, text: &str) -> bool {
		self.fields.get(field).is_some_and(|field| field.value == text)
	}
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ViewSeen {
	wrapper: Seen,
	document: Seen,
	frame_origin: Point,
}

#[derive(Clone, Copy, Deserialize, Serialize)]
struct Point {
	x: f64,
	y: f64,
}

#[derive(Clone, Serialize)]
struct Reading {
	main_page: Seen,
	view_wrapper: Seen,
	view_document: Seen,
	#[serde(skip)]
	view_frame_origin: Point,
}

impl Reading {
	fn clicks_in_the_view(&self) -> usize {
		self.view_wrapper.clicks.len() + self.view_document.clicks.len()
	}

	fn keys_in_the_view(&self) -> usize {
		self.view_wrapper.key_downs + self.view_document.key_downs
	}
}

pub struct Aim {
	pub view_on_the_screen: Rectangle,
	pub main_page_on_the_screen: Shift,
	pub pixels_per_point: f64,
}

impl Aim {
	fn at_the_view(&self, point: Point) -> Point {
		Point {
			x: self.view_on_the_screen.x + point.x * self.pixels_per_point,
			y: self.view_on_the_screen.y + point.y * self.pixels_per_point,
		}
	}

	fn at_the_main_page(&self, point: Point) -> Point {
		Point {
			x: self.main_page_on_the_screen.x + point.x * self.pixels_per_point,
			y: self.main_page_on_the_screen.y + point.y * self.pixels_per_point,
		}
	}

	fn is_in_the_view(&self, point: Point) -> bool {
		let Rectangle { x, y, width, height } = self.view_on_the_screen;
		(x..x + width).contains(&point.x) && (y..y + height).contains(&point.y)
	}
}

struct Route {
	name: &'static str,
	answers: fn() -> Vec<Command>,
	click: fn(&str, &str) -> Vec<Command>,
	typing: fn(&str) -> Vec<Command>,
}

fn command(program: &str, arguments: &[&str]) -> Command {
	let mut command = Command::new(program);
	command.args(arguments);
	command
}

const XDOTOOL: Route = Route {
	name: "xdotool, through the XTEST extension of the X server",
	answers: || vec![command("xdotool", &["getmouselocation"])],
	click: |x, y| vec![command("xdotool", &["mousemove", x, y, "click", "1"])],
	typing: |text| vec![command("xdotool", &["type", "--delay", KEY_DELAY_MS, text])],
};
const SWAYMSG_AND_WTYPE: Route = Route {
	name: "swaymsg seat cursor for the pointer, wtype through virtual-keyboard-unstable-v1 for the keys",
	answers: || vec![command("swaymsg", &["-t", "get_seats"]), command("wtype", &["-s", "1"])],
	click: |x, y| {
		vec![
			command("swaymsg", &["seat", "seat0", "cursor", "set", x, y]),
			command("swaymsg", &["seat", "seat0", "cursor", "press", "button1"]),
			command("swaymsg", &["seat", "seat0", "cursor", "release", "button1"]),
		]
	},
	typing: |text| vec![command("wtype", &["-d", KEY_DELAY_MS, text])],
};
const WLRCTL: Route = Route {
	name: "wlrctl, through wlr-virtual-pointer-unstable-v1 and virtual-keyboard-unstable-v1",
	answers: || vec![command("wlrctl", &["pointer", "move", "0", "0"])],
	click: |x, y| {
		vec![
			command("wlrctl", &["pointer", "move", "-100000", "-100000"]),
			command("wlrctl", &["pointer", "move", x, y]),
			command("wlrctl", &["pointer", "click", "left"]),
		]
	},
	typing: |text| vec![command("wlrctl", &["keyboard", "type", text])],
};

fn routes() -> &'static [Route] {
	if is_under_wayland() {
		&[SWAYMSG_AND_WTYPE, WLRCTL]
	} else {
		&[XDOTOOL]
	}
}

fn sent(commands: Vec<Command>) -> Result<Vec<String>, String> {
	let sent = commands
		.into_iter()
		.map(|command| {
			let line = format!("{command:?}");
			answered(command).map(|_| line)
		})
		.collect();
	thread::sleep(DELIVERY);
	sent
}

fn main_page_seen(main_window: &WebviewWindow) -> Result<Seen, String> {
	let reading = probe::answer(main_window.as_ref(), MAIN_READING)?;
	serde_json::from_str::<Option<Seen>>(&reading)
		.map_err(|cause| format!("unreadable input reading of the main page: {cause}"))?
		.ok_or_else(|| "the main page holds no input recorder".to_owned())
}

fn view_seen(view: &Webview) -> Result<ViewSeen, String> {
	let slot = format!("__spikeInputSeen{}", uuid::Uuid::new_v4().simple());
	view.eval(VIEW_READING.replace("SLOT", &slot)).map_err(|cause| cause.to_string())?;
	let deadline = Instant::now() + READING_TIMEOUT;
	while Instant::now() < deadline {
		thread::sleep(POLL);
		let reading = probe::answer(view, &format!("window.{slot} ?? \"\""))?;
		if !reading.is_empty() {
			return serde_json::from_str(&reading)
				.map_err(|cause| format!("unreadable input reading of the view: {cause}"));
		}
	}
	Err(format!(
		"the document of the view gave no input reading within {} seconds",
		READING_TIMEOUT.as_secs()
	))
}

fn read(main_window: &WebviewWindow, view: &Webview) -> Result<Reading, String> {
	let ViewSeen { wrapper, document, frame_origin } = view_seen(view)?;
	Ok(Reading {
		main_page: main_page_seen(main_window)?,
		view_wrapper: wrapper,
		view_document: document,
		view_frame_origin: frame_origin,
	})
}

#[derive(Serialize)]
struct RouteTried {
	route: &'static str,
	answer: String,
}

#[derive(Serialize)]
pub struct Line {
	line: usize,
	statement: &'static str,
	status: Status,
	reason: Option<String>,
	evidence: Value,
}

#[derive(Serialize)]
pub struct InputPlay {
	sent_by: &'static str,
	route: Option<&'static str>,
	routes_tried: Vec<RouteTried>,
	lines: Vec<Line>,
}

impl InputPlay {
	pub fn outcome(&self) -> Result<(), Unproven> {
		let Some(line) = self.lines.iter().find(|line| line.status != Status::Proven) else {
			return Ok(());
		};
		let reason = line.reason.as_deref().unwrap_or("the line records no reason");
		Err(Unproven { status: line.status, reason: format!("line {}: {reason}", line.line) })
	}

	pub fn not_played(reason: &str) -> Self {
		Self::without_a_line_proven(Status::NotProven, reason, None, Vec::new())
	}

	fn without_a_line_proven(
		status: Status,
		reason: &str,
		route: Option<&'static str>,
		routes_tried: Vec<RouteTried>,
	) -> Self {
		let lines = STATEMENTS
			.into_iter()
			.enumerate()
			.map(|(index, statement)| Line {
				line: index + 1,
				statement,
				status,
				reason: Some(reason.to_owned()),
				evidence: Value::Null,
			})
			.collect();
		Self { sent_by: SENT_BY, route, routes_tried, lines }
	}
}

const SENT_BY: &str = "a command the harness starts as a process of its own, which speaks to the display server: no event is dispatched by a script in a page and no GTK call of the harness sends input";

struct Stroke {
	sent: Result<Vec<String>, String>,
	before: Reading,
	after: Result<Reading, String>,
}

impl Stroke {
	fn judged(
		self,
		line: usize,
		aimed_at: Value,
		holds: impl Fn(&Reading, &Reading) -> bool,
	) -> Line {
		let is_proven =
			self.sent.is_ok() && self.after.as_ref().is_ok_and(|after| holds(&self.before, after));
		let reason = match (&self.sent, &self.after) {
			_ if is_proven => None,
			(Err(refusal), _) => Some(format!("the input could not be sent: {refusal}")),
			(_, Err(fault)) => {
				Some(format!("the pages could not be read after the input: {fault}"))
			}
			(Ok(_), Ok(_)) => Some(
				"the pages did not record what the line states: see before and after".to_owned(),
			),
		};
		Line {
			line,
			statement: STATEMENTS[line - 1],
			status: if is_proven { Status::Proven } else { Status::NotProven },
			reason,
			evidence: json!({
				"aimed_at": aimed_at,
				"commands": probe::evidence(&self.sent),
				"before": self.before,
				"after": probe::evidence(&self.after),
			}),
		}
	}
}

struct Player<'a> {
	main_window: &'a WebviewWindow,
	view: &'a Webview,
	route: &'a Route,
}

impl Player<'_> {
	fn stroke(&self, commands: Vec<Command>) -> Result<Stroke, String> {
		let before = read(self.main_window, self.view)?;
		let sent = sent(commands);
		Ok(Stroke { sent, before, after: read(self.main_window, self.view) })
	}

	fn click(&self, point: Point) -> Result<Stroke, String> {
		let [x, y] = [point.x, point.y].map(|length| (length.round() as i64).to_string());
		self.stroke((self.route.click)(&x, &y))
	}

	fn lines(&self, aim: &Aim) -> Result<Vec<Line>, String> {
		let rest = read(self.main_window, self.view)?;
		let field_of = |seen: &Seen, field: &str| {
			let field = seen.fields.get(field).ok_or(format!("the page holds no field {field}"))?;
			Ok::<_, String>(Point { x: field.x, y: field.y })
		};
		let in_the_frame = field_of(&rest.view_document, VIEW_FIELD)?;
		let view_point = aim.at_the_view(Point {
			x: rest.view_frame_origin.x + in_the_frame.x,
			y: rest.view_frame_origin.y + in_the_frame.y,
		});
		let main_point = aim.at_the_main_page(field_of(&rest.main_page, MAIN_FIELD)?);
		let aimed = |point: Point| {
			json!({
				"point_on_the_screen_in_pixels": point,
				"view_on_the_screen_in_pixels": aim.view_on_the_screen,
				"point_is_inside_the_rectangle_of_the_view": aim.is_in_the_view(point),
			})
		};
		let view_click = self.click(view_point)?.judged(1, aimed(view_point), |before, after| {
			aim.is_in_the_view(view_point)
				&& after.view_document.clicks.len() == before.view_document.clicks.len() + 1
				&& after.main_page.clicks == before.main_page.clicks
		});
		let view_typing = self.stroke((self.route.typing)(VIEW_TEXT))?.judged(
			2,
			json!({ "text": VIEW_TEXT }),
			|before, after| {
				after.view_document.holds(VIEW_FIELD, VIEW_TEXT)
					&& after.main_page.fields == before.main_page.fields
			},
		);
		let main_click = self.click(main_point)?.judged(3, aimed(main_point), |before, after| {
			!aim.is_in_the_view(main_point)
				&& after.main_page.clicks.len() == before.main_page.clicks.len() + 1
				&& after.clicks_in_the_view() == before.clicks_in_the_view()
		});
		let main_typing = self.stroke((self.route.typing)(MAIN_TEXT))?.judged(
			4,
			json!({ "text": MAIN_TEXT }),
			|before, after| {
				after.main_page.holds(MAIN_FIELD, MAIN_TEXT)
					&& after.keys_in_the_view() == before.keys_in_the_view()
			},
		);
		Ok(vec![view_click, view_typing, main_click, main_typing])
	}
}

pub fn play(main_window: &WebviewWindow, view: &Webview, aim: Result<Aim, String>) -> InputPlay {
	let mut routes_tried = Vec::new();
	let route = routes().iter().find(|route| {
		let answer = sent((route.answers)());
		let is_open = answer.is_ok();
		routes_tried.push(RouteTried {
			route: route.name,
			answer: answer.map_or_else(|refusal| refusal, |_| "answered".to_owned()),
		});
		is_open
	});
	let Some(route) = route else {
		return InputPlay::without_a_line_proven(Status::NotProvable, NO_ROUTE, None, routes_tried);
	};
	let lines = aim
		.map_err(|fault| format!("no capture gave the place of the view on the screen: {fault}"))
		.and_then(|aim| Player { main_window, view, route }.lines(&aim));
	match lines {
		Ok(lines) => InputPlay { sent_by: SENT_BY, route: Some(route.name), routes_tried, lines },
		Err(fault) => InputPlay::without_a_line_proven(
			Status::NotProven,
			&fault,
			Some(route.name),
			routes_tried,
		),
	}
}
