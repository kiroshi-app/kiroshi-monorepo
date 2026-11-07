use axum::http::header;
use reqwest::{Client, RequestBuilder};
use serde_json::{json, Value};

use super::*;
use crate::host_api::invoke::RELAYED_MEMBER_HEADER;
use crate::host_api::token;
use crate::hosting::contract::REFUSED_TO_A_MEMBER;
use crate::removed_on_drop::RemovedOnDrop;
use crate::test_core::runtime;

const DEV_SUFFIX: &str = ".dev";

struct Served {
	core: Core,
	origin: String,
	bearer: String,
	_folder: RemovedOnDrop,
}

impl Served {
	fn started(name: &str) -> Self {
		crate::missions::github::installed_tls_provider();
		let identifier = format!("com.kiroshi.{name}-{}{DEV_SUFFIX}", uuid::Uuid::new_v4());
		let folder = std::env::temp_dir().join(&identifier);
		let core = Core::new(&folder, identifier, runtime());
		start(&core);
		let origin = core.state::<Webhook>().origin().expect("the host api listens");
		let bearer = token::loaded(&core).expect("the host token reads").bearer().to_owned();
		Self { core, origin, bearer, _folder: RemovedOnDrop(folder) }
	}

	fn call(&self, command: &str) -> RequestBuilder {
		Client::new().post(format!("{}/api/invoke/{command}", self.origin))
	}

	fn authorized(&self, command: &str) -> RequestBuilder {
		self.call(command).bearer_auth(&self.bearer)
	}
}

async fn status(request: RequestBuilder) -> u16 {
	request.send().await.expect("the host api answers").status().as_u16()
}

#[tokio::test]
async fn the_served_host_api_admits_only_its_token_on_a_loopback_name_and_answers_from_the_core() {
	let served = Served::started("host-services");

	let admitted = status(served.authorized("get_device_identity")).await;
	let tokenless = status(served.call("get_device_identity")).await;
	let foreign =
		status(served.authorized("get_device_identity").header(header::HOST, "kiroshi.example"))
			.await;
	let unknown = status(served.authorized("a_command_nobody_registered")).await;

	assert_eq!((admitted, tokenless, foreign, unknown), (200, 401, 404, 404));
}

#[tokio::test]
async fn a_relayed_member_refused_by_a_command_is_answered_403_with_the_refusal() {
	let served = Served::started("host-services-relayed");

	let refused = served
		.authorized("mcp_oauth_disconnect")
		.header(RELAYED_MEMBER_HEADER, "a-nonce-nobody-vouched-for")
		.json(
			&json!({ "owner": { "kind": "user" }, "name": "linear", "url": "https://mcp.linear.app" }),
		)
		.send()
		.await
		.expect("the host api answers");

	assert_eq!(refused.status().as_u16(), 403);
	let refusal: Value = refused.json().await.expect("the refusal is JSON");
	assert_eq!(refusal["kind"], json!(REFUSED_TO_A_MEMBER));
}

#[tokio::test]
async fn opening_the_host_services_manages_every_state_the_relay_reaches() {
	let served = Served::started("host-services-states");

	assert!(served.core.try_state::<crate::crypto::commands::DeviceKeysState>().is_some());
	assert!(served.core.try_state::<crate::crypto::commands::SpaceKeys>().is_some());
	assert!(served.core.try_state::<Hosting>().is_some());
	assert!(served.core.try_state::<Invitations>().is_some());
	assert!(served.core.try_state::<Devices>().is_some());
	assert!(served.core.try_state::<RelayGuests>().is_some());
}

#[tokio::test]
async fn a_stopped_host_api_no_longer_answers_its_token() {
	let served = Served::started("host-services-stopped");
	assert_eq!(status(served.authorized("get_device_identity")).await, 200);

	stop(&served.core);

	let deadline = tokio::time::Instant::now() + std::time::Duration::from_secs(5);
	loop {
		let answered = served.authorized("get_device_identity").send().await;
		if answered.map_or(true, |answer| answer.status().as_u16() != 200) {
			return;
		}
		assert!(tokio::time::Instant::now() < deadline, "the stopped host api still answers");
		tokio::time::sleep(std::time::Duration::from_millis(20)).await;
	}
}
