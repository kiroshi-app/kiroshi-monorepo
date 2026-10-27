use std::fmt;

use serde::{Deserialize, Serialize};

use crate::account::cloud::Cloud;
use crate::conversations::contract::{AvatarBlot, StorageFailure};
use crate::db::repositories::joined_space_members::{JoinedSpaceMember, JoinedSpaceRole};
use crate::db::repositories::joined_spaces::{self, HostListing, JoinedReach};
use crate::db::DatabaseError;

const FNV_OFFSET_BASIS: u32 = 0x811c_9dc5;

const FNV_PRIME: u32 = 0x0100_0193;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpace {
	pub id: String,
	pub host_url: String,
	pub remote_space_id: Option<String>,
	pub name: String,
	pub state: JoinedSpaceState,
	#[specta(optional)]
	pub wait: Option<JoinedSpaceWait>,
	pub hosted_by: Option<String>,
	pub colour: AvatarBlot,
	pub instance_id: String,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum JoinedSpaceState {
	Online,
	WaitingForHost,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum JoinedSpaceWaitReason {
	RelayUnreachable,
	RekeySendFailed,
	HostSilent,
	SocketClosed,
	RekeyNotVerified,
	NotMember,
	UnknownInstance,
	DeviceKeysUnreadable,
	DeviceAwaitingApproval,
	SocketUrlFailed,
	RosterMissing,
	KeychainReadFailed,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceWait {
	pub reason: JoinedSpaceWaitReason,
	pub detail: String,
}

impl JoinedSpace {
	pub fn presented(
		joined: joined_spaces::JoinedSpace,
		cloud: &Cloud,
		wait: Option<JoinedSpaceWait>,
		roster: &[JoinedSpaceMember],
	) -> Self {
		let hosted_by = hosted_by(&joined.listing, joined.inviter_email, roster);
		let colour = colour_shown(&joined.listing, &joined.id);
		let JoinedReach::Relay { instance_id } = joined.reach;
		let host_url = cloud.member_relay_url(&instance_id);
		let state = match wait {
			None => JoinedSpaceState::Online,
			Some(_) => JoinedSpaceState::WaitingForHost,
		};
		Self {
			hosted_by,
			colour,
			id: joined.id,
			host_url,
			remote_space_id: joined.remote_space_id,
			name: joined.name,
			state,
			wait,
			instance_id,
		}
	}
}

pub fn hosted_by(
	listing: &HostListing,
	inviter_email: Option<String>,
	roster: &[JoinedSpaceMember],
) -> Option<String> {
	listing
		.host_name
		.clone()
		.or_else(|| roster_host_name(roster))
		.or_else(|| listing.host_email.clone())
		.or(inviter_email)
}

fn roster_host_name(roster: &[JoinedSpaceMember]) -> Option<String> {
	roster
		.iter()
		.filter(|member| member.role == JoinedSpaceRole::Host)
		.find_map(|member| member.name.clone())
}

pub fn colour_shown(listing: &HostListing, id: &str) -> AvatarBlot {
	listing.colour.map_or_else(|| colour_of(id), AvatarBlot::from)
}

pub fn colour_of(id: &str) -> AvatarBlot {
	let hash = id
		.bytes()
		.fold(FNV_OFFSET_BASIS, |hash, byte| (hash ^ u32::from(byte)).wrapping_mul(FNV_PRIME));
	AvatarBlot::ALL[hash as usize % AvatarBlot::ALL.len()]
}

#[derive(Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceConnection {
	pub id: String,
	pub host_url: String,
	pub token: String,
	pub remote_space_id: Option<String>,
	pub name: String,
}

impl JoinedSpaceConnection {
	pub fn over(joined: joined_spaces::JoinedSpace, host_url: String, token: String) -> Self {
		Self {
			id: joined.id,
			host_url,
			token,
			remote_space_id: joined.remote_space_id,
			name: joined.name,
		}
	}
}

impl fmt::Debug for JoinedSpaceConnection {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter
			.debug_struct("JoinedSpaceConnection")
			.field("id", &self.id)
			.field("host_url", &self.host_url)
			.field("token", &"[redacted]")
			.field("remote_space_id", &self.remote_space_id)
			.field("name", &self.name)
			.finish()
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum JoinedSpaceError {
	#[serde(rename_all = "camelCase")]
	Unavailable {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	Storage {
		failure: StorageFailure,
	},
	#[serde(rename_all = "camelCase")]
	UnknownJoinedSpace {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	Undeliverable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	HostOffline {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	ProxyUnavailable {
		detail: String,
	},
	OwnerNotRemovable,
	NeedsSignIn,
	SessionRevoked,
	#[serde(rename_all = "camelCase")]
	SessionStore {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RelayUnreachable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RelayRefused {
		detail: String,
	},
	InvitationExpired,
	InvitationWithdrawn,
	InvitationUsed,
	InvitationOtherEmail,
	#[serde(rename_all = "camelCase")]
	CouldNotAccept {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	NoInvitation {
		inviter_email: Option<String>,
	},
	NotInRoster,
	BadSignature,
	RemovedByRotation,
	#[serde(rename_all = "camelCase")]
	WaitingForHost {
		id: String,
		instance_id: String,
		reason: JoinedSpaceWaitReason,
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	KeyStore {
		detail: String,
	},
}

impl From<DatabaseError> for JoinedSpaceError {
	fn from(error: DatabaseError) -> Self {
		JoinedSpaceError::Storage { failure: (&error).into() }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{json, to_value, Value};

	use super::*;
	use crate::db::repositories::conversations::AvatarBlot as StoredBlot;

	const STORED_BEFORE_INVITERS: &str =
		r#"{"id":"joined-1","instanceId":"instance-1","remoteSpaceId":null,"name":"Studio"}"#;

	fn a_member(name: Option<&str>, role: JoinedSpaceRole) -> JoinedSpaceMember {
		JoinedSpaceMember {
			user_id: format!("user-{role:?}"),
			name: name.map(str::to_owned),
			role,
			device_id: format!("device-{role:?}"),
			fingerprint: Vec::new(),
			is_present: true,
		}
	}

	fn a_stored_row(inviter_email: Option<&str>) -> joined_spaces::JoinedSpace {
		joined_spaces::JoinedSpace {
			id: "joined-1".to_owned(),
			reach: JoinedReach::Relay { instance_id: "instance-1".to_owned() },
			remote_space_id: None,
			name: "Studio".to_owned(),
			inviter_email: inviter_email.map(str::to_owned),
			listing: Default::default(),
		}
	}

	fn presented(joined: joined_spaces::JoinedSpace, roster: &[JoinedSpaceMember]) -> Value {
		let cloud = Cloud::new("http://127.0.0.1:9");
		to_value(JoinedSpace::presented(joined, &cloud, None, roster)).expect("json")
	}

	#[test]
	fn a_joined_space_crosses_to_the_front_with_who_hosts_it_and_its_colour() {
		let roster = [a_member(Some("Ann"), JoinedSpaceRole::Host)];

		let crossed = presented(a_stored_row(None), &roster);

		assert_eq!(crossed["hostedBy"], "Ann");
		assert_eq!(crossed["colour"], json!(colour_of("joined-1")));
		assert!(crossed.get("hosted_by").is_none(), "{crossed}");
	}

	#[test]
	fn a_joined_space_crosses_to_the_front_with_its_relay_instance_beside_its_row_id() {
		let crossed = presented(a_stored_row(None), &[]);

		assert_eq!(crossed["id"], "joined-1");
		assert_eq!(crossed["instanceId"], "instance-1");
	}

	#[test]
	fn the_host_named_in_the_roster_wins_over_the_inviter() {
		let roster = [
			a_member(None, JoinedSpaceRole::Host),
			a_member(Some("Bob"), JoinedSpaceRole::Guest),
			a_member(Some("Ann"), JoinedSpaceRole::Host),
		];

		let crossed = presented(a_stored_row(Some("owner@example.com")), &roster);

		assert_eq!(crossed["hostedBy"], "Ann");
	}

	#[test]
	fn a_space_whose_host_is_unnamed_is_hosted_by_its_inviter() {
		let roster =
			[a_member(None, JoinedSpaceRole::Host), a_member(Some("Bob"), JoinedSpaceRole::Guest)];

		let crossed = presented(a_stored_row(Some("owner@example.com")), &roster);

		assert_eq!(crossed["hostedBy"], "owner@example.com");
	}

	#[test]
	fn a_space_with_no_host_name_and_no_inviter_is_hosted_by_null() {
		let crossed = presented(a_stored_row(None), &[a_member(None, JoinedSpaceRole::Host)]);

		assert_eq!(crossed.get("hostedBy"), Some(&Value::Null));
	}

	#[test]
	fn a_row_stored_before_inviters_were_kept_reads_and_is_hosted_by_its_roster_or_null() {
		let stored: joined_spaces::JoinedSpace =
			serde_json::from_str(STORED_BEFORE_INVITERS).expect("the old row reads");
		let roster = [a_member(Some("Ann"), JoinedSpaceRole::Host)];

		assert_eq!(stored.inviter_email, None);
		assert_eq!(presented(stored.clone(), &roster)["hostedBy"], "Ann");
		assert_eq!(presented(stored, &[]).get("hostedBy"), Some(&Value::Null));
	}

	#[test]
	fn the_colour_of_a_joined_space_is_pinned_to_its_id() {
		let colours: Vec<Value> = ["joined-1", "joined-2", "", "a"]
			.iter()
			.map(|id| to_value(colour_of(id)).expect("json"))
			.collect();

		assert_eq!(colours, vec![json!("green"), json!("orange"), json!("purple"), json!("blue")]);
		assert_eq!(presented(a_stored_row(None), &[])["colour"], colours[0]);
	}

	#[test]
	fn who_hosts_a_space_falls_from_the_relay_name_to_the_roster_to_the_relay_email_to_the_inviter()
	{
		let roster = [a_member(Some("Rae"), JoinedSpaceRole::Host)];
		let listing = HostListing {
			host_name: Some("Ann".to_owned()),
			host_email: Some("ann@example.com".to_owned()),
			colour: None,
		};
		let listed = |listing: HostListing, inviter: Option<&str>| joined_spaces::JoinedSpace {
			listing,
			..a_stored_row(inviter)
		};
		let unnamed = HostListing { host_name: None, ..listing.clone() };
		let unlisted = HostListing::default();

		let hosts: Vec<Value> = [
			presented(listed(listing, Some("owner@example.com")), &roster),
			presented(listed(unnamed.clone(), Some("owner@example.com")), &roster),
			presented(listed(unnamed, Some("owner@example.com")), &[]),
			presented(listed(unlisted.clone(), Some("owner@example.com")), &[]),
			presented(listed(unlisted, None), &[]),
		]
		.into_iter()
		.map(|crossed| crossed["hostedBy"].clone())
		.collect();

		assert_eq!(
			hosts,
			vec![
				json!("Ann"),
				json!("Rae"),
				json!("ann@example.com"),
				json!("owner@example.com"),
				Value::Null
			]
		);
	}

	#[test]
	fn the_relay_colour_wins_and_the_colour_pinned_to_the_id_shows_only_without_it() {
		let listing = HostListing { colour: Some(StoredBlot::Pink), ..HostListing::default() };
		let coloured = joined_spaces::JoinedSpace { listing, ..a_stored_row(None) };

		assert_eq!(presented(coloured, &[])["colour"], "pink");
		assert_eq!(presented(a_stored_row(None), &[])["colour"], json!(colour_of("joined-1")));
	}

	#[test]
	fn the_debug_output_of_a_joined_space_connection_carries_no_token() {
		let connection = JoinedSpaceConnection {
			id: "a".to_owned(),
			host_url: "http://a.test".to_owned(),
			token: "the-secret-token".to_owned(),
			remote_space_id: None,
			name: "a.test".to_owned(),
		};

		let printed = format!("{connection:?}");

		assert!(!printed.contains("the-secret-token"));
		assert!(printed.contains("http://a.test"));
	}
}
