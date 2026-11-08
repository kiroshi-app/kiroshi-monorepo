use rune::{El, col, row, text};

use super::{glyph, say, tabular};
use crate::avatar::Face;
use crate::icons;
use crate::strings::{Language, chat};
use crate::tokens::{RADIUS_XL, SPACING, TEXT_11, TEXT_SM_MEDIUM, TEXT_XS, Tokens};

const ACTIVITY_ROW_HEIGHT: f32 = SPACING * 13.0;
const ACTIVITY_AVATAR: f32 = SPACING * 8.0;

const NAME_LINE: f32 = SPACING * 5.0;
const PREVIEW_LINE: f32 = SPACING * 4.0;
const ROUTINE_MARK: f32 = 11.0;
const PART_SEPARATOR: &str = " \u{b7} ";

#[derive(Clone, Copy, Debug)]
pub struct ReportedRun<'a> {
	pub id: &'a str,
	pub routine_title: &'a str,
	pub trigger: &'a str,
	pub agent: &'a str,
	pub agent_hue: Option<f32>,
	pub time: &'a str,
}

pub fn reported_run_row(t: &Tokens, lang: Language, run: &ReportedRun) -> El {
	let parts =
		[run.trigger, run.agent, say(chat::activity::runs::REPORTED, lang)].join(PART_SEPARATOR);
	row()
		.key(format!("reported-run-{}", run.id))
		.w_full()
		.min_h(ACTIVITY_ROW_HEIGHT)
		.gap(SPACING * 2.5)
		.center_y()
		.py(SPACING * 1.5)
		.pl(SPACING * 1.5)
		.pr(SPACING * 3.0)
		.radius(RADIUS_XL)
		.role("listitem")
		.child(Face::still(run.agent, run.agent_hue).draw(ACTIVITY_AVATAR, t))
		.child(
			col()
				.grow(1.0)
				.min_w(0.0)
				.gap(1.0)
				.child(
					row()
						.h(NAME_LINE)
						.gap(SPACING * 1.5)
						.center_y()
						.child(
							text(run.routine_title.to_owned())
								.font(TEXT_SM_MEDIUM)
								.color(t.foreground)
								.truncate()
								.grow(1.0)
								.min_w(0.0),
						)
						.child(
							text(run.time.to_owned())
								.font(tabular(TEXT_11))
								.color(t.muted_foreground),
						),
				)
				.child(
					row()
						.h(PREVIEW_LINE)
						.gap(5.0)
						.center_y()
						.child(glyph(t, &icons::REPEAT, ROUTINE_MARK))
						.child(
							text(parts)
								.font(TEXT_XS)
								.color(t.muted_foreground)
								.truncate()
								.min_w(0.0),
						),
				),
		)
}
