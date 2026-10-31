mod common;

use std::path::{Path, PathBuf};

use common::{an_app_of_its_own, AppOfItsOwn};
use kiroshi_app::commands::invoke_handler;
use kiroshi_app::db;
use serde_json::{json, Value};
use tauri::test::{mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY};
use tauri::webview::InvokeRequest;
use tauri::{App, Manager, WebviewWindow, WebviewWindowBuilder};

const BOT: &str = "default";

struct Home(AppOfItsOwn);

impl Home {
	fn new() -> Self {
		Self(an_app_of_its_own("user-commands", mock_builder()))
	}

	fn app(&self) -> App<MockRuntime> {
		let app = host(&self.0.config().identifier);
		app.manage(db::bootstrap(app.handle()));
		app
	}
}

fn host(identifier: &str) -> App<MockRuntime> {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = identifier.into();
	mock_builder().invoke_handler(invoke_handler()).build(context).expect("app builds")
}

fn app_without_a_database() -> AppOfItsOwn {
	an_app_of_its_own(
		"user-commands-no-database",
		mock_builder()
			.invoke_handler(invoke_handler())
			.manage(db::DatabaseState::Err(db::DatabaseError::AppDataDir)),
	)
}

fn window(app: &App<MockRuntime>) -> WebviewWindow<MockRuntime> {
	WebviewWindowBuilder::new(app, "main", Default::default()).build().expect("window builds")
}

fn call(window: &WebviewWindow<MockRuntime>, cmd: &str, body: Value) -> Result<Value, Value> {
	tauri::test::get_ipc_response(
		window,
		InvokeRequest {
			cmd: cmd.into(),
			callback: tauri::ipc::CallbackFn(0),
			error: tauri::ipc::CallbackFn(1),
			url: "tauri://localhost".parse().expect("url"),
			body: body.into(),
			headers: Default::default(),
			invoke_key: INVOKE_KEY.to_string(),
		},
	)
	.map(|response| response.deserialize::<Value>().unwrap_or(Value::Null))
	.map_err(|error| serde_json::to_value(error).unwrap_or(Value::Null))
}

fn avatar_dir(app: &App<MockRuntime>) -> PathBuf {
	app.path().app_data_dir().expect("data dir").join("avatars")
}

fn stored_avatars(app: &App<MockRuntime>) -> Vec<String> {
	let Ok(entries) = std::fs::read_dir(avatar_dir(app)) else {
		return Vec::new();
	};
	let mut names: Vec<String> =
		entries.flatten().map(|entry| entry.file_name().to_string_lossy().into_owned()).collect();
	names.sort();
	names
}

fn a_png(width: u32, height: u32) -> Vec<u8> {
	let mut canvas = image::RgbImage::new(width, height);
	for (x, y, pixel) in canvas.enumerate_pixels_mut() {
		*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 64]);
	}
	let mut encoded = std::io::Cursor::new(Vec::new());
	image::DynamicImage::ImageRgb8(canvas)
		.write_to(&mut encoded, image::ImageFormat::Png)
		.expect("the fixture encodes");
	encoded.into_inner()
}

fn a_record(picture: Value) -> Value {
	json!({
		"displayName": "Nyx",
		"profilePicturePath": picture,
		"colorScheme": "dark",
		"language": "fr",
		"notifyOnQuestion": false,
		"notifyOnPermission": true,
		"notifyOnFinishedTurn": false,
		"notifyWithSound": false,
		"sidebarWidth": 320,
		"sidebarTab": "companions",
		"activityPanelOpen": true,
		"firstRunDone": true,
		"lastSpaceId": "space-one",
		"lastBotIdBySpace": { "space-one": "bot-one", "space-two": "bot-two" },
		"updateChannel": "stable",
		"showWhatsNew": false,
		"lastSeenVersion": "0.24.1",
		"onboardingStep": "done",
		"onboardingImportSeen": false,
		"onboardingShotoId": null,
		"onboardingFirstCompanionId": null,
	})
}

fn read(window: &WebviewWindow<MockRuntime>) -> Value {
	call(window, "user_preferences", json!({})).expect("the record")
}

