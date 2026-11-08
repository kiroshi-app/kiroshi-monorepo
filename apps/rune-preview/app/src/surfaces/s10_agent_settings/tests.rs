use kiroshi_core::agent::contract::OfferedModel;
use kiroshi_core::conversations::contract::{Bot, BotHistoryEntry, Skill};
use kiroshi_core::spaces::contract::Space;
use rune::TextEdit;
use serde::de::DeserializeOwned;
use serde_json::{Value, json};

use kiroshi_rune_kit::strings::bots::{roster, runtime, spaces};
use kiroshi_rune_kit::surfaces::s10_agent_settings::shell::Entry;
use kiroshi_rune_kit::surfaces::s10_agent_settings::skills::{FileFailure, SkillField};
use kiroshi_rune_kit::surfaces::s10_agent_settings::{Event, Field, Picker};
use kiroshi_rune_kit::tokens::Tokens;

use super::agent::{FALLBACK_MODELS, changes_runtime, identity_of, model_options_for};
use super::history::{days_of, matching, oldest_date, runs_of};
use super::worker::{Answer, Call, Membership, Range};
use super::{Confirming, Heard, Leaving, Notice, Read, State, heard_of, said, view};
use crate::app::App;
use crate::host::HostError;

const SPACE: &str = "space-1";
const BOT: &str = "bot-1";
const DAY: i64 = 86_400;
const TODAY: i64 = 20_000;

fn read<T: DeserializeOwned>(value: Value) -> T {
	serde_json::from_value(value).expect("the fixture reads as its core type")
}

fn bot_named(id: &str, name: &str, model: &str) -> Bot {
	read(json!({
		"id": id,
		"sectionId": null,
		"pinPosition": null,
		"name": name,
		"title": "Archivist",
		"model": model,
		"avatarBlot": 132,
		"avatarImagePath": null,
		"instructions": "Answer with the file.",
		"memory": "",
		"deniedTools": [],
		"changesNothing": false,
		"permissions": { "defaultMode": "default", "allow": [], "ask": [], "deny": [] },
		"outputStyle": "default",
		"effort": null,
		"createdAt": 1,
	}))
}

fn bot() -> Bot {
	bot_named(BOT, "Nest Keeper", "sonnet")
}

fn skill(id: &str, body: &str) -> Skill {
	read(json!({
		"id": id,
		"name": id,
		"description": "How this project words a changelog entry",
		"body": body,
		"isPreloaded": false,
		"isSystem": false,
		"files": ["reference/style.md"],
	}))
}

fn entry(id: &str, title: &str, timestamp: i64, author: &str, paths: &[&str]) -> BotHistoryEntry {
	read(json!({
		"id": id,
		"timestamp": timestamp,
		"author": author,
		"title": title,
		"body": "",
		"paths": paths,
	}))
}

fn space(id: &str) -> Space {
	read(json!({
		"id": id,
		"name": id,
		"colour": null,
		"position": 0,
		"createdAt": 1,
		"shared": false,
		"instanceId": null,
	}))
}

fn refused() -> HostError {
	HostError::InProcess { cause: "the store refused".to_owned() }
}

fn notice(key: kiroshi_rune_kit::strings::Key) -> Option<Notice> {
	Some(Notice { title: said(key) })
}

fn opened() -> State {
	let mut state = State::default();
	state.open(SPACE, BOT);
	state.queued.clear();
	state
}

fn loaded() -> State {
	let mut state = opened();
	state.answered(Answer::Agent { bot_id: BOT.to_owned(), bots: Ok(vec![bot()]) });
	state.landed.clear();
	state
}

fn open_of(state: &State) -> &super::Open {
	state.open.as_ref().expect("the dialog is open")
}

fn shown_name(state: &State) -> String {
	open_of(state).agent.loaded().expect("the agent is read").name.text.clone()
}

fn typed(state: &mut State, field: Field, text: &str) {
	*state.edit(field) = TextEdit::new(text);
}

