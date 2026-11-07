use rune::{El, col};

use super::{SceneState, stage, staged};
use crate::hues::Preset;
use crate::icons;
use crate::primitives::toast::{Toast, ToastType, toast};
use crate::strings::{Language, settings};
use crate::surfaces::s12_person_settings::panes::{
	self, About, Account, Channel, ColorScheme, Device, DeviceKind, Devices, Notifications,
	PictureField, Plan, Preview, RemovalStatus, Update,
};
use crate::surfaces::s12_person_settings::search::{
	Bot, BotBadge, Hit, Identity, PALETTE_TOP, Palette, RestingGroup, ResultGroup, SearchKind,
	SearchTab, TitlePart, palette, result_list, result_row,
};
use crate::surfaces::s12_person_settings::shell::{
	DIALOG, Entry, MENU_WIDTH, MenuSpace, RailItem, Screen, Shell, SpaceHost, dialog_shell,
	notice_layer, screen,
};
use crate::surfaces::s12_person_settings::{Look, SettingsEvent};
use crate::tokens::{SPACING, Tokens};
use crate::widgets::not_drawn;

const ROW_LIST_WIDTH: f32 = SPACING * 105.0;
const FIELDS_WIDTH: f32 = SPACING * 104.0;
const ABOUT_WIDTH: f32 = SPACING * 144.0;
const SPACE_NAME: &str = "Studio";
const QUERY: &str = "parser";
const MINIMUM_MENU: f32 = SPACING * 56.0;
const MAXIMUM_MENU: f32 = SPACING * 104.0;

fn ignore<E>(_: &mut SceneState, _: E) {}

fn look(t: &Tokens) -> Look<'_> {
	Look { t, lang: Language::En }
}

fn french(t: &Tokens) -> Look<'_> {
	Look { t, lang: Language::Fr }
}

const ADA: Bot = Bot { seed: "bot-ada-martin", hue: None };
const NOOR: Bot = Bot { seed: "bot-noor-beltran", hue: None };

fn plain<'a>(title: &'a str) -> Vec<TitlePart<'a>> {
	vec![TitlePart { text: title, is_match: false }]
}

fn matched<'a>(head: &'a str, tail: &'a str) -> Vec<TitlePart<'a>> {
	vec![
		TitlePart { text: head, is_match: false },
		TitlePart { text: QUERY, is_match: true },
		TitlePart { text: tail, is_match: false },
	]
}

fn message_hit() -> Hit<'static> {
	Hit {
		id: "message",
		identity: Identity::Message(ADA),
		title: matched("The ", " drops every escaped newline"),
		timestamp: "1h",
		parts: vec!["Ada Martin", "Changelog cleanup"],
		identifier: None,
	}
}

fn message_from_you_hit() -> Hit<'static> {
	Hit {
		id: "message-from-you",
		identity: Identity::MessageFromYou { reader: "Steve Rivera", image: None },
		title: matched("Can you rerun the ", " on the archive?"),
		timestamp: "3h",
		parts: vec!["You", "Ada Martin"],
		identifier: None,
	}
}

fn chat_group_hit(hue: Option<f32>, pictogram: &'static rune::Icon) -> Hit<'static> {
	Hit {
		id: "chat-changelog",
		identity: Identity::ChatGroup { hue, pictogram },
		title: plain("Changelog cleanup"),
		timestamp: "Mon",
		parts: vec!["Atlas and Beacon"],
		identifier: None,
	}
}

fn chat_solo_hit(hue: Option<f32>) -> Hit<'static> {
	Hit {
		id: "chat-release",
		identity: Identity::ChatSolo(Bot { hue, ..ADA }),
		title: plain("Release notes review"),
		timestamp: "Tue",
		parts: vec!["Ada Martin"],
		identifier: None,
	}
}

fn mission_hit() -> Hit<'static> {
	Hit {
		id: "mission-run-history",
		identity: Identity::Mission {
			bot: ADA,
			badge: Some(BotBadge::Attention),
			mark: &icons::LINEAR,
		},
		title: plain("Migrate the run history table"),
		timestamp: "2d",
		parts: vec!["Ada Martin", "Waiting for you"],
		identifier: Some("OPE-51"),
	}
}

