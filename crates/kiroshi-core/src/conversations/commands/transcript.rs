use uuid::Uuid;

use super::super::contract::{
	MessageReference, NewAssistantMessage, NewTurn, NewUserMessage, PinnedBubble, SentMessage,
	TerminalCompletion, TranscriptMessage, TranscriptPage, TranscriptStoreError, TranscriptWindow,
	MESSAGE_STORED_EVENT, UPDATED_EVENT,
};
use super::super::state as conversation_state;
use super::super::{context, host_turn, summons};
use super::bot::ready;
use super::room::announce_conversation;
use crate::agent::reply_writer::{settled_mentions, HostWrites};
use crate::agent::translate::now_ms;
use crate::agent::AgentState;
use crate::db;
use crate::db::repositories::messages::{
	self, AccountAuthor, MessagePageQuery, MessagesAroundQuery, TerminalState, WrittenFrom,
};
use crate::events::{CONVERSATION_UPDATED, MESSAGE_STORED};
use crate::hosting::authors;
use crate::hosting::caller::Caller;
use crate::library::{self, contract::LibraryError};

pub async fn message_page(
	core: &crate::core_context::Core,
	conversation_id: String,
	before_seq: Option<i64>,
	limit: u32,
) -> Result<TranscriptPage, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let query = MessagePageQuery { conversation_id: conversation_id.clone(), before_seq, limit };
	let page = ready(&state)?.messages().page_messages(query).await?;
	Ok(TranscriptPage::of(conversation_id, page))
}

pub async fn conversation_message_page_around(
	core: &crate::core_context::Core,
	conversation_id: String,
	seq: i64,
	limit: u32,
) -> Result<TranscriptWindow, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let query = MessagesAroundQuery { conversation_id: conversation_id.clone(), seq, limit };
	let Some(around) = ready(&state)?.messages().messages_around(query).await? else {
		return Err(TranscriptStoreError::UnknownMessageSeq { conversation_id, seq });
	};
	Ok(TranscriptWindow::of(conversation_id, around))
}

pub async fn conversation_message_reference(
	core: &crate::core_context::Core,
	conversation_id: String,
	message_id: String,
) -> Result<Option<MessageReference>, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let Some(stored) = database.messages().message(conversation_id.clone(), message_id).await?
	else {
		return Ok(None);
	};
	let run = context::run_behind(database, &stored).await?;
	Ok(Some(MessageReference::of(conversation_id, stored, run)))
}

pub async fn conversation_message_header(
	core: &crate::core_context::Core,
	conversation_id: String,
	message_id: String,
) -> Result<String, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	context::message_header(ready(&state)?, conversation_id, message_id).await
}

pub async fn conversation_pin_message(
	core: &crate::core_context::Core,
	conversation_id: String,
	message_id: String,
	block_index: i64,
	pinned_at: i64,
) -> Result<(), TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?
		.messages()
		.pin_message(conversation_id, message_id, block_index, pinned_at)
		.await?)
}

pub async fn conversation_unpin_message(
	core: &crate::core_context::Core,
	conversation_id: String,
	message_id: String,
	block_index: i64,
) -> Result<(), TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.messages().unpin_message(conversation_id, message_id, block_index).await?)
}

pub async fn conversation_pinned_messages(
	core: &crate::core_context::Core,
	conversation_id: String,
) -> Result<Vec<PinnedBubble>, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let stored = ready(&state)?.messages().pinned_messages(conversation_id.clone()).await?;
	Ok(stored.into_iter().map(|pin| PinnedBubble::of(&conversation_id, pin)).collect())
}

pub async fn start_turn(
	core: &crate::core_context::Core,
	turn: NewTurn,
) -> Result<i64, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let conversation_id = turn.conversation_id.clone();
	let seq = match owned_by_host(core, |host| host.owns_turn(&turn.id)) {
		true => database.messages().ensure_turn(turn.into()).await?,
		false => database.messages().start_turn(turn.into()).await?,
	};
	conversation_state::observe_reporting(core, database, &conversation_id).await;
	Ok(seq)
}

