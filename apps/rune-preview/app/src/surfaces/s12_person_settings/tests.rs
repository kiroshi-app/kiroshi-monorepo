use kiroshi_core::account::contract::AccountPlan;
use kiroshi_core::devices::contract::DeviceKind as CoreDeviceKind;
use kiroshi_core::missions::contract::{MissionLiveness, MissionState};
use kiroshi_core::search::contract::{
	Catalogue, CatalogueChat, CatalogueMission, ConversationKind, MessageHit, SnippetPart,
};
use kiroshi_core::updates::contract::{UpdateChannel, UpdateState};
use kiroshi_core::user::contract::{self, UserPreferences};
use rune::{Key as Pressed, KeyEvent, Mods};
use serde_json::json;

use kiroshi_rune_kit::primitives::toast::ToastType;
use kiroshi_rune_kit::strings::{Language, chat, search as copy, settings};
use kiroshi_rune_kit::surfaces::s12_person_settings::SettingsEvent;
use kiroshi_rune_kit::surfaces::s12_person_settings::panes::{
	Account as Panel, Channel, ColorScheme, Notified, Plan, RemovalStatus,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::search::{
	BotBadge, SearchEvent, SearchKind, SearchTab,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::Entry;

use super::about::{Shown as Updated, Updater, release_notes_url};
use super::account::{DeviceRead, Watched, panel_of};
use super::calls::{Answer, Call, Due, Found, Scope};
use super::diagnostics::{Specs, specs_text};
use super::hits::{self, Group, Landing, Lookups, Opened, Target, marked_title};
use super::preferences::{Change, shown_of};
use super::search::QUIET;
use super::*;
use crate::app::{Ready, Workspace};
use crate::host::Host;
use crate::model::{Agent, Conversation};

const SPACE: &str = "space-1";

fn failed(command: &str) -> HostError {
	HostError::CommandFailed {
		command: command.to_owned(),
		status: 500,
		body: "refused".to_owned(),
	}
}

fn conversation(id: &str, solo_bot_id: Option<&str>) -> Conversation {
	serde_json::from_value(json!({
		"id": id,
		"title": id,
		"color": null,
		"participants": [],
		"soloBotId": solo_bot_id,
	}))
	.expect("a conversation reads")
}

fn agent(id: &str, name: &str) -> Agent {
	Agent { id: id.to_owned(), name: name.to_owned(), title: String::new(), avatar_blot: None }
}

fn ready_app(person: Person) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: SPACE.to_owned(), name: "Personal".to_owned(), colour: None },
		agents: vec![agent("ada", "Ada")],
		conversations: vec![conversation("topic-1", None), conversation("solo-ada", Some("ada"))],
		person,
		longest: None,
	});
	app
}

fn record() -> UserPreferences {
	serde_json::from_value(json!({
		"displayName": "Ada Martin",
		"profilePicturePath": null,
		"colorScheme": "system",
		"language": null,
		"notifyOnQuestion": true,
		"notifyOnPermission": true,
		"notifyOnFinishedTurn": true,
		"notifyWithSound": true,
		"sidebarWidth": null,
		"lastSpaceId": null,
	}))
	.expect("the preferences read")
}

fn settings_of(app: &mut App) -> &mut State {
	&mut app.surfaces.s12_person_settings
}

fn drained(state: &mut State) -> Vec<Call> {
	std::mem::take(&mut state.queued)
		.into_iter()
		.filter(|call| !matches!(call, Call::Wake(_, Due::Notice(_))))
		.collect()
}

fn notice_title(state: &State) -> Option<String> {
	state.notice.as_ref().map(|(_, notice)| notice.title.clone())
}

fn said(key: Key) -> String {
	key.text(Language::En).to_owned()
}

fn signed_in() -> Watched {
	Watched::SignedIn { email: "ada@example.com".to_owned(), plan: Some(AccountPlan::Pro) }
}

fn device(id: &str, current: bool) -> DeviceRead {
	DeviceRead {
		id: id.to_owned(),
		name: Some(format!("{id} laptop")),
		kind: CoreDeviceKind::Computer,
		last_active_at: "2026-11-08T10:00:00Z".to_owned(),
		current,
	}
}

#[test]
fn settings_open_on_account_when_signed_in_and_on_appearance_when_signed_out() {
	let mut app = ready_app(Person::SignedIn("ada@example.com".to_owned()));
	open_settings(&mut app, None);
	assert!(app.navigation.main_route() == Route::PersonSettings);
	assert_eq!(current_entry(&app), Entry::Account);
	let mut app = ready_app(Person::SignedOut);
	open_settings(&mut app, None);
	assert_eq!(current_entry(&app), Entry::Appearance);
	settings_of(&mut app).answered(Answer::Account(Ok(signed_in())));
	assert_eq!(current_entry(&app), Entry::Account);
	settings_of(&mut app).answered(Answer::Account(Ok(Watched::SignedOut { reason: None })));
	assert_eq!(current_entry(&app), Entry::Appearance);
}

