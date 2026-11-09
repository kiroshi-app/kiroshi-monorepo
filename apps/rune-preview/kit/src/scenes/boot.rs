use rune::{El, TextEdit, col, el, icon, row, text};

use super::{
	Pointer, STORY, STORY_VIEWPORT, Scene, SceneState, THEMES, focused, scene, stage, staged,
};
use crate::avatar::Face;
use crate::hues::Preset;
use crate::icons;
use crate::primitives::button::{Button, ButtonVariant};
use crate::primitives::dialog::{DialogContent, dialog, scrim};
use crate::primitives::separator::{Orientation, separator};
use crate::strings::{Language, bots, chat, common, settings};
use crate::surfaces::s04_boot::account::{AccountState, Plan, account_screen};
use crate::surfaces::s04_boot::boot::{BootFailure, boot_notice, boot_screen};
use crate::surfaces::s04_boot::connect::{
	ClaudeAccount, Connect, ConnectMethod, ConnectStep, Entry, connect_screen,
};
use crate::surfaces::s04_boot::device_approval::{ApprovalStatus, device_approval_dialog};
use crate::surfaces::s04_boot::device_card::{Device, DeviceCard, DeviceKind, device_card};
use crate::surfaces::s04_boot::import::{
	Import, ImportItem, ImportKind, ImportStatus, ImportStep, import_row, import_screen,
};
use crate::surfaces::s04_boot::layouts::{
	EmptyState, Screen, ScreenWidth, empty_state_shell, screen_layout,
};
use crate::surfaces::s04_boot::new_device::{NewDevice, NewDeviceStep, new_device_screen};
use crate::surfaces::s04_boot::notice::{
	InlineNotice, NoticeKind, NoticeRetry, RaisedNotice, Report, Tone, inline_notice,
	notice_surface,
};
use crate::surfaces::s04_boot::welcome::{Welcome, WelcomeStep, welcome_screen};
use crate::surfaces::s04_boot::{counted, full_window, say};
use crate::tokens::{RADIUS_2XL, RADIUS_XL, SPACING, TEXT_SM, TEXT_SM_MEDIUM, Tokens, faded};

pub(super) const WINDOW: (f32, f32) = (960.0, 640.0);
pub(super) const IMPORT_WINDOW: (f32, f32) = (1200.0, 760.0);
pub(super) const SHORT_WINDOW: (f32, f32) = (1280.0, 700.0);
pub(super) const TALL_WINDOW: (f32, f32) = (1280.0, 1100.0);
pub(super) const NARROW: (f32, f32) = (320.0, 640.0);
pub(super) const CARD_WINDOW: (f32, f32) = (1180.0, 560.0);

const EN: Language = Language::En;
const BLUE: Option<f32> = Some(257.0);
const CLOCK_MS: f64 = 0.0;
const NOTICE_WIDTH: f32 = SPACING * 120.0;
const ROW_STORY_WIDTH: f32 = SPACING * 140.0;
const WIDE_CARD: f32 = SPACING * 275.0;
const HEADER_HEIGHT: f32 = SPACING * 12.0 - 1.0;
const PLACEHOLDER_SIDE: f32 = SPACING * 24.0;
const PLACEHOLDER_BLOCK: (f32, f32) = (SPACING * 96.0, SPACING * 32.0);
const TALL_ROWS: usize = 12;
const EMPTY_MARK: f32 = SPACING * 16.0;
const ALERT_MARK: f32 = SPACING * 12.0;
const ALERT_GLYPH: f32 = SPACING * 6.0;

pub(super) const fn typed_in(
	id: &'static str,
	size: (f32, f32),
	text: &'static str,
	view: fn(&Tokens, &SceneState) -> El,
) -> Scene {
	Scene {
		id,
		size,
		tabs: 0,
		pointer: Pointer::Away,
		typed: text,
		keys: "",
		themes: &THEMES,
		view,
	}
}

fn ignore<E>(_: &mut SceneState, _: E) {}

fn edit(s: &mut SceneState) -> &mut TextEdit {
	&mut s.edit
}

fn root(view: El) -> El {
	rune_kit::root(view, Vec::new())
}

pub(super) fn boot_screen_scene(t: &Tokens, _: &SceneState) -> El {
	root(boot_screen(t, EN, CLOCK_MS))
}

pub(super) fn boot_notice_scene(t: &Tokens, _: &SceneState) -> El {
	let failure = BootFailure {
		title: "Couldn’t load your spaces",
		description: "Your agents are still there.",
	};
	root(boot_notice(t, EN, &failure, ignore))
}

pub(super) fn full_window_default(t: &Tokens, _: &SceneState) -> El {
	root(full_window(
		t,
		col()
			.w_full()
			.padding(SPACING * 6.0)
			.gap(SPACING * 6.0)
			.items_center()
			.child(placeholder(t, PLACEHOLDER_SIDE))
			.child(placeholder(t, PLACEHOLDER_BLOCK.1).w_full().max_w(PLACEHOLDER_BLOCK.0)),
	))
}

pub(super) fn full_window_taller(t: &Tokens, _: &SceneState) -> El {
	root(full_window(
		t,
		col().w_full().padding(SPACING * 6.0).gap(SPACING * 6.0).items_center().children(
			(0..TALL_ROWS)
				.map(|_| placeholder(t, PLACEHOLDER_BLOCK.1).w_full().max_w(PLACEHOLDER_BLOCK.0)),
		),
	))
}

