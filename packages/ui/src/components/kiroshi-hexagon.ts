type RoundedHexagon = {
	halfWidth: number
	halfHeight: number
}

type HexagonMetrics = {
	apothem: number
	rounding: number
}

const OUTER: RoundedHexagon = { halfWidth: 200.5, halfHeight: 181.5 }
const INNER: RoundedHexagon = { halfWidth: 134.5, halfHeight: 123.5 }
const COS_30 = Math.cos(Math.PI / 6)
const TAN_30 = Math.tan(Math.PI / 6)
const EDGE_NORMAL = { x: -COS_30, y: 0.5 }
const CORNERS = 6
const TURN = Math.PI / 3

const hexagonMetrics = ({
	halfWidth,
	halfHeight,
}: RoundedHexagon): HexagonMetrics => {
	const apothem = (halfWidth - halfHeight) / (1 / COS_30 - 1)
	return { apothem, rounding: halfHeight - apothem }
}

const hexagonDistance = (x: number, y: number, apothem: number) => {
	let px = Math.abs(x)
	let py = Math.abs(y)
	const fold = 2 * Math.min(EDGE_NORMAL.x * px + EDGE_NORMAL.y * py, 0)
	px -= fold * EDGE_NORMAL.x
	py -= fold * EDGE_NORMAL.y
	const reach = apothem * TAN_30
	const dx = px - Math.min(Math.max(px, -reach), reach)
	const dy = py - apothem
	return Math.hypot(dx, dy) * Math.sign(dy)
}

const hexagonOfWidth = (width: number): RoundedHexagon => ({
	halfWidth: width / 2,
	halfHeight: (OUTER.halfHeight * width) / (OUTER.halfWidth * 2),
})

const isInsideRoundedHexagon = (
	shape: RoundedHexagon,
	x: number,
	y: number,
) => {
	const { apothem, rounding } = hexagonMetrics(shape)
	return hexagonDistance(x, y, apothem) <= rounding
}

const roundedHexagonPath = (shape: RoundedHexagon) => {
	const { apothem, rounding } = hexagonMetrics(shape)
	const reach = apothem / COS_30
	const centre = shape.halfWidth
	const at = (angle: number, radius: number, from: { x: number; y: number }) =>
		`${(from.x + radius * Math.cos(angle)).toFixed(2)} ${(from.y + radius * Math.sin(angle)).toFixed(2)}`
	const corner = (index: number) => ({
		x: centre + reach * Math.cos(index * TURN),
		y: centre + reach * Math.sin(index * TURN),
	})
	const steps = Array.from({ length: CORNERS }, (_, index) => {
		const vertex = corner(index)
		const before = index * TURN - TURN / 2
		const after = before + TURN
		return `${index === 0 ? "M" : "L"} ${at(before, rounding, vertex)} A ${rounding.toFixed(2)} ${rounding.toFixed(2)} 0 0 1 ${at(after, rounding, vertex)}`
	})
	return `${steps.join(" ")} Z`
}

export {
	hexagonOfWidth,
	INNER,
	isInsideRoundedHexagon,
	OUTER,
	type RoundedHexagon,
	roundedHexagonPath,
}
