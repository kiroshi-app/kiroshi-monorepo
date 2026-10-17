use std::path::PathBuf;

use super::contract::DeviceKeysError;
use super::device_keys::{DeviceKeys, DeviceSecret};
use crate::private_files;

pub trait KeyStore {
	fn name(&self) -> &'static str;
	fn read(&self) -> Result<Option<DeviceSecret>, DeviceKeysError>;
	fn write(&self, secret: &DeviceSecret) -> Result<(), DeviceKeysError>;
}

pub fn load_or_create(
	system: Option<&dyn KeyStore>,
	file: &FileStore,
) -> Result<DeviceKeys, DeviceKeysError> {
	let Some(system) = system else {
		return held_or_created(file);
	};
	match system.read() {
		Ok(Some(secret)) => return Ok(DeviceKeys::from_secret(&secret)),
		Ok(None) => {}
		Err(failure) => {
			log::warn!(
				"the {} did not read the device keys, the file store holds them: {failure:?}",
				system.name()
			);
			return held_or_created(file);
		}
	}
	if let Some(secret) = file.read()? {
		return Ok(DeviceKeys::from_secret(&secret));
	}
	let keys = DeviceKeys::generate().map_err(|_| DeviceKeysError::NoRandomness)?;
	if let Err(failure) = system.write(&keys.secret()) {
		log::warn!(
			"the {} did not store the device keys, the file store holds them: {failure:?}",
			system.name()
		);
		file.write(&keys.secret())?;
	}
	Ok(keys)
}

fn held_or_created(store: &dyn KeyStore) -> Result<DeviceKeys, DeviceKeysError> {
	if let Some(secret) = store.read()? {
		return Ok(DeviceKeys::from_secret(&secret));
	}
	let keys = DeviceKeys::generate().map_err(|_| DeviceKeysError::NoRandomness)?;
	store.write(&keys.secret())?;
	Ok(keys)
}

fn secret_of(bytes: &[u8]) -> Result<DeviceSecret, DeviceKeysError> {
	DeviceSecret::try_from(bytes).map_err(|_| DeviceKeysError::Malformed)
}

pub struct FileStore {
	path: PathBuf,
}

impl FileStore {
	pub fn at(path: PathBuf) -> Self {
		Self { path }
	}
}

impl KeyStore for FileStore {
	fn name(&self) -> &'static str {
		"file store"
	}

	fn read(&self) -> Result<Option<DeviceSecret>, DeviceKeysError> {
		match std::fs::read(&self.path) {
			Ok(bytes) => secret_of(&bytes).map(Some),
			Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
			Err(error) => Err(DeviceKeysError::Unreadable { detail: error.to_string() }),
		}
	}

	fn write(&self, secret: &DeviceSecret) -> Result<(), DeviceKeysError> {
		private_files::replace_atomically(&self.path, secret)
			.map_err(|error| DeviceKeysError::Unwritable { detail: error.to_string() })
	}
}

#[cfg(target_os = "macos")]
pub struct KeychainStore {
	service: String,
}

#[cfg(target_os = "macos")]
impl KeychainStore {
	const ACCOUNT: &'static str = "device-keys";
	const ITEM_NOT_FOUND: i32 = -25300;

	pub fn for_service(service: &str) -> Self {
		Self { service: service.to_owned() }
	}
}

#[cfg(target_os = "macos")]
impl KeyStore for KeychainStore {
	fn name(&self) -> &'static str {
		"Keychain"
	}

	fn read(&self) -> Result<Option<DeviceSecret>, DeviceKeysError> {
		match security_framework::passwords::get_generic_password(&self.service, Self::ACCOUNT) {
			Ok(bytes) => secret_of(&bytes).map(Some),
			Err(error) if error.code() == Self::ITEM_NOT_FOUND => Ok(None),
			Err(error) => Err(DeviceKeysError::Unreadable { detail: error.to_string() }),
		}
	}

	fn write(&self, secret: &DeviceSecret) -> Result<(), DeviceKeysError> {
		security_framework::passwords::set_generic_password(&self.service, Self::ACCOUNT, secret)
			.map_err(|error| DeviceKeysError::Unwritable { detail: error.to_string() })
	}
}

