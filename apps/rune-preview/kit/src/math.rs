use std::cell::RefCell;
use std::collections::HashMap;

use katex_native::katex::KatexContext;
use rune::color::srgb_encode;
use rune::{Color, El, Pixels, SurfaceFit, el};

pub const EM_PER_TEXT: f32 = 1.21;
const RASTER_SCALE: f32 = 2.0;

#[derive(Clone)]
pub struct Formula {
	pixels: Pixels,
	width: f32,
	height: f32,
	pub baseline: f32,
}

impl Formula {
	pub fn view(&self, source: &str) -> El {
		el().size(self.width, self.height).label(source).pixels_fit(&self.pixels, SurfaceFit::Fit)
	}
}

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
pub enum Mode {
	Inline,
	Display,
}

type Key = (String, Mode, [u8; 4], u32);

#[derive(Default)]
pub struct Typesetter {
	context: KatexContext,
	typeset: RefCell<HashMap<Key, Result<Formula, String>>>,
}

impl Typesetter {
	pub fn formula(
		&self,
		source: &str,
		mode: Mode,
		ink: Color,
		text_size: f32,
	) -> Result<Formula, String> {
		let ink = srgb8(ink);
		let key = (source.to_owned(), mode, ink, text_size.to_bits());
		if let Some(held) = self.typeset.borrow().get(&key) {
			return held.clone();
		}
		let typeset = self.rasterized(source, mode, ink, text_size);
		self.typeset.borrow_mut().insert(key, typeset.clone());
		typeset
	}

	fn rasterized(
		&self,
		source: &str,
		mode: Mode,
		[r, g, b, a]: [u8; 4],
		text_size: f32,
	) -> Result<Formula, String> {
		let layout = katex_native::layout(&self.context, source, mode == Mode::Display)
			.map_err(|failure| failure.to_string())?;
		let px_per_em = f64::from(text_size * EM_PER_TEXT * RASTER_SCALE);
		let colour = katex_native::Color { r, g, b, a };
		let raster = katex_native::raster::rasterize(&layout, px_per_em, colour)
			.ok_or_else(|| "the formula draws nothing".to_owned())?;
		let pixels = Pixels::new();
		pixels.set(raster.width, raster.height, raster.rgba);
		Ok(Formula {
			pixels,
			width: raster.width as f32 / RASTER_SCALE,
			height: raster.height as f32 / RASTER_SCALE,
			baseline: raster.baseline as f32 / RASTER_SCALE,
		})
	}
}

fn srgb8(colour: Color) -> [u8; 4] {
	let byte = |channel: f32| (channel.clamp(0.0, 1.0) * 255.0).round() as u8;
	[
		byte(srgb_encode(colour.r)),
		byte(srgb_encode(colour.g)),
		byte(srgb_encode(colour.b)),
		byte(colour.a),
	]
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_formula_is_typeset_once_and_a_broken_one_says_why() {
		let typesetter = Typesetter::default();
		let sum = typesetter.formula(
			r"\sum_{i=1}^{n} o_i = \frac{3n}{4}",
			Mode::Display,
			Color::BLACK,
			14.0,
		);
		let sum = sum.expect("KaTeX lays the sum out");
		assert!(sum.width > sum.height && sum.baseline > 0.0 && sum.baseline < sum.height);
		assert_eq!(typesetter.typeset.borrow().len(), 1);
		assert!(typesetter.formula(r"\frac{1}{", Mode::Inline, Color::BLACK, 14.0).is_err());
	}
}
