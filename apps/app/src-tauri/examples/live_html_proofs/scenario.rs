use std::error::Error;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use kiroshi_app::live_html::contract::LiveHtmlRectangle;
use kiroshi_app::live_html::server::{CONTENT_DOCUMENT, WRAPPER_DOCUMENT};
use kiroshi_app::live_html::watch::ViewWatch;
use kiroshi_app::live_html::LiveViews;
use serde_json::json;
use tauri::async_runtime::block_on;
use tauri::{AppHandle, Listener as _, WebviewWindow};

use crate::host::{HostState, MainScroll, Tick};
use crate::probe::{self, HostReading, MountedView};
use crate::proofs::{
	AttemptAlone, GridObservation, HostReadings, Observations, RescaledFrames, ScrolledGesture,
	ViewObservation, WindowUrl, LAN_TRIPWIRE_ATTEMPTS, LAN_TRIPWIRE_NAVIGATIONS,
	LOOPBACK_TRIPWIRE_ATTEMPTS, LOOPBACK_TRIPWIRE_NAVIGATIONS, NAVIGATION_ATTEMPTS,
	SCALES_FORCED_IN_TURN,
};
use crate::sensors::{
	drawn_frames, force_backing_scale, non_loopback_ipv4, send_scroll, Pointer, ScrollDevice,
	ScrollStep, Targets, Tripwire, ViewRecord, READER_ROLE, WRITER_ROLE,
};

pub const FIRST_VIEW_LABEL: &str = "view-1";
const MAIN_WINDOW_LABEL: &str = "main";
const HOSTILE_HTML: &str = include_str!("hostile.html");
const TARGETS_PLACEHOLDER: &str = "\"__TARGETS__\"";
const SLOT: LiveHtmlRectangle = LiveHtmlRectangle { x: 29.0, y: 57.0, width: 520.0, height: 360.0 };
const FRACTIONAL_SLOT: LiveHtmlRectangle =
	LiveHtmlRectangle { x: 29.3, y: 57.296875, width: 520.203125, height: 360.4 };
const FRACTIONAL_CLIP: LiveHtmlRectangle =
	LiveHtmlRectangle { x: 0.0, y: 112.8, width: 700.5, height: 240.25 };
const HEARTBEAT_EVENT: &str = "spike-heartbeat";
const MAIN_SCROLL_EVENT: &str = "spike-main-scroll";
const SCROLL_TO_THE_TOP_SCRIPT: &str = "scrollTo(0, 0)";
const SCROLL_STEP_INTERVAL: Duration = Duration::from_millis(16);
const SCROLL_SETTLE: Duration = Duration::from_millis(800);
const SCROLL_READING_TIMEOUT: Duration = Duration::from_secs(2);
const WHEEL_NOTCHES: [ScrollStep; 3] = [ScrollStep::notch(-3); 3];
const TRACKPAD_SWIPE: [ScrollStep; 12] = [
	ScrollStep::began(-8),
	ScrollStep::changed(-16),
	ScrollStep::changed(-16),
	ScrollStep::changed(-16),
	ScrollStep::changed(-16),
	ScrollStep::ended(),
	ScrollStep::momentum_began(-12),
	ScrollStep::momentum(-8),
	ScrollStep::momentum(-6),
	ScrollStep::momentum(-4),
	ScrollStep::momentum(-2),
	ScrollStep::momentum_ended(),
];
const RUN_SIGNAL: &str = "run";
const BEAT_SCRIPT: &str = "window.__spikeBeat?.()";
const WAKE_SCRIPT: &str = "void 0";
const HEARTBEAT_INTERVAL: Duration = Duration::from_millis(100);
const POLL: Duration = Duration::from_millis(50);
const MAIN_WINDOW_TIMEOUT: Duration = Duration::from_secs(12);
const BASELINE: Duration = Duration::from_secs(2);
const FIRST_VIEW_TIMEOUT: Duration = Duration::from_secs(38);
const SECOND_VIEW_TIMEOUT: Duration = Duration::from_secs(6);
const SETTLE: Duration = Duration::from_millis(1500);
const ALONE_TIMEOUT: Duration = Duration::from_millis(2500);
const ALONE_SETTLE: Duration = Duration::from_secs(3);
const RUN_LIMIT: Duration = Duration::from_secs(240);
const PROOFS: usize = 10;
const HARNESS_FAILURE: i32 = 1;
const RED_PROOFS: i32 = 3;
const DECISIONS: [&str; 6] = [
	"every view is mounted, placed and removed by kiroshi_app::live_html::LiveViews, the code the live_html commands run, with the hostile.html of OPE-2298 as its HTML content",
	"the harness watch of the views records the requests the product server receives and the answers of the product guards, and injects the host probe of the spike in every frame of the view",
	"the main window is the main window of tauri.conf.json, loaded from its devUrl, which the harness serves, so the product capabilities apply to it as in the dev build; each view is a wry webview of its own inside the main window, with no Tauri IPC",
	"the proofs are decided from host observations, as the in-thread mode of OPE-2355 decided them",
	"the five placement behaviours and the drawn position are not played here; they are read from a capture of the dev build",
	"the first view is placed at a fractional rectangle under a fractional clip, and its drawn frames and layer scales are read from the native views of the main window",
];

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

