"use client"

import type { EditorState, StateCommand } from "@codemirror/state"
import type { TFunction } from "i18next"
import {
	type FocusEvent,
	type KeyboardEvent,
	type MouseEvent,
	type PointerEvent,
	type ReactNode,
	type Ref,
	useEffect,
	useEffectEvent,
	useImperativeHandle,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { LibraryCalloutEditor } from "@workspace/ui/components/library-block-callout"
import { LibraryChecklistEditor } from "@workspace/ui/components/library-block-checklist"
import {
	BLOCK_POPUP,
	LibraryCodeEditor,
} from "@workspace/ui/components/library-block-code"
import {
	LibraryGalleryEditor,
	type LibraryGalleryImage,
} from "@workspace/ui/components/library-block-gallery"
import {
	type DragProps,
	LibraryBlockHandle,
} from "@workspace/ui/components/library-block-handle"
import { LibraryTableEditor } from "@workspace/ui/components/library-block-table"
import {
	type ClientPoint,
	fieldSelectionOf,
	fieldValueOf,
	LibraryBlockText,
	offsetAtPoint,
	offsetAtShown,
	selectInField,
	shownOffsetAt,
} from "@workspace/ui/components/library-block-text"
import {
	type LibraryLinkPreview,
	LibraryWebPageEditor,
} from "@workspace/ui/components/library-block-web-page"
import {
	agentScopeOf,
	type LibraryDocumentAgent,
	type LibraryDocumentPerson,
	LibraryDocumentPersonCaret,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	WRITTEN_RUN_LOOK,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	blockIdsOf,
	blockTypeOf,
	continuedMarkerOf,
	conversionsOf,
	convertSource,
	isTextBlockType,
	keepIds,
	type LibraryBlock,
	type LibraryBlockDocument,
	type LibraryBlockPassage,
	type LibraryBlockType,
	MARKERS,
	marked,
	movedTo,
	offsetsOf,
	parseBlocks,
	passageOfShown,
	relaid,
	type SourceEdit,
	serializeBlocks,
	shiftedAcross,
	shiftedOffset,
	toggleTask,
	unmarked,
	withEmptyBlocksAt,
} from "@workspace/ui/components/library-document-blocks"
import {
	formattedSelection,
	isFormatOn,
	markdownStateOf,
	selectedLinkOf,
	setLink,
	toggleBold,
	toggleBulletList,
	toggleHeading2,
	toggleInlineCode,
	toggleItalic,
	toggleStrikethrough,
} from "@workspace/ui/components/library-document-commands"
import {
	COMMENT_CARD_SLOT,
	commentLayerOf,
	commentRunsIn,
	isCommentRun,
	LibraryDocumentBlockComments,
	LibraryDocumentBlockTint,
	type LibraryDocumentCommentOrigin,
	type LibraryDocumentCommentProps,
	LibraryDocumentCommentRun,
	LibraryDocumentModeCursor,
	MODE_CURSOR_SIZE,
} from "@workspace/ui/components/library-document-comments"
import {
	type BlockTextType,
	blockTextOf,
	splitBlockText,
} from "@workspace/ui/components/library-document-inline"
import {
	DOCUMENT_TYPE,
	PLACEHOLDER_LOOK,
} from "@workspace/ui/components/library-document-view"
import {
	LibrarySlashMenu,
	type LibrarySlashType,
} from "@workspace/ui/components/library-slash-menu"
import { MARKDOWN_CLASS, Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"
import {
	SELECTION_TOOLBAR_SEPARATOR,
	SELECTION_TOOLBAR_SLOT,
	SelectionToolbar,
	type SelectionToolbarAnchor,
	type SelectionToolbarFormat,
} from "@workspace/ui/components/selection-toolbar"
import type { ResolveImage } from "@workspace/ui/hooks/use-shown-images"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

const EDITABLE_TYPES: LibraryBlockType[] = [
	"paragraph",
	"heading",
	"list",
	"checklist",
	"quote",
]

const BLOCK_EDITORS: LibraryBlockType[] = [
	"checklist",
	"gallery",
	"callout",
	"table",
	"code",
	"web-page",
]

const POINTED_PARTS = "li, th, td, img"

const POINTER_CONTROLS = "a, button, input, [role='button']"

const FIELD_SLOT = "library-document-block-field"

const EDITING_SLOT = "library-document-block-editing"

const DRAG_THRESHOLD = 4

const HANDLE_GUTTER =
	"me-[clamp(-6px,calc((100cqw_-_var(--document-column-width,40rem))/2_-_6px),6px)]"

const PERSON_RUN = "person:"

const PLACEHOLDER_RUN = "placeholder"

const UNWRITTEN_LINE = /^\s*(?:[-*+]|\d+[.)]|#{1,6}|>)?\s*$/

const HELD_RUN = "held:"

const RUN_HOLD = 3000

const RUN_FADE = 1000

const RUN_FADE_LOOK = "animate-run-fade"

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"

const BLOCK_SLOT = '[data-slot="library-document-block"]'

const COLUMN = '[data-slot="library-document-column"]'

const BODY_SLOT = "library-document-block-body"

const COMMENT_MODE_PASS = `button, a, input, textarea, [data-slot="${COMMENT_CARD_SLOT}"]`

type CommandFormat = Exclude<SelectionToolbarFormat, "link">

const TOOLBAR_COMMANDS: Record<CommandFormat, StateCommand> = {
	bold: toggleBold,
	italic: toggleItalic,
	strikethrough: toggleStrikethrough,
	code: toggleInlineCode,
	heading: toggleHeading2,
	list: toggleBulletList,
}

type ShortcutFormat = StateCommand | "link"

const SHORTCUT_KEYS: [
	key: string,
	isShifted: boolean,
	format: ShortcutFormat,
][] = [
	["b", false, toggleBold],
	["i", false, toggleItalic],
	["s", true, toggleStrikethrough],
	["e", false, toggleInlineCode],
	["k", false, "link"],
]

type SelectionGesture = "pointer" | "keys"

type ToolbarMode = "bar" | "link" | "closed"

type SelectedText = {
	id: string
	from: number
	to: number
	anchor: SelectionToolbarAnchor
	formats: SelectionToolbarFormat[]
	link?: string
}

type HeldRun = {
	id: string
	agent: LibraryDocumentAgent
	start: number
	end: number
	isFading: boolean
}

const NO_WRITERS: LibraryDocumentWriter[] = []

const NO_PEOPLE: LibraryDocumentPerson[] = []

type LibraryDocumentPlaceholder = {
	at: number
	text: string
}

const NO_PLACEHOLDERS: LibraryDocumentPlaceholder[] = []

const skeletonOf = (type: LibrarySlashType, t: TFunction<"common">) => {
	if (isTextBlockType(type)) return MARKERS[type]
	const column = t("library.editor.blocks.skeleton.column")
	if (type === "callout") return "> [!NOTE]\n> "
	if (type === "table")
		return `| ${column} | ${column} |\n| --- | --- |\n|  |  |`
	if (type === "code") return "```\n```"
	return `\`\`\`${type}\n\`\`\``
}

type FocusRequest = {
	id: string
	on: "field" | "handle"
	caret?: number
	head?: number
	field?: number
	point?: ClientPoint
	shown?: number
}

type Pointed = {
	point: ClientPoint
	field?: number
	shown?: number
}

type Drop = {
	from: number
	to: number
}

type RunsInput = {
	writers: LibraryDocumentWriter[]
	held: HeldRun[]
	people: LibraryDocumentPerson[]
	start: number
	length: number
}

const runsIn = ({ writers, held, people, start, length }: RunsInput) => {
	const clipped = (id: string, from: number, to: number) => {
		const clippedStart = Math.max(from - start, 0)
		const clippedEnd = Math.min(to - start, length)
		return clippedStart < clippedEnd
			? [{ id, start: clippedStart, end: clippedEnd }]
			: []
	}
	return [
		...writers.flatMap(({ agent, start: from, end: to }) =>
			clipped(agent.id, from, to),
		),
		...held.flatMap(({ id, start: from, end: to }) =>
			clipped(`${HELD_RUN}${id}`, from, to),
		),
		...people.flatMap(({ id, caret }) =>
			caret >= start && caret <= start + length
				? [
						{
							id: `${PERSON_RUN}${id}`,
							start: caret - start,
							end: caret - start,
						},
					]
				: [],
		),
	]
}

const textTypeOf = (type: LibraryBlockType): BlockTextType =>
	type === "heading" || type === "list" || type === "quote" ? type : "paragraph"

const isInToolbar = (node: EventTarget | null) =>
	node instanceof Element &&
	node.closest(`[data-slot="${SELECTION_TOOLBAR_SLOT}"]`) !== null

const isBlockField = (node: EventTarget | null): node is HTMLElement =>
	node instanceof HTMLElement && node.dataset.slot === FIELD_SLOT

const formatsOf = (state: EditorState) => {
	const link = selectedLinkOf(state)
	const formats: SelectionToolbarFormat[] = Object.entries(TOOLBAR_COMMANDS)
		.filter(([, command]) => isFormatOn(state, command))
		.map(([format]) => format as CommandFormat)
	return {
		formats: link ? [...formats, "link" as const] : formats,
		link: link?.url,
	}
}

const anchorOf = (frame: HTMLElement): SelectionToolbarAnchor => {
	const selected =
		document.getSelection()?.getRangeAt(0).getBoundingClientRect() ??
		new DOMRect()
	const framed = frame.getBoundingClientRect()
	const viewport = (frame.closest(COLUMN) ?? frame).getBoundingClientRect()
	return {
		centre: (selected.left + selected.right) / 2 - framed.left,
		top: selected.top - framed.top,
		bottom: selected.bottom - framed.top,
		roomAbove: selected.top - viewport.top,
	}
}

const shownPassageIn = (body: Element, source: string) => {
	const selection = document.getSelection()
	if (
		!selection ||
		selection.rangeCount === 0 ||
		!body.contains(selection.anchorNode) ||
		!body.contains(selection.focusNode)
	)
		return undefined
	const range = selection.getRangeAt(0)
	const lead = document.createRange()
	lead.selectNodeContents(body)
	lead.setEnd(range.startContainer, range.startOffset)
	return passageOfShown(source, {
		shown: body.textContent ?? "",
		start: lead.toString().length,
		text: range.toString(),
	})
}

const isSameSelected = (first?: SelectedText, second?: SelectedText) =>
	first?.id === second?.id &&
	first?.from === second?.from &&
	first?.to === second?.to

const isSameAnchor = (
	first?: SelectionToolbarAnchor,
	second?: SelectionToolbarAnchor,
) =>
	first?.centre === second?.centre &&
	first?.top === second?.top &&
	first?.bottom === second?.bottom &&
	first?.roomAbove === second?.roomAbove

type HeldRunProps = {
	run: HeldRun
	children: ReactNode
}

const HeldWrittenRun = ({ run, children }: HeldRunProps) => (
	<span {...agentScopeOf(run.agent)}>
		<span
			className={cn(WRITTEN_RUN_LOOK, run.isFading && RUN_FADE_LOOK)}
			data-slot="library-document-held-run"
		>
			{children}
		</span>
	</span>
)

type LibraryDocumentBlockEditorHandle = {
	focusStart: () => void
	focusEndAt: (clientY: number) => void
}

type LibraryDocumentFormat = "markdown" | "plain"

type LibraryDocumentBlockEditorProps = WriterActions &
	LibraryDocumentCommentProps & {
		body: string
		format?: LibraryDocumentFormat
		onBodyChange: (markdown: string) => void
		writers?: LibraryDocumentWriter[]
		people?: LibraryDocumentPerson[]
		onAddImages?: () => Promise<LibraryGalleryImage[]>
		resolveImage?: ResolveImage
		onLinkPreview?: (url: string) => Promise<LibraryLinkPreview>
		onCaretChange?: (caret: number | null) => void
		placeholders?: LibraryDocumentPlaceholder[]
		ref?: Ref<LibraryDocumentBlockEditorHandle>
		isCommentMode?: boolean
	}

const LibraryDocumentBlockEditor = ({
	body,
	format = "markdown",
	onBodyChange,
	writers = NO_WRITERS,
	people = NO_PEOPLE,
	onStop,
	onOpenConversation,
	onAddImages,
	resolveImage,
	onLinkPreview,
	onCaretChange,
	placeholders = NO_PLACEHOLDERS,
	isCommentMode = false,
	onStartComment,
	ref,
	...commentProps
}: LibraryDocumentBlockEditorProps) => {
	const { t } = useTranslation("common")
	const [ids] = useState(blockIdsOf)
	const withLine = ({ lead, blocks }: LibraryBlockDocument) => ({
		lead,
		blocks:
			blocks.length > 0 ? blocks : [{ id: ids.fresh(), source: "", gap: "" }],
	})
	const seeded = (markdown: string, shown: LibraryDocumentPlaceholder[]) =>
		withEmptyBlocksAt(
			parseBlocks(markdown, ids),
			shown.map(({ at }) => at),
			ids,
		)
	const [doc, setDoc] = useState(() => withLine(seeded(body, placeholders)))
	const [anchors, setAnchors] = useState(placeholders)
	const shownAnchors = useRef(anchors)
	const latest = useRef(doc)
	const received = useRef(body)
	const [editing, setEditing] = useState<string>()
	const [slashFor, setSlashFor] = useState<string>()
	const [focusRequest, setFocusRequest] = useState<FocusRequest>()
	const [drop, setDrop] = useState<Drop>()
	const wasDragged = useRef(false)
	const pointed = useRef<Pointed>(undefined)
	const list = useRef<HTMLDivElement>(null)
	const textField = useRef<HTMLDivElement>(null)
	const reportedCaret = useRef<number | null>(null)
	const [selected, setSelected] = useState<SelectedText>()
	const [toolbarMode, setToolbarMode] = useState<ToolbarMode>("bar")
	const selectingBy = useRef<SelectionGesture>(undefined)
	const [heldRuns, setHeldRuns] = useState<HeldRun[]>([])
	const shownWriters = useRef(writers)
	const heldCount = useRef(0)
	const holdTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>())
	const heldDoc = useRef(doc)
	const [hovered, setHovered] = useState<string>()
	const modeCursor = useRef<HTMLSpanElement>(null)

	const anchorsAfter = (markdown: string) => {
		const before = serializeBlocks(latest.current)
		if (shownAnchors.current.length === 0 || before === markdown)
			return shownAnchors.current
		return shownAnchors.current.map((placeholder) => ({
			...placeholder,
			at: shiftedOffset(before, markdown, placeholder.at),
		}))
	}

	const anchorsOf = (next: LibraryBlockDocument) =>
		shownAnchors.current.map((placeholder) => ({
			...placeholder,
			at: shiftedAcross(latest.current, next, placeholder.at),
		}))

	const show = (next: LibraryBlockDocument, nextAnchors = anchorsOf(next)) => {
		latest.current = next
		setDoc(next)
		shownAnchors.current = nextAnchors
		setAnchors(nextAnchors)
	}

	const placeholderAt = (
		block: LibraryBlock,
		start: number,
		shown: LibraryDocumentPlaceholder[],
	) =>
		UNWRITTEN_LINE.test(block.source)
			? shown.find((placeholder) => placeholder.at === start)?.text
			: undefined

	const commit = (edited: LibraryBlockDocument) => {
		const next = format === "plain" ? unmarked(edited) : marked(edited, ids)
		show(next)
		const markdown = serializeBlocks(next)
		received.current = markdown
		onBodyChange(markdown)
	}

	const commitBlocks = (blocks: LibraryBlock[]) =>
		commit(withLine({ ...latest.current, blocks }))

	const restructure = (sources: LibraryBlock[]) =>
		commitBlocks(relaid(latest.current.blocks, sources))

	const reread = (markdown: string) => {
		const nextAnchors = anchorsAfter(markdown)
		show(
			withLine(keepIds(latest.current.blocks, seeded(markdown, nextAnchors))),
			nextAnchors,
		)
	}

	const remove = (id: string) =>
		restructure(latest.current.blocks.filter((block) => block.id !== id))

	const takeBody = useEffectEvent((next: string) => {
		if (next === received.current) return
		received.current = next
		if (next !== serializeBlocks(latest.current)) reread(next)
	})

	useLayoutEffect(() => takeBody(body), [body])

	const reportCaret = (caret: number | null) => {
		if (caret === reportedCaret.current) return
		reportedCaret.current = caret
		onCaretChange?.(caret)
	}

	const caretOf = (field: HTMLElement) => {
		const id = field.closest<HTMLElement>(BLOCK_SLOT)?.dataset.blockId
		const index = latest.current.blocks.findIndex((block) => block.id === id)
		if (index === -1) return null
		const { source } = latest.current.blocks[index]
		const start = offsetsOf(latest.current)[index]
		const value = fieldValueOf(field)
		const within = value === source ? 0 : source.indexOf(value)
		return within === -1
			? start
			: start + within + (fieldSelectionOf(field)?.head ?? 0)
	}

	const reportFocusedCaret = () => {
		const focused = document.activeElement
		if (isBlockField(focused) && list.current?.contains(focused))
			reportCaret(caretOf(focused))
	}

	const reportFocusedField = useEffectEvent(reportFocusedCaret)

	const dropHeldRuns = (ids: string[]) => {
		for (const id of ids) {
			clearTimeout(holdTimers.current.get(id))
			holdTimers.current.delete(id)
		}
		setHeldRuns((runs) => runs.filter((run) => !ids.includes(run.id)))
	}

	const holdFor = (id: string, delay: number, then: () => void) =>
		holdTimers.current.set(id, setTimeout(then, delay))

	const endHold = (id: string) => {
		if (matchMedia(REDUCED_MOTION).matches) return dropHeldRuns([id])
		setHeldRuns((runs) =>
			runs.map((run) => (run.id === id ? { ...run, isFading: true } : run)),
		)
		holdFor(id, RUN_FADE, () => dropHeldRuns([id]))
	}

	const holdFinishedRuns = useEffectEvent((next: LibraryDocumentWriter[]) => {
		const previous = shownWriters.current
		shownWriters.current = next
		if (previous === next) return
		const covered = heldRuns.filter((run) =>
			next.some(
				({ agent, start, end }) =>
					agent.id === run.agent.id && start <= run.end && run.start <= end,
			),
		)
		if (covered.length > 0) dropHeldRuns(covered.map(({ id }) => id))
		const finished = previous
			.filter(
				({ agent }) => !next.some((writer) => writer.agent.id === agent.id),
			)
			.map(({ agent, start, end }) => ({
				id: `${agent.id}-${++heldCount.current}`,
				agent,
				start,
				end,
				isFading: false,
			}))
		if (finished.length === 0) return
		for (const run of finished) holdFor(run.id, RUN_HOLD, () => endHold(run.id))
		setHeldRuns((runs) => [...runs, ...finished])
	})

	useLayoutEffect(() => holdFinishedRuns(writers), [writers])

	useEffect(() => {
		const timers = holdTimers.current
		return () => {
			for (const timer of timers.values()) clearTimeout(timer)
		}
	}, [])

	const followBody = useEffectEvent((next: LibraryBlockDocument) => {
		const before = heldDoc.current
		heldDoc.current = next
		if (serializeBlocks(before) === serializeBlocks(next)) return
		reportFocusedCaret()
		if (heldRuns.length === 0) return
		const shifted = (at: number) => shiftedAcross(before, next, at)
		setHeldRuns((runs) =>
			runs.map((run) => ({
				...run,
				start: shifted(run.start),
				end: shifted(run.end),
			})),
		)
	})

	useLayoutEffect(() => followBody(doc), [doc])

	useLayoutEffect(() => {
		if (!focusRequest) return
		const block = list.current?.querySelector(
			`[data-block-id="${focusRequest.id}"]`,
		)
		if (focusRequest.on === "handle") {
			block
				?.querySelector<HTMLElement>('[data-slot="library-block-drag"]')
				?.focus()
			return
		}
		const fields = [
			...(block?.querySelectorAll<HTMLElement>(`[data-slot="${FIELD_SLOT}"]`) ??
				[]),
		]
		const last = fields.length - 1
		const field = fields[Math.min(focusRequest.field ?? last, last)]
		if (!field) {
			block
				?.querySelector<HTMLElement>(`[data-slot="${EDITING_SLOT}"]`)
				?.focus()
			return
		}
		const { point, shown } = focusRequest
		const caret =
			shown !== undefined
				? offsetAtShown(field, shown)
				: ((point && offsetAtPoint(field, point)) ?? focusRequest.caret)
		field.focus()
		selectInField(field, caret, focusRequest.head ?? caret)
		reportFocusedField()
	}, [focusRequest])

	const indexOf = (id: string) =>
		latest.current.blocks.findIndex((block) => block.id === id)

	const edit = (
		id: string,
		caret?: number,
		field?: number,
		point?: ClientPoint,
		shown?: number,
	) => {
		setEditing(id)
		setFocusRequest({ id, on: "field", caret, field, point, shown })
	}

	const focusHandle = (id: string) => setFocusRequest({ id, on: "handle" })

	const writeSource = (id: string, source: string) =>
		commitBlocks(
			latest.current.blocks.map((block) =>
				block.id === id ? { ...block, source } : block,
			),
		)

	const editSource =
		(id: string): SourceEdit =>
		(change) => {
			const block = latest.current.blocks[indexOf(id)]
			if (block) writeSource(id, change(block.source))
		}

	const insertAfter = (index: number, source: string) => {
		const block = { id: ids.fresh(), source, gap: "" }
		const sources = [...latest.current.blocks]
		sources.splice(index + 1, 0, block)
		restructure(sources)
		return block.id
	}

	const sourceOfEditing = () =>
		editing ? latest.current.blocks[indexOf(editing)]?.source : undefined

	const readSelection = () => {
		const field = textField.current
		const frame = list.current
		const source = sourceOfEditing()
		const isHeldByToolbar = isInToolbar(document.activeElement)
		const range = field ? fieldSelectionOf(field) : undefined
		const next =
			range &&
			frame &&
			editing &&
			source !== undefined &&
			(document.activeElement === field || isHeldByToolbar) &&
			range.start < range.end &&
			!selectingBy.current
				? {
						id: editing,
						from: range.start,
						to: range.end,
						anchor: anchorOf(frame),
						...formatsOf(
							markdownStateOf({
								text: source,
								anchor: range.anchor,
								head: range.head,
							}),
						),
					}
				: undefined
		if (isHeldByToolbar && (!selected || !next)) return
		const isSame = isSameSelected(selected, next)
		if (!isSame && !isHeldByToolbar) setToolbarMode("bar")
		else if (isSame && isSameAnchor(selected?.anchor, next?.anchor)) return
		setSelected(next)
	}

	const followSelection = useEffectEvent(() => {
		reportFocusedCaret()
		readSelection()
	})

	useEffect(() => {
		const follow = () => followSelection()
		const followOnceFocusLands = () => queueMicrotask(follow)
		const isInDocument = (target: EventTarget | null) =>
			target instanceof Node && list.current?.contains(target) === true
		const startPointerSelection = (event: globalThis.PointerEvent) => {
			if (
				event.button !== 0 ||
				!isInDocument(event.target) ||
				isInToolbar(event.target)
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
		const finishLostPointerSelection = (event: globalThis.PointerEvent) => {
			if (event.buttons === 0 && isInDocument(event.target))
				finishPointerSelection()
		}
		const finishAnySelection = () => {
			if (selectingBy.current) closeGesture()
		}
		const finishKeySelection = (event: globalThis.KeyboardEvent) => {
			if (event.key === "Shift") finishSelectionBy("keys")
		}
		document.addEventListener("selectionchange", follow, true)
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
			document.removeEventListener("selectionchange", follow, true)
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

	const formatSelected = (command: StateCommand) => {
		const field = textField.current
		const source = sourceOfEditing()
		if (!field || !editing || source === undefined) return
		const live = fieldSelectionOf(field)
		const range =
			live && live.start < live.end
				? live
				: selected && { anchor: selected.from, head: selected.to }
		if (!range) return
		const next = formattedSelection(
			{ text: source, anchor: range.anchor, head: range.head },
			command,
		)
		if (!next) return
		writeSource(editing, next.text)
		setFocusRequest({
			id: editing,
			on: "field",
			caret: next.anchor,
			head: next.head,
		})
	}

	const openLinkField = () => {
		readSelection()
		setToolbarMode("link")
	}

	const shownSelection =
		toolbarMode === "closed" || isCommentMode ? undefined : selected

	const fieldPassageOf = (id: string): LibraryBlockPassage | undefined => {
		const field = textField.current
		const source = sourceOfEditing()
		const range =
			editing === id && field && document.activeElement === field
				? fieldSelectionOf(field)
				: undefined
		return range && source !== undefined && range.start < range.end
			? {
					start: range.start,
					end: range.end,
					text: source.slice(range.start, range.end),
				}
			: undefined
	}

	const startComment = (
		blockId: string,
		origin: LibraryDocumentCommentOrigin,
		passage = fieldPassageOf(blockId),
	) => onStartComment?.({ blockId, ...(passage && { passage }), origin })

	const startCommentAtPointer = (event: MouseEvent<HTMLDivElement>) => {
		const { target } = event
		if (!(target instanceof Element) || target.closest(COMMENT_MODE_PASS))
			return
		const id = target.closest<HTMLElement>(BLOCK_SLOT)?.dataset.blockId
		const block = latest.current.blocks.find((each) => each.id === id)
		if (!block) return
		const body = target.closest(`[data-slot="${BODY_SLOT}"]`)
		startComment(
			block.id,
			"pointer",
			fieldPassageOf(block.id) ??
				(body ? shownPassageIn(body, block.source) : undefined),
		)
	}

	const followPointer = (event: PointerEvent<HTMLDivElement>) => {
		const { target, currentTarget, clientX, clientY } = event
		const block =
			target instanceof Element && !target.closest(COMMENT_MODE_PASS)
				? target.closest<HTMLElement>(BLOCK_SLOT)
				: null
		setHovered(block?.dataset.blockId)
		const frame = currentTarget.getBoundingClientRect()
		if (modeCursor.current)
			modeCursor.current.style.translate = `${clientX - frame.left}px ${clientY - frame.top - MODE_CURSOR_SIZE}px`
	}

	const toolbarFor = ({ anchor, formats, link }: SelectedText) => {
		const action = (name: CommandFormat) => ({
			name,
			isOn: formats.includes(name),
			onPress: () => formatSelected(TOOLBAR_COMMANDS[name]),
		})
		return (
			<SelectionToolbar
				actions={[
					action("bold"),
					action("italic"),
					action("strikethrough"),
					action("code"),
					SELECTION_TOOLBAR_SEPARATOR,
					{ name: "link", isOn: formats.includes("link") },
					SELECTION_TOOLBAR_SEPARATOR,
					action("heading"),
					action("list"),
				]}
				anchor={anchor}
				isLinking={toolbarMode === "link"}
				label={t("library.editor.toolbar.label")}
				link={link}
				onLink={(url) => formatSelected(setLink(url))}
				onLinkingChange={(isLinking) =>
					setToolbarMode(isLinking ? "link" : "bar")
				}
			/>
		)
	}

	const stopEditing = (id: string) => {
		setEditing(undefined)
		setSlashFor(undefined)
		const index = indexOf(id)
		if (index === -1) return
		const block = latest.current.blocks[index]
		const start = offsetsOf(latest.current)[index]
		if (
			block.source.trim() === "" &&
			latest.current.blocks.length > 1 &&
			!placeholderAt(block, start, shownAnchors.current)
		)
			remove(id)
		else reread(serializeBlocks(latest.current))
	}

	const stepBack = (id: string) => {
		const previous = latest.current.blocks[indexOf(id) - 1]
		setEditing(undefined)
		remove(id)
		if (previous && EDITABLE_TYPES.includes(blockTypeOf(previous.source)))
			edit(previous.id)
		else if (previous) focusHandle(previous.id)
	}

	const actionsFor = (id: string) => {
		const at = () => indexOf(id)
		const move = (step: number) => {
			const from = at()
			const to = from + step
			if (to < 0 || to >= latest.current.blocks.length) return
			setEditing(undefined)
			restructure(movedTo(latest.current.blocks, from, to))
			focusHandle(id)
		}
		return {
			onInsertBelow: () => edit(insertAfter(at(), ""), 0),
			onTurnInto: (type: LibraryBlockType) => {
				if (!isTextBlockType(type)) return
				const blocks = latest.current.blocks
				restructure(
					blocks.map((block) =>
						block.id === id
							? { ...block, source: convertSource(block.source, type) }
							: block,
					),
				)
				edit(id)
			},
			onDuplicate: () => {
				insertAfter(at(), latest.current.blocks[at()].source)
				if (editing !== id) focusHandle(id)
			},
			onMoveUp: () => move(-1),
			onMoveDown: () => move(1),
			onDelete: () => {
				const index = at()
				const blocks = latest.current.blocks
				const neighbour = blocks[index + 1] ?? blocks[index - 1]
				setEditing(undefined)
				setSlashFor(undefined)
				remove(id)
				if (neighbour) focusHandle(neighbour.id)
			},
		}
	}

	const shortcutsFor =
		(id: string) => (event: KeyboardEvent<HTMLDivElement>) => {
			if (event.nativeEvent.isComposing) return
			const actions = actionsFor(id)
			const isCommand = isMacPlatform() ? event.metaKey : event.ctrlKey
			const run = (action: () => void) => {
				event.preventDefault()
				event.stopPropagation()
				action()
			}
			if (
				event.key === "Escape" &&
				editing === id &&
				!event.defaultPrevented &&
				event.currentTarget.contains(event.target as Node)
			)
				run(() => focusHandle(id))
			else if (
				isCommand &&
				event.altKey &&
				event.code === "KeyM" &&
				onStartComment
			)
				run(() => startComment(id, "shortcut"))
			else if (isCommand && event.key.toLowerCase() === "d")
				run(actions.onDuplicate)
			else if (event.altKey && event.shiftKey && event.key === "ArrowUp")
				run(actions.onMoveUp)
			else if (event.altKey && event.shiftKey && event.key === "ArrowDown")
				run(actions.onMoveDown)
			else if (
				(event.key === "Backspace" || event.key === "Delete") &&
				event.target instanceof HTMLButtonElement &&
				event.target.dataset.slot === "library-block-drag"
			)
				run(actions.onDelete)
		}

	const slotAt = (y: number) =>
		[
			...(list.current?.querySelectorAll(
				'[data-slot="library-document-block"]',
			) ?? []),
		].filter((block) => {
			const { top, height } = block.getBoundingClientRect()
			return top + height / 2 < y
		}).length

	const dropAt = (from: number, to: number) => {
		const blocks = latest.current.blocks
		if (to === from || to === from + 1) return
		const target = to > from ? to - 1 : to
		const id = blocks[from].id
		restructure(movedTo(blocks, from, target))
		focusHandle(id)
	}

	const dragPropsOf = (index: number): DragProps => ({
		onPointerDown: (event) => {
			if (event.button !== 0) return
			const start = { y: event.clientY, isMoving: false }
			wasDragged.current = false
			const follow = (move: globalThis.PointerEvent) => {
				if (
					!start.isMoving &&
					Math.abs(move.clientY - start.y) < DRAG_THRESHOLD
				)
					return
				start.isMoving = true
				setDrop({ from: index, to: slotAt(move.clientY) })
			}
			const finish = (end: globalThis.PointerEvent) => {
				window.removeEventListener("pointermove", follow)
				window.removeEventListener("pointerup", finish)
				window.removeEventListener("pointercancel", finish)
				setDrop(undefined)
				wasDragged.current = start.isMoving
				if (start.isMoving && end.type === "pointerup")
					dropAt(index, slotAt(end.clientY))
			}
			window.addEventListener("pointermove", follow)
			window.addEventListener("pointerup", finish)
			window.addEventListener("pointercancel", finish)
		},
		onClickCapture: (event) => {
			if (!wasDragged.current) return
			wasDragged.current = false
			event.preventDefault()
			event.stopPropagation()
		},
	})

	const chooseSlash = (id: string, type: LibrarySlashType) => {
		setSlashFor(undefined)
		writeSource(id, skeletonOf(type, t))
		if (isTextBlockType(type)) edit(id)
		else {
			setEditing(undefined)
			focusHandle(id)
		}
	}

	const typeInField = (block: LibraryBlock, value: string) => {
		if (block.source === "" && value === "/") setSlashFor(block.id)
		else if (slashFor === block.id && !value.startsWith("/"))
			setSlashFor(undefined)
		writeSource(block.id, value)
		if (BLOCK_EDITORS.includes(blockTypeOf(value)))
			setFocusRequest({ id: block.id, on: "field" })
	}

	const leaveBlockEditor =
		(id: string) => (event: FocusEvent<HTMLDivElement>) => {
			const next = event.relatedTarget
			if (
				next instanceof Element &&
				(event.currentTarget.contains(next) ||
					next.closest(`[data-slot="${BLOCK_POPUP}"]`))
			)
				return
			stopEditing(id)
		}

	const editorFor = (block: LibraryBlock, type: LibraryBlockType) => {
		const onEdit = editSource(block.id)
		const { source } = block
		if (type === "checklist")
			return (
				<LibraryChecklistEditor
					onEdit={onEdit}
					onLeave={(kept) => {
						writeSource(block.id, kept)
						edit(insertAfter(indexOf(block.id), ""), 0)
					}}
					onRemove={() => stepBack(block.id)}
					source={source}
				/>
			)
		if (type === "gallery")
			return (
				<LibraryGalleryEditor
					onAddImages={onAddImages}
					onEdit={onEdit}
					onRemove={actionsFor(block.id).onDelete}
					resolveImage={resolveImage}
					source={source}
				/>
			)
		if (type === "callout")
			return <LibraryCalloutEditor onEdit={onEdit} source={source} />
		if (type === "table")
			return <LibraryTableEditor onEdit={onEdit} source={source} />
		if (type === "code")
			return <LibraryCodeEditor onEdit={onEdit} source={source} />
		return (
			<LibraryWebPageEditor
				onEdit={onEdit}
				onLinkPreview={onLinkPreview}
				source={source}
			/>
		)
	}

	const keyInField =
		(block: LibraryBlock, type: BlockTextType) =>
		(event: KeyboardEvent<HTMLDivElement>) => {
			if (event.nativeEvent.isComposing) return
			const index = indexOf(block.id)
			const value = latest.current.blocks[index]?.source ?? block.source
			const range = fieldSelectionOf(event.currentTarget)
			const caret = range?.start ?? value.length
			const selectionEnd = range?.end ?? caret
			const shortcut =
				(event.metaKey || event.ctrlKey) &&
				!event.altKey &&
				SHORTCUT_KEYS.find(
					([key, isShifted]) =>
						event.key.toLowerCase() === key && event.shiftKey === isShifted,
				)
			if (shortcut && caret !== selectionEnd) {
				event.preventDefault()
				const [, , format] = shortcut
				if (format === "link") openLinkField()
				else formatSelected(format)
				return
			}
			if (event.key === "Escape") {
				event.preventDefault()
				if (slashFor === block.id) setSlashFor(undefined)
				else if (shownSelection) setToolbarMode("closed")
				else focusHandle(block.id)
				return
			}
			if (
				event.key === "Backspace" &&
				value === "" &&
				latest.current.blocks.length > 1
			) {
				event.preventDefault()
				stepBack(block.id)
				return
			}
			if (
				event.key === "Backspace" &&
				caret === selectionEnd &&
				caret > 0 &&
				caret === blockTextOf(value, type).lines[0].contentFrom
			) {
				event.preventDefault()
				writeSource(block.id, convertSource(value, "paragraph"))
				setFocusRequest({ id: block.id, on: "field", caret: 0 })
				return
			}
			if (event.key !== "Enter" || event.shiftKey || caret !== selectionEnd)
				return
			event.preventDefault()
			const lineStart = value.lastIndexOf("\n", caret - 1) + 1
			const lineEnd = value.indexOf("\n", caret)
			const line = value.slice(lineStart, lineEnd === -1 ? undefined : lineEnd)
			const marker = type === "paragraph" ? undefined : continuedMarkerOf(line)
			const { before, after, opened } = splitBlockText(value, type, caret)
			if (marker && line.trim() !== marker.trim()) {
				writeSource(block.id, `${before}\n${marker}${after}`)
				setFocusRequest({
					id: block.id,
					on: "field",
					caret: before.length + 1 + marker.length + opened,
				})
				return
			}
			const kept = marker ? value.slice(0, Math.max(lineStart - 1, 0)) : before
			const carried = marker ? "" : after
			writeSource(block.id, kept)
			edit(insertAfter(index, carried), 0)
		}

	const commentLayer = commentLayerOf(doc.blocks, commentProps)

	const renderRun = ({ id, isEnd, children }: MarkdownRunRenderProps) => {
		if (isCommentRun(id))
			return (
				<LibraryDocumentCommentRun id={id} isEnd={isEnd} layer={commentLayer}>
					{children}
				</LibraryDocumentCommentRun>
			)
		if (id.startsWith(PERSON_RUN)) {
			const person = people.find(
				(candidate) => `${PERSON_RUN}${candidate.id}` === id,
			)
			return (
				<>
					{children}
					{person && isEnd ? (
						<LibraryDocumentPersonCaret person={person} />
					) : null}
				</>
			)
		}
		const held = heldRuns.find((run) => `${HELD_RUN}${run.id}` === id)
		if (held) return <HeldWrittenRun run={held}>{children}</HeldWrittenRun>
		const writer = writers.find(({ agent }) => agent.id === id)
		return writer ? (
			<LibraryDocumentWrittenRun
				isEnd={isEnd}
				onOpenConversation={onOpenConversation}
				onStop={onStop}
				writer={writer}
			>
				{children}
			</LibraryDocumentWrittenRun>
		) : (
			children
		)
	}

	const toggleTaskIn = (id: string) => (box: HTMLInputElement) => {
		const block = box.closest('[data-slot="library-document-block"]')
		const boxes = [...(block?.querySelectorAll('input[type="checkbox"]') ?? [])]
		const source = latest.current.blocks[indexOf(id)]?.source
		if (source !== undefined)
			writeSource(id, toggleTask(source, boxes.indexOf(box)))
	}

	const pointAt =
		(hasBlockEditor: boolean) => (event: PointerEvent<HTMLDivElement>) => {
			const point = { x: event.clientX, y: event.clientY }
			const part =
				event.target instanceof Element
					? event.target.closest(POINTED_PARTS)
					: null
			pointed.current = {
				point,
				field: part
					? [...event.currentTarget.querySelectorAll(POINTED_PARTS)].indexOf(
							part,
						)
					: undefined,
				shown: part && hasBlockEditor ? shownOffsetAt(part, point) : undefined,
			}
		}

	const enterPointed = (id: string) => {
		const { field, point, shown } = pointed.current ?? {}
		pointed.current = undefined
		edit(id, undefined, field, point, shown)
	}

	const startEditingOnFocus =
		(id: string, hasBlockEditor: boolean) =>
		(event: FocusEvent<HTMLDivElement>) => {
			const isInnerControl =
				event.target instanceof HTMLButtonElement ||
				event.target instanceof HTMLInputElement
			if (
				event.target !== event.currentTarget &&
				(!hasBlockEditor || isInnerControl)
			)
				return
			if (isCommentMode && selectingBy.current === "pointer") return
			enterPointed(id)
		}

	const enterAtPointer =
		(id: string) => (event: MouseEvent<HTMLDivElement>) => {
			const isControl =
				event.target instanceof Element &&
				event.target.closest(POINTER_CONTROLS) !== null
			if (event.button !== 0 || isControl) return
			event.preventDefault()
			enterPointed(id)
		}

	const focusBlock = (block: LibraryBlock | undefined, caret?: number) => {
		if (!block) return
		const type = blockTypeOf(block.source)
		if (EDITABLE_TYPES.includes(type) || BLOCK_EDITORS.includes(type))
			edit(block.id, caret, caret === undefined ? undefined : 0)
		else focusHandle(block.id)
	}

	useImperativeHandle(ref, () => ({
		focusStart: () => focusBlock(latest.current.blocks[0], 0),
		focusEndAt: (clientY) => {
			const above = [
				...(list.current?.querySelectorAll(BLOCK_SLOT) ?? []),
			].filter((block) => block.getBoundingClientRect().top <= clientY).length
			focusBlock(latest.current.blocks[Math.max(above - 1, 0)])
		},
	}))

	const leaveBody = (event: FocusEvent<HTMLDivElement>) => {
		const next = event.relatedTarget
		if (
			editing &&
			isInToolbar(event.target) &&
			!isInToolbar(next) &&
			next !== textField.current
		)
			stopEditing(editing)
		if (next instanceof Node && event.currentTarget.contains(next)) return
		queueMicrotask(() => {
			if (!list.current?.contains(document.activeElement)) reportCaret(null)
		})
	}

	const offsets = offsetsOf(doc)
	const count = doc.blocks.length

	return (
		<div
			aria-label={t("library.editor.body")}
			className={cn("relative flex flex-col gap-3.5", drop && "select-none")}
			data-comment-mode={isCommentMode || undefined}
			data-slot="library-document-blocks"
			onBlur={leaveBody}
			onClick={isCommentMode ? startCommentAtPointer : undefined}
			onPointerLeave={isCommentMode ? () => setHovered(undefined) : undefined}
			onPointerMove={isCommentMode ? followPointer : undefined}
			ref={list}
			role="group"
		>
			{doc.blocks.map((block, index) => {
				const type = blockTypeOf(block.source)
				const isEditing = editing === block.id
				const hasBlockEditor = BLOCK_EDITORS.includes(type)
				const textType = textTypeOf(type)
				const isEditable = EDITABLE_TYPES.includes(type) || hasBlockEditor
				const runs = [
					...runsIn({
						writers,
						held: heldRuns,
						people,
						start: offsets[index],
						length: block.source.length,
					}),
					...commentRunsIn(commentLayer, block.id),
				]
				const placeholder = placeholderAt(block, offsets[index], anchors)
				const isDropBefore = drop?.to === index
				const isDropAfter = drop?.to === count && index === count - 1
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: the block forwards the shortcuts its field and handle receive
					<div
						className={cn(
							"group/block relative",
							type === "heading" && index > 0 && "mt-2.5",
							isCommentMode && "cursor-none",
						)}
						data-block-id={block.id}
						data-slot="library-document-block"
						data-type={type}
						key={block.id}
						onKeyDown={shortcutsFor(block.id)}
					>
						<div className={cn("absolute end-full top-0", HANDLE_GUTTER)}>
							<LibraryBlockHandle
								{...actionsFor(block.id)}
								canMoveDown={index < count - 1}
								canMoveUp={index > 0}
								conversions={conversionsOf(type)}
								dragProps={dragPropsOf(index)}
								type={type}
							/>
						</div>
						{isEditing && hasBlockEditor ? (
							// biome-ignore lint/a11y/noStaticElementInteractions: the block editor stops when focus leaves every control it holds
							<div
								className={cn(MARKDOWN_CLASS, DOCUMENT_TYPE, "outline-none")}
								data-slot={EDITING_SLOT}
								onBlur={leaveBlockEditor(block.id)}
								tabIndex={-1}
							>
								{editorFor(block, type)}
							</div>
						) : isEditing ? (
							<LibrarySlashMenu
								onChoose={(chosen) => chooseSlash(block.id, chosen)}
								onDismiss={() => setSlashFor(undefined)}
								open={slashFor === block.id}
								query={block.source.slice(1)}
							>
								<LibraryBlockText
									aria-label={t(`library.editor.blocks.types.${type}`)}
									data-slot={FIELD_SLOT}
									fieldRef={textField}
									hint={placeholder}
									onBlur={(event) => {
										if (!isInToolbar(event.relatedTarget)) stopEditing(block.id)
									}}
									onEdit={(value) => typeInField(block, value)}
									onFocus={(event) => {
										if (
											selected?.id === block.id &&
											isInToolbar(event.relatedTarget)
										)
											selectInField(
												event.currentTarget,
												selected.from,
												selected.to,
											)
									}}
									onKeyDown={keyInField(block, textType)}
									source={block.source}
									type={textType}
								/>
							</LibrarySlashMenu>
						) : (
							// biome-ignore lint/a11y/noStaticElementInteractions: focusing a text block opens its field, the keyboard reaches it with Tab
							<div
								className={cn(
									isEditable && "min-h-6 cursor-text outline-none",
									isCommentMode && "cursor-none",
								)}
								data-slot={BODY_SLOT}
								onFocus={
									isEditable
										? startEditingOnFocus(block.id, hasBlockEditor)
										: undefined
								}
								onMouseDown={
									isEditable && !isCommentMode
										? enterAtPointer(block.id)
										: undefined
								}
								onPointerDown={
									isEditable && !isCommentMode
										? pointAt(hasBlockEditor)
										: undefined
								}
								tabIndex={isEditable ? 0 : undefined}
							>
								{placeholder ? (
									<Markdown
										className={DOCUMENT_TYPE}
										resolveImage={resolveImage}
										renderRun={({ isEnd }) =>
											isEnd ? (
												<span
													aria-hidden="true"
													className={PLACEHOLDER_LOOK}
													data-placeholder={placeholder}
													data-slot="library-document-placeholder"
												/>
											) : null
										}
										runs={[
											{
												id: PLACEHOLDER_RUN,
												start: block.source.length,
												end: block.source.length + placeholder.length,
											},
										]}
									>
										{`${block.source}${placeholder}`}
									</Markdown>
								) : (
									<Markdown
										className={DOCUMENT_TYPE}
										onToggleTask={toggleTaskIn(block.id)}
										renderRun={runs.length > 0 ? renderRun : undefined}
										resolveImage={resolveImage}
										runs={runs.length > 0 ? runs : undefined}
									>
										{block.source}
									</Markdown>
								)}
							</div>
						)}
						{isCommentMode && hovered === block.id ? (
							<LibraryDocumentBlockTint />
						) : null}
						<LibraryDocumentBlockComments
							blockId={block.id}
							layer={commentLayer}
						/>
						{isDropBefore || isDropAfter ? (
							<span
								aria-hidden="true"
								className={cn(
									"pointer-events-none absolute inset-x-0 h-0.5 rounded-full bg-primary",
									isDropBefore ? "-top-2" : "-bottom-2",
								)}
								data-slot="library-block-drop-indicator"
							/>
						) : null}
					</div>
				)
			})}
			{shownSelection ? toolbarFor(shownSelection) : null}
			{isCommentMode ? (
				<LibraryDocumentModeCursor
					isShown={hovered !== undefined}
					ref={modeCursor}
				/>
			) : null}
		</div>
	)
}

export {
	LibraryDocumentBlockEditor,
	type LibraryDocumentBlockEditorHandle,
	type LibraryDocumentFormat,
	type LibraryDocumentPlaceholder,
}