#[test]
fn opening_settings_reads_the_core_and_lists_the_entries_of_main() {
	let mut app = ready_app(Person::SignedIn("ada@example.com".to_owned()));
	open_settings(&mut app, None);
	let settings = settings_of(&mut app);
	let calls = drained(settings);
	for read in [
		Call::ReadPreferences,
		Call::ReadAccount,
		Call::ReadVersion,
		Call::ReadSpaces,
		Call::CheckUpdate,
	] {
		assert!(calls.contains(&read), "{read:?} is read on open");
	}
	let entries: Vec<Entry> = settings.rail_items().iter().map(|item| item.entry).collect();
	assert_eq!(
		entries,
		[
			Entry::Account,
			Entry::Appearance,
			Entry::Notifications,
			Entry::Language,
			Entry::Skills,
			Entry::Applications,
			Entry::History,
			Entry::Diagnostics
		]
	);
	settings.answered(Answer::Version(Ok(specs())));
	settings.answered(Answer::Checked(Ok(UpdateState::Available { version: "0.24.0".to_owned() })));
	let about = settings.rail_items().into_iter().find(|item| item.entry == Entry::About);
	assert!(about.is_some_and(|item| item.has_indicator), "a pending update badges About");
}

#[test]
fn the_spaces_group_lists_the_spaces_of_the_core_and_creates_an_untitled_one() {
	let mut app = ready_app(Person::SignedOut);
	open_settings(&mut app, None);
	let spaces =
		vec![Space { id: SPACE.to_owned(), name: "Personal".to_owned(), colour: Some(132.0) }];
	settings_of(&mut app).answered(Answer::Spaces(Ok(spaces)));
	assert_eq!(settings_of(&mut app).spaces.len(), 1);
	drained(settings_of(&mut app));
	settings_event(&mut app, SettingsEvent::CreateSpace);
	assert_eq!(
		drained(settings_of(&mut app)),
		[Call::CreateSpace(said(settings::space::UNTITLED))]
	);
	settings_of(&mut app).answered(Answer::Created(Err(failed("space_create"))));
	assert_eq!(notice_title(settings_of(&mut app)), Some(said(chat::screen::notice::FAILED)));
}

#[test]
fn a_preference_change_shows_at_once_writes_through_the_core_and_reads_back_after_a_restart() {
	let mut state = State::default();
	state.answered(Answer::Preferences(Ok(record())));
	for (event, change) in [
		(SettingsEvent::ColorScheme(ColorScheme::Dark), Change::ColorScheme(ColorScheme::Dark)),
		(SettingsEvent::Notify(Notified::Sound, false), Change::Notify(Notified::Sound, false)),
		(SettingsEvent::Language(Some(Language::Fr)), Change::Language(Some(Language::Fr))),
		(SettingsEvent::ShowsWhatsNew(false), Change::ShowsWhatsNew(false)),
	] {
		let before = state.preferences.shown();
		state.settings_event(event);
		assert_eq!(state.preferences.shown(), change.shown_on(before.clone()), "shown at once");
		assert_eq!(drained(&mut state), [Call::Change(change)]);
		let written = change.written_on(record());
		assert_eq!(
			shown_of(&written),
			change.shown_on(shown_of(&record())),
			"read back after a restart"
		);
		state.answered(Answer::Changed(Ok(written)));
	}
	let restarted = State::default();
	assert_eq!(restarted.preferences.shown().scheme, ColorScheme::System);
}

#[test]
fn the_written_record_carries_the_stored_values() {
	let written = Change::ColorScheme(ColorScheme::Light).written_on(record());
	assert_eq!(written.color_scheme, contract::ColorScheme::Light);
	let written = Change::Language(Some(Language::Fr)).written_on(record());
	assert_eq!(written.language.as_deref(), Some("fr"));
	let written = Change::Notify(Notified::Turn, false).written_on(record());
	assert!(!written.notify_on_finished_turn);
	let written = Change::Channel(Channel::Beta).written_on(record());
	assert_eq!(written.update_channel, UpdateChannel::Beta);
}

#[test]
fn preference_writes_go_one_at_a_time_in_order() {
	let mut state = State::default();
	state.answered(Answer::Preferences(Ok(record())));
	state.settings_event(SettingsEvent::ColorScheme(ColorScheme::Dark));
	state.settings_event(SettingsEvent::Notify(Notified::Question, false));
	assert_eq!(drained(&mut state), [Call::Change(Change::ColorScheme(ColorScheme::Dark))]);
	assert!(!state.preferences.shown().notifications.question, "the waiting change shows too");
	state
		.answered(Answer::Changed(Ok(Change::ColorScheme(ColorScheme::Dark).written_on(record()))));
	assert_eq!(drained(&mut state), [Call::Change(Change::Notify(Notified::Question, false))]);
}

