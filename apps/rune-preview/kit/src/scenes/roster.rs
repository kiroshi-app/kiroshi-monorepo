use rune::{El, TextEdit, col};

use super::SceneState;
use crate::avatar::{Activity, Face, Motion};
use crate::hues::Preset;
use crate::icons;
use crate::primitives::Interaction;
use crate::primitives::sidebar::menu_button;
use crate::strings::Language;
use crate::surfaces::s03_roster::{
	Entry, Lift, Media, MissionState, NameField, Roster, RosterEvent, Row, RowBadge, Section,
	Strip, loading, roster, roster_row, roster_section, section_drop, section_label as label_of,
	section_name_field, unreadable, zone_separator,
};
use crate::tokens::{SPACING, Tokens};

pub(super) const ROW: (f32, f32) = (256.0, 52.0);
pub(super) const NARROW_ROW: (f32, f32) = (224.0, 52.0);
pub(super) const ROW_WITH_STRIPS: (f32, f32) = (256.0, 108.0);
pub(super) const LIST_ROW: (f32, f32) = (256.0, 136.0);
pub(super) const ROSTER: (f32, f32) = (256.0, 232.0);
pub(super) const COLLAPSED_ROSTER: (f32, f32) = (256.0, 272.0);
pub(super) const TALL_ROSTER: (f32, f32) = (256.0, 392.0);
pub(super) const MENU: (f32, f32) = (256.0, 212.0);
pub(super) const SECTION: (f32, f32) = (256.0, 64.0);
pub(super) const PART: (f32, f32) = (320.0, 120.0);
pub(super) const SKELETON: (f32, f32) = (304.0, 800.0);
pub(super) const PANEL: (f32, f32) = (296.0, 560.0);

const LANGUAGE: Language = Language::En;
const WORKING_AT_MS: f64 = 600.0;
const LIST_INSET: f32 = SPACING * 2.0;
const NARROW_LIST_ROW: f32 = SPACING * 50.0;
const ROW_PITCH: f32 = ROW.1 + SPACING;
const SECTION_HEAD: f32 = SPACING * 9.0;
const SECTION_FOOT: f32 = 4.5;
const FREE_HUE: f32 = 210.0;
const SPACE_HUE: Option<f32> = Some(crate::tokens::BLUE);

const ATLAS_PREVIEW: &str = "Pulled the three papers and summarised each one for you.";
const PENDING_QUESTION: &str = "Ship the release notes as drafted?";
const LONG_PENDING_QUESTION: &str = "Should I merge the migration branch tonight, or hold it until the staging deploy has run its full suite twice?";
const ROOM_QUESTION: &str = "Which of the two layouts goes to review?";
const BRIEF: &str = "Pulled the papers for the brief.";

fn ignore(_: &mut SceneState, _: RosterEvent) {}

fn agent(name: &str, preset: Preset) -> Face<'_> {
	Face::still(name, Some(preset.hue()))
}

fn writing(name: &str, preset: Preset) -> Face<'_> {
	Face {
		name,
		hue: Some(preset.hue()),
		motion: Motion::Running { activity: Activity::Writing, at_ms: WORKING_AT_MS },
	}
}

fn atlas() -> Row<'static> {
	Row {
		media: Some(Media::Agent(agent("Atlas", Preset::Blue))),
		title: Some("Research"),
		timestamp: Some("09:24"),
		preview: Some(ATLAS_PREVIEW),
		..Row::new("atlas", "Atlas")
	}
}

fn beacon() -> Row<'static> {
	Row {
		media: Some(Media::Agent(writing("Beacon", Preset::Yellow))),
		timestamp: Some("09:18"),
		preview: Some("writing…"),
		..Row::new("beacon", "Beacon")
	}
}

fn ember() -> Row<'static> {
	Row {
		media: Some(Media::Agent(agent("Ember", Preset::Green))),
		title: Some("Design"),
		timestamp: Some(""),
		preview: Some("The two layouts are side by side in the board."),
		..Row::new("ember", "Ember")
	}
}

fn dune() -> Row<'static> {
	Row {
		media: Some(Media::Agent(agent("Dune", Preset::Red))),
		title: Some("Review"),
		timestamp: Some(""),
		preview: Some("Two comments left on the migration."),
		..Row::new("dune", "Dune")
	}
}

