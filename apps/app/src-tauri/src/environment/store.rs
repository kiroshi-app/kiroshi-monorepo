use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, PoisonError};

use tauri::{AppHandle, Manager, Runtime};

use super::contract::{
	is_a_connection_name, is_reserved, EnvEntry, EnvError, EnvOwner, EnvScope, PerServer,
	ResolvedEnv, Values, ACCOUNT_BEARER,
};
use crate::descriptors;
use crate::private_files;

const DIR_NAME: &str = "env";
const FILE_NAME: &str = ".env";
const SPACE_DIR: &str = "space";
const BOT_DIR: &str = "bot";
const SERVER_DIR: &str = "server";
const PERSON_DIR: &str = "person";
const USER_DIR: &str = "user";
const ACCOUNT_DIR: &str = "account";

static WRITES: Mutex<()> = Mutex::new(());

type Assignments = Vec<(String, String)>;
type Entries = Vec<(String, Option<String>)>;

pub fn root<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
	Some(app.path().app_data_dir().ok()?.join(DIR_NAME))
}

pub fn set(root: &Path, scope: &EnvScope, name: &str, value: &str) -> Result<(), EnvError> {
	admitted(scope, name)?;
	let path = file(root, scope)?;
	let _serialised = WRITES.lock().unwrap_or_else(PoisonError::into_inner);
	let mut kept = held(&path)?;
	match kept.iter_mut().find(|(defined, _)| defined == name) {
		Some((_, held)) => *held = Some(value.to_owned()),
		None => kept.push((name.to_owned(), Some(value.to_owned()))),
	}
	written(&path, &kept)
}

pub fn declare(root: &Path, scope: &EnvScope, names: &[String]) -> Result<(), EnvError> {
	for name in names {
		admitted(scope, name)?;
		if is_reserved(name) {
			return Err(EnvError::InvalidName { name: name.clone() });
		}
	}
	let path = file(root, scope)?;
	let _serialised = WRITES.lock().unwrap_or_else(PoisonError::into_inner);
	let mut kept = held(&path)?;
	for name in names {
		if kept.iter().all(|(defined, _)| defined != name) {
			kept.push((name.clone(), None));
		}
	}
	written(&path, &kept)
}

pub fn set_one_of(
	root: &Path,
	scope: &EnvScope,
	family: &[&str],
	name: &str,
	value: &str,
) -> Result<(), EnvError> {
	admitted(scope, name)?;
	let path = file(root, scope)?;
	let _serialised = WRITES.lock().unwrap_or_else(PoisonError::into_inner);
	let mut kept = held(&path)?;
	kept.retain(|(defined, _)| !family.contains(&defined.as_str()));
	kept.push((name.to_owned(), Some(value.to_owned())));
	written(&path, &kept)
}

pub fn delete(root: &Path, scope: &EnvScope, name: &str) -> Result<(), EnvError> {
	delete_all(root, scope, &[name])
}

pub fn delete_all(root: &Path, scope: &EnvScope, names: &[&str]) -> Result<(), EnvError> {
	let path = file(root, scope)?;
	let _serialised = WRITES.lock().unwrap_or_else(PoisonError::into_inner);
	let mut kept = held(&path)?;
	let before = kept.len();
	kept.retain(|(defined, _)| !names.contains(&defined.as_str()));
	if kept.len() == before {
		return Ok(());
	}
	written(&path, &kept)
}

fn admitted(scope: &EnvScope, name: &str) -> Result<(), EnvError> {
	let refused_here = match scope {
		EnvScope::Person => !is_a_connection_name(name),
		EnvScope::Account => name != ACCOUNT_BEARER,
		_ => false,
	};
	if !is_a_name(name) || refused_here {
		return Err(EnvError::InvalidName { name: name.to_owned() });
	}
	Ok(())
}

pub fn values(root: &Path, scope: &EnvScope) -> Result<Values, EnvError> {
	Ok(stored(&file(root, scope)?)?.into_iter().collect())
}

pub fn list(root: &Path, scope: &EnvScope) -> Result<Vec<EnvEntry>, EnvError> {
	let mut defined: Vec<(String, EnvScope, bool)> = Vec::new();
	for step in chain(scope) {
		for (name, value) in held(&file(root, &step)?)? {
			if !is_reserved(&name) {
				defined.push((name, step.clone(), value.is_none()));
			}
		}
	}
	let mut entries: Vec<EnvEntry> = defined
		.iter()
		.map(|(name, step, is_unset)| EnvEntry {
			name: name.clone(),
			defined_in: step.clone(),
			served_from: serving(&defined, name).unwrap_or_else(|| step.clone()),
			is_unset: *is_unset,
		})
		.collect();
	entries.sort_by(|left, right| left.name.cmp(&right.name));
	Ok(entries)
}

pub fn names(root: &Path, scope: &EnvScope) -> Result<Vec<String>, EnvError> {
	Ok(unreserved_names(held(&file(root, scope)?)?))
}

pub fn names_in(text: &str) -> Result<Vec<String>, EnvError> {
	Ok(unreserved_names(parsed(text)?))
}

fn unreserved_names(entries: Entries) -> Vec<String> {
	entries.into_iter().map(|(name, _)| name).filter(|name| !is_reserved(name)).collect()
}

