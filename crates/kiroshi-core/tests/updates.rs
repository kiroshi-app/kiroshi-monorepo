use std::fs;
use std::path::{Path, PathBuf};

use axum::routing::get;
use axum::Router;
use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use kiroshi_core::core_context::Core;
use kiroshi_core::db::repositories::user::UpdateChannel;
use kiroshi_core::db::{self, DatabaseState};
use kiroshi_core::invoke::{dispatch, Answer};
use kiroshi_core::removed_on_drop::RemovedOnDrop;
use kiroshi_core::updates::source::{Installer, RunningApp, UpdateSource};
use kiroshi_core::updates::Updates;
use serde_json::{json, Value};
use tokio::net::TcpListener;

const PLATFORM: &str = "test-platform";
const BUNDLE: &str = "Fake.app";

struct TestKey {
	signing: SigningKey,
	key_id: [u8; 8],
}

impl TestKey {
	fn new() -> Self {
		let mut seed = [0u8; 32];
		let mut key_id = [0u8; 8];
		getrandom::fill(&mut seed).expect("a seed is drawn");
		getrandom::fill(&mut key_id).expect("a key id is drawn");
		Self { signing: SigningKey::from_bytes(&seed), key_id }
	}

	fn public_key(&self) -> String {
		let mut key = b"Ed".to_vec();
		key.extend_from_slice(&self.key_id);
		key.extend_from_slice(self.signing.verifying_key().as_bytes());
		let text = format!("untrusted comment: minisign public key\n{}\n", STANDARD.encode(key));
		STANDARD.encode(text)
	}

	fn signature(&self, artifact: &[u8], version: &str) -> String {
		let signature = self.signing.sign(artifact).to_bytes();
		let trusted_comment = format!("timestamp:0\tfile:{BUNDLE}.tar.gz\tversion:{version}");
		let mut global = signature.to_vec();
		global.extend_from_slice(trusted_comment.as_bytes());
		let global = self.signing.sign(&global).to_bytes();
		let mut line = b"Ed".to_vec();
		line.extend_from_slice(&self.key_id);
		line.extend_from_slice(&signature);
		let text = format!(
			"untrusted comment: signature from a test key\n{}\ntrusted comment: {trusted_comment}\n{}\n",
			STANDARD.encode(line),
			STANDARD.encode(global),
		);
		STANDARD.encode(text)
	}
}

struct Release {
	stable: Value,
	beta: Value,
	artifact: Vec<u8>,
}

struct Server {
	listener: TcpListener,
	base: String,
}

impl Server {
	async fn bound() -> Self {
		kiroshi_core::missions::github::installed_tls_provider();
		let listener = TcpListener::bind("127.0.0.1:0").await.expect("a loopback port binds");
		let base = format!("http://{}", listener.local_addr().expect("the port is named"));
		Self { listener, base }
	}

	fn serving(self, release: Release) -> String {
		let notes = json!({
			"body": "What changed in 0.2.0",
			"assets": [{ "name": "whats-new.png", "browser_download_url": format!("{}/whats-new.png", self.base) }],
		});
		let Release { stable, beta, artifact } = release;
		let router = Router::new()
			.route("/stable.json", get(move || async move { stable.to_string() }))
			.route("/beta.json", get(move || async move { beta.to_string() }))
			.route("/artifact", get(move || async move { artifact }))
			.route("/tags/v0.2.0", get(move || async move { notes.to_string() }));
		tokio::spawn(async move { axum::serve(self.listener, router).await });
		self.base
	}
}

fn feed(base: &str, version: &str, signature: String) -> Value {
	json!({
		"version": version,
		"notes": "notes",
		"pub_date": "2026-11-02T09:24:55.250Z",
		"platforms": { PLATFORM: { "url": format!("{base}/artifact"), "signature": signature } },
	})
}

fn source(base: &str, key: &TestKey) -> UpdateSource {
	UpdateSource {
		stable_feed: format!("{base}/stable.json"),
		beta_feed: format!("{base}/beta.json"),
		releases_by_tag: format!("{base}/tags"),
		public_key: key.public_key(),
	}
}