fn routine_hit(parts: Vec<&'static str>) -> Hit<'static> {
	Hit {
		id: "routine-digest",
		identity: Identity::Routine(NOOR),
		title: plain("Morning changelog digest"),
		timestamp: "8d",
		parts,
		identifier: None,
	}
}

fn one_row(t: &Tokens, hit: Hit, is_active: bool) -> El {
	stage(t, result_list(t, ROW_LIST_WIDTH, [result_row(look(t), &hit, is_active, ignore)]))
}

pub(super) fn row_message(t: &Tokens, _: &SceneState) -> El {
	one_row(t, message_hit(), false)
}

pub(super) fn row_message_from_you(t: &Tokens, _: &SceneState) -> El {
	one_row(t, message_from_you_hit(), false)
}

pub(super) fn row_chat_group(t: &Tokens, _: &SceneState) -> El {
	one_row(t, chat_group_hit(None, &icons::MESSAGE_SQUARE_FILL), false)
}

pub(super) fn row_chat_solo(t: &Tokens, _: &SceneState) -> El {
	one_row(t, chat_solo_hit(Some(Preset::Purple.hue())), false)
}

pub(super) fn row_chat_group_picked_icon(t: &Tokens, _: &SceneState) -> El {
	one_row(t, chat_group_hit(Some(Preset::Red.hue()), &icons::SHIELD_KEY_FILL), false)
}

pub(super) fn row_chat_group_free_hue(t: &Tokens, _: &SceneState) -> El {
	one_row(t, chat_group_hit(Some(210.0), &icons::MESSAGE_SQUARE_FILL), false)
}

pub(super) fn row_mission(t: &Tokens, _: &SceneState) -> El {
	one_row(t, mission_hit(), false)
}

pub(super) fn row_routine(t: &Tokens, _: &SceneState) -> El {
	one_row(t, routine_hit(vec!["Every weekday at 09:00", "Changelog cleanup"]), false)
}

pub(super) fn row_active(t: &Tokens, _: &SceneState) -> El {
	one_row(t, message_hit(), true)
}

pub(super) fn row_long_content(t: &Tokens, _: &SceneState) -> El {
	let hit = Hit {
		title: matched(
			"Rewrite the changelog ",
			" so that every escaped newline survives the round trip through the archive",
		),
		parts: vec![
			"Ada Martin",
			"Changelog cleanup, archive migration and the long tail of the release notes",
		],
		..message_hit()
	};
	one_row(t, hit, false)
}

fn studio(t: &Tokens) -> Tokens {
	t.in_space(Some(Preset::Orange.hue()))
}

const MESSAGE_TAILS: [&str; 10] = [
	" drops escaped newline 1",
	" drops escaped newline 2",
	" drops escaped newline 3",
	" drops escaped newline 4",
	" drops escaped newline 5",
	" drops escaped newline 6",
	" drops escaped newline 7",
	" drops escaped newline 8",
	" drops escaped newline 9",
	" drops escaped newline 10",
];
const MESSAGE_IDS: [&str; 10] = [
	"message-1",
	"message-2",
	"message-3",
	"message-4",
	"message-5",
	"message-6",
	"message-7",
	"message-8",
	"message-9",
	"message-10",
];
const MESSAGE_STAMPS: [&str; 10] = ["1h", "2h", "3h", "4h", "5h", "6h", "7h", "8h", "9h", "10h"];

fn messages(count: usize) -> Vec<Hit<'static>> {
	(0..count)
		.map(|at| Hit {
			id: MESSAGE_IDS[at],
			title: matched("The ", MESSAGE_TAILS[at]),
			timestamp: MESSAGE_STAMPS[at],
			..message_hit()
		})
		.collect()
}

fn chats() -> Vec<Hit<'static>> {
	vec![chat_group_hit(None, &icons::MESSAGE_SQUARE_FILL), chat_solo_hit(None)]
}

fn results(found_messages: usize, total_messages: usize) -> Vec<ResultGroup<'static>> {
	vec![
		ResultGroup {
			kind: SearchKind::Messages,
			total: total_messages,
			hits: messages(found_messages),
		},
		ResultGroup { kind: SearchKind::Chats, total: 2, hits: chats() },
		ResultGroup { kind: SearchKind::Missions, total: 1, hits: vec![mission_hit()] },
		ResultGroup {
			kind: SearchKind::Routines,
			total: 1,
			hits: vec![routine_hit(vec!["Every weekday at 09:00"])],
		},
	]
}

fn resting_hit(
	id: &'static str,
	identity: Identity<'static>,
	title: &'static str,
	timestamp: &'static str,
	part: &'static str,
) -> Hit<'static> {
	Hit { id, identity, title: plain(title), timestamp, parts: vec![part], identifier: None }
}

