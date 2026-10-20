mod common;

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use kiroshi_app::db::repositories::messages::{MessagePageQuery, NewUserMessage, WrittenFrom};
use rusqlite::{params, Connection};
use serde_json::{json, Value};
use tauri::ipc::{CallbackFn, InvokeResponseBody};
use tauri::test::{mock_builder, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{AppHandle, Manager, WebviewWindow, WebviewWindowBuilder};

const CONVERSATIONS: usize = 40;
const MESSAGES_PER_CONVERSATION: usize = 500;
const PAGE_LIMIT: u32 = 20;
const READS: usize = 100;
const COMMITS: usize = 50;
const READ_FROM: usize = 20;
const WRITE_TO: usize = 39;

const BODY: &str = "The page a chat opening reads is twenty rows wide and each row carries a \
	paragraph of prose plus whatever the assistant streamed into it, so a stored row is closer \
	to half a kilobyte than to a word, and the page query pays for every byte it returns.";

const A_CONVERSATION: &str = "INSERT INTO conversations (id, kind, title, created_at, updated_at)
	VALUES (?1, 'main', ?2, 1, 1)";
const A_TURN: &str =
	"INSERT INTO turns (id, conversation_id, seq, started_at) VALUES (?1, ?2, 1, 1)";
const A_MESSAGE: &str = "INSERT INTO messages
	(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'complete', ?4)";
const A_FIRST_PAGE: &str = "SELECT id, turn_id, author_bot_id, replied_to_message_id, seq, role,
		content, completion_state, created_at, runtime_session_id
	FROM messages WHERE conversation_id = ?1 AND seq < ?2 ORDER BY seq DESC LIMIT ?3";

struct Home {
	app: AppOfItsOwn,
}

impl Home {
	fn new() -> Self {
		let app =
			an_app_of_its_own("store-open-cost", mock_builder().invoke_handler(invoke_handler()));
		app.manage(db::bootstrap(app.handle()));
		Self { app }
	}

	fn database(&self) -> &db::Database {
		database_of(self.app.handle())
	}

	fn window(&self) -> WebviewWindow<MockRuntime> {
		WebviewWindowBuilder::new(self.app.handle(), "main", Default::default())
			.build()
			.expect("window builds")
	}
}

fn database_of<M: Manager<MockRuntime>>(manager: &M) -> &db::Database {
	manager.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
}

fn conversation_of(index: usize) -> String {
	format!("c{index}")
}

fn turn_of(index: usize) -> String {
	format!("t{index}")
}

async fn seed(database: &db::Database) {
	database
		.call_mut(|connection| {
			let transaction = connection.transaction()?;
			{
				let mut conversation = transaction.prepare(A_CONVERSATION)?;
				let mut turn = transaction.prepare(A_TURN)?;
				let mut message = transaction.prepare(A_MESSAGE)?;
				for index in 0..CONVERSATIONS {
					let conversation_id = conversation_of(index);
					let turn_id = turn_of(index);
					conversation.execute(params![conversation_id, format!("Chat {index}")])?;
					turn.execute(params![turn_id, conversation_id])?;
					for seq in 1..=MESSAGES_PER_CONVERSATION {
						let role = if seq % 2 == 1 { "user" } else { "assistant" };
						message.execute(params![
							format!("{conversation_id}-m{seq}"),
							conversation_id,
							turn_id,
							seq as i64,
							role,
							format!("{BODY} ({seq})")
						])?;
					}
				}
			}
			transaction.commit()?;
			Ok(())
		})
		.await
		.expect("the transcripts are seeded");
}

async fn first_page(database: &db::Database, conversation_id: &str) -> Vec<String> {
	let page = database
		.messages()
		.page_messages(MessagePageQuery {
			conversation_id: conversation_id.to_owned(),
			before_seq: None,
			limit: PAGE_LIMIT,
		})
		.await
		.expect("the page reads");
	assert!(page.has_more, "a 500 message transcript has more behind its first page");
	page.messages.into_iter().map(|message| message.id).collect()
}

struct ProbedPage {
	whole: Duration,
	query: Duration,
	ids: Vec<String>,
}

async fn probed_first_page(database: &db::Database, conversation_id: &str) -> ProbedPage {
	let conversation_id = conversation_id.to_owned();
	let reading = Instant::now();
	let (query, ids) = database
		.call(move |connection| {
			let running = Instant::now();
			let mut statement = connection.prepare_cached(A_FIRST_PAGE)?;
			let mut rows =
				statement.query(params![conversation_id, i64::MAX, i64::from(PAGE_LIMIT) + 1])?;
			let mut ids: Vec<String> = Vec::new();
			while let Some(row) = rows.next()? {
				if ids.len() == PAGE_LIMIT as usize {
					break;
				}
				ids.push(row.get(0)?);
			}
			ids.reverse();
			Ok((running.elapsed(), ids))
		})
		.await
		.expect("the probed page reads");
	ProbedPage { whole: reading.elapsed(), query, ids }
}

fn page_over_ipc(window: &WebviewWindow<MockRuntime>, conversation_id: &str) -> InvokeResponseBody {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: "conversation_message_page".into(),
			callback: CallbackFn(0),
			error: CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: json!({
				"conversationId": conversation_id,
				"beforeSeq": Value::Null,
				"limit": PAGE_LIMIT
			})
			.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.expect("the page reads over ipc")
}

fn serialized_bytes(body: &InvokeResponseBody) -> usize {
	match body {
		InvokeResponseBody::Json(json) => json.len(),
		InvokeResponseBody::Raw(bytes) => bytes.len(),
	}
}

fn ids_over_ipc(body: InvokeResponseBody) -> Vec<String> {
	let page: Value = body.deserialize().expect("the page decodes");
	page["messages"]
		.as_array()
		.expect("the page carries its messages")
		.iter()
		.map(|message| message["id"].as_str().expect("a message carries an id").to_owned())
		.collect()
}

struct IpcSamples {
	whole: Vec<Duration>,
	bytes: usize,
}

fn ipc_samples(
	window: &WebviewWindow<MockRuntime>,
	conversation_id: &str,
	expected: &[String],
) -> IpcSamples {
	let mut whole = Vec::with_capacity(READS);
	let mut bytes = 0;
	for _ in 0..READS {
		let calling = Instant::now();
		let body = page_over_ipc(window, conversation_id);
		whole.push(calling.elapsed());
		bytes = serialized_bytes(&body);
		assert_eq!(ids_over_ipc(body), expected, "ipc reads the page the repository reads");
	}
	IpcSamples { whole, bytes }
}

struct ReadSamples {
	repository: Vec<Duration>,
	whole: Vec<Duration>,
	waiting: Vec<Duration>,
	query: Vec<Duration>,
}

async fn read_samples(database: &db::Database, conversation_id: &str) -> ReadSamples {
	let mut repository = Vec::with_capacity(READS);
	let mut whole = Vec::with_capacity(READS);
	let mut waiting = Vec::with_capacity(READS);
	let mut query = Vec::with_capacity(READS);
	for _ in 0..READS {
		let reading = Instant::now();
		let expected = first_page(database, conversation_id).await;
		repository.push(reading.elapsed());
		assert_eq!(expected.len(), PAGE_LIMIT as usize, "a first page is one screen of rows");

		let probed = probed_first_page(database, conversation_id).await;
		assert_eq!(probed.ids, expected, "the probe reads the page the repository reads");
		whole.push(probed.whole);
		waiting.push(probed.whole - probed.query);
		query.push(probed.query);
	}
	ReadSamples { repository, whole, waiting, query }
}

async fn commit_samples(
	database: &db::Database,
	conversation_id: &str,
	prefix: &str,
) -> Vec<Duration> {
	let turn_id = turn_of(WRITE_TO);
	let mut samples = Vec::with_capacity(COMMITS);
	for index in 0..COMMITS {
		let message = NewUserMessage {
			id: format!("{prefix}-{index}"),
			conversation_id: conversation_id.to_owned(),
			turn_id: turn_id.clone(),
			author_bot_id: None,
			author: Default::default(),
			written_from: WrittenFrom::Here,
			replied_to_message_id: None,
			content: BODY.to_owned(),
			created_at: index as i64,
		};
		let committing = Instant::now();
		database.messages().append_user_message(message).await.expect("the message commits");
		samples.push(committing.elapsed());
	}
	samples
}

fn synchronous(connection: &Connection) -> Result<i32, db::DatabaseError> {
	Ok(connection.pragma_query_value(None, "synchronous", |row| row.get(0))?)
}

async fn synchronous_of(database: &db::Database) -> i32 {
	database.call(synchronous).await.expect("the pragma reads")
}

async fn set_synchronous(database: &db::Database, level: &'static str) {
	database
		.call(move |connection| Ok(connection.pragma_update(None, "synchronous", level)?))
		.await
		.expect("the pragma is set");
}

fn named(level: i32) -> &'static str {
	match level {
		0 => "OFF",
		1 => "NORMAL",
		2 => "FULL",
		3 => "EXTRA",
		_ => "UNKNOWN",
	}
}

