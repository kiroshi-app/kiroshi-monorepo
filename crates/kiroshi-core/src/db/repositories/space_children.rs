use rusqlite::{params, Connection};

use crate::db::repositories::bot_spaces;
use crate::db::{Access, DatabaseError};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum SpaceChild {
	Conversation,
	Bot,
	BotHeldAlone,
	Section,
	Turn,
	Message,
	Mission,
	Routine,
	RoutineRun,
}

pub struct SpaceChildrenRepository {
	access: Access,
}

impl SpaceChildrenRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn holds(
		&self,
		space_id: String,
		child: SpaceChild,
		child_id: String,
	) -> Result<bool, DatabaseError> {
		self.access.call(move |connection| Ok(held(connection, &space_id, child, &child_id)?)).await
	}

	pub async fn holds_avatar(
		&self,
		space_id: String,
		avatar_path: String,
	) -> Result<bool, DatabaseError> {
		self.access
			.call(move |connection| {
				Ok(connection
					.prepare_cached(
						"SELECT EXISTS (SELECT 1 FROM bot_spaces
							JOIN bots ON bots.id = bot_spaces.bot_id
							WHERE bot_spaces.space_id = ?1 AND bots.avatar_image_path = ?2)",
					)?
					.query_row(params![space_id, avatar_path], |row| row.get(0))?)
			})
			.await
	}
}

