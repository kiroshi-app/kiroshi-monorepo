use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use rune::image::ImageCache;
use rune::{TextEdit, Waker};
use rune_kit::shell::PaneState;
use serde_json::json;

use crate::content;
use crate::dev_profile::{self, DevProfile};
use crate::events::{self, HostEvent};
use crate::host::{Host, HostError, Profile};
use crate::images::{Fetched, Images};
use crate::model::{Agent, AgentEvent, Conversation, MainChat, Message, MessagePage, Role, Space};
use crate::onboarding::{Method, Step};
use crate::turn::{self, SendError};

const PAGE_LIMIT: u32 = 200;

const MAX_THREAD_MESSAGES: usize = 2_000;

pub const AGENT_PILL: &str = "agent:";

pub enum Screen {
	Onboarding(Step),
	Conversations,
}

pub enum Workspace {
	Connecting,
	Failed(HostError),
	Ready(Ready),
}

pub struct Ready {
	pub host: Host,
	pub space: Space,
	pub agents: Vec<Agent>,
	pub conversations: Vec<Conversation>,
}

impl Ready {
	pub fn first_conversation_with_an_agent(&self) -> Option<&Conversation> {
		self.conversations.iter().find(|conversation| conversation.present().next().is_some())
	}
}

#[derive(Clone, PartialEq, Eq)]
pub enum Opened {
	Agent(String),
	Conversation(String),
}

pub struct Seat {
	pub bot_id: String,
	pub name: String,
	pub hue: Option<f32>,
}

pub struct Live {
	pub id: String,
	pub bot_id: String,
	pub text: String,
}

pub struct Thread {
	pub opened: Opened,
	pub conversation_id: Option<String>,
	pub title: String,
	pub seats: Vec<Seat>,
	pub messages: Vec<Message>,
	pub live: Vec<Live>,
	pub loaded: bool,
	pub failure: Option<HostError>,
}

impl Thread {
	pub fn of_conversation(conversation: &Conversation) -> Thread {
		let seats = conversation
			.present()
			.map(|seat| Seat {
				bot_id: seat.bot_id.clone(),
				name: seat.name.clone(),
				hue: seat.avatar_blot,
			})
			.collect();
		Thread {
			opened: Opened::Conversation(conversation.id.clone()),
			conversation_id: Some(conversation.id.clone()),
			title: conversation.title.clone(),
			seats,
			messages: Vec::new(),
			live: Vec::new(),
			loaded: false,
			failure: None,
		}
	}

	pub fn row_count(&self) -> usize {
		self.messages.len() + self.live.len()
	}

	pub fn is_loading(&self) -> bool {
		!self.loaded && self.failure.is_none()
	}

	fn shows(&self, conversation_id: &str) -> bool {
		self.conversation_id.as_deref() == Some(conversation_id)
	}

	pub fn stored(&mut self, message: Message) {
		self.live.retain(|live| {
			live.id != message.id
				&& !(message.role == Role::Assistant
					&& message.author_bot_id.as_deref() == Some(&live.bot_id))
		});
		match self.messages.iter().position(|held| held.id == message.id) {
			Some(at) => self.messages[at] = message,
			None => {
				let at = self.messages.partition_point(|held| held.seq <= message.seq);
				self.messages.insert(at, message);
			}
		}
	}

	fn streamed(&mut self, bot_id: &str, event: AgentEvent) {
		match event {
			AgentEvent::MessageStarted { message } => {
				if !self.live.iter().any(|live| live.id == message.id) {
					self.live.push(Live {
						id: message.id,
						bot_id: bot_id.to_owned(),
						text: message.text,
					});
				}
			}
			AgentEvent::MessageDelta { id, text } => {
				match self.live.iter_mut().find(|live| live.id == id) {
					Some(live) => live.text.push_str(&text),
					None => self.live.push(Live { id, bot_id: bot_id.to_owned(), text }),
				}
			}
			AgentEvent::MessageCompleted { message } => {
				if let Some(live) = self.live.iter_mut().find(|live| live.id == message.id) {
					live.text = message.text;
				}
			}
			AgentEvent::TurnEnded { .. } | AgentEvent::Failed { .. } | AgentEvent::Other => {}
		}
	}
}

pub struct Mention {
	pub start: usize,
	pub query: String,
	pub active: usize,
}

pub struct Composer {
	pub edit: TextEdit,
	pub mention: Option<Mention>,
}

