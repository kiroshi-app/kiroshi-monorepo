use kiroshi_core::account::session::{SignedInWork, Working};
use tokio::sync::MutexGuard;

use crate::core_context::Core;
use crate::{devices, hosting, invitations, joined_spaces};

pub struct AppSignedInWork;

impl SignedInWork for AppSignedInWork {
	fn signed_in<'a>(&'a self, core: &'a Core) -> Working<'a, ()> {
		Box::pin(async move {
			devices::signed_in(core).await;
			invitations::resumed(core);
		})
	}

	fn launched_signed_out<'a>(&'a self, core: &'a Core) -> Working<'a, ()> {
		Box::pin(hosting::resumed(core))
	}

	fn renamed(&self, core: &Core) {
		hosting::renamed(core);
	}

	fn stopped<'a>(&'a self, core: &'a Core) -> Working<'a, Option<MutexGuard<'a, ()>>> {
		Box::pin(async move {
			devices::signed_out(core).await;
			hosting::signed_out(core).await;
			invitations::signed_out(core).await;
			joined_spaces::relay::signed_out(core).await
		})
	}
}

#[cfg(test)]
mod tests {
	use std::net::Ipv4Addr;
	use std::time::Duration;

	use axum::http::{header, HeaderMap, StatusCode};
	use axum::routing::get;
	use axum::Router;
	use serde_json::json;
	use tokio::net::TcpListener;

	use super::*;
	use crate::account::contract::{AccountState, SignedOutReason};
	use crate::account::session::{self, AccountSession};
	use crate::environment::contract::{EnvScope, ACCOUNT_BEARER};
	use crate::environment::store;
	use crate::joined_spaces::relay::RelayGuests;
	use crate::removed_on_drop::RemovedOnDrop;
	use crate::test_core::a_core_of_its_own;

	const BEARER: &str = "bearer-that-never-leaves";

	const PATIENCE: Duration = Duration::from_secs(60);

	type Answered = (StatusCode, [(header::HeaderName, &'static str); 1], String);

	async fn me(headers: HeaderMap) -> Answered {
		let bearer = headers.get(header::AUTHORIZATION).and_then(|value| value.to_str().ok());
		let (status, body) = match bearer == Some(&format!("Bearer {BEARER}")) {
			true => (
				StatusCode::OK,
				json!({ "id": "u1", "email": "steve@example.com", "createdAt": "2026-10-01T00:00:00.000Z" }),
			),
			false => (StatusCode::UNAUTHORIZED, json!({ "message": "no session" })),
		};
		(status, [(header::CONTENT_TYPE, "application/json")], body.to_string())
	}

	async fn a_cloud_refusing_the_instances_route() -> String {
		let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.expect("the stub binds");
		let address = listener.local_addr().expect("the stub is named");
		let router = Router::new()
			.route("/me", get(me))
			.route("/instances", get(|| async { StatusCode::UNAUTHORIZED }));
		tokio::spawn(async move { axum::serve(listener, router).await });
		format!("http://{address}")
	}

	#[test]
	fn a_401_on_the_instances_route_signs_out_on_site_and_deletes_the_bearer() {
		crate::test_core::runtime().block_on(async {
			let api = a_cloud_refusing_the_instances_route().await;
			let core = a_core_of_its_own("instances-401");
			let root = RemovedOnDrop(
				std::env::temp_dir().join(format!("kiroshi-account-{}", uuid::Uuid::new_v4())),
			);
			store::set(&root, &EnvScope::Account, ACCOUNT_BEARER, BEARER).expect("kept");
			core.manage(AccountSession::new(Ok(root.to_path_buf()), &api));
			core.manage(RelayGuests::new(&api));
			session::install_signed_in_work(&core, AppSignedInWork);
			session::restore(core.core().clone()).await;
			assert!(matches!(core.state::<AccountSession>().current(), AccountState::SignedIn(_)));

			crate::joined_spaces::relay::reconciled(&core).await;

			let signed_out =
				AccountState::SignedOut { reason: Some(SignedOutReason::SignedOutOnSite) };
			tokio::time::timeout(PATIENCE, async {
				while core.state::<AccountSession>().current() != signed_out {
					tokio::time::sleep(Duration::from_millis(10)).await;
				}
			})
			.await
			.expect("the account signs out on site in time");
			let held = store::values(&root, &EnvScope::Account).expect("the store reads");
			assert_eq!(held.get(ACCOUNT_BEARER), None);
		});
	}
}
