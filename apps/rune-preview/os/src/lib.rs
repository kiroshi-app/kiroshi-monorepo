pub mod instance;
pub mod launch;
pub mod link;
pub mod scheme;

#[cfg(windows)]
fn wide(text: &str) -> Vec<u16> {
	text.encode_utf16().chain(std::iter::once(0)).collect()
}
