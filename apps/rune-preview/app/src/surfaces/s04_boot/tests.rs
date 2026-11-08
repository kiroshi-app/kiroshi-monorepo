use kiroshi_core::user::contract::{OnboardingStep, UserPreferences};
use serde_json::json;

use kiroshi_rune_kit::surfaces::s04_boot::account::AccountEvent;
use kiroshi_rune_kit::surfaces::s04_boot::connect::{ConnectEvent, ConnectStep};
use kiroshi_rune_kit::surfaces::s04_boot::import::{ImportEvent, ImportStatus, ImportStep};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeEvent, NoticeKind, SurfaceEvent};
use kiroshi_rune_kit::surfaces::s04_boot::welcome::{WelcomeEvent, WelcomeStep};

use super::calls::{Answer, Call, ClaudeReport, ImportOutcome, Inventoried, KiroshiAccount};
use super::connect::initials_of;
use super::*;
use crate::app::notice::{closed, shown};
use crate::app::{Ready, Workspace};
use crate::host::Host;
use crate::model::{Agent, ClaudeInventory, Conversation, Space};

const SPACE: &str = "space-1";

fn refused(kind: &str) -> HostError {
	HostError::CommandFailed {
		command: "a_command".to_owned(),
		status: 500,
		body: json!({ "kind": kind }).to_string(),
	}
}

fn agent(id: &str, name: &str) -> Agent {
	Agent { id: id.to_owned(), name: name.to_owned(), title: String::new(), avatar_blot: None }
}

fn conversation(id: &str, solo_bot_id: &str) -> Conversation {
	serde_json::from_value(json!({
		"id": id,
		"title": id,
		"color": null,
		"participants": [],
		"soloBotId": solo_bot_id,
	}))
	.expect("a conversation reads")
}

fn ready(conversations: Vec<Conversation>) -> Ready {
	Ready {
		source: Source::Running(Host::detached()),
		space: Space { id: SPACE.to_owned(), name: "Personal".to_owned(), colour: None },
		agents: vec![agent("shoto", "Shoto")],
		conversations,
		person: crate::app::Person::SignedOut,
		longest: None,
	}
}

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(ready(Vec::new()));
	app
}

fn preferences(step: &str) -> UserPreferences {
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
		"onboardingStep": step,
	}))
	.expect("the preferences read")
}

fn report(
	authenticated: bool,
	account: serde_json::Value,
	error: serde_json::Value,
) -> ClaudeReport {
	serde_json::from_value(json!({
		"connection": "ready",
		"binaryVersion": null,
		"authenticated": authenticated,
		"error": error,
		"account": account,
	}))
	.expect("the report reads")
}

fn item(key: &str, name: &str, already_imported: bool) -> serde_json::Value {
	json!({ "key": key, "name": name, "description": "", "alreadyImported": already_imported })
}

fn found() -> ClaudeInventory {
	serde_json::from_value(json!({
		"kind": "found",
		"agents": [item("agent:atlas", "Atlas", false), item("agent:wren", "Wren", true)],
		"skills": [item("skill:tidy", "tidy", false)],
		"claudeMd": item("claude-md", "CLAUDE.md", false),
	}))
	.expect("the inventory reads")
}

fn outcome(key: &str, result: serde_json::Value) -> ImportOutcome {
	serde_json::from_value(json!({ "key": key, "result": result })).expect("the outcome reads")
}

fn onboarding(app: &mut App) -> &mut State {
	&mut app.surfaces.s04_boot
}

fn heard(app: &mut App, answer: Answer) {
	if let Some(next) = onboarding(app).answered(answer) {
		follow(app, next);
	}
	raise_queued(app);
}

fn drained(app: &mut App) -> Vec<Call> {
	std::mem::take(&mut onboarding(app).queued)
}

fn route(app: &App) -> Route {
	app.navigation.main_route()
}

