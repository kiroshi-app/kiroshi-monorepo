import type {
	BoardItem,
	BoardPoint,
	BoardRect,
	BoardViewport,
} from "@workspace/ui/components/board-view"

type BoardCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right"

const BOARD_CORNERS: readonly BoardCorner[] = [
	"top-left",
	"top-right",
	"bottom-left",
	"bottom-right",
]

const BOARD_MIN_OBJECT_SIZE = 8

const ARROW_DIRECTIONS: Record<string, BoardPoint> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
}

const arrowDirectionOf = (key: string): BoardPoint | undefined =>
	ARROW_DIRECTIONS[key]

const scalePoint = (point: BoardPoint, by: number): BoardPoint => ({
	x: point.x * by,
	y: point.y * by,
})

const movedRect = (rect: BoardRect, delta: BoardPoint): BoardRect => ({
	...rect,
	x: rect.x + delta.x,
	y: rect.y + delta.y,
})

const resizedFromCorner = (
	rect: BoardRect,
	corner: BoardCorner,
	delta: BoardPoint,
): BoardRect => {
	const isLeft = corner.endsWith("left")
	const isTop = corner.startsWith("top")
	const width = Math.max(
		BOARD_MIN_OBJECT_SIZE,
		rect.width + (isLeft ? -delta.x : delta.x),
	)
	const height = Math.max(
		BOARD_MIN_OBJECT_SIZE,
		rect.height + (isTop ? -delta.y : delta.y),
	)
	return {
		x: isLeft ? rect.x + rect.width - width : rect.x,
		y: isTop ? rect.y + rect.height - height : rect.y,
		width,
		height,
	}
}

const roundedRect = (rect: BoardRect): BoardRect => ({
	x: Math.round(rect.x),
	y: Math.round(rect.y),
	width: Math.round(rect.width),
	height: Math.round(rect.height),
})

const toScreenRect = (rect: BoardRect, viewport: BoardViewport): BoardRect => ({
	x: viewport.offset.x + rect.x * viewport.zoom,
	y: viewport.offset.y + rect.y * viewport.zoom,
	width: rect.width * viewport.zoom,
	height: rect.height * viewport.zoom,
})

const inReadingOrder = (items: readonly BoardItem[]) =>
	items.toSorted(
		(a, b) => a.position.y - b.position.y || a.position.x - b.position.x,
	)

export {
	arrowDirectionOf,
	BOARD_CORNERS,
	BOARD_MIN_OBJECT_SIZE,
	type BoardCorner,
	inReadingOrder,
	movedRect,
	resizedFromCorner,
	roundedRect,
	scalePoint,
	toScreenRect,
}
