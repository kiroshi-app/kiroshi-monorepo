use rune::{El, Icon, TextEdit, el};

use kiroshi_rune_kit::icons;
use kiroshi_rune_kit::primitives::dialog::scrim;
use kiroshi_rune_kit::primitives::toast::{Toast, toast};
use kiroshi_rune_kit::strings::search as copy;
use kiroshi_rune_kit::surfaces::s12_person_settings::panes::{
	self, About, Device, Devices, Update,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::search::{
	Bot, Hit, Identity, PALETTE_TOP, Palette, RestingGroup, ResultGroup, SearchEvent, TitlePart,
	palette,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::{
	Entry, MENU_WIDTH, MenuSpace, RailItem, Screen, notice_layer, screen,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::{Look, SettingsEvent};
use kiroshi_rune_kit::tokens::Tokens;

use super::about::{self as updater};
use super::account::{DeviceRead, panel_of, shown_kind};
use super::hits::{self, Face, Group, Part, Row};
use super::preferences::Shown;
use super::{Notice, State, close_search, current_entry, lookups_of, search_event, settings_event};
use crate::app::App;
use crate::navigation::Route;

const RAIL: [Entry; 8] = [
	Entry::Account,
	Entry::Appearance,
	Entry::Notifications,
	Entry::Language,
	Entry::Skills,
	Entry::Applications,
	Entry::History,
	Entry::Diagnostics,
];

const UNITS: [(&str, i64); 7] = [
	("year", 31_536_000_000),
	("month", 2_592_000_000),
	("week", 604_800_000),
	("day", 86_400_000),
	("hour", 3_600_000),
	("minute", 60_000),
	("second", 1_000),
];

fn relative_time(at: i64, now: i64) -> String {
	let elapsed = now.saturating_sub(at);
	let Some((unit, span)) = UNITS.iter().find(|(_, span)| elapsed.abs() >= *span) else {
		return "now".to_owned();
	};
	let count = elapsed.abs() / span;
	let plural = if count == 1 { "" } else { "s" };
	if elapsed < 0 {
		return format!("in {count} {unit}{plural}");
	}
	format!("{count} {unit}{plural} ago")
}

fn emit(app: &mut App, event: SettingsEvent) {
	settings_event(app, event);
}

fn emit_search(app: &mut App, event: SearchEvent) {
	search_event(app, event);
}

fn query_edit(app: &mut App) -> &mut TextEdit {
	let settings = &mut app.surfaces.s12_person_settings;
	settings.wake();
	&mut settings.edit
}

impl State {
	pub(super) fn rail_items(&self) -> Vec<RailItem> {
		let plain = |entry| RailItem { entry, has_indicator: false };
		let mut items: Vec<RailItem> = RAIL.into_iter().map(plain).collect();
		if self.version.is_some() {
			let has_indicator = self.updater.shown().is_pending();
			items.push(RailItem { entry: Entry::About, has_indicator });
		}
		items
	}
}

fn update_of<'a>(shown: &'a updater::Shown, checked: &'a str) -> Update<'a> {
	match shown {
		updater::Shown::UpToDate { .. } => Update::UpToDate { checked },
		updater::Shown::Checking => Update::Checking,
		updater::Shown::Available { version } => Update::Available { version },
		updater::Shown::Downloading { version, progress } => {
			Update::Downloading { version, progress: *progress }
		}
		updater::Shown::Ready { version, running } => Update::Ready { version, running: *running },
		updater::Shown::Failed { version } => Update::Failed { version },
	}
}

fn about_pane(app: &App, look: Look, version: &str, shown: &Shown) -> El {
	let settings = &app.surfaces.s12_person_settings;
	let update = settings.updater.shown();
	let checked = match update {
		updater::Shown::UpToDate { checked_at } => relative_time(checked_at, super::now_ms()),
		_ => String::new(),
	};
	let about = About {
		version,
		channel: shown.channel,
		update: update_of(&update, &checked),
		shows_whats_new: shown.shows_whats_new,
		getting_started: Some(super::can_import(app)),
	};
	panes::about(look, about, emit)
}

fn device_of(device: &DeviceRead) -> Device<'_> {
	Device {
		id: &device.id,
		kind: shown_kind(device.kind),
		name: device.name.as_deref().unwrap_or_default(),
		activity: None,
	}
}

fn account_pane(settings: &State, look: Look, shown: &Shown) -> El {
	let Some(watched) = settings.account.watched.as_ref() else {
		return panes::account(look, panes::Account::SignedOut, true, None, None, emit);
	};
	let listed = settings.devices.listed();
	let current = listed.iter().find(|device| device.current);
	let others: Vec<Device> =
		listed.iter().filter(|device| !device.current).map(device_of).collect();
	let is_pending =
		matches!(settings.devices.read, super::DevicesRead::Unread | super::DevicesRead::Reading);
	let fallback = Device { id: "", kind: panes::DeviceKind::Laptop, name: "", activity: None };
	let devices = settings.account.email().and_then(|email| {
		let is_failed = matches!(settings.devices.read, super::DevicesRead::Failed);
		if is_failed || (!is_pending && current.is_none()) {
			return None;
		}
		Some(Devices {
			email,
			this_device: current.map_or(fallback, device_of),
			others: &others,
			is_pending,
			confirming: settings.devices.confirming.as_deref(),
			removal: settings.devices.status_of_confirming(),
		})
	});
	panes::account(look, panel_of(watched, &shown.name), false, None, devices, emit)
}

fn content(app: &App, look: Look, entry: Entry, shown: &Shown) -> El {
	let settings = &app.surfaces.s12_person_settings;
	match entry {
		Entry::Account => account_pane(settings, look, shown),
		Entry::Appearance => panes::appearance(look, shown.scheme, emit),
		Entry::Notifications => panes::notifications(look, shown.notifications, emit),
		Entry::Language => panes::language(look, shown.language, emit),
		Entry::Diagnostics => panes::diagnostics(look, emit),
		Entry::About => match settings.version.as_deref() {
			Some(version) => about_pane(app, look, version, shown),
			None => el(),
		},
		Entry::Skills | Entry::Applications | Entry::History => el(),
	}
}

fn menu_space<'a>(app: &App, space: &'a crate::model::Space) -> MenuSpace<'a> {
	let current = app.ready().map(|ready| ready.space.id.as_str());
	MenuSpace {
		id: &space.id,
		name: &space.name,
		hue: space.colour,
		host: None,
		is_current: current == Some(space.id.as_str()),
		is_invitation: false,
		has_attention: false,
	}
}

