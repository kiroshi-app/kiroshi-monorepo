use notify_rust::{Notification, NotificationResponse};
use windows::Win32::Foundation::{HWND, LPARAM, RPC_E_CHANGED_MODE};
use windows::Win32::Media::Audio::{PlaySoundW, SND_ASYNC, SND_MEMORY, SND_NODEFAULT};
use windows::Win32::System::Com::{
	CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
	CoUninitialize,
};
use windows::Win32::UI::Shell::{ITaskbarList3, TaskbarList};
use windows::Win32::UI::WindowsAndMessaging::{
	CreateIcon, DestroyIcon, EnumWindows, GetForegroundWindow, GetWindowThreadProcessId, HICON,
	IsWindowVisible, SetForegroundWindow,
};
use windows::core::{BOOL, HSTRING, PCWSTR};

use crate::badge_icon;
use crate::policy::Notice;
use crate::{BannerOutcome, CHIME, Heard, post_waiting, report};

pub fn holds_focus() -> Result<bool, String> {
	let foreground = unsafe { GetForegroundWindow() };
	if foreground.is_invalid() {
		return Err("Windows (no window is in the foreground)".into());
	}
	Ok(owner_of(foreground) == std::process::id())
}

pub fn bring_to_front() -> Result<(), String> {
	let window = own_windows()?.into_iter().next().ok_or("the process shows no window")?;
	let raised = unsafe { SetForegroundWindow(window) };
	raised.as_bool().then_some(()).ok_or_else(|| "SetForegroundWindow was refused".into())
}

pub fn play_chime() -> Result<(), String> {
	let played = unsafe {
		PlaySoundW(PCWSTR(CHIME.as_ptr().cast()), None, SND_MEMORY | SND_ASYNC | SND_NODEFAULT)
	};
	played.as_bool().then_some(()).ok_or_else(|| {
		format!("PlaySound did not play the chime: {}", windows::core::Error::from_thread())
	})
}

pub fn post_banner(_app_id: &str, notice: Notice, heard: Heard) {
	let Notice { title, body, target } = notice;
	post_waiting(heard, target, move |heard, target| {
		let handle = match Notification::new().summary(&title).body(&body).show() {
			Ok(handle) => handle,
			Err(failure) => return report(heard, target, format!("the toast: {failure}")),
		};
		let mut is_clicked = false;
		let waited = handle.wait_for_response(|response: &NotificationResponse| {
			is_clicked = matches!(response, NotificationResponse::Default);
		});
		match waited {
			Ok(()) if is_clicked => heard(BannerOutcome::Clicked(target)),
			Ok(()) => {}
			Err(failure) => eprintln!("the toast response was not read: {failure}"),
		}
	});
}

pub fn wear_badge(_app_id: &str, count: u32) -> Result<(), String> {
	let windows = own_windows()?;
	if windows.is_empty() {
		return Ok(());
	}
	let _apartment = ComApartment::enter()?;
	let taskbar: ITaskbarList3 =
		unsafe { CoCreateInstance(&TaskbarList, None, CLSCTX_INPROC_SERVER) }
			.map_err(|failure| format!("the taskbar was not reached: {failure}"))?;
	unsafe { taskbar.HrInit() }
		.map_err(|failure| format!("the taskbar did not start: {failure}"))?;
	let icon = (count > 0).then(|| overlay_icon(count)).transpose()?;
	let shown = icon.as_ref().map_or(HICON::default(), |icon| icon.0);
	let description =
		HSTRING::from(if count > 0 { badge_icon::label(count) } else { String::new() });
	let failures: Vec<String> = windows
		.into_iter()
		.filter_map(|window| unsafe { taskbar.SetOverlayIcon(window, shown, &description) }.err())
		.map(|failure| failure.to_string())
		.collect();
	if failures.is_empty() {
		return Ok(());
	}
	Err(format!("SetOverlayIcon: {}", failures.join("; ")))
}

fn overlay_icon(count: u32) -> Result<OwnedIcon, String> {
	let mut bgra = badge_icon::rgba(count);
	for pixel in bgra.as_chunks_mut::<4>().0 {
		pixel.swap(0, 2);
	}
	let mask = [0u8; badge_icon::SIZE * badge_icon::SIZE / 8];
	let size = badge_icon::SIZE as i32;
	unsafe { CreateIcon(None, size, size, 1, 32, mask.as_ptr(), bgra.as_ptr()) }
		.map(OwnedIcon)
		.map_err(|failure| format!("the overlay icon was not built: {failure}"))
}

struct OwnedIcon(HICON);

impl Drop for OwnedIcon {
	fn drop(&mut self) {
		if let Err(failure) = unsafe { DestroyIcon(self.0) } {
			eprintln!("the overlay icon was not released: {failure}");
		}
	}
}

struct ComApartment {
	is_ours: bool,
}

impl ComApartment {
	fn enter() -> Result<ComApartment, String> {
		let entered = unsafe { CoInitializeEx(None, COINIT_APARTMENTTHREADED) };
		if entered == RPC_E_CHANGED_MODE {
			return Ok(ComApartment { is_ours: false });
		}
		entered.ok().map_err(|failure| format!("COM did not start: {failure}"))?;
		Ok(ComApartment { is_ours: true })
	}
}

impl Drop for ComApartment {
	fn drop(&mut self) {
		if self.is_ours {
			unsafe { CoUninitialize() };
		}
	}
}

fn owner_of(window: HWND) -> u32 {
	let mut process = 0;
	unsafe { GetWindowThreadProcessId(window, Some(&mut process)) };
	process
}

fn own_windows() -> Result<Vec<HWND>, String> {
	let mut windows: Vec<HWND> = Vec::new();
	unsafe { EnumWindows(Some(collect_own), LPARAM(&mut windows as *mut Vec<HWND> as isize)) }
		.map_err(|failure| format!("the windows were not listed: {failure}"))?;
	Ok(windows)
}

unsafe extern "system" fn collect_own(window: HWND, windows: LPARAM) -> BOOL {
	if owner_of(window) == std::process::id() && unsafe { IsWindowVisible(window) }.as_bool() {
		let windows = unsafe { &mut *(windows.0 as *mut Vec<HWND>) };
		windows.push(window);
	}
	BOOL::from(true)
}
