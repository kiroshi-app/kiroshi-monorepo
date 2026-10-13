import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import type { MissionState } from "@workspace/ui/components/mission"
import { Badge } from "@workspace/ui/components/ui/badge"
import { cn } from "@workspace/ui/lib/utils"

type StateMark = {
	Mark: Icon
	markClass: string
}

const MISSION_STATE_MARK = {
	waiting_human: { Mark: Icons.Bell, markClass: "text-warning" },
	ready_to_merge: { Mark: Icons.Check, markClass: "text-bot-badge-done" },
	failed: { Mark: Icons.Error, markClass: "text-bot-badge-failed" },
	done: { Mark: Icons.Success, markClass: "text-bot-badge-done" },
	closed: { Mark: Icons.Close, markClass: "text-muted-foreground" },
} as const satisfies Partial<Record<MissionState, StateMark>>

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

	const { Mark, markClass } = MISSION_STATE_MARK[state]

	return (
		<Badge
			className={className}
			data-slot="mission-state-pill"
			data-state={state}
			variant="outline"
		>
			<Mark
				aria-hidden="true"
				className={cn("shrink-0", markClass)}
				data-icon="inline-start"
			/>
			{t(`missions.state.${state}`)}
		</Badge>
	)
}

export { hasStatePill, MissionStatePill }
