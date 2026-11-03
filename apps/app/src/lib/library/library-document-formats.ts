import type { LibraryDocumentRange } from "@workspace/ui/components/library-document-editor"
import { inlineNodesOf } from "@workspace/ui/components/library-document-inline"

type InlineNode = ReturnType<typeof inlineNodesOf>[number]

type InlineFormat = Exclude<InlineNode["kind"], "text" | "marker">

type PairedFormat = Exclude<InlineFormat, "link">

type LineKind = "heading" | "item"

type Run = {
	kind: InlineFormat
	from: number
	contentFrom: number
	contentTo: number
	to: number
}

type Line = {
	from: number
	to: number
	text: string
}

type Span = {
	from: number
	to: number
}

type TextEdit = (text: string, start: number, end: number) => string

type Edit = (markdown: string) => unknown

const HEADING_LINE = /^(#{1,6} +)(.*)$/

const ITEM_LINE = /^([-*+] +)(.*)$/

const LINE_PATTERN: Record<LineKind, RegExp> = {
	heading: HEADING_LINE,
	item: ITEM_LINE,
}

const LINE_PREFIX: Record<LineKind, string> = {
	heading: "## ",
	item: "- ",
}

const MARKER: Record<PairedFormat, string> = {
	bold: "**",
	italic: "*",
	strikethrough: "~~",
	code: "`",
}

const ITALIC_BESIDE_ASTERISK = "_"

const runsIn = (nodes: InlineNode[]): Run[] =>
	nodes.flatMap((node) => {
		if (node.kind === "text" || node.kind === "marker") return []
		const opening = node.children[0]
		const closing = node.children.at(-1)
		if (opening?.kind !== "marker" || closing?.kind !== "marker") return []
		const run = {
			kind: node.kind,
			from: node.from,
			contentFrom: opening.to,
			contentTo: closing.from,
			to: closing.to,
		}
		return [run, ...runsIn(node.children)]
	})

const runsOf = (text: string) => runsIn(inlineNodesOf(text))

const isCarrying = (run: Run, kind: InlineFormat, start: number, end: number) =>
	run.kind === kind && run.from <= start && end <= run.to

const isAtomic = (run: Run) => run.kind === "link" || run.kind === "code"

const isInside = (run: Run, edge: number) => run.from < edge && edge < run.to

const isWithinContent = (run: Run, { from, to }: Span) =>
	run.contentFrom <= from && to <= run.contentTo

const isSplitBy = (run: Run, span: Span) =>
	(isInside(run, span.from) || isInside(run, span.to)) &&
	(isAtomic(run) || !isWithinContent(run, span))

const widened = (runs: Run[], span: Span): Span => {
	const split = runs.find((run) => isSplitBy(run, span))
	if (!split) return span
	return widened(runs, {
		from: Math.min(span.from, split.from),
		to: Math.max(span.to, split.to),
	})
}

const isBlank = (character: string | undefined) =>
	character !== undefined && /\s/.test(character)

const trimmed = (text: string, start: number, end: number): Span => {
	let from = start
	let to = end
	while (from < to && isBlank(text[from])) from++
	while (to > from && isBlank(text[to - 1])) to--
	return { from, to }
}

const unwrapped = (text: string, run: Run) =>
	`${text.slice(0, run.from)}${text.slice(run.contentFrom, run.contentTo)}${text.slice(run.to)}`

const wrapped = (
	text: string,
	{ from, to }: Span,
	opening: string,
	closing: string,
) =>
	`${text.slice(0, from)}${opening}${text.slice(from, to)}${closing}${text.slice(to)}`

const touchesAsterisk = (text: string, { from, to }: Span) =>
	[text[from - 1], text[from], text[to - 1], text[to]].includes("*")

const markerFor = (format: PairedFormat, text: string, span: Span) =>
	format === "italic" && touchesAsterisk(text, span)
		? ITALIC_BESIDE_ASTERISK
		: MARKER[format]

const spanToWrap = (text: string, runs: Run[], start: number, end: number) =>
	widened(runs, trimmed(text, start, end))

const toggledFormat =
	(format: PairedFormat): TextEdit =>
	(text, start, end) => {
		const runs = runsOf(text)
		const carrying = runs.find((run) => isCarrying(run, format, start, end))
		if (carrying) return unwrapped(text, carrying)
		const span = spanToWrap(text, runs, start, end)
		if (span.from >= span.to) return text
		const marker = markerFor(format, text, span)
		return wrapped(text, span, marker, marker)
	}

const linkTargetOf = (url: string) =>
	url.trim().replace(/[\s()]/g, encodeURIComponent)

const linked =
	(url: string): TextEdit =>
	(text, start, end) => {
		const target = linkTargetOf(url)
		const runs = runsOf(text)
		const link = runs.find((run) => isCarrying(run, "link", start, end))
		if (link && target === "") return unwrapped(text, link)
		if (link)
			return `${text.slice(0, link.contentTo)}](${target})${text.slice(link.to)}`
		if (target === "") return text
		const span = spanToWrap(text, runs, start, end)
		if (span.from >= span.to) return text
		return wrapped(text, span, "[", `](${target})`)
	}

const linesOf = (body: string): Line[] => {
	let from = 0
	return body.split("\n").map((text) => {
		const line = { from, to: from + text.length, text }
		from = line.to + 1
		return line
	})
}

const markedLineOf = (text: string) =>
	HEADING_LINE.exec(text) ?? ITEM_LINE.exec(text)

const isParagraphLine = (line: Line | undefined) =>
	line !== undefined && line.text !== "" && !markedLineOf(line.text)

const blockAt = (body: string, offset: number): Span => {
	const lines = linesOf(body)
	const index = Math.max(
		lines.findIndex((line) => offset <= line.to),
		0,
	)
	const line = lines[index] ?? { from: 0, to: 0, text: "" }
	const prefix = markedLineOf(line.text)?.[1]
	if (prefix !== undefined)
		return { from: line.from + prefix.length, to: line.to }
	let first = index
	let last = index
	while (isParagraphLine(lines[first - 1])) first--
	while (isParagraphLine(lines[last + 1])) last++
	return { from: lines[first]?.from ?? 0, to: lines[last]?.to ?? body.length }
}

const editedInBlock = (
	body: string,
	{ start, end }: LibraryDocumentRange,
	edit: TextEdit,
) => {
	const block = blockAt(body, start)
	const text = body.slice(block.from, block.to)
	const edited = edit(
		text,
		start - block.from,
		Math.min(end, block.to) - block.from,
	)
	return `${body.slice(0, block.from)}${edited}${body.slice(block.to)}`
}

const lineTextOf = (text: string) => markedLineOf(text)?.[2] ?? text

const isTouchedBy = (line: Line, { start, end }: LibraryDocumentRange) =>
	line.text !== "" && line.from <= end && start <= line.to

const toggledLines = (
	body: string,
	range: LibraryDocumentRange,
	kind: LineKind,
) => {
	const lines = linesOf(body)
	const touched = lines.filter((line) => isTouchedBy(line, range))
	const isEveryLineOfKind = touched.every((line) =>
		LINE_PATTERN[kind].test(line.text),
	)
	const prefix = isEveryLineOfKind ? "" : LINE_PREFIX[kind]
	return lines
		.map((line) =>
			touched.includes(line) ? `${prefix}${lineTextOf(line.text)}` : line.text,
		)
		.join("\n")
}

export const formatActionsOf = (markdown: string, edit: Edit) => {
	const inline = (format: PairedFormat) => (range: LibraryDocumentRange) =>
		edit(editedInBlock(markdown, range, toggledFormat(format)))
	const lineKind = (kind: LineKind) => (range: LibraryDocumentRange) =>
		edit(toggledLines(markdown, range, kind))
	return {
		onBold: inline("bold"),
		onItalic: inline("italic"),
		onStrikethrough: inline("strikethrough"),
		onCode: inline("code"),
		onLink: (url: string, range: LibraryDocumentRange) =>
			edit(editedInBlock(markdown, range, linked(url))),
		onHeading: lineKind("heading"),
		onList: lineKind("item"),
	}
}
