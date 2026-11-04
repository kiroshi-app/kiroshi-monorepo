"use client"

import {
	type CompositionEvent,
	type FocusEvent,
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
	type BlockText,
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

const isTextControl = (
	field: HTMLElement,
): field is HTMLInputElement | HTMLTextAreaElement =>
	field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement

const anchorsIn = (field: HTMLElement) => [
	...field.querySelectorAll<HTMLElement>("[data-from]"),
]

const fromOf = (anchor: HTMLElement) => Number(anchor.dataset.from)

const lengthOf = (anchor: HTMLElement) =>
	anchor.firstChild instanceof Text ? anchor.firstChild.length : 0

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
		anchors.find((each) => fromOf(each) + lengthOf(each) >= offset) ??
		anchors.at(-1)
	if (!anchor) return { node: field as Node, offset: 0 }
	const within = Math.min(
		Math.max(offset - fromOf(anchor), 0),
		lengthOf(anchor),
	)
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

const typedOf = ({ inputType, data, dataTransfer }: InputEvent) => {
	if (inputType === "insertLineBreak" || inputType === "insertParagraph")
		return "\n"
	if (inputType.startsWith("insert"))
		return data ?? dataTransfer?.getData("text/plain") ?? ""
	if (inputType.startsWith("delete") && inputType !== "deleteByDrag") return ""
	return undefined
}

const marksOf = (source: string, nodes: InlineNode[]): ReactNode[] =>
	nodes.map((node) => {
		if (node.kind === "marker") return null
		if (node.kind === "text")
			return (
				<span data-from={node.from} key={node.from}>
					{source.slice(node.from, node.to)}
				</span>
			)
		const Tag = MARK_TAGS[node.kind]
		return <Tag key={node.from}>{marksOf(source, node.children)}</Tag>
	})

type LinesProps = {
	source: string
	text: BlockText
	hint?: string
}

const linesOf = ({ source, text, hint }: LinesProps) =>
	text.lines.map((line, index) => {
		const isEmpty = line.nodes.length === 0
		const isLast = index === text.lines.length - 1
		const Line = text.look === "list" ? "li" : "span"
		return (
			<Line
				className={cn(
					Line === "span" && "block",
					Line === "li" && line.marker === "" && "list-none",
				)}
				data-from={isEmpty ? line.contentFrom : undefined}
				key={line.contentFrom}
				value={
					Line === "li" && /\d/.test(line.marker)
						? Number.parseInt(line.marker.trim(), 10)
						: undefined
				}
			>
				{marksOf(source, line.nodes)}
				{isEmpty && isLast && hint ? (
					<span
						aria-hidden="true"
						className={PLACEHOLDER_LOOK}
						contentEditable={false}
						data-placeholder={hint}
						data-slot="library-document-placeholder"
					/>
				) : null}
				{isEmpty ? <br /> : null}
			</Line>
		)
	})

const blockOf = (lines: ReactNode, text: BlockText, generation: number) => {
	if (text.look === "line")
		return (
			<span className="block" key={generation}>
				{lines}
			</span>
		)
	if (text.look === "heading") {
		const Heading = `h${text.level}` as "h1"
		return <Heading key={generation}>{lines}</Heading>
	}
	if (text.look === "list") {
		const isOrdered = /\d/.test(text.lines[0]?.marker ?? "")
		const List = isOrdered ? "ol" : "ul"
		return <List key={generation}>{lines}</List>
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
	className,
	onKeyDown,
	fieldRef,
	...props
}: LibraryBlockTextProps) => {
	const field = useRef<HTMLDivElement>(null)
	const pendingCaret = useRef<number>(undefined)
	const placedCaret = useRef<PlacedCaret>(undefined)
	const shownSource = useRef(source)
	const composing = useRef<SourceRange>(undefined)
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
		const at = pendingCaret.current
		if (at === undefined) {
			if (shownSource.current !== source) placedCaret.current = undefined
			shownSource.current = source
			return
		}
		shownSource.current = source
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
		pendingCaret.current = next.caret
		onEdit(next.source)
	}

	const write = (range: SourceRange, typed: string) => {
		const caret = range.from
		history.current = {
			past: [...history.current.past, { source, caret }],
			future: [],
		}
		show(editedBlockText(source, type, range, typed))
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

	const lines = linesOf({ source, text, hint })

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
			{blockOf(lines, text, generation)}
		</div>
	)
}

export {
	type ClientPoint,
	fieldSelectionOf,
	fieldValueOf,
	LibraryBlockText,
	offsetAtPoint,
	selectInField,
}
