import { describe, expect, it } from "vitest"

import {
	type BlockTextType,
	blockTextOf,
	editedBlockText,
	inlineNodesOf,
	splitBlockText,
	stepIn,
} from "@workspace/ui/components/library-document-inline"

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

const shownLinesOf = (source: string, type: BlockTextType) =>
	blockTextOf(source, type).lines.map((line) =>
		shownSpansOf(line.nodes)
			.map(({ from, to }) => source.slice(from, to))
			.join(""),
	)

describe("blockTextOf", () => {
	it.each<[string, BlockTextType, string, string[]]>([
		["## Launch **plan**", "heading", "heading", ["Launch plan"]],
		["Launch\n===", "heading", "heading", ["Launch"]],
		["- one\n- *two*", "list", "list", ["one", "two"]],
		["1. one\n2. two", "list", "list", ["one", "two"]],
		["> said\n> again", "quote", "quote", ["said", "again"]],
		["a `b` [c](https://k.app)", "paragraph", "paragraph", ["a b c"]],
		["#", "heading", "paragraph", ["#"]],
		["-", "list", "paragraph", ["-"]],
		[">", "quote", "paragraph", [">"]],
	])("shows %j as %s text without markers", (source, type, look, lines) => {
		expect(blockTextOf(source, type).look).toBe(look)
		expect(shownLinesOf(source, type)).toEqual(lines)
	})

	it("reads the heading level from its hashes", () => {
		expect(blockTextOf("### Risks", "heading").level).toBe(3)
	})
})

describe("editedBlockText", () => {
	it("types inside a mark when the caret sits at its end", () => {
		expect(
			editedBlockText("a **bold** b", "paragraph", { from: 8, to: 8 }, "er"),
		).toEqual({ source: "a **bolder** b", caret: 10 })
	})

	it("deletes shown characters and keeps the markers around them", () => {
		expect(
			editedBlockText("**ab**cd", "paragraph", { from: 3, to: 7 }, ""),
		).toEqual({ source: "**a**d", caret: 3 })
	})

	it("drops a mark whose every character is deleted", () => {
		expect(
			editedBlockText("a **b** c", "paragraph", { from: 4, to: 5 }, ""),
		).toEqual({ source: "a  c", caret: 2 })
	})

	it("keeps a mark when typing replaces all of its text", () => {
		expect(
			editedBlockText("a **b** c", "paragraph", { from: 4, to: 5 }, "x"),
		).toEqual({ source: "a **x** c", caret: 5 })
	})

	it("drops a link whose text is deleted", () => {
		expect(
			editedBlockText(
				"see [it](https://k.app)",
				"paragraph",
				{ from: 5, to: 7 },
				"",
			),
		).toEqual({ source: "see ", caret: 4 })
	})

	it("merges two list items with the marker of the second", () => {
		expect(
			editedBlockText("- one\n- two", "list", { from: 5, to: 8 }, ""),
		).toEqual({ source: "- onetwo", caret: 5 })
	})

	it("continues the list marker on a typed line break", () => {
		expect(editedBlockText("- one", "list", { from: 5, to: 5 }, "\n")).toEqual({
			source: "- one\n- ",
			caret: 8,
		})
	})

	it("keeps a heading on one line", () => {
		expect(
			editedBlockText("## a", "heading", { from: 4, to: 4 }, "\nb"),
		).toEqual({ source: "## a b", caret: 6 })
	})
})

describe("stepIn", () => {
	it("steps over markers to the previous shown character", () => {
		expect(stepIn("a**b**", "paragraph", 3, -1)).toEqual({ from: 0, to: 1 })
	})

	it("steps back over a line break with the next marker", () => {
		expect(stepIn("- a\n- b", "list", 6, -1)).toEqual({ from: 3, to: 6 })
	})

	it("finds nothing before the first character of a block", () => {
		expect(stepIn("## a", "heading", 3, -1)).toBeUndefined()
	})
})

describe("splitBlockText", () => {
	it("closes and reopens the marks around the split", () => {
		expect(splitBlockText("**bold** x", "paragraph", 4)).toEqual({
			before: "**bo**",
			after: "**ld** x",
			opened: 2,
		})
	})

	it("keeps a mark whole when split at its edge", () => {
		expect(splitBlockText("a **b**c", "paragraph", 5)).toEqual({
			before: "a **b**",
			after: "c",
			opened: 0,
		})
	})
})
