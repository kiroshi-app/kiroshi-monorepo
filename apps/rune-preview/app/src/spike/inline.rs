use rune::{Mark, MarkRange};

const PAIRED_MARKERS: &[(&str, Mark)] =
	&[("**", Mark::Bold), ("__", Mark::Bold), ("*", Mark::Italic), ("_", Mark::Italic)];

const ESCAPED: &[char] = &['\\', '*', '_', '`', '[', ']'];

pub fn parse(markdown: &str) -> (String, Vec<MarkRange>) {
	let mut text = String::with_capacity(markdown.len());
	let mut marks = Vec::new();
	parse_into(markdown, &mut text, &mut marks);
	marks.sort_by_key(|mark| mark.start);
	(text, marks)
}

fn parse_into(markdown: &str, text: &mut String, marks: &mut Vec<MarkRange>) {
	let mut at = 0;
	while let Some(character) = markdown[at..].chars().next() {
		let rest = &markdown[at..];
		let consumed = escape_at(rest, text)
			.or_else(|| code_at(rest, text, marks))
			.or_else(|| link_at(rest, text, marks))
			.or_else(|| pair_at(rest, text, marks));
		at += consumed.unwrap_or_else(|| {
			text.push(character);
			character.len_utf8()
		});
	}
}

fn escape_at(rest: &str, text: &mut String) -> Option<usize> {
	let escaped = rest.strip_prefix('\\')?.chars().next().filter(char::is_ascii_punctuation)?;
	text.push(escaped);
	Some(1 + escaped.len_utf8())
}

fn code_at(rest: &str, text: &mut String, marks: &mut Vec<MarkRange>) -> Option<usize> {
	let body = rest.strip_prefix('`')?;
	let close = body.find('`').filter(|&close| close > 0)?;
	let start = text.len();
	text.push_str(&body[..close]);
	marks.push(MarkRange::new(start..text.len(), Mark::Code));
	Some(close + 2)
}

fn link_at(rest: &str, text: &mut String, marks: &mut Vec<MarkRange>) -> Option<usize> {
	if !rest.starts_with('[') {
		return None;
	}
	let label_end = closing(rest, 1, "](")?;
	let url_start = label_end + 2;
	let url_end = url_start + rest[url_start..].find(')')?;
	let start = text.len();
	parse_into(&rest[1..label_end], text, marks);
	if text.len() > start {
		marks.push(MarkRange::new(start..text.len(), Mark::Link(rest[url_start..url_end].into())));
	}
	Some(url_end + 1)
}

fn pair_at(rest: &str, text: &mut String, marks: &mut Vec<MarkRange>) -> Option<usize> {
	PAIRED_MARKERS.iter().find_map(|(marker, mark)| {
		let content = rest.strip_prefix(marker)?;
		if content.chars().next().is_none_or(char::is_whitespace) {
			return None;
		}
		let close = closing(rest, marker.len(), marker)?;
		if rest[..close].ends_with(char::is_whitespace) {
			return None;
		}
		let start = text.len();
		parse_into(&rest[marker.len()..close], text, marks);
		marks.push(MarkRange::new(start..text.len(), mark.clone()));
		Some(close + marker.len())
	})
}

fn closing(markdown: &str, from: usize, marker: &str) -> Option<usize> {
	let doubled = marker.len() == 1 && marker != "](";
	let mut at = from;
	while let Some(character) = markdown[at..].chars().next() {
		let rest = &markdown[at..];
		if rest.starts_with(marker) && at > from {
			if !(doubled && rest[marker.len()..].starts_with(marker)) {
				return Some(at);
			}
			at += marker.len() * 2;
			continue;
		}
		at += match character {
			'\\' => 1 + rest[1..].chars().next().map_or(0, char::len_utf8),
			'`' => rest[1..].find('`').map_or(1, |close| close + 2),
			_ => character.len_utf8(),
		};
	}
	None
}

pub fn serialize(text: &str, marks: &[MarkRange]) -> String {
	let mut cuts: Vec<usize> = marks.iter().flat_map(|mark| [mark.start, mark.end]).collect();
	cuts.extend([0, text.len()]);
	cuts.sort_unstable();
	cuts.dedup();
	let mut markdown = String::with_capacity(text.len());
	let mut open: Vec<&Mark> = Vec::new();
	for cut in cuts.windows(2) {
		let wanted = marks_over(marks, cut[0], cut[1]);
		let kept = open.iter().zip(&wanted).take_while(|(held, want)| held == want).count();
		while open.len() > kept {
			open.pop().into_iter().for_each(|mark| markdown.push_str(&closer(mark)));
		}
		for mark in &wanted[kept..] {
			markdown.push_str(opener(mark));
			open.push(mark);
		}
		let segment = &text[cut[0]..cut[1]];
		if open.iter().any(|mark| **mark == Mark::Code) {
			markdown.push_str(segment);
		} else {
			push_escaped(&mut markdown, segment);
		}
	}
	open.into_iter().rev().for_each(|mark| markdown.push_str(&closer(mark)));
	markdown
}

fn marks_over(marks: &[MarkRange], from: usize, to: usize) -> Vec<&Mark> {
	let mut covering: Vec<&MarkRange> =
		marks.iter().filter(|mark| mark.start <= from && mark.end >= to).collect();
	covering.sort_by_key(|mark| {
		let is_link = matches!(mark.mark, Mark::Link(_));
		(mark.mark == Mark::Code, mark.start, std::cmp::Reverse(mark.end), !is_link)
	});
	covering.into_iter().map(|mark| &mark.mark).collect()
}

fn opener(mark: &Mark) -> &'static str {
	match mark {
		Mark::Bold => "**",
		Mark::Italic => "_",
		Mark::Code => "`",
		Mark::Link(_) => "[",
		_ => "",
	}
}

fn closer(mark: &Mark) -> String {
	match mark {
		Mark::Link(url) => format!("]({url})"),
		other => opener(other).to_owned(),
	}
}

fn push_escaped(markdown: &mut String, segment: &str) {
	for character in segment.chars() {
		if ESCAPED.contains(&character) {
			markdown.push('\\');
		}
		markdown.push(character);
	}
}
