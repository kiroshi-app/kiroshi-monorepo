use rune::{
	Align, Color, El, LineCap, Path, Shape, SurfaceFit, TextStyle, col, el, icon, row, text,
};

use super::model::{
	Content, LibraryCard, LinkCard, Owner, Picture, SectionTint, ShapeFill, ShapeKind, StickyColour,
};
use super::presence::author_avatar;
use crate::icons;
use crate::strings::{Language, common};
use crate::tokens::{
	RADIUS_BUBBLE, RADIUS_CONTROL, RADIUS_LG, RADIUS_SM, SPACING, TEXT_11, TEXT_COMPACT_SEMIBOLD,
	TEXT_READING, TEXT_SM_MEDIUM, TEXT_SM_SEMIBOLD, TEXT_XS, Tokens,
};

pub const LIBRARY_CARD_WIDTH: f32 = 236.0;
const STICKY_RADIUS: f32 = 4.0;
const STICKY_PADDING: f32 = SPACING * 4.0;
const STICKY_LINES: usize = 5;
const AUTHOR_AVATAR: f32 = 18.0;
const CARET_WIDTH: f32 = 2.0;
const CARET_HEIGHT: f32 = 20.0;
const SHAPE_BORDER: f32 = 2.0;
const SECTION_TITLE_INSET: f32 = SPACING * 3.0;
const SECTION_TITLE_HEIGHT: f32 = SPACING * 6.0;
const LINK_PREVIEW_HEIGHT: f32 = SPACING * 18.0;
const DOMAIN_BADGE: f32 = 14.0;
const LIBRARY_GLYPH_TILE: f32 = SPACING * 6.0;
const LIBRARY_GLYPH: f32 = 13.0;
const SOURCE_GLYPH: f32 = SPACING * 3.0;
const DRAGGING_TILT: f32 = -2.0 * std::f32::consts::PI / 180.0;
const DRAGGING_OPACITY: f32 = 0.94;

pub const STICKY_TEXT: TextStyle = TextStyle { line_height: 20.0, ..TEXT_READING };
const HEADING: TextStyle =
	TextStyle { line_height: 30.0, tracking: -0.48, ..TextStyle::new(24.0, 600.0) };
const SHAPE_LABEL: TextStyle = TextStyle { line_height: 18.0, ..TEXT_SM_MEDIUM };
const COMPACT_TITLE: TextStyle = TextStyle { line_height: 16.0, ..TEXT_COMPACT_SEMIBOLD };
const CARD_TITLE: TextStyle = TextStyle { line_height: 18.0, ..TEXT_SM_SEMIBOLD };
const CARD_BODY: TextStyle = TextStyle { line_height: 17.0, ..TEXT_XS };
const AUTHOR_NAME: TextStyle = TextStyle { weight: 600.0, ..TEXT_XS };
const DOMAIN_INITIAL: TextStyle = TextStyle { line_height: 10.0, ..TextStyle::new(8.0, 600.0) };
const LIBRARY_META: TextStyle = TextStyle { line_height: 14.0, ..TEXT_11 };

pub fn sticky_fill(t: &Tokens, colour: StickyColour) -> Color {
	match colour {
		StickyColour::Yellow => t.board_sticky_yellow,
		StickyColour::Green => t.board_sticky_green,
		StickyColour::Pink => t.board_sticky_pink,
		StickyColour::Blue => t.board_sticky_blue,
		StickyColour::Orange => t.board_sticky_orange,
	}
}

pub fn shape_fill(t: &Tokens, fill: ShapeFill) -> Color {
	match fill {
		ShapeFill::Surface => t.board_shape_surface,
		ShapeFill::Yellow => t.board_sticky_yellow,
		ShapeFill::Green => t.board_sticky_green,
		ShapeFill::Blue => t.board_sticky_blue,
		ShapeFill::Pink => t.board_sticky_pink,
	}
}

pub struct SectionPaint {
	pub surface: Color,
	pub border: Color,
	pub chip: Color,
	pub title: Color,
}

pub fn section_paint(t: &Tokens, tint: SectionTint) -> SectionPaint {
	match tint {
		SectionTint::Blue => SectionPaint {
			surface: t.board_section_blue_surface,
			border: t.board_section_blue_border,
			chip: t.board_section_blue_title_chip,
			title: t.board_section_blue_title_foreground,
		},
		SectionTint::Purple => SectionPaint {
			surface: t.board_section_purple_surface,
			border: t.board_section_purple_border,
			chip: t.board_section_purple_title_chip,
			title: t.board_section_purple_title_foreground,
		},
	}
}

pub struct Sticky<'a> {
	pub colour: StickyColour,
	pub text: &'a str,
	pub author: &'a Owner,
	pub caret: Option<Color>,
}

