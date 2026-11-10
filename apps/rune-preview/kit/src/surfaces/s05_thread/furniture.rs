use std::rc::Rc;

use rune::{Cursor, El, Icon, ScrollSpec, col, el, icon, row, text};

use super::{Context, Emit, ThreadEvent, fill};
use crate::icons;
use crate::primitives::skeleton::skeleton;
use crate::primitives::{
	FOCUS_RING_WIDTH, OVERLAY_SHADOW_BLUR, OVERLAY_SHADOW_Y, instant, ring_tint,
};
use crate::strings::chat;
use crate::tokens::{
	RADIUS_2XL, RADIUS_BUBBLE, RADIUS_CONTROL, RADIUS_MD, RADIUS_SM, SPACING, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XS, TEXT_XS_MEDIUM, Tokens,
};

#[derive(Clone, Copy)]
enum SkeletonAuthor {
	Agent,
	You,
	Person,
}

struct SkeletonTurn {
	author: SkeletonAuthor,
	lines: u8,
	width: f32,
	author_line: bool,
}

const fn turn(author: SkeletonAuthor, lines: u8, width: f32, author_line: bool) -> SkeletonTurn {
	SkeletonTurn { author, lines, width, author_line }
}

const CYCLE_FROM_THE_COMPOSER: [SkeletonTurn; 6] = [
	turn(SkeletonAuthor::Agent, 1, 400.0, true),
	turn(SkeletonAuthor::Agent, 2, 560.0, false),
	turn(SkeletonAuthor::Agent, 1, 480.0, true),
	turn(SkeletonAuthor::You, 1, 236.0, true),
	turn(SkeletonAuthor::Person, 2, 420.0, true),
	turn(SkeletonAuthor::You, 2, 360.0, true),
];

const SKELETON_ROWS: usize = 18;
const SKELETON_LINE: f32 = SPACING * 6.0;
const BAR: f32 = SPACING * 3.0;
const FAINT_BAR: f32 = SPACING * 2.25;
const AUTHOR_SLOT: f32 = SPACING * 5.0;

pub fn transcript_skeleton(t: &Tokens) -> El {
	let rows = (0..SKELETON_ROWS).map(|index| {
		skeleton_turn(t, &CYCLE_FROM_THE_COMPOSER[index % CYCLE_FROM_THE_COMPOSER.len()])
	});
	let bottom_up: Vec<El> = rows.collect::<Vec<_>>().into_iter().rev().collect();
	col()
		.w_full()
		.h_full()
		.min_h(0.0)
		.clip_rounded(0.0)
		.justify_end()
		.gap(SPACING * 3.0)
		.pt(SPACING * 8.0)
		.pb(SPACING * 4.0)
		.a11y_hidden()
		.children(bottom_up)
}

fn bar(t: &Tokens, width: f32) -> El {
	skeleton(t).size(width, BAR).radius(BAR / 2.0).fill(t.border)
}

fn faint_bar(t: &Tokens, width: f32) -> El {
	skeleton(t)
		.size(width, FAINT_BAR)
		.radius(FAINT_BAR / 2.0)
		.fill(t.border.alpha(t.border.a * 0.6))
}

fn skeleton_turn(t: &Tokens, shown: &SkeletonTurn) -> El {
	let mut bubble = col()
		.w(shown.width)
		.shrink()
		.gap(SPACING * 2.0)
		.padding(SPACING * 4.5)
		.radius(RADIUS_BUBBLE)
		.fill(t.border.alpha(t.border.a * 0.6))
		.child(el().h(SKELETON_LINE * f32::from(shown.lines)));
	if shown.author_line {
		bubble = bubble.child(skeleton_author_line(t, shown.author));
	}
	let lane = row().w_full().shrink();
	match shown.author {
		SkeletonAuthor::Agent => lane.child(bubble),
		_ => lane.justify_end().child(bubble),
	}
}

