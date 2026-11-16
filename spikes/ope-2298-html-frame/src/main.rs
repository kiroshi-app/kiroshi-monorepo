mod host;
mod http;
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

const USAGE_ERROR: u8 = 2;

#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
	Frame,
	Window,
}

impl Mode {
	fn parse(argument: &str) -> Option<Self> {
		match argument {
			"frame" => Some(Self::Frame),
			"window" => Some(Self::Window),
			_ => None,
		}
	}

	pub fn name(self) -> &'static str {
		match self {
			Self::Frame => "frame",
			Self::Window => "window",
		}
	}
}

#[tauri::command]
fn spike_secret(webview: tauri::Webview, host: tauri::State<'_, Arc<HostState>>) -> usize {
	host.count_secret_call(webview.label())
}

fn main() -> ExitCode {
	let Some(mode) = std::env::args().nth(1).as_deref().and_then(Mode::parse) else {
		eprintln!("usage: ope-2298-html-frame <frame|window>");
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
