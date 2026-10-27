use std::fmt::Display;
use std::sync::{Mutex, MutexGuard};

use tauri::{
	LogicalPosition, LogicalSize, Manager, PhysicalPosition, PhysicalSize, Runtime, WebviewWindow,
	WindowEvent,
};
use tokio::sync::oneshot;
use windows::core::{w, Error, PCWSTR};
use windows::Win32::Foundation::{
	ERROR_CLASS_ALREADY_EXISTS, HINSTANCE, HWND, LPARAM, LRESULT, WPARAM,
};
use windows::Win32::System::LibraryLoader::GetModuleHandleW;
use windows::Win32::UI::Input::KeyboardAndMouse::{
	TrackMouseEvent, TME_LEAVE, TME_NONCLIENT, TRACKMOUSEEVENT,
};
use windows::Win32::UI::WindowsAndMessaging::{
	CreateWindowExW, DefWindowProcW, GetParent, GetWindowLongPtrW, IsZoomed, PostMessageW,
	RegisterClassExW, SetWindowLongPtrW, SetWindowPos, GWLP_USERDATA, HTMAXBUTTON, HWND_TOP,
	SC_MAXIMIZE, SC_RESTORE, SWP_HIDEWINDOW, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER,
	SWP_SHOWWINDOW, WINDOW_EX_STYLE, WM_NCDESTROY, WM_NCHITTEST, WM_NCLBUTTONDBLCLK,
	WM_NCLBUTTONDOWN, WM_NCLBUTTONUP, WM_NCMOUSELEAVE, WM_NCMOUSEMOVE, WM_SYSCOMMAND, WNDCLASSEXW,
	WS_CHILD, WS_CLIPSIBLINGS, WS_VISIBLE,
};

use super::overlays::{NotFramed, Overlay, Overlays};
use super::pointer::{Pointer, PointerInput};
use super::{MaximizeButtonBounds, MaximizeButtonPointer, MaximizeButtonState, WindowFrameError};
use crate::events::{self, MAXIMIZE_BUTTON};

const OVERLAY_CLASS: PCWSTR = w!("KiroshiMaximizeButton");

#[derive(Default)]
struct MaximizeButtons(Mutex<Overlays>);

struct Tracker {
	pointer: Pointer,
	report: Box<dyn Fn(MaximizeButtonState)>,
}

struct Failure {
	error: WindowFrameError,
	cause: String,
}

impl Failure {
	fn unavailable(cause: impl Display) -> Self {
		Self { error: WindowFrameError::Unavailable, cause: cause.to_string() }
	}

	fn overlay(cause: impl Display) -> Self {
		Self { error: WindowFrameError::OverlayFailed, cause: cause.to_string() }
	}
}

impl From<NotFramed> for Failure {
	fn from(_: NotFramed) -> Self {
		Self::unavailable("the window was never framed")
	}
}

pub fn frame<R: Runtime>(window: &WebviewWindow<R>) {
	if let Err(error) = window.set_decorations(false) {
		eprintln!("the main window kept its native frame: {error}");
	}
	window.manage(MaximizeButtons::default());
	match overlays(window) {
		Ok(mut overlays) => overlays.frame(window.label()),
		Err(failure) => {
			return eprintln!(
				"the window {} has no maximize button ({:?}): {}",
				window.label(),
				failure.error,
				failure.cause
			);
		}
	}
	let subject = window.clone();
	window.on_window_event(move |event| match event {
		WindowEvent::ScaleFactorChanged { scale_factor, .. } => {
			if let Err(failure) = follow_scale(&subject, *scale_factor) {
				eprintln!(
					"the maximize button did not follow the scale factor {scale_factor} ({:?}): {}",
					failure.error, failure.cause
				);
			}
		}
		WindowEvent::Destroyed => match overlays(&subject) {
			Ok(mut overlays) => overlays.forget(subject.label()),
			Err(failure) => eprintln!(
				"the maximize button of {} outlived its window ({:?}): {}",
				subject.label(),
				failure.error,
				failure.cause
			),
		},
		_ => {}
	});
}

fn overlays<R: Runtime>(window: &WebviewWindow<R>) -> Result<MutexGuard<'_, Overlays>, Failure> {
	let state = window
		.try_state::<MaximizeButtons>()
		.ok_or_else(|| Failure::unavailable("no window was ever framed"))?;
	state.inner().0.lock().map_err(Failure::unavailable)
}

pub async fn declare_maximize_button<R: Runtime>(
	window: WebviewWindow<R>,
	bounds: Option<MaximizeButtonBounds>,
) -> Result<(), WindowFrameError> {
	place_on_main_thread(window, bounds).await.map_err(|failure| {
		eprintln!(
			"the maximize button at {bounds:?} was not declared ({:?}): {}",
			failure.error, failure.cause
		);
		failure.error
	})
}

async fn place_on_main_thread<R: Runtime>(
	window: WebviewWindow<R>,
	bounds: Option<MaximizeButtonBounds>,
) -> Result<(), Failure> {
	if bounds.is_some_and(|bounds| !is_drawable(bounds)) {
		return Err(Failure {
			error: WindowFrameError::InvalidBounds,
			cause: "bounds out of range".into(),
		});
	}
	let (sender, receiver) = oneshot::channel();
	let target = window.clone();
	window
		.run_on_main_thread(move || {
			if sender.send(place(&target, bounds)).is_err() {
				eprintln!("the maximize button was placed after its caller left");
			}
		})
		.map_err(Failure::unavailable)?;
	receiver.await.map_err(Failure::unavailable)?
}

fn is_drawable(bounds: MaximizeButtonBounds) -> bool {
	[bounds.x, bounds.y, bounds.width, bounds.height]
		.iter()
		.all(|edge| edge.is_finite() && *edge >= 0.0)
		&& bounds.width > 0.0
		&& bounds.height > 0.0
}

fn place<R: Runtime>(
	window: &WebviewWindow<R>,
	bounds: Option<MaximizeButtonBounds>,
) -> Result<(), Failure> {
	let mut overlays = overlays(window)?;
	let Some(Overlay { hwnd, bounds }) =
		overlays.declare(window.label(), bounds, || create_overlay(window))?
	else {
		return Ok(());
	};
	let Some(bounds) = bounds else {
		return hide(hwnd);
	};
	let scale = window.scale_factor().map_err(Failure::unavailable)?;
	position(hwnd, bounds, scale)
}

fn follow_scale<R: Runtime>(window: &WebviewWindow<R>, scale: f64) -> Result<(), Failure> {
	let declared = overlays(window)?.overlay(window.label());
	match declared {
		Some(Overlay { hwnd, bounds: Some(bounds) }) => position(hwnd, bounds, scale),
		_ => Ok(()),
	}
}

fn physical(
	bounds: MaximizeButtonBounds,
	scale: f64,
) -> (PhysicalPosition<i32>, PhysicalSize<i32>) {
	(
		LogicalPosition::new(bounds.x, bounds.y).to_physical(scale),
		LogicalSize::new(bounds.width, bounds.height).to_physical(scale),
	)
}

fn position(hwnd: isize, bounds: MaximizeButtonBounds, scale: f64) -> Result<(), Failure> {
	let (origin, size) = physical(bounds, scale);
	unsafe {
		SetWindowPos(
			HWND(hwnd as _),
			Some(HWND_TOP),
			origin.x,
			origin.y,
			size.width,
			size.height,
			SWP_NOACTIVATE | SWP_SHOWWINDOW,
		)
	}
	.map_err(Failure::overlay)
}

fn hide(hwnd: isize) -> Result<(), Failure> {
	unsafe {
		SetWindowPos(
			HWND(hwnd as _),
			None,
			0,
			0,
			0,
			0,
			SWP_HIDEWINDOW | SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE,
		)
	}
	.map_err(Failure::overlay)
}

fn create_overlay<R: Runtime>(window: &WebviewWindow<R>) -> Result<isize, Failure> {
	let parent = window.hwnd().map_err(Failure::unavailable)?;
	let overlay = unsafe {
		let instance = HINSTANCE(GetModuleHandleW(None).map_err(Failure::overlay)?.0);
		register_overlay_class(instance)?;
		CreateWindowExW(
			WINDOW_EX_STYLE::default(),
			OVERLAY_CLASS,
			PCWSTR::null(),
			WS_CHILD | WS_VISIBLE | WS_CLIPSIBLINGS,
			0,
			0,
			0,
			0,
			Some(parent),
			None,
			Some(instance),
			None,
		)
	}
	.map_err(Failure::overlay)?;
	let tracker = Box::new(Tracker { pointer: Pointer::default(), report: reporter(window) });
	unsafe { SetWindowLongPtrW(overlay, GWLP_USERDATA, Box::into_raw(tracker) as isize) };
	Ok(overlay.0 as isize)
}

fn reporter<R: Runtime>(window: &WebviewWindow<R>) -> Box<dyn Fn(MaximizeButtonState)> {
	let app = window.app_handle().clone();
	let label = window.label().to_owned();
	Box::new(move |state| {
		let payload = MaximizeButtonPointer { state };
		if let Err(error) = events::emit_to(&app, &label, MAXIMIZE_BUTTON, payload) {
			eprintln!("the maximize button did not report {state:?}: {error}");
		}
	})
}

unsafe fn register_overlay_class(instance: HINSTANCE) -> Result<(), Failure> {
	let class = WNDCLASSEXW {
		cbSize: std::mem::size_of::<WNDCLASSEXW>() as u32,
		lpfnWndProc: Some(answer_as_the_maximize_button),
		hInstance: instance,
		lpszClassName: OVERLAY_CLASS,
		..Default::default()
	};
	if RegisterClassExW(&class) != 0 {
		return Ok(());
	}
	let error = Error::from_thread();
	if error.code() == ERROR_CLASS_ALREADY_EXISTS.to_hresult() {
		return Ok(());
	}
	Err(Failure::overlay(error))
}

unsafe extern "system" fn answer_as_the_maximize_button(
	hwnd: HWND,
	message: u32,
	wparam: WPARAM,
	lparam: LPARAM,
) -> LRESULT {
	let input = match message {
		WM_NCHITTEST => return LRESULT(HTMAXBUTTON as isize),
		WM_NCDESTROY => {
			release_tracker(hwnd);
			return DefWindowProcW(hwnd, message, wparam, lparam);
		}
		WM_NCMOUSEMOVE => PointerInput::Moved,
		WM_NCLBUTTONDOWN | WM_NCLBUTTONDBLCLK => PointerInput::Pressed,
		WM_NCLBUTTONUP => PointerInput::Released,
		WM_NCMOUSELEAVE => PointerInput::Left,
		_ => return DefWindowProcW(hwnd, message, wparam, lparam),
	};
	let tracker = GetWindowLongPtrW(hwnd, GWLP_USERDATA) as *mut Tracker;
	if let Some(tracker) = tracker.as_mut() {
		follow_pointer(hwnd, tracker, input);
	}
	LRESULT(0)
}

unsafe fn follow_pointer(hwnd: HWND, tracker: &mut Tracker, input: PointerInput) {
	let (pointer, reaction) = tracker.pointer.react(input);
	if pointer.is_inside && !tracker.pointer.is_inside {
		track_leave(hwnd);
	}
	tracker.pointer = pointer;
	if let Some(state) = reaction.report {
		(tracker.report)(state);
	}
	if reaction.toggles_maximize {
		toggle_maximize(hwnd);
	}
}

unsafe fn track_leave(hwnd: HWND) {
	let mut request = TRACKMOUSEEVENT {
		cbSize: std::mem::size_of::<TRACKMOUSEEVENT>() as u32,
		dwFlags: TME_LEAVE | TME_NONCLIENT,
		hwndTrack: hwnd,
		dwHoverTime: 0,
	};
	if let Err(error) = TrackMouseEvent(&mut request) {
		eprintln!("the maximize button will not see the pointer leave: {error}");
	}
}

unsafe fn release_tracker(hwnd: HWND) {
	let tracker = SetWindowLongPtrW(hwnd, GWLP_USERDATA, 0) as *mut Tracker;
	if !tracker.is_null() {
		drop(Box::from_raw(tracker));
	}
}

unsafe fn toggle_maximize(overlay: HWND) {
	let parent = match GetParent(overlay) {
		Ok(parent) => parent,
		Err(error) => {
			eprintln!("the maximize button found no window to toggle: {error}");
			return;
		}
	};
	let command = if IsZoomed(parent).as_bool() { SC_RESTORE } else { SC_MAXIMIZE };
	if let Err(error) =
		PostMessageW(Some(parent), WM_SYSCOMMAND, WPARAM(command as usize), LPARAM(0))
	{
		eprintln!("the maximize button did not toggle the window: {error}");
	}
}

#[cfg(test)]
mod tests {
	use super::{is_drawable, physical, MaximizeButtonBounds};

	const BUTTON: MaximizeButtonBounds =
		MaximizeButtonBounds { x: 1101.5, y: 0.0, width: 46.0, height: 34.0 };

	#[test]
	fn rounds_the_declared_bounds_to_physical_pixels_at_the_scale_factor() {
		let (origin, size) = physical(BUTTON, 1.25);
		assert_eq!((origin.x, origin.y, size.width, size.height), (1377, 0, 58, 43));
	}

	#[test]
	fn keeps_the_declared_bounds_at_the_unit_scale_factor() {
		let (origin, size) = physical(BUTTON, 1.0);
		assert_eq!((origin.x, origin.y, size.width, size.height), (1102, 0, 46, 34));
	}

	#[test]
	fn refuses_bounds_with_no_area_or_off_the_client_area() {
		for bounds in [
			MaximizeButtonBounds { width: 0.0, ..BUTTON },
			MaximizeButtonBounds { x: -1.0, ..BUTTON },
			MaximizeButtonBounds { height: f64::NAN, ..BUTTON },
		] {
			assert!(!is_drawable(bounds), "{bounds:?} was accepted");
		}
	}
}
