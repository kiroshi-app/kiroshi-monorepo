import { exitDetailOf } from "./onboarding-failure"

import type { ChatState } from "../chat/chat-state"
import type { TranscriptRow } from "../chat/screen-model"
import type { TranscriptMessage } from "../conversations/transcript-contract"

const SUMMONS_OF = {
	greeting:
		"Say hello to the person who just connected you, in a sentence or two.",
	purpose:
		"Say what you are for and what you can do here, before anything else.",
	firstCompanion:
		"Help the person who just connected you choose and add their first agent.",
	arrival:
		"Introduce yourself to the person who just added you, in a sentence or two, and say what you can start on.",
} as const

export type OnboardingSummons = keyof typeof SUMMONS_OF

const SUMMONS_TEXTS: string[] = Object.values(SUMMONS_OF)

export const onboardingSummonsFor = (kind: OnboardingSummons): string =>
	SUMMONS_OF[kind]

const isSummonsRow = (row: TranscriptRow) =>
	row.role === "user" &&
	row.authorBotId === null &&
	SUMMONS_TEXTS.includes(row.text)

export const withoutOnboardingSummons = (
	rows: TranscriptRow[],
): TranscriptRow[] => rows.filter((row) => !isSummonsRow(row))

export type SummonOutcome =
	| { kind: "pending" }
	| { kind: "answered" }
	| { kind: "failed"; detail: string }

const PENDING: SummonOutcome = { kind: "pending" }

const ANSWERED: SummonOutcome = { kind: "answered" }

const answerTo = (
	messages: TranscriptMessage[],
	summons: string,
): TranscriptMessage | undefined => {
	const asked = messages.findLast(
		(message) => message.role === "user" && message.content === summons,
	)
	return asked
		? messages.find(
				(message) =>
					message.turnId === asked.turnId && message.role === "assistant",
			)
		: undefined
}

export const isSummonedIn = (chat: ChatState, summons: string): boolean =>
	chat.messages.some(
		(message) => message.role === "user" && message.content === summons,
	)

export const summonOutcomeOf = (
	chat: ChatState,
	summons: string,
): SummonOutcome => {
	if (chat.turn === "failed") {
		return { kind: "failed", detail: exitDetailOf(chat.errors.at(-1)?.error) }
	}
	return answerTo(chat.messages, summons)?.completion === "complete"
		? ANSWERED
		: PENDING
}