#[test]
fn a_failed_preference_write_restores_the_previous_value_and_raises_the_notice() {
	let mut state = State::default();
	state.answered(Answer::Preferences(Ok(record())));
	state.settings_event(SettingsEvent::Notify(Notified::Permission, false));
	assert!(!state.preferences.shown().notifications.permission);
	state.answered(Answer::Changed(Err(failed("user_set_preferences"))));
	assert!(state.preferences.shown().notifications.permission, "the previous value is back");
	assert_eq!(notice_title(&state), Some(said(chat::screen::notice::FAILED)));
	state.settings_event(SettingsEvent::Channel(Channel::Beta));
	state.answered(Answer::Changed(Err(failed("user_set_preferences"))));
	assert_eq!(state.preferences.shown().channel, Channel::Stable);
}

#[test]
fn the_account_shows_loading_signed_out_waiting_and_signed_in() {
	let state = State::default();
	assert!(state.account.watched.is_none(), "loading until the core answers");
	assert_eq!(panel_of(&Watched::SignedOut { reason: None }, ""), Panel::SignedOut);
	let waiting = Watched::Waiting { verification_url: "https://kiroshi.app/device".to_owned() };
	assert_eq!(panel_of(&waiting, ""), Panel::Waiting);
	assert_eq!(
		panel_of(&signed_in(), ""),
		Panel::SignedIn { name: "ada", email: "ada@example.com", plan: Some(Plan::Pro) }
	);
	assert_eq!(
		panel_of(&signed_in(), "Ada Martin"),
		Panel::SignedIn { name: "Ada Martin", email: "ada@example.com", plan: Some(Plan::Pro) }
	);
	assert_eq!(panel_of(&Watched::Failed { failure: "expired".to_owned() }, ""), Panel::SignedOut);
}

#[test]
fn the_core_account_state_reads_into_its_watched_state() {
	let read = |value| serde_json::from_value::<Watched>(value).expect("the account reads");
	assert_eq!(
		read(
			json!({ "kind": "signedIn", "id": "u", "email": "ada@example.com", "createdAt": "x", "plan": "pro" })
		),
		signed_in()
	);
	assert_eq!(
		read(json!({ "kind": "waiting", "verificationUrl": "https://k", "expiresAt": "x" })),
		Watched::Waiting { verification_url: "https://k".to_owned() }
	);
	assert_eq!(
		read(json!({ "kind": "unreachable", "reason": "offline" })),
		Watched::Unreachable {}
	);
}

#[test]
fn account_actions_act_as_use_account_does() {
	let mut state = State::default();
	state.settings_event(SettingsEvent::SignIn);
	assert_eq!(drained(&mut state), [Call::SignIn]);
	state.answered(Answer::SignedIn(Err(failed("account_sign_in"))));
	assert_eq!(notice_title(&state), Some(said(settings::account::SIGN_IN_FAILED)));
	state.answered(Answer::SignedIn(Ok(())));
	assert_eq!(drained(&mut state), [Call::ReadAccount]);
	let link = "https://kiroshi.app/device?code=1";
	state.answered(Answer::Account(Ok(Watched::Waiting { verification_url: link.to_owned() })));
	assert!(drained(&mut state).contains(&Call::Wake(SIGN_IN_WATCH, Due::SignInWatch)));
	state.settings_event(SettingsEvent::CopySignInLink);
	let copied = Some(settings::account::SIGN_IN_LINK_COPIED);
	assert_eq!(state.effects, [Effect::Copy { text: link.to_owned(), copied }]);
	state.effects.clear();
	state.settings_event(SettingsEvent::CancelSignIn);
	assert_eq!(drained(&mut state), [Call::CancelSignIn]);
	state.answered(Answer::Cancelled(Err(failed("account_sign_out"))));
	assert_eq!(notice_title(&state), Some(said(settings::account::CANCEL_FAILED)));
	state.answered(Answer::Account(Ok(signed_in())));
	assert_eq!(drained(&mut state), [Call::ReadDevices]);
	state.settings_event(SettingsEvent::ManageAccount);
	assert_eq!(
		state.effects,
		[Effect::Open {
			url: ACCOUNT_PAGE_URL.to_owned(),
			refused: settings::account::MANAGE_ACCOUNT_FAILED
		}]
	);
	state.settings_event(SettingsEvent::SignOut);
	assert_eq!(drained(&mut state), [Call::SignOut]);
	state.answered(Answer::SignedOut(Err(failed("account_sign_out"))));
	assert_eq!(notice_title(&state), Some(said(settings::account::SIGN_OUT_FAILED)));
}

