use kiroshi_core::invitations::contract::Invitation;
use kiroshi_core::joined_spaces::contract::JoinedSpace;
use kiroshi_core::spaces::contract::Space;
use kiroshi_rune_kit::surfaces::s02_rail::{
	InvitationFailure, InvitationState, PickerMessage, RailMessage, SpaceHost,
};
use serde_json::json;

use super::worker::{Answer, Call};
use super::{
	Heard, State, Swipe, heard_of, landed, opening_space, picked, railed, select_space, swipe_space,
};
use crate::app::{App, Person, Ready, SpaceContent, Workspace};
use crate::host::{Host, HostError};
use crate::model::{self, Conversation};
use crate::navigation::Route;
use crate::source::Source;

fn space(id: &str, name: &str) -> Space {
	listed_space(id, name, false)
}

fn listed_space(id: &str, name: &str, is_shared: bool) -> Space {
	serde_json::from_value(json!({
		"id": id,
		"name": name,
		"colour": 257,
		"position": 0,
		"createdAt": 0,
		"shared": is_shared,
		"instanceId": null,
	}))
	.expect("a Space fixture")
}

fn joined(id: &str, state: &str) -> JoinedSpace {
	serde_json::from_value(json!({
		"id": id,
		"hostUrl": "https://relay.test/relay/member",
		"remoteSpaceId": null,
		"name": "Studio",
		"state": state,
		"hostedBy": null,
		"colour": null,
		"instanceId": "instance-studio",
	}))
	.expect("a joined Space fixture")
}

fn invitation(instance_id: &str) -> Invitation {
	serde_json::from_value(json!({
		"id": format!("invitation-{instance_id}"),
		"instanceId": instance_id,
		"instanceName": "Atelier",
		"inviterEmail": "ada@example.com",
		"invitedAt": "2026-11-01T10:00:00Z",
		"expiresAt": "2026-11-15T10:00:00Z",
	}))
	.expect("an invitation fixture")
}

fn refused(command: &str, kind: &str) -> HostError {
	HostError::CommandFailed {
		command: command.to_owned(),
		status: 500,
		body: json!({ "kind": kind, "detail": "refused" }).to_string(),
	}
}

fn app_on(shown: &str) -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space { id: shown.to_owned(), name: "Personal".to_owned(), colour: None },
		agents: Vec::new(),
		conversations: Vec::new(),
		person: Person::Unread,
		longest: None,
	});
	app
}

fn three_spaces() -> Vec<Space> {
	vec![space("perso", "Personal"), space("work", "Work"), space("side", "Side")]
}

fn listed_app() -> App {
	let mut app = app_on("perso");
	landed(&mut app, Answer::Spaces(Ok(three_spaces())));
	app.surfaces.s02_rail.queued.clear();
	app
}

fn state(app: &App) -> &State {
	&app.surfaces.s02_rail
}

fn shown(app: &App) -> &model::Space {
	&app.ready().expect("a ready workspace").space
}

fn empty_content() -> SpaceContent {
	SpaceContent { agents: Vec::new(), conversations: Vec::new() }
}

fn titles(app: &App) -> Vec<&str> {
	state(app).notices.iter().map(|notice| notice.title.as_str()).collect()
}

fn row_names(app: &App) -> Vec<&str> {
	state(app).rows().iter().map(|row| row.name).collect()
}

#[test]
fn the_app_opens_the_last_space_and_falls_back_to_the_first() {
	let spaces = three_spaces();
	let id_of = |last: Option<&str>| opening_space(&spaces, last).map(|space| space.id.as_str());
	assert_eq!(id_of(Some("work")), Some("work"));
	assert_eq!(id_of(None), Some("perso"));
	assert_eq!(id_of(Some("gone")), Some("perso"));
	assert_eq!(opening_space(&[], Some("work")).map(|space| space.id.clone()), None);
}

#[test]
fn selecting_a_space_loads_it_shows_it_and_remembers_it() {
	let mut app = listed_app();
	picked(&mut app, PickerMessage::SelectSpace("work".to_owned()));
	assert_eq!(state(&app).queued, vec![Call::Load("work".to_owned())]);
	landed(&mut app, Answer::Loaded { space_id: "work".to_owned(), content: Ok(empty_content()) });
	assert_eq!(shown(&app).id, "work");
	assert_eq!(shown(&app).name, "Work");
	assert!(!state(&app).is_opening());
	assert!(state(&app).queued.contains(&Call::Remember("work".to_owned())));
}

