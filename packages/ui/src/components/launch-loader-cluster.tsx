"use client"

import {
	hiveCellOrigin,
	hiveLayout,
} from "@workspace/ui/components/hive-layout"
import {
	centroidOf,
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchCast,
	launchVariables,
	useLaunchStillness,
} from "@workspace/ui/components/launch-loader"
import { cn } from "@workspace/ui/lib/utils"

const CLUSTER_SIZE = 88
const CLUSTER_CELLS = 3
const HOP = 1500
const HOP_PERIOD = CLUSTER_CELLS * HOP
const ARRIVAL_STAGGER = 80
const ARRIVAL_REACH = 1.6
const FIRST_COLOUR_AFTER = 1200

const CLUSTER_EXIT =
	"transition-[opacity,scale,rotate] duration-300 ease-in group-data-[phase=leaving]/launch:scale-[0.4] group-data-[phase=leaving]/launch:rotate-[60deg] group-data-[phase=leaving]/launch:opacity-0"

const LaunchLoaderCluster = ({
	agents = [],
	isLeaving = false,
	isStill: isHeldStill = false,
}: LaunchLoaderProps) => {
	const isStill = useLaunchStillness(isHeldStill)
	const cast = launchCast(agents.slice(0, CLUSTER_CELLS), CLUSTER_CELLS)
	const { cells } = hiveLayout({ participants: cast, size: CLUSTER_SIZE })
	const pivot = centroidOf(cells.map(({ centre }) => centre))
	const hop = launchVariables({ "--launch-period": `${HOP_PERIOD}ms` })

	return (
		<LaunchLoaderWindow
			direction="cluster"
			exit={CLUSTER_EXIT}
			isLeaving={isLeaving}
			isStill={isStill}
			side={CLUSTER_SIZE}
		>
			<div
				className={cn("absolute inset-0", !isStill && "animate-launch-hop")}
				style={{ ...hop, transformOrigin: `${pivot.x}px ${pivot.y}px` }}
			>
				{cells.map((cell, index) => (
					<div
						className={cn("absolute", !isStill && "animate-launch-arrive")}
						key={cell.id}
						style={{
							...hiveCellOrigin(cell),
							...launchVariables({
								"--launch-arrive-delay": `${index * ARRIVAL_STAGGER}ms`,
								"--launch-from-scale": 0.5,
								"--launch-from-x": `${(cell.centre.x - pivot.x) * ARRIVAL_REACH}px`,
								"--launch-from-y": `${(cell.centre.y - pivot.y) * ARRIVAL_REACH}px`,
							}),
						}}
					>
						<div
							className={cn(!isStill && "animate-launch-hop")}
							style={{
								...hop,
								...launchVariables({ "--launch-turn": "-1turn" }),
							}}
						>
							<LaunchHexagon
								agent={cast[index]}
								colourTurn={{
									index,
									count: CLUSTER_CELLS,
									beat: HOP,
									lead: FIRST_COLOUR_AFTER,
								}}
								isStill={isStill}
								size={cell.side}
							/>
						</div>
					</div>
				))}
			</div>
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderCluster }
