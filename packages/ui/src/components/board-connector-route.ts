import type {
	BoardPoint,
	BoardRect,
	BoardRouting,
	BoardSide,
} from "@workspace/ui/components/board-view"

type BoardConnectorEnd = {
	rect: BoardRect
	side: BoardSide
}

type BoardRoute = {
	points: BoardPoint[]
	arrow: BoardPoint
}

const BOARD_SIDES: readonly BoardSide[] = ["top", "right", "bottom", "left"]
const BOARD_ROUTE_CLEARANCE = 24
const BOARD_ROUTE_CORNER_RADIUS = 8
const BOARD_ARROW_LENGTH = 10
const BOARD_ARROW_WIDTH = 12
const BEND_COST = BOARD_ROUTE_CLEARANCE * 2
const OFF_CENTRE_BEND_COST = 0.001

const HEADINGS: readonly BoardPoint[] = [
	{ x: 0, y: -1 },
	{ x: 1, y: 0 },
	{ x: 0, y: 1 },
	{ x: -1, y: 0 },
]

const headingOf = (side: BoardSide) => BOARD_SIDES.indexOf(side)

const reverseOf = (heading: number) => (heading + 2) % 4

const anchorOf = ({ rect, side }: BoardConnectorEnd): BoardPoint => {
	const middle = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 }
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

const isBetween = (value: number, low: number, high: number) =>
	low < value && value < high

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

const stubLength = (anchor: BoardPoint, heading: number, other: BoardRect) => {
	const { x, y } = HEADINGS[heading]
	const isFacing =
		x === 0
			? isBetween(anchor.x, other.x, other.x + other.width)
			: isBetween(anchor.y, other.y, other.y + other.height)
	if (!isFacing) return BOARD_ROUTE_CLEARANCE
	const gap =
		x > 0
			? other.x - anchor.x
			: x < 0
				? anchor.x - other.x - other.width
				: y > 0
					? other.y - anchor.y
					: anchor.y - other.y - other.height
	return gap >= 0 && gap < BOARD_ROUTE_CLEARANCE * 2
		? gap / 2
		: BOARD_ROUTE_CLEARANCE
}

const lanesBetween = (
	a: BoardRect,
	b: BoardRect,
	axis: "x" | "y",
	ends: readonly number[],
) => {
	const size = axis === "x" ? "width" : "height"
	const lanes = [
		...ends,
		a[axis] - BOARD_ROUTE_CLEARANCE,
		a[axis] + a[size] + BOARD_ROUTE_CLEARANCE,
		b[axis] - BOARD_ROUTE_CLEARANCE,
		b[axis] + b[size] + BOARD_ROUTE_CLEARANCE,
	]
	if (a[axis] + a[size] < b[axis]) lanes.push((a[axis] + a[size] + b[axis]) / 2)
	if (b[axis] + b[size] < a[axis]) lanes.push((b[axis] + b[size] + a[axis]) / 2)
	return [...new Set(lanes)].sort((first, second) => first - second)
}

const isSamePoint = (a: BoardPoint, b: BoardPoint) => a.x === b.x && a.y === b.y

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

const gridPath = (
	start: BoardPoint,
	startHeading: number,
	end: BoardPoint,
	endHeading: number,
	obstacles: readonly BoardRect[],
) => {
	const xs = lanesBetween(obstacles[0], obstacles[1], "x", [start.x, end.x])
	const ys = lanesBetween(obstacles[0], obstacles[1], "y", [start.y, end.y])
	const pointAt = (at: number) => ({
		x: xs[at % xs.length],
		y: ys[Math.floor(at / xs.length)],
	})
	const neighbourOf = (at: number, heading: number) => {
		const column = (at % xs.length) + HEADINGS[heading].x
		const row = Math.floor(at / xs.length) + HEADINGS[heading].y
		if (column < 0 || column >= xs.length || row < 0 || row >= ys.length)
			return null
		return row * xs.length + column
	}
	const centre = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 }
	const bendAt = (point: BoardPoint) =>
		BEND_COST +
		(Math.abs(point.x - centre.x) + Math.abs(point.y - centre.y)) *
			OFF_CENTRE_BEND_COST
	const stateOf = (at: number, heading: number) => at * 4 + heading
	const startAt = ys.indexOf(start.y) * xs.length + xs.indexOf(start.x)
	const endAt = ys.indexOf(end.y) * xs.length + xs.indexOf(end.x)
	const states = xs.length * ys.length * 4
	const cost = new Array<number>(states).fill(Number.POSITIVE_INFINITY)
	const previous = new Array<number>(states).fill(-1)
	const settled = new Array<boolean>(states).fill(false)
	cost[stateOf(startAt, startHeading)] = 0
	let best = -1
	let bestCost = Number.POSITIVE_INFINITY
	for (;;) {
		let state = -1
		for (let candidate = 0; candidate < states; candidate++)
			if (
				!settled[candidate] &&
				cost[candidate] < (state < 0 ? Number.POSITIVE_INFINITY : cost[state])
			)
				state = candidate
		if (state < 0) break
		settled[state] = true
		const at = Math.floor(state / 4)
		const heading = state % 4
		if (at === endAt && heading !== reverseOf(endHeading)) {
			const total =
				cost[state] + (heading === endHeading ? 0 : bendAt(pointAt(at)))
			if (total < bestCost) {
				best = state
				bestCost = total
			}
		}
		for (const turn of HEADINGS.keys()) {
			const next = turn === reverseOf(heading) ? null : neighbourOf(at, turn)
			if (next === null) continue
			const from = pointAt(at)
			const to = pointAt(next)
			if (obstacles.some((rect) => crossesInside(from, to, rect))) continue
			const reached =
				cost[state] +
				Math.abs(to.x - from.x) +
				Math.abs(to.y - from.y) +
				(turn === heading ? 0 : bendAt(from))
			if (reached < cost[stateOf(next, turn)]) {
				cost[stateOf(next, turn)] = reached
				previous[stateOf(next, turn)] = state
			}
		}
	}
	const path: BoardPoint[] = []
	for (let state = best; state >= 0; state = previous[state])
		path.unshift(pointAt(Math.floor(state / 4)))
	return path
}

