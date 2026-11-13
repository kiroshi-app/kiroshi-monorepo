import {
	type ComponentType,
	createRef,
	type ReactNode,
	type RefObject,
	useEffect,
	useSyncExternalStore,
} from "react"
import {
	expect,
	fireEvent,
	fn,
	screen,
	spyOn,
	type UserEventObject,
	waitFor,
	within,
} from "storybook/test"

import preview from "@workspace/storybook/preview"
import {
	hueScopeOf,
	isInBrowserRunner,
	realPointer,
	slotIn,
	slotsIn,
} from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import {
	LIBRARY_AGENT_DOCUMENT,
	LIBRARY_AGENTS,
	LIBRARY_WRITERS,
} from "@workspace/ui/components/library.fixtures"
import {
	fieldSelectionOf,
	selectInField,
} from "@workspace/ui/components/library-block-text"
import {
	ATLAS,
	BUDGET_THREAD,
	COMMENT_COUNTS,
	COMMENT_PARTICIPANTS,
	DINNER_PASSAGE,
	DOCUMENT_THREADS,
	MARKET_BLOCK,
	MARKET_PARAGRAPH,
	MARKET_THREAD,
	OFFSITE_DOCUMENT,
	OPEN_THREADS,
	OVERLAP_PASSAGE,
	OVERLAP_THREAD,
	passageIn,
	RESOLVED_SESSION_THREAD,
	SESSION_BLOCK,
	SESSION_PARAGRAPH,
	SESSION_PASSAGE,
	SESSION_THREAD,
	STEVE,
} from "@workspace/ui/components/library-comments.fixtures"
import { LibraryCommentsList } from "@workspace/ui/components/library-comments-list"
import {
	LibraryDocumentEditor,
	type LibraryDocumentEditorHandle,
	type LibraryDocumentEditorProps,
	libraryDocumentStartOf,
} from "@workspace/ui/components/library-document-editor"
import {
	endNotice,
	NoticeSurface,
	raiseFailureNotice,
} from "@workspace/ui/components/notice-surface"
import { RosterProvider } from "@workspace/ui/components/roster"
import { i18n } from "@workspace/ui/lib/i18n"

const t = i18n.getFixedT("en", "common")

const CREATED_ON = new Date(2026, 10, 2)

const BLANK = libraryDocumentStartOf("blank", CREATED_ON, t)

const MEETING_NOTES = libraryDocumentStartOf("meetingNotes", CREATED_ON, t)

const LAUNCH_REVIEW = {
	title: "Launch review",
	detail: "38 words · Edited today at 10:41",
	body: [
		"We met to agree the launch date and who signs off the copy.",
		"## Decisions",
		"- Ship on the 14th\n- Copy is final on the 7th",
		"## Next steps",
		"Screenshots land on the 10th.",
	].join("\n\n"),
}

const ROUND_TRIP = [
	"# Launch plan",
	"## Decisions",
	"### Owners",
	"",
	"- Ship on the **14th**",
	"- Copy is *final* on the 7th",
	"",
	"1. Draft the notes",
	"2. Review with ~~legal~~ design",
	"",
	"- [ ] Book the room",
	"- [x] Send the invite",
	"",
	"> Keep the launch quiet until the 14th.",
	"",
	"```ts",
	"const launch = await ship()",
	"```",
	"",
	"Read the `brief` and the [press kit](https://kiroshi.app/press).",
	"",
].join("\n")

const PLACEHOLDER_INK = "rgb(115, 115, 115)"

const TITLE_PLACEHOLDER_INK = "rgb(82, 82, 82)"

const BLANK_PLACEHOLDER = "Start writing. Use # for a heading and - for a list."

const MEETING_PLACEHOLDERS = [
	"Who was there, and what the meeting was for.",
	"One line per decision, with the reason behind it.",
	"Who does what, and by when.",
]

const placeholdersIn = (root: HTMLElement) =>
	slotsIn(root, "library-document-placeholder").map(
		(shown) => shown.dataset.placeholder,
	)

const placeholderInkIn = (root: HTMLElement) =>
	getComputedStyle(slotIn(root, "library-document-placeholder"), "::before")
		.color

const COMMAND = navigator.userAgent.includes("Mac") ? "Meta" : "Control"

const FIELD = '[data-slot="library-document-block-field"]'

const blocksIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-block")

const typesIn = (canvasElement: HTMLElement) =>
	blocksIn(canvasElement).map((block) => block.dataset.type)

const blockWith = (canvasElement: HTMLElement, text: string) => {
	const block = blocksIn(canvasElement).find((each) =>
		each.textContent?.includes(text),
	)
	if (!block) throw new Error(`No block with ${text}`)
	return block
}

const fieldIn = (canvasElement: HTMLElement) => {
	const field = canvasElement.querySelector<HTMLElement>(FIELD)
	if (!field) throw new Error("No block field")
	return field
}

const focusedFieldIn = (canvasElement: HTMLElement) =>
	waitFor(() => {
		const field = fieldIn(canvasElement)
		expect(field).toHaveFocus()
		return field
	})

const openBlock = (canvasElement: HTMLElement, block: HTMLElement) => {
	const field = block.querySelector<HTMLElement>(FIELD)
	if (field) field.focus()
	else block.querySelector<HTMLElement>("[tabindex]")?.focus()
	return focusedFieldIn(canvasElement)
}

const openBlockWith = (canvasElement: HTMLElement, text: string) =>
	openBlock(canvasElement, blockWith(canvasElement, text))

const shownIn = (field: HTMLElement) => field.textContent ?? ""

const shownPointAt = (field: HTMLElement, at: number) => {
	const walker = document.createTreeWalker(field, NodeFilter.SHOW_TEXT)
	let passed = 0
	for (let node = walker.nextNode(); node; node = walker.nextNode()) {
		const size = node.textContent?.length ?? 0
		if (at <= passed + size) return { node, offset: at - passed }
		passed += size
	}
	throw new Error(`No shown offset ${at}`)
}

const selectShownRange = (field: HTMLElement, from: number, to: number) => {
	const start = shownPointAt(field, from)
	const end = shownPointAt(field, to)
	document
		.getSelection()
		?.setBaseAndExtent(start.node, start.offset, end.node, end.offset)
	return fieldSelectionOf(field)?.start ?? 0
}

const selectIn = (field: HTMLElement, text: string, from = 0) => {
	const start = shownIn(field).indexOf(text, from)
	if (start === -1) throw new Error(`No ${text} in the block`)
	return selectShownRange(field, start, start + text.length)
}

const selectText = async (canvasElement: HTMLElement, text: string) => {
	const field = await openBlockWith(canvasElement, text)
	return { field, start: selectIn(field, text) }
}

const caretAfter = async (canvasElement: HTMLElement, text: string) => {
	const field = await openBlockWith(canvasElement, text)
	const at = shownIn(field).indexOf(text) + text.length
	selectShownRange(field, at, at)
	return field
}

const selectedTextIn = (field: HTMLElement) =>
	field.contains(document.getSelection()?.anchorNode ?? null)
		? (document.getSelection()?.toString() ?? "")
		: ""

const ID_MARKER = /(?:\n\n\^| \^)[a-z0-9]{6}$/gm

const lastBodyOf = (args: LibraryDocumentEditorProps) =>
	(args.onBodyChange as ReturnType<typeof fn>).mock.lastCall?.[0]?.replace(
		ID_MARKER,
		"",
	)

const keyboard = async (keys: string) => (await realPointer()).keyboard(keys)

const pressWithCommand = (keys: string) =>
	keyboard(`{${COMMAND}>}${keys}{/${COMMAND}}`)

const breadcrumbIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector('[aria-current="page"]') as HTMLElement

const leaveBlock = () => keyboard("{Escape}")

type EditorFrameProps = {
	children?: ReactNode
	isNarrow?: boolean
}

const EditorFrame = ({ children, isNarrow = false }: EditorFrameProps) => (
	<div
		className={`flex h-[832px] bg-background ps-15 pe-1.5 pt-2 pb-2 ${isNarrow ? "w-[640px]" : "w-[1280px]"}`}
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>{children}</ContentCard>
	</div>
)

type DocumentDraft = {
	title: string
	body: string
}

const createDraftStore = (start: DocumentDraft) => {
	let draft = start
	const listeners = new Set<() => void>()
	return {
		read: () => draft,
		write: (change: Partial<DocumentDraft>) => {
			draft = { ...draft, ...change }
			for (const listener of listeners) listener()
		},
		reset: () => {
			draft = start
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

type DraftStore = ReturnType<typeof createDraftStore>

const launchReviewDraft = createDraftStore(LAUNCH_REVIEW)

type LiveEditorProps = LibraryDocumentEditorProps & {
	draft: DraftStore
}

const LiveEditor = ({ draft, ...args }: LiveEditorProps) => {
	const { title, body } = useSyncExternalStore(draft.subscribe, draft.read)

	return (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				body={body}
				onBodyChange={(next) => {
					draft.write({ body: next })
					args.onBodyChange(next)
				}}
				onTitleChange={(next) => {
					draft.write({ title: next })
					args.onTitleChange(next)
				}}
				title={title}
			/>
		</EditorFrame>
	)
}

const meta = preview.meta({
	title: "Navigation/LibraryDocumentEditor",
	component: LibraryDocumentEditor,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"A Library document written in place of the read-only view: same bar, same 794 column, same type. The title is a field of its own, the body is `LibraryDocumentBlockEditor`: every top-level markdown block renders as `Markdown` draws it and turns into its markdown source in place when focused, a selection inside it raising the format toolbar. The title leaves as a string through `onTitleChange`, the body as markdown through `onBodyChange`, and the caret as an offset in that markdown through `onCaretChange`.",
			},
		},
	},
	globals: { theme: "dark" },
	args: {
		...BLANK,
		template: "blank" as const,
		onTitleChange: fn(),
		onTitleConfirm: fn(),
		onBodyChange: fn(),
		onBack: fn(),
		onShowInFolder: fn(),
	},
	render: (args) => (
		<EditorFrame>
			<LibraryDocumentEditor {...args} />
		</EditorFrame>
	),
})

export const Blank = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A blank document, as artboard 4 draws it. Check that the empty title reads Untitled in the field and in the breadcrumb, that the body is one empty text block showing its placeholder line in the placeholder ink, at rest and once open, that its field writes in the reading type with no outline and no ring, the caret being its only signal, that typing hides the placeholder and reports only the typed text, and that clearing what was typed brings the placeholder back and reports an empty body.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = canvas.getByRole("textbox", { name: "Title" })
		await expect(title).toHaveAttribute("placeholder", "Untitled")
		await expect(getComputedStyle(title, "::placeholder").color).toBe(
			TITLE_PLACEHOLDER_INK,
		)
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")
		await expect(canvas.getByText("Created just now")).toBeVisible()
		await expect(canvas.getByRole("group", { name: "Document text" })).toBe(
			slotIn(canvasElement, "library-document-blocks"),
		)
		await expect(typesIn(canvasElement)).toEqual(["paragraph"])
		await expect(placeholdersIn(canvasElement)).toEqual([BLANK_PLACEHOLDER])
		await expect(placeholderInkIn(canvasElement)).toBe(PLACEHOLDER_INK)

		await userEvent.type(title, "Q")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Q")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Q")
		await userEvent.type(title, "{Backspace}")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")

		const [line] = blocksIn(canvasElement)
		const field = await openBlock(canvasElement, line as HTMLElement)
		await expect(shownIn(field)).toBe("")
		await expect(placeholdersIn(canvasElement)).toEqual([BLANK_PLACEHOLDER])
		await expect(placeholderInkIn(canvasElement)).toBe(PLACEHOLDER_INK)
		await expect(getComputedStyle(field).fontSize).toBe("15px")
		await expect(getComputedStyle(field).lineHeight).toBe("24px")
		await expect(getComputedStyle(field).outlineStyle).toBe("none")
		await expect(getComputedStyle(field).boxShadow).toBe("none")
		if (!isInBrowserRunner()) return
		await keyboard("Hi")
		await expect(lastBodyOf(args)).toBe("Hi")
		await expect(placeholdersIn(canvasElement)).toEqual([])
		await expect(title).toHaveValue("")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("")
		await keyboard("{Backspace}{Backspace}")
		await expect(lastBodyOf(args)).toBe("")
		await expect(placeholdersIn(canvasElement)).toEqual([BLANK_PLACEHOLDER])
	},
})

const WHITESPACE_TITLE = "   "

export const WhitespaceTitleReadsUntitled = meta.story({
	args: {
		...LAUNCH_REVIEW,
		template: undefined,
		title: WHITESPACE_TITLE,
		onDelete: fn(() => Promise.reject(new Error("Disk is read-only"))),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document whose title holds only spaces. Check that the field keeps the spaces as typed with Untitled as its placeholder, that the breadcrumb, the More menu and its delete confirmation, failure included, all say Untitled, and that Delete still hands the document its own title.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		await expect(title).toHaveValue(WHITESPACE_TITLE)
		await expect(title).toHaveAttribute("placeholder", "Untitled")
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent("Untitled")

		await userEvent.click(canvas.getByRole("button", { name: "More" }))
		const menu = await screen.findByRole("menu", {
			name: "Actions for Untitled",
		})
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Delete" }),
		)
		const confirmation = await screen.findByRole("alertdialog")
		await expect(confirmation).toHaveTextContent("Delete Untitled?")
		await userEvent.click(
			within(confirmation).getByRole("button", { name: "Delete" }),
		)
		await expect(
			await within(confirmation).findByRole("alert"),
		).toHaveTextContent("Couldn’t delete Untitled. Retry.")
		await expect(args.onDelete).toHaveBeenCalledWith({
			name: WHITESPACE_TITLE,
		})
	},
})

const titleHandle = createRef<LibraryDocumentEditorHandle>()

const titleIn = (canvasElement: HTMLElement) =>
	within(canvasElement).getByRole<HTMLTextAreaElement>("textbox", {
		name: "Title",
	})

const titleLookOf = (element: Element) => {
	const style = getComputedStyle(element)
	return {
		fontFamily: style.fontFamily,
		fontSize: style.fontSize,
		fontWeight: style.fontWeight,
		lineHeight: style.lineHeight,
		color: style.color,
	}
}

const pressComposing = (field: HTMLElement, key: string) =>
	field.dispatchEvent(
		new KeyboardEvent("keydown", { key, isComposing: true, bubbles: true }),
	)

export const TitleAtRest = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"The title of an open document, before any edit. Check that it reads the document title in the heading type, with no field border, no outline and no fill, and that nothing is reported.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const title = titleIn(canvasElement)
		await expect(title).toHaveValue("Launch review")
		await expect(title).not.toHaveFocus()
		await expect(titleLookOf(title)).toEqual(
			titleLookOf(title.parentElement as HTMLElement),
		)
		await expect(titleLookOf(title)).toMatchObject({
			fontSize: "28px",
			fontWeight: "600",
			lineHeight: "34px",
		})
		await expect(getComputedStyle(title).borderTopWidth).toBe("0px")
		await expect(getComputedStyle(title).outlineStyle).toBe("none")
		await expect(getComputedStyle(title).backgroundColor).toBe(
			"rgba(0, 0, 0, 0)",
		)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})

export const TitleFocusedByRename = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	render: (args) => (
		<EditorFrame>
			<LibraryDocumentEditor {...args} ref={titleHandle} />
		</EditorFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"The app calls `focusTitle()` on the editor handle, as Rename does. Check that the title takes the focus with the caret collapsed after its last character, that its type, size, colour and bare edges stay those of the title at rest, and that typing goes on from there.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		const atRest = titleLookOf(title)

		titleHandle.current?.focusTitle()
		await expect(title).toHaveFocus()
		await expect(title.selectionStart).toBe("Launch review".length)
		await expect(title.selectionEnd).toBe("Launch review".length)
		await expect(titleLookOf(title)).toEqual(atRest)
		await expect(getComputedStyle(title).borderTopWidth).toBe("0px")
		await expect(getComputedStyle(title).outlineStyle).toBe("none")

		await userEvent.keyboard(" v2")
		await expect(title).toHaveValue("Launch review v2")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2",
		)
	},
})

const renameHandle = createRef<LibraryDocumentEditorHandle>()

const titleFieldOf =
	(handle: RefObject<LibraryDocumentEditorHandle | null>) => () =>
		handle.current?.titleField() ?? false

export const RenameFocusesTitleFromHandle = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onRename: fn() },
	render: (args) => (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				menuFinalFocus={titleFieldOf(renameHandle)}
				ref={renameHandle}
			/>
		</EditorFrame>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Rename picked from More while `menuFinalFocus` returns the handle's `titleField()`, as the app wires it. Check that the title holds focus once the menu closes and that More does not.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		await expect(titleFieldOf(createRef())()).toBe(false)
		const title = titleIn(canvasElement)
		await expect(renameHandle.current?.titleField()).toBe(title)

		const more = canvas.getByRole("button", { name: "More" })
		await userEvent.click(more)
		const menu = await screen.findByRole("menu")
		await userEvent.click(
			within(menu).getByRole("menuitem", { name: "Rename" }),
		)
		await expect(args.onRename).toHaveBeenCalledOnce()
		await waitFor(() => expect(title).toHaveFocus())
		await expect(more).not.toHaveFocus()
	},
})

export const TitleEnterMovesToBody = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Enter in an edited title. Check that Enter during an IME composition leaves the caret in the title and confirms nothing, and that Enter otherwise keeps the edited title, confirms its trimmed name once through `onTitleConfirm`, never again from the blur that follows, and moves the caret to the start of the first block of the body.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		await userEvent.type(title, " v2 ")
		pressComposing(title, "Enter")
		await expect(title).toHaveFocus()
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()

		await userEvent.keyboard("{Enter}")
		const field = await focusedFieldIn(canvasElement)
		await expect(field.closest("[data-slot='library-document-block']")).toBe(
			blocksIn(canvasElement)[0],
		)
		await expect(shownIn(field)).toBe(
			"We met to agree the launch date and who signs off the copy.",
		)
		await expect(fieldSelectionOf(field)).toMatchObject({ start: 0, end: 0 })
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
		await expect(title).toHaveValue("Launch review v2 ")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2 ",
		)
	},
})

export const TitleEscapeRestores = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Escape in an edited title. Check that Escape during an IME composition changes nothing, and that Escape otherwise brings back the title held when the edit started, reports it through `onTitleChange`, leaves the field and confirms nothing through `onTitleConfirm`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)

		await userEvent.type(title, " v2")
		pressComposing(title, "Escape")
		await expect(title).toHaveFocus()
		await expect(title).toHaveValue("Launch review v2")

		await userEvent.keyboard("{Escape}")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")
		await expect(title).not.toHaveFocus()
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()
	},
})

export const TitleClickAwayKeeps = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"An edited title left by a click in the body. Check that the edited title stays, that leaving reports nothing more through `onTitleChange`, and that it confirms the name once through `onTitleConfirm`.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)
		const [intro] = blocksIn(canvasElement)

		await userEvent.type(title, " v2")
		const reportedWhileTyping = (args.onTitleChange as ReturnType<typeof fn>)
			.mock.calls.length
		await userEvent.click(intro as HTMLElement)
		await expect(title).not.toHaveFocus()
		await expect(title).toHaveValue("Launch review v2")
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)
		await expect(args.onTitleChange).toHaveBeenLastCalledWith(
			"Launch review v2",
		)
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
	},
})

export const TitleEmptiedRestores = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A titled document whose title is cleared to spaces, then left. Check that leaving brings back the title held when the edit started and reports it through `onTitleChange`, and that Enter or leaving confirms nothing through `onTitleConfirm`. A document that starts untitled keeps its empty title: see Blank.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)

		await userEvent.clear(title)
		await userEvent.type(title, "   ")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("   ")
		await userEvent.keyboard("{Enter}")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")

		await userEvent.clear(title)
		await userEvent.type(title, "   ")
		await userEvent.click(blockWith(canvasElement, "Next steps"))
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenLastCalledWith("Launch review")
		await expect(args.onTitleConfirm).not.toHaveBeenCalled()
	},
})

const refusedRenameHandle = createRef<LibraryDocumentEditorHandle>()

const refusedRenameDraft = createDraftStore(LAUNCH_REVIEW)

const RefusingRenameEditor = (args: LibraryDocumentEditorProps) => {
	const { title } = useSyncExternalStore(
		refusedRenameDraft.subscribe,
		refusedRenameDraft.read,
	)

	return (
		<EditorFrame>
			<LibraryDocumentEditor
				{...args}
				ref={refusedRenameHandle}
				title={title}
			/>
		</EditorFrame>
	)
}

export const TitleRestoredAfterRefusedRename = meta.story({
	args: {
		...LAUNCH_REVIEW,
		template: undefined,
		onTitleConfirm: fn(() =>
			refusedRenameHandle.current?.restoreTitle(LAUNCH_REVIEW.title),
		),
	},
	beforeEach: refusedRenameDraft.reset,
	render: (args) => <RefusingRenameEditor {...args} />,
	parameters: {
		docs: {
			description: {
				story:
					"A rename the app refuses: it calls `restoreTitle()` on the editor handle with the old name, equal to the title it still passes. Check that the field shows the old name again without reporting it through `onTitleChange` or `onTitleConfirm`, and that a title passed afterwards is shown.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		const title = titleIn(canvasElement)

		await userEvent.type(title, " v2")
		const reportedWhileTyping = (args.onTitleChange as ReturnType<typeof fn>)
			.mock.calls.length
		await userEvent.keyboard("{Enter}")
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
		await expect(args.onTitleConfirm).toHaveBeenCalledWith("Launch review v2")
		await expect(title).toHaveValue("Launch review")
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)

		refusedRenameDraft.write({ title: "Spring launch review" })
		await waitFor(() => expect(title).toHaveValue("Spring launch review"))
		await expect(args.onTitleChange).toHaveBeenCalledTimes(reportedWhileTyping)
		await expect(args.onTitleConfirm).toHaveBeenCalledOnce()
	},
})

export const FromMeetingNotes = meta.story({
	args: { ...MEETING_NOTES, template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"A document from Meeting notes, as artboard 5 draws it. Check that the title is dated, that each empty line of the template is an empty block showing its placeholder in the placeholder ink, at rest and once open, that the headings render without their markers, that leaving an untouched placeholder block reports nothing, and that typing on one writes there and drops only that placeholder, never writing one into the markdown.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(MEETING_NOTES).toEqual({
			title: "Meeting notes, 2 November",
			body: "\n## Decisions\n\n## Next steps\n",
			detail: "Created just now from Meeting notes",
		})
		await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Meeting notes, 2 November",
		)
		await expect(
			canvas.getByText("Created just now from Meeting notes"),
		).toBeVisible()
		await expect(typesIn(canvasElement)).toEqual([
			"paragraph",
			"heading",
			"paragraph",
			"heading",
			"paragraph",
		])
		await expect(placeholdersIn(canvasElement)).toEqual(MEETING_PLACEHOLDERS)
		await expect(placeholderInkIn(canvasElement)).toBe(PLACEHOLDER_INK)
		const decisions = canvas.getByRole("heading", { name: "Decisions" })
		await expect(getComputedStyle(decisions).fontWeight).toBe("600")

		const underDecisions = () => blocksIn(canvasElement)[2] as HTMLElement
		const untouched = await openBlock(canvasElement, underDecisions())
		await expect(placeholdersIn(underDecisions())).toEqual([
			MEETING_PLACEHOLDERS[1],
		])
		untouched.blur()
		await waitFor(() => expect(canvasElement.querySelector(FIELD)).toBe(null))
		await expect(placeholdersIn(canvasElement)).toEqual(MEETING_PLACEHOLDERS)
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		await openBlock(canvasElement, underDecisions())
		await keyboard("Ship")
		await expect(lastBodyOf(args)).toBe("\n## Decisions\nShip\n## Next steps\n")
		await expect(placeholdersIn(canvasElement)).toEqual([
			MEETING_PLACEHOLDERS[0],
			MEETING_PLACEHOLDERS[2],
		])
	},
})

export const WithTypedText = meta.story({
	parameters: {
		docs: {
			description: {
				story:
					"A blank document once written in. Check that Enter starts a new block, that # then a space makes a heading block, that - then a space makes a list Enter carries on, and that the markdown reported is the text typed.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const [line] = blocksIn(canvasElement)
		await openBlock(canvasElement, line as HTMLElement)
		await keyboard(
			"We agreed the date.{Enter}# Decisions{Enter}- Ship on the 14th{Enter}Copy is final on the 7th",
		)
		await expect(lastBodyOf(args)).toBe(
			"We agreed the date.\n\n# Decisions\n\n- Ship on the 14th\n- Copy is final on the 7th",
		)
		await expect(typesIn(canvasElement)).toEqual([
			"paragraph",
			"heading",
			"list",
		])
	},
})

export const ExistingDocument = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A Library document opened to edit, from its title and its markdown. Check that each top-level block of the markdown renders as one block, that nothing is reported before the first edit, and that taking back what was typed reports the body it opened on.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement }) => {
		await expect(canvas.getByRole("textbox", { name: "Title" })).toHaveValue(
			"Launch review",
		)
		await expect(canvas.getByText(LAUNCH_REVIEW.detail)).toBeVisible()
		await expect(typesIn(canvasElement)).toEqual([
			"paragraph",
			"heading",
			"list",
			"heading",
			"paragraph",
		])
		await expect(args.onTitleChange).not.toHaveBeenCalled()
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		if (!isInBrowserRunner()) return
		await caretAfter(canvasElement, "Ship on the 14th")
		await keyboard(", after the review")
		await expect(lastBodyOf(args)).toBe(
			LAUNCH_REVIEW.body.replace(
				"Ship on the 14th",
				"Ship on the 14th, after the review",
			),
		)
		await keyboard("{Backspace}".repeat(", after the review".length))
		await expect(lastBodyOf(args)).toBe(LAUNCH_REVIEW.body)
		await expect(args.onTitleChange).not.toHaveBeenCalled()
	},
})

const DOCUMENT_COLUMN_WIDTH = 794

const DECISIONS_TABLE = {
	title: "Launch decisions",
	detail: "40 words · Edited today at 10:41",
	body: [
		"| Owner | Due | Decision |",
		"| --- | --- | --- |",
		"| Ada | 7 Nov | Copy is final once legal and design have both signed the last draft of the page |",
		"| Noé | 14 Nov | Ship to every Space after the review, with the screenshots in the store listing |",
	].join("\n"),
}

export const ColumnAtMaximumWidth = meta.story({
	args: { ...DECISIONS_TABLE, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A document opened in its tab on a frame wider than the column. Check the article stops at 794 wide, an A4 sheet, centred in the column, the title, the meta line and the body sharing its left edge, and the three-column table showing every cell of its last column in full, without a scroll.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const column = slotIn(canvasElement, "library-document-column")
		const article = column.querySelector("article")
		if (!article) throw new Error("No article in the document column")
		const columnBox = column.getBoundingClientRect()
		const articleBox = article.getBoundingClientRect()
		await expect(columnBox.width).toBeGreaterThan(DOCUMENT_COLUMN_WIDTH + 80)
		await expect(articleBox.width).toBe(DOCUMENT_COLUMN_WIDTH)
		await expect(
			Math.abs(
				articleBox.left - columnBox.left - (columnBox.right - articleBox.right),
			),
		).toBeLessThanOrEqual(1)
		for (const edge of [
			canvas.getByRole("textbox", { name: "Title" }),
			canvas.getByText(DECISIONS_TABLE.detail),
			blocksIn(canvasElement)[0],
		]) {
			await expect(edge.getBoundingClientRect().left).toBe(articleBox.left)
		}

		const table = slotIn(canvasElement, "markdown-table")
		const viewport = table.firstElementChild as HTMLElement
		await expect(viewport.scrollWidth).toBe(viewport.clientWidth)
	},
})

export const RoundTripFixture = meta.story({
	args: {
		title: "Launch plan",
		body: ROUND_TRIP,
		detail: "",
		template: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"A document holding H1 to H3, bullet and numbered lists, tasks, a quote, a fenced code block, bold, italic, strikethrough, inline code and a link. Check that opening and leaving every text block reports nothing, and that a character typed then taken back reports the markdown equal byte for byte to the one the document opened on.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const textBlocks = blocksIn(canvasElement).filter((block) =>
			["paragraph", "heading", "list", "quote"].includes(
				block.dataset.type ?? "",
			),
		)
		for (const block of textBlocks) {
			const field = await openBlock(canvasElement, block)
			field.blur()
			await waitFor(() => expect(canvasElement.querySelector(FIELD)).toBe(null))
		}
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		await openBlockWith(canvasElement, "Launch plan")
		await keyboard("x{Backspace}")
		await expect(args.onBodyChange).toHaveBeenCalledTimes(2)
		await expect(lastBodyOf(args)).toBe(ROUND_TRIP)
	},
})

type PlayContext = {
	args: LibraryDocumentEditorProps
	canvasElement: HTMLElement
}

const lookOf = (canvasElement: HTMLElement, selector: string, text: string) => {
	const shown = [
		...canvasElement.querySelectorAll<HTMLElement>(
			`[data-slot="library-document-block"] ${selector}`,
		),
	].find((candidate) => candidate.textContent === text)
	if (!shown) throw new Error(`No ${selector} reading ${text}`)
	return getComputedStyle(shown)
}

const renderedBlocksStory = (theme: "dark" | "light") => ({
	globals: { theme },
	args: {
		title: "Launch plan",
		body: ROUND_TRIP,
		detail: "",
		template: undefined,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The same document with no block open. Check that each heading, list, task, quote, fence and inline format renders styled with its markers hidden, one block per top-level markdown block, and that opening a block shows its markdown source in place.",
			},
		},
	},
	play: async ({ canvasElement }: PlayContext) => {
		await expect(typesIn(canvasElement)).toEqual([
			"heading",
			"heading",
			"heading",
			"list",
			"list",
			"checklist",
			"quote",
			"code",
			"paragraph",
		])
		const canvas = within(canvasElement)
		for (const [level, name] of [
			[1, "Launch plan"],
			[2, "Decisions"],
			[3, "Owners"],
		] as const)
			await expect(canvas.getByRole("heading", { level, name })).toBeVisible()
		await expect(lookOf(canvasElement, "strong", "14th").fontWeight).toBe("600")
		await expect(lookOf(canvasElement, "em", "final").fontStyle).toBe("italic")
		await expect(lookOf(canvasElement, "del", "legal").textDecorationLine).toBe(
			"line-through",
		)
		await expect(
			canvas
				.getAllByRole("checkbox")
				.map((box) => (box as HTMLInputElement).checked),
		).toEqual([false, true])
		await expect(canvas.getByRole("blockquote")).toHaveTextContent(
			"Keep the launch quiet until the 14th.",
		)
		await expect(lookOf(canvasElement, "code", "brief").fontFamily).toContain(
			"Geist Mono",
		)
		await expect(
			canvas.getByRole("link", { name: "press kit (kiroshi.app)" }),
		).toHaveAttribute("href", "https://kiroshi.app/press")
		await expect(canvasElement.textContent).not.toContain("**14th**")

		const field = await openBlockWith(canvasElement, "Launch plan")
		await expect(shownIn(field)).toBe("Launch plan")
		await expect(field.querySelector("h1")).not.toBeNull()
	},
})

export const BlocksRendered = meta.story({ ...renderedBlocksStory("dark") })

export const BlocksRenderedLight = meta.story({
	...renderedBlocksStory("light"),
})

export const BoldTypedThenRendered = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"Bold typed at the end of a paragraph, then the block left and opened again. Check that the closing markers turn the typed word bold in place with every marker hidden, that the words typed after it stay plain, that the left block renders the word bold, and that opening it again shows the bold word with no marker.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const field = await caretAfter(
			canvasElement,
			"Screenshots land on the 10th.",
		)
		await keyboard(" Then **ship** it.")
		await expect(shownIn(field)).toBe(
			"Screenshots land on the 10th. Then ship it.",
		)
		await expect(field.querySelector("strong")).toHaveTextContent(/^ship$/)
		await expect(lastBodyOf(args)).toBe(
			`${LAUNCH_REVIEW.body} Then **ship** it.`,
		)
		await leaveBlock()
		const block = blockWith(canvasElement, "Then ship it.")
		await expect(block.textContent).not.toContain("**")
		await expect(lookOf(canvasElement, "strong", "ship").fontWeight).toBe("600")

		const reopened = await openBlock(canvasElement, block)
		await expect(shownIn(reopened)).toBe(
			"Screenshots land on the 10th. Then ship it.",
		)
		await expect(reopened.querySelector("strong")).toHaveTextContent(/^ship$/)
	},
})

const TASKS = {
	title: "Launch checklist",
	detail: "",
	template: undefined,
	body: "- [ ] Book the room\n- [x] Send the invite",
}

export const TaskToggle = meta.story({
	args: TASKS,
	parameters: {
		docs: {
			description: {
				story:
					"Two tasks, no block open. Check that clicking an open task's checkbox writes [x] in its line and reports the markdown, and that clicking a done one writes [ ] back.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const boxesIn = () => canvas.getAllByRole("checkbox") as HTMLInputElement[]
		await userEvent.click(boxesIn()[0] as HTMLInputElement)
		await expect(lastBodyOf(args)).toBe(
			"- [x] Book the room\n- [x] Send the invite",
		)
		await userEvent.click(boxesIn()[1] as HTMLInputElement)
		await expect(lastBodyOf(args)).toBe(
			"- [x] Book the room\n- [ ] Send the invite",
		)
		await expect(boxesIn().map((box) => box.checked)).toEqual([true, false])
	},
})

export const OutsideChangeWhileTyping = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} draft={launchReviewDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"Someone else writes in another block while the person types, the body arriving through the same prop the editor reports to. Check that the change lands in its block, that the open field keeps its text and its caret, that typing goes on where it stopped, and that the outside change is never reported back through `onBodyChange`.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const field = await caretAfter(canvasElement, "Ship on the 14th")
		await keyboard(", after the review")
		const typedCount = ", after the review".length
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typedCount)

		launchReviewDraft.write({
			body: launchReviewDraft
				.read()
				.body.replace("on the 10th", "on the 11th")
				.replace("agree the launch", "agree the spring launch"),
		})
		await waitFor(() =>
			expect(blockWith(canvasElement, "on the 11th.")).toBeDefined(),
		)
		await expect(blockWith(canvasElement, "spring launch")).toBeDefined()
		await expect(fieldIn(canvasElement)).toBe(field)
		await expect(field).toHaveFocus()
		await expect(fieldSelectionOf(field)?.start).toBe(
			"- Ship on the 14th, after the review".length,
		)
		await keyboard(" call")
		await expect(lastBodyOf(args)).toBe(
			LAUNCH_REVIEW.body
				.replace("Ship on the 14th", "Ship on the 14th, after the review call")
				.replace("on the 10th", "on the 11th")
				.replace("agree the launch", "agree the spring launch"),
		)
		await expect(args.onBodyChange).toHaveBeenCalledTimes(typedCount + 5)
	},
})

const PASTED = "First thought.\n\nSecond thought.\n\nThird thought."

export const MultiParagraphPaste = meta.story({
	args: { ...MEETING_NOTES, template: "meetingNotes" },
	parameters: {
		docs: {
			description: {
				story:
					"Three paragraphs separated by blank lines, with no leading newline, pasted on the empty line under Decisions. Check that the markdown reported carries them exactly as pasted, and that once the line is left they render as three paragraph blocks.",
			},
		},
	},
	play: async ({ args, canvasElement, userEvent }) => {
		await openBlock(canvasElement, blocksIn(canvasElement)[2] as HTMLElement)
		await userEvent.paste(PASTED)

		const at = "\n## Decisions\n".length
		const expected = `${MEETING_NOTES.body.slice(0, at)}${PASTED}${MEETING_NOTES.body.slice(at)}`
		await expect(lastBodyOf(args)).toBe(expected)
		fieldIn(canvasElement).blur()
		await waitFor(() =>
			expect(typesIn(canvasElement)).toEqual([
				"paragraph",
				"heading",
				"paragraph",
				"paragraph",
				"paragraph",
				"heading",
				"paragraph",
			]),
		)
		await expect(
			blocksIn(canvasElement)
				.slice(2, 5)
				.map((block) => block.textContent),
		).toEqual(["First thought.", "Second thought.", "Third thought."])
		await expect(lastBodyOf(args)).toBe(expected)
	},
})

export const OutsideTitleChange = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	beforeEach: launchReviewDraft.reset,
	render: (args) => <LiveEditor {...args} draft={launchReviewDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"Someone else renames the document while the person types in its title. Check that the field and the breadcrumb show the new title without the editor remounting, that the caret stays after the same character of the person's text, and that the rename is never reported back through `onTitleChange`.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const title = canvas.getByRole("textbox", {
			name: "Title",
		}) as HTMLTextAreaElement
		const typed = " notes"

		await userEvent.type(title, typed)
		await expect(args.onTitleChange).toHaveBeenCalledTimes(typed.length)
		await expect(title.selectionStart).toBe("Launch review notes".length)

		launchReviewDraft.write({ title: "Spring launch review notes" })
		await waitFor(() => expect(title).toHaveValue("Spring launch review notes"))
		await expect(breadcrumbIn(canvasElement)).toHaveTextContent(
			"Spring launch review notes",
		)
		await expect(canvas.getByRole("textbox", { name: "Title" })).toBe(title)
		await expect(document.activeElement).toBe(title)
		await expect(title.value.slice(0, title.selectionStart)).toBe(
			"Spring launch review notes",
		)
		await expect(args.onTitleChange).toHaveBeenCalledTimes(typed.length)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

const caretDraft = createDraftStore(LAUNCH_REVIEW)

export const CaretMoves = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined, onCaretChange: fn() },
	beforeEach: caretDraft.reset,
	render: (args) => <LiveEditor {...args} draft={caretDraft} />,
	parameters: {
		docs: {
			description: {
				story:
					"The person places the caret in the list under Decisions, moves it, someone else writes further down, then the person leaves the body for the title. Check that each placement reports the caret as an offset in the markdown body, that a change elsewhere which leaves that offset unchanged reports nothing again, and that leaving the body reports no caret.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const list = "- Ship on the 14th\n- Copy is final on the 7th"
		const listStart = LAUNCH_REVIEW.body.indexOf(list)
		const at = LAUNCH_REVIEW.body.indexOf("Ship")

		const field = await openBlockWith(canvasElement, "Ship on the 14th")
		await waitFor(() =>
			expect(args.onCaretChange).toHaveBeenLastCalledWith(
				listStart + list.length,
			),
		)
		selectInField(field, at - listStart)
		await waitFor(() => expect(args.onCaretChange).toHaveBeenLastCalledWith(at))
		selectInField(field, at - listStart + 4)
		await waitFor(() =>
			expect(args.onCaretChange).toHaveBeenLastCalledWith(at + 4),
		)

		caretDraft.write({
			body: caretDraft.read().body.replace("on the 10th", "on the 11th"),
		})
		await waitFor(() =>
			expect(blockWith(canvasElement, "on the 11th.")).toBeDefined(),
		)
		await expect(field).toHaveFocus()
		await userEvent.click(canvas.getByRole("textbox", { name: "Title" }))
		await waitFor(() =>
			expect(args.onCaretChange).toHaveBeenLastCalledWith(null),
		)
		await expect(
			(args.onCaretChange as ReturnType<typeof fn>).mock.calls,
		).toEqual([[listStart + list.length], [at], [at + 4], [null]])
	},
})

export const ClickBelowTheLastLine = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	parameters: {
		docs: {
			description: {
				story:
					"A press in the empty space of the column, under the last block and beside a heading. Check that the press below the last block opens it with the caret at its end so typing writes there, that a press beside a block opens that block with the caret at its end, and that a press on a block itself is left to the block.",
			},
		},
	},
	play: async ({ canvasElement, userEvent }) => {
		const column = slotIn(canvasElement, "library-document-column")
		const lastBlock = blocksIn(canvasElement).at(-1)?.getBoundingClientRect()
		if (!lastBlock) throw new Error("No block")
		await expect(column.getBoundingClientRect().bottom).toBeGreaterThan(
			lastBlock.bottom + 80,
		)

		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: column,
			coords: { clientX: lastBlock.left + 40, clientY: lastBlock.bottom + 80 },
		})
		const last = await focusedFieldIn(canvasElement)
		await expect(shownIn(last)).toBe("Screenshots land on the 10th.")
		await expect(fieldSelectionOf(last)?.head).toBe(
			"Screenshots land on the 10th.".length,
		)

		const heading = blockWith(
			canvasElement,
			"Decisions",
		).getBoundingClientRect()
		await userEvent.pointer({
			keys: "[MouseLeft]",
			target: column,
			coords: {
				clientX: column.getBoundingClientRect().left + 8,
				clientY: heading.top + heading.height / 2,
			},
		})
		await waitFor(() =>
			expect(shownIn(fieldIn(canvasElement))).toBe("Decisions"),
		)
		const decisions = await focusedFieldIn(canvasElement)
		await expect(fieldSelectionOf(decisions)?.head).toBe("## Decisions".length)

		if (!isInBrowserRunner()) return
		await (await realPointer()).click(
			blockWith(canvasElement, "who signs off the copy"),
		)
		await waitFor(() =>
			expect(shownIn(fieldIn(canvasElement))).toBe(
				"We met to agree the launch date and who signs off the copy.",
			),
		)
		await expect(fieldIn(canvasElement)).toHaveFocus()
	},
})

const runTextsIn = (canvasElement: HTMLElement) => {
	const texts = new Map<string, string>()
	for (const run of slotsIn(canvasElement, "library-document-run")) {
		const hue = run.closest<HTMLElement>("[data-hue]")?.dataset.hue ?? ""
		texts.set(hue, `${texts.get(hue) ?? ""}${run.textContent}`)
	}
	return Object.fromEntries(texts)
}

const AGENT_RUNS = {
	[LIBRARY_AGENTS.atlas.hue]: "and the agent says why it asks",
	[LIBRARY_AGENTS.mira.hue]:
		"We also count how often someone stops an agent in its",
}

export const AgentsWriting = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: LIBRARY_WRITERS,
		onStopAll: fn(),
		onStop: fn(),
		onOpenConversation: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Atlas and Mira writing in the document while the person has it open to edit, as artboard 4b draws it. Check that the presence pill counts the writers and reports Stop all, that each added run and its named caret land in the block its offsets point at and paint in the agent's own colour, that the hover card reports Stop Mira and Open conversation, and that the written text still takes the person's typing.",
			},
		},
	},
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const presence = slotIn(canvasElement, "library-document-presence")
		await expect(presence).toHaveTextContent("2 agents writing")
		await userEvent.click(canvas.getByRole("button", { name: "Stop all" }))
		await expect(args.onStopAll).toHaveBeenCalledOnce()

		await waitFor(() => expect(runTextsIn(canvasElement)).toEqual(AGENT_RUNS))
		const list = blockWith(canvasElement, "Every document opens")
		const paragraph = blockWith(canvasElement, "We also count")
		const [atlasRun] = slotsIn(list, "library-document-run")
		const [miraRun] = slotsIn(paragraph, "library-document-run")
		await expect(atlasRun).toHaveTextContent("and the agent says why it asks")
		await expect(
			getComputedStyle(atlasRun as HTMLElement).backgroundColor,
		).not.toBe(getComputedStyle(miraRun as HTMLElement).backgroundColor)
		await expect(slotsIn(list, "library-document-caret")).toHaveLength(1)
		await expect(slotsIn(paragraph, "library-document-caret")).toHaveLength(1)
		const carets = slotsIn(canvasElement, "library-document-caret")
		await expect(carets).toHaveLength(2)
		await expect(
			(carets[0] as HTMLElement).getBoundingClientRect(),
		).toMatchObject({
			width: 2,
			height: 24,
		})

		const flag = screen.getByRole("button", { name: "Mira is writing" })
		await expect(flag).toHaveTextContent("Mira")
		await expect(flag.getBoundingClientRect().height).toBe(20)
		await userEvent.hover(flag)
		const card = await screen.findByRole("dialog", {
			name: "Mira is writing…",
		})
		await expect(card).toHaveAttribute(
			"data-hue",
			String(LIBRARY_AGENTS.mira.hue),
		)
		await expect(card).toHaveTextContent(
			"1 sentence added to “What we measure”",
		)
		await userEvent.click(screen.getByRole("button", { name: "Stop Mira" }))
		await expect(args.onStop).toHaveBeenCalledWith(LIBRARY_AGENTS.mira)
		await userEvent.click(
			screen.getByRole("button", { name: "Open conversation" }),
		)
		await expect(args.onOpenConversation).toHaveBeenCalledWith(
			LIBRARY_AGENTS.mira,
		)

		if (!isInBrowserRunner()) return
		await caretAfter(canvasElement, "stops an agent in its")
		await keyboard(" tracks")
		await expect(lastBodyOf(args)).toBe(
			LIBRARY_AGENT_DOCUMENT.body.replace(
				"stops an agent in its",
				"stops an agent in its tracks",
			),
		)
	},
})

const ATLAS_WRITERS = LIBRARY_WRITERS.slice(0, 1)

const createWritersStore = () => {
	let writers = ATLAS_WRITERS
	const listeners = new Set<() => void>()
	const write = (next: typeof ATLAS_WRITERS) => {
		writers = next
		for (const listener of listeners) listener()
	}
	return {
		read: () => writers,
		finish: () => write([]),
		resume: () => write(ATLAS_WRITERS),
		reset: () => {
			writers = ATLAS_WRITERS
		},
		subscribe: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
	}
}

type WritersStore = ReturnType<typeof createWritersStore>

type FinishingWriterEditorProps = LibraryDocumentEditorProps & {
	writing: WritersStore
}

const FinishingWriterEditor = ({
	writing,
	...args
}: FinishingWriterEditorProps) => {
	const writers = useSyncExternalStore(writing.subscribe, writing.read)
	return (
		<EditorFrame>
			<LibraryDocumentEditor {...args} writers={writers} />
		</EditorFrame>
	)
}

const after = (milliseconds: number) =>
	new Promise((resolve) => setTimeout(resolve, milliseconds))

const atlasRunIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-run").find(
		(run) =>
			run.closest<HTMLElement>("[data-hue]")?.dataset.hue ===
			String(LIBRARY_AGENTS.atlas.hue),
	)

const heldRunIn = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "library-document-held-run").find(
		(run) =>
			run.closest<HTMLElement>("[data-hue]")?.dataset.hue ===
			String(LIBRARY_AGENTS.atlas.hue),
	)

const agentCaretIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector("[data-slot='library-document-caret']")

const HELD_RUN_ARGS = {
	title: LIBRARY_AGENT_DOCUMENT.name,
	body: LIBRARY_AGENT_DOCUMENT.body,
	detail: LIBRARY_AGENT_DOCUMENT.detail,
	template: undefined,
	onStopAll: fn(),
}

const stopWriting = async (
	canvasElement: HTMLElement,
	writing: WritersStore,
) => {
	const run = await waitFor(() => {
		const shown = atlasRunIn(canvasElement)
		expect(shown).toBeDefined()
		return getComputedStyle(shown as HTMLElement)
	})
	const writtenLook = { backgroundColor: run.backgroundColor, color: run.color }
	writing.finish()
	const stoppedAt = performance.now()
	await waitFor(() => expect(agentCaretIn(canvasElement)).toBe(null))
	return {
		writtenLook,
		atSinceStop: (milliseconds: number) =>
			after(milliseconds - (performance.now() - stoppedAt)),
		sinceStop: () => performance.now() - stoppedAt,
	}
}

const expectWrittenLook = async (
	canvasElement: HTMLElement,
	writtenLook: Pick<CSSStyleDeclaration, "backgroundColor" | "color">,
) => {
	const held = heldRunIn(canvasElement)
	await expect(held).toBeDefined()
	await expect(getComputedStyle(held as HTMLElement)).toMatchObject(writtenLook)
}

const atlasWriting = createWritersStore()

export const AgentRunHeldThenFades = meta.story({
	args: HELD_RUN_ARGS,
	beforeEach: atlasWriting.reset,
	render: (args) => <FinishingWriterEditor {...args} writing={atlasWriting} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing, as artboard 4c draws it: the presence gone, his finished run held. Check that the presence pill leaves with him, that his run keeps its written look in its block for 3 seconds after he leaves, then its highlight fades out over a second while the text stays fully opaque, and that it is gone after that. With reduced motion the run leaves at 3 seconds without a fade.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			atlasWriting,
		)
		await expect(
			canvasElement.querySelector("[data-slot='library-document-presence']"),
		).toBe(null)
		await expect(
			blockWith(canvasElement, "Every document opens").contains(
				heldRunIn(canvasElement) ?? null,
			),
		).toBe(true)
		await atSinceStop(2000)
		await expectWrittenLook(canvasElement, writtenLook)

		await waitFor(() => expect(heldRunIn(canvasElement)).toBeUndefined(), {
			timeout: 2500,
		})
	},
})

const typedDuringHold = createWritersStore()

export const HeldRunKeptWhileTyping = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: typedDuringHold.reset,
	render: (args) => (
		<FinishingWriterEditor {...args} writing={typedDuringHold} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing and the person types inside his run one second later, then leaves the block. Check that the run takes the typed text and keeps its written look two seconds after the stop.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			typedDuringHold,
		)
		if (!isInBrowserRunner()) return
		await atSinceStop(1000)
		await caretAfter(canvasElement, "and the agent")
		await keyboard(" truly")
		await leaveBlock()
		await waitFor(() =>
			expect(heldRunIn(canvasElement)?.textContent).toContain("truly"),
		)

		await atSinceStop(2000)
		await expectWrittenLook(canvasElement, writtenLook)
		await expect(heldRunIn(canvasElement)?.textContent).toContain("truly")
	},
})

const resumedDuringHold = createWritersStore()

export const HeldRunRestartedByAgent = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: resumedDuringHold.reset,
	render: (args) => (
		<FinishingWriterEditor {...args} writing={resumedDuringHold} />
	),
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing, writes into his held run again two seconds later, then stops again. Check that the run starts a fresh hold and keeps its written look four seconds after the first stop.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { writtenLook, atSinceStop } = await stopWriting(
			canvasElement,
			resumedDuringHold,
		)
		await atSinceStop(2000)
		resumedDuringHold.resume()
		await waitFor(() => expect(agentCaretIn(canvasElement)).not.toBe(null))
		resumedDuringHold.finish()
		await waitFor(() => expect(agentCaretIn(canvasElement)).toBe(null))

		await atSinceStop(4000)
		await expectWrittenLook(canvasElement, writtenLook)
	},
})

const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)"

const fadingRun = createWritersStore()

export const HeldRunFadesWithMotion = meta.story({
	tags: ["test-only"],
	args: HELD_RUN_ARGS,
	beforeEach: () => {
		fadingRun.reset()
		const matchMedia = window.matchMedia.bind(window)
		const motion = spyOn(window, "matchMedia").mockImplementation((query) =>
			matchMedia(query === REDUCED_MOTION_QUERY ? "not all" : query),
		)
		return () => motion.mockRestore()
	},
	render: (args) => <FinishingWriterEditor {...args} writing={fadingRun} />,
	parameters: {
		docs: {
			description: {
				story:
					"Atlas stops writing while reduced motion is off. Check that his held run takes the fade class between three and four seconds after the stop, and that it is gone by four and a half seconds.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const { sinceStop } = await stopWriting(canvasElement, fadingRun)
		await waitFor(
			() => expect(heldRunIn(canvasElement)).toHaveClass("animate-run-fade"),
			{ timeout: 4000 },
		)
		await expect(sinceStop()).toBeGreaterThanOrEqual(3000)
		await expect(sinceStop()).toBeLessThan(4000)

		await waitFor(() => expect(heldRunIn(canvasElement)).toBeUndefined(), {
			timeout: 4500 - sinceStop(),
		})
	},
})

const LEA = {
	id: "lea",
	name: "Léa Martin",
	caret: LIBRARY_AGENT_DOCUMENT.body.indexOf("Weekly active"),
}

export const PersonCaretBesideAgent = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
		writers: ATLAS_WRITERS,
		people: [LEA],
		onStopAll: fn(),
	},
	parameters: {
		docs: {
			description: {
				story:
					"Léa has the document open beside the person while Atlas writes. Check that her named caret stands at the start of the block her caret points at, that it takes no width in the line, and that Atlas keeps his own caret at the end of his run.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const caret = await within(
			slotIn(canvasElement, "library-document-column"),
		).findByRole("img", { name: "Léa Martin" })
		await expect(caret).toHaveAttribute(
			"data-slot",
			"library-document-person-caret",
		)
		const block = blockWith(canvasElement, "Weekly active Spaces")
		await expect(block.contains(caret)).toBe(true)
		await expect(caret.getBoundingClientRect().left).toBeCloseTo(
			block.getBoundingClientRect().left,
			0,
		)
		await expect(slotsIn(canvasElement, "library-document-caret")).toHaveLength(
			1,
		)
		await expect(
			canvas.getByRole("button", { name: "Atlas is writing" }),
		).toBeVisible()
	},
})

const PEOPLE = [
	LEA,
	{ id: "noah", name: "Noah", caret: 0 },
	{ id: "ines", name: "Inès", caret: 0 },
]

const PAST_STACK_LIMIT = { id: "sam", name: "Sam", caret: 0 }

const PRESENCE_ARGS = {
	title: LIBRARY_AGENT_DOCUMENT.name,
	body: LIBRARY_AGENT_DOCUMENT.body,
	detail: LIBRARY_AGENT_DOCUMENT.detail,
	template: undefined,
	onStopAll: fn(),
}

const barIn = (canvasElement: HTMLElement) =>
	within(
		breadcrumbIn(canvasElement).closest("nav")?.parentElement as HTMLElement,
	)

const WRITING_COUNT = /agents? writing/

const expectPeopleInBar = async (
	canvasElement: HTMLElement,
	names: string[],
) => {
	const bar = barIn(canvasElement)
	const avatars = await bar.findAllByRole("img")
	await expect(names.map((name) => bar.getByRole("img", { name }))).toEqual(
		avatars,
	)
}

export const PresencePeopleOnly = meta.story({
	args: { ...PRESENCE_ARGS, people: [...PEOPLE, PAST_STACK_LIMIT] },
	parameters: {
		docs: {
			description: {
				story:
					"Four people have the document open and no agent writes. Check that the bar draws the first three as round avatars named by the person, in order, with no presence pill, no writing count and no Stop all.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectPeopleInBar(
			canvasElement,
			PEOPLE.map(({ name }) => name),
		)
		const bar = barIn(canvasElement)
		await expect(
			bar.queryByRole("img", { name: PAST_STACK_LIMIT.name }),
		).toBeNull()
		await expect(bar.queryByText(WRITING_COUNT)).toBeNull()
		await expect(bar.queryByRole("button", { name: "Stop all" })).toBeNull()
	},
})

export const PresenceAgentsOnly = meta.story({
	args: { ...PRESENCE_ARGS, writers: LIBRARY_WRITERS },
	parameters: {
		docs: {
			description: {
				story:
					"Agents write and nobody else has the document open. Check that the bar shows the presence pill with its writing count and no person avatar.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const bar = barIn(canvasElement)
		await expect(
			await bar.findByText(`${LIBRARY_WRITERS.length} agents writing`),
		).toBeVisible()
		await expect(bar.queryAllByRole("img")).toHaveLength(0)
	},
})

export const PresenceAgentsAndPeople = meta.story({
	args: { ...PRESENCE_ARGS, writers: ATLAS_WRITERS, people: PEOPLE },
	parameters: {
		docs: {
			description: {
				story:
					"Atlas writes while three people have the document open. Check that the people stack stands right before the presence pill, outside it, and that the pill still reads 1 agent writing.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		await expectPeopleInBar(
			canvasElement,
			PEOPLE.map(({ name }) => name),
		)
		const bar = barIn(canvasElement)
		await expect(bar.getByText("1 agent writing")).toBeVisible()
		const people = slotIn(canvasElement, "library-document-people")
		await expect(people.nextElementSibling).toBe(
			slotIn(canvasElement, "library-document-presence"),
		)
	},
})

type FailureNoticeProps = {
	entry: "create" | "open" | "save" | "write" | "caret"
}

const DocumentFailureNotice = ({ entry }: FailureNoticeProps) => {
	useEffect(() => {
		const notice = raiseFailureNotice({
			title: i18n.t(`common:library.failure.document.${entry}`, {
				name: LIBRARY_AGENTS.atlas.name,
			}),
		})
		return () => endNotice(notice)
	}, [entry])

	return <NoticeSurface />
}

const failureStory = (
	entry: FailureNoticeProps["entry"],
	title: string,
	story: string,
) => ({
	decorators: [
		(Story: ComponentType) => (
			<>
				<Story />
				<DocumentFailureNotice entry={entry} />
			</>
		),
	],
	parameters: { docs: { description: { story } } },
	play: async () => {
		const shown = await waitFor(() => slotIn(document.body, "toast-title"))
		await expect(shown).toHaveTextContent(title)
	},
})

export const CreateFailure = meta.story({
	render: () => <EditorFrame />,
	...failureStory(
		"create",
		"Couldn’t create the document. Try again from New document.",
		"The notice raised when a new document could not be created on the host of its Space, from `common:library.failure.document.create`. Check that it names what failed and sends the person back to New document.",
	),
})

export const OpenFailure = meta.story({
	render: () => <EditorFrame />,
	...failureStory(
		"open",
		"Couldn’t open the document. Open it again from the Library.",
		"The notice raised when a Library document could not be opened, from `common:library.failure.document.open`. Check that it names what failed and sends the person back to the Library.",
	),
})

export const SaveFailure = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	...failureStory(
		"save",
		"Couldn’t save your last changes. Keep the document open and edit again to retry.",
		"The notice raised over the open editor when the last edits did not reach the host, from `common:library.failure.document.save`. Check that it names what failed and tells the person to keep the document open and edit again.",
	),
})

export const WriteFailure = meta.story({
	args: {
		title: LIBRARY_AGENT_DOCUMENT.name,
		body: LIBRARY_AGENT_DOCUMENT.body,
		detail: LIBRARY_AGENT_DOCUMENT.detail,
		template: undefined,
	},
	...failureStory(
		"write",
		"Atlas stopped writing before it finished. Ask again from the conversation.",
		"The notice raised over the open editor when an agent's write broke off before it finished, from `common:library.failure.document.write`, which takes the agent's name. Check that it names the agent and sends the person back to the conversation.",
	),
})

export const CaretShareFailure = meta.story({
	args: { ...LAUNCH_REVIEW, template: undefined },
	...failureStory(
		"caret",
		"Couldn’t show others where you are in the document. Keep editing to try again.",
		"The notice raised over the open editor when sharing the person's caret was refused, from `common:library.failure.document.caret`. Check that it names what failed and tells the person to keep editing.",
	),
})

const SELECTION_OPENING =
	"We met to agree the launch date and who signs off the copy before the screenshots land, so the press kit and the store listing go out together on the same morning."

const SELECTION_DOCUMENT = {
	title: LAUNCH_REVIEW.title,
	detail: LAUNCH_REVIEW.detail,
	template: undefined,
	body: [
		SELECTION_OPENING,
		"## Decisions",
		"- Ship on the **14th**\n- Copy is final on the 7th",
		"## Next steps",
		"Screenshots land on the 10th.",
	].join("\n\n"),
}

const SELECTION_ACTIONS = {
	onBold: fn(),
	onItalic: fn(),
	onStrikethrough: fn(),
	onCode: fn(),
	onLink: fn(),
	onHeading: fn(),
	onList: fn(),
}

const SELECTION_GAP = 8

const LAUNCH_DATE = "the launch date"

const toolbarIn = (canvasElement: HTMLElement) =>
	canvasElement.querySelector<HTMLElement>('[data-slot="selection-toolbar"]')

const selectionRect = () =>
	document.getSelection()?.getRangeAt(0).getBoundingClientRect() ??
	new DOMRect()

const expectToolbarAbove = async (
	canvasElement: HTMLElement,
	selection = selectionRect(),
) => {
	await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
	const toolbar = toolbarIn(canvasElement)?.getBoundingClientRect()
	if (!toolbar) throw new Error("No toolbar")
	await expect(
		Math.abs(
			(toolbar.left + toolbar.right) / 2 -
				(selection.left + selection.right) / 2,
		),
	).toBeLessThan(1)
	await expect(
		Math.abs(selection.top - toolbar.bottom - SELECTION_GAP),
	).toBeLessThan(1)
}

const selectionStory = (story: string) => ({
	args: { ...SELECTION_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: { docs: { description: { story } } },
})

export const FormatWithoutChange = meta.story({
	...selectionStory(
		"The person confirms an empty link on plain text in a block, which changes nothing. Check that the empty link reports nothing, keeps the markdown of the block as it was, and leaves the toolbar on its bar.",
	),
	play: async ({ args, canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { field } = await selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		await pressWithCommand("k")
		await expect(
			canvas.getByRole("textbox", { name: "Link address" }),
		).toHaveFocus()
		await keyboard("{Enter}")
		await expect(args.onBodyChange).not.toHaveBeenCalled()
		await expect(shownIn(field)).toBe(SELECTION_OPENING)
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()
	},
})

export const A1ToolbarAboveSelection = meta.story({
	...selectionStory(
		"Artboard A1: a few words selected on one line of a paragraph block. Check that the toolbar sits centred on the selection 8px above it, over every caret and flag, that a pointer press on Bold turns the selected words bold in the markdown of that block, reports the new markdown and keeps the same words selected, never calling `onBold`, and that the toolbar leaves when the selection collapses or moves to the title.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { start } = await selectText(canvasElement, LAUNCH_DATE)
		await expectToolbarAbove(canvasElement)
		await expect(
			getComputedStyle(toolbarIn(canvasElement) as HTMLElement).zIndex,
		).toBe("10")

		const toolbar = canvas.getByRole("toolbar", { name: "Format" })
		await expect(
			within(toolbar)
				.getAllByRole("button")
				.map((button) => button.getAttribute("aria-label")),
		).toEqual([
			"Bold",
			"Italic",
			"Strikethrough",
			"Code",
			"Link",
			"Heading",
			"List",
		])

		await userEvent.click(within(toolbar).getByRole("button", { name: "Bold" }))
		const bolded = SELECTION_DOCUMENT.body.replace(
			LAUNCH_DATE,
			`**${LAUNCH_DATE}**`,
		)
		await expect(lastBodyOf(args)).toBe(bolded)
		await expect(args.onBold).not.toHaveBeenCalled()
		const field = fieldIn(canvasElement)
		await expect(field).toHaveFocus()
		await expect(shownIn(field)).toBe(SELECTION_OPENING)
		await expect(field.querySelector("strong")).toHaveTextContent(LAUNCH_DATE)
		await waitFor(() => expect(selectedTextIn(field)).toBe(LAUNCH_DATE))

		selectInField(field, start)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))
		selectIn(field, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		const title = titleIn(canvasElement)
		title.focus()
		title.setSelectionRange(0, 6)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))

		await selectText(canvasElement, LAUNCH_DATE)
		await expectToolbarAbove(canvasElement)
	},
})

export const A2ToolbarOverTwoLines = meta.story({
	...selectionStory(
		"Artboard A2: a selection running from the first line of a paragraph onto the second. Check that the toolbar centres on the box holding both selected lines and sits 8px above its top.",
	),
	play: async ({ canvasElement }) => {
		await selectText(
			canvasElement,
			"who signs off the copy before the screenshots land, so the press kit and the store",
		)
		await expect(selectionRect().height).toBeGreaterThan(40)
		await expectToolbarAbove(canvasElement)
	},
})

export const A3ToolbarButtonHover = meta.story({
	args: { ...SELECTION_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A3: the pointer rests on Bold. Check that Bold changes fill with no colour transition, and that its tooltip names it with its shortcut, with no arrow, 14px above the button.",
			},
		},
	},
	play: async ({ canvas, canvasElement, userEvent }) => {
		await selectText(canvasElement, LAUNCH_DATE)
		const bold = await canvas.findByRole("button", { name: "Bold" })
		await expect(getComputedStyle(bold).transitionProperty).toBe("none")
		await userEvent.hover(bold)
		const tooltip = await screen.findByRole("tooltip")
		await expect(tooltip).toHaveTextContent("Bold⌘B")
		await expect(
			[...tooltip.children]
				.filter((child) => child.checkVisibility())
				.map((child) => child.tagName),
		).toEqual(["KBD"])
		await expect(
			bold.getBoundingClientRect().top - tooltip.getBoundingClientRect().bottom,
		).toBeCloseTo(14, 0)
	},
})

export const A4ToolbarFormatOn = meta.story({
	...selectionStory(
		"Artboard A4: a selection inside bold text in a list block. Check that Bold and List wear the Space colour and report themselves pressed, while every other button stays off.",
	),
	play: async ({ canvas, canvasElement }) => {
		await selectText(canvasElement, "14th")
		const toolbar = await canvas.findByRole("toolbar", { name: "Format" })
		const pressed = within(toolbar)
			.getAllByRole("button")
			.filter((button) => button.getAttribute("aria-pressed") === "true")
			.map((button) => button.getAttribute("aria-label"))
		await expect(pressed).toEqual(["Bold", "List"])
		await expectToolbarAbove(canvasElement)
	},
})

export const A5ToolbarLinkField = meta.story({
	...selectionStory(
		"Artboard A5: Link pressed, the bar gives way to the link field at the same place. Check that the field takes focus, that Escape returns to the bar without linking, and that Enter links the selected words to the typed url in the markdown of the block, never calling `onLink`, and returns to the bar.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { field } = await selectText(canvasElement, LAUNCH_DATE)
		const openLinkField = async () => {
			await userEvent.click(await canvas.findByRole("button", { name: "Link" }))
			const link = canvas.getByRole("textbox", { name: "Link address" })
			await expect(document.activeElement).toBe(link)
			return link
		}

		await userEvent.type(await openLinkField(), "https://kiroshi.app/brief")
		await userEvent.keyboard("{Escape}")
		await expect(args.onBodyChange).not.toHaveBeenCalled()
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()

		await userEvent.type(
			await openLinkField(),
			"https://kiroshi.app/brief{Enter}",
		)
		const linked = SELECTION_DOCUMENT.body.replace(
			LAUNCH_DATE,
			`[${LAUNCH_DATE}](https://kiroshi.app/brief)`,
		)
		await expect(lastBodyOf(args)).toBe(linked)
		await expect(args.onLink).not.toHaveBeenCalled()
		await expect(fieldIn(canvasElement)).toBe(field)
		await expect(selectedTextIn(field)).toBe(LAUNCH_DATE)
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()

		const linkedWords = selectionRect()
		await userEvent.type(await openLinkField(), "https://kiroshi.app/brief")
		await expect(toolbarIn(canvasElement)?.getBoundingClientRect().width).toBe(
			340,
		)
		await expectToolbarAbove(canvasElement, linkedWords)
	},
})

const FLIPPED_DOCUMENT = {
	...SELECTION_DOCUMENT,
	body: [
		SELECTION_DOCUMENT.body,
		...Array.from(
			{ length: 40 },
			(_, index) =>
				`Week ${index + 1} brings the next round of screenshots and copy.`,
		),
	].join("\n\n"),
}

export const A6ToolbarFlippedBelow = meta.story({
	args: { ...FLIPPED_DOCUMENT, ...SELECTION_ACTIONS },
	parameters: {
		docs: {
			description: {
				story:
					"Artboard A6: the document scrolled until the selected block sits just under the top of the column, with no room above it for the toolbar. Check that the toolbar flips under the selection, its top edge 8px below the selection bottom.",
			},
		},
	},
	play: async ({ canvasElement }) => {
		const column = slotIn(canvasElement, "library-document-column")
		const field = await openBlockWith(canvasElement, "Week 6 ")
		selectIn(field, "screenshots")
		const weekRoom = () =>
			field.getBoundingClientRect().top -
			column.getBoundingClientRect().top -
			16
		await waitFor(() => {
			column.scrollTop += weekRoom()
			expect(Math.abs(weekRoom())).toBeLessThan(1)
			expect(toolbarIn(canvasElement)).toHaveAttribute(
				"data-placement",
				"below",
			)
		})
		await waitFor(() => {
			const selection = selectionRect()
			const toolbar = toolbarIn(canvasElement)?.getBoundingClientRect()
			expect(toolbar?.top).toBeGreaterThan(selection.bottom)
			expect(
				Math.abs((toolbar?.top ?? 0) - selection.bottom - SELECTION_GAP),
			).toBeLessThan(1)
		})
	},
})

const pressIn = (field: HTMLElement, init: KeyboardEventInit) => {
	const event = new KeyboardEvent("keydown", {
		bubbles: true,
		cancelable: true,
		...init,
	})
	field.dispatchEvent(event)
	return event
}

type ShortcutCheck = {
	args: LibraryDocumentEditorProps
	canvasElement: HTMLElement
	keys: string
	marker: string
}

const formattedLaunchDate = (marker: string) =>
	SELECTION_DOCUMENT.body.replace(
		LAUNCH_DATE,
		`${marker}${LAUNCH_DATE}${marker}`,
	)

const expectShortcutFormats = async ({
	args,
	canvasElement,
	keys,
	marker,
}: ShortcutCheck) => {
	const { field, start } = await selectText(canvasElement, LAUNCH_DATE)
	await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))

	await keyboard(keys)
	const formatted = formattedLaunchDate(marker)
	await expect(args.onBodyChange).toHaveBeenCalledOnce()
	await expect(lastBodyOf(args)).toBe(formatted)
	await expect(field).toHaveFocus()
	await waitFor(() => expect(selectedTextIn(field)).toBe(LAUNCH_DATE))
	for (const action of Object.values(SELECTION_ACTIONS))
		await expect(action).not.toHaveBeenCalled()
	return { field, start: start + marker.length }
}

export const BoldShortcut = meta.story({
	...selectionStory(
		"Cmd+B on a range selected in a block. Check that the range turns bold in the markdown of the block and stays selected, that Ctrl+B takes the bold back with the browser default prevented, that the shortcut still works once Escape closed the toolbar, that `onBold` is never called, and that a collapsed selection or the title field leaves the key to the browser.",
	),
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { field, start } = await expectShortcutFormats({
			args,
			canvasElement,
			keys: `{${COMMAND}>}b{/${COMMAND}}`,
			marker: "**",
		})

		await expect(
			pressIn(field, { key: "b", ctrlKey: true }).defaultPrevented,
		).toBe(true)
		await expect(lastBodyOf(args)).toBe(SELECTION_DOCUMENT.body)
		await waitFor(() => expect(selectedTextIn(field)).toBe(LAUNCH_DATE))

		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await expect(field).toHaveFocus()
		await pressWithCommand("b")
		await expect(lastBodyOf(args)).toBe(formattedLaunchDate("**"))

		selectInField(field, start)
		await expect(
			pressIn(field, { key: "b", metaKey: true }).defaultPrevented,
		).toBe(false)
		const title = titleIn(canvasElement)
		title.focus()
		title.setSelectionRange(0, 6)
		await expect(
			pressIn(title, { key: "b", metaKey: true }).defaultPrevented,
		).toBe(false)
		await expect(lastBodyOf(args)).toBe(formattedLaunchDate("**"))
		await expect(args.onBodyChange).toHaveBeenCalledTimes(3)
		await expect(args.onBold).not.toHaveBeenCalled()
	},
})

const shortcutStory = (keys: string, marker: string, story: string) => ({
	...selectionStory(story),
	play: async ({ args, canvasElement }: PlayContext) => {
		if (!isInBrowserRunner()) return
		await expectShortcutFormats({ args, canvasElement, keys, marker })
	},
})

export const ItalicShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}i{/${COMMAND}}`,
		"*",
		"Cmd+I on a range selected in a block. Check that the range turns italic in the markdown of the block, that the new markdown is reported, that `onItalic` is never called, and that the focus and the selection stay on the same words.",
	),
})

export const StrikethroughShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}{Shift>}s{/Shift}{/${COMMAND}}`,
		"~~",
		"Cmd+Shift+S on a range selected in a block. Check that the range is struck through in the markdown of the block, that the new markdown is reported, that `onStrikethrough` is never called, and that the focus and the selection stay on the same words.",
	),
})

export const CodeShortcut = meta.story({
	...shortcutStory(
		`{${COMMAND}>}e{/${COMMAND}}`,
		"`",
		"Cmd+E on a range selected in a block. Check that the range turns into inline code in the markdown of the block, that the new markdown is reported, that `onCode` is never called, and that the focus and the selection stay on the same words.",
	),
})

export const LinkShortcut = meta.story({
	...selectionStory(
		"Cmd+K on a range selected in a block, the toolbar showing then closed by Escape. Check that the toolbar opens on its link field, focused, that Escape there returns to the bar, and that Enter links the selected range to the typed url in the markdown of the block, never calling `onLink`.",
	),
	play: async ({ args, canvas, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { field } = await selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		const linkField = () =>
			canvas.getByRole("textbox", { name: "Link address" })

		await pressWithCommand("k")
		await expect(document.activeElement).toBe(linkField())
		await keyboard("{Escape}")
		await expect(canvas.getByRole("toolbar", { name: "Format" })).toBeVisible()
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		field.focus()
		await expect(selectedTextIn(field)).toBe(LAUNCH_DATE)
		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await pressWithCommand("k")
		await expect(document.activeElement).toBe(linkField())

		await keyboard("https://kiroshi.app/brief{Enter}")
		const linked = SELECTION_DOCUMENT.body.replace(
			LAUNCH_DATE,
			`[${LAUNCH_DATE}](https://kiroshi.app/brief)`,
		)
		await expect(lastBodyOf(args)).toBe(linked)
		await expect(args.onLink).not.toHaveBeenCalled()
	},
})

export const EscapeClosesToolbar = meta.story({
	...selectionStory(
		"Escape with the toolbar showing over a range selected in a block. Check that the toolbar closes while the focus, the selection and the text stay, that selecting another range brings it back, and that a typed character still replaces the selection.",
	),
	play: async ({ args, canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { field } = await selectText(canvasElement, LAUNCH_DATE)
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))

		await keyboard("{Escape}")
		await expect(toolbarIn(canvasElement)).toBe(null)
		await expect(field).toHaveFocus()
		await expect(selectedTextIn(field)).toBe(LAUNCH_DATE)
		await expect(args.onBodyChange).not.toHaveBeenCalled()

		selectIn(field, "the copy")
		await waitFor(() => expect(toolbarIn(canvasElement)).not.toBe(null))
		await keyboard("x")
		await expect(lastBodyOf(args)).toBe(
			SELECTION_DOCUMENT.body.replace("the copy", "x"),
		)
	},
})

export const ToolbarAfterDrag = meta.story({
	...selectionStory(
		"A press in a paragraph block, a selection grown with the button held, then the release. Check that no toolbar shows while the button is down, that the toolbar lands above the finished selection on the release, that a right-button press and release leaves it in place, and that a new primary press hides it before its release.",
	),
	play: async ({ canvasElement }) => {
		const field = await openBlockWith(canvasElement, LAUNCH_DATE)
		const press = (type: string, button: number, buttons: number) =>
			field.dispatchEvent(
				new PointerEvent(type, { bubbles: true, button, buttons }),
			)
		press("pointerdown", 0, 1)
		selectIn(field, LAUNCH_DATE)
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).toBe(null)

		press("pointerup", 0, 0)
		await expectToolbarAbove(canvasElement)

		press("pointerdown", 2, 2)
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).not.toBe(null)
		press("pointerup", 2, 0)
		await expectToolbarAbove(canvasElement)

		press("pointerdown", 0, 1)
		await waitFor(() => expect(toolbarIn(canvasElement)).toBe(null))
		await expect(selectedTextIn(field)).toBe(LAUNCH_DATE)
		press("pointerup", 0, 0)
		await expectToolbarAbove(canvasElement)
	},
})

export const ToolbarAfterKeyboardSelection = meta.story({
	...selectionStory(
		"A selection grown with Shift and the right arrow from the start of the launch date. Check that no toolbar shows while Shift is held, and that the toolbar lands above the selection once Shift is released.",
	),
	play: async ({ canvasElement }) => {
		if (!isInBrowserRunner()) return
		const { field, start } = await selectText(canvasElement, LAUNCH_DATE)
		selectInField(field, start)

		await keyboard("{Shift>}{ArrowRight}{ArrowRight}{ArrowRight}")
		await expect(selectedTextIn(field)).toBe("the")
		await new Promise((resolve) => setTimeout(resolve, 50))
		await expect(toolbarIn(canvasElement)).toBe(null)

		await keyboard("{/Shift}")
		await expectToolbarAbove(canvasElement)
	},
})

const SCREENSHOTS = "Screenshots land on the 10th."

const lineFormatStory = (button: string, marker: string, type: string) => ({
	...selectionStory(
		`${button} pressed twice in the toolbar over words of a paragraph block. Check that the first press writes the ${marker.trim()} prefix in the markdown of that block and turns it into a ${type} block, keeping the same words selected, that the second takes the prefix back, and that no \`SelectionActions\` prop is called.`,
	),
	play: async ({ args, canvasElement }: PlayContext) => {
		const { field } = await selectText(canvasElement, "Screenshots")
		const press = async () =>
			fireEvent.click(
				await within(canvasElement).findByRole("button", { name: button }),
			)

		await press()
		await expect(lastBodyOf(args)).toBe(
			SELECTION_DOCUMENT.body.replace(SCREENSHOTS, `${marker}${SCREENSHOTS}`),
		)
		await expect(field.closest<HTMLElement>("[data-type]")?.dataset.type).toBe(
			type,
		)
		await waitFor(() => expect(selectedTextIn(field)).toBe("Screenshots"))

		await press()
		await expect(lastBodyOf(args)).toBe(SELECTION_DOCUMENT.body)
		for (const action of Object.values(SELECTION_ACTIONS))
			await expect(action).not.toHaveBeenCalled()
	},
})

const inlineFormatStory = (button: string, marker: string, tag: string) => ({
	...selectionStory(
		`${button} pressed in the toolbar over a word of a paragraph block. Check that it writes the ${marker} markers around the word in the markdown of that block, keeping the word selected, that the block left renders the word in its ${tag} element with the markers hidden, and that no \`SelectionActions\` prop is called.`,
	),
	play: async ({ args, canvasElement }: PlayContext) => {
		const { field } = await selectText(canvasElement, "Screenshots")
		fireEvent.click(
			await within(canvasElement).findByRole("button", { name: button }),
		)
		await expect(lastBodyOf(args)).toBe(
			SELECTION_DOCUMENT.body.replace(
				"Screenshots",
				`${marker}Screenshots${marker}`,
			),
		)
		await waitFor(() => expect(selectedTextIn(field)).toBe("Screenshots"))

		field.blur()
		await waitFor(() => expect(canvasElement.querySelector(FIELD)).toBe(null))
		const block = blockWith(canvasElement, "land on the 10th.")
		await expect(block.querySelector(tag)).toHaveTextContent("Screenshots")
		await expect(block.textContent).not.toContain(marker)
		for (const action of Object.values(SELECTION_ACTIONS))
			await expect(action).not.toHaveBeenCalled()
	},
})

export const FormatBold = meta.story({
	...inlineFormatStory("Bold", "**", "strong"),
})

export const FormatItalic = meta.story({
	...inlineFormatStory("Italic", "*", "em"),
})

export const FormatStrikethrough = meta.story({
	...inlineFormatStory("Strikethrough", "~~", "del"),
})

export const FormatInlineCode = meta.story({
	...inlineFormatStory("Code", "`", "code"),
})

export const FormatLink = meta.story({
	...selectionStory(
		"Link pressed in the toolbar over a word of a paragraph block, a url typed then confirmed. Check that it links the word in the markdown of that block, that the block left renders the word as a link to that url with the markers hidden, and that no `SelectionActions` prop is called.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }) => {
		const { field } = await selectText(canvasElement, "Screenshots")
		await userEvent.click(await canvas.findByRole("button", { name: "Link" }))
		await userEvent.type(
			canvas.getByRole("textbox", { name: "Link address" }),
			"https://kiroshi.app/brief{Enter}",
		)
		await expect(lastBodyOf(args)).toBe(
			SELECTION_DOCUMENT.body.replace(
				"Screenshots",
				"[Screenshots](https://kiroshi.app/brief)",
			),
		)

		field.focus()
		field.blur()
		await waitFor(() => expect(canvasElement.querySelector(FIELD)).toBe(null))
		const link = within(
			blockWith(canvasElement, "land on the 10th."),
		).getByRole("link")
		await expect(link).toHaveTextContent("Screenshots")
		await expect(link).toHaveAttribute("href", "https://kiroshi.app/brief")
		for (const action of Object.values(SELECTION_ACTIONS))
			await expect(action).not.toHaveBeenCalled()
	},
})

export const FormatHeading2 = meta.story({
	...lineFormatStory("Heading", "## ", "heading"),
})

export const FormatBulletList = meta.story({
	...lineFormatStory("List", "- ", "list"),
})

const PRESSED_DOCUMENT = [
	"**First note.**",
	"Third note.",
	"# Launch plan",
	"1. Draft the notes",
	"## Decisions",
	"- Ship it",
].join("\n\n")

const pressedButtonsIn = (canvasElement: HTMLElement) => {
	const toolbar = within(canvasElement).getByRole("toolbar", {
		name: "Format",
	})
	return within(toolbar)
		.getAllByRole("button")
		.filter((button) => button.getAttribute("aria-pressed") === "true")
		.map((button) => button.getAttribute("aria-label"))
}

const PRESSED_CASES: [name: string, text: string, pressed: string[]][] = [
	["a fully bold paragraph", "First note.", ["Bold"]],
	["a plain paragraph", "Third note.", []],
	["an H1 block", "Launch plan", []],
	["a numbered block", "Draft the notes", []],
	["an H2 block", "Decisions", ["Heading"]],
	["a bullet block", "Ship it", ["List"]],
]

export const ToolbarPressedState = meta.story({
	tags: ["test-only"],
	args: {
		...LAUNCH_REVIEW,
		body: PRESSED_DOCUMENT,
		template: undefined,
		...SELECTION_ACTIONS,
	},
	parameters: {
		docs: {
			description: {
				story:
					"The toolbar over selections its buttons would treat differently, one block at a time. Check that a button shows pressed exactly when pressing it would remove its format: Bold over a fully bold paragraph, nothing over a plain one, nothing on an H1 or a numbered block since Heading toggles H2 and List a bullet list, Heading on an H2 block and List on a bullet block.",
			},
		},
	},
	play: async ({ canvasElement, step }) => {
		for (const [name, text, pressed] of PRESSED_CASES)
			await step(name, async () => {
				await selectText(canvasElement, text)
				await waitFor(() =>
					expect(pressedButtonsIn(canvasElement)).toEqual(pressed),
				)
			})
	},
})

const STORED_IMAGES = [
	{ src: "images/sofa-green.jpg", alt: "Green velvet sofa", tint: "#5b7a55" },
	{ src: "images/sofa-grey.jpg", alt: "Grey linen sofa", tint: "#9a9a94" },
	{ src: "images/armchair-rust.jpg", alt: "Rust armchair", tint: "#a4553a" },
]

const STORED_GALLERY = [
	"The sofas we kept for the lobby.",
	[
		"```gallery",
		...STORED_IMAGES.map(({ src, alt }) => `- image: ${src}\n  alt: ${alt}`),
		"```",
	].join("\n"),
].join("\n\n")

const resolvedImageOf = (src: string) =>
	`data:image/svg+xml,${encodeURIComponent(
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 3"><rect width="4" height="3" fill="${STORED_IMAGES.find((image) => image.src === src)?.tint}"/></svg>`,
	)}`

const openGalleryIn = (canvasElement: HTMLElement) => {
	const galleryOf = () => {
		const gallery = blocksIn(canvasElement).find(
			(block) => block.dataset.type === "gallery",
		)
		if (!gallery) throw new Error("No gallery block")
		return gallery
	}
	galleryOf().querySelector<HTMLElement>("[tabindex]")?.focus()
	return waitFor(() => {
		const gallery = galleryOf()
		slotIn(gallery, "library-document-block-editing")
		return gallery
	})
}

export const GalleryImagesResolved = meta.story({
	args: {
		...LAUNCH_REVIEW,
		body: STORED_GALLERY,
		template: undefined,
		resolveImage: fn(async (src: string) => resolvedImageOf(src)),
	},
	parameters: {
		docs: {
			description: {
				story:
					"A Library document whose body holds a gallery of images stored as paths, `resolveImage` handed to the editor and passed down to the gallery. Check each path is resolved once by the read-only gallery and once by the editor it opens into, and each tile shows the address `resolveImage` returned.",
			},
		},
	},
	play: async ({ args, canvasElement }) => {
		const gallery = await openGalleryIn(canvasElement)
		for (const { src, alt } of STORED_IMAGES)
			await waitFor(() =>
				expect(
					within(gallery)
						.getByRole<HTMLImageElement>("img", { name: alt })
						.getAttribute("src"),
				).toBe(resolvedImageOf(src)),
			)
		await expect(args.resolveImage).toHaveBeenCalledTimes(
			STORED_IMAGES.length * 2,
		)
		for (const { src } of STORED_IMAGES)
			await expect(args.resolveImage).toHaveBeenCalledWith(src)
	},
})

const LIGHT = { theme: "light" } as const

const DARK = { theme: "dark" } as const

const DRAFT_PIN = "comment-draft"

const MARKET_PASSAGE = "the market in the old town"

const commentBarOf = (isCommentMode: boolean) => ({
	counts: COMMENT_COUNTS,
	isCommentMode,
	onCommentModeChange: fn(),
	list: (
		<LibraryCommentsList
			counts={COMMENT_COUNTS}
			onOpenThread={fn()}
			onTabChange={fn()}
			tab="open"
			threads={OPEN_THREADS}
		/>
	),
})

const commentedDocument = (isCommentMode = false) => ({
	...OFFSITE_DOCUMENT,
	template: undefined,
	threads: DOCUMENT_THREADS,
	commentParticipants: COMMENT_PARTICIPANTS,
	comments: commentBarOf(isCommentMode),
	onOpenThread: fn(),
	onStartComment: fn(),
})

const draftOn = (
	target: NonNullable<LibraryDocumentEditorProps["commentDraft"]>["target"],
) => ({
	target,
	author: STEVE,
	value: "",
	onValueChange: fn(),
	onSubmit: fn(),
})

const openThreadOf = (id: string) => ({
	id,
	reply: "",
	onReplyChange: fn(),
	onReply: fn(),
	onResolve: fn(),
	onReopen: fn(),
	onMore: fn(),
	onClose: fn(),
})

type CommentPlay = {
	args: LibraryDocumentEditorProps
	canvas: ReturnType<typeof within>
	canvasElement: HTMLElement
	userEvent: UserEventObject
}

const describedAs = (story: string) => ({
	docs: { description: { story } },
})

const boxOf = (element: Element) => element.getBoundingClientRect()

const blockOf = (canvasElement: HTMLElement, id: string) => {
	const block = canvasElement.querySelector<HTMLElement>(
		`[data-block-id="${id}"]`,
	)
	if (!block) throw new Error(`No block ${id}`)
	return block
}

const bodyOf = (canvasElement: HTMLElement, id: string) =>
	slotIn(blockOf(canvasElement, id), "library-document-block-body")

const pinIn = (canvasElement: HTMLElement, pin: string) => {
	const found = canvasElement.querySelector<HTMLElement>(
		`[data-comment-pin="${pin}"]`,
	)
	if (!found) throw new Error(`No pin ${pin}`)
	return found
}

const threadPinIn = (canvasElement: HTMLElement, id: string) =>
	pinIn(canvasElement, `comment:${id}`)

const shownPassageOf = (canvasElement: HTMLElement, text: string) => {
	const passage = slotsIn(canvasElement, "library-document-passage").find(
		(each) => each.textContent === text,
	)
	if (!passage) throw new Error(`No passage ${text}`)
	return passage
}

const lastLineOf = (element: Element) => {
	const line = [...element.getClientRects()].at(-1)
	if (!line) throw new Error("No line drawn")
	return line
}

const middleOf = ({ top, bottom }: DOMRect) => (top + bottom) / 2

const washOf = (host: Element, percent: number, token = "primary") => {
	const probe = document.createElement("span")
	probe.style.backgroundColor = `color-mix(in oklab, var(--${token}) ${percent}%, transparent)`
	host.append(probe)
	const colour = getComputedStyle(probe).backgroundColor
	probe.remove()
	return colour
}

const colourOf = (host: Element, token: string) => {
	const probe = document.createElement("span")
	probe.style.color = `var(--${token})`
	host.append(probe)
	const colour = getComputedStyle(probe).color
	probe.remove()
	return colour
}

const shadowOf = (host: Element, token: string) => {
	const probe = document.createElement("span")
	probe.style.boxShadow = `var(--${token})`
	host.append(probe)
	const shadow = getComputedStyle(probe).boxShadow
	probe.remove()
	return shadow
}

const expectCalledOnceWith = async (mock: unknown, ...sent: unknown[]) => {
	await expect(mock).toHaveBeenCalledOnce()
	await expect(mock).toHaveBeenCalledWith(...sent)
}

const expectClose = (actual: number, expected: number) =>
	expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1)

const expectTintAround = async (canvasElement: HTMLElement, id: string) => {
	const block = blockOf(canvasElement, id)
	const tint = boxOf(slotIn(block, "library-document-comment-tint"))
	const box = boxOf(block)
	await expectClose(tint.left, box.left - 8)
	await expectClose(tint.right, box.right + 8)
	await expectClose(tint.top, box.top - 8)
	await expectClose(tint.bottom, box.bottom + 8)
	return tint
}

const composerIn = (canvasElement: HTMLElement) =>
	slotIn(canvasElement, "library-comment-composer")

const expectDraftFieldFocused = (canvas: ReturnType<typeof within>) =>
	waitFor(() =>
		expect(
			canvas.getByRole("textbox", { name: "Comment, @ to mention" }),
		).toHaveFocus(),
	)

const expectPassagePin = async (pin: HTMLElement, passage: HTMLElement) => {
	const line = lastLineOf(passage)
	await expectClose(boxOf(pin).left, line.right)
	await expectClose(middleOf(boxOf(pin)), middleOf(line))
}

const doc1 = {
	args: commentedDocument(),
	parameters: describedAs(
		"Artboard Doc 1: a document carrying three open threads, two on a passage and one on a paragraph. Check one pin per thread, the paragraph pin 16px right of the column and centred on the first line of its block, the pin of an agent under its own ringless shadow and the pin of a person under the pin shadow, each passage pin starting on the end of its passage and centred on its last line, the passages washed at 8 percent over a 2px underline, and that pressing a pin raises `onOpenThread` with its thread.",
	),
	play: async ({ args, canvasElement, userEvent }: CommentPlay) => {
		await expect(slotsIn(canvasElement, "library-comment-pin")).toHaveLength(3)

		const column = slotIn(canvasElement, "library-document-column")
		const article = boxOf(column.querySelector("article") as HTMLElement)
		const marketPin = threadPinIn(canvasElement, MARKET_THREAD.id)
		await expectClose(boxOf(marketPin).left, article.right + 16)
		await expectClose(
			middleOf(boxOf(marketPin)),
			boxOf(blockOf(canvasElement, MARKET_BLOCK)).top + 12,
		)
		await expect(getComputedStyle(marketPin).boxShadow).toContain(
			shadowOf(marketPin, "comment-pin-agent-shadow"),
		)

		const passage = shownPassageOf(canvasElement, SESSION_PASSAGE)
		const sessionPin = threadPinIn(canvasElement, SESSION_THREAD.id)
		await expectPassagePin(sessionPin, passage)
		await expect(getComputedStyle(sessionPin).boxShadow).toContain(
			shadowOf(sessionPin, "comment-pin-shadow"),
		)
		await expect(passage).toHaveAttribute("data-state", "rest")
		const look = getComputedStyle(passage)
		await expect(look.backgroundColor).toBe(washOf(passage, 8))
		await expect(look.borderBottomWidth).toBe("2px")
		await expect(look.borderBottomColor).toBe(washOf(passage, 50))

		await userEvent.click(marketPin)
		await expectCalledOnceWith(args.onOpenThread, MARKET_THREAD.id)
		marketPin.blur()
		await expect(args.onStartComment).not.toHaveBeenCalled()
	},
}

export const Doc1PinsAtRest = meta.story({ ...doc1, globals: LIGHT })

export const Doc1PinsAtRestDark = meta.story({ ...doc1, globals: DARK })

const doc2 = {
	args: commentedDocument(true),
	parameters: describedAs(
		"Artboard Doc 2: comment mode on, the pointer over a paragraph. Check the hint centred on the card 24px above its bottom, that Escape raises `onCommentModeChange` with false, and that the block under the pointer wears the tint 8px outside itself while the 20px pin cursor sets its tip on the pointer, its bottom left corner at 2px, under a 2px white ring and its own shadow.",
	),
	play: async ({ args, canvasElement, userEvent }: CommentPlay) => {
		const card = boxOf(slotIn(canvasElement, "library-document-editor"))
		const hint = boxOf(slotIn(canvasElement, "library-comment-mode-hint"))
		await expectClose(
			(hint.left + hint.right) / 2,
			(card.left + card.right) / 2,
		)
		await expectClose(hint.bottom, card.bottom - 24)

		const toggle = slotIn(canvasElement, "library-comment-toggle")
		toggle.focus()
		await userEvent.keyboard("{Escape}")
		await expectCalledOnceWith(args.comments?.onCommentModeChange, false)
		toggle.blur()

		const body = bodyOf(canvasElement, MARKET_BLOCK)
		const at = {
			clientX: boxOf(body).left + 240,
			clientY: boxOf(body).top + 12,
		}
		await fireEvent.pointerMove(body, at)
		await expectTintAround(canvasElement, MARKET_BLOCK)
		const cursor = slotIn(canvasElement, "library-document-comment-cursor")
		await expect(cursor).toBeVisible()
		await expectClose(boxOf(cursor).left, at.clientX)
		await expectClose(boxOf(cursor).bottom, at.clientY)
		await expect(boxOf(cursor).width).toBe(20)
		await expect(boxOf(cursor).height).toBe(20)
		const look = getComputedStyle(cursor)
		await expect(look.borderBottomLeftRadius).toBe("2px")
		await expect(look.boxShadow).toContain("rgb(255, 255, 255) 0px 0px 0px 2px")
		await expect(look.boxShadow).toContain(
			shadowOf(cursor, "comment-cursor-shadow"),
		)
		await expect(getComputedStyle(body).cursor).toBe("none")
	},
}

export const Doc2CommentMode = meta.story({ ...doc2, globals: LIGHT })

export const Doc2CommentModeDark = meta.story({ ...doc2, globals: DARK })

const doc3 = {
	args: {
		...commentedDocument(true),
		threads: [SESSION_THREAD],
		commentDraft: draftOn({ blockId: MARKET_BLOCK, origin: "pointer" }),
	},
	parameters: describedAs(
		"Artboard Doc 3: a paragraph clicked in comment mode, the pointer still over it. Check one tint around the paragraph, never a second one from the pointer, the selected draft pin at the paragraph pin position, the 320px composer hanging 8px under the pin with their right edges aligned, and its field focused.",
	),
	play: async ({ canvas, canvasElement }: CommentPlay) => {
		const body = bodyOf(canvasElement, MARKET_BLOCK)
		await fireEvent.pointerMove(body, {
			clientX: boxOf(body).left + 240,
			clientY: boxOf(body).top + 12,
		})
		await expect(
			slotIn(canvasElement, "library-document-comment-cursor"),
		).toBeVisible()
		await expectTintAround(canvasElement, MARKET_BLOCK)
		await expect(
			slotsIn(canvasElement, "library-document-comment-tint"),
		).toHaveLength(1)
		const pin = pinIn(canvasElement, DRAFT_PIN)
		await expect(pin).toHaveAttribute("data-state", "selected")
		const composer = boxOf(composerIn(canvasElement))
		await expect(composer.width).toBe(320)
		await expectClose(composer.right, boxOf(pin).right)
		await expectClose(composer.top, boxOf(pin).bottom + 8)
		await expectDraftFieldFocused(canvas)
	},
}

export const Doc3BlockDraft = meta.story({ ...doc3, globals: LIGHT })

export const Doc3BlockDraftDark = meta.story({ ...doc3, globals: DARK })

const doc4 = {
	args: {
		...commentedDocument(true),
		commentDraft: draftOn({
			blockId: SESSION_BLOCK,
			passage: passageIn(SESSION_PARAGRAPH, DINNER_PASSAGE),
			origin: "pointer",
		}),
	},
	parameters: describedAs(
		"Artboard Doc 4: a passage selected in comment mode. Check the passage in its selected wash over a solid underline, the selected draft pin on the end of the passage, the 320px composer 8px right of the pin with its top on the pin top, and its field focused.",
	),
	play: async ({ canvas, canvasElement }: CommentPlay) => {
		const passage = shownPassageOf(canvasElement, DINNER_PASSAGE)
		await expect(passage).toHaveAttribute("data-state", "selected")
		await expect(getComputedStyle(passage).borderBottomColor).toBe(
			getComputedStyle(pinIn(canvasElement, DRAFT_PIN)).backgroundColor,
		)
		const pin = pinIn(canvasElement, DRAFT_PIN)
		await expectPassagePin(pin, passage)
		await waitFor(async () => {
			const composer = boxOf(composerIn(canvasElement))
			await expect(composer.width).toBe(320)
			await expectClose(composer.left, boxOf(pin).right + 8)
			await expectClose(composer.top, boxOf(pin).top)
		})
		await expectDraftFieldFocused(canvas)
	},
}

export const Doc4PassageDraft = meta.story({ ...doc4, globals: LIGHT })

export const Doc4PassageDraftDark = meta.story({ ...doc4, globals: DARK })

const MAC_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)"

const WINDOWS_AGENT =
	"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko)"

const onPlatform = (agent: string) => () => {
	const spy = spyOn(navigator, "userAgent", "get").mockReturnValue(agent)
	return () => spy.mockRestore()
}

const doc5 = {
	beforeEach: onPlatform(MAC_AGENT),
	args: {
		...commentedDocument(),
		threads: [SESSION_THREAD],
		commentDraft: draftOn({ blockId: MARKET_BLOCK, origin: "shortcut" }),
	},
	parameters: describedAs(
		"Artboard Doc 5: the comment shortcut pressed with the caret in a paragraph, out of comment mode, on macOS. Check the tint around the paragraph, the composer 4px under the tint with their right edges aligned, the keycap at the right of its first line reading the Mac symbols, and its field focused.",
	),
	play: async ({ canvas, canvasElement }: CommentPlay) => {
		const tint = await expectTintAround(canvasElement, MARKET_BLOCK)
		const form = composerIn(canvasElement)
		const composer = boxOf(form)
		await expect(composer.width).toBe(320)
		await expectClose(composer.right, tint.right)
		await expectClose(composer.top, tint.bottom + 4)
		const keycap = slotIn(form, "library-comment-composer-shortcut")
		await expect(keycap).toHaveTextContent("⌘⌥M")
		await expectClose(boxOf(keycap).right, composer.right - 12)
		await expect(
			canvasElement.querySelector('[data-slot="library-comment-mode-hint"]'),
		).toBe(null)
		await expectDraftFieldFocused(canvas)
	},
}

export const Doc5ShortcutDraft = meta.story({ ...doc5, globals: LIGHT })

export const Doc5ShortcutDraftDark = meta.story({ ...doc5, globals: DARK })

export const ShortcutKeycapOffMac = meta.story({
	tags: ["test-only"],
	beforeEach: onPlatform(WINDOWS_AGENT),
	args: doc5.args,
	play: async ({ canvasElement }) => {
		await expect(
			slotIn(canvasElement, "library-comment-composer-shortcut"),
		).toHaveTextContent("Ctrl+Alt+M")
	},
})

const threadOpen = (selectedWash: number) => ({
	args: {
		...commentedDocument(),
		openThread: openThreadOf(SESSION_THREAD.id),
	},
	play: async ({ args, canvas, canvasElement, userEvent }: CommentPlay) => {
		const passage = shownPassageOf(canvasElement, SESSION_PASSAGE)
		await expect(passage).toHaveAttribute("data-state", "selected")
		await expect(getComputedStyle(passage).backgroundColor).toBe(
			washOf(passage, selectedWash),
		)
		const pin = threadPinIn(canvasElement, SESSION_THREAD.id)
		await expect(pin).toHaveAttribute("data-state", "selected")
		await expectPassagePin(pin, passage)
		const thread = canvas.getByRole("region", {
			name: `On “${SESSION_PASSAGE}”`,
		})
		await waitFor(async () => {
			await expect(boxOf(thread).width).toBe(360)
			await expectClose(boxOf(thread).left, boxOf(pin).right + 8)
			await expectClose(boxOf(thread).top, boxOf(pin).top)
		})
		await expect(within(thread).getAllByRole("listitem")).toHaveLength(3)

		await userEvent.click(within(thread).getByRole("button", { name: "Close" }))
		await expect(args.openThread?.onClose).toHaveBeenCalledOnce()
	},
})

export const Doc6ThreadOpen = meta.story({
	...threadOpen(16),
	globals: LIGHT,
	parameters: describedAs(
		"Artboard Doc 6: the thread of a passage open. Check its pin and its passage selected, the passage washed at 16 percent, the 360px thread 8px right of the pin with its top on the pin top, every comment of the thread listed, and Close raising `onClose`.",
	),
})

export const Edge3ThreadOpenDark = meta.story({
	...threadOpen(20),
	globals: DARK,
	parameters: describedAs(
		"Artboard Edge 3, the dark twin of Doc 6. Check the same placement, with the selected passage washed at 20 percent.",
	),
})

const GONE_LINE = "On text that’s no longer in the document"

const edge1 = {
	args: {
		...commentedDocument(),
		body: OFFSITE_DOCUMENT.body.replace(`, ${SESSION_PASSAGE}`, "."),
		openThread: openThreadOf(SESSION_THREAD.id),
	},
	parameters: describedAs(
		"Artboard Edge 1: the open thread sat on a passage since removed from the document. Check that the body draws no pin and no passage for it, that the two other threads keep their pins, and that the thread sits 48px under the top of the card, 4px under the comments counter, its right edge 202px in from the card, under the line naming the lost text.",
	),
	play: async ({ canvas, canvasElement }: CommentPlay) => {
		await expect(slotsIn(canvasElement, "library-comment-pin")).toHaveLength(2)
		await expect(
			canvasElement.querySelector(
				`[data-comment-pin="comment:${SESSION_THREAD.id}"]`,
			),
		).toBe(null)
		await expect(
			slotsIn(canvasElement, "library-document-passage"),
		).toHaveLength(1)

		const card = boxOf(slotIn(canvasElement, "library-document-editor"))
		const thread = boxOf(canvas.getByRole("region", { name: GONE_LINE }))
		await expectClose(thread.top, card.top + 48)
		await expectClose(
			thread.top,
			boxOf(slotIn(canvasElement, "library-comment-counter")).bottom + 4,
		)
		await expectClose(card.right - thread.right, 202)
		await expect(thread.width).toBe(360)
	},
}

export const Edge1AnchorGone = meta.story({ ...edge1, globals: LIGHT })

export const Edge1AnchorGoneDark = meta.story({ ...edge1, globals: DARK })

export const CommentModeClickStartsBlockComment = meta.story({
	tags: ["test-only"],
	args: commentedDocument(true),
	play: async ({ args, canvasElement, userEvent }) => {
		await userEvent.click(bodyOf(canvasElement, MARKET_BLOCK))
		await expectCalledOnceWith(args.onStartComment, {
			blockId: MARKET_BLOCK,
			origin: "pointer",
		})
		await expect(canvasElement.querySelector(FIELD)).toBe(null)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

export const CommentModeSelectionStartsPassageComment = meta.story({
	tags: ["test-only"],
	args: commentedDocument(true),
	play: async ({ args, canvasElement }) => {
		const body = bodyOf(canvasElement, MARKET_BLOCK)
		selectIn(body, MARKET_PASSAGE)
		await fireEvent.click(body)
		await expectCalledOnceWith(args.onStartComment, {
			blockId: MARKET_BLOCK,
			passage: passageIn(MARKET_PARAGRAPH, MARKET_PASSAGE),
			origin: "pointer",
		})

		if (!isInBrowserRunner()) return
		document.getSelection()?.removeAllRanges()
		await (await realPointer()).dragAndDrop(body, body, {
			sourcePosition: { x: 40, y: 12 },
			targetPosition: { x: 220, y: 12 },
		})
		const dragged = (args.onStartComment as ReturnType<typeof fn>).mock
			.lastCall?.[0]
		await expect(dragged.blockId).toBe(MARKET_BLOCK)
		await expect(dragged.origin).toBe("pointer")
		await expect(MARKET_PARAGRAPH.slice(dragged.passage.start)).toMatch(
			new RegExp(`^${dragged.passage.text}`),
		)
		await expect(dragged.passage.text.length).toBeGreaterThan(5)
		await expect(canvasElement.querySelector(FIELD)).toBe(null)
	},
})

const FORMATTED_PARAGRAPH =
	"The **boat** leaves from [the dock](https://example.com/dock) at 17:30."

const FORMATTED_BLOCK = "format"

export const CommentModeSelectionAcrossFormatting = meta.story({
	tags: ["test-only"],
	args: {
		...commentedDocument(true),
		threads: [],
		body: `${FORMATTED_PARAGRAPH} ^${FORMATTED_BLOCK}\n\n> [!NOTE]\n> Bring a coat.`,
	},
	play: async ({ args, canvasElement }) => {
		const body = bodyOf(canvasElement, FORMATTED_BLOCK)
		selectIn(body, "boat leaves from the dock")
		await fireEvent.click(body)
		const from = FORMATTED_PARAGRAPH.indexOf("boat")
		const to = FORMATTED_PARAGRAPH.indexOf("dock]") + "dock".length
		await expectCalledOnceWith(args.onStartComment, {
			blockId: FORMATTED_BLOCK,
			passage: {
				start: from,
				end: to,
				text: FORMATTED_PARAGRAPH.slice(from, to),
			},
			origin: "pointer",
		})

		const callout = slotIn(
			blockWith(canvasElement, "Bring a coat."),
			"library-document-block-body",
		)
		const coat = within(callout).getByText("Bring a coat.").firstChild as Text
		document.getSelection()?.setBaseAndExtent(coat, 0, coat, 5)
		await fireEvent.click(callout)
		await expect(args.onStartComment).toHaveBeenCalledOnce()

		const boat = within(body).getByText("boat").firstChild as Text
		document.getSelection()?.setBaseAndExtent(boat, 0, coat, 5)
		await fireEvent.click(callout)
		await expect(args.onStartComment).toHaveBeenCalledOnce()
	},
})

export const ShortcutStartsComment = meta.story({
	tags: ["test-only"],
	args: commentedDocument(),
	play: async ({ args, canvasElement, userEvent }) => {
		const shortcut = `{${COMMAND}>}{Alt>}m{/Alt}{/${COMMAND}}`
		await caretAfter(canvasElement, MARKET_PASSAGE)
		await userEvent.keyboard(shortcut)
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			blockId: MARKET_BLOCK,
			origin: "shortcut",
		})

		await selectText(canvasElement, MARKET_PASSAGE)
		await userEvent.keyboard(shortcut)
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			blockId: MARKET_BLOCK,
			passage: passageIn(MARKET_PARAGRAPH, MARKET_PASSAGE),
			origin: "shortcut",
		})
		await expect(args.onStartComment).toHaveBeenCalledTimes(2)
		await expect(args.onBodyChange).not.toHaveBeenCalled()
	},
})

const letterTyped = (isCommentMode: boolean) => ({
	tags: ["test-only"],
	args: commentedDocument(isCommentMode),
	play: async ({ args, canvasElement }: CommentPlay) => {
		if (!isInBrowserRunner()) return
		await caretAfter(canvasElement, "before the train.")
		await keyboard("c")
		await expect(lastBodyOf(args)).toContain(`${MARKET_PARAGRAPH}c`)
		await expect(args.comments?.onCommentModeChange).not.toHaveBeenCalled()
		await expect(args.onStartComment).not.toHaveBeenCalled()
	},
})

export const LetterTypedOutOfCommentMode = meta.story(letterTyped(false))

export const LetterTypedInCommentMode = meta.story(letterTyped(true))

const sourcePassageOf = (source: string, first: string, last: string) => {
	const start = source.indexOf(first)
	const end = source.indexOf(last, start) + last.length
	return { start, end, text: source.slice(start, end) }
}

const piecesIn = (canvasElement: HTMLElement, id: string) =>
	slotsIn(blockOf(canvasElement, id), "library-document-passage")

const wordsOf = (pieces: HTMLElement[]) =>
	pieces.map((piece) => piece.textContent).join("")

const lastOf = (pieces: HTMLElement[]) => {
	const last = pieces.at(-1)
	if (!last) throw new Error("No passage drawn")
	return last
}

const cardFrameOf = (card: HTMLElement) =>
	card.closest<HTMLElement>(
		'[data-slot="library-document-comment-card"]',
	) as HTMLElement

const FORMATTED_QUOTE = "boat leaves from the dock"

const FORMATTED_THREAD = {
	...BUDGET_THREAD,
	id: "thread-formatted",
	anchor: {
		blockId: FORMATTED_BLOCK,
		passage: sourcePassageOf(FORMATTED_PARAGRAPH, "boat", "the dock"),
	},
}

const passageAcrossFormatting = {
	args: {
		...commentedDocument(),
		body: `${FORMATTED_PARAGRAPH} ^${FORMATTED_BLOCK}`,
		threads: [FORMATTED_THREAD],
		openThread: openThreadOf(FORMATTED_THREAD.id),
	},
	parameters: describedAs(
		"A commented passage that starts in bold text and ends in a link, its thread open. Check one highlight per run of text with the bold and the link kept, one pin on the end of the last one, a press on that pin opening the thread without following the link, and the thread line quoting the words as the document shows them, with no markdown character.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }: CommentPlay) => {
		const pieces = piecesIn(canvasElement, FORMATTED_BLOCK)
		await expect(wordsOf(pieces)).toBe(FORMATTED_QUOTE)
		await expect(pieces[0].closest("strong")).not.toBe(null)
		await expect(lastOf(pieces).closest("a")).not.toBe(null)
		await expect(slotsIn(canvasElement, "library-comment-pin")).toHaveLength(1)
		const pin = threadPinIn(canvasElement, FORMATTED_THREAD.id)
		await expectPassagePin(pin, lastOf(pieces))

		const line = `On “${FORMATTED_QUOTE}”`
		const thread = canvas.getByRole("region", { name: line })
		await expect(slotIn(thread, "library-comment-anchor")).toHaveTextContent(
			line,
		)

		const followed = fn((event: Event) => event.defaultPrevented)
		canvasElement.addEventListener("click", followed, { once: true })
		await userEvent.click(pin)
		await expectCalledOnceWith(args.onOpenThread, FORMATTED_THREAD.id)
		await expect(followed).toHaveReturnedWith(true)
	},
}

export const PassageAcrossFormatting = meta.story({
	...passageAcrossFormatting,
	globals: LIGHT,
})

export const PassageAcrossFormattingDark = meta.story({
	...passageAcrossFormatting,
	globals: DARK,
})

const overlappingPassages = {
	args: {
		...commentedDocument(),
		threads: [SESSION_THREAD, OVERLAP_THREAD],
	},
	parameters: describedAs(
		"Two commented passages that share words. Check a highlight for each, the shared words washed twice, and a pin on the end of each passage.",
	),
	play: async ({ canvasElement }: CommentPlay) => {
		const pieces = piecesIn(canvasElement, SESSION_BLOCK)
		const shared = "stops at 16:30."
		await expect(pieces.map((piece) => piece.textContent)).toEqual([
			SESSION_PASSAGE.slice(0, -shared.length),
			shared,
			shared,
			OVERLAP_PASSAGE.slice(shared.length),
		])
		await expect(pieces[1].contains(pieces[2])).toBe(true)

		await expect(slotsIn(canvasElement, "library-comment-pin")).toHaveLength(2)
		await expectPassagePin(
			threadPinIn(canvasElement, SESSION_THREAD.id),
			pieces[1],
		)
		await expectPassagePin(
			threadPinIn(canvasElement, OVERLAP_THREAD.id),
			lastOf(pieces),
		)
	},
}

export const OverlappingPassages = meta.story({
	...overlappingPassages,
	globals: LIGHT,
})

export const OverlappingPassagesDark = meta.story({
	...overlappingPassages,
	globals: DARK,
})

const resolved2 = {
	args: {
		...commentedDocument(),
		threads: [RESOLVED_SESSION_THREAD, MARKET_THREAD, BUDGET_THREAD],
		openThread: openThreadOf(RESOLVED_SESSION_THREAD.id),
	},
	parameters: describedAs(
		"Artboard Resolved 2: a resolved thread drawn in place, open. Check its passage under the neutral wash and a 2px dashed underline, its pin in the resolved state where an open passage pin sits, under the resolved pin shadow, the 360px thread in its resolved state 8px right of the pin with its top on the pin top, and Reopen raising `onReopen`.",
	),
	play: async ({ args, canvas, canvasElement, userEvent }: CommentPlay) => {
		const passage = shownPassageOf(canvasElement, SESSION_PASSAGE)
		await expect(passage).toHaveAttribute("data-state", "resolved")
		const look = getComputedStyle(passage)
		await expect(look.backgroundColor).toBe(washOf(passage, 5, "foreground"))
		await expect(look.borderBottomWidth).toBe("2px")
		await expect(look.borderBottomStyle).toBe("dashed")
		await expect(look.borderBottomColor).toBe(
			colourOf(passage, "comment-resolved-rule"),
		)

		const pin = threadPinIn(canvasElement, RESOLVED_SESSION_THREAD.id)
		await expect(pin).toHaveAttribute("data-state", "resolved")
		await expect(pin).toHaveAttribute("aria-expanded", "true")
		await expectPassagePin(pin, passage)
		await expect(getComputedStyle(pin).boxShadow).toContain(
			shadowOf(pin, "comment-pin-resolved-shadow"),
		)
		await expect(boxOf(slotIn(pin, "library-comment-pin-check")).width).toBe(24)

		const thread = canvas.getByRole("region", {
			name: `On “${SESSION_PASSAGE}”`,
		})
		await expect(thread).toHaveAttribute("data-resolved", "true")
		await waitFor(async () => {
			await expect(boxOf(thread).width).toBe(360)
			await expectClose(boxOf(thread).left, boxOf(pin).right + 8)
			await expectClose(boxOf(thread).top, boxOf(pin).top)
		})
		await expect(
			slotIn(thread, "library-comment-resolution"),
		).toHaveTextContent("Resolved by Steve")

		await userEvent.click(
			within(thread).getByRole("button", { name: "Reopen" }),
		)
		await expect(args.openThread?.onReopen).toHaveBeenCalledOnce()
	},
}

export const Resolved2ThreadInPlace = meta.story({
	...resolved2,
	globals: LIGHT,
})

export const Resolved2ThreadInPlaceDark = meta.story({
	...resolved2,
	globals: DARK,
})

export const BlockThreadOpensUnderPin = meta.story({
	tags: ["test-only"],
	args: {
		...commentedDocument(),
		openThread: openThreadOf(MARKET_THREAD.id),
	},
	play: async ({ canvas, canvasElement }) => {
		const pin = threadPinIn(canvasElement, MARKET_THREAD.id)
		await expect(pin).toHaveAttribute("data-state", "selected")
		const thread = boxOf(
			canvas.getByRole("region", { name: "On this paragraph" }),
		)
		await expect(thread.width).toBe(360)
		await expectClose(thread.right, boxOf(pin).right)
		await expectClose(thread.top, boxOf(pin).bottom + 8)
	},
})

export const PassageKeptWhileBlockFocused = meta.story({
	tags: ["test-only"],
	args: commentedDocument(),
	play: async ({ args, canvasElement, userEvent }) => {
		const field = await openBlockWith(canvasElement, SESSION_PASSAGE)
		const passage = shownPassageOf(field, SESSION_PASSAGE)
		await expect(passage).toHaveAttribute("data-state", "rest")
		const pin = threadPinIn(canvasElement, SESSION_THREAD.id)
		await expect(pin).toBeVisible()
		await expect(field.contains(pin)).toBe(false)
		await expectPassagePin(pin, passage)

		await userEvent.click(pin)
		await expectCalledOnceWith(args.onOpenThread, SESSION_THREAD.id)
		await expect(field).toHaveFocus()

		if (!isInBrowserRunner()) return
		const end =
			SESSION_PARAGRAPH.indexOf(SESSION_PASSAGE) + SESSION_PASSAGE.length
		selectInField(field, end - 1)
		await keyboard("{ArrowRight}")
		await expect(fieldSelectionOf(field)?.start).toBe(end)
		await keyboard("{ArrowRight}")
		await expect(fieldSelectionOf(field)?.start).toBe(end + 1)
		await keyboard("x")
		await expect(lastBodyOf(args)).toContain(`${SESSION_PASSAGE} xThe boat`)
	},
})

const START_PASSAGE = "We open with the roadmap review at 14:00"

const START_THREAD = {
	...BUDGET_THREAD,
	id: "thread-start",
	anchor: {
		blockId: SESSION_BLOCK,
		passage: passageIn(SESSION_PARAGRAPH, START_PASSAGE),
	},
}

export const PassageCardKeptInsideEditor = meta.story({
	tags: ["test-only"],
	args: {
		...commentedDocument(),
		threads: [START_THREAD],
		openThread: openThreadOf(START_THREAD.id),
	},
	render: (args) => (
		<EditorFrame isNarrow>
			<LibraryDocumentEditor {...args} />
		</EditorFrame>
	),
	play: async ({ canvas, canvasElement }) => {
		const pin = threadPinIn(canvasElement, START_THREAD.id)
		const thread = canvas.getByRole("region", {
			name: `On “${START_PASSAGE}”`,
		})
		const editor = boxOf(slotIn(canvasElement, "library-document-editor"))
		await waitFor(() =>
			expect(getComputedStyle(cardFrameOf(thread)).opacity).toBe("1"),
		)
		await expect(boxOf(pin).right + 8 + 360).toBeGreaterThan(editor.right)
		await expect(boxOf(thread).width).toBe(360)
		await expect(boxOf(thread).right).toBeLessThanOrEqual(editor.right)
		await expect(boxOf(thread).left).toBeGreaterThanOrEqual(editor.left)
		await expectClose(boxOf(thread).right, boxOf(pin).right)
		await expectClose(boxOf(thread).top, boxOf(pin).bottom + 8)
	},
})

const MENTION_PARAGRAPH =
	"Ask <@atlas> for the **notes** from [the dock](https://example.com/dock)."

const MENTION_BLOCK = "mentio"

const mentionDocument = {
	...commentedDocument(true),
	threads: [],
	body: `${MENTION_PARAGRAPH} ^${MENTION_BLOCK}`,
}

const withRoster = [
	(Story: ComponentType) => (
		<RosterProvider bots={[ATLAS]}>
			<Story />
		</RosterProvider>
	),
]

const textNodeWith = (root: Element, text: string) => {
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
	for (let node = walker.nextNode(); node; node = walker.nextNode())
		if (node.textContent?.includes(text)) return node
	throw new Error(`No text ${text}`)
}

export const CommentModeSelectionOverMention = meta.story({
	tags: ["test-only"],
	decorators: withRoster,
	args: mentionDocument,
	play: async ({ args, canvasElement }) => {
		const body = bodyOf(canvasElement, MENTION_BLOCK)
		const name = slotIn(body, "bot-mention-name")
		await expect(name).toHaveTextContent("Atlas")
		const ask = textNodeWith(body, "Ask")

		document
			.getSelection()
			?.setBaseAndExtent(ask, 0, textNodeWith(body, " for the"), 4)
		await fireEvent.click(body)
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			blockId: MENTION_BLOCK,
			passage: sourcePassageOf(MENTION_PARAGRAPH, "Ask", "for"),
			origin: "pointer",
		})

		document
			.getSelection()
			?.setBaseAndExtent(ask, 0, name.firstChild as Text, 2)
		await fireEvent.click(body)
		await expect(args.onStartComment).toHaveBeenLastCalledWith({
			blockId: MENTION_BLOCK,
			passage: sourcePassageOf(MENTION_PARAGRAPH, "Ask", "<@atlas>"),
			origin: "pointer",
		})
		await expect(args.onStartComment).toHaveBeenCalledTimes(2)
	},
})

export const DraftQuoteAcrossMention = meta.story({
	tags: ["test-only"],
	decorators: withRoster,
	args: {
		...mentionDocument,
		commentDraft: draftOn({
			blockId: MENTION_BLOCK,
			passage: sourcePassageOf(MENTION_PARAGRAPH, "Ask", "the dock"),
			origin: "pointer",
		}),
	},
	play: async ({ canvas, canvasElement }) => {
		const composer = composerIn(canvasElement)
		await expect(composer).toHaveTextContent(
			"On “Ask Atlas for the notes from the dock”",
		)
		await waitFor(() =>
			expect(getComputedStyle(cardFrameOf(composer)).opacity).toBe("1"),
		)
		const pieces = piecesIn(canvasElement, MENTION_BLOCK)
		await expect(wordsOf(pieces)).toBe("Ask  for the notes from the dock")
		await expectPassagePin(pinIn(canvasElement, DRAFT_PIN), lastOf(pieces))
		await expectDraftFieldFocused(canvas)
	},
})

const CARET_IN_PASSAGE = {
	id: "lea",
	name: "Léa Martin",
	caret: OFFSITE_DOCUMENT.body.indexOf("session stops"),
}

export const CaretInsideCommentedPassage = meta.story({
	tags: ["test-only"],
	args: { ...commentedDocument(), people: [CARET_IN_PASSAGE] },
	play: async ({ canvasElement }) => {
		const block = blockOf(canvasElement, SESSION_BLOCK)
		const caret = await within(block).findByRole("img", { name: "Léa Martin" })
		const pieces = piecesIn(canvasElement, SESSION_BLOCK)
		await expect(pieces.map((piece) => piece.textContent)).toEqual([
			"so the second ",
			"session stops at 16:30.",
		])
		await expect(
			pieces[0].compareDocumentPosition(caret) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(
			caret.compareDocumentPosition(pieces[1]) &
				Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expectClose(boxOf(caret).left, boxOf(pieces[1]).left)
		await expectPassagePin(
			threadPinIn(canvasElement, SESSION_THREAD.id),
			pieces[1],
		)
	},
})
