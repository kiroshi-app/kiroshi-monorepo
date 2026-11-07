use std::io::Cursor;

use image::imageops::FilterType;
use image::{DynamicImage, GenericImageView, ImageFormat, ImageReader, Limits};

const SIDE: u32 = 512;

const MAX_BYTES: u64 = 5 * 1024 * 1024;

const MAX_DECODED_BYTES: u64 = 256 * 1024 * 1024;

const SIGNATURE_LENGTH: usize = 12;

const PNG_SIGNATURE: &[u8] = &[0x89, b'P', b'N', b'G', 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SIGNATURE: &[u8] = &[0xff, 0xd8, 0xff];
const RIFF_SIGNATURE: &[u8] = b"RIFF";
const WEBP_SIGNATURE: &[u8] = b"WEBP";

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
	UnknownFormat,
	TooLarge { bytes: u64, limit: u64 },
	Undecodable { detail: String },
	Unwritable { detail: String },
}

pub fn normalised(bytes: &[u8]) -> Result<Vec<u8>, Rejection> {
	let length = bytes.len() as u64;
	if length > MAX_BYTES {
		return Err(Rejection::TooLarge { bytes: length, limit: MAX_BYTES });
	}
	let sniffed = sniff(bytes).ok_or(Rejection::UnknownFormat)?;
	let decoded = decode(bytes, sniffed)?;
	encode(squared(&decoded))
}

fn sniff(bytes: &[u8]) -> Option<ImageFormat> {
	let head = bytes.get(..SIGNATURE_LENGTH)?;
	if head.starts_with(PNG_SIGNATURE) {
		return Some(ImageFormat::Png);
	}
	if head.starts_with(JPEG_SIGNATURE) {
		return Some(ImageFormat::Jpeg);
	}
	if head.starts_with(RIFF_SIGNATURE) && &head[8..12] == WEBP_SIGNATURE {
		return Some(ImageFormat::WebP);
	}
	None
}

fn decode(bytes: &[u8], sniffed: ImageFormat) -> Result<DynamicImage, Rejection> {
	let mut limits = Limits::no_limits();
	limits.max_alloc = Some(MAX_DECODED_BYTES);
	let mut reader = ImageReader::with_format(Cursor::new(bytes), sniffed);
	reader.limits(limits);
	reader.decode().map_err(|error| Rejection::Undecodable { detail: error.to_string() })
}

fn squared(decoded: &DynamicImage) -> DynamicImage {
	let (width, height) = decoded.dimensions();
	let side = width.min(height);
	let cropped = decoded.crop_imm((width - side) / 2, (height - side) / 2, side, side);
	cropped.resize_exact(SIDE, SIDE, FilterType::Lanczos3)
}

fn encode(picture: DynamicImage) -> Result<Vec<u8>, Rejection> {
	let mut encoded = Cursor::new(Vec::new());
	picture
		.write_to(&mut encoded, ImageFormat::Png)
		.map_err(|error| Rejection::Undecodable { detail: error.to_string() })?;
	Ok(encoded.into_inner())
}

#[cfg(any(test, feature = "test-support"))]
pub mod fixtures {
	use super::*;

	pub fn a_picture(width: u32, height: u32, format: ImageFormat) -> Vec<u8> {
		let mut canvas = image::RgbImage::new(width, height);
		for (x, y, pixel) in canvas.enumerate_pixels_mut() {
			*pixel = image::Rgb([(x % 256) as u8, (y % 256) as u8, 128]);
		}
		let mut encoded = Cursor::new(Vec::new());
		DynamicImage::ImageRgb8(canvas)
			.write_to(&mut encoded, format)
			.expect("the fixture encodes");
		encoded.into_inner()
	}

	pub fn a_png(width: u32, height: u32) -> Vec<u8> {
		a_picture(width, height, ImageFormat::Png)
	}
}

#[cfg(test)]
mod tests {
	use super::fixtures::{a_picture, a_png};
	use super::*;

