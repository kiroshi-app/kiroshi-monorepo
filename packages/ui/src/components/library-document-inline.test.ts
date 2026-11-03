import { describe, expect, it } from "vitest"

import {
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
