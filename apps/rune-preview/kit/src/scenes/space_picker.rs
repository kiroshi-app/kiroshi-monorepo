use std::sync::LazyLock;

use rune::{El, col, row};

use super::{SceneState, stage};
use crate::hues::Preset;
use crate::strings::Language;
use crate::surfaces::s02_rail::{
	BotBadge, InvitationFailure, InvitationState, PickerMessage, Space, SpaceDots, SpaceHost,
	SpaceInvitation, SpacePicker, SpacesMenu,
};
use crate::tokens::{RADIUS_XL, SPACING, Tokens};

pub(super) const MENU_STAGE: (f32, f32) = (720.0, 720.0);

const EN: Language = Language::En;
const LINE: (f32, f32) = (SPACING * 64.0, SPACING * 8.5);
const LINE_INSET: f32 = SPACING * 2.5;
const LIVE_GAP: f32 = SPACING * 4.0;
const LINES_GAP: f32 = SPACING * 2.0;
const NARROW_STRIP: f32 = SPACING * 24.0;
const DASH: (f32, f32) = (4.0, 3.0);
const MENU_TOP: f32 = SPACING * 12.0;
const SHORT_EXPIRY: &str = "Oct 25";
const LONG_EXPIRY: &str = "October 25";
const FREE_HUE: f32 = 210.0;

fn picker_sink(_: &mut SceneState, _: PickerMessage) {}

fn space(id: &'static str, name: &'static str, colour: Option<Preset>) -> Space<'static> {
	Space { id, name, colour: colour.map(Preset::hue), avatar_seed: id }
}

static SPACES: LazyLock<[Space<'static>; 5]> = LazyLock::new(|| {
	[
		space("perso", "Perso", Some(Preset::Blue)),
		space("vocca", "Vocca", Some(Preset::Green)),
		space("atelier", "Atelier", Some(Preset::Pink)),
		space("veille", "Veille", Some(Preset::Yellow)),
		space("archives", "Archives", Some(Preset::Purple)),
	]
});

static COLOURLESS: LazyLock<[Space<'static>; 3]> =
	LazyLock::new(|| [space("perso", "Perso", None), space("vocca", "Vocca", None), SPACES[2]]);

static LONG_SPACES: LazyLock<[Space<'static>; 2]> = LazyLock::new(|| {
	[space("perso", "Everything I have not filed anywhere else yet", Some(Preset::Blue)), SPACES[1]]
});

static MANY_SPACES: LazyLock<Vec<Space<'static>>> = LazyLock::new(|| {
	let mut many = SPACES.to_vec();
	many.extend([
		space("lecture", "Lecture", Some(Preset::Red)),
		space("cuisine", "Cuisine", Some(Preset::Orange)),
		space("musique", "Musique", Some(Preset::Cyan)),
		space("jardin", "Jardin", Some(Preset::Green)),
	]);
	many
});

static LONG_HOSTED: LazyLock<[Space<'static>; 3]> = LazyLock::new(|| {
	[
		SPACES[0],
		space("vocca", "Everything the team has not filed anywhere else yet", None),
		space("veille", "Reading list shared with the whole studio this quarter", None),
	]
});

static FREE_HUE_SPACES: LazyLock<[Space<'static>; 5]> = LazyLock::new(|| {
	let mut spaces = *SPACES;
	spaces[1].colour = Some(FREE_HUE);
	spaces
});

static PERSONAL: LazyLock<[Space<'static>; 1]> =
	LazyLock::new(|| [space("personal", "Personal", Some(Preset::Green))]);

static JOINED: LazyLock<[Space<'static>; 2]> =
	LazyLock::new(|| [PERSONAL[0], space("studio", "Studio", Some(Preset::Blue))]);

static NOTES: LazyLock<[Space<'static>; 1]> =
	LazyLock::new(|| [space("notes", "Notes", Some(Preset::Green))]);

const BADGES: &[(&str, BotBadge)] =
	&[("perso", BotBadge::Done), ("atelier", BotBadge::Failed), ("veille", BotBadge::Attention)];

const HOSTS: &[(&str, SpaceHost)] = &[
	("vocca", SpaceHost::Up),
	("atelier", SpaceHost::Shared),
	("veille", SpaceHost::Down),
	("archives", SpaceHost::Connecting),
];

fn invited(state: InvitationState<'static>) -> SpaceInvitation<'static> {
	SpaceInvitation {
		id: "studio",
		name: "Studio",
		colour: Some(Preset::Blue.hue()),
		host_email: "noa@example.com",
		host_name: Some("Noa"),
		expires: Some(SHORT_EXPIRY),
		state,
	}
}

fn second_invited() -> SpaceInvitation<'static> {
	SpaceInvitation {
		id: "atelier-sud",
		name: "Atelier Sud",
		colour: Some(Preset::Cyan.hue()),
		host_email: "marc@example.com",
		host_name: None,
		expires: None,
		state: InvitationState::Waiting,
	}
}

static WAITING: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Waiting)]);

static TWO_WAITING: LazyLock<[SpaceInvitation<'static>; 2]> =
	LazyLock::new(|| [invited(InvitationState::Waiting), second_invited()]);

static ACCEPTING: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Accepting)]);

