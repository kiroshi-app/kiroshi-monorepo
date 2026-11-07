use std::collections::HashMap;
use std::io::Cursor;
use std::sync::{Mutex, MutexGuard, PoisonError};
use std::time::Duration;

use base64::prelude::{Engine as _, BASE64_STANDARD};
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat};
use serde::{Deserialize, Serialize};
use tokio::sync::oneshot;
use uuid::Uuid;

use super::{ToolRefusal, MAX_SHOWN_IMAGE_BYTES};
use crate::board::Frame;
use crate::core_context::{Core, Managed, RenderWindow};
use crate::library::decoded;

#[cfg(test)]
mod tests;

pub const SCREENSHOT_ROUTE: &str = "/screenshot.html";

pub const WINDOW_PREFIX: &str = "screenshot-";

const RENDER_TIMEOUT: Duration = Duration::from_secs(15);

const LONG_EDGE: u32 = 1568;

const RENDERED_NAME: &str = "screenshot.png";

const SCALES: [u8; 2] = [1, 2];

const SHRINK_MARGIN: f64 = 0.9;

const MIN_BOARD_ZOOM: f64 = 0.1;

const DOCUMENT_WIDTH: f64 = 794.0;

const DOCUMENT_HEIGHT: f64 = 600.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Deserialize)]
#[serde(try_from = "u8")]
pub struct Scale(u8);

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotJob {
	pub request_id: String,
	pub space_id: String,
	pub scale: u8,
	pub target: ScreenshotTarget,
}

#[derive(Debug, Clone, PartialEq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScreenshotTarget {
	Board { name: String, canvas: String, frame: Frame, zoom: f64 },
	Document { name: String, blocks: Vec<ScreenshotBlock> },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct ScreenshotBlock {
	pub id: String,
	pub markdown: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScreenshotRendered {
	Rendered { png: String },
	Failed { reason: String },
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ScreenshotRequestError {
	NotAScreenshotWindow,
	#[serde(rename_all = "camelCase")]
	UnknownRequest {
		request_id: String,
	},
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Rendered {
	pub width: u32,
	pub height: u32,
	pub scale: u8,
}

#[derive(Debug)]
pub struct Shot {
	pub content: String,
	pub rendered: Rendered,
}

#[derive(Default)]
pub struct Screenshots(Mutex<HashMap<String, Pending>>);

pub(super) struct Pending {
	job: ScreenshotJob,
	answer: oneshot::Sender<ScreenshotRendered>,
}

struct InFlight<'a> {
	core: &'a Core,
	request_id: String,
}

impl Default for Scale {
	fn default() -> Self {
		Self(SCALES[0])
	}
}

impl TryFrom<u8> for Scale {
	type Error = String;

	fn try_from(scale: u8) -> Result<Self, Self::Error> {
		if SCALES.contains(&scale) {
			Ok(Self(scale))
		} else {
			Err(format!("scale is 1 or 2, not {scale}"))
		}
	}
}

impl ScreenshotTarget {
	pub fn board(name: String, canvas: String, frame: Frame, scale: Scale) -> Self {
		let long_edge = frame.width.max(frame.height).max(1) as f64 * f64::from(scale.0);
		let zoom = (f64::from(LONG_EDGE) / long_edge).clamp(MIN_BOARD_ZOOM, 1.0);
		Self::Board { name, canvas, frame, zoom }
	}

	fn window_size(&self) -> LogicalSize<f64> {
		match self {
			Self::Board { frame, zoom, .. } => {
				LogicalSize::new(frame.width as f64 * zoom, frame.height as f64 * zoom)
			}
			Self::Document { .. } => LogicalSize::new(DOCUMENT_WIDTH, DOCUMENT_HEIGHT),
		}
	}
}

impl Screenshots {
	pub(super) fn held(&self) -> MutexGuard<'_, HashMap<String, Pending>> {
		self.0.lock().unwrap_or_else(PoisonError::into_inner)
	}
}

impl<'a> InFlight<'a> {
	fn opened(core: &'a Core, job: ScreenshotJob) -> (Self, oneshot::Receiver<ScreenshotRendered>) {
		let (answer, answered) = oneshot::channel();
		let request_id = job.request_id.clone();
		screenshots(core).held().insert(request_id.clone(), Pending { job, answer });
		(Self { core, request_id }, answered)
	}
}

impl Drop for InFlight<'_> {
	fn drop(&mut self) {
		screenshots(self.core).held().remove(&self.request_id);
		let label = window_label(&self.request_id);
		if let Err(failure) = self.core.close_window(&label) {
			log::error!("the screenshot window {label} was not closed: {failure}");
		}
	}
}

pub fn library_screenshot_job<R: Runtime>(
	window: WebviewWindow<R>,
) -> Result<ScreenshotJob, ScreenshotRequestError> {
	let request_id = request_of(window.label())?;
	let screenshots = screenshots(crate::events::core(window.app_handle()));
	let job = screenshots.held().get(request_id).map(|pending| pending.job.clone());
	job.ok_or_else(|| unknown(request_id))
}

