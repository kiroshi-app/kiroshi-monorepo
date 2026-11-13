import { describe, expect, it, vi } from "vitest"

import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_ITEMS,
} from "@workspace/ui/components/library.fixtures"
import {
	blockIdsOf,
	blockTypeOf,
	calloutTextOf,
	calloutTitleOf,
	calloutToneOf,
	checklistRowsOf,
	checklistSourceOf,
	codeLanguageOf,
	conversionsOf,
	convertSource,
	foundAnchorIn,
	galleryItemsOf,
	keepIds,
	type LibraryBlock,
	marked,
	movedTo,
	offsetsOf,
	parseBlocks,
	passageOfShown,
	relaid,
	rowAfter,
	serializeBlocks,
	shiftedAcross,
	shiftedOffset,
	tableRowsOf,
	tableSourceOf,
	toggledRow,
	toggleTask,
	unmarked,
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
	withoutIdMarkers,
	withRow,
	withRowText,
	withWebPageFields,
} from "@workspace/ui/components/library-document-blocks"
import { libraryDocumentStartOf } from "@workspace/ui/components/library-document-editor"
import { LIBRARY_DOCUMENT_TEMPLATES } from "@workspace/ui/components/library-new-document-dialog"
import { i18n } from "@workspace/ui/lib/i18n"

const t = i18n.getFixedT("en", "common")

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
	[
		"a document with ids",
		"# Plan ^aaaaaa\n\nIntro. ^bbbbbb\n\n- one\n\n^cccccc\n\n```\ncode\n```\n\n^dddddd\n",
	],
]

describe("library document blocks", () => {
	it.each(FIXTURES)("round-trips %s unchanged", (_, body) => {
		expect(serializeBlocks(parseBlocks(body, blockIdsOf()))).toBe(body)
	})

	it("reads one block per top-level markdown block, typed", () => {
		const { blocks } = parseBlocks(EVERY_BLOCK, blockIdsOf())

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
		const { blocks } = parseBlocks("# A\nText\n", blockIdsOf())
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
			parseBlocks(markdown, blockIdsOf()),
			[0, 14, 29],
			blockIdsOf(),
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
		const document = parseBlocks("Ship it\n\nThen rest", blockIdsOf())

		expect(withEmptyBlocksAt(document, [0, 3, 9], blockIdsOf())).toEqual(
			document,
		)
	})

	it("gives an empty document its one empty block", () => {
		const seeded = withEmptyBlocksAt(
			parseBlocks("", blockIdsOf()),
			[0],
			blockIdsOf(),
		)

		expect(seeded.blocks.map(({ source }) => source)).toEqual([""])
		expect(serializeBlocks(seeded)).toBe("")
	})
})

const EVERY_KIND =
	"# Plan\n\nIntro text.\n\n- one\n- two\n\n* [ ] task\n* [x] done\n\n> quoted\n\n```rust\nfn main() {}\n```\n\n| a | b |\n| - | - |\n| 1 | 2 |\n\n---\n\n![chart](chart.png)"

const ID = /^[a-z0-9]{6}$/

const blocksOf = (text: string) => parseBlocks(text, blockIdsOf()).blocks

const sourcesOf = (text: string) => blocksOf(text).map(({ source }) => source)

const savedIdsOf = (text: string) =>
	blocksOf(text).map(({ id, written }) =>
		written?.endsWith(`^${id}`) ? id : undefined,
	)

const backfilled = (text: string) => {
	const ids = blockIdsOf()
	return serializeBlocks(marked(parseBlocks(text, ids), ids))
}

const writtenAs = (source: string, id: string) =>
	serializeBlocks(
		marked({ lead: "", blocks: [{ id, source, gap: "" }] }, blockIdsOf()),
	)

