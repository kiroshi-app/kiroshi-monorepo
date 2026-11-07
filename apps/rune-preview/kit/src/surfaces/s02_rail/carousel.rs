use rune::{El, ScrollSpec, col};

use super::Space;
use super::rail::RailPanel;
use crate::tokens::SPACING;

const COLUMN_INSET: f32 = SPACING * 2.0;
const PANEL_GAP: f32 = SPACING;

pub struct SpaceCarousel<'a> {
	pub list: RailPanel,
	pub spaces: &'a [Space<'a>],
	pub selected: Option<&'a str>,
}

impl SpaceCarousel<'_> {
	pub fn view(&self, render_space: impl Fn(&Space) -> El) -> El {
		let chosen = self
			.spaces
			.iter()
			.find(|space| Some(space.id) == self.selected)
			.or(self.spaces.first());
		let mut carousel = col().key("space-carousel").w_full().grow(1.0).min_h(0.0);
		if let Some(space) = chosen {
			carousel = carousel.child(
				col()
					.key(format!("space-panel-{}:{}", self.list.key(), space.id))
					.w_full()
					.grow(1.0)
					.min_h(0.0)
					.px(COLUMN_INSET)
					.gap(PANEL_GAP)
					.scroll(ScrollSpec { stick_bottom: false })
					.child(render_space(space)),
			);
		}
		carousel
	}
}
