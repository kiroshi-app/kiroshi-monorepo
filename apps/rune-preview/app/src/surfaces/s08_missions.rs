mod feed;
mod menu;
mod seqs;
#[cfg(test)]
mod tests;
mod view;
mod worker;

use kiroshi_core::agent::contract::CancelOutcome;
use kiroshi_core::missions::contract::{Mission, MissionDetail, MissionEventKind, MissionInSpace};
use kiroshi_rune_kit::strings::{Key, Language, chat};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeEvent, NoticeKind, SurfaceEvent};
use kiroshi_rune_kit::surfaces::s05_thread::MissionEvent as ThreadMissionEvent;
use kiroshi_rune_kit::surfaces::s08_missions::{CopyKind, EventKind, MenuAction, MissionsEvent};
use rune::{Tx, Waker};
use serde_json::Value;

use crate::app::{App, Pane};
use crate::conversations::now_ms;
use crate::host::{self, HostError, Profile};
use crate::model;
use crate::source::Source;
use crate::surfaces::s06_composer;

use menu::{HeldMenu, copied_value, copy_word, refusal_of};
use seqs::MissionSeqs;
use worker::{Answer, Call, Command, Worker};

pub use menu::menu_facts;
pub use view::{header, layers, panel};

const LANGUAGE: Language = Language::En;

const SUMMONS: [&str; 3] = [
	"Carry out this mission.",
	"The coding session of this mission is blocked and waiting on you.",
	"The coding agent of this mission is blocked and waiting on you.",
];

const SPOKEN_KEYS: [&str; 4] = ["line", "message", "question", "summary"];

pub fn is_summons(content: &str) -> bool {
	SUMMONS.contains(&content)
}

pub enum Feed {
	Loading,
	Failed(HostError),
	Shown(Vec<MissionInSpace>),
}

struct Panel {
	space_id: String,
	closed_since: i64,
	feed: Feed,
	is_reading: bool,
	is_reread_due: bool,
}

pub enum Detail {
	Loading,
	Failed(HostError),
	Read(Box<MissionDetail>),
}

pub struct Opened {
	pub mission_id: String,
	pub thread_conversation_id: String,
	pub bot_id: String,
	return_to: String,
	detail: Detail,
}

impl Opened {
	pub fn mission(&self) -> Option<&Mission> {
		match &self.detail {
			Detail::Read(detail) => Some(&detail.mission),
			Detail::Loading | Detail::Failed(_) => None,
		}
	}
}

pub struct Opening<'a> {
	pub mission_id: &'a str,
	pub thread_conversation_id: &'a str,
	pub bot_id: &'a str,
	pub objective: &'a str,
	pub origin_conversation_id: &'a str,
}

