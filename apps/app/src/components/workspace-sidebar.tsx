import { AppSidebar } from "@workspace/ui/components/app-sidebar"

import { titleBarWindowControls } from "@/components/window-caption-controls"
import { appSidebarRailOf, useWorkspaceRail } from "@/components/workspace-rail"
import { hasOverlayWindowControls } from "@/lib/host"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { SidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceDrivers } from "@/lib/workspace/use-workspace-drivers"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import { useWorkspaceTitleBarTabs } from "@/lib/workspace/use-workspace-title-bar-tabs"

type WorkspaceSidebarProps = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	sidebarMissions: SidebarMissions
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: ReturnType<typeof useSwitcherSpaces>
	tabs: WorkspaceTabs
}

export const WorkspaceSidebar = ({
	collapsedSectionIds,
	core,
	drivers,
	navigation,
	overlay,
	panels,
	rosterLines,
	rosterView,
	sidebarMissions,
	sidebarTab,
	switcher,
	tabs,
}: WorkspaceSidebarProps) => {
	const { roster, sections } = core
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})
	const titleBarTabs = useWorkspaceTitleBarTabs({
		core,
		rosterLists,
		rosterView,
		tabs,
	})
	const rail = useWorkspaceRail({
		collapsedSectionIds,
		core,
		navigation,
		overlay,
		panels,
		rosterLines,
		rosterLists,
		sidebarTab,
		switcher,
		tabs,
		onSelectSpace: rosterLines.sidebarActions.onSelectSpace,
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
			{...titleBarTabs}
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
			collapsedSectionIds={collapsedSectionIds}
			sectionsBySpaceId={sections.state.sections}
			isSpaceSwitchingEnabled={!overlay.isOverlayOpen}
			onOpenSearch={overlay.search.open}
			{...rosterLines.sidebarActions}
			{...appSidebarRailOf(rail)}
			onCreateConversation={rosterLines.startConversation}
			selectedBotId={rosterView.selectedBotId ?? undefined}
			selectedConversationId={rosterView.selectedConversationId ?? undefined}
			selectedSpaceId={switcher.selectedSpaceId ?? undefined}
		/>
	)
}
