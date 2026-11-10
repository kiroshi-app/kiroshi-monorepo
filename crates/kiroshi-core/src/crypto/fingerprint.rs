use std::sync::LazyLock;

use ed25519_dalek::VerifyingKey;
use sha2::{Digest, Sha256};

pub const WORD_COUNT: usize = 6;
const BITS_PER_WORD: usize = 11;
const WORD_MASK: u128 = (1 << BITS_PER_WORD) - 1;
const WORD_LIST: &str = include_str!("../../tests/vectors/bip39-english.txt");

static WORDS: LazyLock<Vec<&'static str>> = LazyLock::new(|| WORD_LIST.lines().collect());

pub fn fingerprint(signing: &VerifyingKey) -> [&'static str; WORD_COUNT] {
	let digest = Sha256::digest(signing.as_bytes());
	let mut leading = [0u8; 16];
	leading.copy_from_slice(&digest[..16]);
	let bits = u128::from_be_bytes(leading);
	std::array::from_fn(|position| {
		let shift = 128 - BITS_PER_WORD * (position + 1);
		WORDS[((bits >> shift) & WORD_MASK) as usize]
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_word_list_holds_the_2048_bip39_words() {
		assert_eq!(WORDS.len(), 1 << BITS_PER_WORD);
		assert_eq!((WORDS[0], WORDS[2047]), ("abandon", "zoo"));
	}
}