#[test]
fn a_noticed_account_transition_raises_its_notice_once() {
	let mut state = State::default();
	let revoked = Watched::SignedOut { reason: Some("deviceRevoked".to_owned()) };
	state.answered(Answer::Account(Ok(revoked.clone())));
	assert_eq!(notice_title(&state), Some(said(settings::account::device_revoked::TITLE)));
	state.notice = None;
	state.answered(Answer::Account(Ok(revoked)));
	assert_eq!(notice_title(&state), None);
	state.answered(Answer::Account(Err(failed("account_state"))));
	assert_eq!(notice_title(&state), Some(said(settings::account::READ_FAILED)));
}

#[test]
fn the_sign_in_watch_rereads_the_account_while_it_waits() {
	let mut state = State::default();
	state.answered(Answer::Account(Ok(Watched::Waiting {
		verification_url: "https://k".to_owned(),
	})));
	drained(&mut state);
	state.answered(Answer::Due(Due::SignInWatch));
	assert_eq!(drained(&mut state), [Call::ReadAccount]);
	state.answered(Answer::Account(Ok(signed_in())));
	state.answered(Answer::Due(Due::SignInWatch));
	assert_eq!(drained(&mut state), [Call::ReadDevices]);
}

fn with_devices() -> State {
	let mut state = State::default();
	state.answered(Answer::Account(Ok(signed_in())));
	state.answered(Answer::Devices(Ok(vec![device("this", true), device("phone", false)])));
	drained(&mut state);
	state
}

#[test]
fn removing_a_device_asks_shows_it_removing_and_drops_it_on_success() {
	let mut state = with_devices();
	state.settings_event(SettingsEvent::AskRemoval("phone".to_owned()));
	assert_eq!(state.devices.confirming.as_deref(), Some("phone"));
	assert!(drained(&mut state).is_empty(), "asking removes nothing yet");
	state.settings_event(SettingsEvent::Remove("phone".to_owned()));
	assert_eq!(drained(&mut state), [Call::RemoveDevice("phone".to_owned())]);
	assert_eq!(state.devices.status_of_confirming(), Some(RemovalStatus::Removing));
	state.settings_event(SettingsEvent::Remove("phone".to_owned()));
	assert!(drained(&mut state).is_empty(), "one removal at a time");
	state.answered(Answer::Removed { device_id: "phone".to_owned(), outcome: Ok(()) });
	assert!(state.devices.listed().iter().all(|device| device.id != "phone"));
	assert_eq!(state.devices.confirming, None);
	assert_eq!(notice_title(&state), Some("phone laptop was signed out".to_owned()));
}

#[test]
fn a_refused_removal_shows_the_failure_on_the_row() {
	let mut state = with_devices();
	state.settings_event(SettingsEvent::AskRemoval("phone".to_owned()));
	state.settings_event(SettingsEvent::Remove("phone".to_owned()));
	state.answered(Answer::Removed {
		device_id: "phone".to_owned(),
		outcome: Err(failed("device_remove")),
	});
	assert_eq!(state.devices.status_of_confirming(), Some(RemovalStatus::Failed));
	assert_eq!(state.devices.listed().len(), 2);
	let refused =
		said(settings::account::devices::confirm::FAILED).replace("{{device}}", "phone laptop");
	assert_eq!(notice_title(&state), Some(refused));
	state.settings_event(SettingsEvent::CancelRemoval);
	assert_eq!(state.devices.confirming, None);
	assert_eq!(state.devices.status_of_confirming(), None);
}

#[test]
fn a_failed_devices_read_hides_the_devices_and_raises_the_read_notice() {
	let mut state = State::default();
	state.answered(Answer::Account(Ok(signed_in())));
	state.answered(Answer::Devices(Err(failed("devices_list"))));
	assert!(matches!(state.devices.read, DevicesRead::Failed));
	assert_eq!(notice_title(&state), Some(said(settings::account::READ_FAILED)));
}

fn specs() -> Specs {
	serde_json::from_value(json!({
		"appVersion": "0.23.0",
		"gitCommit": "abc123",
		"installKind": "installed",
		"osName": "macOS",
		"osBuild": "25A",
		"arch": "aarch64",
		"ramBytes": 17_179_869_184_u64,
		"agentVersion": null,
		"provider": null,
		"agentError": null,
		"side": "local",
		"plan": null,
	}))
	.expect("the diagnostics read")
}

#[test]
fn copy_diagnostics_copies_the_specs_of_main_and_shows_its_failure() {
	let mut state = State::default();
	state.settings_event(SettingsEvent::CopyDiagnostics);
	assert_eq!(drained(&mut state), [Call::CopyDiagnostics]);
	state.answered(Answer::Diagnostics(Ok(specs())));
	let text = "-- Specs\nApp version: 0.23.0\nCommit: abc123\nInstall: installed\nOS: macOS\nOS build: 25A\nArch: aarch64\nRAM: 16 GB\nSide: local";
	assert_eq!(specs_text(&specs()), text);
	assert_eq!(state.effects, [Effect::Copy { text: text.to_owned(), copied: None }]);
	state.answered(Answer::Diagnostics(Err(failed("diagnostics"))));
	assert_eq!(notice_title(&state), Some(said(settings::diagnostics::COPY_FAILED)));
}

