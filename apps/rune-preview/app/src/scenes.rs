use rune::TextEdit;

use serde_json::json;

use crate::app::{
	App, Board, Live, Pane, Person, Ready, Thread, Workspace, connected, whole_thread,
};
use crate::dev_profile::{ClaudeLogin, DevProfile, ImportChoices, KiroshiSignIn};
use crate::host::{Host, HostError, Profile};
use crate::longest;
use crate::model::{Agent, Conversation, LastWord, Message, Participant, Role, Space};
use crate::model::{AgentEvent, ClaudeItem, RuntimeScope};
use crate::model::{ConversationMissions, MissionDetail, MissionOnBoard};
use crate::navigation::Route;
use crate::onboarding::{Account, Connect, Page, Step};
use crate::source::Source;

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
	("live", live_longest),
	("live-mission", live_mission),
	("live-mission-turn", live_mission_turn),
	("thread", thread_default),
	("thread-long", thread_long),
	("thread-empty", thread_empty),
	("thread-streaming", thread_streaming),
	("thread-mention", thread_mention),
	("thread-math", thread_math),
	("thread-rich", thread_rich),
	("block-spike", block_spike),
];

fn block_spike(s: &mut App) {
	s.spike = crate::spike::editor::Editor::from_markdown(crate::spike::SAMPLE);
	s.spike.focus(1, 0, 0);
	s.navigation.navigate_main(Route::BlockSpike);
}

fn welcome(s: &mut App, page: Page) {
	s.dev_profile = Some(DevProfile::default());
	s.navigation.navigate_main(Route::Onboarding(Step::Welcome(page)));
}

fn connect(s: &mut App, connect: Connect) {
	s.dev_profile = Some(DevProfile {
		claude: Some(ClaudeLogin {
			email: "alex.martin@example.com".into(),
			plan: "Claude Max".into(),
		}),
		..DevProfile::default()
	});
	s.navigation.navigate_main(Route::Onboarding(Step::Connect(connect)));
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
	s.navigation.navigate_main(Route::Onboarding(Step::Import));
}

fn account(s: &mut App, account: Account) {
	s.dev_profile = Some(DevProfile::default());
	s.navigation.navigate_main(Route::Onboarding(Step::Account(account)));
}

fn account_signed_in(s: &mut App) {
	s.dev_profile = Some(DevProfile {
		kiroshi: Some(KiroshiSignIn {
			email: "alex.martin@example.com".into(),
			plan: Some("pro".into()),
		}),
		..DevProfile::default()
	});
	s.navigation.navigate_main(Route::Onboarding(Step::Account(Account::SignedOut)));
}

fn host_failed(s: &mut App) {
	s.navigation.navigate_main(Route::Conversations);
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

const AGENTS: [(&str, &str, f32, &str); 6] = [
	(
		"skippy",
		"Skippy",
		257.0,
		"Two packages: `@workspace/ui` holds the design system, `app` holds the Tauri shell.",
	),
	("atlas", "Atlas", 186.0, "Pulled the three papers and summarised them."),
	("beacon", "Beacon", 82.0, "Renamed the transport module and its tests."),
	("cinder", "Cinder", 63.0, "Ran the suite twice, both green."),
	("dune", "Dune", 132.0, "Nothing since the migration landed."),
	("ember", "Ember", 296.0, "Left four comments on the transport rewrite."),
];

const MINUTES: i64 = 60_000;

fn workspace(s: &mut App) -> i64 {
	let now = std::time::SystemTime::now()
		.duration_since(std::time::UNIX_EPOCH)
		.map_or(0, |elapsed| elapsed.as_millis() as i64);
	let agents: Vec<Agent> = AGENTS
		.iter()
		.map(|(id, name, hue, _)| Agent {
			id: (*id).into(),
			name: (*name).into(),
			title: if *id == "atlas" { "Research".into() } else { String::new() },
			avatar_blot: Some(*hue),
		})
		.collect();
	let conversations = AGENTS
		.iter()
		.enumerate()
		.map(|(index, (id, name, hue, last))| Conversation {
			id: format!("chat-{id}"),
			title: (*name).into(),
			color: None,
			participants: vec![Participant {
				bot_id: (*id).into(),
				name: (*name).into(),
				avatar_blot: Some(*hue),
				left_at: None,
				is_deleted: false,
			}],
			last_activity_at: Some(now - (index as i64 * 7 + 2) * MINUTES),
			last_word: Some(LastWord { text: Some((*last).into()) }),
			solo_bot_id: Some((*id).into()),
		})
		.collect();
	s.navigation.navigate_main(Route::Conversations);
	s.dev_profile = Some(DevProfile::default());
	s.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: "space".into(), name: "Personal".into(), colour: None },
		agents,
		conversations,
		person: Person::SignedIn("ada.martin@example.com".into()),
		longest: None,
	});
	now
}

