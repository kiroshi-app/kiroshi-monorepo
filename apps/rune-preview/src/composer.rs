use rune::{
	Color, Cursor, El, Key, KeyEvent, PillStyle, Shadow, SurfaceFit, Tx, auto_grow, col, el, icon,
	row, text, text_input,
};
use rune_kit::Kit;

use crate::app::{AGENT_PILL, App, Attachment, MentionMenu, Mentionable};
use crate::avatar::Face;
use crate::icons;
use crate::tokens::{
	SPACING, TEXT_11, TEXT_BUBBLE, TEXT_COMPACT, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens,
};

pub const COMPOSER: &str = "composer";
pub const COMPOSER_SURFACE: &str = "composer-surface";
pub const COMPOSER_MIRROR: &str = "composer-mirror";

const COLUMN: f32 = 720.0;
const MAX_ROWS: usize = 8;
const SURFACE_PAD: f32 = 8.0;
const CONTROLS_GAP: f32 = 4.0;
const SEND: f32 = 32.0;
const FIELD_PAD_X: f32 = 8.0;
const FIELD_PAD_Y: f32 = 4.0;
const RADIUS_SINGLE_LINE: f32 = 25.0;
const RADIUS_EXPANDED: f32 = 24.0;
const RADIUS_CARRYING: f32 = 20.0;

const MENU_WIDTH: f32 = 300.0;
const MENU_PAD: f32 = 6.0;
const MENU_GAP: f32 = 8.0;
const MENU_ROW: f32 = 36.0;
const MENU_HEADING: f32 = 26.0;
const MENU_BOUNDARY: f32 = 39.0;
const MENU_FOOTER: f32 = 39.0;
const MENU_AVATAR: f32 = 22.0;
const TITLE_PLAIN: rune::TextStyle = rune::TextStyle { line_height: 20.0, ..TEXT_COMPACT };

const CHIP_MAX_WIDTH: f32 = 224.0;
const CHIP_THUMB: f32 = 32.0;
const SIZE_UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];

pub struct Measured {
	pub surface_width: Option<f32>,
	pub text_width: Option<f32>,
}

impl Measured {
	fn is_filling_row(&self, s: &App) -> bool {
		if s.composer.edit.text.contains('\n') {
			return true;
		}
		let (Some(surface), Some(text)) = (self.surface_width, self.text_width) else {
			return false;
		};
		let room = surface - 2.0 - 2.0 * SURFACE_PAD - SEND - CONTROLS_GAP;
		text + 2.0 * FIELD_PAD_X > room
	}
}

pub fn view(s: &App, k: &Kit, t: &Tokens, measured: &Measured) -> El {
	let can_type = s.thread.is_some();
	let has_payload = !s.composer.edit.text.trim().is_empty() || !s.composer.attachments.is_empty();
	let is_expanded = measured.is_filling_row(s);
	let carrying = !s.composer.attachments.is_empty();
	let radius = match (carrying, is_expanded) {
		(true, _) => RADIUS_CARRYING,
		(false, true) => RADIUS_EXPANDED,
		(false, false) => RADIUS_SINGLE_LINE,
	};
	let lit = has_payload || s.composer.edit.focused;
	let prompt =
		col().grow(1.0).shrink().min_w(0.0).px(FIELD_PAD_X).py(FIELD_PAD_Y).child(auto_grow(
			field(s, k, t, can_type),
			1,
			MAX_ROWS,
		));
	let send = send_button(t, can_type && has_payload);
	let mut surface = col()
		.key(COMPOSER_SURFACE)
		.w_full()
		.padding(SURFACE_PAD)
		.gap(CONTROLS_GAP)
		.radius(radius)
		.fill(t.prompt_surface)
		.border(1.0, t.foreground.alpha(if lit { 0.2 } else { 0.1 }))
		.child(mirror(s));
	if carrying {
		surface = surface.child(attachments(s, t));
	}
	surface = if is_expanded {
		surface.child(prompt).child(row().w_full().justify_end().child(send))
	} else {
		surface.child(row().w_full().gap(CONTROLS_GAP).center_y().child(prompt).child(send))
	};
	if let Some(menu) = s.mention_menu() {
		surface = surface.child(mention_menu(s, &menu, t));
	}
	let mut column = col().w(COLUMN).shrink().gap(SPACING * 2.0);
	if let Some(notice) = &s.notice {
		column = column.child(text(notice.clone()).font(TEXT_COMPACT).color(t.destructive).wrap());
	}
	row().w_full().justify_center().pb(SPACING * 3.0).pt(SPACING * 2.0).child(column.child(surface))
}

