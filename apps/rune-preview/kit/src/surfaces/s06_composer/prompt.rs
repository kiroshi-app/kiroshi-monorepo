use rune::{
	ClipboardContent, El, Key, LiveRegion, TextEdit, auto_grow, col, row, text, text_input,
};

use super::chips::{ReplyChip, reply_chips};
use super::quote::{SelectionQuote, selection_quote};
use super::{CONTROL, ComposerIntent, Reach, RoundControl, Scope, filled, ghost_paint};
use crate::icons;
use crate::primitives::{DISABLED_OPACITY, Paint};
use crate::strings::chat::{attachments, composer};
use crate::tokens::{RADIUS_3XL, SPACING, TEXT_BUBBLE, Tokens, faded};

pub const COMPOSER_KEY: &str = "composer";
pub(super) const FIELD_KEY: &str = "composer-field";
const PADDING: f32 = SPACING * 2.0;
const GAP: f32 = SPACING;
const BORDER: f32 = 1.0;
const FIELD_INSET_X: f32 = SPACING * 2.0;
const FIELD_INSET_Y: f32 = SPACING;
const MAX_ROWS: usize = 8;
const PILL_RADIUS: f32 = 25.0;
const CARRYING_RADIUS: f32 = 20.0;
const CHIP_ROW_GAP: f32 = SPACING * 1.5;
const FILES_BASIS: f32 = SPACING * 56.0;

pub struct Offline<'a> {
	pub space: &'a str,
	pub host: &'a str,
}

pub struct PromptInput<'a> {
	pub edit: &'a TextEdit,
	pub width: f32,
	pub label: Option<&'a str>,
	pub placeholder: Option<&'a str>,
	pub leading: Vec<El>,
	pub quote: Option<SelectionQuote<'a>>,
	pub replies: &'a [ReplyChip<'a>],
	pub attachments: Option<El>,
	pub disabled: bool,
	pub offline: Option<Offline<'a>>,
	pub drop_target: bool,
	pub menu_open: bool,
	pub focused: bool,
}

impl<'a> PromptInput<'a> {
	pub fn new(edit: &'a TextEdit, width: f32) -> PromptInput<'a> {
		PromptInput {
			edit,
			width,
			label: None,
			placeholder: None,
			leading: Vec::new(),
			quote: None,
			replies: &[],
			attachments: None,
			disabled: false,
			offline: None,
			drop_target: false,
			menu_open: false,
			focused: false,
		}
	}

	pub fn is_blocked(&self) -> bool {
		self.disabled || self.offline.is_some()
	}

	pub fn has_payload(&self) -> bool {
		!self.edit.text.trim().is_empty() || self.attachments.is_some()
	}

	pub fn can_send(&self) -> bool {
		self.has_payload() && !self.is_blocked()
	}

	fn send_reach(&self) -> Reach {
		if self.offline.is_some() {
			Reach::Blank
		} else if self.disabled {
			Reach::Disabled
		} else {
			Reach::Live
		}
	}

	pub fn is_expanded(&self) -> bool {
		if self.offline.is_some() {
			return false;
		}
		let draft = &self.edit.text;
		let (draft_width, _) = rune::text::measure(draft, &[], TEXT_BUBBLE, None);
		let controls = (self.leading.len() + 1) as f32 * (CONTROL + GAP);
		let room = self.width - 2.0 * (BORDER + PADDING) - controls;
		draft.contains('\n') || draft_width + 2.0 * FIELD_INSET_X > room
	}

	fn radius(&self, expanded: bool) -> f32 {
		if self.attachments.is_some() || !self.replies.is_empty() || self.quote.is_some() {
			CARRYING_RADIUS
		} else if expanded {
			RADIUS_3XL
		} else {
			PILL_RADIUS
		}
	}
}

pub fn focus_prompt(edit: &mut TextEdit, is_blocked: bool) {
	if is_blocked {
		return;
	}
	edit.focused = true;
	edit.set_caret(edit.text.len());
}

pub(super) fn surface(t: &Tokens, input: &PromptInput) -> (rune::Color, rune::Color) {
	let is_drop_target = input.drop_target && !input.is_blocked();
	let fill = if input.offline.is_some() {
		t.prompt_surface_inert
	} else if is_drop_target {
		faded(t.primary, 0.1)
	} else {
		t.prompt_surface
	};
	let border = if input.offline.is_some() {
		faded(t.foreground, 0.08)
	} else if input.focused {
		faded(t.foreground, 0.2)
	} else if is_drop_target {
		t.primary
	} else if input.has_payload() {
		faded(t.foreground, 0.2)
	} else {
		faded(t.foreground, 0.1)
	};
	(fill, border)
}

pub fn send_button<S: 'static>(scope: Scope<S>, has_payload: bool, reach: Reach) -> El {
	let t = scope.t;
	let paint = if has_payload {
		Paint::plain(t.foreground, t.on_foreground)
	} else {
		Paint::plain(faded(t.foreground, 0.08), t.disabled_foreground)
	};
	RoundControl {
		key: "composer-send",
		label: scope.say(composer::SEND),
		glyph: &icons::SEND,
		side: CONTROL,
		glyph_side: super::GLYPH,
		paint,
		border: None,
		reach,
	}
	.view(scope, has_payload.then_some(ComposerIntent::Send))
}

