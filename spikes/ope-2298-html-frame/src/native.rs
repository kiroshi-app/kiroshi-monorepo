use std::sync::mpsc;
use std::time::Duration;

use tauri::webview::PlatformWebview;
use tauri::Webview;

const MAIN_THREAD_TIMEOUT: Duration = Duration::from_secs(5);

pub fn read<T: Send + 'static>(
	webview: &Webview,
	reading: impl FnOnce(PlatformWebview) -> T + Send + 'static,
) -> Result<T, String> {
	let (sender, receiver) = mpsc::channel();
	webview
		.with_webview(move |platform| {
			if sender.send(reading(platform)).is_err() {
				eprintln!("a native reading arrived after its deadline");
			}
		})
		.map_err(|cause| cause.to_string())?;
	receiver
		.recv_timeout(MAIN_THREAD_TIMEOUT)
		.map_err(|cause| format!("the main thread gave no native reading: {cause}"))
}
