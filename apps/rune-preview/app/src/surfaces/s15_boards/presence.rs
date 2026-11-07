use std::time::{Duration, Instant};

use kiroshi_core::library::contract::{
	LibraryBoardPoint, LibraryPresenceAt, LibraryWriter, LibraryWriterKind,
};

use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Outline, OutlineState, Owner, OwnerKind, Point, PointerPlacement,
};

pub const SHARE_INTERVAL: Duration = Duration::from_millis(50);

pub fn is_own_seat(writer: &LibraryWriter) -> bool {
	writer.kind == LibraryWriterKind::Person
}

#[derive(Default)]
pub struct Shown {
	pub pointers: Vec<PointerPlacement>,
	pub outlines: Vec<Outline>,
	pub drawers: Vec<Owner>,
	pub people: Vec<Owner>,
}

pub fn owner_of(writer: &LibraryWriter, agent_of: &dyn Fn(&str) -> Option<Owner>) -> Owner {
	let name = writer.name.as_deref().unwrap_or_default();
	match writer.kind {
		LibraryWriterKind::Agent => {
			agent_of(&writer.id).unwrap_or_else(|| Owner::agent(&writer.id, name, None))
		}
		LibraryWriterKind::Person | LibraryWriterKind::Member => {
			Owner::person(&writer.id, name, writer.hue.map(f32::from))
		}
	}
}

pub fn shown(others: &[LibraryWriter], agent_of: &dyn Fn(&str) -> Option<Owner>) -> Shown {
	let mut shown = Shown::default();
	for writer in others {
		let LibraryPresenceAt::Board { point, node_id } = &writer.at else { continue };
		let owner = owner_of(writer, agent_of);
		let is_agent = owner.kind == OwnerKind::Agent;
		shown.pointers.push(PointerPlacement {
			owner: owner.clone(),
			position: Point::new(point.x as f64, point.y as f64),
		});
		if let Some(object_id) = node_id {
			let state = if is_agent { OutlineState::Drawing } else { OutlineState::Writing };
			shown.outlines.push(Outline {
				object_id: object_id.clone(),
				owner: owner.clone(),
				state,
			});
		}
		if is_agent {
			shown.drawers.push(owner);
		} else {
			shown.people.push(owner);
		}
	}
	shown
}

#[derive(Debug, PartialEq)]
pub enum Share {
	Now(Option<LibraryPresenceAt>),
	After(Duration),
	Nothing,
}

#[derive(Default)]
pub struct PointerShare {
	last_point: Option<Point>,
	is_pointer_in: bool,
	selected: Option<String>,
	shared: Option<LibraryPresenceAt>,
	shared_at: Option<Instant>,
	is_pending: bool,
}

impl PointerShare {
	pub fn moved(&mut self, at: Option<Point>, now: Instant) -> Share {
		self.is_pointer_in = at.is_some();
		self.last_point = at.or(self.last_point);
		if self.is_pending {
			return Share::Nothing;
		}
		let wait = self.shared_at.map_or(Duration::ZERO, |shared_at| {
			(shared_at + SHARE_INTERVAL).saturating_duration_since(now)
		});
		if wait.is_zero() {
			return self.sent(now);
		}
		self.is_pending = true;
		Share::After(wait)
	}

	pub fn due(&mut self, now: Instant) -> Share {
		if !self.is_pending {
			return Share::Nothing;
		}
		self.is_pending = false;
		self.sent(now)
	}

	pub fn selected(&mut self, id: Option<String>, now: Instant) -> Share {
		if self.selected == id {
			return Share::Nothing;
		}
		self.selected = id;
		self.is_pending = false;
		self.sent(now)
	}

	pub fn closed(&mut self) -> Share {
		self.is_pending = false;
		match self.shared.take() {
			Some(_) => Share::Now(None),
			None => Share::Nothing,
		}
	}

	fn seat(&self) -> Option<LibraryPresenceAt> {
		let point = self.last_point.filter(|_| self.is_pointer_in || self.selected.is_some())?;
		Some(LibraryPresenceAt::Board {
			point: LibraryBoardPoint { x: point.x.round() as i64, y: point.y.round() as i64 },
			node_id: self.selected.clone(),
		})
	}

	fn sent(&mut self, now: Instant) -> Share {
		let seat = self.seat();
		if seat == self.shared {
			return Share::Nothing;
		}
		self.shared = seat.clone();
		self.shared_at = Some(now);
		Share::Now(seat)
	}
}
