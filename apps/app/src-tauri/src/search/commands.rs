use tauri::{AppHandle, Runtime, State};

use super::contract::{
	Catalogue, CatalogueChat, CatalogueError, CatalogueMission, CatalogueScope, ChatHit,
	MessageHit, MessageSearchError, MessageSearchQuery,
};
use crate::conversations::contract::{state_in, StorageFailure};
use crate::conversations::state as conversation_state;
use crate::db;
use crate::missions::commands::present;

fn ready(state: &db::DatabaseState) -> Result<&db::Database, StorageFailure> {
	state.as_ref().map_err(StorageFailure::from)
}

#[tauri::command]
#[specta::specta]
pub async fn search_messages(
	state: State<'_, db::DatabaseState>,
	query: MessageSearchQuery,
) -> Result<Vec<MessageHit>, MessageSearchError> {
	ready(&state)
		.map_err(|failure| MessageSearchError::Unavailable { failure })?
		.search()
		.messages(query)
		.await
}

#[tauri::command]
#[specta::specta]
pub async fn search_catalogue<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	query: String,
	space_id: String,
) -> Result<Catalogue, CatalogueError> {
	let database = ready(&state).map_err(|failure| CatalogueError::Unavailable { failure })?;
	let hits = database.catalogue().search(CatalogueScope { query, space_id, kind: None }).await?;
	Ok(Catalogue {
		chats: observed_chats(&app, database, hits.chats).await?,
		missions: hits.missions.into_iter().map(|hit| observed_mission(&app, hit)).collect(),
		routines: hits.routines,
	})
}

#[tauri::command]
#[specta::specta]
pub async fn search_recent<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<Vec<CatalogueChat>, CatalogueError> {
	let database = ready(&state).map_err(|failure| CatalogueError::Unavailable { failure })?;
	let hits = database.catalogue().recent(space_id).await?;
	observed_chats(&app, database, hits).await
}

async fn observed_chats<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	hits: Vec<ChatHit>,
) -> Result<Vec<CatalogueChat>, CatalogueError> {
	let ids = hits.iter().map(|hit| hit.conversation_id.clone()).collect();
	let states = conversation_state::listed(app, database, ids).await?;
	Ok(hits
		.into_iter()
		.map(|hit| {
			let observed = state_in(&states, &hit.conversation_id);
			CatalogueChat::of(hit, observed)
		})
		.collect())
}

fn observed_mission<R: Runtime>(app: &AppHandle<R>, hit: CatalogueMission) -> CatalogueMission {
	let observed = present(app, &hit.thread_conversation_id, &hit.bot_id, hit.presence());
	hit.with_presence(observed)
}

#[cfg(test)]
mod tests {

	use rusqlite::params;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Manager as _};

	use super::*;
	use crate::agent::commands::a_run_held_by_the_app;
	use crate::agent::contract::{AgentEvent, RuntimeScope, TurnState};
	use crate::agent::reply_writer::TurnSink;
	use crate::conversations::commands::conversation_page;
	use crate::conversations::contract::ConversationState;
	use crate::db::repositories::messages::{NewAssistantMessage, TerminalState};
	use crate::db::repositories::search::MAX_HITS;
	use crate::missions::contract::{MissionDraft, MissionLiveness, Ticket};
	use crate::search::contract::{ConversationKind, SnippetPart, MAX_QUERY_CHARS};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const A_SPACE_EACH: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 257, 1, 1);
		INSERT INTO bots (id, name, model, created_at)
			VALUES ('b1', 'First', 'sonnet', 1), ('b2', 'Second', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at)
			VALUES ('b1', 'personal', 1), ('b2', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'main', NULL, 'Chat', 1, 1), ('c2', 'topic', 'work', 'Room', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('c2', 'b2', 'lead', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at)
			VALUES ('t1', 'c1', 1, 1), ('t2', 'c2', 1, 1);
	";

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("search-commands-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		plant(&app, A_SPACE_EACH).await;
		app
	}

	async fn plant(app: &App<MockRuntime>, statements: &str) {
		let statements = statements.to_owned();
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(&statements)?))
			.await
			.expect("the rows are planted");
	}

	async fn a_settled_message(app: &App<MockRuntime>, id: &str, room: &str, text: &str, at: i64) {
		let turn = if room == "c1" { "t1" } else { "t2" };
		let bot = if room == "c1" { "b1" } else { "b2" };
		plant(
			app,
			&format!(
				"INSERT INTO messages (id, conversation_id, turn_id, author_bot_id, seq, role,
					content, completion_state, created_at)
					VALUES ('{id}', '{room}', '{turn}', '{bot}', {at}, 'assistant', '{text}',
						'complete', {at});"
			),
		)
		.await;
	}

	async fn indexed_rows(app: &App<MockRuntime>, message_id: &str) -> i64 {
		let message_id = message_id.to_owned();
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT COUNT(*) FROM message_search WHERE message_id = ?1",
					params![message_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the index reads")
	}

	fn in_space(text: &str, space_id: &str) -> MessageSearchQuery {
		MessageSearchQuery { text: text.to_owned(), space_id: space_id.to_owned(), kind: None }
	}

	async fn found(app: &App<MockRuntime>, query: MessageSearchQuery) -> Vec<MessageHit> {
		search_messages(app.state(), query).await.expect("the search answers")
	}

	fn ids(hits: &[MessageHit]) -> Vec<String> {
		hits.iter().map(|hit| hit.message_id.clone()).collect()
	}

	#[tokio::test]
	async fn a_search_holds_to_the_space_it_names() {
		let app = a_host("scope").await;
		a_settled_message(&app, "m1", "c1", "the cafe opens at dawn", 1).await;
		a_settled_message(&app, "m2", "c2", "the cafe closes at dusk", 2).await;

		let here = found(&app, in_space("cafe", "personal")).await;
		let there = found(&app, in_space("cafe", "work")).await;

		assert_eq!(ids(&here), vec!["m1".to_owned()], "the scope let another space through");
		assert_eq!(here[0].space_id.as_deref(), Some("personal"), "a main chat lost its space");
		assert_eq!(here[0].conversation_kind, ConversationKind::Main, "the kind of the room moved");
		assert_eq!(here[0].conversation_title, "Chat", "the title of the room moved");
		assert_eq!(here[0].author_bot_id.as_deref(), Some("b1"), "the author of the hit moved");
		assert_eq!(here[0].seq, 1, "the seq of the hit moved");
		assert_eq!(ids(&there), vec!["m2".to_owned()], "the scope let another space through");
	}

	#[tokio::test]
	async fn a_message_reaches_the_index_once_it_settles_and_holds_a_single_row() {
		let app = a_host("settle").await;
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		database
			.messages()
			.open_assistant_message(NewAssistantMessage {
				id: "m1".to_owned(),
				conversation_id: "c1".to_owned(),
				turn_id: "t1".to_owned(),
				author_bot_id: Some("b1".to_owned()),
				replied_to_message_id: None,
				created_at: 1,
			})
			.await
			.expect("the message opens");
		database
			.messages()
			.append_text("m1".to_owned(), "the cafe".to_owned())
			.await
			.expect("the first delta lands");
		database
			.messages()
			.append_text("m1".to_owned(), " opens at dawn".to_owned())
			.await
			.expect("the second delta lands");

		let while_streaming = found(&app, in_space("cafe", "personal")).await;
		assert!(while_streaming.is_empty(), "an unfinished message was already indexed");
		assert_eq!(indexed_rows(&app, "m1").await, 0, "an unfinished message holds an index row");

		database
			.messages()
			.finalize_message("m1".to_owned(), TerminalState::Complete, None)
			.await
			.expect("the message settles");

		let settled = found(&app, in_space("dawn", "personal")).await;
		assert_eq!(
			ids(&settled),
			vec!["m1".to_owned()],
			"a settled message stayed out of the index"
		);
		assert_eq!(indexed_rows(&app, "m1").await, 1, "a message holds more than one index row");
	}

	#[tokio::test]
	async fn every_word_is_required_and_the_last_one_matches_as_a_prefix() {
		let app = a_host("words").await;
		a_settled_message(&app, "m1", "c1", "the cafe opens at dawn", 1).await;
		a_settled_message(&app, "m2", "c1", "the bakery opens at dawn", 2).await;

		let both = found(&app, in_space("cafe daw", "personal")).await;
		let missing = found(&app, in_space("cafe bakery", "personal")).await;

		assert_eq!(ids(&both), vec!["m1".to_owned()], "a word of the query went unmatched");
		assert!(missing.is_empty(), "a message carrying only one of the words was answered");
	}

	#[tokio::test]
	async fn the_case_and_the_accents_of_the_query_do_not_matter() {
		let app = a_host("folding").await;
		a_settled_message(&app, "m1", "c1", "the CAFÉ opens at dawn", 1).await;
		a_settled_message(&app, "m2", "c1", "the creme is ready", 2).await;

		let unaccented = found(&app, in_space("cafe", "personal")).await;
		let accented = found(&app, in_space("crème", "personal")).await;
		let shouted = found(&app, in_space("DAWN", "personal")).await;

		assert_eq!(ids(&unaccented), vec!["m1".to_owned()], "an accent in the message hid it");
		assert_eq!(ids(&accented), vec!["m2".to_owned()], "an accent in the query hid a message");
		assert_eq!(ids(&shouted), vec!["m1".to_owned()], "the case of the query hid a message");
	}

	#[tokio::test]
	async fn punctuation_reads_as_a_separator_and_a_query_without_a_word_answers_nothing() {
		let app = a_host("punctuation").await;
		a_settled_message(&app, "m1", "c1", "the cafe opens at dawn", 1).await;

		let empty = found(&app, in_space("*** \"", "personal")).await;
		let operators = found(&app, in_space("cafe* ^dawn -at:", "personal")).await;
		let quoted = found(&app, in_space("(cafe) \"dawn", "personal")).await;

		assert!(empty.is_empty(), "a query without a letter or a digit answered a hit");
		assert_eq!(ids(&operators), vec!["m1".to_owned()], "an operator broke the search");
		assert_eq!(ids(&quoted), vec!["m1".to_owned()], "a quote broke the search");
	}

	#[tokio::test]
	async fn a_deleted_row_leaves_the_index_with_the_message_and_with_the_conversation() {
		let app = a_host("deletion").await;
		a_settled_message(&app, "m1", "c1", "the cafe opens at dawn", 1).await;
		a_settled_message(&app, "m2", "c2", "the cafe closes at dusk", 2).await;

		plant(&app, "DELETE FROM messages WHERE id = 'm1';").await;
		plant(&app, "DELETE FROM conversations WHERE id = 'c2';").await;

		for space_id in ["personal", "work"] {
			let held = found(&app, in_space("cafe", space_id)).await;
			assert!(held.is_empty(), "a deleted row still answers in {space_id}");
		}
		assert_eq!(indexed_rows(&app, "m1").await, 0, "a deleted message kept its index row");
		assert_eq!(indexed_rows(&app, "m2").await, 0, "a deleted conversation kept its index rows");
	}

	#[tokio::test]
	async fn a_hit_carries_its_snippet_with_the_matched_words_flagged() {
		let app = a_host("snippet").await;
		a_settled_message(&app, "m1", "c1", "the cafe opens at dawn", 1).await;

		let hits = found(&app, in_space("cafe", "personal")).await;

		assert_eq!(
			hits[0].snippet,
			vec![
				SnippetPart { text: "the ".to_owned(), matched: false },
				SnippetPart { text: "cafe".to_owned(), matched: true },
				SnippetPart { text: " opens at dawn".to_owned(), matched: false },
			],
			"the snippet lost the words it matched"
		);
	}

	#[tokio::test]
	async fn hits_come_back_by_relevance_then_by_the_most_recent() {
		let app = a_host("order").await;
		a_settled_message(&app, "m1", "c1", "cafe", 1).await;
		a_settled_message(&app, "m2", "c1", "cafe", 2).await;
		a_settled_message(&app, "m3", "c1", "cafe opens at dawn under a long awning of canvas", 3)
			.await;

		let hits = found(&app, in_space("cafe", "personal")).await;

		assert_eq!(
			ids(&hits),
			vec!["m2".to_owned(), "m1".to_owned(), "m3".to_owned()],
			"the hits came back out of relevance and recency order"
		);
	}

	#[tokio::test]
	async fn the_answer_stops_at_the_hit_cap() {
		let app = a_host("caps").await;
		for at in 1..=i64::from(MAX_HITS) + 5 {
			a_settled_message(&app, &format!("m{at}"), "c1", "the cafe opens at dawn", at).await;
		}

		let capped = found(&app, in_space("cafe", "personal")).await;

		assert_eq!(capped.len(), MAX_HITS as usize, "the answer went past the hit cap");
	}

	#[tokio::test]
	async fn one_character_over_the_cap_is_refused_by_every_command_of_the_search() {
		let app = a_host("query-cap").await;
		let held = "a".repeat(MAX_QUERY_CHARS);
		let over = "a".repeat(MAX_QUERY_CHARS + 1);

		assert!(
			search_messages(app.state(), in_space(&held, "personal")).await.is_ok(),
			"a query at the cap was refused"
		);
		assert!(
			search_catalogue(app.handle().clone(), app.state(), held, "personal".to_owned())
				.await
				.is_ok(),
			"a query at the cap was refused"
		);
		assert_eq!(
			search_messages(app.state(), in_space(&over, "personal")).await,
			Err(MessageSearchError::QueryTooLong { limit: MAX_QUERY_CHARS }),
			"the message search read a query past the cap"
		);
		assert_eq!(
			search_catalogue(app.handle().clone(), app.state(), over, "personal".to_owned()).await,
			Err(CatalogueError::QueryTooLong { limit: MAX_QUERY_CHARS }),
			"the catalogue read a query past the cap"
		);
	}

	fn a_draft_for_c1() -> MissionDraft {
		MissionDraft {
			origin_conversation_id: "c1".to_owned(),
			bot_id: "b1".to_owned(),
			objective: "Fix the crash".to_owned(),
			ticket: Ticket {
				platform: "github".to_owned(),
				external_id: "42".to_owned(),
				url: "https://kiroshi.test/tickets/42".to_owned(),
				title: "Crash on open".to_owned(),
			},
			tools: Vec::new(),
			source: "bot".to_owned(),
			workspace_path: None,
		}
	}

	#[tokio::test]
	async fn a_mission_hit_reads_working_while_its_thread_runs_a_turn() {
		let app = a_host("mission-working").await;
		let opened = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.missions()
			.open(a_draft_for_c1(), "k1".to_owned())
			.await
			.expect("the mission opens");
		let thread = RuntimeScope {
			conversation_id: opened.thread_conversation_id.clone(),
			bot_id: opened.bot_id.clone(),
			runtime_session_id: "r1".to_owned(),
			epoch: 1,
		};
		let run = a_run_held_by_the_app(app.handle(), thread);
		run.emit(AgentEvent::TurnChanged { state: TurnState::Running }, None);

		let found = search_catalogue(
			app.handle().clone(),
			app.state(),
			"crash".to_owned(),
			"personal".to_owned(),
		)
		.await
		.expect("the catalogue answers");

		let hit = found.missions.first().expect("the mission is found");
		assert_eq!(
			(hit.liveness, hit.pending_prompt.clone(), hit.working_bot_ids.clone()),
			(MissionLiveness::Working, None, vec!["b1".to_owned()])
		);
	}

	#[tokio::test]
	async fn a_conversation_hit_carries_the_state_its_page_row_carries() {
		let app = a_host("chat-state").await;

		let found = search_catalogue(
			app.handle().clone(),
			app.state(),
			"room".to_owned(),
			"work".to_owned(),
		)
		.await
		.expect("the catalogue answers");
		let recent = search_recent(app.handle().clone(), app.state(), "work".to_owned())
			.await
			.expect("the recent chats answer");
		let page =
			conversation_page(app.handle().clone(), app.state(), "work".to_owned(), None, None)
				.await
				.expect("the page reads");

		let paged = page.conversations.into_iter().find(|row| row.conversation.id == "c2");
		let paged = paged.expect("the room is on the page").observed;
		assert_eq!(paged.state, ConversationState::Working);
		let catalogued = |chat: &CatalogueChat| {
			(chat.state, chat.pending_prompt.clone(), chat.working_bot_ids.clone())
		};
		let expected = (paged.state, paged.pending_prompt, paged.working_bot_ids);
		assert_eq!(found.chats.first().map(catalogued), Some(expected.clone()));
		assert_eq!(recent.first().map(catalogued), Some(expected));
	}
}
