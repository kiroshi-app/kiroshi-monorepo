use std::path::{Path, PathBuf};

use super::archive;
use super::contract::{CompanionCounts, Space, SpaceDescribed, SpaceError, SpacePreferences};
use crate::bundles;
use crate::conversations::commands::{announce_joined, announce_left, list_bundles};
use crate::conversations::contract::Hue;
use crate::db;
use crate::environment;
use crate::events;
use crate::hosting;
use crate::library;

pub fn ready(state: &db::DatabaseState) -> Result<&db::Database, SpaceError> {
	state.as_ref().map_err(|failure| SpaceError::Unavailable { failure: failure.into() })
}

pub async fn space_list(core: &crate::core_context::Core) -> Result<Vec<Space>, SpaceError> {
	crate::spaces::read::list_spaces(core).await
}

pub async fn space_create(
	core: &crate::core_context::Core,
	name: String,
) -> Result<Space, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let created = database.spaces().create(name).await?;
	let Err(failure) = bundles::space::lay_down(core, &created.id) else {
		return Ok(Space::presented(created, &[]));
	};
	database.spaces().delete(created.id).await?;
	Err(SpaceError::UnwritableBundle { detail: failure.to_string() })
}

pub async fn space_update(
	core: &crate::core_context::Core,
	id: String,
	name: String,
	colour: Option<i64>,
) -> Result<Space, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let colour = colour
		.map(|asked| Hue::new(asked).ok_or_else(|| SpaceError::unknown_colour(asked)))
		.transpose()?;
	let database = ready(&state)?;
	let previous = database.space_hosting().registration(id.clone()).await?;
	let updated = database.spaces().update(id, name, colour).await?;
	let is_relabelled = (&previous.name, previous.colour) != (&updated.name, updated.colour);
	if is_relabelled {
		let described = SpaceDescribed {
			space_id: updated.id.clone(),
			name: updated.name.clone(),
			colour: updated.colour,
		};
		core.clone().spawn(announced_once_listed(core.clone(), previous.instance_id, described));
	}
	let hostings = database.space_hosting().hostings().await?;
	Ok(Space::presented(updated, &hostings))
}

async fn announced_once_listed(
	core: crate::core_context::Core,
	instance_id: Option<String>,
	described: SpaceDescribed,
) {
	if let Some(instance_id) = instance_id {
		hosting::described(&core, &instance_id, &described.name, described.colour).await;
	}
	let space_id = described.space_id.clone();
	if let Err(error) = core.emit(events::SPACE_DESCRIBED, described) {
		log::warn!("the description of space {space_id} was not announced: {error}");
	}
}

pub async fn space_reorder(
	core: &crate::core_context::Core,
	ids: Vec<String>,
) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.spaces().reorder(ids).await?)
}

pub async fn space_delete(core: &crate::core_context::Core, id: String) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	hosting::forgotten(core, &id).await;
	let held_bots = database.spaces().delete(id.clone()).await?;
	bundles::space::remove(core, &id);
	library::forget_space(core, &id);
	forget_bundles(bundles::root(core).as_deref(), database, &held_bots).await;
	environment::store::forget_space(core, &id, &held_bots);
	Ok(())
}

pub async fn space_export(
	core: &crate::core_context::Core,
	id: String,
	path: String,
) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let places = archive::Places::of(core)?;
	let rows = database.space_rows().read(id.clone()).await?;
	archive::export(places, id, rows, PathBuf::from(path)).await
}

pub async fn space_import(
	core: &crate::core_context::Core,
	path: String,
) -> Result<Space, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let imported =
		archive::import(archive::Places::of(core)?, database, PathBuf::from(path)).await?;
	list_bundles(bundles::root(core).as_deref(), database).await;
	Ok(imported)
}

pub async fn space_preferences(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<SpacePreferences, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?.space_settings().preferences(space_id).await.map(SpacePreferences::from)?)
}

pub async fn space_set_preferences(
	core: &crate::core_context::Core,
	space_id: String,
	preferences: SpacePreferences,
) -> Result<SpacePreferences, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	Ok(ready(&state)?
		.space_settings()
		.set_preferences(space_id, preferences.into())
		.await
		.map(SpacePreferences::from)?)
}

