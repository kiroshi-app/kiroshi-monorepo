use rune::{El, col, row};

use super::{
	CONVERSATION, CaptionState, ChipPlacement, ChromeEvent, ChromeTab, Incoming, Landing, Lift,
	TabDragThumbnail, TabIcon, TabMenu, TabTitle, ThumbnailAuthor, ThumbnailMessage, TitleBar,
	WindowControls, drag_thumbnail, tab_chip, tab_menu, title_bar, window_controls,
};
use crate::icons;
use crate::scenes::{Pointer, Scene, SceneState};
use crate::strings::Language;
use crate::tokens::Tokens;

const BAR: (f32, f32) = (1280.0, 40.0);
const BAR_WITH_MENU: (f32, f32) = (1280.0, 340.0);
const NARROW_WITH_MENU: (f32, f32) = (600.0, 340.0);
const CONTROLS: (f32, f32) = (1180.0, 34.0);
const CHIP: (f32, f32) = (480.0, 120.0);
const THUMBNAIL: (f32, f32) = (640.0, 420.0);
const STEP: f32 = 180.0;
const PINNED_STEP: f32 = 32.0;
const MENU_ORIGIN: (f32, f32) = (5.0, 5.0);
const RECEIVING_SECOND_SLOT: f32 = 382.0;
const RECEIVING_FIRST_SLOT: f32 = 165.0;
const CARRIED_OVER_THE_PINNED_TABS: f32 = -323.0;

const fn tab(
	id: &'static str,
	title: &'static str,
	glyph: &'static rune::Icon,
) -> ChromeTab<'static> {
	ChromeTab::new(id, title, glyph)
}

const fn document(
	id: &'static str,
	name: &'static str,
	glyph: &'static rune::Icon,
) -> ChromeTab<'static> {
	ChromeTab { title: TabTitle::Document(name), ..ChromeTab::new(id, name, glyph) }
}

static RELEASE_NOTES: ChromeTab = tab("release-notes", "Release notes for 2.4", &CONVERSATION);
static LOGIN_REDIRECT: ChromeTab = tab("login-redirect", "Fix the login redirect", &icons::FLAG);
static WEEKLY_PLANNING: ChromeTab = tab("weekly-planning", "Weekly planning", &CONVERSATION);
static ONBOARDING_COPY: ChromeTab = tab(
	"onboarding-copy",
	"Rewrite the onboarding copy for the second step of the space invitation flow",
	&CONVERSATION,
);
static INVOICE_EXPORT: ChromeTab = tab("invoice-export", "Invoice export", &icons::FLAG);
static PRICING_PAGE: ChromeTab = tab("pricing-page", "Pricing page", &CONVERSATION);
static SUPPORT_TRIAGE: ChromeTab = tab("support-triage", "Support triage", &icons::FLAG);
static DESIGN_REVIEW: ChromeTab = tab("design-review", "Design review", &CONVERSATION);
static HIRING_PLAN: ChromeTab = tab("hiring-plan", "Hiring plan", &CONVERSATION);
static BUG_BASH: ChromeTab = tab("bug-bash", "Bug bash", &icons::FLAG);
static ROADMAP: ChromeTab = tab("roadmap", "Roadmap", &CONVERSATION);
static STANDUP: ChromeTab = tab("standup", "Standup notes", &CONVERSATION);
static PINNED_INBOX: ChromeTab = tab("inbox", "Inbox", &icons::BELL).pinned();
static MIGRATION_QUESTION: ChromeTab =
	tab("migration-question", "Database migration", &icons::FLAG).needing_you();
static NEW_TAB: ChromeTab = tab("new-tab", "New tab", &CONVERSATION);
static COMPANION: ChromeTab =
	ChromeTab { icon: TabIcon::Agent("Ada"), ..tab("companion-ada", "Ada", &CONVERSATION) };
static QUARTERLY_REPORT: ChromeTab =
	document("library-quarterly-report", "Quarterly report.pdf", &icons::FILE_TEXT);
static MOODBOARD: ChromeTab = document("library-moodboard", "Moodboard.png", &icons::IMAGE);
static LONG_DOCUMENT_NAME: ChromeTab = document(
	"library-contract-amendment",
	"Contract amendment for the regional distribution agreement, signed copy.pdf",
	&icons::FILE_TEXT,
);
static WHITESPACE_NAMED: ChromeTab = document("library-quarterly-report", "   ", &icons::FILE_TEXT);

static A1: [ChromeTab; 3] = [RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING];
static A2: [ChromeTab; 5] =
	[RELEASE_NOTES, ONBOARDING_COPY, LOGIN_REDIRECT, WEEKLY_PLANNING, INVOICE_EXPORT];
