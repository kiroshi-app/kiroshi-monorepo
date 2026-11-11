import { useTranslation } from "react-i18next"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"

const CAPSULE_LIST =
	"pointer-events-none flex flex-col gap-1 ps-11 group-data-[collapsible=icon]:hidden"

const CAPSULE =
	"relative flex h-6 w-full min-w-0 items-center gap-1.5 rounded-sm bg-mission-capsule px-2 py-1 text-xs"

type MissionCapsuleProps = {
	mission: AppSidebarRowMission
}

const MissionCapsule = ({ mission }: MissionCapsuleProps) => {
	const { t } = useTranslation("bots")
	const { state, ticket, objective } = mission

	return (
		<div className={CAPSULE} data-slot="mission-capsule" data-state={state}>
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<MissionStateMark data-slot="mission-capsule-glyph" state={state} />
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
		</div>
	)
}

type MissionCapsuleListProps = {
	missions: AppSidebarRowMission[] | undefined
}

const MissionCapsuleList = ({ missions }: MissionCapsuleListProps) =>
	missions && missions.length > 0 ? (
		<div className={CAPSULE_LIST} data-slot="mission-capsule-list">
			{missions.map((mission) => (
				<MissionCapsule key={mission.id} mission={mission} />
			))}
		</div>
	) : null

export { MissionCapsuleList }
