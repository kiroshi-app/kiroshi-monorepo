use image::{Rgb, RgbImage};
use tauri::test::{mock_builder, MockRuntime};
use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

use super::*;
use crate::test_app::{an_app_of_its_own, AppOfItsOwn};

fn an_app(name: &str) -> AppOfItsOwn {
	an_app_of_its_own(&format!("screenshot-{name}"), mock_builder())
}

fn a_document() -> ScreenshotTarget {
	let block = ScreenshotBlock { id: "intro".to_owned(), markdown: "# Intro".to_owned() };
	ScreenshotTarget::Document { name: "notes.md".to_owned(), blocks: vec![block] }
}

fn png_of(width: u32, height: u32, pixel: impl Fn(u32, u32) -> Rgb<u8>) -> Vec<u8> {
	let mut png = Vec::new();
	DynamicImage::ImageRgb8(RgbImage::from_fn(width, height, pixel))
		.write_to(&mut Cursor::new(&mut png), ImageFormat::Png)
		.expect("the png encodes");
	png
}

fn plain(width: u32, height: u32) -> String {
	BASE64_STANDARD.encode(png_of(width, height, |_, _| Rgb([255, 255, 255])))
}

fn drawn(width: u32, height: u32) -> String {
	BASE64_STANDARD.encode(png_of(width, height, |x, _| {
		if x == 0 {
			Rgb([20, 20, 20])
		} else {
			Rgb([255, 255, 255])
		}
	}))
}

fn noise(edge: u32) -> String {
	BASE64_STANDARD.encode(png_of(edge, edge, |x, y| {
		let seed = (y * edge + x).wrapping_mul(2_654_435_761).wrapping_add(1_013_904_223);
		let [red, green, blue, _] = seed.wrapping_mul(1_664_525).to_le_bytes();
		Rgb([red, green, blue])
	}))
}

fn pending_ids(app: &AppHandle<MockRuntime>) -> Vec<String> {
	screenshots(crate::events::core(app)).held().keys().cloned().collect()
}

async fn requests_in_flight(app: &AppHandle<MockRuntime>, count: usize) -> Vec<String> {
	loop {
		let ids = pending_ids(app);
		if ids.len() == count {
			return ids;
		}
		tokio::time::sleep(Duration::from_millis(5)).await;
	}
}

fn window_of(app: &AppHandle<MockRuntime>, request_id: &str) -> WebviewWindow<MockRuntime> {
	app.get_webview_window(&window_label(request_id)).expect("the hidden window is open")
}

fn rendered(png: String) -> ScreenshotRendered {
	ScreenshotRendered::Rendered { png }
}

#[tokio::test(flavor = "current_thread")]
async fn concurrent_screenshots_each_answer_the_image_their_own_window_rendered() {
	let app = an_app("concurrent");
	let handle = app.handle().clone();
	let shoot = |handle: AppHandle<MockRuntime>| {
		tokio::spawn(async move {
			render(crate::events::core(&handle), "personal", Scale(1), a_document()).await
		})
	};
	let (first, second) = (shoot(handle.clone()), shoot(handle.clone()));
	let ids = requests_in_flight(&handle, 2).await;
	let size_of = |id: &String| if *id == ids[0] { (10, 20) } else { (30, 40) };
	for id in ids.iter().rev() {
		let job = library_screenshot_job(window_of(&handle, id)).expect("the job is handed");
		assert_eq!(job.request_id, *id);
		let (width, height) = size_of(id);
		library_screenshot_answer(
			window_of(&handle, id),
			id.clone(),
			rendered(drawn(width, height)),
		)
		.expect("the answer lands");
	}

	let mut sizes: Vec<(u32, u32)> = Vec::new();
	for shot in [first, second] {
		let shot = shot.await.expect("the task ends").expect("the screenshot renders");
		sizes.push((shot.rendered.width, shot.rendered.height));
	}

	sizes.sort_unstable();
	assert_eq!(sizes, [(10, 20), (30, 40)]);
	assert!(pending_ids(&handle).is_empty());
}

#[tokio::test(flavor = "current_thread", start_paused = true)]
async fn a_render_silent_for_15_s_is_refused_as_render_timed_out_and_its_request_dropped() {
	let app = an_app("timeout");
	let handle = app.handle().clone();
	let shot = tokio::spawn({
		let handle = handle.clone();
		async move { render(crate::events::core(&handle), "personal", Scale(1), a_document()).await }
	});
	let id = requests_in_flight(&handle, 1).await.remove(0);
	assert!(handle.get_webview_window(&window_label(&id)).is_some());

	let refused = shot.await.expect("the task ends").expect_err("timed out");

	assert!(matches!(refused, ToolRefusal::RenderTimedOut { seconds: 15 }), "got {refused:?}");
	assert!(pending_ids(&handle).is_empty());
}

