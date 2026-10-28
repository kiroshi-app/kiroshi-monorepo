import type {
	BadgeChannel,
	SharedBadges,
	WindowBadgeReport,
} from "./badge-sharing"

import { emitOnThisComputer, listenOnThisComputer } from "../host"

const badgeChannelOf = (kind: string): BadgeChannel => {
	const sharedEvent = `${kind}://badges-shared`
	const reportedEvent = `${kind}://badges-reported`
	return {
		share: (shared) => emitOnThisComputer(sharedEvent, shared),
		onShared: (listener) =>
			listenOnThisComputer<SharedBadges>(sharedEvent, ({ payload }) =>
				listener(payload),
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
