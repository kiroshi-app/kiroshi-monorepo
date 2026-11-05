pub mod commands;
pub mod contract;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::error::Error;
use std::fmt;
use std::net::IpAddr;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{HeaderMap, CONTENT_TYPE, LOCATION};
use reqwest::{redirect, Client, Response, Url};

use crate::missions::github::installed_tls_provider;
use contract::{RemoteImage, RemoteImageError};

pub(crate) const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
pub(crate) const READ_BOUND: Duration = Duration::from_secs(30);

pub(crate) enum Admission<'a> {
	HttpsOrHeldProxy(&'a HashMap<String, String>),
	Web(&'a HashMap<String, String>),
	PublicWeb,
}

pub(crate) enum FetchRefusal {
	UnsupportedScheme,
	PrivateAddress,
	NetworkFailure { status: Option<u16> },
}

impl From<reqwest::Error> for FetchRefusal {
	fn from(error: reqwest::Error) -> Self {
		if resolved_to_a_private_address(&error) {
			return FetchRefusal::PrivateAddress;
		}
		FetchRefusal::NetworkFailure { status: error.status().map(|status| status.as_u16()) }
	}
}

fn resolved_to_a_private_address(error: &(dyn Error + 'static)) -> bool {
	let mut cause = Some(error);
	while let Some(current) = cause {
		if current.is::<ResolvedToPrivateAddress>() {
			return true;
		}
		cause = current.source();
	}
	false
}

pub(crate) struct FetchedImage {
	pub(crate) media_type: String,
	pub(crate) bytes: Vec<u8>,
}

#[derive(Debug)]
struct ResolvedToPrivateAddress;

impl fmt::Display for ResolvedToPrivateAddress {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.write_str("the name resolves to a private address")
	}
}

impl Error for ResolvedToPrivateAddress {}

struct PublicAddresses;

impl Resolve for PublicAddresses {
	fn resolve(&self, name: Name) -> Resolving {
		let host = name.as_str().to_owned();
		Box::pin(async move {
			let addresses: Vec<_> = tokio::net::lookup_host((host.as_str(), 0)).await?.collect();
			if addresses.iter().any(|address| !is_public(address.ip())) {
				return Err(ResolvedToPrivateAddress.into());
			}
			Ok(Box::new(addresses.into_iter()) as Addrs)
		})
	}
}

fn is_public(address: IpAddr) -> bool {
	match address.to_canonical() {
		IpAddr::V4(v4) => {
			!(v4.is_loopback() || v4.is_private() || v4.is_link_local() || v4.is_unspecified())
		}
		IpAddr::V6(v6) => {
			!(v6.is_loopback()
				|| v6.is_unique_local()
				|| v6.is_unicast_link_local()
				|| v6.is_unspecified())
		}
	}
}

pub(crate) async fn read(
	url: &str,
	proxy_bearers: &HashMap<String, String>,
	within: Duration,
) -> Result<RemoteImage, RemoteImageError> {
	let admission = Admission::HttpsOrHeldProxy(proxy_bearers);
	tokio::time::timeout(within, async { image_of(fetched(url, &admission).await?).await })
		.await
		.unwrap_or(Err(RemoteImageError::NetworkFailure { status: None }))
}

pub(crate) async fn fetched(
	url: &str,
	admission: &Admission<'_>,
) -> Result<Response, FetchRefusal> {
	let url = Url::parse(url).map_err(|_| FetchRefusal::UnsupportedScheme)?;
	admitted(&url, admission)?;
	installed_tls_provider();
	let builder = match admission {
		Admission::PublicWeb => Client::builder().no_proxy().dns_resolver(PublicAddresses),
		Admission::HttpsOrHeldProxy(_) | Admission::Web(_) => Client::builder(),
	};
	let client = builder.redirect(redirect::Policy::none()).build()?;
	followed(&client, url, admission).await
}

async fn followed(
	client: &Client,
	mut url: Url,
	admission: &Admission<'_>,
) -> Result<Response, FetchRefusal> {
	let mut redirects = 0;
	loop {
		let response = sent(client, &url, admitted(&url, admission)?).await?;
		match redirected(&response, &url) {
			Some(next) if redirects < MAX_REDIRECTS => {
				url = next;
				redirects += 1;
			}
			_ => return Ok(response),
		}
	}
}

fn admitted<'a>(url: &Url, admission: &Admission<'a>) -> Result<Option<&'a str>, FetchRefusal> {
	match admission {
		Admission::HttpsOrHeldProxy(proxy_bearers) => {
			let bearer = held_bearer(url, proxy_bearers);
			if bearer.is_none() && url.scheme() != "https" {
				return Err(FetchRefusal::UnsupportedScheme);
			}
			Ok(bearer)
		}
		Admission::Web(proxy_bearers) => {
			web_scheme(url)?;
			Ok(held_bearer(url, proxy_bearers))
		}
		Admission::PublicWeb => {
			web_scheme(url)?;
			public_literal(url)?;
			Ok(None)
		}
	}
}

