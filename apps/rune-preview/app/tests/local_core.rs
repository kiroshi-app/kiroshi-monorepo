use std::process::Command;

use kiroshi_core::removed_on_drop::RemovedOnDrop;

const PREVIEW: &str = env!("CARGO_BIN_EXE_kiroshi-rune-preview");

const FAKE_SIDECAR: &str = env!("CARGO_BIN_EXE_fake_sidecar");

const SIDECAR_ENV: &str = "KIROSHI_AGENT_SIDECAR";

const DATA_ENV: &str = "KIROSHI_PREVIEW_DATA";

fn a_data_folder() -> RemovedOnDrop {
	RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-rune-preview-{}", uuid::Uuid::new_v4())),
	)
}

#[test]
fn the_window_model_opens_in_process_sends_and_hears_the_reply_as_a_core_event() {
	let data = a_data_folder();

	let ran = Command::new(PREVIEW)
		.args(["--local-send", "hello from the preview"])
		.env(SIDECAR_ENV, FAKE_SIDECAR)
		.env(DATA_ENV, &*data)
		.output()
		.expect("the preview runs");

	let printed = String::from_utf8_lossy(&ran.stdout);
	let complained = String::from_utf8_lossy(&ran.stderr);
	assert!(ran.status.success(), "the exchange failed: {printed}{complained}");
	assert!(printed.contains("opened "), "the window model did not open: {printed}");
	assert!(printed.contains("sent to conversation"), "{printed}");
	let reply: Vec<&str> =
		printed.lines().skip_while(|line| !line.starts_with("reply: ")).collect();
	assert!(!reply.is_empty(), "no reply event was heard: {printed}");
	assert!(
		reply.join("\n").contains("hello from the preview"),
		"the reply did not answer the message: {printed}"
	);
	assert!(
		data.join("conversations.sqlite3").is_file(),
		"the exchange did not land in the preview's own store"
	);
}
