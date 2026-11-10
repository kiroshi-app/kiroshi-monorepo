use std::time::Duration;

use reqwest::header::{HeaderMap, HeaderValue, USER_AGENT};
use reqwest::{Client, StatusCode, Url};
use serde::de::DeserializeOwned;

use super::contract::ApplicationsError;
use crate::missions::github::installed_tls_provider;

const TIMEOUT: Duration = Duration::from_secs(30);

const AGENT: &str = "Kiroshi";

pub(super) fn parsed(base: &str) -> Result<Url, ApplicationsError> {
	Url::parse(base)
		.map_err(|error| ApplicationsError::RegistryUnreached { detail: error.to_string() })
}

pub(super) fn client() -> Result<Client, ApplicationsError> {
	installed_tls_provider();
	let mut headers = HeaderMap::new();
	headers.insert(USER_AGENT, HeaderValue::from_static(AGENT));
	Client::builder().timeout(TIMEOUT).default_headers(headers).build().map_err(|error| {
		ApplicationsError::RegistryUnreached {
			detail: format!("the http client was not built: {error}"),
		}
	})
}

pub(super) fn endpoint(base: &Url, segments: &[&str]) -> Result<Url, ApplicationsError> {
	let mut url = base.clone();
	url.path_segments_mut()
		.map_err(|()| ApplicationsError::RegistryUnreached {
			detail: format!("{base} cannot hold a path"),
		})?
		.pop_if_empty()
		.extend(segments);
	Ok(url)
}

pub(super) async fn read<T: DeserializeOwned>(
	client: &Client,
	url: Url,
) -> Result<T, ApplicationsError> {
	let answer = client.get(url).send().await.map_err(unreached)?;
	if answer.status() != StatusCode::OK {
		return Err(ApplicationsError::RegistryRefused { status: answer.status().as_u16() });
	}
	answer
		.json::<T>()
		.await
		.map_err(|error| ApplicationsError::RegistryUnreadable { detail: error.to_string() })
}

fn unreached(error: reqwest::Error) -> ApplicationsError {
	if error.is_timeout() {
		return ApplicationsError::RegistryTimedOut;
	}
	ApplicationsError::RegistryUnreached { detail: error.to_string() }
}

pub(super) fn variable(declared: &str) -> String {
	let named: String = declared
		.chars()
		.map(|held| if held.is_ascii_alphanumeric() { held.to_ascii_uppercase() } else { '_' })
		.collect();
	if named.starts_with(|held: char| held.is_ascii_digit()) {
		return format!("_{named}");
	}
	named
}
