use std::net::SocketAddr;

use tokio::sync::watch;

pub const ROUTINE_CALL_PATH: &str = "/routines/call";

pub const MISSION_CALL_PATH: &str = "/missions/call";

pub struct Webhook {
	address: Option<SocketAddr>,
	stop: watch::Sender<bool>,
}

impl Webhook {
	pub fn new(address: Option<SocketAddr>, stop: watch::Sender<bool>) -> Self {
		Self { address, stop }
	}

	pub fn url(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}{ROUTINE_CALL_PATH}"))
	}

	pub fn origin(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}"))
	}

	pub fn mission_url(&self) -> Option<String> {
		self.address.map(|address| format!("http://{address}{MISSION_CALL_PATH}"))
	}

	pub fn stop(&self) {
		self.stop.send_replace(true);
	}

	#[cfg(any(test, feature = "test-support"))]
	pub fn address(&self) -> SocketAddr {
		self.address.expect("the webhook bound an address")
	}
}

#[cfg(any(test, feature = "test-support"))]
pub fn a_loopback_webhook() -> Webhook {
	Webhook::new(Some(SocketAddr::from(([127, 0, 0, 1], 45_367))), watch::channel(false).0)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_bound_webhook_names_its_routine_and_mission_calls_and_an_unbound_one_names_none() {
		let address = SocketAddr::from(([127, 0, 0, 1], 45_367));
		let bound = Webhook::new(Some(address), watch::channel(false).0);
		let unbound = Webhook::new(None, watch::channel(false).0);

		assert_eq!(bound.url().as_deref(), Some("http://127.0.0.1:45367/routines/call"));
		assert_eq!(bound.mission_url().as_deref(), Some("http://127.0.0.1:45367/missions/call"));
		assert_eq!(bound.origin().as_deref(), Some("http://127.0.0.1:45367"));
		assert_eq!(unbound.url(), None);
		assert_eq!(unbound.mission_url(), None);
	}
}
