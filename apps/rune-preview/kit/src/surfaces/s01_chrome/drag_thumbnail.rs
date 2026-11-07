use rune::{El, TextStyle, col, row, text};

use super::thumbnail_shadows;
use super::title_bar::{ICON_SLOT, TAB_TITLE, TabIcon, tab_icon};
use crate::tokens::{RADIUS_LG, RADIUS_MD, SPACING, TEXT_XS, Tokens};

const HEADER_HEIGHT: f32 = SPACING * 8.0;
const COMPOSER_HEIGHT: f32 = SPACING * 7.5;
const BUBBLE_RADIUS: f32 = 11.0;
const BUBBLE_MAX_WIDTH: f32 = SPACING * 72.5;
const REPLY_MAX_WIDTH: f32 = SPACING * 82.5;
const THUMBNAIL_TEXT: TextStyle = TextStyle { line_height: 14.0, ..TextStyle::new(10.0, 400.0) };
const THUMBNAIL_REPLY: TextStyle = TextStyle { line_height: 15.0, ..THUMBNAIL_TEXT };
const NOT_ALLOWED_OPACITY: f32 = 0.75;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ThumbnailAuthor {
	User,
	Agent,
}

#[derive(Clone, Copy, Debug)]
pub struct ThumbnailMessage<'a> {
	pub author: ThumbnailAuthor,
	pub text: &'a str,
}

pub struct TabDragThumbnail<'a> {
	pub title: &'a str,
	pub icon: TabIcon<'a>,
	pub agent_name: &'a str,
	pub messages: &'a [ThumbnailMessage<'a>],
	pub composer_placeholder: &'a str,
	pub size: (f32, f32),
	pub is_not_allowed: bool,
}

pub fn drag_thumbnail(t: &Tokens, thumbnail: &TabDragThumbnail) -> El {
	let card = col()
		.key("tab-drag-thumbnail")
		.size(thumbnail.size.0, thumbnail.size.1)
		.radius(RADIUS_LG)
		.fill(t.card)
		.children([header(t, thumbnail), body(t, thumbnail)]);
	let card = thumbnail_shadows(t).into_iter().fold(card, |card, shadow| card.box_shadow(shadow));
	if thumbnail.is_not_allowed { card.opacity(NOT_ALLOWED_OPACITY) } else { card }
}

fn header(t: &Tokens, thumbnail: &TabDragThumbnail) -> El {
	let mut header = row()
		.h(HEADER_HEIGHT - 1.0)
		.w_full()
		.px(SPACING * 2.5)
		.gap(SPACING * 1.5)
		.center_y()
		.child(row().size(ICON_SLOT, ICON_SLOT).center().child(tab_icon(t, thumbnail.icon)))
		.child(
			text(thumbnail.title.to_owned())
				.font(TAB_TITLE)
				.color(t.foreground)
				.truncate()
				.shrink(),
		);
	if !thumbnail.agent_name.trim().is_empty() {
		header = header.children([
			text("·".to_owned()).font(TEXT_XS).color(t.muted_foreground),
			text(thumbnail.agent_name.to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.truncate()
				.shrink(),
		]);
	}
	col()
		.w_full()
		.corners([RADIUS_LG, RADIUS_LG, 0.0, 0.0])
		.fill(t.tab_thumbnail_header)
		.child(header)
		.child(rune::el().w_full().h(1.0).fill(t.shell_border))
}

fn body(t: &Tokens, thumbnail: &TabDragThumbnail) -> El {
	col()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.justify_end()
		.gap(SPACING * 2.25)
		.corners([0.0, 0.0, RADIUS_LG, RADIUS_LG])
		.clip_corners([0.0, 0.0, RADIUS_LG, RADIUS_LG])
		.fill(t.card)
		.px(SPACING * 5.5)
		.pt(SPACING * 4.0)
		.pb(SPACING * 4.5)
		.children(thumbnail.messages.iter().map(|message| {
			match message.author {
				ThumbnailAuthor::User => row()
					.max_w(BUBBLE_MAX_WIDTH)
					.self_end()
					.px(SPACING * 2.5)
					.py(SPACING * 1.75)
					.radius(BUBBLE_RADIUS)
					.fill(t.user_bubble)
					.child(
						text(message.text.to_owned())
							.font(THUMBNAIL_TEXT)
							.color(t.user_bubble_foreground)
							.wrap_anywhere()
							.shrink(),
					),
				ThumbnailAuthor::Agent => text(message.text.to_owned())
					.font(THUMBNAIL_REPLY)
					.color(t.foreground)
					.wrap_anywhere()
					.max_w(REPLY_MAX_WIDTH)
					.self_start(),
			}
		}))
		.child(
			row()
				.w_full()
				.h(COMPOSER_HEIGHT)
				.px(SPACING * 2.5)
				.center_y()
				.radius(RADIUS_MD)
				.outline(1.0, 0.0, t.input)
				.child(
					text(thumbnail.composer_placeholder.to_owned())
						.font(THUMBNAIL_TEXT)
						.color(t.muted_foreground)
						.truncate()
						.shrink(),
				),
		)
}
