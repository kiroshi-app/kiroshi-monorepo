use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use x25519_dalek::PublicKey;
use zeroize::Zeroizing;

use crate::crypto::device_keys::KEY_LENGTH;
use crate::crypto::join::SECRET_LENGTH;

const LINK_ORIGINS: [&str; 2] = ["https://kiroshi.app/join#", "kiroshi://join#"];

pub(super) struct JoinLink {
	pub(super) instance_id: String,
	pub(super) host: PublicKey,
	pub(super) secret: Zeroizing<[u8; SECRET_LENGTH]>,
}

pub(super) fn parsed(link: &str) -> Option<JoinLink> {
	let link = link.trim();
	let fragment = LINK_ORIGINS.iter().find_map(|origin| link.strip_prefix(origin)).unwrap_or(link);
	let mut parts = fragment.split('.');
	let (Some(instance_id), Some(host), Some(secret), None) =
		(parts.next(), parts.next(), parts.next(), parts.next())
	else {
		return None;
	};
	if instance_id.is_empty() || !instance_id.chars().all(|c| c.is_ascii_alphanumeric() || c == '-')
	{
		return None;
	}
	let host = PublicKey::from(unpadded::<KEY_LENGTH>(host)?);
	let secret = Zeroizing::new(unpadded::<SECRET_LENGTH>(secret)?);
	Some(JoinLink { instance_id: instance_id.to_owned(), host, secret })
}

fn unpadded<const N: usize>(part: &str) -> Option<[u8; N]> {
	BASE64_URL_SAFE_NO_PAD.decode(part).ok()?.try_into().ok()
}

#[cfg(test)]
mod tests {
	use super::*;

	fn a_fragment() -> String {
		let host = BASE64_URL_SAFE_NO_PAD.encode([7; KEY_LENGTH]);
		let secret = BASE64_URL_SAFE_NO_PAD.encode([9; SECRET_LENGTH]);
		format!("instance-1.{host}.{secret}")
	}

	#[test]
	fn the_web_link_the_app_link_and_the_bare_fragment_name_the_same_join() {
		let fragment = a_fragment();
		let links = [
			format!("https://kiroshi.app/join#{fragment}"),
			format!("kiroshi://join#{fragment}"),
			fragment,
		];

		for link in links {
			let parsed = parsed(&link).expect("the link parses");
			assert_eq!(parsed.instance_id, "instance-1", "{link}");
			assert_eq!(parsed.host.as_bytes(), &[7; KEY_LENGTH], "{link}");
			assert_eq!(*parsed.secret, [9; SECRET_LENGTH], "{link}");
		}
	}

	#[test]
	fn a_link_missing_a_part_or_carrying_a_short_key_or_another_origin_does_not_parse() {
		let fragment = a_fragment();
		let host = BASE64_URL_SAFE_NO_PAD.encode([7; KEY_LENGTH]);
		let short = BASE64_URL_SAFE_NO_PAD.encode([9; 16]);
		let refused = [
			String::new(),
			"instance-1".to_owned(),
			format!("{fragment}.extra"),
			format!("instance-1.{host}.{short}"),
			format!("instance-1.{host}.not*base64"),
			format!("https://evil.test/join#{fragment}"),
			format!("../x.{host}.{}", BASE64_URL_SAFE_NO_PAD.encode([9; SECRET_LENGTH])),
		];

		for link in refused {
			assert!(parsed(&link).is_none(), "{link}");
		}
	}
}
