use rune::image::Image;

use crate::surfaces::s15_boards::model::{
	Connector, Content, End, HeadSize, Item, LibraryCard, LibraryFace, LibraryItem, LinkCard,
	Object, Outline, OutlineState, Owner, Picture, Point, PointerPlacement, Rect, Routing,
	SectionTint, ShapeFill, ShapeKind, ShapeStyle, Side, StickyColour,
};

pub const TERRACE_SVG: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120' viewBox='0 0 160 120'><rect width='160' height='120' fill='#7fa7c9'/><circle cx='118' cy='38' r='16' fill='#fbe7b0'/><path d='M0 84 L40 62 L76 80 L116 56 L160 78 V120 H0 Z' fill='#2f5d50'/></svg>";
pub const POOL_SVG: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120' viewBox='0 0 160 120'><rect width='160' height='120' fill='#5fa8d3'/><circle cx='118' cy='38' r='16' fill='#cae9ff'/><path d='M0 84 L40 62 L76 80 L116 56 L160 78 V120 H0 Z' fill='#1b4965'/></svg>";
pub const PATIO_SVG: &str = "<svg xmlns='http://www.w3.org/2000/svg' width='160' height='120' viewBox='0 0 160 120'><rect width='160' height='120' fill='#a7c957'/><circle cx='118' cy='38' r='16' fill='#f2e8cf'/><path d='M0 84 L40 62 L76 80 L116 56 L160 78 V120 H0 Z' fill='#386641'/></svg>";
pub const PICTURE_SIDE: f32 = 160.0;

pub struct Pictures {
	pub terrace: Option<Picture>,
	pub pool: Option<Picture>,
	pub patio: Option<Picture>,
}

impl Pictures {
	pub fn of(images: &[Image]) -> Pictures {
		let at = |index: usize| images.get(index).cloned().map(Picture);
		Pictures { terrace: at(0), pool: at(1), patio: at(2) }
	}
}

pub const STICKY_TEXT: &str = "Draft the launch plan before Friday";
pub const BOARD_CARD_TITLE: &str = "Launch week plan";
pub const PASTED_IMAGE_SOURCE: &str = "example.com/terrace-at-dusk";

pub fn agent_author() -> Owner {
	Owner::agent("juniper", "Juniper", Some(257.0))
}

pub fn person_author() -> Owner {
	Owner::person("ada", "Ada Martin", None)
}

pub fn drawing_agent() -> Owner {
	Owner::agent("atlas", "Atlas", Some(41.0))
}

pub fn drawing_agent_pointer() -> PointerPlacement {
	PointerPlacement { owner: drawing_agent(), position: Point::new(590.0, 210.0) }
}

pub fn link_card(pictures: &Pictures) -> LinkCard {
	LinkCard {
		preview: pictures.pool.clone(),
		title: "Designing calm interfaces for busy teams".to_owned(),
		description: "How quiet defaults, fewer modes and honest empty states keep a shared workspace readable as it grows.".to_owned(),
		domain: "example.com".to_owned(),
	}
}

pub fn library_document() -> LibraryCard {
	LibraryCard {
		title: "Launch brief".to_owned(),
		excerpt: "What we’re making, who it’s for and why it matters now. The outcome this work commits to.".to_owned(),
	}
}

fn document(id: &str, title: &str, excerpt: &str) -> LibraryItem {
	LibraryItem {
		id: id.to_owned(),
		title: title.to_owned(),
		face: LibraryFace::Document { excerpt: excerpt.to_owned() },
	}
}

fn picture(id: &str, title: &str, picture: &Option<Picture>) -> LibraryItem {
	LibraryItem {
		id: id.to_owned(),
		title: title.to_owned(),
		face: LibraryFace::Image(picture.clone()),
	}
}

pub fn library_items(pictures: &Pictures) -> Vec<LibraryItem> {
	let brief = library_document();
	vec![
		picture("terrace-at-dusk", "Terrace at dusk", &pictures.terrace),
		document("launch-brief", &brief.title, &brief.excerpt),
		picture("rooftop-pool", "Rooftop pool", &pictures.pool),
		document(
			"interview-notes",
			"Interview notes",
			"Six people, one question: what did you expect to happen next?",
		),
		picture("garden-patio", "Garden patio", &pictures.patio),
		document(
			"pricing-questions",
			"Pricing questions",
			"What teams asked about seats, trials and invoices this month.",
		),
	]
}

pub fn item(id: &str, rect: Rect, z_order: i32, content: Content) -> Item {
	Item { id: id.to_owned(), rect, z_order, content }
}

pub fn sticky_of(colour: StickyColour, text: &str, author: Owner) -> Content {
	Content::Sticky { colour, text: text.to_owned(), author }
}

