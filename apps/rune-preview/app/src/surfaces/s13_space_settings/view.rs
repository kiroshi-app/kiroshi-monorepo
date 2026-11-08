use rune::{El, TextEdit, el};

use kiroshi_rune_kit::primitives::toast::{Toast, ToastType, toast};
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::{MENU_WIDTH, notice_layer};
use kiroshi_rune_kit::surfaces::s13_space_settings::{
	Blocker, Danger, Member, Members, Notice, Sharing, SpaceScreen, SpaceSettings, SpaceValue,
	Standing, Wiring, space_settings_screen, space_settings_screen_layers,
};
use kiroshi_rune_kit::tokens::Tokens;

use super::members::{self, Row};
use super::{Connection, Hosting, MembersRead, Page, State, Visit, is_shown, space_event, today};
use crate::app::App;

const WIRING: Wiring<App> = Wiring { emit: space_event, name: name_edit, email: email_edit };

const NO_ROWS: &[Row] = &[];

fn name_edit(app: &mut App) -> &mut TextEdit {
	&mut app.surfaces.s13_space_settings.name
}

fn email_edit(app: &mut App) -> &mut TextEdit {
	let settings = &mut app.surfaces.s13_space_settings;
	let visit = settings.visit.as_mut();
	if let Some(visit) =
		visit.filter(|visit| visit.refused.as_ref().and_then(members::refusal).is_some())
	{
		visit.refused = None;
	}
	&mut settings.email
}

impl State {
	fn sharing(&self, visit: &Visit) -> Sharing {
		if self.is_signed_out() {
			return Sharing::SignedOut;
		}
		match visit.hosting {
			Hosting::Unread | Hosting::Off | Hosting::Failed => Sharing::Off,
			Hosting::Connecting => Sharing::Connecting,
			Hosting::Online => Sharing::Online,
			Hosting::NeedsSignIn => Sharing::SignedOut,
		}
	}

	fn host_name(&self, joined_id: &str) -> &str {
		let joined = self.joined.iter().find(|joined| joined.id == joined_id);
		joined.map_or("", |joined| joined.hosted_by.as_deref().unwrap_or(&joined.host_url))
	}

	fn standing<'a>(&'a self, visit: &'a Visit) -> Standing<'a> {
		match &visit.page {
			Page::Own(_) => Standing::Yours {
				shared: matches!(self.sharing(visit), Sharing::Connecting | Sharing::Online),
			},
			Page::Joined(id) => Standing::Joined {
				host_name: self.host_name(id),
				connected: visit.connection == Some(Connection::Connected),
				connecting: visit.connection == Some(Connection::Connecting),
			},
			Page::Invitation(invitation) => Standing::Invitation {
				host_email: &invitation.inviter_email,
				expires: members::date_of(&invitation.expires_at),
			},
		}
	}
}

fn rows(visit: &Visit) -> &[Row] {
	match &visit.members {
		MembersRead::Read(rows) => rows,
		MembersRead::Unread | MembersRead::Reading | MembersRead::Failed => NO_ROWS,
	}
}

fn is_loading(visit: &Visit) -> bool {
	match visit.members {
		MembersRead::Reading => true,
		MembersRead::Unread => matches!(visit.hosting, Hosting::Unread | Hosting::Online),
		MembersRead::Read(_) | MembersRead::Failed => false,
	}
}

fn members_of<'a>(
	settings: &'a State,
	visit: &'a Visit,
	space: &'a str,
	listed: &'a [Member<'a>],
	today: i64,
) -> Members<'a> {
	let removing =
		visit.removing.as_deref().and_then(|id| listed.iter().find(|member| member.id == id));
	Members {
		space,
		members: listed,
		loading: is_loading(visit),
		email: &settings.email,
		refusal: visit.refused.as_ref().and_then(members::refusal),
		failure: visit.refused.as_ref().and_then(|refused| members::failure(refused, today)),
		hosted: visit.hosting == Hosting::Online,
		blocked_by: settings.is_signed_out().then_some(Blocker::SignedOut),
		viewer: None,
		removing: removing.copied(),
		inviting_again: visit.inviting_again.as_deref(),
	}
}

fn danger_of(settings: &State, page: &Page) -> Danger {
	match page {
		Page::Joined(_) => Danger::Leave,
		Page::Own(_) | Page::Invitation(_) => Danger::Delete { deletable: settings.is_deletable() },
	}
}

pub(super) fn with_screen<R>(app: &App, draw: impl FnOnce(&SpaceScreen) -> R) -> Option<R> {
	let settings = &app.surfaces.s13_space_settings;
	let visit = settings.visit.as_ref()?;
	let today = today();
	let name = settings.shown_name();
	let listed: Vec<Member> =
		rows(visit).iter().map(|row| members::member_of(row, today)).collect();
	let is_own = matches!(visit.page, Page::Own(_));
	let is_joined = matches!(visit.page, Page::Joined(_));
	let joined_host = match &visit.page {
		Page::Joined(id) => Some(settings.host_name(id)),
		Page::Own(_) | Page::Invitation(_) => None,
	};
	let screen = SpaceScreen {
		settings: SpaceSettings {
			value: SpaceValue { name: &name, colour: visit.colour },
			name: &settings.name,
			joined_host,
			transfer: false,
			danger: danger_of(settings, &visit.page),
			members: is_own.then(|| members_of(settings, visit, &name, &listed, today)),
			sharing: is_own.then(|| settings.sharing(visit)),
			agents: None,
			entry: visit.entry,
			asking: is_own && visit.is_asking,
			notices: settings.notices.iter().map(|(_, notice)| notice.clone()).collect(),
		},
		standing: settings.standing(visit),
		rank: None,
		menu_width: MENU_WIDTH,
		session_unavailable: false,
		leaving: is_joined && visit.is_asking,
	};
	Some(draw(&screen))
}

pub fn view(app: &App, t: &Tokens) -> El {
	with_screen(app, |screen| space_settings_screen(t, screen, WIRING)).unwrap_or_else(el)
}

fn notice_view(t: &Tokens, notice: &Notice) -> El {
	let kind = if notice.failed { ToastType::Error } else { ToastType::Success };
	let content =
		Toast { kind, title: &notice.title, description: &notice.description, action: None };
	notice_layer(toast(t, content))
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	if is_shown(app) {
		return with_screen(app, |screen| space_settings_screen_layers(t, screen, WIRING))
			.unwrap_or_default();
	}
	let notices = &app.surfaces.s13_space_settings.notices;
	notices.last().map(|(_, notice)| notice_view(t, notice)).into_iter().collect()
}
