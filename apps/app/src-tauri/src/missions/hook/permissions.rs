use std::path::Path;
use std::process::{Command, Stdio};

use serde_json::{Map, Value};

use super::super::contract::MissionError;
use super::unreachable;
use crate::agent::redact::home_dir;

const PERMISSIONS_KEY: &str = "permissions";

const ALLOW_KEY: &str = "allow";

const DENY_KEY: &str = "deny";

const MAIN_BRANCH: &str = "main";

const LEASED_PUSH: &str = "Bash(git push --force-with-lease origin ";

const HEAD_PUSHES: [&str; 2] = ["Bash(git push -u origin HEAD)", "Bash(git push origin HEAD)"];

const DEV_DATA: &str = "Library/Application Support/com.kiroshi.app.dev/**";

const CURRENT_BRANCH: [&str; 4] = ["symbolic-ref", "--quiet", "--short", "HEAD"];

const MISSION_GESTURES: [&str; 10] = [
	"Bash(gh pr create *)",
	"Bash(gh pr view *)",
	"Bash(gh pr checks *)",
	"Bash(gh pr merge *)",
	"Bash(gh run rerun *)",
	"Bash(gh run view *)",
	"Bash(gh run list *)",
	"Bash(gh api *)",
	"Bash(killall com.apple.CoreSimulatorService)",
	"Bash(killall -9 com.apple.CoreSimulatorService)",
];

pub const REFUSED_BY_DESIGN: [&str; 34] = [
	"Bash(gh pr merge* --squash*)",
	"Bash(gh pr merge* --merge*)",
	"Bash(gh pr merge* --rebase*)",
	"Bash(gh pr merge* --admin*)",
	"Bash(gh pr merge* -s)",
	"Bash(gh pr merge* -s *)",
	"Bash(gh pr merge* -m)",
	"Bash(gh pr merge* -m *)",
	"Bash(gh pr merge* -r)",
	"Bash(gh pr merge* -r *)",
	"Bash(gh pr merge* -s*)",
	"Bash(gh pr merge* -m*)",
	"Bash(gh pr merge* -r*)",
	"Bash(gh pr merge* -d*s*)",
	"Bash(gh pr merge* -d*m*)",
	"Bash(gh pr merge* -d*r*)",
	"Bash(gh api* -X*)",
	"Bash(gh api* --method*)",
	"Bash(gh api* -f*)",
	"Bash(gh api* -F*)",
	"Bash(gh api* --field*)",
	"Bash(gh api* --raw-field*)",
	"Bash(gh api* --input*)",
	"Bash(git push* main)",
	"Bash(git push* origin main *)",
	"Bash(git push* +main)",
	"Bash(git push* +main *)",
	"Bash(git push*:main)",
	"Bash(git push*:main *)",
	"Bash(git push*refs/heads/main)",
	"Bash(git push*refs/heads/main *)",
	"Edit(~/Library/Application Support/com.kiroshi.app/**)",
	"Write(~/Library/Application Support/com.kiroshi.app/**)",
	"Bash(git worktree remove *)",
];

pub fn granted(held: Value, root: &Path) -> Result<Value, MissionError> {
	let Value::Object(mut settings) = held else {
		return Err(unreachable("the settings of the workspace hold no object".to_owned()));
	};
	let Value::Object(mut permissions) =
		settings.remove(PERMISSIONS_KEY).unwrap_or_else(|| Value::Object(Map::new()))
	else {
		return Err(unreachable("the permissions of the workspace hold no object".to_owned()));
	};
	let allows =
		held_rules(&mut permissions, ALLOW_KEY)?.into_iter().filter(|rule| !pushes_a_branch(rule));
	permissions.insert(ALLOW_KEY.to_owned(), with(allows.collect(), allowed(root)));
	let denies = held_rules(&mut permissions, DENY_KEY)?;
	permissions
		.insert(DENY_KEY.to_owned(), with(denies, REFUSED_BY_DESIGN.map(str::to_owned).to_vec()));
	settings.insert(PERMISSIONS_KEY.to_owned(), Value::Object(permissions));
	Ok(Value::Object(settings))
}