fn a_stored_picture(window: &WebviewWindow<MockRuntime>) -> String {
	call(window, "user_set_profile_picture", json!({ "bytes": a_png(60, 24) }))
		.expect("the picture is stored")["profilePicturePath"]
		.as_str()
		.expect("a path crossed")
		.to_owned()
}

fn a_bot_wearing_a_picture(window: &WebviewWindow<MockRuntime>) -> String {
	call(window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	call(window, "conversation_set_bot_avatar_image", json!({ "id": BOT, "bytes": a_png(30, 30) }))
		.expect("the bot's picture is stored")["avatarImagePath"]
		.as_str()
		.expect("a path")
		.to_owned()
}

#[test]
fn a_host_without_a_database_answers_every_preferences_command_with_why_there_is_none() {
	let app = app_without_a_database();
	let window = window(&app);
	let unavailable = Err(json!({ "kind": "unavailable", "failure": { "kind": "appDataDir" } }));

	assert_eq!(call(&window, "user_preferences", json!({})), unavailable);
	assert_eq!(
		call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) })),
		unavailable
	);
	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": a_png(24, 24) })),
		unavailable
	);
	assert_eq!(
		call(&window, "user_set_onboarding_step", json!({ "step": "connect" })),
		unavailable
	);
	assert_eq!(call(&window, "user_replay_onboarding", json!({})), unavailable);
	assert_eq!(call(&window, "user_mark_onboarding_import_seen", json!({})), unavailable);
	assert_eq!(
		call(&window, "user_set_onboarding_first_companion", json!({ "botId": BOT })),
		unavailable
	);
}

#[test]
fn a_record_nobody_has_written_crosses_as_the_defaults() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert_eq!(
		read(&window),
		json!({
			"displayName": "",
			"profilePicturePath": null,
			"colorScheme": "system",
			"language": null,
			"notifyOnQuestion": true,
			"notifyOnPermission": true,
			"notifyOnFinishedTurn": true,
			"notifyWithSound": true,
			"sidebarWidth": null,
			"sidebarTab": "conversations",
			"activityPanelOpen": false,
			"firstRunDone": false,
			"lastSpaceId": null,
			"lastBotIdBySpace": {},
			"updateChannel": "stable",
			"showWhatsNew": true,
			"lastSeenVersion": null,
			"onboardingStep": "welcome",
			"onboardingImportSeen": false,
			"onboardingShotoId": null,
			"onboardingFirstCompanionId": null,
		})
	);
}

#[test]
fn a_written_record_is_answered_and_read_back_whole() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let answered =
		call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
			.expect("the record is stored");

	assert_eq!(answered, a_record(Value::Null));
	assert_eq!(read(&window), a_record(Value::Null));
}

#[test]
fn a_rename_on_a_host_without_an_account_session_is_answered() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
		.expect("the record is stored");
	let mut renamed = a_record(Value::Null);
	renamed["displayName"] = json!("Grace");

	let answered = call(&window, "user_set_preferences", json!({ "preferences": renamed.clone() }))
		.expect("the renamed record is stored");

	assert_eq!(answered, renamed);
	assert_eq!(read(&window), renamed);
}

#[test]
fn a_scheme_outside_the_vocabulary_never_reaches_the_record() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut sepia = a_record(Value::Null);
	sepia["colorScheme"] = json!("sepia");

	assert!(
		call(&window, "user_set_preferences", json!({ "preferences": sepia })).is_err(),
		"a scheme this build cannot paint was accepted"
	);
	assert_eq!(read(&window)["colorScheme"], json!("system"));
}

#[test]
fn a_record_sent_without_a_tab_is_stored_on_conversations() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mut older = a_record(Value::Null);
	older.as_object_mut().expect("a record").remove("sidebarTab");

	let answered = call(&window, "user_set_preferences", json!({ "preferences": older }))
		.expect("the record is stored");

	assert_eq!(answered["sidebarTab"], json!("conversations"));
	assert_eq!(read(&window)["sidebarTab"], json!("conversations"));
}

