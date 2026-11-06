use serde::{Deserialize, Serialize};

use std::error::Error;
use std::fmt;

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
			FetchRefusal::PrivateAddress => RemoteImageError::NetworkFailure { status: None },
		}
	}
}

pub enum FetchRefusal {
	UnsupportedScheme,
	PrivateAddress,
	NetworkFailure { status: Option<u16> },
}

impl From<reqwest::Error> for FetchRefusal {
	fn from(error: reqwest::Error) -> Self {
		if resolved_to_a_private_address(&error) {
			return FetchRefusal::PrivateAddress;
		}
		FetchRefusal::NetworkFailure { status: error.status().map(|status| status.as_u16()) }
	}
}

fn resolved_to_a_private_address(error: &(dyn Error + 'static)) -> bool {
	let mut cause = Some(error);
	while let Some(current) = cause {
		if current.is::<ResolvedToPrivateAddress>() {
			return true;
		}
		cause = current.source();
	}
	false
}

pub struct FetchedImage {
	pub media_type: String,
	pub bytes: Vec<u8>,
}

#[derive(Debug)]
pub struct ResolvedToPrivateAddress;

impl fmt::Display for ResolvedToPrivateAddress {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.write_str("the name resolves to a private address")
	}
}

impl Error for ResolvedToPrivateAddress {}
