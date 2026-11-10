use rune::{El, icon, row, text};

use super::{HAIRLINE, hosted_sentence, mono, round, say};
use crate::icons;
use crate::strings::{Key, Language, bots};
use crate::tokens::{SPACING, TEXT_XS, TEXT_XS_MEDIUM, Tokens};

const SEPARATOR: &str = "·";
const PILL_HEIGHT: f32 = SPACING * 4.0 + HAIRLINE * 2.0;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct Identity<'a> {
	pub source: Option<&'a str>,
	pub use_count: Option<u64>,
	pub host: Option<&'a str>,
	pub package_identity: Option<&'a str>,
}

pub fn grouped(count: u64, language: Language) -> String {
	let digits = count.to_string();
	let separator = match language {
		Language::En => ",",
		Language::Fr => "\u{202f}",
	};
	let lead = digits.len() % 3;
	digits
		.char_indices()
		.flat_map(|(index, digit)| {
			let breaks = index > 0 && (index + 3 - lead).is_multiple_of(3);
			breaks.then_some(separator).into_iter().map(str::to_owned).chain([digit.to_string()])
		})
		.collect()
}

fn uses(count: u64, language: Language) -> String {
	let key: Key =
		if count == 1 { bots::applications::USES_ONE } else { bots::applications::USES_OTHER };
	say(key, language)
		.replace("{{count, number}}", &grouped(count, language))
		.replace("{{count}}", &count.to_string())
}

fn hosted(t: &Tokens, host: &str, language: Language) -> El {
	let (sentence, host) = hosted_sentence(bots::applications::HOSTED_ON, language, host);
	text(sentence).spans([host]).font(TEXT_XS).color(t.muted_foreground).truncate().shrink()
}

pub fn meta_line(t: &Tokens, identity: Identity, language: Language) -> Option<El> {
	let mut parts: Vec<El> = Vec::new();
	if let Some(source) = identity.source {
		parts.push(
			text(source.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate().shrink(),
		);
	}
	if let Some(count) = identity.use_count {
		parts.push(text(uses(count, language)).font(TEXT_XS).color(t.muted_foreground));
	}
	if let Some(host) = identity.host {
		parts.push(hosted(t, host, language));
	} else if let Some(package) = identity.package_identity {
		parts.push(
			text(package.to_owned())
				.font(mono(TEXT_XS))
				.color(t.muted_foreground)
				.truncate()
				.shrink(),
		);
	}
	if parts.is_empty() {
		return None;
	}
	let separator =
		|| text(SEPARATOR.to_owned()).font(TEXT_XS).color(t.muted_foreground).a11y_hidden();
	let mut line = row().h(SPACING * 4.0).min_w(0.0).gap(SPACING * 1.25).center_y();
	for (index, part) in parts.into_iter().enumerate() {
		if index > 0 {
			line = line.child(separator());
		}
		line = line.child(part);
	}
	Some(line)
}

pub fn verified_pill(t: &Tokens, language: Language) -> El {
	round(
		row()
			.gap(SPACING * 0.75)
			.center_y()
			.py(HAIRLINE)
			.pl(SPACING * 1.5)
			.pr(SPACING * 1.75)
			.fill(t.muted)
			.child(icon(&icons::CHECK, SPACING * 3.0).color(t.muted_foreground))
			.child(
				text(say(bots::applications::VERIFIED, language).to_owned())
					.font(TEXT_XS_MEDIUM)
					.color(t.muted_foreground),
			),
		PILL_HEIGHT,
	)
}
