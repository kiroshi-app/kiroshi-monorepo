use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use super::contract::{
	AuthorKind, CompanionCreated, CompanionError, Conversation, ConversationAttached,
	ConversationClosed, ConversationRead, ConversationsFound, ConversationsListed,
	FoundConversation, FoundMessage, LastMessage, MessageAuthor, ReadMessage, RosterCompanion,
	SeatedCompanion,
};
use super::launch;
use crate::agent::host::{Host, Refusal};
use crate::agent::reply_writer::{shown_with_attachments, HeldAttachment, TurnAttachments};
use crate::attachments::contract::SubmittedAttachment;
use crate::attachments::{refuse_block, refuse_file, store, Attachments, Rejection, SizedFile};
use crate::conversations::commands::{
	announce_conversation, conversation_create_bot_from_draft, conversation_suggested_bots, ready,
};
use crate::conversations::contract::{
	BotDraft, CompanionArrival, CompanionSpoke, ConversationDeleted, TranscriptStoreError,
};
use crate::db;
use crate::db::repositories::conversations::{
	Bot as StoredBot, ConversationAmendment, ConversationDraft, ListedConversation, Listing, Seat,
	LISTED_KINDS, MISSION_KIND, TOPIC_KIND,
};
use crate::db::repositories::keyset;
use crate::db::repositories::messages::{AccountAuthor, MessagePageQuery, StoredMessage};
use crate::events::{
	self, Event, COMPANION_ARRIVED, COMPANION_CREATED, COMPANION_SPOKE, CONVERSATION_DELETED,
	CONVERSATION_UPDATED, FIRST_RUN_DONE,
};
use crate::file_store::FileStore;
use crate::search::contract::{
	CatalogueScope, ChatHit, ConversationKind, MessageHit, MessageSearchQuery,
};

const LIST_LIMIT: Bound = Bound { default: 50, maximum: 200 };

const READ_LIMIT: Bound = Bound { default: 20, maximum: 100 };

const LAST_MESSAGE_LENGTH: usize = 200;

#[derive(Debug)]
pub struct CompanionHost<R: Runtime> {
	app: AppHandle<R>,
	conversation_id: String,
	bot_id: String,
	attachments: Arc<TurnAttachments>,
}

impl<R: Runtime> CompanionHost<R> {
	pub fn new(
		app: AppHandle<R>,
		conversation_id: String,
		bot_id: String,
		attachments: Arc<TurnAttachments>,
	) -> Self {
		Self { app, conversation_id, bot_id, attachments }
	}

	async fn roster(
		&self,
		database: &db::Database,
	) -> Result<Vec<RosterCompanion>, CompanionError> {
		let space_id = self.space(database).await?;
		let roster = database.conversations().bots(Some(space_id)).await?;
		Ok(roster.into_iter().map(RosterCompanion::from).collect())
	}

	async fn holds_seat(
		&self,
		database: &db::Database,
		conversation_id: &str,
	) -> Result<(), CompanionError> {
		let seats = database
			.conversations()
			.seats(conversation_id.to_owned())
			.await
			.map_err(TranscriptStoreError::from)?;
		match seats.iter().any(|seat| seat.bot_id == self.bot_id && seat.left_at.is_none()) {
			true => Ok(()),
			false => {
				Err(CompanionError::CallerNotSeated { conversation_id: conversation_id.to_owned() })
			}
		}
	}

	async fn open(
		&self,
		database: &db::Database,
		asked: Opened,
	) -> Result<Conversation, CompanionError> {
		let title = asked.title.trim();
		if title.is_empty() {
			return Err(CompanionError::EmptyTitleField);
		}
		let message = asked.message.trim();
		if message.is_empty() {
			return Err(CompanionError::EmptyMessageField);
		}
		let space_id = self.space(database).await?;
		let roster = database.conversations().bots(Some(space_id.clone())).await?;
		let mut bot_ids = vec![self.bot_id.clone()];
		for companion in &asked.with {
			let seated = picked(&roster, companion)?;
			if !bot_ids.contains(&seated.id) {
				bot_ids.push(seated.id.clone());
			}
		}
		let draft = ConversationDraft {
			space_id,
			section_id: None,
			title: title.to_owned(),
			icon: Some(asked.icon),
			bot_ids,
		};
		let room = database
			.conversations()
			.create_conversation(draft)
			.await
			.map_err(TranscriptStoreError::from)?;
		self.announce(
			COMPANION_SPOKE,
			CompanionSpoke {
				conversation_id: room.id.clone(),
				author_bot_id: self.bot_id.clone(),
				text: message.to_owned(),
			},
		)?;
		conversation_answer(database, room.id).await
	}

	async fn say(
		&self,
		database: &db::Database,
		asked: Said,
	) -> Result<Conversation, CompanionError> {
		let message = asked.message.trim();
		if message.is_empty() {
			return Err(CompanionError::EmptyMessageField);
		}
		carries_seats(database, &asked.conversation).await?;
		self.holds_seat(database, &asked.conversation).await?;
		let said = conversation_answer(database, asked.conversation.clone()).await?;
		self.announce(
			COMPANION_SPOKE,
			CompanionSpoke {
				conversation_id: asked.conversation.clone(),
				author_bot_id: self.bot_id.clone(),
				text: message.to_owned(),
			},
		)?;
		Ok(said)
	}

	async fn update(
		&self,
		database: &db::Database,
		asked: Updated,
	) -> Result<Conversation, CompanionError> {
		let title = asked.title.as_deref().map(str::trim);
		if title.is_some_and(str::is_empty) {
			return Err(CompanionError::EmptyTitleField);
		}
		let moves_seats = !asked.add.is_empty() || !asked.remove.is_empty();
		if title.is_none()
			&& asked.icon.is_none()
			&& asked.colour.is_none()
			&& asked.archived.is_none()
			&& !moves_seats
		{
			return Err(CompanionError::EmptyUpdate);
		}
		let conversation_id = asked.conversation.unwrap_or_else(|| self.conversation_id.clone());
		if asked.archived == Some(true) {
			return Err(CompanionError::ArchiveThroughConversationClose { conversation_id });
		}
		self.holds_seat(database, &conversation_id).await?;
		let roster = match moves_seats {
			true => roster_of_room(database, &conversation_id).await?,
			false => Vec::new(),
		};
		let amendment = ConversationAmendment {
			title: title.map(str::to_owned),
			icon: asked.icon,
			color: asked.colour,
			seated: ids_of(&roster, &asked.add)?,
			unseated: ids_of(&roster, &asked.remove)?,
			reopened: asked.archived == Some(false),
			amended_by: self.bot_id.clone(),
		};
		let amended = database
			.conversations()
			.amend_conversation(conversation_id, amendment)
			.await
			.map_err(TranscriptStoreError::from)?;
		for arrival in amended.arrivals {
			launch::announce(&self.app, COMPANION_ARRIVED, CompanionArrival::from(arrival));
		}
		let conversation_id = &amended.conversation.active.conversation.id;
		announce_conversation(&self.app, database, CONVERSATION_UPDATED, conversation_id).await;
		Ok(conversation_of(amended.conversation))
	}

	async fn search(
		&self,
		database: &db::Database,
		asked: Searched,
	) -> Result<ConversationsFound, CompanionError> {
		if asked.query.trim().is_empty() {
			return Err(CompanionError::EmptyQueryField);
		}
		let space_id = self.space(database).await?;
		let hits = database
			.search()
			.messages(MessageSearchQuery {
				text: asked.query.clone(),
				space_id: space_id.clone(),
				kind: asked.kind,
			})
			.await?;
		let catalogue = database
			.catalogue()
			.search(CatalogueScope { query: asked.query, space_id, kind: asked.kind })
			.await?;
		Ok(ConversationsFound {
			conversations: catalogue.chats.into_iter().map(found_conversation).collect(),
			messages: hits.into_iter().map(found_message).collect(),
		})
	}

	async fn close(
		&self,
		database: &db::Database,
		asked: Closed,
	) -> Result<ConversationClosed, CompanionError> {
		let conversation_id = asked.conversation;
		match database.conversations().kind(conversation_id.clone()).await? {
			Some(kind) if kind == TOPIC_KIND => self.leads(database, &conversation_id).await?,
			Some(kind) if kind == MISSION_KIND => {
				refuse_open_mission(database, &conversation_id).await?;
				self.holds_seat(database, &conversation_id).await?;
			}
			Some(kind) => {
				return Err(CompanionError::UnclosableConversation {
					conversation_id,
					conversation_kind: kind,
				})
			}
			None => return Err(CompanionError::UnknownConversation { conversation_id }),
		}
		let archived = database
			.conversations()
			.archive_conversation(conversation_id)
			.await
			.map_err(TranscriptStoreError::from)?;
		launch::announce(
			&self.app,
			CONVERSATION_DELETED,
			ConversationDeleted {
				space_id: archived.space_id,
				conversation_id: archived.id.clone(),
			},
		);
		Ok(ConversationClosed {
			conversation_id: archived.id,
			title: archived.title,
			archived: true,
		})
	}

	async fn leads(
		&self,
		database: &db::Database,
		conversation_id: &str,
	) -> Result<(), CompanionError> {
		let seats = database
			.conversations()
			.seats(conversation_id.to_owned())
			.await
			.map_err(TranscriptStoreError::from)?;
		match seats
			.iter()
			.any(|seat| seat.bot_id == self.bot_id && seat.left_at.is_none() && seat.is_lead())
		{
			true => Ok(()),
			false => {
				Err(CompanionError::CallerNotLead { conversation_id: conversation_id.to_owned() })
			}
		}
	}

	async fn attach(
		&self,
		database: &db::Database,
		asked: Attached,
	) -> Result<ConversationAttached, CompanionError> {
		let caption = asked
			.caption
			.map(|caption| caption.trim().to_owned())
			.filter(|caption| !caption.is_empty());
		let root = Attachments::dir(&self.app).ok_or_else(|| Rejection::Unwritable {
			detail: "there is no application data directory to store attachments in".to_owned(),
		})?;
		match asked.conversation {
			None => self.attach_here(&root, &asked.path, caption),
			Some(room) => self.attach_in_room(database, &root, room, &asked.path, caption).await,
		}
	}

	fn attach_here(
		&self,
		root: &Path,
		path: &str,
		caption: Option<String>,
	) -> Result<ConversationAttached, CompanionError> {
		let stored = self.attachments.hold_with(|held| {
			let bytes = file_bytes(path)?;
			let held_names: Vec<String> =
				held.iter().map(|file| file.path.to_string_lossy().into_owned()).collect();
			let mut block: Vec<SizedFile<'_>> = held
				.iter()
				.zip(&held_names)
				.map(|(file, name)| SizedFile { name, bytes: file.bytes })
				.collect();
			block.push(SizedFile { name: path, bytes: bytes.len() as u64 });
			refuse_block(&block)?;
			let size = bytes.len() as u64;
			let stored = stored_copy(root, &self.conversation_id, path, bytes)?;
			Ok::<_, CompanionError>(HeldAttachment { path: stored, bytes: size, caption })
		})?;
		Ok(ConversationAttached {
			path: stored.to_string_lossy().into_owned(),
			conversation_id: self.conversation_id.clone(),
		})
	}

	async fn attach_in_room(
		&self,
		database: &db::Database,
		root: &Path,
		room: String,
		path: &str,
		caption: Option<String>,
	) -> Result<ConversationAttached, CompanionError> {
		carries_seats(database, &room).await?;
		self.holds_seat(database, &room).await?;
		let bytes = file_bytes(path)?;
		let size = bytes.len() as u64;
		refuse_block(&[SizedFile { name: path, bytes: size }])?;
		let stored = stored_copy(root, &room, path, bytes)?;
		let shown = HeldAttachment { path: stored.clone(), bytes: size, caption };
		let spoken = CompanionSpoke {
			conversation_id: room.clone(),
			author_bot_id: self.bot_id.clone(),
			text: shown_with_attachments("", &[shown], Utc::now()),
		};
		if let Err(error) = self.announce(COMPANION_SPOKE, spoken) {
			take_back(&stored);
			return Err(error);
		}
		Ok(ConversationAttached {
			path: stored.to_string_lossy().into_owned(),
			conversation_id: room,
		})
	}

