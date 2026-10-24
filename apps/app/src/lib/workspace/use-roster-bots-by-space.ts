import { useMemo } from "react"

import { probeRender } from "@workspace/ui/lib/render-probe"

import {
	questionsByBotIn,
	type SpaceQuestions,
	withPendingQuestions,
} from "../agent/pending-questions"
import { toRosterBots } from "../bots/bot-settings"
import { withLineBadges } from "../chat/sidebar-badges"
import type { useBotBadges } from "../chat/use-bot-badges"
import {
	activityIn,
	type PreviewsBySpaceId,
	previewsIn,
	type useBotActivity,
} from "../chat/use-chat"
import type { Bot } from "../conversations/store-contract"
import {
	type missionsBySpaceId,
	missionsIn,
	withMissions,
} from "../missions/missions-model"

type RosterBotsBySpaceInput = {
	badges: ReturnType<typeof useBotBadges>
	missions: ReturnType<typeof missionsBySpaceId>
	now: number
	pendingQuestions: SpaceQuestions
	previews: PreviewsBySpaceId
	rosters: Record<string, Bot[]>
	working: ReturnType<typeof useBotActivity>
}

export const useRosterBotsBySpace = ({
	badges,
	missions,
	now,
	pendingQuestions,
	previews,
	rosters,
	working,
}: RosterBotsBySpaceInput) => {
	// React Compiler hoists probeRender out of the memo, which would make the
	// rosterBotsBySpace count of PRF1 render baseline read one per render instead of one per recompute
	"use no memo"

	return useMemo(() => {
		probeRender("rosterBotsBySpace")
		return Object.fromEntries(
			Object.entries(rosters).map(([spaceId, spaceBots]) => [
				spaceId,
				withMissions(
					withLineBadges(
						withPendingQuestions(
							toRosterBots(
								spaceBots,
								{
									working: activityIn(working, spaceId),
									previews: previewsIn(previews, spaceId),
								},
								now,
							),
							questionsByBotIn(pendingQuestions, spaceId),
						),
						badges,
						spaceId,
					),
					missionsIn(missions, spaceId),
				),
			]),
		)
	}, [rosters, working, previews, now, badges, missions, pendingQuestions])
}
