use rune::{Align, Cursor, El, Side, TextEdit, TextStyle, col, icon, row, text, text_input};

use super::prompt::attach_control;
use super::{ComposerIntent, ROW_RING, Reach, Scope, filled};
use crate::icons;
use crate::primitives::{elevated, instant};
use crate::strings::common::library;
use crate::tokens::{
	RADIUS_LG, RADIUS_MD, RADIUS_SM, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM,
	TEXT_XS, TEXT_XS_MEDIUM, Tokens, faded,
};

pub const TRIGGER_KEY: &str = "composer-attach";
const WIDTH: f32 = SPACING * 100.0;
const SEARCH_ROW: f32 = SPACING * 10.0;
const ROW: f32 = SPACING * 12.0;
const FILES_ROW: f32 = SPACING * 9.0;
const LIST_MAX: f32 = SPACING * 72.0;
const TILE: f32 = SPACING * 7.0;
const HINT: f32 = SPACING * 5.0;
const OFFSET: f32 = SPACING * 2.0;
const LINE: f32 = 16.0;
const NAME_LINE: f32 = 20.0;

#[derive(Clone, Copy)]
pub struct LibraryDocument<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub detail: &'a str,
}

pub struct LibraryPicker<'a> {
	pub documents: &'a [LibraryDocument<'a>],
	pub query: &'a TextEdit,
	pub highlighted: Option<usize>,
}

pub fn shown_name<S: 'static>(scope: Scope<S>, document: &LibraryDocument) -> String {
	if document.name.trim().is_empty() {
		scope.say(library::editor::UNTITLED).to_owned()
	} else {
		document.name.to_owned()
	}
}

pub fn picker_matches<'a, S: 'static>(
	scope: Scope<S>,
	documents: &[LibraryDocument<'a>],
	query: &str,
) -> Vec<LibraryDocument<'a>> {
	let needle = query.to_lowercase();
	documents
		.iter()
		.filter(|document| shown_name(scope, document).to_lowercase().contains(&needle))
		.copied()
		.collect()
}

pub fn library_trigger<S: 'static>(scope: Scope<S>, reach: Reach, is_open: bool) -> El {
	let trigger = attach_control(scope, TRIGGER_KEY, reach, ComposerIntent::OpenLibrary);
	if is_open {
		let t = scope.t;
		trigger.fill(if t.dark { faded(t.muted, 0.5) } else { t.muted }).expanded(true)
	} else {
		trigger.expanded(false)
	}
}

fn hairline(t: &Tokens) -> rune::Color {
	faded(t.foreground, 0.07)
}

fn document_row<S: 'static>(scope: Scope<S>, document: &LibraryDocument, highlighted: bool) -> El {
	let t = scope.t;
	let name = shown_name(scope, document);
	let mut body = row()
		.key(format!("library-document-{}", document.id))
		.w_full()
		.h(ROW)
		.gap(SPACING * 2.5)
		.px(SPACING * 2.5)
		.center_y()
		.radius(RADIUS_LG)
		.role("option")
		.label(name.clone())
		.checked(highlighted)
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(faded(t.foreground, 0.05))
		.child(
			row()
				.size(TILE, TILE)
				.radius(RADIUS_MD)
				.fill(t.muted)
				.center()
				.a11y_hidden()
				.child(icon(&icons::FILE, SPACING * 4.0).color(t.foreground)),
		)
		.child(
			col()
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.child(
					text(name)
						.font(TextStyle { line_height: NAME_LINE, ..TEXT_SM_MEDIUM })
						.color(t.foreground)
						.truncate(),
				)
				.child(
					text(document.detail.to_owned())
						.font(TextStyle { line_height: LINE, ..TEXT_XS })
						.color(t.muted_foreground)
						.truncate(),
				),
		);
	if highlighted {
		body = body.fill(faded(t.foreground, 0.05)).child(
			row()
				.h(HINT)
				.px(SPACING * 1.5)
				.radius(RADIUS_SM)
				.border(1.0, t.border)
				.center()
				.a11y_hidden()
				.child(icon(&icons::CORNER_DOWN_LEFT, SPACING * 3.0).color(t.muted_foreground)),
		);
	}
	scope.on_press(body, ComposerIntent::PickDocument(document.id.to_owned()))
}

