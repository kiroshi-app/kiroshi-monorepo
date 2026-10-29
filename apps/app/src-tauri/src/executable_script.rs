use std::io;
use std::os::unix::fs::PermissionsExt;
use std::path::Path;
use std::process::Command;

pub(crate) fn an_executable_script(path: &Path, body: &str) {
	if let Err(failure) = written_by_a_child_process(path, body) {
		panic!("the script {} is not written: {failure}", path.display());
	}
}

fn written_by_a_child_process(path: &Path, body: &str) -> io::Result<()> {
	let written = Command::new("/bin/sh")
		.arg("-c")
		.arg(r#"printf '%s' "$2" > "$1""#)
		.arg("sh")
		.arg(path)
		.arg(body)
		.output()?;
	if !written.status.success() {
		return Err(io::Error::other(format!(
			"{}: {}",
			written.status,
			String::from_utf8_lossy(&written.stderr).trim_end()
		)));
	}
	std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
}

#[cfg(test)]
mod tests {
	use std::process::Command;

	use super::an_executable_script;
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_path(name: &str) -> RemovedOnDrop {
		RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-executable-script-{name}-{}", uuid::Uuid::new_v4())),
		)
	}

	#[test]
	fn a_written_script_runs_and_carries_its_body_byte_for_byte() {
		let script = a_path("runs");
		let body = "#!/bin/sh\nprintf '%s' \"it ran with 100% of $1\"\n";

		an_executable_script(&script, body);

		let ran = Command::new(&*script).arg("it").output().expect("the script runs");
		assert_eq!(String::from_utf8_lossy(&ran.stdout), "it ran with 100% of it");
		assert_eq!(std::fs::read_to_string(&*script).expect("the script reads"), body);
	}

	#[test]
	fn a_script_that_cannot_be_written_panics_with_its_path_and_the_failure() {
		let parent = a_path("absent");
		let script = parent.join("script.sh");

		let failure = std::panic::catch_unwind(|| an_executable_script(&script, "#!/bin/sh\n"))
			.expect_err("an unwritable script panics");

		let message = failure.downcast_ref::<String>().expect("the panic carries a message");
		assert!(message.contains(&script.display().to_string()), "got {message}");
		assert!(message.contains("exit status"), "got {message}");
	}
}
