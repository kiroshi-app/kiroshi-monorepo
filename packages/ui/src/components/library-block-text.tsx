"use client"

import {
	type CompositionEvent,
	type FocusEvent,
	Fragment,
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	useEffect,
	useEffectEvent,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react"

import {
	shiftedOffset,
	withoutIdMarkers,
} from "@workspace/ui/components/library-document-blocks"
import {
	type BlockText,
	type BlockTextLine,
	type BlockTextType,
	blockTextOf,
	editedBlockText,
	type InlineNode,
	type SourceRange,
	stepIn,
} from "@workspace/ui/components/library-document-inline"
import {
	DOCUMENT_TYPE,
	PLACEHOLDER_LOOK,
} from "@workspace/ui/components/library-document-view"
import { MARKDOWN_CLASS } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderer } from "@workspace/ui/components/markdown/run"
import {
	type MarkdownRun,
	runPiecesOf,
} from "@workspace/ui/components/markdown/runs"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

type FieldSelection = {
	anchor: number
	head: number
	start: number
	end: number
}

type HeldText = {
	source: string
	caret: number
}

type PlacedCaret = {
	at: number
	shown: number
}

type ClientPoint = {
	x: number
	y: number
}

const MARK_TAGS = {
	bold: "strong",
	italic: "em",
	strikethrough: "del",
	code: "code",
	link: "a",
} as const

const COMPOSED_INPUT = [
	"insertCompositionText",
	"deleteCompositionText",
	"insertFromComposition",
]

const SOURCES = new WeakMap<HTMLElement, string>()

const NO_RUNS: MarkdownRun[] = []

const isTextControl = (
	field: HTMLElement,
): field is HTMLInputElement | HTMLTextAreaElement =>
	field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement

const anchorsIn = (field: HTMLElement) => [
	...field.querySelectorAll<HTMLElement>("[data-from]"),
]

const fromOf = (anchor: HTMLElement) => Number(anchor.dataset.from)

const isAtomic = (anchor: HTMLElement) => anchor.dataset.to !== undefined

const lengthOf = (anchor: HTMLElement) => {
	if (isAtomic(anchor)) return Number(anchor.dataset.to) - fromOf(anchor)
	return anchor.firstChild instanceof Text ? anchor.firstChild.length : 0
}

const besideOf = (anchor: HTMLElement, isAfter: boolean) => {
	const parent = anchor.parentNode as Node
	const index = [...parent.childNodes].indexOf(anchor)
	return { node: parent, offset: index + (isAfter ? 1 : 0) }
}

const offsetAt = (field: HTMLElement, node: Node, offset: number) => {
	const holder = node.parentElement
	if (node instanceof Text && holder?.dataset.from !== undefined)
		return fromOf(holder) + offset
	const anchors = anchorsIn(field)
	const range = document.createRange()
	for (const anchor of anchors) {
		range.selectNodeContents(anchor)
		const side = range.comparePoint(node, offset)
		if (side < 0) return fromOf(anchor)
		if (side === 0)
			return (
				fromOf(anchor) + (node === anchor && offset > 0 ? lengthOf(anchor) : 0)
			)
	}
	const last = anchors.at(-1)
	return last ? fromOf(last) + lengthOf(last) : 0
}

const pointAt = (field: HTMLElement, offset: number) => {
	const anchors = anchorsIn(field)
	const anchor =
		anchors.find((each) => {
			const end = fromOf(each) + lengthOf(each)
			return isAtomic(each) ? end > offset : end >= offset
		}) ?? anchors.at(-1)
	if (!anchor) return { node: field as Node, offset: 0 }
	const within = Math.min(
		Math.max(offset - fromOf(anchor), 0),
		lengthOf(anchor),
	)
	if (isAtomic(anchor)) return besideOf(anchor, within > 0)
	return anchor.firstChild instanceof Text
		? { node: anchor.firstChild as Node, offset: within }
		: { node: anchor as Node, offset: 0 }
}

const fieldSelectionOf = (field: HTMLElement): FieldSelection | undefined => {
	if (isTextControl(field)) {
		const start = field.selectionStart ?? 0
		const end = field.selectionEnd ?? start
		const isBackward = field.selectionDirection === "backward"
		return {
			anchor: isBackward ? end : start,
			head: isBackward ? start : end,
			start,
			end,
		}
	}
	const selection = document.getSelection()
	const { anchorNode, focusNode } = selection ?? {}
	if (
		!selection ||
		!anchorNode ||
		!focusNode ||
		!field.contains(anchorNode) ||
		!field.contains(focusNode)
	)
		return undefined
	const anchor = offsetAt(field, anchorNode, selection.anchorOffset)
	const head = offsetAt(field, focusNode, selection.focusOffset)
	return {
		anchor,
		head,
		start: Math.min(anchor, head),
		end: Math.max(anchor, head),
	}
}

