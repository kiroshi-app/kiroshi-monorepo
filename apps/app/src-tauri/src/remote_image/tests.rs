use std::collections::HashMap;
use std::convert::Infallible;
use std::net::Ipv4Addr;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use axum::body::Body;
use axum::extract::Path;
use axum::http::{header, HeaderMap, StatusCode};
use axum::response::{IntoResponse, Redirect, Response};
use axum::routing::get;
use axum::Router;
use tokio::net::TcpListener;

use super::contract::{RemoteImage, RemoteImageError};
use reqwest::Url;

use super::{admitted, is_public, read, Admission, FetchRefusal, MAX_BYTES};

const WITHIN: Duration = Duration::from_secs(10);
const PROXY_BEARER: &str = "proxy-bearer";
const PNG_BYTES: [u8; 3] = [1, 2, 3];

async fn served(router: Router) -> String {
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the fake binds");
	let address = listener.local_addr().expect("the fake is named");
	tokio::spawn(async move {
		axum::serve(listener, router).await.expect("the fake serves");
	});
	format!("http://{address}")
}

async fn counted() -> (String, Arc<AtomicUsize>) {
	let requests = Arc::new(AtomicUsize::new(0));
	let counter = Arc::clone(&requests);
	let origin = served(Router::new().fallback(move || {
		counter.fetch_add(1, Ordering::SeqCst);
		async { png() }
	}))
	.await;
	(origin, requests)
}

fn png() -> Response {
	([(header::CONTENT_TYPE, "image/png")], PNG_BYTES.to_vec()).into_response()
}

fn admitting(origins: &[(&str, &str)]) -> HashMap<String, String> {
	origins.iter().map(|(origin, bearer)| ((*origin).to_owned(), (*bearer).to_owned())).collect()
}

fn the_png() -> RemoteImage {
	RemoteImage { media_type: "image/png".to_owned(), base64: "AQID".to_owned() }
}

#[tokio::test]
async fn an_image_served_over_loopback_answers_its_bare_media_type_and_its_base64() {
	let origin = served(Router::new().route(
		"/cat",
		get(|| async {
			([(header::CONTENT_TYPE, "Image/PNG; charset=binary")], PNG_BYTES.to_vec())
		}),
	))
	.await;

	let image = read(&format!("{origin}/cat"), &admitting(&[(&origin, "unused")]), WITHIN).await;

	assert_eq!(image, Ok(the_png()));
}

#[tokio::test]
async fn a_held_joined_proxy_origin_is_read_over_http_with_its_space_bearer() {
	let presented = |headers: HeaderMap| async move {
		let expected = format!("Bearer {PROXY_BEARER}");
		match headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok()) {
			Some(bearer) if bearer == expected => png(),
			_ => StatusCode::UNAUTHORIZED.into_response(),
		}
	};
	let proxy = served(Router::new().route("/avatar", get(presented))).await;
	let url = format!("{proxy}/avatar");

	let held = read(&url, &admitting(&[(&proxy, PROXY_BEARER)]), WITHIN).await;
	let stale = read(&url, &admitting(&[(&proxy, "another-bearer")]), WITHIN).await;

	assert_eq!(held, Ok(the_png()));
	assert_eq!(stale, Err(RemoteImageError::NetworkFailure { status: Some(401) }));
}

