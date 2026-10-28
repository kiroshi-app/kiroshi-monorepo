import { useState } from "react"

import { botBadgeChannel } from "./badge-channel"
import type { BotBadge } from "./bot-badge"
import { createBotBadgeSource } from "./bot-badge-source"
import type { ChatController } from "./chat-controller"
import { useSharedBadges } from "./use-shared-badges"

import { watchWindowFocus } from "../host"
import type { RosterController } from "../bots/roster-controller"

export type BotBadgesMount = {
	chat: ChatController
	roster: RosterController
	isDriverWindow: boolean
}

export const useBotBadges = ({
	chat,
	roster,
	isDriverWindow,
}: BotBadgesMount): Record<string, BotBadge> => {
	const [source] = useState(() =>
		createBotBadgeSource({
			chat,
			roster,
			hasFocus: () => document.hasFocus(),
			watchFocus: watchWindowFocus,
		}),
	)

	return useSharedBadges(source, botBadgeChannel, isDriverWindow)
}