#[test]
fn an_uploaded_picture_is_stored_squared_and_crosses_as_a_path() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	let recorded = a_stored_picture(&window);

	assert_eq!(
		Path::new(&recorded).parent(),
		Some(avatar_dir(&app).as_path()),
		"a picture was stored outside the directory the asset scope covers"
	);
	assert_eq!(Path::new(&recorded).extension().and_then(|it| it.to_str()), Some("png"));
	let stored = image::load_from_memory_with_format(
		&std::fs::read(&recorded).expect("the stored file is readable"),
		image::ImageFormat::Png,
	)
	.expect("the stored file decodes as png");
	assert_eq!(image::GenericImageView::dimensions(&stored), (512, 512));
	assert_eq!(read(&window)["profilePicturePath"], json!(recorded));
}

#[test]
fn a_bot_write_leaves_the_record_its_own_picture() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let mine = a_stored_picture(&window);

	call(
		&window,
		"conversation_create_bot",
		json!({ "identity": {
			"name": "Ada",
			"title": "",
			"model": "sonnet",
			"avatarBlot": null,
			"avatarImagePath": null,
			"instructions": "",
			"deniedTools": [],
		} }),
	)
	.expect("the bot is created");

	assert!(Path::new(&mine).exists(), "a bot write swept the record's own picture away");
	assert!(Path::new(&worn).exists(), "a bot write swept another bot's picture away");
	assert_eq!(read(&window)["profilePicturePath"], json!(mine));
	assert_eq!(stored_avatars(&app).len(), 2);
}

#[test]
fn replacing_the_picture_leaves_one_file_behind_and_spares_the_bots() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let first = a_stored_picture(&window);

	let second = a_stored_picture(&window);

	assert_ne!(first, second, "a replacement was written over the file it replaced");
	assert!(!Path::new(&first).exists(), "the replaced picture stayed behind");
	assert!(Path::new(&second).exists(), "the replacement is not there");
	assert!(Path::new(&worn).exists(), "the bot lost its picture to the record's write");
	assert_eq!(stored_avatars(&app).len(), 2);
}

#[test]
fn a_record_written_without_a_picture_takes_the_file_with_it() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let worn = a_bot_wearing_a_picture(&window);
	let mine = a_stored_picture(&window);

	call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
		.expect("the record is stored");

	assert_eq!(read(&window)["profilePicturePath"], json!(null));
	assert!(!Path::new(&mine).exists(), "a picture taken off the record stayed on the disk");
	assert!(Path::new(&worn).exists(), "the bot lost its picture to the record's write");
}

#[test]
fn a_record_written_with_the_path_it_was_handed_keeps_its_picture() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let mine = a_stored_picture(&window);

	let answered =
		call(&window, "user_set_preferences", json!({ "preferences": a_record(json!(mine)) }))
			.expect("the record is stored");

	assert_eq!(answered["profilePicturePath"], json!(mine));
	assert!(Path::new(&mine).exists(), "an echoed path lost the file it named");
}

#[test]
fn a_picture_the_host_refuses_leaves_the_record_on_the_one_it_held() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let held = a_stored_picture(&window);

	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": b"GIF89a\0\0\0\0\0\0" })),
		Err(json!({ "kind": "rejectedProfilePicture", "reason": { "kind": "unknownFormat" } })),
		"a format this build cannot decode was accepted"
	);
	let limit = 5 * 1024 * 1024;
	assert_eq!(
		call(&window, "user_set_profile_picture", json!({ "bytes": vec![0u8; limit + 1] })),
		Err(json!({
			"kind": "rejectedProfilePicture",
			"reason": { "kind": "tooLarge", "bytes": limit + 1, "limit": limit }
		}))
	);
	let torn = call(&window, "user_set_profile_picture", json!({ "bytes": a_png(40, 40)[..24] }));
	assert!(
		matches!(&torn, Err(refusal) if refusal["kind"] == json!("rejectedProfilePicture")
			&& refusal["reason"]["kind"] == json!("undecodable")),
		"bytes that claimed a format and were not one crossed as something else: {torn:?}"
	);

	assert_eq!(read(&window)["profilePicturePath"], json!(held), "a refusal moved the record");
	assert!(Path::new(&held).exists(), "a refusal took the picture the record held");
	assert_eq!(stored_avatars(&app).len(), 1, "a refused picture reached the disk");
}