fn field(s: &App, k: &Kit, t: &Tokens, can_type: bool) -> El {
	let (pill_ink, pill_ground) = (t.primary, t.primary.alpha(0.14));
	let input = text_input(&s.composer.edit, TEXT_BUBBLE)
		.key(COMPOSER)
		.w_full()
		.color(t.foreground)
		.placeholder(
			if s.mission.is_some() { "Answer this mission…" } else { "Message" },
			t.faint_foreground,
		)
		.caret(t.foreground, k.selection())
		.pill_style(move |id| {
			let style = PillStyle::default();
			if id.starts_with(AGENT_PILL) { style.bg(pill_ground).fg(pill_ink) } else { style }
		});
	if !can_type {
		return input.opacity(0.5);
	}
	input
		.on_edit(|s: &mut App| &mut s.composer.edit)
		.on_input_change(|s: &mut App, _: &mut Tx| s.composer_changed())
		.on_input_key(mention_keys)
		.on_submit(|s: &mut App, _: &mut Tx| s.send())
		.on_input_paste(|s: &mut App, content, _: &mut Tx| s.pasted(content))
}

fn mirror(s: &App) -> El {
	text(s.composer.edit.text.clone())
		.key(COMPOSER_MIRROR)
		.font(TEXT_BUBBLE)
		.single_line()
		.absolute(0.0, 0.0)
		.opacity(0.0)
		.a11y_hidden()
}

fn send_button(t: &Tokens, filled: bool) -> El {
	let (fill, ink) = if filled {
		(t.foreground, t.background)
	} else {
		(t.foreground.alpha(0.08), Color::WHITE.mix(t.muted_foreground, 0.6))
	};
	let send = el()
		.size(SEND, SEND)
		.radius(SEND / 2.0)
		.center()
		.fill(fill)
		.child(icon(&icons::SEND, 16.0).color(ink));
	if !filled {
		return send;
	}
	send.cursor(Cursor::Pointer).role("button").label("Send").on_press(|s: &mut App| s.send())
}

fn attachments(s: &App, t: &Tokens) -> El {
	row()
		.w_full()
		.flex_wrap()
		.gap(SPACING * 1.5)
		.children(s.composer.attachments.iter().map(|attachment| chip(attachment, t)))
}

fn chip(attachment: &Attachment, t: &Tokens) -> El {
	let id = attachment.id;
	let thumb = el()
		.size(CHIP_THUMB, CHIP_THUMB)
		.radius(8.0)
		.border(1.0, t.image_outline)
		.pixels_fit(attachment.image.pixels(), SurfaceFit::Fill);
	let remove = el()
		.size(24.0, 24.0)
		.radius(12.0)
		.center()
		.hover(t.muted)
		.cursor(Cursor::Pointer)
		.role("button")
		.label(format!("Remove {}", attachment.name))
		.on_press(move |s: &mut App| s.remove_attachment(id))
		.child(icon(&icons::CLOSE, 14.0).color(t.muted_foreground));
	row()
		.max_w(CHIP_MAX_WIDTH)
		.padding(SPACING)
		.gap(SPACING * 2.0)
		.center_y()
		.radius(12.0)
		.fill(t.foreground.alpha(0.04))
		.border(1.0, t.foreground.alpha(0.1))
		.child(thumb)
		.child(
			col()
				.shrink()
				.min_w(0.0)
				.child(
					text(attachment.name.clone())
						.font(TEXT_XS_MEDIUM)
						.color(t.foreground)
						.truncate(),
				)
				.child(text(file_size(attachment.bytes)).font(TEXT_11).color(t.muted_foreground)),
		)
		.child(remove)
}

pub fn file_size(bytes: usize) -> String {
	let unit = ((bytes.max(1) as f64).ln() / 1024_f64.ln()).floor().clamp(0.0, 3.0) as usize;
	let value = bytes as f64 / 1024_f64.powi(unit as i32);
	if unit == 0 || value >= 10.0 {
		return format!("{} {}", value.round(), SIZE_UNITS[unit]);
	}
	format!("{value:.1} {}", SIZE_UNITS[unit])
}

fn menu_height(menu: &MentionMenu) -> f32 {
	let inside = menu.rows.iter().filter(|row| !row.outside).count();
	let outside = menu.rows.len() - inside;
	let boundary = if outside > 0 { MENU_BOUNDARY } else { 0.0 };
	let footer = if menu.further > 0 { MENU_FOOTER } else { 0.0 };
	2.0 + 2.0 * MENU_PAD + MENU_HEADING + menu.rows.len() as f32 * MENU_ROW + boundary + footer
}

