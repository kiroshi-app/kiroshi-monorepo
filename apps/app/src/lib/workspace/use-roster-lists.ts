import { createElement, useMemo } from "react"

import { SidebarListSkeleton } from "@workspace/ui/components/sidebar-list-skeleton"

import { useRosterBots } from "./use-roster-bots"
import { useRosterBotsBySpace } from "./use-roster-bots-by-space"
import type { RosterLines } from "./use-roster-lines"
import type { RosterView } from "./use-roster-view"
import { useSpacePersonOf } from "./use-space-person-of"
import type { WorkspaceCore } from "./use-workspace-core"
import type { WorkspaceDrivers } from "./use-workspace-drivers"

import { useControllerState } from "../use-controller"
import { useSharedStructure } from "../use-shared-structure"
import { questionsByConversationIn } from "../agent/pending-questions"
import { usePendingQuestions } from "../agent/use-pending-questions"
import {
	toRailSignals,
	toSpaceBadges,
	withBadges,
} from "../chat/sidebar-badges"
import { withNeedsYou } from "../conversations/host-state-rows"
import { toRosterConversations } from "../conversations/roster-conversations"
import { useConversationWorkers } from "../conversations/use-conversation"
import {
	missionRingBadges,
	missionsIn,
	withMissions,
} from "../missions/missions-model"
import { useSkeletonSlot } from "../query/use-skeleton-slot"

const ROSTER_SKELETON = createElement(SidebarListSkeleton)

type RosterListsInput = {
	core: WorkspaceCore
	drivers: WorkspaceDrivers
	rosterLines: RosterLines
	rosterView: RosterView
	waitingMissionCount: number
}

export const useRosterLists = ({
	core,
	drivers,
	rosterLines,
	rosterView,
	waitingMissionCount,
}: RosterListsInput) => {
	const { conversationRuntimes, driver, roster } = core
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
	const pendingQuestions = usePendingQuestions({
		driver,
		roster: roster.controller,
		spaceRowId: rosteredSpaceId,
	})

	const rosterBots = useSharedStructure(
		useRosterBots({
			badges,
			bots,
			conversations,
			hostStates,
			missions,
			now,
			pendingQuestions,
			previews,
			rosteredSpaceId,
			soloThreads,
			working,
		}),
	)

	const rosterBotsBySpace = useSharedStructure(
		useRosterBotsBySpace({
			badges,
			conversationRosters,
			hostStates,
			missions,
			now,
			pendingQuestions,
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
									personOf: personOfSpace(rosteredSpaceId),
								},
								now,
							),
							conversationBadges,
						),
						hostStates,
						questionsByConversationIn(pendingQuestions, rosteredSpaceId),
					),
					missionsIn(missions, rosteredSpaceId),
				),
			[
				conversations,
				hostStates,
				rosteredSpaceId,
				conversationWorkers,
				conversationPreviews,
				personOfSpace,
				now,
				conversationBadges,
				missions,
				pendingQuestions,
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
											personOf: personOfSpace(spaceId),
										},
										now,
									),
									conversationBadges,
								),
								hostStates,
								questionsByConversationIn(pendingQuestions, spaceId),
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
				personOfSpace,
				now,
				conversationBadges,
				missions,
				pendingQuestions,
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

	const rosterSkeleton = useSkeletonSlot(
		roster.state.isRosterPending,
		ROSTER_SKELETON,
	)

	const railSignals = useMemo(
		() =>
			toRailSignals({
				conversationsBySpaceId: rosterConversationsBySpace,
				waitingMissionCount,
				spaceId: rosteredSpaceId,
			}),
		[rosterConversationsBySpace, waitingMissionCount, rosteredSpaceId],
	)

	return {
		badgesBySpaceId,
		railSignals,
		rosterBots,
		rosterBotsBySpace,
		rosterConversations,
		rosterConversationsBySpace,
		rosterSkeleton,
	}
}
