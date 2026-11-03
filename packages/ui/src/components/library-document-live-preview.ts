import { syntaxTree } from "@codemirror/language"
import type { EditorState, Range } from "@codemirror/state"
import {
	Decoration,
	type DecorationSet,
	type EditorView,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"

import { INLINE_LOOK } from "@workspace/ui/components/library-document-inline"

const HEADING_LOOK = [
	"font-heading font-semibold text-[1.75em] text-foreground leading-[1.3]",
	"font-heading font-semibold text-[1.25em] text-foreground leading-[1.4]",
	"font-semibold text-[1.125em] text-foreground leading-[1.45]",
	"font-semibold text-foreground",
]

const QUOTE_LOOK =
	"border-muted-foreground/40 border-s-2 ps-3 text-muted-foreground"

const FENCE_LOOK = "bg-code-surface px-3 font-mono text-[0.85em]"

const LIST_MARK_LOOK = "text-muted-foreground"

const TASK_LOOK =
	"me-0.5 size-3.5 cursor-pointer align-[-0.125em] accent-primary"

const INLINE_NODES = {
	StrongEmphasis: { mark: "EmphasisMark", look: INLINE_LOOK.bold },
	Emphasis: { mark: "EmphasisMark", look: INLINE_LOOK.italic },
	Strikethrough: {
		mark: "StrikethroughMark",
		look: INLINE_LOOK.strikethrough,
	},
	InlineCode: { mark: "CodeMark", look: INLINE_LOOK.code },
} as const

type InlineNodeName = keyof typeof INLINE_NODES

const isInlineNode = (name: string): name is InlineNodeName =>
	name in INLINE_NODES

const hidden = Decoration.replace({})

const lineLook = (className: string) => Decoration.line({ class: className })

const markLook = (className: string) => Decoration.mark({ class: className })

class BulletWidget extends WidgetType {
	override eq() {
		return true
	}

	override toDOM() {
		const bullet = document.createElement("span")
		bullet.className = LIST_MARK_LOOK
		bullet.setAttribute("data-slot", "library-document-bullet")
		bullet.textContent = "•"
		return bullet
	}
}

type ToggleTask = (view: EditorView, at: number) => void

class TaskWidget extends WidgetType {
	constructor(
		readonly isDone: boolean,
		readonly label: string,
		readonly toggle: ToggleTask,
	) {
		super()
	}

	override eq(other: TaskWidget) {
		return other.isDone === this.isDone && other.label === this.label
	}

	override toDOM(view: EditorView) {
		const box = document.createElement("input")
		box.type = "checkbox"
		box.checked = this.isDone
		box.tabIndex = -1
		box.className = TASK_LOOK
		box.setAttribute("aria-label", this.label)
		box.setAttribute("data-slot", "library-document-task")
		box.addEventListener("mousedown", (event) => event.preventDefault())
		box.addEventListener("click", (event) => {
			event.preventDefault()
			this.toggle(view, view.posAtDOM(box))
		})
		return box
	}
}

const toggleTaskAt: ToggleTask = (view, at) => {
	const line = view.state.doc.lineAt(at)
	let marker: SyntaxNode | undefined
	syntaxTree(view.state).iterate({
		from: line.from,
		to: line.to,
		enter: (node) => {
			if (node.name === "TaskMarker" && !marker) marker = node.node
		},
	})
	if (!marker) return

	const isDone = view.state.sliceDoc(marker.from + 1, marker.to - 1) !== " "
	view.dispatch({
		changes: {
			from: marker.from + 1,
			to: marker.to - 1,
			insert: isDone ? " " : "x",
		},
		userEvent: "input.toggle",
	})
}

const isTouched = (
	state: EditorState,
	hasFocus: boolean,
	from: number,
	to: number,
) =>
	hasFocus &&
	state.selection.ranges.some((range) => range.from <= to && range.to >= from)

type Revealed = (from: number, to: number) => boolean

const headingLevelOf = (name: string) =>
	Number(/^ATXHeading(\d)$/.exec(name)?.[1])

const headingDecorations = (
	state: EditorState,
	node: SyntaxNode,
	isShown: Revealed,
) => {
	const level = headingLevelOf(node.name)
	const line = state.doc.lineAt(node.from)
	const look = HEADING_LOOK[Math.min(level, HEADING_LOOK.length) - 1] ?? ""
	const decorations: Range<Decoration>[] = [lineLook(look).range(line.from)]
	if (isShown(line.from, line.to)) return decorations

	for (const mark of node.getChildren("HeaderMark")) {
		const isOpening = mark.from === node.from
		const end = isOpening ? Math.min(mark.to + 1, node.to) : mark.to
		const start = isOpening ? mark.from : Math.max(node.from, mark.from - 1)
		decorations.push(hidden.range(start, end))
	}
	return decorations
}

const quoteDecorations = (
	state: EditorState,
	node: SyntaxNode,
	isShown: Revealed,
) => {
	const decorations: Range<Decoration>[] = []
	for (
		let at = state.doc.lineAt(node.from).from;
		at <= node.to;
		at = state.doc.lineAt(at).to + 1
	)
		decorations.push(lineLook(QUOTE_LOOK).range(at))
	if (isShown(node.from, node.to)) return decorations

	for (const mark of node.getChildren("QuoteMark")) {
		const isSpaced = state.sliceDoc(mark.to, mark.to + 1) === " "
		decorations.push(hidden.range(mark.from, mark.to + (isSpaced ? 1 : 0)))
	}
	return decorations
}

const fenceDecorations = (
	state: EditorState,
	node: SyntaxNode,
	isShown: Revealed,
) => {
	const decorations: Range<Decoration>[] = []
	for (
		let at = state.doc.lineAt(node.from).from;
		at <= node.to;
		at = state.doc.lineAt(at).to + 1
	)
		decorations.push(lineLook(FENCE_LOOK).range(at))
	if (isShown(node.from, node.to)) return decorations

	for (const mark of [
		...node.getChildren("CodeMark"),
		...node.getChildren("CodeInfo"),
	])
		decorations.push(hidden.range(mark.from, mark.to))
	return decorations
}

const listItemDecorations = (
	state: EditorState,
	node: SyntaxNode,
	isShown: Revealed,
	taskLabel: string,
) => {
	const mark = node.getChild("ListMark")
	if (!mark) return []
	const line = state.doc.lineAt(mark.from)
	const isOrdered = node.parent?.name === "OrderedList"
	if (isShown(line.from, line.to)) return []

	const task = node.getChild("Task")?.getChild("TaskMarker")
	if (task) {
		const isDone = state.sliceDoc(task.from + 1, task.to - 1) !== " "
		return [
			Decoration.replace({
				widget: new TaskWidget(isDone, taskLabel, toggleTaskAt),
			}).range(mark.from, task.to),
		]
	}
	if (isOrdered) return [markLook(LIST_MARK_LOOK).range(mark.from, mark.to)]
	return [
		Decoration.replace({ widget: new BulletWidget() }).range(
			mark.from,
			mark.to,
		),
	]
}

const inlineDecorations = (
	node: SyntaxNode,
	name: InlineNodeName,
	isShown: Revealed,
) => {
	const { mark, look } = INLINE_NODES[name]
	const marks = node.getChildren(mark)
	const opening = marks[0]
	const closing = marks.at(-1)
	if (!(opening && closing) || opening === closing) return []

	const decorations: Range<Decoration>[] = []
	if (opening.to < closing.from)
		decorations.push(markLook(look).range(opening.to, closing.from))
	if (!isShown(node.from, node.to))
		decorations.push(
			hidden.range(opening.from, opening.to),
			hidden.range(closing.from, closing.to),
		)
	return decorations
}

const linkDecorations = (node: SyntaxNode, isShown: Revealed) => {
	const [opening, closing] = node.getChildren("LinkMark")
	if (!(opening && closing && opening.to < closing.from)) return []

	const decorations: Range<Decoration>[] = [
		markLook(INLINE_LOOK.link).range(opening.to, closing.from),
	]
	if (!isShown(node.from, node.to))
		decorations.push(
			hidden.range(opening.from, opening.to),
			hidden.range(closing.from, node.to),
		)
	return decorations
}

const previewOf = (view: EditorView, taskLabel: string): DecorationSet => {
	const { state, hasFocus } = view
	const isShown: Revealed = (from, to) => isTouched(state, hasFocus, from, to)
	const decorations: Range<Decoration>[] = []
	for (const { from, to } of view.visibleRanges)
		syntaxTree(state).iterate({
			from,
			to,
			enter: ({ name, node }) => {
				if (headingLevelOf(name))
					decorations.push(...headingDecorations(state, node, isShown))
				else if (name === "Blockquote")
					decorations.push(...quoteDecorations(state, node, isShown))
				else if (name === "FencedCode")
					decorations.push(...fenceDecorations(state, node, isShown))
				else if (name === "ListItem")
					decorations.push(
						...listItemDecorations(state, node, isShown, taskLabel),
					)
				else if (name === "Link")
					decorations.push(...linkDecorations(node, isShown))
				else if (isInlineNode(name))
					decorations.push(...inlineDecorations(node, name, isShown))
			},
		})
	return Decoration.set(decorations, true)
}

const livePreview = (taskLabel: string) =>
	ViewPlugin.fromClass(
		class {
			decorations: DecorationSet

			constructor(view: EditorView) {
				this.decorations = previewOf(view, taskLabel)
			}

			update(update: ViewUpdate) {
				if (
					update.docChanged ||
					update.selectionSet ||
					update.focusChanged ||
					update.viewportChanged ||
					syntaxTree(update.startState) !== syntaxTree(update.state)
				)
					this.decorations = previewOf(update.view, taskLabel)
			}
		},
		{ decorations: (preview) => preview.decorations },
	)

export { livePreview }