fn percentile(samples: &[Duration], fraction: f64) -> Duration {
	let mut sorted = samples.to_vec();
	sorted.sort_unstable();
	let last = sorted.len() - 1;
	sorted[((last as f64) * fraction).round() as usize]
}

fn millis(span: Duration) -> f64 {
	span.as_secs_f64() * 1_000.0
}

fn spread(samples: &[Duration]) -> (f64, f64) {
	(millis(percentile(samples, 0.5)), millis(percentile(samples, 0.95)))
}

fn report(label: &str, samples: &[Duration]) {
	let (median, p95) = spread(samples);
	println!("{label:<48} median {median:>9.3} ms   p95 {p95:>9.3} ms");
}

fn report_round_trips(path: &str, idle: &[Duration], contended: &[Duration]) {
	let (idle_median, _) = spread(idle);
	let (contended_median, _) = spread(contended);
	println!(
		"two serial round trips over the {path:<11} idle {:>9.3} ms   contended {:>9.3} ms",
		idle_median * 2.0,
		contended_median * 2.0
	);
}

fn report_read(scenario: &str, samples: &ReadSamples) {
	report(&format!("{scenario} — whole read, through the repository"), &samples.repository);
	report(&format!("{scenario} — whole read, probed"), &samples.whole);
	report(&format!("{scenario} — waiting on the connection"), &samples.waiting);
	report(&format!("{scenario} — query, inside the lock"), &samples.query);
}

