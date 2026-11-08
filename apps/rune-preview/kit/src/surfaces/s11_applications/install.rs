use rune::{Color, El, Icon, Span, TextEdit, col, el, icon, row, text, text_input};

use super::catalogue::{
	CatalogueEvent, Category, LINE_18, PAGE_INSET, Setup, TEXT_SM_MEDIUM_18, catalogue_page,
};
use super::identity::{Identity, meta_line, verified_pill};
use super::mark::{Mark, MarkSize, mark};
use super::panel::Owner;
use super::{HAIRLINE, fill, hosted_sentence, kit_ring, mono, round, say};
use crate::icons;
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::primitives::instant;
use crate::strings::{Key, Language, bots};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_COMPACT_MONO, TEXT_COMPACT_MONO_MEDIUM,
	TEXT_READING, TEXT_SM_MEDIUM, TEXT_XS, Tokens, faded,
};

const FACT_GLYPH: f32 = SPACING * 3.75;
const FOOTNOTE_GLYPH: f32 = SPACING * 3.5;
const KEY_FIELD_HEIGHT: f32 = SPACING * 9.0;
const REVEAL_LANE: f32 = SPACING * 16.0;
const TOOL_HEIGHT: f32 = SPACING * 6.0;
const DOT: f32 = SPACING * 2.0;
const ATTENTION_BORDER: f32 = 0.45;
const ATTENTION_FILL: f32 = 0.08;
const REFUSED_BORDER: f32 = 0.22;
const REFUSED_FILL: f32 = 0.06;

pub struct KeyField<'a> {
	pub name: &'a str,
	pub description: Option<&'a str>,
	pub is_concealed: bool,
	pub is_revealed: bool,
	pub value: &'a TextEdit,
}

pub struct Installable<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub description: Option<&'a str>,
	pub package_identity: &'a str,
	pub setup: Setup,
	pub mark: Mark<'a>,
	pub source: Option<&'a str>,
	pub use_count: Option<u64>,
	pub is_verified: bool,
	pub host: Option<&'a str>,
	pub tools: Option<&'a [&'a str]>,
	pub fields: &'a [KeyField<'a>],
	pub refusal: Option<&'a str>,
}

pub struct InstallPage<'a> {
	pub category: Category,
	pub application: &'a Installable<'a>,
	pub owner: Owner<'a>,
	pub is_installing: bool,
	pub is_installed: bool,
	pub failure: Option<&'a str>,
	pub language: Language,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum InstallEvent {
	Page(CatalogueEvent),
	Install,
	Reveal(usize),
}

pub type FieldAccess<S> = for<'a> fn(&'a mut S, usize) -> &'a mut TextEdit;

pub fn install_page<S: 'static>(
	t: &Tokens,
	page: &InstallPage,
	access: FieldAccess<S>,
	emit: fn(&mut S, InstallEvent),
) -> El {
	let application = page.application;
	let language = page.language;
	let is_refused = application.setup == Setup::Unavailable;
	let mut top = row().w_full().center_y().child(header(t, application, language));
	if !is_refused {
		top = top.child(
			row().pr(PAGE_INSET).py(SPACING * 3.0).center_y().child(install_action(t, page, emit)),
		);
	}
	let mut setup_group = col().w_full().gap(SPACING * 1.75);
	if let Some(block) = setup_block(t, page, access, emit) {
		setup_group = setup_group.child(block);
	}
	if let Some(host) = application.host {
		if application.setup == Setup::SignIn {
			let sentence = fill(
				bots::applications::install::sign_in::FACT,
				language,
				&[("name", application.name)],
			);
			setup_group = setup_group.child(fact(
				t,
				&icons::EXTERNAL_LINK,
				Tone::Muted,
				sentence,
				Vec::new(),
			));
		}
		let (sentence, host) =
			hosted_sentence(bots::applications::install::HOSTING, language, host);
		setup_group =
			setup_group.child(fact(t, &icons::CLOUD, Tone::Attention, sentence, vec![host]));
	}
	let mut body = col()
		.w_full()
		.grow(1.0)
		.min_h(0.0)
		.gap(SPACING * 4.5)
		.padding(PAGE_INSET)
		.child(setup_group);
	if let Some(failure) = page.failure {
		body = body.child(
			text(failure.to_owned())
				.font(TEXT_XS)
				.color(t.destructive)
				.wrap_anywhere()
				.role("alert"),
		);
	}
	if let Some(tools) = application.tools {
		body = body.child(tool_list(t, tools, language));
	}
	body = body.child(el().grow(1.0)).child(footnote(t, page));
	let content = col()
		.w_full()
		.h_full()
		.child(top)
		.child(el().w_full().h(HAIRLINE).fill(t.border))
		.child(body.scroll(rune::ScrollSpec { stick_bottom: false }));
	catalogue_page(
		t,
		page.category,
		language,
		move |s: &mut S, event| emit(s, InstallEvent::Page(event)),
		content,
	)
}

