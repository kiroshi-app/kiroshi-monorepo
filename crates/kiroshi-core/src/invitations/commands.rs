
use super::contract::{Invitation, InvitationError};
use crate::joined_spaces::contract::{JoinedSpace, JoinedSpaceError};

pub async fn invitations_list(core: &crate::core_context::Core) -> Result<Vec<Invitation>, InvitationError> {
	super::read(core).await
}

pub async fn invitation_accept(
	core: &crate::core_context::Core,
	invitation_id: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	super::accept(core, invitation_id).await
}

pub async fn invitation_decline(
	core: &crate::core_context::Core,
	invitation_id: String,
) -> Result<(), InvitationError> {
	super::decline(core, invitation_id).await
}
