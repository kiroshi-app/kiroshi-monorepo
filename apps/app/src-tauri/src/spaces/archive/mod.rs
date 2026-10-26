use std::collections::{BTreeMap, HashMap, HashSet};
use std::fs::{self, File};
use std::io;
use std::path::{Component, Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Runtime};
use uuid::Uuid;

use super::contract::{Space, SpaceError};
use crate::attachments::{self, Attachments};
use crate::avatars::{self, Avatars};
use crate::bundles;
use crate::db::repositories::space_rows::{MintedIds, SpaceRows};
use crate::db::Database;
use crate::environment::contract::{EnvError, EnvOwner, EnvScope};
use crate::environment::store;
use crate::file_store::FileStore;
use crate::private_files;

pub const FORMAT_VERSION: u32 = 2;
pub const ARCHIVE_EXTENSION: &str = "kiroshi";
pub const ARCHIVE_FILTER_NAME: &str = "Kiroshi space";

const MANIFEST_NAME: &str = "manifest.json";
const ROWS_NAME: &str = "rows.json";
const FORMAT_VERSION_KEY: &str = "format_version";
const READABLE_VERSIONS: [u32; 2] = [1, FORMAT_VERSION];
const VERSION_1_ENV_FILE: &str = ".env";

#[derive(Debug, Serialize, Deserialize)]
struct Manifest {
	format_version: u32,
	space_id: String,
	#[serde(default)]
	env: EnvNames,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct EnvNames {
	space: OwnerNames,
	bots: BTreeMap<String, OwnerNames>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
#[serde(default)]
struct OwnerNames {
	names: Vec<String>,
	servers: BTreeMap<String, Vec<String>>,
}

impl EnvNames {
	fn read(env_root: &Path, space_id: &str, rows: &SpaceRows) -> Result<Self, EnvError> {
		let mut bots = BTreeMap::new();
		for bot_id in rows.seated_bot_ids() {
			let owner = EnvOwner::Bot { id: bot_id.clone(), space_id: space_id.to_owned() };
			bots.insert(bot_id, OwnerNames::read(env_root, &owner)?);
		}
		let space = OwnerNames::read(env_root, &EnvOwner::Space { id: space_id.to_owned() })?;
		Ok(Self { space, bots })
	}

	fn held_in_version_1(&mut self, tree: &Tree, rest: &Path) -> Option<&mut Vec<String>> {
		let parts = rest.iter().map(|part| part.to_str()).collect::<Option<Vec<&str>>>()?;
		let (owner, server) = match (tree, parts.as_slice()) {
			(Tree::SpaceEnv, [VERSION_1_ENV_FILE]) => (&mut self.space, None),
			(Tree::SpaceServers, [server, VERSION_1_ENV_FILE]) => (&mut self.space, Some(*server)),
			(Tree::BotEnv(id), [VERSION_1_ENV_FILE]) => {
				(self.bots.entry(id.clone()).or_default(), None)
			}
			(Tree::BotServers(id), [server, VERSION_1_ENV_FILE]) => {
				(self.bots.entry(id.clone()).or_default(), Some(*server))
			}
			_ => return None,
		};
		Some(match server {
			None => &mut owner.names,
			Some(server) => owner.servers.entry(server.to_owned()).or_default(),
		})
	}
}

impl OwnerNames {
	fn read(env_root: &Path, owner: &EnvOwner) -> Result<Self, EnvError> {
		let mut servers = BTreeMap::new();
		for server in store::server_names(env_root, owner)? {
			let scope = EnvScope::Server { name: server.clone(), owner: owner.clone() };
			servers.insert(server, store::names(env_root, &scope)?);
		}
		Ok(Self { names: store::names(env_root, &EnvScope::from(owner))?, servers })
	}
}

#[derive(Clone)]
pub struct Places {
	spaces: PathBuf,
	bots: PathBuf,
	env: PathBuf,
	attachments: PathBuf,
	avatars: PathBuf,
}

impl Places {
	pub fn of<R: Runtime>(app: &AppHandle<R>) -> Result<Self, SpaceError> {
		let homeless = || SpaceError::UnwritableBundle {
			detail: "there is no application data directory".to_owned(),
		};
		Ok(Self {
			spaces: bundles::space::root(app).ok_or_else(homeless)?,
			bots: bundles::root(app).ok_or_else(homeless)?,
			env: store::root(app).ok_or_else(homeless)?,
			attachments: Attachments::dir(app).ok_or_else(homeless)?,
			avatars: Avatars::dir(app).ok_or_else(homeless)?,
		})
	}
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
enum Tree {
	Space,
	SpaceEnv,
	SpaceServers,
	Bot(String),
	BotEnv(String),
	BotServers(String),
	Attachments(String),
	Avatar(String),
}

impl Tree {
	fn archived(&self) -> PathBuf {
		match self {
			Tree::Space => PathBuf::from("space"),
			Tree::SpaceEnv => PathBuf::from("env/space"),
			Tree::SpaceServers => PathBuf::from("env/space-servers"),
			Tree::Bot(id) => Path::new("bots").join(id),
			Tree::BotEnv(id) => Path::new("env/bots").join(id),
			Tree::BotServers(id) => Path::new("env/bot-servers").join(id),
			Tree::Attachments(id) => Path::new("attachments").join(id),
			Tree::Avatar(name) => Path::new("avatars").join(name),
		}
	}

	fn parsed(path: &Path) -> Option<(Tree, PathBuf)> {
		let parts = path
			.components()
			.map(|component| match component {
				Component::Normal(part) => part.to_str(),
				_ => None,
			})
			.collect::<Option<Vec<&str>>>()?;
		let (tree, rest) = match parts.as_slice() {
			["space", rest @ ..] => (Tree::Space, rest),
			["env", "space", rest @ ..] => (Tree::SpaceEnv, rest),
			["env", "space-servers", rest @ ..] => (Tree::SpaceServers, rest),
			["bots", id, rest @ ..] => (Tree::Bot((*id).to_owned()), rest),
			["env", "bots", id, rest @ ..] => (Tree::BotEnv((*id).to_owned()), rest),
			["env", "bot-servers", id, rest @ ..] => (Tree::BotServers((*id).to_owned()), rest),
			["attachments", id, rest @ ..] => (Tree::Attachments((*id).to_owned()), rest),
			["avatars", name, rest @ ..] => (Tree::Avatar((*name).to_owned()), rest),
			_ => return None,
		};
		Some((tree, rest.iter().collect()))
	}

	fn is_env(&self) -> bool {
		matches!(self, Tree::SpaceEnv | Tree::SpaceServers | Tree::BotEnv(_) | Tree::BotServers(_))
	}

	fn owner<'a>(&'a self, space_id: &'a str) -> &'a str {
		match self {
			Tree::Space | Tree::SpaceEnv | Tree::SpaceServers => space_id,
			Tree::Bot(id)
			| Tree::BotEnv(id)
			| Tree::BotServers(id)
			| Tree::Attachments(id)
			| Tree::Avatar(id) => id,
		}
	}
}

type Trees = HashMap<Tree, PathBuf>;

pub async fn export(
	places: Places,
	space_id: String,
	rows: SpaceRows,
	target: PathBuf,
) -> Result<(), SpaceError> {
	refuse_relative(&target).map_err(unwritable_archive)?;
	blocking(move || {
		let mut rows = rows;
		keep_readable_avatars(&places, &mut rows);
		let mut trees = trees_of(&places, &space_id, &rows, &MintedIds::new())?;
		trees.extend(carried_avatars(&rows, |name| places.avatars.join(name))?);
		let env = EnvNames::read(&places.env, &space_id, &rows).map_err(|error| {
			unwritable_archive(format!("the secret names could not be read: {error:?}"))
		})?;
		let manifest = Manifest { format_version: FORMAT_VERSION, space_id, env };
		private_files::replace_atomically_with(&target, |file| {
			packed(file, &manifest, &rows, &trees)
		})
		.map_err(unwritable_archive)
	})
	.await
}

pub async fn import(
	places: Places,
	database: &Database,
	archive: PathBuf,
) -> Result<Space, SpaceError> {
	refuse_relative(&archive).map_err(unreadable_archive)?;
	let opened = archive.clone();
	let (manifest, rows) = blocking(move || head(&opened)).await?;
	let (mut rows, held) = database.space_rows().held_ids(rows).await?;
	let space_id = manifest.space_id.clone();
	let minted = minted(&places, &space_id, &rows, held)?;
	let mut trees = trees_of(&places, &space_id, &rows, &minted)?;
	relocate_attachments(&places, &mut rows, &minted);
	let avatars = carried_avatars(&rows, |name| free_avatar_path(&places.avatars, name))?;
	relocate_avatars(&mut rows, &avatars);
	trees.extend(avatars);
	let laid = blocking({
		let minted = minted.clone();
		let places = places.clone();
		move || laid_down(&archive, manifest, &places, &trees, &minted)
	})
	.await?;
	let imported = database.space_rows().write(rows, space_id, minted, now()).await;
	let imported = match imported {
		Ok(imported) => imported,
		Err(failure) => {
			laid.take_back();
			return Err(failure.into());
		}
	};
	let spaces = database.spaces().list().await?;
	let hosted = database.space_hosting().hosted_space_ids().await?;
	spaces
		.into_iter()
		.find(|space| space.id == imported)
		.map(|space| Space::presented(space, &hosted))
		.ok_or(SpaceError::UnknownSpace { id: imported })
}

async fn blocking<T: Send + 'static>(
	work: impl FnOnce() -> Result<T, SpaceError> + Send + 'static,
) -> Result<T, SpaceError> {
	tokio::task::spawn_blocking(work).await.map_err(|_| SpaceError::UnwritableBundle {
		detail: "the archive work was interrupted".to_owned(),
	})?
}

fn trees_of(
	places: &Places,
	space_id: &str,
	rows: &SpaceRows,
	minted: &MintedIds,
) -> Result<Trees, SpaceError> {
	let placed = |id: &str| -> Result<String, SpaceError> {
		refuse_unplain(id)?;
		Ok(placed_id(minted, id))
	};
	let space = placed(space_id)?;
	let [space_env, space_servers] = env_dirs(places, &EnvOwner::Space { id: space.clone() })?;
	let mut trees = Trees::from([
		(Tree::Space, places.spaces.join(&space)),
		(Tree::SpaceEnv, space_env),
		(Tree::SpaceServers, space_servers),
	]);
	for bot_id in rows.seated_bot_ids() {
		let bot = placed(&bot_id)?;
		let owner = EnvOwner::Bot { id: bot.clone(), space_id: space.clone() };
		let [env, servers] = env_dirs(places, &owner)?;
		let name =
			rows.bot_name(&bot_id).ok_or_else(|| unreadable_archive("a seated bot has no row"))?;
		let bundle = bundles::placed_dir(&places.bots, &bot, name).map_err(unwritable_bundle)?;
		trees.insert(Tree::Bot(bot_id.clone()), bundle);
		trees.insert(Tree::BotEnv(bot_id.clone()), env);
		trees.insert(Tree::BotServers(bot_id), servers);
	}
	for conversation_id in rows.conversation_ids() {
		let dir = attachments::conversation_dir(&places.attachments, &placed(&conversation_id)?);
		trees.insert(Tree::Attachments(conversation_id), dir);
	}
	Ok(trees)
}

fn placed_id(minted: &MintedIds, id: &str) -> String {
	minted.get(id).cloned().unwrap_or_else(|| id.to_owned())
}

fn env_dirs(places: &Places, owner: &EnvOwner) -> Result<[PathBuf; 2], SpaceError> {
	store::owner_dirs(&places.env, owner)
		.map_err(|_| unreadable_archive("an id cannot name a directory"))
}

fn refuse_unplain(id: &str) -> Result<(), SpaceError> {
	let mut components = Path::new(id).components();
	let plain = matches!(components.next(), Some(Component::Normal(_)))
		&& components.next().is_none()
		&& !id.contains(['/', '\\']);
	match plain {
		true => Ok(()),
		false => Err(unreadable_archive("an id cannot name a directory")),
	}
}

fn minted(
	places: &Places,
	space_id: &str,
	rows: &SpaceRows,
	held: HashSet<String>,
) -> Result<MintedIds, SpaceError> {
	let mut taken = held;
	for (tree, dir) in trees_of(places, space_id, rows, &MintedIds::new())? {
		if dir.exists() {
			taken.insert(tree.owner(space_id).to_owned());
		}
	}
	Ok(taken.into_iter().map(|id| (id, Uuid::new_v4().to_string())).collect())
}

fn relocate_attachments(places: &Places, rows: &mut SpaceRows, minted: &MintedIds) {
	let conversations: HashMap<String, String> = rows
		.conversation_ids()
		.into_iter()
		.map(|id| {
			let placed = minted.get(&id).cloned().unwrap_or_else(|| id.clone());
			(id, placed)
		})
		.collect();
	rows.relocate_message_contents(|content| {
		content
			.split('\n')
			.map(|line| {
				relocated(line, &places.attachments, &conversations)
					.unwrap_or_else(|| line.to_owned())
			})
			.collect::<Vec<_>>()
			.join("\n")
	});
}

fn relocated(
	line: &str,
	attachments: &Path,
	conversations: &HashMap<String, String>,
) -> Option<String> {
	let segments: Vec<&str> = line.trim().split(['/', '\\']).collect();
	let [.., store, conversation, name] = segments.as_slice() else {
		return None;
	};
	if segments.len() <= 3 || *store != Attachments::DIR_NAME || name.is_empty() {
		return None;
	}
	let placed = conversations.get(*conversation)?;
	let path = attachments::conversation_dir(attachments, placed).join(name);
	Some(path.to_string_lossy().into_owned())
}

fn keep_readable_avatars(places: &Places, rows: &mut SpaceRows) {
	rows.relocate_avatars(|recorded| {
		avatars::readable(&places.avatars, recorded).map(|path| path.to_string_lossy().into_owned())
	});
}

fn carried_avatars(
	rows: &SpaceRows,
	placed: impl Fn(&str) -> PathBuf,
) -> Result<Trees, SpaceError> {
	let mut carried = Trees::new();
	for recorded in rows.avatar_paths() {
		let name = file_name(&recorded);
		refuse_unplain(name)?;
		carried.entry(Tree::Avatar(name.to_owned())).or_insert_with(|| placed(name));
	}
	Ok(carried)
}

fn file_name(recorded: &str) -> &str {
	recorded.rsplit(['/', '\\']).next().unwrap_or(recorded)
}

fn free_avatar_path(dir: &Path, name: &str) -> PathBuf {
	let path = dir.join(name);
	match path.exists() {
		true => avatars::minted_path(dir),
		false => path,
	}
}

fn relocate_avatars(rows: &mut SpaceRows, avatars: &Trees) {
	rows.relocate_avatars(|recorded| {
		let placed = avatars.get(&Tree::Avatar(file_name(recorded).to_owned()))?;
		Some(placed.to_string_lossy().into_owned())
	});
}

fn packed(file: &mut File, manifest: &Manifest, rows: &SpaceRows, trees: &Trees) -> io::Result<()> {
	let mut builder = tar::Builder::new(file);
	appended_bytes(&mut builder, MANIFEST_NAME, &serde_json::to_vec_pretty(manifest)?)?;
	appended_bytes(&mut builder, ROWS_NAME, &serde_json::to_vec(rows)?)?;
	let mut ordered: Vec<_> = trees.iter().filter(|(tree, _)| !tree.is_env()).collect();
	ordered.sort();
	for (tree, path) in ordered {
		let is_avatar = matches!(tree, Tree::Avatar(_));
		if is_avatar && path.is_file() {
			builder.append_path_with_name(path, tree.archived())?;
		} else if !is_avatar && path.is_dir() {
			appended_tree(&mut builder, &tree.archived(), path)?;
		}
	}
	builder.finish()
}

fn appended_bytes(
	builder: &mut tar::Builder<&mut File>,
	name: &str,
	bytes: &[u8],
) -> io::Result<()> {
	let mut header = tar::Header::new_gnu();
	header.set_entry_type(tar::EntryType::Regular);
	header.set_size(bytes.len() as u64);
	header.set_mode(0o600);
	header.set_mtime((now() / 1000) as u64);
	header.set_cksum();
	builder.append_data(&mut header, name, bytes)
}

fn appended_tree(builder: &mut tar::Builder<&mut File>, name: &Path, dir: &Path) -> io::Result<()> {
	builder.append_dir(name, dir)?;
	let mut entries = fs::read_dir(dir)?.collect::<io::Result<Vec<_>>>()?;
	entries.sort_by_key(fs::DirEntry::file_name);
	for entry in entries {
		let kind = entry.file_type()?;
		let named = name.join(entry.file_name());
		if kind.is_dir() {
			appended_tree(builder, &named, &entry.path())?;
		} else if kind.is_file() {
			builder.append_path_with_name(entry.path(), &named)?;
		}
	}
	Ok(())
}

fn head(archive: &Path) -> Result<(Manifest, SpaceRows), SpaceError> {
	let file = File::open(archive).map_err(|error| unreadable_archive(&error.to_string()))?;
	let mut archive = tar::Archive::new(file);
	let mut entries = archive.entries().map_err(unreadable_io)?;
	let manifest: serde_json::Value = entry_read(entries.next(), MANIFEST_NAME)?;
	let found = manifest
		.get(FORMAT_VERSION_KEY)
		.and_then(serde_json::Value::as_u64)
		.and_then(|found| u32::try_from(found).ok());
	if !found.is_some_and(|found| READABLE_VERSIONS.contains(&found)) {
		return Err(SpaceError::UnsupportedArchive { found, supported: FORMAT_VERSION });
	}
	let manifest: Manifest = serde_json::from_value(manifest)
		.map_err(|_| unreadable_archive("the manifest names no space"))?;
	let rows = entry_read(entries.next(), ROWS_NAME)?;
	Ok((manifest, rows))
}

fn entry_read<T: DeserializeOwned>(
	entry: Option<io::Result<tar::Entry<'_, File>>>,
	name: &str,
) -> Result<T, SpaceError> {
	let missing = || unreadable_archive(&format!("the archive does not open with {name}"));
	let entry = entry.ok_or_else(missing)?.map_err(unreadable_io)?;
	if entry.path().map_err(unreadable_io)? != Path::new(name) {
		return Err(missing());
	}
	serde_json::from_reader(entry)
		.map_err(|_| unreadable_archive(&format!("{name} is not the JSON this host reads")))
}

fn laid_down(
	archive: &Path,
	mut manifest: Manifest,
	places: &Places,
	trees: &Trees,
	minted: &MintedIds,
) -> Result<Laid, SpaceError> {
	let mut laid = Laid::default();
	let outcome = unpacked(archive, &mut manifest, trees, minted, &mut laid)
		.and_then(|()| declared(places, &manifest, trees, minted, &mut laid));
	match outcome {
		Ok(()) => Ok(laid),
		Err(failure) => {
			laid.take_back();
			Err(failure)
		}
	}
}

fn unpacked(
	archive: &Path,
	manifest: &mut Manifest,
	trees: &Trees,
	minted: &MintedIds,
	laid: &mut Laid,
) -> Result<(), SpaceError> {
	let file = File::open(archive).map_err(|error| unreadable_archive(&error.to_string()))?;
	let mut archive = tar::Archive::new(file);
	for entry in archive.entries().map_err(unreadable_io)? {
		let mut entry = entry.map_err(unreadable_io)?;
		let path = entry.path().map_err(unreadable_io)?.into_owned();
		if path == Path::new(MANIFEST_NAME) || path == Path::new(ROWS_NAME) {
			continue;
		}
		let (tree, rest) = Tree::parsed(&path)
			.filter(|(tree, _)| !tree.is_env() || manifest.format_version == 1)
			.ok_or_else(|| unreadable_archive("the archive holds a path outside its layout"))?;
		let root = trees.get(&tree).ok_or_else(|| {
			unreadable_archive("the archive holds files of a row it does not carry")
		})?;
		if tree.is_env() {
			carried_names(&mut entry, &tree, &rest, &mut manifest.env)?;
			continue;
		}
		if let Tree::Avatar(_) = tree {
			laid_avatar(&mut entry, &rest, root, laid)?;
			continue;
		}
		laid.claim(root).map_err(unwritable_bundle)?;
		let target = root.join(rest);
		match entry.header().entry_type() {
			tar::EntryType::Directory => private_files::create_dir(&target),
			tar::EntryType::Regular => unpacked_file(&mut entry, &target),
			_ => return Err(unreadable_archive("the archive holds a link or a device")),
		}
		.map_err(unwritable_bundle)?;
	}
	reown_minted_bots(trees, minted).map_err(unwritable_bundle)
}

fn carried_names(
	entry: &mut tar::Entry<'_, File>,
	tree: &Tree,
	rest: &Path,
	env: &mut EnvNames,
) -> Result<(), SpaceError> {
	match entry.header().entry_type() {
		tar::EntryType::Directory => return Ok(()),
		tar::EntryType::Regular => {}
		_ => return Err(unreadable_archive("the archive holds a link or a device")),
	}
	let Some(names) = env.held_in_version_1(tree, rest) else {
		return Ok(());
	};
	let text = io::read_to_string(entry).map_err(unreadable_io)?;
	let carried = store::names_in(&text)
		.map_err(|_| unreadable_archive("an env file of the archive is not NAME=VALUE lines"))?;
	names.extend(carried);
	Ok(())
}

fn declared(
	places: &Places,
	manifest: &Manifest,
	trees: &Trees,
	minted: &MintedIds,
	laid: &mut Laid,
) -> Result<(), SpaceError> {
	let space = placed_id(minted, &manifest.space_id);
	let space_owner = EnvOwner::Space { id: space.clone() };
	declared_owner(places, &manifest.env.space, &space_owner, laid)?;
	for (bot_id, names) in &manifest.env.bots {
		if !trees.contains_key(&Tree::Bot(bot_id.clone())) {
			return Err(unreadable_archive("the archive names secrets of a row it does not carry"));
		}
		let owner = EnvOwner::Bot { id: placed_id(minted, bot_id), space_id: space.clone() };
		declared_owner(places, names, &owner, laid)?;
	}
	Ok(())
}

fn declared_owner(
	places: &Places,
	held: &OwnerNames,
	owner: &EnvOwner,
	laid: &mut Laid,
) -> Result<(), SpaceError> {
	let [own_dir, servers_dir] = env_dirs(places, owner)?;
	declared_scope(places, &EnvScope::from(owner), &held.names, &own_dir, laid)?;
	for (server, names) in &held.servers {
		let scope = EnvScope::Server { name: server.clone(), owner: owner.clone() };
		declared_scope(places, &scope, names, &servers_dir, laid)?;
	}
	Ok(())
}

fn declared_scope(
	places: &Places,
	scope: &EnvScope,
	names: &[String],
	dir: &Path,
	laid: &mut Laid,
) -> Result<(), SpaceError> {
	if names.is_empty() {
		return Ok(());
	}
	laid.claim(dir).map_err(unwritable_bundle)?;
	store::declare(&places.env, scope, names).map_err(|error| match error {
		EnvError::InvalidName { .. } | EnvError::InvalidScope { .. } => {
			unreadable_archive("the archive names a secret this host refuses")
		}
		other => SpaceError::UnwritableBundle {
			detail: format!("the secret names could not be laid down: {other:?}"),
		},
	})
}

fn laid_avatar(
	entry: &mut tar::Entry<'_, File>,
	rest: &Path,
	target: &Path,
	laid: &mut Laid,
) -> Result<(), SpaceError> {
	let is_one_file = rest.as_os_str().is_empty()
		&& entry.header().entry_type() == tar::EntryType::Regular
		&& !target.exists();
	if !is_one_file {
		return Err(unreadable_archive("an avatar must be one new file"));
	}
	laid.claim_file(target).map_err(unwritable_bundle)?;
	unpacked_file(entry, target).map_err(unwritable_bundle)
}

fn unpacked_file(entry: &mut tar::Entry<'_, File>, target: &Path) -> io::Result<()> {
	private_files::replace_atomically_with(target, |file| io::copy(entry, file).map(|_| ()))
}

fn reown_minted_bots(trees: &Trees, minted: &MintedIds) -> io::Result<()> {
	for (tree, dir) in trees {
		let Tree::Bot(archived) = tree else {
			continue;
		};
		if let Some(placed) = minted.get(archived) {
			bundles::reowned(dir, archived, placed)?;
		}
	}
	Ok(())
}

#[derive(Default)]
struct Laid(Vec<PathBuf>);

impl Laid {
	fn claim(&mut self, dir: &Path) -> io::Result<()> {
		let Some(top) = dir.ancestors().take_while(|held| !held.exists()).last() else {
			return Ok(());
		};
		self.0.push(top.to_path_buf());
		private_files::create_dir(dir)
	}

	fn claim_file(&mut self, file: &Path) -> io::Result<()> {
		if let Some(dir) = file.parent() {
			self.claim(dir)?;
		}
		self.0.push(file.to_path_buf());
		Ok(())
	}

	fn take_back(self) {
		for path in self.0.iter().rev() {
			let removed = match path.is_dir() {
				true => fs::remove_dir_all(path),
				false => fs::remove_file(path),
			};
			match removed {
				Err(error) if error.kind() != io::ErrorKind::NotFound => {
					eprintln!("a path of a failed space import was left on disk: {error}")
				}
				_ => {}
			}
		}
	}
}

fn refuse_relative(path: &Path) -> Result<(), &'static str> {
	match path.is_absolute() {
		true => Ok(()),
		false => Err("the archive path must be absolute"),
	}
}

fn unreadable_archive(detail: &str) -> SpaceError {
	SpaceError::UnreadableArchive { detail: detail.to_owned() }
}

fn unreadable_io(error: io::Error) -> SpaceError {
	unreadable_archive(&format!("the archive could not be read: {:?}", error.kind()))
}

fn unwritable_archive(detail: impl std::fmt::Display) -> SpaceError {
	SpaceError::UnwritableArchive { detail: detail.to_string() }
}

fn unwritable_bundle(error: io::Error) -> SpaceError {
	SpaceError::UnwritableBundle {
		detail: format!("the archive could not be laid down: {:?}", error.kind()),
	}
}

fn now() -> i64 {
	SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |elapsed| elapsed.as_millis() as i64)
}
