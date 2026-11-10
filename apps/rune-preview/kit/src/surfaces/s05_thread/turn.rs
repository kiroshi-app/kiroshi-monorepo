use std::rc::Rc;

use rune::{Color, Cursor, El, Icon, SurfaceFit, TextStyle, col, el, icon, row, text};

use super::body::{Body, Surface, body};
use super::{Attachment, Author, Context, Quote, ThreadEvent, Turn, TurnState};
use crate::avatar::{Activity, Face, Motion, Person};
use crate::hues::Role;
use crate::icons;
use crate::primitives::context_menu::{MenuItem, MenuRow, context_menu};
use crate::primitives::{FOCUS_RING_WIDTH, instant, ring_tint};
use crate::strings::chat;
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_CONTROL, RADIUS_LG, RADIUS_SM, RADIUS_XL, SPACING, TEXT_11,
	TEXT_BASE_SEMIBOLD, TEXT_COMPACT_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM, Tokens, tone,
};

const BUBBLE_PADDING: f32 = SPACING * 4.5;
const AGENT_BUBBLE_WIDTH: f32 = 580.0;
const PEOPLE_BUBBLE_WIDTH: f32 = 480.0;
const AUTHOR_LINE: f32 = SPACING * 5.0;
const AVATAR: f32 = SPACING * 5.0;
const ACTION: f32 = SPACING * 6.0;
const ACTION_GLYPH: f32 = SPACING * 3.5;
const LINE_TEXT: TextStyle = TextStyle { line_height: AUTHOR_LINE, ..TEXT_XS };
const NAME_TEXT: TextStyle = TextStyle { line_height: AUTHOR_LINE, ..TEXT_COMPACT_SEMIBOLD };
const QUOTE_TEXT: TextStyle = TextStyle { line_height: SPACING * 4.0, ..TEXT_XS };
const QUOTE_NAME: TextStyle = TextStyle { weight: 600.0, ..QUOTE_TEXT };

pub fn turn<S: 'static>(cx: &Context<S>, data: &Turn) -> El {
	let t = cx.t;
	let end_side = data.author.is_end_side();
	let own = matches!(data.author, Author::You);
	let surface = if own { Surface::Own } else { Surface::Agent };
	let (fill, hover) =
		if own { (t.user_bubble, t.user_bubble_hover) } else { (t.bubble, t.bubble_hover) };
	let mut bubble = col()
		.key(format!("turn-{}", data.id))
		.max_w(if end_side { PEOPLE_BUBBLE_WIDTH } else { AGENT_BUBBLE_WIDTH })
		.min_w(SPACING * 9.0)
		.padding(BUBBLE_PADDING)
		.gap(SPACING * 2.0)
		.radius(RADIUS_BUBBLE)
		.fill(fill)
		.hover(hover)
		.hover_group();
	if !data.quotes.is_empty() {
		bubble = bubble.child(
			col()
				.w_full()
				.gap(SPACING)
				.children(data.quotes.iter().map(|quote| message_quote(cx, quote, own))),
		);
	}
	if !data.attachments.is_empty() {
		bubble = bubble.child(attachments(cx, data));
	}
	if !data.body.is_empty() {
		bubble = bubble.child(body(
			cx,
			&Body {
				turn: &data.id,
				source: &data.body,
				surface,
				streaming: data.state == TurnState::Streaming,
			},
		));
	}
	if data.shows_author {
		bubble = bubble.child(author_line(cx, data));
	}
	let bubble = instant(bubble);
	let mut lane = col().w_full().gap(SPACING * 1.5);
	lane = if end_side { lane.items_end() } else { lane.items_start() };
	if let Some(cause) = &data.cause {
		lane = lane.child(cause_line(t, cause));
	}
	lane = lane.child(bubble);
	if data.state == TurnState::Queued {
		lane = lane.child(queued(cx, &data.id));
	}
	lane
}

fn cause_line(t: &Tokens, cause: &str) -> El {
	row()
		.h(AUTHOR_LINE)
		.gap(SPACING * 1.5)
		.center_y()
		.px(BUBBLE_PADDING)
		.child(icon(&icons::FLAG, ACTION_GLYPH).color(t.muted_foreground))
		.child(text(cause.to_owned()).font(LINE_TEXT).color(t.muted_foreground).truncate())
}

