import { markdownLanguage } from "@codemirror/lang-markdown"

import type { CalloutTone } from "@workspace/ui/components/answer-blocks/callout"

const TEXT_BLOCK_TYPES = [
	"paragraph",
	"heading",
	"list",
	"checklist",
	"quote",
] as const

type LibraryTextBlockType = (typeof TEXT_BLOCK_TYPES)[number]

type LibraryBlockType =
	| LibraryTextBlockType
	| "gallery"
	| "callout"
	| "table"
	| "code"
	| "web-page"
	| "collapsible"
	| "other"

type LibraryBlock = {
	id: string
	source: string
	gap: string
}

type LibraryBlockDocument = {
	lead: string
	blocks: LibraryBlock[]
}

type BlockIds = () => string

const BLOCK_GAP = "\n\n"

const HEADING_SOURCE = /^#{1,6}[ \t]+|^#{1,6}$/
const SETEXT_UNDERLINE = /\n[ \t]*(?:=+|-+)[ \t]*$/
const LIST_MARKER = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/
const TASK_MARKER = /^[ \t]*[-*+][ \t]+\[[ xX]\][ \t]?/
const TASK_BOX = /^([ \t]*[-*+][ \t]+\[)([ xX])(\])/gm
const QUOTE_MARKER = /^[ \t]*>[ \t]?/
const CALLOUT_LEAD = /^[ \t]*>[ \t]*\[!(?:NOTE|TIP|WARNING)\]/
const CALLOUT_MARKER = /\[!(NOTE|TIP|WARNING)\]/
const FENCE_INFO = /^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`]*)/
const FENCE_OPENING = /^[ \t]*(`{3,}|~{3,})(.*)$/
const FENCE_CLOSING = /^[ \t]*(?:`{3,}|~{3,})[ \t]*$/
const CODE_INDENT = /^(?: {4}|\t)/
const RECORD_LINE = /^(?:- | {2})?([a-z][a-z-]*):[ \t]?(.*)$/
const ITEM_OPENING = /^- /
const TASK_PARTS = /^([ \t]*[-*+][ \t]+\[([ xX])\][ \t]?)(.*)$/
const TASK_BOX_MARK = /\[[ xX]\]/
const UNESCAPED_PIPE = /(?<!\\)\|/
const UNESCAPED_PIPES = /(?<!\\)\|/g
const LINE_BREAKS = /[ \t]*\r?\n[ \t]*/g

const FENCED_TYPES: Readonly<Record<string, LibraryBlockType>> = {
	gallery: "gallery",
	"web-page": "web-page",
	collapsible: "collapsible",
	options: "other",
	"illustrated-list": "other",
	checklist: "other",
	interactive: "other",
	video: "other",
	map: "other",
	math: "other",
	mermaid: "other",
}

const isTextBlockType = (
	type: LibraryBlockType,
): type is LibraryTextBlockType =>
	(TEXT_BLOCK_TYPES as readonly string[]).includes(type)

const typeOfNode = (name: string, source: string): LibraryBlockType => {
	if (name.startsWith("ATXHeading") || name.startsWith("SetextHeading"))
		return "heading"
	if (name === "Paragraph") return "paragraph"
	if (name === "BulletList" || name === "OrderedList")
		return TASK_MARKER.test(source) ? "checklist" : "list"
	if (name === "Blockquote")
		return CALLOUT_LEAD.test(source) ? "callout" : "quote"
	if (name === "Table") return "table"
	if (name === "CodeBlock") return "code"
	if (name === "FencedCode") {
		const label = FENCE_INFO.exec(source)?.[1] ?? ""
		return FENCED_TYPES[label] ?? "code"
	}
	return "other"
}

type ParsedBlock = {
	type: LibraryBlockType
	from: number
	to: number
}

const parsedBlocksOf = (markdown: string): ParsedBlock[] => {
	const parsed: ParsedBlock[] = []
	let node = markdownLanguage.parser.parse(markdown).topNode.firstChild
	while (node) {
		parsed.push({
			type: typeOfNode(node.name, markdown.slice(node.from, node.to)),
			from: node.from,
			to: node.to,
		})
		node = node.nextSibling
	}
	return parsed
}

const blockTypeOf = (source: string): LibraryBlockType =>
	parsedBlocksOf(source)[0]?.type ?? "paragraph"

const parseBlocks = (
	markdown: string,
	nextId: BlockIds,
): LibraryBlockDocument => {
	const parsed = parsedBlocksOf(markdown)
	if (parsed.length === 0) return { lead: markdown, blocks: [] }

	return {
		lead: markdown.slice(0, parsed[0].from),
		blocks: parsed.map(({ from, to }, index) => ({
			id: nextId(),
			source: markdown.slice(from, to),
			gap: markdown.slice(to, parsed[index + 1]?.from ?? markdown.length),
		})),
	}
}

const serializeBlocks = ({ lead, blocks }: LibraryBlockDocument) =>
	lead + blocks.map(({ source, gap }) => source + gap).join("")

const offsetsOf = ({ lead, blocks }: LibraryBlockDocument) => {
	let at = lead.length
	return blocks.map(({ source, gap }) => {
		const start = at
		at += source.length + gap.length
		return start
	})
}

const shiftedOffset = (before: string, after: string, offset: number) => {
	const limit = Math.min(before.length, after.length)
	let head = 0
	while (head < limit && before[head] === after[head]) head++
	let tail = 0
	while (
		tail < limit - head &&
		before[before.length - 1 - tail] === after[after.length - 1 - tail]
	)
		tail++

	if (offset <= head) return offset
	if (offset >= before.length - tail)
		return offset + after.length - before.length
	return after.length - tail
}

const withEmptyBlockAt = (
	document: LibraryBlockDocument,
	at: number,
	nextId: BlockIds,
): LibraryBlockDocument => {
	const markdown = serializeBlocks(document)
	const offsets = offsetsOf(document)
	const isLineStart = at === 0 || markdown[at - 1] === "\n"
	if (!isLineStart || at > markdown.length || offsets.includes(at))
		return document

	const { lead, blocks } = document
	const emptyBlock = (gap: string) => ({ id: nextId(), source: "", gap })
	if (at <= lead.length)
		return {
			lead: lead.slice(0, at),
			blocks: [emptyBlock(lead.slice(at)), ...blocks],
		}
	const index = offsets.findLastIndex((start) => start < at)
	const block = blocks[index]
	const within = at - offsets[index] - block.source.length
	if (within < 0) return document
	return {
		lead,
		blocks: [
			...blocks.slice(0, index),
			{ ...block, gap: block.gap.slice(0, within) },
			emptyBlock(block.gap.slice(within)),
			...blocks.slice(index + 1),
		],
	}
}

const withEmptyBlocksAt = (
	document: LibraryBlockDocument,
	offsets: number[],
	nextId: BlockIds,
) =>
	offsets.reduce((seeded, at) => withEmptyBlockAt(seeded, at, nextId), document)

const keepIds = (
	previous: LibraryBlock[],
	next: LibraryBlockDocument,
): LibraryBlockDocument => ({
	...next,
	blocks: next.blocks.map((block, index) => ({
		...block,
		id: previous[index]?.id ?? block.id,
	})),
})

const withBlankLine = (gap: string) =>
	gap.includes(BLOCK_GAP) ? gap : BLOCK_GAP

const relaid = (
	previous: LibraryBlock[],
	sources: Omit<LibraryBlock, "gap">[],
): LibraryBlock[] => {
	const trailing = previous.at(-1)?.gap ?? ""
	return sources.map((block, index) => ({
		...block,
		gap:
			index === sources.length - 1
				? trailing
				: withBlankLine(previous[index]?.gap ?? BLOCK_GAP),
	}))
}

const textLinesOf = (source: string, type: LibraryTextBlockType) => {
	if (type === "heading")
		return [source.replace(SETEXT_UNDERLINE, "").replace(HEADING_SOURCE, "")]
	const lines = source.split("\n")
	if (type === "list") return lines.map((line) => line.replace(LIST_MARKER, ""))
	if (type === "checklist")
		return lines.map((line) => line.replace(TASK_MARKER, ""))
	if (type === "quote")
		return lines.map((line) => line.replace(QUOTE_MARKER, ""))
	return lines
}

const MARKERS: Readonly<Record<LibraryTextBlockType, string>> = {
	paragraph: "",
	heading: "## ",
	list: "- ",
	checklist: "- [ ] ",
	quote: "> ",
}

const sourceOfText = (lines: string[], type: LibraryTextBlockType) =>
	type === "heading"
		? `${MARKERS.heading}${lines.join(" ")}`
		: lines.map((line) => `${MARKERS[type]}${line}`).join("\n")

const convertSource = (source: string, to: LibraryTextBlockType) => {
	const from = blockTypeOf(source)
	if (!isTextBlockType(from) || from === to) return source
	return sourceOfText(textLinesOf(source, from), to)
}

const conversionsOf = (type: LibraryBlockType): LibraryBlockType[] =>
	isTextBlockType(type) ? [...TEXT_BLOCK_TYPES] : [type]

const continuedMarkerOf = (line: string) =>
	TASK_MARKER.exec(line)?.[0].replace(/\[[xX]\]/, "[ ]") ??
	LIST_MARKER.exec(line)?.[0] ??
	QUOTE_MARKER.exec(line)?.[0]

const toggleTask = (source: string, index: number) => {
	let seen = -1
	return source.replace(
		TASK_BOX,
		(box, open: string, mark: string, close: string) => {
			seen += 1
			if (seen !== index) return box
			return `${open}${mark === " " ? "x" : " "}${close}`
		},
	)
}

const movedTo = <Item>(items: readonly Item[], from: number, to: number) => {
	const next = [...items]
	const [moved] = next.splice(from, 1)
	next.splice(to, 0, moved)
	return next
}

type BlockRecord = Record<string, string>

type SourceEdit = (edit: (source: string) => string) => void

type Fence = {
	marker: string
	info: string
	body: string
}

const fenceOf = (source: string): Fence => {
	const lines = source.split("\n")
	const opening = FENCE_OPENING.exec(lines[0])
	if (!opening)
		return {
			marker: "```",
			info: "",
			body: lines.map((line) => line.replace(CODE_INDENT, "")).join("\n"),
		}
	const isClosed = lines.length > 1 && FENCE_CLOSING.test(lines.at(-1) ?? "")
	return {
		marker: opening[1],
		info: opening[2].trim(),
		body: lines.slice(1, isClosed ? -1 : undefined).join("\n"),
	}
}

