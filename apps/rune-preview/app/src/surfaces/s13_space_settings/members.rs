use kiroshi_core::hosting::contract::{InvitationState, SpaceInvitation};
use kiroshi_rune_kit::surfaces::s13_space_settings::{
	Failure, InviteReason, Member, MemberStatus, Reason, Refusal, RemoveReason, WithdrawReason,
};
use serde_json::Value;

use crate::host::HostError;

const DATE_LENGTH: usize = "2026-01-31".len();

const MEMBERS_COMMAND: &str = "hosting_members";

#[derive(Clone, Debug, PartialEq)]
pub enum Status {
	Host,
	Joined,
	NeedsInvitation,
	Pending { expires_at: Option<String> },
	Expired { sent_at: String },
}

#[derive(Clone, Debug, PartialEq)]
pub struct Row {
	pub id: String,
	pub name: Option<String>,
	pub email: String,
	pub status: Status,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Refused {
	Invite { email: String, error: Option<Value> },
	Resend { email: String, error: Option<Value> },
	Withdraw { row: Row, error: Option<Value> },
	Remove { row: Row, error: Option<Value> },
}

pub fn refusal_of(failure: &HostError) -> Option<Value> {
	let HostError::CommandFailed { body, .. } = failure else { return None };
	serde_json::from_str::<Value>(body).ok().filter(|refusal| refusal.get("kind").is_some())
}

pub fn kind_of(error: Option<&Value>) -> &str {
	error.and_then(|error| error.get("kind")).and_then(Value::as_str).unwrap_or_default()
}

fn text(value: &Value, field: &str) -> Option<String> {
	value.get(field).and_then(Value::as_str).map(str::to_owned)
}

fn member_status(status: &str) -> Status {
	match status {
		"host" => Status::Host,
		"joined" => Status::Joined,
		"needsInvitation" => Status::NeedsInvitation,
		_ => Status::Pending { expires_at: None },
	}
}

fn member_row(member: &Value) -> Option<Row> {
	Some(Row {
		id: text(member, "userId")?,
		name: text(member, "name"),
		email: text(member, "email")?,
		status: member_status(&text(member, "status")?),
	})
}

fn invitation_row(invitation: SpaceInvitation) -> Option<Row> {
	let status = match invitation.state {
		InvitationState::Invited => Status::Pending { expires_at: Some(invitation.expires_at) },
		InvitationState::Expired => Status::Expired { sent_at: invitation.sent_at },
		InvitationState::Withdrawn => return None,
	};
	Some(Row { id: invitation.id, name: None, email: invitation.email, status })
}

fn unreadable(cause: String) -> HostError {
	HostError::Unreadable { command: MEMBERS_COMMAND.to_owned(), cause }
}

pub fn rows_of(listed: Value) -> Result<Vec<Row>, HostError> {
	let members = listed
		.get("members")
		.and_then(Value::as_array)
		.ok_or_else(|| unreadable("the answer holds no members list".to_owned()))?;
	let mut people: Vec<Row> = members.iter().filter_map(member_row).collect();
	people.sort_by_key(|row| row.status != Status::Host);
	let invitations: Vec<SpaceInvitation> =
		serde_json::from_value(listed.get("invitations").cloned().unwrap_or_default())
			.map_err(|failure| unreadable(failure.to_string()))?;
	people.extend(invitations.into_iter().filter_map(invitation_row));
	Ok(people)
}

pub fn same_email(one: &str, other: &str) -> bool {
	one.trim().eq_ignore_ascii_case(other.trim())
}

pub fn sent_until<'a>(rows: &'a [Row], email: &str) -> Option<&'a str> {
	rows.iter().find_map(|row| match &row.status {
		Status::Pending { expires_at: Some(expires_at) } if same_email(&row.email, email) => {
			Some(date_of(expires_at))
		}
		_ => None,
	})
}

pub fn date_of(moment: &str) -> &str {
	moment.get(..DATE_LENGTH).unwrap_or(moment)
}

fn day_number(moment: &str) -> Option<i64> {
	let mut parts = date_of(moment).splitn(3, '-').map(str::parse::<i64>);
	let (year, month, day) = (parts.next()?.ok()?, parts.next()?.ok()?, parts.next()?.ok()?);
	let year = if month <= 2 { year - 1 } else { year };
	let era = year.div_euclid(400);
	let year_of_era = year.rem_euclid(400);
	let day_of_year = (153 * ((month + 9) % 12) + 2) / 5 + day - 1;
	let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
	Some(era * 146_097 + day_of_era - 719_468)
}

