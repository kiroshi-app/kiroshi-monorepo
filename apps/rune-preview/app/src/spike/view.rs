use std::borrow::Cow;
use std::rc::Rc;

use rune::{
	Align, Color, Cx, El, GrowthSpec, KeyEvent, ScrollSpec, Side, Span, TextStyle, Tx, col, el,
	row, text, text_input,
};
use rune_kit::syntax::{SyntaxTheme, highlight};
use rune_kit::{PopupItem, PopupList};

use kiroshi_rune_kit::tokens::{
	RADIUS_MD, SPACING, TEXT_BUBBLE, TEXT_COMPACT_MONO, TEXT_SM_SEMIBOLD, TEXT_TITLE, Tokens,
};

use super::editor::{EditorBlock, KeyOutcome, SLASH_CHOICES, Shape};
use super::model::LibraryBlockType;
use crate::app::App;

pub const EDITOR: &str = "spike-editor";
pub const CARET_ANCHOR: &str = "spike-caret";
pub const SLASH_MENU: &str = "spike-slash";

const ROW_ESTIMATE: f32 = 32.0;

#[derive(Clone)]
struct Look {
	tokens: Tokens,
	selection: Color,
	syntax: Rc<SyntaxTheme>,
}

pub fn field_key(id: &str, field: usize) -> String {
	format!("{id}:{field}")
}

pub fn view(s: &App, cx: &mut Cx<App>, t: &Tokens) -> El {
	let k = t.kit();
	let look =
		Look { tokens: *t, selection: k.selection(), syntax: Rc::new(SyntaxTheme::from_kit(&k)) };
	let blocks = col().key("spike-blocks").w_full().growth(GrowthSpec::default()).virtual_rows(
		s.spike.blocks.len(),
		ROW_ESTIMATE,
		|s: &App, i| {
			s.spike
				.blocks
				.get(i)
				.map_or(Cow::Borrowed("missing"), |block| Cow::Borrowed(block.id.as_str()))
		},
		move |s: &App, i| s.spike.blocks.get(i).map_or_else(el, |block| block_view(block, &look)),
	);
	let scroller = col()
		.key("spike-scroll")
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.px(SPACING * 10.0)
		.py(SPACING * 6.0)
		.scroll(ScrollSpec { stick_bottom: false })
		.child(blocks);
	let written =
		format!("{} blocks, {} bytes of Markdown", s.spike.blocks.len(), s.spike.markdown().len());
	let status = row()
		.key("spike-status")
		.w_full()
		.px(SPACING * 10.0)
		.py(SPACING * 2.0)
		.child(text(written).font(TEXT_COMPACT_MONO).color(t.muted_foreground));
	let mut editor =
		col().key(EDITOR).w_full().h_full().fill(t.background).child(scroller).child(status);
	let mut layer = Vec::new();
	if let Some(slash) = &s.spike.slash
		&& let Some(anchor) = caret_anchor(cx, &slash.block)
	{
		editor = editor.child(anchor);
		slash_menu(slash.active).build(&k, &mut layer);
	}
	rune_kit::root(editor, layer)
}

fn caret_anchor(cx: &Cx<App>, block: &str) -> Option<El> {
	let caret = cx.caret(&field_key(block, 0))?;
	let origin = cx.layout(EDITOR)?;
	let anchor = el().key(CARET_ANCHOR).absolute(caret[0] - origin[0], caret[1] - origin[1]);
	Some(anchor.size(caret[2].max(1.0), caret[3]))
}

fn slash_menu(active: usize) -> PopupList<App> {
	PopupList::new(SLASH_MENU, CARET_ANCHOR)
		.side(Side::Bottom)
		.align(Align::Start)
		.width(200.0)
		.items(SLASH_CHOICES.map(|choice| PopupItem::new(choice.label(), choice.label())))
		.active(Some(active))
		.on_choose(|s: &mut App, id: &str, _: &mut Tx| {
			if let Some(choice) = SLASH_CHOICES.into_iter().find(|choice| choice.label() == id) {
				s.spike.choose(choice);
			}
		})
		.on_close(|s: &mut App| s.spike.slash = None)
}

