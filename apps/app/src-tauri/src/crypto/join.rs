use ed25519_dalek::VerifyingKey;
use hmac::{Hmac, Mac};
use sha2::Sha256;
use x25519_dalek::{PublicKey, StaticSecret};
use zeroize::Zeroizing;

use super::device_keys::{DeviceKeys, KEY_LENGTH};
use super::error::CryptoError;
use super::randomness::random_bytes;
use super::sealed_box;

const MAC_LENGTH: usize = 32;
pub const PAYLOAD_LENGTH: usize = 2 * KEY_LENGTH + MAC_LENGTH;
pub const SECRET_LENGTH: usize = 32;
const ANSWER_DOMAIN: &[u8] = b"kiroshi/v2/join-answer";

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

pub fn fresh_secret() -> Result<Zeroizing<[u8; SECRET_LENGTH]>, CryptoError> {
	random_bytes::<SECRET_LENGTH>()
}

pub fn answer_mac(secret: &[u8], answer: &[u8]) -> [u8; MAC_LENGTH] {
	keyed(secret, &[ANSWER_DOMAIN, answer].concat()).finalize().into_bytes().into()
}

pub fn opened_answer(
	secret: &[u8],
	device: &StaticSecret,
	joined: &[u8],
) -> Result<Zeroizing<Vec<u8>>, CryptoError> {
	let opened = Zeroizing::new(sealed_box::open(device, joined)?);
	if opened.len() < MAC_LENGTH {
		return Err(CryptoError::Truncated);
	}
	let (mac, answer) = opened.split_at(MAC_LENGTH);
	keyed(secret, &[ANSWER_DOMAIN, answer].concat())
		.verify_slice(mac)
		.map_err(|_| CryptoError::Unauthentic)?;
	Ok(Zeroizing::new(answer.to_vec()))
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
		StaticSecret::from(*random_bytes::<KEY_LENGTH>().expect("randomness"))
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
	fn the_answer_mac_is_keyed_by_the_secret_and_bound_to_its_domain() {
		let answer = br#"{"key_id":1}"#;
		let expected = keyed(b"invitation", &[ANSWER_DOMAIN, answer].concat());
		expected.verify_slice(&answer_mac(b"invitation", answer)).expect("the mac verifies");
		assert_ne!(answer_mac(b"invitation", answer), answer_mac(b"guessed", answer));
		assert_ne!(
			answer_mac(b"invitation", answer),
			keyed(b"invitation", answer).finalize().into_bytes().as_slice()
		);
	}

	#[test]
	fn a_joined_answer_opens_only_under_the_secret_that_keyed_its_mac() {
		let device = DeviceKeys::generate().expect("randomness");
		let answer = br#"{"key_id":1}"#;
		let boxed = [answer_mac(b"invitation", answer).as_slice(), answer].concat();
		let joined = sealed_box::seal(&device.agreement_public(), &boxed).expect("the box seals");

		let opened = opened_answer(b"invitation", device.agreement(), &joined);

		assert_eq!(opened.expect("the answer opens").as_slice(), answer);
		assert_eq!(
			opened_answer(b"guessed", device.agreement(), &joined),
			Err(CryptoError::Unauthentic)
		);
		let short = sealed_box::seal(&device.agreement_public(), &[1; 8]).expect("the box seals");
		assert_eq!(
			opened_answer(b"invitation", device.agreement(), &short),
			Err(CryptoError::Truncated)
		);
	}

	#[test]
	fn a_join_sealed_with_another_secret_is_refused() {
		let host = a_host();
		let keys = DeviceKeys::generate().expect("randomness");
		let sealed = seal(b"guessed", &keys, &PublicKey::from(&host)).expect("the join seals");
		assert_eq!(open(b"invitation", &host, &sealed), Err(CryptoError::Unauthentic));
	}
}
