import { useTranslation } from "react-i18next"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import {
	COMPACT_ROW_STACK,
	useIsCompactRows,
} from "@workspace/ui/components/compact-rows"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { cn } from "@workspace/ui/lib/utils"

const TREE =
	"pointer-events-none relative flex flex-col before:absolute before:start-5.25 before:top-0 before:bottom-4 before:w-[1.5px] before:bg-rail-section-placeholder group-data-[collapsible=icon]:hidden"

const BRANCH = "ms-3.5 h-[1.5px] w-4 shrink-0 bg-rail-section-placeholder"

const COMPACT_TREE = cn(
	COMPACT_ROW_STACK,
	"relative ps-6.5 before:pointer-events-none before:absolute before:inset-y-0 before:start-3.5 before:w-[1.5px] before:bg-sidebar-tree-line",
)

const STACKED_ROW = {
	row: "flex w-full min-w-0 items-center gap-2 p-2 text-xs",
	lead: BRANCH,
	glyphSide: 14,
	identifier: "shrink-0 font-medium text-foreground/70 tabular-nums",
	title: "min-w-0 grow truncate text-muted-foreground",
} as const

const COMPACT_ROW = {
	row: "group/mission flex h-7.5 w-fit min-w-0 max-w-full items-center gap-2 self-start rounded-sm p-1.5 text-start text-compact text-sidebar-muted-foreground leading-4.5 outline-hidden ring-sidebar-ring hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-hover aria-[current]:bg-sidebar-selected aria-[current]:active:bg-sidebar-selected aria-[current]:hover:bg-sidebar-selected",
	lead: null,
	glyphSide: 14,
	identifier: "shrink-0 font-medium tabular-nums",
	title: "min-w-0 truncate group-aria-[current]/mission:text-foreground",
} as const

type MissionOpening = {
	openMissionId?: string
	onOpenMission?: (missionId: string) => void
}

type MissionTreeRowProps = MissionOpening & {
	mission: AppSidebarRowMission
}

const MissionTreeRow = ({
	mission,
	openMissionId,
	onOpenMission,
}: MissionTreeRowProps) => {
	const { t } = useTranslation("bots")
	const isCompact = useIsCompactRows()
	const drawn = isCompact ? COMPACT_ROW : STACKED_ROW
	const { id, state, ticket, objective } = mission

	const anatomy = (
		<>
			{drawn.lead ? (
				<span
					aria-hidden="true"
					className={drawn.lead}
					data-slot="mission-capsule-lane"
				/>
			) : null}
			<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
			<MissionStateMark
				data-slot="mission-capsule-glyph"
				size={drawn.glyphSide}
				state={state}
			/>
			{missionTicketPlatform(ticket.platform).isNamed ? (
				<span
					className={drawn.identifier}
					data-slot="mission-capsule-identifier"
				>
					{ticket.externalId}
				</span>
			) : null}
			<span className={drawn.title} data-slot="mission-capsule-title">
				{ticket.title || objective}
			</span>
		</>
	)

	return isCompact ? (
		<button
			aria-current={id === openMissionId ? "page" : undefined}
			className={drawn.row}
			data-slot="mission-capsule"
			data-state={state}
			onClick={() => onOpenMission?.(id)}
			type="button"
		>
			{anatomy}
		</button>
	) : (
		<div className={drawn.row} data-slot="mission-capsule" data-state={state}>
			{anatomy}
		</div>
	)
}

type MissionCapsuleListProps = MissionOpening & {
	missions: AppSidebarRowMission[] | undefined
}

const MissionCapsuleList = ({
	missions,
	openMissionId,
	onOpenMission,
}: MissionCapsuleListProps) => {
	const isCompact = useIsCompactRows()

	return missions && missions.length > 0 ? (
		<div
			className={isCompact ? COMPACT_TREE : TREE}
			data-slot="mission-capsule-list"
		>
			{missions.map((mission) => (
				<MissionTreeRow
					key={mission.id}
					mission={mission}
					onOpenMission={onOpenMission}
					openMissionId={openMissionId}
				/>
			))}
		</div>
	) : null
}

export { MissionCapsuleList, type MissionOpening }