fn a_folder() -> RemovedOnDrop {
	let folder = std::env::temp_dir().join(format!("kiroshi-updates-{}", uuid::Uuid::new_v4()));
	fs::create_dir_all(&folder).expect("the folder is created");
	RemovedOnDrop(folder)
}

fn an_installed_app(folder: &Path) -> PathBuf {
	let location = folder.join(BUNDLE);
	fs::create_dir_all(location.join("Contents")).expect("the bundle is created");
	fs::write(location.join("Contents/version"), "0.1.0").expect("the version is written");
	location
}

fn installed_version(location: &Path) -> String {
	fs::read_to_string(location.join("Contents/version")).expect("the installed version reads")
}

fn archived_app(version: &str) -> Vec<u8> {
	let mut builder =
		tar::Builder::new(flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast()));
	let mut header = tar::Header::new_gnu();
	header.set_size(version.len() as u64);
	header.set_mode(0o644);
	header.set_cksum();
	builder
		.append_data(&mut header, format!("{BUNDLE}/Contents/version"), version.as_bytes())
		.expect("the entry is archived");
	builder.into_inner().expect("the tar closes").finish().expect("the gzip closes")
}

fn a_core(data_dir: &Path, source: UpdateSource, location: &Path, version: &str) -> Core {
	let core = Core::new(data_dir, "com.kiroshi.updates-test", tokio::runtime::Handle::current());
	db::install(&core);
	core.manage(Updates::new(
		source,
		RunningApp {
			version: semver::Version::parse(version).expect("a version"),
			location: location.to_path_buf(),
			platform: PLATFORM.to_owned(),
			installer: Installer::MacBundle,
		},
	));
	core
}

async fn called(core: &Core, command: &str, arguments: Value) -> Value {
	match dispatch(core, command, arguments).await {
		Some(Answer::Answered(answer)) => answer,
		other => panic!("{command} answered {other:?}"),
	}
}

async fn preferences(core: &Core) -> kiroshi_core::db::repositories::user::Preferences {
	let state = core.state::<DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	database.user().preferences().await.expect("the preferences read")
}

async fn stored(core: &Core, preferences: kiroshi_core::db::repositories::user::Preferences) {
	let state = core.state::<DatabaseState>();
	let database = state.as_ref().expect("the database opens");
	database.user().set_preferences(preferences).await.expect("the preferences are stored");
}

fn heard_progress(
	events: &mut tokio::sync::broadcast::Receiver<kiroshi_core::core_context::CoreEvent>,
) -> Vec<Value> {
	let mut heard = Vec::new();
	while let Ok(event) = events.try_recv() {
		let state: Value = serde_json::from_str(event.payload.get()).expect("the payload is JSON");
		if event.name == "update://changed" && state["kind"] == "downloading" {
			heard.push(state);
		}
	}
	heard
}

async fn a_release_of(artifact: &[u8], signature: String) -> String {
	let server = Server::bound().await;
	let stable = feed(&server.base, "0.2.0", signature);
	server.serving(Release { stable, beta: Value::Null, artifact: artifact.to_vec() })
}

#[tokio::test]
async fn a_signed_update_replaces_the_installed_app_and_settles_on_ready_to_restart() {
	let key = TestKey::new();
	let artifact = archived_app("0.2.0");
	let base = a_release_of(&artifact, key.signature(&artifact, "0.2.0")).await;
	let folder = a_folder();
	let location = an_installed_app(&folder);
	let core = a_core(&folder.join("data"), source(&base, &key), &location, "0.1.0");
	let mut events = core.subscribe();

	let checked = called(&core, "check_for_updates", json!({})).await;
	let installed = called(&core, "install_update", json!({})).await;
	let checked_again = called(&core, "check_for_updates", json!({})).await;

	assert_eq!(checked, json!({ "kind": "available", "version": "0.2.0" }));
	assert_eq!(installed, json!({ "kind": "readyToRestart", "version": "0.2.0" }));
	assert_eq!(checked_again, installed);
	assert_eq!(called(&core, "update_state", json!({})).await, installed);
	assert_eq!(installed_version(&location), "0.2.0");
	let size = artifact.len();
	let complete = json!({ "kind": "downloading", "downloadedBytes": size, "totalBytes": size });
	assert!(heard_progress(&mut events).contains(&complete));
}

