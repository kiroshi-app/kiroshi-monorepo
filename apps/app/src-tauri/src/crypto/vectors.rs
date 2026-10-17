use ed25519_dalek::{Signature, VerifyingKey};
use serde::Deserialize;
use x25519_dalek::{PublicKey, StaticSecret};

use super::device_keys::{verify, DeviceId, DeviceKeys};
use super::error::CryptoError;
use super::fingerprint::fingerprint;
use super::frame::{self, Frame, Header};
use super::join;
use super::sealed_box;
use super::subkey::Subkey;

const VECTORS: &str = include_str!("../../tests/vectors/v2-crypto.json");

#[derive(Deserialize)]
struct Vectors {
	protocol: u8,
	devices: Vec<DeviceVector>,
	subkeys: Vec<SubkeyVector>,
	frames: Vec<FrameVector>,
	sealed_boxes: Vec<SealedBoxVector>,
	join_payloads: Vec<JoinVector>,
	non_contributory_points: Vec<String>,
}

#[derive(Deserialize)]
struct DeviceVector {
	signing_seed: String,
	signing_public: String,
	agreement_secret: String,
	agreement_public: String,
	device_id: String,
	fingerprint: Vec<String>,
}

#[derive(Deserialize)]
struct SubkeyVector {
	space_key: String,
	key_id: u32,
	device_id: String,
	subkey: String,
}

#[derive(Deserialize)]
struct FrameVector {
	space_key: String,
	subkey: String,
	signing_seed: String,
	signing_public: String,
	header: HeaderVector,
	aad: String,
	plaintext: String,
	ciphertext: String,
	sig: String,
}

#[derive(Deserialize)]
struct HeaderVector {
	v: u8,
	instance: String,
	from: String,
	to: Option<String>,
	key_id: u32,
	ctr: String,
	challenge: Option<String>,
}

#[derive(Deserialize)]
struct SealedBoxVector {
	recipient_secret: String,
	recipient_public: String,
	ephemeral_secret: String,
	ephemeral_public: String,
	nonce: String,
	plaintext: String,
	sealed: String,
}

#[derive(Deserialize)]
struct JoinVector {
	secret: String,
	signing_public: String,
	agreement_public: String,
	payload: String,
	host_secret: String,
	host_public: String,
	ephemeral_secret: String,
	nonce: String,
	sealed: String,
}

fn vectors() -> Vectors {
	serde_json::from_str(VECTORS).expect("the vector file parses")
}

fn bytes(hex: &str) -> Vec<u8> {
	assert!(hex.len().is_multiple_of(2), "odd hex length in {hex}");
	(0..hex.len())
		.step_by(2)
		.map(|at| u8::from_str_radix(&hex[at..at + 2], 16).expect("a hex byte"))
		.collect()
}

fn array<const N: usize>(hex: &str) -> [u8; N] {
	bytes(hex).try_into().expect("a byte string of the expected length")
}

fn keys_of(signing_seed: &str, agreement_secret: &str) -> DeviceKeys {
	let secret: Vec<u8> = [bytes(signing_seed), bytes(agreement_secret)].concat();
	DeviceKeys::from_secret(&secret.try_into().expect("64 bytes"))
}

fn header_of(vector: &HeaderVector) -> Header {
	Header {
		instance: vector.instance.clone(),
		from: DeviceId::from_bytes(array(&vector.from)),
		to: vector.to.as_deref().map(|to| DeviceId::from_bytes(array(to))),
		key_id: vector.key_id,
		ctr: vector.ctr.parse().expect("a decimal ctr"),
		challenge: vector.challenge.as_deref().map(array),
	}
}

#[test]
fn crypto_vectors_name_protocol_2() {
	assert_eq!(vectors().protocol, frame::VERSION);
}

#[test]
fn crypto_vectors_device_keys_answer_their_public_keys_device_id_and_fingerprint() {
	for vector in vectors().devices {
		let keys = keys_of(&vector.signing_seed, &vector.agreement_secret);
		assert_eq!(keys.signing_public().as_bytes(), bytes(&vector.signing_public).as_slice());
		assert_eq!(keys.agreement_public().as_bytes(), bytes(&vector.agreement_public).as_slice());
		assert_eq!(keys.device_id().to_string(), vector.device_id);
		assert_eq!(fingerprint(&keys.signing_public()).to_vec(), vector.fingerprint);
	}
}

#[test]
fn crypto_vectors_hkdf_subkeys_match() {
	for vector in vectors().subkeys {
		let sender = DeviceId::from_bytes(array(&vector.device_id));
		let subkey = Subkey::derive(&array(&vector.space_key), vector.key_id, &sender);
		assert_eq!(subkey.as_bytes(), bytes(&vector.subkey).as_slice());
	}
}

