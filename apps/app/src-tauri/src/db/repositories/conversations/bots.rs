use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};
use uuid::Uuid;

use super::super::{bot_spaces, sections};
use super::avatar::AvatarBlot;
use super::{
	ensure_chat_in, now, refuse_if_untouched, space_of, unserializable, write_transaction,
	ConversationError, CHAT_KIND, DEFAULT_BOT_ID, DEFAULT_BOT_MODEL, DEFAULT_BOT_NAME,
};
use crate::bundles::{BotPermissions, EffortLevel};

#[derive(Debug, PartialEq, Eq)]
pub struct Bot {
	pub id: String,
	pub section_id: Option<String>,
	pub pin_position: Option<i64>,
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub instructions: String,
	pub memory: String,
	pub denied_tools: Vec<String>,
	pub permissions: Option<BotPermissions>,
	pub effort: Option<EffortLevel>,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BotIdentity {
	pub name: String,
	pub title: String,
	pub model: String,
	pub avatar_blot: Option<AvatarBlot>,
	pub avatar_image_path: Option<String>,
	pub instructions: String,
	pub denied_tools: Vec<String>,
	pub effort: Option<EffortLevel>,
}

impl From<Bot> for BotIdentity {
	fn from(bot: Bot) -> Self {
		Self {
			name: bot.name,
			title: bot.title,
			model: bot.model,
			avatar_blot: bot.avatar_blot,
			avatar_image_path: bot.avatar_image_path,
			instructions: bot.instructions,
			denied_tools: bot.denied_tools,
			effort: bot.effort,
		}
	}
}

pub(super) const BOT_COLUMNS: &str = "SELECT bots.id, membership.section_id,
		membership.pin_position, bots.name, bots.title, bots.model,
		bots.avatar_color,
		bots.avatar_image_path, bots.instructions, bots.memory,
		bots.denied_tools, bots.permissions, bots.effort, bots.created_at
	FROM bots JOIN bot_spaces AS membership ON membership.bot_id = bots.id";

const OLDEST_MEMBERSHIP: &str = "membership.space_id = (SELECT space_id FROM bot_spaces
		WHERE bot_id = bots.id ORDER BY joined_at ASC, space_id ASC LIMIT 1)";

const BOT_ORDER: &str = "ORDER BY bots.created_at ASC, bots.id ASC";

pub(super) const RANKED_BY_PRESENCE_IN_SPACE: &str = "LEFT JOIN (SELECT seat.bot_id,
		count(DISTINCT seat.conversation_id) AS seated
		FROM conversation_participants AS seat
		JOIN conversations ON conversations.id = seat.conversation_id
		WHERE conversations.space_id = ?1 AND conversations.kind = ?3
			AND seat.left_at IS NULL AND conversations.id IS NOT ?2
		GROUP BY seat.bot_id) AS presence ON presence.bot_id = bots.id
	WHERE bots.deleted_at IS NULL AND membership.space_id = ?1
	ORDER BY coalesce(presence.seated, 0) DESC, bots.name ASC, bots.id ASC";

pub(super) const LIVE_BOT: &str = "SELECT EXISTS
	(SELECT 1 FROM bots WHERE id = ?1 AND deleted_at IS NULL)";

pub(super) fn ensured_default_bot(connection: &mut Connection) -> Result<Bot, ConversationError> {
	if let Some(stored) = stored_default_bot(connection)? {
		return Ok(stored);
	}
	let transaction = write_transaction(connection)?;
	let seeded = seed_default_bot(&transaction)?;
	transaction.commit()?;
	Ok(seeded)
}

pub(super) fn stored_default_bot(
	connection: &Connection,
) -> Result<Option<Bot>, ConversationError> {
	Ok(bot_at(connection, DEFAULT_BOT_ID)?)
}

pub(super) fn bot_at(connection: &Connection, id: &str) -> rusqlite::Result<Option<Bot>> {
	connection
		.prepare_cached(&format!("{BOT_COLUMNS} WHERE bots.id = ?1 AND {OLDEST_MEMBERSHIP}"))?
		.query_row([id], bot)
		.optional()
}

