mod about;
mod account;
mod calls;
mod diagnostics;
mod hits;
mod preferences;
mod search;
#[cfg(test)]
mod tests;
mod view;

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use kiroshi_core::updates::contract::UpdateState;
use rune::{Key as Pressed, KeyEvent, TextEdit, Tx, Waker};

use kiroshi_rune_kit::primitives::toast::ToastType;
use kiroshi_rune_kit::strings::{Key, Language, chat, search as copy, settings};
use kiroshi_rune_kit::surfaces::s12_person_settings::SettingsEvent;
use kiroshi_rune_kit::surfaces::s12_person_settings::search::SearchEvent;
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::Entry;

use crate::app::{App, Person};
use crate::host::HostError;
use crate::model::{MissionDetail, Space};
use crate::navigation::Route;
use crate::onboarding::Step;
use crate::source::Source;

use about::Updater;
use account::{Account, Devices, DevicesRead, Watched};
use calls::{Answer, Call, Calls, Due};
use diagnostics::specs_text;
use hits::{Landing, Lookups, Opened, Target};
use preferences::{Change, Preferences};
use search::Search;

pub use view::{layers, view};

const ACCOUNT_PAGE_URL: &str = "https://kiroshi.app/account";

const NOTICE_LIFETIME: Duration = Duration::from_secs(6);

const SIGN_IN_WATCH: Duration = Duration::from_secs(2);

const DOWNLOAD_WATCH: Duration = Duration::from_millis(500);

const NEXT: isize = 1;

const PREVIOUS: isize = -1;

#[derive(Clone, Debug, PartialEq)]
pub struct Notice {
	pub kind: ToastType,
	pub title: String,
	pub description: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
	Copy { text: String, copied: Option<Key> },
	Open { url: String, refused: Key },
}

enum Follow {
	OpenMission(MissionDetail),
}

