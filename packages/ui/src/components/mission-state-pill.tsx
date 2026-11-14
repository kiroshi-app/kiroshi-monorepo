import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
	HeaderIslandCell,
	useIsInHeaderIsland,
} from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { Badge } from "@workspace/ui/components/ui/badge"
import { cn } from "@workspace/ui/lib/utils"

const MISSION_STATE_MARK = {
	waiting_human: <MissionStateMark data-icon="inline-start" state="waiting" />,
	ready_to_merge: <MissionStateMark data-icon="inline-start" state="ready" />,
	failed: <MissionStateMark data-icon="inline-start" state="failed" />,
	done: (
		<Icons.Success
			aria-hidden="true"
			className="shrink-0 text-bot-badge-done"
			data-icon="inline-start"
		/>
	),
	closed: (
		<Icons.Close
			aria-hidden="true"
			className="shrink-0 text-muted-foreground"
			data-icon="inline-start"
		/>
	),
} as const satisfies Partial<Record<MissionState, ReactNode>>

type MissionStateWithPill = keyof typeof MISSION_STATE_MARK

const MISSION_STATE_DOT = {
	waiting_human: "bg-mission-glyph-waiting",
	ready_to_merge: "bg-success",
	failed: "bg-mission-glyph-failed",
	done: "bg-bot-badge-done",
	closed: "bg-muted-foreground",
} as const satisfies Record<MissionStateWithPill, string>

const hasStatePill = (state: MissionState): state is MissionStateWithPill =>
	state in MISSION_STATE_MARK

type MissionStatePillProps = {
	state: MissionState
	className?: string
}

const MissionStatePill = ({ state, className }: MissionStatePillProps) => {
	const { t } = useTranslation("chat")
	const isInIsland = useIsInHeaderIsland()

	if (!hasStatePill(state)) return null

	if (isInIsland)
		return (
			<HeaderIslandCell
				className={cn(
					"whitespace-nowrap font-medium text-compact leading-4",
					className,
				)}
				data-slot="mission-state-pill"
				data-state={state}
			>
				<span
					aria-hidden="true"
					className={cn(
						"size-1.5 shrink-0 rounded-full",
						MISSION_STATE_DOT[state],
					)}
				/>
				{t(`missions.state.${state}`)}
			</HeaderIslandCell>
		)

	return (
		<Badge
			className={className}
			data-slot="mission-state-pill"
			data-state={state}
			variant="outline"
		>
			{MISSION_STATE_MARK[state]}
			{t(`missions.state.${state}`)}
		</Badge>
	)
}

export { hasStatePill, MissionStatePill }