static FAILED_SERVERS: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Failed(InvitationFailure::Servers))]);

static FAILED_OFFLINE: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Failed(InvitationFailure::Offline))]);

static WITHDRAWN: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Withdrawn)]);

static HOST_OFFLINE: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::HostOffline)]);

static EXPIRED: LazyLock<[SpaceInvitation<'static>; 1]> =
	LazyLock::new(|| [invited(InvitationState::Expired { on: LONG_EXPIRY })]);

static FREE_HUE_INVITED: LazyLock<[SpaceInvitation<'static>; 1]> = LazyLock::new(|| {
	[SpaceInvitation { colour: Some(FREE_HUE), ..invited(InvitationState::Waiting) }]
});

static LONG_INVITED: LazyLock<[SpaceInvitation<'static>; 1]> = LazyLock::new(|| {
	[SpaceInvitation {
		name: "Everything the research studio has not filed anywhere else yet",
		host_email: "lea.marchand-de-villeneuve.research-coordination@example.com",
		..invited(InvitationState::Failed(InvitationFailure::Offline))
	}]
});

static STUDIO_INVITED: LazyLock<[SpaceInvitation<'static>; 1]> = LazyLock::new(|| {
	[SpaceInvitation {
		colour: Some(Preset::Orange.hue()),
		host_email: "steve@example.com",
		host_name: None,
		expires: None,
		..invited(InvitationState::Waiting)
	}]
});

fn menu(spaces: &'static [Space<'static>]) -> SpacesMenu<'static> {
	SpacesMenu { spaces, ..SpacesMenu::default() }
}

fn picker(menu: SpacesMenu<'static>, selected: &'static str) -> SpacePicker<'static> {
	SpacePicker { language: EN, menu, selected: Some(selected) }
}

fn line(t: &Tokens, picker: &SpacePicker) -> El {
	row()
		.w(LINE.0)
		.h(LINE.1)
		.px(LINE_INSET)
		.gap(SPACING * 2.0)
		.radius(RADIUS_XL)
		.border(1.0, t.border)
		.border_dash(DASH.0, DASH.1)
		.center_y()
		.child(picker.view(t, picker_sink))
}

fn dots(
	t: &Tokens,
	spaces: &'static [Space<'static>],
	badges: &'static [(&'static str, BotBadge)],
	selected: &'static str,
) -> El {
	SpaceDots { language: EN, spaces, selected: Some(selected), badges }.view(t, picker_sink)
}

fn live(
	t: &Tokens,
	spaces: &'static [Space<'static>],
	badges: &'static [(&'static str, BotBadge)],
) -> El {
	let selected = spaces[0].id;
	let picker = picker(SpacesMenu { spaces, badges, ..SpacesMenu::default() }, selected);
	stage(
		t,
		col()
			.w(LINE.0)
			.gap(LIVE_GAP)
			.child(line(t, &picker))
			.child(dots(t, spaces, badges, selected)),
	)
}

fn closed(t: &Tokens, picker: SpacePicker) -> El {
	stage(t, line(t, &picker))
}

fn opened_with(t: &Tokens, picker: &SpacePicker, content: El) -> El {
	let layers: Vec<El> = picker.menu_layer(t, picker_sink).into_iter().collect();
	rune_kit::root(
		col().w_full().h_full().fill(t.background).items_center().pt(MENU_TOP).child(content),
		layers,
	)
}

fn opened(t: &Tokens, picker: SpacePicker) -> El {
	let open = SpacePicker { menu: SpacesMenu { is_open: true, ..picker.menu }, ..picker };
	opened_with(t, &open, line(t, &open))
}

pub(super) fn default(t: &Tokens, _: &SceneState) -> El {
	closed(t, picker(menu(&*SPACES), "vocca"))
}

pub(super) fn open(t: &Tokens, _: &SceneState) -> El {
	let hosts = &[("vocca", SpaceHost::Up)];
	opened(t, picker(SpacesMenu { hosts, ..menu(&*SPACES) }, "vocca"))
}

pub(super) fn keyboard(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(menu(&*SPACES), "vocca"))
}

pub(super) fn single_space(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(menu(&SPACES[..1]), "perso"))
}

pub(super) fn colourless(t: &Tokens, _: &SceneState) -> El {
	live(t, &*COLOURLESS, &[])
}

pub(super) fn with_dots(t: &Tokens, _: &SceneState) -> El {
	live(t, &*SPACES, &[])
}

pub(super) fn badges(t: &Tokens, _: &SceneState) -> El {
	live(t, &*SPACES, BADGES)
}

pub(super) fn badge_ranking(t: &Tokens, _: &SceneState) -> El {
	let badges = &[("perso", BotBadge::Done), ("atelier", BotBadge::Failed)];
	closed(t, picker(SpacesMenu { badges, ..menu(&*SPACES) }, "vocca"))
}

pub(super) fn badge_done_elsewhere(t: &Tokens, _: &SceneState) -> El {
	live(t, &*SPACES, &[("atelier", BotBadge::Done)])
}