fn placeholder(t: &Tokens, height: f32) -> El {
	el().size(height, height).radius(RADIUS_XL).fill(t.muted)
}

fn welcome(step: WelcomeStep) -> Welcome<'static> {
	Welcome::new(step, EN, BLUE)
}

pub(super) fn welcome_agents(t: &Tokens, _: &SceneState) -> El {
	root(welcome_screen(t, &welcome(WelcomeStep::Agents), ignore))
}

pub(super) fn welcome_agents_wrapped_role(t: &Tokens, _: &SceneState) -> El {
	let mut wrapped = welcome(WelcomeStep::Agents);
	wrapped.agents[0].job = "Reviews pull requests and test plans";
	root(welcome_screen(t, &wrapped, ignore))
}

pub(super) fn welcome_conversations(t: &Tokens, _: &SceneState) -> El {
	root(welcome_screen(t, &welcome(WelcomeStep::Conversations), ignore))
}

pub(super) fn welcome_spaces(t: &Tokens, _: &SceneState) -> El {
	root(welcome_screen(t, &welcome(WelcomeStep::Spaces), ignore))
}

pub(super) fn welcome_your_tools(t: &Tokens, _: &SceneState) -> El {
	root(welcome_screen(t, &welcome(WelcomeStep::Tools), ignore))
}

fn connect(t: &Tokens, s: &SceneState, step: ConnectStep) -> El {
	let screen = Connect {
		step,
		language: EN,
		hue: BLUE,
		account: Some(ClaudeAccount {
			email: "alex.martin@example.com",
			initials: "AM",
			plan: "Claude Max",
		}),
		method: ConnectMethod::SignIn,
		code: Entry { edit: &s.edit, access: edit },
		api_key: Entry { edit: &s.edit, access: edit },
	};
	root(connect_screen(t, &screen, ignore))
}

macro_rules! connect_scenes {
	($($name:ident => $step:ident),* $(,)?) => {
		$(pub(super) fn $name(t: &Tokens, s: &SceneState) -> El {
			connect(t, s, ConnectStep::$step)
		})*
	};
}

connect_scenes! {
	connect_login_found => LoginFound,
	connect_another_account => AnotherAccount,
	connect_nothing_found => NothingFound,
	connect_waiting_for_the_code => WaitingForCode,
	connect_connecting => Connecting,
	connect_failed_cancelled => Cancelled,
	connect_failed_timed_out => TimedOut,
	connect_failed_link_refused => LinkRefused,
	connect_failed_agent_missing => AgentMissing,
	connect_key_field => KeyField,
	connect_key_refused => KeyRefused,
}

pub(super) const PASTED_CODE: &str = "kX2v9QmTa4Lr#8bHn3Wp";
pub(super) const REFUSED_KEY: &str = "sk-ant-api03-••••••••••••Qx4";

fn account(t: &Tokens, state: &AccountState) -> El {
	root(account_screen(t, EN, BLUE, state, ignore))
}

pub(super) fn account_empty(t: &Tokens, _: &SceneState) -> El {
	account(t, &AccountState::SignedOut)
}

pub(super) fn account_waiting(t: &Tokens, _: &SceneState) -> El {
	account(t, &AccountState::Waiting)
}

pub(super) fn account_signed_in(t: &Tokens, _: &SceneState) -> El {
	account(
		t,
		&AccountState::SignedIn {
			name: "Ada Martin",
			email: "ada.martin@example.com",
			plan: Some(Plan::Pro),
		},
	)
}

const fn item<'a>(kind: ImportKind, title: &'a str, detail: &'a str) -> ImportItem<'a> {
	ImportItem { kind, title, detail, hue: None, checked: true, in_kiroshi: false, status: None }
}

const ATLAS: ImportItem =
	item(ImportKind::Agent, "Atlas", "Reviews pull requests and flags risky changes.");
const WREN: ImportItem = ImportItem {
	hue: Some(150.0),
	..item(ImportKind::Agent, "Wren", "Writes release notes from merged work.")
};
const CLAUDE_MD: ImportItem = item(
	ImportKind::Instructions,
	"CLAUDE.md",
	"Your standing instructions, 42 lines. Kept as yours, for every agent.",
);
const SKILLS: [ImportItem; 4] = [
	item(ImportKind::Skill, "commit-style", "commit-style"),
	item(ImportKind::Skill, "test-first", "test-first"),
	item(ImportKind::Skill, "review-checklist", "review-checklist"),
	item(ImportKind::Skill, "changelog", "changelog"),
];
const NEW_SKILLS: [ImportItem; 2] = [
	item(ImportKind::Skill, "pr-template", "pr-template"),
	item(ImportKind::Skill, "release-checklist", "release-checklist"),
];
const MORE_COMPANIONS: [(&str, &str, f32); 8] = [
	("Bramble", "Triages new issues every morning.", 30.0),
	("Cedar", "Keeps the API reference in sync.", 280.0),
	("Dune", "Watches the deploys and pings on failures.", 200.0),
	("Fern", "Drafts the weekly team update.", 340.0),
	("Harbor", "Answers support tickets from the queue.", 60.0),
	("Ivy", "Reviews copy before anything ships.", 100.0),
	("Kestrel", "Tracks flaky tests and opens fixes.", 240.0),
	("Lumen", "Plans sprints from the roadmap.", 180.0),
];

fn files() -> Vec<ImportItem<'static>> {
	[CLAUDE_MD].into_iter().chain(SKILLS).collect()
}

