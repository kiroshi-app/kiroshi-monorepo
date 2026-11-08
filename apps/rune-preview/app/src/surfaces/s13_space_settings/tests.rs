use kiroshi_rune_kit::surfaces::s13_space_settings::{
	Danger, Failure, InviteReason, MemberStatus, Refusal, RemoveReason, Sharing, Standing,
	WithdrawReason,
};
use serde_json::{Value, json};

use super::view::with_screen;
use super::*;
use crate::app::{Ready, Workspace};
use crate::host::Host;

const SPACE: &str = "space-1";

const OTHER: &str = "space-2";

const JOINED: &str = "joined-1";

const INVITATION: &str = "inv_1";

fn ready_app() -> App {
	let mut app = App::new();
	app.workspace = Workspace::Ready(Ready {
		source: Source::Running(Host::detached()),
		space: model::Space {
			id: SPACE.to_owned(),
			name: "Studio".to_owned(),
			colour: Some(257.0),
		},
		agents: Vec::new(),
		conversations: Vec::new(),
		person: crate::app::Person::SignedIn("ada@example.com".to_owned()),
		longest: None,
	});
	app
}

fn space(id: &str, name: &str, colour: Option<u16>) -> Space {
	serde_json::from_value(json!({
		"id": id,
		"name": name,
		"colour": colour,
		"position": 0,
		"createdAt": 0,
		"shared": false,
		"instanceId": null,
	}))
	.expect("a space reads")
}

fn joined(state: &str) -> JoinedSpace {
	serde_json::from_value(json!({
		"id": JOINED,
		"hostUrl": "http://127.0.0.1:45367",
		"remoteSpaceId": "remote-1",
		"name": "Release desk",
		"state": state,
		"hostedBy": "Noa",
		"colour": null,
		"instanceId": "instance-1",
	}))
	.expect("a joined space reads")
}

fn invitation() -> Invitation {
	Invitation {
		id: INVITATION.to_owned(),
		instance_id: "instance-1".to_owned(),
		instance_name: "Release desk".to_owned(),
		inviter_email: "noa@example.com".to_owned(),
		invited_at: "2026-11-01T10:00:00Z".to_owned(),
		expires_at: "2026-11-15T10:00:00Z".to_owned(),
	}
}

fn refused(command: &str, refusal: Value) -> HostError {
	HostError::CommandFailed { command: command.to_owned(), status: 500, body: refusal.to_string() }
}

fn opened() -> App {
	let mut app = ready_app();
	app.navigation.navigate_main(Route::SpaceSettings);
	poll(&mut app);
	app
}

fn settings(app: &mut App) -> &mut State {
	&mut app.surfaces.s13_space_settings
}

fn take_queued(app: &mut App) -> Vec<Call> {
	std::mem::take(&mut settings(app).queued)
}

fn land(app: &mut App, answer: Answer) {
	settings(app).answered(answer);
	run_follows(app);
}

fn signed_in(app: &mut App, is_signed_in: bool) {
	let account = if is_signed_in {
		json!({ "kind": "signedIn", "email": "ada@example.com", "plan": null })
	} else {
		json!({ "kind": "signedOut" })
	};
	let account = serde_json::from_value(account).expect("an account reads");
	land(app, Answer::Account(Ok(account)));
}

fn hosting(app: &mut App, kind: &str) {
	let state = Ok(json!({ "kind": kind }));
	land(app, Answer::Hosting { space_id: SPACE.to_owned(), state, is_stop: false });
}

fn listed(members: Value, invitations: Value) -> Value {
	json!({ "members": members, "invitations": invitations })
}

