use serde::{de, Deserialize, Deserializer, Serialize};
use tauri::{AppHandle, Runtime};

use super::{Clicked, Notice};

pub const ACTIVATED_EVENT: &str = "notification://activated";

#[derive(Clone, Debug, Deserialize, Serialize, specta::Type)]
pub struct NotificationTarget {
	pub kind: NotificationKind,
	pub id: String,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum NotificationKind {
	Bot,
	Conversation,
	Mission,
}

impl<'de> Deserialize<'de> for NotificationKind {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		let raw = String::deserialize(deserializer)?;
		match raw.as_str() {
			"bot" => Ok(Self::Bot),
			"conversation" => Ok(Self::Conversation),
			"mission" => Ok(Self::Mission),
			_ => {
				eprintln!("the notification target was dropped: its kind {raw:?} is unknown");
				Err(de::Error::unknown_variant(&raw, &["bot", "conversation", "mission"]))
			}
		}
	}
}

#[tauri::command]
#[specta::specta]
pub async fn notification_show<R: Runtime>(
	app: AppHandle<R>,
	target: NotificationTarget,
	title: String,
	body: String,
) {
	show(app, Notice { title, body, clicked: Clicked::Target(target) });
}

#[cfg(target_os = "macos")]
pub(super) fn show<R: Runtime>(app: AppHandle<R>, notice: Notice) {
	super::macos::show(app, notice);
}

#[cfg(not(target_os = "macos"))]
pub(super) fn show<R: Runtime>(app: AppHandle<R>, notice: Notice) {
	use tauri_plugin_notification::NotificationExt;

	let Notice { title, body, clicked } = notice;
	if let Err(failure) = app.notification().builder().title(title).body(body).show() {
		eprintln!("the notification of {clicked} was not shown: {failure}");
	}
}

#[cfg(test)]
mod tests {
	use serde_json::{from_value, json, to_value};

	use super::*;

	#[test]
	fn a_notification_reads_the_kind_it_stands_for_beside_its_id() {
		let target: NotificationTarget =
			from_value(json!({ "kind": "conversation", "id": "c-1" })).expect("the target reads");

		assert_eq!(target.kind, NotificationKind::Conversation);
		assert_eq!(target.id, "c-1");
	}

	#[test]
	fn a_clicked_notification_carries_its_kind_and_its_id_back() {
		assert_eq!(
			to_value(NotificationTarget { kind: NotificationKind::Bot, id: "b-1".to_owned() })
				.expect("the target serializes"),
			json!({ "kind": "bot", "id": "b-1" })
		);
	}

	#[test]
	fn every_kind_serializes_as_the_name_the_front_sent() {
		for (kind, name) in [
			(NotificationKind::Bot, "bot"),
			(NotificationKind::Conversation, "conversation"),
			(NotificationKind::Mission, "mission"),
		] {
			assert_eq!(to_value(kind).expect("the kind serializes"), json!(name));
			assert_eq!(from_value::<NotificationKind>(json!(name)).expect("the kind reads"), kind);
		}
	}

	#[test]
	fn a_target_of_an_unknown_kind_is_refused_naming_that_kind() {
		let refusal = from_value::<NotificationTarget>(json!({ "kind": "space", "id": "s-1" }))
			.expect_err("an unknown kind is refused");

		assert!(refusal.to_string().contains("unknown variant `space`"), "{refusal}");
	}
}
