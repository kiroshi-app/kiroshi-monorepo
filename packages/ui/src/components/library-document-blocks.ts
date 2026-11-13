import { markdownLanguage } from "@codemirror/lang-markdown"

import type { CalloutTone } from "@workspace/ui/components/answer-blocks/callout"
import { BOT_MENTION_PATTERN } from "@workspace/ui/components/markdown/bot-mentions"

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
	written?: string
	gap: string
}

type LibraryBlockDocument = {
	lead: string
	blocks: LibraryBlock[]
}

type BlockIds = {
	fresh: () => string
	hold: (id: string) => void
}

const BLOCK_GAP = "\n\n"

const ID_LENGTH = 6
const ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
const TRAILING_MARKER = /(?<=^|\s)\^[a-z0-9]{6}$/
const INLINE_MARKED_NODE =
	/^(?:Paragraph|ATXHeading[1-6]|HTMLBlock|LinkReference|CommentBlock|ProcessingInstruction)$/
const CLOSING_SEQUENCE = /[ \t]#+$/
const BELOW_MARKER = /\n[ \t]*\^[a-z0-9]{6}$/
const FENCE_RUN = /^ {0,3}(`{3,}|~{3,})/
const FRONT_MATTER_CLOSING = /^(?:---|\.\.\.)$/

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

const withBlankLine = (gap: string) =>
	gap.includes(BLOCK_GAP) ? gap : BLOCK_GAP

const blockTypeOf = (source: string): LibraryBlockType =>
	parsedBlocksOf(source)[0]?.type ?? "paragraph"

const randomId = () =>
	Array.from(
		crypto.getRandomValues(new Uint8Array(ID_LENGTH)),
		(byte) => ID_ALPHABET[byte % ID_ALPHABET.length],
	).join("")

const blockIdsOf = (): BlockIds => {
	const taken = new Set<string>()
	return {
		fresh: () => {
			let id = randomId()
			while (taken.has(id)) id = randomId()
			taken.add(id)
			return id
		},
		hold: (id) => {
			taken.add(id)
		},
	}
}

const frontMatterEndOf = (markdown: string) => {
	const lines = markdown.split("\n")
	if (lines[0].trimEnd() !== "---") return 0
	const closing = lines.findIndex(
		(line, index) => index > 0 && FRONT_MATTER_CLOSING.test(line.trimEnd()),
	)
	return closing === -1 ? 0 : lines.slice(0, closing + 1).join("\n").length
}

type ReadBlock = {
	name: string
	from: number
	to: number
	end: number
	id?: string
}

const readBlocksOf = (markdown: string, start: number): ReadBlock[] => {
	const read: ReadBlock[] = []
	let node = markdownLanguage.parser.parse(markdown.slice(start)).topNode
		.firstChild
	for (; node; node = node.nextSibling) {
		const { name } = node
		const from = start + node.from
		const to = start + node.to
		const text = markdown.slice(from, to).trimEnd()
		const at = INLINE_MARKED_NODE.test(name) ? text.search(TRAILING_MARKER) : -1
		if (at === -1) {
			read.push({ name, from, to, end: to })
			continue
		}
		const id = text.slice(at + 1)
		const end = from + text.length
		const content = text.slice(0, at).trimEnd()
		if (name !== "Paragraph" || content.trim() !== "")
			read.push({ name, from, to: from + content.length, end, id })
		else {
			const previous = read.at(-1)
			if (previous && previous.id === undefined)
				Object.assign(previous, { id, end })
		}
	}
	return read
}

const parseBlocks = (markdown: string, ids: BlockIds): LibraryBlockDocument => {
	const read = readBlocksOf(markdown, frontMatterEndOf(markdown))
	if (read.length === 0) return { lead: markdown, blocks: [] }

	for (const { id } of read) if (id) ids.hold(id)
	const named = new Set<string>()
	return {
		lead: markdown.slice(0, read[0].from),
		blocks: read.map(({ from, to, end, id }, index) => {
			const isFirstNamed = id !== undefined && !named.has(id)
			if (id) named.add(id)
			return {
				id: isFirstNamed ? id : ids.fresh(),
				source: markdown.slice(from, to),
				written: end > to ? markdown.slice(from, end) : undefined,
				gap: markdown.slice(end, read[index + 1]?.from ?? markdown.length),
			}
		}),
	}
}

const markdownOf = ({ source, written }: LibraryBlock) => written ?? source

const serializeBlocks = ({ lead, blocks }: LibraryBlockDocument) =>
	lead + blocks.map((block) => markdownOf(block) + block.gap).join("")

type LibraryBlockPassage = {
	start: number
	end: number
	text: string
}

type LibraryBlockAnchor = {
	blockId: string
	passage?: LibraryBlockPassage
}

const passageAt = (text: string, start: number): LibraryBlockPassage => ({
	start,
	end: start + text.length,
	text,
})

const foundAnchorIn = (
	blocks: LibraryBlock[],
	{ blockId, passage }: LibraryBlockAnchor,
): LibraryBlockAnchor | undefined => {
	const block = blocks.find(({ id }) => id === blockId)
	if (!block) return undefined
	if (!passage) return { blockId }
	const { text, start } = passage
	const at = block.source.startsWith(text, start)
		? start
		: block.source.indexOf(text)
	return at === -1 ? undefined : { blockId, passage: passageAt(text, at) }
}

const UNSHOWN_NODE =
	/Mark$|^(?:TableDelimiter|LinkTitle|TaskMarker|Image|CodeInfo)$/

const inkOffsetsOf = (text: string) => {
	const offsets: number[] = []
	for (let at = 0; at < text.length; at++)
		if (/\S/.test(text[at])) offsets.push(at)
	return offsets
}

const shownOf = (source: string) => {
	const isUnshown = new Array<boolean>(source.length).fill(false)
	const tree = markdownLanguage.parser.parse(source)
	tree.iterate({
		enter: ({ name, from, to, node }) => {
			const isWhole =
				UNSHOWN_NODE.test(name) ||
				(name === "URL" && node.parent?.name === "Link")
			if (isWhole || name === "Escape")
				isUnshown.fill(true, from, isWhole ? to : from + 1)
			return !isWhole
		},
	})
	const mentions = [...source.matchAll(BOT_MENTION_PATTERN)].flatMap(
		({ 0: written, 1: id, index }) =>
			/Code/.test(tree.resolveInner(index, 1).name)
				? []
				: [{ from: index, to: index + written.length, id }],
	)
	for (const { from, to } of mentions) isUnshown.fill(true, from + 1, to - 1)
	return { isUnshown, mentions }
}

const shownInkOffsetsOf = (source: string) => {
	const { isUnshown } = shownOf(source)
	return inkOffsetsOf(source).filter((at) => !isUnshown[at])
}

const passageQuoteOf = (
	source: string,
	{ start, end }: LibraryBlockPassage,
	mentionNameOf: (id: string) => string,
) => {
	const { isUnshown, mentions } = shownOf(source)
	let quote = ""
	for (let at = start; at < end; at++) {
		const mention = mentions.find(({ from }) => from === at)
		if (mention) {
			quote += mentionNameOf(mention.id)
			at = mention.to - 1
		} else if (!isUnshown[at]) quote += source[at]
	}
	return quote.replace(/\s+/g, " ").trim()
}

type ShownSelection = {
	shown: string
	start: number
	end: number
}

const passageOfShown = (
	source: string,
	{ shown, start, end }: ShownSelection,
): LibraryBlockPassage | undefined => {
	const written = shownInkOffsetsOf(source)
	const drawn = inkOffsetsOf(shown)
	if (
		drawn.length !== written.length ||
		drawn.some((at, index) => shown[at] !== source[written[index]])
	)
		return undefined
	const first = drawn.findIndex((at) => at >= start)
	const last = drawn.findLastIndex((at) => at < end)
	if (first === -1 || last < first) return undefined
	return passageAt(
		source.slice(written[first], written[last] + 1),
		written[first],
	)
}

const offsetsOf = ({ lead, blocks }: LibraryBlockDocument) => {
	let at = lead.length
	return blocks.map((block) => {
		const start = at
		at += markdownOf(block).length + block.gap.length
		return start
	})
}

const carriesId = ({ id, source, written }: LibraryBlock) => {
	if (written === undefined || !written.startsWith(source)) return false
	const marker = written.slice(source.length)
	return (
		marker.endsWith(`^${id}`) && /^\s+$/.test(marker.slice(0, -id.length - 1))
	)
}

const withoutMarkers = (text: string): string => {
	const at = text.trimEnd().search(TRAILING_MARKER)
	return at === -1 ? text : withoutMarkers(text.slice(0, at).trimEnd())
}

const openFenceOf = (source: string) => {
	const lines = source.split("\n")
	const fence = FENCE_RUN.exec(lines[0])?.[1]
	if (!fence) return undefined
	const closing = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`)
	return lines.length > 1 && closing.test(lines.at(-1) ?? "")
		? undefined
		: fence
}