pub fn author_line<S: 'static>(cx: &Context<S>, data: &Turn) -> El {
	let t = cx.t;
	let own = matches!(data.author, Author::You);
	let end_side = data.author.is_end_side();
	let (name, ink, face) = identity(cx, &data.author, data.state);
	let mut line = row().h(AUTHOR_LINE).min_w(0.0).gap(SPACING * 2.0).center_y();
	if end_side {
		line = line.self_end().justify_end();
	}
	let actions = data.shows_actions.then(|| message_actions(cx, data, own));
	if end_side && let Some(actions) = actions.clone() {
		line = line.child(actions);
	}
	line = line
		.child(el().size(AVATAR, AVATAR).center().child(face))
		.child(text(name).font(NAME_TEXT).color(ink).truncate());
	if let Author::Agent(agent) = &data.author
		&& let Some(badge) = &agent.badge
	{
		line = line.child(title_badge(t, badge));
	}
	if let Some(time) = data.time.as_ref().filter(|_| data.state != TurnState::Failed) {
		let muted = if own { t.user_bubble_muted_foreground } else { t.muted_foreground };
		line = line.child(text(time.clone()).font(LINE_TEXT).color(muted));
	}
	match data.state {
		TurnState::Stopped => {
			line = line.child(
				text(cx.say(chat::turn::footer::CANCELLED))
					.font(LINE_TEXT)
					.color(t.soft_foreground),
			);
		}
		TurnState::Failed => {
			line = line
				.child(
					text(cx.say(chat::turn::footer::FAILED))
						.font(LINE_TEXT)
						.color(t.destructive)
						.truncate(),
				)
				.child(retry(cx, &data.id, cx.say(chat::turn::RETRY)));
		}
		_ => {}
	}
	if !end_side && let Some(actions) = actions {
		line = line.child(actions);
	}
	line
}

fn identity<S>(cx: &Context<S>, author: &Author, state: TurnState) -> (String, Color, El) {
	let t = cx.t;
	let ink = match author {
		Author::You => t.user_bubble_foreground,
		Author::Person { .. } => t.soft_foreground,
		Author::Agent(agent) => agent.hue.map_or(t.primary, |hue| tone(hue, t.dark, Role::Accent)),
		Author::Deleted => t.muted_foreground,
	};
	let (name, face) = match author {
		Author::Agent(agent) if state == TurnState::Streaming => {
			let motion = Motion::Running { activity: Activity::Writing, at_ms: 0.0 };
			(
				agent.name.clone(),
				Face { name: &agent.name, hue: agent.hue, image: None, motion }.draw(AVATAR, t),
			)
		}
		_ => face_and_name(cx, author, AVATAR),
	};
	(name, ink, face)
}

pub(super) fn face_and_name<S>(cx: &Context<S>, author: &Author, size: f32) -> (String, El) {
	let t = cx.t;
	let person =
		|name: &str, image: Option<&rune::image::Image>| Person { name, image }.draw(size, t);
	match author {
		Author::You => {
			let you = cx.say(chat::turn::YOU);
			(you.to_owned(), person(you, None))
		}
		Author::Person { name, image } => (name.clone(), person(name, image.as_ref())),
		Author::Agent(agent) => {
			(agent.name.clone(), Face::still(&agent.name, agent.hue).draw(size, t))
		}
		Author::Deleted => {
			let deleted = cx.say(chat::transcript::author::DELETED);
			(deleted.to_owned(), person(deleted, None))
		}
	}
}

pub(super) fn author_name(t: &Tokens, agent: &super::Agent) -> El {
	let ink = agent.hue.map_or(t.primary, |hue| tone(hue, t.dark, Role::Accent));
	text(agent.name.clone()).font(NAME_TEXT).color(ink).truncate()
}

