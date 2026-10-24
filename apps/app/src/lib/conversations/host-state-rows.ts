import type { BotBadge } from "@workspace/ui/components/bot-badge"

import { presentParticipants } from "./roster-conversations"
import type { Conversation, ConversationHostState } from "./store-contract"

import type { SoloThreads } from "../bots/roster-line"
import type { ConversationHostStates } from "../bots/roster-pages"
import type { SidebarActivity } from "../chat/screen-model"

type QuestionTexts = Record<string, string>

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
	one: ConversationHostState,
	other: ConversationHostState,
): ConversationHostState => (URGENCY[other] > URGENCY[one] ? other : one)

type BotConversationsInSpace = {
	hostStates: ConversationHostStates
	soloThreads: SoloThreads
	conversations: Conversation[]
	spaceId: string | null
}

type BotSeat = {
	conversationId: string
	botId: string
}

const soloSeatsIn = (soloThreads: SoloThreads, spaceId: string | null) =>
	Object.entries(soloThreads).flatMap(([conversationId, line]): BotSeat[] =>
		line.spaceId === spaceId ? [{ conversationId, botId: line.botId }] : [],
	)

const roomSeatsIn = (conversations: Conversation[]) =>
	conversations.flatMap((conversation) =>
		presentParticipants(conversation).map(
			({ botId }): BotSeat => ({ conversationId: conversation.id, botId }),
		),
	)

export const botHostStatesIn = ({
	hostStates,
	soloThreads,
	conversations,
	spaceId,
}: BotConversationsInSpace): ConversationHostStates => {
	const botStates: ConversationHostStates = {}
	const seats = [
		...soloSeatsIn(soloThreads, spaceId),
		...roomSeatsIn(conversations),
	]
	for (const { conversationId, botId } of seats) {
		const state = hostStates[conversationId]
		if (state !== undefined) {
			botStates[botId] = moreUrgentOf(botStates[botId] ?? "idle", state)
		}
	}
	return botStates
}

export const workingFromHost = (
	hostStates: ConversationHostStates,
	poses: Record<string, SidebarActivity>,
): Record<string, SidebarActivity> =>
	Object.fromEntries(
		Object.entries(hostStates).flatMap(([id, state]) =>
			state === "working"
				? [[id, { isWorking: true, kind: poses[id]?.kind }]]
				: [],
		),
	)

export const withNeedsYou = <Row extends NeedsYouRow>(
	rows: Row[],
	hostStates: ConversationHostStates,
	questions: QuestionTexts,
): Row[] =>
	rows.map((row) =>
		hostStates[row.id] === "needs_you"
			? { ...row, badge: "attention", pendingQuestion: questions[row.id] }
			: row,
	)