const fieldValueOf = (field: HTMLElement) =>
	isTextControl(field) ? field.value : (SOURCES.get(field) ?? "")

const selectInField = (field: HTMLElement, anchor?: number, head = anchor) => {
	const value = fieldValueOf(field)
	const from = anchor ?? value.length
	const to = head ?? from
	if (isTextControl(field)) {
		field.setSelectionRange(
			Math.min(from, to),
			Math.max(from, to),
			to < from ? "backward" : "forward",
		)
		return
	}
	const start = pointAt(field, from)
	const end = pointAt(field, to)
	document
		.getSelection()
		?.setBaseAndExtent(start.node, start.offset, end.node, end.offset)
}

const caretPointAt = ({ x, y }: ClientPoint) => {
	const position = document.caretPositionFromPoint?.(x, y)
	if (position) return { node: position.offsetNode, offset: position.offset }
	const range = document.caretRangeFromPoint?.(x, y)
	return range && { node: range.startContainer, offset: range.startOffset }
}

const offsetAtPoint = (field: HTMLElement, point: ClientPoint) => {
	const caret = isTextControl(field) ? undefined : caretPointAt(point)
	return caret && field.contains(caret.node)
		? offsetAt(field, caret.node, caret.offset)
		: undefined
}

const shownOffsetAt = (container: Element, point: ClientPoint) => {
	const caret = caretPointAt(point)
	if (!caret || !container.contains(caret.node)) return undefined
	const range = document.createRange()
	range.setStart(container, 0)
	range.setEnd(caret.node, caret.offset)
	const text = container.textContent ?? ""
	const leading = text.length - text.trimStart().length
	return Math.max(range.toString().length - leading, 0)
}

const offsetAtShown = (field: HTMLElement, shown: number) => {
	let passed = 0
	for (const anchor of anchorsIn(field)) {
		const size = isAtomic(anchor) ? 0 : lengthOf(anchor)
		if (shown <= passed + size) return fromOf(anchor) + shown - passed
		passed += size
	}
	return fieldValueOf(field).length
}

const typedOf = ({ inputType, data, dataTransfer }: InputEvent) => {
	if (inputType === "insertLineBreak" || inputType === "insertParagraph")
		return "\n"
	const inserted = data ?? dataTransfer?.getData("text/plain") ?? ""
	if (inputType === "insertFromPaste" || inputType === "insertFromDrop")
		return withoutIdMarkers(inserted)
	if (inputType.startsWith("insert")) return inserted
	if (inputType.startsWith("delete")) return ""
	return undefined
}

type Shown = {
	source: string
	text: BlockText
	hint?: string
	runs: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
	runEnds: Map<string, number>
}

const textSpansOf = (nodes: InlineNode[]): SourceRange[] =>
	nodes.flatMap((node) => {
		if (node.kind === "text") return [{ from: node.from, to: node.to }]
		if (node.kind === "escape") return [{ from: node.from + 1, to: node.to }]
		return "children" in node ? textSpansOf(node.children) : []
	})

const runEndsOf = (text: BlockText, runs: MarkdownRun[]) => {
	const spans = textSpansOf(text.lines.flatMap(({ nodes }) => nodes))
	return new Map(
		runs.map(({ id, start, end }) => [
			id,
			Math.max(
				...spans
					.filter(({ from, to }) => start < to && end > from)
					.map(({ to }) => Math.min(end, to)),
			),
		]),
	)
}

const textOf = (
	{ source, runs, renderRun, runEnds }: Shown,
	from: number,
	to: number,
) => {
	const spanOf = (start: number, end: number) => (
		<span data-from={start} key={start}>
			{source.slice(start, end)}
		</span>
	)
	if (!renderRun || runs.length === 0) return spanOf(from, to)
	return runPiecesOf(runs, from, to).map((piece) => {
		const start = from + piece.from
		const end = from + piece.to
		return piece.ids.reduceRight<ReactNode>(
			(children, id) => (
				<Fragment key={start}>
					{renderRun({ id, isEnd: runEnds.get(id) === end, children })}
				</Fragment>
			),
			spanOf(start, end),
		)
	})
}

const marksOf = (shown: Shown, nodes: InlineNode[]): ReactNode[] =>
	nodes.map((node) => {
		if (node.kind === "marker") return null
		if (node.kind === "text" || node.kind === "escape")
			return (
				<Fragment key={node.from}>
					{textOf(
						shown,
						node.kind === "escape" ? node.from + 1 : node.from,
						node.to,
					)}
				</Fragment>
			)
		if (node.kind === "image")
			return (
				<img
					alt={node.alt}
					data-from={node.from}
					data-typeset-image
					data-to={node.to}
					draggable={false}
					key={node.from}
					src={node.src}
				/>
			)
		const Tag = MARK_TAGS[node.kind]
		return <Tag key={node.from}>{marksOf(shown, node.children)}</Tag>
	})

