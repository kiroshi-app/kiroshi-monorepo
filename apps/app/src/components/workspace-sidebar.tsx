import { AppSidebar } from "@workspace/ui/components/app-sidebar"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import { hasOverlayWindowControls } from "@/lib/host"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { SidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceDrivers } from "@/lib/workspace/use-workspace-drivers"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type WorkspaceSidebarProps = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	sidebarMissions: SidebarMissions
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: ReturnType<typeof useSwitcherSpaces>
}

export const WorkspaceSidebar = ({
	collapsedSectionIds,
	core,
	drivers,
	overlay,
	rosterLines,
	rosterView,
	sidebarMissions,
	sidebarTab,
	switcher,
}: WorkspaceSidebarProps) => {
	const { roster, sections } = core
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})
	const sidebarRosters = {
		botsBySpaceId: rosterLists.rosterBotsBySpace,
		conversationsBySpaceId: rosterLists.rosterConversationsBySpace,
		sectionsBySpaceId: sections.state.sections,
		collapsedSectionIds,
	}

	return (
		<AppSidebar
			data-tauri-drag-region="deep"
			insetWindowControls={hasOverlayWindowControls()}
			windowControls={titleBarWindowControls()}
			bots={rosterLists.rosterBots}
			haveBotsFailedToLoad={roster.state.hasFailedToLoad}
			rosterSkeleton={rosterLists.rosterSkeleton}
			rosterListEnd={roster.listEnd}
			botsBySpaceId={rosterLists.rosterBotsBySpace}
			conversations={rosterLists.rosterConversations}
			conversationsBySpaceId={rosterLists.rosterConversationsBySpace}
			badgesBySpaceId={rosterLists.badgesBySpaceId}
			railDots={rosterLists.railSignals}
			missionsBySpaceId={sidebarMissions.panelsBySpaceId}
			openPanel={sidebarTab.openTab}
			onOpenPanelChange={(panel) =>
				sidebarTab.openSidebarTab(panel, sidebarRosters)
			}
			collapsedSectionIds={collapsedSectionIds}
			sectionsBySpaceId={sections.state.sections}
			updateBadge={rosterLines.updateBadge}
			isSpaceSwitchingEnabled={!overlay.isOverlayOpen}
			onOpenSearch={overlay.search.open}
			{...rosterLines.sidebarActions}
			onCreateConversation={rosterLines.startConversation}
			selectedBotId={rosterView.selectedBotId ?? undefined}
			selectedConversationId={rosterView.selectedConversationId ?? undefined}
			space={switcher.selectedSpace}
			selectedSpaceId={switcher.selectedSpaceId ?? undefined}
			spaces={switcher.spaces}
			hostBySpaceId={switcher.hostBySpaceId}
			invitations={switcher.invitations}
			onAcceptInvitation={switcher.onAcceptInvitation}
			onDeclineInvitation={switcher.onDeclineInvitation}
			onRetryInvitation={switcher.onRetryInvitation}
			onSpaceSwitcherOpenChange={switcher.onSpaceSwitcherOpenChange}
			user={overlay.userSettings}
		/>
	)
}