#[test]
fn crypto_vectors_frames_seal_to_the_fixed_bytes_and_open_to_the_plaintext() {
	for vector in vectors().frames {
		assert_eq!(vector.header.v, frame::VERSION);
		let header = header_of(&vector.header);
		let subkey = Subkey::derive(&array(&vector.space_key), header.key_id, &header.from);
		assert_eq!(subkey.as_bytes(), bytes(&vector.subkey).as_slice());
		assert_eq!(header.aad(), Ok(bytes(&vector.aad)));

		let signer = keys_of(&vector.signing_seed, &"00".repeat(32));
		let sealed = frame::seal(header.clone(), &bytes(&vector.plaintext), &subkey, &signer)
			.expect("the frame seals");
		assert_eq!(sealed.ciphertext, bytes(&vector.ciphertext));
		assert_eq!(sealed.sig.to_bytes().to_vec(), bytes(&vector.sig));

		let received = Frame {
			header,
			ciphertext: bytes(&vector.ciphertext),
			sig: Signature::from_bytes(&array(&vector.sig)),
		};
		let sender = VerifyingKey::from_bytes(&array(&vector.signing_public)).expect("a key");
		assert_eq!(frame::open(&received, &subkey, &sender), Ok(bytes(&vector.plaintext)));
	}
}

#[test]
fn crypto_vectors_verify_the_rust_made_signature() {
	for vector in vectors().frames {
		let sender = VerifyingKey::from_bytes(&array(&vector.signing_public)).expect("a key");
		let signed = [bytes(&vector.aad), bytes(&vector.ciphertext)].concat();
		let sig = Signature::from_bytes(&array(&vector.sig));
		assert_eq!(verify(&sender, &signed, &sig), Ok(()));
	}
}

#[test]
fn crypto_vectors_sealed_boxes_seal_to_the_fixed_bytes_and_open() {
	for vector in vectors().sealed_boxes {
		let ephemeral = StaticSecret::from(array::<32>(&vector.ephemeral_secret));
		assert_eq!(
			PublicKey::from(&ephemeral).as_bytes(),
			bytes(&vector.ephemeral_public).as_slice()
		);
		let recipient = StaticSecret::from(array::<32>(&vector.recipient_secret));
		let recipient_public = PublicKey::from(array::<32>(&vector.recipient_public));
		assert_eq!(PublicKey::from(&recipient), recipient_public);

		let sealed = sealed_box::seal_with(
			&ephemeral,
			array(&vector.nonce),
			&recipient_public,
			&bytes(&vector.plaintext),
		);
		assert_eq!(sealed, Ok(bytes(&vector.sealed)));
		assert_eq!(
			sealed_box::open(&recipient, &bytes(&vector.sealed)),
			Ok(bytes(&vector.plaintext))
		);
	}
}

#[test]
fn crypto_vectors_join_payloads_match_and_open_for_the_host() {
	for vector in vectors().join_payloads {
		let host = StaticSecret::from(array::<32>(&vector.host_secret));
		assert_eq!(PublicKey::from(&host).as_bytes(), bytes(&vector.host_public).as_slice());
		let request = join::open(&bytes(&vector.secret), &host, &bytes(&vector.sealed))
			.expect("the join opens");
		assert_eq!(request.signing.as_bytes(), bytes(&vector.signing_public).as_slice());
		assert_eq!(request.agreement.as_bytes(), bytes(&vector.agreement_public).as_slice());

		let sealed = sealed_box::seal_with(
			&StaticSecret::from(array::<32>(&vector.ephemeral_secret)),
			array(&vector.nonce),
			&PublicKey::from(&host),
			&bytes(&vector.payload),
		);
		assert_eq!(sealed, Ok(bytes(&vector.sealed)));
	}
}

#[test]
fn crypto_vectors_low_order_points_are_refused_as_not_contributory() {
	let recipient = StaticSecret::from([0x42; 32]);
	for point in vectors().non_contributory_points {
		let shared = recipient.diffie_hellman(&PublicKey::from(array::<32>(&point)));
		assert!(matches!(sealed_box::contributory(shared), Err(CryptoError::NotContributory)));
		let mut sealed = bytes(&point);
		sealed.extend_from_slice(&[0; sealed_box::OVERHEAD - 32]);
		assert_eq!(sealed_box::open(&recipient, &sealed), Err(CryptoError::NotContributory));
	}
}
