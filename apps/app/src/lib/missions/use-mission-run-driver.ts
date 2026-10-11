import { useEffect } from "react"

import { raiseFailureNotice } from "@workspace/ui/components/notice-surface"

import { startMissionRunDriver } from "./mission-run-driver"
import { missionsTransport } from "./missions-transport"

import { activeJoinedSpaceId, onJoinedSpaceChange } from "../host"
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
				store,
				runtimes,
				chat,
				missions: missionsTransport,
				reportFailure: raiseFailureNotice,
				joinedSpaceId: activeJoinedSpaceId,
				watchJoinedSpace: onJoinedSpaceChange,
			}),
		[driver, store, runtimes, chat],
	)
}
