fn main() {
	let target =
		std::env::var("TARGET").expect("cargo names the target triple to every build script");
	println!("cargo:rustc-env=KIROSHI_TARGET_TRIPLE={target}");
}
