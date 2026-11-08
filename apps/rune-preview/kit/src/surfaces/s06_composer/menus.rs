use rune::image::Image;
use rune::{Align, Cursor, El, ScrollSpec, Side, TextStyle, col, icon, row, text};

use super::prompt::COMPOSER_KEY;
use super::{ComposerIntent, ROW_RING, Scope, filled, row_highlight};
use crate::avatar::{Face, Person};
use crate::icons;
use crate::primitives::elevated;
use crate::strings::chat::composer;
use crate::tokens::{
	RADIUS_MD, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM,
	Tokens, faded,
};

const PANEL_PADDING: f32 = SPACING * 1.5;
const LIST_MAX: f32 = SPACING * 64.0;
const MENTION_WIDTH: f32 = SPACING * 75.0;
const MENTION_RADIUS: f32 = 14.0;
const MENTION_ROW: f32 = SPACING * 9.0;
const AVATAR: f32 = 22.0;
const OUTSIDE_OPACITY: f32 = 0.7;
const OPENING_ROWS: usize = 6;
const COUNT_GLYPH: &str = "×";
const TITLE_MIN: f32 = SPACING * 6.0;
const TITLE_LINE: f32 = 20.0;
const CROWN: f32 = SPACING * 4.0;
const FOOTER_GLYPH: f32 = SPACING * 3.5;
const COMMAND_MIN: f32 = SPACING * 64.0;
const COMMAND_MAX: f32 = SPACING * 96.0;
const MENU_OFFSET: f32 = SPACING * 2.0;

#[derive(Clone, Copy)]
pub enum MentionFace<'a> {
	Agent { hue: Option<f32> },
	Person { image: Option<&'a Image> },
}

#[derive(Clone, Copy)]
pub struct Mentionable<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub title: Option<&'a str>,
	pub face: MentionFace<'a>,
	pub is_outside: bool,
}

pub struct MentionMenu<'a> {
	pub candidates: &'a [Mentionable<'a>],
	pub counts: &'a [(&'a str, usize)],
	pub lead: Option<&'a str>,
	pub space: Option<&'a str>,
	pub query: &'a str,
	pub active: usize,
	pub room: f32,
}

pub struct Matches<'a> {
	pub inside: Vec<Mentionable<'a>>,
	pub outside: Vec<Mentionable<'a>>,
	pub further: usize,
}

impl<'a> Matches<'a> {
	pub fn len(&self) -> usize {
		self.inside.len() + self.outside.len()
	}

	pub fn is_empty(&self) -> bool {
		self.len() == 0
	}

	pub fn at(&self, index: usize) -> Option<&Mentionable<'a>> {
		self.inside.iter().chain(&self.outside).nth(index)
	}
}

pub fn mention_matches<'a>(candidates: &[Mentionable<'a>], query: &str) -> Matches<'a> {
	let needle = query.to_lowercase();
	let named: Vec<Mentionable> = candidates
		.iter()
		.filter(|candidate| candidate.name.to_lowercase().contains(&needle))
		.copied()
		.collect();
	let mut inside: Vec<Mentionable> = named.iter().filter(|c| !c.is_outside).copied().collect();
	let outside: Vec<Mentionable> = if needle.is_empty() {
		Vec::new()
	} else {
		named.iter().filter(|c| c.is_outside).copied().collect()
	};
	if needle.is_empty() {
		inside.truncate(OPENING_ROWS);
	}
	let further =
		if needle.is_empty() { candidates.len() - inside.len() - outside.len() } else { 0 };
	Matches { inside, outside, further }
}

fn panel(t: &Tokens, key: &str, list: El, footer: Option<El>) -> El {
	elevated(t, col().key(key.to_owned()).padding(PANEL_PADDING).child(list).children(footer))
		.anchored(COMPOSER_KEY, Side::Top, Align::Start, MENU_OFFSET)
}

fn listbox(label: &str, active_is_last: bool, rows: Vec<El>) -> El {
	col()
		.w_full()
		.max_h(LIST_MAX)
		.scroll(ScrollSpec { stick_bottom: active_is_last })
		.child(col().w_full().role("listbox").label(label).focus_group().children(rows))
}

