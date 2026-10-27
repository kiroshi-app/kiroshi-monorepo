import { useMemo } from "react"

import type { AppSidebarProps } from "@workspace/ui/components/app-sidebar-model"

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

type AppSidebarRail = Pick<
	AppSidebarProps,
	| "badgesBySpaceId"
	| "hostBySpaceId"
	| "invitations"
	| "onAcceptInvitation"
	| "onCreateSpace"
	| "onDeclineInvitation"
	| "onOpenSpaceSettings"
	| "onOpenUserSettings"
	| "onRetryInvitation"
	| "onSelectSpace"
	| "onSpaceSwitcherOpenChange"
	| "openSettings"
	| "railDots"
	| "space"
	| "spaceHost"
	| "spaces"
	| "updateBadge"
	| "user"
>

export const useWorkspaceRail = ({
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
	const sectionsBySpaceId = core.sections.state.sections
	const {
		badgesBySpaceId,
		railSignals,
		rosterBotsBySpace,
		rosterConversationsBySpace,
	} = rosterLists
	const { onCreateSpace } = rosterLines.sidebarActions
	const { updateBadge } = rosterLines
	const user = overlay.userSettings
	const openSettings = panels.railSettings

	return useMemo(() => {
		const space = switcher.selectedSpace
		const leaveSettingsFor = (panel: SidebarPanel) => {
			navigation.openConversations()
			if (panel === sidebarTab.openTab) return
			sidebarTab.openSidebarTab(panel, {
				botsBySpaceId: rosterBotsBySpace,
				conversationsBySpaceId: rosterConversationsBySpace,
				sectionsBySpaceId,
				collapsedSectionIds,
			})
		}

		return {
			rail: {
				badgesBySpaceId,
				dots: railSignals,
				hostBySpaceId: switcher.hostBySpaceId,
				invitations: switcher.invitations,
				onAcceptInvitation: switcher.onAcceptInvitation,
				onCreateSpace,
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
				openSettings,
				selected: sidebarTab.openTab,
				spaces: switcher.spaces,
				updateBadge,
				user,
			},
			currentSpace: space,
			currentSpaceHost: space ? switcher.hostBySpaceId[space.id] : undefined,
		}
	}, [
		badgesBySpaceId,
		collapsedSectionIds,
		navigation,
		onCreateSpace,
		onSelectSpace,
		openSettings,
		railSignals,
		rosterBotsBySpace,
		rosterConversationsBySpace,
		sectionsBySpaceId,
		sidebarTab,
		switcher,
		tabs,
		updateBadge,
		user,
	])
}

export const appSidebarRailOf = ({
	rail,
	currentSpace,
	currentSpaceHost,
}: WorkspaceRail): AppSidebarRail => ({
	badgesBySpaceId: rail.badgesBySpaceId,
	hostBySpaceId: rail.hostBySpaceId,
	invitations: rail.invitations,
	onAcceptInvitation: rail.onAcceptInvitation,
	onCreateSpace: rail.onCreateSpace,
	onDeclineInvitation: rail.onDeclineInvitation,
	onOpenSpaceSettings: rail.onOpenSpaceSettings,
	onOpenUserSettings: rail.onOpenYou,
	onRetryInvitation: rail.onRetryInvitation,
	onSelectSpace: rail.onSelectSpace,
	onSpaceSwitcherOpenChange: rail.onSpacesMenuOpenChange,
	openSettings: rail.openSettings,
	railDots: rail.dots,
	space: currentSpace,
	spaceHost: currentSpaceHost,
	spaces: rail.spaces,
	updateBadge: rail.updateBadge,
	user: rail.user,
})