#[tokio::test(flavor = "current_thread")]
async fn a_window_reads_and_answers_only_its_own_request() {
	let app = an_app("own-request");
	let handle = app.handle().clone();
	let shoot = |handle: AppHandle<MockRuntime>| {
		tokio::spawn(async move {
			render(crate::events::core(&handle), "personal", Scale(1), a_document()).await
		})
	};
	let (first, second) = (shoot(handle.clone()), shoot(handle.clone()));
	let ids = requests_in_flight(&handle, 2).await;
	let main = WebviewWindowBuilder::new(&handle, "main", WebviewUrl::default())
		.build()
		.expect("the main window opens");

	let forged = library_screenshot_answer(
		window_of(&handle, &ids[0]),
		ids[1].clone(),
		rendered(drawn(2, 1)),
	);
	let from_main = library_screenshot_answer(main.clone(), ids[0].clone(), rendered(drawn(2, 1)));

	assert_eq!(forged, Err(ScreenshotRequestError::UnknownRequest { request_id: ids[1].clone() }));
	assert_eq!(from_main, Err(ScreenshotRequestError::NotAScreenshotWindow));
	assert_eq!(library_screenshot_job(main), Err(ScreenshotRequestError::NotAScreenshotWindow));
	for id in &ids {
		let failure = ScreenshotRendered::Failed { reason: "no canvas".to_owned() };
		library_screenshot_answer(window_of(&handle, id), id.clone(), failure).expect("answered");
	}
	for shot in [first, second] {
		let refused = shot.await.expect("the task ends").expect_err("failed");
		assert!(
			matches!(refused, ToolRefusal::RenderFailed { ref detail } if detail == "no canvas")
		);
	}
}

#[test]
fn a_wide_render_is_downscaled_to_a_long_edge_of_1568_px() {
	let shot = fitted(&drawn(3136, 1000), Scale(2)).expect("fitted");

	assert_eq!(shot.rendered, Rendered { width: 1568, height: 500, scale: 2 });
}

#[test]
fn a_render_within_bounds_is_answered_byte_for_byte() {
	let png = drawn(400, 300);

	let shot = fitted(&png, Scale(1)).expect("fitted");

	assert_eq!(shot.content, png);
	assert_eq!(shot.rendered, Rendered { width: 400, height: 300, scale: 1 });
}

#[test]
fn a_render_heavier_than_the_cap_shrinks_until_it_fits() {
	let shot = fitted(&noise(1568), Scale(1)).expect("fitted");

	let bytes = BASE64_STANDARD.decode(&shot.content).expect("base64");
	assert!(bytes.len() as u64 <= MAX_SHOWN_IMAGE_BYTES, "{} bytes", bytes.len());
	assert!(shot.rendered.width < 1568);
	assert_eq!(shot.rendered.width, shot.rendered.height);
}

#[test]
fn an_unreadable_render_is_refused_as_render_failed() {
	let refused = fitted("not a png", Scale(1)).expect_err("refused");

	assert!(matches!(refused, ToolRefusal::RenderFailed { .. }), "got {refused:?}");
}

#[test]
fn the_scale_is_1_or_2_and_1_when_left_out() {
	let scale = |value: serde_json::Value| serde_json::from_value::<Scale>(value);

	assert_eq!(scale(serde_json::json!(2)).expect("two"), Scale(2));
	assert!(scale(serde_json::json!(3)).is_err());
	assert!(scale(serde_json::json!(0)).is_err());
	assert_eq!(Scale::default(), Scale(1));
}

#[test]
fn a_board_target_zooms_out_so_its_long_edge_fits_1568_px_at_its_scale_and_never_zooms_in() {
	let zoom_of = |width: i64, height: i64, scale: u8| {
		let frame = Frame { x: -24, y: -24, width, height };
		match ScreenshotTarget::board(
			"plan.canvas".to_owned(),
			"{}".to_owned(),
			frame,
			Scale(scale),
		) {
			ScreenshotTarget::Board { zoom, .. } => zoom,
			ScreenshotTarget::Document { .. } => unreachable!("a board target"),
		}
	};

	assert!((zoom_of(400, 300, 2) - 1.0).abs() < f64::EPSILON);
	assert!((zoom_of(3136, 1000, 1) - 0.5).abs() < f64::EPSILON);
	assert!((zoom_of(1000, 3136, 2) - 0.25).abs() < f64::EPSILON);
	assert!((zoom_of(100_000, 10, 1) - 0.1).abs() < f64::EPSILON);
}

#[test]
fn a_capture_of_one_colour_is_refused_as_blank_and_never_answered_as_a_png() {
	let refused = fitted(&plain(400, 300), Scale(1)).expect_err("blank");

	let ToolRefusal::RenderFailed { detail } = refused else {
		panic!("a failed render, got {refused:?}");
	};
	assert_eq!(detail, "the capture is blank: all 400 x 300 pixels are one colour");
}
