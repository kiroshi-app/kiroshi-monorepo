use rune::{El, col, el, icon, row, text};

use super::{Emit, Frame, centred, link, onboarding_shell, secondary};
use crate::avatar::initials_of;
use crate::icons;
use crate::primitives::badge::{BadgeVariant, badge};
use crate::primitives::button::{Button, ButtonSize, ButtonVariant};
use crate::strings::Language;
use crate::strings::settings::account;
use crate::tokens::{
	RADIUS_XL, SPACING, TEXT_COMPACT, TEXT_SM, TEXT_SM_MEDIUM, TEXT_TITLE, TEXT_XS, Tokens,
};

const RING: f32 = SPACING * 32.0;
const INTRO_WIDTH: f32 = SPACING * 105.0;
const CARD_WIDTH: f32 = SPACING * 110.0;
const CARD_INSET: f32 = SPACING * 3.5;
const PERSON_SIDE: f32 = SPACING * 10.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Plan {
	Pro,
	Free,
}

pub enum AccountState<'a> {
	SignedOut,
	Waiting,
	SignedIn { name: &'a str, email: &'a str, plan: Option<Plan> },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccountEvent {
	SignIn,
	Cancel,
	CopySignInLink,
	Skip,
	Continue,
}

pub fn account_screen<S: 'static>(
	t: &Tokens,
	language: Language,
	hue: Option<f32>,
	state: &AccountState,
	emit: Emit<S, AccountEvent>,
) -> El {
	let t = &t.in_space(hue);
	let words = |key: crate::strings::Key| key.text(language);
	let (title, body) = match state {
		AccountState::SignedIn { .. } => {
			(account::onboarding::signed_in::TITLE, account::onboarding::signed_in::BODY)
		}
		AccountState::SignedOut | AccountState::Waiting => {
			(account::signed_out::TITLE, account::onboarding::BODY)
		}
	};
	let intro = col()
		.items_center()
		.gap(SPACING * 8.0)
		.child(icon(&icons::KIROSHI_RING, RING).color(t.foreground).a11y_hidden())
		.child(
			col()
				.w(INTRO_WIDTH)
				.shrink()
				.items_center()
				.gap(SPACING * 2.0)
				.child(
					centred(text(words(title).to_owned()).font(TEXT_TITLE).color(t.foreground))
						.role("heading"),
				)
				.child(centred(
					text(words(body).to_owned()).font(TEXT_SM).color(t.muted_foreground),
				)),
		);
	let mut content = vec![intro];
	let controls = match state {
		AccountState::SignedIn { name, email, plan } => {
			content.push(card(t, language, name, email, *plan));
			vec![action(
				t,
				Button::new(words(account::onboarding::signed_in::CONTINUE)),
				emit,
				AccountEvent::Continue,
			)]
		}
		AccountState::SignedOut => vec![
			action(
				t,
				Button::new(words(account::signed_out::SIGN_IN)).trailing(&icons::EXTERNAL_LINK),
				emit,
				AccountEvent::SignIn,
			),
			secondary(t, words(account::onboarding::SKIP), emit, AccountEvent::Skip),
		],
		AccountState::Waiting => vec![
			waiting(t, language, emit),
			secondary(t, words(account::onboarding::SKIP), emit, AccountEvent::Skip),
		],
	};
	onboarding_shell(
		t,
		Frame { content_gap: SPACING * 5.0, content_bottom: 0.0 },
		content,
		controls,
	)
}

fn action<S: 'static>(
	t: &Tokens,
	button: Button,
	emit: Emit<S, AccountEvent>,
	event: AccountEvent,
) -> El {
	button.size(ButtonSize::Lg).view(t).on_press(move |s: &mut S| emit(s, event))
}

fn waiting<S: 'static>(t: &Tokens, language: Language, emit: Emit<S, AccountEvent>) -> El {
	let words = |key: crate::strings::Key| key.text(language);
	let busy = Button::new(words(account::waiting::LABEL))
		.leading(&icons::LOADER_CIRCLE)
		.size(ButtonSize::Lg)
		.disabled(true)
		.view(t)
		.a11y_value("busy");
	let cancel = action(
		t,
		Button::new(words(account::waiting::CANCEL)).variant(ButtonVariant::Outline),
		emit,
		AccountEvent::Cancel,
	);
	col()
		.items_center()
		.gap(SPACING * 2.0)
		.child(
			row()
				.flex_wrap()
				.justify_center()
				.center_y()
				.gap(SPACING * 2.0)
				.child(busy)
				.child(cancel),
		)
		.child(
			text(words(account::waiting::CAPTION).to_owned())
				.font(TEXT_XS)
				.color(t.muted_foreground),
		)
		.child(
			row()
				.flex_wrap()
				.justify_center()
				.center_y()
				.gap(SPACING)
				.child(
					text(words(account::waiting::BROWSER_DID_NOT_OPEN).to_owned())
						.font(TEXT_XS)
						.color(t.muted_foreground),
				)
				.child(link(
					t,
					words(account::waiting::COPY_SIGN_IN_LINK),
					TEXT_XS,
					t.foreground,
					emit,
					AccountEvent::CopySignInLink,
				)),
		)
}

fn card(t: &Tokens, language: Language, name: &str, email: &str, plan: Option<Plan>) -> El {
	let person = el()
		.size(PERSON_SIDE, PERSON_SIDE)
		.radius(PERSON_SIDE / 2.0)
		.fill(t.person_avatar)
		.center()
		.a11y_hidden()
		.child(text(initials_of(name)).font(TEXT_SM_MEDIUM).color(t.foreground));
	let mut card = row()
		.key("account-card")
		.w(CARD_WIDTH)
		.shrink()
		.center_y()
		.gap(SPACING * 3.0)
		.padding(CARD_INSET)
		.radius(RADIUS_XL)
		.border(1.0, t.border)
		.child(person)
		.child(
			col()
				.grow(1.0)
				.shrink()
				.child(
					text(name.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).wrap_anywhere(),
				)
				.child(
					text(email.to_owned())
						.font(TEXT_COMPACT)
						.color(t.muted_foreground)
						.wrap_anywhere(),
				),
		);
	if let Some(plan) = plan {
		let mut tags = row().center_y().gap(SPACING * 1.5);
		let label = match plan {
			Plan::Pro => {
				tags = tags.child(badge(
					t,
					account::signed_in::plan::BETA.text(language),
					BadgeVariant::Secondary,
				));
				account::signed_in::plan::PRO
			}
			Plan::Free => account::signed_in::plan::FREE,
		};
		card = card.child(
			tags.child(text(label.text(language).to_owned()).font(TEXT_SM).color(t.foreground)),
		);
	}
	card
}
