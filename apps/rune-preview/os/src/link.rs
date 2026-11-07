use std::fmt;

const SCHEME: &str = "kiroshi";

const CONVERSATION_TARGET: &str = "conversation";

const JOIN_TARGET: &str = "join";

const INVITATION_QUERY: &str = "invitation=";

const REFERENCE_LENGTH: usize = 128;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Link {
	Conversation(String),
	Join(String),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Rejected {
	NotKiroshi,
	UnknownTarget,
	NoConversation,
	NoInvitation,
}

impl fmt::Display for Rejected {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		f.write_str(match self {
			Rejected::NotKiroshi => "it is not a kiroshi:// link",
			Rejected::UnknownTarget => "it names neither a conversation nor a join",
			Rejected::NoConversation => "it names no valid conversation id",
			Rejected::NoInvitation => "it names no valid invitation",
		})
	}
}

pub fn parse(raw: &str) -> Result<Link, Rejected> {
	let (scheme, rest) = raw.split_once("://").ok_or(Rejected::NotKiroshi)?;
	if !scheme.eq_ignore_ascii_case(SCHEME) {
		return Err(Rejected::NotKiroshi);
	}
	let split = rest.find(['/', '?', '#']).unwrap_or(rest.len());
	let (target, remainder) = rest.split_at(split);
	match target {
		CONVERSATION_TARGET => conversation_of(remainder),
		JOIN_TARGET => invitation_of(remainder),
		_ => Err(Rejected::UnknownTarget),
	}
}

fn conversation_of(remainder: &str) -> Result<Link, Rejected> {
	let id = remainder.strip_prefix('/').filter(|id| is_reference(id));
	id.map(|id| Link::Conversation(id.to_owned())).ok_or(Rejected::NoConversation)
}

fn invitation_of(remainder: &str) -> Result<Link, Rejected> {
	let reference = remainder
		.strip_prefix('?')
		.and_then(|query| query.strip_prefix(INVITATION_QUERY))
		.filter(|reference| is_reference(reference));
	reference.map(|reference| Link::Join(reference.to_owned())).ok_or(Rejected::NoInvitation)
}

fn is_reference(candidate: &str) -> bool {
	(1..=REFERENCE_LENGTH).contains(&candidate.len())
		&& candidate.chars().all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn an_invitation_link_names_its_invitation() {
		let longest = format!("kiroshi://join?invitation={}", "a".repeat(128));

		assert_eq!(
			parse("kiroshi://join?invitation=inv_3f9A-b2"),
			Ok(Link::Join("inv_3f9A-b2".into()))
		);
		assert_eq!(parse(&longest), Ok(Link::Join("a".repeat(128))));
	}

	#[test]
	fn any_other_kiroshi_join_url_names_no_invitation() {
		let too_long = format!("kiroshi://join?invitation={}", "a".repeat(129));
		let refused = [
			"kiroshi://join#instance-1.aGVsbG8.c2VjcmV0",
			"kiroshi://join?invitation=",
			"kiroshi://join?invitation=a.b",
			"kiroshi://join?invitation=%41",
			"kiroshi://join?invitation=a&invitation=b",
			"kiroshi://join?other=a",
			"kiroshi://join/path?invitation=a",
			"kiroshi://join?invitation=a#x",
			too_long.as_str(),
		];

		for link in refused {
			assert_eq!(parse(link), Err(Rejected::NoInvitation), "{link}");
		}
		assert_eq!(parse("kiroshi://settings?invitation=a"), Err(Rejected::UnknownTarget));
		assert_eq!(parse("https://kiroshi.app/join?invitation=a"), Err(Rejected::NotKiroshi));
	}

	#[test]
	fn a_conversation_link_names_its_conversation() {
		let longest = format!("kiroshi://conversation/{}", "a".repeat(128));

		assert_eq!(
			parse("kiroshi://conversation/3f9A_b-2"),
			Ok(Link::Conversation("3f9A_b-2".into()))
		);
		assert_eq!(
			parse("KIROSHI://conversation/3f9A_b-2"),
			Ok(Link::Conversation("3f9A_b-2".into()))
		);
		assert_eq!(parse(&longest), Ok(Link::Conversation("a".repeat(128))));
	}

	#[test]
	fn any_other_conversation_link_names_no_conversation() {
		let too_long = format!("kiroshi://conversation/{}", "a".repeat(129));
		let refused = [
			"kiroshi://conversation",
			"kiroshi://conversation/",
			"kiroshi://conversation/a.b",
			"kiroshi://conversation/a/b",
			"kiroshi://conversation/%41",
			"kiroshi://conversation/caf\u{e9}",
			"kiroshi://conversation/a b",
			"kiroshi://conversation/a?x=1",
			"kiroshi://conversation/a?",
			"kiroshi://conversation/a#x",
			"kiroshi://conversation?id=a",
			"kiroshi://conversation#a",
			too_long.as_str(),
		];

		for link in refused {
			assert_eq!(parse(link), Err(Rejected::NoConversation), "{link}");
		}
	}

	#[test]
	fn a_link_of_another_scheme_or_target_is_refused() {
		assert_eq!(parse("https://kiroshi.app/conversation/a"), Err(Rejected::NotKiroshi));
		assert_eq!(parse("kiroshi:conversation/a"), Err(Rejected::NotKiroshi));
		assert_eq!(parse("conversation/a"), Err(Rejected::NotKiroshi));
		assert_eq!(parse(""), Err(Rejected::NotKiroshi));
		assert_eq!(parse("kiroshi://Conversation/a"), Err(Rejected::UnknownTarget));
		assert_eq!(parse("kiroshi:///conversation/a"), Err(Rejected::UnknownTarget));
		assert_eq!(parse("kiroshi://conversation.evil/a"), Err(Rejected::UnknownTarget));
	}
}
