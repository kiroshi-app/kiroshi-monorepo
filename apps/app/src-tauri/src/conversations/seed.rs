use std::fs;
use std::io::ErrorKind;
use std::path::Path;

use tauri::{AppHandle, Runtime};

use super::commands::create_bundled_bot;
use super::contract::{BotIdentity, TranscriptStoreError};
use crate::avatars;
use crate::bundles;
use crate::bundles::shoto;
use crate::companions::contract::CompanionCreated;
use crate::companions::launch;
use crate::db;
use crate::db::repositories::conversations::DEFAULT_BOT_MODEL;
use crate::db::DatabaseError;
use crate::file_store::FileStore;

const PERSONAL_SPACE_ID: &str = "personal";

#[derive(Debug)]
enum Refusal {
	NoDataDir,
	NoPersonalSpace,
	Picture(avatars::Rejection),
	Bundle(std::io::Error),
	Store(TranscriptStoreError),
	Database(DatabaseError),
	LeftBehind { cause: Box<Refusal>, leftovers: String },
}

impl Refusal {
	fn reason(&self) -> String {
		match self {
			Refusal::NoDataDir => "the data directory is unknown".to_owned(),
			Refusal::NoPersonalSpace => "the personal space is missing".to_owned(),
			Refusal::Picture(rejection) => format!("its picture was refused: {rejection:?}"),
			Refusal::Bundle(failure) => format!("its bundle was not written: {failure}"),
			Refusal::Store(failure) => format!("the store refused: {failure:?}"),
			Refusal::Database(failure) => format!("the database refused: {failure:?}"),
			Refusal::LeftBehind { cause, leftovers } => {
				format!("{}, and {leftovers} stayed behind", cause.reason())
			}
		}
	}
}

impl From<avatars::Rejection> for Refusal {
	fn from(rejection: avatars::Rejection) -> Self {
		Refusal::Picture(rejection)
	}
}

impl From<std::io::Error> for Refusal {
	fn from(error: std::io::Error) -> Self {
		Refusal::Bundle(error)
	}
}

impl From<TranscriptStoreError> for Refusal {
	fn from(error: TranscriptStoreError) -> Self {
		Refusal::Store(error)
	}
}

impl From<DatabaseError> for Refusal {
	fn from(error: DatabaseError) -> Self {
		Refusal::Database(error)
	}
}

pub(super) async fn plant_first_companion<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
	mut unlaid: Vec<String>,
) {
	let created = match seed(app, database).await {
		Ok(created) => created,
		Err(refusal) => {
			unlaid.push(refusal.reason());
			None
		}
	};
	backfill_shoto_title(database).await;
	launch::settle(app, created, unlaid);
}

async fn backfill_shoto_title(database: &db::Database) {
	if let Err(failure) = database.user().backfill_shoto_title(shoto::NAME, shoto::TITLE).await {
		log::warn!("the title of {} was not backfilled: {failure:?}", shoto::NAME);
	}
}

async fn seed<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
) -> Result<Option<CompanionCreated>, Refusal> {
	if database.user().is_first_companion_seeded().await? {
		return Ok(None);
	}
	if database.conversations().holds_a_bot().await? {
		adopt(database).await?;
		return Ok(None);
	}
	plant(app, database).await.map(Some)
}

async fn adopt(database: &db::Database) -> Result<(), Refusal> {
	database.user().mark_first_run_done().await?;
	Ok(database.user().mark_first_companion_seeded().await?)
}

async fn plant<R: Runtime>(
	app: &AppHandle<R>,
	database: &db::Database,
) -> Result<CompanionCreated, Refusal> {
	let dir = avatars::Avatars::dir(app).ok_or(Refusal::NoDataDir)?;
	let root = bundles::root(app).ok_or(Refusal::NoDataDir)?;
	if !holds_personal_space(database).await? {
		return Err(Refusal::NoPersonalSpace);
	}
	let picture = avatars::picture::normalised(shoto::AVATAR)?;
	let path = avatars::minted_path(&dir);
	if let Err(rejection) = avatars::write(&path, &picture) {
		return Err(withdrawn(database, rejection.into(), None, &path).await);
	}

	let created = match create_bundled_bot(app, database, identity(&path), personal_space()).await {
		Ok(created) => created,
		Err(failure) => return Err(withdrawn(database, failure.into(), None, &path).await),
	};
	if let Err(refusal) = furnished(&root, database, &created.id).await {
		return Err(withdrawn(database, refusal, Some(created.id), &path).await);
	}
	Ok(CompanionCreated { id: created.id, name: created.name })
}

