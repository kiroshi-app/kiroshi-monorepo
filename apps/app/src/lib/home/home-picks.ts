import type { BotIdBySpace } from "@/lib/user/preferences-contract"
import { parseBotIdBySpace } from "@/lib/user/preferences-mirror"

const HOME_PICKS_KEY = "homeAgentIdBySpace"

export type HomePicks = {
	pick: (spaceId: string, botId: string) => void
	getState: () => BotIdBySpace
	subscribe: (listener: () => void) => () => void
}

export const createHomePicks = (): HomePicks => {
	const listeners = new Set<() => void>()
	let picks = parseBotIdBySpace(localStorage.getItem(HOME_PICKS_KEY))

	return {
		pick: (spaceId, botId) => {
			picks = { ...picks, [spaceId]: botId }
			localStorage.setItem(HOME_PICKS_KEY, JSON.stringify(picks))
			for (const listener of [...listeners]) {
				listener()
			}
		},
		getState: () => picks,
		subscribe: (listener) => {
			listeners.add(listener)
			return () => listeners.delete(listener)
		},
	}
}
