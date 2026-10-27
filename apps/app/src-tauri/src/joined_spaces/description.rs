use std::convert::Infallible;
use std::future::Future;

use serde::Deserialize;
use serde_json::{json, Value};
use tauri::{AppHandle, Manager, Runtime};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;

use super::commands::{presented, ready};
use super::contract::{JoinedSpace, JoinedSpaceError};
use super::member_link::{Answer, MemberLink};
use super::relay::{self, HostCall, RelayGuests, SharedSpace};
use crate::db;
use crate::db::repositories::joined_spaces::{self, HostListing};
use crate::events::Frame;
use crate::spaces::contract::{Space, SpaceDescribed, SpaceError, DESCRIBED_EVENT};

const SPACE_UPDATE_COMMAND: &str = "space_update";

#[derive(Deserialize)]
struct HeardEvent {
	event: String,
	payload: Value,
}

pub(super) async fn asked<R: Runtime>(
	app: &AppHandle<R>,
	id: String,
	name: String,
	colour: Option<i64>,
) -> Result<JoinedSpace, JoinedSpaceError> {
	let SharedSpace { joined, space_id, link } = relay::shared_space(app, &id).await?;
	let args = json!({ "id": space_id, "name": name, "colour": colour });
	let bound = app.state::<RelayGuests>().answer_bound();
	let call = HostCall { command: SPACE_UPDATE_COMMAND, args, bound };
	let space = space_answered(&id, relay::host_answered(app, &id, &link, call).await?)?;
	let described = joined_spaces::JoinedSpace {
		remote_space_id: Some(space_id),
		name: space.name,
		listing: HostListing { colour: space.colour, ..joined.listing },
		..joined
	};
	let state = app.state::<db::DatabaseState>();
	presented(app, ready(&state)?, described).await
}

fn space_answered(id: &str, Answer { status, body }: Answer) -> Result<Space, JoinedSpaceError> {
	match status {
		200 => {
			if let Ok(space) = serde_json::from_value(body) {
				return Ok(space);
			}
		}
		500 => {
			if let Ok(refusal) = serde_json::from_value::<SpaceError>(body) {
				return Err(JoinedSpaceError::SpaceRefused { refusal });
			}
		}
		_ => {}
	}
	log::warn!("joined space {id} could not read the {status} answer of its host to {SPACE_UPDATE_COMMAND}");
	Err(JoinedSpaceError::HostOffline { id: id.to_owned() })
}

pub(super) fn alongside<R: Runtime>(
	app: AppHandle<R>,
	id: String,
	link: &MemberLink,
	linked: impl Future<Output = ()>,
) -> impl Future<Output = ()> {
	let heard = link.subscribed();
	async move {
		tokio::select! {
			() = linked => {}
			never = followed(&app, &id, heard) => match never {},
		}
	}
}

async fn followed<R: Runtime>(
	app: &AppHandle<R>,
	id: &str,
	heard: Option<Receiver<Frame>>,
) -> Infallible {
	if let Some(mut heard) = heard {
		loop {
			match heard.recv().await {
				Ok(frame) => adopted_if_described(app, id, &frame).await,
				Err(RecvError::Lagged(missed)) => log::warn!(
					"joined space {id} missed {missed} events of its host: its name and hue wait for the next reconciliation"
				),
				Err(RecvError::Closed) => break,
			}
		}
	}
	std::future::pending().await
}

async fn adopted_if_described<R: Runtime>(app: &AppHandle<R>, id: &str, frame: &str) {
	let Some(described) = described_in(id, frame) else {
		return;
	};
	if let Err(failure) = relay::description_adopted(app, id, described).await {
		log::warn!("joined space {id} did not take the name and hue of its host: {failure:?}");
	}
}

fn described_in(id: &str, frame: &str) -> Option<SpaceDescribed> {
	let heard = serde_json::from_str::<HeardEvent>(frame).ok()?;
	if heard.event != DESCRIBED_EVENT {
		return None;
	}
	serde_json::from_value(heard.payload)
		.inspect_err(|error| {
			log::warn!(
				"joined space {id} heard a description of its host it could not read: {error}"
			)
		})
		.ok()
}