fn failure_titles(app: &App) -> Vec<String> {
	shown(app)
		.into_iter()
		.filter(|notice| notice.kind == NoticeKind::Error)
		.map(|notice| notice.title.clone())
		.collect()
}

fn connect_step(app: &App) -> Option<ConnectStep> {
	app.surfaces.s04_boot.sign_in.step()
}

fn at(app: &mut App, step: Step) {
	app.navigation.navigate_main(Route::Onboarding(step));
}

fn connecting(app: &mut App) {
	at(app, Step::Connect);
	connect_event(app, ConnectEvent::SignIn);
	drained(app);
}

fn importing(app: &mut App) {
	at(app, Step::Import);
	heard(app, Answer::Inventory { purpose: Inventoried::ToShow, inventory: Ok(found()) });
}

#[test]
fn a_new_app_shows_the_boot_screen_until_the_core_answers() {
	let app = App::new();

	assert!(route(&app) == Route::Onboarding(Step::Boot));
	assert!(matches!(app.workspace, Workspace::Connecting));
	assert!(boot_failure(&app).is_none());
}

#[test]
fn a_core_failing_to_open_shows_its_cause_and_the_retry_reopens_it() {
	let mut app = App::new();
	app.workspace = Workspace::Failed(HostError::InProcess { cause: "disk full".to_owned() });

	assert!(boot_failure(&app).is_some_and(|failure| failure.detail().contains("disk full")));

	boot_retried(&mut app, NoticeEvent::Retry);

	assert!(matches!(app.workspace, Workspace::Connecting));
	assert!(boot_failure(&app).is_none());
}

#[test]
fn an_opened_core_is_asked_for_the_stored_onboarding_step() {
	let mut app = ready_app();

	booted(&mut app);

	assert_eq!(drained(&mut app), vec![Call::ReadPreferences]);
}

#[test]
fn a_launch_past_the_boot_step_reads_no_onboarding_step() {
	let mut app = ready_app();
	app.navigation.navigate_main(Route::Conversations);

	booted(&mut app);

	assert!(drained(&mut app).is_empty());
}

#[test]
fn the_stored_step_opens_on_each_onboarding_screen_and_reads_what_it_shows() {
	let cases = [
		("welcome", Route::Onboarding(Step::first()), Vec::new()),
		("connect", Route::Onboarding(Step::Connect), vec![Call::ReadClaudeAccount]),
		("import", Route::Onboarding(Step::Import), vec![Call::ReadInventory(Inventoried::ToShow)]),
		("account", Route::Onboarding(Step::Account), vec![Call::ReadKiroshiAccount]),
		("done", Route::Conversations, Vec::new()),
	];
	for (stored, landed, reads) in cases {
		let mut app = ready_app();

		heard(&mut app, Answer::Preferences(Ok(preferences(stored))));

		assert!(route(&app) == landed, "{stored} opened another screen");
		assert_eq!(drained(&mut app), reads, "{stored} read the wrong things");
	}
}

#[test]
fn a_failed_step_read_shows_the_boot_failure_and_the_retry_reads_it_again() {
	let mut app = ready_app();

	heard(&mut app, Answer::Preferences(Err(refused("databaseUnavailable"))));

	assert!(route(&app) == Route::Onboarding(Step::Boot));
	assert!(boot_failure(&app).is_some());

	boot_retried(&mut app, NoticeEvent::Retry);

	assert!(boot_failure(&app).is_none());
	assert_eq!(drained(&mut app), vec![Call::ReadPreferences]);
}

