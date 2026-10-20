use std::collections::HashMap;

use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Row};

use super::{
	conversation, seats_by_conversation, Conversation, ConversationError, ConversationsRepository,
	Seat, CHAT_KIND, MISSION_KIND, SEAT_COLUMNS, TOPIC_KIND,
};
use crate::db::repositories::keyset::{paged, Keyset, Page};
use crate::db::repositories::messages::{AccountAuthor, WrittenFrom};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastWord {
	pub text: Option<String>,
	pub at: i64,
	pub author_bot_id: Option<String>,
	pub author: AccountAuthor,
	pub written_from: Option<WrittenFrom>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveTurn {
	pub started_at: i64,
	pub bot_ids: Vec<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveConversation {
	pub conversation: Conversation,
	pub last_activity_at: i64,
	pub last_word: Option<LastWord>,
	pub solo_bot_id: Option<String>,
	pub active_turn: Option<ActiveTurn>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivePage {
	pub pinned: Vec<ActiveConversation>,
	pub page: Page<ActiveConversation>,
}

pub const LISTED_KINDS: [&str; 3] = [CHAT_KIND, TOPIC_KIND, MISSION_KIND];

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ListedConversation {
	pub active: ActiveConversation,
	pub kind: String,
	pub is_archived: bool,
}

#[derive(Debug, Clone)]
pub struct Listing {
	pub space_id: String,
	pub kind: Option<String>,
	pub seated_bot_id: Option<String>,
}

impl ConversationsRepository {
	pub async fn conversation_page(
		&self,
		space_id: String,
		after: Option<Keyset>,
		size: u32,
	) -> Result<ActivePage, ConversationError> {
		self.call(move |connection| Ok(page_of_space(connection, &space_id, after.as_ref(), size)))
			.await?
	}

	pub async fn conversation_in_page(
		&self,
		conversation_id: String,
	) -> Result<Option<ActiveConversation>, ConversationError> {
		self.call(move |connection| Ok(active_by_id(connection, &conversation_id))).await?
	}

	pub async fn listed_page(
		&self,
		listing: Listing,
		after: Option<Keyset>,
		size: u32,
	) -> Result<Page<ListedConversation>, ConversationError> {
		self.call(move |connection| Ok(listed_of_space(connection, &listing, after.as_ref(), size)))
			.await?
	}

	pub async fn listed_conversation(
		&self,
		conversation_id: String,
	) -> Result<Option<ListedConversation>, ConversationError> {
		self.call(move |connection| Ok(listed_by_id(connection, &conversation_id))).await?
	}
}

const PIN_POSITION: &str =
	"CASE WHEN solo.bot_id IS NULL THEN conversations.pin_position ELSE solo.pin_position END";

fn active_rows() -> String {
	format!(
		"SELECT conversations.id AS id, conversations.space_id AS space_id,
			conversations.section_id AS section_id, {PIN_POSITION} AS pin_position,
			conversations.title AS title, conversations.instructions AS instructions,
			conversations.icon AS icon, conversations.color AS color,
			conversations.created_at AS created_at, conversations.updated_at AS updated_at,
			conversations.last_activity_at AS last_activity_at, solo.bot_id AS solo_bot_id,
			conversations.kind AS kind, conversations.archived_at AS archived_at,
			word.content AS word_text, word.created_at AS word_at,
			word.author_bot_id AS word_author_bot_id,
			word.author_account_id AS word_author_account_id, word.author_name AS word_author_name,
			word.written_from AS word_written_from,
			(SELECT MIN(open_turn.started_at) FROM turns AS open_turn
				WHERE open_turn.conversation_id = conversations.id
					AND open_turn.completed_at IS NULL) AS open_turn_started_at,
			(SELECT json_group_array(working.bot_id) FROM (
				SELECT reply.author_bot_id AS bot_id FROM turns AS open_turn
					JOIN messages AS reply
						ON reply.turn_id = open_turn.id AND reply.role = 'assistant'
					WHERE open_turn.conversation_id = conversations.id
						AND open_turn.completed_at IS NULL AND reply.author_bot_id IS NOT NULL
				UNION ALL
				SELECT run.bot_id FROM turns AS open_turn
					JOIN turn_runs AS run ON run.turn_id = open_turn.id
					WHERE open_turn.conversation_id = conversations.id
						AND open_turn.completed_at IS NULL) AS working) AS open_turn_bot_ids
		FROM conversations
		LEFT JOIN conversation_participants AS solo_seat
			ON conversations.kind = '{CHAT_KIND}' AND solo_seat.conversation_id = conversations.id
		LEFT JOIN bots AS solo_bot
			ON solo_bot.id = solo_seat.bot_id AND solo_bot.deleted_at IS NULL
		LEFT JOIN bot_spaces AS solo
			ON solo.bot_id = solo_bot.id AND solo.space_id = conversations.space_id
		LEFT JOIN messages AS word ON word.id = (SELECT settled.id FROM messages AS settled
			WHERE settled.conversation_id = conversations.id
				AND settled.completion_state NOT IN ('pending', 'streaming')
			ORDER BY settled.seq DESC LIMIT 1)"
	)
}

fn in_the_feed() -> String {
	format!(
		"conversations.kind IN ('{TOPIC_KIND}', '{CHAT_KIND}') AND conversations.archived_at IS NULL
			AND (conversations.kind = '{TOPIC_KIND}' OR solo.bot_id IS NOT NULL)"
	)
}

fn listed() -> String {
	format!(
		"conversations.kind IN ('{CHAT_KIND}', '{TOPIC_KIND}', '{MISSION_KIND}')
			AND (conversations.kind <> '{CHAT_KIND}' OR solo.bot_id IS NOT NULL)"
	)
}

fn listed_page_statement(after: Option<&Keyset>) -> String {
	let past_the_cursor = match after {
		Some(_) => "AND (conversations.last_activity_at, conversations.id) < (?4, ?5)",
		None => "",
	};
	format!(
		"{}
		WHERE conversations.space_id = ?1 AND {}
			AND (?2 IS NULL OR conversations.kind = ?2)
			AND (?3 IS NULL OR EXISTS (SELECT 1 FROM conversation_participants AS mine
				WHERE mine.conversation_id = conversations.id AND mine.bot_id = ?3
					AND mine.left_at IS NULL))
			{past_the_cursor}
		ORDER BY conversations.last_activity_at DESC, conversations.id DESC LIMIT ?6",
		active_rows(),
		listed()
	)
}

fn listed_by_id_statement() -> String {
	format!("{} WHERE conversations.id = ?1 AND {}", active_rows(), listed())
}

fn active_statement(filter: &str, order: &str) -> String {
	format!(
		"{}
		WHERE conversations.space_id = ?1 AND {} {filter}
		{order}",
		active_rows(),
		in_the_feed()
	)
}

fn by_id_statement() -> String {
	format!("{} WHERE conversations.id = ?1 AND {}", active_rows(), in_the_feed())
}

fn page_statement(after: Option<&Keyset>) -> String {
	let past_the_cursor = match after {
		Some(_) => "AND (conversations.last_activity_at, conversations.id) < (?2, ?3)",
		None => "",
	};
	active_statement(
		&format!("AND {PIN_POSITION} IS NULL {past_the_cursor}"),
		"ORDER BY conversations.last_activity_at DESC, conversations.id DESC LIMIT ?4",
	)
}

fn pinned_statement() -> String {
	active_statement(
		&format!("AND {PIN_POSITION} IS NOT NULL"),
		&format!("ORDER BY {PIN_POSITION} ASC, conversations.id ASC"),
	)
}

fn page_of_space(
	connection: &Connection,
	space_id: &str,
	after: Option<&Keyset>,
	size: u32,
) -> Result<ActivePage, ConversationError> {
	let pinned = match after {
		Some(_) => Vec::new(),
		None => pinned_of_space(connection, space_id)?,
	};
	let mut read = ActivePage { pinned, page: unpinned_page(connection, space_id, after, size)? };
	let ids: Vec<&str> =
		read.pinned.iter().chain(&read.page.rows).map(|row| row.conversation.id.as_str()).collect();
	let mut seats = seats_of_page(connection, &ids)?;
	for row in read.pinned.iter_mut().chain(&mut read.page.rows) {
		row.conversation.seats = seats.remove(&row.conversation.id).unwrap_or_default();
	}
	Ok(read)
}

fn active_by_id(
	connection: &Connection,
	conversation_id: &str,
) -> Result<Option<ActiveConversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&by_id_statement())?;
	let Some(mut row) = statement.query_row([conversation_id], active).optional()? else {
		return Ok(None);
	};
	let mut seats = seats_of_page(connection, &[conversation_id])?;
	row.conversation.seats = seats.remove(conversation_id).unwrap_or_default();
	Ok(Some(row))
}

fn listed_of_space(
	connection: &Connection,
	listing: &Listing,
	after: Option<&Keyset>,
	size: u32,
) -> Result<Page<ListedConversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&listed_page_statement(after))?;
	let rows = statement.query_map(
		params![
			listing.space_id,
			listing.kind,
			listing.seated_bot_id,
			after.map(|keyset| keyset.sort_key),
			after.map(|keyset| keyset.id.as_str()),
			size + 1
		],
		listed_row,
	)?;
	let mut read = paged(rows.collect::<rusqlite::Result<Vec<_>>>()?, size, |row| Keyset {
		sort_key: row.active.last_activity_at,
		id: row.active.conversation.id.clone(),
	});
	let ids: Vec<&str> = read.rows.iter().map(|row| row.active.conversation.id.as_str()).collect();
	let mut seats = seats_of_page(connection, &ids)?;
	for row in &mut read.rows {
		row.active.conversation.seats =
			seats.remove(&row.active.conversation.id).unwrap_or_default();
	}
	Ok(read)
}

