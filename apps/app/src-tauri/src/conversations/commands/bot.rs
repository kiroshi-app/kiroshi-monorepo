use std::path::Path;

use tauri::{AppHandle, Manager, Runtime, State};

use super::super::contract::{
	AvatarBlot, Bot, BotDraft, BotIdentity, SuggestedBot, TranscriptStoreError,
};
use super::super::seed;
use crate::agent::commands::supported_effort_levels;
use crate::agent::contract::AgentCommand;
use crate::attachments;
use crate::avatars;
use crate::bundles;
use crate::companions::contract::{
	CompanionCreated, CompanionDeleted, CompanionUpdated, CREATED_EVENT,
};
use crate::companions::launch;
use crate::db;
use crate::db::repositories::conversations::{Bot as StoredBot, DEFAULT_BOT_MODEL};
use crate::environment;
use crate::environment::contract::EnvOwner;
use crate::events::{COMPANION_CREATED, COMPANION_DELETED, COMPANION_UPDATED};
use crate::file_store::FileStore;

const DUPLICATE_SUFFIX: &str = " copy";

const SUGGESTED_BOTS: [SuggestedBot; 4] = [
	SuggestedBot {
		id: "writer",
		name: "Quill",
		job: "a writing partner",
		description: "Help me draft, tighten and polish what I write. Keep my voice, cut the filler, and say plainly when a sentence does not work.",
		blurb: "Drafts, edits and keeps your voice.",
	},
	SuggestedBot {
		id: "researcher",
		name: "Scout",
		job: "a research assistant",
		description: "Dig into the questions I bring. Find sources, weigh them, give me the short answer first and the evidence after. Say so when you are unsure.",
		blurb: "Finds sources and sums them up.",
	},
	SuggestedBot {
		id: "coder",
		name: "Byte",
		job: "a coding companion",
		description: "Pair with me on code. Read the project before changing it, keep changes small, and lay out the tradeoffs when there is more than one way.",
		blurb: "Reads, writes and reviews code.",
	},
	SuggestedBot {
		id: "planner",
		name: "Compass",
		job: "a planning assistant",
		description: "Help me turn goals into plans. Break the work into next steps, keep track of what is still open, and nudge me when something slips.",
		blurb: "Turns goals into next steps.",
	},
];

pub(crate) fn ready(state: &db::DatabaseState) -> Result<&db::Database, TranscriptStoreError> {
	state.as_ref().map_err(|failure| TranscriptStoreError::Unavailable { failure: failure.into() })
}

async fn write_bundle<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	bot: &StoredBot,
	output_style: &str,
	permissions: &bundles::BotPermissions,
) -> Result<StoredBot, TranscriptStoreError> {
	let accepted = permissions.clone().accepted();
	let ruled = database.conversations().set_permissions(bot.id.clone(), accepted.clone()).await?;
	let root = bundles::root(app);
	if let Some(root) = root.as_deref() {
		let effort = written_effort(app, bot).await;
		bundles::lay_down(root, bot).map_err(unwritable)?;
		bundles::set_permissions(root, bot, &accepted).map_err(unwritable)?;
		bundles::write_styled(root, bot, output_style, effort).map_err(unwritable)?;
	}
	list_bundles(root.as_deref(), database).await;
	Ok(ruled)
}

async fn written_effort<R: Runtime>(
	app: &AppHandle<R>,
	bot: &StoredBot,
) -> Option<bundles::EffortLevel> {
	let supported = supported_effort_levels(app, &bot.model).await;
	bundles::supported_effort(bot.effort, supported.as_deref())
}

fn remember_bundle(
	root: Option<&Path>,
	bot: &StoredBot,
	memory: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(root) = root else {
		return Ok(());
	};
	bundles::write_remembered(root, bot, memory).map_err(unwritable)
}

fn unwritable(error: std::io::Error) -> TranscriptStoreError {
	TranscriptStoreError::UnwritableBundle { detail: error.to_string() }
}

