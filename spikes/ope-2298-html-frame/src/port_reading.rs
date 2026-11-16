use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::port_target::ConnectionReading;
use crate::sensors::Beacon;

const ATTEMPTED_OUTCOME: &str = "attempted";
const RECORD_PREFIX: &str = "probe-";
const SEQUENCE_SIGNAL: &str = "event sequence";
const SERVICE_TIMING: &str = "service.accept_to_close";

#[derive(Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase", rename_all_fields = "camelCase")]
enum Observed {
	Event { on: String, r#type: String, fields: Option<Value> },
	Entry { start_ms: f64, entry: Value },
	Thrown { name: String },
	Alive,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct PageRecord {
	index: usize,
	at_ms: f64,
	#[serde(flatten)]
	observed: Observed,
}

fn unhex(text: &str) -> Option<Vec<u8>> {
	if text.len() % 2 != 0 {
		return None;
	}
	(0..text.len())
		.step_by(2)
		.map(|at| u8::from_str_radix(text.get(at..at + 2)?, 16).ok())
		.collect()
}

fn page_record(outcome: &str) -> Option<PageRecord> {
	serde_json::from_slice(&unhex(outcome.strip_prefix(RECORD_PREFIX)?)?).ok()
}

#[derive(Serialize)]
struct EventReading {
	event: String,
	at_ms: f64,
	#[serde(skip_serializing_if = "Option::is_none")]
	fields: Option<Value>,
}

#[derive(Serialize)]
struct EntryReading {
	entry_type: String,
	at_ms: f64,
	start_ms: f64,
	duration_ms: Option<f64>,
	entry: Value,
}

#[derive(Default, Serialize)]
struct PageReading {
	attempt_signalled: bool,
	events: Vec<EventReading>,
	exception_thrown_by_the_attempt: Option<String>,
	performance_entries: Vec<EntryReading>,
	script_runs_after_1000_ms: bool,
	sequence: Vec<String>,
	unreadable_beacons: Vec<String>,
	#[serde(skip)]
	timings: BTreeMap<String, f64>,
}

impl PageReading {
	fn of(beacons: &[Beacon], attempt: &str) -> Self {
		let mut page = Self::default();
		let mut records = Vec::new();
		for beacon in beacons.iter().filter(|beacon| beacon.attempt == attempt) {
			if beacon.outcome == ATTEMPTED_OUTCOME {
				page.attempt_signalled = true;
				continue;
			}
			match page_record(&beacon.outcome) {
				Some(record) => records.push(record),
				None => page.unreadable_beacons.push(beacon.outcome.clone()),
			}
		}
		records.sort_by_key(|record| record.index);
		records.into_iter().for_each(|record| page.observe(record));
		page
	}

	fn observe(&mut self, record: PageRecord) {
		match record.observed {
			Observed::Event { on, r#type, fields } => {
				let event = format!("{on}.{type}");
				let timing = self.sight(&event);
				self.timings.insert(timing, record.at_ms);
				self.events.push(EventReading { event, at_ms: record.at_ms, fields });
			}
			Observed::Entry { start_ms, entry } => {
				let entry_type =
					entry.get("entryType").and_then(Value::as_str).unwrap_or("unknown").to_owned();
				let duration_ms = entry.get("duration").and_then(Value::as_f64);
				let timing = self.sight(&format!("performance.{entry_type}"));
				self.timings.insert(format!("{timing}.start"), start_ms);
				if let Some(duration_ms) = duration_ms {
					self.timings.insert(format!("{timing}.duration"), duration_ms);
				}
				self.performance_entries.push(EntryReading {
					entry_type,
					at_ms: record.at_ms,
					start_ms,
					duration_ms,
					entry,
				});
			}
			Observed::Thrown { name } => {
				self.sight(&format!("thrown.{name}"));
				self.exception_thrown_by_the_attempt = Some(name);
			}
			Observed::Alive => self.script_runs_after_1000_ms = true,
		}
	}

	fn sight(&mut self, observable: &str) -> String {
		self.sequence.push(observable.to_owned());
		match self.sequence.iter().filter(|seen| *seen == observable).count() {
			1 => observable.to_owned(),
			occurrence => format!("{observable}#{occurrence}"),
		}
	}
}

#[derive(Serialize)]
struct ServiceReading {
	connections_accepted: usize,
	connections: Vec<ConnectionReading>,
}

pub struct Played<'a> {
	pub repetition: usize,
	pub view: String,
	pub view_error: Option<String>,
	pub attempt: &'a str,
	pub beacons: &'a [Beacon],
	pub run_signal: Option<String>,
	pub connections: Option<Vec<ConnectionReading>>,
}

#[derive(Serialize)]
pub struct Repetition {
	repetition: usize,
	view: String,
	#[serde(skip_serializing_if = "Option::is_none")]
	view_error: Option<String>,
	silent: bool,
	run_signal: Option<String>,
	page: PageReading,
	#[serde(skip_serializing_if = "Option::is_none")]
	service: Option<ServiceReading>,
}

impl Repetition {
	pub fn read(played: Played<'_>) -> Self {
		Self {
			repetition: played.repetition,
			view: played.view,
			view_error: played.view_error,
			silent: played.beacons.is_empty(),
			run_signal: played.run_signal,
			page: PageReading::of(played.beacons, played.attempt),
			service: played.connections.map(|connections| ServiceReading {
				connections_accepted: connections.len(),
				connections,
			}),
		}
	}

