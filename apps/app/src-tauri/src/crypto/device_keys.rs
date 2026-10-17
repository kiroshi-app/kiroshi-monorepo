use std::fmt;

use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

use super::error::CryptoError;
use super::randomness::random_bytes;

pub const KEY_LENGTH: usize = 32;
pub const SECRET_LENGTH: usize = 2 * KEY_LENGTH;
pub const DEVICE_ID_LENGTH: usize = 16;

pub type DeviceSecret = [u8; SECRET_LENGTH];

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct DeviceId([u8; DEVICE_ID_LENGTH]);

impl DeviceId {
	pub fn of(signing: &VerifyingKey) -> Self {
		let digest = Sha256::digest(signing.as_bytes());
		let mut id = [0u8; DEVICE_ID_LENGTH];
		id.copy_from_slice(&digest[..DEVICE_ID_LENGTH]);
		Self(id)
	}

	pub fn from_bytes(bytes: [u8; DEVICE_ID_LENGTH]) -> Self {
		Self(bytes)
	}

	pub fn as_bytes(&self) -> &[u8; DEVICE_ID_LENGTH] {
		&self.0
	}
}

impl fmt::Display for DeviceId {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		self.0.iter().try_for_each(|byte| write!(formatter, "{byte:02x}"))
	}
}

pub struct DeviceKeys {
	signing: SigningKey,
	agreement: StaticSecret,
}

impl DeviceKeys {
	pub fn generate() -> Result<Self, CryptoError> {
		let secret = random_bytes::<SECRET_LENGTH>()?;
		Ok(Self::from_secret(&secret))
	}

	pub fn from_secret(secret: &DeviceSecret) -> Self {
		let (signing_seed, agreement) = secret.split_at(KEY_LENGTH);
		let mut seed = Zeroizing::new([0u8; KEY_LENGTH]);
		seed.copy_from_slice(signing_seed);
		let mut scalar = Zeroizing::new([0u8; KEY_LENGTH]);
		scalar.copy_from_slice(agreement);
		Self { signing: SigningKey::from_bytes(&seed), agreement: StaticSecret::from(*scalar) }
	}

	pub fn secret(&self) -> Zeroizing<DeviceSecret> {
		let mut secret = Zeroizing::new([0u8; SECRET_LENGTH]);
		secret[..KEY_LENGTH].copy_from_slice(self.signing.as_bytes());
		secret[KEY_LENGTH..].copy_from_slice(self.agreement.as_bytes());
		secret
	}

	pub fn signing_public(&self) -> VerifyingKey {
		self.signing.verifying_key()
	}

	pub fn agreement_public(&self) -> PublicKey {
		PublicKey::from(&self.agreement)
	}

	pub fn agreement(&self) -> &StaticSecret {
		&self.agreement
	}

	pub fn device_id(&self) -> DeviceId {
		DeviceId::of(&self.signing_public())
	}

	pub fn sign(&self, message: &[u8]) -> Signature {
		self.signing.sign(message)
	}
}

pub fn verify(
	signer: &VerifyingKey,
	message: &[u8],
	signature: &Signature,
) -> Result<(), CryptoError> {
	signer.verify_strict(message, signature).map_err(|_| CryptoError::ForgedSignature)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_secret_round_trips_to_the_same_keys() {
		let keys = DeviceKeys::generate().expect("randomness");
		let again = DeviceKeys::from_secret(&keys.secret());
		assert_eq!(again.device_id(), keys.device_id());
		assert_eq!(again.agreement_public(), keys.agreement_public());
	}

	#[test]
	fn the_device_id_is_32_lowercase_hex_digits() {
		let id = DeviceKeys::generate().expect("randomness").device_id().to_string();
		assert_eq!(id.len(), 32);
		assert!(id.chars().all(|digit| matches!(digit, '0'..='9' | 'a'..='f')));
	}

	#[test]
	fn a_signature_over_other_bytes_is_refused() {
		let keys = DeviceKeys::generate().expect("randomness");
		let signature = keys.sign(b"signed");
		assert_eq!(verify(&keys.signing_public(), b"signed", &signature), Ok(()));
		assert_eq!(
			verify(&keys.signing_public(), b"altered", &signature),
			Err(CryptoError::ForgedSignature)
		);
	}
}
