import { useCallback, useMemo, useSyncExternalStore } from "react"

import type { MissionsPageProps } from "@workspace/ui/components/missions-page"

import {
	type StoppableRuntimes,
	useMissionMenus,
} from "@/components/mission-card-menu"
import type { RosterController } from "../bots/roster-controller"
import { faceOfBot } from "../chat/thread-contract"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { MissionLanding } from "../missions/mission-actions"
import {
	missionRowIdOf,
	type SpaceMissionGroups,
} from "../missions/missions-model"
import {
	missionsPageStatusOf,
	toMissionsPageMissions,
} from "../missions/missions-page-model"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import { useSpaceMissionsFailure } from "../missions/use-mission-failure-notices"
import { useSpaceMissions } from "../missions/use-space-missions"
import type { SettingsNavigation } from "../navigation/use-settings-navigation"
import type { ConversationTabOpening } from "../tabs/conversation-tab-opening"

type SidebarMissionsCore = {
	conversationOpening: Pick<ConversationTabOpening, "open">
	conversationRuntimes: StoppableRuntimes
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
	navigation: Pick<SettingsNavigation, "openThread">
}

type MissionsPageFeed = Pick<
	MissionsPageProps,
	"missions" | "status" | "onOpen" | "onRetry" | "wrap"
>

export type SidebarMissions = {
	openCount: number
	openMissionId: string | undefined
	page: MissionsPageFeed
}

const NO_CONVERSATIONS: Conversation[] = []

const facesOf = (rosters: Record<string, Bot[]>) =>
	new Map(
		Object.values(rosters).flatMap((bots) =>
			bots.map((bot) => [bot.id, faceOfBot(bot)] as const),
		),
	)

const listedConversationsOf = (
	conversationRosters: Record<string, Conversation[]>,
	spaceId: string | null,
) =>
	spaceId === null
		? NO_CONVERSATIONS
		: (conversationRosters[spaceId] ?? NO_CONVERSATIONS)

const entriesOf = ({
	waitingOnYou,
	inProgress,
	earlierToday,
}: SpaceMissionGroups) => [...waitingOnYou, ...inProgress, ...earlierToday]

export const useSidebarMissions = ({
	core,
	navigation,
}: SidebarMissionsInput): SidebarMissions => {
	const {
		conversationOpening,
		conversationRuntimes,
		openedMission,
		roster,
		spaces,
	} = core
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
	const faces = useMemo(
		() => facesOf(roster.state.rosters),
		[roster.state.rosters],
	)

	const listedConversations = listedConversationsOf(
		roster.state.conversationRosters,
		spaceRowId,
	)
	const listedConversationIds = useMemo(
		() => new Set(listedConversations.map(({ id }) => id)),
		[listedConversations],
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

	const openMissionThread = useCallback(
		(missionId: string) => {
			const row = missionRowOf(missionId)
			if (!row) {
				return
			}
			navigation.openThread(
				row.isConversation
					? { conversation: row.rowId, mission: missionId }
					: { bot: row.rowId, mission: missionId },
			)
		},
		[missionRowOf, navigation],
	)

	const { wrapPageRow } = useMissionMenus({
		missions,
		runtimes: conversationRuntimes,
		onOpenMission: openMission,
		onChanged: feed.reload,
	})

	const pageMissions = useMemo(
		() =>
			toMissionsPageMissions({
				entries,
				faceOf: (botId) => faces.get(botId),
				conversations: listedConversations,
			}),
		[entries, faces, listedConversations],
	)

	return {
		openCount: feed.openCount,
		openMissionId: opened?.missionId,
		page: {
			missions: pageMissions,
			status: missionsPageStatusOf(feed),
			onOpen: openMissionThread,
			onRetry: feed.reload,
			wrap: wrapPageRow,
		},
	}
}
