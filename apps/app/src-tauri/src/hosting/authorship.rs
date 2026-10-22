use std::collections::HashMap;
use std::future::Future;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use specta::datatype::DataType;
use specta::function::FunctionArg;
use specta::Types;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use super::contract::{Member, MemberStatus, MembersError, SpaceMembers};
use super::{members, Hosting};
use crate::account::contract::{AccountState, KiroshiAccount};
use crate::account::session::{this_computer, AccountSession};
use crate::agent::protocol::SpaceMember;
use crate::db::repositories::messages::{AccountAuthor, WrittenFrom};
use crate::db::{Database, DatabaseError};
use crate::host_api::invoke::RELAYED_MEMBER_HEADER;

const MEMBERS_READ_BOUND: Duration = Duration::from_secs(3);

#[derive(Clone)]
pub struct RelayedMember {
	pub(super) space_id: String,
	pub(super) user_id: String,
	pub(super) computer: Option<String>,
}

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

pub enum Caller {
	Host,
	Relayed(Option<RelayedMember>),
}

impl<'de, R: Runtime> CommandArg<'de, R> for Caller {
	fn from_command(command: CommandItem<'de, R>) -> Result<Self, InvokeError> {
		let Some(nonce) = command.message.headers().get(&RELAYED_MEMBER_HEADER) else {
			return Ok(Caller::Host);
		};
		let webview = command.message.webview();
		let member = nonce
			.to_str()
			.ok()
			.zip(webview.try_state::<Hosting>())
			.and_then(|(nonce, hosting)| hosting.relayed.vouched(nonce));
		Ok(Caller::Relayed(member))
	}
}

impl FunctionArg for Caller {
	fn to_datatype(_: &mut Types) -> Option<DataType> {
		None
	}
}

impl Caller {
	pub fn is_relayed(&self) -> bool {
		matches!(self, Caller::Relayed(_))
	}

	pub fn written_from(&self) -> WrittenFrom {
		match self {
			Caller::Host => WrittenFrom::Here,
			Caller::Relayed(_) => WrittenFrom::Relay,
		}
	}

	pub async fn author<R: Runtime>(
		self,
		app: &AppHandle<R>,
		database: &Database,
	) -> Result<AccountAuthor, DatabaseError> {
		match self {
			Caller::Host => {
				let computer = Some(this_computer().await.to_owned());
				Ok(AccountAuthor { computer, ..host_author(app, database).await? })
			}
			Caller::Relayed(None) => Ok(AccountAuthor::default()),
			Caller::Relayed(Some(member)) => member_author(app, database, member).await,
		}
	}
}

fn signed_in_account<R: Runtime>(app: &AppHandle<R>) -> Option<KiroshiAccount> {
	app.try_state::<AccountSession>().and_then(|session| match session.current() {
		AccountState::SignedIn(account) => Some(account),
		_ => None,
	})
}

async fn host_author<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
) -> Result<AccountAuthor, DatabaseError> {
	let account = signed_in_account(app);
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

pub async fn members_of<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	space_id: &str,
) -> Result<Vec<SpaceMember>, DatabaseError> {
	let Some(members) = hosted_members(app, space_id).await else {
		return Ok(Vec::new());
	};
	if !members.iter().any(|member| member.status == MemberStatus::Joined) {
		return Ok(Vec::new());
	}
	let host_account_id = signed_in_account(app).map(|account| account.id);
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

async fn hosted_members<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Option<Vec<Member>> {
	let hosting = app.try_state::<Hosting>()?;
	let known = {
		let hosts = hosting.hosts();
		let host = hosts.get(space_id).filter(|host| host.state.is_running())?;
		host.members.as_ref().map(|known| known.members.clone())
	};
	if known.is_some() {
		return known;
	}
	listed_within_bound(space_id, members::list(app, space_id.to_owned())).await
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

async fn member_author<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
	member: RelayedMember,
) -> Result<AccountAuthor, DatabaseError> {
	let is_the_host_account =
		signed_in_account(app).is_some_and(|account| account.id == member.user_id);
	if is_the_host_account {
		return Ok(AccountAuthor {
			computer: member.computer,
			..host_author(app, database).await?
		});
	}
	let listed = match known_member(app, &member) {
		Some(listed) => Some(listed),
		None => listed_member(app, &member).await,
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

fn known_member<R: Runtime>(app: &AppHandle<R>, member: &RelayedMember) -> Option<Member> {
	let hosting = app.state::<Hosting>();
	let hosts = hosting.hosts();
	let known = hosts.get(&member.space_id)?.members.as_ref()?;
	member_among(&known.members, &member.user_id)
}

async fn listed_member<R: Runtime>(app: &AppHandle<R>, member: &RelayedMember) -> Option<Member> {
	match members::list(app, member.space_id.clone()).await {
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
