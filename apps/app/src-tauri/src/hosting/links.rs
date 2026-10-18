use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};
use tauri::{AppHandle, Runtime};
use zeroize::Zeroizing;

use super::contract::{MemberStatus, MembersError};
use super::devices::{database_of, host_device, settled_turn};
use super::members::{instance_of, listed};
use super::roster;
use crate::crypto::device_keys::DeviceKeys;
use crate::crypto::join::fresh_secret;
use crate::spaces::contract::SpaceError;

const JOIN_LINK_ORIGIN: &str = "https://kiroshi.app/join#";

pub async fn join_link<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
	user_id: String,
) -> Result<String, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let host = host_device(app)?;
	let _turn = settled_turn(app, &space_id).await?;
	let members = listed(app, &instance_id).await?;
	let status = members
		.iter()
		.find(|member| member.user_id == user_id)
		.map(|member| member.status)
		.ok_or(MembersError::UnknownMember)?;
	if status != MemberStatus::Pending {
		return Err(MembersError::NotPending);
	}
	minted(app, &space_id, &instance_id, &host, user_id).await
}

pub async fn device_link<R: Runtime>(
	app: &AppHandle<R>,
	space_id: String,
) -> Result<String, MembersError> {
	let instance_id = instance_of(app, &space_id).await?;
	let host = host_device(app)?;
	let _turn = settled_turn(app, &space_id).await?;
	let account_id = roster::host_account(database_of(app)?, &space_id, &host)
		.await
		.map_err(SpaceError::from)?
		.ok_or(MembersError::NotHosting)?;
	minted(app, &space_id, &instance_id, &host, account_id).await
}

async fn minted<R: Runtime>(
	app: &AppHandle<R>,
	space_id: &str,
	instance_id: &str,
	host: &DeviceKeys,
	account_id: String,
) -> Result<String, MembersError> {
	let secret = fresh_secret().map_err(|_| MembersError::NoRandomness)?;
	let link = format!(
		"{JOIN_LINK_ORIGIN}{instance_id}.{}.{}",
		BASE64_URL_SAFE_NO_PAD.encode(host.agreement_public().as_bytes()),
		BASE64_URL_SAFE_NO_PAD.encode(secret.as_slice()),
	);
	database_of(app)?
		.space_relay()
		.join_secret_minted(space_id.to_owned(), account_id, Zeroizing::new(secret.to_vec()))
		.await
		.map_err(SpaceError::from)?;
	Ok(link)
}