fn with_status(items: Vec<ImportItem<'_>>, status: ImportStatus) -> Vec<ImportItem<'_>> {
	items.into_iter().map(|item| ImportItem { status: Some(status), ..item }).collect()
}

fn select(t: &Tokens, subtitle: &str, items: &[ImportItem], primary: &str, secondary: &str) -> El {
	let screen = Import {
		step: ImportStep::Select,
		language: EN,
		hue: BLUE,
		title: common::claude_import::select::TITLE.text(EN),
		subtitle: Some(subtitle),
		items,
		primary,
		secondary: Some(secondary),
	};
	root(import_screen(t, &screen, ignore))
}

fn import_items(count: usize) -> String {
	use common::claude_import::select::{IMPORT_ITEMS_ONE, IMPORT_ITEMS_OTHER};
	counted(IMPORT_ITEMS_ONE, IMPORT_ITEMS_OTHER, count, EN)
}

fn import_agents(count: usize) -> String {
	use common::claude_import::select::{IMPORT_COMPANIONS_ONE, IMPORT_COMPANIONS_OTHER};
	counted(IMPORT_COMPANIONS_ONE, IMPORT_COMPANIONS_OTHER, count, EN)
}

fn skip() -> &'static str {
	common::claude_import::select::SKIP.text(EN)
}

fn body() -> &'static str {
	common::claude_import::select::BODY.text(EN)
}

pub(super) fn import_list(t: &Tokens, _: &SceneState) -> El {
	let items: Vec<ImportItem> = [ATLAS, WREN].into_iter().chain(files()).collect();
	select(t, body(), &items, &import_items(7), skip())
}

pub(super) fn import_list_existing_profile(t: &Tokens, _: &SceneState) -> El {
	let items: Vec<ImportItem> =
		[ImportItem { in_kiroshi: true, ..ATLAS }, WREN].into_iter().chain(files()).collect();
	let not_now = common::claude_import::select::NOT_NOW.text(EN);
	select(t, body(), &items, &import_items(6), not_now)
}

pub(super) fn import_only_agents(t: &Tokens, _: &SceneState) -> El {
	select(t, body(), &[ATLAS, WREN], &import_agents(2), skip())
}

pub(super) fn import_only_instructions_and_skills(t: &Tokens, _: &SceneState) -> El {
	select(t, body(), &files(), &import_items(5), skip())
}

pub(super) fn import_long_list_scrolled(t: &Tokens, _: &SceneState) -> El {
	let more = MORE_COMPANIONS.map(|(title, detail, hue)| ImportItem {
		hue: Some(hue),
		..item(ImportKind::Agent, title, detail)
	});
	let items: Vec<ImportItem> = [ATLAS, WREN].into_iter().chain(more).chain(files()).collect();
	let subtitle = say(common::claude_import::select::BODY_MANY, EN, &[("count", "10")]);
	select(t, &subtitle, &items, &import_items(15), skip())
}

pub(super) fn import_nothing_selected(t: &Tokens, _: &SceneState) -> El {
	let items: Vec<ImportItem> = [ATLAS, WREN]
		.into_iter()
		.chain(files())
		.map(|item| ImportItem { checked: false, ..item })
		.collect();
	let subtitle = common::claude_import::select::NOTHING_SELECTED.text(EN);
	select(t, subtitle, &items, common::claude_import::select::IMPORT.text(EN), skip())
}

pub(super) fn import_name_already_taken(t: &Tokens, _: &SceneState) -> El {
	use common::claude_import::row::{COMPANION_NAME_TAKEN, NAME_TAKEN};
	let shoto = say(NAME_TAKEN, EN, &[("name", "Shoto"), ("renamed", "Shoto 2")]);
	let atlas = say(COMPANION_NAME_TAKEN, EN, &[("name", "Atlas"), ("renamed", "Atlas 2")]);
	let items = [
		ImportItem { hue: Some(320.0), ..item(ImportKind::Agent, "Shoto 2", &shoto) },
		ImportItem { title: "Atlas 2", detail: &atlas, ..ATLAS },
		WREN,
	];
	let subtitle = common::claude_import::select::names_taken::TWO.text(EN);
	select(t, subtitle, &items, &import_agents(3), skip())
}

pub(super) fn import_again_from_settings(t: &Tokens, _: &SceneState) -> El {
	let items: Vec<ImportItem> = [ATLAS, WREN]
		.into_iter()
		.chain(files())
		.map(|item| ImportItem { checked: false, in_kiroshi: true, ..item })
		.chain(NEW_SKILLS)
		.collect();
	let screen = Import {
		step: ImportStep::Select,
		language: EN,
		hue: BLUE,
		title: common::claude_import::from_settings::TITLE.text(EN),
		subtitle: Some(common::claude_import::from_settings::BODY.text(EN)),
		items: &items,
		primary: &import_items(2),
		secondary: Some(common::claude_import::from_settings::CANCEL.text(EN)),
	};
	root(import_screen(t, &screen, ignore))
}

fn progress(
	t: &Tokens,
	step: ImportStep,
	title: &str,
	items: &[ImportItem],
	primary: &str,
	secondary: Option<&str>,
) -> El {
	let screen =
		Import { step, language: EN, hue: BLUE, title, subtitle: None, items, primary, secondary };
	root(import_screen(t, &screen, ignore))
}