fn held_rules(permissions: &mut Map<String, Value>, key: &str) -> Result<Vec<Value>, MissionError> {
	match permissions.remove(key).unwrap_or_else(|| Value::Array(Vec::new())) {
		Value::Array(held) => Ok(held),
		_ => Err(unreachable(format!("the {key} rules of the workspace hold no list"))),
	}
}

fn with(mut kept: Vec<Value>, rules: Vec<String>) -> Value {
	for rule in rules.into_iter().map(Value::String) {
		if !kept.contains(&rule) {
			kept.push(rule);
		}
	}
	Value::Array(kept)
}

fn pushes_a_branch(rule: &Value) -> bool {
	rule.as_str().is_some_and(|rule| rule.starts_with(LEASED_PUSH) || HEAD_PUSHES.contains(&rule))
}

fn allowed(root: &Path) -> Vec<String> {
	let mut rules: Vec<String> = MISSION_GESTURES.map(str::to_owned).to_vec();
	rules.extend(dev_data_edits());
	rules.extend(branch_pushes(root));
	rules
}

fn branch_pushes(root: &Path) -> Vec<String> {
	let Some(branch) = checked_out(root).filter(|branch| leasable(branch)) else {
		return Vec::new();
	};
	let leased = [format!("{LEASED_PUSH}{branch})"), format!("{LEASED_PUSH}HEAD:{branch})")];
	leased.into_iter().chain(HEAD_PUSHES.map(str::to_owned)).collect()
}

fn leasable(branch: &str) -> bool {
	branch != MAIN_BRANCH
		&& branch
			.chars()
			.all(|character| character.is_ascii_alphanumeric() || "._/-".contains(character))
}

fn checked_out(root: &Path) -> Option<String> {
	let mut command = Command::new("git");
	command.arg("-C").arg(root).args(CURRENT_BRANCH).stdin(Stdio::null()).stderr(Stdio::null());

	#[cfg(windows)]
	std::os::windows::process::CommandExt::creation_flags(
		&mut command,
		super::super::checkout::CREATE_NO_WINDOW,
	);

	let output = command.output().ok().filter(|output| output.status.success())?;
	String::from_utf8(output.stdout).ok().map(|branch| branch.trim().to_owned())
}

fn dev_data_edits() -> Vec<String> {
	let Some(home) = home_dir() else {
		return Vec::new();
	};
	let under = format!("/{}", home.join(DEV_DATA).display());
	vec![format!("Edit({under})"), format!("Write({under})")]
}

#[cfg(test)]
mod tests {
	use std::collections::BTreeSet;
	use std::fs;

	use serde_json::json;

	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	const ASK_KEY: &str = "ask";

	const A_BRANCH: &str = "feature/ope-1101-a-branch";

	fn a_checkout(name: &str) -> RemovedOnDrop {
		let path = RemovedOnDrop(
			std::env::temp_dir().join(format!("kiroshi-permissions-{name}-{}", std::process::id())),
		);
		let _ = fs::remove_dir_all(&path);
		fs::create_dir_all(&path).expect("the checkout is there");
		path
	}

	fn on_branch(name: &str, branch: &str) -> RemovedOnDrop {
		let root = a_checkout(name);
		let ran = Command::new("git")
			.arg("-C")
			.arg(&*root)
			.args(["init", "--quiet", "--initial-branch", branch])
			.status()
			.expect("git runs");
		assert!(ran.success(), "git init failed");
		root
	}

	fn rules_of(settings: &Value, key: &str) -> Vec<String> {
		serde_json::from_value(settings[PERMISSIONS_KEY][key].clone())
			.expect("the rules are a list")
	}

	fn leases_in(settings: &Value) -> Vec<String> {
		rules_of(settings, ALLOW_KEY)
			.into_iter()
			.filter(|rule| rule.starts_with(LEASED_PUSH))
			.collect()
	}

	fn head_pushes_in(settings: &Value) -> Vec<String> {
		rules_of(settings, ALLOW_KEY)
			.into_iter()
			.filter(|rule| HEAD_PUSHES.contains(&rule.as_str()))
			.collect()
	}

	fn assert_denied(name: &str, rule: &str) {
		let root = a_checkout(name);

		let settings = granted(json!({}), &root).expect("the rules are granted");

		assert!(rules_of(&settings, DENY_KEY).contains(&rule.to_owned()), "{rule} is not denied");
	}

