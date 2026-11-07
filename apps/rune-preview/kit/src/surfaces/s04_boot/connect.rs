use rune::{Cursor, El, TextEdit, col, el, row, text};

use super::{
	Emit, Frame, centred, heading, onboarding_shell, primary, ringed, say, secondary, status_line,
};
use crate::strings::chat::onboarding;
use crate::strings::{Key, Language};
use crate::tokens::{
	RADIUS_2XL, RADIUS_CONTROL, SPACING, TEXT_BASE_SEMIBOLD, TEXT_COMPACT, TEXT_COMPACT_MEDIUM,
	TEXT_INITIALS, TEXT_SM_MEDIUM, TEXT_XS, Tokens, faded,
};
use crate::widgets::{field, radio};

const HEADING_WIDTH: f32 = SPACING * 120.0;
const COLUMN_WIDTH: f32 = SPACING * 105.0;
const ACCOUNT_CARD_WIDTH: f32 = SPACING * 90.0;
const ACCOUNT_CARD_INSET: f32 = SPACING * 7.0;
const INITIALS_SIDE: f32 = SPACING * 22.0;
const OPTION_INSET: f32 = SPACING * 3.5;
const INVALID_RING: f32 = 3.0;
const INVALID_RING_SHARE: f32 = 0.3;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectStep {
	LoginFound,
	AnotherAccount,
	NothingFound,
	WaitingForCode,
	Connecting,
	Cancelled,
	TimedOut,
	LinkRefused,
	AgentMissing,
	KeyField,
	KeyRefused,
}

