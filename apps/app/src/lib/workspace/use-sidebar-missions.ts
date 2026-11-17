import { useCallback, useMemo, useSyncExternalStore } from "react"

import type { MissionTreeRowWrap } from "@workspace/ui/components/mission-capsule"
import type { MissionsPageProps } from "@workspace/ui/components/missions-page"
import { i18n } from "@workspace/ui/lib/i18n"

import { failureReporterIn } from "../failure-report"
import {
	type StoppableRuntimes,
	useMissionMenus,
} from "@/components/mission-card-menu"
import type { RosterController } from "../bots/roster-controller"
import { faceOfBot } from "../chat/thread-contract"
import type { Bot, Conversation } from "../conversations/store-contract"
import type { MissionLanding } from "../missions/mission-actions"
import type { Mission } from "../missions/mission-contract"
import {
	type MissionEntry,
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
	missionMarks: MissionEntry[]
	navigation: Pick<SettingsNavigation, "openThread">
}

type MissionsPageFeed = Pick<
	MissionsPageProps,
	"missions" | "status" | "onOpen" | "onRetry" | "wrap"
>

export type SidebarMissions = {
	openCount: number
	openMissionId: string | undefined
	wrapSidebarRow: MissionTreeRowWrap
	page: MissionsPageFeed
}

type PlacedMission = {
	mission: Mission
	conversationId: string
}

const NO_CONVERSATIONS: Conversation[] = []

const reportUnopened = failureReporterIn("use-sidebar-missions")

const raiseUnopened = (missionId: string) =>
	reportUnopened(
		{
			title: i18n.t("bots:roster.mission.unavailable.title"),
			description: i18n.t("bots:roster.mission.unavailable.description"),
		},
		{ mission: missionId },
	)

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

const withMarksOutsideFeed = (
	entries: PlacedMission[],
	missionMarks: MissionEntry[],
): PlacedMission[] => {
	const fedIds = new Set(entries.map(({ mission }) => mission.id))
	const unfedMarks = missionMarks
		.filter(({ mission }) => !fedIds.has(mission.id))
		.map(({ mission }) => ({
			mission,
			conversationId: mission.originConversationId,
		}))
	return [...entries, ...unfedMarks]
}

export const useSidebarMissions = ({
	core,
	missionMarks,
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
	const knownEntries = useMemo(
		() => withMarksOutsideFeed(entries, missionMarks),
		[entries, missionMarks],
	)
	const knownMissions = useMemo(
		() => knownEntries.map(({ mission }) => mission),
		[knownEntries],
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
			const entry = knownEntries.find(({ mission }) => mission.id === missionId)
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
		[knownEntries, listedConversationIds],
	)

	const openMission = useCallback(
		(missionId: string, landing?: MissionLanding) => {
			const row = missionRowOf(missionId)
			if (!row || spaceRowId === null) {
				void raiseUnopened(missionId)
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
				void raiseUnopened(missionId)
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

	const { wrapPageRow, wrapSidebarRow } = useMissionMenus({
		missions: knownMissions,
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
		wrapSidebarRow,
		page: {
			missions: pageMissions,
			status: missionsPageStatusOf(feed),
			onOpen: openMissionThread,
			onRetry: feed.reload,
			wrap: wrapPageRow,
		},
	}
}
