use crate::model::{ActivityStatus, AgentEvent, RuntimeScope, TurnState};
use kiroshi_rune_kit::avatar::Activity;

const SEARCH_TOOLS: [&str; 6] = ["glob", "grep", "ls", "read", "webfetch", "websearch"];
const WRITE_TOOLS: [&str; 4] = ["edit", "multiedit", "notebookedit", "write"];

struct Run {
	conversation_id: String,
	bot_id: String,
	tool: Option<Activity>,
	writing: bool,
}

impl Run {
	fn activity(&self) -> Activity {
		self.tool.unwrap_or(if self.writing { Activity::Writing } else { Activity::Thinking })
	}
}

#[derive(Default)]
pub struct Runs(Vec<Run>);

impl Runs {
	pub fn is_empty(&self) -> bool {
		self.0.is_empty()
	}

	pub fn activity(&self, conversation_id: &str, bot_id: &str) -> Option<Activity> {
		self.find(conversation_id, bot_id).map(|at| self.0[at].activity())
	}

	pub fn heard(&mut self, scope: &RuntimeScope, event: &AgentEvent) {
		match event {
			AgentEvent::TurnChanged { state: TurnState::Idle | TurnState::Failed }
			| AgentEvent::TurnEnded { .. }
			| AgentEvent::Failed { .. } => self.end(scope),
			AgentEvent::TurnChanged { .. } => {
				self.run(scope);
			}
			AgentEvent::MessageStarted { .. } | AgentEvent::MessageDelta { .. } => {
				self.run(scope).writing = true
			}
			AgentEvent::MessageCompleted { .. } => self.run(scope).writing = false,
			AgentEvent::Activity { activity } => {
				let running =
					matches!(activity.status, ActivityStatus::Pending | ActivityStatus::Running);
				self.run(scope).tool = running.then(|| tool_activity(&activity.title));
			}
			AgentEvent::Other => {}
		}
	}

	fn find(&self, conversation_id: &str, bot_id: &str) -> Option<usize> {
		self.0.iter().position(|run| run.conversation_id == conversation_id && run.bot_id == bot_id)
	}

	fn run(&mut self, scope: &RuntimeScope) -> &mut Run {
		let at = match self.find(&scope.conversation_id, &scope.bot_id) {
			Some(at) => at,
			None => {
				self.0.push(Run {
					conversation_id: scope.conversation_id.clone(),
					bot_id: scope.bot_id.clone(),
					tool: None,
					writing: false,
				});
				self.0.len() - 1
			}
		};
		&mut self.0[at]
	}

	fn end(&mut self, scope: &RuntimeScope) {
		if let Some(at) = self.find(&scope.conversation_id, &scope.bot_id) {
			self.0.remove(at);
		}
	}
}

fn tool_activity(title: &str) -> Activity {
	let tool = title
		.split(|c: char| c.is_whitespace() || matches!(c, '·' | ':' | '('))
		.next()
		.unwrap_or_default()
		.to_lowercase();
	if SEARCH_TOOLS.contains(&tool.as_str()) {
		return Activity::Searching;
	}
	if WRITE_TOOLS.contains(&tool.as_str()) {
		return Activity::Writing;
	}
	Activity::Working
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::model::{ToolActivity, TurnEnded};

	fn scope() -> RuntimeScope {
		RuntimeScope { conversation_id: "c-1".into(), bot_id: "b-1".into() }
	}

	#[test]
	fn a_turn_runs_from_its_start_to_its_end_with_main_activity_kinds() {
		let mut runs = Runs::default();
		runs.heard(&scope(), &AgentEvent::TurnChanged { state: TurnState::Running });
		assert_eq!(runs.activity("c-1", "b-1"), Some(Activity::Thinking));
		let grep = ToolActivity { title: "Grep: TODO".into(), status: ActivityStatus::Running };
		runs.heard(&scope(), &AgentEvent::Activity { activity: grep });
		assert_eq!(runs.activity("c-1", "b-1"), Some(Activity::Searching));
		let done = ToolActivity { title: "Grep: TODO".into(), status: ActivityStatus::Succeeded };
		runs.heard(&scope(), &AgentEvent::Activity { activity: done });
		runs.heard(&scope(), &AgentEvent::MessageDelta { id: "m".into(), text: "hi".into() });
		assert_eq!(runs.activity("c-1", "b-1"), Some(Activity::Writing));
		assert_eq!(runs.activity("c-2", "b-1"), None);
		let ended = TurnEnded { outcome: "completed".into() };
		runs.heard(&scope(), &AgentEvent::TurnEnded { ended });
		assert!(runs.is_empty());
	}
}
