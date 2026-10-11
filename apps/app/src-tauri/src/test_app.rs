use std::ops::Deref;

use tauri::test::{mock_context, noop_assets, MockRuntime};
use tauri::{App, Builder, Manager};

use crate::removed_on_drop::RemovedOnDrop;

pub(crate) struct AppOfItsOwn {
	app: App<MockRuntime>,
	_folder: RemovedOnDrop,
}

impl Deref for AppOfItsOwn {
	type Target = App<MockRuntime>;

	fn deref(&self) -> &Self::Target {
		&self.app
	}
}

pub(crate) fn an_app_of_its_own(name: &str, builder: Builder<MockRuntime>) -> AppOfItsOwn {
	let mut context = mock_context(noop_assets());
	context.config_mut().identifier = format!("com.kiroshi.{name}-{}", uuid::Uuid::new_v4());
	let app = builder.build(context).expect("the app builds");
	let folder = RemovedOnDrop(app.path().app_data_dir().expect("the data folder resolves"));
	AppOfItsOwn { app, _folder: folder }
}
