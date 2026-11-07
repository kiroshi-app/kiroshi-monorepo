use std::sync::Arc;

use super::contract::{
	Application, ApplicationCallError, ApplicationInstall, ApplicationSearch, ApplicationsError,
	InstallRefusal,
};
use super::directory::Directory;
use super::runnable::{refusal, Runners};
use crate::conversations::commands::ready;
use crate::db;
use crate::json::JsonValue;

pub async fn application_catalogue(
	core: &crate::core_context::Core,
) -> Result<Vec<Application>, ApplicationsError> {
	let directory = core.state::<Arc<Directory>>();
	directory.curated().await
}

pub async fn application_search(
	core: &crate::core_context::Core,
	query: String,
) -> Result<ApplicationSearch, ApplicationsError> {
	let directory = core.state::<Arc<Directory>>();
	directory.searched(&query).await
}

pub async fn application_named(
	core: &crate::core_context::Core,
	name: String,
) -> Result<Option<Application>, ApplicationsError> {
	let directory = core.state::<Arc<Directory>>();
	directory.named(&name).await
}

pub async fn application_runnable(config: JsonValue) -> Option<InstallRefusal> {
	refusal(&Runners::default(), &config.0).await
}

pub async fn application_installs(
	core: &crate::core_context::Core,
	conversation_id: String,
) -> Result<Vec<ApplicationInstall>, ApplicationCallError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.application_installs().of_conversation(conversation_id).await?)
}
