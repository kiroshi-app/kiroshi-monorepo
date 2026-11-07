use rune::{El, Icon, LoopSpec, Transition, col, el, icon, row, text};

use super::button::{Button, ButtonSize, ButtonVariant};
use super::{elevated, overlay_motion};
use crate::icons;
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens};

const WIDTH: f32 = SPACING * 96.0;
const INSET: f32 = SPACING * 4.0;
const GLYPH: f32 = SPACING * 4.0;
const SPIN_PERIOD: f64 = 1.0;
const ENTRY_TRAVEL: f32 = SPACING * 6.0;
const CLOSE_LABEL: &str = "Close";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ToastType {
	Plain,
	Success,
	Info,
	Warning,
	Error,
	Loading,
}

impl ToastType {
	pub const ALL: [ToastType; 6] = [
		ToastType::Plain,
		ToastType::Success,
		ToastType::Info,
		ToastType::Warning,
		ToastType::Error,
		ToastType::Loading,
	];

	fn glyph(self) -> Option<&'static Icon> {
		match self {
			ToastType::Plain => None,
			ToastType::Success => Some(&icons::CIRCLE_CHECK),
			ToastType::Info => Some(&icons::INFO),
			ToastType::Warning => Some(&icons::TRIANGLE_ALERT),
			ToastType::Error => Some(&icons::OCTAGON_X),
			ToastType::Loading => Some(&icons::LOADER_CIRCLE),
		}
	}
}

pub struct Toast<'a> {
	pub kind: ToastType,
	pub title: &'a str,
	pub description: &'a str,
	pub action: Option<&'a str>,
}

pub fn toast(t: &Tokens, content: Toast) -> El {
	let mut body = row().w_full().padding(INSET).gap(SPACING * 3.0).center_y();
	if let Some(glyph) = content.kind.glyph() {
		let ink =
			if content.kind == ToastType::Error { t.destructive } else { t.popover_foreground };
		let mark = el().size(GLYPH, GLYPH).a11y_hidden().child(icon(glyph, GLYPH).color(ink));
		let mark = if content.kind == ToastType::Loading && !t.reduced_motion {
			mark.looping(LoopSpec::rotation(SPIN_PERIOD))
		} else {
			mark
		};
		body = body.child(mark);
	}
	body = body.child(
		col()
			.grow(1.0)
			.shrink()
			.gap(SPACING)
			.child(
				text(content.title.to_owned())
					.font(TEXT_SM_MEDIUM)
					.color(t.popover_foreground)
					.role("heading"),
			)
			.child(
				text(content.description.to_owned()).font(TEXT_SM).color(t.muted_foreground).wrap(),
			),
	);
	if let Some(action) = content.action {
		body = body.child(
			Button::new(action).variant(ButtonVariant::Outline).size(ButtonSize::Sm).view(t),
		);
	}
	body = body.child(
		Button::icon(&icons::CLOSE, CLOSE_LABEL)
			.variant(ButtonVariant::Ghost)
			.size(ButtonSize::IconSm)
			.view(t),
	);
	let surface = col()
		.key(format!("toast-{}", content.title))
		.w(WIDTH)
		.radius(RADIUS_2XL)
		.border(1.0, t.border)
		.fill(t.popover)
		.role("dialog")
		.label(content.title)
		.transition(overlay_motion(
			t,
			Transition::offset(0.0, ENTRY_TRAVEL).combined(Transition::opacity()),
		))
		.child(body);
	elevated(t, surface)
}
