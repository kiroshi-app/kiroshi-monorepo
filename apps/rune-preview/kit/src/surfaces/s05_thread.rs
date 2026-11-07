use std::rc::Rc;

use rune::image::Image;
use rune::{El, ScrollSpec, col, row, text};

use crate::avatar::Face;
use crate::math::Typesetter;
use crate::strings::{Language, chat};
use crate::surfaces::s08_missions::{self, Bot, EventKind, EventLink, MissionsEvent};
use crate::tokens::{SPACING, TEXT_BASE_SEMIBOLD, TEXT_SM, Tokens};
use crate::widgets::not_drawn;

mod body;
mod furniture;
mod rows;
mod turn;

pub use body::{Body, Surface, body};
pub use furniture::{
	PinnedMessage, SelectionToolbar, ToolbarAction, pinned_messages, selection_toolbar,
	transcript_skeleton,
};
pub use rows::{WorkLine, WorkState, WorkingAgent, day_separator, new_messages, work_line};
pub use turn::{author_line, message_actions, message_menu, message_quote, turn};

pub type Emit<S, E = ThreadEvent> = Rc<dyn Fn(&mut S, E)>;

#[derive(Clone, Debug, PartialEq)]
pub enum ThreadEvent {
	Copy(String),
	Reply(String),
	Pin(String),
	Unpin(String),
	Retry(String),
	CancelQueued(String),
	OpenLink(String),
	ToggleTask { turn: String, marker: usize, checked: bool },
	OpenAttachment { turn: String, index: usize },
	OpenQuote(String),
	ToggleWork(String),
	JumpToPinned(String),
	QuoteSelection,
	ClearSelection,
	Mission(MissionsEvent),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Agent {
	pub id: String,
	pub name: String,
	pub hue: Option<f32>,
	pub badge: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub enum ThreadKind {
	Solo(Agent),
	Group { title: String },
	Mission { objective: String, tools: Vec<String>, bot: Option<Agent>, now: i64 },
}

#[derive(Clone, Debug, PartialEq)]
pub struct MissionEvent {
	pub id: String,
	pub kind: EventKind,
	pub source: String,
	pub created_at: i64,
	pub text: Option<String>,
	pub link: Option<(String, Option<u32>)>,
}

#[derive(Clone)]
pub enum Author {
	You,
	Person { name: String, image: Option<Image> },
	Agent(Agent),
	Deleted,
}

impl Author {
	fn is_end_side(&self) -> bool {
		matches!(self, Author::You | Author::Person { .. })
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum TurnState {
	#[default]
	Complete,
	Streaming,
	Stopped,
	Failed,
	Queued,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Quote {
	pub id: String,
	pub author: String,
	pub excerpt: String,
}

#[derive(Clone)]
pub struct Attachment {
	pub name: String,
	pub preview: Option<Image>,
	pub failed: bool,
}

#[derive(Clone)]
pub struct Turn {
	pub id: String,
	pub author: Author,
	pub body: String,
	pub time: Option<String>,
	pub state: TurnState,
	pub quotes: Vec<Quote>,
	pub attachments: Vec<Attachment>,
	pub pinned: bool,
	pub cause: Option<String>,
	pub shows_author: bool,
	pub shows_actions: bool,
}

impl Turn {
	pub fn new(id: &str, author: Author, body: &str) -> Turn {
		Turn {
			id: id.to_owned(),
			author,
			body: body.to_owned(),
			time: None,
			state: TurnState::Complete,
			quotes: Vec::new(),
			attachments: Vec::new(),
			pinned: false,
			cause: None,
			shows_author: true,
			shows_actions: false,
		}
	}

	pub fn at(self, time: &str) -> Turn {
		Turn { time: Some(time.to_owned()), ..self }
	}
}

#[derive(Clone)]
pub enum Row {
	Turn(Turn),
	Day(String),
	NewMessages,
	StartOfHistory,
	Work(WorkLine),
	Event(MissionEvent),
}

#[derive(Clone)]
pub enum Transcript {
	Loading,
	Failed { title: String, detail: String },
	Rows(Vec<Row>),
}

#[derive(Clone)]
pub struct Thread {
	pub kind: ThreadKind,
	pub language: Language,
	pub space_hue: Option<f32>,
	pub roster: Vec<Agent>,
	pub transcript: Transcript,
}

pub struct Context<'a, S> {
	pub t: &'a Tokens,
	pub math: &'a Typesetter,
	pub language: Language,
	pub roster: &'a [Agent],
	pub emit: &'a Emit<S>,
}

impl<S> Context<'_, S> {
	fn say(&self, key: crate::strings::Key) -> &'static str {
		key.text(self.language)
	}
}

pub const COLUMN: f32 = 720.0;
pub const COLUMN_INSET: f32 = SPACING * 6.0;
const ROW_GAP: f32 = SPACING * 3.0;

pub fn thread<S: 'static>(t: &Tokens, math: &Typesetter, data: &Thread, emit: &Emit<S>) -> El {
	let t = &t.in_space(data.space_hue);
	let cx = Context { t, math, language: data.language, roster: &data.roster, emit };
	let label = match data.kind {
		ThreadKind::Mission { .. } => chat::transcript::message::MISSION,
		_ => chat::transcript::LABEL,
	};
	let surface = col().w_full().h_full().min_h(0.0).fill(t.background).label(cx.say(label));
	match &data.transcript {
		Transcript::Loading => surface.child(column(transcript_skeleton(t))),
		Transcript::Failed { title, detail } => {
			surface.center().padding(SPACING * 6.0).child(not_drawn(t, title, detail))
		}
		Transcript::Rows(rows) if rows.is_empty() => surface.center().child(empty(&cx, &data.kind)),
		Transcript::Rows(rows) => surface.child(
			col()
				.key("thread-transcript")
				.w_full()
				.grow(1.0)
				.min_h(0.0)
				.scroll(ScrollSpec { stick_bottom: true })
				.child(column(
					col()
						.w_full()
						.gap(ROW_GAP)
						.pt(SPACING * 8.0)
						.pb(SPACING * 4.0)
						.justify_end()
						.children(rows.iter().map(|shown| row_view(&cx, &data.kind, shown))),
				)),
		),
	}
}

pub fn column(content: El) -> El {
	row()
		.w_full()
		.h_full()
		.justify_center()
		.px(COLUMN_INSET)
		.child(col().w_full().max_w(COLUMN).h_full().justify_end().child(content))
}

fn row_view<S: 'static>(cx: &Context<S>, kind: &ThreadKind, shown: &Row) -> El {
	match shown {
		Row::Turn(data) => turn(cx, data),
		Row::Day(label) => day_separator(cx.t, label),
		Row::NewMessages => new_messages(cx.t, cx.say(chat::transcript::NEW_MESSAGES)),
		Row::StartOfHistory => day_separator(cx.t, cx.say(chat::transcript::START_OF_HISTORY)),
		Row::Work(line) => work_line(cx, line),
		Row::Event(event) => mission_event(cx, kind, event),
	}
}