pub fn library_screenshot_answer<R: Runtime>(
	window: WebviewWindow<R>,
	request_id: String,
	answer: ScreenshotRendered,
) -> Result<(), ScreenshotRequestError> {
	if request_of(window.label())? != request_id {
		return Err(unknown(&request_id));
	}
	let pending = screenshots(crate::events::core(window.app_handle())).held().remove(&request_id);
	let pending = pending.ok_or_else(|| unknown(&request_id))?;
	pending.answer.send(answer).map_err(|_| unknown(&request_id))
}

pub async fn render(
	core: &Core,
	space_id: &str,
	scale: Scale,
	target: ScreenshotTarget,
) -> Result<Shot, ToolRefusal> {
	let request_id = Uuid::new_v4().to_string();
	let size = target.window_size();
	let job = ScreenshotJob { request_id, space_id: space_id.to_owned(), scale: scale.0, target };
	let (in_flight, answered) = InFlight::opened(core, job);
	core.open_render_window(&render_window(&in_flight.request_id, size))
		.map_err(|failure| failed(format!("the render window did not open: {failure}")))?;
	match tokio::time::timeout(RENDER_TIMEOUT, answered).await {
		Err(_) => {
			log::warn!("the screenshot {} did not render in time", in_flight.request_id);
			Err(ToolRefusal::RenderTimedOut { seconds: RENDER_TIMEOUT.as_secs() })
		}
		Ok(Err(_)) => Err(failed("the render window closed without answering".to_owned())),
		Ok(Ok(ScreenshotRendered::Failed { reason })) => Err(failed(reason)),
		Ok(Ok(ScreenshotRendered::Rendered { png })) => fitted(&png, scale),
	}
}

fn render_window(request_id: &str, size: LogicalSize<f64>) -> RenderWindow {
	RenderWindow {
		label: window_label(request_id),
		route: SCREENSHOT_ROUTE.trim_start_matches('/').to_owned(),
		width: size.width,
		height: size.height,
	}
}

fn fitted(png: &str, scale: Scale) -> Result<Shot, ToolRefusal> {
	let bytes = BASE64_STANDARD
		.decode(png)
		.map_err(|error| failed(format!("the render answered unreadable base64: {error}")))?;
	let image = decoded(RENDERED_NAME, ImageFormat::Png, &bytes)
		.map_err(|error| failed(format!("the render answered no PNG: {error:?}")))?;
	if is_one_colour(&image) {
		let (width, height) = (image.width(), image.height());
		return Err(failed(format!(
			"the capture is blank: all {width} x {height} pixels are one colour"
		)));
	}
	let (mut image, mut png) = if image.width().max(image.height()) > LONG_EDGE {
		let image = image.resize(LONG_EDGE, LONG_EDGE, FilterType::Triangle);
		let png = encoded(&image)?;
		(image, png)
	} else {
		(image, bytes)
	};
	while png.len() as u64 > MAX_SHOWN_IMAGE_BYTES {
		image = shrunk(&image, png.len());
		png = encoded(&image)?;
	}
	let rendered = Rendered { width: image.width(), height: image.height(), scale: scale.0 };
	Ok(Shot { content: BASE64_STANDARD.encode(png), rendered })
}

fn is_one_colour(image: &DynamicImage) -> bool {
	let pixels = image.to_rgba8();
	let mut colours = pixels.pixels();
	let Some(first) = colours.next() else {
		return true;
	};
	colours.all(|colour| colour == first)
}

fn shrunk(image: &DynamicImage, bytes: usize) -> DynamicImage {
	let ratio = (MAX_SHOWN_IMAGE_BYTES as f64 / bytes as f64).sqrt() * SHRINK_MARGIN;
	let edge = |length: u32| {
		((f64::from(length) * ratio) as u32).clamp(1, length.saturating_sub(1).max(1))
	};
	image.resize(edge(image.width()), edge(image.height()), FilterType::Triangle)
}

fn encoded(image: &DynamicImage) -> Result<Vec<u8>, ToolRefusal> {
	let mut png = Vec::new();
	image
		.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
		.map_err(|error| failed(format!("the screenshot did not encode: {error}")))?;
	Ok(png)
}

fn request_of(label: &str) -> Result<&str, ScreenshotRequestError> {
	label.strip_prefix(WINDOW_PREFIX).ok_or(ScreenshotRequestError::NotAScreenshotWindow)
}

pub(super) fn window_label(request_id: &str) -> String {
	format!("{WINDOW_PREFIX}{request_id}")
}

fn unknown(request_id: &str) -> ScreenshotRequestError {
	ScreenshotRequestError::UnknownRequest { request_id: request_id.to_owned() }
}

fn failed(detail: String) -> ToolRefusal {
	ToolRefusal::RenderFailed { detail }
}

pub(super) fn screenshots(core: &Core) -> Managed<'_, Screenshots> {
	if core.try_state::<Screenshots>().is_none() {
		core.manage(Screenshots::default());
	}
	core.state::<Screenshots>()
}
