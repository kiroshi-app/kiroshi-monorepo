#[cfg(not(target_os = "macos"))]
fn main() {}

#[cfg(target_os = "macos")]
fn main() {
	macos::run();
}

#[cfg(target_os = "macos")]
mod macos {
	use std::io::Cursor;
	use std::panic::{catch_unwind, AssertUnwindSafe};
	use std::sync::mpsc::{channel, Sender};
	use std::time::{Duration, Instant};

	use base64::prelude::{Engine as _, BASE64_STANDARD};
	use image::{ImageFormat, Rgba, RgbaImage};
	use kiroshi_app::library::host::screenshot::{
		library_screenshot_answer, render, Scale, ScreenshotRendered, ScreenshotTarget, Shot,
		WINDOW_PREFIX,
	};
	use kiroshi_app::library::host::ToolRefusal;
	use objc2::rc::Retained;
	use objc2::MainThreadMarker;
	use objc2_app_kit::{NSAppearanceCustomization, NSApplication, NSWindow};
	use tauri::async_runtime::JoinHandle;
	use tauri::test::{mock_context, noop_assets};
	use tauri::{
		ActivationPolicy, AppHandle, Builder, Manager, RunEvent, Theme, WebviewUrl, WebviewWindow,
		WebviewWindowBuilder, Wry,
	};

	const MAIN: &str = "main";
	const WAIT: Duration = Duration::from_secs(10);
	const POLL: Duration = Duration::from_millis(20);

	#[derive(Debug, Clone, PartialEq, Eq)]
	struct Appearance {
		reported_theme: Theme,
		main_window: String,
		application_wide: Option<String>,
	}

	type Capture = JoinHandle<Result<Shot, ToolRefusal>>;

	pub fn run() {
		let mut app = Builder::<Wry>::default()
			.build(mock_context(noop_assets()))
			.expect("the app builds on the real runtime");
		app.set_activation_policy(ActivationPolicy::Accessory);
		let (verdict, verdicts) = channel();
		let mut verdict = Some(verdict);
		let code = app.run_return(move |handle, event| {
			if let (RunEvent::Ready, Some(verdict)) = (event, verdict.take()) {
				started(handle.clone(), verdict);
			}
		});
		let failures: Vec<String> = verdicts.try_iter().collect();
		for failure in &failures {
			eprintln!("FAILED {failure}");
		}
		assert_eq!(code, 0, "the event loop exited with {code}");
		assert!(failures.is_empty(), "{} capture appearance check(s) failed", failures.len());
		println!("capture_appearance: every check passed");
	}

	fn started(app: AppHandle<Wry>, verdict: Sender<String>) {
		std::thread::spawn(move || {
			let main = WebviewWindowBuilder::new(&app, MAIN, WebviewUrl::App("index.html".into()))
				.visible(false)
				.build()
				.expect("the main window builds");
			let failures = catch_unwind(AssertUnwindSafe(|| checked(&app, &main)))
				.unwrap_or_else(|_| vec!["the scenario panicked".to_owned()]);
			for failure in failures {
				verdict.send(failure).expect("the verdict is read after the loop");
			}
			app.exit(0);
		});
	}

	fn checked(app: &AppHandle<Wry>, main: &WebviewWindow<Wry>) -> Vec<String> {
		let mut failures = Vec::new();
		let before = appearance_of(main);
		println!("before any capture: {before:?}");
		let mut expect_unchanged = |moment: &str, now: Appearance| {
			println!("{moment}: {now:?}");
			if now.application_wide.is_some() {
				failures.push(format!("{moment}: the application appearance is forced: {now:?}"));
			}
			if (now.reported_theme, &now.main_window) != (before.reported_theme, &before.main_window) {
				failures.push(format!("{moment}: the main window moved from {before:?} to {now:?}"));
			}
		};

		let failing = started_capture(app);
		let label = opened_capture(app, &[]);
		expect_unchanged("a failing capture built", appearance_of(main));
		answered(app, &label, ScreenshotRendered::Failed { reason: "refused".to_owned() });
		settled(app, failing, &label);
		expect_unchanged("a failing capture destroyed", appearance_of(main));

		let ending = started_capture(app);
		let label = opened_capture(app, &[]);
		expect_unchanged("a rendered capture built", appearance_of(main));
		answered(app, &label, ScreenshotRendered::Rendered { png: two_colour_png() });
		settled(app, ending, &label);
		expect_unchanged("a rendered capture destroyed", appearance_of(main));

		let answered_one = started_capture(app);
		let first = opened_capture(app, &[]);
		let timed_out = started_capture(app);
		let second = opened_capture(app, &[first.as_str()]);
		expect_unchanged("two captures overlapping", appearance_of(main));
		answered(app, &first, ScreenshotRendered::Rendered { png: two_colour_png() });
		settled(app, answered_one, &first);
		expect_unchanged("one of two overlapping captures destroyed", appearance_of(main));
		settled(app, timed_out, &second);
		expect_unchanged("a timed out capture destroyed", appearance_of(main));
		failures
	}

