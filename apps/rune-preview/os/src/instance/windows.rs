use std::io;
use std::ptr;
use std::thread;
use std::time::Duration;

use windows_sys::Win32::Foundation::{
	CloseHandle, ERROR_ACCESS_DENIED, ERROR_BROKEN_PIPE, ERROR_FILE_NOT_FOUND, ERROR_IO_PENDING,
	ERROR_OPERATION_ABORTED, ERROR_PIPE_BUSY, ERROR_PIPE_CONNECTED, GENERIC_WRITE, GetLastError,
	HANDLE, INVALID_HANDLE_VALUE, LocalFree, WAIT_OBJECT_0,
};
use windows_sys::Win32::Security::Authorization::{
	ConvertStringSecurityDescriptorToSecurityDescriptorW, SDDL_REVISION_1,
};
use windows_sys::Win32::Security::{
	EqualSid, GetTokenInformation, PSECURITY_DESCRIPTOR, PSID, SECURITY_ATTRIBUTES, TOKEN_QUERY,
	TOKEN_USER, TokenUser,
};
use windows_sys::Win32::Storage::FileSystem::{
	CreateFileW, FILE_FLAG_FIRST_PIPE_INSTANCE, FILE_FLAG_OVERLAPPED, OPEN_EXISTING,
	PIPE_ACCESS_INBOUND, ReadFile, WriteFile,
};
use windows_sys::Win32::System::IO::{CancelIoEx, GetOverlappedResult, OVERLAPPED};
use windows_sys::Win32::System::Pipes::{
	ConnectNamedPipe, CreateNamedPipeW, DisconnectNamedPipe, GetNamedPipeServerProcessId,
	PIPE_READMODE_BYTE, PIPE_REJECT_REMOTE_CLIENTS, PIPE_TYPE_BYTE, PIPE_WAIT, WaitNamedPipeW,
};
use windows_sys::Win32::System::Threading::{
	CreateEventW, GetCurrentProcess, INFINITE, OpenProcess, OpenProcessToken,
	PROCESS_QUERY_LIMITED_INFORMATION, WaitForSingleObject,
};

use super::{ACCEPT_BACKOFF, Claim, ClaimError, Forward};
use crate::wide;

const OWNER_ONLY: &str = "D:P(A;;GA;;;OW)";

const PIPE_BUFFER: u32 = 64 * 1024;

const BUSY_PATIENCE_MS: u32 = 5_000;

const CLAIM_ATTEMPTS: usize = 3;

pub struct Endpoint {
	name: Vec<u16>,
}

impl Endpoint {
	pub fn of_profile(profile: &str) -> Endpoint {
		let user = std::env::var_os("USERNAME");
		let key = super::key_of(&format!("{user:?}\n{profile}"));
		Endpoint { name: wide(&format!(r"\\.\pipe\kiroshi-rune-{key}")) }
	}
}

struct Handle(HANDLE);

unsafe impl Send for Handle {}

impl Drop for Handle {
	fn drop(&mut self) {
		unsafe { CloseHandle(self.0) };
	}
}

fn handle_or_failure(handle: HANDLE) -> io::Result<Handle> {
	if handle.is_null() || handle == INVALID_HANDLE_VALUE {
		return Err(io::Error::last_os_error());
	}
	Ok(Handle(handle))
}

fn is(failure: &io::Error, code: u32) -> bool {
	failure.raw_os_error() == Some(code as i32)
}

pub struct Instance {
	pipe: Handle,
}

impl Instance {
	pub fn serve(self, on_forward: impl Fn(Forward) + Send + 'static) -> io::Result<()> {
		let event = handle_or_failure(unsafe { CreateEventW(ptr::null(), 1, 0, ptr::null()) })?;
		let serving = move || {
			loop {
				match connected(&self.pipe, &event) {
					Ok(()) => super::delivered(received(&self.pipe, &event), &on_forward),
					Err(failure) => {
						eprintln!("the instance endpoint didn't accept a launch: {failure}");
						thread::sleep(ACCEPT_BACKOFF);
					}
				}
				unsafe { DisconnectNamedPipe(self.pipe.0) };
			}
		};
		thread::Builder::new().name("kiroshi-instance".into()).spawn(serving).map(drop)
	}
}

