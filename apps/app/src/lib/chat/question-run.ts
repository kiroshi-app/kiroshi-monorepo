import { questionMessageIdOf } from "./question-message"
import { bubbleIdOf, type TranscriptRow } from "./screen-model"

import type { QuestionRequest } from "../agent/contract"

type QuestionRun = {
	card: TranscriptRow
	lead?: TranscriptRow
}

export type AskedBubble = {
	messageId: string
	request: QuestionRequest
}

export type AskedQuestion = {
	asked: AskedBubble | null
	askerBotId?: string | null
	leadId?: string
}

const runHolding = (
	run: TranscriptRow[],
	cardId: string,
): QuestionRun | null => {
	const card = run.find((row) => row.messageId === cardId)
	if (!card) {
		return null
	}
	return { card, lead: run.find((row) => row.messageId !== cardId) }
}

export const questionRunOf = (
	runs: TranscriptRow[][],
	request: QuestionRequest,
): QuestionRun | null => {
	const cardId = questionMessageIdOf(request.id)
	for (const run of runs) {
		const held = runHolding(run, cardId)
		if (held) {
			return held
		}
	}
	return null
}

export const bubbleIdOfRow = (row: TranscriptRow): string =>
	bubbleIdOf(row.messageId, row.blockIndex)

const NOTHING_ASKED: AskedQuestion = { asked: null }

export const askedQuestionOf = (
	question: QuestionRequest | null,
	runs: TranscriptRow[][],
): AskedQuestion => {
	const run = question ? questionRunOf(runs, question) : null
	if (!question || !run) {
		return NOTHING_ASKED
	}
	return {
		asked: { messageId: run.card.messageId, request: question },
		askerBotId: run.card.authorBotId,
		leadId: run.lead && bubbleIdOfRow(run.lead),
	}
}
