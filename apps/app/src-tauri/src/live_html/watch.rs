#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Guard {
	Navigation,
	NewWindow,
	Download,
}

impl Guard {
	pub fn handler(self) -> &'static str {
		match self {
			Self::Navigation => "on_navigation",
			Self::NewWindow => "on_new_window",
			Self::Download => "on_download",
		}
	}
}

pub struct ReceivedRequest<'a> {
	pub method: &'a str,
	pub target: &'a str,
	pub cookie: Option<&'a str>,
	pub body: &'a str,
}

pub trait ViewWatch: Send + Sync {
	fn initialization_scripts(&self) -> Vec<String>;
	fn guard_answered(&self, view: &str, guard: Guard, url: &str, is_allowed: bool);
	fn request_received(&self, view: &str, request: &ReceivedRequest<'_>);
}

pub struct LoggedWatch;

impl ViewWatch for LoggedWatch {
	fn initialization_scripts(&self) -> Vec<String> {
		Vec::new()
	}

	fn guard_answered(&self, view: &str, guard: Guard, url: &str, is_allowed: bool) {
		if !is_allowed {
			log::warn!(
				"live view {view}: {} refused a request to {}",
				guard.handler(),
				tauri::Url::parse(url)
					.ok()
					.and_then(|url| url.host_str().map(str::to_owned))
					.unwrap_or_else(|| "a url without a host".to_owned())
			);
		}
	}

	fn request_received(&self, view: &str, request: &ReceivedRequest<'_>) {
		if let Some(directive) = super::server::reported_directive(request) {
			log::warn!("live view {view}: the content broke its policy on {directive}");
		}
	}
}
