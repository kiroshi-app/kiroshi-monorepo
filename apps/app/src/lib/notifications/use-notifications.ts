import { useEffect } from "react"

import { createNotifications } from "./create-notifications"
import { createChime } from "./notification-chime"
import { startNotificationSource } from "./notification-source"

import { failureReporterIn } from "../failure-report"
import { revealWindow, watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import type { ChatController } from "../chat/chat-controller"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { SpokenWords } from "../conversations/spoken-words"
import { missionsTransport } from "../missions/missions-transport"
import type { OpenedMissionController } from "../missions/opened-mission-controller"
import type { JoinedSpacesController } from "../spaces/joined-spaces-controller"
import type { SpacesController } from "../spaces/spaces-controller"
import type { UserController } from "../user/preferences-controller"

export type NotificationsMount = {
	chat: ChatController
	runtimes: ConversationRuntimes
	roster: RosterController
	spaces: SpacesController
	joinedSpaces: JoinedSpacesController
	missions: OpenedMissionController
	spokenWords: SpokenWords
	user: UserController
	isDriverWindow: boolean
}

export const useNotifications = ({
	chat,
	runtimes,
	roster,
	spaces,
	joinedSpaces,
	missions,
	spokenWords,
	user,
	isDriverWindow,
}: NotificationsMount) => {
	useEffect(() => {
		if (!isDriverWindow) {
			return
		}
		return startNotificationSource({
			chat,
			runtimes,
			roster,
			spaces,
			joinedSpaces,
			missions: {
				board: missionsTransport.board,
				onChanged: missionsTransport.onChanged,
				read: missionsTransport.read,
				open: missions.open,
			},
			spokenWords,
			notifications: createNotifications(),
			switches: () => user.getState().preferences,
			hasFocus: () => document.hasFocus(),
			watchFocus: watchWindowFocus,
			raiseWindow: () => revealWindow({ withFocus: true }),
			playChime: createChime(),
			reportFailure: failureReporterIn("notification-source"),
		})
	}, [
		chat,
		runtimes,
		roster,
		spaces,
		joinedSpaces,
		missions,
		spokenWords,
		user,
		isDriverWindow,
	])
}
