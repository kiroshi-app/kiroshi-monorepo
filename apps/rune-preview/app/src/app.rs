use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;
use std::time::Duration;

use rune::Waker;
use rune::image::ImageCache;
use rune_kit::shell::PaneState;
use serde_json::json;

use kiroshi_core::spaces::contract::Space as ListedSpace;
use kiroshi_core::user::contract::UserPreferences;
use kiroshi_rune_kit::avatar::Motion;
use kiroshi_rune_kit::math::Typesetter;
use kiroshi_rune_os::policy::{NoticeKind, NoticeTarget};
use kiroshi_rune_os::{BannerOutcome, Notifier};

use crate::content;
use crate::dev_profile::{self, DevProfile};
use crate::events::HostEvent;
use crate::host::{Host, HostError, Profile};
use crate::images::{Fetched, Images};
use crate::local;
use crate::longest::{self, Longest};
use crate::model::{
	Agent, AgentEvent, Conversation, ConversationMissions, ConversationPage, KiroshiAccountState,
	Message, MessagePage, Mission, Role, RuntimeScope, Space,
};
use crate::navigation::{HeldPage, Navigation, Route};
use crate::notices::Notices;
use crate::runs::Runs;
use crate::source::Source;
use crate::surfaces::s04_boot::{self, Step};
use crate::surfaces::s08_missions::{self, Opened, Opening};
use crate::surfaces::{
	Surfaces, s01_chrome, s02_rail, s05_thread, s10_agent_settings, s14_library,
};

const PAGE_LIMIT: u32 = 200;

const MAX_THREAD_MESSAGES: usize = 10_000;

const UNKNOWN_AGENT: &str = "An agent";

pub enum Workspace {
	Connecting,
	Failed(HostError),
	Ready(Ready),
}

#[derive(Clone)]
pub enum Person {
	SignedIn(String),
	SignedOut,
	Unread,
}

pub struct Ready {
	pub source: Source,
	pub space: Space,
	pub agents: Vec<Agent>,
	pub conversations: Vec<Conversation>,
	pub person: Person,
	pub longest: Option<Longest>,
}

