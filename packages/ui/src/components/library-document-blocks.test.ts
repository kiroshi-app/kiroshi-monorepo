import { describe, expect, it } from "vitest"

import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_ITEMS,
} from "@workspace/ui/components/library.fixtures"
import {
	blockTypeOf,
	calloutTextOf,
	calloutTitleOf,
	calloutToneOf,
	checklistRowsOf,
	checklistSourceOf,
	codeLanguageOf,
	conversionsOf,
	convertSource,
	galleryItemsOf,
	offsetsOf,
	parseBlocks,
	relaid,
	rowAfter,
	serializeBlocks,
	shiftedOffset,
	tableRowsOf,
	tableSourceOf,
	toggledRow,
	toggleTask,
	webPageFieldsOf,
	withCalloutText,
	withCalloutTone,
	withCaption,
	withCell,
	withCodeBody,
	withCodeLanguage,
	withColumn,
	withEmptyBlocksAt,
	withGalleryItems,
	withRow,
	withRowText,
	withWebPageFields,
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

	it("ticks and unticks only the nth task of a checklist", () => {
		const checklist = "- [ ] Book the room\n- [x] Send the invite"

		expect(toggleTask(checklist, 0)).toBe(
			"- [x] Book the room\n- [x] Send the invite",
		)
		expect(toggleTask(checklist, 1)).toBe(
			"- [ ] Book the room\n- [ ] Send the invite",
		)
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

const GALLERY = [
	"```gallery",
	"- image: https://images.example.org/sofa.jpg",
	"  alt: Green velvet sofa",
	"  source: https://shop.example.org/sofa",
	"- image: https://images.example.org/lamp.jpg",
	"  alt: Brass lamp",
	"  caption: In the hall",
	"```",
].join("\n")

describe("library rich block sources", () => {
	it("reads a gallery's images with every field and writes them back in order", () => {
		const [sofa, lamp] = galleryItemsOf(GALLERY)

		expect(sofa).toEqual({
			image: "https://images.example.org/sofa.jpg",
			alt: "Green velvet sofa",
			source: "https://shop.example.org/sofa",
		})
		expect(withGalleryItems(GALLERY, [sofa, lamp])).toBe(GALLERY)
		expect(withGalleryItems(GALLERY, [lamp, sofa])).toBe(
			[
				"```gallery",
				"- image: https://images.example.org/lamp.jpg",
				"  alt: Brass lamp",
				"  caption: In the hall",
				"- image: https://images.example.org/sofa.jpg",
				"  alt: Green velvet sofa",
				"  source: https://shop.example.org/sofa",
				"```",
			].join("\n"),
		)
	})

	it("sets a caption on one line and drops it once blank", () => {
		const [sofa, lamp] = galleryItemsOf(GALLERY)

		expect(withCaption(sofa, "By the\nwindow")).toEqual({
			...sofa,
			caption: "By the window",
		})
		expect(withCaption(lamp, "  ")).toEqual({
			image: lamp.image,
			alt: lamp.alt,
		})
	})

	it("ticks, splits and rewrites the rows of a checklist", () => {
		const source = "- [ ] Book the room\n* [x] Send the invite"
		const [room, invite] = checklistRowsOf(source)

		expect(room).toEqual({
			marker: "- [ ] ",
			isDone: false,
			text: "Book the room",
		})
		expect(checklistSourceOf([toggledRow(room), toggledRow(invite)])).toBe(
			"- [x] Book the room\n* [ ] Send the invite",
		)
		expect(checklistSourceOf([invite, rowAfter(invite)])).toBe(
			"* [x] Send the invite\n* [ ] ",
		)
		expect(
			withRowText({ marker: "- [ ]", isDone: false, text: "" }, "Call"),
		).toEqual({ marker: "- [ ] ", isDone: false, text: "Call" })
	})

	it("switches a callout's tone and edits its text under the marker line", () => {
		const source = "> [!NOTE] Held until Wednesday\n> Pay the deposit."

		expect(calloutToneOf(source)).toBe("note")
		expect(calloutTitleOf(source)).toBe("Held until Wednesday")
		expect(calloutTextOf(source)).toBe("Pay the deposit.")
		expect(withCalloutTone(source, "tip")).toBe(
			"> [!TIP] Held until Wednesday\n> Pay the deposit.",
		)
		expect(withCalloutText(source, "Pay it.\n\nThen book.")).toBe(
			"> [!NOTE] Held until Wednesday\n> Pay it.\n>\n> Then book.",
		)
		expect(blockTypeOf(withCalloutTone(source, "tip"))).toBe("callout")
	})

	it("edits a table cell, escaping its pipes, and grows rows and columns", () => {
		const rows = tableRowsOf("| Room | Seats |\n| :-- | --: |\n| Atlas | 12 |")

		expect(rows).toEqual([
			["Room", "Seats"],
			[":--", "--:"],
			["Atlas", "12"],
		])
		expect(tableSourceOf(withCell(rows, 2, 1, "12 | 14"))).toBe(
			"| Room | Seats |\n| :-- | --: |\n| Atlas | 12 \\| 14 |",
		)
		expect(tableSourceOf(withColumn(withRow(rows)))).toBe(
			"| Room | Seats |  |\n| :-- | --: | --- |\n| Atlas | 12 |  |\n|  |  |  |",
		)
		expect(tableRowsOf("| a \\| b | c |")).toEqual([["a \\| b", "c"]])
	})

	it("writes the language and the body of a code fence", () => {
		const fence = "```ts title=launch\nconst launch = await ship()\n```"

		expect(codeLanguageOf(fence)).toBe("ts")
		expect(withCodeLanguage(fence, "python")).toBe(
			"```python title=launch\nconst launch = await ship()\n```",
		)
		expect(withCodeLanguage("```ts\na\n```", "")).toBe("```\na\n```")
		expect(withCodeBody("```\n```", "echo hi")).toBe("```\necho hi\n```")
		expect(withCodeLanguage("    echo hi", "bash")).toBe(
			"```bash\necho hi\n```",
		)
	})

	it("reads and rewrites the fields of a web page card", () => {
		const card =
			"```web-page\nurl: https://www.example.org/rooms\ntitle: Rooms\n```"

		expect(webPageFieldsOf(card)).toEqual({
			url: "https://www.example.org/rooms",
			title: "Rooms",
		})
		expect(
			withWebPageFields(card, {
				url: "https://example.org/a",
				title: "A",
				site: "Example",
			}),
		).toBe(
			"```web-page\nurl: https://example.org/a\ntitle: A\nsite: Example\n```",
		)
		expect(webPageFieldsOf("```web-page\n```")).toEqual({})
	})
})

describe("shiftedOffset", () => {
	it("keeps an offset before the change and shifts one after it", () => {
		expect(shiftedOffset("Ship it", "Ship it now", 4)).toBe(4)
		expect(shiftedOffset("We ship it", "Ship it", 10)).toBe(7)
	})

	it("moves an offset inside a replaced span to its end", () => {
		expect(shiftedOffset("on the 10th", "on the 1st", 9)).toBe(10)
	})
})

describe("withEmptyBlocksAt", () => {
	it("cuts an empty block at each empty line, the markdown unchanged", () => {
		const markdown = "\n## Decisions\n\n## Next steps\n"
		const seeded = withEmptyBlocksAt(
			parseBlocks(markdown, idsFrom()),
			[0, 14, 29],
			idsFrom(),
		)

		expect(serializeBlocks(seeded)).toBe(markdown)
		expect(seeded.blocks.map(({ source }) => source)).toEqual([
			"",
			"## Decisions",
			"",
			"## Next steps",
			"",
		])
		expect(offsetsOf(seeded)).toEqual([0, 1, 14, 15, 29])
	})

	it("adds nothing where a block starts or inside a line", () => {
		const document = parseBlocks("Ship it\n\nThen rest", idsFrom())

		expect(withEmptyBlocksAt(document, [0, 3, 9], idsFrom())).toEqual(document)
	})

	it("gives an empty document its one empty block", () => {
		const seeded = withEmptyBlocksAt(parseBlocks("", idsFrom()), [0], idsFrom())

		expect(seeded.blocks.map(({ source }) => source)).toEqual([""])
		expect(serializeBlocks(seeded)).toBe("")
	})
})
