use axum::Router;

use crate::account::cloud::api_url;
use crate::core_context::Core;
use crate::crypto::commands::{load, space_keys};
use crate::devices::Devices;
use crate::hosting::{local_api, Hosting};
use crate::invitations::Invitations;
use crate::joined_spaces::relay::RelayGuests;
use crate::routines::webhook::{self, Calls, Webhook};

#[cfg(test)]
mod tests;

pub fn start(core: &Core) {
	started_with(core, crate::host_api::routes);
}

pub fn started_with(core: &Core, host_api: impl FnOnce(&Calls) -> Router<Calls>) {
	core.manage(load(core));
	core.manage(space_keys(core));
	core.manage(webhook::start(core.clone(), host_api));
	let api_url = api_url();
	core.manage(Hosting::new(&api_url, local_api(core)));
	core.manage(Invitations::new(&api_url));
	core.manage(Devices::new(&api_url));
	core.manage(RelayGuests::new(&api_url));
}

pub fn stop(core: &Core) {
	if let Some(webhook) = core.try_state::<Webhook>() {
		webhook.stop();
	}
}