#[test]
fn the_welcome_pages_move_back_and_forth_and_the_last_one_stores_the_connect_step() {
	let mut app = ready_app();
	at(&mut app, Step::first());

	welcome_event(&mut app, WelcomeEvent::Next);
	welcome_event(&mut app, WelcomeEvent::Next);
	welcome_event(&mut app, WelcomeEvent::Back);

	assert!(route(&app) == Route::Onboarding(Step::Welcome(WelcomeStep::Conversations)));
	assert!(drained(&mut app).is_empty());

	at(&mut app, Step::Welcome(WelcomeStep::Tools));
	welcome_event(&mut app, WelcomeEvent::Next);

	assert_eq!(drained(&mut app), vec![Call::StoreStep(OnboardingStep::Connect)]);
	assert!(route(&app) == Route::Onboarding(Step::Welcome(WelcomeStep::Tools)));
}

#[test]
fn skipping_the_intro_stores_the_connect_step_then_opens_it() {
	let mut app = ready_app();
	at(&mut app, Step::first());

	welcome_event(&mut app, WelcomeEvent::Skip);
	assert_eq!(drained(&mut app), vec![Call::StoreStep(OnboardingStep::Connect)]);

	heard(
		&mut app,
		Answer::Stored { step: OnboardingStep::Connect, outcome: Ok(preferences("connect")) },
	);

	assert!(route(&app) == Route::Onboarding(Step::Connect));
	assert_eq!(drained(&mut app), vec![Call::ReadClaudeAccount]);
	assert_eq!(connect_step(&app), None);
}

#[test]
fn a_step_that_fails_to_store_raises_a_notice_with_its_retry_and_stays() {
	let mut app = ready_app();
	at(&mut app, Step::first());

	heard(
		&mut app,
		Answer::Stored {
			step: OnboardingStep::Connect,
			outcome: Err(refused("databaseUnavailable")),
		},
	);

	assert!(route(&app) == Route::Onboarding(Step::first()));
	assert_eq!(failure_titles(&app), vec![UNSENT.text(Language::En).to_owned()]);
	let retry = Retry(Call::StoreStep(OnboardingStep::Connect));
	assert!(shown(&app).iter().all(|notice| notice.retry.as_ref() == Some(&retry)));

	closed(&mut app, SurfaceEvent::Act(0));

	assert!(failure_titles(&app).is_empty());
	assert_eq!(drained(&mut app), vec![Call::StoreStep(OnboardingStep::Connect)]);
}

#[test]
fn a_claude_login_on_this_computer_is_offered_as_found() {
	let mut app = ready_app();
	let account = json!({ "email": "ada.martin@example.com", "plan": "Claude Max" });

	heard(&mut app, Answer::ClaudeAccount(Ok(report(true, account, json!(null)))));

	assert_eq!(connect_step(&app), Some(ConnectStep::LoginFound));
	assert_eq!(initials_of("ada.martin@example.com"), "AM");
	assert_eq!(initials_of("wren@example.com"), "WR");

	connect_event(&mut app, ConnectEvent::UseAccount);

	assert_eq!(drained(&mut app), vec![Call::ReadInventory(Inventoried::ToSettle)]);
	assert_eq!(connect_step(&app), None);
}

#[test]
fn no_claude_login_offers_the_connect_methods() {
	let mut app = ready_app();

	heard(&mut app, Answer::ClaudeAccount(Ok(report(false, json!(null), json!(null)))));
	assert_eq!(connect_step(&app), Some(ConnectStep::NothingFound));

	let not_signed_in = json!({ "kind": "notAuthenticated" });
	heard(&mut app, Answer::ClaudeAccount(Ok(report(false, json!(null), not_signed_in))));
	assert_eq!(connect_step(&app), Some(ConnectStep::NothingFound));
	assert!(failure_titles(&app).is_empty());
}

#[test]
fn a_missing_agent_shows_its_step_and_raises_a_notice() {
	let mut app = ready_app();
	let missing = json!({ "kind": "binaryNotFound", "searched": [] });

	heard(&mut app, Answer::ClaudeAccount(Ok(report(false, json!(null), missing))));

	assert_eq!(connect_step(&app), Some(ConnectStep::AgentMissing));
	assert_eq!(failure_titles(&app).len(), 1);

	connect_event(&mut app, ConnectEvent::DownloadAgain);

	assert_eq!(onboarding(&mut app).effects, vec![Effect::Open(DOWNLOAD_PAGE_URL.to_owned())]);
}

