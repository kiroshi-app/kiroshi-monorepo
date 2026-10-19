pub mod commands;
pub mod contract;

use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use tauri::async_runtime::JoinHandle;
use tauri::{AppHandle, Manager, Runtime};
use tokio::time::{interval, MissedTickBehavior};

use crate::account::cloud::{Cloud, InvitationCallError, JoinedInstance};
use crate::account::session::{self, AccountSession};
use crate::events::{self, INVITATION_CHANGED};
use crate::joined_spaces;
use crate::joined_spaces::contract::{JoinedSpace, JoinedSpaceError};
use contract::{Invitation, InvitationError, InvitationsChanged};

const INVITATIONS_EVERY: Duration = Duration::from_secs(30);

pub struct Invitations {
	cloud: Cloud,
	every: Duration,
	last: Mutex<Option<Vec<Invitation>>>,
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
	pub(crate) fn polling_every(self, every: Duration) -> Self {
		Self { every, ..self }
	}

	fn last(&self) -> MutexGuard<'_, Option<Vec<Invitation>>> {
		self.last.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn poll(&self) -> MutexGuard<'_, Option<JoinHandle<()>>> {
		self.poll.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn invited(&self, invitation_id: &str) -> Option<JoinedInstance> {
		self.last().iter().flatten().find(|invitation| invitation.id == invitation_id).map(
			|invitation| JoinedInstance {
				instance_id: invitation.instance_id.clone(),
				name: invitation.instance_name.clone(),
			},
		)
	}
}

pub async fn read<R: Runtime>(app: &AppHandle<R>) -> Result<Vec<Invitation>, InvitationError> {
	let invitations = app.state::<Invitations>();
	let _turn = invitations.turn.lock().await;
	let bearer = bearer_of(app)?;
	let listed = invitations
		.cloud
		.invitations(&bearer)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	if invitations.last().as_ref() != Some(&listed) {
		announced(app, &invitations, listed.clone());
	}
	Ok(listed)
}

pub async fn accept<R: Runtime>(
	app: &AppHandle<R>,
	invitation_id: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let accepted = accepted(app, &invitation_id).await?;
	let joined = joined_spaces::join::joined(app, accepted.instance_id, accepted.name).await;
	reread(app).await;
	joined
}

async fn accepted<R: Runtime>(
	app: &AppHandle<R>,
	invitation_id: &str,
) -> Result<JoinedInstance, JoinedSpaceError> {
	let invitations = app.state::<Invitations>();
	let bearer = bearer_of(app).map_err(|failure| match failure {
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
			signed_out_if_revoked(app, &bearer, &failure);
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

pub async fn decline<R: Runtime>(
	app: &AppHandle<R>,
	invitation_id: String,
) -> Result<(), InvitationError> {
	let bearer = bearer_of(app)?;
	app.state::<Invitations>()
		.cloud
		.decline_invitation(&bearer, &invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	reread(app).await;
	Ok(())
}

async fn reread<R: Runtime>(app: &AppHandle<R>) {
	if let Err(failure) = read(app).await {
		eprintln!("the invitations were not read back: {failure:?}");
	}
}

pub fn resumed<R: Runtime>(app: &AppHandle<R>) {
	let Some(invitations) = app.try_state::<Invitations>() else {
		return;
	};
	let mut poll = invitations.poll();
	if poll.is_none() {
		*poll = Some(tauri::async_runtime::spawn(polled(app.clone())));
	}
}

async fn polled<R: Runtime>(app: AppHandle<R>) {
	let mut polls = interval(app.state::<Invitations>().every);
	polls.set_missed_tick_behavior(MissedTickBehavior::Delay);
	loop {
		polls.tick().await;
		if let Err(failure) = read(&app).await {
			eprintln!("the invitations were not polled: {failure:?}");
		}
		joined_spaces::relay::reconciled(&app).await;
	}
}

pub async fn signed_out<R: Runtime>(app: &AppHandle<R>) {
	let Some(invitations) = app.try_state::<Invitations>() else {
		return;
	};
	let poll = invitations.poll().take();
	if let Some(poll) = poll {
		poll.abort();
		if let Err(error) = poll.await {
			if !matches!(&error, tauri::Error::JoinError(joined) if joined.is_cancelled()) {
				eprintln!("the invitation poll ended abnormally: {error}");
			}
		}
	}
	let _turn = invitations.turn.lock().await;
	announced(app, &invitations, Vec::new());
}

fn signed_out_if_revoked<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	failure: &InvitationCallError,
) {
	if matches!(failure, InvitationCallError::Revoked) {
		session::revoked(app, bearer);
	}
}

fn bearer_of<R: Runtime>(app: &AppHandle<R>) -> Result<String, InvitationError> {
	match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(InvitationError::NotSignedIn),
		Err(error) => Err(InvitationError::Storage { detail: format!("{error:?}") }),
	}
}

fn announced<R: Runtime>(app: &AppHandle<R>, invitations: &Invitations, listed: Vec<Invitation>) {
	*invitations.last() = Some(listed.clone());
	let changed = InvitationsChanged { invitations: listed };
	if let Err(error) = events::emit(app, INVITATION_CHANGED, changed) {
		eprintln!("the invitations did not reach the front: {error}");
	}
}

#[cfg(test)]
mod tests;
