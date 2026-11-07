use super::contract::{Space, SpaceError};
use crate::core_context::Core;
use crate::db;

pub async fn list_spaces(core: &Core) -> Result<Vec<Space>, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database =
		state.as_ref().map_err(|failure| SpaceError::Unavailable { failure: failure.into() })?;
	let stored = database.spaces().list().await?;
	let hostings = database.space_hosting().hostings().await?;
	Ok(stored.into_iter().map(|space| Space::presented(space, &hostings)).collect())
}