pub enum Inbound {
	Connected(Result<Ready, HostError>),
	ChatFound { bot_id: String, chat: Result<MainChat, HostError> },
	ThreadRead { conversation_id: String, messages: Result<Vec<Message>, HostError> },
	SendFailed(SendError),
	Host(HostEvent),
	Image(Fetched),
	DevProfile(DevProfile),
}

#[derive(Clone)]
pub struct Outbox {
	sender: Sender<Inbound>,
	waker: Waker,
}

impl Outbox {
	pub fn deliver(&self, inbound: Inbound) {
		if self.sender.send(inbound).is_ok() {
			(self.waker)();
		}
	}
}

pub struct App {
	pub screen: Screen,
	pub workspace: Workspace,
	pub thread: Option<Thread>,
	pub composer: Composer,
	pub images: Images,
	pub sidebar: PaneState,
	pub notice: Option<String>,
	pub onboarding_code: TextEdit,
	pub onboarding_key: TextEdit,
	pub dev_profile: Option<DevProfile>,
	pub connect_method: Method,
	pub import_selected: Vec<String>,
	outbox: Option<Outbox>,
	inbox: Receiver<Inbound>,
	pending: Sender<Inbound>,
}

impl App {
	pub fn new() -> App {
		let (pending, inbox) = mpsc::channel();
		App {
			screen: Screen::Onboarding(Step::first()),
			workspace: Workspace::Connecting,
			thread: None,
			composer: Composer { edit: TextEdit::new(""), mention: None },
			images: Images::default(),
			sidebar: PaneState::new(276.0).range(180.0, 480.0),
			notice: None,
			onboarding_code: TextEdit::new(""),
			onboarding_key: TextEdit::new(""),
			dev_profile: None,
			connect_method: Method::SignIn,
			import_selected: Vec::new(),
			outbox: None,
			inbox,
			pending,
		}
	}

	pub fn setup(&mut self, waker: Waker) {
		self.images.start(ImageCache::new(waker.clone()));
		self.outbox = Some(Outbox { sender: self.pending.clone(), waker });
		if matches!(self.workspace, Workspace::Connecting) {
			self.connect();
		}
		if self.dev_profile.is_none() {
			self.work(|outbox| outbox.deliver(Inbound::DevProfile(dev_profile::read())));
		}
	}

	pub fn toggle_import(&mut self, key: &str) {
		match self.import_selected.iter().position(|held| held == key) {
			Some(at) => {
				self.import_selected.remove(at);
			}
			None => self.import_selected.push(key.to_owned()),
		}
	}

	pub fn connect(&mut self) {
		self.workspace = Workspace::Connecting;
		self.work(|outbox| outbox.deliver(Inbound::Connected(connected(Profile::Installed))));
	}

	pub fn poll(&mut self) -> bool {
		let mut changed = false;
		while let Ok(inbound) = self.inbox.try_recv() {
			self.received(inbound);
			changed = true;
		}
		changed
	}

	pub fn ready(&self) -> Option<&Ready> {
		match &self.workspace {
			Workspace::Ready(ready) => Some(ready),
			_ => None,
		}
	}

	pub fn open(&mut self, opened: Opened) {
		let Some(ready) = self.ready() else { return };
		let thread = match &opened {
			Opened::Agent(bot_id) => {
				let Some(agent) = ready.agents.iter().find(|agent| &agent.id == bot_id) else {
					return;
				};
				let seats = vec![Seat {
					bot_id: agent.id.clone(),
					name: agent.name.clone(),
					hue: agent.avatar_blot,
				}];
				Thread {
					opened: opened.clone(),
					conversation_id: None,
					title: agent.name.clone(),
					seats,
					messages: Vec::new(),
					live: Vec::new(),
					loaded: false,
					failure: None,
				}
			}
			Opened::Conversation(id) => {
				let Some(conversation) =
					ready.conversations.iter().find(|conversation| &conversation.id == id)
				else {
					return;
				};
				Thread::of_conversation(conversation)
			}
		};
		let host = ready.host.clone();
		let space_id = ready.space.id.clone();
		self.composer.mention = None;
		self.notice = None;
		self.thread = Some(thread);
		match opened {
			Opened::Agent(bot_id) => self.work(move |outbox| {
				let chat = host.invoke(
					"conversation_main_chat",
					json!({ "botId": bot_id, "spaceId": space_id }),
				);
				outbox.deliver(Inbound::ChatFound { bot_id, chat });
			}),
			Opened::Conversation(id) => self.read_thread(host, id),
		}
	}

