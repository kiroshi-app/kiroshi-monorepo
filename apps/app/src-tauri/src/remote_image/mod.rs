pub mod commands;
pub mod contract;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::time::Duration;

use base64::engine::general_purpose::STANDARD;
use base64::Engine;
use reqwest::header::{HeaderMap, CONTENT_TYPE, LOCATION};
use reqwest::{redirect, Client, Response, Url};

use crate::missions::github::installed_tls_provider;
use contract::{RemoteImage, RemoteImageError};

pub(crate) const MAX_BYTES: u64 = 20 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const READ_BOUND: Duration = Duration::from_secs(30);

pub(crate) async fn read(
	url: &str,
	proxy_bearers: &HashMap<String, String>,
	within: Duration,
) -> Result<RemoteImage, RemoteImageError> {
	let url = Url::parse(url).map_err(|_| RemoteImageError::UnsupportedScheme)?;
	bearer_admitted(&url, proxy_bearers)?;
	installed_tls_provider();
	let client = Client::builder().redirect(redirect::Policy::none()).build()?;
	tokio::time::timeout(within, followed(&client, url, proxy_bearers))
		.await
		.unwrap_or(Err(RemoteImageError::NetworkFailure { status: None }))
}

async fn followed(
	client: &Client,
	mut url: Url,
	proxy_bearers: &HashMap<String, String>,
) -> Result<RemoteImage, RemoteImageError> {
	let mut redirects = 0;
	loop {
		let response = sent(client, &url, bearer_admitted(&url, proxy_bearers)?).await?;
		match redirected(&response, &url) {
			Some(next) if redirects < MAX_REDIRECTS => {
				url = next;
				redirects += 1;
			}
			_ => return image_of(response).await,
		}
	}
}

fn bearer_admitted<'a>(
	url: &Url,
	proxy_bearers: &'a HashMap<String, String>,
) -> Result<Option<&'a str>, RemoteImageError> {
	let bearer = proxy_bearers.get(&url.origin().ascii_serialization()).map(String::as_str);
	if bearer.is_none() && url.scheme() != "https" {
		return Err(RemoteImageError::UnsupportedScheme);
	}
	Ok(bearer)
}

async fn sent(
	client: &Client,
	url: &Url,
	bearer: Option<&str>,
) -> Result<Response, RemoteImageError> {
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

async fn image_of(mut response: Response) -> Result<RemoteImage, RemoteImageError> {
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
	Ok(RemoteImage { media_type, base64: STANDARD.encode(body) })
}

fn image_media_type(headers: &HeaderMap) -> Option<String> {
	let declared = headers.get(CONTENT_TYPE)?.to_str().ok()?;
	let essence = declared.split(';').next()?.trim().to_ascii_lowercase();
	let has_a_subtype = essence.strip_prefix("image/").is_some_and(|subtype| !subtype.is_empty());
	has_a_subtype.then_some(essence)
}
