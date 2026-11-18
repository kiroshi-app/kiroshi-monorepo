use tauri::{Manager, Runtime, WebviewWindow};
use webkit2gtk::{WebProcessTerminationReason, WebViewExt};

use super::decision::{DeadProcess, Death, WindowDeathReason};

pub(crate) fn watch<R: Runtime>(window: &WebviewWindow<R>) {
	let app = window.app_handle().clone();
	let watched = window.with_webview(move |webview| {
		webview.inner().connect_web_process_terminated(move |_, reason| {
			super::recover(&app, Death { process: DeadProcess::Render, reason: reason_of(reason) });
		});
	});
	if let Err(failure) = watched {
		log::error!("the main window page death is not watched: {failure}");
	}
}

fn reason_of(reason: WebProcessTerminationReason) -> WindowDeathReason {
	match reason {
		WebProcessTerminationReason::Crashed => WindowDeathReason::Crashed,
		WebProcessTerminationReason::ExceededMemoryLimit => WindowDeathReason::OutOfMemory,
		WebProcessTerminationReason::TerminatedByApi => WindowDeathReason::Killed,
		_ => WindowDeathReason::Unknown,
	}
}