fn option<S: 'static>(scope: Scope<S>, key: String, label: &str, active: bool, body: El) -> El {
	let t = scope.t;
	let highlight = row_highlight(t);
	let body = body
		.key(key)
		.w_full()
		.radius(RADIUS_MD)
		.role("option")
		.label(label)
		.checked(active)
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(highlight)
		.focus_ring(ROW_RING, -ROW_RING, t.ring);
	if active { body.fill(highlight) } else { body }
}

fn face(t: &Tokens, candidate: &Mentionable) -> El {
	let drawn = match candidate.face {
		MentionFace::Agent { hue } => Face::still(candidate.name, hue).draw(AVATAR, t),
		MentionFace::Person { image } => Person { name: candidate.name, image }.draw(AVATAR, t),
	};
	let drawn = drawn.a11y_hidden();
	if candidate.is_outside { drawn.opacity(OUTSIDE_OPACITY) } else { drawn }
}

fn mention_row<S: 'static>(
	scope: Scope<S>,
	menu: &MentionMenu,
	candidate: &Mentionable,
	index: usize,
) -> El {
	let t = scope.t;
	let count = menu.counts.iter().find(|(id, _)| *id == candidate.id).map_or(0, |(_, n)| *n);
	let is_lead = menu.lead == Some(candidate.id);
	let mut named =
		row().shrink().min_w(0.0).gap(SPACING).center_y().child(
			text(candidate.name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).truncate(),
		);
	if let Some(title) = candidate.title {
		let style = TextStyle { line_height: TITLE_LINE, ..TEXT_COMPACT };
		named = named.child(
			text(title.to_owned())
				.font(style)
				.color(t.muted_foreground)
				.truncate()
				.ml(SPACING)
				.min_w(TITLE_MIN)
				.shrink(),
		);
	}
	if count > 0 {
		named = named.child(
			text(format!("{COUNT_GLYPH}{count}"))
				.font(TEXT_SM_MEDIUM)
				.color(t.muted_foreground)
				.a11y_hidden(),
		);
	}
	let mut body = row()
		.h(MENTION_ROW)
		.gap(SPACING * 2.5)
		.px(SPACING * 2.0)
		.center_y()
		.child(face(t, candidate))
		.child(row().grow(1.0).shrink().min_w(0.0).center_y().child(named));
	if is_lead || candidate.is_outside {
		let mut trailing = row().gap(SPACING).center_y();
		if is_lead {
			trailing = trailing
				.child(icon(&icons::CROWN, CROWN).color(t.bot_badge_attention).a11y_hidden());
		}
		if candidate.is_outside {
			trailing =
				trailing.child(text(scope.say(composer::INVITE)).font(TEXT_XS).color(t.primary));
		}
		body = body.child(trailing);
	}
	let mentioned = (count > 0).then(|| {
		filled(
			scope.plural(composer::MENTIONED_ONE, composer::MENTIONED_OTHER, count),
			&[("count", &count.to_string())],
		)
	});
	let label = [
		Some(candidate.name.to_owned()),
		candidate.title.map(str::to_owned),
		mentioned,
		is_lead.then(|| scope.say(composer::LEAD).to_owned()),
		candidate.is_outside.then(|| scope.say(composer::INVITE).to_owned()),
	]
	.into_iter()
	.flatten()
	.collect::<Vec<_>>()
	.join(" ");
	scope.on_press(
		option(scope, format!("mention-{}", candidate.id), &label, index == menu.active, body),
		ComposerIntent::PickMention {
			id: candidate.id.to_owned(),
			is_outside: candidate.is_outside,
		},
	)
}