pub async fn complete_turn(
	core: &crate::core_context::Core,
	id: String,
	completed_at: i64,
) -> Result<(), TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	if owned_by_host(core, |host| host.owns_turn(&id)) {
		return Ok(());
	}
	let conversation_id = database.messages().conversation_of_turn(id.clone()).await?;
	database.messages().complete_turn(id, completed_at).await?;
	if let Some(conversation_id) = conversation_id {
		conversation_state::observe_reporting(core, database, &conversation_id).await;
	}
	Ok(())
}

pub async fn conversation_append_user_message(
	core: &crate::core_context::Core,
	caller: crate::hosting::caller::Caller,
	message: NewUserMessage,
) -> Result<i64, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	refuse_unheld(
		core,
		database,
		&message.conversation_id,
		&message.documents,
		library::items::held_document,
	)
	.await?;
	let written_from = caller.written_from();
	let author = authors::author(caller, core, database).await?;
	let (conversation_id, id) = (message.conversation_id.clone(), message.id.clone());
	let seq =
		database.messages().append_user_message(message.written_by(author, written_from)).await?;
	announce_stored(core, database, conversation_id.clone(), id).await;
	announce_conversation(core, database, CONVERSATION_UPDATED, &conversation_id).await;
	Ok(seq)
}

pub async fn send_user_message(
	core: &crate::core_context::Core,
	caller: Caller,
	message: NewUserMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	store_sent(core, ready(&state)?, caller, message, &summoned).await
}

pub async fn conversation_send_turn(
	core: &crate::core_context::Core,
	caller: crate::hosting::caller::Caller,
	message: SentMessage,
	summoned: Vec<String>,
) -> Result<i64, TranscriptStoreError> {
	let agent = core.state::<AgentState>();
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let held = agent.host_turns().hold(&message.conversation_id, &message.turn_id)?;
	let summoned = host_turn::summoned_for(database, &message, summoned).await?;
	let seq = store_sent(core, database, caller, message.clone().into(), &summoned).await?;
	host_turn::run(core.clone(), held, message, summoned).await;
	Ok(seq)
}

pub struct HandedTurn {
	pub conversation_id: String,
	pub turn_id: String,
	pub author_bot_id: String,
	pub text: String,
	pub summoned: String,
}

pub async fn run_handed_turn(
	core: &crate::core_context::Core,
	database: &db::Database,
	agent: &AgentState,
	handed: HandedTurn,
) -> Result<(), TranscriptStoreError> {
	let HandedTurn { conversation_id, turn_id, author_bot_id, text, summoned } = handed;
	let id = Uuid::new_v4().to_string();
	let created_at = now_ms();
	let held = agent.host_turns().hold(&conversation_id, &turn_id)?;
	let content = settled_mentions(database, &conversation_id, &text).await?.unwrap_or(text);
	let messages = database.messages();
	let turn = NewTurn {
		id: turn_id.clone(),
		conversation_id: conversation_id.clone(),
		started_at: created_at,
	};
	messages.start_turn(turn.into()).await?;
	let handing = NewAssistantMessage {
		id: id.clone(),
		conversation_id: conversation_id.clone(),
		turn_id: turn_id.clone(),
		author_bot_id: Some(author_bot_id),
		replied_to_message_id: None,
		created_at,
	};
	messages.open_assistant_message(handing.into()).await?;
	messages.append_text(id.clone(), content.clone()).await?;
	messages.finalize_message(id.clone(), TerminalState::Complete, None).await?;
	announce_stored(core, database, conversation_id.clone(), id.clone()).await;
	announce_conversation(core, database, CONVERSATION_UPDATED, &conversation_id).await;
	let message = SentMessage {
		id,
		conversation_id,
		turn_id,
		content,
		created_at,
		replied_to_message_id: None,
		replied_to_message_ids: Vec::new(),
		reply_links: Vec::new(),
		documents: Vec::new(),
	};
	core.spawn(host_turn::run(core.clone(), held, message, vec![summoned]));
	Ok(())
}

