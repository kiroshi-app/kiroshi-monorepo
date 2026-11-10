import { useMemo } from "react"

import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { useSwitcherSpaces } from "@/lib/spaces/use-joined-spaces"
import type { WorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import type { RosterLines } from "@/lib/workspace/use-roster-lines"
import type { RosterLists } from "@/lib/workspace/use-roster-lists"
import type { WorkspaceOverlay } from "@/lib/workspace/use-workspace-overlay"
import type { WorkspaceFrame } from "@/lib/workspace/workspace-frame"

type WorkspaceNavigationOptions = {
	navigation: SettingsNavigation
	overlay: WorkspaceOverlay
	rosterLines: RosterLines
	rosterLists: RosterLists
	switcher: ReturnType<typeof useSwitcherSpaces>
	tabs: WorkspaceTabs
	onSelectSpace: (id: string) => void
}

type WorkspaceNavigation = Pick<WorkspaceFrame, "gestures" | "selectedSpaceId">

export const useWorkspaceNavigation = ({
	navigation,
	overlay,
	rosterLines,
	rosterLists,
	switcher,
	tabs,
	onSelectSpace,
}: WorkspaceNavigationOptions): WorkspaceNavigation => {
	const { badgesBySpaceId } = rosterLists
	const { onCreateSpace } = rosterLines.sidebarActions
	const user = overlay.userSettings
	const search = overlay.search

	return useMemo(() => {
		const space = switcher.selectedSpace

		return {
			gestures: {
				selected: "conversations",
				badgesBySpaceId,
				hostBySpaceId: switcher.hostBySpaceId,
				invitations: switcher.invitations,
				onAcceptInvitation: switcher.onAcceptInvitation,
				onCreateSpace,
				onDeclineInvitation: switcher.onDeclineInvitation,
				onOpenSearch: search.open,
				onRetryInvitation: switcher.onRetryInvitation,
				onSelectSpace: (id) => tabs.leaveAsked(() => onSelectSpace(id)),
				onSpacesMenuOpenChange: switcher.onSpaceSwitcherOpenChange,
				onOpenYou: () => navigation.openUserSettings(),
				onSelectHome: navigation.openHome,
				onSelectLibrary: navigation.openLibrary,
				onSelectMissions: navigation.openMissions,
				spaces: switcher.spaces,
				user,
			},
			selectedSpaceId: space?.id,
		}
	}, [
		badgesBySpaceId,
		navigation,
		onCreateSpace,
		onSelectSpace,
		search.open,
		switcher,
		tabs,
		user,
	])
}
