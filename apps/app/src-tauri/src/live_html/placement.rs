use super::contract::LiveHtmlRectangle;

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frame {
	pub x: f64,
	pub y: f64,
	pub width: f64,
	pub height: f64,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Frames {
	pub holder: Frame,
	pub view: Frame,
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Placement {
	pub rectangle: LiveHtmlRectangle,
	pub clip: Option<LiveHtmlRectangle>,
	pub top_inset: f64,
}

pub struct ContentView {
	pub height: f64,
	pub is_flipped: bool,
}

impl Placement {
	pub fn frames(self, content: &ContentView) -> Frames {
		let view = self.below_the_inset(self.rectangle);
		let shown = match self.clip {
			Some(clip) => intersection(view, self.below_the_inset(clip)),
			None => view,
		};
		let inside = Frame {
			x: view.x - shown.x,
			y: shown.height - (view.y - shown.y) - view.height,
			width: view.width,
			height: view.height,
		};
		let holder_y =
			if content.is_flipped { shown.y } else { content.height - shown.y - shown.height };
		Frames { holder: Frame { y: holder_y, ..shown }, view: inside }
	}

	fn below_the_inset(self, rectangle: LiveHtmlRectangle) -> Frame {
		Frame {
			x: rectangle.x,
			y: rectangle.y + self.top_inset,
			width: rectangle.width,
			height: rectangle.height,
		}
	}
}

fn intersection(first: Frame, second: Frame) -> Frame {
	let left = first.x.max(second.x);
	let top = first.y.max(second.y);
	let right = (first.x + first.width).min(second.x + second.width);
	let bottom = (first.y + first.height).min(second.y + second.height);
	Frame { x: left, y: top, width: (right - left).max(0.0), height: (bottom - top).max(0.0) }
}

#[cfg(test)]
mod tests {
	use super::*;

	const INSET: f64 = 32.0;
	const CONTENT: ContentView = ContentView { height: 800.0, is_flipped: false };

	fn rectangle(x: f64, y: f64, width: f64, height: f64) -> LiveHtmlRectangle {
		LiveHtmlRectangle { x, y, width, height }
	}

	fn frame(x: f64, y: f64, width: f64, height: f64) -> Frame {
		Frame { x, y, width, height }
	}

	#[test]
	fn an_unclipped_view_fills_a_holder_placed_below_the_inset() {
		let placement = Placement {
			rectangle: rectangle(29.0, 57.0, 502.0, 160.0),
			clip: None,
			top_inset: INSET,
		};
		let frames = placement.frames(&CONTENT);
		assert_eq!(frames.holder, frame(29.0, 800.0 - 89.0 - 160.0, 502.0, 160.0));
		assert_eq!(frames.view, frame(0.0, 0.0, 502.0, 160.0));
	}

	#[test]
	fn a_flipped_content_view_takes_the_top_left_origin_as_it_is() {
		let placement = Placement {
			rectangle: rectangle(10.0, 20.0, 100.0, 50.0),
			clip: None,
			top_inset: INSET,
		};
		let frames = placement.frames(&ContentView { height: 800.0, is_flipped: true });
		assert_eq!(frames.holder, frame(10.0, 52.0, 100.0, 50.0));
	}

	#[test]
	fn a_clip_cutting_the_top_keeps_the_page_at_its_full_size_and_position() {
		let placement = Placement {
			rectangle: rectangle(0.0, 100.0, 400.0, 300.0),
			clip: Some(rectangle(0.0, 200.0, 400.0, 600.0)),
			top_inset: 0.0,
		};
		let frames = placement.frames(&CONTENT);
		assert_eq!(frames.holder, frame(0.0, 800.0 - 200.0 - 200.0, 400.0, 200.0));
		assert_eq!(frames.view, frame(0.0, 0.0, 400.0, 300.0));
	}

	#[test]
	fn a_clip_cutting_the_bottom_and_the_left_shifts_the_page_inside_its_holder() {
		let placement = Placement {
			rectangle: rectangle(100.0, 100.0, 400.0, 300.0),
			clip: Some(rectangle(150.0, 0.0, 1000.0, 250.0)),
			top_inset: 0.0,
		};
		let frames = placement.frames(&CONTENT);
		assert_eq!(frames.holder, frame(150.0, 800.0 - 100.0 - 150.0, 350.0, 150.0));
		assert_eq!(frames.view, frame(-50.0, 150.0 - 0.0 - 300.0, 400.0, 300.0));
	}

	#[test]
	fn a_clip_beside_the_view_draws_nothing() {
		let placement = Placement {
			rectangle: rectangle(0.0, 0.0, 100.0, 100.0),
			clip: Some(rectangle(500.0, 500.0, 50.0, 50.0)),
			top_inset: INSET,
		};
		let frames = placement.frames(&CONTENT);
		assert_eq!((frames.holder.width, frames.holder.height), (0.0, 0.0));
	}
}