static ICON_KINDS: [ChromeTab; 4] = [
	COMPANION,
	tab("launch-plan", "Launch plan", &icons::ROCKET_FILL),
	tab("mission-checkout", "Checkout flow", &icons::FLAG),
	tab("settings-general", "General", &icons::SETTINGS),
];
static TWELVE: [ChromeTab; 12] = [
	RELEASE_NOTES,
	ONBOARDING_COPY,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	PRICING_PAGE,
	SUPPORT_TRIAGE,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
	ROADMAP,
	STANDUP,
];
static A4: [ChromeTab; 4] = [PINNED_INBOX, RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING];
static A5: [ChromeTab; 3] = [RELEASE_NOTES, MIGRATION_QUESTION, WEEKLY_PLANNING];
static A6: [ChromeTab; 3] = [RELEASE_NOTES, LOGIN_REDIRECT, NEW_TAB];
static LIFT_ROW: [ChromeTab; 6] = [
	PINNED_INBOX,
	ROADMAP.pinned(),
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
];
static A7_PINNED: [ChromeTab; 6] = [
	PINNED_INBOX,
	ROADMAP.pinned(),
	STANDUP.pinned(),
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
];
static RECEIVING: [ChromeTab; 5] =
	[PINNED_INBOX, RELEASE_NOTES, LOGIN_REDIRECT, WEEKLY_PLANNING, INVOICE_EXPORT];
static INSERTED: [ChromeTab; 6] =
	[PINNED_INBOX, RELEASE_NOTES, PRICING_PAGE, LOGIN_REDIRECT, WEEKLY_PLANNING, INVOICE_EXPORT];
static RECEIVING_THE_LAST_TAB: [ChromeTab; 3] = [WEEKLY_PLANNING, INVOICE_EXPORT, SUPPORT_TRIAGE];
static DOCUMENT_TABS: [ChromeTab; 2] = [QUARTERLY_REPORT, RELEASE_NOTES];
static WHITESPACE_TABS: [ChromeTab; 2] = [WHITESPACE_NAMED, RELEASE_NOTES];
static IMAGE_TABS: [ChromeTab; 2] = [MOODBOARD, RELEASE_NOTES];
static CROWDED: [ChromeTab; 9] = [
	LONG_DOCUMENT_NAME,
	RELEASE_NOTES,
	LOGIN_REDIRECT,
	WEEKLY_PLANNING,
	INVOICE_EXPORT,
	DESIGN_REVIEW,
	HIRING_PLAN,
	BUG_BASH,
	MOODBOARD,
];

const LONG_TITLE: &str = "Quarterly pricing review with the finance team and every regional lead";

static MESSAGES: [ThumbnailMessage; 2] = [
	ThumbnailMessage {
		author: ThumbnailAuthor::User,
		text: "Can you draft the release notes for 2.4 from the merged pull requests?",
	},
	ThumbnailMessage {
		author: ThumbnailAuthor::Agent,
		text: "Here's a first pass: the sync speedup up top, then three fixes and the new notification setting. Want me to tighten the wording before you share it?",
	},
];

static LONG_MESSAGES: [ThumbnailMessage; 4] = [
	ThumbnailMessage {
		author: ThumbnailAuthor::User,
		text: "Can you draft the release notes for 2.4 from the merged pull requests? Group them by area and keep the internal refactors out.",
	},
	ThumbnailMessage {
		author: ThumbnailAuthor::Agent,
		text: "Here's a first pass. Sync: the initial sync of a large Space now finishes in a third of the time, and resuming after sleep no longer replays the whole history. Fixes: the sidebar keeps its width after a restart, pasted images keep their names, and a stalled upload now shows its retry. Settings: a new switch mutes notifications while a call is running.",
	},
	ThumbnailMessage {
		author: ThumbnailAuthor::User,
		text: "The build for the notes failed, run 9f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c4e6f8a0b2d4f6a8c0e2a4c6e8f0a2b4d6f89f2c4e7a1b3d5f6e8a0c2e4f6a8b0d2c4e6f8",
	},
	ThumbnailMessage {
		author: ThumbnailAuthor::Agent,
		text: "That run stopped on the changelog check: two pull requests had no release label, so the generator refused to place them. I labelled both as fixes and started the run again. It passed, and the notes now list all eleven changes. Want me to tighten the wording before you share it?",
	},
];

fn ignore(_: &mut SceneState, _: ChromeEvent) {}

