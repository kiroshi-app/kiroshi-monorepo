import { describe, expect, it } from "vitest"

import { inlineNodesOf } from "@workspace/ui/components/library-document-inline"

type InlineNode = ReturnType<typeof inlineNodesOf>[number]

type InlineSpan = Extract<InlineNode, { kind: "text" }>

const shownSpansOf = (nodes: InlineNode[]): InlineSpan[] =>
	nodes.flatMap((node) => {
		if (node.kind === "text") return [node]
		if (node.kind === "marker") return []
		return shownSpansOf(node.children)
	})

const hasInlineFormat = (text: string) =>
	inlineNodesOf(text).some((node) => node.kind !== "text")

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
