use super::error::CryptoError;

pub(super) fn random_bytes<const N: usize>() -> Result<[u8; N], CryptoError> {
	let mut bytes = [0u8; N];
	getrandom::fill(&mut bytes).map_err(|_| CryptoError::NoRandomness)?;
	Ok(bytes)
}
