use futures_util::future::BoxFuture;

use super::caller::Caller;
use crate::agent::protocol::SpaceMember;
use crate::core_context::Core;
use crate::db::repositories::messages::AccountAuthor;
use crate::db::{Database, DatabaseError};

pub trait Authors: Send + Sync + 'static {
	fn author<'a>(
		&'a self,
		caller: Caller,
		core: &'a Core,
		database: &'a Database,
	) -> BoxFuture<'a, Result<AccountAuthor, DatabaseError>>;

	fn members_of<'a>(
		&'a self,
		core: &'a Core,
		database: &'a Database,
		space_id: &'a str,
	) -> BoxFuture<'a, Result<Vec<SpaceMember>, DatabaseError>>;
}

pub fn install_authors(core: &Core, authors: impl Authors) -> bool {
	core.manage::<Box<dyn Authors>>(Box::new(authors))
}

pub async fn author(
	caller: Caller,
	core: &Core,
	database: &Database,
) -> Result<AccountAuthor, DatabaseError> {
	match core.try_state::<Box<dyn Authors>>() {
		Some(authors) => authors.author(caller, core, database).await,
		None => Ok(AccountAuthor::default()),
	}
}

pub async fn members_of(
	core: &Core,
	database: &Database,
	space_id: &str,
) -> Result<Vec<SpaceMember>, DatabaseError> {
	match core.try_state::<Box<dyn Authors>>() {
		Some(authors) => authors.members_of(core, database, space_id).await,
		None => Ok(Vec::new()),
	}
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::test_core::a_core_of_its_own;

	fn a_database(core: &Core) -> Database {
		crate::db::bootstrap(core).expect("the database opens")
	}

	struct Named;

	impl Authors for Named {
		fn author<'a>(
			&'a self,
			caller: Caller,
			_: &'a Core,
			_: &'a Database,
		) -> BoxFuture<'a, Result<AccountAuthor, DatabaseError>> {
			let name = Some(if caller.is_relayed() { "relayed" } else { "host" }.to_owned());
			Box::pin(async move { Ok(AccountAuthor { name, ..AccountAuthor::default() }) })
		}

		fn members_of<'a>(
			&'a self,
			_: &'a Core,
			_: &'a Database,
			space_id: &'a str,
		) -> BoxFuture<'a, Result<Vec<SpaceMember>, DatabaseError>> {
			let member = SpaceMember {
				name: Some(space_id.to_owned()),
				email: String::new(),
				is_host: true,
			};
			Box::pin(async move { Ok(vec![member]) })
		}
	}

	#[tokio::test]
	async fn a_core_with_no_authors_names_no_account_and_no_member() {
		let core = a_core_of_its_own("no-authors");
		let database = a_database(&core);

		let author = author(Caller::Host, &core, &database).await.expect("the author reads");
		let members = members_of(&core, &database, "personal").await.expect("the members read");

		assert_eq!(author, AccountAuthor::default());
		assert!(members.is_empty());
	}

	#[tokio::test]
	async fn the_installed_authors_name_the_author_and_the_members() {
		let core = a_core_of_its_own("installed-authors");
		let database = a_database(&core);
		assert!(install_authors(&core, Named));

		let author = author(Caller::Relayed(None), &core, &database).await.expect("it reads");
		let members = members_of(&core, &database, "personal").await.expect("they read");

		assert_eq!(author.name.as_deref(), Some("relayed"));
		assert_eq!(members.len(), 1);
	}
}
