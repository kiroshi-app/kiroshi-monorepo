import { useMemo } from "react"

import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useRosterClock } from "../bots/use-roster-clock"
import { missionsBySpaceId } from "../missions/missions-model"
import { useLiveMissions } from "../missions/use-live-missions"
import {
	type OpenSettings,
	openCompanionIdOf,
	openConversationIdOf,
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
	const openConversationId = openConversationIdOf(openSettings)
	const settingsConversation = conversations.find(
		(conversation) => conversation.id === openConversationId,
	)
	const markedMissions = useMemo(
		() => missionMarks.map(({ mission }) => mission),
		[missionMarks],
	)
	const clock = useRosterClock()
	const liveMissionIds = useLiveMissions(
		core.conversationRuntimes,
		markedMissions,
		clock,
	)
	const missions = useMemo(
		() =>
			missionsBySpaceId({
				entries: missionMarks,
				conversationRosters,
				soloThreads,
				liveMissionIds,
			}),
		[missionMarks, conversationRosters, soloThreads, liveMissionIds],
	)

	return {
		bots,
		conversationRosters,
		conversations,
		hasLoaded,
		missions,
		rosteredSpaceId,
		selected,
		selectedBotId,
		selectedConversation,
		selectedConversationId,
		settingsBot,
		settingsBotId,
		settingsConversation,
		soloThreads,
	}
}

export type RosterView = ReturnType<typeof useRosterView>
