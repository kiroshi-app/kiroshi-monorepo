use std::ops::Deref;

use specta::datatype::DataType;
use specta::function::FunctionArg;
use specta::Types;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::{Manager, Runtime};

pub use kiroshi_core::hosting::authorship::*;

pub struct CommandCaller(pub Caller);

impl Deref for CommandCaller {
	type Target = Caller;

	fn deref(&self) -> &Caller {
		&self.0
	}
}

impl<'de, R: Runtime> CommandArg<'de, R> for CommandCaller {
	fn from_command(command: CommandItem<'de, R>) -> Result<Self, InvokeError> {
		let webview = command.message.webview();
		let core = crate::events::core(webview.app_handle());
		Ok(CommandCaller(Caller::of(core, command.message.headers())))
	}
}

impl FunctionArg for CommandCaller {
	fn to_datatype(_: &mut Types) -> Option<DataType> {
		None
	}
}