pub(super) fn badge_here(t: &Tokens, _: &SceneState) -> El {
	let badges = &[("vocca", BotBadge::Attention)];
	opened(t, picker(SpacesMenu { badges, ..menu(&*SPACES) }, "vocca"))
}

pub(super) fn badge_and_long_name(t: &Tokens, _: &SceneState) -> El {
	let badges = &[("vocca", BotBadge::Attention)];
	closed(t, picker(SpacesMenu { badges, ..menu(&*LONG_SPACES) }, "perso"))
}

pub(super) fn long_content(t: &Tokens, _: &SceneState) -> El {
	closed(t, picker(menu(&*LONG_SPACES), "perso"))
}

pub(super) fn wrapped_dots(t: &Tokens, _: &SceneState) -> El {
	stage(
		t,
		row()
			.w(NARROW_STRIP)
			.py(SPACING * 2.0)
			.radius(RADIUS_XL)
			.border(1.0, t.border)
			.border_dash(DASH.0, DASH.1)
			.child(dots(t, &MANY_SPACES, &[], "perso").w_full()),
	)
}

pub(super) fn themes_local_space_menu(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(SpacesMenu { hosts: HOSTS, ..menu(&*SPACES) }, "perso"))
}

pub(super) fn themes_joined_space_menu(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(SpacesMenu { hosts: HOSTS, ..menu(&*SPACES) }, "veille"))
}

pub(super) fn themes_title_bar_hosts(t: &Tokens, _: &SceneState) -> El {
	let lines = ["atelier", "vocca", "archives", "veille"]
		.map(|selected| line(t, &picker(SpacesMenu { hosts: HOSTS, ..menu(&*SPACES) }, selected)));
	stage(t, col().gap(LINES_GAP).children(lines))
}

pub(super) fn hosted_long_names(t: &Tokens, _: &SceneState) -> El {
	let hosts = &[("vocca", SpaceHost::Up), ("veille", SpaceHost::Down)];
	opened(t, picker(SpacesMenu { hosts, ..menu(&*LONG_HOSTED) }, "perso"))
}

pub(super) fn free_hue(t: &Tokens, _: &SceneState) -> El {
	let open = picker(
		SpacesMenu { invitations: &*FREE_HUE_INVITED, is_open: true, ..menu(&*FREE_HUE_SPACES) },
		"vocca",
	);
	let content = col().w(LINE.0).gap(LIVE_GAP).child(line(t, &open)).child(dots(
		t,
		&*FREE_HUE_SPACES,
		&[],
		"vocca",
	));
	opened_with(t, &open, content)
}

fn personal(invitations: &'static [SpaceInvitation<'static>]) -> SpacePicker<'static> {
	picker(SpacesMenu { invitations, ..menu(&*PERSONAL) }, "personal")
}

pub(super) fn invitation_at_rest(t: &Tokens, _: &SceneState) -> El {
	closed(t, personal(&*WAITING))
}

pub(super) fn m1_no_invitation(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&[]))
}

pub(super) fn m2_invitation_waiting(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*WAITING))
}

pub(super) fn m3_two_invitations_waiting(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*TWO_WAITING))
}

pub(super) fn opened_on_invitation(t: &Tokens, _: &SceneState) -> El {
	let menu = SpacesMenu {
		invitations: &*TWO_WAITING,
		focused_invitation: Some("atelier-sud"),
		..menu(&*SPACES)
	};
	opened(t, picker(menu, "vocca"))
}

pub(super) fn m4_accepting(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*ACCEPTING))
}

pub(super) fn m5_joined(t: &Tokens, _: &SceneState) -> El {
	let hosts = &[("studio", SpaceHost::Up)];
	closed(t, picker(SpacesMenu { hosts, ..menu(&*JOINED) }, "studio"))
}

pub(super) fn m6_unreachable(t: &Tokens, _: &SceneState) -> El {
	let hosts = &[("studio", SpaceHost::Down)];
	opened(t, picker(SpacesMenu { hosts, ..menu(&*JOINED) }, "personal"))
}

pub(super) fn m9_failed_servers(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*FAILED_SERVERS))
}

pub(super) fn m10_failed_offline(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*FAILED_OFFLINE))
}

pub(super) fn m11_withdrawn(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*WITHDRAWN))
}

pub(super) fn invitation_host_offline(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*HOST_OFFLINE))
}

pub(super) fn invitation_expired(t: &Tokens, _: &SceneState) -> El {
	opened(t, personal(&*EXPIRED))
}

pub(super) fn invitation_long_content(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(SpacesMenu { invitations: &*LONG_INVITED, ..menu(&*SPACES) }, "vocca"))
}

pub(super) fn invitation_over_bot_badge(t: &Tokens, _: &SceneState) -> El {
	opened(
		t,
		picker(SpacesMenu { badges: BADGES, invitations: &*WAITING, ..menu(&*SPACES) }, "vocca"),
	)
}

pub(super) fn invitation_without_join_entry(t: &Tokens, _: &SceneState) -> El {
	opened(t, picker(SpacesMenu { invitations: &*STUDIO_INVITED, ..menu(&*NOTES) }, "notes"))
}