pub fn resolve(root: &Path, owner: &EnvOwner) -> Result<ResolvedEnv, EnvError> {
	let mut base = Values::new();
	for step in chain(&EnvScope::from(owner)).into_iter().rev() {
		base.extend(stored(&file(root, &step)?)?);
	}
	base.retain(|name, _| !is_a_connection_name(name));
	let mut per_server = PerServer::new();
	for held in owners(owner) {
		for name in server_names(root, &held)? {
			let scope = EnvScope::Server { name: name.clone(), owner: held.clone() };
			let mut own = stored(&file(root, &scope)?)?;
			own.retain(|(name, _)| !is_a_connection_name(name));
			if own.is_empty() {
				continue;
			}
			per_server.entry(name).or_default().extend(own);
		}
	}
	Ok(ResolvedEnv { base, per_server, ..ResolvedEnv::default() })
}

pub fn server_scopes(root: &Path, owner: &EnvOwner) -> Result<Vec<EnvScope>, EnvError> {
	let mut scopes = Vec::new();
	for held in owners(owner) {
		for name in server_names(root, &held)? {
			scopes.push(EnvScope::Server { name, owner: held.clone() });
		}
	}
	Ok(scopes)
}

pub fn copy_owner(root: &Path, source: &EnvOwner, target: &EnvOwner) -> Result<(), EnvError> {
	copied_scope(root, &EnvScope::from(source), &EnvScope::from(target))?;
	for name in server_names(root, source)? {
		copied_scope(
			root,
			&EnvScope::Server { name: name.clone(), owner: source.clone() },
			&EnvScope::Server { name, owner: target.clone() },
		)?;
	}
	Ok(())
}

fn copied_scope(root: &Path, source: &EnvScope, target: &EnvScope) -> Result<(), EnvError> {
	let mut unset = Vec::new();
	for (name, value) in held(&file(root, source)?)? {
		match value {
			Some(value) => set(root, target, &name, &value)?,
			None => unset.push(name),
		}
	}
	if unset.is_empty() {
		return Ok(());
	}
	declare(root, target, &unset)
}

pub fn owner_dirs(root: &Path, owner: &EnvOwner) -> Result<[PathBuf; 2], EnvError> {
	Ok([scope_dir(root, &EnvScope::from(owner))?, servers_dir(root, owner)?])
}

fn owners(owner: &EnvOwner) -> Vec<EnvOwner> {
	match owner {
		EnvOwner::User | EnvOwner::Space { .. } => vec![owner.clone()],
		EnvOwner::Bot { space_id, .. } => {
			vec![EnvOwner::User, EnvOwner::Space { id: space_id.clone() }, owner.clone()]
		}
	}
}

pub fn server_names(root: &Path, owner: &EnvOwner) -> Result<Vec<String>, EnvError> {
	let Ok(listed) = fs::read_dir(servers_dir(root, owner)?) else {
		return Ok(Vec::new());
	};
	Ok(listed
		.flatten()
		.filter(|entry| entry.path().is_dir())
		.filter_map(|entry| entry.file_name().into_string().ok())
		.collect())
}

pub fn forget_space<R: Runtime>(app: &AppHandle<R>, space_id: &str, bot_ids: &[String]) {
	if let Some(root) = root(app) {
		forget_space_at(&root, space_id, bot_ids);
	}
}

pub fn forget_bot<R: Runtime>(app: &AppHandle<R>, bot_id: &str) {
	if let Some(root) = root(app) {
		forget_owner_at(&root, BOT_DIR, bot_id);
	}
}

pub fn forget_server<R: Runtime>(app: &AppHandle<R>, owner: &EnvOwner, name: &str) {
	if let Some(root) = root(app) {
		forget_server_at(&root, owner, name);
	}
}

fn forget_space_at(root: &Path, space_id: &str, bot_ids: &[String]) {
	forget_owner_at(root, SPACE_DIR, space_id);
	for bot_id in bot_ids {
		forget_owner_at(root, BOT_DIR, bot_id);
	}
}

fn forget_server_at(root: &Path, owner: &EnvOwner, name: &str) {
	let held = EnvScope::Server { name: name.to_owned(), owner: owner.clone() };
	if let Ok(dir) = scope_dir(root, &held) {
		let _ = fs::remove_dir_all(dir);
	}
}

fn forget_owner_at(root: &Path, kind: &str, id: &str) {
	let Ok(id) = segment(id) else {
		return;
	};
	let _ = fs::remove_dir_all(root.join(kind).join(id));
	let _ = fs::remove_dir_all(root.join(SERVER_DIR).join(kind).join(id));
}

fn serving(chained: &[(String, EnvScope, bool)], name: &str) -> Option<EnvScope> {
	chained
		.iter()
		.find(|(defined, _, is_unset)| defined == name && !is_unset)
		.map(|(_, step, _)| step.clone())
}

fn chain(scope: &EnvScope) -> Vec<EnvScope> {
	let mut steps = vec![scope.clone()];
	if let Some(wider) = broader(scope) {
		steps.extend(chain(&wider));
	}
	steps
}

fn broader(scope: &EnvScope) -> Option<EnvScope> {
	match scope {
		EnvScope::User | EnvScope::Person | EnvScope::Account => None,
		EnvScope::Space { .. } => Some(EnvScope::User),
		EnvScope::Bot { space_id, .. } => Some(EnvScope::Space { id: space_id.clone() }),
		EnvScope::Server { owner, .. } => Some(owner.into()),
	}
}

fn file(root: &Path, scope: &EnvScope) -> Result<PathBuf, EnvError> {
	Ok(scope_dir(root, scope)?.join(FILE_NAME))
}

