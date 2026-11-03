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
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
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
	inlineDrawingOf,
	inlineNodesOf,
	offsetIn,
	pointAt,
	showInlineIn,
	shownBoundsOf,
	shownOffsetOf,
	shownSpansOf,
} from "@workspace/ui/components/library-document-inline"
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

type BodyPoint = {
	id: string
	offset: number
}

type BodySelection = {
	anchor: BodyPoint
	focus: BodyPoint
}

type BodyRange = {
	start: BodyPoint
	end: BodyPoint
}

type HeldSelection =
	| { field: "title"; selection: TextSelection }
	| ({ field: "body" } & BodySelection)

const TITLE_FIELD = "title"

const BLOCK_TEXT = "[data-block-id]"

const NATIVE_PRESS = "textarea, [contenteditable], button, a"

const pointOfText = (text: HTMLElement, offset: number): BodyPoint => ({
	id: text.dataset.blockId ?? "",
	offset,
})

const bodyPointOf = (
	host: HTMLElement,
	node: Node,
	offset: number,
): BodyPoint | undefined => {
	const text = (
		node instanceof Element ? node : node.parentElement
	)?.closest<HTMLElement>(BLOCK_TEXT)
	if (text && host.contains(text))
		return pointOfText(text, offsetIn(text, node, offset))

	const texts = [...host.querySelectorAll<HTMLElement>(BLOCK_TEXT)]
	const probe = document.createRange()
	probe.setStart(node, offset)
	const next = texts.find((candidate) => probe.comparePoint(candidate, 0) >= 0)
	if (next) return pointOfText(next, 0)
	const last = texts.at(-1)
	return last && pointOfText(last, last.textContent?.length ?? 0)
}

const bodySelectionIn = (
	host: HTMLElement | null,
): BodySelection | undefined => {
	const live = document.getSelection()
	const anchorNode = live?.anchorNode
	const focusNode = live?.focusNode
	if (
		!(host && anchorNode && focusNode) ||
		document.activeElement !== host ||
		!host.contains(anchorNode) ||
		!host.contains(focusNode)
	)
		return undefined

	const anchor = bodyPointOf(host, anchorNode, live.anchorOffset)
	const focus = bodyPointOf(host, focusNode, live.focusOffset)
	return anchor && focus ? { anchor, focus } : undefined
}

const isCollapsed = ({ start, end }: BodyRange) =>
	start.id === end.id && start.offset === end.offset

const isSamePoint = (first: BodyPoint, second?: BodyPoint) =>
	first.id === second?.id && first.offset === second.offset

type BodySnapshot = {
	blocks: Block[]
	selection?: BodySelection
}

const IS_MAC =
	typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent)

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

const shiftedPoint = (point: BodyPoint, before: Block[], after: Block[]) => {
	const textIn = (blocks: Block[]) =>
		blocks.find(({ id }) => id === point.id)?.text
	const was = textIn(before)
	const now = textIn(after)
	return was === undefined || now === undefined
		? undefined
		: { id: point.id, offset: shiftedOffset(was, now, point.offset) }
}

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
		className="pointer-events-none col-start-1 row-start-1 select-none whitespace-pre-wrap [&_[data-slot=library-document-caret]]:pointer-events-auto [&_[data-slot=library-document-caret]]:-me-0.5"
		contentEditable={false}
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

type BlockRef = (node: HTMLElement | null) => (() => void) | undefined

type BlockTextProps = HTMLAttributes<HTMLElement> & {
	text: string
	isHeading: boolean
	textRef: BlockRef
}

const BlockText = ({ text, isHeading, textRef, ...props }: BlockTextProps) => {
	const shown = useRef<HTMLElement>(null)

	useLayoutEffect(() => {
		if (shown.current) showInlineIn(shown.current, text)
	}, [text])

	const ref = (node: HTMLElement | null) => {
		shown.current = node
		return textRef(node)
	}
	return isHeading ? <h2 ref={ref} {...props} /> : <p ref={ref} {...props} />
}

const PLACEHOLDER_LOOK =
	"data-placeholder:before:pointer-events-none data-placeholder:before:float-start data-placeholder:before:h-0 data-placeholder:before:text-placeholder-foreground data-placeholder:before:content-[attr(data-placeholder)]"

