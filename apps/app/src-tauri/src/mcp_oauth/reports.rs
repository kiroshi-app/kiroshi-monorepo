use std::collections::HashMap;
use std::sync::{Mutex, PoisonError};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::commands::{declared_servers, refreshed};
use super::refresh::{self, Renewed};
use crate::agent::host::{Host, Refusal};
use crate::environment::commands::writable_root;
use crate::environment::contract::{EnvError, EnvOwner};

const NO_RECORDS: &str = "the record of where servers stand is not held";

#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
#[serde(tag = "state", rename_all = "kebab-case")]
pub enum Standing {
	Holding,
	NeedsAuth {
		#[serde(default)]
		reason: Option<String>,
	},
	LeftOut {
		#[serde(default)]
		reason: Option<String>,
	},
}

#[derive(Debug, Deserialize)]
struct Report {
	name: String,
	#[serde(flatten)]
	standing: Standing,
}

#[derive(Debug, Deserialize)]
struct Rejected {
	name: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Operation {
	Report,
	Renew,
}

#[derive(Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum StandingError {
	UnreadableRequest { detail: String },
	Unexpected { detail: String },
}

impl Refusal for StandingError {
	fn unreadable(detail: String) -> Self {
		Self::UnreadableRequest { detail }
	}

	fn unexpected(detail: String) -> Self {
		Self::Unexpected { detail }
	}
}

#[derive(Default)]
pub struct ApplicationReports {
	held: Mutex<HashMap<(String, String), Standing>>,
}

impl ApplicationReports {
	pub fn record(&self, bot_id: &str, name: &str, standing: Standing) {
		self.held
			.lock()
			.unwrap_or_else(PoisonError::into_inner)
			.insert((bot_id.to_owned(), name.to_owned()), standing);
	}

	pub fn forget(&self, name: &str) {
		self.held
			.lock()
			.unwrap_or_else(PoisonError::into_inner)
			.retain(|(_, held), _| held != name);
	}

	pub fn last(&self, bot_id: &str, name: &str) -> Option<Standing> {
		self.held
			.lock()
			.unwrap_or_else(PoisonError::into_inner)
			.get(&(bot_id.to_owned(), name.to_owned()))
			.cloned()
	}
}

#[derive(Debug)]
pub struct StandingHost {
	core: crate::core_context::Core,
	bot_id: String,
	space_id: Option<String>,
}

impl StandingHost {
	pub fn new(core: crate::core_context::Core, bot_id: String, space_id: Option<String>) -> Self {
		Self { core, bot_id, space_id }
	}

	fn owner(&self) -> Option<EnvOwner> {
		self.space_id.clone().map(|space_id| EnvOwner::Bot { id: self.bot_id.clone(), space_id })
	}

	async fn renewed(&self, name: &str) -> Result<Value, StandingError> {
		let Some(owner) = self.owner() else {
			return Self::answered(Renewed::Unchanged);
		};
		let root = writable_root(&self.core).map_err(unreadable_store)?;
		let servers = declared_servers(&self.core, &owner).map_err(unreadable_store)?;
		let app = self.core.clone();
		let renewed = refresh::on_rejection(&root, &owner, name, &servers, move |request| {
			let app = app.clone();
			async move { refreshed(&app, request).await }
		})
		.await
		.map_err(unreadable_store)?;
		Self::answered(renewed)
	}

	fn recorded(&self, report: Report) -> Result<Value, StandingError> {
		let reports = self
			.core
			.try_state::<ApplicationReports>()
			.ok_or_else(|| StandingError::unexpected(NO_RECORDS.to_owned()))?;
		reports.record(&self.bot_id, &report.name, report.standing);
		Ok(Value::Null)
	}
}

impl Host for StandingHost {
	const SUBTYPE: &'static str = "standing";

	const IS_PAYLOAD_REQUIRED: bool = true;

	type Operation = Operation;

	type Error = StandingError;