async fn store_sent(
	core: &crate::core_context::Core,
	database: &db::Database,
	caller: Caller,
	message: NewUserMessage,
	summoned: &[String],
) -> Result<i64, TranscriptStoreError> {
	refuse_unheld(
		core,
		database,
		&message.conversation_id,
		&message.documents,
		library::items::held_document,
	)
	.await?;
	let turn_id = message.turn_id.clone();
	let completed_at = summoned.is_empty().then_some(message.created_at);
	let written_from = caller.written_from();
	let author = authors::author(caller, core, database).await?;
	let (conversation_id, id) = (message.conversation_id.clone(), message.id.clone());
	let seq = database
		.messages()
		.send_user_message(message.written_by(author, written_from), completed_at)
		.await?;
	if let Some(agent) = core.try_state::<AgentState>() {
		agent.host_writes().claim_turn(&turn_id);
	}
	announce_stored(core, database, conversation_id.clone(), id).await;
	announce_conversation(core, database, CONVERSATION_UPDATED, &conversation_id).await;
	Ok(seq)
}

pub async fn post_document(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: &str,
	author_bot_id: &str,
	name: &str,
) -> Result<String, TranscriptStoreError> {
	let documents = vec![name.to_owned()];
	refuse_unheld(
		core,
		database,
		conversation_id,
		&documents,
		library::items::held_document_or_board,
	)
	.await?;
	let id = Uuid::new_v4().to_string();
	let posted = messages::NewUserMessage {
		id: id.clone(),
		conversation_id: conversation_id.to_owned(),
		turn_id: Uuid::new_v4().to_string(),
		author_bot_id: Some(author_bot_id.to_owned()),
		author: AccountAuthor::default(),
		written_from: WrittenFrom::Here,
		reply_links: Vec::new(),
		documents,
		content: String::new(),
		created_at: now_ms(),
	};
	database.messages().post_message(posted).await?;
	announce_stored(core, database, conversation_id.to_owned(), id.clone()).await;
	announce_conversation(core, database, CONVERSATION_UPDATED, conversation_id).await;
	Ok(id)
}

async fn refuse_unheld(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: &str,
	documents: &[String],
	held: fn(&crate::core_context::Core, &str, &str) -> Result<(), LibraryError>,
) -> Result<(), TranscriptStoreError> {
	let Some(first) = documents.first() else {
		return Ok(());
	};
	let Some(space_id) = database.conversations().space(conversation_id.to_owned()).await? else {
		return Err(TranscriptStoreError::DocumentRefused {
			name: first.clone(),
			failure: Box::new(LibraryError::Missing { name: first.clone() }),
		});
	};
	documents.iter().try_for_each(|name| {
		held(core, &space_id, name).map_err(|failure| TranscriptStoreError::DocumentRefused {
			name: name.clone(),
			failure: Box::new(failure),
		})
	})
}

async fn announce_stored(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: String,
	id: String,
) {
	if let Some(content) =
		announce_message_stored(core, database, conversation_id.clone(), id.clone()).await
	{
		summons::note_received(&conversation_id, &id, &content);
	}
}

pub async fn announce_message_stored(
	core: &crate::core_context::Core,
	database: &db::Database,
	conversation_id: String,
	id: String,
) -> Option<String> {
	let unannounced = |failure: String| {
		eprintln!(
			"{MESSAGE_STORED_EVENT} was not announced for message {id} of conversation {conversation_id}: {failure}"
		);
	};
	let stored = match database.messages().message(conversation_id.clone(), id.clone()).await {
		Ok(Some(stored)) => stored,
		Ok(None) => {
			unannounced("the stored message was not found again".to_owned());
			return None;
		}
		Err(failure) => {
			unannounced(format!("the stored message did not read back: {failure:?}"));
			return None;
		}
	};
	let content = stored.content.clone();
	if let Err(failure) = core.emit(MESSAGE_STORED, TranscriptMessage::of(&conversation_id, stored))
	{
		unannounced(failure.to_string());
	}
	Some(content)
}

pub async fn open_assistant_message(
	core: &crate::core_context::Core,
	message: NewAssistantMessage,
) -> Result<i64, TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let messages = database.messages();
	if !owned_by_host(core, |host| host.owns_message(&message.id)) {
		let conversation_id = message.conversation_id.clone();
		let seq = messages.open_assistant_message(message.into()).await?;
		announce_conversation(core, database, CONVERSATION_UPDATED, &conversation_id).await;
		return Ok(seq);
	}
	match messages.message(message.conversation_id, message.id.clone()).await? {
		Some(stored) => Ok(stored.seq),
		None => Err(TranscriptStoreError::UnknownMessage { id: message.id }),
	}
}

