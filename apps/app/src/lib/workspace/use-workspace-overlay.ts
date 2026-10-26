import { useCallback, useMemo } from "react"

import type { ApplicationScopes } from "./use-application-scopes"
import type { RosterLines } from "./use-roster-lines"
import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"
import { useWorkspaceShortcuts } from "./use-workspace-shortcuts"

import type { OpenSettings } from "../navigation/open-settings"
import {
	useSearch,
	useSearchLookups,
	useSearchNavigation,
} from "../search/use-search"
import { useTheme } from "../theme/use-theme"
import { toUserSettingsValue } from "../user/user-settings"

type WorkspaceOverlayInput = {
	core: WorkspaceCore
	openSettings: OpenSettings | null
	rosterLines: RosterLines
	rosterView: RosterView
	scopes: ApplicationScopes
}

export const useWorkspaceOverlay = ({
	core,
	openSettings,
	rosterLines,
	rosterView,
	scopes,
}: WorkspaceOverlayInput) => {
	const {
		messageLandings,
		openedMission,
		openedRoutine,
		preferences,
		roster,
		spaces,
		user,
	} = core
	const { now, sidebarActions } = rosterLines
	const {
		conversationRosters,
		isEditingConversation,
		selected,
		selectedBotId,
		selectedConversationId,
		settingsConversationId,
	} = rosterView
	const { selectedSpace, selectedSpaceId } = scopes

	const isDialogOpen = openSettings !== null || isEditingConversation

	const searchLookups = useSearchLookups({
		rosters: roster.state.rosters,
		conversationRosters,
		readerName: preferences.displayName,
		now,
	})

	const searchNavigation = useSearchNavigation({
		roster: roster.controller,
		spaces: spaces.controller,
		missions: openedMission,
		routines: openedRoutine,
		landings: messageLandings,
		user: user.controller,
	})

	const search = useSearch({
		spaceId: selectedSpaceId,
		spaceName: selectedSpace?.name,
		lookups: searchLookups,
		navigation: searchNavigation,
		canOpen: !isDialogOpen,
	})

	const isOverlayOpen = search.isOpen || isDialogOpen

	const isThreadConversationSettingsOpen =
		isEditingConversation && settingsConversationId === selectedConversationId

	const toggleSettings = useCallback(() => {
		if (selectedBotId) {
			sidebarActions.onEditBot(selectedBotId)
		}
	}, [sidebarActions, selectedBotId])

	const userSettings = useMemo(
		() => toUserSettingsValue(preferences),
		[preferences],
	)

	const changeSidebarWidth = useCallback(
		(sidebarWidth: number) => {
			void user.controller.setSidebarWidth(sidebarWidth)
		},
		[user.controller],
	)

	const activityPanel = useMemo(
		() => ({
			isOpen: preferences.activityPanelOpen,
			onOpenChange: (isOpen: boolean) => {
				void user.controller.setActivityPanelOpen(isOpen)
			},
			openedRoutine,
		}),
		[preferences.activityPanelOpen, user.controller, openedRoutine],
	)

	useTheme({ colorScheme: preferences.colorScheme })

	const startConversationWith = useCallback(
		(botIds: string[]) => {
			void roster.controller.createConversation(botIds)
		},
		[roster.controller],
	)

	useWorkspaceShortcuts({
		isEnabled: !isOverlayOpen,
		selectedBotId: selected?.id ?? null,
		onOpenUserSettings: sidebarActions.onOpenUserSettings,
		onStartConversation: startConversationWith,
	})

	return {
		activityPanel,
		changeSidebarWidth,
		isOverlayOpen,
		isThreadConversationSettingsOpen,
		search,
		toggleSettings,
		userSettings,
	}
}

export type WorkspaceOverlay = ReturnType<typeof useWorkspaceOverlay>
