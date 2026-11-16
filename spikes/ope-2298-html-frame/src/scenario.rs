use std::error::Error;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, OnceLock};
use std::thread;
use std::time::{Duration, Instant};

use serde_json::{json, Value};
use tauri::{AppHandle, Listener as _, Url, Webview, WebviewWindow};

use crate::behaviours::{self, Behaviour, Stage, ThreadPlay, NO_REPORT};
use crate::host::{HostState, Tick, ViewAddress};
use crate::placement::{PlacementReport, Seat, Seating, ThreadView, PLACEMENT_EVENT};
use crate::probe::{self, HostReading};
use crate::proofs::{
	AttemptAlone, HostReadings, Observations, Proof, ViewObservation, WindowUrl,
	LAN_TRIPWIRE_ATTEMPTS, LAN_TRIPWIRE_NAVIGATIONS, LOOPBACK_TRIPWIRE_ATTEMPTS,
	LOOPBACK_TRIPWIRE_NAVIGATIONS, NAVIGATION_ATTEMPTS,
};
use crate::sensors::{non_loopback_ipv4, Targets, Tripwire, ViewServer, READER_ROLE, WRITER_ROLE};
use crate::windows::{
	open_main_window, open_view_child, open_view_window, FIRST_VIEW_LABEL, MAIN_WINDOW_LABEL,
};
use crate::{run_name, Mode};

