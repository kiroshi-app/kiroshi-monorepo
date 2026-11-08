const ARROBASE: char = '@';
const COMMAND_MARK: char = '/';
const TOKEN_OPENING: char = '<';
const BLOCK_OPENING: &str = "Attached to this message, sent ";
const DAY_MS: i64 = 86_400_000;

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
	let block = attachment_block(paths, sent_at);
	[text.trim(), block.as_str()]
		.into_iter()
		.filter(|part| !part.is_empty())
		.collect::<Vec<_>>()
		.join("\n")
}

fn attachment_block(paths: &[String], sent_at: i64) -> String {
	let count = paths.len();
	let noun = if count == 1 { "file" } else { "files" };
	let header = format!("{BLOCK_OPENING}{}, {count} {noun}:", iso_utc(sent_at));
	let lines =
		paths.iter().enumerate().map(|(index, path)| format!("{}/{count} {path}", index + 1));
	std::iter::once(header).chain(lines).collect::<Vec<_>>().join("\n")
}

fn civil_date(days: i64) -> (i64, i64, i64) {
	let shifted = days + 719_468;
	let era = shifted.div_euclid(146_097);
	let day_of_era = shifted.rem_euclid(146_097);
	let year_of_era =
		(day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
	let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
	let shifted_month = (5 * day_of_year + 2) / 153;
	let day = day_of_year - (153 * shifted_month + 2) / 5 + 1;
	let month = if shifted_month < 10 { shifted_month + 3 } else { shifted_month - 9 };
	let year = year_of_era + era * 400 + i64::from(month <= 2);
	(year, month, day)
}

pub fn iso_utc(at: i64) -> String {
	let (year, month, day) = civil_date(at.div_euclid(DAY_MS));
	let of_day = at.rem_euclid(DAY_MS);
	let (hours, minutes) = (of_day / 3_600_000, of_day / 60_000 % 60);
	let (seconds, millis) = (of_day / 1_000 % 60, of_day % 1_000);
	format!("{year:04}-{month:02}-{day:02}T{hours:02}:{minutes:02}:{seconds:02}.{millis:03}Z")
}
