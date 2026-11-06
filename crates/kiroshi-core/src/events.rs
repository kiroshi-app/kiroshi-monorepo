use std::marker::PhantomData;
use std::sync::Arc;

use serde::Serialize;

pub const BUFFERED_FRAMES: usize = 1024;

pub type Frame = Arc<str>;

pub struct Event<P> {
	name: &'static str,
	payload: PhantomData<fn() -> P>,
}

impl<P> Event<P> {
	pub const fn new(name: &'static str) -> Self {
		Self { name, payload: PhantomData }
	}

	pub const fn name(&self) -> &'static str {
		self.name
	}
}

impl<P> Clone for Event<P> {
	fn clone(&self) -> Self {
		*self
	}
}

impl<P> Copy for Event<P> {}

pub fn frame<P: Serialize>(event: Event<P>, payload: &P) -> serde_json::Result<Frame> {
	framed(event.name(), payload)
}

pub fn framed<S: Serialize + ?Sized>(event: &str, payload: &S) -> serde_json::Result<Frame> {
	let event = serde_json::to_string(event)?;
	let payload = serde_json::to_string(payload)?;
	Ok(format!(r#"{{"event":{event},"payload":{payload}}}"#).into())
}