#[tokio::test]
async fn a_tampered_signature_leaves_the_installed_app_untouched_and_fails_naming_the_signature() {
	let key = TestKey::new();
	let artifact = archived_app("0.2.0");
	let base = a_release_of(&artifact, key.signature(b"other bytes", "0.2.0")).await;
	let folder = a_folder();
	let location = an_installed_app(&folder);
	let core = a_core(&folder.join("data"), source(&base, &key), &location, "0.1.0");

	called(&core, "check_for_updates", json!({})).await;
	let installed = called(&core, "install_update", json!({})).await;

	assert_eq!(installed["kind"], "failed");
	let message = installed["message"].as_str().expect("the failure is named");
	assert!(message.contains("signature"), "{message}");
	assert_eq!(installed_version(&location), "0.1.0");
	let beside: Vec<_> = fs::read_dir(&*folder)
		.expect("the folder reads")
		.map(|entry| entry.expect("an entry").file_name())
		.collect();
	assert_eq!(beside.len(), 2, "only the app and the data folder remain: {beside:?}");
}

#[tokio::test]
async fn the_beta_channel_reads_the_beta_feed() {
	let key = TestKey::new();
	let artifact = archived_app("0.3.0-beta.1");
	let server = Server::bound().await;
	let stable = feed(&server.base, "0.2.0", key.signature(&artifact, "0.2.0"));
	let beta = feed(&server.base, "0.3.0-beta.1", key.signature(&artifact, "0.3.0-beta.1"));
	let base = server.serving(Release { stable, beta, artifact });
	let folder = a_folder();
	let location = an_installed_app(&folder);
	let core = a_core(&folder.join("data"), source(&base, &key), &location, "0.1.0");
	let mut beta_preferences = preferences(&core).await;
	beta_preferences.update_channel = UpdateChannel::Beta;
	stored(&core, beta_preferences).await;

	let checked = called(&core, "check_for_updates", json!({})).await;

	assert_eq!(checked, json!({ "kind": "available", "version": "0.3.0-beta.1" }));
}

#[tokio::test]
async fn whats_new_answers_the_notes_of_the_running_version_once_it_changed() {
	let key = TestKey::new();
	let artifact = archived_app("0.2.0");
	let base = a_release_of(&artifact, key.signature(&artifact, "0.2.0")).await;
	let folder = a_folder();
	let location = an_installed_app(&folder);
	let data = folder.join("data");

	let before = a_core(&data, source(&base, &key), &location, "0.1.0");
	let first_launch = called(&before, "whats_new", json!({})).await;
	let mut done = preferences(&before).await;
	assert_eq!(done.last_seen_version.as_deref(), Some("0.1.0"));
	done.first_run_done = true;
	stored(&before, done).await;
	drop(before);

	let after = a_core(&data, source(&base, &key), &location, "0.2.0");
	let relaunched = called(&after, "whats_new", json!({})).await;
	called(&after, "acknowledge_whats_new", json!({})).await;
	let acknowledged = called(&after, "whats_new", json!({})).await;

	assert_eq!(first_launch, Value::Null);
	assert_eq!(relaunched["version"], "0.2.0");
	assert_eq!(relaunched["body"], "What changed in 0.2.0");
	assert_eq!(relaunched["visualUrl"], format!("{base}/whats-new.png"));
	assert_eq!(acknowledged, Value::Null);
	assert_eq!(preferences(&after).await.last_seen_version.as_deref(), Some("0.2.0"));
}
