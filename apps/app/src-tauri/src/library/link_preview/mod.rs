pub mod commands;
pub mod contract;
#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::sync::LazyLock;
use std::time::Duration;

use regex::{Captures, Regex};
use reqwest::header::{HeaderMap, CONTENT_TYPE};
use reqwest::{Response, Url};

use crate::remote_image::fetched;
use contract::{LibraryLinkPreview, LibraryLinkPreviewError};

const MAX_BYTES: usize = 2 * 1024 * 1024;
const READ_BOUND: Duration = Duration::from_secs(10);
const PAGE_MEDIA_TYPES: [&str; 2] = ["text/html", "application/xhtml+xml"];
const NAMED_ENTITIES: [(&str, char); 20] = [
	("amp", '&'),
	("lt", '<'),
	("gt", '>'),
	("quot", '"'),
	("apos", '\''),
	("nbsp", '\u{a0}'),
	("ndash", '\u{2013}'),
	("mdash", '\u{2014}'),
	("hellip", '\u{2026}'),
	("lsquo", '\u{2018}'),
	("rsquo", '\u{2019}'),
	("ldquo", '\u{201c}'),
	("rdquo", '\u{201d}'),
	("laquo", '\u{ab}'),
	("raquo", '\u{bb}'),
	("middot", '\u{b7}'),
	("bull", '\u{2022}'),
	("copy", '\u{a9}'),
	("reg", '\u{ae}'),
	("trade", '\u{2122}'),
];

static META_TAG: LazyLock<Regex> = LazyLock::new(|| pattern(r"(?is)<meta\b[^>]*>"));

static ATTRIBUTE: LazyLock<Regex> =
	LazyLock::new(|| pattern(r#"([^\s"'<>/=]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))"#));

static TITLE_ELEMENT: LazyLock<Regex> =
	LazyLock::new(|| pattern(r"(?is)<title\b[^>]*>(.*?)</title\s*>"));

static ENTITY: LazyLock<Regex> =
	LazyLock::new(|| pattern(r"&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);"));

fn pattern(source: &str) -> Regex {
	Regex::new(source).expect("a page pattern is a constant that compiles")
}

pub(crate) async fn read(
	url: &str,
	proxy_bearers: &HashMap<String, String>,
	within: Duration,
) -> Result<LibraryLinkPreview, LibraryLinkPreviewError> {
	tokio::time::timeout(within, async {
		let response = fetched(url, proxy_bearers).await?;
		let landed = response.url().clone();
		let page = page_of(response).await?;
		Ok(preview_of(url, &landed, &page))
	})
	.await
	.unwrap_or(Err(LibraryLinkPreviewError::NetworkFailure { status: None }))
}

async fn page_of(mut response: Response) -> Result<String, LibraryLinkPreviewError> {
	let status = response.status();
	if !status.is_success() {
		return Err(LibraryLinkPreviewError::NetworkFailure { status: Some(status.as_u16()) });
	}
	if !is_a_page(response.headers()) {
		return Err(LibraryLinkPreviewError::NotAPage);
	}
	let mut body = Vec::new();
	while let Some(chunk) = response.chunk().await? {
		let room = MAX_BYTES - body.len();
		body.extend_from_slice(&chunk[..chunk.len().min(room)]);
		if body.len() == MAX_BYTES {
			break;
		}
	}
	Ok(String::from_utf8_lossy(&body).into_owned())
}

fn is_a_page(headers: &HeaderMap) -> bool {
	headers
		.get(CONTENT_TYPE)
		.and_then(|declared| declared.to_str().ok())
		.and_then(|declared| declared.split(';').next())
		.map(|essence| essence.trim().to_ascii_lowercase())
		.is_some_and(|essence| PAGE_MEDIA_TYPES.contains(&essence.as_str()))
}

fn preview_of(url: &str, landed: &Url, page: &str) -> LibraryLinkPreview {
	let properties = open_graph_of(page);
	let host = landed.host_str().map_or_else(
		|| landed.to_string(),
		|host| host.strip_prefix("www.").unwrap_or(host).to_owned(),
	);
	let image = properties
		.get("og:image")
		.and_then(|image| landed.join(image).ok())
		.filter(|image| image.scheme() == "https");
	let alt = image.as_ref().and_then(|_| properties.get("og:image:alt").cloned());
	LibraryLinkPreview {
		url: url.to_owned(),
		title: properties
			.get("og:title")
			.cloned()
			.or_else(|| title_of(page))
			.unwrap_or_else(|| host.clone()),
		site: properties.get("og:site_name").cloned().unwrap_or(host),
		image: image.map(String::from),
		alt,
	}
}

fn open_graph_of(page: &str) -> HashMap<String, String> {
	let mut properties = HashMap::new();
	for tag in META_TAG.find_iter(page) {
		let attributes = attributes_of(tag.as_str());
		let named = attributes.get("property").or_else(|| attributes.get("name"));
		let (Some(name), Some(content)) = (named, attributes.get("content")) else {
			continue;
		};
		let content = decoded(content).trim().to_owned();
		if !content.is_empty() {
			properties.entry(name.to_ascii_lowercase()).or_insert(content);
		}
	}
	properties
}

fn attributes_of(tag: &str) -> HashMap<String, &str> {
	ATTRIBUTE
		.captures_iter(tag)
		.filter_map(|captures| {
			let value = captures.get(2).or(captures.get(3)).or(captures.get(4))?;
			Some((captures[1].to_ascii_lowercase(), value.as_str()))
		})
		.collect()
}

fn title_of(page: &str) -> Option<String> {
	let title = decoded(&TITLE_ELEMENT.captures(page)?[1]).trim().to_owned();
	(!title.is_empty()).then_some(title)
}

fn decoded(text: &str) -> String {
	ENTITY
		.replace_all(text, |captures: &Captures| {
			character_of(&captures[1]).map_or_else(|| captures[0].to_owned(), String::from)
		})
		.into_owned()
}

fn character_of(entity: &str) -> Option<char> {
	if let Some(hexadecimal) = entity.strip_prefix("#x").or_else(|| entity.strip_prefix("#X")) {
		return u32::from_str_radix(hexadecimal, 16).ok().and_then(char::from_u32);
	}
	if let Some(decimal) = entity.strip_prefix('#') {
		return decimal.parse().ok().and_then(char::from_u32);
	}
	NAMED_ENTITIES.iter().find(|(name, _)| *name == entity).map(|(_, character)| *character)
}
