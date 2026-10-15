use std::sync::{Condvar, Mutex, MutexGuard, PoisonError};
use std::time::{Duration, Instant};

pub struct EventLog<T> {
	held: Mutex<Vec<T>>,
	grown: Condvar,
}

impl<T: Clone> EventLog<T> {
	pub fn new() -> Self {
		Self { held: Mutex::new(Vec::new()), grown: Condvar::new() }
	}

	fn held_now(&self) -> MutexGuard<'_, Vec<T>> {
		self.held.lock().unwrap_or_else(PoisonError::into_inner)
	}

	pub fn push(&self, event: T) {
		self.held_now().push(event);
		self.grown.notify_all();
	}

	pub fn held(&self) -> Vec<T> {
		self.held_now().clone()
	}

	pub fn forget(&self) {
		self.held_now().clear();
	}

	pub fn until<U>(&self, patience: Duration, ready: impl Fn(&[T]) -> Option<U>) -> Option<U> {
		let deadline = Instant::now() + patience;
		let mut held = self.held_now();
		loop {
			if let Some(found) = ready(&held) {
				return Some(found);
			}
			let left = deadline.saturating_duration_since(Instant::now());
			if left.is_zero() {
				return None;
			}
			held = self.grown.wait_timeout(held, left).unwrap_or_else(PoisonError::into_inner).0;
		}
	}
}
