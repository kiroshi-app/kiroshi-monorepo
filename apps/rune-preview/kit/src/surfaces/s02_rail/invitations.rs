use rune::{Cursor, El, col, el, icon, row, text};

use super::picker::{PickerMessage, sends, separator};
use super::space_avatar::{SpaceAvatar, SpaceAvatarSize, SpaceAvatarState};
use super::{Emit, said};
use crate::icons;
use crate::primitives::button::ButtonVariant;
use crate::primitives::{DISABLED_OPACITY, equal_padding, instant, ring_tint, tight};
use crate::strings::{Language, bots};
use crate::tokens::{
	RADIUS_CONTROL, RADIUS_XL, SPACING, TEXT_COMPACT_MEDIUM, TEXT_SM, TEXT_XS, Tokens,
};

const ROW_INSET: f32 = SPACING * 2.0;
const ROW_GAP: f32 = SPACING * 2.0;
const HEADING_GAP: f32 = SPACING * 2.0;
const AVATAR_DROP: f32 = SPACING * 0.75;
const INDENT: f32 = SPACING * 5.5;
const LINE_GAP: f32 = SPACING * 1.5;
const CAUSE_GLYPH: f32 = SPACING * 3.5;
const NOTE_SLOT: (f32, f32) = (SPACING * 3.5, SPACING * 4.0);
const NOTE_DOT: f32 = SPACING * 1.75;
const ACTION_HEIGHT: f32 = SPACING * 7.0;
const ACTION_GAP: f32 = SPACING * 2.0;
const BUSY_OPACITY: f32 = 0.7;
const LABEL_HEIGHT: f32 = SPACING * 6.0;
const ACTION_RING: f32 = 3.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvitationFailure {
	Servers,
	Offline,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum InvitationState<'a> {
	Waiting,
	Accepting,
	Withdrawn,
	HostOffline,
	Expired { on: &'a str },
	Failed(InvitationFailure),
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct SpaceInvitation<'a> {
	pub id: &'a str,
	pub name: &'a str,
	pub colour: Option<f32>,
	pub host_email: &'a str,
	pub host_name: Option<&'a str>,
	pub expires: Option<&'a str>,
	pub state: InvitationState<'a>,
}

impl SpaceInvitation<'_> {
	fn is_closed(&self) -> bool {
		matches!(self.state, InvitationState::Withdrawn | InvitationState::Expired { .. })
	}

	fn is_muted(&self) -> bool {
		self.is_closed() || self.state == InvitationState::HostOffline
	}

	fn is_failed(&self) -> bool {
		matches!(self.state, InvitationState::Failed(_))
	}

	fn cause(&self, language: Language) -> Option<String> {
		use bots::spaces::invitations as copy;
		Some(match self.state {
			InvitationState::Failed(InvitationFailure::Servers) => {
				copy::failed::SERVERS.text(language).to_owned()
			}
			InvitationState::Failed(InvitationFailure::Offline) => {
				copy::failed::OFFLINE.text(language).to_owned()
			}
			InvitationState::Withdrawn => {
				said(language, copy::WITHDRAWN, &[("email", self.host_email)])
			}
			InvitationState::Expired { on } => {
				said(language, copy::EXPIRED, &[("date", on), ("email", self.host_email)])
			}
			_ => return None,
		})
	}
}

pub(super) fn invitations<S: 'static, M: 'static>(
	t: &Tokens,
	language: Language,
	invitations: &[SpaceInvitation],
	focused: Option<&str>,
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
) -> Vec<El> {
	if invitations.is_empty() {
		return Vec::new();
	}
	let style = tight(TEXT_XS);
	let label = row().padding(equal_padding(LABEL_HEIGHT, style.size)).child(
		text(bots::spaces::invitations::LABEL.text(language).to_owned())
			.font(style)
			.color(t.muted_foreground),
	);
	let rows = invitations.iter().map(|invitation| {
		row_view(t, language, invitation, focused == Some(invitation.id), emit, wrap)
	});
	vec![
		separator(t),
		col()
			.role("group")
			.label(bots::spaces::invitations::LABEL.text(language))
			.child(label)
			.children(rows),
	]
}

fn row_view<S: 'static, M: 'static>(
	t: &Tokens,
	language: Language,
	invitation: &SpaceInvitation,
	is_focused_on_open: bool,
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
) -> El {
	let cause = invitation.cause(language);
	let mut details = col().gap(ROW_GAP).child(heading(t, language, invitation));
	if invitation.state == InvitationState::HostOffline {
		details = details.child(note(t, language, invitation));
	}
	if let Some(cause) = &cause {
		details = details.child(cause_line(t, cause));
	}
	let shell = col()
		.key(format!("space-invitation-{}", invitation.id))
		.padding(ROW_INSET)
		.label(invitation.name);
	if invitation.is_closed() {
		return instant(
			shell
				.radius(RADIUS_XL)
				.role("menuitem")
				.description(cause.unwrap_or_default())
				.child(details),
		)
		.focusable(true)
		.cursor(Cursor::Default)
		.focus_highlight(t.accent);
	}
	let described = invitation.is_failed() || invitation.state == InvitationState::HostOffline;
	let mut shell = shell.gap(ROW_GAP).role("group").child(details).child(actions(
		t,
		language,
		invitation,
		is_focused_on_open,
		emit,
		wrap,
	));
	if described {
		shell = shell.description(cause.unwrap_or_else(|| note_text(language, invitation)));
	}
	shell
}