fn block_view(block: &EditorBlock, look: &Look) -> El {
	let t = &look.tokens;
	let body = match &block.shape {
		Shape::Paragraph => field(block, 0, TEXT_BUBBLE, look),
		Shape::Rows { kind, head, markers } => rows(block, *kind, head.as_deref(), markers, look),
		Shape::Code { .. } => {
			col().w_full().fill(t.muted).radius(RADIUS_MD).padding(SPACING * 3.0).child(
				field(block, 0, TEXT_COMPACT_MONO, look)
					.decorations(code_decorations(block, &look.syntax)),
			)
		}
		Shape::Table { columns, .. } => table(block, *columns, look),
		Shape::Opaque(source) => {
			text(source.clone()).font(TEXT_COMPACT_MONO).color(t.muted_foreground).wrap()
		}
	};
	row().w_full().pb(SPACING * 2.0).child(body)
}

pub fn code_decorations(block: &EditorBlock, syntax: &SyntaxTheme) -> Vec<Span> {
	let (Shape::Code { open, .. }, Some(body)) = (&block.shape, block.fields.first()) else {
		return Vec::new();
	};
	let language = open.trim_start().trim_start_matches(['`', '~']).split_whitespace().next();
	syntax.spans(&highlight(language, &body.text), 0)
}

fn rows(
	block: &EditorBlock,
	kind: LibraryBlockType,
	head: Option<&str>,
	markers: &[String],
	look: &Look,
) -> El {
	let t = &look.tokens;
	let style = if kind == LibraryBlockType::Heading { TEXT_TITLE } else { TEXT_BUBBLE };
	let mut column = col().w_full().gap(SPACING);
	if let Some(head) = head {
		column = column.child(text(callout_title(head)).font(TEXT_SM_SEMIBOLD).color(t.foreground));
	}
	for (index, marker) in markers.iter().enumerate() {
		let mut line = row().w_full().gap(SPACING * 2.0);
		if let Some(glyph) = row_glyph(kind, marker) {
			line = line.child(text(glyph).font(style).color(t.muted_foreground));
		}
		column = column.child(line.child(field(block, index, style, look)));
	}
	if kind != LibraryBlockType::Callout {
		return column;
	}
	column.fill(t.muted).radius(RADIUS_MD).padding(SPACING * 3.0)
}

fn row_glyph(kind: LibraryBlockType, marker: &str) -> Option<String> {
	match kind {
		LibraryBlockType::List => Some(marker.trim().replace(['-', '*', '+'], "•")),
		LibraryBlockType::Checklist => {
			let done = marker.contains("[x]") || marker.contains("[X]");
			Some(if done { "[x]" } else { "[ ]" }.to_owned())
		}
		LibraryBlockType::Quote => Some("|".to_owned()),
		_ => None,
	}
}

fn callout_title(head: &str) -> &'static str {
	if head.contains("[!TIP]") {
		"Tip"
	} else if head.contains("[!WARNING]") {
		"Warning"
	} else {
		"Note"
	}
}

fn table(block: &EditorBlock, columns: usize, look: &Look) -> El {
	let t = &look.tokens;
	let mut grid = col().w_full().border(1.0, t.border).radius(RADIUS_MD);
	for (row_index, cells) in block.fields.chunks(columns.max(1)).enumerate() {
		let style = if row_index == 0 { TEXT_SM_SEMIBOLD } else { TEXT_BUBBLE };
		let mut line = row().w_full();
		for column in 0..cells.len() {
			let cell = field(block, row_index * columns + column, style, look);
			line = line.child(col().grow(1.0).min_w(0.0).padding(SPACING * 2.0).child(cell));
		}
		grid = grid.child(line);
	}
	grid
}

fn field(block: &EditorBlock, index: usize, style: TextStyle, look: &Look) -> El {
	let t = &look.tokens;
	let (edit_id, key_id, change_id) = (block.id.clone(), block.id.clone(), block.id.clone());
	text_input(&block.fields[index], style)
		.key(field_key(&block.id, index))
		.w_full()
		.color(t.foreground)
		.caret(t.foreground, look.selection)
		.on_edit(move |s: &mut App| s.spike.field_mut(&edit_id, index))
		.on_input_key(move |s: &mut App, event: &KeyEvent, tx: &mut Tx| {
			match s.spike.input_key(&key_id, index, event) {
				KeyOutcome::Passed => false,
				KeyOutcome::Consumed => true,
				KeyOutcome::Copied(copied) => {
					tx.copy(copied);
					true
				}
			}
		})
		.on_input_change(move |s: &mut App, _: &mut Tx| s.spike.changed(&change_id))
}
