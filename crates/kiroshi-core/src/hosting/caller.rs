use crate::db::repositories::messages::WrittenFrom;

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
	pub fn is_relayed(&self) -> bool {
		matches!(self, Caller::Relayed(_))
	}

	pub fn relayed_account(&self) -> Option<&str> {
		match self {
			Caller::Relayed(Some(member)) => Some(&member.user_id),
			_ => None,
		}
	}

	pub fn written_from(&self) -> WrittenFrom {
		match self {
			Caller::Host => WrittenFrom::Here,
			Caller::Relayed(_) => WrittenFrom::Relay,
		}
	}
}