fn keep_awake(views: Arc<LiveViews>, app: AppHandle, id: String, is_closed: Arc<AtomicBool>) {
	thread::spawn(move || loop {
		thread::sleep(HEARTBEAT_INTERVAL);
		if is_closed.load(Ordering::SeqCst) {
			return;
		}
		let view = MountedView { views: &views, app: &app, id: &id };
		if let Err(cause) = view.evaluate(WAKE_SCRIPT) {
			return eprintln!("{id} is no longer kept awake: {cause}");
		}
	});
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

pub fn start(
	app: AppHandle,
	host: Arc<HostState>,
	main_window: WebviewWindow,
) -> Result<(), Failure> {
	let sensors = Sensors::open()?;
	let heartbeat_host = Arc::clone(&host);
	app.listen(HEARTBEAT_EVENT, move |event| match serde_json::from_str::<Tick>(event.payload()) {
		Ok(tick) => heartbeat_host.record_tick(tick),
		Err(cause) => eprintln!("unreadable heartbeat: {cause}"),
	});
	let scroll_host = Arc::clone(&host);
	app.listen(MAIN_SCROLL_EVENT, move |event| {
		match serde_json::from_str::<MainScroll>(event.payload()) {
			Ok(scroll) => scroll_host.record_main_scroll(scroll),
			Err(cause) => eprintln!("unreadable main scroll: {cause}"),
		}
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
	let watch: Arc<dyn ViewWatch> = host.clone();
	thread::spawn(move || {
		let run = Run {
			app,
			host,
			views: Arc::new(LiveViews::watched(watch)),
			sensors,
			main_window,
			started: Instant::now(),
			scroll_readings: AtomicU64::new(0),
		};
		match run.play() {
			Ok(green) if green == PROOFS => std::process::exit(0),
			Ok(_) => std::process::exit(RED_PROOFS),
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
	views: Arc<LiveViews>,
	sensors: Sensors,
	main_window: WebviewWindow,
	started: Instant,
	scroll_readings: AtomicU64,
}

struct Mounted {
	token: String,
	wrapper_url: String,
	mount_returned: Instant,
}

struct OpenView {
	label: String,
	mounted: Result<Mounted, String>,
	is_closed: Arc<AtomicBool>,
	creation_began: Instant,
	settled_at: Instant,
}

impl OpenView {
	fn record(&self, host: &HostState) -> ViewRecord {
		match &self.mounted {
			Ok(mounted) => host.view_record(&self.label, &mounted.token),
			Err(_) => ViewRecord::default(),
		}
	}
}

struct NativeScaleRestored<'a> {
	main_window: &'a WebviewWindow,
	native_scale: f64,
}

impl Drop for NativeScaleRestored<'_> {
	fn drop(&mut self) {
		if let Err(cause) = force_backing_scale(self.main_window, self.native_scale) {
			eprintln!("the native backing scale {} was not restored: {cause}", self.native_scale);
		}
	}
}

struct PlayedView {
	label: String,
	observation: ViewObservation,
	url: String,
	window_url_after: Option<Result<String, String>>,
	creation_error: Option<String>,
	open: (Instant, Instant),
	mount_returned: Option<Instant>,
}

impl Run {
	fn play(&self) -> Result<usize, Failure> {
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

		let first = self.open_view(FIRST_VIEW_LABEL, WRITER_ROLE, FIRST_VIEW_TIMEOUT, SETTLE)?;
		let first_reading = self.host_reading(&first);
		let scrolled = self.scrolled_gestures(&first);
		let grid = self.grid_observation(&first);
		let writer = self.close_view(first)?;
		let main_url_after =
			self.main_window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string());
		let second = self.open_view("view-2", READER_ROLE, SECOND_VIEW_TIMEOUT, SETTLE)?;
		let second_reading = self.host_reading(&second);
		let reader = self.close_view(second)?;
		let alone = self.play_attempts_alone()?;

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
			"second_view": view_summary(&reader),
		});
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
		let mount_errors: Vec<_> = std::iter::once(&writer)
			.chain(std::iter::once(&reader))
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
			first_view_mounted: writer.mount_returned,
			writer: writer.observation,
			reader: Some(reader.observation),
			host_readings: Some(HostReadings {
				first_view: first_reading,
				second_view: Some(second_reading),
			}),
			attempts_alone,
			grid,
			scrolled,
		};
		let proofs = observations.proofs();
		let green = proofs.iter().filter(|proof| proof.is_green()).count();
		let results = json!({
			"run": {
				"name": std::env::var("LIVE_HTML_RUN_NAME").unwrap_or_else(|_| std::env::consts::OS.to_owned()),
				"github_run_id": std::env::var("GITHUB_RUN_ID").ok(),
			},
			"os": std::env::consts::OS,
			"tauri": tauri::VERSION,
			"webview": match tauri::webview_version() {
				Ok(version) => version,
				Err(cause) => format!("unavailable: {cause}"),
			},
			"duration_ms": self.started.elapsed().as_millis(),
			"decisions": DECISIONS,
			"views": views,
			"mount_errors": mount_errors,
			"page_claims_never_used_alone_for_a_verdict": observations.page_claims(),
			"proofs": proofs,
			"score": format!("{green} of {PROOFS}"),
		});
		let rendered = serde_json::to_string_pretty(&results)?;
		if let Ok(path) = std::env::var("LIVE_HTML_RESULTS") {
			std::fs::write(path, &rendered)?;
		}
		println!("{rendered}");
		println!("proofs: {green} of {PROOFS}");
		Ok(green)
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
		attempts.extend(NAVIGATION_ATTEMPTS);
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

	fn play_attempts_alone(&self) -> Result<Vec<(&'static str, PlayedView)>, Failure> {
		let mut played = Vec::new();
		for attempt in self.attempts_to_play_alone() {
			let settle = if NAVIGATION_ATTEMPTS.contains(&attempt) { ALONE_SETTLE } else { SETTLE };
			let view =
				self.open_view(&format!("alone-{attempt}"), attempt, ALONE_TIMEOUT, settle)?;
			played.push((attempt, self.close_view(view)?));
		}
		if played.last().is_some_and(|(attempt, _)| !NAVIGATION_ATTEMPTS.contains(attempt)) {
			thread::sleep(ALONE_SETTLE.saturating_sub(SETTLE));
		}
		Ok(played)
	}

	fn grid_observation(&self, view: &OpenView) -> GridObservation {
		let placed = view.mounted.as_ref().map_err(Clone::clone).and_then(|_| {
			let placing = self.views.place(
				&self.app,
				view.label.clone(),
				FRACTIONAL_SLOT,
				Some(FRACTIONAL_CLIP),
			);
			block_on(placing).map_err(|failure| format!("{failure:?}"))
		});
		let drawn = placed.clone().and_then(|()| drawn_frames(&self.main_window));
		let rescaled = match placed {
			Ok(()) => self.frames_after_each_forced_scale(),
			Err(_) => Vec::new(),
		};
		GridObservation { rectangle: FRACTIONAL_SLOT, clip: FRACTIONAL_CLIP, drawn, rescaled }
	}

	fn frames_after_each_forced_scale(&self) -> Vec<RescaledFrames> {
		let native_scale = match self.main_window.scale_factor() {
			Ok(scale) => scale,
			Err(cause) => {
				let unforced = format!("the native backing scale is unreadable: {cause}");
				return SCALES_FORCED_IN_TURN
					.map(|forced_scale| RescaledFrames {
						forced_scale,
						drawn: Err(unforced.clone()),
					})
					.into();
			}
		};
		let _restored = NativeScaleRestored { main_window: &self.main_window, native_scale };
		SCALES_FORCED_IN_TURN
			.map(|forced_scale| RescaledFrames {
				forced_scale,
				drawn: force_backing_scale(&self.main_window, forced_scale).and_then(|()| {
					thread::sleep(SETTLE);
					drawn_frames(&self.main_window)
				}),
			})
			.into()
	}

	fn scrolled_gestures(&self, view: &OpenView) -> Result<Vec<ScrolledGesture>, String> {
		view.mounted.as_ref().map_err(Clone::clone)?;
		let gestures = [
			(ScrollDevice::MouseWheel, &WHEEL_NOTCHES[..]),
			(ScrollDevice::Trackpad, &TRACKPAD_SWIPE[..]),
		];
		let mut scrolled = Vec::new();
		for (device, steps) in gestures {
			for pointer in [Pointer::BesideTheView, Pointer::OverTheView] {
				scrolled.push(self.scrolled_gesture(device, steps, pointer)?);
			}
		}
		Ok(scrolled)
	}

	fn scrolled_gesture(
		&self,
		device: ScrollDevice,
		steps: &[ScrollStep],
		pointer: Pointer,
	) -> Result<ScrolledGesture, String> {
		self.main_window.eval(SCROLL_TO_THE_TOP_SCRIPT).map_err(|cause| cause.to_string())?;
		thread::sleep(SCROLL_SETTLE);
		let before = self.main_scroll()?;
		let mut sent = Vec::new();
		for step in steps {
			sent.push((*step, send_scroll(&self.main_window, device, *step, pointer)?));
			thread::sleep(SCROLL_STEP_INTERVAL);
		}
		thread::sleep(SCROLL_SETTLE);
		Ok(ScrolledGesture { device, pointer, sent, before, after: self.main_scroll()? })
	}

	fn main_scroll(&self) -> Result<MainScroll, String> {
		let reading = self.scroll_readings.fetch_add(1, Ordering::SeqCst);
		self.main_window
			.eval(format!("window.__spikeScrollReading?.({reading})"))
			.map_err(|cause| cause.to_string())?;
		wait_until(SCROLL_READING_TIMEOUT, || self.host.main_scroll(reading).is_some());
		self.host
			.main_scroll(reading)
			.ok_or_else(|| format!("the main page gave no scroll reading {reading}"))
	}

	fn host_reading(&self, view: &OpenView) -> HostReading {
		let mounted = view.mounted.as_ref().map_err(Clone::clone)?;
		let content_url = mounted.wrapper_url.replace(WRAPPER_DOCUMENT, CONTENT_DOCUMENT);
		probe::read(&self.mounted_view(&view.label), &content_url)
	}

	fn mounted_view<'a>(&'a self, label: &'a str) -> MountedView<'a> {
		MountedView { views: &self.views, app: &self.app, id: label }
	}

	fn mounted(&self, label: &str, role: &'static str) -> Result<Mounted, String> {
		let targets = serde_json::to_string(&self.sensors.targets(role))
			.map_err(|cause| cause.to_string())?;
		let html = HOSTILE_HTML.replace(TARGETS_PLACEHOLDER, &targets);
		block_on(self.views.mount(&self.app, label.to_owned(), html, SLOT))
			.map_err(|failure| format!("{failure:?}"))?;
		let mount_returned = Instant::now();
		let wrapper_url = block_on(self.views.url(&self.app, label.to_owned()))
			.map_err(|failure| format!("{failure:?}"))?;
		let token = wrapper_url
			.parse::<tauri::Url>()
			.ok()
			.and_then(|url| Some(url.path_segments()?.next()?.to_owned()))
			.ok_or("the mounted view url carries no token")?;
		Ok(Mounted { token, wrapper_url, mount_returned })
	}

	fn open_view(
		&self,
		label: &str,
		role: &'static str,
		timeout: Duration,
		settle: Duration,
	) -> Result<OpenView, Failure> {
		self.host.mark_view_open(true);
		let creation_began = Instant::now();
		let mounted = self.mounted(label, role);
		let is_closed = Arc::new(AtomicBool::new(false));
		match &mounted {
			Ok(view) => {
				keep_awake(
					Arc::clone(&self.views),
					self.app.clone(),
					label.to_owned(),
					Arc::clone(&is_closed),
				);
				let has_run =
					|| self.host.view_record(label, &view.token).outcome(RUN_SIGNAL).is_some();
				if !wait_until(timeout, has_run) {
					eprintln!("{label} never signalled the end of its run");
				}
				thread::sleep(settle);
			}
			Err(cause) => eprintln!("{label} was mounted nowhere: {cause}"),
		}
		Ok(OpenView {
			label: label.to_owned(),
			mounted,
			is_closed,
			creation_began,
			settled_at: Instant::now(),
		})
	}

	fn close_view(&self, view: OpenView) -> Result<PlayedView, Failure> {
		view.is_closed.store(true, Ordering::SeqCst);
		let (window_url_after, reached, url, creation_error) = match &view.mounted {
			Ok(mounted) => {
				let after = block_on(self.views.url(&self.app, view.label.clone()))
					.map_err(|failure| format!("{failure:?}"));
				let reached = probe::reached_attempts(&self.mounted_view(&view.label));
				block_on(self.views.remove(&self.app, view.label.clone()))
					.map_err(|failure| format!("{} was not removed: {failure:?}", view.label))?;
				(Some(after), reached, mounted.wrapper_url.clone(), None)
			}
			Err(cause) => (None, Err(cause.clone()), String::new(), Some(cause.clone())),
		};
		self.host.mark_view_open(false);
		let record = view.record(&self.host);
		Ok(PlayedView {
			observation: ViewObservation {
				token: view
					.mounted
					.as_ref()
					.map(|mounted| mounted.token.clone())
					.unwrap_or_default(),
				record,
				reached,
			},
			label: view.label,
			url,
			window_url_after,
			creation_error,
			open: (view.creation_began, view.settled_at),
			mount_returned: view.mounted.as_ref().ok().map(|mounted| mounted.mount_returned),
		})
	}
}

fn view_summary(view: &PlayedView) -> serde_json::Value {
	json!({
		"url": view.url,
		"document_requests": view.observation.record.document_requests,
		"requests_outside_the_routes": view.observation.record.unrouted_requests,
		"attempts_the_page_script_reached_read_by_the_host": probe::evidence(&view.observation.reached),
	})
}
