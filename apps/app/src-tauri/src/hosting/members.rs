use std::collections::HashSet;
use std::convert::Infallible;
use std::time::Duration;

use tauri::{AppHandle, Manager, Runtime};
use tokio::time::{interval, MissedTickBehavior};

use super::contract::{Member, MemberStatus, MembersChanged, MembersError, SpaceMembers};
use super::{devices, Hosting};
use crate::account::cloud::MemberCallError;
use crate::account::contract::AccountState;
use crate::account::session::{self, AccountSession};
use crate::db::DatabaseState;
use crate::events::{self, MEMBERS_CHANGED};
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;

pub(crate) const MEMBERS_EVERY: Duration = Duration::from_secs(15);

pub async fn list<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	let listed = listed(app, &space_id, &instance_id).await?;
	announced_if_changed(app, &space_id, listed.clone());
	Ok(listed)
}

pub async fn invite<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	email: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let email = normalized_email(&email).ok_or(MembersError::NotAnEmail)?;
	if is_own_account(app, &email) {
		return Err(MembersError::OwnAccount);
	}
	let bearer = bearer_of(app)?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	app.state::<Hosting>()
		.cloud
		.invite_member(&bearer, &instance_id, &email)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	read_back(app, &space_id, &instance_id).await
}

pub async fn withdraw<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let bearer = bearer_of(app)?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	app.state::<Hosting>()
		.cloud
		.withdraw_invitation(&bearer, &instance_id, &invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	read_back(app, &space_id, &instance_id).await
}

pub async fn resend<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let bearer = bearer_of(app)?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	app.state::<Hosting>()
		.cloud
		.resend_invitation(&bearer, &instance_id, &invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	read_back(app, &space_id, &instance_id).await
}

pub async fn remove<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let bearer = bearer_of(app)?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	let members = cloud_members(app, &bearer, &instance_id).await?;
	let status = members
		.iter()
		.find(|member| member.user_id == user_id)
		.map(|member| member.status)
		.ok_or(MembersError::UnknownMember)?;
	match status {
		MemberStatus::Host => return Err(MembersError::HostNotRemovable),
		MemberStatus::Pending => return Err(MembersError::NotJoined),
		MemberStatus::Joined | MemberStatus::NeedsInvitation => {}
	}
	app.state::<Hosting>()
		.cloud
		.remove_member(&bearer, &instance_id, &user_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	devices::member_removed(app, &space_id, &user_id).await?;
	read_back(app, &space_id, &instance_id).await
}

pub async fn invite_again<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let bearer = bearer_of(app)?;
	let _turn = devices::settled_turn(app, &space_id).await?;
	let members = rostered_members(app, &bearer, &space_id, &instance_id).await?;
	let member = members
		.into_iter()
		.find(|member| member.user_id == user_id)
		.ok_or(MembersError::UnknownMember)?;
	if member.status != MemberStatus::NeedsInvitation {
		return Err(MembersError::NotNeedingInvitation);
	}
	let cloud = &app.state::<Hosting>().cloud;
	cloud
		.remove_member(&bearer, &instance_id, &user_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	cloud
		.invite_member(&bearer, &instance_id, &member.email)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))
		.map_err(|failure| MembersError::RemovedButNotInvited {
			cause: Box::new(failure.into()),
		})?;
	read_back(app, &space_id, &instance_id).await
}

pub(super) async fn polled<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: &str,
) -> Infallible {
	let hosting = app.state::<Hosting>();
	let mut polls = interval(hosting.members_every);
	polls.set_missed_tick_behavior(MissedTickBehavior::Delay);
	loop {
		polls.tick().await;
		let _turn = hosting.members_turn.lock().await;
		match listed(app, space_id, instance_id).await {
			Ok(listed) => announced_if_changed(app, space_id, listed),
			Err(failure) => {
				eprintln!("the members of hosted space {space_id} were not polled: {failure:?}");
			}
		}
	}
}

pub(super) async fn instance_of<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
) -> Result<String, MembersError> {
	let database_state = app.state::<DatabaseState>();
	let registration = ready(&database_state)?
		.space_hosting()
		.registration(space_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	registration.instance_id.ok_or(MembersError::NotHosting)
}

pub(super) fn bearer_of<R: Runtime>(app: &AppHandle<R>) -> Result<String, MembersError> {
	match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(MembersError::NeedsSignIn),
		Err(error) => Err(MembersError::SessionStore { detail: format!("{error:?}") }),
	}
}