async fn commits_in_a_loop(handle: AppHandle<MockRuntime>, stop: Arc<AtomicBool>) -> usize {
	let conversation_id = conversation_of(WRITE_TO);
	let turn_id = turn_of(WRITE_TO);
	let mut committed: usize = 0;
	while !stop.load(Ordering::Relaxed) {
		let message = NewUserMessage {
			id: format!("contending-{committed}"),
			conversation_id: conversation_id.clone(),
			turn_id: turn_id.clone(),
			author_bot_id: None,
			author: Default::default(),
			written_from: WrittenFrom::Here,
			replied_to_message_id: None,
			content: BODY.to_owned(),
			created_at: committed as i64,
		};
		database_of(&handle)
			.messages()
			.append_user_message(message)
			.await
			.expect("the contending message commits");
		committed += 1;
	}
	committed
}

#[test]
fn one_transcript_page_costs_this_much_on_the_shared_connection() {
	let home = Home::new();
	let window = home.window();
	let database = home.database();
	let read_from = conversation_of(READ_FROM);
	let write_to = conversation_of(WRITE_TO);
	let runtime = tokio::runtime::Builder::new_multi_thread()
		.worker_threads(2)
		.enable_all()
		.build()
		.expect("runtime");

	runtime.block_on(seed(database));

	let untouched = Instant::now();
	let page = runtime.block_on(first_page(database, &read_from));
	let cold = untouched.elapsed();

	let idle = runtime.block_on(read_samples(database, &read_from));
	let idle_ipc = ipc_samples(&window, &read_from, &page);

	let stop = Arc::new(AtomicBool::new(false));
	let writer = runtime.spawn(commits_in_a_loop(home.app.handle().clone(), Arc::clone(&stop)));
	let contended = runtime.block_on(read_samples(database, &read_from));
	let contended_ipc = ipc_samples(&window, &read_from, &page);
	stop.store(true, Ordering::Relaxed);
	let committed = runtime.block_on(writer).expect("the writer stops");
	assert!(committed > 0, "nothing contended for the connection");

	let effective = runtime.block_on(synchronous_of(database));
	let at_effective = runtime.block_on(commit_samples(database, &write_to, "effective"));
	runtime.block_on(set_synchronous(database, "NORMAL"));
	let at_normal = runtime.block_on(commit_samples(database, &write_to, "normal"));

	println!();
	println!("PRF7 — what one transcript page costs on the store path");
	println!(
		"{CONVERSATIONS} conversations x {MESSAGES_PER_CONVERSATION} messages, \
		page limit {PAGE_LIMIT}, {READS} reads, {COMMITS} commits"
	);
	println!();
	println!("first read of an untouched page cache = {:.3} ms", millis(cold));
	report_read("idle", &idle);
	report("idle — whole read, over ipc", &idle_ipc.whole);
	println!();
	println!("contending writer committed {committed} messages during the read window");
	report_read("contended", &contended);
	report("contended — whole read, over ipc", &contended_ipc.whole);
	println!();
	println!("serialized ipc response, idle      = {} bytes", idle_ipc.bytes);
	println!("serialized ipc response, contended = {} bytes", contended_ipc.bytes);
	println!();
	println!("synchronous in production = {} ({effective})", named(effective));
	report(&format!("one commit at synchronous={}", named(effective)), &at_effective);
	report("one commit at synchronous=NORMAL", &at_normal);
	println!();
	report_round_trips("repository", &idle.repository, &contended.repository);
	report_round_trips("ipc", &idle_ipc.whole, &contended_ipc.whole);
}