fn studio_members() -> Value {
	listed(
		json!([
			{ "userId": "maya", "name": "Maya", "email": "maya@example.com", "status": "joined" },
			{ "userId": "steve", "name": "Steve", "email": "steve@example.com", "status": "host" },
			{ "userId": "ada", "name": "Ada", "email": "ada@example.com", "status": "needsInvitation" },
		]),
		json!([
			{ "id": "inv-tom", "email": "tom@example.com", "sentAt": "2026-11-01T10:00:00Z", "expiresAt": "2026-11-20T10:00:00Z", "state": "invited" },
			{ "id": "inv-sam", "email": "sam@example.com", "sentAt": "2026-10-01T10:00:00Z", "expiresAt": "2026-10-08T10:00:00Z", "state": "expired" },
			{ "id": "inv-jo", "email": "jo@example.com", "sentAt": "2026-10-01T10:00:00Z", "expiresAt": "2026-10-08T10:00:00Z", "state": "withdrawn" },
		]),
	)
}

fn members_open(app: &mut App) {
	signed_in(app, true);
	hosting(app, "online");
	space_event(app, SpaceEvent::Select(Entry::Members));
	take_queued(app);
	land(app, Answer::Members { space_id: SPACE.to_owned(), listed: Ok(studio_members()) });
}

fn shows_standing(app: &App, expected: Standing) -> bool {
	with_screen(app, |screen| screen.standing == expected) == Some(true)
}

fn sharing_of(app: &App) -> Option<Sharing> {
	with_screen(app, |screen| screen.settings.sharing).flatten()
}

fn notice_titles(app: &App) -> Vec<String> {
	app.surfaces.s13_space_settings.notices.iter().map(|(_, notice)| notice.title.clone()).collect()
}

fn member_ids(app: &App) -> Vec<String> {
	with_screen(app, |screen| {
		let members = screen.settings.members.as_ref().expect("a members panel");
		members.members.iter().map(|member| member.id.to_owned()).collect()
	})
	.unwrap_or_default()
}

fn member_call(app: &mut App) -> Option<MemberCall> {
	take_queued(app).into_iter().find_map(|call| match call {
		Call::Members { call, .. } => Some(call),
		_ => None,
	})
}

fn type_email(app: &mut App, email: &str) {
	settings(app).email = TextEdit::new(email);
}

#[test]
fn opening_reads_the_space_account_and_hosting_of_the_shown_space() {
	let mut app = opened();

	let queued = take_queued(&mut app);

	assert_eq!(
		queued,
		vec![Call::ReadSpaces, Call::ReadAccount, Call::ReadHosting(SPACE.to_owned())]
	);
	assert_eq!(settings(&mut app).name.text, "Studio");
}

#[test]
fn saving_sends_the_edited_name_and_picked_colour_to_the_core() {
	let mut app = opened();
	take_queued(&mut app);
	settings(&mut app).name = TextEdit::new("  Release desk ");

	space_event(&mut app, SpaceEvent::PickColour(Some(140.4)));

	assert_eq!(
		take_queued(&mut app),
		vec![Call::Save {
			space_id: SPACE.to_owned(),
			name: "Release desk".to_owned(),
			colour: Some(140),
		}]
	);
}

#[test]
fn a_saved_space_shows_its_saved_value_on_reopen() {
	let mut app = opened();
	land(&mut app, Answer::Spaces(Ok(vec![space(SPACE, "Studio", Some(257))])));
	settings(&mut app).name = TextEdit::new("Release desk");
	space_event(&mut app, SpaceEvent::Save);

	land(&mut app, Answer::Saved(Ok(space(SPACE, "Release desk", Some(140)))));
	app.navigation.navigate_main(Route::Conversations);
	poll(&mut app);
	app.navigation.navigate_main(Route::SpaceSettings);
	poll(&mut app);

	let reopened = settings(&mut app);
	assert_eq!(reopened.name.text, "Release desk");
	assert_eq!(reopened.visit.as_ref().and_then(|visit| visit.colour), Some(140.0));
}

#[test]
fn a_refused_save_keeps_the_screen_open_with_its_notice() {
	let mut app = opened();
	settings(&mut app).name = TextEdit::new("Release desk");

	land(&mut app, Answer::Saved(Err(refused("space_update", json!({ "kind": "storage" })))));

	assert!(app.navigation.main_route() == Route::SpaceSettings);
	assert_eq!(settings(&mut app).name.text, "Release desk");
	assert_eq!(notice_titles(&app), vec![said(chat::screen::notice::describe_refused::TITLE)]);
}

