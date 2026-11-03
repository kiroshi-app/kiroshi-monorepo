"use client"

import type { TFunction } from "i18next"
import {
	type ClipboardEvent,
	Fragment,
	type HTMLAttributes,
	type KeyboardEvent,
	type MouseEvent,
	type ReactNode,
	type Ref,
	type TextareaHTMLAttributes,
	useEffect,
	useEffectEvent,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	type LibraryDocumentEdit,
	type LibraryDocumentFinished,
	LibraryDocumentFinishedBar,
	LibraryDocumentFinishedRun,
	type LibraryDocumentPerson,
	LibraryDocumentPersonCaret,
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	deletedIn,
	deletedRangeOf,
	formatsAround,
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
} from "@workspace/ui/components/library-document-inline"
import {
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import type { LibraryDocumentTemplate } from "@workspace/ui/components/library-new-document-dialog"
import {
	SELECTION_TOOLBAR_SLOT,
	SelectionToolbar,
	type SelectionToolbarAnchor,
	type SelectionToolbarFormat,
} from "@workspace/ui/components/selection-toolbar"
import { cn } from "@workspace/ui/lib/utils"

type BlockKind = "paragraph" | "heading" | "item"

type Block = {
	id: string
	kind: BlockKind
	text: string
	placeholder?: string
	prefix?: string
	isTight?: boolean
}

const MARKDOWN_PREFIX: Record<BlockKind, string> = {
	paragraph: "",
	heading: "## ",
	item: "- ",
}

const SHORTCUTS: [prefix: string, kind: BlockKind][] = [
	["# ", "heading"],
	["- ", "item"],
]

const BODY_TYPE = "text-reading text-soft-foreground leading-6"

const BLOCK_TYPE: Record<BlockKind, string> = {
	paragraph: BODY_TYPE,
	heading:
		"font-heading font-semibold text-[1.0625rem] text-foreground leading-6 not-first:mt-2.5",
	item: BODY_TYPE,
}

const SELECTION_LOOK = "selection:bg-primary/30 selection:text-foreground"

const BLOCK_LABEL = {
	paragraph: "library.editor.paragraph",
	heading: "library.editor.heading",
	item: "library.editor.item",
} as const

const HEADING_LINE = /^(#{1,6} +)(.*)$/

const ITEM_LINE = /^([-*+] +)(.*)$/

const blockOf = (
	kind: BlockKind,
	text: string,
	placeholder?: string,
): Block => ({ id: crypto.randomUUID(), kind, text, placeholder })

const asKind = ({ id, text, placeholder }: Block, kind: BlockKind): Block => ({
	id,
	kind,
	text,
	placeholder,
})

const sectionOf = (heading: string, placeholder: string) => [
	blockOf("heading", heading),
	blockOf("paragraph", "", placeholder),
]

const startingBlocks = (
	template: LibraryDocumentTemplate,
	t: TFunction<"common">,
): Block[] => {
	switch (template) {
		case "blank":
			return [
				blockOf("paragraph", "", t("library.templates.blank.placeholder")),
			]
		case "brief":
			return [
				blockOf("paragraph", "", t("library.templates.brief.intro")),
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
				blockOf("paragraph", "", t("library.templates.meetingNotes.intro")),
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
			return [blockOf("item", "", t("library.templates.checklist.item"))]
	}
}

const isWritten = (block: Block) => block.text.trim() !== ""

const linesOf = (blocks: Block[]) =>
	blocks.filter(isWritten).map((block, index, written) => {
		const isTight =
			block.isTight ??
			(block.kind === "item" && written[index - 1]?.kind === "item")
		const separator = index === 0 ? "" : isTight ? "\n" : "\n\n"
		const prefix = block.prefix ?? MARKDOWN_PREFIX[block.kind]
		return { block, lead: `${separator}${prefix}` }
	})

const markdownOf = (blocks: Block[]) =>
	linesOf(blocks)
		.map(({ block, lead }) => `${lead}${block.text}`)
		.join("")

const blocksOfChunk = (chunk: string) =>
	chunk.split("\n").reduce<Block[]>((blocks, line) => {
		const isTight = blocks.length > 0
		const heading = HEADING_LINE.exec(line)
		const marked = heading ?? ITEM_LINE.exec(line)
		if (marked) {
			const [, prefix = "", text = ""] = marked
			const block = blockOf(heading ? "heading" : "item", text)
			return [...blocks, { ...block, prefix, isTight }]
		}

		const previous = blocks.at(-1)
		if (previous?.kind === "paragraph") {
			previous.text = `${previous.text}\n${line}`
			return blocks
		}
		return [...blocks, { ...blockOf("paragraph", line), isTight }]
	}, [])

const blocksOf = (body: string) =>
	body.trim() === ""
		? []
		: body
				.trimEnd()
				.split(/\n{2,}/)
				.flatMap(blocksOfChunk)

const isSameLine = (block?: Block, next?: Block) =>
	block?.kind === next?.kind && block?.text === next?.text

const reconciled = (blocks: Block[], body: string) => {
	const arriving = blocksOf(body)
	const written = blocks.filter(isWritten)
	const limit = Math.min(written.length, arriving.length)
	let head = 0
	while (head < limit && isSameLine(written[head], arriving[head])) head++
	let tail = 0
	while (
		tail < limit - head &&
		isSameLine(written.at(-1 - tail), arriving.at(-1 - tail))
	)
		tail++

	const changedCount = written.length - head - tail
	const added = arriving.slice(head, arriving.length - tail)
	const isPaired = changedCount === added.length
	const kept = (block: Block, next: Block | undefined): Block[] =>
		next ? [{ ...next, id: block.id, placeholder: block.placeholder }] : []

	const next = blocks.flatMap((block) => {
		const index = written.indexOf(block)
		if (index === -1) return [block]
		if (index < head) return kept(block, arriving[index])
		if (index >= head + changedCount)
			return kept(block, arriving[index - written.length + arriving.length])
		if (isPaired) return kept(block, added[index - head])
		return index === head ? added : []
	})
	if (changedCount > 0) return next

	const anchor = written[head - 1]
	const at = anchor ? next.findIndex(({ id }) => id === anchor.id) + 1 : 0
	return next.toSpliced(at, 0, ...added)
}

type RunPiece = {
	edit: LibraryDocumentEdit
	from: number
	to: number
	isEnd: boolean
}

type CaretPiece = {
	at: number
	person: LibraryDocumentPerson
}

const textStartsOf = (blocks: Block[]) => {
	const leads = new Map(
		linesOf(blocks).map(({ block, lead }) => [block.id, lead.length]),
	)
	const starts = new Map<string, number>()
	let offset = 0
	for (const block of blocks) {
		const lead = leads.get(block.id)
		starts.set(block.id, offset + (lead ?? 0))
		if (lead !== undefined) offset += lead + block.text.length
	}
	return starts
}

const runPiecesOf = (
	blocks: Block[],
	starts: Map<string, number>,
	edits: LibraryDocumentEdit[],
) => {
	const pieces = new Map<string, RunPiece[]>()
	const lastPieces = new Map<string, RunPiece>()
	const ordered = edits.toSorted((first, second) => first.start - second.start)
	for (const block of blocks.filter(isWritten)) {
		const textStart = starts.get(block.id) ?? 0
		const textEnd = textStart + block.text.length
		let read = 0
		for (const edit of ordered) {
			const from = Math.max(edit.start, textStart) - textStart
			const to = Math.min(edit.end, textEnd) - textStart
			if (from >= to || from < read) continue

			const piece = { edit, from, to, isEnd: false }
			pieces.set(block.id, [...(pieces.get(block.id) ?? []), piece])
			lastPieces.set(edit.agent.id, piece)
			read = to
		}
	}
	for (const piece of lastPieces.values()) piece.isEnd = true
	return pieces
}

const caretPiecesOf = (
	blocks: Block[],
	starts: Map<string, number>,
	people: LibraryDocumentPerson[],
) => {
	const carets = new Map<string, CaretPiece[]>()
	const endOf = (block: Block) =>
		(starts.get(block.id) ?? 0) + block.text.length
	for (const person of people.toSorted(
		(first, second) => first.caret - second.caret,
	)) {
		const block =
			blocks.find((candidate) => endOf(candidate) >= person.caret) ??
			blocks.at(-1)
		if (!block) continue

		const offset = person.caret - (starts.get(block.id) ?? 0)
		const at = Math.min(Math.max(0, offset), block.text.length)
		carets.set(block.id, [...(carets.get(block.id) ?? []), { at, person }])
	}
	return carets
}

const LAST_LINE_HOLDER = "\u200b"

type DrawRun = (piece: RunPiece, children: ReactNode, key: string) => ReactNode

const drawnTextOf = (
	text: string,
	runs: RunPiece[],
	carets: CaretPiece[],
	drawRun: DrawRun,
) => {
	const nodes = inlineNodesOf(text)
	const spans = shownSpansOf(nodes)
	const shownCarets = carets.map((caret) => ({
		person: caret.person,
		shown: shownOffsetOf(spans, caret.at),
	}))
	const shownRunEnds = new Map(
		runs.map((run) => [run, shownOffsetOf(spans, run.to)?.at]),
	)
	const caretsAt = (spanFrom: number, at: number) =>
		shownCarets
			.filter(({ shown }) => shown?.spanFrom === spanFrom && shown.at === at)
			.map(({ person }) => (
				<LibraryDocumentPersonCaret
					key={`caret-${person.id}`}
					person={person}
				/>
			))

	const drawText = (from: number, to: number) => {
		const cuts = [
			...new Set([
				from,
				to,
				...runs.flatMap((run) => [run.from, run.to]),
				...shownCarets.flatMap(({ shown }) =>
					shown?.spanFrom === from ? [shown.at] : [],
				),
			]),
		]
			.filter((cut) => cut >= from && cut <= to)
			.sort((first, second) => first - second)

		const parts = cuts.slice(1).flatMap((end, index) => {
			const start = cuts[index] ?? from
			const run = runs.find((piece) => piece.from <= start && end <= piece.to)
			const piece = (
				<span aria-hidden="true" key={`text-${start}`}>
					{text.slice(start, end)}
				</span>
			)
			return [
				...caretsAt(from, start),
				run
					? drawRun(
							{ ...run, isEnd: run.isEnd && shownRunEnds.get(run) === end },
							piece,
							`run-${start}`,
						)
					: piece,
			]
		})
		return (
			<Fragment key={`text-${from}`}>
				{parts}
				{caretsAt(from, to)}
			</Fragment>
		)
	}

	return [
		...inlineDrawingOf(text, nodes, drawText),
		...(spans.length === 0
			? shownCarets.map(({ person }) => (
					<LibraryDocumentPersonCaret
						key={`caret-${person.id}`}
						person={person}
					/>
				))
			: []),
		<span aria-hidden="true" key="end">
			{LAST_LINE_HOLDER}
		</span>,
	]
}

const selectionOf = (field: TextField) => ({
	start: field.selectionStart,
	end: field.selectionEnd,
	direction: field.selectionDirection,
})

type TextSelection = ReturnType<typeof selectionOf>

type FieldSelection = TextSelection & { id: string }

const TITLE_FIELD = "title"

const NATIVE_PRESS = "textarea, [contenteditable], button, a"

const focusedIn = (fields: Map<string, TextField>) =>
	[...fields].find(([, field]) => field === document.activeElement)

const selectionIn = (
	fields: Map<string, TextField>,
): FieldSelection | undefined => {
	const [id, field] = focusedIn(fields) ?? []
	return id && field ? { id, ...selectionOf(field) } : undefined
}

const fieldTextOf = (id: string, title: string, blocks: Block[]) =>
	id === TITLE_FIELD ? title : blocks.find((block) => block.id === id)?.text

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

const shiftedSelection = (
	selection: FieldSelection,
	before: string,
	after: string,
) => ({
	...selection,
	start: shiftedOffset(before, after, selection.start),
	end: shiftedOffset(before, after, selection.end),
})

const openingBlocks = (
	body: string,
	template: LibraryDocumentTemplate | undefined,
	t: TFunction<"common">,
) => {
	const templateBlocks = template ? startingBlocks(template, t) : []
	if (template && body === markdownOf(templateBlocks)) return templateBlocks

	const blocks = blocksOf(body)
	return blocks.length > 0 ? blocks : startingBlocks("blank", t)
}

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
	body: markdownOf(startingBlocks(template, t)),
	detail:
		template === "blank"
			? t("library.editor.created")
			: t("library.editor.createdFrom", {
					template: t(`library.templates.${template}.name`),
				}),
})

const runsOf = (blocks: Block[]) =>
	blocks.reduce<Block[][]>((runs, block) => {
		const run = runs.at(-1)
		if (block.kind === "item" && run?.[0]?.kind === "item") run.push(block)
		else runs.push([block])
		return runs
	}, [])

const listAnchorsOf = (
	runs: Block[][],
	previous: ReadonlyMap<string, string>,
) => {
	const anchors = new Map<string, string>()
	const claimed = new Set<string>()
	for (const run of runs) {
		if (run[0]?.kind !== "item") continue
		const anchor =
			run
				.map(({ id }) => previous.get(id))
				.find((id) => id !== undefined && !claimed.has(id)) ?? run[0].id
		claimed.add(anchor)
		for (const { id } of run) anchors.set(id, anchor)
	}
	return anchors
}

const isSameAnchors = (
	first: ReadonlyMap<string, string>,
	second: ReadonlyMap<string, string>,
) =>
	first.size === second.size &&
	[...first].every(([id, anchor]) => second.get(id) === anchor)

const singleLine = (text: string) => text.replace(/\n/g, " ")

type DrawnTextProps = {
	children: ReactNode
}

const DrawnText = ({ children }: DrawnTextProps) => (
	<span
		className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap [&_[data-slot=library-document-caret]]:pointer-events-auto [&_[data-slot=library-document-caret]]:-me-0.5"
		data-slot="library-document-drawn-text"
	>
		{children}
	</span>
)

type GrowingFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
	value: string
	placeholder?: string
	className: string
	fieldClassName: string
	fieldRef?: Ref<HTMLTextAreaElement>
	drawnText?: ReactNode
}

