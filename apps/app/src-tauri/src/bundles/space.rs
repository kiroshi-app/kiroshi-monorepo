use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::plugin::{self, Descriptor};
use super::Evolved;

pub(super) const PLUGIN: Descriptor = Descriptor {
	dir_name: "spaces",
	plugin_name: "space",
	description: "What every agent in this space knows about the project it works on.",
	about_id: "about-this-space",
	about_description: "What this space is, and what every agent working in it needs.",
	written_title: "The bot changed what it knows about the space",
	laid_down_title: "The space's plugin was laid down",
};

pub fn root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(PLUGIN.dir_name))
}

pub fn path<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Option<PathBuf> {
	Some(root(app)?.join(space_id))
}

pub fn lay_down<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> std::io::Result<()> {
	let path = path(app, space_id).ok_or_else(|| {
		std::io::Error::new(std::io::ErrorKind::NotFound, "the space plugin has no home on disk")
	})?;
	lay_down_at(&path)
}

pub fn lay_down_at(path: &Path) -> std::io::Result<()> {
	plugin::lay_down(&PLUGIN, path)
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>, space_id: &str) -> Option<PathBuf> {
	plugin::laid_down(path(app, space_id))
}

pub fn remove<R: Runtime>(app: &AppHandle<R>, space_id: &str) {
	let Some(path) = path(app, space_id) else {
		return;
	};
	let _ = fs::remove_dir_all(path);
}

pub fn evolve(path: &Path) -> Evolved {
	plugin::evolve(&PLUGIN, path)
}
