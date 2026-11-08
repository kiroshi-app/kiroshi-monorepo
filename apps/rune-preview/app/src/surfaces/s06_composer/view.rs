use kiroshi_core::library::contract::LibraryItem;
use rune::{El, TextEdit, col, row};

use kiroshi_rune_kit::strings::{Key, Language, chat};
use kiroshi_rune_kit::surfaces::s05_thread::{Agent, COLUMN, COLUMN_INSET, Quote};
use kiroshi_rune_kit::surfaces::s06_composer::chips::{
	FileChip, ReplyChip, formatted_size, prompt_attachments,
};
use kiroshi_rune_kit::surfaces::s06_composer::menus::{MentionMenu, command_menu, mention_menu};
use kiroshi_rune_kit::surfaces::s06_composer::picker::{
	LibraryDocument, LibraryPicker, library_picker, library_trigger,
};
use kiroshi_rune_kit::surfaces::s06_composer::prompt::{PromptInput, prompt_input};
use kiroshi_rune_kit::surfaces::s06_composer::queue::{PromptQueue, QueuedMessage, prompt_queue};
use kiroshi_rune_kit::surfaces::s06_composer::{Reach, Scope, filled};
use kiroshi_rune_kit::surfaces::s08_missions::relative_time;
use kiroshi_rune_kit::tokens::{SPACING, Tokens};

use super::menu::{self, Trigger};
use super::open::{self, Kind, Open};
use super::prompt_text::mention_counts;
use super::{State, dropped, hovered, intent, named};
use crate::app::{App, Person};
use crate::conversations::now_ms;

const DETAIL_SEPARATOR: &str = " · ";

fn scope(t: &Tokens) -> Scope<'_, App> {
	Scope { t, language: Language::En, emit: intent }
}

fn said(key: Key) -> &'static str {
	key.text(Language::En)
}

fn placeholder(kind: &Kind) -> String {
	match kind {
		Kind::Mission { .. } => said(chat::missions::composer::PLACEHOLDER).to_owned(),
		Kind::Solo { name, .. } => filled(said(chat::screen::PLACEHOLDER), &[("name", name)]),
		Kind::Group => said(chat::composer::PLACEHOLDER).to_owned(),
	}
}

fn reader(app: &App) -> String {
	match app.ready().map(|ready| &ready.person) {
		Some(Person::SignedIn(email)) => email.clone(),
		_ => said(chat::queue::YOU).to_owned(),
	}
}

fn roster(app: &App) -> Vec<Agent> {
	let agents = app.ready().map(|ready| ready.agents.as_slice()).unwrap_or_default();
	agents
		.iter()
		.map(|agent| Agent {
			id: agent.id.clone(),
			name: agent.name.clone(),
			hue: agent.avatar_blot,
			badge: None,
		})
		.collect()
}

fn reply_chip(quote: &Quote) -> ReplyChip<'_> {
	ReplyChip { id: &quote.id, author: &quote.author, excerpt: &quote.excerpt, is_excerpt: false }
}

fn file_chips<'a>(state: &'a State, conversation_id: &str) -> Vec<FileChip<'a>> {
	let Some(draft) = state.draft(conversation_id) else { return Vec::new() };
	let files = draft.files.iter().map(|file| FileChip {
		id: &file.id,
		name: &file.name,
		bytes: file.bytes.len() as u64,
		preview: None,
	});
	let documents = draft.documents.iter().map(|document| FileChip {
		id: &document.name,
		name: &document.title,
		bytes: document.bytes,
		preview: None,
	});
	files.chain(documents).collect()
}

fn queue(app: &App, t: &Tokens, open: &Open, width: f32) -> Option<El> {
	let Kind::Solo { name, .. } = &open.kind else { return None };
	let draft = app.surfaces.s06_composer.draft(&open.conversation_id)?;
	let items: Vec<QueuedMessage> = draft
		.queue
		.iter()
		.map(|queued| QueuedMessage { id: &queued.message_id, text: &queued.shown })
		.collect();
	let reader = reader(app);
	let shown = PromptQueue {
		items: &items,
		agent: name,
		reader: &reader,
		reader_picture: None,
		width,
		focused: None,
	};
	prompt_queue(scope(t), &shown)
}

