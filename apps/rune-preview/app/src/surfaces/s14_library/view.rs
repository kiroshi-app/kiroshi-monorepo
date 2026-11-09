use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind, LibraryWriter};
use rune::{Align, El, Side, TextEdit, col};

use kiroshi_rune_kit::strings::{Language, common};
use kiroshi_rune_kit::surfaces::s14_library::{
	Agent, BarActions, DocumentBar, DocumentPanelEvent, EditorBlock, ItemEvent, ItemLook,
	LibraryItem as Tile, LibraryPanel, LightboxImage, LightboxLook, PanelActions, PanelLook,
	PanelState, TOOLBAR_GAP, Unavailable, Writer, agent_card, agent_caret, block_editor,
	delete_confirmation, document_bar, document_column, document_panel, document_skeleton,
	failure_notice, field_key, format_toolbar, grid_columns, item_unavailable, library_panel,
	lightbox, new_document_dialog, presence, rows_of, title_field,
};
use kiroshi_rune_kit::tokens::{SPACING, Tokens};

use super::blocks::is_editable;
use super::document::{Document, Phase, title_of};
use super::editing::pressed_of;
use super::{Dialog, Listing, Preview, Shown, State, said};
use crate::app::App;
use crate::conversations::{now_ms, roster_timestamp};
use crate::navigation::Route;

pub const GRID: &str = "library-panel";

const LANGUAGE: Language = Language::En;

const DEFAULT_COLUMNS: usize = 4;

const KIB: u64 = 1024;

const PANEL_ACTIONS: PanelActions = PanelActions {
	search: true,
	import: true,
	new_board: true,
	new_document: true,
	templates: true,
};

fn library(app: &mut App) -> &mut State {
	&mut app.surfaces.s14_library
}

fn shown_field<'a>(app: &'a mut App, block: &str, row: usize) -> &'a mut TextEdit {
	library(app).field_mut(false, block, row)
}

fn beside_field<'a>(app: &'a mut App, block: &str, row: usize) -> &'a mut TextEdit {
	library(app).field_mut(true, block, row)
}

fn title_edit(app: &mut App) -> &mut TextEdit {
	library(app).title_mut()
}

fn query_edit(app: &mut App) -> &mut TextEdit {
	library(app).query_mut()
}

fn size_of(bytes: u64) -> String {
	match bytes {
		_ if bytes < KIB => format!("{bytes} B"),
		_ if bytes < KIB * KIB => format!("{} KB", bytes / KIB),
		_ => format!("{:.1} MB", bytes as f64 / (KIB * KIB) as f64),
	}
}

fn detail_of(item: &LibraryItem, now: i64) -> String {
	let format = item.name.rsplit_once('.').map(|(_, extension)| extension.to_uppercase());
	let size = size_of(item.bytes);
	let edited = roster_timestamp(item.modified_at, now);
	format.into_iter().chain([size, edited]).collect::<Vec<_>>().join(" · ")
}

fn tile<'a>(state: &'a State, item: &'a LibraryItem, detail: &'a str) -> Tile<'a> {
	let look = match (item.kind, state.previews.get(&item.name)) {
		(LibraryItemKind::Image, Some(Preview::Image(image))) => ItemLook::Image(Some(image)),
		(LibraryItemKind::Image, _) => ItemLook::Image(None),
		(_, Some(Preview::Excerpt(excerpt))) => ItemLook::Page(excerpt),
		(_, _) => ItemLook::Page(""),
	};
	Tile { id: &item.name, name: title_of(&item.name), detail, look, import_progress: None }
}

fn importing_tile(name: &str) -> Tile<'_> {
	Tile { id: name, name, detail: "", look: ItemLook::Page(""), import_progress: Some(0.0) }
}

fn panel_view(state: &State, t: &Tokens, width: Option<f32>) -> El {
	let items = match &state.listing {
		Listing::Failed => {
			let retry = |app: &mut App| library(app).retry_list();
			let name = said(common::library::TITLE);
			return item_unavailable(t, LANGUAGE, Unavailable::Unreadable, &name, retry);
		}
		Listing::Idle | Listing::Loading => &[][..],
		Listing::Loaded(items) => items.as_slice(),
	};
	let now = now_ms();
	let shown: Vec<&LibraryItem> =
		items.iter().filter(|item| super::matches_query(item, &state.query.text)).collect();
	let details: Vec<String> = shown.iter().map(|item| detail_of(item, now)).collect();
	let tiles: Vec<Tile> = state
		.importing
		.iter()
		.map(|name| importing_tile(name))
		.chain(shown.iter().zip(&details).map(|(item, detail)| tile(state, item, detail)))
		.collect();
	let is_loading = matches!(state.listing, Listing::Idle | Listing::Loading);
	let panel = LibraryPanel {
		state: if is_loading { PanelState::Loading } else { PanelState::Ready },
		items: &tiles,
		filter: state.filter,
		query: &state.query,
		actions: PANEL_ACTIONS,
		columns: width.map_or(DEFAULT_COLUMNS, grid_columns),
		focused: None,
	};
	library_panel(t, LANGUAGE, &panel, query_edit, |app: &mut App, event| {
		library(app).handle_library(event)
	})
}

