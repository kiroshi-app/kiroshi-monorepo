use std::fmt;
use std::io;
use std::process::ExitStatus;

#[cfg(any(test, not(any(target_os = "macos", windows))))]
use std::path::Path;

#[cfg(any(test, not(target_os = "macos")))]
const APP_NAME: &str = "Kiroshi (Rune preview)";

#[cfg(any(test, not(any(target_os = "macos", windows))))]
const DESKTOP_FILE: &str = "com.kiroshi.app.desktop";

#[derive(Debug)]
pub enum RegisterError {
	Io(io::Error),
	Refused { program: &'static str, status: ExitStatus },
	NoApplicationsFolder,
	UnwritablePath,
	BundleOnly,
}

impl fmt::Display for RegisterError {
	fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
		match self {
			RegisterError::Io(cause) => write!(f, "{cause}"),
			RegisterError::Refused { program, status } => {
				write!(f, "{program} ended with {status}")
			}
			RegisterError::NoApplicationsFolder => {
				f.write_str("neither XDG_DATA_HOME nor HOME names a data folder")
			}
			RegisterError::UnwritablePath => {
				f.write_str("the executable path can't be written into a desktop entry")
			}
			RegisterError::BundleOnly => f.write_str(
				"on macOS the bundle declares the scheme: run apps/rune-preview/scripts/bundle-macos.sh",
			),
		}
	}
}

impl From<io::Error> for RegisterError {
	fn from(cause: io::Error) -> RegisterError {
		RegisterError::Io(cause)
	}
}

#[cfg(target_os = "macos")]
pub fn register(_carried: &[&str]) -> Result<(), RegisterError> {
	Err(RegisterError::BundleOnly)
}

#[cfg(windows)]
pub fn register(carried: &[&str]) -> Result<(), RegisterError> {
	use crate::wide;
	use windows_sys::Win32::Foundation::ERROR_SUCCESS;
	use windows_sys::Win32::System::Registry::{
		HKEY, HKEY_CURRENT_USER, KEY_WRITE, REG_OPTION_NON_VOLATILE, REG_SZ, RegCloseKey,
		RegCreateKeyExW, RegSetValueExW,
	};

	let set = |path: &str, name: Option<&str>, value: &str| -> io::Result<()> {
		let mut key: HKEY = std::ptr::null_mut();
		let path = wide(path);
		let created = unsafe {
			RegCreateKeyExW(
				HKEY_CURRENT_USER,
				path.as_ptr(),
				0,
				std::ptr::null(),
				REG_OPTION_NON_VOLATILE,
				KEY_WRITE,
				std::ptr::null(),
				&mut key,
				std::ptr::null_mut(),
			)
		};
		if created != ERROR_SUCCESS {
			return Err(io::Error::from_raw_os_error(created as i32));
		}
		let name = name.map(wide);
		let value = wide(value);
		let written = unsafe {
			RegSetValueExW(
				key,
				name.as_ref().map_or(std::ptr::null(), |name| name.as_ptr()),
				0,
				REG_SZ,
				value.as_ptr().cast(),
				(value.len() * size_of::<u16>()) as u32,
			)
		};
		unsafe { RegCloseKey(key) };
		match written {
			ERROR_SUCCESS => Ok(()),
			failure => Err(io::Error::from_raw_os_error(failure as i32)),
		}
	};

	let command = open_command(&std::env::current_exe()?.to_string_lossy(), carried);
	set(r"Software\Classes\kiroshi", None, &format!("URL:{APP_NAME}"))?;
	set(r"Software\Classes\kiroshi", Some("URL Protocol"), "")?;
	set(r"Software\Classes\kiroshi\shell\open\command", None, &command)?;
	Ok(())
}

#[cfg(not(any(target_os = "macos", windows)))]
pub fn register(carried: &[&str]) -> Result<(), RegisterError> {
	const SCHEME_TYPE: &str = "x-scheme-handler/kiroshi";

	let data = std::env::var_os("XDG_DATA_HOME")
		.map(std::path::PathBuf::from)
		.filter(|data| data.is_absolute())
		.or_else(|| {
			std::env::var_os("HOME").map(|home| std::path::PathBuf::from(home).join(".local/share"))
		})
		.ok_or(RegisterError::NoApplicationsFolder)?;
	let applications = data.join("applications");
	std::fs::create_dir_all(&applications)?;
	let executable = std::env::current_exe()?;
	std::fs::write(applications.join(DESKTOP_FILE), desktop_entry(&executable, carried)?)?;
	let status = std::process::Command::new("xdg-mime")
		.args(["default", DESKTOP_FILE, SCHEME_TYPE])
		.status()?;
	if !status.success() {
		return Err(RegisterError::Refused { program: "xdg-mime", status });
	}
	Ok(())
}

