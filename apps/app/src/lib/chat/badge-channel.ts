import type { BadgeChannel, WindowBadgeReport } from "./badge-sharing"
import type { BotBadge } from "./bot-badge"

import { emitOnThisComputer, listenOnThisComputer } from "../host"

const badgeChannelOf = (kind: string): BadgeChannel => {
	const sharedEvent = `${kind}://badges-shared`
	const reportedEvent = `${kind}://badges-reported`
	return {
		share: (badges) => emitOnThisComputer(sharedEvent, badges),
		onShared: (listener) =>
			listenOnThisComputer<Record<string, BotBadge>>(
				sharedEvent,
				({ payload }) => listener(payload),
			),
		report: (report) => emitOnThisComputer(reportedEvent, report),
		onReport: (listener) =>
			listenOnThisComputer<WindowBadgeReport>(reportedEvent, ({ payload }) =>
				listener(payload),
			),
	}
}

export const conversationBadgeChannel = badgeChannelOf("conversation")

export const botBadgeChannel = badgeChannelOf("bot")