	async fn served(&self, operation: Operation, payload: Value) -> Result<Value, StandingError> {
		match operation {
			Operation::Report => self.recorded(Self::read(payload)?),
			Operation::Renew => self.renewed(&Self::read::<Rejected>(payload)?.name).await,
		}
	}
}

fn unreadable_store(error: EnvError) -> StandingError {
	StandingError::unexpected(format!("{error:?}"))
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;

	fn read(request: Value) -> Result<Report, Value> {
		StandingHost::read(request["payload"].clone())
			.map_err(|error| serde_json::to_value(error).expect("a refusal serializes"))
	}

	fn asked(payload: Value) -> Value {
		json!({ "subtype": "standing", "operation": "report", "payload": payload })
	}

	#[test]
	fn a_session_report_reads_as_the_state_it_names() {
		let holding = read(asked(json!({ "name": "superset", "state": "holding" })))
			.expect("the report reads");
		let awaiting = read(asked(json!({ "name": "granola", "state": "needs-auth" })))
			.expect("the report reads");
		let dropped = read(asked(
			json!({ "name": "clock", "state": "left-out", "reason": "TOKEN is defined by no scope" }),
		))
		.expect("the report reads");

		assert_eq!((holding.name.as_str(), holding.standing), ("superset", Standing::Holding));
		assert_eq!(
			(awaiting.name.as_str(), awaiting.standing),
			("granola", Standing::NeedsAuth { reason: None })
		);
		assert_eq!(
			dropped.standing,
			Standing::LeftOut { reason: Some("TOKEN is defined by no scope".to_owned()) }
		);
	}

	#[test]
	fn a_state_no_record_holds_is_refused_by_name() {
		let refused = read(asked(json!({ "name": "superset", "state": "connecting" })))
			.expect_err("a connecting server is not a settled state");

		assert_eq!(refused["kind"], "unreadableRequest");
	}

	#[test]
	fn a_renewal_reads_the_operation_and_the_server_it_names() {
		let operation: Operation =
			serde_json::from_value(json!("renew")).expect("the operation reads");
		let rejected: Rejected = StandingHost::read(json!({ "name": "granola" }))
			.map_err(|_| "the payload reads")
			.expect("the payload reads");

		assert!(matches!(operation, Operation::Renew));
		assert_eq!(rejected.name, "granola");
	}

	#[test]
	fn every_renewal_answer_names_the_state_the_session_reads_it_by() {
		let answered =
			|renewed: Renewed| StandingHost::answered(renewed).expect("the answer serializes");

		assert_eq!(
			answered(Renewed::Granted { access_token: "renewed-access".to_owned() }),
			json!({ "state": "granted", "accessToken": "renewed-access" })
		);
		assert_eq!(answered(Renewed::NeedsAuth), json!({ "state": "needs-auth" }));
		assert_eq!(answered(Renewed::Unchanged), json!({ "state": "unchanged" }));
	}

	#[test]
	fn a_report_replaces_the_one_last_recorded_for_that_bot_and_server() {
		let reports = ApplicationReports::default();
		reports.record("b1", "granola", Standing::NeedsAuth { reason: None });
		reports.record("b2", "granola", Standing::Holding);

		reports.record("b1", "granola", Standing::Holding);

		assert_eq!(reports.last("b1", "granola"), Some(Standing::Holding));
		assert_eq!(reports.last("b2", "granola"), Some(Standing::Holding));
		assert_eq!(reports.last("b1", "clock"), None);
	}

	#[test]
	fn forgetting_a_server_drops_its_standing_for_every_bot_and_keeps_the_rest() {
		let reports = ApplicationReports::default();
		reports.record("b1", "granola", Standing::NeedsAuth { reason: None });
		reports.record("b2", "granola", Standing::Holding);
		reports.record("b1", "clock", Standing::Holding);

		reports.forget("granola");

		assert_eq!(reports.last("b1", "granola"), None);
		assert_eq!(reports.last("b2", "granola"), None);
		assert_eq!(reports.last("b1", "clock"), Some(Standing::Holding));
	}
}
