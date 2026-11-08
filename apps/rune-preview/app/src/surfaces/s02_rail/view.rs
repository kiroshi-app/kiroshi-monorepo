use rune::{El, el, row};

use kiroshi_rune_kit::surfaces::s02_rail::{Rail, SpaceCarousel, SpacesMenu};
use kiroshi_rune_kit::surfaces::s04_boot::notice::{RaisedNotice, notice_surface};
use kiroshi_rune_kit::tokens::Tokens;

use super::{LANGUAGE, noticed, panel_of, railed};
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
	let carousel = SpaceCarousel { list: panel, spaces: &rows, selected: Some(selected) };
	let notices: Vec<RaisedNotice> = state
		.notices
		.iter()
		.map(|notice| RaisedNotice::failure(&notice.title, notice.description.as_deref()))
		.collect();
	let mut layers: Vec<El> = rail.spaces_menu_layer(t, railed).into_iter().collect();
	if !notices.is_empty() {
		layers.push(notice_surface(t, LANGUAGE, &notices, noticed));
	}
	let body = row().w_full().h_full().child(rail.view(t, railed)).child(carousel.view(|_| el()));
	(body, layers)
}
