pub mod contract;
pub mod scrub;
pub mod stderr_lines;

use contract::InstallKind;

const DEV_IDENTIFIER_SUFFIX: &str = ".dev";

pub fn install_kind(identifier: &str) -> InstallKind {
	if identifier.ends_with(DEV_IDENTIFIER_SUFFIX) {
		return InstallKind::Dev;
	}
	InstallKind::Installed
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_dev_identifier_is_a_dev_install_and_the_shipped_one_is_installed() {
		assert_eq!(install_kind("com.kiroshi.app.dev"), InstallKind::Dev);
		assert_eq!(install_kind("com.kiroshi.app"), InstallKind::Installed);
	}
}
