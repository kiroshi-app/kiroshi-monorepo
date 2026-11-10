use rusqlite::{params, OptionalExtension, Row};

use crate::db::{Access, DatabaseError};

const SELECT_ROSTER: &str =
	"SELECT key_id, version, roster FROM joined_space_rosters WHERE instance_id = ?1";

const UPSERT_ROSTER: &str =
	"INSERT INTO joined_space_rosters (instance_id, key_id, version, roster)
	VALUES (?1, ?2, ?3, ?4)
	ON CONFLICT (instance_id) DO UPDATE SET key_id = excluded.key_id,
		version = excluded.version, roster = excluded.roster
	WHERE excluded.version >= joined_space_rosters.version";

const INSERT_COUNTER: &str = "INSERT INTO joined_space_counters (instance_id, key_id)
	VALUES (?1, ?2) ON CONFLICT (instance_id, key_id) DO NOTHING";

const RESERVE: &str = "UPDATE joined_space_counters SET reserved = reserved + ?3
	WHERE instance_id = ?1 AND key_id = ?2 RETURNING reserved";

const ADVANCE_ACCEPTED: &str = "UPDATE joined_space_counters SET accepted = ?3
	WHERE instance_id = ?1 AND key_id = ?2 AND accepted < ?3";

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HeldRoster {
	pub key_id: u32,
	pub version: u64,
	pub roster: String,
}

pub struct JoinedSpaceRelayRepository {
	access: Access,
}

impl JoinedSpaceRelayRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn roster(&self, instance_id: String) -> Result<Option<HeldRoster>, DatabaseError> {
		self.access
			.call(move |connection| {
				let held = connection
					.prepare_cached(SELECT_ROSTER)?
					.query_row(params![instance_id], held_roster_of)
					.optional()?;
				Ok(held)
			})
			.await
	}

	pub async fn roster_kept(
		&self,
		instance_id: String,
		held: HeldRoster,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let version = stored_counter(held.version)?;
				let kept = connection.execute(
					UPSERT_ROSTER,
					params![instance_id, held.key_id, version, held.roster],
				)?;
				Ok(kept == 1)
			})
			.await
	}

	pub async fn counter_started(
		&self,
		instance_id: String,
		key_id: u32,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(INSERT_COUNTER, params![instance_id, key_id])?;
				Ok(())
			})
			.await
	}

	pub async fn reserved(
		&self,
		instance_id: String,
		key_id: u32,
		block: u64,
	) -> Result<Option<u64>, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let block = stored_counter(block)?;
				let reserved = connection
					.prepare_cached(RESERVE)?
					.query_row(params![instance_id, key_id, block], |row| counter_of(row, 0))
					.optional()?;
				Ok(reserved)
			})
			.await
	}

	pub async fn accepted(
		&self,
		instance_id: String,
		key_id: u32,
		ctr: u64,
	) -> Result<bool, DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let ctr = stored_counter(ctr)?;
				let advanced =
					connection.execute(ADVANCE_ACCEPTED, params![instance_id, key_id, ctr])?;
				Ok(advanced == 1)
			})
			.await
	}
}

fn held_roster_of(row: &Row<'_>) -> rusqlite::Result<HeldRoster> {
	Ok(HeldRoster { key_id: row.get(0)?, version: counter_of(row, 1)?, roster: row.get(2)? })
}

fn stored_counter(counter: u64) -> rusqlite::Result<i64> {
	i64::try_from(counter).map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn counter_of(row: &Row<'_>, index: usize) -> rusqlite::Result<u64> {
	let counter: i64 = row.get(index)?;
	u64::try_from(counter).map_err(|_| rusqlite::Error::IntegralValueOutOfRange(index, counter))
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::open;

	const INSTANCE: &str = "instance-1";

	fn a_roster(key_id: u32, version: u64) -> HeldRoster {
		HeldRoster { key_id, version, roster: format!("roster-{key_id}-{version}") }
	}

	#[tokio::test]
	async fn a_roster_is_replaced_by_one_at_least_as_recent_and_never_by_an_older_one() {
		let dir = temp_dir();
		let database = open(&dir);
		let relay = database.joined_space_relay();

		let first = relay.roster_kept(INSTANCE.to_owned(), a_roster(1, 3)).await.expect("kept");
		let same = relay.roster_kept(INSTANCE.to_owned(), a_roster(2, 3)).await.expect("kept");
		let older = relay.roster_kept(INSTANCE.to_owned(), a_roster(3, 2)).await.expect("read");

		assert_eq!((first, same, older), (true, true, false));
		let held = relay.roster(INSTANCE.to_owned()).await.expect("the read");
		assert_eq!(held, Some(a_roster(2, 3)));
		assert_eq!(relay.roster("other".to_owned()).await.expect("the read"), None);
	}

	#[tokio::test]
	async fn a_counter_reserves_growing_blocks_and_accepts_only_a_greater_ctr() {
		let dir = temp_dir();
		let database = open(&dir);
		let relay = database.joined_space_relay();
		let unstarted = relay.reserved(INSTANCE.to_owned(), 1, 8).await.expect("the read");
		relay.counter_started(INSTANCE.to_owned(), 1).await.expect("started");
		relay.counter_started(INSTANCE.to_owned(), 1).await.expect("started again");

		let blocks = [
			relay.reserved(INSTANCE.to_owned(), 1, 8).await.expect("reserved"),
			relay.reserved(INSTANCE.to_owned(), 1, 8).await.expect("reserved"),
		];
		let accepted = [
			relay.accepted(INSTANCE.to_owned(), 1, 5).await.expect("advanced"),
			relay.accepted(INSTANCE.to_owned(), 1, 5).await.expect("replayed"),
			relay.accepted(INSTANCE.to_owned(), 1, 4).await.expect("older"),
			relay.accepted(INSTANCE.to_owned(), 2, 9).await.expect("unstarted"),
		];

		assert_eq!(unstarted, None);
		assert_eq!(blocks, [Some(8), Some(16)]);
		assert_eq!(accepted, [true, false, false, false]);
	}
}