fn resting_chats() -> Vec<Hit<'static>> {
	let solo = Identity::ChatSolo(ADA);
	vec![
		resting_hit("resting-chat-onboarding", solo, "Onboarding copy pass", "10m", "Atlas"),
		resting_hit("resting-chat-changelog", solo, "Changelog cleanup", "1h", "Beacon"),
		resting_hit("resting-chat-release", solo, "Release notes review", "Mon", "Ada Martin"),
		resting_hit("resting-chat-triage", solo, "Weekly triage", "Fri", "Atlas"),
	]
}

fn resting_missions() -> Vec<Hit<'static>> {
	let mission = Identity::Mission { bot: ADA, badge: None, mark: &icons::LINEAR };
	vec![
		resting_hit(
			"resting-mission-run-history",
			mission,
			"Migrate the run history table",
			"2d",
			"Waiting for you",
		),
		resting_hit(
			"resting-mission-parser",
			mission,
			"Split the parser transport",
			"3d",
			"Running",
		),
	]
}

fn resting_routines() -> Vec<Hit<'static>> {
	let routine = Identity::Routine(NOOR);
	vec![
		resting_hit(
			"resting-routine-digest",
			routine,
			"Morning changelog digest",
			"8d",
			"Every weekday at 09:00",
		),
		resting_hit(
			"resting-routine-standup",
			routine,
			"Standup reminder",
			"9d",
			"Every weekday at 10:00",
		),
		resting_hit(
			"resting-routine-backup",
			routine,
			"Weekly backup report",
			"12d",
			"Every Sunday at 22:00",
		),
		resting_hit("resting-routine-triage", routine, "Inbox triage sweep", "20d", "Every hour"),
	]
}

fn resting() -> Vec<RestingGroup<'static>> {
	vec![
		RestingGroup { kind: SearchKind::Routines, hits: resting_routines() },
		RestingGroup { kind: SearchKind::Chats, hits: resting_chats() },
		RestingGroup { kind: SearchKind::Missions, hits: resting_missions() },
	]
}

struct Search {
	tab: SearchTab,
	results: Vec<ResultGroup<'static>>,
	resting: Vec<RestingGroup<'static>>,
	is_loading: bool,
	active: Option<&'static str>,
}

impl Search {
	fn found() -> Search {
		Search {
			tab: SearchTab::All,
			results: results(10, 12),
			resting: resting(),
			is_loading: false,
			active: Some("message-1"),
		}
	}
}

fn searched(t: &Tokens, s: &SceneState, search: Search) -> El {
	let t = &studio(t);
	let p = Palette {
		query: &s.edit,
		tab: search.tab,
		space: SPACE_NAME,
		results: &search.results,
		resting: &search.resting,
		is_loading: search.is_loading,
		active: search.active,
	};
	let view = palette(look(t), &p, |s: &mut SceneState| &mut s.edit, ignore);
	let layer =
		col().absolute(0.0, 0.0).w_full().h_full().pt(PALETTE_TOP).items_center().child(view);
	staged(t, rune::el(), vec![crate::primitives::dialog::scrim(t), layer])
}

pub(super) fn palette_default(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search::found())
}

pub(super) fn palette_messages(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { tab: SearchTab::Only(SearchKind::Messages), ..Search::found() })
}

pub(super) fn palette_one_hit(t: &Tokens, s: &SceneState) -> El {
	let one = vec![ResultGroup {
		kind: SearchKind::Chats,
		total: 1,
		hits: vec![chat_group_hit(None, &icons::MESSAGE_SQUARE_FILL)],
	}];
	searched(t, s, Search { results: one, active: Some("chat-changelog"), ..Search::found() })
}

pub(super) fn palette_many_hits(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { results: results(7, 7), ..Search::found() })
}

pub(super) fn palette_resting_chats(t: &Tokens, s: &SceneState) -> El {
	searched(
		t,
		s,
		Search {
			tab: SearchTab::Only(SearchKind::Chats),
			active: Some("resting-chat-onboarding"),
			..Search::found()
		},
	)
}

pub(super) fn palette_resting_messages(t: &Tokens, s: &SceneState) -> El {
	searched(
		t,
		s,
		Search { tab: SearchTab::Only(SearchKind::Messages), active: None, ..Search::found() },
	)
}