#[test]
fn turning_sharing_on_starts_hosting_and_shows_the_shared_card() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "off");
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Share(true));
	let start = take_queued(&mut app);
	hosting(&mut app, "connecting");
	let connecting = sharing_of(&app);
	let watched = take_queued(&mut app);
	land(&mut app, Answer::Due(Due::HostingWatch));
	let reread = take_queued(&mut app);
	hosting(&mut app, "online");

	assert_eq!(start, vec![Call::StartHosting(SPACE.to_owned())]);
	assert_eq!(connecting, Some(Sharing::Connecting));
	assert_eq!(watched, vec![Call::Wake(HOSTING_WATCH, Due::HostingWatch)]);
	assert_eq!(reread, vec![Call::ReadHosting(SPACE.to_owned())]);
	assert_eq!(sharing_of(&app), Some(Sharing::Online));
	assert!(shows_standing(&app, Standing::Yours { shared: true }));
}

#[test]
fn turning_sharing_off_stops_hosting() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "online");
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Share(false));
	let stop = take_queued(&mut app);
	land(
		&mut app,
		Answer::Hosting {
			space_id: SPACE.to_owned(),
			state: Ok(json!({ "kind": "off" })),
			is_stop: true,
		},
	);

	assert_eq!(stop, vec![Call::StopHosting(SPACE.to_owned())]);
	assert_eq!(sharing_of(&app), Some(Sharing::Off));
}

#[test]
fn a_hosting_failure_keeps_sharing_off_and_names_its_reason() {
	let mut app = opened();
	signed_in(&mut app, true);
	land(
		&mut app,
		Answer::Hosting {
			space_id: SPACE.to_owned(),
			state: Ok(
				json!({ "kind": "failed", "failure": "takenOverByAnotherHost", "detail": "" }),
			),
			is_stop: false,
		},
	);

	let notices = &app.surfaces.s13_space_settings.notices;
	assert_eq!(sharing_of(&app), Some(Sharing::Off));
	assert_eq!(notices.len(), 1);
	assert_eq!(notices[0].1.title, "Couldn’t host Studio");
	assert_eq!(
		notices[0].1.description,
		said(settings::space::hosting::failed::reasons::TAKEN_OVER)
	);
}

#[test]
fn a_refused_start_names_the_reason_its_refusal_carries() {
	let mut app = opened();
	let refusal = json!({ "kind": "failed", "failure": "deviceAwaitingApproval", "detail": "" });
	land(
		&mut app,
		Answer::Hosting {
			space_id: SPACE.to_owned(),
			state: Err(refused("hosting_start", refusal)),
			is_stop: false,
		},
	);

	let notices = &app.surfaces.s13_space_settings.notices;
	assert_eq!(notices.len(), 1);
	assert_eq!(notices[0].1.title, "Couldn’t host Studio");
	assert_eq!(
		notices[0].1.description,
		said(settings::space::hosting::failed::reasons::DEVICE_AWAITING_APPROVAL)
	);
	assert!(app.navigation.main_route() == Route::SpaceSettings);
}

#[test]
fn a_refused_stop_raises_the_stop_failure() {
	let mut app = opened();
	land(
		&mut app,
		Answer::Hosting {
			space_id: SPACE.to_owned(),
			state: Err(refused("hosting_stop", json!({ "kind": "storage" }))),
			is_stop: true,
		},
	);

	assert_eq!(notice_titles(&app), vec!["Couldn’t stop hosting Studio".to_owned()]);
	assert!(app.navigation.main_route() == Route::SpaceSettings);
}

#[test]
fn signed_out_shows_the_sign_in_card_and_never_starts_hosting() {
	let mut app = opened();
	signed_in(&mut app, false);
	hosting(&mut app, "off");
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Share(true));
	let blocked = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|members| members.blocked_by)
	});

	assert_eq!(take_queued(&mut app), Vec::new());
	assert_eq!(sharing_of(&app), Some(Sharing::SignedOut));
	assert_eq!(
		blocked.flatten(),
		Some(kiroshi_rune_kit::surfaces::s13_space_settings::Blocker::SignedOut)
	);
}

