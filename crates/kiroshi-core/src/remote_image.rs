pub mod contract;
pub mod commands;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::net::{IpAddr, Ipv4Addr, Ipv6Addr};
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::dns::{Addrs, Name, Resolve, Resolving};
use reqwest::header::{HeaderMap, CONTENT_TYPE, LOCATION};
use reqwest::{redirect, Client, Response, Url};

use crate::missions::github::installed_tls_provider;
pub use contract::FetchedImage;
use contract::{FetchRefusal, RemoteImage, RemoteImageError, ResolvedToPrivateAddress};

pub const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
pub const READ_BOUND: Duration = Duration::from_secs(30);

pub enum Admission<'a> {
	HttpsOrHeldProxy(&'a HashMap<String, String>),
	Web(&'a HashMap<String, String>),
	PublicWeb,
}

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

const REFUSED_V4: [(Ipv4Addr, u32); 12] = [
	(Ipv4Addr::new(0, 0, 0, 0), 8),
	(Ipv4Addr::new(10, 0, 0, 0), 8),
	(Ipv4Addr::new(100, 64, 0, 0), 10),
	(Ipv4Addr::new(127, 0, 0, 0), 8),
	(Ipv4Addr::new(169, 254, 0, 0), 16),
	(Ipv4Addr::new(172, 16, 0, 0), 12),
	(Ipv4Addr::new(192, 0, 0, 0), 24),
	(Ipv4Addr::new(192, 168, 0, 0), 16),
	(Ipv4Addr::new(198, 18, 0, 0), 15),
	(Ipv4Addr::new(224, 0, 0, 0), 4),
	(Ipv4Addr::new(240, 0, 0, 0), 4),
	(Ipv4Addr::new(255, 255, 255, 255), 32),
];

enum V6Range {
	Refused,
	Embeds(fn([u8; 16]) -> Ipv4Addr),
}

const V6_RANGES: [(Ipv6Addr, u32, V6Range); 9] = [
	(Ipv6Addr::new(0xfc00, 0, 0, 0, 0, 0, 0, 0), 7, V6Range::Refused),
	(Ipv6Addr::new(0xfe80, 0, 0, 0, 0, 0, 0, 0), 10, V6Range::Refused),
	(Ipv6Addr::new(0xfec0, 0, 0, 0, 0, 0, 0, 0), 10, V6Range::Refused),
	(Ipv6Addr::new(0xff00, 0, 0, 0, 0, 0, 0, 0), 8, V6Range::Refused),
	(Ipv6Addr::new(0, 0, 0, 0, 0, 0, 0, 0), 96, V6Range::Embeds(last_four_octets)),
	(Ipv6Addr::new(0, 0, 0, 0, 0, 0xffff, 0, 0), 96, V6Range::Embeds(last_four_octets)),
	(Ipv6Addr::new(0x64, 0xff9b, 0, 0, 0, 0, 0, 0), 96, V6Range::Embeds(last_four_octets)),
	(Ipv6Addr::new(0x64, 0xff9b, 1, 0, 0, 0, 0, 0), 48, V6Range::Embeds(around_the_u_octet)),
	(Ipv6Addr::new(0x2002, 0, 0, 0, 0, 0, 0, 0), 16, V6Range::Embeds(after_the_6to4_prefix)),
];

fn last_four_octets(octets: [u8; 16]) -> Ipv4Addr {
	Ipv4Addr::new(octets[12], octets[13], octets[14], octets[15])
}

fn around_the_u_octet(octets: [u8; 16]) -> Ipv4Addr {
	Ipv4Addr::new(octets[6], octets[7], octets[9], octets[10])
}

fn after_the_6to4_prefix(octets: [u8; 16]) -> Ipv4Addr {
	Ipv4Addr::new(octets[2], octets[3], octets[4], octets[5])
}

fn is_public(address: IpAddr) -> bool {
	match address {
		IpAddr::V4(v4) => is_public_v4(v4),
		IpAddr::V6(v6) => {
			let range = V6_RANGES.iter().find(|(network, length, _)| {
				within_prefix(u128::from(v6), u128::from(*network), *length, 128)
			});
			match range {
				Some((_, _, V6Range::Refused)) => false,
				Some((_, _, V6Range::Embeds(embedded))) => is_public_v4(embedded(v6.octets())),
				None => true,
			}
		}
	}
}

fn is_public_v4(address: Ipv4Addr) -> bool {
	!REFUSED_V4.iter().any(|(network, length)| {
		within_prefix(u32::from(address).into(), u32::from(*network).into(), *length, 32)
	})
}

fn within_prefix(address: u128, network: u128, length: u32, width: u32) -> bool {
	let host_bits = width - length;
	address >> host_bits == network >> host_bits
}

pub async fn read(
	url: &str,
	proxy_bearers: &HashMap<String, String>,
	within: Duration,
) -> Result<RemoteImage, RemoteImageError> {
	let admission = Admission::HttpsOrHeldProxy(proxy_bearers);
	tokio::time::timeout(within, async { image_of(fetched(url, &admission).await?).await })
		.await
		.unwrap_or(Err(RemoteImageError::NetworkFailure { status: None }))
}

pub async fn fetched(
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

pub async fn image_bytes_of(
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
