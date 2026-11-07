use rune::{El, Icon, col, el, icon, row, text};

use super::{Emit, Frame, heading, onboarding_shell, primary, secondary};
use crate::avatar::Face;
use crate::hues::{Preset, Role};
use crate::icons;
use crate::primitives::button::{Button, ButtonVariant};
use crate::strings::chat::onboarding::intro;
use crate::strings::{Key, Language};
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_CONTROL, SPACING, TEXT_10_MEDIUM, TEXT_BASE_SEMIBOLD,
	TEXT_COMPACT_MEDIUM, TEXT_COMPACT_SEMIBOLD, TEXT_SM, TEXT_SM_SEMIBOLD, TEXT_XS, TEXT_XS_MEDIUM,
	TEXT_XS_MONO, Tokens, faded, icon_stroke_in, tone,
};

const HEADING_WIDTH: f32 = SPACING * 105.0;
const AGENT_WIDTH: f32 = SPACING * 35.0;
const FACE: f32 = SPACING * 24.0;
const FEATURED_FACE: f32 = SPACING * 33.0;
const SMALL_FACE: f32 = SPACING * 6.0;
const MISSION_FACE: f32 = SPACING * 8.0;
const SPACE_FACE: f32 = SPACING * 9.0;
const TOOL_TILE: f32 = SPACING * 10.0;
const TOOL_GLYPH: f32 = SPACING * 5.0;
const CARD_INSET: f32 = SPACING * 4.5;
const MISSION_INSET: f32 = SPACING * 3.5;
const CONVERSATION_WIDTH: f32 = SPACING * 110.0;
const CARDS_WIDTH: f32 = SPACING * 130.0;
const CARD_MIN_WIDTH: f32 = SPACING * 36.0;
const BUBBLE_MAX_WIDTH: f32 = SPACING * 85.0;
const PILE_WIDTH: f32 = SPACING * 11.0;
const PILE_OVERLAP: f32 = SPACING * 1.5;
const SEGMENT: (f32, f32) = (SPACING * 11.0, SPACING);
const STATUS_HEIGHT: f32 = SPACING * 6.0;
const STATUS_DOT: f32 = SPACING * 1.5;
const BADGE_RADIUS: f32 = SPACING * 1.75;
const BADGE_FILL_SHARE: f32 = 0.1;
const BADGE_INK_SHARE: f32 = 0.8;
const ARROW_REST_OPACITY: f32 = 0.35;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WelcomeStep {
	Agents,
	Conversations,
	Spaces,
	Tools,
}

impl WelcomeStep {
	pub const ALL: [WelcomeStep; 4] =
		[WelcomeStep::Agents, WelcomeStep::Conversations, WelcomeStep::Spaces, WelcomeStep::Tools];

	fn position(self) -> usize {
		match self {
			WelcomeStep::Agents => 1,
			WelcomeStep::Conversations => 2,
			WelcomeStep::Spaces => 3,
			WelcomeStep::Tools => 4,
		}
	}

	fn words(self) -> (Key, Key) {
		match self {
			WelcomeStep::Agents => (intro::companions::TITLE, intro::companions::BODY),
			WelcomeStep::Conversations => (intro::conversations::TITLE, intro::conversations::BODY),
			WelcomeStep::Spaces => (intro::spaces::TITLE, intro::spaces::BODY),
			WelcomeStep::Tools => (intro::tools::TITLE, intro::tools::BODY),
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WelcomeEvent {
	Back,
	Next,
	Skip,
}

#[derive(Clone, Copy)]
pub struct Agent<'a> {
	pub name: &'a str,
	pub job: &'a str,
	pub hue: f32,
}

pub struct Welcome<'a> {
	pub step: WelcomeStep,
	pub language: Language,
	pub hue: Option<f32>,
	pub agents: [Agent<'a>; 3],
}

impl Welcome<'static> {
	pub fn new(step: WelcomeStep, language: Language, hue: Option<f32>) -> Welcome<'static> {
		let agent = |name: Key, job: Key, preset: Preset| Agent {
			name: name.text(language),
			job: job.text(language),
			hue: preset.hue(),
		};
		Welcome {
			step,
			language,
			hue,
			agents: [
				agent(intro::companions::atlas::NAME, intro::companions::atlas::JOB, Preset::Cyan),
				agent(
					intro::companions::juniper::NAME,
					intro::companions::juniper::JOB,
					Preset::Green,
				),
				agent(intro::companions::wren::NAME, intro::companions::wren::JOB, Preset::Pink),
			],
		}
	}
}

pub fn welcome_screen<S: 'static>(
	t: &Tokens,
	welcome: &Welcome,
	emit: Emit<S, WelcomeEvent>,
) -> El {
	let t = &t.in_space(welcome.hue);
	let language = welcome.language;
	let illustration = match welcome.step {
		WelcomeStep::Agents => agents(t, &welcome.agents),
		WelcomeStep::Conversations => conversations(t, welcome),
		WelcomeStep::Spaces => spaces(t, welcome),
		WelcomeStep::Tools => tools(t, language),
	};
	let (title, body) = welcome.step.words();
	let content =
		vec![illustration, heading(t, title.text(language), body.text(language), HEADING_WIDTH)];
	onboarding_shell(t, Frame::WELCOME, content, vec![footer(t, welcome, emit)])
}

