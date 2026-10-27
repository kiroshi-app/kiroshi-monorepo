use std::collections::HashMap;

use super::MaximizeButtonBounds;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Overlay {
	pub hwnd: isize,
	pub bounds: Option<MaximizeButtonBounds>,
}

pub struct NotFramed;

#[derive(Default)]
pub struct Overlays(HashMap<String, Option<Overlay>>);

impl Overlays {
	pub fn frame(&mut self, label: &str) {
		self.0.insert(label.to_owned(), None);
	}

	pub fn overlay(&self, label: &str) -> Option<Overlay> {
		self.0.get(label).copied().flatten()
	}

	pub fn declare<E: From<NotFramed>>(
		&mut self,
		label: &str,
		bounds: Option<MaximizeButtonBounds>,
		create: impl FnOnce() -> Result<isize, E>,
	) -> Result<Option<Overlay>, E> {
		let slot = self.0.get_mut(label).ok_or(NotFramed)?;
		let hwnd = match (*slot, bounds) {
			(Some(overlay), _) => overlay.hwnd,
			(None, Some(_)) => create()?,
			(None, None) => return Ok(None),
		};
		let overlay = Overlay { hwnd, bounds };
		*slot = Some(overlay);
		Ok(Some(overlay))
	}

	pub fn forget(&mut self, label: &str) {
		self.0.remove(label);
	}
}

#[cfg(test)]
mod tests {
	use super::{MaximizeButtonBounds, NotFramed, Overlay, Overlays};

	const A: &str = "main";
	const B: &str = "window-b";
	const BUTTON: MaximizeButtonBounds =
		MaximizeButtonBounds { x: 1101.5, y: 0.0, width: 46.0, height: 34.0 };
	const MOVED: MaximizeButtonBounds = MaximizeButtonBounds { x: 640.0, ..BUTTON };

	#[derive(Debug, PartialEq)]
	enum Refusal {
		NotFramed,
		Created,
	}

	impl From<NotFramed> for Refusal {
		fn from(_: NotFramed) -> Self {
			Self::NotFramed
		}
	}

	fn framed(labels: &[&str]) -> Overlays {
		let mut overlays = Overlays::default();
		for label in labels {
			overlays.frame(label);
		}
		overlays
	}

	fn declare(
		overlays: &mut Overlays,
		label: &str,
		bounds: Option<MaximizeButtonBounds>,
		hwnd: isize,
	) -> Result<Option<Overlay>, Refusal> {
		overlays.declare(label, bounds, || Ok(hwnd))
	}

	#[test]
	fn two_framed_windows_hold_two_distinct_overlays() {
		let mut overlays = framed(&[A, B]);

		declare(&mut overlays, A, Some(BUTTON), 1).expect("A declares");
		declare(&mut overlays, B, Some(BUTTON), 2).expect("B declares");

		assert_eq!(overlays.overlay(A), Some(Overlay { hwnd: 1, bounds: Some(BUTTON) }));
		assert_eq!(overlays.overlay(B), Some(Overlay { hwnd: 2, bounds: Some(BUTTON) }));
	}

	#[test]
	fn a_declare_for_b_leaves_the_overlay_of_a_at_its_bounds() {
		let mut overlays = framed(&[A, B]);
		declare(&mut overlays, A, Some(BUTTON), 1).expect("A declares");
		declare(&mut overlays, B, Some(BUTTON), 2).expect("B declares");

		declare(&mut overlays, B, Some(MOVED), 3).expect("B moves");
		declare(&mut overlays, B, None, 3).expect("B hides");

		assert_eq!(overlays.overlay(A), Some(Overlay { hwnd: 1, bounds: Some(BUTTON) }));
		assert_eq!(overlays.overlay(B), Some(Overlay { hwnd: 2, bounds: None }));
	}

	#[test]
	fn creates_the_overlay_only_on_the_first_declare_with_bounds() {
		let mut overlays = framed(&[A]);

		assert_eq!(declare(&mut overlays, A, None, 1), Ok(None));
		assert_eq!(overlays.overlay(A), None);
		declare(&mut overlays, A, Some(BUTTON), 2).expect("A declares");
		let moved = overlays.declare::<Refusal>(A, Some(MOVED), || Err(Refusal::Created));

		assert_eq!(moved, Ok(Some(Overlay { hwnd: 2, bounds: Some(MOVED) })));
	}

	#[test]
	fn a_failed_creation_leaves_the_window_without_an_overlay() {
		let mut overlays = framed(&[A]);

		let created = overlays.declare(A, Some(BUTTON), || Err(Refusal::Created));

		assert_eq!(created, Err(Refusal::Created));
		assert_eq!(overlays.overlay(A), None);
	}

	#[test]
	fn forgetting_a_leaves_the_overlay_of_b() {
		let mut overlays = framed(&[A, B]);
		declare(&mut overlays, A, Some(BUTTON), 1).expect("A declares");
		declare(&mut overlays, B, Some(BUTTON), 2).expect("B declares");

		overlays.forget(A);

		assert_eq!(overlays.overlay(A), None);
		assert_eq!(overlays.overlay(B), Some(Overlay { hwnd: 2, bounds: Some(BUTTON) }));
	}

	#[test]
	fn a_forgotten_window_is_refused_as_never_framed() {
		let mut overlays = framed(&[A]);
		declare(&mut overlays, A, Some(BUTTON), 1).expect("A declares");

		overlays.forget(A);

		assert_eq!(declare(&mut overlays, A, Some(BUTTON), 2), Err(Refusal::NotFramed));
		assert_eq!(overlays.overlay(A), None);
	}

	#[test]
	fn refuses_a_window_that_was_never_framed() {
		let mut overlays = framed(&[A]);

		assert_eq!(declare(&mut overlays, B, Some(BUTTON), 2), Err(Refusal::NotFramed));
		assert_eq!(overlays.overlay(B), None);
	}
}
