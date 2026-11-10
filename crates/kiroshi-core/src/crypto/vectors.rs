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
	let Ok(vectors) = serde_json::from_str::<Vectors>(VECTORS) else {
		panic!("the vector file does not parse");
	};
	vectors
}

fn bytes(hex: &str) -> Vec<u8> {
	assert!(hex.len().is_multiple_of(2), "a vector hex string has an odd length");
	(0..hex.len()).step_by(2).map(|at| byte_at(hex, at)).collect()
}

fn byte_at(hex: &str, at: usize) -> u8 {
	let pair =
		hex.get(at..at + 2).filter(|pair| pair.bytes().all(|digit| digit.is_ascii_hexdigit()));
	let Some(byte) = pair.and_then(|pair| u8::from_str_radix(pair, 16).ok()) else {
		panic!("a vector hex string holds a bad byte");
	};
	byte
}

fn array<const N: usize>(hex: &str) -> [u8; N] {
	let Ok(array) = bytes(hex).try_into() else {
		panic!("a vector byte string has the wrong length");
	};
	array
}

fn keys_of(signing_seed: &str, agreement_secret: &str) -> DeviceKeys {
	let secret: Vec<u8> = [bytes(signing_seed), bytes(agreement_secret)].concat();
	let Ok(secret) = secret.try_into() else {
		panic!("a vector device secret is not 64 bytes");
	};
	DeviceKeys::from_secret(&secret)
}

fn header_of(vector: &HeaderVector) -> Header {
	Header {
		instance: vector.instance.clone(),
		from: DeviceId::from_bytes(array(&vector.from)),
		to: vector.to.as_deref().map(|to| DeviceId::from_bytes(array(to))),
		key_id: vector.key_id,
		ctr: ctr_of(&vector.ctr),
		challenge: vector.challenge.as_deref().map(array),
	}
}

fn verifying_key_of(hex: &str) -> VerifyingKey {
	let Ok(key) = VerifyingKey::from_bytes(&array(hex)) else {
		panic!("a vector signing public key is not a valid Ed25519 key");
	};
	key
}

fn ctr_of(decimal: &str) -> u64 {
	let Ok(ctr) = decimal.parse() else {
		panic!("a vector ctr is not a decimal u64");
	};
	ctr
}

#[test]
fn crypto_vectors_name_protocol_2() {
	assert!(vectors().protocol == frame::VERSION, "the vector protocol is not 2");
}

#[test]
fn crypto_vectors_device_keys_answer_their_public_keys_device_id_and_fingerprint() {
	for vector in vectors().devices {
		let keys = keys_of(&vector.signing_seed, &vector.agreement_secret);
		assert!(
			keys.signing_public().as_bytes() == bytes(&vector.signing_public).as_slice(),
			"the signing public key differs from the vector"
		);
		assert!(
			keys.agreement_public().as_bytes() == bytes(&vector.agreement_public).as_slice(),
			"the agreement public key differs from the vector"
		);
		assert!(
			keys.device_id().to_string() == vector.device_id,
			"the device id differs from the vector"
		);
		assert!(
			fingerprint(&keys.signing_public()).to_vec() == vector.fingerprint,
			"the fingerprint differs from the vector"
		);
	}
}

#[test]
fn crypto_vectors_hkdf_subkeys_match() {
	for vector in vectors().subkeys {
		let sender = DeviceId::from_bytes(array(&vector.device_id));
		let subkey = Subkey::derive(&array(&vector.space_key), vector.key_id, &sender);
		assert!(
			subkey.as_bytes() == bytes(&vector.subkey).as_slice(),
			"the subkey differs from the vector"
		);
	}
}

#[test]
fn crypto_vectors_frames_seal_to_the_fixed_bytes_and_open_to_the_plaintext() {
	for vector in vectors().frames {
		assert!(vector.header.v == frame::VERSION, "the header version is not 2");
		let header = header_of(&vector.header);
		let subkey = Subkey::derive(&array(&vector.space_key), header.key_id, &header.from);
		assert!(
			subkey.as_bytes() == bytes(&vector.subkey).as_slice(),
			"the subkey differs from the vector"
		);
		assert!(header.aad() == Ok(bytes(&vector.aad)), "the AAD differs from the vector");

		let signer = keys_of(&vector.signing_seed, &"00".repeat(32));
		let Ok(sealed) = frame::seal(header.clone(), &bytes(&vector.plaintext), &subkey, &signer)
		else {
			panic!("the vector frame does not seal");
		};
		assert!(
			sealed.ciphertext == bytes(&vector.ciphertext),
			"the ciphertext differs from the vector"
		);
		assert!(
			sealed.sig.to_bytes().to_vec() == bytes(&vector.sig),
			"the signature differs from the vector"
		);

		let received = Frame {
			header,
			ciphertext: bytes(&vector.ciphertext),
			sig: Signature::from_bytes(&array(&vector.sig)),
		};
		let sender = verifying_key_of(&vector.signing_public);
		assert!(
			frame::open(&received, &subkey, &sender) == Ok(bytes(&vector.plaintext)),
			"the frame does not open to the vector plaintext"
		);
	}
}