	async fn list(
		&self,
		database: &db::Database,
		asked: Listed,
	) -> Result<ConversationsListed, CompanionError> {
		let size = LIST_LIMIT.applied(asked.limit)?;
		let kind = asked.kind.map(listed_kind).transpose()?;
		let after = keyset::after(asked.cursor)
			.map_err(|cursor| CompanionError::UnreadableCursor { cursor })?;
		let listing = Listing {
			space_id: self.space(database).await?,
			kind,
			seated_bot_id: (!asked.everywhere).then(|| self.bot_id.clone()),
		};
		let page = database
			.conversations()
			.listed_page(listing, after, size)
			.await
			.map_err(TranscriptStoreError::from)?;
		Ok(ConversationsListed {
			conversations: page.rows.into_iter().map(conversation_of).collect(),
			cursor: page.next.map(|next| next.encoded()),
		})
	}

	async fn consult(
		&self,
		database: &db::Database,
		asked: Consulted,
	) -> Result<ConversationRead, CompanionError> {
		let limit = READ_LIMIT.applied(asked.limit)?;
		let space_id = self.space(database).await?;
		let listed = database
			.conversations()
			.listed_conversation(asked.conversation.clone())
			.await
			.map_err(TranscriptStoreError::from)?
			.filter(|listed| listed.active.conversation.space_id.as_ref() == Some(&space_id))
			.ok_or_else(|| CompanionError::UnknownConversation {
				conversation_id: asked.conversation.clone(),
			})?;
		let query = MessagePageQuery {
			conversation_id: asked.conversation,
			before_seq: asked.before,
			limit,
		};
		let page =
			database.messages().page_messages(query).await.map_err(TranscriptStoreError::from)?;
		let cursor = page.messages.first().filter(|_| page.has_more).map(|oldest| oldest.seq);
		let seats = &listed.active.conversation.seats;
		let messages =
			page.messages.into_iter().map(|stored| read_message(seats, stored)).collect();
		Ok(ConversationRead { conversation: conversation_of(listed), messages, cursor })
	}

	async fn space(&self, database: &db::Database) -> Result<String, CompanionError> {
		space_of(database, &self.conversation_id).await
	}

	fn announce<P: Serialize + Clone>(
		&self,
		event: Event<P>,
		payload: P,
	) -> Result<(), CompanionError> {
		events::emit(&self.app, event, payload)
			.map_err(|error| CompanionError::Undeliverable { detail: error.to_string() })
	}
}

fn found_conversation(chat: ChatHit) -> FoundConversation {
	FoundConversation {
		id: chat.conversation_id,
		kind: chat.kind,
		title: chat.title,
		participants: chat.participants,
	}
}

fn found_message(hit: MessageHit) -> FoundMessage {
	FoundMessage {
		conversation_id: hit.conversation_id,
		conversation_title: hit.conversation_title,
		message_id: hit.message_id,
		author: hit.author_bot_id,
		created_at: hit.created_at,
		snippet: hit.snippet.into_iter().map(|part| part.text).collect(),
	}
}

fn file_bytes(path: &str) -> Result<Vec<u8>, CompanionError> {
	let unreadable =
		|detail: String| CompanionError::UnreadableFile { path: path.to_owned(), detail };
	let metadata = fs::metadata(path).map_err(|error| unreadable(error.to_string()))?;
	if metadata.is_dir() {
		return Err(unreadable("it is a directory".to_owned()));
	}
	refuse_file(&SizedFile { name: path, bytes: metadata.len() })?;
	fs::read(path).map_err(|error| unreadable(error.to_string()))
}

fn stored_copy(
	root: &Path,
	conversation_id: &str,
	path: &str,
	bytes: Vec<u8>,
) -> Result<PathBuf, CompanionError> {
	let submitted = SubmittedAttachment { name: path.to_owned(), bytes: Some(bytes), base64: None };
	store(root, conversation_id, &[submitted])?.into_iter().next().ok_or_else(|| {
		CompanionError::Unexpected { detail: "the attachment store answered no path".to_owned() }
	})
}

fn take_back(stored: &Path) {
	if let Err(error) = fs::remove_file(stored) {
		log::warn!("an attachment left behind by a refused post could not be removed: {error}");
	}
}

async fn carries_seats(
	database: &db::Database,
	conversation_id: &str,
) -> Result<(), CompanionError> {
	match database.conversations().kind(conversation_id.to_owned()).await? {
		Some(kind) if kind == TOPIC_KIND => Ok(()),
		Some(kind) => Err(CompanionError::ConversationWithoutSeats {
			conversation_id: conversation_id.to_owned(),
			conversation_kind: kind,
		}),
		None => Err(CompanionError::ConversationWithoutSpace {
			conversation_id: conversation_id.to_owned(),
		}),
	}
}

async fn refuse_open_mission(
	database: &db::Database,
	conversation_id: &str,
) -> Result<(), CompanionError> {
	match database.missions().in_thread(conversation_id.to_owned(), 0).await? {
		Some(threaded) if threaded.mission.closed_at.is_none() => {
			Err(CompanionError::MissionStillOpen {
				conversation_id: conversation_id.to_owned(),
				mission_id: threaded.mission.id,
			})
		}
		_ => Ok(()),
	}
}

async fn roster_of_room(
	database: &db::Database,
	conversation_id: &str,
) -> Result<Vec<StoredBot>, CompanionError> {
	carries_seats(database, conversation_id).await?;
	let space_id = space_of(database, conversation_id).await?;
	Ok(database.conversations().bots(Some(space_id)).await?)
}

fn ids_of(roster: &[StoredBot], companions: &[String]) -> Result<Vec<String>, CompanionError> {
	companions.iter().map(|companion| picked(roster, companion).map(|bot| bot.id.clone())).collect()
}

async fn conversation_answer(
	database: &db::Database,
	conversation_id: String,
) -> Result<Conversation, CompanionError> {
	let listed = database
		.conversations()
		.listed_conversation(conversation_id.clone())
		.await
		.map_err(TranscriptStoreError::from)?
		.ok_or(CompanionError::UnknownConversation { conversation_id })?;
	Ok(conversation_of(listed))
}

fn conversation_of(listed: ListedConversation) -> Conversation {
	let ListedConversation { active, kind, is_archived } = listed;
	let room = active.conversation;
	let last_message = match active.last_word {
		None => None,
		Some(word) => Some(LastMessage {
			author: author_of(&room.seats, word.author_bot_id, word.author).name,
			text: word
				.text
				.map(|text| text.chars().take(LAST_MESSAGE_LENGTH).collect())
				.unwrap_or_default(),
			time: word.at,
		}),
	};
	Conversation {
		conversation_id: room.id,
		kind,
		title: room.title,
		icon: room.icon,
		colour: room.color.map(|colour| colour.named().to_owned()),
		companions: room
			.seats
			.into_iter()
			.filter(|seat| seat.left_at.is_none() && !seat.is_deleted)
			.map(|seat| SeatedCompanion { id: seat.bot_id, name: seat.name })
			.collect(),
		last_message,
		archived: is_archived,
	}
}

fn read_message(seats: &[Seat], stored: StoredMessage) -> ReadMessage {
	ReadMessage {
		seq: stored.seq,
		author: author_of(seats, stored.author_bot_id, stored.author),
		time: stored.created_at,
		text: stored.content,
	}
}

fn author_of(
	seats: &[Seat],
	author_bot_id: Option<String>,
	author: AccountAuthor,
) -> MessageAuthor {
	let Some(bot_id) = author_bot_id else {
		return MessageAuthor {
			kind: AuthorKind::Person,
			id: author.account_id,
			name: author.name,
		};
	};
	let name = seats.iter().find(|seat| seat.bot_id == bot_id).map(|seat| seat.name.clone());
	MessageAuthor { kind: AuthorKind::Companion, id: Some(bot_id), name }
}

fn listed_kind(kind: String) -> Result<String, CompanionError> {
	if LISTED_KINDS.contains(&kind.as_str()) {
		return Ok(kind);
	}
	Err(CompanionError::UnknownConversationKind {
		conversation_kind: kind,
		accepted: LISTED_KINDS.iter().map(|accepted| (*accepted).to_owned()).collect(),
	})
}

struct Bound {
	default: u32,
	maximum: u32,
}

impl Bound {
	fn applied(&self, limit: Option<i64>) -> Result<u32, CompanionError> {
		let Some(limit) = limit else {
			return Ok(self.default);
		};
		u32::try_from(limit).ok().filter(|held| (1..=self.maximum).contains(held)).ok_or(
			CompanionError::LimitOutOfRange { limit, minimum: 1, maximum: i64::from(self.maximum) },
		)
	}
}

async fn space_of(
	database: &db::Database,
	conversation_id: &str,
) -> Result<String, CompanionError> {
	database.conversations().space(conversation_id.to_owned()).await?.ok_or_else(|| {
		CompanionError::ConversationWithoutSpace { conversation_id: conversation_id.to_owned() }
	})
}

impl<R: Runtime> Host for CompanionHost<R> {
	const SUBTYPE: &'static str = "companion";

	type Operation = Operation;

	type Error = CompanionError;

	async fn served(&self, operation: Operation, payload: Value) -> Result<Value, CompanionError> {
		let state = Self::database(&self.app)?;
		let database = ready(&state)?;
		match operation {
			Operation::Suggestions => {
				let _: Bare = Self::read(payload)?;
				Self::answered(conversation_suggested_bots())
			}
			Operation::Create => {
				let asked: Drafted = Self::read(payload)?;
				let space_id = self.space(database).await?;
				let created = conversation_create_bot_from_draft(
					self.app.clone(),
					state,
					asked.into(),
					space_id,
				)
				.await?;
				let companion = CompanionCreated { id: created.id, name: created.name };
				self.announce(COMPANION_CREATED, companion.clone())?;
				Self::answered(companion)
			}
			Operation::FirstRunDone => {
				let _: Bare = Self::read(payload)?;
				database.user().mark_first_run_done().await?;
				self.announce(FIRST_RUN_DONE, ())?;
				Ok(Value::Null)
			}
			Operation::List => {
				let _: Bare = Self::read(payload)?;
				Self::answered(self.roster(database).await?)
			}
			Operation::ConversationOpen => {
				let asked: Opened = Self::read(payload)?;
				Self::answered(self.open(database, asked).await?)
			}
			Operation::ConversationSay => {
				let asked: Said = Self::read(payload)?;
				Self::answered(self.say(database, asked).await?)
			}
			Operation::ConversationAttach => {
				let asked: Attached = Self::read(payload)?;
				Self::answered(self.attach(database, asked).await?)
			}
			Operation::ConversationUpdate => {
				let asked: Updated = Self::read(payload)?;
				Self::answered(self.update(database, asked).await?)
			}
			Operation::ConversationList => {
				let asked: Listed = Self::read(payload)?;
				Self::answered(self.list(database, asked).await?)
			}
			Operation::ConversationRead => {
				let asked: Consulted = Self::read(payload)?;
				Self::answered(self.consult(database, asked).await?)
			}
			Operation::ConversationSearch => {
				let asked: Searched = Self::read(payload)?;
				Self::answered(self.search(database, asked).await?)
			}
			Operation::ConversationClose => {
				let asked: Closed = Self::read(payload)?;
				Self::answered(self.close(database, asked).await?)
			}
		}
	}
}

impl Refusal for CompanionError {
	fn unreadable(detail: String) -> Self {
		Self::UnreadableRequest { detail }
	}