async fn forget_bundle(root: Option<&Path>, database: &db::Database, bot_id: &str) {
	if let Some(root) = root {
		bundles::remove(root, bot_id);
	}
	list_bundles(root, database).await;
}

pub async fn list_bundles_at_launch<R: Runtime>(app: &AppHandle<R>) {
	let mut unlaid = lay_down_host_plugins(app);
	let state = app.state::<db::DatabaseState>();
	let database = match state.inner().as_ref() {
		Ok(database) => database,
		Err(failure) => {
			unlaid.push(format!("the database could not be reached: {failure:?}"));
			launch::settle(app, None, unlaid);
			return;
		}
	};
	unlaid.extend(lay_down_space_plugins(app, database).await);
	seed::plant_first_companion(app, database, unlaid).await;
	list_bundles(bundles::root(app).as_deref(), database).await;
}

fn lay_down_host_plugins<R: Runtime>(app: &AppHandle<R>) -> Vec<String> {
	let mut unlaid = Vec::new();
	if let Some(path) = bundles::system::path(app) {
		if let Err(failure) = bundles::system::write(&path) {
			unlaid.push(unlaid_reason("the system plugin", &failure));
		}
	}
	if let Some(path) = bundles::user::path(app) {
		if let Err(failure) = bundles::user::lay_down(&path) {
			unlaid.push(unlaid_reason("the user plugin", &failure));
		}
	}
	unlaid
}

async fn lay_down_space_plugins<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
) -> Vec<String> {
	let spaces = match database.spaces().list().await {
		Ok(spaces) => spaces,
		Err(failure) => {
			return vec![format!("the database could not list the spaces to lay down: {failure:?}")]
		}
	};
	spaces
		.iter()
		.filter_map(|space| {
			let path = bundles::space::path(app, &space.id)?;
			let failure = bundles::space::lay_down_at(&path).err()?;
			Some(unlaid_reason(&format!("the plugin of the space {}", space.id), &failure))
		})
		.collect()
}

fn unlaid_reason(bundle: &str, failure: &std::io::Error) -> String {
	format!("{bundle} was not laid down: {failure}")
}

pub(crate) async fn list_bundles(root: Option<&Path>, database: &db::Database) {
	let Some(root) = root else {
		return;
	};
	if let Ok(roster) = database.conversations().bots(None).await {
		for bot in &roster {
			if let Err(failure) = bundles::ensure(root, bot) {
				eprintln!("the bundle of bot {} was not brought in line: {failure}", bot.id);
			}
		}
		let _ = bundles::write_marketplace(root, &roster);
	}
}

fn reconciled_identity(
	root: Option<&Path>,
	previous: Option<&StoredBot>,
	identity: BotIdentity,
) -> BotIdentity {
	let (Some(root), Some(previous)) = (root, previous) else {
		return identity;
	};
	let instructions = bundles::reconciled(root, previous, &identity.instructions);
	BotIdentity { instructions, ..identity }
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bots<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: Option<String>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let stored = ready(&state)?.conversations().bots(space_id).await?;
	Ok(stored.into_iter().map(|bot| Bot::of(bot, dir.as_deref(), bundle_root.as_deref())).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bots_by_presence<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	space_id: String,
	excluded_conversation_id: Option<String>,
) -> Result<Vec<Bot>, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let stored =
		ready(&state)?.conversations().bots_by_presence(space_id, excluded_conversation_id).await?;
	Ok(stored.into_iter().map(|bot| Bot::of(bot, dir.as_deref(), bundle_root.as_deref())).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	identity: BotIdentity,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	let created = create_bundled_bot(&app, ready(&state)?, identity, space_id).await?;
	announce_created(&app, &created);
	Ok(created)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_create_bot_from_draft<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	draft: BotDraft,
	space_id: String,
) -> Result<Bot, TranscriptStoreError> {
	let database = ready(&state)?;
	let worn = database.conversations().bots(Some(space_id.clone())).await?;
	let identity = drafted_identity(draft, &worn)?;
	let created = create_bundled_bot(&app, database, identity, Some(space_id)).await?;
	announce_created(&app, &created);
	Ok(created)
}

fn announce_created<R: Runtime>(app: &AppHandle<R>, created: &Bot) {
	let companion = CompanionCreated { id: created.id.clone(), name: created.name.clone() };
	launch::announce(app, COMPANION_CREATED, companion);
}

pub(crate) async fn announce_joined<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	bot_id: &str,
) {
	let failure = match database.conversations().bot(bot_id.to_owned()).await {
		Ok(Some(joined)) => {
			let companion = CompanionCreated { id: joined.id, name: joined.name };
			return launch::announce(app, COMPANION_CREATED, companion);
		}
		Ok(None) => "the bot was not found again".to_owned(),
		Err(failure) => format!("the bot did not read back: {failure:?}"),
	};
	eprintln!("{CREATED_EVENT} was not announced for bot {bot_id}: {failure}");
}

