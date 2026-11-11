import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { Badge } from "@workspace/ui/components/ui/badge"

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

const hasStatePill = (state: MissionState): state is MissionStateWithPill =>
	state in MISSION_STATE_MARK

type MissionStatePillProps = {
	state: MissionState
	className?: string
}

const MissionStatePill = ({ state, className }: MissionStatePillProps) => {
	const { t } = useTranslation("chat")

	if (!hasStatePill(state)) return null

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