#[tokio::test]
async fn a_scheme_other_than_https_off_the_held_proxies_is_refused_without_a_request() {
	let (origin, requests) = counted().await;

	for url in [
		format!("{origin}/cat"),
		"ftp://example.test/cat.png".to_owned(),
		"file:///cat.png".to_owned(),
		"not a url".to_owned(),
	] {
		let refusal = read(&url, &HashMap::new(), WITHIN).await;
		assert_eq!(refusal, Err(RemoteImageError::UnsupportedScheme), "{url}");
	}
	assert_eq!(requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn a_redirect_to_an_http_origin_nobody_holds_is_refused_without_the_hop() {
	let (elsewhere, requests) = counted().await;
	let target = format!("{elsewhere}/cat");
	let proxy = served(
		Router::new().route("/avatar", get(move || async move { Redirect::temporary(&target) })),
	)
	.await;

	let refusal =
		read(&format!("{proxy}/avatar"), &admitting(&[(&proxy, PROXY_BEARER)]), WITHIN).await;

	assert_eq!(refusal, Err(RemoteImageError::UnsupportedScheme));
	assert_eq!(requests.load(Ordering::SeqCst), 0);
}

#[tokio::test]
async fn a_redirect_between_two_held_proxies_never_carries_the_first_bearer_to_the_second() {
	let presented = Arc::new(Mutex::new(Vec::new()));
	let heard = Arc::clone(&presented);
	let second = served(Router::new().route(
		"/avatar",
		get(move |headers: HeaderMap| {
			let bearer = headers.get(header::AUTHORIZATION).map(|value| value.as_bytes().to_vec());
			heard.lock().expect("the bearers lock").push(bearer);
			async { png() }
		}),
	))
	.await;
	let target = format!("{second}/avatar");
	let first = served(
		Router::new().route("/avatar", get(move || async move { Redirect::temporary(&target) })),
	)
	.await;
	let proxies = admitting(&[(&first, "first-bearer"), (&second, "second-bearer")]);

	let image = read(&format!("{first}/avatar"), &proxies, WITHIN).await;

	assert_eq!(image, Ok(the_png()));
	assert_eq!(
		*presented.lock().expect("the bearers lock"),
		vec![Some(b"Bearer second-bearer".to_vec())]
	);
}

#[tokio::test]
async fn five_redirects_are_followed_and_a_sixth_is_not() {
	let requests = Arc::new(AtomicUsize::new(0));
	let counter = Arc::clone(&requests);
	let hops = served(Router::new().route(
		"/hop/{left}",
		get(move |Path(left): Path<u32>| {
			counter.fetch_add(1, Ordering::SeqCst);
			async move {
				match left {
					0 => png(),
					_ => Redirect::temporary(&format!("/hop/{}", left - 1)).into_response(),
				}
			}
		}),
	))
	.await;
	let proxies = admitting(&[(&hops, "unused")]);

	let fifth = read(&format!("{hops}/hop/5"), &proxies, WITHIN).await;
	requests.store(0, Ordering::SeqCst);
	let sixth = read(&format!("{hops}/hop/6"), &proxies, WITHIN).await;

	assert_eq!(fifth, Ok(the_png()));
	assert_eq!(sixth, Err(RemoteImageError::NetworkFailure { status: Some(307) }));
	assert_eq!(requests.load(Ordering::SeqCst), 6);
}

#[tokio::test]
async fn a_body_declared_or_streamed_past_twenty_mebibytes_is_too_large() {
	let past_the_cap = usize::try_from(MAX_BYTES).expect("the cap fits") + 1;
	let origin = served(
		Router::new()
			.route(
				"/declared",
				get(move || async move {
					([(header::CONTENT_TYPE, "image/png")], vec![0u8; past_the_cap])
				}),
			)
			.route(
				"/streamed",
				get(move || async move {
					let chunks = (0..past_the_cap.div_ceil(1024 * 1024))
						.map(|_| Ok::<_, Infallible>(vec![0u8; 1024 * 1024]));
					(
						[(header::CONTENT_TYPE, "image/png")],
						Body::from_stream(futures_util::stream::iter(chunks)),
					)
				}),
			),
	)
	.await;
	let proxies = admitting(&[(&origin, "unused")]);

	for path in ["declared", "streamed"] {
		let refusal = read(&format!("{origin}/{path}"), &proxies, WITHIN).await;
		assert_eq!(refusal, Err(RemoteImageError::TooLarge { limit: MAX_BYTES }), "{path}");
	}
}

#[tokio::test]
async fn a_body_without_an_image_content_type_is_not_an_image() {
	let origin = served(
		Router::new()
			.route("/page", get(|| async { ([(header::CONTENT_TYPE, "text/html")], "<p>cat</p>") }))
			.route("/bare", get(|| async { Response::new(Body::from(PNG_BYTES.to_vec())) })),
	)
	.await;
	let proxies = admitting(&[(&origin, "unused")]);

	for path in ["page", "bare"] {
		let refusal = read(&format!("{origin}/{path}"), &proxies, WITHIN).await;
		assert_eq!(refusal, Err(RemoteImageError::NotAnImage), "{path}");
	}
}

#[tokio::test]
async fn a_refused_status_a_closed_port_or_a_slow_answer_is_a_network_failure() {
	let origin = served(Router::new().route(
		"/slow",
		get(|| async {
			tokio::time::sleep(Duration::from_secs(5)).await;
			png()
		}),
	))
	.await;
	let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
	let closed = format!("http://{}", listener.local_addr().expect("the port is named"));
	drop(listener);
	let proxies = admitting(&[(&origin, "unused"), (&closed, "unused")]);

	let missing = read(&format!("{origin}/missing"), &proxies, WITHIN).await;
	let unreached = read(&format!("{closed}/cat"), &proxies, WITHIN).await;
	let slow = read(&format!("{origin}/slow"), &proxies, Duration::from_millis(100)).await;

	assert_eq!(missing, Err(RemoteImageError::NetworkFailure { status: Some(404) }));
	assert_eq!(unreached, Err(RemoteImageError::NetworkFailure { status: None }));
	assert_eq!(slow, Err(RemoteImageError::NetworkFailure { status: None }));
}

fn admitted_to_the_public_web(url: &str) -> Result<Option<&'static str>, FetchRefusal> {
	admitted(&Url::parse(url).expect("the url parses"), &Admission::PublicWeb)
}

#[test]
fn the_public_web_admits_a_public_address_over_http_or_https_without_a_bearer() {
	for url in [
		"https://93.184.215.14/cat.png",
		"http://[2606:2800:21f::1]/cat.png",
		"https://example.test/cat.png",
	] {
		assert!(matches!(admitted_to_the_public_web(url), Ok(None)), "{url}");
	}
}

#[test]
fn the_public_web_refuses_every_private_address_literal_on_every_hop() {
	for url in [
		"http://127.0.0.1/",
		"http://10.0.0.8/",
		"http://172.16.4.2/",
		"http://192.168.1.1/",
		"http://169.254.169.254/latest/meta-data",
		"http://0.0.0.0/",
		"http://[::1]/",
		"http://[::]/",
		"http://[fd00::1]/",
		"http://[fe80::1]/",
		"http://[::ffff:10.0.0.8]/",
		"http://100.64.0.1/",
	] {
		assert!(
			matches!(admitted_to_the_public_web(url), Err(FetchRefusal::PrivateAddress)),
			"{url}"
		);
	}
}

#[test]
fn the_public_web_refuses_a_scheme_other_than_http_or_https() {
	assert!(matches!(
		admitted_to_the_public_web("ftp://example.test/cat.png"),
		Err(FetchRefusal::UnsupportedScheme)
	));
}

#[test]
fn every_refused_range_refuses_its_sample_and_admits_its_nearest_public_neighbour() {
	let rows = [
		("0.0.0.0/8", "0.1.2.3", "1.0.0.0"),
		("10.0.0.0/8", "10.0.0.8", "11.0.0.0"),
		("100.64.0.0/10", "100.64.0.1", "100.63.255.255"),
		("127.0.0.0/8", "127.0.0.1", "128.0.0.0"),
		("169.254.0.0/16", "169.254.169.254", "169.255.0.0"),
		("172.16.0.0/12", "172.16.4.2", "172.32.0.0"),
		("192.0.0.0/24", "192.0.0.8", "192.0.1.0"),
		("192.168.0.0/16", "192.168.1.1", "192.169.0.0"),
		("198.18.0.0/15", "198.19.255.255", "198.20.0.0"),
		("224.0.0.0/4", "224.0.0.1", "223.255.255.255"),
		("240.0.0.0/4", "240.0.0.1", "223.255.255.255"),
		("255.255.255.255/32", "255.255.255.255", "223.255.255.255"),
		("fc00::/7", "fd00::1", "fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
		("fe80::/10", "fe80::1", "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
		("fec0::/10", "fec0::1", "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
		("ff00::/8", "ff02::1", "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff"),
		("::/96 compatible", "::10.0.0.8", "::8.8.8.8"),
		("::/96 loopback", "::1", "::8.8.8.8"),
		("::/96 unspecified", "::", "::8.8.8.8"),
		("::ffff:0:0/96", "::ffff:127.0.0.1", "::ffff:8.8.8.8"),
		("64:ff9b::/96", "64:ff9b::10.0.0.8", "64:ff9b::8.8.8.8"),
		("64:ff9b:1::/48", "64:ff9b:1:a00:0:800::", "64:ff9b:1:808:8:800::"),
		("2002::/16", "2002:a00:8::", "2002:808:808::"),
	];

	for (range, refused, admitted) in rows {
		let address = |sample: &str| sample.parse().expect("the sample is an address");
		assert!(!is_public(address(refused)), "{range} refuses {refused}");
		assert!(is_public(address(admitted)), "{range} admits {admitted}");
	}
}

#[test]
fn the_host_still_reaches_every_address_the_public_web_refuses() {
	for url in ["http://100.64.0.1/", "http://[64:ff9b::a00:8]/", "http://[2002:a00:8::]/"] {
		assert!(
			matches!(
				admitted(
					&Url::parse(url).expect("the url parses"),
					&Admission::Web(&HashMap::new())
				),
				Ok(None)
			),
			"{url}"
		);
	}
}
