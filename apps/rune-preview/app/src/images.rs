use std::collections::HashMap;
use std::io::Read;
use std::thread;
use std::time::Duration;

use rune::image::{Image, ImageCache};

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

	pub fn decode(&self, encoded: &[u8]) -> Option<Image> {
		self.cache.as_ref().map(|cache| cache.load(encoded.to_vec()))
	}

	pub fn slot(&self, url: &str) -> Option<&Slot> {
		self.slots.get(url)
	}

	pub fn request(&mut self, url: String, deliver: impl Fn(Fetched) + Send + 'static) {
		if self.slots.contains_key(&url) {
			return;
		}
		let Some(cache) = self.cache.as_ref() else {
			return;
		};
		let slot = if is_remote(&url) {
			fetch(url.clone(), deliver);
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

fn fetch(url: String, deliver: impl Fn(Fetched) + Send + 'static) {
	let spawned = thread::Builder::new().name("image-fetch".into()).spawn(move || {
		let bytes = fetched_bytes(&url);
		deliver(Fetched { url, bytes });
	});
	if let Err(failure) = spawned {
		eprintln!("an image fetch did not start: {failure}");
	}
}

fn fetched_bytes(url: &str) -> Result<Vec<u8>, String> {
	let response =
		ureq::get(url).timeout(FETCH_PATIENCE).call().map_err(|failure| failure.to_string())?;
	let mut bytes = Vec::new();
	response
		.into_reader()
		.take(MAX_IMAGE_BYTES)
		.read_to_end(&mut bytes)
		.map_err(|failure| failure.to_string())?;
	Ok(bytes)
}
