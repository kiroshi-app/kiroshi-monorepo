use super::{without_generated, CLOSING_FENCE, FENCE, INDENT, OWNER_KEY};

pub fn checked_front(text: &str) -> std::io::Result<Parts> {
	let unreadable = |detail: &str| {
		std::io::Error::new(std::io::ErrorKind::InvalidData, format!("the frontmatter {detail}"))
	};
	if !text.trim().is_empty()
		&& text.trim_start().starts_with(FENCE)
		&& split_frontmatter(text).is_none()
	{
		return Err(unreadable("opens with a fence that nothing closes"));
	}
	let parts = parts(text);
	match parts.front.lines().find(|line| !readable(line)) {
		Some(line) => Err(unreadable(&format!("carries a line naming no key: {}", line.trim()))),
		None => Ok(parts),
	}
}

fn readable(line: &str) -> bool {
	let trimmed = line.trim();
	trimmed.is_empty() || trimmed.starts_with('#') || indent_of(line) > 0 || keyed(trimmed)
}

pub struct Parts {
	pub front: String,
	pub body: String,
}

pub fn parts(text: &str) -> Parts {
	match split_frontmatter(text) {
		Some((front, body)) => {
			Parts { front: front.trim_matches('\n').to_owned(), body: body.to_owned() }
		}
		None => {
			Parts { front: String::new(), body: format!("\n{}", text.trim_start_matches('\n')) }
		}
	}
}

pub fn rendered(parts: &Parts) -> String {
	format!("{FENCE}\n{}\n{FENCE}\n{}", parts.front, parts.body)
}

pub fn with_key(front: &str, path: &[&str], value: &str) -> String {
	let leaf = path.last().copied().unwrap_or_default();
	with_block(front, path, vec![format!("{leaf}: {value}")])
}

fn with_block(front: &str, path: &[&str], written: Vec<String>) -> String {
	let mut lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let mut from = 0;
	let mut until = lines.len();
	let mut indent = 0;
	for (depth, key) in path.iter().enumerate() {
		let Some(at) = key_line(&lines, from, until, indent, key) else {
			let grown = branch(&path[depth..], indent, written);
			lines.splice(until..until, grown);
			return lines.join("\n");
		};
		if depth + 1 == path.len() {
			let end = block_end(&lines, at);
			lines.splice(at..end, indented(written, indent));
			return lines.join("\n");
		}
		from = at + 1;
		until = block_end(&lines, at);
		indent = child_indent(&lines, from, until).unwrap_or(indent + INDENT);
	}
	lines.join("\n")
}

pub fn written_front(front: &str, key: &str, value: Option<&serde_json::Value>) -> String {
	match value {
		None => front.to_owned(),
		Some(value) if is_blank(value) => without_key(front, &[key]),
		Some(value) => with_block(front, &[key], yaml_lines(key, value, 0)),
	}
}

fn is_blank(value: &serde_json::Value) -> bool {
	match value {
		serde_json::Value::Null => true,
		serde_json::Value::String(text) => text.is_empty(),
		serde_json::Value::Array(items) => items.is_empty(),
		serde_json::Value::Object(map) => map.is_empty(),
		_ => false,
	}
}

fn yaml_lines(key: &str, value: &serde_json::Value, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	match value {
		serde_json::Value::Array(items) => {
			let mut lines = vec![format!("{pad}{key}:")];
			lines.extend(items.iter().flat_map(|item| item_lines(item, indent + INDENT)));
			lines
		}
		serde_json::Value::Object(map) => {
			let mut lines = vec![format!("{pad}{key}:")];
			lines.extend(
				map.iter().flat_map(|(nested, held)| yaml_lines(nested, held, indent + INDENT)),
			);
			lines
		}
		scalar => vec![format!("{pad}{key}: {}", written_scalar(scalar))],
	}
}

fn item_lines(item: &serde_json::Value, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	match item {
		serde_json::Value::Object(map) if !map.is_empty() => {
			let mut lines: Vec<String> =
				map.iter().flat_map(|(key, held)| yaml_lines(key, held, indent + INDENT)).collect();
			lines[0] = format!("{pad}- {}", lines[0].trim_start());
			lines
		}
		serde_json::Value::Array(items) => {
			let mut lines = vec![format!("{pad}-")];
			lines.extend(items.iter().flat_map(|held| item_lines(held, indent + INDENT)));
			lines
		}
		scalar => vec![format!("{pad}- {}", written_scalar(scalar))],
	}
}

