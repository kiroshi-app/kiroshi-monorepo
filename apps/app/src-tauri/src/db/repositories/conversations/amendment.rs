use rusqlite::{params, Connection};

use super::page::{listed_by_id, ListedConversation};
use super::{
	joined, now, refuse_blank_icon, refuse_unknown_colour, refuse_unknown_conversation,
	refuse_unlisted_icon, unseated, write_transaction, Arrival, ConversationError,
	ConversationsRepository,
};
use crate::db::connection::Located;

#[derive(Debug, Clone)]
pub struct ConversationAmendment {
	pub title: Option<String>,
	pub icon: Option<String>,
	pub color: Option<Option<String>>,
	pub seated: Vec<String>,
	pub unseated: Vec<String>,
	pub amended_by: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Amended {
	pub conversation: ListedConversation,
	pub arrivals: Vec<Arrival>,
}

impl ConversationsRepository {
	pub async fn amend_conversation(
		&self,
		id: String,
		amendment: ConversationAmendment,
	) -> Result<Amended, ConversationError> {
		self.call_mut(move |connection| Ok(amended_conversation(connection, &id, &amendment)))
			.await?
			.at("amend_conversation", "conversations")
	}
}

fn amended_conversation(
	connection: &mut Connection,
	id: &str,
	amendment: &ConversationAmendment,
) -> Result<Amended, ConversationError> {
	refuse_blank_icon(amendment.icon.as_deref())?;
	refuse_unlisted_icon(amendment.icon.as_deref(), None)?;
	refuse_unknown_colour(amendment.color.as_ref().and_then(Option::as_deref))?;
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE conversations SET title = COALESCE(?2, title), icon = COALESCE(?3, icon),
			color = CASE WHEN ?4 THEN ?5 ELSE color END, updated_at = ?6
			WHERE id = ?1",
		params![
			id,
			amendment.title,
			amendment.icon,
			amendment.color.is_some(),
			amendment.color.clone().flatten(),
			now()
		],
	)?;
	refuse_unknown_conversation(written, id)?;
	let mut arrivals = Vec::new();
	for bot_id in &amendment.seated {
		arrivals.extend(joined(&transaction, id, bot_id, Some(&amendment.amended_by))?);
	}
	for bot_id in &amendment.unseated {
		unseated(&transaction, id, bot_id)?;
	}
	let conversation = listed_by_id(&transaction, id)?
		.ok_or_else(|| ConversationError::UnknownConversation { id: id.to_owned() })?;
	transaction.commit()?;
	Ok(Amended { conversation, arrivals })
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::conversations::AvatarBlot;
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;