const fencedSource = ({ marker, info, body }: Fence) =>
	[`${marker}${info}`, ...(body === "" ? [] : [body]), marker].join("\n")

const oneLine = (value: string) => value.replace(LINE_BREAKS, " ")

const codeLanguageOf = (source: string) =>
	fenceOf(source).info.split(/\s/)[0] ?? ""

const withCodeLanguage = (source: string, language: string) => {
	const fence = fenceOf(source)
	const [, ...attributes] = fence.info.split(/\s+/)
	const info = [language, ...attributes].join(" ").trim()
	return fencedSource({ ...fence, info })
}

const withCodeBody = (source: string, body: string) =>
	fencedSource({ ...fenceOf(source), body })

const recordsOf = (body: string) => {
	const records: BlockRecord[] = []
	for (const line of body.split("\n")) {
		const field = RECORD_LINE.exec(line)
		if (!field) continue
		if (ITEM_OPENING.test(line) || records.length === 0) records.push({})
		const record = records.at(-1) as BlockRecord
		record[field[1]] = field[2].trim()
	}
	return records
}

const linesOf = (record: BlockRecord, lead: string, indent: string) =>
	Object.entries(record)
		.map(
			([key, value], index) => `${index === 0 ? lead : indent}${key}: ${value}`,
		)
		.join("\n")