#[cfg(any(test, windows))]
fn open_command(executable: &str, carried: &[&str]) -> String {
	let quoted = |part: &str| format!("\"{part}\"");
	let mut command = vec![quoted(executable)];
	command.extend(carried.iter().map(|flag| quoted(flag)));
	command.push(crate::launch::LINKS_FOLLOW.into());
	command.push(quoted("%1"));
	command.join(" ")
}

#[cfg(any(test, not(any(target_os = "macos", windows))))]
fn desktop_entry(executable: &Path, carried: &[&str]) -> Result<String, RegisterError> {
	let executable = executable.to_str().ok_or(RegisterError::UnwritablePath)?;
	let parts = std::iter::once(executable).chain(carried.iter().copied());
	let mut exec = parts
		.map(exec_argument)
		.collect::<Option<Vec<_>>>()
		.ok_or(RegisterError::UnwritablePath)?;
	exec.push("%u".into());
	Ok(format!(
		"[Desktop Entry]\nType=Application\nName={APP_NAME}\nExec={}\nTerminal=false\nMimeType=x-scheme-handler/kiroshi;\n",
		exec.join(" ")
	))
}

#[cfg(any(test, not(any(target_os = "macos", windows))))]
fn exec_argument(argument: &str) -> Option<String> {
	if argument.chars().any(char::is_control) {
		return None;
	}
	let mut quoted = String::from('"');
	for c in argument.chars() {
		match c {
			'"' | '`' | '$' => quoted.extend(['\\', '\\', c]),
			'\\' => quoted.push_str(r"\\\\"),
			'%' => quoted.push_str("%%"),
			_ => quoted.push(c),
		}
	}
	quoted.push('"');
	Some(quoted)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_windows_command_puts_the_clicked_link_after_the_flag_boundary() {
		let command = open_command(r"C:\Kiroshi\kiroshi.exe", &["--dev-host"]);

		assert_eq!(command, r#""C:\Kiroshi\kiroshi.exe" "--dev-host" -- "%1""#);
	}

	#[test]
	fn the_desktop_entry_opens_kiroshi_links_with_the_carried_flags() {
		let entry = desktop_entry(Path::new("/opt/Kiroshi Preview/kiroshi"), &["--dev-host"]);

		let entry = entry.expect("an entry");
		assert!(entry.contains("\nExec=\"/opt/Kiroshi Preview/kiroshi\" \"--dev-host\" %u\n"));
		assert!(entry.contains("\nMimeType=x-scheme-handler/kiroshi;\n"));
	}

	#[test]
	fn an_executable_path_is_escaped_for_the_exec_key() {
		let entry = desktop_entry(Path::new("/a$b\\c%d\"e`f"), &[]).expect("an entry");

		assert!(entry.contains("\nExec=\"/a\\\\$b\\\\\\\\c%%d\\\\\"e\\\\`f\" %u\n"), "{entry}");
	}

	#[test]
	fn the_scheme_lands_on_the_desktop_file_the_linux_package_installs() {
		let package = include_str!("../../scripts/package-linux.sh");
		let identifier = package
			.lines()
			.find_map(|line| line.strip_prefix("readonly IDENTIFIER="))
			.expect("the package names its identifier");
		let installed = package
			.split("usr/share/applications/$IDENTIFIER.desktop\" <<DESKTOP\n")
			.nth(1)
			.and_then(|rest| rest.split("\nDESKTOP\n").next())
			.expect("the package writes its desktop file");

		assert_eq!(DESKTOP_FILE, format!("{identifier}.desktop"));
		assert!(installed.contains("\nMimeType=x-scheme-handler/kiroshi;"), "{installed}");
	}

	#[test]
	fn the_desktop_entry_hides_no_menu_entry_of_the_package_it_shares_a_name_with() {
		let entry =
			desktop_entry(Path::new("/usr/bin/kiroshi-rune-preview"), &[]).expect("an entry");

		assert!(!entry.contains("NoDisplay"), "{entry}");
	}

	#[test]
	fn an_executable_path_with_a_line_break_is_refused() {
		let entry = desktop_entry(Path::new("/a\nExec=/evil"), &[]);

		assert!(matches!(entry, Err(RegisterError::UnwritablePath)));
	}
}
