use std::env::consts::OS;

use serde::Serialize;

const INPUT_ON_LINUX: &str = "input-through-the-gtk-overlay-on-linux";
const MACOS_EDGES_IN_CI: &str = "right-and-bottom-edges-on-macos-in-ci";
const DRAWN_POSITION_UNDER_WAYLAND: &str = "drawn-position-under-wayland";
const LINUX_DESKTOP_SESSION: &str = "real-linux-desktop-session";
const SIGHTING_KEYS: [&str; 3] = ["scrollbars", "sightings", "view_drawn_over_its_placeholder"];
const SESSION_KEYS: [&str; 7] = [
	"display_setup",
	"placement_verdict",
	"behaviours",
	"proofs",
	"input",
	"sightings",
	"view_drawn_over_its_placeholder",
];
const NO_SIGHTING: &str = "the view was not played in the thread, so no sighting was taken";

#[derive(Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum Status {
	Proven,
	NotProven,
	NotProvable,
}

pub struct Unproven {
	pub status: Status,
	pub reason: String,
}

#[derive(Serialize)]
pub struct OpenPoint {
	point: &'static str,
	status: Status,
	evidence_keys: Vec<&'static str>,
	reason: Option<String>,
}

impl OpenPoint {
	fn proven(point: &'static str, evidence_keys: &[&'static str]) -> Self {
		Self { point, status: Status::Proven, evidence_keys: evidence_keys.to_vec(), reason: None }
	}

	fn open(
		point: &'static str,
		status: Status,
		evidence_keys: &[&'static str],
		reason: impl Into<String>,
	) -> Self {
		Self { point, status, evidence_keys: evidence_keys.to_vec(), reason: Some(reason.into()) }
	}

	fn decided_elsewhere(point: &'static str, reason: impl Into<String>) -> Self {
		Self::open(point, Status::NotProven, &["os", "display_setup"], reason)
	}
}

pub struct Facts<'a> {
	pub input: Option<Result<(), Unproven>>,
	pub sighting: Option<Result<bool, &'a str>>,
	pub edges: Option<String>,
	pub is_in_ci: bool,
	pub wayland_capture: Option<bool>,
	pub desktop_session: Option<Result<String, Unproven>>,
	pub is_played_green: bool,
}

impl Facts<'_> {
	fn is_drawn_over_its_placeholder(&self) -> bool {
		self.sighting == Some(Ok(true))
	}

	fn sighting_reason(&self) -> String {
		match (self.sighting, &self.edges) {
			(Some(Err(fault)), _) => fault.to_owned(),
			(Some(Ok(_)), Some(edges)) => edges.clone(),
			_ => NO_SIGHTING.to_owned(),
		}
	}

	fn input(&self) -> OpenPoint {
		match &self.input {
			None => OpenPoint::decided_elsewhere(
				INPUT_ON_LINUX,
				format!("this run is on {OS}: the Linux files decide the point"),
			),
			Some(Ok(())) => OpenPoint::proven(INPUT_ON_LINUX, &["input"]),
			Some(Err(Unproven { status, reason })) => {
				OpenPoint::open(INPUT_ON_LINUX, *status, &["input"], reason)
			}
		}
	}

	fn macos_edges(&self) -> OpenPoint {
		if OS != "macos" {
			return OpenPoint::decided_elsewhere(
				MACOS_EDGES_IN_CI,
				format!("this run is on {OS}: the macOS CI file decides the point"),
			);
		}
		if !self.is_in_ci {
			return OpenPoint::open(
				MACOS_EDGES_IN_CI,
				Status::NotProven,
				&SIGHTING_KEYS,
				format!(
					"this run is not a CI run, GITHUB_RUN_ID is unset: on this display, {}",
					self.sighting_reason()
				),
			);
		}
		if self.is_drawn_over_its_placeholder() {
			return OpenPoint::proven(MACOS_EDGES_IN_CI, &SIGHTING_KEYS);
		}
		OpenPoint::open(
			MACOS_EDGES_IN_CI,
			Status::NotProven,
			&SIGHTING_KEYS,
			self.sighting_reason(),
		)
	}

	fn wayland_position(&self) -> OpenPoint {
		let Some(has_a_capture_route) = self.wayland_capture else {
			return OpenPoint::decided_elsewhere(
				DRAWN_POSITION_UNDER_WAYLAND,
				"this run is not under a Wayland compositor: the Wayland files decide the point",
			);
		};
		if self.is_drawn_over_its_placeholder() {
			return OpenPoint::proven(DRAWN_POSITION_UNDER_WAYLAND, &SIGHTING_KEYS);
		}
		let status = if has_a_capture_route { Status::NotProven } else { Status::NotProvable };
		OpenPoint::open(
			DRAWN_POSITION_UNDER_WAYLAND,
			status,
			&SIGHTING_KEYS,
			self.sighting_reason(),
		)
	}

	fn desktop_session(&self) -> OpenPoint {
		match &self.desktop_session {
			None => OpenPoint::decided_elsewhere(
				LINUX_DESKTOP_SESSION,
				format!("this run is on {OS}: the Linux files decide the point"),
			),
			Some(Err(Unproven { status, reason })) => {
				OpenPoint::open(LINUX_DESKTOP_SESSION, *status, &["display_setup"], reason)
			}
			Some(Ok(_))
				if self.is_played_green
					&& matches!(self.input, Some(Ok(())))
					&& self.is_drawn_over_its_placeholder() =>
			{
				OpenPoint::proven(LINUX_DESKTOP_SESSION, &SESSION_KEYS)
			}
			Some(Ok(session)) => OpenPoint::open(
				LINUX_DESKTOP_SESSION,
				Status::NotProven,
				&SESSION_KEYS,
				format!(
					"{session} started, and the placement, the five behaviours, the seven proofs, the four input lines and the drawn position are not all green in it"
				),
			),
		}
	}
}

