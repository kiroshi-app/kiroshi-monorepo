pub const SIZE: usize = 32;

const DISC: [u8; 4] = [0xE5, 0x48, 0x4D, 0xFF];

const INK: [u8; 4] = [0xFF, 0xFF, 0xFF, 0xFF];

const GLYPH_WIDTH: usize = 3;

const GLYPH_HEIGHT: usize = 5;

const DIGITS: [[u8; GLYPH_HEIGHT]; 10] = [
	[0b111, 0b101, 0b101, 0b101, 0b111],
	[0b010, 0b110, 0b010, 0b010, 0b111],
	[0b111, 0b001, 0b111, 0b100, 0b111],
	[0b111, 0b001, 0b111, 0b001, 0b111],
	[0b101, 0b101, 0b111, 0b001, 0b001],
	[0b111, 0b100, 0b111, 0b001, 0b111],
	[0b111, 0b100, 0b111, 0b101, 0b111],
	[0b111, 0b001, 0b001, 0b001, 0b001],
	[0b111, 0b101, 0b111, 0b101, 0b111],
	[0b111, 0b101, 0b111, 0b001, 0b111],
];

const PLUS: [u8; GLYPH_HEIGHT] = [0b000, 0b010, 0b111, 0b010, 0b000];

const LARGEST_SHOWN: u32 = 99;

pub fn label(count: u32) -> String {
	if count > LARGEST_SHOWN { format!("{LARGEST_SHOWN}+") } else { count.to_string() }
}

fn glyph(character: char) -> [u8; GLYPH_HEIGHT] {
	character.to_digit(10).map_or(PLUS, |digit| DIGITS[digit as usize])
}

pub fn rgba(count: u32) -> Vec<u8> {
	let glyphs: Vec<[u8; GLYPH_HEIGHT]> = label(count).chars().map(glyph).collect();
	let scale = match glyphs.len() {
		1 => 4,
		2 => 3,
		_ => 2,
	};
	let text_width = (glyphs.len() * (GLYPH_WIDTH + 1) - 1) * scale;
	let left = (SIZE - text_width) / 2;
	let top = (SIZE - GLYPH_HEIGHT * scale) / 2;
	let mut pixels = vec![0; SIZE * SIZE * 4];
	for y in 0..SIZE {
		for x in 0..SIZE {
			if is_inside_disc(x, y) {
				paint(&mut pixels, x, y, DISC);
			}
		}
	}
	for (at, rows) in glyphs.iter().enumerate() {
		let glyph_left = left + at * (GLYPH_WIDTH + 1) * scale;
		for (row, bits) in rows.iter().enumerate() {
			for column in 0..GLYPH_WIDTH {
				if bits & (1 << (GLYPH_WIDTH - 1 - column)) == 0 {
					continue;
				}
				for dy in 0..scale {
					for dx in 0..scale {
						let x = glyph_left + column * scale + dx;
						let y = top + row * scale + dy;
						paint(&mut pixels, x, y, INK);
					}
				}
			}
		}
	}
	pixels
}

fn is_inside_disc(x: usize, y: usize) -> bool {
	let radius = SIZE as f32 / 2.0;
	let dx = x as f32 + 0.5 - radius;
	let dy = y as f32 + 0.5 - radius;
	dx * dx + dy * dy <= radius * radius
}

fn paint(pixels: &mut [u8], x: usize, y: usize, colour: [u8; 4]) {
	let at = (y * SIZE + x) * 4;
	pixels[at..at + 4].copy_from_slice(&colour);
}

#[cfg(test)]
mod tests {
	use super::*;

	fn pixel(pixels: &[u8], x: usize, y: usize) -> [u8; 4] {
		let at = (y * SIZE + x) * 4;
		[pixels[at], pixels[at + 1], pixels[at + 2], pixels[at + 3]]
	}

	fn inked(pixels: &[u8]) -> Vec<(usize, usize)> {
		(0..SIZE)
			.flat_map(|y| (0..SIZE).map(move |x| (x, y)))
			.filter(|&(x, y)| pixel(pixels, x, y) == INK)
			.collect()
	}

	#[test]
	fn a_count_up_to_ninety_nine_is_labelled_as_it_is() {
		assert_eq!(label(1), "1");
		assert_eq!(label(99), "99");
	}

	#[test]
	fn a_count_above_ninety_nine_is_labelled_ninety_nine_plus() {
		assert_eq!(label(100), "99+");
		assert_eq!(label(u32::MAX), "99+");
	}

	#[test]
	fn the_icon_is_a_disc_on_a_transparent_square() {
		let pixels = rgba(1);

		assert_eq!(pixel(&pixels, 0, 0), [0, 0, 0, 0]);
		assert_eq!(pixel(&pixels, 4, SIZE / 2), DISC);
	}

	#[test]
	fn a_one_draws_its_stem_down_the_middle() {
		let pixels = rgba(1);

		assert_eq!(pixel(&pixels, SIZE / 2, SIZE / 2), INK);
	}

	#[test]
	fn every_label_is_drawn_inside_the_disc() {
		for count in [1, 8, 42, 99, 100] {
			let ink = inked(&rgba(count));

			assert!(!ink.is_empty(), "{count} draws nothing");
			assert!(ink.iter().all(|&(x, y)| is_inside_disc(x, y)), "{count} leaves the disc");
		}
	}

	#[test]
	fn two_counts_draw_two_different_icons() {
		assert_ne!(rgba(3), rgba(8));
	}
}
