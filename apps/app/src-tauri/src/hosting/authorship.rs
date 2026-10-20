use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard, PoisonError};

use specta::datatype::DataType;
use specta::function::FunctionArg;
use specta::Types;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::{AppHandle, Manager, Runtime};
use uuid::Uuid;

use super::contract::Member;
use super::{members, Hosting};
use crate::account::contract::AccountState;
use crate::account::session::AccountSession;
use crate::db::repositories::messages::{AccountAuthor, WrittenFrom};
use crate::db::{Database, DatabaseError};
use crate::host_api::invoke::RELAYED_MEMBER_HEADER;

#[derive(Clone)]
pub struct RelayedMember {
	pub(super) space_id: String,
	pub(super) user_id: String,
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
			Caller::Host => host_author(app, database).await,
			Caller::Relayed(None) => Ok(AccountAuthor::default()),
			Caller::Relayed(Some(member)) => Ok(member_author(app, member).await),
		}
	}
}

async fn host_author<R: Runtime>(
	app: &AppHandle<R>,
	database: &Database,
) -> Result<AccountAuthor, DatabaseError> {
	let account = app.try_state::<AccountSession>().and_then(|session| match session.current() {
		AccountState::SignedIn(account) => Some(account),
		_ => None,
	});
	let display_name = database.user().preferences().await?.display_name;
	let name = Some(display_name)
		.filter(|name| !name.is_empty())
		.or_else(|| account.as_ref().map(|account| account.email.clone()));
	Ok(AccountAuthor { account_id: account.map(|account| account.id), name })
}

async fn member_author<R: Runtime>(app: &AppHandle<R>, member: RelayedMember) -> AccountAuthor {
	let name = match known_name(app, &member) {
		Some(name) => Some(name),
		None => listed_name(app, &member).await,
	};
	AccountAuthor { account_id: Some(member.user_id), name }
}

fn known_name<R: Runtime>(app: &AppHandle<R>, member: &RelayedMember) -> Option<String> {
	let hosting = app.state::<Hosting>();
	let hosts = hosting.hosts();
	let known = hosts.get(&member.space_id)?.members.as_ref()?;
	name_among(&known.members, &member.user_id)
}

async fn listed_name<R: Runtime>(app: &AppHandle<R>, member: &RelayedMember) -> Option<String> {
	match members::list(app, member.space_id.clone()).await {
		Ok(listed) => name_among(&listed.members, &member.user_id),
		Err(failure) => {
			log::warn!(
				"a member name of hosted space {} was not read: {failure:?}",
				member.space_id
			);
			None
		}
	}
}

fn name_among(members: &[Member], user_id: &str) -> Option<String> {
	members
		.iter()
		.find(|member| member.user_id == user_id)
		.map(|member| member.name.clone().unwrap_or_else(|| member.email.clone()))
}