	fn dimensions_of(bytes: &[u8]) -> (u32, u32) {
		image::load_from_memory_with_format(bytes, ImageFormat::Png)
			.expect("the stored bytes decode as png")
			.dimensions()
	}

	#[test]
	fn the_three_accepted_formats_all_come_out_as_one() {
		for format in [ImageFormat::Png, ImageFormat::Jpeg] {
			let stored = normalised(&a_picture(40, 40, format)).expect("the picture is accepted");

			assert_eq!(
				image::guess_format(&stored).expect("a format"),
				ImageFormat::Png,
				"{format:?} was stored as something the UI would have to tell apart"
			);
		}
	}

	#[test]
	fn a_webp_signature_reaches_the_decoder() {
		let mut bytes = Vec::from(RIFF_SIGNATURE);
		bytes.extend_from_slice(&[0, 0, 0, 0]);
		bytes.extend_from_slice(WEBP_SIGNATURE);

		assert_eq!(sniff(&bytes), Some(ImageFormat::WebP));
		assert!(
			matches!(normalised(&bytes), Err(Rejection::Undecodable { .. })),
			"a truncated webp was refused as something other than undecodable"
		);
	}

	#[test]
	fn a_wide_picture_is_centre_cropped_to_a_square_of_one_size() {
		let stored = normalised(&a_png(200, 80)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	#[test]
	fn a_tall_picture_is_centre_cropped_to_the_same_square() {
		let stored = normalised(&a_png(80, 200)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	#[test]
	fn the_square_taken_out_of_a_wide_picture_is_its_middle() {
		let stored = normalised(&a_png(300, 100)).expect("the picture is accepted");
		let source = image::load_from_memory_with_format(&a_png(300, 100), ImageFormat::Png)
			.expect("the fixture decodes");
		let expected =
			source.crop_imm(100, 0, 100, 100).resize_exact(SIDE, SIDE, FilterType::Lanczos3);

		assert_eq!(stored, encode(expected).expect("the expectation encodes"));
	}

	#[test]
	fn a_picture_smaller_than_the_stored_size_is_still_stored_at_it() {
		let stored = normalised(&a_png(16, 16)).expect("the picture is accepted");

		assert_eq!(dimensions_of(&stored), (SIDE, SIDE));
	}

	#[test]
	fn a_format_this_build_does_not_decode_is_refused_on_its_bytes() {
		assert_eq!(normalised(b"GIF89a\0\0\0\0\0\0"), Err(Rejection::UnknownFormat));
	}

	#[test]
	fn bytes_that_are_not_a_picture_are_refused_however_they_were_labelled() {
		let refused = normalised(b"#!/bin/sh\nrm -rf /\n");

		assert_eq!(refused, Err(Rejection::UnknownFormat));
	}

	#[test]
	fn a_picture_shorter_than_a_signature_is_refused_rather_than_decoded() {
		assert_eq!(normalised(&PNG_SIGNATURE[..4]), Err(Rejection::UnknownFormat));
		assert_eq!(normalised(&[]), Err(Rejection::UnknownFormat));
	}

	#[test]
	fn anything_over_the_limit_is_refused_before_it_is_sniffed() {
		let oversized = vec![0u8; (MAX_BYTES + 1) as usize];

		assert_eq!(
			normalised(&oversized),
			Err(Rejection::TooLarge { bytes: MAX_BYTES + 1, limit: MAX_BYTES })
		);
	}

	#[test]
	fn a_picture_right_on_the_limit_is_accepted() {
		let mut padded = a_png(8, 8);
		assert!(padded.len() as u64 <= MAX_BYTES, "the fixture is already over the limit");
		padded.resize(MAX_BYTES as usize, 0);

		assert!(normalised(&padded).is_ok(), "the boundary itself was refused");
	}

	#[test]
	fn a_truncated_picture_of_an_accepted_format_is_refused_by_the_decoder() {
		let truncated = &a_png(40, 40)[..20];

		assert!(
			matches!(normalised(truncated), Err(Rejection::Undecodable { .. })),
			"truncated bytes were not refused as undecodable"
		);
	}
}
