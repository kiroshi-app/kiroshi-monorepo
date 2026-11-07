use super::*;
use crate::surfaces::s15_boards::model::{Content, StickyColour};

const SPOT: Point = Point::new(100.0, 50.0);

fn plan() -> Item {
	Item {
		id: "plan".to_owned(),
		rect: Rect::new(40.0, 40.0, 160.0, 160.0),
		z_order: 1,
		content: Content::Sticky {
			colour: StickyColour::Yellow,
			text: "Draft the launch plan before Friday".to_owned(),
			author: crate::surfaces::s15_boards::model::Owner::person("ada", "Ada Martin", None),
		},
	}
}

fn selected(id: &str) -> Frame {
	Frame { selected: Some(id.to_owned()), ..Frame::default() }
}

fn frame_of(event: &Event) -> &Frame {
	match event {
		Event::Frame(frame) => frame,
		other => panic!("{other:?} is not a frame"),
	}
}

#[test]
fn pointer_reported_gives_the_board_point_under_the_pointer_at_any_viewport() {
	let viewport = Viewport::new(24.0, 24.0, 2.0);
	let at = viewport.to_screen(SPOT);
	assert_eq!(pointer_report(viewport, Some(at)), Event::Pointer(Some(SPOT)));
	assert_eq!(
		pointer_report(Viewport::new(24.0, 24.0, 0.5), Some(Point::new(74.0, 49.0))),
		Event::Pointer(Some(SPOT))
	);
}

#[test]
fn pointer_reported_clears_once_the_pointer_leaves_the_board() {
	assert_eq!(pointer_report(Viewport::new(24.0, 24.0, 1.0), None), Event::Pointer(None));
}

#[test]
fn selection_reported_goes_out_through_the_frame_and_clears_on_escape() {
	let events =
		key_event(&plan(), &selected("plan"), &Key::Escape, false, false).unwrap_or_default();
	assert_eq!(events.len(), 1);
	assert_eq!(frame_of(&events[0]).selected, None);
}

#[test]
fn selection_reported_clears_when_the_selected_object_is_deleted() {
	let events =
		key_event(&plan(), &selected("plan"), &Key::Delete, false, false).unwrap_or_default();
	assert_eq!(events[0], Event::Delete("plan".to_owned()));
	assert_eq!(frame_of(&events[1]).selected, None);
}

#[test]
fn the_keyboard_moves_by_1_and_by_10_with_shift_and_resizes_with_alt() {
	let frame = selected("plan");
	let step = key_event(&plan(), &frame, &Key::Right, false, false).unwrap_or_default();
	assert_eq!(step[1], Event::Move { id: "plan".to_owned(), position: Point::new(41.0, 40.0) });
	let large = key_event(&plan(), &frame, &Key::Down, true, false).unwrap_or_default();
	assert_eq!(large[1], Event::Move { id: "plan".to_owned(), position: Point::new(40.0, 50.0) });
	let grown = key_event(&plan(), &frame, &Key::Right, false, true).unwrap_or_default();
	assert_eq!(
		grown[1],
		Event::Resize { id: "plan".to_owned(), rect: Rect::new(40.0, 40.0, 161.0, 160.0) }
	);
}

#[test]
fn enter_opens_the_text_of_a_selected_sticky_in_place() {
	let events =
		key_event(&plan(), &selected("plan"), &Key::Enter, false, false).unwrap_or_default();
	let editing = frame_of(&events[0]).editing.clone();
	assert_eq!(editing.map(|editing| editing.id), Some("plan".to_owned()));
}

fn drawn() -> Connector {
	Connector::between("", End::sided("plan", Side::Right), End::of("review"), Routing::Elbow)
}

#[test]
fn unmount_during_draft_leaves_nothing_behind_since_the_draft_lives_in_the_callers_frame() {
	let frame = Frame { arrow: None, ..selected("plan") };
	let cancelled = arrow_release(&frame, drawn(), true, true);
	assert_eq!(cancelled.len(), 1);
	assert_eq!(frame_of(&cancelled[0]).arrow, None);
}

#[test]
fn a_draft_released_on_empty_board_sends_nothing_and_clears() {
	let released = arrow_release(&Frame::default(), drawn(), false, false);
	assert_eq!(released.len(), 1);
	assert_eq!(frame_of(&released[0]).arrow, None);
}

#[test]
fn a_draft_released_over_a_shape_sends_one_set_arrow() {
	let released = arrow_release(&Frame::default(), drawn(), true, false);
	assert_eq!(released[0], Event::SetArrow(drawn()));
}