	fn trace(&self) -> Option<&PageReading> {
		(!self.silent).then_some(&self.page)
	}
}

#[derive(Serialize)]
struct SequenceCount {
	sequence: Vec<String>,
	repetitions: usize,
}

#[derive(Serialize)]
struct Spread {
	samples: usize,
	min: f64,
	median: f64,
	max: f64,
}

impl Spread {
	fn of(mut values: Vec<f64>) -> Option<Self> {
		values.sort_by(f64::total_cmp);
		let (min, max) = (*values.first()?, *values.last()?);
		let middle = values.len() / 2;
		let median = if values.len() % 2 == 0 {
			(values[middle - 1] + values[middle]) / 2.0
		} else {
			values[middle]
		};
		Some(Self { samples: values.len(), min, median, max })
	}
}

#[derive(Serialize)]
pub struct Summary {
	repetitions: usize,
	silent_repetitions: usize,
	repetitions_where_script_ran_after_1000_ms: usize,
	event_sequences: Vec<SequenceCount>,
	timings_ms: BTreeMap<String, Spread>,
}

impl Summary {
	pub fn of(repetitions: &[Repetition]) -> Self {
		let mut sequences = BTreeMap::<&[String], usize>::new();
		let mut timings = BTreeMap::<&str, Vec<f64>>::new();
		for page in repetitions.iter().filter_map(Repetition::trace) {
			*sequences.entry(&page.sequence).or_default() += 1;
			for (timing, value) in &page.timings {
				timings.entry(timing).or_default().push(*value);
			}
		}
		let service_timings: Vec<f64> = repetitions
			.iter()
			.filter_map(|repetition| repetition.service.as_ref())
			.flat_map(|service| &service.connections)
			.map(|connection| connection.ms_from_accept_to_close)
			.collect();
		timings.insert(SERVICE_TIMING, service_timings);
		Self {
			repetitions: repetitions.len(),
			silent_repetitions: repetitions.iter().filter(|repetition| repetition.silent).count(),
			repetitions_where_script_ran_after_1000_ms: repetitions
				.iter()
				.filter(|repetition| repetition.page.script_runs_after_1000_ms)
				.count(),
			event_sequences: sequences
				.into_iter()
				.map(|(sequence, repetitions)| SequenceCount {
					sequence: sequence.to_vec(),
					repetitions,
				})
				.collect(),
			timings_ms: timings
				.into_iter()
				.filter_map(|(timing, values)| Some((timing.to_owned(), Spread::of(values)?)))
				.collect(),
		}
	}
}

#[derive(Debug, PartialEq, Serialize)]
pub struct Verdict {
	pub distinguishable: bool,
	pub signal: Option<String>,
}

impl Verdict {
	pub fn of(listening: &[Repetition], closed: &[Repetition]) -> Self {
		let signal = if have_no_sequence_in_common(listening, closed) {
			Some(SEQUENCE_SIGNAL.to_owned())
		} else {
			timing_with_disjoint_ranges(listening, closed).map(|timing| format!("timing {timing}"))
		};
		Self { distinguishable: signal.is_some(), signal }
	}
}

fn sequences(repetitions: &[Repetition]) -> BTreeSet<&[String]> {
	repetitions.iter().filter_map(Repetition::trace).map(|page| page.sequence.as_slice()).collect()
}

fn have_no_sequence_in_common(listening: &[Repetition], closed: &[Repetition]) -> bool {
	let (listening, closed) = (sequences(listening), sequences(closed));
	!listening.is_empty() && !closed.is_empty() && listening.is_disjoint(&closed)
}

fn range_measured_in_every_repetition(
	repetitions: &[Repetition],
	timing: &str,
) -> Option<(f64, f64)> {
	let values: Vec<f64> = repetitions
		.iter()
		.map(|repetition| repetition.trace()?.timings.get(timing).copied())
		.collect::<Option<_>>()?;
	let spread = Spread::of(values)?;
	Some((spread.min, spread.max))
}

fn timing_with_disjoint_ranges<'a>(
	listening: &'a [Repetition],
	closed: &[Repetition],
) -> Option<&'a str> {
	let timings: BTreeSet<&str> = listening
		.iter()
		.filter_map(Repetition::trace)
		.flat_map(|page| page.timings.keys())
		.map(String::as_str)
		.collect();
	timings.into_iter().find(|timing| {
		let listening = range_measured_in_every_repetition(listening, timing);
		let closed = range_measured_in_every_repetition(closed, timing);
		listening
			.zip(closed)
			.is_some_and(|(listening, closed)| listening.1 < closed.0 || closed.1 < listening.0)
	})
}

