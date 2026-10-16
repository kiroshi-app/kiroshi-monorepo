import {
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

const HIVE_DEFAULT_SIZE = 40

const ARTBOARD_SIZE = 96

const CELL_LIMIT = 3

const COLUMN_GAP_RATIO = 0.94

const ROW_PITCH_RATIO = 1.087

const CELL_HEIGHT_RATIO = 0.4775

const COUNTER_FONT_RATIO = { small: 0.4605, large: 0.3589 }

const CAP_CENTRE_RATIO = 0.36

const FILL_ORDER = [
	{ column: 0, row: 0 },
	{ column: 1, row: 0.5 },
	{ column: 0, row: 1 },
]

type HiveParticipant = { id: string; isPerson?: boolean; working?: boolean }

type HiveLayoutInput = { participants: HiveParticipant[]; size: number }

type HivePoint = { x: number; y: number }

type HiveCell = {
	id: string
	centre: HivePoint
	side: number
	shape: "hexagon" | "circle"
}

type HiveOverflow = {
	centre: HivePoint
	side: number
	path: string
	hiddenCount: number
	fontSize: number
	baseline: number
}

type HiveLayout = {
	cells: HiveCell[]
	hexagonPath: string
	overflow: HiveOverflow | null
}

const middleOf = (values: number[]) =>
	(Math.min(...values) + Math.max(...values)) / 2

const clusterCentres = (count: number, cellHeight: number, size: number) => {
	const centres = FILL_ORDER.slice(0, count).map(({ column, row }) => ({
		x: column * COLUMN_GAP_RATIO * cellHeight,
		y: row * ROW_PITCH_RATIO * cellHeight,
	}))
	const shiftX = size / 2 - middleOf(centres.map(({ x }) => x))
	const shiftY = size / 2 - middleOf(centres.map(({ y }) => y))
	return centres.map(
		({ x, y }): HivePoint => ({ x: x + shiftX, y: y + shiftY }),
	)
}

const counterFontRatio = (size: number) => {
	const progress = Math.min(
		Math.max(
			(size - HIVE_DEFAULT_SIZE) / (ARTBOARD_SIZE - HIVE_DEFAULT_SIZE),
			0,
		),
		1,
	)
	return (
		COUNTER_FONT_RATIO.small +
		(COUNTER_FONT_RATIO.large - COUNTER_FONT_RATIO.small) * progress
	)
}

const workingFirst = (participants: HiveParticipant[]) => [
	...participants.filter(({ working }) => working),
	...participants.filter(({ working }) => !working),
]

const hiveCellOrigin = ({ centre, side }: HiveCell | HiveOverflow) => ({
	left: centre.x - side / 2,
	top: centre.y - side / 2,
})

const hiveLayout = ({ participants, size }: HiveLayoutInput): HiveLayout => {
	const cellHeight = CELL_HEIGHT_RATIO * size
	const scale = cellHeight / (OUTER.halfHeight * 2)
	const hexagon = {
		halfWidth: OUTER.halfWidth * scale,
		halfHeight: OUTER.halfHeight * scale,
	}
	const hexagonPath = roundedHexagonPath(hexagon)
	const hexagonSide = hexagon.halfWidth * 2
	const centres = clusterCentres(
		Math.min(participants.length, CELL_LIMIT),
		cellHeight,
		size,
	)
	const isOverflowing = participants.length > CELL_LIMIT
	const shown = workingFirst(participants).slice(
		0,
		isOverflowing ? CELL_LIMIT - 1 : CELL_LIMIT,
	)
	const fontSize = hexagon.halfHeight * 2 * counterFontRatio(size)
	return {
		cells: shown.map(({ id, isPerson }, index) => ({
			id,
			centre: centres[index],
			side: isPerson ? hexagon.halfHeight * 2 : hexagonSide,
			shape: isPerson ? "circle" : "hexagon",
		})),
		hexagonPath,
		overflow: isOverflowing
			? {
					centre: centres[CELL_LIMIT - 1],
					side: hexagonSide,
					path: hexagonPath,
					hiddenCount: participants.length - shown.length,
					fontSize,
					baseline: hexagon.halfWidth + fontSize * CAP_CENTRE_RATIO,
				}
			: null,
	}
}

export {
	CAP_CENTRE_RATIO,
	HIVE_DEFAULT_SIZE,
	type HiveCell,
	type HiveLayout,
	type HiveLayoutInput,
	type HiveOverflow,
	type HiveParticipant,
	hiveCellOrigin,
	hiveLayout,
}
