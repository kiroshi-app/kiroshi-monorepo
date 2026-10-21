import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import { AppSidebarHeader } from "@workspace/ui/components/app-sidebar-actions"
import { AppSidebarList } from "@workspace/ui/components/app-sidebar-carousel"
import {
	type AppSidebarProps,
	announcementFor,
	NO_COLLAPSED_SECTIONS,
	NO_CONVERSATIONS,
	NO_SECTIONS,
	type SectionNaming,
	spaceIdsOfBot,
} from "@workspace/ui/components/app-sidebar-model"
import { BotRoster } from "@workspace/ui/components/app-sidebar-roster"
import { spaceRostersOf } from "@workspace/ui/components/app-sidebar-roster-layout"
import {
	MissionsPanel,
	MissionsPanelEmpty,
	type MissionsPanelProps,
} from "@workspace/ui/components/missions-panel"
import { SidebarResizeHandle } from "@workspace/ui/components/sidebar-resize"
import type { Space } from "@workspace/ui/components/space"
import { Sidebar } from "@workspace/ui/components/ui/sidebar"

const PANEL =
	"data-[side=left]:left-13 rounded-s-control border-y border-s border-e border-shell-border border-e-shell-divider bg-card **:data-[slot=sidebar-inner]:gap-2 **:data-[slot=sidebar-inner]:bg-transparent **:data-[slot=sidebar-inner]:pt-2 **:data-[slot=sidebar-inner]:pb-3"

type AppSidebarChromeProp =
	| "data-tauri-drag-region"
	| "badgesBySpaceId"
	| "hostBySpaceId"
	| "insetWindowControls"
	| "invitations"
	| "onAcceptInvitation"
	| "onCreateSpace"
	| "onDeclineInvitation"
	| "onLeaveSpace"
	| "onOpenPanelChange"
	| "onOpenUserSettings"
	| "onReorderSpaces"
	| "onRetryInvitation"
	| "onShare"
	| "onSpaceSwitcherOpenChange"
	| "railDots"
	| "updateBadge"
	| "user"
	| "windowControls"

interface AppSidebarPanelProps
	extends Omit<
		AppSidebarProps,
		AppSidebarChromeProp | "openPanel" | "spaces" | "isSpaceSwitchingEnabled"
	> {
	openPanel: AppRailPanel
	spaces: Space[]
	isSpaceSwitchingEnabled: boolean
	footer: ReactNode
}

const missionsOfSpaceIn =
	(missionsBySpaceId?: Record<string, MissionsPanelProps>) =>
	(space: Space) => {
		const missions = missionsBySpaceId?.[space.id]
		return missions ? <MissionsPanel {...missions} /> : null
	}

type RosterSkeletonSlotProps = {
	children: ReactNode
}

const RosterSkeletonSlot = ({ children }: RosterSkeletonSlotProps) => (
	<div className="min-h-0 flex-1" data-slot="roster-skeleton">
		{children}
	</div>
)