pub fn view(app: &App, t: &Tokens) -> El {
	let settings = &app.surfaces.s12_person_settings;
	let look = Look { t, lang: settings.language() };
	let shown = settings.preferences.shown();
	let entry = current_entry(app);
	let items = settings.rail_items();
	let spaces: Vec<MenuSpace> =
		settings.spaces.iter().map(|space| menu_space(app, space)).collect();
	let content = content(app, look, entry, &shown);
	let shell = Screen {
		name: &shown.name,
		image: None,
		items: &items,
		current: Some(entry),
		spaces: &spaces,
		menu_width: MENU_WIDTH,
		content,
	};
	screen(look, shell, emit)
}

fn notice_view(t: &Tokens, notice: &Notice) -> El {
	let content = Toast {
		kind: notice.kind,
		title: &notice.title,
		description: &notice.description,
		action: None,
	};
	notice_layer(toast(t, content))
}

fn platform_mark(platform: &str) -> &'static Icon {
	match platform.trim().to_lowercase().as_str() {
		"github" => &icons::GITHUB,
		"linear" => &icons::LINEAR,
		_ => &icons::BOOKMARK,
	}
}

fn bot_of<'a>(app: &App, bot_id: &'a str) -> Bot<'a> {
	Bot { seed: bot_id, hue: app.agent_hue(bot_id) }
}

fn conversation_hue(app: &App, conversation_id: &str) -> Option<f32> {
	let ready = app.ready()?;
	ready.conversations.iter().find(|conversation| conversation.id == conversation_id)?.color
}

fn identity_of<'a>(app: &App, face: &'a Face, reader: &'a str) -> Identity<'a> {
	match face {
		Face::Message(bot_id) => Identity::Message(bot_of(app, bot_id)),
		Face::FromYou => Identity::MessageFromYou { reader, image: None },
		Face::Group(conversation_id) => Identity::ChatGroup {
			hue: conversation_hue(app, conversation_id),
			pictogram: &icons::MESSAGE,
		},
		Face::Solo(bot_id) => Identity::ChatSolo(bot_of(app, bot_id)),
		Face::Mission { bot_id, badge, platform } => Identity::Mission {
			bot: bot_of(app, bot_id),
			badge: *badge,
			mark: platform_mark(platform),
		},
		Face::Routine(bot_id) => Identity::Routine(bot_of(app, bot_id)),
	}
}

fn hit_of<'a>(app: &App, look: Look, row: &'a Row, reader: &'a str) -> Hit<'a> {
	Hit {
		id: &row.id,
		identity: identity_of(app, &row.face, reader),
		title: row
			.title
			.iter()
			.map(|(text, is_match)| TitlePart { text, is_match: *is_match })
			.collect(),
		timestamp: &row.timestamp,
		parts: row
			.parts
			.iter()
			.map(|part| match part {
				Part::Solo => look.say(copy::SOLO),
				Part::Said(text) => text.as_str(),
			})
			.collect(),
		identifier: row.identifier.as_deref(),
	}
}

fn search_layers(app: &App, t: &Tokens) -> Vec<El> {
	let settings = &app.surfaces.s12_person_settings;
	let (Some(search), Some(lookups), Some(ready)) =
		(settings.search.as_ref(), lookups_of(app), app.ready())
	else {
		return Vec::new();
	};
	let look = Look { t, lang: settings.language() };
	let found: Vec<Group> =
		hits::found_groups(&search.read, &search.recents, search.query(), &lookups);
	let resting: Vec<Group> = hits::resting_groups(&search.read, &search.recents, &lookups);
	let reader = lookups.reader.as_str();
	let results: Vec<ResultGroup> = found
		.iter()
		.map(|group| ResultGroup {
			kind: group.kind,
			total: group.rows.len(),
			hits: group.rows.iter().map(|row| hit_of(app, look, row, reader)).collect(),
		})
		.collect();
	let resting_groups: Vec<RestingGroup> = resting
		.iter()
		.map(|group| RestingGroup {
			kind: group.kind,
			hits: group.rows.iter().map(|row| hit_of(app, look, row, reader)).collect(),
		})
		.collect();
	let shown_groups = if search.query().is_empty() { &resting } else { &found };
	let visible = hits::visible(search.tab, shown_groups);
	let active = visible.get(search.active_index()).map(|row| row.id.as_str());
	let palette_view = palette(
		look,
		&Palette {
			query: &settings.edit,
			tab: search.tab,
			space: &ready.space.name,
			results: &results,
			resting: &resting_groups,
			is_loading: search.is_loading(),
			active,
		},
		query_edit,
		emit_search,
	);
	let layer = el()
		.absolute(0.0, 0.0)
		.w_full()
		.h_full()
		.items_center()
		.pt(PALETTE_TOP)
		.modal(true, close_search)
		.child(palette_view);
	vec![scrim(t), layer]
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let settings = &app.surfaces.s12_person_settings;
	let look = Look { t, lang: settings.language() };
	let is_settings = app.navigation.main_route() == Route::PersonSettings;
	let mut layers = Vec::new();
	if is_settings && settings.is_clearing_log {
		layers.extend(panes::clear_log_confirm(look, emit));
	}
	layers.extend(search_layers(app, t));
	let has_failed_search = settings.search.as_ref().is_some_and(|search| search.has_failed);
	if let Some((_, notice)) = settings.notice.as_ref().filter(|_| is_settings || has_failed_search)
	{
		layers.push(notice_view(t, notice));
	}
	layers
}
