use crate::app::{App, Ready, Screen, Thread, Workspace, connected, whole_thread};
use crate::dev_profile::{ClaudeLogin, DevProfile, ImportChoices, KiroshiSignIn};
use crate::host::{Host, HostError, Profile};
use crate::model::ClaudeItem;
use crate::model::{Agent, Conversation, Message, Participant, Role, Space};
use crate::onboarding::{Account, Connect, Page, Step};

type Scene = (&'static str, fn(&mut App));

pub const SCENES: &[Scene] = &[
	("welcome-conversations", |s| welcome(s, Page::Conversations)),
	("welcome-spaces", |s| welcome(s, Page::Spaces)),
	("welcome-tools", |s| welcome(s, Page::Tools)),
	("connect-login-found", |s| connect(s, Connect::LoginFound)),
	("connect-nothing-found", |s| connect(s, Connect::NothingFound)),
	("connect-another-account", |s| connect(s, Connect::AnotherAccount)),
	("connect-waiting-for-the-code", |s| connect(s, Connect::WaitingForCode)),
	("connect-key-field", |s| connect(s, Connect::KeyField)),
	("import-list", import_list),
	("account-empty", |s| account(s, Account::SignedOut)),
	("account-waiting", |s| account(s, Account::Waiting)),
	("account-signed-in", account_signed_in),
	("host-failed", host_failed),
	("live", read_the_dev_host_before_the_first_frame),
	("thread", thread),
];

fn welcome(s: &mut App, page: Page) {
	s.dev_profile = Some(DevProfile::default());
	s.screen = Screen::Onboarding(Step::Welcome(page));
}

fn connect(s: &mut App, connect: Connect) {
	s.dev_profile = Some(DevProfile {
		claude: Some(ClaudeLogin {
			email: "alex.martin@example.com".into(),
			plan: "Claude Max".into(),
		}),
		..DevProfile::default()
	});
	s.screen = Screen::Onboarding(Step::Connect(connect));
}

fn item(key: &str, name: &str, description: &str) -> ClaudeItem {
	ClaudeItem {
		key: key.into(),
		name: name.into(),
		description: description.into(),
		already_imported: false,
	}
}

fn import_list(s: &mut App) {
	let choices = ImportChoices {
		agents: vec![
			item("agent:atlas", "Atlas", "Reviews pull requests and flags risky changes."),
			item("agent:wren", "Wren", "Writes release notes from merged work."),
		],
		claude_md: Some(item(
			"claude-md",
			"CLAUDE.md",
			"Your standing instructions, 42 lines. Kept as yours, for every agent.",
		)),
		skills: ["commit-style", "test-first", "review-checklist", "changelog"]
			.iter()
			.map(|name| item(&format!("skill:{name}"), name, ""))
			.collect(),
	};
	s.import_selected = choices.keys();
	s.dev_profile = Some(DevProfile { import: Some(choices), ..DevProfile::default() });
	s.screen = Screen::Onboarding(Step::Import);
}

fn account(s: &mut App, account: Account) {
	s.dev_profile = Some(DevProfile::default());
	s.screen = Screen::Onboarding(Step::Account(account));
}

fn account_signed_in(s: &mut App) {
	s.dev_profile = Some(DevProfile {
		kiroshi: Some(KiroshiSignIn {
			email: "alex.martin@example.com".into(),
			plan: Some("pro".into()),
		}),
		..DevProfile::default()
	});
	s.screen = Screen::Onboarding(Step::Account(Account::SignedOut));
}

fn host_failed(s: &mut App) {
	s.screen = Screen::Conversations;
	s.workspace = Workspace::Failed(HostError::NotRunning { profile: Profile::Installed });
}

const SAMPLE: &str = r#"Here's the plan for **launch week**, with the parts that moved:

1. Freeze the docs on *Thursday*
2. Ship `2.4` on Friday

```rust
fn ship(version: &str) -> Result<(), Release> {
    let notes = notes_for(version)?;
    publish(notes)
}
```

```mermaid
flowchart LR
  Draft --> Review --> Ship
```

$$
e^{i\pi} + 1 = 0
$$

| Section | Owner | Done |
| --- | --- | --- |
| Notes | Wren | 3 of 5 |
| Docs | Juniper | yes |

![release chart](relative/chart.png)
"#;

fn thread(s: &mut App) {
	let wren = Agent {
		id: "wren".into(),
		name: "Wren".into(),
		title: "Writes release notes".into(),
		avatar_blot: Some(42.0),
	};
	let atlas = Agent {
		id: "atlas".into(),
		name: "Atlas".into(),
		title: "Reviews code".into(),
		avatar_blot: Some(257.0),
	};
	let seat = |agent: &Agent| Participant {
		bot_id: agent.id.clone(),
		name: agent.name.clone(),
		avatar_blot: agent.avatar_blot,
		left_at: None,
		is_deleted: false,
	};
	let conversation = Conversation {
		id: "launch".into(),
		title: "Launch week".into(),
		participants: vec![seat(&wren), seat(&atlas)],
	};
	let message = |seq: i64, role: Role, author: Option<&str>, content: &str| Message {
		id: format!("m{seq}"),
		conversation_id: "launch".into(),
		seq,
		role,
		content: content.into(),
		author_bot_id: author.map(str::to_owned),
		author_name: None,
	};
	let mut messages = Vec::new();
	for turn in 0..150 {
		messages.push(message(
			turn * 2,
			Role::User,
			None,
			&format!("<@wren> can you check part {turn}?"),
		));
		messages.push(message(
			turn * 2 + 1,
			Role::Assistant,
			Some("wren"),
			&format!("Part {turn} reads fine. Nothing to change."),
		));
	}
	messages.push(message(300, Role::User, None, "Can you two get the docs ready for Friday?"));
	messages.push(message(301, Role::Assistant, Some("wren"), SAMPLE));
	s.screen = Screen::Conversations;
	let mut thread = Thread::of_conversation(&conversation);
	thread.messages = messages;
	thread.loaded = true;
	s.thread = Some(thread);
	s.workspace = Workspace::Ready(Ready {
		host: Host::detached(),
		space: Space { id: "space".into(), name: "Work".into() },
		agents: vec![wren, atlas],
		conversations: vec![conversation],
	});
}

fn read_the_dev_host_before_the_first_frame(s: &mut App) {
	s.screen = Screen::Conversations;
	let ready = match connected(Profile::Installed) {
		Ok(ready) => ready,
		Err(failure) => {
			s.workspace = Workspace::Failed(failure);
			return;
		}
	};
	if let Some(conversation) = ready.first_conversation_with_an_agent() {
		let mut thread = Thread::of_conversation(conversation);
		match whole_thread(&ready.host, &conversation.id) {
			Ok(messages) => messages.into_iter().for_each(|message| thread.stored(message)),
			Err(failure) => thread.failure = Some(failure),
		}
		thread.loaded = true;
		s.thread = Some(thread);
	}
	s.workspace = Workspace::Ready(ready);
}
