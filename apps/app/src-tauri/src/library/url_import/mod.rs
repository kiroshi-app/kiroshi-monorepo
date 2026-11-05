#[cfg(test)]
mod tests;

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use image::ImageFormat;
use reqwest::Url;

use super::contract::{LibraryError, LibraryImportUrlError, LibraryItem};
use super::{accepted_type, import_limit, importable, imported, is_plain_name, AcceptedType};
use crate::hosting::authorship::Caller;
use crate::remote_image::{fetched, image_bytes_of, Admission, FetchedImage, READ_BOUND};

const FALLBACK_STEM: &str = "image";

pub(crate) fn admission_for<'a>(
	caller: &Caller,
	proxy_bearers: &'a HashMap<String, String>,
) -> Admission<'a> {
	match caller {
		Caller::Host => Admission::Web(proxy_bearers),
		Caller::Relayed(_) => Admission::PublicWeb,
	}
}

pub(crate) async fn import_url(
	root: PathBuf,
	space_id: String,
	url: &str,
	admission: &Admission<'_>,
) -> Result<LibraryItem, LibraryImportUrlError> {
	let image = tokio::time::timeout(READ_BOUND, downloaded(url, admission))
		.await
		.unwrap_or(Err(LibraryImportUrlError::NetworkFailure { status: None }))?;
	let extension =
		library_extension(&image.media_type).ok_or(LibraryImportUrlError::NotAnImage)?;
	let name = item_name(url, &image.media_type, extension);
	tokio::task::spawn_blocking(move || import_image(&root, &space_id, &name, &image.bytes))
		.await
		.map_err(|error| LibraryError::Unwritable { detail: error.to_string() })?
		.map_err(LibraryImportUrlError::from)
}

async fn downloaded(
	url: &str,
	admission: &Admission<'_>,
) -> Result<FetchedImage, LibraryImportUrlError> {
	let response = fetched(url, admission).await?;
	Ok(image_bytes_of(response).await?)
}

fn import_image(
	root: &Path,
	space_id: &str,
	name: &str,
	bytes: &[u8],
) -> Result<LibraryItem, LibraryError> {
	imported(root, space_id, name, &importable(name)?, bytes, import_limit)
}

fn library_extension(media_type: &str) -> Option<&'static str> {
	let extension = ImageFormat::from_mime_type(media_type)?.extensions_str().first()?;
	is_named_as(&format!("{FALLBACK_STEM}.{extension}"), media_type).then_some(extension)
}

fn item_name(url: &str, media_type: &str, extension: &str) -> String {
	let parsed = Url::parse(url).ok();
	let segment = parsed.as_ref().and_then(|url| url.path_segments()?.next_back());
	match segment.filter(|segment| is_plain_name(segment) && !segment.starts_with('.')) {
		Some(segment) if is_named_as(segment, media_type) => segment.to_owned(),
		Some(segment) => format!("{}.{extension}", stem_of(segment)),
		None => format!("{FALLBACK_STEM}.{extension}"),
	}
}

fn is_named_as(name: &str, media_type: &str) -> bool {
	matches!(accepted_type(name), Some(AcceptedType::Image { mime_type }) if mime_type == media_type)
}

fn stem_of(segment: &str) -> &str {
	segment.rsplit_once('.').map_or(segment, |(stem, _)| stem)
}
