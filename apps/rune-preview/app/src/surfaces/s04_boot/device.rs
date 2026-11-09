use std::time::Duration;

use chrono::{DateTime, Utc};
use kiroshi_core::devices::contract::{DeviceKind as CoreDeviceKind, DeviceStatus};
use serde::Deserialize;

use kiroshi_rune_kit::surfaces::s04_boot::device_approval::ApprovalStatus;
use kiroshi_rune_kit::surfaces::s04_boot::device_card::DeviceKind;
use kiroshi_rune_kit::surfaces::s04_boot::new_device::{
	CODE_LENGTH, NewDeviceEvent, NewDeviceStep,
};

use super::calls::{Call, Due, KiroshiAccount, SignedOutReason};

#[cfg(test)]
mod tests;

const DEVICE_WATCH: Duration = Duration::from_secs(2);

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Approval {
	None,
	Approved,
	Pending {},
	Expired,
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListedDevice {
	id: String,
	name: Option<String>,
	kind: CoreDeviceKind,
	status: DeviceStatus,
	approval_expires_at: Option<String>,
	current: bool,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Asking {
	device_id: String,
	name: Option<String>,
	pub kind: CoreDeviceKind,
	expires_at: String,
}

impl Asking {
	fn request_key(&self) -> String {
		format!("{}@{}", self.device_id, self.expires_at)
	}

	pub fn name(&self) -> &str {
		self.name.as_deref().unwrap_or_default()
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Run {
	device_id: String,
	has_failed: bool,
}

#[derive(Default)]
pub struct Devices {
	approval: Option<Approval>,
	last_email: String,
	is_code_asked: bool,
	pub code: String,
	is_watching: bool,
	has_listed: bool,
	asking: Vec<Asking>,
	answered: Vec<String>,
	run: Option<Run>,
}

fn step_of(
	approval: Option<&Approval>,
	account: Option<&KiroshiAccount>,
	is_code_asked: bool,
) -> Option<NewDeviceStep> {
	let is_refused = matches!(
		account,
		Some(KiroshiAccount::SignedOut { reason: Some(SignedOutReason::DeviceRefused) })
	);
	match (is_refused, approval) {
		(true, _) => Some(NewDeviceStep::Rejected),
		(false, Some(Approval::Expired)) => Some(NewDeviceStep::Expired),
		(false, Some(Approval::Pending {})) if is_code_asked => Some(NewDeviceStep::Code),
		(false, Some(Approval::Pending {})) => Some(NewDeviceStep::Waiting),
		(false, Some(Approval::None | Approval::Approved) | None) => None,
	}
}

pub fn device_kind_of(kind: CoreDeviceKind) -> DeviceKind {
	match kind {
		CoreDeviceKind::Phone => DeviceKind::Phone,
		CoreDeviceKind::Computer => DeviceKind::Laptop,
	}
}

fn approval_status_of(run: Option<&Run>, asked: &Asking) -> ApprovalStatus {
	match run {
		Some(run) if run.device_id == asked.device_id && run.has_failed => ApprovalStatus::Failed,
		Some(run) if run.device_id == asked.device_id => ApprovalStatus::Approving,
		Some(_) | None => ApprovalStatus::Asking,
	}
}

fn is_asking_before(device: &ListedDevice, now: DateTime<Utc>) -> bool {
	let expires_at = device.approval_expires_at.as_deref().map(DateTime::parse_from_rfc3339);
	!device.current
		&& device.status == DeviceStatus::Pending
		&& matches!(expires_at, Some(Ok(at)) if at > now)
}

fn asking_devices_of(devices: Vec<ListedDevice>, now: DateTime<Utc>) -> Vec<Asking> {
	devices
		.into_iter()
		.filter(|device| is_asking_before(device, now))
		.map(|device| Asking {
			device_id: device.id,
			name: device.name,
			kind: device.kind,
			expires_at: device.approval_expires_at.unwrap_or_default(),
		})
		.collect()
}

impl Devices {
	pub fn step(&self, account: Option<&KiroshiAccount>) -> Option<NewDeviceStep> {
		step_of(self.approval.as_ref(), account, self.is_code_asked)
	}

	pub fn email(&self) -> &str {
		&self.last_email
	}

	pub fn asked(&self) -> Option<&Asking> {
		self.asking.first()
	}

	pub fn status_of(&self, asked: &Asking) -> ApprovalStatus {
		approval_status_of(self.run.as_ref(), asked)
	}

	fn is_listed(&self, account: Option<&KiroshiAccount>) -> bool {
		matches!(account, Some(KiroshiAccount::SignedIn { .. }))
			&& self.approval == Some(Approval::Approved)
	}

	fn is_pending(&self) -> bool {
		matches!(self.approval, Some(Approval::Pending {}))
	}

	pub fn read(&mut self, approval: Approval, account: Option<&KiroshiAccount>) -> Vec<Call> {
		if !matches!(approval, Approval::Pending {}) {
			self.is_code_asked = false;
		}
		self.approval = Some(approval);
		self.followed(account)
	}

	pub fn account_read(&mut self, account: Option<&KiroshiAccount>) -> Vec<Call> {
		if let Some(KiroshiAccount::SignedIn { email, .. }) = account {
			self.last_email.clone_from(email);
		}
		self.followed(account)
	}

	fn followed(&mut self, account: Option<&KiroshiAccount>) -> Vec<Call> {
		let mut calls = Vec::new();
		if self.is_listed(account) && !std::mem::replace(&mut self.has_listed, true) {
			calls.push(Call::ReadDevices);
		}
		if self.is_pending() && !std::mem::replace(&mut self.is_watching, true) {
			calls.push(Call::Wake(DEVICE_WATCH, Due::DeviceWatch));
		}
		calls
	}

	pub fn watch_due(&mut self) -> Vec<Call> {
		self.is_watching = false;
		match self.is_pending() {
			true => vec![Call::ReadDeviceApproval, Call::ReadKiroshiAccount],
			false => Vec::new(),
		}
	}

	pub fn event(&mut self, event: NewDeviceEvent) -> Option<Call> {
		match event {
			NewDeviceEvent::UseCode => {
				self.is_code_asked = true;
				Some(Call::RequestDeviceCode)
			}
			NewDeviceEvent::TypeDigit(digit) => {
				if digit.is_ascii_digit() && self.code.chars().count() < CODE_LENGTH {
					self.code.push(digit);
				}
				None
			}
			NewDeviceEvent::EraseDigit => {
				self.code.pop();
				None
			}
			NewDeviceEvent::ApproveWithCode => (self.code.chars().count() == CODE_LENGTH)
				.then(|| Call::SubmitDeviceCode(self.code.clone())),
			NewDeviceEvent::ResendCode => Some(Call::RequestDeviceCode),
			NewDeviceEvent::AskAgain => Some(Call::RetryDeviceApproval),
			NewDeviceEvent::SignOut => Some(Call::KiroshiSignOut),
			NewDeviceEvent::BackToSignIn => Some(Call::KiroshiSignIn),
		}
	}

	pub fn listed(&mut self, devices: Vec<ListedDevice>, now: DateTime<Utc>) {
		let fresh: Vec<Asking> = asking_devices_of(devices, now)
			.into_iter()
			.filter(|device| !self.is_held(device))
			.collect();
		self.asking.extend(fresh);
	}

	fn is_held(&self, device: &Asking) -> bool {
		self.asking.iter().any(|held| held.device_id == device.device_id)
			|| self.answered.contains(&device.request_key())
	}

	pub fn approve(&mut self) -> Option<Call> {
		let asked = self.asked()?;
		if self.status_of(asked) == ApprovalStatus::Approving {
			return None;
		}
		let device_id = asked.device_id.clone();
		self.run = Some(Run { device_id: device_id.clone(), has_failed: false });
		Some(Call::ApproveDevice(device_id))
	}

	pub fn refuse(&mut self) -> Option<Call> {
		let asked = self.asked()?;
		if self.status_of(asked) == ApprovalStatus::Approving {
			return None;
		}
		Some(Call::RefuseDevice(asked.device_id.clone()))
	}

	pub fn approval_failed(&mut self, device_id: &str) {
		if let Some(run) = self.run.as_mut().filter(|run| run.device_id == device_id) {
			run.has_failed = true;
		}
	}

	pub fn settle(&mut self, device_id: &str) -> Option<Asking> {
		if self.run.as_ref().is_some_and(|run| run.device_id == device_id) {
			self.run = None;
		}
		let at = self.asking.iter().position(|held| held.device_id == device_id)?;
		let settled = self.asking.remove(at);
		self.answered.push(settled.request_key());
		Some(settled)
	}
}
