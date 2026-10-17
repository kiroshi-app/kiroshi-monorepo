use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tauri::{AppHandle, Manager, Runtime, State};

use std::path::PathBuf;

use super::contract::{DeviceIdentity, DeviceKeysError};
use super::device_keys::DeviceKeys;
use super::fingerprint::fingerprint;
use super::key_store::{load_or_create, FileStore, KeyStore};
use super::space_key::HeldSpaceKey;
use crate::logging::commands::install_kind;
use crate::logging::contract::InstallKind;

const DEVICE_KEYS_ITEM: &str = "device-keys";

const SPACE_KEY_ITEM_PREFIX: &str = "space-key-";

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
			let system = system_store(install_kind(identifier), identifier, DEVICE_KEYS_ITEM);
			load_or_create(system.as_deref(), &FileStore::at(profile.join(DEVICE_KEYS_ITEM)))
		},
	);
	if let Err(failure) = &keys {
		log::error!("the device keys are unavailable: {failure:?}");
	}
	DeviceKeysState(keys)
}

pub struct SpaceKeys {
	kind: InstallKind,
	service: String,
	directory: Option<PathBuf>,
}

impl SpaceKeys {
	pub fn new(kind: InstallKind, service: String, directory: Option<PathBuf>) -> Self {
		Self { kind, service, directory }
	}

	pub fn held(&self, space_id: &str) -> Result<Option<HeldSpaceKey>, DeviceKeysError> {
		let held = self.store(space_id)?.read()?;
		held.map(|item| HeldSpaceKey::of_item(&item)).transpose()
	}

	pub fn stored(&self, space_id: &str, key: &HeldSpaceKey) -> Result<(), DeviceKeysError> {
		self.store(space_id)?.write(&key.item())
	}

	fn store(&self, space_id: &str) -> Result<Box<dyn KeyStore>, DeviceKeysError> {
		if space_id.is_empty() || !space_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
			return Err(DeviceKeysError::Malformed);
		}
		let item = format!("{SPACE_KEY_ITEM_PREFIX}{space_id}");
		if let Some(system) = system_store(self.kind, &self.service, &item) {
			return Ok(system);
		}
		let directory = self.directory.as_ref().ok_or(DeviceKeysError::NoProfileDirectory)?;
		Ok(Box::new(FileStore::at(directory.join(item))))
	}
}

pub fn space_keys<R: Runtime>(app: &AppHandle<R>) -> SpaceKeys {
	let identifier = app.config().identifier.clone();
	let directory = app.path().app_data_dir().ok();
	SpaceKeys::new(install_kind(&identifier), identifier, directory)
}

#[cfg(target_os = "macos")]
fn system_store(kind: InstallKind, service: &str, item: &str) -> Option<Box<dyn KeyStore>> {
	match kind {
		InstallKind::Dev => None,
		InstallKind::Installed => {
			Some(Box::new(super::key_store::KeychainStore::item(service, item)))
		}
	}
}

#[cfg(not(target_os = "macos"))]
fn system_store(_kind: InstallKind, _service: &str, _item: &str) -> Option<Box<dyn KeyStore>> {
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
		assert!(system_store(InstallKind::Dev, "com.kiroshi.app.dev", DEVICE_KEYS_ITEM).is_none());
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn an_installed_macos_build_keeps_its_keys_in_the_keychain() {
		let store = system_store(InstallKind::Installed, "com.kiroshi.app", DEVICE_KEYS_ITEM);
		assert_eq!(store.map(|store| store.name()), Some("Keychain"));
	}

	#[cfg(not(target_os = "macos"))]
	#[test]
	fn an_installed_build_off_macos_keeps_its_keys_in_the_file() {
		assert!(system_store(InstallKind::Installed, "com.kiroshi.app", DEVICE_KEYS_ITEM).is_none());
	}

	#[cfg(unix)]
	#[test]
	fn a_dev_profile_keeps_a_space_key_in_an_owner_only_file_and_reads_it_back() {
		use std::os::unix::fs::PermissionsExt;

		let profile = crate::removed_on_drop::RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-space-keys-{}", uuid::Uuid::new_v4())),
		);
		let keys = SpaceKeys::new(
			InstallKind::Dev,
			"com.kiroshi.app.dev".to_owned(),
			Some(profile.to_path_buf()),
		);
		assert!(keys.held("s-1").expect("the store reads").is_none());
		let first = HeldSpaceKey::first().expect("randomness");
		keys.stored("s-1", &first).expect("the key is stored");

		let held = keys.held("s-1").expect("the store reads").expect("a key");
		let mode = std::fs::metadata(profile.join("space-key-s-1"))
			.expect("the file")
			.permissions()
			.mode();
		assert_eq!((held.key_id, *held.key), (first.key_id, *first.key));
		assert_eq!(mode & 0o777, 0o600);
	}

	#[test]
	fn a_space_id_that_could_leave_the_profile_names_no_key_item() {
		let keys = SpaceKeys::new(
			InstallKind::Dev,
			"com.kiroshi.app.dev".to_owned(),
			Some(std::env::temp_dir()),
		);
		for space_id in ["", "../s", "s/1"] {
			assert!(matches!(keys.held(space_id), Err(DeviceKeysError::Malformed)), "{space_id}");
		}
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
