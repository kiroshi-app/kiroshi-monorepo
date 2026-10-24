use std::fs;
use std::path::Path;

use git2::build::CheckoutBuilder;
use git2::{
	Commit, Delta, Diff, DiffDelta, DiffFindOptions, IndexAddOption, Oid, Patch, Repository,
	Signature, Sort, StatusOptions, Tree,
};

use super::LEARNED_NAME;
use crate::private_files;

const EXCLUDED: &str = LEARNED_NAME;

const INFO_DIR: &str = "info";
const EXCLUDE_NAME: &str = "exclude";

const USER_NAME: &str = "Reader";
const USER_MAIL: &str = "user@kiroshi.local";
const BOT_NAME: &str = "Bot";
const BOT_MAIL: &str = "bot@kiroshi.local";

const EVERYTHING: &str = "*";

const HEAD: &str = "HEAD";

const OWNER_DIR_MODE: u32 = 0o700;
const OWNER_FILE_MODE: u32 = 0o600;

const UNDONE: &str = "Change undone";

const NOT_CONSECUTIVE: &str = "these two changes do not follow one another";
const UNNAMED: &str = "this change holds a file with no path";
const NOTHING_TO_UNDO: &str = "this bundle has no write to undo";
const CONFLICTED: &str = "this write cannot be undone on top of the later ones";
const LEFT_OPEN: &str = "the history of this bundle could not be made owner-only";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Author {
	User,
	Bot,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HistoryEntry {
	pub id: String,
	pub timestamp: i64,
	pub author: Author,
	pub title: String,
	pub body: String,
	pub paths: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FileChange {
	Added,
	Modified,
	Deleted,
	Renamed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ChangedFile {
	pub path: String,
	pub previous_path: Option<String>,
	pub change: FileChange,
	pub patch: String,
}

pub struct Recorded {
	pub id: Option<String>,
	pub tightened: Result<(), git2::Error>,
}

pub fn commit(
	bundle: &Path,
	author: Author,
	title: &str,
	body: &str,
) -> Result<Option<String>, git2::Error> {
	let recorded = record(bundle, author, title, body)?;
	recorded.tightened?;
	Ok(recorded.id)
}

pub fn record(
	bundle: &Path,
	author: Author,
	title: &str,
	body: &str,
) -> Result<Recorded, git2::Error> {
	let repository = opened(bundle)?;
	let written = written(&repository, author, title, body);
	let tightened = tightened(repository.path());
	Ok(Recorded { id: written?, tightened })
}

fn written(
	repository: &Repository,
	author: Author,
	title: &str,
	body: &str,
) -> Result<Option<String>, git2::Error> {
	let tree = staged(repository)?;
	let parent = head(repository);
	if parent.as_ref().is_some_and(|found| found.tree_id() == tree.id()) {
		return Ok(None);
	}
	let parents: Vec<&Commit> = parent.iter().collect();
	let signature = signed(author)?;
	let id = repository.commit(
		Some(HEAD),
		&signature,
		&signature,
		&message(title, body),
		&tree,
		&parents,
	)?;
	Ok(Some(id.to_string()))
}

pub fn changes(bundle: &Path) -> Result<Vec<String>, git2::Error> {
	let repository = Repository::open(bundle)?;
	let mut options = StatusOptions::new();
	options.include_untracked(true).recurse_untracked_dirs(true).include_ignored(false);
	let statuses = repository.statuses(Some(&mut options))?;
	let mut paths: Vec<String> =
		statuses.iter().filter_map(|status| status.path().map(str::to_owned).ok()).collect();
	paths.sort();
	Ok(paths)
}

pub fn history(bundle: &Path) -> Result<Vec<HistoryEntry>, git2::Error> {
	let repository = Repository::open(bundle)?;
	let Some(head) = head(&repository) else {
		return Ok(Vec::new());
	};
	let mut walk = repository.revwalk()?;
	walk.set_sorting(Sort::TOPOLOGICAL | Sort::TIME)?;
	walk.push(head.id())?;
	walk.filter_map(Result::ok)
		.filter_map(|id| repository.find_commit(id).ok())
		.map(|commit| entry(&repository, &commit))
		.collect()
}

pub fn changed_files(
	bundle: &Path,
	oldest_id: &str,
	newest_id: &str,
) -> Result<Vec<ChangedFile>, git2::Error> {
	let repository = Repository::open(bundle)?;
	let run = run(&repository, oldest_id, newest_id)?;
	let (newest, oldest) = ends(&run)?;
	let diff = traced(&repository, oldest, newest)?;
	files(&diff)
}

pub fn revert(bundle: &Path, oldest_id: &str, newest_id: &str) -> Result<String, git2::Error> {
	let repository = Repository::open(bundle)?;
	let reverted = reverted(&repository, oldest_id, newest_id);
	let tightened = tightened(repository.workdir().unwrap_or(repository.path()));
	let id = reverted?;
	tightened?;
	Ok(id)
}

fn reverted(
	repository: &Repository,
	oldest_id: &str,
	newest_id: &str,
) -> Result<String, git2::Error> {
	let run = run(repository, oldest_id, newest_id)?;
	let (newest, oldest) = ends(&run)?;
	let head = head(repository).ok_or_else(|| git2::Error::from_str(NOTHING_TO_UNDO))?;
	let mut index = repository.merge_trees(
		&newest.tree()?,
		&head.tree()?,
		&before(repository, oldest)?,
		None,
	)?;
	if index.has_conflicts() {
		return Err(git2::Error::from_str(CONFLICTED));
	}
	let tree = repository.find_tree(index.write_tree_to(repository)?)?;
	let signature = signed(Author::User)?;
	let id = repository.commit(
		Some(HEAD),
		&signature,
		&signature,
		&message(&undone(newest), &others(&run)),
		&tree,
		&[&head],
	)?;
	repository.checkout_head(Some(CheckoutBuilder::new().force()))?;
	Ok(id.to_string())
}

fn run<'r>(
	repository: &'r Repository,
	oldest_id: &str,
	newest_id: &str,
) -> Result<Vec<Commit<'r>>, git2::Error> {
	let oldest = found(repository, oldest_id)?;
	let mut walked = found(repository, newest_id)?;
	let mut run = Vec::new();
	loop {
		let reached = walked.id() == oldest.id();
		run.push(walked.clone());
		if reached {
			return Ok(run);
		}
		match walked.parent(0) {
			Ok(parent) => walked = parent,
			Err(_) => return Err(git2::Error::from_str(NOT_CONSECUTIVE)),
		}
	}
}

fn ends<'a, 'r>(run: &'a [Commit<'r>]) -> Result<(&'a Commit<'r>, &'a Commit<'r>), git2::Error> {
	run.first().zip(run.last()).ok_or_else(|| git2::Error::from_str(NOT_CONSECUTIVE))
}

