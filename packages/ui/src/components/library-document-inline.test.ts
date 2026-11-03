import { describe, expect, it } from "vitest"

import {
	deletedIn,
	formatsAround,
	hasInlineFormat,
	inlineNodesOf,
	shownBoundsOf,
	shownSpansOf,
} from "@workspace/ui/components/library-document-inline"

const shownTextOf = (text: string) =>
	shownSpansOf(inlineNodesOf(text))
		.map(({ from, to }) => text.slice(from, to))
		.join("")

describe("inlineNodesOf", () => {
	it.each([
		["**bold**", "bold"],
		["_italic_", "italic"],
		["*italic*", "italic"],
		["~~struck~~", "struck"],
		["`code`", "code"],
		["[text](https://kiroshi.app)", "text"],
	])("hides the markers of %s", (text, shown) => {
		expect(hasInlineFormat(text)).toBe(true)
		expect(shownTextOf(text)).toBe(shown)
	})

	it("reads formats nested in bold and in link text", () => {
		expect(shownTextOf("**a _b_ c** and [see `x`](https://k.app)")).toBe(
			"a b c and see x",
		)
	})

	it("keeps code spans free of other formats", () => {
		expect(shownTextOf("`**not bold**`")).toBe("**not bold**")
	})

	it.each([
		"A **bold, an _italic, a ~~strike, a `code and a [link]( never close.",
		"snake_case_name stays as typed",
		"a * spaced * star",
		"****",
		"[text]( https://spaced.app)",
	])("leaves %s as plain text", (text) => {
		expect(hasInlineFormat(text)).toBe(false)
		expect(shownTextOf(text)).toBe(text)
	})
})

describe("shownBoundsOf", () => {
	it("skips the markers at either end of a block", () => {
		expect(shownBoundsOf("**bold** tail")).toEqual({ start: 2, end: 13 })
		expect(shownBoundsOf("Ship **bold**")).toEqual({ start: 0, end: 11 })
		expect(shownBoundsOf("")).toEqual({ start: 0, end: 0 })
	})
})

describe("deletedIn", () => {
	it("removes the last glyph of a run and keeps both markers", () => {
		const text = "Ship **the launch** now"
		const at = text.indexOf("h** now")
		expect(deletedIn(text, at, at + 1)).toEqual({
			text: "Ship **the launc** now",
			caret: at,
		})
	})

	it("skips the markers inside a deleted range", () => {
		const text = "Read _the brief_ first"
		expect(deletedIn(text, text.indexOf("_the"), text.indexOf("he"))).toEqual({
			text: "Read _he brief_ first",
			caret: "Read ".length,
		})
	})

	it("removes both markers of a run it empties, nested ones included", () => {
		expect(deletedIn("Run `x` now", 5, 6)).toEqual({
			text: "Run  now",
			caret: 4,
		})
		expect(deletedIn("a **_b_** c", 0, 11)).toEqual({ text: "", caret: 0 })
	})

	it("keeps the markers of the part of a run left unselected", () => {
		const text = "Cut ~~the old copy~~ today"
		expect(deletedIn(text, 3, text.indexOf("old"))).toEqual({
			text: "Cut~~old copy~~ today",
			caret: 3,
		})
	})
})

describe("formatsAround", () => {
	const text = "We met on **the [brief](https://k.app/b) date** today."

	it("names every format holding the selection, with the link url", () => {
		const start = text.indexOf("brief")
		expect(formatsAround(text, start, start + "brief".length)).toEqual({
			formats: ["bold", "link"],
			link: "https://k.app/b",
		})
	})

	it("names nothing for a selection reaching outside every format", () => {
		const start = text.indexOf("met")
		expect(formatsAround(text, start, text.indexOf("date"))).toEqual({
			formats: [],
		})
	})
})