pub(crate) fn announce_left<R: Runtime>(app: &AppHandle<R>, bot_id: &str, space_id: String) {
	launch::announce(app, COMPANION_DELETED, CompanionDeleted { id: bot_id.to_owned(), space_id });
}

fn announce_updated<R: Runtime>(app: &AppHandle<R>, updated: &Bot) {
	let companion = CompanionUpdated { id: updated.id.clone(), bot: updated.clone() };
	launch::announce(app, COMPANION_UPDATED, companion);
}

#[tauri::command]
#[specta::specta]
pub fn conversation_suggested_bots() -> Vec<SuggestedBot> {
	SUGGESTED_BOTS.to_vec()
}

fn drafted_identity(
	draft: BotDraft,
	worn: &[StoredBot],
) -> Result<BotIdentity, TranscriptStoreError> {
	let name = draft.name.trim();
	if name.is_empty() {
		return Err(TranscriptStoreError::NamelessBot);
	}
	let blots: Vec<AvatarBlot> =
		worn.iter().filter_map(|bot| bot.avatar_blot.map(Into::into)).collect();
	Ok(BotIdentity {
		name: name.to_owned(),
		title: draft.job.trim().to_owned(),
		model: DEFAULT_BOT_MODEL.to_owned(),
		avatar_blot: Some(unworn(&blots, worn.len())),
		avatar_image_path: None,
		instructions: draft.description.trim().to_owned(),
		denied_tools: Vec::new(),
		permissions: bundles::BotPermissions::default(),
		output_style: bundles::DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: None,
	})
}

fn unworn(worn: &[AvatarBlot], crowd: usize) -> AvatarBlot {
	AvatarBlot::ALL
		.iter()
		.copied()
		.find(|blot| !worn.contains(blot))
		.unwrap_or(AvatarBlot::ALL[crowd % AvatarBlot::ALL.len()])
}

pub(in crate::conversations) async fn create_bundled_bot<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	identity: BotIdentity,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(app);
	let bundle_root = bundles::root(app);
	let output_style = identity.output_style.clone();
	let permissions = identity.permissions.clone();
	let created = database.conversations().create_bot(identity.into(), space_id, None).await?;
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled = match write_bundle(app, database, &created, &output_style, &permissions).await {
		Ok(ruled) => ruled,
		Err(refusal) => {
			let _ = database.conversations().delete_bot(created.id).await;
			avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
			return Err(refusal);
		}
	};
	Ok(Bot::of(ruled, dir.as_deref(), bundle_root.as_deref()))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_duplicate_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: Option<String>,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let source = database
		.conversations()
		.bot(bot_id.clone())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.clone() })?;
	let source_of = bot_owner(database, &bot_id).await?;
	let destination = match space_id {
		Some(named) => named,
		None => oldest_space(database, &bot_id).await?,
	};
	let held = database.conversations().bot_in(bot_id.clone(), destination.clone()).await?;
	let section = held.as_ref().and_then(|membership| membership.section_id.clone());
	let is_pinned = held.is_some_and(|membership| membership.pin_position.is_some());
	let taken: Vec<String> = database
		.conversations()
		.bots(Some(destination.clone()))
		.await?
		.into_iter()
		.map(|bot| bot.name)
		.collect();
	let memory = source.memory.clone();
	let identity =
		duplicated_identity(Bot::of(source, dir.as_deref(), bundle_root.as_deref()), &taken);
	let carried = Carried {
		source_id: bot_id.clone(),
		source_of,
		memory,
		is_pinned,
		output_style: identity.output_style.clone(),
		permissions: identity.permissions.clone(),
	};
	let created =
		database.conversations().create_bot(identity.into(), Some(destination), section).await?;
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled = match copied_onto(&app, database, &created, &carried).await {
		Ok(ruled) => ruled,
		Err(refusal) => {
			let _ = database.conversations().delete_bot(created.id.clone()).await;
			forget_bundle(bundle_root.as_deref(), database, &created.id).await;
			environment::store::forget_bot(&app, &created.id);
			avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
			return Err(refusal);
		}
	};
	let copy = Bot::of(ruled, dir.as_deref(), bundle_root.as_deref());
	announce_created(&app, &copy);
	Ok(copy)
}