fn scope_dir(root: &Path, scope: &EnvScope) -> Result<PathBuf, EnvError> {
	match scope {
		EnvScope::User => Ok(root.join(USER_DIR)),
		EnvScope::Space { id } => Ok(root.join(SPACE_DIR).join(segment(id)?)),
		EnvScope::Bot { id, .. } => Ok(root.join(BOT_DIR).join(segment(id)?)),
		EnvScope::Server { name, owner } => Ok(servers_dir(root, owner)?.join(segment(name)?)),
		EnvScope::Person => Ok(root.join(PERSON_DIR)),
		EnvScope::Account => Ok(root.join(ACCOUNT_DIR)),
	}
}

fn servers_dir(root: &Path, owner: &EnvOwner) -> Result<PathBuf, EnvError> {
	let servers = root.join(SERVER_DIR);
	match owner {
		EnvOwner::User => Ok(servers.join(USER_DIR)),
		EnvOwner::Space { id } => Ok(servers.join(SPACE_DIR).join(segment(id)?)),
		EnvOwner::Bot { id, .. } => Ok(servers.join(BOT_DIR).join(segment(id)?)),
	}
}

fn segment(value: &str) -> Result<&str, EnvError> {
	let refused =
		value.is_empty() || value == "." || value == ".." || value.contains(['/', '\\', '\0']);
	if refused {
		return Err(EnvError::InvalidScope {
			detail: "a scope is named by plain file names".to_owned(),
		});
	}
	Ok(value)
}

fn stored(path: &Path) -> Result<Assignments, EnvError> {
	Ok(held(path)?.into_iter().filter_map(|(name, value)| Some((name, value?))).collect())
}

fn held(path: &Path) -> Result<Entries, EnvError> {
	match fs::read_to_string(path) {
		Ok(text) => parsed(&text),
		Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Entries::new()),
		Err(error) => {
			descriptors::note_exhaustion(&error, path);
			Err(EnvError::Unreadable { detail: error.to_string() })
		}
	}
}

fn written(path: &Path, entries: &Entries) -> Result<(), EnvError> {
	private_files::replace_atomically(path, rendered(entries).as_bytes()).map_err(|error| {
		descriptors::note_exhaustion(&error, path);
		EnvError::Unwritable { detail: error.to_string() }
	})
}

fn rendered(entries: &Entries) -> String {
	entries
		.iter()
		.map(|(name, value)| match value {
			Some(value) => format!("{name}={}\n", quoted(value)),
			None => format!("{name}\n"),
		})
		.collect()
}

fn quoted(value: &str) -> String {
	let mut written = String::from("\"");
	for character in value.chars() {
		match character {
			'\\' => written.push_str("\\\\"),
			'"' => written.push_str("\\\""),
			'\n' => written.push_str("\\n"),
			'\r' => written.push_str("\\r"),
			_ => written.push(character),
		}
	}
	written.push('"');
	written
}

fn parsed(text: &str) -> Result<Entries, EnvError> {
	let mut entries = Entries::new();
	for (index, line) in text.lines().enumerate() {
		let trimmed = line.trim();
		if trimmed.is_empty() || trimmed.starts_with('#') {
			continue;
		}
		let at = index + 1;
		let (name, value) = match trimmed.split_once('=') {
			Some((name, rest)) => (name.trim_end(), Some(value_of(rest, at)?)),
			None => (trimmed, None),
		};
		if !is_a_name(name) {
			return Err(malformed(at));
		}
		entries.push((name.to_owned(), value));
	}
	Ok(entries)
}

fn value_of(rest: &str, at: usize) -> Result<String, EnvError> {
	let Some(opened) = rest.strip_prefix('"') else {
		return Ok(rest.trim_end().to_owned());
	};
	let mut value = String::new();
	let mut characters = opened.chars();
	while let Some(character) = characters.next() {
		match character {
			'"' if characters.as_str().trim().is_empty() => return Ok(value),
			'"' => return Err(malformed(at)),
			'\\' => value.push(unescaped(characters.next().ok_or_else(|| malformed(at))?)),
			_ => value.push(character),
		}
	}
	Err(malformed(at))
}

fn unescaped(character: char) -> char {
	match character {
		'n' => '\n',
		'r' => '\r',
		't' => '\t',
		held => held,
	}
}

fn malformed(at: usize) -> EnvError {
	EnvError::Unreadable { detail: format!("line {at} is not a NAME=VALUE assignment") }
}

fn is_a_name(name: &str) -> bool {
	let mut characters = name.chars();
	let opens = characters.next().is_some_and(|first| first.is_ascii_uppercase() || first == '_');
	opens && characters.all(is_a_name_character)
}

