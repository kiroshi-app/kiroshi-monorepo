use rusqlite::types::{FromSql, FromSqlError, FromSqlResult, ToSql, ToSqlOutput, ValueRef};
use serde::de::Error as _;
use serde::{Deserialize, Deserializer, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, specta::Type)]
#[serde(transparent)]
pub struct Hue(u16);

const TURN: u16 = 360;

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
	pub const LAST: u16 = TURN - 1;

	pub const ACCEPTED: &'static str = "0 to 359";

	pub fn new(value: i64) -> Option<Self> {
		u16::try_from(value).ok().filter(|&hue| hue <= Hue::LAST).map(Hue)
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

	pub fn nearest_preset_name(self) -> &'static str {
		let away = |(_, preset): (&str, Hue)| {
			let gap = self.0.abs_diff(preset.0);
			(gap.min(TURN - gap), preset.0)
		};
		let nearest = PRESET_HUES.into_iter().fold(PRESET_HUES[0], |nearest, candidate| {
			match away(candidate) < away(nearest) {
				true => candidate,
				false => nearest,
			}
		});
		nearest.0
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
	fn a_hue_is_named_by_the_preset_nearest_on_the_circle_and_a_tie_goes_to_the_lower_hue() {
		let named = |hue: i64| Hue::new(hue).map(Hue::nearest_preset_name);

		for (name, hue) in PRESET_HUES {
			assert_eq!(named(i64::from(hue.0)), Some(name), "{name} is not its own nearest");
		}
		assert_eq!(named(0), Some("pink"), "0 is 2 away from pink across the turn and 42 from red");
		assert_eq!(named(20), Some("red"), "a tie between 358 and 42 goes to the lower hue");
		assert_eq!(named(200), Some("cyan"));
		assert_eq!(named(107), Some("yellow"), "a tie between 82 and 132 goes to the lower hue");
		assert_eq!(named(359), Some("pink"));
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
