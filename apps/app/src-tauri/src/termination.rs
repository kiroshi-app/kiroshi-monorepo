use std::future::Future;
use std::io;

use tauri::{AppHandle, Runtime};

pub async fn exited_on_termination<R: Runtime>(app: AppHandle<R>) {
	let requested = match termination_requested() {
		Ok(requested) => requested,
		Err(failure) => return log::warn!("no termination signal is listened to: {failure}"),
	};
	match requested.await {
		Ok(()) => app.exit(0),
		Err(failure) => log::warn!("the termination signal was lost: {failure}"),
	}
}

#[cfg(unix)]
pub fn termination_requested() -> io::Result<impl Future<Output = io::Result<()>>> {
	use tokio::signal::unix::{signal, SignalKind};

	let mut terminate = signal(SignalKind::terminate())?;
	let mut interrupt = signal(SignalKind::interrupt())?;
	Ok(async move {
		tokio::select! {
			_ = terminate.recv() => Ok(()),
			_ = interrupt.recv() => Ok(()),
		}
	})
}

#[cfg(not(unix))]
pub fn termination_requested() -> io::Result<impl Future<Output = io::Result<()>>> {
	Ok(tokio::signal::ctrl_c())
}
