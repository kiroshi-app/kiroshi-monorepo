use std::rc::Rc;

use rune::image::Image;
use rune::{El, ScrollSpec, col, row, text};

use crate::avatar::Face;
use crate::math::Typesetter;
use crate::strings::{Language, chat};
use crate::tokens::{SPACING, TEXT_SM, Tokens};
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
pub use rows::{
	EventSource, MissionEvent, MissionEventKind, MissionLink, WorkLine, WorkState, WorkingAgent,
	day_separator, mission_event, new_messages, work_line,
};
pub use turn::{author_line, message_actions, message_quote, turn};

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
	Mission { objective: String },
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
	pub detail: String,
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
						.children(rows.iter().map(|shown| row_view(&cx, shown))),
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

fn row_view<S: 'static>(cx: &Context<S>, shown: &Row) -> El {
	match shown {
		Row::Turn(data) => turn(cx, data),
		Row::Day(label) => day_separator(cx.t, label),
		Row::NewMessages => new_messages(cx.t, cx.say(chat::transcript::NEW_MESSAGES)),
		Row::StartOfHistory => day_separator(cx.t, cx.say(chat::transcript::START_OF_HISTORY)),
		Row::Work(line) => work_line(cx, line),
		Row::Event(event) => mission_event(cx, event),
	}
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
			.child(
				text(agent.name.clone())
					.font(crate::tokens::TEXT_BASE_SEMIBOLD)
					.color(t.foreground),
			),
		ThreadKind::Group { title } => col()
			.child(text(title.clone()).font(crate::tokens::TEXT_BASE_SEMIBOLD).color(t.foreground)),
		ThreadKind::Mission { objective } => {
			col().child(text(objective.clone()).font(TEXT_SM).color(t.muted_foreground).wrap())
		}
	};
	col().items_center().max_w(COLUMN).padding(SPACING * 6.0).child(identity)
}
