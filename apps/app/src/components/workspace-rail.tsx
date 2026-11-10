import { useMemo } from "react"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import { isHomePage, isLibraryPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { SidebarPanel } from "@/lib/user/use-sidebar-tab"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SettingsPanels } from "@/lib/workspace/use-settings-panels"
import type { useSidebarPanelSwitch } from "@/lib/workspace/use-sidebar-panel-switch"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import type { WorkspaceFrame } from "@/lib/workspace/workspace-frame"

type WorkspaceRailOptions = {
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
	WorkspaceFrame,
	"rail" | "currentSpace" | "currentSpaceHost"
>

export const useWorkspaceRail = ({
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
	const { badgesBySpaceId, railSignals } = rosterLists
	const { onCreateSpace } = rosterLines.sidebarActions
	const { updateBadge } = rosterLines
	const user = overlay.userSettings
	const openSettings = panels.railSettings
	const search = overlay.search
	const isLibraryShown = usePageShown(tabs, isLibraryPage)
	const isHomeShown = usePageShown(tabs, isHomePage)

	return useMemo(() => {
		const space = switcher.selectedSpace
		const leaveSettingsFor = (panel: SidebarPanel) => {
			navigation.openConversations()
			if (panel === sidebarTab.openTab) return
			sidebarTab.openSidebarTab(panel)
		}

		return {
			rail: {
				badgesBySpaceId,
				dots: railSignals,
				hostBySpaceId: switcher.hostBySpaceId,
				invitations: switcher.invitations,
				isHomeSelected: isHomeShown,
				isSearchOpen: search.isOpen,
				onAcceptInvitation: switcher.onAcceptInvitation,
				onCreateSpace,
				onDeclineInvitation: switcher.onDeclineInvitation,
				onOpenSearch: search.open,
				onRetryInvitation: switcher.onRetryInvitation,
				onSelectSpace: (id) => tabs.leaveAsked(() => onSelectSpace(id)),
				onSpacesMenuOpenChange: switcher.onSpaceSwitcherOpenChange,
				onOpenSpaceSettings: space
					? () => navigation.openSpaceSettings(space.id)
					: undefined,
				onOpenYou: () => navigation.openUserSettings(),
				onSelectHome: navigation.openHome,
				onSelectConversations: () => leaveSettingsFor("conversations"),
				onSelectLibrary: navigation.openLibrary,
				onSelectMissions: () => leaveSettingsFor("missions"),
				openSettings,
				selected: isLibraryShown ? "library" : sidebarTab.openTab,
				spaces: switcher.spaces,
				updateBadge,
				user,
			},
			currentSpace: space,
			currentSpaceHost: space ? switcher.hostBySpaceId[space.id] : undefined,
		}
	}, [
		badgesBySpaceId,
		isHomeShown,
		isLibraryShown,
		navigation,
		onCreateSpace,
		onSelectSpace,
		openSettings,
		railSignals,
		search.isOpen,
		search.open,
		sidebarTab,
		switcher,
		tabs,
		updateBadge,
		user,
	])
}
