use std::collections::HashMap;
use std::future::Future;
use std::ops::Deref;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use specta::datatype::DataType;
use specta::function::FunctionArg;
use specta::Types;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::{Manager, Runtime};
use uuid::Uuid;

use super::contract::{Member, MemberStatus, MembersError, SpaceMembers};
use super::{members, Hosting};
use crate::account::contract::{AccountState, KiroshiAccount};
use crate::account::session::{this_computer, AccountSession};
use crate::agent::protocol::SpaceMember;
use crate::db::repositories::messages::AccountAuthor;
use crate::db::{Database, DatabaseError};
use crate::host_api::invoke::RELAYED_MEMBER_HEADER;
use futures_util::future::BoxFuture;
use kiroshi_core::hosting::authors::Authors;
pub use kiroshi_core::hosting::caller::{Caller, RelayedMember};

const MEMBERS_READ_BOUND: Duration = Duration::from_secs(3);

#[derive(Default)]
pub(super) struct RelayedMembers(Mutex<HashMap<String, RelayedMember>>);

pub(super) struct Vouched<'a> {
	members: &'a RelayedMembers,
	pub(super) nonce: String,
}

impl RelayedMembers {
	pub(super) fn vouch(&self, member: RelayedMember) -> Vouched<'_> {
		let nonce = Uuid::new_v4().to_string();
		self.held().insert(nonce.clone(), member);
		Vouched { members: self, nonce }
	}

	fn vouched(&self, nonce: &str) -> Option<RelayedMember> {
		self.held().get(nonce).cloned()
	}

	#[cfg(test)]
	pub(super) fn is_empty(&self) -> bool {
		self.held().is_empty()
	}

	fn held(&self) -> MutexGuard<'_, HashMap<String, RelayedMember>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl Drop for Vouched<'_> {
	fn drop(&mut self) {
		self.members.held().remove(&self.nonce);
	}
}

pub struct CommandCaller(pub Caller);

impl Deref for CommandCaller {
	type Target = Caller;

	fn deref(&self) -> &Caller {
		&self.0
	}
}

impl<'de, R: Runtime> CommandArg<'de, R> for CommandCaller {
	fn from_command(command: CommandItem<'de, R>) -> Result<Self, InvokeError> {
		let Some(nonce) = command.message.headers().get(&RELAYED_MEMBER_HEADER) else {
			return Ok(CommandCaller(Caller::Host));
		};
		let webview = command.message.webview();
		let member = nonce
			.to_str()
			.ok()
			.zip(crate::events::core(webview.app_handle()).try_state::<Hosting>())
			.and_then(|(nonce, hosting)| hosting.relayed.vouched(nonce));
		Ok(CommandCaller(Caller::Relayed(member)))
	}
}

impl FunctionArg for CommandCaller {
	fn to_datatype(_: &mut Types) -> Option<DataType> {
		None
	}
}

pub struct DesktopAuthors;

impl Authors for DesktopAuthors {
	fn author<'a>(
		&'a self,
		caller: Caller,
		core: &'a crate::core_context::Core,
		database: &'a Database,
	) -> BoxFuture<'a, Result<AccountAuthor, DatabaseError>> {
		Box::pin(author(caller, core, database))
	}

	fn members_of<'a>(
		&'a self,
		core: &'a crate::core_context::Core,
		database: &'a Database,
		space_id: &'a str,
	) -> BoxFuture<'a, Result<Vec<SpaceMember>, DatabaseError>> {
		Box::pin(members_of(core, database, space_id))
	}
}

pub(crate) async fn author(
	caller: Caller,
	core: &crate::core_context::Core,
	database: &Database,
) -> Result<AccountAuthor, DatabaseError> {
	match caller {
		Caller::Host => {
			let computer = Some(this_computer().await.to_owned());
			Ok(AccountAuthor { computer, ..host_author(core, database).await? })
		}
		Caller::Relayed(None) => Ok(AccountAuthor::default()),
		Caller::Relayed(Some(member)) => member_author(core, database, member).await,
	}
}

fn signed_in_account(core: &crate::core_context::Core) -> Option<KiroshiAccount> {
	core.try_state::<AccountSession>().and_then(|session| match session.current() {
		AccountState::SignedIn(account) => Some(account),
		_ => None,
	})
}

async fn host_author(
	core: &crate::core_context::Core,
	database: &Database,
) -> Result<AccountAuthor, DatabaseError> {
	let account = signed_in_account(core);
	let email = account.as_ref().map(|account| account.email.clone());
	Ok(AccountAuthor {
		name: host_display_name(database).await?.or_else(|| email.clone()),
		email,
		account_id: account.map(|account| account.id),
		computer: None,
	})
}

async fn host_display_name(database: &Database) -> Result<Option<String>, DatabaseError> {
	let display_name = database.user().preferences().await?.display_name;
	Ok(Some(display_name).filter(|name| !name.is_empty()))
}