fn pile_of(count: usize) -> Vec<Face<'static>> {
	[
		agent("Atlas", Preset::Blue),
		writing("Beacon", Preset::Yellow),
		agent("Cinder", Preset::Red),
		agent("Dune", Preset::Green),
		agent("Ember", Preset::Pink),
	]
	.into_iter()
	.take(count)
	.collect()
}

fn room(hue: Option<f32>) -> Row<'static> {
	Row {
		media: Some(Media::Subject { glyph: &icons::MESSAGE_SQUARE_FILL, hue }),
		timestamp: Some("08:50"),
		preview: Some("Beacon: writing…"),
		pile: pile_of(2),
		..Row::new("desk-room", "Launch room")
	}
}

fn frame(t: &Tokens, content: El) -> El {
	rune_kit::root(col().w_full().h_full().fill(t.sidebar).child(content), Vec::new())
}

fn one(t: &Tokens, item: &Row) -> El {
	frame(t, roster_row(t, item, LANGUAGE, ignore))
}

fn listed(t: &Tokens, rows: &[Row]) -> El {
	frame(
		t,
		col()
			.w_full()
			.padding(LIST_INSET)
			.gap(SPACING)
			.children(rows.iter().map(|item| roster_row(t, item, LANGUAGE, ignore))),
	)
}

fn listed_at(t: &Tokens, width: f32, item: &Row) -> El {
	frame(
		t,
		col()
			.w(width + LIST_INSET * 2.0)
			.padding(LIST_INSET)
			.child(roster_row(t, item, LANGUAGE, ignore)),
	)
}

fn shown(t: &Tokens, model: &Roster) -> El {
	frame(t, roster(t, model, None, LANGUAGE, ignore))
}

pub(super) fn bot_answered(t: &Tokens, _: &SceneState) -> El {
	one(t, &atlas())
}

pub(super) fn bot_needing_you(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { question: Some(PENDING_QUESTION), ..atlas() })
}

pub(super) fn bot_long_question(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { question: Some(LONG_PENDING_QUESTION), ..atlas() })
}

pub(super) fn bot_selected(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { is_selected: true, ..atlas() })
}

pub(super) fn bot_idle(t: &Tokens, _: &SceneState) -> El {
	one(
		t,
		&Row {
			media: Some(Media::Agent(agent("Beacon", Preset::Yellow))),
			preview: Some("Drafting the release notes."),
			..beacon()
		},
	)
}

pub(super) fn bot_working(t: &Tokens, _: &SceneState) -> El {
	one(t, &beacon())
}

pub(super) fn bot_waiting_on_one(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { preview: Some("waiting on 1 background task"), ..beacon() })
}

pub(super) fn bot_waiting_on_two(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { preview: Some("waiting on 2 background tasks"), ..beacon() })
}

pub(super) fn room_answered(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(None))
}

pub(super) fn room_needing_you(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { question: Some(PENDING_QUESTION), ..room(None) })
}

pub(super) fn room_long_question_narrow(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { question: Some(LONG_PENDING_QUESTION), pile: pile_of(5), ..room(None) })
}

pub(super) fn room_idle(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { preview: Some("Atlas: The changelog is ready for a read."), ..room(None) })
}

pub(super) fn room_five_bots(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { pile: pile_of(5), ..room(None) })
}

pub(super) fn room_hovered_five_bots(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { pile: pile_of(5), interaction: Interaction::Hover, ..room(None) })
}

pub(super) fn room_long_title(t: &Tokens, _: &SceneState) -> El {
	let mut pile = pile_of(5);
	pile.remove(1);
	one(
		t,
		&Row {
			name: "Quarterly infrastructure migration and the release train it blocks",
			preview: Some(
				"Atlas: Rebuilt the bundle twice, both green, and the staging deploy is waiting on your read of the changelog.",
			),
			pile,
			..room(None)
		},
	)
}

pub(super) fn room_shield_key(t: &Tokens, _: &SceneState) -> El {
	one(
		t,
		&Row {
			media: Some(Media::Subject {
				glyph: &icons::SHIELD_KEY_FILL,
				hue: Some(Preset::Red.hue()),
			}),
			..room(None)
		},
	)
}

pub(super) fn room_free_hue(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(FREE_HUE)))
}

pub(super) fn room_not_sent_selected(t: &Tokens, _: &SceneState) -> El {
	one(
		t,
		&Row {
			preview: Some("You: The dinner, please. Book it for 20:00."),
			is_not_sent: true,
			is_selected: true,
			pile: vec![agent("Atlas", Preset::Blue), agent("Beacon", Preset::Yellow)],
			..room(None)
		},
	)
}