	const A_ROOM: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, name, model, created_at) VALUES
			('b1', 'Shoto', 'sonnet', 1), ('b2', 'Ada', 'sonnet', 1), ('b3', 'Kai', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES
			('b1', 'personal', 1), ('b2', 'personal', 1), ('b3', 'work', 1);
		INSERT INTO conversations
			(id, kind, space_id, title, instructions, icon, color, created_at, updated_at)
			VALUES ('room', 'topic', 'personal', 'Plans', 'Keep it short.', 'Rocket', 'red', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('room', 'b1', 'lead', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'room', 1, 5);
		INSERT INTO messages
			(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'room', 't1', 1, 'user', ' Where to? ', 'complete', 5);
	";

	async fn planted() -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(A_ROOM)?))
			.await
			.expect("the room is planted");
		(database, dir)
	}

	fn an_amendment() -> ConversationAmendment {
		ConversationAmendment {
			title: None,
			icon: None,
			color: None,
			seated: Vec::new(),
			unseated: Vec::new(),
			amended_by: "b1".to_owned(),
		}
	}

	fn present(listed: &ListedConversation) -> Vec<(&str, &str)> {
		listed
			.active
			.conversation
			.seats
			.iter()
			.filter(|seat| seat.left_at.is_none())
			.map(|seat| (seat.bot_id.as_str(), seat.role.as_str()))
			.collect()
	}

	async fn listed(database: &Database) -> ListedConversation {
		database
			.conversations()
			.listed_conversation("room".to_owned())
			.await
			.expect("the room reads")
			.expect("the room is listed")
	}

	#[tokio::test]
	async fn every_field_lands_in_one_call_and_the_instructions_stay() {
		let (database, _dir) = planted().await;

		let amended = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment {
					title: Some("Trip".to_owned()),
					icon: Some("Globe".to_owned()),
					color: Some(None),
					seated: vec!["b2".to_owned()],
					unseated: vec!["b1".to_owned()],
					..an_amendment()
				},
			)
			.await
			.expect("the room is amended");

		let room = &amended.conversation.active.conversation;
		assert_eq!(
			(room.title.as_str(), room.icon.as_deref(), room.color),
			("Trip", Some("Globe"), None)
		);
		assert_eq!(room.instructions, "Keep it short.");
		assert_eq!(room.section_id, None);
		assert_eq!(present(&amended.conversation), vec![("b2", "lead")]);
		assert_eq!(amended.arrivals.len(), 1);
		assert_eq!(amended.arrivals[0].bot_id, "b2");
		assert_eq!(amended.arrivals[0].invited_by_bot_id.as_deref(), Some("b1"));
		assert_eq!(amended.conversation.kind, "topic");
		assert!(!amended.conversation.is_archived);
		let word = amended.conversation.active.last_word.as_ref().expect("the last word reads");
		assert_eq!((word.text.as_deref(), word.at), (Some("Where to?"), 5));
		assert_eq!(amended.conversation, listed(&database).await);
	}

	#[tokio::test]
	async fn a_field_left_out_keeps_what_the_room_wears_and_seats_already_settled_stay() {
		let (database, _dir) = planted().await;

		let amended = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment {
					color: Some(Some("pink".to_owned())),
					seated: vec!["b1".to_owned()],
					unseated: vec!["b2".to_owned()],
					..an_amendment()
				},
			)
			.await
			.expect("the room is amended");

		let room = &amended.conversation.active.conversation;
		assert_eq!(
			(room.title.as_str(), room.icon.as_deref(), room.color),
			("Plans", Some("Rocket"), Some(AvatarBlot::Pink))
		);
		assert_eq!(present(&amended.conversation), vec![("b1", "lead")]);
		assert!(amended.arrivals.is_empty());
	}

	#[tokio::test]
	async fn a_refused_field_writes_none_of_the_others() {
		let (database, _dir) = planted().await;
		let before = listed(&database).await;
		let titled = || ConversationAmendment {
			title: Some("Trip".to_owned()),
			color: Some(None),
			seated: vec!["b2".to_owned()],
			..an_amendment()
		};

		let foreign = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment {
					seated: vec!["b2".to_owned(), "b3".to_owned()],
					..titled()
				},
			)
			.await;
		let unlisted = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment { icon: Some("Message".to_owned()), ..titled() },
			)
			.await;
		let blank = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment { icon: Some(" ".to_owned()), ..titled() },
			)
			.await;
		let teal = database
			.conversations()
			.amend_conversation(
				"room".to_owned(),
				ConversationAmendment { color: Some(Some("teal".to_owned())), ..titled() },
			)
			.await;
		let missing =
			database.conversations().amend_conversation("missing".to_owned(), titled()).await;

		assert!(matches!(foreign, Err(ConversationError::ForeignBot { .. })), "{foreign:?}");
		assert!(
			matches!(&unlisted, Err(ConversationError::UnlistedIcon { icon }) if icon == "Message"),
			"{unlisted:?}"
		);
		assert!(matches!(blank, Err(ConversationError::BlankIcon)), "{blank:?}");
		assert!(matches!(teal, Err(ConversationError::UnknownColour { .. })), "{teal:?}");
		assert!(
			matches!(missing, Err(ConversationError::UnknownConversation { .. })),
			"{missing:?}"
		);
		assert_eq!(listed(&database).await, before);
	}
}