fn opened(s: &mut App, conversation_id: &str, messages: Vec<Message>) {
	let Some(conversation) = s
		.ready()
		.and_then(|ready| ready.conversations.iter().find(|held| held.id == conversation_id))
	else {
		return;
	};
	let mut thread = Thread::of_conversation(conversation);
	thread.messages = messages;
	thread.loaded = true;
	s.thread = Some(thread);
}

fn message(seq: i64, role: Role, content: &str) -> Message {
	Message {
		id: format!("m{seq}"),
		conversation_id: "chat-skippy".into(),
		seq,
		role,
		content: content.into(),
		author_bot_id: (role == Role::Assistant).then(|| "skippy".into()),
		author_name: None,
		created_at: seq * MINUTES,
	}
}

fn default_exchange() -> Vec<Message> {
	vec![
		message(1, Role::User, "How is this workspace laid out?"),
		message(2, Role::Assistant, AGENTS[0].3),
	]
}

fn thread_default(s: &mut App) {
	workspace(s);
	opened(s, "chat-skippy", default_exchange());
}

const MATH: &str = r"The sync covered $n = 40$ nests, one of them empty.

$$
\sum_{i=1}^{n} o_i = \frac{3n}{4}
$$

| Nest | Eggs | Share |
| --- | ---: | --- |
| North | 12 | $\frac{12}{40}$ |
| South | 28 | $0.7$ |";

const RICH: &str = "| nest | occupants | status | archived |
| :--- | ---: | :---: | --- |
| nest_42 | 3 | active | no |
| nest_43 | 0 | empty | yes |
| nest_44 | 12 | active | no |

```mermaid
flowchart TD
	A[Read the nest] --> B{Occupants?}
	B -- yes --> C[Summarise]
	B -- no --> D[Archive]
	C --> E[Notify the owner]
	D --> E
```";

fn thread_rich(s: &mut App) {
	workspace(s);
	let question = message(1, Role::User, "Which nests are still active?");
	opened(s, "chat-skippy", vec![question, message(2, Role::Assistant, RICH)]);
}

fn thread_math(s: &mut App) {
	workspace(s);
	let question = message(1, Role::User, "How many nests did the sync cover?");
	opened(s, "chat-skippy", vec![question, message(2, Role::Assistant, MATH)]);
}

fn thread_long(s: &mut App) {
	workspace(s);
	let mut messages = Vec::new();
	for turn in 0..150 {
		messages.push(message(
			turn * 2,
			Role::User,
			&format!("<@skippy> can you check part {turn}?"),
		));
		messages.push(message(
			turn * 2 + 1,
			Role::Assistant,
			&format!("Part {turn} reads fine. Nothing to change."),
		));
	}
	messages.push(message(300, Role::User, "Can you get the docs ready for Friday?"));
	messages.push(message(301, Role::Assistant, SAMPLE));
	opened(s, "chat-skippy", messages);
}

fn thread_empty(s: &mut App) {
	workspace(s);
	opened(s, "chat-skippy", Vec::new());
}

fn thread_streaming(s: &mut App) {
	workspace(s);
	opened(s, "chat-skippy", vec![message(1, Role::User, "How is this workspace laid out?")]);
	if let Some(thread) = s.thread.as_mut() {
		thread.live.push(Live {
			id: "live".into(),
			bot_id: "skippy".into(),
			text: "Two packages: `@workspace/ui` holds the design system, and".into(),
		});
	}
	let scope = RuntimeScope { conversation_id: "chat-skippy".into(), bot_id: "skippy".into() };
	s.runs.heard(&scope, &AgentEvent::MessageDelta { id: "live".into(), text: String::new() });
}

