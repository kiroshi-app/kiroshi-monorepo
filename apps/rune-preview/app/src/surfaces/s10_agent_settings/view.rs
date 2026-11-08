use std::time::{SystemTime, UNIX_EPOCH};

use kiroshi_core::conversations::contract::{BotHistoryEntry, HistoryAuthor};
use rune::{El, col, el};

use kiroshi_rune_kit::primitives::toast::{Toast, ToastType, toast};
use kiroshi_rune_kit::strings::bots::history::author;
use kiroshi_rune_kit::surfaces::s10_agent_settings::agent::{
	self as kit_agent, General, Identity, Model, OutputStyle, Runtime,
};
use kiroshi_rune_kit::surfaces::s10_agent_settings::history::{
	self as kit_history, Author, Authors, Change as KitChange, ChangeFile, ChangePage, Day,
	HistoryList,
};
use kiroshi_rune_kit::surfaces::s10_agent_settings::shell::{
	self, Entry, MENU_DEFAULT_WIDTH, Menu,
};
use kiroshi_rune_kit::surfaces::s10_agent_settings::skills::{
	self as kit_skills, OpenedFile, SkillEditor, SkillFiles, SkillItem,
};
use kiroshi_rune_kit::surfaces::s10_agent_settings::{Confirm, Density, confirmation};
use kiroshi_rune_kit::tokens::Tokens;

use super::agent::{Fields, ModelOption, effort_of, hue_value, model_options_for};
use super::history::{
	ShownDay, dated, day_of, days_of, matching, oldest_date, retouches_of, runs_of,
};
use super::skills::Draft;
use super::{Change, Confirming, Leaving, Notice, Open, Read, said};
use crate::app::{App, Person};
use crate::navigation::Route;

const CONCISE_STYLE: &str = "concise";

const DENSITY: Density = Density::Page;

fn today() -> i64 {
	let seconds = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| i64::try_from(elapsed.as_secs()).unwrap_or(i64::MAX));
	day_of(seconds)
}

fn reader_of(app: &App) -> String {
	match app.ready().map(|ready| &ready.person) {
		Some(Person::SignedIn(name)) => name.clone(),
		Some(Person::SignedOut | Person::Unread) | None => String::new(),
	}
}

fn identity_of(fields: Option<&Fields>) -> Identity<'_> {
	Identity {
		name: fields.map_or("", |fields| fields.shown.name.as_str()),
		hue: fields.and_then(|fields| hue_value(fields.shown.avatar_blot)),
		picture: None,
		working: false,
	}
}

fn notice_view(t: &Tokens, notice: &Notice) -> El {
	toast(t, Toast { kind: ToastType::Error, title: &notice.title, description: "", action: None })
}

fn runtime_view(t: &Tokens, fields: &Fields, options: &[ModelOption], open: &Open) -> El {
	let models: Vec<Model> = options
		.iter()
		.map(|option| Model {
			label: &option.value,
			value: &option.value,
			efforts: &option.efforts,
		})
		.collect();
	let output_style = if fields.shown.output_style == CONCISE_STYLE {
		OutputStyle::Concise
	} else {
		OutputStyle::Standard
	};
	let runtime = Runtime {
		models: &models,
		model: &fields.shown.model,
		effort: fields.shown.effort.map(effort_of),
		output_style,
		picking: open.picking,
	};
	kit_agent::runtime::<App>(t, DENSITY, &runtime)
}

fn agent_panel(app: &App, t: &Tokens, open: &Open) -> El {
	let Some(fields) = open.agent.loaded() else { return el() };
	match open.entry {
		Entry::General => kit_agent::general::<App>(
			t,
			DENSITY,
			&General { name: &fields.name, title: &fields.title },
		),
		Entry::Appearance => kit_agent::appearance::<App>(t, DENSITY, &identity_of(Some(fields))),
		Entry::Runtime => {
			let catalogue = app.surfaces.s10_agent_settings.models.loaded();
			let options =
				model_options_for(&fields.shown.model, catalogue.map_or(&[], Vec::as_slice));
			runtime_view(t, fields, &options, open)
		}
		Entry::Instructions
		| Entry::Skills
		| Entry::Applications
		| Entry::Secrets
		| Entry::History
		| Entry::Approvals
		| Entry::Danger => el(),
	}
}

fn skills_list(t: &Tokens, open: &Open) -> El {
	let items: Option<Vec<SkillItem>> = open.skills.loaded().map(|skills| {
		skills
			.iter()
			.map(|skill| SkillItem {
				id: &skill.id,
				name: &skill.name,
				description: &skill.description,
				preloaded: skill.is_preloaded,
				system: skill.is_system,
			})
			.collect()
	});
	kit_skills::skills_panel::<App>(t, DENSITY, items.as_deref())
}

fn skill_editor(app: &App, t: &Tokens, draft: &Draft) -> El {
	let paths: Option<Vec<&str>> =
		draft.kept.as_ref().map(|skill| skill.files.iter().map(String::as_str).collect());
	let opened = draft.file.as_ref().map(|file| OpenedFile {
		path: &file.path,
		text: file.text.as_ref(),
		failure: file.failure,
		unsaved: file.is_unsaved(),
	});
	let files = paths.as_ref().map(|paths| SkillFiles {
		paths: Some(paths),
		opened,
		new_path: &app.surfaces.s10_agent_settings.spare,
		refusal: None,
	});
	let editor = SkillEditor {
		texts: &draft.texts,
		section: draft.section,
		written: draft.kept.is_some(),
		unsaved: draft.is_unsaved(),
		name_refused: false,
		switches: draft.switches,
		effort: draft.effort(),
		fork: draft.fork(),
		files,
	};
	kit_skills::skill_editor::<App>(t, &editor)
}