fn written_scalar(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => quoted(text),
		serde_json::Value::Null => "null".to_owned(),
		other => other.to_string(),
	}
}

pub fn without_key(front: &str, path: &[&str]) -> String {
	let mut lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let mut found: Vec<usize> = Vec::new();
	let mut from = 0;
	let mut until = lines.len();
	let mut indent = 0;
	for key in path {
		let Some(at) = key_line(&lines, from, until, indent, key) else {
			return front.to_owned();
		};
		found.push(at);
		from = at + 1;
		until = block_end(&lines, at);
		indent = child_indent(&lines, from, until).unwrap_or(indent + INDENT);
	}
	let Some(leaf) = found.pop() else {
		return front.to_owned();
	};
	let end = block_end(&lines, leaf);
	lines.drain(leaf..end);
	while let Some(parent) = found.pop() {
		if block_end(&lines, parent) != parent + 1 {
			break;
		}
		lines.remove(parent);
	}
	lines.join("\n")
}

fn branch(path: &[&str], indent: usize, written: Vec<String>) -> Vec<String> {
	let depth = path.len().saturating_sub(1);
	let mut grown: Vec<String> = path[..depth]
		.iter()
		.enumerate()
		.map(|(step, key)| format!("{}{key}:", " ".repeat(indent + step * INDENT)))
		.collect();
	grown.extend(indented(written, indent + depth * INDENT));
	grown
}

fn indented(lines: Vec<String>, indent: usize) -> Vec<String> {
	let pad = " ".repeat(indent);
	lines.into_iter().map(|line| format!("{pad}{line}")).collect()
}

fn key_line(
	lines: &[String],
	from: usize,
	until: usize,
	indent: usize,
	key: &str,
) -> Option<usize> {
	(from..until.min(lines.len())).find(|index| {
		let line = &lines[*index];
		indent_of(line) == indent && key_of(line) == Some(key)
	})
}

fn block_end(lines: &[String], at: usize) -> usize {
	let indent = indent_of(&lines[at]);
	let mut end = at + 1;
	for (index, line) in lines.iter().enumerate().skip(at + 1) {
		if line.trim().is_empty() {
			continue;
		}
		if indent_of(line) <= indent {
			break;
		}
		end = index + 1;
	}
	end
}

fn child_indent(lines: &[String], from: usize, until: usize) -> Option<usize> {
	lines
		.get(from..until.min(lines.len()))?
		.iter()
		.find(|line| !line.trim().is_empty())
		.map(|line| indent_of(line))
}

fn indent_of(line: &str) -> usize {
	line.len() - line.trim_start().len()
}

fn key_of(line: &str) -> Option<&str> {
	Some(line.split_once(':')?.0.trim())
}
pub fn quoted(value: &str) -> String {
	serde_json::Value::String(value.to_owned()).to_string()
}

pub fn body(text: &str) -> &str {
	without_generated(below_front(text))
}

pub fn below_front(text: &str) -> &str {
	split_frontmatter(text).map_or(text, |(_, body)| body)
}

pub fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
	let rest = text.trim_start().strip_prefix(FENCE)?;
	let (front, closing) = rest.split_once(CLOSING_FENCE)?;
	Some((front, closing.split_once('\n')?.1))
}

pub fn marked_bot_id(text: &str) -> Option<String> {
	front_value(text, OWNER_KEY)
}

pub fn front_value(text: &str, key: &str) -> Option<String> {
	let (front, _) = split_frontmatter(text)?;
	front.lines().find_map(|line| {
		let value = line.trim().strip_prefix(key)?.trim_start().strip_prefix(':')?;
		Some(unquoted(value.trim()))
	})
}

pub fn unquoted(value: &str) -> String {
	serde_json::from_str::<String>(value).unwrap_or_else(|_| value.trim_matches('"').to_owned())
}
pub fn mapped_lines(front: &str) -> serde_json::Map<String, serde_json::Value> {
	let lines: Vec<String> = front.lines().map(str::to_owned).collect();
	let end = lines.len();
	mapped(&lines, 0, end)
}

