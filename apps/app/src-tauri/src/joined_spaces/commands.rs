use serde::Serialize;
use tauri::{AppHandle, Runtime, State};

use super::contract::{JoinedSpace, JoinedSpaceConnection, JoinedSpaceError};
use super::relay::{self, RelayGuests};
use super::{deep_link, join};
use crate::db;
use crate::events::{self, JOINED_SPACE_CHANGED, JOINED_SPACE_RECONNECTED, JOINED_SPACE_REMOVED};

pub const CHANGED_EVENT: &str = "joined-space://changed";

pub const REMOVED_EVENT: &str = "joined-space://removed";

pub const RECONNECTED_EVENT: &str = "joined-space://reconnected";

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceChanged {
	pub id: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceRemoved {
	pub id: String,
	pub name: String,
}

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceReconnected {
	pub id: String,
}

pub(super) fn ready(state: &db::DatabaseState) -> Result<&db::Database, JoinedSpaceError> {
	state.as_ref().map_err(|failure| JoinedSpaceError::Unavailable { failure: failure.into() })
}

pub(super) fn announce_change<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
) -> Result<(), JoinedSpaceError> {
	events::emit(app, JOINED_SPACE_CHANGED, JoinedSpaceChanged { id })
		.map_err(|error| JoinedSpaceError::Undeliverable { detail: error.to_string() })
}

pub(super) fn announce_removal<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	name: String,
) -> Result<(), JoinedSpaceError> {
	events::emit(app, JOINED_SPACE_REMOVED, JoinedSpaceRemoved { id, name })
		.map_err(|error| JoinedSpaceError::Undeliverable { detail: error.to_string() })
}

pub(super) fn announce_reconnection<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
) -> Result<(), JoinedSpaceError> {
	events::emit(app, JOINED_SPACE_RECONNECTED, JoinedSpaceReconnected { id })
		.map_err(|error| JoinedSpaceError::Undeliverable { detail: error.to_string() })
}

