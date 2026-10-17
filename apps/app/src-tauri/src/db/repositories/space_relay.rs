use rusqlite::{params, OptionalExtension, Row};

use crate::db::{Access, DatabaseError};

const UPSERT_ROSTER_ROW: &str = "INSERT INTO space_roster (space_id, device_id, relay_device_id,
	account_id, signing_public_key, agreement_public_key, fingerprint, added_at, signature)
	VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
	ON CONFLICT (space_id, device_id) DO UPDATE SET relay_device_id = excluded.relay_device_id,
		account_id = excluded.account_id, signing_public_key = excluded.signing_public_key,
		agreement_public_key = excluded.agreement_public_key, fingerprint = excluded.fingerprint,
		added_at = excluded.added_at, signature = excluded.signature";

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
				connection.execute(
					UPSERT_ROSTER_ROW,
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
