use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime};

use super::plugin::{self, Descriptor};
use super::Evolved;

pub(super) const PLUGIN: Descriptor = Descriptor {
	dir_name: "user",
	plugin_name: "me",
	description: "What every agent in Kiroshi knows about the person it talks to.",
	about_id: "about-me",
	about_description: "Who the person you are talking to is, and how they work.",
	written_title: "The bot changed what it knows about the person",
	laid_down_title: "The person's own plugin was laid down",
};

pub fn path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(PLUGIN.dir_name).join(PLUGIN.plugin_name))
}

pub fn lay_down(path: &Path) -> std::io::Result<()> {
	plugin::lay_down(&PLUGIN, path)
}

pub fn laid_down<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	plugin::laid_down(path(app))
}

pub fn evolve(path: &Path) -> Evolved {
	plugin::evolve(&PLUGIN, path)
}