async fn furnished(root: &Path, database: &db::Database, bot_id: &str) -> Result<(), Refusal> {
	let stored = database
		.conversations()
		.bot(bot_id.to_owned())
		.await
		.map_err(|failure| Refusal::Store(failure.into()))?
		.ok_or_else(|| {
			Refusal::Store(TranscriptStoreError::UnknownBot { id: bot_id.to_owned() })
		})?;
	bundles::write_skills(root, &stored, &shoto::SKILLS)?;
	Ok(database.user().mark_first_companion_seeded_as_shoto(stored.id).await?)
}

async fn withdrawn(
	database: &db::Database,
	cause: Refusal,
	bot_id: Option<String>,
	picture: &Path,
) -> Refusal {
	let mut leftovers = Vec::new();
	if let Some(id) = bot_id {
		if let Err(failure) = database.conversations().delete_bot(id).await {
			leftovers.push(format!("its row ({failure:?})"));
		}
	}
	if let Err(failure) = discarded(picture) {
		leftovers.push(format!("its picture ({failure})"));
	}
	if leftovers.is_empty() {
		return cause;
	}
	Refusal::LeftBehind { cause: Box::new(cause), leftovers: leftovers.join(" and ") }
}

fn discarded(picture: &Path) -> std::io::Result<()> {
	match fs::remove_file(picture) {
		Err(failure)
			if matches!(failure.kind(), ErrorKind::NotFound | ErrorKind::NotADirectory) =>
		{
			Ok(())
		}
		removed => removed,
	}
}

async fn holds_personal_space(database: &db::Database) -> Result<bool, DatabaseError> {
	Ok(database.spaces().list().await?.iter().any(|space| space.id == PERSONAL_SPACE_ID))
}

fn personal_space() -> Option<String> {
	Some(PERSONAL_SPACE_ID.to_owned())
}