	fn started_capture(app: &AppHandle<Wry>) -> Capture {
		let app = app.clone();
		tauri::async_runtime::spawn(async move {
			let target = ScreenshotTarget::Document { name: "Notes".to_owned(), blocks: Vec::new() };
			render(&app, "space", Scale::default(), target).await
		})
	}

	fn opened_capture(app: &AppHandle<Wry>, already_open: &[&str]) -> String {
		waited("a capture window to open", || {
			app.webview_windows()
				.into_keys()
				.find(|label| label.starts_with(WINDOW_PREFIX) && !already_open.contains(&label.as_str()))
		})
	}

	fn answered(app: &AppHandle<Wry>, label: &str, answer: ScreenshotRendered) {
		let window = app.get_webview_window(label).expect("the capture window is open");
		let request_id = label.trim_start_matches(WINDOW_PREFIX).to_owned();
		library_screenshot_answer(window, request_id, answer).expect("the capture takes its answer");
	}

	fn settled(app: &AppHandle<Wry>, capture: Capture, label: &str) {
		let outcome = tauri::async_runtime::block_on(capture).expect("the capture task ends");
		println!("capture {label} settled: {:?}", outcome.as_ref().map(|shot| shot.rendered));
		waited("the capture window to be destroyed", || {
			app.get_webview_window(label).is_none().then_some(())
		});
	}

	fn appearance_of(main: &WebviewWindow<Wry>) -> Appearance {
		let reported_theme = main.theme().expect("the main window reports its theme");
		let (sent, read) = channel();
		let window = main.clone();
		main.run_on_main_thread(move || {
			let mtm = MainThreadMarker::new().expect("run on the main thread");
			let ns_window = ns_window_of(&window);
			let application = NSApplication::sharedApplication(mtm);
			let appearance = (
				ns_window.effectiveAppearance().name().to_string(),
				application.appearance().map(|forced| forced.name().to_string()),
			);
			sent.send(appearance).expect("the appearance is read back");
		})
		.expect("the main thread takes the read");
		let (main_window, application_wide) = read.recv_timeout(WAIT).expect("the main thread answers");
		Appearance { reported_theme, main_window, application_wide }
	}

	fn ns_window_of(window: &WebviewWindow<Wry>) -> Retained<NSWindow> {
		let handle = window.ns_window().expect("the main window has an NSWindow");
		unsafe { Retained::retain(handle.cast::<NSWindow>()) }.expect("the NSWindow is alive")
	}

	fn two_colour_png() -> String {
		let mut picture = RgbaImage::from_pixel(2, 1, Rgba([255, 255, 255, 255]));
		picture.put_pixel(1, 0, Rgba([0, 0, 0, 255]));
		let mut png = Vec::new();
		picture.write_to(&mut Cursor::new(&mut png), ImageFormat::Png).expect("the PNG encodes");
		BASE64_STANDARD.encode(png)
	}

	fn waited<T>(what: &str, mut found: impl FnMut() -> Option<T>) -> T {
		let deadline = Instant::now() + WAIT;
		loop {
			if let Some(value) = found() {
				return value;
			}
			assert!(Instant::now() < deadline, "timed out waiting for {what}");
			std::thread::sleep(POLL);
		}
	}
}
