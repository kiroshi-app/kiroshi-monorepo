import { markdownLanguage } from "@codemirror/lang-markdown"

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
const CALLOUT_LEAD = /^[ \t]*>[ \t]*\[!(?:NOTE|WARNING)\]/
const FENCE_INFO = /^[ \t]*(?:`{3,}|~{3,})[ \t]*([^\s`]*)/

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

export {
	type BlockIds,
	blockTypeOf,
	continuedMarkerOf,
	conversionsOf,
	convertSource,
	isTextBlockType,
	keepIds,
	type LibraryBlock,
	type LibraryBlockDocument,
	type LibraryBlockType,
	MARKERS,
	offsetsOf,
	parseBlocks,
	relaid,
	serializeBlocks,
	toggleTask,
}
