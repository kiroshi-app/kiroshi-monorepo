use chacha20poly1305::aead::Aead;
use chacha20poly1305::{ChaCha20Poly1305, KeyInit, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;
use x25519_dalek::{PublicKey, SharedSecret, StaticSecret};
use zeroize::Zeroizing;

use super::device_keys::KEY_LENGTH;
use super::error::CryptoError;
use super::frame::{NONCE_LENGTH, TAG_LENGTH};
use super::randomness::random_bytes;

const INFO: &[u8] = b"kiroshi/v2/sealed-box";
pub const OVERHEAD: usize = KEY_LENGTH + NONCE_LENGTH + TAG_LENGTH;

pub fn seal(recipient: &PublicKey, plaintext: &[u8]) -> Result<Vec<u8>, CryptoError> {
	let ephemeral = StaticSecret::from(*random_bytes::<KEY_LENGTH>()?);
	seal_with(&ephemeral, *random_bytes::<NONCE_LENGTH>()?, recipient, plaintext)
}

pub(crate) fn seal_with(
	ephemeral: &StaticSecret,
	nonce: [u8; NONCE_LENGTH],
	recipient: &PublicKey,
	plaintext: &[u8],
) -> Result<Vec<u8>, CryptoError> {
	let ephemeral_public = PublicKey::from(ephemeral);
	let shared = contributory(ephemeral.diffie_hellman(recipient))?;
	let cipher = cipher_of(&shared, &ephemeral_public, recipient);
	let sealed = cipher
		.encrypt(Nonce::from_slice(&nonce), plaintext)
		.map_err(|_| CryptoError::Unauthentic)?;
	Ok([ephemeral_public.as_bytes().as_slice(), &nonce, &sealed].concat())
}

pub fn open(recipient: &StaticSecret, sealed: &[u8]) -> Result<Vec<u8>, CryptoError> {
	if sealed.len() < OVERHEAD {
		return Err(CryptoError::Truncated);
	}
	let (ephemeral_bytes, rest) = sealed.split_at(KEY_LENGTH);
	let (nonce, ciphertext) = rest.split_at(NONCE_LENGTH);
	let mut ephemeral = [0u8; KEY_LENGTH];
	ephemeral.copy_from_slice(ephemeral_bytes);
	let ephemeral_public = PublicKey::from(ephemeral);
	let shared = contributory(recipient.diffie_hellman(&ephemeral_public))?;
	cipher_of(&shared, &ephemeral_public, &PublicKey::from(recipient))
		.decrypt(Nonce::from_slice(nonce), ciphertext)
		.map_err(|_| CryptoError::Unauthentic)
}

pub fn contributory(shared: SharedSecret) -> Result<SharedSecret, CryptoError> {
	if !shared.was_contributory() {
		return Err(CryptoError::NotContributory);
	}
	Ok(shared)
}

fn cipher_of(
	shared: &SharedSecret,
	ephemeral_public: &PublicKey,
	recipient: &PublicKey,
) -> ChaCha20Poly1305 {
	let salt = [ephemeral_public.as_bytes().as_slice(), recipient.as_bytes()].concat();
	let mut key = Zeroizing::new([0u8; KEY_LENGTH]);
	Hkdf::<Sha256>::new(Some(&salt), shared.as_bytes())
		.expand(INFO, key.as_mut_slice())
		.expect("32 bytes is within the HKDF-SHA256 output limit");
	ChaCha20Poly1305::new(key.as_ref().into())
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_recipient() -> StaticSecret {
		StaticSecret::from(*random_bytes::<KEY_LENGTH>().expect("randomness"))
	}

	#[test]
	fn a_sealed_box_opens_for_its_recipient_only() {
		let recipient = a_recipient();
		let sealed = seal(&PublicKey::from(&recipient), b"join").expect("the box seals");
		assert_eq!(open(&recipient, &sealed), Ok(b"join".to_vec()));
		assert_eq!(open(&a_recipient(), &sealed), Err(CryptoError::Unauthentic));
	}

	#[test]
	fn every_altered_byte_of_a_sealed_box_is_refused() {
		let recipient = a_recipient();
		let sealed = seal(&PublicKey::from(&recipient), b"join").expect("the box seals");
		for index in 0..sealed.len() {
			let mut altered = sealed.clone();
			altered[index] ^= 0x01;
			assert!(open(&recipient, &altered).is_err(), "byte {index} was not authenticated");
		}
	}

	#[test]
	fn a_truncated_box_is_refused() {
		assert_eq!(open(&a_recipient(), &[0; OVERHEAD - 1]), Err(CryptoError::Truncated));
	}

	#[test]
	fn a_low_order_recipient_is_refused_as_not_contributory() {
		let low_order = PublicKey::from([0u8; KEY_LENGTH]);
		assert_eq!(seal(&low_order, b"join"), Err(CryptoError::NotContributory));
	}

	#[test]
	fn a_low_order_ephemeral_key_is_refused_as_not_contributory() {
		let mut sealed = vec![0u8; OVERHEAD];
		sealed[0] = 1;
		assert_eq!(open(&a_recipient(), &sealed), Err(CryptoError::NotContributory));
	}
}
