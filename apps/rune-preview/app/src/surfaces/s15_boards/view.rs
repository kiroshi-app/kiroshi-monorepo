use std::time::Instant;

use kiroshi_core::library::contract::{LibraryItem, LibraryItemKind};
use rune::{El, TextEdit, col, el};

use kiroshi_rune_kit::primitives::toast::{Toast, toast};
use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s14_library::{
	Agent, BarActions, DocumentBar, ItemEvent, Unavailable, document_bar, item_unavailable,
	presence,
};
use kiroshi_rune_kit::surfaces::s15_boards::canvas::{Board, Editor, board_view};
use kiroshi_rune_kit::surfaces::s15_boards::card::{
	Card, Snapshot, Summary as CardSummary, board_card,
};
use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Event, Item, LibraryFace, LibraryItem as ShelfItem, Object, Owner, OwnerKind, Rect, Size, Tool,
};
use kiroshi_rune_kit::tokens::Tokens;

use super::presence::{Shown, shown};
use super::projection::{objects_of, snapshot_of};
use super::{Notice, Open, Phase, Summary, leave_board, open_board, title_of};
use crate::app::App;

pub const CANVAS: &str = "board-canvas-region";

const LANGUAGE: Language = Language::En;

fn agent_owner(app: &App, id: &str) -> Option<Owner> {
	let name = app.agent_name(id)?;
	Some(Owner::agent(id, &name, app.agent_hue(id)))
}

fn owner_of(app: &App, kind: OwnerKind, id: &str) -> Owner {
	match kind {
		OwnerKind::Agent => agent_owner(app, id).unwrap_or_else(|| Owner::agent(id, "", None)),
		OwnerKind::Person => Owner::person(id, "", None),
	}
}

fn shelf_item(item: &LibraryItem) -> ShelfItem {
	let face = match item.kind {
		LibraryItemKind::Image => LibraryFace::Image(None),
		LibraryItemKind::Document | LibraryItemKind::Board => {
			LibraryFace::Document { excerpt: String::new() }
		}
	};
	ShelfItem { id: item.name.clone(), title: title_of(&item.name).to_owned(), face }
}

fn edit_of(app: &mut App) -> &mut TextEdit {
	&mut app.surfaces.s15_boards.edit
}

fn notice_view(t: &Tokens, notice: &Notice) -> El {
	toast(
		t,
		Toast {
			kind: notice.kind,
			title: &notice.title,
			description: &notice.description,
			action: None,
		},
	)
}

fn presence_view(t: &Tokens, shown: &Shown) -> El {
	let writers: Vec<Agent> =
		shown.drawers.iter().map(|owner| Agent { name: &owner.name, hue: owner.hue }).collect();
	let people: Vec<&str> = shown.people.iter().map(|owner| owner.name.as_str()).collect();
	let stop = |app: &mut App| app.surfaces.s15_boards.stop_drawers();
	presence(t, LANGUAGE, &writers, &people, Some(stop))
}

fn bar(t: &Tokens, open: &Open, shown: &Shown) -> El {
	let on = |app: &mut App, event: ItemEvent| match event {
		ItemEvent::Back | ItemEvent::Close => leave_board(app),
		ItemEvent::Download | ItemEvent::Copy | ItemEvent::More => {}
	};
	document_bar(
		t,
		LANGUAGE,
		DocumentBar {
			name: title_of(&open.target.name),
			is_read_only: false,
			presence: Some(presence_view(t, shown)),
			actions: BarActions::NONE,
		},
		on,
	)
}

fn canvas(app: &App, t: &Tokens, open: &Open, shown: &Shown, area: Option<Size>) -> El {
	let session = match &open.phase {
		Phase::Open(session) => Some(session),
		Phase::Opening | Phase::Failed(_) => None,
	};
	let objects: Vec<Object> = session.map_or_else(Vec::new, |session| {
		objects_of(session.held(), &|kind, id| owner_of(app, kind, id))
	});
	let area = area.unwrap_or_default();
	let viewport = open.viewport_in(&objects, area);
	let library: Vec<ShelfItem> = open.shelf.iter().map(shelf_item).collect();
	let board = Board {
		objects: &objects,
		viewport,
		area,
		frame: &open.frame,
		tool: open.tool,
		is_connecting: open.tool == Tool::Connector,
		is_loading: session.is_none() || area == Size::default(),
		pointers: &shown.pointers,
		outlines: &shown.outlines,
		library: &library,
	};
	let editor = Editor { edit: &app.surfaces.s15_boards.edit, access: edit_of };
	let emit = move |app: &mut App, event: Event| {
		let boards = &mut app.surfaces.s15_boards;
		boards.pin_viewport(viewport);
		boards.handle(event, Instant::now());
	};
	board_view(t, &board, Some(editor), emit)
}

pub fn view(app: &App, t: &Tokens, measured: Option<[f32; 2]>) -> El {
	let area = measured.map(|[width, height]| Size::new(f64::from(width), f64::from(height)));
	let Some(open) = app.surfaces.s15_boards.board.as_ref() else { return el() };
	let notice = open.notice.as_ref().map(|notice| notice_view(t, notice));
	if let Phase::Failed(_) = open.phase {
		let back = |app: &mut App| leave_board(app);
		let unavailable = item_unavailable(
			t,
			LANGUAGE,
			Unavailable::Unreadable,
			title_of(&open.target.name),
			back,
		);
		return col().w_full().h_full().children(notice).child(unavailable);
	}
	let shown = shown(&open.writers, &|id| agent_owner(app, id));
	let region = el()
		.key(CANVAS)
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.on_key(|app: &mut App, key, _| app.surfaces.s15_boards.key_pressed(key))
		.child(canvas(app, t, open, &shown, area));
	col().w_full().h_full().child(bar(t, open, &shown)).children(notice).child(region)
}

pub(super) fn summary_of<'a>(
	summary: Option<&Summary>,
	snapshot: &'a Option<(Rect, Vec<Item>)>,
) -> CardSummary<'a> {
	match (summary, snapshot) {
		(Some(Summary::Loaded(summary)), Some((bounds, objects))) => CardSummary::Loaded {
			item_count: summary.node_count as usize,
			snapshot: Snapshot { bounds: *bounds, objects },
		},
		(Some(Summary::Failed), _) => CardSummary::Failed,
		_ => CardSummary::Loading,
	}
}

pub fn card(app: &App, t: &Tokens, name: &str, width: f32) -> El {
	let boards = &app.surfaces.s15_boards;
	let summary = boards.summaries.get(name);
	let snapshot = match summary {
		Some(Summary::Loaded(summary)) => Some(snapshot_of(summary)),
		Some(Summary::Loading | Summary::Failed) | None => None,
	};
	let card = Card {
		title: title_of(name),
		summary: summary_of(summary, &snapshot),
		drawing: None,
		edited: "",
		pointers: &[],
		is_open_beside: boards.board.as_ref().is_some_and(|open| open.target.name == name),
	};
	let name = name.to_owned();
	board_card(t, &card, width, move |app: &mut App| open_board(app, &name))
}
