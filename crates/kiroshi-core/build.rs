const APP_MANIFEST: &str = "../../apps/app/src-tauri/Cargo.toml";

fn main() {
	let target =
		std::env::var("TARGET").expect("cargo names the target triple to every build script");
	println!("cargo:rustc-env=KIROSHI_TARGET_TRIPLE={target}");
	println!("cargo:rerun-if-changed={APP_MANIFEST}");
	println!("cargo:rustc-env=KIROSHI_APP_VERSION={}", app_version());
}

fn app_version() -> String {
	let manifest = std::fs::read_to_string(APP_MANIFEST).expect("the app manifest reads");
	manifest
		.lines()
		.find_map(|line| line.strip_prefix("version = \""))
		.and_then(|rest| rest.strip_suffix('"'))
		.expect("the app manifest names its version")
		.to_owned()
}