pub(super) fn bot_in(
	connection: &Connection,
	id: &str,
	space_id: &str,
) -> rusqlite::Result<Option<Bot>> {
	connection
		.prepare_cached(&format!("{BOT_COLUMNS} WHERE bots.id = ?1 AND membership.space_id = ?2"))?
		.query_row(params![id, space_id], bot)
		.optional()
}

fn stored_bot(connection: &Connection, id: &str) -> Result<Bot, ConversationError> {
	bot_at(connection, id)?.ok_or_else(|| ConversationError::UnknownBot { id: id.to_owned() })
}

pub(super) fn oldest_space_of(
	connection: &Connection,
	bot_id: &str,
) -> rusqlite::Result<Option<String>> {
	Ok(bot_spaces::spaces_of(connection, bot_id)?.into_iter().next())
}

fn bots_statement(space_id: Option<&str>) -> String {
	match space_id {
		Some(_) => format!(
			"{BOT_COLUMNS} WHERE bots.deleted_at IS NULL AND membership.space_id = ?1 {BOT_ORDER}"
		),
		None => format!(
			"{BOT_COLUMNS} WHERE bots.deleted_at IS NULL AND {OLDEST_MEMBERSHIP} {BOT_ORDER}"
		),
	}
}

pub(super) fn counted_bots(connection: &Connection) -> rusqlite::Result<i64> {
	connection.query_row("SELECT count(*) FROM bots", [], |row| row.get(0))
}

pub(super) fn bots_of(
	connection: &Connection,
	space_id: Option<&str>,
) -> rusqlite::Result<Vec<Bot>> {
	let mut prepared = connection.prepare_cached(&bots_statement(space_id))?;
	let rows = match space_id {
		Some(space_id) => prepared.query_map([space_id], bot)?,
		None => prepared.query_map([], bot)?,
	};
	rows.collect()
}

pub(super) fn created_bot(
	connection: &mut Connection,
	identity: &BotIdentity,
	space_id: Option<&str>,
	section_id: Option<&str>,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let id = Uuid::new_v4().to_string();
	transaction.execute(
		"INSERT INTO bots (id, name, title, model,
				avatar_color, avatar_image_path, instructions, denied_tools, effort, created_at)
			VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
		params![
			id,
			identity.name,
			identity.title,
			identity.model,
			identity.avatar_blot,
			identity.avatar_image_path,
			identity.instructions,
			denied(identity)?,
			identity.effort,
			now(),
		],
	)?;
	let joined = space_of(&transaction, space_id)?;
	bot_spaces::join(&transaction, &id, &joined, section_id, None)?;
	ensure_chat_in(&transaction, &id, Some(&joined))?;
	let created = stored_bot(&transaction, &id)?;
	transaction.commit()?;
	Ok(created)
}

