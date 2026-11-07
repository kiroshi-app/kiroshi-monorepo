use std::sync::mpsc::{self, Receiver, Sender};
use std::thread;

use rune::image::{Image, ImageCache};
use rune::{ClipboardContent, TextEdit, Waker};
use rune_kit::shell::PaneState;
use serde_json::json;

use kiroshi_rune_kit::avatar::Motion;
use kiroshi_rune_kit::math::Typesetter;

use crate::content;
use crate::dev_profile::{self, DevProfile};
use crate::events::HostEvent;
use crate::host::{Host, HostError, Profile};
use crate::images::{Fetched, Images};
use crate::local;
use crate::longest::{self, Longest};
use crate::model::{
	Agent, AgentEvent, Conversation, ConversationMissions, ConversationPage, KiroshiAccountState,
	Message, MessagePage, Mission, MissionChanged, MissionDetail, MissionEvent, MissionOnBoard,
	Role, Space,
};
use crate::navigation::{Navigation, Route};
use crate::onboarding::{Method, Step};
use crate::runs::Runs;
use crate::source::Source;
use crate::surfaces::Surfaces;
use crate::turn::{self, SendError};

const PAGE_LIMIT: u32 = 200;

const MAX_THREAD_MESSAGES: usize = 10_000;

pub const AGENT_PILL: &str = "agent:";

const IMAGES_NOT_SENT: &str = "The preview doesn't upload images. Remove them to send the text.";

