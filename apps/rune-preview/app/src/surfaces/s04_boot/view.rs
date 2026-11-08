use kiroshi_core::account::contract::AccountPlan;
use rune::{El, TextEdit};

use kiroshi_rune_kit::strings::{chat, common};
use kiroshi_rune_kit::surfaces::s04_boot::account::{AccountState, Plan, account_screen};
use kiroshi_rune_kit::surfaces::s04_boot::boot::{BootFailure, boot_notice, boot_screen};
use kiroshi_rune_kit::surfaces::s04_boot::connect::{
	ClaudeAccount, Connect, Entry, connect_screen,
};
use kiroshi_rune_kit::surfaces::s04_boot::import::{Import, ImportItem, import_screen};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{RaisedNotice, notice_surface};
use kiroshi_rune_kit::surfaces::s04_boot::welcome::{Welcome, welcome_screen};
use kiroshi_rune_kit::surfaces::s04_boot::{Frame, onboarding_shell};
use kiroshi_rune_kit::tokens::Tokens;

use super::calls::KiroshiAccount;
use super::connect::{Connection, initials_of};
use super::import::Inventory;
use super::{
	LANGUAGE, State, Step, account_event, boot_failure, boot_retried, connect_event, import_event,
	notice_event, welcome_event,
};
use crate::app::App;

pub fn view(step: Step, app: &App, t: &Tokens) -> El {
	let onboarding = &app.surfaces.s04_boot;
	match step {
		Step::Boot => boot(app, t),
		Step::Welcome(page) => {
			welcome_screen(t, &Welcome::new(page, LANGUAGE, None), welcome_event)
		}
		Step::Connect => connect(onboarding, t),
		Step::Import => import(onboarding, t),
		Step::Account => account(onboarding, t),
	}
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	let raised = app.surfaces.s04_boot.notices.raised();
	if raised.is_empty() {
		return Vec::new();
	}
	let retry = chat::notice::RETRY.text(LANGUAGE);
	let shown: Vec<RaisedNotice> = raised
		.iter()
		.map(|held| RaisedNotice {
			kind: held.kind,
			title: &held.title,
			description: held.description.as_deref(),
			action: held.retry.as_ref().map(|_| retry),
			space_hue: None,
			report: None,
		})
		.collect();
	vec![notice_surface(t, LANGUAGE, &shown, notice_event)]
}

fn waiting(t: &Tokens) -> El {
	onboarding_shell(t, Frame::WELCOME, Vec::new(), Vec::new())
}

fn boot(app: &App, t: &Tokens) -> El {
	let Some(failure) = boot_failure(app) else {
		return boot_screen(t, LANGUAGE, app.clock_ms);
	};
	let description = format!("{}: {}", failure.title(), failure.detail());
	let failure = BootFailure {
		title: common::spaces::unavailable::TITLE.text(LANGUAGE),
		description: &description,
	};
	boot_notice(t, LANGUAGE, &failure, boot_retried)
}

fn code_edit(app: &mut App) -> &mut TextEdit {
	&mut app.surfaces.s04_boot.sign_in.code
}

fn key_edit(app: &mut App) -> &mut TextEdit {
	&mut app.surfaces.s04_boot.sign_in.api_key
}

fn connect(onboarding: &State, t: &Tokens) -> El {
	let sign_in = &onboarding.sign_in;
	let Some(step) = sign_in.step() else { return waiting(t) };
	let found = match &sign_in.connection {
		Some(Connection::Detected { email, plan: Some(plan) }) => Some((email, plan)),
		_ => None,
	};
	let initials = found.map(|(email, _)| initials_of(email)).unwrap_or_default();
	let account = found.map(|(email, plan)| ClaudeAccount { email, initials: &initials, plan });
	let screen = Connect {
		step,
		language: LANGUAGE,
		hue: None,
		account,
		method: sign_in.method,
		code: Entry { edit: &sign_in.code, access: code_edit },
		api_key: Entry { edit: &sign_in.api_key, access: key_edit },
	};
	connect_screen(t, &screen, connect_event)
}

fn import(onboarding: &State, t: &Tokens) -> El {
	if matches!(onboarding.import.inventory, Inventory::Reading) {
		return waiting(t);
	}
	let shown = onboarding.import.shown(LANGUAGE);
	let items: Vec<ImportItem> = shown
		.rows
		.iter()
		.map(|row| ImportItem {
			kind: row.kind,
			title: &row.title,
			detail: &row.detail,
			hue: None,
			checked: row.checked,
			in_kiroshi: row.in_kiroshi,
			status: row.status,
		})
		.collect();
	let screen = Import {
		step: shown.step,
		language: LANGUAGE,
		hue: None,
		title: &shown.title,
		subtitle: shown.subtitle.as_deref(),
		items: &items,
		primary: &shown.primary,
		secondary: shown.secondary.as_deref(),
	};
	import_screen(t, &screen, import_event)
}

fn plan_of(plan: AccountPlan) -> Plan {
	match plan {
		AccountPlan::Free => Plan::Free,
		AccountPlan::Pro => Plan::Pro,
	}
}

fn account(onboarding: &State, t: &Tokens) -> El {
	let reader = onboarding.preferences.as_ref().map(|held| held.display_name.as_str());
	let state = match &onboarding.account {
		Some(KiroshiAccount::Waiting { .. }) => AccountState::Waiting,
		Some(KiroshiAccount::SignedIn { email, plan }) => AccountState::SignedIn {
			name: reader.filter(|name| !name.is_empty()).unwrap_or(email),
			email,
			plan: plan.map(plan_of),
		},
		Some(KiroshiAccount::SignedOut) | None => AccountState::SignedOut,
	};
	account_screen(t, LANGUAGE, None, &state, account_event)
}
