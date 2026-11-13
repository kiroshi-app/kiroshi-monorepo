import {
	type ComponentProps,
	type CSSProperties,
	useEffect,
	useEffectEvent,
	useRef,
} from "react"
import { useTranslation } from "react-i18next"

import { BRAND_NAME } from "@workspace/ui/components/app-icon-mark"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { companionField } from "@workspace/ui/components/companion-avatar"
import { DitheredField } from "@workspace/ui/components/dithered-field-avatar"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import {
	hiveCellOrigin,
	hiveLayout,
} from "@workspace/ui/components/hive-layout"
import { AvatarFrame } from "@workspace/ui/components/initials-avatar"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"
import { usePrefersReducedMotion } from "@workspace/ui/hooks/use-prefers-reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const BOOT_MARK_SIZE = 96
const CLUSTER_SIZE = 88
const CLUSTER_CELLS = 3
const HOP = 1500
const HOPS_PER_PERIOD = 6
const HOP_PERIOD = HOPS_PER_PERIOD * HOP
const HOP_TURNS = HOPS_PER_PERIOD / CLUSTER_CELLS
const ARRIVAL_STAGGER = 80
const ARRIVAL_REACH = 1.6
const FIRST_COLOUR_AFTER = 1200
const COLOUR_TURNS = 12
const INK = "var(--foreground)"
const INK_GROUND =
	"color-mix(in oklab, var(--foreground) 12%, var(--secondary))"

const CLUSTER_EXIT =
	"transition-[opacity,scale,rotate] duration-300 ease-in group-data-[phase=leaving]/launch:scale-50 group-data-[phase=leaving]/launch:rotate-[60deg] group-data-[phase=leaving]/launch:opacity-0"

const STILL_EXIT =
	"transition-opacity duration-150 group-data-[phase=leaving]/launch:opacity-0"

type AppBootAgent = { id: string; name: string; hue?: number | null }

type LaunchVariables = Record<`--launch-${string}`, string | number>

type LaunchPoint = { x: number; y: number }

const launchVariables = (variables: LaunchVariables) =>
	variables as CSSProperties

const clusterCast = (agents: AppBootAgent[]) => {
	const known = agents.slice(0, CLUSTER_CELLS)
	const inkCells = Array.from(
		{ length: CLUSTER_CELLS - known.length },
		(_, index): AppBootAgent => ({
			id: `ink-cell-${index}`,
			name: `${BRAND_NAME} ${index}`,
		}),
	)
	return [...known, ...inkCells]
}

const centroidOf = (points: LaunchPoint[]): LaunchPoint => ({
	x: points.reduce((sum, { x }) => sum + x, 0) / points.length,
	y: points.reduce((sum, { y }) => sum + y, 0) / points.length,
})

const hopVariables = (turns: number) =>
	launchVariables({
		"--launch-period": `${HOP_PERIOD}ms`,
		"--launch-turn": `${turns}turn`,
	})

const colourTurnVariables = (index: number) =>
	launchVariables({
		"--launch-lit-period": `${COLOUR_TURNS * HOP}ms`,
		"--launch-lit-delay": `${Math.round(FIRST_COLOUR_AFTER + Math.round((index * COLOUR_TURNS) / CLUSTER_CELLS) * HOP)}ms`,
	})

type ClusterHexagonProps = {
	agent: AppBootAgent
	index: number
	size: number
	isStill: boolean
}

const ClusterHexagon = ({
	agent,
	index,
	size,
	isStill,
}: ClusterHexagonProps) => {
	const hue = agent.hue ?? undefined
	const takesItsColour = !isStill && hue !== undefined

	return (
		<span
			className="relative flex"
			style={takesItsColour ? colourTurnVariables(index) : undefined}
		>
			<AvatarFrame
				overlay={<OutlinedHexagon fill="none" side={size} />}
				shape="hexagon"
				size={size}
				slot="app-boot-hexagon"
			>
				<DitheredField
					field={companionField(agent.name)}
					ink={INK}
					name={agent.name}
					size={size}
					state={isStill ? "idle" : "thinking"}
					surface={INK_GROUND}
				/>
			</AvatarFrame>
			{takesItsColour ? (
				<span
					className="absolute inset-0 flex animate-launch-lit"
					data-slot="app-boot-colour"
				>
					<BotIdentityAvatar hue={hue} name={agent.name} size={size} working />
				</span>
			) : null}
		</span>
	)
}

type AppBootScreenProps = Omit<ComponentProps<"div">, "children"> & {
	agents?: AppBootAgent[]
	isExiting?: boolean
	onExitComplete?: () => void
}

const AppBootScreen = ({
	agents = [],
	isExiting = false,
	onExitComplete,
	className,
	...props
}: AppBootScreenProps) => {
	const { t } = useTranslation("common")
	const isStill = usePrefersReducedMotion()
	const content = useRef<HTMLDivElement>(null)
	const reportExitComplete = useEffectEvent(() => onExitComplete?.())
	const status = t("boot.status")
	const cast = clusterCast(agents)
	const { cells } = hiveLayout({ participants: cast, size: CLUSTER_SIZE })
	const pivot = centroidOf(cells.map(({ centre }) => centre))

	useEffect(() => {
		if (!isExiting) return
		let isCurrentExit = true
		const exitTransitions = (
			content.current?.getAnimations({ subtree: true }) ?? []
		).filter((animation) => animation instanceof CSSTransition)
		Promise.allSettled(exitTransitions.map(({ finished }) => finished)).then(
			() => {
				if (isCurrentExit) reportExitComplete()
			},
		)
		return () => {
			isCurrentExit = false
		}
	}, [isExiting])

	return (
		<FullWindowLayout
			className={cn("group/launch", className)}
			data-phase={isExiting ? "leaving" : "running"}
			data-slot="app-boot-screen"
			data-still={isStill ? "" : undefined}
			{...props}
		>
			<FullWindowContent className={cn(isStill && STILL_EXIT)} ref={content}>
				<div
					aria-hidden
					className={cn(
						"pointer-events-none relative",
						!isStill && CLUSTER_EXIT,
					)}
					data-slot="app-boot-stage"
					style={{ width: CLUSTER_SIZE, height: CLUSTER_SIZE }}
				>
					<div
						className={cn(
							"absolute inset-0",
							!isStill && "animate-launch-step",
						)}
						style={{
							...hopVariables(HOP_TURNS),
							transformOrigin: `${pivot.x}px ${pivot.y}px`,
						}}
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
									className={cn(!isStill && "animate-launch-step")}
									style={hopVariables(-HOP_TURNS)}
								>
									<ClusterHexagon
										agent={cast[index]}
										index={index}
										isStill={isStill}
										size={cell.side}
									/>
								</div>
							</div>
						))}
					</div>
				</div>
				{isStill ? (
					<p className="mt-6 text-muted-foreground text-sm" role="status">
						{status}
					</p>
				) : (
					<span className="sr-only" role="status">
						{status}
					</span>
				)}
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export { type AppBootAgent, AppBootScreen, BOOT_MARK_SIZE }
