import { useMemo } from "react"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
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

type WorkspaceNavigation = Pick<WorkspaceFrame, "sidebar" | "selectedSpaceId">

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
	const { onCreateSpace, onOpenSpaceSettings, onSelectConversation } =
		rosterLines.sidebarActions
	const { openMissionThread } = sidebarMissions
	const user = overlay.userSettings
	const search = overlay.search

	return useMemo(() => {
		const space = switcher.selectedSpace

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
				onOpenConversation: (id) =>
					rosterBots.some((agent) => agent.id === id)
						? navigation.openThread({ bot: id })
						: onSelectConversation(id),
				onOpenMission: openMissionThread,
				spaces: switcher.spaces,
				user,
			},
			selectedSpaceId: space?.id,
		}
	}, [
		badgesBySpaceId,
		navigation,
		onCreateSpace,
		onOpenSpaceSettings,
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