fn found<'r>(repository: &'r Repository, commit_id: &str) -> Result<Commit<'r>, git2::Error> {
	let id = Oid::from_str(commit_id).map_err(|_| unknown(commit_id))?;
	repository.find_commit(id).map_err(|_| unknown(commit_id))
}

fn unknown(commit_id: &str) -> git2::Error {
	git2::Error::from_str(&format!("this history holds no change named {commit_id}"))
}

fn spanned<'r>(
	repository: &'r Repository,
	oldest: &Commit<'r>,
	newest: &Commit<'r>,
) -> Result<Diff<'r>, git2::Error> {
	let before = before(repository, oldest)?;
	let after = newest.tree()?;
	repository.diff_tree_to_tree(Some(&before), Some(&after), None)
}

fn traced<'r>(
	repository: &'r Repository,
	oldest: &Commit<'r>,
	newest: &Commit<'r>,
) -> Result<Diff<'r>, git2::Error> {
	let mut diff = spanned(repository, oldest, newest)?;
	diff.find_similar(Some(DiffFindOptions::new().renames(true)))?;
	Ok(diff)
}

fn before<'r>(repository: &'r Repository, commit: &Commit<'r>) -> Result<Tree<'r>, git2::Error> {
	match commit.parent(0) {
		Ok(parent) => parent.tree(),
		Err(_) => repository.find_tree(repository.treebuilder(None)?.write()?),
	}
}

