use kiroshi_core::applications::contract::{Application, Install};
use rune::{El, TextEdit, col, row};

use kiroshi_rune_kit::primitives::toast::{Toast, ToastType, toast};
use kiroshi_rune_kit::strings::{Language, bots, chat};
use kiroshi_rune_kit::surfaces::s11_applications::catalogue::{
	Catalogue as CataloguePage, CatalogueApplication, CatalogueEvent, PAGE_INSET, RAIL_WIDTH,
	Setup, catalogue,
};
use kiroshi_rune_kit::surfaces::s11_applications::install::{
	InstallEvent, InstallPage, Installable, KeyField, install_page,
};
use kiroshi_rune_kit::surfaces::s11_applications::mark::Mark;
use kiroshi_rune_kit::surfaces::s11_applications::panel::{
	Application as PanelApplication, Applications, ApplicationsEvent, Owner, applications,
};
use kiroshi_rune_kit::surfaces::s11_applications::search::SEARCH_HEIGHT;
use kiroshi_rune_kit::surfaces::s11_applications::secrets::{
	Scope as SecretScope, SecretField, SecretRemoval, SecretWrite, Secrets as SecretsPanel,
	SecretsDialog, SecretsEvent, secrets, secrets_dialog,
};
use kiroshi_rune_kit::surfaces::s11_applications::{
	PANEL_GAP, fill, say, skeleton_bar, skeleton_list,
};
use kiroshi_rune_kit::surfaces::s12_person_settings::shell::notice_layer;
use kiroshi_rune_kit::tokens::Tokens;

use super::catalogue::{Catalogue, InstallFailure};
use super::secrets::Dialog;
use super::{Notice, Scope, State, Which, state};
use crate::app::App;
use crate::navigation::Route;

fn owner_of(scope: &Scope) -> Owner<'_> {
	match scope.which {
		Which::Agent => Owner::Agent(&scope.name),
		Which::Space => Owner::Space(&scope.name),
		Which::Person => Owner::Profile,
	}
}

fn secret_scope_of(which: Which) -> SecretScope {
	match which {
		Which::Agent => SecretScope::Agent,
		Which::Space => SecretScope::Space,
		Which::Person => SecretScope::User,
	}
}

fn setup_of(application: &Application) -> Setup {
	match application.install {
		Install::Nothing => Setup::Nothing,
		Install::Key { .. } => Setup::ApiKey,
		Install::Oauth => Setup::SignIn,
		Install::Refused(_) => Setup::Unavailable,
	}
}

fn described(application: &Application) -> Option<&str> {
	Some(application.description.as_str()).filter(|description| !description.trim().is_empty())
}

fn flushed(app: &mut App, act: impl FnOnce(&mut State)) {
	let applications = state(app);
	act(applications);
	applications.flush();
}

fn emit_agent(app: &mut App, event: ApplicationsEvent) {
	flushed(app, |applications| applications.applications_event(Which::Agent, event));
}

fn emit_space(app: &mut App, event: ApplicationsEvent) {
	flushed(app, |applications| applications.applications_event(Which::Space, event));
}

fn emit_person(app: &mut App, event: ApplicationsEvent) {
	flushed(app, |applications| applications.applications_event(Which::Person, event));
}

fn emit_agent_secrets(app: &mut App, event: SecretsEvent) {
	flushed(app, |applications| applications.secrets_event(Which::Agent, event));
}

fn emit_space_secrets(app: &mut App, event: SecretsEvent) {
	flushed(app, |applications| applications.secrets_event(Which::Space, event));
}

fn emit_person_secrets(app: &mut App, event: SecretsEvent) {
	flushed(app, |applications| applications.secrets_event(Which::Person, event));
}

fn emit_dialog(app: &mut App, event: SecretsEvent) {
	let Some(which) = state(app).dialog.as_ref().map(|(which, _)| *which) else { return };
	flushed(app, |applications| applications.secrets_event(which, event));
}

fn emit_catalogue(app: &mut App, event: CatalogueEvent) {
	flushed(app, |applications| applications.catalogue_event(event));
}

fn emit_install(app: &mut App, event: InstallEvent) {
	flushed(app, |applications| applications.install_event(event));
}

fn panel_emit(which: Which) -> fn(&mut App, ApplicationsEvent) {
	match which {
		Which::Agent => emit_agent,
		Which::Space => emit_space,
		Which::Person => emit_person,
	}
}

fn secrets_emit(which: Which) -> fn(&mut App, SecretsEvent) {
	match which {
		Which::Agent => emit_agent_secrets,
		Which::Space => emit_space_secrets,
		Which::Person => emit_person_secrets,
	}
}

fn panel_query(app: &mut App, which: Which) -> &mut TextEdit {
	let applications = state(app);
	match applications.scopes.iter_mut().find(|scope| scope.which == which) {
		Some(scope) => &mut scope.installed.query,
		None => &mut applications.spare,
	}
}

