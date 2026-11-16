use std::convert::Infallible;
use std::future::Future;

use tauri::{AppHandle, Runtime};
use tokio::sync::broadcast::error::RecvError;
use tokio::sync::broadcast::Receiver;

use super::description::HeardEvent;
use super::member_link::MemberLink;
use crate::events::Frame;
use crate::library::contract::{LibraryCommentMentioned, COMMENT_MENTIONED_EVENT};
use crate::library::{raised_for, PersonHere};

pub(super) fn alongside<R: Runtime>(
	app: AppHandle<R>,
	member: PersonHere,
	link: &MemberLink,
	linked: impl Future<Output = ()>,
) -> impl Future<Output = ()> {
	let heard = link.subscribed();
	async move {
		tokio::select! {
			() = linked => {}
			never = followed(&app, &member, heard) => match never {},
		}
	}
}

async fn followed<R: Runtime>(
	app: &AppHandle<R>,
	member: &PersonHere,
	heard: Option<Receiver<Frame>>,
) -> Infallible {
	if let Some(mut heard) = heard {
		loop {
			match heard.recv().await {
				Ok(frame) => raised_if_mentioned(app, member, &frame),
				Err(RecvError::Lagged(missed)) => log::warn!(
					"joined space {} missed {missed} events of its host: a comment mention among them raised no notification",
					member.space_id
				),
				Err(RecvError::Closed) => break,
			}
		}
	}
	std::future::pending().await
}

pub(crate) fn raised_if_mentioned<R: Runtime>(
	app: &AppHandle<R>,
	member: &PersonHere,
	frame: &str,
) {
	if let Some(mentioned) = mentioned_in(&member.space_id, frame) {
		raised_for(app, member, mentioned);
	}
}

fn mentioned_in(id: &str, frame: &str) -> Option<LibraryCommentMentioned> {
	let heard = serde_json::from_str::<HeardEvent>(frame).ok()?;
	if heard.event != COMMENT_MENTIONED_EVENT {
		return None;
	}
	serde_json::from_value(heard.payload)
		.inspect_err(|error| {
			log::warn!(
				"joined space {id} heard a comment mention of its host it could not read: {error}"
			)
		})
		.ok()
}

#[cfg(test)]
mod tests {
	use std::sync::mpsc::{channel, Receiver as Counted};
	use std::time::Duration;

	use serde_json::json;
	use tauri::test::mock_builder;
	use tauri::Manager;

	use super::*;
	use crate::notifications::{Notice, SystemNotifications};
	use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

	const BEA: &str = "account-bea";

	fn a_computer_counting_its_notices(name: &str) -> (AppOfItsOwn, Counted<Notice>) {
		let app = an_app_of_its_own(name, mock_builder());
		let (raised, counted) = channel();
		app.manage(SystemNotifications::raising_with(move |notice| {
			raised.send(notice).expect("the test counts");
		}));
		(app, counted)
	}

	fn a_frame_mentioning(people: &[&str]) -> String {
		let payload = json!({
			"spaceId": "work",
			"itemName": "notes.md",
			"itemKind": "document",
			"threadId": "t-1",
			"authorName": "Ada",
			"text": "Look at this",
			"people": people,
		});
		json!({ "event": { "event": COMMENT_MENTIONED_EVENT, "payload": payload } }).to_string()
	}

	#[tokio::test]
	async fn a_mention_heard_on_the_member_link_raises_one_notice_for_the_member_it_names() {
		let (app, counted) = a_computer_counting_its_notices("joined-mention");
		let link = MemberLink::new("instance-1", "Studio".to_owned(), BEA.to_owned());
		let member = PersonHere { person_id: BEA.to_owned(), space_id: "joined-1".to_owned() };
		let followed = tauri::async_runtime::spawn(alongside(
			app.handle().clone(),
			member,
			&link,
			std::future::pending(),
		));

		link.received(&a_frame_mentioning(&["account-cyd"]));
		link.received(&a_frame_mentioning(&[BEA]));

		let raised = counted.recv_timeout(Duration::from_secs(5)).expect("the mention is raised");
		assert_eq!(raised.title, "Ada mentioned you in notes.md");
		assert_eq!(raised.clicked.to_string(), "comment thread t-1 of space joined-1");
		assert!(counted.recv_timeout(Duration::from_millis(100)).is_err());
		followed.abort();
	}
}
