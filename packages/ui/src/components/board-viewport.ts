import type {
	BoardItem,
	BoardObject,
	BoardPoint,
	BoardRect,
	BoardSize,
	BoardViewport,
} from "@workspace/ui/components/board-view"

const BOARD_ZOOM_MIN = 0.1
const BOARD_ZOOM_MAX = 4
const BOARD_ZOOM_STEPS = [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4]
const BOARD_CULL_MARGIN = 256
const BOARD_GRID_PITCH = 24
const BOARD_GRID_MIN_SCREEN_PITCH = 12
const PINCH_SENSITIVITY = 0.01
const ZOOM_EPSILON = 1e-6

type CulledBoardObject = {
	object: BoardObject
	bounds: BoardRect
}

const clampZoom = (zoom: number) =>
	Math.min(BOARD_ZOOM_MAX, Math.max(BOARD_ZOOM_MIN, zoom))

const isAtZoomMin = (zoom: number) => zoom <= BOARD_ZOOM_MIN + ZOOM_EPSILON

const isAtZoomMax = (zoom: number) => zoom >= BOARD_ZOOM_MAX - ZOOM_EPSILON

const zoomStepOut = (zoom: number) =>
	BOARD_ZOOM_STEPS.findLast((step) => step < zoom - ZOOM_EPSILON) ??
	BOARD_ZOOM_MIN

const zoomStepIn = (zoom: number) =>
	BOARD_ZOOM_STEPS.find((step) => step > zoom + ZOOM_EPSILON) ?? BOARD_ZOOM_MAX

const pinchZoom = (zoom: number, deltaY: number) =>
	zoom * Math.exp(-deltaY * PINCH_SENSITIVITY)

const zoomAround = (
	viewport: BoardViewport,
	zoom: number,
	anchor: BoardPoint,
): BoardViewport => {
	const nextZoom = clampZoom(zoom)
	const ratio = nextZoom / viewport.zoom
	return {
		zoom: nextZoom,
		offset: {
			x: anchor.x - (anchor.x - viewport.offset.x) * ratio,
			y: anchor.y - (anchor.y - viewport.offset.y) * ratio,
		},
	}
}

const panBy = (viewport: BoardViewport, delta: BoardPoint): BoardViewport => ({
	zoom: viewport.zoom,
	offset: {
		x: viewport.offset.x - delta.x,
		y: viewport.offset.y - delta.y,
	},
})

const visibleBoardRect = (
	viewport: BoardViewport,
	size: BoardSize,
): BoardRect => ({
	x: -viewport.offset.x / viewport.zoom,
	y: -viewport.offset.y / viewport.zoom,
	width: size.width / viewport.zoom,
	height: size.height / viewport.zoom,
})

const expandRect = (rect: BoardRect, by: number): BoardRect => ({
	x: rect.x - by,
	y: rect.y - by,
	width: rect.width + by * 2,
	height: rect.height + by * 2,
})

const intersects = (a: BoardRect, b: BoardRect) =>
	a.x <= b.x + b.width &&
	b.x <= a.x + a.width &&
	a.y <= b.y + b.height &&
	b.y <= a.y + a.height

const itemBounds = (item: BoardItem): BoardRect => ({
	...item.position,
	...item.size,
})

const unionOf = (a: BoardRect, b: BoardRect): BoardRect => {
	const x = Math.min(a.x, b.x)
	const y = Math.min(a.y, b.y)
	return {
		x,
		y,
		width: Math.max(a.x + a.width, b.x + b.width) - x,
		height: Math.max(a.y + a.height, b.y + b.height) - y,
	}
}

const endBounds = (
	id: string,
	point: BoardPoint | undefined,
	itemsById: ReadonlyMap<string, BoardItem>,
): BoardRect | null => {
	if (point) return { ...point, width: 0, height: 0 }
	const item = itemsById.get(id)
	return item ? itemBounds(item) : null
}

const boundsOf = (
	object: BoardObject,
	itemsById: ReadonlyMap<string, BoardItem>,
): BoardRect | null => {
	if (object.kind !== "connector") return itemBounds(object)
	const from = endBounds(object.from, object.fromPoint, itemsById)
	const to = endBounds(object.to, object.toPoint, itemsById)
	if (!from || !to) return null
	return unionOf(from, to)
}

const isItem = (object: BoardObject): object is BoardItem =>
	object.kind !== "connector"

const cullBoardObjects = (
	objects: readonly BoardObject[],
	viewport: BoardViewport,
	size: BoardSize,
): CulledBoardObject[] => {
	const area = expandRect(
		visibleBoardRect(viewport, size),
		BOARD_CULL_MARGIN / viewport.zoom,
	)
	const itemsById = new Map(
		objects.filter(isItem).map((item) => [item.id, item]),
	)
	return objects.flatMap((object) => {
		const bounds = boundsOf(object, itemsById)
		return bounds && intersects(bounds, area) ? [{ object, bounds }] : []
	})
}

const gridScreenPitch = (zoom: number) => {
	let pitch = BOARD_GRID_PITCH * zoom
	while (pitch < BOARD_GRID_MIN_SCREEN_PITCH) pitch *= 2
	return pitch
}

const fitZoomOf = (bounds: BoardRect, box: BoardSize, margin: number) =>
	Math.min(
		1,
		(box.width - 2 * margin) / bounds.width,
		(box.height - 2 * margin) / bounds.height,
	)

const centredAt = (
	bounds: BoardRect,
	box: BoardSize,
	zoom: number,
): BoardViewport => ({
	zoom,
	offset: {
		x: (box.width - bounds.width * zoom) / 2 - bounds.x * zoom,
		y: (box.height - bounds.height * zoom) / 2 - bounds.y * zoom,
	},
})

const fitBoardBounds = (
	bounds: BoardRect,
	box: BoardSize,
	margin: number,
): BoardViewport =>
	centredAt(bounds, box, Math.max(0, fitZoomOf(bounds, box, margin)))

const contentBoundsOf = (objects: readonly BoardObject[]) => {
	const itemsById = new Map(
		objects.filter(isItem).map((item) => [item.id, item]),
	)
	return objects.reduce<BoardRect | null>((union, object) => {
		const bounds = boundsOf(object, itemsById)
		if (!bounds) return union
		return union ? unionOf(union, bounds) : bounds
	}, null)
}

const openingViewportOf = (
	objects: readonly BoardObject[],
	box: BoardSize,
	margin: number,
): BoardViewport => {
	const bounds = contentBoundsOf(objects)
	return bounds
		? centredAt(bounds, box, clampZoom(fitZoomOf(bounds, box, margin)))
		: { zoom: 1, offset: { x: box.width / 2, y: box.height / 2 } }
}

export {
	BOARD_CULL_MARGIN,
	BOARD_ZOOM_MAX,
	BOARD_ZOOM_MIN,
	cullBoardObjects,
	expandRect,
	fitBoardBounds,
	gridScreenPitch,
	isAtZoomMax,
	isAtZoomMin,
	isItem,
	itemBounds,
	openingViewportOf,
	panBy,
	pinchZoom,
	zoomAround,
	zoomStepIn,
	zoomStepOut,
}