pub(super) fn palette_resting_kind_empty(t: &Tokens, s: &SceneState) -> El {
	searched(
		t,
		s,
		Search {
			tab: SearchTab::Only(SearchKind::Missions),
			resting: vec![RestingGroup { kind: SearchKind::Chats, hits: resting_chats() }],
			active: None,
			..Search::found()
		},
	)
}

pub(super) fn palette_resting_nothing(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { resting: Vec::new(), active: None, ..Search::found() })
}

pub(super) fn palette_resting_loading(t: &Tokens, s: &SceneState) -> El {
	searched(
		t,
		s,
		Search {
			tab: SearchTab::Only(SearchKind::Chats),
			resting: Vec::new(),
			is_loading: true,
			active: None,
			..Search::found()
		},
	)
}

pub(super) fn palette_resting_all_loading(t: &Tokens, s: &SceneState) -> El {
	searched(
		t,
		s,
		Search { resting: Vec::new(), is_loading: true, active: None, ..Search::found() },
	)
}

pub(super) fn palette_empty(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { results: Vec::new(), ..Search::found() })
}

pub(super) fn palette_loading(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { is_loading: true, ..Search::found() })
}

pub(super) fn palette_loading_first_query(t: &Tokens, s: &SceneState) -> El {
	searched(t, s, Search { results: Vec::new(), is_loading: true, ..Search::found() })
}

pub(super) fn palette_reduced_motion(t: &Tokens, s: &SceneState) -> El {
	let still = Tokens { reduced_motion: true, ..*t };
	searched(&still, s, Search { tab: SearchTab::Only(SearchKind::Chats), ..Search::found() })
}

fn fields(t: &Tokens, width: f32, content: El) -> El {
	stage(t, col().w(width).child(content))
}

pub(super) fn appearance_default(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::appearance(look(t), ColorScheme::System, ignore))
}

pub(super) fn appearance_in_french(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::appearance(french(t), ColorScheme::System, ignore))
}

pub(super) fn appearance_dark(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::appearance(look(t), ColorScheme::Dark, ignore))
}

pub(super) fn notifications_default(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::notifications(look(t), Notifications::ALL_ON, ignore))
}

pub(super) fn notifications_all_off(t: &Tokens, _: &SceneState) -> El {
	let off = Notifications { question: false, permission: false, turn: false, sound: false };
	fields(t, FIELDS_WIDTH, panes::notifications(look(t), off, ignore))
}

pub(super) fn notifications_in_french(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::notifications(french(t), Notifications::ALL_ON, ignore))
}

pub(super) fn language_machine(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::language(look(t), None, ignore))
}

pub(super) fn language_chosen(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::language(french(t), Some(Language::Fr), ignore))
}

pub(super) fn language_english(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::language(look(t), Some(Language::En), ignore))
}

pub(super) fn diagnostics_idle(t: &Tokens, _: &SceneState) -> El {
	fields(t, FIELDS_WIDTH, panes::diagnostics(look(t), ignore))
}

pub(super) fn diagnostics_confirming(t: &Tokens, _: &SceneState) -> El {
	staged(
		t,
		col().w(FIELDS_WIDTH).child(panes::diagnostics(look(t), ignore)),
		panes::clear_log_confirm(look(t), ignore),
	)
}

const ABOUT: About = About {
	version: "0.23.3",
	channel: Channel::Stable,
	update: Update::UpToDate { checked: "2 minutes ago" },
	shows_whats_new: true,
	getting_started: None,
};

fn about_in(t: &Tokens, about: About) -> El {
	fields(t, ABOUT_WIDTH, panes::about(look(t), about, ignore))
}

pub(super) fn about_up_to_date(t: &Tokens, _: &SceneState) -> El {
	about_in(t, ABOUT)
}

pub(super) fn about_checking(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { update: Update::Checking, ..ABOUT })
}

pub(super) fn about_available(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { update: Update::Available { version: "0.24.0" }, ..ABOUT })
}

pub(super) fn about_downloading(t: &Tokens, _: &SceneState) -> El {
	about_in(
		t,
		About { update: Update::Downloading { version: "0.24.0", progress: 42.0 }, ..ABOUT },
	)
}

pub(super) fn about_ready(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { update: Update::Ready { version: "0.24.0", running: 0 }, ..ABOUT })
}

pub(super) fn about_still_running(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { update: Update::Ready { version: "0.24.0", running: 2 }, ..ABOUT })
}

