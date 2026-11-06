import type {
	BoardArrowHeadSize,
	BoardPoint,
	BoardRect,
	BoardRouting,
	BoardSide,
} from "@workspace/ui/components/board-view"

type BoardConnectorEnd = {
	rect: BoardRect
	side?: BoardSide
	point?: BoardPoint
}

type BoardSideEnd = {
	rect: BoardRect
	side: BoardSide
}

type BoardObstacles = {
	blocks: readonly BoardRect[]
	titles: readonly BoardRect[]
	frames: readonly BoardRect[]
}

type BoardArrow = {
	source: BoardConnectorEnd
	target: BoardConnectorEnd
	routing: BoardRouting
	bend?: number
}

type BoardRoute = {
	points: BoardPoint[]
	control?: BoardPoint
	arrow: BoardPoint
}

type BoardRouteOptions = {
	bend?: number
	obstacles?: BoardObstacles
	busy?: readonly BoardSideEnd[]
}

type ElbowEnd = {
	start: BoardPoint
	stub: BoardPoint
	heading: number
	preference: number
}

type QueueEntry = readonly [cost: number, state: number]

const BOARD_SIDES: readonly BoardSide[] = ["top", "right", "bottom", "left"]
const BOARD_ARROW_GAP = 8
const SHAPE_CLEARANCE = 48
const FRAME_CLEARANCE = 24
const BOARD_ROUTE_CORNER_RADIUS = 8
const BEND_COST = SHAPE_CLEARANCE
const OFF_CENTRE_BEND_COST = 0.001
const SIDE_PREFERENCE_COST = 0.000001
const SOFT_ZONE_COST = 4
const SHARED_SIDE_COST = SHAPE_CLEARANCE * 2
const CROSSING_SAMPLES = 64
const SECTION_TITLE_INSET = 12
const SECTION_TITLE_HEIGHT = 24
const SECTION_TITLE_PADDING = 16
const SECTION_TITLE_CHARACTER_WIDTH = 8
const NO_OBSTACLES: BoardObstacles = { blocks: [], titles: [], frames: [] }

const BOARD_ARROW_HEADS: Record<
	BoardArrowHeadSize,
	{ length: number; halfWidth: number }
> = {
	small: { length: 7, halfWidth: 4 },
	medium: { length: 10, halfWidth: 6 },
	large: { length: 14, halfWidth: 8 },
}