pub async fn append_text(
	core: &crate::core_context::Core,
	id: String,
	delta: String,
) -> Result<(), TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let messages = ready(&state)?.messages();
	if owned_by_host(core, |host| host.owns_message(&id)) {
		return Ok(());
	}
	Ok(messages.append_text(id, delta).await?)
}

pub async fn finalize_message(
	core: &crate::core_context::Core,
	id: String,
	completion: TerminalCompletion,
	settled_text: Option<String>,
) -> Result<(), TranscriptStoreError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let messages = database.messages();
	if owned_by_host(core, |host| host.owns_message(&id)) {
		return Ok(());
	}
	let has_closed = messages.finalize_message(id.clone(), completion.into(), settled_text).await?;
	match messages.conversation_of_message(id.clone()).await {
		Ok(Some(conversation_id)) => {
			if has_closed {
				announce_stored(core, database, conversation_id.clone(), id).await;
			}
			announce_conversation(core, database, CONVERSATION_UPDATED, &conversation_id).await
		}
		Ok(None) => {
			eprintln!("{UPDATED_EVENT} was not announced for message {id}: it was not found")
		}
		Err(failure) => eprintln!(
			"{UPDATED_EVENT} was not announced for message {id}: its conversation did not read: {failure:?}"
		),
	}
	Ok(())
}

fn owned_by_host(core: &crate::core_context::Core, owns: impl Fn(&HostWrites) -> bool) -> bool {
	core.try_state::<AgentState>().is_some_and(|agent| owns(agent.host_writes()))
}

#[cfg(test)]
mod tests {
	use std::sync::{Arc, Mutex};

	use serde_json::json;

	use super::*;
	use crate::conversations::contract::ReplyLink;
	use crate::test_core::{a_core_of_its_own, CoreOfItsOwn};

	const ONE_SEATED_CONVERSATION: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'First', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('c1', 'topic', 'First', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'lead', 1, 0);
	";

	async fn a_host(name: &str) -> CoreOfItsOwn {
		let core = a_core_of_its_own(&format!("transcript-commands-{name}"));
		crate::db::install(&core);
		database(&core)
			.call_mut(|connection| Ok(connection.execute_batch(ONE_SEATED_CONVERSATION)?))
			.await
			.expect("the conversation is planted");
		core
	}

	fn database(core: &CoreOfItsOwn) -> &db::Database {
		core.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
	}

	fn a_turn(id: &str) -> NewTurn {
		NewTurn { id: id.into(), conversation_id: "c1".into(), started_at: 1 }
	}

	#[tokio::test]
	async fn a_turn_started_on_a_deleted_conversation_names_it_instead_of_failing_storage() {
		let core = a_host("deleted").await;
		database(&core)
			.conversations()
			.delete_conversation("c1".into())
			.await
			.expect("the conversation is deleted");

		let refused = start_turn(&core, a_turn("t1")).await;

		assert_eq!(refused, Err(TranscriptStoreError::UnknownConversation { id: "c1".into() }));
	}

	#[tokio::test]
	async fn a_foreign_key_failure_reaches_the_frontend_with_its_operation_table_and_code() {
		let core = a_host("foreign-key").await;
		start_turn(&core, a_turn("t1")).await.expect("the turn starts");
		let reply = NewAssistantMessage {
			id: "r1".into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: Some("b1".into()),
			replied_to_message_id: Some("no such message".into()),
			created_at: 2,
		};

		let refused = open_assistant_message(&core, reply)
			.await
			.expect_err("a reply to a missing message was stored");

		assert_eq!(
			serde_json::to_value(&refused).expect("the error serializes"),
			json!({
				"kind": "storage",
				"failure": {
					"kind": "sqlite",
					"detail": "FOREIGN KEY constraint failed",
					"operation": "open_assistant_message",
					"table": "messages",
					"code": "SQLITE_CONSTRAINT_FOREIGNKEY",
				},
			})
		);
	}

