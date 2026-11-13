import { toScreenRect } from "@workspace/ui/components/board-selection"
import type {
	BoardPoint,
	BoardRect,
	BoardViewport,
} from "@workspace/ui/components/board-view"
import { expandRect } from "@workspace/ui/components/board-viewport"

type BoardCommentAnchor = string | BoardPoint

const PIN_SIZE = 32
const PIN_INSET = 10
const RING_OUTSET = 6
const CARD_GAP = 8
const THREAD_DROP = 20

const isNodeAnchor = (anchor: BoardCommentAnchor): anchor is string =>
	typeof anchor === "string"

const commentPinPointOf = (node: BoardRect): BoardPoint => ({
	x: node.x + node.width - PIN_INSET,
	y: node.y + PIN_INSET,
})

const toScreenPoint = (
	point: BoardPoint,
	{ offset, zoom }: BoardViewport,
): BoardPoint => ({
	x: offset.x + point.x * zoom,
	y: offset.y + point.y * zoom,
})

const commentRingRectOf = (node: BoardRect, viewport: BoardViewport) =>
	expandRect(toScreenRect(node, viewport), RING_OUTSET)

const commentRingRadiusOf = (drawnRadius: string, zoom: number) =>
	drawnRadius.endsWith("%")
		? drawnRadius
		: `${(Number.parseFloat(drawnRadius) || 0) * zoom + RING_OUTSET}px`

const composerCornerOf = (pinTail: BoardPoint): BoardPoint => ({
	x: pinTail.x + PIN_SIZE + CARD_GAP,
	y: pinTail.y - PIN_SIZE,
})

const threadCornerBesidePin = (pinTail: BoardPoint): BoardPoint => ({
	x: pinTail.x - CARD_GAP,
	y: pinTail.y - PIN_SIZE,
})

const threadCornerUnderRing = (ring: BoardRect): BoardPoint => ({
	x: ring.x + ring.width,
	y: ring.y + ring.height + THREAD_DROP,
})

export {
	type BoardCommentAnchor,
	commentPinPointOf,
	commentRingRadiusOf,
	commentRingRectOf,
	composerCornerOf,
	isNodeAnchor,
	threadCornerBesidePin,
	threadCornerUnderRing,
	toScreenPoint,
}
