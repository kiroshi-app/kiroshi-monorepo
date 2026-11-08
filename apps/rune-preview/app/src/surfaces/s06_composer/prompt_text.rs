use std::path::PathBuf;

use chrono::{DateTime, Utc};
use kiroshi_core::attachments::attachment_block;

const ARROBASE: char = '@';
const COMMAND_MARK: char = '/';
const TOKEN_OPENING: char = '<';

pub struct Named<'a> {
	pub id: &'a str,
	pub name: &'a str,
}

pub fn mention_query(prompt: &str) -> Option<&str> {
	let at = prompt.rfind(ARROBASE)?;
	let query = &prompt[at + ARROBASE.len_utf8()..];
	let opens_a_word = prompt[..at].chars().next_back().is_none_or(char::is_whitespace);
	(opens_a_word && !query.contains(char::is_whitespace)).then_some(query)
}

pub fn command_query(prompt: &str, has_commands: bool) -> Option<&str> {
	let query = prompt.strip_prefix(COMMAND_MARK).filter(|_| has_commands)?;
	(!query.contains(char::is_whitespace)).then_some(query)
}

fn without_mention_draft(prompt: &str) -> &str {
	match mention_query(prompt) {
		Some(query) => &prompt[..prompt.len() - query.len() - ARROBASE.len_utf8()],
		None => prompt,
	}
}

pub fn prompt_with_mention(prompt: &str, name: &str) -> String {
	match mention_query(prompt) {
		Some(_) => format!("{}{ARROBASE}{name} ", without_mention_draft(prompt)),
		None => prompt.to_owned(),
	}
}

pub fn prompt_for_command(command: &str) -> String {
	format!("{command} ")
}

fn is_named_at(text: &str, from: usize, name: &str) -> bool {
	text.get(from..from + name.len()).is_some_and(|said| said.to_lowercase() == name.to_lowercase())
}

fn named_at<'a>(text: &str, from: usize, named: &'a [Named<'a>]) -> Option<&'a Named<'a>> {
	named
		.iter()
		.filter(|candidate| !candidate.name.is_empty() && is_named_at(text, from, candidate.name))
		.max_by_key(|candidate| candidate.name.len())
}

fn named_in<'a>(text: &str, named: &'a [Named<'a>]) -> Vec<&'a Named<'a>> {
	let mut found = Vec::new();
	let mut read = 0;
	while let Some(at) = text[read..].find(ARROBASE).map(|offset| read + offset) {
		let after = at + ARROBASE.len_utf8();
		let candidate = named_at(text, after, named);
		read = after + candidate.map_or(0, |candidate| candidate.name.len());
		found.extend(candidate);
	}
	found
}

pub fn to_mention_tokens(text: &str, named: &[Named]) -> String {
	let mut written = String::with_capacity(text.len());
	let mut read = 0;
	while let Some(at) = text[read..].find(ARROBASE).map(|offset| read + offset) {
		written.push_str(&text[read..at]);
		let after = at + ARROBASE.len_utf8();
		let is_token = text[..at].ends_with(TOKEN_OPENING);
		let candidate = if is_token { None } else { named_at(text, after, named) };
		match candidate {
			Some(candidate) => written.push_str(&format!("<@{}>", candidate.id)),
			None => written.push(ARROBASE),
		}
		read = after + candidate.map_or(0, |candidate| candidate.name.len());
	}
	written.push_str(&text[read..]);
	written
}

pub fn mentioned_ids(text: &str, named: &[Named]) -> Vec<String> {
	let mut ids: Vec<String> = Vec::new();
	for candidate in named_in(text, named) {
		if !ids.iter().any(|id| id == candidate.id) {
			ids.push(candidate.id.to_owned());
		}
	}
	ids
}

pub fn mention_counts(prompt: &str, named: &[Named]) -> Vec<(String, usize)> {
	let mut counts: Vec<(String, usize)> = Vec::new();
	for candidate in named_in(without_mention_draft(prompt), named) {
		match counts.iter_mut().find(|(id, _)| id == candidate.id) {
			Some((_, count)) => *count += 1,
			None => counts.push((candidate.id.to_owned(), 1)),
		}
	}
	counts
}

pub fn with_attachments(text: &str, paths: &[String], sent_at: i64) -> String {
	if paths.is_empty() {
		return text.to_owned();
	}
	let paths: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
	let block = attachment_block(&paths, sent_instant(sent_at));
	[text.trim(), block.as_str()]
		.into_iter()
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>()
		.join("\n")
}

fn sent_instant(sent_at: i64) -> DateTime<Utc> {
	let calendar_edge =
		if sent_at < 0 { DateTime::<Utc>::MIN_UTC } else { DateTime::<Utc>::MAX_UTC };
	DateTime::from_timestamp_millis(sent_at).unwrap_or(calendar_edge)
}

#[cfg(test)]
mod tests {
	use super::with_attachments;

	#[test]
	fn a_send_instant_beyond_the_calendar_clamps_to_its_edge() {
		let paths = ["/a/attachments/c/1.png".to_owned()];

		let late = with_attachments("look", &paths, i64::MAX);
		let early = with_attachments("look", &paths, i64::MIN);

		assert_eq!(
			late,
			"look\nAttached to this message, sent +262142-12-31T23:59:59.999Z, 1 file:\n1/1 /a/attachments/c/1.png"
		);
		assert_eq!(
			early,
			"look\nAttached to this message, sent -262143-01-01T00:00:00.000Z, 1 file:\n1/1 /a/attachments/c/1.png"
		);
	}
}
