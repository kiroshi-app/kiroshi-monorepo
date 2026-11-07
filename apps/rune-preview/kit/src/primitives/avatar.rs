use rune::image::Image;
use rune::{El, SurfaceFit, el, row, text};

use super::tight;
use crate::tokens::{SPACING, TEXT_SM, TEXT_XS, Tokens};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum AvatarSize {
	Sm,
	#[default]
	Default,
	Lg,
}

impl AvatarSize {
	fn side(self) -> f32 {
		match self {
			AvatarSize::Sm => SPACING * 6.0,
			AvatarSize::Default => SPACING * 8.0,
			AvatarSize::Lg => SPACING * 10.0,
		}
	}

	fn badge(self) -> f32 {
		match self {
			AvatarSize::Sm => SPACING * 2.0,
			AvatarSize::Default => SPACING * 2.5,
			AvatarSize::Lg => SPACING * 3.0,
		}
	}
}

const GROUP_RING: f32 = 2.0;
const GROUP_OVERLAP: f32 = SPACING * 2.0;

pub struct Avatar<'a> {
	pub name: &'a str,
	pub initials: &'a str,
	pub image: Option<&'a Image>,
	pub size: AvatarSize,
	pub badge: bool,
}

impl Avatar<'_> {
	pub fn view(self, t: &Tokens) -> El {
		let side = self.size.side();
		let circle = el().size(side, side).radius(side / 2.0).role("img").label(self.name);
		let face = match self.image.filter(|image| image.size().is_some()) {
			Some(image) => circle.pixels_fit(image.pixels(), SurfaceFit::Fill),
			None => {
				let style = tight(if self.size == AvatarSize::Sm { TEXT_XS } else { TEXT_SM });
				circle
					.fill(t.muted)
					.center()
					.child(text(self.initials.to_owned()).font(style).color(t.muted_foreground))
			}
		};
		let face = face.child(
			el().size(side, side).radius(side / 2.0).border(1.0, t.border).absolute(0.0, 0.0),
		);
		if !self.badge {
			return face;
		}
		let dot = self.size.badge();
		face.child(
			el().size(dot, dot)
				.radius(dot / 2.0)
				.fill(t.primary)
				.outline(2.0, 0.0, t.background)
				.absolute(side - dot, side - dot),
		)
	}
}

pub fn avatar_count(t: &Tokens, count: &str, size: AvatarSize) -> El {
	let side = size.side();
	el().size(side, side)
		.radius(side / 2.0)
		.fill(t.muted)
		.center()
		.label(count)
		.child(text(count.to_owned()).font(tight(TEXT_SM)).color(t.muted_foreground))
}

pub fn avatar_group(t: &Tokens, members: impl IntoIterator<Item = El>) -> El {
	row().center_y().children(members.into_iter().enumerate().map(|(at, member)| {
		let ringed = member.outline(GROUP_RING, 0.0, t.background);
		if at == 0 { ringed } else { ringed.ml(-GROUP_OVERLAP) }
	}))
}
