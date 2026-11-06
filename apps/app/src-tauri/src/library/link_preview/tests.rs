use std::collections::HashMap;
use std::convert::Infallible;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use axum::body::Body;
use axum::http::header;
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use reqwest::Url;
use tokio::net::TcpListener;

use super::contract::{LibraryLinkPreview, LibraryLinkPreviewError};
use super::{preview_of, read, MAX_BYTES};

const WITHIN: Duration = Duration::from_secs(10);
const LOOPBACK_HOST: &str = "127.0.0.1";

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tokio::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

fn admitting(origin: &str) -> HashMap<String, String> {
	HashMap::from([(origin.to_owned(), "unused".to_owned())])
}

fn html(page: impl Into<Body>) -> Response {
	([(header::CONTENT_TYPE, "text/html; charset=utf-8")], page.into()).into_response()
}

async fn previewed(page: &'static str) -> Result<LibraryLinkPreview, LibraryLinkPreviewError> {
	let origin = served(Router::new().route("/page", get(move || async move { html(page) }))).await;
	read(&format!("{origin}/page"), &admitting(&origin), WITHIN).await
}

fn landed(url: &str) -> Url {
	Url::parse(url).expect("the landed url parses")
}

#[tokio::test]
async fn an_open_graph_page_answers_its_title_site_image_and_alt() {
	let preview = previewed(
		r#"<html><head><title>Ignored</title>
		<meta property="og:title" content="Cats &amp; Dogs">
		<meta property='og:site_name' content='The Pets'>
		<META PROPERTY="og:image" CONTENT="https://cdn.example.test/cat.png">
		<meta content="A cat on a sofa" property="og:image:alt" />
		</head></html>"#,
	)
	.await
	.expect("the page previews");

	assert_eq!(preview.title, "Cats & Dogs");
	assert_eq!(preview.site, "The Pets");
	assert_eq!(preview.image.as_deref(), Some("https://cdn.example.test/cat.png"));
	assert_eq!(preview.alt.as_deref(), Some("A cat on a sofa"));
}

#[tokio::test]
async fn a_title_only_page_answers_its_trimmed_decoded_title_and_the_host_as_site() {
	let preview = previewed(
		"<html><head><title>\n  Cats &amp; Dogs &#8212; &#x2014; &hellip; &unknown;  </title></head></html>",
	)
	.await
	.expect("the page previews");

	assert_eq!(preview.title, "Cats & Dogs \u{2014} \u{2014} \u{2026} &unknown;");
	assert_eq!(preview.site, LOOPBACK_HOST);
	assert_eq!(preview.image, None);
	assert_eq!(preview.alt, None);
}

#[tokio::test]
async fn a_page_with_neither_og_title_nor_a_title_answers_the_host_as_title() {
	let preview =
		previewed("<html><body><p>cat</p></body></html>").await.expect("the page previews");

	assert_eq!(preview.title, LOOPBACK_HOST);
	assert_eq!(preview.site, LOOPBACK_HOST);
}

#[test]
fn a_site_without_og_site_name_is_the_landed_host_without_www() {
	let preview = preview_of("https://example.test/", &landed("https://www.example.test/a"), "");

	assert_eq!(preview.site, "example.test");
	assert_eq!(preview.title, "example.test");
}

#[test]
fn a_relative_og_image_resolves_against_the_landed_url() {
	let page = r#"<meta property="og:image" content="../img/cat.png"><meta property="og:image:alt" content="A cat">"#;

	let preview = preview_of(
		"https://short.test/cat",
		&landed("https://www.example.test/articles/cats/"),
		page,
	);

	assert_eq!(preview.url, "https://short.test/cat");
	assert_eq!(preview.image.as_deref(), Some("https://www.example.test/articles/img/cat.png"));
	assert_eq!(preview.alt.as_deref(), Some("A cat"));
}

#[test]
fn an_og_image_resolving_off_https_leaves_image_and_alt_absent() {
	for image in ["http://cdn.example.test/cat.png", "data:image/png;base64,AQID", "/cat.png"] {
		let page = format!(
			r#"<meta property="og:image" content="{image}"><meta property="og:image:alt" content="A cat">"#
		);

		let preview = preview_of("http://example.test/", &landed("http://example.test/"), &page);

		assert_eq!((preview.image, preview.alt), (None, None), "{image}");
	}
}

#[tokio::test]
async fn a_redirected_page_answers_the_url_it_was_called_with() {
	let origin = served(
		Router::new()
			.route("/short", get(|| async { Redirect::temporary("/articles/cat") }))
			.route("/articles/cat", get(|| async { html("<title>Cat</title>") })),
	)
	.await;
	let called = format!("{origin}/short");

	let preview = read(&called, &admitting(&origin), WITHIN).await.expect("the page previews");

	assert_eq!(preview.url, called);
	assert_eq!(preview.title, "Cat");
}