pub(super) fn updated_bot(
	connection: &mut Connection,
	id: &str,
	identity: &BotIdentity,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction.execute(
		"UPDATE bots SET name = ?2, title = ?3, model = ?4,
				avatar_color = ?5, avatar_image_path = ?6,
				instructions = ?7, denied_tools = ?8, effort = ?9
			WHERE id = ?1",
		params![
			id,
			identity.name,
			identity.title,
			identity.model,
			identity.avatar_blot,
			identity.avatar_image_path,
			identity.instructions,
			denied(identity)?,
			identity.effort,
		],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = stored_bot(&transaction, id)?;
	transaction.commit()?;
	Ok(stored)
}

pub(super) fn deleted_bot(connection: &mut Connection, id: &str) -> Result<(), ConversationError> {
	let transaction = write_transaction(connection)?;
	transaction.pragma_update(None, "defer_foreign_keys", true)?;
	transaction.execute(
		"DELETE FROM conversations WHERE kind = ?2 AND id IN
			(SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1)",
		params![id, CHAT_KIND],
	)?;
	refuse_if_untouched(retired_bot(&transaction, id)?, id)?;
	transaction.commit()?;
	Ok(())
}

pub(in crate::db::repositories) fn deleted_chat_in(
	transaction: &Transaction<'_>,
	bot_id: &str,
	space_id: &str,
) -> rusqlite::Result<usize> {
	transaction.execute(
		"DELETE FROM conversations WHERE kind = ?3 AND space_id = ?2 AND id IN
			(SELECT conversation_id FROM conversation_participants WHERE bot_id = ?1)",
		params![bot_id, space_id, CHAT_KIND],
	)
}

pub(in crate::db::repositories) fn retired_bot(
	transaction: &Transaction<'_>,
	id: &str,
) -> rusqlite::Result<usize> {
	match still_seated(transaction, id)? {
		true => transaction.execute(
			"UPDATE bots SET deleted_at = ?2 WHERE id = ?1 AND deleted_at IS NULL",
			params![id, now()],
		),
		false => transaction.execute("DELETE FROM bots WHERE id = ?1", [id]),
	}
}

fn still_seated(transaction: &Transaction<'_>, bot_id: &str) -> rusqlite::Result<bool> {
	let seats: i64 = transaction.query_row(
		"SELECT count(*) FROM conversation_participants WHERE bot_id = ?1",
		[bot_id],
		|row| row.get(0),
	)?;
	Ok(seats > 0)
}

pub(super) fn set_avatar_image_path(
	connection: &mut Connection,
	id: &str,
	path: Option<&str>,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction
		.execute("UPDATE bots SET avatar_image_path = ?2 WHERE id = ?1", params![id, path])?;
	refuse_if_untouched(written, id)?;
	let stored = stored_bot(&transaction, id)?;
	transaction.commit()?;
	Ok(stored)
}

pub(super) fn set_memory(
	connection: &mut Connection,
	id: &str,
	memory: &str,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written =
		transaction.execute("UPDATE bots SET memory = ?2 WHERE id = ?1", params![id, memory])?;
	refuse_if_untouched(written, id)?;
	let stored = stored_bot(&transaction, id)?;
	transaction.commit()?;
	Ok(stored)
}

pub(super) fn pinned_bot(connection: &mut Connection, id: &str) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let home = only_space_of(&transaction, id)?;
	let pin = sections::next_pin(&transaction, &home)?;
	let written = transaction.execute(
		"UPDATE bot_spaces SET pin_position = ?3 WHERE bot_id = ?1 AND space_id = ?2",
		params![id, home, pin],
	)?;
	refuse_if_untouched(written, id)?;
	let stored = stored_bot(&transaction, id)?;
	transaction.commit()?;
	Ok(stored)
}

pub(super) fn set_permissions(
	connection: &mut Connection,
	id: &str,
	ruled: &str,
) -> Result<Bot, ConversationError> {
	let transaction = write_transaction(connection)?;
	let written = transaction
		.execute("UPDATE bots SET permissions = ?2 WHERE id = ?1", params![id, ruled])?;
	refuse_if_untouched(written, id)?;
	let stored = stored_bot(&transaction, id)?;
	transaction.commit()?;
	Ok(stored)
}

fn only_space_of(connection: &Connection, bot_id: &str) -> Result<String, ConversationError> {
	match bot_spaces::spaces_of(connection, bot_id)?.as_slice() {
		[] => Err(ConversationError::UnknownBot { id: bot_id.to_owned() }),
		[only] => Ok(only.clone()),
		_ => Err(ConversationError::SeveralSpaces { id: bot_id.to_owned() }),
	}
}

pub(super) fn seed_default_bot(transaction: &Transaction<'_>) -> Result<Bot, ConversationError> {
	transaction.execute(
		"INSERT OR IGNORE INTO bots (id, name, model, created_at)
			VALUES (?1, ?2, ?3, ?4)",
		params![DEFAULT_BOT_ID, DEFAULT_BOT_NAME, DEFAULT_BOT_MODEL, now()],
	)?;
	bot_spaces::join(transaction, DEFAULT_BOT_ID, &space_of(transaction, None)?, None, None)?;
	stored_bot(transaction, DEFAULT_BOT_ID)
}

