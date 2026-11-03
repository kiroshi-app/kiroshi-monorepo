"use client"

import {
	history,
	historyKeymap,
	isolateHistory,
	standardKeymap,
} from "@codemirror/commands"
import { markdown, markdownLanguage } from "@codemirror/lang-markdown"
import { syntaxTree } from "@codemirror/language"
import {
	Annotation,
	type ChangeSpec,
	EditorState,
	Prec,
	type Range,
	RangeSet,
	RangeValue,
	StateEffect,
	StateField,
	Transaction,
} from "@codemirror/state"
import {
	Decoration,
	type DecorationSet,
	EditorView,
	keymap,
	ViewPlugin,
	type ViewUpdate,
	WidgetType,
} from "@codemirror/view"
import type { SyntaxNode } from "@lezer/common"
import type { TFunction } from "i18next"
import {
	type MouseEvent,
	type Ref,
	type TextareaHTMLAttributes,
	useEffect,
	useEffectEvent,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useReducer,
	useRef,
	useState,
	useSyncExternalStore,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	agentScopeOf,
	FINISHED_RUN_LOOK,
	type LibraryDocumentAgent,
	LibraryDocumentAgentCaret,
	type LibraryDocumentEdit,
	type LibraryDocumentFinished,
	LibraryDocumentFinishedBar,
	type LibraryDocumentPerson,
	LibraryDocumentPersonCaret,
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	WRITTEN_RUN_LOOK,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import { formatsAround } from "@workspace/ui/components/library-document-inline"
import { livePreview } from "@workspace/ui/components/library-document-live-preview"
import {
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import type {
	LibraryItemActions,
	LibraryMenuSubject,
} from "@workspace/ui/components/library-item-menu"
import type { LibraryDocumentTemplate } from "@workspace/ui/components/library-new-document-dialog"
import {
	SELECTION_TOOLBAR_SEPARATOR,
	SELECTION_TOOLBAR_SLOT,
	SelectionToolbar,
	type SelectionToolbarAnchor,
	type SelectionToolbarFormat,
} from "@workspace/ui/components/selection-toolbar"
import { cn } from "@workspace/ui/lib/utils"

const BODY_LOOK =
	"text-reading text-soft-foreground leading-6 selection:bg-primary/30 selection:text-foreground"

const EDITOR_THEME = EditorView.theme({
	"&": { color: "inherit" },
	"&.cm-focused": { outline: "none" },
	".cm-scroller": { fontFamily: "inherit", lineHeight: "inherit" },
	".cm-content": {
		padding: "0",
		caretColor: "var(--color-foreground)",
		transitionProperty: "none",
	},
	".cm-line": { padding: "0", transitionProperty: "none" },
	".cm-placeholder": { color: "var(--color-placeholder-foreground)" },
})

const PLACEHOLDER_LOOK =
	"pointer-events-none before:text-placeholder-foreground before:content-[attr(data-placeholder)]"

const CARET_SLOT_LOOK = "[&_[data-slot=library-document-caret]]:-me-0.5"

const UNWRITTEN_LINE = /^\s*(?:[-*+]|\d+[.)])?\s*$/

type TemplateLine = {
	text: string
	placeholder?: string
}

const sectionOf = (heading: string, placeholder: string): TemplateLine[] => [
	{ text: `## ${heading}` },
	{ text: "", placeholder },
]

const templateLinesOf = (
	template: LibraryDocumentTemplate,
	t: TFunction<"common">,
): TemplateLine[] => {
	switch (template) {
		case "blank":
			return [{ text: "" }]
		case "brief":
			return [
				{ text: "", placeholder: t("library.templates.brief.intro") },
				...sectionOf(
					t("library.templates.brief.goal.heading"),
					t("library.templates.brief.goal.placeholder"),
				),
				...sectionOf(
					t("library.templates.brief.doneWhen.heading"),
					t("library.templates.brief.doneWhen.placeholder"),
				),
			]
		case "meetingNotes":
			return [
				{ text: "", placeholder: t("library.templates.meetingNotes.intro") },
				...sectionOf(
					t("library.templates.meetingNotes.decisions.heading"),
					t("library.templates.meetingNotes.decisions.placeholder"),
				),
				...sectionOf(
					t("library.templates.meetingNotes.nextSteps.heading"),
					t("library.templates.meetingNotes.nextSteps.placeholder"),
				),
			]
		case "checklist":
			return [
				{ text: "- ", placeholder: t("library.templates.checklist.item") },
			]
	}
}

const bodyOfLines = (lines: TemplateLine[]) =>
	lines.map(({ text }) => text).join("\n")

class PlaceholderMark extends RangeValue {
	constructor(readonly text: string) {
		super()
		this.startSide = -1
		this.endSide = -1
		this.point = true
	}

	override eq(other: PlaceholderMark) {
		return other.text === this.text
	}
}

const placeholderMarksOf = (
	template: LibraryDocumentTemplate | undefined,
	body: string,
	t: TFunction<"common">,
) => {
	const lines = template ? templateLinesOf(template, t) : []
	if (body !== bodyOfLines(lines)) return RangeSet.empty

	let at = 0
	return RangeSet.of(
		lines.flatMap(({ text, placeholder }) => {
			const from = at
			at += text.length + 1
			return placeholder ? [new PlaceholderMark(placeholder).range(from)] : []
		}),
	)
}

const placeholderMarks = StateField.define<RangeSet<PlaceholderMark>>({
	create: () => RangeSet.empty,
	update: (marks, transaction) => marks.map(transaction.changes),
})

class PlaceholderWidget extends WidgetType {
	constructor(readonly text: string) {
		super()
	}

	override eq(other: PlaceholderWidget) {
		return other.text === this.text
	}

	override toDOM() {
		const shown = document.createElement("span")
		shown.className = PLACEHOLDER_LOOK
		shown.setAttribute("aria-hidden", "true")
		shown.setAttribute("data-slot", "library-document-placeholder")
		shown.setAttribute("data-placeholder", this.text)
		return shown
	}
}

const placeholderAt = (text: string, at: number) =>
	Decoration.widget({ widget: new PlaceholderWidget(text), side: 1 }).range(at)

const placeholderLinesOf = (state: EditorState) => {
	const shown = new Map<number, Range<Decoration>>()
	for (
		let cursor = state.field(placeholderMarks).iter();
		cursor.value;
		cursor.next()
	) {
		const line = state.doc.lineAt(cursor.from)
		if (shown.has(line.number) || !UNWRITTEN_LINE.test(line.text)) continue
		shown.set(line.number, placeholderAt(cursor.value.text, line.to))
	}
	return shown
}

const placeholdersOf = (blankText: string) =>
	EditorView.decorations.compute(["doc", placeholderMarks], (state) =>
		state.doc.length === 0
			? Decoration.set([placeholderAt(blankText, 0)])
			: Decoration.set([...placeholderLinesOf(state).values()], true),
	)

const EMPTY_LINE = /^\s*$/

const BLOCK_GAP = Decoration.line({ class: "leading-3.5" })

const isInFence = (state: EditorState, at: number) => {
	for (
		let node: SyntaxNode | null = syntaxTree(state).resolveInner(at, 1);
		node;
		node = node.parent
	)
		if (node.name === "FencedCode") return true
	return false
}

const blockGapsOf = (view: EditorView) => {
	const { state } = view
	if (state.doc.length === 0) return Decoration.none

	const placeholderLines = placeholderLinesOf(state)
	const gaps: Range<Decoration>[] = []
	for (const { from, to } of view.visibleRanges)
		for (let at = from; at <= to; at = state.doc.lineAt(at).to + 1) {
			const line = state.doc.lineAt(at)
			if (
				EMPTY_LINE.test(line.text) &&
				!placeholderLines.has(line.number) &&
				!isInFence(state, line.from)
			)
				gaps.push(BLOCK_GAP.range(line.from))
		}
	return Decoration.set(gaps, true)
}

const blockGaps = ViewPlugin.fromClass(
	class {
		decorations: DecorationSet

		constructor(view: EditorView) {
			this.decorations = blockGapsOf(view)
		}

		update(update: ViewUpdate) {
			if (
				update.docChanged ||
				update.viewportChanged ||
				syntaxTree(update.startState) !== syntaxTree(update.state)
			)
				this.decorations = blockGapsOf(update.view)
		}
	},
	{ decorations: (gaps) => gaps.decorations },
)

type LibraryDocumentStart = {
	title: string
	body: string
	detail: string
}

const libraryDocumentStartOf = (
	template: LibraryDocumentTemplate,
	createdAt: Date,
	t: TFunction<"common">,
): LibraryDocumentStart => ({
	title:
		template === "meetingNotes"
			? t("library.templates.meetingNotes.title", { date: createdAt })
			: "",
	body: bodyOfLines(templateLinesOf(template, t)),
	detail:
		template === "blank"
			? t("library.editor.created")
			: t("library.editor.createdFrom", {
					template: t(`library.templates.${template}.name`),
				}),
})

const hostChange = Annotation.define<boolean>()

const changeWithin = (
	before: string,
	after: string,
	from: number,
	to: number,
	insertFrom: number,
	insertTo: number,
): ChangeSpec => {
	const limit = Math.min(to - from, insertTo - insertFrom)
	let head = 0
	while (head < limit && before[from + head] === after[insertFrom + head])
		head++
	let tail = 0
	while (
		tail < limit - head &&
		before[to - 1 - tail] === after[insertTo - 1 - tail]
	)
		tail++
	return {
		from: from + head,
		to: to - tail,
		insert: after.slice(insertFrom + head, insertTo - tail),
	}
}

const LINE = /[^\n]*\n|[^\n]+$/g

const lineStartsOf = (lines: string[]) => {
	const starts = [0]
	for (const line of lines) starts.push((starts.at(-1) ?? 0) + line.length)
	return starts
}

const changesBetween = (before: string, after: string): ChangeSpec[] => {
	const was = before.match(LINE) ?? []
	const now = after.match(LINE) ?? []
	const wasStarts = lineStartsOf(was)
	const nowStarts = lineStartsOf(now)
	const width = now.length + 1
	const kept = new Uint32Array((was.length + 1) * width)
	for (let i = was.length - 1; i >= 0; i--)
		for (let j = now.length - 1; j >= 0; j--)
			kept[i * width + j] =
				was[i] === now[j]
					? (kept[(i + 1) * width + j + 1] ?? 0) + 1
					: Math.max(
							kept[(i + 1) * width + j] ?? 0,
							kept[i * width + j + 1] ?? 0,
						)

	const changes: ChangeSpec[] = []
	let i = 0
	let j = 0
	let chunkI = 0
	let chunkJ = 0
	const closeChunk = () => {
		if (chunkI < i || chunkJ < j)
			changes.push(
				changeWithin(
					before,
					after,
					wasStarts[chunkI] ?? 0,
					wasStarts[i] ?? 0,
					nowStarts[chunkJ] ?? 0,
					nowStarts[j] ?? 0,
				),
			)
	}
	while (i < was.length || j < now.length) {
		if (i < was.length && j < now.length && was[i] === now[j]) {
			closeChunk()
			i++
			j++
			chunkI = i
			chunkJ = j
		} else if (
			j >= now.length ||
			(i < was.length &&
				(kept[(i + 1) * width + j] ?? 0) >= (kept[i * width + j + 1] ?? 0))
		)
			i++
		else j++
	}
	closeChunk()
	return changes
}

type CaretSlots = {
	attach: (key: string, node: HTMLElement) => void
	detach: (key: string, node: HTMLElement) => void
	subscribe: (onChange: () => void) => () => void
	current: () => ReadonlyMap<string, HTMLElement>
}

const caretSlotsOf = (): CaretSlots => {
	let slots: ReadonlyMap<string, HTMLElement> = new Map()
	const listeners = new Set<() => void>()
	const publish = (next: ReadonlyMap<string, HTMLElement>) => {
		slots = next
		for (const listener of listeners) listener()
	}
	return {
		attach: (key, node) => publish(new Map(slots).set(key, node)),
		detach: (key, node) => {
			if (slots.get(key) !== node) return
			const next = new Map(slots)
			next.delete(key)
			publish(next)
		},
		subscribe: (onChange) => {
			listeners.add(onChange)
			return () => {
				listeners.delete(onChange)
			}
		},
		current: () => slots,
	}
}

class CaretSlotWidget extends WidgetType {
	constructor(
		readonly key: string,
		readonly slots: CaretSlots,
	) {
		super()
	}

	override eq(other: CaretSlotWidget) {
		return other.key === this.key
	}

	override toDOM() {
		const slot = document.createElement("span")
		slot.className = CARET_SLOT_LOOK
		this.slots.attach(this.key, slot)
		return slot
	}

	override destroy(slot: HTMLElement) {
		this.slots.detach(this.key, slot)
	}
}

const agentCaretKey = (agent: LibraryDocumentAgent) => `agent:${agent.id}`

const personCaretKey = (person: LibraryDocumentPerson) => `person:${person.id}`

const scopeAttributesOf = (
	agent: LibraryDocumentAgent,
): Record<string, string> => {
	const scope = agentScopeOf(agent)
	if (!scope) return {}
	return {
		"data-hue": String(scope["data-hue"]),
		style: Object.entries(scope.style)
			.map(([property, value]) => `${property}: ${value}`)
			.join("; "),
	}
}

const setAgentMarks = StateEffect.define<DecorationSet>()

const agentMarks = StateField.define<DecorationSet>({
	create: () => Decoration.none,
	update: (marks, transaction) => {
		for (const effect of transaction.effects)
			if (effect.is(setAgentMarks)) return effect.value
		return marks.map(transaction.changes)
	},
	provide: (field) => EditorView.decorations.from(field),
})

type ShownAgents = {
	edits: LibraryDocumentEdit[]
	writers: LibraryDocumentWriter[]
	people: LibraryDocumentPerson[]
}

type AgentMarksInput = ShownAgents & {
	length: number
	slots: CaretSlots
}

const agentMarksOf = ({
	length,
	edits,
	writers,
	people,
	slots,
}: AgentMarksInput) => {
	const clamped = (at: number) => Math.min(Math.max(0, at), length)
	const isWriter = ({ agent }: LibraryDocumentEdit) =>
		writers.some((writer) => writer.agent.id === agent.id)
	const runs = edits.flatMap((edit) => {
		const from = clamped(edit.start)
		const to = clamped(edit.end)
		if (from >= to) return []
		return [
			Decoration.mark({
				class: isWriter(edit) ? WRITTEN_RUN_LOOK : FINISHED_RUN_LOOK,
				attributes: {
					"data-slot": "library-document-run",
					"data-agent": edit.agent.id,
					...scopeAttributesOf(edit.agent),
				},
			}).range(from, to),
		]
	})
	const caretAt = (key: string, at: number, side: number) =>
		Decoration.widget({
			widget: new CaretSlotWidget(key, slots),
			side,
		}).range(clamped(at))
	return Decoration.set(
		[
			...runs,
			...writers.map((writer) =>
				caretAt(agentCaretKey(writer.agent), writer.end, 1),
			),
			...people.map((person) =>
				caretAt(personCaretKey(person), person.caret, -1),
			),
		],
		true,
	)
}

type TextSelection = {
	start: number
	end: number
	direction: HTMLTextAreaElement["selectionDirection"]
}

const selectionOf = (field: HTMLTextAreaElement): TextSelection => ({
	start: field.selectionStart,
	end: field.selectionEnd,
	direction: field.selectionDirection,
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

const NATIVE_PRESS = "textarea, [contenteditable], button, a, .cm-editor"

const singleLine = (text: string) => text.replace(/\n/g, " ")

type GrowingFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
	value: string
	placeholder?: string
	className: string
	fieldClassName: string
	fieldRef?: Ref<HTMLTextAreaElement>
}

const GrowingField = ({
	value,
	placeholder,
	className,
	fieldClassName,
	fieldRef,
	...props
}: GrowingFieldProps) => (
	<span className={cn("grid break-words", className)}>
		<span
			aria-hidden="true"
			className="pointer-events-none invisible col-start-1 row-start-1 whitespace-pre-wrap"
		>
			{`${value || placeholder || ""}​`}
		</span>
		<textarea
			className={cn(
				"col-start-1 row-start-1 resize-none overflow-hidden bg-transparent outline-none",
				fieldClassName,
			)}
			placeholder={placeholder}
			ref={fieldRef}
			rows={1}
			value={value}
			{...props}
		/>
	</span>
)

type LibraryDocumentRange = {
	start: number
	end: number
}

type FormatAction = (range: LibraryDocumentRange) => void

type SelectionActions = {
	onBold?: FormatAction
	onItalic?: FormatAction
	onStrikethrough?: FormatAction
	onCode?: FormatAction
	onLink?: (url: string, range: LibraryDocumentRange) => void
	onHeading?: FormatAction
	onList?: FormatAction
}

type SelectionGesture = "pointer" | "keys"

type SelectedText = {
	from: number
	to: number
	anchor: SelectionToolbarAnchor
	formats: SelectionToolbarFormat[]
	link?: string
}

type ToolbarMode = "bar" | "link" | "closed"

type ShortcutFormat = "bold" | "italic" | "strikethrough" | "code" | "link"

const SHORTCUT_KEYS: [key: string, format: ShortcutFormat][] = [
	["b", "bold"],
	["i", "italic"],
	["Shift-s", "strikethrough"],
	["e", "code"],
	["k", "link"],
]

const isSameSelected = (first?: SelectedText, second?: SelectedText) =>
	first?.from === second?.from && first?.to === second?.to

const isSameAnchor = (
	first?: SelectionToolbarAnchor,
	second?: SelectionToolbarAnchor,
) =>
	first?.centre === second?.centre &&
	first?.top === second?.top &&
	first?.bottom === second?.bottom &&
	first?.roomAbove === second?.roomAbove

const COLUMN = '[data-slot="library-document-column"]'

const isInToolbar = (node: Element | null) =>
	node?.closest(`[data-slot="${SELECTION_TOOLBAR_SLOT}"]`) != null

const anchorOf = (
	view: EditorView,
	from: number,
	to: number,
	frame: HTMLElement,
): SelectionToolbarAnchor => {
	const start = view.domAtPos(from)
	const end = view.domAtPos(to)
	const range = document.createRange()
	range.setStart(start.node, start.offset)
	range.setEnd(end.node, end.offset)
	const selected = range.getBoundingClientRect()
	const framed = frame.getBoundingClientRect()
	const viewport = (
		frame.querySelector(COLUMN) ?? frame
	).getBoundingClientRect()
	return {
		centre: (selected.left + selected.right) / 2 - framed.left,
		top: selected.top - framed.top,
		bottom: selected.bottom - framed.top,
		roomAbove: selected.top - viewport.top,
	}
}

const lineFormatsAt = (state: EditorState, at: number) => {
	const formats = new Set<SelectionToolbarFormat>()
	for (
		let node: SyntaxNode | null = syntaxTree(state).resolveInner(at, 1);
		node;
		node = node.parent
	) {
		if (node.name.startsWith("ATXHeading")) formats.add("heading")
		if (node.name === "ListItem") formats.add("list")
	}
	return [...formats]
}

const formatsOf = (state: EditorState, from: number, to: number) => {
	const line = state.doc.lineAt(from)
	if (to > line.to) return { formats: [], link: undefined }
	const { formats, link } = formatsAround(
		line.text,
		from - line.from,
		to - line.from,
	)
	return { formats: [...formats, ...lineFormatsAt(state, line.from)], link }
}

const NO_WRITERS: LibraryDocumentWriter[] = []

const NO_PEOPLE: LibraryDocumentPerson[] = []

const NO_EDITS: LibraryDocumentEdit[] = []

type LibraryDocumentEditorHandle = {
	focusTitle: () => void
	restoreTitle: (name: string) => void
}

type LibraryDocumentEditorProps = WriterActions &
	SelectionActions &
	LibraryItemActions<LibraryMenuSubject> & {
		title: string
		body: string
		detail: string
		template?: LibraryDocumentTemplate
		onTitleChange: (title: string) => void
		onTitleConfirm?: (name: string) => void
		onBodyChange: (markdown: string) => void
		onBack: () => void
		writers?: LibraryDocumentWriter[]
		people?: LibraryDocumentPerson[]
		finished?: LibraryDocumentFinished
		onStopAll?: () => void
		onUndoAll?: () => void
		onDone?: () => void
		onCaretChange?: (caret: number | null) => void
		menuFinalFocus?: () => HTMLElement | boolean
		ref?: Ref<LibraryDocumentEditorHandle>
	}

const LibraryDocumentEditor = ({
	title: titleProp,
	body,
	detail,
	template,
	onTitleChange,
	onTitleConfirm,
	onBodyChange,
	onBack,
	writers = NO_WRITERS,
	people = NO_PEOPLE,
	finished,
	onStopAll,
	onStop,
	onOpenConversation,
	onUndoAll,
	onDone,
	onCaretChange,
	onBold,
	onItalic,
	onStrikethrough,
	onCode,
	onLink,
	onHeading,
	onList,
	menuFinalFocus,
	ref,
	...actions
}: LibraryDocumentEditorProps) => {
	const { t } = useTranslation("common")
	const [title, setTitle] = useState(titleProp)
	const receivedTitle = useRef(titleProp)
	const receivedBody = useRef(body)
	const [restoredTitleSelection, setRestoredTitleSelection] =
		useState<TextSelection>()
	const titleField = useRef<HTMLTextAreaElement>(null)
	const titleAtEditStart = useRef<string>(undefined)
	const bodyHost = useRef<HTMLDivElement>(null)
	const editor = useRef<EditorView>(undefined)
	const isFormatPending = useRef(false)
	const [, commitFormatWait] = useReducer((waits: number) => waits + 1, 0)
	const reportedCaret = useRef<number | null>(null)
	const frame = useRef<HTMLDivElement>(null)
	const [selected, setSelected] = useState<SelectedText>()
	const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("bar")
	const selectingBy = useRef<SelectionGesture>(undefined)
	const [caretSlots] = useState(caretSlotsOf)
	const caretNodes = useSyncExternalStore(
		caretSlots.subscribe,
		caretSlots.current,
		caretSlots.current,
	)

	const reportCaret = () => {
		const view = editor.current
		const caret = view?.hasFocus ? view.state.selection.main.head : null
		if (caret === reportedCaret.current) return

		reportedCaret.current = caret
		onCaretChange?.(caret)
	}

	const focusBodyAt = (at: number) => {
		const view = editor.current
		if (!view) return
		view.focus()
		view.dispatch({ selection: { anchor: at }, scrollIntoView: true })
	}

	const focusTitleAtEnd = () => {
		const field = titleField.current
		if (!field) return
		field.focus()
		field.setSelectionRange(field.value.length, field.value.length)
	}

	const changeTitle = (value: string) => {
		const next = singleLine(value)
		setTitle(next)
		onTitleChange(next)
	}

	useImperativeHandle(ref, () => ({
		focusTitle: focusTitleAtEnd,
		restoreTitle: setTitle,
	}))

	const takeHeldTitle = () => {
		const held = titleAtEditStart.current
		titleAtEditStart.current = undefined
		return held
	}

	const cancelTitleEdit = (field: HTMLTextAreaElement) => {
		changeTitle(takeHeldTitle() ?? title)
		field.blur()
	}

	const confirmTitle = (value: string) => {
		const held = takeHeldTitle()
		if (held === undefined) return
		const name = value.trim()
		if (name === "") {
			if (held) changeTitle(held)
		} else if (name !== held) onTitleConfirm?.(name)
	}

	const writeFromColumn = (event: MouseEvent<HTMLDivElement>) => {
		const column = event.currentTarget
		const isOnScrollbar =
			event.clientX >= column.getBoundingClientRect().left + column.clientWidth
		const view = editor.current
		if (
			event.button !== 0 ||
			isOnScrollbar ||
			!view ||
			!(event.target instanceof Element) ||
			event.target.closest(NATIVE_PRESS)
		)
			return

		event.preventDefault()
		const titleBottom =
			titleField.current?.getBoundingClientRect().bottom ??
			Number.NEGATIVE_INFINITY
		if (event.clientY <= titleBottom) focusTitleAtEnd()
		else
			focusBodyAt(view.lineBlockAtHeight(event.clientY - view.documentTop).to)
	}

	const takeTitle = useEffectEvent((nextTitle: string) => {
		const previous = receivedTitle.current
		receivedTitle.current = nextTitle
		if (nextTitle === previous || nextTitle === title) return

		const field = titleField.current
		const held =
			field && document.activeElement === field ? selectionOf(field) : undefined
		setTitle(nextTitle)
		if (held)
			setRestoredTitleSelection({
				...held,
				start: shiftedOffset(title, nextTitle, held.start),
				end: shiftedOffset(title, nextTitle, held.end),
			})
	})

	useLayoutEffect(() => takeTitle(titleProp), [titleProp])

	const restoreTitleSelection = useEffectEvent((held: TextSelection) => {
		titleField.current?.focus({ preventScroll: true })
		titleField.current?.setSelectionRange(held.start, held.end, held.direction)
		reportCaret()
	})

	useLayoutEffect(() => {
		if (restoredTitleSelection) restoreTitleSelection(restoredTitleSelection)
	}, [restoredTitleSelection])

	const readSelection = () => {
		const view = editor.current
		if (!view || isInToolbar(document.activeElement)) return

		const { from, to } = view.state.selection.main
		const next =
			frame.current && view.hasFocus && from < to && !selectingBy.current
				? {
						from,
						to,
						anchor: anchorOf(view, from, to, frame.current),
						...formatsOf(view.state, from, to),
					}
				: undefined
		if (!isSameSelected(selected, next)) setToolbarMode("bar")
		else if (isSameAnchor(selected?.anchor, next?.anchor)) return
		setSelected(next)
	}

	const followSelection = useEffectEvent(readSelection)

	useEffect(() => {
		const follow = () => followSelection()
		const followOnceFocusLands = () => queueMicrotask(follow)
		const isInDocument = (target: EventTarget | null) =>
			target instanceof Node && frame.current?.contains(target) === true
		const startPointerSelection = (event: PointerEvent) => {
			if (
				event.button !== 0 ||
				!isInDocument(event.target) ||
				isInToolbar(event.target as Element)
			)
				return
			selectingBy.current = "pointer"
			setSelected(undefined)
		}
		const startKeySelection = (event: KeyboardEvent) => {
			if (
				isInDocument(event.target) &&
				event.shiftKey &&
				event.key.startsWith("Arrow")
			)
				selectingBy.current = "keys"
		}
		const closeGesture = () => {
			selectingBy.current = undefined
			follow()
		}
		const finishSelectionBy = (gesture: SelectionGesture) => {
			if (selectingBy.current === gesture) closeGesture()
		}
		const finishPointerSelection = () => finishSelectionBy("pointer")
		const finishLostPointerSelection = (event: PointerEvent) => {
			if (event.buttons === 0 && isInDocument(event.target))
				finishPointerSelection()
		}
		const finishAnySelection = () => {
			if (selectingBy.current) closeGesture()
		}
		const finishKeySelection = (event: KeyboardEvent) => {
			if (event.key === "Shift") finishSelectionBy("keys")
		}
		document.addEventListener("focusout", followOnceFocusLands)
		document.addEventListener("pointerdown", startPointerSelection)
		document.addEventListener("pointerup", finishPointerSelection)
		document.addEventListener("pointercancel", finishPointerSelection)
		document.addEventListener("pointermove", finishLostPointerSelection)
		document.addEventListener("keydown", startKeySelection)
		document.addEventListener("keyup", finishKeySelection)
		window.addEventListener("scroll", follow, { capture: true, passive: true })
		window.addEventListener("resize", follow)
		window.addEventListener("blur", finishAnySelection)
		return () => {
			document.removeEventListener("focusout", followOnceFocusLands)
			document.removeEventListener("pointerdown", startPointerSelection)
			document.removeEventListener("pointerup", finishPointerSelection)
			document.removeEventListener("pointercancel", finishPointerSelection)
			document.removeEventListener("pointermove", finishLostPointerSelection)
			document.removeEventListener("keydown", startKeySelection)
			document.removeEventListener("keyup", finishKeySelection)
			window.removeEventListener("scroll", follow, { capture: true })
			window.removeEventListener("resize", follow)
			window.removeEventListener("blur", finishAnySelection)
		}
	}, [])

	const awaitFormat = () => {
		isFormatPending.current = true
		commitFormatWait()
	}

	const formatWith = (action: FormatAction, range: LibraryDocumentRange) => {
		awaitFormat()
		action(range)
	}

	const linkWith = (url: string, range: LibraryDocumentRange) => {
		if (!onLink) return
		awaitFormat()
		onLink(url, range)
	}

	const openLinkField = () => {
		readSelection()
		setToolbarMode("link")
	}

	const formatOnShortcut = useEffectEvent((format: ShortcutFormat) => {
		const view = editor.current
		const { from, to } = view?.state.selection.main ?? { from: 0, to: 0 }
		if (from === to) return false
		if (format === "link") {
			if (!onLink) return false
			openLinkField()
			return true
		}

		const action = {
			bold: onBold,
			italic: onItalic,
			strikethrough: onStrikethrough,
			code: onCode,
		}[format]
		if (!action) return false
		formatWith(action, { start: from, end: to })
		return true
	})

	const closeToolbar = useEffectEvent(() => {
		if (!selected || toolbarMode === "closed") return false
		setToolbarMode("closed")
		return true
	})

	const followView = useEffectEvent((update: ViewUpdate) => {
		const personChanges = update.transactions.filter(
			(transaction) => !transaction.annotation(hostChange),
		)
		if (
			personChanges.some(({ docChanged, selection }) => docChanged || selection)
		)
			isFormatPending.current = false
		if (personChanges.some(({ docChanged }) => docChanged))
			onBodyChange(update.state.doc.toString())
		if (
			update.docChanged ||
			update.selectionSet ||
			update.focusChanged ||
			update.geometryChanged
		) {
			reportCaret()
			readSelection()
		}
	})

	const openEditor = useEffectEvent((parent: HTMLElement) => {
		const formatKeys = SHORTCUT_KEYS.flatMap(([key, format]) =>
			[`Mod-${key}`, `Ctrl-${key}`].map((binding) => ({
				key: binding,
				run: () => formatOnShortcut(format),
			})),
		)
		return new EditorView({
			parent,
			state: EditorState.create({
				doc: receivedBody.current,
				extensions: [
					history(),
					Prec.highest(
						keymap.of([
							...formatKeys,
							{ key: "Escape", run: () => closeToolbar() },
						]),
					),
					keymap.of([...historyKeymap, ...standardKeymap]),
					markdown({
						base: markdownLanguage,
						completeHTMLTags: false,
						pasteURLAsLink: false,
					}),
					EditorView.lineWrapping,
					livePreview(t("library.editor.task")),
					placeholderMarks.init(() =>
						placeholderMarksOf(template, receivedBody.current, t),
					),
					placeholdersOf(t("library.templates.blank.placeholder")),
					blockGaps,
					agentMarks,
					EditorView.contentAttributes.of({
						"aria-label": t("library.editor.body"),
						class: BODY_LOOK,
						"data-slot": "library-document-body",
					}),
					EDITOR_THEME,
					EditorView.updateListener.of((update) => followView(update)),
				],
			}),
		})
	})

	useLayoutEffect(() => {
		const parent = bodyHost.current
		if (!parent) return
		const view = openEditor(parent)
		editor.current = view
		return () => {
			view.destroy()
			editor.current = undefined
		}
	}, [])

	const takeBody = useEffectEvent((nextBody: string) => {
		const view = editor.current
		const previous = receivedBody.current
		receivedBody.current = nextBody
		const text = view?.state.doc.toString()
		if (!view || nextBody === previous || nextBody === text) return

		const annotations = isFormatPending.current
			? [
					hostChange.of(true),
					isolateHistory.of("full"),
					Transaction.userEvent.of("input.format"),
				]
			: [hostChange.of(true), Transaction.addToHistory.of(false)]
		view.dispatch({
			changes: changesBetween(text ?? "", nextBody),
			annotations,
		})
	})

	const isWriting = writers.length > 0 || people.length > 0
	const shownFinished = isWriting ? undefined : finished
	const edits: LibraryDocumentEdit[] =
		writers.length > 0 ? writers : (shownFinished?.edits ?? NO_EDITS)

	const markAgents = useEffectEvent((shown: ShownAgents) => {
		const view = editor.current
		if (!view) return
		view.dispatch({
			effects: setAgentMarks.of(
				agentMarksOf({
					...shown,
					length: view.state.doc.length,
					slots: caretSlots,
				}),
			),
			annotations: hostChange.of(true),
		})
	})

	useLayoutEffect(() => {
		takeBody(body)
		markAgents({ edits, writers, people })
	}, [body, edits, writers, people])

	useLayoutEffect(() => {
		isFormatPending.current = false
	})

	const untitled = t("library.editor.untitled")
	const shownName = title || untitled
	const barItem = useMemo(() => ({ name: shownName }), [shownName])

	const toolbarFor = ({ from, to, anchor, formats, link }: SelectedText) => {
		const range = { start: from, end: to }
		const onRange = (action?: FormatAction) =>
			action && (() => formatWith(action, range))
		const isOn = (format: SelectionToolbarFormat) => formats.includes(format)
		return (
			<SelectionToolbar
				actions={[
					{ name: "bold", isOn: isOn("bold"), onPress: onRange(onBold) },
					{ name: "italic", isOn: isOn("italic"), onPress: onRange(onItalic) },
					{
						name: "strikethrough",
						isOn: isOn("strikethrough"),
						onPress: onRange(onStrikethrough),
					},
					{ name: "code", isOn: isOn("code"), onPress: onRange(onCode) },
					SELECTION_TOOLBAR_SEPARATOR,
					{ name: "link", isOn: isOn("link") },
					SELECTION_TOOLBAR_SEPARATOR,
					{
						name: "heading",
						isOn: isOn("heading"),
						onPress: onRange(onHeading),
					},
					{ name: "list", isOn: isOn("list"), onPress: onRange(onList) },
				]}
				anchor={anchor}
				isLinking={toolbarMode === "link"}
				label={t("library.editor.toolbar.label")}
				link={link}
				onLink={onLink && ((url) => linkWith(url, range))}
				onLinkingChange={(isLinking) =>
					setToolbarMode(isLinking ? "link" : "bar")
				}
			/>
		)
	}

	const caretOf = (key: string) => {
		const writer = writers.find(({ agent }) => agentCaretKey(agent) === key)
		if (writer)
			return (
				<span {...agentScopeOf(writer.agent)}>
					<LibraryDocumentAgentCaret
						onOpenConversation={onOpenConversation}
						onStop={onStop}
						writer={writer}
					/>
				</span>
			)
		const person = people.find((candidate) => personCaretKey(candidate) === key)
		return person ? <LibraryDocumentPersonCaret person={person} /> : null
	}

	return (
		<div
			className="relative flex size-full min-h-0 flex-col"
			data-slot="library-document-editor"
			ref={frame}
		>
			<LibraryDocumentBar
				{...actions}
				item={barItem}
				menuFinalFocus={menuFinalFocus}
				onBack={onBack}
				presence={
					writers.length > 0 ? (
						<LibraryDocumentPresence onStopAll={onStopAll} writers={writers} />
					) : null
				}
			/>
			<LibraryDocumentColumn
				detail={detail}
				onColumnMouseDown={writeFromColumn}
				footer={
					shownFinished ? (
						<LibraryDocumentFinishedBar
							finished={shownFinished}
							onDone={onDone}
							onUndoAll={onUndoAll}
						/>
					) : null
				}
				heading={
					<GrowingField
						aria-label={t("library.editor.title")}
						className={DOCUMENT_TITLE}
						fieldRef={titleField}
						onBlur={(event) => confirmTitle(event.currentTarget.value)}
						onChange={(event) => changeTitle(event.target.value)}
						onFocus={() => {
							titleAtEditStart.current = title
						}}
						onKeyDown={(event) => {
							if (event.nativeEvent.isComposing) return
							if (event.key === "Enter") {
								event.preventDefault()
								confirmTitle(event.currentTarget.value)
								focusBodyAt(0)
							} else if (event.key === "Escape") {
								event.preventDefault()
								cancelTitleEdit(event.currentTarget)
							}
						}}
						placeholder={untitled}
						fieldClassName="placeholder:text-title-placeholder-foreground"
						value={title}
					/>
				}
			>
				<div data-slot="library-document-body-host" ref={bodyHost} />
			</LibraryDocumentColumn>
			{[...caretNodes].map(([key, node]) =>
				createPortal(caretOf(key), node, key),
			)}
			{selected && toolbarMode !== "closed" ? toolbarFor(selected) : null}
		</div>
	)
}

export {
	LibraryDocumentEditor,
	type LibraryDocumentEditorHandle,
	type LibraryDocumentEditorProps,
	type LibraryDocumentRange,
	type LibraryDocumentStart,
	libraryDocumentStartOf,
}
