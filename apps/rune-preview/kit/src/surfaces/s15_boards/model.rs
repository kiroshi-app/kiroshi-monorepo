use std::fmt;
use std::path::PathBuf;

use rune::image::Image;

#[derive(Clone)]
pub struct Picture(pub Image);

impl PartialEq for Picture {
	fn eq(&self, other: &Picture) -> bool {
		self.0.id() == other.0.id()
	}
}

impl fmt::Debug for Picture {
	fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
		formatter.debug_tuple("Picture").field(&self.0.size()).finish()
	}
}

pub fn round_half_up(value: f64) -> f64 {
	(value + 0.5).floor()
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Point {
	pub x: f64,
	pub y: f64,
}

impl Point {
	pub const fn new(x: f64, y: f64) -> Point {
		Point { x, y }
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Size {
	pub width: f64,
	pub height: f64,
}

impl Size {
	pub const fn new(width: f64, height: f64) -> Size {
		Size { width, height }
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Rect {
	pub x: f64,
	pub y: f64,
	pub width: f64,
	pub height: f64,
}

impl Rect {
	pub const fn new(x: f64, y: f64, width: f64, height: f64) -> Rect {
		Rect { x, y, width, height }
	}

	pub const fn at(point: Point) -> Rect {
		Rect { x: point.x, y: point.y, width: 0.0, height: 0.0 }
	}

	pub fn contains(&self, point: Point) -> bool {
		self.x <= point.x
			&& point.x <= self.x + self.width
			&& self.y <= point.y
			&& point.y <= self.y + self.height
	}
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Viewport {
	pub offset: Point,
	pub zoom: f64,
}

impl Viewport {
	pub const fn new(x: f64, y: f64, zoom: f64) -> Viewport {
		Viewport { offset: Point::new(x, y), zoom }
	}

	pub fn to_screen(&self, point: Point) -> Point {
		Point::new(self.offset.x + point.x * self.zoom, self.offset.y + point.y * self.zoom)
	}

	pub fn to_board(&self, screen: Point) -> Point {
		Point::new(
			round_half_up((screen.x - self.offset.x) / self.zoom),
			round_half_up((screen.y - self.offset.y) / self.zoom),
		)
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Side {
	Top,
	Right,
	Bottom,
	Left,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Routing {
	Straight,
	#[default]
	Elbow,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum HeadSize {
	Small,
	#[default]
	Medium,
	Large,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum StickyColour {
	Yellow,
	Green,
	Pink,
	Blue,
	Orange,
}

impl StickyColour {
	pub const ALL: [StickyColour; 5] = [
		StickyColour::Yellow,
		StickyColour::Green,
		StickyColour::Pink,
		StickyColour::Blue,
		StickyColour::Orange,
	];

	pub fn name(self) -> &'static str {
		match self {
			StickyColour::Yellow => "yellow",
			StickyColour::Green => "green",
			StickyColour::Pink => "pink",
			StickyColour::Blue => "blue",
			StickyColour::Orange => "orange",
		}
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum SectionTint {
	Blue,
	Purple,
}

impl SectionTint {
	pub const ALL: [SectionTint; 2] = [SectionTint::Blue, SectionTint::Purple];

	pub fn name(self) -> &'static str {
		match self {
			SectionTint::Blue => "blue",
			SectionTint::Purple => "purple",
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ShapeKind {
	#[default]
	RoundedRectangle,
	Ellipse,
}

impl ShapeKind {
	pub const ALL: [ShapeKind; 2] = [ShapeKind::RoundedRectangle, ShapeKind::Ellipse];
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum ShapeFill {
	#[default]
	Surface,
	Yellow,
	Green,
	Blue,
	Pink,
}

impl ShapeFill {
	pub const ALL: [ShapeFill; 5] =
		[ShapeFill::Surface, ShapeFill::Yellow, ShapeFill::Green, ShapeFill::Blue, ShapeFill::Pink];
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub struct ShapeStyle {
	pub shape: ShapeKind,
	pub fill: ShapeFill,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OwnerKind {
	Agent,
	Person,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Owner {
	pub kind: OwnerKind,
	pub id: String,
	pub name: String,
	pub hue: Option<f32>,
}

impl Owner {
	pub fn agent(id: &str, name: &str, hue: Option<f32>) -> Owner {
		Owner { kind: OwnerKind::Agent, id: id.to_owned(), name: name.to_owned(), hue }
	}

	pub fn person(id: &str, name: &str, hue: Option<f32>) -> Owner {
		Owner { kind: OwnerKind::Person, id: id.to_owned(), name: name.to_owned(), hue }
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum OutlineState {
	Writing,
	Drawing,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Outline {
	pub object_id: String,
	pub owner: Owner,
	pub state: OutlineState,
}

#[derive(Clone, Debug, PartialEq)]
pub struct PointerPlacement {
	pub owner: Owner,
	pub position: Point,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LinkCard {
	pub preview: Option<Picture>,
	pub title: String,
	pub description: String,
	pub domain: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LibraryCard {
	pub title: String,
	pub excerpt: String,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Content {
	Sticky { colour: StickyColour, text: String, author: Owner },
	Text { heading: Option<String>, body: Option<String> },
	Shape { style: ShapeStyle, label: String },
	Section { tint: SectionTint, title: String },
	Image { picture: Option<Picture>, alt: String, source: Option<String> },
	Link(LinkCard),
	Library(LibraryCard),
	Foreign { text: String },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ItemKind {
	Sticky,
	Text,
	Shape,
	Section,
	Image,
	Link,
	Library,
	Foreign,
}

impl Content {
	pub fn kind(&self) -> ItemKind {
		match self {
			Content::Sticky { .. } => ItemKind::Sticky,
			Content::Text { .. } => ItemKind::Text,
			Content::Shape { .. } => ItemKind::Shape,
			Content::Section { .. } => ItemKind::Section,
			Content::Image { .. } => ItemKind::Image,
			Content::Link(_) => ItemKind::Link,
			Content::Library(_) => ItemKind::Library,
			Content::Foreign { .. } => ItemKind::Foreign,
		}
	}

	pub fn text(&self) -> &str {
		match self {
			Content::Sticky { text, .. } | Content::Foreign { text } => text,
			Content::Text { heading, body } => {
				body.as_deref().or(heading.as_deref()).unwrap_or_default()
			}
			Content::Shape { label, .. } => label,
			Content::Section { title, .. } => title,
			Content::Image { alt, .. } => alt,
			Content::Link(card) => &card.title,
			Content::Library(card) => &card.title,
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct Item {
	pub id: String,
	pub rect: Rect,
	pub z_order: i32,
	pub content: Content,
}

impl Item {
	pub fn kind(&self) -> ItemKind {
		self.content.kind()
	}

	pub fn has_text(&self) -> bool {
		matches!(self.kind(), ItemKind::Sticky | ItemKind::Text | ItemKind::Shape)
	}
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct End {
	pub item: String,
	pub side: Option<Side>,
	pub anchor: Option<Point>,
	pub point: Option<Point>,
}

impl End {
	pub fn of(item: &str) -> End {
		End { item: item.to_owned(), ..End::default() }
	}

	pub fn sided(item: &str, side: Side) -> End {
		End { side: Some(side), ..End::of(item) }
	}

	pub fn anchored(item: &str, anchor: Point) -> End {
		End { anchor: Some(anchor), ..End::of(item) }
	}

	pub fn loose(point: Point) -> End {
		End { point: Some(point), ..End::default() }
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct Connector {
	pub id: String,
	pub from: End,
	pub to: End,
	pub routing: Routing,
	pub bend: f64,
	pub label_position: Option<f64>,
	pub head_size: HeadSize,
	pub z_order: i32,
	pub text: String,
}

impl Connector {
	pub fn between(id: &str, from: End, to: End, routing: Routing) -> Connector {
		Connector {
			id: id.to_owned(),
			from,
			to,
			routing,
			bend: 0.0,
			label_position: None,
			head_size: HeadSize::Medium,
			z_order: 0,
			text: String::new(),
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
pub enum Object {
	Item(Item),
	Connector(Connector),
}

impl Object {
	pub fn id(&self) -> &str {
		match self {
			Object::Item(item) => &item.id,
			Object::Connector(connector) => &connector.id,
		}
	}

	pub fn as_item(&self) -> Option<&Item> {
		match self {
			Object::Item(item) => Some(item),
			Object::Connector(_) => None,
		}
	}

	pub fn as_connector(&self) -> Option<&Connector> {
		match self {
			Object::Item(_) => None,
			Object::Connector(connector) => Some(connector),
		}
	}
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum Tool {
	#[default]
	Select,
	Hand,
	Sticky,
	Shape,
	Text,
	Connector,
	Section,
	Image,
	Library,
}

impl Tool {
	pub const ALL: [Tool; 9] = [
		Tool::Select,
		Tool::Hand,
		Tool::Sticky,
		Tool::Shape,
		Tool::Text,
		Tool::Connector,
		Tool::Section,
		Tool::Image,
		Tool::Library,
	];

	pub fn name(self) -> &'static str {
		match self {
			Tool::Select => "select",
			Tool::Hand => "hand",
			Tool::Sticky => "sticky",
			Tool::Shape => "shape",
			Tool::Text => "text",
			Tool::Connector => "connector",
			Tool::Section => "section",
			Tool::Image => "image",
			Tool::Library => "library",
		}
	}

	pub fn created_size(self) -> Option<Size> {
		match self {
			Tool::Sticky => Some(Size::new(200.0, 200.0)),
			Tool::Shape => Some(Size::new(200.0, 120.0)),
			Tool::Text => Some(Size::new(240.0, 80.0)),
			Tool::Section => Some(Size::new(640.0, 400.0)),
			_ => None,
		}
	}
}

#[derive(Clone, Debug, PartialEq)]
pub enum LibraryFace {
	Image(Option<Picture>),
	Document { excerpt: String },
}

#[derive(Clone, Debug, PartialEq)]
pub struct LibraryItem {
	pub id: String,
	pub title: String,
	pub face: LibraryFace,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum FileKind {
	Image,
	File,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Corner {
	TopLeft,
	TopRight,
	BottomLeft,
	BottomRight,
}

impl Corner {
	pub const ALL: [Corner; 4] =
		[Corner::TopLeft, Corner::TopRight, Corner::BottomLeft, Corner::BottomRight];

	pub fn is_left(self) -> bool {
		matches!(self, Corner::TopLeft | Corner::BottomLeft)
	}

	pub fn is_top(self) -> bool {
		matches!(self, Corner::TopLeft | Corner::TopRight)
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum GestureKind {
	Move,
	Resize,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Gesture {
	pub id: String,
	pub rect: Rect,
	pub kind: GestureKind,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Editing {
	pub id: String,
	pub text: String,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Hover {
	pub id: String,
	pub anchor: Option<Side>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ArrowGesture {
	pub arrow: Connector,
	pub is_new: bool,
	pub has_end: bool,
	pub ring: Option<String>,
	pub marker: Option<Point>,
	pub is_label_sliding: bool,
}

#[derive(Clone, Debug, PartialEq)]
pub struct FileDrag {
	pub kinds: Vec<FileKind>,
	pub at: Point,
}

#[derive(Clone, Debug, PartialEq)]
pub struct LibraryDrag {
	pub id: String,
	pub at: Point,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Frame {
	pub selected: Option<String>,
	pub gesture: Option<Gesture>,
	pub editing: Option<Editing>,
	pub hover: Option<Hover>,
	pub arrow: Option<ArrowGesture>,
	pub label_editing: Option<Editing>,
	pub file_drag: Option<FileDrag>,
	pub library_drag: Option<LibraryDrag>,
	pub pan_origin: Option<Viewport>,
	pub routing: Routing,
}

#[derive(Clone, Debug, PartialEq)]
pub enum Event {
	Frame(Box<Frame>),
	Viewport(Viewport),
	Tool(Tool),
	Place { tool: Tool, rect: Rect },
	Move { id: String, position: Point },
	Resize { id: String, rect: Rect },
	EditText { id: String, text: String },
	Style { id: String, style: ShapeStyle },
	SetArrow(Connector),
	Delete(String),
	Paste { text: String, at: Point },
	DropFiles { paths: Vec<PathBuf>, at: Point },
	ChooseImages { at: Point },
	LibraryPick { id: String, at: Point },
	LibraryDrop { id: String, at: Point },
	Pointer(Option<Point>),
}
