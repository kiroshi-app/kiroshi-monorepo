use std::fs;
use std::path::Path;

use tauri::{AppHandle, Runtime};

use super::contract::{
	ClaudeImportOutcome, ClaudeImportProgress, ClaudeImportResult, ClaudeImportSkip,
};
use super::source::{source_of, Source, CLAUDE_MD, SKILL_FILE};
use crate::bundles::{self, SkillDraft, SkillFront};
use crate::companions::launch;
use crate::conversations::commands::create_drafted_bot;
use crate::conversations::contract::{BotDraft, TranscriptStoreError};
use crate::db;
use crate::events::CLAUDE_IMPORT_PROGRESS;

const CLAUDE_MD_DESCRIPTION: &str = "The person's own instructions, carried over from CLAUDE.md.";
const FINDER_LITTER: &str = ".DS_Store";

pub(super) struct Importer<'a, R: Runtime> {
	pub(super) app: &'a AppHandle<R>,
	pub(super) database: &'a db::Database,
	pub(super) root: &'a Path,
	pub(super) person: Option<&'a Path>,
	pub(super) space_id: &'a str,
}

struct Created {
	id: String,
	name: String,
}

enum Unimported {
	UnknownKey,
	NoPersonPlugin,
	Unread { relative: String, failure: std::io::Error },
	Linked { relative: String },
	Store(TranscriptStoreError),
	Unwritten(std::io::Error),
	LeftBehind { failure: std::io::Error, leftover: std::io::Error },
}

impl Unimported {
	fn cause(&self) -> String {
		match self {
			Unimported::UnknownKey => "the key names nothing that is imported".to_owned(),
			Unimported::NoPersonPlugin => {
				"the person's own plugin has not been laid down yet".to_owned()
			}
			Unimported::Unread { relative, failure } => {
				format!("{relative} did not read: {failure}")
			}
			Unimported::Linked { relative } => {
				format!("{relative} is a link, which is not followed")
			}
			Unimported::Store(failure) => format!("the store refused: {failure:?}"),
			Unimported::Unwritten(failure) => format!("the skill was not written: {failure}"),
			Unimported::LeftBehind { failure, leftover } => format!(
				"the skill was not written: {failure}, and its half was not taken back: {leftover}"
			),
		}
	}
}

impl From<TranscriptStoreError> for Unimported {
	fn from(failure: TranscriptStoreError) -> Self {
		Unimported::Store(failure)
	}
}

impl<R: Runtime> Importer<'_, R> {
	pub(super) async fn run(
		&self,
		selection: Vec<String>,
	) -> Result<Vec<ClaudeImportOutcome>, TranscriptStoreError> {
		let mut imported = self.database.user().claude_imported().await?;
		let total = selection.len();
		let mut outcomes = Vec::with_capacity(total);
		for (done, key) in (1..).zip(selection) {
			let result = if imported.contains(&key) {
				ClaudeImportResult::Skipped { reason: ClaudeImportSkip::AlreadyImported }
			} else {
				self.imported(&key).await
			};
			let result = match result {
				ClaudeImportResult::Imported { id, name } => {
					imported.insert(key.clone());
					self.marked(&key, id, name).await
				}
				settled => settled,
			};
			let progress =
				ClaudeImportProgress { key: key.clone(), result: result.clone(), done, total };
			launch::announce(self.app, CLAUDE_IMPORT_PROGRESS, progress);
			outcomes.push(ClaudeImportOutcome { key, result });
		}
		Ok(outcomes)
	}

	async fn marked(&self, key: &str, id: String, name: String) -> ClaudeImportResult {
		match self.database.user().mark_claude_imported(key.to_owned()).await {
			Ok(()) => ClaudeImportResult::Imported { id, name },
			Err(failure) => ClaudeImportResult::Failed {
				cause: format!("{id} was imported, but the import mark was not kept: {failure:?}"),
			},
		}
	}

	async fn imported(&self, key: &str) -> ClaudeImportResult {
		let created = match source_of(self.root, key) {
			Some(Source::Agent(path)) => self.agent(key, &path).await,
			Some(Source::Skill(dir)) => self.skill(key, &dir),
			Some(Source::ClaudeMd(path)) => self.claude_md(&path),
			None => Err(Unimported::UnknownKey),
		};
		match created {
			Ok(Created { id, name }) => ClaudeImportResult::Imported { id, name },
			Err(refusal) => ClaudeImportResult::Failed { cause: refusal.cause() },
		}
	}

	async fn agent(&self, key: &str, path: &Path) -> Result<Created, Unimported> {
		let fronted = bundles::fronted(&read(key, path)?).map_err(unread(key))?;
		let stem = path.file_stem().unwrap_or_default().to_string_lossy();
		let wanted = fronted.name.unwrap_or_else(|| stem.into_owned());
		let worn: Vec<String> = self
			.database
			.conversations()
			.bots(Some(self.space_id.to_owned()))
			.await
			.map_err(TranscriptStoreError::from)?
			.into_iter()
			.map(|bot| bot.name)
			.collect();
		let draft = BotDraft {
			name: unworn_name(&wanted, &worn),
			job: String::new(),
			description: fronted.body,
		};
		let created =
			create_drafted_bot(self.app, self.database, draft, self.space_id.to_owned()).await?;
		Ok(Created { id: created.id, name: created.name })
	}

	fn skill(&self, key: &str, dir: &Path) -> Result<Created, Unimported> {
		let person = self.person.ok_or(Unimported::NoPersonPlugin)?;
		let skill_file = format!("{key}/{SKILL_FILE}");
		let fronted = bundles::fronted(&read(&skill_file, &dir.join(SKILL_FILE))?)
			.map_err(unread(&skill_file))?;
		let files = skill_files(key, dir)?;
		let dir_name = dir.file_name().unwrap_or_default().to_string_lossy();
		let draft = SkillDraft {
			name: fronted.name.unwrap_or_else(|| dir_name.into_owned()),
			description: fronted.description,
			body: fronted.body,
			front: SkillFront::default(),
		};
		written(person, &draft, &files)
	}

	fn claude_md(&self, path: &Path) -> Result<Created, Unimported> {
		let person = self.person.ok_or(Unimported::NoPersonPlugin)?;
		let draft = SkillDraft {
			name: CLAUDE_MD.to_owned(),
			description: CLAUDE_MD_DESCRIPTION.to_owned(),
			body: read(CLAUDE_MD, path)?,
			front: SkillFront::default(),
		};
		written(person, &draft, &[])
	}
}