fn mission_event<S: 'static>(cx: &Context<S>, kind: &ThreadKind, event: &MissionEvent) -> El {
	let (tools, bot, now) = match kind {
		ThreadKind::Mission { tools, bot, now, .. } => (tools.as_slice(), bot.as_ref(), *now),
		_ => (&[][..], None, event.created_at),
	};
	let tools: Vec<&str> = tools.iter().map(String::as_str).collect();
	let bot = bot.map(|agent| Bot {
		id: &agent.id,
		name: &agent.name,
		title: agent.badge.as_deref().unwrap_or_default(),
		hue: agent.hue,
	});
	let shown = s08_missions::MissionEvent {
		id: &event.id,
		kind: event.kind,
		source: &event.source,
		created_at: event.created_at,
		text: event.text.as_deref(),
		link: event
			.link
			.as_ref()
			.map(|(url, pull_request)| EventLink { url, pull_request: *pull_request }),
	};
	let emit = Rc::clone(cx.emit);
	let forwarded: s08_missions::Emit<S> =
		Rc::new(move |s: &mut S, event| emit(s, ThreadEvent::Mission(event)));
	s08_missions::event_row(cx.t, cx.language, &shown, &tools, bot, now, &forwarded)
}

fn fill(template: &str, values: &[(&str, &str)]) -> String {
	values.iter().fold(template.to_owned(), |filled, (name, value)| {
		filled.replace(&format!("{{{{{name}}}}}"), value)
	})
}

const EMPTY_FACE: f32 = SPACING * 16.0;

fn empty<S>(cx: &Context<S>, kind: &ThreadKind) -> El {
	let t = cx.t;
	let identity = match kind {
		ThreadKind::Solo(agent) => col()
			.items_center()
			.gap(SPACING * 3.0)
			.child(Face::still(&agent.name, agent.hue).draw(EMPTY_FACE, t))
			.child(text(agent.name.clone()).font(TEXT_BASE_SEMIBOLD).color(t.foreground)),
		ThreadKind::Group { title } => {
			col().child(text(title.clone()).font(TEXT_BASE_SEMIBOLD).color(t.foreground))
		}
		ThreadKind::Mission { objective, .. } => {
			col().child(text(objective.clone()).font(TEXT_SM).color(t.muted_foreground).wrap())
		}
	};
	col().items_center().max_w(COLUMN).padding(SPACING * 6.0).child(identity)
}