const GrowingField = ({
	value,
	placeholder,
	className,
	fieldClassName,
	fieldRef,
	drawnText,
	...props
}: GrowingFieldProps) => (
	<span className={cn("grid break-words", className)}>
		{drawnText ? (
			<DrawnText>{drawnText}</DrawnText>
		) : (
			<span
				aria-hidden="true"
				className="pointer-events-none invisible col-start-1 row-start-1 whitespace-pre-wrap"
			>
				{`${value || placeholder || ""}​`}
			</span>
		)}
		<textarea
			className={cn(
				"col-start-1 row-start-1 resize-none overflow-hidden bg-transparent outline-none",
				drawnText &&
					"selection:bg-primary/30 [-webkit-text-fill-color:transparent]",
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

type InlineFieldProps = Omit<HTMLAttributes<HTMLSpanElement>, "children"> & {
	value: string
	className: string
	fieldRef: (node: TextField | null) => (() => void) | undefined
	drawnText?: ReactNode
	onInsert: (field: HTMLElement, text: string) => void
	onDelete: (field: HTMLElement, range: [from: number, to: number]) => void
}

const InlineField = ({
	value,
	className,
	fieldRef,
	drawnText,
	onInsert,
	onDelete,
	...props
}: InlineFieldProps) => {
	const field = useRef<HTMLSpanElement>(null)

	useLayoutEffect(() => {
		if (field.current) showInlineIn(field.current, value)
	}, [value])

	const editAroundMarkers = useEffectEvent((event: InputEvent) => {
		const node = field.current
		if (!node || event.isComposing) return

		if (event.inputType === "insertText" && event.data !== null) {
			if (isCaretOnShownText(node)) return
			event.preventDefault()
			onInsert(node, event.data)
		} else if (
			event.inputType.startsWith("delete") &&
			event.inputType !== "deleteByDrag"
		) {
			event.preventDefault()
			const range = deletedRangeOf(node, event)
			if (range) onDelete(node, range)
		}
	})

	useEffect(() => {
		const node = field.current
		const listener = (event: InputEvent) => editAroundMarkers(event)
		node?.addEventListener("beforeinput", listener)
		return () => node?.removeEventListener("beforeinput", listener)
	}, [])

	return (
		<span className={cn("grid break-words", className)}>
			{drawnText ? <DrawnText>{drawnText}</DrawnText> : null}
			<span
				className={cn(
					"col-start-1 row-start-1 whitespace-pre-wrap outline-none",
					drawnText &&
						"selection:bg-primary/30 [-webkit-text-fill-color:transparent] [&_*]:decoration-transparent [&_code]:bg-transparent [&_code]:ring-0",
				)}
				contentEditable
				ref={(node) => {
					field.current = node
					return fieldRef(node && textFieldOf(node))
				}}
				role="textbox"
				{...props}
			/>
		</span>
	)
}

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

type SelectedText = {
	id: string
	start: number
	end: number
	anchor: SelectionToolbarAnchor
}

type ToolbarMode = "bar" | "link" | "closed"

type ShortcutFormat = "bold" | "italic" | "strikethrough" | "code" | "link"

const SHORTCUT_FORMAT: Record<string, ShortcutFormat> = {
	b: "bold",
	i: "italic",
	"shift+s": "strikethrough",
	e: "code",
	k: "link",
}

const shortcutFormatOf = (event: KeyboardEvent<HTMLElement>) => {
	if (!(event.metaKey || event.ctrlKey) || event.altKey) return
	const key = event.key.toLowerCase()
	return SHORTCUT_FORMAT[event.shiftKey ? `shift+${key}` : key]
}

const isSameSelected = (first?: SelectedText, second?: SelectedText) =>
	first?.id === second?.id &&
	first?.start === second?.start &&
	first?.end === second?.end

const COLUMN = '[data-slot="library-document-column"]'

const OUTSIDE_THE_TEXT =
	'[data-slot="library-document-caret"], [data-slot="library-document-person-caret"]'

const isInToolbar = (node: Element | null) =>
	node?.closest(`[data-slot="${SELECTION_TOOLBAR_SLOT}"]`) != null

const textRangeIn = (shown: Node, start: number, end: number) => {
	const range = document.createRange()
	const walker = document.createTreeWalker(shown, NodeFilter.SHOW_TEXT, {
		acceptNode: (node) =>
			node.parentElement?.closest(OUTSIDE_THE_TEXT)
				? NodeFilter.FILTER_REJECT
				: NodeFilter.FILTER_ACCEPT,
	})
	let read = 0
	let hasStart = false
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const length = node.textContent?.length ?? 0
		if (!hasStart && start < read + length) {
			range.setStart(node, start - read)
			hasStart = true
		}
		if (end <= read + length) {
			range.setEnd(node, end - read)
			break
		}
		read += length
	}
	return range
}

const anchorOf = (
	field: TextField,
	start: number,
	end: number,
	frame: HTMLElement,
): SelectionToolbarAnchor => {
	const shown =
		field instanceof HTMLTextAreaElement
			? (field.previousElementSibling ?? field)
			: field
	const selected = textRangeIn(shown, start, end).getBoundingClientRect()
	const framed = frame.getBoundingClientRect()
	const viewport = (field.closest(COLUMN) ?? frame).getBoundingClientRect()
	return {
		centre: (selected.left + selected.right) / 2 - framed.left,
		top: selected.top - framed.top,
		bottom: selected.bottom - framed.top,
		roomAbove: selected.top - viewport.top,
	}
}

const formatsOf = (block: Block | undefined, start: number, end: number) => {
	if (!block) return { formats: [], link: undefined }
	const { formats, link } = formatsAround(block.text, start, end)
	const blockFormat: SelectionToolbarFormat[] =
		block.kind === "heading"
			? ["heading"]
			: block.kind === "item"
				? ["list"]
				: []
	return { formats: [...formats, ...blockFormat], link }
}

type LibraryDocumentEditorProps = WriterActions &
	SelectionActions & {
		title: string
		body: string
		detail: string
		template?: LibraryDocumentTemplate
		onTitleChange: (title: string) => void
		onBodyChange: (markdown: string) => void
		onBack: () => void
		onMore?: () => void
		writers?: LibraryDocumentWriter[]
		people?: LibraryDocumentPerson[]
		finished?: LibraryDocumentFinished
		onStopAll?: () => void
		onUndoAll?: () => void
		onDone?: () => void
		onCaretChange?: (caret: number | null) => void
	}

const caretIn = (field: TextField) => {
	const { start, end, direction } = selectionOf(field)
	return (
		Number(field.dataset.bodyOffset) + (direction === "backward" ? start : end)
	)
}

const endingOf = (body: string) => /\s*$/.exec(body)?.[0] ?? ""

const LibraryDocumentEditor = ({
	title: titleProp,
	body,
	detail,
	template,
	onTitleChange,
	onBodyChange,
	onBack,
	onMore,
	writers = [],
	people = [],
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
}: LibraryDocumentEditorProps) => {
	const { t } = useTranslation("common")
	const [title, setTitle] = useState(titleProp)
	const [blocks, setBlocks] = useState(() => openingBlocks(body, template, t))
	const [ending, setEnding] = useState(() => endingOf(body))
	const received = useRef({ title: titleProp, body })
	const [restoredSelection, setRestoredSelection] = useState<FieldSelection>()
	const fields = useRef(new Map<string, TextField>())
	const reportedCaret = useRef<number | null>(null)
	const pendingBlurReport = useRef<ReturnType<typeof setTimeout>>(undefined)
	const frame = useRef<HTMLDivElement>(null)
	const [selected, setSelected] = useState<SelectedText>()
	const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("bar")
	const [heldListAnchors, setHeldListAnchors] = useState<
		ReadonlyMap<string, string>
	>(() => listAnchorsOf(runsOf(blocks), new Map()))

	const reportCaret = () => {
		const [id, field] = focusedIn(fields.current) ?? []
		const caret = field && id !== TITLE_FIELD ? caretIn(field) : null
		if (caret === reportedCaret.current) return

		reportedCaret.current = caret
		onCaretChange?.(caret)
	}

	const focusAt = (id: string | undefined, caret: number | "end") => {
		const field = id ? fields.current.get(id) : undefined
		if (!field) return

		const position = caret === "end" ? field.value.length : caret
		field.focus()
		field.setSelectionRange(position, position)
		reportCaret()
	}

	const writeFromColumn = (event: MouseEvent<HTMLDivElement>) => {
		const column = event.currentTarget
		const isOnScrollbar =
			event.clientX >= column.getBoundingClientRect().left + column.clientWidth
		if (
			event.button !== 0 ||
			isOnScrollbar ||
			!(event.target instanceof Element) ||
			event.target.closest(NATIVE_PRESS)
		)
			return

		const ids = [TITLE_FIELD, ...blocks.map(({ id }) => id)]
		const besideId =
			ids.find(
				(id) =>
					event.clientY <=
					(fields.current.get(id)?.getBoundingClientRect().bottom ??
						Number.NEGATIVE_INFINITY),
			) ?? ids.at(-1)
		event.preventDefault()
		focusAt(besideId, "end")
	}

	const bodyOf = (next: Block[]) => {
		const markdown = markdownOf(next)
		return markdown === "" ? "" : `${markdown}${ending}`
	}

	const takeReceived = useEffectEvent(
		(nextTitleProp: string, nextBody: string) => {
			const previous = received.current
			received.current = { title: nextTitleProp, body: nextBody }
			const nextTitle = nextTitleProp === previous.title ? title : nextTitleProp
			const isBodyOutside =
				nextBody !== previous.body && nextBody !== bodyOf(blocks)
			const nextBlocks = isBodyOutside ? reconciled(blocks, nextBody) : blocks
			if (nextTitle === title && !isBodyOutside) return

			const selection = selectionIn(fields.current)
			const before = selection && fieldTextOf(selection.id, title, blocks)
			const after =
				selection && fieldTextOf(selection.id, nextTitle, nextBlocks)
			setTitle(nextTitle)
			if (isBodyOutside) {
				setBlocks(
					nextBlocks.length > 0 ? nextBlocks : startingBlocks("blank", t),
				)
				setEnding(endingOf(nextBody))
			}
			if (selection && before !== undefined && after !== undefined)
				setRestoredSelection(shiftedSelection(selection, before, after))
		},
	)

	useLayoutEffect(() => takeReceived(titleProp, body), [titleProp, body])

	const reportCaretAfterBlur = () => {
		clearTimeout(pendingBlurReport.current)
		pendingBlurReport.current = setTimeout(reportCaret)
	}

	useEffect(() => () => clearTimeout(pendingBlurReport.current), [])

	const readSelection = () => {
		if (isInToolbar(document.activeElement)) return

		const [id, field] = focusedIn(fields.current) ?? []
		const { start, end } = field ? selectionOf(field) : { start: 0, end: 0 }
		const next =
			id && field && frame.current && id !== TITLE_FIELD && start !== end
				? { id, start, end, anchor: anchorOf(field, start, end, frame.current) }
				: undefined
		if (!isSameSelected(selected, next)) setToolbarMode("bar")
		setSelected(next)
	}

	const followSelection = useEffectEvent(readSelection)

	useEffect(() => {
		const follow = () => followSelection()
		const followOnceFocusLands = () => queueMicrotask(follow)
		document.addEventListener("selectionchange", follow)
		document.addEventListener("focusout", followOnceFocusLands)
		window.addEventListener("scroll", follow, { capture: true, passive: true })
		window.addEventListener("resize", follow)
		return () => {
			document.removeEventListener("selectionchange", follow)
			document.removeEventListener("focusout", followOnceFocusLands)
			window.removeEventListener("scroll", follow, { capture: true })
			window.removeEventListener("resize", follow)
		}
	}, [])

	const reportRestoredCaret = useEffectEvent(reportCaret)

	useLayoutEffect(() => {
		if (!restoredSelection) return
		const { id, start, end, direction } = restoredSelection
		const field = fields.current.get(id)
		if (!field) return

		field.focus({ preventScroll: true })
		field.setSelectionRange(start, end, direction)
		reportRestoredCaret()
	}, [restoredSelection])

	const fieldRefOf = (id: string) => (node: TextField | null) => {
		if (!node) return
		fields.current.set(id, node)
		return () => {
			fields.current.delete(id)
		}
	}

	const isWriting = writers.length > 0 || people.length > 0
	const shownFinished = isWriting ? undefined : finished
	const edits: LibraryDocumentEdit[] =
		writers.length > 0 ? writers : (shownFinished?.edits ?? [])
	const textStarts = textStartsOf(blocks)
	const runPieces = runPiecesOf(blocks, textStarts, edits)
	const caretPieces = caretPiecesOf(blocks, textStarts, people)

	const drawRun: DrawRun = ({ edit, isEnd }, children, key) => {
		const writer = writers.find(({ agent }) => agent.id === edit.agent.id)
		return writer ? (
			<LibraryDocumentWrittenRun
				isEnd={isEnd}
				key={key}
				onOpenConversation={onOpenConversation}
				onStop={onStop}
				writer={writer}
			>
				{children}
			</LibraryDocumentWrittenRun>
		) : (
			<LibraryDocumentFinishedRun agent={edit.agent} key={key}>
				{children}
			</LibraryDocumentFinishedRun>
		)
	}

	const commit = (next: Block[]) => {
		const markdown = bodyOf(next)
		const hasBodyChanged = markdown !== bodyOf(blocks)
		flushSync(() => setBlocks(next))
		if (hasBodyChanged) onBodyChange(markdown)
	}

	const replaceAt = (index: number, ...replacement: Block[]) =>
		blocks.toSpliced(index, 1, ...replacement)

	const turnIntoParagraph = (index: number, block: Block) => {
		setRestoredSelection({ id: block.id, start: 0, end: 0, direction: "none" })
		commit(replaceAt(index, asKind(block, "paragraph")))
	}

	const changeTitle = (value: string) => {
		const next = singleLine(value)
		setTitle(next)
		onTitleChange(next)
	}

	const changeText = (index: number, value: string, caret: number) => {
		const block = blocks[index]
		if (!block) return

		const shortcut =
			block.kind === "paragraph"
				? SHORTCUTS.find(([prefix]) => value.startsWith(prefix))
				: undefined
		if (!shortcut) {
			const text = block.kind === "paragraph" ? value : singleLine(value)
			commit(replaceAt(index, { ...block, text }))
			focusAt(block.id, caret)
			return
		}

		const [prefix, kind] = shortcut
		commit(
			replaceAt(index, {
				...asKind(block, kind),
				text: singleLine(value.slice(prefix.length)),
				placeholder: undefined,
			}),
		)
		focusAt(block.id, Math.max(0, caret - prefix.length))
	}

	const takeTyped = (index: number, element: HTMLElement) => {
		const field = textFieldOf(element)
		changeText(index, field.value, field.selectionStart)
	}

	const insertIn = (index: number, element: HTMLElement, text: string) => {
		const field = textFieldOf(element)
		const { start, end } = selectionOf(field)
		const { value } = field
		changeText(
			index,
			`${value.slice(0, start)}${text}${value.slice(end)}`,
			start + text.length,
		)
	}

	const copyFrom = (event: ClipboardEvent<HTMLElement>) => {
		const field = textFieldOf(event.currentTarget)
		const { start, end } = selectionOf(field)
		if (start === end) return false

		event.preventDefault()
		event.clipboardData.setData("text/plain", field.value.slice(start, end))
		return true
	}

	const splitAt = (index: number, selection: TextSelection) => {
		const block = blocks[index]
		if (!block) return

		const shown = shownBoundsOf(block.text)
		const edgeOf = (offset: number) => {
			if (offset <= shown.start) return 0
			return offset >= shown.end ? block.text.length : offset
		}
		const start = edgeOf(selection.start)
		const end = edgeOf(selection.end)

		if (block.kind === "item" && block.text === "") {
			turnIntoParagraph(index, block)
			return
		}

		const after =
			block.kind === "item"
				? {
						...blockOf("item", block.text.slice(end)),
						prefix: block.prefix,
					}
				: blockOf("paragraph", block.text.slice(end))
		commit(
			replaceAt(index, { ...block, text: block.text.slice(0, start) }, after),
		)
		focusAt(after.id, 0)
	}

	const joinBackward = (index: number) => {
		const block = blocks[index]
		const previous = blocks[index - 1]
		if (!block) return

		if (block.kind !== "paragraph") {
			turnIntoParagraph(index, block)
			return
		}
		if (!previous) return

		commit(
			blocks.toSpliced(index - 1, 2, {
				...previous,
				text: `${previous.text}${block.text}`,
			}),
		)
		focusAt(previous.id, previous.text.length)
	}

	const documentRangeOf = (id: string, start: number, end: number) => {
		const offset = textStarts.get(id) ?? 0
		return { start: offset + start, end: offset + end }
	}

	const openLinkField = () => {
		readSelection()
		setToolbarMode("link")
	}

	const formatOnShortcut = (
		event: KeyboardEvent<HTMLElement>,
		format: ShortcutFormat,
		index: number,
		{ start, end }: TextSelection,
	) => {
		const action = {
			bold: onBold,
			italic: onItalic,
			strikethrough: onStrikethrough,
			code: onCode,
			link: onLink && openLinkField,
		}[format]
		const id = blocks[index]?.id
		if (!(action && id)) return

		event.preventDefault()
		event.stopPropagation()
		action(documentRangeOf(id, start, end))
	}

	const keyDownIn = (index: number) => (event: KeyboardEvent<HTMLElement>) => {
		if (event.nativeEvent.isComposing) return

		const field = textFieldOf(event.currentTarget)
		const selection = selectionOf(field)
		const { start, end } = selection
		const shown = shownBoundsOf(field.value)
		const isCollapsed = start === end
		const isAtStart = isCollapsed && start <= shown.start
		const isAtEnd = isCollapsed && end >= shown.end
		const shortcutFormat = isCollapsed ? undefined : shortcutFormatOf(event)

		if (shortcutFormat) {
			formatOnShortcut(event, shortcutFormat, index, selection)
		} else if (event.key === "Escape" && selected && toolbarMode !== "closed") {
			event.preventDefault()
			setToolbarMode("closed")
		} else if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			splitAt(index, selection)
		} else if (event.key === "Enter" && field.isContentEditable) {
			event.preventDefault()
			insertIn(index, field, "\n")
		} else if (event.key === "Backspace" && isAtStart) {
			event.preventDefault()
			joinBackward(index)
		} else if (event.key === "ArrowUp" && isAtStart && index > 0) {
			event.preventDefault()
			focusAt(blocks[index - 1]?.id, "end")
		} else if (
			event.key === "ArrowDown" &&
			isAtEnd &&
			index < blocks.length - 1
		) {
			event.preventDefault()
			focusAt(blocks[index + 1]?.id, 0)
		}
	}

	const fieldOf = (block: Block) => {
		const index = blocks.indexOf(block)
		const runs = runPieces.get(block.id)
		const carets = caretPieces.get(block.id)
		const shared = {
			"aria-label": t(BLOCK_LABEL[block.kind]),
			className: cn(BLOCK_TYPE[block.kind], SELECTION_LOOK),
			"data-body-offset": textStarts.get(block.id),
			"data-kind": block.kind,
			drawnText:
				runs || carets
					? drawnTextOf(block.text, runs ?? [], carets ?? [], drawRun)
					: undefined,
			fieldRef: fieldRefOf(block.id),
			onBlur: reportCaretAfterBlur,
			onKeyDown: keyDownIn(index),
			onSelect: reportCaret,
			value: block.text,
		}

		if (!hasInlineFormat(block.text))
			return (
				<GrowingField
					{...shared}
					fieldClassName="placeholder:text-placeholder-foreground"
					key={block.id}
					onChange={(event) =>
						changeText(
							index,
							event.target.value,
							selectionOf(event.target).start,
						)
					}
					placeholder={block.placeholder}
				/>
			)

		return (
			<InlineField
				{...shared}
				key={block.id}
				onCompositionEnd={(event) => takeTyped(index, event.currentTarget)}
				onCopy={copyFrom}
				onCut={(event) => {
					if (copyFrom(event)) insertIn(index, event.currentTarget, "")
				}}
				onInput={(event) => {
					if (!(event.nativeEvent as InputEvent).isComposing)
						takeTyped(index, event.currentTarget)
				}}
				aria-multiline={block.kind === "paragraph"}
				onDelete={(field, [from, to]) => {
					const { text, caret } = deletedIn(textFieldOf(field).value, from, to)
					changeText(index, text, caret)
				}}
				onInsert={(field, text) => insertIn(index, field, text)}
				onPaste={(event) => {
					event.preventDefault()
					insertIn(
						index,
						event.currentTarget,
						event.clipboardData.getData("text/plain"),
					)
				}}
			/>
		)
	}

	const untitled = t("library.editor.untitled")
	const runs = runsOf(blocks)
	const listAnchors = listAnchorsOf(runs, heldListAnchors)
	if (!isSameAnchors(listAnchors, heldListAnchors))
		setHeldListAnchors(listAnchors)

	const toolbarFor = ({ id, start, end, anchor }: SelectedText) => {
		const range = documentRangeOf(id, start, end)
		const onRange = (action?: FormatAction) => action && (() => action(range))
		const block = blocks.find((candidate) => candidate.id === id)
		const { formats, link } = formatsOf(block, start, end)
		return (
			<SelectionToolbar
				activeFormats={formats}
				anchor={anchor}
				isLinking={toolbarMode === "link"}
				link={link}
				onBold={onRange(onBold)}
				onCode={onRange(onCode)}
				onHeading={onRange(onHeading)}
				onItalic={onRange(onItalic)}
				onLink={onLink && ((url) => onLink(url, range))}
				onLinkingChange={(isLinking) =>
					setToolbarMode(isLinking ? "link" : "bar")
				}
				onList={onRange(onList)}
				onStrikethrough={onRange(onStrikethrough)}
			/>
		)
	}

	return (
		<div
			className="relative flex size-full min-h-0 flex-col"
			data-slot="library-document-editor"
			ref={frame}
		>
			<LibraryDocumentBar
				name={title || untitled}
				onBack={onBack}
				onMore={onMore}
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
						fieldRef={fieldRefOf(TITLE_FIELD)}
						onChange={(event) => changeTitle(event.target.value)}
						onKeyDown={(event) => {
							if (event.key !== "Enter" || event.nativeEvent.isComposing) return
							event.preventDefault()
							focusAt(blocks[0]?.id, 0)
						}}
						placeholder={untitled}
						fieldClassName="placeholder:text-title-placeholder-foreground"
						value={title}
					/>
				}
			>
				<div
					className="flex flex-col gap-3.5"
					data-slot="library-document-body"
				>
					{runs.flatMap((run) =>
						run[0]?.kind === "item" ? (
							<ul
								className="flex list-disc flex-col gap-1.5 ps-[1.5em] text-reading leading-6 marker:text-muted-foreground"
								key={`list-${listAnchors.get(run[0].id)}`}
							>
								{run.map((block) => (
									<li className="ps-1" key={block.id}>
										{fieldOf(block)}
									</li>
								))}
							</ul>
						) : (
							run.map(fieldOf)
						),
					)}
				</div>
			</LibraryDocumentColumn>
			{selected && toolbarMode !== "closed" ? toolbarFor(selected) : null}
		</div>
	)
}

export {
	LibraryDocumentEditor,
	type LibraryDocumentEditorProps,
	type LibraryDocumentRange,
	type LibraryDocumentStart,
	libraryDocumentStartOf,
}
