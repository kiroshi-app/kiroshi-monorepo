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

const TREE_ROW = "flex w-full min-w-0 items-center gap-2 p-2 text-xs"

const BRANCH = "ms-3.5 h-[1.5px] w-4 shrink-0 bg-rail-section-placeholder"

const COMPACT_TREE = cn(
	COMPACT_ROW_STACK,
	"pointer-events-none relative before:absolute before:inset-y-0 before:start-3.25 before:w-[1.5px] before:bg-sidebar-tree-line",
)

const COMPACT_TREE_ROW =
	"flex h-7 w-full min-w-0 items-center gap-2 p-1.5 text-muted-foreground text-xs leading-4"

const COMPACT_LANE = "size-4 shrink-0"

type MissionTreeRowProps = {
	mission: AppSidebarRowMission
}

const MissionTreeRow = ({ mission }: MissionTreeRowProps) => {
	const { t } = useTranslation("bots")
	const isCompact = useIsCompactRows()
	const { state, ticket, objective } = mission

	if (isCompact)
		return (
			<div
				className={COMPACT_TREE_ROW}
				data-slot="mission-capsule"
				data-state={state}
			>
				<span
					aria-hidden="true"
					className={COMPACT_LANE}
					data-slot="mission-capsule-lane"
				/>
				<span className="sr-only">{t(`roster.mission.state.${state}`)}</span>
				<MissionStateMark data-slot="mission-capsule-glyph" state={state} />
				{missionTicketPlatform(ticket.platform).isNamed ? (
					<span
						className="shrink-0 font-medium tabular-nums"
						data-slot="mission-capsule-identifier"
					>
						{ticket.externalId}
					</span>
				) : null}
				<span
					className="min-w-0 grow truncate"
					data-slot="mission-capsule-title"
				>
					{ticket.title || objective}
				</span>
			</div>
		)

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

const MissionCapsuleList = ({ missions }: MissionCapsuleListProps) => {
	const isCompact = useIsCompactRows()

	return missions && missions.length > 0 ? (
		<div
			className={isCompact ? COMPACT_TREE : TREE}
			data-slot="mission-capsule-list"
		>
			{missions.map((mission) => (
				<MissionTreeRow key={mission.id} mission={mission} />
			))}
		</div>
	) : null
}

export { MissionCapsuleList }
