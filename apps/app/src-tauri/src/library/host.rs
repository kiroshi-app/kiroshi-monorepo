use std::path::Path;
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Runtime};

use super::contract::{
	LibraryDocumentFormat, LibraryDocumentWriterFinished, LibraryError, LibraryWriteOutcome,
};
use super::documents::{located, Location, Placement, WriteStep};
use super::presence::{seat_writer, unseat_writer, Seat, Seated};
use super::{announce, documents, read_document, root};
use crate::agent::host::{Host, Refusal};
use crate::conversations::commands::ready;
use crate::{db, events};

const WRITE_STEPS: usize = 40;

const STEP_PAUSE: Duration = Duration::from_millis(40);

const NO_STORE: &str = "the store of this session is not open";

#[derive(Debug)]
pub struct LibraryHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
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
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace {
		conversation_id: String,
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
	Read,
	Write,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Read {
	name: String,
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
struct DocumentText {
	name: String,
	text: String,
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
	pub fn new(app: AppHandle<R>, conversation_id: String, bot_id: String) -> Self {
		Self { app, conversation_id, bot_id }
	}

	async fn space(&self, database: &db::Database) -> Result<String, DocumentRefusal> {
		database.conversations().space(self.conversation_id.clone()).await?.ok_or_else(|| {
			DocumentRefusal::Tool(ToolRefusal::ConversationWithoutSpace {
				conversation_id: self.conversation_id.clone(),
			})
		})
	}

	async fn agent(&self, database: &db::Database) -> Result<Agent, DocumentRefusal> {
		let bot = database
			.conversations()
			.bot(self.bot_id.clone())
			.await
			.map_err(|error| DocumentRefusal::unexpected(format!("{error:?}")))?
			.ok_or_else(|| {
				DocumentRefusal::unexpected(format!("the agent {} is gone", self.bot_id))
			})?;
		Ok(Agent { id: bot.id, name: bot.name })
	}

	async fn written(
		&self,
		root: &Path,
		space_id: &str,
		agent: &Agent,
		asked: Write,
	) -> Result<DocumentWritten, DocumentRefusal> {
		let mut writing = Writing {
			app: &self.app,
			space_id,
			name: &asked.name,
			agent,
			outcome: LibraryWriteOutcome::Failed,
		};
		markdown(root, space_id, &asked.name)?;
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
		writing.at(&caret);
		let writer = client_id_of(&agent.id);
		for (index, text) in steps(&asked.text).into_iter().enumerate() {
			if index > 0 {
				tokio::time::sleep(STEP_PAUSE).await;
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
			Operation::Read => {
				let asked: Read = Self::read(payload)?;
				Self::answered(markdown(&root, &space_id, &asked.name)?)
			}
			Operation::Write => {
				let asked: Write = Self::read(payload)?;
				let agent = self.agent(database).await?;
				Self::answered(self.written(&root, &space_id, &agent, asked).await?)
			}
		}
	}
}

struct Writing<'a, R: Runtime> {
	app: &'a AppHandle<R>,
	space_id: &'a str,
	name: &'a str,
	agent: &'a Agent,
	outcome: LibraryWriteOutcome,
}

impl<R: Runtime> Writing<'_, R> {
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
		unseat_writer(self.app, self.space_id, self.name, &Seat::Agent(self.agent.id.clone()));
	}
}

fn markdown(root: &Path, space_id: &str, name: &str) -> Result<DocumentText, LibraryError> {
	let document = read_document(root, space_id, name)?;
	if document.format != LibraryDocumentFormat::Markdown {
		return Err(LibraryError::NotADocument { name: name.to_owned() });
	}
	Ok(DocumentText { name: document.name, text: document.content })
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
