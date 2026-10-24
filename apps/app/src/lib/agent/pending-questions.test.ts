import { describe, expect, it } from "vitest"

import type { RuntimeScope, ScopedEvent } from "./contract"
import {
	firstQuestionByConversation,
	latestQuestionByBot,
	type PendingQuestion,
	pendingQuestionsAfter,
	pendingQuestionsOf,
	questionsByBotIn,
	questionsByConversationIn,
	type SpaceQuestions,
	withPendingQuestions,
} from "./pending-questions"

type Asking = {
	id: string
	text: string
	conversationId: string
	botId: string
	runtimeSessionId?: string
}

const scopeOf = ({
	conversationId,
	botId,
	runtimeSessionId = `${conversationId}-${botId}`,
}: Omit<Asking, "id" | "text">): RuntimeScope => ({
	conversationId,
	botId,
	runtimeSessionId,
	epoch: 1,
})

const asked = ({ id, text, ...scope }: Asking): ScopedEvent => ({
	scope: scopeOf(scope),
	event: {
		type: "questionRequested",
		request: {
			id,
			questions: [
				{ header: "Pick", question: text, options: [], multiSelect: false },
			],
		},
	},
})

const resolved = (id: string): ScopedEvent => ({
	scope: null,
	event: { type: "permissionResolved", id, decision: "allowOnce" },
})

const turnEndedFor = (scope: Omit<Asking, "id" | "text">): ScopedEvent => ({
	scope: scopeOf(scope),
	event: {
		type: "turnEnded",
		ended: { sessionId: null, outcome: "completed" },
	},
})

const BRANCH = {
	id: "q-branch",
	text: "Which branch?",
	conversationId: "room-one",
	botId: "atlas",
}

const DEPLOY = {
	id: "q-deploy",
	text: "Deploy now?",
	conversationId: "room-one",
	botId: "beacon",
}

const NAME = {
	id: "q-name",
	text: "Which name?",
	conversationId: "room-two",
	botId: "atlas",
}

const anywhere = () => true

const textsOf = (questions: PendingQuestion[]) =>
	questions.map(({ text }) => text)

const storeAfter = (questions: PendingQuestion[], ...events: ScopedEvent[]) =>
	events.reduce(
		(current, event) => pendingQuestionsAfter(current, event, anywhere),
		questions,
	)

describe("the pending question store", () => {
	it("fills from the questions the host still holds", () => {
		expect(textsOf(pendingQuestionsOf([asked(BRANCH), asked(NAME)]))).toEqual([
			"Which branch?",
			"Which name?",
		])
	})

	it("adds a question asked in a conversation of the space", () => {
		expect(textsOf(storeAfter([], asked(BRANCH)))).toEqual(["Which branch?"])
	})

	it("ignores a question asked in a conversation of another space", () => {
		const isInSpace = (conversationId: string) => conversationId === "room-two"

		expect(pendingQuestionsAfter([], asked(BRANCH), isInSpace)).toEqual([])
	})

	it("keeps one entry when the host and the event both carry a question", () => {
		const filled = pendingQuestionsOf([asked(BRANCH)])

		expect(textsOf(storeAfter(filled, asked(BRANCH)))).toEqual([
			"Which branch?",
		])
	})

	it("removes the question whose id an answer resolves", () => {
		const filled = pendingQuestionsOf([asked(BRANCH), asked(DEPLOY)])

		expect(textsOf(storeAfter(filled, resolved("q-branch")))).toEqual([
			"Deploy now?",
		])
	})

	it("removes every question of the run whose turn ended", () => {
		const filled = pendingQuestionsOf([
			asked(BRANCH),
			asked({ ...BRANCH, id: "q-again", text: "Which tag?" }),
			asked(DEPLOY),
		])

		expect(textsOf(storeAfter(filled, turnEndedFor(BRANCH)))).toEqual([
			"Deploy now?",
		])
	})
})

describe("the pending question texts", () => {
	const questions = pendingQuestionsOf([
		asked(BRANCH),
		asked(DEPLOY),
		asked(NAME),
	])

	it("names the first question asked in each conversation", () => {
		expect(firstQuestionByConversation(questions)).toEqual({
			"room-one": "Which branch?",
			"room-two": "Which name?",
		})
	})

	it("names the most recent question each companion asked", () => {
		expect(latestQuestionByBot(questions)).toEqual({
			atlas: "Which name?",
			beacon: "Deploy now?",
		})
	})
})

describe("the roster rows", () => {
	const shown: SpaceQuestions = {
		spaceRowId: "home",
		byConversation: { "room-one": "Which branch?" },
		byBot: { atlas: "Which name?" },
	}

	it("carries the pending question on the conversation rows of the space", () => {
		const rows = withPendingQuestions(
			[
				{ id: "room-one", lastMessage: "On it" },
				{ id: "room-two", lastMessage: "Done" },
			],
			questionsByConversationIn(shown, "home"),
		)

		expect(rows).toEqual([
			{
				id: "room-one",
				lastMessage: "On it",
				pendingQuestion: "Which branch?",
			},
			{ id: "room-two", lastMessage: "Done" },
		])
	})

	it("carries the pending question on the companion rows of the space", () => {
		const rows = withPendingQuestions(
			[
				{ id: "atlas", lastMessage: "On it" },
				{ id: "beacon", lastMessage: "Done" },
			],
			questionsByBotIn(shown, "home"),
		)

		expect(rows).toEqual([
			{ id: "atlas", lastMessage: "On it", pendingQuestion: "Which name?" },
			{ id: "beacon", lastMessage: "Done" },
		])
	})

	it("leaves the rows of another space on their usual preview", () => {
		const rows = [{ id: "atlas", lastMessage: "On it" }]

		expect(withPendingQuestions(rows, questionsByBotIn(shown, "work"))).toEqual(
			rows,
		)
		expect(
			withPendingQuestions(rows, questionsByConversationIn(shown, "work")),
		).toEqual(rows)
	})
})
