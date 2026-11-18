use serde::Serialize;

pub const RUN_MS: u64 = 60_000;

pub const DEATHS_GIVEN_UP_AT: usize = 3;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub enum WindowDeathReason {
	OutOfMemory,
	Crashed,
	Killed,
	Unresponsive,
	Unknown,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct WindowRecovery {
	pub reason: WindowDeathReason,
	pub deaths: u32,
	pub exhausted: bool,
	pub occurred_at_ms: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeadProcess {
	Render,
	Browser,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Death {
	pub process: DeadProcess,
	pub reason: WindowDeathReason,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Recovery {
	Reload,
	Rebuild,
	GiveUp,
	LeaveDead,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Deaths {
	recent_at_ms: Vec<u64>,
	last: Option<WindowRecovery>,
}

impl Deaths {
	pub fn last(&self) -> Option<&WindowRecovery> {
		self.last.as_ref()
	}

	fn has_given_up(&self) -> bool {
		self.last.as_ref().is_some_and(|fact| fact.exhausted)
	}

	pub fn after(&self, death: Death, at_ms: u64) -> (Deaths, Recovery) {
		let mut recent_at_ms: Vec<u64> = self
			.recent_at_ms
			.iter()
			.copied()
			.filter(|earlier| at_ms.saturating_sub(*earlier) < RUN_MS)
			.collect();
		recent_at_ms.push(at_ms);
		let recovery =
			match (self.has_given_up(), recent_at_ms.len() >= DEATHS_GIVEN_UP_AT, death.process) {
				(true, _, _) => Recovery::LeaveDead,
				(false, true, _) => Recovery::GiveUp,
				(false, false, DeadProcess::Browser) => Recovery::Rebuild,
				(false, false, DeadProcess::Render) => Recovery::Reload,
			};
		let fact = WindowRecovery {
			reason: death.reason,
			deaths: u32::try_from(recent_at_ms.len()).unwrap_or(u32::MAX),
			exhausted: matches!(recovery, Recovery::GiveUp | Recovery::LeaveDead),
			occurred_at_ms: at_ms,
		};
		(Deaths { recent_at_ms, last: Some(fact) }, recovery)
	}

	pub fn with_a_fresh_budget(&self) -> Deaths {
		let last =
			self.last.clone().map(|fact| WindowRecovery { deaths: 0, exhausted: false, ..fact });
		Deaths { recent_at_ms: Vec::new(), last }
	}
}

#[cfg(test)]
mod tests {
	use super::*;

	const RENDER_CRASH: Death =
		Death { process: DeadProcess::Render, reason: WindowDeathReason::Crashed };

	const BROWSER_GONE: Death =
		Death { process: DeadProcess::Browser, reason: WindowDeathReason::Unknown };

	fn replayed(deaths: &[(Death, u64)]) -> (Deaths, Vec<Recovery>) {
		deaths.iter().fold(
			(Deaths::default(), Vec::new()),
			|(history, mut recoveries), (death, at)| {
				let (next, recovery) = history.after(*death, *at);
				recoveries.push(recovery);
				(next, recoveries)
			},
		)
	}

	#[test]
	fn no_death_leaves_no_fact() {
		assert_eq!(Deaths::default().last(), None);
	}

	#[test]
	fn a_render_death_reloads_and_is_kept_as_the_fact() {
		let (history, recoveries) = replayed(&[(RENDER_CRASH, 5_000)]);

		assert_eq!(recoveries, vec![Recovery::Reload]);
		assert_eq!(
			history.last(),
			Some(&WindowRecovery {
				reason: WindowDeathReason::Crashed,
				deaths: 1,
				exhausted: false,
				occurred_at_ms: 5_000,
			})
		);
	}

	#[test]
	fn a_browser_death_rebuilds() {
		let (_, recoveries) = replayed(&[(BROWSER_GONE, 0)]);

		assert_eq!(recoveries, vec![Recovery::Rebuild]);
	}

	#[test]
	fn a_third_death_within_the_run_gives_up_and_marks_the_fact_exhausted() {
		let (history, recoveries) =
			replayed(&[(RENDER_CRASH, 0), (BROWSER_GONE, 20_000), (RENDER_CRASH, 59_999)]);

		assert_eq!(recoveries, vec![Recovery::Reload, Recovery::Rebuild, Recovery::GiveUp]);
		let fact = history.last().expect("a fact");
		assert!(fact.exhausted);
		assert_eq!(fact.deaths, 3);
	}

	#[test]
	fn a_death_past_the_run_of_the_first_does_not_count_it() {
		let (history, recoveries) =
			replayed(&[(RENDER_CRASH, 0), (RENDER_CRASH, 30_000), (RENDER_CRASH, 60_000)]);

		assert_eq!(recoveries, vec![Recovery::Reload, Recovery::Reload, Recovery::Reload]);
		assert_eq!(history.last().map(|fact| fact.deaths), Some(2));
	}

	#[test]
	fn sixty_seconds_without_a_death_reset_the_count() {
		let (history, recoveries) =
			replayed(&[(RENDER_CRASH, 0), (RENDER_CRASH, 10_000), (RENDER_CRASH, 80_000)]);

		assert_eq!(recoveries.last(), Some(&Recovery::Reload));
		let fact = history.last().expect("a fact");
		assert_eq!(fact.deaths, 1);
		assert!(!fact.exhausted);
	}

	#[test]
	fn a_death_after_giving_up_leaves_the_page_dead_however_late_and_keeps_its_reason() {
		let (history, recoveries) = replayed(&[
			(RENDER_CRASH, 0),
			(RENDER_CRASH, 1_000),
			(RENDER_CRASH, 2_000),
			(BROWSER_GONE, 3_000),
			(RENDER_CRASH, 500_000),
		]);

		assert_eq!(recoveries[2..], [Recovery::GiveUp, Recovery::LeaveDead, Recovery::LeaveDead]);
		let fact = history.last().expect("a fact");
		assert!(fact.exhausted);
		assert_eq!(fact.reason, WindowDeathReason::Crashed);
	}

	#[test]
	fn a_fresh_budget_keeps_the_last_death_and_counts_from_zero_again() {
		let (given_up, _) =
			replayed(&[(RENDER_CRASH, 0), (RENDER_CRASH, 1_000), (BROWSER_GONE, 2_000)]);

		let renewed = given_up.with_a_fresh_budget();

		assert_eq!(
			renewed.last(),
			Some(&WindowRecovery {
				reason: WindowDeathReason::Unknown,
				deaths: 0,
				exhausted: false,
				occurred_at_ms: 2_000,
			})
		);
		let (history, recovery) = renewed.after(RENDER_CRASH, 3_000);
		assert_eq!(recovery, Recovery::Reload);
		assert_eq!(history.last().map(|fact| fact.deaths), Some(1));
	}

	#[test]
	fn a_fresh_budget_before_any_death_leaves_no_fact() {
		assert_eq!(Deaths::default().with_a_fresh_budget().last(), None);
	}
}