fn face_of(app: &App, agent_id: &str, named: Option<&str>) -> (String, Option<f32>) {
	let name = app.agent_name(agent_id).or_else(|| named.map(str::to_owned)).unwrap_or_default();
	(name, app.agent_hue(agent_id))
}

fn writer_face(app: &App, writer: &LibraryWriter) -> (String, Option<f32>) {
	let (name, hue) = face_of(app, &writer.id, writer.name.as_deref());
	(name, hue.or(writer.hue.map(f32::from)))
}

fn presence_of(app: &App, t: &Tokens, document: &Document, is_beside: bool) -> Option<El> {
	let names: Vec<(String, Option<f32>)> =
		document.agents().map(|writer| writer_face(app, writer)).collect();
	let people: Vec<&str> = document.people().collect();
	if names.is_empty() && people.is_empty() {
		return None;
	}
	let agents: Vec<Agent> = names.iter().map(|(name, hue)| Agent { name, hue: *hue }).collect();
	let stop = move |app: &mut App| library(app).stop_all(is_beside);
	Some(presence(t, LANGUAGE, &agents, &people, (!agents.is_empty()).then_some(stop)))
}

fn toolbar_layer(t: &Tokens, document: &Document, is_beside: bool) -> Option<El> {
	let field = document.focused()?;
	let (start, end) = field.edit.range();
	if start == end {
		return None;
	}
	let pressed = pressed_of(&field.edit.active_marks());
	let on = move |app: &mut App, format| library(app).handle_format(is_beside, format);
	let toolbar = format_toolbar(t, LANGUAGE, &pressed, None, on);
	Some(toolbar.anchored(field_key(&field.block, field.row), Side::Top, Align::Start, TOOLBAR_GAP))
}

fn card_layers(app: &App, t: &Tokens, document: &Document) -> Vec<El> {
	document
		.cards()
		.into_iter()
		.map(|card| {
			let (name, hue) = face_of(app, &card.agent_id, card.name.as_deref());
			let writer = Writer {
				agent: Agent { name: &name, hue },
				elapsed_seconds: card.elapsed_seconds,
				sentences: card.sentences,
				section: &card.section,
			};
			let anchor = format!("library-block-{}", card.block);
			agent_card(t, LANGUAGE, &writer).anchored(anchor, Side::Bottom, Align::Start, SPACING)
		})
		.collect()
}

fn editor(app: &App, t: &Tokens, document: &Document, is_beside: bool) -> (El, Vec<El>) {
	let blocks = &document.blocks;
	let placeholder = said(common::library::templates::blank::PLACEHOLDER);
	let is_blank = blocks.len() == 1 && blocks[0].source.is_empty();
	let mut views: Vec<EditorBlock> = blocks
		.iter()
		.map(|block| {
			let kind = block.kind();
			let lines = rows_of(&block.source);
			let rows = match is_editable(kind) {
				true => lines
					.iter()
					.enumerate()
					.filter_map(|(row, line)| Some((line.mark, document.field(&block.id, row)?)))
					.collect(),
				false => Vec::new(),
			};
			let mut view = EditorBlock::new(&block.id, kind, rows, &block.source);
			view.depths = lines.iter().map(|line| line.depth).collect();
			view.placeholder = is_blank.then_some(placeholder.as_str());
			view
		})
		.collect();
	for writer in document.agents() {
		let Some(id) = document.block_of_writer(writer) else { continue };
		let (name, hue) = writer_face(app, writer);
		if let Some(view) = views.iter_mut().find(|view| view.id == id) {
			view.end = Some(agent_caret(t, Agent { name: &name, hue }));
		}
	}
	let state = &app.surfaces.s14_library;
	let query = state.slash_query().unwrap_or_default();
	let slash = state
		.slash
		.as_ref()
		.filter(|slash| slash.is_beside == is_beside)
		.and_then(|_| state.slash_view(&query));
	let access = if is_beside { beside_field } else { shown_field };
	let on = move |app: &mut App, event| library(app).handle_block(is_beside, event);
	let (body, mut layers) = block_editor(t, LANGUAGE, &mut views, slash, access, on);
	layers.extend(toolbar_layer(t, document, is_beside));
	layers.extend(card_layers(app, t, document));
	(body, layers)
}

fn bar_actions(state: &State, name: &str) -> BarActions {
	BarActions { shown: true, is_copied: state.is_copied(name) }
}