pub struct State {
	preferences: Preferences,
	account: Account,
	devices: Devices,
	updater: Updater,
	version: Option<String>,
	spaces: Vec<Space>,
	entry: Option<Entry>,
	return_to: Option<Route>,
	is_clearing_log: bool,
	has_checked: bool,
	is_watching_sign_in: bool,
	is_watching_download: bool,
	search: Option<Search>,
	edit: TextEdit,
	landing: Option<Landing>,
	opening_mission: Option<String>,
	notice: Option<(u64, Notice)>,
	notices_raised: u64,
	effects: Vec<Effect>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

impl Default for State {
	fn default() -> State {
		State {
			preferences: Preferences::default(),
			account: Account::default(),
			devices: Devices::default(),
			updater: Updater::new(now_ms()),
			version: None,
			spaces: Vec::new(),
			entry: None,
			return_to: None,
			is_clearing_log: false,
			has_checked: false,
			is_watching_sign_in: false,
			is_watching_download: false,
			search: None,
			edit: TextEdit::new(""),
			landing: None,
			opening_mission: None,
			notice: None,
			notices_raised: 0,
			effects: Vec::new(),
			queued: Vec::new(),
			source: None,
			waker: None,
			calls: None,
		}
	}
}

fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn first_entry(watched: Option<&Watched>, person: &Person) -> Entry {
	match (watched, person) {
		(Some(Watched::SignedIn { .. }), _) => Entry::Account,
		(Some(_), _) | (None, Person::SignedOut) => Entry::Appearance,
		(None, Person::SignedIn(_) | Person::Unread) => Entry::Account,
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	pub fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
		self.flush();
	}

	pub fn language(&self) -> Language {
		self.preferences.shown().language.unwrap_or(Language::En)
	}

	pub fn landing(&self) -> Option<&Landing> {
		self.landing.as_ref()
	}

	pub fn forget_landing(&mut self, taken: &Landing) {
		if self.landing.as_ref() == Some(taken) {
			self.landing = None;
		}
	}

	pub fn is_searching(&self) -> bool {
		self.search.is_some()
	}

	fn wake(&self) {
		if let Some(waker) = self.waker.as_ref() {
			waker();
		}
	}

	fn said(&self, key: Key) -> String {
		key.text(self.language()).to_owned()
	}

	fn raise(&mut self, kind: ToastType, title: Key, description: Option<Key>) {
		let description = description.map(|key| self.said(key)).unwrap_or_default();
		let notice = Notice { kind, title: self.said(title), description };
		self.raise_notice(notice);
	}

	fn raise_notice(&mut self, notice: Notice) {
		self.notices_raised += 1;
		self.notice = Some((self.notices_raised, notice));
		self.queued.push(Call::Wake(NOTICE_LIFETIME, Due::Notice(self.notices_raised)));
	}

	fn fail(&mut self, title: Key, failure: &HostError) {
		eprintln!("{}: {}", title.path(), failure_text(failure));
		self.raise(ToastType::Error, title, None);
	}

	fn opened(&mut self, from: Route) {
		if from != Route::PersonSettings {
			self.return_to = Some(from);
		}
		self.entry = None;
		self.is_clearing_log = false;
		self.devices.cancel();
		self.queued.extend([
			Call::ReadPreferences,
			Call::ReadAccount,
			Call::ReadVersion,
			Call::ReadSpaces,
		]);
		if !std::mem::replace(&mut self.has_checked, true) {
			self.queued.push(Call::CheckUpdate);
		}
	}

	fn left(&mut self) -> Route {
		self.notice = None;
		self.is_clearing_log = false;
		self.devices.cancel();
		self.return_to.take().unwrap_or(Route::Conversations)
	}

	fn change(&mut self, change: Change) {
		self.queued.extend(self.preferences.change(change).map(Call::Change));
	}

	fn settings_event(&mut self, event: SettingsEvent) {
		match event {
			SettingsEvent::Select(entry) => self.entry = Some(entry),
			SettingsEvent::ColorScheme(scheme) => self.change(Change::ColorScheme(scheme)),
			SettingsEvent::Notify(which, is_on) => self.change(Change::Notify(which, is_on)),
			SettingsEvent::Language(language) => self.change(Change::Language(language)),
			SettingsEvent::Channel(channel) => self.change(Change::Channel(channel)),
			SettingsEvent::ShowsWhatsNew(shows) => self.change(Change::ShowsWhatsNew(shows)),
			SettingsEvent::CopyDiagnostics => self.queued.push(Call::CopyDiagnostics),
			SettingsEvent::RevealLog => self.queued.push(Call::RevealLog),
			SettingsEvent::AskClearLog => self.is_clearing_log = true,
			SettingsEvent::CancelClearLog => self.is_clearing_log = false,
			SettingsEvent::ClearLog => {
				self.is_clearing_log = false;
				self.queued.push(Call::ClearLog);
			}
			SettingsEvent::Check => self.queued.push(Call::CheckUpdate),
			SettingsEvent::Download => {
				let call = self.updater.install();
				self.watch_download(call.as_ref());
				self.queued.extend(call);
			}
			SettingsEvent::Restart => {
				if self.updater.can_restart() {
					self.queued.push(Call::RestartToUpdate);
				}
			}
			SettingsEvent::ReleaseNotes => {
				if let Some(version) = &self.version {
					let url = about::release_notes_url(version);
					self.effects.push(Effect::Open { url, refused: chat::screen::notice::FAILED });
				}
			}
			SettingsEvent::SignIn => self.queued.push(Call::SignIn),
			SettingsEvent::CancelSignIn => self.queued.push(Call::CancelSignIn),
			SettingsEvent::CopySignInLink => {
				if let Some(link) = self.account.sign_in_link() {
					let copied = Some(settings::account::SIGN_IN_LINK_COPIED);
					self.effects.push(Effect::Copy { text: link.to_owned(), copied });
				}
			}
			SettingsEvent::ManageAccount => self.effects.push(Effect::Open {
				url: ACCOUNT_PAGE_URL.to_owned(),
				refused: settings::account::MANAGE_ACCOUNT_FAILED,
			}),
			SettingsEvent::SignOut => self.queued.push(Call::SignOut),
			SettingsEvent::AskRemoval(device_id) => self.devices.ask(device_id),
			SettingsEvent::CancelRemoval => self.devices.cancel(),
			SettingsEvent::Remove(device_id) => {
				if self.devices.removing(&device_id) {
					self.queued.push(Call::RemoveDevice(device_id));
				}
			}
			SettingsEvent::CreateSpace => {
				let name = self.said(settings::space::UNTITLED);
				self.queued.push(Call::CreateSpace(name));
			}
			SettingsEvent::Close
			| SettingsEvent::Back
			| SettingsEvent::OpenSpace(_)
			| SettingsEvent::ImportFromClaudeCode
			| SettingsEvent::ReplayOnboarding
			| SettingsEvent::WhatsNew
			| SettingsEvent::PickPicture
			| SettingsEvent::RemovePicture => {}
		}
	}

	fn watch_download(&mut self, call: Option<&Call>) {
		if call == Some(&Call::InstallUpdate) && !self.is_watching_download {
			self.is_watching_download = true;
			self.queued.push(Call::Wake(DOWNLOAD_WATCH, Due::DownloadWatch));
		}
	}

	fn watch_sign_in(&mut self) {
		if self.account.is_waiting() && !self.is_watching_sign_in {
			self.is_watching_sign_in = true;
			self.queued.push(Call::Wake(SIGN_IN_WATCH, Due::SignInWatch));
		}
	}

	fn account_read(&mut self, watched: Result<Watched, HostError>) {
		let watched = watched.unwrap_or_else(|failure| {
			self.fail(settings::account::READ_FAILED, &failure);
			Watched::SignedOut { reason: None }
		});
		if let Some(notice) = self.account.read(watched) {
			self.raise(ToastType::Error, notice.title, Some(notice.description));
		}
		self.watch_sign_in();
		match self.account.email() {
			Some(_) => {
				if matches!(self.devices.read, DevicesRead::Unread | DevicesRead::Failed) {
					self.devices.read = DevicesRead::Reading;
					self.queued.push(Call::ReadDevices);
				}
			}
			None => self.devices = Devices::default(),
		}
	}

	fn account_commanded(&mut self, outcome: Result<(), HostError>, failed: Key) {
		match outcome {
			Ok(()) => self.queued.push(Call::ReadAccount),
			Err(failure) => self.fail(failed, &failure),
		}
	}

	fn device_removed(&mut self, device_id: &str, outcome: Result<(), HostError>) {
		use settings::account::devices::{confirm, removed};
		let name = self.devices.named(device_id);
		match outcome {
			Ok(()) => {
				self.devices.removed(device_id);
				let title = self.said(removed::TITLE).replace("{{device}}", &name);
				let description = self.said(removed::DESCRIPTION);
				self.raise_notice(Notice { kind: ToastType::Info, title, description });
			}
			Err(failure) => {
				eprintln!("a device was not removed: {}", failure_text(&failure));
				self.devices.refused(device_id);
				let title = self.said(confirm::FAILED).replace("{{device}}", &name);
				self.raise_notice(Notice {
					kind: ToastType::Error,
					title,
					description: String::new(),
				});
			}
		}
	}

	fn update_landed(&mut self, state: UpdateState) {
		let call = self.updater.land(state, now_ms());
		self.watch_download(call.as_ref());
		self.queued.extend(call);
	}

	fn updater_answered(&mut self, outcome: Result<UpdateState, HostError>) {
		match outcome {
			Ok(state) => self.update_landed(state),
			Err(failure) => self.fail(chat::screen::notice::FAILED, &failure),
		}
	}

	fn answered(&mut self, answer: Answer) -> Option<Follow> {
		match answer {
			Answer::Preferences(Ok(record)) => self.preferences.read(&record),
			Answer::Preferences(Err(failure)) => self.fail(chat::screen::notice::FAILED, &failure),
			Answer::Changed(outcome) => {
				let (next, failure) = self.preferences.written(outcome);
				self.queued.extend(next.map(Call::Change));
				if let Some(failure) = failure {
					self.fail(chat::screen::notice::FAILED, &failure);
				}
			}
			Answer::Replayed(outcome) => {
				if let Err(failure) = outcome {
					self.fail(chat::screen::notice::FAILED, &failure);
				}
			}
			Answer::Account(watched) => self.account_read(watched),
			Answer::SignedIn(outcome) => {
				self.account_commanded(outcome, settings::account::SIGN_IN_FAILED)
			}
			Answer::Cancelled(outcome) => {
				self.account_commanded(outcome, settings::account::CANCEL_FAILED)
			}
			Answer::SignedOut(outcome) => {
				self.account_commanded(outcome, settings::account::SIGN_OUT_FAILED)
			}
			Answer::Devices(Ok(devices)) => self.devices.read = DevicesRead::Read(devices),
			Answer::Devices(Err(failure)) => {
				self.devices.read = DevicesRead::Failed;
				self.fail(settings::account::READ_FAILED, &failure);
			}
			Answer::Removed { device_id, outcome } => self.device_removed(&device_id, outcome),
			Answer::Version(Ok(specs)) => self.version = Some(specs.app_version),
			Answer::Version(Err(failure)) => {
				eprintln!("the running version was not read: {}", failure_text(&failure))
			}
			Answer::Diagnostics(Ok(specs)) => {
				self.effects.push(Effect::Copy { text: specs_text(&specs), copied: None })
			}
			Answer::Diagnostics(Err(failure)) => {
				self.fail(settings::diagnostics::COPY_FAILED, &failure)
			}
			Answer::Revealed(Err(failure)) => {
				self.fail(settings::diagnostics::REVEAL_FAILED, &failure)
			}
			Answer::Cleared(Err(failure)) => {
				self.fail(settings::diagnostics::clear::FAILED, &failure)
			}
			Answer::Revealed(Ok(())) | Answer::Cleared(Ok(())) => {}
			Answer::Update(Ok(state)) => self.update_landed(state),
			Answer::Update(Err(failure)) => {
				eprintln!("the update state was not read: {}", failure_text(&failure))
			}
			Answer::Checked(outcome) => {
				self.updater_answered(outcome);
				if self.updater.has_check_failed() {
					self.raise(ToastType::Error, chat::screen::notice::FAILED, None);
				}
			}
			Answer::Installed(outcome) => {
				self.updater.installed();
				self.updater_answered(outcome);
			}
			Answer::Restarted(outcome) => self.updater_answered(outcome),
			Answer::Running(outcome) => {
				let running =
					outcome.map_err(|failure| self.fail(chat::screen::notice::FAILED, &failure));
				self.updater.counted(running.ok());
			}
			Answer::Spaces(Ok(spaces)) => self.spaces = spaces,
			Answer::Spaces(Err(failure)) => self.fail(chat::screen::notice::FAILED, &failure),
			Answer::Created(Ok(_)) => self.queued.push(Call::ReadSpaces),
			Answer::Created(Err(failure)) => self.fail(chat::screen::notice::FAILED, &failure),
			Answer::Searched { scope, found } => {
				let failure =
					self.search.as_mut().and_then(|search| search.searched(&scope, found));
				if let Some(failure) = failure {
					eprintln!("the search was not read: {}", failure_text(&failure));
					self.raise(
						ToastType::Error,
						copy::unavailable::TITLE,
						Some(copy::unavailable::DESCRIPTION),
					);
				}
			}
			Answer::Mission(Ok(detail)) => {
				if self.opening_mission.take().as_deref() == Some(detail.mission.id.as_str()) {
					return Some(Follow::OpenMission(detail));
				}
			}
			Answer::Mission(Err(failure)) => {
				self.opening_mission = None;
				self.fail(chat::screen::notice::FAILED, &failure);
			}
			Answer::Due(due) => self.due(due),
		}
		None
	}

	fn due(&mut self, due: Due) {
		match due {
			Due::Search(generation) => {
				let call = self.search.as_mut().and_then(|search| search.quiet(generation));
				self.queued.extend(call);
			}
			Due::Notice(raised) => {
				if self.notice.as_ref().is_some_and(|(held, _)| *held == raised) {
					self.notice = None;
				}
			}
			Due::SignInWatch => {
				self.is_watching_sign_in = false;
				if self.account.is_waiting() {
					self.queued.push(Call::ReadAccount);
				}
			}
			Due::DownloadWatch => {
				self.is_watching_download = false;
				if self.updater.is_installing() {
					self.queued.push(Call::ReadUpdate);
					self.watch_download(Some(&Call::InstallUpdate));
				}
			}
		}
	}

	fn typed(&mut self) {
		let text = &self.edit.text;
		let call = self.search.as_mut().and_then(|search| search.typed(text));
		self.queued.extend(call);
	}

	fn open_search(&mut self, space_id: String) {
		let (search, call) = Search::opened(space_id);
		self.search = Some(search);
		self.edit = TextEdit::new("");
		self.queued.extend(call);
	}

	fn close_search(&mut self) {
		self.search = None;
	}

	fn take_answers(&mut self) -> Vec<Answer> {
		self.calls.as_ref().map(Calls::answers).unwrap_or_default()
	}

	fn flush(&mut self) {
		if self.calls.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.calls = Some(Calls::new(source.clone(), waker.clone()));
		}
		let Some(calls) = self.calls.as_ref() else { return };
		for call in self.queued.drain(..) {
			calls.send(call);
		}
	}
}

