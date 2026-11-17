use rusqlite::types::Type;
use rusqlite::{params, OptionalExtension, Row};
use serde_json::Value;

use crate::db::{Access, DatabaseError};

const SELECT_KEPT: &str = "SELECT status, body FROM member_call_answers
	WHERE space_id = ?1 AND device_id = ?2 AND call_key = ?3";

const INSERT_ANSWER: &str =
	"INSERT INTO member_call_answers (space_id, device_id, call_key, seq, status, body)
	VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(seq), 0) + 1 FROM member_call_answers
		WHERE space_id = ?1 AND device_id = ?2), ?4, ?5)
	RETURNING seq";

const FORGET_ANSWER: &str = "UPDATE member_call_answers SET status = NULL, body = NULL
	WHERE space_id = ?1 AND device_id = ?2 AND seq = ?3";

const UNREADABLE_ANSWER: &str = "a kept member call answer is not json";

#[derive(Debug, Clone, PartialEq)]
pub enum KeptCall {
	Answered { status: u16, body: Value },
	AnswerForgotten,
}

impl KeptCall {
	fn read(row: &Row<'_>) -> rusqlite::Result<Self> {
		let (Some(status), Some(body)) = (row.get(0)?, row.get::<_, Option<String>>(1)?) else {
			return Ok(Self::AnswerForgotten);
		};
		let body = serde_json::from_str(&body).map_err(|_| {
			rusqlite::Error::FromSqlConversionFailure(1, Type::Text, UNREADABLE_ANSWER.into())
		})?;
		Ok(Self::Answered { status, body })
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct MemberCallKey {
	pub space_id: String,
	pub device_id: String,
	pub call_key: String,
}

pub struct MemberCallAnswersRepository {
	access: Access,
}

impl MemberCallAnswersRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn kept(&self, key: MemberCallKey) -> Result<Option<KeptCall>, DatabaseError> {
		self.access
			.call(move |connection| {
				let kept = connection
					.prepare_cached(SELECT_KEPT)?
					.query_row(params![key.space_id, key.device_id, key.call_key], KeptCall::read)
					.optional()?;
				Ok(kept)
			})
			.await
	}

	pub async fn answered(
		&self,
		key: MemberCallKey,
		status: u16,
		body: Value,
		answers_kept: u32,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let body = serde_json::to_string(&body)
					.map_err(|error| rusqlite::Error::ToSqlConversionFailure(error.into()))?;
				let MemberCallKey { space_id, device_id, call_key } = key;
				let transaction = connection.transaction()?;
				let seq: i64 = transaction.query_row(
					INSERT_ANSWER,
					params![space_id, device_id, call_key, status, body],
					|row| row.get(0),
				)?;
				let oldest_forgotten = seq - i64::from(answers_kept);
				transaction
					.execute(FORGET_ANSWER, params![space_id, device_id, oldest_forgotten])?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::space_relay::RosterRow;

	const SPACE: &str = "personal";

	fn a_key(call_key: &str) -> MemberCallKey {
		MemberCallKey {
			space_id: SPACE.to_owned(),
			device_id: "r1".to_owned(),
			call_key: call_key.to_owned(),
		}
	}

	fn a_roster_row(relay_device_id: &str) -> RosterRow {
		RosterRow {
			device_id: format!("device-of-{relay_device_id}"),
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
	async fn an_answer_reads_back_as_it_was_kept_and_an_unknown_key_reads_as_none() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let answers = database.member_call_answers();
		answers.answered(a_key("k1"), 200, json!({ "id": "g1" }), 8).await.expect("kept");

		let kept = answers.kept(a_key("k1")).await.expect("read");
		let unknown = answers.kept(a_key("k2")).await.expect("read");

		assert_eq!(kept, Some(KeptCall::Answered { status: 200, body: json!({ "id": "g1" }) }));
		assert_eq!(unknown, None);
	}

	#[tokio::test]
	async fn past_the_answers_kept_the_oldest_keeps_its_key_and_forgets_its_answer() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let answers = database.member_call_answers();
		for n in 0..=2 {
			answers.answered(a_key(&format!("k{n}")), 200, json!(n), 2).await.expect("kept");
		}
		let elsewhere = MemberCallKey { device_id: "r2".to_owned(), ..a_key("k0") };
		answers.answered(elsewhere.clone(), 200, json!("other"), 2).await.expect("kept");

		assert_eq!(answers.kept(a_key("k0")).await.expect("read"), Some(KeptCall::AnswerForgotten));
		let kept = answers.kept(a_key("k1")).await.expect("read");
		assert_eq!(kept, Some(KeptCall::Answered { status: 200, body: json!(1) }));
		let other = answers.kept(elsewhere).await.expect("read");
		assert_eq!(other, Some(KeptCall::Answered { status: 200, body: json!("other") }));
	}

	#[tokio::test]
	async fn a_device_leaving_the_roster_takes_its_answers_and_leaves_the_others() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let relay = database.space_relay();
		relay.rostered(SPACE.to_owned(), a_roster_row("r1")).await.expect("rostered");
		relay.rostered(SPACE.to_owned(), a_roster_row("r2")).await.expect("rostered");
		let answers = database.member_call_answers();
		let staying = MemberCallKey { device_id: "r2".to_owned(), ..a_key("k1") };
		answers.answered(a_key("k1"), 200, json!(1), 8).await.expect("kept");
		answers.answered(staying.clone(), 200, json!(2), 8).await.expect("kept");

		relay
			.device_removed(SPACE.to_owned(), "device-of-r1".to_owned(), 2)
			.await
			.expect("removed");

		assert_eq!(answers.kept(a_key("k1")).await.expect("read"), None);
		assert!(answers.kept(staying).await.expect("read").is_some());
	}

	#[tokio::test]
	async fn a_deleted_space_takes_its_answers() {
		let dir = temp_dir();
		let database = crate::db::open(&dir);
		let space = database.spaces().create("Writers".to_owned()).await.expect("the space");
		let answers = database.member_call_answers();
		let key = MemberCallKey { space_id: space.id.clone(), ..a_key("k1") };
		answers.answered(key.clone(), 200, json!(1), 8).await.expect("kept");

		database.spaces().delete(space.id).await.expect("deleted");

		assert_eq!(answers.kept(key).await.expect("read"), None);
	}
}