impl Ready {
	pub fn first_conversation_with_an_agent(&self) -> Option<&Conversation> {
		self.conversations.iter().find(|conversation| conversation.present().next().is_some())
	}
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
	pub conversation_id: String,
	pub title: String,
	pub seats: Vec<Seat>,
	pub messages: Vec<Message>,
	pub live: Vec<Live>,
	pub loaded: bool,
	pub failure: Option<HostError>,
	pub missions: Vec<Mission>,
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
			conversation_id: conversation.id.clone(),
			title: conversation.title.clone(),
			seats,
			messages: Vec::new(),
			live: Vec::new(),
			loaded: false,
			failure: None,
			missions: Vec::new(),
		}
	}

	fn of_mission(conversation_id: &str, title: &str, bot: Option<&Agent>) -> Thread {
		let seat = |bot: &Agent| Seat {
			bot_id: bot.id.clone(),
			name: bot.name.clone(),
			hue: bot.avatar_blot,
		};
		Thread {
			conversation_id: conversation_id.to_owned(),
			title: title.to_owned(),
			seats: bot.map(seat).into_iter().collect(),
			messages: Vec::new(),
			live: Vec::new(),
			loaded: false,
			failure: None,
			missions: Vec::new(),
		}
	}

	pub fn is_loading(&self) -> bool {
		!self.loaded && self.failure.is_none()
	}

	pub fn shows_mission(&self, mission: &Mission) -> bool {
		self.conversation_id == mission.thread_conversation_id
	}

	fn shows(&self, conversation_id: &str) -> bool {
		self.conversation_id == conversation_id
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
			AgentEvent::TurnEnded { .. }
			| AgentEvent::TurnChanged { .. }
			| AgentEvent::Activity { .. }
			| AgentEvent::Failed { .. }
			| AgentEvent::Other => {}
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Pane {
	#[default]
	Conversations,
	Missions,
}

pub enum Inbound {
	MissionsOf { conversation_id: String, missions: Result<ConversationMissions, HostError> },
	Connected(Result<Ready, HostError>),
	ThreadRead { conversation_id: String, messages: Result<Vec<Message>, HostError> },
	Host(HostEvent),
	Image(Fetched),
	DevProfile(DevProfile),
	Longest(Result<Option<Longest>, HostError>),
	Banner(BannerOutcome),
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
	pub navigation: Navigation,
	pub surfaces: Surfaces,
	pub workspace: Workspace,
	pub thread: Option<Thread>,
	pub images: Images,
	pub sidebar: PaneState,
	pub spike: crate::spike::editor::Editor,
	pub notice: Option<String>,
	pub dev_profile: Option<DevProfile>,
	pub runs: Runs,
	pub clock_ms: f64,
	pub math: Typesetter,
	pub pane: Pane,
	pub host_profile: Profile,
	pub uses_host_api: bool,
	pub mission: Option<Opened>,
	notices: Notices,
	outbox: Option<Outbox>,
	inbox: Receiver<Inbound>,
	pending: Sender<Inbound>,
}

impl Default for App {
	fn default() -> App {
		App::new()
	}
}

impl App {
	pub fn new() -> App {
		let (pending, inbox) = mpsc::channel();
		App {
			navigation: Navigation::new(Route::Onboarding(Step::Boot)),
			surfaces: Surfaces::default(),
			workspace: Workspace::Connecting,
			thread: None,
			images: Images::default(),
			sidebar: PaneState::new(276.0).range(180.0, 480.0),
			spike: crate::spike::editor::Editor::default(),
			notice: None,
			dev_profile: None,
			runs: Runs::default(),
			math: Typesetter::default(),
			pane: Pane::Conversations,
			host_profile: Profile::Installed,
			uses_host_api: false,
			mission: None,
			notices: Notices::default(),
			clock_ms: 0.0,
			outbox: None,
			inbox,
			pending,
		}
	}

	pub fn setup(&mut self, waker: Waker) {
		self.images.start(ImageCache::new(waker.clone()));
		self.surfaces.s10_agent_settings.attach(waker.clone());
		self.surfaces.s04_boot.attach(waker.clone());
		let outbox = Outbox { sender: self.pending.clone(), waker };
		let heard = outbox.clone();
		self.notices
			.attach(Box::new(Notifier::new(self.host_profile.identifier(), move |outcome| {
				heard.deliver(Inbound::Banner(outcome))
			})));
		self.outbox = Some(outbox);
		s01_chrome::restore(self);
		if matches!(self.workspace, Workspace::Connecting) {
			self.connect();
		}
		match (self.dev_profile.is_none(), self.uses_host_api) {
			(true, true) => {
				self.work(|outbox| outbox.deliver(Inbound::DevProfile(dev_profile::read())))
			}
			(true, false) => self.dev_profile = Some(DevProfile::default()),
			(false, _) => {}
		}
	}

	pub fn connect(&mut self) {
		self.workspace = Workspace::Connecting;
		let profile = self.host_profile;
		let in_process = !self.uses_host_api;
		self.work(move |outbox| {
			let ready = if in_process { opened_in_process() } else { connected(profile) };
			outbox.deliver(Inbound::Connected(ready));
		});
	}

	pub fn poll(&mut self) -> bool {
		let mut changed = false;
		while let Ok(inbound) = self.inbox.try_recv() {
			self.received(inbound);
			changed = true;
		}
		s10_agent_settings::poll(self) || changed
	}

	pub fn tick(&mut self, seconds: f64) -> bool {
		self.clock_ms = seconds * 1000.0;
		self.is_animating()
	}

	pub fn is_animating(&self) -> bool {
		let running = |mission: &Mission| mission.is_agent_running;
		!self.runs.is_empty()
			|| s04_boot::is_animating(self)
			|| s08_missions::is_animating(self)
			|| self.thread.as_ref().is_some_and(|thread| thread.missions.iter().any(running))
	}

	pub fn motion(&self, conversation_id: &str, bot_id: &str) -> Motion {
		match self.runs.activity(conversation_id, bot_id) {
			Some(activity) => Motion::Running { activity, at_ms: self.clock_ms },
			None => Motion::Still,
		}
	}

	pub fn ready(&self) -> Option<&Ready> {
		match &self.workspace {
			Workspace::Ready(ready) => Some(ready),
			_ => None,
		}
	}

	fn ready_mut(&mut self) -> Option<&mut Ready> {
		match &mut self.workspace {
			Workspace::Ready(ready) => Some(ready),
			_ => None,
		}
	}

	pub fn open(&mut self, conversation_id: &str) {
		let Some(ready) = self.ready() else { return };
		let Some(conversation) =
			ready.conversations.iter().find(|conversation| conversation.id == conversation_id)
		else {
			return;
		};
		let thread = Thread::of_conversation(conversation);
		let host = ready.source.clone();
		self.notice = None;
		self.mission = None;
		self.thread = Some(thread);
		self.read_thread(host.clone(), conversation_id.to_owned());
		s05_thread::open_conversation(self, conversation_id);
		let conversation_id = conversation_id.to_owned();
		self.work(move |outbox| {
			let missions =
				host.invoke("mission_list", json!({ "conversationId": conversation_id }));
			outbox.deliver(Inbound::MissionsOf { conversation_id, missions });
		});
	}

	pub fn show_missions(&mut self) {
		self.navigation.navigate_main(Route::Conversations);
		self.show_pane(Pane::Missions);
	}

	pub fn show_conversations(&mut self) {
		self.navigation.navigate_main(Route::Conversations);
		self.show_pane(Pane::Conversations);
	}

	fn show_pane(&mut self, pane: Pane) {
		self.pane = pane;
		if pane == Pane::Missions {
			s08_missions::show(self);
		}
	}

	pub fn switch_tab(&mut self, leaving: &str, entering: &str) {
		let conversation_id = match (&self.thread, &self.mission) {
			(Some(thread), None) => Some(thread.conversation_id.clone()),
			_ => None,
		};
		let held = HeldPage { conversation_id, pane: self.pane };
		let entered = self.navigation.switch_tab(leaving, held, entering);
		self.thread = None;
		self.mission = None;
		self.show_pane(entered.pane);
		if let Some(conversation_id) = entered.conversation_id {
			self.open(&conversation_id);
		}
	}

	pub fn open_mission(&mut self, mission: &Mission, bot: &Agent) {
		s08_missions::open(self, &Opening { bot_id: &bot.id, ..Opening::of_card(mission) });
	}

	pub fn open_mission_thread(&mut self, conversation_id: &str, title: &str, bot: Option<&Agent>) {
		let Some(host) = self.ready().map(|ready| ready.source.clone()) else { return };
		self.notice = None;
		self.thread = Some(Thread::of_mission(conversation_id, title, bot));
		self.read_thread(host, conversation_id.to_owned());
		s05_thread::open_conversation(self, conversation_id);
	}

	fn missions_of(
		&mut self,
		conversation_id: &str,
		missions: Result<ConversationMissions, HostError>,
	) {
		let Some(thread) = self.thread.as_mut().filter(|thread| thread.shows(conversation_id))
		else {
			return;
		};
		match missions {
			Ok(ConversationMissions { open, done }) => {
				thread.missions = open.into_iter().chain(done).collect();
				thread.missions.sort_by_key(|mission| mission.opened_at);
			}
			Err(failure) => {
				self.notice = Some(format!(
					"Couldn't read the missions of this conversation. {}: {}",
					failure.title(),
					failure.detail()
				))
			}
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

	fn received(&mut self, inbound: Inbound) {
		match inbound {
			Inbound::Connected(Ok(ready)) => {
				if let Some(outbox) = self.outbox.clone() {
					ready.source.listen(move |event| outbox.deliver(Inbound::Host(event)));
				}
				let host = ready.source.clone();
				let conversations = ready.conversations.clone();
				self.workspace = Workspace::Ready(ready);
				s04_boot::booted(self);
				s01_chrome::reopen_kept_windows(self);
				s02_rail::connected(self);
				self.work(move |outbox| {
					outbox.deliver(Inbound::Longest(longest::longest(&host, &conversations)))
				});
			}
			Inbound::Longest(found) => self.longest_found(found),
			Inbound::MissionsOf { conversation_id, missions } => {
				self.missions_of(&conversation_id, missions)
			}
			Inbound::Connected(Err(failure)) => self.workspace = Workspace::Failed(failure),
			Inbound::ThreadRead { conversation_id, messages } => {
				self.thread_read(&conversation_id, messages)
			}
			Inbound::Host(event) => self.host_event(event),
			Inbound::Image(fetched) => self.images.landed(fetched),
			Inbound::Banner(BannerOutcome::Clicked(target)) => self.notice_clicked(target),
			Inbound::Banner(BannerOutcome::Refused { target, failure }) => {
				self.notices.banner_refused(&target, &failure)
			}
			Inbound::DevProfile(profile) => self.dev_profile = Some(profile),
		}
	}

	fn longest_found(&mut self, found: Result<Option<Longest>, HostError>) {
		let Workspace::Ready(ready) = &mut self.workspace else { return };
		let fallback =
			ready.first_conversation_with_an_agent().map(|conversation| conversation.id.clone());
		let opening = match found {
			Ok(Some(longest)) => {
				let id = longest.conversation_id.clone();
				ready.longest = Some(longest);
				Some(id)
			}
			Ok(None) => fallback,
			Err(failure) => {
				self.notice = Some(format!(
					"Couldn't find the longest conversation. {}: {}",
					failure.title(),
					failure.detail()
				));
				fallback
			}
		};
		if let Some(id) = opening.filter(|_| self.thread.is_none()) {
			self.open(&id);
		}
	}

	fn reload_visible_thread(&self) {
		let (Some(ready), Some(thread)) = (self.ready(), self.thread.as_ref()) else { return };
		self.read_thread(ready.source.clone(), thread.conversation_id.clone());
	}

	fn read_thread(&self, host: Source, conversation_id: String) {
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
		self.surfaces.s05_thread.heard(&event);
		match event {
			HostEvent::Agent(scoped) => {
				let Some(scope) = scoped.scope else { return };
				self.runs.heard(&scope, &scoped.event);
				self.surfaces.s07_approvals.heard_agent(&scope, &scoped.event);
				self.notify_of(&scope, &scoped.event);
				let Some(thread) = self.thread.as_mut() else { return };
				if thread.shows(&scope.conversation_id) {
					thread.streamed(&scope.bot_id, scoped.event);
				}
			}
			HostEvent::MessageStored(message) => {
				self.surfaces.s03_roster.heard_message(&message);
				let Some(thread) =
					self.thread.as_mut().filter(|thread| thread.shows(&message.conversation_id))
				else {
					return;
				};
				thread.stored(message);
				self.request_images();
			}
			HostEvent::MissionChanged(changed) => s08_missions::changed(self, &changed),
			HostEvent::Roster(heard) => self.surfaces.s03_roster.heard(heard),
			HostEvent::Library(heard) => s14_library::heard(self, heard),
			HostEvent::Approvals(heard) => self.surfaces.s07_approvals.heard(heard),
			HostEvent::Companion(heard) => {
				self.surfaces.s03_roster.heard_companion(&heard);
				s10_agent_settings::heard(self, heard)
			}
			HostEvent::AccountChanged(account) => {
				if let Some(ready) = self.ready_mut() {
					ready.person = person_of(account);
				}
			}
			HostEvent::Lagged => self.reload_visible_thread(),
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

	fn notify_of(&mut self, scope: &RuntimeScope, event: &AgentEvent) {
		match event {
			AgentEvent::MessageCompleted { message } => {
				let reply = self.mention_names(&message.text);
				self.notices.replied(scope, reply);
			}
			AgentEvent::TurnEnded { ended } => {
				let name =
					self.agent_name(&scope.bot_id).unwrap_or_else(|| UNKNOWN_AGENT.to_owned());
				self.notices.turn_ended(scope, &ended.outcome, &name);
			}
			AgentEvent::MessageStarted { .. }
			| AgentEvent::MessageDelta { .. }
			| AgentEvent::TurnChanged { .. }
			| AgentEvent::Activity { .. }
			| AgentEvent::Failed { .. }
			| AgentEvent::Other => {}
		}
	}

	fn notice_clicked(&mut self, target: NoticeTarget) {
		self.notices.bring_to_front();
		if target.kind != NoticeKind::Conversation {
			return;
		}
		self.show_conversations();
		self.open(&target.id);
	}

	pub fn focus_wake(&mut self) -> Option<Duration> {
		self.notices.focus_wake()
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
	ready_on(Source::Running(Host::connect(profile)?))
}

pub fn opened_in_process() -> Result<Ready, HostError> {
	ready_on(Source::InProcess(local::opened()?))
}

pub struct SpaceContent {
	pub agents: Vec<Agent>,
	pub conversations: Vec<Conversation>,
}

pub fn space_content(source: &Source, space_id: &str) -> Result<SpaceContent, HostError> {
	let agents = source.invoke("conversation_bots", json!({ "spaceId": space_id }))?;
	let conversations = roster(source, space_id)?;
	Ok(SpaceContent { agents, conversations })
}

fn last_space_id(source: &Source) -> Option<String> {
	match source.invoke::<UserPreferences>("user_preferences", json!({})) {
		Ok(preferences) => preferences.last_space_id,
		Err(failure) => {
			eprintln!("the last Space did not read, the first Space opens: {}", failure.detail());
			None
		}
	}
}

pub fn ready_on(source: Source) -> Result<Ready, HostError> {
	let spaces: Vec<ListedSpace> = source.invoke("space_list", json!({}))?;
	let remembered = last_space_id(&source);
	let Some(space) = s02_rail::opening_space(&spaces, remembered.as_deref()) else {
		return Err(HostError::CommandFailed {
			command: "space_list".into(),
			status: 200,
			body: "no Space on the dev profile".into(),
		});
	};
	let space = s02_rail::shown_space(space);
	let SpaceContent { agents, conversations } = space_content(&source, &space.id)?;
	let person = match source.invoke::<KiroshiAccountState>("account_state", json!({})) {
		Ok(account) => person_of(account),
		Err(failure) => {
			eprintln!("the account did not read: {}", failure.detail());
			Person::Unread
		}
	};
	Ok(Ready { source, space, agents, conversations, person, longest: None })
}

fn person_of(account: KiroshiAccountState) -> Person {
	match account {
		KiroshiAccountState::SignedIn { email, .. } => Person::SignedIn(email),
		KiroshiAccountState::SignedOut => Person::SignedOut,
	}
}

const ROSTER_PAGE: u32 = 100;

const MAX_ROSTER: usize = 1_000;

fn roster(host: &Source, space_id: &str) -> Result<Vec<Conversation>, HostError> {
	let mut roster: Vec<Conversation> = Vec::new();
	let mut cursor: Option<String> = None;
	loop {
		let page: ConversationPage = host.invoke(
			"conversation_page",
			json!({ "spaceId": space_id, "cursor": cursor, "limit": ROSTER_PAGE }),
		)?;
		for conversation in page.pinned.into_iter().chain(page.conversations) {
			if !roster.iter().any(|held| held.id == conversation.id) {
				roster.push(conversation);
			}
		}
		match page.next_cursor {
			Some(next) if roster.len() < MAX_ROSTER => cursor = Some(next),
			_ => return Ok(roster),
		}
	}
}

pub fn whole_thread(host: &Source, conversation_id: &str) -> Result<Vec<Message>, HostError> {
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

#[cfg(test)]
mod tests {
	use std::cell::RefCell;
	use std::rc::Rc;

	use kiroshi_rune_os::policy::Notice;
	use kiroshi_rune_os::{Gesture, GestureFailure};

	use super::*;
	use crate::model::{ScopedEvent, StreamedMessage, TurnEnded};
	use crate::notices::fake::{FakeDesktop, Record};
	use crate::source::Source;

	fn thread() -> Thread {
		Thread {
			conversation_id: "c".into(),
			title: "c".into(),
			seats: Vec::new(),
			messages: Vec::new(),
			live: Vec::new(),
			loaded: true,
			failure: None,
			missions: Vec::new(),
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
			created_at: seq,
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
		assert_eq!(thread.messages.len() + thread.live.len(), 2);

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

	fn conversation(id: &str) -> Conversation {
		Conversation {
			id: id.into(),
			title: id.into(),
			color: None,
			participants: Vec::new(),
			last_activity_at: None,
			last_word: None,
			solo_bot_id: Some("wren".into()),
		}
	}

	fn notifying_app(is_focused: bool) -> (App, Rc<RefCell<Record>>) {
		let record = Rc::new(RefCell::new(Record { is_focused, ..Record::default() }));
		let mut app = App::new();
		app.notices.attach(Box::new(FakeDesktop(Rc::clone(&record))));
		app.workspace = Workspace::Ready(Ready {
			source: Source::Running(Host::detached()),
			space: Space { id: "space".into(), name: "Personal".into(), colour: None },
			agents: vec![Agent {
				id: "wren".into(),
				name: "Wren".into(),
				title: String::new(),
				avatar_blot: None,
			}],
			conversations: vec![conversation("c-1"), conversation("c-2")],
			person: Person::Unread,
			longest: None,
		});
		(app, record)
	}

	fn heard(app: &mut App, event: AgentEvent) {
		let scope = RuntimeScope { conversation_id: "c-2".into(), bot_id: "wren".into() };
		app.host_event(HostEvent::Agent(ScopedEvent { scope: Some(scope), event }));
	}

	fn turn_ended(outcome: &str) -> AgentEvent {
		AgentEvent::TurnEnded { ended: TurnEnded { outcome: outcome.into() } }
	}

	fn replied(text: &str) -> AgentEvent {
		AgentEvent::MessageCompleted {
			message: StreamedMessage { id: "s1".into(), text: text.into() },
		}
	}

	fn of_conversation(id: &str) -> NoticeTarget {
		NoticeTarget { kind: NoticeKind::Conversation, id: id.into() }
	}

	#[test]
	fn a_turn_ending_out_of_focus_posts_one_notice_and_raises_the_badge_to_one() {
		let (mut app, record) = notifying_app(false);

		heard(&mut app, replied("The tests pass."));
		heard(&mut app, turn_ended("completed"));

		let record = record.borrow();
		assert_eq!(
			record.shown,
			[Notice {
				title: "Wren".into(),
				body: "The tests pass.".into(),
				target: of_conversation("c-2"),
			}]
		);
		assert_eq!(record.badges, [1]);
	}

	#[test]
	fn a_turn_ending_in_focus_posts_nothing_and_leaves_the_badge() {
		let (mut app, record) = notifying_app(true);

		heard(&mut app, replied("The tests pass."));
		heard(&mut app, turn_ended("completed"));

		assert!(record.borrow().shown.is_empty());
		assert!(record.borrow().badges.is_empty());
	}

	#[test]
	fn each_notice_posted_raises_the_badge_by_one() {
		let (mut app, record) = notifying_app(false);

		heard(&mut app, turn_ended("completed"));
		heard(&mut app, turn_ended("completed"));

		assert_eq!(record.borrow().badges, [1, 2]);
		assert_eq!(record.borrow().shown[0].body, "Finished its turn");
	}

	#[test]
	fn a_stopped_or_failed_turn_posts_nothing() {
		let (mut app, record) = notifying_app(false);

		heard(&mut app, replied("Stopped."));
		heard(&mut app, turn_ended("cancelled"));
		heard(&mut app, replied("Broke."));
		heard(&mut app, turn_ended("failed"));

		assert!(record.borrow().shown.is_empty());
		assert!(record.borrow().badges.is_empty());
	}

	#[test]
	fn the_badge_clears_within_a_second_once_a_window_of_the_app_holds_focus() {
		let (mut app, record) = notifying_app(false);
		heard(&mut app, turn_ended("completed"));

		let wake = app.focus_wake().expect("a focus wake while the badge shows");
		assert!(wake <= Duration::from_secs(1), "{wake:?}");
		record.borrow_mut().is_focused = true;
		assert_eq!(app.focus_wake(), None);

		assert_eq!(record.borrow().badges, [1, 0]);
	}

	#[test]
	fn a_zero_badge_schedules_no_focus_wake() {
		let (mut app, record) = notifying_app(false);

		assert_eq!(app.focus_wake(), None);
		heard(&mut app, turn_ended("completed"));
		record.borrow_mut().is_focused = true;
		app.focus_wake();
		record.borrow_mut().is_focused = false;

		assert_eq!(app.focus_wake(), None);
		assert_eq!(record.borrow().badges, [1, 0]);
	}

	#[test]
	fn a_banner_refused_at_once_leaves_the_badge() {
		let (mut app, record) = notifying_app(false);
		record.borrow_mut().refusing = Some(Gesture::Banner);

		heard(&mut app, turn_ended("completed"));

		assert!(record.borrow().badges.is_empty());
		assert_eq!(app.focus_wake(), None);
	}

	#[test]
	fn a_banner_refused_later_takes_its_badge_back() {
		let (mut app, record) = notifying_app(false);
		heard(&mut app, turn_ended("completed"));

		app.received(Inbound::Banner(BannerOutcome::Refused {
			target: of_conversation("c-2"),
			failure: GestureFailure { gesture: Gesture::Banner, answer: "denied".into() },
		}));

		assert_eq!(record.borrow().badges, [1, 0]);
		assert_eq!(app.focus_wake(), None);
	}

	#[test]
	fn a_refused_chime_still_raises_the_badge_of_the_posted_banner() {
		let (mut app, record) = notifying_app(false);
		record.borrow_mut().refusing = Some(Gesture::Chime);

		heard(&mut app, turn_ended("completed"));

		assert_eq!(record.borrow().shown.len(), 1);
		assert_eq!(record.borrow().badges, [1]);
	}

	#[test]
	fn a_refused_badge_keeps_the_app_notifying() {
		let (mut app, record) = notifying_app(false);
		record.borrow_mut().refusing = Some(Gesture::Badge);

		heard(&mut app, turn_ended("completed"));
		heard(&mut app, turn_ended("completed"));

		assert_eq!(record.borrow().shown.len(), 2);
		assert!(app.focus_wake().is_some());
	}

	#[test]
	fn a_clicked_notice_brings_the_main_window_to_its_conversation() {
		let (mut app, record) = notifying_app(false);
		app.navigation.navigate_main(Route::Missions);
		app.pane = Pane::Missions;

		app.received(Inbound::Banner(BannerOutcome::Clicked(of_conversation("c-2"))));

		assert!(app.navigation.main_route() == Route::Conversations);
		assert!(matches!(app.pane, Pane::Conversations));
		assert_eq!(app.thread.as_ref().map(|thread| thread.conversation_id.as_str()), Some("c-2"));
		assert_eq!(record.borrow().raised, 1);
	}
}