	macro_rules! refused_by_design {
		($($name:ident: $rule:literal,)*) => {
			$(
				#[test]
				fn $name() {
					assert_denied(stringify!($name), $rule);
				}
			)*

			#[test]
			fn every_entry_of_the_refused_list_has_its_own_test() {
				assert_eq!(BTreeSet::from(REFUSED_BY_DESIGN), BTreeSet::from([$($rule),*]));
			}
		};
	}

	refused_by_design! {
		a_squash_merge_is_denied: "Bash(gh pr merge* --squash*)",
		a_merge_commit_merge_is_denied: "Bash(gh pr merge* --merge*)",
		a_rebase_merge_is_denied: "Bash(gh pr merge* --rebase*)",
		an_admin_merge_is_denied: "Bash(gh pr merge* --admin*)",
		a_squash_merge_short_is_denied: "Bash(gh pr merge* -s)",
		a_squash_merge_short_followed_by_an_argument_is_denied: "Bash(gh pr merge* -s *)",
		a_merge_commit_merge_short_is_denied: "Bash(gh pr merge* -m)",
		a_merge_commit_merge_short_followed_by_an_argument_is_denied: "Bash(gh pr merge* -m *)",
		a_rebase_merge_short_is_denied: "Bash(gh pr merge* -r)",
		a_rebase_merge_short_followed_by_an_argument_is_denied: "Bash(gh pr merge* -r *)",
		a_bundle_led_by_the_squash_short_is_denied: "Bash(gh pr merge* -s*)",
		a_bundle_led_by_the_merge_commit_short_is_denied: "Bash(gh pr merge* -m*)",
		a_bundle_led_by_the_rebase_short_is_denied: "Bash(gh pr merge* -r*)",
		a_bundle_led_by_the_delete_short_carrying_a_squash_is_denied: "Bash(gh pr merge* -d*s*)",
		a_bundle_led_by_the_delete_short_carrying_a_merge_commit_is_denied:
			"Bash(gh pr merge* -d*m*)",
		a_bundle_led_by_the_delete_short_carrying_a_rebase_is_denied: "Bash(gh pr merge* -d*r*)",
		an_api_call_naming_its_method_short_is_denied: "Bash(gh api* -X*)",
		an_api_call_naming_its_method_long_is_denied: "Bash(gh api* --method*)",
		an_api_call_carrying_a_typed_field_short_is_denied: "Bash(gh api* -F*)",
		an_api_call_carrying_a_raw_field_short_is_denied: "Bash(gh api* -f*)",
		an_api_call_carrying_a_typed_field_long_is_denied: "Bash(gh api* --field*)",
		an_api_call_carrying_a_raw_field_long_is_denied: "Bash(gh api* --raw-field*)",
		an_api_call_carrying_an_input_is_denied: "Bash(gh api* --input*)",
		a_push_ending_on_main_is_denied: "Bash(git push* main)",
		a_push_to_main_on_origin_followed_by_an_argument_is_denied:
			"Bash(git push* origin main *)",
		a_forced_push_ending_on_main_is_denied: "Bash(git push* +main)",
		a_forced_push_to_main_followed_by_a_flag_is_denied: "Bash(git push* +main *)",
		a_push_of_a_refspec_ending_on_main_is_denied: "Bash(git push*:main)",
		a_push_of_a_refspec_on_main_followed_by_a_flag_is_denied: "Bash(git push*:main *)",
		a_push_ending_on_the_full_ref_of_main_is_denied: "Bash(git push*refs/heads/main)",
		a_push_to_the_full_ref_of_main_followed_by_a_flag_is_denied:
			"Bash(git push*refs/heads/main *)",
		an_edit_of_the_shipped_app_data_is_denied:
			"Edit(~/Library/Application Support/com.kiroshi.app/**)",
		a_write_of_the_shipped_app_data_is_denied:
			"Write(~/Library/Application Support/com.kiroshi.app/**)",
		a_worktree_removal_is_denied: "Bash(git worktree remove *)",
	}