pub fn sticky(t: &Tokens, sticky: &Sticky, size: (f32, f32)) -> El {
	let mut body = row().items_start().child(
		text(sticky.text.to_owned())
			.font(STICKY_TEXT)
			.color(t.board_sticky_foreground)
			.wrap_anywhere()
			.max_lines(STICKY_LINES)
			.shrink(),
	);
	if let Some(caret) = sticky.caret {
		body = body.child(
			el().size(CARET_WIDTH, CARET_HEIGHT)
				.radius(CARET_WIDTH / 2.0)
				.fill(caret)
				.a11y_hidden(),
		);
	}
	col()
		.size(size.0, size.1)
		.padding(STICKY_PADDING)
		.justify_between()
		.radius(STICKY_RADIUS)
		.fill(sticky_fill(t, sticky.colour))
		.child(body)
		.child(
			row()
				.gap(SPACING * 1.5)
				.center_y()
				.child(author_avatar(t, sticky.author, AUTHOR_AVATAR))
				.child(
					text(sticky.author.name.clone())
						.font(AUTHOR_NAME)
						.color(t.board_sticky_author_foreground)
						.truncate(),
				),
		)
}

pub fn board_text(t: &Tokens, heading: Option<&str>, body: Option<&str>, width: f32) -> El {
	let mut column = col().w(width).gap(SPACING * 1.5);
	if let Some(heading) = heading.filter(|heading| !heading.is_empty()) {
		column = column.child(
			text(heading.to_owned()).font(HEADING).color(t.board_foreground).wrap_anywhere(),
		);
	}
	if let Some(body) = body.filter(|body| !body.is_empty()) {
		column = column.child(
			text(body.to_owned()).font(TEXT_READING).color(t.board_body_foreground).wrap_anywhere(),
		);
	}
	column
}

pub fn shape(t: &Tokens, kind: ShapeKind, fill: ShapeFill, label: &str, size: (f32, f32)) -> El {
	let ink =
		if fill == ShapeFill::Surface { t.board_foreground } else { t.board_sticky_foreground };
	let frame = row().size(size.0, size.1).padding(SPACING * 3.0).center().child(
		text(label.to_owned())
			.font(SHAPE_LABEL)
			.color(ink)
			.wrap_anywhere()
			.align(Align::Center)
			.shrink(),
	);
	match kind {
		ShapeKind::RoundedRectangle => frame
			.radius(RADIUS_CONTROL)
			.fill(shape_fill(t, fill))
			.border(SHAPE_BORDER, t.board_shape_border),
		ShapeKind::Ellipse => frame.shape(ellipse(size, shape_fill(t, fill), t.board_shape_border)),
	}
}

const ELLIPSE_SEGMENTS: usize = 96;

fn ellipse(size: (f32, f32), fill: Color, border: Color) -> Shape {
	let inset = SHAPE_BORDER / 2.0;
	let (rx, ry) = (size.0 / 2.0 - inset, size.1 / 2.0 - inset);
	let points: Vec<[f32; 2]> = (0..ELLIPSE_SEGMENTS)
		.map(|step| {
			let angle = step as f32 / ELLIPSE_SEGMENTS as f32 * std::f32::consts::TAU;
			[size.0 / 2.0 + rx * angle.cos(), size.1 / 2.0 + ry * angle.sin()]
		})
		.collect();
	let mut outline = Path::new().move_to(points[0]);
	for point in &points[1..] {
		outline = outline.line_to(*point);
	}
	Shape::new().fill(points, fill).stroke_path(
		&outline.close(),
		SHAPE_BORDER,
		LineCap::Round,
		border,
	)
}

pub fn section(t: &Tokens, tint: SectionTint, title: &str, size: (f32, f32)) -> El {
	let paint = section_paint(t, tint);
	el().size(size.0, size.1)
		.radius(RADIUS_BUBBLE)
		.fill(paint.surface)
		.border(1.0, paint.border)
		.child(
			row()
				.absolute(SECTION_TITLE_INSET, SECTION_TITLE_INSET)
				.h(SECTION_TITLE_HEIGHT)
				.max_w(size.0 - SECTION_TITLE_INSET * 2.0)
				.px(SPACING * 2.0)
				.center_y()
				.radius(RADIUS_SM)
				.fill(paint.chip)
				.child(text(title.to_owned()).font(COMPACT_TITLE).color(paint.title).truncate()),
		)
}

fn picture(t: &Tokens, image: Option<&Picture>, size: (f32, f32), radius: f32) -> El {
	let frame = el().size(size.0, size.1).radius(radius).fill(t.board_card_inset);
	match image.filter(|image| image.0.size().is_some()) {
		Some(image) => frame.clip_rounded(radius).pixels_fit(image.0.pixels(), SurfaceFit::Fill),
		None => frame,
	}
}