fn title_badge(t: &Tokens, title: &str) -> El {
	row().h(AUTHOR_LINE).px(SPACING * 1.5).radius(RADIUS_SM).fill(t.secondary).center_y().child(
		text(title.to_owned())
			.font(TextStyle { line_height: AUTHOR_LINE, ..TEXT_XS_MEDIUM })
			.color(t.secondary_foreground),
	)
}

pub(super) fn retry<S: 'static>(cx: &Context<S>, id: &str, label: &str) -> El {
	let t = cx.t;
	let emit = Rc::clone(cx.emit);
	let id = id.to_owned();
	instant(
		row()
			.h(SPACING * 5.5)
			.px(SPACING * 2.0)
			.radius(RADIUS_SM)
			.border(1.0, t.foreground.alpha(0.15))
			.center()
			.hover(t.muted)
			.role("button")
			.label(label)
			.child(
				text(cx.say(chat::turn::RETRY))
					.font(TextStyle { line_height: AUTHOR_LINE, ..TEXT_XS_MEDIUM })
					.color(t.foreground),
			),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::Retry(id.clone())))
}

fn queued<S: 'static>(cx: &Context<S>, id: &str) -> El {
	let t = cx.t;
	row()
		.h(SPACING * 7.0)
		.self_end()
		.gap(SPACING * 2.0)
		.pl(SPACING * 2.5)
		.pr(SPACING)
		.radius(RADIUS_LG)
		.fill(t.primary.alpha(0.35))
		.center_y()
		.child(text(cx.say(chat::turn::footer::QUEUED)).font(LINE_TEXT).color(t.foreground))
		.child(divider(t.foreground))
		.child(action(
			cx,
			&icons::CLOSE,
			cx.say(chat::turn::CANCEL),
			false,
			ThreadEvent::CancelQueued(id.to_owned()),
		))
}

fn divider(ink: Color) -> El {
	el().w(1.0).h(SPACING * 3.0).fill(ink.alpha(0.12)).a11y_hidden()
}

pub fn message_actions<S: 'static>(cx: &Context<S>, data: &Turn, own: bool) -> El {
	let id = || data.id.clone();
	let (pin_glyph, pin_label, pin_event) = if data.pinned {
		(&icons::PIN_OFF, chat::turn::UNPIN, ThreadEvent::Unpin(id()))
	} else {
		(&icons::PIN, chat::turn::PIN, ThreadEvent::Pin(id()))
	};
	let mut buttons = vec![
		(pin_glyph, pin_label, pin_event),
		(&icons::REPLY, chat::turn::REPLY, ThreadEvent::Reply(id())),
		(&icons::COPY, chat::turn::COPY, ThreadEvent::Copy(id())),
	];
	let end_side = data.author.is_end_side();
	if end_side {
		buttons.reverse();
	}
	let ink = if own { cx.t.user_bubble_foreground } else { cx.t.foreground };
	let buttons = row().gap(SPACING * 0.5).children(
		buttons
			.into_iter()
			.map(|(glyph, label, event)| action(cx, glyph, cx.say(label), own, event)),
	);
	let line = row().gap(SPACING * 2.0).center_y();
	if end_side {
		line.child(buttons).child(divider(ink))
	} else {
		line.child(divider(ink)).child(buttons)
	}
}

pub fn message_menu<S>(cx: &Context<S>, data: &Turn) -> El {
	let item = |key, glyph| MenuRow::Item(MenuItem::new(cx.say(key)).glyph(glyph));
	let pin = if data.pinned {
		item(chat::turn::UNPIN, &icons::PIN_OFF)
	} else {
		item(chat::turn::PIN, &icons::PIN)
	};
	context_menu(
		cx.t,
		cx.say(chat::transcript::message::ACTIONS),
		[
			item(chat::turn::REPLY, &icons::REPLY),
			item(chat::turn::COPY, &icons::COPY),
			pin,
			MenuRow::Separator,
			item(chat::turn::SAVE_AS_DOCUMENT, &icons::FILE),
		],
	)
}

