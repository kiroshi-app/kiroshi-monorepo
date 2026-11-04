use std::collections::{HashMap, HashSet};
use std::mem;

use reqwest::Url;
use serde_json::Value;

use crate::conversations::contract::WebSource;

const WEB_FETCH: &str = "WebFetch";
const WEB_SEARCH: &str = "WebSearch";

#[derive(Debug)]
enum WebCall {
	Fetch { url: String },
	Search,
}

#[derive(Debug, Default)]
pub(super) struct WebReads {
	calls: HashMap<String, WebCall>,
	sources: Vec<WebSource>,
	seen: HashSet<String>,
}

impl WebReads {
	pub(super) fn called(&mut self, id: &str, name: &str, input: &Value) {
		let call = match name {
			WEB_FETCH => match input.get("url").and_then(Value::as_str) {
				Some(url) => WebCall::Fetch { url: url.to_owned() },
				None => return,
			},
			WEB_SEARCH => WebCall::Search,
			_ => return,
		};
		self.calls.insert(id.to_owned(), call);
	}

	pub(super) fn answered(&mut self, id: &str, is_error: bool, output: Option<&Value>) {
		let Some(call) = self.calls.remove(id) else {
			return;
		};
		if is_error || is_detached(output) {
			return;
		}
		match call {
			WebCall::Fetch { url } => self.read(&url, None),
			WebCall::Search => {
				for (url, title) in search_links(output) {
					self.read(url, title);
				}
			}
		}
	}

	pub(super) fn take(&mut self) -> Vec<WebSource> {
		self.calls.clear();
		self.seen.clear();
		mem::take(&mut self.sources)
	}

	fn read(&mut self, url: &str, title: Option<&str>) {
		let Some(mut page) = Url::parse(url).ok().filter(is_web_page) else {
			return;
		};
		let Some(domain) = page.host_str().map(domain_of) else {
			return;
		};
		page.set_fragment(None);
		if !self.seen.insert(page.into()) {
			return;
		}
		self.sources.push(WebSource {
			url: url.to_owned(),
			domain,
			title: title.map(str::trim).filter(|title| !title.is_empty()).map(str::to_owned),
		});
	}
}

fn is_web_page(url: &Url) -> bool {
	matches!(url.scheme(), "http" | "https")
}

fn domain_of(host: &str) -> String {
	let host = host.to_ascii_lowercase();
	match host.strip_prefix("www.") {
		Some(domain) => domain.to_owned(),
		None => host,
	}
}

fn is_detached(output: Option<&Value>) -> bool {
	output
		.and_then(|output| output.get("detachedToolCall"))
		.and_then(Value::as_bool)
		.unwrap_or_default()
}

fn search_links(output: Option<&Value>) -> impl Iterator<Item = (&str, Option<&str>)> {
	output
		.and_then(|output| output.get("results"))
		.and_then(Value::as_array)
		.into_iter()
		.flatten()
		.filter_map(|result| result.get("content")?.as_array())
		.flatten()
		.filter_map(|hit| {
			Some((hit.get("url")?.as_str()?, hit.get("title").and_then(Value::as_str)))
		})
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;

	fn fetched(reads: &mut WebReads, id: &str, url: &str, output: Value) {
		reads.called(id, WEB_FETCH, &json!({ "url": url }));
		reads.answered(id, false, Some(&output));
	}

	#[test]
	fn a_fetch_that_stepped_aside_for_a_message_reads_no_page_yet() {
		let mut reads = WebReads::default();

		fetched(
			&mut reads,
			"toolu_1",
			"https://docs.rs/serde",
			json!({ "detachedToolCall": true }),
		);

		assert!(reads.take().is_empty());
	}

	#[test]
	fn a_page_read_again_in_the_next_turn_is_kept_again() {
		let mut reads = WebReads::default();
		fetched(&mut reads, "toolu_1", "https://docs.rs/serde", json!({ "code": 200 }));
		let first_turn = reads.take();

		fetched(&mut reads, "toolu_2", "https://docs.rs/serde", json!({ "code": 200 }));

		assert_eq!(first_turn.len(), 1);
		assert_eq!(reads.take(), first_turn);
	}
}