fn bar<'a>(tabs: &'a [ChromeTab<'a>], active: &'a str) -> TitleBar<'a> {
	TitleBar {
		width: BAR.0,
		language: Language::En,
		tabs,
		active: Some(active),
		can_go_back: true,
		can_go_forward: false,
		can_reorder: true,
		traffic_lights: true,
		window_controls: None,
		lift: None,
		incoming: None,
		overflow_open: false,
	}
}

fn shown(t: &Tokens, bar: &TitleBar, menu: Option<TabMenu>) -> El {
	let overlays = menu.and_then(|menu| tab_menu(t, bar, menu, ignore));
	rune_kit::root(col().w_full().h_full().fill(t.card).child(title_bar(t, bar, ignore)), overlays)
}

fn centred(t: &Tokens, content: El) -> El {
	rune_kit::root(row().w_full().h_full().fill(t.card).center().child(content), Vec::new())
}

fn lifted(id: &str, dx: f32, landing: Landing) -> Lift {
	Lift { id: id.to_owned(), dx, landing }
}

fn a1_tabs(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&A1, RELEASE_NOTES.id), None)
}

fn a2_equal_width_tabs(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&A2, LOGIN_REDIRECT.id), None)
}

fn a2_tab_icon_kinds(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&ICON_KINDS, COMPANION.id), None)
}

fn a3_overflow(t: &Tokens, _: &SceneState) -> El {
	let bar = TitleBar { overflow_open: true, ..bar(&TWELVE, RELEASE_NOTES.id) };
	shown(t, &bar, Some(TabMenu::Overflow))
}

fn unpinned_tab_menu(t: &Tokens, _: &SceneState) -> El {
	let menu = TabMenu::Tab { id: LOGIN_REDIRECT.id, at: MENU_ORIGIN, has_closed_tab: false };
	shown(t, &bar(&A4, RELEASE_NOTES.id), Some(menu))
}

fn a4_pinned_tab(t: &Tokens, _: &SceneState) -> El {
	let menu = TabMenu::Tab { id: PINNED_INBOX.id, at: MENU_ORIGIN, has_closed_tab: false };
	shown(t, &bar(&A4, RELEASE_NOTES.id), Some(menu))
}

fn a5_needs_you(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&A5, RELEASE_NOTES.id), None)
}

fn a6_empty_tab(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&A6, NEW_TAB.id), None)
}

fn a7(t: &Tokens, lift: &Lift) -> El {
	shown(t, &TitleBar { lift: Some(lift), ..bar(&LIFT_ROW, WEEKLY_PLANNING.id) }, None)
}

fn a7_drag_within_tabs(t: &Tokens, _: &SceneState) -> El {
	a7(t, &lifted(LOGIN_REDIRECT.id, STEP, Landing::Slot(2)))
}

fn a7_drag_within_pinned_tabs(t: &Tokens, _: &SceneState) -> El {
	let lift = lifted(PINNED_INBOX.id, PINNED_STEP, Landing::Slot(1));
	shown(t, &TitleBar { lift: Some(&lift), ..bar(&A7_PINNED, RELEASE_NOTES.id) }, None)
}

fn a7_drag_at_the_divider(t: &Tokens, _: &SceneState) -> El {
	a7(t, &lifted(LOGIN_REDIRECT.id, CARRIED_OVER_THE_PINNED_TABS, Landing::Slot(0)))
}

fn a7_torn_off_tab(t: &Tokens, _: &SceneState) -> El {
	a7(t, &lifted(LOGIN_REDIRECT.id, STEP, Landing::TornOff))
}

fn t13_gap_closed(t: &Tokens, _: &SceneState) -> El {
	a7(t, &lifted(LOGIN_REDIRECT.id, 0.0, Landing::TornOff))
}

fn a7_at_rest(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&LIFT_ROW, WEEKLY_PLANNING.id), None)
}

fn receiving<'a>(
	tabs: &'a [ChromeTab<'a>],
	active: &'a str,
	incoming: ChromeTab<'a>,
	x: f32,
) -> TitleBar<'a> {
	TitleBar { incoming: Some(Incoming { tab: incoming, x }), ..bar(tabs, active) }
}

fn t22_tabs_parted(t: &Tokens, _: &SceneState) -> El {
	shown(t, &receiving(&RECEIVING, RELEASE_NOTES.id, PRICING_PAGE, RECEIVING_SECOND_SLOT), None)
}

fn t23_inserted(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&INSERTED, PRICING_PAGE.id), None)
}

