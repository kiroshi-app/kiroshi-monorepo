use serde_json::json;

use crate::app::whole_thread;
use crate::host::HostError;
use crate::model::{Conversation, MessagePage};
use crate::source::Source;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Longest {
	pub conversation_id: String,
	pub messages: usize,
}

pub fn longest(
	host: &Source,
	conversations: &[Conversation],
) -> Result<Option<Longest>, HostError> {
	let mut bounded = Vec::with_capacity(conversations.len());
	for conversation in conversations {
		bounded.push((newest_seq(host, &conversation.id)?, conversation.id.as_str()));
	}
	pick(bounded, |conversation_id| whole_thread(host, conversation_id).map(|thread| thread.len()))
}

fn newest_seq(host: &Source, conversation_id: &str) -> Result<usize, HostError> {
	let page: MessagePage = host.invoke(
		"conversation_message_page",
		json!({ "conversationId": conversation_id, "beforeSeq": null, "limit": 1 }),
	)?;
	Ok(page.messages.iter().map(|message| message.seq.max(0) as usize).max().unwrap_or(0))
}

fn pick(
	mut bounded: Vec<(usize, &str)>,
	mut count: impl FnMut(&str) -> Result<usize, HostError>,
) -> Result<Option<Longest>, HostError> {
	bounded.sort_by_key(|&(bound, _)| std::cmp::Reverse(bound));
	let mut best: Option<Longest> = None;
	for (bound, conversation_id) in bounded {
		if bound == 0 || best.as_ref().is_some_and(|best| best.messages >= bound) {
			break;
		}
		let messages = count(conversation_id)?;
		if best.as_ref().is_none_or(|best| messages > best.messages) {
			best = Some(Longest { conversation_id: conversation_id.to_owned(), messages });
		}
	}
	Ok(best)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_newest_seq_bounds_the_count_so_only_contenders_are_read() {
		let counts = [("a", 40), ("b", 30), ("c", 12)];
		let mut read = Vec::new();
		let found = pick(vec![(50, "a"), (90, "b"), (35, "c"), (0, "d")], |id| {
			read.push(id.to_owned());
			Ok(counts.iter().find(|(held, _)| *held == id).map_or(0, |(_, count)| *count))
		});
		assert_eq!(
			found.ok().flatten(),
			Some(Longest { conversation_id: "a".into(), messages: 40 })
		);
		assert_eq!(read, ["b", "a"]);
	}
}
