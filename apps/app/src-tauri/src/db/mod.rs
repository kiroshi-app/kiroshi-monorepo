pub mod connection;
pub mod migrations;
pub mod repositories;
pub mod result_code;

use std::path::Path;
use std::sync::{Arc, Mutex, MutexGuard};

use rusqlite::Connection;
use tauri::{AppHandle, Runtime};

pub use connection::DatabaseError;
use connection::Located as _;
use repositories::{
	messages, ApplicationInstallsRepository, CatalogueRepository, ConversationsRepository,
	JoinedSpaceMembersRepository, JoinedSpacesRepository, MessagesRepository, MissionsRepository,
	RelayDevicesRepository, RoutinesRepository, RuntimeContextRepository, SearchRepository,
	SectionsRepository, SpaceChildrenRepository, SpaceHostingRepository, SpaceRelayRepository,
	SpaceRowsRepository, SpaceSettingsRepository, SpacesRepository, UserRepository,
};

#[derive(Clone)]
struct Access {
	connection: Arc<Mutex<Connection>>,
}

impl Access {
	fn new(connection: Connection) -> Self {
		Self { connection: Arc::new(Mutex::new(connection)) }
	}

	async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		let connection = self.connection.clone();
		tokio::task::spawn_blocking(move || {
			let connection = locked(&connection)?;
			f(&connection)
		})
		.await
		.map_err(|_| DatabaseError::CallInterrupted)?
	}

	async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		let connection = self.connection.clone();
		tokio::task::spawn_blocking(move || {
			let mut connection = locked(&connection)?;
			f(&mut connection)
		})
		.await
		.map_err(|_| DatabaseError::CallInterrupted)?
	}
}

fn locked(
	connection: &Arc<Mutex<Connection>>,
) -> Result<MutexGuard<'_, Connection>, DatabaseError> {
	connection.lock().map_err(|_| DatabaseError::PoisonedConnection)
}

pub type DatabaseState = Result<Database, DatabaseError>;

pub struct Database {
	access: Access,
	application_installs: ApplicationInstallsRepository,
	catalogue: CatalogueRepository,
	conversations: ConversationsRepository,
	joined_space_members: JoinedSpaceMembersRepository,
	joined_spaces: JoinedSpacesRepository,
	messages: MessagesRepository,
	missions: MissionsRepository,
	relay_devices: RelayDevicesRepository,
	routines: RoutinesRepository,
	runtime_context: RuntimeContextRepository,
	search: SearchRepository,
	sections: SectionsRepository,
	space_children: SpaceChildrenRepository,
	space_hosting: SpaceHostingRepository,
	space_relay: SpaceRelayRepository,
	space_rows: SpaceRowsRepository,
	space_settings: SpaceSettingsRepository,
	spaces: SpacesRepository,
	user: UserRepository,
}

impl Database {
	fn open(path: &Path) -> DatabaseState {
		let mut connection = connection::open(path)?;
		migrations::apply(&mut connection)?;
		messages::sweep_unfinished(&mut connection).at("sweep_unfinished", "messages")?;
		let access = Access::new(connection);
		Ok(Self {
			application_installs: ApplicationInstallsRepository::new(access.clone()),
			catalogue: CatalogueRepository::new(access.clone()),
			conversations: ConversationsRepository::new(access.clone()),
			joined_space_members: JoinedSpaceMembersRepository::new(access.clone()),
			joined_spaces: JoinedSpacesRepository::new(access.clone()),
			messages: MessagesRepository::new(access.clone()),
			missions: MissionsRepository::new(access.clone()),
			relay_devices: RelayDevicesRepository::new(access.clone()),
			routines: RoutinesRepository::new(access.clone()),
			runtime_context: RuntimeContextRepository::new(access.clone()),
			search: SearchRepository::new(access.clone()),
			sections: SectionsRepository::new(access.clone()),
			space_children: SpaceChildrenRepository::new(access.clone()),
			space_hosting: SpaceHostingRepository::new(access.clone()),
			space_relay: SpaceRelayRepository::new(access.clone()),
			space_rows: SpaceRowsRepository::new(access.clone()),
			space_settings: SpaceSettingsRepository::new(access.clone()),
			spaces: SpacesRepository::new(access.clone()),
			user: UserRepository::new(access.clone()),
			access,
		})
	}

