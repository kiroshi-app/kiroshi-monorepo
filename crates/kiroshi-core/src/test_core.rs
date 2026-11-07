use std::ops::Deref;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, OnceLock};

use tokio::runtime::{Handle, Runtime};

use crate::core_context::{ChosenPath, Copied, Core, Desktop, RenderWindow};
use crate::removed_on_drop::RemovedOnDrop;

pub struct CoreOfItsOwn {
	core: Core,
	_folder: RemovedOnDrop,
}

impl Deref for CoreOfItsOwn {
	type Target = Core;

	fn deref(&self) -> &Core {
		&self.core
	}
}

impl CoreOfItsOwn {
	pub fn core(&self) -> &Core {
		&self.core
	}

	pub fn listen_to(&self, name: &'static str, heard: impl Fn(&str) + Send + Sync + 'static) {
		listen_to(&self.core, name, heard);
	}
}

pub fn listen_to(core: &Core, name: &'static str, heard: impl Fn(&str) + Send + Sync + 'static) {
	core.listen(move |event| {
		if event.name == name {
			heard(event.payload.get());
		}
		Ok(())
	});
}

pub fn a_core_of_its_own(name: &str) -> CoreOfItsOwn {
	let identifier = format!("com.kiroshi.{name}-{}", uuid::Uuid::new_v4());
	let folder = std::env::temp_dir().join(&identifier);
	let core = Core::new(&folder, identifier, runtime());
	CoreOfItsOwn { core, _folder: RemovedOnDrop(folder) }
}

pub fn runtime() -> Handle {
	static RUNTIME: OnceLock<Runtime> = OnceLock::new();
	RUNTIME.get_or_init(|| Runtime::new().expect("the test runtime starts")).handle().clone()
}

#[derive(Clone, Default)]
pub struct RenderWindows(Arc<Mutex<Vec<String>>>);

impl RenderWindows {
	pub fn is_open(&self, label: &str) -> bool {
		self.0.lock().expect("the windows").iter().any(|open| open == label)
	}
}

impl Desktop for RenderWindows {
	fn open_url(&self, _url: &str) -> Result<(), String> {
		Ok(())
	}

	fn raise_main_window(&self) {}

	fn open_render_window(&self, window: &RenderWindow) -> Result<(), String> {
		self.0.lock().expect("the windows").push(window.label.clone());
		Ok(())
	}

	fn close_window(&self, label: &str) -> Result<(), String> {
		self.0.lock().expect("the windows").retain(|open| open != label);
		Ok(())
	}

	fn reveal(&self, _path: &Path) -> Result<(), String> {
		Ok(())
	}

	fn copy(&self, _copied: Copied) -> Result<(), String> {
		Ok(())
	}

	fn chosen_save_path(&self, _suggested: String) -> ChosenPath {
		Box::pin(async { Ok(None::<PathBuf>) })
	}
}
