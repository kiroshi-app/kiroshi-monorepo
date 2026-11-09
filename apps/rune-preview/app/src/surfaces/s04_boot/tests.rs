use kiroshi_core::user::contract::{OnboardingStep, UserPreferences};
use serde_json::json;

use kiroshi_rune_kit::surfaces::s04_boot::account::AccountEvent;
use kiroshi_rune_kit::surfaces::s04_boot::connect::{ConnectEvent, ConnectStep};
use kiroshi_rune_kit::surfaces::s04_boot::device_approval::ApprovalStatus;
use kiroshi_rune_kit::surfaces::s04_boot::import::{ImportEvent, ImportStatus, ImportStep};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{NoticeEvent, NoticeKind, SurfaceEvent};
use kiroshi_rune_kit::surfaces::s04_boot::welcome::{WelcomeEvent, WelcomeStep};

use super::calls::{Answer, Call, ClaudeReport, Due, ImportOutcome, Inventoried, KiroshiAccount};
use super::connect::initials_of;
use super::*;
use crate::app::notice::{closed, shown};
use crate::app::{Ready, Workspace};
use crate::host::Host;
use crate::model::{Agent, ClaudeInventory, Conversation, Space};
use kiroshi_rune_kit::tokens::Tokens;

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

	assert_eq!(
		drained(&mut app),
		vec![Call::ReadPreferences, Call::ReadDeviceApproval, Call::ReadKiroshiAccount]
	);
}

