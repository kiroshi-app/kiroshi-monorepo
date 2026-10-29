use image::ImageFormat;
use tauri::image::Image;
use tauri::{Runtime, WebviewWindow};

const DOT: &[u8] = include_bytes!("../../icons/badge-dot.png");

pub fn worn_by<R: Runtime>(window: &WebviewWindow<R>, count: Option<i64>) -> Result<(), String> {
	let icon = count.map(|_| dot()).transpose()?;
	window.set_overlay_icon(icon).map_err(|failure| failure.to_string())
}

fn dot() -> Result<Image<'static>, String> {
	let dot = image::load_from_memory_with_format(DOT, ImageFormat::Png)
		.map_err(|failure| format!("the overlay dot did not decode: {failure}"))?
		.into_rgba8();
	let (width, height) = dot.dimensions();
	Ok(Image::new_owned(dot.into_raw(), width, height))
}
