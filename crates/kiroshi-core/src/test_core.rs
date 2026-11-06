use std::ops::Deref;
use std::sync::OnceLock;

use tokio::runtime::{Handle, Runtime};

use crate::core_context::Core;
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
		self.core.listen(move |event| {
			if event.name == name {
				heard(event.payload.get());
			}
			Ok(())
		});
	}
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
