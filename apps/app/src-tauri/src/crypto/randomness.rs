use zeroize::Zeroizing;

use super::error::CryptoError;

pub(super) fn random_bytes<const N: usize>() -> Result<Zeroizing<[u8; N]>, CryptoError> {
	let mut bytes = Zeroizing::new([0u8; N]);
	getrandom::fill(bytes.as_mut_slice()).map_err(|_| CryptoError::NoRandomness)?;
	Ok(bytes)
}
