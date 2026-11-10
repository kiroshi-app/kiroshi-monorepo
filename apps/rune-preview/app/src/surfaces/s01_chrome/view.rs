use rune::{El, el};
use rune_kit::{Kit, ToastRegion};

use kiroshi_rune_kit::icons;
use kiroshi_rune_kit::primitives::toast::{Toast, ToastType, toast};
use kiroshi_rune_kit::strings::common::title_bar::NEW_TAB;
use kiroshi_rune_kit::surfaces::s01_chrome::{
	ChromeTab, DockTarget, Landing, TabMenu, TitleBar, drag_ghost, tab_menu, title_bar,
};
use kiroshi_rune_kit::tokens::Tokens;

use super::{Failure, LANGUAGE, Menu, State, on_chrome};
use crate::app::App;
use crate::navigation::MAIN_WINDOW;

pub struct Measured {
	pub width: f32,
	pub lifted_tab: Option<[f32; 4]>,
}

pub fn view(s: &App, k: &Kit, t: &Tokens, measured: &Measured) -> (El, Vec<El>) {
	let state = &s.surfaces.s01_chrome;
	let Some(tabs) = state.tabs_of(MAIN_WINDOW) else { return (el(), Vec::new()) };
	let title = NEW_TAB.text(LANGUAGE);
	let shown: Vec<ChromeTab> = tabs
		.tabs()
		.iter()
		.map(|tab| ChromeTab {
			is_pinned: tab.is_pinned,
			..ChromeTab::new(&tab.id, title, &icons::CONVERSATIONS)
		})
		.collect();
	let bar = TitleBar {
		width: measured.width,
		language: LANGUAGE,
		tabs: &shown,
		active: Some(tabs.active()),
		can_go_back: false,
		can_go_forward: false,
		can_reorder: true,
		traffic_lights: cfg!(target_os = "macos"),
		window_controls: None,
		lift: state.lift.as_ref(),
		revealed_close: state.revealed_close.as_deref(),
		incoming: None,
		overflow_open: state.menu == Some(Menu::Overflow),
	};
	let menu = state.menu.as_ref().and_then(|menu| {
		let shown_menu = match menu {
			Menu::Tab { id, at } => {
				TabMenu::Tab { id, at: *at, has_closed_tab: tabs.has_closed_tab() }
			}
			Menu::Overflow => TabMenu::Overflow,
		};
		tab_menu(t, &bar, shown_menu, on_chrome)
	});
	let layers = [menu, ghost(state, t, &shown, measured), failure(state, k, t)];
	(title_bar(t, &bar, on_chrome), layers.into_iter().flatten().collect())
}

fn ghost(state: &State, t: &Tokens, shown: &[ChromeTab], measured: &Measured) -> Option<El> {
	let lift = state.lift.as_ref().filter(|lift| lift.landing == Landing::TornOff)?;
	let tab = shown.iter().find(|tab| tab.id == lift.id)?;
	let [x, y, _, height] = measured.lifted_tab?;
	let chip = drag_ghost(t, LANGUAGE, tab, DockTarget::Outside)?;
	Some(chip.absolute(x + lift.dx, y + height))
}

fn failure(state: &State, k: &Kit, t: &Tokens) -> Option<El> {
	let Failure { title, description } = state.failure.as_ref()?;
	let shown = toast(
		t,
		Toast {
			kind: ToastType::Error,
			title,
			description: description.as_deref().unwrap_or_default(),
			action: None,
		},
	);
	Some(ToastRegion::new().toast(shown).build(k))
}
