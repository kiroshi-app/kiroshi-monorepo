import { describe, expect, it } from "vitest"

import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_ITEMS,
} from "@workspace/ui/components/library.fixtures"
import {
	blockTypeOf,
	conversionsOf,
	convertSource,
	parseBlocks,
	relaid,
	serializeBlocks,
} from "@workspace/ui/components/library-document-blocks"
import { libraryDocumentStartOf } from "@workspace/ui/components/library-document-editor"
import { LIBRARY_DOCUMENT_TEMPLATES } from "@workspace/ui/components/library-new-document-dialog"
import { i18n } from "@workspace/ui/lib/i18n"

const t = i18n.getFixedT("en", "common")

const idsFrom = () => {
	let count = 0
	return () => `block-${++count}`
}

const EVERY_BLOCK = [
	"# Launch plan",
	"## Decisions",
	"",
	"- Ship on the **14th**",
	"- Copy is *final* on the 7th",
	"",
	"1. Draft the notes",
	"2. Review with ~~legal~~ design",
	"",
	"- [ ] Book the room",
	"- [x] Send the invite",
	"",
	"> Keep the launch quiet until the 14th.",
	"",
	"> [!NOTE]",
	"> The export keeps the archived rooms too.",
	"",
	"| Room | Seats |",
	"| --- | --- |",
	"| Atlas | 12 |",
	"",
	"```ts",
	"const launch = await ship()",
	"",
	"await announce(launch)",
	"```",
	"",
	"```gallery",
	"- image: https://images.example.org/sofa-green.jpg",
	"  alt: Green velvet sofa",
	"```",
	"",
	"```web-page",
	"url: https://www.example.org/rooms",
	"title: Rooms and rates",
	"```",
	"",
	"```collapsible",
	"title: Full list",
	"",
	"- one",
	"```",
	"",
	"Read the `brief` and the [press kit](https://example.org/press).",
	"",
].join("\n")

const FIXTURES: [name: string, body: string][] = [
	["the agent document", LIBRARY_AGENT_DOCUMENT.body],
	...LIBRARY_ITEMS.flatMap((item): [string, string][] =>
		item.kind === "document" ? [[item.name, item.excerpt]] : [],
	),
	...LIBRARY_DOCUMENT_TEMPLATES.map((template): [string, string] => [
		`the ${template} template`,
		libraryDocumentStartOf(template, new Date(2026, 10, 2), t).body,
	]),
	["every block type", EVERY_BLOCK],
	["a lead and no trailing newline", "\n\n  Just a line"],
	["windows line ends", "# Title\r\n\r\nA line\r\n"],
	["an empty document", ""],
]

describe("library document blocks", () => {
	it.each(FIXTURES)("round-trips %s unchanged", (_, body) => {
		expect(serializeBlocks(parseBlocks(body, idsFrom()))).toBe(body)
	})

	it("reads one block per top-level markdown block, typed", () => {
		const { blocks } = parseBlocks(EVERY_BLOCK, idsFrom())

		expect(blocks.map(({ source }) => blockTypeOf(source))).toEqual([
			"heading",
			"heading",
			"list",
			"list",
			"checklist",
			"quote",
			"callout",
			"table",
			"code",
			"gallery",
			"web-page",
			"collapsible",
			"paragraph",
		])
	})

	it("turns a text block into another text type and back", () => {
		const list = convertSource("Ship the strip\nKeep three", "list")

		expect(list).toBe("- Ship the strip\n- Keep three")
		expect(convertSource(list, "checklist")).toBe(
			"- [ ] Ship the strip\n- [ ] Keep three",
		)
		expect(convertSource("## Decisions", "quote")).toBe("> Decisions")
		expect(convertSource("> Decisions", "heading")).toBe("## Decisions")
		expect(convertSource("- a\n- b", "paragraph")).toBe("a\nb")
	})

	it("offers no conversion but itself to a rich block", () => {
		expect(conversionsOf("gallery")).toEqual(["gallery"])
		expect(conversionsOf("quote")).toEqual([
			"paragraph",
			"heading",
			"list",
			"checklist",
			"quote",
		])
	})

	it("keeps the trailing text in place and a blank line between moved blocks", () => {
		const { blocks } = parseBlocks("# A\nText\n", idsFrom())
		const moved = relaid(blocks, [blocks[1], blocks[0]])

		expect(serializeBlocks({ lead: "", blocks: moved })).toBe("Text\n\n# A\n")
	})
})
