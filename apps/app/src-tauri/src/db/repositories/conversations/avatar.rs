use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, specta::Type)]
#[serde(transparent)]
pub struct Hue(u16);

const LAST_HUE: i64 = 359;

const PRESET_HUES: [(&str, Hue); 8] = [
	("red", Hue(42)),
	("yellow", Hue(82)),
	("green", Hue(132)),
	("cyan", Hue(186)),
	("blue", Hue(257)),
	("purple", Hue(296)),
	("pink", Hue(358)),
	("orange", Hue(63)),
];

impl Hue {
	pub const ACCEPTED: &'static str = "0 to 359";

	pub fn new(value: i64) -> Option<Self> {
		u16::try_from(value).ok().filter(|_| value <= LAST_HUE).map(Hue)
	}

	pub fn named(name: &str) -> Option<Self> {
		PRESET_HUES.iter().find(|(preset, _)| *preset == name).map(|&(_, hue)| hue)
	}

	pub fn of_json(value: &Value) -> Option<Self> {
		match value {
			Value::Number(number) => number.as_i64().and_then(Hue::new),
			Value::String(name) => Hue::named(name),
			_ => None,
		}
	}

	pub fn presets() -> [Hue; 8] {
		PRESET_HUES.map(|(_, hue)| hue)
	}

	pub fn value(self) -> u16 {
		self.0
	}
}

impl<'de> Deserialize<'de> for Hue {
	fn deserialize<D: Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
		let value = i64::deserialize(deserializer)?;
		Hue::new(value).ok_or_else(|| {
			D::Error::custom(format!("a hue runs from {}, not {value}", Hue::ACCEPTED))
		})
	}
}

impl ToSql for Hue {
	fn to_sql(&self) -> rusqlite::Result<ToSqlOutput<'_>> {
		Ok(ToSqlOutput::from(i64::from(self.0)))
	}
}

impl FromSql for Hue {
	fn column_result(value: ValueRef<'_>) -> FromSqlResult<Self> {
		let stored = value.as_i64()?;
		Hue::new(stored).ok_or(FromSqlError::OutOfRange(stored))
	}
}

#[cfg(test)]
mod tests {
	use serde_json::json;

	use super::*;

	#[test]
	fn the_eight_names_read_as_the_hues_of_the_preset_table() {
		let named: Vec<_> = ["red", "orange", "yellow", "green", "cyan", "blue", "purple", "pink"]
			.into_iter()
			.map(|name| Hue::named(name).map(Hue::value))
			.collect();

		assert_eq!(
			named,
			[42, 63, 82, 132, 186, 257, 296, 358].map(Some).to_vec(),
			"a name read another hue than the preset table"
		);
		assert_eq!(Hue::named("teal"), None);
	}

	#[test]
	fn a_hue_runs_from_0_to_359_in_whole_numbers() {
		assert_eq!(Hue::new(0).map(Hue::value), Some(0));
		assert_eq!(Hue::new(359).map(Hue::value), Some(359));
		assert_eq!((Hue::new(-1), Hue::new(360), Hue::new(400)), (None, None, None));
		assert!(serde_json::from_value::<Hue>(json!(1.5)).is_err(), "a fraction parsed as a hue");
	}

	#[test]
	fn a_listed_colour_reads_a_hue_or_one_of_the_eight_names() {
		assert_eq!(Hue::of_json(&json!(296)), Some(Hue(296)));
		assert_eq!(Hue::of_json(&json!("purple")), Some(Hue(296)));
		for unread in [json!("chartreuse"), json!(400), json!(null), json!(true)] {
			assert_eq!(Hue::of_json(&unread), None, "{unread} was read as a hue");
		}
	}
}