fn skeleton_author_line(t: &Tokens, author: SkeletonAuthor) -> El {
	let line = row().h(AUTHOR_SLOT).gap(SPACING * 2.0).center_y();
	match author {
		SkeletonAuthor::Agent => line
			.child(skeleton(t).size(AUTHOR_SLOT, AUTHOR_SLOT).radius(RADIUS_SM).fill(t.border))
			.child(bar(t, SPACING * 8.0))
			.child(
				skeleton(t)
					.size(SPACING * 13.5, AUTHOR_SLOT)
					.radius(RADIUS_SM)
					.fill(t.border.alpha(t.border.a * 0.6)),
			)
			.child(faint_bar(t, SPACING * 6.5)),
		SkeletonAuthor::You | SkeletonAuthor::Person => {
			let name =
				if matches!(author, SkeletonAuthor::You) { SPACING * 5.5 } else { SPACING * 7.0 };
			line.self_end()
				.child(bar(t, AUTHOR_SLOT).h(AUTHOR_SLOT).radius(AUTHOR_SLOT / 2.0))
				.child(bar(t, name))
				.child(faint_bar(t, SPACING * 6.5))
		}
	}
}

#[derive(Clone)]
pub struct PinnedMessage {
	pub id: String,
	pub author: super::Author,
	pub time: String,
	pub excerpt: String,
}

const PANEL_WIDTH: f32 = SPACING * 80.0;
const PANEL_PADDING: f32 = SPACING * 4.0;
const PANEL_LIST: f32 = SPACING * 80.0;
const PINNED_AVATAR: f32 = SPACING * 6.0;
const EXCERPT_LINES: usize = 3;

pub fn pinned_messages<S: 'static>(cx: &Context<S>, pinned: &[PinnedMessage], open: bool) -> El {
	let t = cx.t;
	let count = pinned.len();
	let title = cx.say(chat::pinned::TITLE);
	let label = if count == 0 {
		title.to_owned()
	} else {
		let key = if count == 1 { chat::pinned::COUNTED_ONE } else { chat::pinned::COUNTED_OTHER };
		fill(cx.say(key), &[("count", &count.to_string())])
	};
	let mut trigger = row()
		.h(SPACING * 7.0)
		.min_w(SPACING * 7.0)
		.gap(SPACING)
		.px(if count == 0 { 0.0 } else { SPACING * 2.0 })
		.radius(RADIUS_2XL)
		.center()
		.hover(t.muted)
		.role("button")
		.label(&label)
		.expanded(open)
		.child(icon(&icons::PIN, SPACING * 4.0).color(t.foreground));
	if count > 0 {
		trigger = trigger.child(text(count.to_string()).font(TEXT_XS_MEDIUM).color(t.foreground));
	}
	if open {
		trigger = trigger.fill(t.muted);
	}
	let trigger = instant(trigger).focusable(true).cursor(Cursor::Pointer).focus_ring(
		FOCUS_RING_WIDTH,
		0.0,
		ring_tint(t, 0.3),
	);
	let mut stack = col().items_end().gap(SPACING).child(trigger);
	if open {
		stack = stack.child(panel(cx, pinned, title));
	}
	stack
}

fn panel<S: 'static>(cx: &Context<S>, pinned: &[PinnedMessage], title: &str) -> El {
	let t = cx.t;
	let heading = row()
		.w_full()
		.padding(PANEL_PADDING)
		.child(text(title.to_owned()).font(TEXT_SM_MEDIUM).color(t.popover_foreground));
	let body = if pinned.is_empty() {
		row()
			.w_full()
			.padding(PANEL_PADDING)
			.child(text(cx.say(chat::pinned::EMPTY)).font(TEXT_SM).color(t.muted_foreground).wrap())
	} else {
		let mut list = col().w_full().max_h(PANEL_LIST).scroll(ScrollSpec { stick_bottom: false });
		for (index, message) in pinned.iter().enumerate() {
			if index > 0 {
				list = list.child(rule(t));
			}
			list = list.child(pinned_row(cx, message));
		}
		list
	};
	col()
		.w(PANEL_WIDTH)
		.radius(RADIUS_2XL)
		.clip_rounded(RADIUS_2XL)
		.fill(t.popover)
		.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow)
		.border(1.0, t.border)
		.label(title)
		.child(heading)
		.child(rule(t))
		.child(body)
}

fn rule(t: &Tokens) -> El {
	el().w_full().h(1.0).fill(t.border).a11y_hidden()
}

