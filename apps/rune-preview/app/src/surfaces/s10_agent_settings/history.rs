use std::cmp::Reverse;
use std::collections::HashSet;

use kiroshi_core::conversations::contract::{BotHistoryEntry, HistoryAuthor};

use kiroshi_rune_kit::strings::bots::history::day;
use kiroshi_rune_kit::strings::{Key, Language};

pub const UNDONE_TITLE_PREFIX: &str = "Change undone: ";

const SECONDS_PER_DAY: i64 = 86_400;

const MONTHS: [&str; 12] = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

#[derive(Clone, Debug, PartialEq)]
pub struct Run {
	pub id: String,
	pub oldest_id: String,
	pub author: HistoryAuthor,
	pub title: String,
	pub body: String,
	pub timestamp: i64,
	pub paths: Vec<String>,
	pub entry_count: usize,
	pub is_undone: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ShownChange {
	pub id: String,
	pub author: HistoryAuthor,
	pub sentence: String,
	pub detail: Option<String>,
	pub time: String,
	pub retouches: usize,
	pub is_undone: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ShownDay {
	pub label: String,
	pub changes: Vec<ShownChange>,
}

struct Civil {
	year: i64,
	month: usize,
	day: i64,
}

pub fn day_of(timestamp: i64) -> i64 {
	timestamp.div_euclid(SECONDS_PER_DAY)
}

fn civil_of(day_number: i64) -> Civil {
	let shifted = day_number + 719_468;
	let era = shifted.div_euclid(146_097);
	let day_of_era = shifted.rem_euclid(146_097);
	let year_of_era =
		(day_of_era - day_of_era / 1_460 + day_of_era / 36_524 - day_of_era / 146_096) / 365;
	let day_of_year = day_of_era - (365 * year_of_era + year_of_era / 4 - year_of_era / 100);
	let month_index = (5 * day_of_year + 2) / 153;
	let day = day_of_year - (153 * month_index + 2) / 5 + 1;
	let month = if month_index < 10 { month_index + 3 } else { month_index - 9 };
	let year = year_of_era + era * 400 + i64::from(month <= 2);
	Civil { year, month: (month - 1) as usize, day }
}

fn said(key: Key) -> String {
	key.text(Language::En).to_owned()
}

fn day_label(day_number: i64, today: i64) -> String {
	if day_number == today {
		return said(day::TODAY);
	}
	if day_number == today - 1 {
		return said(day::YESTERDAY);
	}
	let civil = civil_of(day_number);
	format!("{} {}", civil.day, MONTHS[civil.month])
}

fn time_of(timestamp: i64) -> String {
	let seconds = timestamp.rem_euclid(SECONDS_PER_DAY);
	format!("{:02}:{:02}", seconds / 3_600, seconds % 3_600 / 60)
}

pub fn oldest_date(entries: &[BotHistoryEntry]) -> String {
	let Some(oldest) = entries.iter().map(|entry| entry.timestamp).min() else {
		return String::new();
	};
	let civil = civil_of(day_of(oldest));
	format!("{} {} {}", civil.day, MONTHS[civil.month], civil.year)
}

fn undone_title(entry: &BotHistoryEntry) -> Option<&str> {
	entry.title.strip_prefix(UNDONE_TITLE_PREFIX)
}

fn paths_key(entry: &BotHistoryEntry) -> Vec<&str> {
	let mut paths: Vec<&str> = entry.paths.iter().map(String::as_str).collect();
	paths.sort_unstable();
	paths
}

fn undone_ids(entries: &[BotHistoryEntry]) -> HashSet<String> {
	let mut undone = HashSet::new();
	for (index, entry) in entries.iter().enumerate() {
		let Some(title) = undone_title(entry) else { continue };
		let target = entries[index + 1..]
			.iter()
			.find(|older| older.title == title && !undone.contains(&older.id));
		if let Some(target) = target {
			undone.insert(target.id.clone());
		}
	}
	undone
}

fn joins(previous: &BotHistoryEntry, entry: &BotHistoryEntry) -> bool {
	undone_title(previous).is_none()
		&& undone_title(entry).is_none()
		&& previous.author == entry.author
		&& day_of(previous.timestamp) == day_of(entry.timestamp)
		&& paths_key(previous) == paths_key(entry)
}

fn started(entry: &BotHistoryEntry, is_undone: bool) -> Run {
	Run {
		id: entry.id.clone(),
		oldest_id: entry.id.clone(),
		author: entry.author,
		title: entry.title.clone(),
		body: entry.body.clone(),
		timestamp: entry.timestamp,
		paths: entry.paths.clone(),
		entry_count: 1,
		is_undone,
	}
}

pub fn runs_of(entries: &[BotHistoryEntry]) -> Vec<Run> {
	let mut sorted = entries.to_vec();
	sorted.sort_by_key(|entry| Reverse(entry.timestamp));
	let undone = undone_ids(&sorted);
	let mut runs: Vec<Run> = Vec::new();
	for (index, entry) in sorted.iter().enumerate() {
		let previous = index.checked_sub(1).map(|at| &sorted[at]);
		if let (Some(last), Some(previous)) = (runs.last_mut(), previous)
			&& joins(previous, entry)
		{
			last.oldest_id = entry.id.clone();
			last.entry_count += 1;
			continue;
		}
		runs.push(started(entry, undone.contains(&entry.id)));
	}
	runs
}

fn folded(text: &str) -> String {
	text.chars().flat_map(char::to_lowercase).map(without_accent).collect()
}

fn without_accent(letter: char) -> char {
	match letter {
		'à' | 'á' | 'â' | 'ã' | 'ä' | 'å' => 'a',
		'ç' => 'c',
		'è' | 'é' | 'ê' | 'ë' => 'e',
		'ì' | 'í' | 'î' | 'ï' => 'i',
		'ñ' => 'n',
		'ò' | 'ó' | 'ô' | 'õ' | 'ö' => 'o',
		'ù' | 'ú' | 'û' | 'ü' => 'u',
		'ý' | 'ÿ' => 'y',
		other => other,
	}
}

fn holds(run: &Run, text: &str) -> bool {
	[&run.title, &run.body].into_iter().chain(&run.paths).any(|field| folded(field).contains(text))
}

pub fn matching<'a>(runs: &'a [Run], search: &str) -> Vec<&'a Run> {
	let text = folded(search.trim());
	runs.iter().filter(|run| text.is_empty() || holds(run, &text)).collect()
}

fn change_of(run: &Run) -> ShownChange {
	ShownChange {
		id: run.id.clone(),
		author: run.author,
		sentence: run.title.clone(),
		detail: (!run.body.is_empty()).then(|| run.body.clone()),
		time: time_of(run.timestamp),
		retouches: if run.entry_count > 1 { run.entry_count } else { 0 },
		is_undone: run.is_undone,
	}
}

pub fn days_of(runs: &[&Run], today: i64) -> Vec<ShownDay> {
	let mut days: Vec<(i64, ShownDay)> = Vec::new();
	for run in runs {
		let day_number = day_of(run.timestamp);
		match days.last_mut() {
			Some((held, day)) if *held == day_number => day.changes.push(change_of(run)),
			_ => days.push((
				day_number,
				ShownDay { label: day_label(day_number, today), changes: vec![change_of(run)] },
			)),
		}
	}
	days.into_iter().map(|(_, day)| day).collect()
}
