use std::collections::{BTreeMap, BTreeSet};

use std::sync::LazyLock;

use rusqlite::types::Type;
use rusqlite::{Connection, Transaction, TransactionBehavior};

use super::settings::Settings;
use crate::db::{Access, DatabaseError};

const DISPLAY_NAME_KEY: &str = "user.display_name";
const AVATAR_IMAGE_PATH_KEY: &str = "user.avatar_image_path";
const COLOR_SCHEME_KEY: &str = "user.color_scheme";
const LANGUAGE_KEY: &str = "user.language";
const NOTIFY_ON_QUESTION_KEY: &str = "user.notify_on_question";
const NOTIFY_ON_PERMISSION_KEY: &str = "user.notify_on_permission";
const NOTIFY_ON_FINISHED_TURN_KEY: &str = "user.notify_on_finished_turn";
const NOTIFY_WITH_SOUND_KEY: &str = "user.notify_with_sound";
const SIDEBAR_WIDTH_KEY: &str = "user.sidebar_width";
const SIDEBAR_TAB_KEY: &str = "user.sidebar_tab";
const ACTIVITY_PANEL_OPEN_KEY: &str = "user.activity_panel_open";
const FIRST_RUN_DONE_KEY: &str = "user.first_run_done";
const LAST_SPACE_ID_KEY: &str = "user.last_space_id";
const LAST_BOT_ID_BY_SPACE_KEY: &str = "user.last_bot_id_by_space";
const DROPPED_LAST_BOT_ID_KEY: &str = "user.last_bot_id";
const UPDATE_CHANNEL_KEY: &str = "user.update_channel";
const SHOW_WHATS_NEW_KEY: &str = "user.show_whats_new";
const LAST_SEEN_VERSION_KEY: &str = "user.last_seen_version";
const ONBOARDING_STEP_KEY: &str = "user.onboarding_step";
const ONBOARDING_IMPORT_SEEN_KEY: &str = "user.onboarding_import_seen";

const FIRST_COMPANION_SEEDED_KEY: &str = "app.first_companion_seeded";
const LAST_WINDOW_RANK_KEY: &str = "app.last_window_rank";
const CLAUDE_IMPORTED_KEY: &str = "app.claude_imported";

const UNREADABLE_WINDOW_RANK: &str = "the last window rank does not read as a count";

const SWITCH_ON: &str = "on";
const SWITCH_OFF: &str = "off";

static SETTINGS: LazyLock<Settings> = LazyLock::new(|| Settings::new("app_settings", None));

