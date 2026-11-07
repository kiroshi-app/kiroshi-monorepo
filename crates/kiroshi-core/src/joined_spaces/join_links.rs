use std::sync::{Mutex, MutexGuard, PoisonError};

use serde::Serialize;

use crate::core_context::{ClientId, Core};
use crate::events::JOIN_LINK_OPENED;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinLinkOpened {
	pub invitation_id: String,
}

#[derive(Default)]
pub struct JoinLinks(Mutex<Inbox>);

#[derive(Default)]
struct Inbox {
	is_listened: bool,
	held: Vec<String>,
}

impl JoinLinks {
	fn inbox(&self) -> MutexGuard<'_, Inbox> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

pub fn received(core: &Core, invitations: Vec<String>, target: &ClientId) {
	let Some(join_links) = core.try_state::<JoinLinks>() else {
		return log::warn!("a join link arrived before its inbox was installed");
	};
	let mut inbox = join_links.inbox();
	if !inbox.is_listened {
		for invitation in invitations {
			if !inbox.held.contains(&invitation) {
				inbox.held.push(invitation);
			}
		}
		return;
	}
	drop(inbox);
	invitations.into_iter().for_each(|invitation| announced(core, target, invitation));
}

pub fn listened(core: &Core, listener: &ClientId) {
	let Some(join_links) = core.try_state::<JoinLinks>() else {
		return log::warn!("the front listens for join links before their inbox was installed");
	};
	let held = {
		let mut inbox = join_links.inbox();
		inbox.is_listened = true;
		std::mem::take(&mut inbox.held)
	};
	held.into_iter().for_each(|invitation| announced(core, listener, invitation));
}

fn announced(core: &Core, target: &ClientId, invitation_id: String) {
	if let Err(failure) = core.emit_to(target, JOIN_LINK_OPENED, JoinLinkOpened { invitation_id }) {
		log::warn!("a join link did not reach the front: {failure}");
	}
}
