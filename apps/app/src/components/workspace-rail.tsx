import { AppRail } from "@workspace/ui/components/app-rail"

import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import { useRosterLists } from "@/lib/workspace/use-roster-lists"
import type { RosterView } from "@/lib/workspace/use-roster-view"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { SidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceDrivers } from "@/lib/workspace/use-workspace-drivers"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

export type WorkspaceRailProps = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterView: RosterView
	sidebarMissions: SidebarMissions
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
}

export const WorkspaceRail = ({
	collapsedSectionIds,
	core,
	drivers,
	overlay,
	panels,
	rosterLines,
	rosterView,
	sidebarMissions,
	sidebarTab,
}: WorkspaceRailProps) => {
	const rosterLists = useRosterLists({
		core,
		drivers,
		rosterLines,
		rosterView,
		waitingMissionCount: sidebarMissions.waitingCount,
	})

	const leaveSettingsFor = (panel: SidebarPanel) => {
		panels.closeSettings()
		if (panel === sidebarTab.openTab) return
		sidebarTab.openSidebarTab(panel, {
			botsBySpaceId: rosterLists.rosterBotsBySpace,
			conversationsBySpaceId: rosterLists.rosterConversationsBySpace,
			sectionsBySpaceId: core.sections.state.sections,
			collapsedSectionIds,
		})
	}

	return (
		<AppRail
			dots={rosterLists.railSignals}
			onOpenSpaceSettings={panels.openSpaceSettings}
			onOpenYou={panels.openUserSettings}
			onSelectConversations={() => leaveSettingsFor("conversations")}
			onSelectMissions={() => leaveSettingsFor("missions")}
			openSettings={panels.openSettings}
			selected={sidebarTab.openTab}
			updateBadge={rosterLines.updateBadge}
			user={overlay.userSettings}
		/>
	)
}
