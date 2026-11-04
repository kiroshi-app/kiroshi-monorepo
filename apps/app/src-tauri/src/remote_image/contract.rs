use serde::{Deserialize, Serialize};

use super::FetchRefusal;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct RemoteImage {
	pub media_type: String,
	pub base64: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RemoteImageError {
	UnsupportedScheme,
	#[serde(rename_all = "camelCase")]
	TooLarge {
		limit: u64,
	},
	NotAnImage,
	#[serde(rename_all = "camelCase")]
	NetworkFailure {
		status: Option<u16>,
	},
}

impl RemoteImageError {
	pub fn kind(&self) -> &'static str {
		match self {
			RemoteImageError::UnsupportedScheme => "unsupportedScheme",
			RemoteImageError::TooLarge { .. } => "tooLarge",
			RemoteImageError::NotAnImage => "notAnImage",
			RemoteImageError::NetworkFailure { .. } => "networkFailure",
		}
	}
}

impl From<reqwest::Error> for RemoteImageError {
	fn from(error: reqwest::Error) -> Self {
		RemoteImageError::NetworkFailure { status: error.status().map(|status| status.as_u16()) }
	}
}

impl From<FetchRefusal> for RemoteImageError {
	fn from(refusal: FetchRefusal) -> Self {
		match refusal {
			FetchRefusal::UnsupportedScheme => RemoteImageError::UnsupportedScheme,
			FetchRefusal::NetworkFailure { status } => RemoteImageError::NetworkFailure { status },
		}
	}
}
