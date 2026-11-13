"use client"

import {
	COLUMN_GAP_RATIO,
	ROW_PITCH_RATIO,
} from "@workspace/ui/components/hive-layout"
import { OUTER } from "@workspace/ui/components/kiroshi-hexagon"
import {
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchCast,
	launchVariables,
	useLaunchStillness,
} from "@workspace/ui/components/launch-loader"
import { cn } from "@workspace/ui/lib/utils"

const HIVE_SIDE = 128
const HIVE_CELL = { flower: 32, beyondFlower: 26 }
const FLOWER_CELLS = 7
const RIPPLE = 2400
const RIPPLE_DIP = 0.14
const RIPPLE_PER_RING = 320
const RIPPLE_PER_CELL = 40
const ARRIVAL_STAGGER = 45
const ARRIVAL_FROM = 0.6

const HIVE_EXIT =
	"transition-[opacity,scale] duration-300 ease-in group-data-[phase=leaving]/launch:scale-150 group-data-[phase=leaving]/launch:opacity-0"

const CELL_EXIT =
	"transition-[scale] duration-300 ease-in group-data-[phase=leaving]/launch:scale-[0.4]"

type HoneycombCell = { column: number; row: number; ring: number }

const RING_WALK = [
	{ column: 1, row: 0 },
	{ column: 0, row: 1 },
	{ column: -1, row: 1 },
	{ column: -1, row: 0 },
	{ column: 0, row: -1 },
	{ column: 1, row: -1 },
]

const honeycombRing = (ring: number): HoneycombCell[] => {
	if (ring === 0) return [{ column: 0, row: 0, ring }]
	let column = 0
	let row = -ring
	return RING_WALK.flatMap((step) =>
		Array.from({ length: ring }, () => {
			const cell = { column, row, ring }
			column += step.column
			row += step.row
			return cell
		}),
	)
}

const honeycomb = (count: number) => {
	const cells: HoneycombCell[] = []
	for (let ring = 0; cells.length < count; ring += 1)
		cells.push(...honeycombRing(ring))
	return cells.slice(0, count)
}

const meanOf = (values: number[]) =>
	values.reduce((sum, value) => sum + value, 0) / values.length

const honeycombPlaces = (count: number, size: number) => {
	const cellHeight = (size * OUTER.halfHeight) / OUTER.halfWidth
	const places = honeycomb(count).map(({ column, row, ring }) => ({
		ring,
		x: column * COLUMN_GAP_RATIO * cellHeight,
		y: (row + column / 2) * ROW_PITCH_RATIO * cellHeight,
	}))
	const middle = {
		x: meanOf(places.map(({ x }) => x)),
		y: meanOf(places.map(({ y }) => y)),
	}
	return places.map(({ ring, x, y }) => ({
		ring,
		x: x - middle.x,
		y: y - middle.y,
	}))
}

const LaunchLoaderHive = ({
	agents = [],
	isLeaving = false,
	isStill: isHeldStill = false,
}: LaunchLoaderProps) => {
	const isStill = useLaunchStillness(isHeldStill)
	const cast = launchCast(agents, FLOWER_CELLS)
	const size =
		cast.length > FLOWER_CELLS ? HIVE_CELL.beyondFlower : HIVE_CELL.flower
	const places = honeycombPlaces(cast.length, size)

	return (
		<LaunchLoaderWindow
			direction="hive"
			exit={HIVE_EXIT}
			isLeaving={isLeaving}
			isStill={isStill}
			side={HIVE_SIDE}
		>
			{cast.map((agent, index) => {
				const { ring, x, y } = places[index]
				const rippleReach = ring * RIPPLE_PER_RING + index * RIPPLE_PER_CELL

				return (
					<div
						className={cn("absolute", !isStill && CELL_EXIT)}
						key={agent.id}
						style={{
							left: HIVE_SIDE / 2 + x - size / 2,
							top: HIVE_SIDE / 2 + y - size / 2,
						}}
					>
						<div
							className={cn(!isStill && "animate-launch-arrive")}
							style={launchVariables({
								"--launch-arrive-delay": `${index * ARRIVAL_STAGGER}ms`,
								"--launch-from-scale": 0,
								"--launch-from-x": `${-x * ARRIVAL_FROM}px`,
								"--launch-from-y": `${-y * ARRIVAL_FROM}px`,
							})}
						>
							<div
								className={cn(!isStill && "animate-launch-pulse")}
								style={launchVariables({
									"--launch-period": `${RIPPLE}ms`,
									"--launch-delay": `${rippleReach - RIPPLE}ms`,
									"--launch-peak-opacity": 0.6,
									"--launch-peak-scale": 0.7,
								})}
							>
								<LaunchHexagon
									agent={agent}
									colourTurn={{
										index,
										count: cast.length,
										beat: RIPPLE,
										lead: RIPPLE * (1 + RIPPLE_DIP) + rippleReach,
									}}
									isStill={isStill}
									size={size}
								/>
							</div>
						</div>
					</div>
				)
			})}
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderHive }
