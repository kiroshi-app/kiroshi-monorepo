import { useCallback, useMemo } from "react"

import type { RosterView } from "./use-roster-view"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useRosterClock } from "../bots/use-roster-clock"
import { activityOf, useBotActivity } from "../chat/use-chat"
import type { ConversationSeating } from "../conversations/use-conversation-seating"
import type { SettingsNavigation } from "../navigation/use-settings-navigation"
import { useSidebarActions } from "../sidebar/use-sidebar-actions"
import { useUpdateBadge } from "../updater/use-update-badge"

type RosterLinesInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterView: RosterView
	settings: SettingsNavigation
}

export const useRosterLines = ({
	core,
	drivers,
	rosterView,
	settings,
}: RosterLinesInput) => {
	const {
		attachments,
		chat,
		collapsedSections,
		conversationRuntimes,
		drafts,
		joinedSpaces,
		openedMission,
		roster,
		sections,
		spaces,
	} = core
	const { updater } = drivers
	const { settingsBotId, soloThreads } = rosterView

	const rosters = roster.state.rosters

	const startConversation = useCallback(() => {
		void roster.controller.createConversation()
	}, [roster.controller])

	const conversationSeating = useMemo<ConversationSeating>(
		() => ({
			seat: roster.controller.recruitToConversation,
			botsByPresence: roster.controller.botsByPresence,
		}),
		[roster.controller],
	)

	const sidebarActions = useSidebarActions({
		attachments,
		collapsedSections: collapsedSections.controller,
		drafts,
		joinedSpaces: joinedSpaces.controller,
		openedMission,
		roster: roster.controller,
		runtimes: conversationRuntimes,
		sections: sections.controller,
		settings,
		spaces: spaces.controller,
	})

	const deleteBot = async (id: string) => {
		await chat.controller.close(id)
		attachments.forget({ kind: "bot", id })
		drafts.forget(id)
		await roster.controller.remove(id)
	}

	const lines = useMemo(
		() =>
			Object.entries(rosters).flatMap(([spaceId, spaceBots]) =>
				spaceBots.map((bot) => ({ spaceId, botId: bot.id })),
			),
		[rosters],
	)
	const working = useBotActivity({
		controller: chat.controller,
		lines,
		soloThreads,
	})
	const activity = activityOf(working, settingsBotId)

	const updateBadge = useUpdateBadge({ updater, working })
	const now = useRosterClock()

	return {
		activity,
		conversationSeating,
		deleteBot,
		lines,
		now,
		rosters,
		sidebarActions,
		startConversation,
		updateBadge,
		working,
	}
}

export type RosterLines = ReturnType<typeof useRosterLines>