#[test]
fn reveal_and_clear_log_act_as_diagnostics_actions_with_clear_behind_its_confirm() {
	let mut state = State::default();
	state.settings_event(SettingsEvent::RevealLog);
	assert_eq!(drained(&mut state), [Call::RevealLog]);
	state.answered(Answer::Revealed(Err(failed("log_reveal"))));
	assert_eq!(notice_title(&state), Some(said(settings::diagnostics::REVEAL_FAILED)));
	state.settings_event(SettingsEvent::AskClearLog);
	assert!(state.is_clearing_log);
	assert!(drained(&mut state).is_empty(), "nothing is cleared before the confirm");
	state.settings_event(SettingsEvent::CancelClearLog);
	assert!(!state.is_clearing_log);
	state.settings_event(SettingsEvent::AskClearLog);
	state.settings_event(SettingsEvent::ClearLog);
	assert!(!state.is_clearing_log);
	assert_eq!(drained(&mut state), [Call::ClearLog]);
	state.answered(Answer::Cleared(Err(failed("log_clear"))));
	assert_eq!(notice_title(&state), Some(said(settings::diagnostics::clear::FAILED)));
}

#[test]
fn about_shows_the_running_version_the_channel_and_the_update_state() {
	let mut state = State::default();
	state.answered(Answer::Version(Ok(specs())));
	assert_eq!(state.version.as_deref(), Some("0.23.0"));
	assert_eq!(state.preferences.shown().channel, Channel::Stable);
	state.answered(Answer::Checked(Ok(UpdateState::UpToDate)));
	assert!(matches!(state.updater.shown(), Updated::UpToDate { .. }));
	assert_eq!(release_notes_url("0.23.0"), format!("{}/v0.23.0", about::RELEASE_TAG_URL));
	state.settings_event(SettingsEvent::ReleaseNotes);
	assert!(matches!(&state.effects[..], [Effect::Open { url, .. }] if url.ends_with("/v0.23.0")));
}

#[test]
fn check_download_progress_and_restart_follow_the_updater_controller() {
	let mut state = State::default();
	assert_eq!(state.updater.shown(), Updated::Checking);
	state.settings_event(SettingsEvent::Check);
	assert_eq!(drained(&mut state), [Call::CheckUpdate]);
	state.answered(Answer::Checked(Ok(UpdateState::Available { version: "0.24.0".to_owned() })));
	state.settings_event(SettingsEvent::Download);
	let calls = drained(&mut state);
	assert!(calls.contains(&Call::InstallUpdate));
	assert!(calls.contains(&Call::Wake(DOWNLOAD_WATCH, Due::DownloadWatch)));
	state.answered(Answer::Due(Due::DownloadWatch));
	assert!(drained(&mut state).contains(&Call::ReadUpdate));
	state.answered(Answer::Update(Ok(UpdateState::Downloading {
		downloaded_bytes: 50,
		total_bytes: Some(200),
	})));
	assert_eq!(
		state.updater.shown(),
		Updated::Downloading { version: "0.24.0".to_owned(), progress: 25.0 }
	);
	state.answered(Answer::Installed(Ok(UpdateState::ReadyToRestart {
		version: "0.24.0".to_owned(),
	})));
	assert!(drained(&mut state).contains(&Call::CountRunning));
	state.answered(Answer::Running(Ok(2)));
	assert_eq!(state.updater.shown(), Updated::Ready { version: "0.24.0".to_owned(), running: 2 });
	state.settings_event(SettingsEvent::Restart);
	assert_eq!(drained(&mut state), [Call::RestartToUpdate]);
}

#[test]
fn a_failed_check_raises_the_updater_notice_and_shows_up_to_date() {
	let mut state = State::default();
	state.answered(Answer::Checked(Ok(UpdateState::Failed { message: "offline".to_owned() })));
	assert!(matches!(state.updater.shown(), Updated::UpToDate { .. }));
	assert_eq!(notice_title(&state), Some(said(chat::screen::notice::FAILED)));
}

#[test]
fn downloading_again_after_a_failure_checks_first_then_installs() {
	let mut updater = Updater::new(0);
	updater.land(UpdateState::Available { version: "0.24.0".to_owned() }, 0);
	updater.land(UpdateState::Failed { message: "lost".to_owned() }, 0);
	assert_eq!(updater.shown(), Updated::Failed { version: "0.24.0".to_owned() });
	assert_eq!(updater.install(), Some(Call::CheckUpdate));
	let next = updater.land(UpdateState::Available { version: "0.24.0".to_owned() }, 0);
	assert_eq!(next, Some(Call::InstallUpdate));
	let mut state = State::default();
	state.settings_event(SettingsEvent::Restart);
	assert!(drained(&mut state).is_empty(), "restart waits for a downloaded update");
}

