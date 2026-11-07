use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use minisign_verify::{PublicKey, Signature};
use semver::Version;

pub(super) fn verified(
	artifact: &[u8],
	signature: &str,
	public_key: &str,
	announced_version: &str,
) -> Result<(), String> {
	let public_key = decoded(public_key)
		.and_then(|text| PublicKey::decode(&text).map_err(|error| error.to_string()))
		.map_err(|detail| format!("the configured public key is unreadable: {detail}"))?;
	let signature = decoded(signature)
		.and_then(|text| Signature::decode(&text).map_err(|error| error.to_string()))
		.map_err(|detail| format!("the update signature is unreadable: {detail}"))?;
	public_key.verify(artifact, &signature, true).map_err(|error| {
		format!("the update signature did not verify against the configured public key: {error}")
	})?;
	match signed_version(signature.trusted_comment()) {
		Some(signed) if !is_same_version(signed, announced_version) => Err(format!(
			"the update signature covers version {signed}, not the {announced_version} the feed announced"
		)),
		_ => Ok(()),
	}
}

fn decoded(base64: &str) -> Result<String, String> {
	let bytes = STANDARD.decode(base64).map_err(|error| error.to_string())?;
	String::from_utf8(bytes).map_err(|error| error.to_string())
}

fn signed_version(trusted_comment: &str) -> Option<&str> {
	trusted_comment.split('\t').find_map(|field| field.strip_prefix("version:"))
}

fn is_same_version(signed: &str, announced: &str) -> bool {
	match (
		Version::parse(signed.trim_start_matches('v')),
		Version::parse(announced.trim_start_matches('v')),
	) {
		(Ok(signed), Ok(announced)) => signed == announced,
		_ => signed == announced,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_signed_version_is_read_from_the_trusted_comment() {
		let comment = "timestamp:1793611102\tfile:Kiroshi.app.tar.gz\tversion:0.26.1";

		assert_eq!(signed_version(comment), Some("0.26.1"));
	}

	#[test]
	fn a_signed_version_spelled_with_a_v_matches_the_announced_one() {
		assert!(is_same_version("v0.26.1", "0.26.1"));
		assert!(!is_same_version("0.26.0", "0.26.1"));
	}

	#[test]
	fn an_unreadable_signature_is_named() {
		let refused = verified(
			b"bytes",
			"not base64!",
			&crate::updates::source::UpdateSource::release().public_key,
			"0.1.0",
		);

		assert!(refused.expect_err("it is refused").contains("signature"));
	}
}
