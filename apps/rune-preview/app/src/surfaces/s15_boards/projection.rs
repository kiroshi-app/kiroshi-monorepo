use kiroshi_core::library::contract::{LibraryBoardNode, LibraryBoardSummary};
use serde_json::Value;

use kiroshi_rune_kit::surfaces::s15_boards::model::{
	Connector, Content, End, HeadSize, Item, LibraryCard, LinkCard, Object, Owner, OwnerKind,
	Point, Rect, Routing, SectionTint, ShapeFill, ShapeKind, ShapeStyle, Side, StickyColour,
};

use super::session::Held;

const GROUP_TYPE: &str = "group";

const TEXT_TYPE: &str = "text";

fn text<'a>(node: &'a Value, field: &str) -> Option<&'a str> {
	node.get(field).and_then(Value::as_str)
}

fn number(node: &Value, field: &str) -> Option<f64> {
	node.get(field).and_then(Value::as_f64)
}

fn point(value: Option<&Value>) -> Option<Point> {
	let value = value?;
	Some(Point::new(number(value, "x")?, number(value, "y")?))
}

fn fill_of_preset(colour: Option<&str>) -> ShapeFill {
	match colour {
		Some("1" | "6") => ShapeFill::Pink,
		Some("2" | "3") => ShapeFill::Yellow,
		Some("4") => ShapeFill::Green,
		Some("5") => ShapeFill::Blue,
		_ => ShapeFill::Surface,
	}
}

fn sticky_colour(fill: Option<&str>) -> StickyColour {
	match fill {
		Some("green") => StickyColour::Green,
		Some("pink") => StickyColour::Pink,
		Some("blue") => StickyColour::Blue,
		Some("orange") => StickyColour::Orange,
		_ => StickyColour::Yellow,
	}
}

fn owner_kind(kind: Option<&str>) -> OwnerKind {
	match kind {
		Some("agent") => OwnerKind::Agent,
		_ => OwnerKind::Person,
	}
}

pub fn domain_of(url: &str) -> &str {
	let Some((_, rest)) = url.split_once("://") else { return url };
	let authority = rest.split(['/', '?', '#']).next().unwrap_or(rest);
	let host = authority.rsplit_once('@').map_or(authority, |(_, host)| host);
	host.split(':').next().unwrap_or(host)
}

fn content_of(node: &Value, owner_of: &dyn Fn(OwnerKind, &str) -> Owner) -> Content {
	let body = || text(node, "text").unwrap_or_default().to_owned();
	match text(node, "kind") {
		Some("sticky") => {
			let author = node.get("author");
			Content::Sticky {
				colour: sticky_colour(text(node, "fill")),
				text: body(),
				author: owner_of(
					owner_kind(author.and_then(|author| text(author, "kind"))),
					author.and_then(|author| text(author, "id")).unwrap_or_default(),
				),
			}
		}
		Some("text") => Content::Text { heading: None, body: Some(body()) },
		Some("shape") => Content::Shape {
			style: ShapeStyle {
				shape: match text(node, "shape") {
					Some("ellipse") => ShapeKind::Ellipse,
					_ => ShapeKind::RoundedRectangle,
				},
				fill: fill_of_preset(text(node, "color")),
			},
			label: body(),
		},
		Some("section") => Content::Section {
			tint: SectionTint::Blue,
			title: text(node, "label").unwrap_or_default().to_owned(),
		},
		Some("image") => Content::Image {
			picture: None,
			alt: text(node, "alt").unwrap_or_default().to_owned(),
			source: text(node, "item").map(str::to_owned),
		},
		Some("linkCard") => {
			let url = text(node, "url").unwrap_or_default();
			Content::Link(LinkCard {
				preview: None,
				title: text(node, "title").unwrap_or(url).to_owned(),
				description: text(node, "description").unwrap_or_default().to_owned(),
				domain: domain_of(url).to_owned(),
			})
		}
		Some("libraryCard") => Content::Library(LibraryCard {
			title: text(node, "item").or(text(node, "file")).unwrap_or_default().to_owned(),
			excerpt: String::new(),
		}),
		_ => Content::Foreign { text: String::new() },
	}
}

fn rect_of(node: &Value) -> Rect {
	let field = |name: &str| number(node, name).unwrap_or_default();
	Rect::new(field("x"), field("y"), field("width"), field("height"))
}

fn side_of(value: Option<&str>) -> Option<Side> {
	match value? {
		"top" => Some(Side::Top),
		"right" => Some(Side::Right),
		"bottom" => Some(Side::Bottom),
		"left" => Some(Side::Left),
		_ => None,
	}
}

fn end_of(edge: &Value, name: &str) -> Option<End> {
	let node = text(edge, &format!("{name}Node"));
	let point = point(edge.get(format!("{name}Point")));
	if node.is_none() && point.is_none() {
		return None;
	}
	Some(End {
		item: node.unwrap_or_default().to_owned(),
		side: side_of(text(edge, &format!("{name}Side"))),
		anchor: self::point(edge.get(format!("{name}Anchor"))),
		point,
	})
}

fn connector_of(id: &str, edge: &Value, z_order: i32) -> Option<Connector> {
	Some(Connector {
		id: id.to_owned(),
		from: end_of(edge, "from")?,
		to: end_of(edge, "to")?,
		routing: match text(edge, "routing") {
			Some("elbow") => Routing::Elbow,
			_ => Routing::Straight,
		},
		bend: number(edge, "bend").unwrap_or_default(),
		label_position: number(edge, "labelPosition"),
		head_size: match text(edge, "headSize") {
			Some("small") => HeadSize::Small,
			Some("large") => HeadSize::Large,
			_ => HeadSize::Medium,
		},
		z_order,
		text: text(edge, "label").unwrap_or_default().to_owned(),
	})
}

pub fn objects_of(held: &Held, owner_of: &dyn Fn(OwnerKind, &str) -> Owner) -> Vec<Object> {
	let mut nodes: Vec<(&String, &Value)> = held.nodes.iter().collect();
	nodes.sort_by(|(_, below), (_, above)| text(below, "z").cmp(&text(above, "z")));
	let count = nodes.len();
	let items = nodes.into_iter().enumerate().map(|(z_order, (id, node))| {
		Object::Item(Item {
			id: id.clone(),
			rect: rect_of(node),
			z_order: z_order as i32,
			content: content_of(node, owner_of),
		})
	});
	let connectors = held.edges.iter().enumerate().filter_map(|(index, (id, edge))| {
		connector_of(id, edge, (count + index) as i32).map(Object::Connector)
	});
	items.chain(connectors).collect()
}

fn snapshot_item(node: &LibraryBoardNode) -> Item {
	let rect = Rect::new(node.x as f64, node.y as f64, node.width as f64, node.height as f64);
	let content = if node.node_type == GROUP_TYPE {
		Content::Section { tint: SectionTint::Blue, title: String::new() }
	} else {
		let colour = node.colour.as_deref().filter(|_| node.node_type == TEXT_TYPE);
		Content::Shape {
			style: ShapeStyle { shape: ShapeKind::RoundedRectangle, fill: fill_of_preset(colour) },
			label: String::new(),
		}
	};
	Item { id: node.id.clone(), rect, z_order: 0, content }
}

pub fn snapshot_of(summary: &LibraryBoardSummary) -> (Rect, Vec<Item>) {
	let bounds = summary.bounds.map_or_else(Rect::default, |bounds| {
		Rect::new(bounds.x as f64, bounds.y as f64, bounds.width as f64, bounds.height as f64)
	});
	(bounds, summary.nodes.iter().map(snapshot_item).collect())
}
