use rune::{El, ScrollSpec, col, icon, row, text};

use super::centred;
use crate::icons;
use crate::tokens::{SHELL_INSET, SPACING, TEXT_BASE_SEMIBOLD, TEXT_SM, TEXT_XS, Tokens};

const COLUMN_CAP: f32 = SPACING * 200.0;
const EMPTY_STATE_MEASURE: f32 = SPACING * 112.0;
const HINT_GLYPH: f32 = SPACING * 3.5;

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ScreenWidth {
	Column,
	#[default]
	Full,
}

pub struct Screen {
	pub header: Option<El>,
	pub content: Vec<El>,
	pub footer: Vec<El>,
	pub width: ScreenWidth,
	pub in_card: bool,
}

pub fn screen_layout(t: &Tokens, screen: Screen) -> El {
	let mut column = col().w_full().px(SPACING * 6.0).pt(SPACING * 8.0).pb(SPACING * 4.0);
	if screen.width == ScreenWidth::Column {
		column = column.max_w(COLUMN_CAP);
	}
	let scroller = col()
		.key("screen-layout-scroller")
		.w_full()
		.grow(1.0)
		.items_center()
		.scroll(ScrollSpec { stick_bottom: false })
		.child(column.children(screen.content));
	let mut layout = col().key("screen-layout").w_full().h_full().fill(if screen.in_card {
		t.card
	} else {
		t.background
	});
	if let Some(header) = screen.header {
		layout = layout.child(header);
	}
	layout = layout.child(scroller);
	if !screen.footer.is_empty() {
		layout = layout.child(
			col()
				.w_full()
				.gap(SPACING * 3.0)
				.px(SHELL_INSET)
				.pb(SHELL_INSET)
				.children(screen.footer),
		);
	}
	layout
}

pub struct EmptyState<'a> {
	pub mark: El,
	pub title: &'a str,
	pub description: &'a str,
	pub action: Option<El>,
	pub hint: Option<&'a str>,
}

pub fn empty_state_shell(t: &Tokens, state: EmptyState) -> El {
	let mut shell = col()
		.key("empty-state-shell")
		.w_full()
		.items_center()
		.gap(SPACING * 5.0)
		.px(SPACING * 6.0)
		.py(SPACING * 12.0)
		.child(state.mark)
		.child(
			col()
				.max_w(EMPTY_STATE_MEASURE)
				.items_center()
				.gap(SPACING * 2.0)
				.child(
					centred(
						text(state.title.to_owned()).font(TEXT_BASE_SEMIBOLD).color(t.foreground),
					)
					.role("heading"),
				)
				.child(centred(
					text(state.description.to_owned()).font(TEXT_SM).color(t.muted_foreground),
				)),
		);
	if let Some(action) = state.action {
		shell = shell.child(action);
	}
	if let Some(hint) = state.hint {
		shell = shell.child(
			row()
				.center_y()
				.gap(SPACING * 1.5)
				.child(text(hint.to_owned()).font(TEXT_XS).color(t.muted_foreground))
				.child(
					icon(&icons::ARROW_DOWN, HINT_GLYPH).color(t.muted_foreground).a11y_hidden(),
				),
		);
	}
	shell
}
