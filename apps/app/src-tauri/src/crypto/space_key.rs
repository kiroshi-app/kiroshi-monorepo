use zeroize::Zeroizing;

use super::contract::DeviceKeysError;
use super::device_keys::KEY_LENGTH;
use super::randomness::random_bytes;
use super::subkey::SpaceKey;

pub const FIRST_KEY_ID: u32 = 1;
const KEY_ID_LENGTH: usize = 4;

pub struct HeldSpaceKey {
	pub key_id: u32,
	pub key: Zeroizing<SpaceKey>,
}

impl HeldSpaceKey {
	pub fn first() -> Result<Self, DeviceKeysError> {
		Self::under(FIRST_KEY_ID)
	}

	pub fn under(key_id: u32) -> Result<Self, DeviceKeysError> {
		let key = random_bytes::<KEY_LENGTH>().map_err(|_| DeviceKeysError::NoRandomness)?;
		Ok(Self { key_id, key })
	}

	pub(super) fn item(&self) -> Zeroizing<Vec<u8>> {
		Zeroizing::new([self.key_id.to_be_bytes().as_slice(), self.key.as_slice()].concat())
	}

	pub(super) fn of_item(bytes: &[u8]) -> Result<Self, DeviceKeysError> {
		if bytes.len() != KEY_ID_LENGTH + KEY_LENGTH {
			return Err(DeviceKeysError::Malformed);
		}
		let (key_id, key_bytes) = bytes.split_at(KEY_ID_LENGTH);
		let mut key_id_bytes = [0u8; KEY_ID_LENGTH];
		key_id_bytes.copy_from_slice(key_id);
		let mut key = Zeroizing::new([0u8; KEY_LENGTH]);
		key.copy_from_slice(key_bytes);
		Ok(Self { key_id: u32::from_be_bytes(key_id_bytes), key })
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_space_key_reads_back_from_its_item_under_its_key_id() {
		let held = HeldSpaceKey::first().expect("randomness");
		let again = HeldSpaceKey::of_item(&held.item()).expect("the item reads back");
		assert_eq!((again.key_id, *again.key), (FIRST_KEY_ID, *held.key));
	}

	#[test]
	fn an_item_of_another_length_is_refused() {
		assert!(matches!(HeldSpaceKey::of_item(&[1; 35]), Err(DeviceKeysError::Malformed)));
	}
}