#[test]
fn the_rail_and_the_carousel_select_a_space_too() {
	let mut app = listed_app();
	railed(&mut app, RailMessage::SpacesMenu(PickerMessage::SelectSpace("side".to_owned())));
	assert_eq!(state(&app).queued, vec![Call::Load("side".to_owned())]);
	let mut app = listed_app();
	select_space(&mut app, "work");
	assert_eq!(state(&app).queued, vec![Call::Load("work".to_owned())]);
}

#[test]
fn selecting_the_space_on_screen_loads_nothing() {
	let mut app = listed_app();
	select_space(&mut app, "perso");
	assert!(state(&app).queued.is_empty());
}

#[test]
fn a_swipe_settles_on_the_neighbour_in_list_order_and_stops_at_the_ends() {
	let mut app = listed_app();
	swipe_space(&mut app, Swipe::Previous);
	assert!(state(&app).queued.is_empty());
	swipe_space(&mut app, Swipe::Next);
	assert_eq!(state(&app).selected("perso"), "work");
	swipe_space(&mut app, Swipe::Next);
	assert_eq!(state(&app).selected("perso"), "side");
	swipe_space(&mut app, Swipe::Next);
	assert_eq!(state(&app).selected("perso"), "side");
	swipe_space(&mut app, Swipe::Previous);
	assert_eq!(state(&app).selected("perso"), "work");
}

#[test]
fn the_picker_lists_local_and_joined_spaces_with_their_host_marks() {
	let mut app = app_on("perso");
	let spaces = vec![
		space("perso", "Personal"),
		listed_space("team", "Team", true),
		listed_space("lab", "Lab", true),
	];
	landed(&mut app, Answer::Spaces(Ok(spaces)));
	assert!(state(&app).queued.contains(&Call::Hosting("team".to_owned())));
	landed(
		&mut app,
		Answer::Hosting { space_id: "team".to_owned(), state: Ok(json!({ "kind": "online" })) },
	);
	landed(
		&mut app,
		Answer::Hosting { space_id: "lab".to_owned(), state: Ok(json!({ "kind": "off" })) },
	);
	landed(
		&mut app,
		Answer::Joined(Ok(vec![joined("studio", "online"), joined("annex", "waitingForHost")])),
	);
	let rows = state(&app).rows();
	let ids: Vec<&str> = rows.iter().map(|row| row.id).collect();
	assert_eq!(ids, ["perso", "team", "lab", "studio", "annex"]);
	assert_eq!(rows[0].colour, Some(257.0));
	assert_eq!(rows[3].avatar_seed, "instance-studio");
	let expected = [
		("team", SpaceHost::Up),
		("lab", SpaceHost::Down),
		("studio", SpaceHost::Up),
		("annex", SpaceHost::Down),
	];
	assert_eq!(state(&app).hosts(), expected);
}

#[test]
fn a_joined_space_stays_closed_with_a_notice() {
	let mut app = listed_app();
	landed(&mut app, Answer::Joined(Ok(vec![joined("studio", "online")])));
	select_space(&mut app, "studio");
	assert!(state(&app).queued.is_empty());
	assert_eq!(shown(&app).id, "perso");
	assert_eq!(titles(&app).len(), 1);
}

fn invited_app() -> App {
	let mut app = listed_app();
	landed(&mut app, Answer::Invitations(Ok(vec![invitation("atelier")])));
	app
}

fn invitation_state(app: &App) -> Option<InvitationState<'_>> {
	state(app).invitation_rows().first().map(|row| row.state)
}

#[test]
fn a_pending_invitation_shows_and_accepting_joins_it() {
	let mut app = invited_app();
	assert_eq!(invitation_state(&app), Some(InvitationState::Waiting));
	picked(&mut app, PickerMessage::AcceptInvitation("atelier".to_owned()));
	assert_eq!(state(&app).queued, vec![Call::Accept(invitation("atelier"))]);
	assert_eq!(invitation_state(&app), Some(InvitationState::Accepting));
	picked(&mut app, PickerMessage::AcceptInvitation("atelier".to_owned()));
	assert_eq!(state(&app).queued.len(), 1);
	let outcome = Ok(joined("joined-atelier", "waitingForHost"));
	landed(&mut app, Answer::Accepted { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::HostOffline));
	assert!(state(&app).rows().iter().any(|row| row.id == "joined-atelier"));
	landed(&mut app, Answer::Joined(Ok(vec![joined("joined-atelier", "online")])));
	assert_eq!(invitation_state(&app), None);
}

