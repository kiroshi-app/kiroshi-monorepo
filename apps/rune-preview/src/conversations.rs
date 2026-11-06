use std::borrow::Cow;

use rune::{Chrome, El, GrowthSpec, Key, KeyEvent, ScrollSpec, SurfaceFit, Tx, col, el, row, text};
use rune_kit::markdown::{Markdown, MarkdownStyle};
use rune_kit::shell::{Sidebar, SidebarRow, SidebarSection, SplitView, Toolbar};
use rune_kit::{Button, ButtonVariant, ControlSize, Kit, PopupItem, PopupList, Spinner, TextArea};

use crate::app::{AGENT_PILL, App, Opened, Workspace};
use crate::content::{self, Segment};
use crate::host::{HostError, START_COMMAND};
use crate::images::Slot;
use crate::model::Role;
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_CONTROL, RADIUS_LG, SPACING, TEXT_COMPACT, TEXT_READING, TEXT_SM,
	TEXT_SM_MEDIUM, TEXT_XL_SEMIBOLD, Tokens,
};
use crate::widgets::{avatar, not_drawn};

pub const CHROME: Chrome =
	Chrome { full_size_content: true, traffic_lights: Some((16.0, 25.0)), drag_regions: true };

const THREAD_WIDTH: f32 = 720.0;

const IMAGE_MAX_WIDTH: f32 = 420.0;

const COMPOSER: &str = "composer";

pub fn view(s: &App, k: &Kit, t: &Tokens, inset: f32, layer: &mut Vec<El>) -> El {
	match &s.workspace {
		Workspace::Connecting => centred(
			t,
			col()
				.items_center()
				.gap(SPACING * 3.0)
				.child(Spinner::new().build(k))
				.child(text("Reaching Kiroshi Dev…").font(TEXT_SM).color(t.muted_foreground)),
		),
		Workspace::Failed(failure) => host_failed(k, t, failure),
		Workspace::Ready(_) => tab(s, k, t, inset, layer),
	}
}

fn centred(t: &Tokens, content: El) -> El {
	col().w_full().h_full().fill(t.background).center().child(content)
}

fn host_failed(k: &Kit, t: &Tokens, failure: &HostError) -> El {
	let mono = rune::TextStyle { family: rune::Family::SystemMono, ..TEXT_SM };
	let command = el()
		.padding(SPACING * 3.0)
		.radius(RADIUS_LG)
		.fill(t.muted)
		.border(1.0, t.border)
		.child(text(START_COMMAND).font(mono).color(t.foreground).selectable(true));
	let content = col()
		.w(520.0)
		.gap(SPACING * 4.0)
		.child(text(failure.title()).font(TEXT_XL_SEMIBOLD).color(t.foreground))
		.child(text(failure.detail()).font(TEXT_READING).color(t.muted_foreground).wrap())
		.child(
			text("Start the dev host from the repo root, then try again:")
				.font(TEXT_SM)
				.color(t.foreground),
		)
		.child(command)
		.child(
			row().child(
				Button::new("Try again")
					.variant(ButtonVariant::Contrast)
					.control_size(ControlSize::Large)
					.on_press(|s: &mut App| s.connect())
					.build(k),
			),
		);
	centred(t, content)
}

fn tab(s: &App, k: &Kit, t: &Tokens, inset: f32, layer: &mut Vec<El>) -> El {
	let title = s.thread.as_ref().map_or("", |thread| thread.title.as_str());
	let main = col()
		.key("conversation")
		.w_full()
		.h_full()
		.min_h(0.0)
		.child(thread_view(s, k, t))
		.child(composer(s, k, t, layer));
	SplitView::new(main)
		.sidebar(&s.sidebar, |s: &mut App| &mut s.sidebar, sidebar(s, k))
		.toolbar(Toolbar::new().title(title))
		.titlebar_inset(inset)
		.frame_inset(8.0)
		.toolbar_in_panel()
		.sidebar_padding(18.0, 10.0)
		.build(k)
}

fn sidebar(s: &App, k: &Kit) -> El {
	let Some(ready) = s.ready() else { return el() };
	let opened = s.thread.as_ref().map(|thread| &thread.opened);
	let agents = ready.agents.iter().map(|agent| {
		let id = agent.id.clone();
		SidebarRow::new(&agent.name)
			.avatar(avatar(&agent.name, agent.avatar_blot, 24.0))
			.subtitle(&agent.title)
			.height(44.0)
			.selected(opened == Some(&Opened::Agent(agent.id.clone())))
			.on_select(move |s: &mut App, _: &mut Tx| s.open(Opened::Agent(id.clone())))
			.build(k)
			.key(format!("agent-{}", agent.id))
	});
	let conversations = ready.conversations.iter().map(|conversation| {
		let id = conversation.id.clone();
		let names: Vec<&str> = conversation.present().map(|seat| seat.name.as_str()).collect();
		SidebarRow::new(&conversation.title)
			.subtitle(names.join(", "))
			.height(44.0)
			.selected(opened == Some(&Opened::Conversation(conversation.id.clone())))
			.on_select(move |s: &mut App, _: &mut Tx| s.open(Opened::Conversation(id.clone())))
			.build(k)
			.key(format!("conversation-{}", conversation.id))
	});
	Sidebar::new()
		.label(&ready.space.name)
		.section(SidebarSection::new("Agents").key("agents").count(ready.agents.len()).rows(agents))
		.section(
			SidebarSection::new("Conversations")
				.key("conversations")
				.count(ready.conversations.len())
				.rows(conversations),
		)
		.build(k)
}

