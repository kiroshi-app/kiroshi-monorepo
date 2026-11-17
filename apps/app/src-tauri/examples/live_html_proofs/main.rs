#[cfg(target_os = "macos")]
mod host;
#[cfg(target_os = "macos")]
mod http;
#[cfg(target_os = "macos")]
mod probe;
#[cfg(target_os = "macos")]
mod proofs;
#[cfg(target_os = "macos")]
mod scenario;
#[cfg(target_os = "macos")]
mod sensors;

use std::process::ExitCode;

#[cfg(not(target_os = "macos"))]
fn main() -> ExitCode {
	eprintln!("the live HTML proofs play on macOS alone");
	ExitCode::from(2)
}

#[cfg(target_os = "macos")]
fn main() -> ExitCode {
	match macos::run() {
		Ok(()) => ExitCode::SUCCESS,
		Err(cause) => {
			eprintln!("the live HTML proofs could not start: {cause}");
			ExitCode::FAILURE
		}
	}
}

#[cfg(target_os = "macos")]
mod macos {
	use std::error::Error;
	use std::net::{Ipv4Addr, SocketAddr};
	use std::sync::Arc;

	use tauri::WebviewWindowBuilder;

	use crate::host::HostState;
	use crate::http::{Listener, Response};
	use crate::scenario;

	const MAIN_WINDOW_LABEL: &str = "main";
	const MAIN_PAGE: &str = include_str!("main.html");

	#[tauri::command]
	fn spike_secret(webview: tauri::Webview, host: tauri::State<'_, Arc<HostState>>) -> usize {
		host.count_secret_call(webview.label())
	}

	fn main_page_server(port: u16) -> std::io::Result<Listener> {
		Listener::open(SocketAddr::from((Ipv4Addr::LOCALHOST, port)), |_incoming| Response {
			status: "200 OK",
			headers: vec![
				("Content-Type", "text/html; charset=utf-8".to_owned()),
				("Cache-Control", "no-store".to_owned()),
			],
			body: MAIN_PAGE.as_bytes().to_vec(),
		})
	}

	pub fn run() -> Result<(), Box<dyn Error>> {
		let host = Arc::new(HostState::default());
		let context = tauri::generate_context!();
		let port = context
			.config()
			.build
			.dev_url
			.as_ref()
			.and_then(tauri::Url::port)
			.ok_or("tauri.conf.json names no devUrl port to serve the main page on")?;
		let _main_page = main_page_server(port)?;
		let setup_host = Arc::clone(&host);
		tauri::Builder::default()
			.manage(Arc::clone(&host))
			.invoke_handler(tauri::generate_handler![spike_secret])
			.setup(move |app| {
				let config = app
					.config()
					.app
					.windows
					.iter()
					.find(|window| window.label == MAIN_WINDOW_LABEL)
					.cloned()
					.ok_or("tauri.conf.json declares no main window")?;
				let main_window = WebviewWindowBuilder::from_config(app.handle(), &config)?
					.visible(true)
					.always_on_top(true)
					.build()?;
				scenario::start(app.handle().clone(), setup_host, main_window)
			})
			.run(context)?;
		Ok(())
	}
}