#[test]
fn a_launch_past_the_boot_step_reads_no_onboarding_step() {
	let mut app = ready_app();
	app.navigation.navigate_main(Route::Conversations);

	booted(&mut app);

	assert_eq!(drained(&mut app), vec![Call::ReadDeviceApproval, Call::ReadKiroshiAccount]);
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
	assert_eq!(drained(&mut app), vec![Call::ReadKiroshiAccount, Call::ReadDeviceApproval]);

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

fn told_lifetime(app: &mut App) -> (Duration, u64) {
	let state = onboarding(app);
	state.tell(NoticeKind::Info, settings::account::SIGN_IN_LINK_COPIED);
	let lifetime = state.queued.iter().rev().find_map(|call| match call {
		Call::Wake(after, Due::Notice(id)) => Some((*after, *id)),
		_ => None,
	});
	raise_queued(app);
	lifetime.expect("the told notice is timed")
}

#[test]
fn a_told_notice_closes_itself_five_seconds_later() {
	let mut app = ready_app();
	let (after, id) = told_lifetime(&mut app);
	let told = shown(&app).len();

	heard(&mut app, Answer::Due(Due::Notice(id)));

	assert_eq!(after, Duration::from_secs(5));
	assert_eq!(told, 1);
	assert!(shown(&app).is_empty());
}

#[test]
fn an_earlier_lifetime_leaves_a_newer_told_notice_and_a_failure_on_screen() {
	let mut app = ready_app();
	let (_, first) = told_lifetime(&mut app);
	let (_, second) = told_lifetime(&mut app);

	heard(&mut app, Answer::Due(Due::Notice(first)));
	let after_first = shown(&app).len();
	onboarding(&mut app).fail_with("Couldn’t store".to_owned(), "disk".to_owned(), None);
	raise_queued(&mut app);
	heard(&mut app, Answer::Due(Due::Notice(second)));

	assert_eq!(after_first, 1);
	assert_eq!(failure_titles(&app), vec!["Couldn’t store".to_owned()]);
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

fn device_approval(kind: &str) -> Answer {
	let outcome =
		serde_json::from_value(json!({ "kind": kind, "expiresAt": "2099-01-01T00:00:00Z" }))
			.expect("the approval reads");
	Answer::DeviceApproval { call: Call::ReadDeviceApproval, outcome: Ok(outcome) }
}

fn signed_in_as(email: &str) -> Answer {
	let account = json!({ "kind": "signedIn", "email": email, "plan": null });
	Answer::KiroshiAccount(Ok(serde_json::from_value(account).expect("the account reads")))
}

fn info_titles(app: &App) -> Vec<String> {
	shown(app)
		.into_iter()
		.filter(|notice| notice.kind == NoticeKind::Info)
		.map(|notice| notice.title.clone())
		.collect()
}

fn typed(app: &mut App, text: &str) -> bool {
	let event = KeyEvent { key: Typed::Text(text.to_owned()), mods: Default::default() };
	key_pressed(app, &event)
}

#[test]
fn a_pending_device_shows_the_new_device_screen_with_the_signed_in_email() {
	let mut app = ready_app();
	app.navigation.navigate_main(Route::Conversations);

	heard(&mut app, signed_in_as("ada@example.com"));
	heard(&mut app, device_approval("pending"));

	assert_eq!(new_device_step(&app), Some(NewDeviceStep::Waiting));
	assert_eq!(app.surfaces.s04_boot.devices.email(), "ada@example.com");
	assert!(new_device(&app, &Tokens::new(false)).is_some());

	heard(&mut app, device_approval("approved"));

	assert_eq!(new_device_step(&app), None);
	assert!(drained(&mut app).contains(&Call::ReadDevices));
}

#[test]
fn the_code_step_reads_digits_typed_anywhere_and_submits_them() {
	let mut app = ready_app();
	heard(&mut app, signed_in_as("ada@example.com"));
	heard(&mut app, device_approval("pending"));
	drained(&mut app);

	assert!(!typed(&mut app, "1"));
	new_device_event(&mut app, NewDeviceEvent::UseCode);
	assert_eq!(drained(&mut app), vec![Call::RequestDeviceCode]);
	assert_eq!(new_device_step(&app), Some(NewDeviceStep::Code));

	for digit in ["4", "2", "x", "0", "9", "1", "7"] {
		typed(&mut app, digit);
	}
	assert_eq!(app.surfaces.s04_boot.devices.code, "420917");
	new_device_event(&mut app, NewDeviceEvent::ApproveWithCode);

	let submitted = Call::SubmitDeviceCode("420917".to_owned());
	assert_eq!(drained(&mut app), vec![submitted.clone()]);
	heard(&mut app, Answer::DeviceCommanded { call: submitted, outcome: Ok(()) });
	assert_eq!(drained(&mut app), vec![Call::ReadDeviceApproval]);
}

#[test]
fn each_failed_device_call_raises_a_notice_and_keeps_the_screen() {
	let mut app = ready_app();
	heard(&mut app, signed_in_as("ada@example.com"));
	heard(&mut app, device_approval("expired"));
	assert_eq!(new_device_step(&app), Some(NewDeviceStep::Expired));

	let retried = Answer::DeviceApproval {
		call: Call::RetryDeviceApproval,
		outcome: Err(refused("unreachable")),
	};
	heard(&mut app, retried);
	assert_eq!(failure_titles(&app), vec!["Couldn’t reach Kiroshi".to_owned()]);
	assert_eq!(new_device_step(&app), Some(NewDeviceStep::Expired));

	let submitted = Call::SubmitDeviceCode("000000".to_owned());
	heard(
		&mut app,
		Answer::DeviceCommanded { call: submitted, outcome: Err(refused("codeInvalid")) },
	);
	assert_eq!(failure_titles(&app), vec![UNSENT.text(LANGUAGE).to_owned()]);

	let read = Answer::DeviceApproval {
		call: Call::ReadDeviceApproval,
		outcome: Err(refused("unreachable")),
	};
	heard(&mut app, read);
	assert_eq!(
		failure_titles(&app),
		vec![settings::account::READ_FAILED.text(LANGUAGE).to_owned()]
	);
}

#[test]
fn a_refused_device_shows_the_rejected_step_and_goes_back_to_sign_in() {
	let mut app = ready_app();
	let refused_account = json!({ "kind": "signedOut", "reason": "deviceRefused" });
	heard(
		&mut app,
		Answer::KiroshiAccount(Ok(serde_json::from_value(refused_account).expect("reads"))),
	);

	assert_eq!(new_device_step(&app), Some(NewDeviceStep::Rejected));

	new_device_event(&mut app, NewDeviceEvent::BackToSignIn);
	assert_eq!(drained(&mut app), vec![Call::KiroshiSignIn]);
}

fn asking_device(id: &str) -> serde_json::Value {
	json!({
		"id": id,
		"name": "Ada’s iPhone",
		"kind": "phone",
		"status": "pending",
		"approvalExpiresAt": "2099-01-01T00:00:00Z",
		"lastActiveAt": "2026-11-09T12:00:00Z",
		"current": false,
		"fingerprint": null,
	})
}

fn asked_status(app: &App) -> Option<ApprovalStatus> {
	let devices = &app.surfaces.s04_boot.devices;
	devices.asked().map(|asked| devices.status_of(asked))
}

#[test]
fn an_asking_device_opens_the_approval_dialog_until_its_answer_settles() {
	let mut app = ready_app();
	let listed = serde_json::from_value(json!([asking_device("d1")])).expect("the list reads");
	heard(&mut app, Answer::Devices(Ok(listed)));

	assert_eq!(asked_status(&app), Some(ApprovalStatus::Asking));
	assert!(layers(&app, &Tokens::new(false)).is_some());

	approval_event(&mut app, ApprovalEvent::Approve);
	assert_eq!(drained(&mut app), vec![Call::ApproveDevice("d1".to_owned())]);
	assert_eq!(asked_status(&app), Some(ApprovalStatus::Approving));

	let approved = Call::ApproveDevice("d1".to_owned());
	heard(
		&mut app,
		Answer::DeviceAnswered { call: approved.clone(), outcome: Err(refused("unreachable")) },
	);
	assert_eq!(asked_status(&app), Some(ApprovalStatus::Failed));

	approval_event(&mut app, ApprovalEvent::Approve);
	heard(&mut app, Answer::DeviceAnswered { call: approved, outcome: Ok(()) });

	assert_eq!(asked_status(&app), None);
	assert!(layers(&app, &Tokens::new(false)).is_none());
	assert_eq!(info_titles(&app), vec!["Ada’s iPhone is approved".to_owned()]);
}

#[test]
fn a_refusal_that_fails_raises_a_notice_and_keeps_the_dialog() {
	let mut app = ready_app();
	let listed = serde_json::from_value(json!([asking_device("d1")])).expect("the list reads");
	heard(&mut app, Answer::Devices(Ok(listed)));

	approval_event(&mut app, ApprovalEvent::Reject);
	let refusal = Call::RefuseDevice("d1".to_owned());
	assert_eq!(drained(&mut app), vec![refusal.clone()]);
	heard(
		&mut app,
		Answer::DeviceAnswered { call: refusal.clone(), outcome: Err(refused("notFound")) },
	);

	assert_eq!(asked_status(&app), Some(ApprovalStatus::Asking));
	assert_eq!(failure_titles(&app).len(), 1);

	heard(&mut app, Answer::DeviceAnswered { call: refusal, outcome: Ok(()) });
	assert_eq!(asked_status(&app), None);
	assert_eq!(info_titles(&app), vec!["Ada’s iPhone was signed out".to_owned()]);
}

#[test]
fn an_unreadable_device_list_raises_a_notice_that_reads_it_again() {
	let mut app = ready_app();
	heard(&mut app, Answer::Devices(Err(refused("unreachable"))));

	assert_eq!(
		failure_titles(&app),
		vec![settings::account::READ_FAILED.text(LANGUAGE).to_owned()]
	);
	assert!(layers(&app, &Tokens::new(false)).is_none());
}

fn import_found(items: Vec<serde_json::Value>, claude_md: serde_json::Value) -> ClaudeInventory {
	let (agents, skills): (Vec<_>, Vec<_>) = items
		.into_iter()
		.partition(|item| item["key"].as_str().is_some_and(|key| key.starts_with("agent:")));
	serde_json::from_value(
		json!({ "kind": "found", "agents": agents, "skills": skills, "claudeMd": claude_md }),
	)
	.expect("the inventory reads")
}

type ShownRow = (String, Option<ImportStatus>);

fn imported_rows(session: &import::Session) -> (ImportStep, Vec<ShownRow>, Option<String>) {
	let shown = session.shown(Language::En);
	let rows = shown
		.rows
		.iter()
		.filter(|row| row.checked && !row.in_kiroshi)
		.map(|row| (row.title.clone(), row.status))
		.collect();
	(shown.step, rows, shown.secondary)
}

fn session_of(inventory: ClaudeInventory, unchecked: &[usize]) -> import::Session {
	let mut session = import::Session::default();
	session.read(Some(inventory));
	for item in unchecked {
		session.event(ImportEvent::Toggle { item: *item, checked: false });
	}
	session
}

fn imported(key: &str) -> ImportOutcome {
	let name = match key {
		"agent:atlas" => "Atlas",
		"agent:wren" => "Wren",
		"claude-md" => "CLAUDE.md",
		_ => "tidy",
	};
	outcome(key, json!({ "kind": "imported", "name": name }))
}

#[test]
fn the_import_shows_only_the_picked_items_while_it_runs() {
	let inventory = import_found(
		vec![
			item("agent:atlas", "Atlas", false),
			item("agent:wren", "Wren", false),
			item("skill:tidy", "tidy", false),
		],
		item("claude-md", "CLAUDE.md", true),
	);
	let mut session = session_of(inventory, &[1]);

	session.event(ImportEvent::Primary);

	let (step, rows, _) = imported_rows(&session);
	assert_eq!(step, ImportStep::Importing);
	assert_eq!(rows, vec![("Atlas".to_owned(), None), ("tidy".to_owned(), None)]);
}

#[test]
fn each_finished_import_shows_its_done_or_partly_failed_state() {
	let failed = |key: &str| outcome(key, json!({ "kind": "failed", "cause": "unparsable" }));
	let three = || {
		vec![
			item("agent:atlas", "Atlas", false),
			item("agent:wren", "Wren", false),
			item("skill:tidy", "tidy", false),
		]
	};
	let claude_md = || item("claude-md", "CLAUDE.md", false);
	let cases = [
		(
			"done one companion",
			import_found(three(), claude_md()),
			vec![1],
			vec![imported("agent:atlas"), imported("claude-md"), imported("skill:tidy")],
			vec![
				("Atlas", ImportStatus::Done),
				("CLAUDE.md", ImportStatus::Done),
				("tidy", ImportStatus::Done),
			],
			None,
		),
		(
			"done without instructions",
			import_found(three(), serde_json::Value::Null),
			vec![],
			vec![imported("agent:atlas"), imported("agent:wren"), imported("skill:tidy")],
			vec![
				("Atlas", ImportStatus::Done),
				("Wren", ImportStatus::Done),
				("tidy", ImportStatus::Done),
			],
			None,
		),
		(
			"partly failed companion",
			import_found(three(), claude_md()),
			vec![],
			vec![
				imported("agent:atlas"),
				failed("agent:wren"),
				imported("claude-md"),
				imported("skill:tidy"),
			],
			vec![
				("Atlas", ImportStatus::Done),
				("Wren", ImportStatus::Failed),
				("CLAUDE.md", ImportStatus::Done),
				("tidy", ImportStatus::Done),
			],
			Some("Wren"),
		),
		(
			"partly failed instructions",
			import_found(three(), claude_md()),
			vec![],
			vec![
				imported("agent:atlas"),
				imported("agent:wren"),
				failed("claude-md"),
				imported("skill:tidy"),
			],
			vec![
				("Atlas", ImportStatus::Done),
				("Wren", ImportStatus::Done),
				("CLAUDE.md", ImportStatus::Failed),
				("tidy", ImportStatus::Done),
			],
			Some("CLAUDE.md"),
		),
	];
	for (name, inventory, unchecked, outcomes, rows, retried) in cases {
		let mut session = session_of(inventory, &unchecked);
		session.event(ImportEvent::Primary);
		session.imported(Some(outcomes));

		let (step, shown, secondary) = imported_rows(&session);
		let rows: Vec<ShownRow> =
			rows.into_iter().map(|(title, status)| (title.to_owned(), Some(status))).collect();
		assert_eq!(step, ImportStep::Done, "{name}");
		assert_eq!(shown, rows, "{name}");
		assert_eq!(secondary.is_some(), retried.is_some(), "{name}");
		if let (Some(secondary), Some(retried)) = (secondary, retried) {
			assert!(secondary.contains(retried), "{name}: {secondary}");
		}
	}
}
