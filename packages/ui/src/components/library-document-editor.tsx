"use client"

import type { TFunction } from "i18next"
import {
	type KeyboardEvent,
	type Ref,
	type TextareaHTMLAttributes,
	useRef,
	useState,
} from "react"
import { flushSync } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	DOCUMENT_TITLE,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import type { LibraryDocumentTemplate } from "@workspace/ui/components/library-new-document-dialog"
import { formatDateTime } from "@workspace/ui/lib/time-format"
import { cn } from "@workspace/ui/lib/utils"

type BlockKind = "paragraph" | "heading" | "item"

type Block = {
	id: string
	kind: BlockKind
	text: string
	placeholder?: string
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

const blockOf = (
	kind: BlockKind,
	text: string,
	placeholder?: string,
): Block => ({ id: crypto.randomUUID(), kind, text, placeholder })

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

const startingTitle = (
	template: LibraryDocumentTemplate,
	createdAt: Date,
	t: TFunction<"common">,
) =>
	template === "meetingNotes"
		? t("library.templates.meetingNotes.title", {
				day: formatDateTime(createdAt, { day: "numeric" }),
				month: formatDateTime(createdAt, { month: "long" }),
			})
		: ""

const markdownOf = (blocks: Block[]) =>
	blocks
		.filter((block) => block.text.trim() !== "")
		.reduce((markdown, block, index, written) => {
			const line = `${MARKDOWN_PREFIX[block.kind]}${block.text}`
			if (index === 0) return line

			const isListContinued =
				block.kind === "item" && written[index - 1]?.kind === "item"
			return `${markdown}${isListContinued ? "\n" : "\n\n"}${line}`
		}, "")

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

type LibraryDocumentEditorProps = {
	template: LibraryDocumentTemplate
	createdAt: Date
	onTitleChange: (title: string) => void
	onBodyChange: (markdown: string) => void
	onBack: () => void
	onMore?: () => void
}

const LibraryDocumentEditor = ({
	template,
	createdAt,
	onTitleChange,
	onBodyChange,
	onBack,
	onMore,
}: LibraryDocumentEditorProps) => {
	const { t } = useTranslation("common")
	const [title, setTitle] = useState(() =>
		startingTitle(template, createdAt, t),
	)
	const [blocks, setBlocks] = useState(() => startingBlocks(template, t))
	const fields = useRef(new Map<string, HTMLTextAreaElement>())

	const focusAt = (id: string | undefined, caret: number | "end") => {
		const field = id ? fields.current.get(id) : undefined
		if (!field) return

		const position = caret === "end" ? field.value.length : caret
		field.focus()
		field.setSelectionRange(position, position)
	}

	const commit = (next: Block[]) => {
		const markdown = markdownOf(next)
		const hasBodyChanged = markdown !== markdownOf(blocks)
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
				id: block.id,
				kind,
				text: singleLine(value.slice(prefix.length)),
			}),
		)
		focusAt(block.id, Math.max(0, caret - prefix.length))
	}

	const splitAt = (index: number, field: HTMLTextAreaElement) => {
		const block = blocks[index]
		if (!block) return

		if (block.kind === "item" && block.text === "") {
			commit(replaceAt(index, { ...block, kind: "paragraph" }))
			return
		}

		const after = blockOf(
			block.kind === "item" ? "item" : "paragraph",
			block.text.slice(field.selectionEnd),
		)
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
			commit(replaceAt(index, { ...block, kind: "paragraph" }))
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

		return (
			<GrowingField
				aria-label={t(BLOCK_LABEL[block.kind])}
				className={BLOCK_TYPE[block.kind]}
				data-kind={block.kind}
				fieldRef={(node) => {
					if (!node) return
					fields.current.set(block.id, node)
					return () => {
						fields.current.delete(block.id)
					}
				}}
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
			/>
			<LibraryDocumentColumn
				detail={
					template === "blank"
						? t("library.editor.created")
						: t("library.editor.createdFrom", {
								template: t(`library.templates.${template}.name`),
							})
				}
				heading={
					<GrowingField
						aria-label={t("library.editor.title")}
						className={DOCUMENT_TITLE}
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

export { LibraryDocumentEditor, type LibraryDocumentEditorProps }