fn catalogue_query(app: &mut App) -> &mut TextEdit {
	let applications = state(app);
	applications.wake();
	match applications.catalogue.as_mut() {
		Some(catalogue) => &mut catalogue.query,
		None => &mut applications.spare,
	}
}

fn key_field(app: &mut App, index: usize) -> &mut TextEdit {
	let applications = state(app);
	match applications.catalogue.as_mut() {
		Some(catalogue) => catalogue.key_mut(index),
		None => &mut applications.spare,
	}
}

fn secret_field(app: &mut App, field: SecretField) -> &mut TextEdit {
	let applications = state(app);
	match (applications.dialog.as_mut(), field) {
		(Some((_, Dialog::Write(write))), SecretField::Name) => &mut write.name,
		(Some((_, Dialog::Write(write))), SecretField::Value) => &mut write.value,
		_ => &mut applications.spare,
	}
}

fn panel_view(t: &Tokens, applications_state: &State, scope: &Scope, language: Language) -> El {
	let installed = &scope.installed;
	if installed.is_loading() {
		return skeleton_list(t, PANEL_GAP, |_| skeleton_bar(t, RAIL_WIDTH, SEARCH_HEIGHT, false));
	}
	let curated =
		applications_state.catalogue.as_ref().map(|catalogue| catalogue.curated.as_slice());
	let connecting = applications_state
		.connecting
		.as_ref()
		.filter(|(which, _)| *which == scope.which)
		.map(|(_, name)| name.as_str());
	let failure = applications_state
		.connect_failure
		.as_ref()
		.filter(|(which, _)| *which == scope.which)
		.map(|(_, failure)| failure);
	let rows = installed.rows(curated.unwrap_or_default(), connecting, failure);
	let shown: Vec<PanelApplication> = rows
		.iter()
		.map(|row| PanelApplication {
			name: &row.name,
			display_name: row.display_name.as_deref(),
			mark: Mark::Absent,
			connection: row.connection,
			reason: row.reason.clone(),
		})
		.collect();
	let panel = Applications {
		owner: owner_of(scope),
		applications: &shown,
		query: &installed.query,
		has_failed_to_load: installed.has_failed(),
		can_connect: true,
		language,
	};
	let which = scope.which;
	applications(t, &panel, move |app: &mut App| panel_query(app, which), panel_emit(which))
}

fn secrets_panel<'a>(
	scope: &Scope,
	entries: &'a [kiroshi_rune_kit::surfaces::s11_applications::secrets::Secret],
	dialog: Option<SecretsDialog<'a>>,
	language: Language,
) -> SecretsPanel<'a> {
	SecretsPanel {
		scope: secret_scope_of(scope.which),
		entries,
		is_pending: scope.secrets.is_pending(),
		has_failed_to_read: scope.secrets.has_failed(),
		dialog,
		language,
	}
}

fn scope_column(t: &Tokens, applications_state: &State, scope: &Scope, language: Language) -> El {
	let entries = scope.secrets.rows();
	let panel = secrets_panel(scope, &entries, None, language);
	col()
		.grow(1.0)
		.min_w(0.0)
		.h_full()
		.gap(PANEL_GAP)
		.child(col().grow(1.0).min_h(0.0).w_full().child(panel_view(
			t,
			applications_state,
			scope,
			language,
		)))
		.child(col().grow(1.0).min_h(0.0).w_full().child(secrets(
			t,
			&panel,
			secrets_emit(scope.which),
		)))
}

fn failure_text(failure: &InstallFailure, language: Language) -> String {
	use bots::applications::install;
	let reason = match failure {
		InstallFailure::Refused(reason) => reason.clone(),
		InstallFailure::Missing(fields) => {
			fill(install::MISSING, language, &[("fields", fields.join(", ").as_str())])
		}
	};
	fill(install::FAILED, language, &[("reason", reason.as_str())])
}

fn install_view(
	t: &Tokens,
	catalogue_state: &Catalogue,
	scope: &Scope,
	application: &Application,
	language: Language,
) -> El {
	let picked = catalogue_state.picked.as_ref();
	let keys = picked.map(|picked| picked.keys.as_slice()).unwrap_or_default();
	let revealed = picked.map(|picked| picked.revealed.as_slice()).unwrap_or_default();
	let fields: Vec<KeyField> = match &application.install {
		Install::Key { fields } => fields
			.iter()
			.zip(keys)
			.enumerate()
			.map(|(index, (field, value))| KeyField {
				name: &field.name,
				description: field.description.as_deref(),
				is_concealed: field.concealed,
				is_revealed: revealed.get(index).copied().unwrap_or(false),
				value,
			})
			.collect(),
		Install::Nothing | Install::Oauth | Install::Refused(_) => Vec::new(),
	};
	let tools: Option<Vec<&str>> =
		application.tools.as_ref().map(|tools| tools.iter().map(String::as_str).collect());
	let refusal = match &application.install {
		Install::Refused(refusal) => Some(refusal.reason.as_str()),
		_ => None,
	};
	let installable = Installable {
		id: &application.name,
		name: &application.title,
		description: described(application),
		package_identity: &application.name,
		setup: setup_of(application),
		mark: Mark::Absent,
		source: None,
		use_count: application.use_count,
		is_verified: application.verified.unwrap_or(false),
		host: application.hosted_by.as_deref(),
		tools: tools.as_deref(),
		fields: &fields,
		refusal,
	};
	let failure = catalogue_state.failure.as_ref().map(|failure| failure_text(failure, language));
	let page = InstallPage {
		category: catalogue_state.category,
		application: &installable,
		owner: owner_of(scope),
		is_installing: catalogue_state.installing.as_deref() == Some(application.name.as_str()),
		is_installed: scope.installed.declares(&application.name),
		failure: failure.as_deref(),
		language,
	};
	install_page(t, &page, key_field, emit_install)
}