fn described(state: &State) -> Option<(String, bool)> {
	state.queued.iter().find_map(|call| match call {
		Call::Describe { identity, restarts, .. } => Some((identity.name.clone(), *restarts)),
		_ => None,
	})
}

#[test]
fn opening_reads_the_agent_its_spaces_and_the_models_and_shows_loading() {
	let mut state = State::default();
	state.open(SPACE, BOT);

	assert!(matches!(open_of(&state).agent, Read::Loading));
	assert_eq!(
		state.queued,
		vec![
			Call::ReadAgent { space_id: SPACE.to_owned(), bot_id: BOT.to_owned() },
			Call::ReadSpaces { bot_id: BOT.to_owned() },
			Call::ReadModels,
		]
	);
}

#[test]
fn a_second_opening_does_not_reread_a_read_catalogue() {
	let mut state = opened();
	state.answered(Answer::Models(Ok(Vec::new())));
	state.open(SPACE, BOT);

	assert!(!state.queued.contains(&Call::ReadModels));
}

#[test]
fn the_read_agent_fills_every_field_and_lands_in_the_roster() {
	let mut state = opened();
	state.answered(Answer::Agent { bot_id: BOT.to_owned(), bots: Ok(vec![bot()]) });

	let fields = open_of(&state).agent.loaded().expect("the agent is read");
	assert_eq!(fields.name.text, "Nest Keeper");
	assert_eq!(fields.title.text, "Archivist");
	assert_eq!(fields.shown.model, "sonnet");
	assert_eq!(state.landed, vec![bot()]);
}

#[test]
fn an_unread_agent_fails_with_the_roster_notice() {
	let mut state = opened();
	state.answered(Answer::Agent { bot_id: BOT.to_owned(), bots: Err(refused()) });

	assert!(matches!(open_of(&state).agent, Read::Failed));
	assert_eq!(open_of(&state).notice, notice(roster::FAILED));
}

#[test]
fn an_answer_about_another_agent_is_ignored() {
	let mut state = opened();
	let other = bot_named("bot-2", "Wren", "opus");
	state.answered(Answer::Agent { bot_id: "bot-2".to_owned(), bots: Ok(vec![other]) });

	assert!(matches!(open_of(&state).agent, Read::Loading));
}

#[test]
fn a_typed_name_is_written_on_the_next_poll_and_shown_once_saved() {
	let mut state = loaded();
	typed(&mut state, Field::Name, "Archive Keeper");
	state.poll();

	assert_eq!(described(&state), Some(("Archive Keeper".to_owned(), false)));
	let saved = bot_named(BOT, "Archive Keeper", "sonnet");
	state.answered(Answer::Described {
		bot_id: BOT.to_owned(),
		restarts: false,
		written: Ok(saved.clone()),
	});

	assert_eq!(shown_name(&state), "Archive Keeper");
	assert_eq!(state.landed, vec![saved]);
}

#[test]
fn an_unchanged_name_writes_nothing() {
	let mut state = loaded();
	typed(&mut state, Field::Name, "Nest Keeper");
	state.poll();

	assert_eq!(described(&state), None);
}

#[test]
fn a_refused_write_keeps_the_saved_name_and_raises_the_settings_notice() {
	let mut state = loaded();
	typed(&mut state, Field::Name, "Archive Keeper");
	state.poll();
	state.answered(Answer::Described {
		bot_id: BOT.to_owned(),
		restarts: false,
		written: Err(refused()),
	});

	assert_eq!(shown_name(&state), "Nest Keeper");
	assert_eq!(open_of(&state).notice, notice(roster::SETTINGS_UNSAVED));
	assert!(state.landed.is_empty());
}

#[test]
fn a_new_colour_is_shown_at_once_and_does_not_restart_the_session() {
	let mut state = loaded();
	state.handle(Event::Hue(Some(186.0)));

	let fields = open_of(&state).agent.loaded().expect("the agent is read");
	assert_eq!(fields.shown.avatar_blot.map(|hue| hue.value()), Some(186));
	assert_eq!(described(&state).map(|(_, restarts)| restarts), Some(false));
}

