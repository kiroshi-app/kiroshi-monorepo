use axum::http::HeaderMap;

use crate::core_context::Core;
use crate::db::repositories::conversations::ChatOwner;
use crate::db::repositories::messages::WrittenFrom;
use crate::host_api::invoke::RELAYED_MEMBER_HEADER;
use crate::hosting::authorship::person_of;
use crate::hosting::Hosting;

#[derive(Clone)]
pub struct RelayedMember {
	pub space_id: String,
	pub user_id: String,
	pub computer: Option<String>,
}

pub enum Caller {
	Host,
	Relayed(Option<RelayedMember>),
}

impl Caller {
	pub fn of(core: &Core, headers: &HeaderMap) -> Caller {
		let Some(nonce) = headers.get(&RELAYED_MEMBER_HEADER) else {
			return Caller::Host;
		};
		let member = nonce
			.to_str()
			.ok()
			.zip(core.try_state::<Hosting>())
			.and_then(|(nonce, hosting)| hosting.relayed_member(nonce));
		Caller::Relayed(member)
	}

	pub fn is_relayed(&self) -> bool {
		matches!(self, Caller::Relayed(_))
	}

	pub fn relayed_account(&self) -> Option<&str> {
		match self {
			Caller::Relayed(Some(member)) => Some(&member.user_id),
			_ => None,
		}
	}

	pub fn chat_owner(&self, core: &Core) -> Option<ChatOwner> {
		match self {
			Caller::Host => Some(ChatOwner::Host),
			Caller::Relayed(None) => None,
			Caller::Relayed(Some(member)) => Some(person_of(core, &member.user_id)),
		}
	}

	pub fn written_from(&self) -> WrittenFrom {
		match self {
			Caller::Host => WrittenFrom::Here,
			Caller::Relayed(_) => WrittenFrom::Relay,
		}
	}
}