#[test]
fn sign_in_opens_the_account_settings() {
	let mut app = opened();
	signed_in(&mut app, false);

	space_event(&mut app, SpaceEvent::SignIn);

	assert!(app.navigation.main_route() == Route::PersonSettings);
}

#[test]
fn the_members_panel_loads_then_lists_members_and_live_invitations_host_first() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "online");
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Select(Entry::Members));
	let read = take_queued(&mut app);
	let loading = with_screen(&app, |screen| screen.settings.members.as_ref().map(|m| m.loading));
	land(&mut app, Answer::Members { space_id: SPACE.to_owned(), listed: Ok(studio_members()) });
	let statuses = with_screen(&app, |screen| {
		let members = screen.settings.members.as_ref().expect("a members panel");
		let host = members.members[0].status == MemberStatus::Host;
		let pending =
			matches!(members.members[3].status, MemberStatus::Pending { expires_in_days: Some(_) });
		let expired =
			members.members[4].status == MemberStatus::Expired { sent: Some("2026-10-01") };
		(members.loading, host, pending, expired)
	});

	assert_eq!(read, vec![Call::ReadMembers(SPACE.to_owned())]);
	assert_eq!(loading.flatten(), Some(true));
	assert_eq!(member_ids(&app), vec!["steve", "maya", "ada", "inv-tom", "inv-sam"]);
	assert_eq!(statuses, Some((false, true, true, true)));
}

#[test]
fn an_empty_members_answer_shows_an_empty_list_not_a_loader() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "online");
	space_event(&mut app, SpaceEvent::Select(Entry::Members));

	land(
		&mut app,
		Answer::Members { space_id: SPACE.to_owned(), listed: Ok(listed(json!([]), json!([]))) },
	);

	let loading = with_screen(&app, |screen| screen.settings.members.as_ref().map(|m| m.loading));
	assert_eq!(member_ids(&app), Vec::<String>::new());
	assert_eq!(loading.flatten(), Some(false));
}

#[test]
fn a_members_read_failure_stops_loading_and_raises_a_notice() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "online");
	space_event(&mut app, SpaceEvent::Select(Entry::Members));

	let failure = refused("hosting_members", json!({ "kind": "notHosting" }));
	land(&mut app, Answer::Members { space_id: SPACE.to_owned(), listed: Err(failure) });

	let loading = with_screen(&app, |screen| screen.settings.members.as_ref().map(|m| m.loading));
	assert_eq!(loading.flatten(), Some(false));
	assert_eq!(notice_titles(&app), vec![said(chat::screen::notice::FAILED)]);
}

#[test]
fn members_are_not_read_while_the_space_is_not_hosted() {
	let mut app = opened();
	signed_in(&mut app, true);
	hosting(&mut app, "off");
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Select(Entry::Members));

	let hosted =
		with_screen(&app, |screen| screen.settings.members.as_ref().map(|m| (m.hosted, m.loading)));
	assert_eq!(take_queued(&mut app), Vec::new());
	assert_eq!(hosted.flatten(), Some((false, false)));
}

#[test]
fn inviting_sends_the_email_then_refreshes_from_the_core_answer() {
	let mut app = opened();
	members_open(&mut app);
	type_email(&mut app, " Lea@Example.com ");

	space_event(&mut app, SpaceEvent::Invite);
	let call = member_call(&mut app);
	let mut answer = studio_members();
	answer["invitations"].as_array_mut().expect("invitations").push(json!({
		"id": "inv-lea", "email": "lea@example.com", "sentAt": "2026-11-08T10:00:00Z",
		"expiresAt": "2026-11-15T10:00:00Z", "state": "invited",
	}));
	land(
		&mut app,
		Answer::Changed {
			space_id: SPACE.to_owned(),
			call: call.clone().expect("a call"),
			listed: Ok(answer),
		},
	);

	assert_eq!(call, Some(MemberCall::Invite { email: "lea@example.com".to_owned() }));
	assert!(member_ids(&app).contains(&"inv-lea".to_owned()));
	assert_eq!(settings(&mut app).email.text, "");
	assert_eq!(notice_titles(&app), vec!["Invitation sent to lea@example.com".to_owned()]);
}