	fn pinned_wildcard_match(rule: &str, command: &str) -> bool {
		let Some(pattern) = rule.strip_prefix("Bash(").and_then(|rule| rule.strip_suffix(')'))
		else {
			return false;
		};
		let pattern = pattern.trim();
		let mut body = regex::escape(pattern).replace("\\*", ".*");
		if body.ends_with(" .*") && pattern.matches('*').count() == 1 {
			body = format!("{}( .*)?", &body[..body.len() - 3]);
		}
		regex::Regex::new(&format!("(?s)^{body}$")).expect("the rule compiles").is_match(command)
	}

	#[test]
	fn the_short_merge_flags_and_the_forced_pushes_to_main_are_matched_by_a_deny_rule() {
		let denied = [
			("Bash(gh pr merge* -s)", "gh pr merge 12 -s"),
			("Bash(gh pr merge* -s *)", "gh pr merge -s 12"),
			("Bash(gh pr merge* -m)", "gh pr merge 12 --delete-branch -m"),
			("Bash(gh pr merge* -m *)", "gh pr merge -m --auto 12"),
			("Bash(gh pr merge* -r)", "gh pr merge 12 -r"),
			("Bash(gh pr merge* -r *)", "gh pr merge -r 12"),
			("Bash(git push* +main)", "git push origin +main"),
			("Bash(git push* +main *)", "git push origin +main --verbose"),
			("Bash(git push*refs/heads/main)", "git push origin +refs/heads/main"),
			("Bash(git push*refs/heads/main *)", "git push origin +refs/heads/main --verbose"),
		];

		for (rule, command) in denied {
			assert!(REFUSED_BY_DESIGN.contains(&rule), "{rule} is not in the refused list");
			assert!(pinned_wildcard_match(rule, command), "{rule} does not match {command}");
		}
	}

	#[test]
	fn no_deny_rule_matches_an_auto_merge_a_subject_or_a_lease_push_to_a_branch_named_main() {
		for command in [
			"gh pr merge --auto 12",
			"gh pr merge 12 --subject x",
			"git push --force-with-lease origin feature/ope-1-main",
		] {
			let matched: Vec<&str> = REFUSED_BY_DESIGN
				.into_iter()
				.filter(|rule| pinned_wildcard_match(rule, command))
				.collect();
			assert!(matched.is_empty(), "{command} is denied by {matched:?}");
		}
	}

	fn tracked_settings() -> Value {
		serde_json::from_str(include_str!("../../../../../../.claude/settings.json"))
			.expect("the tracked settings are json")
	}

	fn tracked_rules(key: &str) -> Vec<String> {
		rules_of(&tracked_settings(), key)
	}

	fn matched_by(rules: &[String], command: &str) -> bool {
		rules.iter().any(|rule| pinned_wildcard_match(rule, command))
	}