const galleryItemsOf = (source: string) => recordsOf(fenceOf(source).body)

const withGalleryItems = (source: string, items: BlockRecord[]) =>
	fencedSource({
		...fenceOf(source),
		body: items.map((item) => linesOf(item, "- ", "  ")).join("\n"),
	})

const withCaption = (item: BlockRecord, caption: string) => {
	const rest = Object.fromEntries(
		Object.entries(item).filter(([key]) => key !== "caption"),
	)
	const value = oneLine(caption)
	return value.trim() === "" ? rest : { ...rest, caption: value }
}

const webPageFieldsOf = (source: string) =>
	recordsOf(fenceOf(source).body)[0] ?? {}

const withWebPageFields = (source: string, fields: BlockRecord) =>
	fencedSource({ ...fenceOf(source), body: linesOf(fields, "", "") })

const calloutToneOf = (source: string): CalloutTone => {
	const marker = CALLOUT_MARKER.exec(source)?.[1] ?? "NOTE"
	return marker.toLowerCase() as CalloutTone
}

const calloutTitleOf = (source: string) =>
	(source.split("\n")[0] ?? "").replace(/^.*?\[![A-Z]+\]/, "").trim()

const withCalloutTone = (source: string, tone: CalloutTone) =>
	source.replace(CALLOUT_MARKER, `[!${tone.toUpperCase()}]`)