fn identity(picture: &Path) -> BotIdentity {
	BotIdentity {
		name: shoto::NAME.to_owned(),
		title: shoto::TITLE.to_owned(),
		model: DEFAULT_BOT_MODEL.to_owned(),
		avatar_blot: None,
		avatar_image_path: Some(picture.to_string_lossy().into_owned()),
		instructions: shoto::persona(),
		denied_tools: Vec::new(),
		permissions: bundles::BotPermissions::default(),
		output_style: bundles::DEFAULT_OUTPUT_STYLE.to_owned(),
		effort: None,
	}
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;
	use std::sync::mpsc::{channel, Receiver};

	use serde::de::DeserializeOwned;
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener, Manager};

	use super::super::commands::list_bundles_at_launch;
	use super::*;
	use crate::companions::contract::{
		CompanionSeedRefused, LaunchOutcome, CREATED_EVENT, SEED_REFUSED_EVENT,
	};
	use crate::companions::launch::LaunchOutcomeState;
	use crate::db::repositories::conversations::{
		Bot as StoredBot, BotIdentity as StoredIdentity, ConversationDraft,
	};
	use crate::db::repositories::user::OnboardingStep;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	fn a_bare_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("conversation-seed-{name}"), mock_builder());
		app.manage(LaunchOutcomeState::default());
		app
	}

	fn a_host(name: &str) -> AppOfItsOwn {
		let app = a_bare_host(name);
		app.manage(db::bootstrap(app.handle()));
		app
	}

	fn database_of(app: &App<MockRuntime>) -> &db::Database {
		app.state::<db::DatabaseState>().inner().as_ref().expect("the database opens")
	}

	fn outcome_of(app: &App<MockRuntime>) -> LaunchOutcome {
		app.state::<LaunchOutcomeState>().read()
	}

	fn heard(app: &App<MockRuntime>, event: &'static str) -> Receiver<String> {
		let (sender, received) = channel();
		app.handle().listen(event, move |heard| {
			sender.send(heard.payload().to_owned()).expect("the test still listens");
		});
		received
	}

	fn payloads<T: DeserializeOwned>(received: &Receiver<String>) -> Vec<T> {
		received
			.try_iter()
			.map(|payload| serde_json::from_str(&payload).expect("the payload reads"))
			.collect()
	}

	async fn seeded(app: &App<MockRuntime>, database: &db::Database) {
		plant_first_companion(app.handle(), database, Vec::new()).await;
	}

	async fn planted(app: &App<MockRuntime>, database: &db::Database) -> Vec<StoredBot> {
		seeded(app, database).await;
		database.conversations().bots(personal_space()).await.expect("the roster reads")
	}

	async fn a_companion_seated_in_a_mission(database: &db::Database) -> StoredBot {
		let kept = a_companion(database).await;
		database
			.conversations()
			.create_conversation(ConversationDraft {
				space_id: PERSONAL_SPACE_ID.to_owned(),
				section_id: None,
				title: "A mission".to_owned(),
				icon: None,
				bot_ids: vec![kept.id.clone()],
			})
			.await
			.expect("the mission is created");
		kept
	}

	async fn a_companion(database: &db::Database) -> StoredBot {
		a_bot(database, "Kept", "").await
	}

	async fn a_bot(database: &db::Database, name: &str, title: &str) -> StoredBot {
		let mut identity = identity(Path::new("held.png"));
		identity.name = name.to_owned();
		identity.title = title.to_owned();
		database
			.conversations()
			.create_bot(identity.into(), personal_space(), None)
			.await
			.expect("the bot is created")
	}

	async fn an_existing_shoto_titled(database: &db::Database, title: &str) -> StoredBot {
		let shoto = a_bot(database, shoto::NAME, title).await;
		database
			.user()
			.mark_first_companion_seeded_as_shoto(shoto.id.clone())
			.await
			.expect("the seed marker");
		shoto
	}

	async fn retitled(database: &db::Database, bot: &StoredBot, title: &str) {
		let mut identity = StoredIdentity::from(
			database
				.conversations()
				.bot(bot.id.clone())
				.await
				.expect("the bot reads")
				.expect("the bot is held"),
		);
		identity.title = title.to_owned();
		database.conversations().update_bot(bot.id.clone(), identity).await.expect("the update");
	}

	async fn title_of(database: &db::Database, bot: &StoredBot) -> String {
		database
			.conversations()
			.bot(bot.id.clone())
			.await
			.expect("the bot reads")
			.expect("the bot is held")
			.title
	}

	fn bundle_of(app: &App<MockRuntime>, bot: &StoredBot) -> PathBuf {
		bundles::dir(&bundles::root(app.handle()).expect("the bundle root"), &bot.id)
			.expect("the bundle is held")
	}

	fn skill_body(bundle: &Path, id: &str) -> Vec<u8> {
		fs::read(bundle.join("skills").join(id).join("SKILL.md")).expect("the skill reads")
	}

	fn a_file_standing_at(path: &Path) {
		fs::create_dir_all(path.parent().expect("a parent")).expect("the parent stands");
		fs::write(path, b"not a directory").expect("the file stands where a directory goes");
	}

	#[tokio::test]
	async fn a_fresh_install_opens_with_shoto_in_the_personal_space() {
		let app = a_host("fresh");
		let database = database_of(&app);

		let roster = planted(&app, database).await;

		let shoto = roster.first().expect("Shoto is planted");
		assert_eq!(roster.len(), 1);
		assert_eq!(shoto.name, shoto::NAME);
		assert_eq!(shoto.title, shoto::TITLE);
		assert_eq!(shoto.instructions, shoto::persona());
		assert_eq!(shoto.avatar_blot, None);
		assert!(database.user().is_first_companion_seeded().await.expect("the marker"));
		let preferences = database.user().preferences().await.expect("the preferences");
		assert!(!preferences.first_run_done);
		assert_eq!(preferences.onboarding_shoto_id, Some(shoto.id.clone()));
		assert_eq!(preferences.onboarding_first_companion_id, None);
	}

	#[tokio::test]
	async fn a_planted_shoto_is_announced_by_his_id_and_his_name() {
		let app = a_host("announced");
		let database = database_of(&app);
		let created = heard(&app, CREATED_EVENT);
		let refused = heard(&app, SEED_REFUSED_EVENT);

		let roster = planted(&app, database).await;

		assert_eq!(
			payloads::<CompanionCreated>(&created),
			vec![CompanionCreated { id: roster[0].id.clone(), name: shoto::NAME.to_owned() }]
		);
		assert_eq!(payloads::<CompanionSeedRefused>(&refused), Vec::new());
	}

	#[tokio::test]
	async fn a_planted_shoto_stays_readable_when_nothing_listened() {
		let app = a_host("unheard");
		let database = database_of(&app);

		let roster = planted(&app, database).await;

		assert_eq!(
			outcome_of(&app),
			LaunchOutcome {
				created: Some(CompanionCreated {
					id: roster[0].id.clone(),
					name: shoto::NAME.to_owned()
				}),
				refused: None,
			}
		);
	}

	#[tokio::test]
	async fn a_refusal_stays_readable_when_nothing_listened() {
		let app = a_host("unheard-refusal");
		let database = database_of(&app);
		database.spaces().create("Work".to_owned()).await.expect("the second space");
		database.spaces().delete(PERSONAL_SPACE_ID.to_owned()).await.expect("the deletion");

		seeded(&app, database).await;

		assert_eq!(
			outcome_of(&app),
			LaunchOutcome {
				created: None,
				refused: Some(CompanionSeedRefused { reason: Refusal::NoPersonalSpace.reason() }),
			}
		);
	}

	#[tokio::test]
	async fn a_launch_that_cannot_reach_the_database_names_it_in_the_outcome() {
		let app = a_bare_host("no-database");
		app.manage::<db::DatabaseState>(Err(DatabaseError::AppDataDir));
		let refused = heard(&app, SEED_REFUSED_EVENT);

		list_bundles_at_launch(app.handle()).await;

		let outcome = outcome_of(&app);
		assert_eq!(outcome.created, None);
		let reason = outcome.refused.expect("the refusal is kept").reason;
		assert!(reason.contains("the database could not be reached"), "got {reason}");
		assert_eq!(payloads::<CompanionSeedRefused>(&refused).len(), 1);
	}

	#[tokio::test]
	async fn a_plugin_not_laid_down_before_the_seed_is_named_beside_the_planted_shoto() {
		let app = a_host("unlaid");
		a_file_standing_at(&bundles::system::path(app.handle()).expect("the system plugin path"));

		list_bundles_at_launch(app.handle()).await;

		let outcome = outcome_of(&app);
		assert_eq!(outcome.created.map(|created| created.name), Some(shoto::NAME.to_owned()));
		let reason = outcome.refused.expect("the refusal is kept").reason;
		assert!(reason.starts_with("the system plugin was not laid down"), "got {reason}");
	}

	#[tokio::test]
	async fn the_picture_shoto_wears_is_the_embedded_one_the_pipeline_answered() {
		let app = a_host("picture");
		let database = database_of(&app);
		let dir = avatars::Avatars::dir(app.handle()).expect("the avatars directory");

		let roster = planted(&app, database).await;

		let recorded = roster[0].avatar_image_path.as_deref().expect("a picture is recorded");
		let path = avatars::readable(&dir, recorded).expect("the picture sits in the directory");
		assert_eq!(path, dir.join(Path::new(recorded).file_name().expect("a file name")));
		assert_eq!(
			fs::read(path).expect("the picture reads"),
			avatars::picture::normalised(shoto::AVATAR).expect("the picture is accepted")
		);
	}

	#[tokio::test]
	async fn the_bundle_carries_the_four_skills_byte_for_byte_and_an_agent_holding_the_persona() {
		let app = a_host("bundle");
		let database = database_of(&app);

		let roster = planted(&app, database).await;

		let bundle = bundle_of(&app, &roster[0]);
		for (id, body) in shoto::SKILLS {
			assert_eq!(skill_body(&bundle, id), body, "the skill {id} was rewritten");
		}
		let agent = fs::read_to_string(bundle.join("agents").join("agent.md"))
			.expect("the agent file reads");
		assert!(agent.contains(&shoto::persona()), "the agent file lost the persona");
		assert_eq!(bundles::skills_at(&bundle).len(), shoto::SKILLS.len());
	}

	#[tokio::test]
	async fn a_second_launch_plants_nothing_and_a_deleted_shoto_stays_deleted() {
		let app = a_host("again");
		let database = database_of(&app);
		let roster = planted(&app, database).await;
		let created = heard(&app, CREATED_EVENT);

		assert_eq!(planted(&app, database).await.len(), 1, "a second Shoto was planted");

		database.conversations().delete_bot(roster[0].id.clone()).await.expect("the deletion");
		assert_eq!(planted(&app, database).await.len(), 0, "a deleted Shoto came back");
		assert_eq!(payloads::<CompanionCreated>(&created), Vec::new());
		assert_eq!(outcome_of(&app), LaunchOutcome::default());
	}

	#[tokio::test]
	async fn without_the_personal_space_nothing_is_planted_and_the_refusal_is_announced() {
		let app = a_host("spaceless");
		let database = database_of(&app);
		database.spaces().create("Work".to_owned()).await.expect("the second space");
		database.spaces().delete(PERSONAL_SPACE_ID.to_owned()).await.expect("the deletion");
		let refused = heard(&app, SEED_REFUSED_EVENT);

		seeded(&app, database).await;

		assert_eq!(database.conversations().bots(None).await.expect("the roster").len(), 0);
		assert!(!database.user().is_first_companion_seeded().await.expect("the marker"));
		assert_eq!(
			payloads::<CompanionSeedRefused>(&refused),
			vec![CompanionSeedRefused { reason: Refusal::NoPersonalSpace.reason() }]
		);
	}

	#[tokio::test]
	async fn a_bundle_that_cannot_be_written_leaves_no_row_no_picture_and_no_marker() {
		let app = a_host("unwritable");
		let database = database_of(&app);
		a_file_standing_at(&bundles::root(app.handle()).expect("the bundle root"));
		let refused = heard(&app, SEED_REFUSED_EVENT);

		seeded(&app, database).await;

		assert_eq!(database.conversations().bots(None).await.expect("the roster").len(), 0);
		assert!(!database.user().is_first_companion_seeded().await.expect("the marker"));
		let preferences = database.user().preferences().await.expect("the preferences");
		assert_eq!(preferences.onboarding_shoto_id, None);
		let dir = avatars::Avatars::dir(app.handle()).expect("the avatars directory");
		assert_eq!(fs::read_dir(&dir).expect("the directory reads").count(), 0);
		let reasons = payloads::<CompanionSeedRefused>(&refused);
		assert_eq!(reasons.len(), 1, "got {reasons:?}");
		assert!(!reasons[0].reason.contains("stayed behind"), "got {reasons:?}");
	}

	#[tokio::test]
	async fn a_picture_that_cannot_be_written_leaves_no_row_and_no_marker_and_is_announced() {
		let app = a_host("pictureless");
		let database = database_of(&app);
		let dir = avatars::Avatars::dir(app.handle()).expect("the avatars directory");
		a_file_standing_at(&dir);
		let refused = heard(&app, SEED_REFUSED_EVENT);

		seeded(&app, database).await;

		assert_eq!(database.conversations().bots(None).await.expect("the roster").len(), 0);
		assert!(!database.user().is_first_companion_seeded().await.expect("the marker"));
		assert_eq!(fs::read(&dir).expect("the file still stands"), b"not a directory");
		let reasons = payloads::<CompanionSeedRefused>(&refused);
		assert_eq!(reasons.len(), 1, "got {reasons:?}");
		assert!(reasons[0].reason.starts_with("its picture was refused"), "got {reasons:?}");
		assert!(!reasons[0].reason.contains("stayed behind"), "got {reasons:?}");
	}

	#[tokio::test]
	async fn a_database_that_already_holds_a_companion_receives_no_second_one_and_no_notice() {
		let app = a_host("adopted");
		let database = database_of(&app);
		a_companion(database).await;
		let created = heard(&app, CREATED_EVENT);
		let refused = heard(&app, SEED_REFUSED_EVENT);

		let roster = planted(&app, database).await;

		assert_eq!(roster.len(), 1, "a second companion was planted");
		assert_ne!(roster[0].name, shoto::NAME);
		let root = bundles::root(app.handle()).expect("the bundle root");
		assert!(
			bundles::lookup(&root, &roster[0].id).expect("the plugins list").is_none(),
			"a bundle was written"
		);
		assert!(database.user().is_first_companion_seeded().await.expect("the marker"));
		let preferences = database.user().preferences().await.expect("the preferences");
		assert!(preferences.first_run_done);
		assert_eq!(preferences.onboarding_step, OnboardingStep::Done);
		assert_eq!(preferences.onboarding_shoto_id, None);
		assert_eq!(payloads::<CompanionCreated>(&created), Vec::new());
		assert_eq!(payloads::<CompanionSeedRefused>(&refused), Vec::new());
		assert_eq!(outcome_of(&app), LaunchOutcome::default());
	}

	#[tokio::test]
	async fn a_database_whose_retired_companion_still_holds_a_row_receives_no_replacement() {
		let app = a_host("emptied");
		let database = database_of(&app);
		let retired = a_companion_seated_in_a_mission(database).await;
		database.conversations().delete_bot(retired.id).await.expect("the deletion");

		seeded(&app, database).await;

		assert_eq!(database.conversations().bots(None).await.expect("the roster").len(), 0);
		assert!(database.user().is_first_companion_seeded().await.expect("the marker"));
		assert!(database.user().preferences().await.expect("the preferences").first_run_done);
	}

	#[tokio::test]
	async fn an_existing_shoto_without_a_title_receives_guide_once_and_no_other_bot_moves() {
		let app = a_host("backfill-empty");
		let database = database_of(&app);
		let shoto = an_existing_shoto_titled(database, "").await;
		let other = a_bot(database, "Kept", "").await;

		seeded(&app, database).await;

		assert_eq!(title_of(database, &shoto).await, shoto::TITLE);
		assert_eq!(title_of(database, &other).await, "");
	}

	#[tokio::test]
	async fn an_existing_shoto_whose_title_was_changed_keeps_it() {
		let app = a_host("backfill-kept");
		let database = database_of(&app);
		let shoto = an_existing_shoto_titled(database, "Mentor").await;

		seeded(&app, database).await;

		assert_eq!(title_of(database, &shoto).await, "Mentor");
		retitled(database, &shoto, "").await;
		seeded(&app, database).await;
		assert_eq!(title_of(database, &shoto).await, "", "a recorded backfill ran again");
	}

	#[tokio::test]
	async fn a_title_cleared_after_the_backfill_stays_empty_on_the_next_start() {
		let app = a_host("backfill-cleared");
		let database = database_of(&app);
		let shoto = an_existing_shoto_titled(database, "").await;
		seeded(&app, database).await;
		retitled(database, &shoto, "").await;

		seeded(&app, database).await;

		assert_eq!(title_of(database, &shoto).await, "");
	}

	#[tokio::test]
	async fn without_a_recorded_shoto_the_oldest_bot_named_shoto_receives_guide() {
		let app = a_host("backfill-oldest");
		let database = database_of(&app);
		let oldest = a_bot(database, shoto::NAME, "").await;
		tokio::time::sleep(std::time::Duration::from_millis(5)).await;
		let younger = a_bot(database, shoto::NAME, "").await;
		database.user().mark_first_companion_seeded().await.expect("the seed marker");

		seeded(&app, database).await;

		assert_eq!(
			database.user().preferences().await.expect("the preferences").onboarding_shoto_id,
			None
		);
		assert_eq!(title_of(database, &oldest).await, shoto::TITLE);
		assert_eq!(title_of(database, &younger).await, "");
	}

	#[tokio::test]
	async fn a_profile_without_any_shoto_records_the_backfill_and_titles_nobody() {
		let app = a_host("backfill-none");
		let database = database_of(&app);
		let other = a_bot(database, "Kept", "").await;
		database.user().mark_first_companion_seeded().await.expect("the seed marker");
		seeded(&app, database).await;
		let late = a_bot(database, shoto::NAME, "").await;

		seeded(&app, database).await;

		assert_eq!(title_of(database, &other).await, "");
		assert_eq!(title_of(database, &late).await, "", "a recorded backfill ran again");
	}
}