	fn listen_to_stored_messages(core: &CoreOfItsOwn) -> Arc<Mutex<Vec<serde_json::Value>>> {
		let heard = Arc::new(Mutex::new(Vec::new()));
		let kept = heard.clone();
		core.listen_to(MESSAGE_STORED_EVENT, move |payload| {
			let payload = serde_json::from_str(payload).expect("the payload is JSON");
			kept.lock().expect("the list is kept").push(payload);
		});
		heard
	}

	async fn write_a_report(core: &CoreOfItsOwn) {
		start_turn(core, a_turn("t1")).await.expect("the turn starts");
		let report = NewAssistantMessage {
			id: "r1".into(),
			conversation_id: "c1".into(),
			turn_id: "t1".into(),
			author_bot_id: Some("b1".into()),
			replied_to_message_id: None,
			created_at: 2,
		};
		open_assistant_message(core, report).await.expect("the report opens");
		append_text(core, "r1".into(), "done".into()).await.expect("the report text lands");
		finalize_the_report(core).await;
		complete_turn(core, "t1".into(), 3).await.expect("the turn completes");
	}

	async fn finalize_the_report(core: &CoreOfItsOwn) {
		finalize_message(core, "r1".into(), TerminalCompletion::Complete, None)
			.await
			.expect("the report is finalized");
	}

	async fn stored_report(core: &CoreOfItsOwn) -> serde_json::Value {
		let stored = database(core)
			.messages()
			.message("c1".into(), "r1".into())
			.await
			.expect("the report reads")
			.expect("the report is stored");
		serde_json::to_value(TranscriptMessage::of("c1", stored)).expect("the report serializes")
	}

	#[tokio::test]
	async fn a_report_written_through_the_five_commands_is_announced_once_as_stored() {
		let core = a_host("report-announced").await;
		let heard = listen_to_stored_messages(&core);

		write_a_report(&core).await;

		let expected = vec![stored_report(&core).await];
		assert_eq!(*heard.lock().expect("the list is kept"), expected);
	}

	fn a_reply_to(id: &str, targets: &[&str]) -> NewUserMessage {
		NewUserMessage {
			id: id.into(),
			conversation_id: "c1".into(),
			turn_id: format!("t-{id}"),
			author_bot_id: None,
			replied_to_message_id: targets.first().map(|target| (*target).to_owned()),
			replied_to_message_ids: targets.iter().map(|target| (*target).to_owned()).collect(),
			reply_links: Vec::new(),
			documents: Vec::new(),
			content: "hello".into(),
			created_at: 1,
		}
	}

	async fn send(
		core: &CoreOfItsOwn,
		message: NewUserMessage,
	) -> Result<i64, TranscriptStoreError> {
		send_user_message(core, Caller::Host, message, Vec::new()).await
	}

	async fn sent_targets(core: &CoreOfItsOwn, ids: &[&str]) {
		for id in ids {
			send(core, a_reply_to(id, &[])).await.expect("the target is sent");
		}
	}

	async fn page_of(core: &CoreOfItsOwn) -> Vec<TranscriptMessage> {
		message_page(core, "c1".into(), None, 50).await.expect("the page reads").messages
	}

