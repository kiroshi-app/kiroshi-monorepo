import { AppSidebar } from "@workspace/ui/components/app-sidebar"

import { appSidebarRailOf } from "@/components/workspace-rail"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
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
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	rosterLines: RosterLines
	rosterView: RosterView
	sidebarMissions: SidebarMissions
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: ReturnType<typeof useSwitcherSpaces>
}

export const WorkspaceSidebar = ({
	collapsedSectionIds,
	core,
	navigation,
	overlay,
	rosterLines,
	rosterView,
	sidebarMissions,
	sidebarTab,
	switcher,
}: WorkspaceSidebarProps) => {
	const { roster, sections } = core
	const { frame, rosterLists } = useWorkspaceFrame()
	const sidebarRosters = {
		botsBySpaceId: rosterLists.rosterBotsBySpace,
		conversationsBySpaceId: rosterLists.rosterConversationsBySpace,
		sectionsBySpaceId: sections.state.sections,
		collapsedSectionIds,
	}

	return (
		<AppSidebar
			{...frame.titleBar}
			bots={rosterLists.rosterBots}
			haveBotsFailedToLoad={roster.state.hasFailedToLoad}
			rosterSkeleton={rosterLists.rosterSkeleton}
			rosterListEnd={roster.listEnd}
			botsBySpaceId={rosterLists.rosterBotsBySpace}
			conversations={rosterLists.rosterConversations}
			conversationsBySpaceId={rosterLists.rosterConversationsBySpace}
			missionsBySpaceId={sidebarMissions.panelsBySpaceId}
			openPanel={sidebarTab.openTab}
			onOpenPanelChange={(panel) =>
				sidebarTab.openSidebarTab(panel, sidebarRosters)
			}
			onSelectLibrary={navigation.openLibrary}
			collapsedSectionIds={collapsedSectionIds}
			sectionsBySpaceId={sections.state.sections}
			isSpaceSwitchingEnabled={!overlay.isOverlayOpen}
			{...rosterLines.sidebarActions}
			{...appSidebarRailOf(frame)}
			onCreateConversation={rosterLines.startConversation}
			selectedBotId={rosterView.selectedBotId ?? undefined}
			selectedConversationId={rosterView.selectedConversationId ?? undefined}
			selectedSpaceId={switcher.selectedSpaceId ?? undefined}
		/>
	)
}