fn pinned_row<S: 'static>(cx: &Context<S>, message: &PinnedMessage) -> El {
	let t = cx.t;
	let (author, face) = super::turn::face_and_name(cx, &message.author, PINNED_AVATAR);
	let emit = Rc::clone(cx.emit);
	let jump = message.id.clone();
	let jump_label = fill(cx.say(chat::pinned::JUMP_TO), &[("author", &author)]);
	let unpin_label = fill(cx.say(chat::pinned::UNPIN), &[("author", &author)]);
	let jump_button = instant(
		row()
			.h(SPACING * 6.0)
			.px(SPACING * 2.0)
			.radius(RADIUS_2XL)
			.center()
			.hover(t.muted)
			.role("button")
			.label(&jump_label)
			.child(text(cx.say(chat::pinned::JUMP)).font(TEXT_XS_MEDIUM).color(t.foreground)),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::JumpToPinned(jump.clone())));
	let emit = Rc::clone(cx.emit);
	let unpin = message.id.clone();
	let unpin_button = instant(
		el().size(SPACING * 6.0, SPACING * 6.0)
			.radius(RADIUS_2XL)
			.center()
			.hover(t.muted)
			.role("button")
			.label(&unpin_label)
			.child(icon(&icons::PIN_OFF, SPACING * 3.0).color(t.foreground)),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::Unpin(unpin.clone())));
	let header = row()
		.w_full()
		.min_w(0.0)
		.gap(SPACING * 2.0)
		.center_y()
		.child(text(author).font(TEXT_SM_MEDIUM).color(t.popover_foreground).truncate())
		.child(text(message.time.clone()).font(TEXT_XS).color(t.muted_foreground))
		.child(el().grow(1.0))
		.child(row().gap(SPACING * 0.5).mr(-SPACING * 1.5).child(jump_button).child(unpin_button));
	instant(
		row()
			.w_full()
			.gap(SPACING * 2.5)
			.padding(PANEL_PADDING)
			.hover(t.muted.alpha(t.muted.a * 0.4))
			.items_start()
			.child(face.a11y_hidden())
			.child(
				col().grow(1.0).min_w(0.0).gap(SPACING).child(header).child(
					text(message.excerpt.clone())
						.font(TEXT_SM)
						.color(t.muted_foreground)
						.wrap()
						.max_lines(EXCERPT_LINES),
				),
			),
	)
}

pub struct SelectionToolbar<E> {
	pub label: &'static str,
	pub items: Vec<Option<ToolbarAction<E>>>,
}

pub struct ToolbarAction<E> {
	pub glyph: &'static Icon,
	pub label: &'static str,
	pub on: bool,
	pub event: E,
}

const TOOL: f32 = SPACING * 7.0;
const TOOL_GLYPH: f32 = SPACING * 4.0;
const SEPARATOR: f32 = SPACING * 4.0;

pub fn selection_toolbar<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	bar: &SelectionToolbar<E>,
	emit: &Emit<S, E>,
) -> El {
	row()
		.gap(SPACING * 0.5)
		.padding(SPACING)
		.radius(RADIUS_CONTROL)
		.border(1.0, t.selection_toolbar_border)
		.fill(t.card_raised)
		.shadow(OVERLAY_SHADOW_Y, OVERLAY_SHADOW_BLUR, t.popover_shadow)
		.center_y()
		.role("toolbar")
		.label(bar.label)
		.children(bar.items.iter().map(|item| match item {
			None => {
				el().w(1.0).h(SEPARATOR).mx(SPACING).fill(t.selection_toolbar_border).a11y_hidden()
			}
			Some(action) => tool(t, action, emit),
		}))
}

fn tool<S: 'static, E: Clone + 'static>(
	t: &Tokens,
	action: &ToolbarAction<E>,
	emit: &Emit<S, E>,
) -> El {
	let emit = Rc::clone(emit);
	let event = action.event.clone();
	let (fill, ink, hover) = if action.on {
		let pressed = t.user_bubble.alpha(t.user_bubble.a * 0.15);
		(pressed, t.user_bubble, pressed)
	} else {
		(t.card_raised.alpha(0.0), t.foreground, t.selection_toolbar_highlight)
	};
	instant(
		el().size(TOOL, TOOL)
			.radius(RADIUS_MD)
			.fill(fill)
			.hover(hover)
			.center()
			.role("button")
			.label(action.label)
			.checked(action.on)
			.child(icon(action.glyph, TOOL_GLYPH).color(ink)),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, event.clone()))
}
