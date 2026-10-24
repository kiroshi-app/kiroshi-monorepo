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

type RosterBotsInput = {
	badges: ReturnType<typeof useBotBadges>
	bots: Bot[]
	missions: ReturnType<typeof missionsBySpaceId>
	now: number
	pendingQuestions: SpaceQuestions
	previews: PreviewsBySpaceId
	rosteredSpaceId: string | null
	working: ReturnType<typeof useBotActivity>
}

export const useRosterBots = ({
	badges,
	bots,
	missions,
	now,
	pendingQuestions,
	previews,
	rosteredSpaceId,
	working,
}: RosterBotsInput) => {
	// React Compiler hoists probeRender out of the memo, which would make the
	// rosterBots count of PRF1 render baseline read one per render instead of one per recompute
	"use no memo"

	return useMemo(() => {
		probeRender("rosterBots")
		return withMissions(
			withLineBadges(
				withPendingQuestions(
					toRosterBots(
						bots,
						{
							working: activityIn(working, rosteredSpaceId),
							previews: previewsIn(previews, rosteredSpaceId),
						},
						now,
					),
					questionsByBotIn(pendingQuestions, rosteredSpaceId),
				),
				badges,
				rosteredSpaceId,
			),
			missionsIn(missions, rosteredSpaceId),
		)
	}, [
		bots,
		rosteredSpaceId,
		working,
		previews,
		now,
		badges,
		missions,
		pendingQuestions,
	])
}