	pub fn mention_names(&self, content: &str) -> String {
		content::with_mention_names(content, |id| self.agent_name(id))
	}

	pub fn agent_name(&self, bot_id: &str) -> Option<String> {
		self.known_agent(bot_id).map(|(name, _)| name.to_owned())
	}

	pub fn agent_hue(&self, bot_id: &str) -> Option<f32> {
		self.known_agent(bot_id).and_then(|(_, hue)| hue)
	}

	fn known_agent(&self, bot_id: &str) -> Option<(&str, Option<f32>)> {
		let seated = self
			.thread
			.as_ref()
			.and_then(|thread| thread.seats.iter().find(|seat| seat.bot_id == bot_id));
		if let Some(seat) = seated {
			return Some((seat.name.as_str(), seat.hue));
		}
		let agent = self.ready()?.agents.iter().find(|agent| agent.id == bot_id)?;
		Some((agent.name.as_str(), agent.avatar_blot))
	}

	pub fn mention_candidates(&self) -> Vec<&Seat> {
		let (Some(thread), Some(mention)) = (self.thread.as_ref(), self.composer.mention.as_ref())
		else {
			return Vec::new();
		};
		let query = mention.query.to_lowercase();
		thread.seats.iter().filter(|seat| seat.name.to_lowercase().contains(&query)).collect()
	}

	pub fn composer_changed(&mut self) {
		let edit = &self.composer.edit;
		let (caret, end) = edit.range();
		let typed = (caret == end).then(|| mention_query(edit, caret)).flatten();
		let held = self.composer.mention.take();
		self.composer.mention = typed.map(|(start, query)| {
			let active =
				held.as_ref().filter(|held| held.start == start).map_or(0, |held| held.active);
			Mention { start, query, active }
		});
		let count = self.mention_candidates().len();
		if let Some(mention) = self.composer.mention.as_mut() {
			mention.active = mention.active.min(count.saturating_sub(1));
		}
	}

	pub fn move_mention(&mut self, step: isize) {
		let count = self.mention_candidates().len();
		if let Some(mention) = self.composer.mention.as_mut().filter(|_| count > 0) {
			mention.active = (mention.active as isize + step).rem_euclid(count as isize) as usize;
		}
	}

	pub fn choose_active_mention(&mut self) -> bool {
		let Some(active) = self.composer.mention.as_ref().map(|mention| mention.active) else {
			return false;
		};
		let Some(bot_id) = self.mention_candidates().get(active).map(|seat| seat.bot_id.clone())
		else {
			return false;
		};
		self.choose_mention(&bot_id);
		true
	}

	pub fn choose_mention(&mut self, bot_id: &str) {
		let Some(mention) = self.composer.mention.take() else { return };
		let Some(name) = self.agent_name(bot_id) else { return };
		let (caret, _) = self.composer.edit.range();
		self.composer.edit.undo_group(|edit| {
			edit.replace_with_pill(
				mention.start..caret,
				format!("{AGENT_PILL}{bot_id}"),
				&format!("@{name}"),
			);
			edit.insert(" ");
		});
	}

	pub fn send(&mut self) {
		let Some(ready) = self.ready() else { return };
		let Some(conversation_id) =
			self.thread.as_ref().and_then(|thread| thread.conversation_id.clone())
		else {
			return;
		};
		let (content, summoned) = outgoing(&self.composer.edit);
		if content.trim().is_empty() {
			return;
		}
		let host = ready.host.clone();
		self.composer.edit.clear();
		self.composer.mention = None;
		self.notice = None;
		self.work(move |outbox| {
			if let Err(failure) = turn::send_turn(&host, &conversation_id, &content, &summoned) {
				outbox.deliver(Inbound::SendFailed(failure));
			}
		});
	}

	fn received(&mut self, inbound: Inbound) {
		match inbound {
			Inbound::Connected(Ok(ready)) => {
				if let Some(outbox) = self.outbox.clone() {
					events::listen(&ready.host, move |event| outbox.deliver(Inbound::Host(event)));
				}
				let first = ready
					.first_conversation_with_an_agent()
					.map(|conversation| Opened::Conversation(conversation.id.clone()));
				self.workspace = Workspace::Ready(ready);
				if let Some(first) = first.filter(|_| self.thread.is_none()) {
					self.open(first);
				}
			}
			Inbound::Connected(Err(failure)) => self.workspace = Workspace::Failed(failure),
			Inbound::ChatFound { bot_id, chat } => self.chat_found(bot_id, chat),
			Inbound::ThreadRead { conversation_id, messages } => {
				self.thread_read(&conversation_id, messages)
			}
			Inbound::SendFailed(failure) => self.notice = Some(format!("Couldn't send. {failure}")),
			Inbound::Host(event) => self.host_event(event),
			Inbound::Image(fetched) => self.images.landed(fetched),
			Inbound::DevProfile(profile) => {
				self.import_selected =
					profile.import.as_ref().map(|choices| choices.keys()).unwrap_or_default();
				self.dev_profile = Some(profile);
			}
		}
	}

