import { useRef } from "react"
import { useTranslation } from "react-i18next"

import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar-model"
import {
	COMPACT_ROW_STACK,
	useIsCompactRows,
} from "@workspace/ui/components/compact-rows"
import { missionTicketPlatform } from "@workspace/ui/components/mission-marks"
import { MissionStateMark } from "@workspace/ui/components/mission-state-mark"
import { ShimmerText } from "@workspace/ui/components/motion/shimmer-text"
import { offsetPastSidebarEdge } from "@workspace/ui/components/sidebar-menu-row"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { cn } from "@workspace/ui/lib/utils"

const TREE =
	"pointer-events-none relative flex flex-col before:absolute before:start-5.25 before:top-0 before:bottom-4 before:w-[1.5px] before:bg-rail-section-placeholder group-data-[collapsible=icon]:hidden"

const BRANCH = "ms-3.5 h-[1.5px] w-4 shrink-0 bg-rail-section-placeholder"

const MARK_SIDE = 14

const COMPACT_TREE = cn(
	COMPACT_ROW_STACK,
	"relative ps-6 before:pointer-events-none before:absolute before:inset-y-0 before:start-3.5 before:w-[1.5px] before:bg-sidebar-tree-line",
)

const STACKED_ROW = {
	row: "flex w-full min-w-0 items-center gap-2 p-2 text-xs",
	lead: BRANCH,
	identifier: "shrink-0 font-medium text-foreground/70 tabular-nums",
	title: "min-w-0 grow truncate text-muted-foreground",
} as const

const COMPACT_ROW = {
	row: "group/mission flex h-7.5 w-full min-w-0 items-center gap-2 rounded-sm py-1.5 ps-2 pe-1.5 text-start text-compact text-sidebar-muted-foreground leading-4.5 outline-hidden ring-sidebar-ring hover:bg-sidebar-hover focus-visible:ring-2 focus-visible:ring-inset active:bg-sidebar-hover aria-[current]:bg-sidebar-selected aria-[current]:active:bg-sidebar-selected aria-[current]:hover:bg-sidebar-selected",
	lead: null,
	identifier: "shrink-0 font-medium tabular-nums",
	title: "min-w-0 truncate group-aria-[current]/mission:text-foreground",
} as const

type MissionOpening = {
	openMissionId?: string
	onOpenMission?: (missionId: string) => void
}

type MissionTooltip = {
	isTooltipHidden?: boolean
}

type MissionTreeRowProps = MissionOpening &
	MissionTooltip & {
		mission: AppSidebarRowMission
	}

const MissionTreeRow = ({
	mission,
	openMissionId,
	isTooltipHidden = false,
	onOpenMission,
}: MissionTreeRowProps) => {
	const { t } = useTranslation("bots")
	const isCompact = useIsCompactRows()
	const rowRef = useRef<HTMLButtonElement>(null)
	const drawn = isCompact ? COMPACT_ROW : STACKED_ROW
	const { id, state, ticket, objective, isLive } = mission
	const title = ticket.title || objective

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
				size={MARK_SIDE}
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
				{isLive ? (
					<ShimmerText className="inline" isHeldUnderReducedMotion>
						{title}
					</ShimmerText>
				) : (
					title
				)}
				{isLive && state !== "working" ? (
					<>
						{" "}
						<span className="sr-only">{t("roster.pose.working")}</span>
					</>
				) : null}
			</span>
		</>
	)

	return isCompact ? (
		<TooltipHint
			content={isTooltipHidden ? null : title}
			side="right"
			sideOffset={() => offsetPastSidebarEdge(rowRef.current)}
			variant="line"
		>
			<button
				aria-current={id === openMissionId ? "page" : undefined}
				className={drawn.row}
				data-slot="mission-capsule"
				data-state={state}
				onClick={() => onOpenMission?.(id)}
				ref={rowRef}
				type="button"
			>
				{anatomy}
			</button>
		</TooltipHint>
	) : (
		<div className={drawn.row} data-slot="mission-capsule" data-state={state}>
			{anatomy}
		</div>
	)
}

type MissionCapsuleListProps = MissionOpening &
	MissionTooltip & {
		missions: AppSidebarRowMission[] | undefined
	}

const MissionCapsuleList = ({
	missions,
	openMissionId,
	isTooltipHidden,
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
					isTooltipHidden={isTooltipHidden}
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