fn footer<S: 'static>(t: &Tokens, welcome: &Welcome, emit: Emit<S, WelcomeEvent>) -> El {
	let language = welcome.language;
	let at = welcome.step.position();
	let total = WelcomeStep::ALL.len();
	let segments = row()
		.gap(SPACING * 1.5)
		.center_y()
		.role("progressbar")
		.label(intro::PROGRESS.text(language))
		.children((1..=total).map(|segment| {
			el().size(SEGMENT.0, SEGMENT.1).radius(SEGMENT.1 / 2.0).fill(if segment <= at {
				t.primary
			} else {
				t.border
			})
		}));
	let stroke = icon_stroke_in(TEXT_SM);
	let back = arrow(
		t,
		icons::stroked(&icons::PREVIOUS, stroke),
		intro::BACK.text(language),
		ButtonVariant::Outline,
		at == 1,
		emit,
		WelcomeEvent::Back,
	);
	let next = arrow(
		t,
		icons::stroked(&icons::NEXT, stroke),
		intro::NEXT.text(language),
		ButtonVariant::Default,
		at == total,
		emit,
		WelcomeEvent::Next,
	);
	let stepper = row()
		.gap(SPACING * 4.0)
		.center_y()
		.pt(SPACING * 3.0)
		.pb(SPACING * 6.0)
		.child(back)
		.child(segments)
		.child(next);
	let action = if at == total {
		primary(t, intro::GET_STARTED.text(language), false, emit, WelcomeEvent::Next)
	} else {
		secondary(t, intro::SKIP.text(language), emit, WelcomeEvent::Skip)
	};
	col().items_center().child(stepper).child(action)
}

fn arrow<S: 'static>(
	t: &Tokens,
	glyph: &'static Icon,
	label: &str,
	variant: ButtonVariant,
	end: bool,
	emit: Emit<S, WelcomeEvent>,
	event: WelcomeEvent,
) -> El {
	let button = Button::icon(glyph, label).variant(variant).view(t);
	if end {
		return button.opacity(ARROW_REST_OPACITY).disabled(true);
	}
	button.on_press(move |s: &mut S| emit(s, event))
}

fn card(t: &Tokens) -> El {
	col().radius(RADIUS_BUBBLE).border(1.0, t.border).fill(t.card)
}

fn title_badge(t: &Tokens, job: &str) -> El {
	el().px(SPACING * 1.5).radius(BADGE_RADIUS).fill(faded(t.foreground, BADGE_FILL_SHARE)).child(
		text(job.to_owned())
			.font(TEXT_10_MEDIUM)
			.color(faded(t.foreground, BADGE_INK_SHARE))
			.wrap()
			.align(rune::Align::Center),
	)
}

fn agents(t: &Tokens, agents: &[Agent; 3]) -> El {
	row().items_end().gap(SPACING * 7.0).children(agents.iter().enumerate().map(
		|(index, agent)| {
			let featured = index == 1;
			col()
				.w(AGENT_WIDTH)
				.items_center()
				.gap(SPACING * 1.5)
				.pb(if featured { SPACING * 7.0 } else { 0.0 })
				.child(
					Face::still(agent.name, Some(agent.hue))
						.draw(if featured { FEATURED_FACE } else { FACE }, t),
				)
				.child(el().pt(SPACING * 2.0).child(
					text(agent.name.to_owned()).font(TEXT_COMPACT_MEDIUM).color(t.foreground),
				))
				.child(title_badge(t, agent.job))
		},
	))
}

fn bubble(t: &Tokens, words: &str, solid: bool) -> El {
	let (fill, ink) = if solid {
		(t.user_bubble, t.user_bubble_foreground)
	} else {
		(t.bubble, t.bubble_foreground)
	};
	el().max_w(BUBBLE_MAX_WIDTH)
		.shrink()
		.padding(SPACING * 3.0)
		.radius(RADIUS_BUBBLE)
		.fill(fill)
		.child(text(words.to_owned()).font(TEXT_SM).color(ink).wrap())
}

fn pile(t: &Tokens, faces: &[&Agent]) -> El {
	row().children(faces.iter().enumerate().map(|(index, agent)| {
		Face::still(agent.name, Some(agent.hue)).draw(SMALL_FACE, t).ml(if index > 0 {
			-PILE_OVERLAP
		} else {
			0.0
		})
	}))
}