#[cfg(test)]
mod tests {
	use std::time::Instant;

	use serde_json::json;

	use super::*;

	const ATTEMPT: &str = "navigation-self";

	fn beacon(outcome: String) -> Beacon {
		Beacon { at: Instant::now(), attempt: ATTEMPT.to_owned(), outcome }
	}

	fn record(record: Value) -> Beacon {
		let hex: String = record.to_string().bytes().map(|byte| format!("{byte:02x}")).collect();
		beacon(format!("{RECORD_PREFIX}{hex}"))
	}

	fn event(index: usize, name: &str, at_ms: f64) -> Beacon {
		let (on, kind) = name.split_once('.').unwrap();
		record(json!({ "kind": "event", "index": index, "atMs": at_ms, "on": on, "type": kind }))
	}

	fn alive(index: usize) -> Beacon {
		record(json!({ "kind": "alive", "index": index, "atMs": 1000.4 }))
	}

	fn repetition(beacons: &[Beacon]) -> Repetition {
		Repetition::read(Played {
			repetition: 1,
			view: "probe".to_owned(),
			view_error: None,
			attempt: ATTEMPT,
			beacons,
			run_signal: None,
			connections: None,
		})
	}

	fn unloaded_after(before_unload_ms: f64, page_hide_ms: f64) -> Repetition {
		repetition(&[
			beacon(ATTEMPTED_OUTCOME.to_owned()),
			event(1, "window.pagehide", page_hide_ms),
			event(0, "window.beforeunload", before_unload_ms),
		])
	}

	fn left_alone() -> Repetition {
		repetition(&[beacon(ATTEMPTED_OUTCOME.to_owned()), alive(0)])
	}

	#[test]
	fn identical_sequences_with_overlapping_timings_are_not_distinguishable() {
		let listening = [unloaded_after(0.2, 4.0), unloaded_after(0.4, 9.0)];
		let closed = [unloaded_after(0.3, 8.0), unloaded_after(0.1, 12.0)];

		assert_eq!(
			Verdict::of(&listening, &closed),
			Verdict { distinguishable: false, signal: None }
		);
	}

