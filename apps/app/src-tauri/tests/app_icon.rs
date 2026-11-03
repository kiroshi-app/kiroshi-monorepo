use std::path::PathBuf;

use image::RgbaImage;

const GRID_CANVAS: u32 = 1024;
const GRID_INSET: u32 = 100;

struct PaintedBounds {
	left: u32,
	top: u32,
	right: u32,
	bottom: u32,
}

fn icon(relative: &str) -> RgbaImage {
	let path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(relative);
	image::open(&path)
		.unwrap_or_else(|failure| panic!("{} opens: {failure}", path.display()))
		.to_rgba8()
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

fn assert_on_the_macos_grid(relative: &str) {
	let icon = icon(relative);
	let (width, height) = icon.dimensions();
	assert_eq!(width, height, "{relative} is square");
	let inset = width * GRID_INSET / GRID_CANVAS;
	assert!(inset > 0, "{relative} is large enough to carry a grid margin");
	let painted = painted_bounds(&icon).unwrap_or_else(|| panic!("{relative} paints nothing"));
	assert!(
		painted.left >= inset
			&& painted.top >= inset
			&& painted.right < width - inset
			&& painted.bottom < height - inset,
		"{relative} paints x[{},{}] y[{},{}], outside the grid body [{inset},{})",
		painted.left,
		painted.right,
		painted.top,
		painted.bottom,
		width - inset,
	);
}

#[test]
fn the_release_icon_sits_inside_the_macos_grid_body() {
	assert_on_the_macos_grid("icons/icon.png");
}

#[test]
fn the_dev_icon_sits_inside_the_macos_grid_body() {
	assert_on_the_macos_grid("icons/dev/icon.png");
}