	pub async fn call<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call(f).await
	}

	pub async fn call_mut<F, T>(&self, f: F) -> Result<T, DatabaseError>
	where
		F: FnOnce(&mut Connection) -> Result<T, DatabaseError> + Send + 'static,
		T: Send + 'static,
	{
		self.access.call_mut(f).await
	}

	pub fn application_installs(&self) -> &ApplicationInstallsRepository {
		&self.application_installs
	}

	pub fn catalogue(&self) -> &CatalogueRepository {
		&self.catalogue
	}

	pub fn conversations(&self) -> &ConversationsRepository {
		&self.conversations
	}

	pub fn joined_space_members(&self) -> &JoinedSpaceMembersRepository {
		&self.joined_space_members
	}

	pub fn joined_spaces(&self) -> &JoinedSpacesRepository {
		&self.joined_spaces
	}

	pub fn messages(&self) -> &MessagesRepository {
		&self.messages
	}

	pub fn missions(&self) -> &MissionsRepository {
		&self.missions
	}

	pub fn routines(&self) -> &RoutinesRepository {
		&self.routines
	}

	pub fn runtime_context(&self) -> &RuntimeContextRepository {
		&self.runtime_context
	}

	pub fn search(&self) -> &SearchRepository {
		&self.search
	}

	pub fn sections(&self) -> &SectionsRepository {
		&self.sections
	}

	pub fn space_hosting(&self) -> &SpaceHostingRepository {
		&self.space_hosting
	}

	pub fn space_relay(&self) -> &SpaceRelayRepository {
		&self.space_relay
	}

	pub fn relay_devices(&self) -> &RelayDevicesRepository {
		&self.relay_devices
	}

	pub fn space_children(&self) -> &SpaceChildrenRepository {
		&self.space_children
	}

	pub fn space_rows(&self) -> &SpaceRowsRepository {
		&self.space_rows
	}

	pub fn space_settings(&self) -> &SpaceSettingsRepository {
		&self.space_settings
	}

	pub fn spaces(&self) -> &SpacesRepository {
		&self.spaces
	}

	pub fn user(&self) -> &UserRepository {
		&self.user
	}

	pub async fn referenced_avatar_paths(&self) -> Result<Vec<String>, DatabaseError> {
		let mut referenced = self.conversations.avatar_image_paths().await?;
		referenced.extend(self.user.avatar_image_path().await?);
		Ok(referenced)
	}
}

pub fn bootstrap<R: Runtime>(app: &AppHandle<R>) -> DatabaseState {
	Database::open(&connection::file(app)?)
}

#[cfg(test)]
pub(crate) fn open(dir: &Path) -> Database {
	Database::open(&dir.join(connection::FILE_NAME)).expect("the database opens")
}

#[cfg(test)]
pub(in crate::db) async fn count_of(database: &Database, table: &'static str) -> u32 {
	database
		.call(move |connection| {
			Ok(connection
				.query_row(&format!("SELECT count(*) FROM {table}"), [], |row| row.get(0))?)
		})
		.await
		.expect("query")
}

#[cfg(test)]
mod tests {
	use std::fs;
	use std::time::Duration;

	use futures_util::FutureExt;

	use super::connection::{is_busy, temp_dir, FILE_NAME};
	use super::*;

	const CONTENDED_TIMEOUT: Duration = Duration::from_millis(300);
	const DEADLINE: Duration = Duration::from_secs(10);

	async fn version(database: &Database) -> u32 {
		database.call(migrations::version).await.expect("version")
	}

	async fn journal_mode(database: &Database) -> String {
		database
			.call(|connection| {
				Ok(connection.pragma_query_value(None, "journal_mode", |row| row.get(0))?)
			})
			.await
			.expect("journal mode")
	}

