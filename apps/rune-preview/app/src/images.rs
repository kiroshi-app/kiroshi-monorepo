use std::collections::HashMap;
use std::io::Read;
use std::thread;
use std::time::Duration;

use rune::image::{Image, ImageCache};

use crate::host::Access;

const FETCH_PATIENCE: Duration = Duration::from_secs(20);

const MAX_IMAGE_BYTES: u64 = 32 * 1024 * 1024;

const DRAWN_SIZE: f32 = 420.0;

const DRAWN_SCALE: f32 = 2.0;

pub enum Slot {
	Loading,
	Ready(Image),
	Failed(String),
}

pub struct Fetched {
	pub url: String,
	pub bytes: Result<Vec<u8>, String>,
}

#[derive(Default)]
pub struct Images {
	cache: Option<ImageCache>,
	slots: HashMap<String, Slot>,
}

impl Images {
	pub fn start(&mut self, cache: ImageCache) {
		self.cache = Some(cache);
	}

	pub fn slot(&self, url: &str) -> Option<&Slot> {
		self.slots.get(url)
	}

	pub fn request(
		&mut self,
		url: String,
		access: Option<&Access>,
		deliver: impl Fn(Fetched) + Send + 'static,
	) {
		if self.slots.contains_key(&url) {
			return;
		}
		let Some(cache) = self.cache.as_ref() else {
			return;
		};
		let slot = if is_remote(&url) {
			fetch(url.clone(), authorization_for(&url, access), deliver);
			Slot::Loading
		} else if let Some(path) = local_path(&url) {
			if crate::host::data_folders()
				.iter()
				.any(|folder| std::path::Path::new(path).starts_with(folder))
			{
				Slot::Failed("Kiroshi's data folder isn't read here".to_owned())
			} else {
				Slot::Ready(cache.file(path, DRAWN_SIZE, DRAWN_SCALE))
			}
		} else {
			Slot::Failed(format!("{} images aren't drawn", scheme_of(&url)))
		};
		self.slots.insert(url, slot);
	}

	pub fn landed(&mut self, fetched: Fetched) {
		let slot = match (fetched.bytes, self.cache.as_ref()) {
			(Ok(bytes), Some(cache)) => Slot::Ready(cache.load(bytes)),
			(Ok(_), None) => Slot::Failed("no image cache".to_owned()),
			(Err(failure), _) => Slot::Failed(failure),
		};
		self.slots.insert(fetched.url, slot);
	}
}

fn is_remote(url: &str) -> bool {
	url.starts_with("https://") || url.starts_with("http://")
}

fn local_path(url: &str) -> Option<&str> {
	if let Some(path) = url.strip_prefix("file://") {
		return Some(path);
	}
	url.starts_with('/').then_some(url)
}

fn scheme_of(url: &str) -> &str {
	url.split_once(':').map_or("relative", |(scheme, _)| scheme)
}

fn authorization_for(url: &str, access: Option<&Access>) -> Option<String> {
	let access = access?;
	let origin = origin_of(url)?;
	(Some(origin) == origin_of(&access.origin)).then(|| access.bearer.clone())
}

fn origin_of(url: &str) -> Option<(String, String, u16)> {
	let (scheme, rest) = url.split_once("://")?;
	let scheme = scheme.to_ascii_lowercase();
	let authority = rest.split(['/', '?', '#']).next()?;
	if authority.contains('@') {
		return None;
	}
	let (host, port) = match authority.rsplit_once(':') {
		Some((host, port)) => (host, port.parse().ok()?),
		None => (authority, default_port(&scheme)?),
	};
	Some((scheme, host.to_ascii_lowercase(), port))
}

fn default_port(scheme: &str) -> Option<u16> {
	match scheme {
		"http" => Some(80),
		"https" => Some(443),
		_ => None,
	}
}

fn fetch(url: String, authorization: Option<String>, deliver: impl Fn(Fetched) + Send + 'static) {
	let spawned = thread::Builder::new().name("image-fetch".into()).spawn(move || {
		let bytes = fetched_bytes(&url, authorization.as_deref());
		deliver(Fetched { url, bytes });
	});
	if let Err(failure) = spawned {
		eprintln!("an image fetch did not start: {failure}");
	}
}

fn fetched_bytes(url: &str, authorization: Option<&str>) -> Result<Vec<u8>, String> {
	let request = ureq::get(url).timeout(FETCH_PATIENCE);
	let request = match authorization {
		Some(bearer) => request.set("Authorization", bearer),
		None => request,
	};
	let response = request.call().map_err(|failure| failure.to_string())?;
	let mut bytes = Vec::new();
	response
		.into_reader()
		.take(MAX_IMAGE_BYTES)
		.read_to_end(&mut bytes)
		.map_err(|failure| failure.to_string())?;
	Ok(bytes)
}

#[cfg(test)]
mod tests {
	use super::*;

	fn local_host() -> Access {
		Access { origin: "http://127.0.0.1:4000".into(), bearer: "Bearer secret".into() }
	}

	#[test]
	fn the_host_origin_receives_the_bearer() {
		let url = "http://127.0.0.1:4000/api/files/avatars/skippy.png";

		assert_eq!(authorization_for(url, Some(&local_host())), Some("Bearer secret".into()));
	}

	#[test]
	fn another_origin_receives_no_bearer() {
		for url in [
			"https://example.com/picture.png",
			"https://127.0.0.1:4000/picture.png",
			"http://localhost:4000/picture.png",
			"http://127.0.0.1:4000@example.com/picture.png",
			"http://127.0.0.1:4000.example.com/picture.png",
		] {
			assert_eq!(authorization_for(url, Some(&local_host())), None, "{url}");
		}
	}

	#[test]
	fn a_lookalike_origin_on_another_port_receives_no_bearer() {
		for url in ["http://127.0.0.1:40001/picture.png", "http://127.0.0.1/picture.png"] {
			assert_eq!(authorization_for(url, Some(&local_host())), None, "{url}");
		}
	}

	#[test]
	fn a_source_without_a_host_sends_no_bearer() {
		assert_eq!(authorization_for("http://127.0.0.1:4000/picture.png", None), None);
	}
}