struct Carried {
	source_id: String,
	source_of: EnvOwner,
	memory: String,
	is_pinned: bool,
	output_style: String,
	permissions: bundles::BotPermissions,
}

async fn copied_onto<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	created: &StoredBot,
	carried: &Carried,
) -> Result<StoredBot, TranscriptStoreError> {
	let remembered =
		database.conversations().set_memory(created.id.clone(), carried.memory.clone()).await?;
	let placed = if carried.is_pinned {
		database.conversations().pin_bot(created.id.clone()).await?
	} else {
		remembered
	};
	copied_environment(app, database, &carried.source_of, &placed.id).await?;
	let root = bundles::root(app);
	if let Some(root) = root.as_deref() {
		bundles::inherit(root, &carried.source_id, &placed).map_err(unwritable)?;
	}
	write_bundle(app, database, &placed, &carried.output_style, &carried.permissions).await
}

async fn copied_environment<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	source: &EnvOwner,
	copy_id: &str,
) -> Result<(), TranscriptStoreError> {
	let Some(root) = environment::store::root(app) else {
		return Ok(());
	};
	let copy = bot_owner(database, copy_id).await?;
	environment::store::copy_owner(&root, source, &copy)
		.map_err(|failure| TranscriptStoreError::UnwritableEnvironment { failure })
}

pub(crate) async fn bot_owner(
	database: &db::Database,
	bot_id: &str,
) -> Result<EnvOwner, TranscriptStoreError> {
	Ok(EnvOwner::Bot { id: bot_id.to_owned(), space_id: oldest_space(database, bot_id).await? })
}

pub(crate) async fn space_of_the_conversation(
	database: &db::Database,
	conversation_id: &str,
	bot_id: &str,
) -> Result<String, TranscriptStoreError> {
	match database.conversations().space(conversation_id.to_owned()).await? {
		Some(named) => Ok(named),
		None => oldest_space(database, bot_id).await,
	}
}

pub(crate) async fn oldest_space(
	database: &db::Database,
	bot_id: &str,
) -> Result<String, TranscriptStoreError> {
	database
		.conversations()
		.oldest_bot_space(bot_id.to_owned())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.to_owned() })
}

fn duplicated_identity(source: Bot, taken: &[String]) -> BotIdentity {
	BotIdentity {
		name: unshared_name(format!("{}{DUPLICATE_SUFFIX}", source.name), taken),
		title: source.title,
		model: source.model,
		avatar_blot: source.avatar_blot,
		avatar_image_path: source.avatar_image_path,
		instructions: source.instructions,
		denied_tools: source.denied_tools,
		permissions: source.permissions,
		output_style: source.output_style,
		effort: source.effort,
	}
}