	fn tracked_decision(command: &str) -> Option<&'static str> {
		[DENY_KEY, ASK_KEY, ALLOW_KEY]
			.into_iter()
			.find(|key| matched_by(&tracked_rules(key), command))
	}

	const FEATURE_BRANCH_PUSHES: [&str; 3] = [
		"git push -u origin feature/ope-1-x",
		"git push origin feature/ope-1-x",
		"git push --force-with-lease origin feature/ope-1-x",
	];

	fn deny_rules_matching(command: &str) -> Vec<String> {
		tracked_rules(DENY_KEY)
			.into_iter()
			.chain(REFUSED_BY_DESIGN.map(str::to_owned))
			.filter(|rule| pinned_wildcard_match(rule, command))
			.collect()
	}

	#[test]
	fn the_tracked_allows_are_the_three_feature_branch_pushes() {
		assert_eq!(
			tracked_rules(ALLOW_KEY),
			[
				"Bash(git push --force-with-lease origin feature/*)",
				"Bash(git push origin feature/*)",
				"Bash(git push -u origin feature/*)",
			]
		);
	}

	#[test]
	fn the_tracked_settings_hold_only_the_allow_ask_and_deny_permissions() {
		let settings = tracked_settings();

		let keys: Vec<&String> =
			settings.as_object().expect("the settings are an object").keys().collect();
		let permission_keys: BTreeSet<&str> = settings[PERMISSIONS_KEY]
			.as_object()
			.expect("the permissions are an object")
			.keys()
			.map(String::as_str)
			.collect();

		assert_eq!(keys, [PERMISSIONS_KEY]);
		assert_eq!(permission_keys, BTreeSet::from([ALLOW_KEY, ASK_KEY, DENY_KEY]));
	}

	#[test]
	fn the_tracked_denies_are_the_refused_pushes_to_main() {
		let refused_pushes: BTreeSet<String> = REFUSED_BY_DESIGN
			.into_iter()
			.filter(|rule| rule.starts_with("Bash(git push"))
			.map(str::to_owned)
			.collect();

		assert_eq!(refused_pushes.len(), 8);
		assert_eq!(BTreeSet::from_iter(tracked_rules(DENY_KEY)), refused_pushes);
	}

	#[test]
	fn the_tracked_settings_allow_a_feature_branch_push_plain_with_lease_or_upstream() {
		for command in [
			"git push --force-with-lease origin feature/ope-1-x",
			"git push origin feature/ope-1-x",
			"git push -u origin feature/ope-1-x",
		] {
			assert_eq!(tracked_decision(command), Some(ALLOW_KEY), "{command}");
		}
	}

	#[test]
	fn no_deny_rule_matches_a_feature_branch_push_chained_with_a_pull_request_to_main() {
		for push in FEATURE_BRANCH_PUSHES {
			let command = format!("{push} && gh pr create --base main --title x --body y");
			let matched = deny_rules_matching(&command);
			assert!(matched.is_empty(), "{command} is denied by {matched:?}");
		}
	}

	#[test]
	fn no_deny_rule_matches_a_feature_branch_push_chained_with_an_auto_merge() {
		for push in FEATURE_BRANCH_PUSHES {
			let command = format!("{push} && gh pr merge --auto 12");
			let matched = deny_rules_matching(&command);
			assert!(matched.is_empty(), "{command} is denied by {matched:?}");
		}
	}

	#[test]
	fn no_deny_rule_matches_a_piped_feature_branch_push_chained_with_a_pull_request_to_main() {
		let command =
			"git push -u origin feature/ope-1-x 2>&1 | tail -3 && gh pr create --base main --title x";

		let matched = deny_rules_matching(command);

		assert!(matched.is_empty(), "{command} is denied by {matched:?}");
	}

	#[test]
	fn the_tracked_settings_deny_every_push_to_main() {
		let denies = tracked_rules(DENY_KEY);

		for command in [
			"git push --force origin main",
			"git push --force-with-lease origin feature/ope-1-x main",
			"git push origin feature/ope-1-x:main",
			"git push origin +main",
			"git push origin main",
			"git push -u origin main",
			"git push origin HEAD:main",
			"git push origin feature/ope-1-x && git push origin main",
		] {
			assert!(matched_by(&denies, command), "{command} is not denied");
		}
	}

	macro_rules! asked_by_the_tracked_settings {
		($($name:ident: $command:literal,)*) => {
			$(
				#[test]
				fn $name() {
					assert_eq!(tracked_decision($command), Some(ASK_KEY), $command);
				}
			)*
		};
	}

	asked_by_the_tracked_settings! {
		a_long_force_before_the_remote_is_asked: "git push --force origin feature/ope-1-x",
		a_long_force_between_the_remote_and_the_branch_is_asked:
			"git push origin --force feature/ope-1-x",
		a_long_force_after_the_branch_is_asked: "git push origin feature/ope-1-x --force",
		a_long_force_after_a_lease_push_is_asked:
			"git push --force-with-lease origin feature/ope-1-x --force",
		a_short_force_before_the_remote_is_asked: "git push -f origin feature/ope-1-x",
		a_short_force_between_the_remote_and_the_branch_is_asked:
			"git push origin -f feature/ope-1-x",
		a_short_force_after_the_branch_is_asked: "git push origin feature/ope-1-x -f",
		a_short_force_after_an_upstream_push_is_asked: "git push -u origin feature/ope-1-x -f",
		a_bundle_led_by_the_short_force_is_asked: "git push origin feature/ope-1-x -fu",
		a_bundle_ending_on_the_short_force_is_asked: "git push origin feature/ope-1-x -uf",
		a_bundle_holding_the_short_force_before_the_remote_is_asked:
			"git push -uf origin feature/ope-1-x",
		a_forced_refspec_after_the_branch_is_asked:
			"git push origin feature/ope-1-x +feature/ope-1-y",
		a_forced_refspec_alone_after_the_remote_is_asked: "git push origin +feature/ope-1-x",
	}

	#[test]
	fn a_bundle_of_short_merge_flags_carrying_a_merge_method_is_matched_by_a_deny_rule() {
		for command in [
			"gh pr merge 1 -sd",
			"gh pr merge 1 -ds",
			"gh pr merge 1 -dsa",
			"gh pr merge 1 -dm",
			"gh pr merge 1 -dr",
			"gh pr merge -rd 1",
		] {
			assert!(
				REFUSED_BY_DESIGN.into_iter().any(|rule| pinned_wildcard_match(rule, command)),
				"{command} is matched by no deny rule"
			);
		}
	}

	#[test]
	fn no_deny_rule_matches_a_merge_carrying_only_the_delete_or_the_auto_flags() {
		for command in [
			"gh pr merge 1 -d",
			"gh pr merge 1 --auto",
			"gh pr merge --auto 12",
			"gh pr merge 12 --subject x",
			"gh pr merge 1 --delete-branch --auto",
			"gh pr merge 12 -d --auto",
			"gh pr merge --auto -d 12",
		] {
			let matched: Vec<&str> = REFUSED_BY_DESIGN
				.into_iter()
				.filter(|rule| pinned_wildcard_match(rule, command))
				.collect();
			assert!(matched.is_empty(), "{command} is denied by {matched:?}");
		}
	}

	#[test]
	fn the_gestures_of_a_mission_are_allowed() {
		let root = a_checkout("gestures");

		let allows = rules_of(&granted(json!({}), &root).expect("granted"), ALLOW_KEY);

		for rule in [
			"Bash(gh pr create *)",
			"Bash(gh pr view *)",
			"Bash(gh pr checks *)",
			"Bash(gh pr merge *)",
			"Bash(gh run rerun *)",
			"Bash(gh run view *)",
			"Bash(gh run list *)",
			"Bash(gh api *)",
			"Bash(killall com.apple.CoreSimulatorService)",
			"Bash(killall -9 com.apple.CoreSimulatorService)",
		] {
			assert!(allows.contains(&rule.to_owned()), "{rule} is not allowed");
		}
	}

	#[test]
	fn the_dev_app_data_is_editable_under_the_expanded_home() {
		let root = a_checkout("dev-data");
		let home = home_dir().expect("the home is named").display().to_string();
		let under = format!("/{home}/Library/Application Support/com.kiroshi.app.dev/**");

		let allows = rules_of(&granted(json!({}), &root).expect("granted"), ALLOW_KEY);

		assert!(allows.contains(&format!("Edit({under})")), "got {allows:?}");
		assert!(allows.contains(&format!("Write({under})")), "got {allows:?}");
		assert!(under.starts_with("//") && !under.starts_with("///"), "got {under}");
	}

	#[test]
	fn a_lease_push_is_allowed_to_the_checked_out_branch_in_both_spellings() {
		let root = on_branch("leased", A_BRANCH);

		let settings = granted(json!({}), &root).expect("granted");

		assert_eq!(
			leases_in(&settings),
			[
				format!("Bash(git push --force-with-lease origin {A_BRANCH})"),
				format!("Bash(git push --force-with-lease origin HEAD:{A_BRANCH})"),
			],
		);
	}

	#[test]
	fn a_checkout_on_a_branch_is_allowed_to_push_its_head() {
		let root = on_branch("head", A_BRANCH);

		let settings = granted(json!({}), &root).expect("granted");

		assert_eq!(
			head_pushes_in(&settings),
			["Bash(git push -u origin HEAD)", "Bash(git push origin HEAD)"],
		);
	}

	#[test]
	fn a_head_push_left_by_a_branch_is_dropped_once_the_checkout_is_on_main() {
		let root = on_branch("head-on-main", MAIN_BRANCH);
		let held = json!({ "permissions": { "allow": HEAD_PUSHES } });

		let settings = granted(held, &root).expect("granted");

		assert!(head_pushes_in(&settings).is_empty(), "got {:?}", head_pushes_in(&settings));
	}

	#[test]
	fn a_checkout_on_main_gets_no_lease_push_and_every_other_rule() {
		let root = on_branch("on-main", MAIN_BRANCH);

		let settings = granted(json!({}), &root).expect("granted");

		assert!(leases_in(&settings).is_empty(), "got {:?}", leases_in(&settings));
		assert!(head_pushes_in(&settings).is_empty(), "got {:?}", head_pushes_in(&settings));
		assert_eq!(rules_of(&settings, ALLOW_KEY).len(), MISSION_GESTURES.len() + 2);
		assert_eq!(rules_of(&settings, DENY_KEY), REFUSED_BY_DESIGN);
	}

	#[test]
	fn a_branch_that_cannot_be_read_gets_no_lease_push_and_every_other_rule() {
		let root = on_branch("detached", A_BRANCH);
		fs::write(root.join(".git").join("HEAD"), format!("{}\n", "a".repeat(40)))
			.expect("the head is detached");

		let settings = granted(json!({}), &root).expect("granted");

		assert!(leases_in(&settings).is_empty(), "got {:?}", leases_in(&settings));
		assert!(head_pushes_in(&settings).is_empty(), "got {:?}", head_pushes_in(&settings));
		assert_eq!(rules_of(&settings, ALLOW_KEY).len(), MISSION_GESTURES.len() + 2);
		assert_eq!(rules_of(&settings, DENY_KEY), REFUSED_BY_DESIGN);
	}

	#[test]
	fn the_rules_held_are_kept_and_the_rules_added_land_once() {
		let root = on_branch("kept", A_BRANCH);
		let held = json!({
			"model": "sonnet",
			"permissions": {
				"allow": ["Bash(ls *)"],
				"ask": ["WebFetch"],
				"deny": ["Read(./.env)"],
				"defaultMode": "auto",
			},
		});

		let once = granted(held, &root).expect("granted");
		let twice = granted(once.clone(), &root).expect("granted again");

		assert_eq!(twice, once, "a second grant moved the settings");
		assert_eq!(twice["model"], json!("sonnet"));
		assert_eq!(twice[PERMISSIONS_KEY]["ask"], json!(["WebFetch"]));
		assert_eq!(twice[PERMISSIONS_KEY]["defaultMode"], json!("auto"));
		assert_eq!(rules_of(&twice, ALLOW_KEY).first().map(String::as_str), Some("Bash(ls *)"));
		assert_eq!(rules_of(&twice, DENY_KEY).first().map(String::as_str), Some("Read(./.env)"));
		assert_eq!(rules_of(&twice, ALLOW_KEY).len(), 1 + MISSION_GESTURES.len() + 6);
		assert_eq!(rules_of(&twice, DENY_KEY).len(), 1 + REFUSED_BY_DESIGN.len());
	}

	#[test]
	fn a_lease_push_left_for_another_branch_is_replaced_by_the_checked_out_one() {
		let root = on_branch("replaced", A_BRANCH);
		let held = json!({ "permissions": { "allow": [
			"Bash(git push --force-with-lease origin an-older-branch)"
		] } });

		let settings = granted(held, &root).expect("granted");

		assert_eq!(leases_in(&settings).len(), 2, "got {:?}", leases_in(&settings));
		assert!(leases_in(&settings).iter().all(|rule| rule.contains(A_BRANCH)));
	}

	#[test]
	fn permissions_that_hold_no_object_are_refused() {
		let root = a_checkout("not-an-object");

		let refused = granted(json!({ "permissions": ["Bash(ls *)"] }), &root)
			.expect_err("the grant is refused");

		assert!(matches!(refused, MissionError::Undeliverable { .. }), "got {refused:?}");
	}

	#[test]
	fn rules_that_hold_no_list_are_refused() {
		let root = a_checkout("not-a-list");

		let refused = granted(json!({ "permissions": { "deny": "Bash(rm *)" } }), &root)
			.expect_err("the grant is refused");

		assert!(matches!(refused, MissionError::Undeliverable { .. }), "got {refused:?}");
	}
}
