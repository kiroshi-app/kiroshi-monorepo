import { useEffect } from "react"

import { startMissionRunDriver } from "./mission-run-driver"
import { missionRunTransport } from "./missions-transport"

import { failureReporterIn } from "../failure-report"
import type { ChatController } from "../chat/chat-controller"
import type { ChatDriver } from "../chat/driver"
import type { ConversationRuntimes } from "../conversations/conversation-runtimes"
import type { TranscriptStore } from "../conversations/store-port"

export type MissionRunDriverMount = {
	driver: ChatDriver
	store: TranscriptStore
	runtimes: ConversationRuntimes
	chat: ChatController
}

export const useMissionRunDriver = ({
	driver,
	store,
	runtimes,
	chat,
}: MissionRunDriverMount) => {
	useEffect(
		() =>
			startMissionRunDriver({
				driver,
				store: {
					openRuntimeSession: store.openRuntimeSession,
					bots: missionRunTransport.bots,
					mainChat: missionRunTransport.mainChat,
				},
				runtimes,
				chat,
				missions: missionRunTransport,
				reportFailure: failureReporterIn("mission-run-driver"),
			}),
		[driver, store, runtimes, chat],
	)
}