#[test]
fn a_browser_sign_in_waits_for_the_code_then_settles() {
	let mut app = ready_app();
	at(&mut app, Step::Connect);

	connect_event(&mut app, ConnectEvent::SignIn);
	assert_eq!(drained(&mut app), vec![Call::SignIn(1)]);

	heard(&mut app, Answer::SignInStarted("https://claude.ai/oauth".to_owned()));
	assert_eq!(connect_step(&app), Some(ConnectStep::WaitingForCode));
	assert_eq!(
		onboarding(&mut app).effects,
		vec![Effect::Open("https://claude.ai/oauth".to_owned())]
	);

	onboarding(&mut app).sign_in.code = rune::TextEdit::new("abc-123");
	connect_event(&mut app, ConnectEvent::SubmitCode);
	assert_eq!(connect_step(&app), Some(ConnectStep::Connecting));
	assert_eq!(drained(&mut app), vec![Call::EnterCode("abc-123".to_owned())]);

	heard(&mut app, Answer::CodeEntered(Ok(())));
	assert_eq!(connect_step(&app), Some(ConnectStep::WaitingForCode));

	heard(&mut app, Answer::SignedIn { attempt: 1, outcome: Ok(()) });
	assert_eq!(drained(&mut app), vec![Call::ReadInventory(Inventoried::ToSettle)]);
}

#[test]
fn each_failed_sign_in_shows_its_step_and_raises_a_notice() {
	let cases = [
		("cancelled", ConnectStep::Cancelled),
		("timedOut", ConnectStep::TimedOut),
		("flowTimedOut", ConnectStep::TimedOut),
		("refusedUrl", ConnectStep::LinkRefused),
	];
	for (kind, shown) in cases {
		let mut app = ready_app();
		connecting(&mut app);

		heard(&mut app, Answer::SignedIn { attempt: 1, outcome: Err(refused(kind)) });

		assert_eq!(connect_step(&app), Some(shown), "{kind}");
		assert_eq!(failure_titles(&app).len(), 1, "{kind}");
	}
}

#[test]
fn a_refused_sign_in_link_shows_the_cancelled_step() {
	let mut app = ready_app();
	connecting(&mut app);
	heard(&mut app, Answer::SignInStarted("https://claude.ai/oauth".to_owned()));

	onboarding(&mut app).refused("https://claude.ai/oauth", "no browser".to_owned());

	assert_eq!(connect_step(&app), Some(ConnectStep::Cancelled));
}

#[test]
fn a_restarted_sign_in_ignores_the_answer_of_the_one_it_replaced() {
	let mut app = ready_app();
	connecting(&mut app);

	connect_event(&mut app, ConnectEvent::ReopenSignIn);
	assert_eq!(drained(&mut app), vec![Call::CancelSignIn, Call::SignIn(3)]);

	heard(&mut app, Answer::SignedIn { attempt: 1, outcome: Err(refused("cancelled")) });

	assert!(failure_titles(&app).is_empty());
	assert_eq!(connect_step(&app), None);
}

