use rune::{El, el};

use kiroshi_rune_kit::surfaces::s02_rail::{Rail, SpacesMenu};
use kiroshi_rune_kit::tokens::Tokens;

use super::{LANGUAGE, panel_of, railed};
use crate::app::App;

pub fn view(app: &App, t: &Tokens) -> (El, Vec<El>) {
	let Some(ready) = app.ready() else { return (el(), Vec::new()) };
	let state = &app.surfaces.s02_rail;
	let selected = state.selected(&ready.space.id);
	let rows = state.rows();
	let hosts = state.hosts();
	let invitations = state.invitation_rows();
	let panel = panel_of(app);
	let menu = SpacesMenu {
		spaces: &rows,
		hosts: &hosts,
		invitations: &invitations,
		is_open: state.is_picker_open(),
		..SpacesMenu::default()
	};
	let rail = Rail {
		space: rows.iter().find(|row| row.id == selected).copied(),
		space_host: hosts.iter().find(|(id, _)| *id == selected).map(|(_, host)| *host),
		spaces_menu: Some(menu),
		has_search: false,
		..Rail::new(LANGUAGE, panel)
	};
	let layers: Vec<El> = rail.spaces_menu_layer(t, railed).into_iter().collect();
	(rail.view(t, railed), layers)
}
