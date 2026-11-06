use rusqlite::{params, Connection, OptionalExtension, Row, Transaction};

use super::state::{ActivityStatus, InitialStatus};
use super::{stored_state, write_transaction, TranscriptError};
use crate::db::DatabaseError;

pub struct NewActivity {
	pub id: String,
	pub turn_id: String,
	pub kind: String,
	pub status: InitialStatus,
	pub payload: String,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StoredActivity {
	pub id: String,
	pub kind: String,
	pub status: ActivityStatus,
	pub payload: String,
	pub seq: i64,
	pub created_at: i64,
}

const ACTIVITY_KEY: &str = "SELECT id, kind, status, payload, seq, created_at, turn_id
	FROM activities WHERE id = ?1";
const ACTIVITY_STATUS: &str = "SELECT status FROM activities WHERE id = ?1";
const INSERT_ACTIVITY: &str = "INSERT INTO activities
	(id, turn_id, kind, status, payload, seq, created_at)
	VALUES (?1, ?2, ?3, ?4, ?5,
		(SELECT COALESCE(MAX(seq), 0) + 1 FROM activities WHERE turn_id = ?2), ?6)
	RETURNING seq";
const SET_ACTIVITY_STATUS: &str =
	"UPDATE activities SET status = ?2 WHERE id = ?1 AND status IN ('pending', 'running')";
pub const ACTIVITIES_OF_TURN: &str = "SELECT id, kind, status, payload, seq, created_at
	FROM activities WHERE turn_id = ?1 ORDER BY seq";

struct StoredActivityKey {
	stored: StoredActivity,
	turn_id: String,
}

impl StoredActivityKey {
	fn diverging_field(&self, activity: &NewActivity) -> Option<&'static str> {
		if self.turn_id != activity.turn_id {
			return Some("turn_id");
		}
		if self.stored.kind != activity.kind {
			return Some("kind");
		}
		if activity_stage(activity.status.into()) > activity_stage(self.stored.status) {
			return Some("status");
		}
		if self.stored.payload != activity.payload {
			return Some("payload");
		}
		if self.stored.created_at != activity.created_at {
			return Some("created_at");
		}
		None
	}
}

fn activity_stage(status: ActivityStatus) -> u8 {
	match status {
		ActivityStatus::Pending => 0,
		ActivityStatus::Running => 1,
		ActivityStatus::Succeeded | ActivityStatus::Failed | ActivityStatus::Terminated => 2,
	}
}

pub fn store_activity(
	connection: &mut Connection,
	activity: NewActivity,
) -> Result<i64, TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(key) = stored_activity_key(&transaction, &activity.id)? {
		if let Some(field) = key.diverging_field(&activity) {
			return Err(TranscriptError::Conflict { id: activity.id, field });
		}
		return Ok(key.stored.seq);
	}
	let seq = transaction.query_row(
		INSERT_ACTIVITY,
		params![
			activity.id,
			activity.turn_id,
			activity.kind,
			ActivityStatus::from(activity.status),
			activity.payload,
			activity.created_at,
		],
		|row| row.get(0),
	)?;
	transaction.commit()?;
	Ok(seq)
}

pub fn advance_activity(
	connection: &mut Connection,
	id: &str,
	target: ActivityStatus,
) -> Result<(), TranscriptError> {
	let transaction = write_transaction(connection)?;
	if let Some(current) = stored_state::<ActivityStatus>(&transaction, ACTIVITY_STATUS, id)? {
		if current != target {
			if activity_stage(target) <= activity_stage(current) {
				return Err(TranscriptError::InvalidTransition {
					id: id.into(),
					from: current.as_sql(),
					to: target.as_sql(),
				});
			}
			transaction.execute(SET_ACTIVITY_STATUS, params![id, target])?;
		}
	}
	transaction.commit()?;
	Ok(())
}

fn stored_activity_key(
	transaction: &Transaction<'_>,
	id: &str,
) -> Result<Option<StoredActivityKey>, DatabaseError> {
	Ok(transaction
		.query_row(ACTIVITY_KEY, params![id], |row| {
			Ok(StoredActivityKey { stored: read_activity(row)?, turn_id: row.get(6)? })
		})
		.optional()?)
}

pub fn read_activity(row: &Row<'_>) -> rusqlite::Result<StoredActivity> {
	Ok(StoredActivity {
		id: row.get(0)?,
		kind: row.get(1)?,
		status: row.get(2)?,
		payload: row.get(3)?,
		seq: row.get(4)?,
		created_at: row.get(5)?,
	})
}

#[cfg(test)]
mod tests {
	use std::fs;

	use super::super::tests::{
		a_turn, an_activity, assert_rejected, seeded, statuses, TERMINATIONS,
	};
	use super::super::TerminalStatus;
	use super::*;
	use crate::db::connection::temp_dir;

	#[tokio::test]
	async fn an_activity_walks_its_graph_forward_and_refuses_every_other_move() {
		let dir = temp_dir();
		let database = seeded(&dir).await;
		a_turn(&database, "t1", "c1").await;
		let mut expected = Vec::new();
		database
			.messages()
			.append_activity(an_activity("walked", InitialStatus::Pending))
			.await
			.expect("the activity is appended");
		database
			.messages()
			.start_activity("walked".into())
			.await
			.expect("a pending step refused to start running");
		database
			.messages()
			.finish_activity("walked".into(), TerminalStatus::Succeeded)
			.await
			.expect("a running step refused to end");
		expected.push(ActivityStatus::Succeeded);
		for (index, termination) in TERMINATIONS.into_iter().enumerate() {
			for (id, opening) in [
				(format!("p{index}"), InitialStatus::Pending),
				(format!("r{index}"), InitialStatus::Running),
			] {
				database
					.messages()
					.append_activity(an_activity(&id, opening))
					.await
					.expect("the activity is appended");
				database
					.messages()
					.finish_activity(id, termination)
					.await
					.expect("an open step refused to end");
				expected.push(termination.into());
			}
		}
		database
			.messages()
			.append_activity(an_activity("running", InitialStatus::Running))
			.await
			.expect("the activity is appended");
		expected.push(ActivityStatus::Running);

		let reopened = database.messages().start_activity("p0".into()).await;
		let another_ending =
			database.messages().finish_activity("p0".into(), TerminalStatus::Failed).await;
		database
			.messages()
			.finish_activity("p0".into(), TerminalStatus::Succeeded)
			.await
			.expect("the same ending reported twice was refused");

		assert_rejected(&reopened, "succeeded", "running");
		assert_rejected(&another_ending, "succeeded", "failed");
		assert_eq!(statuses(&database).await, expected, "a step moved somewhere it may not go");

		drop(database);
		fs::remove_dir_all(&dir).expect("cleanup");
	}
}
