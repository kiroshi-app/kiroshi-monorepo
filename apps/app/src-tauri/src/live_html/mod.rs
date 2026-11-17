pub mod commands;
pub mod contract;
#[cfg(not(target_os = "macos"))]
mod elsewhere;
#[cfg(target_os = "macos")]
mod macos;
mod placement;
pub mod server;
pub mod watch;

#[cfg(not(target_os = "macos"))]
use elsewhere as native;
#[cfg(target_os = "macos")]
use macos as native;

use std::collections::HashMap;
use std::sync::Arc;

use tauri::webview::{PageLoadEvent, PageLoadPayload};
use tauri::{AppHandle, Manager, Runtime, Webview, WebviewWindow};
use tokio::sync::Mutex;

use crate::window_controls::MAIN_WINDOW;
use contract::{LiveHtmlError, LiveHtmlRectangle};
use placement::Placement;
use server::ContentServer;
use watch::{LoggedWatch, ViewWatch};

pub struct LiveViews {
	servers: Mutex<HashMap<String, ContentServer>>,
	watch: Arc<dyn ViewWatch>,
}

pub(crate) struct ViewToMount {
	pub id: String,
	pub url: String,
	pub allowed: [String; 2],
	pub scripts: Vec<String>,
	pub watch: Arc<dyn ViewWatch>,
}

impl Default for LiveViews {
	fn default() -> Self {
		Self::watched(Arc::new(LoggedWatch))
	}
}

impl LiveViews {
	pub fn watched(watch: Arc<dyn ViewWatch>) -> Self {
		Self { servers: Mutex::default(), watch }
	}

	pub async fn mount<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
		html: String,
		rectangle: LiveHtmlRectangle,
	) -> Result<(), LiveHtmlError> {
		native::ensure_available()?;
		valid(rectangle)?;
		let mut servers = self.servers.lock().await;
		if servers.contains_key(&id) {
			return Err(LiveHtmlError::AlreadyShown { id });
		}
		let main_window = main_window_of(app)?;
		let placement =
			Placement { rectangle, clip: None, top_inset: native::top_inset(&main_window).await? };
		let server = ContentServer::open(&id, html, Arc::clone(&self.watch))
			.map_err(|failure| LiveHtmlError::Unserved { detail: failure.to_string() })?;
		let view = ViewToMount {
			id: id.clone(),
			url: server.wrapper_url(),
			allowed: [server.wrapper_url(), server.content_url()],
			scripts: self.watch.initialization_scripts(),
			watch: Arc::clone(&self.watch),
		};
		native::mount(main_window, view, placement).await?;
		servers.insert(id, server);
		Ok(())
	}

	pub async fn place<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
		rectangle: LiveHtmlRectangle,
		clip: Option<LiveHtmlRectangle>,
	) -> Result<(), LiveHtmlError> {
		native::ensure_available()?;
		valid(rectangle)?;
		if let Some(clip) = clip {
			valid(clip)?;
		}
		let servers = self.servers.lock().await;
		let id = known(&servers, id)?;
		let top_inset = native::top_inset(&main_window_of(app)?).await?;
		native::place(app, id, Placement { rectangle, clip, top_inset }).await
	}

	pub async fn set_drawn<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
		is_drawn: bool,
	) -> Result<(), LiveHtmlError> {
		native::ensure_available()?;
		let servers = self.servers.lock().await;
		native::set_drawn(app, known(&servers, id)?, is_drawn).await
	}

	pub async fn remove<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
	) -> Result<(), LiveHtmlError> {
		native::ensure_available()?;
		let mut servers = self.servers.lock().await;
		let id = known(&servers, id)?;
		servers.remove(&id);
		native::detach(app, id).await
	}

	pub async fn remove_all<R: Runtime>(&self, app: &AppHandle<R>) {
		let ids: Vec<String> = self.servers.lock().await.drain().map(|(id, _server)| id).collect();
		for id in ids {
			if let Err(failure) = native::detach(app, id.clone()).await {
				log::error!("live view {id} was not dismantled: {failure:?}");
			}
		}
	}

	pub async fn url<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
	) -> Result<String, LiveHtmlError> {
		let servers = self.servers.lock().await;
		native::url(app, known(&servers, id)?).await
	}

	pub async fn evaluate<R: Runtime>(
		&self,
		app: &AppHandle<R>,
		id: String,
		script: String,
	) -> Result<String, LiveHtmlError> {
		let servers = self.servers.lock().await;
		native::evaluate(app, known(&servers, id)?, script).await
	}
}

pub fn remove_on_main_page_load<R: Runtime>(webview: &Webview<R>, payload: &PageLoadPayload<'_>) {
	if webview.label() != MAIN_WINDOW || payload.event() != PageLoadEvent::Started {
		return;
	}
	let app = webview.app_handle().clone();
	tauri::async_runtime::spawn(async move {
		if let Some(views) = app.try_state::<LiveViews>() {
			views.remove_all(&app).await;
		}
	});
}

fn valid(rectangle: LiveHtmlRectangle) -> Result<(), LiveHtmlError> {
	rectangle.is_valid().then_some(()).ok_or(LiveHtmlError::InvalidRectangle)
}

fn known(servers: &HashMap<String, ContentServer>, id: String) -> Result<String, LiveHtmlError> {
	if servers.contains_key(&id) {
		Ok(id)
	} else {
		Err(LiveHtmlError::UnknownView { id })
	}
}

fn main_window_of<R: Runtime>(app: &AppHandle<R>) -> Result<WebviewWindow<R>, LiveHtmlError> {
	app.get_webview_window(MAIN_WINDOW).ok_or(LiveHtmlError::MainWindowMissing)
}