pub(super) fn about_failed(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { update: Update::Failed { version: "0.24.0" }, ..ABOUT })
}

pub(super) fn about_beta(t: &Tokens, _: &SceneState) -> El {
	about_in(
		t,
		About {
			channel: Channel::Beta,
			update: Update::Available { version: "0.25.0-beta.1" },
			..ABOUT
		},
	)
}

pub(super) fn about_getting_started(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { getting_started: Some(true), ..ABOUT })
}

pub(super) fn about_nothing_to_import(t: &Tokens, _: &SceneState) -> El {
	about_in(t, About { getting_started: Some(false), ..ABOUT })
}

const ADA_MARTIN: &str = "Ada Martin";
const SIGNED_IN: Account =
	Account::SignedIn { name: ADA_MARTIN, email: "ada.martin@example.com", plan: Some(Plan::Pro) };
const BASE_ITEMS: [Entry; 5] =
	[Entry::Appearance, Entry::Notifications, Entry::Language, Entry::Skills, Entry::History];

#[derive(Clone, Copy)]
struct Person {
	name: &'static str,
	has_picture: bool,
	scheme: ColorScheme,
	language: Option<Language>,
	notifications: Notifications,
	account: Option<Account<'static>>,
	is_account_pending: bool,
	devices: Option<Devices<'static>>,
	has_applications: bool,
	has_diagnostics: bool,
	about: Option<About<'static>>,
}

const ADA_SETTINGS: Person = Person {
	name: ADA_MARTIN,
	has_picture: false,
	scheme: ColorScheme::System,
	language: None,
	notifications: Notifications::ALL_ON,
	account: None,
	is_account_pending: false,
	devices: None,
	has_applications: false,
	has_diagnostics: false,
	about: None,
};

impl Person {
	fn items(&self) -> Vec<RailItem> {
		let plain = |entry| RailItem { entry, has_indicator: false };
		let mut items = Vec::new();
		if self.account.is_some() {
			items.push(plain(Entry::Account));
		}
		items.extend(BASE_ITEMS[..4].iter().map(|&entry| plain(entry)));
		if self.has_applications {
			items.push(plain(Entry::Applications));
		}
		items.push(plain(Entry::History));
		if self.has_diagnostics {
			items.push(plain(Entry::Diagnostics));
		}
		if let Some(about) = self.about {
			items.push(RailItem { entry: Entry::About, has_indicator: about.update.is_pending() });
		}
		items
	}

	fn first(&self) -> Entry {
		if self.account.is_some() { Entry::Account } else { Entry::Appearance }
	}

	fn content(&self, look: Look, entry: Entry, image: Option<&rune::image::Image>) -> El {
		let t = look.t;
		match entry {
			Entry::Account => panes::account(
				look,
				self.account.unwrap_or(Account::SignedOut),
				self.is_account_pending,
				image,
				self.devices,
				ignore,
			),
			Entry::Appearance => panes::appearance(look, self.scheme, ignore),
			Entry::Notifications => panes::notifications(look, self.notifications, ignore),
			Entry::Language => panes::language(look, self.language, ignore),
			Entry::Diagnostics => panes::diagnostics(look, ignore),
			Entry::About => panes::about(look, self.about.unwrap_or(ABOUT), ignore),
			Entry::Skills => not_drawn(t, "Skills", "plugin-settings/skill-files-panel.tsx"),
			Entry::Applications => {
				not_drawn(t, "Applications", "plugin-settings/use-mcp-session.tsx")
			}
			Entry::History => not_drawn(t, "History", "plugin-settings/history-panel.tsx"),
		}
	}
}

fn dialog_of(
	t: &Tokens,
	s: &SceneState,
	person: Person,
	tab: Option<Entry>,
	notice: Option<El>,
) -> El {
	let look = look(t);
	let image = if person.has_picture { s.picture.as_ref() } else { None };
	let current = tab.unwrap_or_else(|| person.first());
	let items = person.items();
	let shell = Shell {
		name: person.name,
		image,
		items: &items,
		current,
		content: person.content(look, current, image),
	};
	let mut layers = dialog_shell(look, shell, ignore::<SettingsEvent>);
	if let Some(notice) = notice {
		layers.push(notice_layer(notice));
	}
	staged(t, rune::el(), layers)
}

pub(super) fn dialog_default(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, Person { account: Some(SIGNED_IN), ..ADA_SETTINGS }, None, None)
}

pub(super) fn dialog_without_account(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, ADA_SETTINGS, None, None)
}

