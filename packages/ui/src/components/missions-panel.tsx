import { Fragment, type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	ActivityGroup,
	OPEN_MISSION_GROUPS,
} from "@workspace/ui/components/activity-group"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import {
	type ListEnd,
	ListEndSlot,
} from "@workspace/ui/components/list-skeleton"
import type { MissionCardModel } from "@workspace/ui/components/mission"
import {
	MissionCard,
	type MissionCardWrap,
	wrapCard,
} from "@workspace/ui/components/mission-card"
import { MissionsFeedRow } from "@workspace/ui/components/missions-feed-skeleton"
import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"

type MissionsPanelMission = MissionCardModel & { conversationId: string }

type MissionsPanelProps = {
	open: MissionsPanelMission[]
	earlierToday: MissionsPanelMission[]
	onOpen: (
		missionId: string,
		conversationId: string,
		modifiers: ClickModifiers,
	) => void
	openMissionId?: string | null
	wrap?: MissionCardWrap
	listEnd?: ListEnd
	skeleton?: ReactNode
}

type MissionsPanelRowsProps = Pick<
	MissionsPanelProps,
	"onOpen" | "openMissionId" | "wrap"
> & {
	missions: MissionsPanelMission[]
}

const MissionsPanelRows = ({
	missions,
	onOpen,
	openMissionId,
	wrap,
}: MissionsPanelRowsProps) =>
	missions.map(({ conversationId, ...mission }) => (
		<Fragment key={mission.id}>
			{wrapCard(
				<MissionCard
					{...mission}
					density="row"
					isActive={mission.id === openMissionId}
					onOpen={(missionId, modifiers) =>
						onOpen(missionId, conversationId, modifiers)
					}
				/>,
				wrap,
			)}
		</Fragment>
	))

const MissionsPanelEmpty = () => {
	const { t } = useTranslation("chat")

	return (
		<EmptyStateShell
			data-slot="missions-panel-empty"
			description={t("missions.panel.empty.description")}
			mark={
				<Icons.Missions
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
			}
			title={t("missions.panel.empty.title")}
		/>
	)
}

const MissionsPanel = ({
	open,
	earlierToday,
	listEnd,
	skeleton,
	...rowProps
}: MissionsPanelProps) => {
	const { t } = useTranslation("chat")
	const [isEarlierTodayOpen, setEarlierTodayOpen] = useState(false)
	const isEarlierTodayFolded = earlierToday.length > 0 && !isEarlierTodayOpen

	if (skeleton) {
		return (
			<div className="min-h-0 flex-1" data-slot="missions-panel-skeleton">
				{skeleton}
			</div>
		)
	}

	if (open.length === 0 && earlierToday.length === 0) {
		return <MissionsPanelEmpty />
	}

	return (
		<div className="flex min-w-0 flex-col gap-3" data-slot="missions-panel">
			{OPEN_MISSION_GROUPS.map(({ key, states }) => {
				const held = open.filter((mission) => states.includes(mission.state))
				if (held.length === 0) return null

				return (
					<ActivityGroup
						count={held.length}
						key={key}
						slot={`missions-${key}`}
						title={t(`activity.missions.group.${key}`)}
					>
						<MissionsPanelRows {...rowProps} missions={held} />
					</ActivityGroup>
				)
			})}
			{earlierToday.length > 0 ? (
				<ActivityGroup
					count={earlierToday.length}
					fold={{
						isOpen: isEarlierTodayOpen,
						onToggle: () => setEarlierTodayOpen((shown) => !shown),
					}}
					slot="missions-earlierToday"
					title={t("activity.missions.group.earlierToday")}
				>
					<MissionsPanelRows {...rowProps} missions={earlierToday} />
				</ActivityGroup>
			) : null}
			<ListEndSlot
				listEnd={isEarlierTodayFolded ? undefined : listEnd}
				row={<MissionsFeedRow />}
			/>
		</div>
	)
}

export {
	MissionsPanel,
	MissionsPanelEmpty,
	type MissionsPanelMission,
	type MissionsPanelProps,
}
