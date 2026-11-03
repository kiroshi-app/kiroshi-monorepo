"use client"

import type { TFunction } from "i18next"
import {
	type KeyboardEvent,
	type ReactNode,
	type Ref,
	type TextareaHTMLAttributes,
	useLayoutEffect,
	useRef,
	useState,
} from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import type { LibraryDocumentTemplate } from "@workspace/ui/components/library-new-document-dialog"
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

type WriterPiece = {
	writer: LibraryDocumentWriter
	from: number
	to: number
	isEnd: boolean
}

const piecesOf = (blocks: Block[], writers: LibraryDocumentWriter[]) => {
	const pieces = new Map<string, WriterPiece[]>()
	const lastPieces = new Map<string, WriterPiece>()
	const ordered = writers.toSorted(
		(first, second) => first.start - second.start,
	)
	let offset = 0
	for (const { block, lead } of linesOf(blocks)) {
		const textStart = offset + lead.length
		offset = textStart + block.text.length
		let read = 0
		for (const writer of ordered) {
			const from = Math.max(writer.start, textStart) - textStart
			const to = Math.min(writer.end, offset) - textStart
			if (from >= to || from < read) continue

			const piece = { writer, from, to, isEnd: false }
			pieces.set(block.id, [...(pieces.get(block.id) ?? []), piece])
			lastPieces.set(writer.agent.id, piece)
			read = to
		}
	}
	for (const piece of lastPieces.values()) piece.isEnd = true
	return pieces
}

const drawnTextOf = (
	text: string,
	pieces: WriterPiece[],
	actions: WriterActions,
) => {
	const parts: ReactNode[] = []
	let read = 0
	for (const { writer, from, to, isEnd } of pieces) {
		if (from > read)
			parts.push(
				<span aria-hidden="true" key={`text-${read}`}>
					{text.slice(read, from)}
				</span>,
			)
		parts.push(
			<LibraryDocumentWrittenRun
				{...actions}
				isEnd={isEnd}
				key={`run-${from}`}
				writer={writer}
			>
				<span aria-hidden="true">{text.slice(from, to)}</span>
			</LibraryDocumentWrittenRun>,
		)
		read = to
	}
	parts.push(
		<span aria-hidden="true" key={`text-${read}`}>
			{`${text.slice(read)}​`}
		</span>,
	)
	return parts
}

type FieldSelection = {
	id: string
	start: number
	end: number
	direction: HTMLTextAreaElement["selectionDirection"]
}

const TITLE_FIELD = "title"

const selectionIn = (fields: Map<string, HTMLTextAreaElement>) => {
	for (const [id, field] of fields)
		if (field === document.activeElement)
			return {
				id,
				start: field.selectionStart,
				end: field.selectionEnd,
				direction: field.selectionDirection,
			}
}

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

const singleLine = (text: string) => text.replace(/\n/g, " ")

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
			<span
				className="pointer-events-none col-start-1 row-start-1 whitespace-pre-wrap [&_[data-slot=library-document-caret]]:pointer-events-auto [&_[data-slot=library-document-caret]]:-me-0.5"
				data-slot="library-document-drawn-text"
			>
				{drawnText}
			</span>
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
				drawnText && "[-webkit-text-fill-color:transparent]",
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