pub(super) fn import_importing(t: &Tokens, _: &SceneState) -> El {
	let mut items = with_status(vec![ATLAS, WREN], ImportStatus::Done);
	items.extend(files().into_iter().enumerate().map(|(index, item)| ImportItem {
		status: Some(if index == 0 { ImportStatus::Done } else { ImportStatus::Pending }),
		..item
	}));
	let importing = &common::claude_import::importing::TITLE;
	progress(
		t,
		ImportStep::Importing,
		importing.text(EN),
		&items,
		common::claude_import::importing::ACTION.text(EN),
		None,
	)
}

pub(super) fn import_done(t: &Tokens, _: &SceneState) -> El {
	let items = with_status([ATLAS, WREN].into_iter().chain(files()).collect(), ImportStatus::Done);
	let done = common::claude_import::done::TITLE.text(EN);
	progress(
		t,
		ImportStep::Done,
		done,
		&items,
		common::claude_import::done::CONTINUE.text(EN),
		None,
	)
}

pub(super) fn import_partly_failed(t: &Tokens, _: &SceneState) -> El {
	let unparsable = say(common::claude_import::row::UNPARSABLE, EN, &[("file", "SKILL.md")]);
	let mut items = with_status(vec![ATLAS, WREN, CLAUDE_MD], ImportStatus::Done);
	items.extend(with_status(SKILLS[..3].to_vec(), ImportStatus::Done));
	items.push(ImportItem {
		detail: &unparsable,
		status: Some(ImportStatus::Failed),
		..SKILLS[3].clone()
	});
	let retry = say(common::claude_import::partly_failed::RETRY, EN, &[("name", "changelog")]);
	progress(
		t,
		ImportStep::Done,
		common::claude_import::partly_failed::TITLE.text(EN),
		&items,
		common::claude_import::done::CONTINUE.text(EN),
		Some(&retry),
	)
}

pub(super) fn import_unreadable(t: &Tokens, _: &SceneState) -> El {
	let screen = Import {
		step: ImportStep::Unreadable,
		language: EN,
		hue: BLUE,
		title: common::claude_import::unreadable::TITLE.text(EN),
		subtitle: Some(common::claude_import::unreadable::BODY.text(EN)),
		items: &[],
		primary: common::claude_import::unreadable::RETRY.text(EN),
		secondary: Some(skip()),
	};
	root(import_screen(t, &screen, ignore))
}

fn row_frame(t: &Tokens, rows: Vec<El>) -> El {
	let mut framed = col()
		.w(ROW_STORY_WIDTH)
		.radius(RADIUS_XL)
		.clip_rounded(RADIUS_XL)
		.border(1.0, t.border)
		.fill(t.card);
	for (index, drawn) in rows.into_iter().enumerate() {
		if index > 0 {
			framed = framed.child(separator(t, Orientation::Horizontal));
		}
		framed = framed.child(drawn);
	}
	stage(t, framed)
}

fn drawn_row(t: &Tokens, r: &ImportItem) -> El {
	import_row(t, EN, r, |_: &mut SceneState| {})
}

pub(super) fn import_row_default(t: &Tokens, _: &SceneState) -> El {
	row_frame(t, vec![drawn_row(t, &ATLAS)])
}

pub(super) fn import_row_states(t: &Tokens, _: &SceneState) -> El {
	let skills = counted(
		common::claude_import::row::SKILLS_ONE,
		common::claude_import::row::SKILLS_OTHER,
		4,
		EN,
	);
	let unparsable = say(common::claude_import::row::UNPARSABLE, EN, &[("file", "SKILL.md")]);
	let rows = [
		ATLAS,
		ImportItem {
			checked: false,
			detail: "Writes release notes from merged work.",
			hue: Some(150.0),
			title: "Wren",
			..ATLAS
		},
		ImportItem {
			checked: false,
			detail: "Your standing instructions, 42 lines. Kept as yours, for every agent.",
			in_kiroshi: true,
			kind: ImportKind::Instructions,
			title: "CLAUDE.md",
			..ATLAS
		},
		ImportItem {
			detail: "commit-style, test-first, review-checklist, changelog",
			kind: ImportKind::Skill,
			title: &skills,
			..ATLAS
		},
		ImportItem {
			detail: "Triages new issues every morning.",
			hue: Some(30.0),
			status: Some(ImportStatus::Done),
			title: "Bramble",
			..ATLAS
		},
		ImportItem {
			detail: "Keeps the API reference in sync.",
			hue: Some(280.0),
			status: Some(ImportStatus::Pending),
			title: "Cedar",
			..ATLAS
		},
		ImportItem {
			detail: &unparsable,
			kind: ImportKind::Skill,
			status: Some(ImportStatus::Failed),
			title: "changelog",
			..ATLAS
		},
	];
	row_frame(t, rows.iter().map(|r| drawn_row(t, r)).collect())
}

pub(super) fn import_row_long_content(t: &Tokens, _: &SceneState) -> El {
	let long = ImportItem {
		kind: ImportKind::Skill,
		title: "release-notes-from-every-merged-pull-request-since-the-last-tag",
		detail: "Reads every merged pull request since the last tag, groups them by scope, writes the release notes in the voice of the changelog, then opens a draft for review before anything ships. It never tags on its own.",
		..ATLAS
	};
	row_frame(t, vec![drawn_row(t, &long)])
}

fn notice_story(t: &Tokens, notice: &InlineNotice) -> El {
	stage(t, el().w(NOTICE_WIDTH).child(inline_notice(t, EN, notice, ignore)))
}

