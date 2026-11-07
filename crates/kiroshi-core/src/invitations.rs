pub mod commands;
pub mod contract;
#[cfg(test)]
mod tests;

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tokio::task::JoinHandle;
use tokio::time::{interval, MissedTickBehavior};

use crate::account::cloud::{Cloud, InvitationCallError, JoinedInstance, ListedInvitation};
use crate::account::session::{self, AccountSession};
use crate::db::repositories::joined_spaces::HostListing;
use crate::events::INVITATION_CHANGED;
use crate::joined_spaces;
use crate::joined_spaces::contract::{JoinedSpace, JoinedSpaceError};
use contract::{Invitation, InvitationError, InvitationsChanged};

const INVITATIONS_EVERY: Duration = Duration::from_secs(30);

pub struct Invitations {
	cloud: Cloud,
	every: Duration,
	last: Mutex<Option<Vec<ListedInvitation>>>,
	poll: Mutex<Option<JoinHandle<()>>>,
	turn: tokio::sync::Mutex<()>,
}

impl Invitations {
	pub fn new(api_url: &str) -> Self {
		Self {
			cloud: Cloud::new(api_url),
			every: INVITATIONS_EVERY,
			last: Mutex::new(None),
			poll: Mutex::new(None),
			turn: tokio::sync::Mutex::new(()),
		}
	}

	#[cfg(test)]
	pub fn polling_every(self, every: Duration) -> Self {
		Self { every, ..self }
	}

	fn last(&self) -> MutexGuard<'_, Option<Vec<ListedInvitation>>> {
		self.last.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn poll(&self) -> MutexGuard<'_, Option<JoinHandle<()>>> {
		self.poll.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn listed(&self, invitation_id: &str) -> Option<ListedInvitation> {
		self.last().iter().flatten().find(|listed| listed.invitation.id == invitation_id).cloned()
	}

	fn invited(&self, invitation_id: &str) -> Option<JoinedInstance> {
		self.listed(invitation_id).map(|listed| JoinedInstance {
			instance_id: listed.invitation.instance_id,
			name: listed.invitation.instance_name,
		})
	}
}

pub async fn read(core: &crate::core_context::Core) -> Result<Vec<Invitation>, InvitationError> {
	let invitations = core.state::<Invitations>();
	let _turn = invitations.turn.lock().await;
	let bearer = bearer_of(core)?;
	let listed = invitations
		.cloud
		.invitations(&bearer)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	if invitations.last().as_ref() != Some(&listed) {
		announced(core, &invitations, listed.clone());
	}
	Ok(listed.into_iter().map(|listed| listed.invitation).collect())
}

pub async fn accept(
	core: &crate::core_context::Core,
	invitation_id: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let accepted = accepted(core, &invitation_id).await?;
	let invitation = core.state::<Invitations>().listed(&invitation_id);
	let (inviter_email, listing) = match invitation {
		Some(listed) => (Some(listed.invitation.inviter_email), listed.listing),
		None => (None, HostListing::default()),
	};
	let joined = joined_spaces::join::joined(
		core,
		accepted.instance_id,
		accepted.name,
		inviter_email,
		listing,
	)
	.await;
	reread(core).await;
	joined
}

async fn accepted(
	core: &crate::core_context::Core,
	invitation_id: &str,
) -> Result<JoinedInstance, JoinedSpaceError> {
	let invitations = core.state::<Invitations>();
	let bearer = bearer_of(core).map_err(|failure| match failure {
		InvitationError::NotSignedIn => JoinedSpaceError::NeedsSignIn,
		failure => JoinedSpaceError::SessionStore { detail: format!("{failure:?}") },
	})?;
	match invitations.cloud.accept_invitation(&bearer, invitation_id).await {
		Ok(accepted) => Ok(accepted),
		Err(InvitationCallError::AlreadyJoined) => {
			invitations.invited(invitation_id).ok_or_else(|| JoinedSpaceError::CouldNotAccept {
				detail: format!(
					"invitation {invitation_id} was already accepted and is not listed"
				),
			})
		}
		Err(failure) => {
			signed_out_if_revoked(core, &bearer, &failure);
			Err(acceptance_refused(failure))
		}
	}
}