fn document_screen(app: &App, t: &Tokens, document: &Document) -> (El, Vec<El>) {
	let name = title_of(&document.target.name);
	let back = |app: &mut App| library(app).handle_document_bar(ItemEvent::Back);
	match document.phase {
		Phase::Opening => return (document_skeleton(t, LANGUAGE), Vec::new()),
		Phase::Failed => {
			let unavailable = item_unavailable(t, LANGUAGE, Unavailable::Unreadable, name, back);
			return (unavailable, Vec::new());
		}
		Phase::Open(_) => {}
	}
	let state = &app.surfaces.s14_library;
	let bar = DocumentBar {
		name,
		is_read_only: false,
		presence: presence_of(app, t, document, false),
		actions: bar_actions(state, &document.target.name),
	};
	let bar = document_bar(t, LANGUAGE, bar, |app: &mut App, event| {
		library(app).handle_document_bar(event)
	});
	let heading = title_field(t, LANGUAGE, &document.title, title_edit)
		.on_submit(|app: &mut App, _| library(app).confirm_title());
	let detail = state.listed(&document.target.name).map(|item| detail_of(item, now_ms()));
	let (body, layers) = editor(app, t, document, false);
	let column = document_column(t, heading, &detail.unwrap_or_default(), body);
	(col().w_full().h_full().child(bar).child(column), layers)
}

pub fn view(app: &App, t: &Tokens, width: Option<f32>) -> (El, Vec<El>) {
	let state = &app.surfaces.s14_library;
	let (body, layers) = match state.shown.as_ref() {
		Some(Shown::Document(document)) => document_screen(app, t, document),
		Some(Shown::Image(_)) | None => (panel_view(state, t, width), Vec::new()),
	};
	(body.on_drop_files(|app: &mut App, paths, _| library(app).dropped(paths)), layers)
}

pub fn panel(app: &App, t: &Tokens, room: f32) -> Option<(El, Vec<El>)> {
	let state = &app.surfaces.s14_library;
	let document = state.beside.as_ref()?;
	let title = title_of(&document.target.name);
	let close = |app: &mut App| library(app).handle_panel(DocumentPanelEvent::Close);
	let (body, layers) = match document.phase {
		Phase::Opening => (document_skeleton(t, LANGUAGE), Vec::new()),
		Phase::Failed => {
			(item_unavailable(t, LANGUAGE, Unavailable::Unreadable, title, close), Vec::new())
		}
		Phase::Open(_) => editor(app, t, document, true),
	};
	let look = PanelLook { width: state.panel_width(room), ..PanelLook::document(title, room) };
	let presence = presence_of(app, t, document, true);
	let panel = document_panel(t, LANGUAGE, look, presence, body, |app: &mut App, event| {
		library(app).handle_panel(event)
	});
	Some((panel, layers))
}

fn lightbox_layer(state: &State) -> Option<El> {
	let Some(Shown::Image(shown)) = state.shown.as_ref() else { return None };
	let images = state.shown_images();
	let position = images.iter().position(|name| *name == shown.name).map_or(0, |at| at + 1);
	let detail =
		state.listed(&shown.name).map(|item| detail_of(item, now_ms())).unwrap_or_default();
	let image =
		LightboxImage { name: title_of(&shown.name), detail: &detail, image: shown.image.as_ref() };
	let look = LightboxLook {
		position,
		count: images.len(),
		zoom_percent: shown.zoom_percent,
		actions: bar_actions(state, &shown.name),
	};
	Some(lightbox(LANGUAGE, &image, look, |app: &mut App, event| {
		library(app).handle_lightbox(event)
	}))
}

fn dialog_layers(state: &State, t: &Tokens) -> Vec<El> {
	match state.dialog.as_ref() {
		Some(Dialog::NewDocument(selected)) => {
			new_document_dialog(t, LANGUAGE, *selected, |app: &mut App, event| {
				library(app).handle_new_document(event, now_ms())
			})
		}
		Some(Dialog::Delete { target, has_failed }) => {
			let name = title_of(&target.name);
			delete_confirmation(t, LANGUAGE, name, *has_failed, |app: &mut App, is_confirmed| {
				library(app).confirm_delete(is_confirmed)
			})
		}
		None => Vec::new(),
	}
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let state = &app.surfaces.s14_library;
	let notice = state.notice.as_ref().map(|notice| {
		failure_notice(t, LANGUAGE, &notice.title, &notice.description)
			.on_press(|app: &mut App| library(app).dismiss_notice())
	});
	if app.navigation.main_route() != Route::Library {
		return notice.into_iter().collect();
	}
	lightbox_layer(state).into_iter().chain(dialog_layers(state, t)).chain(notice).collect()
}