#[tauri::command]
#[specta::specta]
pub async fn joined_spaces_list(
	state: State<'_, db::DatabaseState>,
	guests: State<'_, RelayGuests>,
) -> Result<Vec<JoinedSpace>, JoinedSpaceError> {
	let stored = ready(&state)?.joined_spaces().list().await?;
	Ok(stored.into_iter().map(|joined| JoinedSpace::presented(joined, guests.cloud())).collect())
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_connect<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<JoinedSpaceConnection, JoinedSpaceError> {
	relay::connected(&app, id).await
}

#[tauri::command]
#[specta::specta]
pub async fn join_by_link<R: Runtime>(
	app: AppHandle<R>,
	link: String,
) -> Result<JoinedSpace, JoinedSpaceError> {
	join::joined_by_link(&app, &link).await
}

#[tauri::command]
#[specta::specta]
pub fn join_link_listen<R: Runtime>(app: AppHandle<R>) {
	deep_link::listened(&app);
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_remove<R: Runtime>(
	app: AppHandle<R>,
	id: String,
) -> Result<(), JoinedSpaceError> {
	relay::left(&app, &id).await?;
	announce_change(&app, id)
}

#[cfg(test)]
mod tests {
	use std::net::Ipv4Addr;
	use std::path::{Path, PathBuf};
	use std::sync::mpsc::{channel, Receiver};
	use std::sync::{Arc, Mutex};
	use std::time::Duration;

	use axum::extract::{Path as Segment, State as Extracted};
	use axum::http::header::{AUTHORIZATION, CONTENT_TYPE};
	use axum::http::{HeaderMap, StatusCode};
	use axum::response::{IntoResponse, Response};
	use axum::routing::delete;
	use axum::Router;
	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener, Manager};

	use super::*;
	use crate::account::session::AccountSession;
	use crate::db::connection::temp_dir;
	use crate::db::repositories::joined_spaces::{self, JoinedReach};
	use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
	use crate::environment::store;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const API_URL: &str = "http://127.0.0.1:9";

	const INSTANCE: &str = "instance-1";

	const BEARER: &str = "the-account-bearer";

	fn app_over(dir: &Path) -> AppOfItsOwn {
		app_reaching(dir, API_URL)
	}

	fn app_reaching(dir: &Path, api_url: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own("joined-spaces", mock_builder());
		app.manage::<db::DatabaseState>(Ok(db::open(dir)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(dir.join("account")), api_url));
		app.manage(RelayGuests::new(api_url));
		app
	}

	fn signed_in(dir: &Path) {
		store::set(&dir.join("account"), &EnvScope::Account, ACCOUNT_BEARER, BEARER)
			.expect("the bearer is kept");
	}

	struct Relay {
		status: StatusCode,
		body: Option<Value>,
		asked: Mutex<Vec<(String, String)>>,
	}

	impl Relay {
		fn asked(&self) -> Vec<(String, String)> {
			self.asked.lock().expect("the stub records").clone()
		}
	}

	async fn relay_answering(status: StatusCode, body: Option<Value>) -> (String, Arc<Relay>) {
		let relay = Arc::new(Relay { status, body, asked: Mutex::default() });
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		let router = Router::new()
			.route("/instances/{id}/membership", delete(membership_left))
			.with_state(relay.clone());
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the stub serves") });
		(format!("http://{address}"), relay)
	}

	async fn membership_left(
		Extracted(relay): Extracted<Arc<Relay>>,
		Segment(instance_id): Segment<String>,
		headers: HeaderMap,
	) -> Response {
		let authorization = headers
			.get(AUTHORIZATION)
			.and_then(|value| value.to_str().ok())
			.unwrap_or_default()
			.to_owned();
		relay.asked.lock().expect("the stub records").push((instance_id, authorization));
		match &relay.body {
			Some(body) => (relay.status, [(CONTENT_TYPE, "application/json")], body.to_string())
				.into_response(),
			None => relay.status.into_response(),
		}
	}

	async fn unreached_url() -> String {
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let address = listener.local_addr().expect("the port is named");
		drop(listener);
		format!("http://{address}")
	}

	fn left_once(relay: &Relay) {
		assert_eq!(relay.asked(), vec![(INSTANCE.to_owned(), format!("Bearer {BEARER}"))]);
	}

	async fn removal_answered(status: StatusCode) {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(status, None).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let added = held(&app).await;
		let hearing = heard(&app);

		joined_space_remove(app.handle().clone(), added.id.clone()).await.expect("the removal");

		left_once(&relay);
		assert!(list(&app).await.is_empty());
		let payload = hearing.recv().expect("the removal was heard");
		assert_eq!(
			serde_json::from_str::<Value>(&payload).expect("json"),
			json!({ "id": added.id })
		);
	}

	async fn removal_refused(api_url: &str, dir: &Path) -> JoinedSpaceError {
		let app = app_reaching(dir, api_url);
		let added = held(&app).await;

		let refused = joined_space_remove(app.handle().clone(), added.id.clone())
			.await
			.expect_err("the removal is refused");

		assert_eq!(list(&app).await, vec![added]);
		refused
	}

	fn heard(app: &App<MockRuntime>) -> Receiver<String> {
		let (told, hearing) = channel();
		app.listen_any(CHANGED_EVENT, move |event| {
			told.send(event.payload().to_owned()).expect("the test listens");
		});
		hearing
	}

	async fn held(app: &App<MockRuntime>) -> JoinedSpace {
		let candidate = joined_spaces::JoinedSpace {
			id: uuid::Uuid::new_v4().to_string(),
			reach: JoinedReach::Relay { instance_id: INSTANCE.to_owned() },
			remote_space_id: Some("remote-1".to_owned()),
			name: "Studio".to_owned(),
		};
		let state = app.state::<db::DatabaseState>();
		let joined = ready(&state).expect("the database").joined_spaces().join(candidate).await;
		JoinedSpace::presented(joined.expect("the join"), app.state::<RelayGuests>().cloud())
	}

	async fn list(app: &App<MockRuntime>) -> Vec<JoinedSpace> {
		joined_spaces_list(app.state(), app.state()).await.expect("the list")
	}

	#[tokio::test]
	async fn a_held_joined_space_is_listed_over_its_relay_after_the_database_is_reopened() {
		let dir = temp_dir();
		let added = {
			let app = app_over(&dir);
			held(&app).await
		};

		let app = app_over(&dir);

		assert_eq!(added.host_url, RelayGuests::new(API_URL).cloud().member_relay_url(INSTANCE));
		assert_eq!(added.remote_space_id.as_deref(), Some("remote-1"));
		assert_eq!(added.name, "Studio");
		assert_eq!(list(&app).await, vec![added]);
	}

	#[tokio::test]
	async fn a_held_joined_space_is_connected_through_its_relay() {
		let dir = temp_dir();
		let app = app_over(&dir);
		let added = held(&app).await;

		let connection = joined_space_connect(app.handle().clone(), added.id.clone())
			.await
			.map(|found| found.id);

		assert_eq!(connection, Err(JoinedSpaceError::HostOffline { id: added.id }));
	}

	#[tokio::test]
	async fn a_removed_joined_space_is_announced_and_an_unknown_one_is_not_found() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(StatusCode::NO_CONTENT, None).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let added = held(&app).await;

		joined_space_remove(app.handle().clone(), added.id.clone()).await.expect("the removal");

		assert_eq!(
			joined_space_remove(app.handle().clone(), added.id.clone()).await,
			Err(JoinedSpaceError::UnknownJoinedSpace { id: added.id.clone() })
		);
		left_once(&relay);
		assert_eq!(
			joined_space_connect(app.handle().clone(), added.id.clone())
				.await
				.map(|found| found.id),
			Err(JoinedSpaceError::UnknownJoinedSpace { id: added.id })
		);
	}

	#[tokio::test]
	async fn a_left_membership_removes_the_joined_space() {
		removal_answered(StatusCode::NO_CONTENT).await;
	}

	#[tokio::test]
	async fn a_membership_the_relay_no_longer_knows_removes_the_joined_space() {
		removal_answered(StatusCode::NOT_FOUND).await;
	}

	#[tokio::test]
	async fn the_owner_of_the_instance_keeps_the_joined_space() {
		let dir = temp_dir();
		let refusal = json!({ "error": { "code": "OWNER_NOT_REMOVABLE" } });
		let (api_url, relay) = relay_answering(StatusCode::CONFLICT, Some(refusal)).await;
		signed_in(&dir);

		let refused = removal_refused(&api_url, &dir).await;

		assert_eq!(refused, JoinedSpaceError::OwnerNotRemovable);
		left_once(&relay);
	}

	#[tokio::test]
	async fn a_failing_relay_keeps_the_joined_space_and_names_its_answer() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(StatusCode::INTERNAL_SERVER_ERROR, None).await;
		signed_in(&dir);

		let refused = removal_refused(&api_url, &dir).await;

		let JoinedSpaceError::RelayRefused { detail } = refused else {
			panic!("the refusal is {refused:?}");
		};
		assert!(detail.contains("500"), "{detail}");
		left_once(&relay);
	}

	#[tokio::test]
	async fn an_unreachable_relay_keeps_the_joined_space() {
		let dir = temp_dir();
		signed_in(&dir);

		let refused = removal_refused(&unreached_url().await, &dir).await;

		assert!(matches!(refused, JoinedSpaceError::RelayUnreachable { .. }), "{refused:?}");
	}

	#[tokio::test]
	async fn a_signed_out_account_keeps_the_joined_space_and_asks_the_relay_nothing() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(StatusCode::NO_CONTENT, None).await;

		let refused = removal_refused(&api_url, &dir).await;

		assert_eq!(refused, JoinedSpaceError::NeedsSignIn);
		assert!(relay.asked().is_empty());
	}

	#[tokio::test]
	async fn a_revoked_bearer_refuses_the_removal_and_signs_the_account_out() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(StatusCode::UNAUTHORIZED, None).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let added = held(&app).await;

		let refused = joined_space_remove(app.handle().clone(), added.id.clone()).await;

		assert_eq!(refused, Err(JoinedSpaceError::SessionRevoked));
		left_once(&relay);
		tokio::time::timeout(Duration::from_secs(5), async {
			while app.state::<AccountSession>().bearer().expect("the store reads").is_some() {
				tokio::time::sleep(Duration::from_millis(10)).await;
			}
		})
		.await
		.expect("the revoked bearer is forgotten");
	}
}