fn state(app: &mut App) -> &mut State {
	&mut app.surfaces.s12_person_settings
}

fn use_ready_source(app: &mut App) -> bool {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return false };
	state(app).use_source(source);
	true
}

pub fn open_settings(app: &mut App, entry: Option<Entry>) {
	if !use_ready_source(app) {
		return;
	}
	let from = app.navigation.main_route();
	let settings = state(app);
	settings.opened(from);
	settings.entry = entry;
	settings.flush();
	app.navigation.navigate_main(Route::PersonSettings);
}

pub fn current_entry(app: &App) -> Entry {
	let settings = &app.surfaces.s12_person_settings;
	settings.entry.unwrap_or_else(|| {
		let person = app.ready().map_or(Person::Unread, |ready| ready.person.clone());
		first_entry(settings.account.watched.as_ref(), &person)
	})
}

fn leave_settings(app: &mut App, to: Option<Route>) {
	let back = state(app).left();
	app.navigation.navigate_main(to.unwrap_or(back));
}

fn can_import(app: &App) -> bool {
	app.dev_profile.as_ref().is_some_and(|profile| profile.import.is_some())
}

pub fn settings_event(app: &mut App, event: SettingsEvent) {
	match event {
		SettingsEvent::Back | SettingsEvent::Close => leave_settings(app, None),
		SettingsEvent::OpenSpace(_) => leave_settings(app, Some(Route::SpaceSettings)),
		SettingsEvent::ImportFromClaudeCode => {
			if can_import(app) {
				leave_settings(app, Some(Route::Onboarding(Step::Import)));
			}
		}
		SettingsEvent::ReplayOnboarding => {
			state(app).queued.push(Call::ReplayOnboarding);
			leave_settings(app, Some(Route::Onboarding(Step::first())));
		}
		event => state(app).settings_event(event),
	}
	let settings = state(app);
	settings.flush();
	if !settings.effects.is_empty() {
		settings.wake();
	}
}

