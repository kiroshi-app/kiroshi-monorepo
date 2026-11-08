use kiroshi_core::conversations::contract::{ConversationInPage, ConversationState};
use kiroshi_core::sections::contract::Section as SavedSection;
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

struct Drawn<'a> {
	line: Line<'a>,
	timestamp: Option<String>,
	preview: Option<String>,
}

enum DrawnPlaced<'a> {
	Line(Drawn<'a>),
	Section { section: &'a SavedSection, lines: Vec<Drawn<'a>> },
}

fn drawn<'a>(app: &App, line: &Line<'a>, now: i64) -> Drawn<'a> {
	let word = line.conversation().and_then(|row| row.last_word.as_ref());
	Drawn {
		line: *line,
		timestamp: word.map(|word| roster_timestamp(word.at, now)),
		preview: word
			.and_then(|word| word.text.as_deref())
			.map(|text| app.mention_names(text).replace('\n', " ")),
	}
}

fn drawn_placed<'a>(app: &App, listing: &'a Listing, now: i64) -> Vec<DrawnPlaced<'a>> {
	listing
		.pinned()
		.into_iter()
		.map(|placed| match placed {
			Placed::Line(line) => DrawnPlaced::Line(drawn(app, &line, now)),
			Placed::Section { section, lines } => DrawnPlaced::Section {
				section,
				lines: lines.iter().map(|line| drawn(app, line, now)).collect(),
			},
		})
		.collect()
}

fn speaker(row: &ConversationInPage) -> Option<&str> {
	let word = row.last_word.as_ref()?;
	let seat = word.author_bot_id.as_ref().and_then(|bot_id| {
		row.conversation.participants.iter().find(|seat| &seat.bot_id == bot_id)
	});
	seat.map(|seat| seat.name.as_str()).or(word.author_name.as_deref())
}

fn motion_of(app: &App, row: Option<&ConversationInPage>, bot_id: &str) -> Motion {
	row.map_or(Motion::Still, |row| app.motion(&row.conversation.id, bot_id))
}

fn pile_of<'a>(app: &App, row: &'a ConversationInPage) -> Vec<Face<'a>> {
	row.conversation
		.participants
		.iter()
		.filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
		.map(|seat| Face {
			name: &seat.name,
			hue: hue_value(seat.avatar_blot),
			motion: motion_of(app, Some(row), &seat.bot_id),
		})
		.collect()
}

fn row_of<'a>(app: &App, drawn: &'a Drawn, selected: Option<&str>) -> Row<'a> {
	let row = drawn.line.conversation();
	let observed = row.map(|row| &row.observed);
	let (name, media, title, lead, pile) = match drawn.line {
		Line::Agent { bot, solo } => {
			let face = Face {
				name: &bot.name,
				hue: hue_value(bot.avatar_blot),
				motion: motion_of(app, solo, &bot.id),
			};
			let title = Some(bot.title.as_str()).filter(|title| !title.is_empty());
			(bot.name.as_str(), Media::Agent(face), title, None, Vec::new())
		}
		Line::Topic(row) => {
			let hue = hue_value(row.conversation.color);
			let media = Media::Subject { glyph: &icons::MESSAGE_SQUARE_FILL, hue };
			(row.conversation.title.as_str(), media, None, speaker(row), pile_of(app, row))
		}
	};
	Row {
		media: Some(media),
		title,
		timestamp: drawn.timestamp.as_deref(),
		preview: drawn.preview.as_deref(),
		preview_lead: lead,
		question: observed
			.and_then(|observed| observed.pending_prompt.as_ref())
			.map(|prompt| prompt.text.as_str()),
		badge: observed
			.filter(|observed| observed.state == ConversationState::NeedsYou)
			.map(|_| RowBadge::Attention),
		pile,
		is_selected: selected == Some(drawn.line.id()),
		..Row::new(drawn.line.id(), name)
	}
}

fn entry_of<'a>(
	app: &App,
	listing: &Listing,
	placed: &'a DrawnPlaced,
	selected: Option<&str>,
) -> Entry<'a> {
	match placed {
		DrawnPlaced::Line(drawn) => Entry::Row(row_of(app, drawn, selected)),
		DrawnPlaced::Section { section, lines } => Entry::Section(Section {
			id: &section.id,
			name: &section.name,
			is_open: listing.is_open(&section.id),
			is_landing: false,
			is_renaming: app.surfaces.s03_roster.renaming() == Some(section.id.as_str()),
			rows: lines.iter().map(|drawn| row_of(app, drawn, selected)).collect(),
			lift: Default::default(),
		}),
	}
}

fn shown_roster(app: &App, t: &Tokens, listing: &Listing) -> El {
	let state = &app.surfaces.s03_roster;
	let (selected, now) = (selected_row(app), now_ms());
	let placed = drawn_placed(app, listing, now);
	let sorted: Vec<Drawn> = listing.sorted().iter().map(|line| drawn(app, line, now)).collect();
	let model = Roster {
		space_hue: app.ready().and_then(|ready| ready.space.colour),
		pinned: placed.iter().map(|placed| entry_of(app, listing, placed, selected)).collect(),
		sorted: sorted.iter().map(|drawn| row_of(app, drawn, selected)).collect(),
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
