use kiroshi_core::conversations::contract::{ConversationInPage, ConversationState};
use kiroshi_rune_kit::avatar::{Face, Motion};
use kiroshi_rune_kit::icons;
use kiroshi_rune_kit::strings::bots;
use kiroshi_rune_kit::surfaces::s03_roster::{
	Entry, Media, NameField, Roster, Row, RowBadge, Section, loading, roster, unreadable,
};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{RaisedNotice, notice_surface};
use kiroshi_rune_kit::tokens::Tokens;
use rune::{El, ScrollSpec, Tx, col};

use super::listing::{Line, Listing, Placed};
use super::{LANGUAGE, Load, emitted, hue_value, name_edit, noticed, selected_row};
use crate::app::App;
use crate::conversations::{now_ms, roster_timestamp};

const SCROLL: &str = "roster";

const CONTENT: &str = "roster-content";

enum Look {
	Agent { bot_id: String, hue: Option<f32> },
	Topic { hue: Option<f32>, seats: Vec<(String, String, Option<f32>)> },
}

struct Drawn {
	id: String,
	name: String,
	look: Look,
	conversation_id: Option<String>,
	title: Option<String>,
	timestamp: Option<String>,
	preview: Option<String>,
	lead: Option<String>,
	question: Option<String>,
	badge: Option<RowBadge>,
	is_selected: bool,
}

enum DrawnPlaced {
	Line(Drawn),
	Section { id: String, name: String, is_open: bool, lines: Vec<Drawn> },
}

fn speaker(row: &ConversationInPage) -> Option<String> {
	let word = row.last_word.as_ref()?;
	let seat = word.author_bot_id.as_ref().and_then(|bot_id| {
		row.conversation.participants.iter().find(|seat| &seat.bot_id == bot_id)
	});
	seat.map(|seat| seat.name.clone()).or_else(|| word.author_name.clone())
}

fn look_of(line: &Line) -> Look {
	match line {
		Line::Agent { bot, .. } => {
			Look::Agent { bot_id: bot.id.clone(), hue: hue_value(bot.avatar_blot) }
		}
		Line::Topic(row) => Look::Topic {
			hue: hue_value(row.conversation.color),
			seats: row
				.conversation
				.participants
				.iter()
				.filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
				.map(|seat| (seat.bot_id.clone(), seat.name.clone(), hue_value(seat.avatar_blot)))
				.collect(),
		},
	}
}

fn drawn(app: &App, line: &Line, selected: Option<&str>, now: i64) -> Drawn {
	let row = line.conversation();
	let word = row.and_then(|row| row.last_word.as_ref());
	let (name, title, lead) = match line {
		Line::Agent { bot, .. } => {
			(bot.name.clone(), Some(bot.title.clone()).filter(|title| !title.is_empty()), None)
		}
		Line::Topic(row) => (row.conversation.title.clone(), None, speaker(row)),
	};
	let observed = row.map(|row| &row.observed);
	Drawn {
		id: line.id().to_owned(),
		name,
		look: look_of(line),
		conversation_id: row.map(|row| row.conversation.id.clone()),
		title,
		timestamp: word.map(|word| roster_timestamp(word.at, now)),
		preview: word
			.and_then(|word| word.text.as_deref())
			.map(|text| app.mention_names(text).replace('\n', " ")),
		lead,
		question: observed
			.and_then(|observed| observed.pending_prompt.as_ref())
			.map(|prompt| prompt.text.clone()),
		badge: observed
			.filter(|observed| observed.state == ConversationState::NeedsYou)
			.map(|_| RowBadge::Attention),
		is_selected: selected == Some(line.id()),
	}
}

fn drawn_placed(
	app: &App,
	listing: &Listing,
	selected: Option<&str>,
	now: i64,
) -> Vec<DrawnPlaced> {
	listing
		.pinned()
		.iter()
		.map(|placed| match placed {
			Placed::Line(line) => DrawnPlaced::Line(drawn(app, line, selected, now)),
			Placed::Section { section, lines } => DrawnPlaced::Section {
				id: section.id.clone(),
				name: section.name.clone(),
				is_open: listing.is_open(&section.id),
				lines: lines.iter().map(|line| drawn(app, line, selected, now)).collect(),
			},
		})
		.collect()
}