pub fn open_search(app: &mut App) {
	let Some(space_id) = app.ready().map(|ready| ready.space.id.clone()) else { return };
	if !use_ready_source(app) {
		return;
	}
	let settings = state(app);
	settings.open_search(space_id);
	settings.flush();
}

pub fn close_search(app: &mut App) {
	state(app).close_search();
}

fn lookups_of(app: &App) -> Option<Lookups<'_>> {
	let ready = app.ready()?;
	Some(Lookups {
		agents: &ready.agents,
		conversations: &ready.conversations,
		reader: app.surfaces.s12_person_settings.preferences.shown().name,
		now: now_ms(),
	})
}

fn visible_targets(app: &App) -> Vec<(String, Target)> {
	let Some(search) = app.surfaces.s12_person_settings.search.as_ref() else { return Vec::new() };
	let Some(lookups) = lookups_of(app) else { return Vec::new() };
	let groups = if search.query().is_empty() {
		hits::resting_groups(&search.read, &search.recents, &lookups)
	} else {
		hits::found_groups(&search.read, &search.recents, search.query(), &lookups)
	};
	hits::visible(search.tab, &groups)
		.into_iter()
		.map(|row| (row.id.clone(), row.target.clone()))
		.collect()
}

fn open_row(app: &mut App, opened: &Opened) {
	let conversation_id = match opened {
		Opened::Conversation(id) => Some(id.clone()),
		Opened::Agent(bot_id) => app.ready().and_then(|ready| {
			ready
				.conversations
				.iter()
				.find(|conversation| conversation.solo_bot_id.as_deref() == Some(bot_id))
				.map(|conversation| conversation.id.clone())
		}),
	};
	let Some(conversation_id) = conversation_id else {
		eprintln!("a search result names an agent with no conversation here: the view stays");
		return;
	};
	app.navigation.navigate_main(Route::Conversations);
	app.open(&conversation_id);
}

