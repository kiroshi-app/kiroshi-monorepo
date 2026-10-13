use base64::prelude::{Engine as _, BASE64_URL_SAFE_NO_PAD};

pub const PAGE_SIZE: u32 = 30;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Keyset {
	pub sort_key: i64,
	pub id: String,
}

impl Keyset {
	pub fn encoded(&self) -> String {
		BASE64_URL_SAFE_NO_PAD.encode(format!("{}:{}", self.sort_key, self.id))
	}

	fn decoded(cursor: &str) -> Option<Self> {
		let text = String::from_utf8(BASE64_URL_SAFE_NO_PAD.decode(cursor).ok()?).ok()?;
		let (sort_key, id) = text.split_once(':')?;
		Some(Self { sort_key: sort_key.parse().ok()?, id: id.to_owned() })
	}
}

pub fn after(cursor: Option<String>) -> Result<Option<Keyset>, String> {
	match cursor {
		None => Ok(None),
		Some(cursor) => Keyset::decoded(&cursor).map(Some).ok_or(cursor),
	}
}

pub fn page_size(limit: Option<u32>) -> u32 {
	limit.map_or(PAGE_SIZE, |limit| limit.clamp(1, PAGE_SIZE))
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Page<T> {
	pub rows: Vec<T>,
	pub next: Option<Keyset>,
}

pub fn paged<T>(mut rows: Vec<T>, size: u32, keyset_of: impl Fn(&T) -> Keyset) -> Page<T> {
	let has_more = rows.len() > size as usize;
	rows.truncate(size as usize);
	let next = rows.last().filter(|_| has_more).map(keyset_of);
	Page { rows, next }
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn a_cursor_reads_back_the_keyset_it_was_written_from() {
		let keyset = Keyset { sort_key: 1_700_000_000_000, id: "a:b".to_owned() };

		assert_eq!(after(Some(keyset.encoded())), Ok(Some(keyset)));
	}

	#[test]
	fn a_cursor_that_does_not_decode_is_handed_back_as_it_came() {
		let unreadable = ["not base64!", "bm8tY29sb24", "YWJjOmlk", ""];

		for cursor in unreadable {
			assert_eq!(after(Some(cursor.to_owned())), Err(cursor.to_owned()), "{cursor}");
		}
	}

	#[test]
	fn the_page_size_stays_between_one_and_thirty() {
		assert_eq!(page_size(None), 30);
		assert_eq!(page_size(Some(31)), 30);
		assert_eq!(page_size(Some(0)), 1);
		assert_eq!(page_size(Some(12)), 12);
	}

	#[test]
	fn a_page_offers_a_keyset_only_when_a_row_was_held_past_it() {
		let keyset_of = |row: &i64| Keyset { sort_key: *row, id: row.to_string() };

		let full = paged(vec![3, 2, 1], 2, keyset_of);
		let last = paged(vec![3, 2], 2, keyset_of);

		assert_eq!(full, Page { rows: vec![3, 2], next: Some(keyset_of(&2)) });
		assert_eq!(last, Page { rows: vec![3, 2], next: None });
	}
}
