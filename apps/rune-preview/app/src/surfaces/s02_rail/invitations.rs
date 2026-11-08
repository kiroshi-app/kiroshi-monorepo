use std::collections::HashMap;

use kiroshi_core::invitations::contract::Invitation;
use kiroshi_core::joined_spaces::contract::{JoinedSpace, JoinedSpaceState};
use kiroshi_rune_kit::surfaces::s02_rail::{InvitationFailure, InvitationState, SpaceInvitation};

use crate::host::HostError;

const DATE_LENGTH: usize = "2026-01-31".len();

#[derive(Clone, Debug, PartialEq)]
enum Status {
	Accepting(Invitation),
	Admitted { invitation: Invitation, joined_id: String },
	Withdrawn,
	Expired,
	Failed(InvitationFailure),
}

fn refusal_kind(failure: &HostError) -> Option<String> {
	let HostError::CommandFailed { body, .. } = failure else { return None };
	let refusal: serde_json::Value = serde_json::from_str(body).ok()?;
	refusal.get("kind")?.as_str().map(str::to_owned)
}

fn has_refused_as(failure: &HostError, kinds: &[&str]) -> bool {
	refusal_kind(failure).is_some_and(|kind| kinds.contains(&kind.as_str()))
}

pub fn is_signed_out(failure: &HostError) -> bool {
	has_refused_as(failure, &["notSignedIn"])
}

fn identity_of(invitation: &Invitation) -> String {
	format!("{}@{}", invitation.instance_id, invitation.invited_at)
}

fn date_of(invitation: &Invitation) -> &str {
	invitation.expires_at.get(..DATE_LENGTH).unwrap_or(&invitation.expires_at)
}

#[derive(Default)]
pub struct Invitations {
	listed: Vec<Invitation>,
	statuses: HashMap<String, Status>,
	swept: Vec<String>,
}

impl Invitations {
	pub fn listed(&mut self, invitations: Vec<Invitation>) {
		self.listed = invitations;
	}

	fn mark(&mut self, invitation: &Invitation, status: Option<Status>) {
		let identity = identity_of(invitation);
		match status {
			Some(status) => self.statuses.insert(identity, status),
			None => self.statuses.remove(&identity),
		};
	}

	fn unlist(&mut self, invitation: &Invitation) {
		let identity = identity_of(invitation);
		self.listed.retain(|listed| identity_of(listed) != identity);
	}

	fn status_of(&self, invitation: &Invitation) -> Option<&Status> {
		self.statuses.get(&identity_of(invitation))
	}

	fn held(&self) -> impl Iterator<Item = &Invitation> {
		self.statuses.values().filter_map(|status| match status {
			Status::Accepting(invitation) | Status::Admitted { invitation, .. } => Some(invitation),
			Status::Withdrawn | Status::Expired | Status::Failed(_) => None,
		})
	}

	fn is_admitted_online(&self, invitation: &Invitation, joined: &[JoinedSpace]) -> bool {
		let Some(Status::Admitted { joined_id, .. }) = self.status_of(invitation) else {
			return false;
		};
		!joined
			.iter()
			.any(|space| &space.id == joined_id && space.state == JoinedSpaceState::WaitingForHost)
	}

	fn shown<'a>(&'a self, joined: &[JoinedSpace]) -> Vec<&'a Invitation> {
		let kept: Vec<&Invitation> = self
			.listed
			.iter()
			.filter(|invitation| !self.swept.contains(&identity_of(invitation)))
			.collect();
		let still_held: Vec<&Invitation> = self
			.held()
			.filter(|invitation| {
				kept.iter().all(|listed| identity_of(listed) != identity_of(invitation))
			})
			.collect();
		kept.into_iter()
			.chain(still_held)
			.filter(|invitation| !self.is_admitted_online(invitation, joined))
			.collect()
	}

	fn shown_with_id(&self, instance_id: &str, joined: &[JoinedSpace]) -> Option<Invitation> {
		self.shown(joined)
			.into_iter()
			.find(|invitation| invitation.instance_id == instance_id)
			.cloned()
	}

	pub fn accept(&mut self, instance_id: &str, joined: &[JoinedSpace]) -> Option<Invitation> {
		let invitation = self.shown_with_id(instance_id, joined)?;
		if matches!(self.status_of(&invitation), Some(Status::Accepting(_))) {
			return None;
		}
		self.mark(&invitation, Some(Status::Accepting(invitation.clone())));
		Some(invitation)
	}

	pub fn decline(&mut self, instance_id: &str, joined: &[JoinedSpace]) -> Option<Invitation> {
		self.shown_with_id(instance_id, joined)
	}

	pub fn accepted(
		&mut self,
		invitation: &Invitation,
		outcome: Result<JoinedSpace, HostError>,
	) -> Option<HostError> {
		match outcome {
			Ok(joined) => {
				self.unlist(invitation);
				let admitted =
					Status::Admitted { invitation: invitation.clone(), joined_id: joined.id };
				self.mark(invitation, Some(admitted));
				None
			}
			Err(failure) => {
				let status = accept_status_of(&failure);
				self.mark(invitation, status.clone());
				status.is_none().then_some(failure)
			}
		}
	}

	pub fn declined(
		&mut self,
		invitation: &Invitation,
		outcome: Result<(), HostError>,
	) -> Option<HostError> {
		match outcome {
			Ok(()) => {
				self.mark(invitation, None);
				self.unlist(invitation);
				None
			}
			Err(failure) if has_refused_as(&failure, &["withdrawn"]) => {
				self.mark(invitation, Some(Status::Withdrawn));
				None
			}
			Err(failure) => {
				self.mark(invitation, None);
				Some(failure)
			}
		}
	}

	pub fn sweep_withdrawn(&mut self, joined: &[JoinedSpace]) {
		let withdrawn: Vec<String> = self
			.shown(joined)
			.into_iter()
			.filter(|invitation| matches!(self.status_of(invitation), Some(Status::Withdrawn)))
			.map(identity_of)
			.collect();
		for identity in withdrawn {
			self.statuses.remove(&identity);
			self.swept.push(identity);
		}
	}

	pub fn rows<'a>(&'a self, joined: &[JoinedSpace]) -> Vec<SpaceInvitation<'a>> {
		self.shown(joined).into_iter().map(|invitation| self.row_of(invitation)).collect()
	}

	fn row_of<'a>(&'a self, invitation: &'a Invitation) -> SpaceInvitation<'a> {
		let state = match self.status_of(invitation) {
			None => InvitationState::Waiting,
			Some(Status::Accepting(_)) => InvitationState::Accepting,
			Some(Status::Admitted { .. }) => InvitationState::HostOffline,
			Some(Status::Withdrawn) => InvitationState::Withdrawn,
			Some(Status::Expired) => InvitationState::Expired { on: date_of(invitation) },
			Some(Status::Failed(failure)) => InvitationState::Failed(*failure),
		};
		SpaceInvitation {
			id: &invitation.instance_id,
			name: &invitation.instance_name,
			colour: None,
			host_email: &invitation.inviter_email,
			host_name: None,
			expires: Some(date_of(invitation)),
			state,
		}
	}
}

fn accept_status_of(failure: &HostError) -> Option<Status> {
	match refusal_kind(failure)?.as_str() {
		"invitationWithdrawn" | "invitationUsed" => Some(Status::Withdrawn),
		"invitationExpired" => Some(Status::Expired),
		"couldNotAccept" => Some(Status::Failed(InvitationFailure::Servers)),
		"relayUnreachable" => Some(Status::Failed(InvitationFailure::Offline)),
		_ => None,
	}
}
