use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::sync::{watch, OwnedMutexGuard};

use super::contract::{
	LibraryDocumentFormat, LibraryDocumentWriterFinished, LibraryError, LibraryItem,
	LibraryItemKind, LibraryWriteOutcome,
};
use super::documents::{located, Location, Placement, WriteStep};
use super::presence::{seat_writer, unseat_writer, Seat, Seated};
use super::{
	a_document, announce, announce_change, create_document, delete_item, document_text, documents,
	encoded_content, import_path, list, read_document, rename_linked_document, resolve, root,
	AcceptedType,
};
use crate::agent::contract::RuntimeScope;
use crate::agent::host::{Host, Refusal};
use crate::conversations::commands::{post_document, ready};
use crate::conversations::contract::TranscriptStoreError;
use crate::db::repositories::keyset::{self, Keyset};
use crate::{db, events};

const WRITE_STEPS: usize = 40;

const LIST_LIMIT_DEFAULT: u32 = 50;

const LIST_LIMIT_MAXIMUM: u32 = 200;

const MAX_SHOWN_IMAGE_BYTES: u64 = 5 * 1024 * 1024 / 4 * 3;

const STEP_PAUSE: Duration = Duration::from_millis(40);

const NO_STORE: &str = "the store of this session is not open";

#[derive(Debug)]
pub struct LibraryHost<R: Runtime> {
	app: AppHandle<R>,
	scope: RuntimeScope,
}