const HEARTBEAT_EVENT: &str = "spike-heartbeat";
const RUN_SIGNAL: &str = "run";
const BEAT_SCRIPT: &str = "window.__spikeBeat?.()";
const WAKE_SCRIPT: &str = "void 0";
const HEARTBEAT_INTERVAL: Duration = Duration::from_millis(100);
const POLL: Duration = Duration::from_millis(50);
const MAIN_WINDOW_TIMEOUT: Duration = Duration::from_secs(12);
const BASELINE: Duration = Duration::from_secs(2);
const FIRST_VIEW_TIMEOUT: Duration = Duration::from_secs(38);
const SECOND_VIEW_TIMEOUT: Duration = Duration::from_secs(6);
const RELOAD_TIMEOUT: Duration = Duration::from_secs(10);
const SETTLE: Duration = Duration::from_millis(1500);
const ALONE_TIMEOUT: Duration = Duration::from_millis(2500);
const ALONE_SETTLE: Duration = Duration::from_secs(3);
const ATTRIBUTION_DEADLINE: Duration = Duration::from_secs(150);
const RUN_LIMIT: Duration = Duration::from_secs(180);
const TICKET: &str = "OPE-2355";
#[cfg(target_os = "linux")]
const DISPLAY_SETUP_VARIABLE: &str = "SPIKE_DISPLAY_SETUP";
#[cfg(target_os = "linux")]
const PLACEHOLDER_TIMEOUT: Duration = Duration::from_secs(5);
const IN_THREAD_VERDICT: &str = "in-thread";
const SEPARATE_WINDOW_VERDICT: &str = "separate-window-only";
const DECISIONS: [&str; 4] = [
	"proof 4 is decided from the host reading of the second view, whose document never navigates; a host reading taken in a document whose URL is not the served URL is a sensor fault, never a green, in proof 4 and in proof 7",
	"proof 5 accepts a sink connection on Windows alone, when it carries zero bytes and was accepted while a view whose navigation to the sink the host saw blocked, by a handler or by a browser CSP report, was open; decided by Steve",
	"each navigation attempt aimed at a tripwire is played alone in a view of its own, in every run, since a blocked frame navigation can replace the document that would play the next one; proof 3 is red when one of them was not played",
	"the host evaluates a no-op in every view webview each 100 ms, as it does in the main window: behind a locked session or a display that is off, WebKit otherwise stalls the hostile script a few seconds after its busy loop",
];
const IN_THREAD_DECISIONS: [&str; 17] = [
	"the child webview is first placed from the rectangles the main page gives in its own viewport coordinates, with no correction, and the window is captured; where the view is drawn more than 1 px from its placeholder, every later placement adds the page origin read from that capture, the placeholder drawn minus the placeholder reported, rounded to the point; the five behaviours are played once per run, after that correction, and a second capture follows them",
	"the placeholder is painted rgb(0, 255, 255) and the view rgb(255, 0, 255), the placeholder captured with the view hidden, the view captured once shown again; a pixel counts for a paint when each of its leading channels exceeds the others by more than 100, since the display profile shifts the values a capture holds, and a box painted on less than 98 percent of its area is a fault; green was dropped because the zoom button of the title bar is green",
	"on macOS the capture is screencapture -l on the window number of the main window, without its shadow, not a region of the screen: other sessions of this machine show always-on-top windows at the same place, and a region capture took theirs; on Linux under X11 it is import -window root cropped to the window; under Wayland no capture is taken and the drawn position stays not proven",
	"on macOS the correction a product would apply is the safeAreaInsets.top of the main webview, which native_geometry records beside the origin read from the pixels; the harness places from the pixels so that the two agreeing is a measurement and not an assumption",
	"the child webview is hidden while a menu, a popover or a sheet overlaps the visible part of the placeholder, and shown again once none does, since a native webview draws above every element of the main page",
	"child_webview_bounds is read back from the webview after the host set it, through tauri::Webview::bounds on macOS and Windows and through the GTK allocation translated to the main webview on Linux, where tauri::Webview::bounds never reads a position; child_webview_visible is the visibility the host last asked for, since Tauri 2.12.2 has no visibility getter",
	"the delay runs from Date.now() in the main page handler that reported the placement to the host clock once the bounds were read back",
	"cutting the view to the column only shrinks the child webview: its document keeps its own origin and is not shifted by the hidden part",
	"enlarged means the placeholder takes the height of the visible column",
	"the five behaviours are played on the second view, once its document has settled, and only when the main webview bounds read back fill the window content, after at most one refit of the main webview to that size; the window content is the inner size of the window, and on Linux the allocation of the default vbox, since tao counts the client-side decorations in the inner size under Wayland",
	"the capability names the webview main where it named the window main, so a child webview of the main window receives none",
	"on Linux every placement is tried on a blank child webview before the first view, each asked for the rectangle of the placeholder; a placement holds when the GTK allocations give the main webview the whole window content and the view its rectangle within 1 px",
	"on Linux each view is mounted by tauri::Window::add_child, then its widget is moved by GTK calls into the first placement that held on a webview Tauri manages, the GtkFixed tried before the overlay margins; the two placements of wry alone are measured on a blank webview outside the Tauri runtime, where no guard, no capability and no proof applies",
	"on Linux the input a view and the main page receive through the GtkOverlay was not exercised: the GtkFixed is set pass-through, no click was sent",
	"gtk and wry on Linux, objc2 and objc2-foundation on macOS are direct dependencies of the harness at the versions the lock already held: no package entered the lock",
	"results-linux-in-thread.json is the Xvfb alone setup, the setup of the OPE-2346 file of that name; every other display setup carries its name in the file name",
	"the OPE-2355 workflow plays the in-thread mode alone, on macOS and on Linux: the Windows job and the window-sandboxed mode are left out, and no Windows result is touched",
];
const RESIDUAL_EXPOSURE: &str = "no mitigation is applied: Chromium 156, which WebView2 embeds, opens one socket to the target of every http or https navigation when the navigation request is created, before the CSP check and before a host handler is asked. The only gate is the embedder hook ShouldPreconnectNavigation: there is no command line switch, no WebView2 setting and no Tauri 2.12.2 builder option for it, so a view can still make the webview open a connection without request bytes to any host and port it names";
const HARNESS_FAILURE: i32 = 1;

type Failure = Box<dyn Error>;