#[test]
fn removing_the_picture_writes_no_image() {
	let mut state = loaded();
	state.handle(Event::RemovePicture);

	let identity = state.queued.iter().find_map(|call| match call {
		Call::Describe { identity, .. } => Some(identity.avatar_image_path.clone()),
		_ => None,
	});
	assert_eq!(identity, Some(None));
}

#[test]
fn a_picked_model_restarts_the_session_once_saved() {
	let mut state = loaded();
	state.handle(Event::OpenPicker(Picker::Model));
	assert_eq!(open_of(&state).picking, Some(Picker::Model));

	state.handle(Event::Pick(Picker::Model, "opus".to_owned()));
	assert_eq!(open_of(&state).picking, None);
	assert_eq!(described(&state).map(|(_, restarts)| restarts), Some(true));

	state.queued.clear();
	state.answered(Answer::Described {
		bot_id: BOT.to_owned(),
		restarts: true,
		written: Ok(bot_named(BOT, "Nest Keeper", "opus")),
	});
	assert_eq!(state.queued, vec![Call::Restart { bot_id: BOT.to_owned() }]);
}

#[test]
fn a_pending_name_rides_along_with_a_colour_change() {
	let mut state = loaded();
	typed(&mut state, Field::Name, "Archive Keeper");
	state.handle(Event::Hue(None));

	assert_eq!(described(&state).map(|(name, _)| name), Some("Archive Keeper".to_owned()));
}

#[test]
fn the_runtime_rule_matches_changes_runtime_in_apps_app() {
	let held = bot();
	let mut next = identity_of(&held);
	assert!(!changes_runtime(&held, &next));

	next.model = "opus".to_owned();
	assert!(changes_runtime(&held, &next));

	let mut guarded = bot();
	guarded.denied_tools = vec!["Bash".to_owned()];
	assert!(changes_runtime(&guarded, &identity_of(&guarded)));
}

#[test]
fn the_model_list_falls_back_when_the_catalogue_is_empty() {
	let options = model_options_for("sonnet", &[]);
	let values: Vec<&str> = options.iter().map(|option| option.value.as_str()).collect();

	assert_eq!(values, FALLBACK_MODELS.to_vec());
}

#[test]
fn the_model_list_keeps_the_current_model_and_drops_the_unrunnable_one() {
	let catalogue: Vec<OfferedModel> = read(json!([
		{ "value": "default", "supportedEffortLevels": [] },
		{ "value": "opus", "supportedEffortLevels": ["low", "high"] },
	]));
	let options = model_options_for("claude-old", &catalogue);
	let values: Vec<&str> = options.iter().map(|option| option.value.as_str()).collect();

	assert_eq!(values, vec!["opus", "claude-old"]);
	assert_eq!(options[0].efforts.len(), 2);
}

#[test]
fn an_unread_catalogue_raises_the_model_notice() {
	let mut state = opened();
	state.answered(Answer::Models(Err(refused())));

	assert!(matches!(state.models, Read::Failed));
	assert_eq!(open_of(&state).notice, notice(runtime::model::UNREADABLE));
}

fn shared_spaces(state: &mut State) {
	let memberships = vec![
		Membership { space: space("space-1"), is_shared: true },
		Membership { space: space("space-2"), is_shared: false },
	];
	state.answered(Answer::Spaces { bot_id: BOT.to_owned(), memberships: Ok(memberships) });
}

fn is_shared_in(state: &State, space_id: &str) -> bool {
	state
		.spaces()
		.and_then(|spaces| spaces.iter().find(|held| held.space.id == space_id))
		.is_some_and(|held| held.is_shared)
}

#[test]
fn sharing_with_a_space_shows_at_once_and_is_written() {
	let mut state = loaded();
	shared_spaces(&mut state);
	state.share("space-2");

	assert!(is_shared_in(&state, "space-2"));
	assert_eq!(
		state.queued,
		vec![Call::Share {
			bot_id: BOT.to_owned(),
			space_id: "space-2".to_owned(),
			is_shared: true,
		}]
	);
}