#[test]
fn a_refused_acceptance_lands_in_the_row_and_retry_accepts_again() {
	let mut app = invited_app();
	picked(&mut app, PickerMessage::AcceptInvitation("atelier".to_owned()));
	let outcome = Err(refused("invitation_accept", "couldNotAccept"));
	landed(&mut app, Answer::Accepted { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::Failed(InvitationFailure::Servers)));
	app.surfaces.s02_rail.queued.clear();
	picked(&mut app, PickerMessage::RetryInvitation("atelier".to_owned()));
	assert_eq!(state(&app).queued, vec![Call::Accept(invitation("atelier"))]);
	let outcome = Err(refused("invitation_accept", "invitationWithdrawn"));
	landed(&mut app, Answer::Accepted { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::Withdrawn));
	picked(&mut app, PickerMessage::OpenChange(false));
	assert_eq!(invitation_state(&app), None);
}

#[test]
fn an_unknown_acceptance_refusal_raises_a_notice_and_resets_the_row() {
	let mut app = invited_app();
	picked(&mut app, PickerMessage::AcceptInvitation("atelier".to_owned()));
	let outcome = Err(refused("invitation_accept", "needsSignIn"));
	landed(&mut app, Answer::Accepted { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::Waiting));
	assert_eq!(titles(&app).len(), 1);
}

#[test]
fn declining_drops_the_invitation_or_lands_its_refusal() {
	let mut app = invited_app();
	picked(&mut app, PickerMessage::DeclineInvitation("atelier".to_owned()));
	assert_eq!(state(&app).queued, vec![Call::Decline(invitation("atelier"))]);
	landed(&mut app, Answer::Declined { invitation: invitation("atelier"), outcome: Ok(()) });
	assert_eq!(invitation_state(&app), None);
	let mut app = invited_app();
	let outcome = Err(refused("invitation_decline", "withdrawn"));
	landed(&mut app, Answer::Declined { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::Withdrawn));
	let mut app = invited_app();
	let outcome = Err(refused("invitation_decline", "offline"));
	landed(&mut app, Answer::Declined { invitation: invitation("atelier"), outcome });
	assert_eq!(invitation_state(&app), Some(InvitationState::Waiting));
	assert_eq!(titles(&app).len(), 1);
}

#[test]
fn a_signed_out_person_has_no_invitations_and_no_notice() {
	let mut app = invited_app();
	landed(&mut app, Answer::Invitations(Err(refused("invitations_list", "notSignedIn"))));
	assert_eq!(invitation_state(&app), None);
	assert!(titles(&app).is_empty());
}

#[test]
fn create_space_creates_an_untitled_space_and_opens_it() {
	let mut app = listed_app();
	picked(&mut app, PickerMessage::CreateSpace);
	assert_eq!(state(&app).queued, vec![Call::Create("Untitled space".to_owned())]);
	landed(&mut app, Answer::Created(Ok(space("new", "Untitled space"))));
	assert_eq!(row_names(&app).last(), Some(&"Untitled space"));
	assert!(state(&app).queued.contains(&Call::Load("new".to_owned())));
}

#[test]
fn a_refused_creation_raises_a_notice_and_rereads_the_list() {
	let mut app = listed_app();
	landed(&mut app, Answer::Created(Err(refused("space_create", "storage"))));
	assert_eq!(titles(&app).len(), 1);
	assert_eq!(state(&app).queued, vec![Call::ListSpaces]);
}

#[test]
fn space_settings_opens_the_space_settings_route() {
	let mut app = listed_app();
	picked(&mut app, PickerMessage::OpenSpaceSettings);
	assert!(matches!(app.navigation.main_route(), Route::SpaceSettings));
}

#[test]
fn while_a_space_loads_the_rail_names_it_and_the_screen_keeps_the_previous_data() {
	let mut app = listed_app();
	select_space(&mut app, "work");
	assert!(state(&app).is_opening());
	assert_eq!(state(&app).selected(&shown(&app).id), "work");
	assert_eq!(shown(&app).id, "perso");
	select_space(&mut app, "side");
	landed(&mut app, Answer::Loaded { space_id: "work".to_owned(), content: Ok(empty_content()) });
	assert_eq!(shown(&app).id, "perso");
	assert!(state(&app).is_opening());
}

#[test]
fn a_space_that_fails_to_load_leaves_the_current_space_with_a_notice() {
	let mut app = listed_app();
	select_space(&mut app, "work");
	let content = Err(refused("conversation_bots", "storage"));
	landed(&mut app, Answer::Loaded { space_id: "work".to_owned(), content });
	assert_eq!(shown(&app).id, "perso");
	assert!(!state(&app).is_opening());
	assert_eq!(titles(&app), ["Couldn't open Work. Pick it again to try once more."]);
}