pub fn mention_menu<S: 'static>(scope: Scope<S>, menu: &MentionMenu) -> Option<El> {
	let t = scope.t;
	let matches = mention_matches(menu.candidates, menu.query);
	if matches.is_empty() {
		return None;
	}
	let mut rows = vec![
		text(scope.say(composer::MENTIONS))
			.font(TEXT_XS_MEDIUM)
			.color(t.muted_foreground)
			.px(SPACING * 2.0)
			.pt(SPACING)
			.pb(SPACING * 1.5)
			.a11y_hidden(),
	];
	rows.extend(matches.inside.iter().enumerate().map(|(at, c)| mention_row(scope, menu, c, at)));
	if !matches.outside.is_empty() {
		rows.push(
			col().w_full().mt(SPACING * 1.5).child(rule(faded(t.foreground, 0.08))).child(
				text(scope.say(composer::OUTSIDE))
					.font(TEXT_XS_MEDIUM)
					.color(t.muted_foreground)
					.px(SPACING * 2.0)
					.pt(SPACING * 2.5)
					.pb(SPACING * 1.5),
			),
		);
		let offset = matches.inside.len();
		rows.extend(
			matches
				.outside
				.iter()
				.enumerate()
				.map(|(at, c)| mention_row(scope, menu, c, offset + at)),
		);
	}
	let footer = menu.space.filter(|_| matches.further > 0).map(|space| {
		let count = matches.further.to_string();
		col().w_full().mt(SPACING * 1.5).child(rule(t.border)).child(
			row()
				.gap(SPACING * 1.5)
				.center_y()
				.padding(SPACING * 2.0)
				.child(icon(&icons::SEARCH, FOOTER_GLYPH).color(t.muted_foreground))
				.child(
					text(filled(
						scope.plural(
							composer::FURTHER_ONE,
							composer::FURTHER_OTHER,
							matches.further,
						),
						&[("count", &count), ("space", space)],
					))
					.font(TEXT_XS)
					.color(t.muted_foreground),
				),
		)
	});
	let active_is_last = menu.active + 1 == matches.len();
	let list = listbox(scope.say(composer::MENTIONS), active_is_last, rows);
	Some(
		panel(t, "mention-menu", list, footer)
			.w(MENTION_WIDTH.min(menu.room))
			.radius(MENTION_RADIUS)
			.fill(t.prompt_menu)
			.border(1.0, faded(t.foreground, 0.12)),
	)
}

fn rule(colour: rune::Color) -> El {
	rune::el().w_full().h(1.0).fill(colour).a11y_hidden()
}

#[derive(Clone, Copy)]
pub struct Command<'a> {
	pub name: &'a str,
	pub description: Option<&'a str>,
}

pub fn command_matches<'a>(commands: &[Command<'a>], query: &str) -> Vec<Command<'a>> {
	let needle = query.to_lowercase();
	commands.iter().filter(|c| c.name.to_lowercase().contains(&needle)).copied().collect()
}

pub fn command_menu<S: 'static>(
	scope: Scope<S>,
	commands: &[Command],
	query: &str,
	active: usize,
	room: f32,
) -> Option<El> {
	let t = scope.t;
	let matches = command_matches(commands, query);
	if matches.is_empty() {
		return None;
	}
	let rows = matches
		.iter()
		.enumerate()
		.map(|(at, command)| {
			let mut body =
				col().gap(SPACING * 0.5).px(SPACING * 2.5).py(SPACING * 1.5).child(
					text(command.name.to_owned()).font(TEXT_SM).color(t.foreground).truncate(),
				);
			if let Some(description) = command.description {
				body = body.child(
					text(description.to_owned()).font(TEXT_XS).color(t.muted_foreground).truncate(),
				);
			}
			let label = match command.description {
				Some(description) => format!("{} {description}", command.name),
				None => command.name.to_owned(),
			};
			scope.on_press(
				option(scope, format!("command-{}", command.name), &label, at == active, body),
				ComposerIntent::PickCommand(command.name.to_owned()),
			)
		})
		.collect();
	let list = listbox(scope.say(composer::COMMANDS), active + 1 == matches.len(), rows);
	Some(
		panel(t, "command-menu", list, None)
			.min_w(COMMAND_MIN)
			.max_w(COMMAND_MAX.min(room).max(COMMAND_MIN))
			.radius(RADIUS_XL)
			.fill(t.popover),
	)
}