fn files(diff: &Diff) -> Result<Vec<ChangedFile>, git2::Error> {
	let mut files = diff
		.deltas()
		.enumerate()
		.map(|(index, delta)| changed(diff, index, &delta))
		.collect::<Result<Vec<ChangedFile>, git2::Error>>()?;
	files.sort_by(|one, other| one.path.cmp(&other.path));
	Ok(files)
}

fn changed(diff: &Diff, index: usize, delta: &DiffDelta) -> Result<ChangedFile, git2::Error> {
	let change = changing(delta.status());
	Ok(ChangedFile {
		path: named(delta)?,
		previous_path: match change {
			FileChange::Renamed => delta.old_file().path().map(printable),
			_ => None,
		},
		change,
		patch: patched(diff, index)?,
	})
}

fn changing(status: Delta) -> FileChange {
	match status {
		Delta::Added => FileChange::Added,
		Delta::Deleted => FileChange::Deleted,
		Delta::Renamed => FileChange::Renamed,
		_ => FileChange::Modified,
	}
}

fn named(delta: &DiffDelta) -> Result<String, git2::Error> {
	delta
		.new_file()
		.path()
		.or_else(|| delta.old_file().path())
		.map(printable)
		.ok_or_else(|| git2::Error::from_str(UNNAMED))
}

fn printable(path: &Path) -> String {
	path.to_string_lossy().into_owned()
}

fn patched(diff: &Diff, index: usize) -> Result<String, git2::Error> {
	let Some(mut patch) = Patch::from_diff(diff, index)? else {
		return Ok(String::new());
	};
	Ok(String::from_utf8_lossy(&patch.to_buf()?).into_owned())
}

fn others(run: &[Commit]) -> String {
	run.iter().skip(1).map(summary).collect::<Vec<String>>().join("\n")
}

pub fn init(bundle: &Path) -> Result<(), git2::Error> {
	exclude(&Repository::init(bundle)?);
	Ok(())
}

fn opened(bundle: &Path) -> Result<Repository, git2::Error> {
	let repository = Repository::open(bundle)?;
	exclude(&repository);
	Ok(repository)
}

#[cfg(unix)]
fn owner_only(path: &Path) -> std::io::Result<()> {
	use std::os::unix::fs::PermissionsExt;

	let metadata = fs::symlink_metadata(path)?;
	if metadata.is_file() {
		return fs::set_permissions(path, fs::Permissions::from_mode(OWNER_FILE_MODE));
	}
	if !metadata.is_dir() {
		return Ok(());
	}
	fs::set_permissions(path, fs::Permissions::from_mode(OWNER_DIR_MODE))?;
	for entry in fs::read_dir(path)? {
		owner_only(&entry?.path())?;
	}
	Ok(())
}

#[cfg(not(unix))]
fn owner_only(_path: &Path) -> std::io::Result<()> {
	Ok(())
}

fn tightened(path: &Path) -> Result<(), git2::Error> {
	if walk_stopped() {
		return Err(left_open(std::io::Error::other("the walk was stopped")));
	}
	owner_only(path).map_err(left_open)
}

#[cfg(test)]
thread_local! {
	static WALK_STOPPED: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
}

#[cfg(test)]
pub fn stop_the_next_owner_only_walk() {
	WALK_STOPPED.with(|stopped| stopped.set(true));
}

#[cfg(test)]
fn walk_stopped() -> bool {
	WALK_STOPPED.with(|stopped| stopped.replace(false))
}

#[cfg(not(test))]
fn walk_stopped() -> bool {
	false
}

fn left_open(error: std::io::Error) -> git2::Error {
	git2::Error::from_str(&format!("{LEFT_OPEN}: {error}"))
}

fn exclude(repository: &Repository) {
	let path = repository.path().join(INFO_DIR).join(EXCLUDE_NAME);
	let mut text = fs::read_to_string(&path).unwrap_or_default();
	if text.lines().any(|line| line.trim() == EXCLUDED) {
		return;
	}
	if !text.is_empty() && !text.ends_with('\n') {
		text.push('\n');
	}
	text.push_str(EXCLUDED);
	text.push('\n');
	let _ = private_files::replace(&path, text.as_bytes());
}

