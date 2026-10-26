use std::path::{Path, PathBuf};

use tauri::{AppHandle, Runtime, State};

use super::archive;
use super::contract::{Space, SpaceError, SpacePreferences};
use crate::bundles;
use crate::conversations::commands::{announce_joined, announce_left, list_bundles};
use crate::conversations::contract::AvatarBlot;
use crate::db;
use crate::environment;
use crate::hosting;

pub(crate) fn ready(state: &db::DatabaseState) -> Result<&db::Database, SpaceError> {
	state.as_ref().map_err(|failure| SpaceError::Unavailable { failure: failure.into() })
}

#[tauri::command]
#[specta::specta]
pub async fn space_list(state: State<'_, db::DatabaseState>) -> Result<Vec<Space>, SpaceError> {
	let database = ready(&state)?;
	let stored = database.spaces().list().await?;
	let hosted = database.space_hosting().hosted_space_ids().await?;
	Ok(stored.into_iter().map(|space| Space::presented(space, &hosted)).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn space_create<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	name: String,
) -> Result<Space, SpaceError> {
	let database = ready(&state)?;
	let created = database.spaces().create(name).await?;
	let Err(failure) = bundles::space::lay_down(&app, &created.id) else {
		return Ok(Space::presented(created, &[]));
	};
	database.spaces().delete(created.id).await?;
	Err(SpaceError::UnwritableBundle { detail: failure.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn space_update<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	name: String,
	colour: Option<AvatarBlot>,
) -> Result<Space, SpaceError> {
	let database = ready(&state)?;
	let previous = database.space_hosting().registration(id.clone()).await?;
	let updated = database.spaces().update(id, name, colour.map(Into::into)).await?;
	let is_relabelled = (&previous.name, previous.colour) != (&updated.name, updated.colour);
	if let (true, Some(instance_id)) = (is_relabelled, &previous.instance_id) {
		hosting::described(&app, instance_id, &updated.name, updated.colour).await;
	}
	let hosted = database.space_hosting().hosted_space_ids().await?;
	Ok(Space::presented(updated, &hosted))
}

#[tauri::command]
#[specta::specta]
pub async fn space_reorder(
	state: State<'_, db::DatabaseState>,
	ids: Vec<String>,
) -> Result<(), SpaceError> {
	Ok(ready(&state)?.spaces().reorder(ids).await?)
}

#[tauri::command]
#[specta::specta]
pub async fn space_delete<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<(), SpaceError> {
	let database = ready(&state)?;
	hosting::forgotten(&app, &id).await;
	let held_bots = database.spaces().delete(id.clone()).await?;
	bundles::space::remove(&app, &id);
	forget_bundles(bundles::root(&app).as_deref(), database, &held_bots).await;
	environment::store::forget_space(&app, &id, &held_bots);
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn space_export<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	id: String,
	path: String,
) -> Result<(), SpaceError> {
	let database = ready(&state)?;
	let places = archive::Places::of(&app)?;
	let rows = database.space_rows().read(id.clone()).await?;
	archive::export(places, id, rows, PathBuf::from(path)).await
}

#[tauri::command]
#[specta::specta]
pub async fn space_import<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	path: String,
) -> Result<Space, SpaceError> {
	let database = ready(&state)?;
	let imported =
		archive::import(archive::Places::of(&app)?, database, PathBuf::from(path)).await?;
	list_bundles(bundles::root(&app).as_deref(), database).await;
	Ok(imported)
}

#[tauri::command]
#[specta::specta]
pub async fn space_preferences(
	state: State<'_, db::DatabaseState>,
	space_id: String,
) -> Result<SpacePreferences, SpaceError> {
	Ok(ready(&state)?.space_settings().preferences(space_id).await.map(SpacePreferences::from)?)
}

#[tauri::command]
#[specta::specta]
pub async fn space_set_preferences(
	state: State<'_, db::DatabaseState>,
	space_id: String,
	preferences: SpacePreferences,
) -> Result<SpacePreferences, SpaceError> {
	Ok(ready(&state)?
		.space_settings()
		.set_preferences(space_id, preferences.into())
		.await
		.map(SpacePreferences::from)?)
}

async fn forget_bundles(root: Option<&Path>, database: &db::Database, bot_ids: &[String]) {
	if let Some(root) = root {
		for bot_id in bot_ids {
			bundles::remove(root, bot_id);
		}
	}
	list_bundles(root, database).await;
}

#[tauri::command]
#[specta::specta]
pub async fn bot_move_to_space<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	let database = ready(&state)?;
	let held_by = database.conversations().bot_space_ids(bot_id.clone()).await?;
	database.spaces().move_bot(bot_id.clone(), space_id.clone()).await?;
	for left in held_by.into_iter().filter(|held| *held != space_id) {
		announce_left(&app, &bot_id, left);
	}
	announce_joined(&app, database, &bot_id).await;
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn bot_add_to_space<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: String,
	section_id: Option<String>,
) -> Result<(), SpaceError> {
	let database = ready(&state)?;
	database.spaces().add_bot(bot_id.clone(), space_id, section_id).await?;
	announce_joined(&app, database, &bot_id).await;
	Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn bot_remove_from_space<R: Runtime>(
	app: AppHandle<R>,
	state: State<'_, db::DatabaseState>,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	ready(&state)?.spaces().remove_bot(bot_id.clone(), space_id.clone()).await?;
	announce_left(&app, &bot_id, space_id);
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use super::*;
	use crate::db::connection::fixture_root;
	use crate::db::repositories::conversations::BotIdentity;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};
	use tauri::test::mock_builder;
	use tauri::Manager;

	fn a_root(name: &str) -> RemovedOnDrop {
		fixture_root(&format!("space-bundles-{name}"))
	}

	fn bundle_name(slug: &str, bot_id: &str) -> String {
		format!("{slug}-{}", &bot_id[..8])
	}

	fn a_bundle(root: &Path, bot_id: &str) -> PathBuf {
		let bundle = root.join("plugins").join(format!("bundle-{bot_id}"));
		fs::create_dir_all(&bundle).expect("the bundle stands");
		bundle
	}

	fn a_database(root: &Path) -> db::Database {
		fs::create_dir_all(root).expect("the root stands");
		db::open(root)
	}

	async fn a_bot_of(database: &db::Database, space_id: &str, name: &str) -> String {
		let identity = BotIdentity {
			name: name.to_owned(),
			title: String::new(),
			model: "sonnet".to_owned(),
			avatar_blot: None,
			avatar_image_path: None,
			instructions: "Answer briefly.".to_owned(),
			denied_tools: Vec::new(),
			effort: None,
		};
		database
			.conversations()
			.create_bot(identity, Some(space_id.to_owned()), None)
			.await
			.expect("the bot is created")
			.id
	}

	fn a_host(name: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own(&format!("space-commands-{name}"), mock_builder());
		app.manage(db::bootstrap(app.handle()));
		app
	}

	#[tokio::test]
	async fn a_space_whose_plugin_cannot_be_laid_down_leaves_no_row_behind() {
		let app = a_host("plugin-refused");
		let data = app.path().app_data_dir().expect("the data dir is named");
		fs::create_dir_all(&data).expect("the data dir stands");
		fs::write(data.join("spaces"), "not a directory").expect("the blocking file lands");

		let failure = space_create(app.handle().clone(), app.state(), "Vocca".to_owned())
			.await
			.expect_err("the space is refused");

		assert!(matches!(failure, SpaceError::UnwritableBundle { .. }), "got {failure:?}");
		let listed = space_list(app.state()).await.expect("the spaces read");
		assert!(!listed.iter().any(|space| space.name == "Vocca"), "got {listed:?}");
	}

	async fn shared_by_name(app: &AppOfItsOwn) -> Vec<(String, bool)> {
		let listed = space_list(app.state()).await.expect("the spaces read");
		let listed = serde_json::to_value(listed).expect("the spaces serialize");
		let rows = listed.as_array().expect("a space list");
		rows.iter()
			.map(|row| {
				let name = row["name"].as_str().expect("a name").to_owned();
				(name, row["shared"].as_bool().expect("a shared flag"))
			})
			.filter(|(name, _)| name == "Vocca" || name == "Studio")
			.collect()
	}

	#[tokio::test]
	async fn turning_the_hosting_of_one_space_on_and_off_shares_that_space_alone() {
		let app = a_host("shared");
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database");
		let vocca = database.spaces().create("Vocca".to_owned()).await.expect("a space");
		database.spaces().create("Studio".to_owned()).await.expect("a space");
		let named = |vocca: bool| vec![("Vocca".to_owned(), vocca), ("Studio".to_owned(), false)];

		assert_eq!(shared_by_name(&app).await, named(false));

		database.space_hosting().set_hosted(vocca.id.clone(), true).await.expect("hosted");
		assert_eq!(shared_by_name(&app).await, named(true));

		database.space_hosting().set_hosted(vocca.id, false).await.expect("unhosted");
		assert_eq!(shared_by_name(&app).await, named(false));
	}

	#[tokio::test]
	async fn the_bundles_the_deletion_cascaded_leave_the_disk() {
		let root = a_root("cascaded");
		let database = a_database(&root);
		let held = a_bundle(&root, "b1");
		let other = a_bundle(&root, "b2");
		let kept = a_bundle(&root, "b3");

		forget_bundles(Some(&root), &database, &["b1".to_owned(), "b2".to_owned()]).await;

		assert!(!held.exists());
		assert!(!other.exists());
		assert!(kept.exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn a_bundle_that_is_already_gone_does_not_hold_back_the_next_one() {
		let root = a_root("absent");
		let database = a_database(&root);
		let held = a_bundle(&root, "b2");

		forget_bundles(Some(&root), &database, &["b1".to_owned(), "b2".to_owned()]).await;

		assert!(!held.exists());

		let _ = fs::remove_dir_all(&root);
	}

	#[tokio::test]
	async fn a_deleted_space_leaves_the_marketplace_listing_only_the_bots_that_remain() {
		let root = a_root("marketplace");
		let database = a_database(&root);
		let leaving = database.spaces().create("Leaving".to_owned()).await.expect("a space");
		let staying = database.spaces().create("Staying".to_owned()).await.expect("a space");
		let cascaded = a_bot_of(&database, &leaving.id, "Bean").await;
		let kept = a_bot_of(&database, &staying.id, "Sprout").await;

		let held_bots =
			database.spaces().delete(leaving.id.clone()).await.expect("the space is deleted");
		forget_bundles(Some(&root), &database, &held_bots).await;

		let listed =
			fs::read_to_string(bundles::marketplace_file(&root)).expect("the marketplace is there");
		assert!(!listed.contains(&bundle_name("bean", &cascaded)), "got {listed}");
		assert!(listed.contains(&bundle_name("sprout", &kept)), "got {listed}");
		assert!(bundles::lookup(&root, &cascaded).expect("the plugins list").is_none());

		let _ = fs::remove_dir_all(&root);
	}
}
