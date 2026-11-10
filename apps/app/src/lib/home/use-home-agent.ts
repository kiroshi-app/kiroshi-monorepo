import { useSyncExternalStore } from "react"

import type { HomePicks } from "./home-picks"

import type { Bot } from "@/lib/conversations/store-contract"

const homeAgentAmong = (
	bots: Bot[],
	pickedId: string | undefined,
): Bot | null => bots.find(({ id }) => id === pickedId) ?? bots[0] ?? null

export const useHomeAgent = (
	picks: HomePicks,
	bots: Bot[],
	spaceRowId: string | null,
) => {
	const picked = useSyncExternalStore(picks.subscribe, picks.getState)
	return homeAgentAmong(bots, spaceRowId ? picked[spaceRowId] : undefined)
}