fn prompt(app: &App, t: &Tokens, open: &Open, width: f32) -> El {
	let state = &app.surfaces.s06_composer;
	let scope = scope(t);
	let blank = TextEdit::default();
	let edit = state.draft(&open.conversation_id).map_or(&blank, |draft| &draft.edit);
	let reach = if open.is_closed() { Reach::Inert } else { Reach::Live };
	let quotes = app.surfaces.s05_thread.held_quotes(&roster(app));
	let replies: Vec<ReplyChip> = quotes.iter().map(reply_chip).collect();
	let placeholder = placeholder(&open.kind);
	let input = PromptInput {
		placeholder: Some(&placeholder),
		leading: vec![library_trigger(scope, reach, state.picker.is_some())],
		replies: &replies,
		attachments: prompt_attachments(scope, file_chips(state, &open.conversation_id), reach),
		disabled: open.is_closed(),
		drop_target: state.is_drop_target,
		menu_open: state.is_menu_open(open),
		focused: edit.focused,
		..PromptInput::new(edit, width)
	};
	let conversation_id = open.conversation_id.clone();
	prompt_input(scope, input, move |app: &mut App| {
		app.surfaces.s06_composer.edit_of(&conversation_id)
	})
	.on_drop_files(|app: &mut App, paths, _| dropped(app, paths))
	.on_drop_hover(|app: &mut App, is_over, _| hovered(app, is_over))
}

pub fn view(app: &App, t: &Tokens) -> Option<El> {
	let open = open::of(app)?;
	let width = app.surfaces.s06_composer.prompt_width();
	let column =
		col().w(width).children(queue(app, t, &open, width)).child(prompt(app, t, &open, width));
	Some(
		row()
			.key("composer-row")
			.w_full()
			.justify_center()
			.px(COLUMN_INSET)
			.pt(SPACING * 2.0)
			.pb(SPACING * 3.0)
			.on_layout(|app: &mut App, rect| app.surfaces.s06_composer.laid_out(rect[2]))
			.child(column),
	)
}

fn detail_of(item: &LibraryItem, now: i64) -> String {
	let format = item.name.rsplit_once('.').map_or("", |(_, extension)| extension).to_uppercase();
	[format, formatted_size(item.bytes), relative_time(item.modified_at, now)]
		.join(DETAIL_SEPARATOR)
}

fn picker(state: &State, t: &Tokens, query: &TextEdit) -> El {
	let now = now_ms();
	let shown: Vec<(&str, String, String)> = state
		.documents()
		.into_iter()
		.map(|item| (item.name.as_str(), open::title_of(item), detail_of(item, now)))
		.collect();
	let documents: Vec<LibraryDocument> =
		shown.iter().map(|(id, name, detail)| LibraryDocument { id, name, detail }).collect();
	let picker = LibraryPicker { documents: &documents, query, highlighted: None };
	library_picker(scope(t), &picker, |app: &mut App| {
		app.surfaces.s06_composer.picker.get_or_insert_default()
	})
}

fn menu(state: &State, t: &Tokens, open: &Open, trigger: &Trigger) -> Option<El> {
	let room = state.prompt_width();
	let commands = state.commands_of(&open.kind);
	let rows = menu::rows(trigger, &open.candidates, commands);
	let active = state.menu.active_for(trigger, rows.len());
	match trigger {
		Trigger::Mention { query, .. } => {
			let candidates = menu::mentionables(&open.candidates);
			let counted =
				mention_counts(state.prompt_of(&open.conversation_id), &named(&open.candidates));
			let counts: Vec<(&str, usize)> =
				counted.iter().map(|(id, count)| (id.as_str(), *count)).collect();
			let shown = MentionMenu {
				candidates: &candidates,
				counts: &counts,
				lead: None,
				space: Some(&open.space.1),
				query,
				active,
				room,
			};
			mention_menu(scope(t), &shown)
		}
		Trigger::Command { query } => {
			let names = menu::command_names(commands);
			command_menu(scope(t), &menu::command_options(&names, commands), query, active, room)
		}
	}
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let Some(open) = open::of(app) else { return Vec::new() };
	let state = &app.surfaces.s06_composer;
	let picker = state.picker.as_ref().map(|query| picker(state, t, query));
	let trigger = state.trigger(&open).filter(|trigger| !state.menu.is_dismissed(trigger));
	let menu = trigger.and_then(|trigger| menu(state, t, &open, &trigger));
	picker.into_iter().chain(menu).collect()
}

pub fn width_within(row: f32) -> f32 {
	(row - 2.0 * COLUMN_INSET).clamp(0.0, COLUMN)
}