const unit = (from: BoardPoint, to: BoardPoint): BoardPoint | null => {
	const length = Math.hypot(to.x - from.x, to.y - from.y)
	return length === 0
		? null
		: { x: (to.x - from.x) / length, y: (to.y - from.y) / length }
}

const elbowPoints = (source: BoardConnectorEnd, target: BoardConnectorEnd) => {
	const sourceAnchor = anchorOf(source)
	const targetAnchor = anchorOf(target)
	const sourceHeading = headingOf(source.side)
	const targetHeading = headingOf(target.side)
	const sourceStub = offset(
		sourceAnchor,
		sourceHeading,
		stubLength(sourceAnchor, sourceHeading, target.rect),
	)
	const targetStub = offset(
		targetAnchor,
		targetHeading,
		stubLength(targetAnchor, targetHeading, source.rect),
	)
	const between = gridPath(
		sourceStub,
		sourceHeading,
		targetStub,
		reverseOf(targetHeading),
		[source.rect, target.rect],
	)
	const middle =
		between.length > 0
			? between
			: [sourceStub, { x: targetStub.x, y: sourceStub.y }, targetStub]
	return simplified([sourceAnchor, ...middle, targetAnchor])
}

const routeConnector = (
	source: BoardConnectorEnd,
	target: BoardConnectorEnd,
	routing: BoardRouting,
): BoardRoute => {
	const points =
		routing === "straight"
			? [anchorOf(source), anchorOf(target)]
			: elbowPoints(source, target)
	const [beforeLast, last] = points.slice(-2)
	return {
		points,
		arrow:
			(beforeLast && last && unit(beforeLast, last)) ??
			HEADINGS[reverseOf(headingOf(target.side))],
	}
}

const sideFacing = (from: BoardPoint, towards: BoardPoint): BoardSide => {
	const dx = towards.x - from.x
	const dy = towards.y - from.y
	if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left"
	return dy > 0 ? "bottom" : "top"
}

const looseEnd = (
	point: BoardPoint,
	towards: BoardPoint,
): BoardConnectorEnd => ({
	rect: { ...point, width: 0, height: 0 },
	side: sideFacing(point, towards),
})

const towardsBy = (from: BoardPoint, to: BoardPoint, by: number) => {
	const direction = unit(from, to) ?? { x: 0, y: 0 }
	return { x: from.x + direction.x * by, y: from.y + direction.y * by }
}

const routePathData = (
	points: readonly BoardPoint[],
	radius = BOARD_ROUTE_CORNER_RADIUS,
) => {
	const commands = points.map((point, index) => {
		const previous = points[index - 1]
		const next = points[index + 1]
		if (!previous) return `M${point.x} ${point.y}`
		if (!next) return `L${point.x} ${point.y}`
		const corner = Math.min(
			radius,
			Math.hypot(point.x - previous.x, point.y - previous.y) / 2,
			Math.hypot(next.x - point.x, next.y - point.y) / 2,
		)
		const before = towardsBy(point, previous, corner)
		const after = towardsBy(point, next, corner)
		return `L${before.x} ${before.y} Q${point.x} ${point.y} ${after.x} ${after.y}`
	})
	return commands.join(" ")
}

const arrowheadPathData = (tip: BoardPoint, direction: BoardPoint) => {
	const back = {
		x: tip.x - direction.x * BOARD_ARROW_LENGTH,
		y: tip.y - direction.y * BOARD_ARROW_LENGTH,
	}
	const half = BOARD_ARROW_WIDTH / 2
	return `M${back.x - direction.y * half} ${back.y + direction.x * half} L${tip.x} ${tip.y} L${back.x + direction.y * half} ${back.y - direction.x * half}`
}

export {
	anchorOf,
	arrowheadPathData,
	BOARD_SIDES,
	type BoardConnectorEnd,
	type BoardRoute,
	looseEnd,
	routeConnector,
	routePathData,
}