struct Sensors {
	loopback: Tripwire,
	lan: Result<Tripwire, String>,
	navigation_sink: Tripwire,
}

impl Sensors {
	fn open() -> Result<Self, Failure> {
		let loopback = Tripwire::open(IpAddr::V4(Ipv4Addr::LOCALHOST))?;
		let lan = non_loopback_ipv4()
			.and_then(|address| Tripwire::open(IpAddr::V4(address)))
			.map_err(|cause| cause.to_string());
		let navigation_sink = Tripwire::open(IpAddr::V4(Ipv4Addr::LOCALHOST))?;
		Ok(Self { loopback, lan, navigation_sink })
	}

	fn targets(&self, role: &'static str) -> Targets {
		Targets {
			role,
			loopback_tripwire: self.loopback.address().to_string(),
			lan_tripwire: self.lan.as_ref().ok().map(|tripwire| tripwire.address().to_string()),
			navigation_sink: format!("http://{}", self.navigation_sink.address()),
		}
	}
}

fn window_url(view: &ViewServer, mode: Mode) -> String {
	if mode.frames_view_documents() {
		view.framed_url()
	} else {
		view.url()
	}
}

fn point_at(host: &HostState, view: &ViewServer, mode: Mode) {
	let urls = if mode.frames_view_documents() {
		vec![view.framed_url(), view.url()]
	} else {
		vec![view.url()]
	};
	host.point_at_view(ViewAddress { origin: view.origin(), urls });
}

fn keep_awake(webview: Webview, is_closed: Arc<AtomicBool>) {
	thread::spawn(move || loop {
		thread::sleep(HEARTBEAT_INTERVAL);
		if is_closed.load(Ordering::SeqCst) {
			return;
		}
		if let Err(cause) = webview.eval(WAKE_SCRIPT) {
			return eprintln!("{} is no longer kept awake: {cause}", webview.label());
		}
	});
}

pub fn wait_until(timeout: Duration, is_reached: impl Fn() -> bool) -> bool {
	let deadline = Instant::now() + timeout;
	while Instant::now() < deadline {
		if is_reached() {
			return true;
		}
		thread::sleep(POLL);
	}
	is_reached()
}

pub fn start(app: AppHandle, host: Arc<HostState>, mode: Mode) -> Result<(), Failure> {
	let sensors = Sensors::open()?;
	let first_view = ViewServer::open(&sensors.targets(WRITER_ROLE), mode.view_csp_directives())?;
	point_at(&host, &first_view, mode);
	let main_window = open_main_window(&app, &host)?;
	let heartbeat_host = Arc::clone(&host);
	app.listen(HEARTBEAT_EVENT, move |event| match serde_json::from_str::<Tick>(event.payload()) {
		Ok(tick) => heartbeat_host.record_tick(tick),
		Err(cause) => eprintln!("unreadable heartbeat: {cause}"),
	});
	let thread_view = Arc::new(ThreadView::default());
	if mode.places_views_in_the_thread() {
		let followed = Arc::clone(&thread_view);
		app.listen(PLACEMENT_EVENT, move |event| {
			match serde_json::from_str::<PlacementReport>(event.payload()) {
				Ok(report) => followed.follow(report),
				Err(cause) => eprintln!("unreadable placement: {cause}"),
			}
		});
	}
	let paced_window = main_window.clone();
	thread::spawn(move || loop {
		thread::sleep(HEARTBEAT_INTERVAL);
		if let Err(cause) = paced_window.eval(BEAT_SCRIPT) {
			return eprintln!("the heartbeat stopped: {cause}");
		}
	});
	thread::spawn(|| {
		thread::sleep(RUN_LIMIT);
		eprintln!("the harness overran {} seconds without a result", RUN_LIMIT.as_secs());
		std::process::exit(HARNESS_FAILURE);
	});
	thread::spawn(move || {
		let run = Run {
			app,
			host,
			mode,
			sensors,
			main_window,
			thread_view,
			seating: OnceLock::new(),
			started: Instant::now(),
		};
		match run.play(first_view) {
			Ok(()) => std::process::exit(0),
			Err(cause) => {
				eprintln!("the harness failed: {cause}");
				std::process::exit(HARNESS_FAILURE);
			}
		}
	});
	Ok(())
}

