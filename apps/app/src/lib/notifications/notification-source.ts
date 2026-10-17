import type { NoticeMessage } from "@workspace/ui/components/notice-surface"

import type {
	ConversationRound,
	NotificationSwitches,
} from "./notification-policy"
import type { NotificationPort } from "./notification-port"
import { createDelivery, type Reading } from "./notification-source-delivery"
import { createFailWith } from "./notification-source-failures"
import { createNotificationLanding } from "./notification-source-landing"
import { createMissionThreadTracking } from "./notification-source-missions"
import {
	createNotificationRequests,
	type NotifiedBot,
} from "./notification-source-requests"
import { createSpokenWordNotifier } from "./notification-source-spoken"

import type { ChatState } from "../chat/chat-state"
import type { SpokenWords } from "../conversations/spoken-words"
import type { Conversation } from "../conversations/store-contract"
import type {
	Mission,
	MissionChanged,
	MissionOnBoard,
} from "../missions/mission-contract"
import type {
	MissionEvent,
	ReadMissionOfEvent,
} from "../missions/mission-event-read"
import type { OpenedMission } from "../missions/opened-mission-controller"
import type { UserPreferences } from "../user/preferences-contract"

type ChatSource = {
	stateFor: (botId: string) => ChatState
	subscribe: (listener: () => void) => () => void
}

type RuntimeSource = {
	heldFor: (
		conversationId: string,
	) => { getState: () => ConversationRound } | null
	subscribe: (listener: () => void) => () => void
}

type RosterSource = {
	getState: () => {
		rosters: Record<string, NotifiedBot[]>
		conversations: Conversation[]
		conversationRosters: Record<string, Conversation[]>
	}
	spaceOfConversation: (conversationId: string) => string | undefined
	hostSpaceIdOf: (spaceRowId: string) => string
	select: (botId: string) => void
	selectConversation: (conversationId: string) => void
}

type SpacesSource = {
	select: (spaceId: string) => void
}

type MissionsSource = {
	board: () => Promise<Pick<MissionOnBoard, "mission">[]>
	onChanged: (
		listener: (changed: MissionChanged, hostId?: string | null) => void,
	) => Promise<() => void>
	read: ReadMissionOfEvent
	open: (opened: OpenedMission) => void
}

export type NotificationSourceSwitches = NotificationSwitches &
	Pick<UserPreferences, "notifyWithSound">

type FailureNoticeReporter = (notice: NoticeMessage) => void

export type NotificationSourceOptions = {
	chat: ChatSource
	runtimes: RuntimeSource
	roster: RosterSource
	spaces: SpacesSource
	missions: MissionsSource
	spokenWords: Pick<SpokenWords, "subscribe">
	notifications: NotificationPort
	switches: () => NotificationSourceSwitches
	hasFocus: () => boolean
	watchFocus: (report: (isFocused: boolean) => void) => Promise<() => void>
	raiseWindow: () => Promise<void>
	playChime: () => void
	reportFailure: FailureNoticeReporter
}

export const startNotificationSource = ({
	chat,
	runtimes,
	roster,
	spaces,
	missions,
	spokenWords,
	notifications,
	switches,
	hasFocus,
	watchFocus,
	raiseWindow,
	playChime,
	reportFailure,
}: NotificationSourceOptions): (() => void) => {
	const missionThreads = new Map<string, Mission>()
	const missionOrigins = new Map<string, MissionEvent>()

	let windowFocus: boolean | undefined

	const currentFocus = (): boolean => windowFocus ?? hasFocus()

	const hasHostFocus = (): boolean => windowFocus === true

	const failWith = createFailWith(reportFailure)
	const deliver = createDelivery({ notifications, playChime, failWith })
	const { requestsFor, botNameOf } = createNotificationRequests({
		chat,
		runtimes,
		roster,
		missionThreads,
	})
	const notifySpokenWord = createSpokenWordNotifier({
		roster,
		switches,
		hasHostFocus,
		deliver,
	})
	const { missionChanged, catchUpOnMissionThreads } =
		createMissionThreadTracking({
			missions,
			switches,
			missionThreads,
			missionOrigins,
			currentFocus,
			botNameOf,
			deliver,
		})
	const activate = createNotificationLanding({
		chat,
		roster,
		spaces,
		missions,
		missionOrigins,
		raiseWindow,
		failWith,
	})

	const compare = () => {
		const reading: Reading = {
			switches: switches(),
			hasFocus: currentFocus(),
		}
		deliver(requestsFor(reading), reading)
	}

	const stopChat = chat.subscribe(compare)
	const stopRuntimes = runtimes.subscribe(compare)
	const stopSpokenWords = spokenWords.subscribe(notifySpokenWord)
	const missionChanges = missions
		.onChanged(
			(changed, hostId) =>
				void missionChanged(changed, hostId ?? null).catch(failWith("send")),
		)
		.catch(failWith("send"))
	void catchUpOnMissionThreads().catch(failWith("send"))
	const focus = watchFocus((isFocused) => {
		windowFocus = isFocused
	}).catch(failWith("focus"))
	const activation = notifications
		.onActivate(activate)
		.catch(failWith("clicks"))

	return () => {
		stopChat()
		stopRuntimes()
		stopSpokenWords()
		void missionChanges.then((stop) => stop?.())
		void focus.then((stop) => stop?.())
		void activation.then((stop) => stop?.())
	}
}
