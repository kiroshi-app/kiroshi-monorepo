import { useCallback, useMemo, useSyncExternalStore } from "react"

import type { MissionsPanelProps } from "@workspace/ui/components/missions-panel"

import {
	type StoppableRuntimes,
	useMissionCardMenus,
} from "@/components/mission-card-menu"
import type { RosterController } from "../bots/roster-controller"
import { faceOfBot } from "../chat/thread-contract"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { MissionLanding } from "../missions/mission-actions"
import {
	missionRowIdOf,
	type SpaceMissionGroups,
	toMissionsPanel,
} from "../missions/missions-model"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import {
	type MissionSpeakingRuntimes,
	useLiveMissions,
} from "../missions/use-live-missions"
import { useSpaceMissionsFailure } from "../missions/use-mission-failure-notices"
import { useSpaceMissions } from "../missions/use-space-missions"
import type { ShownMemory } from "../sidebar/shown-memory"

type SidebarMissionsCore = {
	conversationRuntimes: MissionSpeakingRuntimes & StoppableRuntimes
	openedMission: Pick<
		OpenedMissionController,
		"open" | "leave" | "getState" | "subscribe"
	>
	roster: {
		state: {
			rosters: Record<string, Bot[]>
			conversationRosters: Record<string, Conversation[]>
			spaceRowId: string | null
		}
		controller: Pick<RosterController, "select" | "selectConversation">
	}
	shownMemory: Pick<ShownMemory, "lastMissionIn">
	spaces: { state: { selectedSpaceId: string | null } }
}

type SidebarMissionsInput = {
	core: SidebarMissionsCore
	rosterLines: { now: number }
}

export type SidebarMissions = {
	loadedSpaceId: string | null
	panelsBySpaceId: Record<string, MissionsPanelProps>
	showLastMission: () => void
	waitingCount: number
}

const facesOf = (rosters: Record<string, Bot[]>) =>
	new Map(
		Object.values(rosters).flatMap((bots) =>
			bots.map((bot) => [bot.id, faceOfBot(bot)] as const),
		),
	)

const listedConversationIdsOf = (
	conversationRosters: Record<string, Conversation[]>,
	spaceId: string | null,
) =>
	new Set(
		(spaceId === null ? [] : (conversationRosters[spaceId] ?? [])).map(
			({ id }) => id,
		),
	)

const entriesOf = ({
	waitingOnYou,
	inProgress,
	earlierToday,
}: SpaceMissionGroups) => [...waitingOnYou, ...inProgress, ...earlierToday]

export const useSidebarMissions = ({
	core,
	rosterLines,
}: SidebarMissionsInput): SidebarMissions => {
	const { conversationRuntimes, openedMission, roster, shownMemory, spaces } =
		core
	const { now } = rosterLines
	const feed = useSpaceMissions(spaces.state.selectedSpaceId)
	const { spaceRowId } = roster.state
	useSpaceMissionsFailure(feed)

	const entries = useMemo(() => entriesOf(feed), [feed])
	const missions = useMemo(
		() => entries.map(({ mission }) => mission),
		[entries],
	)
	const opened = useSyncExternalStore(
		openedMission.subscribe,
		openedMission.getState,
	)
	const liveMissionIds = useLiveMissions(conversationRuntimes, missions, now)
	const faces = useMemo(
		() => facesOf(roster.state.rosters),
		[roster.state.rosters],
	)

	const listedConversationIds = useMemo(
		() => listedConversationIdsOf(roster.state.conversationRosters, spaceRowId),
		[roster.state.conversationRosters, spaceRowId],
	)

	const openMission = useCallback(
		(missionId: string, landing?: MissionLanding) => {
			const entry = entries.find(({ mission }) => mission.id === missionId)
			if (!entry) {
				return
			}
			const { mission, conversationId } = entry
			const rowId = missionRowIdOf(
				conversationId,
				mission.botId,
				listedConversationIds,
			)
			openedMission.open({
				missionId,
				rowId,
				spaceId: spaceRowId ?? undefined,
				landing,
			})
			if (rowId === conversationId) {
				roster.controller.selectConversation(rowId)
			} else {
				roster.controller.select(rowId)
			}
		},
		[
			entries,
			listedConversationIds,
			roster.controller,
			openedMission,
			spaceRowId,
		],
	)

	const wrap = useMissionCardMenus({
		missions,
		runtimes: conversationRuntimes,
		onOpenMission: openMission,
		onChanged: feed.reload,
	})

	const showLastMission = useCallback(() => {
		const lastMissionId =
			spaceRowId === null ? null : shownMemory.lastMissionIn(spaceRowId)
		const shown =
			entries.find(({ mission }) => mission.id === lastMissionId) ?? entries[0]
		if (!shown) {
			openedMission.leave()
			return
		}
		openMission(shown.mission.id)
	}, [spaceRowId, shownMemory, entries, openedMission, openMission])

	const panelsBySpaceId = useMemo(() => {
		if (spaceRowId === null) return {}
		const panel = {
			...toMissionsPanel({
				groups: feed,
				faceOf: (botId) => faces.get(botId),
				liveMissionIds,
				now,
			}),
			onOpen: (missionId: string) => openMission(missionId),
			openMissionId: opened?.missionId ?? null,
			wrap,
		}
		return { [spaceRowId]: panel }
	}, [spaceRowId, feed, faces, liveMissionIds, now, openMission, opened, wrap])

	return {
		loadedSpaceId: feed.hasLoaded ? spaceRowId : null,
		panelsBySpaceId,
		showLastMission,
		waitingCount: feed.waitingCount,
	}
}
