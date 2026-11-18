use tauri::webview::PlatformWebview;
use tauri::{AppHandle, Manager, Runtime, WebviewWindow};
use webview2_com::Microsoft::Web::WebView2::Win32::{
	ICoreWebView2ProcessFailedEventArgs, ICoreWebView2ProcessFailedEventArgs2,
	COREWEBVIEW2_PROCESS_FAILED_KIND, COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED,
	COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED,
	COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE,
	COREWEBVIEW2_PROCESS_FAILED_REASON, COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED,
	COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY,
	COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED, COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE,
};
use webview2_com::ProcessFailedEventHandler;
use windows::core::Interface;

use super::decision::{DeadProcess, Death, WindowDeathReason};

pub(crate) fn watch<R: Runtime>(window: &WebviewWindow<R>) {
	let app = window.app_handle().clone();
	let watched = window.with_webview(move |webview| {
		if let Err(failure) = subscribed(&webview, app) {
			log::error!("the main window page death is not watched: {failure}");
		}
	});
	if let Err(failure) = watched {
		log::error!("the main window page death is not watched: {failure}");
	}
}

fn subscribed<R: Runtime>(
	webview: &PlatformWebview,
	app: AppHandle<R>,
) -> windows::core::Result<()> {
	let core = unsafe { webview.controller().CoreWebView2()? };
	let handler = ProcessFailedEventHandler::create(Box::new(move |_, args| {
		if let Some(death) = args.as_ref().and_then(death_of) {
			super::recover(&app, death);
		}
		Ok(())
	}));
	let mut token = 0;
	unsafe { core.add_ProcessFailed(&handler, &mut token) }
}

fn death_of(args: &ICoreWebView2ProcessFailedEventArgs) -> Option<Death> {
	let mut kind = COREWEBVIEW2_PROCESS_FAILED_KIND::default();
	if let Err(failure) = unsafe { args.ProcessFailedKind(&mut kind) } {
		log::error!("a WebView2 process failure gave no kind: {failure}");
		return None;
	}
	match kind {
		COREWEBVIEW2_PROCESS_FAILED_KIND_BROWSER_PROCESS_EXITED => {
			Some(Death { process: DeadProcess::Browser, reason: reason_of(args) })
		}
		COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_EXITED => {
			Some(Death { process: DeadProcess::Render, reason: reason_of(args) })
		}
		COREWEBVIEW2_PROCESS_FAILED_KIND_RENDER_PROCESS_UNRESPONSIVE => {
			Some(Death { process: DeadProcess::Render, reason: WindowDeathReason::Unresponsive })
		}
		_ => None,
	}
}

fn reason_of(args: &ICoreWebView2ProcessFailedEventArgs) -> WindowDeathReason {
	let mut reason = COREWEBVIEW2_PROCESS_FAILED_REASON::default();
	let read = args
		.cast::<ICoreWebView2ProcessFailedEventArgs2>()
		.and_then(|detailed| unsafe { detailed.Reason(&mut reason) });
	if let Err(failure) = read {
		log::warn!("a WebView2 process failure gave no reason: {failure}");
		return WindowDeathReason::Unknown;
	}
	match reason {
		COREWEBVIEW2_PROCESS_FAILED_REASON_OUT_OF_MEMORY => WindowDeathReason::OutOfMemory,
		COREWEBVIEW2_PROCESS_FAILED_REASON_CRASHED => WindowDeathReason::Crashed,
		COREWEBVIEW2_PROCESS_FAILED_REASON_TERMINATED => WindowDeathReason::Killed,
		COREWEBVIEW2_PROCESS_FAILED_REASON_UNRESPONSIVE => WindowDeathReason::Unresponsive,
		_ => WindowDeathReason::Unknown,
	}
}
