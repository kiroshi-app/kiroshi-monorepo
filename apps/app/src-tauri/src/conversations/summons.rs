use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, Runtime};

use super::awaited_runs::TurnWindows;
use super::context::mentioned_bot_ids;
use super::contract::SummonsDropped;
use crate::agent::contract::TransportError;
use crate::events::{self, SUMMONS_DROPPED};

pub const MAX_SUMMONS_PER_CHAIN: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum SummonsDropReason {
	SelfMention,
	SummonLimit,
	Cancelled,
	NotSeated,
	StartFailed,
	NeverStarted,
	LostQueue,
	Interrupted,
}

impl SummonsDropReason {
	#[cfg(test)]
	pub(crate) const ALL: [SummonsDropReason; 8] = [
		Self::SelfMention,
		Self::SummonLimit,
		Self::Cancelled,
		Self::NotSeated,
		Self::StartFailed,
		Self::NeverStarted,
		Self::LostQueue,
		Self::Interrupted,
	];

	fn is_noticed(self) -> bool {
		!matches!(self, Self::SelfMention | Self::NotSeated | Self::Cancelled)
	}

	fn name(self) -> &'static str {
		match self {
			Self::SelfMention => "selfMention",
			Self::SummonLimit => "summonLimit",
			Self::Cancelled => "cancelled",
			Self::NotSeated => "notSeated",
			Self::StartFailed => "startFailed",
			Self::NeverStarted => "neverStarted",
			Self::LostQueue => "lostQueue",
			Self::Interrupted => "interrupted",
		}
	}
}

pub(crate) struct SummonsRun<'a> {
	pub(crate) conversation_id: &'a str,
	pub(crate) turn_id: &'a str,
	pub(crate) bot_id: &'a str,
}

pub(crate) fn note_received(conversation_id: &str, message_id: &str, content: &str) {
	for bot_id in mentioned_bot_ids(content) {
		log::info!(
			"summons received | conversation: {conversation_id} | message: {message_id} | bot: {bot_id}"
		);
	}
}

pub(crate) fn note_queued(run: &SummonsRun<'_>) {
	log::info!(
		"summons queued | conversation: {} | turn: {} | bot: {}",
		run.conversation_id,
		run.turn_id,
		run.bot_id
	);
}

pub(crate) fn note_started(run: &SummonsRun<'_>) {
	log::info!(
		"summons started | conversation: {} | turn: {} | bot: {}",
		run.conversation_id,
		run.turn_id,
		run.bot_id
	);
}

pub(crate) fn note_dropped<R: Runtime>(
	app: &AppHandle<R>,
	run: &SummonsRun<'_>,
	reason: SummonsDropReason,
	error: Option<TransportError>,
) {
	log::warn!(
		"summons dropped | conversation: {} | turn: {} | bot: {} | reason: {}",
		run.conversation_id,
		run.turn_id,
		run.bot_id,
		reason.name()
	);
	if reason == SummonsDropReason::Cancelled {
		return;
	}
	let dropped = dropped_of(run, reason, error);
	if reason.is_noticed() {
		keep_for_the_room(app, dropped.clone());
	}
	if let Err(failure) = events::emit(app, SUMMONS_DROPPED, dropped) {
		log::warn!(
			"the dropped summons of bot {} in turn {} of conversation {} was not announced: {failure}",
			run.bot_id,
			run.turn_id,
			run.conversation_id
		);
	}
}

fn keep_for_the_room<R: Runtime>(app: &AppHandle<R>, dropped: SummonsDropped) {
	match crate::events::core(app.app_handle()).try_state::<TurnWindows>() {
		Some(windows) => windows.keep_unless_driven(dropped),
		None => log::error!(
			"the dropped summons of bot {} in turn {} of conversation {} found no window state to wait in",
			dropped.bot_id,
			dropped.turn_id,
			dropped.conversation_id
		),
	}
}

fn dropped_of(
	run: &SummonsRun<'_>,
	reason: SummonsDropReason,
	error: Option<TransportError>,
) -> SummonsDropped {
	SummonsDropped {
		conversation_id: run.conversation_id.to_owned(),
		turn_id: run.turn_id.to_owned(),
		bot_id: run.bot_id.to_owned(),
		reason,
		error,
	}
}

#[cfg(test)]
pub(crate) fn traced_steps(conversation_id: &str, bot_id: &str) -> Vec<String> {
	let of_the_bot = format!("| bot: {bot_id}");
	let of_the_bot_and_more = format!("{of_the_bot} |");
	let mut steps: Vec<String> =
		crate::test_log::logged_naming(&format!("| conversation: {conversation_id} |"))
			.into_iter()
			.filter(|line| line.starts_with("summons "))
			.filter(|line| line.ends_with(&of_the_bot) || line.contains(&of_the_bot_and_more))
			.map(|line| step_of(&line))
			.collect();
	steps.sort();
	steps
}

#[cfg(test)]
fn step_of(line: &str) -> String {
	let step = line.split(' ').nth(1).unwrap_or(line);
	match line.split("| reason: ").nth(1) {
		Some(reason) => format!("{step} {reason}"),
		None => step.to_owned(),
	}
}

#[cfg(test)]
mod tests {
	use super::SummonsDropReason;

	#[test]
	fn every_summons_drop_reason_crosses_under_the_name_it_logs() {
		for reason in SummonsDropReason::ALL {
			let crossed = serde_json::to_value(reason).expect("the reason serialises");
			assert_eq!(crossed, serde_json::json!(reason.name()));
		}
	}
}
