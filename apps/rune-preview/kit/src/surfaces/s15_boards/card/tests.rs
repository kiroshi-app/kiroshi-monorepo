use super::*;
use crate::surfaces::s15_boards::model::Owner;

fn card<'a>(item_count: usize, agent: Option<&'a Owner>) -> (Card<'a>, usize) {
	(
		Card {
			title: "Launch week plan",
			summary: Summary::Failed,
			drawing: agent.map(|agent| Drawing { agent, object_id: None }),
			edited: "edited just now",
			pointers: &[],
			is_open_beside: false,
		},
		item_count,
	)
}

#[test]
fn updates_in_place_rewrites_the_line_as_the_board_grows() {
	let atlas = Owner::agent("atlas", "Atlas", Some(41.0));
	let (drawing, count) = card(6, Some(&atlas));
	assert_eq!(line_of(&drawing, count), "Board · Atlas is drawing · 6 items");
	let (grown, count) = card(7, Some(&atlas));
	assert_eq!(line_of(&grown, count), "Board · Atlas is drawing · 7 items");
	let (at_rest, count) = card(14, None);
	assert_eq!(line_of(&at_rest, count), "Board · 14 items · edited just now");
}

#[test]
fn updates_in_place_moves_the_pointer_with_the_board_fitted_in_the_preview() {
	let bounds = Rect::new(-40.0, 0.0, 820.0, 260.0);
	let fitted = fit_bounds(bounds, Size::new(656.0, 184.0), MINIATURE_MARGIN);
	let first = fitted.to_screen(Point::new(590.0, 210.0));
	let moved = fitted.to_screen(Point::new(120.0, 80.0));
	assert!(moved.x < first.x && moved.y < first.y);
	assert!((fitted.zoom - (184.0 - 40.0) / 260.0).abs() < 1e-9);
}
