use rune::image::Image;
use rune::{El, Icon, SurfaceFit, col, el, icon, row, text};

use crate::tokens::{
	RADIUS_2XL, RADIUS_LG, RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded,
};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ItemVariant {
	#[default]
	Default,
	Outline,
	Muted,
}

impl ItemVariant {
	pub const ALL: [ItemVariant; 3] =
		[ItemVariant::Default, ItemVariant::Outline, ItemVariant::Muted];

	pub fn name(self) -> &'static str {
		match self {
			ItemVariant::Default => "default",
			ItemVariant::Outline => "outline",
			ItemVariant::Muted => "muted",
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ItemSize {
	#[default]
	Default,
	Sm,
	Xs,
}

impl ItemSize {
	pub const ALL: [ItemSize; 3] = [ItemSize::Default, ItemSize::Sm, ItemSize::Xs];

	pub fn name(self) -> &'static str {
		match self {
			ItemSize::Default => "default",
			ItemSize::Sm => "sm",
			ItemSize::Xs => "xs",
		}
	}

	fn inset(self) -> f32 {
		match self {
			ItemSize::Default => SPACING * 3.5,
			ItemSize::Sm => SPACING * 3.0,
			ItemSize::Xs => SPACING * 2.0,
		}
	}

	fn gap(self) -> f32 {
		match self {
			ItemSize::Default | ItemSize::Sm => SPACING * 3.5,
			ItemSize::Xs => SPACING * 2.0,
		}
	}

	fn picture(self) -> (f32, f32) {
		match self {
			ItemSize::Default => (SPACING * 10.0, RADIUS_XL),
			ItemSize::Sm => (SPACING * 8.0, RADIUS_XL),
			ItemSize::Xs => (SPACING * 6.0, RADIUS_LG),
		}
	}
}

pub enum ItemMedia<'a> {
	Glyph(&'static Icon),
	Picture(&'a Image),
}

pub struct Item<'a> {
	pub title: &'a str,
	pub description: Option<&'a str>,
	pub media: Option<ItemMedia<'a>>,
	pub actions: Option<El>,
	pub variant: ItemVariant,
	pub size: ItemSize,
}

impl<'a> Item<'a> {
	pub fn new(title: &'a str) -> Item<'a> {
		Item {
			title,
			description: None,
			media: None,
			actions: None,
			variant: ItemVariant::Default,
			size: ItemSize::Default,
		}
	}

	pub fn view(self, t: &Tokens) -> El {
		let mut item = row()
			.w_full()
			.padding(self.size.inset())
			.gap(self.size.gap())
			.radius(RADIUS_2XL)
			.center_y()
			.role("listitem")
			.label(self.title);
		item = match self.variant {
			ItemVariant::Default => item,
			ItemVariant::Outline => item.border(1.0, t.border),
			ItemVariant::Muted => item.fill(faded(t.muted, 0.5)),
		};
		if let Some(media) = self.media {
			item = item.child(match media {
				ItemMedia::Glyph(glyph) => icon(glyph, SPACING * 4.0).color(t.foreground),
				ItemMedia::Picture(image) => {
					let (side, radius) = self.size.picture();
					let frame = el().size(side, side).radius(radius);
					match image.size() {
						Some(_) => frame.pixels_fit(image.pixels(), SurfaceFit::Fill),
						None => frame.fill(t.muted),
					}
				}
			});
		}
		let mut content = col()
			.grow(1.0)
			.gap(if self.size == ItemSize::Xs { SPACING * 0.5 } else { SPACING })
			.child(
				text(self.title.to_owned()).font(TEXT_SM_MEDIUM).color(t.foreground).max_lines(1),
			);
		if let Some(description) = self.description {
			content = content.child(
				text(description.to_owned()).font(TEXT_SM).color(t.muted_foreground).max_lines(2),
			);
		}
		item = item.child(content);
		if let Some(actions) = self.actions {
			item = item.child(row().gap(SPACING * 2.0).center_y().child(actions));
		}
		item
	}
}