	fn unexpected(detail: String) -> Self {
		Self::Unexpected { detail }
	}
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	Suggestions,
	Create,
	FirstRunDone,
	List,
	ConversationOpen,
	ConversationSay,
	ConversationAttach,
	ConversationUpdate,
	ConversationList,
	ConversationRead,
	ConversationSearch,
	ConversationClose,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bare {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Opened {
	title: String,
	icon: String,
	#[serde(default)]
	with: Vec<String>,
	message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Said {
	conversation: String,
	message: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Attached {
	path: String,
	caption: Option<String>,
	conversation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Updated {
	conversation: Option<String>,
	title: Option<String>,
	icon: Option<String>,
	#[serde(default, deserialize_with = "present")]
	colour: Option<Option<String>>,
	#[serde(default)]
	add: Vec<String>,
	#[serde(default)]
	remove: Vec<String>,
	archived: Option<bool>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listed {
	#[serde(default)]
	everywhere: bool,
	kind: Option<String>,
	limit: Option<i64>,
	cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Consulted {
	conversation: String,
	limit: Option<i64>,
	before: Option<i64>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Searched {
	query: String,
	kind: Option<ConversationKind>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Closed {
	conversation: String,
}

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
	deserializer: D,
) -> Result<Option<T>, D::Error> {
	T::deserialize(deserializer).map(Some)
}

pub(crate) fn picked<'a>(
	roster: &'a [StoredBot],
	companion: &str,
) -> Result<&'a StoredBot, CompanionError> {
	let wanted = companion.trim();
	if let Some(held) = roster.iter().find(|bot| bot.id == wanted) {
		return Ok(held);
	}
	let named: Vec<&StoredBot> = roster
		.iter()
		.filter(|bot| bot.name.trim().to_lowercase() == wanted.to_lowercase())
		.collect();
	match named.as_slice() {
		[held] => Ok(held),
		[] => Err(CompanionError::UnknownCompanion { companion: companion.to_owned() }),
		_ => Err(CompanionError::AmbiguousCompanion {
			companion: companion.to_owned(),
			ids: named.iter().map(|bot| bot.id.clone()).collect(),
		}),
	}
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Drafted {
	name: String,
	job: String,
	description: String,
}

impl From<Drafted> for BotDraft {
	fn from(asked: Drafted) -> Self {
		BotDraft { name: asked.name, job: asked.job, description: asked.description }
	}
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::sync::mpsc;
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener as _, Manager as _};

	use super::*;
	use crate::agent::protocol::HostAnswer;
	use crate::bundles;
	use crate::conversations::contract::{COMPANION_ARRIVED_EVENT, COMPANION_SPOKE_EVENT};
	use crate::db::repositories::conversations::{conversation_icons, DEFAULT_BOT_MODEL};
	use crate::db::repositories::search::MAX_HITS;
	use crate::search::contract::{MAX_MATCHES_PER_LIST, MAX_QUERY_CHARS};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const PATIENCE: Duration = Duration::from_secs(60);

	const A_SPACE: &str = "
		INSERT INTO bots (id, name, model, created_at) VALUES ('b1', 'Shoto', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'personal', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('c1', 'main', 'personal', 'Chat', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('nowhere', 'main', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('c1', 'b1', 'assistant', 1, 0), ('nowhere', 'b1', 'assistant', 1, 0);
	";

	const A_ROOM: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('work', 'Work', 'blue', 1, 1);
		INSERT INTO bots (id, name, model, created_at) VALUES
			('b2', 'Ada', 'sonnet', 1), ('b3', 'Rex', 'sonnet', 1),
			('b4', ' rex ', 'sonnet', 1), ('b5', 'Kai', 'sonnet', 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES
			('b2', 'personal', 1), ('b3', 'personal', 1), ('b4', 'personal', 1), ('b5', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at) VALUES
			('room', 'topic', 'personal', 'Plans', 1, 1),
			('unled', 'topic', 'personal', 'Plans', 1, 1);
		INSERT INTO conversations (id, kind, title, created_at, updated_at)
			VALUES ('drifting', 'topic', 'Plans', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('room', 'b1', 'lead', 1, 0), ('room', 'b2', 'assistant', 1, 1),
				('unled', 'b1', 'assistant', 1, 0), ('drifting', 'b1', 'lead', 1, 0);
	";

	const A_SHARED_SPACE: &str = "
		INSERT INTO spaces (id, name, colour, position, created_at)
			VALUES ('shared', 'Personal', 'red', 1, 1);
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'shared', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('shared-chat', 'main', 'shared', 'Chat', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('shared-chat', 'b1', 'assistant', 1, 0);
	";

	const A_MISSION: &str = "
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('errand', 'mission', 'personal', 'Ship it', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('errand', 'b1', 'lead', 1, 0);
	";

	const ANOTHER_ROOM: &str = "
		INSERT INTO bot_spaces (bot_id, space_id, joined_at) VALUES ('b1', 'work', 1);
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('studio', 'topic', 'work', 'Studio', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('studio', 'b1', 'lead', 1, 0);
		UPDATE conversation_participants SET left_at = 2
			WHERE conversation_id = 'unled' AND bot_id = 'b1';
	";

	const A_DISCUSSION: &str = "
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			VALUES ('elsewhere', 'topic', 'work', 'Studio', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('elsewhere', 'b5', 'lead', 1, 0);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES
			('t-room', 'room', 1, 1), ('t-c1', 'c1', 1, 1), ('t-errand', 'errand', 1, 1),
			('t-elsewhere', 'elsewhere', 1, 1);
		INSERT INTO messages (id, conversation_id, turn_id, author_bot_id, seq, role, content,
			completion_state, created_at) VALUES
			('m-room', 'room', 't-room', NULL, 1, 'user',
				'We should pick the lighthouse for the trip', 'complete', 5),
			('m-c1', 'c1', 't-c1', 'b1', 1, 'assistant',
				'The lighthouse keeper called', 'complete', 6),
			('m-errand', 'errand', 't-errand', 'b1', 1, 'assistant',
				'The lighthouse ships tonight', 'complete', 7),
			('m-elsewhere', 'elsewhere', 't-elsewhere', 'b5', 1, 'assistant',
				'A harbour drawn in the studio', 'complete', 8);
	";

	type Standing = (Vec<(String, String, String, i64, Option<i64>)>, i64);

	async fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("companion-host-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		let system = bundles::system::path(app.handle()).expect("the system bundle is named");
		bundles::system::write(&system).expect("the system bundle lands");
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(|connection| Ok(connection.execute_batch(A_SPACE)?))
			.await
			.expect("the space is planted");
		app
	}

	fn serving(app: &App<MockRuntime>, conversation_id: &str) -> CompanionHost<MockRuntime> {
		CompanionHost::new(
			app.handle().clone(),
			conversation_id.to_owned(),
			"b1".to_owned(),
			Arc::default(),
		)
	}

	async fn a_room(name: &str) -> AppOfItsOwn {
		let app = a_host(name).await;
		planted(&app, A_ROOM).await;
		app
	}

	async fn planted(app: &App<MockRuntime>, batch: &'static str) {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(batch)?))
			.await
			.expect("the fixture is planted");
	}

	fn an_open(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationOpen", "payload": payload })
	}

	async fn written(app: &App<MockRuntime>) -> (i64, i64, i64) {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(|connection| {
				let counted = |table: &str| {
					connection
						.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))
				};
				Ok((counted("conversations")?, counted("messages")?, counted("runtime_sessions")?))
			})
			.await
			.expect("the counts read")
	}

	async fn open_refused(app: &App<MockRuntime>, conversation_id: &str, payload: Value) -> Value {
		let before = (written(app).await, standing(app).await);
		let refused = refusal(serving(app, conversation_id).answer(an_open(payload)).await);
		assert_eq!(
			(written(app).await, standing(app).await),
			before,
			"a refused opening wrote something"
		);
		refused
	}

	fn a_say(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationSay", "payload": payload })
	}

	async fn say_refused(
		app: &App<MockRuntime>,
		host: &CompanionHost<MockRuntime>,
		payload: Value,
	) -> Value {
		let arriving = heard(app, COMPANION_SPOKE_EVENT);
		let before = (written(app).await, standing(app).await);
		let refused = refusal(host.answer(a_say(payload)).await);
		assert_eq!((written(app).await, standing(app).await), before, "a refused word left a mark");
		assert!(arriving.try_recv().is_err(), "a refusal announced");
		refused
	}

	async fn roles_in(app: &App<MockRuntime>, conversation_id: &str) -> Vec<(String, String)> {
		let (seats, _) = standing(app).await;
		seats
			.into_iter()
			.filter(|seat| seat.0 == conversation_id)
			.map(|seat| (seat.1, seat.2))
			.collect()
	}

	async fn standing(app: &App<MockRuntime>) -> Standing {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(|connection| {
				let mut seats = connection.prepare(
					"SELECT conversation_id, bot_id, role, join_seq, left_at
						FROM conversation_participants ORDER BY conversation_id, bot_id",
				)?;
				let held = seats
					.query_map([], |row| {
						Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?))
					})?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				let arrivals = connection.query_row(
					"SELECT count(*) FROM conversation_arrivals",
					[],
					|row| row.get(0),
				)?;
				Ok((held, arrivals))
			})
			.await
			.expect("the seats read")
	}

	async fn role_of(app: &App<MockRuntime>, conversation_id: &str, bot_id: &str) -> String {
		let (seats, _) = standing(app).await;
		seats
			.into_iter()
			.find(|seat| seat.0 == conversation_id && seat.1 == bot_id)
			.map(|seat| seat.2)
			.expect("the companion holds a seat")
	}

	async fn a_discussion(name: &str) -> AppOfItsOwn {
		let app = a_room(name).await;
		planted(&app, A_MISSION).await;
		planted(&app, A_DISCUSSION).await;
		app
	}

	fn a_search(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationSearch", "payload": payload })
	}

	async fn searched_from(
		app: &App<MockRuntime>,
		conversation_id: &str,
		bot_id: &str,
		payload: Value,
	) -> Value {
		CompanionHost::new(
			app.handle().clone(),
			conversation_id.to_owned(),
			bot_id.to_owned(),
			Arc::default(),
		)
		.answer(a_search(payload))
		.await
		.expect("the search is answered")
	}

	fn message_ids(found: &Value) -> Vec<&str> {
		found["messages"]
			.as_array()
			.expect("the messages are a list")
			.iter()
			.filter_map(|message| message["messageId"].as_str())
			.collect()
	}

	fn conversation_ids(found: &Value) -> Vec<&str> {
		found["conversations"]
			.as_array()
			.expect("the conversations are a list")
			.iter()
			.filter_map(|conversation| conversation["id"].as_str())
			.collect()
	}

	async fn a_crowd_of_beacons(app: &App<MockRuntime>) {
		let rooms: Vec<String> = (0..=MAX_MATCHES_PER_LIST)
			.map(|held| format!("('beacon-{held}', 'topic', 'personal', 'Beacon {held}', 10, 10)"))
			.collect();
		let said: Vec<String> = (1..=MAX_HITS + 1)
			.map(|seq| {
				format!(
					"('m-crowd-{seq}', 'beacon-0', 't-crowd', NULL, {seq}, 'user',
						'The beacon', 'complete', {})",
					10 + seq
				)
			})
			.collect();
		let batch = format!(
			"INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at) VALUES
				{},
				('beacon-mission', 'mission', 'personal', 'Beacon mission', 0, 0);
			INSERT INTO turns (id, conversation_id, seq, started_at) VALUES
				('t-crowd', 'beacon-0', 1, 1), ('t-mission', 'beacon-mission', 1, 1);
			INSERT INTO messages (id, conversation_id, turn_id, author_bot_id, seq, role, content,
				completion_state, created_at) VALUES
				{},
				('m-mission', 'beacon-mission', 't-mission', NULL, 1, 'user',
					'A long note on the harbour, the tides, the boats, the keepers and the beacon',
					'complete', 1);",
			rooms.join(", "),
			said.join(", ")
		);
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call_mut(move |connection| Ok(connection.execute_batch(&batch)?))
			.await
			.expect("the crowd is planted");
	}

	fn asking(operation: &str) -> Value {
		json!({ "subtype": "companion", "operation": operation })
	}

	fn a_create(extra: Value) -> Value {
		let mut payload = json!({
			"name": "Quill",
			"job": "a writing partner",
			"description": "Help me draft, tighten and polish what I write."
		});
		if let (Some(payload), Some(extra)) = (payload.as_object_mut(), extra.as_object()) {
			payload.extend(extra.clone());
		}
		json!({ "subtype": "companion", "operation": "create", "payload": payload })
	}

	fn refusal(answer: HostAnswer) -> Value {
		answer.expect_err("the operation is refused")
	}

	async fn worn(app: &App<MockRuntime>) -> Vec<StoredBot> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.conversations()
			.bots(Some("personal".to_owned()))
			.await
			.expect("the roster reads")
	}

	async fn roster_of(app: &App<MockRuntime>, space_id: &str) -> Vec<String> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.conversations()
			.bots(Some(space_id.to_owned()))
			.await
			.expect("the roster reads")
			.into_iter()
			.map(|bot| bot.id)
			.collect()
	}

	async fn is_first_run_done(app: &App<MockRuntime>) -> bool {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.user()
			.preferences()
			.await
			.expect("the preferences read")
			.first_run_done
	}

	fn heard(app: &App<MockRuntime>, event: &str) -> mpsc::Receiver<String> {
		let (announced, arriving) = mpsc::channel();
		app.listen(event, move |event| {
			announced.send(event.payload().to_owned()).expect("the test is listening");
		});
		arriving
	}

	fn announced(arriving: &mpsc::Receiver<String>) -> Value {
		let payload = arriving.recv_timeout(PATIENCE).expect("the event is announced");
		serde_json::from_str(&payload).expect("the event is JSON")
	}

	#[tokio::test]
	async fn suggestions_answer_what_the_screen_offers_entry_for_entry_in_the_same_order() {
		let app = a_host("suggestions").await;

		let answered =
			serving(&app, "c1").answer(asking("suggestions")).await.expect("they are answered");

		assert_eq!(
			answered,
			serde_json::to_value(conversation_suggested_bots()).expect("the list serialises")
		);
	}

	#[tokio::test]
	async fn a_created_companion_lands_in_the_space_of_the_conversation_drafted_like_the_screen() {
		let app = a_host("created").await;

		let created = serving(&app, "c1").answer(a_create(json!({}))).await.expect("it is created");

		assert_eq!(created["name"], json!("Quill"));
		let id = created["id"].as_str().expect("the companion is named");
		let planted =
			worn(&app).await.into_iter().find(|bot| bot.id == id).expect("it joined the space");
		assert_eq!(planted.title, "a writing partner");
		assert_eq!(planted.instructions, "Help me draft, tighten and polish what I write.");
		assert_eq!(planted.model, DEFAULT_BOT_MODEL);
		assert_eq!(planted.permissions, Some(bundles::BotPermissions::default().accepted()));
		assert!(planted.avatar_blot.is_some());
		let bundled = bundles::root(app.handle())
			.and_then(|root| bundles::generated(&root, id))
			.expect("the bundle is written");
		assert_eq!(bundled.output_style, bundles::DEFAULT_OUTPUT_STYLE);
	}

	#[tokio::test]
	async fn a_companion_created_from_a_shared_space_that_is_not_the_first_lands_only_there() {
		let app = a_host("shared").await;
		planted(&app, A_SHARED_SPACE).await;

		let created =
			serving(&app, "shared-chat").answer(a_create(json!({}))).await.expect("it is created");

		let id = created["id"].as_str().expect("the companion is named");
		assert!(roster_of(&app, "shared").await.contains(&id.to_owned()), "missing from its space");
		assert!(!roster_of(&app, "personal").await.contains(&id.to_owned()), "leaked elsewhere");
	}

	#[tokio::test]
	async fn a_name_blank_once_trimmed_is_refused_and_nothing_is_created() {
		let app = a_host("nameless").await;

		let refused = refusal(serving(&app, "c1").answer(a_create(json!({ "name": "   " }))).await);

		assert_eq!(refused["kind"], json!("namelessCompanion"));
		assert_eq!(worn(&app).await.len(), 1);
	}

	#[tokio::test]
	async fn a_conversation_belonging_to_no_space_is_refused_and_nothing_is_created() {
		let app = a_host("spaceless").await;

		let refused = refusal(serving(&app, "nowhere").answer(a_create(json!({}))).await);

		assert_eq!(refused["kind"], json!("conversationWithoutSpace"));
		assert_eq!(refused["conversationId"], json!("nowhere"));
		assert_eq!(worn(&app).await.len(), 1);
	}

	#[tokio::test]
	async fn a_field_the_operation_does_not_declare_is_named_and_nothing_is_created() {
		let app = a_host("undeclared").await;

		let refused =
			refusal(serving(&app, "c1").answer(a_create(json!({ "spaceId": "work" }))).await);

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("spaceId")),
			"got {refused}"
		);
		assert_eq!(worn(&app).await.len(), 1);
	}

	#[tokio::test]
	async fn creating_a_companion_announces_the_id_it_created() {
		let app = a_host("announced").await;
		let arriving = heard(&app, COMPANION_CREATED.name());

		let created = serving(&app, "c1").answer(a_create(json!({}))).await.expect("it is created");

		assert_eq!(announced(&arriving)["id"], created["id"]);
	}

	#[tokio::test]
	async fn the_first_run_is_recorded_under_the_setting_the_app_reads_and_announced() {
		let app = a_host("first-run").await;
		let arriving = heard(&app, FIRST_RUN_DONE.name());
		assert!(!is_first_run_done(&app).await);

		serving(&app, "c1").answer(asking("firstRunDone")).await.expect("it is recorded");

		assert!(is_first_run_done(&app).await);
		assert_eq!(announced(&arriving), Value::Null);
	}

	#[tokio::test]
	async fn a_first_run_already_recorded_is_answered_again_and_stays_recorded() {
		let app = a_host("first-run-twice").await;
		let host = serving(&app, "c1");
		host.answer(asking("firstRunDone")).await.expect("it is recorded");

		let again = host.answer(asking("firstRunDone")).await.expect("it is answered again");

		assert_eq!(again, Value::Null);
		assert!(is_first_run_done(&app).await);
	}

	#[tokio::test]
	async fn an_opened_room_lands_in_the_space_of_the_caller_led_by_it_and_is_announced_once() {
		let app = a_room("open").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let before = written(&app).await;

		let opened = serving(&app, "c1")
			.answer(an_open(
				json!({ "title": " Trip ", "icon": "Rocket", "with": ["  aDA ", "b3"], "message": " Hi " }),
			))
			.await
			.expect("it is opened");

		let id = opened["conversationId"].as_str().expect("the room is named").to_owned();
		assert_eq!(
			opened,
			json!({
				"conversationId": id,
				"kind": "topic",
				"title": "Trip",
				"icon": "Rocket",
				"colour": null,
				"companions": [
					{ "id": "b1", "name": "Shoto" },
					{ "id": "b2", "name": "Ada" },
					{ "id": "b3", "name": "Rex" }
				],
				"lastMessage": null,
				"archived": false
			})
		);
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		assert_eq!(
			database.conversations().space(id.clone()).await.expect("the space reads"),
			Some("personal".to_owned())
		);
		assert_eq!(
			database.conversations().kind(id.clone()).await.expect("the kind reads"),
			Some(TOPIC_KIND.to_owned())
		);
		assert_eq!(
			roles_in(&app, &id).await,
			vec![
				("b1".to_owned(), "lead".to_owned()),
				("b2".to_owned(), "assistant".to_owned()),
				("b3".to_owned(), "assistant".to_owned()),
			]
		);
		assert_eq!(
			announced(&arriving),
			json!({ "conversationId": id, "authorBotId": "b1", "text": "Hi" })
		);
		assert!(arriving.try_recv().is_err(), "announced twice");
		assert_eq!(written(&app).await, (before.0 + 1, before.1, before.2));
		assert_eq!(standing(&app).await.1, 0);
	}

	#[tokio::test]
	async fn a_companion_named_twice_or_the_caller_named_is_seated_once_and_the_lead_stays() {
		let app = a_room("open-twice").await;

		let opened = serving(&app, "c1")
			.answer(an_open(json!({
				"title": "Trip",
				"icon": "Rocket",
				"with": ["b2", "ada", "SHOTO", "b1"],
				"message": "Hi"
			})))
			.await
			.expect("it is opened");

		let id = opened["conversationId"].as_str().expect("the room is named");
		assert_eq!(
			roles_in(&app, id).await,
			vec![("b1".to_owned(), "lead".to_owned()), ("b2".to_owned(), "assistant".to_owned())]
		);
	}

	#[tokio::test]
	async fn a_room_opened_with_nobody_holds_the_caller_alone_as_lead() {
		let app = a_room("open-alone").await;

		let opened = serving(&app, "c1")
			.answer(an_open(
				json!({ "title": "Trip", "icon": "Rocket", "with": [], "message": "Hi" }),
			))
			.await
			.expect("it is opened");

		assert_eq!(opened["companions"], json!([{ "id": "b1", "name": "Shoto" }]));
		let id = opened["conversationId"].as_str().expect("the room is named");
		assert_eq!(roles_in(&app, id).await, vec![("b1".to_owned(), "lead".to_owned())]);
	}

	#[tokio::test]
	async fn a_room_naming_a_companion_outside_the_space_or_worn_twice_opens_nowhere() {
		let app = a_room("open-unknown").await;

		for companion in ["b5", "Kai", "Nobody"] {
			let refused = open_refused(
				&app,
				"c1",
				json!({ "title": "Trip", "icon": "Rocket", "with": ["b2", companion], "message": "Hi" }),
			)
			.await;

			assert_eq!(refused, json!({ "kind": "unknownCompanion", "companion": companion }));
		}
		let refused = open_refused(
			&app,
			"c1",
			json!({ "title": "Trip", "icon": "Rocket", "with": ["rex"], "message": "Hi" }),
		)
		.await;
		assert_eq!(refused["kind"], json!("ambiguousCompanion"));
	}

	#[tokio::test]
	async fn a_blank_title_or_message_is_refused_by_name_and_opens_nothing() {
		let app = a_room("open-blank").await;

		let title = open_refused(
			&app,
			"c1",
			json!({ "title": "  ", "icon": "Rocket", "with": [], "message": "Hi" }),
		)
		.await;
		let message = open_refused(
			&app,
			"c1",
			json!({ "title": "Trip", "icon": "Rocket", "with": [], "message": " " }),
		)
		.await;

		assert_eq!(title, json!({ "kind": "emptyTitleField" }));
		assert_eq!(message, json!({ "kind": "emptyMessageField" }));
	}

	#[tokio::test]
	async fn a_room_opens_with_its_title_and_its_icon_written_on_its_row() {
		let app = a_room("open-icon").await;

		let opened = serving(&app, "c1")
			.answer(an_open(
				json!({ "title": "Trip", "icon": "Rocket", "with": [], "message": "Hi" }),
			))
			.await
			.expect("it is opened");

		let id = opened["conversationId"].as_str().expect("the room is named").to_owned();
		let row: (String, Option<String>) = ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT title, icon FROM conversations WHERE id = ?1",
					[id],
					|row| Ok((row.get(0)?, row.get(1)?)),
				)?)
			})
			.await
			.expect("the row reads");
		assert_eq!(row, ("Trip".to_owned(), Some("Rocket".to_owned())));
	}

	#[tokio::test]
	async fn a_room_opened_with_an_icon_off_the_list_is_refused_naming_the_list_and_opens_nothing()
	{
		let app = a_room("open-unlisted").await;

		let refused = open_refused(
			&app,
			"c1",
			json!({ "title": "Trip", "icon": "Message", "with": ["b2"], "message": "Hi" }),
		)
		.await;

		assert_eq!(
			refused,
			json!({ "kind": "unlistedIcon", "icon": "Message", "accepted": conversation_icons() })
		);
	}

	#[tokio::test]
	async fn a_room_opened_without_an_icon_is_refused_naming_it_and_opens_nothing() {
		let app = a_room("open-iconless").await;

		let refused =
			open_refused(&app, "c1", json!({ "title": "Trip", "with": [], "message": "Hi" })).await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("icon")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn a_room_opened_from_a_conversation_belonging_to_no_space_is_refused() {
		let app = a_room("open-spaceless").await;

		let refused = open_refused(
			&app,
			"nowhere",
			json!({ "title": "Trip", "icon": "Rocket", "with": [], "message": "Hi" }),
		)
		.await;

		assert_eq!(
			refused,
			json!({ "kind": "conversationWithoutSpace", "conversationId": "nowhere" })
		);
	}

	#[tokio::test]
	async fn an_opening_carrying_a_field_it_does_not_declare_is_refused_naming_it() {
		let app = a_room("open-undeclared").await;

		let refused = open_refused(
			&app,
			"c1",
			json!({ "title": "Trip", "icon": "Rocket", "with": [], "message": "Hi", "spaceId": "work" }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("spaceId")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn a_word_spoken_in_a_room_the_caller_sits_in_is_announced_once_and_writes_nothing() {
		let app = a_room("say").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let before = (written(&app).await, standing(&app).await);

		let said = serving(&app, "c1")
			.answer(a_say(json!({ "conversation": "room", "message": " Hi " })))
			.await
			.expect("it is said");

		assert_eq!(said, a_plans_room());
		assert_eq!(
			announced(&arriving),
			json!({ "conversationId": "room", "authorBotId": "b1", "text": "Hi" })
		);
		assert!(arriving.try_recv().is_err(), "announced twice");
		assert_eq!((written(&app).await, standing(&app).await), before);
	}

	#[tokio::test]
	async fn a_word_spoken_in_the_room_the_session_runs_in_is_announced_there() {
		let app = a_room("say-here").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);

		let said = serving(&app, "room")
			.answer(a_say(json!({ "conversation": "room", "message": "Hi" })))
			.await
			.expect("it is said");

		assert_eq!(said, a_plans_room());
		assert_eq!(announced(&arriving)["conversationId"], json!("room"));
	}

	const TWO_ERRANDS: &str = "
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at) VALUES
			('running', 'mission', 'personal', 'Ship it', 1, 1),
			('shipped', 'mission', 'personal', 'Shipped', 1, 1);
		INSERT INTO conversation_participants (conversation_id, bot_id, role, joined_at, join_seq)
			VALUES ('running', 'b1', 'assistant', 1, 0), ('shipped', 'b1', 'assistant', 1, 0);
		INSERT INTO missions (id, origin_conversation_id, bot_id, thread_conversation_id,
			objective, ticket_platform, ticket_external_id, ticket_url, ticket_title, opened_at,
			closed_at) VALUES
			('m1', 'c1', 'b1', 'running', 'Ship it', 'github', '1', 'https://kiroshi.test/1',
				'Ship', 1, NULL),
			('m2', 'c1', 'b1', 'shipped', 'Shipped', 'github', '2', 'https://kiroshi.test/2',
				'Shipped', 1, 2);
	";

	fn a_close(conversation_id: &str) -> Value {
		json!({
			"subtype": "companion",
			"operation": "conversationClose",
			"payload": { "conversation": conversation_id },
		})
	}

	async fn archived_at(app: &App<MockRuntime>, conversation_id: &'static str) -> Option<i64> {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT archived_at FROM conversations WHERE id = ?1",
					[conversation_id],
					|row| row.get(0),
				)?)
			})
			.await
			.expect("the archive reads")
	}