#[test]
fn a_refused_remember_raises_a_notice() {
	let mut app = listed_app();
	landed(&mut app, Answer::Remembered(Err(refused("user_set_preferences", "storage"))));
	assert_eq!(titles(&app).len(), 1);
}

#[test]
fn renaming_reordering_and_deleting_update_the_list_without_a_restart() {
	let mut app = listed_app();
	app.surfaces.s02_rail.describe("perso", "Home", Some(186));
	assert!(matches!(state(&app).queued.as_slice(), [Call::Describe { .. }]));
	landed(&mut app, Answer::Described(Ok(space("perso", "Home"))));
	assert_eq!(row_names(&app), ["Home", "Work", "Side"]);
	assert_eq!(shown(&app).name, "Home");
	let order = vec!["side".to_owned(), "perso".to_owned(), "work".to_owned()];
	app.surfaces.s02_rail.reorder(order.clone());
	assert_eq!(row_names(&app), ["Side", "Home", "Work"]);
	assert!(state(&app).queued.contains(&Call::Reorder(order)));
	app.surfaces.s02_rail.delete("work");
	landed(&mut app, Answer::Deleted { space_id: "work".to_owned(), outcome: Ok(()) });
	assert_eq!(row_names(&app), ["Side", "Home"]);
}

#[test]
fn a_heard_description_rereads_the_list() {
	let mut app = listed_app();
	app.surfaces.s02_rail.heard(Heard::Spaces);
	assert_eq!(state(&app).queued, vec![Call::ListSpaces]);
	landed(&mut app, Answer::Spaces(Ok(vec![space("perso", "Renamed"), space("work", "Work")])));
	assert_eq!(shown(&app).name, "Renamed");
}

#[test]
fn a_refused_reorder_raises_a_notice_and_rereads_the_list() {
	let mut app = listed_app();
	landed(&mut app, Answer::Reordered(Err(refused("space_reorder", "incompleteOrder"))));
	assert_eq!(titles(&app).len(), 1);
	assert_eq!(state(&app).queued, vec![Call::ListSpaces]);
}

#[test]
fn deleting_the_space_on_screen_opens_the_first_remaining_and_remembers_it() {
	let mut app = listed_app();
	landed(&mut app, Answer::Deleted { space_id: "perso".to_owned(), outcome: Ok(()) });
	assert_eq!(state(&app).queued, vec![Call::Load("work".to_owned())]);
	landed(&mut app, Answer::Loaded { space_id: "work".to_owned(), content: Ok(empty_content()) });
	assert_eq!(shown(&app).id, "work");
	assert!(state(&app).queued.contains(&Call::Remember("work".to_owned())));
}

#[test]
fn space_events_map_to_rereads() {
	assert_eq!(heard_of("space://described"), Some(Heard::Spaces));
	assert_eq!(heard_of("joined-space://removed"), Some(Heard::Joined));
	assert_eq!(heard_of("invitation://changed"), Some(Heard::Invitations));
	assert_eq!(heard_of("hosting://changed"), Some(Heard::Hosting));
	assert_eq!(heard_of("mission://changed"), None);
}

fn solo_conversation(id: &str, bot_id: &str) -> Conversation {
	serde_json::from_value(json!({
		"id": id,
		"title": bot_id,
		"color": null,
		"participants": [{
			"botId": bot_id,
			"name": bot_id,
			"avatarBlot": null,
			"leftAt": null,
			"isDeleted": false,
		}],
		"soloBotId": bot_id,
	}))
	.expect("a conversation fixture")
}

#[test]
fn another_space_from_the_rail_swaps_roster_thread_and_accent_in_the_same_window() {
	let mut app = listed_app();
	app.navigation.navigate_main(Route::Conversations);
	let content = SpaceContent {
		agents: Vec::new(),
		conversations: vec![solo_conversation("work-chat", "atlas")],
	};

	railed(&mut app, RailMessage::SpacesMenu(PickerMessage::SelectSpace("work".to_owned())));
	landed(&mut app, Answer::Loaded { space_id: "work".to_owned(), content: Ok(content) });

	let ready = app.ready().expect("a ready workspace");
	let roster: Vec<&str> = ready.conversations.iter().map(|held| held.id.as_str()).collect();
	assert!(app.navigation.main_route() == Route::Conversations);
	assert_eq!((ready.space.id.as_str(), ready.space.colour), ("work", Some(257.0)));
	assert_eq!(roster, ["work-chat"]);
	assert_eq!(
		app.thread.as_ref().map(|thread| thread.conversation_id.as_str()),
		Some("work-chat")
	);
}