pub(super) fn room_with_strips(t: &Tokens, _: &SceneState) -> El {
	one(
		t,
		&Row {
			media: Some(Media::Subject {
				glyph: &icons::ROCKET_FILL,
				hue: Some(Preset::Blue.hue()),
			}),
			is_selected: true,
			pile: pile_of(3),
			strips: vec![
				Strip {
					mark: &icons::LINEAR,
					ticket: "OPE-512",
					title: "Ship the release notes",
					state: MissionState::Waiting,
					is_live: false,
				},
				Strip {
					mark: &icons::LINEAR,
					ticket: "OPE-513",
					title: "Rebuild the bundle",
					state: MissionState::Working,
					is_live: true,
				},
			],
			..room(None)
		},
	)
}

pub(super) fn room_in_red(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Red.hue())))
}

pub(super) fn room_in_orange(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Orange.hue())))
}

pub(super) fn room_in_yellow(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Yellow.hue())))
}

pub(super) fn room_in_green(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Green.hue())))
}

pub(super) fn room_in_cyan(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Cyan.hue())))
}

pub(super) fn room_in_blue(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Blue.hue())))
}

pub(super) fn room_in_purple(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Purple.hue())))
}

pub(super) fn room_in_pink(t: &Tokens, _: &SceneState) -> El {
	one(t, &room(Some(Preset::Pink.hue())))
}

pub(super) fn room_one_bot(t: &Tokens, _: &SceneState) -> El {
	one(
		t,
		&Row {
			preview: Some("Atlas: The changelog is ready for a read."),
			pile: pile_of(1),
			..room(None)
		},
	)
}

pub(super) fn room_three_bots(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { pile: pile_of(3), ..room(None) })
}

pub(super) fn room_badge_and_pile(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { pile: pile_of(5), badge: Some(RowBadge::Done), ..room(None) })
}

pub(super) fn room_waiting_on_one(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { preview: Some("Beacon: waiting on 1 background task"), ..room(None) })
}

pub(super) fn room_waiting_on_two(t: &Tokens, _: &SceneState) -> El {
	one(t, &Row { preview: Some("Beacon: waiting on 2 background tasks"), ..room(None) })
}

fn untinted_atlas() -> Row<'static> {
	Row {
		media: Some(Media::Agent(Face::still("Atlas", None))),
		timestamp: Some("09:24"),
		..Row::new("atlas", "Atlas")
	}
}

pub(super) fn list_row_name_only(t: &Tokens, _: &SceneState) -> El {
	listed(t, &[Row::new("atlas", "Atlas")])
}

pub(super) fn list_row_trailing_badge(t: &Tokens, _: &SceneState) -> El {
	listed(t, &[Row { title: Some("Research"), ..untinted_atlas() }])
}

pub(super) fn list_row_with_preview(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row {
			preview: Some("Pulled the papers for the brief, drafting the summary now."),
			..untinted_atlas()
		}],
	)
}

pub(super) fn list_row_working(t: &Tokens, _: &SceneState) -> El {
	let face = Face {
		name: "Atlas",
		hue: None,
		motion: Motion::Running { activity: Activity::Thinking, at_ms: WORKING_AT_MS },
	};
	listed(
		t,
		&[Row { media: Some(Media::Agent(face)), preview: Some("Thinking"), ..untinted_atlas() }],
	)
}

pub(super) fn list_row_muted_name(t: &Tokens, _: &SceneState) -> El {
	let closed = |id, name| Row {
		timestamp: Some("09:12"),
		preview: Some("Closed earlier today."),
		..Row { name, id, ..untinted_atlas() }
	};
	listed(
		t,
		&[Row { is_name_muted: true, ..closed("atlas", "Atlas") }, closed("beacon", "Beacon")],
	)
}

pub(super) fn list_row_preview_from_nodes(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row { preview_lead: Some("OPE-64"), preview: Some("Pin the room"), ..untinted_atlas() }],
	)
}

pub(super) fn list_row_badge_dot(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row {
			preview: Some("Waiting on your answer."),
			badge: Some(RowBadge::Attention),
			..untinted_atlas()
		}],
	)
}

fn list_strips() -> Vec<Strip<'static>> {
	vec![
		Strip {
			mark: &icons::LINEAR,
			ticket: "OPE-64",
			title: "Pin the room",
			state: MissionState::Waiting,
			is_live: false,
		},
		Strip {
			mark: &icons::GITHUB,
			ticket: "#4172",
			title: "Resume the turn",
			state: MissionState::Working,
			is_live: false,
		},
	]
}