#[cfg(test)]
mod tests {
	use std::cell::{Cell, RefCell};

	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	#[derive(Default)]
	struct SystemStore {
		held: RefCell<Option<DeviceSecret>>,
		is_unreadable: bool,
		is_unwritable: bool,
		reads: Cell<usize>,
	}

	impl KeyStore for SystemStore {
		fn name(&self) -> &'static str {
			"system store"
		}

		fn read(&self) -> Result<Option<DeviceSecret>, DeviceKeysError> {
			self.reads.set(self.reads.get() + 1);
			if self.is_unreadable {
				return Err(DeviceKeysError::Unreadable { detail: "locked".to_owned() });
			}
			Ok(*self.held.borrow())
		}

		fn write(&self, secret: &DeviceSecret) -> Result<(), DeviceKeysError> {
			if self.is_unwritable {
				return Err(DeviceKeysError::Unwritable { detail: "denied".to_owned() });
			}
			*self.held.borrow_mut() = Some(*secret);
			Ok(())
		}
	}

	fn a_profile() -> RemovedOnDrop {
		RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-device-keys-{}", uuid::Uuid::new_v4())),
		)
	}

	fn file_in(profile: &RemovedOnDrop) -> FileStore {
		FileStore::at(profile.join("device-keys"))
	}

	fn device_id_of(keys: Result<DeviceKeys, DeviceKeysError>) -> String {
		keys.expect("the device keys load").device_id().to_string()
	}

	#[test]
	fn a_first_start_creates_keys_and_the_next_start_answers_the_same_device_id() {
		let profile = a_profile();
		let first = device_id_of(load_or_create(None, &file_in(&profile)));
		let second = device_id_of(load_or_create(None, &file_in(&profile)));
		assert_eq!(first, second);
	}

	#[cfg(unix)]
	#[test]
	fn the_file_store_is_readable_by_its_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let profile = a_profile();
		load_or_create(None, &file_in(&profile)).expect("the device keys load");
		let mode =
			std::fs::metadata(profile.join("device-keys")).expect("the file").permissions().mode();
		assert_eq!(mode & 0o777, 0o600);
	}

	#[test]
	fn a_system_store_holds_the_created_keys_and_the_file_stays_empty() {
		let profile = a_profile();
		let system = SystemStore::default();
		let first = device_id_of(load_or_create(Some(&system), &file_in(&profile)));
		assert!(system.held.borrow().is_some());
		assert_eq!(file_in(&profile).read(), Ok(None));
		assert_eq!(device_id_of(load_or_create(Some(&system), &file_in(&profile))), first);
	}

	#[test]
	fn an_unreadable_system_store_falls_back_to_the_file() {
		let profile = a_profile();
		let system = SystemStore { is_unreadable: true, ..SystemStore::default() };
		let first = device_id_of(load_or_create(Some(&system), &file_in(&profile)));
		assert!(file_in(&profile).read().expect("the file reads").is_some());
		assert_eq!(device_id_of(load_or_create(Some(&system), &file_in(&profile))), first);
	}

	#[test]
	fn an_unwritable_system_store_falls_back_to_the_file_and_the_next_start_finds_it() {
		let profile = a_profile();
		let system = SystemStore { is_unwritable: true, ..SystemStore::default() };
		let first = device_id_of(load_or_create(Some(&system), &file_in(&profile)));
		assert!(file_in(&profile).read().expect("the file reads").is_some());
		assert_eq!(device_id_of(load_or_create(Some(&system), &file_in(&profile))), first);
	}

	#[test]
	fn a_malformed_file_is_refused_and_left_in_place() {
		let profile = a_profile();
		private_files::write(&profile.join("device-keys"), b"short").expect("the file is planted");
		assert!(matches!(
			load_or_create(None, &file_in(&profile)),
			Err(DeviceKeysError::Malformed)
		));
		assert_eq!(std::fs::read(profile.join("device-keys")).expect("the file"), b"short");
	}

	#[test]
	fn the_file_store_is_not_read_while_the_system_store_answers() {
		let profile = a_profile();
		private_files::write(&profile.join("device-keys"), b"short").expect("the file is planted");
		let system = SystemStore::default();
		*system.held.borrow_mut() = Some([3; 64]);
		let loaded = load_or_create(Some(&system), &file_in(&profile));
		assert_eq!(device_id_of(loaded), DeviceKeys::from_secret(&[3; 64]).device_id().to_string());
		assert_eq!(system.reads.get(), 1);
	}
}
