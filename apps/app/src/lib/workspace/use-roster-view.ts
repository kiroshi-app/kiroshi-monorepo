import { useMemo } from "react"

import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { missionsBySpaceId } from "../missions/missions-model"
import {
	type OpenSettings,
	openCompanionIdOf,
} from "../navigation/open-settings"

type RosterViewInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	openRowId: string | null
	openSettings: OpenSettings | null
}

export const useRosterView = ({
	core,
	drivers,
	openRowId,
	openSettings,
}: RosterViewInput) => {
	const { roster } = core
	const { missionMarks } = drivers

	const {
		bots,
		conversations,
		conversationRosters,
		soloThreads,
		spaceRowId: rosteredSpaceId,
		selectedBotId,
		selectedConversationId,
		settingsConversationId,
		isEditingConversation,
		hasLoaded,
	} = roster.state
	const isOnOpenSpace = rosteredSpaceId === openRowId
	const shownBotId = isOnOpenSpace ? selectedBotId : null
	const shownConversationId = isOnOpenSpace ? selectedConversationId : null
	const selected = bots.find((bot) => bot.id === shownBotId)
	const selectedConversation = conversations.find(
		(conversation) => conversation.id === shownConversationId,
	)
	const openCompanionId = openCompanionIdOf(openSettings)
	const settingsBot = bots.find((bot) => bot.id === openCompanionId)
	const settingsBotId = settingsBot?.id ?? null
	const settingsConversation = conversations.find(
		(conversation) => conversation.id === settingsConversationId,
	)
	const missions = useMemo(
		() =>
			missionsBySpaceId({
				entries: missionMarks,
				conversationRosters,
				soloThreads,
			}),
		[missionMarks, conversationRosters, soloThreads],
	)

	return {
		bots,
		conversationRosters,
		conversations,
		hasLoaded,
		isEditingConversation,
		missions,
		rosteredSpaceId,
		selected,
		selectedBotId,
		selectedConversation,
		selectedConversationId,
		settingsBot,
		settingsBotId,
		settingsConversation,
		settingsConversationId,
		soloThreads,
	}
}

export type RosterView = ReturnType<typeof useRosterView>