	fn read<'a>(page: &'a [TranscriptMessage], id: &str) -> &'a TranscriptMessage {
		page.iter().find(|message| message.id == id).expect("the message is read")
	}

	fn links_of<'a>(page: &'a [TranscriptMessage], id: &str) -> (Option<&'a str>, Vec<&'a str>) {
		let message = read(page, id);
		let listed = message.replied_to_message_ids.iter().map(String::as_str).collect();
		(message.replied_to_message_id.as_deref(), listed)
	}

	#[tokio::test]
	async fn a_message_replying_to_three_reads_the_three_back_in_the_order_sent() {
		let core = a_host("three-replies").await;
		sent_targets(&core, &["m1", "m2", "m3"]).await;

		send(&core, a_reply_to("m4", &["m3", "m1", "m2"])).await.expect("the reply is sent");

		let page = page_of(&core).await;
		assert_eq!(links_of(&page, "m4"), (Some("m3"), vec!["m3", "m1", "m2"]));
		assert_eq!(links_of(&page, "m1"), (None, vec![]));
	}

	#[tokio::test]
	async fn a_target_named_twice_is_kept_once_at_its_first_place() {
		let core = a_host("repeated-reply").await;
		sent_targets(&core, &["m1", "m2"]).await;

		send(&core, a_reply_to("m3", &["m2", "m1", "m2"])).await.expect("the reply is sent");

		let page = page_of(&core).await;
		assert_eq!(links_of(&page, "m3"), (Some("m2"), vec!["m2", "m1"]));
	}

	#[tokio::test]
	async fn a_payload_naming_only_its_first_target_keeps_that_one_link() {
		let core = a_host("single-link-payload").await;
		sent_targets(&core, &["m1"]).await;
		let legacy: NewUserMessage = serde_json::from_value(json!({
			"id": "m2", "conversationId": "c1", "turnId": "t-m2", "authorBotId": null,
			"repliedToMessageId": "m1", "content": "hello", "createdAt": 1
		}))
		.expect("a payload without the list deserializes");

		send(&core, legacy).await.expect("the reply is sent");

		let page = page_of(&core).await;
		assert_eq!(links_of(&page, "m2"), (Some("m1"), vec!["m1"]));
		assert_eq!(excerpts_of(&page, "m2"), [("m1", None)]);
	}

	fn linking(id: &str, links: &[(&str, Option<&str>)]) -> NewUserMessage {
		let reply_links = links
			.iter()
			.map(|(target, excerpt)| ReplyLink {
				message_id: (*target).to_owned(),
				excerpt: excerpt.map(str::to_owned),
			})
			.collect();
		NewUserMessage { reply_links, ..a_reply_to(id, &[]) }
	}

	fn excerpts_of<'a>(page: &'a [TranscriptMessage], id: &str) -> Vec<(&'a str, Option<&'a str>)> {
		read(page, id)
			.reply_links
			.iter()
			.map(|link| (link.message_id.as_str(), link.excerpt.as_deref()))
			.collect()
	}

	#[tokio::test]
	async fn each_reply_link_keeps_its_first_occurrence_with_its_excerpt_or_none_when_blank() {
		let core = a_host("excerpted-replies").await;
		sent_targets(&core, &["m1", "m2"]).await;

		let links = [("m2", Some("the roof")), ("m1", Some(" \n\t")), ("m2", Some("again"))];
		send(&core, linking("m3", &links)).await.expect("the reply is sent");

		let page = page_of(&core).await;
		assert_eq!(excerpts_of(&page, "m3"), [("m2", Some("the roof")), ("m1", None)]);
		assert_eq!(links_of(&page, "m3"), (Some("m2"), vec!["m2", "m1"]));
	}

	#[tokio::test]
	async fn an_unknown_target_among_the_reply_links_refuses_the_send_as_a_listed_id_does() {
		let core = a_host("unknown-excerpted-reply").await;
		sent_targets(&core, &["m1"]).await;

		let listed = send(&core, a_reply_to("refused", &["m1", "gone"])).await;
		let linked = send(&core, linking("refused", &[("m1", None), ("gone", Some("x"))])).await;

		assert!(listed.is_err(), "a listed unknown target was stored");
		assert_eq!(linked, listed);
	}

	#[tokio::test]
	async fn an_unknown_target_anywhere_in_the_list_refuses_the_send_as_a_lone_one_does() {
		let core = a_host("unknown-reply").await;
		sent_targets(&core, &["m1"]).await;

		let lone = send(&core, a_reply_to("lone", &["gone"])).await;
		let listed = send(&core, a_reply_to("listed", &["m1", "gone"])).await;

		let refused = serde_json::to_value(&lone).expect("the error serializes");
		assert_eq!(refused["Err"]["failure"]["code"], "SQLITE_CONSTRAINT_FOREIGNKEY");
		assert_eq!(listed, lone);
		let ids: Vec<String> = page_of(&core).await.into_iter().map(|message| message.id).collect();
		assert_eq!(ids, ["m1"], "a refused reply left a message behind");
	}

	#[tokio::test]
	async fn a_report_finalized_twice_is_announced_once() {
		let core = a_host("report-finalized-twice").await;
		let heard = listen_to_stored_messages(&core);

		write_a_report(&core).await;
		finalize_the_report(&core).await;

		assert_eq!(heard.lock().expect("the list is kept").len(), 1);
	}
}