fn staged(repository: &Repository) -> Result<Tree<'_>, git2::Error> {
	let mut index = repository.index()?;
	index.clear()?;
	index.add_all([EVERYTHING], IndexAddOption::DEFAULT, None)?;
	index.write()?;
	let id = index.write_tree()?;
	repository.find_tree(id)
}

fn head(repository: &Repository) -> Option<Commit<'_>> {
	repository.head().ok()?.peel_to_commit().ok()
}

fn signed(author: Author) -> Result<Signature<'static>, git2::Error> {
	match author {
		Author::User => Signature::now(USER_NAME, USER_MAIL),
		Author::Bot => Signature::now(BOT_NAME, BOT_MAIL),
	}
}

fn authored(mail: &str) -> Author {
	if mail == BOT_MAIL {
		Author::Bot
	} else {
		Author::User
	}
}

fn message(title: &str, body: &str) -> String {
	let title = title.trim();
	let body = body.trim();
	if body.is_empty() {
		format!("{title}\n")
	} else {
		format!("{title}\n\n{body}\n")
	}
}

fn undone(commit: &Commit) -> String {
	format!("{UNDONE}: {}", summary(commit))
}

fn summary(commit: &Commit) -> String {
	commit.summary().ok().flatten().unwrap_or_default().to_owned()
}

fn entry(repository: &Repository, commit: &Commit) -> Result<HistoryEntry, git2::Error> {
	Ok(HistoryEntry {
		id: commit.id().to_string(),
		timestamp: commit.time().seconds(),
		author: authored(commit.author().email().unwrap_or_default()),
		title: summary(commit),
		body: commit.body().ok().flatten().unwrap_or_default().trim().to_owned(),
		paths: touched(repository, commit)?,
	})
}

