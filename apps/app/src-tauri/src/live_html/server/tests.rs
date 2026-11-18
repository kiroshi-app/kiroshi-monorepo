use std::sync::{Arc, Mutex, PoisonError};

use tauri::Url;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::super::attachment::AttachedPage;
use super::super::contract::{LiveHtmlAppearance, LiveHtmlError, LiveHtmlTheme};
use super::super::watch::{Guard, ReceivedRequest, ViewWatch};
use super::{ContentServer, Page, ALLOWED_HOSTS};
use crate::removed_on_drop::RemovedOnDrop;

const CONTENT: &str = "<!doctype html><p>live</p>";

#[derive(Default)]
struct SeenTargets(Mutex<Vec<String>>);

impl ViewWatch for SeenTargets {
	fn initialization_scripts(&self) -> Vec<String> {
		Vec::new()
	}

	fn guard_answered(&self, _view: &str, _guard: Guard, _url: &str, _is_allowed: bool) {}

	fn request_received(&self, _view: &str, request: &ReceivedRequest<'_>) {
		self.0.lock().unwrap_or_else(PoisonError::into_inner).push(request.target.to_owned());
	}
}

pub(crate) async fn fetched(url: &str) -> std::io::Result<String> {
	let url = Url::parse(url).expect("a server url");
	let address = format!("{}:{}", url.host_str().expect("a host"), url.port().expect("a port"));
	let mut stream = TcpStream::connect(address).await?;
	let request = format!("GET {} HTTP/1.1\r\nHost: view\r\nConnection: close\r\n\r\n", url.path());
	stream.write_all(request.as_bytes()).await?;
	let mut answer = String::new();
	stream.read_to_string(&mut answer).await?;
	Ok(answer)
}

fn header<'a>(answer: &'a str, name: &str) -> Option<&'a str> {
	answer.lines().find_map(|line| {
		let (field, value) = line.split_once(':')?;
		field.eq_ignore_ascii_case(name).then(|| value.trim())
	})
}

fn opened(watch: Arc<SeenTargets>) -> ContentServer {
	ContentServer::open("chart", Page::Written(CONTENT.to_owned()), None, watch)
		.expect("the server opens")
}

struct StoredPage {
	_attachments: RemovedOnDrop,
	server: ContentServer,
	path: std::path::PathBuf,
}

fn stored_and_opened() -> StoredPage {
	let attachments = RemovedOnDrop(
		std::env::temp_dir().join(format!("kiroshi-live-html-{}", uuid::Uuid::new_v4())),
	);
	std::fs::create_dir_all(&*attachments).expect("the attachments folder");
	let path = attachments.join("page.html");
	std::fs::write(&path, CONTENT).expect("a written page");
	let page =
		AttachedPage::checked(attachments.to_path_buf(), path.clone()).expect("the page checks");
	let server =
		ContentServer::open("chart", Page::Attached(page), None, Arc::<SeenTargets>::default())
			.expect("the server opens");
	StoredPage { _attachments: attachments, server, path }
}

fn body_of(answer: &str) -> &str {
	answer.split_once("\r\n\r\n").expect("an answer with a body").1
}

fn base_of(answer: &str) -> &str {
	body_of(answer).strip_suffix(CONTENT).expect("a document ending on the untouched page")
}

fn assert_the_base_is_layered_before_the_page(answer: &str) {
	let base = base_of(answer);
	assert!(base.starts_with("<!doctype html><meta name=\"viewport\""), "{base}");
	assert!(base.contains("<style>@layer kiroshi-base {"), "{base}");
	assert!(base.contains("<style id=\"kiroshi-theme\">@layer kiroshi-base {"), "{base}");
	assert!(base.ends_with("}</style>"), "{base}");
}

#[tokio::test]
async fn the_content_is_served_on_loopback_with_a_policy_naming_only_the_allowlist() {
	let server = opened(Arc::default());
	assert!(server.content_url().starts_with("http://127.0.0.1:"));
	let answer = fetched(&server.content_url()).await.expect("the content answers");
	assert!(answer.starts_with("HTTP/1.1 200"), "{answer}");
	assert!(answer.ends_with(CONTENT));
	let policy = header(&answer, "content-security-policy").expect("a content policy");
	let hosts: Vec<&str> =
		policy.split([' ', ';']).filter(|word| word.starts_with("https://")).collect();
	assert!(!hosts.is_empty());
	assert!(hosts
		.iter()
		.all(|host| ALLOWED_HOSTS.iter().any(|allowed| *host == format!("https://{allowed}"))));
	assert!(policy.contains("default-src 'none'") && policy.contains("sandbox allow-scripts"));
}

