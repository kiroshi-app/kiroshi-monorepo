use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::time::Duration;

use tauri::test::mock_builder;
use tauri::Manager;
use tokio::net::TcpListener;

use super::commands::join_by_link;
use super::contract::JoinedSpaceError;
use super::relay::RelayGuests;
use crate::account::session::AccountSession;
use crate::crypto::commands::{DeviceKeysState, SpaceKeys};
use crate::crypto::device_keys::DeviceKeys;
use crate::db::connection::temp_dir;
use crate::db::{self, DatabaseState};
use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
use crate::environment::store;
use crate::invitations::Invitations;
use crate::logging::contract::InstallKind;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

const INSTANCE: &str = "6f1c2b8e-7d3a-4b5e-9c1d-2a3b4c5d6e7f";
const MEMBER_BEARER: &str = "bearer-of-bob";
const HOST_ANSWER_BOUND: Duration = Duration::from_secs(2);

fn signed_in(name: &str, bearer: &str, cloud: &str) -> (AppOfItsOwn, Vec<RemovedOnDrop>) {
	let database = temp_dir();
	let root = temp_dir();
	store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, bearer).expect("the bearer is kept");
	let app = an_app_of_its_own(name, mock_builder());
	app.manage::<DatabaseState>(Ok(db::open(&database)));
	app.manage(DeviceKeysState::new(Ok(DeviceKeys::generate().expect("randomness"))));
	let profile = app.path().app_data_dir().expect("the data folder resolves");
	let identifier = app.config().identifier.clone();
	app.manage(SpaceKeys::new(InstallKind::Dev, identifier, Some(profile)));
	app.manage(AccountSession::new(Ok::<PathBuf, _>(root.to_path_buf()), cloud));
	app.manage(RelayGuests::new(cloud).answering_within(HOST_ANSWER_BOUND));
	app.manage(Invitations::new(cloud));
	(app, vec![database, root])
}

fn run(test: impl std::future::Future<Output = ()>) {
	tauri::async_runtime::block_on(test);
}

#[test]
fn a_link_that_does_not_parse_is_refused_before_any_network_call() {
	run(async {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("a port binds");
		let unreached = format!("http://{}", listener.local_addr().expect("the port is named"));
		drop(listener);
		let (member, _temporary) = signed_in("joined-v2-malformed", MEMBER_BEARER, &unreached);
		let short_key = format!("kiroshi://join#{INSTANCE}.{}.{}", "a".repeat(10), "b".repeat(43));

		for link in ["", "kiroshi://join#nope", short_key.as_str(), "https://evil.test/join#a.b.c"]
		{
			let refused = join_by_link(member.handle().clone(), link.to_owned()).await;
			assert_eq!(
				refused.map(|joined| joined.id),
				Err(JoinedSpaceError::MalformedLink),
				"{link}"
			);
		}
	});
}
