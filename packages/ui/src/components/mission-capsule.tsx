import { useTranslation } from "react-i18next"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import type { BotMissionState } from "@workspace/ui/components/bot-badge"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { cn } from "@workspace/ui/lib/utils"

const CAPSULE_LIST =
	"flex flex-col gap-1 ps-11 group-data-[collapsible=icon]:hidden"

const CAPSULE =
	"relative flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm bg-mission-capsule px-2 py-1 text-start text-xs outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"

const MISSION_GLYPH =
	"pointer-events-none size-3 shrink-0 rounded-full border-[1.5px] border-current bg-[repeating-linear-gradient(135deg,currentColor_0_1px,transparent_1px_3px)]"

const MISSION_GLYPH_COLOUR = {
	waiting: "text-mission-glyph-waiting",
	failed: "text-mission-glyph-failed",
	ready: "text-mission-glyph-ready",
	working: "text-primary",
	waiting_agent: "text-muted-foreground",
} as const satisfies Record<BotMissionState, string>

type MissionCapsuleProps = {
	mission: AppSidebarRowMission
	onOpen?: (missionId: string) => void
}

const MissionCapsule = ({ mission, onOpen }: MissionCapsuleProps) => {
	const { t } = useTranslation("bots")
	const { state, ticket, objective } = mission

	return (
		<button
			className={CAPSULE}
			data-slot="mission-capsule"
			data-state={state}
			onClick={() => onOpen?.(mission.id)}
			type="button"
		>
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<span
				aria-hidden="true"
				className={cn(MISSION_GLYPH, MISSION_GLYPH_COLOUR[state])}
				data-slot="mission-capsule-glyph"
			/>
			{missionTicketPlatform(ticket.platform).isNamed ? (
				<span className="shrink-0 font-medium text-foreground/70 tabular-nums">
					{ticket.externalId}
				</span>
			) : null}
			<span
				className="min-w-0 grow truncate text-muted-foreground"
				data-slot="mission-capsule-title"
			>
				{ticket.title || objective}
			</span>
		</button>
	)
}

type MissionCapsuleListProps = {
	missions: AppSidebarRowMission[] | undefined
	onOpen?: (missionId: string) => void
}

const MissionCapsuleList = ({ missions, onOpen }: MissionCapsuleListProps) =>
	missions && missions.length > 0 ? (
		<div className={CAPSULE_LIST} data-slot="mission-capsule-list">
			{missions.map((mission) => (
				<MissionCapsule key={mission.id} mission={mission} onOpen={onOpen} />
			))}
		</div>
	) : null

export { MISSION_GLYPH, MISSION_GLYPH_COLOUR, MissionCapsuleList }
