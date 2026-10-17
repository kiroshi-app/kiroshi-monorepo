use std::collections::HashMap;

use chacha20poly1305::aead::{Aead, Payload};
use chacha20poly1305::{ChaCha20Poly1305, KeyInit, Nonce};
use ed25519_dalek::{Signature, VerifyingKey};

use super::device_keys::{verify, DeviceId, DeviceKeys};
use super::error::CryptoError;
use super::subkey::Subkey;

pub const VERSION: u8 = 2;
pub const CHALLENGE_LENGTH: usize = 32;
pub const NONCE_LENGTH: usize = 12;
pub const TAG_LENGTH: usize = 16;
const ABSENT: u8 = 0;
const PRESENT: u8 = 1;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Header {
	pub instance: String,
	pub from: DeviceId,
	pub to: Option<DeviceId>,
	pub key_id: u32,
	pub ctr: u64,
	pub challenge: Option<[u8; CHALLENGE_LENGTH]>,
}

impl Header {
	pub fn aad(&self) -> Result<Vec<u8>, CryptoError> {
		let instance_length =
			u16::try_from(self.instance.len()).map_err(|_| CryptoError::InstanceTooLong)?;
		let mut aad = Vec::new();
		aad.push(VERSION);
		aad.extend_from_slice(&instance_length.to_be_bytes());
		aad.extend_from_slice(self.instance.as_bytes());
		aad.extend_from_slice(self.from.as_bytes());
		push_optional(&mut aad, self.to.as_ref().map(DeviceId::as_bytes));
		aad.extend_from_slice(&self.key_id.to_be_bytes());
		aad.extend_from_slice(&self.ctr.to_be_bytes());
		push_optional(&mut aad, self.challenge.as_ref());
		Ok(aad)
	}
}

