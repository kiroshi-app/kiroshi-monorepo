use rune::{Color, El, LineCap, Path, Shape, TextStyle, canvas, el, row, text};

use super::model::{Outline, OutlineState, Owner, OwnerKind, Point};
use crate::avatar::{Face, Person, hue_shift};
use crate::hues::Role;
use crate::strings::{Language, common};
use crate::tokens::{SPACING, TEXT_COMPACT_MEDIUM, TEXT_XS, Tokens, tone};

const TAG_AVATAR: f32 = 16.0;
const ARROW_SIDE: f32 = 20.0;
const ARROW_INSET: f32 = 2.0;
const ARROW_OUTLINE: f32 = 1.5;
const ARROW: [[f32; 2]; 4] = [[2.0, 2.0], [17.0, 9.0], [10.5, 10.5], [8.0, 17.0]];
const TAG_OFFSET: (f32, f32) = (14.0, 18.0);
const TAG_HEIGHT: f32 = 22.0;
const TAG_RADIUS: f32 = 6.0;
const TAG_INSET: f32 = 3.0;
const TAG_NAME_MAX: f32 = 160.0;
const WRITING_RING: f32 = 2.0;
const DRAWING_RING: f32 = 4.0;
const DRAWING_RING_SHARE: f32 = 0.25;
const CHIP_HEIGHT: f32 = SPACING * 8.0;
const CHIP_AVATAR: f32 = 24.0;
const STOP_HEIGHT: f32 = SPACING * 6.0;
const STOP_MARK: f32 = SPACING * 2.0;
const NAME: TextStyle = TextStyle { weight: 600.0, ..TEXT_XS };

pub fn owner_colour(owner: &Owner) -> Color {
	match (owner.kind, owner.hue) {
		(_, None) => Tokens::new(false).bot_avatar_field_untinted,
		(OwnerKind::Agent, Some(hue)) => {
			tone((f64::from(hue) + hue_shift(&owner.name)) as f32, false, Role::AvatarInk)
		}
		(OwnerKind::Person, Some(hue)) => tone(hue, false, Role::Accent),
	}
}

pub fn author_avatar(t: &Tokens, owner: &Owner, size: f32) -> El {
	match owner.kind {
		OwnerKind::Agent => Face::still(&owner.name, owner.hue).draw(size, t),
		OwnerKind::Person => Person { name: &owner.name, image: None }.draw(size, t),
	}
}

pub fn outlined(object: El, outline: &Outline) -> El {
	let colour = owner_colour(&outline.owner);
	match outline.state {
		OutlineState::Writing => object.outline(WRITING_RING, 0.0, colour),
		OutlineState::Drawing => {
			object.outline(DRAWING_RING, 0.0, colour.alpha(colour.a * DRAWING_RING_SHARE))
		}
	}
}

fn arrow(fill: Color) -> El {
	let mut path = Path::new().move_to(ARROW[0]);
	for corner in &ARROW[1..] {
		path = path.line_to(*corner);
	}
	let path = path.close();
	canvas(Shape::new().fill(ARROW.to_vec(), fill).stroke_path(
		&path,
		ARROW_OUTLINE,
		LineCap::Round,
		Color::WHITE,
	))
	.size(ARROW_SIDE, ARROW_SIDE)
	.absolute(-ARROW_INSET, -ARROW_INSET)
}

pub fn pointer(t: &Tokens, owner: &Owner, at: Point) -> El {
	let colour = owner_colour(owner);
	el().absolute(at.x.round() as f32, at.y.round() as f32)
		.size(0.0, 0.0)
		.a11y_hidden()
		.child(arrow(colour))
		.child(
			row()
				.absolute(TAG_OFFSET.0, TAG_OFFSET.1)
				.h(TAG_HEIGHT)
				.pl(TAG_INSET)
				.pr(SPACING * 2.0)
				.gap(SPACING)
				.center_y()
				.corners([0.0, TAG_RADIUS, TAG_RADIUS, TAG_RADIUS])
				.fill(colour)
				.child(author_avatar(t, owner, TAG_AVATAR))
				.child(
					text(owner.name.clone())
						.font(NAME)
						.color(Color::WHITE)
						.max_w(TAG_NAME_MAX)
						.truncate(),
				),
		)
}

pub fn presence_header(t: &Tokens, people: &[Owner], agents: &[Owner]) -> El {
	let mut header = row().gap(SPACING * 2.0).center_y();
	if !people.is_empty() {
		header = header.child(
			row()
				.gap(-SPACING)
				.children(people.iter().map(|person| author_avatar(t, person, CHIP_AVATAR))),
		);
	}
	if agents.is_empty() {
		return header;
	}
	let key = if agents.len() == 1 {
		common::board::presence::DRAWING_ONE
	} else {
		common::board::presence::DRAWING_OTHER
	};
	let label = key.text(Language::En).replace("{{count}}", &agents.len().to_string());
	header.child(
		row()
			.h(CHIP_HEIGHT)
			.pl(SPACING)
			.pr(SPACING)
			.gap(SPACING * 2.0)
			.center_y()
			.radius(CHIP_HEIGHT / 2.0)
			.fill(t.foreground.alpha(0.04))
			.border(1.0, t.foreground.alpha(0.08))
			.child(
				row()
					.gap(-SPACING)
					.children(agents.iter().map(|agent| author_avatar(t, agent, CHIP_AVATAR))),
			)
			.child(text(label).font(TEXT_COMPACT_MEDIUM).color(t.soft_foreground))
			.child(
				row()
					.h(STOP_HEIGHT)
					.px(SPACING * 2.0)
					.gap(SPACING * 1.5)
					.center_y()
					.radius(STOP_HEIGHT / 2.0)
					.border(1.0, t.border)
					.child(el().size(STOP_MARK, STOP_MARK).radius(1.0).fill(t.foreground))
					.child(
						text(
							common::library::document::agents::STOP_ALL
								.text(Language::En)
								.to_owned(),
						)
						.font(TEXT_XS)
						.color(t.foreground),
					),
			),
	)
}