fn mapped(
	lines: &[String],
	from: usize,
	until: usize,
) -> serde_json::Map<String, serde_json::Value> {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let mut map = serde_json::Map::new();
	let mut index = from;
	while index < until {
		let line = &lines[index];
		let trimmed = line.trim();
		if trimmed.is_empty() || indent_of(line) != indent || !keyed(trimmed) {
			index += 1;
			continue;
		}
		let end = block_end(lines, index);
		let (key, inline) = trimmed.split_once(':').unwrap_or((trimmed, ""));
		map.insert(key.trim().to_owned(), valued(inline.trim(), lines, index + 1, end));
		index = end;
	}
	map
}

fn sequenced(lines: &[String], from: usize, until: usize) -> Vec<serde_json::Value> {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let mut items = Vec::new();
	let mut index = from;
	while index < until {
		let line = &lines[index];
		let trimmed = line.trim();
		if trimmed.is_empty() || indent_of(line) != indent || !trimmed.starts_with('-') {
			index += 1;
			continue;
		}
		let inline = trimmed[1..].trim();
		let end = block_end(lines, index);
		if keyed(inline) {
			let mut held: Vec<String> = lines[index..end].to_vec();
			held[0] = held[0].replacen('-', " ", 1);
			let length = held.len();
			items.push(serde_json::Value::Object(mapped(&held, 0, length)));
		} else {
			items.push(valued(inline, lines, index + 1, end));
		}
		index = end;
	}
	items
}

fn valued(inline: &str, lines: &[String], from: usize, until: usize) -> serde_json::Value {
	if matches!(inline, "|" | "|-" | "|+" | ">" | ">-" | ">+") {
		return serde_json::Value::String(folded(lines, from, until, inline.starts_with('>')));
	}
	if !inline.is_empty() && !inline.starts_with('#') {
		return scalar(inline);
	}
	if from >= until.min(lines.len()) {
		return serde_json::Value::Null;
	}
	if is_sequence(lines, from, until) {
		serde_json::Value::Array(sequenced(lines, from, until))
	} else {
		serde_json::Value::Object(mapped(lines, from, until))
	}
}

fn folded(lines: &[String], from: usize, until: usize, is_folded: bool) -> String {
	let until = until.min(lines.len());
	let indent = child_indent(lines, from, until).unwrap_or(0);
	let held: Vec<&str> = lines[from.min(until)..until]
		.iter()
		.map(|line| &line[indent_of(line).min(indent)..])
		.collect();
	held.join(if is_folded { " " } else { "\n" }).trim().to_owned()
}

fn is_sequence(lines: &[String], from: usize, until: usize) -> bool {
	lines[from.min(lines.len())..until.min(lines.len())]
		.iter()
		.find(|line| !line.trim().is_empty())
		.is_some_and(|line| {
			let trimmed = line.trim();
			trimmed == "-" || trimmed.starts_with("- ")
		})
}

fn keyed(text: &str) -> bool {
	if text.starts_with('"') || text.starts_with('\'') || text.starts_with('-') {
		return false;
	}
	text.ends_with(':') || text.split_once(": ").is_some()
}

fn scalar(text: &str) -> serde_json::Value {
	if let Some(held) = text.strip_prefix('\'').and_then(|rest| rest.strip_suffix('\'')) {
		return serde_json::Value::String(held.replace("''", "'"));
	}
	serde_json::from_str(text).unwrap_or_else(|_| serde_json::Value::String(unquoted(text)))
}

pub fn as_text(value: &serde_json::Value) -> String {
	match value {
		serde_json::Value::String(text) => text.clone(),
		serde_json::Value::Null => String::new(),
		other => other.to_string(),
	}
}

pub fn as_list(value: &serde_json::Value) -> Vec<String> {
	match value {
		serde_json::Value::Array(items) => items.iter().map(as_text).collect(),
		serde_json::Value::Null => Vec::new(),
		other => split_list(&as_text(other)),
	}
}

fn split_list(text: &str) -> Vec<String> {
	let held = text.trim().trim_start_matches('[').trim_end_matches(']');
	let pieces: Vec<&str> = if held.contains(',') {
		held.split(',').collect()
	} else {
		held.split_whitespace().collect()
	};
	pieces
		.into_iter()
		.map(|piece| unquoted(piece.trim()))
		.filter(|piece| !piece.is_empty())
		.collect()
}

pub fn as_flag(value: &serde_json::Value) -> Option<bool> {
	match value {
		serde_json::Value::Bool(flag) => Some(*flag),
		serde_json::Value::String(text) => match text.as_str() {
			"true" | "yes" => Some(true),
			"false" | "no" => Some(false),
			_ => None,
		},
		_ => None,
	}
}