#[test]
fn pasting_a_key_ends_the_sign_in_and_a_refused_key_shows_its_step() {
	let mut app = ready_app();
	connecting(&mut app);

	connect_event(&mut app, ConnectEvent::PasteKey);
	assert_eq!(connect_step(&app), Some(ConnectStep::KeyField));
	assert_eq!(drained(&mut app), vec![Call::CancelSignIn]);

	heard(&mut app, Answer::Cancelled(Err(refused("notRunning"))));
	assert_eq!(connect_step(&app), Some(ConnectStep::KeyField));

	onboarding(&mut app).sign_in.api_key = rune::TextEdit::new("sk-ant-1");
	connect_event(&mut app, ConnectEvent::SubmitKey);
	assert_eq!(drained(&mut app), vec![Call::HoldKey("sk-ant-1".to_owned())]);

	heard(&mut app, Answer::KeyHeld(Err(refused("invalidKey"))));
	assert_eq!(connect_step(&app), Some(ConnectStep::KeyRefused));
	assert_eq!(failure_titles(&app).len(), 1);

	connect_event(&mut app, ConnectEvent::TryAnotherKey);
	assert_eq!(connect_step(&app), Some(ConnectStep::KeyField));
	assert!(onboarding(&mut app).sign_in.api_key.text.is_empty());
}

#[test]
fn a_held_key_reads_the_claude_account_again() {
	let mut app = ready_app();

	heard(&mut app, Answer::KeyHeld(Ok(())));

	assert_eq!(drained(&mut app), vec![Call::ReadClaudeAccount]);
}

#[test]
fn settling_stores_the_import_step_only_when_claude_holds_something_to_import() {
	let absent = || serde_json::from_value(json!({ "kind": "absent" })).expect("absent reads");
	let refusal = || serde_json::from_value(json!({ "kind": "refused", "cause": "denied" }));
	let cases: [(Result<ClaudeInventory, HostError>, OnboardingStep, usize); 4] = [
		(Ok(found()), OnboardingStep::Import, 0),
		(Ok(refusal().expect("refused reads")), OnboardingStep::Import, 0),
		(Ok(absent()), OnboardingStep::Account, 0),
		(Err(refused("unreadableSources")), OnboardingStep::Account, 1),
	];
	for (inventory, stored, failures) in cases {
		let mut app = ready_app();

		heard(&mut app, Answer::Inventory { purpose: Inventoried::ToSettle, inventory });

		assert_eq!(drained(&mut app), vec![Call::StoreStep(stored)]);
		assert_eq!(failure_titles(&app).len(), failures);
	}
}

#[test]
fn a_settled_step_that_fails_to_store_gives_the_connect_screen_back() {
	let mut app = ready_app();
	let account = json!({ "email": "ada@example.com", "plan": "Pro" });
	heard(&mut app, Answer::ClaudeAccount(Ok(report(true, account, json!(null)))));
	connect_event(&mut app, ConnectEvent::UseAccount);
	heard(&mut app, Answer::Inventory { purpose: Inventoried::ToSettle, inventory: Ok(found()) });

	heard(
		&mut app,
		Answer::Stored {
			step: OnboardingStep::Import,
			outcome: Err(refused("databaseUnavailable")),
		},
	);

	assert_eq!(connect_step(&app), Some(ConnectStep::LoginFound));
	assert_eq!(failure_titles(&app).len(), 1);
}

#[test]
fn the_import_lists_the_inventory_and_imports_the_picked_items_with_a_status_per_row() {
	let mut app = ready_app();
	importing(&mut app);

	let shown = onboarding(&mut app).import.shown(Language::En);
	assert_eq!(shown.step, ImportStep::Select);
	let checked: Vec<(&str, bool, bool)> =
		shown.rows.iter().map(|row| (row.title.as_str(), row.checked, row.in_kiroshi)).collect();
	assert_eq!(
		checked,
		vec![
			("Atlas", true, false),
			("Wren", false, true),
			("CLAUDE.md", true, false),
			("tidy", true, false)
		]
	);

	import_event(&mut app, ImportEvent::Toggle { item: 2, checked: false });
	import_event(&mut app, ImportEvent::Primary);

	let keys = vec!["agent:atlas".to_owned(), "skill:tidy".to_owned()];
	assert_eq!(drained(&mut app), vec![Call::RunImport { keys, space_id: SPACE.to_owned() }]);
	assert_eq!(onboarding(&mut app).import.shown(Language::En).step, ImportStep::Importing);

	let outcomes = vec![
		outcome("agent:atlas", json!({ "kind": "imported", "id": "b1", "name": "Atlas" })),
		outcome("skill:tidy", json!({ "kind": "failed", "cause": "unparsable" })),
	];
	heard(&mut app, Answer::Imported(Ok(outcomes)));

	let shown = onboarding(&mut app).import.shown(Language::En);
	assert_eq!(shown.step, ImportStep::Done);
	let statuses: Vec<(&str, Option<ImportStatus>)> = shown
		.rows
		.iter()
		.filter(|row| row.checked)
		.map(|row| (row.title.as_str(), row.status))
		.collect();
	assert_eq!(
		statuses,
		vec![("Atlas", Some(ImportStatus::Done)), ("tidy", Some(ImportStatus::Failed))]
	);
	assert!(shown.secondary.is_some_and(|retry| retry.contains("tidy")));

	import_event(&mut app, ImportEvent::Secondary);

	let keys = vec!["skill:tidy".to_owned()];
	assert_eq!(drained(&mut app), vec![Call::RunImport { keys, space_id: SPACE.to_owned() }]);
}

