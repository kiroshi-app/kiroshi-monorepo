use std::sync::Arc;

use crate::agent::contract::RuntimeScope;
use crate::agent::host::{hosted, SessionHosts};
use crate::agent::session::HostRequests;
use crate::applications::host::ApplicationHost;
use crate::bundles::host::BundleHost;
use crate::core_context::Core;
use crate::library::host::LibraryHost;
use crate::mcp_oauth::reports::StandingHost;
use crate::missions::host::MissionHost;
use crate::routines::host::RoutineHost;

pub struct DesktopHosts;

impl SessionHosts for DesktopHosts {
	fn hosts_for(
		&self,
		core: &Core,
		scope: &RuntimeScope,
		space_id: &str,
	) -> Vec<Arc<dyn HostRequests>> {
		let (conversation_id, bot_id) = (&scope.conversation_id, &scope.bot_id);
		vec![
			hosted(RoutineHost::new(core.clone(), conversation_id.clone(), bot_id.clone())),
			hosted(MissionHost::new(core.clone(), conversation_id.clone(), bot_id.clone())),
			hosted(StandingHost::new(core.clone(), bot_id.clone(), Some(space_id.to_owned()))),
			hosted(ApplicationHost::new(core.clone(), conversation_id.clone(), bot_id.clone())),
			hosted(BundleHost::new(core.clone(), scope.clone())),
			hosted(LibraryHost::new(core.clone(), scope.clone())),
		]
	}
}