pub fn judged(facts: &Facts) -> [OpenPoint; 4] {
	[facts.input(), facts.macos_edges(), facts.wayland_position(), facts.desktop_session()]
}

#[cfg(test)]
mod tests {
	use super::*;

	const NO_ROUTE: &str = "no capture route of the Wayland compositor answered";

	fn facts() -> Facts<'static> {
		Facts {
			input: Some(Ok(())),
			sighting: Some(Ok(true)),
			edges: None,
			is_in_ci: true,
			wayland_capture: Some(true),
			desktop_session: Some(Ok("an Xfce session".to_owned())),
			is_played_green: true,
		}
	}

	fn unproven(status: Status) -> Unproven {
		Unproven { status, reason: "line 1: no click reached the view".to_owned() }
	}

	fn status_and_reason(point: &OpenPoint) -> (Status, Option<&str>) {
		(point.status, point.reason.as_deref())
	}

	#[test]
	fn a_run_where_everything_is_green_proves_the_three_points_a_linux_wayland_session_decides() {
		let facts = facts();
		for point in [facts.input(), facts.wayland_position(), facts.desktop_session()] {
			assert!(status_and_reason(&point) == (Status::Proven, None));
		}
	}

	#[test]
	fn a_point_another_platform_decides_is_not_proven_here_and_says_so() {
		let facts = Facts { input: None, wayland_capture: None, desktop_session: None, ..facts() };
		for point in [facts.input(), facts.wayland_position(), facts.desktop_session()] {
			let (status, reason) = status_and_reason(&point);
			assert!(status == Status::NotProven && reason.is_some_and(|reason| !reason.is_empty()));
		}
	}

	#[test]
	fn input_without_a_route_is_not_provable_and_keeps_its_reason() {
		let facts = Facts { input: Some(Err(unproven(Status::NotProvable))), ..facts() };
		let point = facts.input();
		assert!(
			status_and_reason(&point)
				== (Status::NotProvable, Some("line 1: no click reached the view"))
		);
	}

	#[test]
	fn a_wayland_position_is_not_provable_only_when_no_capture_route_answered() {
		let refused =
			Facts { sighting: Some(Err(NO_ROUTE)), wayland_capture: Some(false), ..facts() };
		assert!(
			status_and_reason(&refused.wayland_position()) == (Status::NotProvable, Some(NO_ROUTE))
		);
		let off_its_placeholder =
			Facts { sighting: Some(Ok(false)), edges: Some("right -17".to_owned()), ..facts() };
		assert!(
			status_and_reason(&off_its_placeholder.wayland_position())
				== (Status::NotProven, Some("right -17"))
		);
	}

	#[test]
	fn a_desktop_session_is_proven_only_when_the_whole_play_in_it_is_green() {
		let without_input = Facts { input: Some(Err(unproven(Status::NotProven))), ..facts() };
		let off_its_placeholder = Facts { sighting: Some(Ok(false)), ..facts() };
		let with_a_red_proof = Facts { is_played_green: false, ..facts() };
		for facts in [without_input, off_its_placeholder, with_a_red_proof] {
			assert!(facts.desktop_session().status == Status::NotProven);
		}
	}

	#[test]
	fn a_session_that_did_not_start_keeps_the_status_and_the_reason_it_was_read_with() {
		let facts = Facts { desktop_session: Some(Err(unproven(Status::NotProvable))), ..facts() };
		assert!(facts.desktop_session().status == Status::NotProvable);
	}
}