struct Run {
	app: AppHandle,
	host: Arc<HostState>,
	mode: Mode,
	sensors: Sensors,
	main_window: WebviewWindow,
	thread_view: Arc<ThreadView>,
	seating: OnceLock<Seating>,
	started: Instant,
}

enum Shown {
	Frame,
	Window(Webview),
	Child(Seat),
	Nowhere(String),
}

impl Shown {
	fn webview(&self) -> Option<&Webview> {
		match self {
			Self::Window(webview) => Some(webview),
			Self::Child(seat) => Some(seat.webview()),
			Self::Frame | Self::Nowhere(_) => None,
		}
	}
}

struct OpenView {
	label: String,
	server: ViewServer,
	shown: Shown,
	is_closed: Arc<AtomicBool>,
	creation_began: Instant,
	settled_at: Instant,
}

struct AloneReplays {
	played: Vec<(&'static str, PlayedView)>,
	not_played: Vec<&'static str>,
}

struct PlayedView {
	label: String,
	observation: ViewObservation,
	url: String,
	csp: String,
	window_url_after: Option<Result<String, String>>,
	creation_error: Option<String>,
	open: (Instant, Instant),
}

impl Run {
	fn play(&self, first_view: ViewServer) -> Result<(), Failure> {
		let is_main_window_live =
			|| !self.host.heartbeat().arrivals.is_empty() && !self.host.secret_calls().is_empty();
		if !wait_until(MAIN_WINDOW_TIMEOUT, is_main_window_live) {
			return Err("the main window sent no heartbeat and no control call".into());
		}
		let baseline_started = self
			.host
			.heartbeat()
			.arrivals
			.first()
			.copied()
			.ok_or("the first heartbeat is missing")?;
		thread::sleep(BASELINE);
		let baseline = (baseline_started, Instant::now());
		let main_url_before = self.main_window.url()?.to_string();
		let placements = self.mode.places_views_in_the_thread().then(|| self.placements());

		let first = self.open_view(FIRST_VIEW_LABEL, first_view, FIRST_VIEW_TIMEOUT, SETTLE)?;
		let first_reading = self.host_reading(&first);
		let writer = self.close_view(first)?;
		let main_url_after =
			self.main_window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string());
		let second = self.open_later_view("view-2", READER_ROLE, SECOND_VIEW_TIMEOUT, SETTLE)?;
		let (reader, second_reading, thread) = match second {
			Some(second) => {
				let reading = self.host_reading(&second);
				let thread = self.thread_play(&second);
				(Some(self.close_view(second)?), reading, thread)
			}
			None => (None, None, None),
		};
		let AloneReplays { played: alone, not_played: not_played_alone } =
			self.play_attempts_alone()?;