#[test]
fn crypto_vectors_verify_the_rust_made_signature() {
	for vector in vectors().frames {
		let sender = verifying_key_of(&vector.signing_public);
		let signed = [bytes(&vector.aad), bytes(&vector.ciphertext)].concat();
		let sig = Signature::from_bytes(&array(&vector.sig));
		assert!(
			verify(&sender, &signed, &sig) == Ok(()),
			"the Rust-made signature does not verify"
		);
	}
}

#[test]
fn crypto_vectors_sealed_boxes_seal_to_the_fixed_bytes_and_open() {
	for vector in vectors().sealed_boxes {
		let ephemeral = StaticSecret::from(array::<32>(&vector.ephemeral_secret));
		assert!(
			PublicKey::from(&ephemeral).as_bytes() == bytes(&vector.ephemeral_public).as_slice(),
			"the ephemeral public key differs from the vector"
		);
		let recipient = StaticSecret::from(array::<32>(&vector.recipient_secret));
		let recipient_public = PublicKey::from(array::<32>(&vector.recipient_public));
		assert!(
			PublicKey::from(&recipient) == recipient_public,
			"the recipient public key differs from the vector"
		);

		let sealed = sealed_box::seal_with(
			&ephemeral,
			array(&vector.nonce),
			&recipient_public,
			&bytes(&vector.plaintext),
		);
		assert!(sealed == Ok(bytes(&vector.sealed)), "the sealed box differs from the vector");
		assert!(
			sealed_box::open(&recipient, &bytes(&vector.sealed)) == Ok(bytes(&vector.plaintext)),
			"the sealed box does not open to the vector plaintext"
		);
	}
}

#[test]
fn crypto_vectors_join_payloads_match_and_open_for_the_host() {
	for vector in vectors().join_payloads {
		let host = StaticSecret::from(array::<32>(&vector.host_secret));
		assert!(
			PublicKey::from(&host).as_bytes() == bytes(&vector.host_public).as_slice(),
			"the host public key differs from the vector"
		);
		let Ok(request) = join::open(&bytes(&vector.secret), &host, &bytes(&vector.sealed)) else {
			panic!("the vector join payload does not open");
		};
		assert!(
			request.signing.as_bytes() == bytes(&vector.signing_public).as_slice(),
			"the joining signing public key differs from the vector"
		);
		assert!(
			request.agreement.as_bytes() == bytes(&vector.agreement_public).as_slice(),
			"the joining agreement public key differs from the vector"
		);

		let sealed = sealed_box::seal_with(
			&StaticSecret::from(array::<32>(&vector.ephemeral_secret)),
			array(&vector.nonce),
			&PublicKey::from(&host),
			&bytes(&vector.payload),
		);
		assert!(
			sealed == Ok(bytes(&vector.sealed)),
			"the sealed join payload differs from the vector"
		);
	}
}

#[test]
fn crypto_vectors_low_order_points_are_refused_as_not_contributory() {
	let recipient = StaticSecret::from([0x42; 32]);
	for point in vectors().non_contributory_points {
		let shared = recipient.diffie_hellman(&PublicKey::from(array::<32>(&point)));
		assert!(
			matches!(sealed_box::contributory(shared), Err(CryptoError::NotContributory)),
			"a low-order point is not refused as not contributory"
		);
		let mut sealed = bytes(&point);
		sealed.extend_from_slice(&[0; sealed_box::OVERHEAD - 32]);
		assert!(
			sealed_box::open(&recipient, &sealed) == Err(CryptoError::NotContributory),
			"a low-order point is not refused on open"
		);
	}
}

#[test]
#[should_panic(expected = "a vector hex string has an odd length")]
fn crypto_vectors_an_odd_hex_length_fails_naming_the_kind_only() {
	bytes("abc");
}

#[test]
#[should_panic(expected = "a vector hex string holds a bad byte")]
fn crypto_vectors_a_signed_pair_is_a_bad_byte() {
	bytes("+f");
}

#[test]
#[should_panic(expected = "a vector hex string holds a bad byte")]
fn crypto_vectors_a_multibyte_character_is_a_bad_byte() {
	bytes("0é0");
}
