import {
	createElement,
	useCallback,
	useMemo,
	useSyncExternalStore,
} from "react"

import { MissionsFeedSkeleton } from "@workspace/ui/components/missions-feed-skeleton"
import type { MissionsPageRowWrap } from "@workspace/ui/components/missions-page"
import type { MissionsPanelProps } from "@workspace/ui/components/missions-panel"
import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"

import {
	type StoppableRuntimes,
	useMissionMenus,
} from "@/components/mission-card-menu"
import type { RosterController } from "../bots/roster-controller"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { MissionLanding } from "../missions/mission-actions"
import {
	botFacesOf,
	missionEntriesOf,
	missionRowIdOf,
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
import type { ConversationTabOpening } from "../tabs/conversation-tab-opening"
import { opensInNewTab } from "../tabs/new-tab-clicks"

const MISSIONS_FEED_SKELETON = createElement(MissionsFeedSkeleton)

type SidebarMissionsCore = {
	conversationOpening: Pick<ConversationTabOpening, "open">
	conversationRuntimes: MissionSpeakingRuntimes & StoppableRuntimes
	openedMission: Pick<
		OpenedMissionController,
		"open" | "getState" | "subscribe"
	>
	roster: {
		state: {
			rosters: Record<string, Bot[]>
			conversationRosters: Record<string, Conversation[]>
			spaceRowId: string | null
		}
		controller: Pick<RosterController, "select" | "selectConversation">
	}
	spaces: { state: { selectedSpaceId: string | null } }
}

type SidebarMissionsInput = {
	core: SidebarMissionsCore
	rosterLines: { now: number }
	navigation: Pick<SettingsNavigation, "openThread" | "openThreadInNewTab">
}

export type SidebarMissions = {
	panelsBySpaceId: Record<string, MissionsPanelProps>
	waitingCount: number
	openCount: number
	openMissionId: string | undefined
	openMissionThread: (missionId: string) => void
	wrapPageRow: MissionsPageRowWrap
}

const listedConversationIdsOf = (
	conversationRosters: Record<string, Conversation[]>,
	spaceId: string | null,
) =>
	new Set(
		(spaceId === null ? [] : (conversationRosters[spaceId] ?? [])).map(
			({ id }) => id,
		),
	)

export const useSidebarMissions = ({
	core,
	rosterLines,
	navigation,
}: SidebarMissionsInput): SidebarMissions => {
	const {
		conversationOpening,
		conversationRuntimes,
		openedMission,
		roster,
		spaces,
	} = core
	const { now } = rosterLines
	const feed = useSpaceMissions(spaces.state.selectedSpaceId)
	const { spaceRowId } = roster.state
	useSpaceMissionsFailure(feed)
	const feedSkeleton = useSkeletonSlot(feed.isPending, MISSIONS_FEED_SKELETON)

	const entries = useMemo(() => missionEntriesOf(feed), [feed])
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
		() => botFacesOf(roster.state.rosters),
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
			const openMissionThread = () =>
				openedMission.open({ missionId, rowId, spaceId: spaceRowId, landing })
			if (!isConversation) {
				openMissionThread()
				roster.controller.select(rowId)
				return
			}
			void conversationOpening.open({
				conversationId: rowId,
				mission: missionId,
				openInPlace: () => {
					openMissionThread()
					roster.controller.selectConversation(rowId)
				},
			})
		},
		[
			missionRowOf,
			roster.controller,
			openedMission,
			spaceRowId,
			conversationOpening,
		],
	)

	const missionThreadOf = useCallback(
		(missionId: string) => {
			const row = missionRowOf(missionId)
			if (!row) {
				return null
			}
			return row.isConversation
				? { conversation: row.rowId, mission: missionId }
				: { bot: row.rowId, mission: missionId }
		},
		[missionRowOf],
	)

	const openMissionInNewTab = useCallback(
		(missionId: string) => {
			const thread = missionThreadOf(missionId)
			if (thread) {
				navigation.openThreadInNewTab(thread)
			}
		},
		[missionThreadOf, navigation],
	)

	const openMissionThread = useCallback(
		(missionId: string) => {
			const thread = missionThreadOf(missionId)
			if (thread) {
				navigation.openThread(thread)
			}
		},
		[missionThreadOf, navigation],
	)

	const openFromPanel = useCallback(
		(missionId: string, _conversationId: string, modifiers: ClickModifiers) =>
			opensInNewTab(modifiers)
				? openMissionInNewTab(missionId)
				: openMission(missionId),
		[openMission, openMissionInNewTab],
	)

	const { wrapCard: wrap, wrapPageRow } = useMissionMenus({
		missions,
		runtimes: conversationRuntimes,
		onOpenMission: openMission,
		onChanged: feed.reload,
	})

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
		panelsBySpaceId,
		waitingCount: feed.waitingCount,
		openCount: feed.openCount,
		openMissionId: opened?.missionId,
		openMissionThread,
		wrapPageRow,
	}
}