pub(super) fn listed_by_id(
	connection: &Connection,
	conversation_id: &str,
) -> Result<Option<ListedConversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&listed_by_id_statement())?;
	let Some(mut row) = statement.query_row([conversation_id], listed_row).optional()? else {
		return Ok(None);
	};
	let mut seats = seats_of_page(connection, &[conversation_id])?;
	row.active.conversation.seats = seats.remove(conversation_id).unwrap_or_default();
	Ok(Some(row))
}

fn pinned_of_space(
	connection: &Connection,
	space_id: &str,
) -> Result<Vec<ActiveConversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&pinned_statement())?;
	let rows = statement.query_map([space_id], active)?;
	Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

fn unpinned_page(
	connection: &Connection,
	space_id: &str,
	after: Option<&Keyset>,
	size: u32,
) -> Result<Page<ActiveConversation>, ConversationError> {
	let mut statement = connection.prepare_cached(&page_statement(after))?;
	let rows = statement.query_map(
		params![
			space_id,
			after.map(|keyset| keyset.sort_key),
			after.map(|keyset| keyset.id.as_str()),
			size + 1
		],
		active,
	)?;
	Ok(paged(rows.collect::<rusqlite::Result<Vec<_>>>()?, size, |row| Keyset {
		sort_key: row.last_activity_at,
		id: row.conversation.id.clone(),
	}))
}

