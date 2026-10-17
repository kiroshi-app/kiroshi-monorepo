use hkdf::Hkdf;
use sha2::Sha256;

use super::device_keys::{DeviceId, KEY_LENGTH};

pub const SUBKEY_SALT: [u8; 32] = [
	0x16, 0x39, 0x7f, 0x8b, 0x30, 0xf5, 0xe1, 0xc3, 0xad, 0x8f, 0x36, 0x25, 0x24, 0xdf, 0xb6, 0xae,
	0xc0, 0x17, 0xd3, 0xc6, 0x5c, 0x22, 0x4b, 0xe8, 0xf2, 0xd7, 0x54, 0x50, 0xb6, 0xc1, 0xa5, 0x95,
];
const INFO_PREFIX: &[u8] = b"kiroshi/v2";

pub type SpaceKey = [u8; KEY_LENGTH];

pub struct Subkey([u8; KEY_LENGTH]);

impl Subkey {
	pub fn derive(space_key: &SpaceKey, key_id: u32, sender: &DeviceId) -> Self {
		let info = [INFO_PREFIX, &key_id.to_be_bytes(), sender.as_bytes()].concat();
		let mut subkey = [0u8; KEY_LENGTH];
		Hkdf::<Sha256>::new(Some(&SUBKEY_SALT), space_key)
			.expand(&info, &mut subkey)
			.expect("32 bytes is within the HKDF-SHA256 output limit");
		Self(subkey)
	}

	pub fn from_bytes(bytes: [u8; KEY_LENGTH]) -> Self {
		Self(bytes)
	}

	pub fn as_bytes(&self) -> &[u8; KEY_LENGTH] {
		&self.0
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use sha2::Digest;

	#[test]
	fn the_salt_is_the_digest_the_spec_names() {
		assert_eq!(sha2::Sha256::digest(b"kiroshi/v2/subkey").as_slice(), SUBKEY_SALT);
	}
}