pub(super) fn dialog_empty(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, Person { name: "You", ..ADA_SETTINGS }, None, None)
}

pub(super) fn dialog_appearance(t: &Tokens, s: &SceneState) -> El {
	dialog_of(
		t,
		s,
		Person { scheme: ColorScheme::Dark, ..ADA_SETTINGS },
		Some(Entry::Appearance),
		None,
	)
}

pub(super) fn dialog_notifications(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, ADA_SETTINGS, Some(Entry::Notifications), None)
}

pub(super) fn dialog_language(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, ADA_SETTINGS, Some(Entry::Language), None)
}

pub(super) fn dialog_skills(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, ADA_SETTINGS, Some(Entry::Skills), None)
}

pub(super) fn dialog_applications(t: &Tokens, s: &SceneState) -> El {
	dialog_of(
		t,
		s,
		Person { has_applications: true, ..ADA_SETTINGS },
		Some(Entry::Applications),
		None,
	)
}

pub(super) fn dialog_history(t: &Tokens, s: &SceneState) -> El {
	dialog_of(t, s, ADA_SETTINGS, Some(Entry::History), None)
}

pub(super) fn dialog_diagnostics(t: &Tokens, s: &SceneState) -> El {
	dialog_of(
		t,
		s,
		Person { has_diagnostics: true, ..ADA_SETTINGS },
		Some(Entry::Diagnostics),
		None,
	)
}

pub(super) fn dialog_about(t: &Tokens, s: &SceneState) -> El {
	let about = About { update: Update::Available { version: "0.24.0" }, ..ABOUT };
	dialog_of(t, s, Person { about: Some(about), ..ADA_SETTINGS }, Some(Entry::About), None)
}

fn account_dialog(t: &Tokens, s: &SceneState, account: Account<'static>, notice: Option<El>) -> El {
	dialog_of(t, s, Person { account: Some(account), ..ADA_SETTINGS }, Some(Entry::Account), notice)
}

pub(super) fn dialog_account_loading(t: &Tokens, s: &SceneState) -> El {
	let person =
		Person { account: Some(Account::SignedOut), is_account_pending: true, ..ADA_SETTINGS };
	dialog_of(t, s, person, Some(Entry::Account), None)
}

pub(super) fn dialog_signed_out(t: &Tokens, s: &SceneState) -> El {
	account_dialog(t, s, Account::SignedOut, None)
}

pub(super) fn dialog_waiting(t: &Tokens, s: &SceneState) -> El {
	account_dialog(t, s, Account::Waiting, None)
}

pub(super) fn dialog_signed_in(t: &Tokens, s: &SceneState) -> El {
	account_dialog(t, s, SIGNED_IN, None)
}

pub(super) fn dialog_signed_in_with_picture(t: &Tokens, s: &SceneState) -> El {
	let person = Person {
		account: Some(SIGNED_IN),
		scheme: ColorScheme::Dark,
		has_picture: true,
		..ADA_SETTINGS
	};
	dialog_of(t, s, person, Some(Entry::Account), None)
}

fn with_plan(plan: Option<Plan>) -> Account<'static> {
	Account::SignedIn { name: ADA_MARTIN, email: "ada.martin@example.com", plan }
}

pub(super) fn dialog_free_plan(t: &Tokens, s: &SceneState) -> El {
	account_dialog(t, s, with_plan(Some(Plan::Free)), None)
}

pub(super) fn dialog_without_plan(t: &Tokens, s: &SceneState) -> El {
	account_dialog(t, s, with_plan(None), None)
}

fn failure(t: &Tokens, title: crate::strings::Key, description: crate::strings::Key) -> El {
	let look = look(t);
	toast(
		t,
		Toast {
			kind: ToastType::Error,
			title: look.say(title),
			description: look.say(description),
			action: None,
		},
	)
}

pub(super) fn dialog_cant_reach(t: &Tokens, s: &SceneState) -> El {
	use settings::account::unreachable;
	account_dialog(
		t,
		s,
		Account::SignedOut,
		Some(failure(t, unreachable::TITLE, unreachable::DESCRIPTION)),
	)
}

pub(super) fn dialog_request_expired(t: &Tokens, s: &SceneState) -> El {
	use settings::account::failed;
	account_dialog(
		t,
		s,
		Account::SignedOut,
		Some(failure(t, failed::TIMED_OUT, failed::DESCRIPTION)),
	)
}

