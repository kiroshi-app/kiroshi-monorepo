use std::ops::Deref;

use specta::datatype::DataType;
use specta::function::FunctionArg;
use specta::Types;
use tauri::ipc::{CommandArg, CommandItem, InvokeError};
use tauri::Runtime;

use crate::host_api::invoke::RELAYED_MEMBER_HEADER;
use crate::hosting::Hosting;
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
		let Some(nonce) = command.message.headers().get(&RELAYED_MEMBER_HEADER) else {
			return Ok(CommandCaller(Caller::Host));
		};
		let webview = command.message.webview();
		let member = nonce
			.to_str()
			.ok()
			.zip(crate::events::core(webview.app_handle()).try_state::<Hosting>())
			.and_then(|(nonce, hosting)| hosting.relayed_member(nonce));
		Ok(CommandCaller(Caller::Relayed(member)))
	}
}

impl FunctionArg for CommandCaller {
	fn to_datatype(_: &mut Types) -> Option<DataType> {
		None
	}
}