	async fn close_refused(app: &App<MockRuntime>, conversation_id: &'static str) -> Value {
		let deleting = heard(app, crate::conversations::contract::DELETED_EVENT);
		let refused = refusal(serving(app, "c1").answer(a_close(conversation_id)).await);
		assert_eq!(archived_at(app, conversation_id).await, None, "a refused close archived");
		assert!(deleting.try_recv().is_err(), "a refused close announced");
		refused
	}

	#[tokio::test]
	async fn the_lead_closes_a_room_once_and_it_leaves_the_roster_on_the_spot() {
		let app = a_room("close-led").await;
		let deleting = heard(&app, crate::conversations::contract::DELETED_EVENT);

		let closed = serving(&app, "c1").answer(a_close("room")).await.expect("the room closes");
		let announced_room = announced(&deleting);
		let first_archived_at = archived_at(&app, "room").await;
		let closed_again =
			serving(&app, "c1").answer(a_close("room")).await.expect("the room closes again");

		let answer = json!({ "conversationId": "room", "title": "Plans", "archived": true });
		assert_eq!(closed, answer);
		assert_eq!(closed_again, answer);
		assert_eq!(announced_room, json!({ "spaceId": "personal", "conversationId": "room" }));
		assert!(first_archived_at.is_some(), "the close wrote no archived_at");
		assert_eq!(archived_at(&app, "room").await, first_archived_at, "a second close moved it");
		assert_eq!(roles_in(&app, "room").await.len(), 2, "a seat went with the close");
	}