pub(super) fn list_row_with_strips(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row { preview: Some("Two missions open."), strips: list_strips(), ..untinted_atlas() }],
	)
}

pub(super) fn list_row_all_slots(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row {
			title: Some("Research"),
			preview: Some(BRIEF),
			badge: Some(RowBadge::Attention),
			strips: list_strips(),
			..untinted_atlas()
		}],
	)
}

pub(super) fn list_row_skin_matches_menu_button(t: &Tokens, _: &SceneState) -> El {
	frame(
		t,
		col()
			.w_full()
			.padding(LIST_INSET)
			.gap(SPACING)
			.child(roster_row(
				t,
				&Row { preview: Some(BRIEF), ..untinted_atlas() },
				LANGUAGE,
				ignore,
			))
			.child(menu_button(t, &icons::MESSAGE, "Launch review", false))
			.child(roster_row(
				t,
				&Row {
					preview: Some(BRIEF),
					is_selected: true,
					..Row { id: "beacon", name: "Beacon", ..untinted_atlas() }
				},
				LANGUAGE,
				ignore,
			)),
	)
}

pub(super) fn list_row_long_content(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[Row {
			name: "Atlas the quarterly infrastructure capacity planner",
			title: Some("Ops"),
			timestamp: Some("Tue"),
			preview: Some(
				"Pulled every capacity report since January and flagged the three regions that will run out first.",
			),
			..untinted_atlas()
		}],
	)
}

pub(super) fn list_row_full_title(t: &Tokens, _: &SceneState) -> El {
	listed(t, &[Row { title: Some("Researcher"), ..untinted_atlas() }])
}

pub(super) fn list_row_title_cut(t: &Tokens, _: &SceneState) -> El {
	listed_at(t, NARROW_LIST_ROW, &Row { title: Some("Research lead"), ..untinted_atlas() })
}

pub(super) fn list_row_pressed(t: &Tokens, _: &SceneState) -> El {
	listed(t, &[Row { preview: Some(BRIEF), interaction: Interaction::Press, ..untinted_atlas() }])
}

pub(super) fn list_row_height_without_detail(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[
			Row::new("name", "Atlas"),
			Row { preview: Some("Pulled the papers."), ..Row::new("preview", "Atlas") },
			Row { preview: Some("Pulled the papers."), ..untinted_atlas() },
		],
	)
}

pub(super) fn list_row_box_metrics(t: &Tokens, _: &SceneState) -> El {
	listed(
		t,
		&[
			Row { preview: Some(BRIEF), ..untinted_atlas() },
			Row {
				preview: Some(BRIEF),
				strips: list_strips(),
				..Row { id: "launch-review", name: "Launch review", ..untinted_atlas() }
			},
		],
	)
}

fn desk(rows: Vec<Row<'static>>) -> Section<'static> {
	Section {
		id: "desk",
		name: "Desk",
		is_open: true,
		is_landing: false,
		is_renaming: false,
		rows,
		lift: Lift::default(),
	}
}

fn review(rows: Vec<Row<'static>>) -> Section<'static> {
	Section { id: "review", name: "Review", ..desk(rows) }
}

fn selected_atlas() -> Row<'static> {
	Row { is_selected: true, ..atlas() }
}

fn complete_roster() -> Roster<'static> {
	Roster {
		space_hue: SPACE_HUE,
		pinned: vec![Entry::Section(desk(vec![beacon()])), Entry::Row(room(None))],
		sorted: vec![selected_atlas()],
		is_sorted_landing: false,
		is_reading_more: false,
	}
}

pub(super) fn roster_complete(t: &Tokens, _: &SceneState) -> El {
	shown(t, &complete_roster())
}

pub(super) fn roster_reading_more(t: &Tokens, _: &SceneState) -> El {
	shown(t, &Roster { is_reading_more: true, ..complete_roster() })
}

pub(super) fn roster_renamed(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&Roster {
			space_hue: SPACE_HUE,
			pinned: vec![
				Entry::Section(desk(vec![Row {
					name: "Beacon renamed",
					is_selected: true,
					..beacon()
				}])),
				Entry::Row(Row { name: "Launch room renamed", ..room(None) }),
			],
			sorted: vec![atlas()],
			..complete_roster()
		},
	)
}