const fn failure<'a>(title: &'a str, description: Option<&'a str>) -> InlineNotice<'a> {
	InlineNotice { tone: Tone::Error, title, description, retry: None, dismissible: false }
}

const RETRY: Option<NoticeRetry> = Some(NoticeRetry { label: None, busy: false });

pub(super) fn notice_default(t: &Tokens, _: &SceneState) -> El {
	notice_story(t, &failure("The change history isn't available", None))
}

pub(super) fn notice_with_description(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&failure(
			"Some secrets couldn't be read",
			Some(
				"The environment file exists but could not be parsed. Fix it on disk, then reopen this panel.",
			),
		),
	)
}

pub(super) fn notice_with_retry(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&InlineNotice {
			retry: RETRY,
			..failure(
				"This mission couldn't be read",
				Some(
					"The mission could not be loaded. Nothing was changed, so the same read can be run again.",
				),
			)
		},
	)
}

pub(super) fn notice_with_retry_label(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&InlineNotice {
			retry: Some(NoticeRetry { label: Some("Open again"), busy: false }),
			..failure("This skill file couldn't be opened", None)
		},
	)
}

pub(super) fn notice_retry_busy(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&InlineNotice {
			retry: Some(NoticeRetry { label: None, busy: true }),
			..failure(
				"The run history couldn't be read",
				Some("The runs of this routine could not be loaded. The read is running again."),
			)
		},
	)
}

pub(super) fn notice_dismissible(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&InlineNotice {
			tone: Tone::Warning,
			dismissible: true,
			..failure(
				"Some attachments were refused",
				Some("They exceed the size a turn can carry. The rest of the prompt was sent."),
			)
		},
	)
}

pub(super) fn notice_long_content(t: &Tokens, _: &SceneState) -> El {
	notice_story(
		t,
		&InlineNotice {
			retry: RETRY,
			..failure(
				"The run history of packages/ui/src/components/notice.tsx couldn't be read",
				Some(
					"The file exists but could not be parsed, and the panel has nothing to list until it can be. Nothing was written to disk, the workspace is still mounted, and the same read can be run again once the operator has fixed the file.",
				),
			)
		},
	)
}

fn join_waiting(t: &Tokens, reason: crate::strings::Key) -> El {
	use chat::screen::notice::join_refused::waiting_for_host::TITLE;
	let host = [("host", "Noa"), ("space", "Studio")];
	let title = say(TITLE, EN, &host);
	let description = say(reason, EN, &host);
	notice_story(t, &failure(&title, Some(&description)))
}

macro_rules! join_waiting_scenes {
	($($name:ident => $reason:ident),* $(,)?) => {
		$(pub(super) fn $name(t: &Tokens, _: &SceneState) -> El {
			join_waiting(t, chat::screen::notice::join_refused::waiting_for_host::reasons::$reason)
		})*
	};
}

join_waiting_scenes! {
	join_waiting_relay_unreachable => RELAY_UNREACHABLE,
	join_waiting_rekey_send_failed => REKEY_SEND_FAILED,
	join_waiting_host_silent => HOST_SILENT,
	join_waiting_socket_closed => SOCKET_CLOSED,
	join_waiting_rekey_not_verified => REKEY_NOT_VERIFIED,
	join_waiting_not_member => NOT_MEMBER,
	join_waiting_unknown_instance => UNKNOWN_INSTANCE,
	join_waiting_device_keys_unreadable => DEVICE_KEYS_UNREADABLE,
	join_waiting_device_awaiting_approval => DEVICE_AWAITING_APPROVAL,
	join_waiting_socket_url_failed => SOCKET_URL_FAILED,
	join_waiting_roster_missing => ROSTER_MISSING,
	join_waiting_keychain_read_failed => KEYCHAIN_READ_FAILED,
}

pub(super) fn join_unexpected(t: &Tokens, _: &SceneState) -> El {
	use chat::screen::notice::join_refused::unexpected::{DESCRIPTION, TITLE};
	let title = say(TITLE, EN, &[("space", "Studio")]);
	notice_story(t, &failure(&title, Some(DESCRIPTION.text(EN))))
}

const FAILURE_TITLE: &str = "Routine could not run";
const FAILURE_DESCRIPTION: &str =
	"The watched folder was not readable. Nothing was written, and the schedule is untouched.";
const LONG_FAILURE_TITLE: &str = "ScheduledRoutineWatcherCouldNotReadTheWatchedDirectory";
const LONG_FAILURE_DESCRIPTION: &str = "The host refused the read while the routine was starting, so the run was abandoned before the first step. Nothing was written to the thread and the schedule is untouched. The next run is still due at nine tomorrow, and the folder can be repointed from the routine settings in the meantime.";
const RETRY_LABEL: &str = "Try again";
const RUN_THE_ROUTINE: &str = "Run the routine";

fn routine_failure() -> RaisedNotice<'static> {
	RaisedNotice::failure(FAILURE_TITLE, Some(FAILURE_DESCRIPTION))
}

fn raised(t: &Tokens, triggers: &[&str], notices: &[RaisedNotice]) -> El {
	let buttons = row().gap(SPACING * 2.0).children(
		triggers.iter().map(|label| Button::new(label).variant(ButtonVariant::Outline).view(t)),
	);
	staged(t, buttons, vec![notice_surface(t, EN, notices, ignore)])
}

pub(super) fn notice_surface_error(t: &Tokens, _: &SceneState) -> El {
	raised(t, &[RUN_THE_ROUTINE], &[routine_failure()])
}

