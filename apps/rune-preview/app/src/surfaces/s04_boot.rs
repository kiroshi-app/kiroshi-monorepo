mod calls;
mod connect;
mod import;
#[cfg(test)]
mod tests;
mod view;

use std::time::Duration;

use kiroshi_core::user::contract::{OnboardingStep, UserPreferences};
use rune::{Tx, Waker};

use kiroshi_rune_kit::strings::{Key, Language, chat, common, settings};
use kiroshi_rune_kit::surfaces::s04_boot::account::AccountEvent;
use kiroshi_rune_kit::surfaces::s04_boot::connect::ConnectEvent;
use kiroshi_rune_kit::surfaces::s04_boot::import::ImportEvent;
use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeEvent, NoticeKind};
use kiroshi_rune_kit::surfaces::s04_boot::say;
use kiroshi_rune_kit::surfaces::s04_boot::welcome::{WelcomeEvent, WelcomeStep};

use crate::app::notice::Notice;
use crate::app::{App, Ready, Workspace};
use crate::host::HostError;
use crate::model::ClaudeInventory;
use crate::navigation::Route;
use crate::source::Source;

use calls::{Answer, Call, Calls, Due, ImportOutcome, Inventoried, KiroshiAccount};
use connect::{Next, SignIn, detail_of};
use import::{Pressed, Session, offers_import};

pub use view::view;

const DOWNLOAD_PAGE_URL: &str = "https://kiroshi.app";

const ACCOUNT_WATCH: Duration = Duration::from_secs(2);

const UNSENT: Key = chat::screen::notice::FAILED;

