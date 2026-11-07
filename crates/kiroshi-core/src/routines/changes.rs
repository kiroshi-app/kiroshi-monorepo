use super::contract::{RoutineChanged, RoutineError};
use crate::core_context::Core;
use crate::events::ROUTINE_CHANGED;

pub fn announce_change(core: &Core, conversation_id: &str) -> Result<(), RoutineError> {
	core.emit(ROUTINE_CHANGED, RoutineChanged { conversation_id: conversation_id.to_owned() })
		.map_err(|error| RoutineError::Undeliverable { detail: error.to_string() })
}