pub(crate) async fn members_of(
	core: &crate::core_context::Core,
	database: &Database,
	space_id: &str,
) -> Result<Vec<SpaceMember>, DatabaseError> {
	let Some(members) = hosted_members(core, space_id).await else {
		return Ok(Vec::new());
	};
	if !members.iter().any(|member| member.status == MemberStatus::Joined) {
		return Ok(Vec::new());
	}
	let host_account_id = signed_in_account(core).map(|account| account.id);
	let mut read_by = Vec::new();
	for member in members.into_iter().filter(|member| member.status != MemberStatus::Pending) {
		let name = if host_account_id.as_deref() == Some(member.user_id.as_str()) {
			host_display_name(database).await?
		} else {
			member.name
		};
		let is_host = member.status == MemberStatus::Host;
		read_by.push(SpaceMember { name, email: member.email, is_host });
	}
	Ok(read_by)
}

async fn hosted_members(core: &crate::core_context::Core, space_id: &str) -> Option<Vec<Member>> {
	let hosting = core.try_state::<Hosting>()?;
	let known = {
		let hosts = hosting.hosts();
		let host = hosts.get(space_id).filter(|host| host.state.is_running())?;
		host.members.as_ref().map(|known| known.members.clone())
	};
	if known.is_some() {
		return known;
	}
	listed_within_bound(space_id, members::list(core, space_id.to_owned())).await
}

async fn listed_within_bound(
	space_id: &str,
	listing: impl Future<Output = Result<SpaceMembers, MembersError>>,
) -> Option<Vec<Member>> {
	match tokio::time::timeout(MEMBERS_READ_BOUND, listing).await {
		Ok(Ok(listed)) => Some(listed.members),
		Ok(Err(failure)) => {
			log::warn!(
				"the members of hosted space {space_id} were not read for a session: {failure:?}"
			);
			None
		}
		Err(_) => {
			log::warn!(
				"the members of hosted space {space_id} were not read for a session within {MEMBERS_READ_BOUND:?}"
			);
			None
		}
	}
}

async fn member_author(
	core: &crate::core_context::Core,
	database: &Database,
	member: RelayedMember,
) -> Result<AccountAuthor, DatabaseError> {
	let is_the_host_account =
		signed_in_account(core).is_some_and(|account| account.id == member.user_id);
	if is_the_host_account {
		return Ok(AccountAuthor {
			computer: member.computer,
			..host_author(core, database).await?
		});
	}
	let listed = match known_member(core, &member) {
		Some(listed) => Some(listed),
		None => listed_member(core, &member).await,
	};
	Ok(AccountAuthor {
		account_id: Some(member.user_id),
		name: listed
			.as_ref()
			.map(|listed| listed.name.clone().unwrap_or_else(|| listed.email.clone())),
		email: listed.map(|listed| listed.email),
		computer: member.computer,
	})
}

fn known_member(core: &crate::core_context::Core, member: &RelayedMember) -> Option<Member> {
	let hosting = core.state::<Hosting>();
	let hosts = hosting.hosts();
	let known = hosts.get(&member.space_id)?.members.as_ref()?;
	member_among(&known.members, &member.user_id)
}

async fn listed_member(core: &crate::core_context::Core, member: &RelayedMember) -> Option<Member> {
	match members::list(core, member.space_id.clone()).await {
		Ok(listed) => member_among(&listed.members, &member.user_id),
		Err(failure) => {
			log::warn!(
				"a member name of hosted space {} was not read: {failure:?}",
				member.space_id
			);
			None
		}
	}
}

fn member_among(members: &[Member], user_id: &str) -> Option<Member> {
	members.iter().find(|member| member.user_id == user_id).cloned()
}

#[cfg(test)]
mod tests {
	use super::*;

	#[tokio::test(start_paused = true)]
	async fn a_members_read_past_its_bound_opens_the_session_with_no_member_list() {
		let started = tokio::time::Instant::now();

		let listed =
			listed_within_bound("s1", std::future::pending::<Result<SpaceMembers, MembersError>>())
				.await;

		assert_eq!(listed, None);
		assert_eq!(started.elapsed(), MEMBERS_READ_BOUND);
	}

	#[tokio::test(start_paused = true)]
	async fn a_members_read_within_its_bound_names_the_members() {
		let member = Member {
			user_id: "u1".to_owned(),
			name: None,
			email: "bea@example.com".to_owned(),
			status: MemberStatus::Joined,
		};
		let answered = SpaceMembers { members: vec![member.clone()], invitations: Vec::new() };

		let listed = listed_within_bound("s1", async {
			tokio::time::sleep(MEMBERS_READ_BOUND - Duration::from_millis(1)).await;
			Ok(answered)
		})
		.await;

		assert_eq!(listed, Some(vec![member]));
	}
}