#[test]
fn inviting_an_expired_address_resends_its_invitation() {
	let mut app = opened();
	members_open(&mut app);
	type_email(&mut app, "sam@example.com");

	space_event(&mut app, SpaceEvent::Invite);

	assert_eq!(
		member_call(&mut app),
		Some(MemberCall::Resend { invitation_id: "inv-sam".to_owned() })
	);
}

#[test]
fn a_refused_invite_shows_its_refusal_and_an_unreachable_one_its_relay_reason() {
	let mut app = opened();
	members_open(&mut app);
	let invite = MemberCall::Invite { email: "tom@example.com".to_owned() };
	let already = refused("hosting_invite_member", json!({ "kind": "alreadyInvited" }));
	land(
		&mut app,
		Answer::Changed { space_id: SPACE.to_owned(), call: invite.clone(), listed: Err(already) },
	);
	let refusal =
		with_screen(&app, |screen| screen.settings.members.as_ref().and_then(|m| m.refusal));

	let conflict = refused(
		"hosting_invite_member",
		json!({ "kind": "unreachable", "reason": { "kind": "relayConflict", "code": "seat_taken" }, "detail": "" }),
	);
	land(
		&mut app,
		Answer::Changed { space_id: SPACE.to_owned(), call: invite, listed: Err(conflict) },
	);
	let failure = with_screen(&app, |screen| {
		screen
			.settings
			.members
			.as_ref()
			.and_then(|m| m.failure)
			.map(|failure| format!("{failure:?}"))
	});

	assert_eq!(refusal.flatten(), Some(Refusal::Invited));
	let expected = Failure::Invite {
		reason: InviteReason::RelayConflict(Some("seat_taken")),
		email: "tom@example.com",
	};
	assert_eq!(failure.flatten(), Some(format!("{expected:?}")));
	assert!(app.navigation.main_route() == Route::SpaceSettings);
}

#[test]
fn resend_and_invite_again_call_their_own_commands() {
	let mut app = opened();
	members_open(&mut app);

	space_event(&mut app, SpaceEvent::Resend("inv-sam".to_owned()));
	let resend = member_call(&mut app);
	space_event(&mut app, SpaceEvent::Resend("ada".to_owned()));
	let again = member_call(&mut app);
	let inviting_again = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|m| m.inviting_again.map(str::to_owned))
	});

	assert_eq!(resend, Some(MemberCall::Resend { invitation_id: "inv-sam".to_owned() }));
	assert_eq!(again, Some(MemberCall::InviteAgain { user_id: "ada".to_owned() }));
	assert_eq!(inviting_again.flatten(), Some("ada".to_owned()));
}

#[test]
fn a_refused_invite_again_raises_its_notice_and_frees_the_row() {
	let mut app = opened();
	members_open(&mut app);
	space_event(&mut app, SpaceEvent::Resend("ada".to_owned()));
	take_queued(&mut app);

	let failure = refused(
		"hosting_invite_member_again",
		json!({ "kind": "removedButNotInvited", "cause": { "kind": "notHosting" } }),
	);
	land(
		&mut app,
		Answer::Changed {
			space_id: SPACE.to_owned(),
			call: MemberCall::InviteAgain { user_id: "ada".to_owned() },
			listed: Err(failure),
		},
	);

	let inviting_again = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|m| m.inviting_again.map(str::to_owned))
	});
	assert_eq!(inviting_again.flatten(), None);
	assert_eq!(
		notice_titles(&app),
		vec!["Ada was removed, the invitation to ada@example.com wasn’t sent".to_owned()]
	);
}

