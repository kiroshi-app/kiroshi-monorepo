use ed25519_dalek::VerifyingKey;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};

use super::device_keys::{DeviceKeys, KEY_LENGTH};
use super::error::CryptoError;
use super::sealed_box;

const MAC_LENGTH: usize = 32;
pub const PAYLOAD_LENGTH: usize = 2 * KEY_LENGTH + MAC_LENGTH;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct JoinRequest {
	pub signing: VerifyingKey,
	pub agreement: PublicKey,
}

pub fn seal(secret: &[u8], keys: &DeviceKeys, host: &PublicKey) -> Result<Vec<u8>, CryptoError> {
	sealed_box::seal(host, &payload(secret, keys))
}

pub fn open(secret: &[u8], host: &StaticSecret, sealed: &[u8]) -> Result<JoinRequest, CryptoError> {
	let payload = sealed_box::open(host, sealed)?;
	if payload.len() != PAYLOAD_LENGTH {
		return Err(CryptoError::Truncated);
	}
	let (keys, mac) = payload.split_at(2 * KEY_LENGTH);
	keyed(secret, keys).verify_slice(mac).map_err(|_| CryptoError::Unauthentic)?;
	let (signing, agreement) = keys.split_at(KEY_LENGTH);
	Ok(JoinRequest {
		signing: VerifyingKey::try_from(signing).map_err(|_| CryptoError::MalformedKey)?,
		agreement: PublicKey::from(
			<[u8; KEY_LENGTH]>::try_from(agreement).map_err(|_| CryptoError::MalformedKey)?,
		),
	})
}

fn payload(secret: &[u8], keys: &DeviceKeys) -> Vec<u8> {
	let public_keys =
		[keys.signing_public().as_bytes().as_slice(), keys.agreement_public().as_bytes()].concat();
	let mac = keyed(secret, &public_keys).finalize().into_bytes();
	[public_keys.as_slice(), &mac].concat()
}

fn keyed(secret: &[u8], message: &[u8]) -> Hmac<Sha256> {
	let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(secret)
		.expect("HMAC-SHA256 accepts a key of any length");
	mac.update(message);
	mac
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::crypto::randomness::random_bytes;

	fn a_host() -> StaticSecret {
		StaticSecret::from(random_bytes::<KEY_LENGTH>().expect("randomness"))
	}

	#[test]
	fn the_host_reads_the_public_keys_of_a_join_sealed_with_the_invitation_secret() {
		let host = a_host();
		let keys = DeviceKeys::generate().expect("randomness");
		let sealed = seal(b"invitation", &keys, &PublicKey::from(&host)).expect("the join seals");
		let request = open(b"invitation", &host, &sealed).expect("the join opens");
		assert_eq!(request.signing, keys.signing_public());
		assert_eq!(request.agreement, keys.agreement_public());
	}

	#[test]
	fn a_join_sealed_with_another_secret_is_refused() {
		let host = a_host();
		let keys = DeviceKeys::generate().expect("randomness");
		let sealed = seal(b"guessed", &keys, &PublicKey::from(&host)).expect("the join seals");
		assert_eq!(open(b"invitation", &host, &sealed), Err(CryptoError::Unauthentic));
	}
}
