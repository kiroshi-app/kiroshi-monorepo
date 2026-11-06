use std::cmp::Reverse;
use std::collections::{BTreeSet, HashMap};

use super::draw::{kind_of, refused_parent, z_of, DrawFault, DrawRefusal, Rect, SECTION};
use super::{Board, JsonObject};

pub(super) struct Hierarchy<'a> {
	roots: Vec<&'a str>,
	children: HashMap<&'a str, Vec<&'a str>>,
}

struct Held<'a> {
	id: &'a str,
	rect: Rect,
	z: Option<String>,
	is_section: bool,
}

impl Held<'_> {
	fn holds(&self, other: &Self) -> bool {
		if !self.is_section || self.id == other.id || !self.rect.contains(other.rect) {
			return false;
		}
		let is_larger = self.rect.area() > other.rect.area();
		let is_same_size = self.rect.area() == other.rect.area();
		!other.is_section || is_larger || (is_same_size && self.order() < other.order())
	}

	fn order(&self) -> (&Option<String>, &str) {
		(&self.z, self.id)
	}
}

impl<'a> Hierarchy<'a> {
	pub(super) fn of(board: &'a Board) -> Self {
		let mut held: Vec<Held<'a>> = board
			.nodes
			.iter()
			.map(|(id, node)| Held {
				id,
				rect: Rect::of(node),
				z: z_of(node),
				is_section: kind_of(node) == Some(SECTION),
			})
			.collect();
		held.sort_by(|left, right| left.order().cmp(&right.order()));
		let mut roots = Vec::new();
		let mut children: HashMap<&str, Vec<&str>> = HashMap::new();
		for node in &held {
			let parent = held
				.iter()
				.filter(|section| section.holds(node))
				.min_by_key(|section| (section.rect.area(), Reverse(section.order())))
				.map(|section| section.id);
			match parent {
				Some(parent) => children.entry(parent).or_default().push(node.id),
				None => roots.push(node.id),
			}
		}
		Self { roots, children }
	}

	pub(super) fn children(&self, parent: Option<&str>) -> &[&'a str] {
		match parent {
			Some(parent) => self.children.get(parent).map_or(&[], Vec::as_slice),
			None => &self.roots,
		}
	}

	pub(super) fn descendants(&self, id: &str) -> Vec<&'a str> {
		let mut found = Vec::new();
		let mut waiting: Vec<&str> = self.children(Some(id)).iter().rev().copied().collect();
		while let Some(next) = waiting.pop() {
			found.push(next);
			waiting.extend(self.children(Some(next)).iter().rev());
		}
		found
	}

	pub(super) fn under(&self, parent: Option<&str>) -> Vec<&'a str> {
		match parent {
			Some(parent) => self.descendants(parent),
			None => self
				.children(None)
				.iter()
				.flat_map(|id| std::iter::once(*id).chain(self.descendants(id)))
				.collect(),
		}
	}

	pub(super) fn with_descendants(&self, ids: &[String]) -> Vec<String> {
		let mut seen = BTreeSet::new();
		ids.iter()
			.flat_map(|id| std::iter::once(id.as_str()).chain(self.descendants(id)))
			.filter(|id| seen.insert(*id))
			.map(str::to_owned)
			.collect()
	}
}

pub(super) fn parent_section<'a>(
	board: &Board,
	parent: Option<&'a str>,
) -> Result<Option<&'a str>, DrawRefusal> {
	let Some(id) = parent else {
		return Ok(None);
	};
	let reference = || id.to_owned();
	match board.nodes.get(id).map(|node: &JsonObject| kind_of(node)) {
		None => Err(refused_parent(DrawFault::UnknownReference { reference: reference() })),
		Some(Some(SECTION)) => Ok(Some(id)),
		Some(_) => Err(refused_parent(DrawFault::NotASection { reference: reference() })),
	}
}
