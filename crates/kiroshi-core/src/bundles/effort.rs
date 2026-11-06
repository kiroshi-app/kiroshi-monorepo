use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(rename_all = "lowercase")]
pub enum EffortLevel {
	Low,
	Medium,
	High,
	Xhigh,
	Max,
}

impl EffortLevel {
	pub fn as_sql(self) -> &'static str {
		self.named()
	}

	pub fn named(self) -> &'static str {
		match self {
			EffortLevel::Low => "low",
			EffortLevel::Medium => "medium",
			EffortLevel::High => "high",
			EffortLevel::Xhigh => "xhigh",
			EffortLevel::Max => "max",
		}
	}

	pub fn parse(text: &str) -> Option<Self> {
		match text {
			"low" => Some(EffortLevel::Low),
			"medium" => Some(EffortLevel::Medium),
			"high" => Some(EffortLevel::High),
			"xhigh" => Some(EffortLevel::Xhigh),
			"max" => Some(EffortLevel::Max),
			_ => None,
		}
	}
}

pub fn supported_effort(
	stored: Option<EffortLevel>,
	supported: Option<&[EffortLevel]>,
) -> Option<EffortLevel> {
	stored.filter(|level| supported.is_none_or(|levels| levels.contains(level)))
}

#[cfg(test)]
mod tests {
	use super::*;

	const EVERY_LEVEL: [EffortLevel; 5] = [
		EffortLevel::Low,
		EffortLevel::Medium,
		EffortLevel::High,
		EffortLevel::Xhigh,
		EffortLevel::Max,
	];

	#[test]
	fn every_level_is_named_as_it_crosses_the_wire_and_parses_back() {
		for level in EVERY_LEVEL {
			let crossed = serde_json::to_value(level).expect("a level serialises");
			assert_eq!(crossed, serde_json::Value::String(level.named().to_owned()));
			assert_eq!(EffortLevel::parse(level.named()), Some(level));
		}
	}

	#[test]
	fn a_string_outside_the_five_levels_is_refused() {
		assert_eq!(EffortLevel::parse("extreme"), None);
		assert!(serde_json::from_str::<EffortLevel>("\"extreme\"").is_err());
	}

	#[test]
	fn a_level_the_model_does_not_support_is_left_out() {
		let supported = [EffortLevel::Low, EffortLevel::High];

		assert_eq!(supported_effort(Some(EffortLevel::Max), Some(&supported)), None);
		assert_eq!(supported_effort(Some(EffortLevel::Max), Some(&[])), None);
		assert_eq!(
			supported_effort(Some(EffortLevel::High), Some(&supported)),
			Some(EffortLevel::High)
		);
	}

	#[test]
	fn a_model_the_catalogue_has_not_answered_for_keeps_the_stored_level() {
		assert_eq!(supported_effort(Some(EffortLevel::Max), None), Some(EffortLevel::Max));
		assert_eq!(supported_effort(None, None), None);
	}
}