	#[tokio::test]
	async fn a_close_of_a_main_chat_an_unled_room_or_an_unknown_id_is_refused_and_archives_nothing()
	{
		let app = a_room("close-refused").await;

		let main = close_refused(&app, "c1").await;
		let unled = close_refused(&app, "unled").await;
		let unknown = refusal(serving(&app, "c1").answer(a_close("absent")).await);

		assert_eq!(
			main,
			json!({
				"kind": "unclosableConversation",
				"conversationId": "c1",
				"conversationKind": "main",
			})
		);
		assert_eq!(unled, json!({ "kind": "callerNotLead", "conversationId": "unled" }));
		assert_eq!(unknown, json!({ "kind": "unknownConversation", "conversationId": "absent" }));
	}

	#[tokio::test]
	async fn a_mission_thread_closes_once_its_mission_has_closed_and_never_before() {
		let app = a_room("close-mission").await;
		planted(&app, TWO_ERRANDS).await;

		let deleting = heard(&app, crate::conversations::contract::DELETED_EVENT);

		let running = refusal(serving(&app, "c1").answer(a_close("running")).await);
		let running_announced = deleting.try_recv().is_ok();
		let shipped =
			serving(&app, "c1").answer(a_close("shipped")).await.expect("the thread closes");

		assert_eq!(
			running,
			json!({ "kind": "missionStillOpen", "conversationId": "running", "missionId": "m1" })
		);
		assert_eq!(
			shipped,
			json!({ "conversationId": "shipped", "title": "Shipped", "archived": true })
		);
		assert!(!running_announced, "a refused close announced");
		assert_eq!(archived_at(&app, "running").await, None, "a refused close archived");
		assert_eq!(announced(&deleting)["conversationId"], json!("shipped"));
		assert!(archived_at(&app, "shipped").await.is_some(), "the closed thread stayed open");
	}

	#[tokio::test]
	async fn a_seat_the_caller_has_left_carries_no_word_even_where_its_session_runs() {
		let app = a_room("say-left").await;
		planted(&app, ANOTHER_ROOM).await;

		let refused = say_refused(
			&app,
			&serving(&app, "unled"),
			json!({ "conversation": "unled", "message": "Hi" }),
		)
		.await;

		assert_eq!(refused, json!({ "kind": "callerNotSeated", "conversationId": "unled" }));
	}

	#[tokio::test]
	async fn a_caller_holding_no_seat_at_all_carries_no_word() {
		let app = a_room("say-unseated").await;
		let stranger = CompanionHost::new(
			app.handle().clone(),
			"c1".to_owned(),
			"b2".to_owned(),
			Arc::default(),
		);

		let refused =
			say_refused(&app, &stranger, json!({ "conversation": "unled", "message": "Hi" })).await;

		assert_eq!(refused, json!({ "kind": "callerNotSeated", "conversationId": "unled" }));
	}

	#[tokio::test]
	async fn a_conversation_that_carries_no_seats_takes_no_word_and_is_refused_with_its_kind() {
		let app = a_room("say-seatless").await;
		planted(&app, A_MISSION).await;

		for (conversation, kind) in [("c1", "main"), ("errand", "mission")] {
			let refused = say_refused(
				&app,
				&serving(&app, "room"),
				json!({ "conversation": conversation, "message": "Hi" }),
			)
			.await;

			assert_eq!(
				refused,
				json!({
					"kind": "conversationWithoutSeats",
					"conversationId": conversation,
					"conversationKind": kind
				})
			);
		}
	}

	#[tokio::test]
	async fn an_id_matching_no_conversation_takes_no_word() {
		let app = a_room("say-nowhere").await;

		let refused = say_refused(
			&app,
			&serving(&app, "room"),
			json!({ "conversation": "ghost", "message": "Hi" }),
		)
		.await;

		assert_eq!(
			refused,
			json!({ "kind": "conversationWithoutSpace", "conversationId": "ghost" })
		);
	}

	#[tokio::test]
	async fn a_message_blank_once_trimmed_is_refused_before_any_conversation_is_read() {
		let app = a_room("say-blank").await;

		let refused = say_refused(
			&app,
			&serving(&app, "room"),
			json!({ "conversation": "ghost", "message": " \n " }),
		)
		.await;

		assert_eq!(refused, json!({ "kind": "emptyMessageField" }));
	}

	#[tokio::test]
	async fn a_word_carrying_a_field_the_operation_does_not_declare_is_refused_naming_it() {
		let app = a_room("say-undeclared").await;

		let refused = say_refused(
			&app,
			&serving(&app, "room"),
			json!({ "conversation": "room", "message": "Hi", "conversationId": "room" }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("conversationId")),
			"got {refused}"
		);
	}

	fn an_attach(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationAttach", "payload": payload })
	}

	fn an_image(app: &App<MockRuntime>, name: &str, size: usize) -> String {
		let dir = app.path().app_data_dir().expect("the app data dir").join("outside");
		fs::create_dir_all(&dir).expect("the source dir");
		let path = dir.join(name);
		fs::write(&path, vec![7u8; size]).expect("the source image");
		path.to_string_lossy().into_owned()
	}

	fn stored_files(app: &App<MockRuntime>) -> Vec<PathBuf> {
		let root = Attachments::dir(app.handle()).expect("the attachments root");
		let Ok(conversations) = fs::read_dir(&root) else {
			return Vec::new();
		};
		conversations
			.flatten()
			.flat_map(|conversation| fs::read_dir(conversation.path()).expect("a conversation dir"))
			.flatten()
			.map(|file| file.path())
			.collect()
	}

	async fn attach_refused(
		app: &App<MockRuntime>,
		host: &CompanionHost<MockRuntime>,
		payload: Value,
	) -> Value {
		let arriving = heard(app, COMPANION_SPOKE_EVENT);
		let before = written(app).await;
		let refused = refusal(host.answer(an_attach(payload)).await);
		assert_eq!(stored_files(app), Vec::<PathBuf>::new(), "a refused attach stored a file");
		assert_eq!(written(app).await, before, "a refused attach wrote a row");
		assert!(arriving.try_recv().is_err(), "a refusal announced");
		assert!(host.attachments.take().is_empty(), "a refused attach was held for the turn");
		refused
	}

	#[tokio::test]
	async fn an_image_attached_here_is_copied_under_this_conversation_and_held_for_the_turn() {
		let app = a_host("attach-here").await;
		let host = serving(&app, "c1");
		let source = an_image(&app, "chart.PNG", 3);

		let answered = host
			.answer(an_attach(json!({ "path": source, "caption": " The chart " })))
			.await
			.expect("it is attached");

		let stored = stored_files(&app);
		assert_eq!(stored.len(), 1);
		let root = Attachments::dir(app.handle()).expect("the attachments root");
		assert_eq!(stored[0].parent(), Some(root.join("c1").as_path()));
		assert_eq!(stored[0].extension().and_then(|it| it.to_str()), Some("png"));
		assert_eq!(fs::read(&stored[0]).expect("the copy reads"), vec![7u8; 3]);
		assert_eq!(
			answered,
			json!({ "path": stored[0].to_string_lossy(), "conversationId": "c1" })
		);
		let held = host.attachments.take();
		assert_eq!(held.len(), 1);
		assert_eq!(held[0].path, stored[0]);
		assert_eq!(held[0].caption.as_deref(), Some("The chart"));
	}

	#[tokio::test]
	async fn an_image_attached_in_a_room_posts_its_caption_then_its_block_there() {
		let app = a_room("attach-room").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let host = serving(&app, "c1");
		let source = an_image(&app, "chart.png", 3);

		let answered = host
			.answer(an_attach(json!({
				"path": source,
				"caption": "The chart",
				"conversation": "room"
			})))
			.await
			.expect("it is attached");

		let stored = stored_files(&app);
		assert_eq!(stored.len(), 1);
		let root = Attachments::dir(app.handle()).expect("the attachments root");
		assert_eq!(stored[0].parent(), Some(root.join("room").as_path()));
		let path = stored[0].to_string_lossy().into_owned();
		assert_eq!(answered, json!({ "path": path, "conversationId": "room" }));
		let spoken = announced(&arriving);
		assert_eq!(spoken["conversationId"], json!("room"));
		assert_eq!(spoken["authorBotId"], json!("b1"));
		let text = spoken["text"].as_str().expect("the text");
		let lines: Vec<&str> = text.lines().collect();
		assert_eq!(lines.len(), 3, "{text}");
		assert_eq!(lines[0], "The chart");
		assert!(lines[1].starts_with("Attached to this message, sent "), "{text}");
		assert!(lines[1].ends_with(", 1 file:"), "{text}");
		assert_eq!(lines[2], format!("1/1 {path}"));
		assert!(host.attachments.take().is_empty(), "a room post was held for this turn");
	}

