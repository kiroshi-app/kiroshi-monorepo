import { useMemo } from "react"

import type { ExpandedSidebarListStatus } from "@workspace/ui/components/expanded-sidebar"
import { useSkeletonTiming } from "@workspace/ui/hooks/use-skeleton-timing"

import { useRosterBots } from "./use-roster-bots"
import { useRosterBotsBySpace } from "./use-roster-bots-by-space"
import type { RosterLines } from "./use-roster-lines"
import type { RosterView } from "./use-roster-view"
import { useSpacePersonOf } from "./use-space-person-of"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useControllerState } from "../use-controller"
import { useSharedStructure } from "../use-shared-structure"
import { toSpaceBadges, withBadges } from "../chat/sidebar-badges"
import { withNeedsYou } from "../conversations/host-state-rows"
import { toRosterConversations } from "../conversations/roster-conversations"
import {
	useConversationWorkers,
	useNotSentConversations,
} from "../conversations/use-conversation"
import {
	missionRingBadges,
	missionsIn,
	withMissions,
} from "../missions/missions-model"

type RosterListStatusInput = {
	isSkeletonShown: boolean
	hasFailedToLoad: boolean
	isEmpty: boolean
}

const rosterListStatusOf = ({
	isSkeletonShown,
	hasFailedToLoad,
	isEmpty,
}: RosterListStatusInput): ExpandedSidebarListStatus => {
	if (isSkeletonShown) return "loading"
	if (hasFailedToLoad && isEmpty) return "failed"
	return "ready"
}

type RosterListsInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterLines: RosterLines
	rosterView: RosterView
}

export const useRosterLists = ({
	core,
	drivers,
	rosterLines,
	rosterView,
}: RosterListsInput) => {
	const { conversationRuntimes, roster } = core
	const { badges, conversationBadges } = drivers
	const { now, rosters, working } = rosterLines
	const { bots, missions, rosteredSpaceId, soloThreads } = rosterView
	const {
		conversationPreviews,
		conversationRosters,
		conversations,
		hostStates,
		previews,
	} = useControllerState(roster.controller)
	const personOfSpace = useSpacePersonOf(core)

	const rosterBots = useSharedStructure(
		useRosterBots({
			badges,
			bots,
			hostStates,
			missions,
			now,
			previews,
			rosteredSpaceId,
			soloThreads,
			working,
		}),
	)

	const rosterBotsBySpace = useSharedStructure(
		useRosterBotsBySpace({
			badges,
			hostStates,
			missions,
			now,
			previews,
			rosters,
			soloThreads,
			working,
		}),
	)

	const rosteredConversations = useMemo(
		() => Object.values(conversationRosters).flat(),
		[conversationRosters],
	)

	const conversationWorkers = useConversationWorkers(
		conversationRuntimes,
		rosteredConversations,
	)

	const notSentConversations = useNotSentConversations(
		conversationRuntimes,
		rosteredConversations,
	)

	const rosterConversations = useSharedStructure(
		useMemo(
			() =>
				withMissions(
					withNeedsYou(
						withBadges(
							toRosterConversations(
								conversations,
								{
									hostStates,
									working: conversationWorkers,
									previews: conversationPreviews,
									notSent: notSentConversations,
									personOf: personOfSpace(rosteredSpaceId),
								},
								now,
							),
							conversationBadges,
						),
						hostStates,
					),
					missionsIn(missions, rosteredSpaceId),
				),
			[
				conversations,
				hostStates,
				rosteredSpaceId,
				conversationWorkers,
				conversationPreviews,
				notSentConversations,
				personOfSpace,
				now,
				conversationBadges,
				missions,
			],
		),
	)

	const rosterConversationsBySpace = useSharedStructure(
		useMemo(
			() =>
				Object.fromEntries(
					Object.entries(conversationRosters).map(([spaceId, spaceRooms]) => [
						spaceId,
						withMissions(
							withNeedsYou(
								withBadges(
									toRosterConversations(
										spaceRooms,
										{
											hostStates,
											working: conversationWorkers,
											previews: conversationPreviews,
											notSent: notSentConversations,
											personOf: personOfSpace(spaceId),
										},
										now,
									),
									conversationBadges,
								),
								hostStates,
							),
							missionsIn(missions, spaceId),
						),
					]),
				),
			[
				conversationRosters,
				hostStates,
				conversationWorkers,
				conversationPreviews,
				notSentConversations,
				personOfSpace,
				now,
				conversationBadges,
				missions,
			],
		),
	)

	const badgesBySpaceId = useMemo(
		() =>
			toSpaceBadges(
				rosterBotsBySpace,
				rosterConversationsBySpace,
				missionRingBadges(rosterBotsBySpace),
				missionRingBadges(rosterConversationsBySpace),
			),
		[rosterBotsBySpace, rosterConversationsBySpace],
	)

	const rosterSkeletonPhase = useSkeletonTiming(roster.state.isRosterPending)
	const expandedListStatus = rosterListStatusOf({
		hasFailedToLoad: roster.state.hasFailedToLoad,
		isEmpty: rosterConversations.length === 0,
		isSkeletonShown:
			rosterSkeletonPhase === "skeleton" || roster.state.isRosterPending,
	})

	return {
		badgesBySpaceId,
		expandedListStatus,
		rosterBots,
		rosterBotsBySpace,
		rosterConversations,
		rosterConversationsBySpace,
	}
}

export type RosterLists = ReturnType<typeof useRosterLists>