pub(super) fn roster_needing_you(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&Roster {
			space_hue: SPACE_HUE,
			pinned: vec![Entry::Section(desk(vec![beacon()])), Entry::Row(room(None))],
			sorted: vec![
				Row {
					name: "Review room",
					timestamp: Some("09:31"),
					question: Some(ROOM_QUESTION),
					..Row { id: "review-room", ..room(None) }
				},
				Row { question: Some(PENDING_QUESTION), ..selected_atlas() },
			],
			..complete_roster()
		},
	)
}

fn lift_roster(
	desk_rows: Vec<Row<'static>>,
	review_rows: Vec<Row<'static>>,
	desk_lift: Lift,
	review_lift: Lift,
) -> Roster<'static> {
	Roster {
		space_hue: SPACE_HUE,
		pinned: vec![
			Entry::Row(room(None)),
			Entry::Section(Section { lift: desk_lift, ..desk(desk_rows) }),
			Entry::Section(Section { lift: review_lift, ..review(review_rows) }),
		],
		sorted: vec![selected_atlas()],
		is_sorted_landing: false,
		is_reading_more: false,
	}
}

fn held(item: Row<'static>, shift: f32) -> Row<'static> {
	Row { lift: Lift { is_lifted: true, shift }, ..item }
}

fn slid(item: Row<'static>, shift: f32) -> Row<'static> {
	Row { lift: Lift { is_lifted: false, shift }, ..item }
}

pub(super) fn roster_lifted_row(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&lift_roster(
			vec![held(beacon(), ROW_PITCH), slid(ember(), -ROW_PITCH)],
			vec![dune()],
			Lift::default(),
			Lift::default(),
		),
	)
}

pub(super) fn roster_keyboard_moved(t: &Tokens, _: &SceneState) -> El {
	let mut model =
		lift_roster(vec![beacon(), ember()], vec![dune()], Lift::default(), Lift::default());
	model.pinned.swap(1, 2);
	shown(t, &model)
}

pub(super) fn roster_lifted_section(t: &Tokens, _: &SceneState) -> El {
	let desk_height = SECTION_HEAD + ROW_PITCH * 2.0 + SECTION_FOOT;
	let review_height = SECTION_HEAD + ROW_PITCH + SECTION_FOOT;
	shown(
		t,
		&lift_roster(
			vec![beacon(), ember()],
			vec![dune()],
			Lift { is_lifted: false, shift: review_height },
			Lift { is_lifted: true, shift: -desk_height },
		),
	)
}

pub(super) fn roster_drag_over_sorted(t: &Tokens, _: &SceneState) -> El {
	let to_pinned_floor = ROW_PITCH * 2.0 + SECTION_HEAD + SECTION_FOOT;
	shown(
		t,
		&Roster {
			is_sorted_landing: true,
			..lift_roster(
				vec![held(beacon(), to_pinned_floor), ember()],
				vec![dune()],
				Lift::default(),
				Lift::default(),
			)
		},
	)
}

pub(super) fn roster_lifted_out_of_section(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&lift_roster(
			vec![beacon()],
			vec![held(ember(), 0.0), dune()],
			Lift::default(),
			Lift::default(),
		),
	)
}

pub(super) fn roster_collapsed_section(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&Roster {
			space_hue: SPACE_HUE,
			pinned: vec![
				Entry::Section(Section { is_open: false, ..desk(vec![beacon(), ember()]) }),
				Entry::Row(held(room(None), SECTION_HEAD - SPACING * 1.5)),
				Entry::Section(review(vec![dune()])),
			],
			sorted: vec![selected_atlas()],
			is_sorted_landing: false,
			is_reading_more: false,
		},
	)
}

pub(super) fn menu_pinned_section_then_room(t: &Tokens, _: &SceneState) -> El {
	shown(
		t,
		&Roster {
			space_hue: SPACE_HUE,
			pinned: vec![Entry::Section(desk(vec![beacon()])), Entry::Row(room(None))],
			sorted: Vec::new(),
			is_sorted_landing: false,
			is_reading_more: false,
		},
	)
}

pub(super) fn menu_loose_run(t: &Tokens, _: &SceneState) -> El {
	frame(
		t,
		col()
			.w_full()
			.gap(SPACING)
			.child(roster_row(t, &atlas(), LANGUAGE, ignore))
			.child(roster_section(t, &desk(vec![beacon()]), None, LANGUAGE, ignore))
			.child(roster_row(t, &room(None), LANGUAGE, ignore)),
	)
}

pub(super) fn section_label(t: &Tokens, _: &SceneState) -> El {
	frame(t, col().w_full().child(label_of(t, "Desk")))
}

