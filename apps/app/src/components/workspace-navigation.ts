import { useMemo } from "react"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import { isListPage } from "@/lib/tabs/tab-pages"
import { usePageShown } from "@/lib/tabs/use-page-shown"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { SidebarMissions } from "@/lib/workspace/use-sidebar-missions"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import type { WorkspaceFrame } from "@/lib/workspace/workspace-frame"

type WorkspaceNavigationOptions = {
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	rosterLines: RosterLines
	rosterLists: RosterLists
	sidebarMissions: Pick<SidebarMissions, "openMissionThread">
	switcher: ReturnType<typeof useSwitcherSpaces>
	tabs: WorkspaceTabs
	onSelectSpace: (id: string) => void
}

type WorkspaceNavigation = Pick<
	WorkspaceFrame,
	"sidebar" | "rowMenu" | "selectedSpaceId"
>

export const useWorkspaceNavigation = ({
	navigation,
	overlay,
	rosterLines,
	rosterLists,
	sidebarMissions,
	switcher,
	tabs,
	onSelectSpace,
}: WorkspaceNavigationOptions): WorkspaceNavigation => {
	const { badgesBySpaceId, rosterBots } = rosterLists
	const {
		onCreateSpace,
		onDeleteBot,
		onEditBot,
		onOpenBotInNewTab,
		onOpenConversationInNewTab,
		onOpenConversationSettings,
		onOpenSpaceSettings,
		onSelectBot,
		onSelectConversation,
	} = rosterLines.sidebarActions
	const { openMissionThread } = sidebarMissions
	const user = overlay.userSettings
	const search = overlay.search
	const isListShown = usePageShown(tabs, isListPage)

	return useMemo(() => {
		const space = switcher.selectedSpace
		const isAgent = (id: string) => rosterBots.some((agent) => agent.id === id)

		return {
			sidebar: {
				badgesBySpaceId,
				hostBySpaceId: switcher.hostBySpaceId,
				invitations: switcher.invitations,
				onAcceptInvitation: switcher.onAcceptInvitation,
				onCreateSpace,
				onDeclineInvitation: switcher.onDeclineInvitation,
				onOpenSearch: search.open,
				onRetryInvitation: switcher.onRetryInvitation,
				onSelectSpace: (id) => tabs.leaveAsked(() => onSelectSpace(id)),
				onOpenChange: switcher.onSpaceSwitcherOpenChange,
				onOpenSpaceSettings,
				onOpenSettings: () => navigation.openUserSettings(),
				onNewConversation: navigation.openHome,
				onSelectLibrary: navigation.openLibrary,
				onSelectMissions: navigation.openMissions,
				onOpenConversation: (id) => {
					if (!isListShown) {
						navigation.openThread(
							isAgent(id) ? { bot: id } : { conversation: id },
						)
						return
					}
					if (isAgent(id)) onSelectBot(id)
					else onSelectConversation(id)
				},
				onOpenMission: openMissionThread,
				spaces: switcher.spaces,
				user,
			},
			rowMenu: {
				isAgent,
				onOpenInNewTab: (id) =>
					isAgent(id) ? onOpenBotInNewTab(id) : onOpenConversationInNewTab(id),
				onOpenSettings: (id) =>
					isAgent(id) ? onEditBot(id) : onOpenConversationSettings(id),
				onOpenAgentDangerZone: onDeleteBot,
			},
			selectedSpaceId: space?.id,
		}
	}, [
		badgesBySpaceId,
		navigation,
		onCreateSpace,
		onDeleteBot,
		onEditBot,
		onOpenBotInNewTab,
		onOpenConversationInNewTab,
		onOpenConversationSettings,
		onOpenSpaceSettings,
		isListShown,
		onSelectBot,
		onSelectConversation,
		rosterBots,
		openMissionThread,
		onSelectSpace,
		search.open,
		switcher,
		tabs,
		user,
	])
}
