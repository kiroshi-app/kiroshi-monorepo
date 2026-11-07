use rune::{Cursor, El, Icon, icon, row, text};

use super::{
	DISABLED_OPACITY, FOCUS_RING_WIDTH, Interaction, Paint, equal_padding, focus_ring, tight,
};
use crate::tokens::{RADIUS_2XL, SPACING, TEXT_SM_MEDIUM, TEXT_XS_MEDIUM, Tokens, faded, mix};

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ButtonVariant {
	#[default]
	Default,
	Outline,
	Secondary,
	Ghost,
	Destructive,
	Link,
}

impl ButtonVariant {
	pub const ALL: [ButtonVariant; 6] = [
		ButtonVariant::Default,
		ButtonVariant::Secondary,
		ButtonVariant::Outline,
		ButtonVariant::Ghost,
		ButtonVariant::Destructive,
		ButtonVariant::Link,
	];

	pub fn name(self) -> &'static str {
		match self {
			ButtonVariant::Default => "default",
			ButtonVariant::Outline => "outline",
			ButtonVariant::Secondary => "secondary",
			ButtonVariant::Ghost => "ghost",
			ButtonVariant::Destructive => "destructive",
			ButtonVariant::Link => "link",
		}
	}

	pub fn paint(self, t: &Tokens) -> Paint {
		let clear = t.background.alpha(0.0);
		match self {
			ButtonVariant::Default => Paint {
				fill: t.primary,
				ink: t.primary_foreground,
				hover_fill: mix(t.primary, t.foreground, 0.8),
				hover_ink: t.primary_foreground,
			},
			ButtonVariant::Outline => Paint {
				fill: if t.dark { clear } else { t.background },
				ink: t.foreground,
				hover_fill: if t.dark { faded(t.input, 0.3) } else { t.muted },
				hover_ink: t.foreground,
			},
			ButtonVariant::Secondary => Paint {
				fill: t.secondary,
				ink: t.secondary_foreground,
				hover_fill: mix(t.secondary, t.foreground, 0.95),
				hover_ink: t.secondary_foreground,
			},
			ButtonVariant::Ghost => Paint {
				fill: clear,
				ink: t.foreground,
				hover_fill: if t.dark { faded(t.muted, 0.5) } else { t.muted },
				hover_ink: t.foreground,
			},
			ButtonVariant::Destructive => Paint {
				fill: faded(t.destructive, if t.dark { 0.2 } else { 0.1 }),
				ink: t.destructive,
				hover_fill: faded(t.destructive, if t.dark { 0.3 } else { 0.2 }),
				hover_ink: t.destructive,
			},
			ButtonVariant::Link => Paint::plain(clear, t.primary),
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ButtonSize {
	Xs,
	Sm,
	#[default]
	Default,
	Lg,
	IconXs,
	IconSm,
	Icon,
	IconLg,
}

impl ButtonSize {
	pub const LABELLED: [ButtonSize; 4] =
		[ButtonSize::Xs, ButtonSize::Sm, ButtonSize::Default, ButtonSize::Lg];
	pub const ICON: [ButtonSize; 4] =
		[ButtonSize::IconXs, ButtonSize::IconSm, ButtonSize::Icon, ButtonSize::IconLg];

	pub fn name(self) -> &'static str {
		match self {
			ButtonSize::Xs => "xs",
			ButtonSize::Sm => "sm",
			ButtonSize::Default => "default",
			ButtonSize::Lg => "lg",
			ButtonSize::IconXs => "icon-xs",
			ButtonSize::IconSm => "icon-sm",
			ButtonSize::Icon => "icon",
			ButtonSize::IconLg => "icon-lg",
		}
	}

	pub fn height(self) -> f32 {
		match self {
			ButtonSize::Xs | ButtonSize::IconXs => SPACING * 6.0,
			ButtonSize::Sm | ButtonSize::IconSm => SPACING * 7.0,
			ButtonSize::Default | ButtonSize::Icon => SPACING * 8.0,
			ButtonSize::Lg | ButtonSize::IconLg => SPACING * 9.0,
		}
	}

	fn is_xs(self) -> bool {
		matches!(self, ButtonSize::Xs | ButtonSize::IconXs)
	}

	fn is_icon(self) -> bool {
		matches!(
			self,
			ButtonSize::IconXs | ButtonSize::IconSm | ButtonSize::Icon | ButtonSize::IconLg
		)
	}

	pub fn glyph(self) -> f32 {
		if self.is_xs() { SPACING * 3.0 } else { SPACING * 4.0 }
	}
}

pub struct Button<'a> {
	label: &'a str,
	leading: Option<&'static Icon>,
	trailing: Option<&'static Icon>,
	variant: ButtonVariant,
	size: ButtonSize,
	disabled: bool,
	expanded: bool,
	interaction: Interaction,
}

impl<'a> Button<'a> {
	pub fn new(label: &'a str) -> Button<'a> {
		Button {
			label,
			leading: None,
			trailing: None,
			variant: ButtonVariant::Default,
			size: ButtonSize::Default,
			disabled: false,
			expanded: false,
			interaction: Interaction::Rest,
		}
	}

	pub fn icon(glyph: &'static Icon, label: &'a str) -> Button<'a> {
		Button { leading: Some(glyph), size: ButtonSize::Icon, ..Button::new(label) }
	}

	pub fn variant(self, variant: ButtonVariant) -> Button<'a> {
		Button { variant, ..self }
	}

	pub fn size(self, size: ButtonSize) -> Button<'a> {
		Button { size, ..self }
	}

	pub fn leading(self, glyph: &'static Icon) -> Button<'a> {
		Button { leading: Some(glyph), ..self }
	}

	pub fn trailing(self, glyph: &'static Icon) -> Button<'a> {
		Button { trailing: Some(glyph), ..self }
	}

	pub fn disabled(self, disabled: bool) -> Button<'a> {
		Button { disabled, ..self }
	}

	pub fn expanded(self, expanded: bool) -> Button<'a> {
		Button { expanded, ..self }
	}

	pub fn interaction(self, interaction: Interaction) -> Button<'a> {
		Button { interaction, ..self }
	}

	pub fn view(self, t: &Tokens) -> El {
		let style = tight(if self.size.is_xs() { TEXT_XS_MEDIUM } else { TEXT_SM_MEDIUM });
		let glyph = self.size.glyph();
		let content = if self.size.is_icon() { glyph } else { style.size };
		let shown = if self.expanded { Interaction::Hover } else { self.interaction };
		let paint = self.variant.paint(t).resting(shown);
		let mut button = row()
			.key(format!("button-{}", self.label))
			.padding(equal_padding(self.size.height(), content))
			.gap(if self.size.is_xs() { SPACING } else { SPACING * 1.5 })
			.radius(RADIUS_2XL)
			.center()
			.role("button")
			.label(self.label);
		if self.variant == ButtonVariant::Outline {
			button = button.border(1.0, t.border);
		}
		if let Some(glyph_icon) = self.leading {
			button = button.child(paint.ink(icon(glyph_icon, glyph)));
		}
		if !self.size.is_icon() {
			button = button.child(paint.ink(text(self.label.to_owned()).font(style)));
		}
		if let Some(glyph_icon) = self.trailing {
			button = button.child(paint.ink(icon(glyph_icon, glyph)));
		}
		if self.interaction == Interaction::Press {
			button = button.offset(0.0, 1.0);
		}
		if self.expanded {
			button = button.expanded(true);
		}
		let button = paint.apply(button);
		if self.disabled {
			return button.disabled(true).opacity(DISABLED_OPACITY);
		}
		button.focusable(true).cursor(Cursor::Pointer).focus_ring(
			FOCUS_RING_WIDTH,
			0.0,
			focus_ring(t, 0.3),
		)
	}
}
