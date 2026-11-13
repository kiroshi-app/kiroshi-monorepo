import { describe, expect, it } from "vitest"

import {
	mentionQueryAt,
	mentionRunsOf,
	withMention,
	withTrigger,
} from "@workspace/ui/components/library-comment-mentions"

describe("mentionQueryAt", () => {
	it("opens on a trigger that starts the text or follows a space", () => {
		expect(mentionQueryAt("@", 1)).toEqual({ start: 0, query: "" })
		expect(mentionQueryAt("Ask @at", 7)).toEqual({ start: 4, query: "at" })
	})

	it("keeps a name of several words as one query", () => {
		expect(mentionQueryAt("@Lena Or", 8)).toEqual({
			start: 0,
			query: "Lena Or",
		})
	})

	it("stays closed inside a word, before the trigger and across a line", () => {
		expect(mentionQueryAt("mail@kiroshi", 12)).toBe(null)
		expect(mentionQueryAt("@Atlas", 0)).toBe(null)
		expect(mentionQueryAt("@Atlas\nthen", 11)).toBe(null)
	})
})

describe("withMention", () => {
	it("replaces the query with the name and leaves the caret after one space", () => {
		expect(withMention("Ask @at", { start: 4, query: "at" }, "Atlas")).toEqual({
			value: "Ask @Atlas ",
			caret: 11,
		})
	})

	it("reuses the space that already follows the query", () => {
		expect(
			withMention("Ask @at today", { start: 4, query: "at" }, "Atlas"),
		).toEqual({ value: "Ask @Atlas today", caret: 11 })
	})
})

describe("withTrigger", () => {
	it("separates the trigger from the word before it", () => {
		expect(withTrigger("Ask", 3)).toEqual({ value: "Ask @", caret: 5 })
	})

	it("adds nothing before a trigger that starts the text or follows a space", () => {
		expect(withTrigger("", 0)).toEqual({ value: "@", caret: 1 })
		expect(withTrigger("Ask ", 4)).toEqual({ value: "Ask @", caret: 5 })
	})
})

describe("mentionRunsOf", () => {
	it("marks a known name and leaves the rest as text", () => {
		expect(mentionRunsOf("Can @Atlas ask?", ["Atlas"])).toEqual([
			{ start: 0, text: "Can ", isMention: false },
			{ start: 4, text: "@Atlas", isMention: true },
			{ start: 10, text: " ask?", isMention: false },
		])
	})

	it("prefers the longest name that matches", () => {
		expect(mentionRunsOf("@Lena Ortiz", ["Lena", "Lena Ortiz"])).toEqual([
			{ start: 0, text: "@Lena Ortiz", isMention: true },
		])
	})

	it("leaves an unknown name, a longer word and an address as text", () => {
		const text = "@Nobody @Atlasian mail@Atlas"

		expect(mentionRunsOf(text, ["Atlas"])).toEqual([
			{ start: 0, text, isMention: false },
		])
	})

	it("reads a name holding pattern characters literally", () => {
		expect(mentionRunsOf("@A.B (ops)", ["A.B (ops)"])).toEqual([
			{ start: 0, text: "@A.B (ops)", isMention: true },
		])
	})

	it("answers one plain run when nobody can be mentioned", () => {
		expect(mentionRunsOf("@Atlas", [])).toEqual([
			{ start: 0, text: "@Atlas", isMention: false },
		])
	})
})
