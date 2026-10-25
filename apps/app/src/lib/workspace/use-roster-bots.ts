import { useMemo } from "react"

import { probeRender } from "@workspace/ui/lib/render-probe"

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

type RosterBotsInput = {
	badges: ReturnType<typeof useBotBadges>
	bots: Bot[]
	hostStates: ConversationHostStates
	missions: ReturnType<typeof missionsBySpaceId>
	now: number
	previews: PreviewsBySpaceId
	rosteredSpaceId: string | null
	soloThreads: SoloThreads
	working: ReturnType<typeof useBotActivity>
}

export const useRosterBots = ({
	badges,
	bots,
	hostStates,
	missions,
	now,
	previews,
	rosteredSpaceId,
	soloThreads,
	working,
}: RosterBotsInput) => {
	// React Compiler hoists probeRender out of the memo, which would make the
	// rosterBots count of PRF1 render baseline read one per render instead of one per recompute
	"use no memo"

	return useMemo(() => {
		probeRender("rosterBots")
		const botStates = botHostStatesIn({
			hostStates,
			soloThreads,
			spaceId: rosteredSpaceId,
		})
		return withMissions(
			withNeedsYou(
				withLineBadges(
					toRosterBots(
						bots,
						{
							working: workingFromHost(
								botStates,
								activityIn(working, rosteredSpaceId),
							),
							previews: previewsIn(previews, rosteredSpaceId),
						},
						now,
					),
					badges,
					rosteredSpaceId,
				),
				botStates,
			),
			missionsIn(missions, rosteredSpaceId),
		)
	}, [
		bots,
		hostStates,
		rosteredSpaceId,
		soloThreads,
		working,
		previews,
		now,
		badges,
		missions,
	])
}
