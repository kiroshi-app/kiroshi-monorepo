use super::context::mentioned_bot_ids;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum SummonsDropReason {
	SelfMention,
	Cancelled,
	NotSeated,
	StartFailed,
	NeverStarted,
	LostQueue,
	Interrupted,
}

impl SummonsDropReason {
	#[cfg(test)]
	const ALL: [SummonsDropReason; 7] = [
		Self::SelfMention,
		Self::Cancelled,
		Self::NotSeated,
		Self::StartFailed,
		Self::NeverStarted,
		Self::LostQueue,
		Self::Interrupted,
	];

	fn name(self) -> &'static str {
		match self {
			Self::SelfMention => "selfMention",
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

pub(crate) fn note_dropped(run: &SummonsRun<'_>, reason: SummonsDropReason) {
	log::warn!(
		"summons dropped | conversation: {} | turn: {} | bot: {} | reason: {}",
		run.conversation_id,
		run.turn_id,
		run.bot_id,
		reason.name()
	);
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
	use std::collections::BTreeSet;
	use std::path::PathBuf;

	use super::SummonsDropReason;

	fn mirrored_reasons() -> BTreeSet<String> {
		let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
			.join("..")
			.join("src")
			.join("lib")
			.join("conversations")
			.join("summons-trace.ts");
		let mirror = std::fs::read_to_string(&path).expect("the mirror reads");
		let opening = "const SUMMONS_DROP_REASONS = [";
		let start = mirror.find(opening).expect("the mirror lists the reasons") + opening.len();
		let body = &mirror[start..];
		let body = body.split(']').next().unwrap_or(body);
		body.split('"').skip(1).step_by(2).map(str::to_owned).collect()
	}

	#[test]
	fn every_summons_drop_reason_of_the_host_is_one_the_front_declares() {
		let declared = mirrored_reasons();
		let undeclared: Vec<&str> = SummonsDropReason::ALL
			.iter()
			.map(|reason| reason.name())
			.filter(|name| !declared.contains(*name))
			.collect();

		assert!(undeclared.is_empty(), "the front declares no {undeclared:?}");
	}
}
