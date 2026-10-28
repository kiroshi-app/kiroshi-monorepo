import { useState } from "react"

import { createConversationBadgeSource } from "./conversation-badge-source"
import type { ConversationRuntimes } from "./conversation-runtimes"
import type { SpokenWords } from "./spoken-words"

import { watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"
import { conversationBadgeChannel } from "../chat/badge-channel"
import type { BotBadge } from "../chat/bot-badge"
import { useSharedBadges } from "../chat/use-shared-badges"

export type ConversationBadgesMount = {
	runtimes: ConversationRuntimes
	roster: RosterController
	spokenWords: SpokenWords
	isDriverWindow: boolean
}

export const useConversationBadges = ({
	runtimes,
	roster,
	spokenWords,
	isDriverWindow,
}: ConversationBadgesMount): Record<string, BotBadge> => {
	const [source] = useState(() =>
		createConversationBadgeSource({
			runtimes,
			roster,
			spokenWords,
			hasFocus: () => document.hasFocus(),
			watchFocus: watchWindowFocus,
		}),
	)

	return useSharedBadges(source, conversationBadgeChannel, isDriverWindow)
}
