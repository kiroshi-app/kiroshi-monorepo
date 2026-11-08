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
use kiroshi_core::environment::contract::{EnvOwner, EnvScope};
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

	fn env_scope(&self) -> EnvScope {
		match &self.owner {
			EnvOwner::User => EnvScope::User,
			EnvOwner::Space { id } => EnvScope::Space { id: id.clone() },
			EnvOwner::Bot { id, space_id } => {
				EnvScope::Bot { id: id.clone(), space_id: space_id.clone() }
			}
		}
	}

	fn reads(&self) -> [Call; 3] {
		[
			Call::ReadServers(self.which, self.owner.clone()),
			Call::ReadStatus(self.which, self.owner.clone()),
			Call::ReadSecrets(self.which, self.env_scope()),
		]
	}
}

#[derive(Default)]
pub struct State {
	scopes: Vec<Scope>,
	opened_for: Option<String>,
	catalogue: Option<Catalogue>,
	settling: Option<(Which, String)>,
	connecting: Option<(Which, String)>,
	connect_failure: Option<(Which, ConnectFailure)>,
	dialog: Option<(Which, Dialog)>,
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

	fn scope_mut(&mut self, which: Which) -> Option<&mut Scope> {
		self.scopes.iter_mut().find(|scope| scope.which == which)
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

	pub fn opened(&mut self, space_id: String, scopes: Vec<Scope>) {
		self.opened_for = Some(space_id);
		self.catalogue = None;
		self.dialog = None;
		self.queued.extend(scopes.iter().flat_map(Scope::reads));
		self.scopes = scopes;
	}

	pub fn left(&mut self) {
		self.opened_for = None;
		self.catalogue = None;
		self.dialog = None;
		self.notice = None;
	}

	fn reread_installed(&mut self, which: Which) {
		if let Some(scope) = self.scope(which) {
			let owner = scope.owner.clone();
			self.queued
				.extend([Call::ReadServers(which, owner.clone()), Call::ReadStatus(which, owner)]);
		}
	}

	fn reread_secrets(&mut self, which: Which) {
		if let Some(scope) = self.scope(which) {
			self.queued.push(Call::ReadSecrets(which, scope.env_scope()));
		}
	}

	fn connect(&mut self, which: Which, name: String) {
		let Some(scope) = self.scope(which) else { return };
		let (owner, url) = (scope.owner.clone(), scope.installed.url_of(&name).unwrap_or_default());
		self.start_connecting(which, name.clone());
		self.queued.push(Call::Connect { which, owner, name, url });
	}

	fn start_connecting(&mut self, which: Which, name: String) {
		self.connect_failure = None;
		self.connecting = Some((which, name));
	}

	fn stop_connecting(&mut self, which: Which, name: &str) {
		if self.connecting.as_ref().is_some_and(|(held, named)| *held == which && named == name) {
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
		let (owner, url) = (scope.owner.clone(), scope.installed.url_of(&name).unwrap_or_default());
		self.queued.push(Call::Disconnect { which, owner, name, url });
	}

	pub fn remove(&mut self, which: Which, name: String) {
		let Some(scope) = self.scope(which) else { return };
		let owner = scope.owner.clone();
		self.queued.push(Call::Remove { which, owner, name });
	}

	pub fn applications_event(&mut self, which: Which, event: ApplicationsEvent) {
		match event {
			ApplicationsEvent::Connect(name) => self.connect(which, name),
			ApplicationsEvent::Add => {
				let (catalogue, calls) = Catalogue::opened(which);
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

	fn declared(&self, which: Which) -> Vec<String> {
		let servers =
			self.scope(which).map(|scope| scope.installed.servers.as_slice()).unwrap_or_default();
		servers.iter().map(|server| server.name.clone()).collect()
	}

	fn install(&mut self) {
		let Some(catalogue) = self.catalogue.as_ref() else { return };
		let which = catalogue.which;
		let Some(scope) = self.scope(which) else { return };
		let Some(application) = catalogue.picked_application() else { return };
		if catalogue.installing.is_some() || scope.installed.declares(&application.name) {
			return;
		}
		let (owner, application) = (scope.owner.clone(), application.clone());
		let keys = catalogue.typed_keys();
		let Some(catalogue) = self.catalogue.as_mut() else { return };
		catalogue.failure = keys.as_ref().err().cloned();
		let Ok(keys) = keys else { return };
		catalogue.installing = Some(application.name.clone());
		if matches!(application.install, Install::Oauth) {
			self.start_connecting(which, application.name.clone());
		}
		self.queued.push(Call::Install(which, Box::new(InstallRun { owner, application, keys })));
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
		let Some(scope) = self.scope(which).map(Scope::env_scope) else { return };
		let Some((held, Dialog::Write(write))) = self.dialog.as_mut() else { return };
		if *held != which {
			return;
		}
		let Some(name) = write.submitted() else { return };
		let value = Concealed(write.value.text.clone());
		self.queued.push(Call::SetSecret { which, scope, name, value });
	}

	fn confirm_removal(&mut self, which: Which) {
		let Some(scope) = self.scope(which).map(Scope::env_scope) else { return };
		let Some((held, Dialog::Remove(removal))) = self.dialog.as_mut() else { return };
		if *held != which || removal.is_removing {
			return;
		}
		removal.is_removing = true;
		removal.has_failed = false;
		let name = removal.name.clone();
		self.queued.push(Call::DeleteSecret { which, scope, name });
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

	pub fn secrets_event(&mut self, which: Which, event: SecretsEvent) {
		match event {
			SecretsEvent::Add => {
				self.dialog = Some((which, Dialog::Write(Box::new(Write::new(None)))))
			}
			SecretsEvent::Replace(name) => {
				self.dialog = Some((which, Dialog::Write(Box::new(Write::new(Some(name))))));
			}
			SecretsEvent::Remove(name) => {
				let removal = Removal { name, has_failed: false, is_removing: false };
				self.dialog = Some((which, Dialog::Remove(removal)));
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

	fn installed(&mut self, which: Which, name: String, outcome: InstallOutcome) {
		self.stop_connecting(which, &name);
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
				self.reread_installed(which);
			}
			None => {
				self.settling = Some((which, name));
				self.reread_installed(which);
			}
		}
	}

	fn servers_read(&mut self, which: Which, read: Result<Vec<McpServer>, HostError>) {
		if self.settling.as_ref().is_some_and(|(held, _)| *held == which) {
			self.settling = None;
			if let Some(catalogue) = self.catalogue.as_mut() {
				catalogue.installing = None;
			}
		}
		let Some(scope) = self.scope_mut(which) else { return };
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

	fn connected(&mut self, which: Which, name: String, outcome: Result<(), HostError>) {
		self.stop_connecting(which, &name);
		if let Err(failure) = outcome {
			let kind = refusal_kind(&failure);
			if kind.as_deref() != Some(CANCELLED) {
				eprintln!("{name} was not connected: {}", failure_text(&failure));
				let detail = refusal_text(&failure);
				self.connect_failure = Some((which, ConnectFailure { name, kind, detail }));
			}
		}
		self.reread_installed(which);
	}

	fn answered(&mut self, answer: Answer) {
		match answer {
			Answer::Servers(which, read) => self.servers_read(which, read),
			Answer::Status(which, Ok(rows)) => {
				if let Some(scope) = self.scope_mut(which) {
					scope.installed.status = rows;
				}
			}
			Answer::Status(_, Err(failure)) => {
				eprintln!("the connection states were not read: {}", failure_text(&failure));
			}
			Answer::Secrets(which, read) => {
				let Some(scope) = self.scope_mut(which) else { return };
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
			Answer::Installed { which, name, outcome } => self.installed(which, name, outcome),
			Answer::Connected { which, name, outcome } => self.connected(which, name, outcome),
			Answer::Cancelled(Ok(())) => {}
			Answer::Cancelled(Err(failure)) => {
				self.fail("the connection was not cancelled", &failure)
			}
			Answer::Disconnected { which, name, outcome } => {
				if let Err(failure) = outcome {
					self.fail(&format!("{name} was not disconnected"), &failure);
				}
				self.reread_installed(which);
			}
			Answer::Removed { which, name, outcome } => {
				if let Err(failure) = outcome {
					self.fail(&format!("{name} was not removed"), &failure);
				}
				self.reread_installed(which);
			}
			Answer::SecretSet { which, outcome } => self.secret_written(which, outcome),
			Answer::SecretDeleted { which, outcome } => self.secret_deleted(which, outcome),
			Answer::Due(Due::Notice(raised)) => {
				if self.notice.as_ref().is_some_and(|(held, _)| *held == raised) {
					self.notice = None;
				}
			}
		}
	}

	fn secret_written(&mut self, which: Which, outcome: Result<(), HostError>) {
		if let Some((held, Dialog::Write(write))) = self.dialog.as_mut()
			&& *held == which
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
		self.reread_secrets(which);
	}

	fn secret_deleted(&mut self, which: Which, outcome: Result<(), HostError>) {
		if let Some((held, Dialog::Remove(removal))) = self.dialog.as_mut()
			&& *held == which
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
		self.reread_secrets(which);
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

fn scopes_of(app: &App) -> Option<(String, Vec<Scope>)> {
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
	Some((space.id.clone(), scopes))
}

fn open_when_moved(app: &mut App) -> bool {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return false };
	let Some((space_id, scopes)) = scopes_of(app) else { return false };
	let applications = state(app);
	if applications.opened_for.as_deref() == Some(space_id.as_str()) {
		return false;
	}
	applications.use_source(source);
	applications.opened(space_id, scopes);
	true
}

pub fn poll(app: &mut App) -> bool {
	let is_shown = app.navigation.main_route() == Route::Applications;
	let has_opened = is_shown && open_when_moved(app);
	let applications = state(app);
	if !is_shown && applications.opened_for.is_some() {
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
