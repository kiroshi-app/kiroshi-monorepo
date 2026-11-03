import { describe, expect, it } from "vitest"

import {
	answeredText,
	answersFromText,
	questionMessageText,
} from "./question-message"

import type { QuestionRequest } from "../agent/contract"

const REQUEST: QuestionRequest = {
	id: "ask-1",
	questions: [
		{
			header: "Framework",
			question: "Which framework\nshould it use?",
			multiSelect: false,
			options: [
				{ label: "React", description: "The one you know", preview: null },
				{ label: "Vue", description: null, preview: null },
			],
		},
		{
			header: "Styling",
			question: "Which styling?",
			multiSelect: false,
			options: [{ label: "Tailwind", description: null, preview: null }],
		},
	],
}

describe("questionMessageText", () => {
	it("writes each question as a heading above its options", () => {
		expect(questionMessageText(REQUEST)).toBe(
			[
				"### Which framework should it use?",
				"- React — The one you know",
				"- Vue",
				"### Which styling?",
				"- Tailwind",
			].join("\n"),
		)
	})
})

describe("answersFromText", () => {
	it("answers the first question with what was typed", () => {
		expect(answersFromText(REQUEST, "something else")).toEqual({
			"Which framework\nshould it use?": "something else",
		})
	})
})

describe("answeredText", () => {
	it("carries only the chosen answers", () => {
		expect(
			answeredText(REQUEST, {
				"Which framework\nshould it use?": "React",
				"Which styling?": "",
			}),
		).toBe("React")
	})
})