pub(super) fn notice_surface_closed_by_keyboard(t: &Tokens, _: &SceneState) -> El {
	raised(t, &[RUN_THE_ROUTINE, "Save the routine"], &[routine_failure()])
}

pub(super) fn notice_surface_with_report(t: &Tokens, _: &SceneState) -> El {
	raised(
		t,
		&[RUN_THE_ROUTINE],
		&[RaisedNotice { report: Some(Report::Ready), ..routine_failure() }],
	)
}

fn long_reported(t: &Tokens, report: Report) -> El {
	let notice = RaisedNotice {
		action: Some(RETRY_LABEL),
		report: Some(report),
		..RaisedNotice::failure(LONG_FAILURE_TITLE, Some(LONG_FAILURE_DESCRIPTION))
	};
	raised(t, &[RUN_THE_ROUTINE], &[notice])
}

pub(super) fn notice_surface_with_report_and_action(t: &Tokens, _: &SceneState) -> El {
	long_reported(t, Report::Ready)
}

pub(super) fn notice_surface_report_copied(t: &Tokens, _: &SceneState) -> El {
	long_reported(t, Report::Copied)
}

pub(super) fn notice_surface_move_to_new_window_failed(t: &Tokens, _: &SceneState) -> El {
	use common::title_bar::move_tab_failed::{DESCRIPTION_WITH_REASON, TITLE};
	let description = say(DESCRIPTION_WITH_REASON, EN, &[("reason", "unavailable")]);
	raised(t, &["Move to new window"], &[RaisedNotice::failure(TITLE.text(EN), Some(&description))])
}

pub(super) fn notice_surface_describe_refused(t: &Tokens, _: &SceneState) -> El {
	use chat::screen::notice::{describe_refused, host_offline};
	let reason = host_offline::DESCRIPTION.text(EN);
	let description = say(describe_refused::DESCRIPTION, EN, &[("reason", reason)]);
	let notice = RaisedNotice::failure(describe_refused::TITLE.text(EN), Some(&description));
	raised(t, &["Save name and colour"], &[notice])
}

pub(super) fn notice_surface_stacked(t: &Tokens, _: &SceneState) -> El {
	let stack = [
		RaisedNotice::failure("First notice", Some("The oldest of the four.")),
		RaisedNotice::failure("Second notice", Some("Raised after the first.")),
		RaisedNotice::failure("Third notice", Some("Raised after the second.")),
		RaisedNotice::failure("Fourth notice", Some("The newest of the four.")),
	];
	raised(t, &[], &stack)
}

pub(super) fn notice_surface_long_content(t: &Tokens, _: &SceneState) -> El {
	let notice = RaisedNotice {
		action: Some(RETRY_LABEL),
		..RaisedNotice::failure(LONG_FAILURE_TITLE, Some(LONG_FAILURE_DESCRIPTION))
	};
	raised(t, &["Report the long failure"], &[notice])
}

pub(super) fn notice_surface_with_dialog(t: &Tokens, _: &SceneState) -> El {
	let content = DialogContent {
		title: "Agent settings",
		description: "Name the agent, point it at a folder and tell it how to behave.",
		footer: Vec::new(),
	};
	staged(
		t,
		Button::new("Agent settings").variant(ButtonVariant::Outline).view(t),
		vec![
			scrim(t),
			dialog(t, content, |_: &mut SceneState| {}),
			notice_surface(t, EN, &[routine_failure()], ignore),
		],
	)
}

pub(super) fn notice_surface_dark_theme(t: &Tokens, _: &SceneState) -> El {
	raised(
		t,
		&[RUN_THE_ROUTINE],
		&[RaisedNotice { action: Some(RETRY_LABEL), ..routine_failure() }],
	)
}

pub(super) fn notice_surface_reduced_motion(t: &Tokens, _: &SceneState) -> El {
	let still = Tokens { reduced_motion: true, ..*t };
	raised(&still, &["Report the reduced-motion failure"], &[routine_failure()])
}

pub(super) fn notice_surface_signed_out(t: &Tokens, _: &SceneState) -> El {
	let title = say(bots::spaces::sign_out::NOTICE, EN, &[("name", "Studio Nord")]);
	raised(t, &[], &[RaisedNotice::transient(NoticeKind::Info, &title, None)])
}

fn removed(t: &Tokens, hue: f32) -> El {
	let title = say(bots::spaces::removed::NOTICE, EN, &[("host", "Steve"), ("name", "Studio")]);
	let description = say(bots::spaces::removed::NOTICE_DESCRIPTION, EN, &[("host", "Steve")]);
	let notice = RaisedNotice {
		space_hue: Some(hue),
		..RaisedNotice::transient(NoticeKind::Info, &title, Some(&description))
	};
	raised(t, &[], &[notice])
}

pub(super) fn notice_surface_removed_with_space_mark(t: &Tokens, _: &SceneState) -> El {
	removed(t, Preset::Orange.hue())
}

pub(super) fn notice_surface_removed_at_free_hue(t: &Tokens, _: &SceneState) -> El {
	removed(t, 210.0)
}

fn device(t: &Tokens, title: crate::strings::Key, description: crate::strings::Key) -> El {
	let title = say(title, EN, &[("device", "Noa’s iPhone 17")]);
	let notice = RaisedNotice::transient(NoticeKind::Success, &title, Some(description.text(EN)));
	raised(t, &[], &[notice])
}

