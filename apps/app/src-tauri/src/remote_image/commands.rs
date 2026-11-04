use reqwest::Url;
use tauri::State;

use super::contract::{RemoteImage, RemoteImageError};
use super::READ_BOUND;
use crate::joined_spaces::relay::RelayGuests;

#[tauri::command]
#[specta::specta]
pub async fn remote_image_read(
	guests: State<'_, RelayGuests>,
	url: String,
) -> Result<RemoteImage, RemoteImageError> {
	let proxy_bearers = guests.proxy_bearers();
	super::read(&url, &proxy_bearers, READ_BOUND).await.inspect_err(|refusal| {
		let parsed = Url::parse(&url).ok();
		let host = parsed.as_ref().and_then(Url::host_str).unwrap_or("none");
		log::warn!("a remote image was refused: kind={} host={host}", refusal.kind());
	})
}
