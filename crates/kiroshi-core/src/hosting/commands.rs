
use super::contract::{AccountDevices, HostingState, MembersError, SpaceMembers};
use super::{devices, members, Hosting};
use crate::spaces::contract::SpaceError;

pub async fn hosting_start(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::start(core, space_id).await
}

pub async fn hosting_stop(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<HostingState, SpaceError> {
	super::stop(core, space_id).await
}

pub fn hosting_state(core: &crate::core_context::Core, space_id: String) -> HostingState {
	let hosting = core.state::<Hosting>();
	hosting.current(&space_id)
}

pub async fn hosting_members(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::list(core, space_id).await
}

pub async fn hosting_invite_member(
	core: &crate::core_context::Core,
	space_id: String,
	email: String,
) -> Result<SpaceMembers, MembersError> {
	members::invite(core, space_id, email).await
}

pub async fn hosting_withdraw_invitation(
	core: &crate::core_context::Core,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::withdraw(core, space_id, invitation_id).await
}

pub async fn hosting_resend_invitation(
	core: &crate::core_context::Core,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::resend(core, space_id, invitation_id).await
}

pub async fn hosting_remove_member(
	core: &crate::core_context::Core,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::remove(core, space_id, user_id).await
}

pub async fn hosting_invite_member_again(
	core: &crate::core_context::Core,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	members::invite_again(core, space_id, user_id).await
}

pub async fn hosting_devices(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::devices(core, space_id).await
}

pub async fn hosting_remove_device(
	core: &crate::core_context::Core,
	space_id: String,
	device_id: String,
) -> Result<Vec<AccountDevices>, MembersError> {
	devices::remove_device(core, space_id, device_id).await
}