fn header(t: &Tokens, application: &Installable, language: Language) -> El {
	let is_package = application.description.is_none();
	let title_style = if is_package {
		mono(rune::TextStyle { line_height: LINE_18, ..TEXT_READING })
	} else {
		TEXT_SM_MEDIUM_18
	};
	let mut title = row().min_w(0.0).gap(SPACING * 1.5).center_y().child(
		text(application.name.to_owned()).font(title_style).color(t.foreground).truncate().shrink(),
	);
	if application.is_verified {
		title = title.child(verified_pill(t, language));
	}
	let summary_style = if is_package { mono(TEXT_XS) } else { TEXT_XS };
	let mut reading = col().grow(1.0).min_w(0.0).gap(SPACING * 0.5).child(title).child(
		text(application.description.unwrap_or(application.package_identity).to_owned())
			.font(summary_style)
			.color(t.muted_foreground)
			.wrap_anywhere(),
	);
	let identity = Identity {
		source: application.source,
		use_count: application.use_count,
		host: None,
		package_identity: None,
	};
	if let Some(meta) = meta_line(t, identity, language) {
		reading = reading.child(meta);
	}
	row()
		.grow(1.0)
		.min_w(0.0)
		.gap(SPACING * 2.5)
		.center_y()
		.px(PAGE_INSET)
		.py(SPACING * 3.0)
		.child(mark(t, application.mark, MarkSize::Md))
		.child(reading)
}

fn install_action<S: 'static>(
	t: &Tokens,
	page: &InstallPage,
	emit: fn(&mut S, InstallEvent),
) -> El {
	let application = page.application;
	let is_sign_in = application.setup == Setup::SignIn && application.host.is_none();
	let glyph: Option<&'static Icon> = if page.is_installed {
		Some(&icons::CHECK)
	} else if page.is_installing {
		Some(&icons::LOADER_CIRCLE)
	} else {
		is_sign_in.then_some(&icons::EXTERNAL_LINK)
	};
	let label = if page.is_installed {
		bots::applications::install::DONE
	} else if is_sign_in {
		bots::applications::install::sign_in::ACTION
	} else {
		bots::applications::ADD
	};
	let button = Button::new(say(label, page.language));
	let button = match glyph {
		Some(glyph) => button.leading(glyph),
		None => button,
	};
	let is_unavailable = page.is_installing || page.is_installed;
	let view = button.disabled(is_unavailable).view(t).key("install-action");
	if is_unavailable {
		view
	} else {
		view.on_press(move |s: &mut S| emit(s, InstallEvent::Install))
	}
}

fn setup_block<S: 'static>(
	t: &Tokens,
	page: &InstallPage,
	access: FieldAccess<S>,
	emit: fn(&mut S, InstallEvent),
) -> Option<El> {
	let application = page.application;
	let language = page.language;
	match application.setup {
		Setup::ApiKey => Some(key_panel(t, page, access, emit)),
		Setup::Nothing => {
			let key = if application.host.is_some() {
				bots::applications::install::HOSTED_NONE
			} else {
				bots::applications::install::NONE
			};
			Some(fact(t, &icons::CHECK, Tone::Done, say(key, language).to_owned(), Vec::new()))
		}
		Setup::Unavailable => Some(refused(t, application, language)),
		Setup::SignIn if application.host.is_none() => {
			Some(sign_in_notice(t, application.name, language))
		}
		Setup::SignIn => None,
	}
}

#[derive(Clone, Copy)]
enum Tone {
	Muted,
	Attention,
	Done,
}

fn fact(t: &Tokens, glyph: &'static Icon, tone: Tone, sentence: String, spans: Vec<Span>) -> El {
	let (ink, sentence_ink) = match tone {
		Tone::Muted => (t.muted_foreground, t.muted_foreground),
		Tone::Attention => (t.bot_badge_attention, t.foreground),
		Tone::Done => (t.state_connected, t.muted_foreground),
	};
	row()
		.w_full()
		.gap(SPACING * 1.75)
		.items_start()
		.child(icon(glyph, FACT_GLYPH).color(ink).mt(SPACING * 0.5))
		.child(text(sentence).spans(spans).font(TEXT_COMPACT).color(sentence_ink).wrap().shrink())
}

