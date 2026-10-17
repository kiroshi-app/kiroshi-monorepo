use std::convert::Infallible;
use std::future::Future;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::time::{interval, MissedTickBehavior};

use super::commands::ready;
use super::contract::JoinedSpaceError;
use super::relay::RelayGuests;
use crate::account::cloud::{CloudRosterMember, MemberCallError, MemberRole};
use crate::account::session::{self, AccountSession};
use crate::db;
use crate::db::repositories::joined_space_members::{JoinedSpaceMember, JoinedSpaceRole};
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::events::{self, JOINED_SPACE_MEMBERS_CHANGED};
use crate::hosting::MEMBERS_EVERY;

pub const MEMBERS_CHANGED_EVENT: &str = "joined-space://members-changed";

#[derive(Debug, Clone, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct JoinedSpaceMembersChanged {
	pub id: String,
	pub members: Vec<JoinedSpaceMember>,
}

#[tauri::command]
#[specta::specta]
pub async fn joined_space_members(
	state: State<'_, db::DatabaseState>,
	id: String,
) -> Result<Vec<JoinedSpaceMember>, JoinedSpaceError> {
	let database = ready(&state)?;
	if database.joined_spaces().find(id.clone()).await?.is_none() {
		return Err(JoinedSpaceError::UnknownJoinedSpace { id });
	}
	Ok(database.joined_space_members().members(id).await?)
}

pub(super) fn read_soon<R: Runtime>(app: &AppHandle<R>, joined: &JoinedSpace) {
	let (app, joined) = (app.clone(), joined.clone());
	tauri::async_runtime::spawn(async move { read(&app, &joined).await });
}

pub(super) fn alongside<R: Runtime>(
	app: AppHandle<R>,
	joined: &JoinedSpace,
	link: impl Future<Output = ()>,
) -> impl Future<Output = ()> {
	let joined = joined.clone();
	async move {
		tokio::select! {
			() = link => {}
			never = polled(&app, &joined) => match never {},
		}
	}
}

async fn polled<R: Runtime>(app: &AppHandle<R>, joined: &JoinedSpace) -> Infallible {
	let mut reads = interval(MEMBERS_EVERY);
	reads.set_missed_tick_behavior(MissedTickBehavior::Delay);
	loop {
		reads.tick().await;
		read(app, joined).await;
	}
}

async fn read<R: Runtime>(app: &AppHandle<R>, joined: &JoinedSpace) {
	if let Err(failure) = refreshed(app, joined).await {
		eprintln!("the members of joined space {} were not read: {failure:?}", joined.id);
	}
}

async fn refreshed<R: Runtime>(
	app: &AppHandle<R>,
	joined: &JoinedSpace,
) -> Result<(), JoinedSpaceError> {
	let members = roster_of(app, joined).await?;
	let state = app.state::<db::DatabaseState>();
	let id = joined.id.clone();
	if !ready(&state)?.joined_space_members().replaced(id.clone(), members.clone()).await? {
		return Ok(());
	}
	events::emit(app, JOINED_SPACE_MEMBERS_CHANGED, JoinedSpaceMembersChanged { id, members })
		.map_err(|error| JoinedSpaceError::Undeliverable { detail: error.to_string() })
}

async fn roster_of<R: Runtime>(
	app: &AppHandle<R>,
	joined: &JoinedSpace,
) -> Result<Vec<JoinedSpaceMember>, JoinedSpaceError> {
	let bearer = match app.state::<AccountSession>().bearer() {
		Ok(Some(bearer)) => bearer,
		Ok(None) => return Err(JoinedSpaceError::NeedsSignIn),
		Err(error) => return Err(JoinedSpaceError::SessionStore { detail: format!("{error:?}") }),
	};
	let JoinedReach::Relay { instance_id } = &joined.reach;
	let roster = app.state::<RelayGuests>().cloud().roster(&bearer, instance_id).await;
	let mut members: Vec<JoinedSpaceMember> = match roster {
		Ok(roster) => roster.into_iter().map(JoinedSpaceMember::from).collect(),
		Err(MemberCallError::Revoked) => {
			session::revoked(app, &bearer);
			return Err(JoinedSpaceError::SessionRevoked);
		}
		Err(MemberCallError::Unreachable(detail)) => {
			return Err(JoinedSpaceError::RelayUnreachable { detail })
		}
		Err(refusal) => {
			return Err(JoinedSpaceError::RelayRefused { detail: format!("{refusal:?}") })
		}
	};
	members.sort_by_key(|member| member.role);
	Ok(members)
}

impl From<CloudRosterMember> for JoinedSpaceMember {
	fn from(member: CloudRosterMember) -> Self {
		let role = match member.role {
			MemberRole::Owner => JoinedSpaceRole::Host,
			MemberRole::Member => JoinedSpaceRole::Guest,
		};
		Self { user_id: member.user_id, name: member.name, role }
	}
}

#[cfg(test)]
mod tests {
	use std::net::Ipv4Addr;
	use std::path::{Path, PathBuf};
	use std::sync::{Arc, Mutex};
	use std::time::Duration;