fn thread_view(s: &App, k: &Kit, t: &Tokens) -> El {
	let Some(thread) = s.thread.as_ref() else {
		return col().w_full().grow(1.0).min_h(0.0).center().child(
			text("Pick an agent or a conversation.").font(TEXT_SM).color(t.muted_foreground),
		);
	};
	if let Some(failure) = &thread.failure {
		return col().w_full().grow(1.0).min_h(0.0).center().padding(SPACING * 6.0).child(
			not_drawn(
				t,
				&format!("Couldn't read this conversation. {}", failure.title()),
				&failure.detail(),
			),
		);
	}
	if thread.is_loading() {
		return col().w_full().grow(1.0).min_h(0.0).center().child(Spinner::new().build(k));
	}
	let kit = k.clone();
	let tokens = *t;
	let rows = col().key("thread-rows").w_full().growth(GrowthSpec::default()).virtual_rows(
		thread.row_count(),
		120.0,
		row_key,
		move |s: &App, i| message_row(s, i, &kit, &tokens),
	);
	col()
		.key(format!("thread-{}", thread.conversation_id.as_deref().unwrap_or("pending")))
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.scroll(ScrollSpec { stick_bottom: true })
		.scroll_edge_fade(16.0)
		.child(rows)
}

fn row_key(s: &App, i: usize) -> Cow<'_, str> {
	let Some(thread) = s.thread.as_ref() else { return Cow::Borrowed("missing") };
	match thread.messages.get(i) {
		Some(message) => Cow::Borrowed(message.id.as_str()),
		None => thread
			.live
			.get(i - thread.messages.len())
			.map_or(Cow::Borrowed("missing"), |live| Cow::Owned(format!("live-{}", live.id))),
	}
}

struct Shown<'a> {
	role: Role,
	author: Option<String>,
	bot_id: Option<&'a str>,
	content: &'a str,
	streaming: bool,
}

fn shown(s: &App, i: usize) -> Option<Shown<'_>> {
	let thread = s.thread.as_ref()?;
	if let Some(message) = thread.messages.get(i) {
		let bot_id = message.author_bot_id.as_deref();
		let author = bot_id.and_then(|id| s.agent_name(id)).or_else(|| message.author_name.clone());
		return Some(Shown {
			role: message.role,
			author,
			bot_id,
			content: &message.content,
			streaming: false,
		});
	}
	let live = thread.live.get(i - thread.messages.len())?;
	Some(Shown {
		role: Role::Assistant,
		author: s.agent_name(&live.bot_id),
		bot_id: Some(&live.bot_id),
		content: &live.text,
		streaming: true,
	})
}

fn message_row(s: &App, i: usize, k: &Kit, t: &Tokens) -> El {
	let Some(message) = shown(s, i) else { return el() };
	let named = s.mention_names(message.content);
	let frame = row().w_full().justify_center().px(SPACING * 6.0).py(SPACING * 2.5);
	if message.role == Role::User {
		let bubble = col()
			.max_w(THREAD_WIDTH * 0.75)
			.px(SPACING * 4.0)
			.py(SPACING * 2.5)
			.radius(RADIUS_BUBBLE)
			.fill(t.user_bubble)
			.child(
				text(named)
					.font(TEXT_READING)
					.color(t.user_bubble_foreground)
					.wrap()
					.selectable(true),
			);
		return frame.child(row().w(THREAD_WIDTH).shrink().justify_end().child(bubble));
	}
	let name = message.author.unwrap_or_else(|| "Agent".to_owned());
	let hue = message.bot_id.and_then(|id| s.agent_hue(id));
	let author = row()
		.gap(SPACING * 2.0)
		.center_y()
		.child(avatar(&name, hue, 22.0))
		.child(text(name.clone()).font(TEXT_SM_MEDIUM).color(t.foreground));
	let body = content::segments(&named)
		.into_iter()
		.fold(col().w_full().gap(SPACING * 3.0), |body, segment| {
			body.child(segment_view(s, segment, message.streaming, k, t))
		});
	frame.child(col().w(THREAD_WIDTH).shrink().gap(SPACING * 2.0).child(author).child(body))
}