impl<'a> Opening<'a> {
	fn of(mission: &'a Mission) -> Opening<'a> {
		Opening {
			mission_id: &mission.id,
			thread_conversation_id: &mission.thread_conversation_id,
			bot_id: &mission.bot_id,
			objective: &mission.objective,
			origin_conversation_id: &mission.origin_conversation_id,
		}
	}

	pub fn of_card(mission: &'a model::Mission) -> Opening<'a> {
		Opening {
			mission_id: &mission.id,
			thread_conversation_id: &mission.thread_conversation_id,
			bot_id: &mission.bot_id,
			objective: &mission.objective,
			origin_conversation_id: &mission.origin_conversation_id,
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
struct Notice {
	kind: NoticeKind,
	title: String,
	description: Option<String>,
}

#[derive(Debug, PartialEq, Eq)]
enum Effect {
	Open { url: String, refused: Option<Key> },
	Copy { text: String, copied: String },
}

#[derive(Default)]
pub struct State {
	panel: Option<Panel>,
	is_earlier_today_open: bool,
	notices: Vec<Notice>,
	menu: Option<HeldMenu>,
	seqs: MissionSeqs,
	effects: Vec<Effect>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	worker: Option<Worker>,
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn said(key: Key) -> String {
	key.text(LANGUAGE).to_owned()
}

fn listed_in<'a>(feed: &'a Feed, mission_id: &str) -> Option<&'a Mission> {
	let Feed::Shown(entries) = feed else { return None };
	entries.iter().map(|entry| &entry.mission).find(|mission| mission.id == mission_id)
}

fn refused_before_leaving(profile: Option<Profile>, command: Command) -> Option<HostError> {
	let is_read_only = profile == Some(Profile::Installed);
	(is_read_only && !host::is_read(command.name()))
		.then(|| HostError::WriteRefused { command: command.name().to_owned() })
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn feed(&self) -> Option<&Feed> {
		self.panel.as_ref().map(|panel| &panel.feed)
	}

	fn use_source(&mut self, source: &Source) {
		if self.source.is_none() {
			self.source = Some(source.clone());
			self.flush();
		}
	}

	fn load(&mut self, space_id: String, now: i64) {
		let closed_since = feed::start_of_day(now);
		self.panel = Some(Panel {
			space_id: space_id.clone(),
			closed_since,
			feed: Feed::Loading,
			is_reading: true,
			is_reread_due: false,
		});
		self.queue(Call::Feed { space_id, closed_since });
	}

	fn reread_feed(&mut self, now: i64) {
		let Some(panel) = self.panel.as_mut().filter(|panel| matches!(panel.feed, Feed::Shown(_)))
		else {
			return;
		};
		if panel.is_reading {
			panel.is_reread_due = true;
			return;
		}
		panel.is_reading = true;
		panel.closed_since = feed::start_of_day(now);
		let call =
			Call::Feed { space_id: panel.space_id.clone(), closed_since: panel.closed_since };
		self.queue(call);
	}

	fn retry(&mut self, now: i64) {
		let Some(space_id) = self.panel.as_ref().map(|panel| panel.space_id.clone()) else {
			return;
		};
		self.load(space_id, now);
	}

	fn has_failed(&self) -> bool {
		matches!(self.feed(), Some(Feed::Failed(_)))
	}

	fn fed(
		&mut self,
		space_id: &str,
		closed_since: i64,
		feed: Result<Vec<MissionInSpace>, HostError>,
		opened: Option<&Mission>,
	) {
		let Some(panel) = self
			.panel
			.as_mut()
			.filter(|panel| panel.space_id == space_id && panel.closed_since == closed_since)
		else {
			return;
		};
		panel.is_reading = false;
		let is_reread_due = std::mem::take(&mut panel.is_reread_due);
		match (feed, &panel.feed) {
			(Ok(entries), held) => {
				let held_of = |mission_id: &str| {
					listed_in(held, mission_id)
						.or(opened.filter(|mission| mission.id == mission_id))
				};
				let entries = entries
					.into_iter()
					.map(|mut entry| {
						let held = held_of(&entry.mission.id);
						entry.mission = self.seqs.ordered(entry.mission, held);
						entry
					})
					.collect();
				panel.feed = Feed::Shown(entries);
			}
			(Err(failure), Feed::Shown(_)) => {
				self.raise_failure(chat::activity::failure::missions::TITLE, &failure)
			}
			(Err(failure), _) => panel.feed = Feed::Failed(failure),
		}
		if is_reread_due {
			self.reread_feed(now_ms());
		}
	}

	fn listed(&self, mission_id: &str) -> Option<&Mission> {
		listed_in(self.feed()?, mission_id)
	}

	fn each_listed(&mut self, mission_id: &str, mut change: impl FnMut(&mut Mission)) {
		let Some(Panel { feed: Feed::Shown(entries), .. }) = self.panel.as_mut() else { return };
		entries
			.iter_mut()
			.map(|entry| &mut entry.mission)
			.filter(|mission| mission.id == mission_id)
			.for_each(&mut change);
	}

	fn toggle_earlier_today(&mut self) {
		self.is_earlier_today_open = !self.is_earlier_today_open;
	}

	fn raise(&mut self, kind: NoticeKind, title: String, description: Option<String>) {
		self.notices.push(Notice { kind, title, description });
	}

	fn raise_failure(&mut self, title: Key, failure: &HostError) {
		self.raise(NoticeKind::Error, said(title), Some(failure_text(failure)));
	}

	fn dismiss(&mut self, index: usize) {
		if index < self.notices.len() {
			self.notices.remove(index);
		}
	}

	fn open_pull_request(&mut self, url: Option<String>) {
		let refused = chat::missions::menu::failed::OPEN_PULL_REQUEST;
		match url {
			Some(url) => self.effects.push(Effect::Open { url, refused: Some(refused) }),
			None => self.raise(NoticeKind::Error, said(refused), None),
		}
	}

	fn copy(&mut self, mission: &Mission, kind: CopyKind) {
		let Some(text) = copied_value(mission, kind) else {
			return self.raise(NoticeKind::Error, said(chat::missions::menu::failed::COPY), None);
		};
		let copied =
			said(chat::missions::menu::COPIED).replace("{{kind}}", copy_word(kind).text(LANGUAGE));
		self.effects.push(Effect::Copy { text: text.to_owned(), copied });
	}

	fn show_copy_choices(&mut self, mission_id: &str, is_shown: bool) {
		if let Some(menu) = self.menu.as_mut().filter(|menu| menu.mission_id == mission_id) {
			menu.is_copy_shown = is_shown;
		}
	}

	fn write(&mut self, command: Command, mission_id: &str) {
		let profile = self.source.as_ref().and_then(Source::running_profile);
		if let Some(refused) = refused_before_leaving(profile, command) {
			self.raise_failure(refusal_of(command), &refused);
			return;
		}
		self.queue(Call::Write { command, mission_id: mission_id.to_owned() });
	}

	fn answers(&self) -> Vec<Answer> {
		self.worker.as_ref().map(Worker::answers).unwrap_or_default()
	}

	fn queue(&mut self, call: Call) {
		self.queued.push(call);
		self.flush();
	}

	fn flush(&mut self) {
		if self.worker.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.worker = Worker::spawn(source.clone(), waker.clone());
		}
		let Some(worker) = self.worker.as_ref() else { return };
		for call in self.queued.drain(..) {
			worker.send(call);
		}
	}
}

fn state(app: &mut App) -> &mut State {
	&mut app.surfaces.s08_missions
}

fn follow_shown_space(app: &mut App) {
	let Some(ready) = app.ready() else { return };
	let (source, space_id) = (ready.source.clone(), ready.space.id.clone());
	let is_shown = matches!(app.pane, Pane::Missions);
	let missions = state(app);
	missions.use_source(&source);
	let is_followed = missions.panel.as_ref().is_some_and(|panel| panel.space_id == space_id);
	if is_shown && !is_followed {
		missions.load(space_id, now_ms());
	}
}

pub fn show(app: &mut App) {
	if state(app).has_failed() {
		state(app).retry(now_ms());
	}
	follow_shown_space(app);
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	follow_shown_space(app);
	let answers = state(app).answers();
	let effects = std::mem::take(&mut state(app).effects);
	let is_changed = !answers.is_empty() || !effects.is_empty();
	for answer in answers {
		landed(app, answer);
	}
	for effect in effects {
		run(app, effect, tx);
	}
	is_changed
}

fn landed(app: &mut App, answer: Answer) {
	match answer {
		Answer::Feed { space_id, closed_since, feed } => {
			let opened = app.mission.as_ref().and_then(Opened::mission);
			app.surfaces.s08_missions.fed(&space_id, closed_since, feed, opened)
		}
		Answer::Detail { mission_id, detail } => read(app, &mission_id, detail),
		Answer::Written { mission_id, outcome: Ok(mission), .. } => {
			written(app, &mission_id, mission)
		}
		Answer::Written { command, outcome: Err(failure), .. } => {
			state(app).raise_failure(refusal_of(command), &failure)
		}
		Answer::Stopped(outcome) => stopped(app, outcome),
	}
	close_vanished_menu(app);
}

fn stopped(app: &mut App, outcome: Result<CancelOutcome, HostError>) {
	let refused = chat::missions::menu::failed::STOP_AGENT;
	match outcome {
		Ok(CancelOutcome::Cancelled | CancelOutcome::NothingToCancel) => {}
		Ok(CancelOutcome::Failed { .. }) => {
			state(app).raise(NoticeKind::Error, said(refused), None)
		}
		Err(failure) => state(app).raise_failure(refused, &failure),
	}
}

fn close_vanished_menu(app: &mut App) {
	let menu = app.surfaces.s08_missions.menu.as_ref();
	if menu.is_some_and(|menu| known(app, &menu.mission_id).is_none()) {
		state(app).menu = None;
	}
}

fn run(app: &mut App, effect: Effect, tx: &mut Tx) {
	match effect {
		Effect::Copy { text, copied } => {
			tx.copy(text);
			state(app).raise(NoticeKind::Info, copied, None);
		}
		Effect::Open { url, refused } => {
			if let Err(failure) = tx.open_url(&url) {
				let (title, description) = match refused {
					Some(key) => (said(key), failure.to_string()),
					None => (failure.to_string(), url),
				};
				state(app).raise(NoticeKind::Error, title, Some(description));
			}
		}
	}
}

fn return_point(app: &App, origin_conversation_id: &str) -> String {
	if let Some(opened) = &app.mission {
		return opened.return_to.clone();
	}
	app.thread
		.as_ref()
		.map_or_else(|| origin_conversation_id.to_owned(), |thread| thread.conversation_id.clone())
}

pub fn open(app: &mut App, opening: &Opening) {
	if app.ready().is_none() {
		return;
	}
	let return_to = return_point(app, opening.origin_conversation_id);
	let bot = app
		.ready()
		.and_then(|ready| ready.agents.iter().find(|agent| agent.id == opening.bot_id))
		.cloned();
	app.open_mission_thread(opening.thread_conversation_id, opening.objective, bot.as_ref());
	app.mission = Some(Opened {
		mission_id: opening.mission_id.to_owned(),
		thread_conversation_id: opening.thread_conversation_id.to_owned(),
		bot_id: opening.bot_id.to_owned(),
		return_to,
		detail: Detail::Loading,
	});
	state(app).queue(Call::Detail(opening.mission_id.to_owned()));
}

fn open_listed(app: &mut App, mission_id: &str) {
	if let Some(mission) = state(app).listed(mission_id).cloned() {
		return open(app, &Opening::of(&mission));
	}
	let card = app
		.thread
		.as_ref()
		.and_then(|thread| thread.missions.iter().find(|mission| mission.id == mission_id))
		.cloned();
	if let Some(mission) = card {
		open(app, &Opening::of_card(&mission));
	}
}

pub fn back(app: &mut App) {
	let Some(opened) = app.mission.take() else { return };
	app.thread = None;
	app.open(&opened.return_to);
}

fn reread(app: &mut App) {
	let Some(opened) = app.mission.as_mut() else { return };
	if !matches!(opened.detail, Detail::Read(_)) {
		opened.detail = Detail::Loading;
	}
	let mission_id = opened.mission_id.clone();
	state(app).queue(Call::Detail(mission_id));
}

fn read(app: &mut App, mission_id: &str, detail: Result<MissionDetail, HostError>) {
	let held = known(app, mission_id).cloned();
	let Some(opened) = app.mission.as_mut().filter(|opened| opened.mission_id == mission_id) else {
		return;
	};
	match detail {
		Ok(mut detail) => {
			detail.mission = app.surfaces.s08_missions.seqs.ordered(detail.mission, held.as_ref());
			opened.detail = Detail::Read(Box::new(detail));
		}
		Err(failure) if matches!(opened.detail, Detail::Read(_)) => {
			let title = said(chat::missions::failure::read::TITLE);
			let description = format!(
				"{} {}",
				said(chat::missions::failure::read::DESCRIPTION),
				failure_text(&failure)
			);
			state(app).raise(NoticeKind::Error, title, Some(description));
		}
		Err(failure) => opened.detail = Detail::Failed(failure),
	}
}

fn written(app: &mut App, mission_id: &str, mission: Mission) {
	let held = known(app, mission_id).cloned();
	let mission = state(app).seqs.ordered(mission, held.as_ref());
	state(app).each_listed(mission_id, |held| *held = mission.clone());
	let opened = app.mission.as_mut().filter(|opened| opened.mission_id == mission_id);
	if let Some(Opened { detail: Detail::Read(detail), .. }) = opened {
		detail.mission = mission;
	}
}

pub fn changed(app: &mut App, changed: &model::MissionChanged) {
	let mission_id = changed.mission_id.as_str();
	if state(app).seqs.admits_change(mission_id, changed.state_seq) {
		apply_change(app, changed);
	}
	state(app).reread_feed(now_ms());
	let is_opened = app.mission.as_ref().is_some_and(|opened| opened.mission_id == mission_id);
	if is_opened {
		state(app).queue(Call::Detail(mission_id.to_owned()));
	}
}

fn apply_change(app: &mut App, changed: &model::MissionChanged) {
	let mission_id = changed.mission_id.as_str();
	state(app).each_listed(mission_id, |mission| feed::moved(mission, changed));
	if let Some(thread) = app.thread.as_mut() {
		for card in thread.missions.iter_mut().filter(|card| card.id == mission_id) {
			card.state = changed.state;
			card.is_agent_running = changed.is_agent_running;
			card.status.clone_from(&changed.status);
		}
	}
	let opened = app.mission.as_mut().filter(|opened| opened.mission_id == mission_id);
	if let Some(Opened { detail: Detail::Read(detail), .. }) = opened {
		feed::moved(&mut detail.mission, changed);
	}
}

fn known<'a>(app: &'a App, mission_id: &str) -> Option<&'a Mission> {
	let opened = app.mission.as_ref().and_then(Opened::mission);
	app.surfaces
		.s08_missions
		.listed(mission_id)
		.or(opened.filter(|mission| mission.id == mission_id))
}

fn act(app: &mut App, mission_id: &str, action: MenuAction) {
	let Some(mission) = known(app, mission_id).cloned() else { return };
	match action {
		MenuAction::Open => open(app, &Opening::of(&mission)),
		MenuAction::MessageAgent | MenuAction::Answer => open_at_composer(app, &mission),
		MenuAction::OpenPullRequest => state(app).open_pull_request(mission.pull_request_url),
		MenuAction::StopAgent => state(app).queue(Call::Stop {
			conversation_id: mission.thread_conversation_id,
			bot_id: mission.bot_id,
		}),
		MenuAction::Close => state(app).write(Command::Close, mission_id),
		MenuAction::Reopen => state(app).write(Command::Reopen, mission_id),
	}
}

fn open_at_composer(app: &mut App, mission: &Mission) {
	open(app, &Opening::of(mission));
	let is_blocked = mission.closed_at.is_some();
	s06_composer::focus_prompt(app, &mission.thread_conversation_id, is_blocked);
}

fn copy(app: &mut App, mission_id: &str, kind: CopyKind) {
	let Some(mission) = known(app, mission_id).cloned() else { return };
	state(app).copy(&mission, kind);
}

fn close_menu(app: &mut App) {
	state(app).menu = None;
}

pub fn emitted(app: &mut App, event: MissionsEvent) {
	match event {
		MissionsEvent::Open { mission, .. } => open_listed(app, &mission),
		MissionsEvent::OpenUrl(url) => state(app).effects.push(Effect::Open { url, refused: None }),
		MissionsEvent::Back => back(app),
		MissionsEvent::ToggleEarlierToday => state(app).toggle_earlier_today(),
		MissionsEvent::MenuRequested { mission, source, at } => {
			state(app).menu =
				Some(HeldMenu { mission_id: mission, source, at, is_copy_shown: false })
		}
		MissionsEvent::CopyChoicesShown { mission, is_shown } => {
			state(app).show_copy_choices(&mission, is_shown)
		}
		MissionsEvent::MenuChosen { mission, action } => {
			close_menu(app);
			act(app, &mission, action)
		}
		MissionsEvent::MenuCopied { mission, kind } => {
			close_menu(app);
			copy(app, &mission, kind)
		}
		MissionsEvent::MenuDismissed => close_menu(app),
	}
}

fn panel_noticed(app: &mut App, event: NoticeEvent) {
	match event {
		NoticeEvent::Retry => state(app).retry(now_ms()),
		NoticeEvent::Dismiss => {}
	}
}

fn detail_noticed(app: &mut App, event: NoticeEvent) {
	match event {
		NoticeEvent::Retry => reread(app),
		NoticeEvent::Dismiss => {}
	}
}

fn noticed(app: &mut App, event: SurfaceEvent) {
	match event {
		SurfaceEvent::Close(index) | SurfaceEvent::Act(index) | SurfaceEvent::CopyReport(index) => {
			state(app).dismiss(index)
		}
	}
}

pub fn is_animating(app: &App) -> bool {
	let is_panel_shown = matches!(app.pane, Pane::Missions);
	let listed_working = match app.surfaces.s08_missions.feed() {
		Some(Feed::Shown(entries)) => entries.iter().any(|entry| feed::is_working(&entry.mission)),
		_ => false,
	};
	let opened_working =
		app.mission.as_ref().and_then(Opened::mission).is_some_and(feed::is_working);
	(is_panel_shown && listed_working) || opened_working
}

fn shown_kind(kind: MissionEventKind) -> Option<EventKind> {
	match kind {
		MissionEventKind::Opened => Some(EventKind::Opened),
		MissionEventKind::Note => Some(EventKind::Note),
		MissionEventKind::AgentAsked => Some(EventKind::AgentAsked),
		MissionEventKind::Answered => Some(EventKind::Answered),
		MissionEventKind::Escalated => Some(EventKind::Escalated),
		MissionEventKind::Ready => Some(EventKind::Ready),
		MissionEventKind::ChecksFailed => Some(EventKind::ChecksFailed),
		MissionEventKind::Failed => Some(EventKind::Failed),
		MissionEventKind::Closed => Some(EventKind::Closed),
		MissionEventKind::Dismissed => Some(EventKind::Dismissed),
		MissionEventKind::Reopened => Some(EventKind::Reopened),
		MissionEventKind::AgentStarted
		| MissionEventKind::AgentStopped
		| MissionEventKind::Status
		| MissionEventKind::Updated
		| MissionEventKind::HandedOff => None,
	}
}

fn spoken_text(payload: &Value) -> Option<String> {
	SPOKEN_KEYS.iter().find_map(|key| {
		payload.get(key).and_then(Value::as_str).filter(|text| !text.is_empty()).map(str::to_owned)
	})
}

fn event_link(payload: &Value) -> Option<(String, Option<u32>)> {
	let url = payload.get("url")?.as_str()?;
	let pull_request = payload
		.get("pullRequest")
		.and_then(Value::as_u64)
		.and_then(|number| u32::try_from(number).ok());
	Some((url.to_owned(), pull_request))
}

pub fn thread_events(app: &App) -> Vec<ThreadMissionEvent> {
	let Some(Opened { detail: Detail::Read(detail), .. }) = &app.mission else {
		return Vec::new();
	};
	let mut events: Vec<ThreadMissionEvent> = detail
		.events
		.iter()
		.filter_map(|event| {
			Some(ThreadMissionEvent {
				id: event.id.clone(),
				kind: shown_kind(event.kind)?,
				source: event.source.clone(),
				created_at: event.created_at,
				text: spoken_text(&event.payload),
				link: event_link(&event.payload),
			})
		})
		.collect();
	events.sort_by_key(|event| event.created_at);
	events
}
