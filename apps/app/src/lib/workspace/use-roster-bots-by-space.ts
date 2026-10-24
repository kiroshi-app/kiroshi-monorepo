import { useMemo } from "react"

import { probeRender } from "@workspace/ui/lib/render-probe"

import {
	questionsByBotIn,
	type SpaceQuestions,
} from "../agent/pending-questions"
import { toRosterBots } from "../bots/bot-settings"
import type { SoloThreads } from "../bots/roster-line"
import type { ConversationHostStates } from "../bots/roster-pages"
import { withLineBadges } from "../chat/sidebar-badges"
import type { useBotBadges } from "../chat/use-bot-badges"
import {
	activityIn,
	type PreviewsBySpaceId,
	previewsIn,
	type useBotActivity,
} from "../chat/use-chat"
import {
	botHostStatesIn,
	withNeedsYou,
	workingFromHost,
} from "../conversations/host-state-rows"
import type { Bot } from "../conversations/store-contract"
import {
	type missionsBySpaceId,
	missionsIn,
	withMissions,
} from "../missions/missions-model"

type RosterBotsBySpaceInput = {
	badges: ReturnType<typeof useBotBadges>
	hostStates: ConversationHostStates
	missions: ReturnType<typeof missionsBySpaceId>
	now: number
	pendingQuestions: SpaceQuestions
	previews: PreviewsBySpaceId
	rosters: Record<string, Bot[]>
	soloThreads: SoloThreads
	working: ReturnType<typeof useBotActivity>
}

export const useRosterBotsBySpace = ({
	badges,
	hostStates,
	missions,
	now,
	pendingQuestions,
	previews,
	rosters,
	soloThreads,
	working,
}: RosterBotsBySpaceInput) => {
	// React Compiler hoists probeRender out of the memo, which would make the
	// rosterBotsBySpace count of PRF1 render baseline read one per render instead of one per recompute
	"use no memo"

	return useMemo(() => {
		probeRender("rosterBotsBySpace")
		return Object.fromEntries(
			Object.entries(rosters).map(([spaceId, spaceBots]) => {
				const botStates = botHostStatesIn({
					hostStates,
					soloThreads,
					spaceId,
				})
				return [
					spaceId,
					withMissions(
						withNeedsYou(
							withLineBadges(
								toRosterBots(
									spaceBots,
									{
										working: workingFromHost(
											botStates,
											activityIn(working, spaceId),
										),
										previews: previewsIn(previews, spaceId),
									},
									now,
								),
								badges,
								spaceId,
							),
							botStates,
							questionsByBotIn(pendingQuestions, spaceId),
						),
						missionsIn(missions, spaceId),
					),
				]
			}),
		)
	}, [
		rosters,
		hostStates,
		soloThreads,
		working,
		previews,
		now,
		badges,
		missions,
		pendingQuestions,
	])
}