const markerOf = (name: string, source: string, id: string) => {
	const isHeadingClosed =
		name.startsWith("ATXHeading") && CLOSING_SEQUENCE.test(source)
	if (INLINE_MARKED_NODE.test(name) && !isHeadingClosed) return ` ^${id}`
	const fence = name === "FencedCode" ? openFenceOf(source) : undefined
	return `${fence ? `\n${fence}` : ""}${BLOCK_GAP}^${id}`
}

type Part = {
	name: string
	text: string
	id?: string
}

const partsOf = (markdown: string): Part[] =>
	readBlocksOf(markdown, 0)
		.map(({ name, from, to, id }) => ({
			name,
			id,
			text: withoutMarkers(markdown.slice(from, to)),
		}))
		.filter(({ text }) => text.trim() !== "")

const keptPartIds = (parts: Part[], previous: Part[]) => {
	let tail = 0
	while (
		tail < Math.min(parts.length, previous.length) - 1 &&
		parts.at(-1 - tail)?.text === previous.at(-1 - tail)?.text
	)
		tail++
	return parts.map((_, index) => {
		const fromEnd = parts.length - index
		if (fromEnd <= tail) return previous[previous.length - fromEnd].id
		return index < previous.length - tail ? previous[index].id : undefined
	})
}

const writtenOf = ({ id, source, written }: LibraryBlock, ids: BlockIds) => {
	const parts = partsOf(source)
	const kept = keptPartIds(parts, written === undefined ? [] : partsOf(written))
	const used = new Set([id])
	return parts
		.map(({ name, text }, index) => {
			const reused = kept[index]
			const partId =
				index === 0
					? id
					: reused !== undefined && !used.has(reused)
						? reused
						: ids.fresh()
			used.add(partId)
			return text + markerOf(name, text, partId)
		})
		.join(BLOCK_GAP)
}

