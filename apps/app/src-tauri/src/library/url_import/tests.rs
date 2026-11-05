use std::collections::HashMap;
use std::fs;
use std::io::Cursor;
use std::net::Ipv4Addr;
use std::path::Path;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

use axum::http::{header, StatusCode};
use axum::response::IntoResponse;
use axum::Router;
use image::{DynamicImage, ImageFormat, Rgb, RgbImage};
use tokio::net::TcpListener;
use uuid::Uuid;

use super::{admission_for, import_url, item_name};
use crate::hosting::authorship::Caller;
use crate::library::contract::{LibraryImportUrlError, LibraryItem, LibraryItemKind};
use crate::library::{list, read_thumbnail, space_dir};
use crate::remote_image::Admission;
use crate::removed_on_drop::RemovedOnDrop;

const SPACE: &str = "s1";

fn temp_root() -> RemovedOnDrop {
	RemovedOnDrop(std::env::temp_dir().join(format!("kiroshi-url-import-{}", Uuid::new_v4())))
}

fn picture() -> Vec<u8> {
	let picture = DynamicImage::ImageRgb8(RgbImage::from_pixel(4, 3, Rgb([200, 40, 10])));
	let mut bytes = Cursor::new(Vec::new());
	picture.write_to(&mut bytes, ImageFormat::Png).expect("the picture encodes");
	bytes.into_inner()
}

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tokio::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

async fn serving_a_png() -> String {
	served(Router::new().fallback(|| async { ([(header::CONTENT_TYPE, "image/png")], picture()) }))
		.await
}

async fn from_the_host(root: &Path, url: &str) -> Result<LibraryItem, LibraryImportUrlError> {
	let no_bearers = HashMap::new();
	import_url(root.to_owned(), SPACE.to_owned(), url, &Admission::Web(&no_bearers)).await
}

fn space_entries(root: &Path) -> Vec<String> {
	let Ok(listed) = fs::read_dir(space_dir(root, SPACE)) else {
		return Vec::new();
	};
	listed
		.map(|entry| entry.expect("the entry reads").file_name().to_string_lossy().into_owned())
		.collect()
}

#[tokio::test]
async fn a_png_lands_as_an_image_listed_with_its_thumbnail() {
	let root = temp_root();
	let origin = serving_a_png().await;

	let item = from_the_host(&root, &format!("{origin}/cats/tabby.png?size=large"))
		.await
		.expect("the png lands");

	assert_eq!(item.name, "tabby.png");
	assert_eq!(item.kind, LibraryItemKind::Image);
	assert_eq!(list(&root, SPACE).expect("the library lists"), vec![item]);
	let thumbnail = read_thumbnail(&root, SPACE, "tabby.png").expect("the thumbnail reads");
	assert_eq!(thumbnail.mime_type, "image/png");
	assert_eq!(
		fs::read_dir(space_dir(&root, SPACE).join(".thumbnails")).expect("thumbnails").count(),
		1
	);
}

#[tokio::test]
async fn a_name_already_in_the_library_answers_the_landed_name() {
	let root = temp_root();
	let origin = serving_a_png().await;
	let url = format!("{origin}/tabby.png");

	from_the_host(&root, &url).await.expect("the first png lands");
	let second = from_the_host(&root, &url).await.expect("the second png lands");

	assert_eq!(second.name, "tabby (2).png");
}