pub(super) fn bot(row: &Row<'_>) -> rusqlite::Result<Bot> {
	Ok(Bot {
		id: row.get("id")?,
		section_id: row.get("section_id")?,
		pin_position: row.get("pin_position")?,
		name: row.get("name")?,
		title: row.get("title")?,
		model: row.get("model")?,
		avatar_blot: row.get("avatar_color")?,
		avatar_image_path: row.get("avatar_image_path")?,
		instructions: row.get("instructions")?,
		memory: row.get("memory")?,
		denied_tools: listed(row.get("denied_tools")?),
		permissions: ruled(row.get("permissions")?),
		effort: row.get("effort")?,
		created_at: row.get("created_at")?,
	})
}

fn denied(identity: &BotIdentity) -> Result<String, ConversationError> {
	serde_json::to_string(&identity.denied_tools).map_err(unserializable)
}

fn ruled(stored: Option<String>) -> Option<BotPermissions> {
	serde_json::from_str(&stored?).ok()
}

fn listed(stored: String) -> Vec<String> {
	serde_json::from_str(&stored).unwrap_or_default()
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::super::tests::{
		a_draft, a_transcript_for, an_identity, assert_file_is_empty, home_of, spoke_in,
	};
	use super::super::*;
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{count_of, joined_on, open};

	#[tokio::test]
	async fn a_database_nobody_has_written_to_has_no_bot_and_no_participants() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		assert_eq!(repository.default_bot().await.expect("the bot"), None);
		assert!(repository.participants("missing".into()).await.expect("participants").is_empty());

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn seeding_the_default_bot_again_leaves_the_row_the_first_seed_wrote() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let first = repository.ensure_default_bot().await.expect("the default bot");
		let second = repository.ensure_default_bot().await.expect("the default bot");

		assert_eq!(first, second, "a second seed rewrote the bot");
		assert_eq!(first.id, DEFAULT_BOT_ID);
		assert_eq!(first.name, DEFAULT_BOT_NAME);
		assert_eq!(first.model, DEFAULT_BOT_MODEL);
		assert_eq!(count_of(&database, "bots").await, 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_renamed_default_bot_comes_back_under_its_new_name_on_every_launch() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		repository.ensure_default_bot().await.expect("the default bot");
		let renamed = repository
			.update_bot(DEFAULT_BOT_ID.to_owned(), an_identity("Nyx"))
			.await
			.expect("the bot is renamed");

		let seeded = repository.ensure_default_bot().await.expect("the default bot");
		let read = repository.default_bot().await.expect("the default bot");

		assert_eq!(renamed.name, "Nyx");
		assert_eq!(seeded, renamed, "a launch after the rename wrote the shipped name back");
		assert_eq!(read.as_ref(), Some(&renamed));
		assert_eq!(count_of(&database, "bots").await, 1);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn creating_a_bot_writes_the_chat_and_the_seat_it_is_spoken_in() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");

		let chat = repository.ensure_chat(created.id.clone(), None).await.expect("the chat");
		let seats = repository.participants(chat.id.clone()).await.expect("the participants");
		assert_eq!(seats.len(), 1, "a bot was created with a thread nobody sits in");
		assert_eq!(seats[0].bot_id, created.id);
		assert_eq!(count_of(&database, "conversations").await, 1, "a second chat was minted");
		assert_eq!(
			repository.bot(created.id.clone()).await.expect("the bot").as_ref(),
			Some(&created),
			"the bot handed back is not the row that was written"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_is_read_back_exactly_as_it_was_described() {
		let dir = temp_dir();
		let database = open(&dir);
		let described = BotIdentity {
			name: "Nyx".to_owned(),
			title: "Reviewer".to_owned(),
			model: "haiku".to_owned(),
			denied_tools: vec!["Bash".to_owned(), "Write".to_owned()],
			avatar_blot: Some(AvatarBlot::Red),
			avatar_image_path: Some("/pictures/owl.png".to_owned()),
			instructions: "Answer briefly.".to_owned(),
			effort: None,
		};

		let created = database
			.conversations()
			.create_bot(described.clone(), None, None)
			.await
			.expect("the bot");

		let listed = database.conversations().bots(None).await.expect("the bots");
		assert_eq!(listed.len(), 1);
		assert_eq!(listed[0].name, described.name);
		assert_eq!(listed[0].title, described.title);
		assert_eq!(listed[0].model, "haiku");
		assert_eq!(listed[0].avatar_blot, Some(AvatarBlot::Red));
		assert_eq!(listed[0].avatar_image_path.as_deref(), Some("/pictures/owl.png"));
		assert_eq!(listed[0].instructions, described.instructions);
		assert_eq!(listed[0].denied_tools, described.denied_tools);
		assert_eq!(listed[0].id, created.id);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	fn a_rule(allow: &str) -> BotPermissions {
		BotPermissions { allow: vec![allow.to_owned()], ..BotPermissions::default() }
	}

	#[tokio::test]
	async fn a_bot_is_born_with_no_rules_and_keeps_the_ones_the_reader_saves() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");

		assert_eq!(created.permissions, None);

		let ruled = repository
			.set_permissions(created.id.clone(), a_rule("Read"))
			.await
			.expect("the rules are saved");
		assert_eq!(ruled.permissions, Some(a_rule("Read")));

		let read_back = repository.bot(created.id.clone()).await.expect("the bot").expect("a row");
		assert_eq!(read_back.permissions, Some(a_rule("Read")));

		let refused = repository.set_permissions("nobody".to_owned(), a_rule("Read")).await;
		assert!(matches!(refused, Err(ConversationError::UnknownBot { .. })));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn rules_are_adopted_once_and_never_over_the_ones_already_held() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");

		repository
			.adopt_permissions(created.id.clone(), a_rule("Read"))
			.await
			.expect("the rules are adopted");
		let adopted = repository.bot(created.id.clone()).await.expect("the bot").expect("a row");
		assert_eq!(adopted.permissions, Some(a_rule("Read")));

		repository
			.adopt_permissions(created.id.clone(), a_rule("Bash"))
			.await
			.expect("the second adoption is quiet");
		let held = repository.bot(created.id.clone()).await.expect("the bot").expect("a row");
		assert_eq!(held.permissions, Some(a_rule("Read")), "the file wrote over the stored rules");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn saving_a_memory_replaces_what_the_bot_kept_and_clearing_it_leaves_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");

		let saved = repository
			.set_memory(created.id.clone(), "they use bun".to_owned())
			.await
			.expect("the memory is saved");
		assert_eq!(saved.memory, "they use bun");
		assert_eq!(saved.name, created.name);

		let cleared = repository
			.set_memory(created.id.clone(), String::new())
			.await
			.expect("the memory is cleared");
		assert_eq!(cleared.memory, "");

		let refused = repository.set_memory("nobody".to_owned(), "anything".to_owned()).await;
		assert!(matches!(refused, Err(ConversationError::UnknownBot { .. })));

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn updating_a_bot_replaces_who_it_is_but_not_its_memory() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let written = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET instructions = 'answer briefly', memory = 'they use bun'
						WHERE id = ?1",
					[&written],
				)?;
				Ok(())
			})
			.await
			.expect("what the bot was told");

		let updated = repository
			.update_bot(
				created.id.clone(),
				BotIdentity {
					name: "Ada".to_owned(),
					title: "Reviewer".to_owned(),
					model: "opus".to_owned(),
					denied_tools: vec!["Bash".to_owned()],
					avatar_blot: Some(AvatarBlot::Orange),
					avatar_image_path: Some("/pictures/koala.png".to_owned()),
					instructions: "answer at length".to_owned(),
					effort: None,
				},
			)
			.await
			.expect("the bot is updated");

		assert_eq!(updated.name, "Ada");
		assert_eq!(updated.title, "Reviewer");
		assert_eq!(updated.avatar_blot, Some(AvatarBlot::Orange));
		assert_eq!(updated.model, "opus", "an update left the bot on its old model");
		assert_eq!(
			updated.instructions, "answer at length",
			"an update left the bot on its old instructions"
		);
		assert_eq!(updated.memory, "they use bun", "an update cleared the memory");
		assert_eq!(updated.created_at, created.created_at, "an update moved the moment");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_holds_the_commands_its_last_session_announced() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let silent =
			repository.create_bot(an_identity("Ada"), None, None).await.expect("the other bot");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"a bot no session has announced anything for offers a command"
		);

		repository
			.record_bot_commands(
				created.id.clone(),
				vec![AgentCommand::named("review"), AgentCommand::named("compact")],
			)
			.await
			.expect("the first session's commands");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			vec![AgentCommand::named("review"), AgentCommand::named("compact")],
		);

		repository
			.record_bot_commands(created.id.clone(), vec![AgentCommand::named("status")])
			.await
			.expect("the next session's commands");

		assert_eq!(
			repository.bot_commands(created.id.clone()).await.expect("the commands"),
			vec![AgentCommand::named("status")],
			"an announcement was added to the one before it instead of replacing it"
		);
		assert_eq!(
			repository.bot_commands(silent.id).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"one bot's session announced for another"
		);
		assert_eq!(
			repository.bot_commands("missing".to_owned()).await.expect("the commands"),
			Vec::<AgentCommand>::new(),
			"a bot the file does not hold offered a command"
		);

		let refused = repository
			.record_bot_commands("missing".to_owned(), vec![AgentCommand::named("review")])
			.await;
		assert!(
			format!("{refused:?}").contains("UnknownBot"),
			"commands were written for a bot the file does not hold: {refused:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn commands_the_column_holds_as_bare_names_are_offered_as_commands() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let id = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					r#"UPDATE bots SET commands = '["review","compact"]' WHERE id = ?1"#,
					[&id],
				)?;
				Ok(())
			})
			.await
			.expect("the shape an older build wrote");

		assert_eq!(
			repository.bot_commands(created.id).await.expect("the commands"),
			vec![AgentCommand::named("review"), AgentCommand::named("compact")]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn commands_the_column_holds_unreadably_are_offered_as_none() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let created = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let id = created.id.clone();
		repository
			.call(move |connection| {
				connection.execute(
					"UPDATE bots SET commands = 'not a list at all' WHERE id = ?1",
					[&id],
				)?;
				Ok(())
			})
			.await
			.expect("text no build can read a list out of");

		assert_eq!(
			repository.bot_commands(created.id).await.expect("the commands"),
			Vec::<AgentCommand>::new()
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_write_naming_a_bot_the_file_does_not_hold_is_refused() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let updated = repository.update_bot("missing".to_owned(), an_identity("Nyx")).await;
		let deleted = repository.delete_bot("missing".to_owned()).await;

		for refused in [format!("{updated:?}"), format!("{deleted:?}")] {
			assert!(
				refused.contains("UnknownBot"),
				"a write on a bot the file does not hold was accepted: {refused}"
			);
		}
		assert_eq!(count_of(&database, "bots").await, 0, "a refused write wrote a bot");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_a_bot_takes_its_chat_and_everything_said_in_it() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let deleted = repository.create_bot(an_identity("Nyx"), None, None).await.expect("the bot");
		let kept = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let chat = repository.ensure_chat(deleted.id.clone(), None).await.expect("the chat");
		let kept_chat = repository.ensure_chat(kept.id.clone(), None).await.expect("the chat");
		a_transcript_for(&database, &chat.id, &deleted.id).await;

		repository.delete_bot(deleted.id.clone()).await.expect("the bot is deleted");

		assert_eq!(repository.bot(deleted.id).await.expect("the bot"), None);
		assert_eq!(count_of(&database, "bots").await, 1, "the other bot went with it");
		assert_eq!(count_of(&database, "conversations").await, 1);
		assert_eq!(count_of(&database, "messages").await, 0, "a message outlived its chat");
		assert_eq!(count_of(&database, "turns").await, 0, "a turn outlived its chat");
		assert_eq!(count_of(&database, "activities").await, 0, "a step outlived its turn");
		assert_eq!(count_of(&database, "runtime_sessions").await, 0, "a run outlived its seat");
		assert_eq!(count_of(&database, "context_checkpoints").await, 0, "a summary outlived it");
		assert_eq!(
			repository.participants(kept_chat.id).await.expect("the participants").len(),
			1,
			"the other bot lost the seat it was sitting in"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn deleting_the_last_bot_leaves_the_file_a_fresh_install_would_open() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let only = repository.ensure_default_bot().await.expect("the default bot");
		let chat = repository.ensure_chat(only.id.clone(), None).await.expect("the chat");
		a_transcript_for(&database, &chat.id, &only.id).await;

		repository.delete_bot(only.id).await.expect("the bot is deleted");

		assert_file_is_empty(&database).await;
		assert_eq!(repository.default_bot().await.expect("the default bot"), None);
		assert!(repository.bots(None).await.expect("the bots").is_empty());

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn two_bots_created_at_once_each_get_their_own_id_and_their_own_chat() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();

		let (first, second) = tokio::join!(
			repository.create_bot(an_identity("Nyx"), None, None),
			repository.create_bot(an_identity("Ada"), None, None)
		);

		let first = first.expect("the first bot");
		let second = second.expect("the second bot");
		assert_ne!(first.id, second.id, "two bots were created under one id");
		assert_eq!(count_of(&database, "bots").await, 2);
		assert_eq!(count_of(&database, "conversations").await, 2, "two bots share one chat");
		assert_eq!(count_of(&database, "conversation_participants").await, 2);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_default_bot_moved_to_another_model_still_reads_back_after_a_reopen() {
		let dir = temp_dir();
		let moved = {
			let database = open(&dir);
			let repository = database.conversations();
			repository.ensure_default_bot().await.expect("the default bot");
			repository
				.update_bot(
					DEFAULT_BOT_ID.to_owned(),
					BotIdentity { model: "opus".to_owned(), ..an_identity(DEFAULT_BOT_NAME) },
				)
				.await
				.expect("the bot is moved to another model")
		};

		let database = open(&dir);
		let repository = database.conversations();
		let read = repository.default_bot().await.expect("the default bot");
		let seeded = repository.ensure_default_bot().await.expect("the default bot");
		let held = repository.ensure_chat(DEFAULT_BOT_ID.into(), None).await.expect("the chat");

		assert_eq!(moved.model, "opus");
		assert_eq!(read.as_ref(), Some(&moved), "a launch could not read its own default bot");
		assert_eq!(seeded, moved, "a launch wrote the shipped model back over the user's");
		assert_eq!(count_of(&database, "bots").await, 1);
		assert!(!held.id.is_empty(), "the chat was refused over a model the user chose");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_bots_of_a_space_are_read_through_the_index_on_the_membership_space() {
		let dir = temp_dir();
		let database = open(&dir);

		let plan = database
			.call(|connection| {
				let mut statement = connection
					.prepare(&format!("EXPLAIN QUERY PLAN {}", bots_statement(Some("personal"))))?;
				let rows =
					statement.query_map(["personal"], |row| row.get::<_, String>("detail"))?;
				Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
			})
			.await
			.expect("the plan");

		assert!(
			plan.iter().any(|step| step.contains("bot_spaces_of_space")),
			"the roster read scans the memberships: got {plan:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	async fn named_by_presence(
		repository: &ConversationsRepository,
		space_id: &str,
		excluded_conversation_id: Option<&str>,
	) -> Vec<String> {
		repository
			.bots_by_presence(space_id.to_owned(), excluded_conversation_id.map(str::to_owned))
			.await
			.expect("the bots by presence")
			.into_iter()
			.map(|listed| listed.name)
			.collect()
	}

	#[tokio::test]
	async fn a_bot_seated_in_three_rooms_is_ranked_ahead_of_one_seated_in_one() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let ada = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let zed = repository.create_bot(an_identity("Zed"), None, None).await.expect("the bot");
		repository.create_bot(an_identity("Mia"), None, None).await.expect("the bot");
		let space_id = home_of(repository, &ada).await;
		for seated in [vec![&ada, &zed], vec![&zed], vec![&zed]] {
			repository.create_conversation(a_draft(&space_id, &seated)).await.expect("the room");
		}

		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Zed".to_owned(), "Ada".to_owned(), "Mia".to_owned()]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_seat_that_was_left_counts_for_no_presence() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let ada = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let zed = repository.create_bot(an_identity("Zed"), None, None).await.expect("the bot");
		let space_id = home_of(repository, &ada).await;
		repository.create_conversation(a_draft(&space_id, &[&zed])).await.expect("the room");
		let left = repository
			.create_conversation(a_draft(&space_id, &[&ada, &zed]))
			.await
			.expect("the room");
		repository.remove_participant(left.id, zed.id.clone()).await.expect("zed leaves");

		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Ada".to_owned(), "Zed".to_owned()],
			"a left seat still counted"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_bot_of_another_space_is_absent_and_its_rooms_count_for_nothing() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let elsewhere = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let ada = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let zed = repository.create_bot(an_identity("Zed"), None, None).await.expect("the bot");
		let stranger = repository
			.create_bot(an_identity("Bob"), Some(elsewhere.id.clone()), None)
			.await
			.expect("the bot");
		database
			.spaces()
			.add_bot(zed.id.clone(), elsewhere.id.clone(), None)
			.await
			.expect("zed joins the second space");
		let space_id = home_of(repository, &ada).await;
		joined_on(&database, &zed.id, &space_id, 1).await;
		joined_on(&database, &zed.id, &elsewhere.id, 2).await;
		repository.create_conversation(a_draft(&space_id, &[&ada])).await.expect("the room");
		for _ in 0..2 {
			repository
				.create_conversation(a_draft(&elsewhere.id, &[&zed, &stranger]))
				.await
				.expect("the room elsewhere");
		}

		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Ada".to_owned(), "Zed".to_owned()]
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn the_excluded_room_counts_for_no_presence() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let ada = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let zed = repository.create_bot(an_identity("Zed"), None, None).await.expect("the bot");
		let space_id = home_of(repository, &ada).await;
		let excluded =
			repository.create_conversation(a_draft(&space_id, &[&ada])).await.expect("the room");
		repository.create_conversation(a_draft(&space_id, &[&zed])).await.expect("the room");

		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Ada".to_owned(), "Zed".to_owned()]
		);
		assert_eq!(
			named_by_presence(repository, &space_id, Some(&excluded.id)).await,
			vec!["Zed".to_owned(), "Ada".to_owned()],
			"the excluded room still counted"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_deleted_bot_still_seated_is_absent_from_the_bots_by_presence() {
		let dir = temp_dir();
		let database = open(&dir);
		let repository = database.conversations();
		let zed = repository.create_bot(an_identity("Zed"), None, None).await.expect("the bot");
		let ada = repository.create_bot(an_identity("Ada"), None, None).await.expect("the bot");
		let mia = repository.create_bot(an_identity("Mia"), None, None).await.expect("the bot");
		let space_id = home_of(repository, &zed).await;
		for seated in [vec![&zed, &mia], vec![&zed, &mia], vec![&zed, &ada]] {
			let room = repository
				.create_conversation(a_draft(&space_id, &seated))
				.await
				.expect("the room");
			spoke_in(&database, &room.id, &zed.id).await;
		}
		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Zed".to_owned(), "Mia".to_owned(), "Ada".to_owned()]
		);

		repository.delete_bot(zed.id.clone()).await.expect("the bot is deleted");

		let still_seated = repository
			.conversations(space_id.clone())
			.await
			.expect("the rooms")
			.iter()
			.flat_map(|room| room.seats.iter())
			.filter(|seat| seat.bot_id == zed.id && seat.left_at.is_none())
			.count();
		assert_eq!(still_seated, 3, "the deleted bot no longer holds its seats");
		assert_eq!(
			named_by_presence(repository, &space_id, None).await,
			vec!["Mia".to_owned(), "Ada".to_owned()],
			"the deleted bot was ranked or its seats still counted"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