pub async fn space_companion_counts(
	core: &crate::core_context::Core,
	space_id: String,
) -> Result<Vec<CompanionCounts>, SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let bot_ids = ready(&state)?.spaces().companions(space_id).await?;
	Ok(counted_companions(bundles::root(core).as_deref(), bot_ids))
}

fn counted_companions(root: Option<&Path>, bot_ids: Vec<String>) -> Vec<CompanionCounts> {
	bot_ids
		.into_iter()
		.map(|bot_id| {
			let (skills, applications) = match root {
				Some(root) => (
					bundles::skills(root, &bot_id).len(),
					bundles::mcp_servers(root, &bot_id).len(),
				),
				None => (0, 0),
			};
			CompanionCounts {
				bot_id,
				skills_count: skills as u64,
				applications_count: applications as u64,
			}
		})
		.collect()
}

async fn forget_bundles(root: Option<&Path>, database: &db::Database, bot_ids: &[String]) {
	if let Some(root) = root {
		for bot_id in bot_ids {
			bundles::remove(root, bot_id);
		}
	}
	list_bundles(root, database).await;
}

pub async fn bot_move_to_space(
	core: &crate::core_context::Core,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	let held_by = database.conversations().bot_space_ids(bot_id.clone()).await?;
	database.spaces().move_bot(bot_id.clone(), space_id.clone()).await?;
	for left in held_by.into_iter().filter(|held| *held != space_id) {
		announce_left(core, &bot_id, left);
	}
	announce_joined(core, database, &bot_id).await;
	Ok(())
}

pub async fn bot_add_to_space(
	core: &crate::core_context::Core,
	bot_id: String,
	space_id: String,
	section_id: Option<String>,
) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	let database = ready(&state)?;
	database.spaces().add_bot(bot_id.clone(), space_id, section_id).await?;
	announce_joined(core, database, &bot_id).await;
	Ok(())
}

