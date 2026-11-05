import type {
	BoardShapeFill,
	BoardShapeKind,
} from "@workspace/ui/components/board/board-shape"

type BoardPoint = {
	x: number
	y: number
}

type BoardSize = {
	width: number
	height: number
}

type BoardRect = BoardPoint & BoardSize

type BoardItemKind = "sticky" | "text" | "shape" | "image" | "link"

type BoardShapeType = BoardShapeKind

type BoardShapeStyle = {
	shape: BoardShapeType
	fill: BoardShapeFill
}

type BoardItem = {
	id: string
	kind: BoardItemKind
	position: BoardPoint
	size: BoardSize
	zOrder: number
	text: string
	style?: BoardShapeStyle
}

type BoardSide = "top" | "right" | "bottom" | "left"

type BoardRouting = "straight" | "elbow"

type BoardConnectorStyle = {
	routing: BoardRouting
}

type BoardConnector = {
	id: string
	kind: "connector"
	from: string
	fromSide: BoardSide
	to: string
	toSide: BoardSide
	routing: BoardRouting
	zOrder: number
	text: string
}

type BoardObject = BoardItem | BoardConnector

type BoardView = {
	objects: readonly BoardObject[]
}

type BoardViewport = {
	offset: BoardPoint
	zoom: number
}

type BoardIntent =
	| { type: "create"; object: BoardObject }
	| { type: "move"; id: string; position: BoardPoint }
	| { type: "resize"; id: string; position: BoardPoint; size: BoardSize }
	| { type: "edit-text"; id: string; text: string }
	| { type: "style"; id: string; style: BoardShapeStyle | BoardConnectorStyle }
	| {
			type: "connect"
			id: string
			from: string
			fromSide: BoardSide
			to: string
			toSide: BoardSide
			routing: BoardRouting
	  }
	| { type: "delete"; id: string }

export type {
	BoardConnector,
	BoardConnectorStyle,
	BoardIntent,
	BoardItem,
	BoardItemKind,
	BoardObject,
	BoardPoint,
	BoardRect,
	BoardRouting,
	BoardShapeFill,
	BoardShapeStyle,
	BoardShapeType,
	BoardSide,
	BoardSize,
	BoardView,
	BoardViewport,
}
