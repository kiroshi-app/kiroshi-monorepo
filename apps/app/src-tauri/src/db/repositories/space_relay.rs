use rusqlite::{params, Connection, OptionalExtension, Row};
use zeroize::Zeroizing;

use crate::db::{Access, DatabaseError};

const UPSERT_ROSTER_ROW: &str = "INSERT INTO space_roster (space_id, device_id, relay_device_id,
	account_id, signing_public_key, agreement_public_key, fingerprint, added_at, signature)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
	ON CONFLICT (space_id, device_id) DO UPDATE SET relay_device_id = excluded.relay_device_id,
		account_id = excluded.account_id, signing_public_key = excluded.signing_public_key,
		agreement_public_key = excluded.agreement_public_key, fingerprint = excluded.fingerprint,
		added_at = excluded.added_at, signature = excluded.signature";

const INSERT_ROSTER_ROW: &str = "INSERT INTO space_roster (space_id, device_id, relay_device_id,
	account_id, signing_public_key, agreement_public_key, fingerprint, added_at, signature)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)";

const SELECT_ROSTER: &str = "SELECT device_id, relay_device_id, account_id,
	signing_public_key, agreement_public_key, fingerprint, added_at, signature
	FROM space_roster WHERE space_id = ?1 ORDER BY device_id";

const SELECT_ROSTER_VERSION: &str = "SELECT version FROM space_roster_versions WHERE space_id = ?1";

const GROW_ROSTER_VERSION: &str = "INSERT INTO space_roster_versions (space_id, version)
	VALUES (?1, 1) ON CONFLICT (space_id) DO UPDATE SET version = version + 1";

const DELETE_ROSTER_ROW: &str = "DELETE FROM space_roster WHERE space_id = ?1 AND device_id = ?2";

const DELETE_ROSTER_OF_ACCOUNT: &str =
	"DELETE FROM space_roster WHERE space_id = ?1 AND account_id = ?2";

const DELETE_UNUSED_JOIN_SECRET: &str = "DELETE FROM space_join_secrets
	WHERE space_id = ?1 AND account_id = ?2 AND used_at IS NULL";

const INSERT_JOIN_SECRET: &str =
	"INSERT INTO space_join_secrets (space_id, account_id, secret) VALUES (?1, ?2, ?3)";

const SELECT_JOIN_SECRETS: &str = "SELECT id, account_id, secret, used_at IS NOT NULL
	FROM space_join_secrets WHERE space_id = ?1 ORDER BY id";

const DELETE_JOIN_SECRETS_OF_ACCOUNT: &str =
	"DELETE FROM space_join_secrets WHERE space_id = ?1 AND account_id = ?2";

const MARK_ROTATION_PENDING: &str =
	"INSERT INTO space_key_rotations (space_id) VALUES (?1) ON CONFLICT (space_id) DO NOTHING";

const SELECT_ROTATION_PENDING: &str = "SELECT 1 FROM space_key_rotations WHERE space_id = ?1";

const DELETE_ROTATION_PENDING: &str = "DELETE FROM space_key_rotations WHERE space_id = ?1";

const SPEND_JOIN_SECRET: &str =
	"UPDATE space_join_secrets SET used_at = ?2 WHERE id = ?1 AND used_at IS NULL";

const SELECT_ROSTER_ROW: &str = "SELECT device_id, relay_device_id, account_id,
	signing_public_key, agreement_public_key, fingerprint, added_at, signature
	FROM space_roster WHERE space_id = ?1 AND device_id = ?2";

const SELECT_ROSTER_ROW_OF_RELAY_DEVICE: &str = "SELECT device_id, relay_device_id, account_id,
	signing_public_key, agreement_public_key, fingerprint, added_at, signature
	FROM space_roster WHERE space_id = ?1 AND relay_device_id = ?2";

const SELECT_ACCEPTED: &str = "SELECT ctr FROM relay_accepted_counters
	WHERE space_id = ?1 AND device_id = ?2 AND key_id = ?3";

const UPSERT_ACCEPTED: &str =
	"INSERT INTO relay_accepted_counters (space_id, device_id, key_id, ctr)
	VALUES (?1, ?2, ?3, ?4)
	ON CONFLICT (space_id, device_id, key_id) DO UPDATE SET ctr = excluded.ctr
	WHERE excluded.ctr > relay_accepted_counters.ctr";

