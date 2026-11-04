"use client"

import type { TFunction } from "i18next"
import {
	type FocusEvent,
	type KeyboardEvent,
	type PointerEvent,
	useEffectEvent,
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
	type LibraryLinkPreview,
	LibraryWebPageEditor,
} from "@workspace/ui/components/library-block-web-page"
import {
	type LibraryDocumentPerson,
	LibraryDocumentPersonCaret,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	type BlockIds,
	blockTypeOf,
	continuedMarkerOf,
	conversionsOf,
	convertSource,
	isTextBlockType,
	keepIds,
	type LibraryBlock,
	type LibraryBlockDocument,
	type LibraryBlockType,
	MARKERS,
	movedTo,
	offsetsOf,
	parseBlocks,
	relaid,
	type SourceEdit,
	serializeBlocks,
	toggleTask,
} from "@workspace/ui/components/library-document-blocks"
import { GrowingField } from "@workspace/ui/components/library-document-editor"
import { DOCUMENT_TYPE } from "@workspace/ui/components/library-document-view"
import {
	LibrarySlashMenu,
	type LibrarySlashType,
} from "@workspace/ui/components/library-slash-menu"
import { MARKDOWN_CLASS, Markdown } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"
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

const FIELD_SLOT = "library-document-block-field"

const EDITING_SLOT = "library-document-block-editing"

const FIELD_LOOK: Partial<Record<LibraryBlockType, string>> = {
	heading: "font-heading font-semibold text-[1.0625rem] text-foreground",
}

const DRAG_THRESHOLD = 4

const HANDLE_GUTTER = "me-[clamp(-6px,calc((100cqw-40rem)/2-6px),6px)]"

const PERSON_RUN = "person:"

const NO_WRITERS: LibraryDocumentWriter[] = []

const NO_PEOPLE: LibraryDocumentPerson[] = []

const blockIdsOf = (): BlockIds => {
	let count = 0
	return () => `block-${++count}`
}

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
	field?: number
}

type Drop = {
	from: number
	to: number
}

type RunsInput = {
	writers: LibraryDocumentWriter[]
	people: LibraryDocumentPerson[]
	start: number
	length: number
}

const runsIn = ({ writers, people, start, length }: RunsInput) => [
	...writers.flatMap(({ agent, start: from, end: to }) => {
		const clippedStart = Math.max(from - start, 0)
		const clippedEnd = Math.min(to - start, length)
		return clippedStart < clippedEnd
			? [{ id: agent.id, start: clippedStart, end: clippedEnd }]
			: []
	}),
	...people.flatMap(({ id, caret }) =>
		caret >= start && caret <= start + length
			? [{ id: `${PERSON_RUN}${id}`, start: caret - start, end: caret - start }]
			: [],
	),
]

type LibraryDocumentBlockEditorProps = WriterActions & {
	body: string
	onBodyChange: (markdown: string) => void
	writers?: LibraryDocumentWriter[]
	people?: LibraryDocumentPerson[]
	onAddImages?: () => Promise<LibraryGalleryImage[]>
	onLinkPreview?: (url: string) => Promise<LibraryLinkPreview>
}

