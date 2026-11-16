use std::path::{Path, PathBuf};
use std::process::Command;

use serde::Serialize;

use crate::placement::Rectangle;

const FILE_HEADER_LENGTH: usize = 14;
const PIXEL_DATA_OFFSET_FIELD: usize = 10;
const WIDTH_FIELD: usize = 18;
const HEIGHT_FIELD: usize = 22;
const BITS_PER_PIXEL_FIELD: usize = 28;
const COMPRESSION_FIELD: usize = 30;
const UNCOMPRESSED: u32 = 0;
const BIT_FIELDS: u32 = 3;
const ROW_ALIGNMENT_BITS: usize = 32;
const CHANNEL_LEAD: i16 = 100;

#[derive(Clone, Copy)]
pub struct Paint {
	pub name: &'static str,
	pub css: &'static str,
	leading_channels: [bool; 3],
}

pub const PLACEHOLDER_PAINT: Paint =
	Paint { name: "cyan", css: "rgb(0, 255, 255)", leading_channels: [false, true, true] };
pub const VIEW_PAINT: Paint =
	Paint { name: "magenta", css: "rgb(255, 0, 255)", leading_channels: [true, false, true] };

impl Paint {
	fn covers(self, red_green_blue: [u8; 3]) -> bool {
		let channels = red_green_blue.map(i16::from);
		let of = |leads: bool| {
			channels
				.into_iter()
				.zip(self.leading_channels)
				.filter(move |(_, is_leading)| *is_leading == leads)
				.map(|(channel, _)| channel)
		};
		of(true).min().zip(of(false).max()).is_some_and(|(lowest_leading, highest_other)| {
			lowest_leading - highest_other > CHANNEL_LEAD
		})
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize)]
pub struct PaintedBox {
	pub left: usize,
	pub top: usize,
	pub width: usize,
	pub height: usize,
	pub painted_pixels: usize,
}

impl PaintedBox {
	pub fn painted_share(self) -> f64 {
		self.painted_pixels as f64 / (self.width * self.height) as f64
	}

	pub fn in_points(self, pixels_per_point: f64) -> Rectangle {
		Rectangle {
			x: self.left as f64 / pixels_per_point,
			y: self.top as f64 / pixels_per_point,
			width: self.width as f64 / pixels_per_point,
			height: self.height as f64 / pixels_per_point,
		}
	}
}

pub struct Bitmap {
	pub width: usize,
	pub height: usize,
	rows_from_the_top: Vec<[u8; 3]>,
}

fn field<const LENGTH: usize>(bytes: &[u8], offset: usize) -> Result<[u8; LENGTH], String> {
	bytes
		.get(offset..offset + LENGTH)
		.and_then(|slice| slice.try_into().ok())
		.ok_or_else(|| format!("the bitmap ends before its header field at byte {offset}"))
}

impl Bitmap {
	pub fn parse(bytes: &[u8]) -> Result<Self, String> {
		if bytes.len() < FILE_HEADER_LENGTH || &bytes[..2] != b"BM" {
			return Err("the capture is not a BMP file".to_owned());
		}
		let pixel_data_offset = u32::from_le_bytes(field(bytes, PIXEL_DATA_OFFSET_FIELD)?) as usize;
		let signed_width = i32::from_le_bytes(field(bytes, WIDTH_FIELD)?);
		let signed_height = i32::from_le_bytes(field(bytes, HEIGHT_FIELD)?);
		let bits_per_pixel = usize::from(u16::from_le_bytes(field(bytes, BITS_PER_PIXEL_FIELD)?));
		let compression = u32::from_le_bytes(field(bytes, COMPRESSION_FIELD)?);
		let is_readable = matches!(bits_per_pixel, 24 | 32)
			&& matches!(compression, UNCOMPRESSED | BIT_FIELDS)
			&& signed_width > 0
			&& signed_height != 0;
		if !is_readable {
			return Err(format!(
				"unsupported BMP: {signed_width} x {signed_height}, {bits_per_pixel} bits per pixel, compression {compression}"
			));
		}
		let width = signed_width.unsigned_abs() as usize;
		let height = signed_height.unsigned_abs() as usize;
		let bytes_per_pixel = bits_per_pixel / 8;
		let row_length = (bits_per_pixel * width).div_ceil(ROW_ALIGNMENT_BITS) * 4;
		let pixel_data = bytes
			.get(pixel_data_offset..pixel_data_offset + row_length * height)
			.ok_or("the BMP pixel data is shorter than its header says")?;
		let stored_rows = pixel_data.chunks_exact(row_length);
		let is_stored_from_the_bottom = signed_height > 0;
		let rows: Vec<&[u8]> = if is_stored_from_the_bottom {
			stored_rows.rev().collect()
		} else {
			stored_rows.collect()
		};
		let rows_from_the_top = rows
			.into_iter()
			.flat_map(|row| row.chunks_exact(bytes_per_pixel).take(width))
			.map(|blue_green_red| [blue_green_red[2], blue_green_red[1], blue_green_red[0]])
			.collect();
		Ok(Self { width, height, rows_from_the_top })
	}

