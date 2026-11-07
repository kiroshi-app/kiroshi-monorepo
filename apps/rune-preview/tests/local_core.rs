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
fn the_preview_opens_a_conversation_sends_a_message_and_reads_the_reply_in_process() {
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
	assert!(printed.contains("sent to conversation"), "{printed}");
	let reply = printed
		.lines()
		.skip_while(|line| !line.starts_with("reply (Complete): "))
		.collect::<Vec<_>>();
	assert!(!reply.is_empty(), "no settled reply was read back: {printed}");
	assert!(
		reply.join("\n").contains("hello from the preview"),
		"the reply did not answer the message: {printed}"
	);
	assert!(
		data.join("conversations.sqlite3").is_file(),
		"the exchange did not land in the preview's own store"
	);
}
