#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Segment {
	Markdown(String),
	Image { alt: String, url: String },
	Math(String),
	Prose(Vec<Run>),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Run {
	Text(String),
	Math(String),
}

const MATH_FENCE: &str = "$$";

const MENTION_OPEN: &str = "<@";

pub fn with_mention_names(content: &str, name_of: impl Fn(&str) -> Option<String>) -> String {
	let mut written = String::with_capacity(content.len());
	let mut rest = content;
	while let Some(at) = rest.find(MENTION_OPEN) {
		written.push_str(&rest[..at]);
		let after = &rest[at + MENTION_OPEN.len()..];
		let Some(end) = after.find('>').filter(|&end| is_bot_id(&after[..end])) else {
			written.push_str(MENTION_OPEN);
			rest = after;
			continue;
		};
		let id = &after[..end];
		let name = name_of(id).unwrap_or_else(|| id.to_owned());
		written.push_str(&format!("@{name}"));
		rest = &after[end + 1..];
	}
	written.push_str(rest);
	written
}

fn is_bot_id(id: &str) -> bool {
	!id.is_empty() && id.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_')
}

pub fn segments(content: &str) -> Vec<Segment> {
	let mut built = Segments::default();
	let mut fence: Option<&str> = None;
	let mut math: Option<String> = None;
	for line in content.split_inclusive('\n') {
		let trimmed = line.trim();
		if let Some(open) = fence {
			built.text(line);
			if trimmed.starts_with(open) {
				fence = None;
			}
			continue;
		}
		if let Some(source) = math.as_mut() {
			if trimmed.ends_with(MATH_FENCE) {
				source.push_str(trimmed.trim_end_matches(MATH_FENCE));
				built.push(Segment::Math(source.trim().to_owned()));
				math = None;
			} else {
				source.push_str(line);
			}
			continue;
		}
		if let Some(open) = fence_opening(trimmed) {
			fence = Some(open);
			built.text(line);
			continue;
		}
		if let Some(inner) = trimmed.strip_prefix(MATH_FENCE) {
			match inner.strip_suffix(MATH_FENCE) {
				Some(single) => built.push(Segment::Math(single.trim().to_owned())),
				None => math = Some(format!("{inner}\n")),
			}
			continue;
		}
		match inline_runs(line).filter(|_| !trimmed.starts_with('|')) {
			Some(runs) => built.push(Segment::Prose(runs)),
			None => built.line_with_images(line),
		}
	}
	if let Some(unclosed) = math {
		built.text(&format!("{MATH_FENCE}{unclosed}"));
	}
	built.finish()
}

fn inline_runs(line: &str) -> Option<Vec<Run>> {
	let mut runs: Vec<Run> = Vec::new();
	let mut text = String::new();
	let mut rest = line.trim_end_matches('\n');
	while let Some(at) = rest.find(['`', '$', '\\']) {
		text.push_str(&rest[..at]);
		let from = &rest[at..];
		let mark = from.as_bytes()[0];
		if mark == b'\\' {
			let escaped = from.chars().take(2).collect::<String>();
			text.push_str(&escaped);
			rest = &from[escaped.len()..];
			continue;
		}
		let opening = from.bytes().take_while(|&byte| byte == mark).count();
		let Some((inner, after)) = closed_by(&from[opening..], mark, opening) else {
			text.push_str(&from[..opening]);
			rest = &from[opening..];
			continue;
		};
		if mark == b'`' {
			text.push_str(&from[..from.len() - after.len()]);
		} else {
			runs.push(Run::Text(std::mem::take(&mut text)));
			runs.push(Run::Math(inner.trim().to_owned()));
		}
		rest = after;
	}
	text.push_str(rest);
	if !runs.iter().any(|run| matches!(run, Run::Math(_))) {
		return None;
	}
	runs.push(Run::Text(text));
	runs.retain(|run| !matches!(run, Run::Text(held) if held.is_empty()));
	Some(runs)
}