fn unshared_name(wanted: String, taken: &[String]) -> String {
	let carried = |name: &str| taken.iter().any(|held| held == name);
	if !carried(&wanted) {
		return wanted;
	}
	let mut number = 2;
	loop {
		let candidate = format!("{wanted} {number}");
		if !carried(&candidate) {
			return candidate;
		}
		number += 1;
	}
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_update_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	identity: BotIdentity,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let previous = database.conversations().bot(id.clone()).await?;
	let reconciled = reconciled_identity(bundle_root.as_deref(), previous.as_ref(), identity);
	let output_style = reconciled.output_style.clone();
	let permissions = reconciled.permissions.clone();
	let updated = database.conversations().update_bot(id.clone(), reconciled.into()).await?;
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	let ruled = match write_bundle(&app, database, &updated, &output_style, &permissions).await {
		Ok(ruled) => ruled,
		Err(refusal) => {
			if let Some(previous) = previous {
				let _ = database.conversations().update_bot(id, previous.into()).await;
				avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
			}
			return Err(refusal);
		}
	};
	let updated = Bot::of(ruled, dir.as_deref(), bundle_root.as_deref());
	announce_updated(&app, &updated);
	Ok(updated)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_bot_memory<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	memory: String,
) -> Result<Bot, TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let repository = database.conversations();
	let _memory = bundles::holding_the_memory(&id).await;
	let previous = repository.bot(id.clone()).await?;
	let learned = memory.trim().to_owned();
	let updated = repository.set_memory(id.clone(), learned.clone()).await?;
	if let Err(refusal) = remember_bundle(bundle_root.as_deref(), &updated, &learned) {
		if let Some(previous) = previous {
			let _ = repository.set_memory(id, previous.memory).await;
		}
		return Err(refusal);
	}
	Ok(Bot::of(updated, dir.as_deref(), bundle_root.as_deref()))
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_set_bot_avatar_image<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	bytes: Vec<u8>,
) -> Result<Bot, TranscriptStoreError> {
	let normalised = avatars::picture::normalised(&bytes)?;
	let database = ready(&state)?;
	let repository = database.conversations();
	let dir = avatars::Avatars::dir(&app).ok_or(avatars::Rejection::Unwritable {
		detail: "there is no application data directory to store avatars in".to_owned(),
	})?;
	let path = avatars::minted_path(&dir);
	let recorded = path.to_string_lossy().into_owned();
	let updated = repository.set_avatar_image_path(id.clone(), Some(recorded)).await?;
	if let Err(rejection) = avatars::write(&path, &normalised) {
		let _ = repository.set_avatar_image_path(id, None).await;
		avatars::Avatars::sweep_referenced(database, Some(&dir)).await;
		return Err(rejection.into());
	}
	avatars::Avatars::sweep_referenced(database, Some(&dir)).await;
	let updated = Bot::of(updated, Some(&dir), bundles::root(&app).as_deref());
	announce_updated(&app, &updated);
	Ok(updated)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_delete_bot<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), TranscriptStoreError> {
	let dir = avatars::Avatars::dir(&app);
	let attachment_dir = attachments::Attachments::dir(&app);
	let bundle_root = bundles::root(&app);
	let database = ready(&state)?;
	let held_by = database.conversations().bot_space_ids(id.clone()).await?;
	database.conversations().delete_bot(id.clone()).await?;
	forget_bundle(bundle_root.as_deref(), database, &id).await;
	environment::store::forget_bot(&app, &id);
	avatars::Avatars::sweep_referenced(database, dir.as_deref()).await;
	attachments::Attachments::sweep_referenced(database, attachment_dir.as_deref()).await;
	for space_id in held_by {
		announce_left(&app, &id, space_id);
	}
	Ok(())
}

pub(crate) fn recounted<T>(outcome: Result<T, git2::Error>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnreadableHistory { detail: error.to_string() })
}

pub(crate) async fn bot_row(
	database: &db::Database,
	bot_id: &str,
) -> Result<StoredBot, TranscriptStoreError> {
	database
		.conversations()
		.bot(bot_id.to_owned())
		.await?
		.ok_or_else(|| TranscriptStoreError::UnknownBot { id: bot_id.to_owned() })
}