const LibraryDocumentBlockEditor = ({
	body,
	onBodyChange,
	writers = NO_WRITERS,
	people = NO_PEOPLE,
	onStop,
	onOpenConversation,
	onAddImages,
	onLinkPreview,
}: LibraryDocumentBlockEditorProps) => {
	const { t } = useTranslation("common")
	const [nextId] = useState(blockIdsOf)
	const withLine = ({ lead, blocks }: LibraryBlockDocument) => ({
		lead,
		blocks:
			blocks.length > 0 ? blocks : [{ id: nextId(), source: "", gap: "" }],
	})
	const [doc, setDoc] = useState(() => withLine(parseBlocks(body, nextId)))
	const latest = useRef(doc)
	const received = useRef(body)
	const [editing, setEditing] = useState<string>()
	const [slashFor, setSlashFor] = useState<string>()
	const [focusRequest, setFocusRequest] = useState<FocusRequest>()
	const [drop, setDrop] = useState<Drop>()
	const wasDragged = useRef(false)
	const pointedField = useRef<number | undefined>(undefined)
	const list = useRef<HTMLDivElement>(null)

	const show = (next: LibraryBlockDocument) => {
		latest.current = next
		setDoc(next)
	}

	const commit = (next: LibraryBlockDocument) => {
		show(next)
		const markdown = serializeBlocks(next)
		received.current = markdown
		onBodyChange(markdown)
	}

	const commitBlocks = (blocks: LibraryBlock[]) =>
		commit(withLine({ ...latest.current, blocks }))

	const restructure = (sources: LibraryBlock[]) =>
		commitBlocks(relaid(latest.current.blocks, sources))

	const reread = (markdown: string) =>
		show(
			withLine(keepIds(latest.current.blocks, parseBlocks(markdown, nextId))),
		)

	const remove = (id: string) =>
		restructure(latest.current.blocks.filter((block) => block.id !== id))

	const takeBody = useEffectEvent((next: string) => {
		if (next === received.current) return
		received.current = next
		if (next !== serializeBlocks(latest.current)) reread(next)
	})

	useLayoutEffect(() => takeBody(body), [body])

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
			...(block?.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>(
				`[data-slot="${FIELD_SLOT}"]`,
			) ?? []),
		]
		const last = fields.length - 1
		const field = fields[Math.min(focusRequest.field ?? last, last)]
		if (!field) {
			block
				?.querySelector<HTMLElement>(`[data-slot="${EDITING_SLOT}"]`)
				?.focus()
			return
		}
		const caret = focusRequest.caret ?? field.value.length
		field.focus()
		field.setSelectionRange(caret, caret)
	}, [focusRequest])

	const indexOf = (id: string) =>
		latest.current.blocks.findIndex((block) => block.id === id)

	const edit = (id: string, caret?: number, field?: number) => {
		setEditing(id)
		setFocusRequest({ id, on: "field", caret, field })
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
		const block = { id: nextId(), source, gap: "" }
		const sources = [...latest.current.blocks]
		sources.splice(index + 1, 0, block)
		restructure(sources)
		return block.id
	}

	const stopEditing = (id: string) => {
		setEditing(undefined)
		setSlashFor(undefined)
		const index = indexOf(id)
		if (index === -1) return
		if (
			latest.current.blocks[index].source.trim() === "" &&
			latest.current.blocks.length > 1
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
				focusHandle(id)
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
		(block: LibraryBlock, type: LibraryBlockType) =>
		(event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.nativeEvent.isComposing) return
			const field = event.currentTarget
			const { value, selectionStart: caret, selectionEnd } = field
			const index = indexOf(block.id)
			if (event.key === "Escape") {
				event.preventDefault()
				if (slashFor === block.id) setSlashFor(undefined)
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
			if (event.key !== "Enter" || event.shiftKey || caret !== selectionEnd)
				return
			event.preventDefault()
			const lineStart = value.lastIndexOf("\n", caret - 1) + 1
			const line = value.slice(lineStart, caret)
			const marker = type === "paragraph" ? undefined : continuedMarkerOf(line)
			if (marker && line.trim() !== marker.trim()) {
				const next = `${value.slice(0, caret)}\n${marker}${value.slice(caret)}`
				writeSource(block.id, next)
				setFocusRequest({
					id: block.id,
					on: "field",
					caret: caret + 1 + marker.length,
				})
				return
			}
			const kept = marker
				? value.slice(0, Math.max(lineStart - 1, 0))
				: value.slice(0, caret)
			const carried = marker ? "" : value.slice(caret)
			writeSource(block.id, kept)
			edit(insertAfter(index, carried), 0)
		}

	const renderRun = ({ id, isEnd, children }: MarkdownRunRenderProps) => {
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

	const pointAt = (event: PointerEvent<HTMLDivElement>) => {
		const part =
			event.target instanceof Element
				? event.target.closest(POINTED_PARTS)
				: null
		pointedField.current = part
			? [...event.currentTarget.querySelectorAll(POINTED_PARTS)].indexOf(part)
			: undefined
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
			edit(id, undefined, pointedField.current)
			pointedField.current = undefined
		}

	const offsets = offsetsOf(doc)
	const count = doc.blocks.length

	return (
		<div
			className={cn("flex flex-col gap-3.5", drop && "select-none")}
			data-slot="library-document-blocks"
			ref={list}
		>
			{doc.blocks.map((block, index) => {
				const type = blockTypeOf(block.source)
				const isEditing = editing === block.id
				const hasBlockEditor = BLOCK_EDITORS.includes(type)
				const isEditable = EDITABLE_TYPES.includes(type) || hasBlockEditor
				const runs = runsIn({
					writers,
					people,
					start: offsets[index],
					length: block.source.length,
				})
				const isDropBefore = drop?.to === index
				const isDropAfter = drop?.to === count && index === count - 1
				return (
					// biome-ignore lint/a11y/noStaticElementInteractions: the block forwards the shortcuts its field and handle receive
					<div
						className={cn(
							"group/block relative",
							type === "heading" && index > 0 && "mt-2.5",
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
								<GrowingField
									aria-label={t(`library.editor.blocks.types.${type}`)}
									className={DOCUMENT_TYPE}
									data-slot={FIELD_SLOT}
									fieldClassName={cn("w-full", FIELD_LOOK[type])}
									onBlur={() => stopEditing(block.id)}
									onChange={(event) => typeInField(block, event.target.value)}
									onKeyDown={keyInField(block, type)}
									value={block.source}
								/>
							</LibrarySlashMenu>
						) : (
							// biome-ignore lint/a11y/noStaticElementInteractions: focusing a text block opens its field, the keyboard reaches it with Tab
							<div
								className={cn(isEditable && "min-h-6 cursor-text outline-none")}
								onFocus={
									isEditable
										? startEditingOnFocus(block.id, hasBlockEditor)
										: undefined
								}
								onPointerDown={isEditable ? pointAt : undefined}
								tabIndex={isEditable ? 0 : undefined}
							>
								<Markdown
									className={DOCUMENT_TYPE}
									onToggleTask={toggleTaskIn(block.id)}
									renderRun={runs.length > 0 ? renderRun : undefined}
									runs={runs.length > 0 ? runs : undefined}
								>
									{block.source}
								</Markdown>
							</div>
						)}
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
		</div>
	)
}

export { LibraryDocumentBlockEditor }
