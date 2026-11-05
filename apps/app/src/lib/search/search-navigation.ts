import type { RosterController } from "@/lib/bots/roster-controller"
import type { OpenedMissionController } from "@/lib/missions/opened-mission-controller"
import type { ThreadSearch } from "@/lib/navigation/thread-search"
import type { SettingsNavigation } from "@/lib/navigation/use-settings-navigation"
import type { OpenedRoutineController } from "@/lib/routines/opened-routine-controller"
import type {
	MessageLanding,
	MessageLandingController,
} from "@/lib/search/message-landing-controller"
import type { SpacesController } from "@/lib/spaces/spaces-controller"
import type { ConversationTabOpening } from "@/lib/tabs/conversation-tab-opening"
import type { UserController } from "@/lib/user/preferences-controller"

export type SearchRow = {
	kind: "bot" | "conversation"
	id: string
}

export type SearchTarget =
	| {
			kind: "chat"
			row: SearchRow
			spaceId: string | null
			landing?: MessageLanding
	  }
	| { kind: "mission"; missionId: string; botId: string; spaceId: string }
	| {
			kind: "routine"
			routineId: string
			row: SearchRow
			conversationId: string
			spaceId: string
	  }

export type SearchNavigation = {
	selectBot: (botId: string) => void
	selectConversation: (conversationId: string) => void
	selectSpace: (spaceId: string) => void
	openMission: (opened: {
		missionId: string
		rowId: string
		spaceId: string
	}) => void
	leaveMission: () => void
	openRoutine: (opened: { routineId: string; conversationId: string }) => void
	openActivityPanel: () => void
	recordLanding: (landing: MessageLanding) => void
	openThreadInNewTab: (thread: ThreadSearch, spaceId?: string) => void
	openConversation: ConversationTabOpening["open"]
}

type RowTarget = Extract<SearchTarget, { row: SearchRow }>

const recordLandingOf = (target: RowTarget, navigation: SearchNavigation) => {
	if (target.kind === "chat" && target.landing) {
		navigation.recordLanding(target.landing)
	}
}

const showRow = ({ row, spaceId }: RowTarget, navigation: SearchNavigation) => {
	if (row.kind === "bot") {
		navigation.selectBot(row.id)
	} else {
		navigation.selectConversation(row.id)
	}
	if (spaceId) {
		navigation.selectSpace(spaceId)
	}
}

const openRow = (target: RowTarget, navigation: SearchNavigation) => {
	if (target.row.kind === "bot") {
		navigation.leaveMission()
		recordLandingOf(target, navigation)
		showRow(target, navigation)
		return
	}
	recordLandingOf(target, navigation)
	void navigation.openConversation({
		conversationId: target.row.id,
		openInPlace: () => {
			navigation.leaveMission()
			showRow(target, navigation)
		},
	})
}

export const openSearchTarget = (
	target: SearchTarget,
	navigation: SearchNavigation,
) => {
	if (target.kind === "mission") {
		navigation.selectBot(target.botId)
		navigation.selectSpace(target.spaceId)
		navigation.openMission({
			missionId: target.missionId,
			rowId: target.botId,
			spaceId: target.spaceId,
		})
		return
	}

	openRow(target, navigation)

	if (target.kind === "routine") {
		navigation.openActivityPanel()
		navigation.openRoutine({
			routineId: target.routineId,
			conversationId: target.conversationId,
		})
	}
}

const threadOfSearchTarget = (target: SearchTarget): ThreadSearch => {
	if (target.kind === "mission") {
		return { bot: target.botId, mission: target.missionId }
	}
	return target.row.kind === "bot"
		? { bot: target.row.id }
		: { conversation: target.row.id }
}

export const openSearchTargetInNewTab = (
	target: SearchTarget,
	openSpaceId: string | null,
	navigation: SearchNavigation,
) => {
	const thread = threadOfSearchTarget(target)
	if (target.spaceId === null || target.spaceId === openSpaceId) {
		navigation.openThreadInNewTab(thread)
		return
	}
	navigation.openThreadInNewTab(thread, target.spaceId)
}

export type SearchNavigationSource = {
	roster: Pick<RosterController, "select" | "selectConversation">
	spaces: Pick<SpacesController, "select">
	missions: Pick<OpenedMissionController, "open" | "leave">
	routines: Pick<OpenedRoutineController, "open">
	landings: Pick<MessageLandingController, "record">
	user: Pick<UserController, "setActivityPanelOpen">
	threads: Pick<SettingsNavigation, "openThreadInNewTab">
	conversations: Pick<ConversationTabOpening, "open">
}

export const createSearchNavigation = ({
	roster,
	spaces,
	missions,
	routines,
	landings,
	user,
	threads,
	conversations,
}: SearchNavigationSource): SearchNavigation => ({
	selectBot: roster.select,
	selectConversation: roster.selectConversation,
	selectSpace: spaces.select,
	openMission: missions.open,
	leaveMission: missions.leave,
	openRoutine: routines.open,
	openActivityPanel: () => void user.setActivityPanelOpen(true),
	recordLanding: landings.record,
	openThreadInNewTab: threads.openThreadInNewTab,
	openConversation: conversations.open,
})