const AppSidebarPanel = ({
	bots,
	haveBotsFailedToLoad,
	rosterSkeleton,
	rosterListEnd,
	botsBySpaceId,
	conversations = NO_CONVERSATIONS,
	conversationsBySpaceId,
	sections = NO_SECTIONS,
	sectionsBySpaceId,
	collapsedSectionIds = NO_COLLAPSED_SECTIONS,
	selectedBotId,
	selectedConversationId,
	onSelectConversation,
	onCreateConversation,
	onOpenConversationSettings,
	onDeleteConversation,
	onStopConversation,
	onSelectBot,
	onCreateBot,
	onEditBot,
	onDuplicateBot,
	onAddBotToSpace,
	onRemoveBotFromSpace,
	onDeleteBot,
	onStopBot,
	onCreateSection,
	onRenameSection,
	onDeleteSection,
	onCollapseSection,
	onPinRoster,
	spaces,
	selectedSpaceId,
	isSpaceSwitchingEnabled,
	onSelectSpace,
	onOpenSpaceSettings,
	onOpenSearch,
	missionsBySpaceId,
	onSearchMissions,
	openPanel,
	footer,
	...panel
}: AppSidebarPanelProps) => {
	const { t } = useTranslation("bots")
	const isRosterOpen = openPanel === "conversations"
	const [naming, setNaming] = useState<SectionNaming | null>(null)
	const rosters = spaceRostersOf({
		bots,
		botsBySpaceId,
		conversations,
		conversationsBySpaceId,
		sections,
		sectionsBySpaceId,
		selectedBotId,
		selectedConversationId,
		selectedSpaceId,
		spaces,
	})
	const rosterProps = {
		collapsedSectionIds,
		haveBotsFailedToLoad,
		membershipsOf: (botId: string) => spaceIdsOfBot({ botId, botsBySpaceId }),
		onAddBotToSpace,
		onCollapseSection,
		onCreateBot,
		onCreateConversation,
		onCreateSection,
		onDeleteBot,
		onDeleteConversation,
		onDeleteSection,
		onDuplicateBot,
		onEditBot,
		onNaming: setNaming,
		onOpenConversationSettings,
		onOpenSpaceSettings,
		onPinRoster,
		onRemoveBotFromSpace,
		onRenameSection,
		onSelectBot,
		onSelectConversation,
		onStopBot,
		onStopConversation,
		selectedBotId,
		selectedConversationId,
		spaces,
	}

	const skeletonSlot = rosterSkeleton ? (
		<RosterSkeletonSlot>{rosterSkeleton}</RosterSkeletonSlot>
	) : null

	const rosterOfSpace = (space: Space) =>
		skeletonSlot && space.id === selectedSpaceId ? (
			skeletonSlot
		) : (
			<BotRoster
				{...rosterProps}
				bots={rosters.botsOf(space.id)}
				conversations={rosters.conversationsOf(space.id)}
				listEnd={space.id === selectedSpaceId ? rosterListEnd : undefined}
				naming={space.id === selectedSpaceId ? naming : null}
				sections={rosters.sectionsOf(space.id)}
				spaceId={space.id}
			/>
		)

	return (
		<>
			<Sidebar
				{...panel}
				aria-busy={rosters.isWorking}
				aria-label={t(`rail.${openPanel}`)}
				className={PANEL}
				collapsible="icon"
				role="complementary"
			>
				<AppSidebarHeader
					onCreateBot={onCreateBot}
					onCreateConversation={onCreateConversation}
					onCreateSection={
						onCreateSection ? () => setNaming({ rowId: null }) : undefined
					}
					onOpenSearch={onOpenSearch}
					onSearchMissions={onSearchMissions}
					panel={openPanel}
				/>
				<AppSidebarList
					isPerSpace={isRosterOpen ? rosters.isPerSpace : spaces.length > 0}
					isSwipeEnabled={isSpaceSwitchingEnabled && spaces.length > 1}
					list={openPanel}
					onSelectSpace={onSelectSpace}
					renderSpace={
						isRosterOpen ? rosterOfSpace : missionsOfSpaceIn(missionsBySpaceId)
					}
					selectedSpaceId={selectedSpaceId}
					spaces={spaces}
				>
					{isRosterOpen ? (
						(skeletonSlot ?? (
							<BotRoster
								{...rosterProps}
								bots={bots}
								conversations={conversations}
								listEnd={rosterListEnd}
								naming={naming}
								sections={sections}
								spaceId={selectedSpaceId}
							/>
						))
					) : (
						<MissionsPanelEmpty />
					)}
				</AppSidebarList>
				{footer}
				<SidebarResizeHandle side="left" />
			</Sidebar>
			<span className="sr-only" role="status">
				{announcementFor(t, rosters.selectedBot, rosters.selectedConversation)}
			</span>
		</>
	)
}

export { AppSidebarPanel }