#[test]
fn back_and_close_return_where_settings_were_opened_from() {
	for event in [SettingsEvent::Back, SettingsEvent::Close] {
		let mut app = ready_app(Person::SignedOut);
		app.navigation.navigate_main(Route::Library);
		open_settings(&mut app, None);
		settings_event(&mut app, event);
		assert!(app.navigation.main_route() == Route::Library);
	}
}

#[test]
fn open_space_import_and_replay_go_where_main_goes() {
	let mut app = ready_app(Person::SignedOut);
	open_settings(&mut app, None);
	settings_event(&mut app, SettingsEvent::OpenSpace(SPACE.to_owned()));
	assert!(app.navigation.main_route() == Route::SpaceSettings);
	open_settings(&mut app, None);
	settings_event(&mut app, SettingsEvent::ImportFromClaudeCode);
	assert!(app.navigation.main_route() == Route::PersonSettings, "nothing to import stays");
	app.dev_profile = Some(crate::dev_profile::DevProfile {
		claude: None,
		import: Some(crate::dev_profile::ImportChoices {
			agents: Vec::new(),
			claude_md: None,
			skills: Vec::new(),
		}),
		kiroshi: None,
	});
	settings_event(&mut app, SettingsEvent::ImportFromClaudeCode);
	assert!(app.navigation.main_route() == Route::Onboarding(Step::Import));
	open_settings(&mut app, None);
	drained(settings_of(&mut app));
	settings_event(&mut app, SettingsEvent::ReplayOnboarding);
	assert!(app.navigation.main_route() == Route::Onboarding(Step::first()));
	assert_eq!(drained(settings_of(&mut app)), [Call::ReplayOnboarding]);
}

fn command_k() -> KeyEvent {
	KeyEvent { key: Pressed::Command('k'), mods: Mods { cmd: true, ..Mods::default() } }
}

fn pressed(key: Pressed) -> KeyEvent {
	KeyEvent { key, mods: Mods::default() }
}

fn scope(generation: u64, query: &str) -> Scope {
	Scope { generation, space_id: SPACE.to_owned(), query: query.to_owned() }
}

fn chat_hit(id: &str, kind: ConversationKind, bot_id: Option<&str>) -> CatalogueChat {
	serde_json::from_value(json!({
		"conversationId": id,
		"kind": kind,
		"title": format!("Chat {id}"),
		"botId": bot_id,
		"participants": ["Ada"],
		"spaceId": SPACE,
		"state": "idle",
		"pendingPrompt": null,
		"workingBotIds": [],
	}))
	.unwrap_or_else(|failure| panic!("a catalogue chat reads: {failure}"))
}

fn mission(id: &str) -> CatalogueMission {
	CatalogueMission {
		id: id.to_owned(),
		thread_conversation_id: format!("{id}-thread"),
		objective: "Ship the release".to_owned(),
		ticket_platform: "Linear".to_owned(),
		ticket_external_id: "OPE-1".to_owned(),
		ticket_title: "Release".to_owned(),
		state: MissionState::Working,
		liveness: MissionLiveness::NeedsYou,
		pending_prompt: None,
		working_bot_ids: Vec::new(),
		bot_id: "ada".to_owned(),
		space_id: SPACE.to_owned(),
	}
}

fn message(id: &str) -> MessageHit {
	MessageHit {
		message_id: id.to_owned(),
		seq: 7,
		conversation_id: "topic-1".to_owned(),
		conversation_kind: ConversationKind::Topic,
		conversation_title: "Launch".to_owned(),
		author_bot_id: Some("ada".to_owned()),
		created_at: 0,
		space_id: Some(SPACE.to_owned()),
		snippet: vec![SnippetPart { text: "ship".to_owned(), matched: true }],
	}
}

fn resting_found(chats: Vec<CatalogueChat>) -> Found {
	let catalogue =
		Catalogue { chats: Vec::new(), missions: vec![mission("m1")], routines: Vec::new() };
	Found { messages: Vec::new(), catalogue, recents: Some(chats) }
}

fn searching_app() -> App {
	let mut app = ready_app(Person::SignedOut);
	assert!(key_pressed(&mut app, &command_k()));
	app
}

#[test]
fn the_search_shortcut_opens_the_palette_on_the_resting_groups() {
	let mut app = searching_app();
	let settings = settings_of(&mut app);
	assert!(settings.is_searching());
	assert_eq!(drained(settings), [Call::Search(scope(0, ""))]);
	let recents = vec![
		chat_hit("topic-1", ConversationKind::Topic, None),
		chat_hit("solo-ada", ConversationKind::Main, Some("ada")),
	];
	settings.answered(Answer::Searched { scope: scope(0, ""), found: Ok(resting_found(recents)) });
	let lookups = lookups_of(&app).expect("the workspace is ready");
	let search = app.surfaces.s12_person_settings.search.as_ref().expect("the palette is open");
	let resting: Vec<SearchKind> = hits::resting_groups(&search.read, &search.recents, &lookups)
		.iter()
		.map(|group| group.kind)
		.collect();
	assert_eq!(resting, [SearchKind::Chats, SearchKind::Missions]);
	assert!(key_pressed(&mut app, &command_k()), "the chord is kept while open");
}

