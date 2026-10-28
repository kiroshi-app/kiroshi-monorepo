import { useEffect, useSyncExternalStore } from "react"

import { type BadgeChannel, mirrorBadges, ownBadges } from "./badge-sharing"
import type { BadgeSource } from "./badge-source"
import type { BotBadge } from "./bot-badge"

import { currentWindowLabel, isDesktopHost } from "../host"

const logUnsharedBadges = (reason: unknown) => {
	console.error("badges: the other windows could not be reached", reason)
}

export const useSharedBadges = (
	source: BadgeSource,
	channel: BadgeChannel,
	isDriverWindow: boolean,
): Record<string, BotBadge> => {
	useEffect(() => source.start(), [source])

	useEffect(() => {
		if (!isDesktopHost()) {
			return
		}
		const sharing = {
			source,
			channel,
			windowLabel: currentWindowLabel(),
			onError: logUnsharedBadges,
		}
		return isDriverWindow ? ownBadges(sharing) : mirrorBadges(sharing)
	}, [source, channel, isDriverWindow])

	return useSyncExternalStore(source.subscribe, source.getBadges)
}
