import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
import type { SettingsFrame } from "@/lib/workspace/settings-frame"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceCore } from "@/lib/workspace/use-workspace-core"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"

type WorkspaceRailOptions = {
	collapsedSectionIds: string[]
	core: WorkspaceCore
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	panels: SettingsPanels
	rosterLines: RosterLines
	rosterLists: RosterLists
	sidebarTab: ReturnType<typeof useSidebarPanelSwitch>
	switcher: ReturnType<typeof useSwitcherSpaces>
	tabs: WorkspaceTabs
	onSelectSpace: (id: string) => void
}

type WorkspaceRail = Pick<
	SettingsFrame,
	"rail" | "currentSpace" | "currentSpaceHost"
>

export const workspaceRailOf = ({
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
	onSelectSpace,
}: WorkspaceRailOptions): WorkspaceRail => {
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

	return {
		rail: {
			badgesBySpaceId: rosterLists.badgesBySpaceId,
			dots: rosterLists.railSignals,
			hostBySpaceId: switcher.hostBySpaceId,
			invitations: switcher.invitations,
			onAcceptInvitation: switcher.onAcceptInvitation,
			onCreateSpace: rosterLines.sidebarActions.onCreateSpace,
			onDeclineInvitation: switcher.onDeclineInvitation,
			onRetryInvitation: switcher.onRetryInvitation,
			onSelectSpace: (id) => tabs.leaveAsked(() => onSelectSpace(id)),
			onSpacesMenuOpenChange: switcher.onSpaceSwitcherOpenChange,
			onOpenSpaceSettings: space
				? () => navigation.openSpaceSettings(space.id)
				: undefined,
			onOpenYou: () => navigation.openUserSettings(),
			onSelectConversations: () => leaveSettingsFor("conversations"),
			onSelectMissions: () => leaveSettingsFor("missions"),
			openSettings: panels.railSettings,
			selected: sidebarTab.openTab,
			spaces: switcher.spaces,
			updateBadge: rosterLines.updateBadge,
			user: overlay.userSettings,
		},
		currentSpace: space,
		currentSpaceHost: space ? switcher.hostBySpaceId[space.id] : undefined,
	}
}
