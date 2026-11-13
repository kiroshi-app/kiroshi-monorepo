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

const RING_RADIUS = 52
const RING_CELL = { smallest: 20, largest: 30, shareOfArc: 0.78 }
const RING_SIDE = 2 * RING_RADIUS + RING_CELL.largest
const FEWEST_CELLS = 6
const FAN = 760
const FADE_IN = 160
const LAP = 1600
const WAVE_PEAK = 0.14
const WAVE_SWELL = 1.18
const WAVE_LIFT = 4

const RING_EXIT =
	"transition-[opacity,scale,rotate] duration-300 ease-in group-data-[phase=leaving]/launch:scale-[1.3] group-data-[phase=leaving]/launch:rotate-[30deg] group-data-[phase=leaving]/launch:opacity-0"

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
	const fan = launchVariables({
		"--launch-arrive-duration": `${FAN}ms`,
		"--launch-from-opacity": 1,
	})

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
				style={launchVariables({ "--launch-arrive-duration": `${FADE_IN}ms` })}
			>
				{cast.map((agent, index) => {
					const share = index / cast.length
					const angle = share * 2 * Math.PI

					return (
						<div
							className={cn(
								"absolute inset-0",
								!isStill && "animate-launch-arrive",
							)}
							key={agent.id}
							style={{ ...fan, rotate: `${share}turn` }}
						>
							<div
								className={cn("absolute", !isStill && "animate-launch-arrive")}
								style={{
									...fan,
									left: (RING_SIDE - size) / 2,
									top: RING_SIDE / 2 - RING_RADIUS - size / 2,
									rotate: `${-share}turn`,
								}}
							>
								<div
									className={cn(!isStill && "animate-launch-pulse")}
									style={launchVariables({
										"--launch-period": `${LAP}ms`,
										"--launch-delay": `${Math.round(FAN + share * LAP)}ms`,
										"--launch-peak-scale": WAVE_SWELL,
										"--launch-peak-x": `${(Math.sin(angle) * WAVE_LIFT).toFixed(2)}px`,
										"--launch-peak-y": `${(-Math.cos(angle) * WAVE_LIFT).toFixed(2)}px`,
									})}
								>
									<LaunchHexagon
										agent={agent}
										colourTurn={{
											index,
											count: cast.length,
											beat: LAP,
											lead: FAN + (share + WAVE_PEAK + 0.5) * LAP,
										}}
										isStill={isStill}
										size={size}
									/>
								</div>
							</div>
						</div>
					)
				})}
			</div>
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderRing }
