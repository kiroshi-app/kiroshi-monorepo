use std::collections::HashSet;
use std::convert::Infallible;
use std::time::Duration;

use tokio::time::{interval, MissedTickBehavior};

use super::contract::{
	Member, MemberStatus, MembersChanged, MembersError, SpaceMembers, UnreachableReason,
};
use super::{devices, Hosting};
use crate::account::cloud::MemberCallError;
use crate::account::contract::AccountState;
use crate::account::session::{self, AccountSession};
use crate::db::DatabaseState;
use crate::events::MEMBERS_CHANGED;
use crate::spaces::commands::ready;
use crate::spaces::contract::SpaceError;

const NO_EMAIL_DOMAIN: &str = "none";

pub const MEMBERS_EVERY: Duration = Duration::from_secs(15);

pub async fn list(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(core, &space_id).await?;
	let _turn = devices::settled_turn(core, &space_id).await?;
	let listed = listed(core, &space_id, &instance_id).await?;
	announced_if_changed(core, &space_id, listed.clone());
	Ok(listed)
}

pub async fn invite(
	core: &crate::core_context::Core,
	space_id: String,
	email: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_logged(core, "invite", &space_id).await?;
	let domain = email_domain(&email);
	log::info!("inviting an address of domain {domain} into instance {instance_id}");
	invited(core, &space_id, &instance_id, &email)
		.await
		.inspect_err(|failure| failure_logged("invite", &instance_id, domain, failure))
}

async fn invited(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
	email: &str,
) -> Result<SpaceMembers, MembersError> {
	let email = normalized_email(email).ok_or(MembersError::NotAnEmail)?;
	if is_own_account(core, &email) {
		return Err(MembersError::OwnAccount);
	}
	let bearer = bearer_of(core)?;
	let _turn = devices::settled_turn(core, space_id).await?;
	core.state::<Hosting>()
		.cloud
		.invite_member(&bearer, instance_id, &email)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	read_back(core, space_id, instance_id).await
}

pub async fn withdraw(
	core: &crate::core_context::Core,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_logged(core, "withdraw", &space_id).await?;
	withdrawn(core, &space_id, &instance_id, &invitation_id)
		.await
		.inspect_err(|failure| failure_logged("withdraw", &instance_id, NO_EMAIL_DOMAIN, failure))
}