#[test]
fn a_failed_import_raises_a_notice_and_gives_the_selection_back() {
	let mut app = ready_app();
	importing(&mut app);
	import_event(&mut app, ImportEvent::Primary);

	heard(&mut app, Answer::Imported(Err(refused("unreadableSources"))));

	assert_eq!(onboarding(&mut app).import.shown(Language::En).step, ImportStep::Select);
	assert_eq!(failure_titles(&app).len(), 1);
}

#[test]
fn leaving_the_import_marks_it_seen_once_and_stores_the_account_step() {
	let mut app = ready_app();
	importing(&mut app);

	import_event(&mut app, ImportEvent::Secondary);
	assert_eq!(
		drained(&mut app),
		vec![Call::MarkImportSeen, Call::StoreStep(OnboardingStep::Account)]
	);

	import_event(&mut app, ImportEvent::Secondary);
	assert_eq!(drained(&mut app), vec![Call::StoreStep(OnboardingStep::Account)]);

	heard(&mut app, Answer::ImportSeen(Err(refused("databaseUnavailable"))));
	assert_eq!(failure_titles(&app).len(), 1);
}

#[test]
fn an_unreadable_claude_folder_offers_to_read_it_again() {
	let mut app = ready_app();
	at(&mut app, Step::Import);

	heard(
		&mut app,
		Answer::Inventory { purpose: Inventoried::ToShow, inventory: Err(refused("unreadable")) },
	);
	assert_eq!(onboarding(&mut app).import.shown(Language::En).step, ImportStep::Unreadable);
	assert_eq!(failure_titles(&app).len(), 1);

	import_event(&mut app, ImportEvent::Primary);

	assert_eq!(drained(&mut app), vec![Call::ReadInventory(Inventoried::ToShow)]);
}

#[test]
fn signing_in_to_kiroshi_waits_on_the_browser_then_shows_the_account() {
	let mut app = ready_app();
	at(&mut app, Step::Account);

	account_event(&mut app, AccountEvent::SignIn);
	assert_eq!(drained(&mut app), vec![Call::KiroshiSignIn]);

	heard(&mut app, Answer::KiroshiCommanded { call: Call::KiroshiSignIn, outcome: Ok(()) });
	assert_eq!(drained(&mut app), vec![Call::ReadKiroshiAccount]);

	let waiting = KiroshiAccount::Waiting { verification_url: "https://kiroshi.app/x".to_owned() };
	heard(&mut app, Answer::KiroshiAccount(Ok(waiting)));
	assert_eq!(
		std::mem::take(&mut onboarding(&mut app).queued),
		vec![Call::Wake(super::ACCOUNT_WATCH, Due::AccountWatch)]
	);

	account_event(&mut app, AccountEvent::CopySignInLink);
	assert_eq!(
		onboarding(&mut app).effects,
		vec![Effect::Copy("https://kiroshi.app/x".to_owned())]
	);

	heard(&mut app, Answer::Due(Due::AccountWatch));
	assert_eq!(drained(&mut app), vec![Call::ReadKiroshiAccount]);

	let signed_in: KiroshiAccount = serde_json::from_value(
		json!({ "kind": "signedIn", "email": "ada@example.com", "plan": "pro" }),
	)
	.expect("the account reads");
	heard(&mut app, Answer::KiroshiAccount(Ok(signed_in)));
	assert!(matches!(onboarding(&mut app).account, Some(KiroshiAccount::SignedIn { .. })));
	assert!(drained(&mut app).is_empty());
}

