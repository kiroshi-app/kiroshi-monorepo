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
import {
	toRailSignals,
	toSpaceBadges,
	withBadges,
} from "../chat/sidebar-badges"
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
	const { conversationRuntimes, roster } = core
	const { badges, conversationBadges } = drivers
	const { now, rosters, working } = rosterLines
	const { bots, missions, rosteredSpaceId } = rosterView
	const { conversationPreviews, conversationRosters, conversations, previews } =
		useControllerState(roster.controller)
	const personOfSpace = useSpacePersonOf(core)

	const rosterBots = useSharedStructure(
		useRosterBots({
			badges,
			bots,
			missions,
			now,
			previews,
			rosteredSpaceId,
			working,
		}),
	)

	const rosterBotsBySpace = useSharedStructure(
		useRosterBotsBySpace({
			badges,
			missions,
			now,
			previews,
			rosters,
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
					withBadges(
						toRosterConversations(
							conversations,
							{
								working: conversationWorkers,
								previews: conversationPreviews,
								personOf: personOfSpace(rosteredSpaceId),
							},
							now,
						),
						conversationBadges,
					),
					missionsIn(missions, rosteredSpaceId),
				),
			[
				conversations,
				rosteredSpaceId,
				conversationWorkers,
				conversationPreviews,
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
							withBadges(
								toRosterConversations(
									spaceRooms,
									{
										working: conversationWorkers,
										previews: conversationPreviews,
										personOf: personOfSpace(spaceId),
									},
									now,
								),
								conversationBadges,
							),
							missionsIn(missions, spaceId),
						),
					]),
				),
			[
				conversationRosters,
				conversationWorkers,
				conversationPreviews,
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
