use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::{AppHandle, Manager, Runtime, State};

use super::contract::{DeviceIdentity, DeviceKeysError};
use super::device_keys::DeviceKeys;
use super::fingerprint::fingerprint;
use super::key_store::{load_or_create, FileStore, KeyStore};
use crate::logging::commands::install_kind;
use crate::logging::contract::InstallKind;

const KEYS_FILE: &str = "device-keys";

pub struct DeviceKeysState(Result<DeviceKeys, DeviceKeysError>);

impl DeviceKeysState {
	pub fn new(keys: Result<DeviceKeys, DeviceKeysError>) -> Self {
		Self(keys)
	}

	pub fn keys(&self) -> Result<&DeviceKeys, DeviceKeysError> {
		self.0.as_ref().map_err(Clone::clone)
	}
}

pub fn load<R: Runtime>(app: &AppHandle<R>) -> DeviceKeysState {
	let keys = app.path().app_data_dir().map_err(|_| DeviceKeysError::NoProfileDirectory).and_then(
		|profile| {
			let identifier = &app.config().identifier;
			let system = system_store(install_kind(identifier), identifier);
			load_or_create(system.as_deref(), &FileStore::at(profile.join(KEYS_FILE)))
		},
	);
	if let Err(failure) = &keys {
		log::error!("the device keys are unavailable: {failure:?}");
	}
	DeviceKeysState(keys)
}

#[cfg(target_os = "macos")]
fn system_store(kind: InstallKind, service: &str) -> Option<Box<dyn KeyStore>> {
	match kind {
		InstallKind::Dev => None,
		InstallKind::Installed => {
			Some(Box::new(super::key_store::KeychainStore::for_service(service)))
		}
	}
}

#[cfg(not(target_os = "macos"))]
fn system_store(_kind: InstallKind, _service: &str) -> Option<Box<dyn KeyStore>> {
	None
}

#[tauri::command]
#[specta::specta]
pub fn get_device_identity(
	state: State<'_, DeviceKeysState>,
) -> Result<DeviceIdentity, DeviceKeysError> {
	state.keys().map(identity_of)
}

pub fn identity_of(keys: &DeviceKeys) -> DeviceIdentity {
	let signing = keys.signing_public();
	DeviceIdentity {
		device_id: keys.device_id().to_string(),
		signing_public_key: STANDARD.encode(signing.as_bytes()),
		agreement_public_key: STANDARD.encode(keys.agreement_public().as_bytes()),
		fingerprint: fingerprint(&signing).map(str::to_owned).to_vec(),
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_dev_profile_never_reaches_a_system_store() {
		assert!(system_store(InstallKind::Dev, "com.kiroshi.app.dev").is_none());
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn an_installed_macos_build_keeps_its_keys_in_the_keychain() {
		let store = system_store(InstallKind::Installed, "com.kiroshi.app");
		assert_eq!(store.map(|store| store.name()), Some("Keychain"));
	}

	#[cfg(not(target_os = "macos"))]
	#[test]
	fn an_installed_build_off_macos_keeps_its_keys_in_the_file() {
		assert!(system_store(InstallKind::Installed, "com.kiroshi.app").is_none());
	}

	#[test]
	fn the_identity_names_the_public_keys_and_never_a_private_one() {
		let keys = DeviceKeys::generate().expect("randomness");
		let answered = serde_json::to_value(identity_of(&keys)).expect("the identity serialises");
		let mut fields: Vec<&str> =
			answered.as_object().expect("an object").keys().map(String::as_str).collect();
		fields.sort_unstable();
		assert_eq!(fields, ["agreementPublicKey", "deviceId", "fingerprint", "signingPublicKey"]);
		let secret = keys.secret();
		let private_keys = [STANDARD.encode(&secret[..32]), STANDARD.encode(&secret[32..])];
		let text = answered.to_string();
		assert!(private_keys.iter().all(|private| !text.contains(private.as_str())));
		assert_eq!(answered["fingerprint"].as_array().map(Vec::len), Some(6));
	}
}
