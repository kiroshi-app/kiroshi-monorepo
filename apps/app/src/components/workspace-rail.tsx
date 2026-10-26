import { AppRail } from "@workspace/ui/components/app-rail"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type RailSwitcher = Pick<
	ReturnType<typeof useSwitcherSpaces>,
	"spaces" | "selectedSpaceId"
>

const selectedSpaceOf = ({ spaces, selectedSpaceId }: RailSwitcher) =>
	spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]

type WorkspaceRailProps = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	requestLeave: SettingsScreenRequestLeave
	rosterLines: RosterLines
	rosterLists: RosterLists
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: RailSwitcher
}

export const WorkspaceRail = ({
	collapsedSectionIds,
	core,
	navigation,
	overlay,
	panels,
	requestLeave,
	rosterLines,
	rosterLists,
	sidebarTab,
	switcher,
}: WorkspaceRailProps) => {
	const leaveSettingsFor = (panel: SidebarPanel) => {
		navigation.openConversations()
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
			onOpenSpaceSettings={() =>
				requestLeave(() => navigation.openSpaceSettings())
			}
			onOpenYou={() => requestLeave(() => navigation.openUserSettings())}
			onSelectConversations={() =>
				requestLeave(() => leaveSettingsFor("conversations"))
			}
			onSelectMissions={() => requestLeave(() => leaveSettingsFor("missions"))}
			openSettings={panels.railSettings}
			selected={sidebarTab.openTab}
			space={selectedSpaceOf(switcher)}
			updateBadge={rosterLines.updateBadge}
			user={overlay.userSettings}
		/>
	)
}
