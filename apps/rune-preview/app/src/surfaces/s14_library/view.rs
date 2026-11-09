use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind, LibraryWriter};
use rune::{Align, El, Side, TextEdit, col};

use kiroshi_rune_kit::strings::{Language, common};
use kiroshi_rune_kit::surfaces::s14_library::{
	Agent, BarActions, BlockMenuLook, DocumentBar, DocumentPanelEvent, EditorBlock, FieldAccess,
	GalleryEdit, HandlePlace, ItemEvent, ItemLook, LibraryBlockType, LibraryItem as Tile,
	LibraryPanel, LightboxImage, LightboxLook, PanelActions, PanelLook, PanelState, TOOLBAR_GAP,
	TableCells, Tile as GalleryTile, TileImage, Unavailable, Writer, agent_card, agent_caret,
	block_editor, block_handle, block_menu, delete_confirmation, document_bar, document_column,
	document_panel, document_skeleton, drag_ghost, drop_indicator, field_key,
	field_of as record_field, format_toolbar, gallery_editor, grid_columns, item_menu,
	item_unavailable, library_panel, lightbox, link_field, new_document_dialog, presence, rows_of,
	table_editor, title_field, turn_into_menu,
};
use kiroshi_rune_kit::tokens::{SPACING, Tokens};

use super::blocks::{Block, field_texts_of, gallery_records, is_editable, table_columns, texts_of};
use super::document::{Document, Phase, title_of};
use super::editing::pressed_of;
use super::item_menu::{MenuPlace, MenuSurface};
use super::{Dialog, Listing, Preview, Shown, State, said};
use crate::app::App;
use crate::conversations::{now_ms, roster_timestamp};
use crate::navigation::Route;

pub const GRID: &str = "library-panel";

const LANGUAGE: Language = Language::En;

const DEFAULT_COLUMNS: usize = 4;

const KIB: u64 = 1024;

const UNMEASURED_PITCH: f32 = SPACING * 14.0;

const GALLERY_TILE_MIN: f32 = SPACING * 30.0;

const GALLERY_TILE_GAP: f32 = SPACING * 1.5;

const UNMEASURED_GALLERY_COLUMNS: usize = 4;

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

fn field_access(is_beside: bool) -> FieldAccess<App> {
	if is_beside { beside_field } else { shown_field }
}

fn block_key(block: &str) -> String {
	format!("library-block-{block}")
}

