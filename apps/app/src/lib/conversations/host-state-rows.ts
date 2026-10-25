import type { BotBadge } from "@workspace/ui/components/bot-badge"

import type { ConversationHostState, ObservedState } from "./store-contract"

import type { SoloThreads } from "../bots/roster-line"
import type { ConversationHostStates } from "../bots/roster-pages"
import type { SidebarActivity } from "../chat/screen-model"

type NeedsYouRow = {
	id: string
	badge?: BotBadge
	pendingQuestion?: string
}

const URGENCY: Record<ConversationHostState, number> = {
	idle: 0,
	working: 1,
	needs_you: 2,
}

const moreUrgentOf = (
	one: ObservedState | undefined,
	other: ObservedState,
): ObservedState =>
	one === undefined || URGENCY[other.state] > URGENCY[one.state] ? other : one

type BotSoloThreadsInSpace = {
	hostStates: ConversationHostStates
	soloThreads: SoloThreads
	spaceId: string | null
}

export const botHostStatesIn = ({
	hostStates,
	soloThreads,
	spaceId,
}: BotSoloThreadsInSpace): ConversationHostStates => {
	const botStates: ConversationHostStates = {}
	for (const [
		conversationId,
		{ spaceId: lineSpaceId, botId },
	] of Object.entries(soloThreads)) {
		const observed = hostStates[conversationId]
		if (lineSpaceId === spaceId && observed !== undefined) {
			botStates[botId] = moreUrgentOf(botStates[botId], observed)
		}
	}
	return botStates
}

export const workingFromHost = (
	hostStates: ConversationHostStates,
	poses: Record<string, SidebarActivity>,
): Record<string, SidebarActivity> =>
	Object.fromEntries(
		Object.entries(hostStates).flatMap(([id, { state }]) =>
			state === "working"
				? [[id, { isWorking: true, kind: poses[id]?.kind }]]
				: [],
		),
	)

export const withNeedsYou = <Row extends NeedsYouRow>(
	rows: Row[],
	hostStates: ConversationHostStates,
): Row[] =>
	rows.map((row) => {
		const observed = hostStates[row.id]
		return observed?.state === "needs_you"
			? {
					...row,
					badge: "attention",
					pendingQuestion: observed.pendingPrompt?.text || undefined,
				}
			: row
	})