impl ConnectStep {
	fn words(self) -> (Key, Key) {
		use onboarding::{access, account, api_key, connect, connection, sign_in_failed};
		match self {
			ConnectStep::LoginFound => (account::QUESTION, account::r#use::DESCRIPTION),
			ConnectStep::AnotherAccount => (access::QUESTION, account::another::DESCRIPTION),
			ConnectStep::NothingFound => (connect::provider::TITLE, connect::provider::BODY),
			ConnectStep::WaitingForCode | ConnectStep::Connecting => {
				(access::sign_in::LABEL, connect::browser::BODY)
			}
			ConnectStep::Cancelled => (sign_in_failed::TITLE, connect::failed::CANCELLED),
			ConnectStep::TimedOut => (sign_in_failed::TITLE, connect::failed::TIMED_OUT),
			ConnectStep::LinkRefused => (sign_in_failed::TITLE, connect::failed::LINK_REFUSED),
			ConnectStep::AgentMissing => {
				(connect::agent_missing::TITLE, connect::agent_missing::BODY)
			}
			ConnectStep::KeyField => (api_key::QUESTION, connect::key::BODY),
			ConnectStep::KeyRefused => {
				(connection::key_failed::TITLE, connection::key_failed::SENTENCE)
			}
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectMethod {
	SignIn,
	ApiKey,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectEvent {
	UseAccount,
	UseAnotherAccount,
	Pick(ConnectMethod),
	SignIn,
	ReopenSignIn,
	PasteKey,
	SubmitCode,
	SubmitKey,
	TryAnotherKey,
	DownloadAgain,
}

pub struct ClaudeAccount<'a> {
	pub email: &'a str,
	pub initials: &'a str,
	pub plan: &'a str,
}

pub struct Entry<'a, S> {
	pub edit: &'a TextEdit,
	pub access: fn(&mut S) -> &mut TextEdit,
}

pub struct Connect<'a, S> {
	pub step: ConnectStep,
	pub language: Language,
	pub hue: Option<f32>,
	pub account: Option<ClaudeAccount<'a>>,
	pub method: ConnectMethod,
	pub code: Entry<'a, S>,
	pub api_key: Entry<'a, S>,
}

pub fn connect_screen<S: 'static>(t: &Tokens, c: &Connect<S>, emit: Emit<S, ConnectEvent>) -> El {
	let t = &t.in_space(c.hue);
	let language = c.language;
	let words = |key: Key| key.text(language);
	let (title, body) = c.step.words();
	let heading = heading(t, words(title), words(body), HEADING_WIDTH);
	let paste_key_instead =
		|| secondary(t, words(onboarding::code::EXIT), emit, ConnectEvent::PasteKey);
	let sign_in_instead =
		|| secondary(t, words(onboarding::api_key::EXIT), emit, ConnectEvent::SignIn);
	let go_on = |disabled: bool, event: ConnectEvent| {
		primary(t, words(onboarding::connect::CONTINUE), disabled, emit, event)
	};
	let below = Frame { content_gap: 0.0, content_bottom: SPACING * 5.0 };
	match c.step {
		ConnectStep::LoginFound => {
			let mut content = Vec::new();
			if let Some(account) = &c.account {
				content.push(account_card(t, language, account));
			}
			content.push(heading);
			onboarding_shell(
				t,
				Frame { content_gap: SPACING * 8.0, content_bottom: 0.0 },
				content,
				vec![
					primary(
						t,
						words(onboarding::account::r#use::LABEL),
						false,
						emit,
						ConnectEvent::UseAccount,
					),
					secondary(
						t,
						words(onboarding::account::another::LABEL),
						emit,
						ConnectEvent::UseAnotherAccount,
					),
				],
			)
		}
		ConnectStep::AnotherAccount | ConnectStep::NothingFound => {
			let options = col()
				.w(COLUMN_WIDTH)
				.shrink()
				.gap(SPACING * 2.0)
				.role("radiogroup")
				.label(words(title))
				.children(
					[ConnectMethod::SignIn, ConnectMethod::ApiKey]
						.map(|method| option(t, language, method, method == c.method, emit)),
				);
			let next = match c.method {
				ConnectMethod::SignIn => ConnectEvent::SignIn,
				ConnectMethod::ApiKey => ConnectEvent::PasteKey,
			};
			onboarding_shell(
				t,
				Frame { content_gap: SPACING * 6.0, content_bottom: SPACING * 5.0 },
				vec![heading, options],
				vec![go_on(false, next)],
			)
		}
		ConnectStep::WaitingForCode => onboarding_shell(
			t,
			below,
			vec![
				heading,
				column()
					.child(
						status_line(t, words(onboarding::connect::browser::WAITING))
							.mb(SPACING * 1.5),
					)
					.child(code_field(t, language, &c.code)),
			],
			vec![
				go_on(c.code.edit.text.is_empty(), ConnectEvent::SubmitCode),
				row()
					.flex_wrap()
					.justify_center()
					.child(secondary(
						t,
						words(onboarding::connect::browser::REOPEN),
						emit,
						ConnectEvent::ReopenSignIn,
					))
					.child(paste_key_instead()),
			],
		),
		ConnectStep::Connecting => onboarding_shell(
			t,
			below,
			vec![
				heading,
				column()
					.child(
						status_line(t, words(onboarding::connect::browser::CHECKING))
							.mb(SPACING * 1.5),
					)
					.child(code_field(t, language, &c.code)),
			],
			vec![
				primary(
					t,
					words(onboarding::connect::CONNECTING),
					true,
					emit,
					ConnectEvent::SubmitCode,
				)
				.a11y_value("busy"),
			],
		),
		ConnectStep::Cancelled | ConnectStep::TimedOut | ConnectStep::LinkRefused => {
			onboarding_shell(
				t,
				below,
				vec![heading],
				vec![
					primary(
						t,
						words(onboarding::sign_in_failed::retry::LABEL),
						false,
						emit,
						ConnectEvent::SignIn,
					),
					paste_key_instead(),
				],
			)
		}
		ConnectStep::AgentMissing => onboarding_shell(
			t,
			below,
			vec![heading],
			vec![primary(
				t,
				words(onboarding::connect::agent_missing::DOWNLOAD),
				false,
				emit,
				ConnectEvent::DownloadAgain,
			)],
		),
		ConnectStep::KeyField => onboarding_shell(
			t,
			below,
			vec![heading, column().child(key_field(t, language, &c.api_key, false))],
			vec![go_on(c.api_key.edit.text.is_empty(), ConnectEvent::SubmitKey), sign_in_instead()],
		),
		ConnectStep::KeyRefused => onboarding_shell(
			t,
			below,
			vec![heading, column().child(key_field(t, language, &c.api_key, true))],
			vec![
				primary(
					t,
					words(onboarding::connection::key_failed::ANOTHER_KEY),
					false,
					emit,
					ConnectEvent::TryAnotherKey,
				),
				sign_in_instead(),
			],
		),
	}
}

fn column() -> El {
	col().w(COLUMN_WIDTH).shrink().gap(SPACING * 2.5).pt(SPACING * 7.0)
}

fn labelled(t: &Tokens, label: &str, entry: El) -> El {
	col()
		.w_full()
		.gap(SPACING * 2.5)
		.child(text(label.to_owned()).font(TEXT_COMPACT_MEDIUM).color(t.foreground))
		.child(entry)
}

fn code_field<S: 'static>(t: &Tokens, language: Language, code: &Entry<S>) -> El {
	labelled(
		t,
		onboarding::code::QUESTION.text(language),
		field(
			t,
			&t.kit(),
			code.edit,
			onboarding::connect::browser::PLACEHOLDER.text(language),
			false,
			code.access,
		),
	)
}

fn key_field<S: 'static>(t: &Tokens, language: Language, key: &Entry<S>, refused: bool) -> El {
	let entry = field(
		t,
		&t.kit(),
		key.edit,
		onboarding::api_key::PLACEHOLDER.text(language),
		false,
		key.access,
	);
	let entry = if refused {
		entry
			.border(1.0, t.destructive)
			.outline(INVALID_RING, 0.0, faded(t.destructive, INVALID_RING_SHARE))
			.invalid(true)
	} else {
		entry
	};
	labelled(t, onboarding::api_key::ENTRY.text(language), entry)
}