fn t43_last_tab_parted(t: &Tokens, _: &SceneState) -> El {
	let bar =
		receiving(&RECEIVING_THE_LAST_TAB, WEEKLY_PLANNING.id, DESIGN_REVIEW, RECEIVING_FIRST_SLOT);
	shown(t, &bar, None)
}

fn with_window_controls(t: &Tokens, _: &SceneState) -> El {
	let bar = TitleBar {
		traffic_lights: false,
		window_controls: Some(WindowControls::default()),
		..bar(&A1, RELEASE_NOTES.id)
	};
	shown(t, &bar, None)
}

fn inactive_tab_hover(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&A4, RELEASE_NOTES.id), None)
}

fn library_document_tab(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&DOCUMENT_TABS, QUARTERLY_REPORT.id), None)
}

fn whitespace_document_name(t: &Tokens, _: &SceneState) -> El {
	shown(t, &bar(&WHITESPACE_TABS, WHITESPACE_NAMED.id), None)
}

fn library_image_tab(t: &Tokens, _: &SceneState) -> El {
	shown(t, &receiving(&IMAGE_TABS, MOODBOARD.id, QUARTERLY_REPORT, 0.0), None)
}

fn long_name_truncated(t: &Tokens, _: &SceneState) -> El {
	let bar = TitleBar {
		width: NARROW_WITH_MENU.0,
		overflow_open: true,
		..bar(&CROWDED, LONG_DOCUMENT_NAME.id)
	};
	shown(t, &bar, Some(TabMenu::Overflow))
}

fn chip(t: &Tokens, title: &str, is_not_allowed: bool) -> El {
	let glyph = TabIcon::Glyph(&CONVERSATION);
	centred(t, tab_chip(t, title, glyph, ChipPlacement::Alone, is_not_allowed))
}

fn chip_short_title(t: &Tokens, _: &SceneState) -> El {
	chip(t, "Pricing", false)
}

fn chip_long_title(t: &Tokens, _: &SceneState) -> El {
	chip(t, LONG_TITLE, false)
}

fn chip_not_allowed(t: &Tokens, _: &SceneState) -> El {
	chip(t, LONG_TITLE, true)
}

fn thumbnail(
	t: &Tokens,
	agent_name: &str,
	placeholder: &str,
	messages: &[ThumbnailMessage],
	is_not_allowed: bool,
) -> El {
	let thumbnail = TabDragThumbnail {
		title: "Release notes for 2.4",
		icon: TabIcon::Glyph(&CONVERSATION),
		agent_name,
		messages,
		composer_placeholder: placeholder,
		size: (480.0, 300.0),
		is_not_allowed,
	};
	centred(t, drag_thumbnail(t, &thumbnail))
}

fn t14_thumbnail(t: &Tokens, _: &SceneState) -> El {
	thumbnail(t, "Ada", "Message Ada", &MESSAGES, false)
}

fn t31_not_allowed(t: &Tokens, _: &SceneState) -> El {
	thumbnail(t, "Ada", "Message Ada", &MESSAGES, true)
}

fn t14_no_companion(t: &Tokens, _: &SceneState) -> El {
	thumbnail(t, "", "Message", &MESSAGES, false)
}

fn t14_long_message(t: &Tokens, _: &SceneState) -> El {
	thumbnail(t, "Ada", "Message Ada", &LONG_MESSAGES, false)
}

fn controls(t: &Tokens, controls: WindowControls) -> El {
	rune_kit::root(
		row().w_full().h_full().fill(t.background).justify_end().child(window_controls(
			t,
			Language::En,
			controls,
			ignore,
		)),
		Vec::new(),
	)
}

fn controls_rest(t: &Tokens, _: &SceneState) -> El {
	controls(t, WindowControls::default())
}

fn controls_maximized(t: &Tokens, _: &SceneState) -> El {
	controls(t, WindowControls { maximized: true, ..WindowControls::default() })
}

fn forced(maximized: bool, maximize_state: CaptionState) -> WindowControls {
	WindowControls { maximized, maximize_state }
}

fn controls_forced_hover(t: &Tokens, _: &SceneState) -> El {
	controls(t, forced(false, CaptionState::Hover))
}

fn controls_forced_pressed(t: &Tokens, _: &SceneState) -> El {
	controls(t, forced(false, CaptionState::Pressed))
}

fn controls_forced_idle(t: &Tokens, _: &SceneState) -> El {
	controls(t, forced(false, CaptionState::Idle))
}

fn controls_restore_forced_hover(t: &Tokens, _: &SceneState) -> El {
	controls(t, forced(true, CaptionState::Hover))
}