	fn chat_found(&mut self, bot_id: String, chat: Result<MainChat, HostError>) {
		let Some(thread) =
			self.thread.as_mut().filter(|thread| thread.opened == Opened::Agent(bot_id.clone()))
		else {
			return;
		};
		match chat {
			Ok(chat) => {
				thread.conversation_id = Some(chat.id.clone());
				if let Some(host) = self.ready().map(|ready| ready.host.clone()) {
					self.read_thread(host, chat.id);
				}
			}
			Err(failure) => thread.failure = Some(failure),
		}
	}

	fn read_thread(&self, host: Host, conversation_id: String) {
		self.work(move |outbox| {
			let messages = whole_thread(&host, &conversation_id);
			outbox.deliver(Inbound::ThreadRead { conversation_id, messages });
		});
	}

	fn thread_read(&mut self, conversation_id: &str, messages: Result<Vec<Message>, HostError>) {
		let Some(thread) = self.thread.as_mut().filter(|thread| thread.shows(conversation_id))
		else {
			return;
		};
		match messages {
			Ok(messages) => {
				for message in messages {
					thread.stored(message);
				}
				thread.loaded = true;
				self.request_images();
			}
			Err(failure) => thread.failure = Some(failure),
		}
	}

	fn host_event(&mut self, event: HostEvent) {
		match event {
			HostEvent::Agent(scoped) => {
				let (Some(scope), Some(thread)) = (scoped.scope, self.thread.as_mut()) else {
					return;
				};
				if thread.shows(&scope.conversation_id) {
					thread.streamed(&scope.bot_id, scoped.event);
				}
			}
			HostEvent::MessageStored(message) => {
				let Some(thread) =
					self.thread.as_mut().filter(|thread| thread.shows(&message.conversation_id))
				else {
					return;
				};
				thread.stored(message);
				self.request_images();
			}
			HostEvent::Listening => {}
			HostEvent::Unreadable { event, cause } => {
				self.notice = Some(format!("Couldn't read a {event} event: {cause}"))
			}
			HostEvent::Lost(reason) => {
				self.notice = Some(format!(
					"Stopped hearing from the host: {reason}. Restart the preview to listen again."
				))
			}
		}
	}

	fn request_images(&mut self) {
		let Some(thread) = self.thread.as_ref() else { return };
		let Some(outbox) = self.outbox.clone() else { return };
		let urls: Vec<String> = thread
			.messages
			.iter()
			.flat_map(|message| content::image_urls(&message.content))
			.collect();
		for url in urls {
			let outbox = outbox.clone();
			self.images.request(url, move |fetched| outbox.deliver(Inbound::Image(fetched)));
		}
	}

	fn work(&self, job: impl FnOnce(Outbox) + Send + 'static) {
		let Some(outbox) = self.outbox.clone() else { return };
		if let Err(failure) =
			thread::Builder::new().name("host-call".into()).spawn(move || job(outbox))
		{
			eprintln!("a host call did not start: {failure}");
		}
	}
}

pub fn connected(profile: Profile) -> Result<Ready, HostError> {
	let host = Host::connect(profile)?;
	let spaces: Vec<Space> = host.invoke("space_list", json!({}))?;
	let Some(space) = spaces.into_iter().next() else {
		return Err(HostError::CommandFailed {
			command: "space_list".into(),
			status: 200,
			body: "no Space on the dev profile".into(),
		});
	};
	let agents = host.invoke("conversation_bots", json!({ "spaceId": space.id }))?;
	let conversations = host.invoke("conversation_list", json!({ "spaceId": space.id }))?;
	Ok(Ready { host, space, agents, conversations })
}