fn unworn_name(wanted: &str, worn: &[String]) -> String {
	let is_worn = |name: &str| worn.iter().any(|held| held.to_lowercase() == name.to_lowercase());
	if !is_worn(wanted) {
		return wanted.to_owned();
	}
	let mut number = 2;
	loop {
		let candidate = format!("{wanted} {number}");
		if !is_worn(&candidate) {
			return candidate;
		}
		number += 1;
	}
}

fn read(relative: &str, path: &Path) -> Result<String, Unimported> {
	fs::read_to_string(path).map_err(unread(relative))
}

fn unread(relative: &str) -> impl FnOnce(std::io::Error) -> Unimported + '_ {
	move |failure| Unimported::Unread { relative: relative.to_owned(), failure }
}

fn skill_files(key: &str, dir: &Path) -> Result<Vec<(String, String)>, Unimported> {
	let mut files = Vec::new();
	gather(key, dir, Path::new(""), &mut files)?;
	files.sort();
	Ok(files)
}

fn gather(
	key: &str,
	dir: &Path,
	relative: &Path,
	files: &mut Vec<(String, String)>,
) -> Result<(), Unimported> {
	let shown = |found: &Path| format!("{key}/{}", found.to_string_lossy().replace('\\', "/"));
	let listed = fs::read_dir(dir.join(relative))
		.map_err(|failure| Unimported::Unread { relative: shown(relative), failure })?;
	for entry in listed {
		let entry = entry.map_err(unread(&shown(relative)))?;
		let found = relative.join(entry.file_name());
		let kind = entry.file_type().map_err(unread(&shown(&found)))?;
		if kind.is_symlink() {
			return Err(Unimported::Linked { relative: shown(&found) });
		}
		if kind.is_dir() {
			gather(key, dir, &found, files)?;
		} else if found != Path::new(SKILL_FILE) && entry.file_name() != FINDER_LITTER {
			let text = read(&shown(&found), &dir.join(&found))?;
			files.push((found.to_string_lossy().replace('\\', "/"), text));
		}
	}
	Ok(())
}

fn written(
	person: &Path,
	draft: &SkillDraft,
	files: &[(String, String)],
) -> Result<Created, Unimported> {
	let skill = bundles::create_skill_at(person, draft).map_err(Unimported::Unwritten)?;
	for (relative, text) in files {
		if let Err(failure) = bundles::write_skill_file_at(person, &skill.id, relative, text) {
			return Err(withdrawn(person, &skill.id, failure));
		}
	}
	Ok(Created { id: skill.id, name: skill.name })
}

fn withdrawn(person: &Path, skill_id: &str, failure: std::io::Error) -> Unimported {
	match bundles::remove_skill_at(person, skill_id) {
		Ok(()) => Unimported::Unwritten(failure),
		Err(leftover) => Unimported::LeftBehind { failure, leftover },
	}
}