	pub fn painted_box(&self, paint: Paint) -> Option<PaintedBox> {
		let painted: Vec<(usize, usize)> = self
			.rows_from_the_top
			.iter()
			.enumerate()
			.filter(|(_, pixel)| paint.covers(**pixel))
			.map(|(index, _)| (index % self.width, index / self.width))
			.collect();
		let columns = || painted.iter().map(|(column, _)| *column);
		let rows = || painted.iter().map(|(_, row)| *row);
		let (left, right) = columns().min().zip(columns().max())?;
		let (top, bottom) = rows().min().zip(rows().max())?;
		Some(PaintedBox {
			left,
			top,
			width: right - left + 1,
			height: bottom - top + 1,
			painted_pixels: painted.len(),
		})
	}
}

pub enum Shot {
	#[cfg(target_os = "macos")]
	Window(isize),
	#[cfg(not(target_os = "macos"))]
	Region(Rectangle),
}

#[cfg(target_os = "macos")]
fn grabber(shot: &Shot, bitmap: &Path) -> Result<Command, String> {
	let Shot::Window(number) = shot;
	let mut command = Command::new("screencapture");
	command.args(["-x", "-o", "-t", "bmp", "-l", &number.to_string()]).arg(bitmap);
	Ok(command)
}

#[cfg(target_os = "linux")]
fn grabber(shot: &Shot, bitmap: &Path) -> Result<Command, String> {
	let Shot::Region(Rectangle { x, y, width, height }) = shot;
	let mut command = Command::new("import");
	command
		.args(["-silent", "-window", "root", "-crop", &format!("{width}x{height}+{x}+{y}")])
		.arg("+repage")
		.arg(format!("bmp3:{}", bitmap.display()));
	Ok(command)
}

#[cfg(not(any(target_os = "macos", target_os = "linux")))]
fn grabber(_shot: &Shot, _bitmap: &Path) -> Result<Command, String> {
	Err("the harness captures no window on this platform".to_owned())
}

#[cfg(target_os = "macos")]
fn converter(bitmap: &Path, picture: &Path) -> Command {
	let mut command = Command::new("sips");
	command.args(["-s", "format", "png"]).arg(bitmap).arg("--out").arg(picture);
	command
}

#[cfg(not(target_os = "macos"))]
fn converter(bitmap: &Path, picture: &Path) -> Command {
	let mut command = Command::new("convert");
	command.arg(bitmap).arg(picture);
	command
}

fn finished(mut command: Command) -> Result<(), String> {
	let output =
		command.output().map_err(|cause| format!("{command:?} could not be started: {cause}"))?;
	if output.status.success() {
		return Ok(());
	}
	Err(format!(
		"{command:?} ended with {}: {}",
		output.status,
		String::from_utf8_lossy(&output.stderr).trim()
	))
}

pub fn grab(shot: &Shot, bitmap: &Path) -> Result<Bitmap, String> {
	finished(grabber(shot, bitmap)?)?;
	let bytes = std::fs::read(bitmap)
		.map_err(|cause| format!("the capture left no readable {}: {cause}", bitmap.display()))?;
	Bitmap::parse(&bytes)
}

pub fn kept_as_a_picture(bitmap: &Path) -> Result<PathBuf, String> {
	let picture = bitmap.with_extension("png");
	finished(converter(bitmap, &picture))?;
	std::fs::remove_file(bitmap)
		.map_err(|cause| format!("{} could not be removed: {cause}", bitmap.display()))?;
	Ok(picture)
}

#[cfg(test)]
mod tests {
	use super::*;

	const WHITE: [u8; 3] = [255, 255, 255];
	const MAGENTA_ON_A_WIDE_GAMUT_DISPLAY: [u8; 3] = [234, 51, 247];
	const CYAN_ON_A_WIDE_GAMUT_DISPLAY: [u8; 3] = [117, 251, 253];
	const TRAFFIC_LIGHTS: [[u8; 3]; 3] = [[255, 95, 87], [254, 188, 46], [40, 200, 64]];