#[test]
fn typing_queries_the_core_after_the_quiet_time_and_drops_older_answers() {
	let mut app = searching_app();
	let settings = settings_of(&mut app);
	drained(settings);
	settings.edit = rune::TextEdit::new("sh");
	settings.typed();
	assert_eq!(drained(settings), [Call::Wake(QUIET, Due::Search(1))]);
	settings.edit = rune::TextEdit::new("ship");
	settings.typed();
	assert_eq!(drained(settings), [Call::Wake(QUIET, Due::Search(2))]);
	settings.answered(Answer::Due(Due::Search(1)));
	assert!(drained(settings).is_empty(), "a quiet time outrun by typing reads nothing");
	settings.answered(Answer::Due(Due::Search(2)));
	assert_eq!(drained(settings), [Call::Search(scope(2, "ship"))]);
	let search = settings.search.as_ref().expect("the palette is open");
	assert!(search.is_loading());
	let found = |messages| Found {
		messages,
		catalogue: Catalogue { chats: Vec::new(), missions: Vec::new(), routines: Vec::new() },
		recents: None,
	};
	settings.answered(Answer::Searched {
		scope: scope(1, "sh"),
		found: Ok(found(vec![message("old")])),
	});
	let search = settings.search.as_ref().expect("the palette is open");
	assert!(search.read.messages.is_empty(), "an answer older than the query is dropped");
	settings.answered(Answer::Searched {
		scope: scope(2, "ship"),
		found: Ok(found(vec![message("new")])),
	});
	let search = settings.search.as_ref().expect("the palette is open");
	assert_eq!(search.read.messages.len(), 1);
	assert!(!search.is_loading());
	settings.edit = rune::TextEdit::new("");
	settings.typed();
	assert_eq!(drained(settings), [Call::Search(scope(3, ""))], "clearing the query reads at once");
}

#[test]
fn a_failed_search_shows_the_failure_and_keeps_the_last_answer() {
	let mut app = searching_app();
	let settings = settings_of(&mut app);
	let recents = vec![chat_hit("topic-1", ConversationKind::Topic, None)];
	settings.answered(Answer::Searched { scope: scope(0, ""), found: Ok(resting_found(recents)) });
	settings.edit = rune::TextEdit::new("x");
	settings.typed();
	settings.answered(Answer::Due(Due::Search(1)));
	settings
		.answered(Answer::Searched { scope: scope(1, "x"), found: Err(failed("search_messages")) });
	let search = settings.search.as_ref().expect("the palette is open");
	assert!(search.has_failed);
	assert_eq!(search.read.catalogue.missions.len(), 1, "the last answer stays");
	assert_eq!(notice_title(settings), Some(said(copy::unavailable::TITLE)));
	let shown = settings.notice.as_ref().map(|(_, notice)| notice.description.clone());
	assert_eq!(shown, Some(said(copy::unavailable::DESCRIPTION)));
}

#[test]
fn arrows_move_the_active_hit_and_enter_lands_on_the_conversation() {
	let mut app = searching_app();
	let recents = vec![
		chat_hit("topic-1", ConversationKind::Topic, None),
		chat_hit("solo-ada", ConversationKind::Main, Some("ada")),
	];
	settings_of(&mut app)
		.answered(Answer::Searched { scope: scope(0, ""), found: Ok(resting_found(recents)) });
	assert!(key_pressed(&mut app, &pressed(Pressed::Down)));
	assert_eq!(settings_of(&mut app).search.as_ref().map(Search::active_index), Some(1));
	assert!(key_pressed(&mut app, &pressed(Pressed::Up)));
	assert!(key_pressed(&mut app, &pressed(Pressed::Up)));
	assert_eq!(
		settings_of(&mut app).search.as_ref().map(Search::active_index),
		Some(2),
		"the move wraps"
	);
	assert!(key_pressed(&mut app, &pressed(Pressed::Down)));
	assert!(key_pressed(&mut app, &pressed(Pressed::Down)));
	assert!(key_pressed(&mut app, &pressed(Pressed::Enter)));
	assert!(!settings_of(&mut app).is_searching(), "picking closes the palette");
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.clone()),
		Some("solo-ada".to_owned())
	);
	assert!(app.navigation.main_route() == Route::Conversations);
}