	use axum::extract::State as Extracted;
	use axum::http::header::CONTENT_TYPE;
	use axum::http::StatusCode;
	use axum::response::{IntoResponse, Response};
	use axum::routing::{delete, get};
	use axum::Router;
	use serde_json::{json, Value};
	use tauri::test::{mock_builder, MockRuntime};
	use tauri::{App, Listener};
	use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver};
	use tokio::time::timeout;

	use super::*;
	use crate::db::connection::temp_dir;
	use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
	use crate::environment::store;
	use crate::joined_spaces::commands::joined_space_connect;
	use crate::joined_spaces::relay;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const INSTANCE: &str = "instance-1";

	const BEARER: &str = "the-account-bearer";

	const HEARD_WITHIN: Duration = Duration::from_secs(5);

	const SILENT_FOR: Duration = Duration::from_millis(200);

	struct Relay {
		answer: Mutex<(StatusCode, Value)>,
	}

	impl Relay {
		fn answers(&self, status: StatusCode, body: Value) {
			*self.answer.lock().expect("the stub answers") = (status, body);
		}
	}

	async fn relay_answering(body: Value) -> (String, Arc<Relay>) {
		let relay = Arc::new(Relay { answer: Mutex::new((StatusCode::OK, body)) });
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		let router = Router::new()
			.route("/instances/{id}/roster", get(roster_answered))
			.route("/instances/{id}/membership", delete(|| async { StatusCode::NO_CONTENT }))
			.fallback(|| async { StatusCode::FORBIDDEN })
			.with_state(relay.clone());
		tokio::spawn(async move { axum::serve(listener, router).await.expect("the stub serves") });
		(format!("http://{address}"), relay)
	}

	async fn roster_answered(Extracted(relay): Extracted<Arc<Relay>>) -> Response {
		let (status, body) = relay.answer.lock().expect("the stub answers").clone();
		(status, [(CONTENT_TYPE, "application/json")], body.to_string()).into_response()
	}

	fn app_reaching(dir: &Path, api_url: &str) -> AppOfItsOwn {
		let app = an_app_of_its_own("joined-space-members", mock_builder());
		app.manage::<db::DatabaseState>(Ok(db::open(dir)));
		app.manage(AccountSession::new(Ok::<PathBuf, _>(dir.join("account")), api_url));
		app.manage(RelayGuests::new(api_url));
		app
	}

	fn signed_in(dir: &Path) {
		store::set(&dir.join("account"), &EnvScope::Account, ACCOUNT_BEARER, BEARER)
			.expect("the bearer is kept");
	}

	fn heard(app: &App<MockRuntime>) -> UnboundedReceiver<Value> {
		let (told, hearing) = unbounded_channel();
		app.listen_any(MEMBERS_CHANGED_EVENT, move |event| {
			let payload = serde_json::from_str(event.payload()).expect("the payload is json");
			told.send(payload).expect("the test listens");
		});
		hearing
	}

	async fn next(hearing: &mut UnboundedReceiver<Value>) -> Value {
		timeout(HEARD_WITHIN, hearing.recv()).await.expect("heard in time").expect("open")
	}

	async fn is_silent(hearing: &mut UnboundedReceiver<Value>) -> bool {
		timeout(SILENT_FOR, hearing.recv()).await.is_err()
	}

	async fn stored(
		app: &App<MockRuntime>,
		id: &str,
	) -> Result<Vec<JoinedSpaceMember>, JoinedSpaceError> {
		joined_space_members(app.state(), id.to_owned()).await
	}

	async fn joined_space(app: &App<MockRuntime>) -> JoinedSpace {
		relay::joined(app.handle(), INSTANCE.to_owned(), Some("Studio".to_owned()))
			.await
			.expect("the join");
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state).expect("the database").joined_spaces().list().await;
		held.expect("the list").into_iter().next().expect("the joined space is held")
	}

	fn owner_and(guests: &[(&str, &str)]) -> Value {
		let mut roster: Vec<Value> = guests
			.iter()
			.map(|(id, name)| json!({ "userId": id, "name": name, "role": "member" }))
			.collect();
		roster.push(json!({ "userId": "owner", "name": null, "role": "owner" }));
		Value::Array(roster)
	}

	fn host_and(guests: &[(&str, &str)]) -> Value {
		let mut members = vec![json!({ "userId": "owner", "name": null, "role": "host" })];
		members.extend(
			guests.iter().map(|(id, name)| json!({ "userId": id, "name": name, "role": "guest" })),
		);
		Value::Array(members)
	}

	async fn stored_json(app: &App<MockRuntime>, id: &str) -> Value {
		serde_json::to_value(stored(app, id).await.expect("stored")).expect("json")
	}

	#[tokio::test]
	async fn another_guest_is_named_after_join_with_the_host_first() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);

		let joined = joined_space(&app).await;

		let changed = next(&mut hearing).await;
		assert_eq!(changed, json!({ "id": joined.id, "members": host_and(&[("bob", "Bob")]) }));
		assert_eq!(stored_json(&app, &joined.id).await, host_and(&[("bob", "Bob")]));
	}

	#[tokio::test]
	async fn a_renamed_guest_and_a_removed_one_reach_the_front_on_the_next_read() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(owner_and(&[("bob", "Bob"), ("eve", "Eve")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;

		relay.answers(StatusCode::OK, owner_and(&[("bob", "Robert"), ("eve", "Eve")]));
		read(app.handle(), &joined).await;
		let renamed = next(&mut hearing).await;

		relay.answers(StatusCode::OK, owner_and(&[("bob", "Robert")]));
		read(app.handle(), &joined).await;
		let removed = next(&mut hearing).await;

		assert_eq!(renamed["members"], host_and(&[("bob", "Robert"), ("eve", "Eve")]));
		assert_eq!(removed["members"], host_and(&[("bob", "Robert")]));
		assert_eq!(stored_json(&app, &joined.id).await, host_and(&[("bob", "Robert")]));
	}

	#[tokio::test]
	async fn an_identical_read_emits_nothing() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;

		read(app.handle(), &joined).await;

		assert!(is_silent(&mut hearing).await);
	}

	#[tokio::test]
	async fn a_failing_read_keeps_the_stored_roster_and_emits_nothing() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;

		for status in
			[StatusCode::FORBIDDEN, StatusCode::NOT_FOUND, StatusCode::INTERNAL_SERVER_ERROR]
		{
			relay.answers(status, json!({}));
			read(app.handle(), &joined).await;
			assert!(is_silent(&mut hearing).await, "{status}");
		}

		assert_eq!(stored_json(&app, &joined.id).await, host_and(&[("bob", "Bob")]));
	}

	#[tokio::test]
	async fn an_unreachable_relay_keeps_the_stored_roster() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let joined = {
			let app = app_reaching(&dir, &api_url);
			let mut hearing = heard(&app);
			let joined = joined_space(&app).await;
			next(&mut hearing).await;
			joined
		};
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let unreached = format!("http://{}", listener.local_addr().expect("the port is named"));
		drop(listener);
		let app = app_reaching(&dir, &unreached);
		let mut hearing = heard(&app);

		read(app.handle(), &joined).await;

		assert!(is_silent(&mut hearing).await);
		assert_eq!(stored_json(&app, &joined.id).await, host_and(&[("bob", "Bob")]));
	}

	#[tokio::test]
	async fn a_reopened_database_answers_the_stored_roster_before_any_read() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let joined = {
			let app = app_reaching(&dir, &api_url);
			let mut hearing = heard(&app);
			let joined = joined_space(&app).await;
			next(&mut hearing).await;
			joined
		};
		relay.answers(StatusCode::INTERNAL_SERVER_ERROR, json!({}));

		let app = app_reaching(&dir, &api_url);

		assert_eq!(stored_json(&app, &joined.id).await, host_and(&[("bob", "Bob")]));
	}

	#[tokio::test]
	async fn a_held_joined_space_never_read_answers_an_empty_roster_and_an_unknown_one_is_not_found(
	) {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(json!({})).await;
		relay.answers(StatusCode::INTERNAL_SERVER_ERROR, json!({}));
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let joined = joined_space(&app).await;

		assert_eq!(stored(&app, &joined.id).await, Ok(Vec::new()));
		assert_eq!(
			stored(&app, "unknown").await,
			Err(JoinedSpaceError::UnknownJoinedSpace { id: "unknown".to_owned() })
		);
	}

	#[tokio::test]
	async fn a_revoked_bearer_signs_the_account_out() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(owner_and(&[])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;
		relay.answers(StatusCode::UNAUTHORIZED, json!({}));

		read(app.handle(), &joined).await;

		timeout(HEARD_WITHIN, async {
			while app.state::<AccountSession>().bearer().expect("the store reads").is_some() {
				tokio::time::sleep(Duration::from_millis(10)).await;
			}
		})
		.await
		.expect("the revoked bearer is forgotten");
	}

	#[tokio::test]
	async fn the_relay_link_reads_the_roster_when_it_starts_and_a_left_space_forgets_it() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(owner_and(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let candidate = JoinedSpace {
			id: "joined-1".to_owned(),
			reach: JoinedReach::Relay { instance_id: INSTANCE.to_owned() },
			remote_space_id: None,
			name: "Studio".to_owned(),
		};
		let state = app.state::<db::DatabaseState>();
		let joined = ready(&state).expect("the database").joined_spaces().join(candidate).await;
		let joined = joined.expect("the join");
		let mut hearing = heard(&app);

		let connection = joined_space_connect(app.handle().clone(), joined.id.clone()).await;
		let changed = next(&mut hearing).await;

		assert_eq!(
			connection.map(|found| found.id),
			Err(JoinedSpaceError::HostOffline { id: joined.id.clone() })
		);
		assert_eq!(changed["members"], host_and(&[("bob", "Bob")]));
		relay::left(app.handle(), &joined.id).await.expect("the removal");
		let guests = app.state::<RelayGuests>();
		assert!(!guests.is_running(&joined.id));
		let roster =
			ready(&state).expect("the database").joined_space_members().members(joined.id).await;
		assert_eq!(roster.expect("the read"), Vec::new());
	}
}
