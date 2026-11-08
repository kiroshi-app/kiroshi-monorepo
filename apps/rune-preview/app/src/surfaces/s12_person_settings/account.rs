use kiroshi_core::account::contract::AccountPlan;
use kiroshi_core::devices::contract::DeviceKind as CoreDeviceKind;
use serde::Deserialize;

use kiroshi_rune_kit::strings::{Key, settings};
use kiroshi_rune_kit::surfaces::s12_person_settings::panes::{
	Account as Panel, DeviceKind, Plan, RemovalStatus,
};

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Watched {
	#[serde(rename_all = "camelCase")]
	SignedOut {
		reason: Option<String>,
	},
	#[serde(rename_all = "camelCase")]
	Waiting {
		verification_url: String,
	},
	#[serde(rename_all = "camelCase")]
	SignedIn {
		email: String,
		plan: Option<AccountPlan>,
	},
	Unreachable {},
	#[serde(rename_all = "camelCase")]
	Failed {
		failure: String,
	},
}

#[derive(Clone, Debug, PartialEq, Eq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceRead {
	pub id: String,
	pub name: Option<String>,
	pub kind: CoreDeviceKind,
	pub last_active_at: String,
	pub current: bool,
}

pub struct TransitionNotice {
	pub title: Key,
	pub description: Key,
}

const UNREACHABLE: TransitionNotice = TransitionNotice {
	title: settings::account::unreachable::TITLE,
	description: settings::account::unreachable::DESCRIPTION,
};

impl Watched {
	fn transition(&self) -> String {
		match self {
			Watched::SignedOut { reason } => {
				format!("signedOut:{}", reason.as_deref().unwrap_or("null"))
			}
			Watched::Waiting { .. } => "waiting".to_owned(),
			Watched::SignedIn { .. } => "signedIn".to_owned(),
			Watched::Unreachable {} => "unreachable".to_owned(),
			Watched::Failed { failure } => format!("failed:{failure}"),
		}
	}

	pub fn email(&self) -> Option<&str> {
		match self {
			Watched::SignedIn { email, .. } => Some(email),
			_ => None,
		}
	}
}

fn notice_of(transition: &str) -> Option<TransitionNotice> {
	use settings::account::{device_revoked, failed, signed_out_from_the_site};
	match transition {
		"unreachable" | "failed:unreachable" => Some(UNREACHABLE),
		"failed:expired" => {
			Some(TransitionNotice { title: failed::TIMED_OUT, description: failed::DESCRIPTION })
		}
		"failed:cancelled" => {
			Some(TransitionNotice { title: failed::CANCELLED, description: failed::DESCRIPTION })
		}
		"signedOut:signedOutOnSite" => Some(TransitionNotice {
			title: signed_out_from_the_site::TITLE,
			description: signed_out_from_the_site::DESCRIPTION,
		}),
		"signedOut:deviceRevoked" => Some(TransitionNotice {
			title: device_revoked::TITLE,
			description: device_revoked::DESCRIPTION,
		}),
		_ => None,
	}
}

fn local_part(email: &str) -> &str {
	email.split('@').next().unwrap_or(email)
}

pub fn panel_of<'a>(watched: &'a Watched, display_name: &'a str) -> Panel<'a> {
	match watched {
		Watched::SignedIn { email, plan } => Panel::SignedIn {
			name: if display_name.is_empty() { local_part(email) } else { display_name },
			email,
			plan: plan.map(|plan| match plan {
				AccountPlan::Free => Plan::Free,
				AccountPlan::Pro => Plan::Pro,
			}),
		},
		Watched::Waiting { .. } => Panel::Waiting,
		Watched::SignedOut { .. } | Watched::Unreachable {} | Watched::Failed { .. } => {
			Panel::SignedOut
		}
	}
}

pub fn shown_kind(kind: CoreDeviceKind) -> DeviceKind {
	match kind {
		CoreDeviceKind::Phone => DeviceKind::Phone,
		CoreDeviceKind::Computer => DeviceKind::Laptop,
	}
}

#[derive(Default)]
pub struct Account {
	pub watched: Option<Watched>,
	transition: Option<String>,
}

impl Account {
	pub fn read(&mut self, watched: Watched) -> Option<TransitionNotice> {
		let transition = watched.transition();
		self.watched = Some(watched);
		if self.transition.as_deref() == Some(transition.as_str()) {
			return None;
		}
		let notice = notice_of(&transition);
		self.transition = Some(transition);
		notice
	}

	pub fn is_waiting(&self) -> bool {
		matches!(self.watched, Some(Watched::Waiting { .. }))
	}

	pub fn sign_in_link(&self) -> Option<&str> {
		match &self.watched {
			Some(Watched::Waiting { verification_url }) => Some(verification_url),
			_ => None,
		}
	}

	pub fn email(&self) -> Option<&str> {
		self.watched.as_ref().and_then(Watched::email)
	}
}

#[derive(Default)]
pub enum DevicesRead {
	#[default]
	Unread,
	Reading,
	Failed,
	Read(Vec<DeviceRead>),
}

#[derive(Default)]
pub struct Devices {
	pub read: DevicesRead,
	pub confirming: Option<String>,
	pub removal: Option<(String, RemovalStatus)>,
}

impl Devices {
	pub fn listed(&self) -> &[DeviceRead] {
		match &self.read {
			DevicesRead::Read(devices) => devices,
			DevicesRead::Unread | DevicesRead::Reading | DevicesRead::Failed => &[],
		}
	}

	pub fn named(&self, device_id: &str) -> String {
		self.listed()
			.iter()
			.find(|device| device.id == device_id)
			.and_then(|device| device.name.clone())
			.unwrap_or_default()
	}

	pub fn ask(&mut self, device_id: String) {
		self.confirming = Some(device_id);
	}

	pub fn cancel(&mut self) {
		self.confirming = None;
		self.removal = None;
	}

	pub fn removing(&mut self, device_id: &str) -> bool {
		let is_removing = matches!(&self.removal, Some((_, RemovalStatus::Removing)));
		let is_listed = self.listed().iter().any(|device| device.id == device_id);
		if is_removing || !is_listed {
			return false;
		}
		self.removal = Some((device_id.to_owned(), RemovalStatus::Removing));
		true
	}

	pub fn removed(&mut self, device_id: &str) {
		if let DevicesRead::Read(devices) = &mut self.read {
			devices.retain(|device| device.id != device_id);
		}
		if self.confirming.as_deref() == Some(device_id) {
			self.confirming = None;
		}
		self.removal = None;
	}

	pub fn refused(&mut self, device_id: &str) {
		self.removal = Some((device_id.to_owned(), RemovalStatus::Failed));
	}

	pub fn status_of_confirming(&self) -> Option<RemovalStatus> {
		let (device_id, status) = self.removal.as_ref()?;
		(self.confirming.as_ref() == Some(device_id)).then_some(*status)
	}
}
