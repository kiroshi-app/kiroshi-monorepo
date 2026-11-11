import { useTranslation } from "react-i18next"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"

const TREE =
	"pointer-events-none relative flex flex-col before:absolute before:start-4.75 before:top-0 before:bottom-3.5 before:w-[1.5px] before:bg-shell-border group-data-[collapsible=icon]:hidden"

const TREE_ROW = "flex h-7 w-full min-w-0 items-center gap-2 p-1.5 text-xs"

const BRANCH = "ms-3.5 h-[1.5px] w-4 shrink-0 bg-shell-border"

type MissionTreeRowProps = {
	mission: AppSidebarRowMission
}

const MissionTreeRow = ({ mission }: MissionTreeRowProps) => {
	const { t } = useTranslation("bots")
	const { state, ticket, objective } = mission

	return (
		<div className={TREE_ROW} data-slot="mission-capsule" data-state={state}>
			<span aria-hidden="true" className={BRANCH} />
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<MissionStateMark
				data-slot="mission-capsule-glyph"
				size={14}
				state={state}
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
		</div>
	)
}

type MissionCapsuleListProps = {
	missions: AppSidebarRowMission[] | undefined
}

const MissionCapsuleList = ({ missions }: MissionCapsuleListProps) =>
	missions && missions.length > 0 ? (
		<div className={TREE} data-slot="mission-capsule-list">
			{missions.map((mission) => (
				<MissionTreeRow key={mission.id} mission={mission} />
			))}
		</div>
	) : null

export { MissionCapsuleList }
