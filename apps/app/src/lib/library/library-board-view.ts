import {
	BOARD_SCHEMA,
	type Board,
	type BoardNode,
	type Connector,
	presetOf,
} from "@workspace/shared/board/board"
import type {
	BoardConnector,
	BoardItem,
	BoardItemKind,
	BoardShapeFill,
	BoardShapeStyle,
	BoardView,
} from "@workspace/ui/components/board-view"

import { FILL_OF_PRESET } from "./library-boards"

const STICKY_FILL = BOARD_SCHEMA.kinds.sticky?.fill

const ITEM_KIND_OF: Record<BoardNode["kind"], BoardItemKind> = {
	sticky: "sticky",
	text: "text",
	shape: "shape",
	section: "shape",
	image: "image",
	linkCard: "link",
	libraryCard: "link",
	foreign: "shape",
}

const colourOf = (node: BoardNode) => {
	if (node.kind === "sticky") {
		return STICKY_FILL && presetOf(STICKY_FILL, node.fill)
	}
	return "color" in node ? node.color : undefined
}

const fillOf = (node: BoardNode): BoardShapeFill =>
	FILL_OF_PRESET[colourOf(node) ?? ""] ?? "surface"

const styleOf = (node: BoardNode): BoardShapeStyle => ({
	shape:
		node.kind === "shape" && node.shape === "ellipse"
			? "ellipse"
			: "rounded-rectangle",
	fill: fillOf(node),
})

const textOf = (node: BoardNode) => {
	switch (node.kind) {
		case "sticky":
		case "text":
		case "shape":
			return node.text
		case "section":
			return node.label ?? ""
		case "image":
			return node.alt ?? ""
		case "linkCard":
			return node.title ?? node.url
		case "libraryCard":
			return node.item ?? node.file
		case "foreign":
			return ""
	}
}

const isBelow = (
	[, below]: [string, BoardNode],
	[, above]: [string, BoardNode],
) => (below.z < above.z ? -1 : below.z > above.z ? 1 : 0)

const itemOf = (
	[id, node]: [string, BoardNode],
	zOrder: number,
): BoardItem => ({
	id,
	kind: ITEM_KIND_OF[node.kind],
	position: { x: node.x, y: node.y },
	size: { width: node.width, height: node.height },
	zOrder,
	text: textOf(node),
	style: styleOf(node),
})

const connectorsOf = (
	[id, edge]: [string, Connector],
	zOrder: number,
): BoardConnector[] => {
	const { fromNode, toNode } = edge
	if (fromNode === undefined || toNode === undefined) return []
	return [
		{
			id,
			kind: "connector",
			from: fromNode,
			fromSide: edge.fromSide ?? "right",
			to: toNode,
			toSide: edge.toSide ?? "left",
			routing: edge.routing,
			zOrder,
			text: edge.label ?? "",
		},
	]
}

export const libraryBoardViewOf = ({ nodes, edges }: Board): BoardView => {
	const items = Object.entries(nodes).sort(isBelow).map(itemOf)
	const connectors = Object.entries(edges).flatMap((edge, index) =>
		connectorsOf(edge, items.length + index),
	)
	return { objects: [...items, ...connectors] }
}