fn catalogue_view(
	t: &Tokens,
	applications_state: &State,
	catalogue_state: &Catalogue,
	language: Language,
) -> El {
	let scope = applications_state.scope(catalogue_state.which);
	if let (Some(scope), Some(application)) = (scope, catalogue_state.picked_application()) {
		return install_view(t, catalogue_state, scope, application, language);
	}
	let declared = applications_state.declared(catalogue_state.which);
	let visible = catalogue_state.visible(&declared);
	let cards: Vec<CatalogueApplication> = visible
		.iter()
		.map(|application| CatalogueApplication {
			id: &application.name,
			name: &application.title,
			description: described(application),
			setup: setup_of(application),
			mark: Mark::Absent,
		})
		.collect();
	let page = CataloguePage {
		category: catalogue_state.category,
		query: &catalogue_state.query,
		applications: &cards,
		is_loading: catalogue_state.is_loading(),
		has_failed: catalogue_state.has_failed(),
		has_partly_failed: catalogue_state.has_partly_failed,
		is_stale: catalogue_state.is_stale,
		language,
	};
	catalogue(t, &page, catalogue_query, emit_catalogue)
}

pub fn view(app: &App, t: &Tokens) -> El {
	let applications_state = &app.surfaces.s11_applications;
	let language = app.surfaces.s12_person_settings.language();
	if let Some(catalogue_state) = applications_state.catalogue.as_ref() {
		return catalogue_view(t, applications_state, catalogue_state, language);
	}
	row().w_full().h_full().gap(PANEL_GAP).padding(PAGE_INSET).children(
		applications_state
			.scopes
			.iter()
			.map(|scope| scope_column(t, applications_state, scope, language)),
	)
}

fn notice_copy(notice: &Notice, language: Language) -> (String, String) {
	use bots::applications::{catalogue, install};
	match notice {
		Notice::Failed => (say(chat::screen::notice::FAILED, language).to_owned(), String::new()),
		Notice::CatalogueUnavailable => {
			(say(catalogue::UNAVAILABLE, language).to_owned(), String::new())
		}
		Notice::Unrefreshed => (
			say(catalogue::unrefreshed::TITLE, language).to_owned(),
			say(catalogue::unrefreshed::DESCRIPTION, language).to_owned(),
		),
		Notice::RolledBack { name, reason } => (
			fill(install::rollback::TITLE, language, &[("name", name.as_str())]),
			fill(install::rollback::DESCRIPTION, language, &[("reason", reason.as_str())]),
		),
	}
}

fn dialog_layer(t: &Tokens, applications_state: &State, language: Language) -> Option<El> {
	let (which, dialog) = applications_state.dialog.as_ref()?;
	let scope = applications_state.scope(*which)?;
	let shown = match dialog {
		Dialog::Write(write) => SecretsDialog::Write(SecretWrite {
			replacing: write.replacing.as_deref(),
			name: &write.name,
			value: &write.value,
			is_refused: write.is_refused,
			has_failed: write.has_failed,
			is_writing: write.is_writing,
		}),
		Dialog::Remove(removal) => SecretsDialog::Remove(SecretRemoval {
			name: &removal.name,
			has_failed: removal.has_failed,
			is_removing: removal.is_removing,
		}),
	};
	let panel = secrets_panel(scope, &[], Some(shown), language);
	secrets_dialog(t, &panel, secret_field, emit_dialog)
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	if app.navigation.main_route() != Route::Applications {
		return Vec::new();
	}
	let applications_state = &app.surfaces.s11_applications;
	let language = app.surfaces.s12_person_settings.language();
	let mut layers: Vec<El> = dialog_layer(t, applications_state, language).into_iter().collect();
	if let Some((_, notice)) = applications_state.notice.as_ref() {
		let (title, description) = notice_copy(notice, language);
		let content = Toast {
			kind: ToastType::Error,
			title: &title,
			description: &description,
			action: None,
		};
		layers.push(notice_layer(toast(t, content)));
	}
	layers
}
