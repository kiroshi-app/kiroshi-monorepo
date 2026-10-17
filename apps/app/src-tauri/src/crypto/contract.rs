use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct DeviceIdentity {
	pub device_id: String,
	pub signing_public_key: String,
	pub agreement_public_key: String,
	pub fingerprint: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DeviceKeysError {
	NoProfileDirectory,
	Unreadable { detail: String },
	Unwritable { detail: String },
	Malformed,
	NoRandomness,
}
