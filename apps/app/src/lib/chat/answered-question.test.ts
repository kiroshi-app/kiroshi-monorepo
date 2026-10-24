import { describe, expect, it } from "vitest"

import { answeredCardsIn } from "./answered-question"
import { questionMessageIdOf, questionMessageText } from "./question-message"

import type { AskedQuestion, QuestionRequest } from "../agent/contract"
import type { TranscriptMessage } from "../conversations/transcript-contract"
import { message } from "../conversations/transcript-fixtures"

const WALLS: AskedQuestion = {
	header: "Walls",
	question: "Which wall holds?",
	options: [
		{ label: "North", description: "Faces the sun", preview: null },
		{ label: "South", description: null, preview: null },
	],
	multiSelect: false,
}

const PAINT: AskedQuestion = {
	header: "Paint",
	question: "Which colours?",
	options: [
		{ label: "Ochre", description: "Warm", preview: null },
		{ label: "Slate", description: null, preview: null },
		{ label: "Chalk", description: null, preview: null },
	],
	multiSelect: true,
}

const requestOf = (...questions: AskedQuestion[]): QuestionRequest => ({
	id: "ask-1",
	questions,
})

const ASKING_ID = questionMessageIdOf("ask-1")

const asking = (request: QuestionRequest): TranscriptMessage =>
	message({
		id: ASKING_ID,
		authorBotId: "bot-nyx",
		content: questionMessageText(request),
	})

const reply = (content: string, repliedToMessageId = ASKING_ID) =>
	message({
		id: "m-answer",
		role: "user",
		content,
		createdAt: 42,
		repliedToMessageId,
	})

const cardOf = (messages: TranscriptMessage[]) =>
	answeredCardsIn(messages).get(ASKING_ID)

describe("answeredCardsIn", () => {
	it("marks the option whose label the answer reads, with its description", () => {
		const card = cardOf([asking(requestOf(WALLS)), reply("North")])

		expect(card?.answer.id).toBe("m-answer")
		expect(card?.questions).toEqual([
			{
				question: "Which wall holds?",
				header: "Which wall holds?",
				options: [
					{ label: "North", description: "Faces the sun" },
					{ label: "South", description: "" },
				],
				selected: ["North"],
			},
		])
	})

	it("marks every label of a multi-select answer", () => {
		const card = cardOf([asking(requestOf(PAINT)), reply("Chalk, Ochre")])

		expect(card?.questions[0]?.selected).toEqual(["Chalk", "Ochre"])
		expect(card?.questions[0]?.freeText).toBeUndefined()
	})

	it("keeps an answer no label matches as free text", () => {
		const card = cardOf([
			asking(requestOf(WALLS)),
			reply("Neither, the east one\n\nIt is the only one standing."),
		])

		expect(card?.questions[0]).toMatchObject({
			selected: [],
			freeText: "Neither, the east one\n\nIt is the only one standing.",
		})
	})

	it("reads one answer per question, in the order they were asked", () => {
		const card = cardOf([
			asking(requestOf(WALLS, PAINT)),
			reply("South\n\nSlate, Ochre"),
		])

		expect(
			card?.questions.map(({ question, selected }) => [question, selected]),
		).toEqual([
			["Which wall holds?", ["South"]],
			["Which colours?", ["Slate", "Ochre"]],
		])
	})

	it("draws no card for a question nobody answered", () => {
		expect(cardOf([asking(requestOf(WALLS))])).toBeUndefined()
	})

	it("draws no card for a reply to a message that is not a question", () => {
		const said = message({ id: "m-said", content: "### Which wall holds?" })

		expect(answeredCardsIn([said, reply("North", "m-said")]).size).toBe(0)
	})

	it("draws no card when the answers do not line up with the questions", () => {
		expect(
			cardOf([asking(requestOf(WALLS, PAINT)), reply("South")]),
		).toBeUndefined()
	})
})
