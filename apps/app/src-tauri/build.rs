fn git(args: &[&str]) -> Option<String> {
	let output = std::process::Command::new("git").args(args).output().ok()?;
	let text = String::from_utf8(output.stdout).ok()?.trim().to_owned();
	(output.status.success() && !text.is_empty()).then_some(text)
}

fn emit_git_commit() {
	for watched in ["HEAD", "logs/HEAD"] {
		if let Some(path) = git(&["rev-parse", "--git-path", watched]) {
			println!("cargo:rerun-if-changed={path}");
		}
	}
	let commit = git(&["rev-parse", "--short=12", "HEAD"]).unwrap_or_else(|| "unknown".to_owned());
	println!("cargo:rustc-env=KIROSHI_GIT_COMMIT={commit}");
}

fn main() {
	emit_git_commit();
	tauri_build::build()
}