pub(super) fn notice_surface_device_approved(t: &Tokens, _: &SceneState) -> El {
	use common::devices::approval::approved::{DESCRIPTION, TITLE};
	device(t, TITLE, DESCRIPTION)
}

pub(super) fn notice_surface_device_rejected(t: &Tokens, _: &SceneState) -> El {
	use common::devices::approval::rejected::{DESCRIPTION, TITLE};
	device(t, TITLE, DESCRIPTION)
}

pub(super) fn notice_surface_device_removed(t: &Tokens, _: &SceneState) -> El {
	use settings::account::devices::removed::{DESCRIPTION, TITLE};
	device(t, TITLE, DESCRIPTION)
}

const SCREEN_CONTENT: &str = "Every screen of the app sits in this frame: the header bar on top, a column that scrolls under it, and an optional footer docked to the bottom of the card.";

fn header(t: &Tokens) -> El {
	col()
		.w_full()
		.role("banner")
		.child(
			row().w_full().h(HEADER_HEIGHT).pl(SPACING * 1.5).pr(SPACING * 2.5).center_y().child(
				text(settings::breadcrumb::TITLE.text(EN)).font(TEXT_SM_MEDIUM).color(t.foreground),
			),
		)
		.child(separator(t, Orientation::Horizontal))
}

fn screen(t: &Tokens, content: bool, footer: bool, width: ScreenWidth, in_card: bool) -> El {
	let content = if content {
		vec![text(SCREEN_CONTENT).font(TEXT_SM).color(t.foreground).wrap()]
	} else {
		Vec::new()
	};
	let footer = if footer { vec![Button::new("Save").view(t)] } else { Vec::new() };
	screen_layout(t, Screen { header: Some(header(t)), content, footer, width, in_card })
}

pub(super) fn screen_header_only(t: &Tokens, _: &SceneState) -> El {
	root(screen(t, false, false, ScreenWidth::Full, false))
}

pub(super) fn screen_header_and_content(t: &Tokens, _: &SceneState) -> El {
	root(screen(t, true, false, ScreenWidth::Full, false))
}

pub(super) fn screen_header_content_and_footer(t: &Tokens, _: &SceneState) -> El {
	root(screen(t, true, true, ScreenWidth::Full, false))
}

fn in_wide_card(t: &Tokens, width: ScreenWidth) -> El {
	let card = el()
		.w(WIDE_CARD)
		.h_full()
		.radius(RADIUS_XL)
		.clip_rounded(RADIUS_XL)
		.border(1.0, t.shell_border)
		.child(screen(t, true, false, width, true));
	root(row().w_full().h_full().fill(t.sidebar).padding(SPACING * 2.0).child(card))
}

pub(super) fn screen_column_width_in_wide_card(t: &Tokens, _: &SceneState) -> El {
	in_wide_card(t, ScreenWidth::Column)
}

pub(super) fn screen_full_width_in_wide_card(t: &Tokens, _: &SceneState) -> El {
	in_wide_card(t, ScreenWidth::Full)
}

const NEST_KEEPER: &str = "Nest Keeper";
const READY: &str = "Kiroshi talks to the agent directly. Nothing leaves your device.";
const HINT: &str = "Type your first prompt in the composer below";

fn nest_keeper(t: &Tokens) -> El {
	Face::still(NEST_KEEPER, Some(Preset::Blue.hue())).draw(EMPTY_MARK, t)
}

fn empty(t: &Tokens, state: EmptyState) -> El {
	stage(t, el().w_full().child(empty_state_shell(t, state)))
}

pub(super) fn empty_default(t: &Tokens, _: &SceneState) -> El {
	let state = EmptyState {
		mark: nest_keeper(t),
		title: NEST_KEEPER,
		description: READY,
		action: None,
		hint: Some(HINT),
	};
	empty(t, state)
}

pub(super) fn empty_with_action(t: &Tokens, _: &SceneState) -> El {
	let state = EmptyState {
		mark: nest_keeper(t),
		title: NEST_KEEPER,
		description: READY,
		action: Some(Button::new("Agent settings").view(t)),
		hint: Some(HINT),
	};
	empty(t, state)
}

pub(super) fn empty_without_hint(t: &Tokens, _: &SceneState) -> El {
	let alert = el()
		.size(ALERT_MARK, ALERT_MARK)
		.radius(RADIUS_2XL)
		.border(1.0, t.destructive)
		.fill(faded(t.destructive, 0.1))
		.center()
		.child(icon(&icons::TRIANGLE_ALERT, ALERT_GLYPH).color(t.destructive));
	let state = EmptyState {
		mark: alert,
		title: "Couldn’t reach the agent",
		description: "Kiroshi’s built-in agent didn’t answer. Try again.",
		action: Some(Button::new("Try again").view(t)),
		hint: None,
	};
	empty(t, state)
}

pub(super) fn empty_long_content(t: &Tokens, _: &SceneState) -> El {
	let state = EmptyState {
		mark: nest_keeper(t),
		title: "Ship the December release, then plan the January retrospective with everyone involved",
		description: "Six agents are here and waiting on your first message, and every one of them reads the whole room before answering.",
		action: None,
		hint: Some(HINT),
	};
	empty(t, state)
}

const ACCOUNT_EMAIL: &str = "noa@example.com";
const TYPED_CODE: &str = "482137";
const ASKING_PHONE: Device =
	Device { kind: DeviceKind::Phone, name: "Noa’s iPhone 17", activity: Some("Asked just now") };