		let mut window_urls = vec![WindowUrl {
			window: MAIN_WINDOW_LABEL.to_owned(),
			before_the_view: main_url_before,
			after_the_view: main_url_after,
		}];
		let windowed = std::iter::once(&writer).chain(alone.iter().map(|(_, view)| view));
		window_urls.extend(windowed.filter_map(|view| {
			Some(WindowUrl {
				window: view.label.clone(),
				before_the_view: view.url.clone(),
				after_the_view: view.window_url_after.clone()?,
			})
		}));
		let views = json!({
			"first_view": view_summary(&writer),
			"second_view": reader.as_ref().map(view_summary),
		});
		let host_readings = first_reading
			.map(|first_view| HostReadings { first_view, second_view: second_reading });
		let attempts_alone = alone
			.iter()
			.map(|(attempt, view)| AttemptAlone {
				attempt,
				window: view.label.clone(),
				page_signal: view.observation.record.outcome(attempt).map(str::to_owned),
				open: view.open,
				csp_reports: view.observation.record.csp_reports.clone(),
			})
			.collect();
		let child_webview_errors: Vec<_> = std::iter::once(&writer)
			.chain(&reader)
			.chain(alone.iter().map(|(_, view)| view))
			.filter_map(|view| {
				let error = view.creation_error.as_ref()?;
				Some(json!({ "view": view.label, "error": error }))
			})
			.collect();
		let observations = Observations {
			platform: std::env::consts::OS,
			secret_calls: self.host.secret_calls(),
			heartbeat: self.host.heartbeat(),
			baseline,
			loopback_tripwire: self.sensors.loopback.reading(),
			lan_tripwire: self.sensors.lan.as_ref().map(Tripwire::reading).map_err(Clone::clone),
			navigation_sink: self.sensors.navigation_sink.reading(),
			handler_events: self.host.handler_events(),
			window_urls,
			first_view_open: writer.open,
			writer: writer.observation,
			reader: reader.map(|view| view.observation),
			host_readings,
			attempts_alone,
		};
		let proofs = observations.proofs();
		let mut results = json!({
			"ticket": TICKET,
			"run": {
				"name": run_name(),
				"github_run_id": std::env::var("GITHUB_RUN_ID").ok(),
			},
			"os": std::env::consts::OS,
			"mode": self.mode.name(),
			"tauri": tauri::VERSION,
			"webview": match tauri::webview_version() {
				Ok(version) => version,
				Err(cause) => format!("unavailable: {cause}"),
			},
			"duration_ms": self.started.elapsed().as_millis(),
			"mitigations": self.mode.mitigations(),
			"main_window_csp_served": self.host.main_window_csps(),
			"views": views,
			"decisions": self.decisions(),
			"attempts_not_played_alone": not_played_alone,
			"page_claims_never_used_alone_for_a_verdict": observations.page_claims(),
		});
		if let Some(placements) = placements {
			for (finding, evidence) in placements {
				results[finding] = evidence;
			}
		}
		if let Some(thread) = thread {
			let drawn_over_its_placeholder = thread.is_drawn_over_its_placeholder();
			let ThreadPlay { mount, native_geometry, sightings, behaviours } = thread;
			let is_shown_in_the_thread = child_webview_errors.is_empty()
				&& proofs.iter().all(Proof::is_green)
				&& behaviours.iter().all(Behaviour::is_green)
				&& drawn_over_its_placeholder != Some(false);
			results["verdict"] = json!(if is_shown_in_the_thread {
				IN_THREAD_VERDICT
			} else {
				SEPARATE_WINDOW_VERDICT
			});
			results["child_webview_mount"] = probe::evidence(&mount);
			results["native_geometry"] = native_geometry;
			results["view_drawn_over_its_placeholder"] = match drawn_over_its_placeholder {
				Some(is_over) => json!(is_over),
				None => json!("not proven: no capture of the window could be read"),
			};
			results["sightings"] = sightings.iter().map(probe::evidence).collect();
			results["behaviours"] = json!(behaviours);
			results["child_webview_errors"] = json!(child_webview_errors);
		}
		results["proofs"] = json!(proofs);
		if cfg!(windows) {
			results["residual_exposure"] = json!(RESIDUAL_EXPOSURE);
		}
		let rendered = serde_json::to_string_pretty(&results)?;
		std::fs::write(format!("results-{}-{}.json", run_name(), self.mode.name()), &rendered)?;
		println!("{rendered}");
		Ok(())
	}

