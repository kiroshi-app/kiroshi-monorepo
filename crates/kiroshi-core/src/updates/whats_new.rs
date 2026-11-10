use crate::db::repositories::user::Preferences;

#[derive(Debug, PartialEq, Eq)]
pub(super) enum Due {
	Notes,
	MarkSeen,
	Nothing,
}

pub(super) fn due(preferences: &Preferences, running_version: &str) -> Due {
	let last_seen = preferences.last_seen_version.as_deref().filter(|seen| !seen.is_empty());
	match last_seen {
		Some(seen) if seen == running_version => Due::Nothing,
		None => Due::MarkSeen,
		Some(_) if !preferences.show_whats_new => Due::MarkSeen,
		Some(_) if !preferences.first_run_done => Due::Nothing,
		Some(_) => Due::Notes,
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	fn preferences(last_seen: Option<&str>, show: bool, first_run_done: bool) -> Preferences {
		Preferences {
			last_seen_version: last_seen.map(str::to_owned),
			show_whats_new: show,
			first_run_done,
			..Preferences::default()
		}
	}

	#[test]
	fn a_version_other_than_the_last_seen_one_is_due_its_notes() {
		assert_eq!(due(&preferences(Some("0.25.0"), true, true), "0.26.0"), Due::Notes);
	}

	#[test]
	fn the_last_seen_version_is_due_nothing() {
		assert_eq!(due(&preferences(Some("0.26.0"), true, true), "0.26.0"), Due::Nothing);
	}

	#[test]
	fn a_fresh_install_marks_the_running_version_seen() {
		assert_eq!(due(&preferences(None, true, true), "0.26.0"), Due::MarkSeen);
		assert_eq!(due(&preferences(Some(""), true, true), "0.26.0"), Due::MarkSeen);
	}

	#[test]
	fn what_is_new_turned_off_marks_the_running_version_seen() {
		assert_eq!(due(&preferences(Some("0.25.0"), false, true), "0.26.0"), Due::MarkSeen);
	}

	#[test]
	fn a_first_run_not_done_waits_without_marking() {
		assert_eq!(due(&preferences(Some("0.25.0"), true, false), "0.26.0"), Due::Nothing);
	}
}