#[tokio::test]
async fn an_html_answer_is_not_an_image_and_writes_nothing() {
	let root = temp_root();
	let origin = served(
		Router::new()
			.fallback(|| async { ([(header::CONTENT_TYPE, "text/html")], "<html></html>") }),
	)
	.await;

	let refusal = from_the_host(&root, &format!("{origin}/page.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::NotAnImage));
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn bytes_the_decoder_rejects_are_not_an_image_and_write_nothing() {
	let root = temp_root();
	let origin = served(
		Router::new().fallback(|| async { ([(header::CONTENT_TYPE, "image/png")], "nope") }),
	)
	.await;

	let refusal = from_the_host(&root, &format!("{origin}/broken.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::NotAnImage));
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn an_image_type_the_library_does_not_hold_is_not_an_image() {
	let root = temp_root();
	let origin = served(
		Router::new().fallback(|| async { ([(header::CONTENT_TYPE, "image/svg+xml")], "<svg/>") }),
	)
	.await;

	let refusal = from_the_host(&root, &format!("{origin}/logo.svg")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::NotAnImage));
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn a_closed_port_is_a_network_failure_without_a_status() {
	let root = temp_root();
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
	let address = listener.local_addr().expect("the port is named");
	drop(listener);

	let refusal = from_the_host(&root, &format!("http://{address}/cat.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::NetworkFailure { status: None }));
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn a_404_is_a_network_failure_with_its_status() {
	let root = temp_root();
	let origin =
		served(Router::new().fallback(|| async { StatusCode::NOT_FOUND.into_response() })).await;

	let refusal = from_the_host(&root, &format!("{origin}/cat.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::NetworkFailure { status: Some(404) }));
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn a_scheme_other_than_http_or_https_is_unsupported() {
	let root = temp_root();

	let refusal = from_the_host(&root, "file:///etc/hosts").await;

	assert_eq!(refusal, Err(LibraryImportUrlError::UnsupportedScheme));
}

async fn counted() -> (String, Arc<AtomicUsize>) {
	let requests = Arc::new(AtomicUsize::new(0));
	let counter = Arc::clone(&requests);
	let origin = served(Router::new().fallback(move || {
		counter.fetch_add(1, Ordering::SeqCst);
		async { ([(header::CONTENT_TYPE, "image/png")], picture()) }
	}))
	.await;
	(origin, requests)
}

async fn from_a_member(root: &Path, url: &str) -> Result<LibraryItem, LibraryImportUrlError> {
	let no_bearers = HashMap::new();
	let admission = admission_for(&Caller::Relayed(None), &no_bearers);
	import_url(root.to_owned(), SPACE.to_owned(), url, &admission).await
}

#[tokio::test]
async fn a_relayed_caller_is_refused_a_loopback_literal_before_any_request() {
	let root = temp_root();
	let (origin, requests) = counted().await;

	let refusal = from_a_member(&root, &format!("{origin}/cat.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::PrivateAddress));
	assert_eq!(requests.load(Ordering::SeqCst), 0);
	assert_eq!(space_entries(&root), Vec::<String>::new());
}

#[tokio::test]
async fn a_relayed_caller_is_refused_a_name_resolving_to_loopback_before_any_request() {
	let root = temp_root();
	let (origin, requests) = counted().await;
	let named = origin.replace("127.0.0.1", "localhost");

	let refusal = from_a_member(&root, &format!("{named}/cat.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::PrivateAddress));
	assert_eq!(requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn a_relayed_caller_is_refused_an_ipv4_mapped_loopback_before_any_request() {
	let root = temp_root();
	let (origin, requests) = counted().await;
	let mapped = origin.replace("127.0.0.1", "[::ffff:127.0.0.1]");

	let refusal = from_a_member(&root, &format!("{mapped}/cat.png")).await;

	assert_eq!(refusal, Err(LibraryImportUrlError::PrivateAddress));
	assert_eq!(requests.load(Ordering::SeqCst), 0);
}

#[test]
fn a_relayed_caller_is_admitted_to_the_public_web_without_any_proxy_bearer() {
	let bearers = HashMap::from([("http://127.0.0.1:1".to_owned(), "proxy-bearer".to_owned())]);

	assert!(matches!(admission_for(&Caller::Relayed(None), &bearers), Admission::PublicWeb));
	assert!(
		matches!(admission_for(&Caller::Host, &bearers), Admission::Web(held) if held == &bearers)
	);
}

#[test]
fn the_name_is_the_last_segment_with_the_extension_of_the_answered_type() {
	assert_eq!(item_name("https://a.test/x/tabby.png", "image/png", "png"), "tabby.png");
	assert_eq!(item_name("https://a.test/tabby.JPEG", "image/jpeg", "jpg"), "tabby.JPEG");
	assert_eq!(item_name("https://a.test/tabby", "image/webp", "webp"), "tabby.webp");
	assert_eq!(item_name("https://a.test/render.php?id=3", "image/gif", "gif"), "render.gif");
	assert_eq!(item_name("https://a.test/tabby.png", "image/jpeg", "jpg"), "tabby.jpg");
}

#[test]
fn an_empty_or_hidden_segment_falls_back_to_image() {
	assert_eq!(item_name("https://a.test/", "image/png", "png"), "image.png");
	assert_eq!(item_name("https://a.test", "image/png", "png"), "image.png");
	assert_eq!(item_name("https://a.test/a/.png", "image/png", "png"), "image.png");
	assert_eq!(item_name("https://a.test/a/..", "image/png", "png"), "image.png");
}