fn held(
	connection: &Connection,
	space_id: &str,
	child: SpaceChild,
	child_id: &str,
) -> rusqlite::Result<bool> {
	let held_query = match child {
		SpaceChild::Bot => return bot_spaces::held(connection, child_id, space_id),
		SpaceChild::BotHeldAlone => {
			"SELECT COUNT(*) > 0 AND COUNT(*) = SUM(space_id = ?2) FROM bot_spaces WHERE bot_id = ?1"
		}
		SpaceChild::Conversation => {
			"SELECT EXISTS (SELECT 1 FROM conversations WHERE id = ?1 AND space_id = ?2)"
		}
		SpaceChild::Section => {
			"SELECT EXISTS (SELECT 1 FROM sections WHERE id = ?1 AND space_id = ?2)"
		}
		SpaceChild::Turn => {
			"SELECT EXISTS (SELECT 1 FROM turns
				JOIN conversations ON conversations.id = turns.conversation_id
				WHERE turns.id = ?1 AND conversations.space_id = ?2)"
		}
		SpaceChild::Message => {
			"SELECT EXISTS (SELECT 1 FROM messages
				JOIN conversations ON conversations.id = messages.conversation_id
				WHERE messages.id = ?1 AND conversations.space_id = ?2)"
		}
		SpaceChild::Mission => {
			"SELECT EXISTS (SELECT 1 FROM missions
				JOIN conversations ON conversations.id = missions.origin_conversation_id
				WHERE missions.id = ?1 AND conversations.space_id = ?2)"
		}
		SpaceChild::Routine => {
			"SELECT EXISTS (SELECT 1 FROM routines
				JOIN conversations ON conversations.id = routines.conversation_id
				WHERE routines.id = ?1 AND conversations.space_id = ?2)"
		}
		SpaceChild::RoutineRun => {
			"SELECT EXISTS (SELECT 1 FROM routine_runs
				JOIN routines ON routines.id = routine_runs.routine_id
				JOIN conversations ON conversations.id = routines.conversation_id
				WHERE routine_runs.id = ?1 AND conversations.space_id = ?2)"
		}
	};
	connection.prepare_cached(held_query)?.query_row(params![child_id, space_id], |row| row.get(0))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};
	use crate::removed_on_drop::RemovedOnDrop;

	const TWO_SPACES: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 257, 1, 1);
		INSERT INTO sections (id, space_id, name, position, created_at)
			VALUES ('s1', 'personal', 'Mine', 0, 1), ('s2', 'work', 'Theirs', 0, 1);
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1),
				('shared', 'Shared', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'work', 1),
				('shared', 'work', 1), ('shared', 'personal', 2);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'personal', 'First', 1, 1),
				('c2', 'topic', 'work', 'Second', 1, 1),
				('t-c1', 'topic', 'personal', 'Thread one', 1, 1),
				('t-c2', 'topic', 'work', 'Thread two', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0), ('c2', 'b2', 'lead', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1), ('t2', 'c2', 1, 1);
		INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
			VALUES ('m1', 'c1', 't1', 1, 'user', 'mine', 'complete', 1),
				('m2', 'c2', 't2', 1, 'user', 'theirs', 'complete', 1);
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
				objective, ticket_platform, ticket_external_id, ticket_url, ticket_title, opened_at)
			VALUES ('mi1', 'c1', 'b1', 't-c1', 'Ship', 'linear', 'L-1', 'https://l.test/1', 'One', 1),
				('mi2', 'c2', 'b2', 't-c2', 'Ship', 'linear', 'L-2', 'https://l.test/2', 'Two', 1);
		INSERT INTO routines (id, conversation_id, bot_id, trigger_source_id, event_filter,
				trigger_config, trigger_key, created_at, title, instruction)
			VALUES ('r1', 'c1', 'b1', 'schedule', '[]', '{}', 'k1', 1, 'Mine', 'Read'),
				('r2', 'c2', 'b2', 'schedule', '[]', '{}', 'k2', 1, 'Theirs', 'Read');
		INSERT INTO routine_runs (id, routine_id, started_at, lease_renewed_at)
			VALUES ('run1', 'r1', 1, 1), ('run2', 'r2', 1, 1);
	";

	async fn planted() -> (Database, RemovedOnDrop) {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| Ok(connection.execute_batch(TWO_SPACES)?))
			.await
			.expect("the two spaces are planted");
		(database, dir)
	}

	#[tokio::test]
	async fn a_child_is_held_by_its_own_space_only_and_an_unknown_one_by_none() {
		let (database, _dir) = planted().await;
		let holds = |space: &str, child: SpaceChild, id: &str| {
			database.space_children().holds(space.to_owned(), child, id.to_owned())
		};

		for (child, mine, theirs) in [
			(SpaceChild::Conversation, "c1", "c2"),
			(SpaceChild::Bot, "b1", "b2"),
			(SpaceChild::Section, "s1", "s2"),
			(SpaceChild::Turn, "t1", "t2"),
			(SpaceChild::Message, "m1", "m2"),
			(SpaceChild::Mission, "mi1", "mi2"),
			(SpaceChild::Routine, "r1", "r2"),
			(SpaceChild::RoutineRun, "run1", "run2"),
		] {
			assert!(holds("personal", child, mine).await.expect("read"), "{child:?}");
			assert!(!holds("personal", child, theirs).await.expect("read"), "{child:?}");
			assert!(holds("work", child, theirs).await.expect("read"), "{child:?}");
			assert!(!holds("personal", child, "unknown").await.expect("read"), "{child:?}");
		}
	}

	#[tokio::test]
	async fn a_bot_is_held_alone_only_by_the_one_space_it_belongs_to() {
		let (database, _dir) = planted().await;
		let held_alone = |space: &str, bot_id: &str| {
			database.space_children().holds(
				space.to_owned(),
				SpaceChild::BotHeldAlone,
				bot_id.to_owned(),
			)
		};

		assert!(held_alone("personal", "b1").await.expect("read"));
		assert!(held_alone("work", "b2").await.expect("read"));
		assert!(!held_alone("personal", "b2").await.expect("read"));
		for space in ["personal", "work"] {
			assert!(!held_alone(space, "shared").await.expect("read"), "{space}");
		}
	}

	#[tokio::test]
	async fn a_bot_without_any_space_row_is_held_alone_by_none() {
		let (database, _dir) = planted().await;
		database
			.call_mut(|connection| {
				Ok(connection.execute_batch(
					"INSERT INTO bots (id, name, model, created_at) VALUES ('stray', 'Stray', 'sonnet', 1);",
				)?)
			})
			.await
			.expect("the stray bot is planted");

		let held = database.space_children().holds(
			"personal".to_owned(),
			SpaceChild::BotHeldAlone,
			"stray".to_owned(),
		);
		assert!(!held.await.expect("read"));
	}

	#[tokio::test]
	async fn a_bot_added_to_a_second_space_is_held_by_both() {
		let (database, _dir) = planted().await;
		let children = database.space_children();

		for space in ["personal", "work"] {
			let held = children.holds(space.to_owned(), SpaceChild::Bot, "shared".to_owned());
			assert!(held.await.expect("read"), "{space}");
		}
	}

	#[tokio::test]
	async fn an_avatar_is_held_by_every_space_its_companion_belongs_to_and_no_other() {
		let (database, _dir) = planted().await;
		database
			.call_mut(|connection| {
				Ok(connection.execute_batch(
					"UPDATE bots SET avatar_image_path = '/a/b1.png' WHERE id = 'b1';
					UPDATE bots SET avatar_image_path = '/a/shared.png' WHERE id = 'shared';",
				)?)
			})
			.await
			.expect("the avatars are recorded");
		let children = database.space_children();

		for (space, path, is_held) in [
			("personal", "/a/b1.png", true),
			("work", "/a/b1.png", false),
			("work", "/a/shared.png", true),
			("personal", "/a/shared.png", true),
			("personal", "/a/unknown.png", false),
		] {
			let held = children.holds_avatar(space.to_owned(), path.to_owned());
			assert_eq!(held.await.expect("read"), is_held, "{space} {path}");
		}
	}
}
