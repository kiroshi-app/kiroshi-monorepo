use std::error::Error;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Listener as _, WebviewWindow};

use crate::host::{HostState, Tick, ViewAddress};
use crate::probe::{self, HostReading};
use crate::proofs::{
	AttemptAlone, HostReadings, Observations, ViewObservation, WindowUrl, LAN_TRIPWIRE_ATTEMPTS,
	LOOPBACK_TRIPWIRE_ATTEMPTS, NAVIGATION_ATTEMPTS,
};
use crate::sensors::{non_loopback_ipv4, Targets, Tripwire, ViewServer, READER_ROLE, WRITER_ROLE};
use crate::windows::{open_main_window, open_view_window, FIRST_VIEW_LABEL, MAIN_WINDOW_LABEL};
use crate::Mode;

const HEARTBEAT_EVENT: &str = "spike-heartbeat";
const RUN_SIGNAL: &str = "run";
const BEAT_SCRIPT: &str = "window.__spikeBeat?.()";
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
const ATTRIBUTION_DEADLINE: Duration = Duration::from_secs(95);
const RUN_LIMIT: Duration = Duration::from_secs(115);
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

fn wait_until(timeout: Duration, is_reached: impl Fn() -> bool) -> bool {
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
		let run = Run { app, host, mode, sensors, main_window, started: Instant::now() };
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
	started: Instant,
}

struct OpenView {
	label: String,
	server: ViewServer,
	window: Option<WebviewWindow>,
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

		let first = self.open_view(FIRST_VIEW_LABEL, first_view, FIRST_VIEW_TIMEOUT, SETTLE)?;
		let first_reading = self.host_reading(&first);
		let writer = self.close_view(first)?;
		let main_url_after =
			self.main_window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string());
		let second = self.open_later_view("view-2", READER_ROLE, SECOND_VIEW_TIMEOUT, SETTLE)?;
		let (reader, second_reading) = match second {
			Some(second) => {
				let reading = self.host_reading(&second);
				(Some(self.close_view(second)?), reading)
			}
			None => (None, None),
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
				open: view.open,
				csp_reports: view.observation.record.csp_reports.clone(),
			})
			.collect();
		let observations = Observations {
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
		let mut results = json!({
			"ticket": "OPE-2298",
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
			"proofs": observations.proofs(),
			"attempts_not_played_alone": not_played_alone,
			"page_claims_never_used_alone_for_a_verdict": observations.page_claims(),
		});
		if cfg!(windows) {
			results["residual_exposure"] = json!(RESIDUAL_EXPOSURE);
		}
		let rendered = serde_json::to_string_pretty(&results)?;
		std::fs::write(
			format!("results-{}-{}.json", std::env::consts::OS, self.mode.name()),
			&rendered,
		)?;
		println!("{rendered}");
		Ok(())
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
			let decides_a_verdict = is_navigation && self.mode.decides_from_host_observations();
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
		let window = view.window.as_ref()?;
		let target = if self.mode.frames_view_documents() {
			probe::Target::FirstFrame
		} else {
			probe::Target::Document
		};
		self.mode.decides_from_host_observations().then(|| probe::read(window, target))
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
		let window = if self.mode.shows_views_in_windows() {
			Some(open_view_window(&self.app, &self.host, self.mode, label, url.parse()?)?)
		} else {
			self.main_window
				.eval(format!("window.__spikeOpenView({})", serde_json::to_string(&url)?))?;
			None
		};
		if !wait_until(timeout, || server.record().outcome(RUN_SIGNAL).is_some()) {
			eprintln!("{label} never signalled the end of its run");
		}
		thread::sleep(settle);
		Ok(OpenView {
			label: label.to_owned(),
			server,
			window,
			creation_began,
			settled_at: Instant::now(),
		})
	}

	fn close_view(&self, view: OpenView) -> Result<PlayedView, Failure> {
		let window_url_after = view.window.as_ref().map(|window| {
			window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string())
		});
		let reached = probe::reached_attempts(view.window.as_ref().unwrap_or(&self.main_window));
		match view.window {
			Some(window) => window.destroy()?,
			None => self.main_window.eval("window.__spikeCloseView()")?,
		}
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
			open: (view.creation_began, view.settled_at),
		})
	}
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
