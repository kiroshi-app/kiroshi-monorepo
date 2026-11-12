import type { HomeTodayRow } from "@workspace/ui/components/home-today-list"

import {
	type ConversationHostStates,
	lastWordsIn,
	observedStateOf,
} from "../bots/roster-pages"
import { rosterTimestamp } from "../bots/roster-timestamp"
import {
	conversationName,
	previewText,
	toConversationLook,
} from "../conversations/roster-conversations"
import type {
	Conversation,
	ConversationInPage,
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

type LocalDay = {
	start: number
	end: number
}

export const localDayAt = (now: number): LocalDay => {
	const start = startOfLocalDay(now)
	const nextDay = new Date(start)
	nextDay.setDate(nextDay.getDate() + 1)
	return { start, end: nextDay.getTime() }
}

type TodayRowActivity =
	| { state: "needs-you"; question: string }
	| { state: "working" | "done"; preview: string }

const pendingQuestionOf = (observed: ObservedState) =>
	observed.state === "needs_you" ? observed.pendingPrompt?.text : undefined

const activityOf = (
	observed: ObservedState,
	preview: string,
): TodayRowActivity => {
	const question = pendingQuestionOf(observed)
	if (question) {
		return { state: "needs-you", question }
	}
	return { state: observed.state === "working" ? "working" : "done", preview }
}

const lastWordReadOf = (row: ConversationInPage) =>
	lastWordsIn({ pinned: [], conversations: [row], nextCursor: null })
		.conversations[row.id]

const toTodayRow = (
	row: ConversationInPage,
	roster: TodayRoster,
): HomeTodayRow => {
	const conversation =
		roster.conversations.find(({ id }) => id === row.id) ?? row
	const lastWord = roster.previews[row.id] ?? lastWordReadOf(row)
	const observed = roster.hostStates[row.id] ?? observedStateOf(row)
	const { icon, color } = toConversationLook(conversation)
	return {
		id: row.id,
		title: conversationName(conversation),
		timestamp: rosterTimestamp(lastWord?.at ?? row.lastActivityAt, roster.now),
		icon,
		hue: color,
		...activityOf(observed, previewText(conversation, lastWord) ?? ""),
	}
}

export const todayRowsOf = (
	todayRead: ConversationInPage[],
	roster: TodayRoster,
): HomeTodayRow[] =>
	todayRead.slice(0, TODAY_ROW_LIMIT).map((row) => toTodayRow(row, roster))
