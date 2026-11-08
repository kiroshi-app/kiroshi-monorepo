use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use tokio::sync::watch;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use super::code_signature::{running_signature, Signature};
use super::contract::{DeviceIdentity, DeviceKeysError};
use super::device_keys::DeviceKeys;
use super::fingerprint::fingerprint;
use super::key_store::{load_or_create, FileStore, KeyStore};
use super::space_key::HeldSpaceKey;
use crate::logging::contract::InstallKind;
use crate::logging::install_kind;

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

pub fn load(core: &crate::core_context::Core) -> DeviceKeysState {
	let keys = Ok::<_, DeviceKeysError>(core.data_dir().to_path_buf()).and_then(|profile| {
		let identifier = core.identifier();
		let choice = key_store_choice(install_kind(identifier), running_signature());
		log::info!("the device keys and space keys live in the {}", choice.reason());
		let system = system_store(choice, identifier, DEVICE_KEYS_ITEM);
		load_or_create(system.as_deref(), &FileStore::at(profile.join(DEVICE_KEYS_ITEM)))
	});
	if let Err(failure) = &keys {
		log::error!("the device keys are unavailable: {failure:?}");
	}
	DeviceKeysState(keys)
}

pub type CurrentSpaceKey = watch::Receiver<Arc<HeldSpaceKey>>;

pub struct SpaceKeys {
	kind: InstallKind,
	service: String,
	directory: Option<PathBuf>,
	current: Mutex<HashMap<String, watch::Sender<Arc<HeldSpaceKey>>>>,
}

impl SpaceKeys {
	pub fn new(kind: InstallKind, service: String, directory: Option<PathBuf>) -> Self {
		Self { kind, service, directory, current: Mutex::new(HashMap::new()) }
	}

	pub fn held(&self, space_id: &str) -> Result<Option<HeldSpaceKey>, DeviceKeysError> {
		let held = self.store(space_id)?.read()?;
		held.map(|item| HeldSpaceKey::of_item(&item)).transpose()
	}

	pub fn watched(&self, space_id: &str) -> Result<Option<CurrentSpaceKey>, DeviceKeysError> {
		let mut current = self.current();
		if let Some(sender) = current.get(space_id) {
			return Ok(Some(sender.subscribe()));
		}
		let Some(held) = self.held(space_id)? else {
			return Ok(None);
		};
		let (sender, receiver) = watch::channel(Arc::new(held));
		current.insert(space_id.to_owned(), sender);
		Ok(Some(receiver))
	}

	pub fn stored(&self, space_id: &str, key: HeldSpaceKey) -> Result<(), DeviceKeysError> {
		let mut current = self.current();
		self.store(space_id)?.write(&key.item())?;
		match current.get(space_id) {
			Some(sender) => {
				sender.send_replace(Arc::new(key));
			}
			None => {
				current.insert(space_id.to_owned(), watch::channel(Arc::new(key)).0);
			}
		}
		Ok(())
	}

	fn current(&self) -> MutexGuard<'_, HashMap<String, watch::Sender<Arc<HeldSpaceKey>>>> {
		self.current.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn store(&self, space_id: &str) -> Result<Box<dyn KeyStore>, DeviceKeysError> {
		if space_id.is_empty() || !space_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-') {
			return Err(DeviceKeysError::Malformed);
		}
		let item = format!("{SPACE_KEY_ITEM_PREFIX}{space_id}");
		let choice = key_store_choice(self.kind, running_signature());
		if let Some(system) = system_store(choice, &self.service, &item) {
			return Ok(system);
		}
		let directory = self.directory.as_ref().ok_or(DeviceKeysError::NoProfileDirectory)?;
		Ok(Box::new(FileStore::at(directory.join(item))))
	}
}

pub fn space_keys(core: &crate::core_context::Core) -> SpaceKeys {
	let identifier = core.identifier().to_owned();
	let directory = Some(core.data_dir().to_path_buf());
	SpaceKeys::new(install_kind(&identifier), identifier, directory)
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum KeyStoreChoice {
	Keychain,
	FileForDev,
	FileForUnsigned,
	FileForUnverified,
}

impl KeyStoreChoice {
	fn reason(self) -> &'static str {
		match self {
			Self::Keychain => "Keychain: an installed build signed with a Team ID",
			Self::FileForDev => "file store: a dev build",
			Self::FileForUnsigned => "file store: the executable carries no Team ID signature",
			Self::FileForUnverified => "file store: the code signature could not be checked",
		}
	}
}

fn key_store_choice(kind: InstallKind, signature: Signature) -> KeyStoreChoice {
	match (kind, signature) {
		(InstallKind::Dev, _) => KeyStoreChoice::FileForDev,
		(InstallKind::Installed, Signature::TeamSigned) => KeyStoreChoice::Keychain,
		(InstallKind::Installed, Signature::Unsigned) => KeyStoreChoice::FileForUnsigned,
		(InstallKind::Installed, Signature::Unverified) => KeyStoreChoice::FileForUnverified,
	}
}

