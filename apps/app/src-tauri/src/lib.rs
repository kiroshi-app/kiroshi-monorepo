pub mod account;
pub mod agent;
pub mod applications;
pub mod attachments;
pub mod avatars;
pub mod bundles;
pub mod commands;
pub mod companions;
pub mod conversations;
pub mod crypto;
pub mod db;
mod descriptors;
pub mod devices;
pub mod environment;
pub mod events;
pub mod file_store;
pub mod host_api;
pub mod hosting;
pub mod invitations;
pub mod joined_spaces;
pub mod json;
pub mod logging;
pub mod mcp_oauth;
pub mod missions;
pub mod notifications;
pub mod plugins;
mod private_files;
#[cfg(test)]
mod removed_on_drop;
pub mod routines;
pub mod search;
pub mod sections;
pub mod spaces;
pub mod termination;
#[cfg(test)]
mod test_app;
pub mod updates;
pub mod user;
mod window_controls;

use tauri::{Manager, RunEvent};

use agent::commands::terminate_session;
use agent::AgentState;
use commands::builder;

pub fn run() {
	descriptors::raise_open_file_limit();
	tauri::Builder::default()
		.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			window_controls::raise_main(app);
		}))
		.plugin(tauri_plugin_deep_link::init())
		.plugin(
			tauri_plugin_window_state::Builder::default()
				.with_state_flags(
					tauri_plugin_window_state::StateFlags::SIZE
						| tauri_plugin_window_state::StateFlags::POSITION
						| tauri_plugin_window_state::StateFlags::MAXIMIZED,
				)
				.with_denylist(&[host_api::invoke::DISPATCHER_WEBVIEW])
				.build(),
		)
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_dialog::init())
		.manage(AgentState::default())
		.manage(companions::launch::LaunchOutcomeState::default())
		.manage(agent::sign_in::SignInState::default())
		.manage(mcp_oauth::commands::McpOauthState::default())
		.manage(mcp_oauth::reports::ApplicationReports::default())
		.manage(mcp_oauth::asking::AuthorizationAnswers::default())
		.manage(missions::commands::AnnouncedRunning::default())
		.manage(conversations::turn_run_deadline::TurnRunDeadlines::default())
		.manage(updates::Updates::default())
		.setup(|app| {
			if let Err(failure) = logging::install(app.handle()) {
				eprintln!("the log file could not be opened: {failure}");
			}
			app.manage(db::bootstrap(app.handle()));
			app.manage(crypto::commands::load(app.handle()));
			app.manage(crypto::commands::space_keys(app.handle()));
			if !window_controls::is_headless(std::env::args()) {
				window_controls::open_main(app.handle());
			}
			joined_spaces::deep_link::install(app.handle());
			app.manage(routines::sentinel::spawn(app.handle().clone()));
			app.manage(routines::webhook::start(app.handle().clone()));
			app.manage(missions::credentials::Credentials::of_this_computer());
			app.manage(missions::github::spawn(app.handle().clone()));
			app.manage(applications::directory::spawn(app.handle().clone()));
			app.manage(account::session::AccountSession::new(
				environment::commands::writable_root(app.handle()),
				&account::cloud::api_url(),
			));
			app.manage(hosting::Hosting::new(
				&account::cloud::api_url(),
				hosting::local_api(app.handle()),
			));
			app.manage(invitations::Invitations::new(&account::cloud::api_url()));
			app.manage(devices::Devices::new(&account::cloud::api_url()));
			app.manage(joined_spaces::relay::RelayGuests::new(&account::cloud::api_url()));
			tauri::async_runtime::spawn(account::session::restore(app.handle().clone()));
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				conversations::commands::list_bundles_at_launch(&handle).await;
			});
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				missions::commands::install_hooks_at_launch(&handle).await;
			});
			tauri::async_runtime::spawn(termination::exited_on_termination(app.handle().clone()));
			Ok(())
		})
		.invoke_handler(builder().invoke_handler())
		.build(tauri::generate_context!())
		.expect("error while building tauri application")
		.run(|app, event| match event {
			RunEvent::ExitRequested { code: None, api, .. } => api.prevent_exit(),
			#[cfg(target_os = "macos")]
			RunEvent::Reopen { .. } => window_controls::raise_main(app),
			RunEvent::Exit => {
				if let Some(sentinel) = app.try_state::<routines::sentinel::Sentinel>() {
					sentinel.stop();
				}
				if let Some(webhook) = app.try_state::<routines::webhook::Webhook>() {
					webhook.stop();
				}
				if let Some(poller) = app.try_state::<missions::github::Poller>() {
					poller.stop();
				}
				if let Some(directory) =
					app.try_state::<std::sync::Arc<applications::directory::Directory>>()
				{
					directory.stop();
				}
				tauri::async_runtime::block_on(terminate_session(
					app.state::<AgentState>().inner(),
				));
			}
			_ => {}
		})
}