#[test]
fn withdrawing_calls_the_core_refreshes_and_tells_it() {
	let mut app = opened();
	members_open(&mut app);

	space_event(&mut app, SpaceEvent::Withdraw("inv-tom".to_owned()));
	let call = member_call(&mut app);
	let after = listed(
		json!([{ "userId": "steve", "name": "Steve", "email": "steve@example.com", "status": "host" }]),
		json!([]),
	);
	land(
		&mut app,
		Answer::Changed {
			space_id: SPACE.to_owned(),
			call: call.clone().expect("a call"),
			listed: Ok(after),
		},
	);

	assert_eq!(call, Some(MemberCall::Withdraw { invitation_id: "inv-tom".to_owned() }));
	assert_eq!(member_ids(&app), vec!["steve"]);
	assert_eq!(notice_titles(&app), vec!["Invitation to tom@example.com withdrawn".to_owned()]);
}

#[test]
fn a_refused_withdraw_shows_on_its_row() {
	let mut app = opened();
	members_open(&mut app);

	land(
		&mut app,
		Answer::Changed {
			space_id: SPACE.to_owned(),
			call: MemberCall::Withdraw { invitation_id: "inv-tom".to_owned() },
			listed: Err(refused("hosting_withdraw_invitation", json!({ "kind": "notPending" }))),
		},
	);

	let failure = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|m| m.failure).map(|failure| match failure {
			Failure::Withdraw { reason, member } => Some((reason, member.id.to_owned())),
			_ => None,
		})
	});
	assert_eq!(failure.flatten().flatten(), Some((WithdrawReason::Joined, "inv-tom".to_owned())));
}

#[test]
fn removing_asks_first_and_only_the_confirm_calls_the_core() {
	let mut app = opened();
	members_open(&mut app);

	space_event(&mut app, SpaceEvent::Remove("maya".to_owned()));
	let asked = take_queued(&mut app);
	let removing = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|m| m.removing.map(|member| member.id.to_owned()))
	});
	space_event(&mut app, SpaceEvent::CancelRemove);
	let cancelled = take_queued(&mut app);
	space_event(&mut app, SpaceEvent::Remove("maya".to_owned()));
	space_event(&mut app, SpaceEvent::ConfirmRemove);

	assert_eq!(asked, Vec::new());
	assert_eq!(removing.flatten(), Some("maya".to_owned()));
	assert_eq!(cancelled, Vec::new());
	assert_eq!(member_call(&mut app), Some(MemberCall::Remove { user_id: "maya".to_owned() }));
}

#[test]
fn a_refused_remove_keeps_the_member_and_shows_why() {
	let mut app = opened();
	members_open(&mut app);

	land(
		&mut app,
		Answer::Changed {
			space_id: SPACE.to_owned(),
			call: MemberCall::Remove { user_id: "steve".to_owned() },
			listed: Err(refused("hosting_remove_member", json!({ "kind": "hostNotRemovable" }))),
		},
	);

	let reason = with_screen(&app, |screen| {
		screen.settings.members.as_ref().and_then(|m| m.failure).map(|failure| match failure {
			Failure::Remove { reason, .. } => Some(reason),
			_ => None,
		})
	});
	assert_eq!(reason.flatten().flatten(), Some(RemoveReason::Host));
	assert!(member_ids(&app).contains(&"steve".to_owned()));
}

fn linked() -> App {
	let mut app = ready_app();
	open_join_link(&mut app, INVITATION.to_owned());
	land(&mut app, Answer::Invitations(Ok(vec![invitation()])));
	poll(&mut app);
	take_queued(&mut app);
	app
}

#[test]
fn a_join_link_opens_its_listed_invitation() {
	let app = linked();

	assert!(app.navigation.main_route() == Route::SpaceSettings);
	assert!(shows_standing(
		&app,
		Standing::Invitation { host_email: "noa@example.com", expires: "2026-11-15" }
	));
}

#[test]
fn a_join_link_to_no_listed_invitation_says_so_and_stays() {
	let mut app = ready_app();
	let before = app.navigation.main_route();
	open_join_link(&mut app, "inv_unknown".to_owned());

	land(&mut app, Answer::Invitations(Ok(vec![invitation()])));

	assert!(app.navigation.main_route() == before);
	assert_eq!(
		notice_titles(&app),
		vec![said(chat::screen::notice::join_refused::no_invitation::TITLE)]
	);
}

