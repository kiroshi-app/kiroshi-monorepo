import { AppSidebarBody } from "@workspace/ui/components/app-sidebar"

import type { SidebarActions } from "@/lib/sidebar/use-sidebar-actions"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import { useWorkspaceFrame } from "@/lib/workspace/workspace-frame"

type WorkspaceSidebarProps = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	overlay: WorkspaceOverlay
	rosterLines: RosterLines
	rosterView: RosterView
	sidebarMissions: SidebarMissions
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: ReturnType<typeof useSwitcherSpaces>
}

const bodyActionsOf = ({
	onCreateSpace: _onCreateSpace,
	onOpenSpaceSettings: _onOpenSpaceSettings,
	onOpenUserSettings: _onOpenUserSettings,
	...bodyActions
}: SidebarActions) => bodyActions

export const WorkspaceSidebar = ({
	collapsedSectionIds,
	core,
	overlay,
	rosterLines,
	rosterView,
	sidebarMissions,
	sidebarTab,
	switcher,
}: WorkspaceSidebarProps) => {
	const { roster, sections } = core
	const { frame, rosterLists } = useWorkspaceFrame()

	return (
		<AppSidebarBody
			bots={rosterLists.rosterBots}
			haveBotsFailedToLoad={roster.state.hasFailedToLoad}
			onRetryLoadBots={
				roster.state.hasFailedToLoad ? roster.controller.retryLoad : undefined
			}
			rosterSkeleton={rosterLists.rosterSkeleton}
			rosterListEnd={roster.listEnd}
			botsBySpaceId={rosterLists.rosterBotsBySpace}
			conversations={rosterLists.rosterConversations}
			conversationsBySpaceId={rosterLists.rosterConversationsBySpace}
			missionsBySpaceId={sidebarMissions.panelsBySpaceId}
			openPanel={sidebarTab.openTab}
			collapsedSectionIds={collapsedSectionIds}
			sectionsBySpaceId={sections.state.sections}
			isSpaceSwitchingEnabled={!overlay.isOverlayOpen}
			{...bodyActionsOf(rosterLines.sidebarActions)}
			badgesBySpaceId={frame.rail.badgesBySpaceId}
			onSelectSpace={frame.rail.onSelectSpace}
			spaces={frame.rail.spaces}
			onCreateConversation={rosterLines.startConversation}
			selectedBotId={rosterView.selectedBotId ?? undefined}
			selectedConversationId={rosterView.selectedConversationId ?? undefined}
			selectedSpaceId={switcher.selectedSpaceId ?? undefined}
		/>
	)
}