#[derive(Debug, Serialize)]
#[serde(untagged)]
pub enum DocumentRefusal {
	Library(LibraryError),
	Tool(ToolRefusal),
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ToolRefusal {
	PassageNotFound,
	PassageNotUnique,
	Stopped,
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace {
		conversation_id: String,
	},
	#[serde(rename_all = "camelCase")]
	LimitOutOfRange {
		limit: i64,
		minimum: i64,
		maximum: i64,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableCursor {
		cursor: String,
	},
	#[serde(rename_all = "camelCase")]
	UnreadableRequest {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	Unexpected {
		detail: String,
	},
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	List,
	Search,
	Read,
	Create,
	Write,
	Import,
	Rename,
	Delete,
	PostDocument,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listed {
	kind: Option<LibraryItemKind>,
	limit: Option<i64>,
	cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Searched {
	query: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Named {
	name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Created {
	name: String,
	template: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Imported {
	path: PathBuf,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Renamed {
	name: String,
	new_name: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Write {
	name: String,
	text: String,
	after: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
	name: String,
	kind: LibraryItemKind,
	updated_at: i64,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntriesListed {
	items: Vec<Entry>,
	cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct EntriesFound {
	items: Vec<Entry>,
}

#[derive(Debug, Serialize)]
#[serde(tag = "form", rename_all = "camelCase")]
enum ItemRead {
	#[serde(rename_all = "camelCase")]
	Text { name: String, kind: LibraryItemKind, text: String },
	#[serde(rename_all = "camelCase")]
	Image { name: String, mime_type: String, content: String },
	#[serde(rename_all = "camelCase")]
	Described { name: String, kind: LibraryItemKind, mime_type: String, bytes: u64 },
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct Deleted {
	name: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentPosted {
	name: String,
	conversation_id: String,
	message_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct DocumentWritten {
	name: String,
	characters: usize,
}

struct Agent {
	id: String,
	name: String,
}

impl<R: Runtime> LibraryHost<R> {
	pub fn new(app: AppHandle<R>, scope: RuntimeScope) -> Self {
		Self { app, scope }
	}

	fn changed(&self, space_id: &str, item: LibraryItem) -> Entry {
		announce_change(&self.app, space_id);
		Entry::of(item)
	}

	async fn space(&self, database: &db::Database) -> Result<String, DocumentRefusal> {
		database.conversations().space(self.scope.conversation_id.clone()).await?.ok_or_else(|| {
			DocumentRefusal::Tool(ToolRefusal::ConversationWithoutSpace {
				conversation_id: self.scope.conversation_id.clone(),
			})
		})
	}

	async fn agent(&self, database: &db::Database) -> Result<Agent, DocumentRefusal> {
		let bot = database
			.conversations()
			.bot(self.scope.bot_id.clone())
			.await
			.map_err(|error| DocumentRefusal::unexpected(format!("{error:?}")))?
			.ok_or_else(|| {
				DocumentRefusal::unexpected(format!("the agent {} is gone", self.scope.bot_id))
			})?;
		Ok(Agent { id: bot.id, name: bot.name })
	}

	async fn posted(
		&self,
		database: &db::Database,
		name: String,
	) -> Result<DocumentPosted, DocumentRefusal> {
		let message_id = post_document(
			&self.app,
			database,
			&self.scope.conversation_id,
			&self.scope.bot_id,
			&name,
		)
		.await
		.map_err(|error| match error {
			TranscriptStoreError::DocumentRefused { failure, .. } => {
				DocumentRefusal::Library(*failure)
			}
			unexpected => DocumentRefusal::unexpected(format!("{unexpected:?}")),
		})?;
		Ok(DocumentPosted { name, conversation_id: self.scope.conversation_id.clone(), message_id })
	}

	async fn written(
		&self,
		root: &Path,
		space_id: &str,
		agent: &Agent,
		asked: Write,
	) -> Result<DocumentWritten, DocumentRefusal> {
		markdown(root, space_id, &asked.name)?;
		let turn = turn_of(&self.app, space_id, &asked.name, &self.scope).await;
		if turn.is_stopped() {
			drop(Writing::of(&self.app, space_id, &asked.name, agent));
			return Err(ToolRefusal::Stopped.into());
		}
		let opened = documents(&self.app).open(root, space_id, &asked.name)?;
		if let Some(host_edit) = opened.host_edit {
			announce(&self.app, space_id, &asked.name, &host_edit);
		}
		let placement = asked.after.as_deref().map_or(Placement::End, Placement::After);
		let mut caret = match located(&opened.state, &asked.name, &placement)? {
			Location::Caret(caret) => caret,
			Location::PassageNotFound => return Err(ToolRefusal::PassageNotFound.into()),
			Location::PassageNotUnique => return Err(ToolRefusal::PassageNotUnique.into()),
		};
		let mut writing = Writing::of(&self.app, space_id, &asked.name, agent);
		writing.at(&caret);
		let writer = client_id_of(&agent.id);
		for (index, text) in steps(&asked.text).into_iter().enumerate() {
			if index > 0 {
				tokio::time::sleep(STEP_PAUSE).await;
			}
			if turn.is_stopped() {
				return Err(ToolRefusal::Stopped.into());
			}
			let step = WriteStep { writer, caret: &caret, text };
			let written = documents(&self.app).write(root, space_id, &asked.name, &step)?;
			announce(&self.app, space_id, &written.name, &written.change);
			caret = written.caret;
			writing.at(&caret);
		}
		writing.outcome = LibraryWriteOutcome::Finished;
		Ok(DocumentWritten { name: asked.name.clone(), characters: asked.text.chars().count() })
	}
}

impl<R: Runtime> Host for LibraryHost<R> {
	const SUBTYPE: &'static str = "library";

	type Operation = Operation;

	type Error = DocumentRefusal;

	async fn served(&self, operation: Operation, payload: Value) -> Result<Value, DocumentRefusal> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)
			.map_err(|error| Self::Error::unexpected(format!("{NO_STORE}: {error:?}")))?;
		let space_id = self.space(database).await?;
		let root = root(&self.app)?;
		match operation {
			Operation::List => Self::answered(listed(&root, &space_id, Self::read(payload)?)?),
			Operation::Search => Self::answered(found(&root, &space_id, &Self::read(payload)?)?),
			Operation::Read => {
				let asked: Named = Self::read(payload)?;
				Self::answered(item_read(&root, &space_id, &asked.name)?)
			}
			Operation::Create => {
				let asked: Created = Self::read(payload)?;
				let created =
					create_document(&root, &space_id, &asked.name, asked.template.as_deref())?;
				Self::answered(self.changed(&space_id, created))
			}
			Operation::Write => {
				let asked: Write = Self::read(payload)?;
				let agent = self.agent(database).await?;
				Self::answered(self.written(&root, &space_id, &agent, asked).await?)
			}
			Operation::Import => {
				let asked: Imported = Self::read(payload)?;
				let imported = import_path(&root, &space_id, &asked.path)?;
				Self::answered(self.changed(&space_id, imported))
			}
			Operation::Rename => {
				let asked: Renamed = Self::read(payload)?;
				a_document(&root, &space_id, &asked.name)?;
				let renamed = rename_linked_document(
					&self.app,
					database,
					&root,
					&space_id,
					&asked.name,
					&asked.new_name,
				)
				.await?;
				Self::answered(self.changed(&space_id, renamed))
			}
			Operation::Delete => {
				let asked: Named = Self::read(payload)?;
				delete_item(&self.app, &root, &space_id, &asked.name)?;
				Self::answered(Deleted { name: asked.name })
			}
			Operation::PostDocument => {
				let asked: Named = Self::read(payload)?;
				Self::answered(self.posted(database, asked.name).await?)
			}
		}
	}
}

impl Entry {
	fn of(item: LibraryItem) -> Self {
		Self { name: item.name, kind: item.kind, updated_at: item.modified_at }
	}
}

fn listed(root: &Path, space_id: &str, asked: Listed) -> Result<EntriesListed, DocumentRefusal> {
	let size = list_limit(asked.limit)?;
	let after =
		keyset::after(asked.cursor).map_err(|cursor| ToolRefusal::UnreadableCursor { cursor })?;
	let rows = list(root, space_id)?
		.into_iter()
		.filter(|item| asked.kind.is_none_or(|kind| item.kind == kind))
		.filter(|item| after.as_ref().is_none_or(|after| is_past(item, after)))
		.take(size as usize + 1)
		.collect();
	let page = keyset::paged(rows, size, |item: &LibraryItem| Keyset {
		sort_key: item.modified_at,
		id: item.name.clone(),
	});
	Ok(EntriesListed {
		items: page.rows.into_iter().map(Entry::of).collect(),
		cursor: page.next.map(|next| next.encoded()),
	})
}

fn list_limit(limit: Option<i64>) -> Result<u32, ToolRefusal> {
	let Some(limit) = limit else {
		return Ok(LIST_LIMIT_DEFAULT);
	};
	u32::try_from(limit).ok().filter(|held| (1..=LIST_LIMIT_MAXIMUM).contains(held)).ok_or(
		ToolRefusal::LimitOutOfRange { limit, minimum: 1, maximum: i64::from(LIST_LIMIT_MAXIMUM) },
	)
}

fn is_past(item: &LibraryItem, after: &Keyset) -> bool {
	item.modified_at < after.sort_key
		|| (item.modified_at == after.sort_key && item.name > after.id)
}

fn found(root: &Path, space_id: &str, asked: &Searched) -> Result<EntriesFound, LibraryError> {
	let query = asked.query.to_lowercase();
	let mut items = Vec::new();
	for item in list(root, space_id)? {
		if item.name.to_lowercase().contains(&query) || text_holds(root, space_id, &item, &query)? {
			items.push(Entry::of(item));
		}
	}
	Ok(EntriesFound { items })
}

fn text_holds(
	root: &Path,
	space_id: &str,
	item: &LibraryItem,
	query: &str,
) -> Result<bool, LibraryError> {
	if item.kind != LibraryItemKind::Document {
		return Ok(false);
	}
	let resolved = resolve(root, space_id, &item.name)?;
	match document_text(&resolved, &item.name) {
		Ok(text) => Ok(text.to_lowercase().contains(query)),
		Err(LibraryError::NotUtf8 { .. } | LibraryError::TooLarge { .. }) => {
			log::warn!(
				"a library search of space {space_id} matched {} on its name only: its text is unreadable",
				item.name
			);
			Ok(false)
		}
		Err(error) => Err(error),
	}
}

fn item_read(root: &Path, space_id: &str, name: &str) -> Result<ItemRead, LibraryError> {
	let item = resolve(root, space_id, name)?;
	let name = name.to_owned();
	Ok(match item.accepted {
		AcceptedType::Document(_) => ItemRead::Text {
			text: document_text(&item, &name)?,
			name,
			kind: LibraryItemKind::Document,
		},
		AcceptedType::Image { mime_type } if item.bytes <= MAX_SHOWN_IMAGE_BYTES => {
			ItemRead::Image {
				content: encoded_content(&item, &name)?,
				name,
				mime_type: mime_type.to_owned(),
			}
		}
		AcceptedType::Image { mime_type } => ItemRead::Described {
			name,
			kind: LibraryItemKind::Image,
			mime_type: mime_type.to_owned(),
			bytes: item.bytes,
		},
	})
}

struct Writing<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	space_id: &'a str,
	name: &'a str,
	agent: &'a Agent,
	outcome: LibraryWriteOutcome,
}

impl<'a, R: Runtime> Writing<'a, R> {
	fn of(app: &'a AppHandle<R>, space_id: &'a str, name: &'a str, agent: &'a Agent) -> Self {
		Self { app, space_id, name, agent, outcome: LibraryWriteOutcome::Failed }
	}

	fn at(&self, caret: &[u8]) {
		let seated = Seated {
			seat: Seat::Agent(self.agent.id.clone()),
			name: Some(self.agent.name.clone()),
			caret: BASE64_STANDARD.encode(caret),
			lease_ends_at: None,
		};
		seat_writer(self.app, self.space_id, self.name, seated);
	}
}

impl<R: Runtime> Drop for Writing<'_, R> {
	fn drop(&mut self) {
		let finished = LibraryDocumentWriterFinished {
			space_id: self.space_id.to_owned(),
			name: self.name.to_owned(),
			agent_id: self.agent.id.clone(),
			agent_name: self.agent.name.clone(),
			outcome: self.outcome,
		};
		if let Err(error) =
			events::emit(self.app, events::LIBRARY_DOCUMENT_WRITER_FINISHED, finished)
		{
			log::warn!(
				"the end of a write by agent {} in space {} was not published: {error}",
				self.agent.id,
				self.space_id
			);
		}
	}
}

type WriteKey = (String, String, String);

type WriteQueue = Arc<tokio::sync::Mutex<()>>;

struct Writer {
	scope: RuntimeScope,
	stop: Arc<watch::Sender<bool>>,
}

#[derive(Default)]
struct AgentWrites {
	queues: Mutex<HashMap<WriteKey, WriteQueue>>,
	writers: Mutex<HashMap<WriteKey, Vec<Writer>>>,
}

impl AgentWrites {
	fn held(&self) -> MutexGuard<'_, HashMap<WriteKey, WriteQueue>> {
		self.queues.lock().unwrap_or_else(PoisonError::into_inner)
	}

	fn writing(&self) -> MutexGuard<'_, HashMap<WriteKey, Vec<Writer>>> {
		self.writers.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

struct Enlisted<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	key: WriteKey,
	stop: Arc<watch::Sender<bool>>,
	stopped: watch::Receiver<bool>,
}

fn enlisted<'a, R: Runtime>(
	app: &'a AppHandle<R>,
	key: WriteKey,
	scope: &RuntimeScope,
) -> Enlisted<'a, R> {
	let (stop, stopped) = watch::channel(false);
	let stop = Arc::new(stop);
	let writer = Writer { scope: scope.clone(), stop: stop.clone() };
	writes(app).writing().entry(key.clone()).or_default().push(writer);
	Enlisted { app, key, stop, stopped }
}

impl<R: Runtime> Drop for Enlisted<'_, R> {
	fn drop(&mut self) {
		let writes = writes(self.app);
		let mut writing = writes.writing();
		let Some(writers) = writing.get_mut(&self.key) else {
			return;
		};
		writers.retain(|writer| !Arc::ptr_eq(&writer.stop, &self.stop));
		if writers.is_empty() {
			writing.remove(&self.key);
		}
	}
}

struct Turn<'a, R: Runtime> {
	_held: OwnedMutexGuard<()>,
	enlisted: Enlisted<'a, R>,
}

impl<R: Runtime> Turn<'_, R> {
	fn is_stopped(&self) -> bool {
		*self.enlisted.stopped.borrow()
	}
}

async fn turn_of<'a, R: Runtime>(
	app: &'a AppHandle<R>,
	space_id: &str,
	name: &str,
	scope: &RuntimeScope,
) -> Turn<'a, R> {
	let key = (space_id.to_owned(), name.to_owned(), scope.bot_id.clone());
	let enlisted = enlisted(app, key.clone(), scope);
	let queue = writes(app).held().entry(key).or_default().clone();
	let held = queue.lock_owned().await;
	Turn { _held: held, enlisted }
}

pub(crate) async fn stop_writers<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	name: &str,
	agent_id: Option<&str>,
) -> Vec<RuntimeScope> {
	let stopping: Vec<_> = writes(app)
		.writing()
		.iter()
		.filter(|((space, document, agent), _)| {
			space == space_id && document == name && agent_id.is_none_or(|asked| asked == agent)
		})
		.flat_map(|(_, writers)| writers)
		.map(|writer| {
			writer.stop.send_replace(true);
			(writer.scope.clone(), writer.stop.clone())
		})
		.collect();
	join_all(stopping.iter().map(|(_, stop)| stop.closed())).await;
	let mut scopes = Vec::new();
	for (scope, _) in stopping {
		if !scopes.contains(&scope) {
			scopes.push(scope);
		}
	}
	scopes
}

impl<R: Runtime> Drop for Turn<'_, R> {
	fn drop(&mut self) {
		let Enlisted { app, key, .. } = &self.enlisted;
		let writes = writes(app);
		let mut held = writes.held();
		let is_another_queued = held.get(key).is_some_and(|queue| Arc::strong_count(queue) > 2);
		if is_another_queued {
			return;
		}
		held.remove(key);
		let (space_id, name, agent_id) = key;
		unseat_writer(app, space_id, name, &Seat::Agent(agent_id.clone()));
	}
}

fn writes<R: Runtime>(app: &AppHandle<R>) -> State<'_, AgentWrites> {
	if app.try_state::<AgentWrites>().is_none() {
		app.manage(AgentWrites::default());
	}
	app.state::<AgentWrites>()
}