const LANGUAGE: Language = Language::En;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Step {
	Boot,
	Welcome(WelcomeStep),
	Connect,
	Import,
	Account,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Retry(Call);

impl Retry {
	pub fn run(self, app: &mut App) {
		state(app).queued.push(self.0);
		sent(app);
	}
}

impl Step {
	pub fn first() -> Step {
		Step::Welcome(WelcomeStep::Agents)
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Effect {
	Open(String),
	Copy(String),
}

#[derive(Default)]
pub struct State {
	preferences: Option<UserPreferences>,
	boot_failure: Option<HostError>,
	sign_in: SignIn,
	settling: Option<connect::Connection>,
	import: Session,
	account: Option<KiroshiAccount>,
	is_watching_account: bool,
	to_raise: Vec<Notice>,
	effects: Vec<Effect>,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

enum Follow {
	Go(Step),
	Land,
	Landed { call: Call, landing: Result<(String, Box<Ready>), HostError> },
}

fn welcome_neighbour(page: WelcomeStep, by: isize) -> Option<WelcomeStep> {
	let at = WelcomeStep::ALL.iter().position(|held| *held == page)?;
	WelcomeStep::ALL.get(at.checked_add_signed(by)?).copied()
}

fn step_of(stored: OnboardingStep) -> Option<Step> {
	match stored {
		OnboardingStep::Welcome => Some(Step::first()),
		OnboardingStep::Connect => Some(Step::Connect),
		OnboardingStep::Import => Some(Step::Import),
		OnboardingStep::Account => Some(Step::Account),
		OnboardingStep::Done => None,
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
		self.flush();
	}

	fn said(&self, key: Key) -> String {
		key.text(LANGUAGE).to_owned()
	}

	fn fail(&mut self, title: Key, failure: &HostError, retry: Option<Call>) {
		self.fail_with(self.said(title), detail_of(failure), retry);
	}

	fn fail_with(&mut self, title: String, detail: String, retry: Option<Call>) {
		eprintln!("{title}: {detail}");
		let retry = retry.map(Retry);
		self.to_raise.push(Notice { retry, ..Notice::failure(title, detail) });
	}

	fn tell(&mut self, kind: NoticeKind, title: Key) {
		self.to_raise.push(Notice { kind, ..Notice::error(self.said(title)) });
	}

	fn store(&mut self, step: OnboardingStep) {
		self.queued.push(Call::StoreStep(step));
	}

	fn followed(&mut self, next: Vec<Next>) {
		for next in next {
			match next {
				Next::Call(call) => self.queued.push(call),
				Next::Open(url) => self.effects.push(Effect::Open(url)),
				Next::Settle => self.settle(),
				Next::Failed { title, detail } => self.fail_with(self.said(title), detail, None),
			}
		}
	}

	fn settle(&mut self) {
		self.settling = self.sign_in.connection.take();
		self.queued.push(Call::ReadInventory(Inventoried::ToSettle));
	}

	fn settled(&mut self, inventory: Result<ClaudeInventory, HostError>) {
		let offers = match inventory {
			Ok(inventory) => {
				let offers = offers_import(&inventory);
				self.import.read(Some(inventory));
				offers
			}
			Err(failure) => {
				self.fail(common::claude_import::unreadable::TITLE, &failure, None);
				false
			}
		};
		self.store(if offers { OnboardingStep::Import } else { OnboardingStep::Account });
	}

	fn entered(&mut self, step: Step) {
		match step {
			Step::Connect if !self.sign_in.has_entered() => {
				let next = self.sign_in.read_account();
				self.followed(next);
			}
			Step::Import if matches!(self.import.inventory, import::Inventory::Reading) => {
				self.queued.push(Call::ReadInventory(Inventoried::ToShow));
			}
			Step::Account => self.queued.push(Call::ReadKiroshiAccount),
			Step::Boot | Step::Welcome(_) | Step::Connect | Step::Import => {}
		}
	}

	fn stored(
		&mut self,
		step: OnboardingStep,
		outcome: Result<UserPreferences, HostError>,
	) -> Option<Follow> {
		let restored = self.settling.take();
		match outcome {
			Ok(preferences) => {
				self.preferences = Some(preferences);
				Some(step_of(step).map_or(Follow::Land, Follow::Go))
			}
			Err(failure) => {
				if restored.is_some() {
					self.sign_in.connection = restored;
				}
				self.fail(UNSENT, &failure, Some(Call::StoreStep(step)));
				None
			}
		}
	}

	fn read_preferences(&mut self, outcome: Result<UserPreferences, HostError>) -> Option<Follow> {
		match outcome {
			Ok(preferences) => {
				let stored = preferences.onboarding_step;
				self.preferences = Some(preferences);
				self.boot_failure = None;
				Some(step_of(stored).map_or(Follow::Land, Follow::Go))
			}
			Err(failure) => {
				eprintln!("the onboarding step was not read: {}", detail_of(&failure));
				self.boot_failure = Some(failure);
				None
			}
		}
	}

	fn account_read(&mut self, outcome: Result<KiroshiAccount, HostError>) {
		match outcome {
			Ok(account) => {
				self.account = Some(account);
				self.watch_account();
			}
			Err(failure) => {
				self.fail(settings::account::READ_FAILED, &failure, Some(Call::ReadKiroshiAccount))
			}
		}
	}

	fn watch_account(&mut self) {
		let is_waiting = matches!(self.account, Some(KiroshiAccount::Waiting { .. }));
		if is_waiting && !self.is_watching_account {
			self.is_watching_account = true;
			self.queued.push(Call::Wake(ACCOUNT_WATCH, Due::AccountWatch));
		}
	}

	fn imported(&mut self, outcome: Result<Vec<ImportOutcome>, HostError>) {
		match outcome {
			Ok(outcomes) => self.import.imported(Some(outcomes)),
			Err(failure) => {
				self.import.imported(None);
				self.fail(UNSENT, &failure, None);
			}
		}
	}

	fn refused(&mut self, url: &str, detail: String) {
		if self.sign_in.sign_in_url() == Some(url) {
			let next = self.sign_in.link_refused(detail);
			return self.followed(next);
		}
		self.fail_with(self.said(UNSENT), detail, None);
	}

	fn due(&mut self, due: Due) {
		match due {
			Due::AccountWatch => {
				self.is_watching_account = false;
				if matches!(self.account, Some(KiroshiAccount::Waiting { .. })) {
					self.queued.push(Call::ReadKiroshiAccount);
				}
			}
		}
	}

	fn answered(&mut self, answer: Answer) -> Option<Follow> {
		match answer {
			Answer::Preferences(outcome) => return self.read_preferences(outcome),
			Answer::Stored { step, outcome } => return self.stored(step, outcome),
			Answer::ClaudeAccount(report) => {
				let next = self.sign_in.account_read(report);
				self.followed(next);
			}
			Answer::SignInStarted(url) => {
				let next = self.sign_in.sign_in_started(url);
				self.followed(next);
			}
			Answer::SignedIn { attempt, outcome } => {
				let next = self.sign_in.signed_in(attempt, outcome);
				self.followed(next);
			}
			Answer::CodeEntered(outcome) => {
				let next = self.sign_in.code_entered(outcome);
				self.followed(next);
			}
			Answer::Cancelled(outcome) => {
				let next = self.sign_in.cancelled(outcome);
				self.followed(next);
			}
			Answer::KeyHeld(outcome) => {
				let next = self.sign_in.key_held(outcome);
				self.followed(next);
			}
			Answer::Inventory { purpose: Inventoried::ToSettle, inventory } => {
				self.settled(inventory)
			}
			Answer::Inventory { purpose: Inventoried::ToShow, inventory } => {
				if let Err(failure) = &inventory {
					let retry = Some(Call::ReadInventory(Inventoried::ToShow));
					self.fail(common::claude_import::unreadable::TITLE, failure, retry);
				}
				self.import.read(inventory.ok());
			}
			Answer::Imported(outcome) => self.imported(outcome),
			Answer::ImportSeen(Ok(preferences)) => self.preferences = Some(preferences),
			Answer::ImportSeen(Err(failure)) => {
				self.fail(UNSENT, &failure, Some(Call::MarkImportSeen))
			}
			Answer::KiroshiAccount(outcome) => self.account_read(outcome),
			Answer::KiroshiCommanded { call, outcome } => match outcome {
				Ok(()) => self.queued.push(Call::ReadKiroshiAccount),
				Err(failure) => {
					let title = match call {
						Call::KiroshiCancel => settings::account::CANCEL_FAILED,
						_ => settings::account::SIGN_IN_FAILED,
					};
					self.fail(title, &failure, Some(call));
				}
			},
			Answer::Landed { call, landing } => {
				let landing =
					landing.map(|(conversation_id, ready)| (conversation_id, Box::new(ready)));
				return Some(Follow::Landed { call, landing });
			}
			Answer::Due(due) => self.due(due),
		}
		None
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
	&mut app.surfaces.s04_boot
}

fn is_booting(app: &App) -> bool {
	app.navigation.main_route() == Route::Onboarding(Step::Boot)
}

pub fn is_animating(app: &App) -> bool {
	is_booting(app) && boot_failure(app).is_none()
}

pub fn booted(app: &mut App) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	let booting = is_booting(app);
	let onboarding = state(app);
	onboarding.use_source(source);
	if booting {
		onboarding.queued.push(Call::ReadPreferences);
		onboarding.flush();
	}
}

fn go(app: &mut App, step: Step) {
	app.navigation.navigate_main(Route::Onboarding(step));
	let onboarding = state(app);
	onboarding.entered(step);
	onboarding.flush();
}

fn landing_agent(app: &App) -> Option<(String, String)> {
	let ready = app.ready()?;
	let preferences = app.surfaces.s04_boot.preferences.as_ref();
	let preferred = preferences.and_then(|held| {
		held.onboarding_first_companion_id.clone().or_else(|| held.onboarding_shoto_id.clone())
	});
	let bot_id = preferred.or_else(|| ready.agents.first().map(|agent| agent.id.clone()))?;
	Some((bot_id, ready.space.id.clone()))
}

fn land(app: &mut App) {
	if is_booting(app) {
		app.navigation.navigate_main(Route::Conversations);
		return;
	}
	let Some((bot_id, space_id)) = landing_agent(app) else {
		let onboarding = state(app);
		let title = onboarding.said(chat::onboarding::arrival::FIRST_COMPANION_MISSING);
		let detail = onboarding.said(chat::onboarding::arrival::UNKNOWN_COMPANION);
		onboarding.fail_with(title, detail, None);
		return;
	};
	let onboarding = state(app);
	onboarding.queued.push(Call::Land { bot_id, space_id });
	onboarding.flush();
}

fn follow(app: &mut App, follow: Follow) {
	match follow {
		Follow::Go(step) => go(app, step),
		Follow::Land => land(app),
		Follow::Landed { landing: Ok((conversation_id, ready)), .. } => {
			app.workspace = Workspace::Ready(*ready);
			app.navigation.navigate_main(Route::Conversations);
			app.open(&conversation_id);
		}
		Follow::Landed { call, landing: Err(failure) } => arrival_failed(app, call, &failure),
	}
}

fn arrival_failed(app: &mut App, call: Call, failure: &HostError) {
	let name = match &call {
		Call::Land { bot_id, .. } => app.agent_name(bot_id),
		_ => None,
	};
	let onboarding = state(app);
	let title = match name {
		Some(name) => say(chat::onboarding::arrival::FAILURE, LANGUAGE, &[("name", &name)]),
		None => onboarding.said(UNSENT),
	};
	onboarding.fail_with(title, detail_of(failure), Some(call));
}

fn run(onboarding: &mut State, effect: Effect, tx: &mut Tx) {
	match effect {
		Effect::Open(url) => {
			if let Err(failure) = tx.open_url(&url) {
				onboarding.refused(&url, failure.to_string());
			}
		}
		Effect::Copy(link) => {
			tx.copy(link);
			onboarding.tell(NoticeKind::Info, settings::account::SIGN_IN_LINK_COPIED);
		}
	}
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let answers = state(app).take_answers();
	let has_answers = !answers.is_empty();
	for answer in answers {
		if let Some(next) = state(app).answered(answer) {
			follow(app, next);
		}
	}
	let onboarding = state(app);
	let effects = std::mem::take(&mut onboarding.effects);
	let is_changed = has_answers || !effects.is_empty();
	for effect in effects {
		run(onboarding, effect, tx);
	}
	onboarding.flush();
	raise_queued(app);
	is_changed
}

fn raise_queued(app: &mut App) {
	let to_raise = std::mem::take(&mut state(app).to_raise);
	app.raise_all(to_raise);
}

fn sent(app: &mut App) {
	raise_queued(app);
	let onboarding = state(app);
	onboarding.flush();
	if let (false, Some(waker)) = (onboarding.effects.is_empty(), onboarding.waker.as_ref()) {
		waker();
	}
}

pub fn boot_retried(app: &mut App, _: NoticeEvent) {
	if app.ready().is_none() {
		app.connect();
		return;
	}
	let onboarding = state(app);
	onboarding.boot_failure = None;
	onboarding.queued.push(Call::ReadPreferences);
	sent(app);
}

pub fn welcome_event(app: &mut App, event: WelcomeEvent) {
	let Route::Onboarding(Step::Welcome(page)) = app.navigation.main_route() else { return };
	let by = match event {
		WelcomeEvent::Back => -1,
		WelcomeEvent::Next => 1,
		WelcomeEvent::Skip => {
			state(app).store(OnboardingStep::Connect);
			return sent(app);
		}
	};
	match welcome_neighbour(page, by) {
		Some(neighbour) => {
			app.navigation.navigate_main(Route::Onboarding(Step::Welcome(neighbour)))
		}
		None if by > 0 => {
			state(app).store(OnboardingStep::Connect);
			sent(app);
		}
		None => {}
	}
}

pub fn connect_event(app: &mut App, event: ConnectEvent) {
	let onboarding = state(app);
	let sign_in = &mut onboarding.sign_in;
	let next = match event {
		ConnectEvent::UseAccount => vec![Next::Settle],
		ConnectEvent::UseAnotherAccount => {
			sign_in.change_account();
			Vec::new()
		}
		ConnectEvent::Pick(method) => {
			sign_in.pick(method);
			Vec::new()
		}
		ConnectEvent::SignIn | ConnectEvent::ReopenSignIn => sign_in.sign_in(),
		ConnectEvent::PasteKey => sign_in.paste_key(),
		ConnectEvent::SubmitCode => sign_in.submit_code(),
		ConnectEvent::SubmitKey => sign_in.submit_key(),
		ConnectEvent::TryAnotherKey => {
			sign_in.try_another_key();
			Vec::new()
		}
		ConnectEvent::DownloadAgain => vec![Next::Open(DOWNLOAD_PAGE_URL.to_owned())],
	};
	onboarding.followed(next);
	sent(app);
}

pub fn import_event(app: &mut App, event: ImportEvent) {
	let space_id = app.ready().map(|ready| ready.space.id.clone());
	let onboarding = state(app);
	match onboarding.import.event(event) {
		Some(Pressed::Import(keys)) => match space_id {
			Some(space_id) => onboarding.queued.push(Call::RunImport { keys, space_id }),
			None => onboarding.imported(Err(HostError::InProcess {
				cause: "no Space on this computer to import into".to_owned(),
			})),
		},
		Some(Pressed::ReadAgain) => {
			onboarding.import.read_again();
			onboarding.queued.push(Call::ReadInventory(Inventoried::ToShow));
		}
		Some(Pressed::Leave) => {
			if onboarding.import.mark_seen() {
				onboarding.queued.push(Call::MarkImportSeen);
			}
			onboarding.store(OnboardingStep::Account);
		}
		None => {}
	}
	sent(app);
}

pub fn account_event(app: &mut App, event: AccountEvent) {
	let onboarding = state(app);
	match event {
		AccountEvent::SignIn => onboarding.queued.push(Call::KiroshiSignIn),
		AccountEvent::Cancel => onboarding.queued.push(Call::KiroshiCancel),
		AccountEvent::CopySignInLink => {
			if let Some(KiroshiAccount::Waiting { verification_url }) = &onboarding.account {
				onboarding.effects.push(Effect::Copy(verification_url.clone()));
			}
		}
		AccountEvent::Skip | AccountEvent::Continue => onboarding.store(OnboardingStep::Done),
	}
	sent(app);
}

pub fn boot_failure(app: &App) -> Option<&HostError> {
	match &app.workspace {
		Workspace::Failed(failure) => Some(failure),
		Workspace::Connecting | Workspace::Ready(_) => app.surfaces.s04_boot.boot_failure.as_ref(),
	}
}
