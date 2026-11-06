use serde::{Deserialize, Serialize};

use crate::remote_image::FetchRefusal;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryLinkPreview {
	pub url: String,
	pub title: String,
	pub site: String,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub image: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub alt: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub description: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum LibraryLinkPreviewError {
	UnsupportedScheme,
	NotAPage,
	#[serde(rename_all = "camelCase")]
	NetworkFailure {
		status: Option<u16>,
	},
}

impl LibraryLinkPreviewError {
	pub fn kind(&self) -> &'static str {
		match self {
			LibraryLinkPreviewError::UnsupportedScheme => "unsupportedScheme",
			LibraryLinkPreviewError::NotAPage => "notAPage",
			LibraryLinkPreviewError::NetworkFailure { .. } => "networkFailure",
		}
	}
}

impl From<reqwest::Error> for LibraryLinkPreviewError {
	fn from(error: reqwest::Error) -> Self {
		LibraryLinkPreviewError::NetworkFailure {
			status: error.status().map(|status| status.as_u16()),
		}
	}
}

impl From<FetchRefusal> for LibraryLinkPreviewError {
	fn from(refusal: FetchRefusal) -> Self {
		match refusal {
			FetchRefusal::UnsupportedScheme => LibraryLinkPreviewError::UnsupportedScheme,
			FetchRefusal::NetworkFailure { status } => {
				LibraryLinkPreviewError::NetworkFailure { status }
			}
			FetchRefusal::PrivateAddress => {
				LibraryLinkPreviewError::NetworkFailure { status: None }
			}
		}
	}
}