pub(super) fn dialog_signed_out_from_the_site(t: &Tokens, s: &SceneState) -> El {
	use settings::account::signed_out_from_the_site as site;
	account_dialog(t, s, Account::SignedOut, Some(failure(t, site::TITLE, site::DESCRIPTION)))
}

const NOA: &str = "Noa Laurent";
const NOA_EMAIL: &str = "noa@example.com";
const THIS_MACBOOK_PRO: Device = Device {
	id: "this-device",
	kind: DeviceKind::Laptop,
	name: "Noa’s MacBook Pro",
	activity: None,
};
const OTHER_DEVICES: [Device; 2] = [
	Device {
		id: "mac-mini",
		kind: DeviceKind::Desktop,
		name: "Mac mini",
		activity: Some("Active 2 hours ago"),
	},
	Device {
		id: "iphone-17",
		kind: DeviceKind::Phone,
		name: "Noa’s iPhone 17",
		activity: Some("Active yesterday"),
	},
];
const DEVICES: Devices = Devices {
	email: NOA_EMAIL,
	this_device: THIS_MACBOOK_PRO,
	others: &OTHER_DEVICES,
	is_pending: false,
	confirming: None,
	removal: None,
};

fn devices_dialog(t: &Tokens, s: &SceneState, devices: Devices<'static>) -> El {
	let person = Person {
		name: NOA,
		scheme: ColorScheme::Dark,
		account: Some(Account::SignedIn { name: NOA, email: NOA_EMAIL, plan: None }),
		devices: Some(devices),
		..ADA_SETTINGS
	};
	dialog_of(t, s, person, Some(Entry::Account), None)
}

pub(super) fn devices_default(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(t, s, DEVICES)
}

pub(super) fn devices_confirming(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(t, s, Devices { confirming: Some("iphone-17"), ..DEVICES })
}

pub(super) fn devices_removing(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(
		t,
		s,
		Devices {
			confirming: Some("iphone-17"),
			removal: Some(RemovalStatus::Removing),
			..DEVICES
		},
	)
}

pub(super) fn devices_error(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(
		t,
		s,
		Devices { confirming: Some("iphone-17"), removal: Some(RemovalStatus::Failed), ..DEVICES },
	)
}

pub(super) fn devices_empty(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(t, s, Devices { others: &[], ..DEVICES })
}

pub(super) fn devices_loading(t: &Tokens, s: &SceneState) -> El {
	devices_dialog(t, s, Devices { is_pending: true, ..DEVICES })
}

pub(super) fn picture_default(t: &Tokens, s: &SceneState) -> El {
	let preview = match s.picture.as_ref() {
		Some(image) => Preview::Picture(image),
		None => Preview::Glyph,
	};
	picture_in(
		t,
		PictureField {
			preview,
			pick_label: "Change picture",
			remove_label: Some("Remove picture"),
		},
	)
}

pub(super) fn picture_empty(t: &Tokens, _: &SceneState) -> El {
	picture_in(
		t,
		PictureField { preview: Preview::Glyph, pick_label: "Add picture", remove_label: None },
	)
}

pub(super) fn picture_drawn(t: &Tokens, _: &SceneState) -> El {
	picture_in(
		t,
		PictureField {
			preview: Preview::Face { seed: "bot-7", hue: Some(Preset::Blue.hue()) },
			pick_label: "Add picture",
			remove_label: None,
		},
	)
}

fn picture_in(t: &Tokens, field: PictureField) -> El {
	stage(t, col().w(FIELDS_WIDTH).child(panes::profile_picture(look(t), field, ignore)))
}

const STUDIO_SPACE: MenuSpace = MenuSpace {
	id: "studio",
	name: "Studio",
	hue: Some(257.0),
	host: Some(SpaceHost::Shared),
	is_current: true,
	is_invitation: false,
	has_attention: false,
};

const SPACES: [MenuSpace; 5] = [
	STUDIO_SPACE,
	MenuSpace {
		id: "field-notes",
		name: "Field notes",
		hue: Some(296.0),
		host: None,
		is_current: false,
		..STUDIO_SPACE
	},
	MenuSpace {
		id: "northwind",
		name: "Northwind",
		hue: Some(132.0),
		host: None,
		is_current: false,
		has_attention: true,
		..STUDIO_SPACE
	},
	MenuSpace {
		id: "harbor",
		name: "Harbor",
		hue: Some(63.0),
		host: Some(SpaceHost::Down),
		is_current: false,
		..STUDIO_SPACE
	},
	MenuSpace {
		id: "atelier",
		name: "Atelier",
		hue: None,
		host: None,
		is_current: false,
		is_invitation: true,
		..STUDIO_SPACE
	},
];