describe("block ids read as blocks_of reads them", () => {
	it("cuts every top-level kind into one block, none named", () => {
		expect(savedIdsOf(EVERY_KIND)).toEqual(Array(9).fill(undefined))
		expect(sourcesOf("## Goal\n\nSub\n===")).toEqual(["## Goal", "Sub\n==="])
	})

	it("holds loose list items and nested lines in one list", () => {
		expect(
			sourcesOf("- one\n\n- two\n  more of two\n  - nested\n\nAfter."),
		).toEqual(["- one\n\n- two\n  more of two\n  - nested", "After."])
	})

	it("reads a marker-shaped line inside a fence as code", () => {
		const text = "```\n# not a heading\n\n^abc123\n```"

		expect(sourcesOf(text)).toEqual([text])
		expect(savedIdsOf(text)).toEqual([undefined])
	})

	it.each(["---\ntitle: x\n---", "---\ntitle: x\n..."])(
		"keeps the front matter %j out of every block and every marker",
		(front) => {
			const text = `${front}\n\n# Plan\n\n- one`
			const filled = backfilled(text)

			expect(sourcesOf(text)).toEqual(["# Plan", "- one"])
			expect(filled.startsWith(`${front}\n\n# Plan ^`)).toBe(true)
			expect(sourcesOf(filled)).toEqual(["# Plan", "- one"])
			expect(blocksOf(front)).toEqual([])
		},
	)

	it("reads dashes never closed as a rule and its blocks", () => {
		expect(sourcesOf("---\ntitle: x\n\nBody.")).toEqual([
			"---",
			"title: x",
			"Body.",
		])
	})

	it("cuts a paragraph interrupted by a heading in two", () => {
		expect(sourcesOf("Text\n# Title\nMore")).toEqual([
			"Text",
			"# Title",
			"More",
		])
	})

	it("names every block once with a unique id, its source unchanged", () => {
		const text = backfilled(EVERY_KIND)
		const ids = savedIdsOf(text)

		expect(sourcesOf(text)).toEqual(sourcesOf(EVERY_KIND))
		expect(ids.every((id) => id !== undefined && ID.test(id))).toBe(true)
		expect(new Set(ids).size).toBe(ids.length)
		expect(backfilled(text)).toBe(text)
	})

	it("ends a heading or a paragraph with its id and sets it below any other block", () => {
		const text = backfilled("# Plan\n\nIntro.\n\n- one\n\n---")
		const [plan, intro, list, rule] = savedIdsOf(text)

		expect(text).toBe(
			`# Plan ^${plan}\n\nIntro. ^${intro}\n\n- one\n\n^${list}\n\n---\n\n^${rule}`,
		)
	})

	it("keeps every saved id and renews only a duplicate", () => {
		const filled = backfilled(
			"# Plan ^aaaaaa\n\nOne. ^bbbbbb\n\nCopy. ^bbbbbb\n\nNew.",
		)
		const [plan, one, copy, added] = savedIdsOf(filled)

		expect([plan, one]).toEqual(["aaaaaa", "bbbbbb"])
		expect(copy).toMatch(ID)
		expect(copy).not.toBe("bbbbbb")
		expect(added).toMatch(ID)
		expect(sourcesOf(filled)).toEqual(["# Plan", "One.", "Copy.", "New."])
		expect(backfilled(filled)).toBe(filled)
	})

	it("sets the id of a block glued to the next one on a line apart from both", () => {
		const text = backfilled("```\ncode\n```\nAfter.")

		expect(sourcesOf(text)).toEqual(["```\ncode\n```", "After."])
		expect(savedIdsOf(text).every((id) => id !== undefined)).toBe(true)
	})

	it("closes an unclosed fence before its id so the id stays out of the code", () => {
		const text = backfilled("Intro.\n\n```\ncode")

		expect(sourcesOf(text)).toEqual(["Intro.", "```\ncode\n```"])
		expect(savedIdsOf(text).every((id) => id !== undefined)).toBe(true)
	})

	it("sets the id of a heading with a closing sequence below it", () => {
		const text = backfilled("# Plan #")

		expect(sourcesOf(text)).toEqual(["# Plan #"])
		expect(text).toMatch(/^# Plan #\n\n\^[a-z0-9]{6}$/)
	})

	it("reads a marker with no block to name as no block, and leaves it in place", () => {
		const text = "^abcdef\n\n# Plan ^aaaaaa\n\n^bbbbbb"

		expect(sourcesOf(text)).toEqual(["# Plan"])
		expect(savedIdsOf(text)).toEqual(["aaaaaa"])
		expect(serializeBlocks(parseBlocks(text, blockIdsOf()))).toBe(text)
	})
})

describe("block ids written by the editor", () => {
	it("drops every marker pasted in a block and names each block it holds anew", () => {
		const pasted = writtenAs(
			"# Title ^aaaaaa\nBody. ^bbbbbb ^cccccc\n\n- item\n\n^dddddd\n\n^eeeeee",
			"pasted",
		)
		const ids = savedIdsOf(pasted)

		expect(sourcesOf(pasted)).toEqual(["# Title", "Body.", "- item"])
		expect(ids[0]).toBe("pasted")
		expect(new Set(ids).size).toBe(3)
		expect(
			ids.some((id) =>
				["bbbbbb", "cccccc", "dddddd", "eeeeee"].includes(id ?? ""),
			),
		).toBe(false)
	})

	it("keeps the id on the first part of a split block and names the second anew", () => {
		const [first, second] = savedIdsOf(writtenAs("# New\n\nMore.", "aaaaaa"))

		expect(first).toBe("aaaaaa")
		expect(second).toMatch(ID)
		expect(second).not.toBe("aaaaaa")
	})

	it("keeps the id of the first part and drops the second once two parts merge", () => {
		expect(writtenAs("One and two.", "aaaaaa")).toBe("One and two. ^aaaaaa")
	})

	it("writes nothing for a block made only of markers", () => {
		expect(writtenAs("^abcdef\n\n  \n", "aaaaaa")).toBe("")
	})

	it("leaves a document byte-identical until an edit, then names every block", () => {
		const text = "# Plan ^aaaaaa\n\nIntro.\n\n- one"
		const ids = blockIdsOf()
		const document = parseBlocks(text, ids)
		const [, intro, list] = document.blocks

		expect(serializeBlocks(document)).toBe(text)
		expect(serializeBlocks(marked(document, ids))).toBe(
			`# Plan ^aaaaaa\n\nIntro. ^${intro.id}\n\n- one\n\n^${list.id}`,
		)
	})

	it("keeps an id through an edit, a conversion and a move, in the encoding of the new type", () => {
		const ids = blockIdsOf()
		const { lead, blocks } = parseBlocks(
			"# Plan ^aaaaaa\n\nIntro. ^bbbbbb\n\nLast. ^cccccc",
			ids,
		)
		const edited = blocks.map((block) =>
			block.id === "bbbbbb" ? { ...block, source: "- Intro, edited." } : block,
		)
		const moved = relaid(blocks, movedTo(edited, 1, 2))

		expect(serializeBlocks(marked({ lead, blocks: moved }, ids))).toBe(
			"# Plan ^aaaaaa\n\nLast. ^cccccc\n\n- Intro, edited.\n\n^bbbbbb",
		)
	})

	it("keeps a blank line around an edited block so two blocks never merge", () => {
		const ids = blockIdsOf()
		const { lead, blocks } = parseBlocks("Text ^aaaaaa\n# Title ^bbbbbb", ids)
		const edited = blocks.map((block) =>
			block.id === "bbbbbb" ? { ...block, source: "Title" } : block,
		)
		const text = serializeBlocks(marked({ lead, blocks: edited }, ids))

		expect(text).toBe("Text ^aaaaaa\n\nTitle ^bbbbbb")
		expect(savedIdsOf(text)).toEqual(["aaaaaa", "bbbbbb"])
	})

	it("keeps a paragraph glued under a heading when it names both", () => {
		const ids = blockIdsOf()
		const document = parseBlocks("## Decisions\nShip\n## Next steps", ids)
		const [decisions, ship, next] = document.blocks.map(({ id }) => id)

		expect(serializeBlocks(marked(document, ids))).toBe(
			`## Decisions ^${decisions}\nShip ^${ship}\n## Next steps ^${next}`,
		)
	})

	it("follows an offset into its block when ids are written across the document", () => {
		const ids = blockIdsOf()
		const before = parseBlocks("# Plan\n\n- one\n\nShip it", ids)
		const after = marked(before, ids)
		const at = serializeBlocks(before).indexOf("it")

		expect(
			serializeBlocks(after).slice(shiftedAcross(before, after, at)),
		).toMatch(/^it \^[a-z0-9]{6}$/)
	})

	it("removes the marker of a deleted block", () => {
		const ids = blockIdsOf()
		const { lead, blocks } = parseBlocks(
			"# Plan ^aaaaaa\n\n- one\n\n^bbbbbb\n\nLast. ^cccccc",
			ids,
		)
		const kept = relaid(
			blocks,
			blocks.filter(({ id }) => id !== "bbbbbb"),
		)

		expect(serializeBlocks(marked({ lead, blocks: kept }, ids))).toBe(
			"# Plan ^aaaaaa\n\nLast. ^cccccc",
		)
	})

	it("gives fresh ids of six letters or digits, never one already held", () => {
		const ids = blockIdsOf()
		ids.hold("aaaaaa")
		const fresh = Array.from({ length: 500 }, ids.fresh)

		expect(fresh.every((id) => ID.test(id))).toBe(true)
		expect(new Set([...fresh, "aaaaaa"]).size).toBe(501)
	})
})

describe("block ids while a block holds several parts", () => {
	const typedInto = (
		block: LibraryBlock,
		source: string,
		ids = blockIdsOf(),
	): LibraryBlock =>
		marked({ lead: "", blocks: [{ ...block, source }] }, ids).blocks[0]

	const idsWritten = (block: LibraryBlock) => savedIdsOf(block.written ?? "")

	it("writes the same id for every part after the first on each keystroke", () => {
		const ids = blockIdsOf()
		const first = typedInto(
			{ id: "aaaaaa", source: "", gap: "" },
			"One.\n\nTwo.",
			ids,
		)
		const [, second] = idsWritten(first)
		const typed = typedInto(first, "One.\n\nTwo, typed.", ids)
		const again = typedInto(typed, "One, typed.\n\nTwo, typed.", ids)

		expect(second).toMatch(ID)
		expect(idsWritten(typed)).toEqual(["aaaaaa", second])
		expect(idsWritten(again)).toEqual(["aaaaaa", second])
	})

	it("gives only an added part a fresh id, wherever it lands", () => {
		const ids = blockIdsOf()
		const three = typedInto(
			{ id: "aaaaaa", source: "", gap: "" },
			"One.\n\nTwo.\n\nThree.",
			ids,
		)
		const [, two, last] = idsWritten(three)
		const appended = idsWritten(
			typedInto(three, "One.\n\nTwo.\n\nThree.\n\nFour.", ids),
		)
		const inserted = idsWritten(
			typedInto(three, "One.\n\nNew.\n\nTwo.\n\nThree.", ids),
		)

		expect(appended.slice(0, 3)).toEqual(["aaaaaa", two, last])
		expect(appended[3]).toMatch(ID)
		expect([two, last]).not.toContain(appended[3])
		expect([inserted[0], inserted[2], inserted[3]]).toEqual([
			"aaaaaa",
			two,
			last,
		])
		expect(inserted[1]).toMatch(ID)
		expect([two, last]).not.toContain(inserted[1])
	})
})

describe("withoutIdMarkers", () => {
	it("strips every marker from pasted text and keeps its code", () => {
		expect(
			withoutIdMarkers(
				"^stray1\n\n# Title ^aaaaaa\nBody. ^bbbbbb ^cccccc\n\n- item\n\n^dddddd\n\n```\n^code12\n```",
			),
		).toBe("# Title\nBody.\n\n- item\n\n```\n^code12\n```")
	})

	it("leaves text with no marker exactly as pasted", () => {
		const pasted = "First thought.\n\nSecond ^ thought.\n\nThird thought."

		expect(withoutIdMarkers(pasted)).toBe(pasted)
		expect(withoutIdMarkers(" Bring the deck. ^abc123")).toBe(
			" Bring the deck.",
		)
	})

	it("keeps a pasted marker out of the saved markdown and the held ids", () => {
		const ids = blockIdsOf()
		const hold = vi.spyOn(ids, "hold")
		const document = marked(
			{
				lead: "",
				blocks: [{ id: "aaaaaa", source: "Body. ^abc123", gap: "" }],
			},
			ids,
		)
		const saved = serializeBlocks(document)
		parseBlocks(saved, ids)

		expect(saved).not.toContain("abc123")
		expect(hold).toHaveBeenCalledWith("aaaaaa")
		expect(hold).not.toHaveBeenCalledWith("abc123")
	})
})

describe("keepIds", () => {
	const reread = (previous: LibraryBlock[], markdown: string) =>
		keepIds(previous, parseBlocks(markdown, blockIdsOf())).blocks.map(
			({ id, source }) => [source, id],
		)

	it("takes each id from the markers, never from the position", () => {
		const { blocks } = parseBlocks("One. ^aaaaaa\n\nTwo. ^bbbbbb", blockIdsOf())

		expect(
			reread(blocks, "One. ^aaaaaa\n\nAgent. ^agent1\n\nTwo, edited. ^bbbbbb"),
		).toEqual([
			["One.", "aaaaaa"],
			["Agent.", "agent1"],
			["Two, edited.", "bbbbbb"],
		])
	})

	it("keeps the id of an unnamed block whose text comes back unchanged", () => {
		const { blocks } = parseBlocks("One.\n\nTwo.", blockIdsOf())
		const [one, two] = blocks.map(({ id }) => id)
		const next = reread(blocks, "Agent. ^agent1\n\nOne.\n\nTwo.")

		expect(next.slice(1)).toEqual([
			["One.", one],
			["Two.", two],
		])
	})
})

describe("unmarked", () => {
	const plainOf = (text: string) =>
		serializeBlocks(unmarked(parseBlocks(text, blockIdsOf())))

	it("writes a plain text with no marker back byte-identical", () => {
		const text = "Plan\n\nIntro, then a ^ sign.\n\n- one\n- two\n"

		expect(serializeBlocks(parseBlocks(text, blockIdsOf()))).toBe(text)
		expect(plainOf(text)).toBe(text)
	})

	it("drops every marker the text already carries", () => {
		expect(
			plainOf("# Plan ^aaaaaa\n\nIntro. ^bbbbbb\n\n- one\n\n^cccccc"),
		).toBe("# Plan\n\nIntro.\n\n- one")
	})

	it("writes a split block with no marker on either part", () => {
		const { lead, blocks } = parseBlocks("Plan", blockIdsOf())
		const split = { lead, blocks: [{ ...blocks[0], source: "# New\n\nMore." }] }

		expect(serializeBlocks(unmarked(split))).toBe("# New\n\nMore.")
	})

	it("sets blocks apart as the markdown format does, the markers aside", () => {
		const text = "```\ncode\n```\nAfter."
		const ids = blockIdsOf()
		const document = parseBlocks(text, ids)

		const gapsOf = ({ blocks }: typeof document) => blocks.map(({ gap }) => gap)

		expect(gapsOf(unmarked(document))).toEqual(gapsOf(marked(document, ids)))
		expect(plainOf(text)).toBe("```\ncode\n```\n\nAfter.")
	})
})

describe("foundAnchorIn", () => {
	const { blocks } = parseBlocks(
		"# Plan ^aaaaaa\n\nThe boat leaves at 17:30, the boat is late. ^bbbbbb",
		blockIdsOf(),
	)

	it("finds a block by its id", () => {
		expect(foundAnchorIn(blocks, { blockId: "bbbbbb" })).toEqual({
			blockId: "bbbbbb",
		})
	})

	it("finds nothing for a block that left the document", () => {
		expect(foundAnchorIn(blocks, { blockId: "cccccc" })).toBeUndefined()
	})

	it("keeps a passage whose text still sits at its range", () => {
		const passage = { start: 26, end: 34, text: "the boat" }

		expect(foundAnchorIn(blocks, { blockId: "bbbbbb", passage })).toEqual({
			blockId: "bbbbbb",
			passage,
		})
	})

	it("follows a passage whose text moved inside its block", () => {
		const passage = { start: 9, end: 15, text: "leaves" }

		expect(
			foundAnchorIn(blocks, {
				blockId: "bbbbbb",
				passage: { ...passage, start: 2, end: 8 },
			}),
		).toEqual({ blockId: "bbbbbb", passage })
	})

	it("finds nothing for a passage whose text left its block", () => {
		expect(
			foundAnchorIn(blocks, {
				blockId: "bbbbbb",
				passage: { start: 4, end: 9, text: "ferry" },
			}),
		).toBeUndefined()
	})
})

describe("passageOfShown", () => {
	const source =
		"The **boat** leaves from [the dock](https://example.com/dock), then the boat waits."
	const shown = "The boat leaves from the dock, then the boat waits."

	const selected = (text: string, from = 0) => {
		const start = shown.indexOf(text, from)
		return { shown, start, end: start + text.length }
	}

	it("maps selected words to their place in the markdown", () => {
		expect(passageOfShown(source, selected("leaves"))).toEqual({
			start: 13,
			end: 19,
			text: "leaves",
		})
	})

	it("keeps the occurrence that was selected", () => {
		const start = source.lastIndexOf("boat")

		expect(passageOfShown(source, selected("boat", 10))).toEqual({
			start,
			end: start + 4,
			text: "boat",
		})
	})

	it("maps a selection that spans bold text to the markdown it covers", () => {
		expect(passageOfShown(source, selected("The boat leaves"))).toEqual({
			start: 0,
			end: 19,
			text: "The **boat** leaves",
		})
	})

	it("maps a selection that ends inside a link to the markdown it covers", () => {
		const text = "boat** leaves from [the dock"

		expect(
			passageOfShown(source, selected("boat leaves from the dock")),
		).toEqual({ start: 6, end: 6 + text.length, text })
	})

	it("leaves the blanks around the selected words out", () => {
		const { start, end } = selected("leaves")

		expect(
			passageOfShown(source, { shown, start: start - 1, end: end + 1 }),
		).toEqual({ start: 13, end: 19, text: "leaves" })
	})

	it("maps a list item past its marker and across its lines", () => {
		expect(
			passageOfShown("- one *two*\n- three", {
				shown: "one two\nthree",
				start: 4,
				end: 13,
			}),
		).toEqual({ start: 7, end: 19, text: "two*\n- three" })
	})

	it("gives up when the block draws text its markdown does not write", () => {
		expect(
			passageOfShown("> [!NOTE]\n> Bring a coat.", {
				shown: "Note Bring a coat.",
				start: 5,
				end: 10,
			}),
		).toBeUndefined()
	})

	it("gives up on a selection of blanks", () => {
		const start = shown.indexOf(" boat")

		expect(
			passageOfShown(source, { shown, start, end: start + 1 }),
		).toBeUndefined()
	})
})
