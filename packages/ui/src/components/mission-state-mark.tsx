import type { ComponentPropsWithRef, ReactNode } from "react"

import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import { cn } from "@workspace/ui/lib/utils"

type MissionStateMarkSize = 12 | 14

const MARK_SIZE = {
	12: "size-3!",
	14: "size-3.5!",
} as const satisfies Record<MissionStateMarkSize, string>

const MARK_TONE = {
	waiting: "text-mission-glyph-waiting",
	failed: "text-mission-glyph-failed",
	ready: "text-success",
	working: "text-soft-foreground",
	waiting_agent: "text-muted-foreground",
} as const satisfies Record<BotMissionState, string>

const CUT_OUT = "stroke-mission-mark-cut-out"

const Disc = () => <circle cx="6" cy="6" fill="currentColor" r="6" />

type RingProps = {
	isDashed?: boolean
}

const Ring = ({ isDashed = false }: RingProps) => (
	<circle
		cx="6"
		cy="6"
		r="5.25"
		stroke="currentColor"
		strokeDasharray={isDashed ? "1.65 1.65" : undefined}
		strokeWidth="1.5"
	/>
)

const MARK_SHAPE = {
	waiting: (
		<>
			<Disc />
			<path
				className={CUT_OUT}
				d="M6 3.1V6.5"
				strokeLinecap="round"
				strokeWidth="1.6"
			/>
			<circle className="fill-mission-mark-cut-out" cx="6" cy="8.75" r="0.95" />
		</>
	),
	failed: (
		<>
			<Disc />
			<path
				className={CUT_OUT}
				d="M3.5 6H8.5"
				strokeLinecap="round"
				strokeWidth="1.6"
			/>
		</>
	),
	ready: (
		<>
			<Disc />
			<path
				className={CUT_OUT}
				d="M3.5 6.2L5.2 7.9L8.6 4.3"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="1.5"
			/>
		</>
	),
	working: (
		<>
			<Ring />
			<path d="M6 6L6 2.6A3.4 3.4 0 0 1 6 9.4Z" fill="currentColor" />
		</>
	),
	waiting_agent: <Ring isDashed />,
} as const satisfies Record<BotMissionState, ReactNode>

type MissionStateMarkProps = Omit<
	ComponentPropsWithRef<"svg">,
	"children" | "viewBox"
> & {
	state: BotMissionState
	size?: MissionStateMarkSize
}

const MissionStateMark = ({
	state,
	size = 12,
	className,
	...props
}: MissionStateMarkProps) => (
	<svg
		aria-hidden="true"
		className={cn(
			"pointer-events-none shrink-0",
			MARK_SIZE[size],
			MARK_TONE[state],
			className,
		)}
		data-slot="mission-state-mark"
		data-state={state}
		fill="none"
		viewBox="0 0 12 12"
		{...props}
	>
		{MARK_SHAPE[state]}
	</svg>
)

export { MissionStateMark }