const SENDING_OFF: &str = "Sending is off on the installed Kiroshi: the preview only reads it. Sending is proven on Kiroshi Dev.";

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

	fn of_mission(mission: &Mission, bot: &Agent) -> Thread {
		let seat = Seat { bot_id: bot.id.clone(), name: bot.name.clone(), hue: bot.avatar_blot };
		Thread {
			conversation_id: mission.thread_conversation_id.clone(),
			title: mission.objective.clone(),
			seats: vec![seat],
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

pub struct Mention {
	pub start: usize,
	pub query: String,
	pub active: usize,
}

pub struct Attachment {
	pub id: u64,
	pub name: String,
	pub bytes: usize,
	pub image: Image,
}

pub struct Composer {
	pub edit: TextEdit,
	pub mention: Option<Mention>,
	pub attachments: Vec<Attachment>,
	next_attachment: u64,
}

pub struct Mentionable {
	pub bot_id: String,
	pub name: String,
	pub hue: Option<f32>,
	pub title: String,
	pub outside: bool,
}

pub struct MentionMenu {
	pub rows: Vec<Mentionable>,
	pub further: usize,
}

const OPENING_MENTIONS: usize = 6;

const PASTED_IMAGE_NAME: &str = "image.png";

pub enum Pane {
	Conversations,
	Missions,
}

pub enum Board {
	Unread,
	Reading,
	Read(Vec<MissionOnBoard>),
	Failed(HostError),
}

pub struct OpenMission {
	pub mission: Mission,
	pub bot: Agent,
	pub events: Vec<MissionEvent>,
	pub failure: Option<HostError>,
}

pub enum Inbound {
	Board(Result<Vec<MissionOnBoard>, HostError>),
	MissionRead(Result<MissionDetail, HostError>),
	MissionsOf { conversation_id: String, missions: Result<ConversationMissions, HostError> },
	Connected(Result<Ready, HostError>),
	ThreadRead { conversation_id: String, messages: Result<Vec<Message>, HostError> },
	SendFailed(SendError),
	Host(HostEvent),
	Image(Fetched),
	DevProfile(DevProfile),
	Longest(Result<Option<Longest>, HostError>),
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
	pub composer: Composer,
	pub images: Images,
	pub sidebar: PaneState,
	pub spike: crate::spike::editor::Editor,
	pub notice: Option<String>,
	pub onboarding_code: TextEdit,
	pub onboarding_key: TextEdit,
	pub dev_profile: Option<DevProfile>,
	pub connect_method: Method,
	pub import_selected: Vec<String>,
	pub runs: Runs,
	pub clock_ms: f64,
	pub math: Typesetter,
	pub pane: Pane,
	pub host_profile: Profile,
	pub uses_host_api: bool,
	pub board: Board,
	pub mission: Option<OpenMission>,
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
			navigation: Navigation::new(Route::Onboarding(Step::first())),
			surfaces: Surfaces::default(),
			workspace: Workspace::Connecting,
			thread: None,
			composer: Composer {
				edit: TextEdit::new(""),
				mention: None,
				attachments: Vec::new(),
				next_attachment: 0,
			},
			images: Images::default(),
			sidebar: PaneState::new(276.0).range(180.0, 480.0),
			spike: crate::spike::editor::Editor::default(),
			notice: None,
			onboarding_code: TextEdit::new(""),
			onboarding_key: TextEdit::new(""),
			dev_profile: None,
			connect_method: Method::SignIn,
			import_selected: Vec::new(),
			runs: Runs::default(),
			math: Typesetter::default(),
			pane: Pane::Conversations,
			host_profile: Profile::Installed,
			uses_host_api: false,
			board: Board::Unread,
			mission: None,
			clock_ms: 0.0,
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
		match (self.dev_profile.is_none(), self.uses_host_api) {
			(true, true) => {
				self.work(|outbox| outbox.deliver(Inbound::DevProfile(dev_profile::read())))
			}
			(true, false) => self.dev_profile = Some(DevProfile::default()),
			(false, _) => {}
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
		changed
	}

	pub fn tick(&mut self, seconds: f64) -> bool {
		self.clock_ms = seconds * 1000.0;
		self.is_animating()
	}

	pub fn is_animating(&self) -> bool {
		let running = |mission: &Mission| mission.is_agent_running;
		let on_board = matches!(self.pane, Pane::Missions)
			&& matches!(&self.board, Board::Read(board) if board.iter().any(|entry| running(&entry.mission)));
		!self.runs.is_empty()
			|| on_board
			|| self.mission.as_ref().is_some_and(|open| running(&open.mission))
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
		self.composer.mention = None;
		self.notice = None;
		self.mission = None;
		self.thread = Some(thread);
		self.read_thread(host.clone(), conversation_id.to_owned());
		let conversation_id = conversation_id.to_owned();
		self.work(move |outbox| {
			let missions =
				host.invoke("mission_list", json!({ "conversationId": conversation_id }));
			outbox.deliver(Inbound::MissionsOf { conversation_id, missions });
		});
	}

	pub fn show_missions(&mut self) {
		self.pane = Pane::Missions;
		if !matches!(self.board, Board::Unread | Board::Failed(_)) {
			return;
		}
		let Some(host) = self.ready().map(|ready| ready.source.clone()) else { return };
		self.board = Board::Reading;
		self.work(move |outbox| {
			outbox.deliver(Inbound::Board(host.invoke("mission_board", json!({}))))
		});
	}

	pub fn show_conversations(&mut self) {
		self.pane = Pane::Conversations;
	}

	pub fn open_mission(&mut self, mission: &Mission, bot: &Agent) {
		let Some(host) = self.ready().map(|ready| ready.source.clone()) else { return };
		self.composer.mention = None;
		self.notice = None;
		self.thread = Some(Thread::of_mission(mission, bot));
		self.mission = Some(OpenMission {
			mission: mission.clone(),
			bot: bot.clone(),
			events: Vec::new(),
			failure: None,
		});
		self.read_thread(host, mission.thread_conversation_id.clone());
		self.read_mission(&mission.id);
	}

	pub fn open_mission_of_turn(&mut self, mission_id: &str) {
		let found = self.thread.as_ref().and_then(|thread| {
			thread.missions.iter().find(|mission| mission.id == mission_id).cloned()
		});
		let Some(mission) = found else { return };
		let Some(bot) = self.ready().and_then(|ready| {
			ready.agents.iter().find(|agent| agent.id == mission.bot_id).cloned()
		}) else {
			return;
		};
		self.open_mission(&mission, &bot);
	}

	pub fn leave_mission(&mut self) {
		let Some(open) = self.mission.take() else { return };
		self.thread = None;
		self.open(&open.mission.origin_conversation_id);
	}

	fn read_mission(&self, mission_id: &str) {
		let Some(host) = self.ready().map(|ready| ready.source.clone()) else { return };
		let mission_id = mission_id.to_owned();
		self.work(move |outbox| {
			let detail = host.invoke("mission_detail", json!({ "missionId": mission_id }));
			outbox.deliver(Inbound::MissionRead(detail));
		});
	}

	fn mission_changed(&mut self, changed: MissionChanged) {
		let apply = |mission: &mut Mission| {
			if mission.id == changed.mission_id {
				mission.state = changed.state;
				mission.is_agent_running = changed.is_agent_running;
			}
		};
		if let Board::Read(board) = &mut self.board {
			board.iter_mut().for_each(|entry| apply(&mut entry.mission));
		}
		if let Some(thread) = self.thread.as_mut() {
			thread.missions.iter_mut().for_each(apply);
		}
		let Some(open) = self.mission.as_mut().filter(|open| open.mission.id == changed.mission_id)
		else {
			return;
		};
		apply(&mut open.mission);
		let mission_id = open.mission.id.clone();
		self.read_mission(&mission_id);
	}

	fn mission_read(&mut self, detail: Result<MissionDetail, HostError>) {
		let Some(open) = self.mission.as_mut() else { return };
		match detail {
			Ok(detail) if detail.mission.id == open.mission.id => {
				open.mission = detail.mission;
				open.events = detail.events;
				open.failure = None;
			}
			Ok(_) => {}
			Err(failure) => open.failure = Some(failure),
		}
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

	pub fn mention_menu(&self) -> Option<MentionMenu> {
		let thread = self.thread.as_ref()?;
		let needle = self.composer.mention.as_ref()?.query.to_lowercase();
		let agents = self.ready().map_or(&[][..], |ready| ready.agents.as_slice());
		let title_of = |bot_id: &str| {
			agents
				.iter()
				.find(|agent| agent.id == bot_id)
				.map_or(String::new(), |agent| agent.title.clone())
		};
		let seated: Vec<Mentionable> = thread
			.seats
			.iter()
			.map(|seat| Mentionable {
				bot_id: seat.bot_id.clone(),
				name: seat.name.clone(),
				hue: seat.hue,
				title: title_of(&seat.bot_id),
				outside: false,
			})
			.collect();
		let unseated: Vec<Mentionable> = agents
			.iter()
			.filter(|agent| !thread.seats.iter().any(|seat| seat.bot_id == agent.id))
			.map(|agent| Mentionable {
				bot_id: agent.id.clone(),
				name: agent.name.clone(),
				hue: agent.avatar_blot,
				title: agent.title.clone(),
				outside: true,
			})
			.collect();
		let mentionable = seated.len() + unseated.len();
		let named = |row: &Mentionable| row.name.to_lowercase().contains(&needle);
		let mut rows: Vec<Mentionable> = seated.into_iter().filter(named).collect();
		if needle.is_empty() {
			rows.truncate(OPENING_MENTIONS);
		} else {
			rows.extend(unseated.into_iter().filter(named));
		}
		let further = if needle.is_empty() { mentionable - rows.len() } else { 0 };
		(!rows.is_empty()).then_some(MentionMenu { rows, further })
	}

	fn mention_count(&self) -> usize {
		self.mention_menu().map_or(0, |menu| menu.rows.len())
	}

	pub fn pasted(&mut self, content: &ClipboardContent) -> bool {
		let Some(image) = content.image().filter(|_| content.text().is_empty()) else {
			return false;
		};
		let Some(decoded) = self.images.decode(image.png()) else { return false };
		let composer = &mut self.composer;
		composer.next_attachment += 1;
		composer.attachments.push(Attachment {
			id: composer.next_attachment,
			name: PASTED_IMAGE_NAME.to_owned(),
			bytes: image.png().len(),
			image: decoded,
		});
		true
	}

	pub fn remove_attachment(&mut self, id: u64) {
		self.composer.attachments.retain(|attachment| attachment.id != id);
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
		let count = self.mention_count();
		if let Some(mention) = self.composer.mention.as_mut() {
			mention.active = mention.active.min(count.saturating_sub(1));
		}
	}

	pub fn move_mention(&mut self, step: isize) {
		let count = self.mention_count();
		if let Some(mention) = self.composer.mention.as_mut().filter(|_| count > 0) {
			mention.active = (mention.active as isize + step).rem_euclid(count as isize) as usize;
		}
	}

	pub fn choose_active_mention(&mut self) -> bool {
		let Some(active) = self.composer.mention.as_ref().map(|mention| mention.active) else {
			return false;
		};
		let chosen = self.mention_menu().and_then(|menu| menu.rows.into_iter().nth(active));
		let Some(bot_id) = chosen.map(|row| row.bot_id) else {
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
			self.thread.as_ref().map(|thread| thread.conversation_id.clone())
		else {
			return;
		};
		let (content, summoned) = outgoing(&self.composer.edit);
		if content.trim().is_empty() {
			return;
		}
		if ready.source.running_profile() == Some(Profile::Installed) {
			self.notice = Some(SENDING_OFF.to_owned());
			return;
		}
		if !self.composer.attachments.is_empty() {
			self.notice = Some(IMAGES_NOT_SENT.to_owned());
			return;
		}
		let host = ready.source.clone();
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
					ready.source.listen(move |event| outbox.deliver(Inbound::Host(event)));
				}
				let host = ready.source.clone();
				let conversations = ready.conversations.clone();
				self.workspace = Workspace::Ready(ready);
				self.work(move |outbox| {
					outbox.deliver(Inbound::Longest(longest::longest(&host, &conversations)))
				});
			}
			Inbound::Longest(found) => self.longest_found(found),
			Inbound::Board(board) => {
				self.board = match board {
					Ok(board) => Board::Read(board),
					Err(failure) => Board::Failed(failure),
				}
			}
			Inbound::MissionRead(detail) => self.mission_read(detail),
			Inbound::MissionsOf { conversation_id, missions } => {
				self.missions_of(&conversation_id, missions)
			}
			Inbound::Connected(Err(failure)) => self.workspace = Workspace::Failed(failure),
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
		match event {
			HostEvent::Agent(scoped) => {
				let Some(scope) = scoped.scope else { return };
				self.runs.heard(&scope, &scoped.event);
				let Some(thread) = self.thread.as_mut() else { return };
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
			HostEvent::MissionChanged(changed) => self.mission_changed(changed),
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

pub fn ready_on(source: Source) -> Result<Ready, HostError> {
	let spaces: Vec<Space> = source.invoke("space_list", json!({}))?;
	let Some(space) = spaces.into_iter().next() else {
		return Err(HostError::CommandFailed {
			command: "space_list".into(),
			status: 200,
			body: "no Space on the dev profile".into(),
		});
	};
	let agents = source.invoke("conversation_bots", json!({ "spaceId": space.id }))?;
	let conversations = roster(&source, &space.id)?;
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
