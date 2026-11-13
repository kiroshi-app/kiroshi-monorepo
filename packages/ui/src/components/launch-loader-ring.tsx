"use client"

import {
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchCast,
	launchVariables,
	useLaunchStillness,
} from "@workspace/ui/components/launch-loader"
import { cn } from "@workspace/ui/lib/utils"

const RING_RADIUS = 40
const RING_CELL = { smallest: 16, largest: 28, shareOfArc: 0.78 }
const RING_SIDE = 2 * RING_RADIUS + RING_CELL.largest
const FEWEST_CELLS = 6
const LAP = 1600
const WAVE_PEAK = 0.14
const ARRIVAL_SPREAD = 360
const SWIRL = 720

const RING_EXIT =
	"transition-[opacity,scale,rotate] duration-300 ease-in group-data-[phase=leaving]/launch:scale-[0.2] group-data-[phase=leaving]/launch:rotate-90 group-data-[phase=leaving]/launch:opacity-0"

const ringCellSize = (count: number) =>
	Math.round(
		Math.min(
			Math.max(
				((2 * Math.PI * RING_RADIUS) / count) * RING_CELL.shareOfArc,
				RING_CELL.smallest,
			),
			RING_CELL.largest,
		),
	)

const LaunchLoaderRing = ({
	agents = [],
	isLeaving = false,
	isStill: isHeldStill = false,
}: LaunchLoaderProps) => {
	const isStill = useLaunchStillness(isHeldStill)
	const cast = launchCast(agents, FEWEST_CELLS)
	const size = ringCellSize(cast.length)

	return (
		<LaunchLoaderWindow
			direction="ring"
			exit={RING_EXIT}
			isLeaving={isLeaving}
			isStill={isStill}
			side={RING_SIDE}
		>
			<div
				className={cn("absolute inset-0", !isStill && "animate-launch-arrive")}
				style={launchVariables({
					"--launch-arrive-duration": `${SWIRL}ms`,
					"--launch-from-scale": 1,
					"--launch-from-rotate": "-90deg",
				})}
			>
				{cast.map((agent, index) => {
					const share = index / cast.length
					const x = RING_RADIUS * Math.sin(share * 2 * Math.PI)
					const y = -RING_RADIUS * Math.cos(share * 2 * Math.PI)

					return (
						<div
							className={cn("absolute", !isStill && "animate-launch-arrive")}
							key={agent.id}
							style={{
								left: RING_SIDE / 2 + x - size / 2,
								top: RING_SIDE / 2 + y - size / 2,
								...launchVariables({
									"--launch-arrive-delay": `${Math.round(share * ARRIVAL_SPREAD)}ms`,
									"--launch-from-scale": 0.2,
									"--launch-from-x": `${-x}px`,
									"--launch-from-y": `${-y}px`,
								}),
							}}
						>
							<div
								className={cn(!isStill && "animate-launch-pulse")}
								style={launchVariables({
									"--launch-period": `${LAP}ms`,
									"--launch-delay": `${Math.round((share - 1) * LAP)}ms`,
									"--launch-rest-opacity": 0.4,
									"--launch-rest-scale": 0.84,
									"--launch-peak-scale": 1.1,
								})}
							>
								<LaunchHexagon
									agent={agent}
									colourTurn={{
										index,
										count: cast.length,
										beat: LAP,
										lead: (share + WAVE_PEAK + 0.5) * LAP,
									}}
									isStill={isStill}
									size={size}
								/>
							</div>
						</div>
					)
				})}
			</div>
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderRing }
