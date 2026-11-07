use rune::{El, col, row};

use super::{SceneState, stage};
use crate::primitives::skeleton::skeleton;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::tokens::{RADIUS_MD, RADIUS_SM, SPACING, Tokens, faded};

const SKELETON_ROW: f32 = SPACING * 80.0;
const MARK: f32 = SPACING * 7.0;
const TITLE_BAR: (f32, f32) = (SPACING * 33.0, SPACING * 2.75);
const DETAIL_BAR: (f32, f32) = (SPACING * 51.5, SPACING * 2.25);

pub(super) fn skeleton_loading(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		row()
			.w(SKELETON_ROW)
			.gap(SPACING * 2.5)
			.center_y()
			.child(skeleton(t).size(MARK, MARK).radius(RADIUS_MD).fill(t.border))
			.child(
				col()
					.grow(1.0)
					.gap(SPACING * 1.5)
					.child(
						skeleton(t).size(TITLE_BAR.0, TITLE_BAR.1).radius(RADIUS_SM).fill(t.border),
					)
					.child(
						skeleton(t)
							.size(DETAIL_BAR.0, DETAIL_BAR.1)
							.radius(RADIUS_SM)
							.fill(faded(t.border, 0.6)),
					),
			),
	)
}

pub(super) fn toast_types(t: &Tokens, _: &SceneState) -> El {
	let titles = [
		"Routine saved",
		"Routine saved",
		"Heads up",
		"Disk almost full",
		"Routine could not run",
		"Saving",
	];
	stage(
		t,
		col().gap(SPACING * 3.0).children(ToastType::ALL.into_iter().zip(titles).map(
			|(kind, title)| {
				toast(
					t,
					Toast {
						kind,
						title,
						description: "The weekly report runs every Monday.",
						action: (kind == ToastType::Error).then_some("Retry"),
					},
				)
			},
		)),
	)
}
