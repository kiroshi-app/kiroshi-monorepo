use std::collections::BTreeMap;

use serde::ser::SerializeStruct;
use serde::{Deserialize, Deserializer, Serialize, Serializer};
use serde_json::Value;

use crate::conversations::contract::TranscriptStoreError;
use crate::db::DatabaseError;
use crate::environment::contract::EnvError;
use crate::mcp_oauth::status::ApplicationStatus;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct Application {
	pub name: String,
	pub title: String,
	pub description: String,
	#[specta(type = BTreeMap<String, specta_typescript::Unknown>)]
	pub config: serde_json::Value,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = Vec<String>, optional)]
	pub tools: Option<Vec<String>>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo_url: Option<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = u64, optional)]
	pub use_count: Option<u64>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = bool, optional)]
	pub verified: Option<bool>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub hosted_by: Option<String>,
	#[serde(default, skip_serializing_if = "Vec::is_empty")]
	pub categories: Vec<String>,
	#[serde(default, skip_serializing_if = "Option::is_none")]
	#[specta(type = AuthPosture, optional)]
	pub auth_posture: Option<AuthPosture>,
	pub install: Install,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum AuthPosture {
	AuthRequired,
	NoAuth,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Install {
	Nothing,
	#[serde(rename_all = "camelCase")]
	Key {
		fields: Vec<InstallField>,
	},
	Oauth,
	Refused(InstallRefusal),
}

#[derive(Debug, Clone, PartialEq, Eq, specta::Type)]
pub struct InstallField {
	pub name: String,
	pub secret: String,
	#[specta(type = String, optional)]
	pub description: Option<String>,
	pub concealed: bool,
}

impl Serialize for InstallField {
	fn serialize<S: Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
		let mut field = serializer
			.serialize_struct("InstallField", 3 + usize::from(self.description.is_some()))?;
		field.serialize_field("name", &self.name)?;
		field.serialize_field("secret", &self.secret)?;
		match &self.description {
			Some(description) => field.serialize_field("description", description)?,
			None => field.skip_field("description")?,
		}
		field.serialize_field("concealed", &self.concealed)?;
		field.end()
	}
}

#[derive(Deserialize)]
struct InstallFieldEntry {
	name: String,
	secret: String,
	#[serde(default)]
	description: Option<String>,
	#[serde(default = "concealed_unless_said_otherwise")]
	concealed: bool,
}

impl<'de> Deserialize<'de> for InstallField {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		let entry = InstallFieldEntry::deserialize(deserializer)?;
		Ok(Self {
			name: entry.name,
			secret: entry.secret,
			description: entry.description,
			concealed: entry.concealed,
		})
	}
}

const fn concealed_unless_said_otherwise() -> bool {
	true
}

impl Install {
	pub fn asking(fields: Vec<InstallField>) -> Self {
		match collapsed(&fields) {
			Some(refusal) => Install::Refused(refusal),
			None => Install::Key { fields },
		}
	}

	pub fn covering(self, config: &Value) -> Self {
		let asked: &[InstallField] = match &self {
			Install::Key { fields } => fields,
			Install::Refused(_) => return self,
			_ => &[],
		};
		let Some(variable) = unfilled(config, asked) else {
			return self;
		};
		Install::Refused(InstallRefusal { reason: uncovered(&variable), field: variable })
	}
}

fn unfilled(config: &Value, asked: &[InstallField]) -> Option<String> {
	referenced(config)
		.into_iter()
		.find(|variable| !asked.iter().any(|field| &field.secret == variable))
}

fn referenced(config: &Value) -> Vec<String> {
	match config {
		Value::String(held) => variables(held),
		Value::Array(held) => held.iter().flat_map(referenced).collect(),
		Value::Object(held) => held.values().flat_map(referenced).collect(),
		_ => Vec::new(),
	}
}

fn variables(held: &str) -> Vec<String> {
	held.split("${")
		.skip(1)
		.filter_map(|rest| rest.split_once('}'))
		.filter_map(|(reference, _)| unresolved(reference))
		.collect()
}

fn unresolved(reference: &str) -> Option<String> {
	match reference.split_once(":-") {
		Some((name, _)) if resolved_by_the_sidecar(name) => None,
		_ => Some(reference.to_owned()),
	}
}

fn resolved_by_the_sidecar(name: &str) -> bool {
	let mut held = name.chars();
	held.next().is_some_and(|first| first == '_' || first.is_ascii_uppercase())
		&& held.all(|held| held == '_' || held.is_ascii_uppercase() || held.is_ascii_digit())
}

