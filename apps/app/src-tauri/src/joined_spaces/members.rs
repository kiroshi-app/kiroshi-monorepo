use std::convert::Infallible;
use std::future::Future;

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};
use tokio::time::{interval, MissedTickBehavior};

use super::commands::ready;
use super::contract::JoinedSpaceError;
use super::held;
use super::relay::RelayGuests;
use crate::account::cloud::{CloudRosterMember, MemberCallError};
use crate::account::session::{self, AccountSession};
use crate::crypto::fingerprint::fingerprint;
use crate::db;
use crate::db::repositories::joined_space_members::{JoinedSpaceMember, JoinedSpaceRole};
use crate::db::repositories::joined_spaces::{JoinedReach, JoinedSpace};
use crate::events::{self, JOINED_SPACE_MEMBERS_CHANGED};
use crate::hosting::roster::Rostered;
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
		let JoinedReach::Relay { instance_id } = &joined.reach;
		log::warn!(
			"the members of joined space {} (instance {instance_id}) were not read: {failure:?}",
			joined.id
		);
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
	let Some(roster) = held::roster(app, instance_id).await? else {
		return Ok(Vec::new());
	};
	let listed = match app.state::<RelayGuests>().cloud().roster(&bearer, instance_id).await {
		Ok(listed) => listed,
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
	let mut members: Vec<JoinedSpaceMember> =
		roster.rows.iter().map(|row| member_of(row, &roster.host, &listed)).collect();
	members.sort_by_key(|member| member.role);
	Ok(members)
}