async fn withdrawn(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
	invitation_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let bearer = bearer_of(core)?;
	let _turn = devices::settled_turn(core, space_id).await?;
	core.state::<Hosting>()
		.cloud
		.withdraw_invitation(&bearer, instance_id, invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	read_back(core, space_id, instance_id).await
}

pub async fn resend(
	core: &crate::core_context::Core,
	space_id: String,
	invitation_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(core, &space_id).await?;
	let bearer = bearer_of(core)?;
	let _turn = devices::settled_turn(core, &space_id).await?;
	core.state::<Hosting>()
		.cloud
		.resend_invitation(&bearer, &instance_id, &invitation_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	read_back(core, &space_id, &instance_id).await
}

pub async fn remove(
	core: &crate::core_context::Core,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_logged(core, "remove", &space_id).await?;
	removed(core, &space_id, &instance_id, &user_id)
		.await
		.inspect_err(|failure| failure_logged("remove", &instance_id, NO_EMAIL_DOMAIN, failure))
}

async fn removed(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
	user_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let bearer = bearer_of(core)?;
	let _turn = devices::settled_turn(core, space_id).await?;
	let members = cloud_members(core, &bearer, instance_id).await?;
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
	core.state::<Hosting>()
		.cloud
		.remove_member(&bearer, instance_id, user_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	devices::member_removed(core, space_id, user_id).await?;
	read_back(core, space_id, instance_id).await
}

pub async fn invite_again(
	core: &crate::core_context::Core,
	space_id: String,
	user_id: String,
) -> Result<SpaceMembers, MembersError> {
	let instance_id = instance_of(core, &space_id).await?;
	let bearer = bearer_of(core)?;
	let _turn = devices::settled_turn(core, &space_id).await?;
	let members = rostered_members(core, &bearer, &space_id, &instance_id).await?;
	let member = members
		.into_iter()
		.find(|member| member.user_id == user_id)
		.ok_or(MembersError::UnknownMember)?;
	if member.status != MemberStatus::NeedsInvitation {
		return Err(MembersError::NotNeedingInvitation);
	}
	let cloud = &core.state::<Hosting>().cloud;
	cloud
		.remove_member(&bearer, &instance_id, &user_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	cloud
		.invite_member(&bearer, &instance_id, &member.email)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))
		.map_err(|failure| MembersError::RemovedButNotInvited {
			cause: Box::new(failure.into()),
		})?;
	read_back(core, &space_id, &instance_id)
		.await
		.map_err(|failure| MembersError::InvitedButNotListed { cause: Box::new(failure) })
}

pub(super) async fn polled(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
) -> Infallible {
	let hosting = core.state::<Hosting>();
	let mut polls = interval(hosting.members_every);
	polls.set_missed_tick_behavior(MissedTickBehavior::Delay);
	loop {
		polls.tick().await;
		hosting.cloud.unpaused().await;
		let _turn = hosting.members_turn.lock().await;
		match listed(core, space_id, instance_id).await {
			Ok(listed) => announced_if_changed(core, space_id, listed),
			Err(failure) => {
				log::warn!("the members of hosted space {space_id} were not polled: {failure:?}");
			}
		}
	}
}

pub(super) async fn instance_of(
	core: &crate::core_context::Core,
	space_id: &str,
) -> Result<String, MembersError> {
	let database_state = core.state::<DatabaseState>();
	let registration = ready(&database_state)?
		.space_hosting()
		.registration(space_id.to_owned())
		.await
		.map_err(SpaceError::from)?;
	registration.instance_id.ok_or(MembersError::NotHosting)
}

pub(super) fn bearer_of(core: &crate::core_context::Core) -> Result<String, MembersError> {
	match core.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => Ok(bearer),
		Ok(None) => Err(MembersError::NeedsSignIn),
		Err(error) => Err(MembersError::SessionStore { detail: format!("{error:?}") }),
	}
}

pub(super) fn signed_out_if_revoked(
	core: &crate::core_context::Core,
	bearer: &str,
	failure: &MemberCallError,
) {
	if matches!(failure, MemberCallError::Revoked) {
		session::revoked(core, bearer);
	}
}

async fn instance_logged(
	core: &crate::core_context::Core,
	action: &str,
	space_id: &str,
) -> Result<String, MembersError> {
	instance_of(core, space_id).await.inspect_err(|failure| {
		log::error!(
			"the member {action} in space {space_id} failed before its instance was known: {failure:?}"
		);
	})
}

fn email_domain(raw: &str) -> &str {
	raw.trim().rsplit_once('@').map_or(NO_EMAIL_DOMAIN, |(_, domain)| domain)
}

fn failure_logged(action: &str, instance_id: &str, domain: &str, failure: &MembersError) {
	log::error!(
		"the member {action} on instance {instance_id} (email domain {domain}) failed: {failure:?}"
	);
}

fn is_own_account(core: &crate::core_context::Core, email: &str) -> bool {
	matches!(
		core.state::<AccountSession>().current(),
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

pub(super) async fn listed(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let bearer = bearer_of(core)?;
	let members = rostered_members(core, &bearer, space_id, instance_id).await?;
	let invitations = core
		.state::<Hosting>()
		.cloud
		.sent_invitations(&bearer, instance_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, &bearer, failure))?;
	let members = members.into_iter().filter(|member| member.status != MemberStatus::Pending);
	Ok(SpaceMembers { members: members.collect(), invitations })
}

async fn rostered_members(
	core: &crate::core_context::Core,
	bearer: &str,
	space_id: &str,
	instance_id: &str,
) -> Result<Vec<Member>, MembersError> {
	let members = cloud_members(core, bearer, instance_id).await?;
	let rostered = devices::rostered_accounts(core, space_id).await?;
	Ok(members.into_iter().map(|member| needing_invitation(member, &rostered)).collect())
}

fn needing_invitation(member: Member, rostered: &HashSet<String>) -> Member {
	if member.status != MemberStatus::Joined || rostered.contains(&member.user_id) {
		return member;
	}
	Member { status: MemberStatus::NeedsInvitation, ..member }
}

async fn cloud_members(
	core: &crate::core_context::Core,
	bearer: &str,
	instance_id: &str,
) -> Result<Vec<Member>, MembersError> {
	let members = core
		.state::<Hosting>()
		.cloud
		.members(bearer, instance_id)
		.await
		.inspect_err(|failure| signed_out_if_revoked(core, bearer, failure))?;
	Ok(members.into_iter().map(Member::from).collect())
}

pub(super) async fn read_back(
	core: &crate::core_context::Core,
	space_id: &str,
	instance_id: &str,
) -> Result<SpaceMembers, MembersError> {
	let listed = listed(core, space_id, instance_id).await.map_err(not_read_back).inspect_err(
		|failure| {
			log::warn!("the members of instance {instance_id} did not read back: {failure:?}")
		},
	)?;
	announced(core, space_id, listed.clone());
	Ok(listed)
}

fn not_read_back(failure: MembersError) -> MembersError {
	match failure {
		MembersError::Unreachable { reason, detail } => MembersError::Unreachable {
			reason: UnreachableReason::ListNotReadBack { cause: Box::new(reason) },
			detail,
		},
		failure => failure,
	}
}

fn announced_if_changed(core: &crate::core_context::Core, space_id: &str, listed: SpaceMembers) {
	if core.state::<Hosting>().is_last_announced(space_id, &listed) {
		return;
	}
	announced(core, space_id, listed);
}

fn announced(core: &crate::core_context::Core, space_id: &str, listed: SpaceMembers) {
	core.state::<Hosting>().hosts().entry(space_id.to_owned()).or_default().members =
		Some(listed.clone());
	let SpaceMembers { members, invitations } = listed;
	let changed = MembersChanged { space_id: space_id.to_owned(), members, invitations };
	if let Err(error) = core.emit(MEMBERS_CHANGED, changed) {
		log::error!("the members of space {space_id} did not reach the front: {error}");
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