fn switch_as_stored(is_on: bool) -> &'static str {
	if is_on {
		SWITCH_ON
	} else {
		SWITCH_OFF
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum ColorScheme {
	#[default]
	System,
	Light,
	Dark,
}

impl ColorScheme {
	fn as_stored(self) -> &'static str {
		match self {
			ColorScheme::System => "system",
			ColorScheme::Light => "light",
			ColorScheme::Dark => "dark",
		}
	}

	fn of(stored: &str) -> Self {
		match stored {
			"light" => ColorScheme::Light,
			"dark" => ColorScheme::Dark,
			_ => ColorScheme::System,
		}
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum SidebarTab {
	#[default]
	Conversations,
	Missions,
	Companions,
	Applications,
}

impl SidebarTab {
	fn as_stored(self) -> &'static str {
		match self {
			SidebarTab::Conversations => "conversations",
			SidebarTab::Missions => "missions",
			SidebarTab::Companions => "companions",
			SidebarTab::Applications => "applications",
		}
	}

	fn of(stored: &str) -> Self {
		match stored {
			"missions" => SidebarTab::Missions,
			"companions" => SidebarTab::Companions,
			"applications" => SidebarTab::Applications,
			_ => SidebarTab::Conversations,
		}
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum UpdateChannel {
	#[default]
	Stable,
	Beta,
}

impl UpdateChannel {
	fn as_stored(self) -> &'static str {
		match self {
			UpdateChannel::Stable => "stable",
			UpdateChannel::Beta => "beta",
		}
	}

	fn of(stored: &str) -> Self {
		match stored {
			"beta" => UpdateChannel::Beta,
			_ => UpdateChannel::Stable,
		}
	}
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum OnboardingStep {
	#[default]
	Welcome,
	Connect,
	Import,
	Account,
	Done,
}

impl OnboardingStep {
	fn as_stored(self) -> &'static str {
		match self {
			OnboardingStep::Welcome => "welcome",
			OnboardingStep::Connect => "connect",
			OnboardingStep::Import => "import",
			OnboardingStep::Account => "account",
			OnboardingStep::Done => "done",
		}
	}

	fn known(stored: &str) -> Option<Self> {
		match stored {
			"welcome" => Some(OnboardingStep::Welcome),
			"connect" => Some(OnboardingStep::Connect),
			"import" => Some(OnboardingStep::Import),
			"account" => Some(OnboardingStep::Account),
			"done" => Some(OnboardingStep::Done),
			_ => None,
		}
	}

	fn implied_by(is_first_run_done: bool) -> Self {
		if is_first_run_done {
			OnboardingStep::Done
		} else {
			OnboardingStep::Welcome
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Preferences {
	pub display_name: String,
	pub avatar_image_path: Option<String>,
	pub color_scheme: ColorScheme,
	pub language: Option<String>,
	pub notify_on_question: bool,
	pub notify_on_permission: bool,
	pub notify_on_finished_turn: bool,
	pub notify_with_sound: bool,
	pub sidebar_width: Option<u32>,
	pub sidebar_tab: SidebarTab,
	pub activity_panel_open: bool,
	pub first_run_done: bool,
	pub last_space_id: Option<String>,
	pub last_bot_id_by_space: BTreeMap<String, String>,
	pub update_channel: UpdateChannel,
	pub show_whats_new: bool,
	pub last_seen_version: Option<String>,
	pub onboarding_step: OnboardingStep,
	pub onboarding_import_seen: bool,
}

impl Default for Preferences {
	fn default() -> Self {
		Self {
			display_name: String::new(),
			avatar_image_path: None,
			color_scheme: ColorScheme::default(),
			language: None,
			notify_on_question: true,
			notify_on_permission: true,
			notify_on_finished_turn: true,
			notify_with_sound: true,
			sidebar_width: None,
			sidebar_tab: SidebarTab::default(),
			activity_panel_open: false,
			first_run_done: false,
			last_space_id: None,
			last_bot_id_by_space: BTreeMap::new(),
			update_channel: UpdateChannel::default(),
			show_whats_new: true,
			last_seen_version: None,
			onboarding_step: OnboardingStep::default(),
			onboarding_import_seen: false,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PictureSwap {
	pub stored: Preferences,
	pub previous: Option<String>,
}

pub struct UserRepository {
	access: Access,
}

impl UserRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn preferences(&self) -> Result<Preferences, DatabaseError> {
		self.access.call(stored_in).await
	}

	pub async fn set_preferences(
		&self,
		preferences: Preferences,
	) -> Result<Preferences, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				write_in(&transaction, &preferences)?;
				let stored = stored_in(&transaction)?;
				transaction.commit()?;
				Ok(stored)
			})
			.await
	}

	pub async fn swap_avatar_image_path(
		&self,
		path: Option<String>,
	) -> Result<PictureSwap, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				let previous = setting_in(&transaction, AVATAR_IMAGE_PATH_KEY)?;
				write_picture_in(&transaction, path.as_deref())?;
				let stored = stored_in(&transaction)?;
				transaction.commit()?;
				Ok(PictureSwap { stored, previous })
			})
			.await
	}

	pub async fn avatar_image_path(&self) -> Result<Option<String>, DatabaseError> {
		self.access.call(|connection| setting_in(connection, AVATAR_IMAGE_PATH_KEY)).await
	}

	pub async fn is_first_companion_seeded(&self) -> Result<bool, DatabaseError> {
		self.access.call(|connection| switch_on_in(connection, FIRST_COMPANION_SEEDED_KEY)).await
	}

	pub async fn mark_first_companion_seeded(&self) -> Result<(), DatabaseError> {
		self.mark_switch_on(FIRST_COMPANION_SEEDED_KEY).await
	}

	pub async fn mark_first_run_done(&self) -> Result<(), DatabaseError> {
		self.access
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				write_switch_in(&transaction, FIRST_RUN_DONE_KEY, true)?;
				write_onboarding_step_in(&transaction, OnboardingStep::Done)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}

	pub async fn set_onboarding_step(
		&self,
		step: OnboardingStep,
	) -> Result<Preferences, DatabaseError> {
		self.write_then_read(move |transaction| write_onboarding_step_in(transaction, step)).await
	}

	pub async fn mark_onboarding_import_seen(&self) -> Result<Preferences, DatabaseError> {
		self.write_then_read(|transaction| {
			write_switch_in(transaction, ONBOARDING_IMPORT_SEEN_KEY, true)
		})
		.await
	}

	pub async fn hand_out_window_rank(&self) -> Result<u64, DatabaseError> {
		self.access
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				let rank = rank_after(setting_in(&transaction, LAST_WINDOW_RANK_KEY)?)?;
				SETTINGS.write(&transaction, None, LAST_WINDOW_RANK_KEY, &rank.to_string())?;
				transaction.commit()?;
				Ok(rank)
			})
			.await
	}

	pub async fn claude_imported(&self) -> Result<BTreeSet<String>, DatabaseError> {
		self.access.call(claude_imported_in).await
	}

	pub async fn mark_claude_imported(&self, key: String) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				let mut imported = claude_imported_in(&transaction)?;
				imported.insert(key);
				let stored = serde_json::to_string(&imported).map_err(unreadable_mark)?;
				SETTINGS.write(&transaction, None, CLAUDE_IMPORTED_KEY, &stored)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}

	async fn write_then_read<F>(&self, write: F) -> Result<Preferences, DatabaseError>
	where
		F: FnOnce(&Transaction<'_>) -> Result<(), DatabaseError> + Send + 'static,
	{
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				write(&transaction)?;
				let stored = stored_in(&transaction)?;
				transaction.commit()?;
				Ok(stored)
			})
			.await
	}

	async fn mark_switch_on(&self, key: &'static str) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				write_switch_in(&transaction, key, true)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}
}

