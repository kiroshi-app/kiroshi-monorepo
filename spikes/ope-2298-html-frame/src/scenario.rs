use std::error::Error;
use std::net::{IpAddr, Ipv4Addr};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, Instant};

use serde_json::json;
use tauri::{AppHandle, Listener as _, WebviewWindow};

use crate::host::{HostState, Tick, ViewAddress};
use crate::proofs::{Observations, TripwireReading, ViewObservation, WindowUrl};
use crate::sensors::{non_loopback_ipv4, Role, Targets, Tripwire, ViewServer};
use crate::windows::{open_main_window, open_view_window, MAIN_WINDOW_LABEL};
use crate::Mode;

const HEARTBEAT_EVENT: &str = "spike-heartbeat";
const RUN_SIGNAL: &str = "run";
const BEAT_SCRIPT: &str = "window.__spikeBeat?.()";
const HEARTBEAT_INTERVAL: Duration = Duration::from_millis(100);
const POLL: Duration = Duration::from_millis(50);
const MAIN_WINDOW_TIMEOUT: Duration = Duration::from_secs(15);
const BASELINE: Duration = Duration::from_secs(2);
const FIRST_VIEW_TIMEOUT: Duration = Duration::from_secs(50);
const SECOND_VIEW_TIMEOUT: Duration = Duration::from_secs(12);
const RELOAD_TIMEOUT: Duration = Duration::from_secs(10);
const SETTLE: Duration = Duration::from_millis(1500);
const RUN_LIMIT: Duration = Duration::from_secs(115);
const HARNESS_FAILURE: i32 = 1;

type Failure = Box<dyn Error>;

struct Sensors {
	loopback: Tripwire,
	loopback_control: usize,
	lan: Result<(Tripwire, usize), String>,
	navigation_sink: Tripwire,
}

impl Sensors {
	fn open() -> Result<Self, Failure> {
		let loopback = Tripwire::open(IpAddr::V4(Ipv4Addr::LOCALHOST))?;
		let loopback_control = loopback.count_control_connection()?;
		let lan = non_loopback_ipv4()
			.and_then(|address| Tripwire::open(IpAddr::V4(address)))
			.and_then(|tripwire| {
				tripwire.count_control_connection().map(|control| (tripwire, control))
			})
			.map_err(|cause| cause.to_string());
		let navigation_sink = Tripwire::open(IpAddr::V4(Ipv4Addr::LOCALHOST))?;
		Ok(Self { loopback, loopback_control, lan, navigation_sink })
	}

	fn targets(&self, role: Role) -> Targets {
		Targets {
			role,
			loopback_tripwire: self.loopback.address().to_string(),
			lan_tripwire: self
				.lan
				.as_ref()
				.ok()
				.map(|(tripwire, _)| tripwire.address().to_string()),
			navigation_sink: format!("http://{}", self.navigation_sink.address()),
		}
	}

	fn loopback_reading(&self) -> TripwireReading {
		reading(&self.loopback, self.loopback_control)
	}

	fn lan_reading(&self) -> Result<TripwireReading, String> {
		self.lan
			.as_ref()
			.map(|(tripwire, control)| reading(tripwire, *control))
			.map_err(Clone::clone)
	}
}

fn reading(tripwire: &Tripwire, control_connections: usize) -> TripwireReading {
	TripwireReading {
		address: tripwire.address().to_string(),
		control_connections,
		connections: tripwire.connections(),
	}
}