fn mention_menu(s: &App, menu: &MentionMenu, t: &Tokens) -> El {
	let active = s.composer.mention.as_ref().map_or(0, |mention| mention.active);
	let heading = el()
		.px(SPACING * 2.0)
		.pt(SPACING)
		.pb(SPACING * 1.5)
		.child(text("Agents").font(TEXT_XS_MEDIUM).color(t.muted_foreground));
	let mut panel = col()
		.key("mention-menu")
		.w(MENU_WIDTH)
		.padding(MENU_PAD)
		.radius(14.0)
		.fill(t.prompt_menu)
		.border(1.0, t.foreground.alpha(0.12))
		.box_shadow(Shadow {
			x: 0.0,
			y: 1.0,
			blur: 2.0,
			spread: 0.0,
			color: t.popover_shadow.alpha(0.06),
			inset: false,
		})
		.box_shadow(Shadow {
			x: 0.0,
			y: 12.0,
			blur: 28.0,
			spread: 0.0,
			color: t.popover_shadow,
			inset: false,
		})
		.role("listbox")
		.label("Agents")
		.child(heading);
	let mut bounded = false;
	for (index, mentionable) in menu.rows.iter().enumerate() {
		if mentionable.outside && !bounded {
			bounded = true;
			panel = panel.child(boundary(t));
		}
		panel = panel.child(mention_row(mentionable, index == active, t));
	}
	if menu.further > 0 {
		panel = panel.child(further(s, menu.further, t));
	}
	panel.absolute(0.0, -(menu_height(menu) + MENU_GAP))
}

fn boundary(t: &Tokens) -> El {
	col()
		.w_full()
		.mt(SPACING * 1.5)
		.child(el().w_full().h(1.0).fill(t.foreground.alpha(0.08)))
		.child(
			el().px(SPACING * 2.0).pt(SPACING * 2.5).pb(SPACING * 1.5).child(
				text("Not in this conversation").font(TEXT_XS_MEDIUM).color(t.muted_foreground),
			),
		)
}

fn further(s: &App, count: usize, t: &Tokens) -> El {
	let space = s.ready().map_or("this Space", |ready| ready.space.name.as_str());
	col().w_full().mt(SPACING * 1.5).child(el().w_full().h(1.0).fill(t.border)).child(
		row()
			.padding(SPACING * 2.0)
			.gap(SPACING * 1.5)
			.center_y()
			.child(icon(&icons::SEARCH, 14.0).color(t.muted_foreground))
			.child(
				text(format!("Keep typing to reach the other {count} in {space}"))
					.font(TEXT_XS)
					.color(t.muted_foreground),
			),
	)
}

fn mention_row(mentionable: &Mentionable, active: bool, t: &Tokens) -> El {
	let highlight = if t.dark { t.foreground.alpha(0.08) } else { t.muted };
	let bot_id = mentionable.bot_id.clone();
	let face = Face::still(&mentionable.name, mentionable.hue).draw(MENU_AVATAR, t);
	let mut names =
		row().shrink().min_w(0.0).gap(SPACING).center_y().child(
			text(mentionable.name.clone()).font(TEXT_SM_MEDIUM).color(t.foreground).truncate(),
		);
	if !mentionable.title.is_empty() {
		names = names.child(
			text(mentionable.title.clone())
				.font(TITLE_PLAIN)
				.color(t.muted_foreground)
				.truncate()
				.ml(SPACING),
		);
	}
	let mut line = row()
		.w_full()
		.h(MENU_ROW)
		.px(SPACING * 2.0)
		.gap(SPACING * 2.5)
		.center_y()
		.radius(8.0)
		.hover(highlight)
		.cursor(Cursor::Pointer)
		.role("option")
		.label(mentionable.name.clone())
		.on_press(move |s: &mut App| s.choose_mention(&bot_id))
		.child(if mentionable.outside { face.opacity(0.7) } else { face })
		.child(row().grow(1.0).shrink().min_w(0.0).child(names));
	if mentionable.outside {
		line = line.child(text("Add to this conversation").font(TEXT_XS).color(t.primary));
	}
	if active { line.fill(highlight) } else { line }
}

fn mention_keys(s: &mut App, event: &KeyEvent, _: &mut Tx) -> bool {
	if s.composer.mention.is_none() {
		return false;
	}
	match event.key {
		Key::Up => {
			s.move_mention(-1);
			true
		}
		Key::Down => {
			s.move_mention(1);
			true
		}
		Key::Enter | Key::Tab => s.choose_active_mention(),
		Key::Escape => {
			s.composer.mention = None;
			true
		}
		_ => false,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn attachment_sizes_read_as_main_writes_them() {
		assert_eq!(file_size(512), "512 B");
		assert_eq!(file_size(1536), "1.5 KB");
		assert_eq!(file_size(48_000), "47 KB");
		assert_eq!(file_size(3_400_000), "3.2 MB");
	}
}
