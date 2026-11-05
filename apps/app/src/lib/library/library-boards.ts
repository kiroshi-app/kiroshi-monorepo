import type {
	BoardSnapshot,
	BoardSnapshotObject,
} from "@workspace/ui/components/board/board-miniature"
import type { BoardShapeFill } from "@workspace/ui/components/board/board-shape"

import type { LibraryBoardNode, LibraryBoardSummary } from "../bindings"

const GROUP_TYPE = "group"

const TEXT_TYPE = "text"

export const FILL_OF_PRESET: Readonly<Record<string, BoardShapeFill>> = {
	"1": "pink",
	"2": "yellow",
	"3": "yellow",
	"4": "green",
	"5": "blue",
	"6": "pink",
}

const NO_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export const BLANK_BOARD_SNAPSHOT: BoardSnapshot = {
	bounds: NO_BOUNDS,
	objects: [],
}

const fillOf = ({ type, colour }: LibraryBoardNode): BoardShapeFill =>
	(type === TEXT_TYPE && colour !== null && FILL_OF_PRESET[colour]) || "surface"

const snapshotObjectOf = (node: LibraryBoardNode): BoardSnapshotObject => {
	const placed = {
		id: node.id,
		x: node.x,
		y: node.y,
		width: node.width,
		height: node.height,
	}
	return node.type === GROUP_TYPE
		? { ...placed, kind: "section", props: { tint: "blue", title: "" } }
		: {
				...placed,
				kind: "shape",
				props: { kind: "rounded-rectangle", fill: fillOf(node), label: "" },
			}
}

export const boardSnapshotOf = ({
	nodes,
	bounds,
}: LibraryBoardSummary): BoardSnapshot => ({
	bounds: bounds ?? NO_BOUNDS,
	objects: nodes.map(snapshotObjectOf),
})

export const boardOriginOf = ({ bounds }: LibraryBoardSummary) => ({
	x: -(bounds?.x ?? 0),
	y: -(bounds?.y ?? 0),
})
