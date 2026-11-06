use serde::{Deserialize, Serialize};

use crate::environment::contract::EnvOwner;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, specta::Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum PluginScope {
	#[serde(rename_all = "camelCase")]
	Bot {
		id: String,
	},
	#[serde(rename_all = "camelCase")]
	Space {
		id: String,
	},
	User,
}

impl From<&EnvOwner> for PluginScope {
	fn from(owner: &EnvOwner) -> Self {
		match owner {
			EnvOwner::Bot { id, .. } => PluginScope::Bot { id: id.clone() },
			EnvOwner::Space { id } => PluginScope::Space { id: id.clone() },
			EnvOwner::User => PluginScope::User,
		}
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn each_scope_reads_off_the_wire_as_the_front_writes_it() {
		let read = |text: &str| serde_json::from_str::<PluginScope>(text).expect("the scope reads");

		assert_eq!(read(r#"{"kind":"bot","id":"b1"}"#), PluginScope::Bot { id: "b1".to_owned() });
		assert_eq!(
			read(r#"{"kind":"space","id":"s1"}"#),
			PluginScope::Space { id: "s1".to_owned() }
		);
		assert_eq!(read(r#"{"kind":"user"}"#), PluginScope::User);
	}
}