pub fn image(
	t: &Tokens,
	image: Option<&Picture>,
	alt: &str,
	source: Option<&str>,
	size: (f32, f32),
) -> El {
	let Some(source) = source else {
		return picture(t, image, size, RADIUS_SM).label(alt.to_owned());
	};
	col()
		.w(size.0)
		.gap(SPACING * 1.5)
		.label(alt.to_owned())
		.child(picture(t, image, (size.0, size.1), RADIUS_SM))
		.child(
			row()
				.gap(SPACING * 1.5)
				.center_y()
				.child(icon(&icons::LINK, SOURCE_GLYPH).color(t.board_muted_foreground))
				.child(
					text(source.to_owned())
						.font(TEXT_XS)
						.color(t.board_muted_foreground)
						.truncate(),
				),
		)
}

fn first_letter(domain: &str) -> String {
	domain.chars().next().map(|letter| letter.to_uppercase().collect()).unwrap_or_default()
}

pub fn link_card(t: &Tokens, card: &LinkCard, width: f32) -> El {
	col()
		.w(width)
		.radius(RADIUS_LG)
		.clip_rounded(RADIUS_LG)
		.fill(t.board_card_surface)
		.border(1.0, t.board_card_border)
		.child(picture(t, card.preview.as_ref(), (width, LINK_PREVIEW_HEIGHT), 0.0))
		.child(
			col()
				.padding(SPACING * 3.0)
				.gap(SPACING)
				.child(
					text(card.title.clone())
						.font(CARD_TITLE)
						.color(t.board_card_foreground)
						.truncate(),
				)
				.child(
					text(card.description.clone())
						.font(CARD_BODY)
						.color(t.board_card_soft_foreground)
						.wrap_anywhere()
						.max_lines(2),
				)
				.child(
					row()
						.pt(SPACING)
						.gap(SPACING * 1.5)
						.center_y()
						.child(
							row()
								.size(DOMAIN_BADGE, DOMAIN_BADGE)
								.radius(DOMAIN_BADGE / 2.0)
								.fill(t.board_card_inset)
								.center()
								.a11y_hidden()
								.child(
									text(first_letter(&card.domain))
										.font(DOMAIN_INITIAL)
										.color(t.board_card_soft_foreground),
								),
						)
						.child(
							text(card.domain.clone())
								.font(TEXT_XS)
								.color(t.board_muted_foreground)
								.truncate(),
						),
				),
		)
}

pub fn library_card(t: &Tokens, card: &LibraryCard, is_dragging: bool, width: f32) -> El {
	let face = col()
		.w(width)
		.padding(SPACING * 3.0)
		.gap(SPACING * 2.0)
		.radius(RADIUS_LG)
		.fill(t.board_card_surface)
		.border(1.0, t.board_card_border)
		.child(
			row()
				.gap(SPACING * 2.0)
				.center_y()
				.child(
					row()
						.size(LIBRARY_GLYPH_TILE, LIBRARY_GLYPH_TILE)
						.radius(RADIUS_SM)
						.fill(t.board_card_inset)
						.center()
						.a11y_hidden()
						.child(
							icon(&icons::FILE, LIBRARY_GLYPH).color(t.board_card_soft_foreground),
						),
				)
				.child(
					text(card.title.clone())
						.font(COMPACT_TITLE)
						.color(t.board_card_foreground)
						.truncate(),
				),
		)
		.child(
			text(card.excerpt.clone())
				.font(CARD_BODY)
				.color(t.board_card_soft_foreground)
				.wrap_anywhere(),
		)
		.child(
			text(common::board::library_card::DOCUMENT_META.text(Language::En).to_owned())
				.font(LIBRARY_META)
				.color(t.board_muted_foreground)
				.wrap_anywhere(),
		);
	if is_dragging {
		return face.rotate(DRAGGING_TILT).opacity(DRAGGING_OPACITY);
	}
	face
}

pub fn foreign(t: &Tokens, label: &str, size: (f32, f32)) -> El {
	row()
		.size(size.0, size.1)
		.center()
		.radius(crate::tokens::RADIUS_MD)
		.fill(t.card)
		.border(1.0, t.border)
		.child(text(label.to_owned()).font(TEXT_XS).color(t.muted_foreground))
}

pub fn content(t: &Tokens, content: &Content, size: (f32, f32), caret: Option<Color>) -> El {
	match content {
		Content::Sticky { colour, text, author } => {
			sticky(t, &Sticky { colour: *colour, text, author, caret }, size)
		}
		Content::Text { heading, body } => {
			board_text(t, heading.as_deref(), body.as_deref(), size.0)
		}
		Content::Shape { style, label } => shape(t, style.shape, style.fill, label, size),
		Content::Section { tint, title } => section(t, *tint, title, size),
		Content::Image { picture, alt, source } => {
			let height = if source.is_some() { size.1 - SPACING * 5.5 } else { size.1 };
			image(t, picture.as_ref(), alt, source.as_deref(), (size.0, height))
		}
		Content::Link(card) => link_card(t, card, size.0),
		Content::Library(card) => library_card(t, card, false, size.0),
		Content::Foreign { text } => foreign(t, text, size),
	}
}
