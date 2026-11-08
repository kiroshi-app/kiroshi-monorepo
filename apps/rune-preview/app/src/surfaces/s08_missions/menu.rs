use kiroshi_core::missions::contract::Mission;
use kiroshi_rune_kit::strings::{Key, chat};
use kiroshi_rune_kit::surfaces::s08_missions::{CopyKind, MenuFacts};

use super::feed::shown_state;
use super::view::kit_state;
use super::worker::Command;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MenuAction {
	Open,
	OpenPullRequest,
	Copy(CopyKind),
	MessageAgent,
	Answer,
	Close,
	Reopen,
}

pub fn menu_facts(mission: &Mission) -> MenuFacts {
	MenuFacts {
		state: kit_state(shown_state(mission)),
		has_pull_request: mission.pull_request_url.is_some(),
		has_branch: mission.branch.is_some(),
		has_workspace_path: mission.workspace_path.is_some(),
	}
}

pub fn copied_value(mission: &Mission, kind: CopyKind) -> Option<&str> {
	let value = match kind {
		CopyKind::IssueId => Some(mission.ticket.external_id.as_str()),
		CopyKind::Branch => mission.branch.as_deref(),
		CopyKind::PullRequestUrl => mission.pull_request_url.as_deref(),
		CopyKind::WorkspacePath => mission.workspace_path.as_deref(),
	};
	value.filter(|value| !value.is_empty())
}

pub fn copy_word(kind: CopyKind) -> Key {
	use chat::missions::menu::copy_kind;
	match kind {
		CopyKind::IssueId => copy_kind::ISSUE_ID,
		CopyKind::Branch => copy_kind::BRANCH,
		CopyKind::PullRequestUrl => copy_kind::PULL_REQUEST_URL,
		CopyKind::WorkspacePath => copy_kind::WORKSPACE_PATH,
	}
}

pub fn refusal_of(command: Command) -> Key {
	match command {
		Command::Close => chat::missions::menu::failed::CLOSE,
		Command::Reopen => chat::missions::menu::failed::REOPEN,
	}
}