fn conversations(t: &Tokens, welcome: &Welcome) -> El {
	let language = welcome.language;
	let [_, juniper, wren] = &welcome.agents;
	let words = |key: Key| key.text(language).to_owned();
	let thread = card(t)
		.w_full()
		.gap(SPACING * 3.5)
		.padding(CARD_INSET)
		.child(
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.child(el().w(PILE_WIDTH).child(pile(t, &[juniper, wren])))
				.child(
					text(words(intro::conversations::THREAD))
						.font(TEXT_COMPACT_SEMIBOLD)
						.color(t.foreground),
				),
		)
		.child(row().w_full().justify_end().child(bubble(
			t,
			intro::conversations::ASK.text(language),
			true,
		)))
		.child(
			row()
				.items_end()
				.gap(SPACING * 2.0)
				.child(Face::still(wren.name, Some(wren.hue)).draw(SMALL_FACE, t))
				.child(bubble(t, intro::conversations::REPLY.text(language), false)),
		);
	let status = row()
		.h(STATUS_HEIGHT)
		.px(SPACING * 2.5)
		.gap(SPACING * 1.5)
		.center_y()
		.radius(STATUS_HEIGHT / 2.0)
		.fill(t.muted)
		.child(el().size(STATUS_DOT, STATUS_DOT).radius(STATUS_DOT / 2.0).fill(t.primary))
		.child(text(words(intro::conversations::STATUS)).font(TEXT_XS_MEDIUM).color(t.foreground));
	let mission = row()
		.w_full()
		.gap(SPACING * 3.0)
		.center_y()
		.padding(MISSION_INSET)
		.radius(RADIUS_BUBBLE)
		.border(1.0, t.border)
		.fill(t.card)
		.child(Face::still(wren.name, Some(wren.hue)).draw(MISSION_FACE, t))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.gap(SPACING * 0.5)
				.child(
					text(words(intro::conversations::MISSION))
						.font(TEXT_COMPACT_SEMIBOLD)
						.color(t.foreground),
				)
				.child(
					text(words(intro::conversations::MISSION_DETAIL))
						.font(TEXT_XS)
						.color(t.muted_foreground),
				),
		)
		.child(status);
	col().w(CONVERSATION_WIDTH).shrink().gap(SPACING * 3.0).child(thread).child(mission)
}

fn space_mark(t: &Tokens, name: &str, hue: f32) -> El {
	let initial: String = name.chars().take(1).collect();
	el().size(SPACE_FACE, SPACE_FACE)
		.radius(RADIUS_CONTROL)
		.fill(tone(hue, t.dark, Role::ConversationIcon))
		.center()
		.a11y_hidden()
		.child(text(initial).font(TEXT_BASE_SEMIBOLD).color(tone(
			hue,
			t.dark,
			Role::ConversationIconForeground,
		)))
}

fn spaces(t: &Tokens, welcome: &Welcome) -> El {
	let language = welcome.language;
	let [atlas, juniper, wren] = &welcome.agents;
	let space = |name: Key, detail: Key, preset: Preset, members: &[&Agent]| {
		let name = name.text(language);
		card(t)
			.grow(1.0)
			.min_w(CARD_MIN_WIDTH)
			.gap(SPACING * 3.5)
			.padding(CARD_INSET)
			.child(
				row()
					.gap(SPACING * 3.0)
					.center_y()
					.child(space_mark(t, name, preset.hue()))
					.child(text(name.to_owned()).font(TEXT_SM_SEMIBOLD).color(t.foreground).wrap()),
			)
			.child(row().gap(SPACING * 2.0).center_y().child(pile(t, members)).child(
				text(detail.text(language).to_owned()).font(TEXT_XS).color(t.muted_foreground),
			))
	};
	row()
		.w(CARDS_WIDTH)
		.shrink()
		.gap(SPACING * 3.0)
		.child(space(
			intro::spaces::work::NAME,
			intro::spaces::work::DETAIL,
			Preset::Blue,
			&[atlas, wren],
		))
		.child(space(
			intro::spaces::personal::NAME,
			intro::spaces::personal::DETAIL,
			Preset::Green,
			&[juniper],
		))
}

fn tools(t: &Tokens, language: Language) -> El {
	let tool = |glyph: &'static Icon, name: Key, detail: Key, mono: bool| {
		card(t)
			.grow(1.0)
			.min_w(CARD_MIN_WIDTH)
			.gap(SPACING * 3.5)
			.padding(CARD_INSET)
			.child(
				el().size(TOOL_TILE, TOOL_TILE)
					.radius(RADIUS_CONTROL)
					.fill(t.muted)
					.center()
					.a11y_hidden()
					.child(icon(glyph, TOOL_GLYPH).color(t.foreground)),
			)
			.child(
				col()
					.gap(SPACING * 0.5)
					.child(
						text(name.text(language).to_owned())
							.font(TEXT_SM_SEMIBOLD)
							.color(t.foreground),
					)
					.child(
						text(detail.text(language).to_owned())
							.font(if mono { TEXT_XS_MONO } else { TEXT_XS })
							.color(t.muted_foreground)
							.wrap_anywhere(),
					),
			)
	};
	row()
		.w(CARDS_WIDTH)
		.shrink()
		.gap(SPACING * 3.0)
		.child(tool(&icons::FOLDER, intro::tools::FOLDERS, intro::tools::FOLDERS_DETAIL, true))
		.child(tool(
			&icons::SERVER,
			intro::tools::APPLICATIONS,
			intro::tools::APPLICATIONS_DETAIL,
			false,
		))
		.child(tool(&icons::CODE, intro::tools::SECRETS, intro::tools::SECRETS_DETAIL, true))
}