fn heading(t: &Tokens, language: Language, invitation: &SpaceInvitation) -> El {
	let avatar = SpaceAvatar {
		space_id: invitation.id,
		name: invitation.name,
		colour: if invitation.is_muted() { None } else { invitation.colour },
		size: SpaceAvatarSize::Px14,
		state: if invitation.state == InvitationState::Accepting {
			SpaceAvatarState::Joining
		} else {
			SpaceAvatarState::Invitation
		},
		has_attention: false,
	}
	.draw(t)
	.mt(AVATAR_DROP);
	let name_ink = if invitation.is_muted() { t.muted_foreground } else { t.foreground };
	let mut lines = col()
		.min_w(0.0)
		.shrink()
		.child(text(invitation.name.to_owned()).font(TEXT_SM).color(name_ink).wrap_anywhere())
		.child(host_line(
			t,
			said(
				language,
				bots::spaces::invitations::INVITED_BY,
				&[("email", invitation.host_email)],
			),
		));
	if let Some(expires) =
		invitation.expires.filter(|_| !invitation.is_muted() && !invitation.is_failed())
	{
		lines = lines.child(host_line(
			t,
			said(language, bots::spaces::invitations::EXPIRES, &[("date", expires)]),
		));
	}
	row().gap(HEADING_GAP).items_start().child(avatar).child(lines)
}

fn host_line(t: &Tokens, line: String) -> El {
	text(line).font(TEXT_XS).color(t.muted_foreground).wrap_anywhere()
}

fn note_text(language: Language, invitation: &SpaceInvitation) -> String {
	let host = invitation.host_name.unwrap_or(invitation.host_email);
	said(language, bots::spaces::invitations::HOST_OFFLINE, &[("host", host)])
}

fn note(t: &Tokens, language: Language, invitation: &SpaceInvitation) -> El {
	let slot = row()
		.size(NOTE_SLOT.0, NOTE_SLOT.1)
		.center()
		.child(el().size(NOTE_DOT, NOTE_DOT).radius(NOTE_DOT / 2.0).fill(t.presence_offline));
	row().pl(INDENT).gap(LINE_GAP).items_start().child(slot).child(
		text(note_text(language, invitation))
			.font(TEXT_XS)
			.color(t.muted_foreground)
			.wrap_anywhere()
			.shrink(),
	)
}

fn cause_line(t: &Tokens, cause: &str) -> El {
	row()
		.pl(INDENT)
		.gap(LINE_GAP)
		.items_start()
		.child(icon(&icons::TRIANGLE_ALERT, CAUSE_GLYPH).color(t.destructive).a11y_hidden())
		.child(text(cause.to_owned()).font(TEXT_XS).color(t.destructive).wrap_anywhere().shrink())
}

fn actions<S: 'static, M: 'static>(
	t: &Tokens,
	language: Language,
	invitation: &SpaceInvitation,
	is_focused_on_open: bool,
	emit: Emit<S, M>,
	wrap: fn(PickerMessage) -> M,
) -> El {
	use bots::spaces::invitations as copy;
	let id = invitation.id.to_owned();
	let (primary_label, primary_message) = match invitation.state {
		InvitationState::Accepting => (copy::JOINING, PickerMessage::AcceptInvitation(id.clone())),
		InvitationState::Failed(_) => (copy::RETRY, PickerMessage::RetryInvitation(id.clone())),
		_ => (copy::ACCEPT, PickerMessage::AcceptInvitation(id.clone())),
	};
	let primary_inert = match invitation.state {
		InvitationState::Accepting => Some(BUSY_OPACITY),
		InvitationState::HostOffline => Some(DISABLED_OPACITY),
		_ => None,
	};
	let decline_inert =
		(invitation.state == InvitationState::Accepting).then_some(DISABLED_OPACITY);
	let primary = action(t, ButtonVariant::Default, primary_label.text(language), primary_inert)
		.focus_selected(is_focused_on_open);
	let primary = if primary_inert.is_some() {
		primary
	} else {
		primary.on_press(sends(emit, wrap, primary_message))
	};
	let decline = action(t, ButtonVariant::Outline, copy::DECLINE.text(language), decline_inert);
	let decline = if decline_inert.is_some() {
		decline
	} else {
		decline.on_press(sends(emit, wrap, PickerMessage::DeclineInvitation(id)))
	};
	row().pl(INDENT).gap(ACTION_GAP).child(primary).child(decline)
}

fn action(t: &Tokens, variant: ButtonVariant, label: &str, inert: Option<f32>) -> El {
	let style = tight(TEXT_COMPACT_MEDIUM);
	let paint = variant.paint(t);
	let mut button = row()
		.key(format!("invitation-action-{label}"))
		.padding(equal_padding(ACTION_HEIGHT, style.size))
		.radius(RADIUS_CONTROL)
		.center()
		.role("menuitem")
		.label(label)
		.child(paint.ink(text(label.to_owned()).font(style)));
	if variant == ButtonVariant::Outline {
		button = button.border(1.0, t.border);
	}
	let button = paint.apply(button).focusable(true).cursor(Cursor::Pointer).focus_ring(
		ACTION_RING,
		0.0,
		ring_tint(t, 0.3),
	);
	match inert {
		Some(opacity) => button.disabled(true).opacity(opacity),
		None => button,
	}
}