const withoutIdMarkers = (markdown: string) => {
	const { topNode } = markdownLanguage.parser.parse(markdown)
	let shown = markdown.slice(0, topNode.firstChild?.from ?? markdown.length)
	let hasKept = false
	for (let node = topNode.firstChild; node; node = node.nextSibling) {
		const text = markdown.slice(node.from, node.to)
		const kept = INLINE_MARKED_NODE.test(node.name)
			? withoutMarkers(text)
			: text
		if (node.name === "Paragraph" && kept.trim() === "") continue
		if (hasKept) shown += markdown.slice(node.prevSibling?.to ?? 0, node.from)
		shown += kept
		hasKept = true
	}
	return shown + markdown.slice(topNode.lastChild?.to ?? markdown.length)
}

const isBlank = ({ source }: LibraryBlock) => source.trim() === ""

const needsWriting = (block: LibraryBlock) =>
	!isBlank(block) && !carriesId(block)

const isRunningOn = (block: LibraryBlock, next: LibraryBlock) =>
	blockTypeOf(next.source) === "paragraph" &&
	blockTypeOf(block.source) !== "heading"

const isSetApart = (
	block: LibraryBlock,
	written: string | undefined,
	next: LibraryBlock | undefined,
) => {
	if (next === undefined || isBlank(block) || isBlank(next)) return false
	if (needsWriting(block) && BELOW_MARKER.test(written ?? "")) return true
	return (needsWriting(block) || needsWriting(next)) && isRunningOn(block, next)
}

