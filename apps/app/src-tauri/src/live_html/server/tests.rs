use std::sync::{Arc, Mutex, PoisonError};

use tauri::Url;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

use super::super::watch::{Guard, ReceivedRequest, ViewWatch};
use super::{ContentServer, ALLOWED_HOSTS};

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

async fn fetched(url: &str) -> std::io::Result<String> {
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
	ContentServer::open("chart", CONTENT.to_owned(), watch).expect("the server opens")
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