const HEADINGS: readonly BoardPoint[] = [
	{ x: 0, y: -1 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
]

const headingOf = (side: BoardSide) => BOARD_SIDES.indexOf(side)

const reverseOf = (heading: number) => (heading + 2) % 4

const centreOf = (rect: BoardRect): BoardPoint => ({
	x: rect.x + rect.width / 2,
	y: rect.y + rect.height / 2,
})

const anchorOf = ({ rect, side }: BoardSideEnd): BoardPoint => {
	const middle = centreOf(rect)
	switch (side) {
		case "top":
			return { x: middle.x, y: rect.y }
		case "right":
			return { x: rect.x + rect.width, y: middle.y }
		case "bottom":
			return { x: middle.x, y: rect.y + rect.height }
		case "left":
			return { x: rect.x, y: middle.y }
	}
}

const offset = (point: BoardPoint, heading: number, by: number) => ({
	x: point.x + HEADINGS[heading].x * by,
	y: point.y + HEADINGS[heading].y * by,
})

const unit = (from: BoardPoint, to: BoardPoint): BoardPoint | null => {
	const length = Math.hypot(to.x - from.x, to.y - from.y)
	return length === 0
		? null
		: { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

const along = (from: BoardPoint, direction: BoardPoint, by: number) => ({
	x: from.x + direction.x * by,
	y: from.y + direction.y * by,
})

const distance = (a: BoardPoint, b: BoardPoint) =>
	Math.abs(a.x - b.x) + Math.abs(a.y - b.y)

const isSamePoint = (a: BoardPoint, b: BoardPoint) => a.x === b.x && a.y === b.y

const isSameRect = (a: BoardRect, b: BoardRect) =>
	a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height

const hasArea = (rect: BoardRect) => rect.width > 0 && rect.height > 0

const inflated = (rect: BoardRect, by: number): BoardRect => ({
	x: rect.x - by,
	y: rect.y - by,
	width: rect.width + by * 2,
	height: rect.height + by * 2,
})

const intersects = (a: BoardRect, b: BoardRect) =>
	a.x < b.x + b.width &&
	b.x < a.x + a.width &&
	a.y < b.y + b.height &&
	b.y < a.y + a.height

const spanOf = (rects: readonly BoardRect[]): BoardRect => {
	const left = Math.min(...rects.map((rect) => rect.x))
	const top = Math.min(...rects.map((rect) => rect.y))
	const right = Math.max(...rects.map((rect) => rect.x + rect.width))
	const bottom = Math.max(...rects.map((rect) => rect.y + rect.height))
	return { x: left, y: top, width: right - left, height: bottom - top }
}

const referenceOf = (end: BoardConnectorEnd) =>
	end.point ??
	(end.side ? anchorOf({ rect: end.rect, side: end.side }) : centreOf(end.rect))

const outlineExit = (rect: BoardRect, towards: BoardPoint) => {
	const centre = centreOf(rect)
	const dx = towards.x - centre.x
	const dy = towards.y - centre.y
	const scale = Math.min(
		dx === 0 ? Number.POSITIVE_INFINITY : rect.width / 2 / Math.abs(dx),
		dy === 0 ? Number.POSITIVE_INFINITY : rect.height / 2 / Math.abs(dy),
	)
	return Number.isFinite(scale)
		? { x: centre.x + dx * scale, y: centre.y + dy * scale }
		: centre
}

const lineEndOf = (end: BoardConnectorEnd, towards: BoardPoint) => {
	if (end.point) return end.point
	const outline = end.side
		? anchorOf({ rect: end.rect, side: end.side })
		: outlineExit(end.rect, towards)
	const direction = unit(outline, towards)
	return direction ? along(outline, direction, BOARD_ARROW_GAP) : outline
}

const curveControl = (from: BoardPoint, to: BoardPoint, bend: number) => {
	const chord = unit(from, to) ?? { x: 1, y: 0 }
	return {
		x: (from.x + to.x) / 2 + chord.y * bend * 2,
		y: (from.y + to.y) / 2 - chord.x * bend * 2,
	}
}

const isBetween = (value: number, low: number, high: number) =>
	low < value && value < high

const isInside = (point: BoardPoint, rect: BoardRect) =>
	isBetween(point.x, rect.x, rect.x + rect.width) &&
	isBetween(point.y, rect.y, rect.y + rect.height)

const overlapsOpen = (a1: number, a2: number, b1: number, b2: number) =>
	Math.max(Math.min(a1, a2), b1) < Math.min(Math.max(a1, a2), b2) ||
	(a1 === a2 && isBetween(a1, b1, b2))

const crossesInside = (a: BoardPoint, b: BoardPoint, rect: BoardRect) => {
	const right = rect.x + rect.width
	const bottom = rect.y + rect.height
	if (a.y === b.y)
		return (
			isBetween(a.y, rect.y, bottom) && overlapsOpen(a.x, b.x, rect.x, right)
		)
	return isBetween(a.x, rect.x, right) && overlapsOpen(a.y, b.y, rect.y, bottom)
}

const runsAlongFrame = (a: BoardPoint, b: BoardPoint, frame: BoardRect) => {
	const isHorizontal = a.y === b.y
	const edges = isHorizontal
		? [frame.y, frame.y + frame.height]
		: [frame.x, frame.x + frame.width]
	const level = isHorizontal ? a.y : a.x
	const span = isHorizontal
		? [frame.x - FRAME_CLEARANCE, frame.x + frame.width + FRAME_CLEARANCE]
		: [frame.y - FRAME_CLEARANCE, frame.y + frame.height + FRAME_CLEARANCE]
	return (
		edges.some((edge) => Math.abs(level - edge) < FRAME_CLEARANCE) &&
		(isHorizontal
			? overlapsOpen(a.x, b.x, span[0], span[1])
			: overlapsOpen(a.y, b.y, span[0], span[1]))
	)
}

const isCollinear = (a: BoardPoint, b: BoardPoint, c: BoardPoint) =>
	(a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)

const simplified = (points: readonly BoardPoint[]) =>
	points.reduce<BoardPoint[]>((kept, point) => {
		const last = kept.at(-1)
		if (last && isSamePoint(last, point)) return kept
		const beforeLast = kept.at(-2)
		if (last && beforeLast && isCollinear(beforeLast, last, point))
			return [...kept.slice(0, -1), point]
		return [...kept, point]
	}, [])

const distanceAhead = (
	from: BoardPoint,
	heading: number,
	blocks: readonly BoardRect[],
) => {
	const { x, y } = HEADINGS[heading]
	const distances = blocks.flatMap((rect) => {
		const isInLine =
			x === 0
				? isBetween(from.x, rect.x, rect.x + rect.width)
				: isBetween(from.y, rect.y, rect.y + rect.height)
		if (!isInLine) return []
		const distance =
			x > 0
				? rect.x - from.x
				: x < 0
					? from.x - rect.x - rect.width
					: y > 0
						? rect.y - from.y
						: from.y - rect.y - rect.height
		return distance >= 0 ? [distance] : []
	})
	return Math.min(Number.POSITIVE_INFINITY, ...distances)
}

const nearestSideOf = (rect: BoardRect, point: BoardPoint): BoardSide => {
	const distances: Record<BoardSide, number> = {
		top: point.y - rect.y,
		right: rect.x + rect.width - point.x,
		bottom: rect.y + rect.height - point.y,
		left: point.x - rect.x,
	}
	return BOARD_SIDES.reduce((nearest, side) =>
		distances[side] < distances[nearest] ? side : nearest,
	)
}

const elbowEndsOf = (
	end: BoardConnectorEnd,
	blocks: readonly BoardRect[],
	busy: readonly BoardSideEnd[],
): ElbowEnd[] => {
	const sides = end.point
		? [end.side ?? nearestSideOf(end.rect, end.point)]
		: end.side
			? [end.side]
			: BOARD_SIDES
	return sides.map((side) => {
		const heading = headingOf(side)
		const anchor = end.point ?? anchorOf({ rect: end.rect, side })
		const ahead = distanceAhead(anchor, heading, blocks)
		const stubLength = Math.min(SHAPE_CLEARANCE, ahead / 2)
		const gap = end.point ? 0 : Math.min(BOARD_ARROW_GAP, stubLength / 2)
		const isShared = busy.some(
			(taken) => taken.side === side && isSameRect(taken.rect, end.rect),
		)
		return {
			start: offset(anchor, heading, gap),
			stub: offset(anchor, heading, stubLength),
			heading,
			preference:
				heading * SIDE_PREFERENCE_COST + (isShared ? SHARED_SIDE_COST : 0),
		}
	})
}

const lanesOf = (
	axis: "x" | "y",
	ends: readonly ElbowEnd[],
	source: BoardRect,
	target: BoardRect,
	blocks: readonly BoardRect[],
	frames: readonly BoardRect[],
) => {
	const size = axis === "x" ? "width" : "height"
	const around = (rect: BoardRect, by: number) => [
		rect[axis] - by,
		rect[axis] + rect[size] + by,
	]
	const lanes = [
		...ends.map(({ stub }) => stub[axis]),
		...blocks.flatMap((rect) => around(rect, SHAPE_CLEARANCE)),
		...frames.flatMap((rect) => around(rect, FRAME_CLEARANCE)),
	]
	if (source[axis] + source[size] < target[axis])
		lanes.push((source[axis] + source[size] + target[axis]) / 2)
	if (target[axis] + target[size] < source[axis])
		lanes.push((target[axis] + target[size] + source[axis]) / 2)
	return [...new Set(lanes)].sort((first, second) => first - second)
}

const pushEntry = (queue: QueueEntry[], entry: QueueEntry) => {
	queue.push(entry)
	let at = queue.length - 1
	while (at > 0) {
		const parent = (at - 1) >> 1
		if (queue[parent][0] <= queue[at][0]) return
		;[queue[parent], queue[at]] = [queue[at], queue[parent]]
		at = parent
	}
}

const popEntry = (queue: QueueEntry[]) => {
	const top = queue[0]
	const last = queue.pop() as QueueEntry
	if (queue.length === 0) return top
	queue[0] = last
	let at = 0
	for (;;) {
		const left = at * 2 + 1
		let least = at
		for (const child of [left, left + 1])
			if (child < queue.length && queue[child][0] < queue[least][0])
				least = child
		if (least === at) return top
		;[queue[least], queue[at]] = [queue[at], queue[least]]
		at = least
	}
}

const elbowPoints = (
	source: BoardConnectorEnd,
	target: BoardConnectorEnd,
	obstacles: BoardObstacles,
	busy: readonly BoardSideEnd[],
) => {
	const region = inflated(
		spanOf([source.rect, target.rect]),
		SHAPE_CLEARANCE * 2,
	)
	const points = [source.point, target.point].filter(
		(point): point is BoardPoint => point !== undefined,
	)
	const isInTheWay = (rect: BoardRect) =>
		hasArea(rect) &&
		intersects(rect, region) &&
		!points.some((point) => isInside(point, rect))
	const blocks = [source.rect, target.rect, ...obstacles.blocks].filter(
		(rect, index, all) =>
			isInTheWay(rect) &&
			all.findIndex((other) => isSameRect(other, rect)) === index,
	)
	const walls = [...blocks, ...obstacles.titles.filter(isInTheWay)]
	const frames = obstacles.frames.filter((rect) => intersects(rect, region))
	const softZones = blocks.map((rect) => inflated(rect, SHAPE_CLEARANCE))
	const sourceEnds = elbowEndsOf(source, walls, busy)
	const targetEnds = elbowEndsOf(target, walls, busy)
	const ends = [...sourceEnds, ...targetEnds]
	const xs = lanesOf("x", ends, source.rect, target.rect, blocks, frames)
	const ys = lanesOf("y", ends, source.rect, target.rect, blocks, frames)
	const nodeOf = ({ x, y }: BoardPoint) =>
		ys.indexOf(y) * xs.length + xs.indexOf(x)
	const pointAt = (node: number) => ({
		x: xs[node % xs.length],
		y: ys[Math.floor(node / xs.length)],
	})
	const neighbourOf = (node: number, heading: number) => {
		const column = (node % xs.length) + HEADINGS[heading].x
		const row = Math.floor(node / xs.length) + HEADINGS[heading].y
		if (column < 0 || column >= xs.length || row < 0 || row >= ys.length)
			return null
		return row * xs.length + column
	}
	const centre = {
		x: (centreOf(source.rect).x + centreOf(target.rect).x) / 2,
		y: (centreOf(source.rect).y + centreOf(target.rect).y) / 2,
	}
	const bendAt = (point: BoardPoint) =>
		BEND_COST + distance(point, centre) * OFF_CENTRE_BEND_COST
	const legCost = (from: BoardPoint, to: BoardPoint) => {
		const isSoft =
			softZones.some((zone) => crossesInside(from, to, zone)) ||
			frames.some((frame) => runsAlongFrame(from, to, frame))
		return distance(from, to) * (isSoft ? 1 + SOFT_ZONE_COST : 1)
	}
	const stateOf = (node: number, heading: number) => node * 4 + heading
	const states = xs.length * ys.length * 4
	const cost = new Array<number>(states).fill(Number.POSITIVE_INFINITY)
	const previous = new Array<number>(states).fill(-1)
	const settled = new Array<boolean>(states).fill(false)
	const queue: QueueEntry[] = []
	for (const end of sourceEnds) {
		const state = stateOf(nodeOf(end.stub), end.heading)
		const reached = distance(end.start, end.stub) + end.preference
		if (reached < cost[state]) {
			cost[state] = reached
			pushEntry(queue, [reached, state])
		}
	}
	let best: { state: number; end: ElbowEnd } | null = null
	let bestCost = Number.POSITIVE_INFINITY
	while (queue.length > 0) {
		const [reached, state] = popEntry(queue)
		if (settled[state] || reached > cost[state]) continue
		settled[state] = true
		const node = Math.floor(state / 4)
		const heading = state % 4
		for (const end of targetEnds) {
			const inward = reverseOf(end.heading)
			if (nodeOf(end.stub) !== node || heading === end.heading) continue
			const total =
				reached +
				(heading === inward ? 0 : bendAt(pointAt(node))) +
				distance(end.stub, end.start) +
				end.preference
			if (total < bestCost) {
				best = { state, end }
				bestCost = total
			}
		}
		for (const turn of HEADINGS.keys()) {
			const next = turn === reverseOf(heading) ? null : neighbourOf(node, turn)
			if (next === null) continue
			const from = pointAt(node)
			const to = pointAt(next)
			if (walls.some((rect) => crossesInside(from, to, rect))) continue
			const total =
				reached + legCost(from, to) + (turn === heading ? 0 : bendAt(from))
			if (total < cost[stateOf(next, turn)]) {
				cost[stateOf(next, turn)] = total
				previous[stateOf(next, turn)] = state
				pushEntry(queue, [total, stateOf(next, turn)])
			}
		}
	}
	if (!best) {
		const [first] = sourceEnds
		const [last] = targetEnds
		return simplified([
			first.start,
			first.stub,
			{ x: last.stub.x, y: first.stub.y },
			last.stub,
			last.start,
		])
	}
	const path: BoardPoint[] = []
	let firstState = best.state
	for (let state = best.state; state >= 0; state = previous[state]) {
		path.unshift(pointAt(Math.floor(state / 4)))
		firstState = state
	}
	const start = sourceEnds.find(
		(end) =>
			nodeOf(end.stub) === Math.floor(firstState / 4) &&
			end.heading === firstState % 4,
	) as ElbowEnd
	return simplified([start.start, ...path, best.end.start])
}

const sideFacing = (from: BoardPoint, towards: BoardPoint): BoardSide => {
	const dx = towards.x - from.x
	const dy = towards.y - from.y
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
	return dy > 0 ? "bottom" : "top"
}

const facing = (
	end: BoardConnectorEnd,
	other: BoardConnectorEnd,
): BoardConnectorEnd =>
	end.side || hasArea(end.rect) || !end.point
		? end
		: { ...end, side: sideFacing(end.point, referenceOf(other)) }

const routeConnector = (
	source: BoardConnectorEnd,
	target: BoardConnectorEnd,
	routing: BoardRouting,
	{ bend = 0, obstacles = NO_OBSTACLES, busy = [] }: BoardRouteOptions = {},
): BoardRoute => {
	const isLoose = !hasArea(source.rect) && !hasArea(target.rect)
	if (routing === "elbow" && !isLoose) {
		const points = elbowPoints(
			facing(source, target),
			facing(target, source),
			obstacles,
			busy,
		)
		const [beforeLast, last] = points.slice(-2)
		return {
			points,
			arrow: unit(beforeLast, last) ?? HEADINGS[2],
		}
	}
	const from = lineEndOf(source, referenceOf(target))
	const to = lineEndOf(target, referenceOf(source))
	const control = bend === 0 ? undefined : curveControl(from, to, bend)
	return {
		points: [from, to],
		...(control ? { control } : {}),
		arrow: unit(control ?? from, to) ?? HEADINGS[1],
	}
}

const routeConnectors = (
	arrows: readonly BoardArrow[],
	obstacles: BoardObstacles,
) => {
	const busy: BoardSideEnd[] = []
	const routes: BoardRoute[] = []
	for (const { source, target, routing, bend } of arrows) {
		const route = routeConnector(source, target, routing, {
			bend,
			obstacles,
			busy,
		})
		const tips = [route.points[0], route.points.at(-1) as BoardPoint]
		;[source, target].forEach((end, index) => {
			if (hasArea(end.rect) && !end.point)
				busy.push({
					rect: end.rect,
					side: nearestSideOf(end.rect, tips[index]),
				})
		})
		routes.push(route)
	}
	return routes
}

const looseEnd = (
	point: BoardPoint,
	towards: BoardPoint,
): BoardConnectorEnd => ({
	rect: { ...point, width: 0, height: 0 },
	side: sideFacing(point, towards),
	point,
})

const exactPointOf = (rect: BoardRect, anchor: BoardPoint) => ({
	x: rect.x + rect.width * anchor.x,
	y: rect.y + rect.height * anchor.y,
})

const sectionTitleBox = (rect: BoardRect, title: string): BoardRect => ({
	x: rect.x + SECTION_TITLE_INSET,
	y: rect.y + SECTION_TITLE_INSET,
	width: Math.min(
		rect.width - SECTION_TITLE_INSET * 2,
		SECTION_TITLE_PADDING + title.length * SECTION_TITLE_CHARACTER_WIDTH,
	),
	height: SECTION_TITLE_HEIGHT,
})

const towardsBy = (from: BoardPoint, to: BoardPoint, by: number) =>
	along(from, unit(from, to) ?? { x: 0, y: 0 }, by)

const rounded = (value: number) => Math.round(value * 100) / 100

const pointData = ({ x, y }: BoardPoint) => `${rounded(x)} ${rounded(y)}`

const routePathData = (
	{ points, control }: Pick<BoardRoute, "points" | "control">,
	radius = BOARD_ROUTE_CORNER_RADIUS,
) => {
	if (control && points.length === 2)
		return `M${pointData(points[0])} Q${pointData(control)} ${pointData(points[1])}`
	const commands = points.map((point, index) => {
		const previous = points[index - 1]
		const next = points[index + 1]
		if (!previous) return `M${pointData(point)}`
		if (!next) return `L${pointData(point)}`
		const corner = Math.min(
			radius,
			Math.hypot(point.x - previous.x, point.y - previous.y) / 2,
			Math.hypot(next.x - point.x, next.y - point.y) / 2,
		)
		const before = towardsBy(point, previous, corner)
		const after = towardsBy(point, next, corner)
		return `L${pointData(before)} Q${pointData(point)} ${pointData(after)}`
	})
	return commands.join(" ")
}

const pointAlong = (
	{ points, control }: Pick<BoardRoute, "points" | "control">,
	fraction: number,
): BoardPoint => {
	if (control && points.length === 2) {
		const [from, to] = points
		const rest = 1 - fraction
		return {
			x:
				rest * rest * from.x +
				2 * rest * fraction * control.x +
				fraction ** 2 * to.x,
			y:
				rest * rest * from.y +
				2 * rest * fraction * control.y +
				fraction ** 2 * to.y,
		}
	}
	const legs = points.slice(1).map((to, index) => ({
		from: points[index],
		to,
		length: Math.hypot(to.x - points[index].x, to.y - points[index].y),
	}))
	let left = legs.reduce((total, { length }) => total + length, 0) * fraction
	for (const { from, to, length } of legs) {
		if (left <= length) return towardsBy(from, to, left)
		left -= length
	}
	return points.at(-1) ?? { x: 0, y: 0 }
}

const crossedRects = (
	route: Pick<BoardRoute, "points" | "control">,
	rects: readonly BoardRect[],
) => {
	const hull = [...route.points, ...(route.control ? [route.control] : [])]
	const area = inflated(
		spanOf(hull.map((point) => ({ ...point, width: 0, height: 0 }))),
		1,
	)
	const samples = Array.from({ length: CROSSING_SAMPLES + 1 }, (_, step) =>
		pointAlong(route, step / CROSSING_SAMPLES),
	)
	return rects.filter(
		(rect) =>
			intersects(rect, area) && samples.some((point) => isInside(point, rect)),
	)
}

const arrowheadPathData = (
	tip: BoardPoint,
	direction: BoardPoint,
	size: BoardArrowHeadSize = "medium",
) => {
	const { length, halfWidth } = BOARD_ARROW_HEADS[size]
	const back = along(tip, direction, -length)
	const wing = { x: -direction.y * halfWidth, y: direction.x * halfWidth }
	return `M${pointData({ x: back.x + wing.x, y: back.y + wing.y })} L${pointData(tip)} L${pointData({ x: back.x - wing.x, y: back.y - wing.y })}`
}

export {
	anchorOf,
	arrowheadPathData,
	BOARD_ARROW_GAP,
	BOARD_SIDES,
	type BoardArrow,
	type BoardConnectorEnd,
	type BoardObstacles,
	type BoardRoute,
	crossedRects,
	curveControl,
	exactPointOf,
	lineEndOf,
	looseEnd,
	pointAlong,
	routeConnector,
	routeConnectors,
	routePathData,
	sectionTitleBox,
}