pub fn shape_of(kind: ShapeKind, label: &str) -> Content {
	Content::Shape {
		style: ShapeStyle { shape: kind, fill: ShapeFill::Surface },
		label: label.to_owned(),
	}
}

pub fn text_of(heading: Option<&str>, body: Option<&str>) -> Content {
	Content::Text { heading: heading.map(str::to_owned), body: body.map(str::to_owned) }
}

pub fn planning_snapshot() -> (Rect, Vec<Item>) {
	let agent = agent_author();
	let person = person_author();
	(
		Rect::new(-40.0, 0.0, 820.0, 260.0),
		vec![
			item(
				"",
				Rect::new(-40.0, 0.0, 440.0, 260.0),
				0,
				Content::Section { tint: SectionTint::Blue, title: "This week".to_owned() },
			),
			item(
				"",
				Rect::new(-16.0, 64.0, 160.0, 160.0),
				1,
				sticky_of(StickyColour::Yellow, STICKY_TEXT, agent.clone()),
			),
			item(
				"",
				Rect::new(176.0, 64.0, 160.0, 160.0),
				2,
				sticky_of(StickyColour::Pink, "Ask Ada for the final copy", person),
			),
			item(
				"",
				Rect::new(440.0, 0.0, 300.0, 96.0),
				3,
				text_of(Some("Launch plan"), Some("Three steps to Friday.")),
			),
			item(
				"planning-ship",
				Rect::new(440.0, 124.0, 160.0, 96.0),
				4,
				shape_of(ShapeKind::RoundedRectangle, "Ship"),
			),
			item(
				"",
				Rect::new(620.0, 100.0, 160.0, 160.0),
				5,
				sticky_of(StickyColour::Green, "Release notes drafted", agent),
			),
		],
	)
}

pub fn references_snapshot(pictures: &Pictures) -> (Rect, Vec<Item>) {
	(
		Rect::new(0.0, 0.0, 824.0, 380.0),
		vec![
			item(
				"",
				Rect::new(0.0, 0.0, 240.0, 180.0),
				0,
				Content::Image {
					picture: pictures.pool.clone(),
					alt: "A rooftop pool at dusk".to_owned(),
					source: None,
				},
			),
			item("", Rect::new(264.0, 0.0, 300.0, 180.0), 1, Content::Link(link_card(pictures))),
			item("", Rect::new(588.0, 0.0, 236.0, 160.0), 2, Content::Library(library_document())),
			item(
				"",
				Rect::new(0.0, 220.0, 160.0, 160.0),
				3,
				sticky_of(StickyColour::Blue, "Calm, not quiet", person_author()),
			),
			item(
				"",
				Rect::new(200.0, 220.0, 160.0, 160.0),
				4,
				shape_of(ShapeKind::Ellipse, "Mood"),
			),
		],
	)
}

const COLUMNS: usize = 24;
const ROWS: usize = 20;
const COLUMN_PITCH: f64 = 240.0;
const ROW_PITCH: f64 = 192.0;

pub fn notes(count: usize) -> Vec<Object> {
	(0..count)
		.map(|index| {
			Object::Item(item(
				&format!("note-{}", index + 1),
				Rect::new(
					(index % COLUMNS) as f64 * COLUMN_PITCH,
					(index / COLUMNS) as f64 * ROW_PITCH,
					160.0,
					120.0,
				),
				1,
				Content::Foreign { text: format!("Note {}", index + 1) },
			))
		})
		.collect()
}

pub fn five_hundred_objects() -> Vec<Object> {
	let mut objects = notes(COLUMNS * ROWS);
	objects.extend((0..ROWS).map(|row| {
		Object::Connector(Connector::between(
			&format!("link-{}", row + 1),
			End::sided(&format!("note-{}", row * COLUMNS + 1), Side::Right),
			End::sided(&format!("note-{}", row * COLUMNS + 2), Side::Left),
			Routing::Straight,
		))
	}));
	objects
}

fn foreign_sticky(id: &str, x: f64, y: f64) -> Object {
	Object::Item(item(
		id,
		Rect::new(x, y, 160.0, 120.0),
		1,
		Content::Foreign { text: id.to_owned() },
	))
}

pub fn spread_board() -> Vec<Object> {
	vec![
		foreign_sticky("Far west", 4000.0, -3000.0),
		foreign_sticky("Far east", 7400.0, -2200.0),
		foreign_sticky("Far south", 5200.0, -900.0),
		Object::Connector(Connector::between(
			"Far link",
			End::sided("Far west", Side::Right),
			End::sided("Far east", Side::Left),
			Routing::Straight,
		)),
	]
}