	#[tokio::test]
	async fn a_file_of_any_extension_is_attached_here_or_in_a_room_with_its_extension_kept() {
		let app = a_room("attach-any").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let host = serving(&app, "c1");
		let log = an_image(&app, "run.LOG", 3);
		let bare = an_image(&app, "Makefile", 2);

		host.answer(an_attach(json!({ "path": log }))).await.expect("the log is attached here");
		let in_room = host
			.answer(an_attach(json!({ "path": bare, "conversation": "room" })))
			.await
			.expect("the bare file is attached in the room");

		let root = Attachments::dir(app.handle()).expect("the attachments root");
		let held = host.attachments.take();
		assert_eq!(held.len(), 1);
		assert_eq!(held[0].path.parent(), Some(root.join("c1").as_path()));
		assert_eq!(held[0].path.extension().and_then(|it| it.to_str()), Some("log"));
		assert_eq!(fs::read(&held[0].path).expect("the copy reads"), vec![7u8; 3]);
		let path = in_room["path"].as_str().expect("the stored path").to_owned();
		let stored = PathBuf::from(&path);
		assert_eq!(stored.parent(), Some(root.join("room").as_path()));
		assert_eq!(stored.extension(), None);
		assert_eq!(fs::read(&stored).expect("the copy reads"), vec![7u8; 2]);
		let spoken = announced(&arriving);
		let text = spoken["text"].as_str().expect("the text");
		assert_eq!(text.lines().last(), Some(format!("1/1 {path}").as_str()), "{text}");
	}

	#[tokio::test]
	async fn a_missing_file_or_a_directory_is_refused_naming_it() {
		let app = a_room("attach-unreadable").await;
		let host = serving(&app, "c1");
		let text = an_image(&app, "notes.txt", 3);
		let folder = an_image(&app, "album.png", 0);
		fs::remove_file(&folder).expect("the placeholder goes");
		fs::create_dir(&folder).expect("the folder lands");
		let missing = format!("{text}.png");

		for path in [missing, folder] {
			let refused = attach_refused(&app, &host, json!({ "path": path })).await;
			assert_eq!(refused["kind"], json!("unreadableFile"));
			assert_eq!(refused["path"], json!(path));
		}
	}

	#[tokio::test]
	async fn a_file_over_the_limit_is_refused_naming_its_size_and_the_limit() {
		let app = a_host("attach-large").await;
		let host = serving(&app, "c1");
		let source = an_image(&app, "huge.png", 10 * 1024 * 1024 + 1);

		let refused = attach_refused(&app, &host, json!({ "path": source })).await;

		assert_eq!(
			refused,
			json!({
				"kind": "attachmentRefused",
				"refusal": {
					"kind": "tooLarge",
					"name": source,
					"bytes": 10 * 1024 * 1024 + 1,
					"limit": 10 * 1024 * 1024
				}
			})
		);
	}

	#[tokio::test]
	async fn a_block_past_its_count_or_its_total_refuses_the_attach_that_overflows_it() {
		let app = a_host("attach-block").await;
		let host = serving(&app, "c1");
		let small = an_image(&app, "small.png", 1);
		for _ in 0..20 {
			host.answer(an_attach(json!({ "path": small }))).await.expect("it is attached");
		}
		let held_before = stored_files(&app);

		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let refused = refusal(host.answer(an_attach(json!({ "path": small }))).await);

		assert_eq!(
			refused,
			json!({ "kind": "attachmentRefused", "refusal": { "kind": "tooMany", "count": 21, "limit": 20 } })
		);
		assert_eq!(stored_files(&app).len(), held_before.len(), "the refused file was stored");
		assert!(arriving.try_recv().is_err());
		assert_eq!(host.attachments.take().len(), 20);

		let big = an_image(&app, "big.png", 9 * 1024 * 1024);
		let fresh = serving(&app, "c1");
		for _ in 0..3 {
			fresh.answer(an_attach(json!({ "path": big }))).await.expect("it is attached");
		}
		let overflowing = refusal(fresh.answer(an_attach(json!({ "path": big }))).await);
		assert_eq!(overflowing["refusal"]["kind"], json!("tooLargeTogether"));
		assert_eq!(overflowing["refusal"]["bytes"], json!(36 * 1024 * 1024));
		assert_eq!(overflowing["refusal"]["limit"], json!(30 * 1024 * 1024));
		assert_eq!(fresh.attachments.take().len(), 3);
	}

	#[tokio::test]
	async fn an_attach_into_a_room_the_caller_holds_no_seat_in_is_refused_and_stores_nothing() {
		let app = a_room("attach-unseated").await;
		planted(&app, A_MISSION).await;
		planted(&app, ANOTHER_ROOM).await;
		let source = an_image(&app, "chart.png", 3);

		let unseated = attach_refused(
			&app,
			&serving(&app, "c1"),
			json!({ "path": source, "conversation": "unled" }),
		)
		.await;
		let seatless = attach_refused(
			&app,
			&serving(&app, "c1"),
			json!({ "path": source, "conversation": "errand" }),
		)
		.await;

		assert_eq!(unseated["kind"], json!("callerNotSeated"));
		assert_eq!(seatless["kind"], json!("conversationWithoutSeats"));
	}

	fn a_plans_room() -> Value {
		json!({
			"conversationId": "room",
			"kind": "topic",
			"title": "Plans",
			"icon": null,
			"colour": null,
			"companions": [{ "id": "b1", "name": "Shoto" }, { "id": "b2", "name": "Ada" }],
			"lastMessage": null,
			"archived": false
		})
	}