#[test]
fn a_clicked_message_lands_on_its_conversation_and_records_the_landing() {
	let mut app = searching_app();
	let settings = settings_of(&mut app);
	settings.edit = rune::TextEdit::new("ship");
	settings.typed();
	settings.answered(Answer::Due(Due::Search(1)));
	let found = Found {
		messages: vec![message("msg-1")],
		catalogue: Catalogue { chats: Vec::new(), missions: Vec::new(), routines: Vec::new() },
		recents: None,
	};
	settings.answered(Answer::Searched { scope: scope(1, "ship"), found: Ok(found) });
	search_event(&mut app, SearchEvent::Open("message-msg-1".to_owned()));
	let landing =
		Landing { conversation_id: "topic-1".to_owned(), message_id: "msg-1".to_owned(), seq: 7 };
	assert_eq!(settings_of(&mut app).landing(), Some(&landing));
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.clone()),
		Some("topic-1".to_owned())
	);
	settings_of(&mut app).forget_landing(&landing);
	assert_eq!(settings_of(&mut app).landing(), None);
}

#[test]
fn a_picked_mission_reads_its_detail_before_opening_and_escape_closes() {
	let mut app = searching_app();
	settings_of(&mut app)
		.answered(Answer::Searched { scope: scope(0, ""), found: Ok(resting_found(Vec::new())) });
	drained(settings_of(&mut app));
	search_event(&mut app, SearchEvent::Open("mission-m1".to_owned()));
	assert_eq!(drained(settings_of(&mut app)), [Call::ReadMission("m1".to_owned())]);
	settings_of(&mut app).answered(Answer::Mission(Err(failed("mission_detail"))));
	assert_eq!(notice_title(settings_of(&mut app)), Some(said(chat::screen::notice::FAILED)));
	assert!(key_pressed(&mut app, &command_k()));
	assert!(key_pressed(&mut app, &pressed(Pressed::Escape)));
	assert!(!settings_of(&mut app).is_searching());
	assert!(!key_pressed(&mut app, &pressed(Pressed::Escape)), "escape is not taken once closed");
}

#[test]
fn search_rows_follow_search_model() {
	let lookups = Lookups {
		agents: &[agent("ada", "Ada")],
		conversations: &[conversation("topic-1", None)],
		reader: "Ada Martin".to_owned(),
		now: 0,
	};
	let read = search::Read {
		messages: vec![message("msg-1")],
		catalogue: Catalogue {
			chats: vec![
				chat_hit("solo-ada", ConversationKind::Main, Some("ada")),
				chat_hit("orphan", ConversationKind::Main, None),
			],
			missions: vec![mission("m1")],
			routines: Vec::new(),
		},
	};
	let groups = hits::found_groups(&read, &[], "release", &lookups);
	let kinds: Vec<(SearchKind, usize)> =
		groups.iter().map(|group: &Group| (group.kind, group.rows.len())).collect();
	assert_eq!(
		kinds,
		[
			(SearchKind::Messages, 1),
			(SearchKind::Chats, 1),
			(SearchKind::Missions, 1),
			(SearchKind::Routines, 0)
		]
	);
	let message_row = &groups[0].rows[0];
	assert!(
		matches!(&message_row.target, Target::Chat { opened: Opened::Conversation(id), landing: Some(_) } if id == "topic-1")
	);
	assert_eq!(
		message_row.parts,
		[hits::Part::Said("Ada".to_owned()), hits::Part::Said("Launch".to_owned())]
	);
	let chat_row = &groups[1].rows[0];
	assert_eq!(
		chat_row.target,
		Target::Chat { opened: Opened::Agent("ada".to_owned()), landing: None }
	);
	let mission_row = &groups[2].rows[0];
	assert_eq!(mission_row.title, [("Ship the ".to_owned(), false), ("release".to_owned(), true)]);
	assert!(matches!(
		&mission_row.face,
		hits::Face::Mission { badge: Some(BotBadge::Attention), .. }
	));
	assert_eq!(hits::visible(SearchTab::Only(SearchKind::Missions), &groups).len(), 1);
	assert_eq!(hits::visible(SearchTab::All, &groups).len(), 3);
}

#[test]
fn a_title_marks_the_query_whatever_its_case() {
	assert_eq!(
		marked_title("Ship IT", "it"),
		[("Ship ".to_owned(), false), ("IT".to_owned(), true)]
	);
	assert_eq!(marked_title("Ship", ""), [("Ship".to_owned(), false)]);
	assert_eq!(marked_title("Ship", "zzz"), [("Ship".to_owned(), false)]);
}

#[test]
fn a_notice_clears_after_its_lifetime_unless_a_newer_one_replaced_it() {
	let mut state = State::default();
	state.raise(ToastType::Error, chat::screen::notice::FAILED, None);
	let first = state.notices_raised;
	state.raise(ToastType::Error, settings::account::READ_FAILED, None);
	state.answered(Answer::Due(Due::Notice(first)));
	assert_eq!(notice_title(&state), Some(said(settings::account::READ_FAILED)));
	state.answered(Answer::Due(Due::Notice(state.notices_raised)));
	assert_eq!(notice_title(&state), None);
}
