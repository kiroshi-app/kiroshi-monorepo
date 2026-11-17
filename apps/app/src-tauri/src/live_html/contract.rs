use serde::{Deserialize, Serialize};

pub const MEASURED_EVENT: &str = "live-html://measured";

#[derive(Debug, Clone, Copy, PartialEq, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LiveHtmlRectangle {
	pub x: f64,
	pub y: f64,
	pub width: f64,
	pub height: f64,
}

impl LiveHtmlRectangle {
	pub(crate) fn is_valid(self) -> bool {
		[self.x, self.y, self.width, self.height].iter().all(|length| length.is_finite())
			&& self.width >= 0.0
			&& self.height >= 0.0
	}
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LiveHtmlMeasured {
	pub id: String,
	pub width: f64,
	pub height: f64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LiveHtmlError {
	NotAvailableHere,
	#[serde(rename_all = "camelCase")]
	UnknownView {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	AlreadyShown {
		id: String,
	},
	InvalidRectangle,
	MainWindowMissing,
	#[serde(rename_all = "camelCase")]
	Unserved {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unplaced {
		detail: String,
	},
	OutsideAttachments,
	NotHtml,
	#[serde(rename_all = "camelCase")]
	TooLarge {
		bytes: u64,
		limit: u64,
	},
	#[serde(rename_all = "camelCase")]
	Unreadable {
		detail: String,
	},
}
