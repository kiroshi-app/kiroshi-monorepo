use kiroshi_core::updates::contract::UpdateState;

use super::calls::Call;

const PERCENT: u64 = 100;

pub const RELEASE_TAG_URL: &str = "https://github.com/kiroshi-app/kiroshi-monorepo/releases/tag";

#[derive(Clone, Debug, PartialEq)]
pub enum Shown {
	UpToDate { checked_at: i64 },
	Checking,
	Available { version: String },
	Downloading { version: String, progress: f32 },
	Ready { version: String, running: usize },
	Failed { version: String },
}

impl Shown {
	pub fn is_pending(&self) -> bool {
		!matches!(self, Shown::UpToDate { .. } | Shown::Checking)
	}
}

pub struct Updater {
	host: UpdateState,
	offered: Option<String>,
	checked_at: i64,
	running: usize,
	waiting_ready: Option<(UpdateState, i64)>,
	is_installing: bool,
	installs_after_check: bool,
}

pub fn release_notes_url(version: &str) -> String {
	format!("{RELEASE_TAG_URL}/v{version}")
}

fn percent_of(downloaded: u64, total: Option<u64>) -> f32 {
	match total {
		Some(total) if total > 0 => (downloaded * PERCENT / total) as f32,
		_ => 0.0,
	}
}

impl Updater {
	pub fn new(now: i64) -> Updater {
		Updater {
			host: UpdateState::Checking,
			offered: None,
			checked_at: now,
			running: 0,
			waiting_ready: None,
			is_installing: false,
			installs_after_check: false,
		}
	}

	pub fn shown(&self) -> Shown {
		match &self.host {
			UpdateState::UpToDate => Shown::UpToDate { checked_at: self.checked_at },
			UpdateState::Checking => Shown::Checking,
			UpdateState::Available { version } => Shown::Available { version: version.clone() },
			UpdateState::Downloading { downloaded_bytes, total_bytes } => Shown::Downloading {
				version: self.offered.clone().unwrap_or_default(),
				progress: percent_of(*downloaded_bytes, *total_bytes),
			},
			UpdateState::ReadyToRestart { version } => {
				Shown::Ready { version: version.clone(), running: self.running }
			}
			UpdateState::Failed { .. } => match &self.offered {
				Some(version) => Shown::Failed { version: version.clone() },
				None => Shown::UpToDate { checked_at: self.checked_at },
			},
		}
	}

	pub fn has_check_failed(&self) -> bool {
		matches!(self.host, UpdateState::Failed { .. }) && self.offered.is_none()
	}

	pub fn is_installing(&self) -> bool {
		self.is_installing
	}

	fn is_landed_ready(&self, version: &str) -> bool {
		matches!(&self.host, UpdateState::ReadyToRestart { version: held } if held == version)
	}

	fn published(&mut self, host: UpdateState, now: i64) {
		self.offered = match &host {
			UpdateState::Checking => None,
			UpdateState::Available { version } | UpdateState::ReadyToRestart { version } => {
				Some(version.clone())
			}
			_ => self.offered.take(),
		};
		if host == UpdateState::UpToDate {
			self.checked_at = now;
		}
		self.host = host;
	}

	pub fn land(&mut self, host: UpdateState, now: i64) -> Option<Call> {
		if let UpdateState::ReadyToRestart { version } = &host {
			if self.waiting_ready.is_some() || self.is_landed_ready(version) {
				return None;
			}
			self.waiting_ready = Some((host, now));
			return Some(Call::CountRunning);
		}
		self.published(host, now);
		if self.host == UpdateState::Checking || !std::mem::take(&mut self.installs_after_check) {
			return None;
		}
		self.install()
	}

	pub fn counted(&mut self, running: Option<usize>) {
		if let Some(running) = running {
			self.running = running;
		}
		if let Some((host, now)) = self.waiting_ready.take() {
			self.published(host, now);
		}
	}

	pub fn install(&mut self) -> Option<Call> {
		match self.host {
			UpdateState::Failed { .. } => {
				self.installs_after_check = true;
				Some(Call::CheckUpdate)
			}
			UpdateState::Available { .. } => {
				self.is_installing = true;
				Some(Call::InstallUpdate)
			}
			_ => None,
		}
	}

	pub fn installed(&mut self) {
		self.is_installing = false;
	}

	pub fn can_restart(&self) -> bool {
		matches!(self.host, UpdateState::ReadyToRestart { .. })
	}
}