type LibraryDocumentEditorProps = WriterActions & {
	title: string
	body: string
	detail: string
	template?: LibraryDocumentTemplate
	onTitleChange: (title: string) => void
	onBodyChange: (markdown: string) => void
	onBack: () => void
	onMore?: () => void
	writers?: LibraryDocumentWriter[]
	onStopAll?: () => void
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
	onStopAll,
	onStop,
	onOpenConversation,
}: LibraryDocumentEditorProps) => {
	const { t } = useTranslation("common")
	const [title, setTitle] = useState(titleProp)
	const [blocks, setBlocks] = useState(() => openingBlocks(body, template, t))
	const [ending, setEnding] = useState(() => endingOf(body))
	const [received, setReceived] = useState({ title: titleProp, body })
	const [restoredSelection, setRestoredSelection] = useState<FieldSelection>()
	const fields = useRef(new Map<string, HTMLTextAreaElement>())

	const focusAt = (id: string | undefined, caret: number | "end") => {
		const field = id ? fields.current.get(id) : undefined
		if (!field) return

		const position = caret === "end" ? field.value.length : caret
		field.focus()
		field.setSelectionRange(position, position)
	}

	const bodyOf = (next: Block[]) => {
		const markdown = markdownOf(next)
		return markdown === "" ? "" : `${markdown}${ending}`
	}

	if (titleProp !== received.title || body !== received.body) {
		setReceived({ title: titleProp, body })
		const nextTitle = titleProp === received.title ? title : titleProp
		const isBodyOutside = body !== received.body && body !== bodyOf(blocks)
		const nextBlocks = isBodyOutside ? reconciled(blocks, body) : blocks
		if (nextTitle !== title || isBodyOutside) {
			const textOf = (id: string, inTitle: string, inBlocks: Block[]) =>
				id === TITLE_FIELD
					? inTitle
					: inBlocks.find((block) => block.id === id)?.text
			const selection = selectionIn(fields.current)
			const before = selection && textOf(selection.id, title, blocks)
			const after = selection && textOf(selection.id, nextTitle, nextBlocks)
			setTitle(nextTitle)
			if (isBodyOutside) {
				setBlocks(
					nextBlocks.length > 0 ? nextBlocks : startingBlocks("blank", t),
				)
				setEnding(endingOf(body))
			}
			if (selection && before !== undefined && after !== undefined)
				setRestoredSelection(shiftedSelection(selection, before, after))
		}
	}

	useLayoutEffect(() => {
		if (!restoredSelection) return
		const { id, start, end, direction } = restoredSelection
		const field = fields.current.get(id)
		if (!field) return

		if (field !== document.activeElement) field.focus({ preventScroll: true })
		field.setSelectionRange(start, end, direction)
	}, [restoredSelection])

	const fieldRefOf = (id: string) => (node: HTMLTextAreaElement | null) => {
		if (!node) return
		fields.current.set(id, node)
		return () => {
			fields.current.delete(id)
		}
	}

	const writerActions = { onStop, onOpenConversation }
	const writerPieces = piecesOf(blocks, writers)

	const commit = (next: Block[]) => {
		const markdown = bodyOf(next)
		const hasBodyChanged = markdown !== bodyOf(blocks)
		flushSync(() => setBlocks(next))
		if (hasBodyChanged) onBodyChange(markdown)
	}

	const replaceAt = (index: number, ...replacement: Block[]) =>
		blocks.toSpliced(index, 1, ...replacement)

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

	const splitAt = (index: number, field: HTMLTextAreaElement) => {
		const block = blocks[index]
		if (!block) return

		if (block.kind === "item" && block.text === "") {
			commit(replaceAt(index, asKind(block, "paragraph")))
			return
		}

		const after =
			block.kind === "item"
				? {
						...blockOf("item", block.text.slice(field.selectionEnd)),
						prefix: block.prefix,
					}
				: blockOf("paragraph", block.text.slice(field.selectionEnd))
		commit(
			replaceAt(
				index,
				{ ...block, text: block.text.slice(0, field.selectionStart) },
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
			commit(replaceAt(index, asKind(block, "paragraph")))
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

	const keyDownIn =
		(index: number) => (event: KeyboardEvent<HTMLTextAreaElement>) => {
			if (event.nativeEvent.isComposing) return

			const field = event.currentTarget
			const isCollapsed = field.selectionStart === field.selectionEnd
			const isAtStart = isCollapsed && field.selectionStart === 0
			const isAtEnd = isCollapsed && field.selectionEnd === field.value.length

			if (event.key === "Enter" && !event.shiftKey) {
				event.preventDefault()
				splitAt(index, field)
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
		const pieces = writerPieces.get(block.id)

		return (
			<GrowingField
				aria-label={t(BLOCK_LABEL[block.kind])}
				className={BLOCK_TYPE[block.kind]}
				data-kind={block.kind}
				drawnText={
					pieces ? drawnTextOf(block.text, pieces, writerActions) : undefined
				}
				fieldRef={fieldRefOf(block.id)}
				key={block.id}
				onChange={(event) =>
					changeText(index, event.target.value, event.target.selectionStart)
				}
				onKeyDown={keyDownIn(index)}
				placeholder={block.placeholder}
				fieldClassName="placeholder:text-placeholder-foreground"
				value={block.text}
			/>
		)
	}

	const untitled = t("library.editor.untitled")

	return (
		<div
			className="flex size-full min-h-0 flex-col"
			data-slot="library-document-editor"
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
					{runsOf(blocks).map((run) =>
						run[0]?.kind === "item" ? (
							<ul
								className="flex list-disc flex-col gap-1.5 ps-[1.5em] text-reading leading-6 marker:text-muted-foreground"
								key={run[0].id}
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
		</div>
	)
}

export {
	LibraryDocumentEditor,
	type LibraryDocumentEditorProps,
	type LibraryDocumentStart,
	libraryDocumentStartOf,
}