pub fn open_target(app: &mut App, target: &Target) {
	let settings = state(app);
	settings.close_search();
	match target {
		Target::Chat { opened, landing } => {
			if let Some(landing) = landing {
				settings.landing = Some(landing.clone());
			}
			open_row(app, opened);
		}
		Target::Routine { opened } => open_row(app, opened),
		Target::Mission { mission_id, .. } => {
			settings.opening_mission = Some(mission_id.clone());
			settings.queued.push(Call::ReadMission(mission_id.clone()));
			settings.flush();
		}
	}
}

pub fn search_event(app: &mut App, event: SearchEvent) {
	match event {
		SearchEvent::TabChange(tab) => {
			if let Some(search) = state(app).search.as_mut() {
				search.set_tab(tab);
			}
		}
		SearchEvent::Open(id) => {
			let target = visible_targets(app).into_iter().find(|(held, _)| *held == id);
			if let Some((_, target)) = target {
				open_target(app, &target);
			}
		}
	}
}

fn moved(app: &mut App, by: isize) {
	let count = visible_targets(app).len();
	if let Some(search) = state(app).search.as_mut() {
		search.moved(by, count);
	}
}

fn entered(app: &mut App) {
	let Some(index) = app.surfaces.s12_person_settings.search.as_ref().map(Search::active_index)
	else {
		return;
	};
	if let Some((_, target)) = visible_targets(app).into_iter().nth(index) {
		open_target(app, &target);
	}
}