	#[test]
	fn sequences_that_differ_in_every_repetition_are_distinguishable() {
		let listening = [unloaded_after(0.2, 4.0), unloaded_after(0.4, 9.0)];
		let closed = [left_alone(), left_alone()];

		assert_eq!(
			Verdict::of(&listening, &closed),
			Verdict { distinguishable: true, signal: Some(SEQUENCE_SIGNAL.to_owned()) }
		);
	}

	#[test]
	fn a_sequence_seen_on_both_targets_is_not_a_signal() {
		let listening = [unloaded_after(0.2, 4.0), left_alone()];
		let closed = [left_alone(), left_alone()];

		assert_eq!(
			Verdict::of(&listening, &closed),
			Verdict { distinguishable: false, signal: None }
		);
	}

	#[test]
	fn disjoint_timing_ranges_are_distinguishable_by_that_timing() {
		let listening = [unloaded_after(0.2, 4.0), unloaded_after(0.4, 9.0)];
		let closed = [unloaded_after(0.3, 21.0), unloaded_after(0.1, 30.0)];

		assert_eq!(
			Verdict::of(&listening, &closed),
			Verdict { distinguishable: true, signal: Some("timing window.pagehide".to_owned()) }
		);
	}

	#[test]
	fn a_timing_one_repetition_never_measured_is_not_a_signal() {
		let listening = [unloaded_after(0.2, 4.0), repetition(&[])];
		let closed = [unloaded_after(0.3, 21.0), unloaded_after(0.1, 30.0)];

		assert_eq!(
			Verdict::of(&listening, &closed),
			Verdict { distinguishable: false, signal: None }
		);
	}

	#[test]
	fn a_repetition_without_a_beacon_is_silent_and_counted() {
		let connections = vec![ConnectionReading {
			bytes_received: 0,
			ms_from_accept_to_close: 12.0,
			closed_by: "peer",
			read_error: None,
		}];
		let silent = Repetition::read(Played {
			repetition: 2,
			view: "probe".to_owned(),
			view_error: None,
			attempt: ATTEMPT,
			beacons: &[],
			run_signal: None,
			connections: Some(connections),
		});

		let summary = json!(Summary::of(&[left_alone(), silent]));

		assert_eq!(summary["repetitions"], 2);
		assert_eq!(summary["silent_repetitions"], 1);
		assert_eq!(summary["repetitions_where_script_ran_after_1000_ms"], 1);
		assert_eq!(summary["event_sequences"], json!([{ "sequence": [], "repetitions": 1 }]));
		assert_eq!(summary["timings_ms"][SERVICE_TIMING]["median"], 12.0);
	}

	#[test]
	fn the_summary_orders_the_events_by_the_page_and_spreads_each_timing() {
		let repetitions =
			[unloaded_after(0.2, 4.0), unloaded_after(0.4, 9.0), unloaded_after(0.3, 5.0)];

		let summary = json!(Summary::of(&repetitions));

		assert_eq!(
			summary["event_sequences"],
			json!([{ "sequence": ["window.beforeunload", "window.pagehide"], "repetitions": 3 }])
		);
		assert_eq!(
			summary["timings_ms"]["window.pagehide"],
			json!({ "samples": 3, "min": 4.0, "median": 5.0, "max": 9.0 })
		);
	}

	#[test]
	fn a_performance_entry_and_a_repeated_event_each_get_their_own_timing() {
		let entry = record(json!({
			"kind": "entry",
			"index": 2,
			"atMs": 31.0,
			"startMs": 12.5,
			"entry": { "entryType": "resource", "name": "http://127.0.0.1:9/", "duration": 18.0 },
		}));
		let page = repetition(&[
			event(0, "window.error", 1.0),
			event(1, "window.error", 2.0),
			entry,
			beacon("probe-zz".to_owned()),
		])
		.page;

		assert_eq!(page.sequence, ["window.error", "window.error", "performance.resource"]);
		assert_eq!(page.timings["window.error#2"], 2.0);
		assert_eq!(page.timings["performance.resource.start"], 12.5);
		assert_eq!(page.timings["performance.resource.duration"], 18.0);
		assert_eq!(page.unreadable_beacons, ["probe-zz"]);
	}
}
