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
	use kiroshi_app::board::Frame;
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
	const LIGHT: &str = "NSAppearanceNameAqua";
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
		let mut expect_unchanged = |moment: &str, now: Appearance, capture: Option<&str>| {
			println!("{moment}: {now:?}");
			if now.application_wide.is_some() {
				failures.push(format!("{moment}: the application appearance is forced: {now:?}"));
			}
			if (now.reported_theme, &now.main_window)
				!= (before.reported_theme, &before.main_window)
			{
				failures
					.push(format!("{moment}: the main window moved from {before:?} to {now:?}"));
			}
			let Some(label) = capture else {
				return;
			};
			let painted = effective_appearance_of(&app.get_webview_window(label).expect("open"));
			println!("{moment}: the capture window wears {painted}");
			if painted != LIGHT {
				failures.push(format!("{moment}: the capture window wears {painted}, not {LIGHT}"));
			}
		};

		let failing = started_capture(app, document());
		let label = opened_capture(app, &[]);
		expect_unchanged("a failing document capture built", appearance_of(main), Some(&label));
		answered(app, &label, ScreenshotRendered::Failed { reason: "refused".to_owned() });
		settled(app, failing, &label);
		expect_unchanged("a failing document capture destroyed", appearance_of(main), None);

		let ending = started_capture(app, board());
		let label = opened_capture(app, &[]);
		expect_unchanged("a rendered board capture built", appearance_of(main), Some(&label));
		answered(app, &label, ScreenshotRendered::Rendered { png: two_colour_png() });
		settled(app, ending, &label);
		expect_unchanged("a rendered board capture destroyed", appearance_of(main), None);

		let answered_one = started_capture(app, document());
		let first = opened_capture(app, &[]);
		let timed_out = started_capture(app, board());
		let second = opened_capture(app, &[first.as_str()]);
		expect_unchanged("two captures overlapping", appearance_of(main), Some(&first));
		expect_unchanged("two captures overlapping", appearance_of(main), Some(&second));
		answered(app, &first, ScreenshotRendered::Rendered { png: two_colour_png() });
		settled(app, answered_one, &first);
		expect_unchanged("one of two overlapping captures destroyed", appearance_of(main), None);
		settled(app, timed_out, &second);
		expect_unchanged("a timed out capture destroyed", appearance_of(main), None);
		failures
	}

	fn document() -> ScreenshotTarget {
		ScreenshotTarget::Document { name: "Notes".to_owned(), blocks: Vec::new() }
	}

	fn board() -> ScreenshotTarget {
		let frame = Frame { x: 0, y: 0, width: 640, height: 480 };
		ScreenshotTarget::board("Plan".to_owned(), "canvas".to_owned(), frame, Scale::default())
	}

	fn started_capture(app: &AppHandle<Wry>, target: ScreenshotTarget) -> Capture {
		let app = app.clone();
		tauri::async_runtime::spawn(
			async move { render(&app, "space", Scale::default(), target).await },
		)
	}

	fn opened_capture(app: &AppHandle<Wry>, already_open: &[&str]) -> String {
		waited("a capture window to open", || {
			app.webview_windows().into_keys().find(|label| {
				label.starts_with(WINDOW_PREFIX) && !already_open.contains(&label.as_str())
			})
		})
	}

	fn answered(app: &AppHandle<Wry>, label: &str, answer: ScreenshotRendered) {
		let window = app.get_webview_window(label).expect("the capture window is open");
		let request_id = label.trim_start_matches(WINDOW_PREFIX).to_owned();
		library_screenshot_answer(window, request_id, answer)
			.expect("the capture takes its answer");
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
		let window = main.clone();
		let (main_window, application_wide) = on_main_thread(main, move || {
			let mtm = MainThreadMarker::new().expect("run on the main thread");
			let forced = NSApplication::sharedApplication(mtm).appearance();
			(
				ns_window_of(&window).effectiveAppearance().name().to_string(),
				forced.map(|appearance| appearance.name().to_string()),
			)
		});
		Appearance { reported_theme, main_window, application_wide }
	}

	fn effective_appearance_of(window: &WebviewWindow<Wry>) -> String {
		let read = window.clone();
		on_main_thread(window, move || ns_window_of(&read).effectiveAppearance().name().to_string())
	}

	fn on_main_thread<T: Send + 'static>(
		window: &WebviewWindow<Wry>,
		read: impl FnOnce() -> T + Send + 'static,
	) -> T {
		let (sent, answer) = channel();
		window
			.run_on_main_thread(move || sent.send(read()).expect("the answer is awaited"))
			.expect("the main thread takes the read");
		answer.recv_timeout(WAIT).expect("the main thread answers")
	}

	fn ns_window_of(window: &WebviewWindow<Wry>) -> Retained<NSWindow> {
		let handle = window.ns_window().expect("the window has an NSWindow");
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