fn is_a_name_character(character: char) -> bool {
	character.is_ascii_uppercase() || character.is_ascii_digit() || character == '_'
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::environment::contract::{API_KEY, OAUTH_ACCESS_TOKEN};
	use crate::removed_on_drop::RemovedOnDrop;

	fn a_root(name: &str) -> RemovedOnDrop {
		crate::db::connection::fixture_root(&format!("environment-{name}"))
	}

	fn a_space() -> EnvScope {
		EnvScope::Space { id: "s1".to_owned() }
	}

	fn a_bot() -> EnvScope {
		EnvScope::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn a_server() -> EnvScope {
		EnvScope::Server {
			name: "clock".to_owned(),
			owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		}
	}

	fn names(entries: &[EnvEntry]) -> Vec<(&str, &EnvScope, &EnvScope)> {
		entries
			.iter()
			.map(|entry| (entry.name.as_str(), &entry.defined_in, &entry.served_from))
			.collect()
	}

	#[test]
	fn a_scope_files_its_variables_under_the_path_reserved_for_it() {
		let root = a_root("paths");
		assert_eq!(file(&root, &a_space()).expect("the path"), root.join("space/s1/.env"));
		assert_eq!(file(&root, &a_bot()).expect("the path"), root.join("bot/b1/.env"));
		assert_eq!(
			file(&root, &a_server()).expect("the path"),
			root.join("server/bot/b1/clock/.env")
		);
		assert_eq!(
			file(
				&root,
				&EnvScope::Server {
					name: "clock".to_owned(),
					owner: EnvOwner::Space { id: "s1".to_owned() },
				}
			)
			.expect("the path"),
			root.join("server/space/s1/clock/.env")
		);
	}

	#[test]
	fn a_scope_named_to_climb_out_of_the_store_is_refused() {
		let root = a_root("traversal");
		let climbing = EnvScope::Server {
			name: "..".to_owned(),
			owner: EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		};
		assert!(matches!(file(&root, &climbing), Err(EnvError::InvalidScope { .. })));
		assert!(matches!(
			set(&root, &EnvScope::Space { id: "a/b".to_owned() }, "TOKEN", "x"),
			Err(EnvError::InvalidScope { .. })
		));
	}

	#[test]
	fn the_narrowest_scope_that_defines_a_name_serves_it() {
		let root = a_root("resolution");
		set(&root, &a_space(), "SHARED", "space").expect("the space keeps it");
		set(&root, &a_space(), "ONLY_SPACE", "space").expect("the space keeps it");
		set(&root, &a_bot(), "SHARED", "bot").expect("the bot keeps it");
		set(&root, &a_bot(), "ONLY_BOT", "bot").expect("the bot keeps it");
		set(&root, &a_server(), "SHARED", "server").expect("the server keeps it");

		let entries = list(&root, &a_server()).expect("the chain reads");
		assert_eq!(
			names(&entries),
			vec![
				("ONLY_BOT", &a_bot(), &a_bot()),
				("ONLY_SPACE", &a_space(), &a_space()),
				("SHARED", &a_server(), &a_server()),
				("SHARED", &a_bot(), &a_server()),
				("SHARED", &a_space(), &a_server()),
			]
		);

		let seen_by_the_bot = list(&root, &a_bot()).expect("the chain reads");
		assert_eq!(
			names(&seen_by_the_bot),
			vec![
				("ONLY_BOT", &a_bot(), &a_bot()),
				("ONLY_SPACE", &a_space(), &a_space()),
				("SHARED", &a_bot(), &a_bot()),
				("SHARED", &a_space(), &a_bot()),
			]
		);

		let seen_by_the_space = list(&root, &a_space()).expect("the chain reads");
		assert_eq!(
			names(&seen_by_the_space),
			vec![("ONLY_SPACE", &a_space(), &a_space()), ("SHARED", &a_space(), &a_space())]
		);
	}

	fn an_owner() -> EnvOwner {
		EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() }
	}

	fn holding(pairs: &[(&str, &str)]) -> Values {
		pairs.iter().map(|(name, value)| ((*name).to_owned(), (*value).to_owned())).collect()
	}

	#[test]
	fn resolution_carries_the_bot_chain_as_the_base_and_each_server_as_an_overlay() {
		let root = a_root("resolve");
		let other = EnvScope::Server { name: "weather".to_owned(), owner: an_owner() };
		set(&root, &a_space(), "SHARED", "space").expect("the space keeps it");
		set(&root, &a_space(), "ONLY_SPACE", "space").expect("the space keeps it");
		set(&root, &a_bot(), "SHARED", "bot").expect("the bot keeps it");
		set(&root, &a_server(), "SHARED", "server").expect("the server keeps it");
		set(&root, &other, "TOKEN", "weather").expect("the other server keeps it");

		let resolved = resolve(&root, &an_owner()).expect("the store reads");

		assert_eq!(resolved.base, holding(&[("ONLY_SPACE", "space"), ("SHARED", "bot")]));
		assert_eq!(resolved.per_server["clock"], holding(&[("SHARED", "server")]));
		assert_eq!(resolved.per_server["weather"], holding(&[("TOKEN", "weather")]));
		assert_eq!(resolved.failure, None);
	}

	#[test]
	fn resolution_carries_the_servers_of_the_space_under_those_of_the_bot() {
		let root = a_root("resolve-space-servers");
		let held = EnvScope::Server {
			name: "clock".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		};
		let only_space = EnvScope::Server {
			name: "weather".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		};
		set(&root, &held, "SHARED", "space").expect("the space server keeps it");
		set(&root, &held, "ONLY_SPACE", "space").expect("the space server keeps it");
		set(&root, &only_space, "TOKEN", "space").expect("the space server keeps it");
		set(&root, &a_server(), "SHARED", "bot").expect("the bot server keeps it");

		let resolved = resolve(&root, &an_owner()).expect("the store reads");

		assert_eq!(
			resolved.per_server["clock"],
			holding(&[("ONLY_SPACE", "space"), ("SHARED", "bot")])
		);
		assert_eq!(resolved.per_server["weather"], holding(&[("TOKEN", "space")]));
	}

	fn a_user_server(name: &str) -> EnvScope {
		EnvScope::Server { name: name.to_owned(), owner: EnvOwner::User }
	}

	#[test]
	fn a_user_server_is_filed_under_a_path_that_names_no_space_and_no_bot() {
		let root = a_root("user-server-path");
		assert_eq!(
			file(&root, &a_user_server("clock")).expect("the path"),
			root.join("server/user/clock/.env")
		);
	}

	#[test]
	fn the_environment_of_a_user_server_reaches_a_bot_whose_space_declares_none_of_that_name() {
		let root = a_root("resolve-user-servers");
		set(&root, &a_user_server("granola"), "REGION", "eu").expect("the user scope keeps it");

		let resolved = resolve(&root, &an_owner()).expect("the store reads");

		assert_eq!(resolved.per_server["granola"], holding(&[("REGION", "eu")]));
	}

	#[test]
	fn resolution_lays_the_user_servers_under_the_space_and_the_bot() {
		let root = a_root("resolve-user-order");
		let space_clock = EnvScope::Server {
			name: "clock".to_owned(),
			owner: EnvOwner::Space { id: "s1".to_owned() },
		};
		set(&root, &a_user_server("clock"), "SHARED", "user").expect("the user scope keeps it");
		set(&root, &a_user_server("clock"), "SPACE_WINS", "user").expect("the user scope keeps it");
		set(&root, &a_user_server("clock"), "ONLY_USER", "user").expect("the user scope keeps it");
		set(&root, &space_clock, "SPACE_WINS", "space").expect("the space keeps it");
		set(&root, &space_clock, "SHARED", "space").expect("the space keeps it");
		set(&root, &a_server(), "SHARED", "bot").expect("the bot keeps it");

		let resolved = resolve(&root, &an_owner()).expect("the store reads");

		assert_eq!(
			resolved.per_server["clock"],
			holding(&[("ONLY_USER", "user"), ("SHARED", "bot"), ("SPACE_WINS", "space")])
		);
	}

	#[test]
	fn the_user_owner_resolves_only_what_the_user_scope_holds() {
		let root = a_root("resolve-user-owner");
		set(&root, &a_user_server("clock"), "REGION", "eu").expect("the user scope keeps it");
		set(&root, &a_server(), "REGION", "bot").expect("the bot keeps it");

		let resolved = resolve(&root, &EnvOwner::User).expect("the store reads");

		assert_eq!(resolved.per_server["clock"], holding(&[("REGION", "eu")]));
		assert_eq!(
			server_scopes(&root, &EnvOwner::User).expect("the store reads"),
			vec![a_user_server("clock")]
		);
	}

	#[test]
	fn the_base_of_a_bot_lays_the_user_scope_under_its_space_and_the_narrower_value_is_served() {
		let root = a_root("resolve-user-base-bot");
		set(&root, &EnvScope::User, "ONLY_USER", "user").expect("the user scope keeps it");
		set(&root, &EnvScope::User, "SPACE_WINS", "user").expect("the user scope keeps it");
		set(&root, &EnvScope::User, "BOT_WINS", "user").expect("the user scope keeps it");
		set(&root, &a_space(), "SPACE_WINS", "space").expect("the space keeps it");
		set(&root, &a_bot(), "BOT_WINS", "bot").expect("the bot keeps it");

		let resolved = resolve(&root, &an_owner()).expect("the store reads");

		assert_eq!(
			resolved.base,
			holding(&[("BOT_WINS", "bot"), ("ONLY_USER", "user"), ("SPACE_WINS", "space")])
		);
	}

	#[test]
	fn the_base_of_a_space_lays_the_user_scope_under_it_and_the_space_value_is_served() {
		let root = a_root("resolve-user-base-space");
		set(&root, &EnvScope::User, "ONLY_USER", "user").expect("the user scope keeps it");
		set(&root, &EnvScope::User, "SHARED", "user").expect("the user scope keeps it");
		set(&root, &a_space(), "SHARED", "space").expect("the space keeps it");

		let resolved =
			resolve(&root, &EnvOwner::Space { id: "s1".to_owned() }).expect("the store reads");

		assert_eq!(resolved.base, holding(&[("ONLY_USER", "user"), ("SHARED", "space")]));
		assert_eq!(
			names(&list(&root, &a_space()).expect("the chain reads")),
			vec![
				("ONLY_USER", &EnvScope::User, &EnvScope::User),
				("SHARED", &a_space(), &a_space()),
				("SHARED", &EnvScope::User, &a_space()),
			]
		);
	}

	#[test]
	fn a_copy_carries_what_the_bot_holds_of_its_own_and_none_of_what_it_inherits() {
		let root = a_root("copy-owner");
		let copy = EnvOwner::Bot { id: "b2".to_owned(), space_id: "s1".to_owned() };
		set(&root, &a_space(), "ONLY_SPACE", "space").expect("the space keeps it");
		set(&root, &a_bot(), "TOKEN", "bot").expect("the bot keeps it");
		set(&root, &a_server(), "TOKEN", "server").expect("the bot server keeps it");

		copy_owner(&root, &an_owner(), &copy).expect("the store copies");

		let own = stored(&file(&root, &EnvScope::from(&copy)).expect("the path"))
			.expect("the copy reads");
		assert_eq!(own, vec![("TOKEN".to_owned(), "bot".to_owned())]);
		let resolved = resolve(&root, &copy).expect("the store reads");
		assert_eq!(resolved.base, holding(&[("ONLY_SPACE", "space"), ("TOKEN", "bot")]));
		assert_eq!(resolved.per_server["clock"], holding(&[("TOKEN", "server")]));
		assert_eq!(resolve(&root, &an_owner()).expect("the store reads"), resolved);
	}

	#[test]
	fn a_copy_declares_unset_what_the_bot_and_its_servers_hold_unset() {
		let root = a_root("copy-owner-unset");
		let copy = EnvOwner::Bot { id: "b2".to_owned(), space_id: "s1".to_owned() };
		let copied_server = EnvScope::Server { name: "clock".to_owned(), owner: copy.clone() };
		set(&root, &a_bot(), "TOKEN", "bot").expect("the bot keeps it");
		declare(&root, &a_bot(), &["PENDING".to_owned()]).expect("the bot declares it");
		declare(&root, &a_server(), &["REGION".to_owned()]).expect("the server declares it");

		copy_owner(&root, &an_owner(), &copy).expect("the store copies");

		assert_eq!(
			unset_names(&list(&root, &EnvScope::from(&copy)).expect("the chain reads")),
			vec![("PENDING", &EnvScope::from(&copy), &EnvScope::from(&copy))]
		);
		assert_eq!(
			unset_names(&list(&root, &copied_server).expect("the chain reads")),
			vec![
				("PENDING", &EnvScope::from(&copy), &EnvScope::from(&copy)),
				("REGION", &copied_server, &copied_server),
			]
		);
		assert_eq!(
			resolve(&root, &copy).expect("the store reads").base,
			holding(&[("TOKEN", "bot")])
		);
	}

	#[test]
	fn a_copy_keeps_the_value_the_target_holds_for_a_name_the_source_holds_unset() {
		let root = a_root("copy-owner-kept");
		let copy = EnvOwner::Bot { id: "b2".to_owned(), space_id: "s1".to_owned() };
		declare(&root, &a_bot(), &["TOKEN".to_owned()]).expect("the bot declares it");
		set(&root, &EnvScope::from(&copy), "TOKEN", "held").expect("the copy keeps it");

		copy_owner(&root, &an_owner(), &copy).expect("the store copies");

		assert_eq!(
			resolve(&root, &copy).expect("the store reads").base,
			holding(&[("TOKEN", "held")])
		);
		assert!(
			unset_names(&list(&root, &EnvScope::from(&copy)).expect("the chain reads")).is_empty()
		);
	}

	#[test]
	fn resolution_of_an_empty_store_carries_nothing() {
		let root = a_root("resolve-empty");
		assert_eq!(resolve(&root, &an_owner()).expect("the store reads"), ResolvedEnv::default());
	}

	#[test]
	fn resolution_fails_when_a_file_of_the_chain_cannot_be_read() {
		let root = a_root("resolve-unreadable");
		private_files::write(&file(&root, &a_bot()).expect("the path"), b"KEPT=\"unterminated\n")
			.expect("the file is planted");

		assert!(matches!(resolve(&root, &an_owner()), Err(EnvError::Unreadable { .. })));
	}

	#[test]
	fn a_name_the_pattern_refuses_leaves_every_file_untouched() {
		let root = a_root("refused-name");
		set(&root, &a_bot(), "KEPT", "held").expect("the bot keeps it");
		let before = fs::read_to_string(file(&root, &a_bot()).expect("the path")).expect("read");

		for refused in ["lower", "1LEADING", "WITH-DASH", "", "WITH SPACE", "WITH_é"] {
			assert_eq!(
				set(&root, &a_bot(), refused, "x"),
				Err(EnvError::InvalidName { name: refused.to_owned() })
			);
		}

		assert_eq!(
			fs::read_to_string(file(&root, &a_bot()).expect("the path")).expect("read"),
			before
		);
	}

	#[test]
	fn writing_one_name_preserves_every_other_name_of_the_file() {
		let root = a_root("siblings");
		set(&root, &a_bot(), "FIRST", "one").expect("the bot keeps it");
		set(&root, &a_bot(), "SECOND", "two").expect("the bot keeps it");
		set(&root, &a_bot(), "THIRD", "three").expect("the bot keeps it");
		set(&root, &a_bot(), "SECOND", "replaced").expect("the bot replaces it");

		let path = file(&root, &a_bot()).expect("the path");
		assert_eq!(
			stored(&path).expect("the file reads"),
			vec![
				("FIRST".to_owned(), "one".to_owned()),
				("SECOND".to_owned(), "replaced".to_owned()),
				("THIRD".to_owned(), "three".to_owned()),
			]
		);

		delete(&root, &a_bot(), "SECOND").expect("the bot drops it");
		assert_eq!(
			stored(&path).expect("the file reads"),
			vec![("FIRST".to_owned(), "one".to_owned()), ("THIRD".to_owned(), "three".to_owned())]
		);
	}

	#[test]
	fn a_value_holding_a_newline_a_quote_or_a_backslash_reads_back_as_it_was_given() {
		let root = a_root("round-trip");
		let awkward = "line\nnext\r\ttab \"quoted\" back\\slash trailing ";
		set(&root, &a_bot(), "AWKWARD", awkward).expect("the bot keeps it");
		set(&root, &a_bot(), "AFTER", "still here").expect("the bot keeps it");

		let path = file(&root, &a_bot()).expect("the path");
		assert_eq!(
			stored(&path).expect("the file reads"),
			vec![
				("AWKWARD".to_owned(), awkward.to_owned()),
				("AFTER".to_owned(), "still here".to_owned()),
			]
		);
	}

	#[test]
	fn a_file_that_cannot_be_parsed_fails_every_command_on_its_scope() {
		let root = a_root("unreadable");
		let path = file(&root, &a_bot()).expect("the path");
		private_files::write(&path, b"KEPT=\"unterminated\n").expect("the file is planted");

		assert!(matches!(list(&root, &a_bot()), Err(EnvError::Unreadable { .. })));
		assert!(matches!(set(&root, &a_bot(), "TOKEN", "x"), Err(EnvError::Unreadable { .. })));
		assert!(matches!(delete(&root, &a_bot(), "KEPT"), Err(EnvError::Unreadable { .. })));
		assert!(matches!(list(&root, &a_server()), Err(EnvError::Unreadable { .. })));

		assert_eq!(
			fs::read_to_string(&path).expect("read"),
			"KEPT=\"unterminated\n",
			"the refused file is left as it was"
		);
	}

	#[test]
	fn a_file_that_is_not_an_assignment_fails_rather_than_reading_as_empty() {
		let root = a_root("garbage");
		let path = file(&root, &a_space()).expect("the path");
		private_files::write(&path, b"# a note\n\nnot an assignment\n").expect("planted");
		assert!(matches!(list(&root, &a_space()), Err(EnvError::Unreadable { .. })));
	}

	#[test]
	fn a_deleted_bot_takes_its_file_and_the_files_of_its_servers_with_it() {
		let root = a_root("forget-bot");
		set(&root, &a_space(), "SHARED", "space").expect("the space keeps it");
		set(&root, &a_bot(), "TOKEN", "bot").expect("the bot keeps it");
		set(&root, &a_server(), "TOKEN", "server").expect("the server keeps it");

		forget_owner_at(&root, BOT_DIR, "b1");

		assert!(!file(&root, &a_bot()).expect("the path").exists());
		assert!(!file(&root, &a_server()).expect("the path").exists());
		assert!(file(&root, &a_space()).expect("the path").exists());
	}

	#[test]
	fn a_deleted_space_takes_its_file_and_the_files_of_its_servers_with_it() {
		let root = a_root("forget-space");
		let owner = EnvOwner::Space { id: "s1".to_owned() };
		let server = EnvScope::Server { name: "clock".to_owned(), owner };
		set(&root, &a_space(), "TOKEN", "space").expect("the space keeps it");
		set(&root, &server, "TOKEN", "server").expect("the server keeps it");

		forget_space_at(&root, "s1", &[]);

		assert!(!file(&root, &a_space()).expect("the path").exists());
		assert!(!file(&root, &server).expect("the path").exists());
	}

	#[test]
	fn a_deleted_space_takes_the_files_of_the_bots_it_held_and_of_their_servers() {
		let root = a_root("forget-held-bots");
		let elsewhere = EnvScope::Bot { id: "b2".to_owned(), space_id: "s2".to_owned() };
		let elsewhere_server = EnvScope::Server {
			name: "clock".to_owned(),
			owner: EnvOwner::Bot { id: "b2".to_owned(), space_id: "s2".to_owned() },
		};
		set(&root, &a_space(), "TOKEN", "space").expect("the space keeps it");
		set(&root, &a_bot(), "TOKEN", "bot").expect("the held bot keeps it");
		set(&root, &a_server(), "TOKEN", "server").expect("the held server keeps it");
		set(&root, &elsewhere, "TOKEN", "other").expect("the outside bot keeps it");
		set(&root, &elsewhere_server, "TOKEN", "other").expect("its server keeps it");

		forget_space_at(&root, "s1", &["b1".to_owned()]);

		assert!(!file(&root, &a_space()).expect("the path").exists());
		assert!(!file(&root, &a_bot()).expect("the path").exists());
		assert!(!file(&root, &a_server()).expect("the path").exists());
		assert!(file(&root, &elsewhere).expect("the path").exists());
		assert!(file(&root, &elsewhere_server).expect("the path").exists());
	}

	#[test]
	fn a_removed_server_takes_only_its_own_file_with_it() {
		let root = a_root("forget-server");
		let owner = EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() };
		let kept = EnvScope::Server { name: "weather".to_owned(), owner: owner.clone() };
		set(&root, &a_server(), "TOKEN", "server").expect("the server keeps it");
		set(&root, &kept, "TOKEN", "other").expect("the other server keeps it");
		set(&root, &a_bot(), "TOKEN", "bot").expect("the bot keeps it");

		forget_server_at(&root, &owner, "clock");

		assert!(!file(&root, &a_server()).expect("the path").exists());
		assert!(file(&root, &kept).expect("the path").exists());
		assert!(file(&root, &a_bot()).expect("the path").exists());
	}

	#[test]
	fn the_account_scope_keeps_only_the_bearer_and_reaches_no_resolution_and_no_listing() {
		let root = a_root("account");
		assert_eq!(
			set(&root, &EnvScope::Account, "REGION", "eu"),
			Err(EnvError::InvalidName { name: "REGION".to_owned() })
		);
		set(&root, &EnvScope::Account, ACCOUNT_BEARER, "bearer").expect("the account keeps it");
		let owners = [
			EnvOwner::User,
			EnvOwner::Space { id: "s1".to_owned() },
			EnvOwner::Bot { id: "b1".to_owned(), space_id: "s1".to_owned() },
		];

		for owner in owners {
			let resolved = resolve(&root, &owner).expect("the store reads");
			assert_eq!(resolved.base.get(ACCOUNT_BEARER), None, "{owner:?}");
			let listed = list(&root, &EnvScope::from(&owner)).expect("the chain reads");
			assert!(listed.iter().all(|entry| entry.name != ACCOUNT_BEARER), "{owner:?}");
		}
		assert_eq!(
			values(&root, &EnvScope::Account).expect("the store reads").get(ACCOUNT_BEARER),
			Some(&"bearer".to_owned())
		);
	}

	fn unset_names(entries: &[EnvEntry]) -> Vec<(&str, &EnvScope, &EnvScope)> {
		entries
			.iter()
			.filter(|entry| entry.is_unset)
			.map(|entry| (entry.name.as_str(), &entry.defined_in, &entry.served_from))
			.collect()
	}

	#[test]
	fn a_declared_name_is_listed_unset_and_never_resolved() {
		let root = a_root("declared");
		declare(&root, &a_bot(), &["TOKEN".to_owned()]).expect("the bot declares it");

		let listed = list(&root, &a_bot()).expect("the chain reads");
		assert_eq!(unset_names(&listed), vec![("TOKEN", &a_bot(), &a_bot())]);
		assert_eq!(listed.len(), 1);
		assert_eq!(resolve(&root, &an_owner()).expect("the store reads"), ResolvedEnv::default());
		assert_eq!(super::names(&root, &a_bot()).expect("the scope reads"), vec!["TOKEN"]);
	}

	#[test]
	fn a_declared_name_is_served_by_a_wider_scope_that_holds_a_value() {
		let root = a_root("declared-under-value");
		set(&root, &a_space(), "TOKEN", "space").expect("the space keeps it");
		declare(&root, &a_bot(), &["TOKEN".to_owned()]).expect("the bot declares it");

		let listed = list(&root, &a_bot()).expect("the chain reads");
		assert_eq!(unset_names(&listed), vec![("TOKEN", &a_bot(), &a_space())]);
		let resolved = resolve(&root, &an_owner()).expect("the store reads");
		assert_eq!(resolved.base, holding(&[("TOKEN", "space")]));
	}

	#[test]
	fn a_value_written_for_a_declared_name_is_served_and_no_longer_unset() {
		let root = a_root("declared-then-set");
		declare(&root, &a_bot(), &["TOKEN".to_owned(), "KEPT".to_owned()]).expect("declared");
		set(&root, &a_bot(), "TOKEN", "bot").expect("the bot keeps it");

		let listed = list(&root, &a_bot()).expect("the chain reads");
		assert_eq!(unset_names(&listed), vec![("KEPT", &a_bot(), &a_bot())]);
		assert_eq!(
			resolve(&root, &an_owner()).expect("the store reads").base,
			holding(&[("TOKEN", "bot")])
		);
		declare(&root, &a_bot(), &["TOKEN".to_owned()]).expect("declared again");
		assert_eq!(
			resolve(&root, &an_owner()).expect("the store reads").base,
			holding(&[("TOKEN", "bot")]),
			"declaring a held name leaves its value"
		);
	}

	#[test]
	fn a_deleted_declared_name_leaves_the_listing() {
		let root = a_root("declared-then-deleted");
		declare(&root, &a_bot(), &["TOKEN".to_owned()]).expect("the bot declares it");

		delete(&root, &a_bot(), "TOKEN").expect("the bot drops it");

		assert_eq!(list(&root, &a_bot()).expect("the chain reads"), Vec::new());
	}

	#[test]
	fn a_reserved_or_malformed_name_is_never_declared() {
		let root = a_root("declared-refused");
		for refused in [OAUTH_ACCESS_TOKEN, API_KEY, "lower"] {
			assert_eq!(
				declare(&root, &a_bot(), &[refused.to_owned()]),
				Err(EnvError::InvalidName { name: refused.to_owned() })
			);
		}
		assert!(!file(&root, &a_bot()).expect("the path").exists());
	}

	#[test]
	fn the_names_of_an_env_text_leave_its_values_and_its_reserved_names_out() {
		let text = format!("TOKEN=\"held\"\nDECLARED\n{OAUTH_ACCESS_TOKEN}=\"grant\"\n");
		assert_eq!(
			names_in(&text).expect("the text parses"),
			vec!["TOKEN".to_owned(), "DECLARED".to_owned()]
		);
	}

	#[test]
	fn dropping_a_name_that_was_never_kept_changes_nothing() {
		let root = a_root("absent");
		delete(&root, &a_bot(), "NEVER").expect("the bot has nothing to drop");
		assert!(!file(&root, &a_bot()).expect("the path").exists());
		assert_eq!(list(&root, &a_bot()).expect("the chain reads"), Vec::new());
	}

	#[cfg(unix)]
	#[test]
	fn the_file_is_owner_only_and_so_is_every_directory_leading_to_it() {
		use std::os::unix::fs::PermissionsExt;

		let root = a_root("permissions");
		set(&root, &a_server(), "TOKEN", "held").expect("the server keeps it");

		let path = file(&root, &a_server()).expect("the path");
		assert_eq!(fs::metadata(&path).expect("the file").permissions().mode() & 0o777, 0o600);
		let mut dir = path.parent();
		while let Some(walked) = dir.filter(|walked| walked.starts_with(&root)) {
			assert_eq!(
				fs::metadata(walked).expect("the directory").permissions().mode() & 0o777,
				0o700,
				"{walked:?}"
			);
			dir = walked.parent();
		}
	}
}