const calloutTextOf = (source: string) =>
	source
		.split("\n")
		.slice(1)
		.map((line) => line.replace(QUOTE_MARKER, ""))
		.join("\n")

const withCalloutText = (source: string, text: string) =>
	[
		source.split("\n")[0],
		...text.split("\n").map((line) => (line === "" ? ">" : `> ${line}`)),
	].join("\n")

type ChecklistRow = {
	marker: string
	isDone?: boolean
	text: string
}

const checklistRowsOf = (source: string): ChecklistRow[] =>
	source.split("\n").map((line) => {
		const task = TASK_PARTS.exec(line)
		if (!task) return { marker: "", text: line }
		return { marker: task[1], isDone: task[2] !== " ", text: task[3] }
	})

const checklistSourceOf = (rows: ChecklistRow[]) =>
	rows.map(({ marker, text }) => `${marker}${text}`).join("\n")

const toggledRow = (row: ChecklistRow): ChecklistRow =>
	row.isDone === undefined
		? row
		: {
				...row,
				isDone: !row.isDone,
				marker: row.marker.replace(TASK_BOX_MARK, row.isDone ? "[ ]" : "[x]"),
			}

const withRowText = (row: ChecklistRow, text: string): ChecklistRow => {
	const value = oneLine(text)
	const needsSpace = row.isDone !== undefined && !/\s$/.test(row.marker)
	return {
		...row,
		marker: needsSpace && value !== "" ? `${row.marker} ` : row.marker,
		text: value,
	}
}

const rowAfter = (row: ChecklistRow, text = ""): ChecklistRow => {
	const marker = continuedMarkerOf(row.marker) ?? MARKERS.checklist
	return {
		marker: /\s$/.test(marker) ? marker : `${marker} `,
		isDone: false,
		text,
	}
}

const cellsOf = (line: string) =>
	line
		.trim()
		.replace(/^\|/, "")
		.replace(/(?<!\\)\|$/, "")
		.split(UNESCAPED_PIPE)
		.map((cell) => cell.trim())

const tableRowsOf = (source: string) => source.split("\n").map(cellsOf)

const tableSourceOf = (rows: string[][]) =>
	rows.map((cells) => `| ${cells.join(" | ")} |`).join("\n")

const asCell = (value: string) => oneLine(value).replace(UNESCAPED_PIPES, "\\|")

const withCell = (
	rows: string[][],
	row: number,
	column: number,
	value: string,
) =>
	rows.map((cells, index) => {
		if (index !== row) return cells
		const next = [...cells]
		while (next.length <= column) next.push("")
		next[column] = asCell(value)
		return next
	})

const withRow = (rows: string[][]) => [...rows, rows[0].map(() => "")]

const withColumn = (rows: string[][]) =>
	rows.map((cells, index) => [...cells, index === 1 ? "---" : ""])

export {
	type BlockIds,
	type BlockRecord,
	blockTypeOf,
	type ChecklistRow,
	calloutTextOf,
	calloutTitleOf,
	calloutToneOf,
	checklistRowsOf,
	checklistSourceOf,
	codeLanguageOf,
	continuedMarkerOf,
	conversionsOf,
	convertSource,
	fenceOf,
	galleryItemsOf,
	isTextBlockType,
	keepIds,
	type LibraryBlock,
	type LibraryBlockDocument,
	type LibraryBlockType,
	MARKERS,
	movedTo,
	offsetsOf,
	parseBlocks,
	relaid,
	rowAfter,
	type SourceEdit,
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
}