const INSERT_RESERVED: &str = "INSERT INTO relay_reserved_counters (space_id, key_id, reserved)
	VALUES (?1, ?2, 0) ON CONFLICT (space_id, key_id) DO NOTHING";

const RESERVE: &str = "UPDATE relay_reserved_counters SET reserved = reserved + ?3
	WHERE space_id = ?1 AND key_id = ?2 RETURNING reserved";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RosterRow {
	pub device_id: String,
	pub relay_device_id: String,
	pub account_id: String,
	pub signing_public_key: Vec<u8>,
	pub agreement_public_key: Vec<u8>,
	pub fingerprint: String,
	pub added_at: i64,
	pub signature: Vec<u8>,
}

impl RosterRow {
	fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
		Ok(Self {
			device_id: row.get(0)?,
			relay_device_id: row.get(1)?,
			account_id: row.get(2)?,
			signing_public_key: row.get(3)?,
			agreement_public_key: row.get(4)?,
			fingerprint: row.get(5)?,
			added_at: row.get(6)?,
			signature: row.get(7)?,
		})
	}
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Roster {
	pub version: u64,
	pub rows: Vec<RosterRow>,
}

pub struct JoinSecret {
	pub id: i64,
	pub account_id: String,
	pub secret: Zeroizing<Vec<u8>>,
	pub is_used: bool,
}

impl JoinSecret {
	fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
		Ok(Self {
			id: row.get(0)?,
			account_id: row.get(1)?,
			secret: Zeroizing::new(row.get(2)?),
			is_used: row.get(3)?,
		})
	}
}

pub struct SpaceRelayRepository {
	access: Access,
}

impl SpaceRelayRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn rostered(&self, space_id: String, row: RosterRow) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				roster_row_written(&transaction, UPSERT_ROSTER_ROW, &space_id, &row)?;
				roster_grown(&transaction, &space_id)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}

	pub async fn roster(&self, space_id: String) -> Result<Roster, DatabaseError> {
		self.access
			.call(move |connection| {
				let rows = connection
					.prepare_cached(SELECT_ROSTER)?
					.query_map(params![space_id], RosterRow::read)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				let version = connection
					.prepare_cached(SELECT_ROSTER_VERSION)?
					.query_row(params![space_id], counter_of)
					.optional()?
					.unwrap_or(0);
				Ok(Roster { version, rows })
			})
			.await
	}

	pub async fn device_revoked(
		&self,
		space_id: String,
		device_id: String,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				let deleted =
					transaction.execute(DELETE_ROSTER_ROW, params![space_id, device_id])?;
				if deleted > 0 {
					roster_revoked(&transaction, &space_id)?;
				}
				transaction.commit()?;
				Ok(deleted > 0)
			})
			.await
	}

	pub async fn account_revoked(
		&self,
		space_id: String,
		account_id: String,
	) -> Result<usize, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction
					.execute(DELETE_JOIN_SECRETS_OF_ACCOUNT, params![space_id, account_id])?;
				let deleted =
					transaction.execute(DELETE_ROSTER_OF_ACCOUNT, params![space_id, account_id])?;
				if deleted > 0 {
					roster_revoked(&transaction, &space_id)?;
				}
				transaction.commit()?;
				Ok(deleted)
			})
			.await
	}

	pub async fn join_secret_minted(
		&self,
		space_id: String,
		account_id: String,
		secret: Zeroizing<Vec<u8>>,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.execute(DELETE_UNUSED_JOIN_SECRET, params![space_id, account_id])?;
				transaction.execute(
					INSERT_JOIN_SECRET,
					params![space_id, account_id, secret.as_slice()],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}

	pub async fn join_secrets(&self, space_id: String) -> Result<Vec<JoinSecret>, DatabaseError> {
		self.access
			.call(move |connection| {
				let secrets = connection
					.prepare_cached(SELECT_JOIN_SECRETS)?
					.query_map(params![space_id], JoinSecret::read)?
					.collect::<rusqlite::Result<Vec<_>>>()?;
				Ok(secrets)
			})
			.await
	}

	pub async fn is_rotation_pending(&self, space_id: String) -> Result<bool, DatabaseError> {
		self.access
			.call(move |connection| {
				let pending = connection
					.prepare_cached(SELECT_ROTATION_PENDING)?
					.query_row(params![space_id], |_| Ok(()))
					.optional()?;
				Ok(pending.is_some())
			})
			.await
	}

	pub async fn rotation_settled(&self, space_id: String) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(DELETE_ROTATION_PENDING, params![space_id])?;
				Ok(())
			})
			.await
	}

	pub async fn admitted(
		&self,
		space_id: String,
		secret_id: i64,
		used_at: i64,
		row: RosterRow,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				if transaction.execute(SPEND_JOIN_SECRET, params![secret_id, used_at])? == 0 {
					return Ok(false);
				}
				roster_row_written(&transaction, INSERT_ROSTER_ROW, &space_id, &row)?;
				roster_grown(&transaction, &space_id)?;
				transaction.commit()?;
				Ok(true)
			})
			.await
	}

	pub async fn roster_row(
		&self,
		space_id: String,
		device_id: String,
	) -> Result<Option<RosterRow>, DatabaseError> {
		self.roster_row_where(SELECT_ROSTER_ROW, space_id, device_id).await
	}

	pub async fn roster_row_of_relay_device(
		&self,
		space_id: String,
		relay_device_id: String,
	) -> Result<Option<RosterRow>, DatabaseError> {
		self.roster_row_where(SELECT_ROSTER_ROW_OF_RELAY_DEVICE, space_id, relay_device_id).await
	}

	async fn roster_row_where(
		&self,
		select: &'static str,
		space_id: String,
		value: String,
	) -> Result<Option<RosterRow>, DatabaseError> {
		self.access
			.call(move |connection| {
				let row = connection
					.prepare_cached(select)?
					.query_row(params![space_id, value], RosterRow::read)
					.optional()?;
				Ok(row)
			})
			.await
	}

	pub async fn last_accepted(
		&self,
		space_id: String,
		device_id: String,
		key_id: u32,
	) -> Result<Option<u64>, DatabaseError> {
		self.access
			.call(move |connection| {
				let last = connection
					.prepare_cached(SELECT_ACCEPTED)?
					.query_row(params![space_id, device_id, key_id], counter_of)
					.optional()?;
				Ok(last)
			})
			.await
	}

	pub async fn accepted(
		&self,
		space_id: String,
		device_id: String,
		key_id: u32,
		ctr: u64,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let ctr = stored_counter(ctr)?;
				let advanced = connection
					.execute(UPSERT_ACCEPTED, params![space_id, device_id, key_id, ctr])?;
				Ok(advanced == 1)
			})
			.await
	}

	pub async fn counter_started(
		&self,
		space_id: String,
		key_id: u32,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(INSERT_RESERVED, params![space_id, key_id])?;
				Ok(())
			})
			.await
	}

	pub async fn reserved(
		&self,
		space_id: String,
		key_id: u32,
		block: u64,
	) -> Result<Option<u64>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let block = stored_counter(block)?;
				let reserved = connection
					.prepare_cached(RESERVE)?
					.query_row(params![space_id, key_id, block], counter_of)
					.optional()?;
				Ok(reserved)
			})
			.await
	}
}