pub fn two_stickies_board() -> Vec<Object> {
	vec![foreign_sticky("Left", -420.0, 260.0), foreign_sticky("Right", -200.0, 300.0)]
}

pub fn plan() -> Object {
	Object::Item(item(
		"plan",
		Rect::new(40.0, 40.0, 160.0, 160.0),
		1,
		sticky_of(StickyColour::Yellow, STICKY_TEXT, person_author()),
	))
}

pub fn research() -> Object {
	Object::Item(item(
		"research",
		Rect::new(280.0, 72.0, 144.0, 80.0),
		2,
		shape_of(ShapeKind::RoundedRectangle, "Research"),
	))
}

fn ship() -> Object {
	Object::Item(item(
		"ship",
		Rect::new(480.0, 72.0, 136.0, 88.0),
		3,
		shape_of(ShapeKind::Ellipse, "Ship"),
	))
}

fn kickoff() -> Object {
	Object::Item(item(
		"kickoff",
		Rect::new(40.0, 260.0, 300.0, 48.0),
		4,
		text_of(None, Some("Kickoff notes")),
	))
}

pub fn small_board() -> Vec<Object> {
	vec![plan(), research(), ship(), kickoff()]
}

pub fn review() -> Object {
	Object::Item(item(
		"review",
		Rect::new(320.0, 240.0, 144.0, 80.0),
		2,
		shape_of(ShapeKind::RoundedRectangle, "Review"),
	))
}

pub fn plan_to_review(routing: Routing) -> Connector {
	Connector::between(
		"plan-to-review",
		End::sided("plan", Side::Right),
		End::sided("review", Side::Left),
		routing,
	)
}

pub fn drawn_plan_to_review(routing: Routing) -> Connector {
	Connector::between(
		"plan-to-review",
		End::sided("plan", Side::Right),
		End::of("review"),
		routing,
	)
}

pub fn terrace_item(pictures: &Pictures) -> Object {
	Object::Item(item(
		"terrace",
		Rect::new(40.0, 40.0, 200.0, 136.0),
		1,
		Content::Image {
			picture: pictures.terrace.clone(),
			alt: "terrace-at-dusk.png".to_owned(),
			source: Some(PASTED_IMAGE_SOURCE.to_owned()),
		},
	))
}

pub fn shape_at(id: &str, label: &str, x: f64, y: f64, height: f64) -> Object {
	Object::Item(item(
		id,
		Rect::new(x, y, 160.0, height),
		1,
		shape_of(ShapeKind::RoundedRectangle, label),
	))
}

pub fn arrow(id: &str, from: End, to: End) -> Connector {
	Connector::between(id, from, to, Routing::Straight)
}

pub fn brief() -> Object {
	shape_at("brief", "Brief", 80.0, 126.0, 120.0)
}

pub fn draft() -> Object {
	shape_at("draft", "Draft", 400.0, 126.0, 120.0)
}

pub fn launch() -> Object {
	shape_at("launch", "Launch", 720.0, 126.0, 120.0)
}

pub fn head_size_board() -> Vec<Object> {
	let mut objects = Vec::new();
	for (row, head) in [HeadSize::Small, HeadSize::Medium, HeadSize::Large].into_iter().enumerate()
	{
		let name = format!("{head:?}").to_lowercase();
		let y = 46.0 + row as f64 * 160.0;
		objects.push(shape_at(&format!("{name}-from"), "From", 80.0, y, 120.0));
		objects.push(shape_at(&format!("{name}-to"), "To", 400.0, y, 120.0));
		let mut line =
			arrow(&name, End::of(&format!("{name}-from")), End::of(&format!("{name}-to")));
		line.head_size = head;
		objects.push(Object::Connector(line));
	}
	objects
}

fn frame_of(id: &str, title: &str, rect: Rect) -> Object {
	Object::Item(item(
		id,
		rect,
		0,
		Content::Section { tint: SectionTint::Blue, title: title.to_owned() },
	))
}

fn arrow_sticky(id: &str, text: &str, x: f64, y: f64) -> Object {
	Object::Item(item(
		id,
		Rect::new(x, y, 160.0, 160.0),
		1,
		sticky_of(StickyColour::Yellow, text, person_author()),
	))
}

