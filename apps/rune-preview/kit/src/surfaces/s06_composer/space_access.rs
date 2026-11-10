use rune::{El, Icon, col, icon, row, text};

use super::filled;
use crate::icons::{BRACKET_ARROW_RIGHT, CLOCK};
use crate::strings::bots::spaces::removed;
use crate::strings::chat::space_access_banner::offline;
use crate::strings::{Key, Language};
use crate::tokens::{SPACING, TEXT_COMPACT, TEXT_SM_SEMIBOLD, Tokens};

const RADIUS: f32 = 20.0;
const MARK: f32 = SPACING * 4.5;
const GAP: f32 = SPACING * 3.5;
const INSET_Y: f32 = SPACING * 3.5;
const INSET_START: f32 = SPACING * 4.5;
const INSET_END: f32 = SPACING * 3.5;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum AccessReason {
	Removed,
	Deleted,
	Unknown,
	Offline(Option<WaitReason>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WaitReason {
	RelayUnreachable,
	RekeySendFailed,
	HostSilent,
	SocketClosed,
	RekeyNotVerified,
	NotMember,
	UnknownInstance,
	DeviceKeysUnreadable,
	DeviceAwaitingApproval,
	SocketUrlFailed,
	RosterMissing,
	KeychainReadFailed,
}

impl WaitReason {
	fn body(self) -> Key {
		match self {
			WaitReason::RelayUnreachable => offline::reasons::RELAY_UNREACHABLE,
			WaitReason::RekeySendFailed => offline::reasons::REKEY_SEND_FAILED,
			WaitReason::HostSilent => offline::reasons::HOST_SILENT,
			WaitReason::SocketClosed => offline::reasons::SOCKET_CLOSED,
			WaitReason::RekeyNotVerified => offline::reasons::REKEY_NOT_VERIFIED,
			WaitReason::NotMember => offline::reasons::NOT_MEMBER,
			WaitReason::UnknownInstance => offline::reasons::UNKNOWN_INSTANCE,
			WaitReason::DeviceKeysUnreadable => offline::reasons::DEVICE_KEYS_UNREADABLE,
			WaitReason::DeviceAwaitingApproval => offline::reasons::DEVICE_AWAITING_APPROVAL,
			WaitReason::SocketUrlFailed => offline::reasons::SOCKET_URL_FAILED,
			WaitReason::RosterMissing => offline::reasons::ROSTER_MISSING,
			WaitReason::KeychainReadFailed => offline::reasons::KEYCHAIN_READ_FAILED,
		}
	}
}

impl AccessReason {
	fn mark(self) -> &'static Icon {
		match self {
			AccessReason::Offline(_) => &CLOCK,
			AccessReason::Removed | AccessReason::Deleted | AccessReason::Unknown => {
				&BRACKET_ARROW_RIGHT
			}
		}
	}

	fn copy(self) -> (Key, Key) {
		match self {
			AccessReason::Removed => (removed::MEMBER_NOTICE, removed::MEMBER_NOTICE_DESCRIPTION),
			AccessReason::Deleted => (removed::DELETED_NOTICE, removed::DELETED_NOTICE_DESCRIPTION),
			AccessReason::Unknown => (removed::NOTICE, removed::NOTICE_DESCRIPTION),
			AccessReason::Offline(wait) => {
				(offline::TITLE, wait.map_or(offline::BODY, WaitReason::body))
			}
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SpaceAccess<'a> {
	pub reason: AccessReason,
	pub space: &'a str,
	pub host: &'a str,
}

pub fn space_access_banner(t: &Tokens, language: Language, access: SpaceAccess) -> El {
	let naming = [("host", access.host), ("name", access.space), ("space", access.space)];
	let (title, body) = access.reason.copy();
	let line = |key: Key| filled(key.text(language), &naming);
	row()
		.key("space-access-banner")
		.role("status")
		.w_full()
		.items_center()
		.gap(GAP)
		.py(INSET_Y)
		.pl(INSET_START)
		.pr(INSET_END)
		.radius(RADIUS)
		.fill(t.sidebar)
		.outline(1.0, 0.0, t.border)
		.child(icon(access.reason.mark(), MARK).color(t.foreground).a11y_hidden())
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.child(text(line(title)).font(TEXT_SM_SEMIBOLD).color(t.foreground).wrap_anywhere())
				.child(
					text(line(body)).font(TEXT_COMPACT).color(t.muted_foreground).wrap_anywhere(),
				),
		)
}