const marked = (
	document: LibraryBlockDocument,
	ids: BlockIds,
): LibraryBlockDocument => ({
	...document,
	blocks: document.blocks.map((block, index) => {
		const written = isBlank(block)
			? undefined
			: carriesId(block)
				? block.written
				: writtenOf(block, ids)
		const next = document.blocks[index + 1]
		return {
			...block,
			written,
			gap: isSetApart(block, written, next)
				? withBlankLine(block.gap)
				: block.gap,
		}
	}),
})

const unmarked = (document: LibraryBlockDocument): LibraryBlockDocument => ({
	...document,
	blocks: document.blocks.map((block, index) => {
		const plain = { ...block, written: undefined }
		const next = document.blocks[index + 1]
		return {
			...plain,
			gap: isSetApart(plain, undefined, next)
				? withBlankLine(block.gap)
				: block.gap,
		}
	}),
})

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

const shiftedAcross = (
	before: LibraryBlockDocument,
	after: LibraryBlockDocument,
	offset: number,
) => {
	const starts = offsetsOf(before)
	const index = starts.findLastIndex((start) => start <= offset)
	const block = before.blocks[index]
	const kept = after.blocks.findIndex(({ id }) => id === block?.id)
	if (kept === -1)
		return shiftedOffset(
			serializeBlocks(before),
			serializeBlocks(after),
			offset,
		)
	const within = Math.min(offset - starts[index], block.source.length)
	return (
		offsetsOf(after)[kept] +
		shiftedOffset(block.source, after.blocks[kept].source, within)
	)
}

const withEmptyBlockAt = (
	document: LibraryBlockDocument,
	at: number,
	ids: BlockIds,
): LibraryBlockDocument => {
	const markdown = serializeBlocks(document)
	const offsets = offsetsOf(document)
	const isLineStart = at === 0 || markdown[at - 1] === "\n"
	if (!isLineStart || at > markdown.length || offsets.includes(at))
		return document

	const { lead, blocks } = document
	const emptyBlock = (gap: string) => ({ id: ids.fresh(), source: "", gap })
	if (at <= lead.length)
		return {
			lead: lead.slice(0, at),
			blocks: [emptyBlock(lead.slice(at)), ...blocks],
		}
	const index = offsets.findLastIndex((start) => start < at)
	const block = blocks[index]
	const within = at - offsets[index] - markdownOf(block).length
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
	ids: BlockIds,
) => offsets.reduce((seeded, at) => withEmptyBlockAt(seeded, at, ids), document)

const keepIds = (
	previous: LibraryBlock[],
	next: LibraryBlockDocument,
): LibraryBlockDocument => {
	const unnamed = previous.filter((block) => !carriesId(block))
	const named = new Set(next.blocks.filter(carriesId).map(({ id }) => id))
	return {
		...next,
		blocks: next.blocks.map((block) => {
			if (carriesId(block)) return block
			const at = unnamed.findIndex(
				({ id, source }) => source === block.source && !named.has(id),
			)
			return at === -1 ? block : { ...block, id: unnamed.splice(at, 1)[0].id }
		}),
	}
}

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
	blockIdsOf,
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
	foundAnchorIn,
	galleryItemsOf,
	isTextBlockType,
	keepIds,
	type LibraryBlock,
	type LibraryBlockAnchor,
	type LibraryBlockDocument,
	type LibraryBlockPassage,
	type LibraryBlockType,
	MARKERS,
	marked,
	movedTo,
	offsetsOf,
	parseBlocks,
	passageOfShown,
	passageQuoteOf,
	relaid,
	rowAfter,
	type ShownSelection,
	type SourceEdit,
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
}