#[test]
fn a_refused_kiroshi_sign_in_raises_a_notice_whose_retry_signs_in_again() {
	let mut app = ready_app();
	at(&mut app, Step::Account);

	heard(
		&mut app,
		Answer::KiroshiCommanded {
			call: Call::KiroshiSignIn,
			outcome: Err(refused("unreachable")),
		},
	);

	assert_eq!(
		failure_titles(&app),
		vec![settings::account::SIGN_IN_FAILED.text(Language::En).to_owned()]
	);
	closed(&mut app, SurfaceEvent::Act(0));
	assert_eq!(drained(&mut app), vec![Call::KiroshiSignIn]);
}

#[test]
fn skipping_the_account_stores_done_then_lands_on_a_space_with_an_agent() {
	let mut app = ready_app();
	at(&mut app, Step::Account);

	account_event(&mut app, AccountEvent::Skip);
	assert_eq!(drained(&mut app), vec![Call::StoreStep(OnboardingStep::Done)]);

	heard(
		&mut app,
		Answer::Stored { step: OnboardingStep::Done, outcome: Ok(preferences("done")) },
	);
	let land = Call::Land { bot_id: "shoto".to_owned(), space_id: SPACE.to_owned() };
	assert_eq!(drained(&mut app), vec![land.clone()]);

	let landed = ready(vec![conversation("solo-shoto", "shoto")]);
	heard(&mut app, Answer::Landed { call: land, landing: Ok(("solo-shoto".to_owned(), landed)) });

	assert!(route(&app) == Route::Conversations);
	assert!(app.thread.as_ref().is_some_and(|thread| thread.conversation_id == "solo-shoto"));
}

#[test]
fn a_failed_landing_names_the_agent_keeps_the_account_step_and_retries() {
	let mut app = ready_app();
	at(&mut app, Step::Account);
	let land = Call::Land { bot_id: "shoto".to_owned(), space_id: SPACE.to_owned() };

	heard(&mut app, Answer::Landed { call: land.clone(), landing: Err(refused("unknownBot")) });

	assert!(route(&app) == Route::Onboarding(Step::Account));
	assert_eq!(failure_titles(&app), vec!["Shoto couldn’t say hello".to_owned()]);
	closed(&mut app, SurfaceEvent::Act(0));
	assert_eq!(drained(&mut app), vec![land]);
}

#[test]
fn a_transient_notice_replaces_the_failure_on_screen_until_it_is_closed() {
	let mut app = ready_app();
	let state = onboarding(&mut app);

	state.fail_with("Couldn’t store".to_owned(), "disk".to_owned(), None);
	state.tell(NoticeKind::Info, settings::account::SIGN_IN_LINK_COPIED);
	raise_queued(&mut app);
	let told: Vec<(String, NoticeKind)> =
		shown(&app).into_iter().map(|notice| (notice.title.clone(), notice.kind)).collect();

	closed(&mut app, SurfaceEvent::Close(0));

	let copied = settings::account::SIGN_IN_LINK_COPIED.text(Language::En).to_owned();
	assert_eq!(told, vec![(copied, NoticeKind::Info)]);
	assert!(shown(&app).is_empty());
}