pub fn whole_thread(host: &Host, conversation_id: &str) -> Result<Vec<Message>, HostError> {
	let mut messages: Vec<Message> = Vec::new();
	let mut before: Option<i64> = None;
	loop {
		let page: MessagePage = host.invoke(
			"conversation_message_page",
			json!({ "conversationId": conversation_id, "beforeSeq": before, "limit": PAGE_LIMIT }),
		)?;
		let oldest = page.messages.iter().map(|message| message.seq).min();
		messages.extend(page.messages);
		match oldest {
			Some(oldest) if page.has_more && messages.len() < MAX_THREAD_MESSAGES => {
				before = Some(oldest)
			}
			_ => break,
		}
	}
	messages.sort_by_key(|message| message.seq);
	Ok(messages)
}

fn mention_query(edit: &TextEdit, caret: usize) -> Option<(usize, String)> {
	let before = edit.text.get(..caret)?;
	let at = before.rfind('@')?;
	let query = &before[at + 1..];
	let opens_a_word = before[..at].chars().next_back().is_none_or(char::is_whitespace);
	let inside_a_pill = edit.pills().any(|(range, _)| range.contains(&at));
	(opens_a_word && !inside_a_pill && !query.contains(char::is_whitespace))
		.then(|| (at, query.to_owned()))
}

fn outgoing(edit: &TextEdit) -> (String, Vec<String>) {
	let mut pills: Vec<(std::ops::Range<usize>, String)> = edit
		.pills()
		.filter_map(|(range, id)| {
			id.strip_prefix(AGENT_PILL).map(|bot_id| (range, bot_id.to_owned()))
		})
		.collect();
	pills.sort_by_key(|(range, _)| range.start);
	let mut content = String::with_capacity(edit.text.len());
	let mut summoned: Vec<String> = Vec::new();
	let mut read = 0;
	for (range, bot_id) in pills {
		content.push_str(&edit.text[read..range.start]);
		content.push_str(&format!("<@{bot_id}>"));
		read = range.end;
		if !summoned.contains(&bot_id) {
			summoned.push(bot_id);
		}
	}
	content.push_str(&edit.text[read..]);
	(content, summoned)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::model::StreamedMessage;

	fn thread() -> Thread {
		Thread {
			opened: Opened::Conversation("c".into()),
			conversation_id: Some("c".into()),
			title: "c".into(),
			seats: Vec::new(),
			messages: Vec::new(),
			live: Vec::new(),
			loaded: true,
			failure: None,
		}
	}

	fn stored(id: &str, seq: i64, role: Role, author: Option<&str>, content: &str) -> Message {
		Message {
			id: id.into(),
			conversation_id: "c".into(),
			seq,
			role,
			content: content.into(),
			author_bot_id: author.map(str::to_owned),
			author_name: None,
		}
	}

	#[test]
	fn deltas_grow_the_live_answer_until_the_stored_message_replaces_it() {
		let mut thread = thread();
		thread.stored(stored("u1", 1, Role::User, None, "hi"));
		thread.streamed(
			"wren",
			AgentEvent::MessageStarted {
				message: StreamedMessage { id: "s1".into(), text: String::new() },
			},
		);
		thread.streamed("wren", AgentEvent::MessageDelta { id: "s1".into(), text: "Hel".into() });
		thread.streamed("wren", AgentEvent::MessageDelta { id: "s1".into(), text: "lo".into() });
		assert_eq!(thread.live[0].text, "Hello");
		assert_eq!(thread.row_count(), 2);

		thread.stored(stored("a1", 2, Role::Assistant, Some("wren"), "Hello"));

		assert!(thread.live.is_empty());
		assert_eq!(thread.messages.iter().map(|m| m.id.as_str()).collect::<Vec<_>>(), ["u1", "a1"]);
	}

	#[test]
	fn a_message_stored_twice_is_kept_once_in_seq_order() {
		let mut thread = thread();
		thread.stored(stored("b", 2, Role::User, None, "second"));
		thread.stored(stored("a", 1, Role::User, None, "first"));
		thread.stored(stored("b", 2, Role::User, None, "second, edited"));
		assert_eq!(
			thread.messages.iter().map(|m| m.content.as_str()).collect::<Vec<_>>(),
			["first", "second, edited"]
		);
	}

	#[test]
	fn agent_pills_leave_as_mention_tokens_and_summon_their_agent() {
		let mut edit = TextEdit::new("Ask ");
		edit.set_caret(4);
		edit.insert_pill(format!("{AGENT_PILL}wren"), "@Wren");
		edit.insert(" for notes");
		let (content, summoned) = outgoing(&edit);
		assert_eq!(content, "Ask <@wren> for notes");
		assert_eq!(summoned, ["wren"]);
	}
}
