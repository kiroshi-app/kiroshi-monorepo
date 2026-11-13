"use client"

import {
	BRAND_AGENT,
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchCast,
	launchVariables,
	useLaunchStillness,
} from "@workspace/ui/components/launch-loader"
import { cn } from "@workspace/ui/lib/utils"

const CORE_SIZE = 44
const SATELLITE_SIZE = 16
const LANES = [
	{ radius: 36, period: 5200 },
	{ radius: 48, period: 7800 },
	{ radius: 60, period: 11700 },
]
const LANE_OFFSET = 0.21
const ORBIT_SIDE =
	2 * Math.max(...LANES.map(({ radius }) => radius)) + SATELLITE_SIZE
const FEWEST_SATELLITES = LANES.length
const CORE_ARRIVAL = 560
const LAUNCH_AFTER = 200
const LAUNCH_STAGGER = 50
const COLOUR_BEAT = 2000
const FIRST_COLOUR_AFTER = 1400

const CORE_EXIT =
	"transition-[opacity,scale] delay-100 duration-300 ease-in group-data-[phase=leaving]/launch:scale-150 group-data-[phase=leaving]/launch:opacity-0"

const SATELLITE_EXIT =
	"transition-[opacity,scale] duration-200 ease-in group-data-[phase=leaving]/launch:scale-0 group-data-[phase=leaving]/launch:opacity-0"

const LaunchLoaderOrbit = ({
	agents = [],
	isLeaving = false,
	isStill: isHeldStill = false,
}: LaunchLoaderProps) => {
	const isStill = useLaunchStillness(isHeldStill)
	const cast = launchCast(agents, FEWEST_SATELLITES)

	return (
		<LaunchLoaderWindow
			direction="orbit"
			isLeaving={isLeaving}
			isStill={isStill}
			side={ORBIT_SIDE}
		>
			<div
				className={cn(
					"absolute inset-0 flex items-center justify-center",
					!isStill && CORE_EXIT,
				)}
			>
				<div
					className={cn(!isStill && "animate-launch-arrive")}
					style={launchVariables({
						"--launch-arrive-duration": `${CORE_ARRIVAL}ms`,
						"--launch-from-scale": 0.3,
						"--launch-from-rotate": "-60deg",
					})}
				>
					<LaunchHexagon
						agent={BRAND_AGENT}
						isStill={isStill}
						size={CORE_SIZE}
					/>
				</div>
			</div>
			{cast.map((agent, index) => {
				const lane = index % LANES.length
				const { radius, period } = LANES[lane]
				const inLane = Math.ceil((cast.length - lane) / LANES.length)
				const share =
					Math.floor(index / LANES.length) / inLane + lane * LANE_OFFSET
				const turn = launchVariables({
					"--launch-period": `${period}ms`,
					"--launch-delay": `${Math.round(-share * period)}ms`,
				})

				return (
					<div
						className={cn(
							"absolute inset-0",
							!isStill && "animate-launch-turn",
							!isStill && SATELLITE_EXIT,
						)}
						key={agent.id}
						style={isStill ? { rotate: `${share}turn` } : turn}
					>
						<div
							className={cn("absolute", !isStill && "animate-launch-arrive")}
							style={{
								left: (ORBIT_SIDE - SATELLITE_SIZE) / 2,
								top: ORBIT_SIDE / 2 - radius - SATELLITE_SIZE / 2,
								...launchVariables({
									"--launch-arrive-delay": `${LAUNCH_AFTER + index * LAUNCH_STAGGER}ms`,
									"--launch-from-scale": 0,
									"--launch-from-y": `${radius}px`,
								}),
							}}
						>
							<div
								className={cn(!isStill && "animate-launch-turn")}
								style={
									isStill
										? { rotate: `${-share}turn` }
										: {
												...turn,
												...launchVariables({ "--launch-turn": "-1turn" }),
											}
								}
							>
								<LaunchHexagon
									agent={agent}
									colourTurn={{
										index,
										count: cast.length,
										beat: COLOUR_BEAT,
										lead: FIRST_COLOUR_AFTER,
									}}
									isStill={isStill}
									size={SATELLITE_SIZE}
								/>
							</div>
						</div>
					</div>
				)
			})}
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderOrbit }
