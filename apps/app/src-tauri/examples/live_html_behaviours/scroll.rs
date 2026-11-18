use std::ffi::c_void;

use objc2::encode::{Encoding, RefEncode};
use objc2::rc::Retained;
use objc2::{msg_send, sel, ClassType, MainThreadMarker};
use objc2_app_kit::{NSApplication, NSEvent, NSWindow};
use objc2_foundation::{NSPoint, NSRect};
use serde::Deserialize;

#[repr(C)]
struct CGEvent {
	_opaque: [u8; 0],
}

unsafe impl RefEncode for CGEvent {
	const ENCODING_REF: Encoding = Encoding::Pointer(&Encoding::Struct("__CGEvent", &[]));
}

#[link(name = "CoreGraphics", kind = "framework")]
extern "C" {
	fn CGEventCreateScrollWheelEvent2(
		source: *const c_void,
		units: u32,
		wheel_count: u32,
		wheel1: i32,
		wheel2: i32,
		wheel3: i32,
	) -> *mut CGEvent;
	fn CGEventSetLocation(event: *mut CGEvent, location: NSPoint);
	fn CGEventSetIntegerValueField(event: *mut CGEvent, field: u32, value: i64);
	fn CGMainDisplayID() -> u32;
	fn CGDisplayBounds(display: u32) -> NSRect;
}

#[link(name = "CoreFoundation", kind = "framework")]
extern "C" {
	fn CFRelease(object: *const c_void);
}

const LINE_UNITS: u32 = 1;
const PIXEL_UNITS: u32 = 0;
const IS_CONTINUOUS: u32 = 88;
const SCROLL_PHASE: u32 = 99;
const MOMENTUM_PHASE: u32 = 123;
const NO_PHASE: i64 = 0;
const BEGAN: i64 = 1;
const CHANGED: i64 = 2;
const SCROLL_ENDED: i64 = 4;
const MOMENTUM_ENDED: i64 = 3;

#[derive(Clone, Copy, PartialEq, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ScrollDevice {
	MouseWheel,
	Trackpad,
}

#[derive(Clone, Copy)]
pub struct ScrollStep {
	device: ScrollDevice,
	delta: i32,
	phase: i64,
	momentum_phase: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Gesture {
	pub device: ScrollDevice,
	pub delta: i32,
	pub moves: i32,
}

impl Gesture {
	pub fn steps(&self) -> Vec<ScrollStep> {
		let step = |delta, phase, momentum_phase| ScrollStep {
			device: self.device,
			delta,
			phase,
			momentum_phase,
		};
		if self.device == ScrollDevice::MouseWheel {
			return (0..self.moves).map(|_| step(self.delta, NO_PHASE, NO_PHASE)).collect();
		}
		let moving = (0..self.moves).map(|_| step(self.delta, CHANGED, NO_PHASE));
		let fading = (1..=self.moves)
			.rev()
			.map(|left| step(self.delta * left / self.moves, NO_PHASE, CHANGED));
		std::iter::once(step(self.delta, BEGAN, NO_PHASE))
			.chain(moving)
			.chain([step(0, SCROLL_ENDED, NO_PHASE), step(self.delta, NO_PHASE, BEGAN)])
			.chain(fading)
			.chain([step(0, NO_PHASE, MOMENTUM_ENDED)])
			.collect()
	}
}

pub fn send_scroll(
	window: &NSWindow,
	step: ScrollStep,
	pointer_in_window_points: NSPoint,
) -> Result<(), String> {
	let marker = MainThreadMarker::new().ok_or("the scroll was sent off the main thread")?;
	let event = scroll_event(window, step, screen_location(window, pointer_in_window_points)?)?;
	let app = NSApplication::sharedApplication(marker);
	let make_current = sel!(_setCurrentEvent:);
	let responds: bool = unsafe { msg_send![&*app, respondsToSelector: make_current] };
	if !responds {
		return Err("this macOS offers no private call to make an event the current one".to_owned());
	}
	unsafe {
		let _: () = msg_send![&*app, _setCurrentEvent: &*event];
	}
	app.sendEvent(&event);
	Ok(())
}

fn screen_location(window: &NSWindow, pointer: NSPoint) -> Result<NSPoint, String> {
	let content = window.contentView().ok_or("the main window has no content view")?;
	let height = content.bounds().size.height;
	let in_window = content.convertPoint_toView(NSPoint::new(pointer.x, height - pointer.y), None);
	let on_screen = window.convertPointToScreen(in_window);
	let main_display_height = unsafe { CGDisplayBounds(CGMainDisplayID()) }.size.height;
	Ok(NSPoint::new(on_screen.x, main_display_height - on_screen.y))
}

fn scroll_event(
	window: &NSWindow,
	step: ScrollStep,
	location: NSPoint,
) -> Result<Retained<NSEvent>, String> {
	let (units, is_continuous) = match step.device {
		ScrollDevice::MouseWheel => (LINE_UNITS, 0),
		ScrollDevice::Trackpad => (PIXEL_UNITS, 1),
	};
	let event =
		unsafe { CGEventCreateScrollWheelEvent2(std::ptr::null(), units, 1, step.delta, 0, 0) };
	if event.is_null() {
		return Err("CoreGraphics created no scroll event".to_owned());
	}
	let converted: Option<Retained<NSEvent>> = unsafe {
		CGEventSetLocation(event, location);
		for (field, value) in [
			(IS_CONTINUOUS, is_continuous),
			(SCROLL_PHASE, step.phase),
			(MOMENTUM_PHASE, step.momentum_phase),
		] {
			CGEventSetIntegerValueField(event, field, value);
		}
		let converted = msg_send![NSEvent::class(), eventWithCGEvent: event];
		CFRelease(event.cast());
		converted
	};
	let converted = converted.ok_or("AppKit made no event of the scroll event")?;
	let aimed: Option<Retained<NSEvent>> =
		unsafe { msg_send![&*converted, _eventRelativeToWindow: window] };
	aimed.ok_or_else(|| "AppKit aimed the scroll event at no window".to_owned())
}