fn write_transaction(connection: &mut Connection) -> Result<Transaction<'_>, DatabaseError> {
	Ok(connection.transaction_with_behavior(TransactionBehavior::Immediate)?)
}

fn stored_in(connection: &Connection) -> Result<Preferences, DatabaseError> {
	let defaults = Preferences::default();
	let first_run_done = switch_on_in(connection, FIRST_RUN_DONE_KEY)?;
	Ok(Preferences {
		display_name: setting_in(connection, DISPLAY_NAME_KEY)?.unwrap_or(defaults.display_name),
		avatar_image_path: setting_in(connection, AVATAR_IMAGE_PATH_KEY)?,
		color_scheme: setting_in(connection, COLOR_SCHEME_KEY)?
			.map_or(defaults.color_scheme, |stored| ColorScheme::of(&stored)),
		language: setting_in(connection, LANGUAGE_KEY)?,
		notify_on_question: switch_in(connection, NOTIFY_ON_QUESTION_KEY)?,
		notify_on_permission: switch_in(connection, NOTIFY_ON_PERMISSION_KEY)?,
		notify_on_finished_turn: switch_in(connection, NOTIFY_ON_FINISHED_TURN_KEY)?,
		notify_with_sound: switch_in(connection, NOTIFY_WITH_SOUND_KEY)?,
		sidebar_width: setting_in(connection, SIDEBAR_WIDTH_KEY)?
			.and_then(|stored| stored.parse().ok()),
		sidebar_tab: setting_in(connection, SIDEBAR_TAB_KEY)?
			.map_or(defaults.sidebar_tab, |stored| SidebarTab::of(&stored)),
		activity_panel_open: switch_on_in(connection, ACTIVITY_PANEL_OPEN_KEY)?,
		first_run_done,
		last_space_id: setting_in(connection, LAST_SPACE_ID_KEY)?,
		last_bot_id_by_space: setting_in(connection, LAST_BOT_ID_BY_SPACE_KEY)?
			.and_then(|stored| serde_json::from_str(&stored).ok())
			.unwrap_or_default(),
		update_channel: setting_in(connection, UPDATE_CHANNEL_KEY)?
			.map_or(defaults.update_channel, |stored| UpdateChannel::of(&stored)),
		show_whats_new: switch_in(connection, SHOW_WHATS_NEW_KEY)?,
		last_seen_version: setting_in(connection, LAST_SEEN_VERSION_KEY)?,
		onboarding_step: setting_in(connection, ONBOARDING_STEP_KEY)?
			.and_then(|stored| OnboardingStep::known(&stored))
			.unwrap_or(OnboardingStep::implied_by(first_run_done)),
		onboarding_import_seen: switch_on_in(connection, ONBOARDING_IMPORT_SEEN_KEY)?,
	})
}

fn switch_in(connection: &Connection, key: &str) -> Result<bool, DatabaseError> {
	Ok(setting_in(connection, key)?.is_none_or(|stored| stored != SWITCH_OFF))
}

fn switch_on_in(connection: &Connection, key: &str) -> Result<bool, DatabaseError> {
	Ok(setting_in(connection, key)?.is_some_and(|stored| stored == SWITCH_ON))
}

fn setting_in(connection: &Connection, key: &str) -> Result<Option<String>, DatabaseError> {
	SETTINGS.read(connection, None, key)
}