fn push_optional<const N: usize>(aad: &mut Vec<u8>, field: Option<&[u8; N]>) {
	match field {
		Some(bytes) => {
			aad.push(PRESENT);
			aad.extend_from_slice(bytes);
		}
		None => aad.push(ABSENT),
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Frame {
	pub header: Header,
	pub ciphertext: Vec<u8>,
	pub sig: Signature,
}

pub fn seal(
	header: Header,
	plaintext: &[u8],
	subkey: &Subkey,
	signer: &DeviceKeys,
) -> Result<Frame, CryptoError> {
	if header.from != signer.device_id() {
		return Err(CryptoError::ForeignSender);
	}
	let aad = header.aad()?;
	let ciphertext = encrypt(subkey, header.ctr, &aad, plaintext)?;
	let sig = signer.sign(&signed_bytes(&aad, &ciphertext));
	Ok(Frame { header, ciphertext, sig })
}

pub fn open(frame: &Frame, subkey: &Subkey, sender: &VerifyingKey) -> Result<Vec<u8>, CryptoError> {
	if DeviceId::of(sender) != frame.header.from {
		return Err(CryptoError::ForeignSender);
	}
	let aad = frame.header.aad()?;
	verify(sender, &signed_bytes(&aad, &frame.ciphertext), &frame.sig)?;
	decrypt(subkey, frame.header.ctr, &aad, &frame.ciphertext)
}

pub fn nonce_of(ctr: u64) -> [u8; NONCE_LENGTH] {
	let mut nonce = [0u8; NONCE_LENGTH];
	nonce[4..].copy_from_slice(&ctr.to_be_bytes());
	nonce
}

fn encrypt(
	subkey: &Subkey,
	ctr: u64,
	aad: &[u8],
	plaintext: &[u8],
) -> Result<Vec<u8>, CryptoError> {
	let nonce = nonce_of(ctr);
	let sealed = ChaCha20Poly1305::new(subkey.as_bytes().into())
		.encrypt(Nonce::from_slice(&nonce), Payload { msg: plaintext, aad })
		.map_err(|_| CryptoError::Unauthentic)?;
	Ok([nonce.as_slice(), &sealed].concat())
}

fn decrypt(
	subkey: &Subkey,
	ctr: u64,
	aad: &[u8],
	ciphertext: &[u8],
) -> Result<Vec<u8>, CryptoError> {
	if ciphertext.len() < NONCE_LENGTH + TAG_LENGTH {
		return Err(CryptoError::Truncated);
	}
	let (nonce, sealed) = ciphertext.split_at(NONCE_LENGTH);
	if nonce != nonce_of(ctr) {
		return Err(CryptoError::NonceMismatch);
	}
	ChaCha20Poly1305::new(subkey.as_bytes().into())
		.decrypt(Nonce::from_slice(nonce), Payload { msg: sealed, aad })
		.map_err(|_| CryptoError::Unauthentic)
}

fn signed_bytes(aad: &[u8], ciphertext: &[u8]) -> Vec<u8> {
	[aad, ciphertext].concat()
}

#[derive(Debug, Default)]
pub struct ReplayGuard {
	last_accepted: HashMap<(DeviceId, u32), u64>,
}

impl ReplayGuard {
	pub fn open(
		&mut self,
		frame: &Frame,
		subkey: &Subkey,
		sender: &VerifyingKey,
	) -> Result<Vec<u8>, CryptoError> {
		let stream = (frame.header.from, frame.header.key_id);
		if self.last_accepted.get(&stream).is_some_and(|last| frame.header.ctr <= *last) {
			return Err(CryptoError::Replay);
		}
		let plaintext = open(frame, subkey, sender)?;
		self.last_accepted.insert(stream, frame.header.ctr);
		Ok(plaintext)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	struct Sealed {
		sender: DeviceKeys,
		subkey: Subkey,
		frame: Frame,
	}

	const PLAINTEXT: &[u8] = br#"{"id":7,"command":"conversation_list","args":{}}"#;

	fn sealed_at(sender: DeviceKeys, ctr: u64) -> Sealed {
		let subkey = Subkey::derive(&[7; 32], 3, &sender.device_id());
		let header = Header {
			instance: "space-1".to_owned(),
			from: sender.device_id(),
			to: Some(DeviceId::from_bytes([9; 16])),
			key_id: 3,
			ctr,
			challenge: Some([5; CHALLENGE_LENGTH]),
		};
		let frame = seal(header, PLAINTEXT, &subkey, &sender).expect("the frame seals");
		Sealed { sender, subkey, frame }
	}

	fn a_sealed_frame() -> Sealed {
		sealed_at(DeviceKeys::generate().expect("randomness"), 1)
	}

	fn opened(sealed: &Sealed) -> Result<Vec<u8>, CryptoError> {
		open(&sealed.frame, &sealed.subkey, &sealed.sender.signing_public())
	}

	#[test]
	fn a_sealed_frame_opens_to_its_plaintext() {
		assert_eq!(opened(&a_sealed_frame()), Ok(PLAINTEXT.to_vec()));
	}

	#[test]
	fn every_altered_header_field_is_refused() {
		let alterations: [fn(&mut Header); 6] = [
			|header| header.instance.push('x'),
			|header| header.to = None,
			|header| header.key_id += 1,
			|header| header.ctr += 1,
			|header| header.challenge = None,
			|header| header.to = Some(DeviceId::from_bytes([8; 16])),
		];
		for alter in alterations {
			let mut sealed = a_sealed_frame();
			alter(&mut sealed.frame.header);
			assert_eq!(opened(&sealed), Err(CryptoError::ForgedSignature));
		}
	}

	#[test]
	fn an_altered_sender_is_refused() {
		let mut sealed = a_sealed_frame();
		sealed.frame.header.from = DeviceId::from_bytes([1; 16]);
		assert_eq!(opened(&sealed), Err(CryptoError::ForeignSender));
	}

	#[test]
	fn every_altered_ciphertext_byte_is_refused() {
		let length = a_sealed_frame().frame.ciphertext.len();
		for index in 0..length {
			let mut sealed = a_sealed_frame();
			sealed.frame.ciphertext[index] ^= 0x01;
			assert_eq!(opened(&sealed), Err(CryptoError::ForgedSignature));
		}
	}

	#[test]
	fn an_altered_sig_is_refused() {
		let mut sealed = a_sealed_frame();
		let mut sig = sealed.frame.sig.to_bytes();
		sig[0] ^= 0x01;
		sealed.frame.sig = Signature::from_bytes(&sig);
		assert_eq!(opened(&sealed), Err(CryptoError::ForgedSignature));
	}

	#[test]
	fn a_frame_signed_by_its_sender_under_a_wrong_nonce_is_refused() {
		let sealed = a_sealed_frame();
		let aad = sealed.frame.header.aad().expect("the header encodes");
		let mut ciphertext = sealed.frame.ciphertext.clone();
		ciphertext[NONCE_LENGTH - 1] ^= 0x01;
		let sig = sealed.sender.sign(&signed_bytes(&aad, &ciphertext));
		let forged = Sealed { frame: Frame { ciphertext, sig, ..sealed.frame }, ..sealed };
		assert_eq!(opened(&forged), Err(CryptoError::NonceMismatch));
	}

	#[test]
	fn a_frame_under_another_subkey_is_refused() {
		let mut sealed = a_sealed_frame();
		sealed.subkey = Subkey::from_bytes([1; 32]);
		assert_eq!(opened(&sealed), Err(CryptoError::Unauthentic));
	}

	#[test]
	fn a_sender_cannot_seal_under_another_device_id() {
		let sender = DeviceKeys::generate().expect("randomness");
		let header = Header {
			instance: "space-1".to_owned(),
			from: DeviceId::from_bytes([1; 16]),
			to: None,
			key_id: 0,
			ctr: 0,
			challenge: None,
		};
		let subkey = Subkey::from_bytes([1; 32]);
		assert_eq!(seal(header, b"", &subkey, &sender), Err(CryptoError::ForeignSender));
	}

	#[test]
	fn an_instance_longer_than_a_u16_length_is_refused() {
		let header = Header {
			instance: "x".repeat(usize::from(u16::MAX) + 1),
			from: DeviceId::from_bytes([1; 16]),
			to: None,
			key_id: 0,
			ctr: 0,
			challenge: None,
		};
		assert_eq!(header.aad(), Err(CryptoError::InstanceTooLong));
	}

	#[test]
	fn a_ctr_at_or_below_the_last_accepted_is_refused_as_a_replay() {
		let sender = DeviceKeys::generate().expect("randomness");
		let secret = sender.secret();
		let mut guard = ReplayGuard::default();
		let at = |ctr| sealed_at(DeviceKeys::from_secret(&secret), ctr);
		let open_at = |guard: &mut ReplayGuard, sealed: &Sealed| {
			guard.open(&sealed.frame, &sealed.subkey, &sealed.sender.signing_public())
		};

		assert!(open_at(&mut guard, &at(5)).is_ok());
		assert_eq!(open_at(&mut guard, &at(5)), Err(CryptoError::Replay));
		assert_eq!(open_at(&mut guard, &at(4)), Err(CryptoError::Replay));
		assert!(open_at(&mut guard, &at(6)).is_ok());
	}

	#[test]
	fn a_refused_frame_does_not_advance_the_replay_counter() {
		let mut guard = ReplayGuard::default();
		let mut forged = sealed_at(DeviceKeys::generate().expect("randomness"), 9);
		let secret = forged.sender.secret();
		forged.frame.ciphertext[NONCE_LENGTH] ^= 0x01;
		let refused = guard.open(&forged.frame, &forged.subkey, &forged.sender.signing_public());
		assert_eq!(refused, Err(CryptoError::ForgedSignature));

		let genuine = sealed_at(DeviceKeys::from_secret(&secret), 2);
		let opened = guard.open(&genuine.frame, &genuine.subkey, &genuine.sender.signing_public());
		assert_eq!(opened, Ok(PLAINTEXT.to_vec()));
	}

	#[test]
	fn the_replay_counter_is_kept_per_sender_and_key_id() {
		let mut guard = ReplayGuard::default();
		let first = sealed_at(DeviceKeys::generate().expect("randomness"), 5);
		let second = sealed_at(DeviceKeys::generate().expect("randomness"), 1);
		assert!(guard.open(&first.frame, &first.subkey, &first.sender.signing_public()).is_ok());
		assert!(guard.open(&second.frame, &second.subkey, &second.sender.signing_public()).is_ok());
	}
}
