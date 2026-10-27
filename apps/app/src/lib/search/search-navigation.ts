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
	openThreadInNewTab: (thread: ThreadSearch) => void
}

const selectRow = (row: SearchRow, navigation: SearchNavigation) => {
	if (row.kind === "bot") {
		navigation.selectBot(row.id)
		return
	}
	navigation.selectConversation(row.id)
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

	navigation.leaveMission()

	if (target.kind === "chat" && target.landing) {
		navigation.recordLanding(target.landing)
	}

	selectRow(target.row, navigation)

	if (target.spaceId) {
		navigation.selectSpace(target.spaceId)
	}

	if (target.kind === "routine") {
		navigation.openActivityPanel()
		navigation.openRoutine({
			routineId: target.routineId,
			conversationId: target.conversationId,
		})
	}
}

export const threadOfSearchTarget = (target: SearchTarget): ThreadSearch => {
	if (target.kind === "mission") {
		return { bot: target.botId, mission: target.missionId }
	}
	return target.row.kind === "bot"
		? { bot: target.row.id }
		: { conversation: target.row.id }
}

export type SearchNavigationSource = {
	roster: Pick<RosterController, "select" | "selectConversation">
	spaces: Pick<SpacesController, "select">
	missions: Pick<OpenedMissionController, "open" | "leave">
	routines: Pick<OpenedRoutineController, "open">
	landings: Pick<MessageLandingController, "record">
	user: Pick<UserController, "setActivityPanelOpen">
	threads: Pick<SettingsNavigation, "openThreadInNewTab">
}

export const createSearchNavigation = ({
	roster,
	spaces,
	missions,
	routines,
	landings,
	user,
	threads,
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
})