#[test]
fn a_refused_removal_restores_the_space_with_its_notice() {
	let mut state = loaded();
	shared_spaces(&mut state);
	state.share("space-1");
	state.answered(Answer::Shared {
		bot_id: BOT.to_owned(),
		space_id: "space-1".to_owned(),
		is_shared: false,
		outcome: Err(refused()),
	});

	assert!(is_shared_in(&state, "space-1"));
	assert_eq!(open_of(&state).notice, notice(spaces::remove::FAILED));
}

#[test]
fn removing_the_last_space_names_the_last_space() {
	let mut state = loaded();
	shared_spaces(&mut state);
	state.share("space-1");
	let last = HostError::InProcess { cause: "{\"kind\":\"lastSpaceOfBot\"}".to_owned() };
	state.answered(Answer::Shared {
		bot_id: BOT.to_owned(),
		space_id: "space-1".to_owned(),
		is_shared: false,
		outcome: Err(last),
	});

	assert_eq!(open_of(&state).notice, notice(spaces::remove::LAST_SPACE));
}

fn with_skills(state: &mut State) {
	state.handle(Event::Entry(Entry::Skills));
	state.answered(Answer::Skills {
		bot_id: BOT.to_owned(),
		skills: Ok(vec![skill("release-notes", "One line per change.")]),
	});
	state.queued.clear();
}

fn draft_body(state: &State) -> String {
	let draft = open_of(state).draft.as_ref().expect("a skill is open");
	draft.texts.get(SkillField::Body).text.clone()
}

#[test]
fn the_skills_panel_loads_then_lists_the_skills() {
	let mut state = loaded();
	state.handle(Event::Entry(Entry::Skills));

	assert!(matches!(open_of(&state).skills, Read::Loading));
	assert!(state.queued.contains(&Call::ReadSkills { bot_id: BOT.to_owned() }));

	state.answered(Answer::Skills { bot_id: BOT.to_owned(), skills: Ok(Vec::new()) });
	assert!(open_of(&state).skills.loaded().is_some_and(Vec::is_empty));
}

#[test]
fn an_edited_skill_is_unsaved_until_its_save_lands() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	typed(&mut state, Field::Skill(SkillField::Body), "Past tense, one line each.");

	let draft = open_of(&state).draft.as_ref().expect("a skill is open");
	assert!(draft.is_unsaved());

	state.handle(Event::SaveSkill);
	let saved_draft = state.queued.iter().find_map(|call| match call {
		Call::SaveSkill { skill_id, draft, .. } => Some((skill_id.clone(), draft.body.clone())),
		_ => None,
	});
	assert_eq!(
		saved_draft,
		Some((Some("release-notes".to_owned()), "Past tense, one line each.".to_owned()))
	);

	state.queued.clear();
	state.answered(Answer::SkillSaved {
		bot_id: BOT.to_owned(),
		skill_id: Some("release-notes".to_owned()),
		saved: Ok(skill("release-notes", "Past tense, one line each.")),
	});
	assert_eq!(draft_body(&state), "Past tense, one line each.");
	assert!(!open_of(&state).draft.as_ref().is_some_and(super::skills::Draft::is_unsaved));
	assert_eq!(state.queued, vec![Call::ReadSkills { bot_id: BOT.to_owned() }]);
}

#[test]
fn a_refused_skill_save_keeps_the_draft() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	typed(&mut state, Field::Skill(SkillField::Body), "Draft");
	state.handle(Event::SaveSkill);
	state.answered(Answer::SkillSaved {
		bot_id: BOT.to_owned(),
		skill_id: Some("release-notes".to_owned()),
		saved: Err(refused()),
	});

	assert_eq!(draft_body(&state), "Draft");
	assert_eq!(open_of(&state).notice, notice(roster::SETTINGS_UNSAVED));
}

#[test]
fn a_new_skill_is_created_without_an_id() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::AddSkill);
	typed(&mut state, Field::Skill(SkillField::Name), "commit-style");
	state.handle(Event::SaveSkill);

	let created = state.queued.iter().any(|call| {
		matches!(call, Call::SaveSkill { skill_id: None, draft, .. } if draft.name == "commit-style")
	});
	assert!(created);
}