fn segment_view(s: &App, segment: Segment, streaming: bool, k: &Kit, t: &Tokens) -> El {
	match segment {
		Segment::Markdown(source) => {
			let style = MarkdownStyle::from_kit(k).body_font(TEXT_READING).text(t.foreground);
			Markdown::new(source).streaming(streaming).selectable(true).render(&style)
		}
		Segment::Math(source) => not_drawn(t, "Math isn't drawn here (KaTeX)", &source),
		Segment::Image { alt, url } => image_view(s, &alt, &url, t),
	}
}

fn image_view(s: &App, alt: &str, url: &str, t: &Tokens) -> El {
	match s.images.slot(url) {
		Some(Slot::Ready(image)) => match image.size() {
			Some([width, height]) if width > 0 => {
				let drawn_width = (width as f32 / 2.0).min(IMAGE_MAX_WIDTH);
				let drawn_height = drawn_width * height as f32 / width as f32;
				el().size(drawn_width, drawn_height)
					.radius(RADIUS_LG)
					.border(1.0, t.image_outline)
					.label(alt)
					.pixels_fit(image.pixels(), SurfaceFit::Fit)
			}
			_ => match image.error() {
				Some(failure) => not_drawn(t, &format!("Image not drawn: {alt}"), &failure.0),
				None => not_drawn(t, &format!("Loading {alt}…"), ""),
			},
		},
		Some(Slot::Failed(failure)) => not_drawn(t, &format!("Image not drawn: {alt}"), failure),
		Some(Slot::Loading) | None => not_drawn(t, &format!("Loading {alt}…"), ""),
	}
}

fn composer(s: &App, k: &Kit, t: &Tokens, layer: &mut Vec<El>) -> El {
	let can_send = s.thread.as_ref().is_some_and(|thread| thread.conversation_id.is_some());
	mention_popup(s, k, layer);
	let pill_ink = t.primary;
	let pill_ground = t.primary.alpha(0.14);
	let field = TextArea::new(&s.composer.edit)
		.placeholder("Message, or @ to mention an agent")
		.width(None)
		.auto_grow(1, 8)
		.disabled(!can_send)
		.pill_style(move |id| {
			let style = rune::PillStyle::default();
			if id.starts_with(AGENT_PILL) { style.bg(pill_ground).fg(pill_ink) } else { style }
		})
		.on_edit(|s: &mut App| &mut s.composer.edit)
		.on_change(|s: &mut App, _: &mut Tx| s.composer_changed())
		.on_key(mention_keys)
		.on_submit(|s: &mut App, _: &mut Tx| s.send())
		.build(k)
		.key(COMPOSER);
	let send = Button::new("Send")
		.variant(ButtonVariant::Contrast)
		.disabled(!can_send || s.composer.edit.text.trim().is_empty())
		.on_press(|s: &mut App| s.send())
		.build(k);
	let mut column = col().w(THREAD_WIDTH).shrink().gap(SPACING * 2.0);
	if let Some(notice) = &s.notice {
		column = column.child(text(notice.clone()).font(TEXT_COMPACT).color(t.destructive).wrap());
	}
	let surface = row()
		.w_full()
		.padding(SPACING * 2.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_CONTROL)
		.fill(t.prompt_surface)
		.border(1.0, t.border)
		.items_end()
		.child(col().grow(1.0).shrink().child(field))
		.child(send);
	row()
		.w_full()
		.justify_center()
		.px(SPACING * 6.0)
		.pb(SPACING * 4.0)
		.pt(SPACING * 2.0)
		.child(column.child(surface))
}

fn mention_popup(s: &App, k: &Kit, layer: &mut Vec<El>) {
	let Some(mention) = s.composer.mention.as_ref() else { return };
	let candidates = s.mention_candidates();
	let count = candidates.len();
	let items = candidates.into_iter().map(|seat| {
		PopupItem::new(seat.bot_id.clone(), format!("@{}", seat.name))
			.leading(avatar(&seat.name, seat.hue, 18.0))
	});
	PopupList::new("mentions", COMPOSER)
		.open(true)
		.width(280.0)
		.items(items)
		.empty_message("No agent here by that name")
		.active((count > 0).then_some(mention.active))
		.on_active(|s: &mut App, i| {
			if let Some(mention) = s.composer.mention.as_mut() {
				mention.active = i;
			}
		})
		.on_choose(|s: &mut App, id, _: &mut Tx| s.choose_mention(id))
		.on_close(|s: &mut App| s.composer.mention = None)
		.build(k, layer);
}

fn mention_keys(s: &mut App, event: &KeyEvent, _: &mut Tx) -> bool {
	if s.composer.mention.is_none() {
		return false;
	}
	match event.key {
		Key::Up => {
			s.move_mention(-1);
			true
		}
		Key::Down => {
			s.move_mention(1);
			true
		}
		Key::Enter | Key::Tab => s.choose_active_mention(),
		Key::Escape => {
			s.composer.mention = None;
			true
		}
		_ => false,
	}
}