fn roster_row_written(
	connection: &Connection,
	statement: &str,
	space_id: &str,
	row: &RosterRow,
) -> rusqlite::Result<()> {
	connection.execute(
		statement,
		params![
			space_id,
			row.device_id,
			row.relay_device_id,
			row.account_id,
			row.signing_public_key,
			row.agreement_public_key,
			row.fingerprint,
			row.added_at,
			row.signature
		],
	)?;
	Ok(())
}

fn roster_revoked(connection: &Connection, space_id: &str) -> rusqlite::Result<()> {
	roster_grown(connection, space_id)?;
	connection.execute(MARK_ROTATION_PENDING, params![space_id])?;
	Ok(())
}

fn roster_grown(connection: &Connection, space_id: &str) -> rusqlite::Result<()> {
	connection.execute(GROW_ROSTER_VERSION, params![space_id])?;
	Ok(())
}

fn stored_counter(counter: u64) -> rusqlite::Result<i64> {
	i64::try_from(counter).map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn counter_of(row: &Row<'_>) -> rusqlite::Result<u64> {
	let counter: i64 = row.get(0)?;
	u64::try_from(counter).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(0, counter))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;

	const SPACE: &str = "personal";

	fn a_row(device_id: &str, relay_device_id: &str) -> RosterRow {
		RosterRow {
			device_id: device_id.to_owned(),
			relay_device_id: relay_device_id.to_owned(),
			account_id: "a1".to_owned(),
			signing_public_key: vec![1; 32],
			agreement_public_key: vec![2; 32],
			fingerprint: "six words".to_owned(),
			added_at: 1,
			signature: vec![3; 64],
		}
	}

	#[tokio::test]
	async fn a_roster_row_is_found_by_its_device_and_by_its_relay_device() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		relay.rostered(SPACE.to_owned(), a_row("d1", "r1")).await.expect("stored");

		let by_device = relay.roster_row(SPACE.to_owned(), "d1".to_owned()).await.expect("read");
		let by_relay = relay
			.roster_row_of_relay_device(SPACE.to_owned(), "r1".to_owned())
			.await
			.expect("read");
		let unknown = relay
			.roster_row_of_relay_device(SPACE.to_owned(), "r2".to_owned())
			.await
			.expect("read");

		assert_eq!(by_device, Some(a_row("d1", "r1")));
		assert_eq!(by_relay, Some(a_row("d1", "r1")));
		assert_eq!(unknown, None);
	}

	async fn a_space_of_its_own(database: &crate::db::Database) {
		database
			.call_mut(|connection| {
				connection.execute(
					"INSERT INTO spaces (id, name, position, created_at) VALUES ('shared', 'Shared', 9, 1)",
					[],
				)?;
				Ok(())
			})
			.await
			.expect("a space");
	}

	async fn secrets_of(relay: &SpaceRelayRepository) -> Vec<(String, Vec<u8>, bool)> {
		let secrets = relay.join_secrets(SPACE.to_owned()).await.expect("read");
		secrets
			.into_iter()
			.map(|secret| (secret.account_id, secret.secret.to_vec(), secret.is_used))
			.collect()
	}

	#[tokio::test]
	async fn a_fresh_secret_replaces_the_unused_one_of_its_account_and_a_revocation_drops_them_all()
	{
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		let minted = |account: &str, secret: u8| {
			relay.join_secret_minted(
				SPACE.to_owned(),
				account.to_owned(),
				Zeroizing::new(vec![secret]),
			)
		};

		minted("a1", 1).await.expect("minted");
		let id = relay.join_secrets(SPACE.to_owned()).await.expect("read")[0].id;
		assert!(relay.admitted(SPACE.to_owned(), id, 5, a_row("d1", "r1")).await.expect("spent"));
		minted("a1", 2).await.expect("minted");
		minted("a1", 3).await.expect("minted");
		minted("a2", 4).await.expect("minted");
		let held = secrets_of(relay).await;
		relay.account_revoked(SPACE.to_owned(), "a1".to_owned()).await.expect("withdrawn");

		assert_eq!(
			held,
			vec![
				("a1".to_owned(), vec![1], true),
				("a1".to_owned(), vec![3], false),
				("a2".to_owned(), vec![4], false)
			]
		);
		assert_eq!(secrets_of(relay).await, vec![("a2".to_owned(), vec![4], false)]);
	}

	#[tokio::test]
	async fn two_admissions_racing_on_one_secret_roster_exactly_one_device() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		relay
			.join_secret_minted(SPACE.to_owned(), "a1".to_owned(), Zeroizing::new(vec![1]))
			.await
			.expect("minted");
		let id = relay.join_secrets(SPACE.to_owned()).await.expect("read")[0].id;

		let (first, second) = tokio::join!(
			relay.admitted(SPACE.to_owned(), id, 5, a_row("d1", "r1")),
			relay.admitted(SPACE.to_owned(), id, 5, a_row("d2", "r2")),
		);
		let roster = relay.roster(SPACE.to_owned()).await.expect("read");

		let admitted = [first.expect("written"), second.expect("written")];
		assert_eq!(admitted.iter().filter(|admitted| **admitted).count(), 1);
		assert_eq!(roster.rows.len(), 1);
		assert_eq!(roster.version, 1);
	}

	#[tokio::test]
	async fn the_roster_version_grows_by_one_on_every_roster_change_and_only_then() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		a_space_of_its_own(&database).await;
		let relay = database.space_relay();
		let version = || async { relay.roster(SPACE.to_owned()).await.expect("read").version };

		let unwritten = version().await;
		relay.rostered(SPACE.to_owned(), a_row("d1", "r1")).await.expect("stored");
		relay
			.rostered(
				SPACE.to_owned(),
				RosterRow { account_id: "a2".to_owned(), ..a_row("d2", "r2") },
			)
			.await
			.expect("stored");
		relay
			.rostered(
				SPACE.to_owned(),
				RosterRow { account_id: "a2".to_owned(), ..a_row("d3", "r3") },
			)
			.await
			.expect("stored");
		relay.rostered("shared".to_owned(), a_row("d1", "r1")).await.expect("stored elsewhere");
		let three = version().await;
		let revoked =
			relay.account_revoked(SPACE.to_owned(), "a2".to_owned()).await.expect("revoked");
		let nobody =
			relay.account_revoked(SPACE.to_owned(), "a9".to_owned()).await.expect("revoked");
		let after_account = version().await;
		let device =
			relay.device_revoked(SPACE.to_owned(), "d1".to_owned()).await.expect("revoked");
		let unknown =
			relay.device_revoked(SPACE.to_owned(), "d9".to_owned()).await.expect("revoked");
		let roster = relay.roster(SPACE.to_owned()).await.expect("read");
		let elsewhere = relay.roster("shared".to_owned()).await.expect("read");

		assert_eq!((unwritten, three, after_account), (0, 3, 4));
		assert_eq!((revoked, nobody, device, unknown), (2, 0, true, false));
		assert_eq!(roster, Roster { version: 5, rows: Vec::new() });
		assert_eq!(elsewhere, Roster { version: 1, rows: vec![a_row("d1", "r1")] });
	}

	#[tokio::test]
	async fn a_revocation_marks_a_rotation_pending_only_when_it_deletes_a_row_and_settling_clears_it(
	) {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		let pending = || async { relay.is_rotation_pending(SPACE.to_owned()).await.expect("read") };
		relay.rostered(SPACE.to_owned(), a_row("d1", "r1")).await.expect("stored");
		relay.rostered(SPACE.to_owned(), a_row("d2", "r2")).await.expect("stored");

		let untouched = pending().await;
		relay.account_revoked(SPACE.to_owned(), "a9".to_owned()).await.expect("revoked");
		relay.device_revoked(SPACE.to_owned(), "d9".to_owned()).await.expect("revoked");
		let after_nothing = pending().await;
		relay.device_revoked(SPACE.to_owned(), "d1".to_owned()).await.expect("revoked");
		let after_device = pending().await;
		relay.rotation_settled(SPACE.to_owned()).await.expect("settled");
		let settled = pending().await;
		relay.account_revoked(SPACE.to_owned(), "a1".to_owned()).await.expect("revoked");
		let after_account = pending().await;

		assert_eq!(
			[untouched, after_nothing, after_device, settled, after_account],
			[false, false, true, false, true]
		);
	}

	#[tokio::test]
	async fn an_admission_onto_a_rostered_relay_device_lands_nothing_and_keeps_its_secret_unused() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		relay.rostered(SPACE.to_owned(), a_row("d1", "r1")).await.expect("stored");
		relay
			.join_secret_minted(SPACE.to_owned(), "a1".to_owned(), Zeroizing::new(vec![1]))
			.await
			.expect("minted");
		let id = relay.join_secrets(SPACE.to_owned()).await.expect("read")[0].id;

		let refused = relay.admitted(SPACE.to_owned(), id, 5, a_row("d2", "r1")).await;

		assert!(refused.is_err());
		assert_eq!(secrets_of(relay).await, vec![("a1".to_owned(), vec![1], false)]);
		assert_eq!(relay.roster(SPACE.to_owned()).await.expect("read").version, 1);
	}

	#[tokio::test]
	async fn an_accepted_ctr_only_moves_forward() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		let accepted = |ctr| relay.accepted(SPACE.to_owned(), "d1".to_owned(), 1, ctr);

		assert!(accepted(5).await.expect("written"));
		assert!(!accepted(5).await.expect("written"));
		assert!(!accepted(4).await.expect("written"));
		assert!(accepted(6).await.expect("written"));
		let last = relay.last_accepted(SPACE.to_owned(), "d1".to_owned(), 1).await.expect("read");
		assert_eq!(last, Some(6));
	}

	#[tokio::test]
	async fn a_bound_is_reserved_only_under_a_started_counter_and_grows_by_its_block() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();

		let unstarted = relay.reserved(SPACE.to_owned(), 1, 100).await.expect("read");
		relay.counter_started(SPACE.to_owned(), 1).await.expect("started");
		let first = relay.reserved(SPACE.to_owned(), 1, 100).await.expect("reserved");
		relay.counter_started(SPACE.to_owned(), 1).await.expect("started again");
		let second = relay.reserved(SPACE.to_owned(), 1, 100).await.expect("reserved");

		assert_eq!((unstarted, first, second), (None, Some(100), Some(200)));
	}
}
