use std::sync::LazyLock;

pub(super) const MISSION_ICON: &str = "Flag";

static CONVERSATION_ICONS: LazyLock<Vec<String>> = LazyLock::new(|| {
	serde_json::from_str(include_str!(
		"../../../../../../../packages/shared/conversation-icons.json"
	))
	.expect("the embedded conversation icons are a list of names")
});

pub fn conversation_icons() -> &'static [String] {
	&CONVERSATION_ICONS
}

pub(super) fn is_listed(icon: &str) -> bool {
	CONVERSATION_ICONS.iter().any(|listed| listed == icon)
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn the_embedded_list_names_the_icons_of_the_shared_file() {
		assert!(conversation_icons().len() > 1);
		assert!(is_listed("MessageSquare"));
		assert!(is_listed("Rocket"));
		assert!(!is_listed("Message"));
		assert!(!is_listed("rocket"));
	}

	#[test]
	fn the_mission_icon_is_one_of_the_shared_file() {
		assert!(is_listed(MISSION_ICON));
	}
}
