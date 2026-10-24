import type { AnsweredQuestion } from "@workspace/ui/components/answered-question-card"

import {
	isQuestionMessageId,
	oneLine,
	type WrittenQuestion,
	writtenQuestionsOf,
} from "./question-message"

import type { TranscriptMessage } from "../conversations/transcript-contract"

export type AnsweredCard = {
	answer: TranscriptMessage
	questions: AnsweredQuestion[]
}

export type AnsweredCards = ReadonlyMap<string, AnsweredCard>

const ANSWER_SEPARATOR = "\n\n"

const PICK_SEPARATOR = ", "

const pickedLabelsOf = (labels: string[], answer: string): string[] | null => {
	const said = oneLine(answer)
	if (labels.includes(said)) {
		return [said]
	}
	const picks = said.split(PICK_SEPARATOR)
	return picks.every((pick) => labels.includes(pick)) ? picks : null
}

const answeredQuestionOf = (
	{ question, options }: WrittenQuestion,
	answer: string,
): AnsweredQuestion => {
	const picked = pickedLabelsOf(
		options.map(({ label }) => label),
		answer,
	)
	const shown = { question, header: question, options }
	return picked
		? { ...shown, selected: picked }
		: { ...shown, selected: [], freeText: answer }
}

const answersOf = (content: string, count: number): string[] =>
	count === 1 ? [content] : content.split(ANSWER_SEPARATOR)

const answeredQuestionsOf = (
	asked: string,
	answered: string,
): AnsweredQuestion[] | null => {
	const written = writtenQuestionsOf(asked)
	if (!written) {
		return null
	}
	const answers = answersOf(answered, written.length)
	if (answers.length !== written.length) {
		return null
	}
	return written.map((question, index) =>
		answeredQuestionOf(question, answers[index]),
	)
}

const isAskingRow = ({ id, role }: TranscriptMessage) =>
	role === "assistant" && isQuestionMessageId(id)

export const answeredCardsIn = (
	messages: TranscriptMessage[],
): AnsweredCards => {
	const asking = new Map(
		messages.filter(isAskingRow).map((message) => [message.id, message]),
	)
	const cards = new Map<string, AnsweredCard>()
	for (const answer of messages) {
		const asked =
			answer.role === "user" && answer.repliedToMessageId
				? asking.get(answer.repliedToMessageId)
				: undefined
		if (!asked || cards.has(asked.id)) {
			continue
		}
		const questions = answeredQuestionsOf(asked.content, answer.content)
		if (questions) {
			cards.set(asked.id, { answer, questions })
		}
	}
	return cards
}
