import {
	createElement,
	useCallback,
	useMemo,
	useSyncExternalStore,
} from "react"

import { MissionsFeedSkeleton } from "@workspace/ui/components/missions-feed-skeleton"
import type { MissionsPanelProps } from "@workspace/ui/components/missions-panel"
import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"

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
import type { SettingsNavigation } from "../navigation/use-settings-navigation"
import { useSkeletonSlot } from "../query/use-skeleton-slot"
import type { ShownMemory } from "../sidebar/shown-memory"
import { opensInNewTab } from "../tabs/new-tab-clicks"

const MISSIONS_FEED_SKELETON = createElement(MissionsFeedSkeleton)

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
	navigation: Pick<SettingsNavigation, "openThreadInNewTab">
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
	navigation,
}: SidebarMissionsInput): SidebarMissions => {
	const { conversationRuntimes, openedMission, roster, shownMemory, spaces } =
		core
	const { now } = rosterLines
	const feed = useSpaceMissions(spaces.state.selectedSpaceId)
	const { spaceRowId } = roster.state
	useSpaceMissionsFailure(feed)
	const feedSkeleton = useSkeletonSlot(feed.isPending, MISSIONS_FEED_SKELETON)

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

	const missionRowOf = useCallback(
		(missionId: string) => {
			const entry = entries.find(({ mission }) => mission.id === missionId)
			if (!entry) {
				return null
			}
			const { mission, conversationId } = entry
			const rowId = missionRowIdOf(
				conversationId,
				mission.botId,
				listedConversationIds,
			)
			return { rowId, isConversation: rowId === conversationId }
		},
		[entries, listedConversationIds],
	)

	const openMission = useCallback(
		(missionId: string, landing?: MissionLanding) => {
			const row = missionRowOf(missionId)
			if (!row || spaceRowId === null) {
				return
			}
			const { rowId, isConversation } = row
			openedMission.open({ missionId, rowId, spaceId: spaceRowId, landing })
			if (isConversation) {
				roster.controller.selectConversation(rowId)
			} else {
				roster.controller.select(rowId)
			}
		},
		[missionRowOf, roster.controller, openedMission, spaceRowId],
	)

	const openMissionInNewTab = useCallback(
		(missionId: string) => {
			const row = missionRowOf(missionId)
			if (!row) {
				return
			}
			navigation.openThreadInNewTab(
				row.isConversation
					? { conversation: row.rowId, mission: missionId }
					: { bot: row.rowId, mission: missionId },
			)
		},
		[missionRowOf, navigation],
	)

	const openFromPanel = useCallback(
		(missionId: string, _conversationId: string, modifiers: ClickModifiers) =>
			opensInNewTab(modifiers)
				? openMissionInNewTab(missionId)
				: openMission(missionId),
		[openMission, openMissionInNewTab],
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
			onOpen: openFromPanel,
			openMissionId: opened?.missionId ?? null,
			wrap,
			skeleton: feedSkeleton,
			listEnd: feed.listEnd,
		}
		return { [spaceRowId]: panel }
	}, [
		spaceRowId,
		feed,
		faces,
		liveMissionIds,
		now,
		openFromPanel,
		opened,
		wrap,
		feedSkeleton,
	])

	return {
		loadedSpaceId: feed.hasLoaded ? spaceRowId : null,
		panelsBySpaceId,
		showLastMission,
		waitingCount: feed.waitingCount,
	}
}
