mod calls;
mod catalogue;
mod installed;
mod secrets;
#[cfg(test)]
mod tests;
mod view;

use std::time::Duration;

use kiroshi_core::applications::contract::Install;
use kiroshi_core::conversations::contract::McpServer;
use kiroshi_core::environment::contract::EnvOwner;
use kiroshi_rune_kit::surfaces::s11_applications::catalogue::CatalogueEvent;
use kiroshi_rune_kit::surfaces::s11_applications::install::InstallEvent;
use kiroshi_rune_kit::surfaces::s11_applications::panel::ApplicationsEvent;
use kiroshi_rune_kit::surfaces::s11_applications::secrets::SecretsEvent;
use rune::{Key as Pressed, KeyEvent, Waker};

use crate::app::App;
use crate::host::HostError;
use crate::navigation::Route;
use crate::source::Source;

use calls::{
	Answer, Call, Calls, Concealed, Due, Found, InstallOutcome, InstallRun, refusal_kind,
	refusal_text,
};
use catalogue::{Catalogue, Landed};
use installed::{ConnectFailure, Installed};
use secrets::{Dialog, Removal, Secrets, Write};

pub use view::{layers, view};

const NOTICE_LIFETIME: Duration = Duration::from_secs(6);

const CANCELLED: &str = "cancelled";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Which {
	Agent,
	Space,
	Person,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Reading {
	Pending,
	Done,
	Failed,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Notice {
	Failed,
	CatalogueUnavailable,
	Unrefreshed,
	RolledBack { name: String, reason: String },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScopeKey {
	pub which: Which,
	pub owner: EnvOwner,
}

pub struct Scope {
	pub which: Which,
	pub owner: EnvOwner,
	pub name: String,
	installed: Installed,
	secrets: Secrets,
}

impl Scope {
	pub fn new(which: Which, owner: EnvOwner, name: String) -> Scope {
		Scope { which, owner, name, installed: Installed::default(), secrets: Secrets::default() }
	}

	fn has_key(&self, key: &ScopeKey) -> bool {
		self.which == key.which && self.owner == key.owner
	}

	pub fn key(&self) -> ScopeKey {
		ScopeKey { which: self.which, owner: self.owner.clone() }
	}

	fn reads(&self) -> [Call; 3] {
		[Call::ReadServers(self.key()), Call::ReadStatus(self.key()), Call::ReadSecrets(self.key())]
	}
}

#[derive(Default)]
pub struct State {
	scopes: Vec<Scope>,
	is_open: bool,
	catalogue: Option<Catalogue>,
	settling: Option<(ScopeKey, String)>,
	connecting: Option<(ScopeKey, String)>,
	connect_failure: Option<(ScopeKey, ConnectFailure)>,
	dialog: Option<(ScopeKey, Dialog)>,
	notice: Option<(u64, Notice)>,
	notices_raised: u64,
	spare: rune::TextEdit,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
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

	fn wake(&self) {
		if let Some(waker) = self.waker.as_ref() {
			waker();
		}
	}

	fn scope(&self, which: Which) -> Option<&Scope> {
		self.scopes.iter().find(|scope| scope.which == which)
	}

	fn key_of(&self, which: Which) -> Option<ScopeKey> {
		self.scope(which).map(Scope::key)
	}

	fn shown(&self, key: &ScopeKey) -> Option<&Scope> {
		self.scopes.iter().find(|scope| scope.has_key(key))
	}

	fn is_shown(&self, key: &ScopeKey) -> bool {
		self.shown(key).is_some()
	}

	fn shown_mut(&mut self, key: &ScopeKey) -> Option<&mut Scope> {
		self.scopes.iter_mut().find(|scope| scope.has_key(key))
	}

	fn shown_keys(&self) -> Vec<ScopeKey> {
		self.scopes.iter().map(Scope::key).collect()
	}

	fn raise(&mut self, notice: Notice) {
		self.notices_raised += 1;
		self.notice = Some((self.notices_raised, notice));
		self.queued.push(Call::Wake(NOTICE_LIFETIME, Due::Notice(self.notices_raised)));
	}

	fn fail(&mut self, what: &str, failure: &HostError) {
		eprintln!("{what}: {}", failure_text(failure));
		self.raise(Notice::Failed);
	}

	pub fn opened(&mut self, scopes: Vec<Scope>) {
		let was_open = std::mem::replace(&mut self.is_open, true);
		let keys: Vec<ScopeKey> = scopes.iter().map(Scope::key).collect();
		if self.shown_keys() != keys {
			self.settling = None;
			self.connecting = None;
			self.connect_failure = None;
		}
		let mut previous = std::mem::take(&mut self.scopes);
		for scope in scopes {
			let kept = previous.iter().position(|held| was_open && held.key() == scope.key());
			match kept {
				Some(at) => self.scopes.push(previous.swap_remove(at)),
				None => {
					self.queued.extend(scope.reads());
					self.scopes.push(scope);
				}
			}
		}
		if !was_open || self.catalogue.as_ref().is_some_and(|held| !keys.contains(&held.target)) {
			self.catalogue = None;
		}
		if !was_open || self.dialog.as_ref().is_some_and(|(key, _)| !keys.contains(key)) {
			self.dialog = None;
		}
	}

	pub fn left(&mut self) {
		self.is_open = false;
		self.catalogue = None;
		self.dialog = None;
		self.notice = None;
	}

	fn reread_installed(&mut self, key: ScopeKey) {
		self.queued.extend([Call::ReadServers(key.clone()), Call::ReadStatus(key)]);
	}

	fn connect(&mut self, which: Which, name: String) {
		let Some(scope) = self.scope(which) else { return };
		let (key, url) = (scope.key(), scope.installed.url_of(&name).unwrap_or_default());
		self.start_connecting(key.clone(), name.clone());
		self.queued.push(Call::Connect { key, name, url });
	}

	fn start_connecting(&mut self, key: ScopeKey, name: String) {
		self.connect_failure = None;
		self.connecting = Some((key, name));
	}

	fn stop_connecting(&mut self, key: &ScopeKey, name: &str) {
		if self.connecting.as_ref().is_some_and(|(held, named)| held == key && named == name) {
			self.connecting = None;
		}
	}

	pub fn cancel_connect(&mut self) {
		if self.connecting.is_some() {
			self.queued.push(Call::CancelConnect);
		}
	}

	pub fn disconnect(&mut self, which: Which, name: String) {
		let Some(scope) = self.scope(which) else { return };
		let (key, url) = (scope.key(), scope.installed.url_of(&name).unwrap_or_default());
		self.queued.push(Call::Disconnect { key, name, url });
	}

	pub fn remove(&mut self, which: Which, name: String) {
		let Some(key) = self.key_of(which) else { return };
		self.queued.push(Call::Remove { key, name });
	}

	pub fn applications_event(&mut self, which: Which, event: ApplicationsEvent) {
		match event {
			ApplicationsEvent::Connect(name) => self.connect(which, name),
			ApplicationsEvent::Add => {
				let Some(key) = self.key_of(which) else { return };
				let (catalogue, calls) = Catalogue::opened(key);
				self.catalogue = Some(catalogue);
				self.queued.extend(calls);
			}
			ApplicationsEvent::Open(_) | ApplicationsEvent::Paste => {}
		}
	}

	pub fn catalogue_event(&mut self, event: CatalogueEvent) {
		let Some(catalogue) = self.catalogue.as_mut() else { return };
		match event {
			CatalogueEvent::Back => self.catalogue = None,
			CatalogueEvent::Category(category) => {
				catalogue.leave();
				catalogue.category = category;
			}
			CatalogueEvent::Pick(name) => catalogue.pick(name),
			CatalogueEvent::Retry => {
				let calls = catalogue.retried();
				self.queued.extend(calls);
			}
		}
	}

	fn declared(&self, key: &ScopeKey) -> Vec<String> {
		let servers =
			self.shown(key).map(|scope| scope.installed.servers.as_slice()).unwrap_or_default();
		servers.iter().map(|server| server.name.clone()).collect()
	}

	fn install(&mut self) {
		let Some(catalogue) = self.catalogue.as_ref() else { return };
		let key = catalogue.target.clone();
		let Some(scope) = self.shown(&key) else { return };
		let Some(application) = catalogue.picked_application() else { return };
		if catalogue.installing.is_some() || scope.installed.declares(&application.name) {
			return;
		}
		let application = application.clone();
		let keys = catalogue.typed_keys();
		let Some(catalogue) = self.catalogue.as_mut() else { return };
		catalogue.failure = keys.as_ref().err().cloned();
		let Ok(keys) = keys else { return };
		catalogue.installing = Some(application.name.clone());
		if matches!(application.install, Install::Oauth) {
			self.start_connecting(key.clone(), application.name.clone());
		}
		self.queued.push(Call::Install(key, Box::new(InstallRun { application, keys })));
	}

	pub fn install_event(&mut self, event: InstallEvent) {
		match event {
			InstallEvent::Page(CatalogueEvent::Back) => {
				if let Some(catalogue) = self.catalogue.as_mut() {
					catalogue.leave();
				}
			}
			InstallEvent::Page(event) => self.catalogue_event(event),
			InstallEvent::Install => self.install(),
			InstallEvent::Reveal(index) => {
				if let Some(catalogue) = self.catalogue.as_mut() {
					catalogue.reveal(index);
				}
			}
		}
	}

	fn save_secret(&mut self, which: Which) {
		let Some((key, Dialog::Write(write))) = self.dialog.as_mut() else { return };
		if key.which != which {
			return;
		}
		let Some(name) = write.submitted() else { return };
		let value = Concealed(write.value.text.clone());
		let key = key.clone();
		self.queued.push(Call::SetSecret { key, name, value });
	}

	fn confirm_removal(&mut self, which: Which) {
		let Some((key, Dialog::Remove(removal))) = self.dialog.as_mut() else { return };
		if key.which != which || removal.is_removing {
			return;
		}
		removal.is_removing = true;
		removal.has_failed = false;
		let (key, name) = (key.clone(), removal.name.clone());
		self.queued.push(Call::DeleteSecret { key, name });
	}

	fn is_dialog_busy(&self) -> bool {
		match self.dialog.as_ref() {
			Some((_, Dialog::Write(write))) => write.is_writing,
			Some((_, Dialog::Remove(removal))) => removal.is_removing,
			None => false,
		}
	}

	fn close_dialog(&mut self) {
		if !self.is_dialog_busy() {
			self.dialog = None;
		}
	}

	fn open_dialog(&mut self, which: Which, dialog: Dialog) {
		if let Some(key) = self.key_of(which) {
			self.dialog = Some((key, dialog));
		}
	}

	pub fn secrets_event(&mut self, which: Which, event: SecretsEvent) {
		match event {
			SecretsEvent::Add => self.open_dialog(which, Dialog::Write(Box::new(Write::new(None)))),
			SecretsEvent::Replace(name) => {
				self.open_dialog(which, Dialog::Write(Box::new(Write::new(Some(name)))));
			}
			SecretsEvent::Remove(name) => {
				let removal = Removal { name, has_failed: false, is_removing: false };
				self.open_dialog(which, Dialog::Remove(removal));
			}
			SecretsEvent::Save => self.save_secret(which),
			SecretsEvent::ConfirmRemove => self.confirm_removal(which),
			SecretsEvent::CloseWrite | SecretsEvent::CancelRemove => self.close_dialog(),
		}
	}

	pub fn escape(&mut self) -> bool {
		if self.dialog.is_some() {
			self.close_dialog();
			return true;
		}
		if self.connecting.is_some() {
			self.cancel_connect();
			return true;
		}
		let Some(catalogue) = self.catalogue.as_mut() else { return false };
		if catalogue.picked.is_some() {
			catalogue.leave();
		} else {
			self.catalogue = None;
		}
		true
	}

	fn typed(&mut self) {
		let call = self.catalogue.as_mut().and_then(Catalogue::typed);
		self.queued.extend(call);
	}

	fn searched(&mut self, generation: u64, found: Result<Found, HostError>) {
		let landed =
			self.catalogue.as_mut().and_then(|catalogue| catalogue.searched(generation, found));
		match landed {
			None | Some(Landed::Fresh) => {}
			Some(Landed::Unrefreshed(failure)) => {
				if let Some(failure) = failure {
					eprintln!(
						"the application directory was not refreshed: {}",
						failure_text(&failure)
					);
				}
				self.raise(Notice::Unrefreshed);
			}
			Some(Landed::Failed(failure)) => {
				eprintln!("the application directory was not read: {}", failure_text(&failure));
			}
		}
	}

	fn installed(&mut self, key: ScopeKey, name: String, outcome: InstallOutcome) {
		if !self.is_shown(&key) {
			return;
		}
		self.stop_connecting(&key, &name);
		let title = self
			.catalogue
			.as_ref()
			.and_then(|catalogue| catalogue.picked_application())
			.filter(|application| application.name == name)
			.map_or_else(|| name.clone(), |application| application.title.clone());
		if let Some(reason) = outcome.rollback_refusal {
			self.raise(Notice::RolledBack { name: title, reason });
		}
		match outcome.refusal {
			Some(refusal) => {
				eprintln!("{name} was not installed: {refusal:?}");
				if let Some(catalogue) = self.catalogue.as_mut() {
					catalogue.installing = None;
					catalogue.failure = Some(refusal);
				}
				self.reread_installed(key);
			}
			None => {
				self.settling = Some((key.clone(), name));
				self.reread_installed(key);
			}
		}
	}

	fn servers_read(&mut self, key: ScopeKey, read: Result<Vec<McpServer>, HostError>) {
		if !self.is_shown(&key) {
			return;
		}
		if self.settling.as_ref().is_some_and(|(held, _)| *held == key) {
			self.settling = None;
			if let Some(catalogue) = self.catalogue.as_mut() {
				catalogue.installing = None;
			}
		}
		let Some(scope) = self.shown_mut(&key) else { return };
		match read {
			Ok(servers) => {
				scope.installed.servers = servers;
				scope.installed.read = Reading::Done;
			}
			Err(failure) => {
				scope.installed.read = Reading::Failed;
				eprintln!("the applications of a scope were not read: {}", failure_text(&failure));
			}
		}
	}

	fn connected(&mut self, key: ScopeKey, name: String, outcome: Result<(), HostError>) {
		if !self.is_shown(&key) {
			return;
		}
		self.stop_connecting(&key, &name);
		if let Err(failure) = outcome {
			let kind = refusal_kind(&failure);
			if kind.as_deref() != Some(CANCELLED) {
				eprintln!("{name} was not connected: {}", failure_text(&failure));
				let detail = refusal_text(&failure);
				let failure = ConnectFailure { name, kind, detail };
				self.connect_failure = Some((key.clone(), failure));
			}
		}
		self.reread_installed(key);
	}

	fn answered(&mut self, answer: Answer) {
		match answer {
			Answer::Servers(key, read) => self.servers_read(key, read),
			Answer::Status(key, Ok(rows)) => {
				if let Some(scope) = self.shown_mut(&key) {
					scope.installed.status = rows;
				}
			}
			Answer::Status(_, Err(failure)) => {
				eprintln!("the connection states were not read: {}", failure_text(&failure));
			}
			Answer::Secrets(key, read) => {
				let Some(scope) = self.shown_mut(&key) else { return };
				match read {
					Ok(entries) => {
						scope.secrets.entries = entries;
						scope.secrets.read = Reading::Done;
					}
					Err(failure) => {
						scope.secrets.read = Reading::Failed;
						eprintln!(
							"the secrets of a scope were not read: {}",
							failure_text(&failure)
						);
					}
				}
			}
			Answer::Catalogue(read) => {
				let failure =
					self.catalogue.as_mut().and_then(|catalogue| catalogue.catalogue_read(read));
				if let Some(failure) = failure {
					eprintln!("the application catalogue was not read: {}", failure_text(&failure));
					self.raise(Notice::CatalogueUnavailable);
				}
			}
			Answer::Searched { generation, found } => self.searched(generation, found),
			Answer::Installed { key, name, outcome } => self.installed(key, name, outcome),
			Answer::Connected { key, name, outcome } => self.connected(key, name, outcome),
			Answer::Cancelled(Ok(())) => {}
			Answer::Cancelled(Err(failure)) => {
				self.fail("the connection was not cancelled", &failure)
			}
			Answer::Disconnected { key, name, outcome } => {
				self.settled(key, outcome, &format!("{name} was not disconnected"))
			}
			Answer::Removed { key, name, outcome } => {
				self.settled(key, outcome, &format!("{name} was not removed"))
			}
			Answer::SecretSet { key, outcome } => self.secret_written(key, outcome),
			Answer::SecretDeleted { key, outcome } => self.secret_deleted(key, outcome),
			Answer::Due(Due::Notice(raised)) => {
				if self.notice.as_ref().is_some_and(|(held, _)| *held == raised) {
					self.notice = None;
				}
			}
		}
	}

	fn settled(&mut self, key: ScopeKey, outcome: Result<(), HostError>, what: &str) {
		if !self.is_shown(&key) {
			return;
		}
		if let Err(failure) = outcome {
			self.fail(what, &failure);
		}
		self.reread_installed(key);
	}

	fn secret_written(&mut self, key: ScopeKey, outcome: Result<(), HostError>) {
		if !self.is_shown(&key) {
			return;
		}
		if let Some((held, Dialog::Write(write))) = self.dialog.as_mut()
			&& *held == key
		{
			write.is_writing = false;
			match &outcome {
				Ok(()) => self.dialog = None,
				Err(_) => write.has_failed = true,
			}
		}
		if let Err(failure) = outcome {
			eprintln!("a secret was not written: {}", failure_text(&failure));
		}
		self.queued.push(Call::ReadSecrets(key));
	}

	fn secret_deleted(&mut self, key: ScopeKey, outcome: Result<(), HostError>) {
		if !self.is_shown(&key) {
			return;
		}
		if let Some((held, Dialog::Remove(removal))) = self.dialog.as_mut()
			&& *held == key
		{
			removal.is_removing = false;
			match &outcome {
				Ok(()) => self.dialog = None,
				Err(_) => removal.has_failed = true,
			}
		}
		if let Err(failure) = outcome {
			eprintln!("a secret was not removed: {}", failure_text(&failure));
		}
		self.queued.push(Call::ReadSecrets(key));
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
	&mut app.surfaces.s11_applications
}

fn agent_of(app: &App) -> Option<(String, String)> {
	let seat = app.thread.as_ref().and_then(|thread| thread.seats.first());
	if let Some(seat) = seat {
		return Some((seat.bot_id.clone(), seat.name.clone()));
	}
	let agent = app.ready()?.agents.first()?;
	Some((agent.id.clone(), agent.name.clone()))
}

fn scopes_of(app: &App) -> Option<Vec<Scope>> {
	let ready = app.ready()?;
	let space = &ready.space;
	let mut scopes = Vec::new();
	if let Some((id, name)) = agent_of(app) {
		let owner = EnvOwner::Bot { id, space_id: space.id.clone() };
		scopes.push(Scope::new(Which::Agent, owner, name));
	}
	scopes.push(Scope::new(
		Which::Space,
		EnvOwner::Space { id: space.id.clone() },
		space.name.clone(),
	));
	scopes.push(Scope::new(Which::Person, EnvOwner::User, String::new()));
	Some(scopes)
}

fn open_when_moved(app: &mut App) -> bool {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return false };
	let Some(scopes) = scopes_of(app) else { return false };
	let applications = state(app);
	let keys: Vec<ScopeKey> = scopes.iter().map(Scope::key).collect();
	if applications.is_open && applications.shown_keys() == keys {
		return false;
	}
	applications.use_source(source);
	applications.opened(scopes);
	true
}

pub fn poll(app: &mut App) -> bool {
	let is_shown = app.navigation.main_route() == Route::Applications;
	let has_opened = is_shown && open_when_moved(app);
	let applications = state(app);
	if !is_shown && applications.is_open {
		applications.left();
	}
	applications.typed();
	let answers = applications.take_answers();
	let has_answers = !answers.is_empty();
	for answer in answers {
		applications.answered(answer);
	}
	applications.flush();
	has_opened || has_answers
}

pub fn key_pressed(app: &mut App, key: &KeyEvent) -> bool {
	if app.navigation.main_route() != Route::Applications || !matches!(key.key, Pressed::Escape) {
		return false;
	}
	let applications = state(app);
	let is_handled = applications.escape();
	applications.flush();
	is_handled
}
