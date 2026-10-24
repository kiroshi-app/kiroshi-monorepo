import { describe, expect, it } from "vitest"

import { questionMessageIdOf, questionMessageText } from "./question-message"
import { bubbleIdOfRow, questionRunOf } from "./question-run"
import { toRuns, toTranscriptRows } from "./screen-model"

import type { AskedQuestion, QuestionRequest } from "../agent/contract"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import { message } from "../conversations/transcript-fixtures"

const NYX = "bot-nyx"

const asked = (question: string, header: string): AskedQuestion => ({
	header,
	question,
	options: [
		{ label: "North", description: "", preview: null },
		{ label: "South", description: "", preview: null },
	],
	multiSelect: false,
})

const ONE_QUESTION: QuestionRequest = {
	id: "ask-1",
	questions: [asked("Which wall?", "Walls")],
}

const TWO_QUESTIONS: QuestionRequest = {
	id: "ask-1",
	questions: [asked("Which wall?", "Walls"), asked("Which colour?", "Paint")],
}

const prompt = (): TranscriptMessage =>
	message({ id: "m-prompt", turnId: "t-1", role: "user", content: "Paint it" })

const said = (content: string): TranscriptMessage =>
	message({ id: "m-said", turnId: "t-1", authorBotId: NYX, content })

const card = (request: QuestionRequest): TranscriptMessage =>
	message({
		id: questionMessageIdOf(request.id),
		turnId: questionMessageIdOf(request.id),
		authorBotId: NYX,
		content: questionMessageText(request),
	})

const runOf = (request: QuestionRequest, messages: TranscriptMessage[]) =>
	questionRunOf(toRuns(toTranscriptRows(messages)), request)

describe("questionRunOf", () => {
	it("lands on the text the companion said before the card", () => {
		const run = runOf(ONE_QUESTION, [
			prompt(),
			said("Two walls are bare."),
			card(ONE_QUESTION),
		])

		expect(run?.lead && bubbleIdOfRow(run.lead)).toBe("m-said")
		expect(run && bubbleIdOfRow(run.card)).toBe("question-ask-1")
	})

	it("lands nowhere when nothing was said before the card", () => {
		const run = runOf(ONE_QUESTION, [prompt(), card(ONE_QUESTION)])

		expect(run?.lead).toBeUndefined()
		expect(run && bubbleIdOfRow(run.card)).toBe("question-ask-1")
	})

	it("lands on the text before a card asking two questions", () => {
		const run = runOf(TWO_QUESTIONS, [
			prompt(),
			said("Two walls are bare."),
			card(TWO_QUESTIONS),
		])

		expect(run?.lead && bubbleIdOfRow(run.lead)).toBe("m-said")
		expect(run && bubbleIdOfRow(run.card)).toBe("question-ask-1")
	})

	it("finds nothing when the card is not in the window", () => {
		expect(runOf(ONE_QUESTION, [prompt()])).toBeNull()
	})
})