fn seats_of_page(
	connection: &Connection,
	ids: &[&str],
) -> Result<HashMap<String, Vec<Seat>>, ConversationError> {
	if ids.is_empty() {
		return Ok(HashMap::new());
	}
	let slots: Vec<String> = (1..=ids.len()).map(|slot| format!("?{slot}")).collect();
	let mut statement = connection.prepare(&format!(
		"{SEAT_COLUMNS} WHERE seat.conversation_id IN ({})
		ORDER BY seat.conversation_id ASC, seat.join_seq ASC",
		slots.join(", ")
	))?;
	seats_by_conversation(&mut statement, params_from_iter(ids))
}

fn active(row: &Row<'_>) -> rusqlite::Result<ActiveConversation> {
	Ok(ActiveConversation {
		conversation: conversation(row)?,
		last_activity_at: row.get("last_activity_at")?,
		last_word: row
			.get::<_, Option<i64>>("word_at")?
			.map(|at| last_word(row, at))
			.transpose()?,
		solo_bot_id: row.get("solo_bot_id")?,
		active_turn: row
			.get::<_, Option<i64>>("open_turn_started_at")?
			.map(|started_at| active_turn(row, started_at))
			.transpose()?,
	})
}

fn listed_row(row: &Row<'_>) -> rusqlite::Result<ListedConversation> {
	Ok(ListedConversation {
		active: active(row)?,
		kind: row.get("kind")?,
		is_archived: row.get::<_, Option<i64>>("archived_at")?.is_some(),
	})
}

fn active_turn(row: &Row<'_>, started_at: i64) -> rusqlite::Result<ActiveTurn> {
	let bot_ids: String = row.get("open_turn_bot_ids")?;
	let mut bot_ids: Vec<String> = serde_json::from_str(&bot_ids).map_err(|error| {
		rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
	})?;
	bot_ids.sort_unstable();
	bot_ids.dedup();
	Ok(ActiveTurn { started_at, bot_ids })
}