#[cfg(target_os = "macos")]
fn system_store(choice: KeyStoreChoice, service: &str, item: &str) -> Option<Box<dyn KeyStore>> {
	match choice {
		KeyStoreChoice::Keychain => {
			Some(Box::new(super::key_store::KeychainStore::item(service, item)))
		}
		KeyStoreChoice::FileForDev
		| KeyStoreChoice::FileForUnsigned
		| KeyStoreChoice::FileForUnverified => None,
	}
}

#[cfg(not(target_os = "macos"))]
fn system_store(_choice: KeyStoreChoice, _service: &str, _item: &str) -> Option<Box<dyn KeyStore>> {
	None
}

pub fn get_device_identity(
	core: &crate::core_context::Core,
) -> Result<DeviceIdentity, DeviceKeysError> {
	let state = core.state::<DeviceKeysState>();
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
	use crate::crypto::space_key::FIRST_KEY_ID;

	#[test]
	fn only_an_installed_build_signed_with_a_team_id_chooses_the_keychain() {
		let chosen = [
			(InstallKind::Installed, Signature::TeamSigned, KeyStoreChoice::Keychain),
			(InstallKind::Installed, Signature::Unsigned, KeyStoreChoice::FileForUnsigned),
			(InstallKind::Installed, Signature::Unverified, KeyStoreChoice::FileForUnverified),
			(InstallKind::Dev, Signature::TeamSigned, KeyStoreChoice::FileForDev),
			(InstallKind::Dev, Signature::Unsigned, KeyStoreChoice::FileForDev),
			(InstallKind::Dev, Signature::Unverified, KeyStoreChoice::FileForDev),
		];
		for (kind, signature, expected) in chosen {
			assert_eq!(key_store_choice(kind, signature), expected, "{kind:?} {signature:?}");
		}
	}

	#[test]
	fn a_file_choice_never_reaches_a_system_store() {
		let choices = [
			KeyStoreChoice::FileForDev,
			KeyStoreChoice::FileForUnsigned,
			KeyStoreChoice::FileForUnverified,
		];
		for choice in choices {
			assert!(
				system_store(choice, "com.kiroshi.app", DEVICE_KEYS_ITEM).is_none(),
				"{choice:?}"
			);
		}
	}

	#[cfg(target_os = "macos")]
	#[test]
	fn the_keychain_choice_keeps_the_keys_in_the_keychain_on_macos() {
		let store = system_store(KeyStoreChoice::Keychain, "com.kiroshi.app", DEVICE_KEYS_ITEM);
		assert_eq!(store.map(|store| store.name()), Some("Keychain"));
	}

	#[cfg(not(target_os = "macos"))]
	#[test]
	fn the_keychain_choice_off_macos_keeps_the_keys_in_the_file() {
		assert!(
			system_store(KeyStoreChoice::Keychain, "com.kiroshi.app", DEVICE_KEYS_ITEM).is_none()
		);
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
		let first_key = *first.key;
		keys.stored("s-1", first).expect("the key is stored");

		let held = keys.held("s-1").expect("the store reads").expect("a key");
		let mode = std::fs::metadata(profile.join("space-key-s-1"))
			.expect("the file")
			.permissions()
			.mode();
		assert_eq!((held.key_id, *held.key), (FIRST_KEY_ID, first_key));
		assert_eq!(mode & 0o777, 0o600);
	}

	#[test]
	fn a_watched_space_key_follows_every_key_stored_after_it() {
		let profile = crate::removed_on_drop::RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-space-keys-{}", uuid::Uuid::new_v4())),
		);
		let keys = SpaceKeys::new(
			InstallKind::Dev,
			"com.kiroshi.app.dev".to_owned(),
			Some(profile.to_path_buf()),
		);
		assert!(keys.watched("s-1").expect("the store reads").is_none());
		keys.stored("s-1", HeldSpaceKey::first().expect("randomness")).expect("stored");
		let mut watched = keys.watched("s-1").expect("the store reads").expect("a key");
		assert_eq!(watched.borrow_and_update().key_id, FIRST_KEY_ID);

		let next = HeldSpaceKey::under(FIRST_KEY_ID + 1).expect("randomness");
		let next_key = *next.key;
		keys.stored("s-1", next).expect("stored");

		assert!(watched.has_changed().expect("the sender lives"));
		let current = watched.borrow_and_update().clone();
		assert_eq!((current.key_id, *current.key), (FIRST_KEY_ID + 1, next_key));
		let reread = keys.held("s-1").expect("the store reads").expect("a key");
		assert_eq!(reread.key_id, FIRST_KEY_ID + 1);
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