pub fn after_board() -> Vec<Object> {
	let straight =
		|id: &str, from: &str, to: &str| Object::Connector(arrow(id, End::of(from), End::of(to)));
	let elbow = |id: &str, from: &str, to: &str| {
		Object::Connector(Connector::between(id, End::of(from), End::of(to), Routing::Elbow))
	};
	vec![
		frame_of("desktop", "Application de bureau", Rect::new(40.0, 80.0, 608.0, 232.0)),
		frame_of("sidecar", "Sidecar", Rect::new(40.0, 400.0, 408.0, 232.0)),
		frame_of("cloud", "Cloud", Rect::new(720.0, 80.0, 408.0, 232.0)),
		arrow_sticky("interface-react", "Interface React", 64.0, 128.0),
		arrow_sticky("host-rust", "Hôte Rust", 264.0, 128.0),
		arrow_sticky("local-storage", "Stockage local", 464.0, 128.0),
		arrow_sticky("relay", "Relais", 744.0, 128.0),
		arrow_sticky("iphone-app", "App iPhone", 944.0, 128.0),
		arrow_sticky("agent-sdk", "Agent SDK", 64.0, 448.0),
		arrow_sticky("bot-plugin", "Plugin du bot", 264.0, 448.0),
		straight("react-to-host", "interface-react", "host-rust"),
		straight("host-to-storage", "host-rust", "local-storage"),
		straight("relay-to-iphone", "relay", "iphone-app"),
		straight("agent-to-plugin", "agent-sdk", "bot-plugin"),
		elbow("host-to-agent", "host-rust", "agent-sdk"),
		elbow("host-to-relay", "host-rust", "relay"),
	]
}

pub fn start() -> Object {
	shape_at("start", "Start", 80.0, 120.0, 160.0)
}

pub fn finish(y: f64) -> Object {
	shape_at("finish", "Finish", 400.0, y, 160.0)
}

pub fn start_to_finish() -> Connector {
	arrow("start-to-finish", End::of("start"), End::of("finish"))
}

pub fn labelled(text: &str, position: Option<f64>, bend: f64) -> Connector {
	Connector { text: text.to_owned(), label_position: position, bend, ..start_to_finish() }
}

pub struct Presence {
	pub atlas: Owner,
	pub juniper: Owner,
	pub lena: Owner,
	pub maximilian: Owner,
}

pub fn presence() -> Presence {
	Presence {
		atlas: Owner::agent("agent-atlas", "Atlas", Some(220.0)),
		juniper: Owner::agent("agent-juniper", "Juniper", Some(130.0)),
		lena: Owner::person("person-lena", "Lena", Some(257.0)),
		maximilian: Owner::person(
			"person-maximilian",
			"Maximilian Alexander Featherstonehaugh-Montgomery",
			Some(296.0),
		),
	}
}

pub fn presence_board(people: &Presence) -> Vec<Object> {
	let author = |owner: &Owner| Owner { id: String::new(), ..owner.clone() };
	vec![
		Object::Item(item(
			"heading",
			Rect::new(0.0, 0.0, 400.0, 56.0),
			1,
			text_of(Some("Launch week"), None),
		)),
		Object::Item(item(
			"sticky-atlas",
			Rect::new(0.0, 96.0, 160.0, 160.0),
			1,
			sticky_of(
				StickyColour::Yellow,
				"Draft the launch plan before Friday",
				author(&people.atlas),
			),
		)),
		Object::Item(item(
			"sticky-lena",
			Rect::new(192.0, 96.0, 160.0, 160.0),
			1,
			sticky_of(
				StickyColour::Green,
				"Ask support which onboarding step loses people",
				Owner { hue: None, ..author(&people.lena) },
			),
		)),
		Object::Item(item(
			"sticky-juniper",
			Rect::new(384.0, 96.0, 160.0, 160.0),
			1,
			sticky_of(
				StickyColour::Pink,
				"Three teams asked for a calmer empty state",
				author(&people.juniper),
			),
		)),
		Object::Item(item(
			"shape-juniper",
			Rect::new(600.0, 112.0, 160.0, 88.0),
			1,
			shape_of(ShapeKind::RoundedRectangle, "Measure"),
		)),
		Object::Item(item(
			"shape-ship",
			Rect::new(600.0, 240.0, 136.0, 88.0),
			1,
			shape_of(ShapeKind::Ellipse, "Ship"),
		)),
	]
}

pub fn atlas_writing(people: &Presence) -> Outline {
	Outline {
		object_id: "sticky-atlas".to_owned(),
		owner: people.atlas.clone(),
		state: OutlineState::Writing,
	}
}

pub fn juniper_drawing(people: &Presence) -> Outline {
	Outline {
		object_id: "shape-juniper".to_owned(),
		owner: people.juniper.clone(),
		state: OutlineState::Drawing,
	}
}

pub fn placed(owner: &Owner, x: f64, y: f64) -> PointerPlacement {
	PointerPlacement { owner: owner.clone(), position: Point::new(x, y) }
}