	fn decisions(&self) -> Vec<&'static str> {
		let in_thread: &[&str] =
			if self.mode.places_views_in_the_thread() { &IN_THREAD_DECISIONS } else { &[] };
		DECISIONS.iter().chain(in_thread).copied().collect()
	}

	#[cfg(target_os = "linux")]
	fn placements(&self) -> Vec<(&'static str, Value)> {
		use crate::trials::{self, Tried};
		let rest = || self.thread_view.latest_report();
		if !wait_until(PLACEHOLDER_TIMEOUT, || rest().is_some()) {
			return vec![(
				"placement_verdict",
				json!({ "verdict": NOT_POSSIBLE, "reason": NO_REPORT }),
			)];
		}
		let Some(asked) = rest().and_then(|report| report.target()) else {
			return vec![(
				"placement_verdict",
				json!({ "verdict": NOT_POSSIBLE, "reason": NO_REPORT }),
			)];
		};
		let Tried { cause, trials, holder } = trials::run(&self.main_window, asked);
		let held: Vec<_> =
			trials.iter().filter(|trial| trial.holds()).map(|trial| trial.name()).collect();
		let verdict = match holder {
			Some(holder) => {
				if self.seating.set(Seating::Layer(holder)).is_err() {
					eprintln!("the seating of the views was already decided");
				}
				json!({
					"verdict": "possible in the thread",
					"placement_the_views_are_mounted_with": holder,
					"placements_that_hold": held,
				})
			}
			None => json!({
				"verdict": NOT_POSSIBLE,
				"reason": "no placement of a webview Tauri manages gave the main webview the full window and the view its rectangle within 1 px",
				"placements_that_hold": held,
			}),
		};
		vec![
			("display_setup", display_setup()),
			("halved_views_cause", json!(cause)),
			("placements_tried", json!(trials)),
			("placement_verdict", verdict),
		]
	}

	#[cfg(not(target_os = "linux"))]
	fn placements(&self) -> Vec<(&'static str, Value)> {
		Vec::new()
	}

	fn thread_play(&self, view: &OpenView) -> Option<ThreadPlay> {
		match &view.shown {
			Shown::Child(seat) => {
				let stage =
					Stage { main_window: &self.main_window, thread_view: &self.thread_view, seat };
				Some(stage.play(|| view.server.record().document_requests))
			}
			Shown::Nowhere(cause) => Some(ThreadPlay {
				mount: Err(cause.clone()),
				native_geometry: Value::Null,
				sightings: Vec::new(),
				behaviours: behaviours::not_played(cause),
			}),
			Shown::Frame | Shown::Window(_) => None,
		}
	}

	fn open_child(&self, label: &str, url: Url) -> Shown {
		let opened = self.thread_view.latest_report().ok_or_else(|| NO_REPORT.to_owned()).and_then(
			|report| {
				open_view_child(
					&self.main_window,
					&self.host,
					self.mode,
					label,
					url,
					report.placeholder,
				)
				.map_err(|cause| cause.to_string())
			},
		);
		let seating = self.seating.get().copied().unwrap_or_default();
		match opened.and_then(|child| Seat::take(child, seating)) {
			Ok(seat) => {
				self.thread_view.attach(seat.clone());
				Shown::Child(seat)
			}
			Err(cause) => Shown::Nowhere(cause),
		}
	}

	fn open_later_view(
		&self,
		label: &str,
		role: &'static str,
		timeout: Duration,
		settle: Duration,
	) -> Result<Option<OpenView>, Failure> {
		let server =
			ViewServer::open(&self.sensors.targets(role), self.mode.view_csp_directives())?;
		point_at(&self.host, &server, self.mode);
		if self.mode == Mode::Frame && !self.reload_main_window()? {
			eprintln!("the main window did not come back after its reload, {label} stays closed");
			return Ok(None);
		}
		self.open_view(label, server, timeout, settle).map(Some)
	}

	fn attempts_to_play_alone(&self) -> Vec<&'static str> {
		let has_a_connection_without_a_request = |listener: &Tripwire| {
			listener
				.reading()
				.view_connections()
				.iter()
				.any(|connection| connection.target.is_none())
		};
		let mut attempts = Vec::new();
		if self.mode.decides_from_host_observations()
			|| has_a_connection_without_a_request(&self.sensors.navigation_sink)
		{
			attempts.extend(NAVIGATION_ATTEMPTS);
		}
		attempts.extend(LOOPBACK_TRIPWIRE_NAVIGATIONS);
		if self.sensors.lan.is_ok() {
			attempts.extend(LAN_TRIPWIRE_NAVIGATIONS);
		}
		if has_a_connection_without_a_request(&self.sensors.loopback) {
			attempts.extend(LOOPBACK_TRIPWIRE_ATTEMPTS);
		}
		if self.sensors.lan.as_ref().is_ok_and(has_a_connection_without_a_request) {
			attempts.extend(LAN_TRIPWIRE_ATTEMPTS);
		}
		attempts
	}

	fn play_attempts_alone(&self) -> Result<AloneReplays, Failure> {
		let mut played = Vec::new();
		let mut not_played = Vec::new();
		for attempt in self.attempts_to_play_alone() {
			let is_navigation = NAVIGATION_ATTEMPTS.contains(&attempt);
			let decides_a_verdict = if is_navigation {
				self.mode.decides_from_host_observations()
			} else {
				LOOPBACK_TRIPWIRE_NAVIGATIONS.contains(&attempt)
					|| LAN_TRIPWIRE_NAVIGATIONS.contains(&attempt)
			};
			if !decides_a_verdict && self.started.elapsed() > ATTRIBUTION_DEADLINE {
				not_played.push(attempt);
				continue;
			}
			let settle = if is_navigation { ALONE_SETTLE } else { SETTLE };
			match self.open_later_view(
				&format!("alone-{attempt}"),
				attempt,
				ALONE_TIMEOUT,
				settle,
			)? {
				Some(view) => played.push((attempt, self.close_view(view)?)),
				None => not_played.push(attempt),
			}
		}
		if played.last().is_some_and(|(attempt, _)| !NAVIGATION_ATTEMPTS.contains(attempt)) {
			thread::sleep(ALONE_SETTLE.saturating_sub(SETTLE));
		}
		Ok(AloneReplays { played, not_played })
	}

	fn reload_main_window(&self) -> Result<bool, Failure> {
		let documents = self.host.heartbeat().instances.len();
		let control_calls = self.host.secret_calls().len();
		self.main_window.eval("location.reload()")?;
		Ok(wait_until(RELOAD_TIMEOUT, || {
			self.host.heartbeat().instances.len() > documents
				&& self.host.secret_calls().len() > control_calls
		}))
	}

	fn host_reading(&self, view: &OpenView) -> Option<HostReading> {
		if !self.mode.decides_from_host_observations() {
			return None;
		}
		let target = if self.mode.frames_view_documents() {
			probe::Target::FirstFrame
		} else {
			probe::Target::Document
		};
		match &view.shown {
			Shown::Nowhere(cause) => Some(Err(cause.clone())),
			shown => Some(probe::read(shown.webview()?, target, &view.server.url())),
		}
	}

	fn open_view(
		&self,
		label: &str,
		server: ViewServer,
		timeout: Duration,
		settle: Duration,
	) -> Result<OpenView, Failure> {
		let url = window_url(&server, self.mode);
		self.host.mark_view_open(true);
		let creation_began = Instant::now();
		let shown = if self.mode.places_views_in_the_thread() {
			self.open_child(label, url.parse()?)
		} else if self.mode.shows_views_in_windows() {
			let window = open_view_window(&self.app, &self.host, self.mode, label, url.parse()?)?;
			let webview: &Webview = window.as_ref();
			Shown::Window(webview.clone())
		} else {
			self.main_window
				.eval(format!("window.__spikeOpenView({})", serde_json::to_string(&url)?))?;
			Shown::Frame
		};
		let is_closed = Arc::new(AtomicBool::new(false));
		if let Some(webview) = shown.webview() {
			keep_awake(webview.clone(), Arc::clone(&is_closed));
		}
		if let Shown::Nowhere(cause) = &shown {
			eprintln!("{label} was shown nowhere: {cause}");
		} else {
			if !wait_until(timeout, || server.record().outcome(RUN_SIGNAL).is_some()) {
				eprintln!("{label} never signalled the end of its run");
			}
			thread::sleep(settle);
		}
		Ok(OpenView {
			label: label.to_owned(),
			server,
			shown,
			is_closed,
			creation_began,
			settled_at: Instant::now(),
		})
	}

	fn close_view(&self, view: OpenView) -> Result<PlayedView, Failure> {
		let window_url_after = view.shown.webview().map(|webview| {
			webview.url().map(|url| url.to_string()).map_err(|cause| cause.to_string())
		});
		let reached = match &view.shown {
			Shown::Nowhere(cause) => Err(cause.clone()),
			shown => probe::reached_attempts(shown.webview().unwrap_or(self.main_window.as_ref())),
		};
		view.is_closed.store(true, Ordering::SeqCst);
		let creation_error = match view.shown {
			Shown::Frame => {
				self.main_window.eval("window.__spikeCloseView()")?;
				None
			}
			Shown::Window(webview) => {
				webview.window().destroy()?;
				None
			}
			Shown::Child(seat) => {
				self.thread_view.detach();
				seat.webview().close()?;
				None
			}
			Shown::Nowhere(cause) => Some(cause),
		};
		self.host.mark_view_open(false);
		Ok(PlayedView {
			label: view.label,
			observation: ViewObservation {
				token: view.server.token().to_owned(),
				record: view.server.record(),
				reached,
			},
			url: window_url(&view.server, self.mode),
			csp: view.server.csp().to_owned(),
			window_url_after,
			creation_error,
			open: (view.creation_began, view.settled_at),
		})
	}
}