fn surface(control: El, border: Color, ground: Color) -> El {
	control.radius(RADIUS_XL).border(HAIRLINE, border).fill(ground)
}

fn sign_in_notice(t: &Tokens, name: &str, language: Language) -> El {
	let notice = row()
		.w_full()
		.gap(SPACING * 3.0)
		.items_start()
		.padding(SPACING * 3.0 + HAIRLINE)
		.child(
			row()
				.size(SPACING * 4.0, SPACING * 4.0)
				.mt(HAIRLINE)
				.center()
				.child(round(el().size(DOT, DOT).fill(t.state_needs_authorization), DOT)),
		)
		.child(
			col()
				.min_w(0.0)
				.shrink()
				.gap(SPACING * 0.75)
				.child(
					text(fill(
						bots::applications::install::sign_in::TITLE,
						language,
						&[("name", name)],
					))
					.font(TEXT_SM_MEDIUM_18)
					.color(t.foreground)
					.wrap_anywhere(),
				)
				.child(
					text(
						say(bots::applications::install::sign_in::DESCRIPTION, language).to_owned(),
					)
					.font(TEXT_XS)
					.color(t.muted_foreground)
					.wrap_anywhere(),
				),
		);
	surface(
		notice,
		faded(t.bot_badge_attention, ATTENTION_BORDER),
		faded(t.bot_badge_attention, ATTENTION_FILL),
	)
}

fn refused(t: &Tokens, application: &Installable, language: Language) -> El {
	let mut words = col().min_w(0.0).shrink().gap(SPACING * 0.75).child(
		text(fill(
			bots::applications::install::unavailable::TITLE,
			language,
			&[("name", application.name)],
		))
		.font(TEXT_SM_MEDIUM)
		.color(t.foreground)
		.wrap_anywhere(),
	);
	if let Some(reason) = application.refusal {
		words = words.child(
			text(fill(
				bots::applications::install::unavailable::DESCRIPTION,
				language,
				&[("reason", reason)],
			))
			.font(TEXT_COMPACT)
			.color(t.muted_foreground)
			.wrap_anywhere(),
		);
	}
	let notice = row()
		.w_full()
		.gap(SPACING * 2.5)
		.items_start()
		.padding(SPACING * 3.5 + HAIRLINE)
		.child(icon(&icons::BAN, SPACING * 4.0).color(t.destructive).mt(SPACING * 0.5))
		.child(words);
	surface(notice, faded(t.destructive, REFUSED_BORDER), faded(t.destructive, REFUSED_FILL))
}

fn owner_key<'a>(owner: Owner<'a>, agent: Key, space: Key, profile: Key) -> (Key, &'a str) {
	match owner {
		Owner::Agent(name) => (agent, name),
		Owner::Space(name) => (space, name),
		Owner::Profile => (profile, ""),
	}
}

fn key_panel<S: 'static>(
	t: &Tokens,
	page: &InstallPage,
	access: FieldAccess<S>,
	emit: fn(&mut S, InstallEvent),
) -> El {
	use bots::applications::install::key;
	let application = page.application;
	let language = page.language;
	let (description, owner_name) = owner_key(
		page.owner,
		key::description::AGENT,
		key::description::SPACE,
		key::description::PROFILE,
	);
	let panel = col()
		.w_full()
		.gap(SPACING * 3.0)
		.padding(SPACING * 3.5 + HAIRLINE)
		.child(
			text(fill(key::TITLE, language, &[("name", application.name)]))
				.font(TEXT_SM_MEDIUM)
				.color(t.foreground)
				.wrap_anywhere(),
		)
		.children(
			application
				.fields
				.iter()
				.enumerate()
				.map(|(index, field)| key_field(t, field, index, language, access, emit)),
		)
		.child(
			text(fill(description, language, &[("name", owner_name)]))
				.font(TEXT_XS)
				.color(t.muted_foreground)
				.wrap_anywhere(),
		);
	surface(panel, t.border, t.muted)
}