fn last_word(row: &Row<'_>, at: i64) -> rusqlite::Result<LastWord> {
	let text: String = row.get("word_text")?;
	let text = text.trim();
	Ok(LastWord {
		text: (!text.is_empty()).then(|| text.to_owned()),
		at,
		author_bot_id: row.get("word_author_bot_id")?,
		author: AccountAuthor {
			account_id: row.get("word_author_account_id")?,
			name: row.get("word_author_name")?,
		},
		written_from: row.get("word_written_from")?,
	})
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::messages::{
		EndedRun, NewAssistantMessage, NewTurn, TerminalState,
	};
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;

	const A_SEATED_BOT: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
	";

	async fn planted(rows: String) -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(move |connection| Ok(connection.execute_batch(&rows)?))
			.await
			.expect("the rows are planted");
		(database, dir)
	}

	fn a_room(id: &str, created_at: i64) -> String {
		format!(
			"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
				VALUES ('{id}', 'topic', 'personal', '{id}', {created_at}, {created_at});"
		)
	}

	fn rooms(count: usize, created_at: impl Fn(usize) -> i64) -> String {
		(1..=count).map(|n| a_room(&format!("c{n:02}"), created_at(n))).collect()
	}

	fn said(conversation_id: &str, seq: u32, state: &str, content: &str, at: i64) -> String {
		format!(
			"INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('t-{conversation_id}-{seq}', '{conversation_id}', {seq}, {at});
			INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m-{conversation_id}-{seq}', '{conversation_id}',
					't-{conversation_id}-{seq}', {seq}, 'user', '{content}', '{state}', {at});"
		)
	}

	async fn page(database: &Database, after: Option<Keyset>, size: u32) -> ActivePage {
		database
			.conversations()
			.conversation_page("personal".to_owned(), after, size)
			.await
			.expect("the page reads")
	}

	fn ids(rows: &[ActiveConversation]) -> Vec<String> {
		rows.iter().map(|row| row.conversation.id.clone()).collect()
	}

	async fn walked(database: &Database, mut after: Option<Keyset>, size: u32) -> Vec<Vec<String>> {
		let mut pages = Vec::new();
		loop {
			let read = page(database, after, size).await;
			pages.push(ids(&read.page.rows));
			match read.page.next {
				Some(next) => after = Some(next),
				None => return pages,
			}
		}
	}

	#[tokio::test]
	async fn a_conversation_read_by_id_is_its_page_row_and_an_absent_one_is_no_row() {
		let (database, _dir) = planted(format!("{A_SEATED_BOT}{}", rooms(2, |n| n as i64))).await;
		let conversations = database.conversations();

		let page = conversations.conversation_page("personal".to_owned(), None, 10).await;
		let by_id = conversations.conversation_in_page("c01".to_owned()).await;
		let absent = conversations.conversation_in_page("absent".to_owned()).await;

		let paged = page
			.expect("the page reads")
			.page
			.rows
			.into_iter()
			.find(|row| row.conversation.id == "c01");
		assert_eq!(by_id.expect("the row reads"), paged);
		assert_eq!(absent.expect("the read succeeds"), None);
	}

	#[tokio::test]
	async fn a_mission_thread_read_by_id_is_no_row_beside_a_room_of_the_same_space() {
		let mission =
			"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('m01', 'mission', 'personal', 'Mission', 1, 1);";
		let (database, _dir) =
			planted(format!("{A_SEATED_BOT}{}{mission}", a_room("c01", 1))).await;
		let conversations = database.conversations();

		let mission = conversations.conversation_in_page("m01".to_owned()).await;
		let room = conversations.conversation_in_page("c01".to_owned()).await;

		assert_eq!(mission.expect("the read succeeds"), None);
		assert_eq!(
			room.expect("the row reads").map(|row| row.conversation.id),
			Some("c01".to_owned())
		);
	}

	#[tokio::test]
	async fn rooms_sharing_their_activity_across_a_page_boundary_come_back_once_each() {
		let (database, _dir) = planted(rooms(7, |_| 5)).await;

		let pages = walked(&database, None, 3).await;

		assert_eq!(
			pages,
			vec![vec!["c07", "c06", "c05"], vec!["c04", "c03", "c02"], vec!["c01"],],
			"the tie on the activity was not broken by the id"
		);
	}

	#[tokio::test]
	async fn a_message_landing_on_a_room_already_read_repeats_and_skips_nothing() {
		let (database, _dir) = planted(rooms(6, |n| n as i64)).await;
		let first = page(&database, None, 2).await;
		database
			.call_mut(|connection| {
				Ok(connection.execute_batch(&said("c05", 1, "complete", "hi", 100))?)
			})
			.await
			.expect("the message lands");

		let rest = walked(&database, first.page.next.clone(), 2).await;

		assert_eq!(ids(&first.page.rows), vec!["c06", "c05"]);
		assert_eq!(rest, vec![vec!["c04", "c03"], vec!["c02", "c01"]]);
		assert_eq!(
			ids(&page(&database, None, 2).await.page.rows),
			vec!["c05", "c06"],
			"the room did not move up"
		);
	}

	#[tokio::test]
	async fn the_last_word_is_the_newest_settled_message_trimmed_with_the_seats_of_its_room() {
		let rows = format!(
			"{A_SEATED_BOT}{}{}{}
			INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('greeted', 'b1', 'lead', 1, 0);
			{}{}{}{}
			INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('t-greeted', 'greeted', 1, 40);
			INSERT INTO messages (id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at)
				VALUES ('m-greeted', 'greeted', 't-greeted', 'b1', 1, 'assistant',
					' hello' || char(10), 'complete', 40);",
			a_room("blank", 1),
			a_room("greeted", 2),
			a_room("pending", 3),
			said("blank", 1, "complete", "  first  ", 10),
			said("blank", 2, "failed", "   ", 20),
			said("blank", 3, "streaming", "partial", 30),
			said("pending", 1, "pending", "", 50),
		);
		let (database, _dir) = planted(format!("{rows}{}", a_room("silent", 4))).await;

		let read = page(&database, None, 30).await;

		let words: Vec<(&str, i64, Option<&LastWord>, usize)> = read
			.page
			.rows
			.iter()
			.map(|row| {
				(
					row.conversation.id.as_str(),
					row.last_activity_at,
					row.last_word.as_ref(),
					row.conversation.seats.len(),
				)
			})
			.collect();
		let blank = LastWord {
			text: None,
			at: 20,
			author_bot_id: None,
			author: AccountAuthor::default(),
			written_from: None,
		};
		let greeted = LastWord {
			text: Some("hello".to_owned()),
			at: 40,
			author_bot_id: Some("b1".to_owned()),
			author: AccountAuthor::default(),
			written_from: None,
		};
		assert_eq!(
			words,
			vec![
				("pending", 50, None, 0),
				("greeted", 40, Some(&greeted), 1),
				("blank", 30, Some(&blank), 0),
				("silent", 4, None, 0),
			]
		);
		assert_eq!(read.page.next, None);
	}

	#[tokio::test]
	async fn the_last_word_names_the_person_who_wrote_it_and_no_person_for_a_bot() {
		let rows = format!(
			"{A_SEATED_BOT}{}{}
			INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('answered', 'b1', 'lead', 1, 0);
			INSERT INTO turns (id, conversation_id, seq, started_at)
				VALUES ('t-asked', 'asked', 1, 10), ('t-answered', 'answered', 1, 10);
			INSERT INTO messages (id, conversation_id, turn_id, author_bot_id, seq, role, content,
					completion_state, created_at, author_account_id, author_name, written_from)
				VALUES
					('m-asked', 'asked', 't-asked', NULL, 1, 'user', 'question', 'complete', 10,
						'acc-ada', 'Ada', 'relay'),
					('m-answered-ask', 'answered', 't-answered', NULL, 1, 'user', 'question',
						'complete', 10, 'acc-ada', 'Ada', 'relay'),
					('m-answered', 'answered', 't-answered', 'b1', 2, 'assistant', 'answer',
						'complete', 20, NULL, NULL, NULL);",
			a_room("asked", 1),
			a_room("answered", 2),
		);
		let (database, _dir) = planted(rows).await;

		let read = page(&database, None, 30).await;

		let words: Vec<(&str, Option<&LastWord>)> = read
			.page
			.rows
			.iter()
			.map(|row| (row.conversation.id.as_str(), row.last_word.as_ref()))
			.collect();
		let asked = LastWord {
			text: Some("question".to_owned()),
			at: 10,
			author_bot_id: None,
			author: AccountAuthor {
				account_id: Some("acc-ada".to_owned()),
				name: Some("Ada".to_owned()),
			},
			written_from: Some(WrittenFrom::Relay),
		};
		let answered = LastWord {
			text: Some("answer".to_owned()),
			at: 20,
			author_bot_id: Some("b1".to_owned()),
			author: AccountAuthor::default(),
			written_from: None,
		};
		assert_eq!(words, vec![("answered", Some(&answered)), ("asked", Some(&asked))]);
	}

	#[tokio::test]
	async fn pinned_rooms_lead_the_first_page_in_pin_order_and_stay_out_of_the_walk() {
		let rows = format!(
			"{A_SEATED_BOT}{}
			UPDATE conversations SET pin_position = 1 WHERE id = 'c03';
			UPDATE conversations SET pin_position = 2 WHERE id = 'c01';
			UPDATE conversations SET pin_position = 2 WHERE id = 'c02';
			INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('c01', 'b1', 'lead', 1, 0);
			{}",
			rooms(35, |n| n as i64),
			said("c01", 1, "complete", "pinned word", 0),
		);
		let (database, _dir) = planted(rows).await;

		let first = page(&database, None, 30).await;
		let pages = walked(&database, None, 30).await;
		let later = page(&database, first.page.next.clone(), 30).await;

		let pinned_c01 = first.pinned.iter().find(|row| row.conversation.id == "c01");
		let unpinned: Vec<String> = (4..=35).rev().map(|n| format!("c{n:02}")).collect();
		assert_eq!(ids(&first.pinned), vec!["c03", "c01", "c02"]);
		assert_eq!(first.page.rows.len(), 30);
		assert_eq!(pages.iter().map(Vec::len).collect::<Vec<_>>(), vec![30, 2]);
		assert_eq!(pages.concat(), unpinned, "the walk did not answer each unpinned room once");
		assert_eq!(later.pinned, Vec::new(), "a later page answered the pinned rooms again");
		assert_eq!(pinned_c01.map(|row| row.conversation.seats.len()), Some(1));
		assert_eq!(
			pinned_c01.and_then(|row| row.last_word.as_ref()).and_then(|word| word.text.clone()),
			Some("pinned word".to_owned())
		);
	}

	fn a_companion(id: &str, pin_position: &str, deleted_at: &str) -> String {
		format!(
			"INSERT INTO bots (id, name, model, created_at, deleted_at)
				VALUES ('{id}', '{id}', 'sonnet', 1, {deleted_at});
			INSERT INTO bot_spaces (bot_id, space_id, pin_position, joined_at)
				VALUES ('{id}', 'personal', {pin_position}, 1);"
		)
	}

	fn a_solo(id: &str, bot_id: &str, created_at: i64) -> String {
		format!(
			"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
				VALUES ('{id}', 'main', 'personal', 'Chat', {created_at}, {created_at});
			INSERT INTO conversation_participants
				(conversation_id, bot_id, role, joined_at, join_seq)
				VALUES ('{id}', '{bot_id}', 'assistant', {created_at}, 0);"
		)
	}

	#[tokio::test]
	async fn each_companion_solo_is_paged_once_beside_the_rooms_and_pinned_by_its_companion() {
		let rows = [
			a_companion("pinned", "1", "NULL"),
			a_companion("loose", "NULL", "NULL"),
			a_companion("silent", "NULL", "NULL"),
			a_companion("deleted", "NULL", "9"),
			a_solo("solo-pinned", "pinned", 5),
			a_solo("solo-loose", "loose", 6),
			a_solo("solo-deleted", "deleted", 50),
			said("solo-loose", 1, "complete", "hi there", 30),
			rooms(5, |n| n as i64 * 10),
			"UPDATE conversations SET pin_position = 1 WHERE id = 'c03';
			UPDATE conversations SET pin_position = 2 WHERE id = 'c05';"
				.to_owned(),
		]
		.concat();
		let (database, _dir) = planted(rows).await;

		let first = page(&database, None, 2).await;
		let pages = walked(&database, None, 2).await;
		let later = page(&database, first.page.next.clone(), 2).await;

		let loose = first.page.rows.iter().find(|row| row.conversation.id == "solo-loose");
		let pinned: Vec<(&str, Option<&str>)> = first
			.pinned
			.iter()
			.map(|row| (row.conversation.id.as_str(), row.solo_bot_id.as_deref()))
			.collect();
		assert_eq!(pinned, vec![("c03", None), ("solo-pinned", Some("pinned")), ("c05", None)]);
		assert_eq!(pages, vec![vec!["c04", "solo-loose"], vec!["c02", "c01"]]);
		assert_eq!(later.pinned, Vec::new(), "a later page answered the pinned rows again");
		assert_eq!(loose.map(|row| row.solo_bot_id.as_deref()), Some(Some("loose")));
		assert_eq!(loose.map(|row| row.last_activity_at), Some(30));
		assert_eq!(
			loose.and_then(|row| row.last_word.as_ref()).and_then(|word| word.text.as_deref()),
			Some("hi there")
		);
		assert_eq!(loose.map(|row| row.conversation.seats.len()), Some(1));
		assert_eq!(first.pinned[1].conversation.pin_position, Some(1));
	}

	#[tokio::test]
	async fn the_solo_of_a_companion_gone_from_the_space_is_left_out() {
		let rows = format!(
			"{}{}{}DELETE FROM bot_spaces WHERE bot_id = 'gone';",
			a_companion("gone", "NULL", "NULL"),
			a_solo("solo-gone", "gone", 1),
			a_room("c01", 2),
		);
		let (database, _dir) = planted(rows).await;

		let read = page(&database, None, 30).await;

		assert_eq!(ids(&read.pinned), Vec::<String>::new());
		assert_eq!(ids(&read.page.rows), vec!["c01"]);
	}

	const A_ROOM_OF_TWO_BOTS_MID_TURN: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b2', 'personal', 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c01', 'b1', 'lead', 1, 0), ('c01', 'b2', 'assistant', 1, 1);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'c01', 1, 40);
	";

	async fn a_room_mid_turn() -> (Database, RemovedOnDrop) {
		planted(format!("{A_SEATED_BOT}{}{A_ROOM_OF_TWO_BOTS_MID_TURN}", a_room("c01", 1))).await
	}

	async fn reply_opened(database: &Database, id: &str, turn_id: &str, bot_id: &str) {
		database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				id: id.to_owned(),
				conversation_id: "c01".to_owned(),
				turn_id: turn_id.to_owned(),
				author_bot_id: Some(bot_id.to_owned()),
				replied_to_message_id: None,
				created_at: 41,
			})
			.await
			.expect("the reply opens");
	}

	async fn settled(database: &Database, id: &str, state: TerminalState) {
		database
			.messages()
			.finalize_message(id.to_owned(), state, None)
			.await
			.expect("the reply settles");
	}

	async fn completed(database: &Database, turn_id: &str) {
		database
			.messages()
			.complete_turn(turn_id.to_owned(), 60)
			.await
			.expect("the turn completes");
	}

	async fn active_turn_of_c01(database: &Database) -> Option<ActiveTurn> {
		let by_id = database
			.conversations()
			.conversation_in_page("c01".to_owned())
			.await
			.expect("the row reads")
			.expect("the room is in the page");
		let paged = page(database, None, 10).await.page.rows.into_iter().next();
		assert_eq!(paged.as_ref(), Some(&by_id), "the page row and the row by id differ");
		by_id.active_turn
	}

	fn open_turn_of(started_at: i64, bot_ids: &[&str]) -> Option<ActiveTurn> {
		Some(ActiveTurn {
			started_at,
			bot_ids: bot_ids.iter().map(|id| (*id).to_owned()).collect(),
		})
	}

	#[tokio::test]
	async fn a_turn_without_a_reply_yet_is_open_with_no_bot() {
		let (database, _dir) = a_room_mid_turn().await;

		assert_eq!(active_turn_of_c01(&database).await, open_turn_of(40, &[]));
	}

	#[tokio::test]
	async fn a_turn_stays_open_across_its_settled_replies_until_it_completes() {
		let (database, _dir) = a_room_mid_turn().await;

		reply_opened(&database, "r1", "t1", "b2").await;
		reply_opened(&database, "r2", "t1", "b1").await;
		database.messages().append_text("r1".into(), "half".into()).await.expect("a delta");
		let streaming = active_turn_of_c01(&database).await;
		settled(&database, "r1", TerminalState::Complete).await;
		settled(&database, "r2", TerminalState::Failed).await;
		let between_replies = active_turn_of_c01(&database).await;
		reply_opened(&database, "r3", "t1", "b2").await;
		settled(&database, "r3", TerminalState::Cancelled).await;
		let all_settled = active_turn_of_c01(&database).await;
		completed(&database, "t1").await;
		let after = active_turn_of_c01(&database).await;

		assert_eq!(streaming, open_turn_of(40, &["b1", "b2"]));
		assert_eq!(between_replies, open_turn_of(40, &["b1", "b2"]));
		assert_eq!(all_settled, open_turn_of(40, &["b1", "b2"]));
		assert_eq!(after, None);
	}

	#[tokio::test]
	async fn the_earliest_open_turn_dates_the_open_turn_and_every_open_turn_names_its_bots() {
		let later = "INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t2', 'c01', 2, 50), ('t0', 'c01', 0, 30);";
		let (database, _dir) = a_room_mid_turn().await;
		database
			.call_mut(move |connection| Ok(connection.execute_batch(later)?))
			.await
			.expect("the turns are planted");
		reply_opened(&database, "r0", "t0", "b1").await;
		reply_opened(&database, "r2", "t2", "b2").await;
		completed(&database, "t0").await;

		assert_eq!(active_turn_of_c01(&database).await, open_turn_of(40, &["b2"]));
	}

	#[tokio::test]
	async fn a_completed_turn_is_closed_whatever_its_replies_still_read() {
		let (database, _dir) = a_room_mid_turn().await;
		reply_opened(&database, "r1", "t1", "b1").await;

		completed(&database, "t1").await;

		assert_eq!(active_turn_of_c01(&database).await, None);
	}

	#[tokio::test]
	async fn the_restart_sweep_closes_the_turn_a_crash_left_open() {
		let (database, _dir) = a_room_mid_turn().await;
		reply_opened(&database, "r1", "t1", "b1").await;

		database.messages().recover_unfinished().await.expect("the sweep runs");

		assert_eq!(active_turn_of_c01(&database).await, None);
	}

	async fn run_started(database: &Database, bot_id: &str) {
		let turn =
			NewTurn { id: "t1".to_owned(), conversation_id: "c01".to_owned(), started_at: 41 };
		database.messages().start_run(turn, bot_id.to_owned()).await.expect("the run starts");
	}

	async fn run_ended(database: &Database, bot_id: &str) {
		run_ended_handing_to(database, bot_id, &[]).await;
	}

	async fn run_ended_handing_to(database: &Database, bot_id: &str, handed_to: &[&str]) {
		let ended = EndedRun {
			turn_id: "t1".to_owned(),
			bot_id: bot_id.to_owned(),
			handed_to: handed_to.iter().map(|handed| (*handed).to_owned()).collect(),
			ended_at: 60,
		};
		database.messages().end_run(ended).await.expect("the run ends");
	}

	#[tokio::test]
	async fn a_turn_stays_open_while_a_bot_still_runs_on_it_and_names_the_bots_running() {
		let (database, _dir) = a_room_mid_turn().await;

		run_started(&database, "b1").await;
		run_started(&database, "b2").await;
		let both_running = active_turn_of_c01(&database).await;
		reply_opened(&database, "r1", "t1", "b1").await;
		run_ended(&database, "b1").await;
		let one_ended = active_turn_of_c01(&database).await;
		run_ended(&database, "b2").await;

		assert_eq!(both_running, open_turn_of(40, &["b1", "b2"]));
		assert_eq!(one_ended, open_turn_of(40, &["b1", "b2"]));
		assert_eq!(active_turn_of_c01(&database).await, None);
	}

	#[tokio::test]
	async fn a_bot_abandoned_before_its_run_leaves_the_turn_to_the_bot_still_awaited() {
		let (database, _dir) = a_room_mid_turn().await;
		let messages = database.messages();

		messages
			.await_runs("t1".to_owned(), vec!["b1".to_owned(), "b2".to_owned()])
			.await
			.expect("the runs are awaited");
		messages.abandon_run("t1".to_owned(), "b1".to_owned(), 50).await.expect("abandoned");
		let one_abandoned = active_turn_of_c01(&database).await;
		run_started(&database, "b2").await;
		run_ended(&database, "b2").await;

		assert_eq!(one_abandoned, open_turn_of(40, &["b2"]));
		assert_eq!(active_turn_of_c01(&database).await, None);
	}

	#[tokio::test]
	async fn a_run_started_on_a_completed_turn_reopens_it() {
		let (database, _dir) = a_room_mid_turn().await;
		completed(&database, "t1").await;

		run_started(&database, "b2").await;

		assert_eq!(active_turn_of_c01(&database).await, open_turn_of(40, &["b2"]));
	}

	async fn awaited(database: &Database, bot_ids: &[&str]) {
		let bot_ids = bot_ids.iter().map(|bot_id| (*bot_id).to_owned()).collect();
		database.messages().await_runs("t1".to_owned(), bot_ids).await.expect("the runs wait");
	}

	async fn expired(database: &Database, bot_id: &str) -> bool {
		database
			.messages()
			.expire_awaited_run("t1".to_owned(), bot_id.to_owned(), 70)
			.await
			.expect("the expiry runs")
	}

	async fn runs_of_t1(database: &Database) -> Vec<(String, String)> {
		database
			.call(|connection| {
				let mut runs = connection.prepare(
					"SELECT bot_id, state FROM turn_runs WHERE turn_id = 't1' ORDER BY bot_id",
				)?;
				let rows = runs.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?;
				Ok(rows.collect::<Result<Vec<_>, _>>()?)
			})
			.await
			.expect("the runs read")
	}

	#[tokio::test]
	async fn an_awaited_turn_run_past_its_start_deadline_is_released_and_completes_the_turn() {
		let (database, _dir) = a_room_mid_turn().await;
		run_started(&database, "b1").await;
		run_ended_handing_to(&database, "b1", &["b2"]).await;
		let while_awaited = active_turn_of_c01(&database).await;

		let released = expired(&database, "b2").await;

		assert!(while_awaited.is_some(), "the handover closed the turn");
		assert!(released, "the awaited run was kept");
		assert_eq!(runs_of_t1(&database).await, Vec::new());
		assert_eq!(active_turn_of_c01(&database).await, None);
	}

	#[tokio::test]
	async fn a_turn_run_started_before_its_start_deadline_is_untouched_by_the_deadline() {
		let (database, _dir) = a_room_mid_turn().await;
		awaited(&database, &["b1"]).await;
		run_started(&database, "b1").await;
		let before = active_turn_of_c01(&database).await;

		let released = expired(&database, "b1").await;

		assert!(!released, "a started run was released");
		assert_eq!(runs_of_t1(&database).await, vec![("b1".to_owned(), "running".to_owned())]);
		assert_eq!(active_turn_of_c01(&database).await, before);
	}

	#[tokio::test]
	async fn a_running_turn_run_keeps_the_turn_open_past_the_start_deadline_of_an_awaited_bot() {
		let (database, _dir) = a_room_mid_turn().await;
		run_started(&database, "b1").await;
		awaited(&database, &["b2"]).await;

		let released = expired(&database, "b2").await;

		assert!(released, "the awaited run was kept");
		assert_eq!(runs_of_t1(&database).await, vec![("b1".to_owned(), "running".to_owned())]);
		assert_eq!(active_turn_of_c01(&database).await, open_turn_of(40, &["b1"]));
	}

	#[tokio::test]
	async fn an_awaited_bot_starting_after_its_turn_run_expired_reopens_the_turn() {
		let (database, _dir) = a_room_mid_turn().await;
		run_started(&database, "b1").await;
		run_ended_handing_to(&database, "b1", &["b2"]).await;
		expired(&database, "b2").await;
		let after_the_deadline = active_turn_of_c01(&database).await;

		run_started(&database, "b2").await;

		assert_eq!(after_the_deadline, None);
		assert_eq!(active_turn_of_c01(&database).await, open_turn_of(40, &["b2"]));
	}

	#[tokio::test]
	async fn the_restart_sweep_closes_a_turn_bots_still_ran_on_and_forgets_their_runs() {
		let (database, _dir) = a_room_mid_turn().await;
		run_started(&database, "b1").await;
		run_started(&database, "b2").await;

		database.messages().recover_unfinished().await.expect("the sweep runs");
		let runs_left: i64 = database
			.call(|connection| {
				Ok(connection.query_row("SELECT COUNT(*) FROM turn_runs", [], |row| row.get(0))?)
			})
			.await
			.expect("the runs count");

		assert_eq!(active_turn_of_c01(&database).await, None);
		assert_eq!(runs_left, 0, "the sweep left runs behind");
	}

	#[tokio::test]
	async fn the_open_turn_reads_its_turns_and_replies_through_their_indexes() {
		let (database, _dir) = planted(String::new()).await;

		for statement in [page_statement(None), by_id_statement()] {
			let plan = plan(&database, statement).await;

			for table in ["open_turn", "reply", "run"] {
				assert!(
					plan.iter().any(|step| step.starts_with(&format!("SEARCH {table} USING"))),
					"the open turn reads no {table} through an index: {plan:?}"
				);
				assert!(
					!plan.iter().any(|step| step.starts_with(&format!("SCAN {table}"))),
					"the open turn scans every {table}: {plan:?}"
				);
			}
		}
	}

	async fn plan(database: &Database, statement: String) -> Vec<String> {
		database
			.call(move |connection| {
				let mut explained =
					connection.prepare(&format!("EXPLAIN QUERY PLAN {statement}"))?;
				let slots = params!["personal", 1, "c01", 31];
				let bound = slots.iter().take(explained.parameter_count());
				let steps = explained
					.query_map(params_from_iter(bound), |row| row.get::<_, String>(3))?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(steps)
			})
			.await
			.expect("the query plan")
	}

	#[tokio::test]
	async fn every_page_reads_its_rows_through_the_activity_index_with_no_sort() {
		let (database, _dir) = planted(String::new()).await;
		let cursor = Keyset { sort_key: 1, id: "c01".to_owned() };

		for after in [None, Some(cursor)] {
			let plan = plan(&database, page_statement(after.as_ref())).await;

			assert!(
				plan.iter().any(|step| step.contains("conversations_and_solos_by_activity")),
				"the page does not read its rows through their activity index: {plan:?}"
			);
			assert!(
				!plan.iter().any(|step| step.contains("TEMP B-TREE")),
				"the page sorts its rows apart from the index: {plan:?}"
			);
		}
	}

	#[tokio::test]
	async fn no_read_of_the_page_scans_every_conversation() {
		let (database, _dir) = planted(String::new()).await;
		let cursor = Keyset { sort_key: 1, id: "c01".to_owned() };

		for statement in [pinned_statement(), page_statement(None), page_statement(Some(&cursor))] {
			let plan = plan(&database, statement).await;

			assert!(
				!plan.iter().any(|step| step.starts_with("SCAN conversations")),
				"the page scans every conversation: {plan:?}"
			);
		}
	}
}