fn closed_by(after: &str, mark: u8, size: usize) -> Option<(&str, &str)> {
	let bytes = after.as_bytes();
	let mut at = 0;
	while at < bytes.len() {
		if bytes[at] != mark {
			at += 1;
			continue;
		}
		let run = bytes[at..].iter().take_while(|&&byte| byte == mark).count();
		if run == size && at > 0 {
			return Some((&after[..at], &after[at + run..]));
		}
		at += run;
	}
	None
}

fn fence_opening(trimmed: &str) -> Option<&'static str> {
	["```", "~~~"].into_iter().find(|marker| trimmed.starts_with(marker))
}

#[derive(Default)]
struct Segments {
	done: Vec<Segment>,
	text: String,
}

impl Segments {
	fn text(&mut self, line: &str) {
		self.text.push_str(line);
	}

	fn push(&mut self, segment: Segment) {
		self.flush();
		self.done.push(segment);
	}

	fn flush(&mut self) {
		if !self.text.trim().is_empty() {
			self.done.push(Segment::Markdown(std::mem::take(&mut self.text)));
		}
		self.text.clear();
	}

	fn line_with_images(&mut self, line: &str) {
		let mut rest = line;
		while let Some((before, image, after)) = next_image(rest) {
			self.text(before);
			self.push(image);
			rest = after;
		}
		self.text(rest);
	}

	fn finish(mut self) -> Vec<Segment> {
		self.flush();
		self.done
	}
}

fn next_image(line: &str) -> Option<(&str, Segment, &str)> {
	let start = line.find("![")?;
	let alt_end = start + 2 + line[start + 2..].find("](")?;
	let url_start = alt_end + 2;
	let url_end = url_start + line[url_start..].find(')')?;
	let alt = line[start + 2..alt_end].to_owned();
	let url = line[url_start..url_end].split_whitespace().next()?.to_owned();
	Some((&line[..start], Segment::Image { alt, url }, &line[url_end + 1..]))
}

pub fn image_urls(content: &str) -> impl Iterator<Item = String> {
	segments(content).into_iter().filter_map(|segment| match segment {
		Segment::Image { url, .. } => Some(url),
		_ => None,
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn inline_math_follows_remark_math_and_skips_code_spans() {
		assert_eq!(
			segments("costs 2,19 $/mois + volume 0,15 $/Go\n"),
			vec![Segment::Prose(vec![
				Run::Text("costs 2,19 ".into()),
				Run::Math("/mois + volume 0,15".into()),
				Run::Text("/Go".into()),
			])]
		);
		let table = "| a | $x$ |\n| --- | --- |\n";
		assert_eq!(segments(table), vec![Segment::Markdown(table.into())]);
		assert_eq!(
			segments("run `echo $A $B` now\n"),
			vec![Segment::Markdown("run `echo $A $B` now\n".into())]
		);
		assert_eq!(segments("a \\$5 and $6\n"), vec![Segment::Markdown("a \\$5 and $6\n".into())]);
	}

	#[test]
	fn a_mention_token_reads_as_the_agent_name() {
		let named = with_mention_names("ask <@b-1> and <@b-2>", |id| {
			(id == "b-1").then(|| "Wren".to_owned())
		});
		assert_eq!(named, "ask @Wren and @b-2");
	}

	#[test]
	fn an_image_line_splits_the_markdown_around_it() {
		let split = segments("before\n![chart](https://x.test/a.png)\nafter\n");
		assert_eq!(
			split,
			vec![
				Segment::Markdown("before\n".into()),
				Segment::Image { alt: "chart".into(), url: "https://x.test/a.png".into() },
				Segment::Markdown("\nafter\n".into()),
			]
		);
	}

	#[test]
	fn a_display_math_block_becomes_its_own_segment() {
		let split = segments("see\n$$\na^2 + b^2\n$$\ndone");
		assert_eq!(split[1], Segment::Math("a^2 + b^2".into()));
		assert_eq!(split.len(), 3);
	}

	#[test]
	fn images_and_math_inside_a_code_fence_stay_code() {
		let fenced = "```md\n![x](y.png)\n$$a$$\n```\n";
		assert_eq!(segments(fenced), vec![Segment::Markdown(fenced.into())]);
	}
}