fn grip_key() -> String {
	format!("library-handle-{}", said(common::library::editor::blocks::handle::MENU))
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

fn panel_state_of(listing: &Listing) -> PanelState {
	match listing {
		Listing::Idle | Listing::Loading => PanelState::Loading,
		Listing::Failed => PanelState::Failed,
		Listing::Loaded(_) => PanelState::Ready,
	}
}

fn panel_view(state: &State, t: &Tokens, width: Option<f32>) -> El {
	let items = match &state.listing {
		Listing::Idle | Listing::Loading | Listing::Failed => &[][..],
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
	let panel = LibraryPanel {
		state: panel_state_of(&state.listing),
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

fn link_edit(app: &mut App) -> &mut TextEdit {
	library(app).link_mut()
}

fn link_layer(state: &State, t: &Tokens, is_beside: bool) -> Option<El> {
	let link = state.link.as_ref().filter(|link| link.is_beside == is_beside)?;
	let on = |app: &mut App, event| library(app).handle_link(event);
	let field = link_field(t, LANGUAGE, &link.edit, link_edit, on);
	Some(field.anchored(field_key(&link.block, link.row), Side::Top, Align::Start, TOOLBAR_GAP))
}

fn toolbar_layer(state: &State, t: &Tokens, document: &Document, is_beside: bool) -> Option<El> {
	if let Some(link) = link_layer(state, t, is_beside) {
		return Some(link);
	}
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
			let anchor = block_key(&card.block);
			agent_card(t, LANGUAGE, &writer).anchored(anchor, Side::Bottom, Align::Start, SPACING)
		})
		.collect()
}

fn pitches_of(blocks: &[Block]) -> Vec<f32> {
	let rects: Vec<Option<[f32; 4]>> =
		blocks.iter().map(|block| rune::memo::layout(&block_key(&block.id))).collect();
	(0..rects.len())
		.map(|at| match (rects[at], rects.get(at + 1).copied().flatten()) {
			(Some(rect), Some(next)) => next[1] - rect[1],
			(Some(rect), None) => rect[3],
			(None, _) => UNMEASURED_PITCH,
		})
		.collect()
}

fn with_handle(
	state: &State,
	t: &Tokens,
	views: &mut [EditorBlock],
	blocks: &[Block],
	is_beside: bool,
) {
	let Some(handled) = state.handled_block(is_beside) else { return };
	let Some(index) = views.iter().position(|view| view.id == handled) else { return };
	let pitches = pitches_of(blocks);
	let block = handled.to_owned();
	let on = move |app: &mut App, event| library(app).handle_block_handle(is_beside, &block, event);
	let place = HandlePlace { index, pitches: &pitches };
	let is_pressed = state.block_menu.is_some() || state.dragged(is_beside).is_some();
	views[index].handle = Some(block_handle(t, LANGUAGE, is_pressed, place, on));
}

fn block_menu_layers(state: &State, t: &Tokens, document: &Document, is_beside: bool) -> Vec<El> {
	let Some(menu) = state.block_menu.as_ref().filter(|menu| menu.is_beside == is_beside) else {
		return Vec::new();
	};
	let Some(at) = document.block_at(&menu.block) else { return Vec::new() };
	let kind = document.blocks[at].kind();
	let look = BlockMenuLook {
		kind,
		is_mac: cfg!(target_os = "macos"),
		can_move_up: at > 0,
		can_move_down: at + 1 < document.blocks.len(),
		is_turn_into_shown: menu.is_turn_into_shown,
	};
	let on = |app: &mut App, action| library(app).handle_block_menu(action);
	let close = |app: &mut App| library(app).close_block_menu();
	let shown = block_menu(t, LANGUAGE, look, on).modal(true, close).anchored(
		grip_key(),
		Side::Bottom,
		Align::Start,
		SPACING,
	);
	let turn_into =
		menu.is_turn_into_shown.then(|| turn_into_menu(t, LANGUAGE, kind, on).modal(true, close));
	std::iter::once(shown).chain(turn_into).collect()
}

fn with_drop_indicator(state: &State, t: &Tokens, views: &mut [EditorBlock], is_beside: bool) {
	let Some(drag) = state.dragged(is_beside) else { return };
	if let Some(view) = views.get_mut(drag.landing()) {
		view.above = Some(drop_indicator(t));
	}
}

fn ghost_layer(state: &State, t: &Tokens, document: &Document, is_beside: bool) -> Option<El> {
	let drag = state.dragged(is_beside)?;
	let held = document.blocks.get(drag.from)?;
	let [x, y, width, height] = rune::memo::window_layout(&grip_key())?;
	let pointer = (x + width / 2.0 + drag.offset.0, y + height / 2.0 + drag.offset.1);
	let text = texts_of(&held.source).into_iter().next().unwrap_or_default();
	Some(drag_ghost(t, LANGUAGE, &[&text], None, pointer))
}

fn table_view(t: &Tokens, document: &Document, block: &Block, is_beside: bool) -> Option<El> {
	let columns = table_columns(&block.source);
	let count = field_texts_of(&block.source).len();
	let edits: Vec<&TextEdit> =
		(0..count).map(|field| document.field(&block.id, field)).collect::<Option<_>>()?;
	let rows = edits.chunks(columns).map(<[&TextEdit]>::to_vec).collect();
	let focused = document
		.focused()
		.filter(|field| field.block == block.id)
		.map_or((0, 0), |field| (field.row / columns, field.row % columns));
	let cells = TableCells { block: &block.id, rows, focused };
	let id = block.id.clone();
	let on = move |app: &mut App, event| library(app).handle_table(is_beside, &id, event);
	Some(table_editor(t, LANGUAGE, &cells, field_access(is_beside), on))
}

fn gallery_columns(block: &str) -> usize {
	let width = rune::memo::layout(&block_key(block)).map(|rect| rect[2]);
	width.map_or(UNMEASURED_GALLERY_COLUMNS, |width| {
		(((width + GALLERY_TILE_GAP) / (GALLERY_TILE_MIN + GALLERY_TILE_GAP)).floor() as usize)
			.max(1)
	})
}

fn gallery_view(
	state: &State,
	t: &Tokens,
	document: &Document,
	block: &Block,
	is_beside: bool,
) -> Option<El> {
	let records = gallery_records(&block.source);
	let captions: Vec<&TextEdit> =
		(0..records.len()).map(|at| document.field(&block.id, at)).collect::<Option<_>>()?;
	let tiles: Vec<GalleryTile> = records
		.iter()
		.map(|record| GalleryTile { image: TileImage::Resolving, alt: record_field(record, "alt") })
		.collect();
	let edit = GalleryEdit {
		block: &block.id,
		tiles: &tiles,
		captions,
		columns: gallery_columns(&block.id),
		drag: None,
		has_add_failed: state.has_gallery_add_failed(is_beside, &block.id),
	};
	let id = block.id.clone();
	let on = move |app: &mut App, event| library(app).handle_gallery(is_beside, &id, event);
	Some(gallery_editor(t, LANGUAGE, &edit, field_access(is_beside), on).0)
}

fn editor(app: &App, t: &Tokens, document: &Document, is_beside: bool) -> (El, Vec<El>) {
	let state = &app.surfaces.s14_library;
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
			view.drawn = match kind {
				LibraryBlockType::Table => table_view(t, document, block, is_beside),
				LibraryBlockType::Gallery => gallery_view(state, t, document, block, is_beside),
				_ => None,
			};
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
	with_handle(state, t, &mut views, blocks, is_beside);
	with_drop_indicator(state, t, &mut views, is_beside);
	let query = state.slash_query().unwrap_or_default();
	let slash = state
		.slash
		.as_ref()
		.filter(|slash| slash.is_beside == is_beside)
		.and_then(|_| state.slash_view(&query));
	let on = move |app: &mut App, event| library(app).handle_block(is_beside, event);
	let (body, mut layers) =
		block_editor(t, LANGUAGE, &mut views, slash, field_access(is_beside), on);
	layers.extend(toolbar_layer(state, t, document, is_beside));
	layers.extend(block_menu_layers(state, t, document, is_beside));
	layers.extend(ghost_layer(state, t, document, is_beside));
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

fn menu_layer(state: &State, t: &Tokens) -> Option<El> {
	let menu = state.menu.as_ref()?;
	let dark = Tokens::new(true);
	let is_dark = matches!(menu.surface, MenuSurface::Lightbox | MenuSurface::Picture);
	let t = if is_dark { &dark } else { t };
	let actions = state.menu_actions();
	let chosen = |app: &mut App, action| library(app).choose_in_menu(action);
	let shown = item_menu(t, LANGUAGE, &menu.name, &actions, state.menu_image(), chosen)
		.modal(true, |app: &mut App| library(app).close_menu());
	Some(match &menu.place {
		MenuPlace::Under(anchor) => {
			shown.anchored(anchor.clone(), Side::Bottom, Align::End, SPACING)
		}
		MenuPlace::At(at) => shown.absolute(at.x, at.y),
	})
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
	if app.navigation.main_route() != Route::Library {
		return Vec::new();
	}
	let menu = menu_layer(state, t);
	lightbox_layer(state).into_iter().chain(menu).chain(dialog_layers(state, t)).collect()
}
