use super::*;

#[test]
fn every_core_connection_state_has_its_status() {
	let cases = [
		(CoreConnectionState::Checking, ConnectionState::Checking),
		(CoreConnectionState::Ready, ConnectionState::Ready),
		(CoreConnectionState::Unavailable, ConnectionState::Unavailable),
		(CoreConnectionState::Crashed, ConnectionState::Crashed),
	];
	for (core, shown) in cases {
		assert_eq!(connection_state_of(core), shown);
	}
}