const fn scene(id: &'static str, size: (f32, f32), view: fn(&Tokens, &SceneState) -> El) -> Scene {
	Scene { id, size, tabs: 0, pointer: Pointer::Away, typed: "", view }
}

const fn pointed(
	id: &'static str,
	size: (f32, f32),
	key: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene { pointer: Pointer::EntersAtSnap(key), ..scene(id, size, view) }
}

pub static SCENES: &[Scene] = &[
	scene("navigation-apptitlebar--a-1-tabs", BAR, a1_tabs),
	scene("navigation-apptitlebar--a-2-equal-width-tabs", BAR, a2_equal_width_tabs),
	scene("navigation-apptitlebar--a-2-tab-icon-kinds", BAR, a2_tab_icon_kinds),
	scene("navigation-apptitlebar--a-3-overflow", BAR_WITH_MENU, a3_overflow),
	scene("navigation-apptitlebar--unpinned-tab-menu", BAR_WITH_MENU, unpinned_tab_menu),
	scene("navigation-apptitlebar--a-4-pinned-tab", BAR_WITH_MENU, a4_pinned_tab),
	scene("navigation-apptitlebar--a-5-needs-you", BAR, a5_needs_you),
	scene("navigation-apptitlebar--a-6-empty-tab", BAR, a6_empty_tab),
	scene("navigation-apptitlebar--a-7-drag-within-tabs", BAR, a7_drag_within_tabs),
	scene("navigation-apptitlebar--a-7-drag-within-pinned-tabs", BAR, a7_drag_within_pinned_tabs),
	scene("navigation-apptitlebar--a-7-drag-at-the-divider", BAR, a7_drag_at_the_divider),
	scene("navigation-apptitlebar--a-7-torn-off-tab", BAR, a7_torn_off_tab),
	scene("navigation-apptitlebar--t-13-gap-closed", BAR, t13_gap_closed),
	scene("navigation-apptitlebar--t-16-back-in-the-row", BAR, a7_at_rest),
	scene("navigation-apptitlebar--refused-tear-off-back-at-rest", BAR, a7_at_rest),
	scene("navigation-apptitlebar--t-22-tabs-parted", BAR, t22_tabs_parted),
	scene("navigation-apptitlebar--t-23-inserted", BAR, t23_inserted),
	scene("navigation-apptitlebar--t-43-last-tab-parted", BAR, t43_last_tab_parted),
	scene("navigation-apptitlebar--with-window-controls", BAR, with_window_controls),
	pointed(
		"navigation-apptitlebar--inactive-tab-hover",
		BAR,
		"tab-close-login-redirect",
		inactive_tab_hover,
	),
	Scene { tabs: 3, ..scene("navigation-apptitlebar--focus-visible", BAR, a1_tabs) },
	scene("navigation-titlebartabs--library-document-tab", BAR, library_document_tab),
	scene(
		"navigation-titlebartabs--whitespace-document-name-reads-untitled",
		BAR,
		whitespace_document_name,
	),
	scene("navigation-titlebartabs--library-image-tab", BAR, library_image_tab),
	scene("navigation-titlebartabs--long-name-truncated", NARROW_WITH_MENU, long_name_truncated),
	scene("navigation-titlebartabchip--short-title", CHIP, chip_short_title),
	scene("navigation-titlebartabchip--long-title", CHIP, chip_long_title),
	scene("navigation-titlebartabchip--not-allowed", CHIP, chip_not_allowed),
	scene("navigation-tabdragthumbnail--t-14-thumbnail", THUMBNAIL, t14_thumbnail),
	scene("navigation-tabdragthumbnail--t-31-not-allowed", THUMBNAIL, t31_not_allowed),
	scene("navigation-tabdragthumbnail--t-14-no-companion", THUMBNAIL, t14_no_companion),
	scene("navigation-tabdragthumbnail--t-14-long-message", THUMBNAIL, t14_long_message),
	scene("layout-windowcontrols--rest", CONTROLS, controls_rest),
	pointed("layout-windowcontrols--close-hovered", CONTROLS, "caption-close", controls_rest),
	scene("layout-windowcontrols--maximized", CONTROLS, controls_maximized),
	scene("layout-windowcontrols--maximize-forced-hover", CONTROLS, controls_forced_hover),
	scene("layout-windowcontrols--maximize-forced-pressed", CONTROLS, controls_forced_pressed),
	pointed(
		"layout-windowcontrols--maximize-forced-idle",
		CONTROLS,
		"caption-maximize",
		controls_forced_idle,
	),
	scene("layout-windowcontrols--restore-forced-hover", CONTROLS, controls_restore_forced_hover),
];