const UNDER_DRAWN_TEXT =
	"selection:bg-primary/30 [-webkit-text-fill-color:transparent] [&_*]:decoration-transparent [&_code]:bg-transparent [&_code]:ring-0"

type BodyBlockProps = {
	block: Block
	bodyOffset?: number
	drawnText?: ReactNode
	textRef: BlockRef
}

const BodyBlock = ({
	block,
	bodyOffset,
	drawnText,
	textRef,
}: BodyBlockProps) => {
	const isHeading = block.kind === "heading"
	return (
		<div
			className={cn("grid break-words", BLOCK_TYPE[block.kind], SELECTION_LOOK)}
		>
			{drawnText ? <DrawnText>{drawnText}</DrawnText> : null}
			<BlockText
				className={cn(
					"col-start-1 row-start-1 whitespace-pre-wrap",
					PLACEHOLDER_LOOK,
					drawnText && UNDER_DRAWN_TEXT,
				)}
				data-block-id={block.id}
				data-body-offset={bodyOffset}
				data-kind={block.kind}
				data-placeholder={block.text === "" ? block.placeholder : undefined}
				isHeading={isHeading}
				key={isHeading ? "heading" : "text"}
				text={block.text}
				textRef={textRef}
			/>
		</div>
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

type SelectionGesture = "pointer" | "keys"

type SelectedText = BodyRange & {
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
	first === second ||
	(first !== undefined &&
		second !== undefined &&
		isSamePoint(first.start, second.start) &&
		isSamePoint(first.end, second.end))

const COLUMN = '[data-slot="library-document-column"]'

const isInToolbar = (node: Element | null) =>
	node?.closest(`[data-slot="${SELECTION_TOOLBAR_SLOT}"]`) != null

const anchorOf = (
	selection: Range,
	frame: HTMLElement,
): SelectionToolbarAnchor => {
	const selected = selection.getBoundingClientRect()
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

type LibraryDocumentEditorHandle = {
	focusTitle: () => void
}

type LibraryDocumentEditorProps = WriterActions &
	SelectionActions &
	LibraryItemActions<LibraryMenuSubject> & {
		title: string
		body: string
		detail: string
		template?: LibraryDocumentTemplate
		onTitleChange: (title: string) => void
		onBodyChange: (markdown: string) => void
		onBack: () => void
		writers?: LibraryDocumentWriter[]
		people?: LibraryDocumentPerson[]
		finished?: LibraryDocumentFinished
		onStopAll?: () => void
		onUndoAll?: () => void
		onDone?: () => void
		onCaretChange?: (caret: number | null) => void
		ref?: Ref<LibraryDocumentEditorHandle>
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
	ref,
	...actions
}: LibraryDocumentEditorProps) => {
	const { t } = useTranslation("common")
	const [title, setTitle] = useState(titleProp)
	const [blocks, setBlocks] = useState(() => openingBlocks(body, template, t))
	const [ending, setEnding] = useState(() => endingOf(body))
	const received = useRef({ title: titleProp, body })
	const [restoredSelection, setRestoredSelection] = useState<HeldSelection>()
	const titleField = useRef<HTMLTextAreaElement>(null)
	const titleAtEditStart = useRef<string>(undefined)
	const host = useRef<HTMLDivElement>(null)
	const blockTexts = useRef(new Map<string, HTMLElement>())
	const reportedCaret = useRef<number | null>(null)
	const pendingBlurReport = useRef<ReturnType<typeof setTimeout>>(undefined)
	const frame = useRef<HTMLDivElement>(null)
	const undoSteps = useRef<BodySnapshot[]>([])
	const redoSteps = useRef<BodySnapshot[]>([])
	const typedUpTo = useRef<BodyPoint>(undefined)
	const draggedFrom = useRef<BodyRange>(undefined)
	const [selected, setSelected] = useState<SelectedText>()
	const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("bar")
	const selectingBy = useRef<SelectionGesture>(undefined)
	const [heldListAnchors, setHeldListAnchors] = useState<
		ReadonlyMap<string, string>
	>(() => listAnchorsOf(runsOf(blocks), new Map()))

	const indexOf = (id: string) => blocks.findIndex((block) => block.id === id)

	const isBefore = (first: BodyPoint, second: BodyPoint) =>
		first.id === second.id
			? first.offset < second.offset
			: indexOf(first.id) < indexOf(second.id)

	const bodyRange = (): BodyRange | undefined => {
		const held = bodySelectionIn(host.current)
		if (!held) return undefined
		const { anchor, focus } = held
		return isBefore(focus, anchor)
			? { start: focus, end: anchor }
			: { start: anchor, end: focus }
	}

	const targetRangeOf = (event: InputEvent): BodyRange | undefined => {
		const [target] = event.getTargetRanges()
		const node = host.current
		if (!(target && node)) return undefined
		const start = bodyPointOf(node, target.startContainer, target.startOffset)
		const end = bodyPointOf(node, target.endContainer, target.endOffset)
		return start && end ? { start, end } : undefined
	}

	const reportCaret = () => {
		const focus = bodySelectionIn(host.current)?.focus
		const text = focus && blockTexts.current.get(focus.id)
		const caret =
			focus && text ? Number(text.dataset.bodyOffset) + focus.offset : null
		if (caret === reportedCaret.current) return

		reportedCaret.current = caret
		onCaretChange?.(caret)
	}

	const selectBody = ({ anchor, focus }: BodySelection) => {
		const from = blockTexts.current.get(anchor.id)
		const to = blockTexts.current.get(focus.id)
		if (!(host.current && from && to)) return

		host.current.focus({ preventScroll: true })
		document
			.getSelection()
			?.setBaseAndExtent(
				...pointAt(from, anchor.offset),
				...pointAt(to, focus.offset),
			)
	}

	const focusAt = (id: string | undefined, caret: number | "end") => {
		const field = id === TITLE_FIELD ? titleField.current : undefined
		if (field) {
			const position = caret === "end" ? field.value.length : caret
			field.focus()
			field.setSelectionRange(position, position)
			reportCaret()
			return
		}

		const text = id ? blockTexts.current.get(id) : undefined
		if (!(id && text)) return

		const point = {
			id,
			offset: caret === "end" ? (text.textContent?.length ?? 0) : caret,
		}
		selectBody({ anchor: point, focus: point })
		text.scrollIntoView({ block: "nearest" })
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
		const fieldOf = (id: string) =>
			id === TITLE_FIELD ? titleField.current : blockTexts.current.get(id)
		const besideId =
			ids.find(
				(id) =>
					event.clientY <=
					(fieldOf(id)?.getBoundingClientRect().bottom ??
						Number.NEGATIVE_INFINITY),
			) ?? ids.at(-1)
		event.preventDefault()
		focusAt(besideId, "end")
	}

	const bodyOf = (next: Block[]) => {
		const markdown = markdownOf(next)
		return markdown === "" ? "" : `${markdown}${ending}`
	}

	const heldSelection = (): HeldSelection | undefined => {
		const field = titleField.current
		if (field && document.activeElement === field)
			return { field: "title", selection: selectionOf(field) }
		const held = bodySelectionIn(host.current)
		return held && { field: "body", ...held }
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

			const held = heldSelection()
			setTitle(nextTitle)
			if (isBodyOutside) {
				setBlocks(
					nextBlocks.length > 0 ? nextBlocks : startingBlocks("blank", t),
				)
				setEnding(endingOf(nextBody))
				undoSteps.current = []
				redoSteps.current = []
			}
			if (held?.field === "title") {
				const { selection } = held
				setRestoredSelection({
					field: "title",
					selection: {
						...selection,
						start: shiftedOffset(title, nextTitle, selection.start),
						end: shiftedOffset(title, nextTitle, selection.end),
					},
				})
				return
			}
			const anchor = held && shiftedPoint(held.anchor, blocks, nextBlocks)
			const focus = held && shiftedPoint(held.focus, blocks, nextBlocks)
			if (anchor && focus)
				setRestoredSelection({ field: "body", anchor, focus })
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

		const range = bodyRange()
		const live = document.getSelection()
		const next =
			range &&
			frame.current &&
			live?.rangeCount &&
			!isCollapsed(range) &&
			!selectingBy.current
				? { ...range, anchor: anchorOf(live.getRangeAt(0), frame.current) }
				: undefined
		if (!isSameSelected(selected, next)) setToolbarMode("bar")
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
		const startKeySelection = (event: globalThis.KeyboardEvent) => {
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
		const finishKeySelection = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Shift") finishSelectionBy("keys")
		}
		document.addEventListener("selectionchange", follow)
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
			document.removeEventListener("selectionchange", follow)
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

	const restoreSelection = useEffectEvent((held: HeldSelection) => {
		if (held.field === "body") selectBody(held)
		else {
			const { start, end, direction } = held.selection
			titleField.current?.focus({ preventScroll: true })
			titleField.current?.setSelectionRange(start, end, direction)
		}
		reportCaret()
	})

	useLayoutEffect(() => {
		if (restoredSelection) restoreSelection(restoredSelection)
	}, [restoredSelection])

	const blockRefOf = (id: string) => (node: HTMLElement | null) => {
		if (!node) return
		blockTexts.current.set(id, node)
		return () => {
			blockTexts.current.delete(id)
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

	const show = (next: Block[]) => {
		const markdown = bodyOf(next)
		const hasBodyChanged = markdown !== bodyOf(blocks)
		flushSync(() => setBlocks(next))
		if (hasBodyChanged) onBodyChange(markdown)
	}

	const commit = (next: Block[], isTyping = false) => {
		const selection = bodySelectionIn(host.current)
		const isSameTypingRun =
			isTyping &&
			selection !== undefined &&
			isSamePoint(selection.anchor, typedUpTo.current) &&
			isSamePoint(selection.focus, typedUpTo.current)
		if (!isSameTypingRun) undoSteps.current.push({ blocks, selection })
		redoSteps.current = []
		typedUpTo.current = undefined
		show(next)
	}

	const stepBetween = (from: BodySnapshot[], to: BodySnapshot[]) => {
		const step = from.pop()
		if (!step) return

		to.push({ blocks, selection: bodySelectionIn(host.current) })
		typedUpTo.current = undefined
		show(step.blocks)
		if (step.selection) {
			selectBody(step.selection)
			blockTexts.current
				.get(step.selection.focus.id)
				?.scrollIntoView({ block: "nearest" })
		}
		reportCaret()
	}

	const undo = () => stepBetween(undoSteps.current, redoSteps.current)

	const redo = () => stepBetween(redoSteps.current, undoSteps.current)

	const turnIntoParagraph = (source: Block[], index: number, block: Block) => {
		const point = { id: block.id, offset: 0 }
		setRestoredSelection({ field: "body", anchor: point, focus: point })
		commit(source.toSpliced(index, 1, asKind(block, "paragraph")))
	}

	const changeTitle = (value: string) => {
		const next = singleLine(value)
		setTitle(next)
		onTitleChange(next)
	}

	useImperativeHandle(ref, () => ({
		focusTitle: () => focusAt(TITLE_FIELD, "end"),
	}))

	const takeHeldTitle = () => {
		const held = titleAtEditStart.current
		titleAtEditStart.current = undefined
		return held
	}

	const cancelTitleEdit = (field: HTMLTextAreaElement) => {
		const held = takeHeldTitle()
		if (held !== undefined) changeTitle(held)
		field.blur()
	}

	const leaveTitle = (value: string) => {
		const held = takeHeldTitle()
		if (held && value.trim() === "") changeTitle(held)
	}

	const writeAt = (
		source: Block[],
		index: number,
		value: string,
		caret: number,
		isTyping = false,
	) => {
		const block = source[index]
		if (!block) return

		const shortcut =
			block.kind === "paragraph"
				? SHORTCUTS.find(([prefix]) => value.startsWith(prefix))
				: undefined
		if (!shortcut) {
			const text = block.kind === "paragraph" ? value : singleLine(value)
			commit(source.toSpliced(index, 1, { ...block, text }), isTyping)
			focusAt(block.id, caret)
			if (isTyping) typedUpTo.current = { id: block.id, offset: caret }
			return
		}

		const [prefix, kind] = shortcut
		commit(
			source.toSpliced(index, 1, {
				...asKind(block, kind),
				text: singleLine(value.slice(prefix.length)),
				placeholder: undefined,
			}),
		)
		focusAt(block.id, Math.max(0, caret - prefix.length))
	}

	const joinedOver = ({ start, end }: BodyRange) => {
		const index = indexOf(start.id)
		const last = indexOf(end.id)
		const head = blocks[index]
		const tail = blocks[last]
		if (!(head && tail)) return undefined

		const kept = deletedIn(head.text, start.offset, head.text.length)
		const value = `${kept.text}${deletedIn(tail.text, 0, end.offset).text}`
		return {
			source: blocks.toSpliced(index, last - index + 1, {
				...head,
				text: value,
			}),
			index,
			value,
			caret: kept.caret,
		}
	}

	const replaceSelection = (
		range: BodyRange,
		typed: string,
		isTyping = false,
	) => {
		const { start, end } = range
		if (start.id === end.id) {
			const index = indexOf(start.id)
			const value = blocks[index]?.text ?? ""
			writeAt(
				blocks,
				index,
				`${value.slice(0, start.offset)}${typed}${value.slice(end.offset)}`,
				start.offset + typed.length,
				isTyping,
			)
			return
		}

		const joined = joinedOver(range)
		if (!joined) return
		const { source, index, value, caret } = joined
		writeAt(
			source,
			index,
			`${value.slice(0, caret)}${typed}${value.slice(caret)}`,
			caret + typed.length,
		)
	}

	const copiedOf = ({ start, end }: BodyRange) => {
		const first = indexOf(start.id)
		const last = indexOf(end.id)
		if (first === last)
			return blocks[first]?.text.slice(start.offset, end.offset) ?? ""

		return markdownOf(
			blocks.slice(first, last + 1).map((block, index, selection) => ({
				...block,
				text: block.text.slice(
					index === 0 ? start.offset : 0,
					index === selection.length - 1 ? end.offset : undefined,
				),
			})),
		)
	}

	const copyFrom = (event: ClipboardEvent<HTMLElement>) => {
		const range = bodyRange()
		if (!range || isCollapsed(range)) return undefined

		event.preventDefault()
		event.clipboardData.setData("text/plain", copiedOf(range))
		return range
	}

	const splitOver = (range: BodyRange) => {
		const joined =
			range.start.id === range.end.id ? undefined : joinedOver(range)
		const source = joined?.source ?? blocks
		const index = joined?.index ?? indexOf(range.start.id)
		const block = source[index]
		if (!block) return

		const shown = shownBoundsOf(block.text)
		const edgeOf = (offset: number) => {
			if (offset <= shown.start) return 0
			return offset >= shown.end ? block.text.length : offset
		}
		const start = edgeOf(joined?.caret ?? range.start.offset)
		const end = edgeOf(joined?.caret ?? range.end.offset)

		if (block.kind === "item" && block.text === "") {
			turnIntoParagraph(source, index, block)
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
			source.toSpliced(
				index,
				1,
				{ ...block, text: block.text.slice(0, start) },
				after,
			),
		)
		focusAt(after.id, 0)
	}

	const joinBackward = (index: number) => {
		const block = blocks[index]
		const previous = blocks[index - 1]
		if (!block) return

		if (block.kind !== "paragraph") {
			turnIntoParagraph(blocks, index, block)
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

	const joinForward = (index: number) => {
		const block = blocks[index]
		const next = blocks[index + 1]
		if (!(block && next)) return

		writeAt(
			blocks.toSpliced(index + 1, 1),
			index,
			`${block.text}${next.text}`,
			block.text.length,
		)
	}

	const deleteOver = (range: BodyRange, event: InputEvent) => {
		if (range.start.id !== range.end.id) {
			replaceSelection(range, "")
			return
		}

		const index = indexOf(range.end.id)
		const block = blocks[index]
		const text = blockTexts.current.get(range.end.id)
		if (!(block && text)) return

		const isForward = event.inputType.includes("Forward")
		if (
			isForward &&
			isCollapsed(range) &&
			range.end.offset >= shownBoundsOf(block.text).end
		) {
			joinForward(index)
			return
		}

		const deleted: [from: number, to: number] | undefined = isCollapsed(range)
			? deletedRangeOf(text, event)
			: [range.start.offset, range.end.offset]
		if (!deleted) return
		const { text: kept, caret } = deletedIn(block.text, ...deleted)
		writeAt(blocks, index, kept, caret)
	}

	const dropInto = (at: BodyPoint, text: string, from?: BodyRange) => {
		if (!from) {
			replaceSelection({ start: at, end: at }, text)
			return
		}
		if (!(isBefore(at, from.start) || isBefore(from.end, at))) return

		const first = indexOf(from.start.id)
		const last = indexOf(from.end.id)
		const head = blocks[first]
		const tail = blocks[last]
		if (!(head && tail)) return

		const source = blocks.toSpliced(first, last - first + 1, {
			...head,
			text: `${head.text.slice(0, from.start.offset)}${tail.text.slice(from.end.offset)}`,
		})
		const target =
			at.id === from.end.id && !isBefore(at, from.start)
				? {
						id: from.start.id,
						offset: from.start.offset + at.offset - from.end.offset,
					}
				: at
		const index = source.findIndex(({ id }) => id === target.id)
		const value = source[index]?.text ?? ""
		writeAt(
			source,
			index,
			`${value.slice(0, target.offset)}${text}${value.slice(target.offset)}`,
			target.offset + text.length,
		)
	}

	const editFrom = useEffectEvent((event: InputEvent) => {
		if (event.isComposing || event.inputType.includes("Composition")) return

		event.preventDefault()
		const { inputType } = event
		const text = event.data ?? event.dataTransfer?.getData("text/plain") ?? ""
		if (inputType === "historyUndo") return undo()
		if (inputType === "historyRedo") return redo()
		if (inputType === "insertFromDrop") {
			const at = targetRangeOf(event)?.start
			if (at) dropInto(at, text, draggedFrom.current)
			draggedFrom.current = undefined
			return
		}

		const range = bodyRange()
		if (!range) return
		if (inputType === "insertText")
			replaceSelection(range, text, isCollapsed(range))
		else if (inputType === "insertReplacementText")
			replaceSelection(targetRangeOf(event) ?? range, text)
		else if (inputType.startsWith("delete") && inputType !== "deleteByDrag")
			deleteOver(range, event)
	})

	useEffect(() => {
		const node = host.current
		const listener = (event: InputEvent) => editFrom(event)
		node?.addEventListener("beforeinput", listener)
		return () => node?.removeEventListener("beforeinput", listener)
	}, [])

	const takeComposed = () => {
		const focus = bodySelectionIn(host.current)?.focus
		const text = focus && blockTexts.current.get(focus.id)
		if (focus && text)
			writeAt(
				blocks,
				indexOf(focus.id),
				text.textContent ?? "",
				focus.offset,
				true,
			)
	}

	const documentRangeOf = ({ start, end }: BodyRange) => ({
		start: (textStarts.get(start.id) ?? 0) + start.offset,
		end: (textStarts.get(end.id) ?? 0) + end.offset,
	})

	const openLinkField = () => {
		readSelection()
		setToolbarMode("link")
	}

	const formatOnShortcut = (
		event: KeyboardEvent<HTMLElement>,
		format: ShortcutFormat,
		range: BodyRange,
	) => {
		const action = {
			bold: onBold,
			italic: onItalic,
			strikethrough: onStrikethrough,
			code: onCode,
			link: onLink && openLinkField,
		}[format]
		if (!action) return

		event.preventDefault()
		event.stopPropagation()
		action(documentRangeOf(range))
	}

	const keyDown = (event: KeyboardEvent<HTMLElement>) => {
		if (event.nativeEvent.isComposing) return

		const isCommand = IS_MAC ? event.metaKey : event.ctrlKey
		const key = event.key.toLowerCase()
		const isRedo =
			isCommand && ((key === "z" && event.shiftKey) || (!IS_MAC && key === "y"))
		if (isRedo || (isCommand && key === "z")) {
			event.preventDefault()
			if (isRedo) redo()
			else undo()
			return
		}

		const range = bodyRange()
		const index = range ? indexOf(range.end.id) : -1
		const block = blocks[index]
		if (!(range && block)) return

		const shown = shownBoundsOf(block.text)
		const isAtStart = isCollapsed(range) && range.start.offset <= shown.start
		const isAtEnd = isCollapsed(range) && range.end.offset >= shown.end
		const shortcutFormat = isCollapsed(range)
			? undefined
			: shortcutFormatOf(event)

		if (shortcutFormat) {
			formatOnShortcut(event, shortcutFormat, range)
		} else if (event.key === "Escape" && selected && toolbarMode !== "closed") {
			event.preventDefault()
			setToolbarMode("closed")
		} else if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			splitOver(range)
		} else if (event.key === "Enter") {
			event.preventDefault()
			replaceSelection(range, "\n")
		} else if (event.key === "Backspace" && isAtStart) {
			event.preventDefault()
			joinBackward(index)
		} else if (event.shiftKey) {
			return
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

	const blockIn = (block: Block) => {
		const runs = runPieces.get(block.id)
		const carets = caretPieces.get(block.id)
		return (
			<BodyBlock
				block={block}
				bodyOffset={textStarts.get(block.id)}
				drawnText={
					runs || carets
						? drawnTextOf(block.text, runs ?? [], carets ?? [], drawRun)
						: undefined
				}
				key={block.id}
				textRef={blockRefOf(block.id)}
			/>
		)
	}

	const untitled = t("library.editor.untitled")
	const shownName = title || untitled
	const barItem = useMemo(() => ({ name: shownName }), [shownName])
	const runs = runsOf(blocks)
	const listAnchors = listAnchorsOf(runs, heldListAnchors)
	if (!isSameAnchors(listAnchors, heldListAnchors))
		setHeldListAnchors(listAnchors)

	const toolbarFor = ({ start, end, anchor }: SelectedText) => {
		const range = documentRangeOf({ start, end })
		const onRange = (action?: FormatAction) => action && (() => action(range))
		const block =
			start.id === end.id
				? blocks.find((candidate) => candidate.id === start.id)
				: undefined
		const { formats, link } = formatsOf(block, start.offset, end.offset)
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
				{...actions}
				item={barItem}
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
						onBlur={(event) => leaveTitle(event.currentTarget.value)}
						onChange={(event) => changeTitle(event.target.value)}
						onFocus={() => {
							titleAtEditStart.current = title
						}}
						onKeyDown={(event) => {
							if (event.nativeEvent.isComposing) return
							if (event.key === "Enter") {
								event.preventDefault()
								focusAt(blocks[0]?.id, 0)
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
				<div
					aria-label={t("library.editor.body")}
					aria-multiline
					className="flex flex-col gap-3.5 outline-none"
					contentEditable
					data-slot="library-document-body"
					onBlur={reportCaretAfterBlur}
					onFocus={() => {
						const held = bodySelectionIn(host.current)
						if (selected && (!held || isSamePoint(held.anchor, held.focus)))
							selectBody({ anchor: selected.start, focus: selected.end })
					}}
					onCompositionEnd={takeComposed}
					onCompositionStart={() => {
						const range = bodyRange()
						if (range && range.start.id !== range.end.id)
							replaceSelection(range, "")
					}}
					onCopy={copyFrom}
					onDragEnd={() => {
						draggedFrom.current = undefined
					}}
					onDragStart={(event) => {
						const range = bodyRange()
						if (!range || isCollapsed(range)) return
						draggedFrom.current = range
						event.dataTransfer.setData("text/plain", copiedOf(range))
					}}
					onCut={(event) => {
						const range = copyFrom(event)
						if (range) replaceSelection(range, "")
					}}
					onKeyDown={keyDown}
					onPaste={(event) => {
						event.preventDefault()
						const range = bodyRange()
						if (range)
							replaceSelection(range, event.clipboardData.getData("text/plain"))
					}}
					onSelect={reportCaret}
					ref={host}
					role="textbox"
					suppressContentEditableWarning
				>
					{runs.flatMap((run) =>
						run[0]?.kind === "item" ? (
							<ul
								className="flex list-disc flex-col gap-1.5 ps-[1.5em] text-reading leading-6 marker:text-muted-foreground"
								key={`list-${listAnchors.get(run[0].id)}`}
							>
								{run.map((block) => (
									<li className="ps-1" key={block.id}>
										{blockIn(block)}
									</li>
								))}
							</ul>
						) : (
							run.map(blockIn)
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
	type LibraryDocumentEditorHandle,
	type LibraryDocumentEditorProps,
	type LibraryDocumentRange,
	type LibraryDocumentStart,
	libraryDocumentStartOf,
}