const contentOf = (shown: Shown, line: BlockTextLine) => {
	const { text, hint } = shown
	if (line.nodes.length > 0) return marksOf(shown, line.nodes)
	const isLast = line === text.lines[text.lines.length - 1]
	return (
		<span data-from={line.contentFrom}>
			{isLast && hint ? (
				<span
					aria-hidden="true"
					className={PLACEHOLDER_LOOK}
					contentEditable={false}
					data-placeholder={hint}
					data-slot="library-document-placeholder"
				/>
			) : null}
			<br />
		</span>
	)
}

const listOf = (shown: Shown, lines: BlockTextLine[], depth: number) => {
	const List = /\d/.test(lines[0]?.marker ?? "") ? "ol" : "ul"
	const items: ReactNode[] = []
	for (let at = 0; at < lines.length; ) {
		const line = lines[at]
		let end = at + 1
		while (end < lines.length && lines[end].depth > depth) end++
		const nested = lines.slice(at + 1, end)
		items.push(
			<li
				className={cn(line.marker === "" && "list-none")}
				key={line.contentFrom}
				value={
					/\d/.test(line.marker)
						? Number.parseInt(line.marker.trim(), 10)
						: undefined
				}
			>
				{contentOf(shown, line)}
				{nested.length > 0 ? listOf(shown, nested, depth + 1) : null}
			</li>,
		)
		at = end
	}
	return <List>{items}</List>
}

const linesOf = (shown: Shown) =>
	shown.text.lines.map((line) => (
		<span className="block" key={line.contentFrom}>
			{contentOf(shown, line)}
		</span>
	))

const blockOf = (shown: Shown, generation: number) => {
	const { text } = shown
	if (text.look === "list")
		return <Fragment key={generation}>{listOf(shown, text.lines, 0)}</Fragment>
	const lines = linesOf(shown)
	if (text.look === "line")
		return (
			<span className="block" key={generation}>
				{lines}
			</span>
		)
	if (text.look === "heading") {
		const Heading = `h${text.level}` as "h1"
		return (
			<Heading key={generation} role="presentation">
				{lines}
			</Heading>
		)
	}
	if (text.look === "quote")
		return (
			<blockquote key={generation}>
				<p>{lines}</p>
			</blockquote>
		)
	return <p key={generation}>{lines}</p>
}

type LibraryBlockTextProps = {
	source: string
	type: BlockTextType
	onEdit: (source: string) => void
	"aria-label": string
	"data-slot": string
	hint?: string
	runs?: MarkdownRun[]
	renderRun?: MarkdownRunRenderer
	className?: string
	onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
	onBlur?: (event: FocusEvent<HTMLDivElement>) => void
	onFocus?: (event: FocusEvent<HTMLDivElement>) => void
	fieldRef?: Ref<HTMLDivElement | null>
}