#[test]
fn a_set_onboarding_step_is_answered_and_read_back_after_the_host_reopens() {
	let home = Home::new();
	{
		let app = home.app();
		let window = window(&app);

		let answered = call(&window, "user_set_onboarding_step", json!({ "step": "account" }))
			.expect("the step is stored");

		assert_eq!(answered["onboardingStep"], json!("account"));
		assert_eq!(read(&window)["onboardingStep"], json!("account"));
	}

	let app = home.app();
	let window = window(&app);

	assert_eq!(read(&window)["onboardingStep"], json!("account"));
}

#[test]
fn a_step_outside_the_vocabulary_never_reaches_the_record() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);

	assert!(
		call(&window, "user_set_onboarding_step", json!({ "step": "tour" })).is_err(),
		"a step this build does not know was accepted"
	);
	assert_eq!(read(&window)["onboardingStep"], json!("welcome"));
}

#[test]
fn a_replayed_onboarding_starts_on_welcome_reopens_the_first_run_and_keeps_the_import_mark() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	call(&window, "user_set_preferences", json!({ "preferences": a_record(Value::Null) }))
		.expect("the record is stored");
	call(&window, "user_mark_onboarding_import_seen", json!({})).expect("the import is marked");

	let answered = call(&window, "user_replay_onboarding", json!({})).expect("the replay");

	assert_eq!(answered["onboardingStep"], json!("welcome"));
	assert_eq!(answered["firstRunDone"], json!(false));
	assert_eq!(answered["onboardingImportSeen"], json!(true));
	assert_eq!(read(&window), answered);
}

#[test]
fn a_marked_import_is_answered_seen_and_read_back_after_the_host_reopens() {
	let home = Home::new();
	{
		let app = home.app();
		let window = window(&app);

		let answered = call(&window, "user_mark_onboarding_import_seen", json!({}))
			.expect("the import is marked");

		assert_eq!(answered["onboardingImportSeen"], json!(true));
	}

	let app = home.app();
	let window = window(&app);

	assert_eq!(read(&window)["onboardingImportSeen"], json!(true));
}

#[test]
fn a_written_record_leaves_the_onboarding_step_and_the_import_mark_as_stored() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	call(&window, "user_set_onboarding_step", json!({ "step": "connect" })).expect("the step");
	let mut claiming = a_record(Value::Null);
	claiming["onboardingStep"] = json!("done");
	claiming["onboardingImportSeen"] = json!(true);

	let answered = call(&window, "user_set_preferences", json!({ "preferences": claiming }))
		.expect("the record is stored");

	assert_eq!(answered["onboardingStep"], json!("connect"));
	assert_eq!(answered["onboardingImportSeen"], json!(false));
	assert_eq!(read(&window), answered);
}

#[test]
fn a_first_companion_set_by_hand_is_answered_and_read_back_after_the_host_reopens() {
	let home = Home::new();
	{
		let app = home.app();
		let window = window(&app);
		call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");

		let answered =
			call(&window, "user_set_onboarding_first_companion", json!({ "botId": BOT }))
				.expect("the first companion is stored");

		assert_eq!(answered["onboardingFirstCompanionId"], json!(BOT));
	}

	let app = home.app();
	let window = window(&app);

	assert_eq!(read(&window)["onboardingFirstCompanionId"], json!(BOT));
}

#[test]
fn a_first_companion_naming_no_bot_is_refused_and_leaves_the_record_as_it_was() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	let before = read(&window);

	assert_eq!(
		call(&window, "user_set_onboarding_first_companion", json!({ "botId": "ghost" })),
		Err(json!({ "kind": "unknownBot", "id": "ghost" }))
	);
	assert_eq!(read(&window), before);
}

#[test]
fn a_replayed_onboarding_forgets_the_first_companion() {
	let home = Home::new();
	let app = home.app();
	let window = window(&app);
	call(&window, "conversation_main_chat", json!({ "botId": BOT })).expect("the chat");
	call(&window, "user_set_onboarding_first_companion", json!({ "botId": BOT }))
		.expect("the first companion is stored");

	let answered = call(&window, "user_replay_onboarding", json!({})).expect("the replay");

	assert_eq!(answered["onboardingStep"], json!("welcome"));
	assert_eq!(answered["onboardingFirstCompanionId"], Value::Null);
	assert_eq!(read(&window), answered);
}