const HOST_STATES: [MenuSpace; 4] = [
	STUDIO_SPACE,
	MenuSpace {
		id: "vocca",
		name: "Vocca",
		hue: Some(132.0),
		host: Some(SpaceHost::Up),
		is_current: false,
		..STUDIO_SPACE
	},
	MenuSpace {
		id: "archives",
		name: "Archives",
		hue: Some(296.0),
		host: Some(SpaceHost::Connecting),
		is_current: false,
		..STUDIO_SPACE
	},
	MenuSpace {
		id: "harbor",
		name: "Harbor",
		hue: Some(63.0),
		host: Some(SpaceHost::Down),
		is_current: false,
		..STUDIO_SPACE
	},
];

const SCREEN_PERSON: Person = Person {
	account: Some(SIGNED_IN),
	has_applications: true,
	has_diagnostics: true,
	about: Some(About { update: Update::Available { version: "0.24.0" }, ..ABOUT }),
	..ADA_SETTINGS
};

fn screen_of(
	t: &Tokens,
	person: Person,
	entry: Entry,
	spaces: &[MenuSpace],
	menu_width: f32,
	notice: Option<El>,
) -> El {
	let look = look(t);
	let items = person.items();
	let view = screen(
		look,
		Screen {
			name: person.name,
			image: None,
			items: &items,
			current: Some(entry),
			spaces,
			menu_width,
			content: person.content(look, entry, None),
		},
		ignore::<SettingsEvent>,
	);
	let layers = notice.map(notice_layer).into_iter().collect();
	staged(t, view, layers)
}

fn user_screen(t: &Tokens, entry: Entry) -> El {
	screen_of(t, SCREEN_PERSON, entry, &[], MENU_WIDTH, None)
}

pub(super) fn screen_account(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Account)
}

pub(super) fn screen_spaces(t: &Tokens, _: &SceneState) -> El {
	screen_of(t, SCREEN_PERSON, Entry::Account, &SPACES, MENU_WIDTH, None)
}

pub(super) fn screen_host_states(t: &Tokens, _: &SceneState) -> El {
	screen_of(t, SCREEN_PERSON, Entry::Account, &HOST_STATES, MENU_WIDTH, None)
}

pub(super) fn screen_after_leaving(t: &Tokens, _: &SceneState) -> El {
	let look = look(t);
	let kept: Vec<MenuSpace> =
		SPACES.iter().copied().filter(|space| space.id != "northwind").collect();
	let notice = toast(
		t,
		Toast {
			kind: ToastType::Success,
			title: &look.fill(settings::screen::space::left::TITLE, &[("name", "Northwind")]),
			description: &look
				.fill(settings::screen::space::left::DESCRIPTION, &[("host", "Sam Rivera")]),
			action: None,
		},
	);
	screen_of(t, SCREEN_PERSON, Entry::Account, &kept, MENU_WIDTH, Some(notice))
}

pub(super) fn screen_without_optional(t: &Tokens, _: &SceneState) -> El {
	screen_of(t, ADA_SETTINGS, Entry::Appearance, &[], MENU_WIDTH, None)
}

pub(super) fn screen_appearance(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Appearance)
}

pub(super) fn screen_notifications(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Notifications)
}

pub(super) fn screen_language(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Language)
}

pub(super) fn screen_skills(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Skills)
}

pub(super) fn screen_applications(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Applications)
}

pub(super) fn screen_history(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::History)
}

pub(super) fn screen_diagnostics(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::Diagnostics)
}

pub(super) fn screen_about(t: &Tokens, _: &SceneState) -> El {
	user_screen(t, Entry::About)
}

pub(super) fn screen_minimum_width(t: &Tokens, _: &SceneState) -> El {
	screen_of(t, SCREEN_PERSON, Entry::Account, &[], MINIMUM_MENU, None)
}

pub(super) fn screen_maximum_width(t: &Tokens, _: &SceneState) -> El {
	screen_of(t, SCREEN_PERSON, Entry::Account, &[], MAXIMUM_MENU, None)
}

pub(super) const DIALOG_SCENE: (f32, f32) = (DIALOG.0 + SPACING * 32.0, DIALOG.1 + SPACING * 24.0);
