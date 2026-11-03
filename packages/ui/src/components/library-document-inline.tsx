import type { ReactNode } from "react"

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

type InlineLook = {
	tag: "strong" | "em" | "del" | "code" | "span"
	className: string
}

const INLINE_LOOK: Record<InlineFormat, InlineLook> = {
	bold: { tag: "strong", className: "font-semibold text-foreground" },
	italic: { tag: "em", className: "italic" },
	strikethrough: {
		tag: "del",
		className: "text-muted-foreground line-through",
	},
	code: {
		tag: "code",
		className:
			"rounded-[min(calc(var(--radius)*0.6),0.35em)] bg-code-surface px-[0.3em] py-[0.125em] font-mono text-[0.85em] leading-none ring-1 ring-foreground/15",
	},
	link: {
		tag: "span",
		className: "font-medium underline decoration-current/30",
	},
}

const MARKER_SLOT = "library-document-marker"

const MARKER_CLASS = "hidden"

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

const hasInlineFormat = (text: string) =>
	inlineNodesOf(text).some((node) => node.kind !== "text")

const shownSpansOf = (nodes: InlineNode[]): InlineSpan[] =>
	nodes.flatMap((node) => {
		if (node.kind === "text") return [node]
		if (node.kind === "marker") return []
		return shownSpansOf(node.children)
	})

const shownBoundsOf = (text: string) => {
	const spans = shownSpansOf(inlineNodesOf(text))
	return {
		start: spans[0]?.from ?? 0,
		end: spans.at(-1)?.to ?? text.length,
	}
}

type ShownOffset = { spanFrom: number; at: number }

const shownOffsetOf = (spans: InlineSpan[], offset: number) => {
	let nearest: ShownOffset | undefined
	let nearestDistance = Number.POSITIVE_INFINITY
	for (const { from, to } of spans) {
		const at = Math.min(Math.max(offset, from), to)
		const distance = Math.abs(at - offset)
		if (distance >= nearestDistance) continue
		nearest = { spanFrom: from, at }
		nearestDistance = distance
	}
	return nearest
}

type DrawText = (from: number, to: number) => ReactNode

const inlineDrawingOf = (
	text: string,
	nodes: InlineNode[],
	drawText: DrawText,
): ReactNode[] =>
	nodes.map((node) => {
		const key = `${node.kind}-${node.from}`
		if (node.kind === "text") return drawText(node.from, node.to)
		if (node.kind === "marker")
			return (
				<span
					aria-hidden="true"
					className={MARKER_CLASS}
					data-slot={MARKER_SLOT}
					key={key}
				>
					{text.slice(node.from, node.to)}
				</span>
			)

		const { tag: Tag, className } = INLINE_LOOK[node.kind]
		return (
			<Tag
				className={className}
				data-slot={`library-document-${node.kind}`}
				key={key}
			>
				{inlineDrawingOf(text, node.children, drawText)}
			</Tag>
		)
	})

const inlineDomOf = (text: string, nodes: InlineNode[]): Node[] =>
	nodes.map((node) => {
		if (node.kind === "text")
			return document.createTextNode(text.slice(node.from, node.to))
		if (node.kind === "marker") {
			const marker = document.createElement("span")
			marker.className = MARKER_CLASS
			marker.dataset.slot = MARKER_SLOT
			marker.append(text.slice(node.from, node.to))
			return marker
		}

		const { tag, className } = INLINE_LOOK[node.kind]
		const element = document.createElement(tag)
		element.className = className
		element.dataset.slot = `library-document-${node.kind}`
		element.append(...inlineDomOf(text, node.children))
		return element
	})

const showInlineIn = (field: HTMLElement, text: string) => {
	const shown = inlineDomOf(text, inlineNodesOf(text))
	if (text === "" || text.endsWith("\n"))
		shown.push(document.createElement("br"))
	const current = [...field.childNodes]
	const isShown =
		current.length === shown.length &&
		current.every((node, index) => node.isEqualNode(shown[index] ?? null))
	if (!isShown) field.replaceChildren(...shown)
}

const isInMarker = (node: Node) =>
	node.parentElement?.closest(`[data-slot="${MARKER_SLOT}"]`) != null

const isCaretOnShownText = (field: HTMLElement) => {
	const selection = document.getSelection()
	const caret = selection?.focusNode
	if (!selection?.isCollapsed) return true
	return caret instanceof Text && field.contains(caret) && !isInMarker(caret)
}

type TextField = HTMLElement &
	Pick<
		HTMLTextAreaElement,
		| "value"
		| "selectionStart"
		| "selectionEnd"
		| "selectionDirection"
		| "setSelectionRange"
	>

type FieldSelection = {
	start: number
	end: number
	direction: TextField["selectionDirection"]
}

const offsetIn = (field: Node, node: Node, offset: number) => {
	const range = document.createRange()
	range.selectNodeContents(field)
	range.setEnd(node, offset)
	return range.toString().length
}

type Point = [node: Node, offset: number]

const pointAt = (field: HTMLElement, offset: number): Point => {
	const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
	let hidden: Point | undefined
	let read = 0
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const length = node.textContent?.length ?? 0
		if (offset >= read && offset <= read + length) {
			const point: Point = [node, offset - read]
			if (!isInMarker(node)) return point
			hidden ??= point
		}
		read += length
	}
	return hidden ?? [field, 0]
}

const textFieldOf = (element: HTMLElement): TextField => {
	if ("setSelectionRange" in element) return element as TextField

	let held: FieldSelection = { start: 0, end: 0, direction: "none" }
	const selection = () => {
		const live = document.getSelection()
		const anchor = live?.anchorNode
		const focus = live?.focusNode
		if (
			!(anchor && focus && element.contains(anchor) && element.contains(focus))
		)
			return held

		const anchorAt = offsetIn(element, anchor, live.anchorOffset)
		const focusAt = offsetIn(element, focus, live.focusOffset)
		held = {
			start: Math.min(anchorAt, focusAt),
			end: Math.max(anchorAt, focusAt),
			direction: focusAt < anchorAt ? "backward" : "forward",
		}
		return held
	}
	const select = (
		start: number | null,
		end: number | null,
		direction: FieldSelection["direction"] = "forward",
	) => {
		const from = start ?? 0
		const to = Math.max(from, end ?? from)
		const [startNode, startOffset] = pointAt(element, from)
		const [endNode, endOffset] = pointAt(element, to)
		if (direction === "backward")
			document
				.getSelection()
				?.setBaseAndExtent(endNode, endOffset, startNode, startOffset)
		else
			document
				.getSelection()
				?.setBaseAndExtent(startNode, startOffset, endNode, endOffset)
		held = { start: from, end: to, direction }
	}

	return Object.defineProperties(element, {
		value: { get: () => element.textContent ?? "" },
		selectionStart: { get: () => selection().start },
		selectionEnd: { get: () => selection().end },
		selectionDirection: { get: () => selection().direction },
		setSelectionRange: { value: select },
	}) as TextField
}

export {
	hasInlineFormat,
	inlineDrawingOf,
	inlineNodesOf,
	isCaretOnShownText,
	showInlineIn,
	shownBoundsOf,
	shownOffsetOf,
	shownSpansOf,
	type TextField,
	textFieldOf,
}