	async fn object_count(database: &Database) -> u32 {
		database
			.call(|connection| {
				Ok(connection
					.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0))?)
			})
			.await
			.expect("query")
	}

	const A_CONVERSATION: &str =
		"INSERT INTO conversations (id, kind, title, created_at, updated_at)
		VALUES ('c1', 'main', 'First', 1, 1)";

	#[tokio::test]
	async fn a_fresh_path_becomes_a_database_at_the_latest_version() {
		let dir = temp_dir();

		let database = open(&dir);

		assert!(dir.join(FILE_NAME).exists(), "no file was created");
		assert_eq!(version(&database).await, migrations::latest_version());
		assert_eq!(
			journal_mode(&database).await,
			"wal",
			"a crash mid-write would cost the whole file"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn reopening_leaves_the_schema_and_the_version_as_they_were() {
		let dir = temp_dir();
		let first = open(&dir);
		let version_after_install = version(&first).await;
		let objects_after_install = object_count(&first).await;
		drop(first);

		let second = open(&dir);

		assert_eq!(version(&second).await, version_after_install, "a step ran twice");
		assert_eq!(
			object_count(&second).await,
			objects_after_install,
			"reopening duplicated an object"
		);

		drop(second);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_call_waiting_on_the_file_leaves_the_runtime_free() {
		let dir = temp_dir();
		let database = open(&dir);
		database
			.call(|connection| Ok(connection.busy_timeout(CONTENDED_TIMEOUT)?))
			.await
			.expect("busy timeout");
		let holder = connection::open(&dir.join(FILE_NAME)).expect("a second connection");
		holder.execute_batch("BEGIN EXCLUSIVE;").expect("the write lock is held");

		let mut contended = Box::pin(database.call_mut(|connection| {
			let transaction = connection.transaction()?;
			transaction.execute(A_CONVERSATION, [])?;
			transaction.commit()?;
			Ok(())
		}));
		let is_held_by_the_call = contended.as_mut().now_or_never().is_some();
		let blocked = tokio::time::timeout(DEADLINE, contended).await;

		assert!(!is_held_by_the_call, "the runtime was held by a database call");
		let refused =
			blocked.expect("the call never came back").expect_err("the write was accepted");
		assert!(is_busy(&refused), "the contended write failed as something else: {refused:?}");

		drop(holder);
		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_write_spanning_two_statements_lands_whole_or_not_at_all() {
		let dir = temp_dir();
		let database = open(&dir);

		let landed = database
			.call_mut(|connection| {
				let transaction = connection.transaction()?;
				transaction.execute(A_CONVERSATION, [])?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t1', 'c1', 1, 1)",
					[],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await;

		assert!(landed.is_ok(), "a transaction of two good statements was refused: {landed:?}");
		assert_eq!(count_of(&database, "turns").await, 1);

		let torn = database
			.call_mut(|connection| {
				let transaction = connection.transaction()?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t2', 'c1', 2, 2)",
					[],
				)?;
				transaction.execute(
					"INSERT INTO turns (id, conversation_id, seq, started_at)
						VALUES ('t3', 'c1', 2, 3)",
					[],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await;

		assert!(torn.is_err(), "two turns took the same seq");
		assert_eq!(count_of(&database, "turns").await, 1, "half a transaction stayed behind");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[tokio::test]
	async fn a_call_that_panics_is_reported_instead_of_taking_the_host_down() {
		let dir = temp_dir();
		let database = open(&dir);

		let interrupted: Result<(), DatabaseError> =
			database.call(|_| panic!("a query gave up under the lock")).await;
		let after = database.call(migrations::version).await;

		assert!(
			matches!(interrupted, Err(DatabaseError::CallInterrupted)),
			"a panicking call answered something else: {interrupted:?}"
		);
		assert!(
			matches!(after, Err(DatabaseError::PoisonedConnection)),
			"a call after a panic was served from a connection nobody vouches for: {after:?}"
		);

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}

	#[cfg(unix)]
	#[test]
	fn the_database_and_what_it_journals_through_are_reachable_by_their_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let dir = temp_dir();
		let database = open(&dir);

		for suffix in ["", "-wal", "-shm"] {
			let path = dir.join(format!("{FILE_NAME}{suffix}"));
			let mode = fs::metadata(&path).expect("metadata").permissions().mode();
			assert_eq!(mode & 0o777, 0o600, "{path:?} must not be world readable");
		}

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
