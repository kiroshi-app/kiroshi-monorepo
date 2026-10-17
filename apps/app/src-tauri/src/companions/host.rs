use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use chrono::Utc;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Runtime};

use super::contract::{
	CompanionCreated, CompanionError, CompanionInvited, ConversationAttached,
	ConversationDescribed, ConversationOpened, ConversationSaid, SeatedCompanion,
};
use crate::agent::host::{Host, Refusal};
use crate::agent::reply_writer::{shown_with_attachments, HeldAttachment, TurnAttachments};
use crate::attachments::contract::SubmittedAttachment;
use crate::attachments::{
	refuse_block, refuse_file, store, Attachments, Rejection, SizedFile, IMAGE_EXTENSIONS,
};
use crate::conversations::commands::{
	announce_conversation, conversation_create_bot_from_draft, conversation_suggested_bots, ready,
	seat_participant,
};
use crate::conversations::contract::{BotDraft, CompanionSpoke, TranscriptStoreError};
use crate::db;
use crate::db::repositories::conversations::{
	Bot as StoredBot, ConversationDescription, ConversationDraft, TOPIC_KIND,
};
use crate::events::{
	self, Event, COMPANION_CREATED, COMPANION_SPOKE, CONVERSATION_UPDATED, FIRST_RUN_DONE,
};
use crate::file_store::FileStore;

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

	async fn invite(
		&self,
		database: &db::Database,
		asked: Invited,
	) -> Result<CompanionInvited, CompanionError> {
		if asked.companion.trim().is_empty() {
			return Err(CompanionError::EmptyCompanionField);
		}
		let conversation_id = asked.conversation.unwrap_or_else(|| self.conversation_id.clone());
		carries_seats(database, &conversation_id).await?;
		if conversation_id != self.conversation_id {
			self.holds_seat(database, &conversation_id).await?;
		}
		let space_id = space_of(database, &conversation_id).await?;
		let roster = database.conversations().bots(Some(space_id)).await?;
		let invitee = picked(&roster, &asked.companion)?;
		let joined = seat_participant(
			&self.app,
			database,
			conversation_id,
			invitee.id.clone(),
			Some(self.bot_id.clone()),
		)
		.await?;
		Ok(CompanionInvited {
			id: invitee.id.clone(),
			name: invitee.name.clone(),
			already_seated: joined.arrival.is_none(),
		})
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
	) -> Result<ConversationOpened, CompanionError> {
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
		let draft =
			ConversationDraft { space_id, section_id: None, title: title.to_owned(), bot_ids };
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
		Ok(ConversationOpened {
			conversation_id: room.id,
			title: room.title,
			companions: room
				.seats
				.into_iter()
				.map(|seat| SeatedCompanion { id: seat.bot_id, name: seat.name })
				.collect(),
		})
	}

	async fn say(
		&self,
		database: &db::Database,
		asked: Said,
	) -> Result<ConversationSaid, CompanionError> {
		let message = asked.message.trim();
		if message.is_empty() {
			return Err(CompanionError::EmptyMessageField);
		}
		carries_seats(database, &asked.conversation).await?;
		self.holds_seat(database, &asked.conversation).await?;
		let title = title_of(database, &asked.conversation).await?;
		self.announce(
			COMPANION_SPOKE,
			CompanionSpoke {
				conversation_id: asked.conversation.clone(),
				author_bot_id: self.bot_id.clone(),
				text: message.to_owned(),
			},
		)?;
		Ok(ConversationSaid { conversation_id: asked.conversation, title })
	}

	async fn describe(
		&self,
		database: &db::Database,
		asked: Described,
	) -> Result<ConversationDescribed, CompanionError> {
		if asked.icon.is_none() && asked.colour.is_none() {
			return Err(CompanionError::EmptyDescription);
		}
		self.holds_seat(database, &asked.conversation).await?;
		let description = ConversationDescription { icon: asked.icon, color: asked.colour };
		let room = database
			.conversations()
			.describe_conversation(asked.conversation, description)
			.await
			.map_err(TranscriptStoreError::from)?;
		announce_conversation(&self.app, database, CONVERSATION_UPDATED, &room.id).await;
		Ok(ConversationDescribed {
			conversation_id: room.id,
			title: room.title,
			icon: room.icon,
			colour: room.color.map(|colour| colour.named().to_owned()),
		})
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
			let bytes = image_bytes(path)?;
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
		let bytes = image_bytes(path)?;
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

fn image_bytes(path: &str) -> Result<Vec<u8>, CompanionError> {
	let is_image = Path::new(path)
		.extension()
		.and_then(|extension| extension.to_str())
		.is_some_and(|extension| IMAGE_EXTENSIONS.contains(&extension.to_lowercase().as_str()));
	if !is_image {
		return Err(CompanionError::NotAnImage {
			path: path.to_owned(),
			accepted: IMAGE_EXTENSIONS.iter().map(|extension| (*extension).to_owned()).collect(),
		});
	}
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
	let submitted = SubmittedAttachment { name: path.to_owned(), bytes };
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

async fn title_of(
	database: &db::Database,
	conversation_id: &str,
) -> Result<String, CompanionError> {
	database.conversations().title(conversation_id.to_owned()).await?.ok_or_else(|| {
		CompanionError::ConversationWithoutSpace { conversation_id: conversation_id.to_owned() }
	})
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
			Operation::Invite => {
				let asked: Invited = Self::read(payload)?;
				Self::answered(self.invite(database, asked).await?)
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
			Operation::ConversationDescribe => {
				let asked: Described = Self::read(payload)?;
				Self::answered(self.describe(database, asked).await?)
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
	Invite,
	ConversationOpen,
	ConversationSay,
	ConversationAttach,
	ConversationDescribe,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Bare {}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Invited {
	companion: String,
	conversation: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Opened {
	title: String,
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
struct Described {
	conversation: String,
	icon: Option<String>,
	#[serde(default, deserialize_with = "present")]
	colour: Option<Option<String>>,
}

fn present<'de, D: Deserializer<'de>, T: Deserialize<'de>>(
	deserializer: D,
) -> Result<Option<T>, D::Error> {
	T::deserialize(deserializer).map(Some)
}

fn picked<'a>(roster: &'a [StoredBot], companion: &str) -> Result<&'a StoredBot, CompanionError> {
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
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const PATIENCE: Duration = Duration::from_secs(10);

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
		let before = written(app).await;
		let refused = refusal(serving(app, conversation_id).answer(an_open(payload)).await);
		assert_eq!(written(app).await, before, "a refused opening wrote something");
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

	fn an_invite(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "invite", "payload": payload })
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

	async fn refused_and_untouched(
		app: &App<MockRuntime>,
		conversation_id: &str,
		payload: Value,
	) -> Value {
		let before = standing(app).await;
		let refused = refusal(serving(app, conversation_id).answer(an_invite(payload)).await);
		assert_eq!(standing(app).await, before, "a refused invitation moved a seat or an arrival");
		refused
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
	async fn a_companion_invited_by_id_is_seated_with_the_caller_recorded_and_announced_as_inviter()
	{
		let app = a_room("invite-by-id").await;
		let arriving = heard(&app, COMPANION_ARRIVED_EVENT);

		let invited = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "b3" })))
			.await
			.expect("it is invited");

		assert_eq!(invited, json!({ "id": "b3", "name": "Rex", "alreadySeated": false }));
		assert_eq!(role_of(&app, "room", "b3").await, "assistant");
		let arrival = announced(&arriving);
		assert_eq!(arrival["botId"], json!("b3"));
		assert_eq!(arrival["conversationId"], json!("room"));
		assert_eq!(arrival["invitedByBotId"], json!("b1"));
		assert_eq!(standing(&app).await.1, 1);
	}

	#[tokio::test]
	async fn a_name_trimmed_and_compared_without_case_seats_the_one_companion_wearing_it() {
		let app = a_room("invite-by-name").await;

		let ada = serving(&app, "unled")
			.answer(an_invite(json!({ "companion": "  aDA " })))
			.await
			.expect("it is invited");

		assert_eq!(ada, json!({ "id": "b2", "name": "Ada", "alreadySeated": false }));
	}

	#[tokio::test]
	async fn a_companion_seated_where_no_seat_holds_the_lead_takes_it() {
		let app = a_room("invite-lead").await;

		serving(&app, "unled")
			.answer(an_invite(json!({ "companion": "b2" })))
			.await
			.expect("it is invited");

		assert_eq!(role_of(&app, "unled", "b2").await, "lead");
		assert_eq!(role_of(&app, "unled", "b1").await, "assistant");
	}

	#[tokio::test]
	async fn a_companion_already_seated_is_served_and_no_seat_or_arrival_moves() {
		let app = a_room("invite-seated").await;
		let before = standing(&app).await;

		let lead = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "shoto" })))
			.await
			.expect("it is served");
		let mate = serving(&app, "room")
			.answer(an_invite(json!({ "companion": "b2" })))
			.await
			.expect("it is served");

		assert_eq!(lead, json!({ "id": "b1", "name": "Shoto", "alreadySeated": true }));
		assert_eq!(mate, json!({ "id": "b2", "name": "Ada", "alreadySeated": true }));
		assert_eq!(standing(&app).await, before);
	}

	#[tokio::test]
	async fn an_empty_field_is_refused_as_empty() {
		let app = a_room("invite-empty").await;

		let refused = refused_and_untouched(&app, "room", json!({ "companion": "   " })).await;

		assert_eq!(refused, json!({ "kind": "emptyCompanionField" }));
	}

	#[tokio::test]
	async fn a_name_worn_by_several_companions_is_refused_with_every_id_it_matched() {
		let app = a_room("invite-ambiguous").await;

		let refused = refused_and_untouched(&app, "room", json!({ "companion": "REX" })).await;

		assert_eq!(refused["kind"], json!("ambiguousCompanion"));
		assert_eq!(refused["companion"], json!("REX"));
		let mut ids: Vec<String> =
			serde_json::from_value(refused["ids"].clone()).expect("the ids are listed");
		ids.sort();
		assert_eq!(ids, vec!["b3".to_owned(), "b4".to_owned()]);
	}

	#[tokio::test]
	async fn a_companion_outside_the_space_is_refused_by_id_and_by_name() {
		let app = a_room("invite-unknown").await;

		for companion in ["b5", "Kai", "Nobody"] {
			let refused =
				refused_and_untouched(&app, "room", json!({ "companion": companion })).await;

			assert_eq!(refused, json!({ "kind": "unknownCompanion", "companion": companion }));
		}
	}

	#[tokio::test]
	async fn a_conversation_that_carries_no_seats_is_refused_with_its_kind() {
		let app = a_room("invite-main").await;

		let refused = refused_and_untouched(&app, "c1", json!({ "companion": "b2" })).await;

		assert_eq!(
			refused,
			json!({
				"kind": "conversationWithoutSeats",
				"conversationId": "c1",
				"conversationKind": "main"
			})
		);
	}

	#[tokio::test]
	async fn an_invitation_into_a_conversation_belonging_to_no_space_is_refused() {
		let app = a_room("invite-spaceless").await;

		let refused = refused_and_untouched(&app, "drifting", json!({ "companion": "b2" })).await;

		assert_eq!(
			refused,
			json!({ "kind": "conversationWithoutSpace", "conversationId": "drifting" })
		);
	}

	#[tokio::test]
	async fn an_invitation_carrying_a_field_it_does_not_declare_is_refused_naming_it() {
		let app = a_room("invite-undeclared").await;

		let refused = refused_and_untouched(
			&app,
			"room",
			json!({ "companion": "b3", "conversationId": "unled" }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("conversationId")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn an_opened_room_lands_in_the_space_of_the_caller_led_by_it_and_is_announced_once() {
		let app = a_room("open").await;
		let arriving = heard(&app, COMPANION_SPOKE_EVENT);
		let before = written(&app).await;

		let opened = serving(&app, "c1")
			.answer(an_open(
				json!({ "title": " Trip ", "with": ["  aDA ", "b3"], "message": " Hi " }),
			))
			.await
			.expect("it is opened");

		let id = opened["conversationId"].as_str().expect("the room is named").to_owned();
		assert_eq!(
			opened,
			json!({
				"conversationId": id,
				"title": "Trip",
				"companions": [
					{ "id": "b1", "name": "Shoto" },
					{ "id": "b2", "name": "Ada" },
					{ "id": "b3", "name": "Rex" }
				]
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
			.answer(an_open(json!({ "title": "Trip", "with": [], "message": "Hi" })))
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
				json!({ "title": "Trip", "with": ["b2", companion], "message": "Hi" }),
			)
			.await;

			assert_eq!(refused, json!({ "kind": "unknownCompanion", "companion": companion }));
		}
		let refused =
			open_refused(&app, "c1", json!({ "title": "Trip", "with": ["rex"], "message": "Hi" }))
				.await;
		assert_eq!(refused["kind"], json!("ambiguousCompanion"));
	}

	#[tokio::test]
	async fn a_blank_title_or_message_is_refused_by_name_and_opens_nothing() {
		let app = a_room("open-blank").await;

		let title =
			open_refused(&app, "c1", json!({ "title": "  ", "with": [], "message": "Hi" })).await;
		let message =
			open_refused(&app, "c1", json!({ "title": "Trip", "with": [], "message": " " })).await;

		assert_eq!(title, json!({ "kind": "emptyTitleField" }));
		assert_eq!(message, json!({ "kind": "emptyMessageField" }));
	}

	#[tokio::test]
	async fn a_room_opened_from_a_conversation_belonging_to_no_space_is_refused() {
		let app = a_room("open-spaceless").await;

		let refused =
			open_refused(&app, "nowhere", json!({ "title": "Trip", "with": [], "message": "Hi" }))
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
			json!({ "title": "Trip", "with": [], "message": "Hi", "spaceId": "work" }),
		)
		.await;

		assert_eq!(refused["kind"], json!("unreadableRequest"));
		assert!(
			refused["detail"].as_str().is_some_and(|detail| detail.contains("spaceId")),
			"got {refused}"
		);
	}

	#[tokio::test]
	async fn an_invitation_naming_a_room_seats_there_from_the_roster_of_its_space() {
		let app = a_room("invite-elsewhere").await;
		planted(&app, ANOTHER_ROOM).await;

		let invited = serving(&app, "c1")
			.answer(an_invite(json!({ "companion": "kai", "conversation": "studio" })))
			.await
			.expect("it is invited");
		let outsider = refused_and_untouched(
			&app,
			"c1",
			json!({ "companion": "Ada", "conversation": "studio" }),
		)
		.await;

		assert_eq!(invited, json!({ "id": "b5", "name": "Kai", "alreadySeated": false }));
		assert_eq!(role_of(&app, "studio", "b5").await, "assistant");
		assert_eq!(outsider, json!({ "kind": "unknownCompanion", "companion": "Ada" }));
	}

	#[tokio::test]
	async fn an_invitation_naming_a_room_the_caller_holds_no_live_seat_in_is_refused() {
		let app = a_room("invite-unseated").await;
		planted(&app, ANOTHER_ROOM).await;

		let left = refused_and_untouched(
			&app,
			"c1",
			json!({ "companion": "b3", "conversation": "unled" }),
		)
		.await;
		let before = standing(&app).await;
		let never = refusal(
			CompanionHost::new(
				app.handle().clone(),
				"c1".to_owned(),
				"b2".to_owned(),
				Arc::default(),
			)
			.answer(an_invite(json!({ "companion": "b3", "conversation": "studio" })))
			.await,
		);

		assert_eq!(left, json!({ "kind": "callerNotSeated", "conversationId": "unled" }));
		assert_eq!(never, json!({ "kind": "callerNotSeated", "conversationId": "studio" }));
		assert_eq!(standing(&app).await, before);
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

		assert_eq!(said, json!({ "conversationId": "room", "title": "Plans" }));
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

		assert_eq!(said, json!({ "conversationId": "room", "title": "Plans" }));
		assert_eq!(announced(&arriving)["conversationId"], json!("room"));
	}

	fn a_describe(payload: Value) -> Value {
		json!({ "subtype": "companion", "operation": "conversationDescribe", "payload": payload })
	}

	type Look = (Option<String>, Option<String>, i64);

	async fn look_of(app: &App<MockRuntime>, conversation_id: &'static str) -> Look {
		ready(&app.state::<db::DatabaseState>())
			.expect("the database opens")
			.call(move |connection| {
				Ok(connection.query_row(
					"SELECT icon, color, updated_at FROM conversations WHERE id = ?1",
					[conversation_id],
					|row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
				)?)
			})
			.await
			.expect("the look reads")
	}

	async fn describe_refused(
		app: &App<MockRuntime>,
		conversation_id: &'static str,
		payload: Value,
	) -> Value {
		let updating = heard(app, crate::conversations::contract::UPDATED_EVENT);
		let before = look_of(app, conversation_id).await;
		let refused = refusal(serving(app, "c1").answer(a_describe(payload)).await);
		assert_eq!(look_of(app, conversation_id).await, before, "a refused description wrote");
		assert!(updating.try_recv().is_err(), "a refused description announced");
		refused
	}

	#[tokio::test]
	async fn a_seated_companion_describes_a_room_field_by_field_and_the_room_is_announced() {
		let app = a_room("describe-seated").await;
		let updating = heard(&app, crate::conversations::contract::UPDATED_EVENT);

		let iconed = serving(&app, "c1")
			.answer(a_describe(json!({ "conversation": "room", "icon": "Rocket" })))
			.await
			.expect("the icon is set");
		let announced_room = announced(&updating);
		let stored_icon = look_of(&app, "room").await.0;
		let coloured = serving(&app, "c1")
			.answer(a_describe(json!({ "conversation": "room", "colour": "cyan" })))
			.await
			.expect("the colour is set");
		let uncoloured = serving(&app, "c1")
			.answer(a_describe(json!({ "conversation": "room", "colour": null })))
			.await
			.expect("the colour is cleared");
		let main = serving(&app, "c1")
			.answer(a_describe(
				json!({ "conversation": "c1", "icon": "Sparkles", "colour": "red" }),
			))
			.await
			.expect("the main chat is described");

		assert_eq!(
			iconed,
			json!({ "conversationId": "room", "title": "Plans", "icon": "Rocket", "colour": null })
		);
		assert_eq!(stored_icon.as_deref(), Some("Rocket"));
		assert_eq!(announced_room["conversation"]["id"], json!("room"));
		assert_eq!(announced_room["conversation"]["icon"], json!("Rocket"));
		assert_eq!(
			coloured,
			json!({ "conversationId": "room", "title": "Plans", "icon": "Rocket", "colour": "cyan" })
		);
		assert_eq!(
			uncoloured,
			json!({ "conversationId": "room", "title": "Plans", "icon": "Rocket", "colour": null })
		);
		assert_eq!(
			main,
			json!({ "conversationId": "c1", "title": "Chat", "icon": "Sparkles", "colour": "red" })
		);
	}

	#[tokio::test]
	async fn a_description_from_a_companion_without_a_live_seat_is_refused_naming_the_room() {
		let app = a_room("describe-unseated").await;
		planted(&app, ANOTHER_ROOM).await;

		let refused =
			describe_refused(&app, "unled", json!({ "conversation": "unled", "icon": "Rocket" }))
				.await;

		assert_eq!(refused, json!({ "kind": "callerNotSeated", "conversationId": "unled" }));
	}

	#[tokio::test]
	async fn a_description_naming_nothing_or_off_the_lists_is_refused() {
		let app = a_room("describe-refused").await;

		let nothing = describe_refused(&app, "room", json!({ "conversation": "room" })).await;
		let blank =
			describe_refused(&app, "room", json!({ "conversation": "room", "icon": "  " })).await;
		let unlisted =
			describe_refused(&app, "room", json!({ "conversation": "room", "icon": "Message" }))
				.await;
		let teal = describe_refused(
			&app,
			"room",
			json!({ "conversation": "room", "icon": "Rocket", "colour": "teal" }),
		)
		.await;

		assert_eq!(nothing, json!({ "kind": "emptyDescription" }));
		assert_eq!(blank, json!({ "kind": "emptyIconField" }));
		assert_eq!(unlisted["kind"], json!("unlistedIcon"));
		assert_eq!(unlisted["icon"], json!("Message"));
		assert_eq!(unlisted["accepted"], json!(conversation_icons()));
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

	#[tokio::test]
	async fn an_invitation_naming_a_conversation_that_carries_no_seats_is_refused() {
		let app = a_room("invite-elsewhere-main").await;

		let refused =
			refused_and_untouched(&app, "room", json!({ "companion": "b2", "conversation": "c1" }))
				.await;

		assert_eq!(
			refused,
			json!({
				"kind": "conversationWithoutSeats",
				"conversationId": "c1",
				"conversationKind": "main"
			})
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
	async fn a_missing_file_a_directory_or_a_file_that_is_no_image_is_refused_naming_it() {
		let app = a_room("attach-unreadable").await;
		let host = serving(&app, "c1");
		let text = an_image(&app, "notes.txt", 3);
		let folder = an_image(&app, "album.png", 0);
		fs::remove_file(&folder).expect("the placeholder goes");
		fs::create_dir(&folder).expect("the folder lands");
		let missing = format!("{text}.png");

		let not_image = attach_refused(&app, &host, json!({ "path": text })).await;
		assert_eq!(not_image["kind"], json!("notAnImage"));
		assert_eq!(not_image["path"], json!(text));
		assert_eq!(
			not_image["accepted"],
			json!(["avif", "bmp", "gif", "ico", "jpeg", "jpg", "png", "svg", "webp"])
		);
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
}
