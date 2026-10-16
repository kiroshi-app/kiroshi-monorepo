use std::sync::{LazyLock, PoisonError, RwLock};

use regex::{Captures, Regex};

use crate::agent::redact;

const MASK: &str = "[redacted]";

pub const ENV_MASK: &str = "[redacted-env]";

const SHORTEST_REDACTED_ENV_VALUE: usize = 4;

static ENV_VALUES: RwLock<Vec<String>> = RwLock::new(Vec::new());

static URL_WITH_SCHEME: LazyLock<Regex> =
	LazyLock::new(|| pattern(r#"(?i)\b(?:https?|wss?|file|tauri|asset)://[^\s"'`<>()]*"#));

static HOME_DIRECTORY: LazyLock<Regex> =
	LazyLock::new(|| pattern(r#"(?:/Users|/home)/[^/\s"'`]+|[A-Za-z]:\\Users\\[^\\\s"'`]+"#));

static EMAIL: LazyLock<Regex> = LazyLock::new(|| pattern(r"[\w.+-]+@[\w-]+(?:\.[\w-]+)+"));

static HOST_WITH_PORT: LazyLock<Regex> = LazyLock::new(|| {
	pattern(
		r"(\[[\dA-Fa-f:]+\]|\b\d{1,3}(?:\.\d{1,3}){3}|[A-Za-z][A-Za-z\d-]*(?:\.[A-Za-z\d-]+)*):\d{1,5}\b",
	)
});

static SOURCE_FILE_SUFFIX: LazyLock<Regex> =
	LazyLock::new(|| pattern(r"\.(?:[cm]?[jt]sx?|rs|swift|json|css|html)$"));

static BEARER: LazyLock<Regex> = LazyLock::new(|| pattern(r#"(?i)\b(Bearer)\s+[^\s"',;]+"#));

static NAMED_SECRET: LazyLock<Regex> = LazyLock::new(|| {
	pattern(
		r#"(?i)\b((?:access[_-]?|refresh[_-]?|auth[_-]?|id[_-]?)?token|api[_-]?key|apikey|secret|password|passwd)(["']?\s*[=:]\s*["']?)[^\s"'&,;]+"#,
	)
});

static PREFIXED_KEY: LazyLock<Regex> = LazyLock::new(|| {
	pattern(
		r"\b(?:sk-[\w-]{16,}|gh[pousr]_\w{20,}|github_pat_\w{20,}|xox[abprs]-[\w-]{10,}|AKIA[0-9A-Z]{16})",
	)
});

static JSON_WEB_TOKEN: LazyLock<Regex> = LazyLock::new(|| pattern(r"\beyJ[\w-]+\.[\w-]+\.[\w-]+"));

static SECRET_LOOKING: LazyLock<Regex> = LazyLock::new(|| pattern(r"\b[\w+/=-]{32,}"));

static UUID: LazyLock<Regex> =
	LazyLock::new(|| pattern(r"(?i)^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$"));

fn pattern(source: &str) -> Regex {
	Regex::new(source).expect("a scrubbing pattern is a constant that compiles")
}

pub fn remember_env_values<'a>(values: impl IntoIterator<Item = &'a String>) {
	let mut held = ENV_VALUES.write().unwrap_or_else(PoisonError::into_inner);
	for value in values {
		if value.len() >= SHORTEST_REDACTED_ENV_VALUE && !held.contains(value) {
			held.push(value.clone());
		}
	}
	held.sort_by_key(|value| std::cmp::Reverse(value.len()));
}

pub fn scrubbed(text: &str) -> String {
	without_shapes(&without_env_values(text))
}

fn without_env_values(text: &str) -> String {
	let held = ENV_VALUES.read().unwrap_or_else(PoisonError::into_inner);
	held.iter().fold(text.to_owned(), |text, value| text.replace(value.as_str(), ENV_MASK))
}

fn without_shapes(text: &str) -> String {
	let text = URL_WITH_SCHEME.replace_all(text, MASK);
	let text = redact::text(&text);
	let text = HOME_DIRECTORY.replace_all(&text, "~");
	let text = EMAIL.replace_all(&text, MASK);
	let text = without_hosts(&text);
	let text = BEARER.replace_all(&text, format!("$1 {MASK}"));
	let text = NAMED_SECRET.replace_all(&text, format!("$1$2{MASK}"));
	let text = PREFIXED_KEY.replace_all(&text, MASK);
	let text = JSON_WEB_TOKEN.replace_all(&text, MASK);
	SECRET_LOOKING
		.replace_all(&text, |found: &Captures| masked_unless_an_id(&found[0]))
		.into_owned()
}

fn without_hosts(text: &str) -> String {
	HOST_WITH_PORT
		.replace_all(text, |found: &Captures| {
			let whole = found.get(0).expect("a match holds its whole span");
			let host = &found[1];
			let before = text[..whole.start()].chars().next_back();
			let after = &text[whole.end()..];
			let is_named = host.starts_with(|first: char| first.is_ascii_alphabetic());
			let is_inside_a_word = before
				.is_some_and(|previous| previous.is_alphanumeric() || "_.-".contains(previous));
			let is_a_source_line = SOURCE_FILE_SUFFIX.is_match(host);
			let is_a_column = after.starts_with(':')
				&& after[1..].starts_with(|next: char| next.is_ascii_digit());
			if is_a_column || (is_named && (is_inside_a_word || is_a_source_line)) {
				return whole.as_str().to_owned();
			}
			MASK.to_owned()
		})
		.into_owned()
}

fn masked_unless_an_id(found: &str) -> String {
	let has_digit = found.chars().any(|character| character.is_ascii_digit());
	let has_letter = found.chars().any(|character| character.is_ascii_alphabetic());
	if !has_digit || !has_letter || UUID.is_match(found) {
		return found.to_owned();
	}
	MASK.to_owned()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_remembered_env_value_is_replaced_by_its_fixed_placeholder() {
		remember_env_values([&"plain-env-value-one".to_owned()]);
		assert_eq!(
			scrubbed("connecting with plain-env-value-one now"),
			"connecting with [redacted-env] now"
		);
	}

	#[test]
	fn the_longer_of_two_overlapping_env_values_is_replaced_whole() {
		remember_env_values([&"overlap".to_owned(), &"overlap-and-more".to_owned()]);
		assert_eq!(scrubbed("value overlap-and-more"), "value [redacted-env]");
	}

	#[test]
	fn an_env_value_too_short_to_be_told_apart_from_prose_is_kept() {
		remember_env_values([&"on".to_owned()]);
		assert_eq!(scrubbed("turned on"), "turned on");
	}

	#[test]
	fn urls_home_paths_and_emails_are_masked() {
		assert_eq!(scrubbed("GET https://api.example.com/v1?q=1 failed"), "GET [redacted] failed");
		assert_eq!(scrubbed("read /Users/someone/notes.txt"), "read ~/notes.txt");
		assert_eq!(scrubbed(r"read C:\Users\someone\notes.txt"), r"read ~\notes.txt");
		assert_eq!(scrubbed("signed in as someone@example.com"), "signed in as [redacted]");
	}

	#[test]
	fn hosts_with_a_port_are_masked_but_source_lines_are_kept() {
		assert_eq!(scrubbed("dial localhost:5173 refused"), "dial [redacted] refused");
		assert_eq!(scrubbed("dial 10.0.0.2:22"), "dial [redacted]");
		assert_eq!(scrubbed("dial [::1]:8080"), "dial [redacted]");
		assert_eq!(scrubbed("at session.ts:156"), "at session.ts:156");
		assert_eq!(scrubbed("at worker:12:5"), "at worker:12:5");
	}

	#[test]
	fn token_shapes_are_masked() {
		assert_eq!(scrubbed("Authorization: Bearer abc.def"), "Authorization: Bearer [redacted]");
		assert_eq!(scrubbed("api_key=hunter22"), "api_key=[redacted]");
		assert_eq!(scrubbed("password: \"hunter22\""), "password: \"[redacted]\"");
		assert_eq!(scrubbed("key sk-ant-0123456789abcdef"), "key [redacted]");
		assert_eq!(scrubbed("pat ghp_0123456789abcdefghijABCD"), "pat [redacted]");
		assert_eq!(scrubbed("jwt eyJhbGc.eyJzdWIi.c2lnbmF0dXJl"), "jwt [redacted]");
		assert_eq!(scrubbed("blob 0123456789abcdefghijklmnopqrstuvwx"), "blob [redacted]");
	}

	#[test]
	fn session_and_turn_ids_survive_for_the_log_to_be_read() {
		let line = "turn 3f2b8c1e-9a4d-4e2f-8b1a-0c9d8e7f6a5b of session 1";
		assert_eq!(scrubbed(line), line);
	}

	#[test]
	fn plain_event_lines_are_untouched() {
		let line = "sidecar exited code=Some(1) took_ms=1200";
		assert_eq!(scrubbed(line), line);
	}
}