	const A_HISTORY: &str = "
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at, archived_at)
			VALUES ('shelved', 'topic', 'personal', 'Old plans', 5, 5, 6);
		INSERT INTO conversation_participants
			(conversation_id, bot_id, role, joined_at, join_seq, left_at)
			VALUES ('shelved', 'b2', 'lead', 5, 0, NULL), ('room', 'b5', 'assistant', 25, 2, 35);
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES
			('t-room', 'room', 1, 10), ('t-unled', 'unled', 1, 40),
			('t-errand', 'errand', 1, 15), ('t-studio', 'studio', 1, 50);
		INSERT INTO messages (id, conversation_id, turn_id, seq, role, content, completion_state,
			created_at, author_bot_id, author_account_id, author_name) VALUES
			('m1', 'room', 't-room', 1, 'user', 'Where to?', 'complete', 10, NULL, 'u1', 'Alex'),
			('m2', 'room', 't-room', 2, 'assistant', 'Lisbon', 'complete', 20, 'b2', NULL, NULL),
			('m3', 'room', 't-room', 3, 'user', 'From afar', 'complete', 30, 'b5', NULL, NULL),
			('m4', 'unled', 't-unled', 1, 'assistant', printf('%.250c', 'x'), 'complete', 40,
				'b1', NULL, NULL),
			('m5', 'errand', 't-errand', 1, 'assistant', 'Shipped', 'complete', 15, 'b1', NULL,
				NULL),
			('m6', 'studio', 't-studio', 1, 'assistant', 'Elsewhere', 'complete', 50, 'b1', NULL,
				NULL);
	";

	const MANY_ROOMS: &str = "
		WITH RECURSIVE counted(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counted WHERE n < 60)
		INSERT INTO conversations (id, kind, space_id, title, created_at, updated_at)
			SELECT printf('many-%02d', n), 'topic', 'personal', 'Many', 100 + n, 100 + n
			FROM counted;
		INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t-many', 'room', 9, 1);
		WITH RECURSIVE counted(n) AS (SELECT 1 UNION ALL SELECT n + 1 FROM counted WHERE n < 25)
		INSERT INTO messages (id, conversation_id, turn_id, seq, role, content, completion_state,
			created_at)
			SELECT printf('many-%02d', n), 'room', 't-many', 10 + n, 'user', 'Hi', 'complete', n
			FROM counted;
	";

	async fn a_history(name: &str) -> AppOfItsOwn {
		let app = a_room(name).await;
		planted(&app, A_MISSION).await;
		planted(&app, ANOTHER_ROOM).await;
		planted(&app, A_HISTORY).await;
		app
	}

	fn a_list(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationList", "payload": payload })
	}

	fn a_read(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationRead", "payload": payload })
	}

	async fn listed(app: &App<MockRuntime>, payload: Value) -> Value {
		serving(app, "c1").answer(a_list(payload)).await.expect("it is listed")
	}

	async fn read_back(app: &App<MockRuntime>, payload: Value) -> Value {
		serving(app, "c1").answer(a_read(payload)).await.expect("it is read")
	}

	fn ids_of(answer: &Value) -> Vec<String> {
		answer["conversations"]
			.as_array()
			.expect("the conversations are listed")
			.iter()
			.map(|listed| listed["conversationId"].as_str().expect("the id is named").to_owned())
			.collect()
	}

	#[tokio::test]
	async fn the_list_holds_only_the_seats_the_caller_has_not_left_latest_activity_first() {
		let app = a_history("list-seated").await;

		let seated = listed(&app, json!({})).await;
		let not_everywhere = listed(&app, json!({ "everywhere": false })).await;

		assert_eq!(ids_of(&seated), vec!["room", "errand", "c1"]);
		assert_eq!(not_everywhere, seated);
		assert_eq!(seated["cursor"], Value::Null);
	}

	#[tokio::test]
	async fn the_list_everywhere_holds_every_conversation_of_the_space_and_none_of_another() {
		let app = a_history("list-everywhere").await;

		let everywhere = listed(&app, json!({ "everywhere": true })).await;

		assert_eq!(ids_of(&everywhere), vec!["unled", "room", "errand", "shelved", "c1"]);
	}

	#[tokio::test]
	async fn a_listed_conversation_wears_its_kind_its_seats_its_last_message_and_its_archive() {
		let app = a_history("list-shape").await;

		let everywhere = listed(&app, json!({ "everywhere": true })).await;
		let rows = everywhere["conversations"].as_array().expect("the conversations are listed");

		assert_eq!(
			rows[0],
			json!({
				"conversationId": "unled",
				"kind": "topic",
				"title": "Plans",
				"icon": null,
				"colour": null,
				"companions": [],
				"lastMessage": { "author": "Shoto", "text": "x".repeat(200), "time": 40 },
				"archived": false
			})
		);
		assert_eq!(
			rows[1]["lastMessage"],
			json!({ "author": "Kai", "text": "From afar", "time": 30 })
		);
		assert_eq!(rows[1]["companions"], a_plans_room()["companions"]);
		assert_eq!(rows[2]["kind"], json!("mission"));
		assert_eq!(rows[3]["archived"], json!(true));
		assert_eq!(rows[3]["companions"], json!([{ "id": "b2", "name": "Ada" }]));
		assert_eq!(rows[4]["kind"], json!("main"));
		assert_eq!(rows[4]["lastMessage"], Value::Null);
	}

	#[tokio::test]
	async fn the_list_keeps_only_the_kind_it_names_and_refuses_any_other_naming_the_three() {
		let app = a_history("list-kind").await;

		let kinds = [
			("main", vec!["c1"]),
			("topic", vec!["unled", "room", "shelved"]),
			("mission", vec!["errand"]),
		];
		for (kind, ids) in kinds {
			let answer = listed(&app, json!({ "everywhere": true, "kind": kind })).await;
			assert_eq!(ids_of(&answer), ids, "{kind}");
		}
		let refused = refusal(serving(&app, "c1").answer(a_list(json!({ "kind": "chat" }))).await);

		assert_eq!(
			refused,
			json!({
				"kind": "unknownConversationKind",
				"conversationKind": "chat",
				"accepted": ["main", "topic", "mission"]
			})
		);
	}

	#[tokio::test]
	async fn the_list_walks_its_pages_to_a_null_cursor_and_refuses_a_cursor_that_does_not_decode() {
		let app = a_history("list-walk").await;
		let mut cursor = Value::Null;
		let mut pages = Vec::new();

		loop {
			let mut payload = json!({ "everywhere": true, "limit": 2 });
			if !cursor.is_null() {
				payload["cursor"] = cursor;
			}
			let page = listed(&app, payload).await;
			pages.push(ids_of(&page));
			cursor = page["cursor"].clone();
			if cursor.is_null() {
				break;
			}
		}
		let refused =
			refusal(serving(&app, "c1").answer(a_list(json!({ "cursor": "not a cursor" }))).await);

		assert_eq!(pages, vec![vec!["unled", "room"], vec!["errand", "shelved"], vec!["c1"]]);
		assert_eq!(refused, json!({ "kind": "unreadableCursor", "cursor": "not a cursor" }));
	}

	#[tokio::test]
	async fn a_limit_left_out_reads_its_default_and_one_past_its_bounds_is_refused_naming_them() {
		let app = a_history("list-limit").await;
		planted(&app, MANY_ROOMS).await;

		let defaulted = listed(&app, json!({ "everywhere": true })).await;
		let widest = listed(&app, json!({ "everywhere": true, "limit": 200 })).await;
		let read = read_back(&app, json!({ "conversation": "room" })).await;
		let refused = |payload: Value| {
			let host = serving(&app, "c1");
			async move { refusal(host.answer(payload).await) }
		};

		assert_eq!(ids_of(&defaulted).len(), 50);
		assert!(defaulted["cursor"].is_string());
		assert_eq!(ids_of(&widest).len(), 65);
		assert_eq!(widest["cursor"], Value::Null);
		assert_eq!(read["messages"].as_array().expect("the messages are read").len(), 20);
		for (payload, limit, maximum) in [
			(a_list(json!({ "limit": 0 })), 0, 200),
			(a_list(json!({ "limit": 201 })), 201, 200),
			(a_read(json!({ "conversation": "room", "limit": 0 })), 0, 100),
			(a_read(json!({ "conversation": "room", "limit": 101 })), 101, 100),
		] {
			assert_eq!(
				refused(payload).await,
				json!({ "kind": "limitOutOfRange", "limit": limit, "minimum": 1, "maximum": maximum })
			);
		}
	}

	#[tokio::test]
	async fn a_read_answers_the_conversation_and_its_last_messages_newest_last_walking_to_the_first(
	) {
		let app = a_history("read").await;

		let latest = read_back(&app, json!({ "conversation": "room", "limit": 2 })).await;
		let older =
			read_back(&app, json!({ "conversation": "room", "limit": 2, "before": 2 })).await;

		let mut room = a_plans_room();
		room["lastMessage"] = json!({ "author": "Kai", "text": "From afar", "time": 30 });
		assert_eq!(
			latest,
			json!({
				"conversation": room,
				"messages": [
					{
						"seq": 2,
						"author": { "kind": "companion", "id": "b2", "name": "Ada" },
						"time": 20,
						"text": "Lisbon"
					},
					{
						"seq": 3,
						"author": { "kind": "companion", "id": "b5", "name": "Kai" },
						"time": 30,
						"text": "From afar"
					}
				],
				"cursor": 2
			})
		);
		assert_eq!(
			older["messages"],
			json!([{
				"seq": 1,
				"author": { "kind": "person", "id": "u1", "name": "Alex" },
				"time": 10,
				"text": "Where to?"
			}])
		);
		assert_eq!(older["cursor"], Value::Null);
	}

	#[tokio::test]
	async fn a_read_answers_a_conversation_the_caller_left_or_never_sat_in_with_its_full_text() {
		let app = a_history("read-unseated").await;

		let left = read_back(&app, json!({ "conversation": "unled" })).await;
		let never = read_back(&app, json!({ "conversation": "shelved" })).await;

		assert_eq!(left["messages"][0]["text"], json!("x".repeat(250)));
		assert_eq!(never["conversation"]["archived"], json!(true));
		assert_eq!(never["messages"], json!([]));
		assert_eq!(never["cursor"], Value::Null);
	}

	#[tokio::test]
	async fn a_read_of_an_unknown_id_or_of_another_space_is_refused_alike_naming_only_the_id() {
		let app = a_history("read-foreign").await;

		for conversation in ["ghost", "studio", "drifting", "nowhere"] {
			let refused = refusal(
				serving(&app, "c1").answer(a_read(json!({ "conversation": conversation }))).await,
			);
			assert_eq!(
				refused,
				json!({ "kind": "unknownConversation", "conversationId": conversation })
			);
		}
	}

	#[tokio::test]
	async fn a_word_said_in_one_room_is_found_there_by_a_bot_of_its_space_and_by_no_other() {
		let app = a_discussion("search-spaces").await;

		let here = searched_from(&app, "c1", "b1", json!({ "query": "pick lighthouse" })).await;
		let there =
			searched_from(&app, "elsewhere", "b5", json!({ "query": "pick lighthouse" })).await;

		assert_eq!(
			here["messages"],
			json!([{
				"conversationId": "room",
				"conversationTitle": "Plans",
				"messageId": "m-room",
				"author": null,
				"createdAt": 5,
				"snippet": "We should pick the lighthouse for the trip"
			}])
		);
		assert_eq!(there, json!({ "conversations": [], "messages": [] }));
		let studio = searched_from(&app, "elsewhere", "b5", json!({ "query": "harbour" })).await;
		assert_eq!(message_ids(&studio), vec!["m-elsewhere"]);
		assert_eq!(studio["messages"][0]["author"], json!("b5"));
		let rooms = searched_from(&app, "elsewhere", "b5", json!({ "query": "studio" })).await;
		assert_eq!(
			rooms["conversations"],
			json!([{ "id": "elsewhere", "kind": "topic", "title": "Studio", "participants": ["Kai"] }])
		);
		let unseen = searched_from(&app, "c1", "b1", json!({ "query": "studio" })).await;
		assert_eq!(unseen, json!({ "conversations": [], "messages": [] }));
	}

	#[tokio::test]
	async fn a_word_nobody_said_and_no_room_wears_answers_two_empty_lists() {
		let app = a_discussion("search-absent").await;

		let found = searched_from(&app, "c1", "b1", json!({ "query": "zeppelin" })).await;

		assert_eq!(found, json!({ "conversations": [], "messages": [] }));
	}

	#[tokio::test]
	async fn a_kind_drops_every_conversation_and_every_message_of_another_kind() {
		let app = a_discussion("search-kind").await;

		let every = searched_from(&app, "c1", "b1", json!({ "query": "lighthouse" })).await;
		let topics =
			searched_from(&app, "c1", "b1", json!({ "query": "lighthouse", "kind": "topic" }))
				.await;
		let missions =
			searched_from(&app, "c1", "b1", json!({ "query": "lighthouse", "kind": "mission" }))
				.await;
		let plans = searched_from(&app, "c1", "b1", json!({ "query": "plans" })).await;
		let plans_of_missions =
			searched_from(&app, "c1", "b1", json!({ "query": "plans", "kind": "mission" })).await;

		let mut held = message_ids(&every);
		held.sort_unstable();
		assert_eq!(held, vec!["m-c1", "m-errand", "m-room"]);
		assert_eq!(message_ids(&topics), vec!["m-room"]);
		assert_eq!(message_ids(&missions), vec!["m-errand"]);
		assert_eq!(conversation_ids(&plans), vec!["room", "drifting", "unled"]);
		assert_eq!(plans_of_missions, json!({ "conversations": [], "messages": [] }));
	}

	#[tokio::test]
	async fn an_empty_or_overlong_query_is_refused_by_its_kind() {
		let app = a_discussion("search-refused").await;
		let host = serving(&app, "c1");

		let blank = refusal(host.answer(a_search(json!({ "query": "  " }))).await);
		let long = refusal(
			host.answer(a_search(json!({ "query": "a".repeat(MAX_QUERY_CHARS + 1) }))).await,
		);
		let unknown =
			refusal(host.answer(a_search(json!({ "query": "plans", "kind": "dm" }))).await);

		assert_eq!(blank, json!({ "kind": "emptyQueryField" }));
		assert_eq!(long, json!({ "kind": "queryTooLong", "limit": MAX_QUERY_CHARS }));
		assert_eq!(unknown["kind"], json!("unreadableRequest"));
	}

	#[tokio::test]
	async fn a_kind_is_counted_before_the_caps_so_a_crowd_of_another_kind_hides_nothing() {
		let app = a_host("search-kind-caps").await;
		a_crowd_of_beacons(&app).await;

		let every = searched_from(&app, "c1", "b1", json!({ "query": "beacon" })).await;
		let missions =
			searched_from(&app, "c1", "b1", json!({ "query": "beacon", "kind": "mission" })).await;

		assert_eq!(message_ids(&every).len(), MAX_HITS as usize);
		assert!(!message_ids(&every).contains(&"m-mission"), "the crowd did not fill the cap");
		assert_eq!(conversation_ids(&every).len(), MAX_MATCHES_PER_LIST);
		assert!(!conversation_ids(&every).contains(&"beacon-mission"), "the rooms did not fill it");
		assert_eq!(message_ids(&missions), vec!["m-mission"]);
		assert_eq!(conversation_ids(&missions), vec!["beacon-mission"]);
	}

	fn an_update(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationUpdate", "payload": payload })
	}

	type Look = (String, String, Option<String>, Option<String>, Option<String>, i64);

	async fn look_of(app: &App<MockRuntime>, conversation_id: &'static str) -> Look {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT title, instructions, section_id, icon, color, updated_at
						FROM conversations WHERE id = ?1",
					[conversation_id],
					|row| {
						Ok((
							row.get(0)?,
							row.get(1)?,
							row.get(2)?,
							row.get(3)?,
							row.get(4)?,
							row.get(5)?,
						))
					},
				)?)
			})
			.await
			.expect("the look reads")
	}

	async fn update_refused(
		app: &App<MockRuntime>,
		host: &CompanionHost<MockRuntime>,
		conversation_id: &'static str,
		payload: Value,
	) -> Value {
		let updating = heard(app, crate::conversations::contract::UPDATED_EVENT);
		let arriving = heard(app, COMPANION_ARRIVED_EVENT);
		let before = (look_of(app, conversation_id).await, standing(app).await);
		let refused = refusal(host.answer(an_update(payload)).await);
		assert_eq!(
			(look_of(app, conversation_id).await, standing(app).await),
			before,
			"a refused update wrote"
		);
		assert!(updating.try_recv().is_err(), "a refused update announced the conversation");
		assert!(arriving.try_recv().is_err(), "a refused update announced an arrival");
		refused
	}

	const A_DRESSED_ROOM: &str = "
		INSERT INTO sections (id, space_id, name, position, created_at)
			VALUES ('s1', 'personal', 'Work', 0, 1);
		UPDATE conversations SET instructions = 'Keep it short.', section_id = 's1'
			WHERE id = 'room';
	";

	#[tokio::test]
	async fn every_given_field_lands_in_one_call_and_the_conversation_is_answered_as_it_stands() {
		let app = a_room("update-all").await;
		planted(&app, A_DRESSED_ROOM).await;
		let arriving = heard(&app, COMPANION_ARRIVED_EVENT);
		let updating = heard(&app, crate::conversations::contract::UPDATED_EVENT);

		let updated = serving(&app, "c1")
			.answer(an_update(json!({
				"conversation": "room",
				"title": " Trip ",
				"icon": "Globe",
				"colour": "cyan",
				"add": ["b3"],
				"remove": ["ada"]
			})))
			.await
			.expect("the conversation is updated");

		assert_eq!(
			updated,
			json!({
				"conversationId": "room",
				"kind": "topic",
				"title": "Trip",
				"icon": "Globe",
				"colour": "cyan",
				"companions": [{ "id": "b1", "name": "Shoto" }, { "id": "b3", "name": "Rex" }],
				"lastMessage": null,
				"archived": false
			})
		);
		let (title, instructions, section_id, icon, colour, _) = look_of(&app, "room").await;
		assert_eq!(
			(title.as_str(), instructions.as_str(), section_id.as_deref()),
			("Trip", "Keep it short.", Some("s1"))
		);
		assert_eq!((icon.as_deref(), colour.as_deref()), (Some("Globe"), Some("cyan")));
		let arrival = announced(&arriving);
		assert_eq!(arrival["botId"], json!("b3"));
		assert_eq!(arrival["conversationId"], json!("room"));
		assert_eq!(arrival["invitedByBotId"], json!("b1"));
		assert!(arriving.try_recv().is_err(), "an arrival was announced twice");
		assert_eq!(announced(&updating)["conversation"]["title"], json!("Trip"));
		assert!(updating.try_recv().is_err(), "the conversation was announced twice");
	}

	#[tokio::test]
	async fn a_field_left_out_keeps_what_the_conversation_wears_and_null_gives_back_the_default_colour(
	) {
		let app = a_room("update-field-by-field").await;
		planted(&app, A_DRESSED_ROOM).await;
		let host = serving(&app, "room");

		host.answer(an_update(json!({ "icon": "Rocket", "colour": "red" })))
			.await
			.expect("the look is set");
		let retitled =
			host.answer(an_update(json!({ "title": "Trip" }))).await.expect("the title is set");
		let uncoloured =
			host.answer(an_update(json!({ "colour": null }))).await.expect("the colour is cleared");

		assert_eq!(
			(&retitled["title"], &retitled["icon"], &retitled["colour"]),
			(&json!("Trip"), &json!("Rocket"), &json!("red"))
		);
		assert_eq!(
			(&uncoloured["title"], &uncoloured["icon"], &uncoloured["colour"]),
			(&json!("Trip"), &json!("Rocket"), &Value::Null)
		);
		let (_, instructions, section_id, ..) = look_of(&app, "room").await;
		assert_eq!((instructions.as_str(), section_id.as_deref()), ("Keep it short.", Some("s1")));
	}

	#[tokio::test]
	async fn the_main_chat_takes_a_title_an_icon_and_a_colour_from_a_companion_seated_in_it() {
		let app = a_room("update-main").await;

		let updated = serving(&app, "room")
			.answer(an_update(
				json!({ "conversation": "c1", "title": "Desk", "icon": "Sparkles", "colour": "red" }),
			))
			.await
			.expect("the main chat is updated");

		assert_eq!(
			(&updated["kind"], &updated["title"], &updated["icon"], &updated["colour"]),
			(&json!("main"), &json!("Desk"), &json!("Sparkles"), &json!("red"))
		);
	}

	#[tokio::test]
	async fn a_caller_naming_itself_in_remove_leaves_the_room_and_the_lead_passes_on() {
		let app = a_room("update-leave").await;

		let left = serving(&app, "c1")
			.answer(an_update(json!({ "conversation": "room", "remove": ["Shoto"] })))
			.await
			.expect("the caller leaves");

		assert_eq!(left["companions"], json!([{ "id": "b2", "name": "Ada" }]));
		assert_eq!(role_of(&app, "room", "b2").await, "lead");
		let (seats, _) = standing(&app).await;
		assert!(
			seats.iter().any(|seat| seat.0 == "room" && seat.1 == "b1" && seat.4.is_some()),
			"the caller still holds its seat"
		);
	}

	#[tokio::test]
	async fn a_companion_already_seated_or_not_seated_moves_no_seat_and_announces_no_arrival() {
		let app = a_room("update-settled").await;
		let arriving = heard(&app, COMPANION_ARRIVED_EVENT);
		let before = standing(&app).await;

		let updated = serving(&app, "room")
			.answer(an_update(json!({ "add": ["shoto", "b2", "Ada"], "remove": ["b3"] })))
			.await
			.expect("it is served");

		assert_eq!(
			updated["companions"],
			json!([{ "id": "b1", "name": "Shoto" }, { "id": "b2", "name": "Ada" }])
		);
		assert_eq!(standing(&app).await, before);
		assert!(arriving.try_recv().is_err(), "an arrival was announced");
	}

	#[tokio::test]
	async fn the_answer_carries_the_last_message_and_whether_the_conversation_is_archived() {
		let app = a_room("update-glance").await;
		planted(
			&app,
			"
			UPDATE conversations SET archived_at = 9 WHERE id = 'room';
			INSERT INTO turns (id, conversation_id, seq, started_at) VALUES ('t1', 'room', 1, 5);
			INSERT INTO messages
				(id, conversation_id, turn_id, seq, role, content, completion_state, created_at)
				VALUES ('m1', 'room', 't1', 1, 'user', 'Where to?', 'complete', 5);
			",
		)
		.await;

		let updated = serving(&app, "room")
			.answer(an_update(json!({ "title": "Trip" })))
			.await
			.expect("the conversation is updated");

		assert_eq!(updated["lastMessage"]["text"], json!("Where to?"));
		assert_eq!(updated["lastMessage"]["time"], json!(5));
		assert_eq!(updated["archived"], json!(true));
	}

	#[tokio::test]
	async fn an_update_naming_nothing_to_change_or_a_blank_title_is_refused() {
		let app = a_room("update-empty").await;
		let host = serving(&app, "room");

		let nothing = update_refused(&app, &host, "room", json!({ "conversation": "room" })).await;
		let empty_lists =
			update_refused(&app, &host, "room", json!({ "add": [], "remove": [] })).await;
		let blank =
			update_refused(&app, &host, "room", json!({ "title": " \n ", "icon": "Rocket" })).await;

		assert_eq!(nothing, json!({ "kind": "emptyUpdate" }));
		assert_eq!(empty_lists, json!({ "kind": "emptyUpdate" }));
		assert_eq!(blank, json!({ "kind": "emptyTitleField" }));
	}

	#[tokio::test]
	async fn a_field_off_the_lists_refuses_the_whole_call_with_the_kind_conversation_open_uses() {
		let app = a_room("update-off-the-lists").await;
		let host = serving(&app, "room");
		let with = |extra: Value| {
			let mut payload = json!({ "title": "Trip", "colour": "pink", "add": ["b3"] });
			if let (Some(payload), Some(extra)) = (payload.as_object_mut(), extra.as_object()) {
				payload.extend(extra.clone());
			}
			payload
		};

		let unlisted =
			update_refused(&app, &host, "room", with(json!({ "icon": "Message" }))).await;
		let blank = update_refused(&app, &host, "room", with(json!({ "icon": "  " }))).await;
		let teal = update_refused(&app, &host, "room", with(json!({ "colour": "teal" }))).await;

		assert_eq!(unlisted["kind"], json!("unlistedIcon"));
		assert_eq!(unlisted["icon"], json!("Message"));
		assert_eq!(unlisted["accepted"], json!(conversation_icons()));
		assert_eq!(blank, json!({ "kind": "emptyIconField" }));
		assert_eq!(
			teal,
			json!({
				"kind": "unknownColour",
				"colour": "teal",
				"accepted": ["red", "yellow", "green", "cyan", "blue", "purple", "pink", "orange"]
			})
		);
	}

	#[tokio::test]
	async fn a_companion_matching_none_or_two_of_the_space_refuses_the_whole_call() {
		let app = a_room("update-companions").await;
		let host = serving(&app, "room");

		let outside =
			update_refused(&app, &host, "room", json!({ "title": "Trip", "add": ["b3", "Kai"] }))
				.await;
		let nobody =
			update_refused(&app, &host, "room", json!({ "title": "Trip", "remove": ["Nobody"] }))
				.await;
		let twice =
			update_refused(&app, &host, "room", json!({ "title": "Trip", "remove": ["REX"] }))
				.await;

		assert_eq!(outside, json!({ "kind": "unknownCompanion", "companion": "Kai" }));
		assert_eq!(nobody, json!({ "kind": "unknownCompanion", "companion": "Nobody" }));
		assert_eq!(twice["kind"], json!("ambiguousCompanion"));
		let mut ids: Vec<String> =
			serde_json::from_value(twice["ids"].clone()).expect("the ids are listed");
		ids.sort();
		assert_eq!(ids, vec!["b3".to_owned(), "b4".to_owned()]);
	}

	#[tokio::test]
	async fn a_caller_holding_no_live_seat_in_the_conversation_is_refused() {
		let app = a_room("update-unseated").await;
		planted(&app, ANOTHER_ROOM).await;
		let stranger = CompanionHost::new(
			app.handle().clone(),
			"c1".to_owned(),
			"b2".to_owned(),
			Arc::default(),
		);

		let left = update_refused(
			&app,
			&serving(&app, "c1"),
			"unled",
			json!({ "conversation": "unled", "title": "Trip" }),
		)
		.await;
		let never = update_refused(
			&app,
			&stranger,
			"studio",
			json!({ "conversation": "studio", "title": "Trip" }),
		)
		.await;

		assert_eq!(left, json!({ "kind": "callerNotSeated", "conversationId": "unled" }));
		assert_eq!(never, json!({ "kind": "callerNotSeated", "conversationId": "studio" }));
	}

	#[tokio::test]
	async fn seats_moved_in_a_conversation_that_carries_no_seats_are_refused_with_its_kind() {
		let app = a_room("update-seatless").await;
		planted(&app, A_MISSION).await;

		for (conversation, kind, moved) in [
			("c1", "main", json!({ "add": ["b2"] })),
			("errand", "mission", json!({ "remove": ["b1"] })),
		] {
			let mut payload = moved;
			payload["conversation"] = json!(conversation);
			payload["title"] = json!("Trip");
			let refused = update_refused(&app, &serving(&app, "room"), "c1", payload).await;

			assert_eq!(
				refused,
				json!({
					"kind": "conversationWithoutSeats",
					"conversationId": conversation,
					"conversationKind": kind
				})
			);
		}
	}

	#[tokio::test]
	async fn an_archived_room_reopens_through_an_update_and_is_announced_back() {
		let app = a_room("update-reopen").await;
		serving(&app, "c1").answer(a_close("room")).await.expect("the room closes");
		let updating = heard(&app, crate::conversations::contract::UPDATED_EVENT);

		let reopened = serving(&app, "c1")
			.answer(an_update(json!({ "conversation": "room", "archived": false })))
			.await
			.expect("the room reopens");

		assert_eq!(reopened["archived"], json!(false));
		assert_eq!(archived_at(&app, "room").await, None, "the reopen left archived_at");
		assert_eq!(announced(&updating)["conversation"]["title"], json!("Plans"));
		assert!(updating.try_recv().is_err(), "the reopen was announced twice");
	}

	#[tokio::test]
	async fn a_reopen_of_a_room_never_archived_answers_it_unchanged() {
		let app = a_room("update-reopen-open").await;
		let host = serving(&app, "c1");
		let read = host.answer(a_read(json!({ "conversation": "room" }))).await.expect("it reads");

		let reopened = host
			.answer(an_update(json!({ "conversation": "room", "archived": false })))
			.await
			.expect("the room is answered");

		assert_eq!(reopened, read["conversation"]);
		assert_eq!(archived_at(&app, "room").await, None);
	}

	#[tokio::test]
	async fn an_update_archiving_a_room_is_refused_toward_conversation_close_and_writes_nothing() {
		let app = a_room("update-archive").await;

		let refused = update_refused(
			&app,
			&serving(&app, "c1"),
			"room",
			json!({ "conversation": "room", "title": "Trip", "archived": true }),
		)
		.await;

		assert_eq!(
			refused,
			json!({ "kind": "archiveThroughConversationClose", "conversationId": "room" })
		);
		assert_eq!(archived_at(&app, "room").await, None, "a refused archive archived");
	}

	#[tokio::test]
	async fn a_reopen_beside_a_refused_field_leaves_the_room_archived_and_unchanged() {
		let app = a_room("update-reopen-refused").await;
		serving(&app, "c1").answer(a_close("room")).await.expect("the room closes");
		let closed_at = archived_at(&app, "room").await;

		let refused = update_refused(
			&app,
			&serving(&app, "c1"),
			"room",
			json!({ "conversation": "room", "title": "Trip", "icon": "Message", "archived": false }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unlistedIcon"));
		assert!(closed_at.is_some(), "the close wrote no archived_at");
		assert_eq!(archived_at(&app, "room").await, closed_at, "a refused reopen reopened");
	}

	#[tokio::test]
	async fn an_update_carrying_a_field_it_does_not_declare_is_refused_naming_it() {
		let app = a_room("update-undeclared").await;

		let refused = update_refused(
			&app,
			&serving(&app, "room"),
			"room",
			json!({ "title": "Trip", "instructions": "Keep it short." }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("instructions")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn the_list_answers_every_companion_of_the_space_of_the_caller_with_its_job() {
		let app = a_room("list").await;
		planted(&app, ANOTHER_ROOM).await;
		planted(&app, "UPDATE bots SET title = 'a researcher' WHERE id = 'b2';").await;

		let personal =
			serving(&app, "room").answer(asking("list")).await.expect("the roster is listed");
		let work =
			serving(&app, "studio").answer(asking("list")).await.expect("the roster is listed");

		let expected: Vec<Value> = worn(&app)
			.await
			.into_iter()
			.map(|bot| json!({ "id": bot.id, "name": bot.name, "job": bot.title }))
			.collect();
		assert_eq!(personal, json!(expected));
		assert_eq!(expected.len(), 4);
		assert!(expected.contains(&json!({ "id": "b2", "name": "Ada", "job": "a researcher" })));
		let mut work_ids: Vec<String> = work
			.as_array()
			.expect("the roster is a list")
			.iter()
			.map(|companion| companion["id"].as_str().expect("an id").to_owned())
			.collect();
		work_ids.sort();
		assert_eq!(work_ids, roster_of(&app, "work").await);
	}

	#[tokio::test]
	async fn the_list_from_a_conversation_belonging_to_no_space_or_carrying_a_field_is_refused() {
		let app = a_room("list-refused").await;

		let spaceless = refusal(serving(&app, "nowhere").answer(asking("list")).await);
		let undeclared = refusal(
			serving(&app, "room")
				.answer(json!({
					"subtype": "companion",
					"operation": "list",
					"payload": { "space": "work" }
				}))
				.await,
		);

		assert_eq!(
			spaceless,
			json!({ "kind": "conversationWithoutSpace", "conversationId": "nowhere" })
		);
		assert_eq!(undeclared["kind"], json!("unreadableRequest"));
	}
}