pub(super) fn claim(endpoint: &Endpoint, forward: &Forward) -> Result<Claim, ClaimError> {
	for _ in 0..CLAIM_ATTEMPTS {
		match first_pipe(&endpoint.name) {
			Ok(pipe) => return Ok(Claim::First(Instance { pipe })),
			Err(failure) if is(&failure, ERROR_ACCESS_DENIED) || is(&failure, ERROR_PIPE_BUSY) => {}
			Err(failure) => return Err(ClaimError::Endpoint(failure)),
		}
		match client_of(&endpoint.name) {
			Ok(client) => {
				served_by_this_user(&client)?;
				return sent(&client, forward)
					.map(|()| Claim::Forwarded)
					.map_err(ClaimError::Forward);
			}
			Err(failure) if is(&failure, ERROR_FILE_NOT_FOUND) => {}
			Err(failure) => return Err(ClaimError::Forward(failure)),
		}
	}
	Err(ClaimError::Endpoint(io::Error::other("the instance pipe kept changing hands")))
}

fn first_pipe(name: &[u16]) -> io::Result<Handle> {
	let mut descriptor: PSECURITY_DESCRIPTOR = ptr::null_mut();
	let owner_only = wide(OWNER_ONLY);
	let converted = unsafe {
		ConvertStringSecurityDescriptorToSecurityDescriptorW(
			owner_only.as_ptr(),
			SDDL_REVISION_1,
			&mut descriptor,
			ptr::null_mut(),
		)
	};
	if converted == 0 {
		return Err(io::Error::last_os_error());
	}
	let attributes = SECURITY_ATTRIBUTES {
		nLength: size_of::<SECURITY_ATTRIBUTES>() as u32,
		lpSecurityDescriptor: descriptor,
		bInheritHandle: 0,
	};
	let pipe = unsafe {
		CreateNamedPipeW(
			name.as_ptr(),
			PIPE_ACCESS_INBOUND | FILE_FLAG_OVERLAPPED | FILE_FLAG_FIRST_PIPE_INSTANCE,
			PIPE_TYPE_BYTE | PIPE_READMODE_BYTE | PIPE_WAIT | PIPE_REJECT_REMOTE_CLIENTS,
			1,
			PIPE_BUFFER,
			PIPE_BUFFER,
			0,
			&attributes,
		)
	};
	let created = handle_or_failure(pipe);
	unsafe { LocalFree(descriptor) };
	created
}

fn client_of(name: &[u16]) -> io::Result<Handle> {
	let open = || {
		handle_or_failure(unsafe {
			CreateFileW(
				name.as_ptr(),
				GENERIC_WRITE,
				0,
				ptr::null(),
				OPEN_EXISTING,
				0,
				ptr::null_mut(),
			)
		})
	};
	match open() {
		Err(failure) if is(&failure, ERROR_PIPE_BUSY) => {
			if unsafe { WaitNamedPipeW(name.as_ptr(), BUSY_PATIENCE_MS) } == 0 {
				return Err(io::Error::last_os_error());
			}
			open()
		}
		opened => opened,
	}
}

fn served_by_this_user(client: &Handle) -> Result<(), ClaimError> {
	let mut server = 0;
	if unsafe { GetNamedPipeServerProcessId(client.0, &mut server) } == 0 {
		return Err(ClaimError::ForeignOwner(io::Error::last_os_error()));
	}
	let process =
		handle_or_failure(unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, server) })
			.map_err(ClaimError::ForeignOwner)?;
	let theirs = UserToken::of(process.0).map_err(ClaimError::ForeignOwner)?;
	let ours = UserToken::of(unsafe { GetCurrentProcess() }).map_err(ClaimError::ForeignOwner)?;
	if unsafe { EqualSid(theirs.sid(), ours.sid()) } == 0 {
		return Err(ClaimError::ForeignOwner(io::Error::new(
			io::ErrorKind::PermissionDenied,
			"the instance pipe is served by another user",
		)));
	}
	Ok(())
}

struct UserToken(Vec<u64>);