fn action<S: 'static>(
	cx: &Context<S>,
	glyph: &'static Icon,
	label: &'static str,
	own: bool,
	event: ThreadEvent,
) -> El {
	let t = cx.t;
	let emit = Rc::clone(cx.emit);
	let (rest, hover, fill) = if own {
		(
			t.user_bubble_muted_foreground,
			t.user_bubble_foreground,
			t.user_bubble_foreground.alpha(0.12),
		)
	} else {
		(t.muted_foreground, t.foreground, t.muted)
	};
	instant(
		el().size(ACTION, ACTION)
			.radius(RADIUS_SM)
			.center()
			.hover(fill)
			.hover_group()
			.role("button")
			.label(label)
			.child(icon(glyph, ACTION_GLYPH).color(rest).group_color(hover)),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, event.clone()))
}

pub fn message_quote<S: 'static>(cx: &Context<S>, quote: &Quote, own: bool) -> El {
	let t = cx.t;
	let ink = if own { t.user_bubble_foreground } else { t.foreground };
	let emit = Rc::clone(cx.emit);
	let id = quote.id.clone();
	instant(
		row()
			.w_full()
			.min_w(0.0)
			.gap(SPACING * 2.0)
			.padding(SPACING * 2.0)
			.radius(RADIUS_LG)
			.fill(ink.alpha(0.08))
			.hover(ink.alpha(0.12))
			.center_y()
			.role("button")
			.label(&quote.author)
			.child(icon(&icons::REPLY, ACTION_GLYPH).color(ink.alpha(0.7)))
			.child(
				col()
					.grow(1.0)
					.min_w(0.0)
					.child(text(quote.author.clone()).font(QUOTE_NAME).color(ink).truncate())
					.child(text(quote.excerpt.clone()).font(QUOTE_TEXT).color(ink).truncate()),
			),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 0.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::OpenQuote(id.clone())))
}

const GALLERY_HEIGHT: f32 = 300.0;
const GALLERY_GAP: f32 = SPACING * 1.5;
const GALLERY_TILES: usize = 5;
const LEAD_SHARE: f32 = 1.4;
const CHIP_WIDTH: f32 = SPACING * 56.0;
const CHIP_MARK: f32 = SPACING * 8.0;

fn attachments<S: 'static>(cx: &Context<S>, data: &Turn) -> El {
	let images: Vec<(usize, &Attachment)> = data
		.attachments
		.iter()
		.enumerate()
		.filter(|(_, item)| item.preview.is_some() || item.failed)
		.collect();
	let files = data
		.attachments
		.iter()
		.enumerate()
		.filter(|(_, item)| item.preview.is_none() && !item.failed);
	let mut flow = row().w_full().flex_wrap().gap(GALLERY_GAP);
	if !images.is_empty() {
		flow = flow.child(gallery(cx, &data.id, &images));
	}
	flow.children(files.map(|(index, item)| file_chip(cx, &data.id, index, item)))
}

fn gallery<S: 'static>(cx: &Context<S>, turn: &str, images: &[(usize, &Attachment)]) -> El {
	let r = RADIUS_CONTROL;
	let shown = &images[..images.len().min(GALLERY_TILES)];
	let hidden = images.len() - shown.len();
	let tile = |at: usize, corners: [f32; 4]| {
		let (index, item) = shown[at];
		let more = if at == GALLERY_TILES - 1 { hidden } else { 0 };
		image_tile(cx, turn, index, item, more).corners(corners).clip_corners(corners)
	};
	let lead_corners = if shown.len() == 1 { [r, r, r, r] } else { [r, 0.0, 0.0, r] };
	let lead = tile(0, lead_corners).grow(LEAD_SHARE).h_full();
	let rest = match shown.len() {
		1 => None,
		2 => Some(col().grow(1.0).h_full().child(tile(1, [0.0, r, r, 0.0]).grow(1.0))),
		3 => Some(
			col()
				.grow(1.0)
				.h_full()
				.gap(GALLERY_GAP)
				.child(tile(1, [0.0, r, 0.0, 0.0]).grow(1.0))
				.child(tile(2, [0.0, 0.0, r, 0.0]).grow(1.0)),
		),
		4 => Some(
			col()
				.grow(1.0)
				.h_full()
				.gap(GALLERY_GAP)
				.child(tile(1, [0.0, r, 0.0, 0.0]).grow(1.0))
				.child(
					row()
						.grow(1.0)
						.gap(GALLERY_GAP)
						.child(tile(2, [0.0; 4]).grow(1.0))
						.child(tile(3, [0.0, 0.0, r, 0.0]).grow(1.0)),
				),
		),
		_ => Some(
			col()
				.grow(1.0)
				.h_full()
				.gap(GALLERY_GAP)
				.child(
					row()
						.grow(1.0)
						.gap(GALLERY_GAP)
						.child(tile(1, [0.0; 4]).grow(1.0))
						.child(tile(2, [0.0, r, 0.0, 0.0]).grow(1.0)),
				)
				.child(
					row()
						.grow(1.0)
						.gap(GALLERY_GAP)
						.child(tile(3, [0.0; 4]).grow(1.0))
						.child(tile(4, [0.0, 0.0, r, 0.0]).grow(1.0)),
				),
		),
	};
	let mut strip = row().w_full().h(GALLERY_HEIGHT).gap(GALLERY_GAP).child(lead);
	if let Some(rest) = rest {
		strip = strip.child(rest);
	}
	strip
}