pub(super) fn signed_out_if_revoked<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	failure: &MemberCallError,
) {
	if matches!(failure, MemberCallError::Revoked) {
		session::revoked(app, bearer);
	}
}

fn is_own_account<R: Runtime>(app: &AppHandle<R>, email: &str) -> bool {
	matches!(
		app.state::<AccountSession>().current(),
		AccountState::SignedIn(account) if account.email.trim().eq_ignore_ascii_case(email)
	)
}

fn normalized_email(raw: &str) -> Option<String> {
	let email = raw.trim().to_lowercase();
	let (local, domain) = email.split_once('@')?;
	let is_email = !local.is_empty()
		&& !domain.contains('@')
		&& domain.contains('.')
		&& domain.split('.').all(|label| !label.is_empty())
		&& !email.contains(char::is_whitespace);
	is_email.then_some(email)
}

pub(super) async fn listed<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let bearer = bearer_of(app)?;
	let members = rostered_members(app, &bearer, space_id, instance_id).await?;
	let invitations = app
		.state::<Hosting>()
		.cloud
		.sent_invitations(&bearer, instance_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, &bearer, failure))?;
	let members = members.into_iter().filter(|member| member.status != MemberStatus::Pending);
	Ok(SpaceMembers { members: members.collect(), invitations })
}

async fn rostered_members<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	space_id: &str,
	instance_id: &str,
) -> Result<Vec<Member>, MembersError> {
	let members = cloud_members(app, bearer, instance_id).await?;
	let rostered = devices::rostered_accounts(app, space_id).await?;
	Ok(members.into_iter().map(|member| needing_invitation(member, &rostered)).collect())
}

fn needing_invitation(member: Member, rostered: &HashSet<String>) -> Member {
	if member.status != MemberStatus::Joined || rostered.contains(&member.user_id) {
		return member;
	}
	Member { status: MemberStatus::NeedsInvitation, ..member }
}

async fn cloud_members<R: Runtime>(
	app: &AppHandle<R>,
	bearer: &str,
	instance_id: &str,
) -> Result<Vec<Member>, MembersError> {
	let members = app
		.state::<Hosting>()
		.cloud
		.members(bearer, instance_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(app, bearer, failure))?;
	Ok(members.into_iter().map(Member::from).collect())
}

pub(super) async fn read_back<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let listed = listed(app, space_id, instance_id).await.map_err(|failure| match failure {
		MembersError::Unreachable { reason } => MembersError::Unreachable {
			reason: format!("the change landed but the member list did not read back: {reason}"),
		},
		failure => failure,
	})?;
	announced(app, space_id, listed.clone());
	Ok(listed)
}

fn announced_if_changed<R: Runtime>(app: &AppHandle<R>, space_id: &str, listed: SpaceMembers) {
	if app.state::<Hosting>().is_last_announced(space_id, &listed) {
		return;
	}
	announced(app, space_id, listed);
}

fn announced<R: Runtime>(app: &AppHandle<R>, space_id: &str, listed: SpaceMembers) {
	app.state::<Hosting>().hosts().entry(space_id.to_owned()).or_default().members =
		Some(listed.clone());
	let SpaceMembers { members, invitations } = listed;
	let changed = MembersChanged { space_id: space_id.to_owned(), members, invitations };
	if let Err(error) = events::emit(app, MEMBERS_CHANGED, changed) {
		eprintln!("the members of space {space_id} did not reach the front: {error}");
	}
}

impl Hosting {
	fn is_last_announced(&self, space_id: &str, listed: &SpaceMembers) -> bool {
		self.hosts().get(space_id).and_then(|host| host.members.as_ref()) == Some(listed)
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_email_is_trimmed_and_lowercased() {
		assert_eq!(normalized_email("  Ada@Example.COM "), Some("ada@example.com".to_owned()));
	}

	#[test]
	fn what_is_not_an_email_is_refused() {
		for raw in [
			"",
			"ada",
			"@example.com",
			"ada@",
			"ada@example",
			"ada@@example.com",
			"a da@x.io",
			"ada@x..io",
		] {
			assert_eq!(normalized_email(raw), None, "{raw:?}");
		}
	}
}