fn point_at(host: &HostState, view: &ViewServer) {
	host.point_at_view(ViewAddress { origin: view.origin(), url: view.url() });
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
	let first_view = ViewServer::open(&sensors.targets(Role::Writer))?;
	point_at(&host, &first_view);
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

struct PlayedView {
	observation: ViewObservation,
	url: String,
	csp: String,
	window_url_after: Option<Result<String, String>>,
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

		let writer = self.play_view("view-1", first_view, FIRST_VIEW_TIMEOUT)?;
		let main_url_after =
			self.main_window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string());
		let reader = self.play_second_view()?;

		let mut window_urls = vec![WindowUrl {
			window: MAIN_WINDOW_LABEL.to_owned(),
			before_the_view: main_url_before,
			after_the_view: main_url_after,
		}];
		if let Some(after_the_view) = writer.window_url_after.clone() {
			window_urls.push(WindowUrl {
				window: "view-1".to_owned(),
				before_the_view: writer.url.clone(),
				after_the_view,
			});
		}
		let views = json!({
			"first_view": view_summary(&writer),
			"second_view": reader.as_ref().map(view_summary),
		});
		let observations = Observations {
			secret_calls: self.host.secret_calls(),
			heartbeat: self.host.heartbeat(),
			baseline,
			loopback_tripwire: self.sensors.loopback_reading(),
			lan_tripwire: self.sensors.lan_reading(),
			navigation_sink: self.sensors.navigation_sink.connections(),
			handler_events: self.host.handler_events(),
			window_urls,
			writer: writer.observation,
			reader: reader.map(|view| view.observation),
		};
		let results = json!({
			"ticket": "OPE-2298",
			"os": std::env::consts::OS,
			"mode": self.mode.name(),
			"tauri": tauri::VERSION,
			"webview": match tauri::webview_version() {
				Ok(version) => version,
				Err(cause) => format!("unavailable: {cause}"),
			},
			"duration_ms": self.started.elapsed().as_millis(),
			"main_window_csp_served": self.host.main_window_csps(),
			"views": views,
			"proofs": observations.proofs(),
			"page_claims_never_used_alone_for_a_verdict": observations.page_claims(),
		});
		let rendered = serde_json::to_string_pretty(&results)?;
		std::fs::write(
			format!("results-{}-{}.json", std::env::consts::OS, self.mode.name()),
			&rendered,
		)?;
		println!("{rendered}");
		Ok(())
	}

	fn play_second_view(&self) -> Result<Option<PlayedView>, Failure> {
		let second_view = ViewServer::open(&self.sensors.targets(Role::Reader))?;
		point_at(&self.host, &second_view);
		if self.mode == Mode::Frame && !self.reload_main_window()? {
			eprintln!(
				"the main window did not come back after its reload, the second view stays closed"
			);
			return Ok(None);
		}
		self.play_view("view-2", second_view, SECOND_VIEW_TIMEOUT).map(Some)
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

	fn play_view(
		&self,
		label: &str,
		view: ViewServer,
		timeout: Duration,
	) -> Result<PlayedView, Failure> {
		let url = view.url();
		self.host.mark_view_open(true);
		let window = match self.mode {
			Mode::Frame => {
				self.main_window
					.eval(format!("window.__spikeOpenView({})", serde_json::to_string(&url)?))?;
				None
			}
			Mode::Window => Some(open_view_window(&self.app, &self.host, label, url.parse()?)?),
		};
		if !wait_until(timeout, || view.record().outcome(RUN_SIGNAL).is_some()) {
			eprintln!("{label} never signalled the end of its run");
		}
		thread::sleep(SETTLE);
		let window_url_after = window.as_ref().map(|window| {
			window.url().map(|url| url.to_string()).map_err(|cause| cause.to_string())
		});
		match window {
			Some(window) => window.destroy()?,
			None => self.main_window.eval("window.__spikeCloseView()")?,
		}
		self.host.mark_view_open(false);
		Ok(PlayedView {
			observation: ViewObservation { token: view.token().to_owned(), record: view.record() },
			url,
			csp: view.csp().to_owned(),
			window_url_after,
		})
	}
}

fn view_summary(view: &PlayedView) -> serde_json::Value {
	json!({
		"url": view.url,
		"response_csp": view.csp,
		"document_requests": view.observation.record.document_requests,
		"requests_outside_the_routes": view.observation.record.unrouted_requests,
	})
}
