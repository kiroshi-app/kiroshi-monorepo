use crate::app::{App, Ready, Screen, Thread, Workspace, connected, whole_thread};
use crate::host::{Host, HostError, Profile};
use crate::model::{Agent, Conversation, Message, Participant, Role, Space};
use crate::onboarding::{Page, Step};

type Scene = (&'static str, fn(&mut App));

pub const SCENES: &[Scene] = &[
	("conversations-page", |s| s.screen = Screen::Onboarding(Step::Welcome(Page::Conversations))),
	("spaces-page", |s| s.screen = Screen::Onboarding(Step::Welcome(Page::Spaces))),
	("tools-page", |s| s.screen = Screen::Onboarding(Step::Welcome(Page::Tools))),
	("provider", |s| s.screen = Screen::Onboarding(Step::Provider)),
	("browser", |s| s.screen = Screen::Onboarding(Step::Browser)),
	("api-key", |s| s.screen = Screen::Onboarding(Step::ApiKey)),
	("import", |s| s.screen = Screen::Onboarding(Step::Import)),
	("account", |s| s.screen = Screen::Onboarding(Step::Account)),
	("account-waiting", |s| s.screen = Screen::Onboarding(Step::AccountWaiting)),
	("host-failed", host_failed),
	("live", read_the_dev_host_before_the_first_frame),
	("thread", thread),
];

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