fn motion_of(app: &App, conversation_id: Option<&str>, bot_id: &str) -> Motion {
	conversation_id.map_or(Motion::Still, |conversation_id| app.motion(conversation_id, bot_id))
}

fn row_of<'a>(app: &App, drawn: &'a Drawn) -> Row<'a> {
	let conversation_id = drawn.conversation_id.as_deref();
	let (media, pile) = match &drawn.look {
		Look::Agent { bot_id, hue } => {
			let face = Face {
				name: &drawn.name,
				hue: *hue,
				motion: motion_of(app, conversation_id, bot_id),
			};
			(Media::Agent(face), Vec::new())
		}
		Look::Topic { hue, seats } => {
			let pile = seats
				.iter()
				.map(|(bot_id, name, hue)| Face {
					name,
					hue: *hue,
					motion: motion_of(app, conversation_id, bot_id),
				})
				.collect();
			(Media::Subject { glyph: &icons::MESSAGE_SQUARE_FILL, hue: *hue }, pile)
		}
	};
	Row {
		media: Some(media),
		title: drawn.title.as_deref(),
		timestamp: drawn.timestamp.as_deref(),
		preview: drawn.preview.as_deref(),
		preview_lead: drawn.lead.as_deref(),
		question: drawn.question.as_deref(),
		badge: drawn.badge,
		pile,
		is_selected: drawn.is_selected,
		..Row::new(&drawn.id, &drawn.name)
	}
}

fn entry_of<'a>(app: &App, placed: &'a DrawnPlaced, renaming: Option<&str>) -> Entry<'a> {
	match placed {
		DrawnPlaced::Line(drawn) => Entry::Row(row_of(app, drawn)),
		DrawnPlaced::Section { id, name, is_open, lines } => Entry::Section(Section {
			id,
			name,
			is_open: *is_open,
			is_landing: false,
			is_renaming: renaming == Some(id.as_str()),
			rows: lines.iter().map(|drawn| row_of(app, drawn)).collect(),
			lift: Default::default(),
		}),
	}
}

fn shown_roster(app: &App, t: &Tokens, listing: &Listing) -> El {
	let state = &app.surfaces.s03_roster;
	let (selected, now) = (selected_row(app), now_ms());
	let placed = drawn_placed(app, listing, selected, now);
	let sorted: Vec<Drawn> =
		listing.sorted().iter().map(|line| drawn(app, line, selected, now)).collect();
	let model = Roster {
		space_hue: app.ready().and_then(|ready| ready.space.colour),
		pinned: placed.iter().map(|placed| entry_of(app, placed, state.renaming())).collect(),
		sorted: sorted.iter().map(|drawn| row_of(app, drawn)).collect(),
		is_sorted_landing: false,
		is_reading_more: state.is_reading_more(),
	};
	let field = NameField {
		label: bots::roster::section::RENAME_FIELD.text(LANGUAGE),
		edit: &state.name_edit,
		access: name_edit,
	};
	roster(t, &model, Some(&field), LANGUAGE, emitted)
}

fn content(app: &App, t: &Tokens) -> El {
	let state = &app.surfaces.s03_roster;
	match state.shown() {
		None | Some(Load::Loading) => loading(t, state.viewport_height()),
		Some(Load::Failed(_)) => unreadable(t, Some(emitted), LANGUAGE),
		Some(Load::Shown(listing)) => shown_roster(app, t, listing),
	}
}

fn kept_live(tx: &mut Tx, is_changed: bool) {
	if !is_changed {
		tx.live_only();
	}
}

pub fn view(app: &App, t: &Tokens) -> El {
	col()
		.key(SCROLL)
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.scroll(ScrollSpec { stick_bottom: false })
		.on_layout_tx(|app: &mut App, rect, tx| {
			kept_live(tx, app.surfaces.s03_roster.scrolled_viewport(rect))
		})
		.child(col().key(CONTENT).w_full().child(content(app, t)).on_layout_tx(
			|app: &mut App, rect, tx| kept_live(tx, app.surfaces.s03_roster.scrolled_content(rect)),
		))
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let notices: Vec<RaisedNotice> = app
		.surfaces
		.s03_roster
		.notices
		.iter()
		.map(|notice| RaisedNotice::failure(&notice.title, notice.description.as_deref()))
		.collect();
	if notices.is_empty() {
		return Vec::new();
	}
	vec![notice_surface(t, LANGUAGE, &notices, noticed)]
}
