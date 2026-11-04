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

export { INLINE_LOOK, inlineNodesOf }