fn uncovered(variable: &str) -> String {
	format!(
		"the config reads the variable {variable} and no field of this install fills it, so the server would start without its value"
	)
}

fn collapsed(fields: &[InstallField]) -> Option<InstallRefusal> {
	fields.iter().enumerate().find_map(|(index, field)| {
		let first = fields[..index].iter().find(|held| held.secret == field.secret)?;
		Some(InstallRefusal {
			field: field.name.clone(),
			reason: collapsing(&first.name, &field.name, &field.secret),
		})
	})
}

fn collapsing(first: &str, second: &str, variable: &str) -> String {
	format!(
		"the required fields \"{first}\" and \"{second}\" both read the variable {variable}, so one value would overwrite the other"
	)
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct InstallRefusal {
	pub field: String,
	pub reason: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ApplicationsError {
	#[serde(rename_all = "camelCase")]
	CatalogueUnreadable {
		detail: String,
	},
	#[serde(rename_all = "camelCase")]
	RegistryUnreached {
		detail: String,
	},
	RegistryTimedOut,
	#[serde(rename_all = "camelCase")]
	RegistryRefused {
		status: u16,
	},
	#[serde(rename_all = "camelCase")]
	RegistryUnreadable {
		detail: String,
	},
}

pub const INSTALLED_EVENT: &str = "application://installed";

pub const DIRECTORY_REFRESHED_EVENT: &str = "application://directory-refreshed";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum Destination {
	Companion,
	Space,
	User,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct InstallDraft {
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	pub logo: Option<String>,
	pub logo_url: Option<String>,
	pub description: Option<String>,
	pub scope: Destination,
	pub destination_id: Option<String>,
	pub install: InstallCase,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInstall {
	pub id: String,
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo_url: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub description: Option<String>,
	pub scope: Destination,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub destination_id: Option<String>,
	pub install: InstallCase,
	pub last_message_seq: i64,
	pub created_at: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationInstalled {
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub id: Option<String>,
	pub conversation_id: String,
	pub application: String,
	pub title: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub logo_url: Option<String>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub description: Option<String>,
	pub scope: Destination,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = String, optional)]
	pub destination_id: Option<String>,
	pub install: InstallCase,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = i64, optional)]
	pub last_message_seq: Option<i64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = i64, optional)]
	pub created_at: Option<i64>,
}

impl From<ApplicationInstall> for ApplicationInstalled {
	fn from(record: ApplicationInstall) -> Self {
		Self {
			id: Some(record.id),
			conversation_id: record.conversation_id,
			application: record.application,
			title: record.title,
			logo: record.logo,
			logo_url: record.logo_url,
			description: record.description,
			scope: record.scope,
			destination_id: record.destination_id,
			install: record.install,
			last_message_seq: Some(record.last_message_seq),
			created_at: Some(record.created_at),
		}
	}
}

impl From<InstallDraft> for ApplicationInstalled {
	fn from(draft: InstallDraft) -> Self {
		Self {
			id: None,
			conversation_id: draft.conversation_id,
			application: draft.application,
			title: draft.title,
			logo: draft.logo,
			logo_url: draft.logo_url,
			description: draft.description,
			scope: draft.scope,
			destination_id: draft.destination_id,
			install: draft.install,
			last_message_seq: None,
			created_at: None,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ApplicationSearch {
	pub applications: Vec<Application>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = ApplicationsError, optional)]
	pub registry_failure: Option<ApplicationsError>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = i64, optional)]
	pub read_at: Option<i64>,
	#[serde(skip_serializing_if = "Option::is_none")]
	#[specta(type = bool, optional)]
	pub is_stale: Option<bool>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum InstallCase {
	Nothing,
	#[serde(rename_all = "camelCase")]
	Key {
		secrets: Vec<String>,
	},
	Oauth,
}

impl TryFrom<Install> for InstallCase {
	type Error = InstallRefusal;

	fn try_from(install: Install) -> Result<Self, Self::Error> {
		match install {
			Install::Nothing => Ok(InstallCase::Nothing),
			Install::Key { fields } => Ok(InstallCase::Key {
				secrets: fields.into_iter().map(|held| held.secret).collect(),
			}),
			Install::Oauth => Ok(InstallCase::Oauth),
			Install::Refused(refusal) => Err(refusal),
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "outcome", rename_all = "camelCase")]
pub enum InstallOutcome {
	#[serde(rename_all = "camelCase")]
	Installed { application: String, scope: Destination, install: InstallCase },
	#[serde(rename_all = "camelCase")]
	AlreadyInstalled { application: String, scope: Destination },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "status", rename_all = "camelCase")]
