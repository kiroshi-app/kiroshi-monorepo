use rune::{El, col, icon, row, text};

use super::{ComposerIntent, GLYPH, Reach, Scope, filled, remove_control};
use crate::icons;
use crate::strings::chat::{attachments, reply};
use crate::tokens::{RADIUS_CONTROL, RADIUS_MD, SPACING, TEXT_11, TEXT_XS_MEDIUM, Tokens, faded};

const MEDIA: f32 = SPACING * 8.0;
const CHIP_GAP: f32 = SPACING * 2.0;
const CHIP_PADDING: f32 = SPACING;
const ROW_GAP: f32 = SPACING * 1.5;
const FILE_MAX: f32 = SPACING * 56.0;
const REPLY_MIN: f32 = 236.0;
const REPLY_MAX: f32 = 360.0;
const AUTHOR_LINE: f32 = 16.5;
const EXCERPT_LINE: f32 = 14.0;
const SIZE_UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
const KILO: f64 = 1024.0;

pub struct FileChip<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub bytes: u64,
	pub preview: Option<El>,
}

#[derive(Clone, Copy)]
pub struct ReplyChip<'a> {
	pub id: &'a str,
	pub author: &'a str,
	pub excerpt: &'a str,
	pub is_excerpt: bool,
}

pub fn formatted_size(bytes: u64) -> String {
	let value = bytes.max(1) as f64;
	let unit = ((value.ln() / KILO.ln()).floor() as usize).min(SIZE_UNITS.len() - 1);
	let scaled = bytes as f64 / KILO.powi(unit as i32);
	if unit == 0 || scaled >= 10.0 {
		format!("{} {}", scaled.round(), SIZE_UNITS[unit])
	} else {
		format!("{scaled:.1} {}", SIZE_UNITS[unit])
	}
}

fn chip(t: &Tokens) -> El {
	row()
		.gap(CHIP_GAP)
		.center_y()
		.padding(CHIP_PADDING)
		.radius(RADIUS_CONTROL)
		.fill(faded(t.foreground, 0.04))
		.border(1.0, faded(t.foreground, 0.1))
}

fn media_box(t: &Tokens, glyph: &'static rune::Icon, ink: rune::Color) -> El {
	row()
		.size(MEDIA, MEDIA)
		.radius(RADIUS_MD)
		.fill(faded(t.foreground, 0.08))
		.center()
		.a11y_hidden()
		.child(icon(glyph, GLYPH).color(ink))
}

fn file_chip<S: 'static>(scope: Scope<S>, file: FileChip, reach: Reach) -> El {
	let t = scope.t;
	let media = match file.preview {
		Some(preview) => row()
			.size(MEDIA, MEDIA)
			.radius(RADIUS_MD)
			.clip_rounded(RADIUS_MD)
			.outline(1.0, 0.0, t.image_outline)
			.a11y_hidden()
			.child(preview),
		None => media_box(t, &icons::FILE, t.muted_foreground),
	};
	let details = col()
		.shrink()
		.min_w(0.0)
		.child(text(file.name.to_owned()).font(TEXT_XS_MEDIUM).color(t.foreground).truncate())
		.child(text(formatted_size(file.bytes)).font(TEXT_11).color(t.muted_foreground));
	let label = filled(scope.say(attachments::REMOVE), &[("name", file.name)]);
	chip(t)
		.key(format!("attachment-{}", file.id))
		.max_w(FILE_MAX)
		.role("listitem")
		.child(media)
		.child(details)
		.child(remove_control(
			scope,
			&format!("attachment-remove-{}", file.id),
			&label,
			reach,
			ComposerIntent::RemoveAttachment(file.id.to_owned()),
		))
}

pub fn prompt_attachments<S: 'static>(
	scope: Scope<S>,
	files: Vec<FileChip>,
	reach: Reach,
) -> Option<El> {
	if files.is_empty() {
		return None;
	}
	Some(
		row()
			.w_full()
			.flex_wrap()
			.gap(ROW_GAP)
			.center_y()
			.role("list")
			.label(scope.say(attachments::LABEL))
			.children(files.into_iter().map(|file| file_chip(scope, file, reach))),
	)
}

pub fn shown_excerpt<S: 'static>(scope: Scope<S>, chip: &ReplyChip) -> String {
	if chip.is_excerpt {
		filled(scope.say(reply::EXCERPT), &[("excerpt", chip.excerpt)])
	} else {
		chip.excerpt.to_owned()
	}
}

fn reply_chip<S: 'static>(scope: Scope<S>, chip_data: &ReplyChip, reach: Reach) -> El {
	let t = scope.t;
	let author_style = rune::TextStyle { line_height: AUTHOR_LINE, ..TEXT_XS_MEDIUM };
	let excerpt_style = rune::TextStyle { line_height: EXCERPT_LINE, ..TEXT_11 };
	let content = col()
		.grow(1.0)
		.shrink()
		.min_w(0.0)
		.child(text(chip_data.author.to_owned()).font(author_style).color(t.foreground).truncate())
		.child(
			text(shown_excerpt(scope, chip_data))
				.font(excerpt_style)
				.color(t.muted_foreground)
				.truncate(),
		);
	let label = filled(scope.say(reply::DISMISS_FROM), &[("author", chip_data.author)]);
	chip(t)
		.key(format!("reply-{}", chip_data.id))
		.min_w(REPLY_MIN)
		.max_w(REPLY_MAX)
		.shrink()
		.role("listitem")
		.child(media_box(t, &icons::REPLY, t.soft_foreground))
		.child(content)
		.child(remove_control(
			scope,
			&format!("reply-remove-{}", chip_data.id),
			&label,
			reach,
			ComposerIntent::RemoveReply(chip_data.id.to_owned()),
		))
}

pub fn reply_chips<S: 'static>(scope: Scope<S>, replies: &[ReplyChip], reach: Reach) -> Vec<El> {
	replies.iter().map(|chip_data| reply_chip(scope, chip_data, reach)).collect()
}

pub fn reply_list<S: 'static>(scope: Scope<S>, replies: &[ReplyChip], reach: Reach) -> El {
	row()
		.w_full()
		.flex_wrap()
		.gap(ROW_GAP)
		.center_y()
		.role("list")
		.label(scope.say(attachments::LABEL))
		.children(reply_chips(scope, replies, reach))
}