pub async fn bot_remove_from_space(
	core: &crate::core_context::Core,
	bot_id: String,
	space_id: String,
) -> Result<(), SpaceError> {
	let state = core.state::<db::DatabaseState>();
	ready(&state)?.spaces().remove_bot(bot_id.clone(), space_id.clone()).await?;
	announce_left(core, &bot_id, space_id);
	Ok(())
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::path::PathBuf;

	use super::*;
	use crate::db::connection::fixture_root;
	use crate::db::repositories::conversations::{Bot, BotIdentity};
	use crate::plugins::commands::{plugin_mcp_servers, plugin_skills};
	use crate::plugins::contract::PluginScope;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_core::{a_core_of_its_own, CoreOfItsOwn};

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
		a_stored_bot_of(database, space_id, name).await.id
	}

	async fn a_stored_bot_of(database: &db::Database, space_id: &str, name: &str) -> Bot {
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
	}

	fn a_host(name: &str) -> CoreOfItsOwn {
		let app = a_core_of_its_own(&format!("space-commands-{name}"));
		crate::db::install(&*app);
		app
	}

	fn a_skill(name: &str) -> bundles::SkillDraft {
		bundles::SkillDraft {
			name: name.to_owned(),
			description: format!("{name} on demand"),
			body: "Do it.".to_owned(),
			front: bundles::SkillFront::default(),
		}
	}

	fn an_application(root: &Path, bot: &Bot, name: &str) {
		let config = serde_json::json!({ "command": name });
		bundles::set_mcp_server(root, bot, name, &config, None).expect("the application lands");
	}

	async fn counted_by_plugin(app: &CoreOfItsOwn, bot_id: &str) -> (u64, u64) {
		let scope = PluginScope::Bot { id: bot_id.to_owned() };
		let core = &*app;
		let skills = plugin_skills(core, scope.clone()).await.expect("the skills read");
		let servers = plugin_mcp_servers(core, scope).await.expect("the servers read");
		(skills.len() as u64, servers.len() as u64)
	}

	#[tokio::test]
	async fn every_companion_of_a_space_answers_its_skills_and_applications_counts() {
		let app = a_host("companion-counts");
		let database = app.state::<db::DatabaseState>().inner().as_ref().expect("the database");
		let root = bundles::root(&*app).expect("the bundles have a home");
		let vocca = database.spaces().create("Vocca".to_owned()).await.expect("a space");
		let elsewhere = database.spaces().create("Elsewhere".to_owned()).await.expect("a space");

		let equipped = a_stored_bot_of(database, &vocca.id, "Bean").await;
		bundles::write(&root, &equipped).expect("the bundle is written");
		bundles::create_skill(&root, &equipped, &a_skill("triage")).expect("a skill");
		bundles::create_skill(&root, &equipped, &a_skill("digest")).expect("a skill");
		an_application(&root, &equipped, "clock");
		let bare = a_bot_of(database, &vocca.id, "Sprout").await;
		let shared = a_stored_bot_of(database, &elsewhere.id, "Pip").await;
		bundles::write(&root, &shared).expect("the bundle is written");
		an_application(&root, &shared, "weather");
		database
			.spaces()
			.add_bot(shared.id.clone(), vocca.id.clone(), None)
			.await
			.expect("the bot is shared");
		a_bot_of(database, &elsewhere.id, "Stranger").await;

		let counts =
			space_companion_counts(&*app, vocca.id.clone()).await.expect("the counts read");

		let by_bot = |bot_id: &str| {
			counts
				.iter()
				.find(|entry| entry.bot_id == bot_id)
				.map(|entry| (entry.skills_count, entry.applications_count))
		};
		assert_eq!(counts.len(), 3, "got {counts:?}");
		assert_eq!(by_bot(&equipped.id), Some((2, 1)));
		assert_eq!(by_bot(&bare), Some((0, 0)));
		assert_eq!(by_bot(&shared.id), Some((0, 1)));
		for entry in &counts {
			assert_eq!(
				counted_by_plugin(&app, &entry.bot_id).await,
				(entry.skills_count, entry.applications_count),
				"the counts drift from the plugin readers for {}",
				entry.bot_id
			);
		}
	}

	#[tokio::test]
	async fn an_unknown_space_answers_an_error_rather_than_no_companion() {
		let app = a_host("companion-counts-unknown");

		let failure = space_companion_counts(&*app, "nowhere".to_owned())
			.await
			.expect_err("the space is unknown");

		assert_eq!(failure, SpaceError::UnknownSpace { id: "nowhere".to_owned() });
	}

	#[tokio::test]
	async fn a_space_whose_plugin_cannot_be_laid_down_leaves_no_row_behind() {
		let app = a_host("plugin-refused");
		let data = app.data_dir().to_path_buf();
		fs::create_dir_all(&data).expect("the data dir stands");
		fs::write(data.join("spaces"), "not a directory").expect("the blocking file lands");

		let failure =
			space_create(&*app, "Vocca".to_owned()).await.expect_err("the space is refused");

		assert!(matches!(failure, SpaceError::UnwritableBundle { .. }), "got {failure:?}");
		let listed = space_list(&*app).await.expect("the spaces read");
		assert!(!listed.iter().any(|space| space.name == "Vocca"), "got {listed:?}");
	}

	async fn shared_by_name(app: &CoreOfItsOwn) -> Vec<(String, bool)> {
		let listed = space_list(&*app).await.expect("the spaces read");
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
	async fn a_listed_space_carries_its_registered_instance_until_it_has_none() {
		let app = a_host("instances");
		let state = app.state::<db::DatabaseState>();
		let database = ready(&state).expect("the database");
		let vocca = database.spaces().create("Vocca".to_owned()).await.expect("a space");
		let studio = database.spaces().create("Studio".to_owned()).await.expect("a space");
		let hosting = database.space_hosting();
		hosting.registered(vocca.id.clone(), "instance-vocca".to_owned()).await.expect("stored");
		hosting.set_hosted(vocca.id.clone(), false).await.expect("unhosted");

		let listed = space_list(&*app).await.expect("the spaces read");
		let instance_of = |id: &str| {
			listed.iter().find(|space| space.id == id).expect("listed").instance_id.clone()
		};

		assert_eq!(instance_of(&vocca.id).as_deref(), Some("instance-vocca"));
		assert_eq!(instance_of(&studio.id), None);
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
