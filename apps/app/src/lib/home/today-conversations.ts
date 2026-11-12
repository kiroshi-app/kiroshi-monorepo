import type { HomeTodayRow } from "@workspace/ui/components/home-today-list"

import type { ConversationHostStates } from "../bots/roster-pages"
import { rosterTimestamp } from "../bots/roster-timestamp"
import {
	conversationName,
	lastSpokeAt,
	mostRecentFirst,
	presentParticipants,
	previewText,
	toConversationLook,
} from "../conversations/roster-conversations"
import type {
	Conversation,
	ObservedState,
} from "../conversations/store-contract"
import type { ConversationPreviews } from "../conversations/transcript-state"
import { startOfLocalDay } from "../missions/missions-model"

const TODAY_ROW_LIMIT = 3

export type TodayRoster = {
	conversations: Conversation[]
	previews: ConversationPreviews
	hostStates: ConversationHostStates
	now: number
}

type TodayRowActivity =
	| { state: "needs-you"; question: string }
	| { state: "working" | "done"; preview: string }

const isSeated = (conversation: Conversation, agentId: string) =>
	presentParticipants(conversation).some(({ botId }) => botId === agentId)

const isToday = (conversation: Conversation, roster: TodayRoster) =>
	startOfLocalDay(lastSpokeAt(conversation, roster)) ===
	startOfLocalDay(roster.now)

const pendingQuestionOf = (observed: ObservedState | undefined) =>
	observed?.state === "needs_you" ? observed.pendingPrompt?.text : undefined

const activityOf = (
	observed: ObservedState | undefined,
	preview: string,
): TodayRowActivity => {
	const question = pendingQuestionOf(observed)
	if (question) {
		return { state: "needs-you", question }
	}
	return { state: observed?.state === "working" ? "working" : "done", preview }
}

const toTodayRow = (
	conversation: Conversation,
	roster: TodayRoster,
): HomeTodayRow => {
	const { icon, color } = toConversationLook(conversation)
	const lastMessage = previewText(
		conversation,
		roster.previews[conversation.id],
	)
	return {
		id: conversation.id,
		title: conversationName(conversation),
		timestamp: rosterTimestamp(lastSpokeAt(conversation, roster), roster.now),
		icon,
		hue: color,
		...activityOf(roster.hostStates[conversation.id], lastMessage ?? ""),
	}
}

export const todayRowsOf = (
	agentId: string,
	roster: TodayRoster,
): HomeTodayRow[] =>
	mostRecentFirst(
		roster.conversations.filter(
			(conversation) =>
				isSeated(conversation, agentId) && isToday(conversation, roster),
		),
		roster,
	)
		.slice(0, TODAY_ROW_LIMIT)
		.map((conversation) => toTodayRow(conversation, roster))
