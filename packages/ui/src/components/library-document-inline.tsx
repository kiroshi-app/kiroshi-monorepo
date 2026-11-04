import { continuedMarkerOf } from "@workspace/ui/components/library-document-blocks"

type InlineFormat = "bold" | "italic" | "strikethrough" | "code" | "link"

type InlineSpan = {
	kind: "text"
	from: number
	to: number
}

type InlineMarker = {
	kind: "marker"
	from: number
	to: number
}

type InlineElement = {
	kind: InlineFormat
	from: number
	children: InlineNode[]
}

type InlineNode = InlineSpan | InlineMarker | InlineElement

const INLINE_LOOK: Record<InlineFormat, string> = {
	bold: "font-semibold text-foreground",
	italic: "italic",
	strikethrough: "text-muted-foreground line-through",
	code: "rounded-[min(calc(var(--radius)*0.6),0.35em)] bg-code-surface px-[0.3em] py-[0.125em] font-mono text-[0.85em] leading-none ring-1 ring-foreground/15",
	link: "font-medium underline decoration-current/30",
}

const PAIRED_MARKERS: [marker: string, format: InlineFormat][] = [
	["**", "bold"],
	["~~", "strikethrough"],
	["*", "italic"],
	["_", "italic"],
]

const isBlank = (character: string | undefined) =>
	character === undefined || /\s/.test(character)

const isWordy = (character: string | undefined) =>
	character !== undefined && /[\p{L}\p{N}]/u.test(character)

const isLoneMarker = (text: string, marker: string, at: number) =>
	marker.length > 1 ||
	(text[at - 1] !== marker && text[at + marker.length] !== marker)

const canOpen = (text: string, marker: string, at: number) =>
	isLoneMarker(text, marker, at) &&
	!isBlank(text[at + marker.length]) &&
	(marker !== "_" || !isWordy(text[at - 1]))

const canClose = (text: string, marker: string, at: number) =>
	isLoneMarker(text, marker, at) &&
	!isBlank(text[at - 1]) &&
	(marker !== "_" || !isWordy(text[at + marker.length]))

const closingOf = (text: string, marker: string, from: number, to: number) => {
	for (let at = from + 1; at + marker.length <= to; at++)
		if (text.startsWith(marker, at) && canClose(text, marker, at)) return at
	return -1
}

type Found = { element: InlineElement; end: number }

type Bounds = [
	from: number,
	contentFrom: number,
	contentTo: number,
	end: number,
]

const elementOf = (
	kind: InlineFormat,
	[from, contentFrom, contentTo, end]: Bounds,
	content: InlineNode[],
): Found => ({
	element: {
		kind,
		from,
		children: [
			{ kind: "marker", from, to: contentFrom },
			...content,
			{ kind: "marker", from: contentTo, to: end },
		],
	},
	end,
})

const codeAt = (text: string, at: number, to: number) => {
	if (text[at] !== "`") return undefined
	const close = text.indexOf("`", at + 1)
	if (close <= at + 1 || close >= to) return undefined
	const content: InlineNode[] = [{ kind: "text", from: at + 1, to: close }]
	return elementOf("code", [at, at + 1, close, close + 1], content)
}

const linkAt = (text: string, at: number, to: number) => {
	if (text[at] !== "[") return undefined
	const textEnd = text.indexOf("]", at + 1)
	if (textEnd <= at + 1 || text[textEnd + 1] !== "(") return undefined
	const urlEnd = text.indexOf(")", textEnd + 2)
	if (urlEnd <= textEnd + 2 || urlEnd >= to) return undefined
	if (/\s/.test(text.slice(textEnd + 2, urlEnd))) return undefined
	const content = nodesIn(text, at + 1, textEnd)
	return elementOf("link", [at, at + 1, textEnd, urlEnd + 1], content)
}

const pairAt = (text: string, at: number, to: number) => {
	for (const [marker, format] of PAIRED_MARKERS) {
		if (!text.startsWith(marker, at) || !canOpen(text, marker, at)) continue
		const contentFrom = at + marker.length
		const close = closingOf(text, marker, contentFrom, to)
		if (close === -1) continue
		const content = nodesIn(text, contentFrom, close)
		return elementOf(
			format,
			[at, contentFrom, close, close + marker.length],
			content,
		)
	}
	return undefined
}

const nodesIn = (text: string, from: number, to: number): InlineNode[] => {
	const nodes: InlineNode[] = []
	let plainFrom = from
	let at = from
	while (at < to) {
		const found =
			codeAt(text, at, to) ?? linkAt(text, at, to) ?? pairAt(text, at, to)
		if (!found) {
			at++
			continue
		}
		if (plainFrom < at) nodes.push({ kind: "text", from: plainFrom, to: at })
		nodes.push(found.element)
		at = found.end
		plainFrom = at
	}
	if (plainFrom < to) nodes.push({ kind: "text", from: plainFrom, to })
	return nodes
}

const inlineNodesOf = (text: string) => nodesIn(text, 0, text.length)

type BlockTextType = "paragraph" | "heading" | "list" | "quote" | "line"

type BlockTextLine = {
	contentFrom: number
	contentTo: number
	marker: string
	nodes: InlineNode[]
}

type BlockText = {
	look: BlockTextType
	level: number
	lines: BlockTextLine[]
}

type SourceRange = { from: number; to: number }

type BlockTextEdit = { source: string; caret: number }

type BlockTextSplit = { before: string; after: string; opened: number }

const HEADING_PREFIX = /^#{1,6}[ \t]+/
const SETEXT_LINE = /^[ \t]*(=+|-+)[ \t]*$/
const LIST_PREFIX = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+/
const QUOTE_PREFIX = /^[ \t]*>[ \t]?/
const LINE_BREAK = /\r?\n/g

const sourceLinesOf = (source: string) => {
	let from = 0
	return source.split("\n").map((text) => {
		const line = { from, text }
		from += text.length + 1
		return line
	})
}

const lineOf = (
	source: string,
	{ from, text }: { from: number; text: string },
	marker = "",
): BlockTextLine => ({
	contentFrom: from + marker.length,
	contentTo: from + text.length,
	marker,
	nodes: nodesIn(source, from + marker.length, from + text.length),
})

const prefixedText = (
	source: string,
	look: BlockTextType,
	prefix: RegExp,
): BlockText => ({
	look,
	level: 0,
	lines: sourceLinesOf(source).map((line) =>
		lineOf(source, line, prefix.exec(line.text)?.[0]),
	),
})

const headingTextOf = (source: string): BlockText | undefined => {
	const lines = sourceLinesOf(source)
	const prefix = HEADING_PREFIX.exec(lines[0].text)?.[0]
	if (prefix)
		return {
			look: "heading",
			level: prefix.trim().length,
			lines: lines.map((line, index) =>
				lineOf(source, line, index === 0 ? prefix : ""),
			),
		}
	const underline = SETEXT_LINE.exec(lines.at(-1)?.text ?? "")
	if (lines.length < 2 || !underline) return undefined
	return {
		look: "heading",
		level: underline[1].startsWith("=") ? 1 : 2,
		lines: lines.slice(0, -1).map((line) => lineOf(source, line)),
	}
}

const plainTextOf = (source: string, look: BlockTextType): BlockText => ({
	look,
	level: 0,
	lines: sourceLinesOf(source).map((line) => lineOf(source, line)),
})

const blockTextOf = (source: string, type: BlockTextType): BlockText => {
	const firstLine = source.split("\n")[0]
	if (type === "heading")
		return headingTextOf(source) ?? plainTextOf(source, "paragraph")
	if (type === "list" && LIST_PREFIX.test(firstLine))
		return prefixedText(source, "list", LIST_PREFIX)
	if (type === "quote" && source.trim() !== ">" && QUOTE_PREFIX.test(firstLine))
		return prefixedText(source, "quote", QUOTE_PREFIX)
	return plainTextOf(source, type === "line" ? "line" : "paragraph")
}

const isElement = (node: InlineNode): node is InlineElement =>
	node.kind !== "text" && node.kind !== "marker"

const edgesOf = (element: InlineElement) =>
	[element.children[0], element.children[element.children.length - 1]] as [
		opening: InlineMarker,
		closing: InlineMarker,
	]

const endOf = (element: InlineElement) => edgesOf(element)[1].to

const elementsIn = (nodes: InlineNode[]): InlineElement[] =>
	nodes
		.filter(isElement)
		.flatMap((element) => [element, ...elementsIn(element.children)])

const textRangesIn = (nodes: InlineNode[]): SourceRange[] =>
	nodes.flatMap((node) => {
		if (node.kind === "text") return [node]
		if (node.kind === "marker") return []
		return textRangesIn(node.children)
	})