fn claude_imported_in(connection: &Connection) -> Result<BTreeSet<String>, DatabaseError> {
	let Some(stored) = setting_in(connection, CLAUDE_IMPORTED_KEY)? else {
		return Ok(BTreeSet::new());
	};
	serde_json::from_str(&stored).map_err(unreadable_mark)
}

fn unreadable_mark(failure: serde_json::Error) -> DatabaseError {
	rusqlite::Error::FromSqlConversionFailure(0, Type::Text, failure.into()).into()
}

fn rank_after(last: Option<String>) -> Result<u64, DatabaseError> {
	let Some(last) = last else {
		return Ok(1);
	};
	last.parse::<u64>().ok().and_then(|rank| rank.checked_add(1)).ok_or_else(|| {
		rusqlite::Error::FromSqlConversionFailure(0, Type::Text, UNREADABLE_WINDOW_RANK.into())
			.into()
	})
}

fn write_in(transaction: &Transaction<'_>, preferences: &Preferences) -> Result<(), DatabaseError> {
	SETTINGS.write(transaction, None, DISPLAY_NAME_KEY, &preferences.display_name)?;
	SETTINGS.write(transaction, None, COLOR_SCHEME_KEY, preferences.color_scheme.as_stored())?;
	write_optional_in(transaction, LANGUAGE_KEY, preferences.language.as_deref())?;
	write_switch_in(transaction, NOTIFY_ON_QUESTION_KEY, preferences.notify_on_question)?;
	write_switch_in(transaction, NOTIFY_ON_PERMISSION_KEY, preferences.notify_on_permission)?;
	write_switch_in(transaction, NOTIFY_ON_FINISHED_TURN_KEY, preferences.notify_on_finished_turn)?;
	write_switch_in(transaction, NOTIFY_WITH_SOUND_KEY, preferences.notify_with_sound)?;
	let width = preferences.sidebar_width.map(|width| width.to_string());
	write_optional_in(transaction, SIDEBAR_WIDTH_KEY, width.as_deref())?;
	SETTINGS.write(transaction, None, SIDEBAR_TAB_KEY, preferences.sidebar_tab.as_stored())?;
	write_switch_in(transaction, ACTIVITY_PANEL_OPEN_KEY, preferences.activity_panel_open)?;
	write_switch_in(transaction, FIRST_RUN_DONE_KEY, preferences.first_run_done)?;
	write_optional_in(transaction, LAST_SPACE_ID_KEY, preferences.last_space_id.as_deref())?;
	let bots_by_space = bots_by_space_as_stored(&preferences.last_bot_id_by_space);
	write_optional_in(transaction, LAST_BOT_ID_BY_SPACE_KEY, bots_by_space.as_deref())?;
	SETTINGS.write(
		transaction,
		None,
		UPDATE_CHANNEL_KEY,
		preferences.update_channel.as_stored(),
	)?;
	write_switch_in(transaction, SHOW_WHATS_NEW_KEY, preferences.show_whats_new)?;
	let last_seen_version = preferences.last_seen_version.as_deref();
	write_optional_in(transaction, LAST_SEEN_VERSION_KEY, last_seen_version)?;
	SETTINGS.clear(transaction, None, DROPPED_LAST_BOT_ID_KEY)?;
	write_picture_in(transaction, preferences.avatar_image_path.as_deref())
}

fn bots_by_space_as_stored(entries: &BTreeMap<String, String>) -> Option<String> {
	if entries.is_empty() {
		return None;
	}
	serde_json::to_string(entries).ok()
}

fn write_switch_in(
	transaction: &Transaction<'_>,
	key: &str,
	is_on: bool,
) -> Result<(), DatabaseError> {
	SETTINGS.write(transaction, None, key, switch_as_stored(is_on))
}

fn write_onboarding_step_in(
	transaction: &Transaction<'_>,
	step: OnboardingStep,
) -> Result<(), DatabaseError> {
	SETTINGS.write(transaction, None, ONBOARDING_STEP_KEY, step.as_stored())
}

fn write_picture_in(
	transaction: &Transaction<'_>,
	path: Option<&str>,
) -> Result<(), DatabaseError> {
	write_optional_in(transaction, AVATAR_IMAGE_PATH_KEY, path)
}

