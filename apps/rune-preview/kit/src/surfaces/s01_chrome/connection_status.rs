use rune::{Cycle, El, el, row};

use super::copy;
use crate::strings::chat::connection;
use crate::strings::{Key, Language};
use crate::tokens::{SPACING, Tokens};

const DOT: f32 = SPACING * 1.5;

const PULSE: Cycle = Cycle {
	period: 2.0,
	phase: 0.0,
	stops: &[(0.0, 1.0), (0.5, 0.5), (1.0, 1.0)],
	still: 1.0,
	fps: 30.0,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConnectionState {
	Checking,
	Ready,
	Unavailable,
	Crashed,
}

impl ConnectionState {
	fn label(self) -> Key {
		match self {
			ConnectionState::Checking => connection::CHECKING,
			ConnectionState::Ready => connection::READY,
			ConnectionState::Unavailable => connection::UNAVAILABLE,
			ConnectionState::Crashed => connection::CRASHED,
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ConnectionStatus<'a> {
	pub name: &'a str,
	pub state: ConnectionState,
	pub version: Option<&'a str>,
}

pub fn connection_status(t: &Tokens, language: Language, status: ConnectionStatus) -> El {
	let label = copy(status.state.label(), language, &[("name", status.name)]);
	let announced = match status.version {
		Some(version) => format!("{label} v{version}"),
		None => label,
	};
	let dot = el().size(DOT, DOT).radius(DOT / 2.0).a11y_hidden();
	let dot = match status.state {
		ConnectionState::Checking if t.reduced_motion => dot.fill(t.muted_foreground),
		ConnectionState::Checking => dot.fill(t.muted_foreground).cycle(PULSE),
		ConnectionState::Ready => dot.fill(t.success),
		ConnectionState::Unavailable | ConnectionState::Crashed => dot.fill(t.destructive),
	};
	row().key("connection-status").role("status").label(announced).child(dot)
}
