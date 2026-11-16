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
const COMPOSER_GAP = 8
const THREAD_GAP = 12

const isNodeAnchor = (anchor: BoardCommentAnchor): anchor is string =>
	typeof anchor === "string"

const commentPinTailOf = (
	node: BoardRect,
	viewport: BoardViewport,
): BoardPoint => {
	const onScreen = toScreenRect(node, viewport)
	return {
		x: onScreen.x + onScreen.width - PIN_INSET,
		y: onScreen.y + PIN_INSET,
	}
}

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
		: `${Math.max((Number.parseFloat(drawnRadius) || 0) * zoom, RING_OUTSET)}px`

const composerCornerOf = (pinTail: BoardPoint): BoardPoint => ({
	x: pinTail.x + PIN_SIZE + COMPOSER_GAP,
	y: pinTail.y - PIN_SIZE,
})

const threadCornerBesidePin = (pinTail: BoardPoint): BoardPoint => ({
	x: pinTail.x - THREAD_GAP,
	y: pinTail.y - PIN_SIZE,
})

const threadCornerUnderRing = (ring: BoardRect): BoardPoint => ({
	x: ring.x + ring.width,
	y: ring.y + ring.height + THREAD_GAP,
})

export {
	type BoardCommentAnchor,
	commentPinTailOf,
	commentRingRadiusOf,
	commentRingRectOf,
	composerCornerOf,
	isNodeAnchor,
	threadCornerBesidePin,
	threadCornerUnderRing,
	toScreenPoint,
}