pub fn attach_control<S: 'static>(
	scope: Scope<S>,
	key: &str,
	reach: Reach,
	intent: ComposerIntent,
) -> El {
	let t = scope.t;
	RoundControl {
		key,
		label: scope.say(attachments::ATTACH),
		glyph: &icons::PLUS,
		side: CONTROL,
		glyph_side: super::GLYPH,
		paint: ghost_paint(t, t.soft_foreground),
		border: Some(faded(t.foreground, 0.12)),
		reach,
	}
	.view(scope, Some(intent))
}

pub(super) fn menu_key(key: &rune::KeyEvent) -> Option<ComposerIntent> {
	match key.key {
		Key::Up => Some(ComposerIntent::MenuTravel(-1)),
		Key::Down => Some(ComposerIntent::MenuTravel(1)),
		Key::Enter | Key::Tab => Some(ComposerIntent::MenuChoose),
		Key::Escape => Some(ComposerIntent::MenuDismiss),
		_ => None,
	}
}

fn paste_intent(content: &ClipboardContent) -> Option<ComposerIntent> {
	let is_attachable = content.image().is_some() || !content.files().is_empty();
	is_attachable.then(|| ComposerIntent::Paste(content.clone()))
}

fn field<S: 'static>(
	scope: Scope<S>,
	input: &PromptInput,
	access: impl for<'b> Fn(&'b mut S) -> &'b mut TextEdit + 'static,
) -> El {
	let t = scope.t;
	let emit = scope.emit;
	let label = input.label.unwrap_or(scope.say(composer::LABEL));
	if let Some(offline) = &input.offline {
		let notice = filled(
			scope.say(composer::OFFLINE),
			&[("space", offline.space), ("host", offline.host)],
		);
		return col().grow(1.0).shrink().min_w(0.0).child(
			text(notice)
				.font(TEXT_BUBBLE)
				.color(t.muted_foreground)
				.wrap()
				.px(FIELD_INSET_X)
				.py(FIELD_INSET_Y)
				.role("status")
				.live_region(LiveRegion::Polite),
		);
	}
	let can_send = input.can_send();
	let menu_open = input.menu_open;
	let mut editor = text_input(input.edit, TEXT_BUBBLE)
		.key(FIELD_KEY)
		.w_full()
		.px(FIELD_INSET_X)
		.color(t.foreground)
		.placeholder(
			input.placeholder.unwrap_or(scope.say(composer::PLACEHOLDER)),
			t.faint_foreground,
		)
		.caret(t.foreground, t.selection)
		.label(label)
		.no_focus_ring()
		.on_edit(access)
		.on_input_key(move |s: &mut S, key, _| {
			let Some(intent) = menu_key(key).filter(|_| menu_open) else { return false };
			emit(s, intent);
			true
		})
		.on_submit(move |s: &mut S, _| {
			if can_send {
				emit(s, ComposerIntent::Send);
			}
		});
	editor = if input.disabled {
		editor.disabled(true).focusable(false).read_only(true)
	} else {
		editor.on_input_paste(move |s: &mut S, content, _| {
			let Some(intent) = paste_intent(content) else { return false };
			emit(s, intent);
			true
		})
	};
	col().grow(1.0).shrink().min_w(0.0).py(FIELD_INSET_Y).child(auto_grow(editor, 1, MAX_ROWS))
}

pub fn prompt_input<S: 'static>(
	scope: Scope<S>,
	input: PromptInput,
	access: impl for<'b> Fn(&'b mut S) -> &'b mut TextEdit + 'static,
) -> El {
	let t = scope.t;
	let expanded = input.is_expanded();
	let (fill, border) = surface(t, &input);
	let mut pill = col()
		.key(COMPOSER_KEY)
		.w(input.width)
		.gap(GAP)
		.padding(PADDING)
		.radius(input.radius(expanded))
		.fill(fill)
		.border(BORDER, border);
	if input.offline.is_some() {
		pill = pill.role("form").label(input.label.unwrap_or(scope.say(composer::LABEL)));
	}
	let inner_reach = if input.is_blocked() { Reach::Inert } else { Reach::Live };
	if let Some(quote) = &input.quote {
		pill = pill.child(row().w_full().pb(SPACING).child(selection_quote(
			scope,
			quote,
			inner_reach,
		)));
	}
	let has_replies = !input.replies.is_empty();
	let send = send_button(scope, input.has_payload(), input.send_reach());
	let field = field(scope, &input, access);
	let leading = input.leading;
	let leading_row = (!leading.is_empty()).then(|| row().gap(GAP).center_y().children(leading));
	let attachments = input.attachments;
	if has_replies {
		let mut chips = row().w_full().flex_wrap().gap(CHIP_ROW_GAP).center_y();
		chips = chips.children(reply_chips(scope, input.replies, inner_reach));
		if let Some(files) = attachments {
			chips = chips.child(col().grow(1.0).min_w(FILES_BASIS).child(files));
		}
		pill = pill.child(chips);
	} else if let Some(files) = attachments {
		pill = pill.child(col().w_full().child(files));
	}
	let main = if expanded {
		col().w_full().gap(GAP).child(field).child(
			row()
				.w_full()
				.gap(GAP)
				.center_y()
				.children(leading_row)
				.child(rune::spacer())
				.child(send),
		)
	} else {
		row().w_full().gap(GAP).center_y().children(leading_row).child(field).child(send)
	};
	let pill = pill.child(main);
	if input.disabled { pill.opacity(DISABLED_OPACITY) } else { pill }
}