impl UserToken {
	fn of(process: HANDLE) -> io::Result<UserToken> {
		let mut token = ptr::null_mut();
		if unsafe { OpenProcessToken(process, TOKEN_QUERY, &mut token) } == 0 {
			return Err(io::Error::last_os_error());
		}
		let token = Handle(token);
		let mut needed = 0;
		let sized =
			unsafe { GetTokenInformation(token.0, TokenUser, ptr::null_mut(), 0, &mut needed) };
		if sized != 0 || needed == 0 {
			return Err(io::Error::last_os_error());
		}
		let mut held = vec![0_u64; (needed as usize).div_ceil(size_of::<u64>())];
		let read = unsafe {
			GetTokenInformation(token.0, TokenUser, held.as_mut_ptr().cast(), needed, &mut needed)
		};
		if read == 0 {
			return Err(io::Error::last_os_error());
		}
		Ok(UserToken(held))
	}

	fn sid(&self) -> PSID {
		unsafe { (*self.0.as_ptr().cast::<TOKEN_USER>()).User.Sid }
	}
}

fn sent(client: &Handle, forward: &Forward) -> io::Result<()> {
	let payload = super::payload_of(forward)?;
	let mut rest = payload.as_slice();
	while !rest.is_empty() {
		let mut written = 0;
		let wrote = unsafe {
			WriteFile(client.0, rest.as_ptr(), rest.len() as u32, &mut written, ptr::null_mut())
		};
		if wrote == 0 {
			return Err(io::Error::last_os_error());
		}
		rest = &rest[written as usize..];
	}
	Ok(())
}

fn connected(pipe: &Handle, event: &Handle) -> io::Result<()> {
	let mut overlapped = OVERLAPPED { hEvent: event.0, ..OVERLAPPED::default() };
	if unsafe { ConnectNamedPipe(pipe.0, &mut overlapped) } != 0 {
		return Ok(());
	}
	match unsafe { GetLastError() } {
		ERROR_PIPE_CONNECTED => Ok(()),
		ERROR_IO_PENDING => completed(pipe, &overlapped).map(drop),
		failure => Err(io::Error::from_raw_os_error(failure as i32)),
	}
}

fn completed(pipe: &Handle, overlapped: &OVERLAPPED) -> io::Result<u32> {
	let mut transferred = 0;
	if unsafe { GetOverlappedResult(pipe.0, overlapped, &mut transferred, 1) } == 0 {
		return Err(io::Error::last_os_error());
	}
	Ok(transferred)
}

fn received(pipe: &Handle, event: &Handle) -> Result<Forward, super::Dropped> {
	super::received(|buffer, left| read_within(pipe, event, buffer, left))
}

fn read_within(
	pipe: &Handle,
	event: &Handle,
	buffer: &mut [u8],
	left: Duration,
) -> io::Result<usize> {
	let mut overlapped = OVERLAPPED { hEvent: event.0, ..OVERLAPPED::default() };
	let started = unsafe {
		ReadFile(pipe.0, buffer.as_mut_ptr(), buffer.len() as u32, ptr::null_mut(), &mut overlapped)
	};
	if started == 0 {
		match unsafe { GetLastError() } {
			ERROR_IO_PENDING => {}
			ERROR_BROKEN_PIPE => return Ok(0),
			failure => return Err(io::Error::from_raw_os_error(failure as i32)),
		}
	}
	let millis = left.as_millis().min(u128::from(INFINITE - 1)) as u32;
	if unsafe { WaitForSingleObject(event.0, millis) } != WAIT_OBJECT_0 {
		unsafe { CancelIoEx(pipe.0, &overlapped) };
		match completed(pipe, &overlapped) {
			Err(failure) if !is(&failure, ERROR_OPERATION_ABORTED) => {
				eprintln!("a stalled launch forward ended with: {failure}");
			}
			_ => {}
		}
		return Err(io::ErrorKind::TimedOut.into());
	}
	match completed(pipe, &overlapped) {
		Ok(read) => Ok(read as usize),
		Err(failure) if is(&failure, ERROR_BROKEN_PIPE) => Ok(0),
		Err(failure) => Err(failure),
	}
}