fn scene_edit(state: &mut SceneState) -> &mut TextEdit {
	&mut state.edit
}

pub(super) fn section_name_field_on_enter(t: &Tokens, s: &SceneState) -> El {
	let field = NameField { label: "Desk", edit: &s.edit, access: scene_edit };
	frame(t, col().w_full().child(section_name_field(t, "desk", &field, ignore)))
}

pub(super) fn section_open(t: &Tokens, _: &SceneState) -> El {
	frame(t, roster_section(t, &desk(vec![Row::new("atlas", "Atlas")]), None, LANGUAGE, ignore))
}

pub(super) fn parts_zone_separator(t: &Tokens, _: &SceneState) -> El {
	super::stage(t, col().w(ROW.0).child(zone_separator(t)))
}

pub(super) fn parts_working_avatar(t: &Tokens, _: &SceneState) -> El {
	super::stage(t, writing("Beacon", Preset::Yellow).draw(crate::surfaces::s03_roster::AVATAR, t))
}

pub(super) fn parts_empty_section_drop(t: &Tokens, _: &SceneState) -> El {
	super::stage(t, col().w(ROW.0).child(section_drop(t, "Desk", LANGUAGE)))
}

pub(super) fn skeleton(t: &Tokens, s: &SceneState) -> El {
	frame(t, col().w_full().h_full().padding(LIST_INSET).child(loading(t, s.scene.size.1)))
}

const PANEL_AGENTS: [(&str, Preset, Option<&str>, &str, &str); 12] = [
	("Atlas", Preset::Blue, Some("Research"), "09:24", ATLAS_PREVIEW),
	(
		"Beacon",
		Preset::Yellow,
		None,
		"09:18",
		"Renamed the transport module and fixed its imports.",
	),
	("Cinder", Preset::Red, Some("Build"), "09:12", "working…"),
	("Dune", Preset::Green, None, "Mon", "Nothing since the migration landed."),
	("Ember", Preset::Purple, Some("Review"), "Mon", "Left four comments on the transport rename."),
	("Flint", Preset::Pink, None, "Sun", "Ran the suite twice, both green."),
	(
		"Grove",
		Preset::Cyan,
		Some("Docs"),
		"Sun",
		"Rewrote the setup page around the new installer.",
	),
	("Harbor", Preset::Orange, None, "Sat", "Waiting on the credentials you promised."),
	(
		"Iris",
		Preset::Yellow,
		Some("Design"),
		"Sat",
		"Swapped the rail avatars for the new hexagons.",
	),
	("Juno", Preset::Blue, None, "Fri", "Summarised yesterday's session in the notes."),
	("Kite", Preset::Red, Some("Ops"), "Fri", "Rotated the signing key and restarted the relay."),
	("Lumen", Preset::Yellow, None, "Thu", "Nothing yet."),
];

fn panel_roster(is_reading_more: bool) -> Roster<'static> {
	Roster {
		space_hue: SPACE_HUE,
		pinned: Vec::new(),
		sorted: PANEL_AGENTS
			.iter()
			.map(|&(name, preset, title, timestamp, preview)| Row {
				media: Some(Media::Agent(agent(name, preset))),
				title,
				timestamp: Some(timestamp),
				preview: Some(preview),
				is_selected: name == "Beacon",
				..Row::new(name, name)
			})
			.collect(),
		is_sorted_landing: false,
		is_reading_more,
	}
}

fn panel(t: &Tokens, content: El) -> El {
	frame(t, col().w_full().h_full().padding(LIST_INSET).child(content))
}

pub(super) fn panel_roster_loaded(t: &Tokens, _: &SceneState) -> El {
	panel(t, roster(t, &panel_roster(false), None, LANGUAGE, ignore))
}

pub(super) fn panel_roster_reading_next_page(t: &Tokens, _: &SceneState) -> El {
	panel(t, roster(t, &panel_roster(true), None, LANGUAGE, ignore))
}

pub(super) fn panel_loading(t: &Tokens, s: &SceneState) -> El {
	panel(t, loading(t, s.scene.size.1))
}

pub(super) fn panel_unreadable(t: &Tokens, _: &SceneState) -> El {
	panel(t, unreadable::<SceneState>(t, None, LANGUAGE))
}

pub(super) fn panel_unreadable_with_retry(t: &Tokens, _: &SceneState) -> El {
	panel(t, unreadable(t, Some(ignore), LANGUAGE))
}
