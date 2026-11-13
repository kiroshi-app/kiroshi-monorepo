"use client"

import {
	BRAND_AGENT,
	LaunchHexagon,
	type LaunchLoaderProps,
	LaunchLoaderWindow,
	launchVariables,
	useLaunchStillness,
} from "@workspace/ui/components/launch-loader"
import { cn } from "@workspace/ui/lib/utils"

const SOLO_SIZE = 72
const FLIP_PERIOD = 2600
const ARRIVAL = 640

const SOLO_EXIT =
	"transition-[opacity,scale] duration-300 ease-in group-data-[phase=leaving]/launch:scale-[1.8] group-data-[phase=leaving]/launch:opacity-0"

type LaunchLoaderSoloProps = Omit<LaunchLoaderProps, "agents">

const LaunchLoaderSolo = ({
	isLeaving = false,
	isStill: isHeldStill = false,
}: LaunchLoaderSoloProps) => {
	const isStill = useLaunchStillness(isHeldStill)

	return (
		<LaunchLoaderWindow
			className="perspective-[320px]"
			direction="solo"
			exit={SOLO_EXIT}
			isLeaving={isLeaving}
			isStill={isStill}
			side={SOLO_SIZE}
		>
			<div
				className={cn(!isStill && "animate-launch-arrive")}
				style={launchVariables({
					"--launch-arrive-duration": `${ARRIVAL}ms`,
					"--launch-from-scale": 0.3,
					"--launch-from-rotate": "-120deg",
				})}
			>
				<div
					className={cn(!isStill && "animate-launch-flip")}
					style={launchVariables({
						"--launch-period": `${FLIP_PERIOD}ms`,
						"--launch-delay": `${ARRIVAL}ms`,
					})}
				>
					<LaunchHexagon
						agent={BRAND_AGENT}
						isStill={isStill}
						size={SOLO_SIZE}
					/>
				</div>
			</div>
		</LaunchLoaderWindow>
	)
}

export { LaunchLoaderSolo }
