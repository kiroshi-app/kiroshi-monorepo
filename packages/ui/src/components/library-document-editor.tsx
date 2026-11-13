"use client"

import type { TFunction } from "i18next"
import {
	type ComponentProps,
	type MouseEvent,
	type Ref,
	useEffectEvent,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import type { LibraryGalleryImage } from "@workspace/ui/components/library-block-gallery"
import type { LibraryLinkPreview } from "@workspace/ui/components/library-block-web-page"
import {
	type LibraryDocumentPerson,
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	type WriterActions,
} from "@workspace/ui/components/library-document-agents"
import {
	LibraryDocumentBlockEditor,
	type LibraryDocumentBlockEditorHandle,
	type LibraryDocumentFormat,
	type LibraryDocumentPlaceholder,
} from "@workspace/ui/components/library-document-block-editor"
import { shiftedOffset } from "@workspace/ui/components/library-document-blocks"
import {
	DOCUMENT_TITLE,
	GrowingField,
	LibraryDocumentBar,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import type {
	LibraryBarComments,
	LibraryItemActions,
	LibraryMenuSubject,
} from "@workspace/ui/components/library-item-menu"
import type { LibraryDocumentTemplate } from "@workspace/ui/components/library-new-document-dialog"

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

const placeholdersOf = (
	template: LibraryDocumentTemplate | undefined,
	body: string,
	t: TFunction<"common">,
): LibraryDocumentPlaceholder[] => {
	if (body === "")
		return [{ at: 0, text: t("library.templates.blank.placeholder") }]
	const lines = template ? templateLinesOf(template, t) : []
	if (body !== bodyOfLines(lines)) return []

	let at = 0
	return lines.flatMap(({ text, placeholder }) => {
		const from = at
		at += text.length + 1
		return placeholder ? [{ at: from, text: placeholder }] : []
	})
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
	body: bodyOfLines(templateLinesOf(template, t)),
	detail:
		template === "blank"
			? t("library.editor.created")
			: t("library.editor.createdFrom", {
					template: t(`library.templates.${template}.name`),
				}),
})

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

const NATIVE_PRESS =
	'textarea, [contenteditable], button, a, [data-slot="library-document-blocks"]'

const singleLine = (text: string) => text.replace(/\n/g, " ")

type LibraryDocumentRange = {
	start: number
	end: number
}

type FormatAction = (range: LibraryDocumentRange) => void

// TODO: OPE-1774 removes SelectionActions once apps/app stops passing them.
type SelectionActions = {
	onBold?: FormatAction
	onItalic?: FormatAction
	onStrikethrough?: FormatAction
	onCode?: FormatAction
	onLink?: (url: string, range: LibraryDocumentRange) => void
	onHeading?: FormatAction
	onList?: FormatAction
}
const NO_WRITERS: LibraryDocumentWriter[] = []

type LibraryDocumentEditorHandle = {
	focusTitle: () => void
	restoreTitle: (name: string) => void
	titleField: () => HTMLTextAreaElement | null
}

type LibraryDocumentEditorProps = WriterActions &
	SelectionActions &
	LibraryItemActions<LibraryMenuSubject> & {
		title: string
		body: string
		format?: LibraryDocumentFormat
		detail: string
		template?: LibraryDocumentTemplate
		onTitleChange: (title: string) => void
		onTitleConfirm?: (name: string) => void
		onBodyChange: (markdown: string) => void
		onBack: () => void
		writers?: LibraryDocumentWriter[]
		people?: LibraryDocumentPerson[]
		onStopAll?: () => void
		onCaretChange?: (caret: number | null) => void
		onAddImages?: () => Promise<LibraryGalleryImage[]>
		resolveImage?: ComponentProps<
			typeof LibraryDocumentBlockEditor
		>["resolveImage"]
		onLinkPreview?: (url: string) => Promise<LibraryLinkPreview>
		menuFinalFocus?: () => HTMLElement | boolean
		comments?: LibraryBarComments
		ref?: Ref<LibraryDocumentEditorHandle>
	}

const LibraryDocumentEditor = ({
	title: titleProp,
	body,
	format,
	detail,
	template,
	onTitleChange,
	onTitleConfirm,
	onBodyChange,
	onBack,
	writers = NO_WRITERS,
	people,
	onStopAll,
	onStop,
	onOpenConversation,
	onCaretChange,
	onAddImages,
	resolveImage,
	onLinkPreview,
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
	const [restoredTitleSelection, setRestoredTitleSelection] =
		useState<TextSelection>()
	const titleField = useRef<HTMLTextAreaElement>(null)
	const titleAtEditStart = useRef<string>(undefined)
	const blocks = useRef<LibraryDocumentBlockEditorHandle>(null)
	const [placeholders] = useState(() => placeholdersOf(template, body, t))

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
		titleField: () => titleField.current,
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
		if (
			event.button !== 0 ||
			isOnScrollbar ||
			!(event.target instanceof Element) ||
			event.target.closest(NATIVE_PRESS)
		)
			return

		event.preventDefault()
		const titleBottom =
			titleField.current?.getBoundingClientRect().bottom ??
			Number.NEGATIVE_INFINITY
		if (event.clientY <= titleBottom) focusTitleAtEnd()
		else blocks.current?.focusEndAt(event.clientY)
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
	})

	useLayoutEffect(() => {
		if (restoredTitleSelection) restoreTitleSelection(restoredTitleSelection)
	}, [restoredTitleSelection])

	const barItem = useMemo(() => ({ name: title }), [title])

	return (
		<div
			className="relative flex size-full min-h-0 flex-col"
			data-slot="library-document-editor"
		>
			<LibraryDocumentBar
				{...actions}
				item={barItem}
				menuFinalFocus={menuFinalFocus}
				onBack={onBack}
				presence={
					writers.length > 0 || (people?.length ?? 0) > 0 ? (
						<LibraryDocumentPresence
							onStopAll={onStopAll}
							people={people}
							writers={writers}
						/>
					) : null
				}
			/>
			<LibraryDocumentColumn
				detail={detail}
				onColumnMouseDown={writeFromColumn}
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
								blocks.current?.focusStart()
							} else if (event.key === "Escape") {
								event.preventDefault()
								cancelTitleEdit(event.currentTarget)
							}
						}}
						placeholder={t("library.editor.untitled")}
						fieldClassName="placeholder:text-title-placeholder-foreground"
						value={title}
					/>
				}
			>
				<LibraryDocumentBlockEditor
					body={body}
					format={format}
					onAddImages={onAddImages}
					onBodyChange={onBodyChange}
					onCaretChange={onCaretChange}
					onLinkPreview={onLinkPreview}
					onOpenConversation={onOpenConversation}
					onStop={onStop}
					people={people}
					placeholders={placeholders}
					ref={blocks}
					resolveImage={resolveImage}
					writers={writers}
				/>
			</LibraryDocumentColumn>
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