fn held_bearer<'a>(url: &Url, proxy_bearers: &'a HashMap<String, String>) -> Option<&'a str> {
	proxy_bearers.get(&url.origin().ascii_serialization()).map(String::as_str)
}

fn web_scheme(url: &Url) -> Result<(), FetchRefusal> {
	match url.scheme() {
		"http" | "https" => Ok(()),
		_ => Err(FetchRefusal::UnsupportedScheme),
	}
}

fn public_literal(url: &Url) -> Result<(), FetchRefusal> {
	let host = url.host_str().unwrap_or_default();
	let literal = host.trim_start_matches('[').trim_end_matches(']').parse::<IpAddr>();
	match literal {
		Ok(address) if !is_public(address) => Err(FetchRefusal::PrivateAddress),
		_ => Ok(()),
	}
}

async fn sent(client: &Client, url: &Url, bearer: Option<&str>) -> Result<Response, FetchRefusal> {
	let request = client.get(url.clone());
	let request = match bearer {
		Some(bearer) => request.bearer_auth(bearer),
		None => request,
	};
	Ok(request.send().await?)
}

fn redirected(response: &Response, url: &Url) -> Option<Url> {
	if !response.status().is_redirection() {
		return None;
	}
	let location = response.headers().get(LOCATION)?.to_str().ok()?;
	url.join(location).ok()
}

async fn image_of(response: Response) -> Result<RemoteImage, RemoteImageError> {
	let image = image_bytes_of(response).await?;
	Ok(RemoteImage { media_type: image.media_type, base64: STANDARD.encode(image.bytes) })
}

pub(crate) async fn image_bytes_of(
	mut response: Response,
) -> Result<FetchedImage, RemoteImageError> {
	let status = response.status();
	if !status.is_success() {
		return Err(RemoteImageError::NetworkFailure { status: Some(status.as_u16()) });
	}
	let media_type = image_media_type(response.headers()).ok_or(RemoteImageError::NotAnImage)?;
	let too_large = RemoteImageError::TooLarge { limit: MAX_BYTES };
	if response.content_length().is_some_and(|declared| declared > MAX_BYTES) {
		return Err(too_large);
	}
	let mut body = Vec::new();
	while let Some(chunk) = response.chunk().await? {
		if (body.len() + chunk.len()) as u64 > MAX_BYTES {
			return Err(too_large);
		}
		body.extend_from_slice(&chunk);
	}
	Ok(FetchedImage { media_type, bytes: body })
}

fn image_media_type(headers: &HeaderMap) -> Option<String> {
	let declared = headers.get(CONTENT_TYPE)?.to_str().ok()?;
	let essence = declared.split(';').next()?.trim().to_ascii_lowercase();
	let has_a_subtype = essence.strip_prefix("image/").is_some_and(|subtype| !subtype.is_empty());
	has_a_subtype.then_some(essence)
}