fn days_left(expires_at: &str, today: i64) -> Option<u32> {
	let left = day_number(expires_at)? - today;
	u32::try_from(left.max(1)).ok()
}

pub fn member_of(row: &Row, today: i64) -> Member<'_> {
	let status = match &row.status {
		Status::Host => MemberStatus::Host,
		Status::Joined => MemberStatus::Joined,
		Status::NeedsInvitation => MemberStatus::NeedsInvitation,
		Status::Pending { expires_at } => MemberStatus::Pending {
			expires_in_days: expires_at.as_deref().and_then(|at| days_left(at, today)),
		},
		Status::Expired { sent_at } => MemberStatus::Expired { sent: Some(date_of(sent_at)) },
	};
	Member { id: &row.id, name: row.name.as_deref(), email: &row.email, status }
}

pub fn refusal(refused: &Refused) -> Option<Refusal> {
	let Refused::Invite { error, .. } = refused else { return None };
	match kind_of(error.as_ref()) {
		"alreadyInvited" => Some(Refusal::Invited),
		"ownAccount" => Some(Refusal::OwnAddress),
		"notAnEmail" => Some(Refusal::Malformed),
		_ => None,
	}
}

fn common_reason(kind: &str) -> Option<Reason> {
	match kind {
		"notHosting" => Some(Reason::NotHosting),
		"notOwner" => Some(Reason::NotOwner),
		"needsSignIn" => Some(Reason::NeedsSignIn),
		"unreachable" => Some(Reason::Unreachable),
		_ => None,
	}
}

fn unreachable_reason(reason: &Value) -> InviteReason<'_> {
	match kind_of(Some(reason)) {
		"transport" => match reason.get("failure").and_then(Value::as_str) {
			Some("offline") => InviteReason::Offline,
			Some("timedOut") => InviteReason::TimedOut,
			Some("unsent") => InviteReason::Unsent,
			_ => InviteReason::Common(Reason::Unreachable),
		},
		"relayStatus" => InviteReason::RelayStatus(
			reason.get("status").and_then(Value::as_u64).and_then(|status| status.try_into().ok()),
		),
		"relayConflict" => InviteReason::RelayConflict(reason.get("code").and_then(Value::as_str)),
		"unreadableConflict" => InviteReason::UnreadableConflict,
		"unreadableList" => InviteReason::UnreadableList,
		"listNotReadBack" => InviteReason::ListNotReadBack,
		_ => InviteReason::Common(Reason::Unreachable),
	}
}

fn invite_reason(error: Option<&Value>) -> InviteReason<'_> {
	let kind = kind_of(error);
	if let Some(reason) =
		error.and_then(|error| error.get("reason")).filter(|_| kind == "unreachable")
	{
		return unreachable_reason(reason);
	}
	match kind {
		"limitReached" => InviteReason::LimitReached,
		kind => InviteReason::Common(common_reason(kind).unwrap_or(Reason::Generic)),
	}
}

fn withdraw_reason(error: Option<&Value>) -> WithdrawReason {
	match kind_of(error) {
		"unknownMember" => WithdrawReason::Gone,
		"notPending" => WithdrawReason::Joined,
		kind => WithdrawReason::Common(common_reason(kind).unwrap_or(Reason::Generic)),
	}
}

fn remove_reason(error: Option<&Value>) -> RemoveReason {
	match kind_of(error) {
		"unknownMember" => RemoveReason::Gone,
		"notJoined" => RemoveReason::Pending,
		"hostNotRemovable" => RemoveReason::Host,
		kind => RemoveReason::Common(common_reason(kind).unwrap_or(Reason::Generic)),
	}
}

pub fn failure(refused: &Refused, today: i64) -> Option<Failure<'_>> {
	if refusal(refused).is_some() {
		return None;
	}
	Some(match refused {
		Refused::Invite { email, error } | Refused::Resend { email, error } => {
			Failure::Invite { reason: invite_reason(error.as_ref()), email }
		}
		Refused::Withdraw { row, error } => Failure::Withdraw {
			reason: withdraw_reason(error.as_ref()),
			member: member_of(row, today),
		},
		Refused::Remove { row, error } => {
			Failure::Remove { reason: remove_reason(error.as_ref()), member: member_of(row, today) }
		}
	})
}

pub fn is_list_not_read_back(error: Option<&Value>) -> bool {
	let reason = error.and_then(|error| error.get("reason"));
	kind_of(error) == "unreachable" && kind_of(reason) == "listNotReadBack"
}