const charactersIn = (source: string, { from, to }: SourceRange) => {
	const characters: SourceRange[] = []
	for (let at = from; at < to; ) {
		const size = (source.codePointAt(at) ?? 0) > 0xffff ? 2 : 1
		characters.push({ from: at, to: Math.min(at + size, to) })
		at += size
	}
	return characters
}

const unitsOf = (source: string, { lines }: BlockText) =>
	lines.flatMap((line, index) => [
		...(index > 0
			? [{ from: lines[index - 1].contentTo, to: line.contentFrom }]
			: []),
		...textRangesIn(line.nodes).flatMap((range) => charactersIn(source, range)),
	])

const lineAt = ({ lines }: BlockText, at: number) =>
	lines.find((line) => at <= line.contentTo) ?? lines[lines.length - 1]

const typedFor = (
	source: string,
	text: BlockText,
	at: number,
	typed: string,
) => {
	if (text.look === "heading" || text.look === "line")
		return typed.replace(LINE_BREAK, " ")
	const line = lineAt(text, at)
	const lineStart = line.contentFrom - line.marker.length
	const marker =
		text.look === "paragraph"
			? ""
			: (continuedMarkerOf(source.slice(lineStart, line.contentTo)) ?? "")
	return typed.replace(LINE_BREAK, `\n${marker}`)
}

const isCovered = (unit: SourceRange, { from, to }: SourceRange) =>
	unit.from < to && unit.to > from

const editedBlockText = (
	source: string,
	type: BlockTextType,
	{ from, to }: SourceRange,
	typed: string,
): BlockTextEdit => {
	const text = blockTextOf(source, type)
	const removed = new Set<number>()
	const remove = (range: SourceRange) => {
		for (let at = range.from; at < range.to; at++) removed.add(at)
	}
	for (const unit of unitsOf(source, text))
		if (isCovered(unit, { from, to })) remove(unit)
	for (const element of text.lines.flatMap((line) => elementsIn(line.nodes))) {
		const shown = textRangesIn(element.children)
		const [opening, closing] = edgesOf(element)
		const isEmptied = shown.every(
			(range) => range.from >= from && range.to <= to,
		)
		const takesTyping =
			typed !== "" && from >= opening.to && from <= closing.from
		if (shown.length > 0 && isEmptied && !takesTyping)
			for (const marker of element.children.filter(
				(child) => child.kind === "marker",
			))
				remove(marker)
	}
	let kept = ""
	let insertAt = 0
	for (let at = 0; at < source.length; at++) {
		if (at === from) insertAt = kept.length
		if (!removed.has(at)) kept += source[at]
	}
	if (from >= source.length) insertAt = kept.length
	const inserted = typedFor(source, text, from, typed)
	return {
		source: `${kept.slice(0, insertAt)}${inserted}${kept.slice(insertAt)}`,
		caret: insertAt + inserted.length,
	}
}

const stepIn = (
	source: string,
	type: BlockTextType,
	at: number,
	direction: -1 | 1,
): SourceRange | undefined => {
	const units = unitsOf(source, blockTextOf(source, type))
	return direction < 0
		? units.findLast((unit) => unit.to <= at)
		: units.find((unit) => unit.from >= at)
}

const splitBlockText = (
	source: string,
	type: BlockTextType,
	at: number,
): BlockTextSplit => {
	let cut = at
	let opened = ""
	let closed = ""
	let nodes = lineAt(blockTextOf(source, type), at).nodes
	for (;;) {
		const element = nodes
			.filter(isElement)
			.find((each) => each.from < at && at < endOf(each))
		if (!element) break
		const [opening, closing] = edgesOf(element)
		if (at <= opening.to) {
			cut = element.from
			break
		}
		if (at >= closing.from) {
			cut = closing.to
			break
		}
		opened += source.slice(opening.from, opening.to)
		closed = `${source.slice(closing.from, closing.to)}${closed}`
		nodes = element.children
	}
	return {
		before: `${source.slice(0, cut)}${closed}`,
		after: `${opened}${source.slice(cut)}`,
		opened: opened.length,
	}
}

export {
	type BlockText,
	type BlockTextType,
	blockTextOf,
	editedBlockText,
	INLINE_LOOK,
	type InlineNode,
	inlineNodesOf,
	type SourceRange,
	splitBlockText,
	stepIn,
}