fn author_of(author: HistoryAuthor) -> Author {
	match author {
		HistoryAuthor::Bot => Author::Agent,
		HistoryAuthor::User => Author::You,
	}
}

fn history_list(app: &App, t: &Tokens, open: &Open, name: &str, hue: Option<f32>) -> El {
	let reader = reader_of(app);
	let authors = Authors { agent: name, hue, reader: &reader };
	let entries: &[BotHistoryEntry] = open.history.loaded().map_or(&[], Vec::as_slice);
	let runs = runs_of(entries);
	let search = open.search.as_ref();
	let shown: Vec<ShownDay> =
		days_of(&matching(&runs, search.map_or("", |edit| edit.text.as_str())), today());
	let changes: Vec<Vec<KitChange>> = shown
		.iter()
		.map(|day| {
			day.changes
				.iter()
				.map(|change| KitChange {
					id: &change.id,
					author: author_of(change.author),
					sentence: &change.sentence,
					detail: change.detail.as_deref(),
					time: &change.time,
					retouches: change.retouches,
					undone: change.is_undone,
				})
				.collect()
		})
		.collect();
	let days: Vec<Day> = shown
		.iter()
		.zip(&changes)
		.map(|(day, changes)| Day { label: &day.label, changes })
		.collect();
	let oldest = oldest_date(entries);
	let list = HistoryList {
		days: open.history.loaded().map(|_| days.as_slice()),
		failed: matches!(open.history, Read::Failed),
		oldest: &oldest,
		authors,
		search,
		openable: true,
	};
	kit_history::history_panel::<App>(t, DENSITY, &list)
}

fn change_view(t: &Tokens, open: &Open, change: &Change, name: &str) -> El {
	let entries: &[BotHistoryEntry] = open.history.loaded().map_or(&[], Vec::as_slice);
	let run = runs_of(entries).into_iter().find(|run| run.id == change.range.newest);
	let files: Option<Vec<ChangeFile>> = change.files.loaded().map(|files| {
		files.iter().map(|file| ChangeFile { path: &file.path, patch: &file.patch }).collect()
	});
	let Some(run) = run else { return el() };
	let author = match run.author {
		HistoryAuthor::Bot => name.to_owned(),
		HistoryAuthor::User => said(author::USER),
	};
	let date = dated(run.timestamp, today());
	let page = ChangePage {
		title: &run.title,
		author: &author,
		date: &date,
		reason: (!run.body.is_empty()).then_some(run.body.as_str()),
		retouches: retouches_of(&run),
		files: files.as_deref().or(matches!(change.files, Read::Failed).then_some(&[][..])),
		failed: matches!(change.files, Read::Failed),
		chosen: change.chosen.as_deref(),
	};
	kit_history::change_page::<App>(t, &page)
}

fn body(app: &App, t: &Tokens, open: &Open) -> El {
	let fields = open.agent.loaded();
	let name = fields.map_or("", |fields| fields.shown.name.as_str());
	let hue = identity_of(fields.map(AsRef::as_ref)).hue;
	match (open.entry, &open.draft, &open.change) {
		(Entry::Skills, Some(draft), _) => skill_editor(app, t, draft),
		(Entry::Skills, None, _) => skills_list(t, open),
		(Entry::History, _, Some(change)) => change_view(t, open, change, name),
		(Entry::History, _, None) => history_list(app, t, open, name, hue),
		_ => agent_panel(app, t, open),
	}
}

fn confirmation_of(t: &Tokens, open: &Open) -> Option<El> {
	match open.confirming.as_ref()? {
		Confirming::Leave(Leaving::Dialog | Leaving::Editor) => {
			Some(confirmation::<App>(t, Confirm::LeaveSkill))
		}
		Confirming::Undo(id) => {
			let run = runs_of(open.history.loaded()?).into_iter().find(|run| run.id == *id)?;
			Some(confirmation::<App>(t, Confirm::Undo(&run.title)))
		}
	}
}

fn open_of(app: &App) -> Option<&Open> {
	let is_shown = app.navigation.main_route() == Route::AgentSettings;
	app.surfaces.s10_agent_settings.open.as_ref().filter(|_| is_shown)
}

pub fn view(app: &App, t: &Tokens) -> El {
	let Some(open) = open_of(app) else { return el() };
	let menu = Menu {
		back: Menu::back_to_conversations(),
		identity: identity_of(open.agent.loaded().map(AsRef::as_ref)),
		width: MENU_DEFAULT_WIDTH,
		has_history: true,
	};
	let page = col()
		.w_full()
		.grow(1.0)
		.children(open.notice.as_ref().map(|notice| notice_view(t, notice)))
		.child(body(app, t, open));
	shell::screen::<App>(t, &menu, open.entry, page)
}

pub fn layers(app: &App, t: &Tokens) -> Vec<El> {
	open_of(app).and_then(|open| confirmation_of(t, open)).into_iter().collect()
}