pub(crate) fn bundled<T>(outcome: std::io::Result<T>) -> Result<T, TranscriptStoreError> {
	outcome.map_err(|error| TranscriptStoreError::UnwritableBundle { detail: error.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_record_bot_commands(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	commands: Vec<AgentCommand>,
) -> Result<(), TranscriptStoreError> {
	Ok(ready(&state)?.conversations().record_bot_commands(bot_id, commands).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn conversation_bot_commands(
	state: State<'_, db::DatabaseState>,
	bot_id: String,
) -> Result<Vec<AgentCommand>, TranscriptStoreError> {
	Ok(ready(&state)?.conversations().bot_commands(bot_id).await?)
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use super::*;
	use crate::db::repositories::conversations::AvatarBlot as StoredBlot;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::App;

	fn a_bot() -> StoredBot {
		StoredBot {
			id: "b1".to_owned(),
			section_id: None,
			pin_position: None,
			name: "Bean".to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: "Answer briefly.".to_owned(),
			memory: String::new(),
			denied_tools: Vec::new(),
			permissions: None,
			created_at: 1,
			effort: None,
		}
	}

	fn a_draft(name: &str, job: &str, description: &str) -> BotDraft {
		BotDraft { name: name.to_owned(), job: job.to_owned(), description: description.to_owned() }
	}

	fn wearing(blot: Option<StoredBlot>) -> StoredBot {
		StoredBot { avatar_blot: blot, ..a_bot() }
	}

	fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("conversation-commands-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app
	}

	async fn first_space(app: &App<MockRuntime>) -> String {
		let state = app.state::<db::DatabaseState>();
		let spaces = ready(&state).expect("the database opens").spaces().list().await;
		spaces.expect("the spaces read").remove(0).id
	}

	async fn bot_ids(app: &App<MockRuntime>) -> Vec<String> {
		let state = app.state::<db::DatabaseState>();
		let bots = ready(&state).expect("the database opens").conversations().bots(None).await;
		bots.expect("the bots read").into_iter().map(|bot| bot.id).collect()
	}

	async fn created_from(
		app: &App<MockRuntime>,
		draft: BotDraft,
	) -> Result<Bot, TranscriptStoreError> {
		let space = first_space(app).await;
		conversation_create_bot_from_draft(app.handle().clone(), app.state(), draft, space).await
	}

	#[test]
	fn a_draft_becomes_a_trimmed_identity_on_the_defaults() {
		use crate::conversations::contract;

		assert_eq!(
			drafted_identity(a_draft("  Quill ", " a writing partner\n", "\tWrite well. "), &[]),
			Ok(BotIdentity {
				name: "Quill".to_owned(),
				title: "a writing partner".to_owned(),
				model: DEFAULT_BOT_MODEL.to_owned(),
				avatar_blot: Some(contract::AvatarBlot::Red),
				avatar_image_path: None,
				instructions: "Write well.".to_owned(),
				denied_tools: Vec::new(),
				permissions: bundles::BotPermissions::default(),
				output_style: bundles::DEFAULT_OUTPUT_STYLE.to_owned(),
				effort: None,
			})
		);
	}

	#[test]
	fn a_draft_without_a_name_is_refused() {
		assert_eq!(
			drafted_identity(a_draft(" \n\t", "a job", "A brief."), &[]),
			Err(TranscriptStoreError::NamelessBot)
		);
	}

	#[test]
	fn a_draft_wears_the_first_blot_no_bot_of_the_space_wears() {
		use crate::conversations::contract;

		let worn =
			[wearing(Some(StoredBlot::Red)), wearing(None), wearing(Some(StoredBlot::Green))];

		let identity = drafted_identity(a_draft("Quill", "", ""), &worn).expect("it is named");

		assert_eq!(identity.avatar_blot, Some(contract::AvatarBlot::Yellow));
	}

	#[test]
	fn a_draft_wraps_on_the_crowd_of_the_space_when_every_blot_is_worn() {
		use crate::conversations::contract;

		let mut worn: Vec<StoredBot> =
			contract::AvatarBlot::ALL.iter().map(|&blot| wearing(Some(blot.into()))).collect();

		let eighth = drafted_identity(a_draft("Quill", "", ""), &worn).expect("it is named");
		worn.push(wearing(Some(StoredBlot::Red)));
		let ninth = drafted_identity(a_draft("Quill", "", ""), &worn).expect("it is named");

		assert_eq!(eighth.avatar_blot, Some(contract::AvatarBlot::Red));
		assert_eq!(ninth.avatar_blot, Some(contract::AvatarBlot::Yellow));
	}

	#[tokio::test]
	async fn a_bot_from_a_draft_lands_in_the_space_with_its_bundle() {
		let app = a_host("drafted");
		let space = first_space(&app).await;

		let created = created_from(&app, a_draft(" Quill ", " a writing partner ", " Write. "))
			.await
			.expect("the bot is created");

		assert_eq!(
			(created.name.as_str(), created.title.as_str(), created.instructions.as_str()),
			("Quill", "a writing partner", "Write.")
		);
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state).expect("the database opens").conversations();
		let listed = held.bots(Some(space)).await.expect("the space reads");
		assert!(listed.iter().any(|bot| bot.id == created.id));
		let root = bundles::root(app.handle()).expect("the bundle root is named");
		let plugins = root.join("plugins");
		assert_eq!(
			bundles::dir(&root, &created.id).expect("the bundle is held"),
			plugins.join(format!("quill-{}", &created.id[..8]))
		);
		assert!(!plugins.join(&created.id).exists(), "a bundle was laid down under the bot id");
	}

	async fn a_bundle_on_the_default_model(app: &App<MockRuntime>, name: &str) -> PathBuf {
		let created = created_from(app, a_draft(name, "a job", "A brief."))
			.await
			.expect("the bot is created");
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state).expect("the database opens").conversations();
		let stored =
			held.bot(created.id.clone()).await.expect("the bot reads").expect("the bot is stored");
		let root = bundles::root(app.handle()).expect("the bundle root is named");
		bundles::write_remembered(&root, &stored, "They use bun.").expect("the memory lands");
		let agent = bundles::agent_file(&root, &created.id).expect("the agent file stands");
		let written = fs::read_to_string(&agent).expect("the agent file reads");
		let retired = written.replacen("model: \"opus\"", "model: \"default\"", 1);
		assert_ne!(retired, written);
		fs::write(&agent, retired).expect("the retired model lands");
		agent
	}

	#[tokio::test]
	async fn a_launch_rewrites_only_the_model_line_of_a_bundle_left_on_the_default_model() {
		let app = a_host("repaired-model");
		let agent = a_bundle_on_the_default_model(&app, "Quill").await;
		let before = fs::read_to_string(&agent).expect("the agent file reads");

		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		list_bundles(bundles::root(app.handle()).as_deref(), database).await;

		let after = fs::read_to_string(&agent).expect("the agent file reads");
		assert_eq!(after, before.replacen("model: \"default\"", "model: \"opus\"", 1));
		assert!(after.contains("They use bun."), "got {after}");
	}

	#[tokio::test]
	async fn a_launch_goes_on_past_a_bundle_it_cannot_write() {
		let app = a_host("unwritable-model");
		let blocked = a_bundle_on_the_default_model(&app, "Quill").await;
		let repaired = a_bundle_on_the_default_model(&app, "Sage").await;
		fs::remove_file(&blocked).expect("the agent file goes");
		fs::create_dir(&blocked).expect("a directory stands in its place");

		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database opens");
		let root = bundles::root(app.handle()).expect("the bundle root is named");
		list_bundles(Some(&root), database).await;

		assert!(blocked.is_dir());
		let after = fs::read_to_string(&repaired).expect("the agent file reads");
		assert!(after.contains("model: \"opus\""), "got {after}");
		assert!(bundles::marketplace_file(&root).is_file());
	}

	#[tokio::test]
	async fn a_nameless_draft_leaves_no_row_behind() {
		let app = a_host("nameless");
		let before = bot_ids(&app).await;

		let failure = created_from(&app, a_draft("  ", "a job", "A brief."))
			.await
			.expect_err("the draft is refused");

		assert_eq!(failure, TranscriptStoreError::NamelessBot);
		assert_eq!(bot_ids(&app).await, before);
	}

	#[tokio::test]
	async fn a_draft_whose_bundle_cannot_be_written_leaves_no_row_behind() {
		let app = a_host("unbundled");
		let before = bot_ids(&app).await;
		let root = bundles::root(app.handle()).expect("the bundle root is named");
		let _ = fs::remove_dir_all(&root);
		fs::create_dir_all(root.parent().expect("the root has a parent"))
			.expect("the data dir stands");
		fs::write(&root, "not a directory").expect("the blocking file lands");

		let failure = created_from(&app, a_draft("Quill", "a job", "A brief."))
			.await
			.expect_err("the bundle is refused");

		assert!(
			matches!(failure, TranscriptStoreError::UnwritableBundle { .. }),
			"got {failure:?}"
		);
		assert_eq!(bot_ids(&app).await, before);
	}

	#[tokio::test]
	async fn every_suggested_bot_is_distinct_complete_and_creates_what_it_describes() {
		let app = a_host("suggested");
		let suggested = conversation_suggested_bots();
		let ids: std::collections::HashSet<&str> = suggested.iter().map(|bot| bot.id).collect();

		assert!(suggested.len() >= 3);
		assert_eq!(ids.len(), suggested.len());
		for bot in suggested {
			assert!([bot.name, bot.job, bot.description, bot.blurb]
				.iter()
				.all(|field| !field.trim().is_empty()));
			let created = created_from(&app, a_draft(bot.name, bot.job, bot.description))
				.await
				.expect("the suggestion is created");
			assert_eq!(
				(created.name.as_str(), created.title.as_str(), created.instructions.as_str()),
				(bot.name, bot.job, bot.description)
			);
		}
	}

	#[test]
	fn a_duplicate_is_the_source_under_a_name_that_says_where_it_came_from() {
		use crate::conversations::contract::AvatarBlot;

		let source = Bot {
			id: "b1".to_owned(),
			section_id: None,
			pin_position: None,
			name: "Bean".to_owned(),
			title: "Bakes".to_owned(),
			model: "opus".to_owned(),
			avatar_blot: Some(AvatarBlot::Cyan),
			avatar_image_path: Some("/pictures/bean.png".to_owned()),
			instructions: "Answer briefly.".to_owned(),
			memory: "They bake on Sundays.".to_owned(),
			denied_tools: vec!["Bash".to_owned()],
			changes_nothing: true,
			permissions: bundles::BotPermissions::unruled(true),
			output_style: "terse".to_owned(),
			created_at: 1,
			effort: None,
		};

		assert_eq!(
			duplicated_identity(source.clone(), &["Bean".to_owned()]),
			BotIdentity {
				name: "Bean copy".to_owned(),
				title: source.title,
				model: source.model,
				avatar_blot: source.avatar_blot,
				avatar_image_path: source.avatar_image_path,
				instructions: source.instructions,
				denied_tools: source.denied_tools,
				permissions: source.permissions,
				output_style: source.output_style,
				effort: None,
			}
		);
	}

	#[test]
	fn a_duplicate_takes_the_lowest_name_no_bot_carries() {
		let named = |names: &[&str]| {
			let taken: Vec<String> = names.iter().map(|name| (*name).to_owned()).collect();
			unshared_name("Bean copy".to_owned(), &taken)
		};

		assert_eq!(named(&["Bean"]), "Bean copy");
		assert_eq!(named(&["Bean", "Bean copy"]), "Bean copy 2");
		assert_eq!(named(&["Bean", "Bean copy", "Bean copy 2"]), "Bean copy 3");
		assert_eq!(named(&["Bean", "Bean copy", "Bean copy 3"]), "Bean copy 2");
		assert_eq!(named(&[]), "Bean copy");
	}
}