#[cfg(target_os = "linux")]
const NOT_POSSIBLE: &str = "not possible in the thread";
#[cfg(target_os = "linux")]
const NO_DESKTOP_SESSION: &str = "not proven: this run has no desktop session, XDG_SESSION_ID and XDG_CURRENT_DESKTOP are not both set; OPE-2355 reached Linux only through Docker linux/arm64 on a macOS host and through the GitHub-hosted ubuntu-latest runner, each under Xvfb alone, Xvfb with the openbox window manager and the headless backend of the weston Wayland compositor: no login session, no GPU compositor, no physical output";

#[cfg(target_os = "linux")]
fn display_setup() -> Value {
	let is_set = |variable| std::env::var_os(variable).is_some();
	let has_a_desktop_session = is_set("XDG_SESSION_ID") && is_set("XDG_CURRENT_DESKTOP");
	json!({
		"real_desktop_session": if has_a_desktop_session {
			json!("XDG_SESSION_ID and XDG_CURRENT_DESKTOP are set: this run has a desktop session")
		} else {
			json!(NO_DESKTOP_SESSION)
		},
		"name": std::env::var(DISPLAY_SETUP_VARIABLE).unwrap_or_else(|_| "unnamed".to_owned()),
		"x_display_set": is_set("DISPLAY"),
		"wayland_display_set": is_set("WAYLAND_DISPLAY"),
		"gdk_backend_asked": std::env::var("GDK_BACKEND").ok(),
		"session_type": std::env::var("XDG_SESSION_TYPE").ok(),
	})
}

fn view_summary(view: &PlayedView) -> serde_json::Value {
	json!({
		"url": view.url,
		"response_csp": view.csp,
		"document_requests": view.observation.record.document_requests,
		"requests_outside_the_routes": view.observation.record.unrouted_requests,
		"attempts_the_page_script_reached_read_by_the_host": probe::evidence(&view.observation.reached),
	})
}