#[test]
fn accepting_joins_then_connects_and_shows_the_joined_space() {
	let mut app = linked();

	space_event(&mut app, SpaceEvent::Accept);
	let accept = take_queued(&mut app);
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });
	let connect = take_queued(&mut app);
	let connecting = shows_standing(
		&app,
		Standing::Joined { host_name: "Noa", connected: false, connecting: true },
	);
	let connection = serde_json::from_value(json!({
		"id": JOINED, "hostUrl": "http://127.0.0.1:5000", "token": "t",
		"remoteSpaceId": "remote-1", "name": "Release desk",
	}))
	.expect("a connection reads");
	land(&mut app, Answer::Connected { joined_id: JOINED.to_owned(), outcome: Ok(connection) });

	assert_eq!(accept, vec![Call::Accept(invitation())]);
	assert_eq!(connect, vec![Call::Connect(JOINED.to_owned())]);
	assert!(connecting);
	assert!(shows_standing(
		&app,
		Standing::Joined { host_name: "Noa", connected: true, connecting: false }
	));
}

#[test]
fn a_refused_accept_keeps_the_invitation_open_with_its_reason() {
	let mut app = linked();

	let failure = refused("invitation_accept", json!({ "kind": "invitationExpired" }));
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Err(failure) });

	assert_eq!(
		with_screen(&app, |screen| matches!(screen.standing, Standing::Invitation { .. })),
		Some(true)
	);
	assert_eq!(
		notice_titles(&app),
		vec![said(chat::screen::notice::join_refused::invitation_expired::TITLE)]
	);
}

#[test]
fn a_different_host_key_refuses_the_connection_and_raises_the_key_alert() {
	let mut app = linked();
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });

	let mismatch = refused("joined_space_connect", json!({ "kind": "badSignature" }));
	land(&mut app, Answer::Connected { joined_id: JOINED.to_owned(), outcome: Err(mismatch) });

	let alert = &app.surfaces.s13_space_settings.notices[0].1;
	assert!(alert.failed);
	assert_eq!(alert.title, said(chat::screen::notice::join_refused::bad_signature::TITLE));
	assert_eq!(
		alert.description,
		said(chat::screen::notice::join_refused::bad_signature::DESCRIPTION)
	);
	assert!(shows_standing(
		&app,
		Standing::Joined { host_name: "Noa", connected: false, connecting: false }
	));
}

#[test]
fn a_host_offline_answer_waits_without_an_alert() {
	let mut app = linked();
	land(
		&mut app,
		Answer::Accepted { invitation: invitation(), outcome: Ok(joined("waitingForHost")) },
	);

	let offline = refused("joined_space_connect", json!({ "kind": "hostOffline", "id": JOINED }));
	land(&mut app, Answer::Connected { joined_id: JOINED.to_owned(), outcome: Err(offline) });

	assert_eq!(notice_titles(&app), Vec::<String>::new());
}

#[test]
fn a_joined_space_shows_its_host_and_offers_leave_instead_of_delete_and_export() {
	let mut app = linked();
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });

	let shown = with_screen(&app, |screen| {
		(
			screen.settings.joined_host.map(str::to_owned),
			screen.settings.danger,
			screen.settings.transfer,
			screen.settings.members.is_some(),
		)
	});

	assert_eq!(shown, Some((Some("Noa".to_owned()), Danger::Leave, false, false)));
}

#[test]
fn renaming_a_joined_space_describes_it_through_the_core() {
	let mut app = linked();
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });
	take_queued(&mut app);
	settings(&mut app).name = TextEdit::new("Desk");

	space_event(&mut app, SpaceEvent::Save);

	assert_eq!(
		take_queued(&mut app),
		vec![Call::Describe {
			joined_id: JOINED.to_owned(),
			name: "Desk".to_owned(),
			colour: None
		}]
	);
}

