use std::collections::HashMap;

use reqwest::Url;

use super::contract::{LibraryLinkPreview, LibraryLinkPreviewError};
use super::READ_BOUND;

pub async fn library_read_link_preview(
	url: String,
) -> Result<LibraryLinkPreview, LibraryLinkPreviewError> {
	super::read(&url, &HashMap::new(), READ_BOUND).await.inspect_err(|refusal| {
		let parsed = Url::parse(&url).ok();
		let host = parsed.as_ref().and_then(Url::host_str).unwrap_or("none");
		log::warn!("a link preview was refused: kind={} host={host}", refusal.kind());
	})
}