fn touched(repository: &Repository, commit: &Commit) -> Result<Vec<String>, git2::Error> {
	let diff = spanned(repository, commit, commit)?;
	let mut paths: Vec<String> = diff
		.deltas()
		.flat_map(|delta| [delta.old_file().path(), delta.new_file().path()])
		.flatten()
		.map(printable)
		.collect();
	paths.sort();
	paths.dedup();
	Ok(paths)
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::db::connection::fixture_root;
	use crate::removed_on_drop::RemovedOnDrop;
	use git2::{DiffFormat, DiffOptions};

	fn a_bundle(name: &str) -> RemovedOnDrop {
		let bundle = fixture_root(&format!("git-{name}"));
		fs::create_dir_all(&bundle).expect("the bundle is laid down");
		init(&bundle).expect("the repository is created");
		bundle
	}

	#[test]
	fn a_bundle_with_no_repository_refuses_the_record_and_is_given_none() {
		let bundle = fixture_root("git-no-repository");
		fs::create_dir_all(&bundle).expect("the bundle is laid down");
		fs::write(bundle.join("agent.md"), "Answer briefly.").expect("the file lands");

		assert!(record(&bundle, Author::User, "Saved", "").is_err());
		assert!(!bundle.join(".git").exists(), "a repository was created");
	}

	#[cfg(unix)]
	#[test]
	fn a_bundle_whose_repository_cannot_be_read_refuses_the_record_and_keeps_it() {
		use std::os::unix::fs::PermissionsExt;

		let bundle = a_bundle("sealed-repository");
		let first = writes(&bundle, &[("agent.md", "Answer briefly.")], "Saved");
		fs::write(bundle.join("agent.md"), "Answer at length.").expect("the file lands");
		let repository = bundle.join(".git");
		fs::set_permissions(&repository, fs::Permissions::from_mode(0o000)).expect("it is sealed");

		let recorded = record(&bundle, Author::User, "Saved again", "");
		fs::set_permissions(&repository, fs::Permissions::from_mode(0o700))
			.expect("it is unsealed");

		assert!(recorded.is_err());
		let walked = history(&bundle).expect("the history reads");
		assert_eq!(walked.iter().map(|entry| entry.id.as_str()).collect::<Vec<_>>(), vec![first]);
	}

	fn writes(bundle: &Path, files: &[(&str, &str)], title: &str) -> String {
		for (path, text) in files {
			fs::write(bundle.join(path), text).expect("the file lands");
		}
		commit(bundle, Author::User, title, "")
			.expect("the write is recorded")
			.expect("the write moved the tree")
	}

	fn drops(bundle: &Path, path: &str, title: &str) -> String {
		fs::remove_file(bundle.join(path)).expect("the file goes");
		commit(bundle, Author::User, title, "")
			.expect("the write is recorded")
			.expect("the write moved the tree")
	}

	fn renames(bundle: &Path, from: &str, to: &str, title: &str) -> String {
		fs::rename(bundle.join(from), bundle.join(to)).expect("the file moves");
		commit(bundle, Author::User, title, "")
			.expect("the write is recorded")
			.expect("the write moved the tree")
	}

	fn whole_patch(bundle: &Path, commit_id: &str) -> String {
		let repository = Repository::open(bundle).expect("the bundle opens");
		let commit = found(&repository, commit_id).expect("the change is there");
		let diff = traced(&repository, &commit, &commit).expect("the diff reads");
		let mut text = String::new();
		diff.print(DiffFormat::Patch, |_, _, line| {
			if matches!(line.origin(), '+' | '-' | ' ') {
				text.push(line.origin());
			}
			text.push_str(&String::from_utf8_lossy(line.content()));
			true
		})
		.expect("the diff prints");
		text
	}

	fn paths_of(files: &[ChangedFile]) -> Vec<&str> {
		files.iter().map(|file| file.path.as_str()).collect()
	}

	#[test]
	fn one_changed_file_carries_its_own_patch() {
		let bundle = a_bundle("one-file");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let edited = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");

		let files = changed_files(&bundle, &edited, &edited).expect("the diff reads");

		assert_eq!(paths_of(&files), vec!["about.md"]);
		assert_eq!(files[0].change, FileChange::Modified);
		assert_eq!(files[0].previous_path, None);
		assert!(files[0].patch.contains("+Dates."), "got {}", files[0].patch);
		assert!(!files[0].patch.contains("Bakes."), "got {}", files[0].patch);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn several_changed_files_come_back_sorted_and_join_into_the_whole_patch() {
		let bundle = a_bundle("several-files");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let edited = writes(
			&bundle,
			&[("about.md", "Dates.\n"), ("notes.md", "Bakes.\n"), ("agenda.md", "Sunday.\n")],
			"The second write",
		);

		let files = changed_files(&bundle, &edited, &edited).expect("the diff reads");

		assert_eq!(paths_of(&files), vec!["about.md", "agenda.md", "notes.md"]);
		assert_eq!(files[1].change, FileChange::Added);
		let joined: String = files.iter().map(|file| file.patch.clone()).collect();
		assert_eq!(joined, whole_patch(&bundle, &edited));

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_run_of_three_reads_as_one_file_per_path() {
		let bundle = a_bundle("run-of-three");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let oldest = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");
		writes(&bundle, &[("about.md", "Plums.\n"), ("notes.md", "Bakes.\n")], "The third write");
		let newest = writes(&bundle, &[("about.md", "Pears.\n")], "The fourth write");

		let files = changed_files(&bundle, &oldest, &newest).expect("the diff reads");

		assert_eq!(paths_of(&files), vec!["about.md", "notes.md"]);
		assert!(files[0].patch.contains("-Figs."), "got {}", files[0].patch);
		assert!(files[0].patch.contains("+Pears."), "got {}", files[0].patch);
		assert!(!files[0].patch.contains("Dates."), "got {}", files[0].patch);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_run_holding_a_rename_names_the_path_it_came_from() {
		let bundle = a_bundle("run-rename");
		writes(
			&bundle,
			&[("about.md", "Figs and dates and plums and pears.\n")],
			"The first write",
		);
		let oldest = writes(&bundle, &[("notes.md", "Bakes.\n")], "The second write");
		let newest = renames(&bundle, "about.md", "profile.md", "The third write");

		let files = changed_files(&bundle, &oldest, &newest).expect("the diff reads");

		assert_eq!(paths_of(&files), vec!["notes.md", "profile.md"]);
		assert_eq!(files[1].change, FileChange::Renamed);
		assert_eq!(files[1].previous_path.as_deref(), Some("about.md"));
		assert_eq!(files[0].previous_path, None);
		assert_eq!(
			files[1].patch,
			"diff --git a/about.md b/profile.md\n\
			 similarity index 100%\n\
			 rename from about.md\n\
			 rename to profile.md\n"
		);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_run_holding_a_deletion_reads_the_file_as_deleted() {
		let bundle = a_bundle("run-deletion");
		writes(&bundle, &[("about.md", "Figs.\n"), ("notes.md", "Bakes.\n")], "The first write");
		let oldest = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");
		let newest = drops(&bundle, "notes.md", "The third write");

		let files = changed_files(&bundle, &oldest, &newest).expect("the diff reads");

		assert_eq!(paths_of(&files), vec!["about.md", "notes.md"]);
		assert_eq!(files[1].change, FileChange::Deleted);
		assert!(files[1].patch.contains("-Bakes."), "got {}", files[1].patch);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_file_git_prints_no_patch_for_comes_back_with_an_empty_patch() {
		let bundle = a_bundle("no-patch");
		writes(&bundle, &[("about.md", "Figs.\n"), ("notes.md", "Bakes.\n")], "The first write");
		let edited = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");
		let repository = Repository::open(&bundle).expect("the bundle opens");
		let commit = found(&repository, &edited).expect("the change is there");
		let mut options = DiffOptions::new();
		options.include_unmodified(true);
		let diff = repository
			.diff_tree_to_tree(
				Some(&before(&repository, &commit).expect("the tree reads")),
				Some(&commit.tree().expect("the tree reads")),
				Some(&mut options),
			)
			.expect("the diff reads");

		let files = files(&diff).expect("the files read");

		assert_eq!(paths_of(&files), vec!["about.md", "notes.md"]);
		assert_eq!(files[1].patch, "");
		assert!(!files[0].patch.is_empty(), "got {}", files[0].patch);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_pair_that_does_not_follow_one_another_is_refused() {
		let bundle = a_bundle("not-consecutive");
		let oldest = writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let newest = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");

		let refused = changed_files(&bundle, &newest, &oldest);

		assert_eq!(
			refused.expect_err("it is refused").message(),
			"these two changes do not follow one another"
		);
		assert!(revert(&bundle, &newest, &oldest).is_err(), "the undo is refused too");

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn an_id_that_names_no_change_is_refused() {
		let bundle = a_bundle("unknown-id");
		let only = writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let absent = "0000000000000000000000000000000000000000";

		assert!(changed_files(&bundle, absent, &only).is_err());
		assert!(changed_files(&bundle, &only, absent).is_err());
		assert!(revert(&bundle, absent, absent).is_err());

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn undoing_a_run_puts_every_path_it_touched_back_and_leaves_the_others() {
		let bundle = a_bundle("undo-run");
		writes(&bundle, &[("about.md", "Figs.\n"), ("notes.md", "Bakes.\n")], "The first write");
		let oldest = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");
		writes(&bundle, &[("about.md", "Plums.\n")], "The third write");
		let newest = writes(&bundle, &[("about.md", "Pears.\n")], "The fourth write");
		writes(&bundle, &[("notes.md", "Kneads.\n")], "The fifth write");

		revert(&bundle, &oldest, &newest).expect("the run is undone");

		assert_eq!(fs::read_to_string(bundle.join("about.md")).expect("the file reads"), "Figs.\n");
		assert_eq!(
			fs::read_to_string(bundle.join("notes.md")).expect("the file reads"),
			"Kneads.\n"
		);
		let listed = history(&bundle).expect("the history reads");
		assert_eq!(listed[0].title, "Change undone: The fourth write");
		assert_eq!(listed[0].body, "The third write\nThe second write");
		assert_eq!(listed[0].paths, vec!["about.md"]);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn undoing_one_change_keeps_the_title_it_has_always_had() {
		let bundle = a_bundle("undo-one");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let only = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");

		revert(&bundle, &only, &only).expect("the change is undone");

		let listed = history(&bundle).expect("the history reads");
		assert_eq!(listed[0].title, "Change undone: The second write");
		assert!(listed[0].body.is_empty(), "got {}", listed[0].body);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn an_undo_that_conflicts_with_a_later_change_writes_nothing() {
		let bundle = a_bundle("undo-conflict");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let undone = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");
		let after = writes(&bundle, &[("about.md", "Plums.\n")], "The third write");

		let refused = revert(&bundle, &undone, &undone);

		assert_eq!(
			refused.expect_err("it is refused").message(),
			"this write cannot be undone on top of the later ones"
		);
		assert_eq!(history(&bundle).expect("the history reads")[0].id, after);
		assert_eq!(
			fs::read_to_string(bundle.join("about.md")).expect("the file reads"),
			"Plums.\n"
		);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_listed_entry_carries_the_sorted_paths_it_changed() {
		let bundle = a_bundle("listed-paths");
		writes(
			&bundle,
			&[("about.md", "Figs and dates and plums and pears.\n")],
			"The first write",
		);
		renames(&bundle, "about.md", "profile.md", "The second write");

		let listed = history(&bundle).expect("the history reads");

		assert_eq!(listed[0].paths, vec!["about.md", "profile.md"]);
		assert_eq!(listed[1].paths, vec!["about.md"]);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[cfg(unix)]
	fn assert_git_owner_only(bundle: &Path) {
		use std::os::unix::fs::PermissionsExt;

		let mode_of =
			|path: &Path| fs::metadata(path).expect("the metadata").permissions().mode() & 0o777;
		let git = bundle.join(".git");
		let mut files = vec![git.join("index")];
		let mut pending = vec![git.clone()];
		while let Some(dir) = pending.pop() {
			assert_eq!(mode_of(&dir), 0o700, "{} is not owner-only", dir.display());
			for entry in fs::read_dir(&dir).expect("a readable dir") {
				let path = entry.expect("an entry").path();
				match path.is_dir() {
					true => pending.push(path),
					false if path.starts_with(git.join("objects")) => files.push(path),
					false => {}
				}
			}
		}
		assert!(files.len() > 1, "git wrote loose objects");
		for file in files {
			assert_eq!(mode_of(&file), 0o600, "{} is not owner-only", file.display());
		}
	}

	#[cfg(unix)]
	#[test]
	fn a_commit_leaves_every_git_file_owner_only() {
		let bundle = a_bundle("owner-only");
		writes(&bundle, &[("notes.md", "first")], "First");

		assert_git_owner_only(&bundle);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[cfg(unix)]
	#[test]
	fn an_undo_leaves_every_git_file_and_the_restored_file_owner_only() {
		use std::os::unix::fs::PermissionsExt;

		let bundle = a_bundle("undo-owner-only");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let only = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");

		revert(&bundle, &only, &only).expect("the change is undone");

		assert_git_owner_only(&bundle);
		let restored = fs::metadata(bundle.join("about.md")).expect("the metadata");
		assert_eq!(restored.permissions().mode() & 0o777, 0o600);

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_stopped_walk_after_a_commit_is_returned() {
		let bundle = a_bundle("commit-walk-stopped");
		fs::write(bundle.join("about.md"), "Figs.\n").expect("the file lands");

		stop_the_next_owner_only_walk();
		let refused = commit(&bundle, Author::User, "The first write", "");

		assert!(refused.is_err(), "the walk failure was dropped");

		let _ = fs::remove_dir_all(&bundle);
	}

	#[test]
	fn a_stopped_walk_after_an_undo_is_returned() {
		let bundle = a_bundle("undo-walk-stopped");
		writes(&bundle, &[("about.md", "Figs.\n")], "The first write");
		let only = writes(&bundle, &[("about.md", "Dates.\n")], "The second write");

		stop_the_next_owner_only_walk();
		let refused = revert(&bundle, &only, &only);

		assert!(refused.is_err(), "the walk failure was dropped");
		assert_eq!(history(&bundle).expect("the history reads").len(), 3, "the undo was recorded");

		let _ = fs::remove_dir_all(&bundle);
	}
}