#[test]
fn confirming_delete_calls_the_core_and_returns_to_another_space() {
	let mut app = opened();
	land(
		&mut app,
		Answer::Spaces(Ok(vec![space(SPACE, "Studio", None), space(OTHER, "Personal", None)])),
	);
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::AskDanger);
	let asking = with_screen(&app, |screen| screen.settings.asking);
	space_event(&mut app, SpaceEvent::Delete);
	let delete = take_queued(&mut app);
	land(&mut app, Answer::Deleted { space_id: SPACE.to_owned(), outcome: Ok(()) });
	poll(&mut app);

	assert_eq!(asking, Some(true));
	assert_eq!(delete, vec![Call::Delete(SPACE.to_owned())]);
	assert!(app.navigation.main_route() == Route::Conversations);
	assert!(app.surfaces.s13_space_settings.visit.is_none());
}

#[test]
fn a_refused_delete_keeps_the_screen_open() {
	let mut app = opened();

	land(
		&mut app,
		Answer::Deleted {
			space_id: SPACE.to_owned(),
			outcome: Err(refused("space_delete", json!({ "kind": "storage" }))),
		},
	);
	poll(&mut app);

	assert!(app.navigation.main_route() == Route::SpaceSettings);
	assert_eq!(notice_titles(&app), vec![said(chat::screen::notice::FAILED)]);
}

#[test]
fn the_last_space_is_never_deleted() {
	let mut app = opened();
	land(&mut app, Answer::Spaces(Ok(vec![space(SPACE, "Studio", None)])));
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::Delete);

	assert_eq!(take_queued(&mut app), Vec::new());
	assert_eq!(
		with_screen(&app, |screen| screen.settings.danger),
		Some(Danger::Delete { deletable: false })
	);
}

#[test]
fn confirming_leave_calls_the_core_and_returns_to_the_conversations() {
	let mut app = linked();
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });
	take_queued(&mut app);

	space_event(&mut app, SpaceEvent::AskDanger);
	let leaving = with_screen(&app, |screen| screen.leaving);
	space_event(&mut app, SpaceEvent::Leave);
	let leave = take_queued(&mut app);
	land(&mut app, Answer::Left { joined_id: JOINED.to_owned(), outcome: Ok(()) });
	poll(&mut app);

	assert_eq!(leaving, Some(true));
	assert_eq!(leave, vec![Call::Leave(JOINED.to_owned())]);
	assert!(app.navigation.main_route() == Route::Conversations);
	assert!(app.surfaces.s13_space_settings.joined.is_empty());
}

#[test]
fn a_refused_leave_keeps_the_screen_open_with_its_reason() {
	let mut app = linked();
	land(&mut app, Answer::Accepted { invitation: invitation(), outcome: Ok(joined("online")) });

	land(
		&mut app,
		Answer::Left {
			joined_id: JOINED.to_owned(),
			outcome: Err(refused(
				"joined_space_remove",
				json!({ "kind": "relayRefused", "detail": "" }),
			)),
		},
	);
	poll(&mut app);

	assert!(app.navigation.main_route() == Route::SpaceSettings);
	assert_eq!(
		notice_titles(&app),
		vec![said(chat::screen::notice::join_refused::relay_refused::TITLE)]
	);
}

fn escape() -> KeyEvent {
	KeyEvent { key: Pressed::Escape, mods: rune::Mods::default() }
}

#[test]
fn escape_closes_the_open_question() {
	let mut app = opened();
	space_event(&mut app, SpaceEvent::AskDanger);

	let is_handled = key_pressed(&mut app, &escape());

	assert!(is_handled);
	assert_eq!(with_screen(&app, |screen| screen.settings.asking), Some(false));
	assert!(!key_pressed(&mut app, &escape()));
}

#[test]
fn a_notice_leaves_once_its_lifetime_is_due() {
	let mut app = opened();
	land(&mut app, Answer::Spaces(Err(refused("space_list", json!({ "kind": "storage" })))));
	let raised = app.surfaces.s13_space_settings.notices[0].0;

	land(&mut app, Answer::Due(Due::Notice(raised)));

	assert_eq!(notice_titles(&app), Vec::<String>::new());
}

#[test]
fn leaving_the_route_closes_the_visit() {
	let mut app = opened();

	app.navigation.navigate_main(Route::Conversations);
	poll(&mut app);

	assert!(app.surfaces.s13_space_settings.visit.is_none());
}