fn image_tile<S: 'static>(
	cx: &Context<S>,
	turn: &str,
	index: usize,
	item: &Attachment,
	more: usize,
) -> El {
	let t = cx.t;
	let emit = Rc::clone(cx.emit);
	let turn = turn.to_owned();
	let mut tile = el().min_w(0.0).label(&item.name).role("button");
	tile = match (&item.preview, item.failed) {
		(Some(image), false) => {
			tile.pixels_fit(image.pixels(), SurfaceFit::Fill).border(1.0, t.image_outline)
		}
		_ => tile
			.fill(t.foreground.alpha(0.1))
			.center()
			.child(icon(&icons::IMAGE_OFF, SPACING * 5.0).color(t.muted_foreground)),
	};
	if more > 0 {
		tile = tile.child(
			el().w_full()
				.h_full()
				.fill(Color::BLACK.alpha(0.55))
				.center()
				.child(text(format!("+{more}")).font(TEXT_BASE_SEMIBOLD).color(Color::WHITE)),
		);
	}
	tile.focusable(true)
		.cursor(Cursor::Pointer)
		.focus_ring(FOCUS_RING_WIDTH, 2.0, ring_tint(t, 0.3))
		.on_press(move |s: &mut S| {
			emit(s, ThreadEvent::OpenAttachment { turn: turn.clone(), index })
		})
}

fn file_chip<S: 'static>(cx: &Context<S>, turn: &str, index: usize, item: &Attachment) -> El {
	let t = cx.t;
	let emit = Rc::clone(cx.emit);
	let turn = turn.to_owned();
	let extension =
		item.name.rsplit_once('.').map_or("", |(_, extension)| extension).to_uppercase();
	instant(
		row()
			.max_w(CHIP_WIDTH)
			.gap(SPACING * 2.0)
			.padding(SPACING)
			.pr(SPACING * 2.0)
			.radius(RADIUS_XL)
			.border(1.0, t.foreground.alpha(0.15))
			.fill(t.foreground.alpha(0.05))
			.hover(t.foreground.alpha(0.1))
			.center_y()
			.role("button")
			.label(&item.name)
			.child(
				el().size(CHIP_MARK, CHIP_MARK)
					.radius(RADIUS_LG)
					.fill(t.foreground.alpha(0.1))
					.center()
					.child(icon(&icons::FILE, SPACING * 4.0).color(t.foreground)),
			)
			.child(
				col()
					.min_w(0.0)
					.child(
						text(item.name.clone()).font(TEXT_XS_MEDIUM).color(t.foreground).truncate(),
					)
					.child(text(extension).font(TEXT_11).color(t.foreground)),
			),
	)
	.focusable(true)
	.cursor(Cursor::Pointer)
	.focus_ring(FOCUS_RING_WIDTH, 2.0, ring_tint(t, 0.3))
	.on_press(move |s: &mut S| emit(s, ThreadEvent::OpenAttachment { turn: turn.clone(), index }))
}
