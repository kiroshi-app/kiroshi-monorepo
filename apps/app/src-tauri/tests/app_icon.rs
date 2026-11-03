use std::path::PathBuf;

use image::{ImageFormat, RgbaImage};

const GRID_CANVAS: u32 = 1024;
const GRID_INSET: u32 = 100;
const GRID_PNGS: [&str; 4] = ["icon.png", "128x128@2x.png", "128x128.png", "64x64.png"];
const ICNS_HEADER_LEN: usize = 8;
const ICNS_1024_ENTRY: &[u8; 4] = b"ic10";

struct PaintedBounds {
	left: u32,
	top: u32,
	right: u32,
	bottom: u32,
}

fn read_icon_file(relative: &str) -> Vec<u8> {
	let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative);
	std::fs::read(&path).unwrap_or_else(|failure| panic!("{} reads: {failure}", path.display()))
}

fn decoded_png(name: &str, bytes: &[u8]) -> RgbaImage {
	image::load_from_memory_with_format(bytes, ImageFormat::Png)
		.unwrap_or_else(|failure| panic!("{name} decodes as PNG: {failure}"))
		.to_rgba8()
}

fn icns_entry<'a>(icns: &'a [u8], kind: &[u8; 4]) -> Option<&'a [u8]> {
	let mut offset = ICNS_HEADER_LEN;
	while let Some(header) = icns.get(offset..offset + ICNS_HEADER_LEN) {
		let length = u32::from_be_bytes(header[4..].try_into().ok()?) as usize;
		let entry = icns.get(offset + ICNS_HEADER_LEN..offset.checked_add(length)?)?;
		if &header[..4] == kind {
			return Some(entry);
		}
		offset += length;
	}
	None
}

fn icns_1024(name: &str, icns: &[u8]) -> RgbaImage {
	let entry =
		icns_entry(icns, ICNS_1024_ENTRY).unwrap_or_else(|| panic!("{name} carries no ic10 entry"));
	decoded_png(&format!("{name} ic10"), entry)
}

fn painted_bounds(icon: &RgbaImage) -> Option<PaintedBounds> {
	let painted = || icon.enumerate_pixels().filter(|(_, _, pixel)| pixel[3] > 0);
	Some(PaintedBounds {
		left: painted().map(|(x, _, _)| x).min()?,
		top: painted().map(|(_, y, _)| y).min()?,
		right: painted().map(|(x, _, _)| x).max()?,
		bottom: painted().map(|(_, y, _)| y).max()?,
	})
}

fn assert_on_the_macos_grid(name: &str, icon: &RgbaImage) {
	let (width, height) = icon.dimensions();
	assert_eq!(width, height, "{name} is square");
	let inset = width * GRID_INSET / GRID_CANVAS;
	assert!(inset > 0, "{name} is large enough to carry a grid margin");
	let painted = painted_bounds(icon).unwrap_or_else(|| panic!("{name} paints nothing"));
	assert!(
		painted.left >= inset
			&& painted.top >= inset
			&& painted.right < width - inset
			&& painted.bottom < height - inset,
		"{name} paints x[{},{}] y[{},{}], outside the grid body [{inset},{})",
		painted.left,
		painted.right,
		painted.top,
		painted.bottom,
		width - inset,
	);
}

fn assert_the_set_on_the_macos_grid(set: &str) {
	for png in GRID_PNGS {
		let relative = format!("{set}/{png}");
		assert_on_the_macos_grid(&relative, &decoded_png(&relative, &read_icon_file(&relative)));
	}
	let icns = format!("{set}/icon.icns");
	assert_on_the_macos_grid(&format!("{icns} ic10"), &icns_1024(&icns, &read_icon_file(&icns)));
}

#[test]
fn the_release_icons_sit_inside_the_macos_grid_body() {
	assert_the_set_on_the_macos_grid("icons");
}

#[test]
fn the_dev_icons_sit_inside_the_macos_grid_body() {
	assert_the_set_on_the_macos_grid("icons/dev");
}

#[test]
#[should_panic(expected = "only-ic09.icns carries no ic10 entry")]
fn an_icns_without_a_1024_entry_fails_naming_the_file() {
	let only_ic09 =
		[b"icns".as_slice(), &16u32.to_be_bytes(), b"ic09", &8u32.to_be_bytes()].concat();
	icns_1024("only-ic09.icns", &only_ic09);
}
