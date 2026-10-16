const CLOUD_SETTINGS_FILE: &str = "kiroshi-cloud.conf";

fn cloud_profile_key() -> &'static str {
	match std::env::var("PROFILE").as_deref() {
		Ok("release") => "release",
		_ => "dev",
	}
}

fn cloud_api_url(settings: &str, key: &str) -> Option<String> {
	settings.lines().find_map(|line| {
		let (name, value) = line.split_once('=')?;
		(name.trim() == key).then(|| value.trim().to_owned())
	})
}

fn emit_cloud_api_url() {
	println!("cargo:rerun-if-changed={CLOUD_SETTINGS_FILE}");
	let settings = std::fs::read_to_string(CLOUD_SETTINGS_FILE)
		.unwrap_or_else(|cause| panic!("cannot read {CLOUD_SETTINGS_FILE}: {cause}"));
	let key = cloud_profile_key();
	let url = cloud_api_url(&settings, key)
		.filter(|url| !url.is_empty())
		.unwrap_or_else(|| panic!("{CLOUD_SETTINGS_FILE} has no value for the key `{key}`"));
	println!("cargo:rustc-env=KIROSHI_CLOUD_API_URL={url}");
}

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
	emit_cloud_api_url();
	emit_git_commit();
	tauri_build::build()
}
