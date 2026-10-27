import { useEffect } from "react"

import { AppRail } from "@workspace/ui/components/app-rail"
import type { SettingsScreenRequestLeave } from "@workspace/ui/components/settings-screen"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

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
	switcher: ReturnType<typeof useSwitcherSpaces>
	tabs: WorkspaceTabs
	onSelectSpace: (id: string) => void
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
	tabs,
	onSelectSpace,
}: WorkspaceRailProps) => {
	useEffect(() => tabs.guardLeave(requestLeave), [tabs, requestLeave])

	const space = switcher.selectedSpace
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
			badgesBySpaceId={rosterLists.badgesBySpaceId}
			dots={rosterLists.railSignals}
			hostBySpaceId={switcher.hostBySpaceId}
			invitations={switcher.invitations}
			onAcceptInvitation={switcher.onAcceptInvitation}
			onCreateSpace={rosterLines.sidebarActions.onCreateSpace}
			onDeclineInvitation={switcher.onDeclineInvitation}
			onRetryInvitation={switcher.onRetryInvitation}
			onSelectSpace={(id) =>
				requestLeave(() => tabs.leaveAsked(() => onSelectSpace(id)))
			}
			onSpacesMenuOpenChange={switcher.onSpaceSwitcherOpenChange}
			onOpenSpaceSettings={() => {
				if (space) requestLeave(() => navigation.openSpaceSettings(space.id))
			}}
			onOpenYou={() => requestLeave(() => navigation.openUserSettings())}
			onSelectConversations={() =>
				requestLeave(() => leaveSettingsFor("conversations"))
			}
			onSelectMissions={() => requestLeave(() => leaveSettingsFor("missions"))}
			openSettings={panels.railSettings}
			selected={sidebarTab.openTab}
			space={space}
			spaceHost={space ? switcher.hostBySpaceId[space.id] : undefined}
			spaces={switcher.spaces}
			updateBadge={rosterLines.updateBadge}
			user={overlay.userSettings}
		/>
	)
}