fn member_of(row: &Rostered, host: &Rostered, listed: &[CloudRosterMember]) -> JoinedSpaceMember {
	let present = listed.iter().find(|member| member.user_id == row.account_id);
	let role = if row.device_id == host.device_id {
		JoinedSpaceRole::Host
	} else {
		JoinedSpaceRole::Guest
	};
	JoinedSpaceMember {
		user_id: row.account_id.clone(),
		name: present.and_then(|member| member.name.clone()),
		role,
		device_id: row.device_id.to_string(),
		fingerprint: fingerprint(&row.signing).map(str::to_owned).to_vec(),
		is_present: present.is_some(),
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

	use super::super::contract::JoinedSpaceWaitReason;
	use super::super::held::{device_keys, kept};
	use super::super::roster_set::fixtures::{signed_set, Device};
	use super::super::roster_set::{verified_set, Handed};
	use super::*;
	use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
	use crate::crypto::device_keys::DeviceKeys;
	use crate::crypto::space_key::HeldSpaceKey;
	use crate::db::connection::temp_dir;
	use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
	use crate::environment::store;
	use crate::joined_spaces::commands::joined_space_connect;
	use crate::joined_spaces::relay;
	use crate::logging::contract::InstallKind;
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const INSTANCE: &str = "instance-1";

	const BEARER: &str = "the-account-bearer";

	const HEARD_WITHIN: Duration = Duration::from_secs(5);

	const SILENT_FOR: Duration = Duration::from_millis(200);

	const DEVICE_SECRET: [u8; 64] = [7; 64];

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
		app.manage(DeviceKeysState::new(Ok(DeviceKeys::from_secret(&DEVICE_SECRET))));
		app.manage(SpaceKeys::new(InstallKind::Dev, "members".to_owned(), Some(dir.join("keys"))));
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

	async fn signed_roster_planted(app: &App<MockRuntime>) {
		let own = device_keys(app.handle()).expect("the device keys");
		let host = DeviceKeys::generate().expect("randomness");
		let eve = DeviceKeys::generate().expect("randomness");
		let set = signed_set(
			&host,
			1,
			1,
			&[
				Device { keys: &host, relay_device_id: "r-host", account_id: "owner" },
				Device { keys: &own, relay_device_id: "r-bob", account_id: "bob" },
				Device { keys: &eve, relay_device_id: "r-eve", account_id: "eve" },
			],
		);
		let roster = verified_set(set, None, &own.device_id()).expect("the roster verifies");
		let handed = Handed { space: HeldSpaceKey::first().expect("randomness"), roster };
		assert!(kept(app.handle(), INSTANCE, &handed).await.expect("the roster is kept"));
	}

	async fn joined_space(app: &App<MockRuntime>) -> JoinedSpace {
		signed_roster_planted(app).await;
		relay::joined(app.handle(), INSTANCE.to_owned(), Some("Studio".to_owned()))
			.await
			.expect("the join");
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state).expect("the database").joined_spaces().list().await;
		held.expect("the list").into_iter().next().expect("the joined space is held")
	}

	fn listed(members: &[(&str, &str)]) -> Value {
		let mut roster = vec![json!({ "userId": "owner", "name": "Ann", "role": "owner" })];
		roster.extend(
			members
				.iter()
				.map(|(id, name)| json!({ "userId": id, "name": name, "role": "member" })),
		);
		Value::Array(roster)
	}

	type Seen = (String, Option<String>, String, bool);

	fn seen(members: &Value) -> Vec<Seen> {
		let rows = members.as_array().expect("a member list");
		rows.iter()
			.map(|row| {
				assert_eq!(row["fingerprint"].as_array().map(Vec::len), Some(6), "{row}");
				assert_eq!(row["deviceId"].as_str().map(str::len), Some(32), "{row}");
				let user_id = row["userId"].as_str().expect("a user id").to_owned();
				let role = row["role"].as_str().expect("a role").to_owned();
				let name = row["name"].as_str().map(str::to_owned);
				(user_id, name, role, row["isPresent"] == true)
			})
			.collect()
	}

	fn rows(expected: &[(&str, Option<&str>, &str, bool)]) -> Vec<Seen> {
		expected
			.iter()
			.map(|(id, name, role, is_present)| {
				((*id).to_owned(), name.map(str::to_owned), (*role).to_owned(), *is_present)
			})
			.collect()
	}

	fn sorted_guests(mut seen: Vec<Seen>) -> Vec<Seen> {
		seen[1..].sort();
		seen
	}

	async fn stored_json(app: &App<MockRuntime>, id: &str) -> Value {
		serde_json::to_value(stored(app, id).await.expect("stored")).expect("json")
	}

	#[tokio::test]
	async fn every_device_of_the_signed_roster_is_listed_host_first_and_named_by_the_relay() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(listed(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);

		let joined = joined_space(&app).await;

		let changed = next(&mut hearing).await;
		let expected = rows(&[
			("owner", Some("Ann"), "host", true),
			("bob", Some("Bob"), "guest", true),
			("eve", None, "guest", false),
		]);
		assert_eq!(changed["id"], joined.id.as_str());
		assert_eq!(sorted_guests(seen(&changed["members"])), expected);
		assert_eq!(sorted_guests(seen(&stored_json(&app, &joined.id).await)), expected);
	}

	#[tokio::test]
	async fn a_renamed_member_and_one_the_relay_no_longer_lists_reach_the_front_on_the_next_read() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(listed(&[("bob", "Bob"), ("eve", "Eve")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;

		relay.answers(StatusCode::OK, listed(&[("bob", "Robert")]));
		read(app.handle(), &joined).await;
		let changed = next(&mut hearing).await;

		assert_eq!(
			sorted_guests(seen(&changed["members"])),
			rows(&[
				("owner", Some("Ann"), "host", true),
				("bob", Some("Robert"), "guest", true),
				("eve", None, "guest", false),
			])
		);
	}

	#[tokio::test]
	async fn an_identical_read_emits_nothing() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(listed(&[("bob", "Bob")])).await;
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
		let (api_url, relay) = relay_answering(listed(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		let mut hearing = heard(&app);
		let joined = joined_space(&app).await;
		next(&mut hearing).await;
		let before = stored_json(&app, &joined.id).await;

		for status in
			[StatusCode::FORBIDDEN, StatusCode::NOT_FOUND, StatusCode::INTERNAL_SERVER_ERROR]
		{
			relay.answers(status, json!({}));
			read(app.handle(), &joined).await;
			assert!(is_silent(&mut hearing).await, "{status}");
		}

		assert_eq!(stored_json(&app, &joined.id).await, before);
	}

	#[tokio::test]
	async fn an_unreachable_relay_keeps_the_stored_roster() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(listed(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let (joined, before) = {
			let app = app_reaching(&dir, &api_url);
			let mut hearing = heard(&app);
			let joined = joined_space(&app).await;
			next(&mut hearing).await;
			let before = stored_json(&app, &joined.id).await;
			(joined, before)
		};
		let listener =
			tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let unreached = format!("http://{}", listener.local_addr().expect("the port is named"));
		drop(listener);
		let app = app_reaching(&dir, &unreached);
		let mut hearing = heard(&app);

		read(app.handle(), &joined).await;

		assert!(is_silent(&mut hearing).await);
		assert_eq!(stored_json(&app, &joined.id).await, before);
	}

	#[tokio::test]
	async fn a_reopened_database_answers_the_stored_roster_before_any_read() {
		let dir = temp_dir();
		let (api_url, relay) = relay_answering(listed(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let (joined, before) = {
			let app = app_reaching(&dir, &api_url);
			let mut hearing = heard(&app);
			let joined = joined_space(&app).await;
			next(&mut hearing).await;
			let before = stored_json(&app, &joined.id).await;
			(joined, before)
		};
		relay.answers(StatusCode::INTERNAL_SERVER_ERROR, json!({}));

		let app = app_reaching(&dir, &api_url);

		assert_eq!(stored_json(&app, &joined.id).await, before);
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
		let (api_url, relay) = relay_answering(listed(&[])).await;
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
	async fn a_joined_space_without_a_signed_roster_lists_nobody_the_relay_lists() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(listed(&[("bob", "Bob")])).await;
		signed_in(&dir);
		let app = app_reaching(&dir, &api_url);
		relay::joined(app.handle(), INSTANCE.to_owned(), None).await.expect("the join");
		let state = app.state::<db::DatabaseState>();
		let held = ready(&state).expect("the database").joined_spaces().list().await;
		let joined = held.expect("the list").into_iter().next().expect("the joined space");

		read(app.handle(), &joined).await;

		assert_eq!(stored(&app, &joined.id).await, Ok(Vec::new()));
	}

	#[tokio::test]
	async fn a_joined_space_without_a_space_key_waits_for_its_host_on_every_connect() {
		let dir = temp_dir();
		let (api_url, _relay) = relay_answering(listed(&[("bob", "Bob")])).await;
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

		let connections = [
			joined_space_connect(app.handle().clone(), joined.id.clone()).await,
			joined_space_connect(app.handle().clone(), joined.id.clone()).await,
		];

		for connection in connections {
			let waiting = JoinedSpaceError::WaitingForHost {
				id: joined.id.clone(),
				instance_id: INSTANCE.to_owned(),
				reason: JoinedSpaceWaitReason::HostSilent,
				detail: "no verified rekey from the host has reached this device yet".to_owned(),
			};
			assert_eq!(connection.map(|found| found.id), Err(waiting));
		}
		let guests = app.state::<RelayGuests>();
		assert!(!guests.is_running(&joined.id));
	}
}