#[test]
fn closing_over_an_unsaved_skill_asks_and_keeps_the_draft() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	typed(&mut state, Field::Skill(SkillField::Body), "Draft");
	state.handle(Event::Close);

	assert_eq!(open_of(&state).confirming, Some(Confirming::Leave(Leaving::Dialog)));
	assert_eq!(draft_body(&state), "Draft");

	state.handle(Event::Dismiss);
	assert_eq!(open_of(&state).confirming, None);
	assert_eq!(draft_body(&state), "Draft");

	state.handle(Event::Close);
	state.handle(Event::ConfirmLeaveSkill);
	assert!(!state.is_open());
}

#[test]
fn closing_over_a_saved_skill_closes_at_once() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	state.handle(Event::Close);

	assert!(!state.is_open());
}

#[test]
fn going_back_from_an_unsaved_skill_asks_then_returns_to_the_list() {
	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	typed(&mut state, Field::Skill(SkillField::Body), "Draft");
	state.handle(Event::Back);

	assert_eq!(open_of(&state).confirming, Some(Confirming::Leave(Leaving::Editor)));
	state.handle(Event::ConfirmLeaveSkill);
	assert!(open_of(&state).draft.is_none());
	assert!(state.is_open());
}

fn opened_file(state: &mut State) {
	with_skills(state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	state.handle(Event::OpenFile("reference/style.md".to_owned()));
}

fn file_text(state: &State) -> Option<String> {
	let draft = open_of(state).draft.as_ref()?;
	draft.file.as_ref()?.text.as_ref().map(|text| text.text.clone())
}

#[test]
fn opening_a_skill_file_reads_then_shows_its_content() {
	let mut state = loaded();
	opened_file(&mut state);

	assert_eq!(
		state.queued,
		vec![Call::ReadFile {
			bot_id: BOT.to_owned(),
			skill_id: "release-notes".to_owned(),
			path: "reference/style.md".to_owned(),
		}]
	);
	assert_eq!(file_text(&state), None);

	state.answered(Answer::File {
		bot_id: BOT.to_owned(),
		skill_id: "release-notes".to_owned(),
		path: "reference/style.md".to_owned(),
		text: Ok("# House style".to_owned()),
	});
	assert_eq!(file_text(&state), Some("# House style".to_owned()));
}

#[test]
fn an_unread_skill_file_shows_the_read_failure() {
	let mut state = loaded();
	opened_file(&mut state);
	state.answered(Answer::File {
		bot_id: BOT.to_owned(),
		skill_id: "release-notes".to_owned(),
		path: "reference/style.md".to_owned(),
		text: Err(refused()),
	});

	let draft = open_of(&state).draft.as_ref().expect("a skill is open");
	assert_eq!(draft.file.as_ref().and_then(|file| file.failure), Some(FileFailure::Read));
}

#[test]
fn a_saved_skill_file_is_written_and_no_longer_unsaved() {
	let mut state = loaded();
	opened_file(&mut state);
	state.answered(Answer::File {
		bot_id: BOT.to_owned(),
		skill_id: "release-notes".to_owned(),
		path: "reference/style.md".to_owned(),
		text: Ok("# House style".to_owned()),
	});
	typed(&mut state, Field::FileText, "# Style");
	state.queued.clear();
	state.handle(Event::SaveFile);

	assert_eq!(
		state.queued,
		vec![Call::WriteFile {
			bot_id: BOT.to_owned(),
			skill_id: "release-notes".to_owned(),
			path: "reference/style.md".to_owned(),
			text: "# Style".to_owned(),
		}]
	);
	state.answered(Answer::FileWritten {
		bot_id: BOT.to_owned(),
		skill_id: "release-notes".to_owned(),
		path: "reference/style.md".to_owned(),
		outcome: Ok(()),
	});
	let draft = open_of(&state).draft.as_ref().expect("a skill is open");
	assert!(!draft.is_unsaved_anywhere());
}

fn history() -> Vec<BotHistoryEntry> {
	let at = TODAY * DAY;
	vec![
		entry("c1", "Created the bundle", at - 3 * DAY, "bot", &["agent.json"]),
		entry("c2", "Rewrote the instructions", at - DAY + 600, "user", &["AGENTS.md"]),
		entry("c3", "Tightened the wording", at + 3_600, "bot", &["AGENTS.md"]),
		entry("c4", "Tightened the wording", at + 7_200, "bot", &["AGENTS.md"]),
	]
}

fn with_history(state: &mut State) {
	state.handle(Event::Entry(Entry::History));
	state.answered(Answer::History { bot_id: BOT.to_owned(), entries: Ok(history()) });
	state.queued.clear();
}

#[test]
fn the_history_panel_loads_then_fails_or_lists() {
	let mut state = loaded();
	state.handle(Event::Entry(Entry::History));
	assert!(matches!(open_of(&state).history, Read::Loading));
	assert!(state.queued.contains(&Call::ReadHistory { bot_id: BOT.to_owned() }));

	state.answered(Answer::History { bot_id: BOT.to_owned(), entries: Err(refused()) });
	assert!(matches!(open_of(&state).history, Read::Failed));
}

#[test]
fn changes_group_by_day_newest_first_and_join_retouches() {
	let runs = runs_of(&history());
	let days = days_of(&matching(&runs, ""), TODAY);

	let labels: Vec<&str> = days.iter().map(|day| day.label.as_str()).collect();
	assert_eq!(labels, vec!["Today", "Yesterday", "1 October"]);
	assert_eq!(days[0].changes.len(), 1);
	assert_eq!(days[0].changes[0].id, "c4");
	assert_eq!(days[0].changes[0].retouches, 2);
	assert_eq!(days[0].changes[0].time, "02:00");
	assert_eq!(oldest_date(&history()), "1 October 2024");
}

#[test]
fn search_keeps_the_runs_whose_text_or_paths_match_ignoring_accents() {
	let runs = runs_of(&history());

	let found: Vec<&str> =
		matching(&runs, "  RÉWROTE ").iter().map(|run| run.id.as_str()).collect();
	assert_eq!(found, vec!["c2"]);
	let by_path: Vec<&str> =
		matching(&runs, "agent.json").iter().map(|run| run.id.as_str()).collect();
	assert_eq!(by_path, vec!["c1"]);
}

#[test]
fn undoing_a_change_asks_then_reverts_its_range() {
	let mut state = loaded();
	with_history(&mut state);
	state.handle(Event::Undo("c4".to_owned()));
	assert_eq!(open_of(&state).confirming, Some(Confirming::Undo("c4".to_owned())));

	state.handle(Event::ConfirmUndo);
	assert_eq!(
		state.queued,
		vec![Call::Undo {
			bot_id: BOT.to_owned(),
			range: Range { oldest: "c3".to_owned(), newest: "c4".to_owned() },
		}]
	);
}

#[test]
fn an_undone_change_is_marked_and_refreshes_skills_and_agent() {
	let mut state = loaded();
	with_history(&mut state);
	let mut reverted = history();
	reverted.push(entry(
		"c5",
		"Change undone: Rewrote the instructions",
		TODAY * DAY + 9_000,
		"user",
		&["AGENTS.md"],
	));
	state.answered(Answer::Undone { bot_id: BOT.to_owned(), entries: Ok(reverted) });

	let entries = open_of(&state).history.loaded().expect("the history is read");
	let undone: Vec<String> =
		runs_of(entries).into_iter().filter(|run| run.is_undone).map(|run| run.id).collect();
	assert_eq!(undone, vec!["c2".to_owned()]);
	assert_eq!(
		state.queued,
		vec![
			Call::ReadSkills { bot_id: BOT.to_owned() },
			Call::ReadAgent { space_id: SPACE.to_owned(), bot_id: BOT.to_owned() },
			Call::Restart { bot_id: BOT.to_owned() },
		]
	);
}

#[test]
fn a_refused_undo_keeps_the_history_and_raises_a_notice() {
	let mut state = loaded();
	with_history(&mut state);
	state.answered(Answer::Undone { bot_id: BOT.to_owned(), entries: Err(refused()) });

	assert_eq!(open_of(&state).history.loaded().map(Vec::len), Some(4));
	assert_eq!(open_of(&state).notice, notice(roster::SETTINGS_UNSAVED));
}

#[test]
fn opening_a_change_reads_its_files_or_fails() {
	let mut state = loaded();
	with_history(&mut state);
	state.handle(Event::OpenChange("c4".to_owned()));

	assert_eq!(
		state.queued,
		vec![Call::ReadChange {
			bot_id: BOT.to_owned(),
			range: Range { oldest: "c3".to_owned(), newest: "c4".to_owned() },
		}]
	);
	state.answered(Answer::Change {
		bot_id: BOT.to_owned(),
		newest: "c4".to_owned(),
		files: Err(refused()),
	});
	let change = open_of(&state).change.as_ref().expect("the change is open");
	assert!(matches!(change.files, Read::Failed));

	state.handle(Event::Back);
	assert!(open_of(&state).change.is_none());
}

#[test]
fn an_event_about_the_open_agent_refreshes_it_and_its_panel() {
	let mut state = loaded();
	with_history(&mut state);
	state.heard(Heard::Updated(Box::new(bot_named(BOT, "Renamed", "sonnet"))));

	assert_eq!(shown_name(&state), "Renamed");
	assert_eq!(state.queued, vec![Call::ReadHistory { bot_id: BOT.to_owned() }]);
	assert_eq!(state.landed.len(), 1);
}

#[test]
fn an_event_about_another_agent_only_reaches_the_roster() {
	let mut state = loaded();
	state.heard(Heard::Updated(Box::new(bot_named("bot-2", "Wren", "opus"))));

	assert_eq!(shown_name(&state), "Nest Keeper");
	assert!(state.queued.is_empty());
	assert_eq!(state.landed.len(), 1);
}

#[test]
fn a_deleted_open_agent_closes_its_settings() {
	let mut state = loaded();
	state.heard(Heard::Deleted { id: BOT.to_owned() });

	assert!(!state.is_open());
}

#[test]
fn companion_events_are_heard_and_others_are_not() {
	let payload = json!({ "id": BOT, "bot": serde_json::to_value(bot()).expect("a bot writes") });
	let heard = heard_of("companion://updated", payload).map(|read| read.ok());
	assert_eq!(heard, Some(Some(Heard::Updated(Box::new(bot())))));

	let deleted = heard_of("companion://deleted", json!({ "id": BOT, "spaceId": SPACE }));
	assert_eq!(deleted.map(|read| read.ok()), Some(Some(Heard::Deleted { id: BOT.to_owned() })));
	assert!(heard_of("conversation://message-stored", json!({})).is_none());
}

#[test]
fn every_panel_draws_from_its_state() {
	let t = Tokens::new(false);
	let mut app = App::new();
	assert!(view(&app, &t).is_empty());

	app.surfaces.s10_agent_settings = opened();
	assert_eq!(view(&app, &t).len(), 1);

	let mut state = loaded();
	with_skills(&mut state);
	state.handle(Event::OpenSkill("release-notes".to_owned()));
	typed(&mut state, Field::Skill(SkillField::Body), "Draft");
	state.handle(Event::Close);
	app.surfaces.s10_agent_settings = state;
	assert_eq!(view(&app, &t).len(), 2);

	let mut state = loaded();
	with_history(&mut state);
	state.handle(Event::Undo("c4".to_owned()));
	app.surfaces.s10_agent_settings = state;
	assert_eq!(view(&app, &t).len(), 2);

	for entry in [Entry::General, Entry::Appearance, Entry::Runtime] {
		let mut state = loaded();
		state.handle(Event::Entry(entry));
		app.surfaces.s10_agent_settings = state;
		assert_eq!(view(&app, &t).len(), 1);
	}
}