fn markdown(root: &Path, space_id: &str, name: &str) -> Result<(), LibraryError> {
	let document = read_document(root, space_id, name)?;
	if document.format != LibraryDocumentFormat::Markdown {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	}
	Ok(())
}

fn client_id_of(bot_id: &str) -> u64 {
	let digest = Sha256::digest(bot_id.as_bytes());
	u64::from(u32::from_be_bytes([digest[0], digest[1], digest[2], digest[3]]))
}

fn steps(text: &str) -> Vec<&str> {
	let per_step = text.chars().count().div_ceil(WRITE_STEPS).max(1);
	let mut bounds: Vec<usize> = text.char_indices().step_by(per_step).map(|(at, _)| at).collect();
	bounds.push(text.len());
	bounds.windows(2).map(|bound| &text[bound[0]..bound[1]]).collect()
}

impl From<LibraryError> for DocumentRefusal {
	fn from(error: LibraryError) -> Self {
		Self::Library(error)
	}
}

impl From<ToolRefusal> for DocumentRefusal {
	fn from(refusal: ToolRefusal) -> Self {
		Self::Tool(refusal)
	}
}

impl From<db::DatabaseError> for DocumentRefusal {
	fn from(error: db::DatabaseError) -> Self {
		Self::Library(error.into())
	}
}

impl Refusal for DocumentRefusal {
	fn unreadable(detail: String) -> Self {
		Self::Tool(ToolRefusal::UnreadableRequest { detail })
	}

	fn unexpected(detail: String) -> Self {
		Self::Tool(ToolRefusal::Unexpected { detail })
	}
}

#[cfg(test)]
mod tests;
