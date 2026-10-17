use rusqlite::{params, OptionalExtension};

use crate::db::{Access, DatabaseError};

const SELECT_RELAY_DEVICE: &str =
	"SELECT relay_device_id FROM relay_devices WHERE account_id = ?1 AND device_id = ?2";

const UPSERT_RELAY_DEVICE: &str =
	"INSERT INTO relay_devices (account_id, device_id, relay_device_id) VALUES (?1, ?2, ?3)
	ON CONFLICT (account_id, device_id) DO UPDATE SET relay_device_id = excluded.relay_device_id";

const DELETE_RELAY_DEVICE_OF_OTHER_ACCOUNTS: &str =
	"DELETE FROM relay_devices WHERE device_id = ?2 AND account_id <> ?1";

const DELETE_RELAY_DEVICE: &str =
	"DELETE FROM relay_devices WHERE account_id = ?1 AND device_id = ?2";

pub struct RelayDevicesRepository {
	access: Access,
}

impl RelayDevicesRepository {
	pub(in crate::db) fn new(access: Access) -> Self {
		Self { access }
	}

	pub async fn relay_device_id(
		&self,
		account_id: String,
		device_id: String,
	) -> Result<Option<String>, DatabaseError> {
		self.access
			.call(move |connection| {
				let held = connection
					.prepare_cached(SELECT_RELAY_DEVICE)?
					.query_row(params![account_id, device_id], |row| row.get(0))
					.optional()?;
				Ok(held)
			})
			.await
	}

	pub async fn registered(
		&self,
		account_id: String,
		device_id: String,
		relay_device_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				let transaction = connection.transaction()?;
				transaction.execute(
					DELETE_RELAY_DEVICE_OF_OTHER_ACCOUNTS,
					params![account_id, device_id],
				)?;
				transaction.execute(
					UPSERT_RELAY_DEVICE,
					params![account_id, device_id, relay_device_id],
				)?;
				transaction.commit()?;
				Ok(())
			})
			.await
	}

	pub async fn forgotten(
		&self,
		account_id: String,
		device_id: String,
	) -> Result<(), DatabaseError> {
		self.access
			.call_mut(move |connection| {
				connection.execute(DELETE_RELAY_DEVICE, params![account_id, device_id])?;
				Ok(())
			})
			.await
	}
}

#[cfg(test)]
mod tests {
	use crate::db::connection::temp_dir;

	#[tokio::test]
	async fn a_relay_device_id_is_held_per_account_and_device() {
		let dir = temp_dir();
		let devices = crate::db::open(&dir);
		let devices = devices.relay_devices();
		devices
			.registered("a1".to_owned(), "d1".to_owned(), "r1".to_owned())
			.await
			.expect("stored");

		let held = |account: &str| devices.relay_device_id(account.to_owned(), "d1".to_owned());
		assert_eq!(held("a1").await.expect("read"), Some("r1".to_owned()));
		assert_eq!(held("a2").await.expect("read"), None);
	}

	#[tokio::test]
	async fn a_forgotten_relay_device_id_leaves_the_other_accounts_alone() {
		let dir = temp_dir();
		let devices = crate::db::open(&dir);
		let devices = devices.relay_devices();
		for account in ["a1", "a2"] {
			devices
				.registered(account.to_owned(), "d1".to_owned(), "r1".to_owned())
				.await
				.expect("stored");
		}

		devices.forgotten("a1".to_owned(), "d1".to_owned()).await.expect("forgotten");
		devices.forgotten("a3".to_owned(), "d1".to_owned()).await.expect("nothing to forget");

		let held = |account: &str| devices.relay_device_id(account.to_owned(), "d1".to_owned());
		assert_eq!(held("a1").await.expect("read"), None);
		assert_eq!(held("a2").await.expect("read"), Some("r1".to_owned()));
	}

	#[tokio::test]
	async fn a_registration_drops_the_rows_other_accounts_hold_for_the_same_device() {
		let dir = temp_dir();
		let devices = crate::db::open(&dir);
		let devices = devices.relay_devices();
		for (account, device, relay_device) in [("a1", "d1", "r1"), ("a2", "d2", "r9")] {
			devices
				.registered(account.to_owned(), device.to_owned(), relay_device.to_owned())
				.await
				.expect("stored");
		}

		devices
			.registered("a3".to_owned(), "d1".to_owned(), "r2".to_owned())
			.await
			.expect("stored");

		let held = |account: &str, device: &str| {
			devices.relay_device_id(account.to_owned(), device.to_owned())
		};
		assert_eq!(held("a1", "d1").await.expect("read"), None);
		assert_eq!(held("a2", "d2").await.expect("read"), Some("r9".to_owned()));
		assert_eq!(held("a3", "d1").await.expect("read"), Some("r2".to_owned()));
	}
}
