use rune::image::Image;
use rune::{Cursor, El, TextStyle, col, icon, row, text};

use super::{ComposerIntent, Reach, RoundControl, Scope, filled};
use crate::avatar::Person;
use crate::icons;
use crate::primitives::{FOCUS_RING_WIDTH, Paint, instant, ring_tint};
use crate::strings::chat::queue;
use crate::tokens::{
	RADIUS_LG, SPACING, TEXT_COMPACT, TEXT_COMPACT_MEDIUM, TEXT_SM, TEXT_XS_MEDIUM, Tokens, faded,
};

const INSET: f32 = SPACING * 5.0;
const RADIUS: f32 = 14.0;
const HEADER: f32 = SPACING * 8.0;
const ROW: f32 = SPACING * 10.0;
const AVATAR: f32 = SPACING * 6.0;
const ACTION: f32 = SPACING * 7.0;
const ACTION_GLYPH: f32 = SPACING * 3.5;
const ACTIONS_END: f32 = SPACING * 1.5;
const LINE: f32 = 16.0;

#[derive(Clone, Copy)]
pub struct QueuedMessage<'a> {
	pub id: &'a str,
	pub text: &'a str,
}

pub struct PromptQueue<'a> {
	pub items: &'a [QueuedMessage<'a>],
	pub agent: &'a str,
	pub reader: &'a str,
	pub reader_picture: Option<&'a Image>,
	pub width: f32,
}

fn hovered_row(t: &Tokens) -> rune::Color {
	if t.dark { faded(t.foreground, 0.04) } else { t.prompt_surface }
}

fn send_now<S: 'static>(scope: Scope<S>, id: &str) -> El {
	let t = scope.t;
	let label = scope.say(queue::SEND_NOW);
	let compact = TextStyle { line_height: LINE, ..TEXT_COMPACT };
	instant(
		scope
			.on_press(
				row()
					.key(format!("queue-send-now-{id}"))
					.h(ACTION)
					.gap(SPACING * 1.5)
					.px(SPACING * 2.5)
					.radius(ACTION / 2.0)
					.fill(faded(t.foreground, 0.08))
					.hover(t.muted)
					.center_y()
					.role("button")
					.label(label)
					.child(icon(&icons::ARROW_UP, ACTION_GLYPH).color(t.foreground))
					.child(text(label).font(compact).color(t.foreground)),
				ComposerIntent::SendQueuedNow(id.to_owned()),
			)
			.hover_alone()
			.focusable(true)
			.cursor(Cursor::Pointer)
			.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3)),
	)
}

fn queued_row<S: 'static>(
	scope: Scope<S>,
	queue_view: &PromptQueue,
	item: &QueuedMessage,
	is_next: bool,
) -> El {
	let t = scope.t;
	let name = [("name", queue_view.agent)];
	let remove = RoundControl {
		key: &format!("queue-remove-{}", item.id),
		label: scope.say(queue::REMOVE),
		glyph: &icons::CLOSE,
		side: ACTION,
		glyph_side: ACTION_GLYPH,
		paint: Paint {
			hover_fill: t.muted,
			..Paint::plain(t.background.alpha(0.0), t.faint_foreground)
		},
		border: None,
		reach: Reach::Live,
	}
	.view(scope, Some(ComposerIntent::RemoveQueued(item.id.to_owned())))
	.hover_alone();
	let actions = row()
		.gap(SPACING)
		.center_y()
		.pin(None, Some((ROW - ACTION) / 2.0), Some(ACTIONS_END), None)
		.group_opacity(0.0, 1.0)
		.child(send_now(scope, item.id))
		.child(remove);
	let mut line = row()
		.key(format!("queue-item-{}", item.id))
		.w_full()
		.h(ROW)
		.gap(SPACING * 2.5)
		.px(SPACING * 2.0)
		.center_y()
		.radius(RADIUS_LG)
		.hover(hovered_row(t))
		.role("listitem")
		.child(Person { name: queue_view.reader, image: queue_view.reader_picture }.draw(AVATAR, t))
		.child(
			text(scope.say(queue::YOU))
				.font(TextStyle { line_height: LINE, ..TEXT_COMPACT_MEDIUM })
				.color(t.muted_foreground),
		)
		.child(
			text(item.text.to_owned()).font(TEXT_SM).color(t.muted_foreground).truncate().grow(1.0),
		);
	if is_next {
		line = line.child(
			text(filled(scope.say(queue::NEXT), &name))
				.font(TEXT_XS_MEDIUM)
				.color(t.primary)
				.group_opacity(1.0, 0.0),
		);
	}
	instant(line.child(actions).hover_group())
}

pub fn prompt_queue<S: 'static>(scope: Scope<S>, queue_view: &PromptQueue) -> Option<El> {
	let t = scope.t;
	if queue_view.items.is_empty() {
		return None;
	}
	let count = queue_view.items.len();
	let title = filled(
		scope.plural(queue::TITLE_ONE, queue::TITLE_OTHER, count),
		&[("count", &count.to_string()), ("name", queue_view.agent)],
	);
	let tray =
		col()
			.w_full()
			.padding(SPACING * 1.5)
			.corners([RADIUS - 1.0, RADIUS - 1.0, 0.0, 0.0])
			.fill(t.prompt_surface_inert)
			.child(row().h(HEADER).px(SPACING * 2.0).center_y().child(
				text(title.clone()).font(TEXT_XS_MEDIUM).color(t.faint_foreground).truncate(),
			))
			.child(
				col().w_full().role("list").children(
					queue_view
						.items
						.iter()
						.enumerate()
						.map(|(at, item)| queued_row(scope, queue_view, item, at == 0)),
				),
			);
	Some(
		col()
			.key("prompt-queue")
			.w(queue_view.width - 2.0 * INSET)
			.mx(INSET)
			.pt(1.0)
			.px(1.0)
			.corners([RADIUS, RADIUS, 0.0, 0.0])
			.fill(faded(t.foreground, 0.08))
			.role("region")
			.label(title)
			.child(tray),
	)
}
