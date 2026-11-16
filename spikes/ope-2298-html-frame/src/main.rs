mod host;
mod http;
mod probe;
mod proofs;
mod scenario;
mod sensors;
mod windows;

use std::process::ExitCode;
use std::sync::Arc;

use tauri_plugin_dialog as _;
use tauri_plugin_log as _;
use tauri_plugin_opener as _;
use tauri_plugin_os as _;
use tauri_plugin_process as _;
use tauri_plugin_updater as _;

use host::HostState;
use sensors::WRAPPER_CSP;

const USAGE_ERROR: u8 = 2;
const SANDBOX_DIRECTIVE: &str = "sandbox allow-scripts";
const INCOGNITO_MITIGATION: &str =
	"each view window is built with incognito(true), so every view has its own storage";

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
	Frame,
	Window,
	WindowIsolated,
	WindowSandboxed,
}

impl Mode {
	fn parse(argument: &str) -> Option<Self> {
		match argument {
			"frame" => Some(Self::Frame),
			"window" => Some(Self::Window),
			"window-isolated" => Some(Self::WindowIsolated),
			"window-sandboxed" => Some(Self::WindowSandboxed),
			_ => None,
		}
	}

	pub fn name(self) -> &'static str {
		match self {
			Self::Frame => "frame",
			Self::Window => "window",
			Self::WindowIsolated => "window-isolated",
			Self::WindowSandboxed => "window-sandboxed",
		}
	}

	pub fn shows_views_in_windows(self) -> bool {
		self != Self::Frame
	}

	pub fn isolates_view_storage(self) -> bool {
		matches!(self, Self::WindowIsolated | Self::WindowSandboxed)
	}

	pub fn decides_from_host_observations(self) -> bool {
		matches!(self, Self::WindowIsolated | Self::WindowSandboxed)
	}

	pub fn frames_view_documents(self) -> bool {
		self == Self::WindowSandboxed
	}

	pub fn mitigations(self) -> Vec<String> {
		let incognito = self.isolates_view_storage().then(|| INCOGNITO_MITIGATION.to_owned());
		let directives = self
			.view_csp_directives()
			.iter()
			.map(|directive| format!("hostile.html is served with the CSP directive {directive}"));
		let wrapper = self.frames_view_documents().then(|| {
			format!("the view window loads a script-less wrapper page from the view server that frames hostile.html, served with the CSP {WRAPPER_CSP}, the containment the main window frame-src gives in frame mode")
		});
		incognito.into_iter().chain(directives).chain(wrapper).collect()
	}

	pub fn view_csp_directives(self) -> &'static [&'static str] {
		match self {
			Self::WindowSandboxed => &[SANDBOX_DIRECTIVE],
			Self::Frame | Self::Window | Self::WindowIsolated => &[],
		}
	}
}

#[tauri::command]
fn spike_secret(webview: tauri::Webview, host: tauri::State<'_, Arc<HostState>>) -> usize {
	host.count_secret_call(webview.label())
}

fn main() -> ExitCode {
	let Some(mode) = std::env::args().nth(1).as_deref().and_then(Mode::parse) else {
		eprintln!("usage: ope-2298-html-frame <frame|window|window-isolated|window-sandboxed>");
		return ExitCode::from(USAGE_ERROR);
	};
	let host = Arc::new(HostState::default());
	let started = tauri::Builder::default()
		.manage(Arc::clone(&host))
		.invoke_handler(tauri::generate_handler![spike_secret])
		.setup(move |app| scenario::start(app.handle().clone(), host, mode))
		.run(tauri::generate_context!());
	match started {
		Ok(()) => ExitCode::SUCCESS,
		Err(cause) => {
			eprintln!("the harness could not start: {cause}");
			ExitCode::FAILURE
		}
	}
}