#[tokio::test]
async fn the_wrapper_frames_the_content_without_a_script() {
	let server = opened(Arc::default());
	let answer = fetched(&server.wrapper_url()).await.expect("the wrapper answers");
	assert!(answer.contains(r#"<iframe src="content.html""#));
	assert!(!answer.contains("<script"));
	let policy = header(&answer, "content-security-policy").expect("a wrapper policy");
	assert!(policy.starts_with("default-src 'none'; frame-src 'self'"));
}

#[tokio::test]
async fn a_request_outside_the_view_token_is_refused_and_seen_by_the_watch() {
	let watch = Arc::new(SeenTargets::default());
	let server = opened(Arc::clone(&watch));
	let elsewhere = server.content_url().replace(&server.token, "other");
	let answer = fetched(&elsewhere).await.expect("the server answers");
	assert!(answer.starts_with("HTTP/1.1 404"), "{answer}");
	let seen = watch.0.lock().unwrap_or_else(PoisonError::into_inner).clone();
	assert_eq!(seen, vec!["/other/content.html".to_owned()]);
}

#[tokio::test]
async fn a_dropped_server_stops_serving_its_content() {
	let server = opened(Arc::default());
	let url = server.content_url();
	drop(server);
	let mut refused = false;
	for _ in 0..50 {
		if fetched(&url).await.is_err() {
			refused = true;
			break;
		}
		tokio::time::sleep(std::time::Duration::from_millis(20)).await;
	}
	assert!(refused, "the content was still served after the server was dropped");
}

#[tokio::test]
async fn an_html_block_is_served_after_the_base_in_its_layer() {
	let server = opened(Arc::default());

	let answer = fetched(&server.content_url()).await.expect("the content answers");

	assert_the_base_is_layered_before_the_page(&answer);
}

#[tokio::test]
async fn an_attached_page_is_served_after_the_base_in_its_layer() {
	let stored = stored_and_opened();

	let answer = fetched(&stored.server.content_url()).await.expect("the content answers");

	assert_the_base_is_layered_before_the_page(&answer);
}

#[tokio::test]
async fn an_attached_page_is_served_from_disk_under_the_same_base_as_its_html_block() {
	let stored = stored_and_opened();
	let written = opened(Arc::default());

	let attached = fetched(&stored.server.content_url()).await.expect("the content answers");
	let block = fetched(&written.content_url()).await.expect("the content answers");

	assert_eq!(body_of(&attached), body_of(&block));
	assert_eq!(stored.server.content_failure(), None);
}

#[tokio::test]
async fn an_attached_page_rewritten_on_disk_is_served_as_it_now_reads() {
	let stored = stored_and_opened();
	let rewritten = "<!doctype html><p>rewritten</p>";
	std::fs::write(&stored.path, rewritten).expect("a rewritten page");

	let answer = fetched(&stored.server.content_url()).await.expect("the content answers");

	assert!(answer.ends_with(rewritten), "{answer}");
}

#[tokio::test]
async fn an_attached_page_removed_after_its_mount_is_refused_with_a_typed_failure() {
	let stored = stored_and_opened();
	std::fs::remove_file(&stored.path).expect("the page is removed");

	let answer = fetched(&stored.server.content_url()).await.expect("the server answers");

	assert!(answer.starts_with("HTTP/1.1 500"), "{answer}");
	assert!(!answer.contains("<!doctype html>"), "{answer}");
	assert!(matches!(stored.server.content_failure(), Some(LiveHtmlError::Unreadable { .. })));
}

#[tokio::test]
async fn a_rethemed_server_serves_the_same_page_under_the_new_theme() {
	let server = opened(Arc::default());
	let followed = fetched(&server.content_url()).await.expect("the content answers");
	assert!(base_of(&followed).contains("@media (prefers-color-scheme: dark)"));

	server.retheme(LiveHtmlTheme { appearance: LiveHtmlAppearance::Dark, hue: None });

	let rethemed = fetched(&server.content_url()).await.expect("the content answers");
	let base = base_of(&rethemed);
	assert!(base.contains("--kiroshi-appearance: dark; --kiroshi-background: #000000;"), "{base}");
	assert!(!base.contains("prefers-color-scheme"), "{base}");
}