fn thread_mention(s: &mut App) {
	thread_default(s);
	s.composer.edit = TextEdit::new("@");
	s.composer.edit.focused = true;
	s.composer.edit.set_caret(1);
	s.composer_changed();
}

fn read_the_installed_host_before_the_first_frame(s: &mut App) -> Option<Ready> {
	s.navigation.navigate_main(Route::Conversations);
	match connected(Profile::Installed) {
		Ok(ready) => Some(ready),
		Err(failure) => {
			s.workspace = Workspace::Failed(failure);
			None
		}
	}
}

fn loaded(host: &Source, mut thread: Thread) -> Thread {
	match whole_thread(host, &thread.conversation_id) {
		Ok(messages) => messages.into_iter().for_each(|message| thread.stored(message)),
		Err(failure) => thread.failure = Some(failure),
	}
	thread.loaded = true;
	thread
}

fn live_longest(s: &mut App) {
	let Some(mut ready) = read_the_installed_host_before_the_first_frame(s) else { return };
	match longest::longest(&ready.source, &ready.conversations) {
		Ok(Some(found)) => {
			let conversation = ready
				.conversations
				.iter()
				.find(|conversation| conversation.id == found.conversation_id);
			if let Some(conversation) = conversation {
				s.thread = Some(loaded(&ready.source, Thread::of_conversation(conversation)));
			}
			ready.longest = Some(found);
		}
		Ok(None) => {}
		Err(failure) => s.notice = Some(format!("{}: {}", failure.title(), failure.detail())),
	}
	s.workspace = Workspace::Ready(ready);
}

fn live_mission(s: &mut App) {
	let Some(ready) = read_the_installed_host_before_the_first_frame(s) else { return };
	let board: Result<Vec<MissionOnBoard>, HostError> =
		ready.source.invoke("mission_board", json!({}));
	let host = ready.source.clone();
	s.workspace = Workspace::Ready(ready);
	s.pane = Pane::Missions;
	let board = match board {
		Ok(board) => board,
		Err(failure) => {
			s.board = Board::Failed(failure);
			return;
		}
	};
	let chosen =
		board.iter().find(|entry| entry.mission.is_agent_running).or(board.first()).cloned();
	s.board = Board::Read(board);
	let Some(entry) = chosen else { return };
	let detail: Result<MissionDetail, HostError> =
		host.invoke("mission_detail", json!({ "missionId": entry.mission.id }));
	s.open_mission(&entry.mission, &entry.bot);
	if let Some(thread) = s.thread.take() {
		s.thread = Some(loaded(&host, thread));
	}
	if let (Some(open), Ok(detail)) = (s.mission.as_mut(), detail) {
		open.mission = detail.mission;
		open.events = detail.events;
	}
}

fn live_mission_turn(s: &mut App) {
	let Some(ready) = read_the_installed_host_before_the_first_frame(s) else { return };
	let board: Result<Vec<MissionOnBoard>, HostError> =
		ready.source.invoke("mission_board", json!({}));
	let origin = board.ok().and_then(|board| {
		board
			.into_iter()
			.map(|entry| entry.mission.origin_conversation_id)
			.find(|id| ready.conversations.iter().any(|conversation| &conversation.id == id))
	});
	let Some(origin) = origin else {
		s.workspace = Workspace::Ready(ready);
		return;
	};
	let conversation = ready.conversations.iter().find(|conversation| conversation.id == origin);
	let mut thread = conversation
		.map(|conversation| loaded(&ready.source, Thread::of_conversation(conversation)));
	let missions: Result<ConversationMissions, HostError> =
		ready.source.invoke("mission_list", json!({ "conversationId": origin }));
	if let (Some(thread), Ok(missions)) = (thread.as_mut(), missions) {
		thread.missions = missions.open.into_iter().chain(missions.done).collect();
		thread.missions.sort_by_key(|mission| mission.opened_at);
		if let Some(first) = thread.missions.first().map(|mission| mission.opened_at) {
			let shown = thread.messages.partition_point(|message| message.created_at < first) + 1;
			thread.messages.truncate(shown);
		}
	}
	s.thread = thread;
	s.workspace = Workspace::Ready(ready);
}