pub enum ApplicationState {
	NotInstalled,
	Connected,
	NeedsAuthorization,
	Connecting,
	Failed {
		#[serde(skip_serializing_if = "Option::is_none")]
		reason: Option<String>,
	},
	Unknown,
}

impl From<ApplicationStatus> for ApplicationState {
	fn from(status: ApplicationStatus) -> Self {
		match status {
			ApplicationStatus::Connected => ApplicationState::Connected,
			ApplicationStatus::NeedsAuthorization { .. } => ApplicationState::NeedsAuthorization,
			ApplicationStatus::Connecting => ApplicationState::Connecting,
			ApplicationStatus::Failed { reason } => ApplicationState::Failed { reason },
			ApplicationStatus::Unknown => ApplicationState::Unknown,
		}
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ApplicationCallError {
	#[serde(rename_all = "camelCase")]
	UnknownScope { scope: String },
	#[serde(rename_all = "camelCase")]
	UnknownApplication { application: String },
	#[serde(rename_all = "camelCase")]
	ApplicationRefused { application: String, reason: String },
	#[serde(rename_all = "camelCase")]
	ConversationWithoutSpace { conversation_id: String },
	#[serde(rename_all = "camelCase")]
	Unsearchable { failure: ApplicationsError },
	#[serde(rename_all = "camelCase")]
	Store { failure: TranscriptStoreError },
	#[serde(rename_all = "camelCase")]
	Environment { failure: EnvError },
	#[serde(rename_all = "camelCase")]
	UnreadableRequest { detail: String },
	#[serde(rename_all = "camelCase")]
	Undeliverable { detail: String },
	#[serde(rename_all = "camelCase")]
	Unexpected { detail: String },
}

impl From<ApplicationsError> for ApplicationCallError {
	fn from(failure: ApplicationsError) -> Self {
		ApplicationCallError::Unsearchable { failure }
	}
}

impl From<TranscriptStoreError> for ApplicationCallError {
	fn from(failure: TranscriptStoreError) -> Self {
		ApplicationCallError::Store { failure }
	}
}

impl From<DatabaseError> for ApplicationCallError {
	fn from(error: DatabaseError) -> Self {
		ApplicationCallError::Store { failure: error.into() }
	}
}

impl From<EnvError> for ApplicationCallError {
	fn from(failure: EnvError) -> Self {
		ApplicationCallError::Environment { failure }
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json, to_string, to_value};

	use super::*;

	#[test]
	fn an_application_crosses_to_the_front_under_the_names_it_reads() {
		let application = Application {
			name: "superset".to_owned(),
			title: "Superset".to_owned(),
			description: "Run workspaces.".to_owned(),
			config: json!({ "type": "http", "url": "https://superset.test/mcp" }),
			tools: Some(vec!["tasks_list".to_owned()]),
			logo: None,
			logo_url: Some("https://superset.test/logo.png".to_owned()),
			use_count: Some(42),
			verified: Some(true),
			hosted_by: Some("superset.test".to_owned()),
			categories: Vec::new(),
			auth_posture: None,
			install: Install::Key {
				fields: vec![InstallField {
					name: "Authorization".to_owned(),
					secret: "SUPERSET_API_KEY".to_owned(),
					description: None,
					concealed: true,
				}],
			},
		};

		assert_eq!(
			to_value(application).expect("it serialises"),
			json!({
				"name": "superset",
				"title": "Superset",
				"description": "Run workspaces.",
				"config": { "type": "http", "url": "https://superset.test/mcp" },
				"tools": ["tasks_list"],
				"logoUrl": "https://superset.test/logo.png",
				"useCount": 42,
				"verified": true,
				"hostedBy": "superset.test",
				"install": {
					"kind": "key",
					"fields": [
						{
							"name": "Authorization",
							"secret": "SUPERSET_API_KEY",
							"concealed": true,
						},
					],
				},
			})
		);
	}

	#[test]
	fn an_application_holding_no_tool_list_crosses_without_the_key() {
		let application = Application {
			name: "tasklog".to_owned(),
			title: "tasklog".to_owned(),
			description: "Track tasks.".to_owned(),
			config: json!({ "type": "stdio", "command": "npx" }),
			tools: None,
			logo: None,
			logo_url: None,
			use_count: None,
			verified: None,
			hosted_by: None,
			categories: Vec::new(),
			auth_posture: None,
			install: Install::Nothing,
		};

		let crossed = to_value(application).expect("it serialises");

		assert_eq!(crossed.get("tools"), None);
	}

	#[test]
	fn a_recorded_install_crosses_to_the_front_under_the_names_it_reads() {
		let record = ApplicationInstall {
			id: "i1".to_owned(),
			conversation_id: "c1".to_owned(),
			application: "superset".to_owned(),
			title: "Superset".to_owned(),
			logo: None,
			logo_url: Some("https://icons.test/superset.png".to_owned()),
			description: Some("Run workspaces.".to_owned()),
			scope: Destination::Space,
			destination_id: Some("personal".to_owned()),
			install: InstallCase::Key { secrets: vec!["SUPERSET_API_KEY".to_owned()] },
			last_message_seq: 12,
			created_at: 1_700_000_000_000,
		};

		assert_eq!(
			to_value(record).expect("it serialises"),
			json!({
				"id": "i1",
				"conversationId": "c1",
				"application": "superset",
				"title": "Superset",
				"logoUrl": "https://icons.test/superset.png",
				"description": "Run workspaces.",
				"scope": "space",
				"destinationId": "personal",
				"install": { "kind": "key", "secrets": ["SUPERSET_API_KEY"] },
				"lastMessageSeq": 12,
				"createdAt": 1_700_000_000_000_i64,
			})
		);
	}

	#[test]
	fn an_install_a_conversation_carries_nowhere_leaves_out_what_it_holds_no_value_for() {
		let draft = InstallDraft {
			conversation_id: "c1".to_owned(),
			application: "paper".to_owned(),
			title: "Paper".to_owned(),
			logo: None,
			logo_url: None,
			description: None,
			scope: Destination::User,
			destination_id: None,
			install: InstallCase::Nothing,
		};

		assert_eq!(
			to_value(ApplicationInstalled::from(draft)).expect("it serialises"),
			json!({
				"conversationId": "c1",
				"application": "paper",
				"title": "Paper",
				"scope": "user",
				"install": { "kind": "nothing" },
			})
		);
	}

	#[test]
	fn an_install_recorded_for_a_conversation_crosses_with_every_value_it_holds() {
		let record = ApplicationInstall {
			id: "i1".to_owned(),
			conversation_id: "c1".to_owned(),
			application: "superset".to_owned(),
			title: "Superset".to_owned(),
			logo: Some("superset.svg".to_owned()),
			logo_url: Some("https://icons.test/superset.png".to_owned()),
			description: Some("Run workspaces.".to_owned()),
			scope: Destination::Companion,
			destination_id: Some("b1".to_owned()),
			install: InstallCase::Oauth,
			last_message_seq: 12,
			created_at: 1_700_000_000_000,
		};

		assert_eq!(
			to_string(&ApplicationInstalled::from(record)).expect("it serialises"),
			concat!(
				r#"{"id":"i1","conversationId":"c1","application":"superset","title":"Superset","#,
				r#""logo":"superset.svg","logoUrl":"https://icons.test/superset.png","#,
				r#""description":"Run workspaces.","scope":"companion","destinationId":"b1","#,
				r#""install":{"kind":"oauth"},"lastMessageSeq":12,"createdAt":1700000000000}"#,
			)
		);
	}

	#[test]
	fn an_install_field_crosses_with_its_description_before_its_concealment() {
		let field = InstallField {
			name: "Authorization".to_owned(),
			secret: "SUPERSET_API_KEY".to_owned(),
			description: Some("The workspace key.".to_owned()),
			concealed: false,
		};

		assert_eq!(
			to_string(&field).expect("it serialises"),
			r#"{"name":"Authorization","secret":"SUPERSET_API_KEY","description":"The workspace key.","concealed":false}"#
		);
	}

	#[test]
	fn an_install_field_holding_no_description_crosses_without_the_key() {
		let field = InstallField {
			name: "Authorization".to_owned(),
			secret: "SUPERSET_API_KEY".to_owned(),
			description: None,
			concealed: true,
		};

		assert_eq!(
			to_string(&field).expect("it serialises"),
			r#"{"name":"Authorization","secret":"SUPERSET_API_KEY","concealed":true}"#
		);
	}

	#[test]
	fn an_install_field_read_without_a_concealment_is_concealed() {
		let field: InstallField =
			from_value(json!({ "name": "Authorization", "secret": "SUPERSET_API_KEY" }))
				.expect("it reads");

		assert_eq!(
			field,
			InstallField {
				name: "Authorization".to_owned(),
				secret: "SUPERSET_API_KEY".to_owned(),
				description: None,
				concealed: true,
			}
		);
	}

	#[test]
	fn a_refusing_install_crosses_with_its_field_and_its_reason_beside_its_kind() {
		let refusal =
			InstallRefusal { field: "apiKey".to_owned(), reason: "it names no header.".to_owned() };

		assert_eq!(
			to_value(Install::Refused(refusal.clone())).expect("it serialises"),
			json!({ "kind": "refused", "field": "apiKey", "reason": "it names no header." })
		);
		assert_eq!(InstallCase::try_from(Install::Refused(refusal.clone())), Err(refusal));
		assert_eq!(InstallCase::try_from(Install::Oauth), Ok(InstallCase::Oauth));
	}

	#[test]
	fn a_config_reading_a_variable_no_field_names_refuses_the_install_naming_that_variable() {
		let config = json!({
			"type": "http",
			"url": "https://headed.test/mcp",
			"headers": { "Authorization": "Bearer ${AUTHORIZATION}", "X-Account": "${X_ACCOUNT}" },
		});
		let asking = Install::asking(vec![InstallField {
			name: "Authorization".to_owned(),
			secret: "AUTHORIZATION".to_owned(),
			description: None,
			concealed: true,
		}]);

		let Install::Refused(refusal) = asking.covering(&config) else {
			panic!("an unfilled reference refuses");
		};
		assert_eq!(refusal.field, "X_ACCOUNT");
		assert!(refusal.reason.contains("X_ACCOUNT"), "got {}", refusal.reason);
	}

	#[test]
	fn a_reference_the_sidecar_fills_from_its_own_fallback_leaves_the_install_as_it_stands() {
		let config = json!({ "env": { "LEVEL": "${LOG_LEVEL:-debug}" } });

		assert_eq!(Install::Nothing.covering(&config), Install::Nothing);
	}

	#[test]
	fn a_reference_carrying_a_fallback_a_field_fills_keeps_the_case_it_had() {
		let field = InstallField {
			name: "Authorization".to_owned(),
			secret: "AUTHORIZATION".to_owned(),
			description: None,
			concealed: true,
		};
		let asking = Install::asking(vec![field.clone()]);
		let config = json!({ "env": { "TOKEN": "${AUTHORIZATION:-none}" } });

		assert_eq!(asking.covering(&config), Install::Key { fields: vec![field] });
	}

	#[test]
	fn a_reference_the_sidecar_cannot_match_stays_refused_under_the_whole_name_it_reads() {
		let config = json!({ "env": { "LEVEL": "${log-level:-debug}" } });

		let Install::Refused(refusal) = Install::Nothing.covering(&config) else {
			panic!("a reference the sidecar leaves alone refuses");
		};
		assert_eq!(refusal.field, "log-level:-debug");
	}

	#[test]
	fn a_config_whose_every_reference_is_named_keeps_the_case_it_had() {
		let field = InstallField {
			name: "Authorization".to_owned(),
			secret: "AUTHORIZATION".to_owned(),
			description: None,
			concealed: true,
		};
		let asking = Install::asking(vec![field.clone()]);
		let config = json!({ "headers": { "Authorization": "Bearer ${AUTHORIZATION}" } });

		assert_eq!(asking.covering(&config), Install::Key { fields: vec![field] });
		assert_eq!(
			Install::Oauth.covering(&json!({ "url": "https://plain.test" })),
			Install::Oauth
		);
	}

	#[test]
	fn every_error_names_its_kind() {
		assert_eq!(
			to_value(ApplicationsError::RegistryRefused { status: 503 }).expect("it serialises"),
			json!({ "kind": "registryRefused", "status": 503 })
		);
		assert_eq!(
			to_value(ApplicationCallError::ApplicationRefused {
				application: "@owner/keyed".to_owned(),
				reason: "it names no header.".to_owned(),
			})
			.expect("it serialises"),
			json!({
				"kind": "applicationRefused",
				"application": "@owner/keyed",
				"reason": "it names no header.",
			})
		);
		assert_eq!(
			to_value(ApplicationsError::RegistryTimedOut).expect("it serialises"),
			json!({ "kind": "registryTimedOut" })
		);
	}
}