pub fn key_pressed(app: &mut App, key: &KeyEvent) -> bool {
	let is_open = app.surfaces.s12_person_settings.is_searching();
	if key.is_command('k') {
		if !is_open {
			open_search(app);
		}
		return true;
	}
	if !is_open {
		return false;
	}
	match key.key {
		Pressed::Escape => close_search(app),
		Pressed::Down => moved(app, NEXT),
		Pressed::Up => moved(app, PREVIOUS),
		Pressed::Enter => entered(app),
		_ => return false,
	}
	true
}

fn follow(app: &mut App, follow: Follow) {
	match follow {
		Follow::OpenMission(detail) => {
			let bot = app.ready().and_then(|ready| {
				ready.agents.iter().find(|agent| agent.id == detail.mission.bot_id).cloned()
			});
			let Some(bot) = bot else {
				eprintln!("a searched mission names an agent unknown here: the view stays");
				return;
			};
			app.navigation.navigate_main(Route::Conversations);
			app.open_mission(&detail.mission, &bot);
		}
	}
}

fn run(app: &mut App, effect: Effect, tx: &mut Tx) {
	match effect {
		Effect::Copy { text, copied } => {
			tx.copy(text);
			if let Some(copied) = copied {
				state(app).raise(ToastType::Info, copied, None);
			}
		}
		Effect::Open { url, refused } => {
			if let Err(failure) = tx.open_url(&url) {
				eprintln!("{url} did not open: {failure}");
				state(app).raise(ToastType::Error, refused, None);
			}
		}
	}
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let settings = state(app);
	settings.typed();
	let answers = settings.take_answers();
	let has_answers = !answers.is_empty();
	for answer in answers {
		if let Some(next) = state(app).answered(answer) {
			follow(app, next);
		}
	}
	let effects = std::mem::take(&mut state(app).effects);
	let is_changed = has_answers || !effects.is_empty();
	for effect in effects {
		run(app, effect, tx);
	}
	state(app).flush();
	is_changed
}
