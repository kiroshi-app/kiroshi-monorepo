use super::contract::{AccountError, AccountState};
use super::session::{self, AccountSession};
use crate::core_context::Core;

pub fn account_state(core: &Core) -> AccountState {
	core.state::<AccountSession>().current()
}

pub async fn account_sign_in(core: &Core) -> Result<(), AccountError> {
	session::sign_in(core, |url| core.open_url(url).map_err(|failure| failure.to_string())).await
}

pub async fn account_sign_out(core: &Core) -> Result<(), AccountError> {
	session::sign_out(core).await
}