fn option<S: 'static>(
	t: &Tokens,
	language: Language,
	method: ConnectMethod,
	checked: bool,
	emit: Emit<S, ConnectEvent>,
) -> El {
	let (label, description) = match method {
		ConnectMethod::SignIn => {
			(onboarding::access::sign_in::LABEL, onboarding::access::sign_in::DESCRIPTION)
		}
		ConnectMethod::ApiKey => {
			(onboarding::access::api_key::LABEL, onboarding::access::api_key::DESCRIPTION)
		}
	};
	let label = label.text(language);
	ringed(
		t,
		row()
			.key(format!("connect-option-{label}"))
			.w_full()
			.padding(OPTION_INSET)
			.gap(SPACING * 3.0)
			.items_start()
			.radius(RADIUS_CONTROL)
			.border(1.0, if checked { t.primary } else { t.border })
			.fill(t.card)
			.role("radio")
			.label(label)
			.checked(checked)
			.focusable(true)
			.cursor(Cursor::Pointer)
			.on_press(move |s: &mut S| emit(s, ConnectEvent::Pick(method)))
			.child(el().pt(1.0).child(radio(t, checked)))
			.child(
				col()
					.grow(1.0)
					.shrink()
					.gap(SPACING * 0.5)
					.child(text(label.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground))
					.child(
						text(description.text(language).to_owned())
							.font(TEXT_COMPACT)
							.color(t.muted_foreground)
							.wrap(),
					),
			),
	)
}

fn account_card(t: &Tokens, language: Language, account: &ClaudeAccount) -> El {
	col()
		.key("onboarding-connect-account")
		.w(ACCOUNT_CARD_WIDTH)
		.shrink()
		.items_center()
		.gap(SPACING * 1.5)
		.padding(ACCOUNT_CARD_INSET)
		.radius(RADIUS_2XL)
		.border(1.0, t.border)
		.fill(t.card)
		.child(
			el().size(INITIALS_SIDE, INITIALS_SIDE)
				.mb(SPACING * 2.5)
				.radius(INITIALS_SIDE / 2.0)
				.fill(t.muted)
				.center()
				.a11y_hidden()
				.child(text(account.initials.to_owned()).font(TEXT_INITIALS).color(t.foreground)),
		)
		.child(centred(text(account.email.to_owned()).font(TEXT_BASE_SEMIBOLD).color(t.foreground)))
		.child(
			text(say(onboarding::connect::FOUND_IN, language, &[("plan", account.plan)]))
				.font(TEXT_XS)
				.color(t.muted_foreground),
		)
}