fn write_optional_in(
	transaction: &Transaction<'_>,
	key: &str,
	value: Option<&str>,
) -> Result<(), DatabaseError> {
	match value {
		Some(value) => SETTINGS.write(transaction, None, key, value),
		None => SETTINGS.clear(transaction, None, key),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::{open, Database};

	fn a_record() -> Preferences {
		Preferences {
			display_name: "Nyx".to_owned(),
			avatar_image_path: Some("/data/avatars/one.png".to_owned()),
			color_scheme: ColorScheme::Dark,
			language: Some("fr".to_owned()),
			notify_on_question: false,
			notify_on_permission: true,
			notify_on_finished_turn: false,
			notify_with_sound: false,
			sidebar_width: Some(320),
			sidebar_tab: SidebarTab::Missions,
			activity_panel_open: true,
			first_run_done: true,
			last_space_id: Some("space-one".to_owned()),
			last_bot_id_by_space: BTreeMap::from([
				("space-one".to_owned(), "bot-one".to_owned()),
				("space-two".to_owned(), "bot-two".to_owned()),
			]),
			update_channel: UpdateChannel::Beta,
			show_whats_new: false,
			last_seen_version: Some("0.24.1".to_owned()),
			onboarding_step: OnboardingStep::Done,
			onboarding_import_seen: false,
		}
	}

	async fn setting(database: &Database, key: &'static str) -> Option<String> {
		database.call(move |connection| setting_in(connection, key)).await.expect("the read")
	}

	#[tokio::test]
	async fn a_record_nobody_has_written_reads_as_the_defaults() {
		let dir = temp_dir();
		let database = open(&dir);

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(
			read,
			Preferences {
				display_name: String::new(),
				avatar_image_path: None,
				color_scheme: ColorScheme::System,
				language: None,
				notify_on_question: true,
				notify_on_permission: true,
				notify_on_finished_turn: true,
				notify_with_sound: true,
				sidebar_width: None,
				sidebar_tab: SidebarTab::Conversations,
				activity_panel_open: false,
				first_run_done: false,
				last_space_id: None,
				last_bot_id_by_space: BTreeMap::new(),
				update_channel: UpdateChannel::Stable,
				show_whats_new: true,
				last_seen_version: None,
				onboarding_step: OnboardingStep::Welcome,
				onboarding_import_seen: false,
			}
		);
	}

	#[tokio::test]
	async fn a_written_record_is_answered_and_read_back_whole() {
		let dir = temp_dir();
		let database = open(&dir);

		let answered = database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(answered, a_record());
		assert_eq!(database.user().preferences().await.expect("the record"), a_record());
	}

	#[tokio::test]
	async fn a_second_write_replaces_every_field_of_the_first() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_preferences(a_record()).await.expect("the first write");

		let replaced = database
			.user()
			.set_preferences(Preferences::default())
			.await
			.expect("the second write");

		assert_eq!(replaced, Preferences::default());
		assert_eq!(
			setting(&database, AVATAR_IMAGE_PATH_KEY).await,
			None,
			"a picture taken off the record was left in the file"
		);
		assert_eq!(
			setting(&database, LANGUAGE_KEY).await,
			None,
			"a language taken off the record was left in the file"
		);
		assert_eq!(
			setting(&database, SIDEBAR_WIDTH_KEY).await,
			None,
			"a sidebar width taken off the record was left in the file"
		);
		assert_eq!(
			setting(&database, LAST_BOT_ID_BY_SPACE_KEY).await,
			None,
			"a bot per space taken off the record was left in the file"
		);
		assert_eq!(
			setting(&database, LAST_SEEN_VERSION_KEY).await,
			None,
			"a last seen version taken off the record was left in the file"
		);
	}

	#[tokio::test]
	async fn a_write_sweeps_the_single_last_bot_an_older_build_left_behind() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, DROPPED_LAST_BOT_ID_KEY, "bot-one")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the older build's row");

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(setting(&database, DROPPED_LAST_BOT_ID_KEY).await, None);
	}

	#[tokio::test]
	async fn a_bot_per_space_that_cannot_be_read_reads_as_no_space_naming_a_bot() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, LAST_BOT_ID_BY_SPACE_KEY, "{not json")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.last_bot_id_by_space, BTreeMap::new());
	}

	#[tokio::test]
	async fn a_value_that_cannot_be_read_as_its_type_reads_as_nothing_and_stays_in_the_file() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, SIDEBAR_WIDTH_KEY, "wide")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted values");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.sidebar_width, None);
		assert_eq!(setting(&database, SIDEBAR_WIDTH_KEY).await, Some("wide".to_owned()));
	}

	#[tokio::test]
	async fn a_panel_state_that_is_neither_on_nor_off_reads_as_a_closed_panel() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, ACTIVITY_PANEL_OPEN_KEY, "maybe")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert!(!read.activity_panel_open);
	}

	#[tokio::test]
	async fn an_open_panel_is_still_open_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			database
				.user()
				.set_preferences(Preferences { activity_panel_open: true, ..a_record() })
				.await
				.expect("the write");
		}

		let database = open(&dir);

		assert!(database.user().preferences().await.expect("the record").activity_panel_open);
	}

	#[tokio::test]
	async fn a_closed_panel_is_still_closed_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			database
				.user()
				.set_preferences(Preferences { activity_panel_open: true, ..a_record() })
				.await
				.expect("the first write");
			database
				.user()
				.set_preferences(Preferences { activity_panel_open: false, ..a_record() })
				.await
				.expect("the second write");
		}

		let database = open(&dir);

		assert!(!database.user().preferences().await.expect("the record").activity_panel_open);
	}

	#[tokio::test]
	async fn a_first_run_that_was_marked_done_is_still_done_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			assert!(
				!database.user().preferences().await.expect("the record").first_run_done,
				"a first run nobody has been through reads as done"
			);
			database
				.user()
				.set_preferences(Preferences { first_run_done: true, ..Preferences::default() })
				.await
				.expect("the write");
		}

		let database = open(&dir);

		assert!(database.user().preferences().await.expect("the record").first_run_done);
	}

	async fn planted(database: &Database, key: &'static str, value: &'static str) {
		database
			.call_mut(move |connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, key, value)?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");
	}

	#[tokio::test]
	async fn a_set_onboarding_step_is_answered_and_still_set_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			let answered = database
				.user()
				.set_onboarding_step(OnboardingStep::Import)
				.await
				.expect("the write");
			assert_eq!(answered.onboarding_step, OnboardingStep::Import);
		}

		let database = open(&dir);

		let read = database.user().preferences().await.expect("the record");
		assert_eq!(read.onboarding_step, OnboardingStep::Import);
	}

	#[tokio::test]
	async fn an_onboarding_set_back_to_welcome_leaves_the_first_run_and_the_import_mark_alone() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().mark_first_run_done().await.expect("the first run");
		database.user().mark_onboarding_import_seen().await.expect("the import mark");

		let replayed =
			database.user().set_onboarding_step(OnboardingStep::Welcome).await.expect("the replay");

		assert_eq!(replayed.onboarding_step, OnboardingStep::Welcome);
		assert!(replayed.first_run_done);
		assert!(replayed.onboarding_import_seen);
	}

	#[tokio::test]
	async fn a_marked_import_is_answered_seen_and_still_seen_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			let answered = database.user().mark_onboarding_import_seen().await.expect("the mark");
			assert!(answered.onboarding_import_seen);
		}

		let database = open(&dir);

		assert!(database.user().preferences().await.expect("the record").onboarding_import_seen);
	}

	#[tokio::test]
	async fn without_a_stored_step_a_finished_first_run_reads_as_a_finished_onboarding() {
		let dir = temp_dir();
		let database = open(&dir);
		planted(&database, FIRST_RUN_DONE_KEY, SWITCH_ON).await;

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.onboarding_step, OnboardingStep::Done);
		assert!(!read.onboarding_import_seen);
	}

	#[tokio::test]
	async fn without_a_stored_step_an_unfinished_first_run_reads_as_the_welcome_step() {
		let dir = temp_dir();
		let database = open(&dir);
		planted(&database, FIRST_RUN_DONE_KEY, SWITCH_OFF).await;

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.onboarding_step, OnboardingStep::Welcome);
		assert!(!read.onboarding_import_seen);
	}

	#[tokio::test]
	async fn a_step_outside_the_vocabulary_after_a_finished_first_run_reads_as_done() {
		let dir = temp_dir();
		let database = open(&dir);
		planted(&database, FIRST_RUN_DONE_KEY, SWITCH_ON).await;
		planted(&database, ONBOARDING_STEP_KEY, "tour").await;

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.onboarding_step, OnboardingStep::Done);
	}

	#[tokio::test]
	async fn a_step_outside_the_vocabulary_before_a_finished_first_run_reads_as_welcome() {
		let dir = temp_dir();
		let database = open(&dir);
		planted(&database, FIRST_RUN_DONE_KEY, SWITCH_OFF).await;
		planted(&database, ONBOARDING_STEP_KEY, "tour").await;

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.onboarding_step, OnboardingStep::Welcome);
	}

	#[tokio::test]
	async fn a_write_of_the_record_leaves_the_onboarding_step_and_the_import_mark_alone() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_onboarding_step(OnboardingStep::Account).await.expect("the step");

		let answered = database
			.user()
			.set_preferences(Preferences {
				onboarding_step: OnboardingStep::Done,
				onboarding_import_seen: true,
				..a_record()
			})
			.await
			.expect("the write");

		assert_eq!(answered.onboarding_step, OnboardingStep::Account);
		assert!(!answered.onboarding_import_seen);
	}

	#[tokio::test]
	async fn a_first_run_marked_done_stores_a_finished_onboarding_beside_it() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_onboarding_step(OnboardingStep::Account).await.expect("the step");

		database.user().mark_first_run_done().await.expect("the mark");

		let read = database.user().preferences().await.expect("the record");
		assert!(read.first_run_done);
		assert_eq!(read.onboarding_step, OnboardingStep::Done);
		assert_eq!(setting(&database, ONBOARDING_STEP_KEY).await, Some("done".to_owned()));
	}

	#[tokio::test]
	async fn the_seed_marker_is_off_until_it_is_marked_and_stays_out_of_the_record() {
		let dir = temp_dir();
		let database = open(&dir);

		assert!(!database.user().is_first_companion_seeded().await.expect("the marker"));

		database.user().mark_first_companion_seeded().await.expect("the mark");

		assert!(database.user().is_first_companion_seeded().await.expect("the marker"));
		assert_eq!(setting(&database, FIRST_COMPANION_SEEDED_KEY).await, Some("on".to_owned()));
		assert!(
			!database.user().preferences().await.expect("the record").first_run_done,
			"the seed marker was read as the first run flag"
		);
	}

	#[tokio::test]
	async fn a_write_of_the_record_leaves_the_seed_marker_alone() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().mark_first_companion_seeded().await.expect("the mark");

		database.user().set_preferences(Preferences::default()).await.expect("the write");

		assert!(database.user().is_first_companion_seeded().await.expect("the marker"));
	}

	#[tokio::test]
	async fn swapping_the_picture_answers_the_path_it_replaced() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_preferences(a_record()).await.expect("the write");

		let swapped = database
			.user()
			.swap_avatar_image_path(Some("/data/avatars/two.png".to_owned()))
			.await
			.expect("the swap");

		assert_eq!(swapped.previous, a_record().avatar_image_path);
		assert_eq!(swapped.stored.avatar_image_path, Some("/data/avatars/two.png".to_owned()));
		assert_eq!(swapped.stored.display_name, "Nyx", "a picture write moved another field");
	}

	#[tokio::test]
	async fn the_sweep_is_told_about_the_picture_the_record_points_at() {
		let dir = temp_dir();
		let database = open(&dir);

		assert_eq!(database.user().avatar_image_path().await.expect("the path"), None);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(
			database.user().avatar_image_path().await.expect("the path"),
			a_record().avatar_image_path
		);
	}

	#[tokio::test]
	async fn a_scheme_outside_the_three_words_reads_as_following_the_system() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, COLOR_SCHEME_KEY, "sepia")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.color_scheme, ColorScheme::System);
	}

	#[tokio::test]
	async fn a_written_tab_is_stored_as_its_lowercase_name() {
		let dir = temp_dir();
		let database = open(&dir);

		database
			.user()
			.set_preferences(Preferences { sidebar_tab: SidebarTab::Applications, ..a_record() })
			.await
			.expect("the write");

		assert_eq!(setting(&database, SIDEBAR_TAB_KEY).await.as_deref(), Some("applications"));
	}

	#[tokio::test]
	async fn a_tab_outside_the_four_names_reads_as_conversations_and_spares_the_rest() {
		let dir = temp_dir();
		let database = open(&dir);
		database.user().set_preferences(a_record()).await.expect("the write");
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, SIDEBAR_TAB_KEY, "Missions")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read, Preferences { sidebar_tab: SidebarTab::Conversations, ..a_record() });
	}

	#[tokio::test]
	async fn a_record_without_a_language_answers_the_rest_of_it() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, DISPLAY_NAME_KEY, "Nyx")?;
				SETTINGS.write(&transaction, None, "user.palette", "moss")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the older build's rows");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.language, None);
		assert_eq!(read.sidebar_width, None);
		assert_eq!(read.last_space_id, None);
		assert_eq!(read.display_name, "Nyx");
		assert!(read.notify_on_question, "a switch the older build never wrote must read as on");
		assert!(read.notify_with_sound, "a switch the older build never wrote must read as on");
	}

	#[tokio::test]
	async fn a_switch_outside_the_two_words_reads_as_notifying() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, NOTIFY_ON_QUESTION_KEY, "maybe")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert!(read.notify_on_question);
	}

	#[tokio::test]
	async fn every_switch_is_stored_under_a_key_of_its_own() {
		let dir = temp_dir();
		let database = open(&dir);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(setting(&database, NOTIFY_ON_QUESTION_KEY).await, Some("off".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_PERMISSION_KEY).await, Some("on".to_owned()));
		assert_eq!(setting(&database, NOTIFY_ON_FINISHED_TURN_KEY).await, Some("off".to_owned()));
		assert_eq!(setting(&database, NOTIFY_WITH_SOUND_KEY).await, Some("off".to_owned()));
		assert_eq!(setting(&database, ACTIVITY_PANEL_OPEN_KEY).await, Some("on".to_owned()));
	}

	#[tokio::test]
	async fn a_language_the_host_has_never_heard_of_is_stored_as_written() {
		let dir = temp_dir();
		let database = open(&dir);

		let stored = database
			.user()
			.set_preferences(Preferences { language: Some("br".to_owned()), ..a_record() })
			.await
			.expect("the write");

		assert_eq!(stored.language, Some("br".to_owned()));
		assert_eq!(
			database.user().preferences().await.expect("the record").language,
			Some("br".to_owned())
		);
	}

	#[tokio::test]
	async fn the_update_preferences_are_stored_under_keys_of_their_own() {
		let dir = temp_dir();
		let database = open(&dir);

		database.user().set_preferences(a_record()).await.expect("the write");

		assert_eq!(setting(&database, UPDATE_CHANNEL_KEY).await.as_deref(), Some("beta"));
		assert_eq!(setting(&database, SHOW_WHATS_NEW_KEY).await.as_deref(), Some("off"));
		assert_eq!(setting(&database, LAST_SEEN_VERSION_KEY).await.as_deref(), Some("0.24.1"));
	}

	#[tokio::test]
	async fn a_channel_outside_the_two_names_reads_as_stable() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, UPDATE_CHANNEL_KEY, "nightly")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		let read = database.user().preferences().await.expect("the record");

		assert_eq!(read.update_channel, UpdateChannel::Stable);
	}

	#[tokio::test]
	async fn window_ranks_count_up_from_one_and_go_on_after_the_file_is_reopened() {
		let dir = temp_dir();
		{
			let database = open(&dir);
			assert_eq!(database.user().hand_out_window_rank().await.expect("the rank"), 1);
			assert_eq!(database.user().hand_out_window_rank().await.expect("the rank"), 2);
		}

		let database = open(&dir);

		assert_eq!(database.user().hand_out_window_rank().await.expect("the rank"), 3);
		assert_eq!(setting(&database, LAST_WINDOW_RANK_KEY).await.as_deref(), Some("3"));
	}

	#[tokio::test]
	async fn window_ranks_asked_for_at_once_are_all_distinct() {
		let dir = temp_dir();
		let database = open(&dir);

		let ranks =
			futures_util::future::join_all((0..8).map(|_| database.user().hand_out_window_rank()))
				.await
				.into_iter()
				.map(|rank| rank.expect("the rank"))
				.collect::<std::collections::BTreeSet<_>>();

		assert_eq!(ranks, (1..=8).collect());
	}

	#[tokio::test]
	async fn a_last_window_rank_that_does_not_read_as_a_count_hands_out_nothing_and_stays() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, LAST_WINDOW_RANK_KEY, "many")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		assert!(database.user().hand_out_window_rank().await.is_err());
		assert_eq!(setting(&database, LAST_WINDOW_RANK_KEY).await.as_deref(), Some("many"));
	}

	#[tokio::test]
	async fn the_claude_import_mark_gathers_every_key_once() {
		let dir = temp_dir();
		let database = open(&dir);

		assert_eq!(database.user().claude_imported().await.expect("the mark"), BTreeSet::new());
		for key in ["agents/one.md", "CLAUDE.md", "agents/one.md"] {
			database.user().mark_claude_imported(key.to_owned()).await.expect("the key is kept");
		}

		assert_eq!(
			database.user().claude_imported().await.expect("the mark"),
			BTreeSet::from(["CLAUDE.md".to_owned(), "agents/one.md".to_owned()])
		);
	}

	#[tokio::test]
	async fn a_claude_import_mark_that_does_not_read_fails_and_stays() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call_mut(|connection| {
				let transaction = write_transaction(connection)?;
				SETTINGS.write(&transaction, None, CLAUDE_IMPORTED_KEY, "{not json")?;
				transaction.commit()?;
				Ok(())
			})
			.await
			.expect("the planted value");

		assert!(database.user().claude_imported().await.is_err());
		assert!(database.user().mark_claude_imported("CLAUDE.md".to_owned()).await.is_err());
		assert_eq!(setting(&database, CLAUDE_IMPORTED_KEY).await.as_deref(), Some("{not json"));
	}
}
