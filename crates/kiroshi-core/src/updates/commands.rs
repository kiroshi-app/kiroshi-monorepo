use super::contract::{ReleaseNotes, ReleaseNotesError, UpdateChannel, UpdateState, WhatsNewError};
use super::engine::{self, Updates};
use super::release_notes;
use super::whats_new::{due, Due};
use crate::agent::AgentState;
use crate::core_context::Core;
use crate::db::{self, Database};

pub fn update_state(core: &Core) -> UpdateState {
	core.state::<Updates>().state()
}

pub async fn check_for_updates(core: &Core) -> UpdateState {
	let channel = current_channel(core).await;
	engine::check(core, channel).await
}

pub async fn install_update(core: &Core) -> UpdateState {
	engine::install(core).await
}

pub fn running_companions(core: &Core) -> usize {
	core.state::<AgentState>().live_session_count()
}

pub fn restart_to_update(core: &Core) -> UpdateState {
	engine::restart(core)
}

pub async fn release_notes(
	core: &Core,
	version: String,
) -> Result<ReleaseNotes, ReleaseNotesError> {
	let releases_by_tag = core.state::<Updates>().source().releases_by_tag.clone();
	let cache = core.data_dir().join(release_notes::DIR_NAME);
	release_notes::release_notes(&cache, &version, |version| {
		release_notes::fetched(releases_by_tag, version)
	})
	.await
}

pub async fn whats_new(core: &Core) -> Result<Option<ReleaseNotes>, WhatsNewError> {
	let running_version = running_version(core);
	let state = core.state::<db::DatabaseState>();
	let database = opened(&state)?;
	let preferences = database.user().preferences().await?;
	match due(&preferences, &running_version) {
		Due::Notes => Ok(Some(release_notes(core, running_version).await?)),
		Due::MarkSeen => {
			database.user().mark_version_seen(running_version).await?;
			Ok(None)
		}
		Due::Nothing => Ok(None),
	}
}

pub async fn acknowledge_whats_new(core: &Core) -> Result<(), WhatsNewError> {
	let running_version = running_version(core);
	let state = core.state::<db::DatabaseState>();
	opened(&state)?.user().mark_version_seen(running_version).await?;
	Ok(())
}

fn running_version(core: &Core) -> String {
	core.state::<Updates>().running().version.to_string()
}

fn opened(state: &db::DatabaseState) -> Result<&Database, WhatsNewError> {
	state.as_ref().map_err(|failure| WhatsNewError::Unavailable { failure: failure.into() })
}

async fn current_channel(core: &Core) -> Result<UpdateChannel, String> {
	let state = core.state::<db::DatabaseState>();
	let database = state.as_ref().map_err(|failure| format!("{failure:?}"))?;
	let preferences = database.user().preferences().await.map_err(|error| format!("{error:?}"))?;
	Ok(preferences.update_channel.into())
}
