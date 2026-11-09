use kiroshi_core::agent::contract::ConnectionState as CoreConnectionState;

use kiroshi_rune_kit::surfaces::s01_chrome::ConnectionState;

#[cfg(test)]
mod tests;

pub fn connection_state_of(state: CoreConnectionState) -> ConnectionState {
	match state {
		CoreConnectionState::Checking => ConnectionState::Checking,
		CoreConnectionState::Ready => ConnectionState::Ready,
		CoreConnectionState::Unavailable => ConnectionState::Unavailable,
		CoreConnectionState::Crashed => ConnectionState::Crashed,
	}
}
