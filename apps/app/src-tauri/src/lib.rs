pub mod account;
pub mod agent;
pub mod applications;
pub mod attachments;
pub use kiroshi_core::avatars;
pub mod badge;
pub use kiroshi_core::board;
pub mod bundles;
pub mod claude_import;
pub mod commands;
pub mod companions;
pub mod conversations;
pub use kiroshi_core::core_context;
pub mod crypto;
pub use kiroshi_core::db;
pub use kiroshi_core::descriptors;
pub mod devices;
pub mod environment;
pub mod events;
#[cfg(all(test, unix))]
mod executable_script;
pub use kiroshi_core::file_store;
pub mod host_api;
pub mod hosting;
pub mod invitations;
pub mod joined_spaces;
pub use kiroshi_core::json;
pub mod library;
pub mod logging;
pub mod mcp_oauth;
#[cfg(any(target_os = "macos", test))]
mod menu;
mod menu_contract;
pub mod missions;
pub mod notifications;
pub mod plugins;
pub use kiroshi_core::private_files;
pub mod remote_image;
pub use kiroshi_core::removed_on_drop;
pub mod routines;
pub mod search;
pub mod sections;
mod session_hosts;
pub mod spaces;
pub mod termination;
#[cfg(test)]
mod test_app;
#[cfg(test)]
pub use kiroshi_core::test_core;
pub use kiroshi_core::test_log;
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
		.enable_macos_default_menu(false)
		.plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
			window_controls::raise_last_focused(app);
		}))
		.plugin(tauri_plugin_deep_link::init())
		.plugin(
			tauri_plugin_window_state::Builder::default()
				.with_state_flags(
					tauri_plugin_window_state::StateFlags::SIZE
						| tauri_plugin_window_state::StateFlags::POSITION
						| tauri_plugin_window_state::StateFlags::MAXIMIZED,
				)
				.with_denylist(&[
					host_api::invoke::DISPATCHER_WEBVIEW,
					window_controls::drag_ghost::DRAG_GHOST,
				])
				.with_filter(|label| !window_controls::is_secondary(label))
				.build(),
		)
		.plugin(tauri_plugin_updater::Builder::new().build())
		.plugin(tauri_plugin_process::init())
		.plugin(tauri_plugin_opener::init())
		.plugin(tauri_plugin_notification::init())
		.plugin(tauri_plugin_os::init())
		.plugin(tauri_plugin_dialog::init())
		.plugin(tauri_plugin_clipboard_manager::init())
		.plugin(crate::events::in_core(AgentState::default()))
		.plugin(crate::events::in_core(companions::launch::LaunchOutcomeState::default()))
		.plugin(crate::events::in_core(agent::sign_in::SignInState::default()))
		.plugin(crate::events::in_core(mcp_oauth::commands::McpOauthState::default()))
		.plugin(crate::events::in_core(mcp_oauth::reports::ApplicationReports::default()))
		.plugin(crate::events::in_core(mcp_oauth::asking::AuthorizationAnswers::default()))
		.plugin(crate::events::in_core(missions::liveness::AnnouncedLiveness::default()))
		.plugin(crate::events::in_core_client_scoped(
			missions::run_claims::MissionRunClaims::default(),
		))
		.plugin(crate::events::in_core_client_scoped(
			conversations::awaited_runs::TurnWindows::default(),
		))
		.on_page_load(|webview, payload| {
			events::clear_client_on_page_load(webview, payload);
		})
		.on_window_event(|window, event| {
			events::clear_client_on_destroyed(window, event);
		})
		.plugin(crate::events::in_core(
			conversations::turn_run_deadline::TurnRunDeadlines::default(),
		))
		.manage(updates::Updates::default())
		.manage(badge::Badge::default())
		.setup(|app| {
			events::install_core(app.handle())?;
			if let Err(failure) = logging::install(app.handle()) {
				eprintln!("the log file could not be opened: {failure}");
			}
			#[cfg(target_os = "macos")]
			menu::install(app.handle())?;
			crate::db::install(crate::events::core(app.handle()));
			crate::events::core(app.app_handle())
				.manage(crypto::commands::load(crate::events::core(app.handle())));
			crate::events::core(app.app_handle())
				.manage(crypto::commands::space_keys(crate::events::core(app.handle())));
			if !window_controls::is_headless(std::env::args()) {
				window_controls::open_main(app.handle());
				window_controls::drag_ghost::open(app.handle());
			}
			joined_spaces::deep_link::install(app.handle());
			crate::events::core(app.app_handle())
				.manage(routines::sentinel::spawn(crate::events::core(app.handle()).clone()));
			crate::events::core(app.app_handle()).manage(routines::webhook::start(
				crate::events::core(app.handle()).clone(),
				host_api::routes(app.handle().clone()),
			));
			crate::events::core(app.app_handle())
				.manage(missions::github::spawn(crate::events::core(app.handle()).clone()));
			crate::events::core(app.app_handle())
				.manage(applications::directory::spawn(crate::events::core(app.handle()).clone()));
			crate::events::core(app.app_handle()).manage(account::session::AccountSession::new(
				environment::commands::writable_root(crate::events::core(app.handle())),
				&account::cloud::api_url(),
			));
			crate::events::core(app.app_handle()).manage(hosting::Hosting::new(
				&account::cloud::api_url(),
				hosting::local_api(crate::events::core(app.handle())),
			));
			crate::events::core(app.app_handle())
				.manage(invitations::Invitations::new(&account::cloud::api_url()));
			crate::events::core(app.app_handle())
				.manage(devices::Devices::new(&account::cloud::api_url()));
			crate::events::core(app.app_handle())
				.manage(joined_spaces::relay::RelayGuests::new(&account::cloud::api_url()));
			tauri::async_runtime::spawn(account::session::restore(
				crate::events::core(app.handle()).clone(),
			));
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				conversations::commands::list_bundles_at_launch(crate::events::core(&handle)).await;
			});
			let handle = app.handle().clone();
			tauri::async_runtime::spawn(async move {
				missions::commands::install_hooks_at_launch(crate::events::core(&handle)).await;
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
			RunEvent::Reopen { .. } => window_controls::raise_last_focused(app),
			RunEvent::Exit => {
				library::write_pending_boards(crate::events::core(app));
				if let Err(failure) = badge::wear(app, 0) {
					eprintln!("the badge was not cleared before exit: {failure}");
				}
				if let Some(sentinel) = crate::events::core(app.app_handle())
					.try_state::<routines::sentinel::Sentinel>()
				{
					sentinel.stop();
				}
				if let Some(webhook) =
					crate::events::core(app.app_handle()).try_state::<routines::webhook::Webhook>()
				{
					webhook.stop();
				}
				if let Some(poller) =
					crate::events::core(app.app_handle()).try_state::<missions::github::Poller>()
				{
					poller.stop();
				}
				if let Some(directory) = crate::events::core(app.app_handle())
					.try_state::<std::sync::Arc<applications::directory::Directory>>()
				{
					directory.stop();
				}
				tauri::async_runtime::block_on(terminate_session(
					crate::events::core(app),
					crate::events::core(app.app_handle()).state::<AgentState>().inner(),
				));
			}
			_ => {}
		})
}