const LibraryBlockText = ({
	source,
	type,
	onEdit,
	hint,
	runs = NO_RUNS,
	renderRun,
	className,
	onKeyDown,
	fieldRef,
	...props
}: LibraryBlockTextProps) => {
	const field = useRef<HTMLDivElement>(null)
	const pendingCaret = useRef<HeldText>(undefined)
	const placedCaret = useRef<PlacedCaret>(undefined)
	const shownSource = useRef(source)
	const composing = useRef<SourceRange>(undefined)
	const dragged = useRef<SourceRange>(undefined)
	const history = useRef<{ past: HeldText[]; future: HeldText[] }>({
		past: [],
		future: [],
	})
	const [generation, setGeneration] = useState(0)
	const text = blockTextOf(source, type)

	useImperativeHandle(fieldRef, () => field.current as HTMLDivElement)

	useLayoutEffect(() => {
		const root = field.current
		if (!root) return
		SOURCES.set(root, source)
		const pending = pendingCaret.current
		if (pending === undefined) {
			if (shownSource.current !== source) placedCaret.current = undefined
			shownSource.current = source
			return
		}
		shownSource.current = source
		const at = shiftedOffset(pending.source, source, pending.caret)
		selectInField(root, at)
		placedCaret.current = { at, shown: fieldSelectionOf(root)?.start ?? at }
		pendingCaret.current = undefined
	})

	const show = (next: HeldText) => {
		const root = field.current
		if (next.source === source) {
			if (root) selectInField(root, next.caret)
			return
		}
		pendingCaret.current = next
		onEdit(next.source)
	}

	const remember = (caret: number) => {
		history.current = {
			past: [...history.current.past, { source, caret }],
			future: [],
		}
	}

	const write = (range: SourceRange, typed: string) => {
		remember(range.from)
		show(editedBlockText(source, type, range, typed))
	}

	const move = (moved: SourceRange, drop: SourceRange, typed: string) => {
		if (drop.from > moved.from && drop.from < moved.to) return
		remember(drop.from)
		if (drop.from < moved.to) {
			const removed = editedBlockText(source, type, moved, "")
			show(editedBlockText(removed.source, type, drop, typed))
			return
		}
		const inserted = editedBlockText(source, type, drop, typed)
		const removed = editedBlockText(inserted.source, type, moved, "")
		show({
			source: removed.source,
			caret: inserted.caret - (inserted.source.length - removed.source.length),
		})
	}

	const travel = (direction: "past" | "future") => {
		const { past, future } = history.current
		const from = direction === "past" ? past : future
		const to = direction === "past" ? future : past
		const next = from.at(-1)
		if (!next) return
		const caret = (field.current && fieldSelectionOf(field.current)?.head) ?? 0
		const kept = { source, caret }
		history.current =
			direction === "past"
				? { past: from.slice(0, -1), future: [...to, kept] }
				: { past: [...to, kept], future: from.slice(0, -1) }
		show(next)
	}

	const typeIn = useEffectEvent((event: InputEvent) => {
		const root = field.current
		if (!root || event.isComposing || COMPOSED_INPUT.includes(event.inputType))
			return
		event.preventDefault()
		if (event.inputType === "historyUndo") return travel("past")
		if (event.inputType === "historyRedo") return travel("future")
		const typed = typedOf(event)
		const selected = fieldSelectionOf(root)
		if (typed === undefined || !selected) return
		const [target] = event.getTargetRanges()
		const read =
			target && root.contains(target.startContainer)
				? {
						from: offsetAt(root, target.startContainer, target.startOffset),
						to: offsetAt(root, target.endContainer, target.endOffset),
					}
				: { from: selected.start, to: selected.end }
		const placed = placedCaret.current
		const range =
			placed && read.from === read.to && read.from === placed.shown
				? { from: placed.at, to: placed.at }
				: read
		if (event.inputType === "deleteByDrag") {
			dragged.current = range
			setTimeout(() => {
				if (dragged.current !== range) return
				dragged.current = undefined
				write(range, "")
			})
			return
		}
		const moved = dragged.current
		dragged.current = undefined
		if (moved && event.inputType === "insertFromDrop")
			return move(moved, range, typed)
		if (range.from === range.to && typed === "") {
			const step = stepIn(
				source,
				type,
				range.from,
				event.inputType.includes("Backward") ? -1 : 1,
			)
			if (step) write(step, typed)
			return
		}
		write(range, typed)
	})

	useEffect(() => {
		const root = field.current
		const listener = (event: Event) => typeIn(event as InputEvent)
		root?.addEventListener("beforeinput", listener)
		return () => root?.removeEventListener("beforeinput", listener)
	}, [])

	const keyIn = (event: KeyboardEvent<HTMLDivElement>) => {
		const isCommand = isMacPlatform() ? event.metaKey : event.ctrlKey
		const key = event.key.toLowerCase()
		if (isCommand && !event.altKey && (key === "z" || key === "y")) {
			event.preventDefault()
			travel(key === "z" && !event.shiftKey ? "past" : "future")
			return
		}
		onKeyDown?.(event)
	}

	const startComposing = () => {
		const selected = field.current && fieldSelectionOf(field.current)
		composing.current = selected
			? { from: selected.start, to: selected.end }
			: undefined
	}

	const endComposing = (event: CompositionEvent<HTMLDivElement>) => {
		const range = composing.current
		composing.current = undefined
		setGeneration((count) => count + 1)
		if (range) write(range, event.data)
	}

	return (
		<div
			{...props}
			aria-multiline={text.look !== "heading" && text.look !== "line"}
			className={cn(
				text.look !== "line" && [MARKDOWN_CLASS, DOCUMENT_TYPE],
				"break-words outline-none",
				text.look === "line" && "whitespace-pre-wrap",
				className,
			)}
			contentEditable
			onCompositionEnd={endComposing}
			onCompositionStart={startComposing}
			onKeyDown={keyIn}
			ref={field}
			role="textbox"
			suppressContentEditableWarning
		>
			{blockOf(
				{ source, text, hint, runs, renderRun, runEnds: runEndsOf(text, runs) },
				generation,
			)}
		</div>
	)
}

export {
	type ClientPoint,
	fieldSelectionOf,
	fieldValueOf,
	LibraryBlockText,
	offsetAtPoint,
	offsetAtShown,
	selectInField,
	shownOffsetAt,
}