fn acceptance_refused(failure: InvitationCallError) -> JoinedSpaceError {
	match failure {
		InvitationCallError::Revoked => JoinedSpaceError::SessionRevoked,
		InvitationCallError::Expired => JoinedSpaceError::InvitationExpired,
		InvitationCallError::Withdrawn => JoinedSpaceError::InvitationWithdrawn,
		InvitationCallError::Used => JoinedSpaceError::InvitationUsed,
		InvitationCallError::OtherEmail => JoinedSpaceError::InvitationOtherEmail,
		InvitationCallError::Unknown => JoinedSpaceError::NoInvitation { inviter_email: None },
		InvitationCallError::Offline(detail) | InvitationCallError::Unreachable(detail) => {
			JoinedSpaceError::CouldNotAccept { detail }
		}
		InvitationCallError::AlreadyJoined => JoinedSpaceError::CouldNotAccept {
			detail: "the cloud answered already joined".to_owned(),
		},
	}
}

pub async fn decline(
	core: &crate::core_context::Core,
	invitation_id: String,
) -> Result<(), InvitationError> {
	let bearer = bearer_of(core)?;
	core.state::<Invitations>()
		.cloud
		.decline_invitation(&bearer, &invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	reread(core).await;
	Ok(())
}

async fn reread(core: &crate::core_context::Core) {
	if let Err(failure) = read(core).await {
		eprintln!("the invitations were not read back: {failure:?}");
	}
}

pub fn resumed(core: &crate::core_context::Core) {
	let Some(invitations) = core.try_state::<Invitations>() else {
		return;
	};
	let mut poll = invitations.poll();
	if poll.is_none() {
		*poll = Some(core.spawn(polled(core.clone())));
	}
}

async fn polled(core: crate::core_context::Core) {
	let mut polls = interval(core.state::<Invitations>().every);
	polls.set_missed_tick_behavior(MissedTickBehavior::Delay);
	loop {
		polls.tick().await;
		core.state::<Invitations>().cloud.unpaused().await;
		if let Err(failure) = read(&core).await {
			eprintln!("the invitations were not polled: {failure:?}");
		}
		joined_spaces::relay::reconciled(&core).await;
	}
}

pub async fn signed_out(core: &crate::core_context::Core) {
	let Some(invitations) = core.try_state::<Invitations>() else {
		return;
	};
	let poll = invitations.poll().take();
	if let Some(poll) = poll {
		poll.abort();
		if let Err(error) = poll.await {
			if !error.is_cancelled() {
				eprintln!("the invitation poll ended abnormally: {error}");
			}
		}
	}
	let _turn = invitations.turn.lock().await;
	announced(core, &invitations, Vec::new());
}

fn signed_out_if_revoked(
	core: &crate::core_context::Core,
	bearer: &str,
	failure: &InvitationCallError,
) {
	if matches!(failure, InvitationCallError::Revoked) {
		session::revoked(core, bearer);
	}
}

fn bearer_of(core: &crate::core_context::Core) -> Result<String, InvitationError> {
	match core.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(InvitationError::NotSignedIn),
		Err(error) => Err(InvitationError::Storage { detail: format!("{error:?}") }),
	}
}

fn announced(
	core: &crate::core_context::Core,
	invitations: &Invitations,
	listed: Vec<ListedInvitation>,
) {
	let shown = listed.iter().map(|listed| listed.invitation.clone()).collect();
	*invitations.last() = Some(listed);
	let changed = InvitationsChanged { invitations: shown };
	if let Err(error) = core.emit(INVITATION_CHANGED, changed) {
		eprintln!("the invitations did not reach the front: {error}");
	}
}