const THIS_MACBOOK_PRO: Device =
	Device { kind: DeviceKind::Laptop, name: "Noa’s MacBook Pro", activity: None };
const NEW_MACBOOK_AIR: Device =
	Device { kind: DeviceKind::Laptop, name: "Noa’s MacBook Air", activity: None };
const UNBROKEN_NAME: &str = "Noa’sMacBookProFromTheResearchLabThatNobodyEverRenamedAfterTheMove";
const DIALOG_CARD_WIDTH: f32 = 392.0;
const NARROW_CARD_WIDTH: f32 = 320.0;

pub(super) static DEVICE_SCENES: &[Scene] = &[
	focused("feedback-newdevicescreen--waiting", STORY_VIEWPORT, 2, new_device_waiting),
	focused("feedback-newdevicescreen--code", STORY_VIEWPORT, 2, new_device_code_typed),
	focused("feedback-newdevicescreen--expired", STORY_VIEWPORT, 1, new_device_expired),
	focused("feedback-newdevicescreen--rejected", STORY_VIEWPORT, 1, new_device_rejected),
	scene(
		"feedback-newdevicescreen--waiting-centred-in-700-px-window",
		SHORT_WINDOW,
		new_device_waiting,
	),
	scene(
		"feedback-newdevicescreen--waiting-centred-in-1100-px-window",
		TALL_WINDOW,
		new_device_waiting,
	),
	scene("feedback-newdevicescreen--code-centred-in-700-px-window", SHORT_WINDOW, new_device_code),
	scene("feedback-newdevicescreen--code-centred-in-1100-px-window", TALL_WINDOW, new_device_code),
	scene(
		"feedback-newdevicescreen--expired-centred-in-700-px-window",
		SHORT_WINDOW,
		new_device_expired,
	),
	scene(
		"feedback-newdevicescreen--expired-centred-in-1100-px-window",
		TALL_WINDOW,
		new_device_expired,
	),
	scene(
		"feedback-newdevicescreen--rejected-centred-in-700-px-window",
		SHORT_WINDOW,
		new_device_rejected,
	),
	scene(
		"feedback-newdevicescreen--rejected-centred-in-1100-px-window",
		TALL_WINDOW,
		new_device_rejected,
	),
	focused("overlays-deviceapprovaldialog--default", STORY_VIEWPORT, 2, approval_asking),
	focused("overlays-deviceapprovaldialog--approving", STORY_VIEWPORT, 1, approval_approving),
	focused("overlays-deviceapprovaldialog--error", STORY_VIEWPORT, 1, approval_failed),
	scene("primitives-devicecard--default", STORY, device_card_default),
	scene("primitives-devicecard--with-meta", STORY, device_card_with_meta),
	scene("primitives-devicecard--long-content", STORY, device_card_long_content),
];

fn new_device(t: &Tokens, step: NewDeviceStep, code: &str) -> El {
	let screen = NewDevice {
		step,
		email: ACCOUNT_EMAIL,
		device: &NEW_MACBOOK_AIR,
		code,
		is_code_focused: false,
	};
	root(new_device_screen(t, EN, &screen, ignore))
}

fn new_device_waiting(t: &Tokens, _: &SceneState) -> El {
	new_device(t, NewDeviceStep::Waiting, "")
}

fn new_device_code(t: &Tokens, _: &SceneState) -> El {
	new_device(t, NewDeviceStep::Code, "")
}

fn new_device_code_typed(t: &Tokens, _: &SceneState) -> El {
	new_device(t, NewDeviceStep::Code, TYPED_CODE)
}

fn new_device_expired(t: &Tokens, _: &SceneState) -> El {
	new_device(t, NewDeviceStep::Expired, "")
}

fn new_device_rejected(t: &Tokens, _: &SceneState) -> El {
	new_device(t, NewDeviceStep::Rejected, "")
}

fn approval(t: &Tokens, status: ApprovalStatus) -> El {
	staged(t, el(), vec![device_approval_dialog(t, EN, &ASKING_PHONE, status, ignore)])
}

fn approval_asking(t: &Tokens, _: &SceneState) -> El {
	approval(t, ApprovalStatus::Asking)
}

fn approval_approving(t: &Tokens, _: &SceneState) -> El {
	approval(t, ApprovalStatus::Approving)
}

fn approval_failed(t: &Tokens, _: &SceneState) -> El {
	approval(t, ApprovalStatus::Failed)
}

fn card_in(t: &Tokens, width: f32, card: &DeviceCard) -> El {
	stage(t, el().w(width).child(device_card(t, card)))
}

fn device_card_default(t: &Tokens, _: &SceneState) -> El {
	let card = DeviceCard { device: &ASKING_PHONE, meta: None, is_name_strong: true };
	card_in(t, DIALOG_CARD_WIDTH, &card)
}

fn device_card_with_meta(t: &Tokens, _: &SceneState) -> El {
	let card =
		DeviceCard { device: &THIS_MACBOOK_PRO, meta: Some("Active now"), is_name_strong: false };
	card_in(t, DIALOG_CARD_WIDTH, &card)
}

fn device_card_long_content(t: &Tokens, _: &SceneState) -> El {
	let device = Device { name: UNBROKEN_NAME, ..THIS_MACBOOK_PRO };
	let card = DeviceCard {
		device: &device,
		meta: Some(common::devices::new_device::THIS_DEVICE.text(EN)),
		is_name_strong: false,
	};
	card_in(t, NARROW_CARD_WIDTH, &card)
}