pub fn library_picker<S: 'static>(
	scope: Scope<S>,
	picker: &LibraryPicker,
	access: impl for<'b> Fn(&'b mut S) -> &'b mut TextEdit + 'static,
) -> El {
	let t = scope.t;
	let search_label = scope.say(library::document_picker::SEARCH);
	let compact = TextStyle { line_height: LINE, ..TEXT_COMPACT };
	let search = row()
		.w_full()
		.h(SEARCH_ROW)
		.gap(SPACING * 2.0)
		.px(SPACING * 2.5)
		.center_y()
		.child(icon(&icons::SEARCH, SPACING * 4.0).color(t.muted_foreground))
		.child(
			text_input(picker.query, TextStyle { line_height: NAME_LINE, ..TEXT_SM })
				.single_line()
				.key("library-search")
				.grow(1.0)
				.shrink()
				.min_w(0.0)
				.color(t.foreground)
				.placeholder(search_label, t.placeholder_foreground)
				.caret(t.foreground, t.selection)
				.label(search_label)
				.no_focus_ring()
				.on_edit(access),
		);
	let query = picker.query.text.as_str();
	let matches = picker_matches(scope, picker.documents, query);
	let section = text(scope.say(library::filters::DOCUMENTS))
		.font(TextStyle { line_height: LINE, ..TEXT_XS_MEDIUM })
		.color(t.muted_foreground)
		.px(SPACING * 2.5)
		.pt(SPACING * 2.0)
		.pb(SPACING);
	let listing = if matches.is_empty() {
		text(filled(scope.say(library::no_result::SEARCH), &[("query", query)]))
			.font(compact)
			.color(t.muted_foreground)
			.px(SPACING * 2.5)
			.py(SPACING * 3.0)
	} else {
		col().w_full().max_h(LIST_MAX).scroll(rune::ScrollSpec { stick_bottom: false }).child(
			col().w_full().role("listbox").focus_group().children(matches.iter().enumerate().map(
				|(at, document)| document_row(scope, document, picker.highlighted == Some(at)),
			)),
		)
	};
	let files_label = scope.say(library::document_picker::ATTACH_FILES);
	let files = instant(
		scope
			.on_press(
				row()
					.key("library-attach-files")
					.w_full()
					.h(FILES_ROW)
					.gap(SPACING * 2.0)
					.px(SPACING * 2.5)
					.center_y()
					.corners([0.0, 0.0, RADIUS_LG, RADIUS_LG])
					.role("button")
					.label(files_label)
					.hover(faded(t.foreground, 0.05))
					.press(faded(t.foreground, 0.08))
					.child(icon(&icons::PLUS, SPACING * 3.5).color(t.soft_foreground))
					.child(text(files_label).font(compact).color(t.soft_foreground).truncate()),
				ComposerIntent::BrowseFiles,
			)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(ROW_RING, ROW_RING, t.ring),
	);
	elevated(
		t,
		col()
			.key("library-picker")
			.w(WIDTH)
			.padding(SPACING)
			.radius(RADIUS_XL)
			.fill(t.prompt_menu)
			.role("dialog")
			.label(scope.say(library::document_picker::LABEL))
			.child(search)
			.child(rule(t))
			.child(section)
			.child(listing)
			.child(col().w_full().mt(SPACING).child(rule(t)).child(files)),
	)
	.anchored(TRIGGER_KEY, Side::Top, Align::Start, OFFSET)
}

fn rule(t: &Tokens) -> El {
	rune::el().w_full().h(1.0).fill(hairline(t)).a11y_hidden()
}