#[tokio::test]
async fn a_body_past_two_mebibytes_is_parsed_from_what_is_already_held() {
	let origin = served(
		Router::new()
			.route(
				"/endless",
				get(|| async {
					let head = futures_util::stream::once(async {
						Ok::<_, Infallible>(
							br#"<meta property="og:title" content="Held">"#.to_vec(),
						)
					});
					let padding = futures_util::stream::repeat_with(|| Ok(vec![b' '; 64 * 1024]));
					html(Body::from_stream(futures_util::StreamExt::chain(head, padding)))
				}),
			)
			.route(
				"/late",
				get(|| async {
					let mut page = vec![b' '; MAX_BYTES];
					page.extend_from_slice(b"<title>Late</title>");
					html(Body::from(page))
				}),
			),
	)
	.await;
	let proxies = admitting(&origin);

	let endless = read(&format!("{origin}/endless"), &proxies, WITHIN).await;
	let late = read(&format!("{origin}/late"), &proxies, WITHIN).await;

	assert_eq!(endless.map(|preview| preview.title), Ok("Held".to_owned()));
	assert_eq!(late.map(|preview| preview.title), Ok(LOOPBACK_HOST.to_owned()));
}

#[tokio::test]
async fn a_refused_status_an_unreachable_port_or_a_slow_answer_is_a_network_failure() {
	let origin = served(Router::new().route(
		"/slow",
		get(|| async {
			tokio::time::sleep(Duration::from_secs(5)).await;
			html("<title>Slow</title>")
		}),
	))
	.await;
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
	let closed = format!("http://{}", listener.local_addr().expect("the port is named"));
	drop(listener);

	let missing = read(&format!("{origin}/missing"), &admitting(&origin), WITHIN).await;
	let unreached = read(&format!("{closed}/page"), &admitting(&closed), WITHIN).await;
	let slow =
		read(&format!("{origin}/slow"), &admitting(&origin), Duration::from_millis(100)).await;

	assert_eq!(missing, Err(LibraryLinkPreviewError::NetworkFailure { status: Some(404) }));
	assert_eq!(unreached, Err(LibraryLinkPreviewError::NetworkFailure { status: None }));
	assert_eq!(slow, Err(LibraryLinkPreviewError::NetworkFailure { status: None }));
}

#[tokio::test]
async fn a_body_neither_html_nor_xhtml_is_not_a_page() {
	let origin = served(
		Router::new()
			.route("/json", get(|| async { ([(header::CONTENT_TYPE, "application/json")], "{}") }))
			.route("/bare", get(|| async { Response::new(Body::from("<title>Bare</title>")) }))
			.route(
				"/xhtml",
				get(|| async {
					([(header::CONTENT_TYPE, "Application/XHTML+XML")], "<title>Strict</title>")
				}),
			),
	)
	.await;
	let proxies = admitting(&origin);

	for path in ["json", "bare"] {
		let refusal = read(&format!("{origin}/{path}"), &proxies, WITHIN).await;
		assert_eq!(refusal, Err(LibraryLinkPreviewError::NotAPage), "{path}");
	}
	let xhtml = read(&format!("{origin}/xhtml"), &proxies, WITHIN).await;
	assert_eq!(xhtml.map(|preview| preview.title), Ok("Strict".to_owned()));
}

#[tokio::test]
async fn an_http_or_unparsable_url_is_refused_without_a_request() {
	let requests = Arc::new(AtomicUsize::new(0));
	let counter = Arc::clone(&requests);
	let origin = served(Router::new().fallback(move || {
		counter.fetch_add(1, Ordering::SeqCst);
		async { html("<title>Cat</title>") }
	}))
	.await;

	for url in [format!("{origin}/page"), "ftp://example.test/".to_owned(), "not a url".to_owned()]
	{
		let refusal = read(&url, &HashMap::new(), WITHIN).await;
		assert_eq!(refusal, Err(LibraryLinkPreviewError::UnsupportedScheme), "{url}");
	}
	assert_eq!(requests.load(Ordering::SeqCst), 0);
}

fn described(page: &str) -> Option<String> {
	preview_of("https://example.test/", &landed("https://example.test/"), page).description
}

#[test]
fn an_og_description_answers_its_decoded_trimmed_content_as_description() {
	let page = r#"<meta property="og:description" content="  Cats &amp; dogs on a sofa  ">"#;

	assert_eq!(described(page).as_deref(), Some("Cats & dogs on a sofa"));
}

#[test]
fn a_named_description_answers_when_og_description_is_missing() {
	let page = r#"<meta property="og:description" content="  "><meta name="description" content="Cats on a sofa">"#;

	assert_eq!(described(page).as_deref(), Some("Cats on a sofa"));
}

#[test]
fn an_og_description_wins_over_a_named_description_placed_before_it() {
	let page = r#"<meta name="description" content="Named"><meta property="og:description" content="Open Graph">"#;

	assert_eq!(described(page).as_deref(), Some("Open Graph"));
}

#[test]
fn a_page_without_a_description_serializes_no_description_field() {
	let preview =
		preview_of("https://example.test/", &landed("https://example.test/"), "<p>cat</p>");

	let json = serde_json::to_value(&preview).expect("the preview serializes");

	assert_eq!(preview.description, None);
	assert!(json.get("description").is_none(), "{json}");
}

#[test]
fn empty_or_blank_description_tags_answer_no_description() {
	let page =
		r#"<meta property="og:description" content=""><meta name="description" content=" &#32; ">"#;

	assert_eq!(described(page), None);
}