	fn bitmap(
		width: usize,
		rows_from_the_top: &[[u8; 3]],
		is_stored_from_the_bottom: bool,
	) -> Vec<u8> {
		let height = rows_from_the_top.len() / width;
		let row_length = (24 * width).div_ceil(ROW_ALIGNMENT_BITS) * 4;
		let pixel_data_offset = 54_u32;
		let mut bytes = vec![0; pixel_data_offset as usize];
		bytes[..2].copy_from_slice(b"BM");
		bytes[PIXEL_DATA_OFFSET_FIELD..][..4].copy_from_slice(&pixel_data_offset.to_le_bytes());
		bytes[WIDTH_FIELD..][..4].copy_from_slice(&(width as i32).to_le_bytes());
		let signed_height =
			if is_stored_from_the_bottom { height as i32 } else { -(height as i32) };
		bytes[HEIGHT_FIELD..][..4].copy_from_slice(&signed_height.to_le_bytes());
		bytes[BITS_PER_PIXEL_FIELD..][..2].copy_from_slice(&24_u16.to_le_bytes());
		let mut rows: Vec<&[[u8; 3]]> = rows_from_the_top.chunks(width).collect();
		if is_stored_from_the_bottom {
			rows.reverse();
		}
		for row in rows {
			let mut stored: Vec<u8> =
				row.iter().flat_map(|[red, green, blue]| [*blue, *green, *red]).collect();
			stored.resize(row_length, 0);
			bytes.extend(stored);
		}
		bytes
	}

	fn three_by_three_with_magenta_in_the_last_two_rows_of_the_middle_column() -> Vec<[u8; 3]> {
		let mut pixels = vec![WHITE; 9];
		pixels[4] = MAGENTA_ON_A_WIDE_GAMUT_DISPLAY;
		pixels[7] = MAGENTA_ON_A_WIDE_GAMUT_DISPLAY;
		pixels
	}

	#[test]
	fn a_paint_is_found_where_it_was_drawn_whichever_way_the_rows_are_stored() {
		let pixels = three_by_three_with_magenta_in_the_last_two_rows_of_the_middle_column();
		let expected = PaintedBox { left: 1, top: 1, width: 1, height: 2, painted_pixels: 2 };
		for is_stored_from_the_bottom in [true, false] {
			let parsed = Bitmap::parse(&bitmap(3, &pixels, is_stored_from_the_bottom));
			assert_eq!(
				parsed.ok().and_then(|bitmap| bitmap.painted_box(VIEW_PAINT)),
				Some(expected)
			);
		}
	}

	#[test]
	fn a_paint_shifted_by_the_display_profile_is_still_told_from_the_other_and_from_grey() {
		assert!(VIEW_PAINT.covers(MAGENTA_ON_A_WIDE_GAMUT_DISPLAY));
		assert!(PLACEHOLDER_PAINT.covers(CYAN_ON_A_WIDE_GAMUT_DISPLAY));
		assert!(!VIEW_PAINT.covers(CYAN_ON_A_WIDE_GAMUT_DISPLAY));
		assert!(!PLACEHOLDER_PAINT.covers(MAGENTA_ON_A_WIDE_GAMUT_DISPLAY));
		assert!([WHITE, [204, 204, 221], [0, 0, 0]]
			.into_iter()
			.chain(TRAFFIC_LIGHTS)
			.all(|grey| !VIEW_PAINT.covers(grey) && !PLACEHOLDER_PAINT.covers(grey)));
	}

	#[test]
	fn a_capture_without_the_paint_has_no_box() {
		let parsed = Bitmap::parse(&bitmap(2, &[WHITE; 4], true));
		assert_eq!(parsed.ok().and_then(|bitmap| bitmap.painted_box(PLACEHOLDER_PAINT)), None);
	}

	#[test]
	fn a_file_that_is_not_a_bitmap_is_refused() {
		assert!(Bitmap::parse(b"\x89PNG\r\n\x1a\n").is_err());
	}

	#[test]
	fn a_box_in_pixels_is_scaled_to_points() {
		let painted = PaintedBox { left: 58, top: 114, width: 970, height: 320, painted_pixels: 0 };
		let expected = Rectangle { x: 29.0, y: 57.0, width: 485.0, height: 160.0 };
		assert_eq!(painted.in_points(2.0), expected);
	}
}
