use reqwest::StatusCode;
use serde::{Deserialize, Serialize};

use crate::account::cloud::DeviceCallError;

pub const APPROVAL_CHANGED_EVENT: &str = "device://approval-changed";

pub const APPROVAL_REQUESTED_EVENT: &str = "device://approval-requested";

pub const APPROVAL_SETTLED_EVENT: &str = "device://approval-settled";

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeviceApproval {
	#[default]
	None,
	Approved,
	#[serde(rename_all = "camelCase")]
	Pending {
		expires_at: String,
	},
	Expired,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum DeviceKind {
	Phone,
	Computer,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum DeviceStatus {
	Pending,
	Approved,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct AccountDevice {
	pub id: String,
	pub name: Option<String>,
	pub kind: DeviceKind,
	pub status: DeviceStatus,
	pub approval_expires_at: Option<String>,
	pub last_active_at: String,
	pub current: bool,
	pub fingerprint: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceApprovalRequested {
	pub device_id: String,
	pub name: Option<String>,
	pub kind: DeviceKind,
	pub asked_at: String,
	pub expires_at: String,
	pub fingerprint: Option<Vec<String>>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceApprovalSettled {
	pub device_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeviceError {
	NotApproved,
	AlreadyApproved,
	IsCurrent,
	ApprovalExpired,
	CodeInvalid,
	TooManyRequests,
	NotFound,
	EmailUnavailable,
	SignedOut,
	#[serde(rename_all = "camelCase")]
	Unreachable {
		detail: String,
	},
}

impl From<DeviceCallError> for DeviceError {
	fn from(failure: DeviceCallError) -> Self {
		let DeviceCallError::Refused { status, code } = &failure else {
			return match failure {
				DeviceCallError::Revoked => DeviceError::SignedOut,
				_ => DeviceError::Unreachable { detail: failure.to_string() },
			};
		};
		match (*status, code.as_deref()) {
			(StatusCode::FORBIDDEN, Some("DEVICE_NOT_APPROVED")) => DeviceError::NotApproved,
			(StatusCode::CONFLICT, Some("DEVICE_ALREADY_APPROVED")) => DeviceError::AlreadyApproved,
			(StatusCode::CONFLICT, Some("DEVICE_IS_CURRENT")) => DeviceError::IsCurrent,
			(StatusCode::GONE, Some("DEVICE_APPROVAL_EXPIRED")) => DeviceError::ApprovalExpired,
			(StatusCode::BAD_REQUEST, Some("DEVICE_CODE_INVALID" | "VALIDATION_ERROR")) => {
				DeviceError::CodeInvalid
			}
			(StatusCode::TOO_MANY_REQUESTS, _) => DeviceError::TooManyRequests,
			(StatusCode::NOT_FOUND, _) => DeviceError::NotFound,
			(StatusCode::SERVICE_UNAVAILABLE, _) => DeviceError::EmailUnavailable,
			_ => DeviceError::Unreachable { detail: failure.to_string() },
		}
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value};

	use super::*;

	fn refused(status: StatusCode, code: &str) -> DeviceError {
		DeviceError::from(DeviceCallError::Refused { status, code: Some(code.to_owned()) })
	}

	#[test]
	fn the_approval_crosses_tagged_on_kind() {
		let pending = DeviceApproval::Pending { expires_at: "2099-01-01T00:30:00.000Z".to_owned() };

		assert_eq!(to_value(DeviceApproval::None).expect("serializes"), json!({ "kind": "none" }));
		assert_eq!(
			to_value(pending).expect("serializes"),
			json!({ "kind": "pending", "expiresAt": "2099-01-01T00:30:00.000Z" })
		);
		assert_eq!(
			to_value(DeviceApproval::Expired).expect("serializes"),
			json!({ "kind": "expired" })
		);
	}

	#[test]
	fn every_relay_refusal_reads_as_its_typed_error() {
		assert_eq!(refused(StatusCode::FORBIDDEN, "DEVICE_NOT_APPROVED"), DeviceError::NotApproved);
		assert_eq!(
			refused(StatusCode::CONFLICT, "DEVICE_ALREADY_APPROVED"),
			DeviceError::AlreadyApproved
		);
		assert_eq!(refused(StatusCode::CONFLICT, "DEVICE_IS_CURRENT"), DeviceError::IsCurrent);
		assert_eq!(
			refused(StatusCode::GONE, "DEVICE_APPROVAL_EXPIRED"),
			DeviceError::ApprovalExpired
		);
		assert_eq!(
			refused(StatusCode::BAD_REQUEST, "DEVICE_CODE_INVALID"),
			DeviceError::CodeInvalid
		);
		assert_eq!(refused(StatusCode::BAD_REQUEST, "VALIDATION_ERROR"), DeviceError::CodeInvalid);
		assert_eq!(
			refused(StatusCode::TOO_MANY_REQUESTS, "TOO_MANY_REQUESTS"),
			DeviceError::TooManyRequests
		);
		assert_eq!(refused(StatusCode::NOT_FOUND, "NOT_FOUND"), DeviceError::NotFound);
		assert_eq!(
			refused(StatusCode::SERVICE_UNAVAILABLE, "SERVICE_UNAVAILABLE"),
			DeviceError::EmailUnavailable
		);
		assert_eq!(DeviceError::from(DeviceCallError::Revoked), DeviceError::SignedOut);
		assert_eq!(
			to_value(refused(StatusCode::INTERNAL_SERVER_ERROR, "INTERNAL_ERROR"))
				.expect("serializes"),
			json!({ "kind": "unreachable", "detail": "the relay answered 500 INTERNAL_ERROR" })
		);
	}
}
