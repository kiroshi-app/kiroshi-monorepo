#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum Signature {
	#[cfg_attr(
		not(any(target_os = "macos", test)),
		expect(dead_code, reason = "only the macOS signature check reads a team signature")
	)]
	TeamSigned,
	Unsigned,
	#[cfg_attr(
		not(any(target_os = "macos", test)),
		expect(dead_code, reason = "only the macOS signature check fails to verify one")
	)]
	Unverified,
}

#[cfg(target_os = "macos")]
pub(super) fn running_signature() -> Signature {
	static RUNNING: std::sync::OnceLock<Signature> = std::sync::OnceLock::new();
	*RUNNING.get_or_init(|| {
		checked().unwrap_or_else(|error| {
			log::warn!("the code signature check failed with code {}: {error}", error.code());
			Signature::Unverified
		})
	})
}

#[cfg(not(target_os = "macos"))]
pub(super) fn running_signature() -> Signature {
	Signature::Unsigned
}

#[cfg(target_os = "macos")]
fn checked() -> Result<Signature, security_framework::base::Error> {
	use security_framework::os::macos::code_signing::{Flags, SecCode, SecRequirement};

	const UNSIGNED: i32 = -67062;
	const REQUIREMENT_FAILED: i32 = -67050;
	let team_signed: SecRequirement =
		"anchor apple generic and certificate leaf[subject.OU] exists".parse()?;
	match SecCode::for_self(Flags::NONE)?.check_validity(Flags::NONE, &team_signed) {
		Ok(()) => Ok(Signature::TeamSigned),
		Err(error) if matches!(error.code(), UNSIGNED | REQUIREMENT_FAILED) => {
			Ok(Signature::Unsigned)
		}
		Err(error) => Err(error),
	}
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
	use super::*;

	#[test]
	fn a_cargo_test_binary_carries_no_team_signature() {
		assert_eq!(checked().expect("the signature is checked"), Signature::Unsigned);
	}
}
