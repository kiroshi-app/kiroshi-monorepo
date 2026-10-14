use std::collections::HashMap;

use rusqlite::{params, params_from_iter, Connection, Row};

use super::{
	conversation, seats_by_conversation, Conversation, ConversationError, ConversationsRepository,
	Seat, CHAT_KIND, SEAT_COLUMNS, TOPIC_KIND,
};
use crate::db::repositories::keyset::{paged, Keyset, Page};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LastWord {
	pub text: Option<String>,
	pub at: i64,
	pub author_bot_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActiveConversation {
	pub conversation: Conversation,
	pub last_activity_at: i64,
	pub last_word: Option<LastWord>,
	pub solo_bot_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ActivePage {
	pub pinned: Vec<ActiveConversation>,
	pub page: Page<ActiveConversation>,
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
}

const PIN_POSITION: &str =
	"CASE WHEN solo.bot_id IS NULL THEN conversations.pin_position ELSE solo.pin_position END";

fn active_statement(filter: &str, order: &str) -> String {
	format!(
		"SELECT conversations.id AS id, conversations.space_id AS space_id,
			conversations.section_id AS section_id, {PIN_POSITION} AS pin_position,
			conversations.title AS title, conversations.instructions AS instructions,
			conversations.created_at AS created_at, conversations.updated_at AS updated_at,
			conversations.last_activity_at AS last_activity_at, solo.bot_id AS solo_bot_id,
			word.content AS word_text, word.created_at AS word_at,
			word.author_bot_id AS word_author_bot_id
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
			ORDER BY settled.seq DESC LIMIT 1)
		WHERE conversations.space_id = ?1
			AND conversations.kind IN ('{TOPIC_KIND}', '{CHAT_KIND}')
			AND (conversations.kind = '{TOPIC_KIND}' OR solo.bot_id IS NOT NULL) {filter}
		{order}"
	)
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
	})
}

fn last_word(row: &Row<'_>, at: i64) -> rusqlite::Result<LastWord> {
	let text: String = row.get("word_text")?;
	let text = text.trim();
	Ok(LastWord {
		text: (!text.is_empty()).then(|| text.to_owned()),
		at,
		author_bot_id: row.get("word_author_bot_id")?,
	})
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
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
		let blank = LastWord { text: None, at: 20, author_bot_id: None };
		let greeted = LastWord {
			text: Some("hello".to_owned()),
			at: 40,
			author_bot_id: Some("b1".to_owned()),
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

	fn solo_bot_ids(rows: &[ActiveConversation]) -> Vec<(String, Option<String>)> {
		rows.iter().map(|row| (row.conversation.id.clone(), row.solo_bot_id.clone())).collect()
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
		assert_eq!(
			solo_bot_ids(&first.pinned),
			vec![
				("c03".to_owned(), None),
				("solo-pinned".to_owned(), Some("pinned".to_owned())),
				("c05".to_owned(), None),
			]
		);
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