fn key_field<S: 'static>(
	t: &Tokens,
	field: &KeyField,
	index: usize,
	language: Language,
	access: FieldAccess<S>,
	emit: fn(&mut S, InstallEvent),
) -> El {
	use bots::applications::install::key;
	let style = rune::TextStyle { line_height: SPACING * 5.0, ..TEXT_COMPACT_MONO };
	let is_hidden = field.is_concealed && !field.is_revealed;
	let input = text_input(field.value, style)
		.single_line()
		.key(format!("install-key-{}", field.name))
		.w_full()
		.h(KEY_FIELD_HEIGHT)
		.py((KEY_FIELD_HEIGHT - style.line_height) / 2.0)
		.pl(SPACING * 3.0 + HAIRLINE)
		.pr(if field.is_concealed { REVEAL_LANE } else { SPACING * 3.0 })
		.radius(RADIUS_CONTROL)
		.fill(t.card)
		.border(HAIRLINE, t.input)
		.color(t.foreground)
		.caret(t.foreground, t.selection)
		.label(field.name)
		.on_edit(move |s: &mut S| access(s, index));
	let input = kit_ring(t, instant(if is_hidden { input.secure() } else { input }));
	let mut shell = row().w_full().child(input);
	if field.is_concealed {
		let (label, aria) = if field.is_revealed {
			(key::CONCEAL, key::CONCEAL_LABEL)
		} else {
			(key::REVEAL, key::REVEAL_LABEL)
		};
		let toggle = Button::new(say(label, language))
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::Xs)
			.view(t)
			.label(fill(aria, language, &[("field", field.name)]))
			.on_press(move |s: &mut S| emit(s, InstallEvent::Reveal(index)));
		shell = shell.child(
			row()
				.pin(None, Some(0.0), Some(SPACING + HAIRLINE), Some(0.0))
				.center_y()
				.child(toggle),
		);
	}
	let mut column = col().w_full().gap(SPACING * 1.5).child(
		text(field.name.to_owned())
			.font(TEXT_COMPACT_MONO_MEDIUM)
			.color(t.foreground)
			.wrap_anywhere(),
	);
	column = column.child(shell);
	if let Some(description) = field.description {
		column = column.child(
			text(description.to_owned()).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere(),
		);
	}
	column
}

fn tool_list(t: &Tokens, tools: &[&str], language: Language) -> El {
	use bots::applications::install::tools;
	let count_key =
		if tools.len() == 1 { tools::count::PLAIN_ONE } else { tools::count::PLAIN_OTHER };
	let count = fill(count_key, language, &[("count", &tools.len().to_string())]);
	col()
		.w_full()
		.gap(SPACING * 2.0)
		.child(
			row()
				.flex_wrap()
				.gaps(0.0, SPACING * 2.0)
				.items_end()
				.child(
					text(say(tools::TITLE, language).to_owned())
						.font(TEXT_SM_MEDIUM_18)
						.color(t.foreground),
				)
				.child(text(count).font(TEXT_XS).color(t.muted_foreground)),
		)
		.child(row().w_full().flex_wrap().gap(SPACING * 1.5).role("list").children(
			tools.iter().map(|tool| {
				round(
					row()
						.min_h(TOOL_HEIGHT)
						.min_w(0.0)
						.px(SPACING * 2.5)
						.py(SPACING)
						.fill(t.muted)
						.role("listitem")
						.child(
							text((*tool).to_owned())
								.font(mono(TEXT_XS))
								.color(t.foreground)
								.wrap_anywhere(),
						),
					TOOL_HEIGHT,
				)
			}),
		))
}

fn footnote(t: &Tokens, page: &InstallPage) -> El {
	use bots::applications::install::{footnote, hosted_footnote};
	let application = page.application;
	let hosted_source = application.host.map(|host| application.source.unwrap_or(host));
	let copy = match hosted_source {
		None => {
			let (key, name) =
				owner_key(page.owner, footnote::AGENT, footnote::SPACE, footnote::PROFILE);
			fill(key, page.language, &[("name", name)])
		}
		Some(source) => {
			let (key, name) = owner_key(
				page.owner,
				hosted_footnote::AGENT,
				hosted_footnote::SPACE,
				hosted_footnote::PROFILE,
			);
			fill(key, page.language, &[("name", name), ("source", source)])
		}
	};
	col().w_full().child(el().w_full().h(HAIRLINE).fill(t.border)).child(
		row()
			.w_full()
			.gap(SPACING * 2.0)
			.items_start()
			.pt(SPACING * 3.0)
			.child(icon(&icons::SHIELD, FOOTNOTE_GLYPH).color(t.muted_foreground).mt(SPACING * 0.5))
			.child(text(copy).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere().shrink()),
	)
}
